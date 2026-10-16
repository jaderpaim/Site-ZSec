-- Threat Intelligence — Incidentes: registro de incidentes abertos a partir de
-- uma credencial vazada, com disparo de alerta por e-mail e webhook (Teams,
-- Google Chat, genérico/ITSM). Tudo próprio do módulo (não usa nao_conformidade
-- nem SOC/QRadar).

CREATE TABLE public.leakradar_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- credencial de origem; ON DELETE SET NULL para o incidente sobreviver
  leak_id uuid REFERENCES public.leakradar_leaks (id) ON DELETE SET NULL,
  title text NOT NULL,
  account text, -- snapshot do usuário/e-mail vazado
  category text, -- snapshot (employees/customers/third_parties)
  severity text NOT NULL DEFAULT 'alta'
    CHECK (severity IN ('baixa', 'media', 'alta', 'critica')),
  status text NOT NULL DEFAULT 'aberto'
    CHECK (status IN ('aberto', 'em_andamento', 'resolvido', 'cancelado')),
  description text,
  external_ref text, -- id do chamado em ITSM externo (gancho futuro)
  notified_at timestamptz,
  last_notify jsonb, -- resultado do último disparo por canal
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_leakradar_incidents_status ON public.leakradar_incidents (status, created_at DESC);

GRANT SELECT ON public.leakradar_incidents TO authenticated;
GRANT ALL ON public.leakradar_incidents TO service_role;

ALTER TABLE public.leakradar_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leakradar_incidents FORCE ROW LEVEL SECURITY;

CREATE POLICY "threat intel view incidents by permission" ON public.leakradar_incidents
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_module_admin(auth.uid(), 'threat-intel'::text)
    OR public.has_module_permission(auth.uid(), 'threat-intel'::text, 'view'::text)
  );

CREATE POLICY "service role write leakradar incidents" ON public.leakradar_incidents
  FOR ALL TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS tg_leakradar_incidents_updated ON public.leakradar_incidents;
CREATE TRIGGER tg_leakradar_incidents_updated
  BEFORE UPDATE ON public.leakradar_incidents
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Canais de alerta. `target` guarda o e-mail de destino ou a URL do webhook.
-- A URL do webhook é uma capacidade (quem tem, dispara); o servidor nunca a
-- devolve ao navegador — a listagem mascara.
CREATE TABLE public.leakradar_incident_channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('email', 'teams', 'google_chat', 'webhook')),
  target text NOT NULL,
  min_severity text NOT NULL DEFAULT 'alta'
    CHECK (min_severity IN ('baixa', 'media', 'alta', 'critica')),
  enabled boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Só service_role lê (a URL do webhook é sensível); o app lista pelo servidor,
-- que mascara o target. Por isso NÃO há SELECT para authenticated.
GRANT ALL ON public.leakradar_incident_channels TO service_role;

ALTER TABLE public.leakradar_incident_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leakradar_incident_channels FORCE ROW LEVEL SECURITY;

CREATE POLICY "service role write leakradar incident channels"
  ON public.leakradar_incident_channels
  FOR ALL TO service_role
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DROP TRIGGER IF EXISTS tg_leakradar_incident_channels_updated ON public.leakradar_incident_channels;
CREATE TRIGGER tg_leakradar_incident_channels_updated
  BEFORE UPDATE ON public.leakradar_incident_channels
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
