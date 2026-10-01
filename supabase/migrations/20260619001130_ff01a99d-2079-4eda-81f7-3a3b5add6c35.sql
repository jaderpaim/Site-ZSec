REVOKE SELECT (emails) ON public.departments FROM authenticated;
REVOKE SELECT (emails) ON public.departments FROM anon;
-- service_role keeps full access (used by server-side code that legitimately needs emails)
GRANT SELECT (emails) ON public.departments TO service_role;