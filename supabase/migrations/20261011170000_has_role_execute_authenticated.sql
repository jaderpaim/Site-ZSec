-- Reconstrução: permissão que existia no banco de origem sem migration.
--
-- has_role() é chamada dentro das policies de RLS (que rodam com o papel do
-- usuário logado) e pelo app via rpc com o client do usuário. A migration
-- 20260519221825 revogou o EXECUTE de authenticated e nenhuma migration
-- devolveu -- no banco de origem a permissão foi devolvida à mão. Sem ela,
-- toda policy que usa has_role falha com "permission denied for function
-- has_role" (o app mostrava qualquer usuário como visualizador).
--
-- anon continua sem acesso. As demais funções revogadas de authenticated nas
-- migrations são de gatilho ou só de servidor (service role) e ficam assim.

GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated, service_role;
