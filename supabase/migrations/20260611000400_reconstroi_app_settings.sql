-- Reconstrução: app_settings existia no banco de origem sem migration de
-- criação. As migrations seguintes (20260611000500, 20260615124810,
-- 20260615231015) só ajustam as policies dela.
--
-- Chave/valor de configurações do app (Upload.tsx faz upsert por key).
-- Colunas deduzidas de src/integrations/supabase/types.ts.

CREATE TABLE IF NOT EXISTS public.app_settings (
  key        text PRIMARY KEY,
  value      jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.app_settings ENABLE ROW LEVEL SECURITY;
