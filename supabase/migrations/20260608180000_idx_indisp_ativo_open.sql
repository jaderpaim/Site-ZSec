-- Garante no máximo um registro aberto (fim IS NULL) por ativo
-- Evita duplicatas na detecção automática de indisponibilidade
CREATE UNIQUE INDEX IF NOT EXISTS idx_indisp_ativo_open
  ON public.indisponibilidades(ativo_id)
  WHERE fim IS NULL;
