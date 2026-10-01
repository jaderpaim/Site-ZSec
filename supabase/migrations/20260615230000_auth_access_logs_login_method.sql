-- Adiciona coluna login_method em auth_access_logs para distinguir SSO de login convencional
ALTER TABLE auth_access_logs
  ADD COLUMN IF NOT EXISTS login_method text DEFAULT 'email_password';

-- Cria índice para filtros rápidos por método
CREATE INDEX IF NOT EXISTS idx_auth_access_logs_login_method
  ON auth_access_logs (login_method);

COMMENT ON COLUMN auth_access_logs.login_method IS
  'Método de autenticação: email_password (padrão), sso_azure, sso_saml, sso_ldap';
