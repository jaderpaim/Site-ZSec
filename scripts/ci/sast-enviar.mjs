#!/usr/bin/env node
// Envia o relatório de uma ferramenta da esteira ao módulo SAST do Z-Sec
// (/api/public/hooks/sast-ingest). Roda dentro de um job do Gitea Actions.
//
// Uso: node scripts/ci/sast-enviar.mjs <ferramenta> <relatorio.json> [campo]
//   campo: onde está a lista de achados no JSON (ex.: "results" no Semgrep);
//          sem campo, o JSON inteiro já é a lista (Gitleaks). O Trivy
//          (Results[].Vulnerabilities[]) e o OWASP Dependency-Check
//          (dependencies[].vulnerabilities[]) são achatados aqui.
//
// SARIF (qualquer ferramenta que exporte: CodeQL, Snyk, Checkov, Bandit…):
//   node scripts/ci/sast-enviar.mjs sarif <relatorio.sarif> <nome-da-ferramenta>
//   runs[].results[] vira a lista, cada resultado com a regra e a ferramenta
//   junto; trechos de código (snippet/contextRegion/codeFlows) não são enviados.
//
// Precisa de ZSEC_URL (variável do repositório) e SAST_INGEST_KEY (segredo).
// O Z-Sec confere repositório/execução/commit/branch na API do Gitea -- o
// que vai aqui é só a referência, não a fonte de verdade.
import { existsSync, readFileSync } from "node:fs";

const [toolArg, reportPath, field] = process.argv.slice(2);
// No modo SARIF o 3º argumento é o nome da ferramenta (é ele que agrupa os achados).
const sarif = toolArg === "sarif";
const tool = sarif ? field : toolArg;
const {
  ZSEC_URL,
  SAST_INGEST_KEY,
  GITHUB_REPOSITORY,
  GITHUB_RUN_ID,
  GITHUB_REF_NAME,
  GITHUB_SHA,
  GITHUB_EVENT_NAME,
  GITHUB_EVENT_PATH,
} = process.env;

const faltando = [
  !tool && (sarif ? "argumento <nome-da-ferramenta> (modo sarif)" : "argumento <ferramenta>"),
  !reportPath && "argumento <relatorio.json>",
  !ZSEC_URL && "variável ZSEC_URL (Gitea → Actions → Variáveis)",
  !SAST_INGEST_KEY && "segredo SAST_INGEST_KEY (Gitea → Actions → Segredos)",
].filter(Boolean);
if (faltando.length) {
  console.error(`Envio ao SAST não configurado: falta ${faltando.join(", ")}.`);
  process.exit(1);
}

// Sem relatório = a ferramenta nem rodou: "failed" faz o Z-Sec ignorar o envio
// em vez de fechar todos os achados abertos como se o repositório estivesse limpo.
let status = "failed";
let findings = [];
if (existsSync(reportPath)) {
  const raw = readFileSync(reportPath, "utf8").trim();
  const parsed = raw ? JSON.parse(raw) : [];
  // Trivy: Results[].Vulnerabilities[] vira uma lista só, cada item com o
  // arquivo de dependências (Target) e o ecossistema (Type) de origem.
  const list = sarif
    ? flattenSarif(parsed)
    : tool === "trivy"
      ? (parsed?.Results ?? []).flatMap((r) =>
          (r.Vulnerabilities ?? []).map((v) => ({ ...v, Target: r.Target, Type: r.Type })),
        )
      : tool === "dependency-check"
        ? flattenDependencyCheck(parsed)
        : field
          ? parsed?.[field]
          : parsed;
  if (Array.isArray(list)) {
    status = "completed";
    findings = list;
  } else {
    console.error(`Relatório ${reportPath} sem a lista de achados${field ? ` em "${field}"` : ""}.`);
  }
}

