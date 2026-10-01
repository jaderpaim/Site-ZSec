-- upsert_vuln_infra v3 — mesma lógica da v2 (20260812140200), só adicionando o rastro de
-- reabertura: se o achado estava presumed_closed=true (fechado por ausência, ver
-- close_missing_infra_vulns) e volta a aparecer num import, isso vira reopened_at em vez de
-- reabrir silenciosamente. presumed_closed sempre volta a false quando o achado é tocado por
-- um import de verdade — a essa altura temos dado fresco sobre ele, então o motivo do
-- fechamento anterior (se ainda estiver fechado) deixa de ser "presumido" nesse ponto do
-- tempo (mesmo que ele já venha fechado de novo no mesmo import — Situação=Fix, por
-- exemplo — nesse caso é um fechamento com dado real, não mais uma suposição por ausência).

CREATE OR REPLACE FUNCTION public.upsert_vuln_infra(p_rows jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  WITH incoming AS (
    SELECT DISTINCT ON (
      lower(trim(elem ->> 'fqdn')),
      lower(trim(coalesce(elem ->> 'vuln_type', elem -> 'raw' ->> 'Vulnerabilidade', elem -> 'raw' ->> 'Vulnerability', ''))),
      lower(trim(coalesce(elem -> 'raw' ->> 'Porta', elem -> 'raw' ->> 'Port', elem -> 'raw' ->> 'Campo personalizado (Port)', '')))
    )
      elem AS row_data
    FROM jsonb_array_elements(p_rows) AS elem
    ORDER BY
      lower(trim(elem ->> 'fqdn')),
      lower(trim(coalesce(elem ->> 'vuln_type', elem -> 'raw' ->> 'Vulnerabilidade', elem -> 'raw' ->> 'Vulnerability', ''))),
      lower(trim(coalesce(elem -> 'raw' ->> 'Porta', elem -> 'raw' ->> 'Port', elem -> 'raw' ->> 'Campo personalizado (Port)', ''))),
      (elem ->> 'status_changed_at')::timestamptz DESC NULLS LAST
  )
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
    status_changed_at,
    closed_at,
    presumed_closed
  )
  SELECT
    row_data ->> 'fqdn',
    (row_data ->> 'severity')::vuln_severity,
    (row_data ->> 'status')::vuln_status,
    NULLIF(row_data ->> 'responsible', ''),
    (row_data ->> 'identified_at')::date,
    NULLIF(row_data ->> 'source', ''),
    NULLIF(row_data ->> 'vuln_type', ''),
    NULLIF(row_data ->> 'system_app', ''),
    (row_data ->> 'department_id')::uuid,
    'infraestrutura',
    row_data -> 'raw',
    (row_data ->> 'status_changed_at')::timestamptz,
    CASE WHEN (row_data ->> 'status') IN ('Mitigada', 'Fechada') THEN (row_data ->> 'status_changed_at')::timestamptz ELSE NULL END,
    false
  FROM incoming
  ON CONFLICT ON CONSTRAINT vulnerabilities_infra_identity_unique_v2
  DO UPDATE SET
    severity          = EXCLUDED.severity,
    status            = EXCLUDED.status,
    responsible       = EXCLUDED.responsible,
    source            = EXCLUDED.source,
    system_app        = EXCLUDED.system_app,
    department_id     = EXCLUDED.department_id,
    raw               = EXCLUDED.raw,
    status_changed_at = EXCLUDED.status_changed_at,
    closed_at         = EXCLUDED.closed_at,
    presumed_closed   = false,
    reopened_at       = CASE
                           WHEN vulnerabilities_infra.presumed_closed = true THEN EXCLUDED.status_changed_at
                           ELSE vulnerabilities_infra.reopened_at
                         END,
    identified_at     = LEAST(
                          vulnerabilities_infra.identified_at,
                          EXCLUDED.identified_at
                        );
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_vuln_infra(jsonb) TO authenticated;
