-- Reverte o efeito do backfill 20260703230000 para vulnerabilidades cujo FQDN
-- pertence a aplicações registradas sob "Segurança Informação" (ou qualquer
-- dept cujo nome comece com "Segurança").
--
-- O backfill anterior usou JOIN não-determinístico quando um FQDN aparecia em
-- mais de um departamento na tabela applications, podendo mover vulns que já
-- estavam corretamente sob Segurança Informação para outros depts.
--
-- Esta migration corrige revertendo: para cada vuln cujo FQDN bate com uma
-- aplicação de Segurança Informação, força department_id = dept de SI.
-- Usa DISTINCT ON (lower(a.name)) ORDER BY a.created_at para ser determinístico.

WITH si_apps AS (
  SELECT DISTINCT ON (lower(a.name))
    lower(a.name)  AS fqdn_key,
    a.department_id AS dept_id,
    d.name          AS dept_name
  FROM public.applications a
  JOIN public.departments d ON d.id = a.department_id
  WHERE d.name ILIKE 'Seguran%'
  ORDER BY lower(a.name), a.created_at
)
UPDATE public.vulnerabilities_aplicacao AS v
SET department_id = si.dept_id,
    responsible   = si.dept_name
FROM si_apps AS si
WHERE lower(v.fqdn) = si.fqdn_key
  AND v.department_id IS DISTINCT FROM si.dept_id;

WITH si_apps AS (
  SELECT DISTINCT ON (lower(a.name))
    lower(a.name)  AS fqdn_key,
    a.department_id AS dept_id,
    d.name          AS dept_name
  FROM public.applications a
  JOIN public.departments d ON d.id = a.department_id
  WHERE d.name ILIKE 'Seguran%'
  ORDER BY lower(a.name), a.created_at
)
UPDATE public.vulnerabilities_infra AS v
SET department_id = si.dept_id,
    responsible   = si.dept_name
FROM si_apps AS si
WHERE lower(v.fqdn) = si.fqdn_key
  AND v.department_id IS DISTINCT FROM si.dept_id;
