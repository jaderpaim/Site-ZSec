
CREATE TABLE public.fornecedores (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  nome text NOT NULL,
  servico_prestado text NOT NULL,
  data_contratacao date NOT NULL,
  data_expiracao date NULL,
  created_by uuid NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.fornecedores TO authenticated;
GRANT ALL ON public.fornecedores TO service_role;

ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view fornecedores by permission"
ON public.fornecedores FOR SELECT TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR is_module_admin(auth.uid(), 'fornecedores')
  OR has_module_permission(auth.uid(), 'fornecedores', 'view')
);

CREATE POLICY "insert fornecedores by permission"
ON public.fornecedores FOR INSERT TO authenticated
WITH CHECK (
  has_role(auth.uid(), 'admin'::app_role)
  OR is_module_admin(auth.uid(), 'fornecedores')
  OR has_module_permission(auth.uid(), 'fornecedores', 'create')
  OR has_module_permission(auth.uid(), 'fornecedores', 'edit')
);

CREATE POLICY "update fornecedores by permission"
ON public.fornecedores FOR UPDATE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR is_module_admin(auth.uid(), 'fornecedores')
  OR has_module_permission(auth.uid(), 'fornecedores', 'edit')
);

CREATE POLICY "delete fornecedores by permission"
ON public.fornecedores FOR DELETE TO authenticated
USING (
  has_role(auth.uid(), 'admin'::app_role)
  OR is_module_admin(auth.uid(), 'fornecedores')
  OR has_module_permission(auth.uid(), 'fornecedores', 'delete')
);

CREATE TRIGGER fornecedores_set_updated_at
BEFORE UPDATE ON public.fornecedores
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.module_permissions (module_slug, action, label, description, sort_order) VALUES
  ('fornecedores', 'view',   'Visualizar', 'Ver lista de fornecedores',  1),
  ('fornecedores', 'create', 'Criar',      'Cadastrar novo fornecedor',  2),
  ('fornecedores', 'edit',   'Editar',     'Editar fornecedor existente',3),
  ('fornecedores', 'delete', 'Excluir',    'Excluir fornecedor',         4)
ON CONFLICT DO NOTHING;
