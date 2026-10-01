-- get_exec_ia_overview e get_exec_vulnerabilities_overview (ver
-- 20260622150000_secure_definer_ia_vuln_rpcs.sql) só liberam a chamada para
-- has_role() admin/analista. Isso quebra o Painel Executivo para usuários que
-- têm apenas `painel-executivo:view` (ex.: perfil executivo, sem acesso aos
-- módulos operacionais de IA/Vulnerabilidades): os cards de IA e
-- Vulnerabilidades ficam sempre vazios, mesmo com o domínio habilitado no
-- radar, porque a função RAISE EXCEPTION antes de agregar os dados.
--
-- Adiciona has_module_permission(auth.uid(), 'painel-executivo', 'view') como
-- alternativa ao papel admin/analista — mesmo padrão de gate já usado no
-- getExecutiveOverview (executive.functions.ts).

CREATE OR REPLACE FUNCTION public.get_exec_ia_overview(p_since timestamptz)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'analista'::app_role)
    OR public.has_module_permission(auth.uid(), 'painel-executivo', 'view')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  WITH ev AS (
    SELECT user_name, domain FROM public.ia_web_events WHERE event_at >= p_since
  )
  SELECT jsonb_build_object(
    'activeUsers', (SELECT COUNT(DISTINCT lower(trim(user_name))) FROM ev WHERE user_name IS NOT NULL),
    'totalEvents', (SELECT COUNT(*) FROM ev),
    'topTools', COALESCE((
      SELECT jsonb_agg(row ORDER BY (row->>'count')::int DESC)
      FROM (
        SELECT jsonb_build_object('tool', domain, 'count', COUNT(*)) AS row
        FROM ev WHERE domain IS NOT NULL
        GROUP BY domain
        ORDER BY COUNT(*) DESC
        LIMIT 8
      ) t
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_exec_vulnerabilities_overview(
  p_since30 timestamptz,
  p_since60 timestamptz
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'analista'::app_role)
    OR public.has_module_permission(auth.uid(), 'painel-executivo', 'view')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  WITH v AS (
    SELECT
      lower(severity::text) AS sev,
      COALESCE(lower(status::text), '') AS st,
      COALESCE(status_changed_at, closed_at) AS close_at
    FROM public.vulnerabilities_aplicacao
  ),
  open_rows AS (
    SELECT * FROM v WHERE st NOT IN ('mitigada','fechada','resolvida','closed','resolved')
  ),
  closed_rows AS (
    SELECT * FROM v
    WHERE st IN ('mitigada','fechada','resolvida','closed','resolved')
      AND close_at IS NOT NULL
  ),
  fixed_30 AS (
    SELECT * FROM closed_rows WHERE close_at >= p_since30
  ),
  fixed_prev AS (
    SELECT * FROM closed_rows WHERE close_at >= p_since60 AND close_at < p_since30
  )
  SELECT jsonb_build_object(
    'current', jsonb_build_object(
      'criticas', (SELECT COUNT(*) FROM open_rows WHERE sev IN ('crítica','critica','critical')),
      'altas',    (SELECT COUNT(*) FROM open_rows WHERE sev IN ('alta','high')),
      'medias',   (SELECT COUNT(*) FROM open_rows WHERE sev IN ('média','media','medium')),
      'baixas',   (SELECT COUNT(*) FROM open_rows WHERE sev IN ('baixa','low')),
      'abertas',  (SELECT COUNT(*) FROM open_rows)
    ),
    'fixed30d', jsonb_build_object(
      'total',    (SELECT COUNT(*) FROM fixed_30),
      'criticas', (SELECT COUNT(*) FROM fixed_30 WHERE sev IN ('crítica','critica','critical')),
      'altas',    (SELECT COUNT(*) FROM fixed_30 WHERE sev IN ('alta','high'))
    ),
    'fixedPrev30d', jsonb_build_object('total', (SELECT COUNT(*) FROM fixed_prev)),
    'fixedSeries', COALESCE((
      SELECT jsonb_agg(row ORDER BY (row->>'date'))
      FROM (
        SELECT jsonb_build_object('date', to_char(close_at, 'YYYY-MM-DD'), 'count', COUNT(*)) AS row
        FROM fixed_30
        GROUP BY to_char(close_at, 'YYYY-MM-DD')
      ) s
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;
