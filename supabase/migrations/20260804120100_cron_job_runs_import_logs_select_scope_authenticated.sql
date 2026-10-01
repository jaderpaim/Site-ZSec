-- Mesmo problema do api_logs (ver 20260804120000_api_logs_select_scope_authenticated.sql):
-- as policies "admin+analista view cron job runs" e "admin+analista view import logs"
-- ficaram sem TO authenticated ao serem recriadas em 20260616005541, rodando também
-- para a role 'public'/anon. Já bloqueado na prática (has_role retorna false com
-- auth.uid() null), mas restringimos a role explicitamente por defesa em profundidade.
ALTER POLICY "admin+analista view cron job runs" ON public.cron_job_runs
  TO authenticated;

ALTER POLICY "admin+analista view import logs" ON public.import_logs
  TO authenticated;
