-- Threat Intelligence — portado do b-security-suite (20261009120000,
-- 20261027100000 e 20261030100000), adaptado ao modelo do Z-Sec.
--
-- 1) Validação contra aplicação própria (leakradar_apps):
--   prime_url               página (GET) que emite os cookies de sessão/CSRF
--                           (ex.: XSRF-TOKEN) antes do POST de login. Vazio =
--                           origem do login_url. Mesmo host, https.
--   post_login_url          2º estágio opcional: depois do login aceito, UM GET
--                           nesta URL (template com {id}) com os cookies da
--                           sessão, para saber se o usuário tem ACESSO efetivo
--                           (ex.: senha certa mas "Sem perfil associado").
--   id_field                caminho JSON do id no corpo do login (vazio = auto).
--   access_failure_contains texto no 2º response/redirect que indica SEM acesso.
--   access_success_contains texto que confirma acesso (vence o de falha).
--   O teste http+https do b-sec (try_both_schemes) não entra: aqui o login é
--   sempre https (assertPublicHttpsUrl).
ALTER TABLE public.leakradar_apps
  ADD COLUMN IF NOT EXISTS prime_url text,
  ADD COLUMN IF NOT EXISTS post_login_url text,
  ADD COLUMN IF NOT EXISTS id_field text,
  ADD COLUMN IF NOT EXISTS access_failure_contains text,
  ADD COLUMN IF NOT EXISTS access_success_contains text;

-- 2) Pico de credenciais por domínio de parceiro (cron; desligado — ativar na
--    tela Cron Jobs). Calculado sobre leakradar_leaks; alerta no Teams pelo
--    módulo de Alertas (threat_intel_domain_spike), no máximo 1 por domínio/dia.
INSERT INTO public.cron_job_runs (job_name, label, expected_interval_minutes, hook_path, enabled)
VALUES ('cti-spike-sweep', 'Threat Intel — Pico de credenciais por domínio', 60, '/api/public/hooks/cti-spike-sweep', false)
ON CONFLICT (job_name) DO NOTHING;
