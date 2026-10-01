-- QRadar não manda um timestamp confiável de "último evento" por fonte de log
-- nesse ambiente (confirmado via raw: o endpoint em uso só devolve
-- status/messages/last_updated, e last_updated vem sempre 0) — ver discussão
-- na sessão do SOC. Em vez de depender do QRadar, passamos a rastrear nós
-- mesmos desde quando cada fonte está no status atual, via trigger: só grava
-- now() quando o status realmente muda (ou na primeira vez que a fonte
-- aparece), preservando o valor anterior quando o status se repete.
ALTER TABLE public.qradar_log_sources
  ADD COLUMN status_changed_at timestamptz;

-- Backfill: não temos histórico de quando cada fonte mudou de status pela
-- última vez, então usamos synced_at como aproximação por baixo ("monitorado
-- nesse status pelo menos desde X") — a partir da próxima mudança real,
-- o trigger abaixo passa a manter isso com precisão.
UPDATE public.qradar_log_sources SET status_changed_at = synced_at WHERE status_changed_at IS NULL;

CREATE OR REPLACE FUNCTION public.qradar_log_sources_track_status_change()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_changed_at := now();
  ELSE
    NEW.status_changed_at := OLD.status_changed_at;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER qradar_log_sources_track_status_change
  BEFORE INSERT OR UPDATE ON public.qradar_log_sources
  FOR EACH ROW
  EXECUTE FUNCTION public.qradar_log_sources_track_status_change();
