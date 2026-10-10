// Server-only: módulo SAST -- sync dos eventos das esteiras CI/CD a partir do
// App Insights devops-clarity-hub-insights (workspace-based, dados no Log
// Analytics devops-clarity-hub-insights-law). NUNCA importar em código de cliente.
//
// Credenciais em `integrations` (provider='azure_app_insights'), mesmo
// esquema de purview_dlp: Service Principal do Entra ID com papel "Log
// Analytics Reader" só nesse workspace -- config.tenant_id/client_id/
// workspace_id, api_key = client secret. A Instrumentation Key NÃO serve aqui
// (é só de escrita/ingestão), e a "API Key" do menu API Access do App Insights
// está sendo descontinuada pela Microsoft -- por isso Entra ID.
import crypto from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isAlertModuleEnabled } from "@/lib/alert-modules.functions";
import { normalizeScanCompleted, normalizeSecretDetected } from "@/lib/sast-normalize";
import type { SastDetectionRow, SastScanRunRow } from "@/lib/sast-normalize";
import { APP_NAME } from "@/lib/brand";
import { appUrl } from "@/lib/app-url";
import { sendMail } from "@/lib/mailer.server";
import { emailStrong, renderEmail } from "@/lib/email-layout";
import { readSecret } from "@/lib/crypto.server";

const adminDb = supabaseAdmin as unknown as {
  from: (t: string) => any;
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: any; error: { message: string } | null }>;
};

export const SAST_PROVIDER = "azure_app_insights";
const CURSOR_SOURCE = "app-insights";

async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  timeoutMs = 30_000,
): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export type AppInsightsCreds = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  workspaceId: string;
};

export async function getAppInsightsCreds(): Promise<AppInsightsCreds | null> {
  const { data } = await adminDb
    .from("integrations")
    .select("api_key, config, enabled")
    .eq("provider", SAST_PROVIDER)
    .maybeSingle();
  const cfg = data?.config as {
    tenant_id?: string;
    client_id?: string;
    workspace_id?: string;
  } | null;
  if (!data?.enabled || !data.api_key || !cfg?.tenant_id || !cfg?.client_id || !cfg?.workspace_id)
    return null;
  return {
    tenantId: cfg.tenant_id,
    clientId: cfg.client_id,
    clientSecret: readSecret(data.api_key) as string,
    workspaceId: cfg.workspace_id,
  };
}

// client_credentials no endpoint v2 do Entra ID (scope, não resource -- é o
// que a Log Analytics Query API aceita; diferente do Purview, que exige v1).
async function getLogAnalyticsToken(creds: AppInsightsCreds): Promise<string> {
  const res = await fetchWithTimeout(
    `https://login.microsoftonline.com/${creds.tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "client_credentials",
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
        scope: "https://api.loganalytics.io/.default",
      }),
    },
  );
  const data = (await res.json().catch(() => ({}))) as {
    access_token?: string;
    error_description?: string;
  };
  if (!data.access_token)
    throw new Error(`Erro ao obter token Microsoft: ${data.error_description ?? res.status}`);
  return data.access_token;
}

type LaTable = { columns: Array<{ name: string }>; rows: unknown[][] };

async function runKql(
  creds: AppInsightsCreds,
  token: string,
  query: string,
): Promise<Record<string, unknown>[]> {
  const res = await fetchWithTimeout(
    `https://api.loganalytics.azure.com/v1/workspaces/${creds.workspaceId}/query`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    },
  );
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    // 403 aqui quase sempre = Service Principal sem "Log Analytics Reader" no workspace.
    throw new Error(`Log Analytics ${res.status}: ${txt.slice(0, 300)}`);
  }
  const body = (await res.json()) as { tables?: LaTable[] };
  const table = body.tables?.[0];
  if (!table) return [];
  return table.rows.map((row) => Object.fromEntries(table.columns.map((c, i) => [c.name, row[i]])));
}

