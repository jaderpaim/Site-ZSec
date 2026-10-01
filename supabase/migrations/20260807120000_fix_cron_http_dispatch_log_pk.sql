-- cron_http_dispatch_log.id era preenchido diretamente com o id retornado por
-- net.http_post() (fila interna do pg_net, compartilhada por TODOS os cron
-- jobs) e usado como PRIMARY KEY da tabela. Em 07/08/2026 o pg_net reciclou
-- um id já presente na tabela (id=563), o que violou a unique constraint e
-- fez a instrução inteira do pg_cron abortar — INCLUINDO o net.http_post()
-- em si, já que é um único INSERT ... SELECT. Resultado: o hook do
-- ssl-expiry-check nunca foi disparado às 07:00 BRT, sem nenhum registro de
-- falha no lado da aplicação (o request nem saiu do Postgres).
--
-- Como cron_http_dispatch_log é compartilhada por todos os jobs agendados
-- via schedule_hook_cron (qradar-sync, domains-expiry-check,
-- cloudflare-daily-sync, etc — ver 20260630140000_cron_http_dispatch_log.sql),
-- qualquer um deles pode sofrer o mesmo colapso na próxima reciclagem de id
-- do pg_net.
--
-- Fix: "id" deixa de ser a PRIMARY KEY (continua guardando o id do
-- net.http_post(), sem unicidade — é só um dado de correlação com
-- net._http_response, não um identificador de linha). Uma coluna surrogate
-- própria (log_id, identity) passa a ser a PK real da tabela.
--
-- Não renomeamos "id" nem alteramos schedule_hook_cron: os cron jobs já
-- agendados têm o texto do INSERT gravado em cron.job.command no momento do
-- cron.schedule() (não é resolvido de novo em runtime — mesmo motivo descrito
-- em 20260708150000_cron_update.sql) e todos fazem
-- "INSERT INTO cron_http_dispatch_log (id, job_name) SELECT net.http_post(...), ...".
-- Manter a coluna "id" com esse nome evita ter que reagendar cada job.
ALTER TABLE public.cron_http_dispatch_log
  DROP CONSTRAINT cron_http_dispatch_log_pkey;

ALTER TABLE public.cron_http_dispatch_log
  ADD COLUMN log_id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY;

COMMENT ON COLUMN public.cron_http_dispatch_log.id IS
  'id retornado por net.http_post() (fila do pg_net) — pode se repetir entre execuções se o pg_net reciclar ids; usar só para JOIN com net._http_response, nunca como identificador único desta tabela.';
