import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { applyEmailTemplate, getEmailTemplateOverride } from "./email-templates.functions";
import { buildFornecedorExpiryAlertHtml } from "./email-templates.defaults";

function admin() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function assertCanManageFornecedores(context: any) {
  const { data, error } = await context.supabase.rpc("is_module_admin", {
    _user_id: context.userId,
    _module: "fornecedores",
  });
  if (error) throw new Error("Forbidden");
  if (!data) throw new Error("Forbidden: admin role required");
}

async function assertCanViewFornecedores(context: any) {
  const { data, error } = await context.supabase.rpc("has_module_permission", {
    _user_id: context.userId,
    _module: "fornecedores",
    _action: "view",
  });
  if (error) throw new Error("Forbidden");
  if (!data) throw new Error("Forbidden");
}

const UpsertSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  nome: z.string().min(1).max(200),
  servico_prestado: z.string().min(1).max(500),
  data_contratacao: z.string().min(1),
  data_expiracao: z.string().optional().nullable(),
  department_id: z.string().uuid().optional().nullable(),
  alert_days: z.number().int().min(1).max(365).optional(),
  created_by: z.string().uuid().optional().nullable(),
});

export const listFornecedores = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await assertCanViewFornecedores(context);
    const sb = admin();

    // Tenta o select completo (com departamento + alertas). Caso a migração ainda
    // não tenha sido aplicada, a coluna/relacionamento não existe e o PostgREST
    // retorna erro — então caímos no select básico para não quebrar a listagem.
    const full = await sb
      .from("fornecedores")
      .select(
        "id, nome, servico_prestado, data_contratacao, data_expiracao, department_id, alert_days, last_alert_sent_at, created_at, updated_at, departments(name)",
      )
      .order("nome");

    if (!full.error) {
      return (full.data ?? []).map((r: any) => ({
        id: r.id,
        nome: r.nome,
        servico_prestado: r.servico_prestado,
        data_contratacao: r.data_contratacao,
        data_expiracao: r.data_expiracao,
        department_id: r.department_id ?? null,
        department_name: r.departments?.name ?? null,
        alert_days: r.alert_days,
        last_alert_sent_at: r.last_alert_sent_at ?? null,
        created_at: r.created_at,
        updated_at: r.updated_at,
      }));
    }

    // Fallback — migração de departamento/alertas ainda não aplicada.
    const { data, error } = await sb
      .from("fornecedores")
      .select("id, nome, servico_prestado, data_contratacao, data_expiracao, alert_days, created_at, updated_at")
      .order("nome");
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: any) => ({
      id: r.id,
      nome: r.nome,
      servico_prestado: r.servico_prestado,
      data_contratacao: r.data_contratacao,
      data_expiracao: r.data_expiracao,
      department_id: null,
      department_name: null,
      alert_days: r.alert_days,
      last_alert_sent_at: null,
      created_at: r.created_at,
      updated_at: r.updated_at,
    }));
  });

export const upsertFornecedor = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => UpsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertCanManageFornecedores(context);
    const sb = admin();
    const base = {
      nome: data.nome.trim(),
      servico_prestado: data.servico_prestado.trim(),
      data_contratacao: data.data_contratacao,
      data_expiracao: data.data_expiracao || null,
      alert_days: data.alert_days ?? 30,
    };
    const payload = { ...base, department_id: data.department_id || null };
    // Erro de coluna inexistente → migração de departamento ainda não aplicada.
    const missingCol = (e: { message?: string } | null) =>
      !!e?.message && /department_id|last_alert_sent_at|column/i.test(e.message);

    if (data.id) {
      let { error } = await sb.from("fornecedores").update(payload).eq("id", data.id);
      if (error && missingCol(error)) {
        ({ error } = await sb.from("fornecedores").update(base).eq("id", data.id));
      }
      if (error) throw new Error(error.message);
      // Dispara verificação após salvar (caso já esteja no prazo de alerta)
      checkExpiringFornecedoresAndNotify().catch(() => {});
      return { ok: true, id: data.id };
    }

    let ins = await sb
      .from("fornecedores")
      .insert({ ...payload, created_by: data.created_by ?? null })
      .select("id")
      .single();
    if (ins.error && missingCol(ins.error)) {
      ins = await sb
        .from("fornecedores")
        .insert({ ...base, created_by: data.created_by ?? null })
        .select("id")
        .single();
    }
    if (ins.error) throw new Error(ins.error.message);
    checkExpiringFornecedoresAndNotify().catch(() => {});
    return { ok: true, id: ins.data.id };
  });

