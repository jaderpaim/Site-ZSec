-- Domínios de terceiro (analytics/tracking/CDN publica) que o spider do
-- DAST encontrou referenciados nas páginas do alvo mas NÃO rastreou (ver
-- ZAP_THIRD_PARTY_TRACKING_EXCLUDE_REGEX / ZAP_STATIC_ASSET_EXCLUDE_REGEX
-- no main.py do scanner) -- puramente informativo/reconhecimento, nunca
-- vira linha em dast_vulnerabilities (não é achado de vulnerabilidade).
-- Tabela dedicada (não coluna jsonb em dast_scans) de propósito: permite
-- consultar entre scans diferentes quais hosts de terceiro aparecem
-- repetidamente e ainda não estão cobertos pela lista de exclusão, base
-- pra ir curando essa lista ao longo do tempo (decisão com o usuário em
-- 2026-09-22).
CREATE TABLE public.dast_scan_out_of_scope_hosts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  scan_id uuid NOT NULL REFERENCES public.dast_scans(id) ON DELETE CASCADE,
  host text NOT NULL,
  request_count integer NOT NULL DEFAULT 0,
  sample_urls jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_dast_scan_out_of_scope_hosts_scan_id ON public.dast_scan_out_of_scope_hosts (scan_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.dast_scan_out_of_scope_hosts TO authenticated;
GRANT ALL ON public.dast_scan_out_of_scope_hosts TO service_role;

ALTER TABLE public.dast_scan_out_of_scope_hosts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dast team view out of scope hosts" ON public.dast_scan_out_of_scope_hosts
  FOR SELECT TO authenticated
  USING (public.is_dast_allowed(auth.uid()));

CREATE POLICY "service role write out of scope hosts" ON public.dast_scan_out_of_scope_hosts
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
