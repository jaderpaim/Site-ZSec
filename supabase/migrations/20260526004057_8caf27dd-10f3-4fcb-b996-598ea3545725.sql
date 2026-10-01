ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_profiles_department_id ON public.profiles(department_id);
CREATE INDEX IF NOT EXISTS idx_vulnerabilities_department_id ON public.vulnerabilities(department_id);

CREATE OR REPLACE FUNCTION public.user_department_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT department_id
  FROM public.profiles
  WHERE id = _user_id
$$;

INSERT INTO public.module_permissions (module_slug, action, label, description, sort_order)
SELECT 'sophos-xdr', action, label, description, sort_order
FROM public.module_permissions mp
WHERE mp.module_slug = 'sophos'
  AND NOT EXISTS (
    SELECT 1
    FROM public.module_permissions existing
    WHERE existing.module_slug = 'sophos-xdr'
      AND existing.action = mp.action
  );

INSERT INTO public.module_permissions (module_slug, action, label, description, sort_order)
SELECT 'cloudflare-waf', action, label, description, sort_order
FROM public.module_permissions mp
WHERE mp.module_slug = 'cloudflare'
  AND NOT EXISTS (
    SELECT 1
    FROM public.module_permissions existing
    WHERE existing.module_slug = 'cloudflare-waf'
      AND existing.action = mp.action
  );

DELETE FROM public.module_permissions WHERE module_slug IN ('sophos', 'cloudflare');

INSERT INTO public.module_permissions (module_slug, action, label, description, sort_order)
SELECT modules.module_slug, 'view', 'Visualizar', 'Permite acessar e visualizar este módulo.', 0
FROM (
  VALUES
    ('vulnerabilidades'),
    ('politicas'),
    ('gmud'),
    ('atualizacoes'),
    ('maturidade'),
    ('ranking-ia'),
    ('organizacao'),
    ('sophos-xdr'),
    ('privacy-tools'),
    ('cloudflare-waf'),
    ('soc'),
    ('phishing'),
    ('wsus'),
    ('comites'),
    ('nao-conformidade'),
    ('disponibilidade'),
    ('departamentos'),
    ('integracoes'),
    ('upload'),
    ('logs'),
    ('smtp'),
    ('usuarios')
) AS modules(module_slug)
WHERE NOT EXISTS (
  SELECT 1
  FROM public.module_permissions mp
  WHERE mp.module_slug = modules.module_slug
    AND mp.action = 'view'
);

INSERT INTO public.user_module_permissions (user_id, module_slug, action, granted_by, granted_at)
SELECT ump.user_id, 'sophos-xdr', ump.action, ump.granted_by, ump.granted_at
FROM public.user_module_permissions ump
WHERE ump.module_slug = 'sophos'
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_module_permissions existing
    WHERE existing.user_id = ump.user_id
      AND existing.module_slug = 'sophos-xdr'
      AND existing.action = ump.action
  );

INSERT INTO public.user_module_permissions (user_id, module_slug, action, granted_by, granted_at)
SELECT ump.user_id, 'cloudflare-waf', ump.action, ump.granted_by, ump.granted_at
FROM public.user_module_permissions ump
WHERE ump.module_slug = 'cloudflare'
  AND NOT EXISTS (
    SELECT 1
    FROM public.user_module_permissions existing
    WHERE existing.user_id = ump.user_id
      AND existing.module_slug = 'cloudflare-waf'
      AND existing.action = ump.action
  );

DELETE FROM public.user_module_permissions WHERE module_slug IN ('sophos', 'cloudflare');

INSERT INTO public.module_admins (user_id, module_slug, granted_by, granted_at)
SELECT ma.user_id, 'sophos-xdr', ma.granted_by, ma.granted_at
FROM public.module_admins ma
WHERE ma.module_slug = 'sophos'
  AND NOT EXISTS (
    SELECT 1
    FROM public.module_admins existing
    WHERE existing.user_id = ma.user_id
      AND existing.module_slug = 'sophos-xdr'
  );

