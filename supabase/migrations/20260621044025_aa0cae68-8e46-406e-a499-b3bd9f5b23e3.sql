
-- Restrict sensitive columns from the authenticated role.
-- Department emails and SMTP password should only be reachable via service_role
-- (server functions use supabaseAdmin and gate by role/admin checks).

REVOKE SELECT (emails) ON public.departments FROM authenticated;
REVOKE SELECT (password) ON public.smtp_config FROM authenticated;
