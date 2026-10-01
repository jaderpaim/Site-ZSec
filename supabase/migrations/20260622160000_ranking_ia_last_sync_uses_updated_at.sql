-- O botão "Sincronizar agora" do Ranking de IA agora roda runSophosSync em
-- modo eventsOnly (só eventos SIEM, sem endpoints/alerts/policies) e por
-- isso não atualiza mais sophos_sync_state.last_full_sync_at — esse campo
-- representa especificamente "última sincronização completa do Sophos XDR"
-- e ficaria incorreto se fosse tocado por um sync parcial.
-- `updated_at` é sempre avançado em todo runSophosSync (full ou eventsOnly),
-- então é a fonte correta para o "Última sincronização" exibido no painel
-- de Ranking de IA.

CREATE OR REPLACE FUNCTION public.get_ia_ranking_overview(
  p_from timestamptz,
  p_to   timestamptz,
  p_dept uuid    DEFAULT NULL,
  p_tool text    DEFAULT NULL,
  p_unit text    DEFAULT NULL,
  p_user text    DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  span_days  int;
  bucket_unit text;
  totals_json jsonb;
  by_tool_json jsonb;
  by_dept_json jsonb;
  series_json jsonb;
  filter_opts jsonb;
  data_range  jsonb;
  last_sync   timestamptz;
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'analista'::app_role)) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  span_days := GREATEST(1, EXTRACT(DAY FROM (p_to - p_from))::int);
  bucket_unit := CASE WHEN span_days > 60 THEN 'week' ELSE 'day' END;

  -- One row per distinct lookup key (local-part / full email), first colaborador wins
  -- on collision — same semantics as the original TS Map-based lookup.
  CREATE TEMP TABLE _colab_keys ON COMMIT DROP AS
  SELECT key, department_id, unidade FROM (
    SELECT key, c.department_id, c.unidade,
           row_number() OVER (PARTITION BY key ORDER BY c.id) AS rn
    FROM public.colaboradores c,
      LATERAL (VALUES (lower(split_part(c.email, '@', 1))), (lower(c.email))) AS k(key)
    WHERE key <> ''
  ) ranked
  WHERE rn = 1;

  -- Build enriched event set once
  CREATE TEMP TABLE _ia_evt ON COMMIT DROP AS
  SELECT
    e.user_name,
    e.domain,
    e.event_at,
    ck.department_id,
    ck.unidade
  FROM public.ia_web_events e
  LEFT JOIN _colab_keys ck ON ck.key = lower(e.user_name)
  WHERE e.event_at >= p_from AND e.event_at <= p_to
    AND (p_tool IS NULL OR e.domain = p_tool)
    AND (p_user IS NULL OR e.user_name = p_user)
    AND (p_dept IS NULL OR ck.department_id = p_dept)
    AND (p_unit IS NULL OR ck.unidade = p_unit);

  CREATE INDEX ON _ia_evt(domain);
  CREATE INDEX ON _ia_evt(department_id);

  -- totals
  SELECT jsonb_build_object(
    'events', COUNT(*),
    'users',  COUNT(DISTINCT user_name) FILTER (WHERE user_name IS NOT NULL),
    'tools',  COUNT(DISTINCT domain) FILTER (WHERE domain IS NOT NULL)
  ) INTO totals_json FROM _ia_evt;

  -- by tool
  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'count')::int DESC), '[]'::jsonb) INTO by_tool_json
  FROM (
    SELECT jsonb_build_object(
      'name', domain,
      'count', COUNT(*)::int,
      'userCount', COUNT(DISTINCT user_name)::int,
      'users', COALESCE(jsonb_agg(DISTINCT user_name) FILTER (WHERE user_name IS NOT NULL), '[]'::jsonb)
    ) AS row
    FROM _ia_evt WHERE domain IS NOT NULL
    GROUP BY domain
  ) t;

  -- by dept
  SELECT COALESCE(jsonb_agg(row ORDER BY (row->>'count')::int DESC), '[]'::jsonb) INTO by_dept_json
  FROM (
    SELECT jsonb_build_object(
      'name', d.name,
      'count', COUNT(*)::int,
      'userCount', COUNT(DISTINCT e.user_name)::int,
      'users', COALESCE(jsonb_agg(DISTINCT e.user_name) FILTER (WHERE e.user_name IS NOT NULL), '[]'::jsonb)
    ) AS row
    FROM _ia_evt e
    JOIN public.departments d ON d.id = e.department_id
    GROUP BY d.name
  ) t;

  -- series
  SELECT COALESCE(jsonb_agg(jsonb_build_object('d', to_char(bucket, 'YYYY-MM-DD'), 'count', cnt) ORDER BY bucket), '[]'::jsonb)
  INTO series_json
  FROM (
    WITH buckets AS (
      SELECT generate_series(
        date_trunc(bucket_unit, p_from),
        date_trunc(bucket_unit, p_to),
        ('1 ' || bucket_unit)::interval
      )::date AS bucket
    ),
    agg AS (
      SELECT date_trunc(bucket_unit, event_at)::date AS bucket, COUNT(*)::int AS cnt
      FROM _ia_evt GROUP BY 1
    )
    SELECT b.bucket, COALESCE(a.cnt, 0) AS cnt
    FROM buckets b LEFT JOIN agg a USING (bucket)
  ) s;

  -- filter options (unfiltered, period-scoped where relevant)
  SELECT jsonb_build_object(
    'departments', COALESCE((SELECT jsonb_agg(jsonb_build_object('id', id, 'name', name) ORDER BY name) FROM public.departments), '[]'::jsonb),
    'tools', COALESCE((SELECT jsonb_agg(DISTINCT domain ORDER BY domain) FROM public.ia_web_events WHERE event_at >= p_from AND event_at <= p_to AND domain IS NOT NULL), '[]'::jsonb),
    'units', COALESCE((SELECT jsonb_agg(DISTINCT unidade ORDER BY unidade) FROM public.colaboradores WHERE unidade IS NOT NULL), '[]'::jsonb),
    'users', COALESCE((SELECT jsonb_agg(DISTINCT user_name ORDER BY user_name) FROM public.ia_web_events WHERE event_at >= p_from AND event_at <= p_to AND user_name IS NOT NULL), '[]'::jsonb)
  ) INTO filter_opts;

  SELECT jsonb_build_object(
    'min', (SELECT MIN(event_at) FROM public.ia_web_events),
    'max', (SELECT MAX(event_at) FROM public.ia_web_events)
  ) INTO data_range;

  SELECT updated_at INTO last_sync FROM public.sophos_sync_state LIMIT 1;

  DROP TABLE _ia_evt;
  DROP TABLE _colab_keys;

  RETURN jsonb_build_object(
    'totals', totals_json,
    'byTool', by_tool_json,
    'byDept', by_dept_json,
    'series', series_json,
    'filterOptions', filter_opts,
    'dataRange', data_range,
    'lastSyncAt', last_sync
  );
END;
$$;