export const updateFornecedorAlertDays = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { id: string; alert_days: number }) =>
    z.object({ id: z.string().uuid(), alert_days: z.number().int().min(1).max(365) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertCanManageFornecedores(context);
    const sb = admin();
    // Reset last_alert_sent_at para o novo threshold ser avaliado imediatamente
    let { error } = await sb
      .from("fornecedores")
      .update({ alert_days: data.alert_days, last_alert_sent_at: null })
      .eq("id", data.id);
    // Pré-migração: coluna last_alert_sent_at ainda não existe → atualiza só alert_days
    if (error && /last_alert_sent_at|column/i.test(error.message)) {
      ({ error } = await sb.from("fornecedores").update({ alert_days: data.alert_days }).eq("id", data.id));
    }
    if (error) throw new Error(error.message);

    // Se o fornecedor está no prazo com o novo alerta, envia já
    const { data: row } = await sb.from("fornecedores").select("data_expiracao").eq("id", data.id).maybeSingle();
    if (row?.data_expiracao) {
      const days = daysUntilExpiry(row.data_expiracao);
      if (days !== null && days >= 0 && days <= data.alert_days) {
        await checkExpiringFornecedoresAndNotify().catch(() => {});
      }
    }
    return { ok: true };
  });

export const deleteFornecedor = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertCanManageFornecedores(context);
    const sb = admin();
    const { error } = await sb.from("fornecedores").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── Alertas de vencimento (igual SSL/Domínios) ───────────────────────────────

// Início de "hoje" (00:00 BRT) como timestamp UTC.
function startOfTodayBRTUtc(): Date {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const startBRT = Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate(), 0, 0, 0);
  return new Date(startBRT + 3 * 60 * 60 * 1000);
}

// Meia-noite BRT de hoje (UTC-3) como timestamp UTC.
function midnightBRT(): Date {
  const brt = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate(), 3, 0, 0));
}

// Converte data (YYYY-MM-DD) para meia-noite BRT.
function dateMidnightBRT(d: string): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, day, 3, 0, 0));
}

// Dias entre hoje (meia-noite BRT) e a data de expiração — igual ao frontend.
function daysUntilExpiry(dataExpiracao: string | null): number | null {
  if (!dataExpiracao) return null;
  const today = midnightBRT().getTime();
  const exp = dateMidnightBRT(dataExpiracao).getTime();
  return Math.round((exp - today) / 86400000);
}

async function getDepartmentEmails(deptId: string | null): Promise<string[]> {
  if (!deptId) return [];
  const sb = admin();
  const { data: dept } = await sb.from("departments").select("emails").eq("id", deptId).maybeSingle();
  const emails: string[] = Array.isArray((dept as any)?.emails) ? (dept as any).emails : [];
  return Array.from(new Set(emails.map((e) => String(e).trim().toLowerCase()).filter(Boolean)));
}

