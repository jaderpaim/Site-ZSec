-- Linter Supabase 0029 (Signed-In Users Can Execute SECURITY DEFINER Function):
-- has_role, is_module_admin, has_module_permission, is_any_module_admin e
-- user_department_id são SECURITY DEFINER e precisam continuar liberadas para
-- `authenticated` (são usadas dentro de praticamente toda policy de RLS do
-- sistema — revogar quebraria o app inteiro). Mas, diferente das RPCs de
-- IA/executivo (ver 20260622150000_secure_definer_ia_vuln_rpcs.sql), elas não
-- tinham nenhuma checagem interna: qualquer usuário autenticado podia chamá-las
-- via RPC direto (sem passar pelo app) informando o UUID de OUTRA pessoa e
-- descobrir se ela é admin, quais módulos administra, quais permissões tem ou
-- qual o department_id dela.
--
-- Auditoria de todos os usos (RLS + frontend) confirmou que NUNCA é passado um
-- _user_id diferente de auth.uid() — exceto pela chamada via cliente
-- service_role em gmud.functions.ts (isGmudAdmin), que também sempre usa o id
-- do próprio chamador, só que nesse contexto auth.uid() é NULL (não há JWT de
-- usuário). Por isso o guard libera auth.role() = 'service_role' sem exigir
-- igualdade com auth.uid(), e para authenticated/anon exige _user_id = auth.uid().
--
-- Isso não remove o aviso do linter (o GRANT pra authenticated continua
-- necessário pro RLS funcionar), mas fecha a brecha real de consulta de dados
-- de outros usuários.

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (auth.role() = 'service_role' OR _user_id = auth.uid())
    AND EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role);
$$;

CREATE OR REPLACE FUNCTION public.is_module_admin(_user_id uuid, _module text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    (auth.role() = 'service_role' OR _user_id = auth.uid())
    AND (
      public.has_role(_user_id, 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.module_admins
        WHERE user_id = _user_id AND module_slug = _module
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.has_module_permission(_user_id uuid, _module text, _action text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    (auth.role() = 'service_role' OR _user_id = auth.uid())
    AND (
      public.has_role(_user_id, 'admin'::app_role)
      OR EXISTS (
        SELECT 1 FROM public.module_admins
        WHERE user_id = _user_id AND module_slug = _module
      )
      OR EXISTS (
        SELECT 1 FROM public.user_module_permissions
        WHERE user_id = _user_id AND module_slug = _module AND action = _action
      )
    );
$$;

CREATE OR REPLACE FUNCTION public.is_any_module_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    (auth.role() = 'service_role' OR _user_id = auth.uid())
    AND (
      public.has_role(_user_id, 'admin'::app_role)
      OR EXISTS (SELECT 1 FROM public.module_admins WHERE user_id = _user_id)
    );
$$;

CREATE OR REPLACE FUNCTION public.user_department_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT department_id
  FROM public.profiles
  WHERE id = _user_id
    AND (auth.role() = 'service_role' OR _user_id = auth.uid())
$$;
