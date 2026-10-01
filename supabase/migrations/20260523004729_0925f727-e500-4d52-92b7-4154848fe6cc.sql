
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
  device_status_json jsonb;
  ep_total int; ep_active int; ep_inactive int; ep_unknown int;
  sv_total int; sv_active int; sv_inactive int; sv_unknown int;
  encrypted_count int; unencrypted_count int; encryption_rate int;
  alerts_total int; alerts_red int; alerts_yellow int;
  threats_endpoints int; threats_servers int;
  active_window_threshold timestamptz := now() - interval '13 days';
BEGIN
  span_days := GREATEST(1, EXTRACT(DAY FROM (to_ts - from_ts))::int);
  bucket_unit := CASE
    WHEN span_days <= 60 THEN 'day'
    WHEN span_days <= 365 THEN 'week'
    ELSE 'month'
  END;

  -- device breakdown
  SELECT
    COUNT(*) FILTER (WHERE lower(coalesce(type,'')) <> 'server'),
    COUNT(*) FILTER (WHERE lower(coalesce(type,'')) <> 'server' AND lower(coalesce(health_overall,'')) <> 'unknown' AND last_seen_at >= active_window_threshold),
    COUNT(*) FILTER (WHERE lower(coalesce(type,'')) <> 'server' AND lower(coalesce(health_overall,'')) <> 'unknown' AND (last_seen_at IS NULL OR last_seen_at < active_window_threshold)),
    COUNT(*) FILTER (WHERE lower(coalesce(type,'')) <> 'server' AND lower(coalesce(health_overall,'')) = 'unknown'),
    COUNT(*) FILTER (WHERE lower(coalesce(type,'')) = 'server'),
    COUNT(*) FILTER (WHERE lower(coalesce(type,'')) = 'server' AND lower(coalesce(health_overall,'')) <> 'unknown' AND last_seen_at >= active_window_threshold),
    COUNT(*) FILTER (WHERE lower(coalesce(type,'')) = 'server' AND lower(coalesce(health_overall,'')) <> 'unknown' AND (last_seen_at IS NULL OR last_seen_at < active_window_threshold)),
    COUNT(*) FILTER (WHERE lower(coalesce(type,'')) = 'server' AND lower(coalesce(health_overall,'')) = 'unknown'),
    COUNT(*) FILTER (WHERE encrypted = true),
    COUNT(*) FILTER (WHERE encrypted = false)
  INTO ep_total, ep_active, ep_inactive, ep_unknown,
       sv_total, sv_active, sv_inactive, sv_unknown,
       encrypted_count, unencrypted_count
  FROM public.sophos_endpoints;

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

  -- threats by device type (join only by id; NULL endpoint_id counted as endpoint)
  -- This avoids the previous OR-join on lower(hostname)=lower(endpoint_name)
  -- which caused statement timeouts on large ranges.
  WITH ev AS (
    SELECT endpoint_id
    FROM public.sophos_events
    WHERE event_at >= from_ts AND event_at <= to_ts
  ),
  classified AS (
    SELECT CASE WHEN lower(coalesce(ep.type,'')) = 'server' THEN 'server' ELSE 'endpoint' END AS kind
    FROM ev LEFT JOIN public.sophos_endpoints ep ON ep.id = ev.endpoint_id
  )
  SELECT
    COUNT(*) FILTER (WHERE kind = 'endpoint'),
    COUNT(*) FILTER (WHERE kind = 'server')
  INTO threats_endpoints, threats_servers
  FROM classified;

  -- detection types (bucketed)
  WITH src AS (
    SELECT lower(coalesce(category,'') || ' ' || coalesce(type,'') || ' ' || coalesce(description,'')) AS blob
    FROM public.sophos_alerts WHERE raised_at >= from_ts AND raised_at <= to_ts
    UNION ALL
    SELECT lower(coalesce(type,'') || ' ' || coalesce(name,'')) AS blob
    FROM public.sophos_events WHERE event_at >= from_ts AND event_at <= to_ts
  ),
  bucketed AS (
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
    FROM src
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('name', bucket, 'value', cnt) ORDER BY cnt DESC), '[]'::jsonb)
  INTO detection_json
  FROM (SELECT bucket, COUNT(*) AS cnt FROM bucketed WHERE bucket IS NOT NULL GROUP BY bucket) b;

  -- top 10 users (strip domain prefix like BERNOULLI\)
  WITH users_src AS (
    SELECT NULLIF(trim(regexp_replace(coalesce(person_name, managed_agent_name), '^[^\\]+\\', '')), '') AS u
    FROM public.sophos_alerts WHERE raised_at >= from_ts AND raised_at <= to_ts
    UNION ALL
    SELECT NULLIF(trim(regexp_replace(user_name, '^[^\\]+\\', '')), '') AS u
    FROM public.sophos_events WHERE event_at >= from_ts AND event_at <= to_ts
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('user', u, 'count', cnt) ORDER BY cnt DESC), '[]'::jsonb)
  INTO top_users_json
  FROM (
    SELECT u, COUNT(*) AS cnt
    FROM users_src
    WHERE u IS NOT NULL AND upper(u) NOT IN ('SYSTEM','N/A','-')
    GROUP BY u
    ORDER BY cnt DESC
    LIMIT 10
  ) t;

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

  device_status_json := jsonb_build_array(
    jsonb_build_object('name', 'Ativos', 'value', ep_active + sv_active),
    jsonb_build_object('name', 'Inativos', 'value', ep_inactive + sv_inactive),
    jsonb_build_object('name', 'Não protegidos', 'value', ep_unknown + sv_unknown)
  );

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
    'endpoints', jsonb_build_object('total', ep_total, 'active', ep_active, 'inactive', ep_inactive, 'notProtected', ep_unknown),
    'servers', jsonb_build_object('total', sv_total, 'active', sv_active, 'inactive', sv_inactive, 'notProtected', sv_unknown),
    'deviceStatus', device_status_json,
    'detectionTypes', detection_json,
    'topUsers', top_users_json,
    'series', series_json,
    'bucketUnit', bucket_unit
  );

  RETURN result;
END;
$function$;
