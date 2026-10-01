-- A tela de login (usuário anônimo) ficou sem o botão "Entrar com Microsoft":
-- get_sso_public_config() está com EXECUTE negado para `anon` em produção
-- ("permission denied for function get_sso_public_config", 42501), mesmo
-- as migrations anteriores (20260619002604 / 20260619020150) já tendo o
-- GRANT EXECUTE TO anon, authenticated. A config em sso_config está correta
-- (oauth_enabled = true, azure_tenant_id/client_id preenchidos) — o problema
-- é só a permissão da função não ter "pegado" em produção. Reaplica de forma
-- idempotente: redefine a função (SECURITY DEFINER, sem depender de RLS na
-- tabela) e regrava o GRANT.

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

REVOKE ALL ON FUNCTION public.get_sso_public_config() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_sso_public_config() TO anon, authenticated, service_role;