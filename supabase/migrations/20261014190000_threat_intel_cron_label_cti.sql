-- Rótulo do cron na tela Cron Jobs: usa "CTI" em vez do nome da ferramenta.
UPDATE public.cron_job_runs
  SET label = 'Threat Intel — Coleta de credenciais vazadas (CTI)'
  WHERE job_name = 'leakradar-sync';
