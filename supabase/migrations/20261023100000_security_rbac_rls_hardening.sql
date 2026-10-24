-- Auditoria de segurança run-1 (itens 2, 3 e 6).
-- Todas as escritas nessas tabelas passam pelo service role (src/lib/users.functions.ts),
-- então o papel authenticated só precisa de leitura. As regras de hierarquia
-- (só super_admin atribui super_admin / módulos exclusivos) continuam no servidor.

-- 1) user_roles: remove a policy legada FOR ALL que deixava admin virar super_admin
DROP POLICY IF EXISTS "admins manage roles" ON public.user_roles;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.user_roles FROM authenticated, anon;

-- 2) module_admins: remove a policy FOR ALL de admin (mantém "admin or self view module admins")
DROP POLICY IF EXISTS "admin manage module admins" ON public.module_admins;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.module_admins FROM authenticated, anon;

-- 3) permission_profile_items: troca a FOR ALL por uma só de leitura
DROP POLICY IF EXISTS "admin manage permission profile items" ON public.permission_profile_items;
DROP POLICY IF EXISTS "admin view permission profile items" ON public.permission_profile_items;
CREATE POLICY "admin view permission profile items" ON public.permission_profile_items
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.permission_profile_items FROM authenticated, anon;

-- 4) profiles: o usuário não pode mais editar o próprio email nem auth_method
--    (email era usado como pré-cadastro do SSO; auth_method define conta só-SSO)
CREATE OR REPLACE FUNCTION public.prevent_profile_column_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'service_role' THEN
    RETURN NEW;
  END IF;

  IF NEW.department_id IS DISTINCT FROM OLD.department_id THEN
    RAISE EXCEPTION 'department_id can only be changed by an administrator';
  END IF;

  IF NEW.permission_profile_id IS DISTINCT FROM OLD.permission_profile_id THEN
    RAISE EXCEPTION 'permission_profile_id can only be changed by an administrator';
  END IF;

  IF NEW.session_started_at IS DISTINCT FROM OLD.session_started_at THEN
    RAISE EXCEPTION 'session_started_at can only be changed by the server';
  END IF;

  IF NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'email can only be changed by the server';
  END IF;

  IF NEW.auth_method IS DISTINCT FROM OLD.auth_method THEN
    RAISE EXCEPTION 'auth_method can only be changed by an administrator';
  END IF;

  RETURN NEW;
END;
$$;

-- 5) profiles: ninguém deleta profile pelo cliente (deleteUser usa service role).
--    INSERT/UPDATE continuam: o cliente ainda grava last_active_at (auth-context.tsx).
REVOKE DELETE, TRUNCATE ON public.profiles FROM authenticated, anon;
