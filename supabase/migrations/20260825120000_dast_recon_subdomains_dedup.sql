-- Deduplicação de dast_recon_subdomains -- hoje cada descoberta (Amass,
-- rede interna, e a nova via Cloudflare) insere direto, sem checar se o
-- mesmo subdomínio já foi catalogado antes. Resultado: rodar Amass duas
-- vezes, ou combinar Amass com o pull da zona Cloudflare, duplica linha na
-- tela "Ativos Descobertos" pro mesmo host. Mesmo padrão já usado em
-- dast_vulnerabilities (20260821150000/20260821160000): cleanup das
-- duplicatas existentes primeiro, depois colunas normalizadas GENERATED +
-- UNIQUE + função upsert que atualiza em vez de duplicar.
--
-- scope entra na identidade de propósito -- o mesmo hostname pode
-- legitimamente existir com resolução diferente interna vs externa (split-
-- horizon DNS), então não são o mesmo "ativo".

-- 1) Cleanup: mantém 1 linha por (subdomain, scope), a mais recente
-- (discovered_at), remove o resto.
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY lower(trim(subdomain)), lower(trim(scope))
      ORDER BY discovered_at DESC, id DESC
    ) AS rn
  FROM public.dast_recon_subdomains
)
DELETE FROM public.dast_recon_subdomains
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);

-- 2) Identidade normalizada + constraint.
ALTER TABLE public.dast_recon_subdomains
  ADD COLUMN subdomain_norm text GENERATED ALWAYS AS (lower(trim(subdomain))) STORED,
  ADD COLUMN scope_norm text GENERATED ALWAYS AS (lower(trim(scope))) STORED;

ALTER TABLE public.dast_recon_subdomains
  ADD CONSTRAINT dast_recon_subdomains_identity_unique
  UNIQUE (subdomain_norm, scope_norm);

-- 3) Upsert: reencontrar o mesmo ativo (de qualquer fonte -- Amass, rede
-- interna, ou o novo pull direto da zona Cloudflare) atualiza scan_id
-- (última fonte que confirmou) + ip + discovered_at, em vez de duplicar.
CREATE OR REPLACE FUNCTION public.upsert_dast_recon_subdomains(p_rows jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  WITH incoming AS (
    SELECT DISTINCT ON (
      lower(trim(coalesce(elem ->> 'subdomain', ''))),
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
