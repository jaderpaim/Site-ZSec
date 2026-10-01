-- Sweep de scans DAST presos em 'running' sem atualização há muito tempo.
-- Ver docstring completa em src/routes/api/public/hooks/dast-stale-scan-sweep.ts
-- (motivação: apt-daily-upgrade do Ubuntu reiniciando o scanner-api no meio
-- de um bulk scan, 2026-09-30).

-- updated_at precisa existir pra o cron saber o que é "sem atualização há
-- muito tempo" -- dast-callback.ts já faz update() em toda progressão de
-- scan, então o trigger cobre isso automaticamente, sem mexer no callback.
ALTER TABLE public.dast_scans ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

DROP TRIGGER IF EXISTS tg_dast_scans_updated ON public.dast_scans;
CREATE TRIGGER tg_dast_scans_updated BEFORE UPDATE ON public.dast_scans
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$ BEGIN PERFORM cron.unschedule('dast-stale-scan-sweep'); EXCEPTION WHEN OTHERS THEN NULL; END $$;

-- A cada 15min -- barato (1 SELECT + UPDATE condicional), threshold de 90min
-- dentro da própria rota já evita falso positivo em scan legitimamente longo.
--
-- ATENÇÃO: 'apikey' abaixo precisa ser o HOOK_SECRET real do ambiente (mesmo
-- valor usado nos outros crons desta migration em diante) -- substituir o
-- placeholder antes de aplicar. Mesma limitação já conhecida e documentada
-- em project_cron_hook_secret_plaintext_vault_fix (segredo em texto plano em
-- cron.job.command, pendente de migrar pro Supabase Vault).
SELECT cron.schedule(
  'dast-stale-scan-sweep',
  '*/15 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://b-security.bernoulli.com.br/api/public/hooks/dast-stale-scan-sweep',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'SUBSTITUIR_PELO_HOOK_SECRET_REAL'
    ),
    body := '{}'::jsonb
  );
  $$
);

INSERT INTO public.cron_job_runs (job_name, label, expected_interval_minutes, hook_path)
VALUES ('dast-stale-scan-sweep', 'DAST — Sweep de scans órfãos', 15, '/api/public/hooks/dast-stale-scan-sweep')
ON CONFLICT (job_name) DO NOTHING;
