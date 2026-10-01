// Server-only Zabbix API client. Reads credentials from `integrations` table.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ZabbixCreds = { baseUrl: string; apiKey: string };

export async function logZabbixApi(
  status: "success" | "error",
  httpStatus: number | null,
  message: string,
  ms: number,
) {
  try {
    await supabaseAdmin.from("api_logs").insert({
      provider: "zabbix",
      status,
      http_status: httpStatus,
      message: message.slice(0, 500),
      duration_ms: ms,
    });
  } catch {
    /* ignore */
  }
}

export async function getZabbixCreds(): Promise<ZabbixCreds | null> {
  const { data } = await supabaseAdmin
    .from("integrations")
    .select("base_url, api_key, enabled")
    .eq("provider", "zabbix")
    .maybeSingle();
  if (!data?.enabled || !data?.api_key || !data?.base_url) return null;
  return { baseUrl: data.base_url.replace(/\/+$/, ""), apiKey: data.api_key.trim() };
}

type RpcResp<T> = { result?: T; error?: { code: number; message: string; data?: string } };

export async function zabbixRpc<T>(creds: ZabbixCreds, method: string, params: Record<string, unknown>): Promise<T> {
  const started = Date.now();
  // Timeout explícito de 25s para evitar hang no Cloudflare Tunnel (limite ~30s)
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 25_000);
  try {
    const res = await fetch(creds.baseUrl, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        ...(process.env.CF_ACCESS_CLIENT_ID ? { "CF-Access-Client-Id": process.env.CF_ACCESS_CLIENT_ID } : {}),
        ...(process.env.CF_ACCESS_CLIENT_SECRET
          ? { "CF-Access-Client-Secret": process.env.CF_ACCESS_CLIENT_SECRET }
          : {}),
      },
      // Zabbix rejeita o header Authorization: Bearer com "Invalid API key" — autenticação via "auth" no body
      body: JSON.stringify({ jsonrpc: "2.0", method, params, auth: creds.apiKey, id: 1 }),
    });
    const duration = Date.now() - started;
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      await logZabbixApi("error", res.status, `${method} — ${text.slice(0, 200)}`, duration);
      throw new Error(`Zabbix HTTP ${res.status}`);
    }
    const json = (await res.json()) as RpcResp<T>;
    if (json.error) {
      await logZabbixApi("error", res.status, `${method} — RPC ${json.error.code}: ${json.error.message}`, duration);
      throw new Error(`Zabbix RPC ${json.error.code}: ${json.error.message}`);
    }
    await logZabbixApi("success", res.status, method, duration);
    return json.result as T;
  } catch (e) {
    const duration = Date.now() - started;
    const msg = (e as Error).message ?? String(e);
    if (!msg.startsWith("Zabbix ")) {
      await logZabbixApi("error", null, `${method} — ${msg.slice(0, 200)}`, duration);
    }
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export type ZabbixHost = {
  hostid: string;
  host: string;
  name: string;
  status: string; // "0" monitored, "1" not monitored
  available?: string;
  active_available?: string;
  interfaces?: Array<{ ip?: string; dns?: string; available?: string }>;
};

export type MonitoredHostsResult = {
  available: ZabbixHost[];
  unknown: ZabbixHost[];
};

function buildSets(list: ZabbixHost[]) {
  const hostSet = new Set<string>();
  const ipSet = new Set<string>();
  for (const h of list) {
    if (h.host) hostSet.add(h.host.trim().toLowerCase());
    if (h.name) hostSet.add(h.name.trim().toLowerCase());
    for (const i of h.interfaces ?? []) {
      if (i.ip) ipSet.add(i.ip.trim().toLowerCase());
      if (i.dns) hostSet.add(i.dns.trim().toLowerCase());
    }
  }
  return { hostSet, ipSet };
}

// Mapa IP -> hostname(s) técnico(s) do Zabbix (campo "host"), usado para detectar
// divergência entre o hostname cadastrado no CMDB e o que o Zabbix reporta pro mesmo IP.
export function buildIpToHostMap(list: ZabbixHost[]): Record<string, string[]> {
  const map: Record<string, Set<string>> = {};
  for (const h of list) {
    const host = h.host?.trim();
    if (!host) continue;
    for (const i of h.interfaces ?? []) {
      if (!i.ip) continue;
      const ip = i.ip.trim().toLowerCase();
      (map[ip] ??= new Set()).add(host);
    }
  }
  const result: Record<string, string[]> = {};
  for (const [ip, set] of Object.entries(map)) result[ip] = [...set];
  return result;
}

export async function refreshZabbixHostsCache(): Promise<{ ok: boolean; error?: string }> {
  const t0 = Date.now();
  try {
    const creds = await getZabbixCreds();
    if (!creds) {
      await (supabaseAdmin as any)
        .from("zabbix_hosts_cache")
        .update({
          hosts: [],
          ips: [],
          unknown_hosts: [],
          unknown_ips: [],
          synced_at: new Date().toISOString(),
          error: "Zabbix não configurado ou desabilitado",
        })
        .eq("id", "singleton");
      return { ok: false, error: "Zabbix não configurado" };
    }
    const { available, unknown } = await listMonitoredHosts(creds);
    const avail = buildSets(available);
    const unk = buildSets(unknown);
    const ipToHost = buildIpToHostMap([...available, ...unknown]);
    await (supabaseAdmin as any)
      .from("zabbix_hosts_cache")
      .update({
        hosts: [...avail.hostSet],
        ips: [...avail.ipSet],
        unknown_hosts: [...unk.hostSet],
        unknown_ips: [...unk.ipSet],
        ip_to_host: ipToHost,
        synced_at: new Date().toISOString(),
        error: null,
      })
      .eq("id", "singleton");
    await logZabbixApi(
      "success",
      null,
      `cache-refresh — ${available.length} available, ${unknown.length} unknown`,
      Date.now() - t0,
    );
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await (supabaseAdmin as any)
      .from("zabbix_hosts_cache")
      .update({
        synced_at: new Date().toISOString(),
        error: msg,
      })
      .eq("id", "singleton");
    return { ok: false, error: msg };
  }
}

export async function listMonitoredHosts(creds: ZabbixCreds): Promise<MonitoredHostsResult> {
  const hosts = await zabbixRpc<ZabbixHost[]>(creds, "host.get", {
    output: ["hostid", "host", "name", "status", "active_available"],
    selectInterfaces: ["ip", "dns", "available"],
    filter: { status: "0" }, // apenas hosts habilitados no Zabbix
  });

  const available: ZabbixHost[] = [];
  const unknown: ZabbixHost[] = [];

  for (const h of hosts) {
    const isAvailable = h.active_available === "1" || (h.interfaces ?? []).some((i) => i.available === "1");
    if (isAvailable) {
      available.push(h);
    } else {
      // available=0 (Unknown) ou available=2 (Unavailable): host está no Zabbix mas sem confirmação
      // separado para evitar falso positivo vs host completamente ausente do Zabbix
      unknown.push(h);
    }
  }

  return { available, unknown };
}
