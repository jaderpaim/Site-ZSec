-- Adiciona "source" (amass/nmap/cloudflare) em dast_recon_subdomains --
-- hoje não tem como saber de onde um ativo catalogado veio sem dar join em
-- dast_scans e inferir pelo mode/engines. Um campo direto facilita mostrar
-- isso na UI.
--
-- NÃO entra na identidade/dedup de propósito -- o mesmo host achado por
-- fontes diferentes continua sendo 1 linha só (senão reintroduz a
-- duplicação que 20260825160000 corrigiu). O valor reflete a fonte mais
-- recente que confirmou aquele ativo, mesmo padrão já usado pra
-- scan_id/ip no ON CONFLICT.

ALTER TABLE public.dast_recon_subdomains
  ADD COLUMN source text;

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
  INSERT INTO public.dast_recon_subdomains (scan_id, subdomain, ip, scope, source, discovered_at)
  SELECT
    (row_data ->> 'scan_id')::uuid,
    row_data ->> 'subdomain',
    row_data ->> 'ip',
    coalesce(row_data ->> 'scope', 'external'),
    row_data ->> 'source',
    now()
  FROM incoming
  ON CONFLICT ON CONSTRAINT dast_recon_subdomains_identity_unique
  DO UPDATE SET
    scan_id       = EXCLUDED.scan_id,
    ip            = coalesce(EXCLUDED.ip, dast_recon_subdomains.ip),
    source        = coalesce(EXCLUDED.source, dast_recon_subdomains.source),
    discovered_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_dast_recon_subdomains(jsonb) TO service_role, authenticated;
