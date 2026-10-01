-- api_logs: a policy "admin+analista view api logs" ficou sem TO authenticated
-- (perdido ao recriar a policy em 20260616005541), rodando também para a role
-- 'public'/anon. Já é bloqueado na prática pois has_role(auth.uid(),...) retorna
-- false com auth.uid() null, mas restringimos a role explicitamente por defesa
-- em profundidade, sem depender apenas da lógica interna de has_role.
ALTER POLICY "admin+analista view api logs" ON public.api_logs
  TO authenticated;
