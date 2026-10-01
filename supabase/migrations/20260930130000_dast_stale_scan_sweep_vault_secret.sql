-- Corrige o dast-stale-scan-sweep (migration anterior,
-- 20260930120000_dast_stale_scan_sweep.sql) pra NUNCA guardar o HOOK_SECRET
-- em texto puro em cron.job.command -- usa Supabase Vault em vez de
-- embutir o valor direto na string do cron.schedule().
--
-- Nome do secret ('hook_secret') é o MESMO já planejado pro fix geral,
-- documentado desde 2026-09-21 e ainda não implementado (ver memória
-- project_cron_hook_secret_plaintext_vault_fix) -- schedule_hook_cron e os
-- ~6 crons existentes com o HOOK_SECRET hardcoded (cmdb-dns-cache-refresh,
-- qradar-sync etc., já vazado no histórico do git) continuam pendentes,
-- fora do escopo desta migration. Usar o MESMO nome aqui significa que,
-- quando aquele fix maior for feito (inclusive a rotação do segredo
-- recomendada lá, já que o valor atual já vazou), este cron do DAST já
-- fica automaticamente usando o valor rotacionado também -- não cria um
-- segundo secret pra manter sincronizado separadamente.
CREATE EXTENSION IF NOT EXISTS supabase_vault;

-- Cria o secret com um placeholder SE ainda não existir -- o valor real
-- precisa ser definido manualmente via Supabase Studio (SQL editor),
-- FORA de qualquer arquivo versionado no git:
--
--   SELECT vault.update_secret(
--     (SELECT id FROM vault.secrets WHERE name = 'hook_secret'),
--     '<valor real do HOOK_SECRET>'
--   );
--
-- Enquanto o placeholder não for trocado, o cron chama o hook com uma
-- apikey inválida -- checkHookSecret() recusa (401), recordCronRun grava
-- o erro, e o painel de crons mostra o job "falhando" até alguém trocar.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'hook_secret') THEN
    PERFORM vault.create_secret(
      'SUBSTITUIR_VIA_SUPABASE_STUDIO_ANTES_DE_USAR',
      'hook_secret',
      'HOOK_SECRET compartilhado pelos crons públicos do app (dast-stale-scan-sweep e futuros que migrarem pra Vault).'
    );
  END IF;
END $$;

DO $$ BEGIN PERFORM cron.unschedule('dast-stale-scan-sweep'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

SELECT cron.schedule(
  'dast-stale-scan-sweep',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://b-security.bernoulli.com.br/api/public/hooks/dast-stale-scan-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'hook_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
