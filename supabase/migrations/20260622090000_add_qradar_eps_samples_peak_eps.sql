-- "EPS Pico (7 dias)" e o gráfico de EPS médio usavam o maior valor entre as ~6
-- amostras/dia de total_eps (SUM(eventcount)/300 LAST 5 MINUTES) — sub-amostragem
-- grosseira que esconde picos reais ocorridos entre os horários fixos de sync
-- (confirmado: pico real de 2.984 EPS em 19/06 às 11:47 não apareceu, pois não
-- coincidiu com nenhum dos 6 horários de sync; o dashboard mostrou só 1.917).
--
-- peak_eps passa a guardar o pico nativo do próprio QRadar — telemetria interna
-- StatFilter (deviceType=147, campo "Events per Second Raw - Peak 1 Sec"),
-- capturada a cada sync via AQL — em vez de uma estimativa derivada.
ALTER TABLE public.qradar_eps_samples ADD COLUMN IF NOT EXISTS peak_eps numeric;
