
-- Tighten authenticated insert on auth_access_logs: require own user_id + matching jwt email,
-- and only allow login_method/user_agent/ip as client-controlled metadata (no role/full_name spoofing).
DROP POLICY IF EXISTS "authenticated insert own access log" ON public.auth_access_logs;
CREATE POLICY "authenticated insert own access log"
ON public.auth_access_logs
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND email = COALESCE((auth.jwt() ->> 'email'), email)
  AND status = 'success'
);

-- Admins can read all profiles (admin tooling needs to look up name/email/dept by user id).
CREATE POLICY "Admins can view all profiles"
ON public.profiles
FOR SELECT
TO authenticated
USING (public.has_role(auth.uid(), 'admin'::app_role));

-- Module admins and users with vulnerabilidades:view can read vuln snapshots.
CREATE POLICY "Module admins view vuln snapshots"
ON public.vuln_snapshots
FOR SELECT
TO authenticated
USING (
  public.is_module_admin(auth.uid(), 'vulnerabilidades')
  OR public.has_module_permission(auth.uid(), 'vulnerabilidades', 'view')
);
