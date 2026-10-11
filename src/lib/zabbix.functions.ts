import { createServerFn } from "@tanstack/react-start";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { requirePermission } from "@/lib/authz";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type ZabbixMonitoredResult = {
  hosts: string[]; // disponíveis (available=1): nomes/hostnames lowercased
  ips: string[]; // disponíveis (available=1): IPs lowercased
  unknownHosts: string[]; // no Zabbix mas sem confirmação (available=0 ou 2)
  unknownIps: string[];
  ipToHost: Record<string, string[]>; // IP (lowercased) -> hostname(s) técnico(s) do Zabbix
  error?: string;
};

function buildSets(list: Array<{ host?: string; name?: string; interfaces?: Array<{ ip?: string; dns?: string }> }>) {
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

export const listZabbixMonitoredHosts = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .handler(async ({ context }): Promise<ZabbixMonitoredResult> => {
    const { requireAdminOrAnalista } = await import("@/lib/authz");
    await requireAdminOrAnalista(context.supabase, context.userId);
    const t0 = Date.now();

    const { getZabbixCreds, listMonitoredHosts, buildIpToHostMap, logZabbixApi } = await import("./zabbix.server");
    try {
      const creds = await getZabbixCreds();
      if (!creds) {
        // Integração ausente/desligada não é falha de API: não vai pro log.
        return { hosts: [], ips: [], unknownHosts: [], unknownIps: [], ipToHost: {}, error: "Zabbix não configurado" };
      }
      const { available, unknown } = await listMonitoredHosts(creds);
      const avail = buildSets(available);
      const unk = buildSets(unknown);
      return {
        hosts: [...avail.hostSet],
        ips: [...avail.ipSet],
        unknownHosts: [...unk.hostSet],
        unknownIps: [...unk.ipSet],
        ipToHost: buildIpToHostMap([...available, ...unknown]),
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // zabbixRpc já registra falhas de chamada em api_logs; evita log duplicado
      if (!msg.startsWith("Zabbix ")) {
        await logZabbixApi("error", null, msg, Date.now() - t0);
      }
      return { hosts: [], ips: [], unknownHosts: [], unknownIps: [], ipToHost: {}, error: msg };
    }
  });

// Chama API Zabbix em tempo real, salva resultado no cache como efeito colateral.
// Usar quando o usuário tem permissão de editar CMDB (admin/module-admin).
export const getZabbixLiveHosts = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .handler(async ({ context }): Promise<ZabbixMonitoredResult> => {
    await requirePermission(context.supabase, context.userId, "cmdb", "edit");
    const t0 = Date.now();
    const { getZabbixCreds, listMonitoredHosts, buildIpToHostMap, logZabbixApi } = await import("./zabbix.server");
    try {
      const creds = await getZabbixCreds();
      if (!creds) {
        // Integração ausente/desligada não é falha de API: não vai pro log.
        return { hosts: [], ips: [], unknownHosts: [], unknownIps: [], ipToHost: {}, error: "Zabbix não configurado" };
      }
      const { available, unknown } = await listMonitoredHosts(creds);
      const avail = buildSets(available);
      const unk = buildSets(unknown);
      const result: ZabbixMonitoredResult = {
        hosts: [...avail.hostSet],
        ips: [...avail.ipSet],
        unknownHosts: [...unk.hostSet],
        unknownIps: [...unk.ipSet],
        ipToHost: buildIpToHostMap([...available, ...unknown]),
      };
      // Atualiza cache em background para que visualizadores vejam dado fresco
      (supabaseAdmin as any)
        .from("zabbix_hosts_cache")
        .update({
          hosts: result.hosts,
          ips: result.ips,
          unknown_hosts: result.unknownHosts,
          unknown_ips: result.unknownIps,
          ip_to_host: result.ipToHost,
          synced_at: new Date().toISOString(),
          error: null,
        })
        .eq("id", "singleton")
        .then(() => {});
      return result;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.startsWith("Zabbix ")) {
        await logZabbixApi("error", null, msg, Date.now() - t0);
      }
      return { hosts: [], ips: [], unknownHosts: [], unknownIps: [], ipToHost: {}, error: msg };
    }
  });

// Lê do cache (sem chamada Zabbix) — seguro para cmdb:view
export const getZabbixCachedHosts = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .handler(async ({ context }): Promise<ZabbixMonitoredResult> => {
    await requirePermission(context.supabase, context.userId, "cmdb", "view");
    const { data } = await (supabaseAdmin as any)
      .from("zabbix_hosts_cache")
      .select("hosts, ips, unknown_hosts, unknown_ips, ip_to_host, error")
      .eq("id", "singleton")
      .maybeSingle();
    return {
      hosts: data?.hosts ?? [],
      ips: data?.ips ?? [],
      unknownHosts: data?.unknown_hosts ?? [],
      unknownIps: data?.unknown_ips ?? [],
      ipToHost: data?.ip_to_host ?? {},
      error: data?.error ?? undefined,
    };
  });

// Força refresh do cache chamando a API Zabbix (admin-only)
export const refreshZabbixHostsCacheFn = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    const { requireAdminOrAnalista } = await import("@/lib/authz");
    await requireAdminOrAnalista(context.supabase, context.userId);
    const { refreshZabbixHostsCache } = await import("@/lib/zabbix.server");
    return refreshZabbixHostsCache();
  });
