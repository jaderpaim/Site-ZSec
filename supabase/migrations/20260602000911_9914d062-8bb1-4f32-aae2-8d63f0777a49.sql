CREATE OR REPLACE VIEW public.vw_ranking_ia_usuarios AS
SELECT
  user_name,
  COUNT(*)::bigint AS total_acessos,
  MAX(event_at)    AS ultimo_acesso
FROM public.ia_web_events
WHERE user_name IS NOT NULL AND btrim(user_name) <> ''
GROUP BY user_name
ORDER BY total_acessos DESC;

GRANT SELECT ON public.vw_ranking_ia_usuarios TO authenticated;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'ia_web_events'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.ia_web_events';
  END IF;
END $$;