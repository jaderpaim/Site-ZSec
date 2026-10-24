// Aba "Rules" dentro de Operações — Overview (visão geral das categorias de
// regra do Ruleset Engine da Cloudflare) e Page Rules (API legada, separada).
// Mesmo mecanismo já usado por Custom Rules (WAF) em cloudflare.functions.ts:
// GET/POST /zones/{zone}/rulesets/phases/{phase}/entrypoint(/rules) e
// PATCH/DELETE /zones/{zone}/rulesets/{rulesetId}/rules/{ruleId}.
//
// Permissões granulares: "manage_rules" só controla se a aba Rules aparece;
// "manage_rules_overview"/"manage_rules_page_rules" controlam cada sub-aba
// (Overview é visualização — dá pra ver as regras de todas as categorias já
// criadas); criar/editar/excluir/reordenar uma regra do Overview exige a
// permissão específica daquela categoria (manage_rules_overview_<categoria>,
// ver CATEGORY_PERMISSION); Page Rules usa só "manage_rules_page_rules" (não
// tem sub-categorias).
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { requirePermission, requireGlobalAdminRole } from "@/lib/authz";
import type { ModuleAction } from "@/lib/authz";
import { readSecret } from "@/lib/crypto.server";

function makeSupabase() {
  const url = process.env.SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.SUPABASE_PUBLISHABLE_KEY!;
  return createClient(url, serviceKey || anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

const CF_BASE = "https://api.cloudflare.com/client/v4";

async function resolveRulesContext(
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
  return { apiToken: readSecret(integ.api_key), zoneId: zoneRow.id };
}

// Page Rules (API legada) rejeita "Account API Token" — code 1011 "Page Rules
// endpoint does not support account owned tokens" — confirmado testando
// direto contra a API. Precisa de um User API Token à parte, guardado em
// integrations.config.page_rules_api_key (tela de Integrações), pra não
// arriscar trocar o token principal que já funciona pra tudo mais.
async function resolvePageRulesContext(
  zoneId: string | null,
): Promise<{ apiToken: string; zoneId: string } | { ok: false; error: string }> {
  if (!zoneId) return { ok: false, error: "Selecione uma zona." };
  const supabase = makeSupabase();
  const { data: zoneRow } = await supabase.from("cloudflare_zones").select("id").eq("id", zoneId).maybeSingle();
  if (!zoneRow?.id) return { ok: false, error: "Zona não sincronizada." };
  const { data: integ } = await supabase
    .from("integrations")
    .select("enabled, config")
    .eq("provider", "cloudflare")
    .maybeSingle();
  if (!integ?.enabled) {
    return { ok: false, error: "Integração Cloudflare não está ativa." };
  }
  const pageRulesToken = readSecret((integ.config as any)?.page_rules_api_key as string | null | undefined);
  if (!pageRulesToken) {
    return {
      ok: false,
      error:
        "Page Rules precisa de um User API Token separado (a API legada não aceita o Account API Token principal). Configure em Integrações → Cloudflare → \"API Token — Page Rules\".",
    };
  }
  return { apiToken: pageRulesToken, zoneId: zoneRow.id };
}

async function cfJson(apiToken: string, path: string, init?: RequestInit): Promise<{ res: Response; json: any }> {
  const res = await fetch(`${CF_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${apiToken}`, "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const json: any = await res.json().catch(() => ({}));
  return { res, json };
}

function cfErrorMessage(json: any, res: Response): string {
  const err = json?.errors?.[0];
  if (!err?.message) return `HTTP ${res.status}`;
  return err.code != null ? `${err.message} (code ${err.code})` : err.message;
}

// Log de auditoria + alerta via webhook/e-mail pra qualquer alteração numa
// regra já existente (editar/habilitar-desabilitar/excluir) — mesmo mecanismo
// já usado por createDnsRecord/updateDnsRecord em cloudflare.functions.ts.
// Nunca deixa um erro de log/alerta derrubar a operação principal na
// Cloudflare (o "await" dessa função sempre resolve, nunca rejeita).
async function logRuleChange(args: {
  kind: "create" | "update" | "toggle" | "delete";
  zoneId: string;
  category: string;
  description: string;
  enabled?: boolean | null;
  userId: string | null;
  // Estado antes/depois da regra (description/expression/action_parameters/
  // enabled) — logRuleChange calcula o diff campo a campo internamente (via
  // diffObjects). Sem isso os detalhes do log só mostravam o valor novo, sem
  // indicar o que de fato mudou numa edição.
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const { notifyRuleChanged, logCloudflareAudit, resolveUserEmail, resolveZoneName, diffObjects, summarizeChanges } = await import(
      "@/lib/cloudflare.server"
    );
    const changes = args.before && args.after ? diffObjects(args.before, args.after) : undefined;
    const [zoneName, userEmail] = await Promise.all([resolveZoneName(args.zoneId), resolveUserEmail(args.userId, null)]);
    const action =
      args.kind === "create" ? "create_rule" : args.kind === "update" ? "update_rule" : args.kind === "toggle" ? "toggle_rule" : "delete_rule";
    const changesSuffix = args.kind === "update" && changes ? ` — ${summarizeChanges(changes)}` : "";
    const message =
      args.kind === "create"
        ? `Regra "${args.description}" (${args.category}) criada em ${zoneName ?? args.zoneId}`
        : args.kind === "update"
        ? `Regra "${args.description}" (${args.category}) editada em ${zoneName ?? args.zoneId}${changesSuffix}`
        : args.kind === "toggle"
          ? `Regra "${args.description}" (${args.category}) ${args.enabled ? "habilitada" : "desabilitada"} em ${zoneName ?? args.zoneId}`
          : `Regra "${args.description}" (${args.category}) excluída em ${zoneName ?? args.zoneId}`;
    await Promise.all([
      logCloudflareAudit({
        action,
        status: "success",
        zoneId: args.zoneId,
        zoneName,
        userEmail,
        details: { category: args.category, description: args.description, enabled: args.enabled ?? null, changes: changes ?? [] },
        message,
      }),
      // Criação não tem template de alerta próprio: só fica no histórico
      args.kind === "create"
        ? Promise.resolve()
        : notifyRuleChanged({
        kind: args.kind,
        zoneId: args.zoneId,
        category: args.category,
        description: args.description,
        enabled: args.enabled ?? null,
        actorUserId: args.userId,
        changes,
      }),
    ]);
  } catch (e) {
    console.error("[logRuleChange] erro ao registrar log/alerta:", e);
  }
}

// ─── Overview — listagem por categoria (Ruleset Engine) ────────────────────────

export type RuleCategoryKey =
  | "url_rewrite"
  | "redirect"
  | "configuration"
  | "origin"
  | "request_header_transform"
  | "cache"
  | "cache_response"
  | "custom_error"
  | "response_header_transform";
// Todas as 9 categorias (Redirect incluso, mesmo tendo funções dedicadas
// próprias) — usado onde uma operação vale pra qualquer categoria por
// depender só de ruleset+ruleId (ex.: reorderOverviewRule).
export const ALL_RULE_CATEGORIES = [
  "url_rewrite",
  "redirect",
  "configuration",
  "origin",
  "request_header_transform",
  "cache",
  "cache_response",
  "custom_error",
  "response_header_transform",
] as const;

// Categorias com criar/editar habilitado via createOverviewRule/updateOverviewRule
// genéricos (Redirect tem funções dedicadas próprias, criadas antes deste
// registro genérico existir — ver createRedirectRule). Configuration Rules,
// Cache Rules e Cache Response Rules entram aqui: o FRONTEND monta o
// action_parameters certo pra cada uma (action "set_config"/
// "set_cache_settings"/"set_cache_control"/"set_cache_tags").
export type GenericCrudCategory =
  | "url_rewrite"
  | "origin"
  | "request_header_transform"
  | "response_header_transform"
  | "custom_error"
  | "configuration"
  | "cache"
  | "cache_response";
export const GENERIC_CRUD_CATEGORIES = [
  "url_rewrite",
  "origin",
  "request_header_transform",
  "response_header_transform",
  "custom_error",
  "configuration",
  "cache",
  "cache_response",
] as const;

// Fidelidade alta (documentação pública confirma o nome da phase 1:1 com o
// produto): url_rewrite, redirect, origin, cache, cache_response,
// response_header_transform, request_header_transform, custom_error,
// configuration.
const RULE_CATEGORIES: Record<RuleCategoryKey, { label: string; phase: string; supportsCrud: boolean }> = {
  url_rewrite: { label: "URL Rewrite Rules", phase: "http_request_transform", supportsCrud: true },
  redirect: { label: "Redirect Rules", phase: "http_request_dynamic_redirect", supportsCrud: true },
  configuration: { label: "Configuration Rules", phase: "http_config_settings", supportsCrud: true },
  origin: { label: "Origin Rules", phase: "http_request_origin", supportsCrud: true },
  request_header_transform: { label: "Request Header Transform Rules", phase: "http_request_late_transform", supportsCrud: true },
  cache: { label: "Cache Rules", phase: "http_request_cache_settings", supportsCrud: true },
  cache_response: { label: "Cache Response Rules", phase: "http_response_cache_settings", supportsCrud: true },
  custom_error: { label: "Custom Error Rules", phase: "http_custom_errors", supportsCrud: true },
  response_header_transform: { label: "Response Header Transform Rules", phase: "http_response_headers_transform", supportsCrud: true },
};

// Permissão granular exigida pra criar/editar/excluir/reordenar uma regra de
// cada categoria do Overview. Ver o header do arquivo — visualizar a
// listagem inteira exige só "manage_rules_overview".
export const CATEGORY_PERMISSION: Record<RuleCategoryKey, ModuleAction> = {
  url_rewrite: "manage_rules_overview_url_rewrite",
  redirect: "manage_rules_overview_redirect",
  configuration: "manage_rules_overview_configuration",
  origin: "manage_rules_overview_origin",
  request_header_transform: "manage_rules_overview_request_header_transform",
  cache: "manage_rules_overview_cache",
  cache_response: "manage_rules_overview_cache_response",
  custom_error: "manage_rules_overview_custom_error",
  response_header_transform: "manage_rules_overview_response_header_transform",
};

export type OverviewRule = {
  order: number;
  id: string;
  description: string;
  expression: string;
  action: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  action_parameters: Record<string, any> | null;
  enabled: boolean;
};

export type RuleCategoryResult = {
  key: RuleCategoryKey;
  label: string;
  supportsCrud: boolean;
  rulesetId: string | null;
  rules: OverviewRule[];
  error: string | null;
};

export type RulesOverviewResult = { ok: true; categories: RuleCategoryResult[] } | { ok: false; error: string };

export const getRulesOverview = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId?: string | null } | undefined) => ({ zoneId: input?.zoneId?.trim() || null }))
  .handler(async ({ data, context }): Promise<RulesOverviewResult> => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "manage_rules_overview");

    const ctx = await resolveRulesContext(data.zoneId);
    if ("error" in ctx) return ctx;

    const categories = await Promise.all(
      (Object.entries(RULE_CATEGORIES) as Array<[RuleCategoryKey, (typeof RULE_CATEGORIES)[RuleCategoryKey]]>).map(
        async ([key, cat]): Promise<RuleCategoryResult> => {
          try {
            const { res, json } = await cfJson(ctx.apiToken, `/zones/${ctx.zoneId}/rulesets/phases/${cat.phase}/entrypoint`);
            if (res.status === 404) {
              return { key, label: cat.label, supportsCrud: cat.supportsCrud, rulesetId: null, rules: [], error: null };
            }
            if (!res.ok) {
              return { key, label: cat.label, supportsCrud: cat.supportsCrud, rulesetId: null, rules: [], error: cfErrorMessage(json, res) };
            }
            const rules: OverviewRule[] = ((json?.result?.rules ?? []) as any[]).map((r, i) => ({
              order: i + 1,
              id: String(r.id),
              description: String(r.description ?? "—"),
              expression: String(r.expression ?? ""),
              action: String(r.action ?? "—"),
              action_parameters: r.action_parameters ?? null,
              enabled: r.enabled !== false,
            }));
            return { key, label: cat.label, supportsCrud: cat.supportsCrud, rulesetId: json?.result?.id ?? null, rules, error: null };
          } catch (e: any) {
            return { key, label: cat.label, supportsCrud: cat.supportsCrud, rulesetId: null, rules: [], error: e.message ?? String(e) };
          }
        },
      ),
    );

    return { ok: true, categories };
  });

