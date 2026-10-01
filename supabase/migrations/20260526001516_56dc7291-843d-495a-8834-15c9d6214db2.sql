
-- Function to grant default permissions based on role
CREATE OR REPLACE FUNCTION public.apply_role_defaults(_user_id uuid, _role app_role)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  monitoramento_modules text[] := ARRAY['vulnerabilidades','sophos','cloudflare'];
  operacao_modules text[] := ARRAY['gmud','upload','logs'];
  m text;
  a record;
BEGIN
  IF _role = 'visualizador' THEN
    -- view only on monitoramento
    FOREACH m IN ARRAY monitoramento_modules LOOP
      INSERT INTO public.user_module_permissions (user_id, module_slug, action, granted_by)
      VALUES (_user_id, m, 'view', _user_id)
      ON CONFLICT (user_id, module_slug, action) DO NOTHING;
    END LOOP;
  ELSIF _role = 'analista' THEN
    -- all actions on monitoramento + operacional modules
    FOR a IN
      SELECT module_slug, action FROM public.module_permissions
      WHERE module_slug = ANY(monitoramento_modules || operacao_modules)
    LOOP
      INSERT INTO public.user_module_permissions (user_id, module_slug, action, granted_by)
      VALUES (_user_id, a.module_slug, a.action, _user_id)
      ON CONFLICT (user_id, module_slug, action) DO NOTHING;
    END LOOP;
  END IF;
  -- admin: nothing needed, has_role handles it
END;
$$;

-- Update handle_new_user to seed defaults
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  default_role app_role := 'visualizador';
  requested_role text;
BEGIN
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email));

  requested_role := NEW.raw_user_meta_data->>'role';
  IF requested_role IN ('admin','analista','visualizador') THEN
    default_role := requested_role::app_role;
  END IF;

  INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, default_role);
  PERFORM public.apply_role_defaults(NEW.id, default_role);
  RETURN NEW;
END;
$$;

-- Ensure trigger exists (idempotent)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
