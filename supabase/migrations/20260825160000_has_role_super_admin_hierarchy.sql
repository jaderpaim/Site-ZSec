-- Descoberto via bug real: super_admin (jader.paim) não via nada em Logs
-- (auditoria, cron jobs, api_logs, import_logs) mesmo com acesso total nos
-- demais módulos. Causa: 35 políticas de RLS, em 8 migrations, checam
-- literalmente `has_role(auth.uid(),'admin') OR has_role(auth.uid(),'analista')`
-- — um padrão "cru" que não passa por is_module_admin/has_module_permission
-- (já corrigidos em 20260825140000 para reconhecer super_admin). Remendar
-- política por política não escala e corre o risco de deixar alguma pra trás.
--
-- Fix central: has_role(_user_id, 'admin') passa a retornar true também
-- quando o papel real do usuário é 'super_admin' — super_admin HERDA tudo
-- que checagens de 'admin' já liberam, em qualquer política/RPC existente,
-- sem precisar tocar em cada uma. É assimétrico de propósito:
-- has_role(_user_id, 'super_admin') continua exigindo o papel exato — um
-- 'admin' comum não vira super_admin em lugar nenhum por causa disso.
--
-- Não quebra a exclusão do módulo "usuarios" pra 'admin' (is_module_admin/
-- has_module_permission, 20260825140000): lá, super_admin já tem um branch
-- próprio e incondicional (`has_role(_user_id,'super_admin')`) que decide
-- antes de qualquer chamada a has_role(_user_id,'admin') importar.

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    (auth.role() = 'service_role' OR _user_id = auth.uid())
    AND EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = _user_id
        AND (
          role = _role
          OR (_role = 'admin'::app_role AND role = 'super_admin'::app_role)
        )
    );
$$;