// ─── Redirect Rules — primeira categoria com criar/editar/excluir completo ─────
const REDIRECT_PHASE = RULE_CATEGORIES.redirect.phase;
const STATUS_CODES = [301, 302, 303, 307, 308] as const;

// "Place at" no create (sem `position`, a Cloudflare adiciona no fim) e
// reordenar rule já existente via PATCH .../rules/{ruleId} só com `position`
// — mesmo schema pros dois, confirmado na documentação pública da Cloudflare
// (Update a rule in a ruleset): before/after aceitam "" pra topo/fim.
const rulePositionSchema = z.union([
  z.object({ index: z.number().int().min(0) }),
  z.object({ before: z.string().max(64) }),
  z.object({ after: z.string().max(64) }),
]);

// SEGURANÇA: update/delete/reorder de uma rule NUNCA devem confiar no
// `rulesetId` enviado pelo cliente pra decidir o alvo real da mutação — só a
// permissão é checada contra a `category` alegada (CATEGORY_PERMISSION), e um
// usuário com permissão só de UMA categoria consegue ver (via
// getRulesOverview, que é leitura livre) o rulesetId/ruleId de TODAS as
// categorias. Sem essa checagem, ele poderia alegar `category: "url_rewrite"`
// (categoria que tem permissão) e mandar o rulesetId/ruleId de uma rule de
// Redirect (categoria que não tem) — a API da Cloudflare não valida
// "categoria", só ruleset+rule, e editaria/excluiria a rule errada. Por isso
// o rulesetId real é sempre resolvido aqui a partir da phase (derivada da
// category já permission-checked), nunca do valor enviado pelo cliente.
async function resolveRulesetIdForPhase(
  apiToken: string,
  zoneId: string,
  phase: string,
): Promise<{ rulesetId: string; rules: any[] } | { error: string }> {
  const { res, json } = await cfJson(apiToken, `/zones/${zoneId}/rulesets/phases/${phase}/entrypoint`);
  if (!res.ok) return { error: cfErrorMessage(json, res) };
  const rulesetId = json?.result?.id;
  if (!rulesetId) return { error: "Ruleset não encontrado para esta categoria." };
  // O GET do entrypoint já devolve a lista de rules inteira — aproveita pra
  // achar o estado "antes" da regra sendo editada sem precisar de outro fetch
  // (ver diffObjects em updateOverviewRule/updateRedirectRule).
  return { rulesetId: String(rulesetId), rules: (json?.result?.rules ?? []) as any[] };
}

