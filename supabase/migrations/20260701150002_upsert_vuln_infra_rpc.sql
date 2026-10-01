-- RPC for upserting infra vulnerabilities in bulk.
-- ON CONFLICT ON CONSTRAINT vulnerabilities_infra_identity_unique (department_id, fqdn, vuln_type):
--   - Updates mutable fields (status, severity, system_app, raw, status_changed_at)
--   - Keeps identified_at as LEAST(existing, incoming) so the original discovery date
--     is NEVER overwritten by a later re-import of the same vulnerability.

CREATE OR REPLACE FUNCTION public.upsert_vuln_infra(p_rows jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.vulnerabilities_infra (
    fqdn,
    severity,
    status,
    responsible,
    identified_at,
    source,
    vuln_type,
    system_app,
    department_id,
    kind,
    raw,
    status_changed_at
  )
  SELECT
    r->>'fqdn',
    (r->>'severity')::vuln_severity,
    (r->>'status')::vuln_status,
    NULLIF(r->>'responsible', ''),
    (r->>'identified_at')::date,
    NULLIF(r->>'source', ''),
    NULLIF(r->>'vuln_type', ''),
    NULLIF(r->>'system_app', ''),
    (r->>'department_id')::uuid,
    'infraestrutura',
    r->'raw',
    (r->>'status_changed_at')::timestamptz
  FROM jsonb_array_elements(p_rows) AS r
  ON CONFLICT ON CONSTRAINT vulnerabilities_infra_identity_unique
  DO UPDATE SET
    severity          = EXCLUDED.severity,
    status            = EXCLUDED.status,
    responsible       = EXCLUDED.responsible,
    source            = EXCLUDED.source,
    system_app        = EXCLUDED.system_app,
    raw               = EXCLUDED.raw,
    status_changed_at = EXCLUDED.status_changed_at,
    identified_at     = LEAST(
                          vulnerabilities_infra.identified_at,
                          EXCLUDED.identified_at
                        );
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_vuln_infra(jsonb) TO authenticated;
