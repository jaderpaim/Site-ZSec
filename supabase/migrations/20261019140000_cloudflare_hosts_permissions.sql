-- Permissões das telas novas do Cloudflare WAF (repaginação "organizado por
-- host"): Histórico de alterações, Managed rules e Load Balancing (config).
-- Segue o padrão de 20260904091500_cloudflare_analytics_loadbalancing_permission.sql.

-- 1) Catálogo
INSERT INTO public.module_permissions (module_slug, action, label, description, sort_order) VALUES
  ('cloudflare-waf', 'view_history', 'Histórico de alterações', 'Permite ver a aba Histórico: quem alterou DNS, regras, cache e configurações da zona, com o antes/depois.', 40),
  ('cloudflare-waf', 'manage_managed_rules', 'Gerenciar — Managed rules', 'Permite ver os Managed Rulesets da Cloudflare, ligar/desligar e ajustar ação, sensibilidade e exceções.', 41),
  ('cloudflare-waf', 'manage_load_balancing', 'Gerenciar — Load Balancing', 'Permite ver e editar o balanceador, os pools e as origens (ligar/desligar origem, pesos e monitor de saúde).', 42)
ON CONFLICT DO NOTHING;

-- 2) apply_role_defaults: admin/analista já cobrem tudo (iteram module_permissions
--    por module_slug). Sem mudança na função.

-- 3) Backfill: admins e analistas existentes recebem as novas permissões agora.
INSERT INTO public.user_module_permissions (user_id, module_slug, action, granted_by)
SELECT ur.user_id, mp.module_slug, mp.action, ur.user_id
FROM public.user_roles ur
CROSS JOIN public.module_permissions mp
WHERE ur.role IN ('admin','analista')
  AND mp.module_slug = 'cloudflare-waf'
  AND mp.action IN ('view_history', 'manage_managed_rules', 'manage_load_balancing')
ON CONFLICT (user_id, module_slug, action) DO NOTHING;
