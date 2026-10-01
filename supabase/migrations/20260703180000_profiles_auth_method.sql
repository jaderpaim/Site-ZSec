-- Método de autenticação por usuário.
-- sso    → apenas SSO (SAML / OAuth). Redefinição de senha desabilitada no painel admin.
-- email  → apenas email + senha local (útil para ambientes sem SSO / testes locais).
-- ambos  → aceita SSO ou senha local (recomendado para admins que precisam de acesso offline).
--
-- Default: 'sso' — todos os usuários existentes continuam como SSO-only.
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS auth_method text NOT NULL DEFAULT 'sso'
  CONSTRAINT profiles_auth_method_check
    CHECK (auth_method IN ('sso', 'email', 'ambos'));
