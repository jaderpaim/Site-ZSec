
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.has_module_permission(uuid, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_module_admin(uuid, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_any_module_admin(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.user_department_id(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.apply_role_defaults(uuid, app_role) FROM PUBLIC, anon, authenticated;
