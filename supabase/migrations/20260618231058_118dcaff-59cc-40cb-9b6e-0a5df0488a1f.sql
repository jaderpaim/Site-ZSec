
-- indisponibilidades: scope DML policies to authenticated role
DROP POLICY IF EXISTS "Create indisponibilidades" ON public.indisponibilidades;
DROP POLICY IF EXISTS "Edit indisponibilidades"   ON public.indisponibilidades;
DROP POLICY IF EXISTS "Delete indisponibilidades" ON public.indisponibilidades;

CREATE POLICY "Create indisponibilidades" ON public.indisponibilidades
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'disponibilidade'::text)
    OR has_module_permission(auth.uid(), 'disponibilidade'::text, 'create'::text)
  );

CREATE POLICY "Edit indisponibilidades" ON public.indisponibilidades
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'disponibilidade'::text)
    OR has_module_permission(auth.uid(), 'disponibilidade'::text, 'edit'::text)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'disponibilidade'::text)
    OR has_module_permission(auth.uid(), 'disponibilidade'::text, 'edit'::text)
  );

CREATE POLICY "Delete indisponibilidades" ON public.indisponibilidades
  FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'disponibilidade'::text)
    OR has_module_permission(auth.uid(), 'disponibilidade'::text, 'delete'::text)
  );

-- nao_conformidades_manuais: scope DML policies to authenticated role
DROP POLICY IF EXISTS "Create nao_conformidades_manuais" ON public.nao_conformidades_manuais;
DROP POLICY IF EXISTS "Edit nao_conformidades_manuais"   ON public.nao_conformidades_manuais;
DROP POLICY IF EXISTS "Delete nao_conformidades_manuais" ON public.nao_conformidades_manuais;

CREATE POLICY "Create nao_conformidades_manuais" ON public.nao_conformidades_manuais
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'nao-conformidade'::text)
    OR has_module_permission(auth.uid(), 'nao-conformidade'::text, 'create'::text)
  );

CREATE POLICY "Edit nao_conformidades_manuais" ON public.nao_conformidades_manuais
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'nao-conformidade'::text)
    OR has_module_permission(auth.uid(), 'nao-conformidade'::text, 'edit'::text)
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'nao-conformidade'::text)
    OR has_module_permission(auth.uid(), 'nao-conformidade'::text, 'edit'::text)
  );

CREATE POLICY "Delete nao_conformidades_manuais" ON public.nao_conformidades_manuais
  FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'nao-conformidade'::text)
    OR has_module_permission(auth.uid(), 'nao-conformidade'::text, 'delete'::text)
  );
