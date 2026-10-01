-- Quando uma aprovação satisfaz um grupo de aprovadores do mesmo papel
-- ("onda"), os demais membros pendentes da mesma onda são dispensados —
-- diferente de "Cancelado" (que significa que a GMUD morreu antes de chegar
-- neles). Separar os dois motivos mantém o histórico/auditoria claro.
ALTER TYPE public.gmud_aprov_status ADD VALUE IF NOT EXISTS 'Dispensado';
