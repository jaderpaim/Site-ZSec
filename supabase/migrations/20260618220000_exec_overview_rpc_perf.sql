-- Painel Executivo (getExecutiveOverview) estava paginando ia_web_events e
-- vulnerabilities_aplicacao inteiras (1000 linhas por página, sequencial) só
-- para agregar contagens em JavaScript — o mesmo padrão que já causou timeout
-- no Ranking de IA em produção (ver 20260618210000_fix_ranking_ia_rpc_perf.sql).
-- Move essas agregações para o Postgres via RPC.

CREATE OR REPLACE FUNCTION public.get_exec_ia_overview(p_since timestamptz)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
  );
$$;

REVOKE EXECUTE ON FUNCTION public.get_exec_ia_overview(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_exec_ia_overview(timestamptz) TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.get_exec_vulnerabilities_overview(
  p_since30 timestamptz,
  p_since60 timestamptz
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
  );
$$;

REVOKE EXECUTE ON FUNCTION public.get_exec_vulnerabilities_overview(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_exec_vulnerabilities_overview(timestamptz, timestamptz) TO authenticated, service_role;

-- Nota: não dá pra indexar COALESCE(status_changed_at, closed_at) — closed_at é `date` e
-- status_changed_at é `timestamptz`; o cast implícito date→timestamptz depende do timezone
-- da sessão (STABLE, não IMMUTABLE), o que o Postgres rejeita em índice. Sem índice aqui o
-- filtro de data ainda roda sobre o subconjunto já reduzido por status (indexado), então
-- não é o gargalo — o ganho principal é não paginar a tabela inteira para o Node.

-- MTTR (getExecutiveOverview) filtra qradar_offenses por closed_at sem índice.
CREATE INDEX IF NOT EXISTS idx_qradar_offenses_closed_at
  ON public.qradar_offenses (closed_at);
