-- RPC que fecha achados de infra "sumidos" — chamada pelo Upload.tsx logo depois do
-- upsert_vuln_infra de cada import, passando TODAS as linhas do arquivo (não por lote), pra
-- que a lista de hosts/chaves "vistos neste import" fique completa.
--
-- Importante (segurança do dado): só fecha achados de hosts (fqdn) que aparecem em ALGUMA
-- linha deste import — nunca fecha por ausência um host que simplesmente não fez parte do
-- arquivo (ex.: import parcial por departamento). "Esse host apareceu no arquivo mas essa
-- vulnerabilidade específica dele não" é o único sinal que consideramos confiável o
-- suficiente pra presumir corrigido.
--
-- Só mexe em achados com status Aberta/Em tratamento — não sobrescreve Mitigada/Fechada já
-- setados por outro motivo (aprovação manual, Fix explícito, etc.), evitando reverter uma
-- correção genuína ou uma decisão humana já registrada.

CREATE OR REPLACE FUNCTION public.close_missing_infra_vulns(p_rows jsonb, p_reference_at timestamptz)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  WITH incoming_keys AS (
    SELECT DISTINCT
      lower(trim(elem ->> 'fqdn')) AS fqdn_norm,
      lower(trim(coalesce(elem ->> 'vuln_type', elem -> 'raw' ->> 'Vulnerabilidade', elem -> 'raw' ->> 'Vulnerability', ''))) AS vuln_type_norm,
      lower(trim(coalesce(elem -> 'raw' ->> 'Porta', elem -> 'raw' ->> 'Port', elem -> 'raw' ->> 'Campo personalizado (Port)', ''))) AS porta_norm
    FROM jsonb_array_elements(p_rows) AS elem
  ),
  scanned_fqdns AS (
    SELECT DISTINCT fqdn_norm FROM incoming_keys
  )
  UPDATE public.vulnerabilities_infra v
  SET
    status = 'Fechada',
    closed_at = p_reference_at,
    presumed_closed = true
  WHERE v.status IN ('Aberta', 'Em tratamento')
    AND v.fqdn_norm IN (SELECT fqdn_norm FROM scanned_fqdns)
    AND NOT EXISTS (
      SELECT 1 FROM incoming_keys k
      WHERE k.fqdn_norm = v.fqdn_norm
        AND k.vuln_type_norm = v.vuln_type_norm
        AND k.porta_norm = v.porta_norm
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.close_missing_infra_vulns(jsonb, timestamptz) TO authenticated;
