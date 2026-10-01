// Security Analytics — reescrita fiel ao painel nativo da Cloudflare, confirmada
// via captura das queries GraphQL reais (HTTPDDoSSurveyQuery, GetSecurityTopN,
// HasAnyScoredTraffic, SecurityAnalyticsTimeseriesBydatetimeFifteenMinutes,
// GetSecuritySampledLogs). Diferente da versão antiga (firewallEventsAdaptiveGroups,
// poucos campos): agora usa httpRequestsAdaptiveGroups/httpRequestsAdaptive
// (mesmo dataset do HTTP Traffic), filtrado por requestSource:"eyeball" — por
// isso é só "janela ao vivo" (zona + poucos dias), sem caminho de banco.
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { requirePermission } from "@/lib/authz";
import {
  buildAdaptiveFilterClause,
  filtersInputSchema,
  SECURITY_ANALYTICS_FILTER_FIELDS,
  SECURITY_EVENTS_FILTER_FIELDS,
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

const GQL_URL = "https://api.cloudflare.com/client/v4/graphql";

async function gqlZonePartial(
  apiToken: string,
  query: string,
  variables: Record<string, any>,
): Promise<{ zone: Record<string, any>; errors: string[] }> {
  const res = await fetch(GQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiToken}` },
    body: JSON.stringify({ query, variables }),
  });
  const json: any = await res.json().catch(() => ({}));
  const errors: string[] = (json.errors ?? []).map((e: any) => String(e.message ?? "erro desconhecido"));
  const zone = json.data?.viewer?.zones?.[0] ?? {};
  if (!res.ok && Object.keys(zone).length === 0) {
    throw new Error(errors[0] ?? `HTTP ${res.status}`);
  }
  return { zone, errors };
}

async function resolveSecurityContext(
  zoneId: string | null,
): Promise<{ apiToken: string; zoneId: string } | { ok: false; error: string }> {
  if (!zoneId) return { ok: false, error: "Selecione uma zona." };
  const supabase = makeSupabase();
  const { data: zoneRow } = await supabase.from("cloudflare_zones").select("id").eq("id", zoneId).maybeSingle();
  if (!zoneRow?.id) return { ok: false, error: "Zona não sincronizada." };
  const { data: integ } = await supabase
    .from("integrations")
    .select("api_key, enabled")
    .eq("provider", "cloudflare")
    .maybeSingle();
  if (!integ?.enabled || !integ?.api_key) {
    return { ok: false, error: "Integração Cloudflare não está ativa ou sem token configurado." };
  }
  return { apiToken: integ.api_key, zoneId: zoneRow.id };
}

// Ações que a Cloudflare conta como "mitigado" nesse relatório — confirmado na
// query real (securityAction_in / securityAction_notin).
const MITIGATION_ACTIONS = ["block", "challenge", "jschallenge", "managed_challenge", "precursor_interstitial_page_issued"];
const MITIGATION_ACTIONS_GQL = `[${MITIGATION_ACTIONS.map((a) => `"${a}"`).join(",")}]`;
// "Servido por origem" = cache miss/expired/bypass/dynamic — confirmado na query real.
const CACHE_MISS_LIKE_GQL = `["miss","expired","bypass","dynamic"]`;

// Clicar num KPI (Mitigated/Served by Cloudflare/Served by origin) recorta o
// Top Statistics e os Sampled Logs pelo mesmo filtro usado na série do gráfico
// — "total" = sem recorte extra, só o filtro eyeball + do usuário.
export type SecurityKpiKey = "total" | "mitigatedByWaf" | "servedByCloudflare" | "servedByOrigin";
function securityKpiExtraFilter(kpi: SecurityKpiKey): string {
  switch (kpi) {
    case "mitigatedByWaf":
      return `, securityAction_in:${MITIGATION_ACTIONS_GQL}`;
    case "servedByCloudflare":
      return `, securityAction_notin:${MITIGATION_ACTIONS_GQL}, cacheStatus_notin:${CACHE_MISS_LIKE_GQL}`;
    case "servedByOrigin":
      return `, cacheStatus_in:${CACHE_MISS_LIKE_GQL}`;
    default:
      return "";
  }
}

// ─── getSecurityOverview: KPIs + gráfico + "Suspicious activity" ──────────────
export type SecurityKpiPoint = { ts: string; mitigatedByWaf: number; servedByCloudflare: number; servedByOrigin: number };
export type SecurityOverviewResult =
  | {
      ok: true;
      suspiciousActivityCount: number;
      totals: { total: number; mitigatedByWaf: number; servedByCloudflare: number; servedByOrigin: number };
      series: SecurityKpiPoint[];
    }
  | { ok: false; error: string };

export const getSecurityOverview = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId?: string | null; days?: number; filters?: unknown } | undefined) => ({
    zoneId: input?.zoneId?.trim() || null,
    days: Math.min(Math.max(input?.days ?? 1, 1), 4),
    filters: filtersInputSchema.parse(input?.filters ?? []) as AnalyticsFilterCondition[],
  }))
  .handler(async ({ data, context }): Promise<SecurityOverviewResult> => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "view_analytics_security");

    const ctx = await resolveSecurityContext(data.zoneId);
    if ("error" in ctx) return ctx;

    const until = new Date();
    const since = new Date(until.getTime() - data.days * 24 * 60 * 60 * 1000);
    const fc = buildAdaptiveFilterClause(data.filters, SECURITY_ANALYTICS_FILTER_FIELDS, "so");
    const base = `requestSource:"eyeball"${fc.fragment}`;
    const mitigatedFilter = `${base}, securityAction_in:${MITIGATION_ACTIONS_GQL}`;
    const servedCfFilter = `${base}, securityAction_notin:${MITIGATION_ACTIONS_GQL}, cacheStatus_notin:${CACHE_MISS_LIKE_GQL}`;
    const servedOriginFilter = `${base}, cacheStatus_in:${CACHE_MISS_LIKE_GQL}`;

    const query = `query($zone:String!,$since:Time!,$until:Time!${fc.declarations}){
      viewer { zones(filter:{zoneTag:$zone}) {
        total: httpRequestsAdaptiveGroups(limit:1, filter:{datetime_geq:$since, datetime_leq:$until, ${base}}) { count }
        mitigatedTotal: httpRequestsAdaptiveGroups(limit:1, filter:{datetime_geq:$since, datetime_leq:$until, ${mitigatedFilter}}) { count }
        servedCfTotal: httpRequestsAdaptiveGroups(limit:1, filter:{datetime_geq:$since, datetime_leq:$until, ${servedCfFilter}}) { count }
        servedOriginTotal: httpRequestsAdaptiveGroups(limit:1, filter:{datetime_geq:$since, datetime_leq:$until, ${servedOriginFilter}}) { count }
        mitigatedSeries: httpRequestsAdaptiveGroups(limit:5000, orderBy:[datetimeFifteenMinutes_DESC], filter:{datetime_geq:$since, datetime_leq:$until, ${mitigatedFilter}}) { count dimensions { ts: datetimeFifteenMinutes } }
        servedCfSeries: httpRequestsAdaptiveGroups(limit:5000, orderBy:[datetimeFifteenMinutes_DESC], filter:{datetime_geq:$since, datetime_leq:$until, ${servedCfFilter}}) { count dimensions { ts: datetimeFifteenMinutes } }
        servedOriginSeries: httpRequestsAdaptiveGroups(limit:5000, orderBy:[datetimeFifteenMinutes_DESC], filter:{datetime_geq:$since, datetime_leq:$until, ${servedOriginFilter}}) { count dimensions { ts: datetimeFifteenMinutes } }
        ddos: firewallEventsAdaptiveGroups(limit:10000, orderBy:[datetimeFifteenMinutes_DESC], filter:{action_neq:"log", datetimeMinute_geq:$since, datetimeMinute_leq:$until, source:"l7ddos"}) { dimensions { source timestamp: datetimeFifteenMinutes } }
      } } }`;

    try {
      const { zone, errors } = await gqlZonePartial(ctx.apiToken, query, {
        zone: ctx.zoneId,
        since: since.toISOString(),
        until: until.toISOString(),
        ...fc.variables,
      });
      if (Object.keys(zone).length === 0 && errors.length) {
        return { ok: false, error: errors.join(" | ") };
      }

      const byTs = new Map<string, SecurityKpiPoint>();
      function addSeries(rows: any[], key: keyof Omit<SecurityKpiPoint, "ts">) {
        for (const r of rows ?? []) {
          const ts = String(r.dimensions?.ts ?? "");
          if (!ts) continue;
          const point = byTs.get(ts) ?? { ts, mitigatedByWaf: 0, servedByCloudflare: 0, servedByOrigin: 0 };
          point[key] = Number(r.count ?? 0);
          byTs.set(ts, point);
        }
      }
      addSeries(zone.mitigatedSeries, "mitigatedByWaf");
      addSeries(zone.servedCfSeries, "servedByCloudflare");
      addSeries(zone.servedOriginSeries, "servedByOrigin");
      const series = Array.from(byTs.values()).sort((a, b) => a.ts.localeCompare(b.ts));

      return {
        ok: true,
        suspiciousActivityCount: (zone.ddos ?? []).length,
        totals: {
          total: Number(zone.total?.[0]?.count ?? 0),
          mitigatedByWaf: Number(zone.mitigatedTotal?.[0]?.count ?? 0),
          servedByCloudflare: Number(zone.servedCfTotal?.[0]?.count ?? 0),
          servedByOrigin: Number(zone.servedOriginTotal?.[0]?.count ?? 0),
        },
        series,
      };
    } catch (e: any) {
      return { ok: false, error: e.message ?? String(e) };
    }
  });

// ─── getSecurityTopStats: grade grande, confirmada via GetSecurityTopN ────────
export type SecurityTopStatsKey =
  | "clientIPs"
  | "originIPs"
  | "hosts"
  | "paths"
  | "edgeStatusCodes"
  | "asns"
  | "deviceTypes"
  | "apiGatewayEndpoints"
  | "originStatusCodes"
  | "userAgents"
  | "operatingSystems"
  | "queryStrings"
  | "cacheStatuses"
  | "browsers"
  | "referers"
  | "methods"
  | "countries"
  | "xRequestedWith"
  | "httpVersions"
  | "dataCenters"
  | "securitySources"
  | "securityActions"
  | "sslProtocols";
export type SecurityTopStats = Partial<Record<SecurityTopStatsKey, Array<{ value: string; count: number }>>>;

export type SecurityTopStatsResult = { ok: true; topStats: SecurityTopStats; warning?: string | null } | { ok: false; error: string };

export const getSecurityTopStats = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator(
    (input: { zoneId?: string | null; days?: number; filters?: unknown; kpi?: string; wafScore?: string; botDecision?: string } | undefined) => ({
      zoneId: input?.zoneId?.trim() || null,
      days: Math.min(Math.max(input?.days ?? 1, 1), 4),
      filters: filtersInputSchema.parse(input?.filters ?? []) as AnalyticsFilterCondition[],
      kpi: (["total", "mitigatedByWaf", "servedByCloudflare", "servedByOrigin"].includes(input?.kpi ?? "")
        ? input!.kpi
        : "total") as SecurityKpiKey,
      // Recorte por WAF attack score (Request activity → Attack analysis) e/ou
      // por decisão de bot (→ Bot analysis) — valores crus devolvidos pelas
      // próprias APIs (getSecurityAttackAnalysis/getSecurityBotAnalysis), nunca
      // um enum fixo aqui, então não precisa acertar o nome exato de antemão.
      wafScore: typeof input?.wafScore === "string" && input.wafScore.trim() ? input.wafScore.trim() : (null as string | null),
      botDecision: typeof input?.botDecision === "string" && input.botDecision.trim() ? input.botDecision.trim() : (null as string | null),
    }),
  )
  .handler(async ({ data, context }): Promise<SecurityTopStatsResult> => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "view_analytics_security");

    const ctx = await resolveSecurityContext(data.zoneId);
    if ("error" in ctx) return ctx;

    const until = new Date();
    const since = new Date(until.getTime() - data.days * 24 * 60 * 60 * 1000);
    const fc = buildAdaptiveFilterClause(data.filters, SECURITY_ANALYTICS_FILTER_FIELDS, "st");
    const wafScoreDecl = data.wafScore ? ",$wafScore:String" : "";
    const wafScoreFrag = data.wafScore ? `, wafAttackScoreClass:$wafScore` : "";
    const botDecisionDecl = data.botDecision ? ",$botDecision:String" : "";
    const botDecisionFrag = data.botDecision ? `, botManagementDecision:$botDecision` : "";
    const base = `datetime_geq:$since, datetime_leq:$until, requestSource:"eyeball"${fc.fragment}${securityKpiExtraFilter(data.kpi)}${wafScoreFrag}${botDecisionFrag}`;

    function pick(zone: Record<string, any>, alias: string, dimKey: string, map?: (v: any) => string) {
      return ((zone[alias] ?? []) as any[])
        .map((r) => ({ value: map ? map(r.dimensions) : String(r.dimensions?.[dimKey] ?? "—"), count: Number(r.count ?? 0) }))
        .filter((r) => r.value && r.value !== "—");
    }

    const warnings: string[] = [];
    const topStats: SecurityTopStats = {};

    // Doc 1 — mesmo agrupamento da query real (GetSecurityTopN, primeira parte).
    const query1 = `query($zone:String!,$since:Time!,$until:Time!${fc.declarations}${wafScoreDecl}${botDecisionDecl}){
      viewer { zones(filter:{zoneTag:$zone}) {
        clientIPs: httpRequestsAdaptiveGroups(limit:15, orderBy:[count_DESC], filter:{${base}}) { count dimensions { metric: clientIP } }
        originIPs: httpRequestsAdaptiveGroups(limit:15, orderBy:[count_DESC], filter:{${base}, originIP_neq:""}) { count dimensions { metric: originIP } }
        hosts: httpRequestsAdaptiveGroups(limit:15, orderBy:[count_DESC], filter:{${base}}) { count dimensions { metric: clientRequestHTTPHost } }
        paths: httpRequestsAdaptiveGroups(limit:15, orderBy:[count_DESC], filter:{${base}}) { count dimensions { metric: clientRequestPath } }
        edgeStatusCodes: httpRequestsAdaptiveGroups(limit:15, orderBy:[count_DESC], filter:{${base}}) { count dimensions { metric: edgeResponseStatus } }
        asns: httpRequestsAdaptiveGroups(limit:15, orderBy:[count_DESC], filter:{${base}}) { count dimensions { metric: clientAsn description: clientASNDescription } }
        deviceTypes: httpRequestsAdaptiveGroups(limit:15, orderBy:[count_DESC], filter:{${base}}) { count dimensions { metric: clientDeviceType } }
        apiGatewayEndpoints: httpRequestsAdaptiveGroups(limit:15, orderBy:[count_DESC], filter:{${base}}) { count dimensions { metric: apiGatewayMatchedEndpoint } }
        originStatusCodes: httpRequestsAdaptiveGroups(limit:15, orderBy:[count_DESC], filter:{${base}}) { count dimensions { metric: originResponseStatus } }
        userAgents: httpRequestsAdaptiveGroups(limit:15, orderBy:[count_DESC], filter:{${base}}) { count dimensions { metric: userAgent } }
        operatingSystems: httpRequestsAdaptiveGroups(limit:15, orderBy:[count_DESC], filter:{${base}}) { count dimensions { metric: userAgentOS } }
        queryStrings: httpRequestsAdaptiveGroups(limit:15, orderBy:[count_DESC], filter:{${base}}) { count dimensions { metric: clientRequestQuery } }
        cacheStatuses: httpRequestsAdaptiveGroups(limit:15, orderBy:[count_DESC], filter:{${base}}) { count dimensions { metric: cacheStatus } }
        browsers: httpRequestsAdaptiveGroups(limit:15, orderBy:[count_DESC], filter:{${base}}) { count dimensions { metric: userAgentBrowser } }
        referers: httpRequestsAdaptiveGroups(limit:15, orderBy:[count_DESC], filter:{${base}}) { count dimensions { metric: clientRefererHost } }
      } } }`;

    // Doc 2 — segunda parte, incluindo os campos com filtro próprio
    // (securitySource/securityAction excluem "unknown", confirmado na query real).
    const query2 = `query($zone:String!,$since:Time!,$until:Time!${fc.declarations}${wafScoreDecl}${botDecisionDecl}){
      viewer { zones(filter:{zoneTag:$zone}) {
        methods: httpRequestsAdaptiveGroups(limit:15, orderBy:[count_DESC], filter:{${base}}) { count dimensions { metric: clientRequestHTTPMethodName } }
        countries: httpRequestsAdaptiveGroups(limit:15, orderBy:[count_DESC], filter:{${base}}) { count dimensions { metric: clientCountryName } }
        xRequestedWith: httpRequestsAdaptiveGroups(limit:15, orderBy:[count_DESC], filter:{${base}}) { count dimensions { metric: xRequestedWith } }
        httpVersions: httpRequestsAdaptiveGroups(limit:15, orderBy:[count_DESC], filter:{${base}}) { count dimensions { metric: clientRequestHTTPProtocol } }
        dataCenters: httpRequestsAdaptiveGroups(limit:15, orderBy:[count_DESC], filter:{${base}}) { count dimensions { metric: coloCode } }
        securitySources: httpRequestsAdaptiveGroups(limit:15, orderBy:[count_DESC], filter:{${base}, securitySource_neq:"unknown"}) { count dimensions { metric: securitySource } }
        securityActions: httpRequestsAdaptiveGroups(limit:15, orderBy:[count_DESC], filter:{${base}, securityAction_neq:"unknown"}) { count dimensions { metric: securityAction } }
        sslProtocols: httpRequestsAdaptiveGroups(limit:15, orderBy:[count_DESC], filter:{${base}}) { count dimensions { metric: clientSSLProtocol } }
      } } }`;

    const vars = {
      zone: ctx.zoneId,
      since: since.toISOString(),
      until: until.toISOString(),
      ...fc.variables,
      ...(data.wafScore ? { wafScore: data.wafScore } : {}),
      ...(data.botDecision ? { botDecision: data.botDecision } : {}),
    };

    try {
      const [{ zone: z1, errors: e1 }, { zone: z2, errors: e2 }] = await Promise.all([
        gqlZonePartial(ctx.apiToken, query1, vars),
        gqlZonePartial(ctx.apiToken, query2, vars),
      ]);
      if (e1.length) warnings.push(`security top stats (1): ${e1.join(" | ")}`);
      if (e2.length) warnings.push(`security top stats (2): ${e2.join(" | ")}`);

      topStats.clientIPs = pick(z1, "clientIPs", "metric");
      topStats.originIPs = pick(z1, "originIPs", "metric");
      topStats.hosts = pick(z1, "hosts", "metric");
      topStats.paths = pick(z1, "paths", "metric");
      topStats.edgeStatusCodes = pick(z1, "edgeStatusCodes", "metric");
      topStats.asns = pick(z1, "asns", "metric", (d) => (d?.description ? `AS${d.metric} · ${d.description}` : `AS${d?.metric ?? "—"}`));
      topStats.deviceTypes = pick(z1, "deviceTypes", "metric");
      topStats.apiGatewayEndpoints = pick(z1, "apiGatewayEndpoints", "metric");
      topStats.originStatusCodes = pick(z1, "originStatusCodes", "metric");
      topStats.userAgents = pick(z1, "userAgents", "metric", (d) => String(d?.metric ?? "—").slice(0, 140));
      topStats.operatingSystems = pick(z1, "operatingSystems", "metric");
      topStats.queryStrings = pick(z1, "queryStrings", "metric", (d) => (d?.metric ? String(d.metric) : "(vazio)"));
      topStats.cacheStatuses = pick(z1, "cacheStatuses", "metric");
      topStats.browsers = pick(z1, "browsers", "metric");
      topStats.referers = pick(z1, "referers", "metric");

      topStats.methods = pick(z2, "methods", "metric");
      topStats.countries = pick(z2, "countries", "metric");
      topStats.xRequestedWith = pick(z2, "xRequestedWith", "metric", (d) => (d?.metric ? String(d.metric) : "(vazio)"));
      topStats.httpVersions = pick(z2, "httpVersions", "metric");
      topStats.dataCenters = pick(z2, "dataCenters", "metric");
      topStats.securitySources = pick(z2, "securitySources", "metric");
      topStats.securityActions = pick(z2, "securityActions", "metric");
      topStats.sslProtocols = pick(z2, "sslProtocols", "metric");

      return { ok: true, topStats, warning: warnings.length ? warnings.join(" | ") : null };
    } catch (e: any) {
      return { ok: false, error: e.message ?? String(e) };
    }
  });

// ─── getSecuritySampledLogs: linhas individuais, confirmadas via GetSecuritySampledLogs ──
export type SecuritySampledLog = {
  datetime: string;
  clientIP: string;
  clientCountryName: string;
  clientAsn: string;
  clientASNDescription: string;
  host: string;
  path: string;
  method: string;
  protocol: string;
  scheme: string;
  userAgent: string;
  referer: string;
  queryString: string;
  rayName: string;
  securityAction: string;
  securitySource: string;
  verifiedBotCategory: string;
  leakedCredentialCheckResult: string;
  cacheStatus: string;
  edgeResponseStatus: number;
  originResponseStatus: number;
  edgeResponseContentTypeName: string;
  xRequestedWith: string;
  wafAttackScoreClass: string;
  contentScanNumObj: number;
  contentScanNumMaliciousObj: number;
  contentScanObjTypes: string[];
};
export type SecuritySampledLogsResult = { ok: true; logs: SecuritySampledLog[]; warning?: string | null } | { ok: false; error: string };

export const getSecuritySampledLogs = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator(
    (input: { zoneId?: string | null; days?: number; filters?: unknown; kpi?: string; wafScore?: string; botDecision?: string } | undefined) => ({
      zoneId: input?.zoneId?.trim() || null,
      days: Math.min(Math.max(input?.days ?? 1, 1), 4),
      filters: filtersInputSchema.parse(input?.filters ?? []) as AnalyticsFilterCondition[],
      kpi: (["total", "mitigatedByWaf", "servedByCloudflare", "servedByOrigin"].includes(input?.kpi ?? "")
        ? input!.kpi
        : "total") as SecurityKpiKey,
      wafScore: typeof input?.wafScore === "string" && input.wafScore.trim() ? input.wafScore.trim() : (null as string | null),
      botDecision: typeof input?.botDecision === "string" && input.botDecision.trim() ? input.botDecision.trim() : (null as string | null),
    }),
  )
  .handler(async ({ data, context }): Promise<SecuritySampledLogsResult> => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "view_analytics_security");

    const ctx = await resolveSecurityContext(data.zoneId);
    if ("error" in ctx) return ctx;

    const until = new Date();
    const since = new Date(until.getTime() - data.days * 24 * 60 * 60 * 1000);
    const fc = buildAdaptiveFilterClause(data.filters, SECURITY_ANALYTICS_FILTER_FIELDS, "sl");
    const extraFilter = securityKpiExtraFilter(data.kpi);
    const wafScoreDecl = data.wafScore ? ",$wafScore:String" : "";
    const wafScoreFrag = data.wafScore ? `, wafAttackScoreClass:$wafScore` : "";
    const botDecisionDecl = data.botDecision ? ",$botDecision:String" : "";
    const botDecisionFrag = data.botDecision ? `, botManagementDecision:$botDecision` : "";

    const query = `query($zone:String!,$since:Time!,$until:Time!${fc.declarations}${wafScoreDecl}${botDecisionDecl}){
      viewer { zones(filter:{zoneTag:$zone}) {
        logs: httpRequestsAdaptive(filter:{datetime_geq:$since, datetime_leq:$until, requestSource:"eyeball"${fc.fragment}${extraFilter}${wafScoreFrag}${botDecisionFrag}}, limit:100, orderBy:["datetime_DESC"]) {
          leakedCredentialCheckResult
          cacheStatus
          clientASNDescription
          clientAsn
          clientCountryName
          clientIP
          clientRequestHTTPHost
          clientRequestHTTPMethodName
          clientRequestHTTPProtocol
          clientRequestPath
          clientRequestScheme
          userAgent
          securityAction
          securitySource
          datetime
          verifiedBotCategory
          rayName
          clientRequestReferer
          clientRequestQuery
          contentScanNumMaliciousObj
          contentScanNumObj
          contentScanObjTypes
          edgeResponseContentTypeName
          edgeResponseStatus
          xRequestedWith
          originResponseStatus
          wafAttackScoreClass
        }
      } } }`;

    try {
      const { zone, errors } = await gqlZonePartial(ctx.apiToken, query, {
        zone: ctx.zoneId,
        since: since.toISOString(),
        until: until.toISOString(),
        ...fc.variables,
        ...(data.wafScore ? { wafScore: data.wafScore } : {}),
        ...(data.botDecision ? { botDecision: data.botDecision } : {}),
      });
      const logs: SecuritySampledLog[] = ((zone.logs ?? []) as any[]).map((r) => ({
        datetime: String(r.datetime ?? ""),
        clientIP: String(r.clientIP ?? "—"),
        clientCountryName: String(r.clientCountryName ?? "—"),
        clientAsn: String(r.clientAsn ?? ""),
        clientASNDescription: String(r.clientASNDescription ?? ""),
        host: String(r.clientRequestHTTPHost ?? "—"),
        path: String(r.clientRequestPath ?? "/"),
        method: String(r.clientRequestHTTPMethodName ?? "—"),
        protocol: String(r.clientRequestHTTPProtocol ?? "—"),
        scheme: String(r.clientRequestScheme ?? "—"),
        userAgent: String(r.userAgent ?? "—"),
        referer: String(r.clientRequestReferer ?? ""),
        queryString: String(r.clientRequestQuery ?? ""),
        rayName: String(r.rayName ?? "—"),
        securityAction: String(r.securityAction ?? "—"),
        securitySource: String(r.securitySource ?? "—"),
        verifiedBotCategory: String(r.verifiedBotCategory ?? ""),
        leakedCredentialCheckResult: String(r.leakedCredentialCheckResult ?? ""),
        cacheStatus: String(r.cacheStatus ?? "—"),
        edgeResponseStatus: Number(r.edgeResponseStatus ?? 0),
        originResponseStatus: Number(r.originResponseStatus ?? 0),
        edgeResponseContentTypeName: String(r.edgeResponseContentTypeName ?? "—"),
        xRequestedWith: String(r.xRequestedWith ?? ""),
        wafAttackScoreClass: String(r.wafAttackScoreClass ?? "—"),
        contentScanNumObj: Number(r.contentScanNumObj ?? 0),
        contentScanNumMaliciousObj: Number(r.contentScanNumMaliciousObj ?? 0),
        contentScanObjTypes: Array.isArray(r.contentScanObjTypes) ? r.contentScanObjTypes.map(String) : [],
      }));
      return { ok: true, logs, warning: errors.length ? errors.join(" | ") : null };
    } catch (e: any) {
      return { ok: false, error: e.message ?? String(e) };
    }
  });

// ─── getSecurityRuleHitsForRay: "View related security events" do log ────────
// O dataset de Sampled logs da aba Traffic (httpRequestsAdaptive) não tem
// ruleId/ruleset — pra saber qual regra bateu numa requisição específica,
// a Cloudflare cruza pelo Ray ID no dataset de firewall (firewallEventsAdaptive),
// confirmado pelo painel nativo ("Security events" → RayID + Ruleset/Rule).
export type SecurityRuleHit = {
  action: string;
  source: string;
  ruleId: string;
  description: string;
  rulesetId: string;
  datetime: string;
};
export type SecurityRuleHitsResult = { ok: true; hits: SecurityRuleHit[] } | { ok: false; error: string };

export const getSecurityRuleHitsForRay = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId?: string | null; days?: number; rayName?: string } | undefined) => ({
    zoneId: input?.zoneId?.trim() || null,
    days: Math.min(Math.max(input?.days ?? 1, 1), 4),
    rayName: input?.rayName?.trim() || "",
  }))
  .handler(async ({ data, context }): Promise<SecurityRuleHitsResult> => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "view_analytics_security");

    if (!data.rayName) return { ok: false, error: "Ray ID ausente." };

    const ctx = await resolveSecurityContext(data.zoneId);
    if ("error" in ctx) return ctx;

    const until = new Date();
    const since = new Date(until.getTime() - data.days * 24 * 60 * 60 * 1000);

    const query = `query($zone:String!,$since:Time!,$until:Time!,$ray:String!){
      viewer { zones(filter:{zoneTag:$zone}) {
        hits: firewallEventsAdaptive(filter:{datetime_geq:$since, datetime_leq:$until, rayName:$ray}, limit:20, orderBy:["datetime_DESC"]) {
          action
          source
          ruleId
          description
          rulesetId
          datetime
        }
      } } }`;

    try {
      const { zone, errors } = await gqlZonePartial(ctx.apiToken, query, {
        zone: ctx.zoneId,
        since: since.toISOString(),
        until: until.toISOString(),
        ray: data.rayName,
      });
      const hits: SecurityRuleHit[] = ((zone.hits ?? []) as any[]).map((r) => ({
        action: String(r.action ?? "—"),
        source: String(r.source ?? "—"),
        ruleId: String(r.ruleId ?? "—"),
        description: String(r.description ?? ""),
        rulesetId: String(r.rulesetId ?? ""),
        datetime: String(r.datetime ?? ""),
      }));
      if (hits.length === 0 && errors.length) {
        return { ok: false, error: errors.join(" | ") };
      }
      return { ok: true, hits };
    } catch (e: any) {
      return { ok: false, error: e.message ?? String(e) };
    }
  });

// ─── getSecurityAttackAnalysis: "Request activity → Attack analysis" ─────────
// KPIs + gráfico por wafAttackScoreClass, confirmado via captura real
// (GetScoreDistributions, GetWafTimeseriesdatetimeHourScoreClass). Mesmo
// dataset/filtro base do "Traffic analysis" (httpRequestsAdaptiveGroups +
// requestSource:"eyeball" + securityFilters do "+ Add filter" compartilhado);
// os valores de wafAttackScoreClass vêm crus da própria API (nunca um enum
// fixo aqui), então clicar num KPI/legenda pra filtrar Top statistics/Sampled
// logs (via `wafScore` em getSecurityTopStats/getSecuritySampledLogs) sempre
// usa o valor real devolvido, mesmo que o rótulo amigável seja só uma
// tradução aproximada.
export type SecurityAttackScorePoint = { ts: string; [score: string]: number | string };
export type SecurityAttackAnalysisResult =
  | { ok: true; scoreTotals: Array<{ score: string; count: number }>; series: SecurityAttackScorePoint[] }
  | { ok: false; error: string };

export const getSecurityAttackAnalysis = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId?: string | null; days?: number; filters?: unknown } | undefined) => ({
    zoneId: input?.zoneId?.trim() || null,
    days: Math.min(Math.max(input?.days ?? 1, 1), 4),
    filters: filtersInputSchema.parse(input?.filters ?? []) as AnalyticsFilterCondition[],
  }))
  .handler(async ({ data, context }): Promise<SecurityAttackAnalysisResult> => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "view_analytics_security");

    const ctx = await resolveSecurityContext(data.zoneId);
    if ("error" in ctx) return ctx;

    const until = new Date();
    const since = new Date(until.getTime() - data.days * 24 * 60 * 60 * 1000);
    const fc = buildAdaptiveFilterClause(data.filters, SECURITY_ANALYTICS_FILTER_FIELDS, "aa");
    const base = `datetime_geq:$since, datetime_leq:$until, requestSource:"eyeball"${fc.fragment}`;

    const query = `query($zone:String!,$since:Time!,$until:Time!${fc.declarations}){
      viewer { zones(filter:{zoneTag:$zone}) {
        byScore: httpRequestsAdaptiveGroups(limit:100, orderBy:[wafAttackScoreClass_ASC], filter:{${base}}) { count dimensions { score: wafAttackScoreClass } }
        byScoreHour: httpRequestsAdaptiveGroups(limit:2000, orderBy:[datetimeHour_ASC], filter:{${base}}) { count dimensions { ts: datetimeHour score: wafAttackScoreClass } }
      } } }`;

    try {
      const { zone, errors } = await gqlZonePartial(ctx.apiToken, query, {
        zone: ctx.zoneId,
        since: since.toISOString(),
        until: until.toISOString(),
        ...fc.variables,
      });
      if (Object.keys(zone).length === 0 && errors.length) {
        return { ok: false, error: errors.join(" | ") };
      }

      const scoreTotals = ((zone.byScore ?? []) as any[]).map((r) => ({
        score: String(r.dimensions?.score ?? "unknown"),
        count: Number(r.count ?? 0),
      }));

      const byTs = new Map<string, Record<string, number>>();
      for (const r of (zone.byScoreHour ?? []) as any[]) {
        const ts = String(r.dimensions?.ts ?? "");
        const score = String(r.dimensions?.score ?? "unknown");
        const count = Number(r.count ?? 0);
        if (!ts) continue;
        const bucket = byTs.get(ts) ?? {};
        bucket[score] = (bucket[score] ?? 0) + count;
        byTs.set(ts, bucket);
      }
      const series: SecurityAttackScorePoint[] = Array.from(byTs.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([ts, scores]) => ({ ts, ...scores }));

      return { ok: true, scoreTotals, series };
    } catch (e: any) {
      return { ok: false, error: e.message ?? String(e) };
    }
  });

// ─── getSecurityBotAnalysis: "Request activity → Bot analysis" ───────────────
// KPIs + gráfico por botManagementDecision + "Requests by detection source"
// (botScoreSrcName), confirmado via captura real (BotScoreSourceQuery,
// GetBotTimeseries). Mesmo dataset/filtro base do "Traffic analysis", mais a
// exclusão de um IP de sonda/monitoramento própria da Cloudflare — presente
// nas duas queries reais capturadas, então replicada aqui literalmente.
const BOT_MONITOR_IP_EXCLUDE_GQL = `, clientIP_neq:"2a06:98c0:3600::103"`;

export type SecurityBotPoint = { ts: string; [decision: string]: number | string };
export type SecurityBotAnalysisResult =
  | {
      ok: true;
      total: number;
      decisionTotals: Array<{ decision: string; count: number }>;
      series: SecurityBotPoint[];
      detectionSources: Array<{ source: string; count: number }>;
    }
  | { ok: false; error: string };

export const getSecurityBotAnalysis = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId?: string | null; days?: number; filters?: unknown } | undefined) => ({
    zoneId: input?.zoneId?.trim() || null,
    days: Math.min(Math.max(input?.days ?? 1, 1), 4),
    filters: filtersInputSchema.parse(input?.filters ?? []) as AnalyticsFilterCondition[],
  }))
  .handler(async ({ data, context }): Promise<SecurityBotAnalysisResult> => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "view_analytics_security");

    const ctx = await resolveSecurityContext(data.zoneId);
    if ("error" in ctx) return ctx;

    const until = new Date();
    const since = new Date(until.getTime() - data.days * 24 * 60 * 60 * 1000);
    const fc = buildAdaptiveFilterClause(data.filters, SECURITY_ANALYTICS_FILTER_FIELDS, "ba");
    const base = `datetime_geq:$since, datetime_leq:$until, requestSource:"eyeball"${fc.fragment}${BOT_MONITOR_IP_EXCLUDE_GQL}`;

    const query = `query($zone:String!,$since:Time!,$until:Time!${fc.declarations}){
      viewer { zones(filter:{zoneTag:$zone}) {
        total: httpRequestsAdaptiveGroups(limit:1, filter:{${base}}) { count }
        byDecision: httpRequestsAdaptiveGroups(limit:5000, orderBy:[datetimeHour_ASC], filter:{${base}, botManagementDecision_neq:"other"}) { count dimensions { ts: datetimeHour decision: botManagementDecision } }
        bySource: httpRequestsAdaptiveGroups(limit:5, orderBy:[count_DESC], filter:{${base}}) { count dimensions { source: botScoreSrcName } }
      } } }`;

    try {
      const { zone, errors } = await gqlZonePartial(ctx.apiToken, query, {
        zone: ctx.zoneId,
        since: since.toISOString(),
        until: until.toISOString(),
        ...fc.variables,
      });
      if (Object.keys(zone).length === 0 && errors.length) {
        return { ok: false, error: errors.join(" | ") };
      }

      const byTsDecision = new Map<string, Record<string, number>>();
      const decisionTotals = new Map<string, number>();
      for (const r of (zone.byDecision ?? []) as any[]) {
        const decision = String(r.dimensions?.decision ?? "unknown");
        const ts = String(r.dimensions?.ts ?? "");
        const count = Number(r.count ?? 0);
        if (!ts) continue;
        const bucket = byTsDecision.get(ts) ?? {};
        bucket[decision] = (bucket[decision] ?? 0) + count;
        byTsDecision.set(ts, bucket);
        decisionTotals.set(decision, (decisionTotals.get(decision) ?? 0) + count);
      }
      const series: SecurityBotPoint[] = Array.from(byTsDecision.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([ts, decisions]) => ({ ts, ...decisions }));
      const decisionTotalsArr = Array.from(decisionTotals.entries()).map(([decision, count]) => ({ decision, count }));

      const detectionSources = ((zone.bySource ?? []) as any[]).map((r) => ({
        source: String(r.dimensions?.source ?? "unknown"),
        count: Number(r.count ?? 0),
      }));

      return {
        ok: true,
        total: Number(zone.total?.[0]?.count ?? 0),
        decisionTotals: decisionTotalsArr,
        series,
        detectionSources,
      };
    } catch (e: any) {
      return { ok: false, error: e.message ?? String(e) };
    }
  });

// ═══════════════════════════════════════════════════════════════════════════
// Events — aba "Events" da Security, dataset firewallEventsAdaptiveGroups/
// firewallEventsAdaptive (diferente da aba "Traffic", que usa
// httpRequestsAdaptiveGroups). Confirmado via captura real (HTTPDDoSSurveyQuery,
// FirewallEventActionTimeSeriesBydatetimeFifteenMinutesAndaction, TopSourceQuery,
// GetFirewallAnalyticsTopNs, ActivityLogQuery). Sem filtro composável ainda —
// os prints capturados não mostram "+ Add filter" nesta aba.
// ═══════════════════════════════════════════════════════════════════════════

// Filtro que a Cloudflare aplica pra contar só "ações reais" (exclui os
// sub-estados de challenge — solved/failed/bypassed — que não são a ação
// tomada, e restringe a regras "de verdade" via padrão de ruleId), confirmado
// literal na query real. Estático — não depende de filtro do usuário.
const EVENTS_NOISE_FILTER_GQL = `AND:[{action_neq:"challenge_solved"},{action_neq:"challenge_failed"},{action_neq:"challenge_bypassed"},{action_neq:"jschallenge_solved"},{action_neq:"jschallenge_failed"},{action_neq:"jschallenge_bypassed"},{action_neq:"managed_challenge_skipped"},{action_neq:"managed_challenge_non_interactive_solved"},{action_neq:"managed_challenge_interactive_solved"},{action_neq:"managed_challenge_bypassed"},{action_neq:"managed_challenge_failed"},{action_neq:"precursor_interstitial_page_bypassed"},{action_neq:"precursor_interstitial_page_solved"},{OR:[{ruleId_like:"999___"},{ruleId_like:"900___"},{ruleId:"981176"},{AND:[{ruleId_notlike:"9_____"},{ruleId_notlike:"uri-9_____"}]}]}]`;

// ─── getSecurityEventsOverview: KPIs por action + gráfico + Events by service ──
export type SecurityEventPoint = { ts: string; [action: string]: number | string };
export type SecurityEventsOverviewResult =
  | {
      ok: true;
      total: number;
      actionTotals: Array<{ action: string; count: number }>;
      series: SecurityEventPoint[];
      byService: Array<{ source: string; count: number }>;
    }
  | { ok: false; error: string };

export const getSecurityEventsOverview = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId?: string | null; days?: number; filters?: unknown } | undefined) => ({
    zoneId: input?.zoneId?.trim() || null,
    days: Math.min(Math.max(input?.days ?? 1, 1), 4),
    filters: filtersInputSchema.parse(input?.filters ?? []) as AnalyticsFilterCondition[],
  }))
  .handler(async ({ data, context }): Promise<SecurityEventsOverviewResult> => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "view_analytics_security");

    const ctx = await resolveSecurityContext(data.zoneId);
    if ("error" in ctx) return ctx;

    const until = new Date();
    const since = new Date(until.getTime() - data.days * 24 * 60 * 60 * 1000);
    const fc = buildAdaptiveFilterClause(data.filters, SECURITY_EVENTS_FILTER_FIELDS, "eo");
    const base = `datetime_geq:$since, datetime_leq:$until, ${EVENTS_NOISE_FILTER_GQL}${fc.fragment}`;

    const query = `query($zone:String!,$since:Time!,$until:Time!${fc.declarations}){
      viewer { zones(filter:{zoneTag:$zone}) {
        total: firewallEventsAdaptiveGroups(limit:1, filter:{${base}}) { count }
        byAction: firewallEventsAdaptiveGroups(limit:5000, orderBy:[datetimeFifteenMinutes_DESC], filter:{${base}}) { count dimensions { action ts: datetimeFifteenMinutes } }
        bySource: firewallEventsAdaptiveGroups(limit:20, orderBy:[count_DESC], filter:{${base}}) { count dimensions { source } }
      } } }`;

    try {
      const { zone, errors } = await gqlZonePartial(ctx.apiToken, query, {
        zone: ctx.zoneId,
        since: since.toISOString(),
        until: until.toISOString(),
        ...fc.variables,
      });
      if (Object.keys(zone).length === 0 && errors.length) {
        return { ok: false, error: errors.join(" | ") };
      }

      const byTsAction = new Map<string, Record<string, number>>();
      const actionTotals = new Map<string, number>();
      for (const r of (zone.byAction ?? []) as any[]) {
        const action = String(r.dimensions?.action ?? "unknown");
        const ts = String(r.dimensions?.ts ?? "");
        const count = Number(r.count ?? 0);
        if (!ts) continue;
        const bucket = byTsAction.get(ts) ?? {};
        bucket[action] = (bucket[action] ?? 0) + count;
        byTsAction.set(ts, bucket);
        actionTotals.set(action, (actionTotals.get(action) ?? 0) + count);
      }
      const series: SecurityEventPoint[] = Array.from(byTsAction.entries())
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([ts, actions]) => ({ ts, ...actions }));
      const actionTotalsArr = Array.from(actionTotals.entries())
        .map(([action, count]) => ({ action, count }))
        .sort((a, b) => b.count - a.count);
      const byService = ((zone.bySource ?? []) as any[])
        .map((r) => ({ source: String(r.dimensions?.source ?? "unknown"), count: Number(r.count ?? 0) }))
        .sort((a, b) => b.count - a.count);

      return {
        ok: true,
        total: Number(zone.total?.[0]?.count ?? 0),
        actionTotals: actionTotalsArr,
        series,
        byService,
      };
    } catch (e: any) {
      return { ok: false, error: e.message ?? String(e) };
    }
  });

// ─── getSecurityEventsTopStats: "Top events by source" ────────────────────────
export type SecurityEventsTopStatsKey =
  | "clientIPs"
  | "hosts"
  | "paths"
  | "asns"
  | "userAgents"
  | "referers"
  | "methods"
  | "countries"
  | "customRules"
  | "managedRules"
  | "ddosRules"
  | "rateLimitRules";
export type SecurityEventsTopStats = Partial<Record<SecurityEventsTopStatsKey, Array<{ value: string; count: number }>>>;
export type SecurityEventsTopStatsResult =
  | { ok: true; topStats: SecurityEventsTopStats; warning?: string | null }
  | { ok: false; error: string };

export const getSecurityEventsTopStats = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId?: string | null; days?: number; filters?: unknown } | undefined) => ({
    zoneId: input?.zoneId?.trim() || null,
    days: Math.min(Math.max(input?.days ?? 1, 1), 4),
    filters: filtersInputSchema.parse(input?.filters ?? []) as AnalyticsFilterCondition[],
  }))
  .handler(async ({ data, context }): Promise<SecurityEventsTopStatsResult> => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "view_analytics_security");

    const ctx = await resolveSecurityContext(data.zoneId);
    if ("error" in ctx) return ctx;

    const until = new Date();
    const since = new Date(until.getTime() - data.days * 24 * 60 * 60 * 1000);
    const fc = buildAdaptiveFilterClause(data.filters, SECURITY_EVENTS_FILTER_FIELDS, "et");
    const base = `datetime_geq:$since, datetime_leq:$until, ${EVENTS_NOISE_FILTER_GQL}${fc.fragment}`;

    function pick(zone: Record<string, any>, alias: string, map?: (d: any) => string) {
      return ((zone[alias] ?? []) as any[])
        .map((r) => ({ value: map ? map(r.dimensions) : String(r.dimensions?.metric ?? "—"), count: Number(r.count ?? 0) }))
        .filter((r) => r.value && r.value !== "—");
    }

    const query = `query($zone:String!,$since:Time!,$until:Time!${fc.declarations}){
      viewer { zones(filter:{zoneTag:$zone}) {
        clientIPs: firewallEventsAdaptiveGroups(limit:15, orderBy:[count_DESC], filter:{${base}}) { count dimensions { metric: clientIP } }
        hosts: firewallEventsAdaptiveGroups(limit:15, orderBy:[count_DESC], filter:{${base}}) { count dimensions { metric: clientRequestHTTPHost } }
        paths: firewallEventsAdaptiveGroups(limit:15, orderBy:[count_DESC], filter:{${base}}) { count dimensions { metric: clientRequestPath } }
        asns: firewallEventsAdaptiveGroups(limit:15, orderBy:[count_DESC], filter:{${base}}) { count dimensions { metric: clientAsn description: clientASNDescription } }
        userAgents: firewallEventsAdaptiveGroups(limit:15, orderBy:[count_DESC], filter:{${base}}) { count dimensions { metric: userAgent } }
        referers: firewallEventsAdaptiveGroups(limit:15, orderBy:[count_DESC], filter:{${base}}) { count dimensions { metric: clientRefererHost } }
        methods: firewallEventsAdaptiveGroups(limit:15, orderBy:[count_DESC], filter:{${base}}) { count dimensions { metric: clientRequestHTTPMethodName } }
        countries: firewallEventsAdaptiveGroups(limit:15, orderBy:[count_DESC], filter:{${base}}) { count dimensions { metric: clientCountryName } }
        customRules: firewallEventsAdaptiveGroups(limit:15, orderBy:[count_DESC], filter:{${base}, OR:[{source:"firewallrules"},{source:"firewallCustom"}]}) { count dimensions { metric: ruleId } }
        managedRules: firewallEventsAdaptiveGroups(limit:15, orderBy:[count_DESC], filter:{${base}, source:"firewallManaged"}) { count dimensions { metric: ruleId } }
        ddosRules: firewallEventsAdaptiveGroups(limit:15, orderBy:[count_DESC], filter:{${base}, source:"l7ddos"}) { count dimensions { metric: ruleId } }
        rateLimitRules: firewallEventsAdaptiveGroups(limit:15, orderBy:[count_DESC], filter:{${base}, source:"ratelimit"}) { count dimensions { metric: ruleId } }
      } } }`;

    try {
      const { zone, errors } = await gqlZonePartial(ctx.apiToken, query, {
        zone: ctx.zoneId,
        since: since.toISOString(),
        until: until.toISOString(),
        ...fc.variables,
      });

      const topStats: SecurityEventsTopStats = {
        clientIPs: pick(zone, "clientIPs"),
        hosts: pick(zone, "hosts"),
        paths: pick(zone, "paths"),
        asns: pick(zone, "asns", (d) => (d?.description ? `AS${d.metric} · ${d.description}` : `AS${d?.metric ?? "—"}`)),
        userAgents: pick(zone, "userAgents", (d) => String(d?.metric ?? "—").slice(0, 140)),
        referers: pick(zone, "referers"),
        methods: pick(zone, "methods"),
        countries: pick(zone, "countries"),
        customRules: pick(zone, "customRules"),
        managedRules: pick(zone, "managedRules"),
        ddosRules: pick(zone, "ddosRules"),
        rateLimitRules: pick(zone, "rateLimitRules"),
      };

      return { ok: true, topStats, warning: errors.length ? errors.join(" | ") : null };
    } catch (e: any) {
      return { ok: false, error: e.message ?? String(e) };
    }
  });

// ─── getSecurityEventsSampledLogs: linhas individuais (firewallEventsAdaptive) ─
export type SecurityEventLog = {
  datetime: string;
  action: string;
  source: string;
  ruleId: string;
  description: string;
  rulesetId: string;
  clientIP: string;
  clientCountryName: string;
  clientAsn: string;
  clientASNDescription: string;
  host: string;
  path: string;
  method: string;
  protocol: string;
  userAgent: string;
  referer: string;
  queryString: string;
  rayName: string;
  wafAttackScoreClass: string;
  contentScanObjTypes: string[];
  metadata: Array<{ key: string; value: string }>;
};
export type SecurityEventLogsResult = { ok: true; logs: SecurityEventLog[]; warning?: string | null } | { ok: false; error: string };

export const getSecurityEventsSampledLogs = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId?: string | null; days?: number; filters?: unknown } | undefined) => ({
    zoneId: input?.zoneId?.trim() || null,
    days: Math.min(Math.max(input?.days ?? 1, 1), 4),
    filters: filtersInputSchema.parse(input?.filters ?? []) as AnalyticsFilterCondition[],
  }))
  .handler(async ({ data, context }): Promise<SecurityEventLogsResult> => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "view_analytics_security");

    const ctx = await resolveSecurityContext(data.zoneId);
    if ("error" in ctx) return ctx;

    const until = new Date();
    const since = new Date(until.getTime() - data.days * 24 * 60 * 60 * 1000);
    const fc = buildAdaptiveFilterClause(data.filters, SECURITY_EVENTS_FILTER_FIELDS, "el");

    const query = `query($zone:String!,$since:Time!,$until:Time!${fc.declarations}){
      viewer { zones(filter:{zoneTag:$zone}) {
        logs: firewallEventsAdaptive(filter:{datetime_geq:$since, datetime_leq:$until, ${EVENTS_NOISE_FILTER_GQL}${fc.fragment}}, limit:100, orderBy:["datetime_DESC"]) {
          action
          clientASNDescription
          clientAsn
          clientCountryName
          clientIP
          clientRefererHost
          clientRequestHTTPHost
          clientRequestHTTPMethodName
          clientRequestHTTPProtocol
          clientRequestPath
          clientRequestQuery
          contentScanObjTypes
          datetime
          rayName
          ruleId
          description
          rulesetId
          source
          userAgent
          wafAttackScoreClass
          metadata { key value }
        }
      } } }`;

    try {
      const { zone, errors } = await gqlZonePartial(ctx.apiToken, query, {
        zone: ctx.zoneId,
        since: since.toISOString(),
        until: until.toISOString(),
        ...fc.variables,
      });
      const logs: SecurityEventLog[] = ((zone.logs ?? []) as any[]).map((r) => ({
        datetime: String(r.datetime ?? ""),
        action: String(r.action ?? "—"),
        source: String(r.source ?? "—"),
        ruleId: String(r.ruleId ?? "—"),
        description: String(r.description ?? ""),
        rulesetId: String(r.rulesetId ?? ""),
        clientIP: String(r.clientIP ?? "—"),
        clientCountryName: String(r.clientCountryName ?? "—"),
        clientAsn: String(r.clientAsn ?? ""),
        clientASNDescription: String(r.clientASNDescription ?? ""),
        host: String(r.clientRequestHTTPHost ?? "—"),
        path: String(r.clientRequestPath ?? "/"),
        method: String(r.clientRequestHTTPMethodName ?? "—"),
        protocol: String(r.clientRequestHTTPProtocol ?? "—"),
        userAgent: String(r.userAgent ?? "—"),
        referer: String(r.clientRefererHost ?? ""),
        queryString: String(r.clientRequestQuery ?? ""),
        rayName: String(r.rayName ?? "—"),
        wafAttackScoreClass: String(r.wafAttackScoreClass ?? "—"),
        contentScanObjTypes: Array.isArray(r.contentScanObjTypes) ? r.contentScanObjTypes.map(String) : [],
        metadata: Array.isArray(r.metadata) ? r.metadata.map((m: any) => ({ key: String(m?.key ?? ""), value: String(m?.value ?? "") })) : [],
      }));
      return { ok: true, logs, warning: errors.length ? errors.join(" | ") : null };
    } catch (e: any) {
      return { ok: false, error: e.message ?? String(e) };
    }
  });
