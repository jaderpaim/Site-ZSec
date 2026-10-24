import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { requirePermission } from "@/lib/authz";
import {
  type AnalyticsFilterCondition,
  HTTP_TRAFFIC_FILTER_FIELDS,
  SECURITY_FILTER_FIELDS,
  buildAdaptiveFilterClause,
  applySupabaseFilterConditions,
  filtersInputSchema,
} from "@/lib/cloudflare.analytics-filters";
import { readSecret } from "@/lib/crypto.server";
import { cfGraphql } from "@/lib/cloudflare-plan";

// ─── Supabase client factory (service_role para bypassar RLS server-side) ─────
function makeSupabase() {
  const url = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY!;
  // Prefer service role (server-only) so leituras não sejam filtradas por RLS
  // que exige `authenticated`. Fallback para anon apenas se service não estiver setado.
  return createClient(url, serviceKey || anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// ─── Types ─────────────────────────────────────────────────────────────────────

export type CloudflareAnalytics = {
  ok: true;
  range: { since: string; until: string; days: number };
  totals: {
    requests: number;
    mitigated: number;
    cached: number;
    bytes: number;
    uniqueIps: number;
  };
  proxy: { proxied: number; unproxied: number };
  domains: { zones: number; dnsRecords: number; subdomains: number };
  topUrls: Array<{ host: string; path: string; requests: number }>;
  topHosts: Array<{ host: string; requests: number }>;
  topIps: Array<{ ip: string; country: string; requests: number }>;
  topCountries: Array<{ country: string; code: string; requests: number }>;
  securityActions: Array<{ action: string; count: number }>;
  sampleLogs: Array<{
    datetime: string;
    action: string;
    clientIP: string;
    country: string;
    host: string;
    path: string;
    method: string;
    userAgent: string;
    ruleId: string;
    rayId: string;
  }>;
  timeseries: Array<{ t: string; requests: number; mitigated: number; cached: number; bytes: number; skip: number }>;
  hostsByBucket: Record<string, Array<{ host: string; count: number }>>;
  skipByHost: Array<{ host: string; count: number }>;
  history: Array<{ captured_at: string; requests: number; mitigated: number; skip: number }>;
  filterAction: string | null;
  lastSyncAt: string | null;
  warning?: string | null;
  /** Grid "Top statistics" (Host/Path/Country/Status/ASN/Cache/Device/Query) — só a aba Analytics/HTTP Traffic consome isso; o Dashboard ignora. */
  topStats?: HttpTopStats;
  securityTopStats?: SecurityTopStats;
};

export type CloudflareAnalyticsError = { ok: false; error: string };

// ─── getCloudflareAnalytics ────────────────────────────────────────────────────

export const getCloudflareAnalytics = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { days?: number; action?: string | null; zoneId?: string | null } | undefined) => ({
    days: Math.min(Math.max(input?.days ?? 3, 1), 90),
    action: input?.action ?? null,
    zoneId: input?.zoneId?.trim() || null,
  }))
  .handler(async ({ data, context }): Promise<CloudflareAnalytics | CloudflareAnalyticsError> => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "view");
    return fetchCloudflareAnalyticsCore(data);
  });

