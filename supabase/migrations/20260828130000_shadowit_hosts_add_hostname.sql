-- Teste real mostrou a separação errada: host interno com hostname
-- resolvido estava caindo em Ativos Descobertos do DAST. Critério corrigido
-- com o usuário: TODA descoberta de host interno (com ou sem nome) é
-- Shadow IT -- DAST fica exclusivamente com descoberta externa (Amass/
-- Cloudflare). O FQDN não se perde, só deixa de virar "Ativo Descoberto"
-- automático do DAST -- passa a viver aqui em shadowit_hosts.

ALTER TABLE public.shadowit_hosts
  ADD COLUMN hostname text;

CREATE OR REPLACE FUNCTION public.upsert_shadowit_hosts(p_rows jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  WITH incoming AS (
    SELECT DISTINCT ON (lower(trim(coalesce(elem ->> 'ip', ''))))
      elem AS row_data
    FROM jsonb_array_elements(p_rows) AS elem
  )
  INSERT INTO public.shadowit_hosts (ip, hostname, mac, source, scan_id, first_seen_at, last_seen_at)
  SELECT
    row_data ->> 'ip',
    NULLIF(row_data ->> 'hostname', ''),
    NULLIF(row_data ->> 'mac', ''),
    coalesce(row_data ->> 'source', 'nmap'),
    (row_data ->> 'scan_id')::uuid,
    now(),
    now()
  FROM incoming
  WHERE coalesce(row_data ->> 'ip', '') <> ''
  ON CONFLICT ON CONSTRAINT shadowit_hosts_ip_unique
  DO UPDATE SET
    hostname     = coalesce(EXCLUDED.hostname, shadowit_hosts.hostname),
    mac          = coalesce(EXCLUDED.mac, shadowit_hosts.mac),
    source       = EXCLUDED.source,
    scan_id      = EXCLUDED.scan_id,
    last_seen_at = now();
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_shadowit_hosts(jsonb) TO service_role;
