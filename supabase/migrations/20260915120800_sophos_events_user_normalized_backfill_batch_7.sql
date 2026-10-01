-- Backfill de user_normalized em sophos_events — lote 7 de 8 (ver
-- 20260915120100_sophos_events_user_normalized_backfill_batch_0.sql para o
-- contexto completo).
UPDATE public.sophos_events
SET user_normalized = NULLIF(
  trim(
    CASE WHEN position(chr(92) in source) > 0 THEN split_part(source, chr(92), 2) ELSE source END
  ),
  ''
)
WHERE mod(abs(hashtext(id)), 8) = 7
  AND user_normalized IS NULL
  AND source IS NOT NULL
  AND trim(source) <> '';
