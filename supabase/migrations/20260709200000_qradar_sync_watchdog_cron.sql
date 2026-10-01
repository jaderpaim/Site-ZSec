-- Watchdog do qradar-sync: cron independente, sempre agendado (a cada
-- 5min), que detecta quando o processo que roda runQradarSync morre no meio
-- da execução — matado pela infra/túnel, sem chance de rodar limpeza (ver
-- SYNC_LEASE_STALE_MS e checkQradarSyncWatchdog em qradar.server.ts) — e
-- corrige a trava (sync_running_since) e o status (cron_job_runs) sem
-- esperar até 45min. Precisa ser um cron SEPARADO do próprio qradar-sync,
-- não ligado ao início/fim dele: se dependesse do sync pra se armar/
-- desarmar, quebraria exatamente no caso que mais importa — quando o sync
-- morre antes de conseguir chamar o próprio watchdog. Rodar sempre, mesmo
-- sem sync ativa, custa só um SELECT rápido (no-op).
SELECT public.schedule_hook_cron(
  'qradar-sync-watchdog',
  '*/5 * * * *',
  'https://b-security.bernoulli.com.br/api/public/hooks/qradar-sync-watchdog',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjYWNtZXB1aXlvcWt5cGF0a3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MTAwNzcsImV4cCI6MjA5NDE4NjA3N30.Xwm_jgXksknSyZHsaONRPYiumfmwuyQncP3KT1q98d4'
);
