import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip } from "recharts";
import {
  getWebAnalytics,
  getWebAnalyticsBreakdown,
  getWebAnalyticsVisitsDetail,
  getWebAnalyticsPageViewsDetail,
  getWebAnalyticsPageLoadTimeDetail,
  type WebVitalKey,
  type WebVitalSummary,
  type PerfMetricKey,
  type PerfPercentile,
} from "@/lib/cloudflare.rum.functions";
import { AlertTriangle, Info, ArrowUpRight, ArrowDownRight, Plus, Check, X } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { RUM_VISITS_FILTER_FIELDS, type AnalyticsFilterCondition, type AnalyticsFilterOp } from "@/lib/cloudflare.analytics-filters";

// ── Design tokens (mesmos do resto da aba Analytics) ───────────────────────────
const T = {
  surface: "var(--tl-0f1420, #0F1420)",
  surfaceAlt: "var(--tl-131825, #131825)",
  border: "var(--tl-1e2640, #1E2640)",
  borderHi: "var(--tl-2a3560, #2A3560)",
  accent: "#3B82F6",
  accentGlow: "rgba(59,130,246,0.15)",
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#EF4444",
  textPrimary: "var(--tl-f1f5f9, #F1F5F9)",
  textMuted: "var(--tl-8b96ac, #8B96AC)",
  textDim: "var(--tl-5b6478, #5B6478)",
};

// Moldura da interface v2 (mesmos nomes do T; os gráficos continuam no T)
const V2 = {
  surfaceAlt: "var(--v2-surface-2)",
  surface: "var(--v2-surface)",
  borderHi: "var(--v2-line-strong)",
  border: "var(--v2-line)",
  textPrimary: "var(--v2-fg)",
  textSecondary: "var(--v2-fg-2)",
  textMuted: "var(--v2-fg-3)",
  textSubtle: "var(--v2-fg-3)",
  textDim: "var(--v2-fg-3)",
};

