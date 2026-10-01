
-- 1) Rename existing table to vulnerabilities_aplicacao
ALTER TABLE public.vulnerabilities RENAME TO vulnerabilities_aplicacao;

-- Rename constraints/indexes
ALTER INDEX public.vulnerabilities_pkey RENAME TO vulnerabilities_aplicacao_pkey;
ALTER INDEX public.vulnerabilities_content_hash_key RENAME TO vulnerabilities_aplicacao_content_hash_key;
ALTER TABLE public.vulnerabilities_aplicacao RENAME CONSTRAINT vulnerabilities_kind_check TO vulnerabilities_aplicacao_kind_check;
ALTER TABLE public.vulnerabilities_aplicacao RENAME CONSTRAINT vulnerabilities_department_id_fkey TO vulnerabilities_aplicacao_department_id_fkey;

ALTER INDEX public.idx_vuln_date RENAME TO idx_vuln_apl_date;
ALTER INDEX public.idx_vuln_department RENAME TO idx_vuln_apl_department;
ALTER INDEX public.idx_vuln_kind_date RENAME TO idx_vuln_apl_kind_date;
ALTER INDEX public.idx_vuln_kind_dept RENAME TO idx_vuln_apl_kind_dept;
ALTER INDEX public.idx_vuln_severity RENAME TO idx_vuln_apl_severity;
ALTER INDEX public.idx_vuln_status RENAME TO idx_vuln_apl_status;
ALTER INDEX public.idx_vulnerabilities_department_id RENAME TO idx_vuln_apl_department_id;
ALTER INDEX public.idx_vulnerabilities_dept_identified RENAME TO idx_vuln_apl_dept_identified;

-- Drop FK from vuln_logs to old table (id may now belong to either table)
ALTER TABLE public.vuln_logs DROP CONSTRAINT IF EXISTS vuln_logs_vuln_id_fkey;

-- 2) Create vulnerabilities_infra with identical schema
CREATE TABLE public.vulnerabilities_infra (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  fqdn text NOT NULL,
  severity vuln_severity NOT NULL,
  status vuln_status NOT NULL DEFAULT 'Aberta'::vuln_status,
  responsible text,
  identified_at date,
  source text,
  vuln_type text,
  system_app text,
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  content_hash text UNIQUE,
  kind text NOT NULL DEFAULT 'infraestrutura'::text CHECK (kind = ANY (ARRAY['aplicacao','infraestrutura'])),
  raw jsonb,
  pending_approval boolean DEFAULT false,
  pending_at timestamptz,
  pending_by text,
  pending_status text,
  mitigation_description text,
  closed_at date
);

CREATE INDEX idx_vuln_inf_date ON public.vulnerabilities_infra (identified_at DESC);
CREATE INDEX idx_vuln_inf_department ON public.vulnerabilities_infra (department_id);
CREATE INDEX idx_vuln_inf_kind_date ON public.vulnerabilities_infra (kind, identified_at DESC);
CREATE INDEX idx_vuln_inf_kind_dept ON public.vulnerabilities_infra (kind, department_id, identified_at DESC);
CREATE INDEX idx_vuln_inf_severity ON public.vulnerabilities_infra (severity);
CREATE INDEX idx_vuln_inf_status ON public.vulnerabilities_infra (status);
CREATE INDEX idx_vuln_inf_dept_identified ON public.vulnerabilities_infra (department_id, identified_at DESC);

-- 3) GRANTs on both tables
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vulnerabilities_aplicacao TO authenticated;
GRANT ALL ON public.vulnerabilities_aplicacao TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.vulnerabilities_infra TO authenticated;
GRANT ALL ON public.vulnerabilities_infra TO service_role;

-- 4) Triggers on both
DROP TRIGGER IF EXISTS tg_vulnerabilities_updated ON public.vulnerabilities_aplicacao;
DROP TRIGGER IF EXISTS trg_vulnerabilities_closed_at ON public.vulnerabilities_aplicacao;

CREATE TRIGGER tg_vuln_apl_updated BEFORE UPDATE ON public.vulnerabilities_aplicacao
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_vuln_apl_closed_at BEFORE INSERT OR UPDATE OF status, raw ON public.vulnerabilities_aplicacao
  FOR EACH ROW EXECUTE FUNCTION public.vulnerabilities_set_closed_at();