// ─── fetchCloudflareAnalyticsCore ───────────────────────────────────────────────
// Lógica de busca compartilhada entre getCloudflareAnalytics (aba Dashboard,
// devolve tudo) e as variantes por seção da aba Analytics (getHttpTrafficAnalytics /
// getSecurityAnalytics), que checam sua própria permissão e recortam a resposta —
// evita duplicar o caminho GraphQL ao vivo + fallback no Postgres.
async function fetchCloudflareAnalyticsCore(data: {
  days: number;
  action: string | null;
  zoneId: string | null;
  filters?: AnalyticsFilterCondition[];
}): Promise<CloudflareAnalytics | CloudflareAnalyticsError> {
  const supabase = makeSupabase();
  const until = new Date();
  const since = new Date(until.getTime() - data.days * 24 * 60 * 60 * 1000);
  const sinceIso = since.toISOString();
  const untilIso = until.toISOString();
  // `action` legado convertido numa condição de filtro — único caminho de
  // aplicação de filtro tanto pro GraphQL (live) quanto pro Supabase (banco).
  const mergedFilters: AnalyticsFilterCondition[] = [
    ...(data.filters ?? []),
    ...(data.action ? [{ field: "action", op: "eq" as const, value: data.action }] : []),
  ];

  try {
    // Totais globais de domínios/subdomínios (sempre todas as zonas)
    const [{ count: zonesCount }, dnsCounts] = await Promise.all([
      supabase.from("cloudflare_zones").select("id", { count: "exact", head: true }),
      supabase.from("cloudflare_dns_records").select("name, type, proxied, zone_id"),
    ]);
    const allDns = dnsCounts.data ?? [];
    const subdomainSet = new Set<string>();
    for (const r of allDns) {
      if (["A", "AAAA", "CNAME"].includes(String(r.type).toUpperCase())) {
        subdomainSet.add(String(r.name).toLowerCase());
      }
    }

    // Caminho LIVE: zona selecionada e janela curta (1-4 dias) → GraphQL direto na API
    if (data.zoneId && data.days <= 4) {
      const { data: integ, error: integErr } = await supabase
        .from("integrations")
        .select("api_key, enabled")
        .eq("provider", "cloudflare")
        .maybeSingle();
      if (integErr) throw new Error(integErr.message);
      if (!integ?.enabled) return { ok: false, error: "Integração Cloudflare não está ativa." };
      if (!integ?.api_key) return { ok: false, error: "API Token da Cloudflare não configurado." };

      const live = await fetchLiveAnalytics(readSecret(integ.api_key), data.zoneId, sinceIso, untilIso, data.days, mergedFilters);

      // sample logs do banco para a zona escolhida
      let logQ = supabase
        .from("cloudflare_firewall_events")
        .select("datetime, action, client_ip, country, host, path, method, user_agent, rule_id, raw")
        .eq("zone_id", data.zoneId)
        .gte("datetime", sinceIso)
        .lte("datetime", untilIso)
        .order("datetime", { ascending: false })
        .limit(100);
      logQ = applySupabaseFilterConditions(logQ, mergedFilters, SECURITY_FILTER_FIELDS).query;
      const { data: logRows } = await logQ;

      // Proxy: usa requisições servidas pelo proxy/cache CDN vs origem (varia por período).
      const cached = Number(live.totals?.cached ?? 0);
      const totalReq = Number(live.totals?.requests ?? 0);
      const proxied = cached;
      const unproxied = Math.max(0, totalReq - cached);

      const { data: hist } = await supabase
        .from("cloudflare_snapshots")
        .select("captured_at, payload")
        .eq("zone_id", data.zoneId)
        .order("captured_at", { ascending: false })
        .limit(200);

      // Reverte para ordem cronológica para o gráfico
      const history = (hist ?? []).reverse().map((row: any) => ({
        captured_at: String(row.captured_at),
        requests: Number(row.payload?.totals?.requests ?? 0),
        mitigated: Number(row.payload?.totals?.mitigated ?? 0),
        skip: Number(row.payload?.totals?.skip ?? 0),
      }));

      const { data: state } = await supabase
        .from("cloudflare_sync_state")
        .select("last_events_at, updated_at")
        .eq("account_id", "default")
        .eq("zone_id", data.zoneId)
        .maybeSingle();

      const result = {
        ok: true as const,
        range: { since: sinceIso, until: untilIso, days: data.days },
        totals: live.totals,
        proxy: { proxied, unproxied },
        domains: {
          zones: data.zoneId ? 1 : (zonesCount ?? 0),
          dnsRecords: data.zoneId ? allDns.filter((r) => r.zone_id === data.zoneId).length : allDns.length,
          subdomains: (() => {
            const src = data.zoneId ? allDns.filter((r) => r.zone_id === data.zoneId) : allDns;
            const s = new Set<string>();
            for (const r of src) {
              if (["A", "AAAA", "CNAME"].includes(String(r.type).toUpperCase())) {
                s.add(String(r.name).toLowerCase());
              }
            }
            return s.size;
          })(),
        },
        topUrls: live.topUrls,
        topHosts: live.topHosts,
        topIps: live.topIps,
        topCountries: live.topCountries,
        securityActions: live.securityActions,
        sampleLogs: (logRows ?? []).map((e: any) => ({
          datetime: String(e.datetime),
          action: String(e.action ?? "—"),
          clientIP: String(e.client_ip ?? "—"),
          country: String(e.country ?? "—"),
          host: String(e.host ?? "—"),
          path: String(e.path ?? "/"),
          method: String(e.method ?? "GET"),
          userAgent: String(e.user_agent ?? "").slice(0, 120),
          ruleId: String(e.rule_id ?? "—"),
          rayId: String(e.raw?.rayName ?? "—"),
        })),
        timeseries: live.timeseries,
        hostsByBucket: live.hostsByBucket ?? {},
        skipByHost: live.skipByHost ?? [],
        history,
        filterAction: data.action ?? null,
        topStats: live.topStats,
        securityTopStats: live.securityTopStats,
        lastSyncAt: state?.last_events_at ?? state?.updated_at ?? null,
        warning: live.warnings?.length
          ? `Algumas métricas indisponíveis para esta zona: ${live.warnings.join(" | ")}`
          : null,
      };

      // Persiste snapshot com skip — máximo 1 por hora por zona/período
      try {
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
        const { data: recent } = await supabase
          .from("cloudflare_snapshots")
          .select("captured_at")
          .eq("zone_id", data.zoneId)
          .gte("captured_at", oneHourAgo)
          .limit(1)
          .maybeSingle();

        if (!recent) {
          const skipTotal = (live.securityActions ?? [])
            .filter((a: any) => String(a.action).toLowerCase() === "skip")
            .reduce((s: number, a: any) => s + Number(a.count ?? 0), 0);
          await supabase.from("cloudflare_snapshots").insert({
            zone_id: data.zoneId,
            range_days: data.days,
            payload: {
              totals: {
                requests: live.totals?.requests ?? 0,
                mitigated: live.totals?.mitigated ?? 0,
                cached: live.totals?.cached ?? 0,
                skip: skipTotal,
              },
              range: { since: sinceIso, until: untilIso },
            },
          });
        }
      } catch {
        /* ignora erro de snapshot */
      }

      return result;
    }

    // Caminho banco: agrega eventos sincronizados. Filtra por zona se selecionada
    // (usado para janelas > 3 dias mesmo com zona, e para "todas as zonas").
    let evQuery = supabase
      .from("cloudflare_firewall_events")
      .select("datetime, action, client_ip, country, host, path, method, user_agent, rule_id, raw")
      .gte("datetime", sinceIso)
      .lte("datetime", untilIso)
      .order("datetime", { ascending: false })
      .limit(50000);
    if (data.zoneId) evQuery = evQuery.eq("zone_id", data.zoneId);
    const { query: filteredEvQuery, warnings: dbFilterWarnings } = applySupabaseFilterConditions(
      evQuery,
      mergedFilters,
      SECURITY_FILTER_FIELDS,
    );
    const { data: events, error: evErr } = await filteredEvQuery;
    if (evErr) throw new Error(evErr.message);

    const evs = events ?? [];
    const totalsReq = evs.length;
    const mitigated = evs.filter((e) =>
      ["block", "challenge", "managed_challenge", "js_challenge"].includes(String(e.action).toLowerCase()),
    ).length;

    const byHost = new Map<string, number>();
    const byCountry = new Map<string, number>();
    const byIp = new Map<string, { country: string; n: number }>();
    const byAction = new Map<string, number>();
    const byUrl = new Map<string, { host: string; path: string; n: number }>();
    const byUserAgent = new Map<string, number>();
    const byRuleId = new Map<string, number>();
    for (const e of evs) {
      const h = e.host || "—";
      byHost.set(h, (byHost.get(h) ?? 0) + 1);
      const c = e.country || "—";
      byCountry.set(c, (byCountry.get(c) ?? 0) + 1);
      const ip = e.client_ip || "—";
      const cur = byIp.get(ip) ?? { country: c, n: 0 };
      cur.n += 1;
      byIp.set(ip, cur);
      const a = e.action || "log";
      byAction.set(a, (byAction.get(a) ?? 0) + 1);
      const key = `${h}|${e.path || "/"}`;
      const u = byUrl.get(key) ?? { host: h, path: e.path || "/", n: 0 };
      u.n += 1;
      byUrl.set(key, u);
      if (e.user_agent) byUserAgent.set(e.user_agent, (byUserAgent.get(e.user_agent) ?? 0) + 1);
      if (e.rule_id) byRuleId.set(e.rule_id, (byRuleId.get(e.rule_id) ?? 0) + 1);
    }

    const bucketHours = data.days <= 3 ? 1 : data.days <= 14 ? 6 : 24;
    const buckets = new Map<string, { requests: number; mitigated: number; skip: number }>();
    const hostsPerBucket = new Map<string, Map<string, number>>();
    const skipByHostMap = new Map<string, number>();
    for (const e of evs) {
      const d = new Date(e.datetime);
      d.setMinutes(0, 0, 0);
      d.setHours(Math.floor(d.getHours() / bucketHours) * bucketHours);
      const key = d.toISOString();
      const b = buckets.get(key) ?? { requests: 0, mitigated: 0, skip: 0 };
      b.requests += 1;
      const act = String(e.action).toLowerCase();
      if (["block", "challenge", "managed_challenge", "js_challenge"].includes(act)) {
        b.mitigated += 1;
      }
      if (act === "skip") {
        b.skip += 1;
        const h = e.host || "—";
        skipByHostMap.set(h, (skipByHostMap.get(h) ?? 0) + 1);
      }
      buckets.set(key, b);
      // top FQDNs por bucket (para tooltip do Traffic Analyzer)
      const h = e.host || "—";
      const hm = hostsPerBucket.get(key) ?? new Map<string, number>();
      hm.set(h, (hm.get(h) ?? 0) + 1);
      hostsPerBucket.set(key, hm);
    }
    const timeseries = Array.from(buckets.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([t, v]) => ({ t, requests: v.requests, mitigated: v.mitigated, cached: 0, bytes: 0, skip: v.skip }));
    const hostsByBucket: Record<string, Array<{ host: string; count: number }>> = {};
    for (const [k, hm] of hostsPerBucket.entries()) {
      hostsByBucket[k] = Array.from(hm.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([host, count]) => ({ host, count }));
    }
    const skipByHost = Array.from(skipByHostMap.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([host, count]) => ({ host, count }));

    let histQ = supabase
      .from("cloudflare_snapshots")
      .select("captured_at, payload, zone_id")
      .order("captured_at", { ascending: true })
      .limit(200);
    if (data.zoneId) histQ = histQ.eq("zone_id", data.zoneId);
    const { data: hist } = await histQ;

    const history = (hist ?? []).map((row: any) => ({
      captured_at: String(row.captured_at),
      requests: Number(row.payload?.totals?.requests ?? 0),
      mitigated: Number(row.payload?.totals?.mitigated ?? 0),
      skip: Number(row.payload?.totals?.skip ?? 0),
    }));

    let stateQ = supabase
      .from("cloudflare_sync_state")
      .select("last_events_at, updated_at")
      .eq("account_id", "default")
      .order("updated_at", { ascending: false })
      .limit(1);
    if (data.zoneId) stateQ = stateQ.eq("zone_id", data.zoneId);
    const { data: stateRows } = await stateQ;
    const state = stateRows?.[0] ?? null;

    return {
      ok: true,
      range: { since: sinceIso, until: untilIso, days: data.days },
      totals: { requests: totalsReq, mitigated, cached: 0, bytes: 0, uniqueIps: byIp.size },
      proxy: (() => {
        const src = data.zoneId ? allDns.filter((r) => r.zone_id === data.zoneId) : allDns;
        return {
          proxied: src.filter((r) => r.proxied === true).length,
          unproxied: src.filter((r) => r.proxied === false).length,
        };
      })(),
      domains: {
        zones: data.zoneId ? 1 : (zonesCount ?? 0),
        dnsRecords: data.zoneId ? allDns.filter((r) => r.zone_id === data.zoneId).length : allDns.length,
        subdomains: (() => {
          const src = data.zoneId ? allDns.filter((r) => r.zone_id === data.zoneId) : allDns;
          const s = new Set<string>();
          for (const r of src) {
            if (["A", "AAAA", "CNAME"].includes(String(r.type).toUpperCase())) {
              s.add(String(r.name).toLowerCase());
            }
          }
          return s.size;
        })(),
      },
      topUrls: Array.from(byUrl.values())
        .sort((a, b) => b.n - a.n)
        .slice(0, 10)
        .map((u) => ({ host: u.host, path: u.path, requests: u.n })),
      topHosts: Array.from(byHost.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([host, requests]) => ({ host, requests })),
      topIps: Array.from(byIp.entries())
        .sort((a, b) => b[1].n - a[1].n)
        .slice(0, 10)
        .map(([ip, v]) => ({ ip, country: v.country, requests: v.n })),
      topCountries: Array.from(byCountry.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 15)
        .map(([country, requests]) => ({ country, code: country.slice(0, 2).toUpperCase(), requests })),
      securityActions: Array.from(byAction.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([action, count]) => ({ action, count })),
      sampleLogs: evs.slice(0, 100).map((e: any) => ({
        datetime: String(e.datetime),
        action: String(e.action ?? "—"),
        clientIP: String(e.client_ip ?? "—"),
        country: String(e.country ?? "—"),
        host: String(e.host ?? "—"),
        path: String(e.path ?? "/"),
        method: String(e.method ?? "GET"),
        userAgent: String(e.user_agent ?? "").slice(0, 120),
        ruleId: String(e.rule_id ?? "—"),
        rayId: String(e.raw?.rayName ?? "—"),
      })),
      timeseries,
      hostsByBucket,
      skipByHost,
      history,
      filterAction: data.action ?? null,
      // Fora da janela "live" só host/path/country têm coluna sincronizada
      // (ver pgColumn em cloudflare.analytics-filters.ts) — os demais campos
      // do grid (status code, ASN, cache status, device type, query string)
      // ficam ausentes aqui de propósito, não é bug.
      topStats: {
        host: Array.from(byHost.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([value, requests]) => ({ value, requests })),
        path: Array.from(byUrl.values())
          .sort((a, b) => b.n - a.n)
          .slice(0, 10)
          .map((u) => ({ value: `${u.host}${u.path}`, requests: u.n })),
        sourceIp: Array.from(byIp.entries())
          .sort((a, b) => b[1].n - a[1].n)
          .slice(0, 10)
          .map(([ip, v]) => ({ value: `${ip} · ${v.country}`, requests: v.n })),
        country: Array.from(byCountry.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 15)
          .map(([value, requests]) => ({ value, requests })),
      },
      securityTopStats: {
        userAgent: Array.from(byUserAgent.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([value, requests]) => ({ value: value.slice(0, 140), requests })),
        ruleId: Array.from(byRuleId.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 10)
          .map(([value, requests]) => ({ value, requests })),
      },
      lastSyncAt: state?.last_events_at ?? state?.updated_at ?? null,
      warning: dbFilterWarnings.length ? dbFilterWarnings.join(" | ") : null,
    };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// ─── Types por seção (aba Analytics) ────────────────────────────────────────────

export type HttpTrafficAnalytics = {
  ok: true;
  range: { since: string; until: string; days: number };
  totals: { requests: number; cached: number; bytes: number; uniqueIps: number };
  // Só preenchido na janela "live" (zona + ≤4 dias) — período anterior de mesma
  // duração, pra mostrar a setinha de tendência nos KPIs (mesmo padrão do RUM).
  requestsDeltaPct: number | null;
  bytesDeltaPct: number | null;
  // Visits/Page views/API requests — confirmados via captura da query real do
  // dash Cloudflare (GetZoneTopNs + ZapSparklineBydatetimeFifteenMinutes):
  // TUDO vem de httpRequestsAdaptiveGroups filtrado por requestSource:"eyeball",
  // NÃO do RUM (rumPageloadEventsAdaptiveGroups) — são conceitos parecidos mas
  // fontes/números diferentes do relatório Web Analytics. Só na janela "live".
  visits: number;
  visitsDeltaPct: number | null;
  visitsSeries: Array<{ ts: string; visits: number }>;
  pageViews: number;
  pageViewsDeltaPct: number | null;
  pageViewsSeries: Array<{ ts: string; views: number }>;
  apiRequests: number;
  apiRequestsDeltaPct: number | null;
  apiRequestsSeries: Array<{ ts: string; requests: number }>;
  proxy: { proxied: number; unproxied: number };
  domains: { zones: number; dnsRecords: number; subdomains: number };
  topUrls: Array<{ host: string; path: string; requests: number }>;
  topHosts: Array<{ host: string; requests: number }>;
  topCountries: Array<{ country: string; code: string; requests: number }>;
  timeseries: Array<{ t: string; requests: number; cached: number; bytes: number }>;
  hostsByBucket: Record<string, Array<{ host: string; count: number }>>;
  history: Array<{ captured_at: string; requests: number }>;
  lastSyncAt: string | null;
  warning?: string | null;
  topStats: HttpTopStats;
  /** true = janela "live" (zona + ≤4 dias) — só nela os campos além de host/path/country vêm preenchidos. */
  live: boolean;
};
export type HttpTrafficAnalyticsError = { ok: false; error: string };

export type SecurityAnalytics = {
  ok: true;
  range: { since: string; until: string; days: number };
  totals: { requests: number; mitigated: number };
  securityActions: Array<{ action: string; count: number }>;
  topIps: Array<{ ip: string; country: string; requests: number }>;
  sampleLogs: Array<{
    datetime: string;
    action: string;
    clientIP: string;
    country: string;
    host: string;
    path: string;
    method: string;
    userAgent: string;
    ruleId: string;
    rayId: string;
  }>;
  skipByHost: Array<{ host: string; count: number }>;
  timeseries: Array<{ t: string; mitigated: number; skip: number }>;
  history: Array<{ captured_at: string; mitigated: number; skip: number }>;
  lastSyncAt: string | null;
  warning?: string | null;
  topStats: SecurityTopStats;
};
export type SecurityAnalyticsError = { ok: false; error: string };

// ─── getHttpTrafficAnalytics (aba Analytics — sub-aba HTTP Traffic) ────────────

export const getHttpTrafficAnalytics = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { days?: number; zoneId?: string | null; filters?: unknown } | undefined) => ({
    days: Math.min(Math.max(input?.days ?? 3, 1), 90),
    zoneId: input?.zoneId?.trim() || null,
    filters: filtersInputSchema.parse(input?.filters ?? []),
  }))
  .handler(async ({ data, context }): Promise<HttpTrafficAnalytics | HttpTrafficAnalyticsError> => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "view_analytics_http");
    const full = await fetchCloudflareAnalyticsCore({
      days: data.days,
      action: null,
      zoneId: data.zoneId,
      filters: data.filters,
    });
    if (!full.ok) return full;

    // Setinha de tendência + Visits/Page views/API requests: só na janela "live"
    // (zona + ≤4 dias) — consulta isolada e independente de
    // fetchCloudflareAnalyticsCore (não altera o caminho compartilhado com
    // Dashboard/Security). Se falhar, os KPIs continuam funcionando, só sem
    // esses 3 e sem a seta.
    let requestsDeltaPct: number | null = null;
    let bytesDeltaPct: number | null = null;
    let visits = 0;
    let visitsDeltaPct: number | null = null;
    let visitsSeries: Array<{ ts: string; visits: number }> = [];
    let pageViews = 0;
    let pageViewsDeltaPct: number | null = null;
    let pageViewsSeries: Array<{ ts: string; views: number }> = [];
    let apiRequests = 0;
    let apiRequestsDeltaPct: number | null = null;
    let apiRequestsSeries: Array<{ ts: string; requests: number }> = [];
    if (data.zoneId && data.days <= 4) {
      try {
        const supabase = makeSupabase();
        const { data: integ } = await supabase
          .from("integrations")
          .select("api_key, enabled")
          .eq("provider", "cloudflare")
          .maybeSingle();
        if (integ?.enabled && readSecret(integ?.api_key)) {
          const until = new Date(full.range.until);
          const since = new Date(full.range.since);
          const rangeMs = until.getTime() - since.getTime();
          const sinceIso = since.toISOString();
          const untilIso = until.toISOString();
          const prevSinceIso = new Date(since.getTime() - rangeMs).toISOString();
          const prevUntilIso = sinceIso;

          // Visits/Page views/API requests — nomes de campo e filtros confirmados
          // via captura das queries reais do dash Cloudflare (GetZoneTopNs +
          // ZapSparklineBydatetimeFifteenMinutes): tudo em httpRequestsAdaptiveGroups
          // filtrado por requestSource:"eyeball" (exclui bots/crawlers).
          const fc = buildAdaptiveFilterClause(data.filters, HTTP_TRAFFIC_FILTER_FIELDS, "vk");
          const eyeball = `requestSource:"eyeball"${fc.fragment}`;
          const pageviewExtra = `${eyeball}, edgeResponseStatus:200, edgeResponseContentTypeName:"html"`;
          const apiExtra = `${eyeball}, OR:[{edgeResponseContentTypeName:"json"},{edgeResponseContentTypeName:"xml"},{edgeResponseContentTypeName:"grpc"},{edgeResponseContentTypeName:"grpcweb"}]`;

          const zone = await gqlZone(
            readSecret(integ.api_key),
            `query($zone:String!,$since:Time!,$until:Time!,$prevSince:Time!,$prevUntil:Time!${fc.declarations}){
              viewer { zones(filter:{zoneTag:$zone}) {
                prevTotals: httpRequests1hGroups(limit:1, filter:{datetime_geq:$prevSince, datetime_leq:$prevUntil}) {
                  sum { requests bytes }
                }
                visitsTotal: httpRequestsAdaptiveGroups(limit:1, filter:{datetime_geq:$since, datetime_leq:$until, ${eyeball}}) {
                  sum { visits }
                }
                visitsPrev: httpRequestsAdaptiveGroups(limit:1, filter:{datetime_geq:$prevSince, datetime_leq:$prevUntil, ${eyeball}}) {
                  sum { visits }
                }
                visitsSeries: httpRequestsAdaptiveGroups(limit:2000, filter:{datetime_geq:$since, datetime_leq:$until, ${eyeball}}) {
                  sum { visits }
                  dimensions { ts: datetimeFifteenMinutes }
                }
                pageviewsTotal: httpRequestsAdaptiveGroups(limit:1, filter:{datetime_geq:$since, datetime_leq:$until, ${pageviewExtra}}) {
                  count
                }
                pageviewsPrev: httpRequestsAdaptiveGroups(limit:1, filter:{datetime_geq:$prevSince, datetime_leq:$prevUntil, ${pageviewExtra}}) {
                  count
                }
                pageviewsSeries: httpRequestsAdaptiveGroups(limit:2000, filter:{datetime_geq:$since, datetime_leq:$until, ${pageviewExtra}}) {
                  count
                  dimensions { ts: datetimeFifteenMinutes }
                }
                apiTotal: httpRequestsAdaptiveGroups(limit:1, filter:{datetime_geq:$since, datetime_leq:$until, ${apiExtra}}) {
                  count
                }
                apiPrev: httpRequestsAdaptiveGroups(limit:1, filter:{datetime_geq:$prevSince, datetime_leq:$prevUntil, ${apiExtra}}) {
                  count
                }
                apiSeries: httpRequestsAdaptiveGroups(limit:2000, filter:{datetime_geq:$since, datetime_leq:$until, ${apiExtra}}) {
                  count
                  dimensions { ts: datetimeFifteenMinutes }
                }
              } } }`,
            {
              zone: data.zoneId,
              since: sinceIso,
              until: untilIso,
              prevSince: prevSinceIso,
              prevUntil: prevUntilIso,
              ...fc.variables,
            },
          );

          const prevRequests = Number(zone.prevTotals?.[0]?.sum?.requests ?? 0);
          const prevBytes = Number(zone.prevTotals?.[0]?.sum?.bytes ?? 0);
          requestsDeltaPct = prevRequests > 0 ? ((full.totals.requests - prevRequests) / prevRequests) * 100 : null;
          bytesDeltaPct = prevBytes > 0 ? ((full.totals.bytes - prevBytes) / prevBytes) * 100 : null;

          visits = Number(zone.visitsTotal?.[0]?.sum?.visits ?? 0);
          const prevVisits = Number(zone.visitsPrev?.[0]?.sum?.visits ?? 0);
          visitsDeltaPct = prevVisits > 0 ? ((visits - prevVisits) / prevVisits) * 100 : null;
          visitsSeries = ((zone.visitsSeries ?? []) as any[])
            .map((r) => ({ ts: String(r.dimensions?.ts ?? ""), visits: Number(r.sum?.visits ?? 0) }))
            .filter((p) => p.ts)
            .sort((a, b) => a.ts.localeCompare(b.ts));

          pageViews = Number(zone.pageviewsTotal?.[0]?.count ?? 0);
          const prevPageViews = Number(zone.pageviewsPrev?.[0]?.count ?? 0);
          pageViewsDeltaPct = prevPageViews > 0 ? ((pageViews - prevPageViews) / prevPageViews) * 100 : null;
          pageViewsSeries = ((zone.pageviewsSeries ?? []) as any[])
            .map((r) => ({ ts: String(r.dimensions?.ts ?? ""), views: Number(r.count ?? 0) }))
            .filter((p) => p.ts)
            .sort((a, b) => a.ts.localeCompare(b.ts));

          apiRequests = Number(zone.apiTotal?.[0]?.count ?? 0);
          const prevApi = Number(zone.apiPrev?.[0]?.count ?? 0);
          apiRequestsDeltaPct = prevApi > 0 ? ((apiRequests - prevApi) / prevApi) * 100 : null;
          apiRequestsSeries = ((zone.apiSeries ?? []) as any[])
            .map((r) => ({ ts: String(r.dimensions?.ts ?? ""), requests: Number(r.count ?? 0) }))
            .filter((p) => p.ts)
            .sort((a, b) => a.ts.localeCompare(b.ts));
        }
      } catch {
        // sem seta/visits/pageviews/api nesse período, sem quebrar o resto do KPI
      }
    }

    return {
      ok: true,
      range: full.range,
      totals: {
        requests: full.totals.requests,
        cached: full.totals.cached,
        bytes: full.totals.bytes,
        uniqueIps: full.totals.uniqueIps,
      },
      requestsDeltaPct,
      bytesDeltaPct,
      visits,
      visitsDeltaPct,
      visitsSeries,
      pageViews,
      pageViewsDeltaPct,
      pageViewsSeries,
      apiRequests,
      apiRequestsDeltaPct,
      apiRequestsSeries,
      proxy: full.proxy,
      domains: full.domains,
      topUrls: full.topUrls,
      topHosts: full.topHosts,
      topCountries: full.topCountries,
      timeseries: full.timeseries.map((p) => ({ t: p.t, requests: p.requests, cached: p.cached, bytes: p.bytes })),
      hostsByBucket: full.hostsByBucket,
      history: full.history.map((h) => ({ captured_at: h.captured_at, requests: h.requests })),
      lastSyncAt: full.lastSyncAt,
      warning: full.warning,
      topStats: full.topStats ?? {},
      live: !!(data.zoneId && data.days <= 4),
    };
  });

