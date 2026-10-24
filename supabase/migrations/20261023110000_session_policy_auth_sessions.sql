-- Auditoria de segurança run-1 (item 5): limites de sessão 24h/8h não podem mais ser
-- renovados por quem tem o token.
--
-- Antes, o limite de 24h era contado a partir de profiles.session_started_at, que
-- logAccessSuccess (só exige JWT válido) sobrescrevia a cada chamada, e o limite de 8h
-- a partir de last_active_at, que o próprio cliente gravava direto pelo PostgREST.
--
-- Agora requireActiveSession (src/lib/session-policy.middleware.ts) conta as 24h a partir
-- de auth.sessions.created_at da sessão do JWT (claim session_id), que é criada pelo
-- GoTrue no login e não muda em refresh. last_active_at passa a ser gravado só pelo
-- servidor (service role).

CREATE OR REPLACE FUNCTION public.auth_session_info(_session_id uuid)
RETURNS TABLE (user_id uuid, created_at timestamptz)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT s.user_id, s.created_at
  FROM auth.sessions s
  WHERE s.id = _session_id;
$$;

REVOKE ALL ON FUNCTION public.auth_session_info(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.auth_session_info(uuid) TO service_role;

-- Trigger de colunas protegidas: last_active_at passa a ser só do servidor.
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

  IF NEW.last_active_at IS DISTINCT FROM OLD.last_active_at THEN
    RAISE EXCEPTION 'last_active_at can only be changed by the server';
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
