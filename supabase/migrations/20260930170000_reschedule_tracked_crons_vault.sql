-- Reagenda de uma vez os 14 crons rastreados em public.cron_job_runs que
-- ainda usavam a versão antiga de schedule_hook_cron (segredo literal) --
-- em vez de clicar em cada um na tela de Cron Jobs, chama a função nova
-- (20260930140000_schedule_hook_cron_vault.sql, já validada com
-- sek-zendesk-sync) direto aqui, reaproveitando o schedule REAL atual de
-- cada job (lido de cron.job.schedule, não recalculado a partir de
-- cron_job_runs.expected_interval_minutes -- confirmado que pelo menos o
-- qradar-sync tem esse campo desatualizado, 240min salvo vs 2h real).
SELECT public.schedule_hook_cron('cloudflare-daily-sync', '0 10 * * *', 'https://b-security.bernoulli.com.br/api/public/hooks/cloudflare-sync');
SELECT public.schedule_hook_cron('cmdb-device-alerts', '0 10 * * *', 'https://b-security.bernoulli.com.br/api/public/hooks/cmdb-device-alerts');
SELECT public.schedule_hook_cron('cmdb-dns-cache-refresh', '*/15 * * * *', 'https://b-security.bernoulli.com.br/api/public/hooks/cmdb-dns-cache-refresh');
SELECT public.schedule_hook_cron('dlp-sync', '*/5 * * * *', 'https://b-security.bernoulli.com.br/api/public/hooks/dlp-sync');
SELECT public.schedule_hook_cron('domains-expiry-check', '0 10 * * *', 'https://b-security.bernoulli.com.br/api/public/hooks/domains-check');
SELECT public.schedule_hook_cron('gmud-escalate-inactive', '0 10 * * *', 'https://b-security.bernoulli.com.br/api/public/hooks/gmud-escalate');
SELECT public.schedule_hook_cron('gophish-sync', '0 10 * * *', 'https://b-security.bernoulli.com.br/api/public/hooks/gophish-sync');
SELECT public.schedule_hook_cron('privacy-tools-sync', '*/15 * * * *', 'https://b-security.bernoulli.com.br/api/public/hooks/privacy-tools-sync');
SELECT public.schedule_hook_cron('qradar-sync', '0 */2 * * *', 'https://b-security.bernoulli.com.br/api/public/hooks/qradar-sync');
SELECT public.schedule_hook_cron('ranking-ia-sync', '0 10 * * *', 'https://b-security.bernoulli.com.br/api/public/hooks/ranking-ia-sync');
SELECT public.schedule_hook_cron('sophos-audit-sync', '0 */2 * * *', 'https://b-security.bernoulli.com.br/api/public/hooks/sophos-audit-sync');
SELECT public.schedule_hook_cron('sophos-sync', '0 */8 * * *', 'https://b-security.bernoulli.com.br/api/public/hooks/sophos-sync');
SELECT public.schedule_hook_cron('ssl-expiry-check', '0 10 * * *', 'https://b-security.bernoulli.com.br/api/public/hooks/ssl-check');
SELECT public.schedule_hook_cron('zabbix-cache-refresh', '*/5 * * * *', 'https://b-security.bernoulli.com.br/api/public/hooks/zabbix-cache-refresh');
