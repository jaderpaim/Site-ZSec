-- Threat Intelligence — modelo de validação de credencial do b-security-suite
-- (Testar validade), adaptado ao Z-Sec:
--   * caminho automático: aplicação cadastrada que casa a URL → 1 login;
--     senão, colaborador → diretório (Microsoft Graph, SEM enviar a senha);
--   * "Confirmar no Entra" (ROPC) só depois de o diretório dar "exposta", por
--     clique explícito e no máximo 1 tentativa por conta a cada 24 h;
--   * 6 resultados com severidade, histórico de toda tentativa e abertura
--     automática de incidente quando a credencial é confirmada.

-- 1) Resultados ────────────────────────────────────────────────────────────
--   valida             login aceito / senha confirmada (crítica)
--   valida_sem_acesso  senha aceita, mas sem acesso efetivo ao sistema (alta)
--   exposta            diretório: conta ativa e senha não trocada desde o vazamento
--   mitigada           diretório: senha trocada depois / conta desativada
--   invalida           credencial rejeitada
--   inconclusiva       não deu para concluir (config do alvo, rede, federada…)
ALTER TABLE public.leakradar_leaks DROP CONSTRAINT IF EXISTS leakradar_leaks_validation_status_check;
ALTER TABLE public.leakradar_leaks
  ADD CONSTRAINT leakradar_leaks_validation_status_check CHECK (
    validation_status IN ('valida', 'valida_sem_acesso', 'exposta', 'mitigada', 'invalida', 'inconclusiva')
  ),
  ADD COLUMN IF NOT EXISTS validation_severity text
    CHECK (validation_severity IN ('critica', 'alta', 'baixa'));

-- 2) Histórico de toda tentativa (quem, como, resultado, detalhes técnicos).
-- Nunca guarda senha nem o corpo enviado — só o veredito e o diagnóstico
-- (status, Location, Allow, trecho da resposta).
CREATE TABLE IF NOT EXISTS public.leakradar_validation_results (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  leak_id     uuid REFERENCES public.leakradar_leaks (id) ON DELETE CASCADE,
  subject     text NOT NULL,
  url_host    text,
  method      text NOT NULL CHECK (method IN ('diretorio', 'entra_ropc', 'aplicacao', 'manual')),
  app_id      uuid REFERENCES public.leakradar_apps (id) ON DELETE SET NULL,
  status      text NOT NULL
    CHECK (status IN ('valida', 'valida_sem_acesso', 'exposta', 'mitigada', 'invalida', 'inconclusiva')),
  severity    text CHECK (severity IN ('critica', 'alta', 'baixa')),
  summary     text NOT NULL,
  details     jsonb NOT NULL DEFAULT '{}'::jsonb,
  tested_by   uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  tested_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_leakradar_validation_results_leak
  ON public.leakradar_validation_results (leak_id, tested_at DESC);
CREATE INDEX IF NOT EXISTS idx_leakradar_validation_results_ropc
  ON public.leakradar_validation_results (lower(subject), tested_at DESC) WHERE method = 'entra_ropc';

GRANT SELECT ON public.leakradar_validation_results TO authenticated;
ALTER TABLE public.leakradar_validation_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leakradar_validation_results FORCE ROW LEVEL SECURITY;
-- Leitura para quem vê o módulo; escrita só pelo servidor (service role).
CREATE POLICY "threat intel view validation results by permission"
  ON public.leakradar_validation_results
  FOR SELECT TO authenticated
  USING (public.has_module_permission(auth.uid(), 'threat-intel'::text, 'view'::text));

-- 3) Aplicações: regras do b-sec ─────────────────────────────────────────────
--   url_match        padrões que casam a URL do vazamento (um por linha ou "|",
--                    * como curinga, esquema ignorado). Vazio = o próprio host.
--   http_basic       login por Authorization: Basic (GET).
--   success_type     + redirect (3xx, Location contém), header, cookie.
--   success_json_equals  json_field passa a comparar com um valor (vazio =
--                    só presença, como antes).
--   failure_contains texto no corpo que força "inválida" (API que responde 200
--                    mesmo em falha).
--   has_lockout      a aplicação bloqueia conta após tentativas (aviso na tela).
ALTER TABLE public.leakradar_apps DROP CONSTRAINT IF EXISTS leakradar_apps_method_check;
ALTER TABLE public.leakradar_apps
  ADD CONSTRAINT leakradar_apps_method_check CHECK (method IN ('http_form', 'http_json', 'http_basic'));
ALTER TABLE public.leakradar_apps DROP CONSTRAINT IF EXISTS leakradar_apps_success_type_check;
ALTER TABLE public.leakradar_apps
  ADD CONSTRAINT leakradar_apps_success_type_check CHECK (
    success_type IN ('status', 'redirect', 'body_contains', 'body_not_contains', 'json_field', 'header', 'cookie')
  );
ALTER TABLE public.leakradar_apps
  ADD COLUMN IF NOT EXISTS url_match text,
  ADD COLUMN IF NOT EXISTS success_json_equals text,
  ADD COLUMN IF NOT EXISTS failure_contains text,
  ADD COLUMN IF NOT EXISTS has_lockout boolean NOT NULL DEFAULT true;

-- 4) Permissão de testar ────────────────────────────────────────────────────
-- Além dela, o servidor exige perfil global admin/super admin (sem amarrar a
-- um departamento). Sem backfill: admin global já passa no has_module_permission.
INSERT INTO public.module_permissions (module_slug, action, label, description, sort_order) VALUES
  ('threat-intel', 'manage_test_credential', 'Testar validade',
   'Permite testar se uma credencial vazada ainda funciona (diretório via Graph, login único em aplicação cadastrada e confirmação no Entra). Também exige perfil admin/super admin.', 4)
ON CONFLICT DO NOTHING;
