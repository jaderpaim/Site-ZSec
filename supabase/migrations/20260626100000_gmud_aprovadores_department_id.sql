-- Guarda o departamento de origem de cada aprovador na cadência da GMUD.
-- Necessário para a regra de dispensa por papel: dois aprovadores com o
-- mesmo papel só formam um grupo "qualquer um decide pelos dois" quando vêm
-- do MESMO departamento — caso contrário, uma etapa de outro departamento
-- intercalada entre eles (rank entrelaçado) quebraria essa relação sem essa
-- coluna, já que só "papel" + ordem global não bastam para diferenciar.
ALTER TABLE public.gmud_aprovadores
  ADD COLUMN IF NOT EXISTS department_id uuid NULL REFERENCES public.departments(id);
