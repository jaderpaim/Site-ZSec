-- updateCronJobEntry/toggleCronJob só atualizavam cron_job_runs (tabela de
-- rastreamento) sem nunca chamar schedule_hook_cron/unschedule_hook_cron de
-- volta — editar o intervalo ou desligar um job na UI era só cosmético, o
-- job real no pg_cron continuava no agendamento antigo. Para corrigir isso
-- esses handlers precisam saber a hook_path do job, que hoje só existe
-- hardcoded no catálogo do front-end (KNOWN_MODULES em CronJobs.tsx).
ALTER TABLE public.cron_job_runs ADD COLUMN IF NOT EXISTS hook_path text;

-- Backfill das linhas existentes (mapeamento vem do catálogo KNOWN_MODULES em
-- src/components/dashboard/CronJobs.tsx — nem todo job_name bate 1:1 com a
-- hookPath, então precisa ser explícito por linha).
UPDATE public.cron_job_runs SET hook_path = '/api/public/hooks/cloudflare-sync'   WHERE job_name = 'cloudflare-daily-sync'   AND hook_path IS NULL;
UPDATE public.cron_job_runs SET hook_path = '/api/public/hooks/domains-check'     WHERE job_name = 'domains-expiry-check'    AND hook_path IS NULL;
UPDATE public.cron_job_runs SET hook_path = '/api/public/hooks/ssl-check'         WHERE job_name = 'ssl-expiry-check'        AND hook_path IS NULL;
UPDATE public.cron_job_runs SET hook_path = '/api/public/hooks/gophish-sync'      WHERE job_name = 'gophish-sync'            AND hook_path IS NULL;
UPDATE public.cron_job_runs SET hook_path = '/api/public/hooks/qradar-sync'       WHERE job_name = 'qradar-sync'             AND hook_path IS NULL;
UPDATE public.cron_job_runs SET hook_path = '/api/public/hooks/sophos-sync'       WHERE job_name = 'sophos-sync'             AND hook_path IS NULL;
UPDATE public.cron_job_runs SET hook_path = '/api/public/hooks/vuln-snapshot'     WHERE job_name = 'vuln-snapshot'           AND hook_path IS NULL;
UPDATE public.cron_job_runs SET hook_path = '/api/public/hooks/ranking-ia-sync'   WHERE job_name = 'ranking-ia-sync'         AND hook_path IS NULL;
UPDATE public.cron_job_runs SET hook_path = '/api/public/hooks/cmdb-device-alerts' WHERE job_name = 'cmdb-device-alerts'     AND hook_path IS NULL;
UPDATE public.cron_job_runs SET hook_path = '/api/public/hooks/gmud-escalate'     WHERE job_name = 'gmud-escalate-inactive'  AND hook_path IS NULL;
UPDATE public.cron_job_runs SET hook_path = '/api/public/hooks/fornecedores-check' WHERE job_name = 'fornecedores-check'     AND hook_path IS NULL;
