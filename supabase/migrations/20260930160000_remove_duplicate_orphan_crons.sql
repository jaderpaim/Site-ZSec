-- Remove 3 crons órfãos confirmados como duplicata redundante de um cron
-- rastreado equivalente (achados investigando o problema de HOOK_SECRET em
-- texto puro, ver project_cron_hook_secret_plaintext_vault_fix). Confirmado
-- via cron.job_run_details (2026-09-30): os três "succeeded" toda vez, mas
-- disparam no mesmo endpoint que o job rastreado já cobre com frequência
-- maior -- sobra de quando alguém aumentou a frequência do job principal
-- sem remover o agendamento diário antigo.
--
--   cloudflare-sync-daily-3am (03:00) -- duplicata de cloudflare-daily-sync (10:00)
--   qradar-daily-sync         (03:00) -- duplicata de qradar-sync (a cada 2h)
--   sophos-daily-sync         (06:00) -- duplicata de sophos-sync (a cada 8h)
--
-- Nenhum dos três está em public.cron_job_runs, então não somem de nenhum
-- painel/monitoramento do app -- só param de gerar chamada redundante.
DO $$ BEGIN PERFORM cron.unschedule('cloudflare-sync-daily-3am'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('qradar-daily-sync'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('sophos-daily-sync'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
