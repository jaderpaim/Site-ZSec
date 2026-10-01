
-- Revoke broad SELECT and re-grant only non-sensitive columns to authenticated.
REVOKE SELECT ON public.departments FROM authenticated;
GRANT SELECT (id, name, description, created_by, created_at, updated_at)
  ON public.departments TO authenticated;
-- emails column reachable only via service_role (used by admin-scoped server fn).
GRANT SELECT (emails) ON public.departments TO service_role;
