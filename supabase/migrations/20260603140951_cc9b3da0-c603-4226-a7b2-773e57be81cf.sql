
-- =========================
-- nps_clientes
-- =========================
CREATE TABLE public.nps_clientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  email text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nps_clientes TO authenticated;
GRANT ALL ON public.nps_clientes TO service_role;

ALTER TABLE public.nps_clientes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view nps_clientes by permission"
  ON public.nps_clientes FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'nps')
    OR has_module_permission(auth.uid(), 'nps', 'view')
  );

CREATE POLICY "insert nps_clientes by permission"
  ON public.nps_clientes FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'nps')
    OR has_module_permission(auth.uid(), 'nps', 'create')
    OR has_module_permission(auth.uid(), 'nps', 'edit')
  );

CREATE POLICY "update nps_clientes by permission"
  ON public.nps_clientes FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'nps')
    OR has_module_permission(auth.uid(), 'nps', 'edit')
  );

CREATE POLICY "delete nps_clientes by permission"
  ON public.nps_clientes FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'nps')
    OR has_module_permission(auth.uid(), 'nps', 'delete')
  );

CREATE TRIGGER nps_clientes_set_updated_at
  BEFORE UPDATE ON public.nps_clientes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =========================
-- nps_registros
-- =========================
CREATE TABLE public.nps_registros (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id uuid NOT NULL REFERENCES public.nps_clientes(id) ON DELETE RESTRICT,
  nota integer NOT NULL CHECK (nota BETWEEN 0 AND 10),
  categoria text NOT NULL CHECK (categoria IN ('Detrator','Neutro','Promotor')),
  data_pesquisa date NOT NULL,
  comentario text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid NULL
);

CREATE INDEX idx_nps_registros_cliente ON public.nps_registros(cliente_id);
CREATE INDEX idx_nps_registros_data ON public.nps_registros(data_pesquisa DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.nps_registros TO authenticated;
GRANT ALL ON public.nps_registros TO service_role;

ALTER TABLE public.nps_registros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view nps_registros by permission"
  ON public.nps_registros FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'nps')
    OR has_module_permission(auth.uid(), 'nps', 'view')
  );

CREATE POLICY "insert nps_registros by permission"
  ON public.nps_registros FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'nps')
    OR has_module_permission(auth.uid(), 'nps', 'create')
  );

CREATE POLICY "update nps_registros by permission"
  ON public.nps_registros FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'nps')
    OR has_module_permission(auth.uid(), 'nps', 'edit')
  );

CREATE POLICY "delete nps_registros by permission"
  ON public.nps_registros FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'nps')
    OR has_module_permission(auth.uid(), 'nps', 'delete')
  );

-- =========================
-- Catálogo de permissões do módulo
-- =========================
INSERT INTO public.module_permissions (module_slug, action, label, description, sort_order) VALUES
  ('nps', 'view',   'Visualizar', 'Pode visualizar registros e clientes de NPS', 1),
  ('nps', 'create', 'Criar',      'Pode criar registros e clientes de NPS',      2),
  ('nps', 'edit',   'Editar',     'Pode editar registros e clientes de NPS',     3),
  ('nps', 'delete', 'Excluir',    'Pode excluir registros e clientes de NPS',    4)
ON CONFLICT DO NOTHING;

-- Concede todas as ações de nps aos admins globais existentes
INSERT INTO public.user_module_permissions (user_id, module_slug, action, granted_by)
SELECT ur.user_id, mp.module_slug, mp.action, ur.user_id
FROM public.user_roles ur
CROSS JOIN public.module_permissions mp
WHERE ur.role = 'admin'::app_role
  AND mp.module_slug = 'nps'
ON CONFLICT (user_id, module_slug, action) DO NOTHING;

INSERT INTO public.module_admins (user_id, module_slug, granted_by)
SELECT ur.user_id, 'nps', ur.user_id
FROM public.user_roles ur
WHERE ur.role = 'admin'::app_role
ON CONFLICT (user_id, module_slug) DO NOTHING;
