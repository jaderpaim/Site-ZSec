
-- Tighten audit_logs INSERT: only admin/analista can write entries
DROP POLICY IF EXISTS "audit_insert" ON public.audit_logs;
CREATE POLICY "audit_insert admin/analista" ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'analista'::app_role)
  );

-- Restrict SELECT on security telemetry tables to admin/analista
DROP POLICY IF EXISTS "auth view sophos alerts" ON public.sophos_alerts;
CREATE POLICY "admin/analista view sophos alerts" ON public.sophos_alerts
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'analista'::app_role));

DROP POLICY IF EXISTS "auth view sophos events" ON public.sophos_events;
CREATE POLICY "admin/analista view sophos events" ON public.sophos_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'analista'::app_role));

DROP POLICY IF EXISTS "auth view sophos endpoints" ON public.sophos_endpoints;
CREATE POLICY "admin/analista view sophos endpoints" ON public.sophos_endpoints
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'analista'::app_role));

DROP POLICY IF EXISTS "auth view qradar offenses" ON public.qradar_offenses;
CREATE POLICY "admin/analista view qradar offenses" ON public.qradar_offenses
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'analista'::app_role));

DROP POLICY IF EXISTS "auth view qradar rdp events" ON public.qradar_rdp_events;
CREATE POLICY "admin/analista view qradar rdp events" ON public.qradar_rdp_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'analista'::app_role));

DROP POLICY IF EXISTS "auth view ia web events" ON public.ia_web_events;
CREATE POLICY "admin/analista view ia web events" ON public.ia_web_events
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'analista'::app_role));

DROP POLICY IF EXISTS "auth view gmuds" ON public.gmuds;
CREATE POLICY "admin/analista view gmuds" ON public.gmuds
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'analista'::app_role));
