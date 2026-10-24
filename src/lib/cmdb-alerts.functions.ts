import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { applyEmailTemplate, getEmailTemplateOverride } from "./email-templates.functions";
import { buildCmdbDeviceAlertHtml, buildCmdbDeviceStoppedHtml, emailTableHtml } from "./email-templates.defaults";
import { appUrlOrNull } from "@/lib/app-url";
import { isAlertModuleEnabled } from "./alert-modules.functions";
import { APP_NAME } from "@/lib/brand";
import { sendMail } from "@/lib/mailer.server";
import { coverageStatus, missingSources } from "@/lib/monitoring";
import { postTeamsWebhook } from "@/lib/teams-webhook";

function admin() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

type Ativo = {
  id: string;
  nome: string;
  tipo: string | null;
  ip_hostname: string | null;
  status: string;
};

type Bucket = "Alerta" | "Inativo";
// Fontes ligadas em que o ativo não aparece, ex.: "Zabbix" ou "SIEM e Zabbix".
type FailIn = string;

type Classified = {
  ativo: Ativo;
  bucket: Bucket;
  failIn: FailIn;
};

async function getAdminEmails(sb: ReturnType<typeof admin>): Promise<string[]> {
  const [{ data: globalRoles }, { data: modAdmins }] = await Promise.all([
    sb.from("user_roles").select("user_id").eq("role", "admin"),
    sb.from("module_admins").select("user_id").eq("module_slug", "cmdb"),
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

function buildSiemSets(logSources: Array<{ name: string; status: string | null }>) {
  const hosts = new Set<string>();
  const ips = new Set<string>();
  for (const s of logSources) {
    if (s.status && s.status !== "success") continue;
    const name = s.name ?? "";
    const low = name.toLowerCase();
    if (low.includes("wincollect")) {
      const parts = name.split(" - ");
      const host = (parts[parts.length - 1] ?? "").trim().toLowerCase();
      if (host) hosts.add(host);
    } else if (low.includes("fgt")) {
      const atIdx = name.lastIndexOf(" @ ");
      if (atIdx >= 0) {
        const ip = name
          .slice(atIdx + 3)
          .trim()
          .toLowerCase();
        if (ip) ips.add(ip);
      } else {
        hosts.add(name.trim().toLowerCase());
      }
    }
  }
  return { hosts, ips };
}

function isInSiem(a: Ativo, siemHosts: Set<string>, siemIps: Set<string>): boolean {
  const isFw = (a.tipo ?? "").toLowerCase().includes("firewall");
  const candidates = [a.nome, a.ip_hostname].filter(Boolean) as string[];
  return candidates.some((v) => {
    const val = v.trim().toLowerCase();
    if (isFw) return siemIps.has(val) || siemHosts.has(val);
    return siemHosts.has(val);
  });
}

function isInZabbix(a: Ativo, zbxHosts: Set<string>, zbxIps: Set<string>): boolean {
  const candidates = [a.nome, a.ip_hostname].filter(Boolean) as string[];
  return candidates.some((v) => {
    const val = v.trim().toLowerCase();
    return zbxHosts.has(val) || zbxIps.has(val);
  });
}

function htmlTable(rows: Classified[], tone: "warn" | "crit"): string {
  return emailTableHtml(
    [{ label: "Ativo" }, { label: "Tipo" }, { label: "IP / Host" }, { label: "Falta em" }],
    rows.map((r) => [
      { text: r.ativo.nome },
      { text: r.ativo.tipo ?? "—" },
      { text: r.ativo.ip_hostname ?? "—", mono: true },
      { text: r.failIn, chip: tone },
    ]),
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function notifyCmdbChannels(sb: any, alertBucket: Classified[], stoppedBucket: Classified[]): Promise<void> {
  try {
    const { data: row } = await sb
      .from("integrations")
      .select("config, enabled")
      .eq("provider", "disponibilidade_alerts")
      .eq("name", "config")
      .maybeSingle();
    if (!row?.enabled) return;

    type Cfg = {
      teams_webhook_url: string | null;
      teams_enabled: boolean;
      telegram_bot_token: string | null;
      telegram_chat_id: string | null;
      telegram_enabled: boolean;
    };
    const cfg = row.config as Cfg;
    const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });

    const toFacts = (bucket: Classified[]) =>
      bucket.map((r) => ({
        name: r.ativo.nome,
        value: `${r.ativo.tipo ?? "?"} · ${r.ativo.ip_hostname ?? "—"} · falha: ${r.failIn}`,
      }));

    // Teams: seção de resumo + uma seção por categoria (facts = tabela de duas colunas)
    const teamsSections: object[] = [
      {
        activityTitle: `🖥️ ${APP_NAME} · CMDB Device Alert`,
        activitySubtitle: now,
        facts: [
          { name: "⚠️ Em Alerta", value: `${alertBucket.length} ativo(s) — cobertura parcial` },
          { name: "🔴 Inativos", value: `${stoppedBucket.length} ativo(s) — sem monitoramento` },
        ],
        markdown: true,
      },
    ];
    if (stoppedBucket.length > 0) {
      teamsSections.push({
        title: `🔴 Inativos — sem monitoramento (${stoppedBucket.length})`,
        facts: toFacts(stoppedBucket),
        markdown: true,
      });
    }
    if (alertBucket.length > 0) {
      teamsSections.push({
        title: `⚠️ Em Alerta — cobertura parcial (${alertBucket.length})`,
        facts: toFacts(alertBucket),
        markdown: true,
      });
    }

    // Telegram: mensagem HTML com seções separadas por linha dupla
    const telegramLines = (bucket: Classified[]) =>
      bucket
        .map(
          (r) =>
            `• <b>${r.ativo.nome}</b>\n  <i>${r.ativo.tipo ?? "?"}</i>${r.ativo.ip_hostname ? ` · <code>${r.ativo.ip_hostname}</code>` : ""} · falha: ${r.failIn}`,
        )
        .join("\n");

    const telegramText = [
      `🖥️ <b>${APP_NAME} · CMDB Device Alert</b>\n📅 ${now}\n\n` +
        `⚠️ Em Alerta: <b>${alertBucket.length}</b>   🔴 Inativos: <b>${stoppedBucket.length}</b>`,
      stoppedBucket.length > 0 &&
        `🔴 <b>Inativos — sem monitoramento (${stoppedBucket.length}):</b>\n${telegramLines(stoppedBucket)}`,
      alertBucket.length > 0 &&
        `⚠️ <b>Em Alerta — cobertura parcial (${alertBucket.length}):</b>\n${telegramLines(alertBucket)}`,
    ]
      .filter(Boolean)
      .join("\n\n");

    const tasks: Promise<unknown>[] = [];

    if (cfg.teams_enabled && cfg.teams_webhook_url) {
      tasks.push(
        postTeamsWebhook(cfg.teams_webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            "@type": "MessageCard",
            "@context": "http://schema.org/extensions",
            themeColor: "F97316",
            summary: `CMDB: ${alertBucket.length} em Alerta, ${stoppedBucket.length} Inativo(s)`,
            sections: teamsSections,
          }),
        }).catch(() => {}),
      );
    }

    if (cfg.telegram_enabled && cfg.telegram_bot_token && cfg.telegram_chat_id) {
      tasks.push(
        fetch(`https://api.telegram.org/bot${cfg.telegram_bot_token}/sendMessage`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            chat_id: cfg.telegram_chat_id,
            text: telegramText,
            parse_mode: "HTML",
            disable_web_page_preview: true,
          }),
        }).catch(() => {}),
      );
    }

    await Promise.allSettled(tasks);
  } catch {
    // canais não bloqueiam o fluxo principal
  }
}

