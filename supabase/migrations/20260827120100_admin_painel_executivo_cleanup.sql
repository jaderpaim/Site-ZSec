-- ATENÇÃO: esta migration ALTERA DADOS (DELETE), não só schema/funções.
-- Limpeza retroativa: remove, de quem HOJE tem o papel "admin", a linha de
-- module_admins do módulo "painel-executivo" e a linha de
-- user_module_permissions ('painel-executivo:view') — concedidas pelo
-- apply_role_defaults antigo, de antes de "painel-executivo" virar exclusivo
-- de super_admin (20260827120000). Sem isso, admin continua com acesso real
-- via linha na tabela, mesmo com is_module_admin/has_module_permission já
-- corrigidos para negar o bypass automático dele.
--
-- Só afeta quem tem papel "admin" — visualizador/analista/personalizado que
-- já tinham 'painel-executivo:view' NÃO são tocados aqui (decisão consciente,
-- ver 20260827120000_painel_executivo_exclusive.sql).
-- Revise antes de aplicar em produção.

DELETE FROM public.module_admins ma
USING public.user_roles ur
WHERE ma.user_id = ur.user_id
  AND ur.role = 'admin'
  AND ma.module_slug = 'painel-executivo';

DELETE FROM public.user_module_permissions ump
USING public.user_roles ur
WHERE ump.user_id = ur.user_id
  AND ur.role = 'admin'
  AND ump.module_slug = 'painel-executivo';
