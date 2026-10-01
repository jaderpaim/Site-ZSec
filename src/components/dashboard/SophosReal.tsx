import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getDashboardLayout, saveDashboardLayout } from "@/lib/dashboard-layout.functions";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Panel, Badge } from "./primitives";
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
import {
  AlertTriangle,
  ArrowUpDown,
  ArrowDown,
  ArrowUp,
  Search,
  RefreshCw,
  X,
  Maximize2,
  Minimize2,
  GripHorizontal,
  Shield,
  Server,
  Cpu,
  Users,
  Activity,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  ShieldCheck,
  Monitor,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useFilters } from "@/lib/filters-context";
import { toast } from "sonner";

// ── Back-end constants — UNCHANGED ────────────────────────────────────────────
const LAYOUT_MODULE = "sophos";

interface DashboardBlock {
  id: string;
  title: string;
  size: string;
}

// ── Design Tokens ─────────────────────────────────────────────────────────────
const T = {
  bg: "#0A0D14",
  surface: "#0F1420",
  surfaceAlt: "#131825",
  border: "#1E2640",
  borderHi: "#2A3560",

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
  neutral: "#6B7280",

  textPrimary: "#F1F5F9",
  textSecondary: "#F1F5F9",
  textMuted: "#F1F5F9",
  textSubtle: "#F1F5F9",

  chartGrid: "rgba(30,38,64,0.7)",
  chartAxis: "#F1F5F9",
  chartTick: "#F1F5F9",
};

// ── Pie chart palette ─────────────────────────────────────────────────────────
const PIE_PALETTE = [
  T.success,
  T.warning,
  T.danger,
  T.accent,
  T.purple,
  T.cyan,
  "#FB923C",
  "#F472B6",
  "#34D399",
  T.neutral,
];

// Mesma progressão de severidade do painel "Status de atividade do
// computador" da Sophos Central: Ativo → Inativo 2+ Semanas → Inativo 2+
// Meses → Não Protegido.
const DEVICE_STATUS_COLORS = [T.success, T.warning, T.neutral, T.danger];

