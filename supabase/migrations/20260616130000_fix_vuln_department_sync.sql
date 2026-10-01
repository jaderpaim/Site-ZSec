-- Fix: ensure vulnerability department_id always reflects the applications table mapping.
--
-- Problem: Non-admin users are filtered by RLS using department_id = user_department_id().
-- The frontend overrides this via fqdnDeptMap (applications table), but the DB RLS does not.
-- Vulnerabilities imported after the original backfill, or with a wrong department_id, are
-- invisible to analysts even though their FQDN maps to the analyst's department.
--
-- Fix 1: Full backfill — update department_id from applications for ALL vulns whose FQDN
--         matches, overriding any previously wrong value (not just IS NULL).
UPDATE public.vulnerabilities_aplicacao AS v
SET department_id = a.department_id,
    responsible   = d.name
FROM public.applications AS a
JOIN public.departments   AS d ON d.id = a.department_id
WHERE LOWER(v.fqdn) = LOWER(a.name)
  AND v.department_id IS DISTINCT FROM a.department_id;

UPDATE public.vulnerabilities_infra AS v
SET department_id = a.department_id,
    responsible   = d.name
FROM public.applications AS a
JOIN public.departments   AS d ON d.id = a.department_id
WHERE LOWER(v.fqdn) = LOWER(a.name)
  AND v.department_id IS DISTINCT FROM a.department_id;

-- Fix 2: Trigger that auto-populates department_id on INSERT of new vulnerabilities
--        when the FQDN already exists in the applications table.
CREATE OR REPLACE FUNCTION public.vuln_set_department_from_fqdn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  app_dept_id uuid;
  dept_name   text;
BEGIN
  IF NEW.fqdn IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT a.department_id, d.name
    INTO app_dept_id, dept_name
    FROM public.applications a
    JOIN public.departments  d ON d.id = a.department_id
   WHERE LOWER(a.name) = LOWER(NEW.fqdn)
   LIMIT 1;

  IF app_dept_id IS NOT NULL THEN
    NEW.department_id := app_dept_id;
    NEW.responsible   := dept_name;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vuln_apl_set_dept ON public.vulnerabilities_aplicacao;
CREATE TRIGGER trg_vuln_apl_set_dept
  BEFORE INSERT ON public.vulnerabilities_aplicacao
  FOR EACH ROW EXECUTE FUNCTION public.vuln_set_department_from_fqdn();

DROP TRIGGER IF EXISTS trg_vuln_inf_set_dept ON public.vulnerabilities_infra;
CREATE TRIGGER trg_vuln_inf_set_dept
  BEFORE INSERT ON public.vulnerabilities_infra
  FOR EACH ROW EXECUTE FUNCTION public.vuln_set_department_from_fqdn();
