-- Adiciona suporte a eventos de LOGOUT em auth_access_logs (antes a tabela só
-- registrava login, sucesso ou erro). event_type distingue 'login' de 'logout';
-- logout_reason grava o motivo do logout ('manual', 'inactivity', 'expired')
-- quando event_type = 'logout'.
ALTER TABLE auth_access_logs
  ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'login',
  ADD COLUMN IF NOT EXISTS logout_reason text;

CREATE INDEX IF NOT EXISTS idx_auth_access_logs_event_type
  ON auth_access_logs (event_type);

COMMENT ON COLUMN auth_access_logs.event_type IS
  'Tipo de evento: login (padrão) ou logout';
COMMENT ON COLUMN auth_access_logs.logout_reason IS
  'Motivo do logout quando event_type = logout: manual, inactivity, expired';
