-- Adiciona o papel global "personalizado": sem nenhuma permissão por padrão,
-- toda concessão é manual via permissões granulares por módulo (já existentes).
ALTER TYPE public.app_role ADD VALUE 'personalizado';