// ─── getHttpTrafficTopStatsByMetric (Top Statistics recortado por KPI ativo) ──
// Sob demanda, ao clicar em Data transfer/Page views/Visits/API requests: mesma
// grade de dimensões do fetchHttpTopStats — Page views/Visits/API recortam o
// conjunto de linhas (ver HTTP_ZONE_METRIC_FILTER); Data transfer usa o mesmo
// conjunto de "Requisições" mas ordena/exibe por bytes em vez de contagem.
// "Requisições" em si continua usando o full.topStats de sempre, sem passar
// por aqui.
export type HttpTopStatsByMetricResult =
  | { ok: true; topStats: HttpTopStats; warning?: string | null }
  | { ok: false; error: string };

export const getHttpTrafficTopStatsByMetric = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator(
    (input: { zoneId?: string | null; days?: number; metric: string; filters?: unknown } | undefined) => ({
      zoneId: input?.zoneId?.trim() || null,
      days: Math.min(Math.max(input?.days ?? 1, 1), 4),
      metric: input?.metric,
      filters: filtersInputSchema.parse(input?.filters ?? []),
    }),
  )
  .handler(async ({ data, context }): Promise<HttpTopStatsByMetricResult> => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "view_analytics_http");
    if (!data.zoneId) return { ok: false, error: "Selecione uma zona." };
    const metric = data.metric as HttpZoneMetric;
    if (!(metric in HTTP_ZONE_METRIC_FILTER)) return { ok: false, error: `Métrica "${data.metric}" inválida.` };

    const supabase = makeSupabase();
    const { data: integ } = await supabase
      .from("integrations")
      .select("api_key, enabled")
      .eq("provider", "cloudflare")
      .maybeSingle();
    if (!integ?.enabled || !integ?.api_key) {
      return { ok: false, error: "Integração Cloudflare não está ativa ou sem token configurado." };
    }

    const until = new Date();
    const since = new Date(until.getTime() - data.days * 24 * 60 * 60 * 1000);
    const { topStats, warnings } = await fetchHttpTopStats(
      readSecret(integ.api_key),
      data.zoneId,
      since.toISOString(),
      until.toISOString(),
      data.filters,
      HTTP_ZONE_METRIC_FILTER[metric],
      metric === "bytes" ? "bytes" : "count",
    );
    return { ok: true, topStats, warning: warnings.length ? warnings.join(" | ") : null };
  });

// ─── getSecurityAnalytics (aba Analytics — sub-aba Security) ───────────────────

export const getSecurityAnalytics = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator(
    (input: { days?: number; action?: string | null; zoneId?: string | null; filters?: unknown } | undefined) => ({
      days: Math.min(Math.max(input?.days ?? 3, 1), 90),
      action: input?.action ?? null,
      zoneId: input?.zoneId?.trim() || null,
      filters: filtersInputSchema.parse(input?.filters ?? []),
    }),
  )
  .handler(async ({ data, context }): Promise<SecurityAnalytics | SecurityAnalyticsError> => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "view_analytics_security");
    const full = await fetchCloudflareAnalyticsCore(data);
    if (!full.ok) return full;
    return {
      ok: true,
      range: full.range,
      totals: { requests: full.totals.requests, mitigated: full.totals.mitigated },
      securityActions: full.securityActions,
      topIps: full.topIps,
      sampleLogs: full.sampleLogs,
      skipByHost: full.skipByHost,
      timeseries: full.timeseries.map((p) => ({ t: p.t, mitigated: p.mitigated, skip: p.skip })),
      history: full.history.map((h) => ({ captured_at: h.captured_at, mitigated: h.mitigated, skip: h.skip })),
      lastSyncAt: full.lastSyncAt,
      warning: full.warning,
      topStats: full.securityTopStats ?? { userAgent: [], ruleId: [] },
    };
  });

// ─── getHttpTrafficGroupedTimeseries / getSecurityGroupedTimeseries ────────────
// Gráfico central reagrupado por dimensão (Host/Path/Country/Status Code...) —
// acionado sob demanda quando o usuário troca a aba "All" por outra, não a cada
// carregamento da seção inteira.

export const getHttpTrafficGroupedTimeseries = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId?: string | null; days?: number; dimension: string; filters?: unknown }) => ({
    zoneId: input.zoneId?.trim() || null,
    days: Math.min(Math.max(input?.days ?? 3, 1), 90),
    dimension: input.dimension,
    filters: filtersInputSchema.parse(input?.filters ?? []),
  }))
  .handler(async ({ data, context }): Promise<GroupedTimeseriesResult> => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "view_analytics_http");
    const def = HTTP_TRAFFIC_FILTER_FIELDS[data.dimension];
    if (!def) return { ok: false, error: `Dimensão "${data.dimension}" não suportada.` };

    const until = new Date();
    const since = new Date(until.getTime() - data.days * 24 * 60 * 60 * 1000);
    const sinceIso = since.toISOString();
    const untilIso = until.toISOString();
    const supabase = makeSupabase();

    if (data.zoneId && data.days <= 4) {
      const { data: integ } = await supabase
        .from("integrations")
        .select("api_key, enabled")
        .eq("provider", "cloudflare")
        .maybeSingle();
      if (!integ?.enabled || !integ?.api_key) {
        return { ok: false, error: "Integração Cloudflare não está ativa ou sem token configurado." };
      }
      return fetchGroupedTimeseriesLive(
        readSecret(integ.api_key),
        data.zoneId,
        sinceIso,
        untilIso,
        data.dimension as HttpTopStatsKey,
        data.days,
        data.filters,
      );
    }

    if (!def.pgColumn) {
      return {
        ok: false,
        error: `Agrupar por "${def.label}" só está disponível na janela ao vivo (zona selecionada + até 4 dias).`,
      };
    }
    let evQuery = supabase
      .from("cloudflare_firewall_events")
      .select("datetime, action, client_ip, country, host, path, rule_id")
      .gte("datetime", sinceIso)
      .lte("datetime", untilIso)
      .limit(50000);
    if (data.zoneId) evQuery = evQuery.eq("zone_id", data.zoneId);
    const { query: filteredEvQuery } = applySupabaseFilterConditions(evQuery, data.filters, HTTP_TRAFFIC_FILTER_FIELDS);
    const { data: events, error } = await filteredEvQuery;
    if (error) return { ok: false, error: error.message };
    const bucketHours = data.days <= 3 ? 1 : data.days <= 14 ? 6 : 24;
    const { keys, series } = groupEventsByBucketAndDimension(events ?? [], bucketHours, def.pgColumn, 5);
    return { ok: true, dimension: data.dimension, keys, series };
  });

