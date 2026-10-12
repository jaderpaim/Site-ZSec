-- Achados do Security Advisor (splinter) no zsec-hmg em 2026-10-11.
--
-- No Postgres toda função nova nasce executável por PUBLIC. Estas são
-- SECURITY DEFINER (rodam com o dono, ignorando RLS) e ficaram expostas em
-- /rest/v1/rpc/* para quem tem só a chave pública (anon) ou qualquer login:
--
--   schedule_hook_cron(3 args) -- a versão do Vault foi criada sem o REVOKE
--     que a de 4 args tinha: qualquer um criava/trocava/apagava crons e podia
--     apontar um para URL própria, recebendo o HOOK_SECRET no cabeçalho.
--   upsert_sek_tickets         -- qualquer um gravava/alterava chamados do SEK.
--   get_sophos_top_users_threats -- qualquer um lia nomes de usuários com ameaças.
--   get_ranking_ia_usuarios    -- sem checagem de papel: qualquer login lia o
--     ranking de uso de IA por pessoa.
--
-- O app chama as quatro só pelo servidor (service role), então nada quebra.
-- has_role, has_module_permission, is_module_admin, is_any_module_admin e
-- user_department_id continuam com authenticated: as políticas RLS dependem
-- delas (ver 20261011170000_has_role_execute_authenticated.sql).

-- Só servidor
REVOKE EXECUTE ON FUNCTION public.schedule_hook_cron(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_sek_tickets(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_sophos_top_users_threats(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_ranking_ia_usuarios(timestamptz, timestamptz, text, uuid, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_hook_cron(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_sek_tickets(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_sophos_top_users_threats(timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_ranking_ia_usuarios(timestamptz, timestamptz, text, uuid, text, int) TO service_role;

-- Função de gatilho: o gatilho dispara sem precisar de EXECUTE do usuário.
REVOKE EXECUTE ON FUNCTION public.prevent_profile_column_escalation() FROM PUBLIC, anon, authenticated;

-- Usada dentro de políticas RLS: precisa continuar executável por quem está logado.
REVOKE EXECUTE ON FUNCTION public.is_dast_allowed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_dast_allowed(uuid) TO authenticated, service_role;

-- search_path fixo: impede que um schema/objeto homônimo engane a função.
ALTER FUNCTION public.qradar_log_sources_track_status_change() SET search_path = public;
