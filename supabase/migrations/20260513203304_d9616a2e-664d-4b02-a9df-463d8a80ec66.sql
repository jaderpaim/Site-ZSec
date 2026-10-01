
-- Enums
CREATE TYPE public.vuln_severity AS ENUM ('Crítica', 'Alta', 'Média', 'Baixa');
CREATE TYPE public.vuln_status AS ENUM ('Aberta', 'Em tratamento', 'Mitigada', 'Fechada');

-- Departments
CREATE TABLE public.departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth users view departments" ON public.departments
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "analyst+admin insert departments" ON public.departments
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'analista'));
CREATE POLICY "analyst+admin update departments" ON public.departments
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'analista'));
CREATE POLICY "admin delete departments" ON public.departments
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Vulnerabilities
CREATE TABLE public.vulnerabilities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fqdn TEXT NOT NULL,
  severity public.vuln_severity NOT NULL,
  status public.vuln_status NOT NULL DEFAULT 'Aberta',
  responsible TEXT,
  identified_at DATE NOT NULL DEFAULT CURRENT_DATE,
  source TEXT,
  vuln_type TEXT,
  system_app TEXT,
  department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID
);

CREATE INDEX idx_vuln_department ON public.vulnerabilities(department_id);
CREATE INDEX idx_vuln_severity ON public.vulnerabilities(severity);
CREATE INDEX idx_vuln_status ON public.vulnerabilities(status);
CREATE INDEX idx_vuln_date ON public.vulnerabilities(identified_at DESC);

ALTER TABLE public.vulnerabilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth users view vulns" ON public.vulnerabilities
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "analyst+admin insert vulns" ON public.vulnerabilities
  FOR INSERT TO authenticated
  WITH CHECK (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'analista'));
CREATE POLICY "analyst+admin update vulns" ON public.vulnerabilities
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'analista'));
CREATE POLICY "analyst+admin delete vulns" ON public.vulnerabilities
  FOR DELETE TO authenticated
  USING (public.has_role(auth.uid(), 'admin') OR public.has_role(auth.uid(), 'analista'));

-- updated_at trigger function (idempotent)
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END; $$;

CREATE TRIGGER tg_departments_updated BEFORE UPDATE ON public.departments
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER tg_vulnerabilities_updated BEFORE UPDATE ON public.vulnerabilities
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Seed default departments
INSERT INTO public.departments (name, description) VALUES
  ('Infraestrutura', 'Equipe de infraestrutura e redes'),
  ('Produtos Digitais', 'Equipe de produtos digitais'),
  ('Sistema da Informação', 'Equipe de sistemas de informação')
ON CONFLICT (name) DO NOTHING;
