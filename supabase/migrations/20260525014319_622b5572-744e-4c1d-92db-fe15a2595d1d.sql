
ALTER TABLE public.cloudflare_sync_state
  ADD COLUMN IF NOT EXISTS zone_id text NOT NULL DEFAULT '';

ALTER TABLE public.cloudflare_sync_state
  DROP CONSTRAINT IF EXISTS cloudflare_sync_state_pkey;

ALTER TABLE public.cloudflare_sync_state
  ADD CONSTRAINT cloudflare_sync_state_pkey PRIMARY KEY (account_id, zone_id);
