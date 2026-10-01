
CREATE TABLE IF NOT EXISTS public.sso_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_mode text NOT NULL DEFAULT 'disabled',
  oauth_enabled boolean NOT NULL DEFAULT false,
  saml_enabled boolean NOT NULL DEFAULT false,
  ldap_enabled boolean NOT NULL DEFAULT false,
  azure_tenant_id text,
  azure_client_id text,
  saml_metadata_url text,
  ldap_host text,
  ldap_port integer,
  ldap_base_dn text,
  ldap_bind_dn text,
  allowed_domains text[] NOT NULL DEFAULT '{}',
  updated_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.sso_config TO authenticated;
GRANT ALL ON public.sso_config TO service_role;

ALTER TABLE public.sso_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "sso_config_admin_read" ON public.sso_config;
CREATE POLICY "sso_config_admin_read" ON public.sso_config
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "sso_config_admin_write" ON public.sso_config;
CREATE POLICY "sso_config_admin_write" ON public.sso_config
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));

DROP TRIGGER IF EXISTS sso_config_set_updated_at ON public.sso_config;
CREATE TRIGGER sso_config_set_updated_at
  BEFORE UPDATE ON public.sso_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.module_permissions (module_slug, action, label)
VALUES
  ('sso-ldap', 'view', 'Visualizar'),
  ('sso-ldap', 'manage', 'Gerenciar')
ON CONFLICT DO NOTHING;