// Duas descobertas confirmadas com teste real (ao vivo, contra a API, regra
// de teste criada e excluída na hora):
// 1) POST .../rulesets/phases/{phase}/entrypoint/rules dá 10405 "Method not
//    allowed for this authentication scheme" com API Token nesta conta,
//    mesmo com todas as permissões corretas — só funciona com esse token
//    apontando direto pro rulesetId: POST .../rulesets/{rulesetId}/rules.
//    Por isso NUNCA usamos a forma por phase pra criar, só a documentada
//    aqui como fallback resolvemos o rulesetId primeiro (GET, que funciona
//    normal nos dois formatos) e postamos direto nele.
// 2) Numa zona/categoria que nunca teve nenhuma regra (nem aqui, nem pelo
//    dashboard nativo), a ruleset da phase ainda não existe (GET no
//    entrypoint devolve 404 "could not find entrypoint ruleset") — nesse
//    caso a primeira regra precisa ser criada JUNTO com a ruleset, via POST
//    /zones/{zone}/rulesets (kind:"zone", phase, rules:[...]), confirmado na
//    documentação oficial da Cloudflare (Transform Rules "Create a rule via
//    API").
async function createRuleInPhase(
  apiToken: string,
  zoneId: string,
  phase: string,
  ruleBody: Record<string, unknown>,
): Promise<{ res: Response; json: any }> {
  const check = await cfJson(apiToken, `/zones/${zoneId}/rulesets/phases/${phase}/entrypoint`);
  if (check.res.status === 404) {
    const { position: _position, ...ruleWithoutPosition } = ruleBody as Record<string, unknown> & { position?: unknown };
    return cfJson(apiToken, `/zones/${zoneId}/rulesets`, {
      method: "POST",
      body: JSON.stringify({
        name: `${phase} ruleset`,
        kind: "zone",
        phase,
        rules: [ruleWithoutPosition],
      }),
    });
  }
  const rulesetId = check.json?.result?.id;
  if (!rulesetId) return check;
  return cfJson(apiToken, `/zones/${zoneId}/rulesets/${rulesetId}/rules`, {
    method: "POST",
    body: JSON.stringify(ruleBody),
  });
}

