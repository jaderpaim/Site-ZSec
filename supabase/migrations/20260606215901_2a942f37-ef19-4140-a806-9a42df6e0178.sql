
CREATE TABLE public.comites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  tipo text NOT NULL,
  periodicidade text NOT NULL,
  participantes text,
  data date NOT NULL,
  status text NOT NULL DEFAULT 'Agendado',
  observacao text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.comites TO authenticated;
GRANT ALL ON public.comites TO service_role;

ALTER TABLE public.comites ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view comites by permission" ON public.comites
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'comites')
    OR has_module_permission(auth.uid(), 'comites', 'view')
  );

CREATE POLICY "insert comites by permission" ON public.comites
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'comites')
    OR has_module_permission(auth.uid(), 'comites', 'create')
    OR has_module_permission(auth.uid(), 'comites', 'edit')
  );

CREATE POLICY "update comites by permission" ON public.comites
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'comites')
    OR has_module_permission(auth.uid(), 'comites', 'edit')
  );

CREATE POLICY "delete comites by permission" ON public.comites
  FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'comites')
    OR has_module_permission(auth.uid(), 'comites', 'delete')
  );

CREATE TRIGGER comites_set_updated_at
  BEFORE UPDATE ON public.comites
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.module_permissions (module_slug, action, label, sort_order, description) VALUES
  ('comites', 'view',   'Visualizar', 1, 'Visualizar comitês'),
  ('comites', 'create', 'Criar',      2, 'Criar reuniões de comitês'),
  ('comites', 'edit',   'Editar',     3, 'Editar reuniões de comitês'),
  ('comites', 'delete', 'Excluir',    4, 'Excluir reuniões de comitês')
ON CONFLICT DO NOTHING;

INSERT INTO public.module_admins (user_id, module_slug, granted_by)
SELECT ur.user_id, 'comites', ur.user_id
FROM public.user_roles ur
WHERE ur.role = 'admin'
ON CONFLICT (user_id, module_slug) DO NOTHING;

INSERT INTO public.user_module_permissions (user_id, module_slug, action, granted_by)
SELECT ur.user_id, 'comites', mp.action, ur.user_id
FROM public.user_roles ur
CROSS JOIN public.module_permissions mp
WHERE ur.role = 'admin' AND mp.module_slug = 'comites'
ON CONFLICT (user_id, module_slug, action) DO NOTHING;
