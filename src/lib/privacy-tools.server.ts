// Server-only Privacy Tools sync pipeline.
// Auth: OAuth2 Password Grant — credentials stored in integrations table (no hardcode).
//   - client_id     → integrations.config.client_id
//   - client_secret → integrations.api_key
//   - username      → integrations.config.username  (Chave Pública)
//   - password      → integrations.config.password  (Senha)
//
// Consentamentos: implementado via GET /external_api_v2/consent/find (paginação + agregação diária).
// Cookies / Uso: endpoints não disponíveis na API externa v2 da Privacy Tools.
//   Os blocos existem e passam sem erro; quando os endpoints estiverem disponíveis,
//   basta substituir a função stubSync() pela implementação real.

import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { readSecret } from "@/lib/crypto.server";

const PROVIDER = "privacy_tools";

// ── Types ────────────────────────────────────────────────────────────────────

type OAuthCreds = {
  baseUrl: string;
  clientId: string;
  clientSecret: string;
  username: string;
  password: string;
};

// ── Credentials ──────────────────────────────────────────────────────────────

async function getCredentials(): Promise<OAuthCreds | { ok: false; error: string }> {
  const { data, error } = await supabaseAdmin
    .from("integrations")
    .select("base_url, api_key, enabled, config")
    .eq("provider", PROVIDER)
    .maybeSingle();

  if (error) return { ok: false, error: error.message };
  if (!data || !data.enabled)
    return { ok: false, error: "Integração Privacy Tools não está ativa. Configure em Integrações." };

  const cfg = (data.config ?? {}) as Record<string, string>;
  const clientId = (cfg.client_id ?? "").trim();
  const clientSecret = ((readSecret(data.api_key) ?? "") as string).trim();
  const username = (cfg.username ?? "").trim();
  const password = (readSecret(cfg.password) ?? "").trim();
  const baseUrl = ((data.base_url ?? "") as string).replace(/\/+$/, "");

  if (!baseUrl) return { ok: false, error: "Base URL do Privacy Tools não configurada." };
  if (!clientId) return { ok: false, error: "Client ID do Privacy Tools não configurado." };
  if (!clientSecret) return { ok: false, error: "Segredo do cliente do Privacy Tools não configurado." };
  if (!username) return { ok: false, error: "Chave Pública (username) do Privacy Tools não configurada." };
  if (!password) return { ok: false, error: "Senha do Privacy Tools não configurada." };

  return { baseUrl, clientId, clientSecret, username, password };
}

// ── OAuth2 token ─────────────────────────────────────────────────────────────

async function getOAuthToken(creds: OAuthCreds): Promise<string> {
  const basicAuth = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20_000);

  let res: Response;
  try {
    res = await fetch(`${creds.baseUrl}/external_api_v2/oauth/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basicAuth}`,
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json",
      },
      body: new URLSearchParams({
        grant_type: "password",
        username: creds.username,
        password: creds.password,
      }).toString(),
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(timer);
    const cause = (e as any)?.cause;
    const detail = cause?.message ?? cause?.code ?? "";
    throw new Error(`fetch failed${detail ? ` — ${detail}` : ""}`);
  }
  clearTimeout(timer);

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
  }

  const json: any = await res.json();
  if (!json.access_token) throw new Error("Resposta OAuth sem access_token.");
  return json.access_token as string;
}

// ── HTTP helper ───────────────────────────────────────────────────────────────

async function ptFetch(baseUrl: string, token: string, path: string, extraHeaders?: Record<string, string>) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        ...extraHeaders,
      },
      signal: ctrl.signal,
    });
    clearTimeout(timer);
    const text = await res.text();
    let body: any;
    try {
      body = JSON.parse(text);
    } catch {
      body = { _raw: text.slice(0, 500) };
    }
    return { ok: res.ok, status: res.status, body, rawText: text.slice(0, 500) };
  } catch (e) {
    clearTimeout(timer);
    throw e;
  }
}

