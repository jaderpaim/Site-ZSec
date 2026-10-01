
-- =========== Vulnerabilities dedup via content_hash ===========
ALTER TABLE public.vulnerabilities ADD COLUMN IF NOT EXISTS content_hash text;

CREATE OR REPLACE FUNCTION public.vulnerabilities_set_content_hash()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.content_hash := md5(
    COALESCE(NEW.fqdn,'') || '|' ||
    COALESCE(NEW.vuln_type,'') || '|' ||
    COALESCE(NEW.severity::text,'') || '|' ||
    COALESCE(NEW.system_app,'') || '|' ||
    COALESCE(NEW.source,'') || '|' ||
    COALESCE(NEW.responsible,'') || '|' ||
    COALESCE(NEW.identified_at::text,'')
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vulnerabilities_content_hash ON public.vulnerabilities;
CREATE TRIGGER trg_vulnerabilities_content_hash
BEFORE INSERT OR UPDATE ON public.vulnerabilities
FOR EACH ROW EXECUTE FUNCTION public.vulnerabilities_set_content_hash();

-- Backfill
UPDATE public.vulnerabilities SET content_hash = md5(
  COALESCE(fqdn,'') || '|' || COALESCE(vuln_type,'') || '|' || COALESCE(severity::text,'') || '|' ||
  COALESCE(system_app,'') || '|' || COALESCE(source,'') || '|' || COALESCE(responsible,'') || '|' ||
  COALESCE(identified_at::text,'')
) WHERE content_hash IS NULL;

-- Remove existing duplicates (keep the newest by created_at)
DELETE FROM public.vulnerabilities a
USING public.vulnerabilities b
WHERE a.content_hash = b.content_hash
  AND a.ctid < b.ctid;

CREATE UNIQUE INDEX IF NOT EXISTS vulnerabilities_content_hash_key
  ON public.vulnerabilities(content_hash);

-- =========== Integrations table ===========
CREATE TABLE IF NOT EXISTS public.integrations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL UNIQUE,
  name text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  base_url text,
  api_key text,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "auth view integrations" ON public.integrations;
CREATE POLICY "auth view integrations" ON public.integrations
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "admin manage integrations" ON public.integrations;
CREATE POLICY "admin manage integrations" ON public.integrations
  FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS trg_integrations_updated ON public.integrations;
CREATE TRIGGER trg_integrations_updated
BEFORE UPDATE ON public.integrations
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
