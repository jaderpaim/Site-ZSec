import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { gmudMetrics } from "@/lib/gmud.functions";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from "recharts";
import {
  Maximize2,
  Minimize2,
  GripHorizontal,
  Activity,
  CheckCircle2,
  Clock,
  RotateCcw,
  AlertTriangle,
} from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

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
  purpleBg: "rgba(167,139,250,0.10)",
  neutral: "#6B7280",
  textPrimary: "#F1F5F9",
  textSecondary: "#F1F5F9",
  textMuted: "#F1F5F9",
  textSubtle: "#F1F5F9",
  chartGrid: "rgba(30,38,64,0.7)",
  chartAxis: "#334155",
  chartTick: "#64748B",
};

const tipoColor: Record<string, string> = {
  Normal: T.accent,
  Prioritária: T.warning,
  Emergencial: T.danger,
};

// ── CSS ────────────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');

  .gdt-root { font-family:'DM Sans',sans-serif; color:${T.textPrimary}; display:flex; flex-direction:column; gap:16px; }
  .gdt-root * { box-sizing:border-box; }

  /* scrollbar */
  .gdt-root ::-webkit-scrollbar       { width:4px; height:4px; }
  .gdt-root ::-webkit-scrollbar-track { background:transparent; }
  .gdt-root ::-webkit-scrollbar-thumb { background:${T.borderHi}; border-radius:2px; }

  /* recharts overrides */
  .gdt-root .recharts-cartesian-axis-tick-value { fill:${T.chartTick} !important; font-size:10px; font-family:'IBM Plex Mono',monospace; }
  .gdt-root .recharts-text { fill:${T.chartTick} !important; }
  .gdt-root .recharts-legend-item-text { color:${T.textSecondary} !important; font-size:11px; font-family:'IBM Plex Mono',monospace; }

  /* ── Period selector ── */
  .gdt-period-bar {
    display:flex; align-items:center; justify-content:flex-end; gap:6px;
  }
  .gdt-period-btn {
    padding:5px 14px; border-radius:6px; font-size:11px; font-weight:600;
    border:1px solid ${T.border}; cursor:pointer; font-family:'IBM Plex Mono',monospace;
    transition:all 0.15s; color:${T.textMuted}; background:transparent; letter-spacing:0.04em;
  }
  .gdt-period-btn.active { background:${T.accentGlow}; border-color:rgba(59,130,246,0.4); color:${T.accent}; }
  .gdt-period-btn:hover:not(.active) { border-color:${T.borderHi}; color:${T.textSecondary}; }

  /* ── KPI strip ── */
  .gdt-kpi-row { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
  .gdt-kpi {
    background:${T.surface}; border:1px solid ${T.border}; border-radius:10px;
    padding:14px 18px; position:relative; overflow:hidden; transition:border-color 0.2s;
  }
  .gdt-kpi:hover { border-color:${T.borderHi}; }
  .gdt-kpi::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; background:var(--kc,${T.accent}); }
  .gdt-kpi-icon  { position:absolute; top:10px; right:10px; width:40px; height:40px; border-radius:9px; display:flex; align-items:center; justify-content:center; background:var(--ki-bg,rgba(59,130,246,0.18)); }
  .gdt-kpi-label { font-size:9px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; margin-bottom:5px; }
  .gdt-kpi-value { font-size:26px; font-weight:700; font-family:'Space Grotesk',sans-serif; letter-spacing:-0.02em; line-height:1; color:var(--kc,${T.textPrimary}); }
  .gdt-kpi-sub   { display:flex; align-items:center; gap:8px; margin-top:6px; font-size:11px; font-family:'IBM Plex Mono',monospace; }

  /* ── Block card ── */
  .gdt-block {
    background:${T.surface}; border:1px solid ${T.border}; border-radius:10px;
    display:flex; flex-direction:column; min-height:200px; resize:vertical; overflow:auto;
    transition:border-color 0.2s;
  }
  .gdt-block:hover { border-color:${T.borderHi}; }

  .gdt-block-hdr {
    display:flex; align-items:center; justify-content:space-between;
    padding:10px 16px; background:${T.surfaceAlt}; border-bottom:1px solid ${T.border};
    cursor:grab; user-select:none; flex-shrink:0; border-radius:10px 10px 0 0;
  }
  .gdt-block-hdr:active { cursor:grabbing; }
  .gdt-block-title { display:flex; align-items:center; gap:7px; font-size:11px; font-weight:600; color:${T.textMuted}; text-transform:uppercase; letter-spacing:0.09em; font-family:'IBM Plex Mono',monospace; }

  .gdt-resize-ctrl { display:flex; align-items:center; gap:2px; opacity:0; transition:opacity 0.15s; }
  .gdt-block:hover .gdt-resize-ctrl { opacity:1; }
  .gdt-resize-btn { padding:2px; border:none; background:transparent; color:${T.textMuted}; cursor:pointer; border-radius:3px; line-height:0; transition:color 0.15s,background 0.15s; }
  .gdt-resize-btn:hover { color:${T.textPrimary}; background:rgba(255,255,255,0.07); }
  .gdt-resize-btn:disabled { opacity:0.25; cursor:default; }

  .gdt-block-body { flex:1; padding:16px; }

  /* ── Tipo filter chip ── */
  .gdt-tipo-chip {
    display:inline-flex; align-items:center; gap:5px; padding:2px 8px; border-radius:4px;
    font-size:10px; font-weight:700; letter-spacing:0.07em; text-transform:uppercase;
    font-family:'IBM Plex Mono',monospace; cursor:pointer; transition:all 0.15s;
  }
  .gdt-tipo-chip:hover { filter:brightness(1.2); }

  /* ── Horizontal bar chart (Tipo) ── */
  .gdt-tipo-bars { display:flex; flex-direction:column; gap:0; padding:0; width:100%; }
  .gdt-tipo-row  { display:flex; align-items:center; gap:10px; cursor:pointer; border-radius:6px; padding:10px 6px; transition:background 0.1s; flex:1; }
  .gdt-tipo-row:hover { background:rgba(59,130,246,0.05); }
  .gdt-tipo-row.active { background:rgba(59,130,246,0.06); }
  .gdt-tipo-row-label {
    font-size:13px; color:${T.textSecondary}; width:104px; flex-shrink:0;
    font-family:'DM Sans',sans-serif; font-weight:500;
    transition:color 0.15s;
  }
  .gdt-tipo-row.active .gdt-tipo-row-label { color:${T.textPrimary}; font-weight:600; }
  .gdt-tipo-track {
    flex:1; height:26px; background:rgba(30,38,64,0.55);
    border-radius:5px; overflow:hidden; position:relative;
  }
  .gdt-tipo-fill {
    height:100%; border-radius:5px;
    display:flex; align-items:center; padding-left:9px;
    min-width:40px; transition:width 0.5s ease;
  }
  .gdt-tipo-fill-label {
    font-size:11px; font-weight:700; color:rgba(255,255,255,0.95);
    font-family:'IBM Plex Mono',monospace; letter-spacing:0.04em; white-space:nowrap;
  }
  .gdt-tipo-count {
    font-size:13px; font-weight:700; font-family:'IBM Plex Mono',monospace;
    color:${T.textPrimary}; width:40px; text-align:right; flex-shrink:0;
  }
  .gdt-tipo-total {
    margin-top:16px; padding-top:12px; border-top:1px solid ${T.border};
    display:flex; align-items:center; justify-content:space-between;
    font-size:10px; font-family:'IBM Plex Mono',monospace;
    color:${T.textMuted}; letter-spacing:0.08em; text-transform:uppercase;
  }
  .gdt-tipo-total-val {
    font-size:18px; font-weight:700; font-family:'Space Grotesk',sans-serif;
    letter-spacing:-0.02em; color:${T.textPrimary};
  }

  /* ── Tooltip ── */
  .gdt-tooltip { background:${T.surface}; border:1px solid ${T.borderHi}; border-radius:8px; padding:10px 14px; font-family:'DM Sans',sans-serif; box-shadow:0 20px 40px rgba(0,0,0,0.5); min-width:150px; }
  .gdt-tooltip-label { font-size:10px; font-family:'IBM Plex Mono',monospace; color:${T.textMuted}; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:6px; }
  .gdt-tooltip-row   { display:flex; align-items:center; gap:6px; font-size:12px; margin-bottom:3px; }
  .gdt-tooltip-dot   { width:7px; height:7px; border-radius:2px; flex-shrink:0; }
  .gdt-tooltip-name  { color:${T.textSecondary}; font-size:11px; }
  .gdt-tooltip-val   { color:${T.textPrimary}; font-weight:700; font-family:'IBM Plex Mono',monospace; margin-left:auto; }

  /* ── Gargalos table ── */
  .gdt-panel { background:${T.surface}; border:1px solid ${T.border}; border-radius:10px; overflow:hidden; }
  .gdt-panel-hdr { display:flex; align-items:center; justify-content:space-between; padding:12px 18px; background:${T.surfaceAlt}; border-bottom:1px solid ${T.border}; }
  .gdt-panel-title { display:flex; align-items:center; gap:7px; font-size:11px; font-weight:700; letter-spacing:0.09em; text-transform:uppercase; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; }
  .gdt-table { width:100%; border-collapse:collapse; }
  .gdt-table th { padding:8px 14px; font-size:9px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; text-align:left; background:${T.surface}; border-bottom:1px solid ${T.border}; }
  .gdt-table th.right { text-align:right; }
  .gdt-table td { padding:10px 14px; border-bottom:1px solid rgba(30,38,64,0.4); font-size:12px; color:${T.textPrimary}; }
  .gdt-table tbody tr:hover td { background:rgba(59,130,246,0.04); }
  .gdt-table tbody tr:last-child td { border-bottom:none; }
  .gdt-table .mono { font-family:'IBM Plex Mono',monospace; font-size:11px; }
  .gdt-table .dim  { color:${T.textMuted}; }

  /* ── Empty ── */
  .gdt-empty { padding:32px; text-align:center; color:${T.textMuted}; font-size:12px; font-family:'DM Sans',sans-serif; }
