CREATE TABLE public.benchmark_maturidade_ref (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo text NOT NULL CHECK (tipo IN ('faturamento','funcionarios')),
  faixa text NOT NULL,
  valor numeric NOT NULL,
  ordem integer NOT NULL DEFAULT 0,
  fonte text,
  ano text,
  is_bernoulli boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.benchmark_investimento_ref (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_organizacao text NOT NULL,
  pct_min numeric,
  pct_max numeric,
  observacao text,
  ordem integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.benchmark_empresa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ano integer NOT NULL UNIQUE,
  score_maturidade numeric,
  faturamento_anual numeric,
  investimento_ciber numeric,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.benchmark_maturidade_ref TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.benchmark_investimento_ref TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.benchmark_empresa TO authenticated;
GRANT ALL ON public.benchmark_maturidade_ref TO service_role;
GRANT ALL ON public.benchmark_investimento_ref TO service_role;
GRANT ALL ON public.benchmark_empresa TO service_role;

ALTER TABLE public.benchmark_maturidade_ref ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benchmark_investimento_ref ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.benchmark_empresa ENABLE ROW LEVEL SECURITY;

CREATE POLICY "benchmark maturidade read" ON public.benchmark_maturidade_ref
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.is_module_admin(auth.uid(),'benchmark')
    OR public.has_module_permission(auth.uid(),'benchmark','view')
  );
CREATE POLICY "benchmark maturidade write" ON public.benchmark_maturidade_ref
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.is_module_admin(auth.uid(),'benchmark')
    OR public.has_module_permission(auth.uid(),'benchmark','manage')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.is_module_admin(auth.uid(),'benchmark')
    OR public.has_module_permission(auth.uid(),'benchmark','manage')
  );

CREATE POLICY "benchmark investimento read" ON public.benchmark_investimento_ref
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.is_module_admin(auth.uid(),'benchmark')
    OR public.has_module_permission(auth.uid(),'benchmark','view')
  );
CREATE POLICY "benchmark investimento write" ON public.benchmark_investimento_ref
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.is_module_admin(auth.uid(),'benchmark')
    OR public.has_module_permission(auth.uid(),'benchmark','manage')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.is_module_admin(auth.uid(),'benchmark')
    OR public.has_module_permission(auth.uid(),'benchmark','manage')
  );

CREATE POLICY "benchmark empresa read" ON public.benchmark_empresa
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.is_module_admin(auth.uid(),'benchmark')
    OR public.has_module_permission(auth.uid(),'benchmark','view')
  );
CREATE POLICY "benchmark empresa write" ON public.benchmark_empresa
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.is_module_admin(auth.uid(),'benchmark')
    OR public.has_module_permission(auth.uid(),'benchmark','manage')
  )
  WITH CHECK (
    public.has_role(auth.uid(),'admin'::app_role)
    OR public.is_module_admin(auth.uid(),'benchmark')
    OR public.has_module_permission(auth.uid(),'benchmark','manage')
  );

CREATE TRIGGER benchmark_maturidade_ref_set_updated_at BEFORE UPDATE ON public.benchmark_maturidade_ref
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER benchmark_investimento_ref_set_updated_at BEFORE UPDATE ON public.benchmark_investimento_ref
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER benchmark_empresa_set_updated_at BEFORE UPDATE ON public.benchmark_empresa
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

INSERT INTO public.module_permissions (module_slug, action, label)
VALUES ('benchmark','view','Visualizar Benchmark'), ('benchmark','manage','Gerenciar Benchmark')
ON CONFLICT DO NOTHING;

INSERT INTO public.benchmark_maturidade_ref (tipo, faixa, valor, ordem, is_bernoulli, fonte, ano) VALUES
  ('faturamento','De R$ 10,01 MM a R$ 60 MM',0.92,1,false,'Vultus','2022 a 2025'),
  ('faturamento','De R$ 60,01 MM a R$ 500 MM',1.32,2,false,'Vultus','2022 a 2025'),
  ('faturamento','De R$ 500,01 MM a R$ 500 MM',1.50,3,false,'Vultus','2022 a 2025'),
  ('faturamento','De R$ 500,01 MM a R$ 1 Bi',1.33,4,false,'Vultus','2022 a 2025'),
  ('faturamento','BERNOULLI (R$ 500,01 MM a R$ 1 Bi)',2.17,5,true,'Vultus','2022 a 2025'),
  ('faturamento','De R$ 1,01 Bi a R$ 5 Bi',1.52,6,false,'Vultus','2022 a 2025'),
  ('faturamento','Acima de R$ 5 Bi',2.23,7,false,'Vultus','2022 a 2025'),
  ('funcionarios','Até 100',2.45,1,false,'Vultus','2022 a 2024'),
  ('funcionarios','Entre 100 e 1.000',1.40,2,false,'Vultus','2022 a 2024'),
  ('funcionarios','Entre 1.001 e 5.000',1.45,3,false,'Vultus','2022 a 2024'),
  ('funcionarios','BERNOULLI',2.17,4,true,'Vultus','2022 a 2024'),
  ('funcionarios','Entre 5.001 e 10.000',1.60,5,false,'Vultus','2022 a 2024'),
  ('funcionarios','Acima de 10.000',2.73,6,false,'Vultus','2022 a 2024');

INSERT INTO public.benchmark_investimento_ref (tipo_organizacao, pct_min, pct_max, observacao, ordem) VALUES
  ('Média global (benchmark)',0.5,1.2,'Do faturamento anual',1),
  ('Empresas maduras em TI (bancos, tech, telecom)',1.5,3.0,'Do faturamento',2),
  ('Setores críticos (saúde, governo, energia)',2.0,5.0,'Especialmente se reguladas',3),
  ('Empresas com maturidade baixa (em transição)',NULL,0.5,'Abaixo de 0,5% — risco elevado',4);

INSERT INTO public.benchmark_empresa (ano, score_maturidade, faturamento_anual, investimento_ciber) VALUES
  (2025, 2.17, 1000000000, 750000);