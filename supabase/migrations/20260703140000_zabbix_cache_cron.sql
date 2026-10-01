-- Cron de refresh do cache de hosts Zabbix a cada 5 minutos.
-- Fallback para quando nenhum admin/editor entrou no módulo CMDB recentemente.
-- O refresh principal ocorre via getZabbixLiveHosts ao carregar o CMDB com perfil editor.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('zabbix-cache-refresh');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'zabbix-cache-refresh',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://b-security.lovable.app/api/public/hooks/zabbix-cache-refresh',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjYWNtZXB1aXlvcWt5cGF0a3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MTAwNzcsImV4cCI6MjA5NDE4NjA3N30.Xwm_jgXksknSyZHsaONRPYiumfmwuyQncP3KT1q98d4'
    ),
    body := '{}'::jsonb
  );
  $$
);
