
DROP POLICY IF EXISTS "sso_config_public_safe_read" ON public.sso_config;

CREATE OR REPLACE FUNCTION public.get_sso_public_config()
 RETURNS TABLE(oauth_enabled boolean, saml_enabled boolean, allowed_domains text[], azure_tenant_id text, azure_client_id text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    s.oauth_enabled,
    s.saml_enabled,
    s.allowed_domains,
    s.azure_tenant_id,
    s.azure_client_id
  FROM public.sso_config s
  ORDER BY s.updated_at DESC
  LIMIT 1;
$function$;

GRANT EXECUTE ON FUNCTION public.get_sso_public_config() TO anon, authenticated;
