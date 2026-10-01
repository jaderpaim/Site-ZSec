-- Sub-chave de identidade pra achados que fazem MÚLTIPLAS extrações dentro
-- do mesmo template (ex.: o template "RDAP WHOIS" do Nuclei extrai
-- registrationDate, lastChangeDate, expirationDate, registrantName,
-- registrantAddress etc. como resultados SEPARADOS, mas todos compartilham
-- engine+name+matched_url+param -- só o evidence muda). Sem essa distinção,
-- a dedup de 20260821150000 colapsava essas várias extrações distintas numa
-- única linha (confirmado: 50 achados computados no FastAPI, só 36
-- gravados numa única execução, sem nenhum occurrence_count > 1 -- sinal de
-- colapso dentro do próprio lote, não entre scans diferentes).
--
-- raw_output['extractor-name'] (ou 'matcher-name' como fallback) é o campo
-- estável do Nuclei que distingue essas sub-extrações -- fica igual entre
-- re-scans do mesmo fato (a dedup entre dias continua funcionando), mas
-- diferente entre extrações diferentes do mesmo template. Populado pelo app
-- em dast-callback.ts; nulo pra engines sem esse conceito (zap/nmap/nikto),
-- onde não muda nada -- coalesce('') deixa como estava.

ALTER TABLE public.dast_vulnerabilities
  ADD COLUMN sub_key text,
  ADD COLUMN sub_key_norm text GENERATED ALWAYS AS (lower(trim(coalesce(sub_key, '')))) STORED;

ALTER TABLE public.dast_vulnerabilities
  DROP CONSTRAINT dast_vulnerabilities_identity_unique;

ALTER TABLE public.dast_vulnerabilities
  ADD CONSTRAINT dast_vulnerabilities_identity_unique
  UNIQUE (engine_norm, name_norm, matched_url_norm, param_norm, sub_key_norm);

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
      lower(trim(coalesce(elem ->> 'param', ''))),
      lower(trim(coalesce(elem ->> 'sub_key', '')))
    )
      elem AS row_data
    FROM jsonb_array_elements(p_rows) AS elem
  )
  INSERT INTO public.dast_vulnerabilities (
    scan_id, name, severity, owasp_category, cvss_score, cve_id, engine,
    confidence, matched_url, http_method, param, attack_payload, evidence,
    description, business_impact, remediation, reference, raw_output,
    sub_key, found_at, first_seen_at, occurrence_count
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
    row_data ->> 'sub_key',
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
