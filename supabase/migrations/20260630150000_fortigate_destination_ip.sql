-- O detalhamento Fortigate (SocReal.tsx) mostra IP de origem mas não tinha
-- IP de destino — o QRadar já traz esse dado por evento (destinationip), só
-- não estava sendo extraído nas AQLs de syncFortigatePolicyChanges /
-- syncFortigateAdminConfigChanges / syncFortigateAdminLogins.
ALTER TABLE public.qradar_fortigate_policy_changes ADD COLUMN IF NOT EXISTS destination_ip text;
