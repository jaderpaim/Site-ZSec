import { SyncActions } from "@/components/layout/SyncActions";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import * as XLSX from "xlsx";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  ComposedChart,
  Bar,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  AlertTriangle,
  Circle,
  Diamond,
  Download,
  Loader2,
  Search,
  Square,
  Triangle,
} from "lucide-react";
import { ModuleLoading } from "@/components/layout/ModuleLoading";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { isNonHumanAuthor } from "@/lib/sast-normalize";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import {
  getSastAccess,
  getSastSyncStatus,
  listSastFindingEvents,
  listSastFindings,
  listSastScanRuns,
  setSastFindingStatus,
} from "@/lib/sast.functions";
import { APP_NAME } from "@/lib/brand";

// Módulo SAST: achados das esteiras CI/CD (Gitleaks hoje, via App Insights --
// ver sast.server.ts). Layout aprovado em preview (2026-09-28): filtros ->
// KPIs -> evolução + distribuição -> abas Achados / Execuções e cobertura /
// Por autor. Detalhe do achado em Sheet lateral redimensionável, mesmo padrão
// do HostDetailsSheet do Shadow IT.

type Status = "aberto" | "resolvido" | "falso_positivo" | "risco_aceito";
type Env = "producao" | "homolog" | "dev" | "outro";

type SastFinding = {
  id: string;
  tool: string;
  category: string;
  project: string;
  repository: string;
  branch: string;
  environment: Env;
  rule_id: string;
  severity: string | null;
  fingerprint: string;
  file_path: string | null;
  line: number | null;
  title: string | null;
  details: Record<string, unknown> | null;
  status: Status;
  resolution_source: "auto" | "manual" | null;
  resolved_at: string | null;
  triaged_at: string | null;
  triage_note: string | null;
  triaged_by_name: string | null;
  first_seen_at: string;
  last_seen_at: string;
  occurrences: number;
  last_commit_sha: string | null;
  last_build_id: string | null;
  last_build_url: string | null;
  last_file_url: string | null;
  last_author: string | null;
  last_author_email: string | null;
  introduced_by: string | null;
  introduced_by_email: string | null;
};

type SastRun = {
  id: string;
  tool: string;
  project: string;
  repository: string;
  branch: string;
  environment: Env;
  build_id: string | null;
  build_url: string | null;
  findings_count: number | null;
  scanned_at: string;
};

const DAY = 864e5;
const ALL = "__all";

type Tone = "danger" | "success" | "muted" | "info" | "warning";
const TONE: Record<Tone, string> = {
  danger: "var(--v2-crit)",
  success: "var(--v2-ok)",
  muted: "var(--v2-fg-3)",
  info: "var(--v2-accent)",
  warning: "var(--v2-med)",
};
const STATUS: Record<Status, { label: string; tone: Tone }> = {
  aberto: { label: "Aberto", tone: "danger" },
  resolvido: { label: "Resolvido", tone: "success" },
  falso_positivo: { label: "Falso positivo", tone: "muted" },
  risco_aceito: { label: "Risco aceito", tone: "info" },
};
const ENV: Record<Env, { label: string; tone: Tone }> = {
  producao: { label: "Produção", tone: "danger" },
  homolog: { label: "Homolog", tone: "warning" },
  dev: { label: "Dev", tone: "info" },
  outro: { label: "Outro", tone: "muted" },
};
type SevIcon = React.ComponentType<{ size?: number; fill?: string; strokeWidth?: number }>;
const SEV: Record<string, { label: string; color: string; rank: number; icon: SevIcon }> = {
  critica: { label: "Crítica", color: "var(--v2-crit)", rank: 0, icon: Triangle },
  alta: { label: "Alta", color: "var(--v2-high)", rank: 1, icon: Diamond },
  media: { label: "Média", color: "var(--v2-med)", rank: 2, icon: Square },
  baixa: { label: "Baixa", color: "var(--v2-low)", rank: 3, icon: Circle },
  info: { label: "Info", color: "var(--v2-fg-3)", rank: 4, icon: Circle },
};
const sevOf = (s: string | null) =>
  SEV[s ?? ""] ?? { label: "—", color: "var(--v2-fg-3)", rank: 5, icon: Circle };

/** Selo com ponto colorido (padrão v2). */
function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span className="sa-pill" style={{ "--c": TONE[tone] } as React.CSSProperties}>
      {children}
    </span>
  );
}
function SevBadge({ severity }: { severity: string | null }) {
  const sv = sevOf(severity);
  const Icon = sv.icon;
  return (
    <span className="sa-sev" style={{ "--c": sv.color } as React.CSSProperties}>
      <span style={{ color: sv.color, display: "grid" }}>
        <Icon size={10} fill="currentColor" strokeWidth={0} />
      </span>
      {sv.label}
    </span>
  );
}
// Campos de `details` gravados pelos normalizadores (sast-normalize.ts), na
// ordem em que aparecem no painel. O que vem da esteira é dado de terceiro:
// só texto -- link só se for http(s).
const DETAIL_FIELDS: [string, string][] = [
  ["message", "Descrição"],
  ["remediation", "Como corrigir"],
  ["package", "Pacote"],
  ["ecosystem", "Ecossistema"],
  ["installed_version", "Versão instalada"],
  ["fixed_version", "Versão corrigida"],
  ["cvss_v3", "CVSS v3"],
  ["table", "Tabela"],
  ["policy", "Política"],
  ["cwe", "CWE"],
  ["owasp", "OWASP"],
  ["confidence", "Confiança"],
  ["impact", "Impacto"],
  ["likelihood", "Probabilidade"],
  ["tags", "Tags"],
];
const isHttpUrl = (v: unknown): v is string => typeof v === "string" && /^https?:\/\//i.test(v);

function FindingDetails({ details }: { details: Record<string, unknown> | null }) {
  if (!details) return null;
  const links = [
    details.url,
    ...(Array.isArray(details.references) ? details.references : []),
  ].filter(isHttpUrl);
  return (
    <>
      {DETAIL_FIELDS.filter(
        ([k]) => details[k] !== undefined && details[k] !== null && details[k] !== "",
      ).map(([k, label]) => (
        <React.Fragment key={k}>
          <dt className="text-v2-fg-3">{label}</dt>
          <dd className={k === "message" || k === "remediation" ? "" : "font-data text-[12px]"}>
            {Array.isArray(details[k])
              ? (details[k] as unknown[]).map(String).join(", ")
              : String(details[k])}
          </dd>
        </React.Fragment>
      ))}
      {links.length > 0 && (
        <>
          <dt className="text-v2-fg-3">Referências</dt>
          <dd className="flex flex-col gap-0.5 text-[12px] break-all">
            {[...new Set(links)].map((u) => (
              <a key={u} href={u} target="_blank" rel="noopener noreferrer">
                {u}
              </a>
            ))}
          </dd>
        </>
      )}
    </>
  );
}

const CATEGORY_LABEL: Record<string, string> = {
  secret: "Segredo",
  code: "Código",
  dependency: "Dependência",
  database: "Banco de dados (RLS)",
  iac: "IaC",
  other: "Outro",
};

const fmtDateTime = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "—";
function relTime(iso: string | null): string {
  if (!iso) return "—";
  const h = (Date.now() - new Date(iso).getTime()) / 36e5;
  if (h < 1) return "agora";
  if (h < 24) return `há ${Math.round(h)}h`;
  return `há ${Math.round(h / 24)}d`;
}
const scopeKey = (x: { tool: string; project: string; repository: string; branch: string }) =>
  `${x.tool}|${x.project}|${x.repository}|${x.branch}`;
// Build Service ou o bot do espelhamento Lovable (mesma regra do banco/normalize)
const isBuildService = (name: string | null, email?: string | null) =>
  !!name && isNonHumanAuthor(name, email);

type Filters = {
  days: number;
  project: string;
  repo: string;
  env: string;
  tool: string;
  status: string; // "ativos" = só abertos
  rule: string;
  q: string;
};
const DEFAULT_FILTERS: Filters = {
  days: 30,
  project: ALL,
  repo: ALL,
  env: ALL,
  tool: ALL,
  status: "ativos",
  rule: ALL,
  q: "",
};

