-- Corrige cron_job_runs.expected_interval_minutes pra bater com a cadência
-- real do cron (0 */2 * * * = 120min) -- achado investigando o fix do
-- HOOK_SECRET (ver project_cron_hook_secret_plaintext_vault_fix): o campo
-- salvo (240min/4h) ficou desatualizado em relação ao schedule real,
-- provavelmente de quando a frequência foi aumentada sem atualizar a
-- tabela de rastreamento. Isso afeta o cálculo de "atrasado" no painel de
-- saúde de cron (CronHealthBadge), que compara last_success_at contra esse
-- campo.
UPDATE public.cron_job_runs
SET expected_interval_minutes = 120
WHERE job_name IN ('qradar-sync', 'sophos-audit-sync')
  AND expected_interval_minutes <> 120;
