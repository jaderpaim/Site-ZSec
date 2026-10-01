import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import {
  getPhishingOverview,
  getPhishingTemplateCached,
  getPhishingOperations,
  getGophishSyncState,
  syncGophishData,
  type PhishingOverview,
} from "@/lib/phishing.functions";
import {
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  AlertCircle,
  X,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Users,
  Mail,
  MousePointer2,
  ShieldAlert,
  MailOpen,
  Activity,
  Fish,
  Lock,
  Search,
  GripHorizontal,
  Minimize2,
  Maximize2,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { CronHealthBadge } from "@/components/dashboard/CronHealthBadge";

// ── Design Tokens ──────────────────────────────────────────────────────────────
const T = {
  surface: "var(--tl-0f1420, #0F1420)",
  surfaceAlt: "var(--tl-131825, #131825)",
  border: "var(--tl-1e2640, #1E2640)",
  borderHi: "var(--tl-2a3560, #2A3560)",
  accent: "#3B82F6",
  accentGlow: "rgba(59,130,246,0.15)",
  accentSoft: "rgba(59,130,246,0.08)",
  success: "#10B981",
  successBg: "rgba(16,185,129,0.10)",
  warning: "#F59E0B",
  warningBg: "rgba(245,158,11,0.10)",
  danger: "#EF4444",
  dangerBg: "rgba(239,68,68,0.10)",
  purple: "#A78BFA",
  purpleBg: "rgba(167,139,250,0.10)",
  cyan: "#22D3EE",
  neutral: "var(--tl-6b7280, #6B7280)",
  textPrimary: "var(--tl-f1f5f9, #F1F5F9)",
  textSecondary: "var(--tl-94a3b8, #94A3B8)",
  textMuted: "var(--tl-64748b, #64748B)",
  textSubtle: "var(--tl-475569, #475569)",
  chartGrid: "rgba(var(--tl-line-rgb, 30,38,64),0.7)",
  chartAxis: "var(--tl-334155, #334155)",
  chartTick: "var(--tl-64748b, #64748B)",
};

const DEPT_PALETTE = [T.warning, T.danger, T.accent, T.purple, T.cyan, "#FB923C", T.success, "#F472B6"];

// ── CSS ────────────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');

  .ph-root { font-family:'DM Sans',sans-serif; color:${T.textPrimary}; display:flex; flex-direction:column; gap:16px; }
  .ph-root * { box-sizing:border-box; }
  @keyframes ph-spin   { to{transform:rotate(360deg)} }
  @keyframes ph-fadeup { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  .ph-spin    { animation:ph-spin 0.75s linear infinite; }
  .ph-fadeup  { animation:ph-fadeup 0.3s ease forwards; }
  @keyframes ph-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,0.5)} 50%{box-shadow:0 0 0 5px rgba(16,185,129,0)} }
  .ph-live-dot { width:6px;height:6px;border-radius:50%;background:${T.success};animation:ph-pulse 2s infinite;flex-shrink:0; }

  .ph-root ::-webkit-scrollbar       { width:4px;height:4px; }
  .ph-root ::-webkit-scrollbar-track { background:transparent; }
  .ph-root ::-webkit-scrollbar-thumb { background:${T.borderHi};border-radius:2px; }

  .ph-root .recharts-cartesian-axis-tick-value { fill:${T.chartTick} !important;font-size:10px;font-family:'IBM Plex Mono',monospace; }
  .ph-root .recharts-text { fill:${T.chartTick} !important; }

  /* ── Header ── */
  .ph-hdr { background:${T.surface};border:1px solid ${T.border};border-radius:12px;padding:16px 22px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap; }
  .ph-hdr-brand { display:flex;align-items:center;gap:12px; }
  .ph-hdr-icon { width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:${T.dangerBg};border:1px solid rgba(239,68,68,0.3);flex-shrink:0; }
  .ph-hdr-title { font-size:15px;font-weight:700;font-family:'Space Grotesk',sans-serif;letter-spacing:-0.01em; }
  .ph-hdr-sub { font-size:11px;color:${T.textMuted};margin-top:2px; }
  .ph-hdr-pills { display:flex;align-items:center;gap:8px;flex-wrap:wrap; }
  .ph-pill { display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:5px;font-size:11px;font-family:'IBM Plex Mono',monospace;font-weight:700;border:1px solid transparent; }

  /* ── Tabs ── */
  .ph-tabs-bar { display:flex;align-items:center;gap:4px;padding:4px;background:${T.surface};border:1px solid ${T.border};border-radius:8px;width:fit-content; }
  .ph-tab { display:inline-flex;align-items:center;gap:6px;padding:7px 16px;border-radius:6px;border:none;background:transparent;font-size:12px;font-weight:600;font-family:'DM Sans',sans-serif;color:${T.textMuted};cursor:pointer;transition:all 0.15s;white-space:nowrap; }
  .ph-tab:hover:not(.active) { color:${T.textSecondary};background:rgba(var(--tl-ink, 255,255,255),0.04); }
  .ph-tab.active { background:${T.dangerBg};color:${T.danger};border:1px solid rgba(239,68,68,0.25); }

  /* ── KPI strip ── */
  .ph-kpi-grid { display:grid;grid-template-columns:repeat(4,1fr);gap:12px; }
  .ph-kpi { background:${T.surface};border:1px solid ${T.border};border-radius:10px;padding:14px 18px;position:relative;overflow:hidden;transition:border-color 0.2s; }
  .ph-kpi:hover { border-color:${T.borderHi}; }
  .ph-kpi::before { content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--kc,${T.accent}); }
  .ph-kpi-icon { position:absolute;top:10px;right:10px;width:40px;height:40px;border-radius:9px;display:flex;align-items:center;justify-content:center;background:var(--ki-bg,${T.accentGlow}); }
  .ph-kpi-label { font-size:9px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${T.textMuted};font-family:'IBM Plex Mono',monospace;margin-bottom:5px; }
  .ph-kpi-value { font-size:26px;font-weight:700;font-family:'Space Grotesk',sans-serif;letter-spacing:-0.02em;line-height:1;color:var(--kc,${T.textPrimary}); }
  .ph-kpi-hint { font-size:10px;color:${T.textMuted};font-family:'IBM Plex Mono',monospace;margin-top:5px; }

  /* ── Panel ── */
  .ph-panel { background:${T.surface};border:1px solid ${T.border};border-radius:12px;overflow:hidden; }
  .ph-panel-hdr { display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;padding:13px 20px;background:${T.surfaceAlt};border-bottom:1px solid ${T.border}; }
  .ph-panel-title { display:flex;align-items:center;gap:8px;font-size:11px;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;font-family:'IBM Plex Mono',monospace;color:${T.textPrimary}; }
  .ph-panel-body { padding:16px; }

  /* ── Block card ── */
  .ph-block { background:${T.surface};border:1px solid ${T.border};border-radius:10px;display:flex;flex-direction:column;min-height:180px;transition:border-color 0.2s; }
  .ph-block:hover { border-color:${T.borderHi}; }
  .ph-block-hdr { display:flex;align-items:center;justify-content:space-between;padding:10px 16px;background:${T.surfaceAlt};border-bottom:1px solid ${T.border};cursor:grab;user-select:none;flex-shrink:0;border-radius:10px 10px 0 0; }
  .ph-block-hdr:active { cursor:grabbing; }
  .ph-block-title { display:flex;align-items:center;gap:7px;font-size:11px;font-weight:700;color:${T.textPrimary};text-transform:uppercase;letter-spacing:0.09em;font-family:'IBM Plex Mono',monospace; }
  .ph-resize-ctrl { display:flex;align-items:center;gap:2px;opacity:0;transition:opacity 0.15s; }
  .ph-block:hover .ph-resize-ctrl { opacity:1; }
  .ph-resize-btn { padding:2px;border:none;background:transparent;color:${T.textMuted};cursor:pointer;border-radius:3px;line-height:0;transition:all 0.15s; }
  .ph-resize-btn:hover { color:${T.textPrimary};background:rgba(var(--tl-ink, 255,255,255),0.07); }
  .ph-resize-btn:disabled { opacity:0.25;cursor:default; }
  .ph-block-body { flex:1;padding:16px; }

  /* ── Filter bar ── */
  .ph-filter-bar { background:${T.surfaceAlt};border:1px solid ${T.border};border-radius:10px;padding:14px 18px;display:flex;flex-direction:column;gap:12px; }
  .ph-filter-row { display:flex;align-items:center;gap:10px;flex-wrap:wrap; }
  .ph-filter-label { font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${T.textMuted};font-family:'IBM Plex Mono',monospace;flex-shrink:0;width:100px; }
  .ph-chip { display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:5px;font-size:11px;font-weight:600;font-family:'IBM Plex Mono',monospace;cursor:pointer;transition:all 0.15s;border:1px solid ${T.border};background:transparent;color:${T.textSecondary}; }
  .ph-chip:hover { border-color:${T.borderHi};color:${T.textPrimary}; }
  .ph-chip.active { border-color:${T.accent};background:${T.accentSoft};color:${T.accent}; }
  .ph-chip.active.danger { border-color:${T.danger};background:${T.dangerBg};color:${T.danger}; }
  .ph-chip.active.warning { border-color:${T.warning};background:${T.warningBg};color:${T.warning}; }
  .ph-chip.active.success { border-color:${T.success};background:${T.successBg};color:${T.success}; }

  /* ── Tooltip ── */
  .ph-tooltip { background:${T.surface};border:1px solid ${T.borderHi};border-radius:8px;padding:10px 14px;box-shadow:0 20px 40px rgba(0,0,0,0.5);min-width:160px; }
  .ph-tooltip-label { font-size:10px;font-family:'IBM Plex Mono',monospace;color:${T.textMuted};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px; }
  .ph-tooltip-row { display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:3px; }
  .ph-tooltip-dot { width:7px;height:7px;border-radius:2px;flex-shrink:0; }
  .ph-tooltip-name { color:${T.textSecondary};font-size:11px; }
  .ph-tooltip-val  { color:${T.textPrimary};font-weight:700;font-family:'IBM Plex Mono',monospace;margin-left:auto; }

  /* ── Table ── */
  .ph-table { width:100%;border-collapse:collapse; }
  .ph-table thead { position:sticky;top:0;z-index:10; }
  .ph-table th { padding:8px 12px;font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${T.textPrimary};font-family:'IBM Plex Mono',monospace;text-align:left;background:${T.surface};border-bottom:1px solid ${T.border};white-space:nowrap;cursor:pointer;user-select:none; }
  .ph-table th:hover { color:${T.textSecondary}; }
  .ph-table td { padding:9px 12px;border-bottom:1px solid rgba(var(--tl-line-rgb, 30,38,64),0.4);font-size:12px;color:${T.textPrimary};vertical-align:middle; }
  .ph-table tbody tr:hover td { background:rgba(239,68,68,0.03); }
  .ph-table tbody tr:last-child td { border-bottom:none; }
  .ph-table .mono { font-family:'IBM Plex Mono',monospace;font-size:11px; }
  .ph-table .dim  { color:${T.textMuted}; }
  .ph-table .trunc { max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }

  /* ── Action badge ── */
  .ph-badge { display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;font-family:'IBM Plex Mono',monospace;white-space:nowrap; }
  .ph-badge.danger  { background:${T.dangerBg};color:${T.danger};border:1px solid rgba(239,68,68,0.22); }
  .ph-badge.warning { background:${T.warningBg};color:${T.warning};border:1px solid rgba(245,158,11,0.22); }
  .ph-badge.ok      { background:${T.successBg};color:${T.success};border:1px solid rgba(16,185,129,0.22); }
  .ph-badge.info    { background:${T.accentSoft};color:${T.accent};border:1px solid rgba(59,130,246,0.22); }
  .ph-badge.neutral { background:rgba(107,114,128,0.1);color:${T.neutral};border:1px solid rgba(107,114,128,0.2); }

  /* ── Buttons ── */
  .ph-btn { display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all 0.15s;white-space:nowrap; }
  .ph-btn:disabled { opacity:0.45;cursor:not-allowed; }
  .ph-btn.primary { background:${T.dangerBg};border:1px solid rgba(239,68,68,0.35);color:${T.danger}; }
  .ph-btn.primary:hover:not(:disabled) { background:rgba(239,68,68,0.18); }
  .ph-btn.ghost { background:transparent;border:1px solid ${T.border};color:${T.textSecondary}; }
  .ph-btn.ghost:hover:not(:disabled) { border-color:${T.borderHi};color:${T.textPrimary}; }

  /* ── Search ── */
  .ph-search-wrap { position:relative;display:inline-flex;align-items:center; }
  .ph-search-icon { position:absolute;left:9px;pointer-events:none;color:${T.textMuted}; }
  .ph-search { background:${T.surfaceAlt};border:1px solid ${T.border};border-radius:6px;padding:5px 10px 5px 29px;font-size:12px;font-family:'IBM Plex Mono',monospace;color:${T.textPrimary};outline:none;transition:border-color 0.15s;width:240px; }
  .ph-search:focus { border-color:rgba(239,68,68,0.5);box-shadow:0 0 0 2px rgba(239,68,68,0.1); }
  .ph-search::placeholder { color:${T.textSubtle}; }
  .ph-select { background:${T.surfaceAlt};border:1px solid ${T.border};border-radius:6px;padding:5px 10px;font-size:12px;font-family:'IBM Plex Mono',monospace;color:${T.textPrimary};outline:none;cursor:pointer;transition:border-color 0.15s;min-width:180px; }
  .ph-select:focus { border-color:rgba(239,68,68,0.5);box-shadow:0 0 0 2px rgba(239,68,68,0.1); }
  .ph-select:hover { border-color:${T.borderHi}; }
  .ph-select option { background:${T.surfaceAlt};color:${T.textPrimary}; }

  /* ── Campaign card ── */
  .ph-camp-card { background:${T.surfaceAlt};border:1px solid ${T.border};border-radius:8px;padding:14px 16px;display:flex;flex-direction:column;gap:12px;transition:border-color 0.2s; }
  .ph-camp-card:hover { border-color:${T.borderHi}; }
  .ph-camp-counters { display:grid;grid-template-columns:repeat(5,1fr);gap:6px; }
  .ph-camp-counter { background:${T.surface};border:1px solid ${T.border};border-radius:6px;padding:8px;text-align:center; }
  .ph-camp-counter-num { font-size:18px;font-weight:700;font-family:'Space Grotesk',sans-serif;line-height:1; }
  .ph-camp-counter-lbl { font-size:9px;font-family:'IBM Plex Mono',monospace;color:${T.textMuted};text-transform:uppercase;letter-spacing:0.08em;margin-top:2px; }

  /* ── Funnel bars (risk) ── */
  .ph-funnel-row { display:flex;align-items:center;gap:10px;margin-bottom:10px; }
  .ph-funnel-row:last-child { margin-bottom:0; }
  .ph-funnel-label { font-size:12px;color:${T.textSecondary};width:130px;flex-shrink:0; }
  .ph-funnel-track { flex:1;height:18px;background:rgba(var(--tl-line-rgb, 30,38,64),0.5);border-radius:4px;overflow:hidden; }
  .ph-funnel-fill  { height:100%;border-radius:4px;display:flex;align-items:center;padding-left:8px;transition:width 0.5s ease; }
  .ph-funnel-pct   { font-size:10px;font-weight:700;color:rgba(255,255,255,0.9);font-family:'IBM Plex Mono',monospace;white-space:nowrap; }
  .ph-funnel-count { font-size:11px;font-weight:700;font-family:'IBM Plex Mono',monospace;width:44px;text-align:right;flex-shrink:0; }

  /* ── Group drilldown ── */
  .ph-group-row { display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid rgba(var(--tl-line-rgb, 30,38,64),0.4);cursor:pointer;transition:background 0.1s; }
  .ph-group-row:hover { background:rgba(59,130,246,0.04); }
  .ph-group-row:last-child { border-bottom:none; }
  .ph-group-expand { color:${T.textMuted};flex-shrink:0; }
  .ph-group-name   { font-size:12px;font-weight:600;color:${T.textPrimary};flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
  .ph-group-meta   { font-size:11px;font-family:'IBM Plex Mono',monospace;color:${T.textSecondary};flex-shrink:0;display:flex;align-items:center;gap:4px; }
  .ph-group-body   { background:rgba(var(--tl-line-rgb, 30,38,64),0.25);border-bottom:1px solid ${T.border};max-height:200px;overflow-y:auto; }
  .ph-member-row   { display:flex;align-items:center;gap:10px;padding:7px 14px;border-bottom:1px solid rgba(var(--tl-line-rgb, 30,38,64),0.3);font-size:11px; }
  .ph-member-row:last-child { border-bottom:none; }

  /* ── Empty ── */
  .ph-empty { padding:40px;text-align:center;color:${T.textMuted};font-size:13px;font-family:'DM Sans',sans-serif; }

  /* ── Select dark ── */
  .ph-root [data-radix-select-trigger] { background:${T.surfaceAlt} !important; border-color:${T.border} !important; color:${T.textPrimary} !important; font-family:'IBM Plex Mono',monospace; font-size:11px !important; }
`;

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
function truncateDept(name: string) {
  const w = name.trim().split(/\s+/);
  return w.length > 3 ? w.slice(0, 3).join(" ") + "…" : name;
}

// ── Tooltip ────────────────────────────────────────────────────────────────────
function PhTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="ph-tooltip">
      <div className="ph-tooltip-label">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey ?? p.name} className="ph-tooltip-row">
          <div className="ph-tooltip-dot" style={{ background: p.color || p.fill }} />
          <span className="ph-tooltip-name">{p.name}</span>
          <span className="ph-tooltip-val">{p.value?.toLocaleString?.("pt-BR") ?? p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Sort icon ──────────────────────────────────────────────────────────────────
type SortKey = "email" | "status" | "action" | "cargo" | "departamento" | "campanha" | "launch_date";
function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <ArrowUpDown size={10} style={{ display: "inline", marginLeft: 2, opacity: 0.4 }} />;
  return dir === "asc" ? (
    <ArrowUp size={10} style={{ display: "inline", marginLeft: 2, color: T.danger }} />
  ) : (
    <ArrowDown size={10} style={{ display: "inline", marginLeft: 2, color: T.danger }} />
  );
}

// ── Resizable block ────────────────────────────────────────────────────────────
const COL_SIZES = ["col-span-1", "col-span-2", "col-span-3"] as const;
type ColSize = (typeof COL_SIZES)[number];
function Block({
  title,
  children,
  chartHeight = 260,
  defaultSize = "col-span-1" as ColSize,
  extra,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  chartHeight?: number;
  defaultSize?: ColSize;
  extra?: React.ReactNode;
}) {
  const [size, setSize] = React.useState<ColSize>(defaultSize);
  return (
    <div className={`${size} ph-block`} style={{ minHeight: chartHeight + 52 }}>
      <div className="ph-block-hdr">
        <div className="ph-block-title">
          <GripHorizontal size={11} color={T.textMuted} />
          <span>{title}</span>
          {extra}
        </div>
        <div className="ph-resize-ctrl">
          <button
            className="ph-resize-btn"
            disabled={size === COL_SIZES[0]}
            onClick={() => setSize(COL_SIZES[Math.max(0, COL_SIZES.indexOf(size) - 1)])}
          >
            <Minimize2 size={11} />
          </button>
          <button
            className="ph-resize-btn"
            disabled={size === COL_SIZES[2]}
            onClick={() => setSize(COL_SIZES[Math.min(2, COL_SIZES.indexOf(size) + 1)])}
          >
            <Maximize2 size={11} />
          </button>
        </div>
      </div>
      <div className="ph-block-body" style={{ height: chartHeight }}>
        {children}
      </div>
    </div>
  );
}

const axisProps = {
  stroke: T.chartAxis,
  fontSize: 10,
  tick: { fill: T.chartTick, fontFamily: "'IBM Plex Mono',monospace" },
  tickLine: false,
  axisLine: { stroke: T.chartAxis },
};

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════
export function PhishingDashboard() {
  // ── back-end UNCHANGED ─────────────────────────────────────────────────────
  const qc = useQueryClient();
  const fetchOverview = useServerFn(getPhishingOverview);
  const fetchSyncState = useServerFn(getGophishSyncState);
  const doSync = useServerFn(syncGophishData);
  const [syncing, setSyncing] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"dashboard" | "operacoes">("dashboard");

  const { data, isLoading, error } = useQuery({
    queryKey: ["phishing", "overview"],
    queryFn: () => fetchOverview(),
    staleTime: 5 * 60 * 1000,
  });
  const { data: syncState } = useQuery({
    queryKey: ["phishing", "sync-state"],
    queryFn: () => fetchSyncState(),
    staleTime: 5 * 60 * 1000,
  });

  async function handleSync() {
    setSyncing(true);
    try {
      const r = await doSync();
      if (r.ok) toast.success(`Sincronizado: ${r.counts?.campaigns ?? 0} campanhas, ${r.counts?.groups ?? 0} grupos`);
      else toast.error(`Erro no sync: ${r.error ?? "desconhecido"}`);
      await qc.refetchQueries({ queryKey: ["phishing"] });
    } finally {
      setSyncing(false);
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

  const errorMsg = error
    ? (error as Error).message || "Erro ao carregar."
    : !data || data.ok === false
      ? (data?.error ?? "Sem dados.")
      : null;

  return (
    <div className="ph-root ph-fadeup">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="ph-hdr">
        <div className="ph-hdr-brand">
          <div className="ph-hdr-icon">
            <Fish size={18} color={T.danger} />
          </div>
          <div>
            <div className="ph-hdr-title">Phishing — Simulação & Conscientização</div>
            <div className="ph-hdr-sub">Gophish · Campanhas, cliques e comprometimentos</div>
          </div>
        </div>
        <div className="ph-hdr-pills">
          {syncState?.synced_at && (
            <span style={{ fontSize: 11, color: T.textMuted, fontFamily: "'IBM Plex Mono',monospace" }}>
              Sync: {fmtDate(syncState.synced_at)}
            </span>
          )}
          <CronHealthBadge jobName="gophish-sync" moduleSlug="phishing" />
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div className="ph-live-dot" />
            <span
              style={{
                fontSize: 10,
                color: T.success,
                fontFamily: "'IBM Plex Mono',monospace",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
              }}
            >
              Live
            </span>
          </div>
          <button className="ph-btn primary" onClick={handleSync} disabled={syncing}>
            <RefreshCw size={12} className={syncing ? "ph-spin" : ""} />
            {syncing ? "Sincronizando…" : "Sincronizar"}
          </button>
        </div>
      </div>

      {/* ── Tabs ─────────────────────────────────────────────────────── */}
      <div className="ph-tabs-bar">
        <button
          className={`ph-tab${activeTab === "dashboard" ? " active" : ""}`}
          onClick={() => setActiveTab("dashboard")}
        >
          <Activity size={12} /> Dashboard
        </button>
        <button
          className={`ph-tab${activeTab === "operacoes" ? " active" : ""}`}
          onClick={() => setActiveTab("operacoes")}
        >
          <Users size={12} /> Operações
        </button>
      </div>

      {/* ── Loading ───────────────────────────────────────────────────── */}
      {isLoading && (
        <div
          style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            padding: "48px 24px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
          }}
        >
          <RefreshCw size={20} className="ph-spin" color={T.danger} />
          <span style={{ fontSize: 13, color: T.textSecondary }}>Carregando dados Gophish…</span>
        </div>
      )}

      {/* ── Error ─────────────────────────────────────────────────────── */}
      {!isLoading && errorMsg && (
        <div
          style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            padding: "48px 24px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: T.dangerBg,
              border: "1px solid rgba(239,68,68,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <AlertCircle size={20} color={T.danger} />
          </div>
          <div
            style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700, color: T.textPrimary }}
          >
            Sem dados Gophish
          </div>
          <div style={{ fontSize: 13, color: T.textMuted, maxWidth: 400 }}>{errorMsg}</div>
          <div style={{ fontSize: 11, color: T.textSubtle }}>
            Verifique em Integrações → Gophish, depois sincronize.
          </div>
          <button className="ph-btn primary" onClick={handleSync} disabled={syncing}>
            <RefreshCw size={12} className={syncing ? "ph-spin" : ""} />{" "}
            {syncing ? "Sincronizando…" : "Sincronizar agora"}
          </button>
        </div>
      )}

      {/* ── Content ───────────────────────────────────────────────────── */}
      {!isLoading && !errorMsg && data && data.ok !== false && (
        <>
          {activeTab === "dashboard" && (
            <DashboardTab data={data as PhishingOverview} onSync={handleSync} syncing={syncing} />
          )}
          {activeTab === "operacoes" && <OperationsTab />}
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD TAB
// ══════════════════════════════════════════════════════════════════════════════
function DashboardTab({ data, onSync, syncing }: { data: PhishingOverview; onSync: () => void; syncing: boolean }) {
  // ── back-end UNCHANGED ─────────────────────────────────────────────────────
  const [filters, setFilters] = React.useState({
    dept: "all",
    cargo: "all",
    nivel: "all",
    clicked: "all",
    submitted: "all",
  });
  const [search, setSearch] = React.useState("");
  const [sortKey, setSortKey] = React.useState<SortKey>("email");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");
  const [selectedTemplate, setSelectedTemplate] = React.useState<number | null>(null);
  const fetchTemplate = useServerFn(getPhishingTemplateCached);
  const tplQuery = useQuery({
    queryKey: ["phishing", "template", selectedTemplate],
    queryFn: () => fetchTemplate({ data: { id: selectedTemplate! } }),
    enabled: selectedTemplate !== null,
  });

  const deptOptions = React.useMemo(
    () => Array.from(new Set(data.details.map((d) => d.departamento))).sort(),
    [data.details],
  );
  const cargoOptions = React.useMemo(
    () => Array.from(new Set(data.details.map((d) => d.cargo).filter((c) => c && c !== "—"))).sort(),
    [data.details],
  );
  const nivelOptions = React.useMemo(
    () => Array.from(new Set(data.details.map((d) => d.nivel))).sort(),
    [data.details],
  );

  // Resolve template name for filtering
  const selectedTemplateName = React.useMemo(() => {
    if (selectedTemplate === null) return null;
    return data.templatesUsed.find((t) => t.id === selectedTemplate)?.name ?? null;
  }, [selectedTemplate, data.templatesUsed]);

  const filtered = React.useMemo(() => {
    const s = search.trim().toLowerCase();
    return data.details.filter((row) => {
      // Template filter — match exato pelo id do template da campanha
      if (selectedTemplate !== null && row.template_id !== selectedTemplate) return false;
      if (filters.dept !== "all" && row.departamento !== filters.dept) return false;
      if (filters.cargo !== "all" && row.cargo !== filters.cargo) return false;
      if (filters.nivel !== "all" && row.nivel !== filters.nivel) return false;
      if (filters.clicked === "yes" && !row.clicked) return false;
      if (filters.clicked === "no" && row.clicked) return false;
      if (filters.submitted === "yes" && !row.submitted) return false;
      if (filters.submitted === "no" && row.submitted) return false;
      if (s) {
        const hay = `${row.email} ${row.cargo} ${row.departamento} ${row.campanha} ${row.status}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [data.details, filters, search, selectedTemplateName]);

  const byDeptClicks = React.useMemo(() => {
    const m = new Map<string, number>();
    filtered.filter((r) => r.clicked).forEach((r) => m.set(r.departamento, (m.get(r.departamento) ?? 0) + 1));
    return [...m.entries()].map(([dept, total]) => ({ dept, total })).sort((a, b) => b.total - a.total);
  }, [filtered]);
  const byDeptSubmitted = React.useMemo(() => {
    const m = new Map<string, number>();
    filtered.filter((r) => r.submitted).forEach((r) => m.set(r.departamento, (m.get(r.departamento) ?? 0) + 1));
    return [...m.entries()].map(([dept, total]) => ({ dept, total })).sort((a, b) => b.total - a.total);
  }, [filtered]);

  const sorted = React.useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = String((a as any)[sortKey] ?? "").toLowerCase();
      const bv = String((b as any)[sortKey] ?? "").toLowerCase();
      return av < bv ? (sortDir === "asc" ? -1 : 1) : av > bv ? (sortDir === "asc" ? 1 : -1) : 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

  // KPIs computed from filtered rows so they react to template selection
  const fSent = filtered.length;
  const fOpened = filtered.filter((r) => r.opened).length;
  const fClicked = filtered.filter((r) => r.clicked).length;
  const fSubmitted = filtered.filter((r) => r.submitted).length;
  const fCompPct = fSent > 0 ? Math.round((fSubmitted / fSent) * 100) : 0;
  const fClickPct = fSent > 0 ? Math.round((fClicked / fSent) * 100) : 0;
  const fOpenPct = fSent > 0 ? Math.round((fOpened / fSent) * 100) : 0;
  // Fall back to global KPIs when no template filter is active
  const sent = selectedTemplateName ? fSent : data.kpis.sent;
  const openedN = selectedTemplateName ? fOpened : data.kpis.opened;
  const clickedN = selectedTemplateName ? fClicked : data.kpis.clicked;
  const submittedN = selectedTemplateName ? fSubmitted : data.kpis.submitted;
  const compPct = selectedTemplateName ? fCompPct : data.kpis.compromisePct;
  const clickPct = selectedTemplateName ? fClickPct : data.kpis.clickedPct;
  const openPct = selectedTemplateName ? fOpenPct : data.kpis.openedPct;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* ── Template selector — topo da página ── */}
      <div className="ph-panel">
        <div className="ph-panel-hdr">
          <div className="ph-panel-title">
            <Mail size={11} color={T.accent} /> Template de campanha
            <span style={{ fontWeight: 400, color: T.textSubtle }}>
              ({data.templatesTotal} total · {data.templatesUsed.length} em uso)
            </span>
            {selectedTemplateName && (
              <span
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "2px 8px",
                  borderRadius: 4,
                  background: T.accentSoft,
                  border: `1px solid rgba(59,130,246,0.3)`,
                  fontSize: 10,
                  color: T.accent,
                  fontWeight: 700,
                  marginLeft: 4,
                }}
              >
                {selectedTemplateName}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Select
              value={selectedTemplate === null ? "" : String(selectedTemplate)}
              onValueChange={(v) => setSelectedTemplate(v ? Number(v) : null)}
            >
              <SelectTrigger
                style={{
                  background: T.surfaceAlt,
                  borderColor: T.border,
                  color: T.textPrimary,
                  fontFamily: "'IBM Plex Mono',monospace",
                  fontSize: 11,
                  width: 280,
                  height: 32,
                }}
              >
                <SelectValue placeholder="Filtrar dashboard por template…" />
              </SelectTrigger>
              <SelectContent>
                {data.templatesUsed.map((t) => (
                  <SelectItem key={t.id} value={String(t.id)}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedTemplate !== null && (
              <button className="ph-btn ghost" style={{ padding: "4px 8px" }} onClick={() => setSelectedTemplate(null)}>
                <X size={11} /> Limpar
              </button>
            )}
          </div>
        </div>
        {selectedTemplate !== null && (
          <div className="ph-panel-body" style={{ borderTop: `1px solid ${T.border}` }}>
            {tplQuery.isLoading ? (
              <div style={{ display: "flex", alignItems: "center", gap: 8, color: T.textMuted, fontSize: 12 }}>
                <RefreshCw size={13} className="ph-spin" color={T.accent} /> Carregando template…
              </div>
            ) : tplQuery.data?.ok ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ fontSize: 11, color: T.textMuted, fontFamily: "'IBM Plex Mono',monospace" }}>
                  <span style={{ color: T.textSecondary, fontWeight: 600 }}>Assunto:</span>{" "}
                  {tplQuery.data.subject || "(sem assunto)"}
                </div>
                <iframe
                  title={tplQuery.data.name}
                  srcDoc={tplQuery.data.html || "<p style='padding:1rem'>Sem HTML.</p>"}
                  sandbox=""
                  style={{
                    width: "100%",
                    height: 400,
                    background: "white",
                    borderRadius: 6,
                    border: `1px solid ${T.border}`,
                  }}
                />
              </div>
            ) : (
              <div style={{ display: "flex", alignItems: "center", gap: 6, color: T.danger, fontSize: 12 }}>
                <AlertCircle size={13} /> {tplQuery.data?.error ?? "Falha ao carregar template."}
              </div>
            )}
          </div>
        )}
      </div>

      {/* KPIs */}
      <div className="ph-kpi-grid">
        {[
          {
            label: "E-mails Enviados",
            value: sent.toLocaleString("pt-BR"),
            hint: selectedTemplateName ? `filtrado por template` : `${data.campaignsStatus.ativas} campanhas ativas`,
            color: T.accent,
            kibg: "rgba(59,130,246,0.18)",
            icon: <Mail size={22} color={T.accent} />,
          },
          {
            label: "E-mails Abertos",
            value: openedN.toLocaleString("pt-BR"),
            hint: `${openPct}% dos enviados`,
            color: T.purple,
            kibg: "rgba(167,139,250,0.18)",
            icon: <MailOpen size={22} color={T.purple} />,
          },
          {
            label: "Cliques no Link",
            value: clickedN.toLocaleString("pt-BR"),
            hint: `${clickPct}% dos enviados`,
            color: T.warning,
            kibg: "rgba(245,158,11,0.2)",
            icon: <MousePointer2 size={22} color={T.warning} />,
          },
          {
            label: "Comprometidos",
            value: `${compPct}%`,
            hint: `${submittedN} dados submetidos`,
            color: T.danger,
            kibg: "rgba(239,68,68,0.18)",
            icon: <ShieldAlert size={22} color={T.danger} />,
          },
        ].map(({ label, value, hint, color, kibg, icon }) => (
          <div key={label} className="ph-kpi" style={{ "--kc": color, "--ki-bg": kibg } as React.CSSProperties}>
            <div className="ph-kpi-icon">{icon}</div>
            <div className="ph-kpi-label">{label}</div>
            <div className="ph-kpi-value">{value}</div>
            <div className="ph-kpi-hint">{hint}</div>
          </div>
        ))}
      </div>

      {/* Funnel de risco */}
      <div className="ph-panel">
        <div className="ph-panel-hdr">
          <div className="ph-panel-title">
            <ShieldAlert size={11} color={T.danger} /> Funil de risco
            {selectedTemplateName ? ` — ${selectedTemplateName}` : " — total"}
          </div>
        </div>
        <div className="ph-panel-body">
          {[
            { label: "Enviados", count: sent, color: T.accent, pct: 100 },
            {
              label: "Abertos",
              count: openedN,
              color: T.purple,
              pct: sent > 0 ? Math.round((openedN / sent) * 100) : 0,
            },
            {
              label: "Clicaram",
              count: clickedN,
              color: T.warning,
              pct: sent > 0 ? Math.round((clickedN / sent) * 100) : 0,
            },
            {
              label: "Submeteram",
              count: submittedN,
              color: T.danger,
              pct: sent > 0 ? Math.round((submittedN / sent) * 100) : 0,
            },
          ].map(({ label, count, color, pct }) => (
            <div key={label} className="ph-funnel-row">
              <span className="ph-funnel-label">{label}</span>
              <div className="ph-funnel-track">
                <div
                  className="ph-funnel-fill"
                  style={{ width: `${pct}%`, background: `linear-gradient(90deg,color-mix(in srgb, ${color} 40%, transparent),${color})` }}
                >
                  {pct >= 8 && <span className="ph-funnel-pct">{pct}%</span>}
                </div>
              </div>
              <span className="ph-funnel-count" style={{ color }}>
                {count.toLocaleString("pt-BR")}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div className="ph-filter-bar">
        <div className="ph-filter-row">
          {/* Departamento — select dark */}
          <span className="ph-filter-label">Departamento</span>
          <select
            className="ph-select"
            value={filters.dept}
            onChange={(e) => setFilters((f) => ({ ...f, dept: e.target.value }))}
          >
            <option value="all">Todos</option>
            {deptOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>

          {/* Cargo — select dark */}
          <span className="ph-filter-label" style={{ marginLeft: 8 }}>
            Cargo
          </span>
          <select
            className="ph-select"
            value={filters.cargo}
            onChange={(e) => setFilters((f) => ({ ...f, cargo: e.target.value }))}
          >
            <option value="all">Todos</option>
            {cargoOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>

          {/* Nível — select dark */}
          <span className="ph-filter-label" style={{ marginLeft: 8 }}>
            Nível
          </span>
          <select
            className="ph-select"
            value={filters.nivel}
            onChange={(e) => setFilters((f) => ({ ...f, nivel: e.target.value }))}
          >
            <option value="all">Todos</option>
            {nivelOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </div>

        <div className="ph-filter-row">
          <span className="ph-filter-label">Clicou no link</span>
          {[
            { v: "all", l: "Todos" },
            { v: "yes", l: "Sim" },
            { v: "no", l: "Não" },
          ].map(({ v, l }) => (
            <button
              key={v}
              className={`ph-chip${filters.clicked === v ? " active warning" : ""}`}
              onClick={() => setFilters((f) => ({ ...f, clicked: v }))}
            >
              {l}
            </button>
          ))}
          <span className="ph-filter-label" style={{ marginLeft: 16 }}>
            Comprometido
          </span>
          {[
            { v: "all", l: "Todos" },
            { v: "yes", l: "Sim" },
            { v: "no", l: "Não" },
          ].map(({ v, l }) => (
            <button
              key={v}
              className={`ph-chip${filters.submitted === v ? " active danger" : ""}`}
              onClick={() => setFilters((f) => ({ ...f, submitted: v }))}
            >
              {l}
            </button>
          ))}
        </div>
      </div>

      {/* Charts grid */}
      <div className="grid grid-cols-3 gap-4">
        {/* ── Cliques por Departamento ── */}
        <div className="col-span-1 ph-block" style={{ minHeight: 260 }}>
          <div className="ph-block-hdr">
            <div className="ph-block-title">
              <GripHorizontal size={11} color={T.textMuted} />
              <MousePointer2 size={11} color={T.warning} /> Cliques por Departamento
            </div>
          </div>
          <div className="ph-block-body" style={{ overflowY: "auto", maxHeight: 340 }}>
            {byDeptClicks.length === 0 ? (
              <div className="ph-empty">Sem cliques no período.</div>
            ) : (
              (() => {
                const maxVal = Math.max(...byDeptClicks.map((d) => d.total), 1);
                return byDeptClicks.map((d, i) => {
                  const barPct = Math.max(4, (d.total / maxVal) * 100);
                  const color = DEPT_PALETTE[i % DEPT_PALETTE.length];
                  return (
                    <div key={d.dept} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <span
                        style={{
                          fontSize: 11,
                          color: T.textSecondary,
                          width: 120,
                          flexShrink: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={d.dept}
                      >
                        {truncateDept(d.dept)}
                      </span>
                      <div
                        style={{
                          flex: 1,
                          height: 20,
                          background: "rgba(var(--tl-line-rgb, 30,38,64),0.5)",
                          borderRadius: 4,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${barPct}%`,
                            height: "100%",
                            background: `linear-gradient(90deg,color-mix(in srgb, ${color} 33%, transparent),${color})`,
                            borderRadius: 4,
                            display: "flex",
                            alignItems: "center",
                            paddingLeft: 8,
                          }}
                        >
                          {barPct > 20 && (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: "rgba(255,255,255,0.9)",
                                fontFamily: "'IBM Plex Mono',monospace",
                              }}
                            >
                              {d.total}
                            </span>
                          )}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          fontFamily: "'IBM Plex Mono',monospace",
                          color: T.warning,
                          width: 28,
                          textAlign: "right",
                          flexShrink: 0,
                        }}
                      >
                        {barPct <= 20 ? d.total : ""}
                      </span>
                    </div>
                  );
                });
              })()
            )}
          </div>
        </div>

        {/* ── Comprometidos por Departamento ── */}
        <div className="col-span-1 ph-block" style={{ minHeight: 260 }}>
          <div className="ph-block-hdr">
            <div className="ph-block-title">
              <GripHorizontal size={11} color={T.textMuted} />
              <ShieldAlert size={11} color={T.danger} /> Comprometidos por Depto.
            </div>
          </div>
          <div className="ph-block-body" style={{ overflowY: "auto", maxHeight: 340 }}>
            {byDeptSubmitted.length === 0 ? (
              <div className="ph-empty">Nenhum comprometimento.</div>
            ) : (
              (() => {
                const maxVal = Math.max(...byDeptSubmitted.map((d) => d.total), 1);
                return byDeptSubmitted.map((d, i) => {
                  const barPct = Math.max(4, (d.total / maxVal) * 100);
                  const color = DEPT_PALETTE[i % DEPT_PALETTE.length];
                  return (
                    <div key={d.dept} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                      <span
                        style={{
                          fontSize: 11,
                          color: T.textSecondary,
                          width: 120,
                          flexShrink: 0,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={d.dept}
                      >
                        {truncateDept(d.dept)}
                      </span>
                      <div
                        style={{
                          flex: 1,
                          height: 20,
                          background: "rgba(var(--tl-line-rgb, 30,38,64),0.5)",
                          borderRadius: 4,
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            width: `${barPct}%`,
                            height: "100%",
                            background: `linear-gradient(90deg,color-mix(in srgb, ${color} 33%, transparent),${color})`,
                            borderRadius: 4,
                            display: "flex",
                            alignItems: "center",
                            paddingLeft: 8,
                          }}
                        >
                          {barPct > 20 && (
                            <span
                              style={{
                                fontSize: 10,
                                fontWeight: 700,
                                color: "rgba(255,255,255,0.9)",
                                fontFamily: "'IBM Plex Mono',monospace",
                              }}
                            >
                              {d.total}
                            </span>
                          )}
                        </div>
                      </div>
                      <span
                        style={{
                          fontSize: 11,
                          fontWeight: 700,
                          fontFamily: "'IBM Plex Mono',monospace",
                          color: T.danger,
                          width: 28,
                          textAlign: "right",
                          flexShrink: 0,
                        }}
                      >
                        {barPct <= 20 ? d.total : ""}
                      </span>
                    </div>
                  );
                });
              })()
            )}
          </div>
        </div>

        {/* ── Campanhas ── */}
        <div className="col-span-1 ph-block" style={{ minHeight: 260 }}>
          <div className="ph-block-hdr">
            <div className="ph-block-title">
              <GripHorizontal size={11} color={T.textMuted} />
              <Fish size={11} color={T.danger} /> Campanhas
            </div>
          </div>
          <div
            className="ph-block-body"
            style={{ display: "flex", flexDirection: "column", gap: 12, justifyContent: "center" }}
          >
            {/* Tiles ativas / arquivadas */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {[
                {
                  label: "Ativas",
                  value: data.campaignsStatus.ativas,
                  color: T.accent,
                  bg: T.accentSoft,
                  border: "rgba(59,130,246,0.25)",
                },
                {
                  label: "Arquivadas",
                  value: data.campaignsStatus.arquivadas,
                  color: T.neutral,
                  bg: "rgba(107,114,128,0.08)",
                  border: "rgba(107,114,128,0.2)",
                },
              ].map(({ label, value, color, bg, border }) => (
                <div
                  key={label}
                  style={{
                    background: bg,
                    border: `1px solid ${border}`,
                    borderRadius: 8,
                    padding: "14px 14px",
                    position: "relative",
                    overflow: "hidden",
                  }}
                >
                  <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 2, background: color }} />
                  <div
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color,
                      fontFamily: "'IBM Plex Mono',monospace",
                      marginBottom: 6,
                      opacity: 0.85,
                    }}
                  >
                    {label}
                  </div>
                  <div
                    style={{
                      fontSize: 32,
                      fontWeight: 700,
                      fontFamily: "'Space Grotesk',sans-serif",
                      color,
                      lineHeight: 1,
                    }}
                  >
                    {value}
                  </div>
                </div>
              ))}
            </div>
            {/* Barra proporcional */}
            {(() => {
              const total = data.campaignsStatus.ativas + data.campaignsStatus.arquivadas;
              const ativPct = total > 0 ? Math.round((data.campaignsStatus.ativas / total) * 100) : 0;
              return total > 0 ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ height: 10, borderRadius: 5, overflow: "hidden", display: "flex" }}>
                    <div style={{ width: `${ativPct}%`, background: T.accent, transition: "width 0.5s" }} />
                    <div style={{ flex: 1, background: "rgba(107,114,128,0.25)" }} />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      fontSize: 10,
                      fontFamily: "'IBM Plex Mono',monospace",
                      color: T.textMuted,
                    }}
                  >
                    <span style={{ color: T.accent }}>{ativPct}% ativas</span>
                    <span>{total} total</span>
                  </div>
                </div>
              ) : null;
            })()}
            {/* Templates */}
            <div
              style={{
                borderTop: `1px solid ${T.border}`,
                paddingTop: 10,
                display: "flex",
                justifyContent: "space-between",
                fontSize: 11,
                fontFamily: "'IBM Plex Mono',monospace",
              }}
            >
              <span style={{ color: T.textMuted }}>Templates em uso</span>
              <span style={{ color: T.textPrimary, fontWeight: 700 }}>
                {data.templatesUsed.length} / {data.templatesTotal}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Detail table */}
      <div className="ph-panel">
        <div className="ph-panel-hdr">
          <div className="ph-panel-title">
            <Activity size={11} color={T.accent} /> Detalhamento
            <span style={{ fontWeight: 400, color: T.textSubtle }}>({sorted.length})</span>
          </div>
          <div className="ph-search-wrap">
            <Search size={12} className="ph-search-icon" />
            <input
              className="ph-search"
              placeholder="Buscar e-mail, cargo, campanha…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
        <div style={{ overflowX: "auto", maxHeight: 520, overflowY: "auto" }}>
          <table className="ph-table">
            <thead>
              <tr>
                {(
                  [
                    ["launch_date", "Data"],
                    ["email", "E-mail"],
                    ["status", "Status"],
                    ["action", "Ação"],
                    ["cargo", "Cargo"],
                    ["departamento", "Depto."],
                    ["campanha", "Campanha"],
                  ] as [SortKey, string][]
                ).map(([k, label], i) => (
                  <th key={k} onClick={() => toggleSort(k)} style={{ paddingLeft: i === 0 ? 18 : undefined }}>
                    {label} <SortIcon active={sortKey === k} dir={sortDir} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="ph-empty">Nenhum registro com os filtros aplicados.</div>
                  </td>
                </tr>
              ) : (
                sorted.map((r, i) => (
                  <tr key={`${r.email}-${r.campanha}-${i}`}>
                    <td className="mono dim" style={{ paddingLeft: 18, whiteSpace: "nowrap" }}>
                      {r.launch_date ? new Date(r.launch_date).toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className="mono trunc">{r.email}</td>
                    <td>
                      <span style={{ fontSize: 11, color: T.textSecondary }}>{r.status}</span>
                    </td>
                    <td>
                      <span className={`ph-badge ${r.submitted ? "danger" : r.clicked ? "warning" : "neutral"}`}>
                        {r.action}
                      </span>
                    </td>
                    <td style={{ fontSize: 11 }}>{r.cargo}</td>
                    <td style={{ fontSize: 11 }} className="trunc">
                      {r.departamento}
                    </td>
                    <td style={{ fontSize: 11 }} className="trunc dim">
                      {r.campanha}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// OPERATIONS TAB
// ══════════════════════════════════════════════════════════════════════════════
function OperationsTab() {
  // ── back-end UNCHANGED ─────────────────────────────────────────────────────
  const qc = useQueryClient();
  const fetchOps = useServerFn(getPhishingOperations);
  const doSync = useServerFn(syncGophishData);
  const [syncing, setSyncing] = React.useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: ["phishing", "operations"],
    queryFn: () => fetchOps(),
    staleTime: 5 * 60 * 1000,
  });

  async function handleSync() {
    setSyncing(true);
    try {
      const r = await doSync();
      if (r.ok) toast.success(`Campanhas sincronizadas: ${r.counts?.campaigns ?? 0}`);
      else toast.error(`Erro no sync: ${r.error ?? "desconhecido"}`);
      await qc.refetchQueries({ queryKey: ["phishing"] });
    } finally {
      setSyncing(false);
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

  if (isLoading)
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: "48px",
          color: T.textMuted,
          fontSize: 12,
          fontFamily: "'IBM Plex Mono',monospace",
        }}
      >
        <RefreshCw size={13} className="ph-spin" color={T.accent} /> Carregando…
      </div>
    );
  if (error || !data || data.ok === false)
    return (
      <div className="ph-empty">{(error as Error)?.message || (data && !data.ok ? data.error : "Sem dados.")}</div>
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="grid grid-cols-2 gap-4">
        <GroupsPanel groups={data.groups} />
        <UsersPanel users={data.users} />
      </div>
      <RunningCampaignsPanel campaigns={data.runningCampaigns} syncing={syncing} onSync={handleSync} />
    </div>
  );
}

// ── Groups Panel ──────────────────────────────────────────────────────────────
type Group = {
  id: number;
  name: string;
  targets: number;
  modified_date?: string;
  members: Array<{ email: string; first_name?: string; last_name?: string; position?: string }>;
};

function GroupsPanel({ groups }: { groups: Group[] }) {
  const [search, setSearch] = React.useState("");
  const [expanded, setExpanded] = React.useState<number | null>(null);
  const filtered = React.useMemo(() => {
    const s = search.trim().toLowerCase();
    return s ? groups.filter((g) => g.name.toLowerCase().includes(s)) : groups;
  }, [groups, search]);

  return (
    <div className="ph-panel">
      <div className="ph-panel-hdr">
        <div className="ph-panel-title">
          <Users size={11} color={T.accent} /> Departamentos ({groups.length})
        </div>
        <div className="ph-search-wrap">
          <Search size={12} className="ph-search-icon" />
          <input
            className="ph-search"
            style={{ width: 180 }}
            placeholder="Buscar departamento…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div style={{ maxHeight: 380, overflowY: "auto" }}>
        {filtered.length === 0 ? (
          <div className="ph-empty">Nenhum grupo.</div>
        ) : (
          filtered.map((g) => (
            <React.Fragment key={g.id}>
              <div className="ph-group-row" onClick={() => setExpanded(expanded === g.id ? null : g.id)}>
                <span className="ph-group-expand">
                  {expanded === g.id ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
                </span>
                <span className="ph-group-name">{g.name}</span>
                <span className="ph-group-meta">
                  <Users size={11} /> {g.targets}
                </span>
                <span className="ph-group-meta" style={{ marginLeft: 10, color: T.textSubtle }}>
                  {g.modified_date ? new Date(g.modified_date).toLocaleDateString("pt-BR") : "—"}
                </span>
              </div>
              {expanded === g.id && (
                <div className="ph-group-body">
                  {g.members.length === 0 ? (
                    <div style={{ padding: "10px 14px", fontSize: 11, color: T.textMuted }}>Nenhum membro.</div>
                  ) : (
                    g.members.map((m, i) => (
                      <div key={i} className="ph-member-row">
                        <span
                          className="mono dim"
                          style={{
                            flex: "0 0 200px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {m.email}
                        </span>
                        <span style={{ flex: 1, color: T.textSecondary }}>
                          {[m.first_name, m.last_name].filter(Boolean).join(" ") || "—"}
                        </span>
                        <span className="mono dim">{m.position || "—"}</span>
                      </div>
                    ))
                  )}
                </div>
              )}
            </React.Fragment>
          ))
        )}
      </div>
    </div>
  );
}

// ── Users Panel ───────────────────────────────────────────────────────────────
function UsersPanel({ users }: { users: Array<{ id: number; username: string; role?: string }> }) {
  const [search, setSearch] = React.useState("");
  const filtered = React.useMemo(() => {
    const s = search.trim().toLowerCase();
    return s ? users.filter((u) => u.username.toLowerCase().includes(s)) : users;
  }, [users, search]);

  return (
    <div className="ph-panel">
      <div className="ph-panel-hdr">
        <div className="ph-panel-title">
          <Lock size={11} color={T.accent} /> Usuários ({users.length})
        </div>
        <div className="ph-search-wrap">
          <Search size={12} className="ph-search-icon" />
          <input
            className="ph-search"
            style={{ width: 180 }}
            placeholder="Buscar usuário…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>
      <div style={{ maxHeight: 380, overflowY: "auto" }}>
        <table className="ph-table">
          <thead>
            <tr>
              <th style={{ paddingLeft: 18 }}>Usuário</th>
              <th>Papel</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={2}>
                  <div className="ph-empty">Nenhum usuário.</div>
                </td>
              </tr>
            ) : (
              filtered.map((u) => (
                <tr key={u.id}>
                  <td className="mono" style={{ paddingLeft: 18 }}>
                    {u.username}
                  </td>
                  <td>
                    <span className="ph-badge info">{u.role ?? "—"}</span>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Running Campaigns ─────────────────────────────────────────────────────────
type RunningCampaign = {
  id: number;
  name: string;
  status: string;
  launch_date?: string;
  template?: string;
  counters: { sent: number; opened: number; clicked: number; submitted: number; reported: number };
};

function RunningCampaignsPanel({
  campaigns,
  syncing,
  onSync,
}: {
  campaigns: RunningCampaign[];
  syncing: boolean;
  onSync: () => void;
}) {
  return (
    <div className="ph-panel">
      <div className="ph-panel-hdr">
        <div className="ph-panel-title">
          <Fish size={11} color={T.danger} /> Campanhas em andamento ({campaigns.length})
        </div>
        <button className="ph-btn ghost" onClick={onSync} disabled={syncing}>
          <RefreshCw size={12} className={syncing ? "ph-spin" : ""} /> {syncing ? "Sincronizando…" : "Sincronizar"}
        </button>
      </div>
      <div className="ph-panel-body">
        {campaigns.length === 0 ? (
          <div className="ph-empty">Nenhuma campanha em andamento.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(340px,1fr))", gap: 12 }}>
            {campaigns.map((c) => (
              <div key={c.id} className="ph-camp-card">
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 8 }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary, marginBottom: 3 }}>{c.name}</div>
                    <div style={{ fontSize: 11, color: T.textMuted, fontFamily: "'IBM Plex Mono',monospace" }}>
                      {c.template ?? "—"} · {c.launch_date ? fmtDate(c.launch_date) : "—"}
                    </div>
                  </div>
                  <span className="ph-badge info">{c.status}</span>
                </div>
                <div className="ph-camp-counters">
                  {[
                    { l: "Enviado", v: c.counters.sent, color: T.accent },
                    { l: "Aberto", v: c.counters.opened, color: T.purple },
                    { l: "Clicou", v: c.counters.clicked, color: T.warning },
                    { l: "Submeteu", v: c.counters.submitted, color: T.danger },
                    { l: "Reportou", v: c.counters.reported, color: T.success },
                  ].map((k) => (
                    <div key={k.l} className="ph-camp-counter">
                      <div className="ph-camp-counter-num" style={{ color: k.color }}>
                        {k.v}
                      </div>
                      <div className="ph-camp-counter-lbl">{k.l}</div>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