// Colunas dynamic (Properties) às vezes voltam como string JSON, às vezes já
// como objeto, dependendo da versão da API -- aceita os dois.
function parseProps(v: unknown): Record<string, unknown> {
  if (v && typeof v === "object") return v as Record<string, unknown>;
  if (typeof v === "string") {
    try {
      const parsed = JSON.parse(v);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

// _ItemId é o itemId do evento no App Insights (único). Se por algum motivo
// vier vazio, cai num hash determinístico do conteúdo -- reler a mesma janela
// gera o mesmo id, então a idempotência do sync continua valendo.
function eventId(row: Record<string, unknown>): string {
  const itemId = typeof row.ItemId === "string" ? row.ItemId.trim() : "";
  if (itemId) return `ai:${itemId}`;
  const h = crypto
    .createHash("sha256")
    .update(
      `${row.TimeGenerated}|${row.Name}|${typeof row.Properties === "string" ? row.Properties : JSON.stringify(row.Properties)}`,
    )
    .digest("hex");
  return `ai-hash:${h}`;
}

async function getCursor(): Promise<Date | null> {
  const { data } = await adminDb
    .from("sast_ingest_cursor")
    .select("last_event_at")
    .eq("source", CURSOR_SOURCE)
    .maybeSingle();
  return data?.last_event_at ? new Date(data.last_event_at as string) : null;
}

async function setCursor(at: Date): Promise<void> {
  await adminDb
    .from("sast_ingest_cursor")
    .upsert({
      source: CURSOR_SOURCE,
      last_event_at: at.toISOString(),
      updated_at: new Date().toISOString(),
    });
}

const PAGE_SIZE = 5000;
const MAX_PAGES = 40; // teto de segurança por execução (200k eventos)
// Relê um pouco antes do cursor: eventos com o mesmo ingestion_time do último
// lido não se perdem; duplicata é barrada por source_event_id no banco.
const CURSOR_OVERLAP_MS = 5 * 60 * 1000;
// Não lê o que acabou de ficar consultável: o template manda os SecretDetected
// segundos antes do ScanCompleted da mesma build, e processar o ScanCompleted
// antes dos achados dele fecharia esses achados por engano.
const SETTLE_MS = 5 * 60 * 1000;
const DEFAULT_BACKFILL_DAYS = 90; // retenção padrão do workspace

export type SastSyncResult = {
  ok: boolean;
  error?: string;
  eventsRead: number;
  detectionsInserted: number;
  scanRunsRegistered: number;
  findingsAutoResolved: number;
  skipped: number;
};

export async function syncSastFromAppInsights(
  opts: { lookbackDays?: number } = {},
): Promise<SastSyncResult> {
  const result: SastSyncResult = {
    ok: false,
    eventsRead: 0,
    detectionsInserted: 0,
    scanRunsRegistered: 0,
    findingsAutoResolved: 0,
    skipped: 0,
  };
  const creds = await getAppInsightsCreds();
  if (!creds)
    return {
      ...result,
      error: "App Insights não configurado ou desativado (Integração API → card SAST → aba App Insights).",
    };

  try {
    const token = await getLogAnalyticsToken(creds);
    const upper = new Date(Date.now() - SETTLE_MS);
    const cursor = opts.lookbackDays ? null : await getCursor();
    let from = cursor
      ? new Date(cursor.getTime() - CURSOR_OVERLAP_MS)
      : new Date(Date.now() - (opts.lookbackDays ?? DEFAULT_BACKFILL_DAYS) * 24 * 60 * 60 * 1000);
    let maxIngested: Date | null = cursor;

    for (let page = 0; page < MAX_PAGES; page++) {
      const kql = `AppEvents
| where ingestion_time() >= datetime(${from.toISOString()}) and ingestion_time() < datetime(${upper.toISOString()})
| where Name in ("SecretDetected", "ScanCompleted")
| extend IngestedAt = ingestion_time(), ItemId = tostring(column_ifexists("_ItemId", ""))
| project IngestedAt, TimeGenerated, Name, Properties, ItemId
| order by IngestedAt asc
| take ${PAGE_SIZE}`;
      const rows = await runKql(creds, token, kql);
      result.eventsRead += rows.length;

      const detections: SastDetectionRow[] = [];
      const runs: SastScanRunRow[] = [];
      for (const row of rows) {
        const id = eventId(row);
        const ts = new Date(String(row.TimeGenerated)).toISOString();
        const props = parseProps(row.Properties);
        if (row.Name === "SecretDetected") {
          const d = normalizeSecretDetected(id, ts, props);
          if (d) detections.push(d);
          else result.skipped++;
        } else {
          const r = normalizeScanCompleted(id, ts, props);
          if (r) runs.push(r);
          else result.skipped++;
        }
        const ing = new Date(String(row.IngestedAt));
        if (!maxIngested || ing > maxIngested) maxIngested = ing;
      }

      // Achados sempre antes das execuções do mesmo lote (ver register_sast_scan_run).
      for (let i = 0; i < detections.length; i += 500) {
        const { data, error } = await adminDb.rpc("upsert_sast_detections", {
          p_rows: detections.slice(i, i + 500),
        });
        if (error) throw new Error(`upsert_sast_detections: ${error.message}`);
        result.detectionsInserted += Number(data ?? 0);
      }
      runs.sort((a, b) => a.scanned_at.localeCompare(b.scanned_at));
      for (const run of runs) {
        const { data, error } = await adminDb.rpc("register_sast_scan_run", { p_run: run });
        if (error) throw new Error(`register_sast_scan_run: ${error.message}`);
        result.scanRunsRegistered++;
        result.findingsAutoResolved += Number(data ?? 0);
      }

      // Cursor só avança depois do lote gravado -- se algo falhar no meio, a
      // próxima execução relê a partir do último ponto salvo.
      if (maxIngested) await setCursor(maxIngested);
      if (rows.length < PAGE_SIZE || !maxIngested) break;
      // Página cheia com todo mundo no mesmo ingestion_time não avançaria --
      // pula 1ms pra não entrar em loop (dedup cobre o resto).
      from = maxIngested.getTime() > from.getTime() ? maxIngested : new Date(from.getTime() + 1);
    }

    result.ok = true;
    return result;
  } catch (e) {
    return { ...result, ok: false, error: (e as Error).message };
  }
}

// ─── Alerta de triagem ────────────────────────────────────────────────────────
// Toda mudança de status manual (resolvido / falso positivo / risco aceito /
// reaberto) avisa o time: falso positivo e risco aceito tiram o achado do
// painel de abertos, então é mudança de estado sensível (mesma regra do DNS/
// Rules). Teams (config "Alertar via Teams") + e-mail pros admins globais.
// Best-effort: nunca derruba a triagem.

const STATUS_LABEL: Record<string, string> = {
  aberto: "Reaberto",
  resolvido: "Resolvido",
  falso_positivo: "Falso positivo",
  risco_aceito: "Risco aceito",
};

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

export async function notifySastTriage(args: {
  finding: {
    tool: string;
    project: string;
    repository: string;
    branch: string;
    rule_id: string;
    file_path: string | null;
    line: number | null;
  };
  previousStatus: string;
  newStatus: string;
  note: string | null;
  actorUserId: string;
}): Promise<void> {
  try {
    const alertEnabled = await isAlertModuleEnabled("sast_triage");
    if (!alertEnabled) return;

    const { data: profile } = await adminDb
      .from("profiles")
      .select("email, full_name")
      .eq("id", args.actorUserId)
      .maybeSingle();
    const actorName: string = profile?.full_name || profile?.email || "—";
    const f = args.finding;
    const location = f.file_path ? `${f.file_path}${f.line ? `:${f.line}` : ""}` : "—";
    const statusLabel = STATUS_LABEL[args.newStatus] ?? args.newStatus;
    const title = `Achado SAST: ${statusLabel}`;
    const link = `${appUrl()}/app/sast`;
    const facts = [
      { name: "Repositório", value: `${f.project} / ${f.repository} (${f.branch})` },
      { name: "Ferramenta / regra", value: `${f.tool} · ${f.rule_id}` },
      { name: "Arquivo", value: location },
      {
        name: "Status",
        value: `${STATUS_LABEL[args.previousStatus] ?? args.previousStatus} → ${statusLabel}`,
      },
      { name: "Justificativa", value: args.note || "—" },
      { name: "Alterado por", value: actorName },
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
          themeColor:
            args.newStatus === "risco_aceito" || args.newStatus === "falso_positivo"
              ? "D97706"
              : "3B82F6",
          summary: `${title}: ${f.repository}`,
          sections: [
            {
              activityTitle: `🛡️ ${APP_NAME} · ${title}`,
              activitySubtitle: new Date().toLocaleString("pt-BR", {
                timeZone: "America/Sao_Paulo",
              }),
              facts,
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

    const subject = `${APP_NAME} · ${title} em ${f.repository}`;
    const prevLabel = STATUS_LABEL[args.previousStatus] ?? args.previousStatus;
    const html = renderEmail({
      module: "SAST",
      tone: args.newStatus === "risco_aceito" || args.newStatus === "falso_positivo" ? "warn" : args.newStatus === "resolvido" ? "ok" : "info",
      status: statusLabel,
      title: `Achado em ${f.repository} marcado como ${statusLabel.toLowerCase()}`,
      intro: `${emailStrong(actorName)} mudou o status de um achado de ${f.tool}.${
        args.newStatus === "risco_aceito" || args.newStatus === "falso_positivo"
          ? " Achados com esse status saem da contagem de pendências."
          : ""
      }`,
      preheader: `${f.tool} ${f.rule_id} · ${location}`,
      blocks: [
        { kind: "diff", items: [{ label: "Status", before: prevLabel, after: statusLabel }] },
        {
          kind: "facts",
          items: [
            { label: "Repositório", value: `${f.project} / ${f.repository} (${f.branch})` },
            { label: "Regra", value: `${f.tool} · ${f.rule_id}`, mono: true },
            { label: "Arquivo", value: location, mono: true },
            { label: "Justificativa", value: args.note || "—" },
          ],
        },
      ],
      cta: { label: `Ver achado no ${APP_NAME}`, url: link },
      meta: `Alterado por ${emailStrong(actorName)}`,
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
          template: "sast_triage",
          status: out.ok ? "success" : "error",
          error_message: out.ok ? null : String(out.error ?? "falha no envio"),
        });
      } catch (e: any) {
        await adminDb.from("email_logs").insert({
          to_email: to,
          subject,
          template: "sast_triage",
          status: "error",
          error_message: String(e?.message ?? e),
        });
      }
    }
  } catch {
    // notificação não bloqueia a triagem
  }
}
