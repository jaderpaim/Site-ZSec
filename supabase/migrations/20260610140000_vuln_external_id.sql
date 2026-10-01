-- Add external_id to vulnerability tables for stable cross-import identity matching.
-- For JIRA exports this is populated from raw->>'Chave' (immutable issue key).

ALTER TABLE public.vulnerabilities_aplicacao
  ADD COLUMN IF NOT EXISTS external_id text;

ALTER TABLE public.vulnerabilities_infra
  ADD COLUMN IF NOT EXISTS external_id text;

-- Backfill from JIRA key fields (several name variants from different JIRA export formats)
UPDATE public.vulnerabilities_aplicacao
  SET external_id = COALESCE(
    raw->>'Chave do item (JIRA)',
    raw->>'Chave',
    raw->>'Key',
    raw->>'Issue Key'
  )
  WHERE external_id IS NULL
    AND (raw ? 'Chave do item (JIRA)' OR raw ? 'Chave' OR raw ? 'Key' OR raw ? 'Issue Key');

UPDATE public.vulnerabilities_infra
  SET external_id = COALESCE(
    raw->>'Chave do item',
    raw->>'Chave',
    raw->>'Key',
    raw->>'Issue Key'
  )
  WHERE external_id IS NULL
    AND (raw ? 'Chave do item (JIRA)' OR raw ? 'Chave' OR raw ? 'Key' OR raw ? 'Issue Key');
