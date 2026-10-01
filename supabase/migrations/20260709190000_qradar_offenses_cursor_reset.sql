-- O cursor incremental de offenses (last_offenses_sync) ficou travado em
-- 2026-07-08T18:00:10 desde uma falha de upsert por ids duplicados na
-- paginação (já corrigida no código com dedupe por id em
-- syncOffenses/qradar.server.ts). Só a correção de código não bastou pra
-- destravar sozinha: o backlog acumulado (24h+ de offenses "alteradas")
-- já ficou grande demais — a paginação sozinha leva 15-20+ min, e o
-- processo está sendo interrompido pela infra antes de completar e chegar
-- no upsert onde o dedupe atuaria (ver comentário em cron-tracking.server.ts
-- sobre execuções longas sendo interrompidas por algo fora do nosso código).
-- Avança o cursor manualmente pra now(), encolhendo a próxima janela de
-- volta ao tamanho normal (~2h do cron) — a partir daí o ciclo incremental
-- (já com o dedupe) deve voltar a se sustentar sozinho.
-- Também libera o lease de execução (sync_running_since), que ficou preso
-- porque o processo que o criou (iniciado 2026-07-09T18:40:35) morreu no
-- meio sem chegar no upsert final que o liberaria — confirmado via
-- api_logs: atividade parou às 18:48:51 e não voltou.
-- Risco aceito: offenses cujo ÚNICO evento de mudança caiu dentro da janela
-- perdida (08/07 18h até esta migration) não entram nessa sincronização
-- incremental — mitigado pelo fato de que a paginação já vinha buscando
-- (só não conseguindo salvar) esse período em várias tentativas anteriores.
UPDATE public.qradar_sync_state
SET last_offenses_sync = now(),
    sync_running_since = null
WHERE id = true;
