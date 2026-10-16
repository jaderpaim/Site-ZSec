import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requirePermission } from "@/lib/authz";
import { logAudit } from "@/lib/audit-log.functions";

// Módulo Threat Intelligence (LeakRadar). Leitura com o client do usuário, então
// a RLS de leakradar_leaks/leakradar_sync_state já filtra quem não tem `view`.
// As escritas usam a service role depois de checar a permissão aqui.
type AnyDb = {
  from: (t: string) => any;
  rpc: (fn: string, args?: Record<string, unknown>) => any;
};
const db = (sb: unknown) => sb as unknown as AnyDb;
const MODULE = "threat-intel";

// Cadastrar/editar aplicações define ONDE a senha pode ser submetida — ação
// mais sensível que `edit`; exige admin global ou admin do módulo.
async function requireModuleAdmin(sb: SupabaseClient, userId: string): Promise<void> {
  const [admin, superAdmin, modAdmin] = await Promise.all([
    sb.rpc("has_role", { _user_id: userId, _role: "admin" as never }),
    sb.rpc("has_role", { _user_id: userId, _role: "super_admin" as never }),
    sb.rpc("is_module_admin", { _user_id: userId, _module: MODULE }),
  ]);
  if (admin.data === true || superAdmin.data === true || modAdmin.data === true) return;
  throw new Error("Acesso negado: cadastrar aplicações requer admin do módulo.");
}

export type LeakRow = {
  id: string;
  leak_id: string;
  category: "employees" | "customers" | "third_parties";
  domain: string;
  username: string | null;
  is_email: boolean | null;
  url: string | null;
  url_host: string | null;
  password_strength: number | null;
  unlocked: boolean;
  added_at: string | null;
  first_seen_at: string;
  last_seen_at: string;
  status: LeakStatus;
  status_updated_at: string | null;
  notes: string | null;
  validation_status: "valida" | "invalida" | "inconclusiva" | null;
  validation_checked_at: string | null;
  validation_detail: string | null;
};

export type LeakApp = {
  id: string;
  name: string;
  host: string;
  login_url: string;
  method: "http_form" | "http_json";
  username_field: string;
  password_field: string;
  extra_fields: Record<string, string>;
  success_type: "status" | "body_contains" | "body_not_contains" | "json_field";
  success_value: string;
  enabled: boolean;
};

// Relatório do domínio (contagens oficiais do LeakRadar, salvas na coleta).
export type PwCat = { qty: number; perc: number };
export type PwSummary = {
  total_pass: number;
  too_weak: PwCat;
  weak: PwCat;
  medium: PwCat;
  strong: PwCat;
};
export type DomainReport = {
  employees_compromised: number;
  customers_compromised: number;
  third_parties_compromised: number;
  employee_passwords?: PwSummary;
  customer_passwords?: PwSummary;
  third_parties_passwords?: PwSummary;
};

export const LEAK_STATUSES = [
  "novo",
  "em_tratamento",
  "resolvido",
  "risco_aceito",
  "falso_positivo",
] as const;
export type LeakStatus = (typeof LEAK_STATUSES)[number];

const STATUS_LABEL: Record<LeakStatus, string> = {
  novo: "Novo",
  em_tratamento: "Em tratamento",
  resolvido: "Resolvido",
  risco_aceito: "Risco aceito",
  falso_positivo: "Falso positivo",
};
const STATUS_TONE: Record<LeakStatus, "ok" | "warn" | "crit" | "neutral"> = {
  novo: "crit",
  em_tratamento: "warn",
  resolvido: "ok",
  risco_aceito: "neutral",
  falso_positivo: "neutral",
};

const LEAK_COLUMNS =
  "id, leak_id, category, domain, username, is_email, url, url_host, password_strength, unlocked, added_at, first_seen_at, last_seen_at, status, status_updated_at, notes, validation_status, validation_checked_at, validation_detail";

