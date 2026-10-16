-- Log de eventos da credencial (append-only): cada mudança vira um evento, para
-- o histórico mostrar a sequência completa (status, marcadores com justificativa,
-- transições do incidente aberto→em tratamento→concluído, validação, desbloqueio).
CREATE TABLE public.leakradar_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leak_id uuid NOT NULL REFERENCES public.leakradar_leaks (id) ON DELETE CASCADE,
  incident_id uuid REFERENCES public.leakradar_incidents (id) ON DELETE SET NULL,
  label text NOT NULL,
  detail text,
  tone text, -- ok | warn | crit | info | neutral (cor no histórico)
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_leakradar_events_leak ON public.leakradar_events (leak_id, created_at);

GRANT SELECT ON public.leakradar_events TO authenticated;
GRANT ALL ON public.leakradar_events TO service_role;

ALTER TABLE public.leakradar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leakradar_events FORCE ROW LEVEL SECURITY;

CREATE POLICY "threat intel view events by permission" ON public.leakradar_events
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_module_admin(auth.uid(), 'threat-intel'::text)
    OR public.has_module_permission(auth.uid(), 'threat-intel'::text, 'view'::text)
  );

CREATE POLICY "service role write leakradar events" ON public.leakradar_events
  FOR ALL TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');
