-- A policy "anon insert failed login only" permitia que QUALQUER cliente com a
-- anon/publishable key (que é pública, embutida no bundle JS) inserisse linhas
-- diretamente via REST API do Supabase em auth_access_logs, sem passar pelo app
-- nem pela server function logAccessFailure. Mesmo restrita a status='error' e
-- sem user_id/role/full_name, isso permitia forjar/inundar a trilha de auditoria
-- de login com email/error_message arbitrários (flood e spoofing de log de segurança).
--
-- logAccessFailure (access-logs.functions.ts) passou a gravar via service role
-- (supabaseAdmin), então o INSERT anônimo direto na tabela não é mais necessário.
-- O SSO (Azure) já gravava em auth_access_logs via service role no callback
-- (src/routes/api/public/auth/azure/callback.ts) — não depende desta policy.
DROP POLICY IF EXISTS "anon insert failed login only" ON public.auth_access_logs;

REVOKE INSERT ON public.auth_access_logs FROM anon;
