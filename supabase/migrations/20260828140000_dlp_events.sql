-- Módulo DLP (Microsoft Purview) — Fase 1: eventos/alertas.
-- Eventos DLP.All coletados via Office 365 Management Activity API (Unified
-- Audit Log) — cada linha é um evento em que um conteúdo bateu (matched) uma
-- política/regra DLP configurada no Purview. Sincronização própria (ver
-- dlp.server.ts / api/public/hooks/dlp-sync.ts), não usa Edge Function como o
-- guia original sugeria -- este repo não tem esse padrão (ver cmdb-dns-cache-
-- refresh.ts / privacy-tools-sync para o equivalente real: rota TanStack Start
-- chamada por pg_cron via net.http_post).

CREATE TABLE public.dlp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  microsoft_event_id text NOT NULL UNIQUE,
  creation_time timestamptz,
  collected_at timestamptz NOT NULL DEFAULT now(),
  operation text,
  workload text,
  user_id text,
  client_ip text,
  policy_name text,
  rule_name text,
  sensitive_info jsonb,
  file_name text,
  file_url text,
  raw_event jsonb NOT NULL,
  status text NOT NULL DEFAULT 'novo'
);

CREATE INDEX idx_dlp_events_creation_time ON public.dlp_events (creation_time DESC);
CREATE INDEX idx_dlp_events_policy_rule ON public.dlp_events (policy_name, rule_name);

GRANT SELECT ON public.dlp_events TO authenticated;
GRANT ALL ON public.dlp_events TO service_role;

ALTER TABLE public.dlp_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dlp view events by permission" ON public.dlp_events
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_module_admin(auth.uid(), 'dlp'::text)
    OR public.has_module_permission(auth.uid(), 'dlp'::text, 'view'::text)
  );

CREATE POLICY "service role write dlp events" ON public.dlp_events
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

-- Checkpoint de coleta (equivalente ao "integration_checkpoint" do guia,
-- nomeado ao módulo pra seguir a convenção dlp_*/shadowit_* do repo). Linha
-- única, id fixo -- não precisa de FK/histórico, só a marca d'água da última
-- janela [startTime,endTime) já consultada na Management Activity API.
CREATE TABLE public.dlp_sync_state (
  id text PRIMARY KEY DEFAULT 'purview_dlp',
  last_collection timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.dlp_sync_state TO authenticated;
GRANT ALL ON public.dlp_sync_state TO service_role;

ALTER TABLE public.dlp_sync_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dlp view sync state by permission" ON public.dlp_sync_state
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_module_admin(auth.uid(), 'dlp'::text)
    OR public.has_module_permission(auth.uid(), 'dlp'::text, 'view'::text)
  );

CREATE POLICY "service role write dlp sync state" ON public.dlp_sync_state
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);

INSERT INTO public.cron_job_runs (job_name, label, expected_interval_minutes, hook_path)
VALUES ('dlp-sync', 'DLP — Sincronização de Eventos (Purview)', 5, '/api/public/hooks/dlp-sync')
ON CONFLICT (job_name) DO NOTHING;
