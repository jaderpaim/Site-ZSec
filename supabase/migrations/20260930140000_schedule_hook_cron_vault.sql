-- Piloto do fix geral de HOOK_SECRET em texto puro (ver
-- project_cron_hook_secret_plaintext_vault_fix): schedule_hook_cron é a
-- função que a tela de Cron Jobs do app (CronJobs.tsx -> cron-jobs.
-- functions.ts) chama toda vez que alguém cria/edita/ativa um cron
-- (sek-zendesk-sync incluso) -- hoje recebe o HOOK_SECRET como parâmetro
-- (p_anon_key) e embute o valor literal em cron.job.command via format(%L).
--
-- Nova versão (3 argumentos, sem p_anon_key) lê o segredo do Vault na hora
-- de montar o comando -- o valor NUNCA aparece em cron.job.command nem
-- trafega da aplicação pro RPC.
--
-- Propositalmente NÃO remove a função antiga de 4 argumentos ainda --
-- Postgres permite as duas coexistirem (overload por aridade), e o app
-- ainda deployado (cron-jobs.functions.ts antigo) continua chamando a
-- versão de 4 argumentos até o novo código subir. Migration de limpeza
-- (DROP FUNCTION da versão antiga) fica pra depois de confirmar que o
-- deploy novo está no ar.
CREATE OR REPLACE FUNCTION public.schedule_hook_cron(
  p_job_name  text,
  p_schedule  text,
  p_hook_url  text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  BEGIN
    PERFORM cron.unschedule(p_job_name);
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  PERFORM cron.schedule(
    p_job_name,
    p_schedule,
    format(
      $q$
      SELECT net.http_post(
        url     := %L,
        headers := jsonb_build_object(
                     'Content-Type', 'application/json',
                     'apikey',       (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'hook_secret')
                   ),
        body    := '{}'::jsonb
      );
      $q$,
      p_hook_url
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.schedule_hook_cron(text, text, text) TO service_role;
