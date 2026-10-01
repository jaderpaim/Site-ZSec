
-- 1) auth_access_logs: restrict SELECT to admins/logs-permission only; remove from Realtime publication
DROP POLICY IF EXISTS "auth view access logs" ON public.auth_access_logs;
CREATE POLICY "logs view access logs" ON public.auth_access_logs
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.is_module_admin(auth.uid(), 'logs')
    OR public.has_module_permission(auth.uid(), 'logs', 'view')
  );

-- Remove sensitive table from Realtime publication to stop broadcasting rows
ALTER PUBLICATION supabase_realtime DROP TABLE public.auth_access_logs;

-- 2) aprovadores: restrict SELECT to module-permission holders
DROP POLICY IF EXISTS "view aprovadores" ON public.aprovadores;
CREATE POLICY "view aprovadores by permission" ON public.aprovadores
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'analista'::app_role)
    OR public.is_module_admin(auth.uid(), 'aprovadores')
    OR public.has_module_permission(auth.uid(), 'aprovadores', 'view')
  );

-- 3) colaboradores: restrict SELECT to admins/analysts
DROP POLICY IF EXISTS "auth view colaboradores" ON public.colaboradores;
CREATE POLICY "analyst+admin view colaboradores" ON public.colaboradores
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'analista'::app_role)
  );

-- 4) gmud_aprovadores: restrict SELECT to analysts/admins or the approver themselves
DROP POLICY IF EXISTS "auth view gmud aprov" ON public.gmud_aprovadores;
CREATE POLICY "analyst+admin or approver view gmud aprov" ON public.gmud_aprovadores
  FOR SELECT TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin'::app_role)
    OR public.has_role(auth.uid(), 'analista'::app_role)
    OR lower(email_aprovador) = lower((auth.jwt() ->> 'email'))
  );

-- 5) sophos_encryption_summary: fix SECURITY DEFINER exposure + mutable search_path
CREATE OR REPLACE FUNCTION public.sophos_encryption_summary()
 RETURNS TABLE(category text, encrypted boolean, total bigint)
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
  SELECT
    CASE WHEN lower(type) = 'server' THEN 'server' ELSE 'endpoint' END AS category,
    sophos_endpoints.encrypted,
    count(*) AS total
  FROM public.sophos_endpoints
  GROUP BY category, sophos_endpoints.encrypted;
$function$;

REVOKE EXECUTE ON FUNCTION public.sophos_encryption_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sophos_encryption_summary() TO authenticated, service_role;