const ListLeaksSchema = z.object({
  category: z.enum(["employees", "customers", "third_parties"]),
  status: z.enum(LEAK_STATUSES).nullable().optional(),
  host: z.string().max(253).nullable().optional(),
  search: z.string().max(200).nullable().optional(),
  // só as contas "em risco no AD" (senha ainda válida)
  adRisk: z.boolean().optional(),
  // filtro por resultado da validação ativa (qualquer categoria)
  validation: z.enum(["valida", "invalida", "inconclusiva"]).nullable().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(200).default(100),
});

// Paginação no servidor — nunca carrega tudo de uma vez (um domínio grande pode
// ter centenas de milhares de credenciais). Devolve a página pedida e o total
// que casa com os filtros, para a UI montar a paginação.
export const listLeaks = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => ListLeaksSchema.parse(input))
  .handler(async ({ data, context }) => {
    const sb = db(context.supabase);
    let q = sb
      .from("leakradar_leaks")
      .select(LEAK_COLUMNS, { count: "exact" })
      .eq("category", data.category);
    if (data.status) q = q.eq("status", data.status);
    if (data.host) q = q.eq("url_host", data.host);
    if (data.validation) q = q.eq("validation_status", data.validation);
    if (data.adRisk) {
      const { data: idRows } = await sb.rpc("leakradar_ad_risk_ids");
      const ids = ((idRows ?? []) as unknown[]).map((r) =>
        typeof r === "string" ? r : String(Object.values(r as object)[0]),
      );
      q = q.in("id", ids.length ? ids : ["00000000-0000-0000-0000-000000000000"]);
    }
    if (data.search) {
      const s = data.search.replace(/[%,]/g, " ").trim();
      if (s) q = q.or(`username.ilike.%${s}%,url.ilike.%${s}%`);
    }
    const from = (data.page - 1) * data.pageSize;
    const {
      data: rows,
      count,
      error,
    } = await q
      .order("added_at", { ascending: false, nullsFirst: false })
      .range(from, from + data.pageSize - 1);
    if (error) throw new Error(error.message);
    return { leaks: (rows ?? []) as LeakRow[], total: count ?? 0 };
  });

export const getLeakTimeseries = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => z.object({ bucket: z.enum(["week", "month"]) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await db(context.supabase).rpc("leakradar_timeseries", {
      p_bucket: data.bucket,
    });
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as Array<{ period: string; category: string; n: number }> };
  });

export const getTopHosts = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) =>
    z.object({ category: z.enum(["employees", "customers", "third_parties"]) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: rows, error } = await db(context.supabase).rpc("leakradar_top_hosts", {
      p_category: data.category,
      p_limit: 7,
    });
    if (error) throw new Error(error.message);
    return { hosts: (rows ?? []) as Array<{ url_host: string; n: number }> };
  });

export const getStatusCounts = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    const { data: rows, error } = await db(context.supabase).rpc("leakradar_status_counts");
    if (error) throw new Error(error.message);
    return { rows: (rows ?? []) as Array<{ category: string; status: string; n: number }> };
  });

// Faixa de alerta AD: contas de colaboradores com senha vazada ainda válida
// (não trocada desde o vazamento) e quantas sem MFA. Vem do cruzamento com o
// Entra ID (leakradar_ad_status) via RPC. lastSync = coleta AD mais recente.
export const getThreatIntelAdAlert = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    const sb = db(context.supabase);
    const { data: rows, error } = await sb.rpc("leakradar_ad_alert");
    if (error) throw new Error(error.message);
    const r = (rows ?? [])[0] as
      | { em_risco: number; sem_mfa: number; sem_dados: number; afetados: number }
      | undefined;
    const { data: last } = await sb
      .from("leakradar_ad_status")
      .select("checked_at")
      .order("checked_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    return {
      emRisco: Number(r?.em_risco ?? 0),
      semMfa: Number(r?.sem_mfa ?? 0),
      semDados: Number(r?.sem_dados ?? 0),
      afetados: Number(r?.afetados ?? 0),
      lastSync: (last?.checked_at as string | null) ?? null,
    };
  });

