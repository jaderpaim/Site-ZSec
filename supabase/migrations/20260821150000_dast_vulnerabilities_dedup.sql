-- Deduplicação de achados do DAST entre scans repetidos -- hoje cada scan
-- insere uma linha nova em dast_vulnerabilities mesmo quando é exatamente
-- o mesmo problema já visto num scan anterior do mesmo alvo (confirmado:
-- escanear o mesmo domínio em dias diferentes duplica o mesmo achado nas
-- telas de Dashboard/Acompanhamento). Mesmo padrão já usado em
-- vulnerabilities_infra (20260812140100 identity unique + 20260812140200 /
-- 20260813150200 upsert com reopen): colunas normalizadas GENERATED +
-- UNIQUE constraint + função upsert que atualiza em vez de duplicar.
--
-- matched_url já é específico por alvo (inclui o host/URL afetado), então a
-- chave de identidade não precisa de uma coluna de domínio separada -- dois
-- achados com o mesmo nome em alvos diferentes já têm matched_url diferente
-- e continuam sendo tratados como problemas distintos.

ALTER TABLE public.dast_vulnerabilities
  ADD COLUMN engine_norm text GENERATED ALWAYS AS (lower(trim(coalesce(engine, '')))) STORED,
  ADD COLUMN name_norm text GENERATED ALWAYS AS (lower(trim(coalesce(name, '')))) STORED,
  ADD COLUMN matched_url_norm text GENERATED ALWAYS AS (lower(trim(coalesce(matched_url, '')))) STORED,
  ADD COLUMN param_norm text GENERATED ALWAYS AS (lower(trim(coalesce(param, '')))) STORED,
  ADD COLUMN first_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN occurrence_count integer NOT NULL DEFAULT 1,
  ADD COLUMN reopened_at timestamptz;

ALTER TABLE public.dast_vulnerabilities
  ADD CONSTRAINT dast_vulnerabilities_identity_unique
  UNIQUE (engine_norm, name_norm, matched_url_norm, param_norm);

CREATE OR REPLACE FUNCTION public.upsert_dast_vulnerability(p_rows jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  WITH incoming AS (
    SELECT DISTINCT ON (
      lower(trim(coalesce(elem ->> 'engine', ''))),
      lower(trim(coalesce(elem ->> 'name', ''))),
      lower(trim(coalesce(elem ->> 'matched_url', ''))),
      lower(trim(coalesce(elem ->> 'param', '')))
    )
      elem AS row_data
    FROM jsonb_array_elements(p_rows) AS elem
  )
  INSERT INTO public.dast_vulnerabilities (
    scan_id, name, severity, owasp_category, cvss_score, cve_id, engine,
    confidence, matched_url, http_method, param, attack_payload, evidence,
    description, business_impact, remediation, reference, raw_output,
    found_at, first_seen_at, occurrence_count
  )
  SELECT
    (row_data ->> 'scan_id')::uuid,
    coalesce(row_data ->> 'name', 'Achado'),
    row_data ->> 'severity',
    row_data ->> 'owasp_category',
    NULLIF(row_data ->> 'cvss_score', '')::numeric,
    row_data ->> 'cve_id',
    row_data ->> 'engine',
    row_data ->> 'confidence',
    row_data ->> 'matched_url',
    row_data ->> 'http_method',
    row_data ->> 'param',
    row_data ->> 'attack_payload',
    row_data ->> 'evidence',
    row_data ->> 'description',
    row_data ->> 'business_impact',
    row_data ->> 'remediation',
    row_data ->> 'reference',
    row_data -> 'raw_output',
    now(),
    now(),
    1
  FROM incoming
  ON CONFLICT ON CONSTRAINT dast_vulnerabilities_identity_unique
  DO UPDATE SET
    scan_id          = EXCLUDED.scan_id,
    severity         = EXCLUDED.severity,
    owasp_category   = EXCLUDED.owasp_category,
    cvss_score       = EXCLUDED.cvss_score,
    cve_id           = EXCLUDED.cve_id,
    confidence       = EXCLUDED.confidence,
    http_method      = EXCLUDED.http_method,
    attack_payload   = EXCLUDED.attack_payload,
    evidence         = EXCLUDED.evidence,
    description      = EXCLUDED.description,
    business_impact  = EXCLUDED.business_impact,
    remediation      = EXCLUDED.remediation,
    reference        = EXCLUDED.reference,
    raw_output       = EXCLUDED.raw_output,
    found_at         = now(),
    first_seen_at    = LEAST(dast_vulnerabilities.first_seen_at, EXCLUDED.first_seen_at),
    occurrence_count = dast_vulnerabilities.occurrence_count + 1,
    reopened_at      = CASE
                          WHEN dast_vulnerabilities.status IN ('resolved', 'false_positive')
                          THEN now()
                          ELSE dast_vulnerabilities.reopened_at
                        END,
    status           = CASE
                          WHEN dast_vulnerabilities.status IN ('resolved', 'false_positive')
                          THEN 'open'
                          ELSE dast_vulnerabilities.status
                        END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_dast_vulnerability(jsonb) TO service_role;
