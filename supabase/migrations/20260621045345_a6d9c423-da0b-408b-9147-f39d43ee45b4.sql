
REVOKE ALL ON TABLE public.colaboradores FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.colaboradores TO authenticated;
GRANT ALL ON public.colaboradores TO service_role;

DROP POLICY IF EXISTS "deny anon access colaboradores" ON public.colaboradores;
CREATE POLICY "deny anon access colaboradores"
ON public.colaboradores
AS RESTRICTIVE
FOR ALL
TO anon
USING (false)
WITH CHECK (false);
