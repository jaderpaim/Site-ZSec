-- Extends bulk_update_vuln_status to optionally update identified_at.
-- When identified_at is present in the payload (maintained infra vulns with
-- Criado ≠ Atualizado), it is written; when absent, the existing value is kept.

CREATE OR REPLACE FUNCTION public.bulk_update_vuln_status(
  p_table text,
  p_updates jsonb  -- [{id, status, status_changed_at, identified_at?}]
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
      status            = (u->>'status')::vuln_status,
      status_changed_at = (u->>'status_changed_at')::timestamptz,
      identified_at     = CASE WHEN u->>'identified_at' IS NOT NULL
                               THEN (u->>'identified_at')::date
                               ELSE v.identified_at END
    FROM jsonb_array_elements(p_updates) AS u
    WHERE v.id = (u->>'id')::uuid;
  ELSE
    UPDATE public.vulnerabilities_infra AS v
    SET
      status            = (u->>'status')::vuln_status,
      status_changed_at = (u->>'status_changed_at')::timestamptz,
      identified_at     = CASE WHEN u->>'identified_at' IS NOT NULL
                               THEN (u->>'identified_at')::date
                               ELSE v.identified_at END
    FROM jsonb_array_elements(p_updates) AS u
    WHERE v.id = (u->>'id')::uuid;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.bulk_update_vuln_status(text, jsonb) TO authenticated;
