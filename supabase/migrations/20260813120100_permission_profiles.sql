-- Perfis de permissão: conjuntos nomeados e reutilizáveis de permissões
-- granulares (module_slug, action), aplicáveis manualmente a um usuário
-- Personalizado a partir da tela de Usuários. Aplicar um perfil é uma cópia
-- única (snapshot) — editar o perfil depois não afeta quem já usou.

CREATE TABLE public.permission_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.permission_profile_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES public.permission_profiles(id) ON DELETE CASCADE,
  module_slug text NOT NULL,
  action text NOT NULL,
  UNIQUE (profile_id, module_slug, action)
);

ALTER TABLE public.permission_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permission_profile_items ENABLE ROW LEVEL SECURITY;

-- Gerenciamento (CRUD + aplicar a usuário) fica só com admin global, mesmo
-- critério usado em setUserRole/setUserAuthMethod em users.functions.ts. Os
-- server functions usam o client de service-role (bypassa RLS) e checam
-- isGlobalAdmin em JS; esta policy é a camada equivalente no banco.
CREATE POLICY "admin manage permission profiles" ON public.permission_profiles
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "admin manage permission profile items" ON public.permission_profile_items
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
