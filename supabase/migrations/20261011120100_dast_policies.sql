-- Policies das tabelas do DAST (criadas em 20260820115900_reconstroi_tabelas_dast).
-- No banco de origem elas foram criadas direto no banco, sem migration.
--
-- dast.functions.ts acessa estas tabelas com o client do próprio usuário
-- (context.supabase), depois de assertDastAccess -- então a mesma regra vale
-- aqui: is_dast_allowed(), criada em 20260825150000 (admin/super_admin do
-- departamento de Segurança da Informação). Callbacks do scanner usam a
-- service role e não passam por estas policies.

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'dast_scans', 'dast_vulnerabilities', 'dast_recon_subdomains',
    'dast_retest_history', 'dast_scan_schedules'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS "dast access %1$s" ON public.%1$I', t);
    EXECUTE format(
      'CREATE POLICY "dast access %1$s" ON public.%1$I FOR ALL TO authenticated
         USING (public.is_dast_allowed(auth.uid()))
         WITH CHECK (public.is_dast_allowed(auth.uid()))',
      t
    );
  END LOOP;
END $$;