function FilterSelect({
  id,
  label,
  value,
  onChange,
  options,
  isDefault,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<{ value: string; label: string }>;
  isDefault: boolean;
}) {
  return (
    <label htmlFor={id} className={`sa-fsel${isDefault ? "" : " set"}`}>
      {label}
      <select id={id} value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

// ── CSS (interface v2) ─────────────────────────────────────────────────────────
const CSS = `
  .sa-root { font-family:var(--font-ui); color:var(--v2-fg); display:flex; flex-direction:column; gap:20px; font-size:14px; }
  .sa-root * { box-sizing:border-box; }
  .sa-root ::-webkit-scrollbar { width:6px; height:6px; }
  .sa-root ::-webkit-scrollbar-thumb { background:var(--v2-line-strong); border-radius:3px; }
  .sa-root :focus-visible { outline:2px solid var(--v2-accent); outline-offset:2px; }
  .sa-mono { font-family:var(--font-data); font-size:12.5px; }
  .sa-dim { color:var(--v2-fg-3); }

  .sa-ph { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  .sa-ph-title { font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.2; margin:0; }
  .sa-ph-sub { margin:4px 0 0; font-size:13px; color:var(--v2-fg-3); }
  .sa-src { display:flex; gap:14px; flex-wrap:wrap; margin-top:8px; font-size:12.5px; color:var(--v2-fg-2); }
  .sa-src span { display:inline-flex; align-items:center; gap:6px; }
  .sa-src i { width:7px; height:7px; border-radius:50%; background:var(--c); }
  .sa-actions { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
  .sa-btn { display:inline-flex; align-items:center; gap:7px; height:34px; padding:0 14px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; font-family:var(--font-ui); white-space:nowrap; border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-fg); }
  .sa-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .sa-btn:hover:not(:disabled) { background:var(--v2-hover); }
  .sa-btn.sm { height:30px; padding:0 10px; }
  .sa-btn.danger { color:var(--v2-crit); }
  .sa-menu { display:flex; flex-direction:column; }
  .sa-menu button { display:flex; align-items:center; gap:8px; padding:7px 8px; border:0; border-radius:5px; background:none; color:var(--v2-fg); font:13px var(--font-ui); cursor:pointer; text-align:left; }
  .sa-menu button:hover { background:var(--v2-hover); }
  .sa-callout { display:flex; gap:10px; align-items:flex-start; padding:10px 14px; border-radius:10px; font-size:13px; line-height:1.5; color:var(--v2-fg-2); background:color-mix(in oklch, var(--c) 10%, transparent); border:1px solid color-mix(in oklch, var(--c) 35%, transparent); }
  .sa-callout > svg { color:var(--c); flex-shrink:0; margin-top:2px; }
  .sa-callout a { color:var(--v2-accent); text-decoration:underline; }

  .sa-fbar { display:flex; flex-wrap:wrap; gap:8px; align-items:center; padding:10px 12px; border:1px solid var(--v2-line); border-radius:12px; background:var(--v2-surface); }
  .sa-fsel { display:inline-flex; align-items:center; gap:6px; height:32px; padding:0 0 0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); font-size:13px; color:var(--v2-fg-3); }
  .sa-fsel select { height:30px; border:0; background:transparent; color:var(--v2-fg); font:500 13px var(--font-ui); padding-right:6px; max-width:170px; outline:none; cursor:pointer; }
  .sa-fsel.set { border-color:color-mix(in oklch, var(--v2-accent) 55%, transparent); }
  .sa-search { display:inline-flex; align-items:center; gap:8px; height:32px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg-3); flex:1 1 180px; min-width:160px; }
  .sa-search input { flex:1; min-width:0; border:0; outline:none; background:transparent; color:var(--v2-fg); font-size:13px; font-family:inherit; }

  .sa-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
  .sa-kpi { position:relative; text-align:left; border:0; background:transparent; padding:16px 18px 14px; display:grid; gap:2px; align-content:start; box-shadow:1px 0 0 var(--v2-line), 0 1px 0 var(--v2-line); color:inherit; font-family:inherit; min-width:0; }
  button.sa-kpi { cursor:pointer; }
  button.sa-kpi:hover { background:var(--v2-hover); }
  .sa-kpi-label { font-size:12.5px; color:var(--v2-fg-2); display:flex; align-items:center; gap:6px; }
  .sa-kpi-value { font-size:28px; font-weight:600; letter-spacing:-0.02em; line-height:1.25; font-variant-numeric:tabular-nums; }
  .sa-kpi-foot { font-size:12px; color:var(--v2-fg-3); }
  .sa-sw { width:8px; height:8px; border-radius:2px; display:inline-block; flex-shrink:0; }

  .sa-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:20px; align-items:stretch; }
  .sa-span-2 { grid-column:span 2; }
  @media (max-width: 1100px) { .sa-grid { grid-template-columns:minmax(0, 1fr); } .sa-span-2 { grid-column:auto; } }
  .sa-panel { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; min-width:0; }
  .sa-panel-hdr { padding:14px 18px 4px; }
  .sa-panel-title { font-size:14px; font-weight:600; margin:0; }
  .sa-panel-sub { margin:2px 0 0; font-size:12.5px; color:var(--v2-fg-3); }
  .sa-panel-body { padding:12px 18px 16px; }
  .sa-legend { display:flex; flex-wrap:wrap; gap:6px 16px; margin-top:10px; font-size:12.5px; color:var(--v2-fg-2); }
  .sa-legend span { display:inline-flex; align-items:center; gap:6px; }
  .sa-dist h4 { margin:0 0 6px; font-size:12px; font-weight:500; color:var(--v2-fg-3); }
  .sa-dist + .sa-dist { margin-top:16px; }
  .sa-dist-r { display:grid; grid-template-columns:minmax(80px, 130px) minmax(0, 1fr) 32px; gap:10px; align-items:center; padding:3px 0; font-size:12.5px; }
  .sa-dist-r > span:first-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .sa-dist-r .tr { height:8px; border-radius:99px; background:var(--v2-surface-2); overflow:hidden; }
  .sa-dist-r .tr i { display:block; height:100%; border-radius:99px; }
  .sa-dist-r .v { font:500 12.5px var(--font-data); text-align:right; }

  .sa-tabs { display:flex; gap:2px; padding:4px 12px 0; border-bottom:1px solid var(--v2-line); overflow-x:auto; }
  .sa-tabs button { display:inline-flex; align-items:center; gap:7px; padding:10px 10px 9px; border:0; border-bottom:2px solid transparent; background:none; color:var(--v2-fg-3); font:500 13px var(--font-ui); cursor:pointer; white-space:nowrap; }
  .sa-tabs button:hover { color:var(--v2-fg); }
  .sa-tabs button[aria-selected="true"] { color:var(--v2-fg); border-bottom-color:var(--v2-accent); }
  .sa-tabs .n { font:500 11.5px var(--font-data); padding:1px 7px; border-radius:99px; background:var(--v2-surface-2); color:var(--v2-fg-2); }
  .sa-tbar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding:10px 18px; border-bottom:1px solid var(--v2-line); }
  .sa-seg { display:inline-flex; padding:3px; gap:2px; background:var(--v2-bg); border:1px solid var(--v2-line); border-radius:8px; flex-wrap:wrap; }
  .sa-seg button { border:0; background:transparent; padding:4px 12px; border-radius:5px; font-size:13px; color:var(--v2-fg-2); cursor:pointer; font-family:inherit; }
  .sa-seg button[aria-pressed="true"] { background:var(--v2-surface-2); color:var(--v2-fg); font-weight:500; box-shadow:inset 0 0 0 1px var(--v2-line); }

  .sa-scroll { overflow:auto; max-height:600px; }
  .sa-table { width:100%; border-collapse:collapse; font-size:13px; }
  .sa-table thead { position:sticky; top:0; z-index:1; }
  .sa-table th { padding:9px 12px; font-size:12px; font-weight:500; color:var(--v2-fg-3); text-align:left; background:var(--v2-surface); border-bottom:1px solid var(--v2-line); white-space:nowrap; }
  .sa-table th.r, .sa-table td.r { text-align:right; }
  .sa-table td { padding:8px 12px; height:48px; border-bottom:1px solid var(--v2-line); vertical-align:middle; white-space:nowrap; }
  .sa-table th:first-child, .sa-table td:first-child { padding-left:18px; }
  .sa-table th:last-child, .sa-table td:last-child { padding-right:18px; }
  .sa-table tbody tr:hover td { background:var(--v2-hover); }
  .sa-table tbody tr.click { cursor:pointer; }
  .sa-table tbody tr.sel td { background:color-mix(in oklch, var(--v2-accent) 10%, transparent); }
  .sa-table tbody tr:last-child td { border-bottom:none; }
  .sa-table td.nm b { display:block; font-weight:500; }
  .sa-table td.nm small { display:block; font:400 12px var(--font-data); color:var(--v2-fg-3); max-width:320px; overflow:hidden; text-overflow:ellipsis; }
  .sa-table a { color:var(--v2-accent); }
  .sa-foot { display:flex; flex-wrap:wrap; justify-content:space-between; align-items:center; gap:8px; padding:10px 18px; border-top:1px solid var(--v2-line); font-size:12.5px; color:var(--v2-fg-3); }
  .sa-empty { padding:40px 16px; text-align:center; color:var(--v2-fg-3); font-size:13px; }

  .sa-pill, .sa-sev { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; white-space:nowrap; background:color-mix(in oklch, var(--c) 14%, transparent); color:color-mix(in oklch, var(--c) 72%, var(--v2-fg)); }
  .sa-pill::before { content:""; width:6px; height:6px; border-radius:50%; background:var(--c); }
  .sa-tag { display:inline-flex; align-items:center; height:22px; padding:0 7px; border-radius:5px; background:var(--v2-surface-2); border:1px solid var(--v2-line); font:400 11.5px var(--font-data); color:var(--v2-fg-2); white-space:nowrap; }
`;

export function SastDashboard() {
  const accessFn = useServerFn(getSastAccess);
  const findingsFn = useServerFn(listSastFindings);
  const runsFn = useServerFn(listSastScanRuns);
  const statusFn = useServerFn(getSastSyncStatus);

  const access = useQuery({ queryKey: ["sast-access"], queryFn: () => accessFn() });
  const findingsQ = useQuery({
    queryKey: ["sast-findings"],
    queryFn: () => findingsFn(),
    refetchInterval: 60_000,
  });
  const runsQ = useQuery({
    queryKey: ["sast-runs"],
    queryFn: () => runsFn(),
    refetchInterval: 60_000,
  });
  const syncStatusQ = useQuery({
    queryKey: ["sast-sync-status"],
    queryFn: () => statusFn(),
    refetchInterval: 60_000,
  });

  const [filters, setFilters] = React.useState<Filters>(DEFAULT_FILTERS);
  const [tab, setTab] = React.useState<"achados" | "execucoes" | "autores">("achados");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const setF = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    setFilters((f) => ({ ...f, [k]: v }));

  const allFindings = React.useMemo(
    () => (findingsQ.data?.findings ?? []) as SastFinding[],
    [findingsQ.data],
  );
  const allRuns = React.useMemo(() => (runsQ.data?.runs ?? []) as SastRun[], [runsQ.data]);

  // Em homolog o evento chega com o Build Service como autor (commit
  // sintético do espelhamento GitHub -> ADO). Autor real = o primeiro humano
  // visto no mesmo fingerprint em qualquer branch do repo (normalmente a main).
  const introducedByFingerprint = React.useMemo(() => {
    const m = new Map<string, { name: string; email: string | null }>();
    for (const f of allFindings) {
      if (f.introduced_by)
        m.set(`${f.repository}|${f.fingerprint}`, {
          name: f.introduced_by,
          email: f.introduced_by_email,
        });
    }
    return m;
  }, [allFindings]);
  const authorOf = React.useCallback(
    (f: SastFinding) => {
      if (f.introduced_by)
        return { name: f.introduced_by, email: f.introduced_by_email, inferred: false };
      const other = introducedByFingerprint.get(`${f.repository}|${f.fingerprint}`);
      if (other) return { ...other, inferred: true };
      return { name: f.last_author ?? "—", email: f.last_author_email, inferred: false };
    },
    [introducedByFingerprint],
  );

  const scopeMatch = React.useCallback(
    (x: { project: string; repository: string; environment: Env; tool: string }) =>
      (filters.project === ALL || x.project === filters.project) &&
      (filters.repo === ALL || x.repository === filters.repo) &&
      (filters.env === ALL || x.environment === filters.env) &&
      (filters.tool === ALL || x.tool === filters.tool),
    [filters.project, filters.repo, filters.env, filters.tool],
  );

  // Tudo que casa com os filtros MENOS o de status -- base dos KPIs/gráficos.
  const inScope = React.useMemo(() => {
    const since = Date.now() - filters.days * DAY;
    const q = filters.q.trim().toLowerCase();
    return allFindings.filter((f) => {
      if (!scopeMatch(f)) return false;
      if (filters.rule !== ALL && f.rule_id !== filters.rule) return false;
      if (new Date(f.last_seen_at).getTime() < since) return false;
      if (q) {
        const a = authorOf(f);
        const hay = [
          f.file_path,
          f.rule_id,
          f.repository,
          f.last_commit_sha,
          a.name,
          a.email,
          f.last_author,
        ]
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [allFindings, filters.days, filters.rule, filters.q, scopeMatch, authorOf]);

  const visible = React.useMemo(() => {
    const rows = inScope.filter((f) =>
      filters.status === "ativos"
        ? f.status === "aberto"
        : filters.status === ALL
          ? true
          : f.status === filters.status,
    );
    return rows.sort(
      (a, b) =>
        sevOf(a.severity).rank - sevOf(b.severity).rank ||
        new Date(b.last_seen_at).getTime() - new Date(a.last_seen_at).getTime(),
    );
  }, [inScope, filters.status]);

  // ── Cobertura: última execução por escopo + escopos que só têm achado ──
  const coverage = React.useMemo(() => {
    const m = new Map<
      string,
      {
        tool: string;
        project: string;
        repository: string;
        branch: string;
        environment: Env;
        last: string;
        buildId: string | null;
        buildUrl: string | null;
        count: number | null;
        runs30: number;
        hasCompleted: boolean;
      }
    >();
    const since30 = Date.now() - 30 * DAY;
    for (const r of allRuns) {
      const k = scopeKey(r);
      const cur = m.get(k);
      if (!cur) {
        m.set(k, {
          tool: r.tool,
          project: r.project,
          repository: r.repository,
          branch: r.branch,
          environment: r.environment,
          last: r.scanned_at,
          buildId: r.build_id,
          buildUrl: r.build_url,
          count: r.findings_count,
          runs30: 0,
          hasCompleted: true,
        });
      }
      if (new Date(r.scanned_at).getTime() >= since30) m.get(k)!.runs30++;
    }
    // Escopo que só tem achado (template ainda sem ScanCompleted): "último
    // scan" = último vazamento visto, count = abertos do escopo.
    const withRuns = new Set(m.keys());
    for (const f of allFindings) {
      const k = scopeKey(f);
      if (withRuns.has(k)) continue;
      const cur = m.get(k);
      if (!cur) {
        m.set(k, {
          tool: f.tool,
          project: f.project,
          repository: f.repository,
          branch: f.branch,
          environment: f.environment,
          last: f.last_seen_at,
          buildId: f.last_build_id,
          buildUrl: f.last_build_url,
          count: f.status === "aberto" ? 1 : 0,
          runs30: 0,
          hasCompleted: false,
        });
        continue;
      }
      if (f.status === "aberto") cur.count = (cur.count ?? 0) + 1;
      if (f.last_seen_at > cur.last) {
        cur.last = f.last_seen_at;
        cur.buildId = f.last_build_id;
        cur.buildUrl = f.last_build_url;
      }
    }
    return [...m.values()]
      .filter((c) => scopeMatch(c))
      .sort((a, b) => new Date(b.last).getTime() - new Date(a.last).getTime());
  }, [allRuns, allFindings, scopeMatch]);

  const authors = React.useMemo(() => {
    const m = new Map<
      string,
      {
        name: string;
        email: string | null;
        open: number;
        crit: number;
        total: number;
        repos: Set<string>;
        last: string;
      }
    >();
    for (const f of inScope) {
      const a = authorOf(f);
      if (isBuildService(a.name, a.email)) continue;
      const k = a.email || a.name;
      if (!m.has(k))
        m.set(k, {
          name: a.name,
          email: a.email,
          open: 0,
          crit: 0,
          total: 0,
          repos: new Set(),
          last: f.last_seen_at,
        });
      const row = m.get(k)!;
      row.total++;
      if (f.status === "aberto") {
        row.open++;
        if (f.severity === "critica") row.crit++;
      }
      row.repos.add(f.repository);
      if (f.last_seen_at > row.last) row.last = f.last_seen_at;
    }
    return [...m.values()].sort((a, b) => b.open - a.open || b.total - a.total);
  }, [inScope, authorOf]);

  // ── KPIs ──
  const kpis = React.useMemo(() => {
    const open = inScope.filter((f) => f.status === "aberto");
    const resolved = inScope.filter((f) => f.status === "resolvido" && f.resolved_at);
    const mttrDays = resolved.length
      ? resolved.reduce(
          (s, f) => s + (new Date(f.resolved_at!).getTime() - new Date(f.first_seen_at).getTime()),
          0,
        ) /
        resolved.length /
        DAY
      : null;
    return {
      open: open.length,
      newLast7: open.filter((f) => Date.now() - new Date(f.first_seen_at).getTime() <= 7 * DAY)
        .length,
      critProd: open.filter((f) => f.environment === "producao" && f.severity === "critica").length,
      repos: new Set(open.map((f) => `${f.project}/${f.repository}`)).size,
      projects: new Set(inScope.map((f) => f.project)).size,
      resolved: resolved.length,
      mttr: mttrDays === null ? "–" : mttrDays.toFixed(1),
      stale: coverage.filter((c) => Date.now() - new Date(c.last).getTime() > 7 * DAY).length,
    };
  }, [inScope, coverage]);

  // ── Série diária (até 90 pontos) ──
  const series = React.useMemo(() => {
    const n = Math.min(filters.days, 90);
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    const t0 = start.getTime() - (n - 1) * DAY;
    const buckets = Array.from({ length: n }, (_, i) => ({
      date: new Date(t0 + i * DAY).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
      }),
      novos: 0,
      resolvidos: 0,
      abertos: 0,
    }));
    const idx = (iso: string) => Math.floor((new Date(iso).getTime() - t0) / DAY);
    let openAtStart = 0;
    for (const f of inScope) {
      if (f.status === "falso_positivo") continue;
      const i = idx(f.first_seen_at);
      if (i >= 0 && i < n) buckets[i].novos++;
      else if (i < 0 && (!f.resolved_at || idx(f.resolved_at) >= 0)) openAtStart++;
      if (f.resolved_at) {
        const j = idx(f.resolved_at);
        if (j >= 0 && j < n) buckets[j].resolvidos++;
      }
    }
    let acc = openAtStart;
    for (const b of buckets) {
      acc += b.novos - b.resolvidos;
      b.abertos = Math.max(acc, 0);
    }
    return buckets;
  }, [inScope, filters.days]);

  const distribution = React.useMemo(() => {
    const open = inScope.filter((f) => f.status === "aberto");
    const group = (key: (f: SastFinding) => string) => {
      const m = new Map<string, number>();
      for (const f of open) m.set(key(f), (m.get(key(f)) ?? 0) + 1);
      return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    };
    return {
      category: group((f) => CATEGORY_LABEL[f.category] ?? f.category),
      severity: group((f) => sevOf(f.severity).label),
      repo: group((f) => f.repository),
    };
  }, [inScope]);

  const uniq = (xs: string[]) => [...new Set(xs)].sort((a, b) => a.localeCompare(b));
  const opt = (xs: string[], allLabel: string) => [
    { value: ALL, label: allLabel },
    ...xs.map((x) => ({ value: x, label: x })),
  ];

  const selected = React.useMemo(
    () => allFindings.find((f) => f.id === selectedId) ?? null,
    [allFindings, selectedId],
  );

  function exportRows() {
    return visible.map((f) => {
      const a = authorOf(f);
      return {
        Severidade: sevOf(f.severity).label,
        Status: STATUS[f.status].label,
        "Fechado automaticamente": f.resolution_source === "auto" ? "sim" : "",
        Ferramenta: f.tool,
        Categoria: CATEGORY_LABEL[f.category] ?? f.category,
        Projeto: f.project,
        Repositório: f.repository,
        Branch: f.branch,
        Ambiente: ENV[f.environment].label,
        Regra: f.rule_id,
        Arquivo: f.file_path ?? "",
        Linha: f.line ?? "",
        "Introduzido por": a.name,
        "E-mail": a.email ?? "",
        "Autor inferido": a.inferred ? "sim" : "",
        "1ª detecção": fmtDateTime(f.first_seen_at),
        "Última detecção": fmtDateTime(f.last_seen_at),
        Ocorrências: f.occurrences,
        "Último commit": f.last_commit_sha ?? "",
        "Link do código": f.last_file_url ?? "",
        "Link da build": f.last_build_url ?? "",
        Justificativa: f.triage_note ?? "",
        "Triado por": f.triaged_by_name ?? "",
      };
    });
  }
  const fname = `sast-achados-${new Date().toISOString().slice(0, 10)}`;
  function exportCsv() {
    const rows = exportRows();
    if (!rows.length) return toast.error("Nada pra exportar com esses filtros.");
    const headers = Object.keys(rows[0]);
    const esc = (v: unknown) => {
      const s = String(v ?? "");
      return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const csv = [
      headers.join(";"),
      ...rows.map((r) => headers.map((h) => esc((r as any)[h])).join(";")),
    ].join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${fname}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("Exportação concluída");
  }
  function exportXlsx() {
    const rows = exportRows();
    if (!rows.length) return toast.error("Nada pra exportar com esses filtros.");
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Achados");
    XLSX.utils.book_append_sheet(
      wb,
      XLSX.utils.json_to_sheet(
        coverage.map((c) => ({
          Ferramenta: c.tool,
          Projeto: c.project,
          Repositório: c.repository,
          Branch: c.branch,
          "Último scan": fmtDateTime(c.last),
          "Achados no último": c.count ?? "",
          "Scans (30d)": c.runs30,
          Build: c.buildUrl ?? c.buildId ?? "",
          "Fechamento automático": c.hasCompleted ? "Ativo" : "Sem ScanCompleted",
        })),
      ),
      "Cobertura",
    );
    XLSX.writeFile(wb, `${fname}.xlsx`);
    toast.success("Exportação concluída");
  }

  const st = syncStatusQ.data;
  const loading = findingsQ.isLoading || runsQ.isLoading;
  if (loading) return <ModuleLoading />;

  const ingestState = !st
    ? { c: "var(--v2-fg-3)", t: "Carregando status…" }
    : !st.ingest.enabled
      ? { c: "var(--v2-fg-3)", t: "Pipeline direta · desligada" }
      : st.ingest.lastReceivedAt
        ? {
            c: "var(--v2-ok)",
            t: `Pipeline direta · último envio ${relTime(st.ingest.lastReceivedAt)}`,
          }
        : { c: "var(--v2-med)", t: "Pipeline direta · aguardando o primeiro envio" };
  const aiState = !st
    ? { c: "var(--v2-fg-3)", t: "Carregando status…" }
    : !st.configured
      ? { c: "var(--v2-fg-3)", t: "App Insights · não configurado" }
      : !st.enabled
        ? { c: "var(--v2-fg-3)", t: "App Insights · desativado" }
        : {
            c: st.cron?.lastOk === false ? "var(--v2-crit)" : "var(--v2-ok)",
            t: st.lastSyncAt
              ? `App Insights · sincronizado ${relTime(st.lastSyncAt)}`
              : "App Insights · nunca sincronizado",
          };
  const goFindings = (patch: Partial<Filters>) => {
    setFilters((f) => ({ ...f, ...patch }));
    setTab("achados");
  };

  return (
    <div className="sa-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Cabeçalho ────────────────────────────────────────────────────── */}
      <div className="sa-ph">
        <div>
          <h1 className="sa-ph-title">SAST</h1>
          <p className="sa-ph-sub">
            Segredos, código, dependências e RLS vindos das esteiras de CI/CD (Azure DevOps e Gitea)
          </p>
          {/* Duas origens convivem: envio direto da pipeline + sync do App Insights */}
          <div className="sa-src">
            <span
              style={{ "--c": ingestState.c } as React.CSSProperties}
              title="Origem: envio direto das pipelines (Azure DevOps ou Gitea) para /api/public/hooks/sast-ingest"
            >
              <i />
              {ingestState.t}
            </span>
            <span
              style={{ "--c": aiState.c } as React.CSSProperties}
              title="Origem: App Insights devops-clarity-hub-insights"
            >
              <i />
              {aiState.t}
            </span>
          </div>
        </div>
        <SyncActions moduleSlug="sast" jobs={["sast-sync"]}>
          <div className="sa-actions">
            <Popover>
              <PopoverTrigger asChild>
                <button className="sa-btn" title="Exportar achados filtrados">
                  <Download size={14} /> Exportar
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-auto min-w-[170px] p-1.5"
                style={{
                  background: "var(--v2-surface)",
                  borderColor: "var(--v2-line-strong)",
                  color: "var(--v2-fg)",
                }}
              >
                <div className="sa-menu">
                  <button onClick={exportCsv}>
                    <Download size={13} /> CSV (.csv)
                  </button>
                  <button onClick={exportXlsx}>
                    <Download size={13} /> Excel (.xlsx)
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </SyncActions>
      </div>

      {st && !st.ingest.enabled && !(st.configured && st.enabled) && (
        <div className="sa-callout" style={{ "--c": "var(--v2-med)" } as React.CSSProperties}>
          <AlertTriangle size={15} />
          <div>
            Nenhuma origem de dados está ativa. Em{" "}
            <Link to="/app/$module" params={{ module: "integracoes" }}>
              Integração API
            </Link>
            , card <b>SAST</b>: ligue a aba <b>Azure DevOps</b> ou <b>Gitea</b> pra receber os
            relatórios direto das esteiras (recomendado) e/ou configure a aba <b>App Insights</b>{" "}
            com o cron job <span className="sa-mono">sast-sync</span> pra ler o que já está no App
            Insights.
          </div>
        </div>
      )}
      {st?.cron?.lastOk === false && st.cron.lastError && (
        <div className="sa-callout" style={{ "--c": "var(--v2-crit)" } as React.CSSProperties}>
          <AlertTriangle size={15} />
          <div>
            Última sincronização falhou ({fmtDateTime(st.cron.lastAttemptAt)}):{" "}
            <span className="sa-mono">{st.cron.lastError}</span>
          </div>
        </div>
      )}

      {/* ── Filtros ── */}
      <div className="sa-fbar">
        <FilterSelect
          id="sast-f-days"
          label="Período"
          value={String(filters.days)}
          isDefault={filters.days === DEFAULT_FILTERS.days}
          onChange={(v) => setF("days", Number(v))}
          options={[
            { value: "7", label: "7 dias" },
            { value: "30", label: "30 dias" },
            { value: "90", label: "90 dias" },
            { value: "3650", label: "Tudo" },
          ]}
        />
        <FilterSelect
          id="sast-f-project"
          label="Projeto"
          value={filters.project}
          isDefault={filters.project === ALL}
          onChange={(v) => setF("project", v)}
          options={opt(uniq(allFindings.map((f) => f.project)), "Todos")}
        />
        <FilterSelect
          id="sast-f-repo"
          label="Repositório"
          value={filters.repo}
          isDefault={filters.repo === ALL}
          onChange={(v) => setF("repo", v)}
          options={opt(
            uniq(
              allFindings
                .filter((f) => filters.project === ALL || f.project === filters.project)
                .map((f) => f.repository),
            ),
            "Todos",
          )}
        />
        <FilterSelect
          id="sast-f-env"
          label="Ambiente"
          value={filters.env}
          isDefault={filters.env === ALL}
          onChange={(v) => setF("env", v)}
          options={[
            { value: ALL, label: "Todos" },
            ...(Object.keys(ENV) as Env[]).map((e) => ({ value: e, label: ENV[e].label })),
          ]}
        />
        <FilterSelect
          id="sast-f-tool"
          label="Ferramenta"
          value={filters.tool}
          isDefault={filters.tool === ALL}
          onChange={(v) => setF("tool", v)}
          options={opt(uniq(allFindings.map((f) => f.tool)), "Todas")}
        />
        <FilterSelect
          id="sast-f-rule"
          label="Tipo / regra"
          value={filters.rule}
          isDefault={filters.rule === ALL}
          onChange={(v) => setF("rule", v)}
          options={opt(uniq(allFindings.map((f) => f.rule_id)), "Todas")}
        />
        <label className="sa-search">
          <Search size={14} />
          <input
            id="sast-f-q"
            value={filters.q}
            onChange={(e) => setF("q", e.target.value)}
            placeholder="Arquivo, autor, commit…"
            aria-label="Buscar achados"
          />
        </label>
      </div>

      {/* ── KPIs ── */}
      <div className="sa-kpis">
        <button type="button" className="sa-kpi" onClick={() => goFindings({ status: "ativos" })}>
          <span className="sa-kpi-label">Achados abertos</span>
          <span className="sa-kpi-value">{kpis.open}</span>
          <span className="sa-kpi-foot">+{kpis.newLast7} novos em 7 dias</span>
        </button>
        <button
          type="button"
          className="sa-kpi"
          onClick={() => goFindings({ status: "ativos", env: "producao" })}
        >
          <span className="sa-kpi-label">
            {kpis.critProd > 0 && (
              <span className="sa-sw" style={{ background: "var(--v2-crit)" }} />
            )}
            Críticos em produção
          </span>
          <span className="sa-kpi-value">{kpis.critProd}</span>
          <span className="sa-kpi-foot">segredos e críticos na main</span>
        </button>
        <div className="sa-kpi">
          <span className="sa-kpi-label">Repositórios afetados</span>
          <span className="sa-kpi-value">{kpis.repos}</span>
          <span className="sa-kpi-foot">{kpis.projects} projetos no filtro</span>
        </div>
        <button
          type="button"
          className="sa-kpi"
          onClick={() => goFindings({ status: "resolvido" })}
        >
          <span className="sa-kpi-label">
            <span className="sa-sw" style={{ background: "var(--v2-ok)" }} />
            Resolvidos no período
          </span>
          <span className="sa-kpi-value">{kpis.resolved}</span>
          <span className="sa-kpi-foot">tempo médio de correção {kpis.mttr} d</span>
        </button>
        <button type="button" className="sa-kpi" onClick={() => setTab("execucoes")}>
          <span className="sa-kpi-label">
            {kpis.stale > 0 && <span className="sa-sw" style={{ background: "var(--v2-med)" }} />}
            Repos sem scan há 7+ dias
          </span>
          <span className="sa-kpi-value">{kpis.stale}</span>
          <span className="sa-kpi-foot">ver Execuções e cobertura</span>
        </button>
      </div>

      {/* ── Gráficos ── */}
      <div className="sa-grid">
        <div className="sa-panel sa-span-2">
          <div className="sa-panel-hdr">
            <h2 className="sa-panel-title">Evolução dos achados</h2>
            <p className="sa-panel-sub">Novos e resolvidos por dia, com o total em aberto</p>
          </div>
          <div className="sa-panel-body">
            <div style={{ height: 290 }}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={series} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                  <CartesianGrid stroke="var(--v2-line)" strokeDasharray="3 4" vertical={false} />
                  <XAxis
                    dataKey="date"
                    stroke="var(--v2-line)"
                    fontSize={11}
                    tickLine={false}
                    minTickGap={20}
                    tick={{ fill: "var(--v2-fg-3)", fontFamily: "var(--font-data)" }}
                  />
                  <YAxis
                    stroke="var(--v2-line)"
                    fontSize={11}
                    tickLine={false}
                    axisLine={false}
                    allowDecimals={false}
                    tick={{ fill: "var(--v2-fg-3)", fontFamily: "var(--font-data)" }}
                  />
                  <Tooltip
                    contentStyle={{
                      background: "var(--v2-surface)",
                      border: "1px solid var(--v2-line-strong)",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "var(--v2-fg)",
                    }}
                    labelStyle={{ color: "var(--v2-fg)", fontWeight: 600 }}
                    cursor={{ fill: "var(--v2-hover)" }}
                  />
                  <Area
                    type="monotone"
                    dataKey="abertos"
                    name="Em aberto"
                    stroke="none"
                    fill="var(--v2-accent)"
                    fillOpacity={0.08}
                  />
                  <Bar
                    dataKey="novos"
                    name="Novos"
                    fill="var(--v2-crit)"
                    radius={[2, 2, 0, 0]}
                    maxBarSize={10}
                  />
                  <Bar
                    dataKey="resolvidos"
                    name="Resolvidos"
                    fill="var(--v2-ok)"
                    radius={[2, 2, 0, 0]}
                    maxBarSize={10}
                  />
                  <Line
                    type="monotone"
                    dataKey="abertos"
                    name="Em aberto (acumulado)"
                    stroke="var(--v2-accent)"
                    strokeWidth={2}
                    dot={false}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
            <div className="sa-legend">
              <span>
                <span className="sa-sw" style={{ background: "var(--v2-crit)" }} /> Novos
              </span>
              <span>
                <span className="sa-sw" style={{ background: "var(--v2-ok)" }} /> Resolvidos
              </span>
              <span>
                <span
                  style={{
                    width: 12,
                    height: 2,
                    background: "var(--v2-accent)",
                    display: "inline-block",
                  }}
                />{" "}
                Em aberto (acumulado)
              </span>
            </div>
          </div>
        </div>
        <div className="sa-panel">
          <div className="sa-panel-hdr">
            <h2 className="sa-panel-title">Distribuição dos abertos</h2>
            <p className="sa-panel-sub">Por categoria, severidade e repositório</p>
          </div>
          <div className="sa-panel-body">
            {(
              [
                ["Categoria", distribution.category, false],
                ["Severidade", distribution.severity, true],
                ["Repositório", distribution.repo, false],
              ] as const
            ).map(([label, rows, bySev]) => {
              const max = Math.max(1, ...rows.map((r) => r[1]));
              return (
                <div key={label} className="sa-dist">
                  <h4>{label}</h4>
                  {rows.length === 0 ? (
                    <div className="sa-dim" style={{ fontSize: 12.5 }}>
                      Nada aberto no filtro atual.
                    </div>
                  ) : (
                    rows.map(([k, v]) => (
                      <div key={k} className="sa-dist-r">
                        <span title={k}>{k}</span>
                        <span className="tr">
                          <i
                            style={{
                              width: `${(v / max) * 100}%`,
                              background: bySev
                                ? (Object.values(SEV).find((s) => s.label === k)?.color ??
                                  "var(--v2-accent)")
                                : "var(--v2-accent)",
                            }}
                          />
                        </span>
                        <span className="v">{v}</span>
                      </div>
                    ))
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── Abas ── */}
      <div className="sa-panel">
        <div className="sa-tabs" role="tablist">
          {(
            [
              ["achados", "Achados", visible.length],
              ["execucoes", "Execuções e cobertura", coverage.length],
              ["autores", "Por autor", authors.length],
            ] as const
          ).map(([key, label, count]) => (
            <button key={key} role="tab" aria-selected={tab === key} onClick={() => setTab(key)}>
              {label}
              <span className="n">{count}</span>
            </button>
          ))}
        </div>

        {tab === "achados" ? (
          <>
            <div className="sa-tbar">
              <div className="sa-seg" role="group" aria-label="Status">
                {(
                  [
                    ["ativos", "Abertos"],
                    ["resolvido", "Resolvidos"],
                    ["risco_aceito", "Risco aceito"],
                    ["falso_positivo", "Falso positivo"],
                    [ALL, "Todos"],
                  ] as const
                ).map(([k, l]) => (
                  <button
                    key={k}
                    type="button"
                    aria-pressed={filters.status === k}
                    onClick={() => setF("status", k)}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <span className="sa-dim" style={{ fontSize: 12.5, marginLeft: "auto" }}>
                Ordenado por severidade e última detecção
              </span>
            </div>
            <FindingsTable
              rows={visible}
              authorOf={authorOf}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </>
        ) : tab === "execucoes" ? (
          <CoverageTable rows={coverage} />
        ) : (
          <AuthorsTable rows={authors} />
        )}
      </div>

      <FindingSheet
        finding={selected}
        author={selected ? authorOf(selected) : null}
        canEdit={!!access.data?.canEdit}
        onOpenChange={(v) => !v && setSelectedId(null)}
      />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Tabelas
// ══════════════════════════════════════════════════════════════════════════════
const TH = "";
const TD = "";

function FindingsTable({
  rows,
  authorOf,
  selectedId,
  onSelect,
}: {
  rows: SastFinding[];
  authorOf: (f: SastFinding) => { name: string; email: string | null; inferred: boolean };
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  const PAGE = 200;
  const [limit, setLimit] = React.useState(PAGE);
  React.useEffect(() => setLimit(PAGE), [rows]);
  if (!rows.length) return <div className="sa-empty">Nenhum achado com esses filtros.</div>;
  return (
    <>
      <div className="sa-scroll">
        <table className="sa-table">
          <thead>
            <tr>
              {[
                "Severidade",
                "Status",
                "Ferramenta",
                "Repositório",
                "Ambiente",
                "Tipo / regra",
                "Arquivo",
                "Introduzido por",
                "1ª detecção",
                "Última",
                "Ocorr.",
              ].map((h) => (
                <th key={h} className={h === "Ocorr." ? "r" : undefined}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, limit).map((f) => {
              const a = authorOf(f);
              return (
                <tr
                  key={f.id}
                  tabIndex={0}
                  onClick={() => onSelect(f.id)}
                  onKeyDown={(e) => e.key === "Enter" && onSelect(f.id)}
                  className={`click${selectedId === f.id ? " sel" : ""}`}
                >
                  <td>
                    <SevBadge severity={f.severity} />
                  </td>
                  <td>
                    <Badge tone={STATUS[f.status].tone}>{STATUS[f.status].label}</Badge>
                    {f.resolution_source === "auto" && (
                      <span className="sa-dim sa-mono" style={{ marginLeft: 6, fontSize: 11.5 }}>
                        auto
                      </span>
                    )}
                  </td>
                  <td>
                    <span className="sa-tag">{f.tool}</span>
                  </td>
                  <td>
                    <span style={{ fontWeight: 500 }}>{f.repository}</span>{" "}
                    <span className="sa-mono sa-dim">{f.branch}</span>
                  </td>
                  <td>
                    <Badge tone={ENV[f.environment].tone}>{ENV[f.environment].label}</Badge>
                  </td>
                  <td>
                    <div className="sa-mono">{f.rule_id}</div>
                    {f.title && f.title !== f.rule_id && (
                      <div
                        className="sa-dim"
                        style={{
                          fontSize: 11.5,
                          maxWidth: 320,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={f.title}
                      >
                        {f.title}
                      </div>
                    )}
                  </td>
                  <td
                    className="sa-mono sa-dim"
                    style={{ maxWidth: 280, overflow: "hidden", textOverflow: "ellipsis" }}
                    title={f.file_path ?? ""}
                  >
                    {f.file_path ?? "—"}
                    {f.line ? `:${f.line}` : ""}
                  </td>
                  <td>
                    {a.name}
                    {a.inferred && (
                      <span
                        style={{ marginLeft: 6, fontSize: 11.5, color: "var(--v2-med)" }}
                        title="Evento veio do Build Service; autor inferido pelo mesmo fingerprint em outra branch"
                      >
                        inferido
                      </span>
                    )}
                  </td>
                  <td className="sa-mono">{fmtDateTime(f.first_seen_at)}</td>
                  <td className="sa-mono">{relTime(f.last_seen_at)}</td>
                  <td className="r sa-mono">{f.occurrences}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="sa-foot">
        <span>
          {Math.min(limit, rows.length)} de {rows.length} achado(s) · clique numa linha pra ver
          detalhe e triar
        </span>
        {rows.length > limit && (
          <button className="sa-btn sm" onClick={() => setLimit((l) => l + PAGE)}>
            Mostrar mais
          </button>
        )}
      </div>
    </>
  );
}

function CoverageTable({
  rows,
}: {
  rows: Array<{
    tool: string;
    project: string;
    repository: string;
    branch: string;
    last: string;
    buildId: string | null;
    buildUrl: string | null;
    count: number | null;
    runs30: number;
    hasCompleted: boolean;
  }>;
}) {
  if (!rows.length) return <div className="sa-empty">Nenhuma execução registrada ainda.</div>;
  return (
    <>
      <div className="sa-scroll">
        <table className="sa-table">
          <thead>
            <tr>
              {[
                "Cobertura",
                "Ferramenta",
                "Projeto",
                "Repositório",
                "Branch",
                "Último scan",
                "Achados no último",
                "Scans (30d)",
                "Build",
                "Fechamento automático",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const days = (Date.now() - new Date(r.last).getTime()) / DAY;
              return (
                <tr key={scopeKey(r)} className="border-b border-border/60">
                  <td>
                    {days > 30 ? (
                      <Badge tone="danger">Parado &gt; 30d</Badge>
                    ) : days > 7 ? (
                      <Badge tone="warning">Sem scan &gt; 7d</Badge>
                    ) : (
                      <Badge tone="success">Em dia</Badge>
                    )}
                  </td>
                  <td className="sa-mono sa-dim">{r.tool}</td>
                  <td>{r.project}</td>
                  <td style={{ fontWeight: 500 }}>{r.repository}</td>
                  <td className="sa-mono">{r.branch}</td>
                  <td className="sa-mono">
                    {fmtDateTime(r.last)} <span className="sa-dim">({relTime(r.last)})</span>
                  </td>
                  <td className="r sa-mono">{r.count ?? "—"}</td>
                  <td className="r sa-mono">{r.runs30}</td>
                  <td className="sa-mono">
                    {r.buildUrl ? (
                      <a href={r.buildUrl} target="_blank" rel="noopener noreferrer">
                        #{r.buildId ?? "build"}
                      </a>
                    ) : (
                      (r.buildId ?? "—")
                    )}
                  </td>
                  <td>
                    {r.hasCompleted ? (
                      <Badge tone="success">Ativo</Badge>
                    ) : (
                      <Badge tone="warning">Sem ScanCompleted</Badge>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="sa-foot">
        <b>Sem ScanCompleted</b>: a esteira só manda evento quando encontra algo, então os achados
        desse repositório não fecham sozinhos e a data do último scan é só a do último vazamento
        visto.
      </div>
    </>
  );
}

function AuthorsTable({
  rows,
}: {
  rows: Array<{
    name: string;
    email: string | null;
    open: number;
    crit: number;
    total: number;
    repos: Set<string>;
    last: string;
  }>;
}) {
  if (!rows.length) return <div className="sa-empty">Nenhum autor no filtro atual.</div>;
  return (
    <>
      <div className="sa-scroll">
        <table className="sa-table">
          <thead>
            <tr>
              {[
                "Autor",
                "E-mail",
                "Abertos",
                "Críticos abertos",
                "Total no período",
                "Repositórios",
                "Última detecção",
              ].map((h) => (
                <th key={h}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.email || a.name} className="border-b border-border/60">
                <td style={{ fontWeight: 500 }}>{a.name}</td>
                <td className="sa-mono sa-dim">{a.email || "—"}</td>
                <td className="r sa-mono">{a.open}</td>
                <td
                  className="r sa-mono"
                  style={a.crit ? { color: "var(--v2-crit)", fontWeight: 600 } : undefined}
                >
                  {a.crit}
                </td>
                <td className="r sa-mono">{a.total}</td>
                <td>{[...a.repos].join(", ")}</td>
                <td className="sa-mono">{relTime(a.last)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="sa-foot">
        Agrupado por quem introduziu o achado (primeiro autor humano visto), sem o Build Service.
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Sheet de detalhe + triagem
// ══════════════════════════════════════════════════════════════════════════════
const SHEET_MIN_WIDTH = 420;
const SHEET_MAX_WIDTH = 1000;

function FindingSheet({
  finding,
  author,
  canEdit,
  onOpenChange,
}: {
  finding: SastFinding | null;
  author: { name: string; email: string | null; inferred: boolean } | null;
  canEdit: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const eventsFn = useServerFn(listSastFindingEvents);
  const triageFn = useServerFn(setSastFindingStatus);

  // Mantém o último achado enquanto o Sheet anima a saída.
  const [last, setLast] = React.useState<{ f: SastFinding; a: typeof author } | null>(null);
  React.useEffect(() => {
    if (finding) setLast({ f: finding, a: author });
  }, [finding, author]);
  const [note, setNote] = React.useState("");
  React.useEffect(() => setNote(""), [finding?.id]);

  const [width, setWidth] = React.useState<number | null>(null);
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev: MouseEvent) => {
      const next = window.innerWidth - ev.clientX;
      setWidth(Math.min(SHEET_MAX_WIDTH, window.innerWidth - 80, Math.max(SHEET_MIN_WIDTH, next)));
    };
    const onUp = () => {
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  const events = useQuery({
    queryKey: ["sast-finding-events", finding?.id],
    queryFn: () => eventsFn({ data: { findingId: finding!.id } }),
    enabled: !!finding,
  });

  const triage = useMutation({
    mutationFn: (status: Status) =>
      triageFn({ data: { findingId: finding!.id, status, note: note.trim() || null } }),
    onSuccess: (_r, status) => {
      toast.success(
        status === "aberto"
          ? "Achado reaberto."
          : `Status alterado para ${STATUS[status].label}. Registrado no log de auditoria.`,
      );
      setNote("");
      qc.invalidateQueries({ queryKey: ["sast-findings"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const f = finding ?? last?.f;
  const a = finding ? author : last?.a;
  if (!f) return null;
  const needsNote = note.trim().length < 5;

  return (
    <Sheet open={!!finding} onOpenChange={onOpenChange}>
      <SheetContent
        className="font-ui w-full sm:max-w-xl overflow-y-auto border-v2-line bg-v2-surface text-v2-fg"
        style={width ? { width, maxWidth: "none" } : undefined}
      >
        <div
          onMouseDown={handleResizeStart}
          className="absolute left-0 top-0 hidden h-full w-1.5 cursor-col-resize transition-colors hover:bg-v2-accent/30 active:bg-v2-accent/40 sm:block"
        />
        <SheetHeader className="space-y-1 pr-8">
          <div className="flex flex-wrap gap-1.5">
            <Badge tone={STATUS[f.status].tone}>{STATUS[f.status].label}</Badge>
            <Badge tone={ENV[f.environment].tone}>{ENV[f.environment].label}</Badge>
            <span className="sa-tag">{f.tool}</span>
          </div>
          <SheetTitle className="font-data text-[15px] font-semibold text-v2-fg break-all">
            {f.rule_id}
          </SheetTitle>
          {f.title && f.title !== f.rule_id && (
            <div className="text-[13px] text-v2-fg-2">{f.title}</div>
          )}
          <div className="text-[12.5px] text-v2-fg-3">
            {f.project} · {f.repository} · {f.branch}
          </div>
        </SheetHeader>

        <div className="mt-5 flex flex-col gap-5 text-sm">
          {f.category === "secret" && f.status === "aberto" && (
            <div className="sa-callout" style={{ "--c": "var(--v2-med)" } as React.CSSProperties}>
              <b>Remover o arquivo do repositório não basta.</b> O segredo continua no histórico do
              Git: rotacione a credencial na origem e depois marque como resolvido.
            </div>
          )}
          {f.category === "dependency" &&
            f.status === "aberto" &&
            typeof f.details?.fixed_version === "string" && (
              <div className="sa-callout" style={{ "--c": "var(--v2-med)" } as React.CSSProperties}>
                <b>Correção disponível:</b> atualize{" "}
                <span className="font-data">{String(f.details?.package ?? "o pacote")}</span> para a
                versão <span className="font-data">{f.details.fixed_version}</span> ou superior. O
                achado fecha sozinho no próximo scan da esteira.
              </div>
            )}
          {a?.inferred && (
            <div className="sa-callout" style={{ "--c": "var(--v2-med)" } as React.CSSProperties}>
              O último evento veio do <span className="font-data">Build Service</span> (commit
              sintético do espelhamento). O autor abaixo foi inferido pelo mesmo fingerprint visto
              em outra branch do repositório.
            </div>
          )}

          <dl className="grid grid-cols-[130px_1fr] gap-x-3 gap-y-2.5 text-[13px]">
            <dt className="text-v2-fg-3">Severidade</dt>
            <dd>
              <SevBadge severity={f.severity} />
              {f.category === "secret" && (
                <span className="ml-1.5 text-v2-fg-3">(segredo = crítico por padrão)</span>
              )}
            </dd>
            <dt className="text-v2-fg-3">Categoria</dt>
            <dd>{CATEGORY_LABEL[f.category] ?? f.category}</dd>
            <dt className="text-v2-fg-3">Arquivo</dt>
            <dd className="font-data text-[11.5px] break-all">
              {f.last_file_url ? (
                <a href={f.last_file_url} target="_blank" rel="noopener noreferrer">
                  {f.file_path ?? "—"}
                  {f.line ? `:${f.line}` : ""}
                </a>
              ) : (
                <>
                  {f.file_path ?? "—"}
                  {f.line ? `:${f.line}` : ""}
                </>
              )}
            </dd>
            <FindingDetails details={f.details} />
            <dt className="text-v2-fg-3">Fingerprint</dt>
            <dd className="font-data text-[11px] text-v2-fg-3 break-all">{f.fingerprint}</dd>
            <dt className="text-v2-fg-3">Introduzido por</dt>
            <dd>
              {a?.name ?? "—"}
              {a?.email && <div className="font-data text-[11px] text-v2-fg-3">{a.email}</div>}
            </dd>
            <dt className="text-v2-fg-3">Último commit</dt>
            <dd className="font-data text-[11px] break-all">{f.last_commit_sha ?? "—"}</dd>
            <dt className="text-v2-fg-3">1ª detecção</dt>
            <dd className="font-data tabular-nums">{fmtDateTime(f.first_seen_at)}</dd>
            <dt className="text-v2-fg-3">Última detecção</dt>
            <dd className="font-data tabular-nums">
              {fmtDateTime(f.last_seen_at)} · {f.occurrences} ocorrência(s)
            </dd>
          </dl>

          {/* Triagem */}
          <div className="flex flex-col gap-2.5 rounded-md border border-v2-line bg-v2-bg p-3">
            <div className="text-xs font-semibold uppercase tracking-[0.06em] text-v2-fg-3">
              Triagem
            </div>
            {f.status !== "aberto" && (
              <div className="text-xs">
                <Badge tone={STATUS[f.status].tone}>{STATUS[f.status].label}</Badge>{" "}
                {f.resolution_source === "auto" ? (
                  <span className="text-v2-fg-3">
                    fechado automaticamente: não apareceu no scan de {fmtDateTime(f.resolved_at)}
                  </span>
                ) : (
                  <span className="text-v2-fg-3">
                    por {f.triaged_by_name ?? "—"} em {fmtDateTime(f.triaged_at)}
                  </span>
                )}
                {f.triage_note && <div className="mt-1.5 leading-relaxed">“{f.triage_note}”</div>}
              </div>
            )}
            {canEdit ? (
              f.status === "aberto" ? (
                <>
                  <label htmlFor="sast-triage-note" className="text-xs text-v2-fg-3">
                    Justificativa (obrigatória, vai pro log de auditoria e dispara alerta)
                  </label>
                  <Textarea
                    id="sast-triage-note"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Ex.: chave rotacionada no Key Vault em 28/09, commit de remoção pendente"
                    className="min-h-16 text-xs"
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={needsNote || triage.isPending}
                      onClick={() => triage.mutate("resolvido")}
                    >
                      Marcar resolvido
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={needsNote || triage.isPending}
                      onClick={() => triage.mutate("falso_positivo")}
                    >
                      Falso positivo
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-v2-crit border-v2-crit/40"
                      disabled={needsNote || triage.isPending}
                      onClick={() => triage.mutate("risco_aceito")}
                    >
                      Aceitar risco
                    </Button>
                  </div>
                  <div className="text-[11.5px] leading-relaxed text-v2-fg-3">
                    Resolver não esconde o achado: se ele aparecer de novo num scan posterior, volta
                    pra Aberto. Falso positivo e risco aceito ficam até alguém reabrir.
                  </div>
                </>
              ) : (
                <div>
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={triage.isPending}
                    onClick={() => triage.mutate("aberto")}
                  >
                    Reabrir
                  </Button>
                </div>
              )
            ) : (
              f.status === "aberto" && (
                <div className="text-xs text-v2-fg-3">Sem permissão de triagem neste módulo.</div>
              )
            )}
          </div>

          {/* Histórico */}
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.06em] text-v2-fg-3 mb-2.5">
              Histórico de detecções
            </div>
            {events.isLoading ? (
              <div className="flex items-center gap-2 text-xs text-v2-fg-3">
                <Loader2 className="size-3.5 animate-spin" /> Carregando…
              </div>
            ) : (
              <div className="ml-1 flex flex-col border-l border-v2-line">
                {f.resolution_source === "auto" && f.resolved_at && (
                  <div className="relative pb-3 pl-4 text-xs">
                    <span className="absolute -left-1 top-1.5 size-2 rounded-full bg-v2-ok" />
                    <div className="font-data text-[11px] text-v2-fg-3">
                      {fmtDateTime(f.resolved_at)}
                    </div>
                    Não apareceu no scan seguinte da esteira · fechado automaticamente
                  </div>
                )}
                {((events.data?.events ?? []) as any[]).map((ev) => (
                  <div key={ev.id} className="relative pb-3 pl-4 text-xs">
                    <span className="absolute -left-1 top-1.5 size-2 rounded-full bg-v2-accent" />
                    <div className="font-data text-[11px] text-v2-fg-3">
                      {fmtDateTime(ev.detected_at)}
                    </div>
                    Detectado na build{" "}
                    {ev.build_url ? (
                      <a
                        href={ev.build_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-data text-v2-accent hover:underline"
                      >
                        #{ev.build_id ?? "build"}
                      </a>
                    ) : (
                      <span className="font-data">#{ev.build_id ?? "—"}</span>
                    )}{" "}
                    · {ev.author ?? "—"}
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="text-[11.5px] text-v2-fg-3">
            O valor do segredo nunca é armazenado no {APP_NAME}. Só metadados: regra, arquivo,
            linha, commit e autor.
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
