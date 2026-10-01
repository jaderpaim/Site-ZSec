DROP POLICY IF EXISTS "escrita autenticada" ON public.app_settings;
CREATE POLICY "app_settings admin write" ON public.app_settings FOR INSERT TO authenticated WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "app_settings admin update" ON public.app_settings FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role)) WITH CHECK (public.has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "app_settings admin delete" ON public.app_settings FOR DELETE TO authenticated USING (public.has_role(auth.uid(), 'admin'::app_role));