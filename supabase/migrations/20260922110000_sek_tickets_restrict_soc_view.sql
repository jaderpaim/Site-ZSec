-- sek_tickets nasceu (20260922100000) com "mesmo público de qradar_offenses"
-- só no comentário -- a policy ficou com USING(true) puro, sem checar role
-- nem permissão de módulo, liberando leitura (incluindo raw_payload e
-- parsed_alert) pra qualquer usuário autenticado. Alinha com o padrão real
-- de qradar_offenses (20260703120000_rbac_viewer_access_soc_ia.sql).
DROP POLICY IF EXISTS "authenticated can read sek tickets" ON public.sek_tickets;
CREATE POLICY "soc viewer view sek tickets" ON public.sek_tickets
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    public.has_role(auth.uid(), 'analista'::app_role) OR
    public.has_module_permission(auth.uid(), 'soc', 'view')
  );
