import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Trophy,
  Medal,
  Award,
  Brain,
  Users,
  Clock,
  TrendingUp,
  Zap,
  Minimize2,
  Maximize2,
  GripHorizontal,
  RefreshCw,
  Activity,
  SlidersHorizontal,
  Download,
} from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { getIaRanking, getRankingIaUsuarios, syncIaWebEvents } from "@/lib/ia.functions";
import { useRankingIA } from "@/lib/use-ranking-ia";
import { Skeleton } from "@/components/ui/skeleton";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useFilters } from "@/lib/filters-context";
import { usePermissions } from "@/lib/use-permissions";

// ── Design Tokens — mesma paleta dos outros dashboards ────────────────────────
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
  neutral: "#6B7280",

  textPrimary: "#F1F5F9",
  textSecondary: "#F1F5F9",
  textMuted: "#F1F5F9",
  textSubtle: "#F1F5F9",

  chartGrid: "rgba(30,38,64,0.7)",
  chartAxis: "#F1F5F9",
  chartTick: "#F1F5F9",
};

// Gradientes por posição no ranking
const RANK_GRADIENTS = [
  { id: "rank-gold", from: "#F59E0B", to: "#FBBF24" }, // 1º — ouro
  { id: "rank-silver", from: "#94A3B8", to: "#CBD5E1" }, // 2º — prata
  { id: "rank-bronze", from: "#FB923C", to: "#FDBA74" }, // 3º — bronze
  { id: "rank-accent", from: "#3B82F6", to: "#60A5FA" }, // demais
];

// Cores de texto por posição
const rankColor = (pos: number) =>
  pos === 1 ? T.warning : pos === 2 ? "#CBD5E1" : pos === 3 ? "#FDBA74" : T.textSecondary;

// ── Inline CSS ─────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');

  .ia-root { font-family:'DM Sans',sans-serif; color:${T.textPrimary}; }
  .ia-root * { box-sizing:border-box; }

  /* ── Panel ── */
  .ia-panel { background:${T.surface}; border:1px solid ${T.border}; border-radius:12px; overflow:hidden; display:flex; flex-direction:column; }
  .ia-panel-header { display:flex; align-items:center; justify-content:space-between; padding:14px 20px; background:${T.surfaceAlt}; border-bottom:1px solid ${T.border}; flex-shrink:0; cursor:grab; user-select:none; }
  .ia-resize-ctrl { display:flex; align-items:center; gap:2px; opacity:0; transition:opacity 0.15s; }
  .ia-panel:hover .ia-resize-ctrl { opacity:1; }
  .ia-resize-btn { padding:2px; border:none; background:transparent; color:${T.textMuted}; cursor:pointer; border-radius:3px; line-height:0; transition:color 0.15s,background 0.15s; }
  .ia-resize-btn:hover { color:${T.textPrimary}; background:rgba(255,255,255,0.07); }
  .ia-panel-title { display:flex; align-items:center; gap:8px; font-size:12px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; }
  .ia-panel-meta { font-size:11px; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; }

  /* ── KPI strip ── */
  .ia-kpi-strip { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:20px; }
  .ia-kpi { background:${T.surfaceAlt}; border:1px solid ${T.border}; border-radius:8px; padding:14px 16px; position:relative; overflow:hidden; }
  .ia-kpi::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; background:var(--kc,${T.accent}); }
  .ia-kpi-label { font-size:9px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; margin-bottom:5px; }
  .ia-kpi-value { font-size:22px; font-weight:700; font-family:'Space Grotesk',sans-serif; letter-spacing:-0.02em; line-height:1; color:var(--kc,${T.textPrimary}); }
  .ia-kpi-icon { position:absolute; top:12px; right:12px; opacity:0.9; }

  /* ── Table ── */
  .ia-table-wrap { flex:1; overflow:hidden; }
  .ia-table { width:100%; border-collapse:collapse; }
  .ia-table thead tr { border-bottom:1px solid ${T.border}; position:sticky; top:0; z-index:10; }
  .ia-table th { padding:8px 14px; font-size:9px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; text-align:left; background:${T.surface}; white-space:nowrap; }
  .ia-table th.right { text-align:right; }
  .ia-table td { padding:10px 14px; border-bottom:1px solid rgba(30,38,64,0.4); vertical-align:middle; }
  .ia-table tbody tr:last-child td { border-bottom:none; }
  .ia-table tbody tr:hover td { background:rgba(59,130,246,0.04); }
  .ia-table tbody tr.top3 td { background:rgba(59,130,246,0.03); }

  /* ── Rank badge ── */
  .ia-rank-badge { display:inline-flex; align-items:center; justify-content:center; width:24px; height:24px; border-radius:5px; font-size:11px; font-weight:700; font-family:'Space Grotesk',sans-serif; flex-shrink:0; }
  .ia-rank-1 { background:rgba(245,158,11,0.15); color:${T.warning}; border:1px solid rgba(245,158,11,0.25); }
  .ia-rank-2 { background:rgba(148,163,184,0.12); color:#CBD5E1; border:1px solid rgba(148,163,184,0.2); }
  .ia-rank-3 { background:rgba(251,146,60,0.12); color:#FDBA74; border:1px solid rgba(251,146,60,0.2); }
  .ia-rank-n { background:rgba(59,130,246,0.06); color:${T.textMuted}; border:1px solid rgba(59,130,246,0.1); }

  /* ── User name ── */
  .ia-username { font-size:13px; font-weight:500; color:${T.textPrimary}; }
  .ia-username.top3 { font-weight:600; }
  .ia-count { font-size:13px; font-weight:600; font-family:'IBM Plex Mono',monospace; color:${T.textPrimary}; text-align:right; }
  .ia-date { font-size:11px; font-family:'IBM Plex Mono',monospace; color:${T.textMuted}; text-align:right; white-space:nowrap; }

  /* ── Podium top3 row accent ── */
  .ia-table tbody tr.rank-1 td { border-left:2px solid ${T.warning}; }
  .ia-table tbody tr.rank-2 td { border-left:2px solid #CBD5E1; }
  .ia-table tbody tr.rank-3 td { border-left:2px solid #FDBA74; }
  .ia-table tbody tr.rank-1 td:not(:first-child),
  .ia-table tbody tr.rank-2 td:not(:first-child),
  .ia-table tbody tr.rank-3 td:not(:first-child) { border-left:none; }

  /* ── Recharts ── */
  .recharts-cartesian-axis-tick-value { fill:${T.chartTick} !important; font-size:11px; font-family:'IBM Plex Mono',monospace; }
  .recharts-text { fill:${T.chartTick} !important; }
  .recharts-label { fill:${T.textMuted} !important; font-size:11px; font-family:'IBM Plex Mono',monospace; }
  .recharts-legend-item-text { color:${T.textSecondary} !important; font-family:'IBM Plex Mono',monospace; }

  /* ── Loading skeleton ── */
  @keyframes ia-shimmer { 0%{background-position:-400px 0} 100%{background-position:400px 0} }
  .ia-skeleton { border-radius:5px; height:12px; background:linear-gradient(90deg,${T.surfaceAlt} 25%,${T.border} 50%,${T.surfaceAlt} 75%); background-size:400px 100%; animation:ia-shimmer 1.4s ease infinite; }

  /* ── Empty / Error ── */
  .ia-state { display:flex; flex-direction:column; align-items:center; justify-content:center; padding:48px 24px; gap:10px; text-align:center; }
  .ia-state-icon { width:40px; height:40px; border-radius:8px; display:flex; align-items:center; justify-content:center; margin-bottom:4px; }

  /* ── Scrollbar ── */
  .ia-root ::-webkit-scrollbar { width:4px; height:4px; }
  .ia-root ::-webkit-scrollbar-track { background:transparent; }
  .ia-root ::-webkit-scrollbar-thumb { background:${T.borderHi}; border-radius:2px; }

  /* ── Bar label ── */
  .recharts-label-list text { fill:${T.chartTick} !important; font-size:11px !important; font-family:'IBM Plex Mono',monospace !important; }
`;

// ── Utilities ──────────────────────────────────────────────────────────────────
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";

const fmtNum = (n: number) => n.toLocaleString("pt-BR");

// ── Custom Tooltip ─────────────────────────────────────────────────────────────
function ExecTooltip({ active, payload }: { active?: boolean; payload?: any[] }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as {
    user_name: string;
    total_acessos: number;
    ultimo_acesso: string | null;
  };
  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${T.borderHi}`,
        borderRadius: 8,
        padding: "10px 14px",
        fontFamily: "'DM Sans', sans-serif",
        boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
        minWidth: 180,
      }}
    >
      <div style={{ fontWeight: 600, color: T.textPrimary, fontSize: 13, marginBottom: 6 }}>{p.user_name}</div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 12, marginBottom: 3 }}>
        <span
          style={{
            color: T.textMuted,
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Acessos
        </span>
        <span style={{ color: T.textPrimary, fontWeight: 700, fontFamily: "'IBM Plex Mono', monospace" }}>
          {fmtNum(p.total_acessos)}
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, fontSize: 12 }}>
        <span
          style={{
            color: T.textMuted,
            fontFamily: "'IBM Plex Mono', monospace",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Último
        </span>
        <span style={{ color: T.textSecondary, fontFamily: "'IBM Plex Mono', monospace", fontSize: 11 }}>
          {fmtDate(p.ultimo_acesso)}
        </span>
      </div>
    </div>
  );
}

