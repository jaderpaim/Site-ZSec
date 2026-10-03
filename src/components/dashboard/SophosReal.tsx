import { SyncActions } from "@/components/layout/SyncActions";
import { ModuleLoading } from "@/components/layout/ModuleLoading";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from "recharts";
import {
  getSophosCore,
  getSophosPolicies,
  getSophosDetections,
  getSophosNotProtected,
  getSophosAuditEvents,
  getSophosThreatsByUser,
  getSophosTopUsers,
  syncSophosData,
  syncSophosAuditData,
  type SophosCore,
} from "@/lib/sophos.functions";
import { AlertTriangle, ArrowUpDown, ArrowDown, ArrowUp, Search, RefreshCw, X } from "lucide-react";
import { useFilters } from "@/lib/filters-context";
import { DetailList, DetailSection, DetailSheet } from "@/components/layout/DetailSheet";
import { toast } from "sonner";

// ── Paleta dos tipos de evento ────────────────────────────────────────────────
// Paleta categórica validada (skill de visualização): distinguível para
// daltônicos e separada das cores de status. A cor segue o tipo pela posição
// na lista (do mais frequente ao menos), e o nome/número fica sempre escrito.
const CAT_COLORS = [
  "var(--sp-cat-1)",
  "var(--sp-cat-2)",
  "var(--sp-cat-3)",
  "var(--sp-cat-4)",
  "var(--sp-cat-5)",
  "var(--sp-cat-6)",
];

