// Server-only Cloudflare pipeline. Reads credentials from integrations,
// loops every zone in the account, persists zones, DNS records and firewall
// events in the database. Designed to be incremental for cron and manual sync.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { applyEmailTemplate, getEmailTemplateOverride } from "./email-templates.functions";
import { buildDnsRecordCreatedHtml, buildDnsRecordUpdatedHtml, buildRuleAlertHtml } from "./email-templates.defaults";
import { isAlertModuleEnabled } from "./alert-modules.functions";
import { APP_NAME } from "@/lib/brand";

const CF_API = "https://api.cloudflare.com/client/v4";
const GQL_URL = `${CF_API}/graphql`;

function getAppBaseUrl() {
  const explicitUrl = process.env.APP_URL || process.env.PUBLIC_APP_URL;
  if (explicitUrl) return explicitUrl.replace(/\/+$/, "");
  return "https://b-security.bernoulli.com.br";
}

type Credentials = { apiToken: string };

async function getCredentials(): Promise<Credentials | { ok: false; error: string }> {
  const { data, error } = await supabaseAdmin
    .from("integrations")
    .select("api_key, enabled, config")
    .eq("provider", "cloudflare")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data || !data.enabled) return { ok: false, error: "Integração Cloudflare não está ativa." };
  if (!data.api_key) return { ok: false, error: "API Token da Cloudflare não configurado." };
  return { apiToken: data.api_key };
}

async function logApi(status: "success" | "error", httpStatus: number | null, message: string, ms: number) {
  try {
    await supabaseAdmin.from("api_logs").insert({
      provider: "cloudflare",
      status,
      http_status: httpStatus,
      message: message.slice(0, 500),
      duration_ms: ms,
    });
  } catch {
    /* ignore */
  }
}

// ─── Log de auditoria das operações do módulo (aba "Adicionar DNS" / "Purge de
// Cache" / edição de DNS) — gravado aqui, no servidor, com supabaseAdmin, para
// não depender do client autenticado do usuário: a policy de INSERT em
// audit_logs exige role global admin/analista, e um usuário só com permissão
// de módulo (ex.: manage_adicionar_dns) tem a ação liberada mas não passaria
// nessa policy, fazendo o insert falhar silenciosamente no client.
export async function resolveZoneName(zoneId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("cloudflare_zones").select("name").eq("id", zoneId).maybeSingle();
  return (data as any)?.name ?? null;
}

export async function resolveUserEmail(
  userId: string | null | undefined,
  claimsEmail?: string | null,
): Promise<string | null> {
  if (userId) {
    const { data } = await supabaseAdmin.from("profiles").select("email").eq("id", userId).maybeSingle();
    if ((data as any)?.email) return (data as any).email;
  }
  return claimsEmail ?? null;
}

export type FieldChange = { path: string; before: unknown; after: unknown };

// Diff genérico entre o estado "antes" e "depois" de uma edição — usado pra
// registrar EXATAMENTE o que mudou numa edição de DNS ou de Rules (antes só
// aparecia o valor novo nos detalhes do log, sem indicar se algo mudou de
// verdade, já que a descrição pode ser reenviada igual mesmo sem alteração).
// Desce em objetos aninhados (útil pro action_parameters das Rules, que varia
// de formato por categoria) usando path com "." — não desce em arrays
// (compara por igualdade de JSON inteiro, mais simples e seguro).
export function diffObjects(before: Record<string, unknown> | null | undefined, after: Record<string, unknown> | null | undefined, prefix = ""): FieldChange[] {
  const changes: FieldChange[] = [];
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})]);
  for (const key of keys) {
    const path = prefix ? `${prefix}.${key}` : key;
    const b = (before as any)?.[key];
    const a = (after as any)?.[key];
    const bothPlainObjects =
      b && a && typeof b === "object" && typeof a === "object" && !Array.isArray(b) && !Array.isArray(a);
    if (bothPlainObjects) {
      changes.push(...diffObjects(b, a, path));
      continue;
    }
    const same = JSON.stringify(b ?? null) === JSON.stringify(a ?? null);
    if (!same) changes.push({ path, before: b ?? null, after: a ?? null });
  }
  return changes;
}

// Resumo em texto de uma lista de mudanças, pra usar no `message` do log
// (ex.: "proxied: true → false; ttl: 1 → 300") — trunca se ficar muito longo.
export function summarizeChanges(changes: FieldChange[], max = 4): string {
  if (changes.length === 0) return "sem alterações de conteúdo (reenviado igual)";
  const fmt = (v: unknown) => (v === null || v === undefined || v === "" ? "vazio" : String(v));
  const parts = changes.slice(0, max).map((c) => `${c.path}: ${fmt(c.before)} → ${fmt(c.after)}`);
  const suffix = changes.length > max ? ` (+${changes.length - max})` : "";
  return parts.join("; ") + suffix;
}

export async function logCloudflareAudit(entry: {
  action: "purge_cache" | "create_dns" | "update_dns" | "update_rule" | "toggle_rule" | "delete_rule";
  status: "success" | "error";
  zoneId?: string | null;
  zoneName?: string | null;
  message?: string | null;
  durationMs?: number | null;
  userEmail?: string | null;
  details?: Record<string, unknown> | null;
}): Promise<void> {
  try {
    const { error } = await supabaseAdmin.from("audit_logs").insert({
      action: entry.action,
      status: entry.status,
      zone_id: entry.zoneId ?? null,
      zone_name: entry.zoneName ?? null,
      message: entry.message ?? null,
      duration_ms: entry.durationMs ?? null,
      user_email: entry.userEmail ?? null,
      details: entry.details ? (JSON.parse(JSON.stringify(entry.details)) as any) : null,
    });
    if (error) console.error("[logCloudflareAudit] insert error:", error.message, error.details);
  } catch (err) {
    console.error("[logCloudflareAudit] Unexpected error:", err);
  }
}

