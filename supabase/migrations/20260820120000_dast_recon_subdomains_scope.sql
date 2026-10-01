-- Separa achados de recon (Amass externo, descoberta de rede local/shadow
-- IT) por escopo, pra nao misturar subdominios publicos com dispositivos
-- de rede interna na mesma listagem. Default 'external' preserva o
-- comportamento das linhas ja existentes (todas vieram do Amass externo,
-- unica fonte que existia ate agora).
ALTER TABLE public.dast_recon_subdomains
  ADD COLUMN IF NOT EXISTS scope text NOT NULL DEFAULT 'external';

ALTER TABLE public.dast_recon_subdomains
  ADD CONSTRAINT dast_recon_subdomains_scope_check
  CHECK (scope IN ('external', 'internal'));

CREATE INDEX IF NOT EXISTS idx_dast_recon_subdomains_scope
  ON public.dast_recon_subdomains(scope);
