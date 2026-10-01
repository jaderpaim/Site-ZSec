-- Re-sincroniza department_id nas vulnerabilidades onde o FQDN agora
-- corresponde a uma aplicação cadastrada mas o department_id ainda está NULL
-- ou desatualizado. Seguro: ignora linhas onde a atualização causaria conflito
-- com o unique constraint (department_id, fqdn, vuln_type).

UPDATE public.vulnerabilities_aplicacao AS v
SET department_id = a.department_id,
    responsible   = d.name
FROM public.applications AS a
JOIN public.departments  AS d ON d.id = a.department_id
WHERE LOWER(v.fqdn) = LOWER(a.name)
  AND v.department_id IS DISTINCT FROM a.department_id
  AND NOT EXISTS (
    SELECT 1 FROM public.vulnerabilities_aplicacao v2
    WHERE v2.department_id = a.department_id
      AND LOWER(v2.fqdn) = LOWER(v.fqdn)
      AND v2.id != v.id
  );

UPDATE public.vulnerabilities_infra AS v
SET department_id = a.department_id,
    responsible   = d.name
FROM public.applications AS a
JOIN public.departments  AS d ON d.id = a.department_id
WHERE LOWER(v.fqdn) = LOWER(a.name)
  AND v.department_id IS DISTINCT FROM a.department_id
  AND NOT EXISTS (
    SELECT 1 FROM public.vulnerabilities_infra v2
    WHERE v2.department_id = a.department_id
      AND LOWER(v2.fqdn) = LOWER(v.fqdn)
      AND v2.vuln_type IS NOT DISTINCT FROM v.vuln_type
      AND v2.id != v.id
  );