// ── Inline CSS ─────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');

  .sp-root { font-family:'DM Sans',sans-serif; color:${T.textPrimary}; }
  .sp-root * { box-sizing:border-box; }

  /* ── Keyframes ── */
  @keyframes sp-spin   { to { transform:rotate(360deg) } }
  @keyframes sp-pulse  { 0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,0.5)} 50%{box-shadow:0 0 0 6px rgba(16,185,129,0)} }
  @keyframes sp-fadeup { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  @keyframes sp-shimmer { 0%{background-position:-220px 0} 100%{background-position:220px 0} }
  .sp-spin    { animation:sp-spin 0.75s linear infinite; }
  .sp-fadeup  { animation:sp-fadeup 0.35s ease forwards; }
  .sp-live-dot { width:6px;height:6px;border-radius:50%;background:${T.success};animation:sp-pulse 2s infinite;flex-shrink:0; }

  /* ── Block skeleton (carregamento por bloco) ── */
  .sp-skel-row {
    height:14px;border-radius:4px;margin-bottom:10px;
    background:linear-gradient(90deg,${T.surfaceAlt} 25%,${T.border} 37%,${T.surfaceAlt} 63%);
    background-size:440px 100%;animation:sp-shimmer 1.3s ease infinite;
  }
  .sp-block-error { display:flex;flex-direction:column;align-items:center;gap:8px;padding:28px 16px;text-align:center; }

  /* ── Toolbar ── */
  .sp-toolbar {
    background:${T.surface}; border:1px solid ${T.border}; border-radius:10px;
    padding:13px 20px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;
  }
  .sp-toolbar-left  { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .sp-toolbar-right { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .sp-sync-info { font-size:11px; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; }
  .sp-brand { display:flex; align-items:center; gap:8px; }
  .sp-brand-icon { width:32px;height:32px;border-radius:8px;display:flex;align-items:center;justify-content:center;background:${T.accentGlow};border:1px solid rgba(59,130,246,0.3); }
  .sp-brand-name { font-size:13px;font-weight:700;color:${T.textPrimary};font-family:'Space Grotesk',sans-serif;letter-spacing:-0.01em; }

  .sp-sync-btn {
    display:inline-flex;align-items:center;gap:6px;padding:7px 14px;
    background:${T.accentGlow};border:1px solid rgba(59,130,246,0.35);border-radius:6px;
    font-size:11px;font-weight:700;color:${T.accent};cursor:pointer;
    font-family:'DM Sans',sans-serif;transition:all 0.15s;
  }
  .sp-sync-btn:hover:not(:disabled) { background:rgba(59,130,246,0.22);box-shadow:0 0 16px rgba(59,130,246,0.12); }
  .sp-sync-btn:disabled { opacity:0.45;cursor:not-allowed; }
  .sp-reset-btn {
    display:inline-flex;align-items:center;gap:5px;padding:7px 12px;
    background:transparent;border:1px solid rgba(239,68,68,0.25);border-radius:6px;
    font-size:11px;font-weight:600;color:${T.danger};cursor:pointer;
    font-family:'DM Sans',sans-serif;transition:all 0.15s;
  }
  .sp-reset-btn:hover { background:${T.dangerBg}; }

  /* ── Filter chips ── */
  .sp-filter-bar {
    display:flex;align-items:center;gap:8px;padding:9px 16px;
    background:${T.surfaceAlt};border:1px solid ${T.border};border-radius:8px;flex-wrap:wrap;
  }
  .sp-filter-label { font-size:10px;color:${T.textMuted};font-family:'IBM Plex Mono',monospace;text-transform:uppercase;letter-spacing:0.08em; }
  .sp-chip {
    display:inline-flex;align-items:center;gap:5px;padding:3px 9px;border-radius:4px;
    font-size:10px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;
    font-family:'IBM Plex Mono',monospace;background:${T.warningBg};color:${T.warning};
    border:1px solid rgba(245,158,11,0.25);cursor:pointer;transition:all 0.15s;
  }
  .sp-chip:hover { background:rgba(245,158,11,0.2); }
  .sp-chip-clear { font-size:10px;color:${T.textMuted};cursor:pointer;font-family:'IBM Plex Mono',monospace;text-decoration:underline; }
  .sp-chip-clear:hover { color:${T.textPrimary}; }

  /* ── KPI Cards ── */
  .sp-kpi-grid { display:grid;grid-template-columns:repeat(5,1fr);gap:12px; }
  .sp-kpi {
    background:${T.surface};border:1px solid ${T.border};border-radius:10px;
    padding:14px 16px;position:relative;overflow:hidden;transition:border-color 0.2s;
  }
  .sp-kpi:hover { border-color:${T.borderHi}; }
  .sp-kpi::before { content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--kc,${T.accent}); }
  .sp-kpi-icon { position:absolute;top:10px;right:10px;width:40px;height:40px;border-radius:9px;display:flex;align-items:center;justify-content:center;background:var(--ki-bg,rgba(59,130,246,0.18)); }
  .sp-kpi-label { font-size:9px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${T.textMuted};font-family:'IBM Plex Mono',monospace;margin-bottom:5px; }
  .sp-kpi-value { font-size:26px;font-weight:700;font-family:'Space Grotesk',sans-serif;letter-spacing:-0.02em;line-height:1;color:var(--kc,${T.textPrimary}); }
  .sp-kpi-hint  { font-size:10px;color:${T.textMuted};font-family:'IBM Plex Mono',monospace;margin-top:5px; }

  /* ── Block card ── */
  .sp-block {
    background:${T.surface};border:1px solid ${T.border};border-radius:10px;
    display:flex;flex-direction:column;min-width:200px;min-height:140px;resize:vertical;overflow:auto;
    transition:border-color 0.2s,box-shadow 0.2s;
  }
  .sp-block:hover { border-color:${T.borderHi}; }
  .sp-block.dragging { opacity:0.18;border:1px dashed ${T.accent}; }

  .sp-block-header {
    display:flex;align-items:center;justify-content:space-between;
    padding:10px 16px;background:${T.surfaceAlt};border-bottom:1px solid ${T.border};
    cursor:grab;user-select:none;flex-shrink:0;border-radius:10px 10px 0 0;
  }
  .sp-block-header:active { cursor:grabbing; }
  .sp-block-title { display:flex;align-items:center;gap:7px;font-size:11px;font-weight:600;color:${T.textMuted};text-transform:uppercase;letter-spacing:0.09em;font-family:'IBM Plex Mono',monospace; }

  .sp-resize-ctrl { display:flex;align-items:center;gap:2px;opacity:0;transition:opacity 0.15s; }
  .sp-block:hover .sp-resize-ctrl { opacity:1; }
  .sp-resize-btn { padding:2px;border:none;background:transparent;color:${T.textMuted};cursor:pointer;border-radius:3px;line-height:0;transition:color 0.15s,background 0.15s; }
  .sp-resize-btn:hover { color:${T.textPrimary};background:rgba(255,255,255,0.07); }

  .sp-block-body { flex:1;padding:16px; }

  /* ── Charts overrides ── */
  .sp-root .recharts-cartesian-axis-tick-value { fill:${T.chartTick} !important;font-size:10px;font-family:'IBM Plex Mono',monospace; }
  .sp-root .recharts-text { fill:${T.chartTick} !important; }
  .sp-root .recharts-legend-item-text { color:${T.textSecondary} !important;font-size:11px;font-family:'IBM Plex Mono',monospace; }

  /* ── Tooltip ── */
  .sp-tooltip { background:${T.surface};border:1px solid ${T.borderHi};border-radius:8px;padding:10px 14px;font-family:'DM Sans',sans-serif;box-shadow:0 20px 40px rgba(0,0,0,0.5);min-width:150px; }
  .sp-tooltip-label { font-size:10px;font-family:'IBM Plex Mono',monospace;color:${T.textMuted};text-transform:uppercase;letter-spacing:0.08em;margin-bottom:6px; }
  .sp-tooltip-row { display:flex;align-items:center;gap:6px;font-size:12px;margin-bottom:3px; }
  .sp-tooltip-dot { width:7px;height:7px;border-radius:2px;flex-shrink:0; }
  .sp-tooltip-name { color:${T.textSecondary};font-size:11px; }
  .sp-tooltip-val  { color:${T.textPrimary};font-weight:700;font-family:'IBM Plex Mono',monospace;margin-left:auto; }

  /* ── Donut legend ── */
  .sp-donut-wrap { display:grid;grid-template-columns:1fr auto;gap:16px;align-items:center; }
  .sp-donut-legend { display:flex;flex-direction:column;gap:5px;min-width:130px;max-height:220px;overflow-y:auto; }
  .sp-donut-legend-row { display:flex;align-items:center;gap:7px;font-size:12px;cursor:pointer;border-radius:4px;padding:3px 5px;transition:background 0.1s; }
  .sp-donut-legend-row:hover { background:rgba(59,130,246,0.06); }
  .sp-donut-legend-row.dim { opacity:0.35; }
  .sp-donut-legend-row.active { font-weight:700; }
  .sp-donut-dot { width:8px;height:8px;border-radius:2px;flex-shrink:0; }
  .sp-donut-name { color:${T.textSecondary};flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:11px; }
  .sp-donut-count { font-family:'IBM Plex Mono',monospace;font-weight:600;color:${T.textPrimary};font-size:11px; }

  /* ── Device mini card ── */
  .sp-dev-card {
    background:${T.surfaceAlt};border:1px solid ${T.border};border-radius:7px;padding:10px 12px;
  }
  .sp-dev-card-title { font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${T.textMuted};font-family:'IBM Plex Mono',monospace;margin-bottom:4px; }
  .sp-dev-card-val   { font-size:22px;font-weight:700;font-family:'Space Grotesk',sans-serif;letter-spacing:-0.02em;color:${T.textPrimary}; }
  .sp-dev-row { display:flex;justify-content:space-between;font-size:11px;font-family:'IBM Plex Mono',monospace;margin-top:5px; }
  .sp-dev-ok  { color:${T.success}; }
  .sp-dev-bad { color:${T.danger}; }

  /* ── Enc bar ── */
  .sp-enc-track { height:5px;background:rgba(59,130,246,0.08);border-radius:3px;overflow:hidden;margin-top:5px; }
  .sp-enc-fill  { height:100%;border-radius:3px;transition:width 0.6s ease; }

  /* ── Top users bar chart ── */
  .sp-user-row { display:flex;align-items:center;gap:10px;margin-bottom:6px; }
  .sp-user-name { font-family:'IBM Plex Mono',monospace;font-size:11px;color:${T.textPrimary};width:180px;flex-shrink:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
  .sp-user-bar-wrap { flex:1;height:14px;background:rgba(239,68,68,0.08);border-radius:3px;overflow:hidden; }
  .sp-user-bar { height:100%;border-radius:3px;transition:width 0.5s ease; }
  .sp-user-count { font-family:'IBM Plex Mono',monospace;font-size:11px;color:${T.textSecondary};width:52px;text-align:right;flex-shrink:0; }

  /* ── Table ── */
  .sp-table { width:100%;border-collapse:collapse; }
  .sp-table thead { position:sticky;top:0;z-index:20; }
  .sp-table th {
    padding:8px 10px;font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;
    color:${T.textMuted};font-family:'IBM Plex Mono',monospace;text-align:left;
    background:${T.surface};border-bottom:1px solid ${T.border};white-space:nowrap;cursor:pointer;
  }
  .sp-table th:hover { color:${T.textSecondary}; }
  .sp-table td { padding:9px 10px;border-bottom:1px solid rgba(30,38,64,0.4);font-size:12px;color:${T.textPrimary};vertical-align:middle; }
  .sp-table tbody tr:hover td { background:rgba(59,130,246,0.04); }
  .sp-table tbody tr:last-child td { border-bottom:none; }
  .sp-table .mono { font-family:'IBM Plex Mono',monospace;font-size:11px; }
  .sp-table .dim  { color:${T.textMuted}; }
  .sp-table .trunc { max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }

  /* ── Action badge ── */
  .sp-badge { display:inline-flex;align-items:center;gap:3px;padding:2px 7px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;font-family:'IBM Plex Mono',monospace;white-space:nowrap; }
  .sp-badge.danger  { background:${T.dangerBg}; color:${T.danger}; border:1px solid rgba(239,68,68,0.22); }
  .sp-badge.warning { background:${T.warningBg};color:${T.warning};border:1px solid rgba(245,158,11,0.22); }
  .sp-badge.ok      { background:${T.successBg};color:${T.success};border:1px solid rgba(16,185,129,0.22); }
  .sp-badge.info    { background:${T.accentSoft};color:${T.accent}; border:1px solid rgba(59,130,246,0.22); }

  /* ── Search bar ── */
  .sp-search-wrap { position:relative;display:inline-flex;align-items:center; }
  .sp-search-icon { position:absolute;left:9px;pointer-events:none;color:${T.textMuted}; }
  .sp-search {
    background:${T.surfaceAlt};border:1px solid ${T.border};border-radius:6px;
    padding:5px 10px 5px 29px;font-size:11px;font-family:'IBM Plex Mono',monospace;
    color:${T.textPrimary};outline:none;transition:border-color 0.15s;width:180px;
  }
  .sp-search:focus { border-color:rgba(59,130,246,0.5);box-shadow:0 0 0 2px rgba(59,130,246,0.1); }
  .sp-search::placeholder { color:${T.textSubtle}; }

  /* ── Policy tabs ── */
  .sp-pol-tabs { display:flex;border-bottom:1px solid ${T.border};background:${T.surfaceAlt}; }
  .sp-pol-tab {
    padding:7px 14px;font-size:11px;font-weight:600;border:none;background:transparent;
    color:${T.textMuted};cursor:pointer;border-bottom:2px solid transparent;transition:all 0.15s;
    font-family:'DM Sans',sans-serif;
  }
  .sp-pol-tab:hover  { color:${T.textSecondary}; }
  .sp-pol-tab.active { color:${T.accent};border-bottom-color:${T.accent};background:${T.accentSoft}; }

  /* ── Not-protected tooltip ── */
  .sp-np-row { display:flex;justify-content:space-between;align-items:center;font-family:'IBM Plex Mono',monospace;font-size:11px; }

  /* ── Loading/Error states ── */
  .sp-state { background:${T.surface};border:1px solid ${T.border};border-radius:10px;padding:40px 24px;display:flex;flex-direction:column;align-items:center;gap:10px;text-align:center; }
  .sp-state-icon { width:40px;height:40px;border-radius:8px;display:flex;align-items:center;justify-content:center;margin-bottom:4px; }

  /* ── Empty ── */
  .sp-empty { padding:28px;text-align:center;color:${T.textMuted};font-size:12px;font-family:'DM Sans',sans-serif; }


  /* ── Segmented Ring ── */
  .sp-ring-wrap { display:flex; align-items:center; gap:20px; width:100%; }
  .sp-ring-svg  { flex:0 0 auto; width:min(180px,40%); height:auto; }
  .sp-ring-legend { display:flex; flex-direction:column; gap:10px; flex:1; min-width:0; }
  .sp-ring-leg-row { display:flex; align-items:center; gap:8px; cursor:pointer; border-radius:4px; padding:4px 6px; transition:background 0.1s; }
  .sp-ring-leg-row:hover { background:rgba(59,130,246,0.06); }
  .sp-ring-leg-row.dim { opacity:0.28; }
  .sp-ring-dot { width:9px; height:9px; border-radius:2px; flex-shrink:0; }
  .sp-ring-name { font-size:12px; color:${T.textSecondary}; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .sp-ring-bar-wrap { flex:1; height:11px; background:${T.border}; border-radius:3px; overflow:hidden; min-width:0; }
  .sp-ring-bar { height:100%; border-radius:2px; transition:width 0.5s ease; }
  .sp-ring-val { font-size:12px; font-weight:700; font-family:'IBM Plex Mono',monospace; color:${T.textPrimary}; width:38px; text-align:right; flex-shrink:0; }

  /* ── Scrollbar ── */
  .sp-root ::-webkit-scrollbar { width:4px;height:4px; }
  .sp-root ::-webkit-scrollbar-track { background:transparent; }
  .sp-root ::-webkit-scrollbar-thumb { background:${T.borderHi};border-radius:2px; }
`;

// ── Utilities — UNCHANGED ──────────────────────────────────────────────────────
function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  if (n >= 1_000) return n.toLocaleString("pt-BR");
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

function periodLabel(period: string) {
  if (period === "all") return "todos";
  if (period === "30d") return "30d";
  if (period === "60d") return "60d";
  if (period === "90d") return "90d";
  return "período";
}

// ── Custom Tooltip ─────────────────────────────────────────────────────────────
function ExecTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="sp-tooltip">
      <div className="sp-tooltip-label">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="sp-tooltip-row">
          <div className="sp-tooltip-dot" style={{ background: p.color }} />
          <span className="sp-tooltip-name">{p.name}</span>
          <span className="sp-tooltip-val">{fmtNum(Number(p.value))}</span>
        </div>
      ))}
    </div>
  );
}

// ── Segmented Ring ───────────────────────────────────────────────────────────
function SegmentedRing({
  data,
  total,
  totalLabel,
  activeName,
  onSliceClick,
}: {
  data: Array<{ name: string; value: number }>;
  total: number;
  totalLabel: string;
  activeName?: string | null;
  onSliceClick?: (name: string) => void;
}) {
  if (data.length === 0 || total === 0) return <div className="sp-empty">Sem dados.</div>;

  // r=54, cx=cy=70 → circumference ≈ 339.3
  // Each segment: dasharray = [arc-GAP, CIRC-(arc-GAP)]
  // dashoffset = CIRC - accumulated_arc  (shifts start clockwise)
  // Parent <g> rotated -90° so first segment starts at top
  const R = 54,
    CX = 70,
    CY = 70;
  const CIRC = 2 * Math.PI * R;
  const GAP = 2.5;

  let acc = 0;
  const segments = data.map((d, i) => {
    const arc = (d.value / total) * CIRC;
    const dash = Math.max(0, arc - GAP);
    const offset = CIRC - acc;
    acc += arc;
    return { ...d, dash, offset, color: PIE_PALETTE[i % PIE_PALETTE.length] };
  });

  const maxVal = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="sp-ring-wrap">
      <svg viewBox="0 0 140 140" className="sp-ring-svg">
        {/* Track */}
        <circle cx={CX} cy={CY} r={R} fill="none" stroke={T.border} strokeWidth="15" />
        {/* Segments — rotated -90° so first segment starts at top */}
        <g transform={`rotate(-90 ${CX} ${CY})`}>
          {segments.map((s, i) => (
            <circle
              key={i}
              cx={CX}
              cy={CY}
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth={activeName === s.name ? 18 : 14}
              strokeDasharray={`${s.dash} ${CIRC}`}
              strokeDashoffset={s.offset}
              strokeLinecap="butt"
              opacity={activeName && activeName !== s.name ? 0.2 : 1}
              style={{ cursor: "pointer", transition: "stroke-width 0.15s, opacity 0.2s" }}
              onClick={() => onSliceClick?.(s.name)}
            />
          ))}
        </g>
        {/* Centre text — sits outside the rotated group, reads upright */}
        <text
          x={CX}
          y={CY - 5}
          textAnchor="middle"
          fill={T.textPrimary}
          fontSize="18"
          fontWeight="700"
          fontFamily="'Space Grotesk',sans-serif"
          letterSpacing="-0.02em"
        >
          {fmtNum(total)}
        </text>
        <text
          x={CX}
          y={CY + 13}
          textAnchor="middle"
          fill={T.textMuted}
          fontSize="10"
          fontFamily="'IBM Plex Mono',monospace"
        >
          {totalLabel}
        </text>
      </svg>

      <div className="sp-ring-legend">
        {segments.map((s) => {
          const isActive = activeName === s.name;
          const isDimmed = !!activeName && !isActive;
          const barPct = Math.max(4, (s.value / maxVal) * 100);
          return (
            <div
              key={s.name}
              className={`sp-ring-leg-row${isDimmed ? " dim" : ""}`}
              onClick={() => onSliceClick?.(s.name)}
            >
              <span className="sp-ring-dot" style={{ background: s.color }} />
              <span className="sp-ring-name" title={s.name}>
                {s.name}
              </span>
              <div className="sp-ring-bar-wrap">
                <div className="sp-ring-bar" style={{ width: `${barPct}%`, background: s.color }} />
              </div>
              <span className="sp-ring-val" style={{ color: T.textPrimary }}>
                {fmtNum(s.value)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Donut with legend ─────────────────────────────────────────────────────────
function ExecDonut({
  data,
  total,
  totalLabel,
  activeName,
  onSliceClick,
  colors,
}: {
  data: Array<{ name: string; value: number }>;
  total: number;
  totalLabel: string;
  activeName?: string | null;
  onSliceClick?: (name: string) => void;
  colors?: string[];
}) {
  if (data.length === 0 || total === 0) return <div className="sp-empty">Sem dados.</div>;
  const palette = colors ?? PIE_PALETTE;

  return (
    <div className="sp-donut-wrap">
      <div style={{ position: "relative", height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={62}
              outerRadius={92}
              stroke="none"
              onClick={(p: { name?: string }) => onSliceClick && p?.name && onSliceClick(p.name)}
              cursor={onSliceClick ? "pointer" : undefined}
            >
              {data.map((c, i) => {
                const isActive = activeName === c.name;
                const isDimmed = !!activeName && !isActive;
                return (
                  <Cell
                    key={i}
                    fill={palette[i % palette.length]}
                    fillOpacity={isDimmed ? 0.2 : 1}
                    stroke={isActive ? T.textPrimary : "none"}
                    strokeWidth={isActive ? 2 : 0}
                  />
                );
              })}
            </Pie>
            <Tooltip
              contentStyle={{
                background: T.surface,
                border: `1px solid ${T.borderHi}`,
                borderRadius: 8,
                fontSize: 12,
                color: T.textPrimary,
                fontFamily: "'IBM Plex Mono',monospace",
                padding: "8px 12px",
              }}
              itemStyle={{ color: T.textPrimary }}
              allowEscapeViewBox={{ x: true, y: true }}
              isAnimationActive={false}
            />
          </PieChart>
        </ResponsiveContainer>
        {/* Center label */}
        <div
          style={{
            position: "absolute",
            inset: 0,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              fontSize: 28,
              fontWeight: 700,
              color: T.textPrimary,
              fontFamily: "'Space Grotesk',sans-serif",
              letterSpacing: "-0.02em",
              lineHeight: 1,
            }}
          >
            {fmtNum(total)}
          </div>
          <div style={{ fontSize: 10, color: T.textMuted, fontFamily: "'IBM Plex Mono',monospace", marginTop: 3 }}>
            {totalLabel}
          </div>
        </div>
      </div>
      <div className="sp-donut-legend">
        {data.map((d, i) => {
          const active = activeName === d.name;
          const dim = !!activeName && !active;
          return (
            <button
              key={d.name}
              type="button"
              onClick={() => onSliceClick?.(d.name)}
              className={`sp-donut-legend-row${dim ? " dim" : ""}${active ? " active" : ""}`}
            >
              <span className="sp-donut-dot" style={{ background: palette[i % palette.length] }} />
              <span className="sp-donut-name" title={d.name}>
                {d.name}
              </span>
              <span className="sp-donut-count">{fmtNum(d.value)}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ── Not-protected hover row — UNCHANGED logic ─────────────────────────────────
function NotProtectedRow({
  count,
  hosts,
  loading,
}: {
  count: number;
  hosts: Array<{ hostname: string }>;
  loading?: boolean;
}) {
  const max = 20;
  const visible = hosts.slice(0, max);
  const extra = hosts.length - visible.length;
  return (
    <TooltipProvider delayDuration={150}>
      <UITooltip>
        <TooltipTrigger asChild>
          <div className="sp-np-row" style={{ cursor: "help" }}>
            <span style={{ color: T.danger, fontSize: 11 }}>Sem proteção</span>
            <span style={{ color: T.danger, fontWeight: 700, fontSize: 12 }}>{count}</span>
          </div>
        </TooltipTrigger>
        <TooltipContent
          side="top"
          style={{
            maxWidth: 260,
            background: T.surface,
            border: `1px solid ${T.borderHi}`,
            borderRadius: 8,
            padding: "10px 12px",
          }}
        >
          {loading ? (
            <div style={{ fontSize: 11, color: T.textMuted }}>Carregando lista de hosts…</div>
          ) : hosts.length === 0 ? (
            <div style={{ fontSize: 11, color: T.textMuted }}>Nenhum ativo sem proteção</div>
          ) : (
            <div style={{ fontSize: 11, display: "flex", flexDirection: "column", gap: 2 }}>
              {visible.map((h, i) => (
                <div
                  key={i}
                  style={{
                    fontFamily: "'IBM Plex Mono',monospace",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    color: T.textSecondary,
                  }}
                >
                  {h.hostname}
                </div>
              ))}
              {extra > 0 && <div style={{ color: T.textMuted, marginTop: 4 }}>… e mais {extra}</div>}
            </div>
          )}
        </TooltipContent>
      </UITooltip>
    </TooltipProvider>
  );
}

// ── Block Header ───────────────────────────────────────────────────────────────
function BlockHeader({
  id,
  title,
  onGrow,
  onShrink,
}: {
  id: string;
  title: React.ReactNode;
  onGrow: () => void;
  onShrink: () => void;
}) {
  return (
    <div className="sp-block-header">
      <div className="sp-block-title">
        <GripHorizontal size={11} color={T.textMuted} />
        <span>{title}</span>
      </div>
      <div className="sp-resize-ctrl">
        <button className="sp-resize-btn" onClick={onShrink} title="Diminuir">
          <Minimize2 size={11} />
        </button>
        <button className="sp-resize-btn" onClick={onGrow} title="Aumentar">
          <Maximize2 size={11} />
        </button>
      </div>
    </div>
  );
}

// ── Block loading / error placeholders ────────────────────────────────────────
function BlockSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="sp-block-body">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="sp-skel-row" style={{ width: `${90 - i * 11}%` }} />
      ))}
    </div>
  );
}

function BlockError({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="sp-block-body sp-block-error">
      <AlertTriangle size={16} color={T.danger} />
      <span style={{ fontSize: 12, color: T.danger }}>{message}</span>
      <button className="sp-sync-btn" onClick={onRetry}>
        <RefreshCw size={11} />
        Tentar novamente
      </button>
    </div>
  );
}

// ── Sort icon ──────────────────────────────────────────────────────────────────
type SortKey = "ts" | "host" | "user" | "type" | "threat" | "action";
type PolSortKey = "name" | "assigned_count";

function SortIcon({ active, dir }: { active: boolean; dir: "asc" | "desc" }) {
  if (!active) return <ArrowUpDown size={10} style={{ display: "inline", marginLeft: 2, opacity: 0.5 }} />;
  return dir === "asc" ? (
    <ArrowUp size={10} style={{ display: "inline", marginLeft: 2, color: T.accent }} />
  ) : (
    <ArrowDown size={10} style={{ display: "inline", marginLeft: 2, color: T.accent }} />
  );
}

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
  const { filters, dateRange } = useFilters();

  const [syncing, setSyncing] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [sortKey, setSortKey] = React.useState<SortKey>("ts");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");
  const [activeType, setActiveType] = React.useState<string | null>(null);
  const [activeDeviceStatus, setActiveDeviceStatus] = React.useState<string | null>(null);
  const [threatUser, setThreatUser] = React.useState<string | null>(null);
  const [polTab, setPolTab] = React.useState<"endpoint" | "server">("endpoint");
  const [polQuery, setPolQuery] = React.useState("");
  const [polSortKey, setPolSortKey] = React.useState<PolSortKey>("assigned_count");
  const [polSortDir, setPolSortDir] = React.useState<"asc" | "desc">("desc");
  const [draggedId, setDraggedId] = React.useState<string | null>(null);
  const [auditTypeQuery, setAuditTypeQuery] = React.useState("");
  const [auditUserQuery, setAuditUserQuery] = React.useState("");

  const defaultBlocks: DashboardBlock[] = React.useMemo(
    () => [
      { id: "kpis", title: "Métricas Gerais (KPIs)", size: "col-span-1 md:col-span-2 lg:col-span-6" },
      {
        id: "evolutivo",
        title: "Evolutivo — Bloqueadas vs Detectadas",
        size: "col-span-1 md:col-span-2 lg:col-span-6",
      },
      { id: "tipos", title: "Tipos de Eventos", size: "col-span-1 md:col-span-1 lg:col-span-3" },
      { id: "dispositivos", title: "Status dos Dispositivos", size: "col-span-1 md:col-span-1 lg:col-span-3" },
      { id: "criptografia", title: "Criptografia dos Dispositivos", size: "col-span-1 md:col-span-1 lg:col-span-3" },
      { id: "topusers", title: "Top 10 Usuários com Ameaças", size: "col-span-1 md:col-span-2 lg:col-span-6" },
      { id: "politicas", title: "Políticas", size: "col-span-1 md:col-span-2 lg:col-span-6" },
      { id: "detections", title: "Detecções Recentes", size: "col-span-1 md:col-span-1 lg:col-span-3" },
      { id: "auditoria", title: "Log de Auditoria", size: "col-span-1 md:col-span-1 lg:col-span-3" },
    ],
    [],
  );
  const [blocks, setBlocks] = React.useState<DashboardBlock[]>(defaultBlocks);

  const fromIso = dateRange.from.toISOString();
  const toIso = dateRange.to.toISOString();

  // ── Núcleo rápido (KPIs, evolutivo, tipos, dispositivos, criptografia,
  // top usuários) — uma única RPC de agregação. É o que controla o
  // carregamento inicial da página.
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["sophos-core", fromIso, toIso],
    queryFn: () => fetchCore({ data: { from: fromIso, to: toIso } }),
  });

  // ── Blocos pesados — cada um carrega em paralelo, de forma independente,
  // sem travar o núcleo nem os outros blocos.
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
  // Drill-down do Top 10: ameaças do usuário selecionado (só busca quando há um).
  const userThreatsQuery = useQuery({
    queryKey: ["sophos-user-threats", threatUser, fromIso, toIso],
    queryFn: () => fetchUserThreats({ data: { user: threatUser as string, from: fromIso, to: toIso } }),
    enabled: !!threatUser,
  });
  // Top 10 usuários com ameaças — já EXCLUINDO as exceções (RPC dedicada).
  const topUsersQuery = useQuery({
    queryKey: ["sophos-topusers", fromIso, toIso],
    queryFn: () => fetchTopUsers({ data: { from: fromIso, to: toIso } }),
    staleTime: 60_000,
  });

  const fetchLayout = useServerFn(getDashboardLayout);
  const saveLayoutFn = useServerFn(saveDashboardLayout);
  const qc = useQueryClient();
  const layoutQuery = useQuery({
    queryKey: ["dashboard-layout", LAYOUT_MODULE],
    queryFn: () => fetchLayout({ data: { module: LAYOUT_MODULE } }),
    staleTime: Infinity,
  });

  React.useEffect(() => {
    if (layoutQuery.data?.ok && layoutQuery.data.layout && Array.isArray(layoutQuery.data.layout)) {
      const saved = layoutQuery.data.layout as DashboardBlock[];
      const savedIds = new Set(saved.map((b) => b.id));
      const missing = defaultBlocks.filter((b) => !savedIds.has(b.id));
      setBlocks([...saved, ...missing]);
    }
  }, [layoutQuery.data, defaultBlocks]);

  const saveMutation = useMutation({
    mutationFn: (next: DashboardBlock[]) => saveLayoutFn({ data: { module: LAYOUT_MODULE, layout: next } }),
  });
  const saveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveLayout = (currentBlocks = blocks) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => saveMutation.mutate(currentBlocks), 400);
  };
  const resetLayout = async () => {
    setBlocks(defaultBlocks);
    await saveLayoutFn({ data: { module: LAYOUT_MODULE, layout: defaultBlocks } });
    qc.invalidateQueries({ queryKey: ["dashboard-layout", LAYOUT_MODULE] });
  };

  const changeBlockSize = (id: string, action: "grow" | "shrink") => {
    const nextBlocks = blocks.map((b) => {
      if (b.id !== id) return b;
      let size = b.size;
      if (action === "grow") {
        if (size.includes("lg:col-span-2")) size = "col-span-1 md:col-span-1 lg:col-span-3";
        else if (size.includes("lg:col-span-3")) size = "col-span-1 md:col-span-2 lg:col-span-6";
      } else {
        if (size.includes("lg:col-span-6")) size = "col-span-1 md:col-span-1 lg:col-span-3";
        else if (size.includes("lg:col-span-3")) size = "col-span-1 md:col-span-1 lg:col-span-2";
      }
      return { ...b, size };
    });
    setBlocks(nextBlocks);
    saveLayout(nextBlocks);
  };

  // Sincronização de auditoria não estar configurada/ativa é um estado
  // esperado (recurso opcional) — não vale poluir com toast de erro toda
  // vez que alguém clica "Sincronizar Agora" sem ter preenchido a aba
  // Auditoria em Integrações.
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
  const npData = notProtectedQuery.data && notProtectedQuery.data.ok ? notProtectedQuery.data : null;
  const auditData = auditQuery.data && auditQuery.data.ok ? auditQuery.data : null;

  const filteredDetections = React.useMemo(() => {
    const source = detData?.recentDetections ?? [];
    const q = query.trim().toLowerCase();
    let list = source;
    if (activeType) list = list.filter((r) => (r.type ?? "").toLowerCase().includes(activeType.toLowerCase()));
    if (q)
      list = list.filter((r) =>
        [r.ts, r.host, r.user, r.type, r.threat, r.action].some((v) => String(v).toLowerCase().includes(q)),
      );
    const dir = sortDir === "asc" ? 1 : -1;
    list = [...list].sort((a, b) => String(a[sortKey] ?? "").localeCompare(String(b[sortKey] ?? "")) * dir);
    return list;
  }, [detData, query, sortKey, sortDir, activeType]);

  // Busca livre sobre todos os dados retornados (sem restringir a sync por
  // domínio) — quem está em sophos_audit_events já está disponível aqui.
  const filteredAuditEvents = React.useMemo(() => {
    const source = auditData?.auditEvents ?? [];
    const typeQ = auditTypeQuery.trim().toLowerCase();
    const userQ = auditUserQuery.trim().toLowerCase();
    let list = source;
    if (typeQ) list = list.filter((e) => e.description.toLowerCase().includes(typeQ));
    if (userQ) list = list.filter((e) => e.modifiedBy.toLowerCase().includes(userQ));
    return list;
  }, [auditData, auditTypeQuery, auditUserQuery]);

  // ── Loading state ──────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div className="sp-root">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="sp-state">
          <div className="sp-state-icon" style={{ background: T.accentGlow, border: `1px solid rgba(59,130,246,0.3)` }}>
            <ShieldCheck size={18} color={T.accent} className="sp-spin" />
          </div>
          <span style={{ fontSize: 13, color: T.textSecondary }}>Carregando dados Sophos XDR…</span>
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (error || (data && !data.ok)) {
    const msg = data && !data.ok ? (data as any).error : ((error as Error)?.message ?? "Erro desconhecido");
    return (
      <div className="sp-root">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="sp-state">
          <div className="sp-state-icon" style={{ background: T.dangerBg, border: `1px solid rgba(239,68,68,0.3)` }}>
            <AlertTriangle size={18} color={T.danger} />
          </div>
          <span style={{ fontSize: 13, fontWeight: 600, color: T.danger }}>Falha ao carregar dados da API Sophos</span>
          <span style={{ fontSize: 11, color: T.textMuted, fontFamily: "'IBM Plex Mono',monospace" }}>{msg}</span>
          <button className="sp-sync-btn" style={{ marginTop: 8 }} onClick={handleSync} disabled={syncing}>
            <RefreshCw size={12} className={syncing ? "sp-spin" : ""} />
            {syncing ? "Sincronizando…" : "Tentar sincronizar agora"}
          </button>
        </div>
      </div>
    );
  }

  // ── Data — UNCHANGED derived logic ────────────────────────────────────────
  const d = okData as SophosCore;
  const pLabel = periodLabel(filters.period);

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

  const half = Math.ceil(polFiltered.length / 2);
  const polColA = polFiltered.slice(0, half);
  const polColB = polFiltered.slice(half);

  const encEndpoints = d.encryption?.endpoints ?? { encrypted: 0, unencrypted: 0, rate: 0 };
  const encServers = d.encryption?.servers ?? { encrypted: 0, unencrypted: 0, rate: 0 };
  const encrypted = d.encryption?.total?.encrypted ?? d.totals.encryptedDevices;
  const unencrypted = d.encryption?.total?.unencrypted ?? d.totals.unencryptedDevices;
  const unencByClass = d.encryption?.unencryptedByDeviceClass ?? { desktop: 0, notebook: 0 };
  const encLicense = d.encryption?.license ?? null;

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;
    const ci = blocks.findIndex((b) => b.id === draggedId);
    const ti = blocks.findIndex((b) => b.id === targetId);
    const next = [...blocks];
    const [removed] = next.splice(ci, 1);
    next.splice(ti, 0, removed);
    setBlocks(next);
    saveLayout(next);
  };

  const wrapperProps = (block: DashboardBlock) => ({
    draggable: true,
    onDragStart: () => setDraggedId(block.id),
    onDragOver: (e: React.DragEvent) => handleDragOver(e, block.id),
    onDragEnd: () => setDraggedId(null),
    className: `${block.size} sp-block${draggedId === block.id ? " dragging" : ""}`,
  });

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className="sp-root" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="sp-toolbar">
        <div className="sp-toolbar-left">
          <div className="sp-brand">
            <div className="sp-brand-icon">
              <ShieldCheck size={16} color={T.accent} />
            </div>
            <div>
              <div className="sp-brand-name">Sophos XDR</div>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginLeft: 8 }}>
            <div className="sp-live-dot" />
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
          <div className="sp-sync-info">
            {d.lastSyncAt ? `Sync: ${fmtTime(d.lastSyncAt)}` : "Sem sync"}
            {d.tenantId && d.tenantId !== "—" && ` · ${d.tenantId.slice(0, 8)}…`}
            {` · ${pLabel}`}
          </div>
        </div>
        <div className="sp-toolbar-right">
          <button className="sp-reset-btn" onClick={resetLayout}>
            Restaurar Layout
          </button>
          <button className="sp-sync-btn" onClick={handleSync} disabled={syncing || isFetching}>
            <RefreshCw size={12} className={syncing ? "sp-spin" : ""} />
            {syncing ? "Sincronizando…" : "Sincronizar Agora"}
          </button>
        </div>
      </div>

      {/* ── Active filters bar ───────────────────────────────────────────── */}
      {(activeType || activeDeviceStatus) && (
        <div className="sp-filter-bar">
          <span className="sp-filter-label">Filtros ativos:</span>
          {activeType && (
            <button className="sp-chip" onClick={() => setActiveType(null)}>
              Tipo: {activeType} <X size={9} />
            </button>
          )}
          {activeDeviceStatus && (
            <button className="sp-chip" onClick={() => setActiveDeviceStatus(null)}>
              Dispositivos: {activeDeviceStatus} <X size={9} />
            </button>
          )}
          <button
            className="sp-chip-clear"
            onClick={() => {
              setActiveType(null);
              setActiveDeviceStatus(null);
            }}
          >
            limpar tudo
          </button>
        </div>
      )}

      {/* ── Draggable grid ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4" style={{ gridAutoFlow: "row dense" }}>
        {blocks.map((block) => {
          /* ── KPIs ─────────────────────────────────────────────────────── */
          if (block.id === "kpis")
            return (
              <div key={block.id} {...wrapperProps(block)}>
                <BlockHeader
                  id={block.id}
                  title="Métricas Gerais"
                  onGrow={() => changeBlockSize(block.id, "grow")}
                  onShrink={() => changeBlockSize(block.id, "shrink")}
                />
                <div className="sp-block-body">
                  <div className="sp-kpi-grid">
                    {[
                      {
                        label: "Total Dispositivos",
                        value: fmtNum(d.endpoints.total + d.servers.total),
                        hint: `${fmtNum(
                          d.endpoints.inactive2w + d.endpoints.inactive2m + d.servers.inactive2w + d.servers.inactive2m,
                        )} inativos · ${fmtNum(d.endpoints.notProtected + d.servers.notProtected)} não protegidos`,
                        color: T.cyan,
                        icon: (
                          <div
                            className="sp-kpi-icon"
                            style={{ "--ki-bg": "rgba(34,211,238,0.18)" } as React.CSSProperties}
                          >
                            <Monitor size={22} color={T.cyan} />
                          </div>
                        ),
                      },
                      {
                        label: `Ameaças (${pLabel})`,
                        value: fmtNum(d.totals.threatsTotal),
                        hint: "eventos + alertas",
                        color: T.accent,
                        icon: (
                          <div
                            className="sp-kpi-icon"
                            style={{ "--ki-bg": "rgba(59,130,246,0.18)" } as React.CSSProperties}
                          >
                            <Activity size={22} color={T.accent} />
                          </div>
                        ),
                      },
                      {
                        label: "Bloq. Endpoints",
                        value: fmtNum(d.totals.threatsEndpoints),
                        color: T.warning,
                        icon: (
                          <div
                            className="sp-kpi-icon"
                            style={{ "--ki-bg": "rgba(245,158,11,0.2)" } as React.CSSProperties}
                          >
                            <Cpu size={22} color={T.warning} />
                          </div>
                        ),
                      },
                      {
                        label: "Bloq. Servidores",
                        value: fmtNum(d.totals.threatsServers),
                        color: T.purple,
                        icon: (
                          <div
                            className="sp-kpi-icon"
                            style={{ "--ki-bg": "rgba(167,139,250,0.18)" } as React.CSSProperties}
                          >
                            <Server size={22} color={T.purple} />
                          </div>
                        ),
                      },
                      {
                        label: `Alertas (${pLabel})`,
                        value: fmtNum(d.totals.alertsTotal),
                        color: T.danger,
                        icon: (
                          <div
                            className="sp-kpi-icon"
                            style={{ "--ki-bg": "rgba(239,68,68,0.18)" } as React.CSSProperties}
                          >
                            <AlertCircle size={22} color={T.danger} />
                          </div>
                        ),
                      },
                    ].map(({ label, value, hint, color, icon }) => (
                      <div key={label} className="sp-kpi" style={{ "--kc": color } as React.CSSProperties}>
                        {icon}
                        <div className="sp-kpi-label">{label}</div>
                        <div className="sp-kpi-value">{value}</div>
                        {hint && <div className="sp-kpi-hint">{hint}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            );

          /* ── EVOLUTIVO ────────────────────────────────────────────────── */
          if (block.id === "evolutivo")
            return (
              <div key={block.id} {...wrapperProps(block)}>
                <BlockHeader
                  id={block.id}
                  title={`Evolutivo — Bloqueadas vs Detectadas (${pLabel})`}
                  onGrow={() => changeBlockSize(block.id, "grow")}
                  onShrink={() => changeBlockSize(block.id, "shrink")}
                />
                <div className="sp-block-body" style={{ minHeight: 280 }}>
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={d.series} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="spBlocked" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={T.success} stopOpacity={0.3} />
                          <stop offset="100%" stopColor={T.success} stopOpacity={0.02} />
                        </linearGradient>
                        <linearGradient id="spDetected" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="0%" stopColor={T.danger} stopOpacity={0.3} />
                          <stop offset="100%" stopColor={T.danger} stopOpacity={0.02} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="2 4" stroke={T.chartGrid} vertical={false} />
                      <XAxis
                        dataKey="d"
                        stroke={T.chartAxis}
                        fontSize={10}
                        tick={{ fill: T.chartTick, fontFamily: "'IBM Plex Mono',monospace" }}
                        tickLine={false}
                        axisLine={{ stroke: T.chartAxis }}
                      />
                      <YAxis
                        stroke={T.chartAxis}
                        fontSize={10}
                        tick={{ fill: T.chartTick, fontFamily: "'IBM Plex Mono',monospace" }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => fmtNum(Number(v))}
                      />
                      <Tooltip content={<ExecTooltip />} cursor={{ stroke: T.borderHi, strokeWidth: 1 }} />
                      <Area
                        type="monotone"
                        dataKey="blocked"
                        name="Bloqueadas"
                        stroke={T.success}
                        fill="url(#spBlocked)"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, fill: T.success, stroke: T.surface, strokeWidth: 2 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="detected"
                        name="Alta sev."
                        stroke={T.danger}
                        fill="url(#spDetected)"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4, fill: T.danger, stroke: T.surface, strokeWidth: 2 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </div>
            );

          /* ── TIPOS ────────────────────────────────────────────────────── */
          if (block.id === "tipos")
            return (
              <div key={block.id} {...wrapperProps(block)}>
                <BlockHeader
                  id={block.id}
                  title={`Tipos de Eventos (${pLabel})`}
                  onGrow={() => changeBlockSize(block.id, "grow")}
                  onShrink={() => changeBlockSize(block.id, "shrink")}
                />
                <div className="sp-block-body">
                  <SegmentedRing
                    data={d.detectionTypes}
                    total={d.detectionTypes.reduce((s, x) => s + x.value, 0)}
                    totalLabel="eventos"
                    activeName={activeType}
                    onSliceClick={(name) => setActiveType((prev) => (prev === name ? null : name))}
                  />
                </div>
              </div>
            );

          /* ── DISPOSITIVOS ─────────────────────────────────────────────── */
          if (block.id === "dispositivos") {
            // Donut COMBINADO: cada fatia = endpoints + servidores daquele status.
            const statusDefs = [
              { name: "Ativo", key: "active" as const },
              { name: "Inativo 2+ Semanas", key: "inactive2w" as const },
              { name: "Inativo 2+ Meses", key: "inactive2m" as const },
              { name: "Não Protegido", key: "notProtected" as const },
            ];
            // Cor por NOME do status (mantém alinhamento mesmo se um status zerar e sumir).
            const statusColors: Record<string, string> = Object.fromEntries(
              statusDefs.map((s, i) => [s.name, DEVICE_STATUS_COLORS[i]]),
            );
            const deviceStatusData = statusDefs.map((s) => ({
              name: s.name,
              value: d.endpoints[s.key] + d.servers[s.key],
            }));
            const visibleStatus = deviceStatusData.filter((s) => s.value > 0);
            const grandTotal = d.endpoints.total + d.servers.total;
            // Status selecionado na legenda (null = sem filtro).
            const activeKey = statusDefs.find((s) => s.name === activeDeviceStatus)?.key ?? null;
            // Centro: total geral ou, se filtrado, o total do status (endpoints + servidores).
            const centerValue = activeKey ? d.endpoints[activeKey] + d.servers[activeKey] : grandTotal;
            const centerLabel = activeDeviceStatus ? "selecionados" : "dispositivos";

            const devCards = [
              { label: "Endpoints", dev: d.endpoints, hosts: npData?.notProtectedEndpoints ?? [] },
              { label: "Servidores", dev: d.servers, hosts: npData?.notProtectedServers ?? [] },
            ];

            return (
              <div key={block.id} {...wrapperProps(block)}>
                <BlockHeader
                  id={block.id}
                  title="Status dos Dispositivos"
                  onGrow={() => changeBlockSize(block.id, "grow")}
                  onShrink={() => changeBlockSize(block.id, "shrink")}
                />
                <div className="sp-block-body" style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                    {devCards.map(({ label, dev, hosts }) => (
                      <div
                        key={label}
                        className="sp-dev-card"
                        style={
                          activeKey && activeDeviceStatus
                            ? {
                                borderColor: statusColors[activeDeviceStatus],
                                boxShadow: `0 0 0 1px ${statusColors[activeDeviceStatus]}`,
                              }
                            : undefined
                        }
                      >
                        <div className="sp-dev-card-title">{label}</div>
                        {activeKey && activeDeviceStatus ? (
                          <>
                            <div className="sp-dev-card-val" style={{ color: statusColors[activeDeviceStatus] }}>
                              {fmtNum(dev[activeKey])}
                            </div>
                            <div className="sp-dev-row">
                              <span style={{ color: T.textMuted }}>{activeDeviceStatus}</span>
                              <span style={{ fontWeight: 600 }}>de {fmtNum(dev.total)}</span>
                            </div>
                          </>
                        ) : (
                          <>
                            <div className="sp-dev-card-val">{fmtNum(dev.total)}</div>
                            <div className="sp-dev-row">
                              <span className="sp-dev-ok">Ativos</span>
                              <span style={{ fontWeight: 600 }}>{dev.active}</span>
                            </div>
                            <NotProtectedRow
                              count={dev.notProtected}
                              hosts={hosts}
                              loading={notProtectedQuery.isLoading}
                            />
                          </>
                        )}
                      </div>
                    ))}
                  </div>
                  <ExecDonut
                    data={visibleStatus}
                    total={centerValue}
                    totalLabel={centerLabel}
                    activeName={activeDeviceStatus}
                    onSliceClick={(name) => setActiveDeviceStatus((prev) => (prev === name ? null : name))}
                    colors={visibleStatus.map((s) => statusColors[s.name])}
                  />
                </div>
              </div>
            );
          }

          /* ── CRIPTOGRAFIA ─────────────────────────────────────────────── */
          if (block.id === "criptografia")
            return (
              <div key={block.id} {...wrapperProps(block)}>
                <BlockHeader
                  id={block.id}
                  title="Criptografia dos Dispositivos"
                  onGrow={() => changeBlockSize(block.id, "grow")}
                  onShrink={() => changeBlockSize(block.id, "shrink")}
                />
                <div className="sp-block-body" style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  {/* ── Tiles por categoria (Opção A) ── */}
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
                    {[
                      { label: "Endpoints", dd: encEndpoints },
                      { label: "Servidores", dd: encServers },
                    ].map(({ label, dd }) => {
                      const tot = dd.encrypted + dd.unencrypted;
                      const encPctLocal = tot > 0 ? Math.round((dd.encrypted / tot) * 100) : dd.rate;
                      const unencPctLocal = tot > 0 ? Math.round((dd.unencrypted / tot) * 100) : 100 - dd.rate;
                      return (
                        <div
                          key={label}
                          className="sp-dev-card"
                          style={{ display: "flex", flexDirection: "column", gap: 10 }}
                        >
                          {/* Label */}
                          <div className="sp-dev-card-title" style={{ color: T.textPrimary }}>
                            {label}
                          </div>

                          {/* Two stat tiles */}
                          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 7 }}>
                            {/* Criptografado */}
                            <div
                              style={{
                                background: `${T.success}12`,
                                border: `1px solid ${T.success}33`,
                                borderRadius: 7,
                                padding: "10px 12px",
                                position: "relative",
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  position: "absolute",
                                  top: 0,
                                  left: 0,
                                  right: 0,
                                  height: 2,
                                  background: T.success,
                                }}
                              />
                              <div
                                style={{
                                  fontSize: 9,
                                  fontWeight: 700,
                                  letterSpacing: "0.1em",
                                  textTransform: "uppercase",
                                  color: T.success,
                                  fontFamily: "'IBM Plex Mono',monospace",
                                  marginBottom: 3,
                                  opacity: 0.8,
                                }}
                              >
                                Criptografado
                              </div>
                              <div
                                style={{
                                  fontSize: 20,
                                  fontWeight: 700,
                                  fontFamily: "'Space Grotesk',sans-serif",
                                  color: T.success,
                                  lineHeight: 1,
                                }}
                              >
                                {tot === 0 ? "—" : fmtNum(dd.encrypted)}
                              </div>
                              <div
                                style={{
                                  fontSize: 10,
                                  color: T.success,
                                  fontFamily: "'IBM Plex Mono',monospace",
                                  marginTop: 2,
                                  opacity: 0.8,
                                }}
                              >
                                {encPctLocal}% do total
                              </div>
                              <div
                                style={{
                                  height: 3,
                                  borderRadius: 2,
                                  background: `${T.success}30`,
                                  marginTop: 7,
                                  overflow: "hidden",
                                }}
                              >
                                <div
                                  style={{
                                    height: "100%",
                                    borderRadius: 2,
                                    background: T.success,
                                    width: `${encPctLocal}%`,
                                    transition: "width 0.6s ease",
                                  }}
                                />
                              </div>
                            </div>
                            {/* Sem cripto */}
                            <div
                              style={{
                                background: `${T.danger}12`,
                                border: `1px solid ${T.danger}33`,
                                borderRadius: 7,
                                padding: "10px 12px",
                                position: "relative",
                                overflow: "hidden",
                              }}
                            >
                              <div
                                style={{
                                  position: "absolute",
                                  top: 0,
                                  left: 0,
                                  right: 0,
                                  height: 2,
                                  background: T.danger,
                                }}
                              />
                              <div
                                style={{
                                  fontSize: 9,
                                  fontWeight: 700,
                                  letterSpacing: "0.1em",
                                  textTransform: "uppercase",
                                  color: T.danger,
                                  fontFamily: "'IBM Plex Mono',monospace",
                                  marginBottom: 3,
                                  opacity: 0.8,
                                }}
                              >
                                Sem cripto
                              </div>
                              <div
                                style={{
                                  fontSize: 20,
                                  fontWeight: 700,
                                  fontFamily: "'Space Grotesk',sans-serif",
                                  color: T.danger,
                                  lineHeight: 1,
                                }}
                              >
                                {tot === 0 ? "—" : fmtNum(dd.unencrypted)}
                              </div>
                              <div
                                style={{
                                  fontSize: 10,
                                  color: T.danger,
                                  fontFamily: "'IBM Plex Mono',monospace",
                                  marginTop: 2,
                                  opacity: 0.8,
                                }}
                              >
                                {unencPctLocal}% do total
                              </div>
                              <div
                                style={{
                                  height: 3,
                                  borderRadius: 2,
                                  background: `${T.danger}30`,
                                  marginTop: 7,
                                  overflow: "hidden",
                                }}
                              >
                                <div
                                  style={{
                                    height: "100%",
                                    borderRadius: 2,
                                    background: T.danger,
                                    width: `${unencPctLocal}%`,
                                    transition: "width 0.6s ease",
                                  }}
                                />
                              </div>
                            </div>
                          </div>

                          {/* Stacked bar */}
                          <div style={{ height: 18, borderRadius: 4, overflow: "hidden", display: "flex" }}>
                            <div
                              style={{
                                width: `${encPctLocal}%`,
                                background: T.success,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 9,
                                fontWeight: 700,
                                color: "rgba(255,255,255,0.9)",
                                fontFamily: "'IBM Plex Mono',monospace",
                                transition: "width 0.6s ease",
                              }}
                            >
                              {encPctLocal >= 15 ? `${encPctLocal}%` : ""}
                            </div>
                            <div
                              style={{
                                flex: 1,
                                background: T.danger,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: 9,
                                fontWeight: 700,
                                color: "rgba(255,255,255,0.9)",
                                fontFamily: "'IBM Plex Mono',monospace",
                              }}
                            >
                              {unencPctLocal >= 15 ? `${unencPctLocal}%` : ""}
                            </div>
                          </div>

                          {/* Footer counts */}
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              fontSize: 10,
                              fontFamily: "'IBM Plex Mono',monospace",
                              color: T.textMuted,
                            }}
                          >
                            <span style={{ color: T.success }}>{fmtNum(dd.encrypted)} criptografados</span>
                            <span style={{ color: T.danger }}>{fmtNum(dd.unencrypted)} sem cripto</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Total geral */}
                  <div
                    style={{
                      background: T.surfaceAlt,
                      border: `1px solid ${T.border}`,
                      borderRadius: 7,
                      padding: "9px 12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: "'IBM Plex Mono',monospace",
                        color: T.textMuted,
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                      }}
                    >
                      Total dispositivos
                    </span>
                    <span
                      style={{
                        fontSize: 13,
                        fontWeight: 700,
                        fontFamily: "'Space Grotesk',sans-serif",
                        color: T.textPrimary,
                      }}
                    >
                      {fmtNum(encrypted + unencrypted)}
                    </span>
                  </div>

                  {/* Sem cripto por classe de equipamento */}
                  <div
                    style={{
                      background: T.surfaceAlt,
                      border: `1px solid ${T.border}`,
                      borderRadius: 7,
                      padding: "9px 12px",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      flexWrap: "wrap",
                    }}
                  >
                    <span
                      style={{
                        fontSize: 10,
                        fontFamily: "'IBM Plex Mono',monospace",
                        color: T.textMuted,
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                      }}
                    >
                      Sem cripto por tipo
                    </span>
                    <div style={{ display: "flex", gap: 12 }}>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          fontFamily: "'Space Grotesk',sans-serif",
                          color: T.danger,
                        }}
                      >
                        {fmtNum(unencByClass.desktop)} <span style={{ fontWeight: 400 }}>desktops</span>
                      </span>
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 700,
                          fontFamily: "'Space Grotesk',sans-serif",
                          color: T.danger,
                        }}
                      >
                        {fmtNum(unencByClass.notebook)} <span style={{ fontWeight: 400 }}>notebooks</span>
                      </span>
                    </div>
                  </div>

                  {/* Licenças de criptografia (Central Device Encryption) */}
                  {encLicense &&
                    (() => {
                      const over = encLicense.used > encLicense.quantity;
                      const pct =
                        encLicense.quantity > 0 ? Math.round((encLicense.used / encLicense.quantity) * 100) : 0;
                      return (
                        <div
                          style={{
                            background: T.surfaceAlt,
                            border: `1px solid ${T.border}`,
                            borderRadius: 7,
                            padding: "9px 12px",
                            display: "flex",
                            flexDirection: "column",
                            gap: 8,
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span
                              style={{
                                fontSize: 10,
                                fontFamily: "'IBM Plex Mono',monospace",
                                color: T.textMuted,
                                textTransform: "uppercase",
                                letterSpacing: "0.1em",
                              }}
                            >
                              Licenças de criptografia
                            </span>
                            {over && (
                              <span
                                style={{
                                  fontSize: 9,
                                  fontWeight: 700,
                                  fontFamily: "'IBM Plex Mono',monospace",
                                  color: T.danger,
                                  textTransform: "uppercase",
                                }}
                              >
                                acima do contratado
                              </span>
                            )}
                          </div>

                          <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                            <span
                              style={{
                                fontSize: 20,
                                fontWeight: 700,
                                fontFamily: "'Space Grotesk',sans-serif",
                                color: over ? T.danger : T.textPrimary,
                              }}
                            >
                              {fmtNum(encLicense.used)}
                            </span>
                            <span
                              style={{
                                fontSize: 11,
                                fontFamily: "'IBM Plex Mono',monospace",
                                color: T.textMuted,
                              }}
                            >
                              em uso de {fmtNum(encLicense.quantity)} contratadas ({pct}%)
                            </span>
                          </div>

                          <div style={{ height: 5, borderRadius: 3, background: `${T.border}`, overflow: "hidden" }}>
                            <div
                              style={{
                                height: "100%",
                                borderRadius: 3,
                                background: over ? T.danger : T.accent,
                                width: `${Math.min(100, pct)}%`,
                                transition: "width 0.6s ease",
                              }}
                            />
                          </div>
                        </div>
                      );
                    })()}
                </div>
              </div>
            );

          /* ── TOP 10 USUÁRIOS ──────────────────────────────────────────── */
          if (block.id === "topusers") {
            // Fonte do Top 10 = RPC dedicada (já sem exceções). Fallback []: loading/erro.
            const topUsers = topUsersQuery.data && topUsersQuery.data.ok ? topUsersQuery.data.users : [];
            const maxCount = topUsers[0]?.count ?? 1;
            const detail = userThreatsQuery.data && userThreatsQuery.data.ok ? userThreatsQuery.data : null;
            const userTotal = threatUser ? (topUsers.find((u) => u.user === threatUser)?.count ?? null) : null;
            const sevTone = (sev: string) => {
              const s = sev.toLowerCase();
              return s === "high" || s === "critical"
                ? "danger"
                : s === "medium"
                  ? "warning"
                  : s === "low"
                    ? "ok"
                    : "info";
            };
            return (
              <div key={block.id} {...wrapperProps(block)}>
                <BlockHeader
                  id={block.id}
                  title={
                    threatUser ? `Ameaças de ${threatUser} (${pLabel})` : `Top 10 Usuários com Ameaças (${pLabel})`
                  }
                  onGrow={() => changeBlockSize(block.id, "grow")}
                  onShrink={() => changeBlockSize(block.id, "shrink")}
                />
                <div className="sp-block-body">
                  {threatUser ? (
                    <div className="sp-fadeup" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          onClick={() => setThreatUser(null)}
                          style={{
                            background: "transparent",
                            border: `1px solid ${T.border}`,
                            borderRadius: 6,
                            color: T.textSecondary,
                            fontSize: 11,
                            fontFamily: "'DM Sans',sans-serif",
                            padding: "5px 10px",
                            cursor: "pointer",
                          }}
                        >
                          ← Voltar
                        </button>
                        {userTotal != null && <span className="sp-badge warning">{fmtNum(userTotal)} ameaças</span>}
                        {detail && userTotal != null && detail.threats.length < userTotal && (
                          <span style={{ fontSize: 10, color: T.textMuted, fontFamily: "'IBM Plex Mono',monospace" }}>
                            mostrando as {fmtNum(detail.threats.length)} mais recentes
                          </span>
                        )}
                      </div>
                      {userThreatsQuery.isLoading ? (
                        <div className="sp-empty">Carregando ameaças…</div>
                      ) : !detail ? (
                        <div className="sp-empty">
                          {userThreatsQuery.data && !userThreatsQuery.data.ok
                            ? userThreatsQuery.data.error
                            : "Erro ao carregar ameaças."}
                        </div>
                      ) : detail.threats.length === 0 ? (
                        <div className="sp-empty">Nenhuma ameaça registrada para este usuário no período.</div>
                      ) : (
                        <div style={{ overflow: "auto", maxHeight: 320 }}>
                          <table className="sp-table">
                            <thead>
                              <tr>
                                <th style={{ paddingLeft: 4 }}>Quando</th>
                                <th>Ameaça</th>
                                <th>Tipo</th>
                                <th>Categoria</th>
                                <th>Severidade</th>
                                <th>Dispositivo</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detail.threats.map((r, i) => (
                                <tr key={i}>
                                  <td className="mono dim" style={{ paddingLeft: 4, whiteSpace: "nowrap" }}>
                                    {fmtTime(r.ts)}
                                  </td>
                                  <td className="trunc" style={{ maxWidth: 220 }} title={r.name}>
                                    {r.name}
                                  </td>
                                  <td style={{ whiteSpace: "nowrap" }}>{r.type}</td>
                                  <td className="dim">{r.category}</td>
                                  <td>
                                    <span className={`sp-badge ${sevTone(r.severity)}`}>{r.severity || "—"}</span>
                                  </td>
                                  <td className="mono trunc" style={{ maxWidth: 160 }} title={r.host}>
                                    {r.host}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ) : topUsersQuery.isLoading ? (
                    <div className="sp-empty">Carregando ameaças…</div>
                  ) : topUsersQuery.data && !topUsersQuery.data.ok ? (
                    <div className="sp-empty">
                      Erro ao carregar. A RPC <code>get_sophos_top_users_threats</code> já foi criada no banco?
                    </div>
                  ) : topUsers.length === 0 ? (
                    <div className="sp-empty">Sem dados de usuários no período.</div>
                  ) : (
                    topUsers.map((u, idx) => {
                      const pct = Math.max(2, (u.count / maxCount) * 100);
                      const colorByRank = idx === 0 ? T.danger : idx <= 2 ? T.warning : T.accent;
                      return (
                        <div
                          key={u.user}
                          className="sp-user-row"
                          role="button"
                          title={`Ver ameaças de ${u.user}`}
                          onClick={() => setThreatUser(u.user)}
                          style={{ cursor: "pointer" }}
                        >
                          <span
                            style={{
                              fontSize: 10,
                              fontFamily: "'IBM Plex Mono',monospace",
                              color: T.textSubtle,
                              width: 16,
                              textAlign: "right",
                              flexShrink: 0,
                            }}
                          >
                            {idx + 1}
                          </span>
                          <span className="sp-user-name" title={u.user}>
                            {u.user}
                          </span>
                          <div className="sp-user-bar-wrap">
                            <div
                              className="sp-user-bar"
                              style={{
                                width: `${pct}%`,
                                background: `linear-gradient(90deg,${colorByRank}88,${colorByRank})`,
                              }}
                            />
                          </div>
                          <span className="sp-user-count">{fmtNum(u.count)}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            );
          }

          /* ── POLÍTICAS ────────────────────────────────────────────────── */
          if (block.id === "politicas")
            return (
              <div key={block.id} {...wrapperProps(block)}>
                <BlockHeader
                  id={block.id}
                  title={
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
                      <span>Configuração de Políticas</span>
                      {polData && (
                        <div className="sp-search-wrap" style={{ marginLeft: "auto" }}>
                          <Search size={11} className="sp-search-icon" />
                          <input
                            className="sp-search"
                            placeholder="Buscar políticas…"
                            value={polQuery}
                            onChange={(e) => setPolQuery(e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  }
                  onGrow={() => changeBlockSize(block.id, "grow")}
                  onShrink={() => changeBlockSize(block.id, "shrink")}
                />
                {policiesQuery.isLoading ? (
                  <BlockSkeleton />
                ) : !polData ? (
                  <BlockError
                    message={
                      policiesQuery.error ? (policiesQuery.error as Error).message : "Erro ao carregar políticas"
                    }
                    onRetry={() => policiesQuery.refetch()}
                  />
                ) : (
                  <div
                    className="sp-fadeup"
                    style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
                  >
                    {/* Custom tabs */}
                    <div className="sp-pol-tabs">
                      {(["endpoint", "server"] as const).map((tab) => (
                        <button
                          key={tab}
                          className={`sp-pol-tab${polTab === tab ? " active" : ""}`}
                          onClick={() => setPolTab(tab)}
                        >
                          {tab === "endpoint"
                            ? `Endpoints (${polData.endpointPolicies})`
                            : `Servidores (${polData.serverPolicies})`}
                        </button>
                      ))}
                    </div>
                    <div className="sp-block-body" style={{ flex: 1, overflow: "hidden" }}>
                      {polFiltered.length === 0 ? (
                        <div className="sp-empty">Nenhuma política encontrada.</div>
                      ) : (
                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1fr 1fr",
                            gap: 16,
                            maxHeight: 260,
                            overflow: "auto",
                          }}
                        >
                          {[polColA, polColB].map((col, idx) => (
                            <table key={idx} className="sp-table">
                              <thead>
                                <tr>
                                  <th onClick={() => togglePolSort("name")}>
                                    Nome <SortIcon active={polSortKey === "name"} dir={polSortDir} />
                                  </th>
                                  <th style={{ textAlign: "right" }} onClick={() => togglePolSort("assigned_count")}>
                                    Atrib. <SortIcon active={polSortKey === "assigned_count"} dir={polSortDir} />
                                  </th>
                                </tr>
                              </thead>
                              <tbody>
                                {col.map((p) => (
                                  <tr key={p.id}>
                                    <td className="mono trunc" title={p.name}>
                                      {p.name}
                                    </td>
                                    <td className="mono" style={{ textAlign: "right", color: T.textSecondary }}>
                                      {fmtNum(p.assigned_count)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            );

          /* ── DETECÇÕES ────────────────────────────────────────────────── */
          if (block.id === "detections")
            return (
              <div key={block.id} {...wrapperProps(block)}>
                <BlockHeader
                  id={block.id}
                  title={
                    <div style={{ display: "flex", alignItems: "center", gap: 12, flex: 1 }}>
                      <span>Detecções Recentes{activeType ? ` — ${activeType}` : ""}</span>
                      {detData && (
                        <div className="sp-search-wrap" style={{ marginLeft: "auto" }}>
                          <Search size={11} className="sp-search-icon" />
                          <input
                            className="sp-search"
                            placeholder="Filtrar detecções…"
                            value={query}
                            onChange={(e) => setQuery(e.target.value)}
                          />
                        </div>
                      )}
                    </div>
                  }
                  onGrow={() => changeBlockSize(block.id, "grow")}
                  onShrink={() => changeBlockSize(block.id, "shrink")}
                />
                {detectionsQuery.isLoading ? (
                  <BlockSkeleton rows={6} />
                ) : !detData ? (
                  <BlockError
                    message={
                      detectionsQuery.error ? (detectionsQuery.error as Error).message : "Erro ao carregar detecções"
                    }
                    onRetry={() => detectionsQuery.refetch()}
                  />
                ) : (
                  <div className="sp-fadeup" style={{ flex: 1, overflow: "auto", maxHeight: 360 }}>
                    <table className="sp-table">
                      <thead>
                        <tr>
                          {(
                            [
                              ["ts", "Quando"],
                              ["host", "Dispositivo"],
                              ["user", "Usuário"],
                              ["type", "Tipo"],
                              ["threat", "Ameaça"],
                              ["action", "Ação"],
                            ] as Array<[SortKey, string]>
                          ).map(([k, label], i) => (
                            <th
                              key={k}
                              onClick={() => toggleSort(k)}
                              style={{ paddingLeft: i === 0 ? 16 : undefined, paddingRight: i === 5 ? 16 : undefined }}
                            >
                              {label} <SortIcon active={sortKey === k} dir={sortDir} />
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredDetections.length === 0 ? (
                          <tr>
                            <td colSpan={6}>
                              <div className="sp-empty">Nenhum registro de ameaça encontrado.</div>
                            </td>
                          </tr>
                        ) : (
                          filteredDetections.map((r, i) => {
                            const sevTone =
                              r.severity === "high" ? "danger" : r.severity === "medium" ? "warning" : "ok";
                            return (
                              <tr key={i}>
                                <td className="mono dim" style={{ paddingLeft: 16, whiteSpace: "nowrap" }}>
                                  {fmtTime(r.ts)}
                                </td>
                                <td className="mono">{r.host}</td>
                                <td className="dim trunc">{r.user}</td>
                                <td style={{ whiteSpace: "nowrap" }}>{r.type}</td>
                                <td className="mono dim trunc" style={{ maxWidth: 200 }} title={r.threat}>
                                  {r.threat}
                                </td>
                                <td style={{ paddingRight: 16 }}>
                                  <span className={`sp-badge ${sevTone}`}>{r.action}</span>
                                </td>
                              </tr>
                            );
                          })
                        )}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );

          /* ── AUDITORIA ────────────────────────────────────────────────── */
          if (block.id === "auditoria")
            return (
              <div key={block.id} {...wrapperProps(block)}>
                <BlockHeader
                  id={block.id}
                  title="Log de Auditoria"
                  onGrow={() => changeBlockSize(block.id, "grow")}
                  onShrink={() => changeBlockSize(block.id, "shrink")}
                />
                {auditQuery.isLoading ? (
                  <BlockSkeleton rows={6} />
                ) : !auditData ? (
                  <BlockError
                    message={auditQuery.error ? (auditQuery.error as Error).message : "Erro ao carregar auditoria"}
                    onRetry={() => auditQuery.refetch()}
                  />
                ) : (
                  <div
                    className="sp-fadeup"
                    style={{ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}
                  >
                    <div
                      style={{
                        display: "flex",
                        gap: 8,
                        padding: "10px 16px",
                        borderBottom: `1px solid ${T.border}`,
                        flexWrap: "wrap",
                      }}
                    >
                      <div className="sp-search-wrap" style={{ flex: 1, minWidth: 130 }}>
                        <Search size={11} className="sp-search-icon" />
                        <input
                          className="sp-search"
                          style={{ width: "100%" }}
                          placeholder="Tipo de evento…"
                          value={auditTypeQuery}
                          onChange={(e) => setAuditTypeQuery(e.target.value)}
                        />
                      </div>
                      <div className="sp-search-wrap" style={{ flex: 1, minWidth: 130 }}>
                        <Search size={11} className="sp-search-icon" />
                        <input
                          className="sp-search"
                          style={{ width: "100%" }}
                          placeholder="Modificado por…"
                          value={auditUserQuery}
                          onChange={(e) => setAuditUserQuery(e.target.value)}
                        />
                      </div>
                    </div>
                    <div style={{ flex: 1, overflow: "auto", maxHeight: 320 }}>
                      <table className="sp-table">
                        <thead>
                          <tr>
                            <th style={{ paddingLeft: 16 }}>Quando</th>
                            <th>Modificado por</th>
                            <th style={{ paddingRight: 16 }}>Evento</th>
                          </tr>
                        </thead>
                        <tbody>
                          {filteredAuditEvents.length === 0 ? (
                            <tr>
                              <td colSpan={3}>
                                <div className="sp-empty">Nenhum evento de auditoria encontrado.</div>
                              </td>
                            </tr>
                          ) : (
                            filteredAuditEvents.map((e) => (
                              <tr key={e.id}>
                                <td className="mono dim" style={{ paddingLeft: 16, whiteSpace: "nowrap" }}>
                                  {fmtTime(e.occurredAt)}
                                </td>
                                <td className="mono trunc" style={{ maxWidth: 150 }} title={e.modifiedBy}>
                                  {e.modifiedBy}
                                </td>
                                <td className="trunc" style={{ paddingRight: 16, maxWidth: 160 }} title={e.description}>
                                  {e.description}
                                </td>
                              </tr>
                            ))
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            );

          return null;
        })}
      </div>
    </div>
  );
}
