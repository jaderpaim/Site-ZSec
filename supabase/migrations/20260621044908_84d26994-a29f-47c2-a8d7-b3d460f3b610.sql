
REVOKE EXECUTE ON FUNCTION public.get_sso_public_config() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_sso_public_config() TO service_role;