export const getSecurityGroupedTimeseries = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId?: string | null; days?: number; dimension: string; filters?: unknown }) => ({
    zoneId: input.zoneId?.trim() || null,
    days: Math.min(Math.max(input?.days ?? 3, 1), 90),
    dimension: input.dimension,
    filters: filtersInputSchema.parse(input?.filters ?? []),
  }))
  .handler(async ({ data, context }): Promise<GroupedTimeseriesResult> => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "view_analytics_security");
    const def = SECURITY_FILTER_FIELDS[data.dimension];
    if (!def?.pgColumn) {
      return { ok: false, error: `Dimensão "${data.dimension}" não suportada pra agrupamento.` };
    }
    const until = new Date();
    const since = new Date(until.getTime() - data.days * 24 * 60 * 60 * 1000);
    const sinceIso = since.toISOString();
    const untilIso = until.toISOString();
    const supabase = makeSupabase();
    let evQuery = supabase
      .from("cloudflare_firewall_events")
      .select("datetime, action, client_ip, country, host, path, rule_id, user_agent")
      .gte("datetime", sinceIso)
      .lte("datetime", untilIso)
      .limit(50000);
    if (data.zoneId) evQuery = evQuery.eq("zone_id", data.zoneId);
    const { query: filteredEvQuery } = applySupabaseFilterConditions(evQuery, data.filters, SECURITY_FILTER_FIELDS);
    const { data: events, error } = await filteredEvQuery;
    if (error) return { ok: false, error: error.message };
    const bucketHours = data.days <= 3 ? 1 : data.days <= 14 ? 6 : 24;
    const { keys, series } = groupEventsByBucketAndDimension(events ?? [], bucketHours, def.pgColumn, 5);
    return { ok: true, dimension: data.dimension, keys, series };
  });

// ─── Live GraphQL helper (Cloudflare Analytics direto) ─────────────────────────
async function gqlZone(apiToken: string, query: string, variables: Record<string, any>) {
  const res = await cfGraphql(apiToken, query, variables);
  const json = res.json;
  if (!res.ok || json.errors?.length) {
    const msg = json.errors?.[0]?.message ?? `HTTP ${res.status}`;
    const err: any = new Error(msg);
    err.cfMessage = msg;
    throw err;
  }
  return json.data?.viewer?.zones?.[0] ?? {};
}

// Variante tolerante a erro parcial — usada pelas queries multi-alias (Top
// statistics), onde um campo negado por plano/permissão não pode derrubar os
// outros aliases que vieram preenchidos no mesmo documento.
async function gqlZonePartial(
  apiToken: string,
  query: string,
  variables: Record<string, any>,
): Promise<{ zone: Record<string, any>; errors: string[] }> {
  const res = await cfGraphql(apiToken, query, variables);
  const json = res.json;
  const errors: string[] = [
    // Limite de plano não entra como aviso: os cards sem dado já somem da tela.
    ...new Set<string>((json.errors ?? []).map((e: any) => String(e.message ?? "erro desconhecido"))),
  ];
  const zone = json.data?.viewer?.zones?.[0] ?? {};
  if (!res.ok && Object.keys(zone).length === 0) {
    throw new Error(errors[0] ?? `HTTP ${res.status}`);
  }
  return { zone, errors };
}

// Grade fixa de buckets entre since→until (evita buracos no eixo X quando um
// bucket não tem nenhum dado) — compartilhada entre o caminho live e o banco.
function fillMissingBuckets(
  perBucket: Map<string, Map<string, number>>,
  sinceIso: string,
  untilIso: string,
  bucketHours: number,
  keys: string[],
): Array<{ t: string } & Record<string, number>> {
  // bucketHours=0 (granularidade por minuto, useHourly=false) — chave normalizada
  // pro minuto (sem segundos/ms), avançando de 1 em 1 minuto. bucketHours>0 —
  // chave normalizada pra hora (sem minutos/segundos/ms), igual ao formato usado
  // ao popular `perBucket` em fetchGroupedTimeseriesLive — se os dois formatos
  // divergem, o lookup abaixo nunca bate e todo valor vira 0 silenciosamente.
  const stepMs = bucketHours > 0 ? bucketHours * 60 * 60 * 1000 : 60 * 1000;
  const out: Array<{ t: string } & Record<string, number>> = [];
  const start = new Date(sinceIso);
  if (bucketHours > 0) {
    start.setMinutes(0, 0, 0);
    start.setHours(Math.floor(start.getHours() / bucketHours) * bucketHours);
  } else {
    start.setSeconds(0, 0);
  }
  const end = new Date(untilIso);
  for (let d = new Date(start); d <= end; d = new Date(d.getTime() + stepMs)) {
    const key = bucketHours > 0 ? d.toISOString().slice(0, 13) + ":00:00Z" : d.toISOString().slice(0, 16) + ":00Z";
    const m = perBucket.get(key);
    const point: Record<string, number | string> = { t: key };
    for (const k of keys) point[k] = m?.get(k) ?? 0;
    out.push(point as { t: string } & Record<string, number>);
  }
  return out;
}

async function fetchLiveAnalytics(
  apiToken: string,
  zoneId: string,
  sinceIso: string,
  untilIso: string,
  days: number,
  filters: AnalyticsFilterCondition[] = [],
) {
  const vars = { zone: zoneId, since: sinceIso, until: untilIso };
  const warnings: string[] = [];

  const secFilterAll = buildAdaptiveFilterClause(filters, SECURITY_FILTER_FIELDS, "sf");
  const secFilterNoAction = buildAdaptiveFilterClause(
    filters.filter((c) => c.field !== "action"),
    SECURITY_FILTER_FIELDS,
    "sn",
  );

  // Cada dataset é consultado isoladamente: se um falhar (permissão / plano),
  // os outros continuam funcionando.
  const totalsP = gqlZone(
    apiToken,
    `query($zone:String!,$since:Time!,$until:Time!){
    viewer { zones(filter:{zoneTag:$zone}) {
      totals: httpRequests1hGroups(limit:1, filter:{datetime_geq:$since, datetime_leq:$until}) {
        sum { requests cachedRequests bytes threats } uniq { uniques }
      }
    } } }`,
    vars,
  ).catch((e) => {
    warnings.push(`totals: ${e.cfMessage ?? e.message}`);
    return {};
  });

  const countryP = gqlZone(
    apiToken,
    `query($zone:String!,$since:Time!,$until:Time!){
    viewer { zones(filter:{zoneTag:$zone}) {
      byCountry: httpRequests1hGroups(limit:20, filter:{datetime_geq:$since, datetime_leq:$until}) {
        sum { countryMap { clientCountryName requests threats } }
      }
    } } }`,
    vars,
  ).catch((e) => {
    warnings.push(`country: ${e.cfMessage ?? e.message}`);
    return {};
  });

  // httpRequests1mGroups (granularidade por minuto) tem limite de 15h de range
  // na API da Cloudflare — nossa menor janela selecionável é 24h (days=1), então
  // esse caminho nunca é válido hoje; sempre usa 1h (o "days>=2" gerava o erro
  // "cannot request a time range wider than 15h" pra quem escolhia 24h).
  const useHourly = true;
  const seriesField = useHourly
    ? `series: httpRequests1hGroups(limit: 1000, orderBy:[datetime_ASC], filter:{datetime_geq:$since, datetime_leq:$until}) { dimensions { datetime } sum { requests cachedRequests bytes threats } }`
    : `series: httpRequests1mGroups(limit: 1000, orderBy:[datetime_ASC], filter:{datetime_geq:$since, datetime_leq:$until}) { dimensions { datetime } sum { requests cachedRequests bytes threats } }`;
  const seriesP = gqlZone(
    apiToken,
    `query($zone:String!,$since:Time!,$until:Time!){
    viewer { zones(filter:{zoneTag:$zone}) { ${seriesField} } } }`,
    vars,
  ).catch(async (e) => {
    warnings.push(`series: ${e.cfMessage ?? e.message}`);
    // fallback para 1h (sempre disponível mesmo no plano Free)
    if (!useHourly) {
      return gqlZone(
        apiToken,
        `query($zone:String!,$since:Time!,$until:Time!){
          viewer { zones(filter:{zoneTag:$zone}) {
            series: httpRequests1hGroups(limit: 1000, orderBy:[datetime_ASC], filter:{datetime_geq:$since, datetime_leq:$until}) { dimensions { datetime } sum { requests cachedRequests bytes threats } }
          } } }`,
        vars,
      ).catch(() => ({}));
    }
    return {};
  });

  const fwP = gqlZone(
    apiToken,
    `query($zone:String!,$since:Time!,$until:Time!${secFilterAll.declarations}){
    viewer { zones(filter:{zoneTag:$zone}) {
      fwActions: firewallEventsAdaptiveGroups(limit: 20, orderBy:[count_DESC], filter:{datetime_geq:$since, datetime_leq:$until${secFilterAll.fragment}}) { count dimensions { action } }
      fwHosts: firewallEventsAdaptiveGroups(limit: 20, orderBy:[count_DESC], filter:{datetime_geq:$since, datetime_leq:$until${secFilterAll.fragment}}) { count dimensions { clientRequestHTTPHost } }
      fwPaths: firewallEventsAdaptiveGroups(limit: 20, orderBy:[count_DESC], filter:{datetime_geq:$since, datetime_leq:$until${secFilterAll.fragment}}) { count dimensions { clientRequestHTTPHost clientRequestPath } }
      fwIps: firewallEventsAdaptiveGroups(limit: 20, orderBy:[count_DESC], filter:{datetime_geq:$since, datetime_leq:$until${secFilterAll.fragment}}) { count dimensions { clientIP clientCountryName } }
      fwUserAgents: firewallEventsAdaptiveGroups(limit: 10, orderBy:[count_DESC], filter:{datetime_geq:$since, datetime_leq:$until${secFilterAll.fragment}}) { count dimensions { userAgent } }
      fwRuleIds: firewallEventsAdaptiveGroups(limit: 10, orderBy:[count_DESC], filter:{datetime_geq:$since, datetime_leq:$until${secFilterAll.fragment}}) { count dimensions { ruleId } }
      fwHostsHourly: firewallEventsAdaptiveGroups(limit: 1000, orderBy:[count_DESC], filter:{datetime_geq:$since, datetime_leq:$until${secFilterAll.fragment}}) { count dimensions { datetimeHour clientRequestHTTPHost } }
    } } }`,
    { ...vars, ...secFilterAll.variables },
  ).catch((e) => {
    warnings.push(`firewall: ${e.cfMessage ?? e.message}`);
    return {};
  });

  // Query skip por hora — usa orderBy datetime para cobrir todo o período.
  // O campo `action` já é fixo ("skip") aqui, então o filtro do usuário nunca
  // inclui "action" (secFilterNoAction) pra não colidir com esse literal.
  // O campo `count` em firewallEventsAdaptiveGroups já é o total do bucket (não amostra)
  const skipSeriesP = gqlZone(
    apiToken,
    `query($zone:String!,$since:Time!,$until:Time!${secFilterNoAction.declarations}){
    viewer { zones(filter:{zoneTag:$zone}) {
      skipHourly: firewallEventsAdaptiveGroups(
        limit: 10000, orderBy:[datetimeHour_ASC],
        filter:{datetime_geq:$since, datetime_leq:$until, action:"skip"${secFilterNoAction.fragment}}
      ) { count dimensions { datetimeHour } }
    } } }`,
    { ...vars, ...secFilterNoAction.variables },
  ).catch(() => ({}));

  const topStatsP = fetchHttpTopStats(apiToken, zoneId, sinceIso, untilIso, filters);

  const [zT, zC, zS, zF, zSk, topStatsResult] = await Promise.all([
    totalsP,
    countryP,
    seriesP,
    fwP,
    skipSeriesP,
    topStatsP,
  ]);
  warnings.push(...topStatsResult.warnings);
  const topStats = topStatsResult.topStats;

  const t = (zT as any).totals?.[0] ?? {};
  const totals = {
    requests: Number(t.sum?.requests ?? 0),
    mitigated: Number(t.sum?.threats ?? 0),
    cached: Number(t.sum?.cachedRequests ?? 0),
    bytes: Number(t.sum?.bytes ?? 0),
    uniqueIps: Number(t.uniq?.uniques ?? 0),
  };

  const countryAgg = new Map<string, number>();
  for (const row of (zC as any).byCountry ?? []) {
    for (const cm of row.sum?.countryMap ?? []) {
      const name = String(cm.clientCountryName ?? "—");
      countryAgg.set(name, (countryAgg.get(name) ?? 0) + Number(cm.requests ?? 0));
    }
  }
  const topCountries = Array.from(countryAgg.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 15)
    .map(([country, requests]) => ({ country, code: country.slice(0, 2).toUpperCase(), requests }));

  // Mapa de skip por hora — normaliza chave para "YYYY-MM-DDTHH:00:00Z"
  const skipByHourMap = new Map<string, number>();
  for (const row of ((zSk as any).skipHourly ?? []) as any[]) {
    const dt = String(row.dimensions?.datetimeHour ?? "").trim();
    if (!dt) continue;
    // CF retorna datetimeHour como "2024-01-15T14:00:00Z" — normaliza para garantir
    const normalized = dt.slice(0, 13) + ":00:00Z";
    skipByHourMap.set(normalized, (skipByHourMap.get(normalized) ?? 0) + Number(row.count ?? 0));
  }

  const timeseries = ((zS as any).series ?? []).map((row: any) => {
    const t = String(row.dimensions?.datetime ?? "");
    // Normaliza o timestamp da série para o mesmo formato da chave do mapa
    const tNorm = t.slice(0, 13) + ":00:00Z";
    const skipVal = skipByHourMap.get(tNorm) ?? skipByHourMap.get(t) ?? 0;
    return {
      t,
      requests: Number(row.sum?.requests ?? 0),
      mitigated: Number(row.sum?.threats ?? 0),
      cached: Number(row.sum?.cachedRequests ?? 0),
      bytes: Number(row.sum?.bytes ?? 0),
      skip: skipVal,
    };
  });

  const securityActions = ((zF as any).fwActions ?? []).map((r: any) => ({
    action: String(r.dimensions?.action ?? "log"),
    count: Number(r.count ?? 0),
  }));

  // Top Hosts de tráfego geral vêm de httpRequestsAdaptiveGroups (topStats,
  // dataset correto) — não mais de firewallEventsAdaptiveGroups (viés de eventos
  // bloqueados/desafiados). Fallback pro dado de firewall só se o dataset novo
  // vier vazio (ex.: campo negado pelo plano do token).
  const fwHostsFallback = ((zF as any).fwHosts ?? []).map((r: any) => ({
    host: String(r.dimensions?.clientRequestHTTPHost ?? "—"),
    requests: Number(r.count ?? 0),
  }));
  const topHosts = topStats.host?.length
    ? topStats.host.map((r) => ({ host: r.value, requests: r.requests }))
    : fwHostsFallback;

  const topUrls = ((zF as any).fwPaths ?? []).map((r: any) => ({
    host: String(r.dimensions?.clientRequestHTTPHost ?? "—"),
    path: String(r.dimensions?.clientRequestPath ?? "/"),
    requests: Number(r.count ?? 0),
  }));

  const topIps = ((zF as any).fwIps ?? []).map((r: any) => ({
    ip: String(r.dimensions?.clientIP ?? "—"),
    country: String(r.dimensions?.clientCountryName ?? "—"),
    requests: Number(r.count ?? 0),
  }));

  const topUserAgents = ((zF as any).fwUserAgents ?? []).map((r: any) => ({
    value: String(r.dimensions?.userAgent ?? "—").slice(0, 140),
    requests: Number(r.count ?? 0),
  }));
  const topRuleIds = ((zF as any).fwRuleIds ?? []).map((r: any) => ({
    value: String(r.dimensions?.ruleId ?? "—"),
    requests: Number(r.count ?? 0),
  }));

  // No caminho LIVE não temos eventos individuais por host para Skip; derivamos
  // do total de Skip nas fwActions e distribuímos pelo top de hosts proporcionalmente.
  const skipTotal = securityActions
    .filter((a: any) => String(a.action).toLowerCase() === "skip")
    .reduce((s: number, a: any) => s + Number(a.count ?? 0), 0);
  const hostsSum = topHosts.reduce((s: number, h: any) => s + Number(h.requests ?? 0), 0) || 1;
  const skipByHost =
    skipTotal > 0
      ? topHosts
          .map((h: any) => ({
            host: h.host,
            count: Math.round((Number(h.requests ?? 0) / hostsSum) * skipTotal),
          }))
          .filter((h: any) => h.count > 0)
      : [];

  // hostsByBucket por hora (chave igual ao `t` da timeseries quando useHourly)
  const hostsByBucket: Record<string, Array<{ host: string; count: number }>> = {};
  const hostsByBucketMap = new Map<string, Map<string, number>>();
  for (const row of ((zF as any).fwHostsHourly ?? []) as any[]) {
    const dt = String(row.dimensions?.datetimeHour ?? "");
    const host = String(row.dimensions?.clientRequestHTTPHost ?? "—");
    const c = Number(row.count ?? 0);
    if (!dt || !host || c <= 0) continue;
    const m = hostsByBucketMap.get(dt) ?? new Map<string, number>();
    m.set(host, (m.get(host) ?? 0) + c);
    hostsByBucketMap.set(dt, m);
  }
  for (const [k, m] of hostsByBucketMap.entries()) {
    hostsByBucket[k] = Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([host, count]) => ({ host, count }));
  }

  return {
    totals,
    topCountries,
    timeseries,
    securityActions,
    topHosts,
    topUrls,
    topIps,
    skipByHost,
    hostsByBucket,
    topStats,
    securityTopStats: { userAgent: topUserAgents, ruleId: topRuleIds },
    warnings,
  };
}

