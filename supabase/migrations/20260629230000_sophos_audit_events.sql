-- Sophos Audit Log (ações administrativas: login, mudança de política,
-- criação de service principal, etc.) — descoberto via GET
-- https://api.central.sophos.com/audit/v1/audit-events?startDate=...&endDate=...
-- usando uma credencial separada (role "Service Principal Audit Log" no
-- Sophos Central), diferente da credencial usada para alertas/eventos/
-- endpoints/políticas. Por isso o sync e o cron são independentes do
-- sophos-sync principal.
CREATE TABLE public.sophos_audit_events (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  occurred_at timestamptz,
  modified_by text,
  item_type text,
  item_modified text,
  description text,
  origin_ip_address text,
  resource_owner_id text,
  resource_owner_type text,
  modifier_type text,
  modifier_account_id text,
  modifier_account_type text,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sophos_audit_events_tenant ON public.sophos_audit_events(tenant_id);
CREATE INDEX idx_sophos_audit_events_occurred ON public.sophos_audit_events(occurred_at DESC);
CREATE INDEX idx_sophos_audit_events_description ON public.sophos_audit_events(description);
ALTER TABLE public.sophos_audit_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth view sophos audit events" ON public.sophos_audit_events FOR SELECT TO authenticated USING (true);
CREATE POLICY "analyst+admin write sophos audit events" ON public.sophos_audit_events FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role));

-- Cursor de sincronização incremental (igual ao padrão de last_alerts_raised_at)
ALTER TABLE public.sophos_sync_state
  ADD COLUMN IF NOT EXISTS last_audit_synced_at timestamptz;
