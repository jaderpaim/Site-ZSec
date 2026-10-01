-- Permite que usuários com permissão de visualizador (soc:view, ranking-ia:view)
-- leiam os dados sincronizados sem expor execução de APIs externas.
-- As operações de escrita (sync) continuam exigindo admin/analista.

-- ── SOC: qradar_sync_state ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admin+analista view qradar sync state" ON public.qradar_sync_state;
CREATE POLICY "soc viewer view qradar sync state" ON public.qradar_sync_state
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    public.has_role(auth.uid(), 'analista'::app_role) OR
    public.has_module_permission(auth.uid(), 'soc', 'view')
  );

-- ── SOC: qradar_eps_samples ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "admin+analista view qradar eps samples" ON public.qradar_eps_samples;
CREATE POLICY "soc viewer view qradar eps samples" ON public.qradar_eps_samples
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    public.has_role(auth.uid(), 'analista'::app_role) OR
    public.has_module_permission(auth.uid(), 'soc', 'view')
  );

-- ── SOC: qradar_log_sources ───────────────────────────────────────────────────
DROP POLICY IF EXISTS "admin+analista view qradar log sources" ON public.qradar_log_sources;
CREATE POLICY "soc viewer view qradar log sources" ON public.qradar_log_sources
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    public.has_role(auth.uid(), 'analista'::app_role) OR
    public.has_module_permission(auth.uid(), 'soc', 'view') OR
    public.has_module_permission(auth.uid(), 'cmdb', 'view')
  );

-- ── SOC: qradar_offenses ──────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admin/analista view qradar offenses" ON public.qradar_offenses;
CREATE POLICY "soc viewer view qradar offenses" ON public.qradar_offenses
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    public.has_role(auth.uid(), 'analista'::app_role) OR
    public.has_module_permission(auth.uid(), 'soc', 'view')
  );

-- ── SOC: qradar_rdp_events ────────────────────────────────────────────────────
DROP POLICY IF EXISTS "admin/analista view qradar rdp events" ON public.qradar_rdp_events;
CREATE POLICY "soc viewer view qradar rdp events" ON public.qradar_rdp_events
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    public.has_role(auth.uid(), 'analista'::app_role) OR
    public.has_module_permission(auth.uid(), 'soc', 'view')
  );

-- ── SOC: qradar_fortigate_policy_changes ──────────────────────────────────────
DROP POLICY IF EXISTS "admin+analista view qradar fortigate policy changes" ON public.qradar_fortigate_policy_changes;
CREATE POLICY "soc viewer view qradar fortigate policy changes" ON public.qradar_fortigate_policy_changes
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    public.has_role(auth.uid(), 'analista'::app_role) OR
    public.has_module_permission(auth.uid(), 'soc', 'view')
  );

-- ── Ranking IA: ia_web_events ─────────────────────────────────────────────────
DROP POLICY IF EXISTS "admin/analista view ia web events" ON public.ia_web_events;
CREATE POLICY "ranking-ia viewer view ia web events" ON public.ia_web_events
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    public.has_role(auth.uid(), 'analista'::app_role) OR
    public.has_module_permission(auth.uid(), 'ranking-ia', 'view')
  );
