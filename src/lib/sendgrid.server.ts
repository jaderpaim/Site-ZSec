// Server-only SendGrid read API client. Reads credentials from `integrations` table.
// Somente leitura (estatísticas, conta, logs de atividade) — o envio de e-mails é
// feito exclusivamente pelo módulo SMTP, nunca por aqui.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type SendGridCredentials = { baseUrl: string; apiKey: string };

async function logSendGridApi(status: "success" | "error", httpStatus: number | null, message: string, ms: number) {
  try {
    await supabaseAdmin.from("api_logs").insert({
      provider: "sendgrid",
      status,
      http_status: httpStatus,
      message: message.slice(0, 500),
      duration_ms: ms,
    });
  } catch {
    /* ignore */
  }
}

export async function getSendGridCredentials(): Promise<SendGridCredentials | { ok: false; error: string }> {
  const { data, error } = await supabaseAdmin
    .from("integrations")
    .select("api_key, enabled, base_url")
    .eq("provider", "sendgrid")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data || !data.enabled) return { ok: false, error: "Integração SendGrid não está ativa." };
  if (!data.api_key) return { ok: false, error: "API Key do SendGrid não configurada." };
  return { baseUrl: (data.base_url || "https://api.sendgrid.com/v3").replace(/\/+$/, ""), apiKey: data.api_key.trim() };
}

type SgFetchResult<T> = { ok: true; status: number; json: T } | { ok: false; status: number; error: string };

// SendGrid autentica todas as chamadas via "Authorization: Bearer <API Key>".
async function sendGridFetch<T = unknown>(creds: SendGridCredentials, path: string): Promise<SgFetchResult<T>> {
  const t0 = Date.now();
  try {
    const res = await fetch(`${creds.baseUrl}${path}`, {
      headers: { Authorization: `Bearer ${creds.apiKey}`, "Content-Type": "application/json" },
    });
    const text = await res.text();
    const json = text ? JSON.parse(text) : {};
    if (!res.ok) {
      const msg = json?.errors?.map((e: any) => e.message).join("; ") || `HTTP ${res.status}`;
      await logSendGridApi("error", res.status, `${path} — ${msg}`, Date.now() - t0);
      return { ok: false, status: res.status, error: msg };
    }
    await logSendGridApi("success", res.status, path, Date.now() - t0);
    return { ok: true, status: res.status, json: json as T };
  } catch (e) {
    const msg = (e as Error).message;
    await logSendGridApi("error", null, `${path} — ${msg}`, Date.now() - t0);
    return { ok: false, status: 0, error: msg };
  }
}

// ─── Estatísticas — GET /stats (global email stats, agregadas por dia/semana/mês) ──
export type SendGridStatMetrics = {
  blocks: number;
  bounceDrops: number;
  bounces: number;
  clicks: number;
  deferred: number;
  delivered: number;
  invalidEmails: number;
  opens: number;
  processed: number;
  requests: number;
  spamReportDrops: number;
  spamReports: number;
  uniqueClicks: number;
  uniqueOpens: number;
  unsubscribeDrops: number;
  unsubscribes: number;
};

export type SendGridStatsResult =
  | { ok: true; days: Array<{ date: string; metrics: SendGridStatMetrics }> }
  | { ok: false; error: string };

export async function getSendGridStats(opts: {
  startDate: string;
  endDate?: string;
  aggregatedBy?: "day" | "week" | "month";
}): Promise<SendGridStatsResult> {
  const creds = await getSendGridCredentials();
  if ("ok" in creds && creds.ok === false) return creds;

  const params = new URLSearchParams({ start_date: opts.startDate, aggregated_by: opts.aggregatedBy ?? "day" });
  if (opts.endDate) params.set("end_date", opts.endDate);

  const r = await sendGridFetch<Array<{ date: string; stats: Array<{ metrics: Record<string, number> }> }>>(
    creds as SendGridCredentials,
    `/stats?${params.toString()}`,
  );
  if (!r.ok) return { ok: false, error: r.error };

  const days = r.json.map((d) => {
    const m = d.stats?.[0]?.metrics ?? {};
    return {
      date: d.date,
      metrics: {
        blocks: m.blocks ?? 0,
        bounceDrops: m.bounce_drops ?? 0,
        bounces: m.bounces ?? 0,
        clicks: m.clicks ?? 0,
        deferred: m.deferred ?? 0,
        delivered: m.delivered ?? 0,
        invalidEmails: m.invalid_emails ?? 0,
        opens: m.opens ?? 0,
        processed: m.processed ?? 0,
        requests: m.requests ?? 0,
        spamReportDrops: m.spam_report_drops ?? 0,
        spamReports: m.spam_reports ?? 0,
        uniqueClicks: m.unique_clicks ?? 0,
        uniqueOpens: m.unique_opens ?? 0,
        unsubscribeDrops: m.unsubscribe_drops ?? 0,
        unsubscribes: m.unsubscribes ?? 0,
      },
    };
  });
  return { ok: true, days };
}

// ─── Configurações da conta — GET /user/account + /scopes ──────────────────────
export type SendGridAccountResult =
  | { ok: true; accountType: string; reputation: number; scopes: string[] }
  | { ok: false; error: string };

export async function getSendGridAccountInfo(): Promise<SendGridAccountResult> {
  const creds = await getSendGridCredentials();
  if ("ok" in creds && creds.ok === false) return creds;
  const c = creds as SendGridCredentials;

  const [accountRes, scopesRes] = await Promise.all([
    sendGridFetch<{ type: string; reputation: number }>(c, "/user/account"),
    sendGridFetch<{ scopes: string[] }>(c, "/scopes"),
  ]);
  if (!accountRes.ok) return { ok: false, error: accountRes.error };

  return {
    ok: true,
    accountType: accountRes.json.type,
    reputation: accountRes.json.reputation,
    scopes: scopesRes.ok ? scopesRes.json.scopes ?? [] : [],
  };
}

// ─── Logs de atividade — GET /messages (Email Activity API) ────────────────────
// Disponibilidade depende do plano SendGrid; planos sem o recurso retornam 403.
export type SendGridActivityMessage = {
  msgId: string;
  subject: string;
  toEmail: string;
  fromEmail: string;
  status: string;
  opensCount: number;
  clicksCount: number;
  lastEventTime: string | null;
};

export type SendGridActivityResult =
  | { ok: true; messages: SendGridActivityMessage[] }
  | { ok: false; error: string };

export async function getSendGridActivity(opts?: { query?: string; limit?: number }): Promise<SendGridActivityResult> {
  const creds = await getSendGridCredentials();
  if ("ok" in creds && creds.ok === false) return creds;
  const c = creds as SendGridCredentials;

  const params = new URLSearchParams({ limit: String(opts?.limit ?? 50) });
  if (opts?.query) params.set("query", opts.query);

  const r = await sendGridFetch<{ messages: Array<Record<string, any>> }>(c, `/messages?${params.toString()}`);
  if (!r.ok) {
    const error = r.status === 403 ? "Email Activity API não disponível no plano atual do SendGrid." : r.error;
    return { ok: false, error };
  }

  const messages = (r.json.messages ?? []).map((m) => ({
    msgId: String(m.msg_id ?? ""),
    subject: String(m.subject ?? ""),
    toEmail: String(m.to_email ?? ""),
    fromEmail: String(m.from_email ?? ""),
    status: String(m.status ?? ""),
    opensCount: Number(m.opens_count ?? 0),
    clicksCount: Number(m.clicks_count ?? 0),
    lastEventTime: m.last_event_time ?? null,
  }));
  return { ok: true, messages };
}
