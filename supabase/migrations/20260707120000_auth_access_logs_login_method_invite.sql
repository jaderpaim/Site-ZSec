-- Documenta o novo valor "invite" de login_method: primeiro acesso via link de
-- ativação de convite (não passa por signIn()/SSO, que já logavam acesso real).
COMMENT ON COLUMN auth_access_logs.login_method IS
  'Método de autenticação: email_password (padrão), sso_azure, sso_saml, sso_ldap, invite (ativação de convite)';
