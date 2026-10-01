
-- Revoke EXECUTE from PUBLIC and authenticated/anon on privileged SECURITY DEFINER
-- functions that should never be called directly by signed-in users.
-- Service role retains access for trusted server paths (triggers run as table owner).

REVOKE EXECUTE ON FUNCTION public.apply_role_defaults(uuid, app_role) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.apply_role_defaults(uuid, app_role) TO service_role;

REVOKE EXECUTE ON FUNCTION public.schedule_hook_cron(text, text, text, text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.schedule_hook_cron(text, text, text, text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.unschedule_hook_cron(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.unschedule_hook_cron(text) TO service_role;

REVOKE EXECUTE ON FUNCTION public.recalcular_maturidade_segmento(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.recalcular_maturidade_segmento(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.vuln_set_department_from_fqdn() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.sync_vulns_responsible_from_application() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.trg_segmentos_notas_sync() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.gmud_aprovadores_protect_columns() FROM PUBLIC, anon, authenticated;
