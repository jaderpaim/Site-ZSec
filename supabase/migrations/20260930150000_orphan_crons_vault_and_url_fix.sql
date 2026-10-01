-- Corrige 5 crons órfãos (existem em cron.job mas nunca foram registrados em
-- public.cron_job_runs, então não aparecem na tela de Cron Jobs do app nem
-- passam por schedule_hook_cron): tiram o HOOK_SECRET do texto puro (Vault)
-- e, em 4 deles, corrigem a URL que apontava pro preview da Lovable
-- (project--ad2d9bfd-...lovable.app) em vez do domínio de produção
-- (b-security.bernoulli.com.br) -- achado investigando o problema do
-- secret, PROVÁVEL causa de esses jobs estarem falhando silenciosamente há
-- tempos (preview pode ter expirado/mudado, sem ninguém notar porque
-- nenhum desses jobs está rastreado em cron_job_runs).
--
-- Mantidos FORA de cron_job_runs por enquanto (decisão do usuário,
-- 2026-09-30) -- não aparecem na tela do app ainda, só corrigidos no nível
-- de segurança/URL. Registrar neles fica pra uma etapa separada, se
-- decidido depois.
--
-- Cada bloco preserva a estrutura original de cada job (alguns usam
-- 'x-hook-secret', outros 'apikey' -- ambos aceitos por checkHookSecret();
-- qradar-sync-watchdog preserva o INSERT INTO cron_http_dispatch_log +
-- timeout_milliseconds que os outros não têm).

DO $$ BEGIN PERFORM cron.unschedule('cmdb-device-alerts-am'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'cmdb-device-alerts-am',
  '0 13 * * *',
  $$
  SELECT net.http_post(
    url := 'https://b-security.bernoulli.com.br/api/public/hooks/cmdb-device-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-hook-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'hook_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

DO $$ BEGIN PERFORM cron.unschedule('cmdb-device-alerts-pm'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'cmdb-device-alerts-pm',
  '0 19 * * *',
  $$
  SELECT net.http_post(
    url := 'https://b-security.bernoulli.com.br/api/public/hooks/cmdb-device-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-hook-secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'hook_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

DO $$ BEGIN PERFORM cron.unschedule('fornecedores-expiry-check'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'fornecedores-expiry-check',
  '30 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://b-security.bernoulli.com.br/api/public/hooks/fornecedores-check',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'hook_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

DO $$ BEGIN PERFORM cron.unschedule('sophos-ia-sync-3am'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'sophos-ia-sync-3am',
  '0 6 * * *',
  $$
  SELECT net.http_post(
    url := 'https://b-security.bernoulli.com.br/api/public/hooks/sophos-ia-sync',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'hook_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

-- URL já estava certa (b-security.bernoulli.com.br) -- só troca o secret,
-- preserva o wrapper de log (cron_http_dispatch_log) e o timeout de 280s.
DO $$ BEGIN PERFORM cron.unschedule('qradar-sync-watchdog'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
SELECT cron.schedule(
  'qradar-sync-watchdog',
  '*/5 * * * *',
  $$
  INSERT INTO public.cron_http_dispatch_log (id, job_name)
  SELECT net.http_post(
    url := 'https://b-security.bernoulli.com.br/api/public/hooks/qradar-sync-watchdog',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'hook_secret')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 280000
  ), 'qradar-sync-watchdog';
  $$
);
