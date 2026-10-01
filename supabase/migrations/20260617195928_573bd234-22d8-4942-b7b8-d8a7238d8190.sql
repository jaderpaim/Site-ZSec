
-- Tighten the previously "always-true" ALL policy on vuln_snapshots.
-- This was the catch-all used by the service role for snapshot upserts;
-- restrict it explicitly to the service_role JWT role.
DROP POLICY IF EXISTS "Service role manages vuln snapshots" ON public.vuln_snapshots;

CREATE POLICY "Service role writes vuln snapshots"
ON public.vuln_snapshots
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);
