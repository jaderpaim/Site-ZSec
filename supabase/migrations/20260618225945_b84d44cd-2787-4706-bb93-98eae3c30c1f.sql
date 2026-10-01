DO $$
DECLARE
  r RECORD;
  old_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjYWNtZXB1aXlvcWt5cGF0a3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MTAwNzcsImV4cCI6MjA5NDE4NjA3N30.Xwm_jgXksknSyZHsaONRPYiumfmwuyQncP3KT1q98d4';
  new_key text := 'sb_publishable_gk1lLEyeDZ6pYRkAkFis-Q_qGBJn7_1';
  new_cmd text;
BEGIN
  FOR r IN
    SELECT jobname, schedule, command
      FROM cron.job
     WHERE command LIKE '%' || old_key || '%'
  LOOP
    new_cmd := replace(r.command, old_key, new_key);
    PERFORM cron.unschedule(r.jobname);
    PERFORM cron.schedule(r.jobname, r.schedule, new_cmd);
  END LOOP;
END $$;