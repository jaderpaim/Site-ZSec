-- Mesmo bug corrigido em 20260706140000_gophish_sync_cron_timeout.sql (e antes,
-- em qradar-sync e sophos-sync): o ranking-ia-sync foi criado direto com
-- net.http_post cru (20260616170000_ranking_ia_cron.sql), sem
-- timeout_milliseconds — caindo no default de 5000ms do pg_net. O handler
-- (rebuildIaWebEvents) historicamente leva entre 24s e 109s pra responder,
-- então a execução diária (0 10 * * *) estourava esse timeout todo dia
-- (confirmado via net._http_response: timed_out=true às 10:00:00 em 06/07).
-- Como o timeout acontece antes do recordCronRun final, a falha nunca é
-- registrada — cron_job_runs.last_attempt_at fica congelado, parecendo
-- "cron atrasado" no dashboard mesmo com o pg_cron disparando normalmente.
--
-- Reagenda via schedule_hook_cron (timeout_milliseconds := 280000), mesmo
-- horário de hoje (10h UTC diário).
SELECT public.schedule_hook_cron(
  'ranking-ia-sync',
  '0 10 * * *',
  'https://b-security.bernoulli.com.br/api/public/hooks/ranking-ia-sync',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjYWNtZXB1aXlvcWt5cGF0a3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MTAwNzcsImV4cCI6MjA5NDE4NjA3N30.Xwm_jgXksknSyZHsaONRPYiumfmwuyQncP3KT1q98d4'
);