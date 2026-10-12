// Normalização dos eventos das esteiras CI/CD pro formato que
// upsert_sast_detections / register_sast_scan_run esperam (ver migration
// 20260928100000_sast_module.sql). Puro -- sem banco/segredo aqui, por isso
// não é .server.ts; o sync (sast.server.ts) só busca, chama isto e grava.
//
// Formato de origem hoje: customEvent do App Insights gravado pelo template
// "Produtos Digitais/pipeline-templates" (enableGitleaks/enableTelemetry):
//   SecretDetected -> {Source, Project, Repository, Branch, RuleID, Fingerprint,
//                      File, Author, AuthorEmail, Commit, BuildURL, FileUrl, Scanner}
//   ScanCompleted  -> {Source, Project, Repository, Branch, Commit, BuildURL,
//                      BuildId, FindingsCount, ScanStatus}  (evento novo, pedido
//                      ao time de DevOps em 2026-09-28 -- sem ele achado não
//                      fecha sozinho)

export type SastEnvironment = "producao" | "homolog" | "dev" | "outro";

export type SastDetectionRow = {
  source_event_id: string;
  ingest_source: "app-insights" | "webhook";
  tool: string;
  category: string;
  project: string;
  repository: string;
  branch: string;
  environment: SastEnvironment;
  rule_id: string;
  severity: string | null;
  fingerprint: string;
  file_path: string | null;
  line: number | null;
  title: string | null;
  details: Record<string, unknown>;
  detected_at: string;
  commit_sha: string | null;
  build_id: string | null;
  build_url: string | null;
  file_url: string | null;
  author: string | null;
  author_email: string | null;
  raw_event: Record<string, unknown>;
};

export type SastScanRunRow = {
  source_event_id: string;
  ingest_source: "app-insights" | "webhook";
  tool: string;
  project: string;
  repository: string;
  branch: string;
  environment: SastEnvironment;
  commit_sha: string | null;
  build_id: string | null;
  build_url: string | null;
  findings_count: number | null;
  scanned_at: string;
};

// Campos que carregariam o valor do segredo se algum dia o template passar a
// mandá-los (o JSON nativo do Gitleaks tem Secret/Match). Descartados antes de
// qualquer coisa ir pro banco -- nem raw_event guarda.
const SECRET_BEARING_KEYS = new Set(["secret", "match", "snippet", "value", "rawsecret"]);

export function stripSecretFields(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(props)) {
    if (SECRET_BEARING_KEYS.has(k.toLowerCase())) continue;
    out[k] = v;
  }
  return out;
}

const PROD_BRANCHES = new Set(["main", "master", "prod", "producao", "production"]);
const HML_BRANCHES = new Set([
  "homolog",
  "homologacao",
  "hml",
  "staging",
  "stage",
  "beta",
  "release",
]);
const DEV_BRANCHES = new Set(["develop", "dev", "development"]);

export function branchToEnvironment(branch: string): SastEnvironment {
  const b = branch.replace(/^refs\/heads\//, "").toLowerCase();
  if (PROD_BRANCHES.has(b)) return "producao";
  if (HML_BRANCHES.has(b) || b.startsWith("release/")) return "homolog";
  if (DEV_BRANCHES.has(b) || b.startsWith("feature/") || b.startsWith("bugfix/")) return "dev";
  return "outro";
}

// Categoria/severidade por ferramenta. Gitleaks não manda severidade -- todo
// segredo exposto é tratado como crítico (decisão de produto, mesma leitura
// do painel do Clarity Hub).
const TOOL_PROFILE: Record<string, { category: string; defaultSeverity: string | null }> = {
  gitleaks: { category: "secret", defaultSeverity: "critica" },
  semgrep: { category: "code", defaultSeverity: null },
  "dependency-check": { category: "dependency", defaultSeverity: null },
  trivy: { category: "dependency", defaultSeverity: null },
};

function toolProfile(tool: string) {
  return TOOL_PROFILE[tool.toLowerCase()] ?? { category: "other", defaultSeverity: null };
}

// Nome canônico da ferramenta -- entra na chave única do achado (tool+projeto+
// repo+branch+fingerprint), então as duas origens (App Insights manda
// "Gitleaks", a pipeline manda "gitleaks") TÊM que gravar o mesmo texto, senão
// o mesmo segredo vira dois achados.
const TOOL_CANONICAL: Record<string, string> = {
  gitleaks: "Gitleaks",
  semgrep: "Semgrep",
  "dependency-check": "Dependency-Check",
  trivy: "Trivy",
};

export function canonicalTool(tool: string): string {
  return TOOL_CANONICAL[tool.trim().toLowerCase()] ?? tool.trim();
}

// Autor que não é gente: identidade de build ou o bot do espelhamento
// GitHub -> Azure Repos dos projetos Lovable (cicd/lovable-pipelines.yml).
// Mesma regra de upsert_sast_detections (migration 20260929100000).
export function isNonHumanAuthor(name: string | null | undefined, email?: string | null): boolean {
  if (!name) return true;
  return /build service|sync agent/i.test(name) || /^azure-sync-bot@/i.test(email ?? "");
}

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
};

