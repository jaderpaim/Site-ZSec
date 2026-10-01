-- Scan autenticado (DAST): credencial de login por domínio-alvo, reutilizável
-- entre scans manuais e Agendamentos (diferente de dast_ad_ldap/shadowit_smb
-- em integrations, que são credenciais ÚNICAS/globais -- aqui cada aplicação
-- escaneada tem seu próprio usuário/senha de teste, daí tabela própria com
-- 1 linha por domínio em vez do padrão singleton de integrations).
-- Senha cifrada (AES-256-GCM via encryptSecret/decryptSecret, mesma chave
-- INTEGRATIONS_ENCRYPTION_KEY já usada por dast_ad_ldap/shadowit_smb) --
-- nunca grava em texto plano, nunca sai da VM do scanner exceto por request
-- HTTPS pontual na hora do scan (mesmo padrão de ad_username/ad_password).

CREATE TABLE public.dast_auth_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain text NOT NULL UNIQUE,
  login_url text NOT NULL,
  username text NOT NULL,
  password_enc text NOT NULL,
  -- Regex opcional que só bate em página autenticada (ex.: "Sair"/"Logout")
  -- -- usado pelo ZAP (authentication/action/setLoggedInIndicator) pra
  -- detectar sessão expirada no meio do scan e reautenticar sozinho. Sem
  -- isso, o Browser-Based Authentication do ZAP ainda funciona (login
  -- inicial), só não percebe se a sessão cair durante um scan longo.
  logged_in_indicator text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dast_auth_credentials TO authenticated;
GRANT ALL ON public.dast_auth_credentials TO service_role;

ALTER TABLE public.dast_auth_credentials ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dast team manage auth credentials" ON public.dast_auth_credentials
  FOR ALL TO authenticated
  USING (public.is_dast_allowed(auth.uid()))
  WITH CHECK (public.is_dast_allowed(auth.uid()));

CREATE POLICY "service role write auth credentials" ON public.dast_auth_credentials
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
