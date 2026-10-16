// Server-only: disparo de alertas de incidente do Threat Intelligence por
// e-mail e webhook (Teams, Google Chat, genérico/ITSM). NUNCA importar em
// código de cliente.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { sendMail } from "@/lib/mailer.server";
import { assertPublicHttpsUrl } from "@/lib/ssrf-guard.server";
import { appUrlOrNull } from "@/lib/app-url";
import { APP_NAME } from "@/lib/brand";

const adminDb = supabaseAdmin as unknown as { from: (t: string) => any };

export type IncidentSeverity = "baixa" | "media" | "alta" | "critica";
const SEV_RANK: Record<IncidentSeverity, number> = { baixa: 1, media: 2, alta: 3, critica: 4 };
const SEV_LABEL: Record<IncidentSeverity, string> = {
  baixa: "Baixa",
  media: "Média",
  alta: "Alta",
  critica: "Crítica",
};

export type IncidentForDispatch = {
  id: string;
  refCode: string;
  title: string;
  account: string | null;
  category: string | null;
  severity: IncidentSeverity;
  description: string | null;
};

type Channel = {
  id: string;
  name: string;
  kind: "email" | "teams" | "google_chat" | "webhook";
  target: string;
  min_severity: IncidentSeverity;
  enabled: boolean;
};

const CATEGORIA_LABEL: Record<string, string> = {
  employees: "Colaboradores",
  customers: "Clientes",
  third_parties: "Terceiros",
};

function incidentLink(id: string): string | null {
  const base = appUrlOrNull();
  return base ? `${base}/app/threat-intel?incidente=${id}` : null;
}

function resumoLinhas(inc: IncidentForDispatch): Array<[string, string]> {
  return [
    ["Código", inc.refCode],
    ["Severidade", SEV_LABEL[inc.severity]],
    ["Conta", inc.account ?? "—"],
    ["Categoria", inc.category ? (CATEGORIA_LABEL[inc.category] ?? inc.category) : "—"],
  ];
}

