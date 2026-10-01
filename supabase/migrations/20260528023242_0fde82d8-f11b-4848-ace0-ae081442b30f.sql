
CREATE TABLE public.aprovadores (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL,
  email text NOT NULL,
  department_id uuid NOT NULL,
  ordem integer NOT NULL,
  papel text NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT aprovadores_ordem_positive CHECK (ordem >= 1)
);

CREATE UNIQUE INDEX aprovadores_dept_ordem_uq ON public.aprovadores (department_id, ordem);
CREATE UNIQUE INDEX aprovadores_dept_email_uq ON public.aprovadores (department_id, lower(email));
CREATE INDEX aprovadores_department_idx ON public.aprovadores (department_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.aprovadores TO authenticated;
GRANT ALL ON public.aprovadores TO service_role;

ALTER TABLE public.aprovadores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view aprovadores"
ON public.aprovadores FOR SELECT TO authenticated
USING (true);

CREATE POLICY "insert aprovadores by permission"
ON public.aprovadores FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR is_module_admin(auth.uid(), 'aprovadores')
  OR has_module_permission(auth.uid(), 'aprovadores', 'create')
  OR has_module_permission(auth.uid(), 'aprovadores', 'edit')
);

CREATE POLICY "update aprovadores by permission"
ON public.aprovadores FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR is_module_admin(auth.uid(), 'aprovadores')
  OR has_module_permission(auth.uid(), 'aprovadores', 'edit')
);

CREATE POLICY "delete aprovadores by permission"
ON public.aprovadores FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR is_module_admin(auth.uid(), 'aprovadores')
  OR has_module_permission(auth.uid(), 'aprovadores', 'delete')
);

CREATE TRIGGER aprovadores_set_updated_at
BEFORE UPDATE ON public.aprovadores
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.module_permissions (module_slug, action, label, description, sort_order) VALUES
  ('aprovadores', 'view',   'Visualizar', 'Ver a lista de aprovadores', 1),
  ('aprovadores', 'create', 'Criar',      'Cadastrar novos aprovadores', 2),
  ('aprovadores', 'edit',   'Editar',     'Editar aprovadores existentes', 3),
  ('aprovadores', 'delete', 'Excluir',    'Remover aprovadores', 4)
ON CONFLICT DO NOTHING;

ALTER TABLE public.gmuds ADD COLUMN IF NOT EXISTS department_id uuid NULL;
