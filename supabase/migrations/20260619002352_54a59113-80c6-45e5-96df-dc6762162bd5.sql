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
SECURITY DEFINER
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

REVOKE ALL ON FUNCTION public.get_sso_public_config() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_sso_public_config() TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_sso_start_config(_email text DEFAULT NULL)
RETURNS TABLE (
  oauth_enabled boolean,
  saml_enabled boolean,
  allowed_domains text[],
  azure_tenant_id text,
  azure_client_id text,
  profile_exists boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH cfg AS (
    SELECT
      s.oauth_enabled,
      s.saml_enabled,
      s.allowed_domains,
      s.azure_tenant_id,
      s.azure_client_id
    FROM public.sso_config s
    ORDER BY s.updated_at DESC
    LIMIT 1
  )
  SELECT
    c.oauth_enabled,
    c.saml_enabled,
    c.allowed_domains,
    c.azure_tenant_id,
    c.azure_client_id,
    CASE
      WHEN NULLIF(trim(_email), '') IS NULL THEN true
      WHEN split_part(lower(_email), '@', 2) <> ALL(c.allowed_domains) THEN false
      ELSE EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE lower(p.email) = lower(_email)
      )
    END AS profile_exists
  FROM cfg c;
$$;

REVOKE ALL ON FUNCTION public.get_sso_start_config(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_sso_start_config(text) TO anon, authenticated, service_role;