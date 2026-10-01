-- get_ranking_ia_usuarios (20260618210000_fix_ranking_ia_rpc_perf.sql) capava o
-- resultado em 100 linhas. Isso também limitava a exportação do módulo de IA:
-- o KPI "Usuários Únicos" (get_ia_ranking_overview, COUNT DISTINCT sem cap)
-- mostrava 994, mas o Excel só trazia os 100 primeiros do ranking.
-- Eleva o teto para 5000 (folga confortável acima da base atual de usuários
-- únicos) — o restante da função permanece idêntico.

CREATE OR REPLACE FUNCTION public.get_ranking_ia_usuarios(
  p_from  timestamptz,
  p_to    timestamptz,
  p_tool  text DEFAULT NULL,
  p_dept  uuid DEFAULT NULL,
  p_unit  text DEFAULT NULL,
  p_limit int  DEFAULT 20
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH colab_keys AS (
    SELECT key, department_id, unidade FROM (
      SELECT key, c.department_id, c.unidade,
             row_number() OVER (PARTITION BY key ORDER BY c.id) AS rn
      FROM public.colaboradores c,
        LATERAL (VALUES (lower(split_part(c.email, '@', 1))), (lower(c.email))) AS k(key)
      WHERE key <> ''
    ) ranked
    WHERE rn = 1
  ),
  ev AS (
    SELECT e.user_name, e.event_at, ck.department_id, ck.unidade
    FROM public.ia_web_events e
    LEFT JOIN colab_keys ck ON ck.key = lower(e.user_name)
    WHERE e.event_at >= p_from AND e.event_at <= p_to
      AND e.user_name IS NOT NULL
      AND (p_tool IS NULL OR e.domain = p_tool)
      AND (p_dept IS NULL OR ck.department_id = p_dept)
      AND (p_unit IS NULL OR ck.unidade = p_unit)
  )
  SELECT COALESCE(jsonb_agg(row ORDER BY total_acessos DESC), '[]'::jsonb)
  FROM (
    SELECT
      jsonb_build_object(
        'user_name', user_name,
        'total_acessos', COUNT(*)::int,
        'ultimo_acesso', MAX(event_at)
      ) AS row,
      COUNT(*) AS total_acessos
    FROM ev
    GROUP BY user_name
    ORDER BY total_acessos DESC
    LIMIT GREATEST(1, LEAST(p_limit, 5000))
  ) t;
$$;

REVOKE EXECUTE ON FUNCTION public.get_ranking_ia_usuarios(timestamptz,timestamptz,text,uuid,text,int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_ranking_ia_usuarios(timestamptz,timestamptz,text,uuid,text,int) TO authenticated, service_role;
