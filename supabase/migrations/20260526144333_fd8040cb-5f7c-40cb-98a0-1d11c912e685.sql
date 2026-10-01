
-- audit_logs: admin-only read
DROP POLICY IF EXISTS "audit_select" ON public.audit_logs;
CREATE POLICY "admin view audit logs"
  ON public.audit_logs FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- email_logs: admin or creator
DROP POLICY IF EXISTS "auth view email logs" ON public.email_logs;
CREATE POLICY "admin or owner view email logs"
  ON public.email_logs FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR created_by = auth.uid());

-- integrations: admin-only read (already admin-only manage, but view was open)
DROP POLICY IF EXISTS "auth view integrations" ON public.integrations;
-- admin manage (ALL) already covers SELECT for admins; no extra policy needed.

-- smtp_config: explicit admin select (admin manage ALL already covers it, but make explicit)
DROP POLICY IF EXISTS "admin view smtp" ON public.smtp_config;
CREATE POLICY "admin view smtp"
  ON public.smtp_config FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- cloudflare_firewall_events: restrict view to admin/analista
DROP POLICY IF EXISTS "auth view cf fw" ON public.cloudflare_firewall_events;
CREATE POLICY "analyst+admin view cf fw"
  ON public.cloudflare_firewall_events FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR has_role(auth.uid(), 'analista'::app_role));

-- module_admins: restrict view
DROP POLICY IF EXISTS "auth view module admins" ON public.module_admins;
CREATE POLICY "admin or self view module admins"
  ON public.module_admins FOR SELECT TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role) OR is_any_module_admin(auth.uid()) OR user_id = auth.uid());

-- user_module_permissions: prevent module admins from granting actions outside the module catalog
DROP POLICY IF EXISTS "module admin insert permissions" ON public.user_module_permissions;
CREATE POLICY "module admin insert permissions"
  ON public.user_module_permissions FOR INSERT TO authenticated
  WITH CHECK (
    is_module_admin(auth.uid(), module_slug)
    AND granted_by = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.module_permissions mp
      WHERE mp.module_slug = user_module_permissions.module_slug
        AND mp.action = user_module_permissions.action
    )
  );

DROP POLICY IF EXISTS "module admin delete permissions" ON public.user_module_permissions;
CREATE POLICY "module admin delete permissions"
  ON public.user_module_permissions FOR DELETE TO authenticated
  USING (is_module_admin(auth.uid(), module_slug));
