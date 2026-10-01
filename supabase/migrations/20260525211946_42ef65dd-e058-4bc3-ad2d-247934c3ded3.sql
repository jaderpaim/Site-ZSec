
-- Enums
CREATE TYPE public.gmud_tipo AS ENUM ('Normal','Padrão','Emergencial');
CREATE TYPE public.gmud_impacto AS ENUM ('Baixo','Médio','Alto');
CREATE TYPE public.gmud_status AS ENUM ('Rascunho','Em Aprovação','Aprovada','Rejeitada','Em Execução','Concluída','Rollback');
CREATE TYPE public.gmud_aprov_status AS ENUM ('Pendente','Aprovado','Rejeitado');

-- gmuds
CREATE TABLE public.gmuds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  titulo text NOT NULL,
  descricao text,
  justificativa text,
  tipo public.gmud_tipo NOT NULL DEFAULT 'Normal',
  impacto public.gmud_impacto NOT NULL DEFAULT 'Médio',
  data_inicio timestamptz,
  data_fim timestamptz,
  plano_execucao text,
  plano_rollback text,
  status_geral public.gmud_status NOT NULL DEFAULT 'Em Aprovação',
  criado_por uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gmuds_status_idx ON public.gmuds (status_geral);
CREATE INDEX gmuds_created_idx ON public.gmuds (created_at DESC);

ALTER TABLE public.gmuds ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth view gmuds" ON public.gmuds FOR SELECT TO authenticated USING (true);
CREATE POLICY "analyst+admin insert gmuds" ON public.gmuds FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'analista'));
CREATE POLICY "analyst+admin update gmuds" ON public.gmuds FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'analista'));
CREATE POLICY "admin delete gmuds" ON public.gmuds FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin'));

CREATE TRIGGER gmuds_set_updated BEFORE UPDATE ON public.gmuds
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- gmud_aprovadores
CREATE TABLE public.gmud_aprovadores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gmud_id uuid NOT NULL REFERENCES public.gmuds(id) ON DELETE CASCADE,
  nome_aprovador text NOT NULL,
  email_aprovador text NOT NULL,
  papel text,
  status_aprovacao public.gmud_aprov_status NOT NULL DEFAULT 'Pendente',
  data_acao timestamptz,
  observacoes text,
  user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX gmud_aprov_gmud_idx ON public.gmud_aprovadores (gmud_id);
CREATE INDEX gmud_aprov_email_idx ON public.gmud_aprovadores (lower(email_aprovador));

ALTER TABLE public.gmud_aprovadores ENABLE ROW LEVEL SECURITY;

CREATE POLICY "auth view gmud aprov" ON public.gmud_aprovadores FOR SELECT TO authenticated USING (true);
CREATE POLICY "analyst+admin insert gmud aprov" ON public.gmud_aprovadores FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'analista'));
CREATE POLICY "analyst+admin update gmud aprov" ON public.gmud_aprovadores FOR UPDATE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'analista'));
CREATE POLICY "approver update own line" ON public.gmud_aprovadores FOR UPDATE TO authenticated
  USING (lower(email_aprovador) = lower((auth.jwt() ->> 'email')));
CREATE POLICY "analyst+admin delete gmud aprov" ON public.gmud_aprovadores FOR DELETE TO authenticated
  USING (has_role(auth.uid(),'admin') OR has_role(auth.uid(),'analista'));

-- smtp_config (single row)
CREATE TABLE public.smtp_config (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  host text,
  port integer DEFAULT 587,
  username text,
  from_email text,
  from_name text,
  secure boolean DEFAULT true,
  enabled boolean DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);
ALTER TABLE public.smtp_config ENABLE ROW LEVEL SECURITY;
CREATE POLICY "admin manage smtp" ON public.smtp_config FOR ALL TO authenticated
  USING (has_role(auth.uid(),'admin')) WITH CHECK (has_role(auth.uid(),'admin'));

CREATE TRIGGER smtp_set_updated BEFORE UPDATE ON public.smtp_config
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- email_logs
CREATE TABLE public.email_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  to_email text NOT NULL,
  subject text,
  template text,
  status text NOT NULL,
  error_message text,
  related_gmud_id uuid REFERENCES public.gmuds(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid
);
CREATE INDEX email_logs_created_idx ON public.email_logs (created_at DESC);

ALTER TABLE public.email_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "auth view email logs" ON public.email_logs FOR SELECT TO authenticated USING (true);
CREATE POLICY "auth insert email logs" ON public.email_logs FOR INSERT TO authenticated WITH CHECK (true);
