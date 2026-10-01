import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "./primitives";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { usePermissions } from "@/lib/use-permissions";

export type CronJobRun = {
  job_name: string;
  label: string;
  expected_interval_minutes: number;
  last_attempt_at: string | null;
  last_trigger: string | null;
  last_ok: boolean | null;
  last_error: string | null;
  last_success_at: string | null;
  last_duration_ms: number | null;
  updated_at: string;
  enabled?: boolean;
};

// Quanto tempo após o intervalo esperado consideramos o cron "atrasado"
// (cobre variação normal de horário + tempo de execução do job).
const STALE_BUFFER_MS = 60 * 60 * 1000;
// Após esse tempo sem recordCronRun, assumimos que o job foi interrompido.
const RUNNING_TIMEOUT_MS = 30 * 60 * 1000;

export function fmtDateTime(s: string | null | undefined) {
  if (!s) return "nunca";
  return new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function getCronHealth(data: Pick<CronJobRun, "last_attempt_at" | "expected_interval_minutes" | "last_ok">): {
  tone: "success" | "warning" | "danger";
  label: string;
} {
  const lastAttempt = data.last_attempt_at ? new Date(data.last_attempt_at).getTime() : null;
  const staleThreshold = data.expected_interval_minutes * 60 * 1000 + STALE_BUFFER_MS;
  const isStale = lastAttempt === null || Date.now() - lastAttempt > staleThreshold;
  const hasError = data.last_ok === false;
  // last_ok === null significa que recordCronAttemptStart rodou mas
  // recordCronRun ainda não foi chamado (em execução ou interrompido).
  const isPending = data.last_ok === null && lastAttempt !== null;

  if (isStale) {
    return { tone: "danger", label: lastAttempt === null ? "Cron nunca executado" : "Cron atrasado" };
  }
  if (hasError) {
    return { tone: "warning", label: "Cron com erro" };
  }
  if (isPending) {
    const elapsed = Date.now() - lastAttempt!;
    return {
      tone: "warning",
      label: elapsed <= RUNNING_TIMEOUT_MS ? "Em execução…" : "Cron interrompido",
    };
  }
  return { tone: "success", label: "Cron OK" };
}

// Visível apenas para admin global ou admin do módulo — demais usuários
// não devem ver detalhes de infraestrutura/operação dos jobs de sincronização.
export function CronHealthBadge({ jobName, moduleSlug }: { jobName: string; moduleSlug: string }) {
  const { isModuleAdmin } = usePermissions();
  const { data } = useQuery({
    queryKey: ["cron-job-run", jobName],
    queryFn: async () => {
      const { data } = await supabase.from("cron_job_runs").select("*").eq("job_name", jobName).maybeSingle();
      return data;
    },
    refetchInterval: 5 * 60 * 1000,
    enabled: isModuleAdmin(moduleSlug),
  });

  if (!isModuleAdmin(moduleSlug)) return null;
  if (!data) return null;

  const { tone, label } = getCronHealth(data);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span style={{ cursor: "default" }}>
            <Badge tone={tone}>{label}</Badge>
          </span>
        </TooltipTrigger>
        <TooltipContent>
          <div>
            Última tentativa: {fmtDateTime(data.last_attempt_at)}
            {data.last_trigger ? ` (${data.last_trigger === "cron" ? "automático" : "manual"})` : ""}
          </div>
          <div>Último sucesso: {fmtDateTime(data.last_success_at)}</div>
          {data.last_error && <div>Erro: {data.last_error}</div>}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
