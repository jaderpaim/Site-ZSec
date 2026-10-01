-- Backfill department_id on vulnerability records that have no department set,
-- by matching fqdn (case-insensitive) against applications.name.
-- This restores visibility for non-admin users whose RLS policy filters on department_id.

UPDATE public.vulnerabilities_aplicacao AS v
SET department_id = a.department_id
FROM public.applications AS a
WHERE LOWER(v.fqdn) = LOWER(a.name)
  AND v.department_id IS NULL;

UPDATE public.vulnerabilities_infra AS v
SET department_id = a.department_id
FROM public.applications AS a
WHERE LOWER(v.fqdn) = LOWER(a.name)
  AND v.department_id IS NULL;
