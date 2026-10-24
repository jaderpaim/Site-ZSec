// Cloudflare WAF — visão "organizada por host": a lista de hosts da zona
// (registros DNS A/AAAA/CNAME somados às métricas de tráfego por hostname) e o
// histórico de alterações da zona (audit_logs gravados pelo próprio módulo).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { hasPermission, requirePermission } from "@/lib/authz";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { readSecret } from "@/lib/crypto.server";
import { cfGraphql } from "@/lib/cloudflare-plan";
import type { Json } from "@/integrations/supabase/types";

// Mesmas classes usadas em cloudflare.security.functions.ts
const MITIGATION_ACTIONS_GQL = `["block","challenge","jschallenge","managed_challenge","precursor_interstitial_page_issued"]`;
const ORIGIN_CACHE_STATUSES = new Set(["miss", "expired", "bypass", "dynamic", "none", "unknown"]);
const PROXIABLE = new Set(["A", "AAAA", "CNAME"]);

export type ZoneHost = {
  host: string;
  /** Registro DNS do host (null quando o host só aparece no tráfego, ex.: wildcard) */
  record: {
    id: string;
    type: string;
    content: string;
    proxied: boolean;
    ttl: number | null;
    comment: string | null;
  } | null;
  requests: number;
  /** % das requisições servidas pela borda (cache) */
  cachedPct: number | null;
  mitigated: number;
  errors5xx: number;
};

async function cfToken(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("integrations")
    .select("api_key, enabled")
    .eq("provider", "cloudflare")
    .maybeSingle();
  if (!data?.enabled || !data?.api_key) return null;
  return readSecret(data.api_key);
}

