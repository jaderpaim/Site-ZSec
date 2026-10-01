
-- Remove job antigo se já existir (idempotente)
DO $$
BEGIN
  PERFORM cron.unschedule('gmud-escalate-inactive');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'gmud-escalate-inactive',
  '0 3 * * *',
  $$
  SELECT net.http_post(
    url := 'https://project--ad2d9bfd-cf80-4493-9684-3c4d936f53e3.lovable.app/api/public/hooks/gmud-escalate',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjYWNtZXB1aXlvcWt5cGF0a3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MTAwNzcsImV4cCI6MjA5NDE4NjA3N30.Xwm_jgXksknSyZHsaONRPYiumfmwuyQncP3KT1q98d4'
    ),
    body := '{}'::jsonb
  ) AS request_id;
  $$
);