const CSS = `
  .wa-root { display:flex; flex-direction:column; gap:16px; }
  .wa-root input, .wa-root select {
    background:var(--v2-surface-2); border:1px solid var(--v2-line); color:var(--v2-fg);
    font-family:'IBM Plex Mono',monospace; font-size:12px; border-radius:6px; padding:6px 8px;
  }
  .wa-root input:focus, .wa-root select:focus { outline:none; border-color:rgba(59,130,246,0.5); }
  .wa-root select option { background:var(--v2-surface); color:var(--v2-fg); }

  .wa-select-trigger { background:var(--v2-surface-2) !important; border:1px solid var(--v2-line) !important; color:var(--v2-fg) !important; font-family:'IBM Plex Mono',monospace !important; font-size:12px !important; height:32px !important; }
  .wa-select-content { background:var(--v2-surface) !important; border:1px solid var(--v2-line-strong) !important; color:var(--v2-fg) !important; z-index:1000 !important; }
  .wa-select-item { color:var(--v2-fg) !important; font-family:'IBM Plex Mono',monospace !important; font-size:12px !important; cursor:pointer !important; }
  .wa-select-item[data-highlighted] { background:${T.accentGlow} !important; color:${T.accent} !important; }

  .wa-add-filter-btn { display:inline-flex; align-items:center; gap:5px; padding:6px 12px; border-radius:6px; font-size:11px; font-weight:600; border:1px dashed var(--v2-line-strong); cursor:pointer; font-family:var(--font-ui); color:${T.accent}; background:transparent; }
  .wa-add-filter-btn:hover { background:${T.accentGlow}; }
  .wa-filter-chip { display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:5px; font-size:11px; font-weight:500; border:1px solid var(--v2-line-strong); font-family:'IBM Plex Mono',monospace; color:${T.warning}; background:rgba(245,158,11,0.10); }
  .wa-filter-chip .close { opacity:0.6; cursor:pointer; display:flex; }
  .wa-filter-chip .close:hover { opacity:1; }
  .wa-filter-popover { width:auto; padding:14px; display:flex; align-items:flex-end; gap:10px; flex-wrap:wrap; background:var(--v2-surface); border:1px solid var(--v2-line-strong); border-radius:8px; }
  .wa-filter-field { display:flex; flex-direction:column; gap:5px; min-width:150px; }
  .wa-filter-field-label { font-size:12px; font-weight:500;   color:var(--v2-fg-3); font-family:var(--font-ui); }
  .wa-filter-field select, .wa-filter-field input { width:100%; }
  .wa-kpi-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(150px,1fr)); gap:12px; }
  .wa-kpi { background:var(--v2-surface-2); border:1px solid var(--v2-line); border-radius:8px; padding:14px 16px; display:flex; flex-direction:column; gap:4px; }
  .wa-kpi-label { font-size:12px; font-weight:500;   color:var(--v2-fg); font-family:var(--font-ui); }
  .wa-kpi-value { font-size:22px; font-weight:700; font-family:var(--font-ui); letter-spacing:-0.02em; color:var(--v2-fg); }

  .wa-kpi-clickable { position:relative; overflow:hidden; cursor:pointer; transition:border-color 0.15s; }
  .wa-kpi-clickable:hover { border-color:var(--v2-line-strong); }
  .wa-kpi-content { position:relative; z-index:1; display:flex; flex-direction:column; gap:4px; }
  .wa-kpi-value-row { display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; }
  .wa-kpi-trend { display:inline-flex; align-items:center; gap:1px; font-size:11px; font-weight:700; font-family:'IBM Plex Mono',monospace; }
  .wa-kpi-spark { position:absolute; left:0; right:0; bottom:0; height:34px; z-index:0; opacity:0.9; pointer-events:none; }

  .wa-dialog-content { background:var(--v2-surface) !important; border:1px solid var(--v2-line-strong) !important; border-radius:12px !important; color:var(--v2-fg) !important; max-width:920px !important; max-height:88vh; overflow-y:auto; }
  .wa-dialog-title { color:var(--v2-fg) !important; font-family:var(--font-ui); font-weight:700 !important; font-size:16px !important; }

  .wa-detail-root { display:flex; flex-direction:column; gap:16px; padding-top:2px; }
  .wa-detail-total-row { display:flex; align-items:baseline; gap:10px; }
  .wa-detail-total-label { font-size:12px; color:var(--v2-fg-3); font-family:var(--font-ui);   }
  .wa-detail-total-value { font-size:26px; font-weight:700; font-family:var(--font-ui); color:var(--v2-fg); }
  .wa-detail-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(240px,1fr)); gap:14px; }
  .wa-detail-panel { background:var(--v2-surface-2); border:1px solid var(--v2-line); border-radius:10px; overflow:hidden; }
  .wa-detail-panel-header { display:flex; align-items:center; padding:10px 14px; font-size:12px; font-weight:500;   color:var(--v2-fg); font-family:var(--font-ui); border-bottom:1px solid var(--v2-line); }
  .wa-detail-expand { margin-left:auto; background:none; border:none; color:${T.accent}; font-size:10px; cursor:pointer; font-family:'IBM Plex Mono',monospace; text-transform:none; letter-spacing:0; padding:2px 4px; }
  .wa-detail-expand:hover { text-decoration:underline; }
  .wa-detail-panel-body { padding:8px 12px 10px; display:flex; flex-direction:column; gap:2px; min-height:60px; }
  .wa-detail-row { position:relative; display:flex; align-items:center; height:26px; border-radius:5px; cursor:default; }
  .wa-detail-row.clickable { cursor:pointer; }
  .wa-detail-row.clickable:hover { background:rgba(var(--tl-ink, 255,255,255),0.03); }
  .wa-detail-row.clickable:hover .wa-detail-label { color:${T.accent}; }
  .wa-detail-bar { position:absolute; left:0; top:2px; bottom:2px; background:${T.accentGlow}; border-radius:4px; z-index:0; }
  .wa-detail-label { position:relative; z-index:1; font-size:11.5px; color:var(--v2-fg); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; padding-left:8px; font-family:'IBM Plex Mono',monospace; }
  .wa-detail-count { position:relative; z-index:1; font-size:11px; font-weight:600; color:var(--v2-fg-3); font-family:'IBM Plex Mono',monospace; padding-left:8px; }
  .wa-perf-ms { position:relative; z-index:1; font-size:11.5px; font-weight:700; color:var(--v2-fg); font-family:'IBM Plex Mono',monospace; padding-left:8px; white-space:nowrap; }

  .wa-perf-section-title { font-size:13px; font-weight:700; color:var(--v2-fg); font-family:var(--font-ui); }
  .wa-perf-section-desc { font-size:11px; color:var(--v2-fg-3); margin-top:2px; }
  .wa-perf-stats-row { display:flex; justify-content:space-between; flex-wrap:wrap; gap:16px; margin-top:14px; }
  .wa-perf-stat { display:flex; flex-direction:column; gap:5px; }
  .wa-perf-stat-label { display:flex; align-items:center; gap:6px; font-size:9.5px; letter-spacing:0.06em; text-transform:uppercase; color:var(--v2-fg-3); font-family:'IBM Plex Mono',monospace; }
  .wa-perf-stat-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
  .wa-perf-stat-value { font-size:19px; font-weight:700; font-family:var(--font-ui); color:var(--v2-fg); }
  .wa-perf-divider { border:none; border-top:1px solid var(--v2-line); margin:4px 0; }

  .wa-cwv-mini-title { font-size:12px; font-weight:500;   color:var(--v2-fg); font-family:var(--font-ui); margin-bottom:8px; }
  .wa-cwv-mini-row { display:grid; grid-template-columns:34px 1fr; align-items:center; gap:8px; margin-bottom:6px; }
  .wa-cwv-mini-row:last-child { margin-bottom:0; }
  .wa-cwv-mini-label { font-size:11px; font-weight:700; color:var(--v2-fg); font-family:'IBM Plex Mono',monospace; }
  .wa-cwv-mini-bar { display:flex; height:8px; border-radius:4px; overflow:hidden; background:rgba(var(--tl-ink, 255,255,255),0.06); }
  .wa-cwv-mini-bar span { height:100%; }

  .wa-block { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:10px; overflow:hidden; }
  .wa-metric-header { padding:14px 18px 12px; border-bottom:1px solid var(--v2-line); }
  .wa-metric-title { font-size:13px; font-weight:700; color:var(--v2-fg); font-family:var(--font-ui); }
  .wa-metric-desc { font-size:11px; color:var(--v2-fg-3); margin-top:4px; max-width:70ch; }

  .wa-quality-row { display:grid; grid-template-columns:repeat(3,1fr); gap:16px; padding:14px 18px; border-bottom:1px solid var(--v2-line); }
  .wa-quality-label { font-size:9.5px; letter-spacing:0.06em; text-transform:uppercase; color:var(--v2-fg-3); font-family:'IBM Plex Mono',monospace; border-bottom:1px dotted var(--v2-line-strong); padding-bottom:2px; width:fit-content; }
  .wa-quality-value { font-size:19px; font-weight:700; font-family:var(--font-ui); margin:4px 0; display:block; }
  .wa-quality-track { height:5px; border-radius:3px; background:rgba(var(--tl-ink, 255,255,255),0.06); overflow:hidden; }
  .wa-quality-fill { height:100%; border-radius:3px; }

  .wa-group-row { display:flex; align-items:center; justify-content:space-between; padding:10px 18px; border-bottom:1px solid var(--v2-line); flex-wrap:wrap; gap:8px; }
  .wa-group-tabs { display:flex; align-items:center; gap:3px; }
  .wa-group-tab { padding:4px 10px; border-radius:6px; font-size:10.5px; font-weight:600; border:none; background:transparent; color:var(--v2-fg-3); cursor:pointer; font-family:var(--font-ui); }
  .wa-group-tab.active { background:${T.accentGlow}; color:${T.accent}; }
  .wa-group-tab:disabled { opacity:0.4; cursor:not-allowed; }

  .wa-stacked-wrap { padding:14px 18px 18px; }
  .wa-stacked-legend { display:flex; justify-content:flex-end; gap:14px; margin-bottom:10px; font-size:10px; font-family:'IBM Plex Mono',monospace; color:var(--v2-fg-3); }
  .wa-stacked-legend span { display:inline-flex; align-items:center; gap:5px; }
  .wa-legend-dot { width:7px; height:7px; border-radius:2px; }
  .wa-stacked-row { display:grid; grid-template-columns:200px 1fr auto; align-items:center; gap:10px; margin-bottom:8px; }
  .wa-stacked-row:last-child { margin-bottom:0; }
  .wa-stacked-label { font-size:11px; font-family:'IBM Plex Mono',monospace; color:var(--v2-fg); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .wa-stacked-bar { display:flex; height:14px; border-radius:3px; overflow:hidden; background:rgba(var(--tl-ink, 255,255,255),0.04); }
  .wa-stacked-bar span { height:100%; }
  .wa-stacked-count { font-size:10.5px; color:var(--v2-fg-3); font-family:'IBM Plex Mono',monospace; }

  .wa-debug-header { display:flex; align-items:center; justify-content:space-between; padding:12px 18px 8px; border-top:1px solid var(--v2-line); }
  .wa-debug-title { font-size:10.5px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:var(--v2-fg); font-family:'IBM Plex Mono',monospace; }
  .wa-debug-table-wrap { overflow-x:auto; padding:0 18px 16px; }
  .wa-debug-table { width:100%; border-collapse:collapse; min-width:480px; }
  .wa-debug-table th { text-align:left; font-size:12px;   color:var(--v2-fg-3); font-family:var(--font-ui); padding:6px 8px; border-bottom:1px solid var(--v2-line); }
  .wa-debug-table th.num { text-align:right; }
  .wa-debug-table td { padding:8px; border-bottom:1px solid rgba(var(--tl-line-rgb, 30,38,64),0.5); }
  .wa-debug-table tr:last-child td { border-bottom:none; }
  .wa-debug-element { font-size:11px; font-family:'IBM Plex Mono',monospace; color:var(--v2-fg); max-width:420px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .wa-debug-metric { display:inline-flex; align-items:center; gap:5px; font-size:11px; font-family:'IBM Plex Mono',monospace; font-weight:600; white-space:nowrap; }
  .wa-debug-dot { width:6px; height:6px; border-radius:50%; flex-shrink:0; }
  .wa-debug-count { text-align:right; font-size:11px; font-family:'IBM Plex Mono',monospace; color:var(--v2-fg-3); }

  .wa-empty { padding:8px; text-align:center; font-size:11px; color:var(--v2-fg-3); }
  .wa-state-box { padding:32px 24px; background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:10px; display:flex; flex-direction:column; align-items:center; gap:10px; text-align:center; }
  .wa-hint-box { display:flex; gap:8px; padding:10px 14px; background:var(--v2-surface-2); border:1px solid var(--v2-line); border-radius:8px; font-size:11px; color:var(--v2-fg-3); line-height:1.5; }

  .wa-pctl-wrap { padding:14px 18px 6px; border-bottom:1px solid var(--v2-line); }
  .wa-pctl-row { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:16px; margin-bottom:16px; }
  .wa-pctl-item { display:flex; flex-direction:column; gap:5px; min-width:0; }
  .wa-pctl-item-label { display:flex; align-items:center; gap:6px; }
  .wa-pctl-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
  .wa-pctl-label { font-size:10px; font-family:'IBM Plex Mono',monospace; color:var(--v2-fg-3); }
  .wa-pctl-value { font-weight:700; color:var(--v2-fg); font-size:20px; font-family:var(--font-ui); }
  .wa-pctl-chart { padding-bottom:12px; }

  .wa-tip { position:fixed; z-index:9999; pointer-events:none; background:var(--v2-surface-2); border:1px solid var(--v2-line-strong); border-radius:8px; padding:8px 12px; font-family:var(--font-ui); box-shadow:0 20px 40px rgba(0,0,0,0.5); white-space:nowrap; transform:translate(12px,-100%); }
  .wa-tip-title { font-size:11px; font-weight:700; color:var(--v2-fg); margin-bottom:4px; font-family:'IBM Plex Mono',monospace; max-width:280px; overflow:hidden; text-overflow:ellipsis; }
  .wa-tip-row { display:flex; align-items:center; gap:6px; font-size:11px; color:var(--v2-fg); }
  .wa-tip-dot { width:7px; height:7px; border-radius:2px; flex-shrink:0; }
  .wa-tip-val { font-weight:700; margin-left:2px; font-family:'IBM Plex Mono',monospace; }

  .wa-rtip { background:var(--v2-surface-2); border:1px solid var(--v2-line-strong); border-radius:8px; padding:8px 12px; font-family:var(--font-ui); box-shadow:0 20px 40px rgba(0,0,0,0.5); }
  .wa-rtip-label { font-size:10px; font-family:'IBM Plex Mono',monospace; color:var(--v2-fg-3); margin-bottom:5px; }
  .wa-rtip-row { display:flex; align-items:center; gap:6px; font-size:11px; margin-bottom:2px; }
  .wa-rtip-row:last-child { margin-bottom:0; }
  .wa-rtip-dot { width:7px; height:7px; border-radius:2px; flex-shrink:0; }
  .wa-rtip-name { color:var(--v2-fg-3); }
  .wa-rtip-val { color:var(--v2-fg); font-weight:700; margin-left:auto; font-family:'IBM Plex Mono',monospace; }
`;

