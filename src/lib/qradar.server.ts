// Server-only QRadar SIEM pipeline. Reused by both the user-triggered server fn
// and the public cron endpoint. NEVER import this from client code.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { syncIndisponibilidadesCore } from "@/lib/disponibilidade.functions";
import { readSecret } from "@/lib/crypto.server";

export type QradarCredentials = {
  baseUrl: string;
  secToken: string;
};

export type QradarSyncResult = {
  ok: boolean;
  counts: {
    logSources: number;
    epsSample: number;
    offenses: number;
    dropAlerts: number;
    rdpEvents: number;
    fortigatePolicyChanges: number;
    fortigateAdminConfigChanges: number;
    fortigateAdminLogins: number;
  };
  error?: string;
};

async function getCredentials(): Promise<QradarCredentials | { ok: false; error: string }> {
  const { data, error } = await supabaseAdmin
    .from("integrations")
    .select("api_key, enabled, base_url")
    .eq("provider", "qradar")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data || !data.enabled) return { ok: false, error: "Integração QRadar não está ativa." };
  if (!data.api_key) return { ok: false, error: "SEC Token do QRadar não configurado." };
  if (!data.base_url) return { ok: false, error: "Base URL do QRadar não configurada." };
  return { baseUrl: data.base_url.replace(/\/+$/, ""), secToken: readSecret(data.api_key) };
}

async function logApi(
  endpoint: string,
  status: "success" | "error",
  httpStatus: number | null,
  message: string | null,
  durationMs: number,
) {
  try {
    await supabaseAdmin.from("api_logs").insert({
      provider: "qradar",
      status,
      http_status: httpStatus,
      message: `${endpoint}${message ? ` — ${message}` : ""}`,
      duration_ms: durationMs,
    });
  } catch {
    /* swallow */
  }
}