// Linha do achado: o evento não tem campo próprio -- vem no fim do
// Fingerprint ("arquivo:regra:79") e no &line= do FileUrl.
function extractLine(fingerprint: string | null, fileUrl: string | null): number | null {
  const fromFp = fingerprint?.match(/:(\d+)$/)?.[1];
  if (fromFp) return Number(fromFp);
  const fromUrl = fileUrl?.match(/[?&]line=(\d+)/)?.[1];
  return fromUrl ? Number(fromUrl) : null;
}

// Fingerprint = "arquivo:regra:linha", SEM commit: o mesmo segredo em builds
// diferentes tem que virar 1 achado. O Gitleaks em modo git (não --no-git)
// prefixa o SHA ("<sha>:arquivo:regra:linha") -- tirado aqui, pras duas
// origens baterem na mesma chave.
function normalizeFingerprint(
  raw: string | null,
  file: string | null,
  ruleId: string,
  line: number | null,
): string {
  if (raw) return raw.replace(/^[0-9a-f]{40}:/i, "");
  return `${file ?? "?"}:${ruleId}:${line ?? 0}`;
}

function extractBuildId(props: Record<string, unknown>): string | null {
  const direct = str(props.BuildId ?? props.BuildID);
  if (direct) return direct;
  const url = str(props.BuildURL);
  return url?.match(/[?&]buildId=(\d+)/)?.[1] ?? null;
}

type ScopeFields = { tool: string; project: string; repository: string; branch: string };

