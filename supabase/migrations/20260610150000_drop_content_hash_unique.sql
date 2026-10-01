-- Drop the unique constraint on content_hash so every import row is stored.
-- Duplicate prevention is now handled by Phase 1/Phase 2 identity matching
-- (external_id / Chave do item JIRA), not by content_hash.

ALTER TABLE public.vulnerabilities_aplicacao
  DROP CONSTRAINT IF EXISTS vulnerabilities_aplicacao_content_hash_key;

ALTER TABLE public.vulnerabilities_infra
  DROP CONSTRAINT IF EXISTS vulnerabilities_infra_content_hash_key;

-- Also drop unique index variant (used if the constraint was created as an index)
DROP INDEX IF EXISTS public.vulnerabilities_aplicacao_content_hash_key;
DROP INDEX IF EXISTS public.vulnerabilities_infra_content_hash_key;
