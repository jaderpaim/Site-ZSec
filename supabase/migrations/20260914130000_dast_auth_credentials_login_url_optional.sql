-- login_url deixa de ser obrigatório: nem toda aplicação tem a página de
-- login num path previsível ("/login" vs "/auth" vs "/admin" etc.) -- quando
-- vazio, o app passa a mandar a RAIZ do alvo escaneado como loginPageUrl pro
-- ZAP (ver startDastScan em dast.functions.ts). O Browser-Based Authentication
-- do ZAP sobe um navegador de verdade e segue qualquer redirecionamento
-- (HTTP ou JS) até a tela de login renderizar -- então raiz funciona como
-- ponto de entrada universal pra app com "auth wall" (root sempre cai em
-- login), sem precisar acertar o path exato. Só precisa preencher esse campo
-- quando o login mora num host diferente do alvo escaneado (SSO externo).
ALTER TABLE public.dast_auth_credentials ALTER COLUMN login_url DROP NOT NULL;
