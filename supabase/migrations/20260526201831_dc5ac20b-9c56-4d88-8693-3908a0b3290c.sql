
-- =============== ia_web_events ===============
CREATE TABLE IF NOT EXISTS public.ia_web_events (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  event_at timestamptz NOT NULL,
  user_name text,
  endpoint_name text,
  domain text,
  raw_event text,
  source_event_id text,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ia_web_events_event_at ON public.ia_web_events (event_at DESC);
CREATE INDEX IF NOT EXISTS idx_ia_web_events_user ON public.ia_web_events (user_name);
CREATE INDEX IF NOT EXISTS idx_ia_web_events_domain ON public.ia_web_events (domain);

GRANT SELECT ON public.ia_web_events TO authenticated;
GRANT ALL ON public.ia_web_events TO service_role;

ALTER TABLE public.ia_web_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth view ia web events"
  ON public.ia_web_events FOR SELECT TO authenticated USING (true);

CREATE POLICY "analyst+admin write ia web events"
  ON public.ia_web_events FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'analista'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'analista'::app_role));

-- =============== colaboradores ===============
CREATE TABLE IF NOT EXISTS public.colaboradores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  display_name text NOT NULL,
  email text NOT NULL UNIQUE,
  unidade text,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  cargo text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE INDEX IF NOT EXISTS idx_colaboradores_department ON public.colaboradores (department_id);
CREATE INDEX IF NOT EXISTS idx_colaboradores_email ON public.colaboradores (lower(email));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.colaboradores TO authenticated;
GRANT ALL ON public.colaboradores TO service_role;

ALTER TABLE public.colaboradores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth view colaboradores"
  ON public.colaboradores FOR SELECT TO authenticated USING (true);

CREATE POLICY "analyst+admin insert colaboradores"
  ON public.colaboradores FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'analista'::app_role));

CREATE POLICY "analyst+admin update colaboradores"
  ON public.colaboradores FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'analista'::app_role));

CREATE POLICY "admin delete colaboradores"
  ON public.colaboradores FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'analista'::app_role));

CREATE TRIGGER trg_colaboradores_updated_at
  BEFORE UPDATE ON public.colaboradores
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