function redirectActionParameters(input: {
  targetType: "static" | "dynamic";
  targetUrl: string;
  statusCode: number;
  preserveQueryString: boolean;
}) {
  return {
    from_value: {
      target_url: input.targetType === "dynamic" ? { expression: input.targetUrl } : { value: input.targetUrl },
      status_code: input.statusCode,
      preserve_query_string: input.preserveQueryString,
    },
  };
}

export const createRedirectRule = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator(
    (input: {
      zoneId: string;
      description: string;
      expression: string;
      targetType: "static" | "dynamic";
      targetUrl: string;
      statusCode: number;
      preserveQueryString: boolean;
      position?: { index: number } | { before: string } | { after: string };
    }) =>
      z
        .object({
          zoneId: z.string().min(1).max(64),
          description: z.string().min(1).max(500),
          expression: z.string().min(1).max(4096),
          targetType: z.enum(["static", "dynamic"]),
          targetUrl: z.string().min(1).max(2048),
          statusCode: z.union([z.literal(301), z.literal(302), z.literal(303), z.literal(307), z.literal(308)]),
          preserveQueryString: z.boolean(),
          position: rulePositionSchema.optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "manage_rules_overview_redirect");
    const ctx = await resolveRulesContext(data.zoneId);
    if ("error" in ctx) return ctx;

    const { res, json } = await createRuleInPhase(ctx.apiToken, ctx.zoneId, REDIRECT_PHASE, {
      description: data.description,
      expression: data.expression,
      action: "redirect",
      action_parameters: redirectActionParameters(data),
      // Por segurança, toda regra nova sobe desativada — precisa ser
      // habilitada manualmente depois de conferida (ver RulesInner no
      // frontend, que avisa isso com um alerta pós-criação).
      enabled: false,
      ...(data.position ? { position: data.position } : {}),
    });
    if (!res.ok) return { ok: false as const, error: cfErrorMessage(json, res) };
    await logRuleChange({
      kind: "create",
      zoneId: data.zoneId,
      category: RULE_CATEGORIES.redirect.label,
      description: data.description,
      enabled: false,
      userId: context.userId,
    });
    return { ok: true as const };
  });

export const updateRedirectRule = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator(
    (input: {
      zoneId: string;
      rulesetId: string;
      ruleId: string;
      description: string;
      expression: string;
      targetType: "static" | "dynamic";
      targetUrl: string;
      statusCode: number;
      preserveQueryString: boolean;
      enabled: boolean;
      changeKind?: "edit" | "toggle";
    }) =>
      z
        .object({
          zoneId: z.string().min(1).max(64),
          rulesetId: z.string().min(1).max(64),
          ruleId: z.string().min(1).max(64),
          description: z.string().min(1).max(500),
          expression: z.string().min(1).max(4096),
          targetType: z.enum(["static", "dynamic"]),
          targetUrl: z.string().min(1).max(2048),
          statusCode: z.union([z.literal(301), z.literal(302), z.literal(303), z.literal(307), z.literal(308)]),
          preserveQueryString: z.boolean(),
          enabled: z.boolean(),
          changeKind: z.enum(["edit", "toggle"]).optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "manage_rules_overview_redirect");
    const ctx = await resolveRulesContext(data.zoneId);
    if ("error" in ctx) return ctx;
    const rs = await resolveRulesetIdForPhase(ctx.apiToken, ctx.zoneId, REDIRECT_PHASE);
    if ("error" in rs) return { ok: false as const, error: rs.error };

    const { res, json } = await cfJson(ctx.apiToken, `/zones/${ctx.zoneId}/rulesets/${rs.rulesetId}/rules/${data.ruleId}`, {
      method: "PATCH",
      body: JSON.stringify({
        description: data.description,
        expression: data.expression,
        action: "redirect",
        action_parameters: redirectActionParameters(data),
        enabled: data.enabled,
      }),
    });
    if (!res.ok) return { ok: false as const, error: cfErrorMessage(json, res) };
    const beforeRule = rs.rules.find((r: any) => r.id === data.ruleId);
    await logRuleChange({
      kind: data.changeKind === "toggle" ? "toggle" : "update",
      zoneId: data.zoneId,
      category: RULE_CATEGORIES.redirect.label,
      description: data.description,
      enabled: data.enabled,
      userId: context.userId,
      before: beforeRule
        ? {
            description: beforeRule.description,
            expression: beforeRule.expression,
            enabled: beforeRule.enabled,
            action_parameters: beforeRule.action_parameters,
          }
        : null,
      after: {
        description: data.description,
        expression: data.expression,
        enabled: data.enabled,
        action_parameters: redirectActionParameters(data),
      },
    });
    return { ok: true as const };
  });

export const deleteRedirectRule = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId: string; rulesetId: string; ruleId: string; description?: string }) =>
    z
      .object({
        zoneId: z.string().min(1).max(64),
        rulesetId: z.string().min(1).max(64),
        ruleId: z.string().min(1).max(64),
        description: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "manage_rules_overview_redirect");
    // Excluir é destrutivo e irreversível — exige perfil global admin/super
    // admin, além da permissão granular da categoria.
    await requireGlobalAdminRole(context.supabase, context.userId);
    const ctx = await resolveRulesContext(data.zoneId);
    if ("error" in ctx) return ctx;
    const rs = await resolveRulesetIdForPhase(ctx.apiToken, ctx.zoneId, REDIRECT_PHASE);
    if ("error" in rs) return { ok: false as const, error: rs.error };

    const { res, json } = await cfJson(ctx.apiToken, `/zones/${ctx.zoneId}/rulesets/${rs.rulesetId}/rules/${data.ruleId}`, {
      method: "DELETE",
    });
    if (!res.ok) return { ok: false as const, error: cfErrorMessage(json, res) };
    await logRuleChange({
      kind: "delete",
      zoneId: data.zoneId,
      category: RULE_CATEGORIES.redirect.label,
      description: data.description ?? data.ruleId,
      userId: context.userId,
    });
    return { ok: true as const };
  });

