-- ATENÇÃO: esta migration ALTERA DADOS (DELETE), não só schema/funções.
-- Limpeza retroativa: remove, de quem HOJE tem o papel "admin", a linha de
-- module_admins do módulo "benchmark" e as linhas de user_module_permissions
-- ('benchmark:view', 'benchmark:manage') — concedidas em
-- 20260824190000_benchmark_grant_existing_admins.sql (ainda não commitada) e/ou
-- pelo apply_role_defaults antigo, de antes de "benchmark" virar módulo
-- exclusivo de super_admin (20260826120000). Sem isso, admin continua com
-- acesso real ao Benchmark via linha na tabela, mesmo com is_module_admin/
-- has_module_permission já corrigidos para negar o bypass automático dele.
-- Revise antes de aplicar em produção.

DELETE FROM public.module_admins ma
USING public.user_roles ur
WHERE ma.user_id = ur.user_id
  AND ur.role = 'admin'
  AND ma.module_slug = 'benchmark';

DELETE FROM public.user_module_permissions ump
USING public.user_roles ur
WHERE ump.user_id = ur.user_id
  AND ur.role = 'admin'
  AND ump.module_slug = 'benchmark';
