import { createServerFn } from "@tanstack/react-start";
import { getRequestIP } from "@tanstack/react-start/server";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireActiveSession } from "@/lib/session-policy.middleware";

/**
 * Heartbeat de "usuário conectado" (auth-context.tsx, a cada 60s). requireActiveSession
 * já grava last_active_at no servidor; antes o cliente gravava direto em profiles, o
 * que deixava qualquer um renovar o próprio prazo de inatividade.
 */
export const pingActivity = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async () => ({ ok: true }));

const failureInput = z.object({
  email: z.string().max(320),
  error_message: z.string().max(500).nullable().optional(),
  user_agent: z.string().max(500).nullable().optional(),
  login_method: z.string().max(50).nullable().optional(),
  ip: z.string().max(64).nullable().optional(),
});

/**
 * Loga uma tentativa de login FALHA. Não exige autenticação (o usuário não conseguiu
 * entrar), então usa o service role — grava direto, sem depender de INSERT anônimo
 * na tabela (que permitia qualquer cliente com a anon key forjar/inundar o log
 * chamando a REST API do Supabase diretamente, sem passar por esta função).
 */
// nosemgrep: zsec-server-fn-sem-sessao -- pública: registra login que falhou (usuário ainda sem sessão)
export const logAccessFailure = createServerFn({ method: "POST" })
  .inputValidator((input) => failureInput.parse(input))
  .handler(async ({ data }) => {
    const serverIp = getRequestIP({ xForwardedFor: true }) ?? null;
    const ip = serverIp ?? data.ip ?? null;
    const { error } = await supabaseAdmin.from("auth_access_logs").insert({
      email: data.email,
      user_id: null,
      full_name: null,
      role: null,
      status: "error",
      error_message: data.error_message ?? null,
      user_agent: data.user_agent ?? null,
      login_method: data.login_method ?? "email_password",
      ip,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

const successInput = z.object({
  user_agent: z.string().max(500).nullable().optional(),
  login_method: z.string().max(50).nullable().optional(),
  ip: z.string().max(64).nullable().optional(),
});

/**
 * Loga uma tentativa de login com SUCESSO. Exige sessão autenticada — todos os campos
 * sensíveis (user_id, email, role, full_name) vêm do servidor, nunca do input do cliente,
 * impedindo injeção de registros falsos.
 */
export const logAccessSuccess = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => successInput.parse(input))
  .handler(async ({ data, context }) => {
    const serverIp = getRequestIP({ xForwardedFor: true }) ?? null;
    const ip = serverIp ?? data.ip ?? null;

    const [{ data: profile }, { data: roleRow }] = await Promise.all([
      context.supabase.from("profiles").select("email, full_name").eq("id", context.userId).maybeSingle(),
      context.supabase.from("user_roles").select("role").eq("user_id", context.userId).maybeSingle(),
    ]);

    const { error } = await context.supabase.from("auth_access_logs").insert({
      email: profile?.email ?? (context.claims?.email as string) ?? "",
      user_id: context.userId,
      full_name: profile?.full_name ?? null,
      role: (roleRow?.role as string) ?? "visualizador",
      status: "success",
      error_message: null,
      user_agent: data.user_agent ?? null,
      login_method: data.login_method ?? "email_password",
      ip,
    });
    if (error) throw new Error(error.message);

    // Só marca presença ("online" na tela de usuários). O limite de 24h não depende
    // mais daqui: requireActiveSession conta a partir de auth.sessions.created_at, que
    // quem tem o token não consegue reiniciar chamando esta função de novo.
    try {
      await supabaseAdmin
        .from("profiles")
        .update({ last_active_at: new Date().toISOString() })
        .eq("id", context.userId);
    } catch {
      // ignore — best-effort, requireActiveSession se auto-corrige na próxima request
    }

    return { ok: true };
  });

const logoutInput = z.object({
  reason: z.enum(["manual", "inactivity", "expired", "sso_required"]),
  user_agent: z.string().max(500).nullable().optional(),
});

/**
 * Loga um evento de LOGOUT (saída manual, inatividade de 8h ou expiração de 24h).
 * Exige sessão autenticada — precisa ser chamada ANTES de supabase.auth.signOut() no
 * cliente, senão o token já caiu e a autenticação desta função falha.
 */
export const logLogoutEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => logoutInput.parse(input))
  .handler(async ({ data, context }) => {
    const serverIp = getRequestIP({ xForwardedFor: true }) ?? null;

    const [{ data: profile }, { data: roleRow }] = await Promise.all([
      context.supabase.from("profiles").select("email, full_name").eq("id", context.userId).maybeSingle(),
      context.supabase.from("user_roles").select("role").eq("user_id", context.userId).maybeSingle(),
    ]);

    const { error } = await context.supabase.from("auth_access_logs").insert({
      email: profile?.email ?? (context.claims?.email as string) ?? "",
      user_id: context.userId,
      full_name: profile?.full_name ?? null,
      role: (roleRow?.role as string) ?? "visualizador",
      status: "success",
      event_type: "logout",
      logout_reason: data.reason,
      // Explicitamente null — sem isso a coluna cairia no default 'email_password'
      // da tabela, poluindo o filtro por método de login com linhas de logout.
      login_method: null,
      user_agent: data.user_agent ?? null,
      ip: serverIp,
    });
    if (error) throw new Error(error.message);

    // Tira o usuário de "online" na tela de usuários. Não afeta a política de sessão:
    // o signOut do cliente encerra a linha em auth.sessions, que requireActiveSession
    // passa a rejeitar.
    try {
      await supabaseAdmin
        .from("profiles")
        .update({ last_active_at: null })
        .eq("id", context.userId);
    } catch {
      // ignore — best-effort
    }

    return { ok: true };
  });

/**
 * Seed inicial — para cada usuário com last_sign_in_at no Supabase Auth,
 * grava UMA linha "success" histórica em auth_access_logs, somente se ainda
 * não houver registro de sucesso para aquele user_id. Idempotente.
 */
export const seedAuthAccessHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Apenas admin global pode disparar
    const { data: roleRow } = await context.supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (roleRow?.role !== "admin" && roleRow?.role !== "super_admin") {
      return { ok: false, seeded: 0 };
    }

    const [authList, { data: profiles }, { data: roles }, { data: existing }] = await Promise.all([
      supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
      supabaseAdmin.from("profiles").select("id, full_name, email"),
      supabaseAdmin.from("user_roles").select("user_id, role"),
      supabaseAdmin.from("auth_access_logs").select("user_id").eq("status", "success"),
    ]);

    const profileById = new Map((profiles ?? []).map((p: any) => [p.id, p]));
    const roleById = new Map((roles ?? []).map((r: any) => [r.user_id, r.role]));
    const alreadySeeded = new Set((existing ?? []).map((r: any) => r.user_id).filter(Boolean));

    const rows: any[] = [];
    for (const u of (authList?.data?.users ?? []) as any[]) {
      if (!u.last_sign_in_at) continue;
      if (alreadySeeded.has(u.id)) continue;
      const p: any = profileById.get(u.id);
      rows.push({
        created_at: u.last_sign_in_at,
        email: u.email ?? p?.email ?? "",
        user_id: u.id,
        full_name: p?.full_name ?? null,
        role: roleById.get(u.id) ?? "visualizador",
        status: "success",
        error_message: null,
        user_agent: "(histórico importado do Supabase Auth)",
      });
    }

    if (rows.length > 0) {
      const { error } = await supabaseAdmin.from("auth_access_logs").insert(rows);
      if (error) throw new Error(error.message);
    }

    return { ok: true, seeded: rows.length };
  });