// ── Rank Icon ──────────────────────────────────────────────────────────────────
function RankBadge({ pos }: { pos: number }) {
  const cls =
    pos === 1
      ? "ia-rank-badge ia-rank-1"
      : pos === 2
        ? "ia-rank-badge ia-rank-2"
        : pos === 3
          ? "ia-rank-badge ia-rank-3"
          : "ia-rank-badge ia-rank-n";

  if (pos === 1)
    return (
      <span className={cls} title="1º">
        <Trophy size={13} />
      </span>
    );
  if (pos === 2)
    return (
      <span className={cls} title="2º">
        <Medal size={13} />
      </span>
    );
  if (pos === 3)
    return (
      <span className={cls} title="3º">
        <Award size={13} />
      </span>
    );
  return <span className={cls}>{pos}</span>;
}

// ── Skeleton rows ──────────────────────────────────────────────────────────────
function SkeletonRows({ n = 8 }: { n?: number }) {
  return (
    <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
      {Array.from({ length: n }).map((_, i) => (
        <div key={i} style={{ display: "flex", gap: 10, alignItems: "center" }}>
          <div className="ia-skeleton" style={{ width: 24, height: 24, borderRadius: 5, flexShrink: 0 }} />
          <div className="ia-skeleton" style={{ flex: 1 }} />
          <div className="ia-skeleton" style={{ width: 60 }} />
          <div className="ia-skeleton" style={{ width: 80 }} />
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ══════════════════════════════════════════════════════════════════════════════
export function RankingIAChart({
  limit = 20,
  filters,
}: {
  limit?: number;
  filters?: { tool?: string; dept?: string; unit?: string; from?: string; to?: string };
}) {
  const { data, isLoading, error } = useRankingIA(limit, filters);

  // Estado de tamanho dos painéis — mesmo padrão do CloudflareReal
  const SIZES = ["col-span-1 lg:col-span-1", "col-span-1 lg:col-span-2"];
  const [sizes, setSizes] = React.useState({ tabela: 0, grafico: 0 }); // índice em SIZES
  const sizeOf = (key: "tabela" | "grafico") => [1, 2][sizes[key]] ?? 1;
  const changePanelSize = (key: "tabela" | "grafico", action: "grow" | "shrink") => {
    setSizes((prev) => {
      const cur = prev[key];
      const next = action === "grow" ? Math.min(cur + 1, 1) : Math.max(cur - 1, 0);
      return { ...prev, [key]: next };
    });
  }; // ← back-end inalterado

  // Derived — UNCHANGED logic
  const chartData = React.useMemo(() => [...data].slice(0, limit).reverse(), [data, limit]);

  // KPI aggregates
  const totalAcessos = data.reduce((s, u) => s + u.total_acessos, 0);
  const topUser = data[0];
  const lastActivity =
    data
      .map((u) => u.ultimo_acesso)
      .filter(Boolean)
      .sort()
      .at(-1) ?? null;

  return (
    <div className="ia-root" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* SVG gradient defs shared ─────────────────────────────────────────── */}
      <svg width={0} height={0} style={{ position: "absolute" }}>
        <defs>
          {RANK_GRADIENTS.map((g) => (
            <linearGradient key={g.id} id={g.id} x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor={g.from} stopOpacity={0.55} />
              <stop offset="100%" stopColor={g.to} stopOpacity={1} />
            </linearGradient>
          ))}
        </defs>
      </svg>

      {/* ── KPI Strip ────────────────────────────────────────────────────── */}
      {!isLoading && !error && data.length > 0 && (
        <div className="ia-kpi-strip">
          <div className="ia-kpi" style={{ "--kc": T.accent } as React.CSSProperties}>
            <div className="ia-kpi-icon">
              <Users size={38} color={T.accent} />
            </div>
            <div className="ia-kpi-label">Usuários Ativos</div>
            <div className="ia-kpi-value">{fmtNum(data.length)}</div>
          </div>
          <div className="ia-kpi" style={{ "--kc": T.purple } as React.CSSProperties}>
            <div className="ia-kpi-icon">
              <Zap size={38} color={T.purple} />
            </div>
            <div className="ia-kpi-label">Total de Acessos</div>
            <div className="ia-kpi-value">{fmtNum(totalAcessos)}</div>
          </div>
          <div className="ia-kpi" style={{ "--kc": T.success } as React.CSSProperties}>
            <div className="ia-kpi-icon">
              <TrendingUp size={38} color={T.success} />
            </div>
            <div className="ia-kpi-label">Líder do Ranking</div>
            <div
              className="ia-kpi-value"
              style={{ fontSize: topUser?.user_name && topUser.user_name.length > 14 ? 16 : 20 }}
            >
              {topUser?.user_name ?? "—"}
            </div>
          </div>
        </div>
      )}

      {/* ── Main Grid ────────────────────────────────────────────────────── */}
      <div style={{ display: "grid", gridTemplateColumns: `${sizeOf("tabela")}fr ${sizeOf("grafico")}fr`, gap: 16 }}>
        {/* ── Tabela ───────────────────────────────────────────────────── */}
        <div className="ia-panel">
          <div className="ia-panel-header">
            <div className="ia-panel-title">
              <GripHorizontal size={11} color={T.textMuted} style={{ marginRight: 2 }} />
              <Brain size={13} color={T.accent} />
              Ranking de Usuários
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span className="ia-panel-meta">{isLoading ? "…" : `${data.length} usuários`}</span>
              <div className="ia-resize-ctrl">
                <button className="ia-resize-btn" onClick={() => changePanelSize("tabela", "shrink")} title="Diminuir">
                  <Minimize2 size={11} />
                </button>
                <button className="ia-resize-btn" onClick={() => changePanelSize("tabela", "grow")} title="Aumentar">
                  <Maximize2 size={11} />
                </button>
              </div>
            </div>
          </div>

          {isLoading ? (
            <SkeletonRows n={8} />
          ) : error ? (
            <div className="ia-state">
              <div
                className="ia-state-icon"
                style={{ background: T.dangerBg, border: `1px solid rgba(239,68,68,0.2)` }}
              >
                <Brain size={18} color={T.danger} />
              </div>
              <span style={{ fontSize: 13, color: T.danger, fontWeight: 600 }}>Erro ao carregar ranking.</span>
            </div>
          ) : data.length === 0 ? (
            <div className="ia-state">
              <div
                className="ia-state-icon"
                style={{ background: T.accentSoft, border: `1px solid rgba(59,130,246,0.15)` }}
              >
                <Brain size={18} color={T.accent} />
              </div>
              <span style={{ fontSize: 13, color: T.textMuted }}>Sem dados de acesso à IA.</span>
            </div>
          ) : (
            <div style={{ overflowY: "auto", maxHeight: 610, flex: 1 }} className="ia-root">
              <table className="ia-table">
                <thead>
                  <tr>
                    <th style={{ width: 44 }}>#</th>
                    <th>Usuário</th>
                    <th className="right">Total</th>
                    <th className="right">Último Acesso</th>
                  </tr>
                </thead>
                <tbody>
                  {data.map((u, idx) => {
                    const pos = idx + 1;
                    const isTop = pos <= 3;
                    const rowCls = isTop ? `top3 rank-${pos}` : "";
                    return (
                      <tr key={u.user_name} className={rowCls}>
                        <td>
                          <RankBadge pos={pos} />
                        </td>
                        <td>
                          <span className={`ia-username${isTop ? " top3" : ""}`} style={{ color: rankColor(pos) }}>
                            {u.user_name}
                          </span>
                        </td>
                        <td>
                          <span className="ia-count">{fmtNum(u.total_acessos)}</span>
                        </td>
                        <td>
                          <span className="ia-date">{fmtDate(u.ultimo_acesso)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Gráfico ──────────────────────────────────────────────────── */}
        <div className="ia-panel">
          <div className="ia-panel-header">
            <div className="ia-panel-title">
              <GripHorizontal size={11} color={T.textMuted} style={{ marginRight: 2 }} />
              <TrendingUp size={13} color={T.accent} />
              Top Usuários — Acessos à IA
            </div>
            <div className="ia-resize-ctrl">
              <button className="ia-resize-btn" onClick={() => changePanelSize("grafico", "shrink")} title="Diminuir">
                <Minimize2 size={11} />
              </button>
              <button className="ia-resize-btn" onClick={() => changePanelSize("grafico", "grow")} title="Aumentar">
                <Maximize2 size={11} />
              </button>
            </div>
          </div>

          <div style={{ padding: "16px", flex: 1 }}>
            {isLoading ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, paddingTop: 8 }}>
                {Array.from({ length: 10 }).map((_, i) => (
                  <div key={i} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <div className="ia-skeleton" style={{ width: 110, height: 10 }} />
                    <div className="ia-skeleton" style={{ flex: 1, height: 18, borderRadius: 3 }} />
                  </div>
                ))}
              </div>
            ) : data.length === 0 ? (
              <div className="ia-state">
                <span style={{ fontSize: 13, color: T.textMuted }}>Sem dados para exibir.</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={Math.max(420, chartData.length * 30)}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 4, right: 52, top: 4, bottom: 4 }}>
                  <defs>
                    {/* Gradientes inline para garantir visibilidade */}
                    <linearGradient id="bar-top" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={T.warning} stopOpacity={0.5} />
                      <stop offset="100%" stopColor={T.warning} stopOpacity={1} />
                    </linearGradient>
                    <linearGradient id="bar-2nd" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#94A3B8" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#CBD5E1" stopOpacity={1} />
                    </linearGradient>
                    <linearGradient id="bar-3rd" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#FB923C" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="#FDBA74" stopOpacity={1} />
                    </linearGradient>
                    <linearGradient id="bar-rest" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={T.accent} stopOpacity={0.35} />
                      <stop offset="100%" stopColor={T.accent} stopOpacity={0.85} />
                    </linearGradient>
                  </defs>

                  <CartesianGrid strokeDasharray="2 4" stroke={T.chartGrid} horizontal={false} />
                  <XAxis
                    type="number"
                    stroke={T.chartAxis}
                    fontSize={10}
                    tick={{ fill: T.chartTick, fontFamily: "'IBM Plex Mono', monospace" }}
                    tickLine={false}
                    axisLine={{ stroke: T.chartAxis }}
                    allowDecimals={false}
                    tickFormatter={(v) => fmtNum(Number(v))}
                  />
                  <YAxis
                    type="category"
                    dataKey="user_name"
                    stroke={T.chartAxis}
                    fontSize={11}
                    width={130}
                    tick={{ fill: T.textSecondary, fontFamily: "'DM Sans', sans-serif" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<ExecTooltip />} cursor={{ fill: "rgba(59,130,246,0.05)" }} />
                  <Bar
                    dataKey="total_acessos"
                    radius={[0, 4, 4, 0]}
                    label={{
                      position: "right",
                      fill: T.chartTick,
                      fontSize: 11,
                      fontFamily: "'IBM Plex Mono', monospace",
                      formatter: (v: number) => fmtNum(v),
                    }}
                  >
                    {chartData.map((row, i) => {
                      // chartData está em ordem reversa: topo (1º) é o último item
                      const totalItems = chartData.length;
                      const rankPos = totalItems - i; // posição real no ranking
                      const fill =
                        rankPos === 1
                          ? "url(#bar-top)"
                          : rankPos === 2
                            ? "url(#bar-2nd)"
                            : rankPos === 3
                              ? "url(#bar-3rd)"
                              : "url(#bar-rest)";
                      return <Cell key={row.user_name} fill={fill} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// RANKING IA DASHBOARD (extraído de dashboards.tsx — sem mudanças de lógica)
// ══════════════════════════════════════════════════════════════════════════════

const T_IA = {
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
  textSecondary: "#F1F5F9",
  textMuted: "#F1F5F9",
  textSubtle: "#F1F5F9",
  chartGrid: "rgba(30,38,64,0.7)",
  chartAxis: "#F1F5F9",
  chartTick: "#F1F5F9",
};

const IA_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');

  .iad-root { font-family:'DM Sans',sans-serif; color:${T_IA.textPrimary}; }
  .iad-root * { box-sizing:border-box; }

  .iad-header { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px;
    padding:14px 20px; background:${T_IA.surface}; border:1px solid ${T_IA.border}; border-radius:10px; }
  .iad-header-left { display:flex; align-items:center; gap:10px; }
  .iad-header-title { font-size:13px; font-weight:700; color:${T_IA.textPrimary}; font-family:'Space Grotesk',sans-serif; letter-spacing:-0.01em; }
  .iad-header-sync { font-size:10px; color:${T_IA.textMuted}; font-family:'IBM Plex Mono',monospace; margin-top:2px; }
  .iad-live-dot { width:6px; height:6px; border-radius:50%; background:${T_IA.success}; flex-shrink:0; }

  .iad-sync-btn { display:inline-flex; align-items:center; gap:6px; padding:7px 14px;
    background:${T_IA.accentGlow}; border:1px solid rgba(59,130,246,0.35); border-radius:6px;
    font-size:11px; font-weight:600; color:${T_IA.accent}; cursor:pointer;
    font-family:'DM Sans',sans-serif; transition:all 0.15s; }
  .iad-sync-btn:hover:not(:disabled) { background:rgba(59,130,246,0.22); }
  .iad-sync-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .iad-clear-btn { background:none; border:none; cursor:pointer; font-size:11px; font-weight:600;
    color:${T_IA.accent}; font-family:'IBM Plex Mono',monospace; letter-spacing:0.04em;
    padding:4px 8px; border-radius:4px; transition:background 0.15s; }
  .iad-clear-btn:hover { background:${T_IA.accentSoft}; }

  .iad-export-btn { display:inline-flex; align-items:center; gap:6px; padding:7px 14px;
    background:transparent; border:1px solid ${T_IA.border}; border-radius:6px;
    font-size:11px; font-weight:600; color:${T_IA.textPrimary}; cursor:pointer;
    font-family:'DM Sans',sans-serif; transition:all 0.15s; }
  .iad-export-btn:hover:not(:disabled) { border-color:${T_IA.borderHi}; background:rgba(255,255,255,0.04); }
  .iad-export-btn:disabled { opacity:0.5; cursor:not-allowed; }
  .iad-export-opt { display:flex; align-items:center; gap:8px; width:100%; padding:8px 10px;
    background:transparent; border:none; border-radius:5px; font-size:12px; font-weight:500;
    color:${T_IA.textPrimary}; cursor:pointer; font-family:'DM Sans',sans-serif; text-align:left;
    transition:background 0.15s; }
  .iad-export-opt:hover { background:${T_IA.accentSoft}; color:${T_IA.accent}; }

  .iad-filters { display:grid; grid-template-columns:repeat(4,1fr); gap:10px; }
  .iad-filter-field { display:flex; flex-direction:column; gap:4px; }
  .iad-filter-label { font-size:9px; font-weight:700; letter-spacing:0.13em; text-transform:uppercase;
    color:${T_IA.textMuted}; font-family:'IBM Plex Mono',monospace; }
  .iad-filter-select { height:34px; border-radius:6px; border:1px solid ${T_IA.border};
    background:${T_IA.surfaceAlt}; color:${T_IA.textPrimary}; padding:0 10px;
    font-size:12px; font-family:'IBM Plex Mono',monospace; cursor:pointer;
    transition:border-color 0.15s; appearance:none;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%2364748B' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
    background-repeat:no-repeat; background-position:right 8px center; padding-right:28px; }
  .iad-filter-select:focus { outline:none; border-color:rgba(59,130,246,0.5);
    box-shadow:0 0 0 2px rgba(59,130,246,0.1); }
  .iad-filter-select option { background:${T_IA.surface}; color:${T_IA.textPrimary}; }

  .iad-kpi-row { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
  .iad-kpi { background:${T_IA.surface}; border:1px solid ${T_IA.border}; border-radius:10px;
    padding:16px 20px; position:relative; overflow:hidden; transition:border-color 0.2s; }
  .iad-kpi:hover { border-color:${T_IA.borderHi}; }
  .iad-kpi::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; background:var(--kc,${T_IA.accent}); }
  .iad-kpi-label { font-size:9px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase;
    color:${T_IA.textMuted}; font-family:'IBM Plex Mono',monospace; margin-bottom:6px; }
  .iad-kpi-value { font-size:28px; font-weight:700; font-family:'Space Grotesk',sans-serif;
    letter-spacing:-0.02em; line-height:1; color:var(--kc,${T_IA.textPrimary}); }
  .iad-kpi-icon { position:absolute; top:14px; right:14px; opacity:0.9; }

  .iad-panel { background:${T_IA.surface}; border:1px solid ${T_IA.border}; border-radius:10px; overflow:hidden; }
  .iad-panel-header { display:flex; align-items:center; justify-content:space-between;
    padding:12px 18px; background:${T_IA.surfaceAlt}; border-bottom:1px solid ${T_IA.border}; }
  .iad-panel-title { display:flex; align-items:center; gap:7px; font-size:11px; font-weight:700;
    letter-spacing:0.09em; text-transform:uppercase; color:${T_IA.textMuted};
    font-family:'IBM Plex Mono',monospace; }
  .iad-panel-hint { font-size:10px; color:${T_IA.textSubtle}; font-family:'IBM Plex Mono',monospace; }
  .iad-panel-body { padding:16px 18px; }

  .iad-loading { display:flex; align-items:center; gap:8px; padding:28px 18px;
    font-size:12px; color:${T_IA.textMuted}; font-family:'IBM Plex Mono',monospace; }
  @keyframes iad-spin { to{transform:rotate(360deg)} }
  .iad-spin { animation:iad-spin 0.8s linear infinite; }

  .iad-empty { padding:32px; text-align:center; color:${T_IA.textMuted};
    font-size:12px; font-family:'DM Sans',sans-serif; }

  .iad-root .recharts-cartesian-axis-tick-value { fill:${T_IA.chartTick} !important; font-size:11px; font-family:'IBM Plex Mono',monospace; }
  .iad-root .recharts-text { fill:${T_IA.chartTick} !important; }
  .iad-root .recharts-label { fill:${T_IA.textMuted} !important; font-size:11px; font-family:'IBM Plex Mono',monospace; }

  .iad-root ::-webkit-scrollbar { width:4px; height:4px; }
  .iad-root ::-webkit-scrollbar-track { background:transparent; }
  .iad-root ::-webkit-scrollbar-thumb { background:${T_IA.borderHi}; border-radius:2px; }

  @keyframes iad-shimmer { 0%{background-position:-400px 0} 100%{background-position:400px 0} }
  .iad-shimmer { border-radius:5px; background:linear-gradient(90deg,${T_IA.surfaceAlt} 25%,${T_IA.border} 50%,${T_IA.surfaceAlt} 75%);
    background-size:400px 100%; animation:iad-shimmer 1.4s ease infinite; }

  /* ── iad-block — padrão idêntico ao CloudflareReal ─────────────────────── */
  .iad-block { background:${T_IA.surface}; border:1px solid ${T_IA.border}; border-radius:10px; display:flex; flex-direction:column; min-width:200px; min-height:120px; resize:vertical; overflow:auto; transition:border-color 0.2s,box-shadow 0.2s; }
  .iad-block:hover { border-color:${T_IA.borderHi}; }
  .iad-block.dragging { opacity:0.2; border:1px dashed ${T_IA.accent}; }
  .iad-block-header { display:flex; align-items:center; justify-content:space-between; padding:10px 16px; background:${T_IA.surfaceAlt}; border-bottom:1px solid ${T_IA.border}; cursor:grab; user-select:none; flex-shrink:0; border-radius:10px 10px 0 0; }
  .iad-block-header:active { cursor:grabbing; }
  .iad-block-title { display:flex; align-items:center; gap:7px; font-size:11px; font-weight:600; color:${T_IA.textPrimary}; text-transform:uppercase; letter-spacing:0.09em; font-family:'IBM Plex Mono',monospace; }
  .iad-block-body { flex:1; padding:16px; display:flex; flex-direction:column; }
  .iad-resize-ctrl { display:flex; align-items:center; gap:2px; opacity:0; transition:opacity 0.15s; }
  .iad-block:hover .iad-resize-ctrl { opacity:1; }
  .iad-resize-btn { padding:2px; border:none; background:transparent; color:${T_IA.textMuted}; cursor:pointer; border-radius:3px; line-height:0; transition:color 0.15s,background 0.15s; }
  .iad-resize-btn:hover { color:${T_IA.textPrimary}; background:rgba(255,255,255,0.07); }
  .iad-resize-btn:disabled { opacity:0.25; cursor:default; }
`;

function IaBarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const d = payload[0]?.payload;
  const users: string[] = d?.users ?? [];
  const totalAcessos: number = payload[0]?.value ?? 0;
  const usuariosUnicos: number = d?.userCount ?? users.length;
  return (
    <div
      style={{
        background: T_IA.surface,
        border: `1px solid ${T_IA.borderHi}`,
        borderRadius: 8,
        padding: "10px 14px",
        fontFamily: "'DM Sans',sans-serif",
        boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
        minWidth: 200,
      }}
    >
      <div style={{ fontWeight: 700, color: T_IA.textPrimary, fontSize: 13, marginBottom: 8 }}>{label}</div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: 4 }}>
        <span
          style={{
            color: T_IA.textMuted,
            fontFamily: "'IBM Plex Mono',monospace",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Acessos
        </span>
        <span style={{ color: T_IA.textPrimary, fontWeight: 700, fontFamily: "'IBM Plex Mono',monospace" }}>
          {totalAcessos.toLocaleString("pt-BR")}
        </span>
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16, marginBottom: users.length ? 8 : 0 }}>
        <span
          style={{
            color: T_IA.textMuted,
            fontFamily: "'IBM Plex Mono',monospace",
            fontSize: 10,
            textTransform: "uppercase",
            letterSpacing: "0.08em",
          }}
        >
          Usuários únicos
        </span>
        <span style={{ color: T_IA.textSecondary, fontWeight: 600, fontFamily: "'IBM Plex Mono',monospace" }}>
          {usuariosUnicos.toLocaleString("pt-BR")}
        </span>
      </div>
      {users.length > 0 && (
        <div style={{ borderTop: `1px solid ${T_IA.border}`, paddingTop: 6, marginTop: 2 }}>
          {users.slice(0, 4).map((u) => (
            <div
              key={u}
              style={{
                fontSize: 10,
                color: T_IA.textSecondary,
                fontFamily: "'IBM Plex Mono',monospace",
                marginBottom: 2,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: 180,
              }}
            >
              {u}
            </div>
          ))}
          {users.length > 4 && (
            <div style={{ fontSize: 10, color: T_IA.textSubtle, fontFamily: "'IBM Plex Mono',monospace" }}>
              +{users.length - 4} mais
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function DeptYAxisTick({ x, y, payload }: any) {
  const name: string = payload?.value ?? "";
  const words = name.split(" ");
  const label = words.length > 2 ? `${words.slice(0, 2).join(" ")}…` : name;
  return (
    <g transform={`translate(${x},${y})`}>
      <text
        x={-4}
        y={0}
        textAnchor="end"
        dominantBaseline="central"
        fill={T_IA.textSecondary}
        fontSize={11}
        fontFamily="'DM Sans',sans-serif"
      >
        {label}
      </text>
    </g>
  );
}

// Formata "YYYY-MM-DD" -> "DD/MM" (sem ano) para os rótulos do gráfico de evolução
const fmtDiaMes = (s: string) => {
  const p = (s ?? "").split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}` : s;
};

function IaAreaTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: T_IA.surface,
        border: `1px solid ${T_IA.borderHi}`,
        borderRadius: 8,
        padding: "10px 14px",
        fontFamily: "'DM Sans',sans-serif",
        boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
        minWidth: 140,
      }}
    >
      <div
        style={{
          color: T_IA.textMuted,
          fontFamily: "'IBM Plex Mono',monospace",
          fontSize: 10,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 6,
        }}
      >
        {fmtDiaMes(label)}
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", gap: 16 }}>
        <span style={{ color: T_IA.textMuted, fontFamily: "'IBM Plex Mono',monospace", fontSize: 10 }}>Eventos</span>
        <span style={{ color: T_IA.textPrimary, fontWeight: 700, fontFamily: "'IBM Plex Mono',monospace" }}>
          {payload[0]?.value?.toLocaleString("pt-BR")}
        </span>
      </div>
    </div>
  );
}

const IA_AXIS = {
  stroke: T_IA.chartAxis,
  fontSize: 10,
  tick: { fill: T_IA.chartTick, fontFamily: "'IBM Plex Mono',monospace" },
  tickLine: false,
  axisLine: { stroke: T_IA.chartAxis },
};
type IaFilters = { dept: string; tool: string; unit: string; user: string };

const STORAGE_KEY_IA = "ranking_ia_dashboard_layout_v1";

interface IadBlock {
  id: string;
  title: string;
  size: string;
}

export function RankingIaDashboard() {
  const { can } = usePermissions();
  const canExport = can("ranking-ia", "manage_exportar_ranking_ia");
  const [f, setF] = React.useState<IaFilters>({ dept: "all", tool: "all", unit: "all", user: "all" });
  const set = (p: Partial<IaFilters>) => setF((s) => ({ ...s, ...p }));
  const reset = () => setF({ dept: "all", tool: "all", unit: "all", user: "all" });

  // Período vem do filtro global do AppHeader (inclui a opção "Personalizado").
  const { dateRange } = useFilters();
  const from = dateRange.from.toISOString();
  const to = dateRange.to.toISOString();

  const fetchRanking = useServerFn(getIaRanking);
  const fetchRankingUsuarios = useServerFn(getRankingIaUsuarios);
  const syncFn = useServerFn(syncIaWebEvents);
  const [syncing, setSyncing] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [exportOpen, setExportOpen] = React.useState(false);

  const { data, isLoading, refetch } = useQuery({
    queryKey: ["ia-ranking", f, from, to],
    queryFn: () => fetchRanking({ data: { from, to, dept: f.dept, tool: f.tool, unit: f.unit, user: f.user } }),
  });

  const onSync = async () => {
    setSyncing(true);
    try {
      const r = await syncFn();
      toast.success(`Sincronizado: ${r.iaProcessed} eventos de IA processados`);
      refetch();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSyncing(false);
    }
  };

  const opts = data?.filterOptions;
  const byTool = data?.byTool ?? [];
  const byDept = data?.byDept ?? [];
  const series = data?.series ?? [];
  const totals = data?.totals ?? { events: 0, users: 0, tools: 0 };
  const anyActive = f.dept !== "all" || f.tool !== "all" || f.unit !== "all" || f.user !== "all";

  // ── Exportação — respeita os filtros ativos (dept/tool/unit/período) ─────
  const onExport = async (format: "csv" | "xlsx") => {
    setExportOpen(false);
    setExporting(true);
    try {
      // Ranking de usuários busca até 5000 (teto do endpoint — folga acima da
      // base atual de usuários únicos), com os mesmos filtros aplicados no
      // gráfico — a lista da tela mostra só o top 20.
      const usuarios = await fetchRankingUsuarios({
        data: { limit: 5000, tool: f.tool, dept: f.dept, unit: f.unit, from, to },
      });

      const rankingSheet = usuarios.map((u) => ({
        Usuário: u.user_name,
        "Total de Acessos": u.total_acessos,
        "Último Acesso": u.ultimo_acesso
          ? new Date(u.ultimo_acesso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" })
          : "—",
      }));
      const toolSheet = byTool.map((t) => ({
        Ferramenta: t.name,
        Acessos: t.count,
        "Usuários Únicos": t.userCount,
        Usuários: t.users.join(", "),
      }));
      const deptSheet = byDept.map((d) => ({
        Departamento: d.name,
        Acessos: d.count,
        "Usuários Únicos": d.userCount,
        Usuários: d.users.join(", "),
      }));
      const seriesSheet = series.map((s) => ({
        Data: fmtDiaMes(s.d),
        Eventos: s.count,
      }));

      if (![rankingSheet, toolSheet, deptSheet, seriesSheet].some((s) => s.length > 0)) {
        toast.error("Nenhum dado de IA para exportar.");
        return;
      }

      // Nome do arquivo carrega os filtros ativos, deixando explícito o recorte exportado.
      const filterParts: string[] = [];
      if (f.tool !== "all") filterParts.push(f.tool);
      if (f.dept !== "all") {
        const deptName = opts?.departments.find((d) => d.id === f.dept)?.name;
        if (deptName) filterParts.push(deptName);
      }
      if (f.unit !== "all") filterParts.push(f.unit);
      if (f.user !== "all") filterParts.push(f.user);
      const slug = filterParts
        .join("-")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      const fname = `ranking-ia${slug ? `_${slug}` : ""}_${new Date().toISOString().slice(0, 10)}`;

      if (format === "csv") {
        // CSV não tem abas → junta tudo com uma coluna "Tabela"
        const rows = [
          ...rankingSheet.map((r) => ({ Tabela: "Ranking de Usuários", ...r })),
          ...toolSheet.map((r) => ({ Tabela: "Por Ferramenta", ...r })),
          ...deptSheet.map((r) => ({ Tabela: "Por Departamento", ...r })),
          ...seriesSheet.map((r) => ({ Tabela: "Evolução Diária", ...r })),
        ];
        const headers = Array.from(
          rows.reduce((set, r) => {
            Object.keys(r).forEach((k) => set.add(k));
            return set;
          }, new Set<string>()),
        );
        const esc = (val: unknown) => {
          const s = String(val ?? "");
          return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const csv = [
          headers.join(";"),
          ...rows.map((r) => headers.map((h) => esc((r as Record<string, unknown>)[h])).join(";")),
        ].join("\r\n");
        const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${fname}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const wb = XLSX.utils.book_new();
        if (rankingSheet.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rankingSheet), "Ranking");
        if (toolSheet.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toolSheet), "Por Ferramenta");
        if (deptSheet.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(deptSheet), "Por Departamento");
        if (seriesSheet.length)
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(seriesSheet), "Evolução Diária");
        XLSX.writeFile(wb, `${fname}.xlsx`);
      }
      toast.success("Exportação concluída.");
    } catch (e) {
      toast.error((e as Error).message ?? "Erro ao exportar dados de IA.");
    } finally {
      setExporting(false);
    }
  };

  // ── Drag / Resize — padrão CloudflareReal ─────────────────────────────────
  const [draggedId, setDraggedId] = React.useState<string | null>(null);
  const [blocks, setBlocks] = React.useState<IadBlock[]>([
    { id: "kpis", title: "Indicadores", size: "col-span-1 md:col-span-2 lg:col-span-6" },
    { id: "tool", title: "Acessos por Ferramenta", size: "col-span-1 md:col-span-2 lg:col-span-3" },
    { id: "dept", title: "Principais Departamentos", size: "col-span-1 md:col-span-2 lg:col-span-3" },
    { id: "evol", title: "Evolução de Uso", size: "col-span-1 md:col-span-2 lg:col-span-6" },
    { id: "ranking", title: "Ranking Detalhado", size: "col-span-1 md:col-span-2 lg:col-span-6" },
  ]);

  React.useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY_IA);
    if (saved) {
      try {
        const parsed = JSON.parse(saved) as IadBlock[];
        setBlocks((prev) => {
          const savedIds = new Set(parsed.map((b) => b.id));
          const missing = prev.filter((b) => !savedIds.has(b.id));
          return [...parsed, ...missing];
        });
      } catch {}
    }
  }, []);

  const saveLayout = (cur = blocks) => {
    try {
      localStorage.setItem(STORAGE_KEY_IA, JSON.stringify(cur));
    } catch {}
  };

  const changeBlockSize = (id: string, action: "grow" | "shrink") => {
    const next = blocks.map((b) => {
      if (b.id !== id) return b;
      let size = b.size;
      if (action === "grow") {
        if (size.includes("lg:col-span-2")) size = "col-span-1 md:col-span-2 lg:col-span-3";
        else if (size.includes("lg:col-span-3")) size = "col-span-1 md:col-span-2 lg:col-span-6";
      } else {
        if (size.includes("lg:col-span-6")) size = "col-span-1 md:col-span-2 lg:col-span-3";
        else if (size.includes("lg:col-span-3")) size = "col-span-1 md:col-span-1 lg:col-span-2";
      }
      return { ...b, size };
    });
    setBlocks(next);
    saveLayout(next);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;
    const from = blocks.findIndex((b) => b.id === draggedId);
    const to = blocks.findIndex((b) => b.id === targetId);
    const next = [...blocks];
    const [removed] = next.splice(from, 1);
    next.splice(to, 0, removed);
    setBlocks(next);
    saveLayout(next);
  };

  const BLOCK_ICONS: Record<string, React.ElementType> = {
    kpis: Activity,
    tool: Brain,
    dept: Users,
    evol: TrendingUp,
    ranking: Trophy,
  };

  return (
    <div className="iad-root">
      <style dangerouslySetInnerHTML={{ __html: IA_CSS }} />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="iad-header">
        <div className="iad-header-left">
          <div className="iad-live-dot" />
          <div>
            <div className="iad-header-title">Monitoramento de IA — Acesso de Usuários</div>
            {data?.lastSyncAt && (
              <div className="iad-header-sync">
                Última sincronização: {new Date(data.lastSyncAt).toLocaleString("pt-BR")}
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {anyActive && (
            <button className="iad-clear-btn" onClick={reset}>
              Limpar filtros
            </button>
          )}
          {canExport && (
            <Popover open={exportOpen} onOpenChange={setExportOpen}>
              <PopoverTrigger asChild>
                <button className="iad-export-btn" disabled={exporting}>
                  <Download size={12} className={exporting ? "iad-spin" : ""} />
                  {exporting ? "Exportando…" : "Exportar"}
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-auto p-1"
                style={{ background: T_IA.surface, border: `1px solid ${T_IA.borderHi}`, borderRadius: 8 }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 2, minWidth: 170 }}>
                  <button className="iad-export-opt" onClick={() => onExport("csv")}>
                    <Download size={12} /> CSV (.csv)
                  </button>
                  <button className="iad-export-opt" onClick={() => onExport("xlsx")}>
                    <Download size={12} /> Excel (.xlsx)
                  </button>
                </div>
              </PopoverContent>
            </Popover>
          )}
          <button className="iad-sync-btn" onClick={onSync} disabled={syncing}>
            <RefreshCw size={12} className={syncing ? "iad-spin" : ""} />
            {syncing ? "Sincronizando…" : "Sincronizar agora"}
          </button>
        </div>
      </div>

      {/* ── Grid de blocos — padrão CloudflareReal ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4" style={{ padding: "0 20px 24px" }}>
        {/* Filtros — fora do sistema de blocos (sem resize) */}
        <div className="col-span-1 md:col-span-2 lg:col-span-6 iad-block">
          <div className="iad-block-header">
            <div className="iad-block-title">
              <GripHorizontal size={11} color={T_IA.textMuted} />
              <SlidersHorizontal size={12} color={T_IA.accent} />
              <span>Filtros</span>
            </div>
          </div>
          <div className="iad-block-body">
            <div className="iad-panel-body">
              <div className="iad-filters">
                <IaSelect
                  label="Departamento"
                  value={f.dept}
                  onChange={(v) => set({ dept: v })}
                  options={(opts?.departments ?? []).map((d) => ({ value: d.id, label: d.name }))}
                />
                <IaSelect
                  label="Tipo de IA"
                  value={f.tool}
                  onChange={(v) => set({ tool: v })}
                  options={opts?.tools ?? []}
                />
                <IaSelect
                  label="Unidade"
                  value={f.unit}
                  onChange={(v) => set({ unit: v })}
                  options={opts?.units ?? []}
                />
                <IaSelect
                  label="Usuário"
                  value={f.user}
                  onChange={(v) => set({ user: v })}
                  options={opts?.users ?? []}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Blocos drag/resize */}
        {blocks.map((block) => {
          const isDragging = draggedId === block.id;
          const blockCls = `${block.size} iad-block${isDragging ? " dragging" : ""}`;
          const Icon = BLOCK_ICONS[block.id];
          const dragProps = {
            draggable: true,
            onDragStart: () => setDraggedId(block.id),
            onDragOver: (e: React.DragEvent) => handleDragOver(e, block.id),
            onDragEnd: () => setDraggedId(null),
          };
          const header = (
            <div className="iad-block-header">
              <div className="iad-block-title">
                <GripHorizontal size={11} color={T_IA.textMuted} />
                {Icon && <Icon size={12} color={T_IA.textMuted} />}
                <span>{block.title}</span>
              </div>
              <div className="iad-resize-ctrl">
                <button className="iad-resize-btn" onClick={() => changeBlockSize(block.id, "shrink")} title="Diminuir">
                  <Minimize2 size={11} />
                </button>
                <button className="iad-resize-btn" onClick={() => changeBlockSize(block.id, "grow")} title="Aumentar">
                  <Maximize2 size={11} />
                </button>
              </div>
            </div>
          );

          if (block.id === "kpis")
            return (
              <div key={block.id} {...dragProps} className={blockCls}>
                {header}
                <div className="iad-block-body">
                  <div className="iad-kpi-row">
                    <div className="iad-kpi" style={{ "--kc": T_IA.accent } as React.CSSProperties}>
                      <div className="iad-kpi-icon">
                        <Activity size={40} color={T_IA.accent} />
                      </div>
                      <div className="iad-kpi-label">Eventos</div>
                      <div className="iad-kpi-value">{isLoading ? "—" : totals.events.toLocaleString("pt-BR")}</div>
                    </div>
                    <div className="iad-kpi" style={{ "--kc": T_IA.purple } as React.CSSProperties}>
                      <div className="iad-kpi-icon">
                        <Users size={40} color={T_IA.purple} />
                      </div>
                      <div className="iad-kpi-label">Usuários Únicos</div>
                      <div className="iad-kpi-value">{isLoading ? "—" : totals.users.toLocaleString("pt-BR")}</div>
                    </div>
                    <div className="iad-kpi" style={{ "--kc": T_IA.success } as React.CSSProperties}>
                      <div className="iad-kpi-icon">
                        <Brain size={40} color={T_IA.success} />
                      </div>
                      <div className="iad-kpi-label">Ferramentas em Uso</div>
                      <div className="iad-kpi-value">{isLoading ? "—" : totals.tools.toLocaleString("pt-BR")}</div>
                    </div>
                  </div>
                </div>
              </div>
            );

          if (block.id === "tool")
            return (
              <div key={block.id} {...dragProps} className={blockCls}>
                {header}
                <div className="iad-panel-body">
                  {byTool.length === 0 ? (
                    <div className="iad-empty">Sem dados. Sincronize para popular eventos.</div>
                  ) : (
                    <div
                      className="ia-root"
                      style={{ maxHeight: 5 * 40 + 30, overflowY: byTool.length > 5 ? "auto" : "visible" }}
                    >
                      <ResponsiveContainer width="100%" height={byTool.length * 40 + 30}>
                        <BarChart data={byTool} layout="vertical" margin={{ left: 4, right: 44, top: 4, bottom: 4 }}>
                          <defs>
                            <linearGradient id="iad-tool-active" x1="0" y1="0" x2="1" y2="0">
                              <stop offset="0%" stopColor={T_IA.warning} stopOpacity={0.5} />
                              <stop offset="100%" stopColor={T_IA.warning} stopOpacity={1} />
                            </linearGradient>
                            <linearGradient id="iad-tool-normal" x1="0" y1="0" x2="1" y2="0">
                              <stop offset="0%" stopColor={T_IA.accent} stopOpacity={0.35} />
                              <stop offset="100%" stopColor={T_IA.accent} stopOpacity={0.9} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="2 4" stroke={T_IA.chartGrid} horizontal={false} />
                          <XAxis
                            type="number"
                            {...IA_AXIS}
                            allowDecimals={false}
                            tickFormatter={(v) => v.toLocaleString("pt-BR")}
                          />
                          <YAxis
                            type="category"
                            dataKey="name"
                            stroke={T_IA.chartAxis}
                            fontSize={11}
                            width={110}
                            tick={{ fill: T_IA.textSecondary, fontFamily: "'DM Sans',sans-serif" }}
                            tickLine={false}
                            axisLine={false}
                          />
                          <Tooltip content={<IaBarTooltip />} cursor={{ fill: "rgba(59,130,246,0.05)" }} />
                          <Bar
                            dataKey="count"
                            radius={[0, 4, 4, 0]}
                            cursor="pointer"
                            onClick={(d: any) => set({ tool: d?.name === f.tool ? "all" : d?.name })}
                            label={{
                              position: "right",
                              fill: T_IA.chartTick,
                              fontSize: 11,
                              fontFamily: "'IBM Plex Mono',monospace",
                              formatter: (v: number) => v.toLocaleString("pt-BR"),
                            }}
                          >
                            {byTool.map((d, i) => (
                              <Cell
                                key={i}
                                fill={d.name === f.tool ? "url(#iad-tool-active)" : "url(#iad-tool-normal)"}
                              />
                            ))}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </div>
            );

          if (block.id === "dept")
            return (
              <div key={block.id} {...dragProps} className={blockCls}>
                {header}
                <div className="iad-panel-body">
                  {byDept.length === 0 ? (
                    <div className="iad-empty">Cadastre colaboradores em Departamentos para vincular eventos.</div>
                  ) : (
                    <div
                      style={{
                        overflowY: byDept.length > 5 ? "auto" : "visible",
                        maxHeight: 5 * 40 + 30,
                      }}
                      className="ia-root"
                    >
                      <ResponsiveContainer width="100%" height={byDept.length * 40 + 30}>
                        <BarChart data={byDept} layout="vertical" margin={{ left: 4, right: 44, top: 4, bottom: 4 }}>
                          <defs>
                            <linearGradient id="iad-dept-active" x1="0" y1="0" x2="1" y2="0">
                              <stop offset="0%" stopColor={T_IA.warning} stopOpacity={0.5} />
                              <stop offset="100%" stopColor={T_IA.warning} stopOpacity={1} />
                            </linearGradient>
                            <linearGradient id="iad-dept-normal" x1="0" y1="0" x2="1" y2="0">
                              <stop offset="0%" stopColor={T_IA.success} stopOpacity={0.35} />
                              <stop offset="100%" stopColor={T_IA.success} stopOpacity={0.9} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="2 4" stroke={T_IA.chartGrid} horizontal={false} />
                          <XAxis
                            type="number"
                            {...IA_AXIS}
                            allowDecimals={false}
                            tickFormatter={(v) => v.toLocaleString("pt-BR")}
                          />
                          <YAxis
                            type="category"
                            dataKey="name"
                            stroke={T_IA.chartAxis}
                            width={170}
                            tick={<DeptYAxisTick />}
                            tickLine={false}
                            axisLine={false}
                          />
                          <Tooltip content={<IaBarTooltip />} cursor={{ fill: "rgba(16,185,129,0.05)" }} />
                          <Bar
                            dataKey="count"
                            radius={[0, 4, 4, 0]}
                            cursor="pointer"
                            onClick={(d: any) => {
                              const dept = opts?.departments.find((x) => x.name === d?.name);
                              if (dept) set({ dept: dept.id === f.dept ? "all" : dept.id });
                            }}
                            label={{
                              position: "right",
                              fill: T_IA.chartTick,
                              fontSize: 11,
                              fontFamily: "'IBM Plex Mono',monospace",
                              formatter: (v: number) => v.toLocaleString("pt-BR"),
                            }}
                          >
                            {byDept.map((d, i) => {
                              const deptId = opts?.departments.find((x) => x.name === d.name)?.id;
                              return (
                                <Cell
                                  key={i}
                                  fill={deptId === f.dept ? "url(#iad-dept-active)" : "url(#iad-dept-normal)"}
                                />
                              );
                            })}
                          </Bar>
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </div>
              </div>
            );

          if (block.id === "evol")
            return (
              <div key={block.id} {...dragProps} className={blockCls}>
                {header}
                <div className="iad-panel-body">
                  {series.length === 0 ? (
                    <div className="iad-empty">Sem dados para o período selecionado.</div>
                  ) : (
                    <ResponsiveContainer width="100%" height={220}>
                      <AreaChart data={series} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                        <defs>
                          <linearGradient id="iad-area" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={T_IA.accent} stopOpacity={0.3} />
                            <stop offset="100%" stopColor={T_IA.accent} stopOpacity={0.02} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="2 4" stroke={T_IA.chartGrid} vertical={false} />
                        <XAxis dataKey="d" {...IA_AXIS} tickFormatter={fmtDiaMes} />
                        <YAxis
                          {...IA_AXIS}
                          axisLine={false}
                          allowDecimals={false}
                          tickFormatter={(v) => v.toLocaleString("pt-BR")}
                        />
                        <Tooltip content={<IaAreaTooltip />} cursor={{ stroke: T_IA.borderHi, strokeWidth: 1 }} />
                        <Area
                          type="monotone"
                          dataKey="count"
                          name="Eventos"
                          stroke={T_IA.accent}
                          strokeWidth={2}
                          fill="url(#iad-area)"
                          dot={false}
                          activeDot={{ r: 4, fill: T_IA.accent, stroke: T_IA.surface, strokeWidth: 2 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  )}
                </div>
              </div>
            );

          if (block.id === "ranking")
            return (
              <div key={block.id} {...dragProps} className={blockCls}>
                {header}
                <div className="iad-block-body" style={{ padding: 0 }}>
                  <RankingIAChart filters={{ tool: f.tool, dept: f.dept, unit: f.unit, from, to }} />
                </div>
              </div>
            );

          return null;
        })}
      </div>
    </div>
  );
}

function IaSelect({
  label,
  value,
  onChange,
  options,
  allowAll = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<string | { value: string; label: string }>;
  allowAll?: boolean;
}) {
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <div className="iad-filter-field">
      <span className="iad-filter-label">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)} className="iad-filter-select">
        {allowAll && <option value="all">Todos</option>}
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}
