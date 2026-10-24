// Cloudflare WAF — telas de configuração novas (menu Ações): Managed rules,
// Load Balancing (pools/origens) e a contagem de acertos das Custom rules.
// Toda alteração entra no histórico da zona (audit_logs).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { requirePermission } from "@/lib/authz";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { readSecret } from "@/lib/crypto.server";
import { cfGraphql } from "@/lib/cloudflare-plan";

const CF_API = "https://api.cloudflare.com/client/v4";
const MANAGED_PHASE = "http_request_firewall_managed";

type Ctx = { token: string; zoneId: string; zoneName: string; accountId: string | null };
async function ctxFor(zoneId: string): Promise<Ctx | { ok: false; error: string }> {
  const [{ data: zone }, { data: integ }] = await Promise.all([
    supabaseAdmin
      .from("cloudflare_zones")
      .select("id, name, account_id")
      .eq("id", zoneId)
      .maybeSingle(),
    supabaseAdmin
      .from("integrations")
      .select("api_key, enabled")
      .eq("provider", "cloudflare")
      .maybeSingle(),
  ]);
  if (!zone) return { ok: false, error: "Zona não sincronizada. Rode um sync primeiro." };
  if (!integ?.enabled || !integ?.api_key)
    return { ok: false, error: "Integração Cloudflare não está ativa ou sem token configurado." };
  return {
    token: readSecret(integ.api_key),
    zoneId: zone.id,
    zoneName: zone.name,
    accountId: zone.account_id ?? null,
  };
}

