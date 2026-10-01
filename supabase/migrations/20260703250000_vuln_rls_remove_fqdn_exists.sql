-- Remove o branch EXISTS de FQDN das políticas SELECT de vulnerabilidades.
--
-- O subquery correlated EXISTS (SELECT 1 FROM applications WHERE lower(name) = lower(fqdn))
-- adicionado em 20260703220000 não tem índice em lower(applications.name), causando
-- timeout no PostgREST para visualizadores (admins entram no short-circuit has_role('admin')
-- antes de chegar nesse branch, por isso não são afetados).
--
-- Os 2383 registros de vulnerabilities_aplicacao da SI já têm department_id correto
-- via trigger e backfill — o fallback de FQDN na RLS é desnecessário.
-- O fallback de FQDN permanece apenas no filtro do frontend (VulnerabilidadesReal.tsx).

-- ── vulnerabilities_aplicacao ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "view vuln apl by dept or permission" ON public.vulnerabilities_aplicacao;
CREATE POLICY "view vuln apl by dept or permission" ON public.vulnerabilities_aplicacao
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'vulnerabilidades')
    OR (
      has_module_permission(auth.uid(), 'vulnerabilidades', 'view')
      AND user_department_id(auth.uid()) IS NOT NULL
      AND department_id = user_department_id(auth.uid())
    )
  );

-- ── vulnerabilities_infra ─────────────────────────────────────────────────────
DROP POLICY IF EXISTS "view vuln inf by dept or permission" ON public.vulnerabilities_infra;
CREATE POLICY "view vuln inf by dept or permission" ON public.vulnerabilities_infra
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'vulnerabilidades')
    OR (
      has_module_permission(auth.uid(), 'vulnerabilidades', 'view')
      AND user_department_id(auth.uid()) IS NOT NULL
      AND department_id = user_department_id(auth.uid())
    )
  );
