-- Cron da sincronização de eventos DLP (Purview) — a cada 5 minutos, igual
-- sugerido no guia de integração (janela curta o bastante pra não perder o
-- limite de 24h da Management Activity API entre execuções).
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$ BEGIN PERFORM cron.unschedule('dlp-sync'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'dlp-sync',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://b-security.bernoulli.com.br/api/public/hooks/dlp-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjYWNtZXB1aXlvcWt5cGF0a3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MTAwNzcsImV4cCI6MjA5NDE4NjA3N30.Xwm_jgXksknSyZHsaONRPYiumfmwuyQncP3KT1q98d4'
    ),
    body := '{}'::jsonb
  );
  $$
);