async function cfFetch(path: string, token: string, init?: RequestInit) {
  const res = await fetch(`${CF_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const json = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, json };
}

async function listAllZones(token: string) {
  const zones: any[] = [];
  let page = 1;
  while (true) {
    const r = await cfFetch(`/zones?per_page=50&page=${page}`, token);
    if (!r.ok) throw new Error(`Falha ao listar zonas (${r.status}): ${JSON.stringify(r.json).slice(0, 200)}`);
    const list = r.json?.result ?? [];
    zones.push(...list);
    const totalPages = r.json?.result_info?.total_pages ?? 1;
    if (page >= totalPages) break;
    page += 1;
  }
  return zones;
}

async function listDnsRecords(zoneId: string, token: string, modifiedSince?: string) {
  const records: any[] = [];
  let page = 1;
  const per = 500;
  while (true) {
    const r = await cfFetch(`/zones/${zoneId}/dns_records?per_page=${per}&page=${page}`, token);
    if (!r.ok) throw new Error(`Falha DNS zona ${zoneId}: ${r.status}`);
    const list = r.json?.result ?? [];
    for (const rec of list) {
      if (!modifiedSince || (rec.modified_on && rec.modified_on >= modifiedSince)) {
        records.push(rec);
      }
    }
    const totalPages = r.json?.result_info?.total_pages ?? 1;
    if (page >= totalPages) break;
    page += 1;
  }
  return records;
}

async function fetchFirewallEvents(zoneId: string, token: string, sinceIso: string, untilIso: string) {
  const query = `
    query Events($zone:String!, $since:Time!, $until:Time!) {
      viewer {
        zones(filter:{zoneTag:$zone}) {
          events: firewallEventsAdaptive(limit:10000, orderBy:[datetime_DESC], filter:{datetime_geq:$since, datetime_leq:$until}) {
            rayName
            datetime
            action
            clientIP
            clientCountryName
            clientRequestHTTPHost
            clientRequestPath
            clientRequestHTTPMethodName
            userAgent
            ruleId
          }
        }
      }
    }`;

  // Cloudflare limita a janela por plano (Free=1d, Pro=3d, etc).
  // Tenta a janela pedida; em caso de erro de "time range wider than Xd",
  // reduz para X dias e tenta de novo (até 1d).
  let curSince = sinceIso;
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(GQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ query, variables: { zone: zoneId, since: curSince, until: untilIso } }),
    });
    const json: any = await res.json().catch(() => ({}));
    if (res.ok && !json.errors?.length) {
      return (json.data?.viewer?.zones?.[0]?.events ?? []) as any[];
    }
    const msg: string = json.errors?.[0]?.message ?? "erro desconhecido";
    const m = msg.match(/wider than\s+(\d+)d/i);
    if (m) {
      const allowedDays = Math.max(1, parseInt(m[1], 10));
      const windowMs = allowedDays * 24 * 60 * 60 * 1000 - 5 * 60 * 1000;
      curSince = new Date(new Date(untilIso).getTime() - windowMs).toISOString();
      continue;
    }
    throw new Error(`GQL firewall ${res.status}: ${msg}`);
  }
  return [];
}

export type CloudflareSyncResult =
  | {
      ok: true;
      zones: number;
      dnsRecords: number;
      firewallEvents: number;
    }
  | { ok: false; error: string };

export async function runCloudflareSync(opts?: { fullResync?: boolean }): Promise<CloudflareSyncResult> {
  const t0 = Date.now();
  const creds = await getCredentials();
  if ("ok" in creds && creds.ok === false) {
    await logApi("error", null, creds.error, Date.now() - t0);
    return creds;
  }
  const { apiToken } = creds as Credentials;
  const fullResync = opts?.fullResync === true;

  try {
    // STATE
    const { data: stateRow } = await supabaseAdmin
      .from("cloudflare_sync_state")
      .select("*")
      .eq("account_id", "default")
      .maybeSingle();

    const lastEventsAt = fullResync ? null : (stateRow?.last_events_at ?? null);
    const lastDnsAt = fullResync ? null : (stateRow?.last_dns_synced_at ?? null);

    // 1) ZONES
    const zones = await listAllZones(apiToken);
    if (zones.length > 0) {
      const rows = zones.map((z) => ({
        id: z.id,
        name: z.name,
        status: z.status,
        account_id: z.account?.id ?? null,
        account_name: z.account?.name ?? null,
        paused: z.paused ?? null,
        type: z.type ?? null,
        raw: z,
        synced_at: new Date().toISOString(),
      }));
      const { error } = await supabaseAdmin.from("cloudflare_zones").upsert(rows, { onConflict: "id" });
      if (error) throw new Error(`upsert zones: ${error.message}`);
    }

    // 2) DNS RECORDS (per zone)
    let dnsCount = 0;
    for (const z of zones) {
      const list = await listDnsRecords(z.id, apiToken, lastDnsAt ?? undefined);
      if (list.length === 0) continue;
      const rows = list.map((r) => ({
        id: r.id,
        zone_id: z.id,
        zone_name: z.name,
        name: r.name,
        type: r.type,
        content: r.content,
        proxied: r.proxied ?? null,
        ttl: r.ttl ?? null,
        comment: r.comment ?? null,
        tags: r.tags ?? null,
        created_on: r.created_on ?? null,
        modified_on: r.modified_on ?? null,
        raw: r,
        synced_at: new Date().toISOString(),
      }));
      // chunk
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error } = await supabaseAdmin.from("cloudflare_dns_records").upsert(chunk, { onConflict: "id" });
        if (error) throw new Error(`upsert dns ${z.name}: ${error.message}`);
      }
      dnsCount += list.length;
    }

    // 3) FIREWALL EVENTS (per zone) — incremental
    // Cloudflare firewallEventsAdaptive limita janela a no máximo ~3 dias.
    const now = new Date();
    const maxWindowMs = 3 * 24 * 60 * 60 * 1000 - 5 * 60 * 1000; // 3d - 5min de folga
    const earliestAllowed = new Date(now.getTime() - maxWindowMs);
    const defaultSince = earliestAllowed;
    let sinceDate = lastEventsAt ? new Date(lastEventsAt) : defaultSince;
    if (sinceDate < earliestAllowed) sinceDate = earliestAllowed;
    const sinceIso = sinceDate.toISOString();
    const untilIso = now.toISOString();

    let eventsCount = 0;
    let maxEventTs: string | null = lastEventsAt;
    for (const z of zones) {
      let events: any[] = [];
      try {
        events = await fetchFirewallEvents(z.id, apiToken, sinceIso, untilIso);
      } catch (e) {
        await logApi("error", null, `firewall zona ${z.name}: ${(e as Error).message}`, Date.now() - t0);
        continue;
      }
      if (events.length === 0) continue;
      const rowsMap = new Map<string, any>();
      for (const e of events) {
        const dt = String(e.datetime ?? "");
        const baseId = `${z.id}:${e.rayName ?? e.ruleId ?? "x"}:${dt}:${e.clientIP ?? ""}:${e.clientRequestPath ?? ""}`;
        if (dt && (!maxEventTs || dt > maxEventTs)) maxEventTs = dt;
        let id = baseId;
        let n = 1;
        while (rowsMap.has(id)) {
          id = `${baseId}:${n++}`;
        }
        rowsMap.set(id, {
          id,
          zone_id: z.id,
          datetime: dt,
          action: String(e.action ?? ""),
          client_ip: String(e.clientIP ?? ""),
          country: String(e.clientCountryName ?? ""),
          host: String(e.clientRequestHTTPHost ?? ""),
          path: String(e.clientRequestPath ?? ""),
          method: String(e.clientRequestHTTPMethodName ?? "GET"),
          user_agent: String(e.userAgent ?? "").slice(0, 500),
          rule_id: String(e.ruleId ?? ""),
          raw: e,
          synced_at: new Date().toISOString(),
        });
      }
      const rows = Array.from(rowsMap.values());
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error } = await supabaseAdmin.from("cloudflare_firewall_events").upsert(chunk, { onConflict: "id" });
        if (error) throw new Error(`upsert fw ${z.name}: ${error.message}`);
      }
      eventsCount += rows.length;
    }

    // 4) SNAPSHOT agregado por zona (httpRequests1hGroups últimos 7d)
    for (const z of zones) {
      const sinceSnap = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const snapQuery = `query S($zone:String!,$since:Time!,$until:Time!){viewer{zones(filter:{zoneTag:$zone}){totals:httpRequests1hGroups(limit:1,filter:{datetime_geq:$since,datetime_leq:$until}){sum{requests cachedRequests threats bytes}uniq{uniques}}skip:firewallEventsAdaptiveGroups(limit:1,filter:{datetime_geq:$since,datetime_leq:$until,action:"skip"}){count}}}}`;
      try {
        const r = await fetch(GQL_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiToken}` },
          body: JSON.stringify({ query: snapQuery, variables: { zone: z.id, since: sinceSnap, until: untilIso } }),
        });
        const j: any = await r.json();
        const totalsRow = j?.data?.viewer?.zones?.[0]?.totals?.[0] ?? {};
        const skipRow = j?.data?.viewer?.zones?.[0]?.skip?.[0] ?? {};
        await supabaseAdmin.from("cloudflare_snapshots").insert({
          zone_id: z.id,
          range_days: 7,
          payload: {
            zone_name: z.name,
            totals: {
              requests: Number(totalsRow.sum?.requests ?? 0),
              mitigated: Number(totalsRow.sum?.threats ?? 0),
              cached: Number(totalsRow.sum?.cachedRequests ?? 0),
              bytes: Number(totalsRow.sum?.bytes ?? 0),
              uniqueIps: Number(totalsRow.uniq?.uniques ?? 0),
              skip: Number(skipRow.count ?? 0),
            },
          } as any,
        });
      } catch {
        /* ignore */
      }
    }

    // 5) STATE
    await supabaseAdmin.from("cloudflare_sync_state").upsert(
      {
        account_id: "default",
        last_zones_synced_at: new Date().toISOString(),
        last_dns_synced_at: new Date().toISOString(),
        last_events_at: maxEventTs ?? untilIso,
        last_full_sync_at: fullResync ? new Date().toISOString() : (stateRow?.last_full_sync_at ?? null),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id" },
    );

    await logApi("success", 200, `zones=${zones.length} dns=${dnsCount} fw=${eventsCount}`, Date.now() - t0);
    return { ok: true, zones: zones.length, dnsRecords: dnsCount, firewallEvents: eventsCount };
  } catch (e) {
    const msg = (e as Error).message;
    await logApi("error", null, msg, Date.now() - t0);
    return { ok: false, error: msg };
  }
}

