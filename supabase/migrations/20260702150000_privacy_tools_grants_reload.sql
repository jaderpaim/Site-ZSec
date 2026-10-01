-- Re-aplica grants das tabelas Privacy Tools e força reload do schema cache.
-- Necessário porque as tabelas foram criadas mas o PostgREST não as reconheceu.

CREATE TABLE IF NOT EXISTS public.privacy_consentamentos_daily (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  date                 date        NOT NULL,
  grupo                text        NOT NULL DEFAULT '',
  hipotese_tratamento  text        NOT NULL DEFAULT '',
  concedidos           integer     NOT NULL DEFAULT 0,
  recusados            integer     NOT NULL DEFAULT 0,
  total                integer     NOT NULL DEFAULT 0,
  titulares_concedidos integer     NOT NULL DEFAULT 0,
  titulares_recusados  integer     NOT NULL DEFAULT 0,
  titulares_mistos     integer     NOT NULL DEFAULT 0,
  titulares_total      integer     NOT NULL DEFAULT 0,
  synced_at            timestamptz NOT NULL DEFAULT now(),
  created_at           timestamptz NOT NULL DEFAULT now(),
  UNIQUE (date, grupo, hipotese_tratamento)
);

CREATE TABLE IF NOT EXISTS public.privacy_cookies_daily (
  id         uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  date       date        NOT NULL UNIQUE,
  concedidos integer     NOT NULL DEFAULT 0,
  recusados  integer     NOT NULL DEFAULT 0,
  total      integer     NOT NULL DEFAULT 0,
  synced_at  timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.privacy_uso_mensal (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  ano           integer     NOT NULL,
  mes           integer     NOT NULL CHECK (mes BETWEEN 1 AND 12),
  page_views    bigint      NOT NULL DEFAULT 0,
  num_sites     integer     NOT NULL DEFAULT 0,
  num_empresas  integer     NOT NULL DEFAULT 0,
  num_titulares bigint      NOT NULL DEFAULT 0,
  synced_at     timestamptz NOT NULL DEFAULT now(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ano, mes)
);

-- Grants
GRANT SELECT ON public.privacy_consentamentos_daily TO authenticated;
GRANT ALL    ON public.privacy_consentamentos_daily TO service_role;

GRANT SELECT ON public.privacy_cookies_daily TO authenticated;
GRANT ALL    ON public.privacy_cookies_daily TO service_role;

GRANT SELECT ON public.privacy_uso_mensal TO authenticated;
GRANT ALL    ON public.privacy_uso_mensal TO service_role;

-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
