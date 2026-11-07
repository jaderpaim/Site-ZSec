-- Cloudflare WAF — proteção do DNS contra exclusão (inclusive em massa).
-- Portado do b-security-suite (migrations 20261027120000 a 20261105130000),
-- consolidado numa só. Três camadas:
--   1) Solicitação de exclusão: a lixeira em Registros DNS cria um pedido com
--      justificativa; só sai da Cloudflare quando OUTRA pessoa (admin) confirma.
--      Exceção de aprovação: admin libera, para outro usuário, uma janela
--      (até 24 h / 200 exclusões) em que as exclusões dele acontecem na hora.
--   2) Monitoramento do log de auditoria da conta (cron a cada 5 min): alerta
--      exclusão/criação fora do fluxo, volume anormal, host crítico alterado etc.
--   3) Backup diário de todos os registros DNS de cada zona (tabela + arquivo
--      BIND num bucket privado) com comparação e restauração pela tela.
-- Todas as tabelas: RLS ligado e SEM policy — acesso só pelo servidor
-- (service role, que tem BYPASSRLS), via server functions com checagem de
-- permissão. Mesma convenção de 20261015210000.

-- ── 1) Solicitações de exclusão ─────────────────────────────────────────────
CREATE TABLE public.cloudflare_dns_delete_requests (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id            text NOT NULL,
  zone_name          text,
  record_id          text NOT NULL,
  record_snapshot    jsonb NOT NULL,           -- estado do registro no momento do pedido
  justification      text NOT NULL CHECK (char_length(btrim(justification)) >= 20),
  status             text NOT NULL DEFAULT 'pending'
                       CHECK (status IN ('pending','approved','rejected','cancelled','failed')),
  requested_by       uuid,
  requested_by_email text,
  decided_by         uuid,
  decided_by_email   text,
  decided_at         timestamptz,
  decision_reason    text,
  error              text,
  created_at         timestamptz NOT NULL DEFAULT now()
);
-- No máximo um pedido pendente por registro.
CREATE UNIQUE INDEX cloudflare_dns_delete_requests_one_pending
  ON public.cloudflare_dns_delete_requests (zone_id, record_id) WHERE status = 'pending';
CREATE INDEX cloudflare_dns_delete_requests_zone_status
  ON public.cloudflare_dns_delete_requests (zone_id, status, created_at DESC);
CREATE INDEX cloudflare_dns_delete_requests_record
  ON public.cloudflare_dns_delete_requests (record_id, decided_at);
ALTER TABLE public.cloudflare_dns_delete_requests ENABLE ROW LEVEL SECURITY;

-- ── 2) Monitoramento ────────────────────────────────────────────────────────
CREATE TABLE public.cloudflare_audit_alerts (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id             text,
  zone_id                text,
  zone_name              text,
  severity               text NOT NULL CHECK (severity IN ('critical','warning','info')),
  rule                   text NOT NULL,
  title                  text NOT NULL,
  details                jsonb,
  dedup_key              text,
  created_at             timestamptz NOT NULL DEFAULT now(),
  acknowledged_at        timestamptz,
  acknowledged_by        uuid,
  acknowledged_by_email  text
);
CREATE UNIQUE INDEX cloudflare_audit_alerts_dedup ON public.cloudflare_audit_alerts (dedup_key) WHERE dedup_key IS NOT NULL;
CREATE INDEX cloudflare_audit_alerts_created ON public.cloudflare_audit_alerts (created_at DESC);
ALTER TABLE public.cloudflare_audit_alerts ENABLE ROW LEVEL SECURITY;

