-- Cache de resolução DNS reversa (PTR) dos IPs cadastrados no CMDB, via o
-- endpoint /resolve do scanner DAST (única infra com rota até o DNS interno
-- da AD). Usado para cruzar hostname real x Zabbix x CMDB e apontar qual
-- lado está desatualizado. Refresh via cron hook cmdb-dns-cache-refresh.

CREATE TABLE public.cmdb_dns_cache (
  ip text PRIMARY KEY,
  hostname text,
  resolved boolean NOT NULL DEFAULT false,
  reason text CHECK (reason IN ('no_ptr', 'timeout')),
  synced_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.cmdb_dns_cache TO authenticated;
GRANT ALL ON public.cmdb_dns_cache TO service_role;

ALTER TABLE public.cmdb_dns_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cmdb viewer read dns cache" ON public.cmdb_dns_cache
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    public.has_role(auth.uid(), 'analista'::app_role) OR
    public.has_module_permission(auth.uid(), 'cmdb', 'view')
  );

CREATE POLICY "service role write dns cache" ON public.cmdb_dns_cache
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
