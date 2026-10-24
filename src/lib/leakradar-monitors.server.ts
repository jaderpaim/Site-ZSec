// Server-only: motor de monitoramento do CTI. A cada execução, cada monitor
// acha os vazamentos NOVOS (first_seen_at desde a última rodada) no seu escopo,
// aplica as condições (senha ainda válida no AD / sem MFA) e dispara alerta
// pelos canais cadastrados. NUNCA importar em código de cliente.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendMail } from "@/lib/mailer.server";
import { assertPublicHttpsUrl } from "@/lib/ssrf-guard.server";
import { appUrlOrNull } from "@/lib/app-url";
import { APP_NAME } from "@/lib/brand";

const adminDb = supabaseAdmin as unknown as { from: (t: string) => any };

type Monitor = {
  id: string;
  name: string;
  scope_category: "employees" | "customers" | "third_parties" | "all";
  host: string | null;
  keyword: string | null;
  cond_senha_valida: boolean;
  cond_sem_mfa: boolean;
  open_incident: boolean;
  channel_ids: string[];
  enabled: boolean;
  last_run_at: string | null;
};

type Leak = {
  id: string;
  username: string | null;
  url: string | null;
  url_host: string | null;
  category: string;
  added_at: string | null;
};

type Channel = {
  id: string;
  name: string;
  kind: "email" | "teams" | "google_chat" | "webhook";
  target: string;
  enabled: boolean;
};

const MAX_CANDIDATES = 1000;

