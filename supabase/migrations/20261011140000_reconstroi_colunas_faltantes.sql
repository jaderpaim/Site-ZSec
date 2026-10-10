-- Reconstrução: colunas que existiam no banco de origem mas nunca foram
-- adicionadas por migration (foram criadas direto no banco). Encontradas
-- comparando o types.ts gerado do banco de origem com o gerado de um banco
-- novo criado só pelas migrations.
--
-- Tipos seguem o uso no código; pending_* copia a definição que
-- vulnerabilities_infra já tem (20260602140112, "schema idêntico").
-- IF NOT EXISTS: num banco que já tem as colunas, nada muda.

-- CMDB: departamento responsável pelo ativo.
ALTER TABLE public.cmdb_ativos
  ADD COLUMN IF NOT EXISTS departamento_id uuid REFERENCES public.departments(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_cmdb_ativos_departamento ON public.cmdb_ativos (departamento_id);

-- Fornecedores: departamento dono do contrato e último alerta de vencimento enviado.
ALTER TABLE public.fornecedores
  ADD COLUMN IF NOT EXISTS department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS last_alert_sent_at timestamptz;
CREATE INDEX IF NOT EXISTS idx_fornecedores_department ON public.fornecedores (department_id);

-- Pílulas de SI: link externo do conteúdo.
ALTER TABLE public.pilulas_si
  ADD COLUMN IF NOT EXISTS link text;

-- Políticas e Processos: tipo do documento (policies.functions.ts).
ALTER TABLE public.policies
  ADD COLUMN IF NOT EXISTS tipo text CHECK (tipo IN ('Política', 'Processo'));

-- Vulnerabilidades: fluxo de aprovação e prazo de tratamento.
ALTER TABLE public.vulnerabilities_aplicacao
  ADD COLUMN IF NOT EXISTS pending_approval boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS pending_at timestamptz,
  ADD COLUMN IF NOT EXISTS pending_by text,
  ADD COLUMN IF NOT EXISTS treatment_due_date date;

ALTER TABLE public.vulnerabilities_infra
  ADD COLUMN IF NOT EXISTS treatment_due_date date;