// Purge cache + DNS create are called inline from server functions
export async function purgeCloudflareCache(
  zoneId: string,
  opts: { hostnames?: string[]; purgeEverything?: boolean },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const creds = await getCredentials();
  if ("ok" in creds && creds.ok === false) return creds;
  const body = opts.purgeEverything ? { purge_everything: true } : { hosts: opts.hostnames ?? [] };
  const r = await cfFetch(`/zones/${zoneId}/purge_cache`, (creds as Credentials).apiToken, {
    method: "POST",
    body: JSON.stringify(body),
  });
  if (!r.ok) return { ok: false, error: r.json?.errors?.[0]?.message ?? `HTTP ${r.status}` };
  return { ok: true };
}

export async function createCloudflareDnsRecord(
  zoneId: string,
  record: { type: string; name: string; content: string; ttl?: number; proxied?: boolean; comment?: string },
): Promise<{ ok: true; id: string; zoneName: string | null } | { ok: false; error: string }> {
  const creds = await getCredentials();
  if ("ok" in creds && creds.ok === false) return creds;
  const r = await cfFetch(`/zones/${zoneId}/dns_records`, (creds as Credentials).apiToken, {
    method: "POST",
    body: JSON.stringify(record),
  });
  if (!r.ok) return { ok: false, error: r.json?.errors?.[0]?.message ?? `HTTP ${r.status}` };
  const id = r.json?.result?.id ?? "";
  // also store locally
  const res = r.json?.result;
  if (res) {
    await supabaseAdmin.from("cloudflare_dns_records").upsert(
      {
        id: res.id,
        zone_id: zoneId,
        zone_name: res.zone_name ?? null,
        name: res.name,
        type: res.type,
        content: res.content,
        proxied: res.proxied ?? null,
        ttl: res.ttl ?? null,
        comment: res.comment ?? null,
        tags: res.tags ?? null,
        created_on: res.created_on ?? null,
        modified_on: res.modified_on ?? null,
        raw: res,
      },
      { onConflict: "id" },
    );
  }
  return { ok: true, id, zoneName: res?.zone_name ?? null };
}