const PCTL_COLORS = ["#3B82F6", "#F59E0B", "#10B981", "#EC4899"];

const PERF_METRIC_LABEL: Record<PerfMetricKey, string> = {
  pageLoad: "Page load",
  dns: "DNS",
  connection: "TCP",
  request: "Request",
  response: "Response",
  pageRender: "Processing",
  loadEvent: "Load Event",
  firstPaint: "First Paint",
  firstContentfulPaint: "First Contentful Paint",
};
const PERF_METRIC_COLOR: Record<PerfMetricKey, string> = {
  pageLoad: "#3B82F6",
  dns: "#60A5FA",
  connection: "#F59E0B",
  request: "#FBBF24",
  response: "#10B981",
  pageRender: "#34D399",
  loadEvent: "#EC4899",
  firstPaint: "#3B82F6",
  firstContentfulPaint: "#F59E0B",
};
const PAGE_LOAD_CHART_METRICS: PerfMetricKey[] = ["pageLoad", "dns", "connection", "request", "response", "pageRender", "loadEvent"];
const PAINT_CHART_METRICS: PerfMetricKey[] = ["firstPaint", "firstContentfulPaint"];
const PERCENTILE_OPTIONS: Array<{ key: PerfPercentile; label: string }> = [
  { key: "p50", label: "P50 (Median)" },
  { key: "p75", label: "P75" },
  { key: "p90", label: "P90" },
  { key: "p99", label: "P99" },
];

const GROUP_TABS = [
  { key: "url", label: "URL" },
  { key: "browser", label: "Browser" },
  { key: "os", label: "Operating system" },
  { key: "country", label: "Country" },
  { key: "element", label: "Element" },
];

function fmtMs(n: number) {
  return `${Math.round(n).toLocaleString("pt-BR")}ms`;
}
function fmtScore(n: number) {
  return n.toFixed(2);
}
function fmtCount(n: number) {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("pt-BR");
}

function pct(part: number, total: number) {
  return total > 0 ? (part / total) * 100 : 0;
}
// Eixo/cards/tooltip do gráfico de percentis do LCP replicam o padrão de número
// do painel nativo da Cloudflare (separador de milhar "," em vez de "."), só
// nesse bloco — o resto da aba (Debug View, INP, CLS) continua em pt-BR.
function fmtMsEn(n: number) {
  return `${Math.round(n).toLocaleString("en-US")}ms`;
}
function fmtHour(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
// Rótulo do eixo X do gráfico de percentis: só HH:mm (o tooltip já mostra o dia
// completo) — evita textos longos se sobrepondo quando há muitos pontos de 15min.
function fmtTickHour(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

// Mede a própria largura via ResizeObserver — dentro de flex column sem grid
// explícito, o ResponsiveContainer do recharts às vezes nunca resolve uma
// largura definida e o gráfico "some" com SVG 0x0.
function ChartBox({ height, children }: { height: number; children: (width: number) => React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(0);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.floor(el.getBoundingClientRect().width));
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ width: "100%", height }}>
      {width > 0 ? children(width) : null}
    </div>
  );
}

// Segmento de barra com tooltip on-hover (posicionado via clientX/Y, sem depender
// de portal — position:fixed escapa do overflow dos containers pai).
function TipSegment({
  width,
  background,
  content,
}: {
  width: string;
  background: string;
  content: React.ReactNode;
}) {
  const [pos, setPos] = React.useState<{ x: number; y: number } | null>(null);
  return (
    <span
      style={{ width, background, position: "relative" }}
      onMouseMove={(e) => setPos({ x: e.clientX, y: e.clientY })}
      onMouseLeave={() => setPos(null)}
    >
      {pos && (
        <div className="wa-tip" style={{ left: pos.x, top: pos.y }}>
          {content}
        </div>
      )}
    </span>
  );
}

function SeriesTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="wa-rtip">
      <div className="wa-rtip-label">{fmtHour(String(label))}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="wa-rtip-row">
          <span className="wa-rtip-dot" style={{ background: p.color }} />
          <span className="wa-rtip-name">{p.name}</span>
          <span className="wa-rtip-val">{fmtMsEn(Number(p.value))}</span>
        </div>
      ))}
    </div>
  );
}

function VisitsTooltip({ active, payload, label, metricLabel = "Visits" }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="wa-rtip">
      <div className="wa-rtip-label">{fmtHour(String(label))}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="wa-rtip-row">
          <span className="wa-rtip-dot" style={{ background: p.color }} />
          <span className="wa-rtip-name">{metricLabel}</span>
          <span className="wa-rtip-val">{fmtCount(Number(p.value))}</span>
        </div>
      ))}
    </div>
  );
}

// `invert`: pra métricas onde SUBIR é ruim (ex.: Page load time) — o sentido da
// seta continua o mesmo (sinal de `pct`), só a cor de bom/ruim inverte.
function TrendTag({ pct, invert = false }: { pct: number; invert?: boolean }) {
  const down = pct < 0;
  const isGood = invert ? down : !down;
  const color = isGood ? T.success : T.danger;
  return (
    <span className="wa-kpi-trend" style={{ color }}>
      {down ? <ArrowDownRight size={13} /> : <ArrowUpRight size={13} />}
      {Math.abs(pct).toFixed(2)}%
    </span>
  );
}