// ─── Cache Rules — criar/editar via createOverviewRule/updateOverviewRule
// genéricos (o front monta o action_parameters rico: edge_ttl, browser_ttl,
// cache_key, vary, serve_stale, respect_strong_etags, origin_error_page_passthru).
// deleteCacheRule fica dedicado só por já existir e não precisar saber o
// formato específico da categoria pra deletar.
export const deleteCacheRule = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId: string; rulesetId: string; ruleId: string; description?: string }) =>
    z
      .object({
        zoneId: z.string().min(1).max(64),
        rulesetId: z.string().min(1).max(64),
        ruleId: z.string().min(1).max(64),
        description: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "manage_rules_overview_cache");
    await requireGlobalAdminRole(context.supabase, context.userId);
    const ctx = await resolveRulesContext(data.zoneId);
    if ("error" in ctx) return ctx;
    const rs = await resolveRulesetIdForPhase(ctx.apiToken, ctx.zoneId, RULE_CATEGORIES.cache.phase);
    if ("error" in rs) return { ok: false as const, error: rs.error };

    const { res, json } = await cfJson(ctx.apiToken, `/zones/${ctx.zoneId}/rulesets/${rs.rulesetId}/rules/${data.ruleId}`, {
      method: "DELETE",
    });
    if (!res.ok) return { ok: false as const, error: cfErrorMessage(json, res) };
    await logRuleChange({
      kind: "delete",
      zoneId: data.zoneId,
      category: RULE_CATEGORIES.cache.label,
      description: data.description ?? data.ruleId,
      userId: context.userId,
    });
    return { ok: true as const };
  });

// ─── Demais categorias (URL Rewrite, Origin, Request/Response Header ─────────
// Transform, Custom Error) — criar/editar/excluir genérico: o front monta o
// `action`/`action_parameters` certo pra cada categoria (formato específico
// de cada uma), e essas 3 funções só repassam pra API, igual o padrão já
// usado por updateCustomRule em cloudflare.functions.ts. "Configuration
// Rules" fica de fora — 0 exemplos reais na zona testada pra confirmar o
// formato de action_parameters dela.
const genericActionParametersSchema = z.record(z.string(), z.any());

