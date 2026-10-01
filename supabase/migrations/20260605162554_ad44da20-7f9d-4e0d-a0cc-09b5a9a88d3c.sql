
CREATE TABLE public.applications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  department_id uuid NOT NULL REFERENCES public.departments(id) ON DELETE RESTRICT,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);

CREATE UNIQUE INDEX applications_name_lower_unique ON public.applications (lower(name));
CREATE INDEX applications_department_id_idx ON public.applications (department_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.applications TO authenticated;
GRANT ALL ON public.applications TO service_role;

ALTER TABLE public.applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view applications by permission" ON public.applications
  FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'aplicacoes')
    OR has_module_permission(auth.uid(), 'aplicacoes', 'view')
  );

CREATE POLICY "insert applications by permission" ON public.applications
  FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'aplicacoes')
    OR has_module_permission(auth.uid(), 'aplicacoes', 'create')
    OR has_module_permission(auth.uid(), 'aplicacoes', 'edit')
  );

CREATE POLICY "update applications by permission" ON public.applications
  FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'aplicacoes')
    OR has_module_permission(auth.uid(), 'aplicacoes', 'edit')
  );

CREATE POLICY "delete applications by permission" ON public.applications
  FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'aplicacoes')
    OR has_module_permission(auth.uid(), 'aplicacoes', 'delete')
  );

CREATE TRIGGER applications_set_updated_at
  BEFORE UPDATE ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.sync_vulns_responsible_from_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  dept_name text;
BEGIN
  SELECT name INTO dept_name FROM public.departments WHERE id = NEW.department_id;

  UPDATE public.vulnerabilities_aplicacao
     SET department_id = NEW.department_id,
         responsible = dept_name,
         updated_at = now()
   WHERE lower(fqdn) = lower(NEW.name);

  UPDATE public.vulnerabilities_infra
     SET department_id = NEW.department_id,
         responsible = dept_name,
         updated_at = now()
   WHERE lower(fqdn) = lower(NEW.name);

  RETURN NEW;
END;
$$;

CREATE TRIGGER applications_sync_vulns
  AFTER INSERT OR UPDATE OF name, department_id ON public.applications
  FOR EACH ROW EXECUTE FUNCTION public.sync_vulns_responsible_from_application();

INSERT INTO public.module_permissions (module_slug, action, label, description, sort_order) VALUES
  ('aplicacoes', 'view',   'Visualizar',  'Visualizar aplicações cadastradas', 0),
  ('aplicacoes', 'create', 'Criar',       'Criar novas aplicações',            1),
  ('aplicacoes', 'edit',   'Editar',      'Editar aplicações existentes',      2),
  ('aplicacoes', 'delete', 'Excluir',     'Excluir aplicações',                3)
ON CONFLICT DO NOTHING;

INSERT INTO public.user_module_permissions (user_id, module_slug, action, granted_by)
SELECT ur.user_id, mp.module_slug, mp.action, ur.user_id
  FROM public.user_roles ur
  CROSS JOIN public.module_permissions mp
 WHERE ur.role = 'admin' AND mp.module_slug = 'aplicacoes'
ON CONFLICT DO NOTHING;
