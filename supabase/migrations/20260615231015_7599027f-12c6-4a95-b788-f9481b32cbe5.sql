
-- Cloudflare
DROP POLICY IF EXISTS "auth view cf dns" ON public.cloudflare_dns_records;
CREATE POLICY "admin+analista view cf dns" ON public.cloudflare_dns_records FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role));

DROP POLICY IF EXISTS "auth view cf zones" ON public.cloudflare_zones;
CREATE POLICY "admin+analista view cf zones" ON public.cloudflare_zones FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role));

DROP POLICY IF EXISTS "auth view cf snapshots" ON public.cloudflare_snapshots;
CREATE POLICY "admin+analista view cf snapshots" ON public.cloudflare_snapshots FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role));

DROP POLICY IF EXISTS "auth view cf state" ON public.cloudflare_sync_state;
CREATE POLICY "admin+analista view cf state" ON public.cloudflare_sync_state FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role));

-- GoPhish
DROP POLICY IF EXISTS "authenticated read gophish_cache" ON public.gophish_cache;
CREATE POLICY "admin+analista read gophish_cache" ON public.gophish_cache FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role));

-- QRadar
DROP POLICY IF EXISTS "auth view qradar log sources" ON public.qradar_log_sources;
CREATE POLICY "admin+analista view qradar log sources" ON public.qradar_log_sources FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role));

DROP POLICY IF EXISTS "auth view qradar drop alerts" ON public.qradar_drop_alerts;
CREATE POLICY "admin+analista view qradar drop alerts" ON public.qradar_drop_alerts FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role));

DROP POLICY IF EXISTS "auth view qradar eps samples" ON public.qradar_eps_samples;
CREATE POLICY "admin+analista view qradar eps samples" ON public.qradar_eps_samples FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role));

DROP POLICY IF EXISTS "auth view qradar sync state" ON public.qradar_sync_state;
CREATE POLICY "admin+analista view qradar sync state" ON public.qradar_sync_state FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role));

-- Sophos
DROP POLICY IF EXISTS "auth view sophos policies" ON public.sophos_policies;
CREATE POLICY "admin+analista view sophos policies" ON public.sophos_policies FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role));

DROP POLICY IF EXISTS "auth view sophos sync state" ON public.sophos_sync_state;
CREATE POLICY "admin+analista view sophos sync state" ON public.sophos_sync_state FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role));

-- app_settings: restringe leitura a admin/analista
DROP POLICY IF EXISTS "leitura autenticada" ON public.app_settings;
CREATE POLICY "admin+analista read app_settings" ON public.app_settings FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role));

-- email_logs: restringe insert a admin/analista e força created_by = auth.uid()
DROP POLICY IF EXISTS "auth insert email logs" ON public.email_logs;
CREATE POLICY "admin+analista insert email logs" ON public.email_logs FOR INSERT TO authenticated WITH CHECK ((has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role)) AND (created_by IS NULL OR created_by = auth.uid()));
