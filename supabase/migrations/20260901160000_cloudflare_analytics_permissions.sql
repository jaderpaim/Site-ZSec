
-- Novas sub-permissões da aba "Analytics" do Cloudflare WAF (Fase 1: HTTP Traffic e Security).
-- Segue o mesmo padrão de 20260531011732_8e90872a-8396-4e17-94ee-8f37965dc423.sql e
-- 20260824120000_cloudflare_dns_edit_permission.sql.

-- 1) Catálogo
INSERT INTO public.module_permissions (module_slug, action, label, description, sort_order) VALUES
  ('cloudflare-waf', 'view_analytics_http',     'Analytics — HTTP Traffic', 'Permite visualizar a sub-aba HTTP Traffic em Analytics.', 20),
  ('cloudflare-waf', 'view_analytics_security', 'Analytics — Security',     'Permite visualizar a sub-aba Security em Analytics.',     21)
ON CONFLICT DO NOTHING;

-- 2) apply_role_defaults: admin já cobre tudo (INSERT a partir de module_permissions),
--    analista também já cobre porque itera module_permissions onde module_slug = 'cloudflare-waf'.
--    Não há mudança necessária na função.

-- 3) Backfill: garante que admins e analistas existentes recebam as novas permissões agora
INSERT INTO public.user_module_permissions (user_id, module_slug, action, granted_by)
SELECT ur.user_id, mp.module_slug, mp.action, ur.user_id
FROM public.user_roles ur
CROSS JOIN public.module_permissions mp
WHERE ur.role IN ('admin','analista')
  AND mp.module_slug = 'cloudflare-waf'
  AND mp.action IN ('view_analytics_http','view_analytics_security')
ON CONFLICT (user_id, module_slug, action) DO NOTHING;
