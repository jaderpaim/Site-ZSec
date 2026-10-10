// Server-only Sophos pipeline. Reused by both the user-triggered server fn
// and the public cron endpoint. NEVER import this from client code.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { ingestWebEventsFromSophos } from "./ia.server";
import { isAlertModuleEnabled } from "./alert-modules.functions";
import { APP_NAME } from "@/lib/brand";

const TOKEN_URL = "https://id.sophos.com/api/v2/oauth2/token";
const WHOAMI_URL = "https://api.central.sophos.com/whoami/v1";
// Sempre no host global (não no dataRegion), confirmado testando ao vivo
// com credenciais de tenant.
const LICENSES_URL = "https://api.central.sophos.com/licenses/v1/licenses";

// Mesma classificação que antes era feita via regex na RPC sophos_overview
// a cada carga do dashboard — pré-computada aqui na sincronização e
// persistida em sophos_events.detection_category, evitando reprocessar as
// ~320k linhas da tabela em toda chamada.
function classifyDetectionBlob(blob: string): string | null {
  if (/runtime|exploit|live protection|behaviour|behavior/.test(blob)) return "Detecções em tempo de execução";
  if (/(^|[^a-z])pua([^a-z]|$)|potentially unwanted|corepua/.test(blob)) return "PUA";
  if (/malware|virus|troj|worm|ransom|htmlgen|infected|ameaça/.test(blob)) return "Malwares";
  if (/encrypt|criptograf|denc|bitlocker|filevault|disknotencrypted/.test(blob)) return "Criptografia de Dispositivo";
  if (/application control|app control|appcontrol|aplicativo controlado/.test(blob)) return "Controle de Aplicativos";
  if (/policy violation|violação de política|compliance|redirecionou o bloco tag|alertado devido a tag/.test(blob))
    return "Violação de Política";
  if (/web threat|url threat|bloqueado devido a|htmlinj|web protection|web control/.test(blob))
    return "Controle da Web";
  if (
    /peripheral|periférico|device control|(^|[^a-z])usb([^a-z]|$)|removable storage|armazenamento removível|bluetooth|peripheralallowed|peripheralblocked|bloqueado devido ao controle de dispositivo/.test(
      blob,
    )
  )
    return "Controle de Periféricos";
  return null;
}

function normalizeUser(userName: string | null): string | null {
  if (!userName) return null;
  const stripped = userName.replace(/^[^\\]+\\/, "").trim();
  return stripped || null;
}

export type SophosCredentials = {
  clientId: string;
  clientSecret: string;
  tenantId?: string;
  dataRegionUrl?: string;
};

export type SyncResult = {
  ok: true;
  tenantId: string;
  dataRegion: string;
  counts: {
    endpoints: number;
    alerts: number;
    events: number;
    policies: number;
    iaEvents: number;
  };
};

async function getCredentials(): Promise<SophosCredentials | { ok: false; error: string }> {
  const { data, error } = await supabaseAdmin
    .from("integrations")
    .select("api_key, enabled, config")
    .eq("provider", "sophos")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  if (!data || !data.enabled) return { ok: false, error: "Integração Sophos não está ativa." };
  if (!data.api_key) return { ok: false, error: "Client Secret da Sophos não configurado." };
  const cfg = (data.config ?? {}) as Record<string, unknown>;
  const clientId = typeof cfg.client_id === "string" ? cfg.client_id.trim() : "";
  if (!clientId) return { ok: false, error: "Client ID da Sophos não configurado." };
  return {
    clientId,
    clientSecret: data.api_key,
    tenantId: typeof cfg.tenant_id === "string" ? cfg.tenant_id.trim() : "",
    dataRegionUrl: typeof cfg.data_region_url === "string" ? cfg.data_region_url.trim() : "",
  };
}

async function logApi(status: "success" | "error", httpStatus: number | null, message: string, ms: number) {
  try {
    await supabaseAdmin.from("api_logs").insert({
      provider: "sophos",
      status,
      http_status: httpStatus,
      message: message.slice(0, 500),
      duration_ms: ms,
    });
  } catch {
    /* ignore */
  }
}