export const createOverviewRule = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator(
    (input: {
      zoneId: string;
      category: GenericCrudCategory;
      description: string;
      expression: string;
      action: string;
      action_parameters: Record<string, unknown>;
      position?: { index: number } | { before: string } | { after: string };
    }) =>
      z
        .object({
          zoneId: z.string().min(1).max(64),
          category: z.enum(GENERIC_CRUD_CATEGORIES),
          description: z.string().min(1).max(500),
          expression: z.string().min(1).max(4096),
          action: z.string().min(1).max(64),
          action_parameters: genericActionParametersSchema,
          position: rulePositionSchema.optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", CATEGORY_PERMISSION[data.category]);
    const ctx = await resolveRulesContext(data.zoneId);
    if ("error" in ctx) return ctx;
    const phase = RULE_CATEGORIES[data.category].phase;

    const { res, json } = await createRuleInPhase(ctx.apiToken, ctx.zoneId, phase, {
      description: data.description,
      expression: data.expression,
      action: data.action,
      action_parameters: data.action_parameters,
      // Por segurança, toda regra nova sobe desativada — precisa ser
      // habilitada manualmente depois de conferida (ver RulesInner no
      // frontend, que avisa isso com um alerta pós-criação).
      enabled: false,
      // "Place at" — sem `position`, a Cloudflare adiciona no fim (Last).
      // { index: 0 } coloca em primeiro; demais posições ficariam por conta
      // de reordenar depois (ainda não implementado pra Rulesets).
      ...(data.position ? { position: data.position } : {}),
    });
    if (!res.ok) return { ok: false as const, error: cfErrorMessage(json, res) };
    await logRuleChange({
      kind: "create",
      zoneId: data.zoneId,
      category: RULE_CATEGORIES[data.category].label,
      description: data.description,
      enabled: false,
      userId: context.userId,
    });
    return { ok: true as const };
  });

export const updateOverviewRule = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator(
    (input: {
      zoneId: string;
      category: GenericCrudCategory;
      rulesetId: string;
      ruleId: string;
      description: string;
      expression: string;
      action: string;
      action_parameters: Record<string, unknown>;
      enabled: boolean;
      changeKind?: "edit" | "toggle";
    }) =>
      z
        .object({
          zoneId: z.string().min(1).max(64),
          category: z.enum(GENERIC_CRUD_CATEGORIES),
          rulesetId: z.string().min(1).max(64),
          ruleId: z.string().min(1).max(64),
          description: z.string().min(1).max(500),
          expression: z.string().min(1).max(4096),
          action: z.string().min(1).max(64),
          action_parameters: genericActionParametersSchema,
          enabled: z.boolean(),
          changeKind: z.enum(["edit", "toggle"]).optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", CATEGORY_PERMISSION[data.category]);
    const ctx = await resolveRulesContext(data.zoneId);
    if ("error" in ctx) return ctx;
    const rs = await resolveRulesetIdForPhase(ctx.apiToken, ctx.zoneId, RULE_CATEGORIES[data.category].phase);
    if ("error" in rs) return { ok: false as const, error: rs.error };

    const { res, json } = await cfJson(ctx.apiToken, `/zones/${ctx.zoneId}/rulesets/${rs.rulesetId}/rules/${data.ruleId}`, {
      method: "PATCH",
      body: JSON.stringify({
        description: data.description,
        expression: data.expression,
        action: data.action,
        action_parameters: data.action_parameters,
        enabled: data.enabled,
      }),
    });
    if (!res.ok) return { ok: false as const, error: cfErrorMessage(json, res) };
    const beforeRule = rs.rules.find((r: any) => r.id === data.ruleId);
    await logRuleChange({
      kind: data.changeKind === "toggle" ? "toggle" : "update",
      zoneId: data.zoneId,
      category: RULE_CATEGORIES[data.category].label,
      description: data.description,
      enabled: data.enabled,
      userId: context.userId,
      before: beforeRule
        ? {
            description: beforeRule.description,
            expression: beforeRule.expression,
            enabled: beforeRule.enabled,
            action_parameters: beforeRule.action_parameters,
          }
        : null,
      after: {
        description: data.description,
        expression: data.expression,
        enabled: data.enabled,
        action_parameters: data.action_parameters,
      },
    });
    return { ok: true as const };
  });

// Reordena uma rule já existente sem mexer no resto — PATCH só com
// `position` (confirmado: "Update a rule in a ruleset" aceita position
// isolado, before/after com "" pra topo/fim). Funciona pra qualquer categoria
// genérica (Redirect/Cache/Origin/URL Rewrite/Header Transform/Custom
// Error/Configuration/Cache Response) já que só depende de ruleset+ruleId.
export const reorderOverviewRule = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator(
    (input: {
      zoneId: string;
      category: RuleCategoryKey;
      rulesetId: string;
      ruleId: string;
      position: { index: number } | { before: string } | { after: string };
    }) =>
      z
        .object({
          zoneId: z.string().min(1).max(64),
          category: z.enum(ALL_RULE_CATEGORIES),
          rulesetId: z.string().min(1).max(64),
          ruleId: z.string().min(1).max(64),
          position: rulePositionSchema,
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", CATEGORY_PERMISSION[data.category]);
    const ctx = await resolveRulesContext(data.zoneId);
    if ("error" in ctx) return ctx;
    const rs = await resolveRulesetIdForPhase(ctx.apiToken, ctx.zoneId, RULE_CATEGORIES[data.category].phase);
    if ("error" in rs) return { ok: false as const, error: rs.error };

    const { res, json } = await cfJson(ctx.apiToken, `/zones/${ctx.zoneId}/rulesets/${rs.rulesetId}/rules/${data.ruleId}`, {
      method: "PATCH",
      body: JSON.stringify({ position: data.position }),
    });
    if (!res.ok) return { ok: false as const, error: cfErrorMessage(json, res) };
    return { ok: true as const };
  });

export const deleteOverviewRule = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator(
    (input: { zoneId: string; category: GenericCrudCategory; rulesetId: string; ruleId: string; description?: string }) =>
      z
        .object({
          zoneId: z.string().min(1).max(64),
          category: z.enum(GENERIC_CRUD_CATEGORIES),
          rulesetId: z.string().min(1).max(64),
          ruleId: z.string().min(1).max(64),
          description: z.string().max(500).optional(),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", CATEGORY_PERMISSION[data.category]);
    await requireGlobalAdminRole(context.supabase, context.userId);
    const ctx = await resolveRulesContext(data.zoneId);
    if ("error" in ctx) return ctx;
    const rs = await resolveRulesetIdForPhase(ctx.apiToken, ctx.zoneId, RULE_CATEGORIES[data.category].phase);
    if ("error" in rs) return { ok: false as const, error: rs.error };

    const { res, json } = await cfJson(ctx.apiToken, `/zones/${ctx.zoneId}/rulesets/${rs.rulesetId}/rules/${data.ruleId}`, {
      method: "DELETE",
    });
    if (!res.ok) return { ok: false as const, error: cfErrorMessage(json, res) };
    await logRuleChange({
      kind: "delete",
      zoneId: data.zoneId,
      category: RULE_CATEGORIES[data.category].label,
      description: data.description ?? data.ruleId,
      userId: context.userId,
    });
    return { ok: true as const };
  });

// ─── Page Rules — API legada, separada do Ruleset Engine ──────────────────────
// Endpoint: /zones/{zone}/pagerules. Uma Page Rule pode combinar VÁRIAS
// settings ao mesmo tempo (igual ao "+ Add a Setting" nativo) — por isso
// createPageRule/updatePageRule recebem um array `settings: [{id, value}]`
// que vira `actions` direto no corpo da requisição pra Cloudflare, sem
// transformação por tipo. O registro abaixo é usado só pelo formulário
// (frontend) pra saber que tipo de campo mostrar pra cada setting; lista
// restrita ao que foi confirmado no dropdown "Pick a Setting" real (18 itens
// — a lista nativa pode ter mais itens mais abaixo, ainda não vistos).
export type PageRuleSettingKind = "flag" | "onoff" | "seconds" | "text" | "select" | "url_redirect";
export type PageRuleSettingDef = {
  id: string;
  label: string;
  kind: PageRuleSettingKind;
  options?: Array<{ value: string; label: string }>;
};

export const PAGE_RULE_SETTINGS: PageRuleSettingDef[] = [
  { id: "always_use_https", label: "Always Use HTTPS", kind: "flag" },
  { id: "automatic_https_rewrites", label: "Automatic HTTPS Rewrites", kind: "onoff" },
  { id: "browser_cache_ttl", label: "Browser Cache TTL", kind: "seconds" },
  { id: "browser_integrity_check", label: "Browser Integrity Check", kind: "onoff" },
  { id: "bypass_cache_on_cookie", label: "Bypass Cache on Cookie", kind: "text" },
  { id: "cache_deception_armor", label: "Cache Deception Armor", kind: "onoff" },
  {
    id: "cache_level",
    label: "Cache Level",
    kind: "select",
    options: [
      { value: "bypass", label: "Bypass" },
      { value: "basic", label: "Basic" },
      { value: "simplified", label: "Simplified" },
      { value: "aggressive", label: "Aggressive" },
      { value: "cache_everything", label: "Cache Everything" },
    ],
  },
  { id: "cache_on_cookie", label: "Cache on Cookie", kind: "text" },
  { id: "disable_zaraz", label: "Disable Zaraz", kind: "flag" },
  { id: "edge_cache_ttl", label: "Edge Cache TTL", kind: "seconds" },
  { id: "email_obfuscation", label: "Email Obfuscation", kind: "onoff" },
  { id: "forwarding_url", label: "Forwarding URL", kind: "url_redirect" },
  { id: "ip_geolocation", label: "IP Geolocation Header", kind: "onoff" },
  { id: "opportunistic_encryption", label: "Opportunistic Encryption", kind: "onoff" },
  { id: "explicit_cache_control", label: "Origin Cache Control", kind: "onoff" },
  {
    id: "polish",
    label: "Polish",
    kind: "select",
    options: [
      { value: "off", label: "Off" },
      { value: "lossless", label: "Lossless" },
      { value: "lossy", label: "Lossy" },
      { value: "webp", label: "WebP" },
    ],
  },
  { id: "rocket_loader", label: "Rocket Loader", kind: "onoff" },
  {
    id: "ssl",
    label: "SSL",
    kind: "select",
    options: [
      { value: "off", label: "Off" },
      { value: "flexible", label: "Flexible" },
      { value: "full", label: "Full" },
      { value: "full_strict", label: "Full (Strict)" },
      { value: "origin_pull", label: "Origin Pull" },
    ],
  },
];
const PAGE_RULE_SETTING_LABELS: Record<string, string> = Object.fromEntries(PAGE_RULE_SETTINGS.map((s) => [s.id, s.label]));

function formatPageRuleAction(a: { id: string; value?: unknown }): string {
  const label = PAGE_RULE_SETTING_LABELS[a.id] ?? a.id;
  if (a.id === "forwarding_url" && a.value && typeof a.value === "object") {
    const v = a.value as { url?: string; status_code?: number };
    return `${label} (Status Code: ${v.status_code ?? "—"}, Url: ${v.url ?? "—"})`;
  }
  if (a.value == null || a.value === true) return label;
  if (typeof a.value === "string" || typeof a.value === "number" || typeof a.value === "boolean") {
    return `${label}: ${a.value}`;
  }
  return label;
}

export type PageRuleSettingValue = string | number | boolean | { url: string; status_code: number } | null;

export type PageRule = {
  id: string;
  urlPattern: string;
  actionsLabel: string;
  actions: Array<{ id: string; value: PageRuleSettingValue }>;
  priority: number;
  status: "active" | "disabled";
};

export type PageRulesResult = { ok: true; rules: PageRule[] } | { ok: false; error: string };

function parsePageRule(r: any): PageRule {
  const urlPattern = String(r?.targets?.[0]?.constraint?.value ?? "—");
  const actions: Array<{ id: string; value?: unknown }> = Array.isArray(r?.actions) ? r.actions : [];
  return {
    id: String(r.id),
    urlPattern,
    actionsLabel: actions.map(formatPageRuleAction).join(", ") || "—",
    actions: actions.map((a) => ({ id: String(a.id), value: (a.value ?? null) as PageRuleSettingValue })),
    priority: Number(r?.priority ?? 1),
    status: r?.status === "disabled" ? "disabled" : "active",
  };
}

export const listPageRules = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId?: string | null } | undefined) => ({ zoneId: input?.zoneId?.trim() || null }))
  .handler(async ({ data, context }): Promise<PageRulesResult> => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "manage_rules_page_rules");
    const ctx = await resolvePageRulesContext(data.zoneId);
    if ("error" in ctx) return ctx;

    const { res, json } = await cfJson(ctx.apiToken, `/zones/${ctx.zoneId}/pagerules?status=active`);
    if (!res.ok) return { ok: false, error: cfErrorMessage(json, res) };
    const rules = ((json?.result ?? []) as any[]).map(parsePageRule).sort((a, b) => a.priority - b.priority);
    return { ok: true, rules };
  });