`;

// ── Custom tooltip ─────────────────────────────────────────────────────────────
function ExecTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="gdt-tooltip">
      <div className="gdt-tooltip-label">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="gdt-tooltip-row">
          <div className="gdt-tooltip-dot" style={{ background: p.color }} />
          <span className="gdt-tooltip-name">{p.name}</span>
          <span className="gdt-tooltip-val">{p.value}</span>
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
    <div className={`${size} gdt-block`} style={{ minHeight: chartHeight + 52 }}>
      <div className="gdt-block-hdr">
        <div className="gdt-block-title">
          <GripHorizontal size={11} color={T.textMuted} />
          <span>{title}</span>
          {extra}
        </div>
        <div className="gdt-resize-ctrl">
          <button
            className="gdt-resize-btn"
            disabled={size === COL_SIZES[0]}
            onClick={() => setSize(COL_SIZES[Math.max(0, COL_SIZES.indexOf(size) - 1)])}
          >
            <Minimize2 size={11} />
          </button>
          <button
            className="gdt-resize-btn"
            disabled={size === COL_SIZES[2]}
            onClick={() => setSize(COL_SIZES[Math.min(2, COL_SIZES.indexOf(size) + 1)])}
          >
            <Maximize2 size={11} />
          </button>
        </div>
      </div>
      <div className="gdt-block-body" style={{ height: chartHeight }}>
        {children}
      </div>
    </div>
  );
}

// ── Axis props ─────────────────────────────────────────────────────────────────
const axisProps = {
  stroke: T.chartAxis,
  fontSize: 10,
  tick: { fill: T.chartTick, fontFamily: "'IBM Plex Mono',monospace" },
  tickLine: false,
  axisLine: { stroke: T.chartAxis },
};

// ── DASHBOARD TAB ──────────────────────────────────────────────────────────────
export function GmudDashboardTab() {
  // ── back-end UNCHANGED ────────────────────────────────────────────────────
  const metrics = useServerFn(gmudMetrics);
  const [days, setDays] = React.useState(30);
  const [tipoFilter, setTipoFilter] = React.useState<string | null>(null);

  function handleTipoClick(tipo: string | null) {
    setTipoFilter((prev) => {
      const next = prev === tipo ? null : tipo;
      window.dispatchEvent(new CustomEvent("gmud-tipo-filter", { detail: next }));
      return next;
    });
  }

  const q = useQuery({
    queryKey: ["gmud-metrics", days],
    queryFn: () => metrics({ data: { days } }),
    refetchInterval: 60_000,
  });
  const m = q.data;
  // ─────────────────────────────────────────────────────────────────────────

  const tiposData = m?.tipos ?? [];

  const [tipoColSize, setTipoColSize] = React.useState<ColSize>("col-span-1");

  const PERIOD_OPTIONS = [
    { value: 7, label: "7d" },
    { value: 30, label: "30d" },
    { value: 90, label: "90d" },
    { value: 180, label: "180d" },
  ];

  return (
    <div className="gdt-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Period selector ────────────────────────────────────────────── */}
      <div className="gdt-period-bar">
        {PERIOD_OPTIONS.map((o) => (
          <button
            key={o.value}
            className={`gdt-period-btn${days === o.value ? " active" : ""}`}
            onClick={() => setDays(o.value)}
          >
            {o.label}
          </button>
        ))}
      </div>

      {/* ── KPIs ───────────────────────────────────────────────────────── */}
      <div className="gdt-kpi-row">
        <div className="gdt-kpi" style={{ "--kc": T.accent } as React.CSSProperties}>
          <div className="gdt-kpi-icon" style={{ "--ki-bg": "rgba(59,130,246,0.18)" } as React.CSSProperties}>
            <Activity size={22} color={T.accent} />
          </div>
          <div className="gdt-kpi-label">Total no período</div>
          <div className="gdt-kpi-value">{m?.total ?? "—"}</div>
        </div>
        <div className="gdt-kpi" style={{ "--kc": T.success } as React.CSSProperties}>
          <div className="gdt-kpi-icon" style={{ "--ki-bg": "rgba(16,185,129,0.18)" } as React.CSSProperties}>
            <CheckCircle2 size={22} color={T.success} />
          </div>
          <div className="gdt-kpi-label">Taxa de sucesso</div>
          <div className="gdt-kpi-value">{m ? `${m.taxaSucesso}%` : "—"}</div>
          <div className="gdt-kpi-sub">
            <span style={{ color: T.success }}>✓ {m?.concluidas ?? 0}</span>
            <span style={{ color: T.textSubtle }}>·</span>
            <span style={{ color: T.danger }}>↩ {m?.rollback ?? 0}</span>
          </div>
        </div>
        <div className="gdt-kpi" style={{ "--kc": T.warning } as React.CSSProperties}>
          <div className="gdt-kpi-icon" style={{ "--ki-bg": "rgba(245,158,11,0.2)" } as React.CSSProperties}>
            <Clock size={22} color={T.warning} />
          </div>
          <div className="gdt-kpi-label">Tempo médio aprovação</div>
          <div className="gdt-kpi-value">{m ? `${m.mediaAprovHoras}h` : "—"}</div>
        </div>
        <div className="gdt-kpi" style={{ "--kc": T.purple } as React.CSSProperties}>
          <div className="gdt-kpi-icon" style={{ "--ki-bg": "rgba(167,139,250,0.18)" } as React.CSSProperties}>
            <RotateCcw size={22} color={T.purple} />
          </div>
          <div className="gdt-kpi-label">Em execução agora</div>
          <div className="gdt-kpi-value">{m?.emExecucao ?? "—"}</div>
        </div>
      </div>

      {/* ── Charts grid ────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4" style={{ gridAutoFlow: "row dense" }}>
        {/* ── Distribuição por Tipo — barras horizontais ── */}
        <div className={`${tipoColSize} gdt-block`}>
          <div className="gdt-block-hdr">
            <div className="gdt-block-title">
              <GripHorizontal size={11} color={T.textMuted} />
              <span>Distribuição por Tipo</span>
              {tipoFilter && (
                <span
                  className="gdt-tipo-chip"
                  style={{
                    color: tipoColor[tipoFilter] ?? T.accent,
                    border: `1px solid ${tipoColor[tipoFilter] ?? T.accent}`,
                    background: (tipoColor[tipoFilter] ?? T.accent) + "22",
                  }}
                  onClick={() => handleTipoClick(null)}
                >
                  {tipoFilter} ✕
                </span>
              )}
            </div>
            <div className="gdt-resize-ctrl">
              <button
                className="gdt-resize-btn"
                disabled={tipoColSize === "col-span-1"}
                onClick={() => setTipoColSize(COL_SIZES[Math.max(0, COL_SIZES.indexOf(tipoColSize) - 1)])}
              >
                <Minimize2 size={11} />
              </button>
              <button
                className="gdt-resize-btn"
                disabled={tipoColSize === "col-span-3"}
                onClick={() => setTipoColSize(COL_SIZES[Math.min(2, COL_SIZES.indexOf(tipoColSize) + 1)])}
              >
                <Maximize2 size={11} />
              </button>
            </div>
          </div>
          <div
            className="gdt-block-body"
            style={{ display: "flex", flexDirection: "column", justifyContent: "center" }}
          >
            {tiposData.length === 0 ? (
              <div className="gdt-empty">Sem dados no período.</div>
            ) : (
              (() => {
                const total = tiposData.reduce((s, t) => s + t.value, 0);
                const maxVal = Math.max(...tiposData.map((t) => t.value), 1);
                return (
                  <div className="gdt-tipo-bars">
                    {tiposData.map((t) => {
                      const pct = total > 0 ? Math.round((t.value / total) * 100) : 0;
                      const barPct = Math.max(6, (t.value / maxVal) * 100);
                      const color = tipoColor[t.name] ?? T.accent;
                      const isActive = tipoFilter === t.name;
                      const isDimmed = !!tipoFilter && !isActive;
                      return (
                        <div
                          key={t.name}
                          className={`gdt-tipo-row${isActive ? " active" : ""}`}
                          style={{ opacity: isDimmed ? 0.4 : 1 }}
                          onClick={() => handleTipoClick(t.name)}
                        >
                          <span className="gdt-tipo-row-label">{t.name}</span>
                          <div className="gdt-tipo-track">
                            <div
                              className="gdt-tipo-fill"
                              style={{
                                width: `${barPct}%`,
                                background: `linear-gradient(90deg, ${color}88, ${color})`,
                              }}
                            >
                              <span className="gdt-tipo-fill-label">{pct}%</span>
                            </div>
                          </div>
                          <span className="gdt-tipo-count">{t.value}</span>
                        </div>
                      );
                    })}
                    <div className="gdt-tipo-total">
                      <span>Total no período</span>
                      <span className="gdt-tipo-total-val">{total}</span>
                    </div>
                  </div>
                );
              })()
            )}
          </div>
        </div>

        {/* ── Volume de GMUDs ── */}
        <Block title="Volume de GMUDs" chartHeight={260} defaultSize="col-span-2">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={m?.serie ?? []} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <defs>
                {[
                  { id: "gdCriadas", color: T.accent },
                  { id: "gdConcluid", color: T.success },
                  { id: "gdRollback", color: T.warning },
                  { id: "gdRejeita", color: T.danger },
                ].map(({ id, color }) => (
                  <linearGradient key={id} id={id} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={color} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={color} stopOpacity={0.02} />
                  </linearGradient>
                ))}
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke={T.chartGrid} vertical={false} />
              <XAxis dataKey="label" {...axisProps} />
              <YAxis {...axisProps} axisLine={false} allowDecimals={false} />
              <Tooltip content={<ExecTooltip />} cursor={{ stroke: T.borderHi, strokeWidth: 1 }} />
              <Legend wrapperStyle={{ fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", paddingTop: 8 }} />
              <Area
                type="monotone"
                dataKey="v"
                name="Criadas"
                stroke={T.accent}
                fill="url(#gdCriadas)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: T.accent, stroke: T.surface, strokeWidth: 2 }}
              />
              <Area
                type="monotone"
                dataKey="concluidas"
                name="Concluídas"
                stroke={T.success}
                fill="url(#gdConcluid)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: T.success, stroke: T.surface, strokeWidth: 2 }}
              />
              <Area
                type="monotone"
                dataKey="rollback"
                name="Rollback"
                stroke={T.warning}
                fill="url(#gdRollback)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: T.warning, stroke: T.surface, strokeWidth: 2 }}
              />
              <Area
                type="monotone"
                dataKey="rejeitadas"
                name="Rejeitadas"
                stroke={T.danger}
                fill="url(#gdRejeita)"
                strokeWidth={2}
                dot={false}
                activeDot={{ r: 4, fill: T.danger, stroke: T.surface, strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </Block>
      </div>

      {/* ── Gargalos ───────────────────────────────────────────────────── */}
      <div className="gdt-panel">
        <div className="gdt-panel-hdr">
          <div className="gdt-panel-title">
            <AlertTriangle size={11} color={T.warning} />
            Gargalos — aprovadores com pendências &gt; 24h
          </div>
        </div>
        {(m?.gargalos ?? []).length === 0 ? (
          <div className="gdt-empty">Nenhum gargalo identificado no período. 🎉</div>
        ) : (
          <table className="gdt-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 20 }}>Aprovador</th>
                <th>E-mail</th>
                <th className="right">Pendências</th>
                <th className="right" style={{ paddingRight: 20 }}>
                  Tempo médio
                </th>
              </tr>
            </thead>
            <tbody>
              {(m?.gargalos ?? []).map((g) => (
                <tr key={g.email}>
                  <td style={{ paddingLeft: 20 }}>{g.nome}</td>
                  <td className="dim">{g.email}</td>
                  <td className="mono" style={{ textAlign: "right", color: T.warning, fontWeight: 700 }}>
                    {g.pendentes}
                  </td>
                  <td className="mono" style={{ textAlign: "right", paddingRight: 20, color: T.textSecondary }}>
                    {g.tempoMedioH}h
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