// ─── fetchHttpTopStats ──────────────────────────────────────────────────────────
// Grid "Top statistics" da sub-aba HTTP Traffic. Usa httpRequestsAdaptiveGroups
// (dataset adaptativo/amostrado) — diferente de httpRequests1hGroups (usado só
// pros KPIs exatos do topo) porque é o único que aceita `dimensions` livre e
// filtro por campo arbitrário. 8 aliases num único documento; cada um isolado
// via gqlZonePartial (um campo negado por plano não derruba os outros).
export type HttpTopStatsKey =
  | "host"
  | "path"
  | "sourceIp"
  | "country"
  | "statusCodeEdge"
  | "statusCodeOrigin"
  | "asn"
  | "cacheStatus"
  | "deviceType"
  | "queryString"
  | "userAgent"
  | "dataCenter"
  | "httpVersion"
  | "xRequestedWith";
export type HttpTopStats = Partial<Record<HttpTopStatsKey, Array<{ value: string; requests: number }>>>;

export type SecurityTopStats = {
  userAgent: Array<{ value: string; requests: number }>;
  ruleId: Array<{ value: string; requests: number }>;
};

// Mesmos filtros confirmados via captura das queries reais do dash Cloudflare
// (GetZoneTopNs/ZapSparklineBydatetimeFifteenMinutes) usados no cálculo dos
// KPIs Page views/Visits/API requests (ver getHttpTrafficAnalytics) — aqui em
// formato "extraFilter" (prefixo ", " pra encadear direto após o fragment do
// buildAdaptiveFilterClause em fetchHttpTopStats).
export type HttpZoneMetric = "bytes" | "pageViews" | "visits" | "apiRequests";
const HTTP_ZONE_METRIC_FILTER: Record<HttpZoneMetric, string> = {
  // "bytes" (Data transfer) usa o mesmo conjunto de linhas de "Requisições"
  // (sem filtro extra) — só troca valor/ordenação pra sum.edgeResponseBytes
  // (ver orderField em fetchHttpTopStats).
  bytes: "",
  visits: `, requestSource:"eyeball"`,
  pageViews: `, requestSource:"eyeball", edgeResponseStatus:200, edgeResponseContentTypeName:"html"`,
  apiRequests: `, requestSource:"eyeball", OR:[{edgeResponseContentTypeName:"json"},{edgeResponseContentTypeName:"xml"},{edgeResponseContentTypeName:"grpc"},{edgeResponseContentTypeName:"grpcweb"}]`,
};

async function fetchHttpTopStats(
  apiToken: string,
  zoneId: string,
  sinceIso: string,
  untilIso: string,
  filters: AnalyticsFilterCondition[],
  // Filtro fixo adicional (literal, não vem do usuário) pra recortar o mesmo
  // grid de dimensões pela métrica ativa (Page views/Visits/API requests) —
  // ver HTTP_ZONE_METRIC_FILTER. Vazio = comportamento de sempre (Requisições,
  // sem recorte).
  extraFilter = "",
  // "bytes" (Data transfer): ordena e exibe por sum.edgeResponseBytes em vez de
  // count — confirmado via captura ("Data transfer volume by source" mostra os
  // mesmos painéis em GB, não em contagem de requisições).
  orderField: "count" | "bytes" = "count",
): Promise<{ topStats: HttpTopStats; warnings: string[] }> {
  const { fragment, declarations, variables, warnings } = buildAdaptiveFilterClause(
    filters,
    HTTP_TRAFFIC_FILTER_FIELDS,
    "hf",
  );
  const orderBy = orderField === "bytes" ? "sum_edgeResponseBytes_DESC" : "count_DESC";

  const query = `query($zone:String!,$since:Time!,$until:Time!${declarations}){
    viewer { zones(filter:{zoneTag:$zone}) {
      byHost: httpRequestsAdaptiveGroups(limit:30, orderBy:[${orderBy}], filter:{datetime_geq:$since, datetime_leq:$until${fragment}${extraFilter}}) { count sum { edgeResponseBytes } dimensions { clientRequestHTTPHost } }
      byPath: httpRequestsAdaptiveGroups(limit:30, orderBy:[${orderBy}], filter:{datetime_geq:$since, datetime_leq:$until${fragment}${extraFilter}}) { count sum { edgeResponseBytes } dimensions { clientRequestPath } }
      byIp: httpRequestsAdaptiveGroups(limit:30, orderBy:[${orderBy}], filter:{datetime_geq:$since, datetime_leq:$until${fragment}${extraFilter}}) { count sum { edgeResponseBytes } dimensions { clientIP clientCountryName } }
      byCountry: httpRequestsAdaptiveGroups(limit:30, orderBy:[${orderBy}], filter:{datetime_geq:$since, datetime_leq:$until${fragment}${extraFilter}}) { count sum { edgeResponseBytes } dimensions { clientCountryName } }
      byStatusE: httpRequestsAdaptiveGroups(limit:30, orderBy:[${orderBy}], filter:{datetime_geq:$since, datetime_leq:$until${fragment}${extraFilter}}) { count sum { edgeResponseBytes } dimensions { edgeResponseStatus } }
      byStatusO: httpRequestsAdaptiveGroups(limit:30, orderBy:[${orderBy}], filter:{datetime_geq:$since, datetime_leq:$until${fragment}${extraFilter}}) { count sum { edgeResponseBytes } dimensions { originResponseStatus } }
      byAsn: httpRequestsAdaptiveGroups(limit:30, orderBy:[${orderBy}], filter:{datetime_geq:$since, datetime_leq:$until${fragment}${extraFilter}}) { count sum { edgeResponseBytes } dimensions { clientAsn clientASNDescription } }
      byCache: httpRequestsAdaptiveGroups(limit:30, orderBy:[${orderBy}], filter:{datetime_geq:$since, datetime_leq:$until${fragment}${extraFilter}}) { count sum { edgeResponseBytes } dimensions { cacheStatus } }
      byDevice: httpRequestsAdaptiveGroups(limit:30, orderBy:[${orderBy}], filter:{datetime_geq:$since, datetime_leq:$until${fragment}${extraFilter}}) { count sum { edgeResponseBytes } dimensions { clientDeviceType } }
      byQuery: httpRequestsAdaptiveGroups(limit:30, orderBy:[${orderBy}], filter:{datetime_geq:$since, datetime_leq:$until${fragment}${extraFilter}}) { count sum { edgeResponseBytes } dimensions { clientRequestQuery } }
    } } }`;

  let zone: Record<string, any> = {};
  let gqlErrors: string[] = [];
  try {
    const res = await gqlZonePartial(apiToken, query, { zone: zoneId, since: sinceIso, until: untilIso, ...variables });
    zone = res.zone;
    gqlErrors = res.errors;
  } catch (e: any) {
    return { topStats: {}, warnings: [...warnings, e.cfMessage ?? e.message] };
  }

  function pick(alias: string, dimKey: string, map?: (v: any) => string): Array<{ value: string; requests: number }> {
    return ((zone[alias] ?? []) as any[])
      .map((r) => ({
        value: map ? map(r.dimensions) : String(r.dimensions?.[dimKey] ?? "—"),
        requests: Number(orderField === "bytes" ? (r.sum?.edgeResponseBytes ?? 0) : (r.count ?? 0)),
      }))
      .filter((r) => r.value && r.value !== "—");
  }

  const topStats: HttpTopStats = {
    host: pick("byHost", "clientRequestHTTPHost"),
    path: pick("byPath", "clientRequestPath"),
    sourceIp: pick("byIp", "clientIP", (d) => {
      const ip = String(d?.clientIP ?? "—");
      const country = String(d?.clientCountryName ?? "");
      return country ? `${ip} · ${country}` : ip;
    }),
    country: pick("byCountry", "clientCountryName"),
    statusCodeEdge: pick("byStatusE", "edgeResponseStatus"),
    // originResponseStatus=0 é um valor real e comum da Cloudflare — não é
    // bug, significa "a origem não foi contatada" (servido por cache, edge,
    // worker, redirect ou bloqueio antes de chegar na origem). Só troca o
    // rótulo pra ficar claro; o filtro (onRowClick) ainda usa "0".
    statusCodeOrigin: pick("byStatusO", "originResponseStatus", (d) => {
      const v = String(d?.originResponseStatus ?? "");
      return v === "0" ? "Sem origem (cache/edge)" : v;
    }),
    asn: pick("byAsn", "clientAsn", (d) =>
      d?.clientASNDescription ? `AS${d.clientAsn} · ${d.clientASNDescription}` : `AS${d?.clientAsn ?? "—"}`,
    ),
    cacheStatus: pick("byCache", "cacheStatus"),
    deviceType: pick("byDevice", "clientDeviceType"),
    queryString: pick("byQuery", "clientRequestQuery", (d) => {
      const q = String(d?.clientRequestQuery ?? "");
      return q ? q : "(vazio)";
    }),
  };

  // Segunda query, isolada: dimensões com confiança menor (userAgent/coloCode
  // já usados noutro dataset, clientRequestHTTPProtocol com 1 fonte só, e
  // xRequestedWith é uma tentativa — não confirmei em fonte nenhuma). Isolado
  // do bloco acima de propósito: se um nome de campo aqui estiver errado, o
  // erro de validação de schema derruba SÓ esses 4, não os já confirmados.
  const extraQuery = `query($zone:String!,$since:Time!,$until:Time!${declarations}){
    viewer { zones(filter:{zoneTag:$zone}) {
      byUA: httpRequestsAdaptiveGroups(limit:30, orderBy:[${orderBy}], filter:{datetime_geq:$since, datetime_leq:$until${fragment}${extraFilter}}) { count sum { edgeResponseBytes } dimensions { userAgent } }
      byColo: httpRequestsAdaptiveGroups(limit:30, orderBy:[${orderBy}], filter:{datetime_geq:$since, datetime_leq:$until${fragment}${extraFilter}}) { count sum { edgeResponseBytes } dimensions { coloCode clientCountryName } }
      byHttpVer: httpRequestsAdaptiveGroups(limit:30, orderBy:[${orderBy}], filter:{datetime_geq:$since, datetime_leq:$until${fragment}${extraFilter}}) { count sum { edgeResponseBytes } dimensions { clientRequestHTTPProtocol } }
      byXReq: httpRequestsAdaptiveGroups(limit:30, orderBy:[${orderBy}], filter:{datetime_geq:$since, datetime_leq:$until${fragment}${extraFilter}}) { count sum { edgeResponseBytes } dimensions { xRequestedWith } }
    } } }`;
  try {
    const { zone: zExtra, errors: extraErrors } = await gqlZonePartial(apiToken, extraQuery, {
      zone: zoneId,
      since: sinceIso,
      until: untilIso,
      ...variables,
    });
    function pickExtra(alias: string, dimKey: string, map?: (v: any) => string) {
      return ((zExtra[alias] ?? []) as any[])
        .map((r: any) => ({
          value: map ? map(r.dimensions) : String(r.dimensions?.[dimKey] ?? "—"),
          requests: Number(orderField === "bytes" ? (r.sum?.edgeResponseBytes ?? 0) : (r.count ?? 0)),
        }))
        .filter((r) => r.value && r.value !== "—");
    }
    topStats.userAgent = pickExtra("byUA", "userAgent", (d) => String(d?.userAgent ?? "—").slice(0, 140));
    topStats.dataCenter = pickExtra("byColo", "coloCode", (d) => {
      const colo = String(d?.coloCode ?? "—");
      const country = String(d?.clientCountryName ?? "");
      return country ? `${country} (${colo})` : colo;
    });
    topStats.httpVersion = pickExtra("byHttpVer", "clientRequestHTTPProtocol");
    topStats.xRequestedWith = pickExtra("byXReq", "xRequestedWith", (d) => {
      const v = String(d?.xRequestedWith ?? "");
      return v ? v : "(vazio)";
    });
    if (extraErrors.length) warnings.push(`http (extra): ${extraErrors.join(" | ")}`);
  } catch (e: any) {
    warnings.push(`http (extra): ${e.cfMessage ?? e.message}`);
  }

  return { topStats, warnings: [...warnings, ...gqlErrors] };
}