// ── CSS (interface v2) ─────────────────────────────────────────────────────────
const CSS = `
  :root { --sp-cat-1:#3987e5; --sp-cat-2:#d95926; --sp-cat-3:#199e70; --sp-cat-4:#c98500; --sp-cat-5:#d55181; --sp-cat-6:#9085e9; }
  :root[data-theme="light"] { --sp-cat-1:#2a78d6; --sp-cat-2:#eb6834; --sp-cat-3:#1baf7a; --sp-cat-4:#eda100; --sp-cat-5:#e87ba4; --sp-cat-6:#4a3aa7; }

  .sp-root { font-family:var(--font-ui); color:var(--v2-fg); display:flex; flex-direction:column; gap:20px; font-size:14px; }
  .sp-root * { box-sizing:border-box; }
  @keyframes sp-spin { to{transform:rotate(360deg)} }
  .sp-spin { animation:sp-spin 0.8s linear infinite; }
  @media (prefers-reduced-motion: reduce) { .sp-spin { animation:none; } }
  .sp-root ::-webkit-scrollbar { width:6px; height:6px; }
  .sp-root ::-webkit-scrollbar-track { background:transparent; }
  .sp-root ::-webkit-scrollbar-thumb { background:var(--v2-line-strong); border-radius:3px; }
  .sp-root :focus-visible { outline:2px solid var(--v2-accent); outline-offset:2px; }
  .sp-root .mono { font-family:var(--font-data); font-size:12.5px; }
  .sp-root .dim { color:var(--v2-fg-3); }
  .sp-root .recharts-cartesian-axis-tick-value { fill:var(--v2-fg-3) !important; font-size:11px; font-family:var(--font-data); }

  /* ── Cabeçalho ── */
  .sp-ph { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  .sp-ph-title { font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.2; margin:0; }
  .sp-ph-sub { margin:4px 0 0; font-size:13px; color:var(--v2-fg-3); display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  .sp-live { display:inline-flex; align-items:center; gap:6px; }
  .sp-live::before { content:""; width:7px; height:7px; border-radius:50%; background:var(--v2-ok); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-ok) 25%, transparent); }
  .sp-btn { display:inline-flex; align-items:center; gap:7px; height:34px; padding:0 14px; border-radius:8px; border:1px solid var(--v2-accent); background:var(--v2-accent); color:var(--v2-accent-ink); font-size:13px; font-weight:500; cursor:pointer; font-family:inherit; }
  .sp-btn:hover:not(:disabled) { filter:brightness(1.08); }
  .sp-btn:disabled { opacity:0.5; cursor:not-allowed; }
  .sp-btn.ghost { background:transparent; border-color:transparent; color:var(--v2-fg-2); }
  .sp-btn.ghost:hover:not(:disabled) { background:var(--v2-hover); color:var(--v2-fg); filter:none; }
  .sp-btn.sm { height:28px; padding:0 10px; font-size:12.5px; }

  /* ── Estados ── */
  .sp-state { display:flex; flex-direction:column; align-items:center; gap:10px; padding:48px 24px; text-align:center; background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; }
  .sp-empty { padding:28px 16px; text-align:center; color:var(--v2-fg-3); font-size:13px; }

  /* ── Submenu ── */
  .sp-subnav { display:flex; gap:2px; padding:4px; background:var(--v2-surface-2); border:1px solid var(--v2-line); border-radius:8px; width:fit-content; max-width:100%; flex-wrap:wrap; }
  .sp-subnav button { display:inline-flex; align-items:center; gap:8px; border:1px solid transparent; background:transparent; padding:6px 14px; border-radius:6px; font-size:13px; font-weight:500; color:var(--v2-fg-3); cursor:pointer; font-family:inherit; }
  .sp-subnav button:hover { color:var(--v2-fg); background:var(--v2-hover); }
  .sp-subnav button[aria-selected="true"] { background:var(--v2-surface); color:var(--v2-fg); border-color:var(--v2-line); }

  /* ── KPIs ── */
  .sp-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
  .sp-kpi { position:relative; text-align:left; border:0; background:transparent; padding:16px 18px 14px; display:grid; gap:2px; align-content:start; box-shadow:1px 0 0 var(--v2-line), 0 1px 0 var(--v2-line); color:inherit; font-family:inherit; min-width:0; }
  button.sp-kpi { cursor:pointer; }
  button.sp-kpi:hover { background:var(--v2-hover); }
  .sp-kpi-label { font-size:12.5px; color:var(--v2-fg-2); display:flex; align-items:center; gap:6px; }
  .sp-kpi-value { font-size:28px; font-weight:600; letter-spacing:-0.02em; line-height:1.25; font-variant-numeric:tabular-nums; }
  .sp-kpi-foot { font-size:12px; color:var(--v2-fg-3); }
  .sp-sw { width:8px; height:8px; border-radius:2px; display:inline-block; flex-shrink:0; }
  .sp-meter { height:6px; border-radius:99px; background:var(--v2-surface-2); overflow:hidden; margin:6px 0 2px; }
  .sp-meter i { display:block; height:100%; border-radius:99px; }

  /* ── Grade e cartões ── */
  .sp-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:20px; align-items:start; }
  .sp-span-2 { grid-column:span 2; }
  .sp-col { display:grid; gap:20px; align-content:start; min-width:0; }
  @media (max-width: 1100px) { .sp-grid { grid-template-columns:minmax(0, 1fr); } .sp-span-2 { grid-column:auto; } }
  .sp-card { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; min-width:0; overflow:hidden; }
  .sp-card-hdr { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap; padding:14px 18px 4px; }
  .sp-card-title { font-size:14px; font-weight:600; margin:0; }
  .sp-card-sub { margin:2px 0 0; font-size:12.5px; color:var(--v2-fg-3); }
  .sp-card-body { padding:10px 18px 16px; }
  .sp-legend { display:flex; gap:14px; flex-wrap:wrap; font-size:12px; color:var(--v2-fg-2); }
  .sp-legend span { display:inline-flex; align-items:center; gap:6px; }
  .sp-toolbar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:12px 18px; border-bottom:1px solid var(--v2-line); }
  .sp-toolbar b { font-size:14px; font-weight:600; }
  .sp-toolbar small { font-size:13px; color:var(--v2-fg-3); }
  .sp-search { display:inline-flex; align-items:center; gap:8px; height:32px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg-3); width:260px; max-width:100%; }
  .sp-search:focus-within { border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }
  .sp-search input { flex:1; min-width:0; border:0; outline:none; background:transparent; color:var(--v2-fg); font-size:13px; font-family:inherit; }
  .sp-search input::placeholder { color:var(--v2-fg-3); }
  .sp-chip { display:inline-flex; align-items:center; gap:6px; height:28px; padding:0 8px 0 10px; border-radius:99px; border:0; background:color-mix(in oklch, var(--v2-accent) 14%, transparent); color:var(--v2-fg); font-size:12.5px; cursor:pointer; font-family:inherit; }
  .sp-chip svg { color:var(--v2-fg-3); }
  .sp-seg { display:inline-flex; padding:3px; gap:2px; background:var(--v2-bg); border:1px solid var(--v2-line); border-radius:8px; }
  .sp-seg button { display:inline-flex; align-items:center; gap:6px; border:0; background:transparent; padding:4px 12px; border-radius:5px; font-size:13px; color:var(--v2-fg-2); cursor:pointer; font-family:inherit; }
  .sp-seg button[aria-pressed="true"] { background:var(--v2-surface-2); color:var(--v2-fg); font-weight:500; box-shadow:inset 0 0 0 1px var(--v2-line); }

  /* ── Tabelas ── */
  .sp-scroll { overflow:auto; }
  .sp-table { width:100%; border-collapse:collapse; font-size:13px; }
  .sp-table thead { position:sticky; top:0; z-index:1; }
  .sp-table th { padding:9px 12px; font-size:12px; font-weight:500; color:var(--v2-fg-3); text-align:left; background:var(--v2-surface); border-bottom:1px solid var(--v2-line); white-space:nowrap; user-select:none; }
  .sp-table th.sortable { cursor:pointer; }
  .sp-table th.sortable:hover { color:var(--v2-fg); }
  .sp-table th.r, .sp-table td.r { text-align:right; }
  .sp-table td { padding:8px 12px; height:44px; border-bottom:1px solid var(--v2-line); vertical-align:middle; }
  .sp-table th:first-child, .sp-table td:first-child { padding-left:18px; }
  .sp-table th:last-child, .sp-table td:last-child { padding-right:18px; }
  .sp-table tbody tr:hover td { background:var(--v2-hover); }
  .sp-table tbody tr:last-child td { border-bottom:none; }
  .sp-table tbody tr.clickable { cursor:pointer; }
  .sp-trunc { display:block; max-width:300px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

  /* ── Pílulas ── */
  .sp-tag { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; white-space:nowrap; --c:var(--v2-fg-3); background:color-mix(in oklch, var(--c) 14%, transparent); color:color-mix(in oklch, var(--c) 72%, var(--v2-fg)); }
  .sp-tag.crit { --c:var(--v2-crit); } .sp-tag.med { --c:var(--v2-med); } .sp-tag.low { --c:var(--v2-low); } .sp-tag.ok { --c:var(--v2-ok); }

  /* ── Barras clicáveis / tipos ── */
  .sp-bars { display:grid; gap:4px; }
  .sp-bars button { display:grid; grid-template-columns:minmax(0, 1fr) auto; gap:5px 10px; align-items:center; padding:7px 8px; margin:0 -8px; border:0; border-radius:8px; background:transparent; text-align:left; color:var(--v2-fg); font-size:13px; cursor:pointer; font-family:inherit; }
  .sp-bars button:hover { background:var(--v2-hover); }
  .sp-bars button[aria-pressed="true"] { background:color-mix(in oklch, var(--v2-accent) 14%, transparent); }
  .sp-bars span:first-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .sp-bars .n { font:500 12.5px var(--font-data); color:var(--v2-fg-2); }
  .sp-track { grid-column:1 / -1; height:8px; border-radius:99px; background:var(--v2-surface-2); overflow:hidden; }
  .sp-track i { display:block; height:100%; border-radius:99px; background:var(--v2-accent); }
  .sp-cat-tot { display:flex; align-items:baseline; gap:8px; margin-bottom:10px; }
  .sp-cat-tot b { font-size:28px; font-weight:600; letter-spacing:-0.02em; font-variant-numeric:tabular-nums; }
  .sp-cat-tot span { font-size:12.5px; color:var(--v2-fg-3); }
  .sp-cat-stack { display:flex; height:12px; border-radius:99px; overflow:hidden; gap:2px; margin-bottom:14px; }
  .sp-cat-stack i { display:block; height:100%; }
  .sp-cat-list { display:grid; gap:2px; }
  .sp-cat-list button { display:grid; grid-template-columns:10px minmax(0, 1fr) auto auto; gap:10px; align-items:center; padding:7px 8px; margin:0 -8px; border:0; border-radius:8px; background:transparent; text-align:left; color:var(--v2-fg); font-size:13px; cursor:pointer; font-family:inherit; }
  .sp-cat-list button:hover { background:var(--v2-hover); }
  .sp-cat-list button[aria-pressed="true"] { background:color-mix(in oklch, var(--v2-accent) 14%, transparent); }
  .sp-cat-list.filtering button[aria-pressed="false"] { opacity:.5; }
  .sp-cat-list .sw { width:10px; height:10px; border-radius:3px; }
  .sp-cat-list span:nth-child(2) { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .sp-cat-list .n { font:500 12.5px var(--font-data); text-align:right; }
  .sp-cat-list .p { font:400 12px var(--font-data); color:var(--v2-fg-3); text-align:right; min-width:44px; }

  /* ── Cobertura de ativos ── */
  .sp-dev-legend { display:grid; gap:6px; }
  .sp-dev-legend div { display:grid; grid-template-columns:auto minmax(0, 1fr) auto; gap:8px; align-items:center; font-size:13px; }
  .sp-dev-legend .n { font:500 12.5px var(--font-data); color:var(--v2-fg-2); }
  .sp-dev-card { display:grid; gap:8px; }
  .sp-dev-row { display:flex; justify-content:space-between; align-items:baseline; gap:10px; font-size:13px; }
  .sp-dev-row b { font-size:22px; font-weight:600; font-variant-numeric:tabular-nums; }
  .sp-stack { display:flex; height:10px; border-radius:99px; overflow:hidden; background:var(--v2-surface-2); }
  .sp-stack i { display:block; height:100%; }
  .sp-enc-cat { display:grid; gap:8px; }
  .sp-enc-cat h4 { margin:0; font-size:13px; font-weight:600; }
  .sp-enc-pair { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  .sp-enc-tile { display:grid; gap:2px; padding:10px 12px; border-radius:8px; border:1px solid var(--v2-line); background:var(--v2-surface-2); }
  .sp-enc-tile span { font-size:12px; color:var(--v2-fg-2); display:inline-flex; align-items:center; gap:6px; }
  .sp-enc-tile b { font-size:20px; font-weight:600; font-variant-numeric:tabular-nums; line-height:1.2; }
  .sp-enc-tile small { font:400 12px var(--font-data); color:var(--v2-fg-3); }
  .sp-enc-line { display:flex; justify-content:space-between; align-items:center; gap:10px; flex-wrap:wrap; padding:10px 0 0; border-top:1px solid var(--v2-line); font-size:13px; }
  .sp-enc-line > span { color:var(--v2-fg-2); }
  .sp-enc-line b { font:600 13px var(--font-data); }

  /* ── Tooltip do gráfico ── */
  .sp-tip { display:grid; gap:2px; padding:8px 10px; background:var(--v2-surface-2); border:1px solid var(--v2-line-strong); border-radius:8px; font-size:12px; box-shadow:0 12px 32px rgba(0,0,0,0.3); }
  .sp-tip span { color:var(--v2-fg-2); font-family:var(--font-data); }
`;

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("pt-BR");
}

