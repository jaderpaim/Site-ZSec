-- As policies de UPDATE em gmud_aprovadores ("approver update own line" e
-- "analyst+admin update gmud aprov") só restringem LINHA (email/role), nunca
-- COLUNA além de gmud_id/email_aprovador/ordem (trigger
-- gmud_aprovadores_protect_columns). Isso permitia que um aprovador autenticado
-- chamasse a REST API do Supabase direto (fora do app) para:
--   - aprovar/rejeitar fora da sua vez (pula a checagem de onda/sequência);
--   - decidir uma GMUD já encerrada (status_geral != 'Em Aprovação');
--   - gravar status_aprovacao sem disparar a dispensa dos pares, o log de
--     auditoria ou o e-mail de notificação — toda essa lógica só existe em
--     decideGmudApproval (gmud.functions.ts), nunca no banco.
--
-- Auditoria de todo o repo confirmou que NENHUM caminho do app usa o client
-- com JWT de usuário para escrever em gmud_aprovadores: toda escrita (app,
-- cron/hooks) passa por admin() (service_role), que ignora RLS de qualquer
-- forma. As duas policies de UPDATE abaixo são código morto do ponto de vista
-- da aplicação e servem hoje só como porta de bypass da lógica de negócio.
DROP POLICY IF EXISTS "approver update own line" ON public.gmud_aprovadores;
DROP POLICY IF EXISTS "analyst+admin update gmud aprov" ON public.gmud_aprovadores;
