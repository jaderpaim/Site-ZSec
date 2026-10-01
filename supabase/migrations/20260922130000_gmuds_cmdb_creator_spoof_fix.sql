-- gmuds.criado_por e cmdb_ativos.created_by são sempre preenchidos pelo
-- próprio front (user?.id ?? null -- NewGmudDialog.tsx / CmdbFormDialog.tsx),
-- nunca escolhidos pelo usuário. Mas a policy de INSERT só checava
-- role/permissão de módulo, nunca que o valor enviado batia com quem estava
-- autenticado -- um POST direto (fora da UI) podia gravar
-- criado_por/created_by de outra pessoa, falsificando quem abriu o GMUD ou
-- cadastrou o ativo. Mesmo padrão já corrigido em email_logs (20260615231015).

DROP POLICY IF EXISTS "analyst+admin insert gmuds" ON public.gmuds;
CREATE POLICY "analyst+admin insert own gmuds" ON public.gmuds
  FOR INSERT TO authenticated
  WITH CHECK (
    (has_role(auth.uid(), 'admin') OR has_role(auth.uid(), 'analista'))
    AND (criado_por IS NULL OR criado_por = auth.uid())
  );

DROP POLICY IF EXISTS "insert cmdb by permission" ON public.cmdb_ativos;
CREATE POLICY "insert own cmdb by permission" ON public.cmdb_ativos
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      has_role(auth.uid(), 'admin'::app_role)
      OR is_module_admin(auth.uid(), 'cmdb')
      OR has_module_permission(auth.uid(), 'cmdb', 'create')
      OR has_module_permission(auth.uid(), 'cmdb', 'edit')
    )
    AND (created_by IS NULL OR created_by = auth.uid())
  );
