
-- Allow null identified_at and drop default
ALTER TABLE public.vulnerabilities
  ALTER COLUMN identified_at DROP NOT NULL,
  ALTER COLUMN identified_at DROP DEFAULT;

-- Drop unique index to allow data wipe + new hash formula
DROP INDEX IF EXISTS public.vulnerabilities_content_hash_key;

-- Wipe existing vulnerability data (user-requested fresh import)
DELETE FROM public.vulnerabilities;

-- New, more granular dedup hash including url/param/evidence/external_id/description
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
  url_text text;
  param_text text;
  evidence_text text;
  external_id_text text;
  description_hash text;
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

  url_text := lower(btrim(coalesce(
    nullif(NEW.raw->>'Campo personalizado (URL)', ''),
    nullif(NEW.raw->>'URL', ''),
    nullif(NEW.raw->>'Url', ''),
    nullif(NEW.raw->>'Path', ''),
    ''
  )));

  param_text := lower(btrim(coalesce(
    nullif(NEW.raw->>'Campo personalizado (Parameter)', ''),
    nullif(NEW.raw->>'Parameter', ''),
    nullif(NEW.raw->>'Parametro', ''),
    nullif(NEW.raw->>'Parâmetro', ''),
    ''
  )));

  evidence_text := lower(btrim(coalesce(
    nullif(NEW.raw->>'Campo personalizado (Evidence)', ''),
    nullif(NEW.raw->>'Evidence', ''),
    nullif(NEW.raw->>'Evidencia', ''),
    nullif(NEW.raw->>'Evidência', ''),
    ''
  )));

  external_id_text := lower(btrim(coalesce(
    nullif(NEW.raw->>'Chave', ''),
    nullif(NEW.raw->>'Key', ''),
    nullif(NEW.raw->>'Issue Key', ''),
    nullif(NEW.raw->>'ID', ''),
    ''
  )));

  description_hash := md5(coalesce(NEW.raw->>'Descrição', NEW.raw->>'Description', ''));

  NEW.content_hash := md5(
    lower(btrim(coalesce(NEW.fqdn, ''))) || '|' ||
    summary_text || '|' ||
    port_text || '|' ||
    references_text || '|' ||
    asset_text || '|' ||
    coalesce(NEW.severity::text, '') || '|' ||
    lower(btrim(coalesce(NEW.source, ''))) || '|' ||
    coalesce(NEW.identified_at::text, '') || '|' ||
    lower(btrim(coalesce(NEW.kind, ''))) || '|' ||
    url_text || '|' ||
    param_text || '|' ||
    evidence_text || '|' ||
    external_id_text || '|' ||
    description_hash
  );

  RETURN NEW;
END;
$$;

-- Recreate trigger
DROP TRIGGER IF EXISTS vulnerabilities_content_hash_trg ON public.vulnerabilities;
DROP TRIGGER IF EXISTS trg_vulnerabilities_content_hash ON public.vulnerabilities;
CREATE TRIGGER vulnerabilities_content_hash_trg
BEFORE INSERT OR UPDATE ON public.vulnerabilities
FOR EACH ROW EXECUTE FUNCTION public.vulnerabilities_set_content_hash();

-- Recreate unique index
CREATE UNIQUE INDEX vulnerabilities_content_hash_key
  ON public.vulnerabilities (content_hash);
