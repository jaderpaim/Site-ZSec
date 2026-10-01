-- Módulo SAST: achados das esteiras CI/CD (Gitleaks hoje; Semgrep,
-- Dependency-Check, Trivy etc. depois). Duas origens de ingestão:
--   1. sync do App Insights devops-clarity-hub-insights (eventos
--      SecretDetected / ScanCompleted gravados pelo template do Azure DevOps);
--   2. webhook direto da esteira (fase 2, SARIF), autenticado por projeto.
-- Os dois caminhos convergem em upsert_sast_detections/register_sast_scan_run,
-- nunca insert direto do client.
--
-- NUNCA gravar o valor do segredo: o template atual já não manda Secret/Match
-- do Gitleaks, e o parser SARIF da fase 2 tem que descartar snippet/region
-- antes de chegar aqui (raw_event é o evento como recebido, sem esses campos).
--
-- Três tabelas:
--   sast_findings        -> 1 linha por achado único (ferramenta+projeto+repo+
--                           branch+fingerprint); é onde vive o status/triagem.
--   sast_finding_events  -> cada detecção individual (1 por build em que o
--                           achado apareceu) -- histórico e relatórios por build.
--   sast_scan_runs       -> 1 linha por execução de scan (evento ScanCompleted);
--                           base da cobertura ("repo sem scan há X dias") e do
--                           fechamento automático de achados que sumiram.

CREATE TABLE public.sast_scan_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- itemId do App Insights, ou id gerado pelo webhook -- idempotência do sync.
  source_event_id text NOT NULL UNIQUE,
  ingest_source text NOT NULL CHECK (ingest_source IN ('app-insights', 'webhook')),
  tool text NOT NULL,
  project text NOT NULL,
  repository text NOT NULL,
  branch text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('producao', 'homolog', 'dev', 'outro')),
  commit_sha text,
  build_id text,
  build_url text,
  findings_count integer,
  scanned_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sast_scan_runs_scope ON public.sast_scan_runs (tool, project, repository, branch, scanned_at DESC);
CREATE INDEX idx_sast_scan_runs_scanned_at ON public.sast_scan_runs (scanned_at DESC);

CREATE TABLE public.sast_findings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tool text NOT NULL,
  -- secret (gitleaks), code (semgrep), dependency (dependency-check/trivy),
  -- iac, container... -- texto livre de propósito, sem CHECK, pra não precisar
  -- de migration a cada ferramenta nova.
  category text NOT NULL,
  project text NOT NULL,
  repository text NOT NULL,
  branch text NOT NULL,
  environment text NOT NULL CHECK (environment IN ('producao', 'homolog', 'dev', 'outro')),
  rule_id text NOT NULL,
  -- Gitleaks não manda severidade; fica NULL e a UI trata segredo como crítico.
  severity text CHECK (severity IN ('critica', 'alta', 'media', 'baixa', 'info')),
  fingerprint text NOT NULL,
  file_path text,
  line integer,
  title text,
  -- Campos específicos de ferramenta (pacote/versão/CVE do SCA, CWE do Semgrep...).
  details jsonb NOT NULL DEFAULT '{}'::jsonb,

  status text NOT NULL DEFAULT 'aberto'
    CHECK (status IN ('aberto', 'resolvido', 'falso_positivo', 'risco_aceito')),
  -- auto = fechado porque sumiu num ScanCompleted posterior; manual = triagem.
  resolution_source text CHECK (resolution_source IN ('auto', 'manual')),
  resolved_at timestamptz,
  triaged_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  triaged_at timestamptz,
  triage_note text,

  first_seen_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  occurrences integer NOT NULL DEFAULT 1,
  last_commit_sha text,
  last_build_id text,
  last_build_url text,
  last_file_url text,
  last_author text,
  last_author_email text,
  -- Primeiro autor "humano" visto -- em homolog o autor costuma vir como
  -- "Project Collection Build Service" (commit de merge da build), então
  -- quem introduziu o segredo se perde se olhar só o último evento.
  introduced_by text,
  introduced_by_email text,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tool, project, repository, branch, fingerprint)
);

