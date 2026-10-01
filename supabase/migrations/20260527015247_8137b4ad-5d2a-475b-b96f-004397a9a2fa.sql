ALTER TABLE public.vulnerabilities
ADD COLUMN IF NOT EXISTS pending_status text,
ADD COLUMN IF NOT EXISTS mitigation_description text;