export async function checkCmdbDevicesAndNotify(): Promise<{
  alertCount: number;
  stoppedCount: number;
  notifiedRecipients: number;
}> {
  const sb = admin();

  // 1. Ativos do CMDB (ignora Desativado)
  const { data: ativosRaw } = await sb
    .from("cmdb_ativos")
    .select("id, nome, tipo, ip_hostname, status")
    .neq("status", "Desativado");
  const ativos = (ativosRaw ?? []) as Ativo[];
  if (ativos.length === 0) return { alertCount: 0, stoppedCount: 0, notifiedRecipients: 0 };

  // Só as fontes ligadas contam; sem nenhuma, não há o que alertar.
  const { loadMonitoringSources } = await import("./monitoring.server");
  const sources = await loadMonitoringSources(sb);
  if (!sources.siem && !sources.zabbix) return { alertCount: 0, stoppedCount: 0, notifiedRecipients: 0 };

  // 2. SIEM coverage
  const { data: ls } = await sb
    .from("qradar_log_sources")
    .select("name, status")
    .or("name.ilike.%FGT%,name.ilike.%WinCollect%");
  const { hosts: siemHosts, ips: siemIps } = buildSiemSets((ls ?? []) as any);

  // 3. Zabbix coverage
  const zbxHosts = new Set<string>();
  const zbxIps = new Set<string>();
  try {
    const { getZabbixCreds, listMonitoredHosts } = await import("./zabbix.server");
    const creds = await getZabbixCreds();
    if (creds) {
      const { available, unknown } = await listMonitoredHosts(creds);
      for (const h of [...available, ...unknown]) {
        if (h.host) zbxHosts.add(h.host.trim().toLowerCase());
        if (h.name) zbxHosts.add(h.name.trim().toLowerCase());
        for (const i of h.interfaces ?? []) {
          if (i.ip) zbxIps.add(i.ip.trim().toLowerCase());
          if (i.dns) zbxHosts.add(i.dns.trim().toLowerCase());
        }
      }
    }
  } catch {
    // Zabbix fora do ar: fica de fora desta rodada em vez de acusar todo ativo
    sources.zabbix = false;
    if (!sources.siem) return { alertCount: 0, stoppedCount: 0, notifiedRecipients: 0 };
  }

  // 4. Classifica
  const alertBucket: Classified[] = [];
  const stoppedBucket: Classified[] = [];
  for (const a of ativos) {
    const covered = { siem: isInSiem(a, siemHosts, siemIps), zabbix: isInZabbix(a, zbxHosts, zbxIps) };
    const status = coverageStatus(sources, covered);
    if (status === "Ativo" || status === null) continue;
    const failIn = missingSources(sources, covered).join(" e ");
    (status === "Alerta" ? alertBucket : stoppedBucket).push({ ativo: a, bucket: status, failIn });
  }

  if (alertBucket.length === 0 && stoppedBucket.length === 0) {
    return { alertCount: 0, stoppedCount: 0, notifiedRecipients: 0 };
  }

  // 5. Teams / Telegram (independente do SMTP) — somente se o módulo estiver ativado
  if (await isAlertModuleEnabled("cmdb_device_alert")) {
    await notifyCmdbChannels(sb, alertBucket, stoppedBucket);
  }

  // 6. SMTP
  const { data: cfg } = await sb.from("smtp_config").select("*").limit(1).maybeSingle();
  if (!cfg?.host) return { alertCount: alertBucket.length, stoppedCount: stoppedBucket.length, notifiedRecipients: 0 };
  const password = (cfg as any).password || process.env.SMTP_PASSWORD;
  if (!password) return { alertCount: alertBucket.length, stoppedCount: stoppedBucket.length, notifiedRecipients: 0 };

  const recipients = await getAdminEmails(sb);
  if (recipients.length === 0) {
    return { alertCount: alertBucket.length, stoppedCount: stoppedBucket.length, notifiedRecipients: 0 };
  }


  type Email = { subject: string; html: string; template: string };
  const emails: Email[] = [];
  if (alertBucket.length > 0) {
    const tabela = htmlTable(alertBucket, "warn");
    const base = appUrlOrNull();
    const defaultHtml = buildCmdbDeviceAlertHtml(tabela, {
      quantidade: alertBucket.length,
      link: base ? `${base}/app/cmdb` : undefined,
    });
    const override = await getEmailTemplateOverride(sb, "cmdb_device_alert");
    emails.push({
      subject: `${APP_NAME} · Device Alert — ${alertBucket.length} ativo(s) com monitoramento parcial`,
      html: applyEmailTemplate(
        "cmdb_device_alert",
        override,
        { quantidade: String(alertBucket.length), tabela },
        defaultHtml,
      ),
      template: "cmdb_device_alert",
    });
  }
  if (stoppedBucket.length > 0) {
    const tabela = htmlTable(stoppedBucket, "crit");
    const base = appUrlOrNull();
    const defaultHtml = buildCmdbDeviceStoppedHtml(tabela, {
      quantidade: stoppedBucket.length,
      link: base ? `${base}/app/cmdb` : undefined,
    });
    const override = await getEmailTemplateOverride(sb, "cmdb_device_stopped");
    emails.push({
      subject: `${APP_NAME} · Device Stopped — ${stoppedBucket.length} ativo(s) sem monitoramento`,
      html: applyEmailTemplate(
        "cmdb_device_stopped",
        override,
        { quantidade: String(stoppedBucket.length), tabela },
        defaultHtml,
      ),
      template: "cmdb_device_stopped",
    });
  }

  let notifiedRecipients = 0;
  for (const email of emails) {
    for (const to of recipients) {
      try {
        const out: any = await sendMail({
            host: cfg.host,
            port: cfg.port || 587,
            secure: !!cfg.secure,
            username: cfg.username || null,
            password,
            from: { name: cfg.from_name || APP_NAME, email: cfg.from_email },
            to,
            subject: email.subject,
            html: email.html,
          });
        await sb.from("email_logs").insert({
          to_email: to,
          subject: email.subject,
          template: email.template,
          status: out.ok ? "success" : "error",
          error_message: out.ok ? null : String(out.error ?? "falha no envio"),
        });
        if (out.ok) notifiedRecipients++;
      } catch (e: any) {
        await sb.from("email_logs").insert({
          to_email: to,
          subject: email.subject,
          template: email.template,
          status: "error",
          error_message: String(e?.message ?? e),
        });
      }
    }
  }

  return {
    alertCount: alertBucket.length,
    stoppedCount: stoppedBucket.length,
    notifiedRecipients,
  };
}

export const runCmdbDeviceAlertsNow = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: isAdmin }, { data: isModAdmin }] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" }),
      supabase.rpc("is_module_admin", { _user_id: userId, _module: "cmdb" }),
    ]);
    if (!isAdmin && !isModAdmin) {
      throw new Error("Acesso restrito: apenas administradores globais ou do módulo CMDB.");
    }
    const { recordCronRun } = await import("./cron-tracking.server");
    const started = Date.now();
    try {
      const result = await checkCmdbDevicesAndNotify();
      await recordCronRun("cmdb-device-alerts", "manual", { ok: true, durationMs: Date.now() - started });
      return result;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await recordCronRun("cmdb-device-alerts", "manual", {
        ok: false,
        error: msg,
        durationMs: Date.now() - started,
      });
      throw e;
    }
  });
