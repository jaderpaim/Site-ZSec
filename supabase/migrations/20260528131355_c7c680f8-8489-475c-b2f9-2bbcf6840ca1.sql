
-- qradar_sync_state (singleton)
CREATE TABLE public.qradar_sync_state (
  id boolean PRIMARY KEY DEFAULT true,
  last_offenses_sync timestamptz,
  last_events_sync timestamptz,
  last_log_sources_sync timestamptz,
  last_eps_sample_at timestamptz,
  last_full_sync_at timestamptz,
  last_error text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT singleton_chk CHECK (id = true)
);
GRANT SELECT, INSERT, UPDATE ON public.qradar_sync_state TO authenticated;
GRANT ALL ON public.qradar_sync_state TO service_role;
ALTER TABLE public.qradar_sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth view qradar sync state" ON public.qradar_sync_state FOR SELECT TO authenticated USING (true);
CREATE POLICY "analyst+admin write qradar sync state" ON public.qradar_sync_state FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role));

-- qradar_log_sources
CREATE TABLE public.qradar_log_sources (
  id bigint PRIMARY KEY,
  name text NOT NULL,
  type_name text,
  enabled boolean DEFAULT true,
  status text NOT NULL DEFAULT 'success',
  last_event_time timestamptz,
  avg_eps numeric,
  peak_eps numeric,
  synced_at timestamptz NOT NULL DEFAULT now(),
  raw jsonb
);
CREATE INDEX qradar_log_sources_status_idx ON public.qradar_log_sources(status);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qradar_log_sources TO authenticated;
GRANT ALL ON public.qradar_log_sources TO service_role;
ALTER TABLE public.qradar_log_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth view qradar log sources" ON public.qradar_log_sources FOR SELECT TO authenticated USING (true);
CREATE POLICY "analyst+admin write qradar log sources" ON public.qradar_log_sources FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role));

-- qradar_eps_samples
CREATE TABLE public.qradar_eps_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sampled_at timestamptz NOT NULL DEFAULT now(),
  total_eps numeric NOT NULL,
  licensed_eps integer NOT NULL DEFAULT 1500,
  raw jsonb
);
CREATE INDEX qradar_eps_samples_sampled_at_idx ON public.qradar_eps_samples(sampled_at DESC);
GRANT SELECT, INSERT, DELETE ON public.qradar_eps_samples TO authenticated;
GRANT ALL ON public.qradar_eps_samples TO service_role;
ALTER TABLE public.qradar_eps_samples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth view qradar eps samples" ON public.qradar_eps_samples FOR SELECT TO authenticated USING (true);
CREATE POLICY "analyst+admin write qradar eps samples" ON public.qradar_eps_samples FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role));

-- qradar_offenses
CREATE TABLE public.qradar_offenses (
  id bigint PRIMARY KEY,
  description text,
  magnitude integer,
  severity integer,
  source_ip text,
  destination_ip text,
  username text,
  event_count bigint,
  start_time timestamptz,
  last_updated_time timestamptz,
  status text,
  closed_at timestamptz,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX qradar_offenses_last_updated_idx ON public.qradar_offenses(last_updated_time DESC);
CREATE INDEX qradar_offenses_source_idx ON public.qradar_offenses(source_ip);
CREATE INDEX qradar_offenses_dest_idx ON public.qradar_offenses(destination_ip);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qradar_offenses TO authenticated;
GRANT ALL ON public.qradar_offenses TO service_role;
ALTER TABLE public.qradar_offenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth view qradar offenses" ON public.qradar_offenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "analyst+admin write qradar offenses" ON public.qradar_offenses FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role));

-- qradar_drop_alerts
CREATE TABLE public.qradar_drop_alerts (
  id text PRIMARY KEY,
  occurred_at timestamptz NOT NULL,
  log_source_id bigint,
  log_source_name text,
  dropped_count bigint,
  reason text,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX qradar_drop_alerts_occurred_idx ON public.qradar_drop_alerts(occurred_at DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qradar_drop_alerts TO authenticated;
GRANT ALL ON public.qradar_drop_alerts TO service_role;
ALTER TABLE public.qradar_drop_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth view qradar drop alerts" ON public.qradar_drop_alerts FOR SELECT TO authenticated USING (true);
CREATE POLICY "analyst+admin write qradar drop alerts" ON public.qradar_drop_alerts FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role));

-- qradar_rdp_events
CREATE TABLE public.qradar_rdp_events (
  id text PRIMARY KEY,
  event_time timestamptz NOT NULL,
  source_ip text,
  destination_ip text,
  username text,
  log_source text,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX qradar_rdp_events_time_idx ON public.qradar_rdp_events(event_time DESC);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qradar_rdp_events TO authenticated;
GRANT ALL ON public.qradar_rdp_events TO service_role;
ALTER TABLE public.qradar_rdp_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth view qradar rdp events" ON public.qradar_rdp_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "analyst+admin write qradar rdp events" ON public.qradar_rdp_events FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role));

-- seed singleton row
INSERT INTO public.qradar_sync_state (id) VALUES (true) ON CONFLICT DO NOTHING;
