-- Licenças Sophos Central (GET /licenses/v1/licenses, host global
-- api.central.sophos.com — funciona com credenciais de tenant, confirmado
-- ao vivo). Guarda contratado (quantity) x em uso (usage.current.count)
-- por produto; usado inicialmente pro card de Criptografia de Dispositivos
-- (product.code = 'CDE' = Central Device Encryption).
CREATE TABLE public.sophos_licenses (
  id text PRIMARY KEY,
  tenant_id text NOT NULL,
  license_identifier text,
  product_code text,
  product_generic_code text,
  product_name text,
  license_type text,
  quantity integer,
  usage_count integer,
  usage_date date,
  start_date date,
  end_date date,
  perpetual boolean,
  unlimited boolean,
  raw jsonb,
  synced_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_sophos_licenses_tenant ON public.sophos_licenses(tenant_id);
CREATE INDEX idx_sophos_licenses_product_code ON public.sophos_licenses(product_code);
ALTER TABLE public.sophos_licenses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth view sophos licenses" ON public.sophos_licenses FOR SELECT TO authenticated USING (true);
CREATE POLICY "analyst+admin write sophos licenses" ON public.sophos_licenses FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role))
  WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR has_role(auth.uid(),'analista'::app_role));
