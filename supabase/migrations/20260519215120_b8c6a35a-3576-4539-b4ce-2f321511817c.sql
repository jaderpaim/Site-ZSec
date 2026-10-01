DROP INDEX IF EXISTS public.vulnerabilities_content_hash_key;

CREATE OR REPLACE FUNCTION public.vulnerabilities_set_content_hash()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.content_hash := md5(
    lower(btrim(COALESCE(NEW.fqdn, ''))) || '|' ||
    lower(btrim(COALESCE(NEW.vuln_type, ''))) || '|' ||
    COALESCE(NEW.severity::text, '') || '|' ||
    lower(btrim(COALESCE(NEW.system_app, ''))) || '|' ||
    lower(btrim(COALESCE(NEW.source, ''))) || '|' ||
    COALESCE(NEW.identified_at::text, '') || '|' ||
    lower(btrim(COALESCE(NEW.kind, '')))
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vulnerabilities_content_hash ON public.vulnerabilities;
DROP TRIGGER IF EXISTS vulnerabilities_content_hash_trg ON public.vulnerabilities;
CREATE TRIGGER vulnerabilities_content_hash_trg
BEFORE INSERT OR UPDATE ON public.vulnerabilities
FOR EACH ROW EXECUTE FUNCTION public.vulnerabilities_set_content_hash();

UPDATE public.vulnerabilities
SET updated_at = updated_at;

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY content_hash
      ORDER BY
        CASE WHEN raw IS NULL THEN 1 ELSE 0 END DESC,
        CASE WHEN department_id IS NOT NULL OR btrim(COALESCE(responsible, '')) <> '' THEN 1 ELSE 0 END DESC,
        CASE WHEN status IN ('Mitigada', 'Fechada', 'Em tratamento') THEN 1 ELSE 0 END DESC,
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

CREATE UNIQUE INDEX IF NOT EXISTS vulnerabilities_content_hash_key
  ON public.vulnerabilities (content_hash);