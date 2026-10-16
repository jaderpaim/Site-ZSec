-- Remove as políticas "TO service_role" restantes (mesma limpeza feita no
-- Threat Intel em 20261015200000_cti_remove_politicas_service_role.sql).
--
-- Não têm efeito: no Supabase a service_role tem BYPASSRLS e ignora o RLS de
-- qualquer jeito -- o servidor continua lendo e gravando igual. USING (true)
-- numa política TO service_role só poluía a análise de RLS da esteira
-- (RLS-008/RLS-025) e servia de modelo errado para tabelas novas.
--
-- Tabela usada só pelo servidor não precisa de política nenhuma: RLS ligado e
-- nenhuma política já bloqueia anon e authenticated. As políticas de leitura
-- para quem está logado continuam como estão.
DROP POLICY IF EXISTS "service role write dns cache" ON public.cmdb_dns_cache;
DROP POLICY IF EXISTS "service role write auth credentials" ON public.dast_auth_credentials;
DROP POLICY IF EXISTS "service role write out of scope hosts" ON public.dast_scan_out_of_scope_hosts;
DROP POLICY IF EXISTS "service role write dlp events" ON public.dlp_events;
DROP POLICY IF EXISTS "service role write dlp sync state" ON public.dlp_sync_state;
DROP POLICY IF EXISTS "service role writes sast finding events" ON public.sast_finding_events;
DROP POLICY IF EXISTS "service role writes sast findings" ON public.sast_findings;
DROP POLICY IF EXISTS "service role writes sast ingest cursor" ON public.sast_ingest_cursor;
DROP POLICY IF EXISTS "service role writes sast scan runs" ON public.sast_scan_runs;
DROP POLICY IF EXISTS "service role writes sek tickets" ON public.sek_tickets;
DROP POLICY IF EXISTS "service role writes sek zendesk auth log" ON public.sek_zendesk_auth_log;
DROP POLICY IF EXISTS "service role write shadowit findings" ON public.shadowit_findings;
DROP POLICY IF EXISTS "service role write shadowit hosts" ON public.shadowit_hosts;
DROP POLICY IF EXISTS "service role write shadowit scans" ON public.shadowit_scans;
DROP POLICY IF EXISTS "Service role writes vuln snapshots" ON public.vuln_snapshots;
DROP POLICY IF EXISTS "service role write zabbix cache" ON public.zabbix_hosts_cache;
