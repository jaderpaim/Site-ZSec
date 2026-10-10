-- Reconstrução: nao_conformidade_chamados existia no banco de origem sem
-- migration de criação (nenhuma migration a cita).
--
-- Chamados abertos para tratar não conformidades (nao-conformidade.functions.ts,
-- que acessa com a service role -- por isso sem policies; o RLS ligado sem
-- policy bloqueia o acesso direto pelo navegador).
-- Colunas deduzidas de src/integrations/supabase/types.ts.

CREATE TABLE IF NOT EXISTS public.nao_conformidade_chamados (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  chamado       text NOT NULL,
  descricao     text,
  data_abertura date,
  responsavel   text,
  impacto       text,
  created_by    uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.nao_conformidade_chamados ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS tg_nao_conformidade_chamados_updated ON public.nao_conformidade_chamados;
CREATE TRIGGER tg_nao_conformidade_chamados_updated
  BEFORE UPDATE ON public.nao_conformidade_chamados
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
