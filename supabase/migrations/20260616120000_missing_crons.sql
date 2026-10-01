-- pg_cron para os 4 jobs que tinham hook mas sem agendamento no banco.
-- Horários em BRT (UTC-3): cloudflare 07h, domains 08h, ssl 09h, gmud 10h.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$ BEGIN PERFORM cron.unschedule('cloudflare-daily-sync'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('domains-expiry-check');  EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('ssl-expiry-check');       EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('gmud-escalate-inactive'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'cloudflare-daily-sync',
  '0 10 * * *',
  $$
  SELECT net.http_post(
    url := 'https://b-security.bernoulli.com.br/api/public/hooks/cloudflare-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjYWNtZXB1aXlvcWt5cGF0a3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MTAwNzcsImV4cCI6MjA5NDE4NjA3N30.Xwm_jgXksknSyZHsaONRPYiumfmwuyQncP3KT1q98d4'
    ),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'domains-expiry-check',
  '0 11 * * *',
  $$
  SELECT net.http_post(
    url := 'https://b-security.bernoulli.com.br/api/public/hooks/domains-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjYWNtZXB1aXlvcWt5cGF0a3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MTAwNzcsImV4cCI6MjA5NDE4NjA3N30.Xwm_jgXksknSyZHsaONRPYiumfmwuyQncP3KT1q98d4'
    ),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'ssl-expiry-check',
  '0 12 * * *',
  $$
  SELECT net.http_post(
    url := 'https://b-security.bernoulli.com.br/api/public/hooks/ssl-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjYWNtZXB1aXlvcWt5cGF0a3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MTAwNzcsImV4cCI6MjA5NDE4NjA3N30.Xwm_jgXksknSyZHsaONRPYiumfmwuyQncP3KT1q98d4'
    ),
    body := '{}'::jsonb
  );
  $$
);

SELECT cron.schedule(
  'gmud-escalate-inactive',
  '0 13 * * *',
  $$
  SELECT net.http_post(
    url := 'https://b-security.bernoulli.com.br/api/public/hooks/gmud-escalate',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjYWNtZXB1aXlvcWt5cGF0a3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MTAwNzcsImV4cCI6MjA5NDE4NjA3N30.Xwm_jgXksknSyZHsaONRPYiumfmwuyQncP3KT1q98d4'
    ),
    body := '{}'::jsonb
  );
  $$
);
