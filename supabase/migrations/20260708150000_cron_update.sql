-- Helper reutilizável para trocar em massa o domínio usado nas URLs dos jobs
-- pg_cron (net.http_post), sem precisar reagendar cada job manualmente.
--
-- Motivo: o texto do comando fica gravado em cron.job.command no momento do
-- cron.schedule() e não é resolvido de novo em runtime — ele não segue DNS,
-- env var, nem nada; é uma string estática. Se o hostname em si mudar um dia
-- (ex.: sair de b-security.bernoulli.com.br para outro domínio), essas
-- strings precisam ser reescritas explicitamente. Mesma lógica já usada
-- (só que ad-hoc, sem função) em 20260618225945 e 20260619190000 para trocar
-- a apikey de todos os jobs de uma vez.
--
-- Por padrão roda em modo dry-run (não altera nada, só mostra o que mudaria).
--
-- Uso:
--   -- 1) conferir o que seria alterado:
--   SELECT * FROM public.update_cron_hook_domain(
--     'b-security.bernoulli.com.br', 'novo-dominio.com.br'
--   );
--
--   -- 2) aplicar de fato:
--   SELECT * FROM public.update_cron_hook_domain(
--     'b-security.bernoulli.com.br', 'novo-dominio.com.br', false
--   );
--
-- Repare que hoje nem todos os jobs estão no mesmo domínio — o
-- zabbix-cache-refresh (20260703140000_zabbix_cache_cron.sql) ainda aponta
-- para "b-security.lovable.app". Rode a função uma vez por domínio antigo
-- encontrado, se necessário.
CREATE OR REPLACE FUNCTION public.update_cron_hook_domain(
  p_old_domain text,
  p_new_domain text,
  p_dry_run    boolean DEFAULT true
) RETURNS TABLE(job_name text, schedule text, old_command text, new_command text)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  r RECORD;
  v_new_cmd text;
BEGIN
  FOR r IN
    SELECT jobname, schedule, command
      FROM cron.job
     WHERE command LIKE '%' || p_old_domain || '%'
  LOOP
    v_new_cmd := replace(r.command, p_old_domain, p_new_domain);

    IF NOT p_dry_run THEN
      PERFORM cron.unschedule(r.jobname);
      PERFORM cron.schedule(r.jobname, r.schedule, v_new_cmd);
    END IF;

    job_name    := r.jobname;
    schedule    := r.schedule;
    old_command := r.command;
    new_command := v_new_cmd;
    RETURN NEXT;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.update_cron_hook_domain(text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.update_cron_hook_domain(text, text, boolean) TO service_role;
