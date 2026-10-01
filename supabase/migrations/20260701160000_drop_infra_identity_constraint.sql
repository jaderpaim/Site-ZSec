-- Remove the unique constraint and UPSERT RPC created in 20260701150001/150002.
-- The scanner exports multiple rows per (host, vulnerability) — one per port, CVE, or
-- affected component — so a unique constraint on (department_id, fqdn, vuln_type)
-- incorrectly discards legitimate distinct vulnerability instances.
-- Deduplication is now handled at the chart level using raw["Situação"].

ALTER TABLE public.vulnerabilities_infra
  DROP CONSTRAINT IF EXISTS vulnerabilities_infra_identity_unique;

DROP FUNCTION IF EXISTS public.upsert_vuln_infra(jsonb);
