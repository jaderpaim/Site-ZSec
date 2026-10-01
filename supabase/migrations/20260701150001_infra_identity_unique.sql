-- Add unique constraint on (department_id, fqdn, vuln_type) for vulnerabilities_infra.
-- NULLS NOT DISTINCT (PostgreSQL 15+) ensures that two rows with the same NULL
-- department_id or vuln_type still conflict — preventing silent duplicate insertion.
-- Must run AFTER 20260701150000_cleanup_infra_duplicates.sql.

ALTER TABLE public.vulnerabilities_infra
  ADD CONSTRAINT vulnerabilities_infra_identity_unique
  UNIQUE NULLS NOT DISTINCT (department_id, fqdn, vuln_type);
