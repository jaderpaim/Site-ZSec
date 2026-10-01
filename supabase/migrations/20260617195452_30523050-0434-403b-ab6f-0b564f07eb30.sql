
-- 1) Pin search_path and revoke public execution on cron scheduling helpers
ALTER FUNCTION public.schedule_hook_cron(text, text, text, text) SET search_path = public;
ALTER FUNCTION public.unschedule_hook_cron(text) SET search_path = public;

REVOKE ALL ON FUNCTION public.schedule_hook_cron(text, text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unschedule_hook_cron(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_hook_cron(text, text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.unschedule_hook_cron(text) TO service_role;

-- 2) Restrict Realtime channel subscriptions to entitled users
DROP POLICY IF EXISTS "Authenticated users can read realtime messages" ON realtime.messages;
DROP POLICY IF EXISTS "Entitled users can read realtime messages" ON realtime.messages;

CREATE POLICY "Entitled users can read realtime messages"
ON realtime.messages
FOR SELECT
TO authenticated
USING (
  -- Admins and analysts can subscribe to any channel
  public.has_role(auth.uid(), 'admin'::public.app_role)
  OR public.has_role(auth.uid(), 'analista'::public.app_role)
  -- Permission self-channels used by usePermissions hook
  OR realtime.topic() = 'permissions:' || auth.uid()::text
  -- Module-scoped topics: "<module-slug>:..." — require module view permission
  OR (
    position(':' in realtime.topic()) > 0
    AND public.has_module_permission(
      auth.uid(),
      split_part(realtime.topic(), ':', 1),
      'view'
    )
  )
);
