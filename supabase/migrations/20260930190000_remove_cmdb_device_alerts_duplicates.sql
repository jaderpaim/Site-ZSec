-- Remove cmdb-device-alerts-am/-pm: duplicatas do cmdb-device-alerts
-- rastreado (10h UTC / 07h BRT), achadas investigando o fix do
-- HOOK_SECRET (ver project_cron_hook_secret_plaintext_vault_fix).
-- checkCmdbDevicesAndNotify() (src/lib/cmdb-alerts.functions.ts) não tem
-- dedupe -- varre o status atual e manda e-mail/Teams toda vez que roda,
-- sem checar se já alertou antes. Rodar 3x/dia (10h/13h/19h UTC) manda o
-- mesmo alerta repetido pros administradores pra qualquer dispositivo que
-- continue em status de alerta o dia inteiro. A migration original
-- (20260616150000_cmdb_device_alerts_cron.sql) documenta explicitamente
-- "Cron diário" -- só o horário de 10h UTC foi projetado de propósito.
DO $$ BEGIN PERFORM cron.unschedule('cmdb-device-alerts-am'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
DO $$ BEGIN PERFORM cron.unschedule('cmdb-device-alerts-pm'); EXCEPTION WHEN OTHERS THEN NULL; END $$;
