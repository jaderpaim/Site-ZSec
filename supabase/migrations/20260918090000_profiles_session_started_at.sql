-- Servidor passa a reforçar os limites de 24h (absoluto) e 8h (inatividade) que antes
-- só existiam no watchdog client-side (src/lib/auth-context.tsx). Sem isso, um token
-- Supabase ainda válido (renovado silenciosamente pelo SDK) continuava sendo aceito
-- mesmo depois que a política da aplicação deveria ter encerrado a sessão — bastava o
-- watchdog não ter tido chance de rodar (aba em segundo plano, notebook hibernando).
--
-- session_started_at guarda o momento do login real, gravado por
-- logAccessSuccess/logLogoutEvent (src/lib/access-logs.functions.ts) e pelo callback
-- SSO (src/routes/api/public/auth/azure/callback.ts), sempre via supabaseAdmin.
-- requireActiveSession (src/lib/session-policy.middleware.ts) lê essa coluna junto
-- com last_active_at (já existente) a cada chamada autenticada.
--
-- Reaproveita o trigger de 20260824130000 (que já bloqueia auto-escalação de colunas
-- sensíveis em profiles) para impedir que o próprio usuário autenticado reset esse
-- timestamp e burle a expiração absoluta de sessão.

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS session_started_at timestamptz;

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

  RETURN NEW;
END;
$$;