// ── Logging ───────────────────────────────────────────────────────────────────

async function logApi(status: "success" | "error", httpStatus: number | null, message: string, ms: number) {
  try {
    await supabaseAdmin.from("api_logs").insert({
      provider: PROVIDER,
      status,
      http_status: httpStatus,
      message: message.slice(0, 2000),
      duration_ms: ms,
    });
  } catch {
    /* non-blocking */
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function isoDate(d: Date) {
  return d.toISOString().split("T")[0];
}

// Privacy Tools expects dates as dd/MM/yyyy
function ptDate(d: Date) {
  const [y, m, day] = isoDate(d).split("-");
  return `${day}/${m}/${y}`;
}

function extractRecords(body: any): any[] {
  if (Array.isArray(body)) return body;
  if (Array.isArray(body?.items)) return body.items; // Privacy Tools v2
  if (Array.isArray(body?.content)) return body.content;
  if (Array.isArray(body?.data)) return body.data;
  return [];
}

function getTotalPages(body: any): number {
  return Number(body?.totalPages ?? body?.total_pages ?? 0);
}

function isGranted(status: any): boolean {
  if (typeof status === "boolean") return status === true;
  return ["GRANTED", "CONCEDIDO", "ACCEPTED", "ACTIVE", "ATIVO"].includes(String(status).toUpperCase());
}

function isRefused(status: any): boolean {
  if (typeof status === "boolean") return status === false;
  return ["REFUSED", "RECUSADO", "REJECTED", "REVOKED", "REVOGADO"].includes(String(status).toUpperCase());
}

// ── Consentamentos sync ───────────────────────────────────────────────────────
// Uses GET /external_api_v2/consent/find with pagination + client-side aggregation.
// The endpoint returns individual consent records; we group them by date.

type ParamStyle = "iso+page" | "pt+page" | "no-date";

async function detectParamStyle(
  baseUrl: string,
  token: string,
  startDate: string,
  endDate: string,
): Promise<{ style: ParamStyle; firstBody: any; rawBody: string }> {
  const startDt = new Date(startDate + "T00:00:00Z");
  const endDt = new Date(endDate + "T00:00:00Z");
  const ptStart = ptDate(startDt);
  const ptEnd = ptDate(endDt);

  // Full ISO-8601 datetimes (what Privacy Tools creationDate looks like)
  const startDtStr = `${startDate}T00:00:00.000+00:00`;
  const endDtStr = `${endDate}T23:59:59.999+00:00`;

  const candidates: Array<{ style: ParamStyle; path: string }> = [
    // 1 — Full ISO-8601 datetimes (matches creationDate format in responses)
    {
      style: "iso+page",
      path: `/external_api_v2/consent/find?startDate=${encodeURIComponent(startDtStr)}&endDate=${encodeURIComponent(endDtStr)}&page=0&size=500`,
    },
    // 2 — Plain ISO date strings
    {
      style: "iso+page",
      path: `/external_api_v2/consent/find?startDate=${startDate}&endDate=${endDate}&page=0&size=500`,
    },
    // 3 — dd/MM/yyyy dates
    {
      style: "pt+page",
      path: `/external_api_v2/consent/find?startDate=${ptStart}&endDate=${ptEnd}&page=0&size=500`,
    },
    // 4 — no date filter (client-side filtering by date)
    {
      style: "no-date",
      path: `/external_api_v2/consent/find?page=0&size=500`,
    },
  ];

  const errors: string[] = [];
  for (const c of candidates) {
    const res = await ptFetch(baseUrl, token, c.path);
    if (res.ok) {
      return { style: c.style, firstBody: res.body, rawBody: res.rawText };
    }
    errors.push(`${c.style}→${res.status}`);
  }

  throw new Error(`consent/find inacessível. Tentativas: ${errors.join(", ")}`);
}

async function syncConsentamentos(baseUrl: string, token: string, startDate: string, endDate: string): Promise<number> {
  // Track per-day-group: record counts + unique titular hash sets.
  // Único titular (person) pode ter N registros (um por propósito). A API retorna um registro
  // por consentimento individual; o Privacy Tools agrupa por titular no dashboard interno.
  // "Misto" = mesmo titular tem consentimentos concedidos E recusados no mesmo dia/grupo.
  type DailyEntry = {
    date: string;
    grupo: string;
    recConc: number; // raw record counts
    recRecus: number;
    recTotal: number;
    hashConc: Set<string>; // unique identityHash sets
    hashRecus: Set<string>;
    hashMisto: Set<string>;
  };
  const daily = new Map<string, DailyEntry>();

  const { style, firstBody } = await detectParamStyle(baseUrl, token, startDate, endDate);
  const totalPages = getTotalPages(firstBody);
  const firstItems = extractRecords(firstBody);

  // Log probe (non-blocking). Note: the API ignores the page param — all pages
  // return the same 50 most-recent records. Loop still runs to confirm totalElements.
  void logApi("success", 200, `probe [${style}] totalPages=${totalPages} firstItems=${firstItems.length}`, 0);

  function getRecordDate(r: any): string {
    const raw: string = r.authorizationDate ?? r.creationDate ?? r.date ?? r.consentDate ?? r.createdAt ?? "";
    return raw.length >= 10 ? raw.slice(0, 10) : "";
  }

  function processRecords(records: any[]): void {
    for (const r of records) {
      const date = getRecordDate(r);
      if (!date || date < startDate || date > endDate) continue;

      const grupo: string = r.group?.name ?? r.grupo ?? "";
      const key = `${date}||${grupo}`;
      // person.document is a hashed CPF — the true unique person identifier.
      // identityHash/person.hash represent the consent template, not the person.
      const personHash: string = r.person?.document ?? r.identityHash ?? r.person?.hash ?? "";
      const granted = isGranted(r.status);
      const refused = isRefused(r.status);

      let entry = daily.get(key);
      if (!entry) {
        entry = {
          date,
          grupo,
          recConc: 0,
          recRecus: 0,
          recTotal: 0,
          hashConc: new Set(),
          hashRecus: new Set(),
          hashMisto: new Set(),
        };
        daily.set(key, entry);
      }

      // Record-level counts
      if (granted) entry.recConc++;
      else if (refused) entry.recRecus++;
      entry.recTotal++;

      // Titular-level tracking: a titular is "misto" if they have both granted AND refused
      if (personHash) {
        if (granted) {
          if (entry.hashRecus.has(personHash)) {
            // Person previously had a refused record → now misto
            entry.hashRecus.delete(personHash);
            entry.hashMisto.add(personHash);
          } else if (!entry.hashMisto.has(personHash)) {
            entry.hashConc.add(personHash);
          }
        } else if (refused) {
          if (entry.hashConc.has(personHash)) {
            entry.hashConc.delete(personHash);
            entry.hashMisto.add(personHash);
          } else if (!entry.hashMisto.has(personHash)) {
            entry.hashRecus.add(personHash);
          }
        }
      }
    }
  }

  // The API ignores the `page` parameter — every request returns the same 50 most-recent
  // records regardless of the page number requested. We only process page 0 (firstItems).
  processRecords(firstItems);

  if (daily.size === 0) return 0;

  const rows = Array.from(daily.values()).map((c) => ({
    date: c.date,
    grupo: c.grupo,
    hipotese_tratamento: "",
    concedidos: c.recConc,
    recusados: c.recRecus,
    total: c.recTotal,
    titulares_concedidos: c.hashConc.size,
    titulares_recusados: c.hashRecus.size,
    titulares_mistos: c.hashMisto.size,
    titulares_total: c.hashConc.size + c.hashRecus.size + c.hashMisto.size,
    synced_at: new Date().toISOString(),
  }));

  // Accumulative upsert: the API only returns the 50 most-recent records and ignores the
  // page param, so we never delete history. Instead, fetch existing rows for the affected
  // dates and merge using GREATEST so prior data is never lost.
  const affectedDates = [...new Set(rows.map((r) => r.date))];
  const { data: existing } = await (supabaseAdmin as any)
    .from("privacy_consentimentos_daily")
    .select(
      "date,grupo,hipotese_tratamento,concedidos,recusados,total,titulares_concedidos,titulares_recusados,titulares_mistos,titulares_total",
    )
    .in("date", affectedDates);

  const existingMap = new Map<string, any>(
    ((existing ?? []) as any[]).map((r: any) => [`${r.date}||${r.grupo}||${r.hipotese_tratamento}`, r]),
  );

  const mergedRows = rows.map((row) => {
    const key = `${row.date}||${row.grupo}||${row.hipotese_tratamento}`;
    const ex = existingMap.get(key);
    if (!ex) return row;
    return {
      ...row,
      concedidos: Math.max(row.concedidos, ex.concedidos ?? 0),
      recusados: Math.max(row.recusados, ex.recusados ?? 0),
      total: Math.max(row.total, ex.total ?? 0),
      titulares_concedidos: Math.max(row.titulares_concedidos, ex.titulares_concedidos ?? 0),
      titulares_recusados: Math.max(row.titulares_recusados, ex.titulares_recusados ?? 0),
      titulares_mistos: Math.max(row.titulares_mistos, ex.titulares_mistos ?? 0),
      titulares_total: Math.max(row.titulares_total, ex.titulares_total ?? 0),
    };
  });

  const { error } = await (supabaseAdmin as any)
    .from("privacy_consentimentos_daily")
    .upsert(mergedRows, { onConflict: "date,grupo,hipotese_tratamento" });
  if (error) throw new Error(`Consent upsert: ${error.message}`);

  return mergedRows.length;
}

// ── Stub for endpoints not yet available in external API ──────────────────────
// Returns 0 so the overall sync succeeds; replace body when endpoints are known.

async function stubSync(_label: string): Promise<number> {
  return 0;
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function runPrivacyToolsSync(): Promise<{
  ok: boolean;
  processed?: number;
  details?: Record<string, number>;
  error?: string;
}> {
  const creds = await getCredentials();
  if ("error" in creds) return { ok: false, error: creds.error };

  const t0 = Date.now();

  let token: string;
  try {
    token = await getOAuthToken(creds);
  } catch (e) {
    const msg = (e as Error).message;
    await logApi("error", null, `OAuth: ${msg}`, Date.now() - t0);
    return { ok: false, error: `Falha ao obter token: ${msg}` };
  }

  const { baseUrl } = creds;

  const end = new Date();
  const start = new Date(end);
  start.setDate(start.getDate() - 365);
  const startDate = isoDate(start);
  const endDate = isoDate(end);

  try {
    // ── Consentamentos (implementado via /consent/find) ──────────────────────
    const consentRows = await syncConsentamentos(baseUrl, token, startDate, endDate);

    // ── Cookies incrementais (endpoint não disponível — stub) ────────────────
    const cookieRows = await stubSync("cookies");

    // ── Relatório de uso mensal (endpoint não disponível — stub) ─────────────
    const usoRows = await stubSync("uso");

    const processed = consentRows + cookieRows + usoRows;
    const durationMs = Date.now() - t0;

    await logApi(
      "success",
      200,
      `Sincronizado: ${consentRows} consentamentos, ${cookieRows} cookies, ${usoRows} uso`,
      durationMs,
    );

    return {
      ok: true,
      processed,
      details: { consentamentos: consentRows, cookies: cookieRows, uso: usoRows },
    };
  } catch (e) {
    const msg = (e as Error).message;
    await logApi("error", null, msg, Date.now() - t0);
    return { ok: false, error: msg };
  }
}
