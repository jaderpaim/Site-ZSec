-- gmuds.criado_por é um uuid solto (sem FK) e o nome/e-mail do criador hoje é
-- resolvido via JOIN em profiles. Como public.profiles.id referencia
-- auth.users(id) ON DELETE CASCADE, excluir o usuário apaga o profile e a
-- GMUD passa a exibir "criado por —", perdendo o histórico/auditoria.
-- Mesmo padrão já usado em gmud_aprovadores (nome_aprovador/email_aprovador
-- gravados como snapshot, não via join).
ALTER TABLE public.gmuds
  ADD COLUMN IF NOT EXISTS criado_por_nome text,
  ADD COLUMN IF NOT EXISTS criado_por_email text;

-- Backfill best-effort: só recupera os casos em que o profile ainda existe.
-- GMUDs cujo criador já foi excluído antes desta migration permanecem sem
-- snapshot (o dado original já foi perdido, não há como recuperá-lo).
UPDATE public.gmuds g
SET criado_por_nome = p.full_name,
    criado_por_email = p.email
FROM public.profiles p
WHERE g.criado_por = p.id
  AND g.criado_por_nome IS NULL;
