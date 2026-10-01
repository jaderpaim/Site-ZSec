-- Módulo SAST com duas origens ao mesmo tempo (decisão com o usuário em
-- 2026-09-29): sync do App Insights (caminho antigo, continua pra quem ainda
-- não mudou o template e pro histórico) + ingestão direta da pipeline via
-- /api/public/hooks/sast-ingest (caminho novo, autenticado pelo
-- System.AccessToken do job).
--
-- A mesma build pode chegar pelas duas: o SecretDetected do App Insights e o
-- relatório enviado direto descrevem a MESMA detecção. Sem isto, cada build
-- contava 2 ocorrências por achado e gravava 2 eventos no histórico.
-- Regra nova: uma detecção por (achado, build_id), venha de onde vier -- a que
-- chegar primeiro fica, a outra é ignorada inteira.
--
-- Também passa a tratar como autor NÃO humano o "Azure DevOps Sync Agent"
-- (azure-sync-bot@bernoulli.com.br), que assina o commit sintético do
-- espelhamento GitHub -> Azure Repos dos projetos Lovable (ver
-- cicd/lovable-pipelines.yml) -- antes só "Build Service" era filtrado, e o
-- bot virava "introduced_by" dos achados de homolog.
--
-- Mesma assinatura/retorno da versão de 20260928100000_sast_module.sql;
-- grants permanecem (CREATE OR REPLACE preserva privilégios).

CREATE INDEX IF NOT EXISTS idx_sast_finding_events_build
  ON public.sast_finding_events (finding_id, build_id);

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
  v_build_id text;
  v_inserted integer := 0;
BEGIN
  FOR r IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    IF EXISTS (SELECT 1 FROM public.sast_finding_events WHERE source_event_id = r->>'source_event_id') THEN
      CONTINUE;
    END IF;

    -- Mesma build já registrada pra esse achado pela outra origem.
    v_build_id := NULLIF(r->>'build_id', '');
    IF v_build_id IS NOT NULL AND EXISTS (
      SELECT 1
      FROM public.sast_finding_events e
      JOIN public.sast_findings f ON f.id = e.finding_id
      WHERE f.tool = r->>'tool'
        AND f.project = r->>'project'
        AND f.repository = r->>'repository'
        AND f.branch = r->>'branch'
        AND f.fingerprint = r->>'fingerprint'
        AND e.build_id = v_build_id
    ) THEN
      CONTINUE;
    END IF;

    v_detected_at := (r->>'detected_at')::timestamptz;
    v_is_human := COALESCE(r->>'author', '') <> ''
      AND r->>'author' NOT ILIKE '%Build Service%'
      AND r->>'author' NOT ILIKE '%Sync Agent%'
      AND COALESCE(r->>'author_email', '') NOT ILIKE 'azure-sync-bot@%';

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
      NULLIF(r->>'commit_sha', ''), v_build_id, NULLIF(r->>'build_url', ''), NULLIF(r->>'file_url', ''),
      NULLIF(r->>'author', ''), NULLIF(r->>'author_email', ''),
      CASE WHEN v_is_human THEN r->>'author' END,
      CASE WHEN v_is_human THEN NULLIF(r->>'author_email', '') END
    )
    ON CONFLICT (tool, project, repository, branch, fingerprint) DO UPDATE SET
      occurrences = f.occurrences + 1,
      first_seen_at = LEAST(f.first_seen_at, EXCLUDED.first_seen_at),
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
      NULLIF(r->>'commit_sha', ''), v_build_id, NULLIF(r->>'build_url', ''),
      NULLIF(r->>'file_url', ''), NULLIF(r->>'author', ''), NULLIF(r->>'author_email', ''),
      r->'raw_event'
    );
    v_inserted := v_inserted + 1;
  END LOOP;

  RETURN v_inserted;
END;
$function$;
