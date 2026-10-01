
-- Roll back previous view attempt (flagged as Security Definer View)
DROP VIEW IF EXISTS public.departments_public;

-- Restore permissive row SELECT for all authenticated users, but block the
-- sensitive emails column via column-level privileges. Emails are still
-- readable for admins/analystas through the service-role backed server fn.
DROP POLICY IF EXISTS "admin+analista view departments" ON public.departments;

CREATE POLICY "auth users view departments"
  ON public.departments FOR SELECT
  TO authenticated
  USING (true);

-- Revoke blanket table grant then re-grant only non-sensitive columns.
REVOKE SELECT ON public.departments FROM authenticated;
GRANT SELECT (id, name, description, created_at, updated_at, created_by)
  ON public.departments TO authenticated;
