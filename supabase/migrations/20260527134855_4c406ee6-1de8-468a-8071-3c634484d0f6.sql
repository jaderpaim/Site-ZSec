
CREATE TABLE public.domains (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  domain_name text NOT NULL UNIQUE,
  registrar text NOT NULL DEFAULT 'outro',
  created_date date,
  expiry_date date,
  alert_days integer NOT NULL DEFAULT 30,
  status text NOT NULL DEFAULT 'ativo',
  last_checked_at timestamptz,
  last_check_error text,
  last_alert_sent_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.domains TO authenticated;
GRANT ALL ON public.domains TO service_role;

ALTER TABLE public.domains ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view domains by permission"
  ON public.domains FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'dominios-ssl')
    OR has_module_permission(auth.uid(), 'dominios-ssl', 'view')
  );

CREATE POLICY "insert domains by permission"
  ON public.domains FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'dominios-ssl')
    OR has_module_permission(auth.uid(), 'dominios-ssl', 'create')
    OR has_module_permission(auth.uid(), 'dominios-ssl', 'edit')
  );

CREATE POLICY "update domains by permission"
  ON public.domains FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'dominios-ssl')
    OR has_module_permission(auth.uid(), 'dominios-ssl', 'edit')
  );

CREATE POLICY "delete domains by permission"
  ON public.domains FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'dominios-ssl')
    OR has_module_permission(auth.uid(), 'dominios-ssl', 'delete')
  );

CREATE TRIGGER domains_set_updated_at
  BEFORE UPDATE ON public.domains
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.module_permissions (module_slug, action, label, description, sort_order) VALUES
  ('dominios-ssl', 'view',   'Visualizar', 'Pode visualizar a lista de domínios e status', 1),
  ('dominios-ssl', 'create', 'Cadastrar',  'Pode adicionar novos domínios', 2),
  ('dominios-ssl', 'edit',   'Editar',     'Pode editar/atualizar domínios existentes', 3),
  ('dominios-ssl', 'delete', 'Excluir',    'Pode remover domínios', 4)
ON CONFLICT DO NOTHING;
