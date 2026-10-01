// Server-only: integração DLP (Microsoft Purview) via Office 365 Management
// Activity API. NUNCA importar este arquivo em código de cliente.
//
// Credenciais na tabela `integrations` (provider='purview_dlp'), texto plano +
// RLS -- mesmo nível de risco que Cloudflare/Sophos (token de app registration
// escopado, não é uma identidade de domínio real como shadowit_smb/dast_ad_ldap),
// então não usa crypto.server.ts.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const adminDb = supabaseAdmin as unknown as { from: (t: string) => any };

// Todo fetch pra Microsoft passa por aqui -- sem timeout, uma chamada lenta/
// travada do lado deles prende a sincronização inteira (não tinha proteção
// nenhuma antes, achado durante teste manual com lookback de 7 dias).
async function fetchMs(url: string, init: RequestInit = {}, timeoutMs = 20_000): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

export type PurviewDlpCreds = { tenantId: string; clientId: string; clientSecret: string };

export async function getPurviewDlpCreds(): Promise<PurviewDlpCreds | null> {
  const { data } = await adminDb
    .from("integrations")
    .select("api_key, config, enabled")
    .eq("provider", "purview_dlp")
    .maybeSingle();
  const cfg = data?.config as { tenant_id?: string; client_id?: string } | null;
  if (!data?.enabled || !data.api_key || !cfg?.tenant_id || !cfg?.client_id) return null;
  return { tenantId: cfg.tenant_id, clientId: cfg.client_id, clientSecret: data.api_key as string };
}

// OAuth2 client_credentials contra o Microsoft Entra ID (endpoint v1 -- é o
// exigido pela Office 365 Management API via `resource`, não `scope` como o
// endpoint v2). Mesmo fluxo do guia, seção 8.
async function getDlpAccessToken(creds: PurviewDlpCreds): Promise<string> {
  const tokenUrl = `https://login.microsoftonline.com/${creds.tenantId}/oauth2/token`;
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: creds.clientId,
    client_secret: creds.clientSecret,
    resource: "https://manage.office.com",
  });
  const res = await fetchMs(tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; error_description?: string };
  if (!data.access_token) {
    throw new Error(`Erro ao obter token Microsoft: ${data.error_description ?? res.status}`);
  }
  return data.access_token;
}

// Cria a subscription DLP.All uma única vez -- reconsulta a lista antes de
// criar pra não duplicar (o guia, seção 9, exige isso; o pseudo-código da
// seção 8 pulava essa checagem).
async function ensureDlpSubscription(tenantId: string, accessToken: string): Promise<void> {
  const base = `https://manage.office.com/api/v1.0/${tenantId}/activity/feed/subscriptions`;
  const listRes = await fetchMs(`${base}/list`, { headers: { Authorization: `Bearer ${accessToken}` } });
  const list = (await listRes.json().catch(() => [])) as Array<{ contentType?: string; status?: string }>;
  const active = Array.isArray(list) && list.some((s) => s.contentType === "DLP.All" && s.status === "enabled");
  if (active) return;

  const startRes = await fetchMs(`${base}/start?contentType=DLP.All`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!startRes.ok) {
    const txt = await startRes.text().catch(() => "");
    throw new Error(`Falha ao criar subscription DLP.All: ${startRes.status} ${txt.slice(0, 200)}`);
  }
}

type RawDlpEvent = {
  Id: string;
  CreationTime?: string;
  Operation?: string;
  Workload?: string;
  UserId?: string;
  ClientIP?: string;
  PolicyDetails?: Array<{
    PolicyName?: string;
    Rules?: Array<{ RuleName?: string }>;
  }>;
  SensitiveInfoDetectionIsIncluded?: boolean;
  AffectedFiles?: Array<{ FileName?: string; FileUrl?: string }>;
  [key: string]: unknown;
};

// Melhor esforço: nem todo evento DLP.All tem PolicyDetails/AffectedFiles no
// mesmo formato (varia por workload -- Exchange, SharePoint, Teams, Endpoint).
// `raw_event` sempre guarda o payload completo, então nada se perde aqui --
// isso só alimenta as colunas de busca/listagem rápida da UI.
function normalizeDlpEvent(event: RawDlpEvent): Record<string, unknown> {
  const policy = event.PolicyDetails?.[0];
  const file = event.AffectedFiles?.[0];
  return {
    microsoft_event_id: event.Id,
    creation_time: event.CreationTime ?? null,
    operation: event.Operation ?? null,
    workload: event.Workload ?? null,
    user_id: event.UserId ?? null,
    client_ip: event.ClientIP ?? null,
    policy_name: policy?.PolicyName ?? null,
    rule_name: policy?.Rules?.[0]?.RuleName ?? null,
    sensitive_info: event.SensitiveInfoDetectionIsIncluded ? (event as Record<string, unknown>) : null,
    file_name: file?.FileName ?? null,
    file_url: file?.FileUrl ?? null,
    raw_event: event,
  };
}

