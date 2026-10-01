-- Add enabled flag to cron_job_runs so the UI can activate/deactivate tracking
-- and hooks can optionally skip execution when disabled.
ALTER TABLE public.cron_job_runs
  ADD COLUMN IF NOT EXISTS enabled boolean NOT NULL DEFAULT true;

-- Allow admins (service_role) to update via server functions
-- (authenticated role keeps SELECT-only — writes go through server functions)
GRANT UPDATE ON public.cron_job_runs TO service_role;
