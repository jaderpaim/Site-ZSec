-- Backfill em lote 0 de 8 (mesmo esquema de 20260629160000_sophos_events_detection_category_schema.sql):
-- desde que o campo "user" do payload SIEM da Sophos sumiu (usuário passou
-- a vir só em "source", formato "DOMINIO\usuario"), a sincronização parou
-- de preencher user_normalized pra eventos novos (null desde ~2026-05-20).
-- Fix em código: src/lib/sophos.server.ts (pick() de userName agora inclui
-- "source"). Este e os próximos 7 arquivos corrigem o histórico já
-- gravado, um lote por vez pra não estourar o timeout do SQL editor
-- (tabela tem >1M linhas). chr(92) no lugar do backslash literal pra
-- evitar qualquer ambiguidade de escape no editor.
UPDATE public.sophos_events
SET user_normalized = NULLIF(
  trim(
    CASE WHEN position(chr(92) in source) > 0 THEN split_part(source, chr(92), 2) ELSE source END
  ),
  ''
)
WHERE mod(abs(hashtext(id)), 8) = 0
  AND user_normalized IS NULL
  AND source IS NOT NULL
  AND trim(source) <> '';