export type DnsRecordSnapshot = {
  type: string;
  name: string;
  content: string;
  ttl: number | null;
  proxied: boolean | null;
  comment: string | null;
};

export async function updateCloudflareDnsRecord(
  zoneId: string,
  recordId: string,
  record: { type: string; name: string; content: string; ttl?: number; proxied?: boolean; comment?: string },
): Promise<
  | { ok: true; zoneName: string | null; previousContent: string; previousProxied: boolean | null; before: DnsRecordSnapshot }
  | { ok: false; error: string }
> {
  const creds = await getCredentials();
  if ("ok" in creds && creds.ok === false) return creds;

  // Busca o estado atual do registro antes de sobrescrever — usado pra
  // calcular exatamente o que mudou (diffObjects), não só "conteúdo anterior".
  const beforeRes = await cfFetch(`/zones/${zoneId}/dns_records/${recordId}`, (creds as Credentials).apiToken);
  if (!beforeRes.ok) return { ok: false, error: beforeRes.json?.errors?.[0]?.message ?? `HTTP ${beforeRes.status}` };
  const previousContent = String(beforeRes.json?.result?.content ?? "");
  const previousProxied = beforeRes.json?.result?.proxied ?? null;
  const before: DnsRecordSnapshot = {
    type: String(beforeRes.json?.result?.type ?? ""),
    name: String(beforeRes.json?.result?.name ?? ""),
    content: previousContent,
    ttl: beforeRes.json?.result?.ttl ?? null,
    proxied: previousProxied,
    comment: beforeRes.json?.result?.comment ?? null,
  };

  const r = await cfFetch(`/zones/${zoneId}/dns_records/${recordId}`, (creds as Credentials).apiToken, {
    method: "PUT",
    body: JSON.stringify(record),
  });
  if (!r.ok) return { ok: false, error: r.json?.errors?.[0]?.message ?? `HTTP ${r.status}` };
  const res = r.json?.result;
  if (res) {
    await supabaseAdmin.from("cloudflare_dns_records").upsert(
      {
        id: res.id,
        zone_id: zoneId,
        zone_name: res.zone_name ?? null,
        name: res.name,
        type: res.type,
        content: res.content,
        proxied: res.proxied ?? null,
        ttl: res.ttl ?? null,
        comment: res.comment ?? null,
        tags: res.tags ?? null,
        created_on: res.created_on ?? null,
        modified_on: res.modified_on ?? null,
        raw: res,
      },
      { onConflict: "id" },
    );
  }
  return { ok: true, zoneName: res?.zone_name ?? null, previousContent, previousProxied, before };
}

// ─── Notificação: novo registro DNS criado (e-mail p/ admins globais + Teams) ──
// Usa a config compartilhada do módulo "Alertar via Teams" (integrations/disponibilidade_alerts).
// Falhas de notificação nunca derrubam a criação do registro DNS.

