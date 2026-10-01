
-- 1) departments.emails column-level restriction (keep broad SELECT of other cols)
REVOKE SELECT ON public.departments FROM authenticated;
GRANT SELECT (id, name, description, created_at, updated_at, created_by) ON public.departments TO authenticated;
GRANT SELECT ON public.departments TO service_role;

-- 2) gmud_aprovadores: add WITH CHECK to approver self-update policy
DROP POLICY IF EXISTS "approver update own line" ON public.gmud_aprovadores;
CREATE POLICY "approver update own line" ON public.gmud_aprovadores
  FOR UPDATE
  USING (lower(email_aprovador) = lower((auth.jwt() ->> 'email'::text)))
  WITH CHECK (lower(email_aprovador) = lower((auth.jwt() ->> 'email'::text)));

-- 3) indisponibilidades: explicit admin role in write policies
DROP POLICY IF EXISTS "Create indisponibilidades" ON public.indisponibilidades;
CREATE POLICY "Create indisponibilidades" ON public.indisponibilidades
  FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'disponibilidade'::text)
    OR has_module_permission(auth.uid(), 'disponibilidade'::text, 'create'::text)
  );

DROP POLICY IF EXISTS "Edit indisponibilidades" ON public.indisponibilidades;
CREATE POLICY "Edit indisponibilidades" ON public.indisponibilidades
  FOR UPDATE
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

DROP POLICY IF EXISTS "Delete indisponibilidades" ON public.indisponibilidades;
CREATE POLICY "Delete indisponibilidades" ON public.indisponibilidades
  FOR DELETE
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'disponibilidade'::text)
    OR has_module_permission(auth.uid(), 'disponibilidade'::text, 'delete'::text)
  );

-- 4) nao_conformidades_manuais: explicit admin role in write policies
DROP POLICY IF EXISTS "Create nao_conformidades_manuais" ON public.nao_conformidades_manuais;
CREATE POLICY "Create nao_conformidades_manuais" ON public.nao_conformidades_manuais
  FOR INSERT
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'nao-conformidade'::text)
    OR has_module_permission(auth.uid(), 'nao-conformidade'::text, 'create'::text)
  );

DROP POLICY IF EXISTS "Edit nao_conformidades_manuais" ON public.nao_conformidades_manuais;
CREATE POLICY "Edit nao_conformidades_manuais" ON public.nao_conformidades_manuais
  FOR UPDATE
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

DROP POLICY IF EXISTS "Delete nao_conformidades_manuais" ON public.nao_conformidades_manuais;
CREATE POLICY "Delete nao_conformidades_manuais" ON public.nao_conformidades_manuais
  FOR DELETE
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'nao-conformidade'::text)
    OR has_module_permission(auth.uid(), 'nao-conformidade'::text, 'delete'::text)
  );
