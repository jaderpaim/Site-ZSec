-- Registra o job cmdb-device-alerts na tabela de evidência de execução,
-- para aparecer no painel de Logs com o mesmo card dos demais crons.
INSERT INTO public.cron_job_runs (job_name, label, expected_interval_minutes)
VALUES ('cmdb-device-alerts', 'CMDB — Alertas de Dispositivos', 1440)
ON CONFLICT (job_name) DO NOTHING;
