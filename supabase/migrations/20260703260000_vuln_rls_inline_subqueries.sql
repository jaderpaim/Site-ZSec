-- Substitui chamadas a funções STABLE SECURITY DEFINER nas policies de vuln
-- por subqueries inline equivalentes.
--
-- Problema: has_role/is_module_admin/has_module_permission/user_department_id
-- são SECURITY DEFINER e chamam umas às outras em cadeia. O planner do PostgreSQL
-- não garante cache dessas funções em contexto de RLS, avaliando-as por linha.
-- Para visualizadores (sem short-circuit admin), isso gera N × 5-7 subqueries
-- onde N = total de linhas da tabela — causando timeout (error=57014).
--
-- Solução: subqueries inline sem referência à linha atual são materializadas
-- UMA VEZ pelo planner para toda a execução do SELECT.
-- A lógica é idêntica: as chamadas às funções com auth.uid() equivalem exatamente
-- aos EXISTS/IN inline abaixo (a guarda _user_id = auth.uid() é trivialmente
-- verdadeira em RLS, pois sempre passamos auth.uid() como argumento).

-- ── vulnerabilities_aplicacao ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "view vuln apl by dept or permission" ON public.vulnerabilities_aplicacao;
CREATE POLICY "view vuln apl by dept or permission" ON public.vulnerabilities_aplicacao
  FOR SELECT TO authenticated
  USING (
    -- Admin global (materializado uma vez)
    auth.uid() IN (SELECT user_id FROM public.user_roles WHERE role = 'admin')
    -- Admin do módulo (materializado uma vez)
    OR auth.uid() IN (SELECT user_id FROM public.module_admins WHERE module_slug = 'vulnerabilidades')
    -- Viewer com dept: permissão + comparação de dept por linha
    OR (
      auth.uid() IN (
        SELECT user_id FROM public.user_module_permissions
        WHERE module_slug = 'vulnerabilidades' AND action = 'view'
      )
      AND department_id IS NOT NULL
      AND department_id = (SELECT department_id FROM public.profiles WHERE id = auth.uid())
    )
  );

-- ── vulnerabilities_infra ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "view vuln inf by dept or permission" ON public.vulnerabilities_infra;
CREATE POLICY "view vuln inf by dept or permission" ON public.vulnerabilities_infra
  FOR SELECT TO authenticated
  USING (
    auth.uid() IN (SELECT user_id FROM public.user_roles WHERE role = 'admin')
    OR auth.uid() IN (SELECT user_id FROM public.module_admins WHERE module_slug = 'vulnerabilidades')
    OR (
      auth.uid() IN (
        SELECT user_id FROM public.user_module_permissions
        WHERE module_slug = 'vulnerabilidades' AND action = 'view'
      )
      AND department_id IS NOT NULL
      AND department_id = (SELECT department_id FROM public.profiles WHERE id = auth.uid())
    )
  );
