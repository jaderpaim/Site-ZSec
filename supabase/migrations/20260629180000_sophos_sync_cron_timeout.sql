-- Mesma correção aplicada ao qradar-sync em 20260626170000_cron_hook_timeout.sql,
-- agora para o sophos-sync. Aquela migration só recriou o agendamento do
-- qradar-sync — o sophos-sync nunca foi reagendado desde então, então seu
-- cron.job ainda podia estar usando o timeout antigo/padrão do pg_net
-- (5000ms), curto demais para um sync que já levou ~20s em condições
-- normais, e mais vulnerável ainda quando coincide com alguma operação
-- pesada no banco (como os backfills de sophos_events aplicados hoje —
-- provável causa do "atrasado" reportado: o cron.job_run_details indicaria
-- timed_out=true, e como isso acontece antes do recordCronRun, a falha não
-- chega a ser registrada, só para de atualizar last_attempt_at).
--
-- schedule_hook_cron já está corrigido (timeout_milliseconds := 280000);
-- só falta reagendar o sophos-sync usando a versão atual da função. Mesmo
-- intervalo de hoje (480 min = a cada 8h), sem mudar comportamento além do
-- timeout.
SELECT public.schedule_hook_cron(
  'sophos-sync',
  '0 */8 * * *',
  'https://b-security.bernoulli.com.br/api/public/hooks/sophos-sync',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjYWNtZXB1aXlvcWt5cGF0a3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MTAwNzcsImV4cCI6MjA5NDE4NjA3N30.Xwm_jgXksknSyZHsaONRPYiumfmwuyQncP3KT1q98d4'
);
