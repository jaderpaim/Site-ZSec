-- Cleanup de duplicatas em dast_vulnerabilities ANTES da constraint de
-- identidade ser criada em 20260821150000 -- essa migration falhou ao
-- rodar (23505 poderia create unique index) porque scans repetidos do
-- mesmo alvo já tinham inserido o mesmo achado várias vezes antes dessa
-- correção existir (ex.: "ssl dns names" em gestaox.bernoulli.com.br:443
-- duplicado). Mesmo padrão do cleanup já aplicado em vulnerabilities_infra
-- (20260812140000): agrupa por identidade normalizada, mantém 1 linha por
-- grupo, remove o resto.
--
-- Mantém a linha mais recente (found_at) de cada grupo -- é o estado mais
-- atual do achado (se a mais recente já estava resolved/false_positive,
-- esse status prevalece, refletindo que foi corrigido depois da última vez
-- que reapareceu).
--
-- dast_retest_history referencia vulnerability_id -- apaga o histórico das
-- linhas descartadas antes de apagar as próprias linhas, sem depender de
-- saber se existe ON DELETE CASCADE nessa FK (mais seguro rodar de qualquer
-- forma; se já tiver cascade, isso só encontra 0 linhas extras).

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY
        lower(trim(coalesce(engine, ''))),
        lower(trim(coalesce(name, ''))),
        lower(trim(coalesce(matched_url, ''))),
        lower(trim(coalesce(param, '')))
      ORDER BY found_at DESC, id DESC
    ) AS rn
  FROM public.dast_vulnerabilities
),
losers AS (
  SELECT id FROM ranked WHERE rn > 1
)
DELETE FROM public.dast_retest_history
WHERE vulnerability_id IN (SELECT id FROM losers);

WITH ranked AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY
        lower(trim(coalesce(engine, ''))),
        lower(trim(coalesce(name, ''))),
        lower(trim(coalesce(matched_url, ''))),
        lower(trim(coalesce(param, '')))
      ORDER BY found_at DESC, id DESC
    ) AS rn
  FROM public.dast_vulnerabilities
)
DELETE FROM public.dast_vulnerabilities
WHERE id IN (SELECT id FROM ranked WHERE rn > 1);