export async function runSophosSync(opts?: {
  fullResync?: boolean;
  eventsOnly?: boolean;
}): Promise<SyncResult | { ok: false; error: string }> {
  const fullResync = opts?.fullResync === true;
  // eventsOnly: usado pelo botão "Sincronizar agora" do Ranking de IA — pula
  // endpoints/alerts/policies (irrelevantes para o ranking) e busca só os
  // eventos SIEM, que é o único dado de origem dos ia_web_events.
  const eventsOnly = opts?.eventsOnly === true;
  const t0 = Date.now();
  const creds = await getCredentials();
  if ("ok" in creds && creds.ok === false) {
    await logApi("error", null, creds.error, Date.now() - t0);
    return creds;
  }
  const c = creds as SophosCredentials;

  // 1) OAuth2
  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: c.clientId,
      client_secret: c.clientSecret,
      scope: "token",
    }),
  });
  if (!tokenRes.ok) {
    const msg = `Sophos OAuth ${tokenRes.status}: ${(await tokenRes.text()).slice(0, 200)}`;
    await logApi("error", tokenRes.status, msg, Date.now() - t0);
    return { ok: false, error: msg };
  }
  const accessToken = ((await tokenRes.json()) as { access_token?: string }).access_token;
  if (!accessToken) {
    await logApi("error", tokenRes.status, "Sem access_token", Date.now() - t0);
    return { ok: false, error: "Sophos não retornou access_token." };
  }

  // 2) whoami
  let tenantId = c.tenantId || "";
  let dataRegionUrl = c.dataRegionUrl || "";
  if (!tenantId || !dataRegionUrl) {
    const whoRes = await fetch(WHOAMI_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (!whoRes.ok) {
      const msg = `Sophos whoami ${whoRes.status}: ${(await whoRes.text()).slice(0, 200)}`;
      await logApi("error", whoRes.status, msg, Date.now() - t0);
      return { ok: false, error: msg };
    }
    const who = (await whoRes.json()) as { id?: string; idType?: string; apiHosts?: { dataRegion?: string } };
    if (who.idType && who.idType !== "tenant") {
      const msg = `Credencial Sophos é do tipo "${who.idType}". Use credenciais de Tenant.`;
      await logApi("error", whoRes.status, msg, Date.now() - t0);
      return { ok: false, error: msg };
    }
    tenantId = tenantId || who.id || "";
    dataRegionUrl = dataRegionUrl || who.apiHosts?.dataRegion || "";
    if (!tenantId || !dataRegionUrl) {
      await logApi("error", whoRes.status, "Sem tenant/dataRegion", Date.now() - t0);
      return { ok: false, error: "Não foi possível descobrir tenant/dataRegion." };
    }
  }

  const apiHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "X-Tenant-ID": tenantId,
    Accept: "application/json",
  };

  // Load incremental cursors from sync_state
  let lastAlertsRaisedAt: string | null = null;
  let lastEventsAt: string | null = null;
  if (!fullResync) {
    const { data: state } = await supabaseAdmin
      .from("sophos_sync_state")
      .select("last_alerts_raised_at, last_events_at")
      .eq("tenant_id", tenantId)
      .maybeSingle();
    lastAlertsRaisedAt = (state?.last_alerts_raised_at as string | null) ?? null;
    lastEventsAt = (state?.last_events_at as string | null) ?? null;
  }

  // Helper paginado
  async function fetchAllPages<T>(path: string, params: Record<string, string> = {}, maxPages = 100): Promise<T[]> {
    const items: T[] = [];
    let next: string | undefined = undefined;
    for (let i = 0; i < maxPages; i++) {
      const url = new URL(`${dataRegionUrl}${path}`);
      url.searchParams.set("pageSize", "100");
      Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
      if (next) url.searchParams.set("pageFromKey", next);
      const r = await fetch(url.toString(), { headers: apiHeaders });
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(`Sophos ${path} ${r.status}: ${txt.slice(0, 200)}`);
      }
      const j = (await r.json()) as { items?: T[]; pages?: { nextKey?: string } };
      items.push(...(j.items ?? []));
      next = j.pages?.nextKey;
      if (!next) break;
    }
    return items;
  }

  // 3) Endpoints
  type EpItem = {
    id: string;
    hostname?: string;
    type?: string;
    os?: { platform?: string; name?: string };
    health?: { overall?: string };
    online?: boolean;
    encryption?: {
      overallStatus?: string;
      volumes?: Array<{ status?: string }>;
    };

    lastSeenAt?: string;
    assignedProducts?: Array<{ code?: string; status?: string }>;
    associatedPerson?: { name?: string; viaLogin?: string };
  };
  let endpoints: EpItem[] = [];
  if (!eventsOnly) {
    try {
      endpoints = await fetchAllPages<EpItem>("/endpoint/v1/endpoints");
    } catch (e) {
      const msg = (e as Error).message;
      await logApi("error", null, msg, Date.now() - t0);
      return { ok: false, error: msg };
    }
  }

  // 3.5) Licenças (contratado x em uso, ex. Central Device Encryption) —
  // não crítico: se a chamada falhar, segue o sync normalmente.
  type LicenseItem = {
    id: string;
    licenseIdentifier?: string;
    product?: { code?: string; genericCode?: string; name?: string };
    type?: string;
    quantity?: number;
    perpetual?: boolean;
    unlimited?: boolean;
    startDate?: string;
    endDate?: string;
    usage?: { current?: { count?: number; date?: string } };
  };
  let licenses: LicenseItem[] = [];
  if (!eventsOnly) {
    try {
      const r = await fetch(LICENSES_URL, { headers: apiHeaders });
      if (r.ok) {
        const j = (await r.json()) as { licenses?: LicenseItem[] };
        licenses = j.licenses ?? [];
      } else {
        await logApi("error", r.status, `Sophos licenses ${r.status}: ${(await r.text()).slice(0, 200)}`, Date.now() - t0);
      }
    } catch (e) {
      await logApi("error", null, `Sophos licenses: ${(e as Error).message}`, Date.now() - t0);
    }
  }

  // 4) Alerts
  type AlertItem = {
    id: string;
    raisedAt?: string;
    severity?: string;
    category?: string;
    type?: string;
    description?: string;
    product?: string;
    managedAgent?: { name?: string };
    person?: { name?: string };
  };
  let alerts: AlertItem[] = [];
  if (!eventsOnly) {
    try {
      // Incremental: iterate desc and stop once raisedAt <= cursor
      const cursorTs = lastAlertsRaisedAt ? new Date(lastAlertsRaisedAt).getTime() : 0;
      const collected: AlertItem[] = [];
      let next: string | undefined = undefined;
      for (let i = 0; i < 200; i++) {
        const url = new URL(`${dataRegionUrl}/common/v1/alerts`);
        url.searchParams.set("pageSize", "100");
        url.searchParams.set("sort", "raisedAt:desc");
        if (next) url.searchParams.set("pageFromKey", next);
        const r = await fetch(url.toString(), { headers: apiHeaders });
        if (!r.ok) {
          const txt = await r.text();
          throw new Error(`Sophos /common/v1/alerts ${r.status}: ${txt.slice(0, 200)}`);
        }
        const j = (await r.json()) as { items?: AlertItem[]; pages?: { nextKey?: string } };
        const items = j.items ?? [];
        let reachedCursor = false;
        for (const it of items) {
          if (cursorTs && it.raisedAt && new Date(it.raisedAt).getTime() <= cursorTs) {
            reachedCursor = true;
            break;
          }
          collected.push(it);
        }
        next = j.pages?.nextKey;
        if (reachedCursor || !next) break;
      }
      alerts = collected;
    } catch (e) {
      const msg = (e as Error).message;
      await logApi("error", null, msg, Date.now() - t0);
      return { ok: false, error: msg };
    }
  }

  // 5) Events (SIEM) — incremental from cursor.
  // Sophos /siem/v1/events exige from_date dentro das últimas 24h.
  type EvItem = {
    id?: string;
    eventId?: string;
    when?: string;
    When?: string;
    Quando?: string;
    created_at?: string;
    severity?: string;
    Severity?: string;
    Severidade?: string;
    type?: string;
    name?: string;
    Event?: string;
    Evento?: string;
    endpoint_id?: string;
    endpoint_type?: string;
    location?: string;
    Device?: string;
    Dispositivo?: string;
    source?: string;
    source_info?: { ip?: string };
    user?: string;
    User?: string;
    Usuário?: string;
    user_id?: string;
    suser?: string;
  };
  let events: EvItem[] = [];
  // SIEM v1 limita from_date às últimas 24h. Margem de segurança 23h30m.
  const MAX_LOOKBACK_MS = 23 * 60 * 60 * 1000 + 30 * 60 * 1000;
  const earliestAllowed = Date.now() - MAX_LOOKBACK_MS;
  let sinceMs = lastEventsAt ? new Date(lastEventsAt).getTime() : Date.now() - MAX_LOOKBACK_MS;
  if (sinceMs < earliestAllowed) sinceMs = earliestAllowed;
  const isoMs = new Date(sinceMs).toISOString();
  const isoNoMs = isoMs.replace(/\.\d{3}Z$/, "Z");
  const epochSec = String(Math.floor(sinceMs / 1000));
  const fromCandidates = [isoMs, isoNoMs, epochSec];
  let workingFrom: string | null = null;
  for (const candidate of fromCandidates) {
    try {
      let cursor: string | undefined;
      const collected: EvItem[] = [];
      for (let i = 0; i < 200; i++) {
        const url = new URL(`${dataRegionUrl}/siem/v1/events`);
        url.searchParams.set("limit", "1000");
        if (!cursor) url.searchParams.set("from_date", candidate);
        if (cursor) url.searchParams.set("cursor", cursor);
        const r = await fetch(url.toString(), { headers: apiHeaders });
        if (!r.ok) {
          if (r.status === 403 || r.status === 404) {
            workingFrom = candidate;
            break;
          }
          const txt = await r.text();
          throw new Error(`Sophos /siem/v1/events ${r.status}: ${txt.slice(0, 200)}`);
        }
        const j = (await r.json()) as {
          items?: EvItem[];
          events?: EvItem[];
          next_cursor?: string;
          has_more?: boolean;
        };
        const batch = j.events ?? j.items ?? [];
        collected.push(...batch);
        cursor = j.next_cursor;
        workingFrom = candidate;
        if (!j.has_more || !cursor) break;
      }
      if (workingFrom === candidate) {
        events = collected;
        break;
      }
    } catch (e) {
      const msg = (e as Error).message;
      if (candidate === fromCandidates[fromCandidates.length - 1]) {
        await logApi("error", null, msg, Date.now() - t0);
      }
    }
  }

  // 6) Policies (endpoint + server) — real shape from Sophos:
  //   { id, name, type, appliesTo: { endpoints:[], users:[], computerGroups:[], serverGroups:[] } }
  type PolItem = {
    id: string;
    name?: string;
    type?: string;
    settings?: Record<string, unknown>;
    appliesTo?: {
      endpoints?: string[];
      users?: string[];
      computerGroups?: string[];
      serverGroups?: string[];
    };
  };
  const policiesRows: Array<{
    id: string;
    tenant_id: string;
    name: string | null;
    policy_type: string;
    assigned_count: number;
    raw: Record<string, unknown>;
    synced_at: string;
  }> = [];
  if (!eventsOnly) {
    for (const [path, kind] of [
      ["/endpoint/v1/policies", "endpoint"],
      ["/endpoint/v1/server-policies", "server"],
    ] as const) {
      try {
        const list = await fetchAllPages<PolItem>(path);
        for (const p of list) {
          const subKind = (p.type ?? "").toString();
          const at = p.appliesTo ?? {};
          const count =
            (Array.isArray(at.endpoints) ? at.endpoints.length : 0) +
            (Array.isArray(at.users) ? at.users.length : 0) +
            (Array.isArray(at.computerGroups) ? at.computerGroups.length : 0) +
            (Array.isArray(at.serverGroups) ? at.serverGroups.length : 0);
          policiesRows.push({
            id: p.id,
            tenant_id: tenantId,
            // Store the sub-kind as a marker the function-layer can split on
            name: subKind ? `${p.name ?? "Base Policy"}::${subKind}` : (p.name ?? null),
            policy_type: kind,
            assigned_count: count,
            raw: p as unknown as Record<string, unknown>,
            synced_at: new Date().toISOString(),
          });
        }
      } catch {
        // Algumas contas não têm permissão p/ policies — segue
      }
    }
  }

  // === UPSERTS ===
  const nowIso = new Date().toISOString();

  // Endpoints
  if (endpoints.length > 0) {
    const rows = endpoints.map((e) => {
      const overall = (e.encryption?.overallStatus ?? "").toLowerCase();
      const vols = e.encryption?.volumes ?? [];
      const isServerDevice = (e.type ?? "").toLowerCase() === "server";
      // Classificação alinhada ao Encryption Dashboard nativo da Sophos:
      //   true  → overallStatus = "encrypted" ou "encrypting" (já em andamento)
      //   false → "unmanaged"/"notEncrypted"/"suspended"/sem status (entram
      //           em "could be encrypted" no painel da Sophos)
      //   null  → servidor sem status de criptografia (não aparece no gráfico)
      const isEncryptedStatus = (s: string) => s === "encrypted" || s === "encrypting";
      let encryptedStatus: boolean | null;
      if (overall) {
        encryptedStatus = isEncryptedStatus(overall);
      } else if (vols.length > 0) {
        const statuses = vols.map((v) => (v.status ?? "").toLowerCase());
        encryptedStatus = statuses.every(isEncryptedStatus);
      } else if (isServerDevice) {
        encryptedStatus = null;
      } else {
        encryptedStatus = false;
      }

      return {
        id: e.id,
        tenant_id: tenantId,
        hostname: e.hostname ?? null,
        type: e.type ?? null, // "computer" | "server"
        os_platform: e.os?.platform ?? e.os?.name ?? null,
        health_overall: e.health?.overall ?? null,
        online: e.online ?? null,
        encrypted: encryptedStatus,
        last_seen_at: e.lastSeenAt ?? null,
        raw: e as unknown as Record<string, unknown>,
        synced_at: nowIso,
      };
    });
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await supabaseAdmin.from("sophos_endpoints").upsert(chunk as never, { onConflict: "id" });
      if (error) {
        await logApi("error", null, `upsert endpoints: ${error.message}`, Date.now() - t0);
        return { ok: false, error: error.message };
      }
    }

    // Reconciliação: /endpoint/v1/endpoints sempre retorna o inventário
    // completo e atual (sem paginação incremental), então qualquer id que
    // já está no banco mas não veio nesta busca foi removido/decomissionado
    // na Sophos. Sem isso, dispositivos antigos nunca saem do banco e
    // inflam o total e o bucket "Inativo 2+ Meses" para sempre.
    // select() sem .range() é limitado pelo max-rows padrão do PostgREST
    // (1000) — com ~1900 endpoints isso deixaria a comparação incompleta e
    // alguns fantasmas nunca seriam apagados, então paginamos a busca.
    const existingRows: Array<{ id: string }> = [];
    {
      let offset = 0;
      const pageSize = 1000;
      while (true) {
        const { data: page, error: existingError } = await supabaseAdmin
          .from("sophos_endpoints")
          .select("id")
          .eq("tenant_id", tenantId)
          .range(offset, offset + pageSize - 1);
        if (existingError || !page) break;
        existingRows.push(...page);
        if (page.length < pageSize) break;
        offset += pageSize;
      }
    }
    {
      const fetchedIds = new Set(endpoints.map((e) => e.id));
      const staleIds = existingRows.map((r) => r.id).filter((id) => !fetchedIds.has(id));
      for (let i = 0; i < staleIds.length; i += 500) {
        const chunk = staleIds.slice(i, i + 500);
        await supabaseAdmin.from("sophos_endpoints").delete().eq("tenant_id", tenantId).in("id", chunk);
      }
    }
  }

  // Licenças
  if (licenses.length > 0) {
    const licenseRows = licenses.map((l) => ({
      id: l.id,
      tenant_id: tenantId,
      license_identifier: l.licenseIdentifier ?? null,
      product_code: l.product?.code ?? null,
      product_generic_code: l.product?.genericCode ?? null,
      product_name: l.product?.name ?? null,
      license_type: l.type ?? null,
      quantity: l.quantity ?? null,
      usage_count: l.usage?.current?.count ?? null,
      usage_date: l.usage?.current?.date ?? null,
      start_date: l.startDate ?? null,
      end_date: l.endDate ?? null,
      perpetual: l.perpetual ?? null,
      unlimited: l.unlimited ?? null,
      raw: l as unknown as Record<string, unknown>,
      synced_at: nowIso,
    }));
    const { error } = await supabaseAdmin.from("sophos_licenses" as any).upsert(licenseRows as never, {
      onConflict: "id",
    });
    if (error) await logApi("error", null, `upsert licenses: ${error.message}`, Date.now() - t0);
  }

  // Alerts
  if (alerts.length > 0) {
    const rows = alerts.map((a) => ({
      id: a.id,
      tenant_id: tenantId,
      raised_at: a.raisedAt ?? null,
      severity: a.severity ?? null,
      category: a.category ?? null,
      type: a.type ?? null,
      description: a.description ?? null,
      product: a.product ?? null,
      managed_agent_name: a.managedAgent?.name ?? null,
      person_name: a.person?.name ?? null,
      raw: a as unknown as Record<string, unknown>,
      synced_at: nowIso,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await supabaseAdmin.from("sophos_alerts").upsert(chunk as never, { onConflict: "id" });
      if (error) {
        await logApi("error", null, `upsert alerts: ${error.message}`, Date.now() - t0);
        return { ok: false, error: error.message };
      }
    }
  }

  // Events
  let iaEventsCount = 0;
  if (events.length > 0) {
    const rows = events.map((e, idx) => {
      const eAny = e as unknown as Record<string, unknown>;
      const pick = (...keys: string[]): string | null => {
        for (const k of keys) {
          const v = eAny[k];
          if (typeof v === "string" && v.trim()) return v;
        }
        return null;
      };
      const when = pick("when", "When", "Quando", "created_at");
      const type = pick("type", "Event", "Evento");
      const name = pick("name", "Event", "Evento");
      // "source" ("DOMAIN\usuario") é onde a Sophos manda o usuário desde
      // que o campo "user" sumiu do payload do SIEM — sem isso,
      // user_normalized fica sempre null e o Top 10 Usuários com Ameaças
      // não encontra ninguém nos períodos recentes.
      const userName = pick("user", "User", "Usuário", "suser", "source");
      return {
        id: e.id ?? e.eventId ?? `${tenantId}-${when ?? ""}-${idx}`,
        tenant_id: tenantId,
        event_at: when,
        severity: pick("severity", "Severity", "Severidade"),
        type,
        name,
        endpoint_id: pick("endpoint_id"),
        endpoint_name: pick("location", "Device", "Dispositivo"),
        user_name: userName,
        source: pick("source"),
        raw: e as unknown as Record<string, unknown>,
        synced_at: nowIso,
        detection_category: classifyDetectionBlob(`${(type ?? "").toLowerCase()} ${(name ?? "").toLowerCase()}`),
        user_normalized: normalizeUser(userName),
      };
    });
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await supabaseAdmin.from("sophos_events").upsert(chunk as never, { onConflict: "id" });
      if (error) {
        await logApi("error", null, `upsert events: ${error.message}`, Date.now() - t0);
        return { ok: false, error: error.message };
      }
    }
    // Derive IA web-control rows for Ranking IA dashboard
    try {
      iaEventsCount = await ingestWebEventsFromSophos(rows as never);
    } catch (e) {
      await logApi("error", null, `ingest ia_web_events: ${(e as Error).message}`, Date.now() - t0);
    }
  }

  // Policies
  if (policiesRows.length > 0) {
    for (let i = 0; i < policiesRows.length; i += 500) {
      const chunk = policiesRows.slice(i, i + 500);
      const { error } = await supabaseAdmin.from("sophos_policies").upsert(chunk as never, { onConflict: "id" });
      if (error) {
        await logApi("error", null, `upsert policies: ${error.message}`, Date.now() - t0);
        return { ok: false, error: error.message };
      }
    }
  }

  // sync state — advance cursors based on what we just imported
  const maxAlertRaised = alerts.reduce<string | null>((acc, a) => {
    if (!a.raisedAt) return acc;
    return !acc || a.raisedAt > acc ? a.raisedAt : acc;
  }, lastAlertsRaisedAt);
  const maxEventAt = events.reduce<string | null>((acc, e) => {
    const t = e.when ?? e.created_at ?? null;
    if (!t) return acc;
    return !acc || t > acc ? t : acc;
  }, lastEventsAt);
  // Em eventsOnly, endpoints/alerts/policies não foram buscados — não marcar
  // esses cursores como sincronizados "agora" (ficariam enganosos no painel
  // Sophos XDR). `updated_at` sempre avança, e é o que o Ranking de IA usa
  // para exibir "Última sincronização".
  const syncStateUpdate: Record<string, unknown> = {
    tenant_id: tenantId,
    last_events_at: maxEventAt,
    updated_at: nowIso,
  };
  if (!eventsOnly) {
    syncStateUpdate.last_full_sync_at = nowIso;
    syncStateUpdate.last_alerts_raised_at = maxAlertRaised;
    syncStateUpdate.last_endpoints_synced_at = nowIso;
    syncStateUpdate.last_policies_synced_at = nowIso;
  }
  await supabaseAdmin.from("sophos_sync_state").upsert(syncStateUpdate as never, { onConflict: "tenant_id" });

  const counts = {
    endpoints: endpoints.length,
    alerts: alerts.length,
    events: events.length,
    policies: policiesRows.length,
    iaEvents: iaEventsCount,
  };
  await logApi(
    "success",
    200,
    `sync: ${counts.endpoints} ep / ${counts.alerts} alerts / ${counts.events} ev / ${counts.policies} pol`,
    Date.now() - t0,
  );

  return { ok: true, tenantId, dataRegion: dataRegionUrl, counts };
}

