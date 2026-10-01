-- Add status_changed_at to both vulnerability tables
-- identified_at = original discovery/scan date (preserved on re-import)
-- status_changed_at = when status last changed (scan date on import, today on manual change)

ALTER TABLE public.vulnerabilities_aplicacao
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;

ALTER TABLE public.vulnerabilities_infra
  ADD COLUMN IF NOT EXISTS status_changed_at timestamptz;

-- Backfill existing records: closed/mitigated use closed_at, others use identified_at
UPDATE public.vulnerabilities_aplicacao
  SET status_changed_at = COALESCE(closed_at, identified_at::timestamptz)
  WHERE status_changed_at IS NULL;

UPDATE public.vulnerabilities_infra
  SET status_changed_at = COALESCE(closed_at, identified_at::timestamptz)
  WHERE status_changed_at IS NULL;
