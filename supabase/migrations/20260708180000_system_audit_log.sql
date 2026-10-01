-- Log de auditoria genérico para ações administrativas dentro de Configurações
-- (Exceção Sophos, SMTP, SSO/LDAP, Usuários, Integrações, Alertas, Cron Jobs).
-- Gravado exclusivamente pelo backend (service role) a partir de src/lib/audit-log.functions.ts;
-- não existe policy de INSERT para authenticated/anon.

CREATE TABLE public.system_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  user_id uuid,
  usuario_email text,
  usuario_nome text,
  modulo text NOT NULL,
  acao text NOT NULL,
  descricao text NOT NULL,
  status text NOT NULL DEFAULT 'success' CHECK (status IN ('success', 'error')),
  mensagem_erro text,
  detalhes jsonb
);

CREATE INDEX idx_system_audit_log_created_at ON public.system_audit_log (created_at DESC);
CREATE INDEX idx_system_audit_log_modulo ON public.system_audit_log (modulo);

ALTER TABLE public.system_audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin/analista view system audit log" ON public.system_audit_log
  FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'analista'::app_role));
