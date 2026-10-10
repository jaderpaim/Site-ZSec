-- Reconstrução: sophos_excecoes existia no banco de origem sem migration de
-- criação. A migration seguinte (20260915130000) adiciona a coluna target.
--
-- Eventos do Sophos ignorados pelos painéis (tela Exceção Sophos).
-- Acessada só pelo servidor com a service role (sophos-excecoes.functions.ts,
-- sophos.functions.ts), por isso não tem policies: o RLS ligado sem policy
-- bloqueia o acesso direto pelo navegador.

CREATE TABLE IF NOT EXISTS public.sophos_excecoes (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_name text NOT NULL,
  match_type text NOT NULL DEFAULT 'exact' CHECK (match_type IN ('exact', 'contains')),
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.sophos_excecoes ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS tg_sophos_excecoes_updated ON public.sophos_excecoes;
CREATE TRIGGER tg_sophos_excecoes_updated
  BEFORE UPDATE ON public.sophos_excecoes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