const pageRuleSettingValueSchema = z.union([
  z.string(),
  z.number(),
  z.boolean(),
  z.object({ url: z.string(), status_code: z.number() }),
  z.null(),
]);
const pageRuleSettingSchema = z.object({ id: z.string().min(1).max(64), value: pageRuleSettingValueSchema });

export const createPageRule = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator(
    (input: {
      zoneId: string;
      urlPattern: string;
      settings: Array<{ id: string; value: PageRuleSettingValue }>;
      priority: number;
    }) =>
      z
        .object({
          zoneId: z.string().min(1).max(64),
          urlPattern: z.string().min(1).max(500),
          settings: pageRuleSettingSchema.array().min(1).max(10),
          priority: z.number().int().min(1).max(1000),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "manage_rules_page_rules");
    const ctx = await resolvePageRulesContext(data.zoneId);
    if ("error" in ctx) return ctx;

    const { res, json } = await cfJson(ctx.apiToken, `/zones/${ctx.zoneId}/pagerules`, {
      method: "POST",
      body: JSON.stringify({
        targets: [{ target: "url", constraint: { operator: "matches", value: data.urlPattern } }],
        actions: data.settings,
        priority: data.priority,
        // Por segurança, toda regra nova sobe desativada (ver RulesInner/
        // PageRulesSection no frontend, que avisa isso com um alerta
        // pós-criação) — precisa ser habilitada manualmente depois de conferida.
        status: "disabled",
      }),
    });
    if (!res.ok) return { ok: false as const, error: cfErrorMessage(json, res) };
    const ruleId = json?.result?.id ? String(json.result.id) : null;
    await logRuleChange({
      kind: "create",
      zoneId: data.zoneId,
      category: "Page Rules",
      description: data.urlPattern,
      enabled: false,
      userId: context.userId,
    });
    return { ok: true as const, ruleId };
  });