// ── Audit Log — notificação Teams ──────────────────────────────────────────
// "create, delete, update (≈ modified), live response (LIVE_TERMINAL)"
function matchesAuditAlert(description: string): boolean {
  const d = description.toUpperCase();
  return d.includes("CREATE") || d.includes("DELETE") || d.includes("UPDATE") || d.includes("LIVE_TERMINAL");
}

async function notifySophosAuditTeams(
  matched: Array<{ occurredAt: string | null; modifiedBy: string | null; description: string | null }>,
): Promise<void> {
  try {
    if (!(await isAlertModuleEnabled("sophos_audit_alert"))) return;
    const { data: integ } = await supabaseAdmin
      .from("integrations")
      .select("config, enabled")
      .eq("provider", "disponibilidade_alerts")
      .eq("name", "config")
      .maybeSingle();
    type Cfg = { teams_enabled?: boolean; teams_webhook_url?: string | null };
    const cfg = integ?.enabled ? (integ.config as Cfg) : null;
    if (!cfg?.teams_enabled || !cfg.teams_webhook_url) return;

    const now = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
    const facts = matched.map((e) => {
      const dt = e.occurredAt ? new Date(e.occurredAt).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" }) : "—";
      return { name: e.description ?? "—", value: `${dt} · por ${e.modifiedBy ?? "—"}` };
    });

    await fetch(cfg.teams_webhook_url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        "@type": "MessageCard",
        "@context": "http://schema.org/extensions",
        themeColor: "A78BFA",
        summary: `Sophos Auditoria: ${matched.length} evento(s) sensível(eis)`,
        sections: [
          {
            activityTitle: `🛡️ ${APP_NAME} · Sophos Auditoria`,
            activitySubtitle: now,
            facts,
            markdown: true,
          },
        ],
      }),
    }).catch(() => {});
  } catch {
    /* notificação nunca derruba o sync */
  }
}

