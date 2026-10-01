DROP FUNCTION IF EXISTS public.get_sso_start_config(text);

CREATE OR REPLACE FUNCTION public.get_sso_public_config()
RETURNS TABLE (
  oauth_enabled boolean,
  saml_enabled boolean,
  allowed_domains text[],
  azure_tenant_id text,
  azure_client_id text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    s.oauth_enabled,
    s.saml_enabled,
    s.allowed_domains,
    s.azure_tenant_id,
    s.azure_client_id
  FROM public.sso_config s
  ORDER BY s.updated_at DESC
  LIMIT 1;
$$;

REVOKE SELECT ON public.sso_config FROM authenticated;
REVOKE SELECT ON public.sso_config FROM anon;
GRANT SELECT (oauth_enabled, saml_enabled, allowed_domains, azure_tenant_id, azure_client_id, updated_at) ON public.sso_config TO anon, authenticated;
GRANT ALL ON public.sso_config TO service_role;

DROP POLICY IF EXISTS "sso_config_public_safe_read" ON public.sso_config;
CREATE POLICY "sso_config_public_safe_read" ON public.sso_config
  FOR SELECT
  TO anon, authenticated
  USING (true);

REVOKE ALL ON FUNCTION public.get_sso_public_config() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_sso_public_config() TO anon, authenticated, service_role;