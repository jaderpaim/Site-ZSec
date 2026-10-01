-- O cron de qradar-sync aparecia "atrasado" mesmo com o pg_cron disparando
-- certinho a cada 2h (confirmado via cron.job_run_details) — net.http_post
-- usa o timeout padrão do pg_net (5000ms), mas o sync completo (várias AQLs
-- sequenciais, algumas com timeout de até 90s cada) pode levar minutos.
-- Toda chamada automática expirava no lado do Postgres antes da resposta
-- chegar (confirmado em net._http_response: timed_out=true), e como isso
-- acontece antes do recordCronRun, a falha nem aparecia registrada — só
-- parava de atualizar last_attempt_at. Aumenta o timeout do helper de
-- agendamento (afeta qualquer cron job criado/editado por ele, não só esse).
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
$$;

-- Reagenda o qradar-sync já existente usando o helper corrigido, sem precisar
-- esperar alguém editar o intervalo pela UI de novo.
SELECT public.schedule_hook_cron(
  'qradar-sync',
  '0 */2 * * *',
  'https://b-security.bernoulli.com.br/api/public/hooks/qradar-sync',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjYWNtZXB1aXlvcWt5cGF0a3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MTAwNzcsImV4cCI6MjA5NDE4NjA3N30.Xwm_jgXksknSyZHsaONRPYiumfmwuyQncP3KT1q98d4'
);
