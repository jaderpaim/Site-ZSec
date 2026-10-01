-- Cleanup duplicate records in vulnerabilities_infra before adding unique constraint.
-- For each identity group (department_id, fqdn, vuln_type):
--   1. Propagate the MINIMUM identified_at to all copies in the group so the
--      oldest known discovery date survives regardless of which copy we keep.
--   2. Delete all but the record with the earliest created_at (tie-break).

-- Step 1: set identified_at to the minimum across all duplicates in each group
UPDATE public.vulnerabilities_infra v
SET identified_at = g.min_date
FROM (
  SELECT department_id, fqdn, vuln_type, MIN(identified_at) AS min_date
  FROM public.vulnerabilities_infra
  WHERE identified_at IS NOT NULL
  GROUP BY department_id, fqdn, vuln_type
  HAVING COUNT(*) > 1
) g
WHERE v.department_id IS NOT DISTINCT FROM g.department_id
  AND v.fqdn = g.fqdn
  AND v.vuln_type IS NOT DISTINCT FROM g.vuln_type
  AND (v.identified_at IS NULL OR v.identified_at > g.min_date);

-- Step 2: delete duplicates keeping the oldest record (by created_at) per group
DELETE FROM public.vulnerabilities_infra
WHERE id IN (
  SELECT id
  FROM (
    SELECT id,
           ROW_NUMBER() OVER (
             PARTITION BY department_id, fqdn, vuln_type
             ORDER BY COALESCE(identified_at, '9999-12-31'::date) ASC,
                      created_at ASC
           ) AS rn
    FROM public.vulnerabilities_infra
  ) ranked
  WHERE rn > 1
);
