-- Remove o módulo Painel C-Level: era específico da empresa de origem (números
-- de alunos/colégios em clevel_contexto) e não faz parte do produto.
-- O código do módulo foi removido junto; aqui saem só as permissões dele.
--
-- has_module_permission/is_module_admin continuam citando 'painel-c-level' na
-- lista de módulos exclusivos (20260904143743). Sem efeito: o slug não existe
-- mais em nenhuma permissão nem no app.

DELETE FROM public.user_module_permissions WHERE module_slug = 'painel-c-level';
DELETE FROM public.module_admins WHERE module_slug = 'painel-c-level';
DELETE FROM public.module_permissions WHERE module_slug = 'painel-c-level';