INSERT INTO public.module_admins (user_id, module_slug, granted_by, granted_at)
SELECT ma.user_id, 'cloudflare-waf', ma.granted_by, ma.granted_at
FROM public.module_admins ma
WHERE ma.module_slug = 'cloudflare'
  AND NOT EXISTS (
    SELECT 1
    FROM public.module_admins existing
    WHERE existing.user_id = ma.user_id
      AND existing.module_slug = 'cloudflare-waf'
  );

DELETE FROM public.module_admins WHERE module_slug IN ('sophos', 'cloudflare');

CREATE OR REPLACE FUNCTION public.apply_role_defaults(_user_id uuid, _role app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  monitoramento_modules text[] := ARRAY['vulnerabilidades','sophos-xdr','cloudflare-waf'];
  operacao_modules text[] := ARRAY['gmud','upload','logs'];
  m text;
  a record;
BEGIN
  IF _role = 'visualizador' THEN
    FOREACH m IN ARRAY monitoramento_modules LOOP
      INSERT INTO public.user_module_permissions (user_id, module_slug, action, granted_by)
      VALUES (_user_id, m, 'view', _user_id)
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

DELETE FROM public.user_module_permissions ump
USING public.user_roles ur
WHERE ur.user_id = ump.user_id
  AND ur.role = 'visualizador'
  AND ump.granted_by = ump.user_id
  AND NOT (
    (ump.module_slug = 'vulnerabilidades' AND ump.action = 'view') OR
    (ump.module_slug = 'sophos-xdr' AND ump.action = 'view') OR
    (ump.module_slug = 'cloudflare-waf' AND ump.action = 'view')
  );

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT user_id, role
    FROM public.user_roles
    WHERE role IN ('visualizador', 'analista')
  LOOP
    PERFORM public.apply_role_defaults(r.user_id, r.role);
  END LOOP;
END $$;

DROP POLICY IF EXISTS "analyst+admin delete vulns" ON public.vulnerabilities;
DROP POLICY IF EXISTS "analyst+admin insert vulns" ON public.vulnerabilities;
DROP POLICY IF EXISTS "analyst+admin update vulns" ON public.vulnerabilities;
DROP POLICY IF EXISTS "auth users view vulns" ON public.vulnerabilities;

CREATE POLICY "users view vulnerabilities by department or permission"
ON public.vulnerabilities
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_module_admin(auth.uid(), 'vulnerabilidades')
  OR (
    public.has_module_permission(auth.uid(), 'vulnerabilidades', 'view')
    AND public.user_department_id(auth.uid()) IS NOT NULL
    AND department_id = public.user_department_id(auth.uid())
  )
);

CREATE POLICY "users create vulnerabilities by department or permission"
ON public.vulnerabilities
FOR INSERT
TO authenticated
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_module_admin(auth.uid(), 'vulnerabilidades')
  OR (
    public.has_module_permission(auth.uid(), 'vulnerabilidades', 'create')
    AND public.user_department_id(auth.uid()) IS NOT NULL
    AND department_id = public.user_department_id(auth.uid())
  )
);

CREATE POLICY "users update vulnerabilities by department or permission"
ON public.vulnerabilities
FOR UPDATE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_module_admin(auth.uid(), 'vulnerabilidades')
  OR (
    public.has_module_permission(auth.uid(), 'vulnerabilidades', 'edit')
    AND public.user_department_id(auth.uid()) IS NOT NULL
    AND department_id = public.user_department_id(auth.uid())
  )
)
WITH CHECK (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_module_admin(auth.uid(), 'vulnerabilidades')
  OR (
    public.has_module_permission(auth.uid(), 'vulnerabilidades', 'edit')
    AND public.user_department_id(auth.uid()) IS NOT NULL
    AND department_id = public.user_department_id(auth.uid())
  )
);

CREATE POLICY "users delete vulnerabilities by department or permission"
ON public.vulnerabilities
FOR DELETE
TO authenticated
USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_module_admin(auth.uid(), 'vulnerabilidades')
  OR (
    public.has_module_permission(auth.uid(), 'vulnerabilidades', 'delete')
    AND public.user_department_id(auth.uid()) IS NOT NULL
    AND department_id = public.user_department_id(auth.uid())
  )
);