// ─── fetchGroupedTimeseries ─────────────────────────────────────────────────────
// Série temporal reagrupada por dimensão (bucket × top-N valores) pro gráfico
// central quando o usuário troca "All" por Host/Path/Country/Status Code etc.
// Em duas fases pra não truncar o cálculo do top-N: (A) reaproveita os valores
// já ordenados de fetchHttpTopStats; (B) segunda query restrita a esses top-N
// valores via "_in", limitando o resultado a nº de buckets × topN linhas.
export type GroupedTimeseriesPoint = { t: string } & Record<string, number>;
export type GroupedTimeseriesResult =
  | { ok: true; dimension: string; keys: string[]; series: GroupedTimeseriesPoint[]; warning?: string | null }
  | { ok: false; error: string };

async function fetchGroupedTimeseriesLive(
  apiToken: string,
  zoneId: string,
  sinceIso: string,
  untilIso: string,
  dimensionKey: HttpTopStatsKey,
  days: number,
  filters: AnalyticsFilterCondition[],
  topN = 5,
): Promise<GroupedTimeseriesResult> {
  const def = HTTP_TRAFFIC_FILTER_FIELDS[dimensionKey];
  if (!def?.gqlField) return { ok: false, error: `Dimensão "${dimensionKey}" não suportada.` };

  const { topStats, warnings: topWarnings } = await fetchHttpTopStats(apiToken, zoneId, sinceIso, untilIso, filters);
  const top = (topStats[dimensionKey] ?? []).slice(0, topN);
  if (top.length === 0) return { ok: true, dimension: dimensionKey, keys: [], series: [] };
  const topValues = top.map((t) => t.value);

  const restricted: AnalyticsFilterCondition[] = [...filters, { field: dimensionKey, op: "in", value: topValues }];
  const { fragment, declarations, variables, warnings } = buildAdaptiveFilterClause(
    restricted,
    HTTP_TRAFFIC_FILTER_FIELDS,
    "gf",
  );

  // Mesmo limite de 15h da granularidade por minuto — nossa menor janela é 24h,
  // então sempre agrupa por hora aqui também (ver fetchLiveAnalytics).
  const useHourly = true;
  const dtField = useHourly ? "datetimeHour" : "datetimeMinute";
  const query = `query($zone:String!,$since:Time!,$until:Time!${declarations}){
    viewer { zones(filter:{zoneTag:$zone}) {
      rows: httpRequestsAdaptiveGroups(limit:10000, orderBy:[${dtField}_ASC], filter:{datetime_geq:$since, datetime_leq:$until${fragment}}) {
        count dimensions { ${dtField} ${def.gqlField} }
      }
    } } }`;

  let zone: any;
  try {
    zone = await gqlZone(apiToken, query, { zone: zoneId, since: sinceIso, until: untilIso, ...variables });
  } catch (e: any) {
    return { ok: false, error: e.cfMessage ?? e.message };
  }

  const perBucket = new Map<string, Map<string, number>>();
  for (const r of (zone.rows ?? []) as any[]) {
    const raw = String(r.dimensions?.[dtField] ?? "");
    if (!raw) continue;
    const bucketKey = useHourly ? raw.slice(0, 13) + ":00:00Z" : raw;
    const v = String(r.dimensions?.[def.gqlField] ?? "—");
    if (!topValues.includes(v)) continue;
    const m = perBucket.get(bucketKey) ?? new Map<string, number>();
    m.set(v, (m.get(v) ?? 0) + Number(r.count ?? 0));
    perBucket.set(bucketKey, m);
  }

  const series = fillMissingBuckets(
    perBucket,
    sinceIso,
    untilIso,
    useHourly ? 1 : 0,
    topValues,
  ) as GroupedTimeseriesPoint[];
  const allWarnings = [...topWarnings, ...warnings];
  return {
    ok: true,
    dimension: dimensionKey,
    keys: topValues,
    series,
    warning: allWarnings.length ? allWarnings.join(" | ") : null,
  };
}

// Fallback de banco — só funciona pra dimensões com pgColumn (host/path/country
// pro HTTP Traffic; action/host/path/country/ip/ruleId/userAgent pro Security).
function groupEventsByBucketAndDimension(
  evs: Array<Record<string, any>>,
  bucketHours: number,
  pgColumn: string,
  topN = 5,
): { keys: string[]; series: GroupedTimeseriesPoint[] } {
  const perBucket = new Map<string, Map<string, number>>();
  const totals = new Map<string, number>();
  for (const e of evs) {
    const d = new Date(e.datetime);
    d.setMinutes(0, 0, 0);
    d.setHours(Math.floor(d.getHours() / bucketHours) * bucketHours);
    const bucketKey = d.toISOString();
    const v = String(e[pgColumn] ?? "—");
    totals.set(v, (totals.get(v) ?? 0) + 1);
    const m = perBucket.get(bucketKey) ?? new Map<string, number>();
    m.set(v, (m.get(v) ?? 0) + 1);
    perBucket.set(bucketKey, m);
  }
  const keys = [...totals.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, topN)
    .map(([v]) => v);
  const series = [...perBucket.keys()].sort().map((t) => {
    const m = perBucket.get(t)!;
    const point: Record<string, number | string> = { t };
    for (const v of keys) point[v] = m.get(v) ?? 0;
    return point as GroupedTimeseriesPoint;
  });
  return { keys, series };
}

// ─── triggerCloudflareSync ─────────────────────────────────────────────────────

export const triggerCloudflareSync = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { fullResync?: boolean } | undefined) => ({
    fullResync: input?.fullResync === true,
  }))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "execute");
    const { runCloudflareSync } = await import("@/lib/cloudflare.server");
    const { recordCronRun } = await import("@/lib/cron-tracking.server");
    const started = Date.now();
    const result = await runCloudflareSync({ fullResync: data.fullResync });
    await recordCronRun("cloudflare-daily-sync", "manual", {
      ok: result.ok,
      error: "error" in result ? result.error : undefined,
      durationMs: Date.now() - started,
    });
    return result;
  });

// ─── syncCloudflareZone ────────────────────────────────────────────────────────

export const syncCloudflareZone = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId: string; fullResync?: boolean }) =>
    z.object({ zoneId: z.string().min(1).max(64), fullResync: z.boolean().optional() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "execute");
    const { runCloudflareZoneSync } = await import("@/lib/cloudflare.server");
    return runCloudflareZoneSync(data.zoneId, { fullResync: data.fullResync });
  });

// ─── listCloudflareZones ───────────────────────────────────────────────────────

export const listCloudflareZones = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "view");
    const supabase = makeSupabase();
    const { data, error } = await supabase
      .from("cloudflare_zones")
      .select("id, name, status, account_name")
      .order("name");
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, zones: data ?? [] };
  });

// ─── searchDnsRecords ──────────────────────────────────────────────────────────
// Consulta direto na API da Cloudflare — sem cache de banco para garantir dados atualizados.

export const searchDnsRecords = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId?: string; query?: string } | undefined) =>
    z
      .object({
        zoneId: z.string().max(64).optional(),
        query: z.string().max(255).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "view");
    const supabase = makeSupabase();

    // Busca credencial da integração Cloudflare
    const { data: integ, error: integErr } = await supabase
      .from("integrations")
      .select("api_key, enabled")
      .eq("provider", "cloudflare")
      .maybeSingle();

    if (integErr) return { ok: false as const, error: integErr.message };
    if (!integ?.enabled) return { ok: false as const, error: "Integração Cloudflare não está ativa." };
    if (!integ?.api_key) return { ok: false as const, error: "API Token da Cloudflare não configurado." };

    const token = readSecret(integ.api_key);
    const CF = "https://api.cloudflare.com/client/v4";

    // Se não passou zoneId, busca todas as zonas primeiro
    const zoneIds: Array<{ id: string; name: string }> = [];

    if (data.zoneId) {
      // Busca nome da zona para incluir no resultado
      const zRes = await fetch(`${CF}/zones/${data.zoneId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const zJson: any = await zRes.json().catch(() => ({}));
      const zoneName = zJson?.result?.name ?? "";
      zoneIds.push({ id: data.zoneId, name: zoneName });
    } else {
      // Lista todas as zonas da conta
      const zRes = await fetch(`${CF}/zones?per_page=100`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!zRes.ok) return { ok: false as const, error: `Cloudflare API ${zRes.status}` };
      const zJson: any = await zRes.json().catch(() => ({}));
      for (const z of zJson?.result ?? []) {
        zoneIds.push({ id: String(z.id), name: String(z.name) });
      }
    }

    // Busca registros DNS de cada zona direto na CF
    const records: Array<{
      id: string;
      zone_id: string;
      zone_name: string;
      name: string;
      type: string;
      content: string;
      proxied: boolean | null;
      ttl: number | null;
      comment: string | null;
      modified_on: string | null;
    }> = [];

    const q = data.query?.trim().toLowerCase() ?? "";

    for (const zone of zoneIds) {
      // Busca todos os registros sem filtro de nome na URL
      // (a API da CF faz match exato em ?name=, não parcial)
      // O filtro parcial é feito client-side abaixo
      let page = 1;
      while (true) {
        const params = new URLSearchParams({ per_page: "500", page: String(page) });
        const rRes = await fetch(`${CF}/zones/${zone.id}/dns_records?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!rRes.ok) break;

        const rJson: any = await rRes.json().catch(() => ({}));
        const list: any[] = rJson?.result ?? [];

        for (const r of list) {
          // Filtra client-side: busca parcial em name e content
          if (q) {
            const name = String(r.name ?? "").toLowerCase();
            const content = String(r.content ?? "").toLowerCase();
            if (!name.includes(q) && !content.includes(q)) continue;
          }

          records.push({
            id: String(r.id),
            zone_id: zone.id,
            zone_name: zone.name,
            name: String(r.name ?? ""),
            type: String(r.type ?? ""),
            content: String(r.content ?? ""),
            proxied: r.proxied ?? null,
            ttl: r.ttl ?? null,
            comment: r.comment ?? null,
            modified_on: r.modified_on ?? null,
          });
        }

        const totalPages = rJson?.result_info?.total_pages ?? 1;
        if (page >= totalPages) break;
        page++;
      }
    }

    // Ordena por nome
    records.sort((a, b) => a.name.localeCompare(b.name));

    return { ok: true as const, records };
  });

