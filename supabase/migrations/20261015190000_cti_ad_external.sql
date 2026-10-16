-- Identidades externas/federadas (UPN com #EXT#) e convidados saem da inferência
-- de risco do AD: a senha deles não fica no tenant, então "senha ainda válida"
-- (last_password_change < added_at) não é confiável para essas contas.
CREATE OR REPLACE FUNCTION public.leakradar_ad_alert()
RETURNS TABLE (em_risco bigint, sem_mfa bigint, sem_dados bigint, afetados bigint)
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  WITH emp AS (
    SELECT lower(l.username) AS email,
           max(l.added_at) AS latest_added,
           bool_or(l.status NOT IN ('resolvido', 'falso_positivo')) AS ativo
    FROM public.leakradar_leaks l
    WHERE l.category = 'employees' AND l.username IS NOT NULL AND position('*' in l.username) = 0
    GROUP BY lower(l.username)
  ),
  joined AS (
    SELECT e.email,
           (a.email IS NOT NULL) AS tem_ad,
           a.mfa_registered,
           (a.account_enabled
             AND coalesce(a.user_type, 'Member') <> 'Guest'
             AND coalesce(a.user_principal_name, '') NOT LIKE '%#EXT#%'
             AND a.last_password_change IS NOT NULL
             AND e.latest_added IS NOT NULL
             AND a.last_password_change < e.latest_added) AS em_risco
    FROM emp e
    LEFT JOIN public.leakradar_ad_status a ON a.email = e.email
    WHERE e.ativo
  )
  SELECT count(*) FILTER (WHERE em_risco)::bigint,
         count(*) FILTER (WHERE em_risco AND mfa_registered IS DISTINCT FROM true)::bigint,
         count(*) FILTER (WHERE NOT tem_ad)::bigint,
         count(*)::bigint
  FROM joined;
$$;

CREATE OR REPLACE FUNCTION public.leakradar_ad_risk_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY INVOKER SET search_path = public
AS $$
  SELECT l.id
  FROM public.leakradar_leaks l
  JOIN public.leakradar_ad_status a ON a.email = lower(l.username)
  WHERE l.category = 'employees'
    AND a.account_enabled IS TRUE
    AND coalesce(a.user_type, 'Member') <> 'Guest'
    AND coalesce(a.user_principal_name, '') NOT LIKE '%#EXT#%'
    AND a.last_password_change IS NOT NULL
    AND l.added_at IS NOT NULL
    AND a.last_password_change < l.added_at
    AND l.status NOT IN ('resolvido', 'falso_positivo');
$$;
