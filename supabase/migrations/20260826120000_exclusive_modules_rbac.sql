-- Generaliza a exclusão que hoje só existia pro módulo "usuarios" (admin sem
-- bypass automático, só super_admin) para incluir também "benchmark" — dados
-- restritos, onde nem admin deve enxergar sem concessão explícita. Precisa
-- ficar em sincronia manual com EXCLUSIVE_MODULE_SLUGS em
-- src/lib/exclusive-modules.ts (não há fonte única compartilhada entre TS e SQL).
--
-- is_module_admin/has_module_permission: super_admin sempre passa; admin só
-- passa fora da lista de módulos exclusivos; module_admins/user_module_permissions
-- continuam funcionando como concessão explícita pra qualquer papel (inclusive
-- admin, se um super_admin conceder benchmark pra ele manualmente).

CREATE OR REPLACE FUNCTION public.is_module_admin(_user_id uuid, _module text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    (auth.role() = 'service_role' OR _user_id = auth.uid())
    AND (
      public.has_role(_user_id, 'super_admin'::app_role)
      OR (public.has_role(_user_id, 'admin'::app_role) AND _module NOT IN ('usuarios', 'benchmark'))
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
      public.has_role(_user_id, 'super_admin'::app_role)
      OR (public.has_role(_user_id, 'admin'::app_role) AND _module NOT IN ('usuarios', 'benchmark'))
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

-- apply_role_defaults: admin deixa de receber módulo_admin/permissões default
-- de "benchmark" (mesma exclusão que já existia pra "usuarios"); super_admin
-- continua recebendo tudo, sem exclusão.
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
    -- Mesmo acesso operacional de super_admin, EXCETO "usuarios" e "benchmark"
    -- (módulos exclusivos — ver src/lib/exclusive-modules.ts).
    INSERT INTO public.module_admins (user_id, module_slug, granted_by)
    SELECT DISTINCT _user_id, mp.module_slug, _user_id
    FROM public.module_permissions mp
    WHERE mp.module_slug NOT IN ('usuarios', 'benchmark')
    ON CONFLICT (user_id, module_slug) DO NOTHING;

    FOR a IN
      SELECT module_slug, action FROM public.module_permissions
      WHERE module_slug NOT IN ('usuarios', 'benchmark')
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
        AND module_slug <> 'benchmark'
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

-- Tabelas do Benchmark tinham "has_role(admin) OR ..." direto nas policies —
-- liberava admin sem passar por is_module_admin/has_module_permission (que
-- agora corretamente excluem admin de benchmark). Remove o bypass cru; a
-- checagem granular já cobre super_admin (bypass automático) e qualquer
-- concessão explícita.
DROP POLICY IF EXISTS "benchmark maturidade read" ON public.benchmark_maturidade_ref;
CREATE POLICY "benchmark maturidade read" ON public.benchmark_maturidade_ref
  FOR SELECT TO authenticated
  USING (
    public.is_module_admin(auth.uid(),'benchmark')
    OR public.has_module_permission(auth.uid(),'benchmark','view')
  );
DROP POLICY IF EXISTS "benchmark maturidade write" ON public.benchmark_maturidade_ref;
CREATE POLICY "benchmark maturidade write" ON public.benchmark_maturidade_ref
  FOR ALL TO authenticated
  USING (
    public.is_module_admin(auth.uid(),'benchmark')
    OR public.has_module_permission(auth.uid(),'benchmark','manage')
  )
  WITH CHECK (
    public.is_module_admin(auth.uid(),'benchmark')
    OR public.has_module_permission(auth.uid(),'benchmark','manage')
  );

DROP POLICY IF EXISTS "benchmark investimento read" ON public.benchmark_investimento_ref;
CREATE POLICY "benchmark investimento read" ON public.benchmark_investimento_ref
  FOR SELECT TO authenticated
  USING (
    public.is_module_admin(auth.uid(),'benchmark')
    OR public.has_module_permission(auth.uid(),'benchmark','view')
  );
DROP POLICY IF EXISTS "benchmark investimento write" ON public.benchmark_investimento_ref;
CREATE POLICY "benchmark investimento write" ON public.benchmark_investimento_ref
  FOR ALL TO authenticated
  USING (
    public.is_module_admin(auth.uid(),'benchmark')
    OR public.has_module_permission(auth.uid(),'benchmark','manage')
  )
  WITH CHECK (
    public.is_module_admin(auth.uid(),'benchmark')
    OR public.has_module_permission(auth.uid(),'benchmark','manage')
  );

DROP POLICY IF EXISTS "benchmark empresa read" ON public.benchmark_empresa;
CREATE POLICY "benchmark empresa read" ON public.benchmark_empresa
  FOR SELECT TO authenticated
  USING (
    public.is_module_admin(auth.uid(),'benchmark')
    OR public.has_module_permission(auth.uid(),'benchmark','view')
  );
DROP POLICY IF EXISTS "benchmark empresa write" ON public.benchmark_empresa;
CREATE POLICY "benchmark empresa write" ON public.benchmark_empresa
  FOR ALL TO authenticated
  USING (
    public.is_module_admin(auth.uid(),'benchmark')
    OR public.has_module_permission(auth.uid(),'benchmark','manage')
  )
  WITH CHECK (
    public.is_module_admin(auth.uid(),'benchmark')
    OR public.has_module_permission(auth.uid(),'benchmark','manage')
  );