export const getThreatIntelSyncStatus = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    const { data } = await db(context.supabase)
      .from("leakradar_sync_state")
      .select("last_sync_at, totals, report")
      .eq("id", "leakradar")
      .maybeSingle();
    return {
      lastSync: (data?.last_sync_at as string | null) ?? null,
      totals: (data?.totals ?? null) as Record<
        string,
        Record<string, { total: number; total_unlocked: number; collected: number }>
      > | null,
      report: (data?.report ?? null) as Record<string, DomainReport> | null,
    };
  });

const UpdateStatusSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(LEAK_STATUSES),
  notes: z.string().max(2000).nullable().optional(),
});

export const updateLeakStatus = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => UpdateStatusSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase as SupabaseClient, context.userId, MODULE, "edit");
    const adminDb = db(supabaseAdmin);

    // Marcar (ou trocar entre) risco aceito / falso positivo exige justificativa.
    // A mudança fica registrada no audit log, preservando o histórico da decisão.
    if (
      (data.status === "risco_aceito" || data.status === "falso_positivo") &&
      !(data.notes ?? "").trim()
    ) {
      throw new Error("Informe a justificativa para risco aceito ou falso positivo.");
    }

    const patch: Record<string, unknown> = {
      status: data.status,
      status_updated_at: new Date().toISOString(),
      status_updated_by: context.userId,
    };
    if (data.notes !== undefined) patch.notes = data.notes?.trim() || null;

    const { data: row, error } = await adminDb
      .from("leakradar_leaks")
      .update(patch)
      .eq("id", data.id)
      .select("leak_id, category, unlocked")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Credencial não encontrada.");

    if (row.unlocked) {
      const { pushLeakRadarStatus } = await import("./leakradar.server");
      await pushLeakRadarStatus(row.leak_id as string, data.status);
    }

    const { logLeakEvent } = await import("./leakradar-events.server");
    await logLeakEvent({
      leakId: data.id,
      label: `Status: ${STATUS_LABEL[data.status]}`,
      detail: data.notes?.trim() || null,
      tone: STATUS_TONE[data.status],
      userId: context.userId,
    });

    await logAudit({
      userId: context.userId,
      modulo: MODULE,
      acao: "alterar_status",
      descricao: `Alterou o status de uma credencial vazada para "${data.status}"`,
      status: "success",
      detalhes: {
        id: data.id,
        categoria: row.category,
        status: data.status,
        justificativa: data.notes?.trim() || null,
      },
    });
    return { ok: true };
  });

const UnlockSchema = z.object({ ids: z.array(z.string().uuid()).min(1).max(50) });

export const unlockLeaks = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => UnlockSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase as SupabaseClient, context.userId, MODULE, "execute");
    const { data: rows, error } = await db(supabaseAdmin)
      .from("leakradar_leaks")
      .select("leak_id")
      .in("id", data.ids)
      .eq("unlocked", false);
    if (error) throw new Error(error.message);
    const leakIds = [
      ...new Set((rows ?? []).map((r: { leak_id: string }) => r.leak_id)),
    ] as string[];
    if (leakIds.length === 0) return { unlocked: 0 };

    const { unlockLeakRadarLeaks } = await import("./leakradar.server");
    try {
      const res = await unlockLeakRadarLeaks(leakIds);
      const { logLeakEvent } = await import("./leakradar-events.server");
      for (const id of data.ids) {
        await logLeakEvent({
          leakId: id,
          label: "Desbloqueada",
          tone: "info",
          userId: context.userId,
        });
      }
      await logAudit({
        userId: context.userId,
        modulo: MODULE,
        acao: "desbloquear",
        descricao: `Desbloqueou ${res.unlocked} credencial(is) no LeakRadar`,
        status: "success",
        detalhes: { solicitados: leakIds.length, desbloqueados: res.unlocked },
      });
      return res;
    } catch (e) {
      await logAudit({
        userId: context.userId,
        modulo: MODULE,
        acao: "desbloquear",
        descricao: `Falha ao desbloquear ${leakIds.length} credencial(is) no LeakRadar`,
        status: "error",
        mensagemErro: (e as Error).message,
        detalhes: { solicitados: leakIds.length },
      });
      throw e;
    }
  });

