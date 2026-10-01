
CREATE TABLE IF NOT EXISTS public.wsus_servers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  computer_name text NOT NULL,
  needed int NOT NULL DEFAULT 0,
  installed_or_na int NOT NULL DEFAULT 0,
  failed int NOT NULL DEFAULT 0,
  no_status int NOT NULL DEFAULT 0,
  not_installed int GENERATED ALWAYS AS (needed + no_status) STORED,
  has_alert boolean GENERATED ALWAYS AS ((needed + no_status) > 0) STORED,
  last_report_at timestamptz,
  raw jsonb,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS wsus_servers_computer_name_lower_idx
  ON public.wsus_servers (lower(computer_name));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.wsus_servers TO authenticated;
GRANT ALL ON public.wsus_servers TO service_role;

ALTER TABLE public.wsus_servers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view wsus by permission" ON public.wsus_servers FOR SELECT TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR is_module_admin(auth.uid(), 'wsus') OR has_module_permission(auth.uid(), 'wsus', 'view'));

CREATE POLICY "insert wsus by permission" ON public.wsus_servers FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_module_admin(auth.uid(), 'wsus') OR has_module_permission(auth.uid(), 'wsus', 'create') OR has_module_permission(auth.uid(), 'wsus', 'edit'));

CREATE POLICY "update wsus by permission" ON public.wsus_servers FOR UPDATE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR is_module_admin(auth.uid(), 'wsus') OR has_module_permission(auth.uid(), 'wsus', 'edit'));

CREATE POLICY "delete wsus by permission" ON public.wsus_servers FOR DELETE TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role) OR is_module_admin(auth.uid(), 'wsus') OR has_module_permission(auth.uid(), 'wsus', 'delete'));

CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS wsus_servers_set_updated_at ON public.wsus_servers;
CREATE TRIGGER wsus_servers_set_updated_at BEFORE UPDATE ON public.wsus_servers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.module_permissions (module_slug, action, label, description, sort_order) VALUES
  ('wsus', 'view',   'Visualizar', 'Ver o dashboard de WSUS', 1),
  ('wsus', 'create', 'Importar',   'Importar dados de WSUS',  2),
  ('wsus', 'edit',   'Editar',     'Atualizar dados de WSUS', 3),
  ('wsus', 'delete', 'Excluir',    'Remover servidores WSUS', 4)
ON CONFLICT DO NOTHING;
