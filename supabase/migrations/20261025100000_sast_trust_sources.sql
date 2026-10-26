-- Auditoria de segurança — fase 6.1 (etapa A): fontes confiáveis da ingestão SAST.
--
-- Antes, uma única chave bsast_ valia para qualquer repositório: quem tinha a
-- chave de um pipeline conseguia registrar a execução de OUTRO repositório e
-- fechar os achados dele. Agora cada chave pertence a uma "fonte confiável"
-- (provedor + organização/projeto + filtro de repositórios), e o servidor só
-- aceita envios cujo escopo — conferido na API do CI, nunca no corpo — caia
-- dentro da fonte dona da chave. Repositórios novos de uma organização já
-- cadastrada entram sozinhos, sem chave nova.
--
-- A tabela é só do servidor (service role): o painel lê e escreve via server
-- functions com checagem de admin (sast-trust-sources.functions.ts).

CREATE TABLE IF NOT EXISTS public.sast_trust_sources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL CHECK (provider IN ('gitea', 'github', 'azure_devops')),
  -- Gitea/GitHub: dono (organização ou usuário). Azure DevOps: nome do projeto.
  owner text NOT NULL CHECK (length(trim(owner)) BETWEEN 1 AND 200),
  -- "*" = todos os repositórios do dono; "pagamentos-*" = prefixo; nome exato.
  repo_pattern text NOT NULL DEFAULT '*' CHECK (repo_pattern ~ '^[A-Za-z0-9_.*-]{1,200}$'),
  -- Squad responsável (opcional) — usado na visão por time (etapa C).
  department_id uuid REFERENCES public.departments(id) ON DELETE SET NULL,
  label text,
  enabled boolean NOT NULL DEFAULT true,
  -- Até 2 chaves (atual + anterior), só o hash SHA-256: [{hash, hint, created_at, created_by}]
  keys jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS sast_trust_sources_scope_uq
  ON public.sast_trust_sources (provider, lower(owner), repo_pattern);

ALTER TABLE public.sast_trust_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.sast_trust_sources FROM anon, authenticated;

-- Execução de scan duplicada (mesmo build + ferramenta): antes o PRIMEIRO envio
-- ganhava e os seguintes eram ignorados — um envio indevido que chegasse antes do
-- relatório verdadeiro fechava os achados e o verdadeiro não recalculava nada.
-- Agora todo envio do mesmo build recalcula o fechamento automático (o upsert de
-- detecções, que roda antes, já reabre o que o relatório voltou a encontrar).
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
  ON CONFLICT (source_event_id) DO UPDATE SET
    findings_count = EXCLUDED.findings_count,
    scanned_at = GREATEST(public.sast_scan_runs.scanned_at, EXCLUDED.scanned_at);

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

REVOKE EXECUTE ON FUNCTION public.register_sast_scan_run(jsonb) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_sast_scan_run(jsonb) TO service_role;
