-- Índice para a tabela de alertas acelerar a busca por data e ordenação
CREATE INDEX IF NOT EXISTS idx_sophos_alerts_timestamp 
ON sophos_alerts (raised_at DESC);

-- Índice para a tabela de eventos acelerar a busca por data e ordenação
CREATE INDEX IF NOT EXISTS idx_sophos_events_timestamp 
ON sophos_events (event_at DESC);