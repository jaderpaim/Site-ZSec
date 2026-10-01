
-- 1) Catálogo: 5 sub-permissões da aba Operações do Cloudflare WAF
INSERT INTO public.module_permissions (module_slug, action, label, description, sort_order) VALUES
  ('cloudflare-waf', 'manage_buscar_dns',        'Gerenciar — Buscar DNS',        'Permite usar o painel de Busca de DNS na aba Operações.',        10),
  ('cloudflare-waf', 'manage_purge_cache',       'Gerenciar — Purge de Cache',    'Permite executar Purge de Cache na aba Operações.',              11),
  ('cloudflare-waf', 'manage_cache_performance', 'Gerenciar — Cache Performance', 'Permite consultar Cache Performance na aba Operações.',          12),
  ('cloudflare-waf', 'manage_adicionar_dns',     'Gerenciar — Adicionar DNS',     'Permite adicionar registros DNS na aba Operações.',              13),
  ('cloudflare-waf', 'manage_custom_rules',      'Gerenciar — Custom Rules',      'Permite gerenciar Custom Rules (WAF) na aba Operações.',         14)
ON CONFLICT DO NOTHING;

-- 2) apply_role_defaults: admin já cobre tudo (faz INSERT a partir de module_permissions),
--    analista também já cobre porque itera module_permissions onde module_slug = 'cloudflare-waf'.
--    Não há mudança necessária na função — ela já distribui automaticamente as novas ações.
--    Mantemos a função intacta.

-- 3) Backfill: garante que admins e analistas existentes recebam as novas permissões agora
INSERT INTO public.user_module_permissions (user_id, module_slug, action, granted_by)
SELECT ur.user_id, mp.module_slug, mp.action, ur.user_id
FROM public.user_roles ur
CROSS JOIN public.module_permissions mp
WHERE ur.role IN ('admin','analista')
  AND mp.module_slug = 'cloudflare-waf'
  AND mp.action IN ('manage_buscar_dns','manage_purge_cache','manage_cache_performance','manage_adicionar_dns','manage_custom_rules')
ON CONFLICT (user_id, module_slug, action) DO NOTHING;
