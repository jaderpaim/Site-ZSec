-- Workflow do incidente: anotação de conclusão (o que foi feito), obrigatória
-- para resolver, mais quem/quando concluiu.
ALTER TABLE public.leakradar_incidents
  ADD COLUMN IF NOT EXISTS resolution text,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_by uuid REFERENCES auth.users (id) ON DELETE SET NULL;
