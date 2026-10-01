-- Nova constraint de identidade para vulnerabilities_infra, incluindo Porta.
-- Deve rodar DEPOIS de 20260812140000_infra_cleanup_duplicates_with_port.sql (que remove as
-- duplicatas que violariam esta constraint).
--
-- A constraint anterior (department_id, fqdn, vuln_type), de 20260701150001, foi revertida em
-- 20260701160000 porque o mesmo host reporta a mesma vulnerabilidade em várias portas
-- distintas (ex.: um achado de SSL/TLS visto em 14 portas diferentes do mesmo servidor) —
-- sem Porta na chave, a constraint colapsava essas instâncias legítimas.
--
-- department_id foi removido da chave (o dedupe já usado no frontend, em
-- VulnerabilidadesReal.tsx, nunca usou department_id na identidade) — fqdn + vuln_type +
-- Porta já é específico o bastante, e manter department_id na chave faria uma simples
-- correção de departamento no meio do caminho gerar uma linha duplicada em vez de atualizar
-- a existente.

ALTER TABLE public.vulnerabilities_infra
  ADD COLUMN fqdn_norm text GENERATED ALWAYS AS (lower(trim(fqdn))) STORED,
  ADD COLUMN vuln_type_norm text GENERATED ALWAYS AS (
    lower(trim(coalesce(vuln_type, raw ->> 'Vulnerabilidade', raw ->> 'Vulnerability', '')))
  ) STORED,
  ADD COLUMN porta_norm text GENERATED ALWAYS AS (
    lower(trim(coalesce(raw ->> 'Porta', raw ->> 'Port', raw ->> 'Campo personalizado (Port)', '')))
  ) STORED;

ALTER TABLE public.vulnerabilities_infra
  ADD CONSTRAINT vulnerabilities_infra_identity_unique_v2
  UNIQUE (fqdn_norm, vuln_type_norm, porta_norm);
