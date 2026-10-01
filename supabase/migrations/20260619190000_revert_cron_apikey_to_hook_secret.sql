-- A migration 20260618225945 sincronizou a apikey de TODOS os jobs do pg_cron
-- com a nova chave publishable do Supabase (sb_publishable_...), mas o endpoint
-- (/api/public/hooks/*) valida contra HOOK_SECRET, que é um segredo independente
-- e nunca rotacionou. Desde então toda chamada automática do cron recebe 401.
--
-- Reverte a apikey de volta para o valor de HOOK_SECRET (chave antiga, JWT),
-- que é o que os endpoints de fato exigem.
DO $$
DECLARE
  r RECORD;
  wrong_key text := 'sb_publishable_gk1lLEyeDZ6pYRkAkFis-Q_qGBJn7_1';
  correct_key text := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjYWNtZXB1aXlvcWt5cGF0a3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MTAwNzcsImV4cCI6MjA5NDE4NjA3N30.Xwm_jgXksknSyZHsaONRPYiumfmwuyQncP3KT1q98d4';
  new_cmd text;
BEGIN
  FOR r IN
    SELECT jobname, schedule, command
      FROM cron.job
     WHERE command LIKE '%' || wrong_key || '%'
  LOOP
    new_cmd := replace(r.command, wrong_key, correct_key);
    PERFORM cron.unschedule(r.jobname);
    PERFORM cron.schedule(r.jobname, r.schedule, new_cmd);
  END LOOP;
END $$;