// ── "+ Add filter" (mesmo padrão do HTTP Traffic, campos do RUM) ───────────────
function VisitsFilterBar({
  filters,
  onChange,
}: {
  filters: AnalyticsFilterCondition[];
  onChange: (next: AnalyticsFilterCondition[]) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [fieldKey, setFieldKey] = React.useState("");
  const [op, setOp] = React.useState<AnalyticsFilterOp>("eq");
  const [value, setValue] = React.useState("");
  const def = fieldKey ? RUM_VISITS_FILTER_FIELDS[fieldKey] : null;

  function addFilter() {
    if (!def || !value.trim()) return;
    onChange([...filters, { field: def.key, op, value: value.trim() }]);
    setFieldKey("");
    setValue("");
    setOp("eq");
    setOpen(false);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="wa-add-filter-btn">
            <Plus size={12} /> Add filter
          </button>
        </PopoverTrigger>
        <PopoverContent className="wa-filter-popover" align="start">
          <div className="wa-filter-field">
            <span className="wa-filter-field-label">Campo</span>
            <Select
              value={fieldKey || undefined}
              onValueChange={(v) => {
                setFieldKey(v);
                setOp("eq");
              }}
            >
              <SelectTrigger className="wa-select-trigger">
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent className="wa-select-content">
                {Object.values(RUM_VISITS_FILTER_FIELDS).map((f) => (
                  <SelectItem key={f.key} value={f.key} className="wa-select-item">
                    {f.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {def && (
            <>
              <div className="wa-filter-field">
                <span className="wa-filter-field-label">Operador</span>
                <Select value={op} onValueChange={(v) => setOp(v as AnalyticsFilterOp)}>
                  <SelectTrigger className="wa-select-trigger">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="wa-select-content">
                    {def.ops.map((o) => (
                      <SelectItem key={o} value={o} className="wa-select-item">
                        {o === "eq" ? "é" : o === "neq" ? "não é" : "está em (lista)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="wa-filter-field">
                <span className="wa-filter-field-label">Valor</span>
                <input
                  type="text"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addFilter()}
                  placeholder="ex.: www.google.com"
                />
              </div>
              <button className="wa-add-filter-btn" onClick={addFilter}>
                <Check size={12} /> Adicionar
              </button>
            </>
          )}
        </PopoverContent>
      </Popover>
      {filters.map((c, i) => (
        <span key={i} className="wa-filter-chip">
          {RUM_VISITS_FILTER_FIELDS[c.field]?.label ?? c.field} {c.op === "eq" ? "=" : c.op === "neq" ? "≠" : "∈"}{" "}
          {Array.isArray(c.value) ? c.value.join(", ") : String(c.value)}
          <span className="close" onClick={() => onChange(filters.filter((_, j) => j !== i))}>
            <X size={10} />
          </span>
        </span>
      ))}
    </div>
  );
}

const NO_FILTER_VALUES = new Set(["—", "None (direct)"]);

// ── "Visits by source": breakdown por referer/path/host/browser/os/device ──────
function VisitsPanel({
  title,
  rows,
  onRowClick,
}: {
  title: string;
  rows: Array<{ value: string; visits: number }>;
  onRowClick?: (value: string) => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const shown = expanded ? rows.slice(0, 25) : rows.slice(0, 5);
  const max = Math.max(1, ...rows.map((r) => r.visits));
  return (
    <div className="wa-detail-panel">
      <div className="wa-detail-panel-header">
        <span>{title}</span>
        {rows.length > 5 && (
          <button className="wa-detail-expand" onClick={() => setExpanded((e) => !e)}>
            {expanded ? "menos" : `+${Math.min(rows.length, 25) - 5}`}
          </button>
        )}
      </div>
      <div className="wa-detail-panel-body">
        {shown.length === 0 ? (
          <div className="wa-empty">Sem dados no período.</div>
        ) : (
          shown.map((r, i) => {
            const clickable = !!onRowClick && !NO_FILTER_VALUES.has(r.value);
            return (
              <div
                key={i}
                className={`wa-detail-row${clickable ? " clickable" : ""}`}
                title={r.value}
                onClick={() => clickable && onRowClick!(r.value)}
              >
                <div className="wa-detail-bar" style={{ width: `${Math.max(4, (r.visits / max) * 100)}%` }} />
                <span className="wa-detail-label">{r.value}</span>
                <span className="wa-detail-count">{fmtCount(r.visits)}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

// ── "Page load time by source": mesmo painel, mas o valor exibido é ms; a barra
// (e a ordenação) seguem count, o mesmo padrão da query real do dash Cloudflare ──
function PerfPanel({
  title,
  rows,
  onRowClick,
}: {
  title: string;
  rows: Array<{ value: string; ms: number; count: number }>;
  onRowClick?: (value: string) => void;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const shown = expanded ? rows.slice(0, 25) : rows.slice(0, 5);
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className="wa-detail-panel">
      <div className="wa-detail-panel-header">
        <span>{title}</span>
        {rows.length > 5 && (
          <button className="wa-detail-expand" onClick={() => setExpanded((e) => !e)}>
            {expanded ? "menos" : `+${Math.min(rows.length, 25) - 5}`}
          </button>
        )}
      </div>
      <div className="wa-detail-panel-body">
        {shown.length === 0 ? (
          <div className="wa-empty">Sem dados no período.</div>
        ) : (
          shown.map((r, i) => {
            const clickable = !!onRowClick && !NO_FILTER_VALUES.has(r.value);
            return (
              <div
                key={i}
                className={`wa-detail-row${clickable ? " clickable" : ""}`}
                title={r.value}
                onClick={() => clickable && onRowClick!(r.value)}
              >
                <div className="wa-detail-bar" style={{ width: `${Math.max(4, (r.count / max) * 100)}%` }} />
                <span className="wa-detail-label">{r.value}</span>
                <span className="wa-perf-ms">{fmtMsEn(r.ms)}</span>
                <span className="wa-detail-count">{fmtCount(r.count)}</span>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function PerfStat({ metric, value }: { metric: PerfMetricKey; value: number }) {
  return (
    <div className="wa-perf-stat">
      <span className="wa-perf-stat-label">
        <span className="wa-perf-stat-dot" style={{ background: PERF_METRIC_COLOR[metric] }} />
        {PERF_METRIC_LABEL[metric]}
      </span>
      <span className="wa-perf-stat-value">{fmtMsEn(value)}</span>
    </div>
  );
}

function PerfSeriesTooltip({ active, payload, label, metrics }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="wa-rtip">
      <div className="wa-rtip-label">{fmtHour(String(label))}</div>
      {(metrics as PerfMetricKey[]).map((m) => {
        const p = payload.find((x: any) => x.dataKey === m);
        if (!p) return null;
        return (
          <div key={m} className="wa-rtip-row">
            <span className="wa-rtip-dot" style={{ background: PERF_METRIC_COLOR[m] }} />
            <span className="wa-rtip-name">{PERF_METRIC_LABEL[m]}</span>
            <span className="wa-rtip-val">{fmtMsEn(Number(p.value))}</span>
          </div>
        );
      })}
    </div>
  );
}

// ── Conteúdo do modal "Visits" (aberto ao clicar no KPI) ────────────────────────
function VisitsDetailBody({ zoneId, days }: { zoneId: string | null; days: number }) {
  const [filters, setFilters] = React.useState<AnalyticsFilterCondition[]>([]);
  const fetchDetail = useServerFn(getWebAnalyticsVisitsDetail);
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["cloudflare-web-analytics-visits-detail", zoneId, days, filters],
    enabled: !!zoneId,
    queryFn: () => fetchDetail({ data: { zoneId, days, filters } }),
  });
  const d = (data as any)?.ok ? (data as any) : null;

  function addValueFilter(field: string, value: string) {
    setFilters((f) => [...f, { field, op: "eq", value }]);
  }

  return (
    <div className="wa-detail-root">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <VisitsFilterBar filters={filters} onChange={setFilters} />
        {isFetching && !isLoading && <span style={{ fontSize: 10, color: V2.textMuted }}>atualizando…</span>}
      </div>

      {isLoading ? (
        <div className="wa-empty">Carregando…</div>
      ) : !d ? (
        <div className="wa-empty">{(data as any)?.error ?? "Sem dados."}</div>
      ) : (
        <>
          {d.warning && (
            <div className="wa-hint-box">
              <AlertTriangle size={13} color={T.warning} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{d.warning}</span>
            </div>
          )}
          <div className="wa-detail-total-row">
            <span className="wa-detail-total-label">Total visits</span>
            <span className="wa-detail-total-value">{fmtCount(d.total)}</span>
            {d.deltaPct != null && <TrendTag pct={d.deltaPct} />}
          </div>

          {d.series.length > 1 && (
            <ChartBox height={240}>
              {(width) => {
                const points = d.series as Array<{ ts: string; visits: number }>;
                const interval = Math.max(0, Math.ceil(points.length / 8) - 1);
                return (
                  <AreaChart width={width} height={240} data={points} margin={{ top: 10, right: 16, bottom: 8, left: 0 }}>
                    <defs>
                      <linearGradient id="wa-visits-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={T.accent} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={T.accent} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 4" stroke={T.border} vertical={false} />
                    <XAxis
                      dataKey="ts"
                      interval={interval}
                      stroke={T.textDim}
                      fontSize={10}
                      tick={{ fill: T.textDim, fontFamily: "'IBM Plex Mono',monospace" }}
                      tickLine={false}
                      axisLine={{ stroke: T.border }}
                      tickFormatter={fmtTickHour}
                    />
                    <YAxis
                      width={50}
                      stroke={T.textDim}
                      fontSize={10}
                      tick={{ fill: T.textDim, fontFamily: "'IBM Plex Mono',monospace" }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => fmtCount(Number(v))}
                    />
                    <RTooltip content={<VisitsTooltip />} cursor={{ stroke: T.borderHi }} />
                    <Area type="monotone" dataKey="visits" stroke={T.accent} fill="url(#wa-visits-fill)" strokeWidth={2} dot={false} name="Visits" />
                  </AreaChart>
                );
              }}
            </ChartBox>
          )}

          <div className="wa-detail-grid">
            <VisitsPanel title="Referers" rows={d.referers} onRowClick={(v) => addValueFilter("referer", v)} />
            <VisitsPanel title="Paths" rows={d.paths} onRowClick={(v) => addValueFilter("path", v)} />
            <VisitsPanel title="Hosts" rows={d.hosts} onRowClick={(v) => addValueFilter("host", v)} />
            <VisitsPanel title="Browsers" rows={d.browsers} onRowClick={(v) => addValueFilter("browser", v)} />
            <VisitsPanel title="Operating systems" rows={d.operatingSystems} onRowClick={(v) => addValueFilter("os", v)} />
            <VisitsPanel title="Device types" rows={d.deviceTypes} onRowClick={(v) => addValueFilter("deviceType", v)} />
          </div>
        </>
      )}
    </div>
  );
}

// ── Conteúdo do modal "Page views" (mesmo tratamento de Visits, métrica = count) ─
function PageViewsDetailBody({ zoneId, days }: { zoneId: string | null; days: number }) {
  const [filters, setFilters] = React.useState<AnalyticsFilterCondition[]>([]);
  const fetchDetail = useServerFn(getWebAnalyticsPageViewsDetail);
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["cloudflare-web-analytics-pageviews-detail", zoneId, days, filters],
    enabled: !!zoneId,
    queryFn: () => fetchDetail({ data: { zoneId, days, filters } }),
  });
  const d = (data as any)?.ok ? (data as any) : null;

  function addValueFilter(field: string, value: string) {
    setFilters((f) => [...f, { field, op: "eq", value }]);
  }

  return (
    <div className="wa-detail-root">
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <VisitsFilterBar filters={filters} onChange={setFilters} />
        {isFetching && !isLoading && <span style={{ fontSize: 10, color: V2.textMuted }}>atualizando…</span>}
      </div>

      {isLoading ? (
        <div className="wa-empty">Carregando…</div>
      ) : !d ? (
        <div className="wa-empty">{(data as any)?.error ?? "Sem dados."}</div>
      ) : (
        <>
          {d.warning && (
            <div className="wa-hint-box">
              <AlertTriangle size={13} color={T.warning} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{d.warning}</span>
            </div>
          )}
          <div className="wa-detail-total-row">
            <span className="wa-detail-total-label">Total page views</span>
            <span className="wa-detail-total-value">{fmtCount(d.total)}</span>
            {d.deltaPct != null && <TrendTag pct={d.deltaPct} />}
          </div>

          {d.series.length > 1 && (
            <ChartBox height={240}>
              {(width) => {
                const points = (d.series as Array<{ ts: string; views: number }>).map((p) => ({ ts: p.ts, visits: p.views }));
                const interval = Math.max(0, Math.ceil(points.length / 8) - 1);
                return (
                  <AreaChart width={width} height={240} data={points} margin={{ top: 10, right: 16, bottom: 8, left: 0 }}>
                    <defs>
                      <linearGradient id="wa-pageviews-fill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={T.accent} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={T.accent} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="2 4" stroke={T.border} vertical={false} />
                    <XAxis
                      dataKey="ts"
                      interval={interval}
                      stroke={T.textDim}
                      fontSize={10}
                      tick={{ fill: T.textDim, fontFamily: "'IBM Plex Mono',monospace" }}
                      tickLine={false}
                      axisLine={{ stroke: T.border }}
                      tickFormatter={fmtTickHour}
                    />
                    <YAxis
                      width={50}
                      stroke={T.textDim}
                      fontSize={10}
                      tick={{ fill: T.textDim, fontFamily: "'IBM Plex Mono',monospace" }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => fmtCount(Number(v))}
                    />
                    <RTooltip content={<VisitsTooltip metricLabel="Page views" />} cursor={{ stroke: T.borderHi }} />
                    <Area type="monotone" dataKey="visits" stroke={T.accent} fill="url(#wa-pageviews-fill)" strokeWidth={2} dot={false} name="Page views" />
                  </AreaChart>
                );
              }}
            </ChartBox>
          )}

          <div className="wa-detail-grid">
            <VisitsPanel
              title="Referers"
              rows={d.referers.map((r: any) => ({ value: r.value, visits: r.views }))}
              onRowClick={(v) => addValueFilter("referer", v)}
            />
            <VisitsPanel
              title="Paths"
              rows={d.paths.map((r: any) => ({ value: r.value, visits: r.views }))}
              onRowClick={(v) => addValueFilter("path", v)}
            />
            <VisitsPanel
              title="Hosts"
              rows={d.hosts.map((r: any) => ({ value: r.value, visits: r.views }))}
              onRowClick={(v) => addValueFilter("host", v)}
            />
            <VisitsPanel
              title="Browsers"
              rows={d.browsers.map((r: any) => ({ value: r.value, visits: r.views }))}
              onRowClick={(v) => addValueFilter("browser", v)}
            />
            <VisitsPanel
              title="Operating systems"
              rows={d.operatingSystems.map((r: any) => ({ value: r.value, visits: r.views }))}
              onRowClick={(v) => addValueFilter("os", v)}
            />
            <VisitsPanel
              title="Device types"
              rows={d.deviceTypes.map((r: any) => ({ value: r.value, visits: r.views }))}
              onRowClick={(v) => addValueFilter("deviceType", v)}
            />
          </div>
        </>
      )}
    </div>
  );
}

// ── Conteúdo do modal "Page load time" ──────────────────────────────────────────
// AVISO: "Average (Mean)" existe no seletor nativo da Cloudflare mas o campo
// correspondente não foi confirmado numa captura real — só P50/P75/P90/P99.
function PageLoadTimeDetailBody({ zoneId, days }: { zoneId: string | null; days: number }) {
  const [filters, setFilters] = React.useState<AnalyticsFilterCondition[]>([]);
  const [percentile, setPercentile] = React.useState<PerfPercentile>("p75");
  const fetchDetail = useServerFn(getWebAnalyticsPageLoadTimeDetail);
  const { data, isLoading, isFetching } = useQuery({
    queryKey: ["cloudflare-web-analytics-pageloadtime-detail", zoneId, days, percentile, filters],
    enabled: !!zoneId,
    queryFn: () => fetchDetail({ data: { zoneId, days, percentile, filters } }),
  });
  const d = (data as any)?.ok ? (data as any) : null;

  function addValueFilter(field: string, value: string) {
    setFilters((f) => [...f, { field, op: "eq", value }]);
  }

  return (
    <div className="wa-detail-root">
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
        <VisitsFilterBar filters={filters} onChange={setFilters} />
        <Select value={percentile} onValueChange={(v) => setPercentile(v as PerfPercentile)}>
          <SelectTrigger className="wa-select-trigger" style={{ width: 150, marginLeft: "auto" }}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="wa-select-content">
            {PERCENTILE_OPTIONS.map((o) => (
              <SelectItem key={o.key} value={o.key} className="wa-select-item">
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isFetching && !isLoading && <span style={{ fontSize: 10, color: V2.textMuted }}>atualizando…</span>}
      </div>

      {isLoading ? (
        <div className="wa-empty">Carregando…</div>
      ) : !d ? (
        <div className="wa-empty">{(data as any)?.error ?? "Sem dados."}</div>
      ) : (
        <>
          {d.warning && (
            <div className="wa-hint-box">
              <AlertTriangle size={13} color={T.warning} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{d.warning}</span>
            </div>
          )}

          <div>
            <div className="wa-perf-section-title">Page load time summary</div>
            <div className="wa-perf-section-desc">Tempo total que levou pra carregar a página.</div>
            <div className="wa-perf-stats-row">
              <PerfStat metric="pageLoad" value={d.metrics.pageLoad} />
              <PerfStat metric="dns" value={d.metrics.dns} />
              <PerfStat metric="connection" value={d.metrics.connection} />
              <PerfStat metric="request" value={d.metrics.request} />
              <PerfStat metric="response" value={d.metrics.response} />
              <PerfStat metric="pageRender" value={d.metrics.pageRender} />
            </div>
            <div className="wa-perf-stats-row">
              <PerfStat metric="loadEvent" value={d.metrics.loadEvent} />
            </div>
          </div>

          {d.series.length > 1 && (
            <ChartBox height={240}>
              {(width) => {
                const interval = Math.max(0, Math.ceil(d.series.length / 8) - 1);
                return (
                  <LineChart width={width} height={240} data={d.series} margin={{ top: 10, right: 16, bottom: 8, left: 0 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke={T.border} vertical={false} />
                    <XAxis
                      dataKey="ts"
                      interval={interval}
                      stroke={T.textDim}
                      fontSize={10}
                      tick={{ fill: T.textDim, fontFamily: "'IBM Plex Mono',monospace" }}
                      tickLine={false}
                      axisLine={{ stroke: T.border }}
                      tickFormatter={fmtTickHour}
                    />
                    <YAxis
                      width={64}
                      stroke={T.textDim}
                      fontSize={10}
                      tick={{ fill: T.textDim, fontFamily: "'IBM Plex Mono',monospace" }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => fmtMsEn(Number(v))}
                    />
                    <RTooltip content={<PerfSeriesTooltip metrics={PAGE_LOAD_CHART_METRICS} />} cursor={{ stroke: T.borderHi }} />
                    {PAGE_LOAD_CHART_METRICS.map((m) => (
                      <Line key={m} type="monotone" dataKey={m} stroke={PERF_METRIC_COLOR[m]} strokeWidth={1.5} dot={false} name={PERF_METRIC_LABEL[m]} />
                    ))}
                  </LineChart>
                );
              }}
            </ChartBox>
          )}

          <hr className="wa-perf-divider" />

          <div>
            <div className="wa-perf-section-title">Paint timing summary</div>
            <div className="wa-perf-section-desc">Tempo até a primeira renderização visual da página.</div>
            <div className="wa-perf-stats-row">
              <PerfStat metric="firstPaint" value={d.metrics.firstPaint} />
              <PerfStat metric="firstContentfulPaint" value={d.metrics.firstContentfulPaint} />
            </div>
          </div>

          {d.series.length > 1 && (
            <ChartBox height={200}>
              {(width) => {
                const interval = Math.max(0, Math.ceil(d.series.length / 8) - 1);
                return (
                  <LineChart width={width} height={200} data={d.series} margin={{ top: 10, right: 16, bottom: 8, left: 0 }}>
                    <CartesianGrid strokeDasharray="2 4" stroke={T.border} vertical={false} />
                    <XAxis
                      dataKey="ts"
                      interval={interval}
                      stroke={T.textDim}
                      fontSize={10}
                      tick={{ fill: T.textDim, fontFamily: "'IBM Plex Mono',monospace" }}
                      tickLine={false}
                      axisLine={{ stroke: T.border }}
                      tickFormatter={fmtTickHour}
                    />
                    <YAxis
                      width={64}
                      stroke={T.textDim}
                      fontSize={10}
                      tick={{ fill: T.textDim, fontFamily: "'IBM Plex Mono',monospace" }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => fmtMsEn(Number(v))}
                    />
                    <RTooltip content={<PerfSeriesTooltip metrics={PAINT_CHART_METRICS} />} cursor={{ stroke: T.borderHi }} />
                    {PAINT_CHART_METRICS.map((m) => (
                      <Line key={m} type="monotone" dataKey={m} stroke={PERF_METRIC_COLOR[m]} strokeWidth={1.5} dot={false} name={PERF_METRIC_LABEL[m]} />
                    ))}
                  </LineChart>
                );
              }}
            </ChartBox>
          )}

          <hr className="wa-perf-divider" />

          <div>
            <div className="wa-perf-section-title">Page load time by source</div>
            <div className="wa-detail-grid" style={{ marginTop: 12 }}>
              <PerfPanel title="Referers" rows={d.referers} onRowClick={(v) => addValueFilter("referer", v)} />
              <PerfPanel title="Paths" rows={d.paths} onRowClick={(v) => addValueFilter("path", v)} />
              <PerfPanel title="Hosts" rows={d.hosts} onRowClick={(v) => addValueFilter("host", v)} />
              <PerfPanel title="Browsers" rows={d.browsers} onRowClick={(v) => addValueFilter("browser", v)} />
              <PerfPanel title="Operating systems" rows={d.operatingSystems} onRowClick={(v) => addValueFilter("os", v)} />
              <PerfPanel title="Device types" rows={d.deviceTypes} onRowClick={(v) => addValueFilter("deviceType", v)} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Bloco de um Core Web Vital (LCP/INP/CLS) ────────────────────────────────────
function VitalBlock({
  vitalKey,
  title,
  description,
  summary,
  groupDim,
  onGroupDimChange,
  groupLoading,
  groupError,
  valueFormatter,
}: {
  vitalKey: WebVitalKey;
  title: string;
  description: string;
  summary: WebVitalSummary | null;
  groupDim: string;
  onGroupDimChange: (dim: string) => void;
  groupLoading: boolean;
  groupError: string | null;
  valueFormatter: (n: number) => string;
}) {
  const total = summary?.total ?? 0;
  const goodPct = pct(summary?.good ?? 0, total);
  const needsPct = pct(summary?.needsImprovement ?? 0, total);
  const poorPct = pct(summary?.poor ?? 0, total);
  const maxRow = Math.max(1, ...(summary?.breakdown ?? []).map((r) => r.total));

  return (
    <div className="wa-block">
      <div className="wa-metric-header">
        <div className="wa-metric-title">{title}</div>
        <div className="wa-metric-desc">{description}</div>
      </div>

      <div className="wa-quality-row">
        <div>
          <span className="wa-quality-label">Good</span>
          <span className="wa-quality-value" style={{ color: T.success }}>
            {total ? `${goodPct.toFixed(0)}%` : "—"}
          </span>
          <div className="wa-quality-track">
            <div className="wa-quality-fill" style={{ width: `${goodPct}%`, background: T.success }} />
          </div>
        </div>
        <div>
          <span className="wa-quality-label">Needs Improvement</span>
          <span className="wa-quality-value" style={{ color: T.warning }}>
            {total ? `${needsPct.toFixed(0)}%` : "—"}
          </span>
          <div className="wa-quality-track">
            <div className="wa-quality-fill" style={{ width: `${needsPct}%`, background: T.warning }} />
          </div>
        </div>
        <div>
          <span className="wa-quality-label">Poor</span>
          <span className="wa-quality-value" style={{ color: T.danger }}>
            {total ? `${poorPct.toFixed(0)}%` : "—"}
          </span>
          <div className="wa-quality-track">
            <div className="wa-quality-fill" style={{ width: `${poorPct}%`, background: T.danger }} />
          </div>
        </div>
      </div>

      <div className="wa-group-row">
        <div className="wa-group-tabs">
          {GROUP_TABS.map((t) => (
            <button
              key={t.key}
              className={`wa-group-tab${groupDim === t.key ? " active" : ""}`}
              onClick={() => onGroupDimChange(t.key)}
            >
              {t.label}
            </button>
          ))}
        </div>
        {groupLoading && <span style={{ fontSize: 10, color: V2.textMuted }}>carregando…</span>}
      </div>

      <div className="wa-stacked-wrap">
        {groupError ? (
          <div className="wa-empty">{groupError}</div>
        ) : !summary || summary.breakdown.length === 0 ? (
          <div className="wa-empty">Sem dados no período.</div>
        ) : (
          <>
            <div className="wa-stacked-legend">
              <span>
                <span className="wa-legend-dot" style={{ background: T.success }} />
                Good
              </span>
              <span>
                <span className="wa-legend-dot" style={{ background: T.warning }} />
                Needs Improvement
              </span>
              <span>
                <span className="wa-legend-dot" style={{ background: T.danger }} />
                Poor
              </span>
            </div>
            {summary.breakdown.map((row, i) => (
              <div key={i} className="wa-stacked-row">
                <span className="wa-stacked-label" title={row.value}>
                  {row.value}
                </span>
                <div className="wa-stacked-bar" style={{ width: `${Math.max(4, (row.total / maxRow) * 100)}%` }}>
                  <TipSegment
                    width={`${pct(row.good, row.total)}%`}
                    background={T.success}
                    content={
                      <>
                        <div className="wa-tip-title">{row.value}</div>
                        <div className="wa-tip-row">
                          <span className="wa-tip-dot" style={{ background: T.success }} />
                          <span>Good</span>
                          <span className="wa-tip-val">{fmtCount(row.good)} Counts</span>
                        </div>
                      </>
                    }
                  />
                  <TipSegment
                    width={`${pct(row.needsImprovement, row.total)}%`}
                    background={T.warning}
                    content={
                      <>
                        <div className="wa-tip-title">{row.value}</div>
                        <div className="wa-tip-row">
                          <span className="wa-tip-dot" style={{ background: T.warning }} />
                          <span>Needs Improvement</span>
                          <span className="wa-tip-val">{fmtCount(row.needsImprovement)} Counts</span>
                        </div>
                      </>
                    }
                  />
                  <TipSegment
                    width={`${pct(row.poor, row.total)}%`}
                    background={T.danger}
                    content={
                      <>
                        <div className="wa-tip-title">{row.value}</div>
                        <div className="wa-tip-row">
                          <span className="wa-tip-dot" style={{ background: T.danger }} />
                          <span>Poor</span>
                          <span className="wa-tip-val">{fmtCount(row.poor)} Counts</span>
                        </div>
                      </>
                    }
                  />
                </div>
                <span className="wa-stacked-count">{fmtCount(row.total)}</span>
              </div>
            ))}
          </>
        )}
      </div>

      {summary?.quantiles && (
        <div className="wa-pctl-wrap">
          <div className="wa-pctl-row">
            {(["p50", "p75", "p90", "p99"] as const).map((k, i) => (
              <div key={k} className="wa-pctl-item">
                <span className="wa-pctl-item-label">
                  <span className="wa-pctl-dot" style={{ background: PCTL_COLORS[i] }} />
                  <span className="wa-pctl-label">
                    {vitalKey.toUpperCase()} - {k.toUpperCase()}
                  </span>
                </span>
                <span className="wa-pctl-value">{fmtMsEn(summary.quantiles![k])}</span>
              </div>
            ))}
          </div>
          {summary.series && summary.series.length > 1 && (
            <div className="wa-pctl-chart">
              <ChartBox height={220}>
                {(width) => {
                  const points = summary.series!;
                  // Força um número fixo de ticks (~7) em vez de deixar o recharts
                  // tentar renderizar um rótulo por ponto (série de 15 em 15min ao
                  // longo de dias vira centena de pontos e os textos se sobrepõem).
                  const xInterval = Math.max(0, Math.ceil(points.length / 7) - 1);
                  return (
                    <LineChart width={width} height={220} data={points} margin={{ top: 10, right: 16, bottom: 8, left: 0 }}>
                      <CartesianGrid strokeDasharray="2 4" stroke={T.border} vertical={false} />
                      <XAxis
                        dataKey="ts"
                        interval={xInterval}
                        stroke={T.textDim}
                        fontSize={10}
                        tick={{ fill: T.textDim, fontFamily: "'IBM Plex Mono',monospace" }}
                        tickLine={false}
                        axisLine={{ stroke: T.border }}
                        tickFormatter={fmtTickHour}
                      />
                      <YAxis
                        width={64}
                        stroke={T.textDim}
                        fontSize={10}
                        tick={{ fill: T.textDim, fontFamily: "'IBM Plex Mono',monospace" }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v) => fmtMsEn(Number(v))}
                      />
                      <RTooltip content={<SeriesTooltip />} cursor={{ stroke: T.borderHi }} />
                      <Line type="monotone" dataKey="p50" stroke={PCTL_COLORS[0]} strokeWidth={1.5} dot={false} name="P50" />
                      <Line type="monotone" dataKey="p75" stroke={PCTL_COLORS[1]} strokeWidth={1.5} dot={false} name="P75" />
                      <Line type="monotone" dataKey="p90" stroke={PCTL_COLORS[2]} strokeWidth={1.5} dot={false} name="P90" />
                      <Line type="monotone" dataKey="p99" stroke={PCTL_COLORS[3]} strokeWidth={1.5} dot={false} name="P99" />
                    </LineChart>
                  );
                }}
              </ChartBox>
            </div>
          )}
        </div>
      )}

      <div className="wa-debug-header">
        <span className="wa-debug-title">Debug View</span>
      </div>
      <div className="wa-debug-table-wrap">
        <table className="wa-debug-table">
          <thead>
            <tr>
              <th>Element</th>
              <th style={{ width: 100 }}>{title.match(/\(([A-Z]+)\)/)?.[1] ?? vitalKey.toUpperCase()}</th>
              <th className="num">Counts</th>
            </tr>
          </thead>
          <tbody>
            {!summary || summary.debugRows.length === 0 ? (
              <tr>
                <td colSpan={3} className="wa-empty">
                  Sem dados no período.
                </td>
              </tr>
            ) : (
              summary.debugRows.map((r, i) => {
                const th = WEB_VITAL_UI_THRESHOLDS[vitalKey];
                const color = r.value <= th.good ? T.success : r.value <= th.needsImprovement ? T.warning : T.danger;
                return (
                  <tr key={i}>
                    <td>
                      <div className="wa-debug-element">{r.element}</div>
                    </td>
                    <td>
                      <span className="wa-debug-metric" style={{ color }}>
                        <span className="wa-debug-dot" style={{ background: color }} />
                        {valueFormatter(r.value)}
                      </span>
                    </td>
                    <td className="wa-debug-count">{fmtCount(r.count)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const WEB_VITAL_UI_THRESHOLDS: Record<WebVitalKey, { good: number; needsImprovement: number }> = {
  lcp: { good: 2500, needsImprovement: 4000 },
  inp: { good: 200, needsImprovement: 500 },
  cls: { good: 0.1, needsImprovement: 0.25 },
};

// ══════════════════════════════════════════════════════════════════════════════
// WebAnalyticsTab
// ══════════════════════════════════════════════════════════════════════════════
export function WebAnalyticsTab({ zoneId, days }: { zoneId: string | null; days: number }) {
  const fetchWeb = useServerFn(getWebAnalytics);
  const {
    data,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["cloudflare-web-analytics", zoneId, days],
    enabled: !!zoneId,
    queryFn: () => fetchWeb({ data: { zoneId, days } }),
  });
  const w = (data as any)?.ok ? (data as any) : null;
  const notConfigured = data && !(data as any).ok && (data as any).notConfigured;

  const [groupDims, setGroupDims] = React.useState<Record<WebVitalKey, string>>({ lcp: "url", inp: "url", cls: "url" });
  const [visitsOpen, setVisitsOpen] = React.useState(false);
  const [pageViewsOpen, setPageViewsOpen] = React.useState(false);
  const [pageLoadTimeOpen, setPageLoadTimeOpen] = React.useState(false);

  const fetchBreakdown = useServerFn(getWebAnalyticsBreakdown);
  function useVitalBreakdown(vital: WebVitalKey) {
    const dim = groupDims[vital];
    return useQuery({
      queryKey: ["cloudflare-web-analytics-breakdown", zoneId, days, vital, dim],
      enabled: !!zoneId && dim !== "url",
      queryFn: () => fetchBreakdown({ data: { zoneId, days, vital, dimension: dim } }),
    });
  }
  const lcpBreakdown = useVitalBreakdown("lcp");
  const inpBreakdown = useVitalBreakdown("inp");
  const clsBreakdown = useVitalBreakdown("cls");

  function summaryFor(vital: WebVitalKey, base: WebVitalSummary | undefined, bq: ReturnType<typeof useVitalBreakdown>) {
    if (groupDims[vital] === "url") return base ?? null;
    if (!bq.data || !(bq.data as any).ok) return base ? { ...base, breakdown: [], debugRows: [] } : null;
    const r = bq.data as any;
    return base ? { ...base, breakdown: r.rows, debugRows: r.debugRows } : null;
  }

  if (!zoneId) {
    return (
      <div className="wa-root">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="wa-state-box">
          <span style={{ fontSize: 13, color: V2.textPrimary }}>Selecione uma zona pra ver o Web Analytics.</span>
        </div>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="wa-root">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="wa-state-box">
          <span style={{ fontSize: 13, color: V2.textPrimary }}>Carregando Web Analytics…</span>
        </div>
      </div>
    );
  }

  if (notConfigured) {
    return (
      <div className="wa-root">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="wa-state-box">
          <Info size={20} color={T.textMuted} />
          <span style={{ fontSize: 13, fontWeight: 600, color: V2.textPrimary }}>
            Web Analytics (RUM) não parece estar configurado pra esta zona
          </span>
          <span style={{ fontSize: 11, color: V2.textMuted, maxWidth: 480, fontFamily: "'IBM Plex Mono',monospace" }}>
            {(data as any)?.error}
          </span>
        </div>
      </div>
    );
  }

  if (error || (data && !(data as any).ok)) {
    return (
      <div className="wa-root">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="wa-state-box">
          <AlertTriangle size={20} color={T.danger} />
          <span style={{ fontSize: 13, fontWeight: 600, color: T.danger }}>Erro ao carregar Web Analytics</span>
          <span style={{ fontSize: 11, color: V2.textMuted, fontFamily: "'IBM Plex Mono',monospace" }}>
            {data && !(data as any).ok ? (data as any).error : ((error as Error)?.message ?? "")}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="wa-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {w?.warning && (
        <div className="wa-hint-box">
          <AlertTriangle size={13} color={T.warning} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            Alguns campos de Web Analytics ainda não foram confirmados contra a API real da Cloudflare (fase de
            debug). Detalhe técnico devolvido pela API: <code>{w.warning}</code>
          </span>
        </div>
      )}

      <div className="wa-kpi-grid">
        <div className="wa-kpi" style={{ gridColumn: "span 2" }}>
          <div className="wa-cwv-mini-title">Core Web Vitals</div>
          {(["lcp", "inp", "cls"] as WebVitalKey[]).map((v) => {
            const s = w?.[v] as WebVitalSummary | undefined;
            const total = s?.total ?? 0;
            return (
              <div key={v} className="wa-cwv-mini-row">
                <span className="wa-cwv-mini-label">{v.toUpperCase()}</span>
                <div className="wa-cwv-mini-bar">
                  <TipSegment
                    width={`${pct(s?.good ?? 0, total)}%`}
                    background={T.success}
                    content={
                      <div className="wa-tip-row">
                        <span className="wa-tip-dot" style={{ background: T.success }} />
                        <span>
                          Good: {fmtCount(s?.good ?? 0)} ({pct(s?.good ?? 0, total).toFixed(2)}%)
                        </span>
                      </div>
                    }
                  />
                  <TipSegment
                    width={`${pct(s?.needsImprovement ?? 0, total)}%`}
                    background={T.warning}
                    content={
                      <div className="wa-tip-row">
                        <span className="wa-tip-dot" style={{ background: T.warning }} />
                        <span>
                          Needs Improvement: {fmtCount(s?.needsImprovement ?? 0)} ({pct(s?.needsImprovement ?? 0, total).toFixed(2)}%)
                        </span>
                      </div>
                    }
                  />
                  <TipSegment
                    width={`${pct(s?.poor ?? 0, total)}%`}
                    background={T.danger}
                    content={
                      <div className="wa-tip-row">
                        <span className="wa-tip-dot" style={{ background: T.danger }} />
                        <span>
                          Poor: {fmtCount(s?.poor ?? 0)} ({pct(s?.poor ?? 0, total).toFixed(2)}%)
                        </span>
                      </div>
                    }
                  />
                </div>
              </div>
            );
          })}
        </div>
        <div
          className="wa-kpi wa-kpi-clickable"
          onClick={() => setVisitsOpen(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && setVisitsOpen(true)}
        >
          <div className="wa-kpi-content">
            <span className="wa-kpi-label">Visits</span>
            <div className="wa-kpi-value-row">
              <span className="wa-kpi-value">{fmtCount(w?.totals?.visits ?? 0)}</span>
              {w?.totals?.visitsDeltaPct != null && <TrendTag pct={w.totals.visitsDeltaPct} />}
            </div>
          </div>
          {w?.totals?.visitsSeries?.length > 1 && (
            <div className="wa-kpi-spark">
              <ChartBox height={34}>
                {(width) => (
                  <AreaChart width={width} height={34} data={w.totals.visitsSeries} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                    <Area
                      type="monotone"
                      dataKey="visits"
                      stroke={T.accent}
                      fill={T.accent}
                      fillOpacity={0.15}
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                )}
              </ChartBox>
            </div>
          )}
        </div>
        <div
          className="wa-kpi wa-kpi-clickable"
          onClick={() => setPageViewsOpen(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && setPageViewsOpen(true)}
        >
          <div className="wa-kpi-content">
            <span className="wa-kpi-label">Page views</span>
            <div className="wa-kpi-value-row">
              <span className="wa-kpi-value">{fmtCount(w?.totals?.pageViews ?? 0)}</span>
              {w?.totals?.pageViewsDeltaPct != null && <TrendTag pct={w.totals.pageViewsDeltaPct} />}
            </div>
          </div>
          {w?.totals?.pageViewsSeries?.length > 1 && (
            <div className="wa-kpi-spark">
              <ChartBox height={34}>
                {(width) => (
                  <AreaChart
                    width={width}
                    height={34}
                    data={w.totals.pageViewsSeries}
                    margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
                  >
                    <Area
                      type="monotone"
                      dataKey="views"
                      stroke={T.accent}
                      fill={T.accent}
                      fillOpacity={0.15}
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                )}
              </ChartBox>
            </div>
          )}
        </div>
        <div
          className="wa-kpi wa-kpi-clickable"
          onClick={() => setPageLoadTimeOpen(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === "Enter" && setPageLoadTimeOpen(true)}
        >
          <div className="wa-kpi-content">
            <span className="wa-kpi-label">Page load time</span>
            <div className="wa-kpi-value-row">
              <span className="wa-kpi-value">{fmtMsEn(w?.totals?.pageLoadTimeMs ?? 0)}</span>
              {w?.totals?.pageLoadTimeDeltaPct != null && <TrendTag pct={w.totals.pageLoadTimeDeltaPct} invert />}
            </div>
          </div>
          {w?.totals?.pageLoadTimeSeries?.length > 1 && (
            <div className="wa-kpi-spark">
              <ChartBox height={34}>
                {(width) => (
                  <AreaChart
                    width={width}
                    height={34}
                    data={w.totals.pageLoadTimeSeries}
                    margin={{ top: 2, right: 0, bottom: 0, left: 0 }}
                  >
                    <Area
                      type="monotone"
                      dataKey="ms"
                      stroke={T.accent}
                      fill={T.accent}
                      fillOpacity={0.15}
                      strokeWidth={1.5}
                      dot={false}
                      isAnimationActive={false}
                    />
                  </AreaChart>
                )}
              </ChartBox>
            </div>
          )}
        </div>
      </div>

      <Dialog open={visitsOpen} onOpenChange={setVisitsOpen}>
        <DialogContent className="wa-dialog-content">
          <DialogHeader>
            <DialogTitle className="wa-dialog-title">Visits</DialogTitle>
          </DialogHeader>
          <VisitsDetailBody zoneId={zoneId} days={days} />
        </DialogContent>
      </Dialog>

      <Dialog open={pageViewsOpen} onOpenChange={setPageViewsOpen}>
        <DialogContent className="wa-dialog-content">
          <DialogHeader>
            <DialogTitle className="wa-dialog-title">Page views</DialogTitle>
          </DialogHeader>
          <PageViewsDetailBody zoneId={zoneId} days={days} />
        </DialogContent>
      </Dialog>

      <Dialog open={pageLoadTimeOpen} onOpenChange={setPageLoadTimeOpen}>
        <DialogContent className="wa-dialog-content">
          <DialogHeader>
            <DialogTitle className="wa-dialog-title">Page load time</DialogTitle>
          </DialogHeader>
          <PageLoadTimeDetailBody zoneId={zoneId} days={days} />
        </DialogContent>
      </Dialog>

      <VitalBlock
        vitalKey="lcp"
        title="Largest Contentful Paint (LCP)"
        description="LCP mede o tempo de renderização da maior imagem ou bloco de texto visível na viewport."
        summary={summaryFor("lcp", w?.lcp, lcpBreakdown)}
        groupDim={groupDims.lcp}
        onGroupDimChange={(dim) => setGroupDims((g) => ({ ...g, lcp: dim }))}
        groupLoading={lcpBreakdown.isFetching}
        groupError={lcpBreakdown.data && !(lcpBreakdown.data as any).ok ? (lcpBreakdown.data as any).error : null}
        valueFormatter={fmtMs}
      />
      <VitalBlock
        vitalKey="inp"
        title="Interaction to Next Paint (INP)"
        description="INP mede a responsividade geral da página observando a latência de cliques, toques e interações de teclado."
        summary={summaryFor("inp", w?.inp, inpBreakdown)}
        groupDim={groupDims.inp}
        onGroupDimChange={(dim) => setGroupDims((g) => ({ ...g, inp: dim }))}
        groupLoading={inpBreakdown.isFetching}
        groupError={inpBreakdown.data && !(inpBreakdown.data as any).ok ? (inpBreakdown.data as any).error : null}
        valueFormatter={fmtMs}
      />
      <VitalBlock
        vitalKey="cls"
        title="Cumulative Layout Shift (CLS)"
        description="CLS mede a maior sequência de mudanças de layout inesperadas ao longo da vida da página."
        summary={summaryFor("cls", w?.cls, clsBreakdown)}
        groupDim={groupDims.cls}
        onGroupDimChange={(dim) => setGroupDims((g) => ({ ...g, cls: dim }))}
        groupLoading={clsBreakdown.isFetching}
        groupError={clsBreakdown.data && !(clsBreakdown.data as any).ok ? (clsBreakdown.data as any).error : null}
        valueFormatter={fmtScore}
      />
    </div>
  );
}
