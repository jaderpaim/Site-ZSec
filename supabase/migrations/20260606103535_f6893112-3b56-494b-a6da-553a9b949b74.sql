
CREATE TABLE public.pilulas_si (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  descricao text,
  quantidade integer NOT NULL DEFAULT 0,
  data date NOT NULL,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.pilulas_si TO authenticated;
GRANT ALL ON public.pilulas_si TO service_role;

ALTER TABLE public.pilulas_si ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view pilulas by permission" ON public.pilulas_si
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'pilulas-si')
    OR has_module_permission(auth.uid(), 'pilulas-si', 'view')
  );

CREATE POLICY "insert pilulas by permission" ON public.pilulas_si
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'pilulas-si')
    OR has_module_permission(auth.uid(), 'pilulas-si', 'create')
    OR has_module_permission(auth.uid(), 'pilulas-si', 'edit')
  );

CREATE POLICY "update pilulas by permission" ON public.pilulas_si
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'pilulas-si')
    OR has_module_permission(auth.uid(), 'pilulas-si', 'edit')
  );

CREATE POLICY "delete pilulas by permission" ON public.pilulas_si
  FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'pilulas-si')
    OR has_module_permission(auth.uid(), 'pilulas-si', 'delete')
  );

CREATE TRIGGER pilulas_si_set_updated_at
  BEFORE UPDATE ON public.pilulas_si
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed permissions catalog
INSERT INTO public.module_permissions (module_slug, action, label, sort_order, description) VALUES
  ('pilulas-si', 'view',   'Visualizar', 1, 'Visualizar pílulas de SI'),
  ('pilulas-si', 'create', 'Criar',      2, 'Criar pílulas de SI'),
  ('pilulas-si', 'edit',   'Editar',     3, 'Editar pílulas de SI'),
  ('pilulas-si', 'delete', 'Excluir',    4, 'Excluir pílulas de SI');

-- Grant existing global admins full access to the new module
INSERT INTO public.module_admins (user_id, module_slug, granted_by)
SELECT ur.user_id, 'pilulas-si', ur.user_id
FROM public.user_roles ur
WHERE ur.role = 'admin'
ON CONFLICT (user_id, module_slug) DO NOTHING;

INSERT INTO public.user_module_permissions (user_id, module_slug, action, granted_by)
SELECT ur.user_id, 'pilulas-si', mp.action, ur.user_id
FROM public.user_roles ur
CROSS JOIN public.module_permissions mp
WHERE ur.role = 'admin' AND mp.module_slug = 'pilulas-si'
ON CONFLICT (user_id, module_slug, action) DO NOTHING;