// ── Audit Log (ações administrativas) ──────────────────────────────────────
// Usa uma credencial separada (role "Service Principal Audit Log" no Sophos
// Central) e o host GLOBAL (api.central.sophos.com), não o dataRegion usado
// pelo sync principal — por isso fica isolado em sua própria função/hook/cron.
export type AuditSyncResult = { ok: true; tenantId: string; count: number };

async function getAuditCredentials(): Promise<SophosCredentials | { ok: false; error: string }> {
  const { data, error } = await supabaseAdmin
    .from("integrations")
    .select("config")
    .eq("provider", "sophos")
    .maybeSingle();
  if (error) return { ok: false, error: error.message };
  // Sincronização de Auditoria é independente da aba SIEM — usa seu próprio
  // toggle (config.audit_enabled), não o "enabled" geral da integração.
  if (!data) return { ok: false, error: "Integração Sophos não configurada." };
  const cfg = (data.config ?? {}) as Record<string, unknown>;
  if (cfg.audit_enabled !== true) return { ok: false, error: "Sincronização de Auditoria da Sophos não está ativa." };
  const clientId = typeof cfg.audit_client_id === "string" ? cfg.audit_client_id.trim() : "";
  const clientSecret = typeof cfg.audit_client_secret === "string" ? cfg.audit_client_secret.trim() : "";
  if (!clientId || !clientSecret) return { ok: false, error: "Credencial de Audit Log da Sophos não configurada." };
  return { clientId, clientSecret };
}

