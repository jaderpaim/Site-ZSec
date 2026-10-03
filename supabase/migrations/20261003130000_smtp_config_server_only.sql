-- smtp_config deixa de ser legível pelo navegador.
--
-- A migração 20260621044025 tentou esconder a senha com
-- `REVOKE SELECT (password) ON smtp_config FROM authenticated`, mas revogação
-- por coluna não tem efeito enquanto existe o GRANT SELECT da tabela inteira
-- (padrão do Supabase) -- a senha seguia legível para admin via API.
--
-- A tela de SMTP lê e grava só por server functions (getSmtpConfig devolve a
-- configuração SEM a senha; upsertSmtpConfig grava), e todos os leitores no
-- servidor usam a service role -- nada além disso é afetado.

DROP POLICY IF EXISTS "admin manage smtp" ON public.smtp_config;
DROP POLICY IF EXISTS "admin view smtp" ON public.smtp_config;

REVOKE ALL ON TABLE public.smtp_config FROM authenticated, anon, PUBLIC;
GRANT ALL ON TABLE public.smtp_config TO service_role;
