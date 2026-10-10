-- A coluna que marca "esta linha é a própria organização" carregava o nome da
-- empresa de origem. Renomeada para um nome neutro; o código usa is_propria.
--
-- Só estrutura: os dados continuam iguais (a linha marcada continua marcada).

ALTER TABLE public.segmentos RENAME COLUMN is_bernoulli TO is_propria;
ALTER TABLE public.benchmark_maturidade_ref RENAME COLUMN is_bernoulli TO is_propria;
 