// ─── purgeCache ────────────────────────────────────────────────────────────────

export const purgeCache = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId: string; hostnames?: string[]; files?: string[]; purgeEverything?: boolean }) =>
    z
      .object({
        zoneId: z.string().min(1).max(64),
        hostnames: z.array(z.string().min(1).max(255)).max(30).optional(),
        // Limpeza por URL: a Cloudflare aceita até 30 URLs completas por chamada
        files: z.array(z.string().url().max(2048)).max(30).optional(),
        purgeEverything: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "manage_purge_cache");
    const { purgeCloudflareCache, logCloudflareAudit, resolveZoneName, resolveUserEmail } =
      await import("@/lib/cloudflare.server");
    const startedAt = Date.now();
    const result = await purgeCloudflareCache(data.zoneId, {
      hostnames: data.hostnames,
      files: data.files,
      purgeEverything: data.purgeEverything,
    });
    const [zoneName, userEmail] = await Promise.all([
      resolveZoneName(data.zoneId),
      resolveUserEmail(context.userId, (context as any).claims?.email ?? null),
    ]);
    await logCloudflareAudit({
      action: "purge_cache",
      status: result.ok ? "success" : "error",
      zoneId: data.zoneId,
      zoneName,
      durationMs: Date.now() - startedAt,
      userEmail,
      details: {
        purge_everything: data.purgeEverything ?? false,
        hostnames: data.purgeEverything ? [] : (data.hostnames ?? []),
        files: data.purgeEverything ? [] : (data.files ?? []),
      },
      message: result.ok
        ? data.purgeEverything
          ? `Purge total da zona ${zoneName ?? data.zoneId}`
          : data.files?.length
            ? `${data.files.length} URL(s) purgada(s)`
            : `${(data.hostnames ?? []).length} hostname(s) purgado(s)`
        : (result as any).error,
    });
    return result;
  });

// ─── createDnsRecord ───────────────────────────────────────────────────────────

export const createDnsRecord = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator(
    (input: {
      zoneId: string;
      type: string;
      name: string;
      content: string;
      ttl?: number;
      proxied?: boolean;
      comment?: string;
    }) =>
      z
        .object({
          zoneId: z.string().min(1).max(64),
          type: z.enum(["A", "AAAA", "CNAME", "TXT", "MX", "NS", "SRV", "CAA"]),
          name: z.string().min(1).max(255),
          content: z.string().min(1).max(1000),
          ttl: z.number().int().min(1).max(86400).optional(),
          proxied: z.boolean().optional(),
          comment: z.string().max(100).optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "manage_adicionar_dns");
    const { createCloudflareDnsRecord, notifyDnsRecordCreated, logCloudflareAudit, resolveUserEmail } =
      await import("@/lib/cloudflare.server");
    const startedAt = Date.now();
    const result = await createCloudflareDnsRecord(data.zoneId, {
      type: data.type,
      name: data.name,
      content: data.content,
      ttl: data.ttl ?? 1,
      proxied: data.proxied ?? false,
      comment: data.comment,
    });
    const durationMs = Date.now() - startedAt;
    const userEmail = await resolveUserEmail(context.userId, (context as any).claims?.email ?? null);
    if (result.ok) {
      await notifyDnsRecordCreated({
        zoneId: data.zoneId,
        zoneName: result.zoneName,
        type: data.type,
        name: data.name,
        content: data.content,
        proxied: data.proxied ?? false,
        createdByUserId: context.userId ?? null,
      });
      await logCloudflareAudit({
        action: "create_dns",
        status: "success",
        zoneId: data.zoneId,
        zoneName: result.zoneName,
        durationMs,
        userEmail,
        details: {
          type: data.type,
          name: data.name,
          content: data.content,
          ttl: data.ttl === 1 ? "Auto" : (data.ttl ?? "Auto"),
          proxied: data.proxied ?? false,
          comment: data.comment || null,
          record_id: result.id ?? null,
        },
        message: `${data.type} ${data.name} criado em ${result.zoneName ?? data.zoneId}`,
      });
    } else {
      await logCloudflareAudit({
        action: "create_dns",
        status: "error",
        zoneId: data.zoneId,
        zoneName: null,
        durationMs,
        userEmail,
        details: { type: data.type, name: data.name, content: data.content },
        message: (result as any).error,
      });
    }
    return result;
  });

// ─── updateDnsRecord ───────────────────────────────────────────────────────────

export const updateDnsRecord = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator(
    (input: {
      zoneId: string;
      recordId: string;
      type: string;
      name: string;
      content: string;
      ttl?: number;
      proxied?: boolean;
      comment?: string;
    }) =>
      z
        .object({
          zoneId: z.string().min(1).max(64),
          recordId: z.string().min(1).max(64),
          type: z.enum(["A", "AAAA", "CNAME", "TXT", "MX", "NS", "SRV", "CAA"]),
          name: z.string().min(1).max(255),
          content: z.string().min(1).max(1000),
          ttl: z.number().int().min(1).max(86400).optional(),
          proxied: z.boolean().optional(),
          comment: z.string().max(100).optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "manage_editar_dns");
    const { updateCloudflareDnsRecord, notifyDnsRecordUpdated, logCloudflareAudit, resolveUserEmail, diffObjects, summarizeChanges } =
      await import("@/lib/cloudflare.server");
    const startedAt = Date.now();
    const result = await updateCloudflareDnsRecord(data.zoneId, data.recordId, {
      type: data.type,
      name: data.name,
      content: data.content,
      ttl: data.ttl ?? 1,
      proxied: data.proxied ?? false,
      comment: data.comment,
    });
    const durationMs = Date.now() - startedAt;
    const userEmail = await resolveUserEmail(context.userId, (context as any).claims?.email ?? null);
    if (result.ok) {
      // Compara campo a campo com o estado ANTES da edição — sem isso, os
      // detalhes do log só mostravam o valor novo, sem indicar se algo
      // realmente mudou (a descrição/comentário podia ser reenviado igual).
      const after = {
        type: data.type,
        name: data.name,
        content: data.content,
        ttl: data.ttl ?? 1,
        proxied: data.proxied ?? false,
        comment: data.comment ?? null,
      };
      const changes = diffObjects(result.before, after);
      await notifyDnsRecordUpdated({
        zoneId: data.zoneId,
        zoneName: result.zoneName,
        type: data.type,
        name: data.name,
        previousContent: result.previousContent,
        content: data.content,
        proxied: data.proxied ?? false,
        updatedByUserId: context.userId ?? null,
        changes,
      });
      await logCloudflareAudit({
        action: "update_dns",
        status: "success",
        zoneId: data.zoneId,
        zoneName: result.zoneName,
        durationMs,
        userEmail,
        details: {
          type: data.type,
          name: data.name,
          content_anterior: result.previousContent ?? null,
          content: data.content,
          ttl: data.ttl === 1 ? "Auto" : (data.ttl ?? "Auto"),
          proxied: data.proxied ?? false,
          comment: data.comment || null,
          record_id: data.recordId,
          changes,
        },
        message: `${data.type} ${data.name} editado em ${result.zoneName ?? data.zoneId} — ${summarizeChanges(changes)}`,
      });
    } else {
      await logCloudflareAudit({
        action: "update_dns",
        status: "error",
        zoneId: data.zoneId,
        zoneName: null,
        durationMs,
        userEmail,
        details: { type: data.type, name: data.name, content: data.content },
        message: (result as any).error,
      });
    }
    return result;
  });

// ─── getCacheStatus ────────────────────────────────────────────────────────────

export type CacheStatusResult =
  | {
      ok: true;
      result: {
        hostname: string;
        zoneId: string;
        range: { since: string; until: string; days: number };
        totals: {
          total: number;
          hit: number;
          none: number;
          dynamic: number;
          revalidated: number;
          expired: number;
          miss: number;
          bypass: number;
          stale: number;
          age: number | null; // Age do cache em segundos via HEAD request ao hostname
        };
        timeseries: Array<{
          t: string;
          hit: number;
          miss: number;
          dynamic: number;
          expired: number;
          bypass: number;
          none: number;
        }>;
      };
    }
  | { ok: false; error: string };

export const getCacheStatus = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { hostname: string; zoneId: string; days?: number } | undefined) => ({
    hostname: (input?.hostname ?? "").trim(),
    zoneId: (input?.zoneId ?? "").trim(),
    days: Math.min(Math.max(input?.days ?? 1, 1), 3),
  }))
  .handler(async ({ data, context }): Promise<CacheStatusResult> => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "view");
    const { hostname, zoneId, days } = data;
    if (!hostname) return { ok: false, error: "Hostname não informado." };
    if (!zoneId) return { ok: false, error: "Zone ID não informado." };

    const supabase = makeSupabase();
    const { data: integ, error: integErr } = await supabase
      .from("integrations")
      .select("api_key, enabled")
      .eq("provider", "cloudflare")
      .maybeSingle();

    if (integErr) return { ok: false, error: integErr.message };
    if (!integ?.enabled) return { ok: false, error: "Integração Cloudflare não está ativa." };
    if (!integ?.api_key) return { ok: false, error: "API Token da Cloudflare não configurado." };

    const until = new Date();
    const since = new Date(until.getTime() - days * 24 * 60 * 60 * 1000);
    const sinceIso = since.toISOString();
    const untilIso = until.toISOString();

    const query = `
      query CachePerf($zone: String!, $since: Time!, $until: Time!, $host: String!) {
        viewer {
          zones(filter: { zoneTag: $zone }) {
            byStatus: httpRequestsAdaptiveGroups(
              limit: 20 orderBy: [count_DESC]
              filter: { datetime_geq: $since, datetime_leq: $until, clientRequestHTTPHost: $host }
            ) { count dimensions { cacheStatus } }
            series: httpRequestsAdaptiveGroups(
              limit: 1000 orderBy: [datetime_ASC]
              filter: { datetime_geq: $since, datetime_leq: $until, clientRequestHTTPHost: $host }
            ) { count dimensions { datetime cacheStatus } }
          }
        }
      }
    `;

    const res = await fetch("https://api.cloudflare.com/client/v4/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${readSecret(integ.api_key)}` },
      body: JSON.stringify({ query, variables: { zone: zoneId, since: sinceIso, until: untilIso, host: hostname } }),
    });

    if (!res.ok) {
      const txt = await res.text();
      return { ok: false, error: `Cloudflare API ${res.status}: ${txt.slice(0, 200)}` };
    }
    const json = (await res.json()) as any;
    if (json.errors?.length) return { ok: false, error: json.errors.map((e: any) => e.message).join("; ") };

    const zone = json.data?.viewer?.zones?.[0];
    if (!zone) return { ok: false, error: "Zone não encontrada ou token sem permissão." };

    const statusMap: Record<string, number> = {};
    let grandTotal = 0;
    for (const g of zone.byStatus ?? []) {
      const st = String(g.dimensions?.cacheStatus ?? "none").toLowerCase();
      const n = Number(g.count ?? 0);
      statusMap[st] = (statusMap[st] ?? 0) + n;
      grandTotal += n;
    }
    const pick = (k: string) => statusMap[k] ?? 0;
    const totals = {
      total: grandTotal,
      hit: pick("hit"),
      none: pick("none"),
      dynamic: pick("dynamic"),
      revalidated: pick("revalidated"),
      expired: pick("expired"),
      miss: pick("miss"),
      bypass: pick("bypass"),
      stale: pick("stale"),
    };

    const buckets: Record<string, Record<string, number>> = {};
    for (const g of zone.series ?? []) {
      const dt = String(g.dimensions?.datetime ?? "");
      const st = String(g.dimensions?.cacheStatus ?? "none").toLowerCase();
      const cnt = Number(g.count ?? 0);
      const key = dt.slice(0, 13) + ":00:00Z";
      if (!buckets[key]) buckets[key] = {};
      buckets[key][st] = (buckets[key][st] ?? 0) + cnt;
    }
    const timeseries = Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([t, s]) => ({
        t,
        hit: s["hit"] ?? 0,
        miss: s["miss"] ?? 0,
        dynamic: s["dynamic"] ?? 0,
        expired: s["expired"] ?? 0,
        bypass: s["bypass"] ?? 0,
        none: s["none"] ?? 0,
      }));

    // ── Busca Age via HEAD request direto no hostname ──────────────────────
    // O header Age indica há quantos segundos o objeto está em cache na CF
    const { safeFetchAge } = await import("./ssrf-guard.server");
    const age = await safeFetchAge(hostname);

    return {
      ok: true,
      result: {
        hostname,
        zoneId,
        range: { since: sinceIso, until: untilIso, days },
        totals: { ...totals, age },
        timeseries,
      },
    };
  });

