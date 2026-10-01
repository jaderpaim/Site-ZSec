ALTER TABLE public.auth_access_logs REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.auth_access_logs;