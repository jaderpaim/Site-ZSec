-- Torna "nps" um módulo EXCLUSIVO (src/lib/exclusive-modules.ts), mesmo
-- tratamento do "painel-executivo" (20260827120000 + 20260827120100):
--   * admin perde o bypass automático; só super_admin tem por padrão;
--   * só super_admin concede/revoga acesso (quadro "Permissões Exclusivas");
--   * quem NÃO é admin e já tinha permissão de nps concedida MANTÉM (sem
--     limpeza retroativa pra visualizador/analista/personalizado);
--   * usuário novo deixa de receber nps por default.
--
-- ATENÇÃO: o passo 4 ALTERA DADOS (DELETE das concessões de nps de quem hoje
-- tem papel "admin" -- vieram do apply_role_defaults). Revise antes de aplicar.
--
-- "painel-c-level" continua nas listas só por compatibilidade com
-- 20260904143743 (o módulo foi removido em 20261011150000; citar um slug que
-- não existe mais é inofensivo).

-- 1) Bypass de admin ────────────────────────────────────────────────────────
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
      OR (public.has_role(_user_id, 'admin'::app_role) AND _module NOT IN ('usuarios', 'benchmark', 'painel-executivo', 'painel-c-level', 'nps'))
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
      OR (public.has_role(_user_id, 'admin'::app_role) AND _module NOT IN ('usuarios', 'benchmark', 'painel-executivo', 'painel-c-level', 'nps'))
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

-- 2) Defaults por papel (base: 20260827120000) ─────────────────────────────
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
  -- Módulos exclusivos: nenhum default pra papel nenhum além de super_admin.
  exclusive_modules     text[] := ARRAY['usuarios','benchmark','painel-executivo','painel-c-level','nps'];
  a record;
BEGIN
  IF _role = 'super_admin' THEN
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
    INSERT INTO public.module_admins (user_id, module_slug, granted_by)
    SELECT DISTINCT _user_id, mp.module_slug, _user_id
    FROM public.module_permissions mp
    WHERE mp.module_slug != ALL(exclusive_modules)
    ON CONFLICT (user_id, module_slug) DO NOTHING;

    FOR a IN
      SELECT module_slug, action FROM public.module_permissions
      WHERE module_slug != ALL(exclusive_modules)
    LOOP
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
        AND module_slug != ALL(exclusive_modules)
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

-- 3) RLS das tabelas do NPS: sem has_role(admin) solto ────────────────────
-- (has_module_permission/is_module_admin já cobrem super_admin e as concessões)
DROP POLICY IF EXISTS "view nps_clientes by permission"   ON public.nps_clientes;
DROP POLICY IF EXISTS "insert nps_clientes by permission" ON public.nps_clientes;
DROP POLICY IF EXISTS "update nps_clientes by permission" ON public.nps_clientes;
DROP POLICY IF EXISTS "delete nps_clientes by permission" ON public.nps_clientes;
DROP POLICY IF EXISTS "view nps_registros by permission"   ON public.nps_registros;
DROP POLICY IF EXISTS "insert nps_registros by permission" ON public.nps_registros;
DROP POLICY IF EXISTS "update nps_registros by permission" ON public.nps_registros;
DROP POLICY IF EXISTS "delete nps_registros by permission" ON public.nps_registros;

CREATE POLICY "view nps_clientes by permission" ON public.nps_clientes FOR SELECT TO authenticated
  USING (public.is_module_admin(auth.uid(), 'nps') OR public.has_module_permission(auth.uid(), 'nps', 'view'));
CREATE POLICY "insert nps_clientes by permission" ON public.nps_clientes FOR INSERT TO authenticated
  WITH CHECK (public.is_module_admin(auth.uid(), 'nps') OR public.has_module_permission(auth.uid(), 'nps', 'create') OR public.has_module_permission(auth.uid(), 'nps', 'edit'));
CREATE POLICY "update nps_clientes by permission" ON public.nps_clientes FOR UPDATE TO authenticated
  USING (public.is_module_admin(auth.uid(), 'nps') OR public.has_module_permission(auth.uid(), 'nps', 'edit'));
CREATE POLICY "delete nps_clientes by permission" ON public.nps_clientes FOR DELETE TO authenticated
  USING (public.is_module_admin(auth.uid(), 'nps') OR public.has_module_permission(auth.uid(), 'nps', 'delete'));

CREATE POLICY "view nps_registros by permission" ON public.nps_registros FOR SELECT TO authenticated
  USING (public.is_module_admin(auth.uid(), 'nps') OR public.has_module_permission(auth.uid(), 'nps', 'view'));
CREATE POLICY "insert nps_registros by permission" ON public.nps_registros FOR INSERT TO authenticated
  WITH CHECK (public.is_module_admin(auth.uid(), 'nps') OR public.has_module_permission(auth.uid(), 'nps', 'create'));
CREATE POLICY "update nps_registros by permission" ON public.nps_registros FOR UPDATE TO authenticated
  USING (public.is_module_admin(auth.uid(), 'nps') OR public.has_module_permission(auth.uid(), 'nps', 'edit'));
CREATE POLICY "delete nps_registros by permission" ON public.nps_registros FOR DELETE TO authenticated
  USING (public.is_module_admin(auth.uid(), 'nps') OR public.has_module_permission(auth.uid(), 'nps', 'delete'));

-- 4) Limpeza retroativa SÓ de quem tem papel admin (mesma lógica de 20260827120100)
DELETE FROM public.module_admins ma
USING public.user_roles ur
WHERE ma.user_id = ur.user_id
  AND ur.role = 'admin'
  AND ma.module_slug = 'nps';

DELETE FROM public.user_module_permissions ump
USING public.user_roles ur
WHERE ump.user_id = ur.user_id
  AND ur.role = 'admin'
  AND ump.module_slug = 'nps';
