
-- Defense-in-depth: explicitly remove all table privileges from anon and PUBLIC
REVOKE ALL ON TABLE public.integrations FROM PUBLIC, anon;

-- Re-affirm only authenticated and service_role hold privileges (RLS still restricts to admin)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.integrations TO authenticated;
GRANT ALL ON public.integrations TO service_role;

-- Explicit restrictive RLS denying anonymous role under any circumstance
DROP POLICY IF EXISTS "deny anon access integrations" ON public.integrations;
CREATE POLICY "deny anon access integrations"
ON public.integrations
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);