// ─── Custom Rules (WAF) CRUD ───────────────────────────────────────────────────
// Endpoint Cloudflare: /zones/{zone_id}/rulesets/phases/http_request_firewall_custom/entrypoint

async function getCfToken(): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  const supabase = makeSupabase();
  const { data, error } = await supabase
    .from("integrations")
    .select("api_key, enabled")
    .eq("provider", "cloudflare")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data?.enabled) return { ok: false, error: "Integração Cloudflare não está ativa." };
  if (!data?.api_key) return { ok: false, error: "API Token da Cloudflare não configurado." };
  return { ok: true, token: readSecret(data.api_key) };
}

const CUSTOM_PHASE_PATH = "rulesets/phases/http_request_firewall_custom/entrypoint";
const CF_ACTIONS = ["block", "challenge", "managed_challenge", "js_challenge", "log", "skip", "allow"] as const;
// "Execution order" (First / Last / Custom) — `before: ""` = primeira posição
type CustomRulePosition = { before: string } | { after: string };
const customRulePositionSchema = z.union([
  z.object({ before: z.string().max(64) }),
  z.object({ after: z.string().max(64) }),
]);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type CustomRule = {
  id: string;
  description: string;
  expression: string;
  action: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action_parameters: Record<string, any> | null;
  enabled: boolean;
  last_updated?: string | null;
};

export const listAllSkipCustomRules = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .handler(
    async ({
      context,
    }): Promise<
      | { ok: true; rules: Array<{ zone: string; zoneId: string; ruleName: string; ruleId: string }>; total: number }
      | { ok: false; error: string }
    > => {
      await requirePermission(context.supabase, context.userId, "cloudflare-waf", "view");
      const cred = await getCfToken();
      if (!cred.ok) return cred;
      const supabase = makeSupabase();
      const { data: zones, error: zErr } = await supabase
        .from("cloudflare_zones")
        .select("id, name, status")
        .eq("status", "active");
      if (zErr) return { ok: false, error: zErr.message };
      const list: Array<{ zone: string; zoneId: string; ruleName: string; ruleId: string }> = [];
      await Promise.all(
        (zones ?? []).map(async (z) => {
          try {
            const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${z.id}/${CUSTOM_PHASE_PATH}`, {
              headers: { Authorization: `Bearer ${cred.token}` },
            });
            const json: any = await res.json().catch(() => ({}));
            if (!res.ok) return;
            for (const r of json?.result?.rules ?? []) {
              if (String(r.action ?? "").toLowerCase() === "skip" && r.enabled !== false) {
                list.push({
                  zone: z.name,
                  zoneId: z.id,
                  ruleName: String(r.description ?? r.id ?? "—"),
                  ruleId: String(r.id ?? ""),
                });
              }
            }
          } catch {
            /* ignore per-zone failure */
          }
        }),
      );
      return { ok: true, rules: list, total: list.length };
    },
  );

// ─── getSkipCountsByRule ───────────────────────────────────────────────────────
// Consulta a API GraphQL da Cloudflare agrupando eventos de skip por ruleId
// nas últimas 24h em todas as zonas ativas. Retorna Map<ruleId, count>.

export const getSkipCountsByRule = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .handler(
    async ({ context }): Promise<{ ok: true; counts: Record<string, number> } | { ok: false; error: string }> => {
      await requirePermission(context.supabase, context.userId, "cloudflare-waf", "view");
      const cred = await getCfToken();
      if (!cred.ok) return cred;

      const supabase = makeSupabase();
      const { data: zones, error: zErr } = await supabase
        .from("cloudflare_zones")
        .select("id, name, status")
        .eq("status", "active");
      if (zErr) return { ok: false, error: zErr.message };

      const until = new Date();
      const since = new Date(until.getTime() - 24 * 60 * 60 * 1000);
      const sinceIso = since.toISOString();
      const untilIso = until.toISOString();

      const counts: Record<string, number> = {};

      await Promise.all(
        (zones ?? []).map(async (z) => {
          try {
            const data = await gqlZone(
              cred.token,
              `query($zone:String!,$since:Time!,$until:Time!){
              viewer { zones(filter:{zoneTag:$zone}) {
                skipByRule: firewallEventsAdaptiveGroups(
                  limit: 1000,
                  orderBy:[count_DESC],
                  filter:{datetime_geq:$since, datetime_leq:$until, action:"skip"}
                ) { count dimensions { ruleId } }
              } } }`,
              { zone: z.id, since: sinceIso, until: untilIso },
            );
            for (const row of (data as any).skipByRule ?? []) {
              const ruleId = String(row.dimensions?.ruleId ?? "");
              if (!ruleId) continue;
              counts[ruleId] = (counts[ruleId] ?? 0) + Number(row.count ?? 0);
            }
          } catch {
            /* ignore per-zone failure */
          }
        }),
      );

      return { ok: true, counts };
    },
  );

export const listCustomRules = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId: string }) => z.object({ zoneId: z.string().min(1).max(64) }).parse(input))
  .handler(async ({ data, context }): Promise<any> => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "view");
    const cred = await getCfToken();
    if (!cred.ok) return cred;
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${data.zoneId}/${CUSTOM_PHASE_PATH}`, {
      headers: { Authorization: `Bearer ${cred.token}` },
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: json?.errors?.[0]?.message ?? `HTTP ${res.status}` };
    const rules = (json?.result?.rules ?? []).map((r: any) => ({
      id: String(r.id),
      description: String(r.description ?? ""),
      expression: String(r.expression ?? ""),
      action: String(r.action ?? "block"),
      action_parameters: r.action_parameters ?? null,
      logging: r.logging?.enabled === false ? { enabled: false } : null,
      enabled: r.enabled !== false,
      last_updated: r.last_updated ?? null,
    }));
    return { ok: true, rules, rulesetId: json?.result?.id ?? null };
  });

// Histórico (audit_logs) das Custom rules do WAF — nunca derruba a operação.
async function logCustomRuleChange(args: {
  kind: "create" | "update" | "toggle";
  zoneId: string;
  userId: string;
  description: string;
  enabled: boolean;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const { logCloudflareAudit, resolveZoneName, resolveUserEmail, diffObjects, summarizeChanges } = await import(
      "@/lib/cloudflare.server"
    );
    const [zoneName, userEmail] = await Promise.all([resolveZoneName(args.zoneId), resolveUserEmail(args.userId, null)]);
    const changes = args.before && args.after ? diffObjects(args.before, args.after) : [];
    const where = zoneName ?? args.zoneId;
    await logCloudflareAudit({
      action: args.kind === "create" ? "create_rule" : args.kind === "toggle" ? "toggle_rule" : "update_rule",
      status: "success",
      zoneId: args.zoneId,
      zoneName,
      userEmail,
      details: { category: "Custom rules (WAF)", description: args.description, enabled: args.enabled, changes },
      message:
        args.kind === "create"
          ? `Custom rule "${args.description}" criada em ${where}`
          : args.kind === "toggle"
            ? `Custom rule "${args.description}" ${args.enabled ? "habilitada" : "desabilitada"} em ${where}`
            : `Custom rule "${args.description}" editada em ${where} — ${summarizeChanges(changes)}`,
    });
  } catch (e) {
    console.error("[logCustomRuleChange]", e);
  }
}

export const createCustomRule = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator(
    (input: {
      zoneId: string;
      description: string;
      expression: string;
      action: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      action_parameters?: Record<string, any> | null;
      enabled?: boolean;
      position?: CustomRulePosition;
      logging?: { enabled: boolean };
    }) =>
      z
        .object({
          zoneId: z.string().min(1).max(64),
          description: z.string().min(1).max(500),
          expression: z.string().min(1).max(4096),
          action: z.enum(CF_ACTIONS),
          action_parameters: z.record(z.string(), z.any()).nullable().optional(),
          enabled: z.boolean().optional(),
          position: customRulePositionSchema.optional(),
          logging: z.object({ enabled: z.boolean() }).optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "manage_custom_rules");
    const cred = await getCfToken();
    if (!cred.ok) return cred;
    const res = await fetch(`https://api.cloudflare.com/client/v4/zones/${data.zoneId}/${CUSTOM_PHASE_PATH}/rules`, {
      method: "POST",
      headers: { Authorization: `Bearer ${cred.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        description: data.description,
        expression: data.expression,
        action: data.action,
        enabled: data.enabled ?? true,
        ...(data.action_parameters != null ? { action_parameters: data.action_parameters } : {}),
        // Sem `position`, a Cloudflare adiciona no fim (Last)
        ...(data.position ? { position: data.position } : {}),
        // "Log matching requests" do Skip
        ...(data.logging ? { logging: data.logging } : {}),
      }),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false as const, error: json?.errors?.[0]?.message ?? `HTTP ${res.status}` };
    await logCustomRuleChange({
      kind: "create",
      zoneId: data.zoneId,
      userId: context.userId,
      description: data.description,
      enabled: data.enabled ?? true,
    });
    return { ok: true as const };
  });

export const updateCustomRule = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator(
    (input: {
      zoneId: string;
      rulesetId: string;
      ruleId: string;
      description: string;
      expression: string;
      action: string;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      action_parameters?: Record<string, any> | null;
      enabled?: boolean;
      position?: CustomRulePosition;
      logging?: { enabled: boolean };
    }) =>
      z
        .object({
          zoneId: z.string().min(1).max(64),
          rulesetId: z.string().min(1).max(64),
          ruleId: z.string().min(1).max(64),
          description: z.string().min(0).max(500),
          expression: z.string().min(1).max(4096),
          action: z.enum(CF_ACTIONS),
          action_parameters: z.record(z.string(), z.any()).nullable().optional(),
          enabled: z.boolean().optional(),
          position: customRulePositionSchema.optional(),
          logging: z.object({ enabled: z.boolean() }).optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "manage_custom_rules");
    const cred = await getCfToken();
    if (!cred.ok) return cred;

    const body: Record<string, unknown> = {
      description: data.description,
      expression: data.expression,
      action: data.action,
      enabled: data.enabled ?? true,
    };

    if (data.action_parameters != null) {
      body.action_parameters = data.action_parameters;
    }
    // "Execution order" — só vai quando o usuário mudou a posição
    if (data.position) body.position = data.position;
    if (data.logging) body.logging = data.logging;

    // Estado anterior da regra, pro antes/depois do histórico
    let before: Record<string, unknown> | null = null;
    try {
      const prev = await fetch(`https://api.cloudflare.com/client/v4/zones/${data.zoneId}/rulesets/${data.rulesetId}`, {
        headers: { Authorization: `Bearer ${cred.token}` },
      });
      const pj: any = await prev.json().catch(() => ({}));
      const r = (pj?.result?.rules ?? []).find((x: any) => String(x.id) === data.ruleId);
      if (r)
        before = {
          description: r.description ?? "",
          expression: r.expression ?? "",
          action: r.action ?? "",
          enabled: r.enabled !== false,
        };
    } catch {
      /* histórico sem antes/depois */
    }

    // Endpoint correto: PATCH /zones/{zone}/rulesets/{ruleset_id}/rules/{rule_id}
    const res = await fetch(
      `https://api.cloudflare.com/client/v4/zones/${data.zoneId}/rulesets/${data.rulesetId}/rules/${data.ruleId}`,
      {
        method: "PATCH",
        headers: { Authorization: `Bearer ${cred.token}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    );
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false as const, error: json?.errors?.[0]?.message ?? `HTTP ${res.status}` };
    const after = {
      description: data.description,
      expression: data.expression,
      action: data.action,
      enabled: data.enabled ?? true,
    };
    const onlyToggle =
      !!before &&
      before.enabled !== after.enabled &&
      before.description === after.description &&
      before.expression === after.expression &&
      before.action === after.action;
    await logCustomRuleChange({
      kind: onlyToggle ? "toggle" : "update",
      zoneId: data.zoneId,
      userId: context.userId,
      description: data.description,
      enabled: after.enabled,
      before,
      after,
    });
    return { ok: true as const };
  });
