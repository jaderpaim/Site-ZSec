-- Cron automático do QRadar sync nos horários de Brasília (BRT = UTC-3, sem DST):
--   06:00 BRT = 09:00 UTC
--   10:00 BRT = 13:00 UTC
--   14:00 BRT = 17:00 UTC
--   18:00 BRT = 21:00 UTC
--   22:00 BRT = 01:00 UTC
--   02:00 BRT = 05:00 UTC

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove job anterior se existir (idempotente)
DO $$
BEGIN
  PERFORM cron.unschedule('qradar-sync');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'qradar-sync',
  '0 1,5,9,13,17,21 * * *',
  $$
  SELECT net.http_post(
    url := 'https://b-security.lovable.app/api/public/hooks/qradar-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjYWNtZXB1aXlvcWt5cGF0a3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MTAwNzcsImV4cCI6MjA5NDE4NjA3N30.Xwm_jgXksknSyZHsaONRPYiumfmwuyQncP3KT1q98d4'
    ),
    body := '{}'::jsonb
  );
  $$
);
