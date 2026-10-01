-- RPC de upsert em lote para vulnerabilities_infra, usando a nova constraint de identidade
-- com Porta (vulnerabilities_infra_identity_unique_v2, ver 20260812140100). Substitui o
-- upsert_vuln_infra original (20260701150002), dropado junto com a constraint antiga em
-- 20260701160000.
--
-- Antes, o import de infra fazia INSERT bruto de toda linha da planilha todo mês (ver
-- Upload.tsx) — cada achado que persiste (Situação = Maintained) virava uma linha nova,
-- e o banco crescia sem limite (~15k linhas pra ~2.400 achados distintos em 9 meses).
-- Com upsert, cada achado ocupa uma única linha, atualizada a cada import:
--   - identified_at nunca regride (LEAST) — preserva a 1ª ocorrência real do achado
--   - closed_at é setado quando o status novo é Mitigada/Fechada, e limpo caso contrário
--     (defensivo: nos dados reais nenhum achado com raw.Situação = Fix reapareceu depois
--     como New/Maintained, mas se acontecer, o registro passa a refletir o scan mais recente)
--   - demais campos (severity, status, raw, status_changed_at etc.) sempre refletem o
--     import mais recente — mesmo comportamento que o dedupe client-side já usa hoje
--     (o snapshot com raw.Atualizado mais recente vence)
--
-- DISTINCT ON no CTE `incoming` protege contra duas linhas do MESMO lote com a mesma chave
-- (já vimos 8 casos assim nos dados reais) — sem isso, "ON CONFLICT DO UPDATE" falha com
-- "command cannot affect row a second time" ao tentar atualizar a mesma linha duas vezes
-- numa única instrução.

CREATE OR REPLACE FUNCTION public.upsert_vuln_infra(p_rows jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  WITH incoming AS (
    SELECT DISTINCT ON (
      lower(trim(elem ->> 'fqdn')),
      lower(trim(coalesce(elem ->> 'vuln_type', elem -> 'raw' ->> 'Vulnerabilidade', elem -> 'raw' ->> 'Vulnerability', ''))),
      lower(trim(coalesce(elem -> 'raw' ->> 'Porta', elem -> 'raw' ->> 'Port', elem -> 'raw' ->> 'Campo personalizado (Port)', '')))
    )
      elem AS row_data
    FROM jsonb_array_elements(p_rows) AS elem
    ORDER BY
      lower(trim(elem ->> 'fqdn')),
      lower(trim(coalesce(elem ->> 'vuln_type', elem -> 'raw' ->> 'Vulnerabilidade', elem -> 'raw' ->> 'Vulnerability', ''))),
      lower(trim(coalesce(elem -> 'raw' ->> 'Porta', elem -> 'raw' ->> 'Port', elem -> 'raw' ->> 'Campo personalizado (Port)', ''))),
      (elem ->> 'status_changed_at')::timestamptz DESC NULLS LAST
  )
  INSERT INTO public.vulnerabilities_infra (
    fqdn,
    severity,
    status,
    responsible,
    identified_at,
    source,
    vuln_type,
    system_app,
    department_id,
    kind,
    raw,
    status_changed_at,
    closed_at
  )
  SELECT
    row_data ->> 'fqdn',
    (row_data ->> 'severity')::vuln_severity,
    (row_data ->> 'status')::vuln_status,
    NULLIF(row_data ->> 'responsible', ''),
    (row_data ->> 'identified_at')::date,
    NULLIF(row_data ->> 'source', ''),
    NULLIF(row_data ->> 'vuln_type', ''),
    NULLIF(row_data ->> 'system_app', ''),
    (row_data ->> 'department_id')::uuid,
    'infraestrutura',
    row_data -> 'raw',
    (row_data ->> 'status_changed_at')::timestamptz,
    CASE WHEN (row_data ->> 'status') IN ('Mitigada', 'Fechada') THEN (row_data ->> 'status_changed_at')::timestamptz ELSE NULL END
  FROM incoming
  ON CONFLICT ON CONSTRAINT vulnerabilities_infra_identity_unique_v2
  DO UPDATE SET
    severity          = EXCLUDED.severity,
    status            = EXCLUDED.status,
    responsible       = EXCLUDED.responsible,
    source            = EXCLUDED.source,
    system_app        = EXCLUDED.system_app,
    department_id     = EXCLUDED.department_id,
    raw               = EXCLUDED.raw,
    status_changed_at = EXCLUDED.status_changed_at,
    closed_at         = EXCLUDED.closed_at,
    identified_at     = LEAST(
                          vulnerabilities_infra.identified_at,
                          EXCLUDED.identified_at
                        );
END;
$$;

GRANT EXECUTE ON FUNCTION public.upsert_vuln_infra(jsonb) TO authenticated;
