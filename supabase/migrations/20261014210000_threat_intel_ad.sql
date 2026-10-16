-- Threat Intelligence — cruzamento com o Entra ID (Microsoft Graph).
-- Guarda, por colaborador, a data da última troca de senha, status de MFA e se a
-- conta está ativa. A faixa de alerta usa isso para destacar credenciais cuja
-- senha vazada ainda não foi trocada (e sem MFA). Coleta: leakradar-ad.server.ts.
CREATE TABLE public.leakradar_ad_status (
  email text PRIMARY KEY,
  entra_oid text,
  last_password_change timestamptz,
  mfa_registered boolean,
  mfa_capable boolean,
  account_enabled boolean,
  error text,
  checked_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.leakradar_ad_status TO authenticated;
GRANT ALL ON public.leakradar_ad_status TO service_role;

ALTER TABLE public.leakradar_ad_status ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leakradar_ad_status FORCE ROW LEVEL SECURITY;

CREATE POLICY "threat intel view ad status by permission" ON public.leakradar_ad_status
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_module_admin(auth.uid(), 'threat-intel'::text)
    OR public.has_module_permission(auth.uid(), 'threat-intel'::text, 'view'::text)
  );

CREATE POLICY "service role write leakradar ad status" ON public.leakradar_ad_status
  FOR ALL TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Faixa de alerta: por conta de colaborador com vazamento ativo, cruza com o AD.
-- Em risco = conta ativa e última troca de senha ANTERIOR ao vazamento mais
-- recente (senha vazada provavelmente ainda vale). Sem MFA = desses, sem MFA.
-- SECURITY INVOKER: roda sob a RLS de quem chama.
CREATE OR REPLACE FUNCTION public.leakradar_ad_alert()
RETURNS TABLE (em_risco bigint, sem_mfa bigint, sem_dados bigint, afetados bigint)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH emp AS (
    SELECT lower(l.username) AS email,
           max(l.added_at) AS latest_added,
           bool_or(l.status NOT IN ('resolvido', 'falso_positivo')) AS ativo
    FROM public.leakradar_leaks l
    WHERE l.category = 'employees'
      AND l.username IS NOT NULL
      AND position('*' in l.username) = 0
    GROUP BY lower(l.username)
  ),
  joined AS (
    SELECT e.email,
           (a.email IS NOT NULL) AS tem_ad,
           a.mfa_registered,
           (a.account_enabled
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

REVOKE EXECUTE ON FUNCTION public.leakradar_ad_alert() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.leakradar_ad_alert() TO authenticated;

-- Cron da coleta AD (desligado; ativar na tela Cron Jobs). Diário.
INSERT INTO public.cron_job_runs (job_name, label, expected_interval_minutes, hook_path, enabled)
VALUES ('ad-status-sync', 'Threat Intel — Cruzamento com AD/Entra (Graph)', 1440, '/api/public/hooks/ad-status-sync', false)
ON CONFLICT (job_name) DO NOTHING;
