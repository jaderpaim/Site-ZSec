import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { MonitoringSources } from "@/lib/monitoring";

const PROVIDER: Record<keyof MonitoringSources, string> = { siem: "qradar", zabbix: "zabbix" };

/** Quais fontes de cobertura estão ligadas e com credencial (ver monitoring.ts). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadMonitoringSources(sb: any = supabaseAdmin): Promise<MonitoringSources> {
  const { data } = await sb
    .from("integrations")
    .select("provider, enabled, api_key, base_url")
    .in("provider", Object.values(PROVIDER));
  const on = (provider: string) =>
    (data ?? []).some(
      (r: {
        provider: string;
        enabled: boolean;
        api_key: string | null;
        base_url: string | null;
      }) => r.provider === provider && r.enabled && !!r.api_key && !!r.base_url,
    );
  return { siem: on(PROVIDER.siem), zabbix: on(PROVIDER.zabbix) };
}
