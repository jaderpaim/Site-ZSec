#!/usr/bin/env node
// Envia o relatório de uma ferramenta da esteira ao módulo SAST do Z-Sec
// (/api/public/hooks/sast-ingest). Roda dentro de um job do Gitea Actions.
//
// Uso: node scripts/ci/sast-enviar.mjs <ferramenta> <relatorio.json> [campo]
//   campo: onde está a lista de achados no JSON (ex.: "results" no Semgrep);
//          sem campo, o JSON inteiro já é a lista (Gitleaks). O Trivy é
//          achatado aqui (Results[].Vulnerabilities[]).
//
// Precisa de ZSEC_URL (variável do repositório) e SAST_INGEST_KEY (segredo).
// O Z-Sec confere repositório/execução/commit/branch na API do Gitea -- o
// que vai aqui é só a referência, não a fonte de verdade.
import { existsSync, readFileSync } from "node:fs";

const [tool, reportPath, field] = process.argv.slice(2);
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
  !tool && "argumento <ferramenta>",
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
  const list =
    tool === "trivy"
      ? (parsed?.Results ?? []).flatMap((r) =>
          (r.Vulnerabilities ?? []).map((v) => ({ ...v, Target: r.Target, Type: r.Type })),
        )
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