const RevealSchema = z.object({ id: z.string().uuid() });

// Revela a senha em tela para o analista autorizado. A senha vai na resposta
// desta chamada e NÃO é gravada em lugar nenhum (nem no banco, nem no audit
// log — só registramos QUEM revelou e QUANDO). Permissão `execute`.
export const revealLeakPassword = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => RevealSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase as SupabaseClient, context.userId, MODULE, "execute");
    const { data: row, error } = await db(supabaseAdmin)
      .from("leakradar_leaks")
      .select("leak_id, category, domain, url_host, username, unlocked")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Credencial não encontrada.");

    const { revealLeakRadarPassword } = await import("./leakradar.server");
    const res = await revealLeakRadarPassword(row.leak_id as string, {
      urlHost: row.url_host as string | null,
      username: row.username as string | null,
      alreadyUnlocked: row.unlocked === true,
    });
    await logAudit({
      userId: context.userId,
      modulo: MODULE,
      acao: "revelar_senha",
      descricao: "Revelou em tela a senha de uma credencial vazada",
      status: "success",
      // nunca gravamos a senha — só o contexto da ação
      detalhes: { id: data.id, categoria: row.category, dominio: row.domain },
    });
    return { password: res.password };
  });

export type LeakContextIncident = {
  exists: boolean;
  refCode: string | null;
  createdAt: string | null;
  status: string | null;
  resolution: string | null;
  resolvedAt: string | null;
  // só permite abrir incidente novo se não há um para esta indexação
  allowNew: boolean;
};

// Contexto da credencial para o detalhe: correlação com colaborador (cruza o
// e-mail com a tabela colaboradores) e estado de incidente (se já há um para
// esta captura e se cabe abrir outro). Service role após checar `view`.
export const getLeakContext = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase as SupabaseClient, context.userId, MODULE, "view");
    const adminDb = db(supabaseAdmin);
    const { data: leak } = await adminDb
      .from("leakradar_leaks")
      .select("username, added_at")
      .eq("id", data.id)
      .maybeSingle();

    // Incidente mais recente desta credencial. Só cabe abrir outro se a captura
    // foi reindexada depois (added_at > created_at do último incidente).
    const { data: incs } = await adminDb
      .from("leakradar_incidents")
      .select("ref_code, created_at, status, resolution, resolved_at")
      .eq("leak_id", data.id)
      .order("created_at", { ascending: false })
      .limit(1);
    const newest = (incs ?? [])[0] as
      | {
          ref_code: string;
          created_at: string;
          status: string;
          resolution: string | null;
          resolved_at: string | null;
        }
      | undefined;
    const addedMs = leak?.added_at ? new Date(leak.added_at as string).getTime() : 0;
    const incident: LeakContextIncident = {
      exists: !!newest,
      refCode: newest?.ref_code ?? null,
      createdAt: newest?.created_at ?? null,
      status: newest?.status ?? null,
      resolution: newest?.resolution ?? null,
      resolvedAt: newest?.resolved_at ?? null,
      allowNew: !newest || addedMs > new Date(newest.created_at).getTime(),
    };

    const uname = (leak?.username as string | null)?.trim() ?? "";
    let colaborador: {
      displayName: string;
      cargo: string | null;
      unidade: string | null;
      departamento: string | null;
      temEntra: boolean;
    } | null = null;
    const masked = uname.includes("*");
    if (uname && !masked && uname.includes("@")) {
      // Escapa curingas do LIKE (_ e %), já que e-mail pode conter underscore.
      const padrao = uname.replace(/([%_\\])/g, "\\$1");
      const { data: achados } = await adminDb
        .from("colaboradores")
        .select("email, display_name, cargo, unidade, entra_oid, departments(name)")
        .ilike("email", padrao)
        .limit(5);
      const colab = (achados ?? []).find(
        (c: { email?: string }) => (c.email ?? "").toLowerCase() === uname.toLowerCase(),
      );
      if (colab) {
        colaborador = {
          displayName: colab.display_name as string,
          cargo: (colab.cargo as string | null) ?? null,
          unidade: (colab.unidade as string | null) ?? null,
          departamento: (colab.departments as { name?: string } | null)?.name ?? null,
          temEntra: !!colab.entra_oid,
        };
      }
    }
    // Log de eventos (append-only) desta credencial, em ordem cronológica.
    const { data: evs } = await adminDb
      .from("leakradar_events")
      .select("label, detail, tone, created_at")
      .eq("leak_id", data.id)
      .order("created_at", { ascending: true })
      .limit(200);
    const events = (evs ?? []) as Array<{
      label: string;
      detail: string | null;
      tone: string | null;
      created_at: string;
    }>;

    // Status no AD (Entra) desta conta, do cruzamento ad-status-sync.
    let ad: {
      lastPasswordChange: string | null;
      mfaRegistered: boolean | null;
      accountEnabled: boolean | null;
      userType: string | null;
      externa: boolean;
      checkedAt: string | null;
      error: string | null;
    } | null = null;
    if (uname && !masked && uname.includes("@")) {
      const { data: adRow } = await adminDb
        .from("leakradar_ad_status")
        .select(
          "last_password_change, mfa_registered, account_enabled, user_type, user_principal_name, checked_at, error",
        )
        .eq("email", uname.toLowerCase())
        .maybeSingle();
      if (adRow) {
        const upn = (adRow.user_principal_name as string | null) ?? "";
        ad = {
          lastPasswordChange: (adRow.last_password_change as string | null) ?? null,
          mfaRegistered: (adRow.mfa_registered as boolean | null) ?? null,
          accountEnabled: (adRow.account_enabled as boolean | null) ?? null,
          userType: (adRow.user_type as string | null) ?? null,
          externa: adRow.user_type === "Guest" || upn.includes("#EXT#"),
          checkedAt: (adRow.checked_at as string | null) ?? null,
          error: (adRow.error as string | null) ?? null,
        };
      }
    }

    return { masked, colaborador, incident, events, ad };
  });

