-- Módulo Threat Intelligence — Fase 1: credenciais vazadas (LeakRadar).
-- Coleta própria (leakradar.server.ts / api/public/hooks/leakradar-sync.ts),
-- mesmo padrão do DLP: rota TanStack Start chamada pelo pg_cron.
--
-- A SENHA NUNCA É GRAVADA. A API devolve a senha em texto puro para itens
-- desbloqueados; o código descarta esse campo antes de montar a linha. O
-- tratamento (forçar troca) não precisa dela, e uma tabela com senhas reais
-- seria o dado mais sensível do sistema. Só a força (password_strength) fica.

CREATE TABLE public.leakradar_leaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- id do LeakRadar (só vem em plano com domain_search). Um mesmo vazamento
  -- pode aparecer em mais de uma categoria, por isso a chave é o par.
  leak_id text NOT NULL,
  category text NOT NULL CHECK (category IN ('employees', 'customers', 'third_parties')),
  domain text NOT NULL,
  -- mascarado enquanto o item não for desbloqueado
  username text,
  is_email boolean,
  url text,
  url_host text,
  -- escala do LeakRadar: 0-2 muito fraca, 3-4 fraca, 5-7 média, 8+ forte
  password_strength integer,
  unlocked boolean NOT NULL DEFAULT false,
  added_at timestamptz,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  -- tratamento interno; a coleta nunca sobrescreve estes campos
  status text NOT NULL DEFAULT 'novo'
    CHECK (status IN ('novo', 'em_tratamento', 'resolvido', 'risco_aceito', 'falso_positivo')),
  status_updated_at timestamptz,
  status_updated_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  notes text,
  UNIQUE (leak_id, category)
);

CREATE INDEX idx_leakradar_leaks_added_at ON public.leakradar_leaks (added_at DESC);
CREATE INDEX idx_leakradar_leaks_category_status ON public.leakradar_leaks (category, status);

GRANT SELECT ON public.leakradar_leaks TO authenticated;
GRANT ALL ON public.leakradar_leaks TO service_role;

ALTER TABLE public.leakradar_leaks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leakradar_leaks FORCE ROW LEVEL SECURITY;

CREATE POLICY "threat intel view leaks by permission" ON public.leakradar_leaks
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_module_admin(auth.uid(), 'threat-intel'::text)
    OR public.has_module_permission(auth.uid(), 'threat-intel'::text, 'view'::text)
  );

-- Escrita só pelo servidor: coleta (cron) e as ações da tela, que checam a
-- permissão antes (leakradar.functions.ts). A service_role já ignora a RLS;
-- a política existe para o scanner do CI ver a escrita coberta, e checa o
-- papel em vez de USING (true), que ele acusa como tautologia (RLS-025).
CREATE POLICY "service role write leakradar leaks" ON public.leakradar_leaks
  FOR ALL TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Estado da última coleta. Linha única. `totals` guarda, por domínio e
-- categoria, o total que a API informou (inclusive o que passou do limite de
-- páginas da coleta); `report` guarda o relatório do domínio (contagens e
-- força das senhas por categoria).
CREATE TABLE public.leakradar_sync_state (
  id text PRIMARY KEY DEFAULT 'leakradar',
  last_sync_at timestamptz,
  totals jsonb,
  report jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.leakradar_sync_state TO authenticated;
GRANT ALL ON public.leakradar_sync_state TO service_role;

ALTER TABLE public.leakradar_sync_state ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leakradar_sync_state FORCE ROW LEVEL SECURITY;

CREATE POLICY "threat intel view sync state by permission" ON public.leakradar_sync_state
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_module_admin(auth.uid(), 'threat-intel'::text)
    OR public.has_module_permission(auth.uid(), 'threat-intel'::text, 'view'::text)
  );

CREATE POLICY "service role write leakradar sync state" ON public.leakradar_sync_state
  FOR ALL TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Permissões do módulo. "execute" é separado de "edit" porque desbloquear
-- consome pontos pagos do LeakRadar.
INSERT INTO public.module_permissions (module_slug, action, label, sort_order, description) VALUES
  ('threat-intel', 'view', 'Visualizar', 1, 'Visualizar credenciais vazadas (LeakRadar)'),
  ('threat-intel', 'edit', 'Tratar', 2, 'Alterar status e anotações das credenciais vazadas'),
  ('threat-intel', 'execute', 'Desbloquear', 3, 'Desbloquear credenciais no LeakRadar (consome pontos)')
ON CONFLICT (module_slug, action) DO NOTHING;

INSERT INTO public.module_admins (user_id, module_slug, granted_by)
SELECT ur.user_id, 'threat-intel', ur.user_id
FROM public.user_roles ur
WHERE ur.role = 'admin'
ON CONFLICT (user_id, module_slug) DO NOTHING;

INSERT INTO public.user_module_permissions (user_id, module_slug, action, granted_by)
SELECT ur.user_id, 'threat-intel', mp.action, ur.user_id
FROM public.user_roles ur
CROSS JOIN public.module_permissions mp
WHERE ur.role = 'admin' AND mp.module_slug = 'threat-intel'
ON CONFLICT (user_id, module_slug, action) DO NOTHING;

-- Cron: só o registro de rastreamento, desligado. Ativar na tela Cron Jobs
-- agenda no pg_cron com a URL do APP_URL atual (schedule_hook_cron), sem
-- domínio fixo nesta migração. Diário (1440 min = 10h UTC).
INSERT INTO public.cron_job_runs (job_name, label, expected_interval_minutes, hook_path, enabled)
VALUES ('leakradar-sync', 'Threat Intel — Coleta de credenciais vazadas (LeakRadar)', 1440, '/api/public/hooks/leakradar-sync', false)
ON CONFLICT (job_name) DO NOTHING;