export const getZoneHosts = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId: string; days?: number }) =>
    z
      .object({
        zoneId: z.string().min(1).max(64),
        days: z.union([z.literal(1), z.literal(3)]).default(1),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<
      { ok: true; hosts: ZoneHost[]; metricsError: string | null } | { ok: false; error: string }
    > => {
      await requirePermission(context.supabase, context.userId, "cloudflare-waf", "view");

      const { data: recs, error } = await supabaseAdmin
        .from("cloudflare_dns_records")
        .select("id, name, type, content, proxied, ttl, comment")
        .eq("zone_id", data.zoneId)
        .in("type", [...PROXIABLE]);
      if (error) return { ok: false, error: error.message };

      const byHost = new Map<string, ZoneHost>();
      for (const r of recs ?? []) {
        const host = String(r.name).toLowerCase();
        // Mais de um registro pro mesmo nome (round-robin): mantém o primeiro
        if (byHost.has(host)) continue;
        byHost.set(host, {
          host,
          record: {
            id: r.id,
            type: r.type,
            content: r.content ?? "",
            proxied: !!r.proxied,
            ttl: r.ttl ?? null,
            comment: r.comment ?? null,
          },
          requests: 0,
          cachedPct: null,
          mitigated: 0,
          errors5xx: 0,
        });
      }

      // Métricas por hostname — tolerante a erro: sem elas a lista de hosts
      // (vinda do DNS) continua aparecendo.
      let metricsError: string | null = null;
      const token = await cfToken();
      if (!token) metricsError = "Integração Cloudflare não está ativa ou sem token configurado.";
      else {
        const until = new Date();
        const since = new Date(until.getTime() - data.days * 24 * 60 * 60 * 1000);
        const q = `query($zone:String!,$since:Time!,$until:Time!){ viewer { zones(filter:{zoneTag:$zone}) {
          byCache: httpRequestsAdaptiveGroups(limit:5000, filter:{datetime_geq:$since, datetime_leq:$until}) { count dimensions { clientRequestHTTPHost cacheStatus } }
          mitigated: httpRequestsAdaptiveGroups(limit:1000, filter:{datetime_geq:$since, datetime_leq:$until, securityAction_in:${MITIGATION_ACTIONS_GQL}}) { count dimensions { clientRequestHTTPHost } }
          errors: httpRequestsAdaptiveGroups(limit:1000, filter:{datetime_geq:$since, datetime_leq:$until, edgeResponseStatus_geq:500}) { count dimensions { clientRequestHTTPHost } }
        } } }`;
        try {
          const res = await cfGraphql(token, q, {
            zone: data.zoneId,
            since: since.toISOString(),
            until: until.toISOString(),
          });
          const zone = res.json?.data?.viewer?.zones?.[0] ?? {};
          if (res.json?.errors?.length)
            metricsError = String(res.json.errors[0]?.message ?? "erro na consulta");
          const ensure = (h: string) => {
            let e = byHost.get(h);
            if (!e) {
              e = {
                host: h,
                record: null,
                requests: 0,
                cachedPct: null,
                mitigated: 0,
                errors5xx: 0,
              };
              byHost.set(h, e);
            }
            return e;
          };
          const cached = new Map<string, number>();
          for (const g of zone.byCache ?? []) {
            const h = String(g.dimensions?.clientRequestHTTPHost ?? "").toLowerCase();
            if (!h) continue;
            const n = Number(g.count ?? 0);
            ensure(h).requests += n;
            const st = String(g.dimensions?.cacheStatus ?? "none").toLowerCase();
            if (!ORIGIN_CACHE_STATUSES.has(st)) cached.set(h, (cached.get(h) ?? 0) + n);
          }
          for (const [h, e] of byHost)
            if (e.requests > 0)
              e.cachedPct = Math.round(((cached.get(h) ?? 0) / e.requests) * 1000) / 10;
          for (const g of zone.mitigated ?? []) {
            const h = String(g.dimensions?.clientRequestHTTPHost ?? "").toLowerCase();
            if (h) ensure(h).mitigated += Number(g.count ?? 0);
          }
          for (const g of zone.errors ?? []) {
            const h = String(g.dimensions?.clientRequestHTTPHost ?? "").toLowerCase();
            if (h) ensure(h).errors5xx += Number(g.count ?? 0);
          }
        } catch (e) {
          metricsError = e instanceof Error ? e.message : String(e);
        }
      }

      const hosts = [...byHost.values()].sort(
        (a, b) => b.requests - a.requests || a.host.localeCompare(b.host),
      );
      return { ok: true, hosts, metricsError };
    },
  );

export type ZoneChange = {
  id: string;
  action: string;
  status: string;
  userEmail: string | null;
  createdAt: string;
  message: string | null;
  details: Json | null;
  /** zsec = feito pelo Z-Sec; cloudflare = feito direto no painel da Cloudflare */
  source: "zsec" | "cloudflare";
};

// Log de auditoria da conta Cloudflare (precisa de "Account Audit Logs: Read"
// no token). Só entram as ações feitas pela interface da Cloudflare: o que o
// Z-Sec faz vai pela API e já está em audit_logs, com mais detalhes.
async function cloudflareAuditChanges(
  zoneId: string,
  days: number,
): Promise<{
  changes: ZoneChange[];
  status: "ok" | "denied" | "unavailable";
  message: string | null;
}> {
  const [{ data: zone }, token] = await Promise.all([
    supabaseAdmin
      .from("cloudflare_zones")
      .select("name, account_id")
      .eq("id", zoneId)
      .maybeSingle(),
    cfToken(),
  ]);
  if (!zone?.account_id || !token)
    return {
      changes: [],
      status: "unavailable",
      message: "Zona sem conta associada ou integração inativa.",
    };
  const url = new URL(
    `https://api.cloudflare.com/client/v4/accounts/${zone.account_id}/audit_logs`,
  );
  url.searchParams.set("since", new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString());
  url.searchParams.set("zone.name", zone.name);
  url.searchParams.set("direction", "desc");
  url.searchParams.set("per_page", "200");
  try {
    const res = await fetch(url.toString(), { headers: { Authorization: `Bearer ${token}` } });
    const json: { success?: boolean; result?: unknown[]; errors?: Array<{ message?: string }> } =
      await res.json().catch(() => ({}));
    if (res.status === 403 || res.status === 401)
      return {
        changes: [],
        status: "denied",
        message: "O token da integração não tem a permissão “Account Audit Logs: Read”.",
      };
    if (!res.ok || json.success === false)
      return {
        changes: [],
        status: "unavailable",
        message: json.errors?.[0]?.message ?? `HTTP ${res.status}`,
      };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rows = (json.result ?? []) as any[];
    const changes: ZoneChange[] = rows
      .filter((r) => String(r.interface ?? "").toUpperCase() !== "API")
      .map((r) => {
        const oldV = r.oldValueJson && typeof r.oldValueJson === "object" ? r.oldValueJson : null;
        const newV = r.newValueJson && typeof r.newValueJson === "object" ? r.newValueJson : null;
        const keys = new Set([...Object.keys(oldV ?? {}), ...Object.keys(newV ?? {})]);
        const diff = [...keys]
          .filter((k) => JSON.stringify(oldV?.[k] ?? null) !== JSON.stringify(newV?.[k] ?? null))
          .slice(0, 20)
          .map((k) => ({ path: k, before: oldV?.[k] ?? null, after: newV?.[k] ?? null }));
        const name = newV?.name ?? oldV?.name ?? r.metadata?.name ?? r.resource?.id ?? "";
        return {
          id: `cf-${r.id}`,
          action: `cf:${String(r.action?.type ?? "change")}`,
          status: r.action?.result === false ? "error" : "success",
          userEmail: r.actor?.email ?? null,
          createdAt: String(r.when),
          message: r.action?.info ?? null,
          details: {
            name: String(name),
            resourceType: String(r.resource?.type ?? ""),
            changes: diff,
          } as unknown as Json,
          source: "cloudflare" as const,
        };
      });
    return { changes, status: "ok", message: null };
  } catch (e) {
    return {
      changes: [],
      status: "unavailable",
      message: e instanceof Error ? e.message : String(e),
    };
  }
}

/** Histórico de alterações da zona (o que o módulo gravou em audit_logs). */
export const getZoneChanges = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId: string; days?: number; limit?: number }) =>
    z
      .object({
        zoneId: z.string().min(1).max(64),
        days: z.number().int().min(1).max(365).default(30),
        limit: z.number().int().min(1).max(500).default(200),
      })
      .parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<
      | {
          ok: true;
          changes: ZoneChange[];
          cloudflareAudit: { status: "ok" | "denied" | "unavailable"; message: string | null };
        }
      | { ok: false; error: string; denied?: boolean }
    > => {
      const allowed = await hasPermission(
        context.supabase,
        context.userId,
        "cloudflare-waf",
        "view_history",
      );
      if (!allowed)
        return {
          ok: false,
          denied: true,
          error: "Sem permissão para ver o histórico de alterações.",
        };
      const since = new Date(Date.now() - data.days * 24 * 60 * 60 * 1000).toISOString();
      const { data: rows, error } = await supabaseAdmin
        .from("audit_logs")
        .select("id, action, status, user_email, created_at, message, details")
        .eq("zone_id", data.zoneId)
        .gte("created_at", since)
        .order("created_at", { ascending: false })
        .limit(data.limit);
      if (error) return { ok: false, error: error.message };
      const own: ZoneChange[] = (rows ?? []).map((r) => ({
        id: r.id,
        action: r.action,
        status: r.status,
        userEmail: r.user_email,
        createdAt: r.created_at,
        message: r.message,
        details: r.details ?? null,
        source: "zsec" as const,
      }));
      const cf = await cloudflareAuditChanges(data.zoneId, data.days);
      const changes = [...own, ...cf.changes]
        .sort((x, y) => new Date(y.createdAt).getTime() - new Date(x.createdAt).getTime())
        .slice(0, data.limit);
      return { ok: true, changes, cloudflareAudit: { status: cf.status, message: cf.message } };
    },
  );

