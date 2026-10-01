-- Distingue, dentro da mesma tabela qradar_fortigate_policy_changes, qual AQL
-- gerou cada linha: a original de "Policy Change" (policy_change) ou a nova de
-- acesso administrativo + mudanças de config (admin_config). Ambas alimentam
-- o mesmo quadro "Detalhamento - Fortigate" no painel SOC, diferenciadas por
-- uma coluna "Tipo" na UI.
ALTER TABLE public.qradar_fortigate_policy_changes ADD COLUMN IF NOT EXISTS query_type text NOT NULL DEFAULT 'policy_change';