async function getAdminEmails(): Promise<string[]> {
  const sb = admin();
  const [{ data: globalRoles }, { data: modAdmins }] = await Promise.all([
    sb.from("user_roles").select("user_id").eq("role", "admin"),
    sb.from("module_admins").select("user_id").eq("module_slug", "fornecedores"),
  ]);
  const ids = new Set<string>([
    ...((globalRoles ?? []) as any[]).map((r) => r.user_id),
    ...((modAdmins ?? []) as any[]).map((r) => r.user_id),
  ]);
  if (ids.size === 0) return [];
  const { data: profiles } = await sb
    .from("profiles")
    .select("email")
    .in("id", [...ids]);
  return ((profiles ?? []) as any[])
    .map((p) =>
      String(p.email ?? "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
}

/**
 * Verifica fornecedores próximos do vencimento e envia e-mail.
 * Cada fornecedor notifica os e-mails do SEU departamento + admins globais/do módulo.
 * Envia no máximo 1x por dia (BRT) por fornecedor.
 */
export async function checkExpiringFornecedoresAndNotify(): Promise<{ notified: number; fornecedores: number }> {
  const sb = admin();

  const { data: rows } = await sb
    .from("fornecedores")
    .select("id, nome, servico_prestado, data_expiracao, department_id, alert_days, last_alert_sent_at");
  const startTodayBRT = startOfTodayBRTUtc().getTime();

  const expiring = (rows ?? []).filter((r: any) => {
    if (!r.data_expiracao) return false;
    const days = daysUntilExpiry(r.data_expiracao);
    if (days === null || days < 0 || days > (r.alert_days ?? 30)) return false;
    if (!r.last_alert_sent_at) return true;
    return new Date(r.last_alert_sent_at).getTime() < startTodayBRT;
  });

  if (expiring.length === 0) return { notified: 0, fornecedores: 0 };

  const adminEmails = await getAdminEmails();

  // SMTP
  const { data: cfg } = await sb.from("smtp_config").select("*").limit(1).maybeSingle();
  if (!cfg?.host) return { notified: 0, fornecedores: expiring.length };
  const password = (cfg as any).password || process.env.SMTP_PASSWORD;
  if (!password) return { notified: 0, fornecedores: expiring.length };

  const url = `${process.env.SUPABASE_URL}/functions/v1/send-smtp`;
  const templateOverride = await getEmailTemplateOverride(sb, "fornecedor_expiry_alert");

  // Cache de e-mails por departamento
  const deptEmailCache = new Map<string, string[]>();
  async function deptEmails(deptId: string | null): Promise<string[]> {
    if (!deptId) return [];
    if (deptEmailCache.has(deptId)) return deptEmailCache.get(deptId)!;
    const e = await getDepartmentEmails(deptId);
    deptEmailCache.set(deptId, e);
    return e;
  }

  let notified = 0;
  const notifiedIds: string[] = [];

  for (const r of expiring as any[]) {
    const recipients = Array.from(new Set([...adminEmails, ...(await deptEmails(r.department_id))]));
    if (recipients.length === 0) continue;

    const days = daysUntilExpiry(r.data_expiracao)!;
    const subject = `B-Security · Fornecedor "${r.nome}" próximo do vencimento (${days} dia(s))`;
    const defaultHtml = buildFornecedorExpiryAlertHtml({
      nome: r.nome,
      servico: r.servico_prestado ?? "—",
      vencimento: r.data_expiracao,
      dias: days,
    });
    const html = applyEmailTemplate(
      "fornecedor_expiry_alert",
      templateOverride,
      {
        fornecedor: r.nome,
        servico: r.servico_prestado ?? "—",
        vencimento: r.data_expiracao,
        dias: String(days),
      },
      defaultHtml,
    );

    let sentToAny = false;
    for (const to of recipients) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            host: cfg.host,
            port: cfg.port || 587,
            secure: !!cfg.secure,
            username: cfg.username || null,
            password,
            from: { name: cfg.from_name || "B-Security", email: cfg.from_email },
            to,
            subject,
            html,
          }),
        });
        const out: any = await res.json().catch(() => ({ ok: false }));
        await sb.from("email_logs").insert({
          to_email: to,
          subject,
          template: "fornecedor_expiry_alert",
          status: out.ok ? "success" : "error",
          error_message: out.ok ? null : String(out.error ?? `HTTP ${res.status}`),
        });
        if (out.ok) {
          notified++;
          sentToAny = true;
        }
      } catch (e: any) {
        await sb.from("email_logs").insert({
          to_email: to,
          subject,
          template: "fornecedor_expiry_alert",
          status: "error",
          error_message: String(e?.message ?? e),
        });
      }
    }
    if (sentToAny) notifiedIds.push(r.id);
  }

  if (notifiedIds.length > 0) {
    await sb.from("fornecedores").update({ last_alert_sent_at: new Date().toISOString() }).in("id", notifiedIds);
  }

  return { notified, fornecedores: expiring.length };
}

export const triggerFornecedorAlertCheck = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await assertCanManageFornecedores(context);
    const sb = admin();
    const startTodayBRT = startOfTodayBRTUtc();

    const { data: rows } = await sb
      .from("fornecedores")
      .select("id, nome, data_expiracao, department_id, alert_days, last_alert_sent_at");
    const debug = (rows ?? []).map((r: any) => {
      if (!r.data_expiracao) return { fornecedor: r.nome, reason: "sem data de expiração" };
      const days = daysUntilExpiry(r.data_expiracao);
      if (days === null || days < 0 || days > (r.alert_days ?? 30))
        return { fornecedor: r.nome, days, alert_days: r.alert_days, reason: `fora do prazo` };
      if (r.last_alert_sent_at && new Date(r.last_alert_sent_at).getTime() >= startTodayBRT.getTime())
        return { fornecedor: r.nome, days, alert_days: r.alert_days, reason: `já enviado hoje` };
      return { fornecedor: r.nome, days, alert_days: r.alert_days, reason: "SERÁ ENVIADO" };
    });

    const { data: cfg } = await sb.from("smtp_config").select("host").limit(1).maybeSingle();
    const result = await checkExpiringFornecedoresAndNotify();
    return { ...result, debug, smtp: cfg?.host ? "CONFIGURADO" : "NAO_CONFIGURADO" };
  });