// ── Painel do host: segurança e cache ────────────────────────────────────────
// Mesmo filtro de "ruído" de cloudflare.security.functions.ts (eventos de
// desafio resolvido/falho e regras gerenciadas internas não contam como evento)
const EVENTS_NOISE_FILTER_GQL = `AND:[{action_neq:"challenge_solved"},{action_neq:"challenge_failed"},{action_neq:"challenge_bypassed"},{action_neq:"jschallenge_solved"},{action_neq:"jschallenge_failed"},{action_neq:"jschallenge_bypassed"},{action_neq:"managed_challenge_skipped"},{action_neq:"managed_challenge_non_interactive_solved"},{action_neq:"managed_challenge_interactive_solved"},{action_neq:"managed_challenge_bypassed"},{action_neq:"managed_challenge_failed"},{action_neq:"precursor_interstitial_page_bypassed"},{action_neq:"precursor_interstitial_page_solved"},{OR:[{ruleId_like:"999___"},{ruleId_like:"900___"},{ruleId:"981176"},{AND:[{ruleId_notlike:"9_____"},{ruleId_notlike:"uri-9_____"}]}]}]`;

const hostInput = (input: { zoneId: string; host: string; days?: number }) =>
  z
    .object({
      zoneId: z.string().min(1).max(64),
      host: z.string().min(1).max(255),
      days: z.union([z.literal(1), z.literal(3)]).default(1),
    })
    .parse(input);

