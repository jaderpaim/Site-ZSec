
ALTER TABLE public.vulnerabilities
  ADD COLUMN IF NOT EXISTS closed_at date;

CREATE OR REPLACE FUNCTION public.vulnerabilities_compute_closed_at(_status text, _raw jsonb, _updated_at timestamptz)
RETURNS date
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  keys text[] := ARRAY[
    'Resolvida em','Resolvido em','Resolvido','Resolved','Resolved at',
    'resolutiondate','Resolution Date','Data de fechamento','Data de Fechamento',
    'Closed at','Closed','Data resolução','Data Resolução','Atualizado','Updated','Updated at'
  ];
  k text;
  v text;
  d date;
  m text[];
  pt_months jsonb := '{"jan":"01","fev":"02","mar":"03","abr":"04","mai":"05","jun":"06","jul":"07","ago":"08","set":"09","out":"10","nov":"11","dez":"12"}'::jsonb;
  mm text;
  yy text;
BEGIN
  IF _status NOT IN ('Mitigada','Fechada') THEN
    RETURN NULL;
  END IF;
  IF _raw IS NULL THEN
    RETURN NULL;
  END IF;
  FOREACH k IN ARRAY keys LOOP
    v := _raw ->> k;
    IF v IS NULL OR length(v) < 6 THEN
      CONTINUE;
    END IF;
    -- Formato Jira pt-BR: "DD/Mon/YY" ex.: "03/jan/24"
    m := regexp_match(lower(v), '^(\d{1,2})/([a-z]{3})/(\d{2,4})');
    IF m IS NOT NULL THEN
      mm := pt_months ->> m[2];
      IF mm IS NOT NULL THEN
        yy := m[3];
        IF length(yy) = 2 THEN
          yy := CASE WHEN yy::int >= 70 THEN '19'||yy ELSE '20'||yy END;
        END IF;
        BEGIN
          RETURN to_date(yy||'-'||mm||'-'||lpad(m[1],2,'0'), 'YYYY-MM-DD');
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      END IF;
    END IF;
    -- ISO ou parseable
    BEGIN
      d := (v::timestamptz)::date;
      RETURN d;
    EXCEPTION WHEN OTHERS THEN
      IF v ~ '^\d{4}-\d{2}-\d{2}' THEN
        BEGIN
          RETURN to_date(substring(v from 1 for 10), 'YYYY-MM-DD');
        EXCEPTION WHEN OTHERS THEN
          NULL;
        END;
      END IF;
    END;
  END LOOP;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.vulnerabilities_set_closed_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.closed_at := public.vulnerabilities_compute_closed_at(NEW.status::text, NEW.raw, NEW.updated_at);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_vulnerabilities_closed_at ON public.vulnerabilities;
CREATE TRIGGER trg_vulnerabilities_closed_at
BEFORE INSERT OR UPDATE OF status, raw ON public.vulnerabilities
FOR EACH ROW
EXECUTE FUNCTION public.vulnerabilities_set_closed_at();

-- Backfill
UPDATE public.vulnerabilities
SET closed_at = public.vulnerabilities_compute_closed_at(status::text, raw, updated_at)
WHERE status IN ('Mitigada','Fechada');

CREATE INDEX IF NOT EXISTS idx_vulnerabilities_dept_identified
  ON public.vulnerabilities (department_id, identified_at DESC);
