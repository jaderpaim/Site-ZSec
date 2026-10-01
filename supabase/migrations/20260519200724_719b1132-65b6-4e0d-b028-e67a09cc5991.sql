
CREATE TABLE public.import_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module text NOT NULL,
  filename text,
  status text NOT NULL CHECK (status IN ('success','error','partial')),
  imported_count integer NOT NULL DEFAULT 0,
  ignored_count integer NOT NULL DEFAULT 0,
  total_count integer NOT NULL DEFAULT 0,
  message text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.import_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth view import logs" ON public.import_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "analyst+admin insert import logs" ON public.import_logs FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'analista'::app_role));
CREATE INDEX idx_import_logs_created_at ON public.import_logs (created_at DESC);

CREATE TABLE public.api_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL,
  status text NOT NULL CHECK (status IN ('success','error')),
  http_status integer,
  message text,
  duration_ms integer,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.api_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth view api logs" ON public.api_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "analyst+admin insert api logs" ON public.api_logs FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'analista'::app_role));
CREATE INDEX idx_api_logs_created_at ON public.api_logs (created_at DESC);
