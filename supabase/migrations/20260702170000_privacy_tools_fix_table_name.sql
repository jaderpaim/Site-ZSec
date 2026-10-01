-- Fix table name typo introduced by 20260702150000_privacy_tools_grants_reload.sql.
--
-- The original migration (20260702130000) created privacy_consentimentos_daily (with 'i').
-- The reload migration used 'a' in CREATE TABLE IF NOT EXISTS, creating a second wrong table
-- (privacy_consentamentos_daily). The server code was inserting into the 'a' table while the
-- read functions queried the 'i' table, resulting in an always-empty dashboard.
--
-- This migration:
--  1. Drops the wrongly-named 'a' table (safe: data there is stale/duplicate)
--  2. Re-asserts grants and NOTIFY on the correct 'i' table
--  3. Seeds module_permissions for privacy-tools (supersedes 20260702160000 if already applied)

-- 1. Drop wrong table (created by typo in reload migration)
DROP TABLE IF EXISTS public.privacy_consentamentos_daily;

-- 2. Ensure grants are set on the correct table
GRANT SELECT ON public.privacy_consentimentos_daily TO authenticated;
GRANT ALL    ON public.privacy_consentimentos_daily TO service_role;

GRANT SELECT ON public.privacy_cookies_daily TO authenticated;
GRANT ALL    ON public.privacy_cookies_daily TO service_role;

GRANT SELECT ON public.privacy_uso_mensal TO authenticated;
GRANT ALL    ON public.privacy_uso_mensal TO service_role;

-- 3. Seed module permissions catalog for privacy-tools
INSERT INTO public.module_permissions (module_slug, action, label, sort_order, description) VALUES
  ('privacy-tools', 'view',   'Visualizar', 1, 'Visualizar dashboards de Privacy Tools (LGPD)'),
  ('privacy-tools', 'manage', 'Gerenciar',  2, 'Disparar sincronização e gerenciar dados do Privacy Tools')
ON CONFLICT (module_slug, action) DO NOTHING;

-- 4. Grant existing global admins full access to the module
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

-- 5. Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';
