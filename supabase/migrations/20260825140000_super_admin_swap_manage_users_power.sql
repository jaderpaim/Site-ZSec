-- Inverte qual dos dois papéis tem o poder de gerenciar OUTROS usuários
-- (convidar, excluir, ativar/desativar, trocar papel/departamento/senha/
-- autenticação, conceder permissão granular ou admin de módulo para outra
-- pessoa). A partir de agora:
--
--   - super_admin: hierarquia mais alta — acesso irrestrito, igual ao que
--     "admin" tinha nas duas migrations anteriores (20260825130000 e
--     20260825130100), INCLUSIVE gerenciar outros usuários no módulo "usuarios".
--   - admin: mantém toda a visibilidade/operação nos demais módulos (mesmo
--     bypass de is_module_admin/has_module_permission de antes), mas PERDE
--     o bypass especificamente para o módulo "usuarios" — essa é agora a
--     restrição que antes estava em super_admin.
--
-- O lado aplicativo (src/lib/users.functions.ts::assertCanManageUsers) foi
-- atualizado junto para refletir essa troca. has_role() continua com
-- contrato de igualdade exata de papel — não é alterada aqui.

CREATE OR REPLACE FUNCTION public.is_module_admin(_user_id uuid, _module text)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT
    (auth.role() = 'service_role' OR _user_id = auth.uid())
    AND (
      public.has_role(_user_id, 'super_admin'::app_role)
      OR (public.has_role(_user_id, 'admin'::app_role) AND _module <> 'usuarios')
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
      public.has_role(_user_id, 'super_admin'::app_role)
      OR (public.has_role(_user_id, 'admin'::app_role) AND _module <> 'usuarios')
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
