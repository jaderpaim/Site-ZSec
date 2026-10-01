-- Seed module permissions for the privacy-tools module.
-- Without these entries, has_module_permission() always returns false and
-- RLS blocks all SELECT queries on privacy_consentamentos_daily etc.

-- ── Catalog entries ───────────────────────────────────────────────────────────
INSERT INTO public.module_permissions (module_slug, action, label, sort_order, description) VALUES
  ('privacy-tools', 'view',   'Visualizar', 1, 'Visualizar dashboards de Privacy Tools (LGPD)'),
  ('privacy-tools', 'manage', 'Gerenciar',  2, 'Disparar sincronização e gerenciar dados do Privacy Tools')
ON CONFLICT (module_slug, action) DO NOTHING;

-- ── Grant existing global admins full access ──────────────────────────────────
INSERT INTO public.module_admins (user_id, module_slug, granted_by)
SELECT ur.user_id, 'privacy-tools', ur.user_id
FROM public.user_roles ur
WHERE ur.role = 'admin'
ON CONFLICT (user_id, module_slug) DO NOTHING;

INSERT INTO public.user_module_permissions (user_id, module_slug, action, granted_by)
SELECT ur.user_id, 'privacy-tools', mp.action, ur.user_id
FROM public.user_roles ur
CROSS JOIN public.module_permissions mp
WHERE ur.role = 'admin' AND mp.module_slug = 'privacy-tools'
ON CONFLICT (user_id, module_slug, action) DO NOTHING;
