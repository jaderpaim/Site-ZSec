
-- 1. Catálogo de permissões por módulo
CREATE TABLE public.module_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  module_slug text NOT NULL,
  action text NOT NULL,
  label text NOT NULL,
  description text,
  sort_order int NOT NULL DEFAULT 0,
  UNIQUE (module_slug, action)
);

ALTER TABLE public.module_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth view module permissions"
  ON public.module_permissions FOR SELECT TO authenticated USING (true);

-- 2. Admins por módulo
CREATE TABLE public.module_admins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  module_slug text NOT NULL,
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module_slug)
);

ALTER TABLE public.module_admins ENABLE ROW LEVEL SECURITY;

-- 3. Permissões concedidas a um user
CREATE TABLE public.user_module_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  module_slug text NOT NULL,
  action text NOT NULL,
  granted_by uuid,
  granted_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, module_slug, action)
);

ALTER TABLE public.user_module_permissions ENABLE ROW LEVEL SECURITY;

-- 4. Funções auxiliares
CREATE OR REPLACE FUNCTION public.is_module_admin(_user_id uuid, _module text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.module_admins
      WHERE user_id = _user_id AND module_slug = _module
    );
$$;

CREATE OR REPLACE FUNCTION public.has_module_permission(_user_id uuid, _module text, _action text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::app_role)
    OR EXISTS (
      SELECT 1 FROM public.module_admins
      WHERE user_id = _user_id AND module_slug = _module
    )
    OR EXISTS (
      SELECT 1 FROM public.user_module_permissions
      WHERE user_id = _user_id AND module_slug = _module AND action = _action
    );
$$;

CREATE OR REPLACE FUNCTION public.is_any_module_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    public.has_role(_user_id, 'admin'::app_role)
    OR EXISTS (SELECT 1 FROM public.module_admins WHERE user_id = _user_id);
$$;

-- 5. RLS — module_admins
CREATE POLICY "auth view module admins"
  ON public.module_admins FOR SELECT TO authenticated USING (true);

CREATE POLICY "admin manage module admins"
  ON public.module_admins FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

-- 6. RLS — user_module_permissions
CREATE POLICY "user view own permissions"
  ON public.user_module_permissions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_any_module_admin(auth.uid()));

CREATE POLICY "module admin insert permissions"
  ON public.user_module_permissions FOR INSERT TO authenticated
  WITH CHECK (public.is_module_admin(auth.uid(), module_slug));

CREATE POLICY "module admin delete permissions"
  ON public.user_module_permissions FOR DELETE TO authenticated
  USING (public.is_module_admin(auth.uid(), module_slug));

-- 7. Seed do catálogo
INSERT INTO public.module_permissions (module_slug, action, label, description, sort_order) VALUES
  ('vulnerabilidades','view','Visualizar','Ver vulnerabilidades e dashboards',1),
  ('vulnerabilidades','create','Criar','Importar / cadastrar vulnerabilidades',2),
  ('vulnerabilidades','edit','Editar','Alterar status, responsável, severidade',3),
  ('vulnerabilidades','delete','Excluir','Remover vulnerabilidades',4),
  ('gmud','view','Visualizar','Ver GMUDs e dashboards',1),
  ('gmud','create','Criar','Abrir novas GMUDs',2),
  ('gmud','edit','Editar','Editar GMUDs existentes',3),
  ('gmud','approve','Aprovar/Rejeitar','Aprovar ou rejeitar como CAB',4),
  ('gmud','execute','Executar','Marcar execução / rollback',5),
  ('gmud','delete','Excluir','Excluir GMUDs',6),
  ('cloudflare','view','Visualizar','Ver dashboards Cloudflare',1),
  ('cloudflare','manage','Gerenciar','Sincronizar e operar',2),
  ('sophos','view','Visualizar','Ver dashboards Sophos',1),
  ('sophos','manage','Gerenciar','Sincronizar e operar',2),
  ('smtp','view','Visualizar','Ver configuração SMTP',1),
  ('smtp','manage','Gerenciar','Editar SMTP e enviar testes',2),
  ('departamentos','view','Visualizar','Ver departamentos',1),
  ('departamentos','manage','Gerenciar','CRUD de departamentos',2),
  ('integracoes','view','Visualizar','Ver integrações',1),
  ('integracoes','manage','Gerenciar','Configurar integrações',2),
  ('logs','view','Visualizar','Ver logs do sistema',1),
  ('upload','view','Visualizar','Ver uploads',1),
  ('upload','create','Importar','Realizar importações',2),
  ('usuarios','view','Visualizar','Ver lista de usuários',1),
  ('usuarios','manage','Gerenciar','Conceder permissões e papéis',2);
