-- Eventos de "Policy Change" do Fortigate (AQL dedicada, sincronizada junto com
-- o restante do pipeline QRadar) — alimenta o quadro "Fortigate" ao lado do
-- quadro de Descarte de Logs no painel SOC.
CREATE TABLE public.qradar_fortigate_policy_changes (
  id text PRIMARY KEY,
  event_time timestamptz NOT NULL,
  log_source_name text,
  username text,
  source_ip text,
  action text,
  event_category text,
  event_name text,
  qid bigint,
  qid_name text,
  message text,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX qradar_fortigate_policy_changes_time_idx ON public.qradar_fortigate_policy_changes(event_time DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qradar_fortigate_policy_changes TO authenticated;
GRANT ALL ON public.qradar_fortigate_policy_changes TO service_role;
ALTER TABLE public.qradar_fortigate_policy_changes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin+analista view qradar fortigate policy changes" ON public.qradar_fortigate_policy_changes FOR SELECT TO authenticated USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role));
CREATE POLICY "analyst+admin write qradar fortigate policy changes" ON public.qradar_fortigate_policy_changes FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role));
