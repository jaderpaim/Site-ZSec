
-- 1. api_logs: restrict SELECT to admin/analista
DROP POLICY IF EXISTS "auth view api logs" ON public.api_logs;
CREATE POLICY "admin+analista view api logs" ON public.api_logs FOR SELECT
USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'analista'::app_role));

-- 2. cron_job_runs: restrict SELECT to admin/analista
DROP POLICY IF EXISTS "auth view cron job runs" ON public.cron_job_runs;
CREATE POLICY "admin+analista view cron job runs" ON public.cron_job_runs FOR SELECT
USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'analista'::app_role));

-- 3. import_logs: restrict SELECT to admin/analista
DROP POLICY IF EXISTS "auth view import logs" ON public.import_logs;
CREATE POLICY "admin+analista view import logs" ON public.import_logs FOR SELECT
USING (public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'analista'::app_role));

-- 4. auth_access_logs: tighten anon insert (only failed-login rows with no privileged fields)
DROP POLICY IF EXISTS "anyone can insert access log" ON public.auth_access_logs;
CREATE POLICY "anon insert failed login only" ON public.auth_access_logs FOR INSERT
TO anon
WITH CHECK (
  status = 'error'
  AND user_id IS NULL
  AND role IS NULL
  AND full_name IS NULL
  AND coalesce(length(email), 0) <= 320
  AND coalesce(length(error_message), 0) <= 500
);
-- Authenticated users may insert their own success/error rows
CREATE POLICY "authenticated insert own access log" ON public.auth_access_logs FOR INSERT
TO authenticated
WITH CHECK (user_id IS NULL OR user_id = auth.uid());

-- 5. gmud_aprovadores: prevent approver self-reassignment via UPDATE
CREATE OR REPLACE FUNCTION public.gmud_aprovadores_protect_columns()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Admin/analista can change anything
  IF public.has_role(auth.uid(),'admin'::app_role) OR public.has_role(auth.uid(),'analista'::app_role) THEN
    RETURN NEW;
  END IF;

  -- For everyone else (approvers updating their own line), lock identity columns
  IF NEW.gmud_id IS DISTINCT FROM OLD.gmud_id
     OR NEW.email_aprovador IS DISTINCT FROM OLD.email_aprovador
     OR NEW.ordem IS DISTINCT FROM OLD.ordem THEN
    RAISE EXCEPTION 'Approvers cannot change gmud_id, email_aprovador or ordem';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_gmud_aprovadores_protect_columns ON public.gmud_aprovadores;
CREATE TRIGGER trg_gmud_aprovadores_protect_columns
  BEFORE UPDATE ON public.gmud_aprovadores
  FOR EACH ROW EXECUTE FUNCTION public.gmud_aprovadores_protect_columns();
