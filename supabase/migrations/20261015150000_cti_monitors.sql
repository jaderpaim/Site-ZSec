-- CTI — Monitoramento: regras que verificam vazamentos NOVOS (desde a última
-- rodada) e avisam pelos canais de alerta já cadastrados. Reaproveita a coleta
-- do CTI (first_seen_at marca quando coletamos) e o cruzamento com o AD.

CREATE TABLE public.leakradar_monitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  -- escopo
  scope_category text NOT NULL DEFAULT 'all'
    CHECK (scope_category IN ('employees', 'customers', 'third_parties', 'all')),
  host text, -- filtro por site (url_host contém), opcional
  keyword text, -- filtro por termo (usuário/url contém), opcional
  -- condições extras de alerta
  cond_senha_valida boolean NOT NULL DEFAULT false, -- só senha ainda válida no AD
  cond_sem_mfa boolean NOT NULL DEFAULT false, -- só contas sem MFA
  open_incident boolean NOT NULL DEFAULT false, -- abre incidente ao encontrar
  -- canais: ids de leakradar_incident_channels; vazio = todos habilitados
  channel_ids uuid[] NOT NULL DEFAULT '{}',
  enabled boolean NOT NULL DEFAULT true,
  last_run_at timestamptz,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.leakradar_monitors TO authenticated;
GRANT ALL ON public.leakradar_monitors TO service_role;
ALTER TABLE public.leakradar_monitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leakradar_monitors FORCE ROW LEVEL SECURITY;

CREATE POLICY "threat intel view monitors by permission" ON public.leakradar_monitors
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_module_admin(auth.uid(), 'threat-intel'::text)
    OR public.has_module_permission(auth.uid(), 'threat-intel'::text, 'view'::text)
  );
CREATE POLICY "service role write leakradar monitors" ON public.leakradar_monitors
  FOR ALL TO service_role
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS tg_leakradar_monitors_updated ON public.leakradar_monitors;
CREATE TRIGGER tg_leakradar_monitors_updated
  BEFORE UPDATE ON public.leakradar_monitors
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Execuções (histórico das verificações).
CREATE TABLE public.leakradar_monitor_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  monitor_id uuid REFERENCES public.leakradar_monitors (id) ON DELETE CASCADE,
  ran_at timestamptz NOT NULL DEFAULT now(),
  checked integer NOT NULL DEFAULT 0,
  found integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'ok' CHECK (status IN ('ok', 'erro')),
  detail text
);

CREATE INDEX idx_leakradar_monitor_runs ON public.leakradar_monitor_runs (monitor_id, ran_at DESC);

GRANT SELECT ON public.leakradar_monitor_runs TO authenticated;
GRANT ALL ON public.leakradar_monitor_runs TO service_role;
ALTER TABLE public.leakradar_monitor_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leakradar_monitor_runs FORCE ROW LEVEL SECURITY;

CREATE POLICY "threat intel view monitor runs by permission" ON public.leakradar_monitor_runs
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_module_admin(auth.uid(), 'threat-intel'::text)
    OR public.has_module_permission(auth.uid(), 'threat-intel'::text, 'view'::text)
  );
CREATE POLICY "service role write leakradar monitor runs" ON public.leakradar_monitor_runs
  FOR ALL TO service_role
  USING (auth.role() = 'service_role') WITH CHECK (auth.role() = 'service_role');

-- Cron do monitoramento (desligado; ativar na tela Cron Jobs). A cada hora.
INSERT INTO public.cron_job_runs (job_name, label, expected_interval_minutes, hook_path, enabled)
VALUES ('cti-monitor-run', 'Threat Intel — Monitoramento (alerta de vazamento novo)', 60, '/api/public/hooks/cti-monitor-run', false)
ON CONFLICT (job_name) DO NOTHING;
