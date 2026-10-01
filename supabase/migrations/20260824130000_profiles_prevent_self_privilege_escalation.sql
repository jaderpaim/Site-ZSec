-- The "users update own profile" policy (auth.uid() = id, no WITH CHECK) lets any
-- authenticated user update every column on their own profiles row, including
-- department_id (gates row visibility on vulnerabilidades_infra/aplicacao) and
-- permission_profile_id (grants module permissions). RLS has no column-level
-- granularity, so this closes the gap with a trigger instead of a policy change.
--
-- Legitimate changes to these columns already go through supabaseAdmin
-- (service_role) in src/lib/users.functions.ts, so service_role is exempted.

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

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_prevent_profile_column_escalation ON public.profiles;

CREATE TRIGGER trg_prevent_profile_column_escalation
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_profile_column_escalation();
