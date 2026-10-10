// Server-only: ingestão direta do módulo SAST -- a pipeline do Azure DevOps
// manda o relatório do scanner pra /api/public/hooks/sast-ingest. NUNCA
// importar em código de cliente.
//
// Caminho 2 (decidido com o usuário em 2026-09-29, menor privilégio):
//   - a pipeline envia SÓ uma chave de ingestão (sast-ingest-key.server.ts),
//     que não dá acesso a nada no Azure DevOps -- o b-security não recebe mais
//     o System.AccessToken do job (que carrega as permissões da identidade de
//     build, inclusive escrita em repo nos projetos Lovable);
//   - a conferência da build é feita com a credencial do PRÓPRIO b-security:
//     um App Registration só de leitura (grupo Readers dos projetos),
//     configurado na aba Azure DevOps do card SAST.
//
// Modelo de confiança: o corpo do envio NÃO é fonte de verdade pro escopo.
// Projeto/repo/branch/commit são conferidos na API do Azure DevOps; pra forjar
// dado é preciso ter a chave E bater com uma build real em execução.
//
// Convive com o sync do App Insights (sast.server.ts): as duas origens caem nos
// mesmos achados (tool canônico + fingerprint sem commit) e a mesma build não
// conta duas vezes (upsert_sast_detections, migration 20260929100000).
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getStoredIngestKeys, matchesIngestKey } from "@/lib/sast-ingest-key.server";
import {
  branchToEnvironment,
  canonicalTool,
  normalizeGitleaksReportFinding,
} from "@/lib/sast-normalize";
import type { SastDetectionRow, VerifiedBuildScope } from "@/lib/sast-normalize";
import { APP_NAME } from "@/lib/brand";

const adminDb = supabaseAdmin as unknown as {
  from: (t: string) => any;
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: any; error: { message: string } | null }>;
};

export const SAST_INGEST_PROVIDER = "azure_devops_sast";
// Nome de organização do Azure DevOps: vai direto na URL da API -- validado
// pra não virar vetor de SSRF (só dev.azure.com/<org>, nada de host/caminho).
const ORG_RE = /^[A-Za-z0-9][A-Za-z0-9-]{0,49}$/;
const MAX_BODY_BYTES = 5 * 1024 * 1024;
const ADO_TIMEOUT_MS = 10_000;
// Resource ID fixo do Azure DevOps no Entra ID (o mesmo pra toda organização).
const ADO_SCOPE = "499b84ac-1321-427f-aa17-267ca6975798/.default";

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

async function logIngest(
  status: "success" | "error",
  httpStatus: number,
  message: string,
  ms: number,
) {
  try {
    await adminDb.from("api_logs").insert({
      provider: SAST_INGEST_PROVIDER,
      status,
      http_status: httpStatus,
      message: message.slice(0, 500),
      duration_ms: ms,
    });
  } catch {
    /* log não derruba a ingestão */
  }
}

type ReaderCreds = { tenantId: string; clientId: string; clientSecret: string };

// Credencial de leitura sempre na própria linha azure_devops_sast (config
// tenant_id/client_id + api_key = client secret) -- decisão com o usuário em
// 2026-09-29: sem "reaproveitar da aba App Insights", que confundia mais do que
// ajudava. Pra usar um App Registration só, basta colar o mesmo nas duas abas.
async function getIngestConfig(): Promise<{
  enabled: boolean;
  organization: string | null;
  creds: ReaderCreds | null;
}> {
  const { data } = await adminDb
    .from("integrations")
    .select("enabled, api_key, config")
    .eq("provider", SAST_INGEST_PROVIDER)
    .maybeSingle();
  const cfg = (data?.config ?? {}) as {
    organization?: string;
    tenant_id?: string;
    client_id?: string;
  };
  const org = String(cfg.organization ?? "").trim();
  const creds: ReaderCreds | null =
    cfg.tenant_id && cfg.client_id && data?.api_key
      ? { tenantId: cfg.tenant_id, clientId: cfg.client_id, clientSecret: data.api_key }
      : null;
  return {
    enabled: !!data?.enabled,
    organization: ORG_RE.test(org) ? org : null,
    creds,
  };
}

