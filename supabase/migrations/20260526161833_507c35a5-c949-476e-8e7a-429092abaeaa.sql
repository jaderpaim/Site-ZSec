
-- Enum for policy status
DO $$ BEGIN
  CREATE TYPE public.policy_status AS ENUM ('Publicada', 'Em Validação', 'Revisão');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE public.policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status public.policy_status NOT NULL DEFAULT 'Revisão',
  onda text,
  indicador text,
  publicacao date,
  revisao date,
  trained_count integer NOT NULL DEFAULT 0,
  target_count integer NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.policies TO authenticated;
GRANT ALL ON public.policies TO service_role;

ALTER TABLE public.policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth view policies" ON public.policies
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "policies insert by permission" ON public.policies
  FOR INSERT TO authenticated
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_module_admin(auth.uid(), 'politicas')
    OR public.has_module_permission(auth.uid(), 'politicas', 'create')
  );

CREATE POLICY "policies update by permission" ON public.policies
  FOR UPDATE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_module_admin(auth.uid(), 'politicas')
    OR public.has_module_permission(auth.uid(), 'politicas', 'edit')
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_module_admin(auth.uid(), 'politicas')
    OR public.has_module_permission(auth.uid(), 'politicas', 'edit')
  );

CREATE POLICY "policies delete by permission" ON public.policies
  FOR DELETE TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_module_admin(auth.uid(), 'politicas')
    OR public.has_module_permission(auth.uid(), 'politicas', 'delete')
  );

CREATE TRIGGER policies_set_updated_at
  BEFORE UPDATE ON public.policies
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Catalog of module permissions for "politicas"
INSERT INTO public.module_permissions (module_slug, action, label, description, sort_order) VALUES
  ('politicas', 'view',   'Visualizar', 'Ver políticas',                1),
  ('politicas', 'create', 'Criar',      'Criar novas políticas',        2),
  ('politicas', 'edit',   'Editar',     'Editar políticas existentes',  3),
  ('politicas', 'delete', 'Excluir',    'Excluir políticas',            4)
ON CONFLICT DO NOTHING;

-- Seed inicial (mock atual)
INSERT INTO public.policies (name, status, onda, indicador, publicacao, revisao, trained_count, target_count) VALUES
  ('Política de Senhas',           'Publicada',    '1', 'ISO-A.5',  '2024-03-12', '2025-03-12', 0, 0),
  ('Backup e Recuperação',         'Em Validação', '2', 'ISO-A.8',  NULL,         NULL,         0, 0),
  ('Acesso Remoto',                'Publicada',    '1', 'ISO-A.6',  '2024-01-20', '2025-01-20', 0, 0),
  ('Resposta a Incidentes',        'Revisão',      '3', 'ISO-A.16', NULL,         NULL,         0, 0),
  ('Classificação da Informação',  'Publicada',    '2', 'ISO-A.8',  '2024-05-05', '2025-05-05', 0, 0)
ON CONFLICT DO NOTHING;

-- Aplicar defaults para admins globais existentes (concede as novas ações de "politicas")
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT user_id FROM public.user_roles WHERE role = 'admin'::app_role LOOP
    PERFORM public.apply_role_defaults(r.user_id, 'admin'::app_role);
  END LOOP;
END $$;
