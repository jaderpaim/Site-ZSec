-- Remove as políticas "TO service_role" das tabelas do Threat Intel.
--
-- Não têm efeito: no Supabase a service_role tem BYPASSRLS e ignora o RLS de
-- qualquer jeito -- o servidor continua lendo e gravando igual. A condição
-- auth.role() = 'service_role' numa política TO service_role é sempre
-- verdadeira (a mesma tautologia de USING (true)), e só poluía a análise de
-- RLS da esteira (RLS-008/RLS-025).
--
-- Tabela usada só pelo servidor não precisa de política nenhuma: RLS ligado e
-- nenhuma política já bloqueia anon e authenticated. As políticas de leitura
-- para quem está logado (por permissão de módulo) continuam como estão.
DROP POLICY IF EXISTS "service role write leakradar leaks" ON public.leakradar_leaks;
DROP POLICY IF EXISTS "service role write leakradar sync state" ON public.leakradar_sync_state;
DROP POLICY IF EXISTS "service role write leakradar apps" ON public.leakradar_apps;
DROP POLICY IF EXISTS "service role write leakradar incidents" ON public.leakradar_incidents;
DROP POLICY IF EXISTS "service role write leakradar incident channels" ON public.leakradar_incident_channels;
DROP POLICY IF EXISTS "service role write leakradar events" ON public.leakradar_events;
DROP POLICY IF EXISTS "service role write leakradar ad status" ON public.leakradar_ad_status;
DROP POLICY IF EXISTS "service role write leakradar monitors" ON public.leakradar_monitors;
DROP POLICY IF EXISTS "service role write leakradar monitor runs" ON public.leakradar_monitor_runs;
