DROP POLICY IF EXISTS "auth view policies" ON public.policies;
CREATE POLICY "policies select by permission" ON public.policies FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin'::app_role)
  OR public.is_module_admin(auth.uid(), 'politicas'::text)
  OR public.has_module_permission(auth.uid(), 'politicas'::text, 'view'::text)
);