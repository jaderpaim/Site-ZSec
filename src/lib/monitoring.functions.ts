import { createServerFn } from "@tanstack/react-start";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import type { MonitoringSources } from "@/lib/monitoring";

// Só diz quais fontes estão ligadas (dois booleanos) — sem dado sensível,
// por isso basta sessão ativa: CMDB e Disponibilidade usam para decidir
// quais indicadores de cobertura mostrar.
export const getMonitoringSources = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .handler(async (): Promise<MonitoringSources> => {
    const { loadMonitoringSources } = await import("@/lib/monitoring.server");
    return loadMonitoringSources();
  });
