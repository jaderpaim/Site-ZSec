-- ATENÇÃO: esta migration ALTERA DADOS (DELETE), não só schema/funções.
-- Limpeza retroativa da lacuna descrita em 20260825140100: remove, de quem
-- HOJE tem o papel "admin", a linha de module_admins do módulo "usuarios" e
-- as linhas de user_module_permissions ('usuarios:view', 'usuarios:manage')
-- que vieram do apply_role_defaults antigo (de antes de "usuarios" virar
-- exclusivo de "super_admin"). Sem isso, alguém com papel "admin" ainda
-- carrega essas linhas residuais no banco — inofensivo para a aplicação
-- (assertCanManageUsers não consulta module_admins pra admin/super_admin),
-- mas visível/reconcedido em qualquer policy de RLS que confie nessas tabelas.
-- Revise antes de aplicar em produção.

DELETE FROM public.module_admins ma
USING public.user_roles ur
WHERE ma.user_id = ur.user_id
  AND ur.role = 'admin'
  AND ma.module_slug = 'usuarios';

DELETE FROM public.user_module_permissions ump
USING public.user_roles ur
WHERE ump.user_id = ur.user_id
  AND ur.role = 'admin'
  AND ump.module_slug = 'usuarios';
