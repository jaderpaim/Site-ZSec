-- Segurança: o papel de um usuário novo não pode vir do próprio usuário.
--
-- A versão anterior (20260825130100) lia o papel de raw_user_meta_data, que é
-- preenchido por quem se cadastra (supabase.auth.signUp com a chave
-- publishable, pública no navegador). Qualquer pessoa conseguia se cadastrar
-- já como super_admin passando options.data.role.
--
-- Agora o papel só é aceito de raw_app_meta_data, que apenas a service role
-- consegue gravar. Sem isso, todo usuário nasce visualizador; o convite
-- (users.functions.ts) define o papel escolhido pelo admin logo depois de
-- criar o usuário.

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  default_role app_role := 'visualizador';
  requested_role text;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  requested_role := NEW.raw_app_meta_data->>'role';
  IF requested_role IN ('admin','analista','visualizador','personalizado','super_admin') THEN
    default_role := requested_role::app_role;
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, default_role);
  PERFORM public.apply_role_defaults(NEW.id, default_role);
  RETURN NEW;
END;
$function$;
