-- "Não Protegido" estava mapeado para health_overall unknown/null, que
-- nunca ocorre nos dados reais (sempre dá 0 para endpoints). Testamos um
-- sinal melhor: o campo assignedProducts do payload da Sophos (raw jsonb)
-- diz se o produto "endpointProtection" está de fato instalado no
-- dispositivo — semanticamente mais correto para "sem proteção" do que o
-- health status. Ainda não bate 100% com o painel da Sophos (achamos 2
-- endpoints sem o produto instalado, a Sophos mostra 4 — provável diferença
-- de dispositivos descobertos por rede/AD sem agente, que não aparecem em
-- /endpoint/v1/endpoints), mas é a melhor aproximação disponível via API.
CREATE OR REPLACE FUNCTION public.sophos_overview(from_ts timestamp with time zone, to_ts timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  span_days integer;
  bucket_unit text;
  result jsonb;
  series_json jsonb;
  detection_json jsonb;
  top_users_json jsonb;
  ep_total int; ep_active int; ep_inactive_2w int; ep_inactive_2m int; ep_unknown int;
  sv_total int; sv_active int; sv_inactive_2w int; sv_inactive_2m int; sv_unknown int;
  encrypted_count int; unencrypted_count int; encryption_rate int;
  alerts_total int; alerts_red int; alerts_yellow int;
  threats_endpoints int; threats_servers int;
  active_window_2w timestamptz := now() - interval '14 days';
  active_window_2m timestamptz := now() - interval '60 days';
BEGIN
  span_days := GREATEST(1, EXTRACT(DAY FROM (to_ts - from_ts))::int);
  bucket_unit := CASE
    WHEN span_days <= 60 THEN 'day'
    WHEN span_days <= 365 THEN 'week'
    ELSE 'month'
  END;

  -- device breakdown — 4 buckets por tipo (endpoint/server). "Não
  -- protegido" agora é ausência do produto endpointProtection instalado.
  SELECT
    COUNT(*) FILTER (WHERE kind <> 'server'),
    COUNT(*) FILTER (WHERE kind <> 'server' AND has_protection AND last_seen_at >= active_window_2w),
    COUNT(*) FILTER (WHERE kind <> 'server' AND has_protection AND last_seen_at < active_window_2w AND last_seen_at >= active_window_2m),
    COUNT(*) FILTER (WHERE kind <> 'server' AND has_protection AND (last_seen_at IS NULL OR last_seen_at < active_window_2m)),
    COUNT(*) FILTER (WHERE kind <> 'server' AND NOT has_protection),
    COUNT(*) FILTER (WHERE kind = 'server'),
    COUNT(*) FILTER (WHERE kind = 'server' AND has_protection AND last_seen_at >= active_window_2w),
    COUNT(*) FILTER (WHERE kind = 'server' AND has_protection AND last_seen_at < active_window_2w AND last_seen_at >= active_window_2m),
    COUNT(*) FILTER (WHERE kind = 'server' AND has_protection AND (last_seen_at IS NULL OR last_seen_at < active_window_2m)),
    COUNT(*) FILTER (WHERE kind = 'server' AND NOT has_protection),
    COUNT(*) FILTER (WHERE encrypted = true),
    COUNT(*) FILTER (WHERE encrypted = false)
  INTO ep_total, ep_active, ep_inactive_2w, ep_inactive_2m, ep_unknown,
       sv_total, sv_active, sv_inactive_2w, sv_inactive_2m, sv_unknown,
       encrypted_count, unencrypted_count
  FROM (
    SELECT
      lower(coalesce(type,'')) AS kind,
      last_seen_at,
      encrypted,
      EXISTS (
        SELECT 1 FROM jsonb_array_elements(coalesce(raw->'assignedProducts', '[]'::jsonb)) p
        WHERE p->>'code' = 'endpointProtection' AND p->>'status' = 'installed'
      ) AS has_protection
    FROM public.sophos_endpoints
  ) sub;

  encryption_rate := CASE WHEN (ep_total + sv_total) > 0
    THEN ROUND(100.0 * encrypted_count / (ep_total + sv_total))::int ELSE 0 END;

  -- alerts in range
  SELECT
    COUNT(*),
    COUNT(*) FILTER (WHERE lower(coalesce(severity,'')) IN ('critical','high')),
    COUNT(*) FILTER (WHERE lower(coalesce(severity,'')) = 'medium')
  INTO alerts_total, alerts_red, alerts_yellow
  FROM public.sophos_alerts
  WHERE raised_at >= from_ts AND raised_at <= to_ts;

  -- threats by device type + detection types + top users — tudo numa só
  -- query, com sophos_events lido uma única vez (events_in_range é
  -- referenciada 3x e o Postgres materializa por padrão nesse caso).
  WITH events_in_range AS (
    SELECT endpoint_id, detection_category, user_normalized
    FROM public.sophos_events
    WHERE event_at >= from_ts AND event_at <= to_ts
  ),
  classified AS (
    SELECT CASE WHEN lower(coalesce(ep.type,'')) = 'server' THEN 'server' ELSE 'endpoint' END AS kind
    FROM events_in_range ev LEFT JOIN public.sophos_endpoints ep ON ep.id = ev.endpoint_id
  ),
  alert_buckets AS (
    SELECT CASE
      WHEN blob ~ 'runtime|exploit|live protection|behaviour|behavior' THEN 'Detecções em tempo de execução'
      WHEN blob ~ '(^|[^a-z])pua([^a-z]|$)|potentially unwanted|corepua' THEN 'PUA'
      WHEN blob ~ 'malware|virus|troj|worm|ransom|htmlgen|infected|ameaça' THEN 'Malwares'
      WHEN blob ~ 'encrypt|criptograf|denc|bitlocker|filevault|disknotencrypted' THEN 'Criptografia de Dispositivo'
      WHEN blob ~ 'application control|app control|appcontrol|aplicativo controlado' THEN 'Controle de Aplicativos'
      WHEN blob ~ 'policy violation|violação de política|compliance|redirecionou o bloco tag|alertado devido a tag' THEN 'Violação de Política'
      WHEN blob ~ 'web threat|url threat|bloqueado devido a|htmlinj|web protection|web control' THEN 'Controle da Web'
      WHEN blob ~ 'peripheral|periférico|device control|(^|[^a-z])usb([^a-z]|$)|removable storage|armazenamento removível|bluetooth|peripheralallowed|peripheralblocked|bloqueado devido ao controle de dispositivo' THEN 'Controle de Periféricos'
      ELSE NULL
    END AS bucket
    FROM (
      SELECT lower(coalesce(category,'') || ' ' || coalesce(type,'') || ' ' || coalesce(description,'')) AS blob
      FROM public.sophos_alerts WHERE raised_at >= from_ts AND raised_at <= to_ts
    ) a
  ),
  all_buckets AS (
    SELECT bucket FROM alert_buckets
    UNION ALL
    SELECT detection_category AS bucket FROM events_in_range
  ),
  alert_users AS (
    SELECT NULLIF(trim(regexp_replace(coalesce(person_name, managed_agent_name), '^[^\\]+\\', '')), '') AS u
    FROM public.sophos_alerts WHERE raised_at >= from_ts AND raised_at <= to_ts
  ),
  all_users AS (
    SELECT u FROM alert_users
    UNION ALL
    SELECT user_normalized AS u FROM events_in_range
  )
  SELECT
    (SELECT COUNT(*) FILTER (WHERE kind = 'endpoint') FROM classified),
    (SELECT COUNT(*) FILTER (WHERE kind = 'server') FROM classified),
    (SELECT coalesce(jsonb_agg(jsonb_build_object('name', bucket, 'value', cnt) ORDER BY cnt DESC), '[]'::jsonb)
     FROM (SELECT bucket, COUNT(*) AS cnt FROM all_buckets WHERE bucket IS NOT NULL GROUP BY bucket) b),
    (SELECT coalesce(jsonb_agg(jsonb_build_object('user', u, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
     FROM (
       SELECT u, COUNT(*) AS cnt FROM all_users
       WHERE u IS NOT NULL AND upper(u) NOT IN ('SYSTEM','N/A','-')
       GROUP BY u ORDER BY cnt DESC LIMIT 10
     ) t)
  INTO threats_endpoints, threats_servers, detection_json, top_users_json;

  -- adaptive time series
  WITH buckets AS (
    SELECT generate_series(
      date_trunc(bucket_unit, from_ts),
      date_trunc(bucket_unit, to_ts),
      ('1 ' || bucket_unit)::interval
    ) AS bucket_ts
  ),
  agg AS (
    SELECT date_trunc(bucket_unit, raised_at) AS bucket_ts,
      COUNT(*) FILTER (WHERE lower(coalesce(severity,'')) IN ('high','critical')) AS detected,
      COUNT(*) FILTER (WHERE lower(coalesce(severity,'')) NOT IN ('high','critical')) AS blocked
    FROM public.sophos_alerts
    WHERE raised_at >= from_ts AND raised_at <= to_ts
    GROUP BY 1
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'd', to_char(b.bucket_ts, CASE bucket_unit WHEN 'day' THEN 'DD/MM' WHEN 'week' THEN 'DD/MM' ELSE 'MM/YY' END),
    'blocked', coalesce(a.blocked, 0),
    'detected', coalesce(a.detected, 0)
  ) ORDER BY b.bucket_ts), '[]'::jsonb)
  INTO series_json
  FROM buckets b LEFT JOIN agg a USING (bucket_ts);

  result := jsonb_build_object(
    'totals', jsonb_build_object(
      'threatsEndpoints', threats_endpoints,
      'threatsServers', threats_servers,
      'threatsTotal', threats_endpoints + threats_servers,
      'alertsTotal', alerts_total,
      'alertsRed', alerts_red,
      'alertsYellow', alerts_yellow,
      'endpoints', ep_total,
      'servers', sv_total,
      'encryptedDevices', encrypted_count,
      'unencryptedDevices', unencrypted_count,
      'encryptionRate', encryption_rate
    ),
    'endpoints', jsonb_build_object(
      'total', ep_total, 'active', ep_active,
      'inactive2w', ep_inactive_2w, 'inactive2m', ep_inactive_2m,
      'notProtected', ep_unknown
    ),
    'servers', jsonb_build_object(
      'total', sv_total, 'active', sv_active,
      'inactive2w', sv_inactive_2w, 'inactive2m', sv_inactive_2m,
      'notProtected', sv_unknown
    ),
    'detectionTypes', detection_json,
    'topUsers', top_users_json,
    'series', series_json,
    'bucketUnit', bucket_unit
  );

  RETURN result;
END;
$function$;
