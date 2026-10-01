-- Cleanup de duplicatas em vulnerabilities_infra ANTES de adicionar a nova constraint de
-- identidade (20260812140100), que agora inclui Porta além de fqdn + vuln_type. A constraint
-- anterior (department_id, fqdn, vuln_type), criada em 20260701150001 e revertida em
-- 20260701160000, colapsava instâncias legítimas e distintas — o mesmo host reporta a mesma
-- vulnerabilidade (ex. SSL/TLS) em várias portas diferentes, que são achados distintos.
-- Validado contra os dados reais em produção (>15k linhas) antes desta migration: agrupando
-- por fqdn + vuln_type + Porta não há colisão indevida.
--
-- Hoje, cada import mensal insere uma linha nova pra todo achado que persiste
-- (raw->>'Situação' = Maintained), então o histórico acumula várias linhas por achado. Este
-- cleanup colapsa cada grupo (fqdn + vuln_type + Porta, normalizados) numa única linha:
--   - mantém a linha com maior status_changed_at (o estado mais atual do achado)
--   - seta identified_at = MIN(raw->>'Atualizado') entre as linhas com Situação='New' do
--     grupo (fallback: MIN(raw->>'Atualizado') de qualquer linha, se nenhuma for 'New') —
--     é a mesma definição de "1ª ocorrência" já validada no dashboard
--     (VulnerabilidadesReal.tsx, computeByMonth) contra o gráfico de referência do usuário.
--     NÃO usar simplesmente MIN(identified_at): testado contra os dados reais e essa coluna,
--     sozinha, não é confiável como "1ª ocorrência" (diverge da data real de New em vários
--     casos — provavelmente reflete outra coisa, como data de cadastro do ativo).
--   - preenche closed_at quando o status sobrevivente for Mitigada/Fechada
-- As demais linhas do grupo (histórico mensal redundante) são removidas.
--
-- raw->>'Atualizado' é convertido direto pra timestamp (sem passar pelo parseDate do
-- frontend) — confirmado que as 15407 linhas atuais usam o formato 'YYYY-MM-DD HH:MI:SS' de
-- forma consistente (0 exceções). Se uma fonte diferente introduzir outro formato no futuro,
-- esta conversão pode falhar — revisar antes de rodar caso o import mude de scanner/planilha.

WITH normalized AS (
  SELECT
    id,
    status,
    status_changed_at,
    created_at,
    lower(trim(fqdn)) AS fqdn_norm,
    lower(trim(coalesce(vuln_type, raw ->> 'Vulnerabilidade', raw ->> 'Vulnerability', ''))) AS vuln_type_norm,
    lower(trim(coalesce(raw ->> 'Porta', raw ->> 'Port', raw ->> 'Campo personalizado (Port)', ''))) AS porta_norm,
    lower(trim(coalesce(raw ->> 'Situação', raw ->> 'Situacao', ''))) AS situacao_norm,
    NULLIF(raw ->> 'Atualizado', '')::timestamp AS row_scan_at
  FROM public.vulnerabilities_infra
),
ranked AS (
  SELECT
    id,
    status,
    status_changed_at,
    ROW_NUMBER() OVER (
      PARTITION BY fqdn_norm, vuln_type_norm, porta_norm
      ORDER BY COALESCE(status_changed_at, '1900-01-01'::timestamptz) DESC, created_at DESC
    ) AS rn,
    MIN(row_scan_at) FILTER (WHERE situacao_norm = 'new') OVER (
      PARTITION BY fqdn_norm, vuln_type_norm, porta_norm
    ) AS first_new_at,
    MIN(row_scan_at) OVER (
      PARTITION BY fqdn_norm, vuln_type_norm, porta_norm
    ) AS first_any_at
  FROM normalized
)
UPDATE public.vulnerabilities_infra v
SET
  identified_at = COALESCE(r.first_new_at, r.first_any_at)::date,
  closed_at = CASE WHEN r.status IN ('Mitigada', 'Fechada') THEN r.status_changed_at ELSE NULL END
FROM ranked r
WHERE v.id = r.id AND r.rn = 1;

-- Remove as demais linhas de cada grupo (histórico mensal redundante). Recalcula o ranking
-- do zero (a UPDATE acima não altera fqdn/vuln_type/Porta/status_changed_at/created_at, que
-- são a base do agrupamento e da ordenação — o resultado é idêntico ao da CTE anterior).
WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY
        lower(trim(fqdn)),
        lower(trim(coalesce(vuln_type, raw ->> 'Vulnerabilidade', raw ->> 'Vulnerability', ''))),
        lower(trim(coalesce(raw ->> 'Porta', raw ->> 'Port', raw ->> 'Campo personalizado (Port)', '')))
      ORDER BY COALESCE(status_changed_at, '1900-01-01'::timestamptz) DESC, created_at DESC
    ) AS rn
  FROM public.vulnerabilities_infra
)
DELETE FROM public.vulnerabilities_infra
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