// SARIF: cada result com a regra resolvida (_rule, por ruleId ou ruleIndex) e o
// driver (_driver). Sem "runs" devolve null (não é SARIF).
function flattenSarif(doc) {
  if (!Array.isArray(doc?.runs)) return null;
  return doc.runs.flatMap((run) => {
    const driver = run?.tool?.driver ?? {};
    const rules = [
      ...(Array.isArray(driver.rules) ? driver.rules : []),
      ...(run?.tool?.extensions ?? []).flatMap((x) => (Array.isArray(x?.rules) ? x.rules : [])),
    ];
    const byId = new Map(rules.filter((r) => r?.id).map((r) => [String(r.id), r]));
    return (run?.results ?? []).map((res) => {
      const id = res?.ruleId ?? res?.rule?.id;
      const rule = (id && byId.get(String(id))) ?? rules[res?.ruleIndex] ?? null;
      // Só o que o Z-Sec usa: nada de codeFlows/relatedLocations/snippet.
      return {
        ruleId: res?.ruleId,
        ruleIndex: res?.ruleIndex,
        rule: res?.rule ? { id: res.rule.id } : undefined,
        level: res?.level,
        message: res?.message?.text ? { text: res.message.text } : undefined,
        fingerprints: res?.fingerprints,
        partialFingerprints: res?.partialFingerprints,
        properties: res?.properties?.["security-severity"]
          ? { "security-severity": res.properties["security-severity"] }
          : undefined,
        locations: (res?.locations ?? []).slice(0, 1).map((l) => ({
          physicalLocation: {
            artifactLocation: { uri: l?.physicalLocation?.artifactLocation?.uri },
            region: { startLine: l?.physicalLocation?.region?.startLine },
          },
        })),
        _rule: rule && {
          id: rule.id,
          name: rule.name,
          shortDescription: rule.shortDescription,
          helpUri: rule.helpUri,
          defaultConfiguration: rule.defaultConfiguration,
          properties: {
            tags: rule.properties?.tags,
            "security-severity": rule.properties?.["security-severity"],
          },
        },
        _driver: { name: driver.name, version: driver.version ?? driver.semanticVersion },
      };
    });
  });
}

// Dependency-Check (JSON): cada vulnerabilidade com o pacote junto. Sem
// "dependencies" devolve null (não é o relatório do Dependency-Check).
function flattenDependencyCheck(doc) {
  if (!Array.isArray(doc?.dependencies)) return null;
  return doc.dependencies.flatMap((d) =>
    (d?.vulnerabilities ?? []).map((v) => ({
      ...v,
      _dependency: { fileName: d.fileName, filePath: d.filePath, packageId: d.packages?.[0]?.id },
    })),
  );
}

// PR: os achados ficam na branch de ORIGEM do PR (o Z-Sec confere na API do
// Gitea que o PR existe, está aberto e que o commit é o último dele).
let branch = GITHUB_REF_NAME;
let commit = GITHUB_SHA;
let pullRequest;
if (GITHUB_EVENT_NAME === "pull_request" && GITHUB_EVENT_PATH && existsSync(GITHUB_EVENT_PATH)) {
  const ev = JSON.parse(readFileSync(GITHUB_EVENT_PATH, "utf8"));
  pullRequest = ev.pull_request?.number ?? ev.number;
  branch = ev.pull_request?.head?.ref ?? process.env.GITHUB_HEAD_REF ?? branch;
  commit = ev.pull_request?.head?.sha ?? commit;
}

const res = await fetch(`${ZSEC_URL.replace(/\/+$/, "")}/api/public/hooks/sast-ingest`, {
  method: "POST",
  headers: { Authorization: `Bearer ${SAST_INGEST_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({
    schema: 1,
    provider: "gitea",
    tool,
    ...(sarif ? { format: "sarif" } : {}),
    repository: GITHUB_REPOSITORY,
    runId: Number(GITHUB_RUN_ID),
    branch,
    commit,
    ...(pullRequest ? { pullRequest: Number(pullRequest) } : {}),
    status,
    findings,
  }),
});
const text = await res.text();
console.log(
  `${tool}${pullRequest ? ` (PR #${pullRequest})` : ""}: ${findings.length} achado(s) enviados, HTTP ${res.status} ${text}`,
);
if (!res.ok) process.exit(1);