function windowOf(days: number) {
  const until = new Date();
  return {
    since: new Date(until.getTime() - days * 24 * 60 * 60 * 1000).toISOString(),
    until: until.toISOString(),
  };
}

export type HostSecurity = {
  rules: Array<{
    source: string;
    ruleId: string;
    description: string;
    action: string;
    count: number;
  }>;
  topIps: Array<{ ip: string; country: string; count: number }>;
  topPaths: Array<{ path: string; count: number }>;
  events: Array<{
    datetime: string;
    action: string;
    source: string;
    ruleId: string;
    description: string;
    ip: string;
    country: string;
    method: string;
    path: string;
    rayName: string;
  }>;
};

export const getHostSecurity = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator(hostInput)
  .handler(
    async ({
      data,
      context,
    }): Promise<({ ok: true } & HostSecurity) | { ok: false; error: string }> => {
      await requirePermission(
        context.supabase,
        context.userId,
        "cloudflare-waf",
        "view_analytics_security",
      );
      const token = await cfToken();
      if (!token)
        return {
          ok: false,
          error: "Integração Cloudflare não está ativa ou sem token configurado.",
        };
      const base = `datetime_geq:$since, datetime_leq:$until, clientRequestHTTPHost:$host, ${EVENTS_NOISE_FILTER_GQL}`;
      const q = `query($zone:String!,$since:Time!,$until:Time!,$host:String!){ viewer { zones(filter:{zoneTag:$zone}) {
      rules: firewallEventsAdaptiveGroups(limit:15, orderBy:[count_DESC], filter:{${base}}) { count dimensions { source ruleId action } }
      ips: firewallEventsAdaptiveGroups(limit:5, orderBy:[count_DESC], filter:{${base}}) { count dimensions { clientIP clientCountryName } }
      paths: firewallEventsAdaptiveGroups(limit:5, orderBy:[count_DESC], filter:{${base}}) { count dimensions { clientRequestPath } }
      events: firewallEventsAdaptive(limit:25, orderBy:[datetime_DESC], filter:{${base}}) { datetime action source ruleId description clientIP clientCountryName clientRequestHTTPMethodName clientRequestPath rayName }
    } } }`;
      try {
        const res = await cfGraphql(token, q, {
          zone: data.zoneId,
          host: data.host,
          ...windowOf(data.days),
        });
        const zone = res.json?.data?.viewer?.zones?.[0];
        if (!zone)
          return {
            ok: false,
            error: String(res.json?.errors?.[0]?.message ?? "Consulta sem resultado."),
          };
        const events = ((zone.events ?? []) as any[]).map((e) => ({
          datetime: String(e.datetime ?? ""),
          action: String(e.action ?? ""),
          source: String(e.source ?? ""),
          ruleId: String(e.ruleId ?? ""),
          description: String(e.description ?? ""),
          ip: String(e.clientIP ?? ""),
          country: String(e.clientCountryName ?? ""),
          method: String(e.clientRequestHTTPMethodName ?? ""),
          path: String(e.clientRequestPath ?? "/"),
          rayName: String(e.rayName ?? ""),
        }));
        // A descrição da regra só vem nos eventos individuais
        const desc = new Map(
          events
            .filter((e) => e.description)
            .map((e) => [`${e.source}|${e.ruleId}`, e.description]),
        );
        return {
          ok: true,
          rules: ((zone.rules ?? []) as any[]).map((g) => {
            const source = String(g.dimensions?.source ?? "");
            const ruleId = String(g.dimensions?.ruleId ?? "");
            return {
              source,
              ruleId,
              action: String(g.dimensions?.action ?? ""),
              count: Number(g.count ?? 0),
              description: desc.get(`${source}|${ruleId}`) ?? "",
            };
          }),
          topIps: ((zone.ips ?? []) as any[]).map((g) => ({
            ip: String(g.dimensions?.clientIP ?? ""),
            country: String(g.dimensions?.clientCountryName ?? ""),
            count: Number(g.count ?? 0),
          })),
          topPaths: ((zone.paths ?? []) as any[]).map((g) => ({
            path: String(g.dimensions?.clientRequestPath ?? "/"),
            count: Number(g.count ?? 0),
          })),
          events,
        };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
  );

export type HostCache = {
  byStatus: Array<{ status: string; count: number }>;
  uncachedPaths: Array<{ path: string; count: number }>;
};

export const getHostCache = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator(hostInput)
  .handler(
    async ({
      data,
      context,
    }): Promise<({ ok: true } & HostCache) | { ok: false; error: string }> => {
      await requirePermission(
        context.supabase,
        context.userId,
        "cloudflare-waf",
        "view_analytics_http",
      );
      const token = await cfToken();
      if (!token)
        return {
          ok: false,
          error: "Integração Cloudflare não está ativa ou sem token configurado.",
        };
      const base = `datetime_geq:$since, datetime_leq:$until, clientRequestHTTPHost:$host`;
      const q = `query($zone:String!,$since:Time!,$until:Time!,$host:String!){ viewer { zones(filter:{zoneTag:$zone}) {
      byStatus: httpRequestsAdaptiveGroups(limit:20, orderBy:[count_DESC], filter:{${base}}) { count dimensions { cacheStatus } }
      uncached: httpRequestsAdaptiveGroups(limit:8, orderBy:[count_DESC], filter:{${base}, cacheStatus_in:["miss","expired","bypass","dynamic"]}) { count dimensions { clientRequestPath } }
    } } }`;
      try {
        const res = await cfGraphql(token, q, {
          zone: data.zoneId,
          host: data.host,
          ...windowOf(data.days),
        });
        const zone = res.json?.data?.viewer?.zones?.[0];
        if (!zone)
          return {
            ok: false,
            error: String(res.json?.errors?.[0]?.message ?? "Consulta sem resultado."),
          };
        return {
          ok: true,
          byStatus: ((zone.byStatus ?? []) as any[]).map((g) => ({
            status: String(g.dimensions?.cacheStatus ?? "none").toLowerCase(),
            count: Number(g.count ?? 0),
          })),
          uncachedPaths: ((zone.uncached ?? []) as any[]).map((g) => ({
            path: String(g.dimensions?.clientRequestPath ?? "/"),
            count: Number(g.count ?? 0),
          })),
        };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
  );
