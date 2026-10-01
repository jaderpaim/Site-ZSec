-- gmud_logs.tipo_evento tinha uma CHECK constraint (criada fora do histórico de
-- migrations rastreado) que só aceitava: criacao, aprovacao, rejeicao,
-- mudanca_status, email_enviado, email_erro, erro. Isso fazia o log de exclusão
-- de GMUD (novo tipo_evento "exclusao") falhar silenciosamente no insert
-- (supabase-js não lança exceção em erro de constraint — só retorna { error }).

ALTER TABLE public.gmud_logs DROP CONSTRAINT IF EXISTS gmud_logs_tipo_evento_check;

ALTER TABLE public.gmud_logs ADD CONSTRAINT gmud_logs_tipo_evento_check
  CHECK (tipo_evento IN (
    'criacao',
    'aprovacao',
    'rejeicao',
    'mudanca_status',
    'exclusao',
    'email_enviado',
    'email_erro',
    'erro'
  ));