async function fetchWithTimeout(url: string, init: RequestInit, ms = 12_000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ── E-mail ──────────────────────────────────────────────────────────────────
async function sendIncidentEmail(to: string, inc: IncidentForDispatch): Promise<void> {
  const { data: smtp } = await adminDb.from("smtp_config").select("*").limit(1).maybeSingle();
  if (!smtp?.host) throw new Error("SMTP não configurado (Configurações → SMTP).");
  const password = smtp.password || process.env.SMTP_PASSWORD;
  const link = incidentLink(inc.id);
  const linhas = resumoLinhas(inc)
    .map(
      ([k, v]) =>
        `<tr><td style="padding:4px 12px 4px 0;color:#6b7280;font-size:13px">${k}</td><td style="padding:4px 0;font-size:13px;color:#111827">${v}</td></tr>`,
    )
    .join("");
  const html = `<div style="font-family:Segoe UI,Arial,sans-serif;max-width:560px">
    <p style="font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:#b91c1c;margin:0 0 4px">${APP_NAME} · Threat Intelligence</p>
    <h2 style="margin:0 0 8px;font-size:18px;color:#111827">Novo incidente: ${inc.title}</h2>
    ${inc.description ? `<p style="font-size:13px;color:#374151;margin:0 0 12px">${inc.description}</p>` : ""}
    <table style="border-collapse:collapse;margin:8px 0">${linhas}</table>
    ${link ? `<p style="margin:16px 0 0"><a href="${link}" style="background:#2563eb;color:#fff;text-decoration:none;padding:8px 16px;border-radius:6px;font-size:13px">Abrir no ${APP_NAME}</a></p>` : ""}
  </div>`;
  const out = await sendMail({
    host: smtp.host,
    port: smtp.port || 587,
    secure: !!smtp.secure,
    username: smtp.username || null,
    password,
    from: { name: smtp.from_name || APP_NAME, email: smtp.from_email },
    to,
    subject: `[${inc.refCode}] ${APP_NAME} · Incidente ${SEV_LABEL[inc.severity]}: ${inc.title}`,
    html,
  });
  try {
    await adminDb.from("email_logs").insert({
      to_email: to,
      subject: `Incidente: ${inc.title}`,
      template: "threat_intel_incident",
      status: out.ok ? "success" : "error",
      error_message: out.ok ? null : String(out.error ?? "falha no envio"),
    });
  } catch {
    /* log é melhor esforço */
  }
  if (!out.ok) throw new Error(out.error || "falha no envio do e-mail");
}

// ── Webhooks ────────────────────────────────────────────────────────────────
function assertHostAllowed(url: URL, kind: Channel["kind"]): void {
  const h = url.hostname.toLowerCase();
  if (kind === "teams" && !(h.endsWith("webhook.office.com") || h.endsWith("office.com"))) {
    throw new Error("URL de Teams deve ser um Incoming Webhook (…webhook.office.com).");
  }
  if (kind === "google_chat" && h !== "chat.googleapis.com") {
    throw new Error("URL de Google Chat deve ser chat.googleapis.com.");
  }
}

function teamsPayload(inc: IncidentForDispatch): unknown {
  const link = incidentLink(inc.id);
  return {
    "@type": "MessageCard",
    "@context": "https://schema.org/extensions",
    themeColor: inc.severity === "critica" ? "D13438" : "E06C00",
    summary: `Incidente: ${inc.title}`,
    title: `${APP_NAME} · Incidente ${SEV_LABEL[inc.severity]}`,
    sections: [
      {
        activityTitle: inc.title,
        text: inc.description ?? "",
        facts: resumoLinhas(inc).map(([name, value]) => ({ name, value })),
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

function googleChatPayload(inc: IncidentForDispatch): unknown {
  const link = incidentLink(inc.id);
  const linhas = resumoLinhas(inc)
    .map(([k, v]) => `*${k}:* ${v}`)
    .join("\n");
  const txt =
    `*${APP_NAME} · Incidente ${SEV_LABEL[inc.severity]}*\n*${inc.title}*\n` +
    (inc.description ? `${inc.description}\n` : "") +
    linhas +
    (link ? `\n<${link}|Abrir no ${APP_NAME}>` : "");
  return { text: txt };
}

async function postWebhook(ch: Channel, inc: IncidentForDispatch): Promise<void> {
  const url = await assertPublicHttpsUrl(ch.target);
  assertHostAllowed(url, ch.kind);
  const body =
    ch.kind === "teams"
      ? teamsPayload(inc)
      : ch.kind === "google_chat"
        ? googleChatPayload(inc)
        : {
            source: APP_NAME,
            module: "threat-intel",
            // `ref` no topo para o ITSM capturar o código facilmente
            ref: inc.refCode,
            incident: inc,
            link: incidentLink(inc.id),
          };
  const res = await fetchWithTimeout(url.toString(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`HTTP ${res.status}${t ? `: ${t.slice(0, 120)}` : ""}`);
  }
}

export type DispatchResult = { channel: string; kind: string; ok: boolean; error?: string };

// Dispara para todos os canais habilitados cujo min_severity cabe na severidade
// do incidente. Melhor esforço: a falha de um canal não impede os outros.
export async function dispatchIncident(inc: IncidentForDispatch): Promise<DispatchResult[]> {
  const { data } = await adminDb
    .from("leakradar_incident_channels")
    .select("id, name, kind, target, min_severity, enabled")
    .eq("enabled", true);
  const channels = ((data ?? []) as Channel[]).filter(
    (c) => SEV_RANK[inc.severity] >= SEV_RANK[c.min_severity],
  );
  const results: DispatchResult[] = [];
  for (const ch of channels) {
    try {
      if (ch.kind === "email") await sendIncidentEmail(ch.target, inc);
      else await postWebhook(ch, inc);
      results.push({ channel: ch.name, kind: ch.kind, ok: true });
    } catch (e) {
      results.push({ channel: ch.name, kind: ch.kind, ok: false, error: (e as Error).message });
    }
  }
  return results;
}

// Teste de um canal (mensagem fictícia). Reaproveita o mesmo caminho de envio.
export async function testIncidentChannel(ch: Channel): Promise<void> {
  const fake: IncidentForDispatch = {
    id: "teste",
    refCode: "INC-TESTE",
    title: "Teste de canal de incidente",
    account: "teste@exemplo.com",
    category: "employees",
    severity: "alta",
    description: "Mensagem de teste disparada pelo Threat Intelligence.",
  };
  if (ch.kind === "email") await sendIncidentEmail(ch.target, fake);
  else await postWebhook(ch, fake);
}
