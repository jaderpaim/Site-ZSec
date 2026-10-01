ALTER TABLE public.cron_http_dispatch_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins can view cron dispatch log" ON public.cron_http_dispatch_log FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));
REVOKE ALL ON public.cron_http_dispatch_log FROM anon, authenticated;
GRANT SELECT ON public.cron_http_dispatch_log TO authenticated;
GRANT ALL ON public.cron_http_dispatch_log TO service_role;