async function getGlobalAdminEmails(): Promise<string[]> {
  const { data: roles } = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
  const ids = Array.from(new Set(((roles ?? []) as any[]).map((r) => r.user_id)));
  if (ids.length === 0) return [];
  const { data: profiles } = await supabaseAdmin.from("profiles").select("email").in("id", ids);
  return ((profiles ?? []) as any[])
    .map((p) =>
      String(p.email ?? "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
}

export async function notifyDnsRecordCreated(record: {
  zoneId: string;
  zoneName: string | null;
  type: string;
  name: string;
  content: string;
  proxied: boolean;
  createdByUserId: string | null;
}): Promise<void> {
  try {
    // A resposta da API da Cloudflare nem sempre traz zone_name — busca o nome
    // real da zona (ex.: bernoulli.com.br) na tabela sincronizada como fonte confiável.
    const { data: zoneRow } = await supabaseAdmin
      .from("cloudflare_zones")
      .select("name")
      .eq("id", record.zoneId)
      .maybeSingle();
    const zoneName: string = (zoneRow as any)?.name || record.zoneName || record.zoneId;

    let createdBy = "—";
    if (record.createdByUserId) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("email, full_name")
        .eq("id", record.createdByUserId)
        .maybeSingle();
      createdBy = (profile as any)?.full_name || (profile as any)?.email || "—";
    }

    // Teams (config do módulo "Alertar via Teams")
    const { data: integ } = await supabaseAdmin
      .from("integrations")
      .select("config, enabled")
      .eq("provider", "disponibilidade_alerts")
      .eq("name", "config")
      .maybeSingle();
    type TeamsCfg = { teams_enabled?: boolean; teams_webhook_url?: string | null };
    const teamsCfg = integ?.enabled ? ((integ.config as TeamsCfg) ?? null) : null;
    const dnsAlertEnabled = await isAlertModuleEnabled("cloudflare_dns_created");
    if (teamsCfg?.teams_enabled && teamsCfg.teams_webhook_url && dnsAlertEnabled) {
      const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
      await fetch(teamsCfg.teams_webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          "@type": "MessageCard",
          "@context": "http://schema.org/extensions",
          themeColor: "10B981",
          summary: `Novo registro DNS criado: ${record.name}`,
          sections: [
            {
              activityTitle: `🌐 ${APP_NAME} · Novo registro DNS criado`,
              activitySubtitle: now,
              facts: [
                { name: "Zona", value: zoneName },
                { name: "Tipo", value: record.type },
                { name: "Nome", value: record.name },
                { name: "Conteúdo", value: record.content },
                { name: "Proxy", value: record.proxied ? "Ativo" : "Desativado" },
                { name: "Criado por", value: createdBy },
              ],
              markdown: true,
            },
          ],
        }),
      }).catch(() => {});
    }

    // E-mail — somente admins globais
    const recipients = await getGlobalAdminEmails();
    if (recipients.length === 0) return;

    const { data: smtpCfg } = await supabaseAdmin.from("smtp_config").select("*").limit(1).maybeSingle();
    if (!smtpCfg?.host) return;
    const password = (smtpCfg as any).password || process.env.SMTP_PASSWORD;
    if (!password) return;

    const subject = `${APP_NAME} · Novo registro DNS criado em ${zoneName}`;
    const vars = {
      zona: zoneName,
      tipo: record.type,
      nome: record.name,
      conteudo: record.content,
      proxy: record.proxied ? "Ativo" : "Desativado",
      criado_por: createdBy,
      link: `${getAppBaseUrl()}/app/cloudflare-waf`,
    };
    const defaultHtml = buildDnsRecordCreatedHtml(vars);
    const override = await getEmailTemplateOverride(supabaseAdmin, "cloudflare_dns_created");
    const html = applyEmailTemplate("cloudflare_dns_created", override, vars, defaultHtml);

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
            from: { name: smtpCfg.from_name || APP_NAME, email: smtpCfg.from_email },
            to,
            subject,
            html,
          }),
        });
        const out: any = await res.json().catch(() => ({ ok: false }));
        await supabaseAdmin.from("email_logs").insert({
          to_email: to,
          subject,
          template: "cloudflare_dns_created",
          status: out.ok ? "success" : "error",
          error_message: out.ok ? null : String(out.error ?? `HTTP ${res.status}`),
        });
      } catch (e: any) {
        await supabaseAdmin.from("email_logs").insert({
          to_email: to,
          subject,
          template: "cloudflare_dns_created",
          status: "error",
          error_message: String(e?.message ?? e),
        });
      }
    }
  } catch {
    // notificações não bloqueiam a criação do registro DNS
  }
}

// ─── Notificação: registro DNS editado (e-mail p/ admins globais + Teams) ──────

