
-- Restrict app_settings reads to authenticated users (was USING true)
DROP POLICY IF EXISTS "leitura publica" ON public.app_settings;
CREATE POLICY "leitura autenticada" ON public.app_settings
  FOR SELECT TO authenticated
  USING (true);

-- Revoke anon/public EXECUTE on internal trigger function
REVOKE EXECUTE ON FUNCTION public.sync_vulns_responsible_from_application() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_vulns_responsible_from_application() FROM anon;