// Token do App Registration pro Azure DevOps, em cache até ~5 min antes de
// expirar (vale ~1 h) -- sem isso, cada build faria um login no Entra ID.
let tokenCache: { key: string; token: string; exp: number } | null = null;

async function getAdoToken(creds: ReaderCreds): Promise<string> {
  const cacheKey = `${creds.tenantId}:${creds.clientId}:${creds.clientSecret.length}`;
  if (tokenCache && tokenCache.key === cacheKey && tokenCache.exp > Date.now())
    return tokenCache.token;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ADO_TIMEOUT_MS);
  try {
    const res = await fetch(
      `https://login.microsoftonline.com/${creds.tenantId}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "client_credentials",
          client_id: creds.clientId,
          client_secret: creds.clientSecret,
          scope: ADO_SCOPE,
        }),
        signal: ctrl.signal,
      },
    );
    const data = (await res.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      error_description?: string;
    };
    if (!data.access_token) {
      throw new Error(
        `Entra ID recusou a credencial do ${APP_NAME}: ${(data.error_description ?? String(res.status)).slice(0, 200)}`,
      );
    }
    tokenCache = {
      key: cacheKey,
      token: data.access_token,
      exp: Date.now() + Math.max(60, (data.expires_in ?? 3600) - 300) * 1000,
    };
    return data.access_token;
  } finally {
    clearTimeout(timer);
  }
}

const IngestSchema = z.object({
  schema: z.literal(1),
  tool: z.string().min(1).max(40),
  projectId: z.string().uuid(),
  project: z.string().min(1).max(200),
  repository: z.string().min(1).max(200),
  branch: z.string().min(1).max(300),
  commit: z.string().regex(/^[0-9a-f]{40}$/i),
  buildId: z.number().int().positive(),
  status: z.enum(["completed", "failed"]),
  findings: z.array(z.record(z.string(), z.unknown())).max(50_000),
});

async function adoGet(url: string, token: string): Promise<Response> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ADO_TIMEOUT_MS);
  try {
    return await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      redirect: "manual", // credencial sem acesso às vezes vira redirect pra tela de login
      signal: ctrl.signal,
    });
  } finally {
    clearTimeout(timer);
  }
}

type AdoBuild = {
  id?: number;
  status?: string;
  reason?: string;
  sourceBranch?: string;
  sourceVersion?: string;
  project?: { id?: string; name?: string };
  repository?: { id?: string; name?: string; type?: string };
  _links?: { web?: { href?: string } };
};

export async function handleSastIngest(request: Request): Promise<Response> {
  const started = Date.now();
  const fail = async (status: number, message: string, logMessage?: string) => {
    await logIngest("error", status, logMessage ?? message, Date.now() - started);
    return json(status, { ok: false, error: message });
  };

  const cfg = await getIngestConfig();
  if (!cfg.enabled) {
    return fail(
      503,
      `Ingestão SAST desligada no ${APP_NAME} (Integração API → card SAST → aba Azure DevOps).`,
    );
  }

  // ── Chave de ingestão (antes de ler o corpo) ──
  const auth = request.headers.get("authorization") ?? "";
  const presented = auth.match(/^Bearer\s+(.+)$/i)?.[1]?.trim();
  if (!presented)
    return fail(401, "Header Authorization: Bearer <chave de ingestão SAST> ausente.");
  const keys = await getStoredIngestKeys();
  if (!keys.length)
    return fail(
      503,
      `Nenhuma chave de ingestão gerada no ${APP_NAME} (card SAST → aba Azure DevOps).`,
    );
  if (!matchesIngestKey(presented, keys))
    return fail(401, "Chave de ingestão SAST inválida ou revogada.");

  if (!cfg.creds) {
    return fail(
      503,
      `Credencial de leitura do Azure DevOps não configurada no ${APP_NAME} (card SAST → aba Azure DevOps).`,
    );
  }
  if (!cfg.organization) {
    return fail(
      503,
      `Organização do Azure DevOps não configurada no ${APP_NAME} (card SAST → aba Azure DevOps).`,
    );
  }

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (declared > MAX_BODY_BYTES)
    return fail(413, `Relatório acima de ${MAX_BODY_BYTES / 1024 / 1024} MB.`);
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return fail(413, `Relatório acima de ${MAX_BODY_BYTES / 1024 / 1024} MB.`);
  }

  let body: z.infer<typeof IngestSchema>;
  try {
    body = IngestSchema.parse(JSON.parse(raw));
  } catch (e) {
    const detail =
      e instanceof z.ZodError
        ? e.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ")
        : "JSON inválido";
    return fail(400, `Corpo fora do formato: ${detail}`.slice(0, 400));
  }
  const tool = canonicalTool(body.tool);
  if (tool !== "Gitleaks")
    return fail(400, `Ferramenta "${body.tool}" ainda não suportada pela ingestão direta.`);

  // ── Confere a build na API do Azure DevOps com a credencial do b-security ──
  const org = cfg.organization;
  let adoToken: string;
  try {
    adoToken = await getAdoToken(cfg.creds);
  } catch (e) {
    // Problema do lado do b-security, não da pipeline -- detalhe só no log.
    return fail(
      503,
      `O ${APP_NAME} não conseguiu autenticar no Azure DevOps.`,
      (e as Error).message,
    );
  }

  let build: AdoBuild;
  try {
    const res = await adoGet(
      `https://dev.azure.com/${org}/${body.projectId}/_apis/build/builds/${body.buildId}?api-version=7.1`,
      adoToken,
    );
    // 401 / 203 (HTML de login) / redirect = o App Registration não é usuário da organização.
    if (
      res.status === 401 ||
      res.status === 203 ||
      (res.status >= 300 && res.status < 400) ||
      (res.ok && !(res.headers.get("content-type") ?? "").includes("application/json"))
    ) {
      return fail(
        503,
        `O App Registration do ${APP_NAME} não tem acesso à organização ${org} (adicionar em Organization settings → Users).`,
      );
    }
    if (res.status === 403 || res.status === 404) {
      return fail(
        403,
        `Build ${body.buildId} não encontrada, ou o App Registration do ${APP_NAME} não está no grupo Readers do projeto "${body.project}".`,
      );
    }
    if (!res.ok) return fail(503, `Azure DevOps respondeu ${res.status} ao conferir a build.`);
    build = (await res.json()) as AdoBuild;
  } catch {
    return fail(503, "Não foi possível falar com o Azure DevOps pra conferir a build.");
  }

  const mismatch: string[] = [];
  if ((build.project?.id ?? "").toLowerCase() !== body.projectId.toLowerCase())
    mismatch.push("projectId");
  if (build.status !== "inProgress")
    mismatch.push(`status=${build.status ?? "?"} (esperado inProgress)`);
  if (build.reason === "pullRequest") mismatch.push("build de PR não é aceita");
  if (build.repository?.type !== "TfsGit") mismatch.push("repositório não é Azure Repos");
  if (build.repository?.name !== body.repository) mismatch.push("repository");
  if ((build.sourceVersion ?? "").toLowerCase() !== body.commit.toLowerCase())
    mismatch.push("commit");
  if (build.sourceBranch !== `refs/heads/${body.branch}`) mismatch.push("branch");
  if (mismatch.length) {
    return fail(403, `Envio não confere com a build ${body.buildId}: ${mismatch.join(", ")}.`);
  }

  const project = build.project!.name ?? body.project;
  const repository = build.repository!.name!;
  const scope: VerifiedBuildScope = {
    project,
    repository,
    branch: body.branch,
    commit: body.commit.toLowerCase(),
    buildId: String(body.buildId),
    buildUrl:
      build._links?.web?.href ??
      `https://dev.azure.com/${org}/${encodeURIComponent(project)}/_build/results?buildId=${body.buildId}`,
    fileUrlBase: `https://dev.azure.com/${org}/${encodeURIComponent(project)}/_git/${encodeURIComponent(repository)}`,
  };

  // Scan que não rodou: nada é gravado nem fechado (registrar a execução
  // fecharia todos os achados abertos do escopo como se o repo estivesse limpo).
  if (body.status === "failed") {
    await logIngest(
      "success",
      202,
      `${repository}/${body.branch} build ${body.buildId}: scan failed, ignorado`,
      Date.now() - started,
    );
    return json(202, { ok: true, accepted: 0, closed: 0, skipped: "scan_failed" });
  }

  // Autor do commit da build -- usado quando o Gitleaks roda em --no-git e não
  // traz autor por achado. Falha aqui não impede a ingestão.
  let commitAuthor: { name: string | null; email: string | null } = { name: null, email: null };
  if (build.repository?.id) {
    try {
      const res = await adoGet(
        `https://dev.azure.com/${org}/${body.projectId}/_apis/git/repositories/${build.repository.id}/commits/${scope.commit}?api-version=7.1`,
        adoToken,
      );
      if (res.ok && (res.headers.get("content-type") ?? "").includes("application/json")) {
        const c = (await res.json()) as { author?: { name?: string; email?: string } };
        commitAuthor = { name: c.author?.name ?? null, email: c.author?.email ?? null };
      }
    } catch {
      /* segue sem autor */
    }
  }

  const detectedAt = new Date(started).toISOString();
  const rows = new Map<string, SastDetectionRow>();
  let skipped = 0;
  for (const f of body.findings) {
    const row = normalizeGitleaksReportFinding(f, scope, detectedAt, commitAuthor);
    if (!row) skipped++;
    else if (!rows.has(row.source_event_id)) rows.set(row.source_event_id, row);
  }

  try {
    const list = [...rows.values()];
    let accepted = 0;
    for (let i = 0; i < list.length; i += 500) {
      const { data, error } = await adminDb.rpc("upsert_sast_detections", {
        p_rows: list.slice(i, i + 500),
      });
      if (error) throw new Error(`upsert_sast_detections: ${error.message}`);
      accepted += Number(data ?? 0);
    }
    // Execução registrada DEPOIS dos achados e 1 ms à frente deles: o que está
    // aberto nesse repo/branch e não veio neste relatório fecha sozinho.
    const { data: closed, error: runError } = await adminDb.rpc("register_sast_scan_run", {
      p_run: {
        source_event_id: `ado:${scope.buildId}:${tool}`,
        ingest_source: "webhook",
        tool,
        project,
        repository,
        branch: scope.branch,
        environment: branchToEnvironment(scope.branch),
        commit_sha: scope.commit,
        build_id: scope.buildId,
        build_url: scope.buildUrl,
        findings_count: list.length,
        scanned_at: new Date(started + 1).toISOString(),
      },
    });
    if (runError) throw new Error(`register_sast_scan_run: ${runError.message}`);

    const result = {
      ok: true,
      accepted,
      duplicates: list.length - accepted,
      closed: Number(closed ?? 0),
      skipped,
    };
    await logIngest(
      "success",
      202,
      `${project}/${repository}/${scope.branch} build ${scope.buildId}: ${list.length} achados, ${result.closed} fechados`,
      Date.now() - started,
    );
    return json(202, result);
  } catch (e) {
    console.error("[sast-ingest]", (e as Error).message);
    return fail(500, `Erro ao gravar os achados no ${APP_NAME}.`, (e as Error).message);
  }
}
