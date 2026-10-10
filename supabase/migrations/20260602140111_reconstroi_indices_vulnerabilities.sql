-- Reconstrução: dois índices de public.vulnerabilities existiam no banco de
-- origem sem migration de criação. A migration seguinte (20260602140112)
-- renomeia a tabela para vulnerabilities_aplicacao e renomeia estes índices.
--
-- Definições copiadas dos equivalentes que essa mesma migration cria em
-- vulnerabilities_infra ("schema idêntico"): idx_vuln_inf_kind_date e
-- idx_vuln_inf_kind_dept.

CREATE INDEX IF NOT EXISTS idx_vuln_kind_date
  ON public.vulnerabilities (kind, identified_at DESC);

CREATE INDEX IF NOT EXISTS idx_vuln_kind_dept
  ON public.vulnerabilities (kind, department_id, identified_at DESC);
