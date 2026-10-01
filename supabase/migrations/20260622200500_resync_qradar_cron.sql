-- qradar-sync foi editado na UI pra rodar a cada 2h, mas updateCronJobEntry
-- (antes desse fix) so atualizava cron_job_runs.expected_interval_minutes --
-- nunca chamava de volta o pg_cron. O job real ficou no intervalo original e
-- parou de bater com o que o painel mostrava (rodou 18h, nao rodou 20h).
-- Reagenda do zero com o intervalo de 2h que de fato esta configurado hoje.
DO $$ BEGIN PERFORM cron.unschedule('qradar-sync'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'qradar-sync',
  '0 */2 * * *',
  $hook$
  SELECT net.http_post(
    url := 'https://b-security.bernoulli.com.br/api/public/hooks/qradar-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjYWNtZXB1aXlvcWt5cGF0a3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MTAwNzcsImV4cCI6MjA5NDE4NjA3N30.Xwm_jgXksknSyZHsaONRPYiumfmwuyQncP3KT1q98d4'
    ),
    body := '{}'::jsonb
  );
  $hook$
);
