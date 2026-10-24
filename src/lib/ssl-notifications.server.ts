// Server-only: alerta de renovação de certificado SSL importado (Teams +
// e-mail p/ admins globais), mesmo mecanismo das notificações de DNS/SAST.
// Falha de notificação nunca derruba a renovação.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isAlertModuleEnabled } from "@/lib/alert-modules.functions";
import { APP_NAME } from "@/lib/brand";
import { appUrl } from "@/lib/app-url";
import { sendMail } from "@/lib/mailer.server";
import { emailStrong, renderEmail } from "@/lib/email-layout";
import { postTeamsWebhook } from "@/lib/teams-webhook";

const adminDb = supabaseAdmin as unknown as { from: (t: string) => any };

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
    const link = `${appUrl()}/app/dominios-ssl`;
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
      await postTeamsWebhook(teamsCfg.teams_webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          "@type": "MessageCard",
          "@context": "http://schema.org/extensions",
          themeColor: "10B981",
          summary: `${title}: ${args.domain}`,
          sections: [
            {
              activityTitle: `🔒 ${APP_NAME} · ${title}`,
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

    const subject = `${APP_NAME} · ${title}: ${args.domain}`;
    const html = renderEmail({
      module: "Domínios e SSL",
      tone: "ok",
      status: "Certificado renovado",
      title: `Certificado de ${args.domain} renovado`,
      intro: `O novo certificado vale até <strong class="fg" style="color:#111827;">${fmtBr(args.current.valid_to)}</strong>. Confira se ele já está instalado em todas as URLs vinculadas.`,
      preheader: `Novo certificado válido até ${fmtBr(args.current.valid_to)}`,
      blocks: [
        {
          kind: "diff",
          items: [
            { label: "Validade", before: fmtBr(args.previous.valid_to), after: fmtBr(args.current.valid_to) },
            ...(args.previous.issuer !== args.current.issuer
              ? [{ label: "Emissor", before: args.previous.issuer ?? "—", after: args.current.issuer }]
              : []),
          ],
        },
        {
          kind: "facts",
          items: [
            {
              label: "URLs vinculadas",
              value: args.bindings.length > 0 ? args.bindings.join("\n") : "Nenhuma URL cadastrada",
              mono: args.bindings.length > 0,
            },
            { label: "Emissor", value: args.current.issuer },
            { label: "Fingerprint (SHA-256)", value: args.current.fingerprint_sha256, mono: true },
          ],
        },
      ],
      cta: { label: "Conferir instalação", url: link },
      meta: `Renovado por ${emailStrong(actorName)}`,
      reason: `Você recebeu porque é administrador global do ${APP_NAME}.`,
    });

    for (const to of recipients) {
      try {
        const out: any = await sendMail({
            host: smtpCfg.host,
            port: smtpCfg.port || 587,
            secure: !!smtpCfg.secure,
            username: smtpCfg.username || null,
            password,
            from: { name: smtpCfg.from_name || APP_NAME, email: smtpCfg.from_email },
            to,
            subject,
            html,
          });
        await adminDb.from("email_logs").insert({
          to_email: to,
          subject,
          template: "ssl_cert_renewed",
          status: out.ok ? "success" : "error",
          error_message: out.ok ? null : String(out.error ?? "falha no envio"),
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
