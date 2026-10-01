-- Adiciona last_active_at para suportar o indicador de atividade
-- (conectado/desconectado) no módulo de Gestão de Usuários.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS last_active_at timestamptz;
