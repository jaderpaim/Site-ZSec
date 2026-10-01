-- Papel "personalizado": apply_role_defaults não concede nada (fica 100% manual);
-- handle_new_user passa a aceitar 'personalizado' vindo do convite;
-- e as poucas políticas RLS de escrita que hoje só aceitam admin/analista
-- (sem checagem granular) passam a aceitar também has_module_permission,
-- para que um usuário personalizado com a permissão marcada na tela funcione.

CREATE OR REPLACE FUNCTION public.apply_role_defaults(_user_id uuid, _role app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  monitoramento_modules text[] := ARRAY['vulnerabilidades','sophos-xdr','cloudflare-waf'];
  operacao_modules      text[] := ARRAY['gmud','upload','logs'];
  admin_only_modules    text[] := ARRAY[
    'integracoes','excecao-sophos','logs','smtp','sso-ldap','usuarios','alertas','cron-jobs'
  ];
  a record;
BEGIN
  IF _role = 'admin' THEN
    INSERT INTO public.module_admins (user_id, module_slug, granted_by)
    SELECT DISTINCT _user_id, mp.module_slug, _user_id
    FROM public.module_permissions mp
    ON CONFLICT (user_id, module_slug) DO NOTHING;

    FOR a IN SELECT module_slug, action FROM public.module_permissions LOOP
      INSERT INTO public.user_module_permissions (user_id, module_slug, action, granted_by)
      VALUES (_user_id, a.module_slug, a.action, _user_id)
      ON CONFLICT (user_id, module_slug, action) DO NOTHING;
    END LOOP;

  ELSIF _role = 'visualizador' THEN
    FOR a IN
      SELECT module_slug, action
      FROM public.module_permissions
      WHERE action = 'view'
        AND module_slug != ALL(admin_only_modules)
    LOOP
      INSERT INTO public.user_module_permissions (user_id, module_slug, action, granted_by)
      VALUES (_user_id, a.module_slug, a.action, _user_id)
      ON CONFLICT (user_id, module_slug, action) DO NOTHING;
    END LOOP;

  ELSIF _role = 'analista' THEN
    FOR a IN
      SELECT module_slug, action
      FROM public.module_permissions
      WHERE module_slug = ANY(monitoramento_modules || operacao_modules)
    LOOP
      INSERT INTO public.user_module_permissions (user_id, module_slug, action, granted_by)
      VALUES (_user_id, a.module_slug, a.action, _user_id)
      ON CONFLICT (user_id, module_slug, action) DO NOTHING;
    END LOOP;

  -- 'personalizado': nenhum default é concedido — tudo é liberado manualmente
  -- pelas permissões granulares por módulo na tela de Usuários.
  END IF;
END;
$function$;

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
  IF requested_role IN ('admin','analista','visualizador','personalizado') THEN
    default_role := requested_role::app_role;
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, default_role);
  PERFORM public.apply_role_defaults(NEW.id, default_role);
  RETURN NEW;
END;
$function$;

-- departments: manage cobre insert/update/delete
DROP POLICY IF EXISTS "analyst+admin insert departments" ON public.departments;
CREATE POLICY "analyst+admin insert departments" ON public.departments
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'analista'::app_role)
    OR has_module_permission(auth.uid(), 'departamentos', 'manage')
  );

DROP POLICY IF EXISTS "analyst+admin update departments" ON public.departments;
CREATE POLICY "analyst+admin update departments" ON public.departments
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'analista'::app_role)
    OR has_module_permission(auth.uid(), 'departamentos', 'manage')
  );

DROP POLICY IF EXISTS "admin delete departments" ON public.departments;
CREATE POLICY "admin delete departments" ON public.departments
  FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_module_permission(auth.uid(), 'departamentos', 'manage')
  );

-- colaboradores: mesma ação 'manage' do módulo departamentos (tela de Departamentos)
DROP POLICY IF EXISTS "analyst+admin insert colaboradores" ON public.colaboradores;
CREATE POLICY "analyst+admin insert colaboradores" ON public.colaboradores
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'analista'::app_role)
    OR has_module_permission(auth.uid(), 'departamentos', 'manage')
  );

DROP POLICY IF EXISTS "analyst+admin update colaboradores" ON public.colaboradores;
CREATE POLICY "analyst+admin update colaboradores" ON public.colaboradores
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'analista'::app_role)
    OR has_module_permission(auth.uid(), 'departamentos', 'manage')
  );

DROP POLICY IF EXISTS "admin delete colaboradores" ON public.colaboradores;
CREATE POLICY "admin delete colaboradores" ON public.colaboradores
  FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'analista'::app_role)
    OR has_module_permission(auth.uid(), 'departamentos', 'manage')
  );

-- import_logs: ação 'create' do módulo upload
DROP POLICY IF EXISTS "analyst+admin insert import logs" ON public.import_logs;
CREATE POLICY "analyst+admin insert import logs" ON public.import_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'analista'::app_role)
    OR has_module_permission(auth.uid(), 'upload', 'create')
  );
