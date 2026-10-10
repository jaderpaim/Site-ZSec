-- Dados da organização que opera esta instância: nome exibido no Painel
-- Executivo, no Benchmark e nos rankings de Maturidade.
--
-- No modelo "um banco por empresa" cada cliente tem o seu banco, então a
-- tabela guarda uma linha só (id boolean fixo em true). Enquanto ela estiver
-- vazia o app usa um texto neutro ("Sua organização").
--
-- Mesmo padrão de smtp_config: o navegador não lê nem grava direto; tudo passa
-- pelas server functions de src/lib/organizacao.functions.ts (leitura para
-- qualquer sessão ativa, gravação só para admin global).

CREATE TABLE IF NOT EXISTS public.organizacao_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  nome text NOT NULL CHECK (length(trim(nome)) > 0),
  nome_curto text,
  dominio_corporativo text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

ALTER TABLE public.organizacao_config ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.organizacao_config FROM authenticated, anon, PUBLIC;
GRANT ALL ON TABLE public.organizacao_config TO service_role;
