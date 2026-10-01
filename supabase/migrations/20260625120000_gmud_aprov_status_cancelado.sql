-- Etapas de aprovação cuja vez nunca chega (porque um aprovador anterior
-- rejeitou a GMUD) ficavam "Pendente" para sempre. Adiciona "Cancelado" para
-- refletir corretamente que essas etapas não serão mais decididas.
ALTER TYPE public.gmud_aprov_status ADD VALUE IF NOT EXISTS 'Cancelado';
