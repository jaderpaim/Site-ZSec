-- Nada impedia duas execuções de runQradarSync rodarem ao mesmo tempo: o cron
-- dispara a cada 2h (confirmado via cron_http_dispatch_log, sempre pontual),
-- mas o botão "Sincronizar" manual chama a mesma função direto, sem checar se
-- já existe uma em andamento. Confirmado em produção em 2026-07-07: enquanto
-- o sync de offenses estava preso reprocessando um backlog grande (cursor
-- travado por uma falha externa do Supabase), cliques manuais repetidos
-- (20:42, 21:36, 22:13 — nenhum desses tem registro em
-- cron_http_dispatch_log, só os disparos do cron às 20:00/22:00 têm) empilharam
-- várias sincronizações concorrentes disputando os mesmos recursos, agravando
-- os erros no QRadar e no Supabase.
-- Guarda um "lease" simples com timestamp: runQradarSync marca o início aqui
-- e libera no final. Uma segunda chamada só é bloqueada se o lease for recente
-- (ver limiar em qradar.server.ts) — se o processo morrer no meio sem liberar,
-- o lease expira sozinho e não trava o sync para sempre.
ALTER TABLE public.qradar_sync_state
  ADD COLUMN IF NOT EXISTS sync_running_since timestamptz;
