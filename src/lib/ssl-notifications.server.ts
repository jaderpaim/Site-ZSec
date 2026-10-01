// Server-only: alerta de renovação de certificado SSL importado (Teams +
// e-mail p/ admins globais), mesmo mecanismo das notificações de DNS/SAST.
// Falha de notificação nunca derruba a renovação.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isAlertModuleEnabled } from "@/lib/alert-modules.functions";

const adminDb = supabaseAdmin as unknown as { from: (t: string) => any };

function getAppBaseUrl() {
  const explicitUrl = process.env.APP_URL || process.env.PUBLIC_APP_URL;
  if (explicitUrl) return explicitUrl.replace(/\/+$/, "");
  return "https://b-security.bernoulli.com.br";
}

function escapeHtml(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );
}

async function getGlobalAdminEmails(): Promise<string[]> {
  const { data: roles } = await adminDb
    .from("user_roles")
    .select("user_id")
    .in("role", ["admin", "super_admin"]);
  const ids = Array.from(new Set(((roles ?? []) as any[]).map((r) => r.user_id)));
  if (ids.length === 0) return [];
  const { data: profiles } = await adminDb.from("profiles").select("email").in("id", ids);
  return ((profiles ?? []) as any[])
    .map((p) =>
      String(p.email ?? "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
}

function fmtBr(d: string | null): string {
  if (!d) return "—";
  const [y, m, day] = d.slice(0, 10).split("-");
  return `${day}/${m}/${y}`;
}

export async function notifySslCertRenewed(args: {
  domain: string;
  previous: { issuer: string | null; valid_to: string | null };
  current: { issuer: string; valid_to: string; fingerprint_sha256: string };
  bindings: string[];
  actorUserId: string;
}): Promise<void> {
  try {
    const alertEnabled = await isAlertModuleEnabled("ssl_cert_renewed");
    if (!alertEnabled) return;

    const { data: profile } = await adminDb
      .from("profiles")
      .select("email, full_name")
      .eq("id", args.actorUserId)
      .maybeSingle();
    const actorName: string = profile?.full_name || profile?.email || "—";
    const title = "Certificado SSL renovado";
    const link = `${getAppBaseUrl()}/app/dominios-ssl`;
    const facts = [
      { name: "Domínio", value: args.domain },
      { name: "Emissor", value: `${args.previous.issuer ?? "—"} → ${args.current.issuer}` },
      { name: "Validade", value: `${fmtBr(args.previous.valid_to)} → ${fmtBr(args.current.valid_to)}` },
      { name: "Fingerprint (SHA-256)", value: args.current.fingerprint_sha256 },
      {
        name: "URLs vinculadas",
        value: args.bindings.length > 0 ? args.bindings.join("\n") : "Nenhuma URL cadastrada",
      },
      { name: "Renovado por", value: actorName },
    ];

    const { data: integ } = await adminDb
      .from("integrations")
      .select("config, enabled")
      .eq("provider", "disponibilidade_alerts")
      .eq("name", "config")
      .maybeSingle();
    const teamsCfg = integ?.enabled
      ? (integ.config as { teams_enabled?: boolean; teams_webhook_url?: string | null })
      : null;
    if (teamsCfg?.teams_enabled && teamsCfg.teams_webhook_url) {
      await fetch(teamsCfg.teams_webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          "@type": "MessageCard",
          "@context": "http://schema.org/extensions",
          themeColor: "10B981",
          summary: `${title}: ${args.domain}`,
          sections: [
            {
              activityTitle: `🔒 B-Security · ${title}`,
              activitySubtitle: new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }),
              facts: facts.map((f) => ({ ...f, value: f.value.replace(/\n/g, "  \n") })),
              markdown: true,
            },
          ],
        }),
      }).catch(() => {});
    }

    const recipients = await getGlobalAdminEmails();
    if (recipients.length === 0) return;
    const { data: smtpCfg } = await adminDb.from("smtp_config").select("*").limit(1).maybeSingle();
    if (!smtpCfg?.host) return;
    const password = smtpCfg.password || process.env.SMTP_PASSWORD;
    if (!password) return;

    const subject = `B-Security · ${title}: ${args.domain}`;
    const rowsHtml = facts
      .map(
        (x) =>
          `<tr><td style="padding:10px 16px;border-bottom:1px solid #1e2a3a;font-size:10px;letter-spacing:2px;text-transform:uppercase;color:#6b7280;width:160px;vertical-align:top;">${escapeHtml(x.name)}</td><td style="padding:10px 16px;border-bottom:1px solid #1e2a3a;font-size:14px;color:#ffffff;word-break:break-word;">${escapeHtml(x.value).replace(/\n/g, "<br/>")}</td></tr>`,
      )
      .join("");
    const html = `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="UTF-8"/><title>${escapeHtml(title)}</title></head>
<body style="margin:0;padding:0;background:#0b0f1a;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#0b0f1a"><tr><td align="center" style="padding:40px 16px;">
<table role="presentation" cellspacing="0" cellpadding="0" style="max-width:580px;width:100%;background:#111827;border:1px solid #1e2a3a;border-radius:10px;">
<tr><td style="padding:28px 32px 8px;"><div style="font-size:22px;font-weight:700;color:#ffffff;">B&#8209;Security</div>
<div style="font-size:10px;color:#9ca3af;letter-spacing:3px;text-transform:uppercase;margin-top:6px;">Domínios / SSL</div></td></tr>
<tr><td style="padding:12px 32px 20px;"><h1 style="margin:0;font-size:20px;color:#ffffff;">${escapeHtml(title)}</h1>
<p style="margin:10px 0 0;font-size:13px;color:#9ca3af;line-height:1.6;">Confirme que o novo certificado foi instalado em todas as URLs vinculadas abaixo.</p></td></tr>
<tr><td style="padding:0 16px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rowsHtml}</table></td></tr>
<tr><td align="center" style="padding:24px 32px 32px;"><a href="${link}" style="display:inline-block;background:#10b981;color:#ffffff;text-decoration:none;font-weight:700;font-size:13px;padding:12px 24px;border-radius:6px;">Abrir Domínios / SSL</a></td></tr>
</table></td></tr></table></body></html>`;

    const url = `${process.env.SUPABASE_URL}/functions/v1/send-smtp`;
    for (const to of recipients) {
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            host: smtpCfg.host,
            port: smtpCfg.port || 587,
            secure: !!smtpCfg.secure,
            username: smtpCfg.username || null,
            password,
            from: { name: smtpCfg.from_name || "B-Security", email: smtpCfg.from_email },
            to,
            subject,
            html,
          }),
        });
        const out: any = await res.json().catch(() => ({ ok: false }));
        await adminDb.from("email_logs").insert({
          to_email: to,
          subject,
          template: "ssl_cert_renewed",
          status: out.ok ? "success" : "error",
          error_message: out.ok ? null : String(out.error ?? `HTTP ${res.status}`),
        });
      } catch (e: any) {
        await adminDb.from("email_logs").insert({
          to_email: to,
          subject,
          template: "ssl_cert_renewed",
          status: "error",
          error_message: String(e?.message ?? e),
        });
      }
    }
  } catch {
    // notificação não bloqueia a renovação
  }
}
