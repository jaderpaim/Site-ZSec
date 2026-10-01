
-- Restrict base table SELECT to admin/analista (emails column is sensitive)
DROP POLICY IF EXISTS "auth users view departments" ON public.departments;

CREATE POLICY "admin+analista view departments"
  ON public.departments FOR SELECT
  TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'analista'::app_role)
  );

-- Public view without the sensitive emails column for all authenticated users
CREATE OR REPLACE VIEW public.departments_public AS
  SELECT id, name, description, created_at, updated_at
  FROM public.departments;

ALTER VIEW public.departments_public SET (security_invoker = off);

GRANT SELECT ON public.departments_public TO authenticated;