export async function runSophosAuditSync(): Promise<AuditSyncResult | { ok: false; error: string }> {
  const t0 = Date.now();
  const creds = await getAuditCredentials();
  if ("ok" in creds && creds.ok === false) {
    await logApi("error", null, creds.error, Date.now() - t0);
    return creds;
  }
  const c = creds as SophosCredentials;

  const tokenRes = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: c.clientId,
      client_secret: c.clientSecret,
      scope: "token",
    }),
  });
  if (!tokenRes.ok) {
    const msg = `Sophos Audit OAuth ${tokenRes.status}: ${(await tokenRes.text()).slice(0, 200)}`;
    await logApi("error", tokenRes.status, msg, Date.now() - t0);
    return { ok: false, error: msg };
  }
  const accessToken = ((await tokenRes.json()) as { access_token?: string }).access_token;
  if (!accessToken) {
    await logApi("error", tokenRes.status, "Sem access_token (audit)", Date.now() - t0);
    return { ok: false, error: "Sophos não retornou access_token (audit)." };
  }

  const whoRes = await fetch(WHOAMI_URL, { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!whoRes.ok) {
    const msg = `Sophos whoami (audit) ${whoRes.status}: ${(await whoRes.text()).slice(0, 200)}`;
    await logApi("error", whoRes.status, msg, Date.now() - t0);
    return { ok: false, error: msg };
  }
  const who = (await whoRes.json()) as { id?: string; apiHosts?: { global?: string } };
  const tenantId = who.id ?? "";
  const globalHost = who.apiHosts?.global ?? "https://api.central.sophos.com";
  if (!tenantId) {
    await logApi("error", whoRes.status, "Sem tenantId (audit)", Date.now() - t0);
    return { ok: false, error: "Não foi possível descobrir o tenant (audit)." };
  }

  const apiHeaders = {
    Authorization: `Bearer ${accessToken}`,
    "X-Tenant-ID": tenantId,
    Accept: "application/json",
  };

  // Janela incremental: desde o último sync, com fallback de 30 dias na primeira vez
  const { data: state } = await supabaseAdmin
    .from("sophos_sync_state")
    .select("last_audit_synced_at")
    .eq("tenant_id", tenantId)
    .maybeSingle();
  const now = new Date();
  const fallbackStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const startDate = (state?.last_audit_synced_at as string | null) ?? fallbackStart.toISOString();

  type AuditItem = {
    id: string;
    occurredAt?: string;
    modifiedBy?: string;
    itemType?: string | null;
    itemModified?: string | null;
    description?: string;
    originIpAddress?: string | null;
    resourceOwnerId?: string;
    resourceOwnerType?: string;
    modifierType?: string;
    modifierAccountId?: string;
    modifierAccountType?: string;
  };

  const items: AuditItem[] = [];
  let nextKey: string | undefined;
  for (let i = 0; i < 100; i++) {
    const url = new URL(`${globalHost}/audit/v1/audit-events`);
    url.searchParams.set("startDate", startDate);
    url.searchParams.set("endDate", now.toISOString());
    url.searchParams.set("pageSize", "500");
    if (nextKey) url.searchParams.set("pageFromKey", nextKey);
    const r = await fetch(url.toString(), { headers: apiHeaders });
    if (!r.ok) {
      const txt = await r.text();
      const msg = `Sophos audit-events ${r.status}: ${txt.slice(0, 200)}`;
      await logApi("error", r.status, msg, Date.now() - t0);
      return { ok: false, error: msg };
    }
    const j = (await r.json()) as { items?: AuditItem[]; pages?: { nextKey?: string } };
    items.push(...(j.items ?? []));
    nextKey = j.pages?.nextKey;
    if (!nextKey) break;
  }

  if (items.length > 0) {
    const nowIso = now.toISOString();
    const rows = items.map((it) => ({
      id: it.id,
      tenant_id: tenantId,
      occurred_at: it.occurredAt ?? null,
      modified_by: it.modifiedBy ?? null,
      item_type: it.itemType ?? null,
      item_modified: it.itemModified ?? null,
      description: it.description ?? null,
      origin_ip_address: it.originIpAddress ?? null,
      resource_owner_id: it.resourceOwnerId ?? null,
      resource_owner_type: it.resourceOwnerType ?? null,
      modifier_type: it.modifierType ?? null,
      modifier_account_id: it.modifierAccountId ?? null,
      modifier_account_type: it.modifierAccountType ?? null,
      raw: it as unknown as Record<string, unknown>,
      synced_at: nowIso,
    }));
    for (let i = 0; i < rows.length; i += 500) {
      const chunk = rows.slice(i, i + 500);
      const { error } = await supabaseAdmin.from("sophos_audit_events").upsert(chunk as never, { onConflict: "id" });
      if (error) {
        await logApi("error", null, `upsert audit events: ${error.message}`, Date.now() - t0);
        return { ok: false, error: error.message };
      }
    }
  }

  await supabaseAdmin
    .from("sophos_sync_state")
    .upsert({ tenant_id: tenantId, last_audit_synced_at: now.toISOString() } as never, { onConflict: "tenant_id" });

  // Notifica via Teams para eventos sensíveis (create, delete, update, live response)
  const alertItems = items.filter((it) => matchesAuditAlert(it.description ?? ""));
  if (alertItems.length > 0) {
    await notifySophosAuditTeams(
      alertItems.map((it) => ({
        occurredAt: it.occurredAt ?? null,
        modifiedBy: it.modifiedBy ?? null,
        description: it.description ?? null,
      })),
    );
  }

  await logApi("success", 200, `audit sync: ${items.length} eventos (${alertItems.length} alertas)`, Date.now() - t0);
  return { ok: true, tenantId, count: items.length };
}
