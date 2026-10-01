-- Tabelas do módulo Privacy Tools (LGPD)
-- Relatórios: Consentimentos, Cookies Incrementais, Uso Mensal

-- ── privacy_consentimentos_daily ──────────────────────────────────────────────
CREATE TABLE public.privacy_consentimentos_daily (
  id                   uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  date                 date    NOT NULL,
  grupo                text    NOT NULL DEFAULT '',
  hipotese_tratamento  text    NOT NULL DEFAULT '',
  concedidos           integer NOT NULL DEFAULT 0,
  recusados            integer NOT NULL DEFAULT 0,
  total                integer NOT NULL DEFAULT 0,
  titulares_concedidos integer NOT NULL DEFAULT 0,
  titulares_recusados  integer NOT NULL DEFAULT 0,
  titulares_mistos     integer NOT NULL DEFAULT 0,
  titulares_total      integer NOT NULL DEFAULT 0,
  synced_at            timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (date, grupo, hipotese_tratamento)
);

CREATE INDEX idx_privacy_consentimentos_date ON public.privacy_consentimentos_daily (date DESC);

ALTER TABLE public.privacy_consentimentos_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "privacy_consentimentos_select" ON public.privacy_consentimentos_daily
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_module_admin(auth.uid(), 'privacy-tools'::text)
    OR public.has_module_permission(auth.uid(), 'privacy-tools'::text, 'view'::text)
  );

GRANT SELECT ON public.privacy_consentimentos_daily TO authenticated;
GRANT ALL   ON public.privacy_consentimentos_daily TO service_role;

-- ── privacy_cookies_daily ─────────────────────────────────────────────────────
CREATE TABLE public.privacy_cookies_daily (
  id         uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  date       date    NOT NULL UNIQUE,
  concedidos integer NOT NULL DEFAULT 0,
  recusados  integer NOT NULL DEFAULT 0,
  total      integer NOT NULL DEFAULT 0,
  synced_at  timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_privacy_cookies_date ON public.privacy_cookies_daily (date DESC);

ALTER TABLE public.privacy_cookies_daily ENABLE ROW LEVEL SECURITY;

CREATE POLICY "privacy_cookies_select" ON public.privacy_cookies_daily
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_module_admin(auth.uid(), 'privacy-tools'::text)
    OR public.has_module_permission(auth.uid(), 'privacy-tools'::text, 'view'::text)
  );

GRANT SELECT ON public.privacy_cookies_daily TO authenticated;
GRANT ALL   ON public.privacy_cookies_daily TO service_role;

-- ── privacy_uso_mensal ────────────────────────────────────────────────────────
CREATE TABLE public.privacy_uso_mensal (
  id            uuid    PRIMARY KEY DEFAULT gen_random_uuid(),
  ano           integer NOT NULL,
  mes           integer NOT NULL CHECK (mes BETWEEN 1 AND 12),
  page_views    bigint  NOT NULL DEFAULT 0,
  num_sites     integer NOT NULL DEFAULT 0,
  num_empresas  integer NOT NULL DEFAULT 0,
  num_titulares bigint  NOT NULL DEFAULT 0,
  synced_at     timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ano, mes)
);

CREATE INDEX idx_privacy_uso_ano_mes ON public.privacy_uso_mensal (ano DESC, mes DESC);

ALTER TABLE public.privacy_uso_mensal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "privacy_uso_select" ON public.privacy_uso_mensal
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_module_admin(auth.uid(), 'privacy-tools'::text)
    OR public.has_module_permission(auth.uid(), 'privacy-tools'::text, 'view'::text)
  );

GRANT SELECT ON public.privacy_uso_mensal TO authenticated;
GRANT ALL   ON public.privacy_uso_mensal TO service_role;

-- ── Registrar cron job ────────────────────────────────────────────────────────
INSERT INTO public.cron_job_runs (job_name, label, expected_interval_minutes, hook_path)
VALUES (
  'privacy-tools-sync',
  'Privacy Tools — Sincronização Diária',
  1440,
  '/api/public/hooks/privacy-tools-sync'
)
ON CONFLICT (job_name) DO NOTHING;
