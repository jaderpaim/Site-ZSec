-- Quebra dos endpoints (não-servidor) sem criptografia entre notebook e
-- desktop, via convenção de hostname (NB/NL/NMTD = notebook; resto =
-- desktop). Sophos Central não expõe chassis/forma física do equipamento
-- na API de tenant, então usamos o padrão de nomenclatura já adotado.
CREATE OR REPLACE FUNCTION public.sophos_unencrypted_device_class()
 RETURNS TABLE(device_class text, total bigint)
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
  SELECT
    CASE
      WHEN hostname ~* '^(nb|nl|nmtd)' THEN 'notebook'
      ELSE 'desktop'
    END AS device_class,
    count(*) AS total
  FROM public.sophos_endpoints
  WHERE encrypted IS DISTINCT FROM true
    AND lower(type) <> 'server'
  GROUP BY device_class;
$function$;

REVOKE EXECUTE ON FUNCTION public.sophos_unencrypted_device_class() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sophos_unencrypted_device_class() TO authenticated, service_role;
