// Load Balancing (Analytics — submenu "Network" / Traffic > Load Balancing
// Analytics). Dois caminhos de dado bem diferentes:
//  - "Overview" (requests/distribuição/top endpoints) — GraphQL, confirmado
//    capturando as queries reais do dash Cloudflare: dataset
//    loadBalancingRequestsAdaptiveGroups, filtro lbName_like (por ZONA).
//  - "Logs" (eventos de saúde) — REST, confirmado no schema oficial da
//    Cloudflare (cloudflare/api-schemas openapi.json):
//    GET /user/load_balancing_analytics/events. "Expected Response Codes" não
//    vem nesse endpoint — precisa cruzar com o Monitor da pool
//    (GET /accounts/{account_id}/load_balancers/monitors, campo expected_codes)
//    via pool.monitor (id do monitor), do jeito que o dash nativo faz.
import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { requirePermission } from "@/lib/authz";

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

async function gqlZone(apiToken: string, query: string, variables: Record<string, any>): Promise<Record<string, any>> {
  const res = await fetch(GQL_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiToken}` },
    body: JSON.stringify({ query, variables }),
  });
  const json: any = await res.json().catch(() => ({}));
  if (!res.ok || json.errors?.length) {
    const msg = json.errors?.[0]?.message ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json.data?.viewer?.zones?.[0] ?? {};
}

async function cfRest(apiToken: string, path: string, params?: Record<string, string>): Promise<any> {
  const url = new URL(`${CF_API}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v != null && v !== "") url.searchParams.set(k, v);
    }
  }
  const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${apiToken}` } });
  const json: any = await res.json().catch(() => ({}));
  if (!json.success) {
    const msg = json.errors?.[0]?.message ?? `HTTP ${res.status}`;
    throw new Error(msg);
  }
  return json.result;
}

// ─── Resolução comum de zona/token/conta ───────────────────────────────────────
async function resolveLbContext(
  zoneId: string | null,
): Promise<{ apiToken: string; accountId: string; zoneId: string; zoneName: string } | { ok: false; error: string }> {
  if (!zoneId) return { ok: false, error: "Selecione uma zona pra ver Load Balancing." };
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
  return { apiToken: integ.api_key, accountId: zoneRow.account_id, zoneId: zoneRow.id, zoneName: zoneRow.name };
}

// Busca os load balancers configurados na zona (REST — confirmado:
// GET /zones/{zone_id}/load_balancers). Um load balancer tem `name` (usado no
// filtro lbName_like do GraphQL) e `default_pools` (ids das pools).
async function resolveZoneLoadBalancers(
  apiToken: string,
  zoneId: string,
): Promise<Array<{ id: string; name: string; defaultPools: string[] }>> {
  const rows: any[] = await cfRest(apiToken, `/zones/${zoneId}/load_balancers`);
  return (rows ?? []).map((r) => ({
    id: String(r.id ?? ""),
    name: String(r.name ?? ""),
    defaultPools: Array.isArray(r.default_pools) ? r.default_pools.map(String) : [],
  }));
}

// ─── getLoadBalancingOverview (GraphQL — confirmado via captura) ──────────────
export type LbSeriesPoint = { ts: string; [poolName: string]: number | string };
export type LbPoolTotal = { poolId: string; poolName: string; count: number };
export type LbEndpointRow = { value: string; count: number };
export type LbEndpointGroup = { poolId: string; poolName: string; rows: LbEndpointRow[] };

export type LoadBalancingOverviewResult =
  | {
      ok: true;
      lbName: string;
      total: number;
      byPool: LbPoolTotal[];
      series: LbSeriesPoint[];
      endpoints: LbEndpointGroup[];
    }
  | { ok: false; error: string; notConfigured?: boolean };

export const getLoadBalancingOverview = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId?: string | null; days?: number } | undefined) => ({
    zoneId: input?.zoneId?.trim() || null,
    days: Math.min(Math.max(input?.days ?? 1, 1), 3),
  }))
  .handler(async ({ data, context }): Promise<LoadBalancingOverviewResult> => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "view_analytics_http");

    const ctx = await resolveLbContext(data.zoneId);
    if ("error" in ctx) return ctx;

    let lbs: Array<{ id: string; name: string; defaultPools: string[] }>;
    try {
      lbs = await resolveZoneLoadBalancers(ctx.apiToken, ctx.zoneId);
    } catch (e: any) {
      return { ok: false, error: e.message ?? String(e) };
    }
    if (lbs.length === 0) {
      return { ok: false, notConfigured: true, error: "Nenhum Load Balancer configurado nessa zona." };
    }
    // Só o primeiro LB da zona por enquanto (a maioria das zonas tem só um) —
    // trocar por um seletor se algum dia precisar de mais de um.
    const lb = lbs[0];

    const until = new Date();
    const since = new Date(until.getTime() - data.days * 24 * 60 * 60 * 1000);
    const vars = { zone: ctx.zoneId, since: since.toISOString(), until: until.toISOString(), lbName: lb.name };

    try {
      const [seriesZone, distZone, endpointsZone] = await Promise.all([
        gqlZone(
          ctx.apiToken,
          `query($zone:String!,$since:Time!,$until:Time!,$lbName:String!){
            viewer { zones(filter:{zoneTag:$zone}) {
              series: loadBalancingRequestsAdaptiveGroups(limit:5000, orderBy:[selectedPoolName_ASC], filter:{AND:[{datetime_geq:$since, datetime_lt:$until},{lbName_like:$lbName}]}) {
                count
                dimensions { selectedPoolName selectedPoolId ts: datetimeMinute }
              }
            } } }`,
          vars,
        ),
        gqlZone(
          ctx.apiToken,
          `query($zone:String!,$since:Time!,$until:Time!,$lbName:String!){
            viewer { zones(filter:{zoneTag:$zone}) {
              loadBalancingRequestsAdaptiveGroups(limit:5000, orderBy:[selectedPoolName_ASC], filter:{AND:[{datetime_geq:$since, datetime_lt:$until},{lbName_like:$lbName}]}) {
                count
                dimensions { selectedPoolName selectedPoolId }
              }
            } } }`,
          vars,
        ),
        gqlZone(
          ctx.apiToken,
          `query($zone:String!,$since:Time!,$until:Time!,$lbName:String!){
            viewer { zones(filter:{zoneTag:$zone}) {
              loadBalancingRequestsAdaptiveGroups(limit:5000, orderBy:[count_DESC], filter:{AND:[{datetime_geq:$since, datetime_lt:$until},{lbName_like:$lbName}]}) {
                count
                dimensions { selectedPoolName selectedPoolId metric: selectedOriginNames }
              }
            } } }`,
          vars,
        ),
      ]);

      // Série por pool: uma coluna por selectedPoolName, indexada por minuto.
      const byTs = new Map<string, Record<string, number>>();
      const poolNames = new Set<string>();
      for (const r of (seriesZone.series ?? []) as any[]) {
        const ts = String(r.dimensions?.ts ?? "");
        const pool = String(r.dimensions?.selectedPoolName ?? "—");
        if (!ts) continue;
        poolNames.add(pool);
        const row = byTs.get(ts) ?? {};
        row[pool] = (row[pool] ?? 0) + Number(r.count ?? 0);
        byTs.set(ts, row);
      }
      const series: LbSeriesPoint[] = Array.from(byTs.entries())
        .map(([ts, vals]) => ({ ts, ...vals }))
        .sort((a, b) => a.ts.localeCompare(b.ts));

      const byPool: LbPoolTotal[] = ((distZone as any).loadBalancingRequestsAdaptiveGroups ?? [])
        .map((r: any) => ({
          poolId: String(r.dimensions?.selectedPoolId ?? ""),
          poolName: String(r.dimensions?.selectedPoolName ?? "—"),
          count: Number(r.count ?? 0),
        }))
        .filter((p: LbPoolTotal) => p.poolName && p.poolName !== "—");
      const total = byPool.reduce((s, p) => s + p.count, 0);

      const endpointsByPool = new Map<string, LbEndpointGroup>();
      for (const r of ((endpointsZone as any).loadBalancingRequestsAdaptiveGroups ?? []) as any[]) {
        const poolId = String(r.dimensions?.selectedPoolId ?? "");
        const poolName = String(r.dimensions?.selectedPoolName ?? "—");
        const origin = String(r.dimensions?.metric ?? "—");
        if (!poolName || poolName === "—" || !origin || origin === "—") continue;
        const key = poolId || poolName;
        const group = endpointsByPool.get(key) ?? { poolId, poolName, rows: [] };
        group.rows.push({ value: origin, count: Number(r.count ?? 0) });
        endpointsByPool.set(key, group);
      }
      const endpoints = Array.from(endpointsByPool.values()).map((g) => ({
        ...g,
        rows: g.rows.sort((a, b) => b.count - a.count).slice(0, 15),
      }));

      return { ok: true, lbName: lb.name, total, byPool, series, endpoints };
    } catch (e: any) {
      return { ok: false, error: e.message ?? String(e) };
    }
  });

// ─── getLoadBalancingLogs (REST — confirmado no schema oficial) ───────────────
export type LbLogEvent = {
  id: number;
  timestamp: string;
  pool: { id: string; name: string; healthy: boolean; minimumOrigins: number };
  origins: Array<{ name: string; ip: string; healthy: boolean; changed: boolean; failureReason: string | null }>;
  expectedCodes: string | null;
};

export type LoadBalancingLogsResult =
  | { ok: true; pools: Array<{ id: string; name: string }>; events: LbLogEvent[]; warning?: string | null }
  | { ok: false; error: string; notConfigured?: boolean };

export const getLoadBalancingLogs = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator(
    (
      input:
        | {
            zoneId?: string | null;
            days?: number;
            poolId?: string | null;
            poolHealthy?: boolean | null;
            originHealthy?: boolean | null;
            originName?: string | null;
          }
        | undefined,
    ) => ({
      zoneId: input?.zoneId?.trim() || null,
      days: Math.min(Math.max(input?.days ?? 7, 1), 30),
      poolId: input?.poolId?.trim() || null,
      poolHealthy: input?.poolHealthy ?? null,
      originHealthy: input?.originHealthy ?? null,
      originName: input?.originName?.trim() || null,
    }),
  )
  .handler(async ({ data, context }): Promise<LoadBalancingLogsResult> => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "view_analytics_http");

    const ctx = await resolveLbContext(data.zoneId);
    if ("error" in ctx) return ctx;

    let lbs: Array<{ id: string; name: string; defaultPools: string[] }>;
    try {
      lbs = await resolveZoneLoadBalancers(ctx.apiToken, ctx.zoneId);
    } catch (e: any) {
      return { ok: false, error: e.message ?? String(e) };
    }
    if (lbs.length === 0) {
      return { ok: false, notConfigured: true, error: "Nenhum Load Balancer configurado nessa zona." };
    }
    const zonePoolIds = Array.from(new Set(lbs.flatMap((lb) => lb.defaultPools)));
    if (zonePoolIds.length === 0) {
      return { ok: false, notConfigured: true, error: "O Load Balancer dessa zona não tem pools configuradas." };
    }

    const warnings: string[] = [];

    // Pools + Monitors da conta — pra ter nome/limite de saúde da pool e o
    // "Expected Response Codes" (vem do Monitor, não do evento em si).
    let poolMeta = new Map<string, { name: string; monitor: string | null; minimumOrigins: number }>();
    let monitorCodes = new Map<string, string>();
    try {
      const [poolsRes, monitorsRes] = await Promise.all([
        cfRest(ctx.apiToken, `/accounts/${ctx.accountId}/load_balancers/pools`),
        cfRest(ctx.apiToken, `/accounts/${ctx.accountId}/load_balancers/monitors`),
      ]);
      for (const p of poolsRes ?? []) {
        poolMeta.set(String(p.id), {
          name: String(p.name ?? "—"),
          monitor: p.monitor ? String(p.monitor) : null,
          minimumOrigins: Number(p.minimum_origins ?? 1),
        });
      }
      for (const m of monitorsRes ?? []) {
        if (m.id && m.expected_codes) monitorCodes.set(String(m.id), String(m.expected_codes));
      }
    } catch (e: any) {
      warnings.push(`pools/monitors: ${e.message ?? String(e)}`);
    }

    const poolIdsToQuery = data.poolId ? [data.poolId] : zonePoolIds;
    const until = new Date();
    const since = new Date(until.getTime() - data.days * 24 * 60 * 60 * 1000);

    const restParams: Record<string, string> = {
      since: since.toISOString(),
      until: until.toISOString(),
    };
    if (data.poolHealthy != null) restParams.pool_healthy = String(data.poolHealthy);
    if (data.originHealthy != null) restParams.origin_healthy = String(data.originHealthy);
    if (data.originName) restParams.origin_name = data.originName;

    const allEvents: LbLogEvent[] = [];
    await Promise.all(
      poolIdsToQuery.map(async (poolId) => {
        try {
          const rows: any[] = await cfRest(ctx.apiToken, "/user/load_balancing_analytics/events", {
            ...restParams,
            pool_id: poolId,
          });
          for (const r of rows ?? []) {
            const meta = poolMeta.get(String(r.pool?.id ?? poolId));
            const expectedCodes = meta?.monitor ? monitorCodes.get(meta.monitor) ?? null : null;
            allEvents.push({
              id: Number(r.id ?? 0),
              timestamp: String(r.timestamp ?? ""),
              pool: {
                id: String(r.pool?.id ?? poolId),
                name: String(r.pool?.name ?? meta?.name ?? "—"),
                healthy: !!r.pool?.healthy,
                minimumOrigins: Number(r.pool?.minimum_origins ?? meta?.minimumOrigins ?? 1),
              },
              origins: ((r.origins ?? []) as any[]).map((o) => ({
                name: String(o.name ?? "—"),
                ip: String(o.ip ?? o.address ?? ""),
                healthy: !!o.healthy,
                changed: !!o.changed,
                failureReason: o.failure_reason ? String(o.failure_reason) : null,
              })),
              expectedCodes,
            });
          }
        } catch (e: any) {
          warnings.push(`events (pool ${poolId}): ${e.message ?? String(e)}`);
        }
      }),
    );

    allEvents.sort((a, b) => b.timestamp.localeCompare(a.timestamp));

    const pools = zonePoolIds.map((id) => ({ id, name: poolMeta.get(id)?.name ?? id }));

    return {
      ok: true,
      pools,
      events: allEvents.slice(0, 100),
      warning: warnings.length ? warnings.join(" | ") : null,
    };
  });
