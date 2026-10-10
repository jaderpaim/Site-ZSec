import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { logAudit } from "@/lib/audit-log.functions";
import { APP_NAME } from "@/lib/brand";
import { sendMail } from "@/lib/mailer.server";
import { writeSecret } from "@/lib/crypto.server";

function admin() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function assertAdmin(context: any) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error) throw new Error("Forbidden");
  if (!data) throw new Error("Forbidden: admin role required");
}

export const getSmtpConfig = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const sb = admin();
    const { data } = await sb.from("smtp_config").select("*").limit(1).maybeSingle();
    const hasDbPassword = !!(data as any)?.password;
    const safe = data ? { ...data, password: undefined } : null;
    return {
      config: safe,
      hasPassword: hasDbPassword || !!process.env.SMTP_PASSWORD,
      passwordSource: hasDbPassword ? "db" : process.env.SMTP_PASSWORD ? "secret" : null,
    };
  });

export const upsertSmtpConfig = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) =>
    z
      .object({
        host: z.string().min(1).max(255),
        port: z.number().int().min(1).max(65535),
        username: z.string().max(255).optional().nullable(),
        from_email: z.string().email().max(255),
        from_name: z.string().max(255).optional().nullable(),
        secure: z.boolean(),
        enabled: z.boolean(),
        updated_by: z.string().uuid().optional().nullable(),
        password: z.string().max(500).optional().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = admin();
    const { password, ...rest } = data;
    const payload: Record<string, any> = { ...rest };
    // Gravada cifrada; sendMail (mailer.server.ts) decifra no envio.
    if (password && password.length > 0) payload.password = writeSecret(password);

    const { data: existing } = await sb.from("smtp_config").select("id").limit(1).maybeSingle();
    let error: { message: string } | null = null;
    if (existing?.id) {
      ({ error } = await sb.from("smtp_config").update(payload).eq("id", existing.id));
    } else {
      ({ error } = await sb.from("smtp_config").insert(payload));
    }

    await logAudit({
      userId: context.userId,
      modulo: "smtp",
      acao: existing?.id ? "update" : "create",
      descricao: `${existing?.id ? "Editou" : "Criou"} a configuração SMTP (host: ${rest.host}, remetente: ${rest.from_email})`,
      status: error ? "error" : "success",
      mensagemErro: error?.message ?? null,
      detalhes: {
        host: rest.host,
        port: rest.port,
        from_email: rest.from_email,
        enabled: rest.enabled,
        secure: rest.secure,
      },
    });

    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const sendTestSmtpEmail = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => z.object({ to: z.string().email() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = admin();
    const { data: cfg } = await sb.from("smtp_config").select("*").limit(1).maybeSingle();
    if (!cfg || !cfg.host) {
      return { ok: false, error: "SMTP não configurado" };
    }
    const password = (cfg as any).password || process.env.SMTP_PASSWORD;
    if (!password) {
      return { ok: false, error: "Senha SMTP não configurada" };
    }
    const subject = `${APP_NAME} · Teste de SMTP`;
    const html = `<div style="font-family:Arial,sans-serif"><h3>Teste de SMTP</h3><p>Se você recebeu este e-mail, sua configuração SMTP está funcionando corretamente.</p></div>`;
    try {
      const out = await sendMail({
          host: cfg.host,
          port: cfg.port || 587,
          secure: !!cfg.secure,
          username: cfg.username || null,
          password,
          from: { name: cfg.from_name || APP_NAME, email: cfg.from_email },
          to: data.to,
          subject,
          html,
        });
      await sb.from("email_logs").insert({
        to_email: data.to,
        subject,
        template: "smtp_test",
        status: out.ok ? "success" : "error",
        error_message: out.ok ? null : String(out.error ?? "Falha desconhecida"),
      });
      return out.ok ? { ok: true } : { ok: false, error: String(out.error) };
    } catch (e: any) {
      const msg = String(e?.message ?? e);
      await sb.from("email_logs").insert({
        to_email: data.to,
        subject,
        template: "smtp_test",
        status: "error",
        error_message: msg,
      });
      return { ok: false, error: msg };
    }
  });
