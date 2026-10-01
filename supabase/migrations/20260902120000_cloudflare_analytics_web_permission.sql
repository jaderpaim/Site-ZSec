
-- Nova sub-permissão da aba "Analytics" do Cloudflare WAF (Web Analytics / RUM).
-- Segue o mesmo padrão de 20260901160000_cloudflare_analytics_permissions.sql.

-- 1) Catálogo
INSERT INTO public.module_permissions (module_slug, action, label, description, sort_order) VALUES
  ('cloudflare-waf', 'view_analytics_web', 'Analytics — Web Analytics', 'Permite visualizar a sub-aba Web Analytics em Analytics.', 22)
ON CONFLICT DO NOTHING;

-- 2) apply_role_defaults: admin já cobre tudo (INSERT a partir de module_permissions),
--    analista também já cobre porque itera module_permissions onde module_slug = 'cloudflare-waf'.
--    Não há mudança necessária na função.

-- 3) Backfill: garante que admins e analistas existentes recebam a nova permissão agora
INSERT INTO public.user_module_permissions (user_id, module_slug, action, granted_by)
SELECT ur.user_id, mp.module_slug, mp.action, ur.user_id
FROM public.user_roles ur
CROSS JOIN public.module_permissions mp
WHERE ur.role IN ('admin','analista')
  AND mp.module_slug = 'cloudflare-waf'
  AND mp.action = 'view_analytics_web'
ON CONFLICT (user_id, module_slug, action) DO NOTHING;
