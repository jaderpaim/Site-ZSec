-- Linter "Function Search Path Mutable": schedule_hook_cron, unschedule_hook_cron
-- e update_cron_hook_domain são SECURITY DEFINER mas ficaram sem SET search_path
-- (padrão já usado em has_role e nas demais funções). Todas as referências dentro
-- delas já são schema-qualificadas (cron.*, public.cron_http_dispatch_log), então
-- isso não muda nenhuma resolução — só fecha o vetor de search_path hijacking.
ALTER FUNCTION public.schedule_hook_cron(text, text, text, text) SET search_path = public;
ALTER FUNCTION public.unschedule_hook_cron(text) SET search_path = public;
ALTER FUNCTION public.update_cron_hook_domain(text, text, boolean) SET search_path = public;

-- schedule_hook_cron e unschedule_hook_cron só são chamadas server-side com o
-- client service_role (cron-jobs.functions.ts, sempre atrás de assertAdmin), mas
-- por padrão o Postgres concede EXECUTE a PUBLIC em funções novas. Revoga
-- explicitamente, igual já era feito em update_cron_hook_domain.
REVOKE ALL ON FUNCTION public.schedule_hook_cron(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unschedule_hook_cron(text) FROM PUBLIC, anon, authenticated;
