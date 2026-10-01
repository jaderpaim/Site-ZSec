
-- =========================================================
-- MÓDULO SEGMENTOS + MATURIDADE (refator para backend)
-- =========================================================

-- 1. TABELAS ---------------------------------------------------------------

CREATE TABLE public.segmentos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome TEXT NOT NULL UNIQUE,
  is_bernoulli BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.segmentos TO authenticated;
GRANT ALL ON public.segmentos TO service_role;
ALTER TABLE public.segmentos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view segmentos by permission" ON public.segmentos FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR is_module_admin(auth.uid(),'segmentos') OR has_module_permission(auth.uid(),'segmentos','view'));
CREATE POLICY "insert segmentos by permission" ON public.segmentos FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR is_module_admin(auth.uid(),'segmentos') OR has_module_permission(auth.uid(),'segmentos','create') OR has_module_permission(auth.uid(),'segmentos','edit'));
CREATE POLICY "update segmentos by permission" ON public.segmentos FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR is_module_admin(auth.uid(),'segmentos') OR has_module_permission(auth.uid(),'segmentos','edit'));
CREATE POLICY "delete segmentos by permission" ON public.segmentos FOR DELETE TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR is_module_admin(auth.uid(),'segmentos') OR has_module_permission(auth.uid(),'segmentos','delete'));

CREATE TRIGGER trg_segmentos_updated_at BEFORE UPDATE ON public.segmentos
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ---

CREATE TABLE public.segmentos_notas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segmento_id UUID NOT NULL REFERENCES public.segmentos(id) ON DELETE CASCADE,
  periodo TEXT NOT NULL,
  periodo_ordem INTEGER NOT NULL DEFAULT 0,
  nota_nist NUMERIC(5,2),
  nota_iso  NUMERIC(5,2),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(segmento_id, periodo)
);
CREATE INDEX idx_segmentos_notas_seg ON public.segmentos_notas(segmento_id, periodo_ordem);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.segmentos_notas TO authenticated;
GRANT ALL ON public.segmentos_notas TO service_role;
ALTER TABLE public.segmentos_notas ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view segmentos_notas by permission" ON public.segmentos_notas FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR is_module_admin(auth.uid(),'segmentos') OR has_module_permission(auth.uid(),'segmentos','view'));
CREATE POLICY "insert segmentos_notas by permission" ON public.segmentos_notas FOR INSERT TO authenticated
WITH CHECK (has_role(auth.uid(),'admin'::app_role) OR is_module_admin(auth.uid(),'segmentos') OR has_module_permission(auth.uid(),'segmentos','create') OR has_module_permission(auth.uid(),'segmentos','edit'));
CREATE POLICY "update segmentos_notas by permission" ON public.segmentos_notas FOR UPDATE TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR is_module_admin(auth.uid(),'segmentos') OR has_module_permission(auth.uid(),'segmentos','edit'));
CREATE POLICY "delete segmentos_notas by permission" ON public.segmentos_notas FOR DELETE TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR is_module_admin(auth.uid(),'segmentos') OR has_module_permission(auth.uid(),'segmentos','delete'));

-- ---

CREATE TABLE public.maturidade (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segmento_id UUID NOT NULL REFERENCES public.segmentos(id) ON DELETE CASCADE,
  periodo TEXT NOT NULL,
  periodo_ordem INTEGER NOT NULL DEFAULT 0,
  nota_nist NUMERIC(5,2),
  nota_iso  NUMERIC(5,2),
  score     NUMERIC(5,2),
  delta_anterior NUMERIC(6,2),
  delta_total    NUMERIC(7,2),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(segmento_id, periodo)
);
CREATE INDEX idx_maturidade_seg ON public.maturidade(segmento_id, periodo_ordem);

GRANT SELECT ON public.maturidade TO authenticated;
GRANT ALL ON public.maturidade TO service_role;
ALTER TABLE public.maturidade ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view maturidade by permission" ON public.maturidade FOR SELECT TO authenticated
USING (has_role(auth.uid(),'admin'::app_role) OR is_module_admin(auth.uid(),'maturidade') OR has_module_permission(auth.uid(),'maturidade','view') OR is_module_admin(auth.uid(),'segmentos') OR has_module_permission(auth.uid(),'segmentos','view'));

-- 2. FUNÇÕES ---------------------------------------------------------------