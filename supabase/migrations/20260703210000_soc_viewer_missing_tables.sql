-- Adiciona políticas de leitura para visualizadores do módulo SOC nas tabelas
-- que ficaram de fora de 20260703120000_rbac_viewer_access_soc_ia.sql.
-- Essas tabelas têm apenas políticas admin+analista, impedindo visualizadores
-- de ver: maiores ofensores externos, origens internas, deleção O365,
-- download O365 e drop alerts.

-- ── SOC: qradar_external_offenders ───────────────────────────────────────────
DROP POLICY IF EXISTS "auth view qradar ext off" ON public.qradar_external_offenders;
CREATE POLICY "soc viewer view qradar external offenders" ON public.qradar_external_offenders
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    public.has_role(auth.uid(), 'analista'::app_role) OR
    public.has_module_permission(auth.uid(), 'soc', 'view')
  );

-- ── SOC: qradar_internal_offenders ───────────────────────────────────────────
DROP POLICY IF EXISTS "auth view qradar int off" ON public.qradar_internal_offenders;
CREATE POLICY "soc viewer view qradar internal offenders" ON public.qradar_internal_offenders
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    public.has_role(auth.uid(), 'analista'::app_role) OR
    public.has_module_permission(auth.uid(), 'soc', 'view')
  );

-- ── SOC: qradar_o365_deletions ────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth view qradar o365 del" ON public.qradar_o365_deletions;
CREATE POLICY "soc viewer view qradar o365 deletions" ON public.qradar_o365_deletions
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    public.has_role(auth.uid(), 'analista'::app_role) OR
    public.has_module_permission(auth.uid(), 'soc', 'view')
  );

-- ── SOC: qradar_o365_downloads ────────────────────────────────────────────────
DROP POLICY IF EXISTS "auth view qradar o365 dl" ON public.qradar_o365_downloads;
CREATE POLICY "soc viewer view qradar o365 downloads" ON public.qradar_o365_downloads
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    public.has_role(auth.uid(), 'analista'::app_role) OR
    public.has_module_permission(auth.uid(), 'soc', 'view')
  );

-- ── SOC: qradar_drop_alerts ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "admin+analista view qradar drop alerts" ON public.qradar_drop_alerts;
CREATE POLICY "soc viewer view qradar drop alerts" ON public.qradar_drop_alerts
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    public.has_role(auth.uid(), 'analista'::app_role) OR
    public.has_module_permission(auth.uid(), 'soc', 'view')
  );
