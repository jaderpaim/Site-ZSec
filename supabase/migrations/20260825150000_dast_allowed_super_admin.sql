-- is_dast_allowed() só reconhecia has_role(_uid, 'admin'), então super_admin
-- (papel criado em 20260825130000/20260825140000) fica barrado do DAST
-- Scanner mesmo com departamento "Segurança da Informação" correto.
--
-- Esta função não tem migration de criação neste repositório (foi criada
-- direto no banco, fora do controle de versão) — a definição abaixo foi
-- capturada via `SELECT pg_get_functiondef('public.is_dast_allowed'::regproc)`
-- antes de alterar, pra preservar tudo igual e só adicionar o papel
-- super_admin na checagem de role.

CREATE OR REPLACE FUNCTION public.is_dast_allowed(_uid uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT
    (public.has_role(_uid, 'admin'::app_role) OR public.has_role(_uid, 'super_admin'::app_role))
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.departments d ON d.id = p.department_id
      WHERE p.id = _uid
        AND translate(lower(coalesce(d.name, '')), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') LIKE '%seguran%inform%'
    );
$function$;
