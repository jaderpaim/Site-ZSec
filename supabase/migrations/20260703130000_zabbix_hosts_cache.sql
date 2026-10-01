-- Cache de hosts monitorados pelo Zabbix.
-- Permite que visualizadores (cmdb:view) leiam o status sem acionar a API Zabbix.
-- O refresh é feito pelo cron hook zabbix-cache-refresh (admin-only).

CREATE TABLE public.zabbix_hosts_cache (
  id text PRIMARY KEY DEFAULT 'singleton',
  hosts text[] NOT NULL DEFAULT '{}',
  ips text[] NOT NULL DEFAULT '{}',
  unknown_hosts text[] NOT NULL DEFAULT '{}',
  unknown_ips text[] NOT NULL DEFAULT '{}',
  synced_at timestamptz,
  error text
);

-- Seed com row vazio para que sempre exista um registro
INSERT INTO public.zabbix_hosts_cache (id) VALUES ('singleton') ON CONFLICT DO NOTHING;

GRANT SELECT ON public.zabbix_hosts_cache TO authenticated;
GRANT ALL ON public.zabbix_hosts_cache TO service_role;

ALTER TABLE public.zabbix_hosts_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cmdb viewer read zabbix cache" ON public.zabbix_hosts_cache
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    public.has_role(auth.uid(), 'analista'::app_role) OR
    public.has_module_permission(auth.uid(), 'cmdb', 'view')
  );

CREATE POLICY "service role write zabbix cache" ON public.zabbix_hosts_cache
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
