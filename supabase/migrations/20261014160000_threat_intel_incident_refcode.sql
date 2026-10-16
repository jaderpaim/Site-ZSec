-- Código de referência gerado por incidente, para o ITSM externo capturar (vai
-- no payload do webhook/e-mail). Formato TI-00001, único e sequencial.
CREATE SEQUENCE IF NOT EXISTS public.leakradar_incident_ref_seq;

ALTER TABLE public.leakradar_incidents
  ADD COLUMN IF NOT EXISTS ref_code text;

-- Preenche os já existentes e passa a gerar automaticamente nos novos.
UPDATE public.leakradar_incidents
  SET ref_code = 'TI-' || lpad(nextval('public.leakradar_incident_ref_seq')::text, 5, '0')
  WHERE ref_code IS NULL;

ALTER TABLE public.leakradar_incidents
  ALTER COLUMN ref_code SET DEFAULT 'TI-' || lpad(nextval('public.leakradar_incident_ref_seq')::text, 5, '0');

ALTER TABLE public.leakradar_incidents
  ALTER COLUMN ref_code SET NOT NULL;

ALTER TABLE public.leakradar_incidents
  ADD CONSTRAINT leakradar_incidents_ref_code_key UNIQUE (ref_code);
