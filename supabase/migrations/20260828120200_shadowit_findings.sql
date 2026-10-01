-- Shadow IT: achados de enriquecimento por host -- compartilhamento SMB
-- (com permissão e classificação de governança), banner FTP, título HTTP/
-- HTTPS, nome/grupo NetBIOS. Mesmo padrão de dedup com reabertura já usado
-- em dast_vulnerabilities (20260821150000) e vulnerabilities_infra
-- (20260812140100/140200) -- não reaproveita a TABELA (é um domínio
-- diferente: governança de acesso interno, não vulnerabilidade de
-- aplicação), só a fórmula: colunas normalizadas GERADAS + UNIQUE + upsert
-- que atualiza occurrence_count/first_seen_at/reopened_at em vez de
-- duplicar linha.
--
-- Identidade = (ip, kind, name) -- ex.: mesmo IP + smb_share + "MODULO" é o
-- mesmo achado entre varreduras; permissão/classificação podem mudar de um
-- scan pro outro (isso é atualização da linha existente, não achado novo).

CREATE TABLE public.shadowit_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid,
  ip text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('smb_share', 'ftp_banner', 'http_title', 'netbios')),
  name text NOT NULL,
  value text,
  permission text,
  classification text CHECK (classification IN ('esperado', 'revisar', 'critico')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'false_positive')),
  raw_output jsonb,
  found_at timestamptz NOT NULL DEFAULT now(),
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  occurrence_count integer NOT NULL DEFAULT 1,
  reopened_at timestamptz,
  ip_norm text GENERATED ALWAYS AS (lower(trim(ip))) STORED,
  kind_norm text GENERATED ALWAYS AS (lower(trim(kind))) STORED,
  name_norm text GENERATED ALWAYS AS (lower(trim(name))) STORED,
  CONSTRAINT shadowit_findings_identity_unique UNIQUE (ip_norm, kind_norm, name_norm)
);

GRANT SELECT, UPDATE ON public.shadowit_findings TO authenticated;
GRANT ALL ON public.shadowit_findings TO service_role;

ALTER TABLE public.shadowit_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dast team read and triage shadowit findings" ON public.shadowit_findings
  FOR SELECT TO authenticated
  USING (public.is_dast_allowed(auth.uid()));

CREATE POLICY "dast team update shadowit findings status" ON public.shadowit_findings
  FOR UPDATE TO authenticated
  USING (public.is_dast_allowed(auth.uid()))
  WITH CHECK (public.is_dast_allowed(auth.uid()));

CREATE POLICY "service role write shadowit findings" ON public.shadowit_findings
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Upsert em lote a partir do callback do scanner.
CREATE OR REPLACE FUNCTION public.upsert_shadowit_finding(p_rows jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  WITH incoming AS (
    SELECT DISTINCT ON (
      lower(trim(coalesce(elem ->> 'ip', ''))),
      lower(trim(coalesce(elem ->> 'kind', ''))),
      lower(trim(coalesce(elem ->> 'name', '')))
    )
      elem AS row_data
    FROM jsonb_array_elements(p_rows) AS elem
  )
  INSERT INTO public.shadowit_findings (
    scan_id, ip, kind, name, value, permission, classification, raw_output,
    found_at, first_seen_at, occurrence_count
  )
  SELECT
    (row_data ->> 'scan_id')::uuid,
    row_data ->> 'ip',
    row_data ->> 'kind',
    row_data ->> 'name',
    row_data ->> 'value',
    row_data ->> 'permission',
    row_data ->> 'classification',
    row_data -> 'raw_output',
    now(),
    now(),
    1
  FROM incoming
  WHERE coalesce(row_data ->> 'ip', '') <> '' AND coalesce(row_data ->> 'kind', '') <> '' AND coalesce(row_data ->> 'name', '') <> ''
  ON CONFLICT ON CONSTRAINT shadowit_findings_identity_unique
  DO UPDATE SET
    scan_id          = EXCLUDED.scan_id,
    value            = EXCLUDED.value,
    permission       = EXCLUDED.permission,
    classification   = EXCLUDED.classification,
    raw_output       = EXCLUDED.raw_output,
    found_at         = now(),
    first_seen_at    = LEAST(shadowit_findings.first_seen_at, EXCLUDED.first_seen_at),
    occurrence_count = shadowit_findings.occurrence_count + 1,
    reopened_at      = CASE
                          WHEN shadowit_findings.status IN ('resolved', 'false_positive')
                          THEN now()
                          ELSE shadowit_findings.reopened_at
                        END,
    status           = CASE
                          WHEN shadowit_findings.status IN ('resolved', 'false_positive')
                          THEN 'open'
                          ELSE shadowit_findings.status
                        END;
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_shadowit_finding(jsonb) TO service_role;
