DROP INDEX IF EXISTS public.vulnerabilities_content_hash_key;

CREATE OR REPLACE FUNCTION public.vulnerabilities_set_content_hash()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  summary_text text;
  port_text text;
  references_text text;
  asset_text text;
BEGIN
  summary_text := lower(btrim(coalesce(
    nullif(NEW.raw->>'Resumo', ''),
    nullif(NEW.vuln_type, ''),
    nullif(NEW.raw->>'Descrição', ''),
    ''
  )));

  port_text := lower(btrim(coalesce(
    nullif(NEW.raw->>'Campo personalizado (Port)', ''),
    nullif(NEW.raw->>'Porta', ''),
    nullif(NEW.raw->>'Port', ''),
    ''
  )));

  references_text := lower(btrim(coalesce(
    nullif(NEW.raw->>'Campo personalizado (References)', ''),
    nullif(NEW.raw->>'CVE', ''),
    nullif(NEW.raw->>'Plugin ID', ''),
    ''
  )));

  asset_text := lower(btrim(coalesce(
    nullif(NEW.system_app, ''),
    nullif(NEW.raw->>'Campo personalizado (Asset)', ''),
    nullif(NEW.raw->>'Asset', ''),
    ''
  )));

  NEW.content_hash := md5(
    lower(btrim(coalesce(NEW.fqdn, ''))) || '|' ||
    summary_text || '|' ||
    port_text || '|' ||
    references_text || '|' ||
    asset_text || '|' ||
    coalesce(NEW.severity::text, '') || '|' ||
    lower(btrim(coalesce(NEW.source, ''))) || '|' ||
    coalesce(NEW.identified_at::text, '') || '|' ||
    lower(btrim(coalesce(NEW.kind, '')))
  );

  RETURN NEW;
END;
$$;

UPDATE public.vulnerabilities
SET updated_at = updated_at;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY content_hash
      ORDER BY
        CASE WHEN raw IS NULL THEN 1 ELSE 0 END,
        CASE WHEN department_id IS NOT NULL OR btrim(COALESCE(responsible, '')) <> '' THEN 0 ELSE 1 END,
        CASE WHEN status IN ('Mitigada', 'Fechada', 'Em tratamento') THEN 0 ELSE 1 END,
        updated_at DESC,
        created_at DESC,
        id DESC
    ) AS rn
  FROM public.vulnerabilities
)
DELETE FROM public.vulnerabilities v
USING ranked r
WHERE v.id = r.id
  AND r.rn > 1;

CREATE UNIQUE INDEX vulnerabilities_content_hash_key
  ON public.vulnerabilities (content_hash);