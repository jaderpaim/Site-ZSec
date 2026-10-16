-- Formato do código de referência: INC0000001 (prefixo INC + 7 dígitos).
-- Substitui o TI-00001 da migração anterior. Renumera os existentes em ordem de
-- criação e passa a gerar no novo formato.

ALTER TABLE public.leakradar_incidents ALTER COLUMN ref_code DROP DEFAULT;

WITH ordered AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn
  FROM public.leakradar_incidents
)
UPDATE public.leakradar_incidents i
  SET ref_code = 'INC' || lpad(o.rn::text, 7, '0')
  FROM ordered o
  WHERE o.id = i.id;

-- Continua a sequência depois do maior já usado.
SELECT setval(
  'public.leakradar_incident_ref_seq',
  GREATEST((SELECT count(*) FROM public.leakradar_incidents), 1),
  true
);

ALTER TABLE public.leakradar_incidents
  ALTER COLUMN ref_code
  SET DEFAULT 'INC' || lpad(nextval('public.leakradar_incident_ref_seq')::text, 7, '0');
