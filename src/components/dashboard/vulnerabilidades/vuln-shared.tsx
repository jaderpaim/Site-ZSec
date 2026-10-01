export type Vuln = {
  id: string;
  fqdn: string;
  severity: "Crítica" | "Alta" | "Média" | "Baixa";
  status: "Aberta" | "Em tratamento" | "Mitigada" | "Fechada";
  responsible: string | null;
  identified_at: string | null;
  updated_at: string;
  source: string | null;
  vuln_type: string | null;
  system_app: string | null;
  department_id: string | null;
  kind: "aplicacao" | "infraestrutura";
  raw?: Record<string, unknown> | null;
  closed_at?: string | null;
  status_changed_at?: string | null;
  pending_approval?: boolean | null;
  pending_status?: string | null;
  pending_by?: string | null;
  pending_at?: string | null;
  mitigation_description?: string | null;
  // Data final do plano de ação — definida ao mover o status para "Em tratamento".
  treatment_due_date?: string | null;
  created_at?: string | null;
  // Infra: fechado por ausência no import (não por Fix explícito) — ver
  // close_missing_infra_vulns / upsert_vuln_infra v3.
  presumed_closed?: boolean | null;
  // Infra: quando um achado presumed_closed voltou a aparecer num import posterior.
  reopened_at?: string | null;
};

// Duplicado (em vez de importado de VulnerabilidadesReal.tsx) para não criar import
// circular entre o dashboard e o VulnDetailsSheet — são cores fixas, não mudam sozinhas.
const SEV_MAP: Record<string, { color: string; bg: string; border: string }> = {
  Crítica: { color: "#EF4444", bg: "rgba(239,68,68,0.10)", border: "rgba(239,68,68,0.25)" },
  Alta: { color: "#F59E0B", bg: "rgba(245,158,11,0.10)", border: "rgba(245,158,11,0.25)" },
  Média: { color: "#3B82F6", bg: "rgba(59,130,246,0.08)", border: "rgba(59,130,246,0.25)" },
  Baixa: { color: "#10B981", bg: "rgba(16,185,129,0.10)", border: "rgba(16,185,129,0.25)" },
};
const STATUS_MAP: Record<string, { color: string; bg: string; border: string }> = {
  Aberta: { color: "#EF4444", bg: "rgba(239,68,68,0.10)", border: "rgba(239,68,68,0.25)" },
  "Em tratamento": {
    color: "#F59E0B",
    bg: "rgba(245,158,11,0.10)",
    border: "rgba(245,158,11,0.25)",
  },
  Mitigada: { color: "#3B82F6", bg: "rgba(59,130,246,0.08)", border: "rgba(59,130,246,0.25)" },
  Fechada: { color: "#10B981", bg: "rgba(16,185,129,0.10)", border: "rgba(16,185,129,0.25)" },
};

export function SevBadge({ sev }: { sev: string }) {
  const s = SEV_MAP[sev] ?? SEV_MAP.Baixa;
  return (
    <span className="vr-badge" style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {sev}
    </span>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS_MAP[status] ?? STATUS_MAP.Aberta;
  return (
    <span className="vr-badge" style={{ background: s.bg, color: s.color, border: `1px solid ${s.border}` }}>
      {status}
    </span>
  );
}

const PT_MONTHS: Record<string, string> = {
  jan: "01",
  fev: "02",
  mar: "03",
  abr: "04",
  mai: "05",
  jun: "06",
  jul: "07",
  ago: "08",
  set: "09",
  out: "10",
  nov: "11",
  dez: "12",
};
function parseJiraDate(s: string): string | null {
  const m = s
    .trim()
    .toLowerCase()
    .match(/^(\d{1,2})\/([a-zç]{3})\/(\d{2,4})/);
  if (!m) return null;
  const day = m[1].padStart(2, "0");
  const mon = PT_MONTHS[m[2]];
  if (!mon) return null;
  const yy = m[3];
  const year = yy.length === 2 ? (parseInt(yy, 10) >= 70 ? `19${yy}` : `20${yy}`) : yy;
  return `${year}-${mon}-${day}`;
}
function parseRawDate(val: unknown): string | null {
  if (typeof val !== "string" || val.length < 6) return null;
  const jira = parseJiraDate(val);
  if (jira) return jira;
  const d = new Date(val);
  if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  if (/^\d{4}-\d{2}-\d{2}/.test(val)) return val.slice(0, 10);
  return null;
}

// Extrai o 1º valor não-vazio de `raw` dentre as chaves candidatas — usado tanto pra exibir
// detalhes (VulnDetailsSheet) quanto pra pré-preencher o diálogo de edição.
export function pickRaw(raw: Record<string, unknown> | null | undefined, keys: string[]): string | null {
  if (!raw) return null;
  for (const k of keys) {
    const val = raw[k];
    if (val === null || val === undefined) continue;
    if (typeof val !== "string" && typeof val !== "number" && typeof val !== "boolean") continue;
    const s = String(val).trim();
    if (s) return s;
  }
  return null;
}

function rawDate(v: Vuln, keys: string[]): string | null {
  const raw = (v.raw ?? {}) as Record<string, unknown>;
  for (const k of keys) {
    const found = parseRawDate(raw[k]);
    if (found) return found;
  }
  return null;
}

export function closedAt(v: Vuln): string | null {
  if (v.status !== "Mitigada" && v.status !== "Fechada") return null;
  // status_changed_at is the canonical date: set explicitly on import (from "Atualizado")
  // and on manual changes (today). Takes priority over the trigger-computed closed_at.
  if (v.status_changed_at) return v.status_changed_at.slice(0, 10);
  if (v.closed_at) return v.closed_at.slice(0, 10);
  return rawDate(v, [
    "Resolvida em",
    "Resolvido em",
    "Resolvido",
    "Resolved",
    "Resolved at",
    "resolutiondate",
    "Resolution Date",
    "Data de fechamento",
    "Data de Fechamento",
    "Closed at",
    "Closed",
    "Data resolução",
    "Data Resolução",
    "Atualizado",
    "Updated",
    "Updated at",
  ]);
}

// "Atualizado" do JSON importado é a data real do sistema de origem (JIRA/Nessus
// etc.) — usar isso em vez da coluna interna updated_at, que reflete apenas
// quando o registro foi gravado no banco (ex.: hora do import).
export function lastUpdatedAt(v: Vuln): string | null {
  return rawDate(v, ["Atualizado", "Atualizado em", "Updated", "Updated at", "Last Updated"]) ?? v.updated_at ?? null;
}

// Data de criação da vuln de infra lida diretamente do raw CSV — fonte canônica para o
// gráfico evolutivo, pois garante que vulns com identified_at nulo ainda apareçam no mês certo.
export function infraCriadoDate(v: Vuln): string | null {
  return (
    rawDate(v, ["Criado", "Criada", "Data Criação", "Data de Criação", "Created", "Created At"]) ??
    v.identified_at ??
    null
  );
}
