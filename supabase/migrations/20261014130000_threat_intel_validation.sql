-- Threat Intelligence — validação de legitimidade da credencial vazada.
--
-- A validação submete usuário+senha ao endpoint de login de uma aplicação
-- PRÓPRIA cadastrada aqui (allowlist), nunca à URL de terceiro onde a
-- credencial foi capturada. Ver leakradar-validate.server.ts. A senha trafega
-- só em memória durante a tentativa; nada de senha é gravado nesta tabela nem
-- em leakradar_leaks.

-- Aplicações próprias que podem ser alvo de validação. Cadastrar uma aqui é
-- uma afirmação de que o sistema é seu e você autoriza o teste (registrado no
-- audit log). IdPs de terceiros são bloqueados na camada de aplicação.
CREATE TABLE public.leakradar_apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  -- host que casa com a URL capturada (ex.: portal.bernoulli.com.br)
  host text NOT NULL UNIQUE,
  -- endpoint real do login (pode diferir da URL capturada); sempre https
  login_url text NOT NULL,
  method text NOT NULL DEFAULT 'http_form' CHECK (method IN ('http_form', 'http_json')),
  username_field text NOT NULL DEFAULT 'username',
  password_field text NOT NULL DEFAULT 'password',
  -- campos estáticos adicionais no corpo (ex.: {"grant_type":"password"})
  extra_fields jsonb NOT NULL DEFAULT '{}'::jsonb,
  -- como reconhecer sucesso da autenticação
  success_type text NOT NULL DEFAULT 'status'
    CHECK (success_type IN ('status', 'body_contains', 'body_not_contains', 'json_field')),
  success_value text NOT NULL DEFAULT '200',
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.leakradar_apps TO authenticated;
GRANT ALL ON public.leakradar_apps TO service_role;

ALTER TABLE public.leakradar_apps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leakradar_apps FORCE ROW LEVEL SECURITY;

CREATE POLICY "threat intel view apps by permission" ON public.leakradar_apps
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_module_admin(auth.uid(), 'threat-intel'::text)
    OR public.has_module_permission(auth.uid(), 'threat-intel'::text, 'view'::text)
  );

CREATE POLICY "service role write leakradar apps" ON public.leakradar_apps
  FOR ALL TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Resultado da última validação, na própria credencial. Nunca guarda a senha:
-- só o veredito, quando e quem validou.
ALTER TABLE public.leakradar_leaks
  ADD COLUMN IF NOT EXISTS validation_status text
    CHECK (validation_status IN ('valida', 'invalida', 'inconclusiva')),
  ADD COLUMN IF NOT EXISTS validation_checked_at timestamptz,
  ADD COLUMN IF NOT EXISTS validation_detail text,
  ADD COLUMN IF NOT EXISTS validation_by uuid REFERENCES auth.users (id) ON DELETE SET NULL;
