-- Agente Z-Sec (Windows/macOS): uso de apps de IA fora do navegador.
--
-- O uso coletado pelo agente cai no MESMO ia_web_events que o Sophos alimenta,
-- então get_ia_ranking_overview / get_ranking_ia_usuarios passam a somar as
-- duas origens sem nenhuma mudança. Cada linha do agente = 1 hora com uso de
-- uma ferramenta por um usuário (id determinístico, reenvio faz upsert).
-- O Sophos continua cobrindo o navegador; o agente ignora navegadores pra não
-- contar em dobro.

ALTER TABLE public.ia_web_events
  ADD COLUMN IF NOT EXISTS source       text NOT NULL DEFAULT 'sophos',
  ADD COLUMN IF NOT EXISTS app_name     text,
  ADD COLUMN IF NOT EXISTS process_name text,
  ADD COLUMN IF NOT EXISTS duration_s   integer,
  ADD COLUMN IF NOT EXISTS device_id    text;

CREATE INDEX IF NOT EXISTS idx_ia_web_events_source ON public.ia_web_events (source);

-- Dispositivos com o agente instalado. Base pro inventário futuro da máquina.
CREATE TABLE IF NOT EXISTS public.agent_devices (
  id               text PRIMARY KEY,           -- MachineGuid (Win) / IOPlatformUUID (Mac)
  hostname         text,
  os               text,
  os_version       text,
  arch             text,
  agent_version    text,
  last_user        text,                       -- usuário resolvido (ex.: jader.paim)
  last_os_user     text,                       -- usuário do SO como veio
  user_resolved    boolean NOT NULL DEFAULT false, -- casou com colaboradores?
  ai_apps          jsonb NOT NULL DEFAULT '[]'::jsonb,
  ai_apps_at       timestamptz,
  first_seen_at    timestamptz NOT NULL DEFAULT now(),
  last_seen_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_devices_last_seen ON public.agent_devices (last_seen_at DESC);

ALTER TABLE public.agent_devices ENABLE ROW LEVEL SECURITY;

GRANT SELECT ON public.agent_devices TO authenticated;
GRANT ALL ON public.agent_devices TO service_role;

DROP POLICY IF EXISTS "ranking-ia viewer view agent devices" ON public.agent_devices;
CREATE POLICY "ranking-ia viewer view agent devices" ON public.agent_devices
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role) OR
    public.has_role(auth.uid(), 'analista'::app_role) OR
    public.has_module_permission(auth.uid(), 'ranking-ia', 'view')
  );
