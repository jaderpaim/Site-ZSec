-- O módulo Benchmark passou a exigir concessão explícita (module_admins ou
-- user_module_permissions) mesmo para admin global — o front-end não usa mais
-- o bypass automático de admin pra este módulo específico (ver Benchmark.tsx /
-- AppSidebar.tsx / use-permissions.ts:hasExplicitPermission).
--
-- Sem esta seed, nenhum admin existente enxerga o módulo no menu, já que ele
-- foi criado em 2026-08-24 (migration 20260824182552), depois da concessão em
-- massa de module_admins feita em 2026-08-12 pra todos os outros módulos.
-- Mesmo padrão usado em 20260702160000_privacy_tools_module_permissions.sql.

INSERT INTO public.module_admins (user_id, module_slug, granted_by)
SELECT ur.user_id, 'benchmark', ur.user_id
FROM public.user_roles ur
WHERE ur.role = 'admin'
ON CONFLICT (user_id, module_slug) DO NOTHING;

INSERT INTO public.user_module_permissions (user_id, module_slug, action, granted_by)
SELECT ur.user_id, 'benchmark', mp.action, ur.user_id
FROM public.user_roles ur
CROSS JOIN public.module_permissions mp
WHERE ur.role = 'admin' AND mp.module_slug = 'benchmark'
ON CONFLICT (user_id, module_slug, action) DO NOTHING;
