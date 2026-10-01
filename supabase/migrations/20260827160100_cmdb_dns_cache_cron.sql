-- Cron diário de refresh do cache de resolução DNS (cmdb_dns_cache).
-- Horário: 10h15 UTC — perto do cmdb-device-alerts (10h UTC) mas sem colidir.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$ BEGIN PERFORM cron.unschedule('cmdb-dns-cache-refresh'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'cmdb-dns-cache-refresh',
  '15 10 * * *',
  $$
  SELECT net.http_post(
    url := 'https://b-security.bernoulli.com.br/api/public/hooks/cmdb-dns-cache-refresh',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjYWNtZXB1aXlvcWt5cGF0a3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MTAwNzcsImV4cCI6MjA5NDE4NjA3N30.Xwm_jgXksknSyZHsaONRPYiumfmwuyQncP3KT1q98d4'
    ),
    body := '{}'::jsonb
  );
  $$
);

INSERT INTO public.cron_job_runs (job_name, label, expected_interval_minutes, hook_path)
VALUES ('cmdb-dns-cache-refresh', 'CMDB — Cache DNS (nslookup)', 1440, '/api/public/hooks/cmdb-dns-cache-refresh')
ON CONFLICT (job_name) DO NOTHING;
