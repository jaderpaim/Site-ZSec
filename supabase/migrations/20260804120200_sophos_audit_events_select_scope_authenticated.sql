-- Mesmo problema do api_logs/cron_job_runs/import_logs: a policy
-- "admin+analista view sophos audit events" ficou sem TO authenticated ao
-- recriar a policy em 20260630005001, rodando também para a role 'public'/anon.
-- Já bloqueado na prática (has_role retorna false com auth.uid() null), mas
-- restringimos a role explicitamente por defesa em profundidade.
ALTER POLICY "admin+analista view sophos audit events" ON public.sophos_audit_events
  TO authenticated;
