-- O sync gravava qradar_offenses.source_ip a partir de offense.source_network
-- (nome do bucket de rede do QRadar, ex. "other") em vez de offense.offense_source
-- (IP ou identidade real do ofensor), porque no código `source_network ?? offense_source`
-- nunca caía pro fallback — source_network quase nunca é null. Corrigido em
-- qradar.server.ts (syncOffenses) para as próximas sincronizações.
--
-- Este backfill corrige os registros já existentes usando o offense_source que já
-- está salvo em `raw` — não chama o QRadar de novo. Idempotente: se rodar mais de
-- uma vez, a segunda execução não altera nada (IS DISTINCT FROM já bate).
UPDATE public.qradar_offenses
SET source_ip = raw->>'offense_source'
WHERE raw->>'offense_source' IS NOT NULL
  AND raw->>'offense_source' <> ''
  AND source_ip IS DISTINCT FROM raw->>'offense_source';
