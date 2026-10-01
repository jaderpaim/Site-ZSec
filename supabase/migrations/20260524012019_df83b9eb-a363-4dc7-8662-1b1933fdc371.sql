
-- 1) Zones
CREATE TABLE IF NOT EXISTS public.cloudflare_zones (
  id text PRIMARY KEY,
  name text NOT NULL,
  status text,
  account_id text,
  account_name text,
  paused boolean,
  type text,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cloudflare_zones ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth view cf zones" ON public.cloudflare_zones FOR SELECT TO authenticated USING (true);
CREATE POLICY "analyst+admin write cf zones" ON public.cloudflare_zones FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'analista'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'analista'::app_role));

-- 2) DNS Records
CREATE TABLE IF NOT EXISTS public.cloudflare_dns_records (
  id text PRIMARY KEY,
  zone_id text NOT NULL,
  zone_name text,
  name text NOT NULL,
  type text NOT NULL,
  content text,
  proxied boolean,
  ttl integer,
  comment text,
  tags text[],
  created_on timestamptz,
  modified_on timestamptz,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cf_dns_zone ON public.cloudflare_dns_records(zone_id);
CREATE INDEX IF NOT EXISTS idx_cf_dns_name ON public.cloudflare_dns_records(lower(name));
CREATE INDEX IF NOT EXISTS idx_cf_dns_type ON public.cloudflare_dns_records(type);
ALTER TABLE public.cloudflare_dns_records ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth view cf dns" ON public.cloudflare_dns_records FOR SELECT TO authenticated USING (true);
CREATE POLICY "analyst+admin write cf dns" ON public.cloudflare_dns_records FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'analista'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'analista'::app_role));

-- 3) Firewall Events
CREATE TABLE IF NOT EXISTS public.cloudflare_firewall_events (
  id text PRIMARY KEY,
  zone_id text NOT NULL,
  datetime timestamptz NOT NULL,
  action text,
  client_ip text,
  country text,
  host text,
  path text,
  method text,
  user_agent text,
  rule_id text,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_cf_fw_datetime ON public.cloudflare_firewall_events(datetime DESC);
CREATE INDEX IF NOT EXISTS idx_cf_fw_zone_dt ON public.cloudflare_firewall_events(zone_id, datetime DESC);
CREATE INDEX IF NOT EXISTS idx_cf_fw_action ON public.cloudflare_firewall_events(action);
CREATE INDEX IF NOT EXISTS idx_cf_fw_country ON public.cloudflare_firewall_events(country);
ALTER TABLE public.cloudflare_firewall_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth view cf fw" ON public.cloudflare_firewall_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "analyst+admin write cf fw" ON public.cloudflare_firewall_events FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'analista'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'analista'::app_role));

-- 4) Sync state
CREATE TABLE IF NOT EXISTS public.cloudflare_sync_state (
  account_id text PRIMARY KEY,
  last_zones_synced_at timestamptz,
  last_dns_synced_at timestamptz,
  last_events_at timestamptz,
  last_full_sync_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.cloudflare_sync_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth view cf state" ON public.cloudflare_sync_state FOR SELECT TO authenticated USING (true);
CREATE POLICY "analyst+admin write cf state" ON public.cloudflare_sync_state FOR ALL TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'analista'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'analista'::app_role));

-- 5) Cron job 06:00 UTC (~03h BRT) — chama endpoint público de sync incremental
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('cloudflare-daily-sync');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'cloudflare-daily-sync',
  '0 6 * * *',
  $cron$
  SELECT net.http_post(
    url:='https://project--ad2d9bfd-cf80-4493-9684-3c4d936f53e3.lovable.app/api/public/hooks/cloudflare-sync',
    headers:='{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRjYWNtZXB1aXlvcWt5cGF0a3FhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzg2MTAwNzcsImV4cCI6MjA5NDE4NjA3N30.Xwm_jgXksknSyZHsaONRPYiumfmwuyQncP3KT1q98d4"}'::jsonb,
    body:='{}'::jsonb
  );
  $cron$
);
