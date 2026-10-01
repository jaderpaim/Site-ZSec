-- Backfill em lote 0 de 8 (ver 20260629160000_sophos_events_detection_category_schema.sql
-- para o contexto). Cada lote cobre ~1/8 das linhas de sophos_events,
-- selecionadas por hash do id (não depende de distribuição por data) —
-- arquivo simples, sem loop e sem COMMIT, pra não depender de como a
-- ferramenta de migration trata transações.
UPDATE public.sophos_events
SET
  detection_category = CASE
    WHEN lower(coalesce(type,'') || ' ' || coalesce(name,'')) ~ 'runtime|exploit|live protection|behaviour|behavior' THEN 'Detecções em tempo de execução'
    WHEN lower(coalesce(type,'') || ' ' || coalesce(name,'')) ~ '(^|[^a-z])pua([^a-z]|$)|potentially unwanted|corepua' THEN 'PUA'
    WHEN lower(coalesce(type,'') || ' ' || coalesce(name,'')) ~ 'malware|virus|troj|worm|ransom|htmlgen|infected|ameaça' THEN 'Malwares'
    WHEN lower(coalesce(type,'') || ' ' || coalesce(name,'')) ~ 'encrypt|criptograf|denc|bitlocker|filevault|disknotencrypted' THEN 'Criptografia de Dispositivo'
    WHEN lower(coalesce(type,'') || ' ' || coalesce(name,'')) ~ 'application control|app control|appcontrol|aplicativo controlado' THEN 'Controle de Aplicativos'
    WHEN lower(coalesce(type,'') || ' ' || coalesce(name,'')) ~ 'policy violation|violação de política|compliance|redirecionou o bloco tag|alertado devido a tag' THEN 'Violação de Política'
    WHEN lower(coalesce(type,'') || ' ' || coalesce(name,'')) ~ 'web threat|url threat|bloqueado devido a|htmlinj|web protection|web control' THEN 'Controle da Web'
    WHEN lower(coalesce(type,'') || ' ' || coalesce(name,'')) ~ 'peripheral|periférico|device control|(^|[^a-z])usb([^a-z]|$)|removable storage|armazenamento removível|bluetooth|peripheralallowed|peripheralblocked|bloqueado devido ao controle de dispositivo' THEN 'Controle de Periféricos'
    ELSE NULL
  END,
  user_normalized = NULLIF(trim(regexp_replace(user_name, '^[^\\]+\\', '')), '')
WHERE mod(abs(hashtext(id)), 8) = 0
  AND detection_category IS NULL;