function fmtTime(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function fmtRel(iso: string | null): string {
  if (!iso) return "nunca";
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} ${d === 1 ? "dia" : "dias"}`;
}

const pct = (a: number, total: number) => (total > 0 ? Math.round((a / total) * 100) : 0);

const SEV_LABEL: Record<string, [string, string]> = {
  high: ["Alta", "crit"],
  critical: ["Crítica", "crit"],
  medium: ["Média", "med"],
  low: ["Baixa", "low"],
};
function SevTag({ severity }: { severity: string }) {
  const [label, cls] = SEV_LABEL[(severity ?? "").toLowerCase()] ?? [severity || "—", "low"];
  return <span className={`sp-tag ${cls}`}>{label}</span>;
}

type SortKey = "ts" | "host" | "user" | "type" | "threat" | "action";
type PolSortKey = "name" | "assigned_count";
type SophosView = "geral" | "ameacas" | "cobertura" | "politicas" | "auditoria";
const SOPHOS_VIEWS: SophosView[] = ["geral", "ameacas", "cobertura", "politicas", "auditoria"];

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active)
    return <ArrowUpDown size={12} style={{ display: "inline", marginLeft: 4, opacity: 0.4 }} />;
  return dir === "asc" ? (
    <ArrowUp size={12} style={{ display: "inline", marginLeft: 4, color: "var(--v2-accent)" }} />
  ) : (
    <ArrowDown size={12} style={{ display: "inline", marginLeft: 4, color: "var(--v2-accent)" }} />
  );
}

function EvoTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  label?: string;
  payload?: Array<{ dataKey: string; value: number }>;
}) {
  if (!active || !payload?.length) return null;
  const get = (k: string) => payload.find((p) => p.dataKey === k)?.value ?? 0;
  return (
    <div className="sp-tip">
      <b>{label}</b>
      <span>Bloqueadas {fmtNum(get("blocked"))}</span>
      <span>Alta severidade {fmtNum(get("detected"))}</span>
    </div>
  );
}

// Status dos dispositivos (mesmas 4 categorias da Sophos Central)
const DEVICE_STATUS: Array<{
  key: "active" | "inactive2w" | "inactive2m" | "notProtected";
  label: string;
  color: string;
}> = [
  { key: "active", label: "Ativo", color: "var(--v2-ok)" },
  { key: "inactive2w", label: "Inativo há 2+ semanas", color: "var(--v2-med)" },
  { key: "inactive2m", label: "Inativo há 2+ meses", color: "var(--v2-high)" },
  { key: "notProtected", label: "Não protegido", color: "var(--v2-crit)" },
];

// ══════════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
export function SophosRealDashboard() {
  // ── Back-end hooks ─────────────────────────────────────────────────────────
  const fetchCore = useServerFn(getSophosCore);
  const fetchPolicies = useServerFn(getSophosPolicies);
  const fetchDetections = useServerFn(getSophosDetections);
  const fetchNotProtected = useServerFn(getSophosNotProtected);
  const fetchAuditEvents = useServerFn(getSophosAuditEvents);
  const fetchUserThreats = useServerFn(getSophosThreatsByUser);
  const fetchTopUsers = useServerFn(getSophosTopUsers);
  const runSync = useServerFn(syncSophosData);
  const runAuditSync = useServerFn(syncSophosAuditData);
  const { dateRange } = useFilters();

  const [syncing, setSyncing] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [sortKey, setSortKey] = React.useState<SortKey>("ts");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");
  const [activeType, setActiveType] = React.useState<string | null>(null);
  const [threatUser, setThreatUser] = React.useState<string | null>(null);
  const [polTab, setPolTab] = React.useState<"endpoint" | "server">("endpoint");
  const [polQuery, setPolQuery] = React.useState("");
  const [polSortKey, setPolSortKey] = React.useState<PolSortKey>("assigned_count");
  const [polSortDir, setPolSortDir] = React.useState<"asc" | "desc">("desc");
  const [auditTypeQuery, setAuditTypeQuery] = React.useState("");
  const [auditUserQuery, setAuditUserQuery] = React.useState("");
  const [npQuery, setNpQuery] = React.useState("");
  const [openDet, setOpenDet] = React.useState<number | null>(null);
  const [view, setView] = React.useState<SophosView>(() => {
    try {
      const v = localStorage.getItem("sophos_view") as SophosView | null;
      return v && SOPHOS_VIEWS.includes(v) ? v : "geral";
    } catch {
      return "geral";
    }
  });
  const go = (v: SophosView) => {
    setView(v);
    try {
      localStorage.setItem("sophos_view", v);
    } catch {
      /* storage indisponível */
    }
  };

  const fromIso = dateRange.from.toISOString();
  const toIso = dateRange.to.toISOString();

  // ── Núcleo rápido (KPIs, evolutivo, tipos, dispositivos, criptografia) —
  // uma única RPC de agregação. É o que controla o carregamento inicial.
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["sophos-core", fromIso, toIso],
    queryFn: () => fetchCore({ data: { from: fromIso, to: toIso } }),
  });

  // ── Blocos pesados — cada um carrega em paralelo, de forma independente.
  const policiesQuery = useQuery({
    queryKey: ["sophos-policies"],
    queryFn: () => fetchPolicies(),
    staleTime: 5 * 60_000,
  });
  const detectionsQuery = useQuery({
    queryKey: ["sophos-detections", fromIso, toIso],
    queryFn: () => fetchDetections({ data: { from: fromIso, to: toIso } }),
  });
  const notProtectedQuery = useQuery({
    queryKey: ["sophos-not-protected"],
    queryFn: () => fetchNotProtected(),
    staleTime: 5 * 60_000,
  });
  const auditQuery = useQuery({
    queryKey: ["sophos-audit-events", fromIso, toIso],
    queryFn: () => fetchAuditEvents({ data: { from: fromIso, to: toIso } }),
  });
  // Drill-down: ameaças do usuário selecionado (só busca quando há um).
  const userThreatsQuery = useQuery({
    queryKey: ["sophos-user-threats", threatUser, fromIso, toIso],
    queryFn: () =>
      fetchUserThreats({ data: { user: threatUser as string, from: fromIso, to: toIso } }),
    enabled: !!threatUser,
  });
  // Top 10 usuários com ameaças — já EXCLUINDO as exceções (RPC dedicada).
  const topUsersQuery = useQuery({
    queryKey: ["sophos-topusers", fromIso, toIso],
    queryFn: () => fetchTopUsers({ data: { from: fromIso, to: toIso } }),
    staleTime: 60_000,
  });

  // Sincronização de auditoria não estar configurada/ativa é um estado
  // esperado (recurso opcional) — não vale poluir com toast de erro.
  const AUDIT_NOT_CONFIGURED_MESSAGES = [
    "Integração Sophos não configurada.",
    "Sincronização de Auditoria da Sophos não está ativa.",
    "Credencial de Audit Log da Sophos não configurada.",
  ];

  const handleSync = async () => {
    setSyncing(true);
    try {
      const [siemResult, auditResult] = await Promise.allSettled([
        runSync({ data: { fullResync: false } }),
        runAuditSync(),
      ]);

      if (siemResult.status === "fulfilled" && siemResult.value.ok) {
        const r = siemResult.value;
        toast.success(
          `SIEM: ${r.counts.endpoints} dispositivos, ${r.counts.events} eventos, ${r.counts.alerts} alertas, ${r.counts.policies} políticas`,
        );
      } else {
        const msg =
          siemResult.status === "fulfilled"
            ? siemResult.value.ok
              ? "Erro desconhecido"
              : siemResult.value.error
            : (siemResult.reason as Error).message;
        toast.error(`SIEM: ${msg}`);
      }

      if (auditResult.status === "fulfilled" && auditResult.value.ok) {
        toast.success(`Auditoria: ${auditResult.value.count} eventos sincronizados`);
      } else {
        const msg =
          auditResult.status === "fulfilled"
            ? auditResult.value.ok
              ? "Erro desconhecido"
              : auditResult.value.error
            : (auditResult.reason as Error).message;
        if (!AUDIT_NOT_CONFIGURED_MESSAGES.includes(msg)) toast.error(`Auditoria: ${msg}`);
      }

      await Promise.all([
        refetch(),
        policiesQuery.refetch(),
        detectionsQuery.refetch(),
        notProtectedQuery.refetch(),
        auditQuery.refetch(),
      ]);
    } finally {
      setSyncing(false);
    }
  };

  const okData = data && data.ok ? (data as SophosCore) : null;
  const detData = detectionsQuery.data && detectionsQuery.data.ok ? detectionsQuery.data : null;
  const polData = policiesQuery.data && policiesQuery.data.ok ? policiesQuery.data : null;
  const npData =
    notProtectedQuery.data && notProtectedQuery.data.ok ? notProtectedQuery.data : null;
  const auditData = auditQuery.data && auditQuery.data.ok ? auditQuery.data : null;

  const filteredDetections = React.useMemo(() => {
    const source = detData?.recentDetections ?? [];
    const q = query.trim().toLowerCase();
    let list = source;
    if (activeType)
      list = list.filter((r) => (r.type ?? "").toLowerCase().includes(activeType.toLowerCase()));
    if (q)
      list = list.filter((r) =>
        [r.ts, r.host, r.user, r.type, r.threat, r.action].some((v) =>
          String(v).toLowerCase().includes(q),
        ),
      );
    const dir = sortDir === "asc" ? 1 : -1;
    list = [...list].sort(
      (a, b) => String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? "")) * dir,
    );
    return list;
  }, [detData, query, sortKey, sortDir, activeType]);

  const filteredAuditEvents = React.useMemo(() => {
    const source = auditData?.auditEvents ?? [];
    const typeQ = auditTypeQuery.trim().toLowerCase();
    const userQ = auditUserQuery.trim().toLowerCase();
    let list = source;
    if (typeQ) list = list.filter((e) => e.description.toLowerCase().includes(typeQ));
    if (userQ) list = list.filter((e) => e.modifiedBy.toLowerCase().includes(userQ));
    return list;
  }, [auditData, auditTypeQuery, auditUserQuery]);

  // ── Carregando ─────────────────────────────────────────────────────────────
  if (isLoading) return <ModuleLoading />;

  // ── Erro ───────────────────────────────────────────────────────────────────
  if (error || (data && !data.ok)) {
    const msg =
      data && !data.ok
        ? (data as { error: string }).error
        : ((error as Error)?.message ?? "Erro desconhecido");
    return (
      <div className="sp-root">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="sp-state">
          <AlertTriangle size={22} color="var(--v2-crit)" />
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            Não foi possível carregar os dados da API Sophos
          </span>
          <span className="mono dim">{msg}</span>
          <button
            className="sp-btn"
            style={{ marginTop: 8 }}
            onClick={handleSync}
            disabled={syncing}
          >
            <RefreshCw size={14} className={syncing ? "sp-spin" : ""} />
            {syncing ? "Sincronizando…" : "Tentar sincronizar agora"}
          </button>
        </div>
      </div>
    );
  }

  // ── Derivados ──────────────────────────────────────────────────────────────
  const d = okData as SophosCore;

  const toggleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(sortDir === "asc" ? "desc" : "asc");
    else {
      setSortKey(k);
      setSortDir("desc");
    }
  };
  const togglePolSort = (k: PolSortKey) => {
    if (polSortKey === k) setPolSortDir(polSortDir === "asc" ? "desc" : "asc");
    else {
      setPolSortKey(k);
      setPolSortDir(k === "name" ? "asc" : "desc");
    }
  };

  const polFiltered = (() => {
    const list = (polData?.policies ?? []).filter((p) => p.policy_type === polTab);
    const q = polQuery.trim().toLowerCase();
    const fil = q ? list.filter((p) => p.name.toLowerCase().includes(q)) : list;
    const dir = polSortDir === "asc" ? 1 : -1;
    return [...fil].sort((a, b) =>
      polSortKey === "assigned_count"
        ? (a.assigned_count - b.assigned_count) * dir
        : a.name.localeCompare(b.name) * dir,
    );
  })();

  const encEndpoints = d.encryption?.endpoints ?? { encrypted: 0, unencrypted: 0, rate: 0 };
  const encServers = d.encryption?.servers ?? { encrypted: 0, unencrypted: 0, rate: 0 };
  const encrypted = d.encryption?.total?.encrypted ?? d.totals.encryptedDevices;
  const unencrypted = d.encryption?.total?.unencrypted ?? d.totals.unencryptedDevices;
  const unencByClass = d.encryption?.unencryptedByDeviceClass ?? { desktop: 0, notebook: 0 };
  const encLicense = d.encryption?.license ?? null;

  const totalDevices = d.endpoints.total + d.servers.total;
  const activeDevices = d.endpoints.active + d.servers.active;
  const notProtected = d.endpoints.notProtected + d.servers.notProtected;
  const protectedPct = totalDevices > 0 ? (activeDevices / totalDevices) * 100 : 0;
  const protectedColor =
    protectedPct >= 95 ? "var(--v2-ok)" : protectedPct >= 90 ? "var(--v2-med)" : "var(--v2-crit)";

  const types = [...(d.detectionTypes ?? [])].sort((a, b) => b.value - a.value);
  const typesTotal = types.reduce((a, t) => a + t.value, 0);
  const pctTxt = (v: number) =>
    typesTotal > 0 ? `${((v / typesTotal) * 100).toFixed(1).replace(".", ",")}%` : "—";

  const topUsers = topUsersQuery.data && topUsersQuery.data.ok ? topUsersQuery.data.users : [];
  const maxUser = topUsers[0]?.count || 1;
  const userDetail =
    userThreatsQuery.data && userThreatsQuery.data.ok ? userThreatsQuery.data : null;

  const npHosts = [
    ...(npData?.notProtectedEndpoints ?? []).map((h) => ({
      hostname: h.hostname,
      kind: "Estação",
    })),
    ...(npData?.notProtectedServers ?? []).map((h) => ({ hostname: h.hostname, kind: "Servidor" })),
  ].filter(
    (h) => !npQuery.trim() || h.hostname.toLowerCase().includes(npQuery.trim().toLowerCase()),
  );

  const det = openDet != null ? filteredDetections[openDet] : null;

  const pickType = (name: string) => {
    setActiveType((cur) => (cur === name ? null : name));
    setThreatUser(null);
    go("ameacas");
  };

  return (
    <div className="sp-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Cabeçalho ───────────────────────────────────────────────────────── */}
      <div className="sp-ph">
        <div>
          <h1 className="sp-ph-title">Sophos XDR</h1>
          <p className="sp-ph-sub">
            <span
              className="sp-live"
              title={d.lastSyncAt ? new Date(d.lastSyncAt).toLocaleString("pt-BR") : undefined}
            >
              Sincronizado {fmtRel(d.lastSyncAt)}
            </span>
            <span>·</span>
            <span>Antivírus e EDR de estações e servidores</span>
          </p>
        </div>
        <SyncActions moduleSlug="sophos-xdr" jobs={["sophos-sync", "sophos-audit-sync"]}>
          <button className="sp-btn" onClick={handleSync} disabled={syncing || isFetching}>
            <RefreshCw size={14} className={syncing ? "sp-spin" : ""} />
            {syncing ? "Sincronizando…" : "Sincronizar"}
          </button>
        </SyncActions>
      </div>

      {/* ── Submenu ─────────────────────────────────────────────────────────── */}
      <div className="sp-subnav" role="tablist" aria-label="Seções do Sophos XDR">
        {(
          [
            ["geral", "Visão geral"],
            ["ameacas", "Ameaças"],
            ["cobertura", "Cobertura de ativos"],
            ["politicas", "Políticas"],
            ["auditoria", "Auditoria"],
          ] as Array<[SophosView, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => go(id)}
          >
            {label}
          </button>
        ))}
      </div>

      {/* ══ VISÃO GERAL ═════════════════════════════════════════════════════ */}
      {view === "geral" && (
        <>
          <div className="sp-kpis">
            <div className="sp-kpi">
              <span className="sp-kpi-label">Dispositivos</span>
              <span className="sp-kpi-value">{fmtNum(totalDevices)}</span>
              <span className="sp-kpi-foot">
                {fmtNum(d.endpoints.total)} estações · {fmtNum(d.servers.total)} servidores
              </span>
            </div>
            <div className="sp-kpi">
              <span className="sp-kpi-label">Protegidos e ativos</span>
              <span className="sp-kpi-value">{protectedPct.toFixed(1).replace(".", ",")}%</span>
              <div className="sp-meter" aria-hidden="true">
                <i style={{ width: `${protectedPct}%`, background: protectedColor }} />
              </div>
              <span className="sp-kpi-foot">{fmtNum(activeDevices)} com o agente comunicando</span>
            </div>
            <button type="button" className="sp-kpi" onClick={() => go("cobertura")}>
              <span className="sp-kpi-label">
                {notProtected > 0 && (
                  <span className="sp-sw" style={{ background: "var(--v2-crit)" }} />
                )}
                Não protegidos
              </span>
              <span className="sp-kpi-value">{fmtNum(notProtected)}</span>
              <span className="sp-kpi-foot">
                {fmtNum(d.endpoints.notProtected)} estações · {fmtNum(d.servers.notProtected)}{" "}
                servidores
              </span>
            </button>
            <button type="button" className="sp-kpi" onClick={() => go("ameacas")}>
              <span className="sp-kpi-label">Ameaças</span>
              <span className="sp-kpi-value">{fmtNum(d.totals.threatsTotal)}</span>
              <span className="sp-kpi-foot">
                {fmtNum(d.totals.threatsEndpoints)} em estações · {fmtNum(d.totals.threatsServers)}{" "}
                em servidores
              </span>
            </button>
            <button type="button" className="sp-kpi" onClick={() => go("ameacas")}>
              <span className="sp-kpi-label">
                {d.totals.alertsRed > 0 && (
                  <span className="sp-sw" style={{ background: "var(--v2-crit)" }} />
                )}
                Alertas
              </span>
              <span className="sp-kpi-value">{fmtNum(d.totals.alertsTotal)}</span>
              <span className="sp-kpi-foot">
                {fmtNum(d.totals.alertsRed)} vermelhos · {fmtNum(d.totals.alertsYellow)} amarelos
              </span>
            </button>
          </div>

          <div className="sp-grid">
            <div className="sp-card sp-span-2">
              <div className="sp-card-hdr">
                <div>
                  <h2 className="sp-card-title">Bloqueadas × alta severidade</h2>
                  <p className="sp-card-sub">Por dia, no período</p>
                </div>
                <div className="sp-legend">
                  <span>
                    <span className="sp-sw" style={{ background: "var(--v2-accent)" }} /> Bloqueadas
                  </span>
                  <span>
                    <span className="sp-sw" style={{ background: "var(--v2-crit)" }} /> Alta
                    severidade
                  </span>
                </div>
              </div>
              <div className="sp-card-body" style={{ height: 270 }}>
                {(d.series ?? []).length === 0 ? (
                  <div className="sp-empty">Sem eventos no período.</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={d.series} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="var(--v2-line)" vertical={false} />
                      <XAxis
                        dataKey="d"
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={44} />
                      <Tooltip
                        cursor={{ stroke: "var(--v2-line-strong)" }}
                        content={<EvoTooltip />}
                      />
                      <Area
                        type="monotone"
                        dataKey="blocked"
                        name="Bloqueadas"
                        stroke="var(--v2-accent)"
                        strokeWidth={2}
                        fill="color-mix(in oklch, var(--v2-accent) 16%, transparent)"
                        dot={false}
                        activeDot={{
                          r: 4,
                          fill: "var(--v2-accent)",
                          stroke: "var(--v2-surface)",
                          strokeWidth: 2,
                        }}
                      />
                      <Area
                        type="monotone"
                        dataKey="detected"
                        name="Alta severidade"
                        stroke="var(--v2-crit)"
                        strokeWidth={2}
                        fill="color-mix(in oklch, var(--v2-crit) 18%, transparent)"
                        dot={false}
                        activeDot={{
                          r: 4,
                          fill: "var(--v2-crit)",
                          stroke: "var(--v2-surface)",
                          strokeWidth: 2,
                        }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="sp-card">
              <div className="sp-card-hdr">
                <div>
                  <h2 className="sp-card-title">Tipos de evento</h2>
                  <p className="sp-card-sub">Clique para filtrar as detecções</p>
                </div>
              </div>
              <div className="sp-card-body">
                {types.length === 0 ? (
                  <div className="sp-empty">Sem eventos no período.</div>
                ) : (
                  <>
                    <div className="sp-cat-tot">
                      <b>{fmtNum(typesTotal)}</b>
                      <span>eventos no período</span>
                    </div>
                    <div
                      className="sp-cat-stack"
                      role="img"
                      aria-label="Composição dos eventos por tipo"
                    >
                      {types.map((t, i) => (
                        <i
                          key={t.name}
                          style={{
                            width: `${(t.value / typesTotal) * 100}%`,
                            background: CAT_COLORS[i % CAT_COLORS.length],
                          }}
                          title={`${t.name}: ${fmtNum(t.value)} · ${pctTxt(t.value)}`}
                        />
                      ))}
                    </div>
                    <div className={`sp-cat-list${activeType ? " filtering" : ""}`}>
                      {types.map((t, i) => (
                        <button
                          key={t.name}
                          type="button"
                          aria-pressed={activeType === t.name}
                          onClick={() => pickType(t.name)}
                          title={`Ver detecções de ${t.name}`}
                        >
                          <span
                            className="sw"
                            style={{ background: CAT_COLORS[i % CAT_COLORS.length] }}
                          />
                          <span>{t.name}</span>
                          <span className="n">{fmtNum(t.value)}</span>
                          <span className="p">{pctTxt(t.value)}</span>
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ══ AMEAÇAS ═════════════════════════════════════════════════════════ */}
      {view === "ameacas" && (
        <div className="sp-grid">
          <div className="sp-card">
            <div className="sp-card-hdr">
              <div>
                <h2 className="sp-card-title">Usuários com mais ameaças</h2>
                <p className="sp-card-sub">Top 10, sem as exceções · clique para ver as ameaças</p>
              </div>
            </div>
            <div className="sp-card-body">
              {topUsersQuery.isLoading ? (
                <div className="sp-empty">Carregando…</div>
              ) : topUsers.length === 0 ? (
                <div className="sp-empty">Nenhum usuário com ameaças no período.</div>
              ) : (
                <div className="sp-bars">
                  {topUsers.map((u) => (
                    <button
                      key={u.user}
                      type="button"
                      aria-pressed={threatUser === u.user}
                      onClick={() => setThreatUser((cur) => (cur === u.user ? null : u.user))}
                      title={`Ver ameaças de ${u.user}`}
                    >
                      <span className="mono">{u.user}</span>
                      <span className="n">{fmtNum(u.count)}</span>
                      <span className="sp-track">
                        <i style={{ width: `${(u.count / maxUser) * 100}%` }} />
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          <div className="sp-card sp-span-2">
            {threatUser ? (
              <>
                <div className="sp-toolbar">
                  <b>Ameaças do usuário</b>
                  <button type="button" className="sp-chip" onClick={() => setThreatUser(null)}>
                    {threatUser} <X size={14} aria-label="Voltar às detecções recentes" />
                  </button>
                  {userDetail && (
                    <small>
                      {fmtNum(userDetail.threats.length)}{" "}
                      {userDetail.threats.length === 1 ? "ameaça" : "ameaças"} mais recentes
                    </small>
                  )}
                </div>
                {userThreatsQuery.isLoading ? (
                  <div className="sp-empty">Carregando…</div>
                ) : !userDetail || userDetail.threats.length === 0 ? (
                  <div className="sp-empty">
                    Nenhuma ameaça encontrada para esse usuário no período.
                  </div>
                ) : (
                  <div className="sp-scroll" style={{ maxHeight: 560 }}>
                    <table className="sp-table">
                      <thead>
                        <tr>
                          <th>Quando</th>
                          <th>Ameaça</th>
                          <th>Tipo</th>
                          <th>Categoria</th>
                          <th>Severidade</th>
                          <th>Dispositivo</th>
                        </tr>
                      </thead>
                      <tbody>
                        {userDetail.threats.map((r, i) => (
                          <tr key={i}>
                            <td className="mono dim">{fmtTime(r.ts)}</td>
                            <td>
                              <span className="sp-trunc" title={r.name}>
                                {r.name}
                              </span>
                            </td>
                            <td className="dim">{r.type}</td>
                            <td className="dim">{r.category}</td>
                            <td>
                              <SevTag severity={r.severity} />
                            </td>
                            <td className="mono">{r.host}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className="sp-toolbar">
                  <b>Detecções recentes</b>
                  <small>{fmtNum(filteredDetections.length)}</small>
                  <label className="sp-search">
                    <Search size={14} />
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Buscar dispositivo, usuário ou ameaça"
                      aria-label="Buscar detecções"
                    />
                  </label>
                  {activeType && (
                    <button type="button" className="sp-chip" onClick={() => setActiveType(null)}>
                      Tipo: {activeType} <X size={14} aria-label="Remover filtro" />
                    </button>
                  )}
                </div>
                {detectionsQuery.isLoading ? (
                  <div className="sp-empty">Carregando…</div>
                ) : filteredDetections.length === 0 ? (
                  <div className="sp-empty">Nenhuma detecção com esses filtros.</div>
                ) : (
                  <div className="sp-scroll" style={{ maxHeight: 560 }}>
                    <table className="sp-table">
                      <thead>
                        <tr>
                          {(
                            [
                              ["ts", "Quando"],
                              ["threat", "Ameaça"],
                              ["type", "Tipo"],
                              ["host", "Dispositivo"],
                              ["action", "Ação"],
                            ] as Array<[SortKey, string]>
                          ).map(([k, label]) => (
                            <th key={k} className="sortable" onClick={() => toggleSort(k)}>
                              {label}
                              <SortIcon active={sortKey === k} dir={sortDir} />
                            </th>
                          ))}
                          <th>Severidade</th>
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDetections.map((r, i) => (
                          <tr
                            key={`${r.ts}-${i}`}
                            className="clickable"
                            tabIndex={0}
                            onClick={() => setOpenDet(i)}
                            onKeyDown={(e) => e.key === "Enter" && setOpenDet(i)}
                          >
                            <td className="mono dim">{fmtTime(r.ts)}</td>
                            <td>
                              <span
                                className="sp-trunc"
                                title={r.threat}
                                style={{ fontWeight: 500 }}
                              >
                                {r.threat}
                              </span>
                              <span className="mono dim" style={{ fontSize: 12 }}>
                                {r.user}
                              </span>
                            </td>
                            <td className="dim">{r.type}</td>
                            <td className="mono">{r.host}</td>
                            <td className="dim">{r.action}</td>
                            <td>
                              <SevTag severity={r.severity} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* ══ COBERTURA DE ATIVOS ═════════════════════════════════════════════ */}
      {view === "cobertura" && (
        <div className="sp-grid">
          <div className="sp-col">
            <div className="sp-card">
              <div className="sp-card-hdr">
                <div>
                  <h2 className="sp-card-title">Status dos dispositivos</h2>
                  <p className="sp-card-sub">Estações e servidores somados</p>
                </div>
              </div>
              <div className="sp-card-body">
                <div className="sp-dev-legend">
                  {DEVICE_STATUS.map((s) => (
                    <div key={s.key}>
                      <span className="sp-sw" style={{ background: s.color }} />
                      <span>{s.label}</span>
                      <span className="n">{fmtNum(d.endpoints[s.key] + d.servers[s.key])}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="sp-card">
              <div className="sp-card-hdr">
                <div>
                  <h2 className="sp-card-title">Criptografia dos dispositivos</h2>
                  <p className="sp-card-sub">Criptografia de disco reportada pelo agente</p>
                </div>
              </div>
              <div className="sp-card-body" style={{ display: "grid", gap: 18 }}>
                {(
                  [
                    ["Estações", encEndpoints],
                    ["Servidores", encServers],
                  ] as Array<[string, { encrypted: number; unencrypted: number; rate: number }]>
                ).map(([label, dd]) => {
                  const tot = dd.encrypted + dd.unencrypted;
                  const pe = tot > 0 ? pct(dd.encrypted, tot) : dd.rate;
                  const pu = 100 - pe;
                  return (
                    <div key={label} className="sp-enc-cat">
                      <h4>{label}</h4>
                      <div className="sp-enc-pair">
                        <div className="sp-enc-tile">
                          <span>
                            <span className="sp-sw" style={{ background: "var(--v2-ok)" }} />{" "}
                            Criptografados
                          </span>
                          <b>{tot === 0 ? "—" : fmtNum(dd.encrypted)}</b>
                          <small>{pe}% do total</small>
                        </div>
                        <div className="sp-enc-tile">
                          <span>
                            <span className="sp-sw" style={{ background: "var(--v2-crit)" }} /> Sem
                            criptografia
                          </span>
                          <b>{tot === 0 ? "—" : fmtNum(dd.unencrypted)}</b>
                          <small>{pu}% do total</small>
                        </div>
                      </div>
                      <div
                        className="sp-stack"
                        role="img"
                        aria-label={`${label}: ${pe}% criptografados`}
                      >
                        <i
                          style={{ width: `${pe}%`, background: "var(--v2-ok)" }}
                          title={`${fmtNum(dd.encrypted)} criptografados (${pe}%)`}
                        />
                        <i
                          style={{ width: `${pu}%`, background: "var(--v2-crit)" }}
                          title={`${fmtNum(dd.unencrypted)} sem criptografia (${pu}%)`}
                        />
                      </div>
                    </div>
                  );
                })}

                <div className="sp-enc-line">
                  <span>Total de dispositivos</span>
                  <b>{fmtNum(encrypted + unencrypted)}</b>
                </div>
                <div className="sp-enc-line">
                  <span>Sem criptografia por tipo</span>
                  <span style={{ display: "flex", gap: 14 }}>
                    <b style={{ color: "color-mix(in oklch, var(--v2-crit) 75%, var(--v2-fg))" }}>
                      {fmtNum(unencByClass.desktop)}{" "}
                      <span
                        style={{
                          fontWeight: 400,
                          fontFamily: "var(--font-ui)",
                          color: "var(--v2-fg-2)",
                        }}
                      >
                        desktops
                      </span>
                    </b>
                    <b style={{ color: "color-mix(in oklch, var(--v2-crit) 75%, var(--v2-fg))" }}>
                      {fmtNum(unencByClass.notebook)}{" "}
                      <span
                        style={{
                          fontWeight: 400,
                          fontFamily: "var(--font-ui)",
                          color: "var(--v2-fg-2)",
                        }}
                      >
                        notebooks
                      </span>
                    </b>
                  </span>
                </div>
                {encLicense &&
                  (() => {
                    const over = encLicense.used > encLicense.quantity;
                    const lp = pct(encLicense.used, encLicense.quantity);
                    return (
                      <div
                        style={{
                          display: "grid",
                          gap: 6,
                          paddingTop: 10,
                          borderTop: "1px solid var(--v2-line)",
                        }}
                      >
                        <div className="sp-enc-line" style={{ border: 0, padding: 0 }}>
                          <span>Licenças de criptografia</span>
                          {over && <span className="sp-tag crit">acima do contratado</span>}
                        </div>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                          <b
                            style={{
                              fontSize: 20,
                              fontWeight: 600,
                              color: over
                                ? "color-mix(in oklch, var(--v2-crit) 75%, var(--v2-fg))"
                                : undefined,
                            }}
                          >
                            {fmtNum(encLicense.used)}
                          </b>
                          <span className="dim" style={{ fontSize: 12.5 }}>
                            em uso de {fmtNum(encLicense.quantity)} contratadas ({lp}%)
                          </span>
                        </div>
                        <div className="sp-meter" aria-hidden="true" style={{ height: 8 }}>
                          <i
                            style={{
                              width: `${Math.min(100, lp)}%`,
                              background: over ? "var(--v2-crit)" : "var(--v2-accent)",
                            }}
                          />
                        </div>
                      </div>
                    );
                  })()}
              </div>
            </div>
          </div>

          <div className="sp-card sp-span-2">
            <div className="sp-card-hdr">
              <div>
                <h2 className="sp-card-title">Estações e servidores</h2>
                <p className="sp-card-sub">Distribuição por status</p>
              </div>
              <div className="sp-legend">
                {DEVICE_STATUS.map((s) => (
                  <span key={s.key}>
                    <span className="sp-sw" style={{ background: s.color }} /> {s.label}
                  </span>
                ))}
              </div>
            </div>
            <div className="sp-card-body" style={{ display: "grid", gap: 18 }}>
              {(
                [
                  ["Estações", d.endpoints],
                  ["Servidores", d.servers],
                ] as Array<[string, SophosCore["endpoints"]]>
              ).map(([label, dev]) => (
                <div key={label} className="sp-dev-card">
                  <div className="sp-dev-row">
                    <span>{label}</span>
                    <b>{fmtNum(dev.total)}</b>
                  </div>
                  <div className="sp-stack" role="img" aria-label={`${label} por status`}>
                    {DEVICE_STATUS.map((s) =>
                      dev[s.key] > 0 ? (
                        <i
                          key={s.key}
                          style={{
                            width: `${(dev[s.key] / Math.max(1, dev.total)) * 100}%`,
                            background: s.color,
                          }}
                          title={`${label} · ${s.label}: ${fmtNum(dev[s.key])} (${pct(dev[s.key], dev.total)}%)`}
                        />
                      ) : null,
                    )}
                  </div>
                </div>
              ))}
            </div>
            <div className="sp-toolbar" style={{ borderTop: "1px solid var(--v2-line)" }}>
              <b>Não protegidos</b>
              <small>{fmtNum(notProtected)} · sem o agente instalado ou sem comunicar</small>
              <label className="sp-search" style={{ marginLeft: "auto" }}>
                <Search size={14} />
                <input
                  value={npQuery}
                  onChange={(e) => setNpQuery(e.target.value)}
                  placeholder="Buscar dispositivo"
                  aria-label="Buscar dispositivo não protegido"
                />
              </label>
            </div>
            {notProtectedQuery.isLoading ? (
              <div className="sp-empty">Carregando…</div>
            ) : npHosts.length === 0 ? (
              <div className="sp-empty">
                {npQuery.trim()
                  ? "Nenhum dispositivo com esse nome."
                  : "Nenhum dispositivo não protegido."}
              </div>
            ) : (
              <div className="sp-scroll" style={{ maxHeight: 420 }}>
                <table className="sp-table">
                  <thead>
                    <tr>
                      <th>Dispositivo</th>
                      <th>Tipo</th>
                    </tr>
                  </thead>
                  <tbody>
                    {npHosts.map((h) => (
                      <tr key={`${h.kind}-${h.hostname}`}>
                        <td className="mono" style={{ fontWeight: 500 }}>
                          {h.hostname}
                        </td>
                        <td className="dim">{h.kind}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ══ POLÍTICAS ═══════════════════════════════════════════════════════ */}
      {view === "politicas" && (
        <div className="sp-card">
          <div className="sp-toolbar">
            <div className="sp-seg" role="group" aria-label="Tipo de política">
              <button
                type="button"
                aria-pressed={polTab === "endpoint"}
                onClick={() => setPolTab("endpoint")}
              >
                Estações <span className="dim">{polData?.endpointPolicies ?? 0}</span>
              </button>
              <button
                type="button"
                aria-pressed={polTab === "server"}
                onClick={() => setPolTab("server")}
              >
                Servidores <span className="dim">{polData?.serverPolicies ?? 0}</span>
              </button>
            </div>
            <label className="sp-search" style={{ marginLeft: "auto" }}>
              <Search size={14} />
              <input
                value={polQuery}
                onChange={(e) => setPolQuery(e.target.value)}
                placeholder="Buscar política"
                aria-label="Buscar política"
              />
            </label>
          </div>
          {policiesQuery.isLoading ? (
            <div className="sp-empty">Carregando…</div>
          ) : polFiltered.length === 0 ? (
            <div className="sp-empty">Nenhuma política encontrada.</div>
          ) : (
            <div className="sp-scroll" style={{ maxHeight: 620 }}>
              <table className="sp-table">
                <thead>
                  <tr>
                    <th className="sortable" onClick={() => togglePolSort("name")}>
                      Política <SortIcon active={polSortKey === "name"} dir={polSortDir} />
                    </th>
                    <th className="sortable r" onClick={() => togglePolSort("assigned_count")}>
                      Dispositivos atribuídos{" "}
                      <SortIcon active={polSortKey === "assigned_count"} dir={polSortDir} />
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {polFiltered.map((p) => (
                    <tr key={p.id}>
                      <td style={{ fontWeight: 500 }}>{p.name}</td>
                      <td className="r mono">{fmtNum(p.assigned_count)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══ AUDITORIA ═══════════════════════════════════════════════════════ */}
      {view === "auditoria" && (
        <div className="sp-card">
          <div className="sp-toolbar">
            <b>Log de auditoria do Sophos Central</b>
            <small>{fmtNum(filteredAuditEvents.length)}</small>
            <label className="sp-search" style={{ marginLeft: "auto" }}>
              <Search size={14} />
              <input
                value={auditTypeQuery}
                onChange={(e) => setAuditTypeQuery(e.target.value)}
                placeholder="Filtrar por evento"
                aria-label="Filtrar por evento"
              />
            </label>
            <label className="sp-search">
              <Search size={14} />
              <input
                value={auditUserQuery}
                onChange={(e) => setAuditUserQuery(e.target.value)}
                placeholder="Filtrar por quem modificou"
                aria-label="Filtrar por quem modificou"
              />
            </label>
          </div>
          {auditQuery.isLoading ? (
            <div className="sp-empty">Carregando…</div>
          ) : filteredAuditEvents.length === 0 ? (
            <div className="sp-empty">
              {(auditData?.auditEvents.length ?? 0) === 0
                ? "Sem eventos de auditoria no período. A sincronização de auditoria é opcional e é ativada em Integrações."
                : "Nenhum evento com esses filtros."}
            </div>
          ) : (
            <div className="sp-scroll" style={{ maxHeight: 620 }}>
              <table className="sp-table">
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Modificado por</th>
                    <th>Evento</th>
                    <th>IP de origem</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAuditEvents.map((e) => (
                    <tr key={e.id}>
                      <td className="mono dim">{fmtTime(e.occurredAt)}</td>
                      <td className="mono">{e.modifiedBy}</td>
                      <td>{e.description}</td>
                      <td className="mono dim">{e.originIpAddress ?? "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Painel lateral: detecção ─────────────────────────────────────────── */}
      <DetailSheet
        open={!!det}
        onOpenChange={(o) => !o && setOpenDet(null)}
        eyebrow={det ? `${fmtTime(det.ts)} · ${det.host}` : null}
        title={det?.threat ?? ""}
        badges={
          det && (
            <>
              <SevTag severity={det.severity} />
              <span className="sp-tag">{det.type}</span>
            </>
          )
        }
        footer={
          det?.user ? (
            <button
              className="sp-btn ghost"
              onClick={() => {
                setThreatUser(det.user);
                setOpenDet(null);
              }}
            >
              Ver ameaças deste usuário
            </button>
          ) : null
        }
      >
        {det && (
          <DetailSection title="Detecção">
            <DetailList
              items={[
                ["Dispositivo", det.host, true],
                ["Usuário", det.user || "—", true],
                ["Ação tomada", det.action || "—"],
                ["Tipo", det.type || "—"],
                ["Quando", fmtTime(det.ts), true],
              ]}
            />
          </DetailSection>
        )}
      </DetailSheet>
    </div>
  );
}
