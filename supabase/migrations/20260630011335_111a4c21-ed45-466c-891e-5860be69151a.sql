CREATE OR REPLACE FUNCTION public.schedule_hook_cron(p_job_name text, p_schedule text, p_hook_url text, p_anon_key text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
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
        body    := '{}'::jsonb,
        timeout_milliseconds := 280000
      );
      $q$,
      p_hook_url,
      p_anon_key
    )
  );
END;
$function$;