export async function notifyDnsRecordUpdated(record: {
  zoneId: string;
  zoneName: string | null;
  type: string;
  name: string;
  previousContent: string;
  content: string;
  proxied: boolean;
  updatedByUserId: string | null;
  changes?: FieldChange[];
}): Promise<void> {
  try {
    const { data: zoneRow } = await supabaseAdmin
      .from("cloudflare_zones")
      .select("name")
      .eq("id", record.zoneId)
      .maybeSingle();
    const zoneName: string = (zoneRow as any)?.name || record.zoneName || record.zoneId;

    let updatedBy = "—";
    if (record.updatedByUserId) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("email, full_name")
        .eq("id", record.updatedByUserId)
        .maybeSingle();
      updatedBy = (profile as any)?.full_name || (profile as any)?.email || "—";
    }

    // Teams (config do módulo "Alertar via Teams")
    const { data: integ } = await supabaseAdmin
      .from("integrations")
      .select("config, enabled")
      .eq("provider", "disponibilidade_alerts")
      .eq("name", "config")
      .maybeSingle();
    type TeamsCfg = { teams_enabled?: boolean; teams_webhook_url?: string | null };
    const teamsCfg = integ?.enabled ? ((integ.config as TeamsCfg) ?? null) : null;
    const dnsAlertEnabled = await isAlertModuleEnabled("cloudflare_dns_updated");
    if (teamsCfg?.teams_enabled && teamsCfg.teams_webhook_url && dnsAlertEnabled) {
      const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
      await fetch(teamsCfg.teams_webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          "@type": "MessageCard",
          "@context": "http://schema.org/extensions",
          themeColor: "D97706",
          summary: `Registro DNS editado: ${record.name}`,
          sections: [
            {
              activityTitle: `✏️ ${APP_NAME} · Registro DNS editado`,
              activitySubtitle: now,
              facts: [
                { name: "Zona", value: zoneName },
                { name: "Tipo", value: record.type },
                { name: "Nome", value: record.name },
                // Conteúdo anterior/novo só aparece se o conteúdo realmente
                // mudou — mostrar sempre dava a entender que o CNAME/IP tinha
                // sido alterado mesmo quando só o proxy/TTL/comentário mudou.
                ...(record.previousContent !== record.content
                  ? [
                      { name: "Conteúdo anterior", value: record.previousContent },
                      { name: "Conteúdo novo", value: record.content },
                    ]
                  : []),
                { name: "Proxy", value: record.proxied ? "Ativo" : "Desativado" },
                { name: "Campos alterados", value: summarizeChanges(record.changes ?? []) },
                { name: "Editado por", value: updatedBy },
              ],
              markdown: true,
            },
          ],
        }),
      }).catch(() => {});
    }

    // E-mail — somente admins globais
    const recipients = await getGlobalAdminEmails();
    if (recipients.length === 0) return;

    const { data: smtpCfg } = await supabaseAdmin.from("smtp_config").select("*").limit(1).maybeSingle();
    if (!smtpCfg?.host) return;
    const password = (smtpCfg as any).password || process.env.SMTP_PASSWORD;
    if (!password) return;

    const subject = `${APP_NAME} · Registro DNS editado em ${zoneName}`;
    const vars = {
      zona: zoneName,
      tipo: record.type,
      nome: record.name,
      conteudo_anterior: record.previousContent,
      conteudo_novo: record.content,
      proxy: record.proxied ? "Ativo" : "Desativado",
      alteracoes: record.changes && record.changes.length > 0 ? summarizeChanges(record.changes) : "",
      editado_por: updatedBy,
      link: `${getAppBaseUrl()}/app/cloudflare-waf`,
    };
    const defaultHtml = buildDnsRecordUpdatedHtml({ ...vars, changes: record.changes });
    const override = await getEmailTemplateOverride(supabaseAdmin, "cloudflare_dns_updated");
    const html = applyEmailTemplate("cloudflare_dns_updated", override, vars, defaultHtml);

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
            from: { name: smtpCfg.from_name || APP_NAME, email: smtpCfg.from_email },
            to,
            subject,
            html,
          }),
        });
        const out: any = await res.json().catch(() => ({ ok: false }));
        await supabaseAdmin.from("email_logs").insert({
          to_email: to,
          subject,
          template: "cloudflare_dns_updated",
          status: out.ok ? "success" : "error",
          error_message: out.ok ? null : String(out.error ?? `HTTP ${res.status}`),
        });
      } catch (e: any) {
        await supabaseAdmin.from("email_logs").insert({
          to_email: to,
          subject,
          template: "cloudflare_dns_updated",
          status: "error",
          error_message: String(e?.message ?? e),
        });
      }
    }
  } catch {
    // notificações não bloqueiam a edição do registro DNS
  }
}

