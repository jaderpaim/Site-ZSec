-- DAST Scanner e Shadow IT passam pro mesmo modelo de permissão do SAST.
--
-- Antes: trava única is_dast_allowed() = admin/super_admin E departamento
-- Segurança da Informação, tudo ou nada, e escrita direta nas tabelas pelo
-- client do usuário (RLS FOR ALL, ver 20261011120100_dast_policies.sql).
-- Agora:
--   * permissões granulares 'view' / 'edit' / 'manage' por módulo, concedidas
--     na tela de Usuários (admin e super_admin passam pelo bypass normal de
--     has_module_permission; sem exigência de departamento);
--   * RLS só de LEITURA (view) pra authenticated; toda escrita vai pelas
--     server functions com service_role, depois de checar a ação certa;
--   * exclusões: 'manage' + papel global admin/super_admin (checado no servidor).
--
-- Sem políticas TO service_role: ela tem BYPASSRLS (mesma convenção de
-- 20261015210000_remove_politicas_service_role_antigas.sql).
-- is_dast_allowed() continua existindo; não é removida aqui por segurança.

-- 1) Catálogo ─────────────────────────────────────────────────────────────────
INSERT INTO public.module_permissions (module_slug, action, label, description, sort_order) VALUES
  ('dast-scanner', 'view',   'Visualizar', 'Ver dashboard, scans, vulnerabilidades, ativos descobertos, agendamentos e exportar relatórios', 1),
  ('dast-scanner', 'edit',   'Operar',     'Iniciar e cancelar scans, retestar e triar vulnerabilidades, criar e ativar agendamentos', 2),
  ('dast-scanner', 'manage', 'Gerenciar',  'Credenciais (white box e AD/LDAP), descobertas (Cloudflare e rede interna) e confirmação de apps internas. Excluir exige também admin/super admin', 3),
  ('shadow-it',    'view',   'Visualizar', 'Ver hosts, achados e histórico de varreduras', 1),
  ('shadow-it',    'edit',   'Operar',     'Iniciar e cancelar varreduras e triar achados', 2),
  ('shadow-it',    'manage', 'Gerenciar',  'Credencial SMB e descoberta de rede. Excluir varredura exige também admin/super admin', 3)
ON CONFLICT DO NOTHING;

-- 2) RLS: troca TODAS as policies atuais dessas tabelas ──────────────────────
-- Os nomes das policies antigas variam (parte veio do banco de origem sem
-- migration), então derruba o que existir em vez de depender de nome.
DO $$
DECLARE
  p record;
BEGIN
  FOR p IN
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename IN (
        'dast_scans', 'dast_vulnerabilities', 'dast_recon_subdomains', 'dast_retest_history',
        'dast_scan_schedules', 'dast_scan_out_of_scope_hosts', 'dast_auth_credentials',
        'shadowit_hosts', 'shadowit_scans', 'shadowit_findings'
      )
  LOOP
    EXECUTE format('DROP POLICY %I ON %I.%I', p.policyname, p.schemaname, p.tablename);
  END LOOP;
END $$;

ALTER TABLE public.dast_scans                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dast_vulnerabilities         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dast_recon_subdomains        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dast_retest_history          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dast_scan_schedules          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dast_scan_out_of_scope_hosts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.dast_auth_credentials        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shadowit_hosts               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shadowit_scans               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shadowit_findings            ENABLE ROW LEVEL SECURITY;

-- Leitura (view). Realtime (dast_scans / dast_vulnerabilities) respeita isto.
CREATE POLICY "dast view scans" ON public.dast_scans
  FOR SELECT TO authenticated USING (public.has_module_permission(auth.uid(), 'dast-scanner', 'view'));
CREATE POLICY "dast view vulnerabilities" ON public.dast_vulnerabilities
  FOR SELECT TO authenticated USING (public.has_module_permission(auth.uid(), 'dast-scanner', 'view'));
CREATE POLICY "dast view recon subdomains" ON public.dast_recon_subdomains
  FOR SELECT TO authenticated USING (public.has_module_permission(auth.uid(), 'dast-scanner', 'view'));
CREATE POLICY "dast view retest history" ON public.dast_retest_history
  FOR SELECT TO authenticated USING (public.has_module_permission(auth.uid(), 'dast-scanner', 'view'));
CREATE POLICY "dast view schedules" ON public.dast_scan_schedules
  FOR SELECT TO authenticated USING (public.has_module_permission(auth.uid(), 'dast-scanner', 'view'));
CREATE POLICY "dast view out of scope hosts" ON public.dast_scan_out_of_scope_hosts
  FOR SELECT TO authenticated USING (public.has_module_permission(auth.uid(), 'dast-scanner', 'view'));
-- Credenciais de scan autenticado: só quem gerencia (senha fica cifrada, mas
-- usuário/URL de login já são informação sensível).
CREATE POLICY "dast manage auth credentials read" ON public.dast_auth_credentials
  FOR SELECT TO authenticated USING (public.has_module_permission(auth.uid(), 'dast-scanner', 'manage'));

CREATE POLICY "shadowit view hosts" ON public.shadowit_hosts
  FOR SELECT TO authenticated USING (public.has_module_permission(auth.uid(), 'shadow-it', 'view'));
CREATE POLICY "shadowit view scans" ON public.shadowit_scans
  FOR SELECT TO authenticated USING (public.has_module_permission(auth.uid(), 'shadow-it', 'view'));
CREATE POLICY "shadowit view findings" ON public.shadowit_findings
  FOR SELECT TO authenticated USING (public.has_module_permission(auth.uid(), 'shadow-it', 'view'));

-- 3) Authenticated não escreve mais direto (antes as policies FOR ALL deixavam).
REVOKE INSERT, UPDATE, DELETE ON
  public.dast_scans, public.dast_vulnerabilities, public.dast_recon_subdomains,
  public.dast_retest_history, public.dast_scan_schedules, public.dast_scan_out_of_scope_hosts,
  public.dast_auth_credentials, public.shadowit_hosts, public.shadowit_scans, public.shadowit_findings
FROM authenticated, anon;
GRANT SELECT ON
  public.dast_scans, public.dast_vulnerabilities, public.dast_recon_subdomains,
  public.dast_retest_history, public.dast_scan_schedules, public.dast_scan_out_of_scope_hosts,
  public.dast_auth_credentials, public.shadowit_hosts, public.shadowit_scans, public.shadowit_findings
TO authenticated;
