-- Helper functions callable via Supabase RPC (service_role) so the app can
-- create and remove real pg_cron jobs without a manual SQL migration.
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Schedule (or re-schedule) a hook-based cron job.
-- The job calls net.http_post to the app's public hook endpoint.
CREATE OR REPLACE FUNCTION public.schedule_hook_cron(
  p_job_name  text,
  p_schedule  text,
  p_hook_url  text,
  p_anon_key  text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Remove existing job with same name so we can re-schedule cleanly.
  BEGIN
    PERFORM cron.unschedule(p_job_name);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  PERFORM cron.schedule(
    p_job_name,
    p_schedule,
    format(
      $q$
      SELECT net.http_post(
        url     := %L,
        headers := jsonb_build_object(
                     'Content-Type', 'application/json',
                     'apikey',       %L
                   ),
        body    := '{}'::jsonb
      );
      $q$,
      p_hook_url,
      p_anon_key
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.schedule_hook_cron(text, text, text, text) TO service_role;

-- Unschedule a pg_cron job (silently ignores if it doesn't exist).
CREATE OR REPLACE FUNCTION public.unschedule_hook_cron(p_job_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  PERFORM cron.unschedule(p_job_name);
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

GRANT EXECUTE ON FUNCTION public.unschedule_hook_cron(text) TO service_role;
