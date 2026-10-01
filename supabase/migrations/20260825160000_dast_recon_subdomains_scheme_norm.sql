-- A normalização de identidade de 20260825120000 só fazia lower(trim(...)),
-- sem remover esquema -- Amass grava subdomínio com "https://" na frente
-- (confirmado no código do scanner), o pull da zona Cloudflare grava puro
-- (r.name da API, sem esquema). Resultado: as duas strings nunca colidiam
-- na UNIQUE constraint, o mesmo host real virava 2 linhas (uma por fonte),
-- burlando a dedup que a migration anterior deveria garantir.
--
-- Coluna GENERATED não aceita ALTER de expressão -- precisa dropar e
-- recriar. Ordem: dropar constraint (depende da coluna) -> dropar coluna ->
-- recriar coluna com normalização corrigida (recalcula sozinha pra todas
-- as linhas existentes) -> limpar as duplicatas que só apareceram por causa
-- do esquema divergente -> recriar a constraint.

ALTER TABLE public.dast_recon_subdomains
  DROP CONSTRAINT dast_recon_subdomains_identity_unique;

ALTER TABLE public.dast_recon_subdomains
  DROP COLUMN subdomain_norm;

ALTER TABLE public.dast_recon_subdomains
  ADD COLUMN subdomain_norm text GENERATED ALWAYS AS (
    lower(trim(split_part(regexp_replace(subdomain, '^[a-zA-Z][a-zA-Z0-9+.-]*://', ''), '/', 1)))
  ) STORED;

-- Cleanup: agora que subdomain_norm ignora esquema, host igual vindo de
-- fontes diferentes (Amass "https://x" vs Cloudflare "x") colide -- mantém
-- a linha mais recente, remove o resto.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY subdomain_norm, scope_norm
      ORDER BY discovered_at DESC, id DESC
    ) AS rn
  FROM public.dast_recon_subdomains
)
DELETE FROM public.dast_recon_subdomains
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

ALTER TABLE public.dast_recon_subdomains
  ADD CONSTRAINT dast_recon_subdomains_identity_unique
  UNIQUE (subdomain_norm, scope_norm);

-- upsert_dast_recon_subdomains: o DISTINCT ON dentro da própria função
-- decide qual duplicata sobrevive DENTRO de um único lote, antes do
-- ON CONFLICT entrar em ação -- sem a mesma normalização de esquema aqui,
-- um lote que (hipoteticamente) misturasse "https://x" e "x" pro mesmo
-- host faria os dois sobreviverem como grupos distintos e colidirem só na
-- hora do INSERT, disparando "ON CONFLICT DO UPDATE command cannot affect
-- row a second time". Alinhando a normalização evita esse caso.
CREATE OR REPLACE FUNCTION public.upsert_dast_recon_subdomains(p_rows jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  WITH incoming AS (
    SELECT DISTINCT ON (
      lower(trim(split_part(regexp_replace(coalesce(elem ->> 'subdomain', ''), '^[a-zA-Z][a-zA-Z0-9+.-]*://', ''), '/', 1))),
      lower(trim(coalesce(elem ->> 'scope', '')))
    )
      elem AS row_data
    FROM jsonb_array_elements(p_rows) AS elem
  )
  INSERT INTO public.dast_recon_subdomains (scan_id, subdomain, ip, scope, discovered_at)
  SELECT
    (row_data ->> 'scan_id')::uuid,
    row_data ->> 'subdomain',
    row_data ->> 'ip',
    coalesce(row_data ->> 'scope', 'external'),
    now()
  FROM incoming
  ON CONFLICT ON CONSTRAINT dast_recon_subdomains_identity_unique
  DO UPDATE SET
    scan_id       = EXCLUDED.scan_id,
    ip            = coalesce(EXCLUDED.ip, dast_recon_subdomains.ip),
    discovered_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_dast_recon_subdomains(jsonb) TO service_role, authenticated;
