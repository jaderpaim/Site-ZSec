CREATE TABLE public.ssl_certificates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  domain_name text NOT NULL UNIQUE,
  issuer text NOT NULL DEFAULT 'desconhecido',
  valid_from date,
  valid_to date,
  alert_days integer NOT NULL DEFAULT 30,
  status text NOT NULL DEFAULT 'ativo',
  last_checked_at timestamptz,
  last_check_error text,
  last_alert_sent_at timestamptz,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ssl_certificates TO authenticated;
GRANT ALL ON public.ssl_certificates TO service_role;

ALTER TABLE public.ssl_certificates ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view ssl by permission" ON public.ssl_certificates FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR is_module_admin(auth.uid(),'dominios-ssl') OR has_module_permission(auth.uid(),'dominios-ssl','view'));

CREATE POLICY "insert ssl by permission" ON public.ssl_certificates FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR is_module_admin(auth.uid(),'dominios-ssl') OR has_module_permission(auth.uid(),'dominios-ssl','create') OR has_module_permission(auth.uid(),'dominios-ssl','edit'));

CREATE POLICY "update ssl by permission" ON public.ssl_certificates FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR is_module_admin(auth.uid(),'dominios-ssl') OR has_module_permission(auth.uid(),'dominios-ssl','edit'));

CREATE POLICY "delete ssl by permission" ON public.ssl_certificates FOR DELETE TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR is_module_admin(auth.uid(),'dominios-ssl') OR has_module_permission(auth.uid(),'dominios-ssl','delete'));

CREATE TRIGGER ssl_certificates_set_updated_at BEFORE UPDATE ON public.ssl_certificates
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();