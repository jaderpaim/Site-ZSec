-- Granulariza "manage_rules" (20260908100000_cloudflare_rules_permission.sql)
-- em 3 níveis:
--   1) manage_rules            — já existia: controla se a aba "Rules" aparece.
--   2) manage_rules_overview / manage_rules_page_rules — controla cada sub-aba.
--      "Overview" aqui é visualização: quem tem só essa permissão VÊ a
--      listagem de todas as categorias (somente leitura).
--   3) manage_rules_overview_<categoria> — uma por categoria do Ruleset
--      Engine listada em Overview. Controla só criar/editar/excluir/
--      reordenar regra DAQUELA categoria (ver CATEGORY_PERMISSION em
--      cloudflare.rules.functions.ts). Sem ela, a categoria continua visível
--      na listagem, só os botões de Create/Edit/Delete ficam bloqueados.
--
-- IMPORTANTE: usuários "personalizado" que hoje só têm "manage_rules"
-- concedido perdem a capacidade de criar/editar/excluir regras (tanto em
-- Overview quanto em Page Rules) até que um admin conceda também
-- "manage_rules_overview"/"manage_rules_page_rules" e, pra cada categoria
-- específica de Overview, "manage_rules_overview_<categoria>". Admin e
-- Analista continuam cobertos automaticamente (apply_role_defaults itera
-- module_permissions por module_slug).

-- 1) Catálogo
INSERT INTO public.module_permissions (module_slug, action, label, description, sort_order) VALUES
  ('cloudflare-waf', 'manage_rules_overview', 'Rules — Overview', 'Permite visualizar a sub-aba Overview de Rules (listagem de todas as categorias, somente leitura sem as permissões abaixo).', 17),
  ('cloudflare-waf', 'manage_rules_overview_url_rewrite', 'Overview — URL Rewrite Rules', 'Permite criar, editar e excluir URL Rewrite Rules.', 18),
  ('cloudflare-waf', 'manage_rules_overview_redirect', 'Overview — Redirect Rules', 'Permite criar, editar e excluir Redirect Rules.', 19),
  ('cloudflare-waf', 'manage_rules_overview_origin', 'Overview — Origin Rules', 'Permite criar, editar e excluir Origin Rules.', 20),
  ('cloudflare-waf', 'manage_rules_overview_cache', 'Overview — Cache Rules', 'Permite criar, editar e excluir Cache Rules.', 21),
  ('cloudflare-waf', 'manage_rules_overview_cache_response', 'Overview — Cache Response Rules', 'Permite criar, editar e excluir Cache Response Rules.', 22),
  ('cloudflare-waf', 'manage_rules_overview_request_header_transform', 'Overview — Request Header Transform Rules', 'Permite criar, editar e excluir Request Header Transform Rules.', 23),
  ('cloudflare-waf', 'manage_rules_overview_response_header_transform', 'Overview — Response Header Transform Rules', 'Permite criar, editar e excluir Response Header Transform Rules.', 24),
  ('cloudflare-waf', 'manage_rules_overview_custom_error', 'Overview — Custom Error Rules', 'Permite criar, editar e excluir Custom Error Rules.', 25),
  ('cloudflare-waf', 'manage_rules_overview_configuration', 'Overview — Configuration Rules', 'Permite criar, editar e excluir Configuration Rules.', 26),
  ('cloudflare-waf', 'manage_rules_page_rules', 'Rules — Page Rules', 'Permite visualizar, criar, editar, excluir e reordenar Page Rules.', 27)
ON CONFLICT DO NOTHING;

-- 2) apply_role_defaults: admin/analista já cobrem tudo (INSERT a partir de
--    module_permissions iterando module_slug = 'cloudflare-waf'). Não há
--    mudança necessária na função.

-- 3) Backfill: garante que admins e analistas existentes recebam as novas
--    permissões agora, igual ao padrão da migration anterior.
INSERT INTO public.user_module_permissions (user_id, module_slug, action, granted_by)
SELECT ur.user_id, mp.module_slug, mp.action, ur.user_id
FROM public.user_roles ur
CROSS JOIN public.module_permissions mp
WHERE ur.role IN ('admin','analista')
  AND mp.module_slug = 'cloudflare-waf'
  AND mp.action IN (
    'manage_rules_overview',
    'manage_rules_overview_url_rewrite',
    'manage_rules_overview_redirect',
    'manage_rules_overview_origin',
    'manage_rules_overview_cache',
    'manage_rules_overview_cache_response',
    'manage_rules_overview_request_header_transform',
    'manage_rules_overview_response_header_transform',
    'manage_rules_overview_custom_error',
    'manage_rules_overview_configuration',
    'manage_rules_page_rules'
  )
ON CONFLICT (user_id, module_slug, action) DO NOTHING;
