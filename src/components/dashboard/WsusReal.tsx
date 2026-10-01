import * as React from "react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getWsusOverview, deleteWsusServers, type WsusDetailRow } from "@/lib/wsus.functions";
import { usePermissions } from "@/lib/use-permissions";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import {
  Server,
  AlertTriangle,
  ShieldCheck,
  Activity,
  RefreshCw,
  Trash2,
  Search,
  GripHorizontal,
  Minimize2,
  Maximize2,
  CheckCircle2,
  XCircle,
  Clock,
} from "lucide-react";

// ── Design Tokens ──────────────────────────────────────────────────────────────
const T = {
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
  neutral: "#6B7280",
  textPrimary: "#F1F5F9",
  textSecondary: "#94A3B8",
  textMuted: "#F1F5F9",
  textSubtle: "#475569",
  chartGrid: "rgba(30,38,64,0.7)",
  chartAxis: "#334155",
  chartTick: "#64748B",
};

// ── CSS ────────────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');

  .ws-root { font-family:'DM Sans',sans-serif; color:${T.textPrimary}; display:flex; flex-direction:column; gap:16px; }
  .ws-root * { box-sizing:border-box; }

  @keyframes ws-spin  { to{transform:rotate(360deg)} }
  @keyframes ws-fadeup{ from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  .ws-spin    { animation:ws-spin 0.75s linear infinite; }
  .ws-fadeup  { animation:ws-fadeup 0.3s ease forwards; }

  .ws-root ::-webkit-scrollbar       { width:4px; height:4px; }
  .ws-root ::-webkit-scrollbar-track { background:transparent; }
  .ws-root ::-webkit-scrollbar-thumb { background:${T.borderHi}; border-radius:2px; }

  /* recharts */
  .ws-root .recharts-cartesian-axis-tick-value { fill:${T.chartTick} !important; font-size:10px; font-family:'IBM Plex Mono',monospace; }
  .ws-root .recharts-text { fill:${T.chartTick} !important; }
  .ws-root .recharts-label { fill:${T.textPrimary} !important; }
  .ws-root .recharts-text.recharts-label { fill:${T.textPrimary} !important; }
  .ws-root .recharts-legend-item-text { color:${T.textSecondary} !important; font-size:11px; }
  /* Nomes dos servidores (eixo Y do Top 15) — em branco */
  .ws-root .ws-server-axis .recharts-text { fill:${T.textPrimary} !important; }

  /* ── Page header ── */
  .ws-hdr {
    background:${T.surface}; border:1px solid ${T.border}; border-radius:12px;
    padding:16px 22px; display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap;
  }
  .ws-hdr-brand { display:flex; align-items:center; gap:12px; }
  .ws-hdr-icon  { width:40px; height:40px; border-radius:10px; display:flex; align-items:center; justify-content:center; background:${T.accentGlow}; border:1px solid rgba(59,130,246,0.3); flex-shrink:0; }
  .ws-hdr-title { font-size:15px; font-weight:700; color:${T.textPrimary}; font-family:'Space Grotesk',sans-serif; letter-spacing:-0.01em; }
  .ws-hdr-sub   { font-size:11px; color:${T.textMuted}; margin-top:2px; }

  /* ── KPI strip ── */
  .ws-kpi-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:12px; }
  .ws-kpi {
    background:${T.surface}; border:1px solid ${T.border}; border-radius:10px;
    padding:14px 18px; position:relative; overflow:hidden; transition:border-color 0.2s, box-shadow 0.2s;
  }
  .ws-kpi:hover { border-color:${T.borderHi}; box-shadow:0 8px 24px rgba(0,0,0,0.2); }
  .ws-kpi.clickable { cursor:pointer; }
  .ws-kpi.clickable:hover { transform:translateY(-2px); }
  .ws-kpi.sel { box-shadow:0 0 0 2px var(--kc,${T.accent}); border-color:var(--kc,${T.accent}); background:color-mix(in srgb, var(--kc,${T.accent}) 8%, ${T.surface}); }
  /* ── Active filter chip ── */
  .ws-filter-chip { display:inline-flex; align-items:center; gap:6px; padding:3px 9px; border-radius:5px; font-size:10px; font-weight:700; letter-spacing:0.04em; cursor:pointer; font-family:'IBM Plex Mono',monospace; border:1px solid var(--cc,${T.accent}); color:var(--cc,${T.accent}); background:color-mix(in srgb, var(--cc,${T.accent}) 12%, transparent); }
  .ws-filter-chip:hover { background:color-mix(in srgb, var(--cc,${T.accent}) 22%, transparent); }
  .ws-kpi::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; background:var(--kc,${T.accent}); }
  .ws-kpi-icon  { position:absolute; top:10px; right:10px; width:40px; height:40px; border-radius:9px; display:flex; align-items:center; justify-content:center; background:var(--ki-bg,${T.accentGlow}); }
  .ws-kpi-label { font-size:9px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; margin-bottom:5px; }
  .ws-kpi-value { font-size:26px; font-weight:700; font-family:'Space Grotesk',sans-serif; letter-spacing:-0.02em; line-height:1; color:var(--kc,${T.textPrimary}); }
  .ws-kpi-hint  { font-size:10px; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; margin-top:5px; }

  /* ── Block cards ── */
  .ws-block {
    background:${T.surface}; border:1px solid ${T.border}; border-radius:10px;
    display:flex; flex-direction:column; min-height:200px; resize:vertical; overflow:auto;
    transition:border-color 0.2s;
  }
  .ws-block:hover { border-color:${T.borderHi}; }
  .ws-block-hdr {
    display:flex; align-items:center; justify-content:space-between;
    padding:10px 16px; background:${T.surfaceAlt}; border-bottom:1px solid ${T.border};
    cursor:grab; user-select:none; flex-shrink:0; border-radius:10px 10px 0 0;
  }
  .ws-block-hdr:active { cursor:grabbing; }
  .ws-block-title { display:flex; align-items:center; gap:7px; font-size:11px; font-weight:700; color:${T.textPrimary}; text-transform:uppercase; letter-spacing:0.09em; font-family:'IBM Plex Mono',monospace; }
  .ws-resize-ctrl { display:flex; align-items:center; gap:2px; opacity:0; transition:opacity 0.15s; }
  .ws-block:hover .ws-resize-ctrl { opacity:1; }
  .ws-resize-btn { padding:2px; border:none; background:transparent; color:${T.textMuted}; cursor:pointer; border-radius:3px; line-height:0; transition:all 0.15s; }
  .ws-resize-btn:hover { color:${T.textPrimary}; background:rgba(255,255,255,0.07); }
  .ws-resize-btn:disabled { opacity:0.25; cursor:default; }
  .ws-block-body { flex:1; padding:16px; }

  /* ── Tooltip ── */
  .ws-tooltip { background:${T.surface}; border:1px solid ${T.borderHi}; border-radius:8px; padding:10px 14px; box-shadow:0 20px 40px rgba(0,0,0,0.5); }
  .ws-tooltip-label { font-size:10px; font-family:'IBM Plex Mono',monospace; color:${T.textMuted}; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:6px; }
  .ws-tooltip-row { display:flex; align-items:center; gap:6px; font-size:12px; margin-bottom:3px; }
  .ws-tooltip-dot { width:7px; height:7px; border-radius:2px; flex-shrink:0; }
  .ws-tooltip-name { color:${T.textSecondary}; font-size:11px; }
  .ws-tooltip-val  { color:${T.textPrimary}; font-weight:700; font-family:'IBM Plex Mono',monospace; margin-left:auto; }

  /* ── Coverage bar ── */
  .ws-cov-root { display:flex; flex-direction:column; gap:14px; width:100%; height:100%; justify-content:center; }
  .ws-cov-top  { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; }
  .ws-cov-num  { font-size:48px; font-weight:700; font-family:'Space Grotesk',sans-serif; letter-spacing:-0.03em; line-height:1; }
  .ws-cov-status { font-size:11px; font-weight:700; font-family:'IBM Plex Mono',monospace; letter-spacing:0.1em; text-transform:uppercase; margin-top:5px; }
  .ws-cov-desc { font-size:11px; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; margin-top:3px; }
  .ws-cov-meta { display:flex; flex-direction:column; align-items:flex-end; gap:5px; padding-top:4px; }
  .ws-cov-meta-row { font-size:11px; font-family:'IBM Plex Mono',monospace; color:${T.textSecondary}; }
  .ws-cov-meta-row span { color:${T.textPrimary}; font-weight:700; }
  .ws-cov-bar-wrap { position:relative; }
  .ws-cov-track { height:16px; background:${T.surfaceAlt}; border-radius:8px; overflow:hidden; border:1px solid ${T.border}; position:relative; }
  .ws-cov-zones { position:absolute; inset:0; display:flex; }
  .ws-cov-zone  { height:100%; }
  .ws-cov-fill  { height:100%; border-radius:8px; position:relative; z-index:1; transition:width 0.6s ease; }
  .ws-cov-markers { position:relative; height:22px; margin-top:3px; }
  .ws-cov-marker { position:absolute; display:flex; flex-direction:column; align-items:center; transform:translateX(-50%); }
  .ws-cov-marker-line { width:1px; height:6px; }
  .ws-cov-marker-label { font-size:9px; font-family:'IBM Plex Mono',monospace; font-weight:700; margin-top:1px; white-space:nowrap; }
  .ws-cov-legend { display:flex; align-items:center; gap:14px; flex-wrap:wrap; padding-top:4px; border-top:1px solid ${T.border}; }
  .ws-cov-leg-item { display:flex; align-items:center; gap:5px; font-size:11px; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; }
  .ws-cov-leg-dot { width:10px; height:4px; border-radius:2px; flex-shrink:0; }

  /* ── Panel ── */
  .ws-panel { background:${T.surface}; border:1px solid ${T.border}; border-radius:12px; overflow:hidden; }
  .ws-panel-hdr { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; padding:13px 20px; background:${T.surfaceAlt}; border-bottom:1px solid ${T.border}; }
  .ws-panel-title { display:flex; align-items:center; gap:8px; font-size:11px; font-weight:700; letter-spacing:0.09em; text-transform:uppercase; color:${T.textPrimary}; font-family:'IBM Plex Mono',monospace; }

  /* ── Toolbar ── */
  .ws-toolbar { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; }
  .ws-search-wrap { position:relative; display:inline-flex; align-items:center; }
  .ws-search-icon { position:absolute; left:9px; pointer-events:none; color:${T.textMuted}; }
  .ws-search { background:${T.surfaceAlt}; border:1px solid ${T.border}; border-radius:6px; padding:5px 10px 5px 29px; font-size:12px; font-family:'IBM Plex Mono',monospace; color:${T.textPrimary}; outline:none; transition:border-color 0.15s; width:240px; }
  .ws-search:focus { border-color:rgba(59,130,246,0.5); box-shadow:0 0 0 2px rgba(59,130,246,0.1); }
  .ws-search::placeholder { color:${T.textSubtle}; }

  /* ── Table ── */
  .ws-table { width:100%; border-collapse:collapse; }
  .ws-table thead { position:sticky; top:0; z-index:10; }
  .ws-table th { padding:8px 12px; font-size:9px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:${T.textPrimary}; font-family:'IBM Plex Mono',monospace; text-align:left; background:${T.surface}; border-bottom:1px solid ${T.border}; white-space:nowrap; }
  .ws-table th.r { text-align:right; }
  .ws-table th.c { text-align:center; }
  .ws-table td { padding:9px 12px; border-bottom:1px solid rgba(30,38,64,0.4); font-size:12px; color:${T.textPrimary}; vertical-align:middle; }
  .ws-table tbody tr:hover td { background:rgba(59,130,246,0.04); }
  .ws-table tbody tr:last-child td { border-bottom:none; }
  .ws-table .mono { font-family:'IBM Plex Mono',monospace; font-size:11px; }
  .ws-table .dim  { color:${T.textMuted}; }

  /* ── Badges ── */
  .ws-badge { display:inline-flex; align-items:center; gap:3px; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; font-family:'IBM Plex Mono',monospace; white-space:nowrap; }
  .ws-badge.ok      { background:${T.successBg}; color:${T.success}; border:1px solid rgba(16,185,129,0.22); }
  .ws-badge.warn    { background:${T.warningBg}; color:${T.warning}; border:1px solid rgba(245,158,11,0.22); }
  .ws-badge.danger  { background:${T.dangerBg};  color:${T.danger};  border:1px solid rgba(239,68,68,0.22); }
  .ws-badge.neutral { background:rgba(107,114,128,0.08); color:${T.neutral}; border:1px solid rgba(107,114,128,0.2); }

  /* ── Buttons ── */
  .ws-btn { display:inline-flex; align-items:center; gap:6px; padding:7px 14px; border-radius:7px; font-size:12px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; transition:all 0.15s; white-space:nowrap; }
  .ws-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .ws-btn.danger  { background:${T.dangerBg};  border:1px solid rgba(239,68,68,0.35);  color:${T.danger}; }
  .ws-btn.danger:hover:not(:disabled)  { background:rgba(239,68,68,0.2); }

  /* ── Empty ── */
  .ws-empty { padding:40px; text-align:center; color:${T.textMuted}; font-size:13px; }

  /* ── Coverage number ── */
  .ws-cov-num { font-size:44px; font-weight:700; font-family:'Space Grotesk',sans-serif; letter-spacing:-0.03em; line-height:1; }
  .ws-cov-label { font-size:12px; font-weight:600; font-family:'IBM Plex Mono',monospace; letter-spacing:0.06em; text-transform:uppercase; margin-top:4px; }
  .ws-cov-sub { font-size:11px; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; margin-top:6px; }
