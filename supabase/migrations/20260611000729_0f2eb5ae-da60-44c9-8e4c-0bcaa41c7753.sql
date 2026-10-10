-- Enable RLS on realtime.messages so channel subscriptions are authorized.
--
-- Ajustada em 2026-10-11 para rodar em projetos Supabase novos: neles
-- realtime.messages pertence a um papel interno do Supabase e já vem com RLS
-- ligado, e o papel postgres não pode alterá-la ("must be owner"). A versão
-- original fazia ALTER TABLE direto e quebrava a criação de bancos novos.
-- Mesmo efeito: liga o RLS só se estiver desligado e cria a policy; sem
-- permissão, apenas avisa e segue.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'realtime' AND c.relname = 'messages' AND NOT c.relrowsecurity
  ) THEN
    ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'realtime.messages: sem permissão para alterar (gerenciada pelo Supabase), seguindo.';
END $$;

-- Only authenticated users may subscribe / receive realtime broadcasts.
-- We deliberately do not narrow by topic here because the published tables
-- (ia_web_events, segmentos, segmentos_notas, maturidade, app_settings) are
-- already gated by per-table RLS for authenticated users.
DO $$
BEGIN
  IF to_regclass('realtime.messages') IS NOT NULL THEN
    DROP POLICY IF EXISTS "Authenticated users can read realtime messages" ON realtime.messages;
    CREATE POLICY "Authenticated users can read realtime messages"
      ON realtime.messages
      FOR SELECT
      TO authenticated
      USING (true);
  END IF;
EXCEPTION WHEN insufficient_privilege THEN
  RAISE NOTICE 'realtime.messages: sem permissão para criar policy (gerenciada pelo Supabase), seguindo.';
END $$;