async function qradarFetch<T = unknown>(creds: QradarCredentials, path: string, init?: RequestInit): Promise<T> {
  const url = `${creds.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const started = Date.now();
  // Timeout explícito de 25s para evitar hang no Cloudflare Tunnel (limite ~30s)
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const res = await fetch(url, {
      ...init,
      signal: ctrl.signal,
      headers: {
        SEC: creds.secToken,
        Accept: "application/json",
        Version: "10.0", // versão confirmada via /api/help/capabilities
        ...(process.env.CF_ACCESS_CLIENT_ID ? { "CF-Access-Client-Id": process.env.CF_ACCESS_CLIENT_ID } : {}),
        ...(process.env.CF_ACCESS_CLIENT_SECRET
          ? { "CF-Access-Client-Secret": process.env.CF_ACCESS_CLIENT_SECRET }
          : {}),
        ...(init?.headers ?? {}),
      },
    });
    const duration = Date.now() - started;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      await logApi(path, "error", res.status, text.slice(0, 200), duration);
      throw new Error(`QRadar ${res.status}: ${text.slice(0, 200)}`);
    }
    await logApi(path, "success", res.status, null, duration);
    return (await res.json()) as T;
  } catch (e) {
    const duration = Date.now() - started;
    const msg = (e as Error).message ?? String(e);
    if (!msg.startsWith("QRadar ")) {
      await logApi(path, "error", null, msg.slice(0, 200), duration);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// runQradarSync dispara várias AQL em paralelo (por grupo); o WAF na frente do
// QRadar bloqueia com 403 (HTML) uma parte dos POSTs quando todas começam
// juntas. Espaça só o instante de início de cada busca — polling/resultado
// seguem paralelos.
let aqlStartQueue: Promise<void> = Promise.resolve();
const AQL_START_STAGGER_MS = 700;

function scheduleAqlStart<T>(fn: () => Promise<T>): Promise<T> {
  const run = aqlStartQueue.then(fn);
  aqlStartQueue = aqlStartQueue.then(() => new Promise<void>((r) => setTimeout(r, AQL_START_STAGGER_MS)));
  return run;
}

// ── AQL helper (Ariel search) ─────────────────────────────────────────────────
async function runAql(
  creds: QradarCredentials,
  query: string,
  label: string,
  timeoutMs = 240_000,
): Promise<Array<Record<string, unknown>>> {
  // Envia query via form-encoded no body para evitar bloqueio do WAF na URL
  const url = `${creds.baseUrl}/api/ariel/searches`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000);
  const started = Date.now();
  let startRes: Response;
  try {
    startRes = await scheduleAqlStart(() =>
      fetch(url, {
        method: "POST",
        signal: ctrl.signal,
        headers: {
          SEC: creds.secToken,
          Accept: "application/json",
          Version: "10.0",
          "Content-Type": "application/x-www-form-urlencoded",
          ...(process.env.CF_ACCESS_CLIENT_ID ? { "CF-Access-Client-Id": process.env.CF_ACCESS_CLIENT_ID } : {}),
          ...(process.env.CF_ACCESS_CLIENT_SECRET
            ? { "CF-Access-Client-Secret": process.env.CF_ACCESS_CLIENT_SECRET }
            : {}),
        },
        body: `query_expression=${encodeURIComponent(query)}`,
      }),
    );
  } finally {
    clearTimeout(timer);
  }
  if (!startRes!.ok) {
    const text = await startRes!.text().catch(() => "");
    await logApi(`/api/ariel/searches [${label}]`, "error", startRes!.status, text.slice(0, 200), Date.now() - started);
    throw new Error(`QRadar ${startRes!.status}: ${text.slice(0, 200)}`);
  }
  await logApi(`/api/ariel/searches [${label}]`, "success", startRes!.status, null, Date.now() - started);
  const start = (await startRes!.json()) as { search_id: string };
  const searchId = start.search_id;
  // poll
  const deadline = Date.now() + timeoutMs;
  let status = "EXECUTE";
  while (Date.now() < deadline) {
    const s = await qradarFetch<{ status: string }>(creds, `/api/ariel/searches/${searchId}`);
    status = s.status;
    if (status === "COMPLETED") break;
    if (status === "ERROR" || status === "CANCELED") {
      await logApi(`/api/ariel/searches [${label}]`, "error", null, `AQL ${status}`, Date.now() - started);
      throw new Error(`AQL ${status}: ${query}`);
    }
    await new Promise((r) => setTimeout(r, 700));
  }
  if (status !== "COMPLETED") {
    // Não loga a query inteira (pode ter centenas de chars) — só o label e o
    // tempo decorrido, suficiente pra identificar qual AQL precisa de otimização.
    await logApi(
      `/api/ariel/searches [${label}]`,
      "error",
      null,
      `AQL timeout após ${timeoutMs}ms`,
      Date.now() - started,
    );
    throw new Error(`AQL timeout: ${query}`);
  }
  const results = await qradarFetch<{
    events?: Array<Record<string, unknown>>;
    flows?: Array<Record<string, unknown>>;
  }>(creds, `/api/ariel/searches/${searchId}/results`);

  // Libera o slot no search manager do QRadar assim que os resultados já
  // foram extraídos — best-effort, não pode derrubar o sync se o delete
  // falhar (sem isso, a busca só é limpa quando o QRadar expira ela por TTL).
  await qradarFetch(creds, `/api/ariel/searches/${searchId}`, { method: "DELETE" }).catch(() => {});

  return results.events ?? results.flows ?? [];
}

// ── Sync pieces ───────────────────────────────────────────────────────────────

async function syncLogSources(creds: QradarCredentials): Promise<number> {
  type LS = { id: number; name: string; enabled?: boolean; status?: { last_event_time?: number; status?: string } };
  // Tenta o endpoint v7.0+ primeiro, fallback para versões anteriores
  let list: LS[] = [];
  try {
    list = await qradarFetch<LS[]>(
      creds,
      "/api/config/event_sources/log_source_management/log_sources?fields=id,name,enabled,status&Range=items%3D0-499",
    );
  } catch (e: any) {
    if (e?.message?.includes("404")) {
      // Fallback para endpoint legado
      list = await qradarFetch<LS[]>(
        creds,
        "/api/config/event_sources/log_sources?fields=id,name,enabled,status&Range=items%3D0-499",
      );
    } else throw e;
  }
  if (!Array.isArray(list) || list.length === 0) return 0;
  const rows = list.map((l) => {
    const lastTs = l.status?.last_event_time;
    const lastEvent = lastTs ? new Date(lastTs).toISOString() : null;
    const ageHours = lastEvent ? (Date.now() - new Date(lastEvent).getTime()) / 3_600_000 : Infinity;
    const apiStatus = (l.status?.status ?? "").toUpperCase();
    // Mapeia status do QRadar: SUCCESS/NA → success, ERROR → error, DISABLED → disabled
    const computed = apiStatus === "ERROR" ? "error" : apiStatus === "DISABLED" || !l.enabled ? "disabled" : "success"; // SUCCESS, NA e qualquer outro → ativo
    return {
      id: l.id,
      name: l.name,
      type_name: null,
      enabled: l.enabled ?? true,
      status: computed,
      last_event_time: lastEvent,
      synced_at: new Date().toISOString(),
      raw: l as unknown as never,
    };
  });
  const { error } = await supabaseAdmin.from("qradar_log_sources").upsert(rows, { onConflict: "id" });
  if (error) throw new Error(`upsert log_sources: ${error.message}`);
  return rows.length;
}

// Pico real via telemetria interna do QRadar (StatFilter, deviceType=147) —
// é a mesma métrica que o gráfico nativo do QRadar usa ("Events per Second
// Raw - Peak 1 Sec"), mais precisa que a aproximação por minuto. Agrupar por
// hora (starttime/3600000, mesmo truque sem aspas já usado pro bucket por
// minuto) traz até 24 picos de uma vez — em vez de só 1 por sync — e dá pra
// usar isso pra corrigir (UPDATE, não INSERT) o peak_eps de amostras já
// existentes nas últimas 24h, sem tocar em total_eps (não estraga a média).
// Esse campo entre aspas multi-palavra bloqueava com 403 no WAF do Cloudflare
// (confirmado 100% das tentativas) — reintroduzido em 2026-06-25 após ajuste
// da regra do WAF; se voltar a bloquear, cai pro fallback de bucket por
// minuto (sem aspas, comprovado sem 403, mas só cobre a amostra atual).
async function syncEpsPeak(creds: QradarCredentials): Promise<{ peak: number | null; avgPeak: number | null }> {
  const hourlyRows = await runAql(
    creds,
    `SELECT (starttime/3600000) AS hora, MAX("Events per Second Raw - Peak 1 Sec") AS peak, AVG("Events per Second Raw - Peak 1 Sec") AS avgpeak FROM events WHERE "Parent" != 'null' AND "deviceType"='147' AND (icu4jsearch('Events per second', payload) != -1 AND icu4jsearch('StatFilter', payload) != -1) GROUP BY hora LAST 4 HOURS`,
    "eps-peak-native",
    240_000,
  ).catch(() => null);

  if (hourlyRows && hourlyRows.length > 0) {
    const peaksByHour = hourlyRows
      .map((r) => ({
        hora: Number(r.hora ?? NaN),
        peak: Number(r.peak ?? NaN),
        avgPeak: Number(r.avgpeak ?? NaN),
      }))
      .filter((r) => Number.isFinite(r.hora) && Number.isFinite(r.peak));
    if (peaksByHour.length === 0) return { peak: null, avgPeak: null };
    await Promise.all(
      peaksByHour.map((r) => {
        const hourStart = new Date(r.hora * 3_600_000).toISOString();
        const hourEnd = new Date(r.hora * 3_600_000 + 3_600_000).toISOString();
        return supabaseAdmin
          .from("qradar_eps_samples")
          .update({ peak_eps: r.peak, ...(Number.isFinite(r.avgPeak) ? { peak_eps_avg: r.avgPeak } : {}) })
          .gte("sampled_at", hourStart)
          .lt("sampled_at", hourEnd);
      }),
    );
    const validAvgs = peaksByHour.map((r) => r.avgPeak).filter((v) => Number.isFinite(v));
    return {
      peak: Math.max(...peaksByHour.map((r) => r.peak)),
      avgPeak: validAvgs.length > 0 ? validAvgs.reduce((a, b) => a + b, 0) / validAvgs.length : null,
    };
  }

  const minuteRows = await runAql(
    creds,
    `SELECT (starttime/60000) AS minuto, SUM(eventcount)/60 AS eps FROM events GROUP BY minuto LAST 2 HOURS`,
    "eps-peak-bucketed",
    240_000,
  ).catch(() => []);
  const peakValues = minuteRows.map((r) => Number(r.eps ?? 0)).filter((v) => Number.isFinite(v));
  if (peakValues.length === 0) return { peak: null, avgPeak: null };
  return {
    peak: Math.max(...peakValues),
    avgPeak: peakValues.reduce((a, b) => a + b, 0) / peakValues.length,
  };
}

async function syncEpsSample(
  creds: QradarCredentials,
): Promise<{ total: number; perSource: Array<{ name: string; eps: number }> }> {
  // Roda as três AQL em paralelo
  const [totalRows, perSourceRows, peakResult] = await Promise.all([
    // Janela de 1 min (era 5 min) pra aproximar do "Average 1 Min" nativo do
    // QRadar — ainda não é idêntico (metodologia de contagem diferente +
    // nosso valor é um snapshot por sync, não leitura contínua), mas elimina
    // a maior fonte de divergência (tamanho da janela).
    runAql(creds, `SELECT SUM(eventcount)/60 AS eps FROM events LIMIT 1 LAST 1 MINUTES`, "eps-total").catch(() => []),
    runAql(
      creds,
      `SELECT LOGSOURCENAME(logsourceid) AS src, SUM(eventcount)/1800 AS eps FROM events GROUP BY logsourceid ORDER BY eps DESC LIMIT 50 LAST 30 MINUTES`,
      "eps-per-source",
    ).catch(() => []),
    syncEpsPeak(creds),
  ]);

  const total = Number((totalRows[0]?.eps as number | undefined) ?? 0);
  const perSource = perSourceRows
    .map((r) => ({ name: String(r.src ?? "—"), eps: Number(r.eps ?? 0) }))
    .filter((r) => r.eps > 0);

  await supabaseAdmin.from("qradar_eps_samples").insert({
    total_eps: total,
    peak_eps: peakResult.peak,
    peak_eps_avg: peakResult.avgPeak,
    licensed_eps: 1500,
  });

  if (perSource.length > 0) {
    await Promise.all(
      perSource.map((r) => supabaseAdmin.from("qradar_log_sources").update({ avg_eps: r.eps }).eq("name", r.name)),
    );
  }
  return { total, perSource };
}

async function syncOffenses(creds: QradarCredentials, since: string | null): Promise<number> {
  const filter = since ? `?filter=${encodeURIComponent(`last_updated_time>${new Date(since).getTime()}`)}` : "";
  type OF = {
    id: number;
    description?: string;
    magnitude?: number;
    severity?: number;
    offense_source?: string;
    source_address_ids?: number[];
    destination_networks?: string[];
    username_count?: number;
    event_count?: number;
    start_time?: number;
    last_updated_time?: number;
    status?: string;
    close_time?: number | null;
    offense_type?: number;
    source_network?: string;
  };
  // Sem Range explícito, o QRadar limita a resposta a uma página pequena (algo
  // como os primeiros ~50 itens) — numa janela de catch-up com muitas offenses
  // alteradas (ex.: depois de um gap maior entre syncs), as que ficassem fora
  // dessa primeira página (incluindo fechamentos) nunca eram sincronizadas,
  // mesmo o fetch retornando 200/success. Pagina explicitamente até a página
  // voltar incompleta (sinal de que não há mais itens).
  // Página de 250 (não 1000): com o QRadar sob carga/instável, pedir 1000
  // itens de uma vez passava do abort de 25s do qradarFetch (limite do túnel
  // Cloudflare, não dá pra simplesmente aumentar). Página menor responde mais
  // rápido mesmo lento, só paginando mais vezes se houver muita coisa.
  const pageSize = 250;
  const list: OF[] = [];
  for (let page = 0; page < 80; page++) {
    const start = page * pageSize;
    const end = start + pageSize - 1;
    const sep = filter ? "&" : "?";
    const batch = await qradarFetch<OF[]>(creds, `/api/siem/offenses${filter}${sep}Range=items%3D${start}-${end}`);
    if (!Array.isArray(batch) || batch.length === 0) break;
    list.push(...batch);
    if (batch.length < pageSize) break;
  }
  if (list.length === 0) return 0;
  const rows = list.map((o) => ({
    id: o.id,
    description: (o.description ?? "").slice(0, 1000),
    magnitude: o.magnitude ?? null,
    severity: o.severity ?? null,
    // offense_source carrega o IP/identidade real do ofensor; source_network é só
    // o nome do bucket de rede do QRadar (ex.: "other") — quase nunca null, por
    // isso precisa vir depois no fallback, senão o IP real nunca aparece.
    source_ip: o.offense_source ?? o.source_network ?? null,
    destination_ip: o.destination_networks?.[0] ?? null,
    username: null as string | null,
    event_count: o.event_count ?? null,
    start_time: o.start_time ? new Date(o.start_time).toISOString() : null,
    last_updated_time: o.last_updated_time ? new Date(o.last_updated_time).toISOString() : null,
    status: o.status ?? null,
    closed_at: o.close_time ? new Date(o.close_time).toISOString() : null,
    raw: o as unknown as never,
    synced_at: new Date().toISOString(),
  }));
  // Deduplica por id antes do upsert — o QRadar não devolve um snapshot
  // congelado da paginação: quando o backlog é grande e a varredura leva
  // minutos, uma offense já buscada numa página anterior pode ser "tocada"
  // de novo (last_updated_time avança) e reaparecer numa página seguinte da
  // MESMA execução, duplicando o id dentro de `rows`. Um upsert com o mesmo
  // id duas vezes no mesmo lote quebra por inteiro com "ON CONFLICT DO
  // UPDATE command cannot affect row a second time" — confirmado em
  // produção em 2026-07-09 (~78 lotes, todos falhando). Mantém a última
  // ocorrência (a mais recente, já que a paginação segue a ordem crescente
  // devolvida pelo QRadar).
  const dedupedRows = [...new Map(rows.map((r) => [r.id, r])).values()];

  // Upsert em lotes — um único upsert com milhares de linhas (raw da offense
  // embutido em cada uma) começou a devolver 520 do Cloudflare na frente do
  // Supabase quando o cursor incremental (last_offenses_sync) ficou parado
  // (ex.: por uma falha anterior) e a janela de offenses alteradas cresceu
  // para 8000+ itens. Como o upsert falhava por inteiro, nada era persistido,
  // o cursor nunca avançava e o próximo ciclo refazia a mesma busca gigante —
  // loop permanente sem gravar nada. Lotes de 500 reduzem o payload por
  // requisição o suficiente para não estourar esse limite, e tentamos todos
  // os lotes mesmo se algum falhar, pra maximizar o que fica salvo.
  const chunkSize = 500;
  const chunkErrors: string[] = [];
  for (let i = 0; i < dedupedRows.length; i += chunkSize) {
    const chunk = dedupedRows.slice(i, i + chunkSize);
    const { error } = await supabaseAdmin.from("qradar_offenses").upsert(chunk, { onConflict: "id" });
    if (error) chunkErrors.push(`itens ${i}-${i + chunk.length}: ${error.message}`);
  }
  if (chunkErrors.length > 0) throw new Error(`upsert offenses: ${chunkErrors.join("; ")}`);
  return dedupedRows.length;
}

// Fechamentos feitos via integração externa (ex.: SOAR como o The Hive, que
// fecha offenses pela API com closing_user="API_token: The Hive") não
// atualizam last_updated_time no QRadar — só close_time e status mudam. Como
// syncOffenses filtra incrementalmente por last_updated_time>since, essas
// offenses nunca entram na janela e ficam "abertas" no nosso banco para
// sempre, mesmo o cursor avançando normalmente. Reconsulta direto por id só
// as que estão marcadas como abertas aqui (conjunto tipicamente pequeno) e
// corrige as que o QRadar já fechou.
async function reconcileOpenOffenses(creds: QradarCredentials): Promise<number> {
  const { data: openRows } = await supabaseAdmin.from("qradar_offenses").select("id, status").neq("status", "CLOSED");
  if (!openRows || openRows.length === 0) return 0;
  const statusById = new Map(openRows.map((r) => [r.id, r.status]));

  type OF = { id: number; status?: string; close_time?: number | null; last_updated_time?: number };
  const chunkSize = 100;
  const changed: OF[] = [];
  for (let i = 0; i < openRows.length; i += chunkSize) {
    const ids = openRows.slice(i, i + chunkSize).map((r) => r.id);
    const filter = `id IN (${ids.join(",")})`;
    const list = await qradarFetch<OF[]>(
      creds,
      `/api/siem/offenses?filter=${encodeURIComponent(filter)}&fields=id,status,close_time,last_updated_time`,
    );
    if (Array.isArray(list)) changed.push(...list.filter((o) => o.status && o.status !== statusById.get(o.id)));
  }
  if (changed.length === 0) return 0;

  await Promise.all(
    changed.map((o) =>
      supabaseAdmin
        .from("qradar_offenses")
        .update({
          status: o.status,
          closed_at: o.close_time ? new Date(o.close_time).toISOString() : null,
          ...(o.last_updated_time ? { last_updated_time: new Date(o.last_updated_time).toISOString() } : {}),
          synced_at: new Date().toISOString(),
        })
        .eq("id", o.id),
    ),
  );
  return changed.length;
}

function isPrivateIp(ip: string): boolean {
  const m = ip.match(/^(\d+)\.(\d+)/);
  if (!m) return true;
  const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)];
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 127) return true;
  if (a === 0) return true;
  return false;
}

async function syncO365Downloads(creds: QradarCredentials): Promise<number> {
  // Alto volume de download O365 — busca raw e agrega no JS
  try {
    const rows = await runAql(
      creds,
      `SELECT username, sourceip, qid, starttime, eventcount FROM events WHERE devicetype = 397 AND qid IN (101250092, 101250093, 101251152, 101252058, 101250086, 101250094, 101250095, 101251153, 101251154, 101252059, 101250087, 67500678) LIMIT 5000 LAST 8 HOURS`,
      "o365-downloads",
    );
    if (rows.length === 0) return 0;

    // Agrega no JS — GROUP BY e HAVING bloqueados pelo Cloudflare WAF
    const agg = new Map<
      string,
      { username: string; source_ip: string; qid: number; count: number; event_time: string }
    >();
    for (const r of rows) {
      const key = `${r.username}|${r.qid}`;
      const cur = agg.get(key) ?? {
        username: String(r.username ?? ""),
        source_ip: String(r.sourceip ?? ""),
        qid: Number(r.qid ?? 0),
        count: 0,
        event_time: r.starttime ? new Date(Number(r.starttime)).toISOString() : new Date().toISOString(),
      };
      cur.count += Number(r.eventcount ?? 1); // soma eventcount real
      agg.set(key, cur);
    }
    const now = new Date().toISOString();
    const mappedFiltered = [...agg.values()]
      .filter((r) => r.count >= 50 && r.username)
      .sort((a, b) => b.count - a.count)
      .slice(0, 50)
      .map((r) => ({
        username: r.username,
        source_ip: r.source_ip,
        qid: r.qid,
        event_count: r.count,
        event_time: r.event_time,
        sampled_at: now,
      }));

    if (mappedFiltered.length === 0) return 0;

    const { error } = await supabaseAdmin
      .from("qradar_o365_downloads")
      .upsert(mappedFiltered, { onConflict: "username,qid,sampled_at" });
    if (error) throw new Error(`upsert o365_downloads: ${error.message}`);
    return mappedFiltered.length;
  } catch {
    return 0;
  }
}

async function syncExternalOffenders(creds: QradarCredentials): Promise<number> {
  // Busca top ofensores por sourceip e filtra IPs externos no JS
  try {
    const rows = await runAql(
      creds,
      `SELECT sourceip, SUM(eventcount) AS total FROM events GROUP BY sourceip ORDER BY total DESC LIMIT 200 LAST 4 HOURS`,
      "external-offenders",
      240_000,
    );
    if (rows.length === 0) return 0;

    // Filtra apenas IPs externos (não RFC1918)
    const external = rows
      .filter((r) => {
        const ip = String(r.sourceip ?? "");
        return ip && !isPrivateIp(ip);
      })
      .sort((a, b) => Number(b.total ?? 0) - Number(a.total ?? 0))
      .slice(0, 50);

    if (external.length === 0) return 0;

    const now = new Date().toISOString();
    const mapped = external.map((r) => ({
      source_ip: String(r.sourceip ?? ""),
      event_count: Number(r.total ?? 0),
      sampled_at: now,
    }));

    const { error } = await supabaseAdmin
      .from("qradar_external_offenders")
      .upsert(mapped, { onConflict: "source_ip,sampled_at" });
    if (error) throw new Error(`upsert external_offenders: ${error.message}`);
    return mapped.length;
  } catch {
    return 0;
  }
}

async function syncDropAlerts(creds: QradarCredentials): Promise<number> {
  // Usa AQL para detectar eventos de descarte via categoria de sistema
  try {
    const rows = await runAql(
      creds,
      `SELECT LOGSOURCENAME(logsourceid) AS src, CATEGORYNAME(category) AS cat, starttime FROM events WHERE category IN (5017, 5018, 5019, 18999) LIMIT 100 LAST 12 HOURS`,
      "drop-alerts",
      240_000,
    );
    if (rows.length === 0) return 0;
    const mapped = rows.map((r, i) => ({
      id: `drop-${String(r.starttime ?? Date.now())}-${i}`,
      occurred_at: r.starttime ? new Date(Number(r.starttime)).toISOString() : new Date().toISOString(),
      log_source_id: null,
      log_source_name: r.logsourceid ? `Source ${r.logsourceid}` : null,
      dropped_count: null,
      reason: r.category ? `Category ${r.category}` : "drop alert",
      raw: r as unknown as never,
      synced_at: new Date().toISOString(),
    }));
    const { error } = await supabaseAdmin.from("qradar_drop_alerts").upsert(mapped, { onConflict: "id" });
    if (error) throw new Error(`upsert drop_alerts: ${error.message}`);
    return mapped.length;
  } catch {
    return 0;
  }
}

async function syncRdpEvents(creds: QradarCredentials, since: string | null): Promise<number> {
  // Logon Type=10, Event ID=4624, username contains 'infra'
  const range = `LAST 4 HOURS`; // START sem STOP é inválido em algumas versões do QRadar
  // Query confirmada no QRadar — Event ID 4624 + Logon Type 10 + username infra
  let rows: Array<Record<string, unknown>> = [];
  try {
    // Timeout maior que o padrão: filtro userName LIKE '%infra%' não usa índice e
    // força varredura completa dos eventos das últimas 24h, podendo passar de 30s.
    rows = await runAql(
      creds,
      `SELECT "userName" as username, "sourceIP" as sourceip, "destinationIP" as destinationip, "startTime" as starttime FROM events WHERE "Event ID"='4624' AND "Logon Type"='10' AND "userName" LIKE '%infra%' LIMIT 1000 ${range}`,
      "rdp-events",
      240_000,
    );
  } catch {
    rows = [];
  }

  if (rows.length === 0) return 0;
  // Deduplica por combinação única de campos antes de upsert
  const seen = new Set<string>();
  const mapped = rows
    .map((r) => {
      const t = r.starttime ? new Date(Number(r.starttime)).toISOString() : new Date().toISOString();
      // ID determinístico: starttime + sourceip + destinationip + username
      const id = `${t}-${String(r.sourceip ?? "")}-${String(r.destinationip ?? "")}-${String(r.username ?? "")}`;
      return {
        id,
        event_time: t,
        source_ip: (r.sourceip as string | null) ?? null,
        destination_ip: (r.destinationip as string | null) ?? null,
        username: (r.username as string | null) ?? null,
        log_source: null,
        raw: r as unknown as never,
        synced_at: new Date().toISOString(),
      };
    })
    .filter((r) => {
      if (seen.has(r.id)) return false;
      seen.add(r.id);
      return true;
    });
  const { error } = await supabaseAdmin.from("qradar_rdp_events").upsert(mapped, { onConflict: "id" });
  if (error) throw new Error(`upsert rdp: ${error.message}`);
  return mapped.length;
}

async function syncO365Deletions(creds: QradarCredentials): Promise<number> {
  // Alto volume de deleção O365 — threshold >= 50 por usuário/minuto
  try {
    const rows = await runAql(
      creds,
      `SELECT username, sourceip, qid, starttime, eventcount FROM events WHERE qid IN (101252097, 101252071, 67500676) LIMIT 5000 LAST 4 HOURS`,
      "o365-deletions",
    );
    if (rows.length === 0) return 0;

    // Agrega no JS — GROUP BY e HAVING bloqueados pelo Cloudflare WAF
    const agg = new Map<
      string,
      { username: string; source_ip: string; qid: number; count: number; event_time: string }
    >();
    for (const r of rows) {
      const key = `${r.username}|${r.qid}`;
      const cur = agg.get(key) ?? {
        username: String(r.username ?? ""),
        source_ip: String(r.sourceip ?? ""),
        qid: Number(r.qid ?? 0),
        count: 0,
        event_time: r.starttime ? new Date(Number(r.starttime)).toISOString() : new Date().toISOString(),
      };
      cur.count += Number(r.eventcount ?? 1); // soma eventcount real em vez de contar linhas
      agg.set(key, cur);
    }
    const filtered = [...agg.values()].filter((r) => r.count >= 50 && r.username);
    if (filtered.length === 0) return 0;

    const now = new Date().toISOString();
    const mapped = filtered
      .sort((a, b) => b.count - a.count)
      .slice(0, 50)
      .map((r) => ({
        username: r.username,
        source_ip: r.source_ip,
        qid: r.qid,
        event_count: r.count,
        event_time: r.event_time,
        sampled_at: now,
      }));

    if (mapped.length === 0) return 0;

    const { error } = await supabaseAdmin
      .from("qradar_o365_deletions")
      .upsert(mapped, { onConflict: "username,qid,sampled_at" });
    if (error) throw new Error(`upsert o365_deletions: ${error.message}`);
    return mapped.length;
  } catch {
    return 0;
  }
}

// Extrai o verbo de ação (Add/Edit/Delete/Move/Clone) do "msg" do Fortigate,
// que vem no formato "<ação> <cfgpath>" (ex.: "Add firewall.policy").
function extractFortigateAction(msg: string | null): string | null {
  if (!msg) return null;
  const m = /\b(add|edit|delete|move|clone)\b/i.exec(msg);
  if (!m) return null;
  return m[1][0].toUpperCase() + m[1].slice(1).toLowerCase();
}

// Replica a regra "Firewall Policy Any Any Accept" (origem/destino "all",
// ação accept, regra sendo habilitada) em JS sobre o cfgattr já trazido pela
// query de policy change — evita repetir a busca no QRadar e evita o
// MATCHES/regex no AQL, que era extremamente lento nesse devicetype.
function isFortigateAnyAnyAcceptEnabled(fwAction: string | null, cfgattr: string | null): boolean {
  if (!fwAction || !cfgattr) return false;
  if (fwAction.toLowerCase() !== "accept") return false;
  const c = cfgattr.toLowerCase();
  const anyAny = c.includes("srcaddr[all") || (c.includes("dstaddr[") && c.includes("all]"));
  return anyAny && c.includes("disable->enable");
}

// Id determinístico a partir do conteúdo do evento, não da posição dele no
// array de resultados. A janela de busca dos 3 syncs do Fortigate é "últimas
// 3h" rodando a cada 2h (overlap proposital de 1h pra não perder evento na
// borda) — o mesmo evento físico aparece em execuções consecutivas, mas o
// índice dele no array muda a cada vez (a janela desliza). Usar esse índice
// como sufixo do id (esquema antigo) fazia o upsert tratar o mesmo evento
// como linha nova em cada sync, em vez de atualizar a existente — confirmado
// em produção: 56 de 96 linhas da tabela eram duplicatas do mesmo evento.
function fortigateEventId(prefix: string, r: Record<string, unknown>): string {
  const key = [r.starttime, r.sourceip, r.qid, r.username, r.msg].map((v) => String(v ?? "")).join("|");
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
  return `${prefix}-${String(r.starttime ?? "")}-${(hash >>> 0).toString(36)}`;
}

async function syncFortigatePolicyChanges(creds: QradarCredentials): Promise<number> {
  // Adaptação direta de uma regra real do cliente no QRadar (custom rule com
  // teste "AQL filter query", já validada em produção): devicetype=73 é o ID
  // do Fortigate nesse QRadar; Subtype='system' isola eventos de config (vs.
  // tráfego); msg (sem aspas) vem como "<ação> firewall.policy". cfgattr e
  // Action (também sem aspas) vêm na mesma busca — alimentam o flag de risco
  // "Any-Any-Accept" calculado em JS, sem precisar de uma 4ª AQL separada.
  // Janela de 4h (não 4h): esse devicetype gera tanto tráfego que mesmo
  // filtros "baratos" (qid IN, Subtype=) levam minutos para escanear 4h —
  // o cron roda a cada 2h, então 4h (2h de margem) já cobre sem gap.
  try {
    const rows = await runAql(
      creds,
      `SELECT starttime, LOGSOURCENAME(logsourceid) AS logsourcename, username, sourceip, destinationip, qid, qidname(qid) AS qidname, msg, cfgattr, Action AS fwaction FROM events WHERE devicetype=73 AND Subtype='system' AND (LOWER(msg) LIKE '%add firewall.policy%' OR LOWER(msg) LIKE '%edit firewall.policy%' OR LOWER(msg) LIKE '%move firewall.policy%' OR LOWER(msg) LIKE '%delete firewall.policy%') LIMIT 500 LAST 4 HOURS`,
      "fortigate-policy-changes",
      240_000,
    );
    if (rows.length === 0) return 0;

    const mapped = rows.map((r) => {
      const msg = (r.msg as string | null) ?? null;
      const cfgattr = (r.cfgattr as string | null) ?? null;
      const fwAction = (r.fwaction as string | null) ?? null;
      const risky = isFortigateAnyAnyAcceptEnabled(fwAction, cfgattr);
      return {
        id: fortigateEventId("fgt-policy", r),
        query_type: "policy_change",
        event_time: r.starttime ? new Date(Number(r.starttime)).toISOString() : new Date().toISOString(),
        log_source_name: (r.logsourcename as string | null) ?? null,
        username: (r.username as string | null) ?? null,
        source_ip: (r.sourceip as string | null) ?? null,
        destination_ip: (r.destinationip as string | null) ?? null,
        action: extractFortigateAction(msg),
        event_category: risky ? "any_any_accept" : (null as string | null),
        event_name: null as string | null,
        qid: r.qid ? Number(r.qid) : null,
        qid_name: (r.qidname as string | null) ?? null,
        message: msg,
        raw: r as unknown as never,
        synced_at: new Date().toISOString(),
      };
    });
    const { error } = await supabaseAdmin.from("qradar_fortigate_policy_changes").upsert(mapped, { onConflict: "id" });
    if (error) throw new Error(`upsert fortigate_policy_changes: ${error.message}`);
    return mapped.length;
  } catch {
    return 0;
  }
}

async function syncFortigateAdminConfigChanges(creds: QradarCredentials): Promise<number> {
  // Mesmo padrão da regra real de policy (devicetype=73, Subtype='system',
  // msg = "<ação> <cfgpath>"), aplicado a outros objetos de config do
  // Fortigate: VIP, address, service e schedule. Janela de 3h — ver comentário
  // em syncFortigatePolicyChanges sobre o volume de tráfego desse devicetype.
  try {
    const rows = await runAql(
      creds,
      `SELECT starttime, LOGSOURCENAME(logsourceid) AS logsourcename, username, sourceip, destinationip, qid, qidname(qid) AS qidname, msg FROM events WHERE devicetype=73 AND Subtype='system' AND (LOWER(msg) LIKE '%firewall.vip%' OR LOWER(msg) LIKE '%firewall.address%' OR LOWER(msg) LIKE '%firewall.service%' OR LOWER(msg) LIKE '%firewall.schedule%') LIMIT 500 LAST 3 HOURS`,
      "fortigate-admin-config-changes",
      240_000,
    );
    if (rows.length === 0) return 0;

    const mapped = rows.map((r) => {
      const msg = (r.msg as string | null) ?? null;
      return {
        id: fortigateEventId("fgt-admin", r),
        query_type: "admin_config",
        event_time: r.starttime ? new Date(Number(r.starttime)).toISOString() : new Date().toISOString(),
        log_source_name: (r.logsourcename as string | null) ?? null,
        username: (r.username as string | null) ?? null,
        source_ip: (r.sourceip as string | null) ?? null,
        destination_ip: (r.destinationip as string | null) ?? null,
        action: extractFortigateAction(msg),
        event_category: null as string | null,
        event_name: null as string | null,
        qid: r.qid ? Number(r.qid) : null,
        qid_name: (r.qidname as string | null) ?? null,
        message: msg,
        raw: r as unknown as never,
        synced_at: new Date().toISOString(),
      };
    });
    const { error } = await supabaseAdmin.from("qradar_fortigate_policy_changes").upsert(mapped, { onConflict: "id" });
    if (error) throw new Error(`upsert fortigate_admin_config_changes: ${error.message}`);
    return mapped.length;
  } catch {
    return 0;
  }
}

async function syncFortigateAdminLogins(creds: QradarCredentials): Promise<number> {
  // Adaptação de outra regra real do cliente (SEK:FGT:CO: Successful Login
  // Admin Users): qid IN (20253037, 20257891) já identifica "Admin login
  // successful" sozinho — não precisamos do "Log Description" (CEP entre
  // aspas, não verificado) porque o QID por si só é suficientemente preciso.
  // Janela de 3h — ver comentário em syncFortigatePolicyChanges sobre o
  // volume de tráfego desse devicetype (mesmo qid IN ainda exige escanear o
  // período inteiro, já que não é um índice rápido aqui).
  try {
    const rows = await runAql(
      creds,
      `SELECT starttime, LOGSOURCENAME(logsourceid) AS logsourcename, username, sourceip, destinationip, qid, qidname(qid) AS qidname, msg FROM events WHERE devicetype=73 AND Subtype='system' AND qid IN (20253037, 20257891) LIMIT 500 LAST 3 HOURS`,
      "fortigate-admin-logins",
      240_000,
    );
    if (rows.length === 0) return 0;

    const mapped = rows.map((r) => ({
      id: fortigateEventId("fgt-login", r),
      query_type: "admin_login",
      event_time: r.starttime ? new Date(Number(r.starttime)).toISOString() : new Date().toISOString(),
      log_source_name: (r.logsourcename as string | null) ?? null,
      username: (r.username as string | null) ?? null,
      source_ip: (r.sourceip as string | null) ?? null,
      destination_ip: (r.destinationip as string | null) ?? null,
      action: "Login",
      event_category: null as string | null,
      event_name: null as string | null,
      qid: r.qid ? Number(r.qid) : null,
      qid_name: (r.qidname as string | null) ?? null,
      message: (r.msg as string | null) ?? null,
      raw: r as unknown as never,
      synced_at: new Date().toISOString(),
    }));
    const { error } = await supabaseAdmin.from("qradar_fortigate_policy_changes").upsert(mapped, { onConflict: "id" });
    if (error) throw new Error(`upsert fortigate_admin_logins: ${error.message}`);
    return mapped.length;
  } catch {
    return 0;
  }
}

async function syncTopSourceEvents(creds: QradarCredentials): Promise<number> {
  // Top origens por volume de eventos brutos (todas as fontes, últimas 24h)
  try {
    const rows = await runAql(
      creds,
      `SELECT sourceip, SUM(eventcount) AS total FROM events GROUP BY sourceip ORDER BY total DESC LIMIT 500 LAST 4 HOURS`,
      "top-source-events",
      240_000,
    );
    if (rows.length === 0) return 0;

    const now = new Date().toISOString();
    // Filtra IPs internos RFC1918 e ignora "other"
    const internal = rows
      .filter((r) => {
        const ip = String(r.sourceip ?? "");
        if (!ip || ip === "other") return false;
        const m = ip.match(/^(\d+)\.(\d+)/);
        if (!m) return false;
        const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)];
        return a === 10 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
      })
      .slice(0, 50);

    if (internal.length === 0) return 0;

    const mapped = internal.map((r) => ({
      source_ip: String(r.sourceip ?? ""),
      event_count: Number(r.total ?? 0),
      sampled_at: now,
    }));

    const { error } = await supabaseAdmin
      .from("qradar_internal_offenders")
      .upsert(mapped, { onConflict: "source_ip,sampled_at" });
    if (error) throw new Error(`upsert top_source_events: ${error.message}`);
    return mapped.length;
  } catch {
    return 0;
  }
}

// Nenhuma trava impedia duas execuções de runQradarSync rodarem ao mesmo
// tempo — confirmado em produção em 2026-07-07: enquanto um sync ficava preso
// reprocessando um backlog grande, cliques manuais repetidos em "Sincronizar"
// (sem relação com o disparo do cron, que é sempre pontual a cada 2h — ver
// cron_http_dispatch_log) empilharam várias execuções concorrentes disputando
// os mesmos recursos no QRadar e no Supabase. Lease com expiração própria
// (não trava para sempre se o processo morrer no meio antes de liberar, como
// já documentado em cron-tracking.server.ts) — 45min está bem acima da
// duração de um sync saudável, mas ainda cabe várias vezes dentro do
// intervalo de 2h do cron.
const SYNC_LEASE_STALE_MS = 45 * 60 * 1000;

export async function runQradarSync(): Promise<QradarSyncResult> {
  const emptyCounts = {
    logSources: 0,
    epsSample: 0,
    offenses: 0,
    dropAlerts: 0,
    rdpEvents: 0,
    fortigatePolicyChanges: 0,
    fortigateAdminConfigChanges: 0,
    fortigateAdminLogins: 0,
  };

  // load cursors + checa se já existe uma execução em andamento
  const { data: state } = await supabaseAdmin.from("qradar_sync_state").select("*").eq("id", true).maybeSingle();

  // Checagem rápida — não é a garantia contra corrida (essa vem do UPDATE
  // condicional mais abaixo), só evita gastar uma chamada de credenciais no
  // caso comum de já haver uma execução claramente em andamento.
  if (state?.sync_running_since) {
    const runningMs = Date.now() - new Date(state.sync_running_since).getTime();
    if (runningMs < SYNC_LEASE_STALE_MS) {
      return {
        ok: false,
        counts: emptyCounts,
        error: `Sync já em andamento (iniciado há ${Math.round(runningMs / 60000)}min) — execução concorrente ignorada.`,
      };
    }
  }

  const credsOrErr = await getCredentials();
  if ("ok" in credsOrErr && credsOrErr.ok === false) {
    return { ok: false, counts: emptyCounts, error: credsOrErr.error };
  }
  const creds = credsOrErr as QradarCredentials;

  // Adquire o lease de forma atômica — um único UPDATE condicional, não
  // "lê depois escreve" em dois passos como antes. Duas chamadas quase
  // simultâneas (ex.: duplo clique em "Sincronizar") passavam as DUAS pela
  // checagem acima antes de qualquer uma escrever o lease, rodando o sync
  // inteiro em paralelo — confirmado em produção em 2026-07-09 (duas buscas
  // idênticas de offenses ao mesmo tempo, uma abortando por contenção). O
  // Postgres serializa este UPDATE por linha: só quem realmente casar a
  // condição (lease livre ou expirado) no exato momento da escrita ganha —
  // não importa o quão perto duas chamadas cheguem uma da outra.
  const staleThresholdIso = new Date(Date.now() - SYNC_LEASE_STALE_MS).toISOString();
  const { data: acquired } = await supabaseAdmin
    .from("qradar_sync_state")
    .update({ sync_running_since: new Date().toISOString() })
    .eq("id", true)
    .or(`sync_running_since.is.null,sync_running_since.lt.${staleThresholdIso}`)
    .select("sync_running_since");

  if (!acquired || acquired.length === 0) {
    return {
      ok: false,
      counts: emptyCounts,
      error:
        "Sync já em andamento — execução concorrente ignorada (lease adquirido por outra chamada nesse meio-tempo).",
    };
  }

  const sinceOffenses = state?.last_offenses_sync ?? null;
  const sinceRdp = state?.last_events_sync ?? null;

  const counts = { ...emptyCounts };
  const errors: string[] = [];

  const safe = async <T,>(fn: () => Promise<T>, fallback: T): Promise<T> => {
    try {
      return await fn();
    } catch (e) {
      errors.push((e as Error).message);
      return fallback;
    }
  };

  // Grupo 1 — REST API (rápido, paralelo)
  let offensesSynced = false;
  // Marca o cursor no instante em que a busca de offenses É DISPARADA, não no
  // fim do sync inteiro (Grupos 2+3 levam minutos). Senão, qualquer offense
  // que mudasse de status nesse meio-tempo (ex.: fechasse) ficava fora da
  // janela `last_updated_time>since` tanto desse run (já buscado antes da
  // mudança) quanto do próximo (cursor já avançado pra depois da mudança) —
  // perdendo o fechamento para sempre.
  let offensesSyncStartedAt: string | null = null;
  const [logSources, offenses] = await Promise.all([
    safe(() => syncLogSources(creds), 0),
    safe(async () => {
      offensesSyncStartedAt = new Date().toISOString();
      const n = await syncOffenses(creds, sinceOffenses);
      offensesSynced = true;
      // Falha na reconciliação não pode impedir o avanço do cursor incremental
      // acima — por isso roda isolada, com seu próprio safe().
      await safe(() => reconcileOpenOffenses(creds), 0);
      return n;
    }, 0),
  ]);
  counts.logSources = logSources;
  counts.offenses = offenses;

  // Após atualizar fontes de log, detecta indisponibilidades imediatamente
  await safe(() => syncIndisponibilidadesCore(supabaseAdmin), { created: 0, closed: 0 });

  // Grupo 2 — AQL "rápidas" em paralelo (grupos 2 e 3 unificados). Testado em
  // produção dividir isso em levas sequenciais menores (2026-07-08) na
  // hipótese de que a concorrência das 7 buscas estourava limite de conexão
  // — não eliminou os timeouts de eps-peak-native/external-offenders/
  // rdp-events (que ocorreram do mesmo jeito mesmo isoladas em levas de 2) e
  // só deixou o sync mais lento, então foi revertido. Timeout parece ser
  // custo intrínseco dessas queries (scans amplos sem filtro seletivo) sob a
  // carga atual do QRadar, não concorrência com as outras buscas do grupo.
  const [eps, , , rdpEvents] = await Promise.all([
    safe(() => syncEpsSample(creds), { total: 0, perSource: [] as Array<{ name: string; eps: number }> }),
    safe(() => syncDropAlerts(creds), 0),
    safe(() => syncExternalOffenders(creds), 0),
    safe(() => syncRdpEvents(creds, sinceRdp), 0),
    safe(() => syncTopSourceEvents(creds), 0),
    safe(() => syncO365Downloads(creds), 0),
    safe(() => syncO365Deletions(creds), 0),
  ]);
  counts.epsSample = 1 + (eps?.perSource?.length ?? 0);
  counts.rdpEvents = rdpEvents ?? 0;

  // Grupo 3 — AQL do Fortigate, sequencial após o grupo 2 (não junto): elas
  // levam 1-2min cada (devicetype com muito tráfego) e, somadas às buscas do
  // grupo 2 disparando ao mesmo tempo, passavam do limite de buscas Ariel
  // concorrentes desse QRadar — o WAF devolvia 403 (HTML) numa fração delas.
  const [fortigatePolicyChanges, fortigateAdminConfigChanges, fortigateAdminLogins] = await Promise.all([
    safe(() => syncFortigatePolicyChanges(creds), 0),
    safe(() => syncFortigateAdminConfigChanges(creds), 0),
    safe(() => syncFortigateAdminLogins(creds), 0),
  ]);
  counts.fortigatePolicyChanges = fortigatePolicyChanges ?? 0;
  counts.fortigateAdminConfigChanges = fortigateAdminConfigChanges ?? 0;
  counts.fortigateAdminLogins = fortigateAdminLogins ?? 0;

  const lastError = errors.length > 0 ? errors[errors.length - 1] : undefined;

  const now = new Date().toISOString();
  await supabaseAdmin.from("qradar_sync_state").upsert(
    {
      id: true,
      // Só avança o cursor de offenses se a busca teve sucesso — caso contrário,
      // mantém o cursor anterior para reconsultar a janela perdida na próxima execução
      // (um 403/timeout passageiro não pode "saltar" offenses que mudaram de status nesse meio-tempo).
      last_offenses_sync: offensesSynced ? offensesSyncStartedAt : sinceOffenses,
      last_events_sync: now,
      last_log_sources_sync: now,
      last_eps_sample_at: now,
      last_full_sync_at: now,
      last_error: lastError ?? null,
      sync_running_since: null,
      updated_at: now,
    },
    { onConflict: "id" },
  );

  return { ok: !lastError, counts, error: lastError };
}

// Watchdog — chamado por um cron SEPARADO (qradar-sync-watchdog, a cada
// 5min), não pelo próprio runQradarSync. Precisa ser independente: se o
// watchdog só ligasse/desligasse junto com o início/fim do sync, quebraria
// exatamente no caso que mais importa — quando o processo morre no meio e
// nunca chega no código que o desarmaria (mesmo motivo pelo qual o lease em
// si só expira por tempo, ver SYNC_LEASE_STALE_MS acima).
//
// Sinal de vida: atividade real em api_logs, não só tempo decorrido. Toda
// chamada ao QRadar (qradarFetch) tem abort de 25s — um processo vivo nunca
// fica mais que ~25-30s sem gravar uma linha nova em api_logs, mesmo numa
// chamada travada (ela aborta e loga dentro desse limite). Passar bem disso
// (3min de folga generosa) com o lease ainda ativo é sinal confiável de que
// o processo morreu, não só está lento — detecta bem mais rápido e com mais
// confiança do que esperar o timeout cego de 45min.
const WATCHDOG_DEAD_AFTER_MS = 3 * 60 * 1000;

export async function checkQradarSyncWatchdog(): Promise<{
  action: "noop" | "marked_dead";
  detail?: string;
}> {
  const { data: state } = await supabaseAdmin
    .from("qradar_sync_state")
    .select("sync_running_since")
    .eq("id", true)
    .maybeSingle();
  const runningSince = state?.sync_running_since;
  if (!runningSince) return { action: "noop" };

  const { data: lastLog } = await supabaseAdmin
    .from("api_logs")
    .select("created_at")
    .eq("provider", "qradar")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Se não houver log algum desde que o lease foi criado, usa o próprio
  // início do lease como referência — evita falso positivo logo nos
  // primeiros segundos de uma execução legítima que ainda não gravou nada.
  const runningSinceMs = new Date(runningSince).getTime();
  const lastLogMs = lastLog?.created_at ? new Date(lastLog.created_at).getTime() : 0;
  const lastActivityMs = Math.max(runningSinceMs, lastLogMs);
  const sinceActivityMs = Date.now() - lastActivityMs;
  if (sinceActivityMs < WATCHDOG_DEAD_AFTER_MS) return { action: "noop" };

  const minutesSilent = Math.round(sinceActivityMs / 60000);
  const now = new Date().toISOString();
  await supabaseAdmin.from("qradar_sync_state").update({ sync_running_since: null }).eq("id", true);
  await supabaseAdmin
    .from("cron_job_runs")
    .update({
      last_ok: false,
      last_error: `Sync interrompido — sem atividade há ${minutesSilent}min (processo provavelmente morto)`,
      updated_at: now,
    })
    .eq("job_name", "qradar-sync");

  return { action: "marked_dead", detail: `sem atividade há ${minutesSilent}min` };
}
