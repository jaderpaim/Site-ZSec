-- Torna "painel-executivo" um módulo exclusivo (ver src/lib/exclusive-modules.ts),
-- mesmo tratamento de "usuarios"/"benchmark" em is_module_admin/has_module_permission/
-- apply_role_defaults — MAS com uma diferença deliberada em relação a "benchmark":
-- quem já tinha 'painel-executivo:view' concedido (visualizador, analista,
-- personalizado — hoje o papel padrão já dá isso) MANTÉM o acesso. Só o bypass
-- automático de admin fecha, e só usuários NOVOS desses papéis deixam de
-- receber o default — sem migration de limpeza retroativa pra eles (só pra
-- admin, ver a migration seguinte). Decisão consciente: painel-executivo já é
-- usado no dia a dia por muita gente, diferente de benchmark (módulo novo).

CREATE OR REPLACE FUNCTION public.is_module_admin(_user_id uuid, _module text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    (auth.role() = 'service_role' OR _user_id = auth.uid())
    AND (
      public.has_role(_user_id, 'super_admin'::app_role)
      OR (public.has_role(_user_id, 'admin'::app_role) AND _module NOT IN ('usuarios', 'benchmark', 'painel-executivo'))
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
      OR (public.has_role(_user_id, 'admin'::app_role) AND _module NOT IN ('usuarios', 'benchmark', 'painel-executivo'))
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
    -- Mesmo acesso operacional de super_admin, EXCETO "usuarios", "benchmark" e
    -- "painel-executivo" (módulos exclusivos).
    INSERT INTO public.module_admins (user_id, module_slug, granted_by)
    SELECT DISTINCT _user_id, mp.module_slug, _user_id
    FROM public.module_permissions mp
    WHERE mp.module_slug NOT IN ('usuarios', 'benchmark', 'painel-executivo')
    ON CONFLICT (user_id, module_slug) DO NOTHING;

    FOR a IN
      SELECT module_slug, action FROM public.module_permissions
      WHERE module_slug NOT IN ('usuarios', 'benchmark', 'painel-executivo')
    LOOP
      INSERT INTO public.user_module_permissions (user_id, module_slug, action, granted_by)
      VALUES (_user_id, a.module_slug, a.action, _user_id)
      ON CONFLICT (user_id, module_slug, action) DO NOTHING;
    END LOOP;

  ELSIF _role = 'visualizador' THEN
    -- "painel-executivo" some do default aqui: quem já tem, mantém (linhas
    -- antigas não são tocadas); só usuário novo deixa de receber por padrão.
    FOR a IN
      SELECT module_slug, action
      FROM public.module_permissions
      WHERE action = 'view'
        AND module_slug != ALL(admin_only_modules)
        AND module_slug NOT IN ('benchmark', 'painel-executivo')
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

-- get_exec_ia_overview/get_exec_vulnerabilities_overview tinham um
-- has_role(admin) cru em paralelo ao has_module_permission — mesmo bug que o
-- benchmark tinha nas próprias tabelas. Removido; has_role(analista) e
-- has_module_permission continuam intactos (analista mantém o bypass que já
-- tinha aqui, não relacionado a este pedido).
CREATE OR REPLACE FUNCTION public.get_exec_ia_overview(p_since timestamptz)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'analista'::app_role)
    OR public.has_module_permission(auth.uid(), 'painel-executivo', 'view')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  WITH ev AS (
    SELECT user_name, domain FROM public.ia_web_events WHERE event_at >= p_since
  )
  SELECT jsonb_build_object(
    'activeUsers', (SELECT COUNT(DISTINCT lower(trim(user_name))) FROM ev WHERE user_name IS NOT NULL),
    'totalEvents', (SELECT COUNT(*) FROM ev),
    'topTools', COALESCE((
      SELECT jsonb_agg(row ORDER BY (row->>'count')::int DESC)
      FROM (
        SELECT jsonb_build_object('tool', domain, 'count', COUNT(*)) AS row
        FROM ev WHERE domain IS NOT NULL
        GROUP BY domain
        ORDER BY COUNT(*) DESC
        LIMIT 8
      ) t
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_exec_vulnerabilities_overview(
  p_since30 timestamptz,
  p_since60 timestamptz
) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT (
    public.has_role(auth.uid(), 'analista'::app_role)
    OR public.has_module_permission(auth.uid(), 'painel-executivo', 'view')
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  WITH v AS (
    SELECT
      lower(severity::text) AS sev,
      COALESCE(lower(status::text), '') AS st,
      COALESCE(status_changed_at, closed_at) AS close_at
    FROM public.vulnerabilities_aplicacao
  ),
  open_rows AS (
    SELECT * FROM v WHERE st NOT IN ('mitigada','fechada','resolvida','closed','resolved')
  ),
  closed_rows AS (
    SELECT * FROM v
    WHERE st IN ('mitigada','fechada','resolvida','closed','resolved')
      AND close_at IS NOT NULL
  ),
  fixed_30 AS (
    SELECT * FROM closed_rows WHERE close_at >= p_since30
  ),
  fixed_prev AS (
    SELECT * FROM closed_rows WHERE close_at >= p_since60 AND close_at < p_since30
  )
  SELECT jsonb_build_object(
    'current', jsonb_build_object(
      'criticas', (SELECT COUNT(*) FROM open_rows WHERE sev IN ('crítica','critica','critical')),
      'altas',    (SELECT COUNT(*) FROM open_rows WHERE sev IN ('alta','high')),
      'medias',   (SELECT COUNT(*) FROM open_rows WHERE sev IN ('média','media','medium')),
      'baixas',   (SELECT COUNT(*) FROM open_rows WHERE sev IN ('baixa','low')),
      'abertas',  (SELECT COUNT(*) FROM open_rows)
    ),
    'fixed30d', jsonb_build_object(
      'total',    (SELECT COUNT(*) FROM fixed_30),
      'criticas', (SELECT COUNT(*) FROM fixed_30 WHERE sev IN ('crítica','critica','critical')),
      'altas',    (SELECT COUNT(*) FROM fixed_30 WHERE sev IN ('alta','high'))
    ),
    'fixedPrev30d', jsonb_build_object('total', (SELECT COUNT(*) FROM fixed_prev)),
    'fixedSeries', COALESCE((
      SELECT jsonb_agg(row ORDER BY (row->>'date'))
      FROM (
        SELECT jsonb_build_object('date', to_char(close_at, 'YYYY-MM-DD'), 'count', COUNT(*)) AS row
        FROM fixed_30
        GROUP BY to_char(close_at, 'YYYY-MM-DD')
      ) s
    ), '[]'::jsonb)
  ) INTO result;

  RETURN result;
END;
$$;
