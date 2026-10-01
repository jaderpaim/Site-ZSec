CREATE TABLE public.auth_access_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  email text NOT NULL,
  user_id uuid,
  full_name text,
  role text,
  status text NOT NULL CHECK (status IN ('success','error')),
  error_message text,
  ip text,
  user_agent text
);

GRANT SELECT, INSERT ON public.auth_access_logs TO authenticated;
GRANT INSERT ON public.auth_access_logs TO anon;
GRANT ALL ON public.auth_access_logs TO service_role;

ALTER TABLE public.auth_access_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone can insert access log"
ON public.auth_access_logs FOR INSERT TO anon, authenticated
WITH CHECK (true);

CREATE POLICY "auth view access logs"
ON public.auth_access_logs FOR SELECT TO authenticated
USING (true);

CREATE INDEX idx_auth_access_logs_created_at ON public.auth_access_logs (created_at DESC);
CREATE INDEX idx_auth_access_logs_user_id ON public.auth_access_logs (user_id);