CREATE TRIGGER tg_vuln_inf_updated BEFORE UPDATE ON public.vulnerabilities_infra
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_vuln_inf_closed_at BEFORE INSERT OR UPDATE OF status, raw ON public.vulnerabilities_infra
  FOR EACH ROW EXECUTE FUNCTION public.vulnerabilities_set_closed_at();

-- 5) Enable RLS + recreate policies on both
ALTER TABLE public.vulnerabilities_aplicacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vulnerabilities_infra ENABLE ROW LEVEL SECURITY;

-- aplicacao policies (drop existing then recreate uniformly)
DROP POLICY IF EXISTS "users view vulnerabilities by department or permission" ON public.vulnerabilities_aplicacao;
DROP POLICY IF EXISTS "users create vulnerabilities by department or permission" ON public.vulnerabilities_aplicacao;
DROP POLICY IF EXISTS "users update vulnerabilities by department or permission" ON public.vulnerabilities_aplicacao;
DROP POLICY IF EXISTS "users delete vulnerabilities by department or permission" ON public.vulnerabilities_aplicacao;

CREATE POLICY "view vuln apl by dept or permission" ON public.vulnerabilities_aplicacao
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_module_admin(auth.uid(), 'vulnerabilidades') OR (has_module_permission(auth.uid(), 'vulnerabilidades', 'view') AND user_department_id(auth.uid()) IS NOT NULL AND department_id = user_department_id(auth.uid())));
CREATE POLICY "insert vuln apl by dept or permission" ON public.vulnerabilities_aplicacao
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_module_admin(auth.uid(), 'vulnerabilidades') OR (has_module_permission(auth.uid(), 'vulnerabilidades', 'create') AND user_department_id(auth.uid()) IS NOT NULL AND department_id = user_department_id(auth.uid())));
CREATE POLICY "update vuln apl by dept or permission" ON public.vulnerabilities_aplicacao
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_module_admin(auth.uid(), 'vulnerabilidades') OR (has_module_permission(auth.uid(), 'vulnerabilidades', 'edit') AND user_department_id(auth.uid()) IS NOT NULL AND department_id = user_department_id(auth.uid())))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_module_admin(auth.uid(), 'vulnerabilidades') OR (has_module_permission(auth.uid(), 'vulnerabilidades', 'edit') AND user_department_id(auth.uid()) IS NOT NULL AND department_id = user_department_id(auth.uid())));
CREATE POLICY "delete vuln apl by dept or permission" ON public.vulnerabilities_aplicacao
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_module_admin(auth.uid(), 'vulnerabilidades') OR (has_module_permission(auth.uid(), 'vulnerabilidades', 'delete') AND user_department_id(auth.uid()) IS NOT NULL AND department_id = user_department_id(auth.uid())));

CREATE POLICY "view vuln inf by dept or permission" ON public.vulnerabilities_infra
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_module_admin(auth.uid(), 'vulnerabilidades') OR (has_module_permission(auth.uid(), 'vulnerabilidades', 'view') AND user_department_id(auth.uid()) IS NOT NULL AND department_id = user_department_id(auth.uid())));
CREATE POLICY "insert vuln inf by dept or permission" ON public.vulnerabilities_infra
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_module_admin(auth.uid(), 'vulnerabilidades') OR (has_module_permission(auth.uid(), 'vulnerabilidades', 'create') AND user_department_id(auth.uid()) IS NOT NULL AND department_id = user_department_id(auth.uid())));
CREATE POLICY "update vuln inf by dept or permission" ON public.vulnerabilities_infra
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_module_admin(auth.uid(), 'vulnerabilidades') OR (has_module_permission(auth.uid(), 'vulnerabilidades', 'edit') AND user_department_id(auth.uid()) IS NOT NULL AND department_id = user_department_id(auth.uid())))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role) OR is_module_admin(auth.uid(), 'vulnerabilidades') OR (has_module_permission(auth.uid(), 'vulnerabilidades', 'edit') AND user_department_id(auth.uid()) IS NOT NULL AND department_id = user_department_id(auth.uid())));
CREATE POLICY "delete vuln inf by dept or permission" ON public.vulnerabilities_infra
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_module_admin(auth.uid(), 'vulnerabilidades') OR (has_module_permission(auth.uid(), 'vulnerabilidades', 'delete') AND user_department_id(auth.uid()) IS NOT NULL AND department_id = user_department_id(auth.uid())));
