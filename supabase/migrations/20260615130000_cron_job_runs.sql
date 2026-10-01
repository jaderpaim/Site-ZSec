-- Tabela de evidência de execução dos cron jobs (pg_cron -> hooks públicos).
-- Cada hook (e cada trigger manual equivalente) grava aqui a cada execução,
-- permitindo detectar no dashboard quando o cron parou de rodar
-- (ex.: build não publicado, HOOK_SECRET divergente, etc).
CREATE TABLE public.cron_job_runs (
  job_name text PRIMARY KEY,
  label text NOT NULL,
  expected_interval_minutes integer NOT NULL,
  last_attempt_at timestamptz,
  last_trigger text,
  last_ok boolean,
  last_error text,
  last_success_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.cron_job_runs TO authenticated;
GRANT ALL ON public.cron_job_runs TO service_role;

ALTER TABLE public.cron_job_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth view cron job runs" ON public.cron_job_runs FOR SELECT TO authenticated USING (true);

INSERT INTO public.cron_job_runs (job_name, label, expected_interval_minutes) VALUES
  ('qradar-sync', 'SOC · QRadar Sync', 240),
  ('cloudflare-daily-sync', 'Cloudflare Sync', 1440),
  ('gophish-sync', 'Gophish Sync', 1440),
  ('domains-expiry-check', 'Domínios — Verificação de Expiração', 1440),
  ('ssl-expiry-check', 'SSL — Verificação de Expiração', 1440),
  ('gmud-escalate-inactive', 'GMUD — Escalonamento de Aprovações', 1440)
ON CONFLICT (job_name) DO NOTHING;
