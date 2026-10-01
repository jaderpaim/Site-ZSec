-- cloudflare_firewall_events e sophos_licenses ficaram pra trás quando as
-- tabelas irmãs foram endurecidas: cloudflare_zones/dns_records/sync_state
-- (20260615231015) e sophos_endpoints/alerts/events/policies (20260615224117)
-- passaram a exigir admin/analista, mas essas duas continuaram com
-- USING(true) -- qualquer autenticado lia (IP/país/user-agent de cada evento
-- de firewall, ou contagem de licenças).
--
-- Diferente das irmãs, essas duas também são lidas via permissão granular de
-- módulo (view / view_analytics_http / view_analytics_security em
-- cloudflare-waf, view em sophos-xdr -- ver requirePermission() em
-- cloudflare.functions.ts / sophos.functions.ts), concedida por padrão ao
-- perfil "visualizador" em apply_role_defaults() (20260526004057). Por isso a
-- policy não pode ser só has_role(admin/analista) como nas irmãs -- isso
-- quebraria o visualizador que hoje enxerga esses dashboards.

DROP POLICY IF EXISTS "auth view cf fw" ON public.cloudflare_firewall_events;
CREATE POLICY "admin+analista+viewer read cf firewall events" ON public.cloudflare_firewall_events
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    public.has_role(auth.uid(), 'analista'::app_role) OR
    public.has_module_permission(auth.uid(), 'cloudflare-waf', 'view') OR
    public.has_module_permission(auth.uid(), 'cloudflare-waf', 'view_analytics_http') OR
    public.has_module_permission(auth.uid(), 'cloudflare-waf', 'view_analytics_security')
  );

DROP POLICY IF EXISTS "auth view sophos licenses" ON public.sophos_licenses;
CREATE POLICY "admin+analista+viewer read sophos licenses" ON public.sophos_licenses
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    public.has_role(auth.uid(), 'analista'::app_role) OR
    public.has_module_permission(auth.uid(), 'sophos-xdr', 'view')
  );
