// Registra evidência de execução de cron jobs (e seus equivalentes manuais)
// na tabela public.cron_job_runs, para permitir detectar no dashboard quando
// o cron parou de rodar (ex.: build não publicado, HOOK_SECRET divergente).
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type CronTrigger = "cron" | "manual";

// Grava a tentativa ANTES do sync rodar, não só no final. Syncs longos podem
// ser interrompidos no meio por algo fora do nosso código (confirmado via
// net._http_response do pg_net: timeouts e um 503 na mesma janela em que o
// qradar-sync parou de logar atividade) — quando isso acontece, o processo
// nunca chega no recordCronRun final, e last_attempt_at fica congelado,
// fazendo o cron parecer "parado" mesmo disparando normalmente a cada ciclo.
export async function recordCronAttemptStart(jobName: string, trigger: CronTrigger): Promise<void> {
  const now = new Date().toISOString();
  try {
    await supabaseAdmin
      .from("cron_job_runs")
      .update({ last_attempt_at: now, last_trigger: trigger, last_ok: null, updated_at: now })
      .eq("job_name", jobName);
  } catch {
    /* evidência não deve quebrar o sync */
  }
}

export async function recordCronRun(
  jobName: string,
  trigger: CronTrigger,
  result: { ok: boolean; error?: string | null; durationMs?: number },
): Promise<void> {
  const now = new Date().toISOString();
  const row: {
    last_attempt_at: string;
    last_trigger: string;
    last_ok: boolean;
    last_error: string | null;
    last_duration_ms?: number;
    updated_at: string;
    last_success_at?: string;
  } = {
    last_attempt_at: now,
    last_trigger: trigger,
    last_ok: result.ok,
    last_error: result.error ?? null,
    updated_at: now,
  };
  if (result.durationMs !== undefined) row.last_duration_ms = Math.round(result.durationMs);
  if (result.ok) row.last_success_at = now;
  try {
    await supabaseAdmin.from("cron_job_runs").update(row).eq("job_name", jobName);
  } catch {
    /* evidência não deve quebrar o sync */
  }
}