// ─── Notificação: regra de Rules alterada (editada/habilitada-desabilitada/
// excluída) — mesmo mecanismo (Teams + e-mail p/ admins globais) das
// notificações de DNS acima, com o template compartilhado buildRuleAlertHtml
// (evita repetir ~150 linhas de HTML por tipo de ação).
export async function notifyRuleChanged(args: {
  kind: "update" | "toggle" | "delete";
  zoneId: string;
  category: string;
  description: string;
  enabled?: boolean | null; // só usado em "toggle"
  actorUserId: string | null;
  changes?: FieldChange[]; // só relevante em "update"
}): Promise<void> {
  try {
    const { data: zoneRow } = await supabaseAdmin.from("cloudflare_zones").select("name").eq("id", args.zoneId).maybeSingle();
    const zoneName: string = (zoneRow as any)?.name || args.zoneId;

    let actorName = "—";
    if (args.actorUserId) {
      const { data: profile } = await supabaseAdmin
        .from("profiles")
        .select("email, full_name")
        .eq("id", args.actorUserId)
        .maybeSingle();
      actorName = (profile as any)?.full_name || (profile as any)?.email || "—";
    }

    const alertKey: "cloudflare_rule_updated" | "cloudflare_rule_toggled" | "cloudflare_rule_deleted" =
      args.kind === "update" ? "cloudflare_rule_updated" : args.kind === "toggle" ? "cloudflare_rule_toggled" : "cloudflare_rule_deleted";

    const presentation =
      args.kind === "update"
        ? {
            themeColor: "D97706",
            emoji: "✏️",
            title: "Regra de Rules editada",
            badge: "REGRA EDITADA",
            accentColor: "#d97706",
            accentBg: "#2d1a06",
            atorLabel: "EDITADO POR",
            atorLabelPt: "Editado por",
            atorColor: "#fdba74",
          }
        : args.kind === "toggle"
          ? {
              themeColor: args.enabled ? "10B981" : "6B7280",
              emoji: args.enabled ? "🟢" : "⚪",
              title: args.enabled ? "Regra de Rules habilitada" : "Regra de Rules desabilitada",
              badge: args.enabled ? "REGRA HABILITADA" : "REGRA DESABILITADA",
              accentColor: args.enabled ? "#059669" : "#6b7280",
              accentBg: args.enabled ? "#0a1f1a" : "#1f2937",
              atorLabel: "ALTERADO POR",
              atorLabelPt: "Alterado por",
              atorColor: args.enabled ? "#6ee7b7" : "#d1d5db",
            }
          : {
              themeColor: "EF4444",
              emoji: "🗑️",
              title: "Regra de Rules excluída",
              badge: "REGRA EXCLUÍDA",
              accentColor: "#dc2626",
              accentBg: "#2d0a0a",
              atorLabel: "EXCLUÍDO POR",
              atorLabelPt: "Excluído por",
              atorColor: "#fca5a5",
            };

    // Teams (config do módulo "Alertar via Teams")
    const { data: integ } = await supabaseAdmin
      .from("integrations")
      .select("config, enabled")
      .eq("provider", "disponibilidade_alerts")
      .eq("name", "config")
      .maybeSingle();
    type TeamsCfg = { teams_enabled?: boolean; teams_webhook_url?: string | null };
    const teamsCfg = integ?.enabled ? ((integ.config as TeamsCfg) ?? null) : null;
    const alertEnabled = await isAlertModuleEnabled(alertKey);
    if (teamsCfg?.teams_enabled && teamsCfg.teams_webhook_url && alertEnabled) {
      const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
      await fetch(teamsCfg.teams_webhook_url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          "@type": "MessageCard",
          "@context": "http://schema.org/extensions",
          themeColor: presentation.themeColor,
          summary: `${presentation.title}: ${args.description}`,
          sections: [
            {
              activityTitle: `${presentation.emoji} ${APP_NAME} · ${presentation.title}`,
              activitySubtitle: now,
              facts: [
                { name: "Zona", value: zoneName },
                { name: "Categoria", value: args.category },
                { name: "Descrição", value: args.description },
                ...(args.kind === "toggle" ? [{ name: "Novo status", value: args.enabled ? "Habilitada" : "Desabilitada" }] : []),
                ...(args.kind === "update" && args.changes && args.changes.length > 0
                  ? [{ name: "Campos alterados", value: summarizeChanges(args.changes) }]
                  : []),
                { name: presentation.atorLabelPt, value: actorName },
              ],
              markdown: true,
            },
          ],
        }),
      }).catch(() => {});
    }

    // Alerta desativado nesse módulo específico — não manda nem Teams nem e-mail.
    if (!alertEnabled) return;

    // E-mail — somente admins globais
    const recipients = await getGlobalAdminEmails();
    if (recipients.length === 0) return;

    const { data: smtpCfg } = await supabaseAdmin.from("smtp_config").select("*").limit(1).maybeSingle();
    if (!smtpCfg?.host) return;
    const password = (smtpCfg as any).password || process.env.SMTP_PASSWORD;
    if (!password) return;

    const link = `${getAppBaseUrl()}/app/cloudflare-waf`;
    const subject = `${APP_NAME} · ${presentation.title} em ${zoneName}`;
    const changesSummary = args.kind === "update" && args.changes && args.changes.length > 0 ? summarizeChanges(args.changes) : "";
    const vars: Record<string, string> =
      args.kind === "update"
        ? { zona: zoneName, categoria: args.category, descricao: args.description, alteracoes: changesSummary, editado_por: actorName, link }
        : args.kind === "toggle"
          ? {
              zona: zoneName,
              categoria: args.category,
              descricao: args.description,
              novo_status: args.enabled ? "Habilitada" : "Desabilitada",
              alterado_por: actorName,
              link,
            }
          : { zona: zoneName, categoria: args.category, descricao: args.description, excluido_por: actorName, link };

    const defaultHtml = buildRuleAlertHtml({
      badge: presentation.badge,
      heroTitle: presentation.title,
      accentColor: presentation.accentColor,
      accentBg: presentation.accentBg,
      zona: zoneName,
      categoria: args.category,
      descricao: args.description,
      extraFacts:
        args.kind === "toggle"
          ? [{ label: "NOVO STATUS", value: args.enabled ? "Habilitada" : "Desabilitada" }]
          : args.kind === "update" && changesSummary
            ? [{ label: "CAMPOS ALTERADOS", value: changesSummary }]
            : [],
      atorLabel: presentation.atorLabel,
      ator: actorName,
      atorColor: presentation.atorColor,
      link,
    });
    const override = await getEmailTemplateOverride(supabaseAdmin, alertKey);
    const html = applyEmailTemplate(alertKey, override, vars, defaultHtml);

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
            from: { name: smtpCfg.from_name || APP_NAME, email: smtpCfg.from_email },
            to,
            subject,
            html,
          }),
        });
        const out: any = await res.json().catch(() => ({ ok: false }));
        await supabaseAdmin.from("email_logs").insert({
          to_email: to,
          subject,
          template: alertKey,
          status: out.ok ? "success" : "error",
          error_message: out.ok ? null : String(out.error ?? `HTTP ${res.status}`),
        });
      } catch (e: any) {
        await supabaseAdmin.from("email_logs").insert({
          to_email: to,
          subject,
          template: alertKey,
          status: "error",
          error_message: String(e?.message ?? e),
        });
      }
    }
  } catch {
    // notificações não bloqueiam a alteração da regra
  }
}

