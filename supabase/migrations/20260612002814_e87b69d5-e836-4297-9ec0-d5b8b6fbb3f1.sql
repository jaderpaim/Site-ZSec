
CREATE TABLE IF NOT EXISTS public.vuln_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  snapshot_date date NOT NULL UNIQUE,
  criticas int NOT NULL DEFAULT 0,
  altas int NOT NULL DEFAULT 0,
  medias int NOT NULL DEFAULT 0,
  baixas int NOT NULL DEFAULT 0,
  total int NOT NULL DEFAULT 0,
  abertas int NOT NULL DEFAULT 0,
  resolvidas int NOT NULL DEFAULT 0,
  estimated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.vuln_snapshots TO authenticated;
GRANT ALL ON public.vuln_snapshots TO service_role;

ALTER TABLE public.vuln_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view vuln snapshots"
  ON public.vuln_snapshots FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role manages vuln snapshots"
  ON public.vuln_snapshots FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER vuln_snapshots_updated_at
  BEFORE UPDATE ON public.vuln_snapshots
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX IF NOT EXISTS vuln_snapshots_date_idx ON public.vuln_snapshots(snapshot_date DESC);

-- Backfill mensal estimado (últimos 12 meses)
-- Para cada mês, conta vulnerabilidades identificadas até o último dia do mês
-- que ainda não estavam resolvidas até essa data
DO $$
DECLARE
  m_date date;
  m_end date;
  c_crit int; c_alt int; c_med int; c_bai int;
  c_open int; c_resolved int; c_total int;
BEGIN
  FOR i IN 0..11 LOOP
    m_date := date_trunc('month', current_date - (i || ' months')::interval)::date;
    m_end := (date_trunc('month', m_date) + interval '1 month - 1 day')::date;

    WITH union_all_vulns AS (
      SELECT severity::text AS sev, status::text AS st, identified_at, closed_at
        FROM public.vulnerabilities_aplicacao
      UNION ALL
      SELECT severity::text AS sev, status::text AS st, identified_at, closed_at
        FROM public.vulnerabilities_infra
    ),
    snap AS (
      SELECT *
        FROM union_all_vulns
       WHERE identified_at::date <= m_end
         AND (closed_at IS NULL OR closed_at > m_end)
    )
    SELECT
      COUNT(*) FILTER (WHERE lower(sev) IN ('crítica','critica','critical')),
      COUNT(*) FILTER (WHERE lower(sev) IN ('alta','high')),
      COUNT(*) FILTER (WHERE lower(sev) IN ('média','media','medium')),
      COUNT(*) FILTER (WHERE lower(sev) IN ('baixa','low')),
      COUNT(*) FILTER (WHERE lower(st) NOT IN ('mitigada','fechada','resolvida','closed','resolved')),
      COUNT(*) FILTER (WHERE lower(st) IN ('mitigada','fechada','resolvida','closed','resolved')),
      COUNT(*)
    INTO c_crit, c_alt, c_med, c_bai, c_open, c_resolved, c_total
    FROM snap;

    INSERT INTO public.vuln_snapshots
      (snapshot_date, criticas, altas, medias, baixas, total, abertas, resolvidas, estimated)
    VALUES
      (m_end, COALESCE(c_crit,0), COALESCE(c_alt,0), COALESCE(c_med,0), COALESCE(c_bai,0),
       COALESCE(c_total,0), COALESCE(c_open,0), COALESCE(c_resolved,0), true)
    ON CONFLICT (snapshot_date) DO UPDATE
      SET criticas = EXCLUDED.criticas,
          altas = EXCLUDED.altas,
          medias = EXCLUDED.medias,
          baixas = EXCLUDED.baixas,
          total = EXCLUDED.total,
          abertas = EXCLUDED.abertas,
          resolvidas = EXCLUDED.resolvidas,
          estimated = EXCLUDED.estimated;
  END LOOP;
END $$;
