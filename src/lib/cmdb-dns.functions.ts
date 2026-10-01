import { createServerFn } from "@tanstack/react-start";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { requirePermission } from "@/lib/authz";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type CmdbDnsEntry = {
  ip: string;
  hostname: string | null;
  resolved: boolean;
  reason: "no_ptr" | "timeout" | null;
};

// Lê do cache (sem chamar o scanner) — seguro para cmdb:view. Refresh real
// acontece só via cron hook cmdb-dns-cache-refresh (evita bater no DAST a
// cada carregamento de tela).
export const getCmdbDnsCache = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .handler(async ({ context }): Promise<CmdbDnsEntry[]> => {
    await requirePermission(context.supabase, context.userId, "cmdb", "view");
    const { data } = await supabaseAdmin.from("cmdb_dns_cache").select("ip, hostname, resolved, reason");
    return (data ?? []) as CmdbDnsEntry[];
  });

// Dispara o refresh na hora (bate no scanner DAST pra cada IP) — restrito a
// administradores globais, já que faz N chamadas reais ao /resolve. Grava
// evidência em cron_job_runs (trigger "manual") pro painel de Logs refletir
// esse disparo mesmo fora do horário do cron — mesmo padrão do
// runCmdbDeviceAlertsNow ("Enviar alerta agora").
export const refreshCmdbDnsCacheNow = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", {
      _user_id: context.userId,
      _role: "admin",
    });
    if (!isAdmin) throw new Error("Apenas administradores podem atualizar o cache DNS manualmente.");

    const { recordCronRun } = await import("@/lib/cron-tracking.server");
    const started = Date.now();
    try {
      const { refreshCmdbDnsCache } = await import("@/lib/cmdb-dns.server");
      const result = await refreshCmdbDnsCache();
      await recordCronRun("cmdb-dns-cache-refresh", "manual", {
        ok: result.ok,
        error: result.error,
        durationMs: Date.now() - started,
      });
      return result;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      await recordCronRun("cmdb-dns-cache-refresh", "manual", {
        ok: false,
        error: msg,
        durationMs: Date.now() - started,
      });
      throw e;
    }
  });
