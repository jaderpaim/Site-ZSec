-- Falhas do qradar-sync (e potencialmente de outros hooks) somem sem deixar
-- rastro: quando algo externo mata a execução no meio (confirmado via
-- net._http_response que existem timeouts/503 perto dos horários em que o
-- qradar-sync parou de logar atividade), o recordCronRun final nunca roda —
-- e não dá pra saber DEPOIS o que aconteceu, porque net.http_request_queue
-- (a fila de requisições do pg_net) é apagada assim que a requisição é
-- processada, levando junto a única referência que ligaria uma resposta em
-- net._http_response (status_code, timed_out, error_msg) ao job que a
-- originou. Tentar correlacionar por horário depois não é confiável: o
-- campo `created` de uma resposta com timeout reflete quando o pg_net
-- desistiu de esperar (created - timeout_milliseconds), não o disparo.
--
-- Esta tabela guarda o id retornado por net.http_post() no instante do
-- disparo, junto do job_name — permite JOIN exato com net._http_response
-- pra qualquer execução futura, de qualquer cron job (a função abaixo é
-- compartilhada por todos eles via schedule_hook_cron).
CREATE TABLE IF NOT EXISTS public.cron_http_dispatch_log (
  id bigint PRIMARY KEY,
  job_name text NOT NULL,
  dispatched_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_cron_http_dispatch_log_job_name
  ON public.cron_http_dispatch_log (job_name, dispatched_at DESC);

-- Mesma assinatura e mesmo timeout de 280s já corrigido em
-- 20260626170000_cron_hook_timeout.sql — só acrescenta o log do dispatch.
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
      INSERT INTO public.cron_http_dispatch_log (id, job_name)
      SELECT net.http_post(
        url     := %L,
        headers := jsonb_build_object(
                     'Content-Type', 'application/json',
                     'apikey',       %L
                   ),
        body    := '{}'::jsonb,
        timeout_milliseconds := 280000
      ), %L;
      $q$,
      p_hook_url,
      p_anon_key,
      p_job_name
    )
  );
END;
$$;

-- Reagenda só o qradar-sync (job em investigação) pra já passar a logar o
-- dispatch a partir de agora. Os demais jobs pegam o fix automaticamente na
-- próxima vez que forem tocados pela UI (toggle ou edição de intervalo, que
-- já chamam schedule_hook_cron) — não reagendamos todos aqui de propósito,
-- pra não arriscar recriar o schedule de algum job com um cron diferente do
-- que está rodando hoje.
SELECT public.schedule_hook_cron(
  'qradar-sync',
  '0 */2 * * *',
  'https://b-security.bernoulli.com.br/api/public/hooks/qradar-sync',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjYWNtZXB1aXlvcWt5cGF0a3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MTAwNzcsImV4cCI6MjA5NDE4NjA3N30.Xwm_jgXksknSyZHsaONRPYiumfmwuyQncP3KT1q98d4'
);
