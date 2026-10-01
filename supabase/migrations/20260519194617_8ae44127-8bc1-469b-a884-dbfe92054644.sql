-- 1) Add 'kind' (aplicacao vs infraestrutura) and 'raw' jsonb to make dedup hash highly unique per source row
ALTER TABLE public.vulnerabilities
  ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'aplicacao',
  ADD COLUMN IF NOT EXISTS raw jsonb;

DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'vulnerabilities_kind_check'
  ) THEN
    ALTER TABLE public.vulnerabilities
      ADD CONSTRAINT vulnerabilities_kind_check CHECK (kind IN ('aplicacao','infraestrutura'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS vulnerabilities_kind_idx ON public.vulnerabilities (kind);

-- 2) Recreate content_hash function to include kind + md5(raw) so two truly different rows can no longer collapse
CREATE OR REPLACE FUNCTION public.vulnerabilities_set_content_hash()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.content_hash := md5(
    COALESCE(NEW.fqdn,'') || '|' ||
    COALESCE(NEW.vuln_type,'') || '|' ||
    COALESCE(NEW.severity::text,'') || '|' ||
    COALESCE(NEW.system_app,'') || '|' ||
    COALESCE(NEW.source,'') || '|' ||
    COALESCE(NEW.responsible,'') || '|' ||
    COALESCE(NEW.identified_at::text,'') || '|' ||
    COALESCE(NEW.kind,'') || '|' ||
    COALESCE(md5(NEW.raw::text),'')
  );
  RETURN NEW;
END;
$$;

-- 3) Ensure the trigger is actually wired (it existed as a function but was not attached)
DROP TRIGGER IF EXISTS vulnerabilities_content_hash_trg ON public.vulnerabilities;
CREATE TRIGGER vulnerabilities_content_hash_trg
BEFORE INSERT OR UPDATE ON public.vulnerabilities
FOR EACH ROW EXECUTE FUNCTION public.vulnerabilities_set_content_hash();

-- 4) Recompute content_hash for any existing rows so the unique index reflects the new formula
UPDATE public.vulnerabilities SET updated_at = now();