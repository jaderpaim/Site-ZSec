
-- Snapshots locais para o histórico evolutivo Cloudflare (24h/7d/30d)
CREATE TABLE IF NOT EXISTS public.cloudflare_snapshots (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  captured_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  zone_id TEXT NOT NULL,
  range_days INT NOT NULL,
  payload JSONB NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS cloudflare_snapshots_zone_time
  ON public.cloudflare_snapshots (zone_id, captured_at DESC);

ALTER TABLE public.cloudflare_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth view cf snapshots"
  ON public.cloudflare_snapshots FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "analyst+admin insert cf snapshots"
  ON public.cloudflare_snapshots FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'analista'::app_role));
