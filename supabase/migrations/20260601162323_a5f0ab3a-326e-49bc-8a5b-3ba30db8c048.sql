
ALTER TABLE public.gmud_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vuln_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qradar_external_offenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qradar_internal_offenders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qradar_o365_deletions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.qradar_o365_downloads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth view gmud logs" ON public.gmud_logs FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'analista'::app_role));
CREATE POLICY "auth insert gmud logs" ON public.gmud_logs FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'analista'::app_role));

CREATE POLICY "auth view vuln logs" ON public.vuln_logs FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'analista'::app_role));
CREATE POLICY "auth insert vuln logs" ON public.vuln_logs FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'analista'::app_role));

CREATE POLICY "auth view qradar ext off" ON public.qradar_external_offenders FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'analista'::app_role));
CREATE POLICY "analyst+admin write qradar ext off" ON public.qradar_external_offenders FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'analista'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'analista'::app_role));

CREATE POLICY "auth view qradar int off" ON public.qradar_internal_offenders FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'analista'::app_role));
CREATE POLICY "analyst+admin write qradar int off" ON public.qradar_internal_offenders FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'analista'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'analista'::app_role));

CREATE POLICY "auth view qradar o365 del" ON public.qradar_o365_deletions FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'analista'::app_role));
CREATE POLICY "analyst+admin write qradar o365 del" ON public.qradar_o365_deletions FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'analista'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'analista'::app_role));

CREATE POLICY "auth view qradar o365 dl" ON public.qradar_o365_downloads FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'analista'::app_role));
CREATE POLICY "analyst+admin write qradar o365 dl" ON public.qradar_o365_downloads FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'analista'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'analista'::app_role));
