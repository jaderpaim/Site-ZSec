
CREATE POLICY "admin select integrations"
ON public.integrations
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));
