-- Corrige visibilidade de vulnerabilidades para visualizadores departamentais.
--
-- Problema: a política SELECT filtra por department_id = user_department_id(),
-- mas registros importados cujo FQDN não constava ainda em `applications` no
-- momento da importação têm department_id NULL — invisíveis para o visualizador
-- mesmo que o FQDN hoje mapeie para o departamento dele.
-- O upsert_vuln_infra não inclui department_id no ON CONFLICT DO UPDATE, então
-- upserts posteriores também não corrigem o valor.
--
-- Fix: expande a condição SELECT para também aceitar registros onde o FQDN
-- corresponde a uma aplicação cadastrada no departamento do viewer, além da
-- verificação direta de department_id.
-- Mantém as demais condições (admin, module_admin) inalteradas.

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
      AND (
        department_id = user_department_id(auth.uid())
        OR (
          fqdn IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.applications a
            WHERE lower(a.name) = lower(vulnerabilities_aplicacao.fqdn)
              AND a.department_id = user_department_id(auth.uid())
          )
        )
      )
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
      AND (
        department_id = user_department_id(auth.uid())
        OR (
          fqdn IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.applications a
            WHERE lower(a.name) = lower(vulnerabilities_infra.fqdn)
              AND a.department_id = user_department_id(auth.uid())
          )
        )
      )
    )
  );
