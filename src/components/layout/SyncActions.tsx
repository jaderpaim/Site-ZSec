import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePermissions } from "@/lib/use-permissions";
import {
  type CronJobRun,
  fmtDateTime,
  getCronHealth,
} from "@/components/dashboard/CronHealthBadge";

const TONE_COLOR = {
  success: "var(--v2-ok)",
  warning: "var(--v2-med)",
  danger: "var(--v2-crit)",
} as const;
const TONE_RANK = { success: 0, warning: 1, danger: 2 } as const;

/**
 * Saúde dos crons do módulo num único indicador: mostra o pior status entre
 * os jobs e, no tooltip, o detalhe de cada um. Visível só para admin global
 * ou admin do módulo (mesma regra do CronHealthBadge).
 */
export function CronStatus({ moduleSlug, jobs }: { moduleSlug: string; jobs: string[] }) {
  const { isModuleAdmin } = usePermissions();
  const allowed = isModuleAdmin(moduleSlug);
  const { data } = useQuery({
    queryKey: ["cron-job-runs", ...jobs],
    queryFn: async () => {
      const { data } = await supabase.from("cron_job_runs").select("*").in("job_name", jobs);
      return (data ?? []) as CronJobRun[];
    },
    refetchInterval: 5 * 60 * 1000,
    enabled: allowed,
  });

  if (!allowed || !data || data.length === 0) return null;

  const runs = jobs
    .map((j) => data.find((r) => r.job_name === j))
    .filter((r): r is CronJobRun => !!r)
    .map((r) => ({ run: r, health: getCronHealth(r) }));
  const worst = runs.reduce((a, b) =>
    TONE_RANK[b.health.tone] > TONE_RANK[a.health.tone] ? b : a,
  );
  const color = TONE_COLOR[worst.health.tone];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span
            tabIndex={0}
            className="font-ui inline-flex items-center gap-1.5 h-6 px-2 rounded-md text-[12px] font-medium whitespace-nowrap cursor-default"
            style={{
              background: `color-mix(in oklch, ${color} 14%, transparent)`,
              color: `color-mix(in oklch, ${color} 72%, var(--v2-fg))`,
            }}
          >
            <span className="size-1.5 rounded-full" style={{ background: color }} />
            {worst.health.label}
            {runs.length > 1 && worst.health.tone !== "success" && (
              <span className="text-v2-fg-3 font-normal">
                · {worst.run.label || worst.run.job_name}
              </span>
            )}
          </span>
        </TooltipTrigger>
        <TooltipContent align="end">
          <div className="grid gap-2 py-0.5">
            {runs.map(({ run, health }) => (
              <div key={run.job_name} className="grid gap-0.5">
                <div className="flex items-center gap-1.5 font-medium">
                  <span
                    className="size-1.5 rounded-full"
                    style={{ background: TONE_COLOR[health.tone] }}
                  />
                  {run.label || run.job_name} · {health.label}
                </div>
                <div>
                  Última tentativa: {fmtDateTime(run.last_attempt_at)}
                  {run.last_trigger
                    ? ` (${run.last_trigger === "cron" ? "automático" : "manual"})`
                    : ""}
                </div>
                <div>Último sucesso: {fmtDateTime(run.last_success_at)}</div>
                {run.last_error && <div>Erro: {run.last_error}</div>}
              </div>
            ))}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Lado direito do cabeçalho do módulo: o status do cron fica em cima e as
 * ações (Sincronizar etc.) embaixo, sempre alinhados à direita.
 */
export function SyncActions({
  moduleSlug,
  jobs,
  children,
}: {
  moduleSlug: string;
  jobs: string[];
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-end gap-2 max-w-full">
      <CronStatus moduleSlug={moduleSlug} jobs={jobs} />
      {children}
    </div>
  );
}
