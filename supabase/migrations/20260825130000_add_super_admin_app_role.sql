-- Adiciona o papel global "super_admin": mesma visibilidade/operação de um
-- admin global em todos os módulos, exceto o módulo "usuarios" — não pode
-- gerenciar papéis, permissões, convites, senha ou dados de outros usuários
-- (isso continua exclusivo do papel "admin", ver assertCanManageUsers em
-- users.functions.ts e a migration seguinte para os helpers de RLS).
ALTER TYPE public.app_role ADD VALUE 'super_admin';