-- Seed module permissions for the "dlp" module.
-- Without these entries, has_module_permission() always returns false and
-- RLS blocks all SELECT queries on dlp_events / dlp_sync_state for non-admins.

INSERT INTO public.module_permissions (module_slug, action, label, sort_order, description) VALUES
  ('dlp', 'view', 'Visualizar', 1, 'Visualizar eventos e alertas de DLP (Microsoft Purview)')
ON CONFLICT (module_slug, action) DO NOTHING;

INSERT INTO public.module_admins (user_id, module_slug, granted_by)
SELECT ur.user_id, 'dlp', ur.user_id
FROM public.user_roles ur
WHERE ur.role = 'admin'
ON CONFLICT (user_id, module_slug) DO NOTHING;

INSERT INTO public.user_module_permissions (user_id, module_slug, action, granted_by)
SELECT ur.user_id, 'dlp', mp.action, ur.user_id
FROM public.user_roles ur
CROSS JOIN public.module_permissions mp
WHERE ur.role = 'admin' AND mp.module_slug = 'dlp'
ON CONFLICT (user_id, module_slug, action) DO NOTHING;
