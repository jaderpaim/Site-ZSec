-- Cache de dados da API Gophish para consulta offline e sync agendado
CREATE TABLE IF NOT EXISTS public.gophish_cache (
  key        TEXT        PRIMARY KEY,
  data       JSONB       NOT NULL DEFAULT '[]'::jsonb,
  synced_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  error      TEXT
);

ALTER TABLE public.gophish_cache ENABLE ROW LEVEL SECURITY;

-- Leitura para usuários autenticados; escrita apenas via service role (bypasses RLS)
CREATE POLICY "authenticated read gophish_cache"
  ON public.gophish_cache FOR SELECT
  TO authenticated USING (true);

-- Pré-popula as chaves (idempotente)
INSERT INTO public.gophish_cache (key, data) VALUES
  ('campaigns', '[]'::jsonb),
  ('templates', '[]'::jsonb),
  ('groups',    '[]'::jsonb),
  ('users',     '[]'::jsonb)
ON CONFLICT (key) DO NOTHING;