// Plano e pontos, para o aviso de custo antes de desbloquear. Só para quem
// pode desbloquear: o saldo de pontos é informação da conta paga.
export const getLeakRadarAccountInfo = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await requirePermission(context.supabase as SupabaseClient, context.userId, MODULE, "execute");
    const { getLeakRadarAccount } = await import("./leakradar.server");
    return getLeakRadarAccount();
  });

// ── Aplicações próprias (allowlist de validação) ────────────────────────────

export const listLeakApps = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    const { data, error } = await db(context.supabase)
      .from("leakradar_apps")
      .select(
        "id, name, host, login_url, method, username_field, password_field, extra_fields, success_type, success_value, enabled",
      )
      .order("host", { ascending: true });
    if (error) throw new Error(error.message);
    return { apps: (data ?? []) as LeakApp[] };
  });

const AppSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(120),
  host: z
    .string()
    .min(3)
    .max(253)
    .transform((h) => h.trim().toLowerCase())
    .refine((h) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(h), "Host inválido."),
  login_url: z.string().url().max(2000),
  method: z.enum(["http_form", "http_json"]),
  username_field: z.string().min(1).max(64),
  password_field: z.string().min(1).max(64),
  extra_fields: z.record(z.string(), z.string()).default({}),
  success_type: z.enum(["status", "body_contains", "body_not_contains", "json_field"]),
  success_value: z.string().min(1).max(500),
  enabled: z.boolean(),
});