function scopeOf(props: Record<string, unknown>): ScopeFields | null {
  const source = str(props.Source);
  const tool = source ? canonicalTool(source) : null;
  const project = str(props.Project);
  const repository = str(props.Repository);
  const branch = str(props.Branch)?.replace(/^refs\/heads\//, "") ?? null;
  if (!tool || !project || !repository || !branch) return null;
  return { tool, project, repository, branch };
}

export function normalizeSecretDetected(
  sourceEventId: string,
  timestamp: string,
  rawProps: Record<string, unknown>,
): SastDetectionRow | null {
  const props = stripSecretFields(rawProps);
  const scope = scopeOf(props);
  const ruleId = str(props.RuleID ?? props.RuleId);
  if (!scope || !ruleId) return null;

  const file = str(props.File);
  const fileUrl = str(props.FileUrl);
  const line = extractLine(str(props.Fingerprint), fileUrl);
  const fingerprint = normalizeFingerprint(str(props.Fingerprint), file, ruleId, line);
  const profile = toolProfile(scope.tool);

  return {
    source_event_id: sourceEventId,
    ingest_source: "app-insights",
    ...scope,
    environment: branchToEnvironment(scope.branch),
    category: profile.category,
    rule_id: ruleId,
    severity: profile.defaultSeverity,
    fingerprint,
    file_path: file,
    line,
    title: ruleId,
    details: str(props.Scanner) ? { scanner: str(props.Scanner) } : {},
    detected_at: timestamp,
    commit_sha: str(props.Commit),
    build_id: extractBuildId(props),
    build_url: str(props.BuildURL),
    file_url: fileUrl,
    author: str(props.Author),
    author_email: str(props.AuthorEmail),
    raw_event: props,
  };
}

// ScanStatus != "completed" (ex.: gitleaks nem rodou, relatório não gerado) não
// vira execução -- registrar fecharia todos os achados abertos do escopo como
// se o repo estivesse limpo.
export function normalizeScanCompleted(
  sourceEventId: string,
  timestamp: string,
  rawProps: Record<string, unknown>,
): SastScanRunRow | null {
  const props = stripSecretFields(rawProps);
  const scope = scopeOf(props);
  if (!scope) return null;
  const status = str(props.ScanStatus)?.toLowerCase() ?? "completed";
  if (status !== "completed") return null;
  const count = str(props.FindingsCount);

  return {
    source_event_id: sourceEventId,
    ingest_source: "app-insights",
    ...scope,
    environment: branchToEnvironment(scope.branch),
    commit_sha: str(props.Commit),
    build_id: extractBuildId(props),
    build_url: str(props.BuildURL),
    findings_count: count !== null && /^\d+$/.test(count) ? Number(count) : null,
    scanned_at: timestamp,
  };
}

// ─── Ingestão direta (relatório nativo do Gitleaks enviado pela pipeline) ────
// Escopo (projeto/repo/branch/commit/build) NÃO vem do corpo do envio: vem da
// build conferida na API do Azure DevOps ou do Gitea (ver sast-ingest.server.ts),
// que é a fonte confiável. Daqui só sai o que é do achado em si.

export type VerifiedBuildScope = {
  // Prefixo do source_event_id: separa a build 12 do Azure DevOps da execução 12 do Gitea.
  origin: "ado" | "gitea";
  project: string;
  repository: string;
  branch: string;
  commit: string;
  buildId: string;
  buildUrl: string | null;
  // Link do arquivo na versão do commit, no formato de cada plataforma.
  fileUrlFor: (file: string, line: number | null) => string;
};

/** Link de arquivo no Azure Repos (base = https://dev.azure.com/<org>/<projeto>/_git/<repo>). */
export function adoFileUrl(base: string, commit: string) {
  return (file: string, line: number | null) =>
    `${base}?path=${encodeURIComponent("/" + file)}&version=GC${commit}` +
    (line ? `&line=${line}&lineEnd=${line}&lineStartColumn=1&lineEndColumn=1` : "");
}

/** Link de arquivo no Gitea (base = https://<gitea>/<dono>/<repo>). */
export function giteaFileUrl(base: string, commit: string) {
  return (file: string, line: number | null) =>
    `${base}/src/commit/${commit}/${file.split("/").map(encodeURIComponent).join("/")}` +
    (line ? `#L${line}` : "");
}

export type GitleaksReportFinding = {
  RuleID?: unknown;
  File?: unknown;
  StartLine?: unknown;
  Fingerprint?: unknown;
  Description?: unknown;
  Author?: unknown;
  Email?: unknown;
  Tags?: unknown;
  Entropy?: unknown;
  [key: string]: unknown;
};

export function normalizeGitleaksReportFinding(
  finding: GitleaksReportFinding,
  scope: VerifiedBuildScope,
  detectedAt: string,
  commitAuthor: { name: string | null; email: string | null },
): SastDetectionRow | null {
  const props = stripSecretFields(finding as Record<string, unknown>);
  const ruleId = str(props.RuleID);
  if (!ruleId) return null;
  const file = str(props.File)?.replace(/^\.?\//, "") ?? null;
  const startLine = Number(props.StartLine);
  const line = Number.isInteger(startLine) && startLine > 0 ? startLine : null;
  const fingerprint = normalizeFingerprint(str(props.Fingerprint), file, ruleId, line);
  const tool = canonicalTool("gitleaks");
  const profile = toolProfile(tool);
  // Em modo git o próprio Gitleaks traz o autor do commit que introduziu o
  // segredo (melhor informação possível); em --no-git vem vazio e cai no
  // autor do commit da build.
  const author = str(props.Author) ?? commitAuthor.name;
  const authorEmail = str(props.Email) ?? commitAuthor.email;
  const fileUrl = file ? scope.fileUrlFor(file, line) : null;

  return {
    // 1 detecção por build+fingerprint: reenvio/retry da mesma build não duplica.
    source_event_id: `${scope.origin}:${scope.buildId}:${tool}:${fingerprint}`,
    ingest_source: "webhook",
    tool,
    category: profile.category,
    project: scope.project,
    repository: scope.repository,
    branch: scope.branch,
    environment: branchToEnvironment(scope.branch),
    rule_id: ruleId,
    severity: profile.defaultSeverity,
    fingerprint,
    file_path: file,
    line,
    title: str(props.Description) ?? ruleId,
    details: {
      ...(Array.isArray(props.Tags) && props.Tags.length ? { tags: props.Tags } : {}),
      ...(typeof props.Entropy === "number" ? { entropy: props.Entropy } : {}),
    },
    detected_at: detectedAt,
    commit_sha: scope.commit,
    build_id: scope.buildId,
    build_url: scope.buildUrl,
    file_url: fileUrl,
    author,
    author_email: authorEmail,
    raw_event: props,
  };
}

// ─── Semgrep (JSON de `semgrep scan --json-output`) ──────────────────────────
// extra.lines traz o trecho do código (pode conter segredo) e extra.fix a
// correção sugerida: nenhum dos dois vai pro banco -- só regra, arquivo,
// linha, mensagem e metadados da regra.

export type SemgrepResult = {
  check_id?: unknown;
  path?: unknown;
  start?: { line?: unknown };
  extra?: {
    message?: unknown;
    severity?: unknown;
    fingerprint?: unknown;
    metadata?: Record<string, unknown>;
  };
  [key: string]: unknown;
};

// Semgrep < 1.100 usa ERROR/WARNING/INFO; versões novas, CRITICAL..LOW.
const SEMGREP_SEVERITY: Record<string, string> = {
  CRITICAL: "critica",
  ERROR: "alta",
  HIGH: "alta",
  WARNING: "media",
  MEDIUM: "media",
  INFO: "baixa",
  LOW: "baixa",
};

const firstN = (v: unknown, n: number): unknown[] | undefined =>
  Array.isArray(v) && v.length ? v.slice(0, n) : typeof v === "string" ? [v] : undefined;

export function normalizeSemgrepResult(
  result: SemgrepResult,
  scope: VerifiedBuildScope,
  detectedAt: string,
  commitAuthor: { name: string | null; email: string | null },
): SastDetectionRow | null {
  const ruleId = str(result.check_id);
  const file = str(result.path)?.replace(/^\.?\//, "") ?? null;
  if (!ruleId || !file) return null;
  const startLine = Number(result.start?.line);
  const line = Number.isInteger(startLine) && startLine > 0 ? startLine : null;
  const extra = result.extra ?? {};
  const meta = (extra.metadata ?? {}) as Record<string, unknown>;
  // Impressão digital do trecho (não muda se o arquivo ganhar linhas acima);
  // no Semgrep sem login às vezes vem "requires login" -- aí cai na linha.
  const fp = str(extra.fingerprint);
  const fingerprint =
    fp && /^[0-9a-f]{16,}/i.test(fp)
      ? `${file}:${ruleId}:${fp.slice(0, 32)}`
      : `${file}:${ruleId}:${line ?? 0}`;
  const tool = canonicalTool("semgrep");
  const message = str(extra.message);
  const details: Record<string, unknown> = {};
  if (message) details.message = message.slice(0, 1000);
  for (const k of ["cwe", "owasp"] as const) {
    const v = firstN(meta[k], 3);
    if (v) details[k] = v;
  }
  for (const k of ["confidence", "likelihood", "impact"] as const) {
    if (str(meta[k])) details[k] = str(meta[k]);
  }
  const refs = firstN(meta.references, 3);
  if (refs) details.references = refs;

  return {
    source_event_id: `${scope.origin}:${scope.buildId}:${tool}:${fingerprint}`,
    ingest_source: "webhook",
    tool,
    category: toolProfile(tool).category,
    project: scope.project,
    repository: scope.repository,
    branch: scope.branch,
    environment: branchToEnvironment(scope.branch),
    rule_id: ruleId,
    severity: SEMGREP_SEVERITY[String(extra.severity ?? "").toUpperCase()] ?? null,
    fingerprint,
    file_path: file,
    line,
    // Título: a primeira frase da mensagem; sem ela, o último trecho do id da regra.
    title: (message?.split(/(?<=\.)\s/)[0] ?? ruleId.split(".").pop() ?? ruleId).slice(0, 200),
    details,
    detected_at: detectedAt,
    commit_sha: scope.commit,
    build_id: scope.buildId,
    build_url: scope.buildUrl,
    file_url: scope.fileUrlFor(file, line),
    // O Semgrep não sabe quem escreveu a linha: fica o autor do commit analisado.
    author: commitAuthor.name,
    author_email: commitAuthor.email,
    raw_event: {
      check_id: ruleId,
      path: file,
      start: result.start ?? null,
      severity: extra.severity ?? null,
    },
  };
}
