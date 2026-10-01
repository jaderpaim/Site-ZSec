-- Colunas de suporte pro "fechamento por ausência" de vulnerabilidades de infra —
-- versão simples combinada com o usuário: quando um achado que estava aberto some do
-- import de um host que definitivamente foi escaneado (não do banco todo — só dos hosts
-- que vieram nesse arquivo), ele é fechado automaticamente pra bater com o total mensal do
-- gráfico de referência (Sek). Se reaparecer depois, isso fica registrado em vez de reabrir
-- silenciosamente.
--
-- presumed_closed: true quando o fechamento veio dessa heurística (ausência), não de um Fix
--   explícito do scanner — diferencia "alguém corrigiu" de "presumimos corrigido".
-- reopened_at: quando um achado com presumed_closed=true volta a aparecer num import
--   seguinte, ver 20260813150200 (upsert_vuln_infra v3).
--
-- Limitação conhecida (aceita para essa versão simples): só guardamos o ESTADO ATUAL de
-- cada achado, não um histórico de ciclos abre/fecha/reabre. Se um achado fechar por
-- ausência e depois reabrir, os meses em que ficou fechado no gráfico "Evolução Mensal"
-- passam a contar como aberto retroativamente (porque só sabemos o estado de hoje) — ou
-- seja, o número do mês corrente fica certo, mas o histórico de meses passados "cicatriza"
-- depois de um reopen. Ver conversa que motivou essa escolha antes de estranhar divergências
-- históricas pontuais.

ALTER TABLE public.vulnerabilities_infra
  ADD COLUMN presumed_closed boolean NOT NULL DEFAULT false,
  ADD COLUMN reopened_at timestamptz NULL;
