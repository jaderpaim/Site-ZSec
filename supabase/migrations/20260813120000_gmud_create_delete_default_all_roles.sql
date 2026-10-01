-- GMUD: criar e excluir passam a ser liberados por padrão para todo mundo,
-- incluindo visualizador e personalizado (única exceção ao "personalizado
-- não recebe nada por padrão" definido em 20260812120100). Continua
-- revogável manualmente pelo checkbox granular na tela de Usuários.

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

    -- gmud: além do view, todo mundo pode criar e excluir GMUDs por padrão.
    INSERT INTO public.user_module_permissions (user_id, module_slug, action, granted_by)
    VALUES (_user_id, 'gmud', 'create', _user_id), (_user_id, 'gmud', 'delete', _user_id)
    ON CONFLICT (user_id, module_slug, action) DO NOTHING;

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

  ELSIF _role = 'personalizado' THEN
    -- Única exceção ao "personalizado não recebe nada por padrão": criar e
    -- excluir GMUD são liberados por padrão a todo mundo, mesmo sem
    -- nenhuma permissão granular marcada manualmente.
    INSERT INTO public.user_module_permissions (user_id, module_slug, action, granted_by)
    VALUES (_user_id, 'gmud', 'create', _user_id), (_user_id, 'gmud', 'delete', _user_id)
    ON CONFLICT (user_id, module_slug, action) DO NOTHING;
  END IF;
END;
$function$;

-- Backfill: usuários visualizador/personalizado já existentes também
-- passam a ter gmud:create e gmud:delete, sem tocar em nenhuma outra
-- permissão que já tenham.
INSERT INTO public.user_module_permissions (user_id, module_slug, action, granted_by)
SELECT ur.user_id, 'gmud', a.action, ur.user_id
FROM public.user_roles ur
CROSS JOIN (VALUES ('create'), ('delete')) AS a(action)
WHERE ur.role IN ('visualizador', 'personalizado')
ON CONFLICT (user_id, module_slug, action) DO NOTHING;
