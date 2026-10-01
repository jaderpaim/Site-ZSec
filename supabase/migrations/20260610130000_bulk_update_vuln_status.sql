-- RPC for bulk-updating vulnerability status + status_changed_at in a single DB call.
-- Replaces the N individual UPDATE calls during import with one round-trip.

CREATE OR REPLACE FUNCTION public.bulk_update_vuln_status(
  p_table text,
  p_updates jsonb  -- [{id, status, status_changed_at}]
)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  IF p_table NOT IN ('vulnerabilities_aplicacao', 'vulnerabilities_infra') THEN
    RAISE EXCEPTION 'Invalid table: %', p_table;
  END IF;

  IF p_table = 'vulnerabilities_aplicacao' THEN
    UPDATE public.vulnerabilities_aplicacao AS v
    SET
      status           = (u->>'status')::vuln_status,
      status_changed_at = (u->>'status_changed_at')::timestamptz
    FROM jsonb_array_elements(p_updates) AS u
    WHERE v.id = (u->>'id')::uuid;
  ELSE
    UPDATE public.vulnerabilities_infra AS v
    SET
      status           = (u->>'status')::vuln_status,
      status_changed_at = (u->>'status_changed_at')::timestamptz
    FROM jsonb_array_elements(p_updates) AS u
    WHERE v.id = (u->>'id')::uuid;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_update_vuln_status(text, jsonb) TO authenticated;
