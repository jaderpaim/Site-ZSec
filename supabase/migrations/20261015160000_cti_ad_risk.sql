-- IDs das credenciais de colaborador "em risco no AD": conta ativa e senha não
-- trocada desde o vazamento (last_password_change < added_at). Usado pelo filtro
-- "Em risco (AD)" da tabela. SECURITY INVOKER: roda sob a RLS de quem chama.
CREATE OR REPLACE FUNCTION public.leakradar_ad_risk_ids()
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT l.id
  FROM public.leakradar_leaks l
  JOIN public.leakradar_ad_status a ON a.email = lower(l.username)
  WHERE l.category = 'employees'
    AND a.account_enabled IS TRUE
    AND a.last_password_change IS NOT NULL
    AND l.added_at IS NOT NULL
    AND a.last_password_change < l.added_at
    AND l.status NOT IN ('resolvido', 'falso_positivo');
$$;

REVOKE EXECUTE ON FUNCTION public.leakradar_ad_risk_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leakradar_ad_risk_ids() TO authenticated;
