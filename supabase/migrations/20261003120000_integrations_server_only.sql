-- Credenciais de integrações deixam de ser legíveis pelo navegador.
--
-- Até aqui a tela de Integrações fazia SELECT de api_key/config direto do
-- client (permitido pela RLS para admin), então os segredos chegavam inteiros
-- no navegador de qualquer admin. Agora a tela usa a server function
-- listIntegrations, que devolve só uma dica mascarada ("••••a91f"), e a escrita
-- já passava por upsertIntegration (service role).
--
-- Todos os leitores de `integrations` no servidor usam a service role, que
-- ignora RLS e grants de `authenticated` -- nada além da tela é afetado.

DROP POLICY IF EXISTS "admin select integrations" ON public.integrations;
DROP POLICY IF EXISTS "admin manage integrations" ON public.integrations;
DROP POLICY IF EXISTS "auth view integrations" ON public.integrations;

REVOKE ALL ON TABLE public.integrations FROM authenticated;

-- Mantém: RLS ligada, "deny anon access integrations" (RESTRICTIVE) e
-- GRANT ALL para service_role (migração 20260621045152).
