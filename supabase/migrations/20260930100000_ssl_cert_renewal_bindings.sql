-- Domínios/SSL: renovação de certificados importados + URLs vinculadas.
--
-- 1) Identidade real do certificado (fingerprint SHA-256, número de série, SANs)
--    pra deduplicar por "é o mesmo certificado?" em vez de emissor + validade.
-- 2) Observações livres por certificado.
-- 3) ssl_certificate_bindings: URLs/hosts onde o certificado está instalado,
--    cadastradas manualmente (o sistema não consegue descobrir isso sozinho
--    pra certificados importados).
-- 4) ssl_certificate_history: versão anterior guardada a cada renovação
--    (a renovação atualiza o MESMO registro, preservando alert_days, URLs e
--    observações, em vez de criar uma linha nova que alertava pra sempre).
--
-- Escritas em bindings/history são feitas pelo servidor com service role,
-- depois de requirePermission(..., 'dominios-ssl', 'edit') -- por isso só há
-- policy de SELECT pra authenticated.

-- Em produção a UNIQUE original de domain_name já não existe (há mais de um
-- certificado pro mesmo domínio). Formaliza isso aqui pra um ambiente novo
-- recriado a partir das migrations se comportar igual.
ALTER TABLE public.ssl_certificates DROP CONSTRAINT IF EXISTS ssl_certificates_domain_name_key;

ALTER TABLE public.ssl_certificates
  ADD COLUMN IF NOT EXISTS source text,
  ADD COLUMN IF NOT EXISTS fingerprint_sha256 text,
  ADD COLUMN IF NOT EXISTS serial_number text,
  ADD COLUMN IF NOT EXISTS subject_alt_names text[],
  ADD COLUMN IF NOT EXISTS notes text;

CREATE INDEX IF NOT EXISTS idx_ssl_certificates_domain_name ON public.ssl_certificates (domain_name);
CREATE UNIQUE INDEX IF NOT EXISTS uq_ssl_certificates_fingerprint
  ON public.ssl_certificates (fingerprint_sha256)
  WHERE fingerprint_sha256 IS NOT NULL;

-- ─── URLs vinculadas ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ssl_certificate_bindings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id uuid NOT NULL REFERENCES public.ssl_certificates(id) ON DELETE CASCADE,
  url text NOT NULL,
  description text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_ssl_cert_bindings_cert ON public.ssl_certificate_bindings (certificate_id);

GRANT SELECT ON public.ssl_certificate_bindings TO authenticated;
GRANT ALL ON public.ssl_certificate_bindings TO service_role;
ALTER TABLE public.ssl_certificate_bindings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view ssl bindings by permission" ON public.ssl_certificate_bindings FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR is_module_admin(auth.uid(),'dominios-ssl') OR has_module_permission(auth.uid(),'dominios-ssl','view'));

-- ─── Histórico de renovações ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ssl_certificate_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  certificate_id uuid NOT NULL REFERENCES public.ssl_certificates(id) ON DELETE CASCADE,
  issuer text,
  valid_from date,
  valid_to date,
  fingerprint_sha256 text,
  serial_number text,
  subject_alt_names text[],
  replaced_at timestamptz NOT NULL DEFAULT now(),
  replaced_by uuid
);
CREATE INDEX IF NOT EXISTS idx_ssl_cert_history_cert ON public.ssl_certificate_history (certificate_id, replaced_at DESC);

GRANT SELECT ON public.ssl_certificate_history TO authenticated;
GRANT ALL ON public.ssl_certificate_history TO service_role;
ALTER TABLE public.ssl_certificate_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view ssl history by permission" ON public.ssl_certificate_history FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR is_module_admin(auth.uid(),'dominios-ssl') OR has_module_permission(auth.uid(),'dominios-ssl','view'));
