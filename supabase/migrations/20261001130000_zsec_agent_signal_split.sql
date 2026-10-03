-- Agente Z-Sec 0.2: o uso passa a ser "minuto ativo" = foco ∪ rede.
-- duration_s continua sendo o total (união); estas colunas guardam cada sinal
-- separado pra calibrar o limiar de rede no lab:
--   foreground_s: segundos com o app em primeiro plano e usuário ativo
--   network_s:    minutos em que o processo do app passou do limiar de bytes × 60
ALTER TABLE public.ia_web_events
  ADD COLUMN IF NOT EXISTS foreground_s integer,
  ADD COLUMN IF NOT EXISTS network_s    integer;
