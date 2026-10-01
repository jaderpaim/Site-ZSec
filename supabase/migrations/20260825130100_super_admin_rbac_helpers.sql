-- super_admin: mesmo bypass de admin em is_module_admin/has_module_permission/
-- is_any_module_admin, exceto para o módulo "usuarios" — onde super_admin não
-- recebe o bypass e cai na checagem normal de module_admins/user_module_permissions
-- (nenhuma linha é concedida a ele lá, então fica sem acesso, igual personalizado).
--
-- has_role() NÃO é alterada — mantém contrato de igualdade exata de papel.
-- Isso é proposital: qualquer policy/RPC que ainda cheque só
-- has_role(auth.uid(), 'admin') continua exigindo admin de verdade (fail-closed
-- para super_admin), em vez de expandir silenciosamente o significado de
-- "admin" em todo o banco.
--
-- handle_new_user passa a aceitar 'super_admin' vindo do convite (inviteUser).

CREATE OR REPLACE FUNCTION public.is_module_admin(_user_id uuid, _module text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    (auth.role() = 'service_role' OR _user_id = auth.uid())
    AND (
      public.has_role(_user_id, 'admin'::app_role)
      OR (public.has_role(_user_id, 'super_admin'::app_role) AND _module <> 'usuarios')
      OR EXISTS (
        SELECT 1 FROM public.module_admins
        WHERE user_id = _user_id AND module_slug = _module
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.has_module_permission(_user_id uuid, _module text, _action text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    (auth.role() = 'service_role' OR _user_id = auth.uid())
    AND (
      public.has_role(_user_id, 'admin'::app_role)
      OR (public.has_role(_user_id, 'super_admin'::app_role) AND _module <> 'usuarios')
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

CREATE OR REPLACE FUNCTION public.is_any_module_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    (auth.role() = 'service_role' OR _user_id = auth.uid())
    AND (
      public.has_role(_user_id, 'admin'::app_role)
      OR public.has_role(_user_id, 'super_admin'::app_role)
      OR EXISTS (SELECT 1 FROM public.module_admins WHERE user_id = _user_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  default_role app_role := 'visualizador';
  requested_role text;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  requested_role := NEW.raw_user_meta_data->>'role';
  IF requested_role IN ('admin','analista','visualizador','personalizado','super_admin') THEN
    default_role := requested_role::app_role;
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, default_role);
  PERFORM public.apply_role_defaults(NEW.id, default_role);
  RETURN NEW;
END;
$function$;