async function cf(
  token: string,
  path: string,
  init?: RequestInit,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
): Promise<{ ok: boolean; status: number; json: any }> {
  const res = await fetch(`${CF_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok && json?.success !== false, status: res.status, json };
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cfError = (r: { status: number; json: any }) =>
  String(r.json?.errors?.[0]?.message ?? `HTTP ${r.status}`);

async function audit(args: {
  action: "update_managed" | "update_lb";
  zoneId: string;
  zoneName: string;
  userId: string;
  message: string;
  details: Record<string, unknown>;
}) {
  try {
    const { logCloudflareAudit, resolveUserEmail } = await import("@/lib/cloudflare.server");
    await logCloudflareAudit({
      action: args.action,
      status: "success",
      zoneId: args.zoneId,
      zoneName: args.zoneName,
      userEmail: await resolveUserEmail(args.userId, null),
      message: args.message,
      details: args.details,
    });
  } catch (e) {
    console.error("[cloudflare.config audit]", e);
  }
}

// ── Custom rules: quantas vezes cada regra bateu (24 h) ───────────────────────
export const getCustomRuleHits = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId: string }) =>
    z.object({ zoneId: z.string().min(1).max(64) }).parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<{ ok: true; hits: Record<string, number> } | { ok: false; error: string }> => {
      await requirePermission(
        context.supabase,
        context.userId,
        "cloudflare-waf",
        "manage_custom_rules",
      );
      const c = await ctxFor(data.zoneId);
      if ("ok" in c) return c;
      const until = new Date();
      const since = new Date(until.getTime() - 24 * 60 * 60 * 1000);
      const q = `query($zone:String!,$since:Time!,$until:Time!){ viewer { zones(filter:{zoneTag:$zone}) {
      hits: firewallEventsAdaptiveGroups(limit:500, filter:{datetime_geq:$since, datetime_leq:$until, OR:[{source:"firewallCustom"},{source:"firewallrules"}]}) { count dimensions { ruleId } }
    } } }`;
      try {
        const res = await cfGraphql(c.token, q, {
          zone: c.zoneId,
          since: since.toISOString(),
          until: until.toISOString(),
        });
        const zone = res.json?.data?.viewer?.zones?.[0];
        if (!zone)
          return {
            ok: false,
            error: String(res.json?.errors?.[0]?.message ?? "Consulta sem resultado."),
          };
        const hits: Record<string, number> = {};
        for (const g of zone.hits ?? []) {
          const id = String(g.dimensions?.ruleId ?? "");
          if (id) hits[id] = (hits[id] ?? 0) + Number(g.count ?? 0);
        }
        return { ok: true, hits };
      } catch (e) {
        return { ok: false, error: e instanceof Error ? e.message : String(e) };
      }
    },
  );

// ── Managed rules ────────────────────────────────────────────────────────────
export type ManagedRuleOverride = {
  ruleId: string;
  action: string | null;
  enabled: boolean | null;
};
export type ManagedDeployment = {
  ruleId: string; // regra "execute" no entrypoint da zona
  rulesetId: string; // ruleset gerenciado executado
  name: string;
  description: string;
  enabled: boolean;
  expression: string;
  defaultAction: string | null; // overrides.action (null = padrão da Cloudflare)
  overrides: ManagedRuleOverride[];
  categoryOverrides: number;
  hits24h: number | null;
};

export const getManagedRules = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId: string }) =>
    z.object({ zoneId: z.string().min(1).max(64) }).parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<
      | {
          ok: true;
          entrypointId: string | null;
          deployments: ManagedDeployment[];
          available: Array<{ id: string; name: string; description: string }>;
        }
      | { ok: false; error: string }
    > => {
      await requirePermission(
        context.supabase,
        context.userId,
        "cloudflare-waf",
        "manage_managed_rules",
      );
      const c = await ctxFor(data.zoneId);
      if ("ok" in c) return c;
      const [entry, list] = await Promise.all([
        cf(c.token, `/zones/${c.zoneId}/rulesets/phases/${MANAGED_PHASE}/entrypoint`),
        cf(c.token, `/zones/${c.zoneId}/rulesets`),
      ]);
      if (!list.ok) return { ok: false, error: cfError(list) };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const managed = ((list.json?.result ?? []) as any[]).filter(
        (r) => r.kind === "managed" && r.phase === MANAGED_PHASE,
      );
      const names = new Map(
        managed.map((r) => [
          String(r.id),
          { name: String(r.name ?? r.id), description: String(r.description ?? "") },
        ]),
      );
      // 404 no entrypoint = nenhum managed ruleset implantado ainda
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const rules = (entry.ok ? ((entry.json?.result?.rules ?? []) as any[]) : []).filter(
        (r) => r.action === "execute",
      );

      // Acertos por ruleset nas últimas 24 h (tolerante a erro de plano)
      const hits = new Map<string, number>();
      try {
        const until = new Date();
        const since = new Date(until.getTime() - 24 * 60 * 60 * 1000);
        const res = await cfGraphql(
          c.token,
          `query($zone:String!,$since:Time!,$until:Time!){ viewer { zones(filter:{zoneTag:$zone}) {
            m: firewallEventsAdaptiveGroups(limit:50, filter:{datetime_geq:$since, datetime_leq:$until, source:"firewallManaged"}) { count dimensions { rulesetId } }
          } } }`,
          { zone: c.zoneId, since: since.toISOString(), until: until.toISOString() },
        );
        for (const g of res.json?.data?.viewer?.zones?.[0]?.m ?? [])
          hits.set(String(g.dimensions?.rulesetId ?? ""), Number(g.count ?? 0));
      } catch {
        /* sem contagem */
      }

      const deployments: ManagedDeployment[] = rules.map((r) => {
        const rsId = String(r.action_parameters?.id ?? "");
        const ov = r.action_parameters?.overrides ?? {};
        return {
          ruleId: String(r.id),
          rulesetId: rsId,
          name: names.get(rsId)?.name ?? (r.description || rsId),
          description: names.get(rsId)?.description ?? "",
          enabled: r.enabled !== false,
          expression: String(r.expression ?? "true"),
          defaultAction: ov.action ? String(ov.action) : null,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          overrides: ((ov.rules ?? []) as any[]).map((o) => ({
            ruleId: String(o.id),
            action: o.action ? String(o.action) : null,
            enabled: typeof o.enabled === "boolean" ? o.enabled : null,
          })),
          categoryOverrides: Array.isArray(ov.categories) ? ov.categories.length : 0,
          hits24h: hits.size ? (hits.get(rsId) ?? 0) : null,
        };
      });
      const deployed = new Set(deployments.map((d) => d.rulesetId));
      return {
        ok: true,
        entrypointId: entry.ok ? String(entry.json?.result?.id ?? "") || null : null,
        deployments,
        available: managed
          .filter((m) => !deployed.has(String(m.id)))
          .map((m) => ({
            id: String(m.id),
            name: String(m.name ?? m.id),
            description: String(m.description ?? ""),
          })),
      };
    },
  );

const MANAGED_ACTIONS = ["block", "managed_challenge", "js_challenge", "challenge", "log"] as const;

export const updateManagedRule = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator(
    (input: {
      zoneId: string;
      entrypointId: string;
      ruleId: string;
      enabled?: boolean;
      defaultAction?: string | null;
      removeOverrideIds?: string[];
    }) =>
      z
        .object({
          zoneId: z.string().min(1).max(64),
          entrypointId: z.string().min(1).max(64),
          ruleId: z.string().min(1).max(64),
          enabled: z.boolean().optional(),
          defaultAction: z.enum(MANAGED_ACTIONS).nullable().optional(),
          removeOverrideIds: z.array(z.string().max(64)).max(200).optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true } | { ok: false; error: string }> => {
    await requirePermission(
      context.supabase,
      context.userId,
      "cloudflare-waf",
      "manage_managed_rules",
    );
    const c = await ctxFor(data.zoneId);
    if ("ok" in c) return c;
    const cur = await cf(c.token, `/zones/${c.zoneId}/rulesets/${data.entrypointId}`);
    if (!cur.ok) return { ok: false, error: cfError(cur) };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rule = ((cur.json?.result?.rules ?? []) as any[]).find(
      (r) => String(r.id) === data.ruleId,
    );
    if (!rule) return { ok: false, error: "Regra não encontrada no entrypoint de Managed rules." };

    const ov = { ...(rule.action_parameters?.overrides ?? {}) };
    const before = {
      enabled: rule.enabled !== false,
      action: ov.action ?? "padrão",
      exceptions: (ov.rules ?? []).length,
    };
    if (data.defaultAction !== undefined) {
      if (data.defaultAction) ov.action = data.defaultAction;
      else delete ov.action;
    }
    if (data.removeOverrideIds?.length) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ov.rules = ((ov.rules ?? []) as any[]).filter(
        (o) => !data.removeOverrideIds!.includes(String(o.id)),
      );
      if (!ov.rules.length) delete ov.rules;
    }
    const enabled = data.enabled ?? rule.enabled !== false;
    const body = {
      action: "execute",
      expression: rule.expression ?? "true",
      description: rule.description ?? "",
      enabled,
      action_parameters: {
        ...rule.action_parameters,
        ...(Object.keys(ov).length ? { overrides: ov } : { overrides: undefined }),
      },
    };
    const res = await cf(
      c.token,
      `/zones/${c.zoneId}/rulesets/${data.entrypointId}/rules/${data.ruleId}`,
      {
        method: "PATCH",
        body: JSON.stringify(body),
      },
    );
    if (!res.ok) return { ok: false, error: cfError(res) };
    const after = { enabled, action: ov.action ?? "padrão", exceptions: (ov.rules ?? []).length };
    const changes = (Object.keys(before) as Array<keyof typeof before>)
      .filter((k) => before[k] !== after[k])
      .map((k) => ({
        path: k === "enabled" ? "Ativo" : k === "action" ? "Ação padrão" : "Exceções",
        before: before[k],
        after: after[k],
      }));
    await audit({
      action: "update_managed",
      zoneId: c.zoneId,
      zoneName: c.zoneName,
      userId: context.userId,
      message: `Managed ruleset "${rule.description || rule.action_parameters?.id}" alterado em ${c.zoneName}`,
      details: {
        category: "Managed rules",
        description: rule.description || String(rule.action_parameters?.id ?? ""),
        changes,
      },
    });
    return { ok: true };
  });

// ── Load Balancing: balanceadores, pools e origens ───────────────────────────
export type LbOrigin = {
  name: string;
  address: string;
  enabled: boolean;
  weight: number;
  healthy: boolean | null;
  rttMs: number | null;
  failure: string | null;
};
export type LbPool = {
  id: string;
  name: string;
  enabled: boolean;
  monitor: string | null;
  healthy: boolean | null;
  origins: LbOrigin[];
};
export type LbBalancer = {
  id: string;
  name: string;
  enabled: boolean;
  proxied: boolean;
  steering: string;
  sessionAffinity: string;
  defaultPools: string[];
  fallbackPool: string | null;
};

export const getLoadBalancingConfig = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId: string }) =>
    z.object({ zoneId: z.string().min(1).max(64) }).parse(input),
  )
  .handler(
    async ({
      data,
      context,
    }): Promise<
      | { ok: true; balancers: LbBalancer[]; pools: LbPool[] }
      | { ok: false; error: string; notConfigured?: boolean }
    > => {
      await requirePermission(
        context.supabase,
        context.userId,
        "cloudflare-waf",
        "manage_load_balancing",
      );
      const c = await ctxFor(data.zoneId);
      if ("ok" in c) return c;
      if (!c.accountId)
        return { ok: false, error: "Zona sem conta associada. Rode um sync primeiro." };
      const lbs = await cf(c.token, `/zones/${c.zoneId}/load_balancers`);
      if (!lbs.ok) return { ok: false, error: cfError(lbs) };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const balancers: LbBalancer[] = ((lbs.json?.result ?? []) as any[]).map((b) => ({
        id: String(b.id),
        name: String(b.name),
        enabled: b.enabled !== false,
        proxied: !!b.proxied,
        steering: String(b.steering_policy || "off"),
        sessionAffinity: String(b.session_affinity || "none"),
        defaultPools: (b.default_pools ?? []).map(String),
        fallbackPool: b.fallback_pool ? String(b.fallback_pool) : null,
      }));
      if (!balancers.length)
        return {
          ok: false,
          notConfigured: true,
          error: "Nenhum Load Balancer configurado nesta zona.",
        };

      const used = new Set(
        balancers.flatMap((b) => [...b.defaultPools, ...(b.fallbackPool ? [b.fallbackPool] : [])]),
      );
      const all = await cf(c.token, `/accounts/${c.accountId}/load_balancers/pools`);
      if (!all.ok) return { ok: false, error: cfError(all) };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = ((all.json?.result ?? []) as any[]).filter((p) => used.has(String(p.id)));
      const pools: LbPool[] = await Promise.all(
        raw.map(async (p) => {
          // Saúde por origem: consolida o resultado dos POPs que monitoram a pool
          const health = new Map<
            string,
            { healthy: boolean; rtt: number | null; failure: string | null }
          >();
          try {
            const h = await cf(
              c.token,
              `/accounts/${c.accountId}/load_balancers/pools/${p.id}/health`,
            );
            const pops = h.ok ? (h.json?.result?.pop_health ?? {}) : {};
            for (const pop of Object.values(pops) as Array<{
              origins?: Array<
                Record<string, { healthy?: boolean; rtt?: string; failure_reason?: string }>
              >;
            }>) {
              for (const o of pop.origins ?? []) {
                for (const [addr, st] of Object.entries(o)) {
                  const prev = health.get(addr);
                  const rtt = st.rtt ? Number(String(st.rtt).replace(/ms$/, "")) : null;
                  health.set(addr, {
                    healthy: (prev?.healthy ?? true) && st.healthy !== false,
                    rtt: rtt ?? prev?.rtt ?? null,
                    failure:
                      st.healthy === false
                        ? (st.failure_reason ?? prev?.failure ?? "falha")
                        : (prev?.failure ?? null),
                  });
                }
              }
            }
          } catch {
            /* sem saúde */
          }
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const origins: LbOrigin[] = ((p.origins ?? []) as any[]).map((o) => {
            const hh = health.get(String(o.address));
            return {
              name: String(o.name),
              address: String(o.address),
              enabled: o.enabled !== false,
              weight: Number(o.weight ?? 1),
              healthy: hh ? hh.healthy : null,
              rttMs: hh?.rtt ?? null,
              failure: hh?.failure ?? null,
            };
          });
          const known = origins.filter((o) => o.enabled && o.healthy !== null);
          return {
            id: String(p.id),
            name: String(p.name),
            enabled: p.enabled !== false,
            monitor: p.monitor ? String(p.monitor) : null,
            healthy: known.length ? known.every((o) => o.healthy) : null,
            origins,
          };
        }),
      );
      return { ok: true, balancers, pools };
    },
  );

export const updateLbPool = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator(
    (input: {
      zoneId: string;
      poolId: string;
      enabled?: boolean;
      origins?: Array<{ name: string; address: string; enabled: boolean; weight: number }>;
    }) =>
      z
        .object({
          zoneId: z.string().min(1).max(64),
          poolId: z.string().min(1).max(64),
          enabled: z.boolean().optional(),
          origins: z
            .array(
              z.object({
                name: z.string().min(1).max(100),
                address: z.string().min(1).max(255),
                enabled: z.boolean(),
                weight: z.number().min(0).max(1),
              }),
            )
            .min(1)
            .max(50)
            .optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ ok: true } | { ok: false; error: string }> => {
    await requirePermission(
      context.supabase,
      context.userId,
      "cloudflare-waf",
      "manage_load_balancing",
    );
    const c = await ctxFor(data.zoneId);
    if ("ok" in c) return c;
    if (!c.accountId) return { ok: false, error: "Zona sem conta associada." };
    const path = `/accounts/${c.accountId}/load_balancers/pools/${data.poolId}`;
    const cur = await cf(c.token, path);
    if (!cur.ok) return { ok: false, error: cfError(cur) };
    const pool = cur.json?.result ?? {};
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const prevOrigins = (pool.origins ?? []) as any[];
    const origins = data.origins
      ? data.origins.map((o) => {
          // preserva campos que a tela não edita (header, virtual_network_id…)
          const prev = prevOrigins.find((p) => String(p.name) === o.name) ?? {};
          return {
            ...prev,
            name: o.name,
            address: o.address,
            enabled: o.enabled,
            weight: o.weight,
          };
        })
      : prevOrigins;
    const res = await cf(c.token, path, {
      method: "PATCH",
      body: JSON.stringify({
        origins,
        ...(data.enabled !== undefined ? { enabled: data.enabled } : {}),
      }),
    });
    if (!res.ok) return { ok: false, error: cfError(res) };

    const changes: Array<{ path: string; before: unknown; after: unknown }> = [];
    if (data.enabled !== undefined && (pool.enabled !== false) !== data.enabled)
      changes.push({
        path: `Pool ${pool.name}`,
        before: pool.enabled !== false ? "ativa" : "desativada",
        after: data.enabled ? "ativa" : "desativada",
      });
    for (const o of data.origins ?? []) {
      const p = prevOrigins.find((x) => String(x.name) === o.name);
      if (!p) {
        changes.push({
          path: `Origem ${o.name}`,
          before: null,
          after: `${o.address} (peso ${o.weight})`,
        });
        continue;
      }
      if ((p.enabled !== false) !== o.enabled)
        changes.push({
          path: `Origem ${o.name}`,
          before: p.enabled !== false ? "ligada" : "desligada",
          after: o.enabled ? "ligada" : "desligada",
        });
      if (String(p.address) !== o.address)
        changes.push({ path: `Endereço de ${o.name}`, before: p.address, after: o.address });
      if (Number(p.weight ?? 1) !== o.weight)
        changes.push({ path: `Peso de ${o.name}`, before: p.weight ?? 1, after: o.weight });
    }
    for (const p of prevOrigins)
      if (data.origins && !data.origins.some((o) => o.name === String(p.name)))
        changes.push({ path: `Origem ${p.name}`, before: p.address, after: null });
    await audit({
      action: "update_lb",
      zoneId: c.zoneId,
      zoneName: c.zoneName,
      userId: context.userId,
      message: `Pool "${pool.name}" alterada (${changes.length} mudança(s))`,
      details: {
        category: "Load Balancing",
        description: String(pool.name ?? data.poolId),
        changes,
      },
    });
    return { ok: true };
  });
