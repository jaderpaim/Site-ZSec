-- Reconstrução: tabelas do DAST que existiam no banco de origem sem migration
-- de criação. A primeira a usá-las é 20260820120000.
--
-- Criadas no estado ANTERIOR às migrations que as alteram, para que essas
-- migrations rodem como foram escritas. Ficam de fora (porque são adicionadas
-- depois):
--   dast_recon_subdomains: scope (20260820120000), subdomain_norm/scope_norm
--     (20260825120000), source (20260825170000)
--   dast_vulnerabilities: *_norm, first_seen_at, occurrence_count, reopened_at
--     (20260821150000), sub_key/sub_key_norm (20260821160000)
--   dast_scans: auth_status (20260914120000), updated_at (20260930120000)
--
-- Colunas e tipos deduzidos de src/integrations/supabase/types.ts; valores
-- padrão do código (dast.functions.ts: status "queued", mode "url", level
-- "basic"). As policies (que dependem de is_dast_allowed, criada em
-- 20260825150000) ficam em 20261011120100_dast_policies.sql.

CREATE TABLE IF NOT EXISTS public.dast_scans (
  id                          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                        text,
  target_url                  text,
  domain                      text,
  environment                 text,
  mode                        text NOT NULL DEFAULT 'url',
  level                       text NOT NULL DEFAULT 'basic',
  engines                     text[] NOT NULL DEFAULT '{}',
  status                      text NOT NULL DEFAULT 'queued',
  progress                    integer NOT NULL DEFAULT 0,
  estimated_seconds_remaining integer,
  config                      jsonb,
  error                       text,
  started_by                  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  started_at                  timestamptz,
  finished_at                 timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dast_scans_created_at ON public.dast_scans (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_dast_scans_status ON public.dast_scans (status);

CREATE TABLE IF NOT EXISTS public.dast_vulnerabilities (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id         uuid NOT NULL REFERENCES public.dast_scans(id) ON DELETE CASCADE,
  engine          text,
  name            text NOT NULL,
  severity        text,
  confidence      text,
  description     text,
  business_impact text,
  remediation     text,
  reference       text,
  cve_id          text,
  cvss_score      numeric,
  owasp_category  text,
  matched_url     text,
  http_method     text,
  param           text,
  attack_payload  text,
  evidence        text,
  raw_output      jsonb,
  should_alert    boolean,
  status          text NOT NULL DEFAULT 'open',
  found_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dast_vulnerabilities_scan ON public.dast_vulnerabilities (scan_id);
CREATE INDEX IF NOT EXISTS idx_dast_vulnerabilities_status ON public.dast_vulnerabilities (status);

CREATE TABLE IF NOT EXISTS public.dast_recon_subdomains (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id       uuid NOT NULL REFERENCES public.dast_scans(id) ON DELETE CASCADE,
  subdomain     text NOT NULL,
  ip            text,
  discovered_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dast_recon_subdomains_scan ON public.dast_recon_subdomains (scan_id);

CREATE TABLE IF NOT EXISTS public.dast_retest_history (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vulnerability_id uuid NOT NULL REFERENCES public.dast_vulnerabilities(id) ON DELETE CASCADE,
  engine           text,
  result           text NOT NULL,
  raw_output       jsonb,
  tested_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dast_retest_history_vuln ON public.dast_retest_history (vulnerability_id);

-- Agendamentos de scan (dast.functions.ts grava run_at_time como "HH:MM:00").
CREATE TABLE IF NOT EXISTS public.dast_scan_schedules (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text,
  target_url  text,
  domain      text,
  mode        text,
  level       text,
  engines     text[] NOT NULL DEFAULT '{}',
  config      jsonb,
  frequency   text,
  run_at_time time,
  next_run_at timestamptz,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_dast_scan_schedules_next_run ON public.dast_scan_schedules (next_run_at) WHERE active;

ALTER TABLE public.dast_scans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dast_vulnerabilities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dast_recon_subdomains ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dast_retest_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dast_scan_schedules ENABLE ROW LEVEL SECURITY;
