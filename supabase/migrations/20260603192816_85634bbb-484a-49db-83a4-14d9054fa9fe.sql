
-- Tabela cmdb_ativos
CREATE TABLE public.cmdb_ativos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome text NOT NULL,
  tipo text NOT NULL,
  ip_hostname text,
  fabricante_modelo text,
  responsavel_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  localizacao text,
  criticidade text NOT NULL CHECK (criticidade IN ('Baixo','Médio','Alto','Crítico')),
  status text NOT NULL DEFAULT 'Ativo' CHECK (status IN ('Ativo','Em manutenção','Desativado')),
  observacoes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

CREATE INDEX cmdb_ativos_criticidade_idx ON public.cmdb_ativos (criticidade);
CREATE INDEX cmdb_ativos_status_idx ON public.cmdb_ativos (status);
CREATE INDEX cmdb_ativos_responsavel_idx ON public.cmdb_ativos (responsavel_id);
CREATE INDEX cmdb_ativos_nome_idx ON public.cmdb_ativos (lower(nome));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cmdb_ativos TO authenticated;
GRANT ALL ON public.cmdb_ativos TO service_role;

ALTER TABLE public.cmdb_ativos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view cmdb by permission"
  ON public.cmdb_ativos FOR SELECT TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'cmdb')
    OR has_module_permission(auth.uid(), 'cmdb', 'view')
  );

CREATE POLICY "insert cmdb by permission"
  ON public.cmdb_ativos FOR INSERT TO authenticated
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'cmdb')
    OR has_module_permission(auth.uid(), 'cmdb', 'create')
    OR has_module_permission(auth.uid(), 'cmdb', 'edit')
  );

CREATE POLICY "update cmdb by permission"
  ON public.cmdb_ativos FOR UPDATE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'cmdb')
    OR has_module_permission(auth.uid(), 'cmdb', 'edit')
  );

CREATE POLICY "delete cmdb by permission"
  ON public.cmdb_ativos FOR DELETE TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR is_module_admin(auth.uid(), 'cmdb')
    OR has_module_permission(auth.uid(), 'cmdb', 'delete')
  );

CREATE TRIGGER cmdb_ativos_set_updated_at
  BEFORE UPDATE ON public.cmdb_ativos
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Catálogo de permissões
INSERT INTO public.module_permissions (module_slug, action, label, description, sort_order) VALUES
  ('cmdb', 'view',   'Visualizar', 'Permite visualizar ativos do CMDB.',     1),
  ('cmdb', 'create', 'Criar',      'Permite cadastrar novos ativos no CMDB.', 2),
  ('cmdb', 'edit',   'Editar',     'Permite editar ativos do CMDB.',         3),
  ('cmdb', 'delete', 'Excluir',    'Permite excluir ativos do CMDB.',        4)
ON CONFLICT DO NOTHING;

-- Backfill: admins e analistas já existentes recebem permissões do novo módulo
INSERT INTO public.user_module_permissions (user_id, module_slug, action, granted_by)
SELECT ur.user_id, mp.module_slug, mp.action, ur.user_id
FROM public.user_roles ur
CROSS JOIN public.module_permissions mp
WHERE ur.role IN ('admin','analista')
  AND mp.module_slug = 'cmdb'
ON CONFLICT (user_id, module_slug, action) DO NOTHING;

-- Admin global recebe module_admin do CMDB
INSERT INTO public.module_admins (user_id, module_slug, granted_by)
SELECT ur.user_id, 'cmdb', ur.user_id
FROM public.user_roles ur
WHERE ur.role = 'admin'
ON CONFLICT (user_id, module_slug) DO NOTHING;
