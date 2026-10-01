-- Mesma correção já aplicada ao qradar-sync (20260626170000_cron_hook_timeout.sql)
-- e ao sophos-sync (20260629180000_sophos_sync_cron_timeout.sql): o gophish-sync
-- nunca foi reagendado via schedule_hook_cron, então seu net.http_post ainda
-- rodava sem timeout_milliseconds — caindo no default de 5000ms do pg_net.
-- O handler do gophish-sync historicamente leva 18-31s pra responder, então
-- desde 04/07 toda execução diária (0 9 * * *) estourava esse timeout
-- (confirmado via net._http_response: timed_out=true às 09:00:00 em
-- 04/07, 05/07 e 06/07). Como o timeout acontece antes do recordCronRun
-- final, a falha nunca chega a ser registrada — cron_job_runs.last_attempt_at
-- simplesmente para de avançar, parecendo "cron atrasado" no dashboard.
--
-- schedule_hook_cron já está corrigido (timeout_milliseconds := 280000) desde
-- 20260617010000_cron_schedule_helpers.sql; só falta reagendar o gophish-sync
-- usando a versão atual da função. Mesmo horário de hoje (09:00 UTC diário),
-- sem mudar comportamento além do timeout.
SELECT public.schedule_hook_cron(
  'gophish-sync',
  '0 9 * * *',
  'https://b-security.bernoulli.com.br/api/public/hooks/gophish-sync',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjYWNtZXB1aXlvcWt5cGF0a3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MTAwNzcsImV4cCI6MjA5NDE4NjA3N30.Xwm_jgXksknSyZHsaONRPYiumfmwuyQncP3KT1q98d4'
);