CREATE INDEX idx_sast_findings_status ON public.sast_findings (status);
CREATE INDEX idx_sast_findings_repo ON public.sast_findings (project, repository, branch);
CREATE INDEX idx_sast_findings_last_seen ON public.sast_findings (last_seen_at DESC);
CREATE INDEX idx_sast_findings_rule ON public.sast_findings (rule_id);
-- Cruzamento homolog <-> main pelo mesmo fingerprint (autor real).
CREATE INDEX idx_sast_findings_fingerprint ON public.sast_findings (repository, fingerprint);

CREATE TABLE public.sast_finding_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  finding_id uuid NOT NULL REFERENCES public.sast_findings(id) ON DELETE CASCADE,
  source_event_id text NOT NULL UNIQUE,
  ingest_source text NOT NULL CHECK (ingest_source IN ('app-insights', 'webhook')),
  detected_at timestamptz NOT NULL,
  commit_sha text,
  build_id text,
  build_url text,
  file_url text,
  author text,
  author_email text,
  raw_event jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_sast_finding_events_finding ON public.sast_finding_events (finding_id, detected_at DESC);
CREATE INDEX idx_sast_finding_events_detected_at ON public.sast_finding_events (detected_at DESC);

-- Cursor do sync incremental por origem (ex.: 'app-insights' -> último
-- TimeGenerated processado). O sync sempre relê uma janela de sobreposição
-- antes do cursor; duplicata é barrada pelo UNIQUE de source_event_id.
CREATE TABLE public.sast_ingest_cursor (
  source text PRIMARY KEY,
  last_event_at timestamptz NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- ── Permissões ──────────────────────────────────────────────────────────────
INSERT INTO public.module_permissions (module_slug, action, label, description, sort_order) VALUES
  ('sast', 'view',   'Visualizar', 'Ver achados SAST das esteiras CI/CD e relatórios', 1),
  ('sast', 'edit',   'Triar',      'Marcar achados como falso positivo, risco aceito ou resolvido', 2),
  ('sast', 'manage', 'Gerenciar',  'Configurar a integração (App Insights / webhook) e disparar sync', 3)
ON CONFLICT DO NOTHING;

GRANT SELECT ON public.sast_scan_runs, public.sast_findings, public.sast_finding_events TO authenticated;
GRANT ALL ON public.sast_scan_runs, public.sast_findings, public.sast_finding_events, public.sast_ingest_cursor TO service_role;

ALTER TABLE public.sast_scan_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sast_findings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sast_finding_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sast_ingest_cursor ENABLE ROW LEVEL SECURITY;

-- Leitura só com permissão do módulo. Escrita (ingestão E triagem) sempre via
-- server function com service_role -- triagem passa por lá pra checar 'edit',
-- gravar audit log e disparar alerta (falso positivo / risco aceito esconde
-- achado do painel, então é mudança de estado sensível).
CREATE POLICY "sast view scan runs" ON public.sast_scan_runs
  FOR SELECT TO authenticated
  USING (public.is_module_admin(auth.uid(), 'sast') OR public.has_module_permission(auth.uid(), 'sast', 'view'));

CREATE POLICY "sast view findings" ON public.sast_findings
  FOR SELECT TO authenticated
  USING (public.is_module_admin(auth.uid(), 'sast') OR public.has_module_permission(auth.uid(), 'sast', 'view'));

CREATE POLICY "sast view finding events" ON public.sast_finding_events
  FOR SELECT TO authenticated
  USING (public.is_module_admin(auth.uid(), 'sast') OR public.has_module_permission(auth.uid(), 'sast', 'view'));

CREATE POLICY "service role writes sast scan runs" ON public.sast_scan_runs
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service role writes sast findings" ON public.sast_findings
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service role writes sast finding events" ON public.sast_finding_events
  FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service role writes sast ingest cursor" ON public.sast_ingest_cursor
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- ── Ingestão ────────────────────────────────────────────────────────────────

-- Upsert em lote de detecções (1 elemento de p_rows = 1 evento SecretDetected
-- ou 1 result do SARIF, já normalizado pelo TS). Idempotente: evento com
-- source_event_id já visto é ignorado inteiro (não conta ocorrência de novo).
-- Reabre achado auto-resolvido que voltou a aparecer; falso_positivo e
-- risco_aceito NÃO reabrem (decisão de triagem vale até alguém mudar).
CREATE OR REPLACE FUNCTION public.upsert_sast_detections(p_rows jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r jsonb;
  v_finding_id uuid;
  v_detected_at timestamptz;
  v_is_human boolean;
  v_inserted integer := 0;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    IF EXISTS (SELECT 1 FROM public.sast_finding_events WHERE source_event_id = r->>'source_event_id') THEN
      CONTINUE;
    END IF;

    v_detected_at := (r->>'detected_at')::timestamptz;
    v_is_human := COALESCE(r->>'author', '') <> ''
      AND r->>'author' NOT ILIKE '%Build Service%';

    INSERT INTO public.sast_findings AS f (
      tool, category, project, repository, branch, environment, rule_id, severity,
      fingerprint, file_path, line, title, details,
      first_seen_at, last_seen_at, occurrences,
      last_commit_sha, last_build_id, last_build_url, last_file_url,
      last_author, last_author_email, introduced_by, introduced_by_email
    ) VALUES (
      r->>'tool', r->>'category', r->>'project', r->>'repository', r->>'branch', r->>'environment',
      r->>'rule_id', NULLIF(r->>'severity', ''),
      r->>'fingerprint', NULLIF(r->>'file_path', ''), NULLIF(r->>'line', '')::integer,
      NULLIF(r->>'title', ''), COALESCE(r->'details', '{}'::jsonb),
      v_detected_at, v_detected_at, 1,
      NULLIF(r->>'commit_sha', ''), NULLIF(r->>'build_id', ''), NULLIF(r->>'build_url', ''), NULLIF(r->>'file_url', ''),
      NULLIF(r->>'author', ''), NULLIF(r->>'author_email', ''),
      CASE WHEN v_is_human THEN r->>'author' END,
      CASE WHEN v_is_human THEN NULLIF(r->>'author_email', '') END
    )
    ON CONFLICT (tool, project, repository, branch, fingerprint) DO UPDATE SET
      occurrences = f.occurrences + 1,
      first_seen_at = LEAST(f.first_seen_at, EXCLUDED.first_seen_at),
      -- Evento fora de ordem (backfill) não pode sobrescrever o "último" com
      -- dado mais antigo.
      last_seen_at = GREATEST(f.last_seen_at, EXCLUDED.last_seen_at),
      last_commit_sha = CASE WHEN EXCLUDED.last_seen_at >= f.last_seen_at THEN EXCLUDED.last_commit_sha ELSE f.last_commit_sha END,
      last_build_id = CASE WHEN EXCLUDED.last_seen_at >= f.last_seen_at THEN EXCLUDED.last_build_id ELSE f.last_build_id END,
      last_build_url = CASE WHEN EXCLUDED.last_seen_at >= f.last_seen_at THEN EXCLUDED.last_build_url ELSE f.last_build_url END,
      last_file_url = CASE WHEN EXCLUDED.last_seen_at >= f.last_seen_at THEN EXCLUDED.last_file_url ELSE f.last_file_url END,
      last_author = CASE WHEN EXCLUDED.last_seen_at >= f.last_seen_at THEN EXCLUDED.last_author ELSE f.last_author END,
      last_author_email = CASE WHEN EXCLUDED.last_seen_at >= f.last_seen_at THEN EXCLUDED.last_author_email ELSE f.last_author_email END,
      introduced_by = COALESCE(f.introduced_by, EXCLUDED.introduced_by),
      introduced_by_email = COALESCE(f.introduced_by_email, EXCLUDED.introduced_by_email),
      status = CASE
        WHEN f.status = 'resolvido' AND f.resolution_source = 'auto' AND EXCLUDED.last_seen_at > f.resolved_at
          THEN 'aberto' ELSE f.status END,
      resolution_source = CASE
        WHEN f.status = 'resolvido' AND f.resolution_source = 'auto' AND EXCLUDED.last_seen_at > f.resolved_at
          THEN NULL ELSE f.resolution_source END,
      resolved_at = CASE
        WHEN f.status = 'resolvido' AND f.resolution_source = 'auto' AND EXCLUDED.last_seen_at > f.resolved_at
          THEN NULL ELSE f.resolved_at END,
      updated_at = now()
    RETURNING f.id INTO v_finding_id;

    INSERT INTO public.sast_finding_events (
      finding_id, source_event_id, ingest_source, detected_at,
      commit_sha, build_id, build_url, file_url, author, author_email, raw_event
    ) VALUES (
      v_finding_id, r->>'source_event_id', r->>'ingest_source', v_detected_at,
      NULLIF(r->>'commit_sha', ''), NULLIF(r->>'build_id', ''), NULLIF(r->>'build_url', ''),
      NULLIF(r->>'file_url', ''), NULLIF(r->>'author', ''), NULLIF(r->>'author_email', ''),
      r->'raw_event'
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN v_inserted;
END;
$function$;

-- Registra uma execução de scan (ScanCompleted) e fecha automaticamente os
-- achados abertos do mesmo escopo (ferramenta+projeto+repo+branch) que NÃO
-- apareceram nessa build. Tem que rodar DEPOIS do upsert_sast_detections do
-- mesmo lote, senão fecharia achado que ainda vai ser inserido.
-- Guarda contra ScanCompleted antigo processado fora de ordem: só fecha se o
-- achado foi visto pela última vez ANTES desse scan.
CREATE OR REPLACE FUNCTION public.register_sast_scan_run(p_run jsonb)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_scanned_at timestamptz := (p_run->>'scanned_at')::timestamptz;
  v_closed integer := 0;
BEGIN
  INSERT INTO public.sast_scan_runs (
    source_event_id, ingest_source, tool, project, repository, branch, environment,
    commit_sha, build_id, build_url, findings_count, scanned_at
  ) VALUES (
    p_run->>'source_event_id', p_run->>'ingest_source', p_run->>'tool', p_run->>'project',
    p_run->>'repository', p_run->>'branch', p_run->>'environment',
    NULLIF(p_run->>'commit_sha', ''), NULLIF(p_run->>'build_id', ''), NULLIF(p_run->>'build_url', ''),
    NULLIF(p_run->>'findings_count', '')::integer, v_scanned_at
  )
  ON CONFLICT (source_event_id) DO NOTHING;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  UPDATE public.sast_findings f SET
    status = 'resolvido',
    resolution_source = 'auto',
    resolved_at = v_scanned_at,
    updated_at = now()
  WHERE f.status = 'aberto'
    AND f.tool = p_run->>'tool'
    AND f.project = p_run->>'project'
    AND f.repository = p_run->>'repository'
    AND f.branch = p_run->>'branch'
    AND f.last_build_id IS DISTINCT FROM NULLIF(p_run->>'build_id', '')
    AND f.last_seen_at < v_scanned_at;
  GET DIAGNOSTICS v_closed = ROW_COUNT;

  RETURN v_closed;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.upsert_sast_detections(jsonb) FROM public, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.register_sast_scan_run(jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_sast_detections(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.register_sast_scan_run(jsonb) TO service_role;
