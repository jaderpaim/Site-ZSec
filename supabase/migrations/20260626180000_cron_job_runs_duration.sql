-- Painel de Cron Jobs não mostrava quanto tempo a última sincronização levou
-- (só "última tentativa"/"último sucesso"), dificultando notar quando um sync
-- está degradando antes de virar atraso. Guarda a duração da última execução
-- registrada via recordCronRun (cron ou manual).
ALTER TABLE public.cron_job_runs ADD COLUMN IF NOT EXISTS last_duration_ms integer;