const MAX_WINDOW_MS = 24 * 60 * 60 * 1000; // limite da Management Activity API

async function getSyncCheckpoint(): Promise<Date> {
  const { data } = await adminDb.from("dlp_sync_state").select("last_collection").eq("id", "purview_dlp").maybeSingle();
  if (data?.last_collection) return new Date(data.last_collection as string);
  return new Date(Date.now() - 10 * 60 * 1000); // primeira execução: últimos 10min, igual ao guia
}

async function setSyncCheckpoint(endTime: Date): Promise<void> {
  await adminDb
    .from("dlp_sync_state")
    .upsert({ id: "purview_dlp", last_collection: endTime.toISOString(), updated_at: new Date().toISOString() });
}

// `lookbackHours`: só pra reprocesso manual/diagnóstico (ex.: audit log da
// Microsoft demorou a disponibilizar um evento e o checkpoint normal já
// avançou pra frente dele). O cron nunca passa esse parâmetro -- continua
// usando o checkpoint salvo. A API só aceita janelas de até 24h por chamada,
// então um lookback maior é percorrido em fatias de 24h.
export async function syncDlpEvents(
  opts: { lookbackHours?: number } = {},
): Promise<{ ok: boolean; eventsProcessed: number; error?: string }> {
  const creds = await getPurviewDlpCreds();
  if (!creds) return { ok: false, eventsProcessed: 0, error: "Integração Purview DLP não configurada ou desabilitada." };

  try {
    const accessToken = await getDlpAccessToken(creds);
    await ensureDlpSubscription(creds.tenantId, accessToken);

    const endTime = new Date();
    let windowStart = opts.lookbackHours
      ? new Date(endTime.getTime() - opts.lookbackHours * 60 * 60 * 1000)
      : await getSyncCheckpoint();
    if (endTime.getTime() - windowStart.getTime() > 7 * 24 * 60 * 60 * 1000) {
      windowStart = new Date(endTime.getTime() - 7 * 24 * 60 * 60 * 1000); // limite histórico da API
    }

    const rows: Record<string, unknown>[] = [];
    let chunkStart = windowStart;
    while (chunkStart < endTime) {
      const chunkEnd = new Date(Math.min(chunkStart.getTime() + MAX_WINDOW_MS, endTime.getTime()));
      let pageUrl: string | null =
        `https://manage.office.com/api/v1.0/${creds.tenantId}/activity/feed/subscriptions/content` +
        `?contentType=DLP.All&startTime=${chunkStart.toISOString()}&endTime=${chunkEnd.toISOString()}`;

      // A lista de blobs pode vir paginada (header NextPageUri) quando a
      // janela tem muita atividade -- sem seguir isso, perdíamos em silêncio
      // tudo que não coubesse na primeira página.
      while (pageUrl) {
        const contentRes: Response = await fetchMs(pageUrl, { headers: { Authorization: `Bearer ${accessToken}` } });
        const contents = (await contentRes.json().catch(() => [])) as Array<{ contentUri?: string }>;

        for (const content of Array.isArray(contents) ? contents : []) {
          if (!content.contentUri) continue;
          const evRes = await fetchMs(content.contentUri, { headers: { Authorization: `Bearer ${accessToken}` } }, 30_000);
          const events = (await evRes.json().catch(() => [])) as RawDlpEvent[];
          for (const event of Array.isArray(events) ? events : []) {
            if (!event?.Id) continue;
            rows.push(normalizeDlpEvent(event));
          }
        }
        pageUrl = contentRes.headers.get("NextPageUri");
      }
      chunkStart = chunkEnd;
    }

    // O mesmo evento pode vir em mais de um content blob (comportamento
    // conhecido da Management Activity API) -- sem deduplicar, um lote com o
    // mesmo microsoft_event_id duas vezes quebra o upsert (Postgres não
    // aceita ON CONFLICT DO UPDATE afetar a mesma linha 2x na mesma instrução).
    const dedupedRows = [...new Map(rows.map((r) => [r.microsoft_event_id as string, r])).values()];

    let eventsProcessed = 0;
    for (let i = 0; i < dedupedRows.length; i += 500) {
      const batch = dedupedRows.slice(i, i + 500);
      const { error } = await adminDb.from("dlp_events").upsert(batch, { onConflict: "microsoft_event_id" });
      if (error) throw new Error(error.message);
      eventsProcessed += batch.length;
    }

    await setSyncCheckpoint(endTime);
    return { ok: true, eventsProcessed };
  } catch (e) {
    return { ok: false, eventsProcessed: 0, error: (e as Error).message };
  }
}
