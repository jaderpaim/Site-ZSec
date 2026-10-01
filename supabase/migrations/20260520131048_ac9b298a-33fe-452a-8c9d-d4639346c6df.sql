
-- sophos_endpoints
CREATE TABLE public.sophos_endpoints (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  hostname text,
  type text,
  os_platform text,
  health_overall text,
  online boolean,
  encrypted boolean,
  last_seen_at timestamptz,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sophos_endpoints_tenant ON public.sophos_endpoints(tenant_id);
CREATE INDEX idx_sophos_endpoints_type ON public.sophos_endpoints(type);
ALTER TABLE public.sophos_endpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth view sophos endpoints" ON public.sophos_endpoints FOR SELECT TO authenticated USING (true);
CREATE POLICY "analyst+admin write sophos endpoints" ON public.sophos_endpoints FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role));

-- sophos_alerts
CREATE TABLE public.sophos_alerts (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  raised_at timestamptz,
  severity text,
  category text,
  type text,
  description text,
  product text,
  managed_agent_name text,
  person_name text,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sophos_alerts_tenant ON public.sophos_alerts(tenant_id);
CREATE INDEX idx_sophos_alerts_raised ON public.sophos_alerts(raised_at DESC);
ALTER TABLE public.sophos_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth view sophos alerts" ON public.sophos_alerts FOR SELECT TO authenticated USING (true);
CREATE POLICY "analyst+admin write sophos alerts" ON public.sophos_alerts FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role));

-- sophos_events
CREATE TABLE public.sophos_events (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  event_at timestamptz,
  severity text,
  type text,
  name text,
  endpoint_id text,
  endpoint_name text,
  user_name text,
  source text,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sophos_events_tenant ON public.sophos_events(tenant_id);
CREATE INDEX idx_sophos_events_at ON public.sophos_events(event_at DESC);
CREATE INDEX idx_sophos_events_type ON public.sophos_events(type);
ALTER TABLE public.sophos_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth view sophos events" ON public.sophos_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "analyst+admin write sophos events" ON public.sophos_events FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role));

-- sophos_policies
CREATE TABLE public.sophos_policies (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  name text,
  policy_type text,  -- 'endpoint' | 'server'
  assigned_count integer NOT NULL DEFAULT 0,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sophos_policies_tenant ON public.sophos_policies(tenant_id);
CREATE INDEX idx_sophos_policies_type ON public.sophos_policies(policy_type);
ALTER TABLE public.sophos_policies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth view sophos policies" ON public.sophos_policies FOR SELECT TO authenticated USING (true);
CREATE POLICY "analyst+admin write sophos policies" ON public.sophos_policies FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role));

-- sophos_sync_state
CREATE TABLE public.sophos_sync_state (
  tenant_id text PRIMARY KEY,
  last_full_sync_at timestamptz,
  last_alerts_cursor text,
  last_events_cursor text,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.sophos_sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth view sophos sync state" ON public.sophos_sync_state FOR SELECT TO authenticated USING (true);
CREATE POLICY "analyst+admin write sophos sync state" ON public.sophos_sync_state FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role));