// Sincronização incremental para uma única zona (DNS + firewall events + snapshot)
export async function runCloudflareZoneSync(
  zoneId: string,
  opts?: { fullResync?: boolean },
): Promise<CloudflareSyncResult> {
  const t0 = Date.now();
  const creds = await getCredentials();
  if ("ok" in creds && creds.ok === false) {
    await logApi("error", null, creds.error, Date.now() - t0);
    return creds;
  }
  const { apiToken } = creds as Credentials;
  const fullResync = opts?.fullResync === true;

  try {
    const { data: zoneRow, error: zoneErr } = await supabaseAdmin
      .from("cloudflare_zones")
      .select("id, name")
      .eq("id", zoneId)
      .maybeSingle();
    if (zoneErr) throw new Error(`zone lookup: ${zoneErr.message}`);
    if (!zoneRow) throw new Error(`Zona ${zoneId} não encontrada. Faça um sync global primeiro.`);
    const zName = zoneRow.name as string;

    const { data: stateRow } = await supabaseAdmin
      .from("cloudflare_sync_state")
      .select("*")
      .eq("account_id", "default")
      .eq("zone_id", zoneId)
      .maybeSingle();
    const lastEventsAt = fullResync ? null : (stateRow?.last_events_at ?? null);
    const lastDnsAt = fullResync ? null : (stateRow?.last_dns_synced_at ?? null);

    // DNS
    const dnsList = await listDnsRecords(zoneId, apiToken, lastDnsAt ?? undefined);
    let dnsCount = 0;
    if (dnsList.length > 0) {
      const rows = dnsList.map((r) => ({
        id: r.id,
        zone_id: zoneId,
        zone_name: zName,
        name: r.name,
        type: r.type,
        content: r.content,
        proxied: r.proxied ?? null,
        ttl: r.ttl ?? null,
        comment: r.comment ?? null,
        tags: r.tags ?? null,
        created_on: r.created_on ?? null,
        modified_on: r.modified_on ?? null,
        raw: r,
        synced_at: new Date().toISOString(),
      }));
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error } = await supabaseAdmin.from("cloudflare_dns_records").upsert(chunk, { onConflict: "id" });
        if (error) throw new Error(`upsert dns ${zName}: ${error.message}`);
      }
      dnsCount = dnsList.length;
    }

    // Firewall events — Cloudflare limita janela a no máximo ~3 dias.
    const now = new Date();
    const maxWindowMs = 3 * 24 * 60 * 60 * 1000 - 5 * 60 * 1000;
    const earliestAllowed = new Date(now.getTime() - maxWindowMs);
    let sinceDate = lastEventsAt ? new Date(lastEventsAt) : earliestAllowed;
    if (sinceDate < earliestAllowed) sinceDate = earliestAllowed;
    const sinceIso = sinceDate.toISOString();
    const untilIso = now.toISOString();
    const events = await fetchFirewallEvents(zoneId, apiToken, sinceIso, untilIso);

    let eventsCount = 0;
    let maxEventTs: string | null = lastEventsAt;
    if (events.length > 0) {
      const rowsMap = new Map<string, any>();
      for (const e of events) {
        const dt = String(e.datetime ?? "");
        const baseId = `${zoneId}:${e.rayName ?? e.ruleId ?? "x"}:${dt}:${e.clientIP ?? ""}:${e.clientRequestPath ?? ""}`;
        if (dt && (!maxEventTs || dt > maxEventTs)) maxEventTs = dt;
        let id = baseId;
        let n = 1;
        while (rowsMap.has(id)) id = `${baseId}:${n++}`;
        rowsMap.set(id, {
          id,
          zone_id: zoneId,
          datetime: dt,
          action: String(e.action ?? ""),
          client_ip: String(e.clientIP ?? ""),
          country: String(e.clientCountryName ?? ""),
          host: String(e.clientRequestHTTPHost ?? ""),
          path: String(e.clientRequestPath ?? ""),
          method: String(e.clientRequestHTTPMethodName ?? "GET"),
          user_agent: String(e.userAgent ?? "").slice(0, 500),
          rule_id: String(e.ruleId ?? ""),
          raw: e,
          synced_at: new Date().toISOString(),
        });
      }
      const rows = Array.from(rowsMap.values());
      for (let i = 0; i < rows.length; i += 500) {
        const chunk = rows.slice(i, i + 500);
        const { error } = await supabaseAdmin.from("cloudflare_firewall_events").upsert(chunk, { onConflict: "id" });
        if (error) throw new Error(`upsert fw ${zName}: ${error.message}`);
      }
      eventsCount = rows.length;
    }

    // Snapshot 7d
    try {
      const sinceSnap = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const snapQuery = `query S($zone:String!,$since:Time!,$until:Time!){viewer{zones(filter:{zoneTag:$zone}){totals:httpRequests1hGroups(limit:1,filter:{datetime_geq:$since,datetime_leq:$until}){sum{requests cachedRequests threats bytes}uniq{uniques}}skip:firewallEventsAdaptiveGroups(limit:1,filter:{datetime_geq:$since,datetime_leq:$until,action:"skip"}){count}}}}`;
      const r = await fetch(GQL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiToken}` },
        body: JSON.stringify({ query: snapQuery, variables: { zone: zoneId, since: sinceSnap, until: untilIso } }),
      });
      const j: any = await r.json();
      const totalsRow = j?.data?.viewer?.zones?.[0]?.totals?.[0] ?? {};
      const skipRow = j?.data?.viewer?.zones?.[0]?.skip?.[0] ?? {};
      await supabaseAdmin.from("cloudflare_snapshots").insert({
        zone_id: zoneId,
        range_days: 7,
        payload: {
          zone_name: zName,
          totals: {
            requests: Number(totalsRow.sum?.requests ?? 0),
            mitigated: Number(totalsRow.sum?.threats ?? 0),
            cached: Number(totalsRow.sum?.cachedRequests ?? 0),
            bytes: Number(totalsRow.sum?.bytes ?? 0),
            uniqueIps: Number(totalsRow.uniq?.uniques ?? 0),
            skip: Number(skipRow.count ?? 0),
          },
        } as any,
      });
    } catch {
      /* ignore */
    }

    await supabaseAdmin.from("cloudflare_sync_state").upsert(
      {
        account_id: "default",
        zone_id: zoneId,
        last_zones_synced_at: new Date().toISOString(),
        last_dns_synced_at: new Date().toISOString(),
        last_events_at: maxEventTs ?? untilIso,
        last_full_sync_at: fullResync ? new Date().toISOString() : (stateRow?.last_full_sync_at ?? null),
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id,zone_id" },
    );

    await logApi("success", 200, `zone=${zName} dns=${dnsCount} fw=${eventsCount}`, Date.now() - t0);
    return { ok: true, zones: 1, dnsRecords: dnsCount, firewallEvents: eventsCount };
  } catch (e) {
    const msg = (e as Error).message;
    await logApi("error", null, `zone ${zoneId}: ${msg}`, Date.now() - t0);
    return { ok: false, error: msg };
  }
}
