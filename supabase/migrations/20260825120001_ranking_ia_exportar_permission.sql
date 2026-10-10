-- Nova sub-permissão do módulo "Ranking de Uso de IA": "Exportar".
-- Controla a exibição do botão de exportar (CSV/Excel) em RankingIaReal.tsx.
-- Mesmo padrão de 20260824120000_cloudflare_dns_edit_permission.sql.

-- 1) Catálogo — aparece automaticamente na aba "Ranking IA" de Gestão de Usuários
INSERT INTO public.module_permissions (module_slug, action, label, description, sort_order) VALUES
  ('ranking-ia', 'manage_exportar_ranking_ia', 'Exportar', 'Permite exportar o ranking de uso de IA em CSV/Excel.', 10)
ON CONFLICT DO NOTHING;

-- 2) apply_role_defaults: sem mudança necessária.
--    'ranking-ia' não está em monitoramento_modules/operacao_modules, então
--    analista não recebe automaticamente — mesmo comportamento que já vale
--    hoje para 'ranking-ia:view'. Concessão fica manual pela tela de usuários.

-- 3) Backfill: só para admins existentes (globais). Quem já tem 'view' manual
-- no ranking-ia (analista/visualizador/personalizado) NÃO recebe 'export'
-- automaticamente — fica restrito, liberação é manual e intencional por usuário.
INSERT INTO public.user_module_permissions (user_id, module_slug, action, granted_by)
SELECT ur.user_id, 'ranking-ia', 'manage_exportar_ranking_ia', ur.user_id
FROM public.user_roles ur
WHERE ur.role = 'admin'
ON CONFLICT (user_id, module_slug, action) DO NOTHING;