export const updatePageRule = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator(
    (input: {
      zoneId: string;
      ruleId: string;
      urlPattern: string;
      settings: Array<{ id: string; value: PageRuleSettingValue }>;
      priority: number;
      status: "active" | "disabled";
    }) =>
      z
        .object({
          zoneId: z.string().min(1).max(64),
          ruleId: z.string().min(1).max(64),
          urlPattern: z.string().min(1).max(500),
          settings: pageRuleSettingSchema.array().min(1).max(10),
          priority: z.number().int().min(1).max(1000),
          status: z.enum(["active", "disabled"]),
        })
        .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "manage_rules_page_rules");
    const ctx = await resolvePageRulesContext(data.zoneId);
    if ("error" in ctx) return ctx;

    const { res, json } = await cfJson(ctx.apiToken, `/zones/${ctx.zoneId}/pagerules/${data.ruleId}`, {
      method: "PUT",
      body: JSON.stringify({
        targets: [{ target: "url", constraint: { operator: "matches", value: data.urlPattern } }],
        actions: data.settings,
        priority: data.priority,
        status: data.status,
      }),
    });
    if (!res.ok) return { ok: false as const, error: cfErrorMessage(json, res) };
    await logRuleChange({
      kind: "update",
      zoneId: data.zoneId,
      category: "Page Rules",
      description: data.urlPattern,
      enabled: data.status === "active",
      userId: context.userId,
    });
    return { ok: true as const };
  });

export const reorderPageRules = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId: string; orderedRuleIds: string[] }) =>
    z
      .object({
        zoneId: z.string().min(1).max(64),
        orderedRuleIds: z.array(z.string().min(1).max(64)).min(1).max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "manage_rules_page_rules");
    const ctx = await resolvePageRulesContext(data.zoneId);
    if ("error" in ctx) return ctx;

    // Renumera TODAS as regras pra 1..N na ordem desejada — mais simples e
    // seguro do que tentar "abrir espaço" entre prioridades existentes
    // (que podem não ser contíguas), e é o que o próprio drag-and-drop
    // nativo provavelmente faz por baixo dos panos.
    const results = await Promise.all(
      data.orderedRuleIds.map(async (ruleId, i) => {
        const { res, json } = await cfJson(ctx.apiToken, `/zones/${ctx.zoneId}/pagerules/${ruleId}`, {
          method: "PATCH",
          body: JSON.stringify({ priority: i + 1 }),
        });
        return res.ok ? null : cfErrorMessage(json, res);
      }),
    );
    const errors = results.filter((e): e is string => !!e);
    if (errors.length) return { ok: false as const, error: errors.join(" | ") };
    return { ok: true as const };
  });

export const togglePageRule = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId: string; ruleId: string; status: "active" | "disabled"; urlPattern?: string }) =>
    z
      .object({
        zoneId: z.string().min(1).max(64),
        ruleId: z.string().min(1).max(64),
        status: z.enum(["active", "disabled"]),
        urlPattern: z.string().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "manage_rules_page_rules");
    const ctx = await resolvePageRulesContext(data.zoneId);
    if ("error" in ctx) return ctx;

    const { res, json } = await cfJson(ctx.apiToken, `/zones/${ctx.zoneId}/pagerules/${data.ruleId}`, {
      method: "PATCH",
      body: JSON.stringify({ status: data.status }),
    });
    if (!res.ok) return { ok: false as const, error: cfErrorMessage(json, res) };
    await logRuleChange({
      kind: "toggle",
      zoneId: data.zoneId,
      category: "Page Rules",
      description: data.urlPattern ?? data.ruleId,
      enabled: data.status === "active",
      userId: context.userId,
    });
    return { ok: true as const };
  });

export const deletePageRule = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { zoneId: string; ruleId: string; urlPattern?: string }) =>
    z
      .object({ zoneId: z.string().min(1).max(64), ruleId: z.string().min(1).max(64), urlPattern: z.string().max(500).optional() })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "cloudflare-waf", "manage_rules_page_rules");
    await requireGlobalAdminRole(context.supabase, context.userId);
    const ctx = await resolvePageRulesContext(data.zoneId);
    if ("error" in ctx) return ctx;

    const { res, json } = await cfJson(ctx.apiToken, `/zones/${ctx.zoneId}/pagerules/${data.ruleId}`, { method: "DELETE" });
    if (!res.ok) return { ok: false as const, error: cfErrorMessage(json, res) };
    await logRuleChange({
      kind: "delete",
      zoneId: data.zoneId,
      category: "Page Rules",
      description: data.urlPattern ?? data.ruleId,
      userId: context.userId,
    });
    return { ok: true as const };
  });
