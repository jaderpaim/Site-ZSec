-- Painel Executivo não tinha entrada no catálogo de permissões — o toggle
-- "Visualizar" nunca aparecia na tela de Usuários pra esse módulo (ficava
-- "Nenhuma ação cadastrada"), diferente de todos os outros módulos. O backend
-- (getExecutiveOverview, get_exec_ia_overview, get_exec_vulnerabilities_overview)
-- já checa `painel-executivo:view` — só faltava a permissão existir pra poder
-- ser concedida.

INSERT INTO public.module_permissions (module_slug, action, label, description, sort_order)
VALUES ('painel-executivo', 'view', 'Visualizar', 'Ver o Painel Executivo', 1)
ON CONFLICT (module_slug, action) DO NOTHING;

-- Backfill: Visualizador já segue a regra "recebe view de todo módulo que não
-- é admin-only" (ver apply_role_defaults) — sem isso, quem já é Visualizador
-- só passaria a ver o Painel Executivo depois de uma troca de papel.
INSERT INTO public.user_module_permissions (user_id, module_slug, action, granted_by)
SELECT ur.user_id, 'painel-executivo', 'view', ur.user_id
FROM public.user_roles ur
WHERE ur.role = 'visualizador'
ON CONFLICT (user_id, module_slug, action) DO NOTHING;
