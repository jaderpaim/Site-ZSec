INSERT INTO public.module_permissions (module_slug, action, label, description, sort_order)
VALUES ('painel-c-level', 'view', 'Visualizar', 'Ver o Painel C-Level', 1)
ON CONFLICT DO NOTHING;

CREATE OR REPLACE FUNCTION public.has_module_permission(_user_id uuid, _module text, _action text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (auth.role() = 'service_role' OR _user_id = auth.uid())
    AND (
      public.has_role(_user_id, 'super_admin'::app_role)
      OR (public.has_role(_user_id, 'admin'::app_role) AND _module NOT IN ('usuarios', 'benchmark', 'painel-executivo', 'painel-c-level'))
      OR EXISTS (
        SELECT 1 FROM public.module_admins
        WHERE user_id = _user_id AND module_slug = _module
      )
      OR EXISTS (
        SELECT 1 FROM public.user_module_permissions
        WHERE user_id = _user_id AND module_slug = _module AND action = _action
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.is_module_admin(_user_id uuid, _module text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    (auth.role() = 'service_role' OR _user_id = auth.uid())
    AND (
      public.has_role(_user_id, 'super_admin'::app_role)
      OR (public.has_role(_user_id, 'admin'::app_role) AND _module NOT IN ('usuarios', 'benchmark', 'painel-executivo', 'painel-c-level'))
      OR EXISTS (
        SELECT 1 FROM public.module_admins
        WHERE user_id = _user_id AND module_slug = _module
      )
    );
$$;

REVOKE EXECUTE ON FUNCTION public.has_module_permission(uuid, text, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.is_module_admin(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.has_module_permission(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_module_admin(uuid, text) TO authenticated, service_role;