`;

// ── Tooltip ────────────────────────────────────────────────────────────────────
function ExecTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="ws-tooltip">
      <div className="ws-tooltip-label">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="ws-tooltip-row">
          <div className="ws-tooltip-dot" style={{ background: p.color || p.fill }} />
          <span className="ws-tooltip-name">{p.name}</span>
          <span className="ws-tooltip-val">{p.value?.toLocaleString("pt-BR")}</span>
        </div>
      ))}
    </div>
  );
}

// ── Resizable block ────────────────────────────────────────────────────────────
const COL_SIZES = ["col-span-1", "col-span-2", "col-span-3"] as const;
type ColSize = (typeof COL_SIZES)[number];
function Block({
  title,
  children,
  chartHeight = 280,
  defaultSize = "col-span-1" as ColSize,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  chartHeight?: number;
  defaultSize?: ColSize;
}) {
  const [size, setSize] = React.useState<ColSize>(defaultSize);
  return (
    <div className={`${size} ws-block`} style={{ minHeight: chartHeight + 52 }}>
      <div className="ws-block-hdr">
        <div className="ws-block-title">
          <GripHorizontal size={11} color={T.textMuted} />
          <span>{title}</span>
        </div>
        <div className="ws-resize-ctrl">
          <button
            className="ws-resize-btn"
            disabled={size === COL_SIZES[0]}
            onClick={() => setSize(COL_SIZES[Math.max(0, COL_SIZES.indexOf(size) - 1)])}
          >
            <Minimize2 size={11} />
          </button>
          <button
            className="ws-resize-btn"
            disabled={size === COL_SIZES[2]}
            onClick={() => setSize(COL_SIZES[Math.min(2, COL_SIZES.indexOf(size) + 1)])}
          >
            <Maximize2 size={11} />
          </button>
        </div>
      </div>
      <div className="ws-block-body" style={{ height: chartHeight }}>
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

// ── Coverage Gauge SVG ─────────────────────────────────────────────────────────
function CoverageBar({ pct, covered, total }: { pct: number; covered: number; total: number }) {
  const color = pct < 50 ? T.danger : pct < 85 ? T.warning : T.success;
  const status = pct < 50 ? "Crítico" : pct < 85 ? "Atenção" : "Meta atingida";
  const missing = Math.max(0, Math.round(total * 0.85) - covered);

  return (
    <div className="ws-cov-root">
      {/* Top row: big number + meta info */}
      <div className="ws-cov-top">
        <div>
          <div className="ws-cov-num" style={{ color }}>
            {pct.toFixed(1)}%
          </div>
          <div className="ws-cov-status" style={{ color }}>
            {status}
          </div>
          <div className="ws-cov-desc">
            {covered} de {total} servidores Windows do CMDB cobertos
          </div>
        </div>
        <div className="ws-cov-meta">
          <div className="ws-cov-meta-row">
            Meta: <span>85%</span>
          </div>
          <div className="ws-cov-meta-row">
            Cobertos: <span>{covered}</span>
          </div>
          <div className="ws-cov-meta-row">
            Total CMDB: <span>{total}</span>
          </div>
          {missing > 0 && (
            <div className="ws-cov-meta-row" style={{ color: T.danger }}>
              Faltam: <span style={{ color: T.danger }}>{missing}</span>
            </div>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="ws-cov-bar-wrap">
        <div className="ws-cov-track">
          {/* Zone backgrounds */}
          <div className="ws-cov-zones">
            <div className="ws-cov-zone" style={{ width: "50%", background: `${T.danger}18` }} />
            <div className="ws-cov-zone" style={{ width: "35%", background: `${T.warning}18` }} />
            <div className="ws-cov-zone" style={{ width: "15%", background: `${T.success}18` }} />
          </div>
          {/* Value fill */}
          <div
            className="ws-cov-fill"
            style={{
              width: `${Math.min(100, pct)}%`,
              background: `linear-gradient(90deg,${color}88,${color})`,
              boxShadow: `0 0 8px ${color}66`,
            }}
          />
        </div>
        {/* Markers */}
        <div className="ws-cov-markers">
          {[
            { p: 0, label: "0%", color: T.textMuted },
            { p: 50, label: "50%", color: T.danger },
            { p: 85, label: "85% ★", color: T.success },
            { p: 100, label: "100%", color: T.textMuted },
          ].map((m) => (
            <div key={m.p} className="ws-cov-marker" style={{ left: `${m.p}%` }}>
              <div className="ws-cov-marker-line" style={{ background: m.color }} />
              <span className="ws-cov-marker-label" style={{ color: m.color }}>
                {m.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="ws-cov-legend">
        {[
          { color: T.danger, label: "Crítico (<50%)" },
          { color: T.warning, label: "Atenção (50–85%)" },
          { color: T.success, label: "Meta (≥85%)" },
        ].map(({ color: c, label }) => (
          <span key={label} className="ws-cov-leg-item">
            <span className="ws-cov-leg-dot" style={{ background: c }} />
            {label}
          </span>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════
export function WsusDashboard() {
  // ── back-end UNCHANGED ─────────────────────────────────────────────────────
  const fetchOverview = useServerFn(getWsusOverview);
  const deleteServers = useServerFn(deleteWsusServers);
  const qc = useQueryClient();
  const { isAdmin } = usePermissions();
  const { data, isLoading } = useQuery({
    queryKey: ["wsus-overview"],
    queryFn: () => fetchOverview(),
  });

  const [search, setSearch] = React.useState("");
  const [kpiFilter, setKpiFilter] = React.useState<"all" | "failures" | "pending" | "alerts">("all");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [deleting, setDeleting] = React.useState(false);

  // Cada card-KPI vira um filtro do restante do módulo (tabela + Top 15).
  const matchesKpi = React.useCallback(
    (r: WsusDetailRow) =>
      kpiFilter === "failures"
        ? r.failed > 0
        : kpiFilter === "pending"
          ? r.needed > 0
          : kpiFilter === "alerts"
            ? r.has_alert === true
            : true,
    [kpiFilter],
  );

  const filteredDetails = (data?.details ?? []).filter((r: WsusDetailRow) => {
    if (!matchesKpi(r)) return false;
    return search ? r.computer_name.toLowerCase().includes(search.toLowerCase()) : true;
  });

  const toggleOne = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };
  const allSelected = filteredDetails.length > 0 && filteredDetails.every((r) => selected.has(r.computer_name));
  const toggleAll = () => {
    setSelected((prev) => {
      if (allSelected) {
        const next = new Set(prev);
        filteredDetails.forEach((r) => next.delete(r.computer_name));
        return next;
      }
      const next = new Set(prev);
      filteredDetails.forEach((r) => next.add(r.computer_name));
      return next;
    });
  };
  const handleDelete = async () => {
    const names = Array.from(selected);
    if (!names.length) return;
    if (!confirm(`Excluir ${names.length} servidor(es) do WSUS? Esta ação não pode ser desfeita.`)) return;
    setDeleting(true);
    try {
      await deleteServers({ data: { computerNames: names } });
      toast.success(`${names.length} servidor(es) excluído(s)`);
      setSelected(new Set());
      qc.invalidateQueries({ queryKey: ["wsus-overview"] });
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao excluir");
    } finally {
      setDeleting(false);
    }
  };
  // ──────────────────────────────────────────────────────────────────────────

  if (isLoading)
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "64px 0",
          gap: 8,
          color: T.textMuted,
          fontSize: 13,
          fontFamily: "'IBM Plex Mono',monospace",
        }}
      >
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <RefreshCw size={14} className="ws-spin" color={T.accent} /> Carregando dados WSUS…
      </div>
    );

  if (!data || data.totalServers === 0)
    return (
      <div className="ws-root">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div
          style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            padding: "40px 24px",
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
              background: T.accentGlow,
              border: "1px solid rgba(59,130,246,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Server size={20} color={T.accent} />
          </div>
          <div
            style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700, color: T.textPrimary }}
          >
            Nenhum dado WSUS importado
          </div>
          <div style={{ fontSize: 13, color: T.textMuted, maxWidth: 460, lineHeight: 1.6 }}>
            Vá em <strong style={{ color: T.textSecondary }}>Importar Dados</strong> → módulo{" "}
            <strong style={{ color: T.textSecondary }}>WSUS</strong> e envie um arquivo (CSV/XLSX/JSON) com as colunas:
            Computer Name, Needed, Installed/Not Applicable, Failed, No Status, Data.
          </div>
        </div>
      </div>
    );

  const pct = data.coveragePct;
  const totalNeeded = data.details.reduce((acc: number, r: WsusDetailRow) => acc + (r.needed ?? 0), 0);
  const patchedOk = data.details.filter(
    (r: WsusDetailRow) => r.installed_or_na > 0 && r.failed === 0 && !r.has_alert,
  ).length;

  // Top 15 reage ao card-KPI selecionado (quando "all", usa o pré-computado do back-end)
  const top15 =
    kpiFilter === "all"
      ? data.top15
      : [...data.details]
          .filter(matchesKpi)
          .sort((a, b) => b.not_installed - a.not_installed)
          .slice(0, 15)
          .map((r) => ({ computer_name: r.computer_name, not_installed: r.not_installed }));

  return (
    <div className="ws-root ws-fadeup">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="ws-hdr">
        <div className="ws-hdr-brand">
          <div className="ws-hdr-icon">
            <Server size={18} color={T.accent} />
          </div>
          <div>
            <div className="ws-hdr-title">WSUS — Windows Server Update Services</div>
            <div className="ws-hdr-sub">Cobertura e conformidade de atualizações</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 10px",
              borderRadius: 5,
              background: "rgba(107,114,128,0.08)",
              border: `1px solid ${T.border}`,
              fontSize: 11,
              fontFamily: "'IBM Plex Mono',monospace",
              color: T.textMuted,
              fontWeight: 700,
            }}
          >
            <Server size={11} /> {data.totalServers} servidores
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 10px",
              borderRadius: 5,
              background: pct >= 85 ? T.successBg : pct >= 50 ? T.warningBg : T.dangerBg,
              border: `1px solid ${pct >= 85 ? "rgba(16,185,129,0.25)" : pct >= 50 ? "rgba(245,158,11,0.25)" : "rgba(239,68,68,0.25)"}`,
              fontSize: 11,
              fontFamily: "'IBM Plex Mono',monospace",
              color: pct >= 85 ? T.success : pct >= 50 ? T.warning : T.danger,
              fontWeight: 700,
            }}
          >
            <ShieldCheck size={11} /> {pct.toFixed(1)}% cobertura
          </span>
        </div>
      </div>

      {/* ── KPIs ─────────────────────────────────────────────────────── */}
      <div className="ws-kpi-grid">
        <div
          className={`ws-kpi clickable${kpiFilter === "all" ? " sel" : ""}`}
          onClick={() => setKpiFilter("all")}
          title="Mostrar todos os servidores"
          style={{ "--kc": T.accent, "--ki-bg": "rgba(59,130,246,0.18)" } as React.CSSProperties}
        >
          <div className="ws-kpi-icon">
            <Server size={22} color={T.accent} />
          </div>
          <div className="ws-kpi-label">Total de Servidores</div>
          <div className="ws-kpi-value">{data.totalServers}</div>
          <div className="ws-kpi-hint">{data.cmdbActiveServers} Windows ativos no CMDB</div>
        </div>
        <div
          className="ws-kpi"
          title="Servidores com patches aplicados, sem falhas e sem alertas"
          style={{ "--kc": T.success, "--ki-bg": "rgba(16,185,129,0.18)" } as React.CSSProperties}
        >
          <div className="ws-kpi-icon">
            <CheckCircle2 size={22} color={T.success} />
          </div>
          <div className="ws-kpi-label">Servidores com Patchs Aplicados</div>
          <div className="ws-kpi-value">{patchedOk}</div>
          <div className="ws-kpi-hint">sem falhas e sem alertas</div>
        </div>
        <div
          className={`ws-kpi clickable${kpiFilter === "failures" ? " sel" : ""}`}
          onClick={() => setKpiFilter((f) => (f === "failures" ? "all" : "failures"))}
          title="Filtrar servidores com falhas"
          style={{ "--kc": T.danger, "--ki-bg": "rgba(239,68,68,0.18)" } as React.CSSProperties}
        >
          <div className="ws-kpi-icon">
            <XCircle size={22} color={T.danger} />
          </div>
          <div className="ws-kpi-label">Servidores com Falhas</div>
          <div className="ws-kpi-value">{data.serversWithFailures}</div>
          <div className="ws-kpi-hint">requerem atenção</div>
        </div>
        <div
          className={`ws-kpi clickable${kpiFilter === "pending" ? " sel" : ""}`}
          onClick={() => setKpiFilter((f) => (f === "pending" ? "all" : "pending"))}
          title="Filtrar servidores com updates pendentes"
          style={{ "--kc": T.warning, "--ki-bg": "rgba(245,158,11,0.2)" } as React.CSSProperties}
        >
          <div className="ws-kpi-icon">
            <Clock size={22} color={T.warning} />
          </div>
          <div className="ws-kpi-label">Updates Pendentes</div>
          <div className="ws-kpi-value">{totalNeeded.toLocaleString("pt-BR")}</div>
          <div className="ws-kpi-hint">updates necessários</div>
        </div>
        <div
          className={`ws-kpi clickable${kpiFilter === "alerts" ? " sel" : ""}`}
          onClick={() => setKpiFilter((f) => (f === "alerts" ? "all" : "alerts"))}
          title="Filtrar servidores com alertas"
          style={{ "--kc": T.warning, "--ki-bg": "rgba(245,158,11,0.2)" } as React.CSSProperties}
        >
          <div className="ws-kpi-icon">
            <AlertTriangle size={22} color={T.warning} />
          </div>
          <div className="ws-kpi-label">Servidores com Alertas</div>
          <div className="ws-kpi-value">{data.serversWithAlerts}</div>
          <div className="ws-kpi-hint">com pendências</div>
        </div>
      </div>

      {/* ── Charts grid ──────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        {/* Gauge cobertura */}
        <Block title="Cobertura WSUS vs CMDB" chartHeight={260} defaultSize="col-span-1">
          <CoverageBar pct={pct} covered={data.coveredCount} total={data.cmdbActiveServers} />
        </Block>

        {/* Top 15 bar chart */}
        <Block title="Top 15 — Updates Não Instalados" chartHeight={260} defaultSize="col-span-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={top15} layout="vertical" margin={{ top: 4, right: 36, left: 4, bottom: 4 }}>
              <defs>
                <linearGradient id="wsBarGrad" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor={T.warning} stopOpacity={0.45} />
                  <stop offset="100%" stopColor={T.warning} stopOpacity={1} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke={T.chartGrid} horizontal={false} />
              <XAxis type="number" {...axisProps} axisLine={false} />
              <YAxis
                className="ws-server-axis"
                type="category"
                dataKey="computer_name"
                stroke={T.chartAxis}
                fontSize={10}
                width={140}
                tick={{ fill: T.textPrimary, fontFamily: "'IBM Plex Mono',monospace" }}
                tickLine={false}
                axisLine={false}
              />
              <Tooltip content={<ExecTooltip />} cursor={{ fill: "rgba(59,130,246,0.05)" }} />
              <Bar dataKey="not_installed" name="Não instalados" fill="url(#wsBarGrad)" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Block>
      </div>

      {/* ── Detail table ─────────────────────────────────────────────── */}
      <div className="ws-panel">
        <div className="ws-panel-hdr">
          <div className="ws-panel-title">
            <Activity size={11} color={T.accent} />
            Detalhamento por Servidor
            <span style={{ fontWeight: 400, color: T.textSubtle }}>({filteredDetails.length} registros)</span>
            {kpiFilter !== "all" && (
              <span
                className="ws-filter-chip"
                onClick={() => setKpiFilter("all")}
                title="Limpar filtro"
                style={{ "--cc": kpiFilter === "failures" ? T.danger : T.warning } as React.CSSProperties}
              >
                {kpiFilter === "failures"
                  ? "Com falhas"
                  : kpiFilter === "pending"
                    ? "Updates pendentes"
                    : "Com alertas"}
                <XCircle size={11} />
              </span>
            )}
          </div>
          <div className="ws-toolbar">
            <div className="ws-search-wrap">
              <Search size={12} className="ws-search-icon" />
              <input
                className="ws-search"
                placeholder="Buscar servidor…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {isAdmin && (
              <button className="ws-btn danger" disabled={selected.size === 0 || deleting} onClick={handleDelete}>
                <Trash2 size={13} className={deleting ? "ws-spin" : ""} /> Excluir{" "}
                {selected.size > 0 ? `(${selected.size})` : ""}
              </button>
            )}
          </div>
        </div>

        <div style={{ overflowX: "auto", maxHeight: 520, overflowY: "auto" }}>
          <table className="ws-table">
            <thead>
              <tr>
                {isAdmin && <th style={{ width: 36, paddingLeft: 16 }}></th>}
                <th style={{ paddingLeft: isAdmin ? 8 : 18 }}>Servidor</th>
                <th className="r">Patchs Aplicados</th>
                <th className="r">Pendente</th>
                <th className="r">Falhou</th>
                <th className="r">Patchs Sem Validação</th>
                <th className="c">Última Coleta</th>
                <th>Ativo CMDB</th>
              </tr>
            </thead>
            <tbody>
              {filteredDetails.map((r: WsusDetailRow) => (
                <tr key={r.computer_name}>
                  {isAdmin && (
                    <td style={{ paddingLeft: 16 }}>
                      <Checkbox
                        checked={selected.has(r.computer_name)}
                        onCheckedChange={() => toggleOne(r.computer_name)}
                        aria-label={`Selecionar ${r.computer_name}`}
                      />
                    </td>
                  )}
                  <td className="mono" style={{ paddingLeft: isAdmin ? 8 : 18, fontWeight: 500 }}>
                    {r.computer_name}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {r.installed_or_na > 0 ? (
                      <span className="ws-badge ok">{r.installed_or_na}</span>
                    ) : (
                      <span className="mono dim">0</span>
                    )}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {r.needed > 0 ? (
                      <span className="ws-badge warn">{r.needed}</span>
                    ) : (
                      <span className="mono dim">0</span>
                    )}
                  </td>
                  <td style={{ textAlign: "right" }}>
                    {r.failed > 0 ? (
                      <span className="ws-badge danger">{r.failed}</span>
                    ) : (
                      <span className="mono dim">0</span>
                    )}
                  </td>
                  <td className="mono dim" style={{ textAlign: "right" }}>
                    {r.no_status}
                  </td>
                  <td className="mono dim" style={{ textAlign: "center" }}>
                    {r.last_report_at ? new Date(r.last_report_at).toLocaleDateString("pt-BR") : "—"}
                  </td>
                  <td>
                    {r.matched_in_cmdb ? (
                      <span className="ws-badge ok">
                        <CheckCircle2 size={9} /> Sim
                      </span>
                    ) : (
                      <span className="ws-badge neutral">Não</span>
                    )}
                  </td>
                </tr>
              ))}
              {filteredDetails.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 8 : 7}>
                    <div className="ws-empty">Nenhum servidor encontrado.</div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {isAdmin && filteredDetails.length > 0 && (
          <div
            style={{
              padding: "10px 16px",
              borderTop: `1px solid ${T.border}`,
              display: "flex",
              alignItems: "center",
              gap: 10,
            }}
          >
            <Checkbox checked={allSelected} onCheckedChange={toggleAll} aria-label="Selecionar todos" />
            <span style={{ fontSize: 11, color: T.textMuted, fontFamily: "'IBM Plex Mono',monospace" }}>
              {allSelected ? "Desmarcar todos" : `Selecionar todos (${filteredDetails.length})`}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
