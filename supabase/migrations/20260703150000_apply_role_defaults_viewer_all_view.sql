-- Atualiza apply_role_defaults:
-- • Visualizador → view em TODOS os módulos do catálogo, exceto os do grupo Configurações (admin-only)
-- • Admin e Analista: sem mudança
CREATE OR REPLACE FUNCTION public.apply_role_defaults(_user_id uuid, _role app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  monitoramento_modules text[] := ARRAY['vulnerabilidades','sophos-xdr','cloudflare-waf'];
  operacao_modules      text[] := ARRAY['gmud','upload','logs'];
  -- Grupo Configurações: acesso exclusivo de admin global
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
    -- view em todos os módulos que possuem essa ação, exceto os admin-only
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
  END IF;
END;
$function$;

-- Backfill: visualizadores existentes recebem as novas permissões view
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT user_id FROM public.user_roles WHERE role = 'visualizador' LOOP
    PERFORM public.apply_role_defaults(r.user_id, 'visualizador');
  END LOOP;
END $$;