async function fetchWithTimeout(url: string, init: RequestInit, ms = 12_000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    // redirect: "error" — assertPublicHttpsUrl só valida o host original; seguir
    // um redirect levaria o POST para um endereço não validado (ex.: rede interna).
    return await fetch(url, { ...init, redirect: "error", signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

function moduleLink(): string | null {
  const base = appUrlOrNull();
  return base ? `${base}/app/threat-intel` : null;
}

// Aplica as condições de AD (quando ligadas). Sem condição de AD, tudo passa.
async function applyConditions(leaks: Leak[], m: Monitor): Promise<Leak[]> {
  if (!m.cond_senha_valida && !m.cond_sem_mfa) return leaks;
  const emails = [
    ...new Set(leaks.map((l) => (l.username ?? "").toLowerCase()).filter((e) => e.includes("@"))),
  ];
  if (emails.length === 0) return [];
  const { data } = await adminDb
    .from("leakradar_ad_status")
    .select("email, account_enabled, last_password_change, mfa_registered")
    .in("email", emails);
  const ad = new Map(
    (
      (data ?? []) as Array<{
        email: string;
        account_enabled: boolean | null;
        last_password_change: string | null;
        mfa_registered: boolean | null;
      }>
    ).map((r) => [r.email, r]),
  );
  return leaks.filter((l) => {
    const a = ad.get((l.username ?? "").toLowerCase());
    if (!a) return false;
    if (m.cond_senha_valida) {
      const valida =
        a.account_enabled === true &&
        !!a.last_password_change &&
        !!l.added_at &&
        new Date(a.last_password_change) < new Date(l.added_at);
      if (!valida) return false;
    }
    if (m.cond_sem_mfa && a.mfa_registered === true) return false;
    return true;
  });
}

async function resolveChannels(ids: string[]): Promise<Channel[]> {
  const { data } = await adminDb
    .from("leakradar_incident_channels")
    .select("id, name, kind, target, enabled")
    .eq("enabled", true);
  const all = (data ?? []) as Channel[];
  return ids.length ? all.filter((c) => ids.includes(c.id)) : all;
}

// ── Alerta de monitoramento ─────────────────────────────────────────────────
function resumo(m: Monitor, leaks: Leak[]): Array<[string, string]> {
  const amostra = leaks
    .slice(0, 5)
    .map((l) => l.username ?? l.url_host ?? "—")
    .join(", ");
  return [
    ["Monitor", m.name],
    ["Novos vazamentos", String(leaks.length)],
    ["Amostra", amostra + (leaks.length > 5 ? ` +${leaks.length - 5}` : "")],
  ];
}

async function sendEmail(to: string, m: Monitor, leaks: Leak[]): Promise<void> {
  const { data: smtp } = await adminDb.from("smtp_config").select("*").limit(1).maybeSingle();
  if (!smtp?.host) throw new Error("SMTP não configurado.");
  const link = moduleLink();
  const linhas = resumo(m, leaks)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px">${k}</td><td style="padding:4px 0;font-size:13px;color:#111827">${v}</td></tr>`,
    )
    .join("");
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px">
    <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#b91c1c;margin:0 0 4px">${APP_NAME} · CTI · Monitoramento</p>
    <h2 style="margin:0 0 8px;font-size:18px;color:#111827">${leaks.length} novo(s) vazamento(s)</h2>
    <table style="border-collapse:collapse;margin:8px 0">${linhas}</table>
    ${link ? `<p style="margin:16px 0 0"><a href="${link}" style="background:#2563eb;color:#fff;text-decoration:none;padding:8px 16px;border-radius:6px;font-size:13px">Abrir no ${APP_NAME}</a></p>` : ""}
  </div>`;
  const out = await sendMail({
    host: smtp.host,
    port: smtp.port || 587,
    secure: !!smtp.secure,
    username: smtp.username || null,
    password: smtp.password || process.env.SMTP_PASSWORD,
    from: { name: smtp.from_name || APP_NAME, email: smtp.from_email },
    to,
    subject: `${APP_NAME} · CTI · ${leaks.length} novo(s) vazamento(s) — ${m.name}`,
    html,
  });
  if (!out.ok) throw new Error(out.error || "falha no envio");
}

function teamsBody(m: Monitor, leaks: Leak[]): unknown {
  const link = moduleLink();
  return {
    "@type": "MessageCard",
    "@context": "https://schema.org/extensions",
    themeColor: "D13438",
    summary: `CTI · ${leaks.length} novo(s) vazamento(s)`,
    title: `${APP_NAME} · CTI · Monitoramento`,
    sections: [
      {
        activityTitle: `${leaks.length} novo(s) vazamento(s) — ${m.name}`,
        facts: resumo(m, leaks).map(([name, value]) => ({ name, value })),
      },
    ],
    ...(link
      ? {
          potentialAction: [
            {
              "@type": "OpenUri",
              name: `Abrir no ${APP_NAME}`,
              targets: [{ os: "default", uri: link }],
            },
          ],
        }
      : {}),
  };
}
function googleChatBody(m: Monitor, leaks: Leak[]): unknown {
  const link = moduleLink();
  const txt =
    `*${APP_NAME} · CTI · Monitoramento*\n*${leaks.length} novo(s) vazamento(s) — ${m.name}*\n` +
    resumo(m, leaks)
      .map(([k, v]) => `*${k}:* ${v}`)
      .join("\n") +
    (link ? `\n<${link}|Abrir no ${APP_NAME}>` : "");
  return { text: txt };
}

async function postWebhook(ch: Channel, m: Monitor, leaks: Leak[]): Promise<void> {
  const url = await assertPublicHttpsUrl(ch.target);
  const h = url.hostname.toLowerCase();
  if (ch.kind === "teams" && !(h.endsWith("webhook.office.com") || h.endsWith("office.com"))) {
    throw new Error("URL de Teams inválida.");
  }
  if (ch.kind === "google_chat" && h !== "chat.googleapis.com")
    throw new Error("URL de Google Chat inválida.");
  const body =
    ch.kind === "teams"
      ? teamsBody(m, leaks)
      : ch.kind === "google_chat"
        ? googleChatBody(m, leaks)
        : {
            source: APP_NAME,
            module: "threat-intel",
            kind: "monitor_alert",
            monitor: m.name,
            found: leaks.length,
            accounts: leaks.slice(0, 50).map((l) => l.username),
            link: moduleLink(),
          };
  const res = await fetchWithTimeout(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}

async function alertar(m: Monitor, leaks: Leak[]): Promise<void> {
  const channels = await resolveChannels(m.channel_ids);
  for (const ch of channels) {
    try {
      if (ch.kind === "email") await sendEmail(ch.target, m, leaks);
      else await postWebhook(ch, m, leaks);
    } catch {
      /* melhor esforço por canal */
    }
  }
}

// Incidente agrupado (opcional) quando o monitor encontra algo.
async function abrirIncidente(m: Monitor, leaks: Leak[]): Promise<void> {
  const sev = m.cond_senha_valida ? "critica" : "alta";
  const { data: inc } = await adminDb
    .from("leakradar_incidents")
    .insert({
      leak_id: null,
      title: `${leaks.length} credencial(is) detectada(s) — ${m.name}`,
      account: null,
      category: m.scope_category === "all" ? null : m.scope_category,
      severity: sev,
      description:
        `Monitor "${m.name}" encontrou ${leaks.length} vazamento(s) novo(s).\n` +
        leaks
          .slice(0, 20)
          .map((l) => `• ${l.username ?? l.url_host ?? "—"}`)
          .join("\n"),
    })
    .select("id, ref_code, title, account, category, severity, description")
    .single();
  if (!inc) return;
  const { dispatchIncident } = await import("./leakradar-incidents.server");
  const results = await dispatchIncident({
    id: inc.id as string,
    refCode: inc.ref_code as string,
    title: inc.title as string,
    account: inc.account as string | null,
    category: inc.category as string | null,
    severity: inc.severity as "baixa" | "media" | "alta" | "critica",
    description: inc.description as string | null,
  });
  await adminDb
    .from("leakradar_incidents")
    .update({ notified_at: new Date().toISOString(), last_notify: results })
    .eq("id", inc.id);
}

export async function runMonitors(): Promise<{
  ok: boolean;
  monitores: number;
  novos: number;
  error?: string;
}> {
  try {
    const { data } = await adminDb
      .from("leakradar_monitors")
      .select(
        "id, name, scope_category, host, keyword, cond_senha_valida, cond_sem_mfa, open_incident, channel_ids, enabled, last_run_at",
      )
      .eq("enabled", true);
    const monitors = (data ?? []) as Monitor[];
    const now = new Date().toISOString();
    let novosTotal = 0;

    for (const m of monitors) {
      const cutoff = m.last_run_at ?? new Date(Date.now() - 7 * 86400_000).toISOString();
      let q = adminDb
        .from("leakradar_leaks")
        .select("id, username, url, url_host, category, added_at")
        .gt("first_seen_at", cutoff)
        .order("first_seen_at", { ascending: false })
        .limit(MAX_CANDIDATES);
      if (m.scope_category !== "all") q = q.eq("category", m.scope_category);
      if (m.host) q = q.ilike("url_host", `%${m.host}%`);
      if (m.keyword) q = q.or(`username.ilike.%${m.keyword}%,url.ilike.%${m.keyword}%`);

      const { data: cand, error } = await q;
      let found = 0;
      let status = "ok";
      let detail: string | null = null;
      try {
        if (error) throw new Error(error.message);
        const leaks = (cand ?? []) as Leak[];
        const matched = await applyConditions(leaks, m);
        found = matched.length;
        if (matched.length > 0) {
          await alertar(m, matched);
          if (m.open_incident) await abrirIncidente(m, matched);
        }
      } catch (e) {
        status = "erro";
        detail = (e as Error).message;
      }

      await adminDb.from("leakradar_monitor_runs").insert({
        monitor_id: m.id,
        ran_at: now,
        checked: (cand ?? []).length,
        found,
        status,
        detail,
      });
      await adminDb.from("leakradar_monitors").update({ last_run_at: now }).eq("id", m.id);
      novosTotal += found;
    }

    return { ok: true, monitores: monitors.length, novos: novosTotal };
  } catch (e) {
    return { ok: false, monitores: 0, novos: 0, error: (e as Error).message };
  }
}
