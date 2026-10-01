UPDATE public.ia_web_events e
SET user_name = NULLIF(regexp_replace(
  COALESCE(
    s.raw->>'source',
    s.raw->>'user_name',
    s.raw->>'userName',
    s.raw->>'user',
    ''
  ),
  '^[^\\]+\\', ''
), '')
FROM public.sophos_events s
WHERE e.source_event_id = s.id
  AND (e.user_name IS NULL OR e.user_name = '');