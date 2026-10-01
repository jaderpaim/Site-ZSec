-- Cron diário para verificar ativos CMDB em status Alerta ou Inativo
-- e enviar e-mail SMTP + Teams/Telegram para os administradores.
-- Horário: 07h BRT (10h UTC).
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$ BEGIN PERFORM cron.unschedule('cmdb-device-alerts'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'cmdb-device-alerts',
  '0 10 * * *',
  $$
  SELECT net.http_post(
    url := 'https://b-security.bernoulli.com.br/api/public/hooks/cmdb-device-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjYWNtZXB1aXlvcWt5cGF0a3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MTAwNzcsImV4cCI6MjA5NDE4NjA3N30.Xwm_jgXksknSyZHsaONRPYiumfmwuyQncP3KT1q98d4'
    ),
    body := '{}'::jsonb
  );
  $$
);

-- Registra o job na tabela de evidência de execução (mesmo padrão dos demais)
INSERT INTO public.cron_job_runs (job_name, label, expected_interval_minutes)
VALUES ('cmdb-device-alerts', 'CMDB — Alertas de Dispositivos', 1440)
ON CONFLICT (job_name) DO NOTHING;
