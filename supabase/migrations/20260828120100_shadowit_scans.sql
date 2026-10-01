-- Shadow IT: histórico de varredura de enriquecimento (SMB/FTP/HTTP-título/
-- NetBIOS) contra hosts já catalogados em shadowit_hosts. Espelha a forma de
-- dast_scans (status/progress/started_at/finished_at/error), mas em tabela
-- própria -- fila e worker separados do DAST de propósito (motivo técnico:
-- uma varredura de Shadow IT numa subnet inteira não pode travar a fila
-- serial de scan de vulnerabilidade, e vice-versa), então histórico também
-- fica separado.

CREATE TABLE public.shadowit_scans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  targets text[] NOT NULL DEFAULT '{}',
  status text NOT NULL DEFAULT 'queued',
  progress integer NOT NULL DEFAULT 0,
  error text,
  started_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.shadowit_scans TO authenticated;
GRANT ALL ON public.shadowit_scans TO service_role;

ALTER TABLE public.shadowit_scans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "dast team manage shadowit scans" ON public.shadowit_scans
  FOR ALL TO authenticated
  USING (public.is_dast_allowed(auth.uid()))
  WITH CHECK (public.is_dast_allowed(auth.uid()));

CREATE POLICY "service role write shadowit scans" ON public.shadowit_scans
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
