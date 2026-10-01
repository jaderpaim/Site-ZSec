-- Cron automático do Gophish sync: 06:00 BRT = 09:00 UTC
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('gophish-sync');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'gophish-sync',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://b-security.lovable.app/api/public/hooks/gophish-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjYWNtZXB1aXlvcWt5cGF0a3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MTAwNzcsImV4cCI6MjA5NDE4NjA3N30.Xwm_jgXksknSyZHsaONRPYiumfmwuyQncP3KT1q98d4'
    ),
    body := '{}'::jsonb
  );
  $$
);
