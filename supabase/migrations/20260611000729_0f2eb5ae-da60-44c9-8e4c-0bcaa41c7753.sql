
-- Enable RLS on realtime.messages so channel subscriptions are authorized.
ALTER TABLE IF EXISTS realtime.messages ENABLE ROW LEVEL SECURITY;

-- Drop any prior policy with the same name so this migration is idempotent.
DROP POLICY IF EXISTS "Authenticated users can read realtime messages" ON realtime.messages;

-- Only authenticated users may subscribe / receive realtime broadcasts.
-- We deliberately do not narrow by topic here because the published tables
-- (ia_web_events, segmentos, segmentos_notas, maturidade, app_settings) are
-- already gated by per-table RLS for authenticated users.
CREATE POLICY "Authenticated users can read realtime messages"
  ON realtime.messages
  FOR SELECT
  TO authenticated
  USING (true);
