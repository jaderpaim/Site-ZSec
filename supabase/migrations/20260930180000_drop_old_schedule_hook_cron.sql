-- Limpeza final do fix de HOOK_SECRET em texto puro (ver
-- project_cron_hook_secret_plaintext_vault_fix): remove a versão antiga de
-- 4 argumentos de schedule_hook_cron (aceitava p_anon_key, base do
-- problema). Confirmado em 2026-09-30 que todos os 21 crons reais já usam
-- a versão nova de 3 argumentos (Vault) e que nenhum código no repo ainda
-- chama a versão antiga (cron-jobs.functions.ts já atualizado).
DROP FUNCTION IF EXISTS public.schedule_hook_cron(text, text, text, text);
