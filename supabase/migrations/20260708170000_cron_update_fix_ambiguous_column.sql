-- Corrige public.update_cron_hook_domain (20260708150000_cron_update.sql):
-- o parâmetro de saída "schedule" (RETURNS TABLE) tem o mesmo nome da coluna
-- cron.job.schedule, o que gera "column reference schedule is ambiguous" ao
-- rodar a função (ERROR 42702). Corrige qualificando as colunas com alias.
CREATE OR REPLACE FUNCTION public.update_cron_hook_domain(
  p_old_domain text,
  p_new_domain text,
  p_dry_run    boolean DEFAULT true
) RETURNS TABLE(job_name text, schedule text, old_command text, new_command text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
  v_new_cmd text;
BEGIN
  FOR r IN
    SELECT j.jobname AS jobname, j.schedule AS jobschedule, j.command AS command
      FROM cron.job j
     WHERE j.command LIKE '%' || p_old_domain || '%'
  LOOP
    v_new_cmd := replace(r.command, p_old_domain, p_new_domain);

    IF NOT p_dry_run THEN
      PERFORM cron.unschedule(r.jobname);
      PERFORM cron.schedule(r.jobname, r.jobschedule, v_new_cmd);
    END IF;

    job_name    := r.jobname;
    schedule    := r.jobschedule;
    old_command := r.command;
    new_command := v_new_cmd;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.update_cron_hook_domain(text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_cron_hook_domain(text, text, boolean) TO service_role;