export const upsertLeakApp = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => AppSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireModuleAdmin(context.supabase as SupabaseClient, context.userId);

    // Trava dupla (também existe na validação): não deixa cadastrar um IdP de
    // terceiro como alvo — a senha do colaborador não pode ser submetida lá.
    const { isThirdPartyIdp } = await import("./leakradar-validate.server");
    if (isThirdPartyIdp(data.host)) {
      throw new Error(
        "Esse host é um provedor de identidade de terceiros. Cadastre apenas aplicações que você opera; contas nesses provedores são validadas pelo diretório (Entra/AD).",
      );
    }
    // O endpoint de login precisa ser do mesmo host da aplicação.
    try {
      const u = new URL(data.login_url);
      if (u.hostname.toLowerCase() !== data.host) {
        throw new Error("O endpoint de login precisa ser do mesmo host da aplicação.");
      }
    } catch (e) {
      throw new Error((e as Error).message || "URL de login inválida.");
    }

    const row = {
      name: data.name.trim(),
      host: data.host,
      login_url: data.login_url.trim(),
      method: data.method,
      username_field: data.username_field.trim(),
      password_field: data.password_field.trim(),
      extra_fields: data.extra_fields,
      success_type: data.success_type,
      success_value: data.success_value.trim(),
      enabled: data.enabled,
      updated_at: new Date().toISOString(),
      ...(data.id ? {} : { created_by: context.userId }),
    };
    const q = db(supabaseAdmin).from("leakradar_apps");
    const { error } = data.id ? await q.update(row).eq("id", data.id) : await q.insert(row);
    if (error) throw new Error(error.message);

    await logAudit({
      userId: context.userId,
      modulo: MODULE,
      acao: data.id ? "editar_aplicacao" : "cadastrar_aplicacao",
      descricao: `${data.id ? "Editou" : "Cadastrou"} a aplicação de validação "${data.name}" (${data.host})`,
      status: "success",
      detalhes: { host: data.host, login_url: data.login_url, enabled: data.enabled },
    });
    return { ok: true };
  });

export const deleteLeakApp = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireModuleAdmin(context.supabase as SupabaseClient, context.userId);
    const { error } = await db(supabaseAdmin).from("leakradar_apps").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAudit({
      userId: context.userId,
      modulo: MODULE,
      acao: "remover_aplicacao",
      descricao: "Removeu uma aplicação de validação",
      status: "success",
      detalhes: { id: data.id },
    });
    return { ok: true };
  });

// ── Validação de legitimidade ───────────────────────────────────────────────

