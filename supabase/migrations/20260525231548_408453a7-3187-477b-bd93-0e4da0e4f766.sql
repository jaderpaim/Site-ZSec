
ALTER TABLE public.gmud_aprovadores
  ADD COLUMN IF NOT EXISTS ordem integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS notificado_em timestamptz;

-- Backfill ordem for existing rows (per gmud)
WITH ranked AS (
  SELECT id, row_number() OVER (PARTITION BY gmud_id ORDER BY created_at, id) AS rn
  FROM public.gmud_aprovadores
)
UPDATE public.gmud_aprovadores a
SET ordem = r.rn
FROM ranked r
WHERE a.id = r.id;

CREATE INDEX IF NOT EXISTS gmud_aprovadores_gmud_ordem_idx
  ON public.gmud_aprovadores (gmud_id, ordem);

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;