-- Cursor por conta: até onde o log de auditoria já foi lido. ignored_*: contagem
-- do dia das alterações automáticas de certificado (_acme-challenge etc.), que
-- não geram alerta nem contam pro volume.
CREATE TABLE public.cloudflare_audit_watch_state (
  account_id     text PRIMARY KEY,
  last_event_at  timestamptz,
  last_run_at    timestamptz,
  last_ok_at     timestamptz,
  last_error     text,
  ignored_day    date,
  ignored_count  integer NOT NULL DEFAULT 0,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cloudflare_audit_watch_state ENABLE ROW LEVEL SECURITY;

-- Configuração dos alertas (linha única, editada por admin na tela).
CREATE TABLE public.cloudflare_guard_settings (
  id                   integer PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  delete_window_min    integer NOT NULL DEFAULT 10 CHECK (delete_window_min BETWEEN 1 AND 1440),
  delete_threshold     integer NOT NULL DEFAULT 3  CHECK (delete_threshold BETWEEN 1 AND 1000),
  change_window_min    integer NOT NULL DEFAULT 10 CHECK (change_window_min BETWEEN 1 AND 1440),
  change_threshold     integer NOT NULL DEFAULT 15 CHECK (change_threshold BETWEEN 1 AND 1000),
  -- Criação de DNS: sensível fora do fluxo → crítico; qualquer outra fora do
  -- fluxo → atenção (create_outside_flow); volume na janela → atenção.
  create_window_min    integer NOT NULL DEFAULT 10 CHECK (create_window_min BETWEEN 1 AND 1440),
  create_threshold     integer NOT NULL DEFAULT 10 CHECK (create_threshold BETWEEN 1 AND 1000),
  create_outside_flow  boolean NOT NULL DEFAULT true,
  critical_hosts       text[]  NOT NULL DEFAULT '{}',
  updated_by           uuid,
  updated_at           timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.cloudflare_guard_settings (id) VALUES (1) ON CONFLICT DO NOTHING;
ALTER TABLE public.cloudflare_guard_settings ENABLE ROW LEVEL SECURITY;

-- Limite de volume por usuário (contado no servidor).
CREATE TABLE public.cloudflare_rate_events (
  id          bigserial PRIMARY KEY,
  user_id     uuid NOT NULL,
  action      text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX cloudflare_rate_events_lookup ON public.cloudflare_rate_events (user_id, action, created_at DESC);
ALTER TABLE public.cloudflare_rate_events ENABLE ROW LEVEL SECURITY;

-- ── 3) Backups ──────────────────────────────────────────────────────────────
CREATE TABLE public.cloudflare_dns_snapshots (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  zone_id       text NOT NULL,
  zone_name     text,
  kind          text NOT NULL CHECK (kind IN ('daily','manual','pre_delete','pre_restore')),
  taken_at      timestamptz NOT NULL DEFAULT now(),
  record_count  integer NOT NULL,
  sha256        text NOT NULL,
  records       jsonb NOT NULL,
  storage_path  text,
  created_by    uuid
);
CREATE INDEX cloudflare_dns_snapshots_zone ON public.cloudflare_dns_snapshots (zone_id, taken_at DESC);
ALTER TABLE public.cloudflare_dns_snapshots ENABLE ROW LEVEL SECURITY;

-- Bucket privado pros arquivos de zona (BIND). Sem policy pra authenticated:
-- ninguém lê nem apaga pelo client; download só por URL assinada do servidor.
INSERT INTO storage.buckets (id, name, public) VALUES ('dns-backups', 'dns-backups', false)
ON CONFLICT (id) DO NOTHING;

-- ── 4) Exceção de aprovação (janela temporária) ─────────────────────────────
CREATE TABLE public.cloudflare_dns_delete_exceptions (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid NOT NULL,
  user_email       text,
  zone_ids         text[] NOT NULL CHECK (cardinality(zone_ids) BETWEEN 1 AND 100),
  zone_names       text[] NOT NULL DEFAULT '{}',
  max_deletes      integer NOT NULL CHECK (max_deletes BETWEEN 1 AND 200),
  used_count       integer NOT NULL DEFAULT 0,
  starts_at        timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  ticket           text,
  justification    text NOT NULL CHECK (char_length(btrim(justification)) >= 20),
  granted_by       uuid NOT NULL,
  granted_by_email text,
  closed_at        timestamptz,
  close_reason     text CHECK (close_reason IN ('expired', 'limit', 'revoked')),
  closed_by        uuid,
  closed_by_email  text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cloudflare_dns_delete_exceptions_used CHECK (used_count BETWEEN 0 AND max_deletes),
  CONSTRAINT cloudflare_dns_delete_exceptions_window
    CHECK (expires_at > starts_at AND expires_at <= starts_at + interval '24 hours'),
  -- Quatro olhos: quem libera não recebe.
  CONSTRAINT cloudflare_dns_delete_exceptions_not_self CHECK (granted_by <> user_id)
);
-- Uma janela aberta por usuário.
CREATE UNIQUE INDEX cloudflare_dns_delete_exceptions_one_open
  ON public.cloudflare_dns_delete_exceptions (user_id) WHERE closed_at IS NULL;
CREATE INDEX cloudflare_dns_delete_exceptions_created
  ON public.cloudflare_dns_delete_exceptions (created_at DESC);
ALTER TABLE public.cloudflare_dns_delete_exceptions ENABLE ROW LEVEL SECURITY;

-- Exclusão por exceção vira um pedido já "approved" ligado à janela: o monitor
-- do log de auditoria casa a exclusão com ele como faz com os pedidos normais.
-- snapshot_id: a cópia (kind pre_delete) gravada logo antes de apagar, usada
-- pra restaurar. restored_*: quem restaurou e quando.
ALTER TABLE public.cloudflare_dns_delete_requests
  ADD COLUMN exception_id uuid REFERENCES public.cloudflare_dns_delete_exceptions (id),
  ADD COLUMN snapshot_id uuid REFERENCES public.cloudflare_dns_snapshots (id) ON DELETE SET NULL,
  ADD COLUMN restored_at timestamptz,
  ADD COLUMN restored_by uuid,
  ADD COLUMN restored_by_email text;
CREATE INDEX cloudflare_dns_delete_requests_exception
  ON public.cloudflare_dns_delete_requests (exception_id) WHERE exception_id IS NOT NULL;
CREATE INDEX cloudflare_dns_delete_requests_snapshot
  ON public.cloudflare_dns_delete_requests (snapshot_id) WHERE snapshot_id IS NOT NULL;

-- Consumo atômico de uma exclusão da janela (evita passar do limite com
-- cliques em paralelo). Devolve o número desta exclusão, ou NULL se a janela
-- não vale (fechada, vencida, sem saldo, de outro usuário ou outra zona).
CREATE OR REPLACE FUNCTION public.cloudflare_dns_exception_consume(_id uuid, _user_id uuid, _zone_id text)
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.cloudflare_dns_delete_exceptions
     SET used_count = used_count + 1
   WHERE id = _id
     AND user_id = _user_id
     AND closed_at IS NULL
     AND now() < expires_at
     AND used_count < max_deletes
     AND _zone_id = ANY (zone_ids)
  RETURNING used_count;
$$;

-- Devolve uma exclusão consumida quando a Cloudflare recusou a exclusão.
CREATE OR REPLACE FUNCTION public.cloudflare_dns_exception_refund(_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.cloudflare_dns_delete_exceptions
     SET used_count = GREATEST(used_count - 1, 0)
   WHERE id = _id;
$$;

REVOKE ALL ON FUNCTION public.cloudflare_dns_exception_consume(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cloudflare_dns_exception_refund(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cloudflare_dns_exception_consume(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cloudflare_dns_exception_refund(uuid) TO service_role;

-- ── Permissões ──────────────────────────────────────────────────────────────
INSERT INTO public.module_permissions (module_slug, action, label, description, sort_order) VALUES
  ('cloudflare-waf', 'view_solicitacoes', 'Aba Solicitações',
   'Permite ver a aba Solicitações e acompanhar os próprios pedidos de exclusão de DNS. Os pedidos de todos os usuários ficam visíveis só para admin/super admin.', 43),
  ('cloudflare-waf', 'manage_solicitar_exclusao_dns', 'Gerenciar — Solicitar exclusão de DNS',
   'Permite pedir a exclusão de um registro DNS (com justificativa). O registro só é apagado quando outra pessoa aprovar.', 44),
  ('cloudflare-waf', 'manage_aprovar_exclusao_dns', 'Gerenciar — Aprovar exclusão de DNS',
   'Permite confirmar ou recusar pedidos de exclusão de DNS de outros usuários e remover, direto do alerta de auditoria, um registro criado fora do sistema. Também exige perfil admin/super admin; ninguém decide o próprio pedido.', 45),
  ('cloudflare-waf', 'manage_backups_dns', 'Gerenciar — Backups de DNS',
   'Permite ver e baixar os backups diários de DNS. Restaurar também exige perfil admin/super admin.', 46),
  ('cloudflare-waf', 'manage_importar_dns', 'Gerenciar — Importar DNS',
   'Permite importar registros DNS de um arquivo de zona (BIND). Só adiciona registros, exige justificativa e faz uma cópia da zona antes. Também exige perfil admin/super admin.', 47),
  ('cloudflare-waf', 'manage_liberar_excecao_dns', 'Gerenciar — Liberar exceção de aprovação (DNS)',
   'Permite liberar, por tempo e quantidade limitados, que outro usuário exclua registros DNS na hora, sem pedido de aprovação. Também exige perfil admin/super admin e não vale para si mesmo.', 48)
ON CONFLICT DO NOTHING;

-- Backfill: admin/analista recebem ver a aba, pedir exclusão e ver backups.
-- Aprovar, importar e liberar exceção ficam só com quem recebe explicitamente
-- (admin global já passa pelo has_module_permission, e essas ações exigem o
-- perfil admin/super admin no servidor de qualquer forma).
INSERT INTO public.user_module_permissions (user_id, module_slug, action, granted_by)
SELECT ur.user_id, mp.module_slug, mp.action, ur.user_id
FROM public.user_roles ur
CROSS JOIN public.module_permissions mp
WHERE ur.role IN ('admin','analista')
  AND mp.module_slug = 'cloudflare-waf'
  AND mp.action IN ('view_solicitacoes', 'manage_solicitar_exclusao_dns', 'manage_backups_dns')
ON CONFLICT (user_id, module_slug, action) DO NOTHING;

-- ── Crons ───────────────────────────────────────────────────────────────────
-- Desligados: ativar na tela Cron Jobs, que agenda no pg_cron com o APP_URL
-- desta instância (schedule_hook_cron). O backup roda uma vez por dia (o
-- horário pode ser ajustado lá; sugestão: 06:00 UTC = 03:00 em Brasília).
INSERT INTO public.cron_job_runs (job_name, label, expected_interval_minutes, hook_path, enabled) VALUES
  ('cloudflare-dns-backup', 'Cloudflare — Backup diário de DNS', 1440, '/api/public/hooks/cloudflare-dns-backup', false),
  ('cloudflare-audit-watch', 'Cloudflare — Monitor do log de auditoria', 5, '/api/public/hooks/cloudflare-audit-watch', false)
ON CONFLICT (job_name) DO NOTHING;
