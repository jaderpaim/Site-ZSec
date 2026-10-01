-- Fecha uma lacuna de defesa em profundidade deixada pela troca em
-- 20260825140000: apply_role_defaults ainda concedia ao papel "admin" uma
-- linha REAL em module_admins ('usuarios') e em user_module_permissions
-- ('usuarios:view', 'usuarios:manage') — herança de antes de existir essa
-- distinção. Isso não afeta a aplicação (assertCanManageUsers, em
-- users.functions.ts, nunca consulta module_admins para admin/super_admin —
-- decide só pelo papel), mas qualquer policy de RLS que use
-- is_module_admin/has_module_permission(..., 'usuarios', ...) enxergaria essa
-- linha via EXISTS(module_admins ...) e liberaria acesso direto por client,
-- contornando a restrição do módulo "usuarios" adicionada em 20260825140000.
--
-- 'admin' deixa de receber módulo_admins/permissões de "usuarios";
-- 'super_admin' passa a receber tudo, incluindo "usuarios" (era o que
-- 'admin' tinha antes da troca). Ver a migration seguinte para a limpeza
-- retroativa de quem já tem essas linhas hoje.

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
  IF _role = 'super_admin' THEN
    -- Hierarquia mais alta: recebe também "usuarios" (gerencia outros usuários).
    INSERT INTO public.module_admins (user_id, module_slug, granted_by)
    SELECT DISTINCT _user_id, mp.module_slug, _user_id
    FROM public.module_permissions mp
    ON CONFLICT (user_id, module_slug) DO NOTHING;

    FOR a IN SELECT module_slug, action FROM public.module_permissions LOOP
      INSERT INTO public.user_module_permissions (user_id, module_slug, action, granted_by)
      VALUES (_user_id, a.module_slug, a.action, _user_id)
      ON CONFLICT (user_id, module_slug, action) DO NOTHING;
    END LOOP;

  ELSIF _role = 'admin' THEN
    -- Mesmo acesso operacional de super_admin, EXCETO "usuarios" (gerenciar
    -- outros usuários é exclusivo de super_admin).
    INSERT INTO public.module_admins (user_id, module_slug, granted_by)
    SELECT DISTINCT _user_id, mp.module_slug, _user_id
    FROM public.module_permissions mp
    WHERE mp.module_slug <> 'usuarios'
    ON CONFLICT (user_id, module_slug) DO NOTHING;

    FOR a IN SELECT module_slug, action FROM public.module_permissions WHERE module_slug <> 'usuarios' LOOP
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