export const validateLeak = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase as SupabaseClient, context.userId, MODULE, "execute");
    const adminDb = db(supabaseAdmin);

    const { data: leak, error } = await adminDb
      .from("leakradar_leaks")
      .select("leak_id, url_host, username, category, domain, unlocked")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!leak) throw new Error("Credencial não encontrada.");
    if (!leak.url_host) {
      throw new Error("Esta credencial não tem URL de origem, então não há onde validar.");
    }

    const { isMsLoginHost } = await import("./leakradar-ad.server");
    const microsoft = isMsLoginHost(leak.url_host as string);

    // Contas Microsoft/Entra: validação pelo PRÓPRIO tenant (ROPC), sem cadastrar
    // app. Demais hosts: só se cadastrados em Aplicações (allowlist própria).
    let app: unknown = null;
    if (!microsoft) {
      const { data } = await adminDb
        .from("leakradar_apps")
        .select(
          "host, login_url, method, username_field, password_field, extra_fields, success_type, success_value, enabled",
        )
        .eq("host", leak.url_host)
        .maybeSingle();
      app = data;
      if (!app) {
        throw new Error(
          `A URL (${leak.url_host}) não está cadastrada em Aplicações. Cadastre a aplicação que você opera para poder validar. (Contas Microsoft/Entra são validadas pelo diretório, sem cadastro.)`,
        );
      }
    }

    const { revealLeakRadarPassword } = await import("./leakradar.server");
    const cred = await revealLeakRadarPassword(leak.leak_id as string, {
      urlHost: leak.url_host as string | null,
      username: leak.username as string | null,
      alreadyUnlocked: leak.unlocked === true,
    });
    const username = cred.username ?? (leak.username as string | null);
    if (!cred.password || !username) {
      throw new Error("Não foi possível obter usuário e senha para validar.");
    }

    let result: { status: "valida" | "invalida" | "inconclusiva"; detail: string };
    if (microsoft) {
      const { data: adRow } = await adminDb
        .from("leakradar_ad_status")
        .select("user_type, user_principal_name")
        .eq("email", username.toLowerCase())
        .maybeSingle();
      const upn = (adRow?.user_principal_name as string | null) ?? "";
      const externa = adRow?.user_type === "Guest" || upn.includes("#EXT#");
      if (externa) {
        // Identidade externa/federada (MSA/convidada): a senha é do provedor de
        // origem, não do tenant — ROPC não se aplica.
        result = {
          status: "inconclusiva",
          detail:
            "Identidade externa/federada — a senha é do provedor de origem (não do seu tenant). Use a marcação manual.",
        };
      } else {
        // ROPC pelo UPN do Entra (pode diferir do e-mail vazado).
        const { validateEntraRopc } = await import("./leakradar-ad.server");
        result = await validateEntraRopc(upn || username, cred.password);
      }
    } else {
      const { validateCredentialAgainstApp } = await import("./leakradar-validate.server");
      result = await validateCredentialAgainstApp(app as never, username, cred.password);
    }
    // só o veredito é persistido; senha nunca encosta no banco
    await adminDb
      .from("leakradar_leaks")
      .update({
        validation_status: result.status,
        validation_detail: result.detail,
        validation_checked_at: new Date().toISOString(),
        validation_by: context.userId,
      })
      .eq("id", data.id);

    const vLabel =
      result.status === "valida"
        ? "Credencial válida"
        : result.status === "invalida"
          ? "Não autentica"
          : "Validação inconclusiva";
    const { logLeakEvent } = await import("./leakradar-events.server");
    await logLeakEvent({
      leakId: data.id,
      label: `Validação: ${vLabel}`,
      detail: result.detail,
      tone: result.status === "valida" ? "crit" : result.status === "invalida" ? "ok" : "neutral",
      userId: context.userId,
    });

    const alvo = microsoft ? "Entra (ROPC)" : (leak.url_host as string);
    await logAudit({
      userId: context.userId,
      modulo: MODULE,
      acao: "validar_credencial",
      descricao: `Validou uma credencial vazada contra ${alvo}: ${result.status}`,
      status: "success",
      detalhes: {
        id: data.id,
        host: leak.url_host,
        metodo: microsoft ? "ropc" : "app",
        resultado: result.status,
      },
    });
    return result;
  });

// Validação/marcação MANUAL: para contas que o tool não valida sozinho
// (convidados, terceiros, ou confirmação feita por fora). Exige justificativa.
// Não submete senha a lugar nenhum — é um registro manual, auditado.
const ManualSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["valida", "invalida", "inconclusiva"]),
  note: z.string().min(1).max(1000),
});
export const setLeakValidationManual = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => ManualSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase as SupabaseClient, context.userId, MODULE, "execute");
    const adminDb = db(supabaseAdmin);
    const detail = `Manual: ${data.note.trim()}`;
    const { data: row, error } = await adminDb
      .from("leakradar_leaks")
      .update({
        validation_status: data.status,
        validation_detail: detail,
        validation_checked_at: new Date().toISOString(),
        validation_by: context.userId,
      })
      .eq("id", data.id)
      .select("category")
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!row) throw new Error("Credencial não encontrada.");

    const vLabel =
      data.status === "valida"
        ? "Credencial válida (manual)"
        : data.status === "invalida"
          ? "Não autentica (manual)"
          : "Inconclusiva (manual)";
    const { logLeakEvent } = await import("./leakradar-events.server");
    await logLeakEvent({
      leakId: data.id,
      label: `Validação: ${vLabel}`,
      detail: data.note.trim(),
      tone: data.status === "valida" ? "crit" : data.status === "invalida" ? "ok" : "neutral",
      userId: context.userId,
    });
    await logAudit({
      userId: context.userId,
      modulo: MODULE,
      acao: "validar_credencial_manual",
      descricao: `Marcou manualmente a validação como "${data.status}"`,
      status: "success",
      detalhes: { id: data.id, resultado: data.status, justificativa: data.note.trim() },
    });
    return { ok: true };
  });
