// Web Analytics (RUM) — Core Web Vitals. Módulo isolado de cloudflare.functions.ts
// porque RUM é indexado por CONTA + siteTag (não por zona como todo o resto do
// módulo Cloudflare), via datasets diferentes (rumPageloadEventsAdaptiveGroups,
// rumWebVitalsEventsAdaptiveGroups, rumPerformanceEventsAdaptiveGroups).
//
// Nomes de campo confirmados capturando as queries GraphQL reais que o painel
// nativo da Cloudflare (dash.cloudflare.com) dispara pra essa mesma tela — não
// existe discriminador de tipo nem campo "value" genérico: cada vital tem seus
// próprios campos com prefixo completo (largestContentfulPaint*/
// interactionToNextPaint*/cumulativeLayoutShift*) e os buckets good/needs
// improvement/poor já vêm PRÉ-CALCULADOS pela API (sum.lcpGood/lcpPoor/...),
// não precisamos aplicar os limiares do Google nós mesmos.
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { requirePermission } from "@/lib/authz";
import {
  buildAdaptiveFilterClause,
  filtersInputSchema,
  RUM_VISITS_FILTER_FIELDS,
  type AnalyticsFilterCondition,
} from "@/lib/cloudflare.analytics-filters";

function makeSupabase() {
  const url = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient(url, serviceKey || anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const CF_API = "https://api.cloudflare.com/client/v4";
const GQL_URL = `${CF_API}/graphql`;

// ─── Nomes de campo (confirmados via captura das queries reais do dash Cloudflare) ──
export type WebVitalKey = "lcp" | "inp" | "cls";

// Prefixo completo do campo pra cada vital (Path/Element/P50../P75.. usam esse prefixo).
const VITAL_PREFIX: Record<WebVitalKey, string> = {
  lcp: "largestContentfulPaint",
  inp: "interactionToNextPaint",
  cls: "cumulativeLayoutShift",
};

const VALID_DIMENSIONS = new Set(["url", "browser", "os", "country", "element"]);

// ─── Page load time (dataset rumPerformanceEventsAdaptiveGroups) ──────────────
// Nomes confirmados via captura de GetRumPerfAnalyticsTopNs (dash Cloudflare):
// nem todo campo segue o padrão "*Time" (firstPaint/firstContentfulPaint não têm
// o sufixo "Time"). "Average (Mean)" existe na UI nativa mas não foi confirmado
// (não vimos o campo `avg.*` correspondente capturado) — só implementamos P50/75/90/99.
export type PerfMetricKey =
  | "pageLoad"
  | "dns"
  | "connection"
  | "request"
  | "response"
  | "pageRender"
  | "loadEvent"
  | "firstPaint"
  | "firstContentfulPaint";

export type PerfPercentile = "p50" | "p75" | "p90" | "p99";

const PERF_METRIC_FIELD: Record<PerfMetricKey, string> = {
  pageLoad: "pageLoadTime",
  dns: "dnsTime",
  connection: "connectionTime",
  request: "requestTime",
  response: "responseTime",
  pageRender: "pageRenderTime",
  loadEvent: "loadEventTime",
  firstPaint: "firstPaint",
  firstContentfulPaint: "firstContentfulPaint",
};
const PERF_METRIC_KEYS = Object.keys(PERF_METRIC_FIELD) as PerfMetricKey[];

// Mesma suspeita de escala em microssegundos já confirmada pros Web Vitals —
// dataset da mesma família da API RUM. Se os números vierem 1000x errados (pra
// mais ou pra menos), é isso que precisa ajustar primeiro.
const PERF_TIME_SCALE = 1000;

function perfQuantileFields(percentile: PerfPercentile): string {
  const suffix = percentile.toUpperCase();
  return PERF_METRIC_KEYS.map((k) => `${k}: ${PERF_METRIC_FIELD[k]}${suffix}`).join("\n          ");
}

// Os campos de percentil (aggregation.quantiles) de LCP/INP vêm em MICROssegundos,
// não em ms — confirmado comparando contra o painel nativo da Cloudflare pra
// mesma zona/período (nossos números batiam exatamente 1000x o valor real).
// CLS é um score adimensional (não é tempo), sem esse fator.
const TIME_SCALE: Record<WebVitalKey, number> = { lcp: 1000, inp: 1000, cls: 1 };

// Campo de agrupamento (breakdown) pra uma combinação vital×dimensão. "url" e
// "element" são específicos de cada vital (ex.: largestContentfulPaintPath vs.
// interactionToNextPaintPath); browser/os/country são do contexto da sessão,
// compartilhados entre os 3 vitais.
function groupFieldFor(vital: WebVitalKey, dimensionKey: string): string {
  const prefix = VITAL_PREFIX[vital];
  switch (dimensionKey) {
    case "url":
      return `${prefix}Path`;
    case "element":
      return `${prefix}Element`;
    case "browser":
      return "userAgentBrowser";
    case "os":
      return "userAgentOS";
    case "country":
      return "countryName";
    default:
      return `${prefix}Path`;
  }
}

// ─── GraphQL helper (conta, não zona) ──────────────────────────────────────────
async function gqlAccount(
  apiToken: string,
  query: string,
  variables: Record<string, any>,
): Promise<{ account: Record<string, any>; errors: string[] }> {
  const res = await fetch(GQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiToken}` },
    body: JSON.stringify({ query, variables }),
  });
  const json: any = await res.json().catch(() => ({}));
  const errors: string[] = (json.errors ?? []).map((e: any) => String(e.message ?? "erro desconhecido"));
  const account = json.data?.viewer?.accounts?.[0] ?? {};
  if (!res.ok && Object.keys(account).length === 0) {
    throw new Error(errors[0] ?? `HTTP ${res.status}`);
  }
  return { account, errors };
}

// ─── Descoberta do siteTag (REST, confirmado via docs oficiais) ───────────────
// `ruleset.zone_tag`/`zone_name` são campos OPCIONAIS no schema da Cloudflare —
// por isso o match tem um fallback: se não bater por zona, tenta por host das
// regras do site (rules[].host) contendo o nome da zona (ex.: a regra aplica
// no subdomínio "mb4.bernoulli.com.br", não na raiz "bernoulli.com.br").
type RumSiteLookup =
  | { ok: true; siteTag: string }
  | { ok: false; error: string };

async function resolveRumSiteTag(
  apiToken: string,
  accountId: string,
  zoneId: string,
  zoneName: string,
): Promise<RumSiteLookup> {
  const found: Array<{ host: string | null; siteTag: string | null; zoneTag: string | null; zoneName: string | null }> = [];

  for (let page = 1; page <= 5; page++) {
    const res = await fetch(`${CF_API}/accounts/${accountId}/rum/site_info/list?per_page=50&page=${page}`, {
      headers: { Authorization: `Bearer ${apiToken}` },
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = json?.errors?.[0]?.message ?? `HTTP ${res.status}`;
      return { ok: false, error: `Falha ao listar sites de Web Analytics da conta (token sem permissão de conta?): ${msg}` };
    }
    const items: any[] = json?.result ?? [];
    for (const s of items) {
      found.push({
        host: s?.rules?.[0]?.host ?? null,
        siteTag: s?.site_tag ?? null,
        zoneTag: s?.ruleset?.zone_tag ?? null,
        zoneName: s?.ruleset?.zone_name ?? null,
      });
    }

    const byZone = items.find((s) => s?.ruleset?.zone_tag === zoneId || s?.ruleset?.zone_name === zoneName);
    if (byZone?.site_tag) return { ok: true, siteTag: String(byZone.site_tag) };

    const byHost = items.find((s) => {
      const host = String(s?.rules?.[0]?.host ?? "");
      return host === zoneName || host.endsWith(`.${zoneName}`);
    });
    if (byHost?.site_tag) return { ok: true, siteTag: String(byHost.site_tag) };

    const totalPages = json?.result_info?.total_pages ?? 1;
    if (page >= totalPages) break;
  }

  if (found.length === 0) {
    return { ok: false, error: "Nenhum site de Web Analytics encontrado nessa conta Cloudflare (lista veio vazia)." };
  }
  const list = found.map((f) => `${f.host ?? f.zoneName ?? "?"} (site_tag=${f.siteTag ?? "?"})`).join(", ");
  return {
    ok: false,
    error: `Nenhum site de Web Analytics bate com a zona "${zoneName}". Sites encontrados na conta: ${list}`,
  };
}

// ─── Tipos ──────────────────────────────────────────────────────────────────────
export type WebVitalBreakdownRow = {
  value: string;
  good: number;
  needsImprovement: number;
  poor: number;
  total: number;
};
export type WebVitalDebugRow = { element: string; value: number; count: number };
export type WebVitalQuantiles = { p50: number; p75: number; p90: number; p99: number };
export type WebVitalSeriesPoint = { ts: string; p50: number; p75: number; p90: number; p99: number };
export type WebVitalSummary = {
  total: number;
  good: number;
  needsImprovement: number;
  poor: number;
  breakdown: WebVitalBreakdownRow[];
  debugRows: WebVitalDebugRow[];
  // Só populado pra LCP (replica o print oficial: percentis + linha do tempo).
  quantiles?: WebVitalQuantiles;
  series?: WebVitalSeriesPoint[];
};

export type VisitsSeriesPoint = { ts: string; visits: number };
export type VisitsBreakdownRow = { value: string; visits: number };
export type PageViewsSeriesPoint = { ts: string; views: number };
export type PageViewsBreakdownRow = { value: string; views: number };
export type PageLoadTimeSeriesPoint = { ts: string; ms: number };
export type PerfBreakdownRow = { value: string; ms: number; count: number };
export type WebAnalyticsTotals = {
  visits: number;
  pageViews: number;
  visitsDeltaPct: number | null;
  visitsSeries: VisitsSeriesPoint[];
  pageViewsDeltaPct: number | null;
  pageViewsSeries: PageViewsSeriesPoint[];
  pageLoadTimeMs: number | null;
  pageLoadTimeDeltaPct: number | null;
  pageLoadTimeSeries: PageLoadTimeSeriesPoint[];
};

export type VisitsDetailResult =
  | {
      ok: true;
      total: number;
      deltaPct: number | null;
      series: VisitsSeriesPoint[];
      referers: VisitsBreakdownRow[];
      paths: VisitsBreakdownRow[];
      hosts: VisitsBreakdownRow[];
      browsers: VisitsBreakdownRow[];
      operatingSystems: VisitsBreakdownRow[];
      deviceTypes: VisitsBreakdownRow[];
      warning?: string | null;
    }
  | { ok: false; error: string };

export type PageViewsDetailResult =
  | {
      ok: true;
      total: number;
      deltaPct: number | null;
      series: PageViewsSeriesPoint[];
      referers: PageViewsBreakdownRow[];
      paths: PageViewsBreakdownRow[];
      hosts: PageViewsBreakdownRow[];
      browsers: PageViewsBreakdownRow[];
      operatingSystems: PageViewsBreakdownRow[];
      deviceTypes: PageViewsBreakdownRow[];
      warning?: string | null;
    }
  | { ok: false; error: string };

export type PageLoadTimeDetailResult =
  | {
      ok: true;
      percentile: PerfPercentile;
      metrics: Record<PerfMetricKey, number>;
      series: Array<{ ts: string } & Record<PerfMetricKey, number>>;
      referers: PerfBreakdownRow[];
      paths: PerfBreakdownRow[];
      hosts: PerfBreakdownRow[];
      browsers: PerfBreakdownRow[];
      operatingSystems: PerfBreakdownRow[];
      deviceTypes: PerfBreakdownRow[];
      warning?: string | null;
    }
  | { ok: false; error: string };

export type WebAnalyticsResult =
  | {
      ok: true;
      range: { since: string; until: string; days: number };
      totals: WebAnalyticsTotals;
      lcp: WebVitalSummary;
      inp: WebVitalSummary;
      cls: WebVitalSummary;
      warning?: string | null;
    }
  | { ok: false; error: string; notConfigured?: boolean };

export type WebAnalyticsBreakdownResult =
  | { ok: true; vital: WebVitalKey; dimension: string; rows: WebVitalBreakdownRow[]; debugRows: WebVitalDebugRow[] }
  | { ok: false; error: string };

// ─── Busca principal (Core Web Vitals: total/good/poor/breakdown/debug) ───────
async function fetchWebVitalsCore(
  apiToken: string,
  accountId: string,
  siteTag: string,
  sinceIso: string,
  untilIso: string,
  dimensionKey: string,
  onlyVital?: WebVitalKey,
): Promise<{ vitals: Partial<Record<WebVitalKey, WebVitalSummary>>; warnings: string[] }> {
  const vitalsToFetch: WebVitalKey[] = onlyVital ? [onlyVital] : ["lcp", "inp", "cls"];
  const filterExpr = `siteTag_in:[$site], datetime_geq:$since, datetime_leq:$until`;

  const aliasParts: string[] = [];
  for (const v of vitalsToFetch) {
    const prefix = VITAL_PREFIX[v];
    const groupField = groupFieldFor(v, dimensionKey);
    const sumFields = `${v}Total ${v}Good ${v}NeedsImprovement ${v}Poor`;
    // Breakdown por "url" pede requestHost junto (mesmo padrão da query real do
    // dash Cloudflare) pra montar o rótulo com FQDN (ex.: "mb4.bernoulli.com.br/login"),
    // não só o path bruto ("/login") — senão a raiz vira só "/" sem host nenhum.
    const groupDims = dimensionKey === "url" ? `${groupField} requestHost` : groupField;
    aliasParts.push(`
      ${v}_total: rumWebVitalsEventsAdaptiveGroups(limit:1, filter:{${filterExpr}}) {
        sum { ${sumFields} }
        aggregation: quantiles { ${prefix}P50 ${prefix}P75 ${prefix}P90 ${prefix}P99 }
      }
      ${v}_byGroup: rumWebVitalsEventsAdaptiveGroups(limit:10, orderBy:[sum_${v}Total_DESC], filter:{${filterExpr}}) {
        dimensions { ${groupDims} }
        sum { ${sumFields} }
      }
      ${v}_debug: rumWebVitalsEventsAdaptiveGroups(limit:10, orderBy:[count_DESC], filter:{${filterExpr}}) {
        count
        dimensions { ${prefix}Element }
        aggregation: quantiles { ${prefix}P50 }
      }
      ${
        v === "lcp"
          ? `lcpSeries: rumWebVitalsEventsAdaptiveGroups(limit:5000, filter:{${filterExpr}}) {
        dimensions { datetimeFifteenMinutes }
        aggregation: quantiles { largestContentfulPaintP50 largestContentfulPaintP75 largestContentfulPaintP90 largestContentfulPaintP99 }
      }`
          : ""
      }
    `);
  }

  const query = `query($account:String!,$site:String!,$since:Time!,$until:Time!){
    viewer { accounts(filter:{accountTag:$account}) {
      ${aliasParts.join("\n")}
    } } }`;

  let account: Record<string, any> = {};
  let errors: string[] = [];
  try {
    const res = await gqlAccount(apiToken, query, { account: accountId, site: siteTag, since: sinceIso, until: untilIso });
    account = res.account;
    errors = res.errors;
  } catch (e: any) {
    errors = [e.cfMessage ?? e.message ?? String(e)];
  }

  function buildSummary(v: WebVitalKey): WebVitalSummary {
    const prefix = VITAL_PREFIX[v];
    const groupField = groupFieldFor(v, dimensionKey);
    const totalRow = account[`${v}_total`]?.[0] ?? {};
    const totalSum = totalRow.sum ?? {};
    const total = Number(totalSum[`${v}Total`] ?? 0);
    const good = Number(totalSum[`${v}Good`] ?? 0);
    const needsImprovement = Number(totalSum[`${v}NeedsImprovement`] ?? 0);
    const poor = Number(totalSum[`${v}Poor`] ?? 0);

    const breakdown: WebVitalBreakdownRow[] = ((account[`${v}_byGroup`] ?? []) as any[]).map((r) => {
      const rawValue = String(r.dimensions?.[groupField] ?? "—");
      // Só concatena host+path na aba "url" — nas outras (browser/os/country/element)
      // o rótulo já é o valor da própria dimensão, sem host.
      const value = dimensionKey === "url" ? `${r.dimensions?.requestHost ?? ""}${rawValue}` : rawValue;
      return {
        value,
        good: Number(r.sum?.[`${v}Good`] ?? 0),
        needsImprovement: Number(r.sum?.[`${v}NeedsImprovement`] ?? 0),
        poor: Number(r.sum?.[`${v}Poor`] ?? 0),
        total: Number(r.sum?.[`${v}Total`] ?? 0),
      };
    });

    const scale = TIME_SCALE[v];
    const debugRows: WebVitalDebugRow[] = ((account[`${v}_debug`] ?? []) as any[]).map((r) => ({
      element: String(r.dimensions?.[`${prefix}Element`] ?? "—"),
      value: Number(r.aggregation?.[`${prefix}P50`] ?? 0) / scale,
      count: Number(r.count ?? 0),
    }));

    const q = totalRow.aggregation;
    const quantiles: WebVitalQuantiles | undefined = q
      ? {
          p50: Number(q[`${prefix}P50`] ?? 0) / scale,
          p75: Number(q[`${prefix}P75`] ?? 0) / scale,
          p90: Number(q[`${prefix}P90`] ?? 0) / scale,
          p99: Number(q[`${prefix}P99`] ?? 0) / scale,
        }
      : undefined;

    let series: WebVitalSeriesPoint[] | undefined;
    if (v === "lcp" && Array.isArray(account.lcpSeries)) {
      const lcpScale = TIME_SCALE.lcp;
      series = (account.lcpSeries as any[])
        .map((r) => ({
          ts: String(r.dimensions?.datetimeFifteenMinutes ?? ""),
          p50: Number(r.aggregation?.largestContentfulPaintP50 ?? 0) / lcpScale,
          p75: Number(r.aggregation?.largestContentfulPaintP75 ?? 0) / lcpScale,
          p90: Number(r.aggregation?.largestContentfulPaintP90 ?? 0) / lcpScale,
          p99: Number(r.aggregation?.largestContentfulPaintP99 ?? 0) / lcpScale,
        }))
        .filter((p) => p.ts)
        .sort((a, b) => a.ts.localeCompare(b.ts));
    }

    return { total, good, needsImprovement, poor, breakdown, debugRows, quantiles, series };
  }

  const vitals: Partial<Record<WebVitalKey, WebVitalSummary>> = {};
  for (const v of vitalsToFetch) vitals[v] = buildSummary(v);
  return { vitals, warnings: errors };
}

// Janela imediatamente anterior, mesma duração — usada pra calcular variação %
// (mesmo padrão da query real do dash Cloudflare: visitsDelta com filtro deslocado).
function previousPeriod(since: Date, until: Date): { prevSince: Date; prevUntil: Date } {
  const rangeMs = until.getTime() - since.getTime();
  return { prevSince: new Date(since.getTime() - rangeMs), prevUntil: new Date(since.getTime()) };
}
function deltaPctOf(current: number, previous: number): number | null {
  return previous > 0 ? ((current - previous) / previous) * 100 : null;
}

// ─── Resolução comum de zona/token/siteTag (compartilhada pelos 2 endpoints) ──
async function resolveWebAnalyticsContext(
  zoneId: string | null,
): Promise<{ apiToken: string; accountId: string; siteTag: string } | { ok: false; error: string; notConfigured?: boolean }> {
  if (!zoneId) return { ok: false, error: "Selecione uma zona pra ver o Web Analytics." };
  const supabase = makeSupabase();

  const { data: zoneRow } = await supabase
    .from("cloudflare_zones")
    .select("id, name, account_id")
    .eq("id", zoneId)
    .maybeSingle();
  if (!zoneRow?.account_id) {
    return { ok: false, error: "Zona não sincronizada ou sem conta associada. Rode um sync primeiro." };
  }

  const { data: integ } = await supabase
    .from("integrations")
    .select("api_key, enabled")
    .eq("provider", "cloudflare")
    .maybeSingle();
  if (!integ?.enabled || !integ?.api_key) {
    return { ok: false, error: "Integração Cloudflare não está ativa ou sem token configurado." };
  }

  const lookup = await resolveRumSiteTag(integ.api_key, zoneRow.account_id, zoneRow.id, zoneRow.name);
  if (!lookup.ok) {
    // "token sem permissão" é um problema diferente de "RUM não configurado" —
    // só trata como empty-state amigável quando de fato não achou site nenhum
    // batendo; erro de permissão/API vai pra caixa de erro normal, porque a
    // solução é outra (ajustar escopo do token, não configurar RUM).
    const isPermissionIssue = lookup.error.includes("token sem permissão");
    return { ok: false, error: lookup.error, notConfigured: !isPermissionIssue };
  }

  return { apiToken: integ.api_key, accountId: zoneRow.account_id, siteTag: lookup.siteTag };
}

// ─── Totais (Visits/Page views/Page load time) usados por getWebAnalytics ─────
// NOTA: isso é RUM (rumPageloadEventsAdaptiveGroups/rumPerformanceEventsAdaptiveGroups,
// por CONTA) — diferente do "Page views"/"Visits" do HTTP Traffic, que usa
// httpRequestsAdaptiveGroups (por ZONA, filtrado por requestSource:"eyeball").
// São conceitos parecidos mas fontes e números diferentes; não reaproveitar
// esta função pro HTTP Traffic (já tentamos e os números não batiam).
async function fetchWebAnalyticsTotals(
  apiToken: string,
  accountId: string,
  siteTag: string,
  sinceIso: string,
  untilIso: string,
  prevSinceIso: string,
  prevUntilIso: string,
): Promise<{ totals: WebAnalyticsTotals; warning: string | null }> {
  let totals: WebAnalyticsTotals = {
    visits: 0,
    pageViews: 0,
    visitsDeltaPct: null,
    visitsSeries: [],
    pageViewsDeltaPct: null,
    pageViewsSeries: [],
    pageLoadTimeMs: null,
    pageLoadTimeDeltaPct: null,
    pageLoadTimeSeries: [],
  };
  let warning: string | null = null;
  try {
    const { account, errors } = await gqlAccount(
      apiToken,
      `query($account:String!,$site:String!,$since:Time!,$until:Time!,$prevSince:Time!,$prevUntil:Time!){
        viewer { accounts(filter:{accountTag:$account}) {
          totals: rumPageloadEventsAdaptiveGroups(limit:1, filter:{siteTag_in:[$site], datetime_geq:$since, datetime_leq:$until}) {
            count sum { visits }
          }
          prevTotals: rumPageloadEventsAdaptiveGroups(limit:1, filter:{siteTag_in:[$site], datetime_geq:$prevSince, datetime_leq:$prevUntil}) {
            count sum { visits }
          }
          series: rumPageloadEventsAdaptiveGroups(limit:2000, filter:{siteTag_in:[$site], datetime_geq:$since, datetime_leq:$until}) {
            count
            sum { visits }
            dimensions { ts: datetimeFifteenMinutes }
          }
          perfTotal: rumPerformanceEventsAdaptiveGroups(limit:1, filter:{siteTag_in:[$site], datetime_geq:$since, datetime_leq:$until}) {
            aggregation: quantiles { pageLoadTime: pageLoadTimeP50 }
          }
          perfPrevTotal: rumPerformanceEventsAdaptiveGroups(limit:1, filter:{siteTag_in:[$site], datetime_geq:$prevSince, datetime_leq:$prevUntil}) {
            aggregation: quantiles { pageLoadTime: pageLoadTimeP50 }
          }
          perfSeries: rumPerformanceEventsAdaptiveGroups(limit:2000, filter:{siteTag_in:[$site], datetime_geq:$since, datetime_leq:$until}) {
            aggregation: quantiles { pageLoadTime: pageLoadTimeP50 }
            dimensions { ts: datetimeFifteenMinutes }
          }
        } } }`,
      { account: accountId, site: siteTag, since: sinceIso, until: untilIso, prevSince: prevSinceIso, prevUntil: prevUntilIso },
    );
    const row = account.totals?.[0];
    const visits = Number(row?.sum?.visits ?? 0);
    const pageViews = Number(row?.count ?? 0);
    const prevVisits = Number(account.prevTotals?.[0]?.sum?.visits ?? 0);
    const prevPageViews = Number(account.prevTotals?.[0]?.count ?? 0);
    const pageLoadTimeMs = Number(account.perfTotal?.[0]?.aggregation?.pageLoadTime ?? 0) / PERF_TIME_SCALE;
    const prevPageLoadTimeMs = Number(account.perfPrevTotal?.[0]?.aggregation?.pageLoadTime ?? 0) / PERF_TIME_SCALE;
    const pageLoadTimeSeries: PageLoadTimeSeriesPoint[] = ((account.perfSeries ?? []) as any[])
      .map((r) => ({ ts: String(r.dimensions?.ts ?? ""), ms: Number(r.aggregation?.pageLoadTime ?? 0) / PERF_TIME_SCALE }))
      .filter((p) => p.ts)
      .sort((a, b) => a.ts.localeCompare(b.ts));
    const visitsSeries: VisitsSeriesPoint[] = ((account.series ?? []) as any[])
      .map((r) => ({ ts: String(r.dimensions?.ts ?? ""), visits: Number(r.sum?.visits ?? 0) }))
      .filter((p) => p.ts)
      .sort((a, b) => a.ts.localeCompare(b.ts));
    const pageViewsSeries: PageViewsSeriesPoint[] = ((account.series ?? []) as any[])
      .map((r) => ({ ts: String(r.dimensions?.ts ?? ""), views: Number(r.count ?? 0) }))
      .filter((p) => p.ts)
      .sort((a, b) => a.ts.localeCompare(b.ts));
    totals = {
      visits,
      pageViews,
      visitsDeltaPct: deltaPctOf(visits, prevVisits),
      visitsSeries,
      pageViewsDeltaPct: deltaPctOf(pageViews, prevPageViews),
      pageViewsSeries,
      pageLoadTimeMs,
      pageLoadTimeDeltaPct: deltaPctOf(pageLoadTimeMs, prevPageLoadTimeMs),
      pageLoadTimeSeries,
    };
    if (errors.length) warning = errors.join(" | ");
  } catch (e: any) {
    warning = e.cfMessage ?? e.message ?? String(e);
  }
  return { totals, warning };
}

// ─── getWebAnalytics ────────────────────────────────────────────────────────────

export const getWebAnalytics = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId?: string | null; days?: number } | undefined) => ({
    zoneId: input?.zoneId?.trim() || null,
    days: Math.min(Math.max(input?.days ?? 1, 1), 30),
  }))
  .handler(async ({ data, context }): Promise<WebAnalyticsResult> => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "view_analytics_web");

    const ctx = await resolveWebAnalyticsContext(data.zoneId);
    if ("error" in ctx) return ctx;

    const until = new Date();
    const since = new Date(until.getTime() - data.days * 24 * 60 * 60 * 1000);
    const sinceIso = since.toISOString();
    const untilIso = until.toISOString();
    const { prevSince, prevUntil } = previousPeriod(since, until);

    const { totals, warning: totalsWarning } = await fetchWebAnalyticsTotals(
      ctx.apiToken,
      ctx.accountId,
      ctx.siteTag,
      sinceIso,
      untilIso,
      prevSince.toISOString(),
      prevUntil.toISOString(),
    );

    const { vitals, warnings } = await fetchWebVitalsCore(
      ctx.apiToken,
      ctx.accountId,
      ctx.siteTag,
      sinceIso,
      untilIso,
      "url",
    );

    const empty: WebVitalSummary = { total: 0, good: 0, needsImprovement: 0, poor: 0, breakdown: [], debugRows: [] };
    const allWarnings = [...(totalsWarning ? [totalsWarning] : []), ...warnings];
    return {
      ok: true,
      range: { since: sinceIso, until: untilIso, days: data.days },
      totals,
      lcp: vitals.lcp ?? empty,
      inp: vitals.inp ?? empty,
      cls: vitals.cls ?? empty,
      warning: allWarnings.length ? allWarnings.join(" | ") : null,
    };
  });

// ─── getWebAnalyticsBreakdown (sob demanda, ao trocar de aba) ─────────────────

export const getWebAnalyticsBreakdown = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId?: string | null; days?: number; vital: string; dimension: string }) => ({
    zoneId: input.zoneId?.trim() || null,
    days: Math.min(Math.max(input?.days ?? 1, 1), 30),
    vital: input.vital,
    dimension: input.dimension,
  }))
  .handler(async ({ data, context }): Promise<WebAnalyticsBreakdownResult> => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "view_analytics_web");
    if (!["lcp", "inp", "cls"].includes(data.vital)) return { ok: false, error: `Vital "${data.vital}" inválido.` };
    if (!VALID_DIMENSIONS.has(data.dimension)) return { ok: false, error: `Dimensão "${data.dimension}" inválida.` };

    const ctx = await resolveWebAnalyticsContext(data.zoneId);
    if ("error" in ctx) return { ok: false, error: ctx.error };

    const until = new Date();
    const since = new Date(until.getTime() - data.days * 24 * 60 * 60 * 1000);
    const vital = data.vital as WebVitalKey;

    const { vitals, warnings } = await fetchWebVitalsCore(
      ctx.apiToken,
      ctx.accountId,
      ctx.siteTag,
      since.toISOString(),
      until.toISOString(),
      data.dimension,
      vital,
    );
    const summary = vitals[vital];
    if (!summary) return { ok: false, error: warnings.join(" | ") || "Sem dados." };
    return { ok: true, vital, dimension: data.dimension, rows: summary.breakdown, debugRows: summary.debugRows };
  });

// ─── getWebAnalyticsVisitsDetail (modal do card "Visits") ─────────────────────
// Dimensões confirmadas no dataset rumPageloadEventsAdaptiveGroups: refererHost,
// requestPath, requestHost, userAgentBrowser, userAgentOS, deviceType.
const VISITS_BREAKDOWN_FIELDS: Array<{ key: string; field: string; emptyLabel: string }> = [
  { key: "referers", field: "refererHost", emptyLabel: "None (direct)" },
  { key: "paths", field: "requestPath", emptyLabel: "—" },
  { key: "hosts", field: "requestHost", emptyLabel: "—" },
  { key: "browsers", field: "userAgentBrowser", emptyLabel: "—" },
  { key: "operatingSystems", field: "userAgentOS", emptyLabel: "—" },
  { key: "deviceTypes", field: "deviceType", emptyLabel: "—" },
];

export const getWebAnalyticsVisitsDetail = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId?: string | null; days?: number; filters?: unknown } | undefined) => ({
    zoneId: input?.zoneId?.trim() || null,
    days: Math.min(Math.max(input?.days ?? 1, 1), 30),
    filters: filtersInputSchema.parse(input?.filters ?? []) as AnalyticsFilterCondition[],
  }))
  .handler(async ({ data, context }): Promise<VisitsDetailResult> => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "view_analytics_web");

    const ctx = await resolveWebAnalyticsContext(data.zoneId);
    if ("error" in ctx) return { ok: false, error: ctx.error };

    const until = new Date();
    const since = new Date(until.getTime() - data.days * 24 * 60 * 60 * 1000);
    const { prevSince, prevUntil } = previousPeriod(since, until);

    // "+ Add filter" (mesmo padrão isomórfico do HTTP Traffic — nunca interpola
    // valor do usuário na query, só o nome de campo fixo da allowlist).
    const fc = buildAdaptiveFilterClause(data.filters, RUM_VISITS_FILTER_FIELDS, "vf");
    const rangeFilter = `siteTag_in:[$site], datetime_geq:$since, datetime_leq:$until${fc.fragment}`;
    const prevRangeFilter = `siteTag_in:[$site], datetime_geq:$prevSince, datetime_leq:$prevUntil${fc.fragment}`;

    const breakdownParts = VISITS_BREAKDOWN_FIELDS.map(
      ({ key, field }) => `
        ${key}: rumPageloadEventsAdaptiveGroups(limit:30, orderBy:[sum_visits_DESC], filter:{${rangeFilter}}) {
          sum { visits }
          dimensions { ${field} }
        }`,
    ).join("\n");

    const query = `query($account:String!,$site:String!,$since:Time!,$until:Time!,$prevSince:Time!,$prevUntil:Time!${fc.declarations}){
      viewer { accounts(filter:{accountTag:$account}) {
        total: rumPageloadEventsAdaptiveGroups(limit:1, filter:{${rangeFilter}}) {
          sum { visits }
        }
        prevTotal: rumPageloadEventsAdaptiveGroups(limit:1, filter:{${prevRangeFilter}}) {
          sum { visits }
        }
        series: rumPageloadEventsAdaptiveGroups(limit:5000, filter:{${rangeFilter}}) {
          sum { visits }
          dimensions { ts: datetimeFifteenMinutes }
        }
        ${breakdownParts}
      } } }`;

    let account: Record<string, any> = {};
    let errors: string[] = [];
    try {
      const res = await gqlAccount(ctx.apiToken, query, {
        account: ctx.accountId,
        site: ctx.siteTag,
        since: since.toISOString(),
        until: until.toISOString(),
        prevSince: prevSince.toISOString(),
        prevUntil: prevUntil.toISOString(),
        ...fc.variables,
      });
      account = res.account;
      errors = res.errors;
    } catch (e: any) {
      return { ok: false, error: e.cfMessage ?? e.message ?? String(e) };
    }
    if (Object.keys(account).length === 0 && errors.length) {
      return { ok: false, error: errors.join(" | ") };
    }

    const total = Number(account.total?.[0]?.sum?.visits ?? 0);
    const prevTotal = Number(account.prevTotal?.[0]?.sum?.visits ?? 0);
    const series: VisitsSeriesPoint[] = ((account.series ?? []) as any[])
      .map((r) => ({ ts: String(r.dimensions?.ts ?? ""), visits: Number(r.sum?.visits ?? 0) }))
      .filter((p) => p.ts)
      .sort((a, b) => a.ts.localeCompare(b.ts));

    const breakdowns: Record<string, VisitsBreakdownRow[]> = {};
    for (const { key, field, emptyLabel } of VISITS_BREAKDOWN_FIELDS) {
      breakdowns[key] = ((account[key] ?? []) as any[]).map((r) => ({
        value: String(r.dimensions?.[field] ?? "") || emptyLabel,
        visits: Number(r.sum?.visits ?? 0),
      }));
    }

    const allWarnings = [...fc.warnings, ...errors];
    return {
      ok: true,
      total,
      deltaPct: deltaPctOf(total, prevTotal),
      series,
      referers: breakdowns.referers,
      paths: breakdowns.paths,
      hosts: breakdowns.hosts,
      browsers: breakdowns.browsers,
      operatingSystems: breakdowns.operatingSystems,
      deviceTypes: breakdowns.deviceTypes,
      warning: allWarnings.length ? allWarnings.join(" | ") : null,
    };
  });

// ─── getWebAnalyticsPageViewsDetail (modal do card "Page views") ──────────────
// Mesma estrutura de getWebAnalyticsVisitsDetail, mas a métrica é `count`
// (resposta HTML bem-sucedida) em vez de `sum.visits` — mesmas dimensões de
// breakdown (VISITS_BREAKDOWN_FIELDS) e mesma allowlist de filtro.
export const getWebAnalyticsPageViewsDetail = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId?: string | null; days?: number; filters?: unknown } | undefined) => ({
    zoneId: input?.zoneId?.trim() || null,
    days: Math.min(Math.max(input?.days ?? 1, 1), 30),
    filters: filtersInputSchema.parse(input?.filters ?? []) as AnalyticsFilterCondition[],
  }))
  .handler(async ({ data, context }): Promise<PageViewsDetailResult> => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "view_analytics_web");

    const ctx = await resolveWebAnalyticsContext(data.zoneId);
    if ("error" in ctx) return { ok: false, error: ctx.error };

    const until = new Date();
    const since = new Date(until.getTime() - data.days * 24 * 60 * 60 * 1000);
    const { prevSince, prevUntil } = previousPeriod(since, until);

    const fc = buildAdaptiveFilterClause(data.filters, RUM_VISITS_FILTER_FIELDS, "pf");
    const rangeFilter = `siteTag_in:[$site], datetime_geq:$since, datetime_leq:$until${fc.fragment}`;
    const prevRangeFilter = `siteTag_in:[$site], datetime_geq:$prevSince, datetime_leq:$prevUntil${fc.fragment}`;

    const breakdownParts = VISITS_BREAKDOWN_FIELDS.map(
      ({ key, field }) => `
        ${key}: rumPageloadEventsAdaptiveGroups(limit:30, orderBy:[count_DESC], filter:{${rangeFilter}}) {
          count
          dimensions { ${field} }
        }`,
    ).join("\n");

    const query = `query($account:String!,$site:String!,$since:Time!,$until:Time!,$prevSince:Time!,$prevUntil:Time!${fc.declarations}){
      viewer { accounts(filter:{accountTag:$account}) {
        total: rumPageloadEventsAdaptiveGroups(limit:1, filter:{${rangeFilter}}) {
          count
        }
        prevTotal: rumPageloadEventsAdaptiveGroups(limit:1, filter:{${prevRangeFilter}}) {
          count
        }
        series: rumPageloadEventsAdaptiveGroups(limit:5000, filter:{${rangeFilter}}) {
          count
          dimensions { ts: datetimeFifteenMinutes }
        }
        ${breakdownParts}
      } } }`;

    let account: Record<string, any> = {};
    let errors: string[] = [];
    try {
      const res = await gqlAccount(ctx.apiToken, query, {
        account: ctx.accountId,
        site: ctx.siteTag,
        since: since.toISOString(),
        until: until.toISOString(),
        prevSince: prevSince.toISOString(),
        prevUntil: prevUntil.toISOString(),
        ...fc.variables,
      });
      account = res.account;
      errors = res.errors;
    } catch (e: any) {
      return { ok: false, error: e.cfMessage ?? e.message ?? String(e) };
    }
    if (Object.keys(account).length === 0 && errors.length) {
      return { ok: false, error: errors.join(" | ") };
    }

    const total = Number(account.total?.[0]?.count ?? 0);
    const prevTotal = Number(account.prevTotal?.[0]?.count ?? 0);
    const series: PageViewsSeriesPoint[] = ((account.series ?? []) as any[])
      .map((r) => ({ ts: String(r.dimensions?.ts ?? ""), views: Number(r.count ?? 0) }))
      .filter((p) => p.ts)
      .sort((a, b) => a.ts.localeCompare(b.ts));

    const breakdowns: Record<string, PageViewsBreakdownRow[]> = {};
    for (const { key, field, emptyLabel } of VISITS_BREAKDOWN_FIELDS) {
      breakdowns[key] = ((account[key] ?? []) as any[]).map((r) => ({
        value: String(r.dimensions?.[field] ?? "") || emptyLabel,
        views: Number(r.count ?? 0),
      }));
    }

    const allWarnings = [...fc.warnings, ...errors];
    return {
      ok: true,
      total,
      deltaPct: deltaPctOf(total, prevTotal),
      series,
      referers: breakdowns.referers,
      paths: breakdowns.paths,
      hosts: breakdowns.hosts,
      browsers: breakdowns.browsers,
      operatingSystems: breakdowns.operatingSystems,
      deviceTypes: breakdowns.deviceTypes,
      warning: allWarnings.length ? allWarnings.join(" | ") : null,
    };
  });

// ─── getWebAnalyticsPageLoadTimeDetail (modal do card "Page load time") ───────
// Dataset rumPerformanceEventsAdaptiveGroups — nomes confirmados via captura de
// GetRumPerfAnalyticsTopNs. Breakdown ordenado por count (volume de tráfego),
// mostrando o tempo (percentil escolhido) daquele grupo — mesmo padrão da query real.
export const getWebAnalyticsPageLoadTimeDetail = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId?: string | null; days?: number; percentile?: string; filters?: unknown } | undefined) => ({
    zoneId: input?.zoneId?.trim() || null,
    days: Math.min(Math.max(input?.days ?? 1, 1), 30),
    percentile: (["p50", "p75", "p90", "p99"].includes(input?.percentile ?? "") ? input!.percentile : "p75") as PerfPercentile,
    filters: filtersInputSchema.parse(input?.filters ?? []) as AnalyticsFilterCondition[],
  }))
  .handler(async ({ data, context }): Promise<PageLoadTimeDetailResult> => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "view_analytics_web");

    const ctx = await resolveWebAnalyticsContext(data.zoneId);
    if ("error" in ctx) return { ok: false, error: ctx.error };

    const until = new Date();
    const since = new Date(until.getTime() - data.days * 24 * 60 * 60 * 1000);

    const fc = buildAdaptiveFilterClause(data.filters, RUM_VISITS_FILTER_FIELDS, "lf");
    const rangeFilter = `siteTag_in:[$site], datetime_geq:$since, datetime_leq:$until${fc.fragment}`;
    const quantileFields = perfQuantileFields(data.percentile);
    const pageLoadOnlyField = `pageLoad: ${PERF_METRIC_FIELD.pageLoad}${data.percentile.toUpperCase()}`;

    const breakdownParts = VISITS_BREAKDOWN_FIELDS.map(
      ({ key, field }) => `
        ${key}: rumPerformanceEventsAdaptiveGroups(limit:30, orderBy:[count_DESC], filter:{${rangeFilter}}) {
          count
          aggregation: quantiles { ${pageLoadOnlyField} }
          dimensions { ${field} }
        }`,
    ).join("\n");

    const query = `query($account:String!,$site:String!,$since:Time!,$until:Time!${fc.declarations}){
      viewer { accounts(filter:{accountTag:$account}) {
        total: rumPerformanceEventsAdaptiveGroups(limit:1, filter:{${rangeFilter}}) {
          aggregation: quantiles { ${quantileFields} }
        }
        series: rumPerformanceEventsAdaptiveGroups(limit:5000, filter:{${rangeFilter}}) {
          dimensions { ts: datetimeFifteenMinutes }
          aggregation: quantiles { ${quantileFields} }
        }
        ${breakdownParts}
      } } }`;

    let account: Record<string, any> = {};
    let errors: string[] = [];
    try {
      const res = await gqlAccount(ctx.apiToken, query, {
        account: ctx.accountId,
        site: ctx.siteTag,
        since: since.toISOString(),
        until: until.toISOString(),
        ...fc.variables,
      });
      account = res.account;
      errors = res.errors;
    } catch (e: any) {
      return { ok: false, error: e.cfMessage ?? e.message ?? String(e) };
    }
    if (Object.keys(account).length === 0 && errors.length) {
      return { ok: false, error: errors.join(" | ") };
    }

    const totalAgg = account.total?.[0]?.aggregation ?? {};
    const metrics = {} as Record<PerfMetricKey, number>;
    for (const k of PERF_METRIC_KEYS) metrics[k] = Number(totalAgg[k] ?? 0) / PERF_TIME_SCALE;

    const series = ((account.series ?? []) as any[])
      .map((r) => {
        const point: any = { ts: String(r.dimensions?.ts ?? "") };
        for (const k of PERF_METRIC_KEYS) point[k] = Number(r.aggregation?.[k] ?? 0) / PERF_TIME_SCALE;
        return point;
      })
      .filter((p) => p.ts)
      .sort((a, b) => a.ts.localeCompare(b.ts)) as Array<{ ts: string } & Record<PerfMetricKey, number>>;

    const breakdowns: Record<string, PerfBreakdownRow[]> = {};
    for (const { key, field, emptyLabel } of VISITS_BREAKDOWN_FIELDS) {
      breakdowns[key] = ((account[key] ?? []) as any[]).map((r) => ({
        value: String(r.dimensions?.[field] ?? "") || emptyLabel,
        ms: Number(r.aggregation?.pageLoad ?? 0) / PERF_TIME_SCALE,
        count: Number(r.count ?? 0),
      }));
    }

    const allWarnings = [...fc.warnings, ...errors];
    return {
      ok: true,
      percentile: data.percentile,
      metrics,
      series,
      referers: breakdowns.referers,
      paths: breakdowns.paths,
      hosts: breakdowns.hosts,
      browsers: breakdowns.browsers,
      operatingSystems: breakdowns.operatingSystems,
      deviceTypes: breakdowns.deviceTypes,
      warning: allWarnings.length ? allWarnings.join(" | ") : null,
    };
  });
