import { ModuleLoading } from "@/components/layout/ModuleLoading";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from "recharts";
import {
  Activity,
  ShieldCheck,
  Globe,
  AlertTriangle,
  Sparkles,
  CalendarCheck,
  Smile,
  Pill,
  Server,
  Network,
  TrendingDown,
  Maximize2,
  RefreshCw,
  Info,
  Lock,
  Fish,
  GraduationCap,
  ShieldAlert,
  FileWarning,
  Clock,
  TrendingUp,
  XCircle,
  FileCheck,
} from "lucide-react";
import { getExecutiveOverview } from "@/lib/executive.functions";

// ── Design Tokens ──────────────────────────────────────────────────────────────
const T = {
  bg: "var(--tl-0a0d14, #0A0D14)",
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
  textSecondary: "var(--tl-f1f5f9, #F1F5F9)",
  textMuted: "var(--tl-f1f5f9, #F1F5F9)",
  textSubtle: "var(--tl-f1f5f9, #F1F5F9)",
  chartGrid: "rgba(var(--tl-line-rgb, 30,38,64),0.7)",
  chartAxis: "var(--tl-f1f5f9, #F1F5F9)",
  chartTick: "var(--tl-f1f5f9, #F1F5F9)",
};

// ── CSS ────────────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');

  .pe-wrap { background:${T.bg}; min-height:100%; }
  .pe-wrap:fullscreen { overflow-y:auto; padding:28px 40px; }
  .pe-root { font-family:'DM Sans',sans-serif; color:${T.textPrimary}; display:flex; flex-direction:column; gap:14px; max-width:1600px; margin:0 auto; }
  .pe-root * { box-sizing:border-box; }

  @keyframes pe-fadeup { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
  @keyframes pe-pulse  { 0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0.5)} 50%{box-shadow:0 0 0 6px rgba(239,68,68,0)} }
  @keyframes pe-spin   { to{transform:rotate(360deg)} }
  .pe-fadeup { opacity:0; animation:pe-fadeup 0.5s ease forwards; }
  .pe-spin   { animation:pe-spin 0.75s linear infinite; }
  @media (prefers-reduced-motion: reduce) {
    .pe-fadeup { animation:none; opacity:1; }
    .pe-dot.crit { animation:none; }
  }

  .pe-root ::-webkit-scrollbar       { width:4px; height:4px; }
  .pe-root ::-webkit-scrollbar-track { background:transparent; }
  .pe-root ::-webkit-scrollbar-thumb { background:${T.borderHi}; border-radius:2px; }

  .pe-root .recharts-cartesian-axis-tick-value { fill:${T.chartTick} !important; font-size:10px; font-family:'IBM Plex Mono',monospace; }
  /* Datas (meses/anos) do eixo X do gráfico de Maturidade em branco */
  .pe-root .pe-mat-xaxis .recharts-cartesian-axis-tick-value { fill:${T.textPrimary} !important; }

  /* ── Header ── */
  .pe-hdr { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  .pe-hdr-eyebrow { font-size:10px; font-weight:700; letter-spacing:0.18em; text-transform:uppercase; color:${T.accent}; font-family:'IBM Plex Mono',monospace; margin-bottom:6px; }
  .pe-hdr-title { font-size:30px; font-weight:700; font-family:'Space Grotesk',sans-serif; letter-spacing:-0.02em; line-height:1; color:${T.textPrimary}; }
  .pe-hdr-sub { font-size:12px; color:${T.textMuted}; margin-top:6px; }
  .pe-hdr-actions { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .pe-hdr-time { font-size:11px; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; }
  .pe-btn { display:inline-flex; align-items:center; gap:6px; padding:8px 14px; border-radius:7px; font-size:12px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; transition:all 0.15s; white-space:nowrap; }
  .pe-btn.ghost { background:transparent; border:1px solid ${T.border}; color:${T.textSecondary}; }
  .pe-btn.ghost:hover { border-color:${T.borderHi}; color:${T.textPrimary}; }
  .pe-btn.primary { background:${T.accentGlow}; border:1px solid rgba(59,130,246,0.4); color:${T.accent}; }
  .pe-btn.primary:hover { background:rgba(59,130,246,0.25); box-shadow:0 0 20px rgba(59,130,246,0.15); }

  /* ── Radar de Domínios (assinatura) ── */
  .pe-ribbon { background:${T.surface}; border:1px solid ${T.border}; border-radius:14px; display:grid; grid-template-columns:repeat(8,1fr); overflow:hidden; }
  @media (max-width:1200px){ .pe-ribbon { grid-template-columns:repeat(4,1fr); } }
  @media (max-width:640px){ .pe-ribbon { grid-template-columns:repeat(2,1fr); } }
  .pe-ribbon-seg { padding:20px 20px; border-right:1px solid ${T.border}; display:flex; gap:12px; align-items:flex-start; min-width:0; }
  .pe-ribbon-seg:last-child { border-right:none; }
  @media (max-width:1200px){ .pe-ribbon-seg:nth-child(4n) { border-right:none; } .pe-ribbon-seg:nth-child(-n+4){ border-bottom:1px solid ${T.border}; } }
  .pe-dot { width:9px; height:9px; border-radius:50%; flex-shrink:0; margin-top:4px; }
  .pe-dot.ok   { background:${T.success}; }
  .pe-dot.warn { background:${T.warning}; }
  .pe-dot.crit { background:${T.danger}; animation:pe-pulse 2s infinite; }
  .pe-dot.off  { background:${T.neutral}; opacity:0.5; }
  .pe-ribbon-label { font-size:10px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:${T.textPrimary}; font-family:'IBM Plex Mono',monospace; }
  .pe-ribbon-value { font-size:24px; font-weight:700; font-family:'Space Grotesk',sans-serif; letter-spacing:-0.02em; line-height:1.1; margin-top:5px; }
  .pe-ribbon-sub { font-size:10px; color:${T.textPrimary}; font-family:'IBM Plex Mono',monospace; margin-top:4px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }

  /* ── Sections ── */
  .pe-eyebrow { display:flex; align-items:center; gap:10px; font-size:10px; font-weight:700; letter-spacing:0.18em; text-transform:uppercase; color:${T.textPrimary}; font-family:'IBM Plex Mono',monospace; margin-bottom:12px; }
  .pe-eyebrow::after { content:''; flex:1; height:1px; background:${T.border}; }

  /* ── Cards ── */
  .pe-card { background:${T.surface}; border:1px solid ${T.border}; border-radius:12px; padding:13px 16px; position:relative; overflow:hidden; transition:border-color 0.2s; display:flex; flex-direction:column; }
  .pe-card:hover { border-color:${T.borderHi}; }
  .pe-card-accent { position:absolute; top:0; left:0; right:0; height:2px; }
  .pe-card-label { display:flex; align-items:center; gap:7px; font-size:9px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:${T.textPrimary}; font-family:'IBM Plex Mono',monospace; margin-bottom:10px; }
  .pe-icon-pill { width:30px; height:30px; border-radius:8px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }

  .pe-num-hero { font-size:36px; font-weight:700; font-family:'Space Grotesk',sans-serif; letter-spacing:-0.03em; line-height:0.95; }
  .pe-num-xl   { font-size:28px; font-weight:700; font-family:'Space Grotesk',sans-serif; letter-spacing:-0.02em; line-height:1; }
  .pe-num-lg   { font-size:30px; font-weight:700; font-family:'Space Grotesk',sans-serif; letter-spacing:-0.02em; line-height:1; }
  .pe-num-md   { font-size:18px; font-weight:700; font-family:'Space Grotesk',sans-serif; line-height:1; }
  .pe-sub  { font-size:11px; color:${T.textMuted}; margin-top:6px; }
  .pe-mono { font-family:'IBM Plex Mono',monospace; }

  /* Cards das seções (Defesa / Exposição / Fator Humano / Governança) — mais compactos que os heros */
  .pe-layers .pe-card, .pe-grid-3 .pe-card, .pe-grid-gov .pe-card { padding:10px 13px; }
  .pe-layers .pe-num-hero, .pe-grid-3 .pe-num-hero, .pe-grid-gov .pe-num-hero { font-size:30px; }
  .pe-layers .pe-num-xl, .pe-grid-3 .pe-num-xl, .pe-grid-gov .pe-num-xl { font-size:24px; }
  .pe-layers .pe-card-label, .pe-grid-3 .pe-card-label, .pe-grid-gov .pe-card-label { margin-bottom:8px; }

  /* ── Bars ── */
  .pe-bar-track { position:relative; height:7px; background:${T.border}; border-radius:4px; overflow:visible; }
  .pe-bar-fill  { position:absolute; left:0; top:0; bottom:0; border-radius:4px; transition:width 0.8s ease; }
  .pe-bar-marker{ position:absolute; top:-3px; bottom:-3px; width:2px; background:${T.textSecondary}; border-radius:1px; }
  .pe-bar-tick  { position:absolute; top:-2px; bottom:-2px; width:2px; border-radius:1px; }

  /* ── Defense layers ── */
  .pe-layers { display:grid; grid-template-columns:1fr 36px 1fr 36px 1fr; gap:0; align-items:stretch; }
  @media (max-width:1100px){ .pe-layers { grid-template-columns:1fr; gap:12px; } .pe-layer-arrow { display:none; } }
  .pe-layer-arrow { display:flex; align-items:center; justify-content:center; color:${T.textSubtle}; }

  /* ── List rows (depts, tools, nc) ── */
  .pe-row { display:flex; align-items:center; gap:10px; padding:5px 0; }
  .pe-row-name { font-size:11px; color:${T.textPrimary}; flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .pe-row-bar-wrap { flex:1.4; height:9px; background:rgba(var(--tl-line-rgb, 30,38,64),0.5); border-radius:3px; overflow:hidden; min-width:0; }
  .pe-row-bar { height:100%; border-radius:3px; transition:width 0.6s ease; }
  .pe-row-val { font-size:11px; font-weight:700; font-family:'IBM Plex Mono',monospace; color:${T.textPrimary}; width:42px; text-align:right; flex-shrink:0; }

  .pe-badge { display:inline-flex; align-items:center; gap:4px; padding:3px 9px; border-radius:5px; font-size:10px; font-weight:700; font-family:'IBM Plex Mono',monospace; border:1px solid transparent; white-space:nowrap; }
  .pe-badge.ok   { background:${T.successBg}; color:${T.success}; border-color:rgba(16,185,129,0.3); }
  .pe-badge.warn { background:${T.warningBg}; color:${T.warning}; border-color:rgba(245,158,11,0.3); }
  .pe-badge.crit { background:${T.dangerBg}; color:${T.danger}; border-color:rgba(239,68,68,0.3); }
  .pe-badge.info { background:${T.accentSoft}; color:${T.accent}; border-color:rgba(59,130,246,0.3); }

  .pe-tip-wrap { position:relative; display:inline-flex; }
  .pe-tip { pointer-events:none; position:absolute; left:50%; transform:translateX(-50%); bottom:calc(100% + 7px); display:none; z-index:60; width:250px; background:${T.surfaceAlt}; border:1px solid ${T.borderHi}; border-radius:8px; padding:10px 12px; font-size:11px; line-height:1.5; color:${T.textSecondary}; box-shadow:0 16px 36px rgba(0,0,0,0.5); }
  .pe-tip-wrap:hover .pe-tip { display:block; }
  /* Variante para tooltip com lista (ex.: incidentes críticos do Sophos) */
  .pe-tip.wide { width:340px; text-align:left; }

  .pe-chart-legend { display:flex; gap:16px; flex-wrap:wrap; margin-bottom:10px; }
  .pe-leg { display:flex; align-items:center; gap:6px; font-size:10px; color:${T.textSecondary}; font-family:'IBM Plex Mono',monospace; }
  .pe-leg-line { width:14px; height:2px; border-radius:1px; }
  .pe-leg-dash { width:14px; height:0; border-top:2px dashed; }

  .pe-state { background:${T.surface}; border:1px solid ${T.border}; border-radius:14px; padding:60px 24px; display:flex; flex-direction:column; align-items:center; gap:12px; text-align:center; }

  /* ── Responsive grids ── */
  .pe-grid-3 { display:grid; grid-template-columns:repeat(3,1fr); gap:14px; }
  @media (max-width:1100px){ .pe-grid-3 { grid-template-columns:1fr; } }
  .pe-grid-gov { display:grid; grid-template-columns:5fr 7fr; gap:14px; }
  @media (max-width:1100px){ .pe-grid-gov { grid-template-columns:1fr; } }
  .pe-grid-gov-r { display:grid; grid-template-columns:repeat(2,1fr); gap:14px; }
  @media (max-width:700px){ .pe-grid-gov-r { grid-template-columns:1fr; } }
  .pe-grid-hero { display:grid; grid-template-columns:minmax(280px,4fr) 8fr; gap:16px; }
  @media (max-width:1100px){ .pe-grid-hero { grid-template-columns:1fr; } }
  .pe-grid-posture { display:grid; grid-template-columns:2fr 1fr; gap:14px; align-items:stretch; }
  @media (max-width:1100px){ .pe-grid-posture { grid-template-columns:1fr; } }
`;

// ── Helpers (FIXes preservados) ────────────────────────────────────────────────
const fmtNum = (n: number | null | undefined) => (n == null ? "—" : new Intl.NumberFormat("pt-BR").format(n));

const fmtCompact = (n: number | null | undefined) =>
  n == null ? "—" : new Intl.NumberFormat("pt-BR", { notation: "compact", maximumFractionDigits: 1 }).format(n);

// FIX: fmtPct espera fração 0–1 e multiplica por 100 para exibir
const fmtPct = (n: number | null | undefined, digits = 1) => (n == null ? "—" : `${(n * 100).toFixed(digits)}%`);

const fmtDuration = (hours: number | null | undefined): string => {
  if (hours == null || !isFinite(hours) || hours < 0) return "—";
  if (hours === 0) return "0min";
  if (hours >= 24) return `${(hours / 24).toFixed(1)}d`;
  if (hours >= 1) return `${hours.toFixed(1)}h`;
  const min = hours * 60;
  if (min >= 1) return `${Math.round(min)}min`;
  return `${Math.max(1, Math.round(min * 60))}s`;
};

function relativeTime(iso: string | undefined) {
  if (!iso) return "—";
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  return `há ${h}h`;
}

function CountUp({ value, suffix = "", digits = 0 }: { value: number; suffix?: string; digits?: number }) {
  const [n, setN] = React.useState(0);
  React.useEffect(() => {
    const start = performance.now();
    const dur = 900;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setN(value * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return (
    <span style={{ fontVariantNumeric: "tabular-nums" }}>
      {digits > 0 ? n.toFixed(digits) : Math.round(n).toLocaleString("pt-BR")}
      {suffix}
    </span>
  );
}

// FIX: useId evita id com "var(--soc-accent)" que quebra o url() do SVG
function Sparkline({
  data,
  dataKey,
  color,
  height = 34,
}: {
  data: any[];
  dataKey: string;
  color: string;
  height?: number;
}) {
  const rawId = React.useId();
  const gid = rawId.replace(/:/g, "");
  if (!data?.length) return null;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 2, right: 0, left: 0, bottom: 0 }}>
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity={0.35} />
            <stop offset="100%" stopColor={color} stopOpacity={0} />
          </linearGradient>
        </defs>
        <Area type="monotone" dataKey={dataKey} stroke={color} fill={`url(#${gid})`} strokeWidth={1.5} />
      </AreaChart>
    </ResponsiveContainer>
  );
}

function InfoTip({ children }: { children: React.ReactNode }) {
  return (
    <span className="pe-tip-wrap">
      <Info size={12} color={T.textSubtle} style={{ cursor: "help" }} />
      <span className="pe-tip">{children}</span>
    </span>
  );
}

function EmptyCard({ title, hint }: { title: string; hint?: string }) {
  return (
    <div
      className="pe-card"
      style={{
        alignItems: "center",
        justifyContent: "center",
        minHeight: 150,
        textAlign: "center",
      }}
    >
      <AlertTriangle size={20} color={T.textSubtle} />
      <div
        style={{
          fontSize: 12,
          fontWeight: 700,
          color: T.textMuted,
          marginTop: 8,
          fontFamily: "'IBM Plex Mono',monospace",
          textTransform: "uppercase",
          letterSpacing: "0.1em",
        }}
      >
        {title}
      </div>
      <div style={{ fontSize: 11, color: T.textSubtle, marginTop: 4 }}>{hint ?? "Fonte indisponível"}</div>
    </div>
  );
}

function MiniBar({
  pct,
  color,
  markerPct,
  tickPct,
  tickColor,
}: {
  pct: number;
  color: string;
  markerPct?: number;
  tickPct?: number;
  tickColor?: string;
}) {
  return (
    <div className="pe-bar-track">
      <div
        className="pe-bar-fill"
        style={{
          width: `${Math.min(100, Math.max(0, pct))}%`,
          background: `linear-gradient(90deg,color-mix(in srgb, ${color} 40%, transparent),${color})`,
        }}
      />
      {markerPct != null && (
        <div className="pe-bar-marker" style={{ left: `${Math.min(100, markerPct)}%` }} title="meta" />
      )}
      {tickPct != null && (
        <div
          className="pe-bar-tick"
          style={{ left: `${Math.min(100, tickPct)}%`, background: tickColor ?? T.textSecondary }}
        />
      )}
    </div>
  );
}

function MatTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${T.borderHi}`,
        borderRadius: 8,
        padding: "10px 14px",
        boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontFamily: "'IBM Plex Mono',monospace",
          color: T.textMuted,
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginBottom: 3 }}>
          <div style={{ width: 7, height: 7, borderRadius: 2, background: p.color }} />
          <span style={{ color: T.textSecondary, fontSize: 11 }}>
            {p.dataKey === "nist" ? "NIST CSF" : "ISO 27001"}
          </span>
          <span
            style={{
              color: T.textPrimary,
              fontWeight: 700,
              fontFamily: "'IBM Plex Mono',monospace",
              marginLeft: "auto",
            }}
          >
            {typeof p.value === "number" ? p.value.toFixed(2) : p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════
export function PainelExecutivoDashboard() {
  // ── back-end UNCHANGED ─────────────────────────────────────────────────────
  const fetchOverview = useServerFn(getExecutiveOverview);
  const { data, isLoading, isError, refetch, dataUpdatedAt } = useQuery({
    queryKey: ["executive-overview"],
    queryFn: () => fetchOverview(),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });

  // FIX: ref no container do painel, não em document.documentElement,
  // para que fullscreen não inclua a sidebar
  const presentRef = React.useRef<HTMLDivElement>(null);
  const [presenting, setPresenting] = React.useState(false);

  const togglePresent = async () => {
    try {
      if (!document.fullscreenElement) {
        await presentRef.current?.requestFullscreen();
        setPresenting(true);
      } else {
        await document.exitFullscreen();
        setPresenting(false);
      }
    } catch {
      /* ignore */
    }
  };

  React.useEffect(() => {
    const onFsChange = () => setPresenting(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);
  // ──────────────────────────────────────────────────────────────────────────

  if (isLoading && !data) return <ModuleLoading />;

  if (isError || !data) {
    return (
      <div ref={presentRef} className="pe-wrap">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="pe-root">
          <div className="pe-state">
            <AlertTriangle size={22} color={T.danger} />
            <span
              style={{
                fontSize: 14,
                fontWeight: 700,
                color: T.textPrimary,
                fontFamily: "'Space Grotesk',sans-serif",
              }}
            >
              Não foi possível carregar o painel executivo
            </span>
            <button className="pe-btn primary" onClick={() => refetch()}>
              <RefreshCw size={12} /> Tentar novamente
            </button>
          </div>
        </div>
      </div>
    );
  }

  const {
    cloudflare,
    dominios,
    sophos,
    eps,
    mttr,
    vulns,
    phishing,
    treinamentos,
    wsus,
    disponibilidade,
    ia,
    comites,
    nps,
    pilulas,
    naoConformidades,
    maturidade,
    firewall,
  } = data;

  // ── Radar de Domínios: estados derivados dos MESMOS thresholds dos cards ──
  type RState = "ok" | "warn" | "crit" | "off";
  const stateColor: Record<RState, string> = {
    ok: T.success,
    warn: T.warning,
    crit: T.danger,
    off: T.textMuted,
  };
  // KPI de topo: eventos barrados na borda (Cloudflare) + contidos no endpoint
  // (Sophos), na MESMA janela de 30 dias. É a mesma conta do Painel C-Level,
  // de propósito: os dois painéis precisam dar o mesmo número para a mesma
  // afirmação. A soma antiga misturava 4 parcelas com janelas diferentes e
  // incluía vulnerabilidades corrigidas, que é remediação, não ameaça contida —
  // esse dado continua visível no tile "Vulns corrigidas · 30 dias" do card
  // Defesa Ativa · Interno.
  const bloq30d = (data as any)?.bloqueios30d ?? null;
  const temDefesa = bloq30d != null;
  const ribbon: Array<{ key: string; label: string; state: RState; value: string; sub: string }> = [
    {
      key: "perimetro",
      label: "Ameaças contidas",
      state: temDefesa ? "ok" : "off",
      value: temDefesa ? fmtCompact(bloq30d.total) : "—",
      sub: "Borda + endpoint · 30 dias",
    },
    {
      key: "endpoints",
      label: "Endpoints",
      state: !sophos?.encryption
        ? "off"
        : sophos.encryption.rate >= 0.7
          ? "ok"
          : sophos.encryption.rate >= 0.4
            ? "warn"
            : "crit",
      value: sophos?.encryption ? fmtPct(sophos.encryption.rate, 0) : "—",
      sub: "Criptografados",
    },
    {
      key: "siem",
      label: "SIEM",
      state: "crit", // !eps ? "off" : eps.overrun > 0 ? "crit" : eps.pctUse > 0.8 ? "warn" : "ok",
      value: eps ? fmtCompact(eps.avg) : "—", //2813
      sub: eps ? `EPS atual · lic ${fmtCompact(eps.licensed)}` : "sem dados",
    },
    {
      key: "resposta",
      label: "Resposta",
      state: !mttr ? "off" : mttr.avgHours <= 24 ? "ok" : mttr.avgHours <= 72 ? "warn" : "crit",
      value: mttr ? fmtDuration(mttr.avgHours) : "—",
      sub: mttr ? `MTTR · ${mttr.openCount} abertos` : "sem dados",
    },
    {
      key: "vulns",
      label: "Vulns",
      state: !vulns ? "off" : vulns.current.criticas > 50 ? "crit" : vulns.current.criticas >= 10 ? "warn" : "ok",
      value: vulns ? fmtNum(vulns.current.criticas) : "—",
      sub: "Críticas abertas",
    },
    {
      key: "patches",
      label: "Patches",
      state: !wsus ? "off" : wsus.coverage >= 0.85 ? "ok" : wsus.coverage >= 0.5 ? "warn" : "crit",
      value: wsus ? fmtPct(wsus.coverage, 0) : "—",
      sub: "Cobertura WSUS",
    },
    {
      key: "disp",
      label: "Disponib.",
      state: !disponibilidade
        ? "off"
        : disponibilidade.availablePct >= 0.85
          ? "ok"
          : disponibilidade.availablePct > 0.3
            ? "warn"
            : "crit",
      value: disponibilidade ? fmtPct(disponibilidade.availablePct, 1) : "—",
      sub: "SLA 99,5%",
    },
    {
      key: "phishing",
      label: "Phishing",
      state: !phishing ? "off" : phishing.compromisePct > 0.2 ? "crit" : phishing.compromisePct >= 0.05 ? "warn" : "ok",
      value: phishing ? fmtPct(phishing.compromisePct, 1) : "—",
      sub: "Comprometimento",
    },
  ];
  const healthyCount = ribbon.filter((r) => r.state === "ok").length;
  const activeCount = ribbon.filter((r) => r.state !== "off").length;

  const maxDept = Math.max(...(phishing?.topDeptsCompromise ?? []).map((d: any) => d.count), 1);
  const maxTool = Math.max(...(ia?.topTools ?? []).map((t: any) => t.count), 1);
  // NPS: ≥50 verde · 10–49 amarelo · <10 vermelho
  const npsColor = nps ? (nps.score >= 50 ? T.success : nps.score >= 10 ? T.warning : T.danger) : T.textMuted;
  // Zona do NPS (mesmos limiares da cor): ≥50 ótima · 10–49 boa · <10 crítica
  const npsZona = !nps
    ? null
    : nps.score >= 50
      ? { label: "Zona ótima", cls: "ok" as const }
      : nps.score >= 10
        ? { label: "Zona boa", cls: "warn" as const }
        : { label: "Zona crítica", cls: "crit" as const };

  // Defesa Ativa: incidentes potenciais evitados = bloqueados (Sophos) + vulnerabilidades corrigidas (30d)
  const vulnsFixed30d = (vulns as any)?.fixed30d ?? null;
  const fixedSeries: any[] = (vulns as any)?.fixedSeries ?? [];
  const incidentesEvitados = (sophos?.blocked ?? 0) + (vulnsFixed30d?.total ?? 0);
  // Melhoria: mitigações da equipe de SI vs os 30 dias anteriores
  const incidentesEvitadosPrev = (sophos?.blockedPrev ?? 0) + ((vulns as any)?.fixedPrev30d?.total ?? 0);
  const evitadosDiff = incidentesEvitados - incidentesEvitadosPrev;
  const evitadosMelhorou = evitadosDiff > 0;

  // Defesa Ativa Externo: WAF (Cloudflare) + Firewall (total dos ofensores externos / QRadar)
  const evitadosExterno = (cloudflare?.mitigated ?? 0) + ((firewall as any)?.total ?? 0);
  const fwSeries: any[] = (firewall as any)?.series ?? [];

  // Vulnerabilidades: evidência de melhora/piora por CRÍTICAS + ALTAS abertas (app-only).
  // É o sinal que a equipe controla; o total de abertas cresce com a descoberta contínua.
  const vulnHist: any[] = (vulns as any)?.history ?? [];
  const vulnNowHA = vulns ? ((vulns.current as any).criticas ?? 0) + ((vulns.current as any).altas ?? 0) : 0;
  const vulnPrevHA = vulns?.previous ? ((vulns.previous as any).criticasAltas ?? null) : null;
  const vulnDiffHA = vulnPrevHA != null ? vulnNowHA - vulnPrevHA : null;
  const vulnImproved = vulnDiffHA != null && vulnDiffHA < 0;
  const vulnWorsened = vulnDiffHA != null && vulnDiffHA > 0;
  const vulnTrendColor = vulnImproved ? T.success : vulnWorsened ? T.danger : T.textMuted;
  // Cor do gráfico evolutivo segue o MESMO sinal do banner (agora vs baseline):
  // reduzindo vulnerabilidades = verde, aumentando = vermelho, estável = cinza.
  const vulnHistColor = vulnTrendColor;

  // Monitoramento 24/7: melhoria do MTTR ao longo dos meses (cair = melhor, graças à triagem com IA)
  const mttrSeries: any[] = (mttr as any)?.series ?? [];
  const mttrFirst = mttrSeries[0]?.v ?? null;
  const mttrLast = mttrSeries.length ? (mttrSeries[mttrSeries.length - 1]?.v ?? null) : null;
  const mttrImprovedPct =
    mttrFirst != null && mttrLast != null && mttrFirst > 0 ? (mttrFirst - mttrLast) / mttrFirst : 0;

  return (
    <div ref={presentRef} className="pe-wrap">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="pe-root">
        {/* ═══ HEADER ═══ */}
        <div className="pe-hdr pe-fadeup">
          <div>
            <div className="pe-hdr-eyebrow">Bernoulli · Segurança da Informação</div>
            <h1 className="pe-hdr-title">Painel Executivo</h1>
            <div className="pe-hdr-sub">
              Visão consolidada · últimos 30 dias · {healthyCount}/{activeCount} domínios saudáveis
            </div>
          </div>
          <div className="pe-hdr-actions">
            <span className="pe-hdr-time">Atualizado {relativeTime(new Date(dataUpdatedAt).toISOString())}</span>
            <button className="pe-btn ghost" onClick={() => refetch()}>
              <RefreshCw size={12} /> Atualizar
            </button>
            <button className="pe-btn primary" onClick={togglePresent}>
              <Maximize2 size={12} /> {presenting ? "Sair" : "Modo apresentação"}
            </button>
          </div>
        </div>

        {/* ═══ RADAR DE DOMÍNIOS — assinatura ═══ */}
        <div className="pe-ribbon pe-fadeup" style={{ animationDelay: "70ms" }}>
          {ribbon.map((seg) => (
            <div key={seg.key} className="pe-ribbon-seg">
              <span className={`pe-dot ${seg.state}`} />
              <div style={{ minWidth: 0 }}>
                <div className="pe-ribbon-label">{seg.label}</div>
                <div className="pe-ribbon-value" style={{ color: stateColor[seg.state] }}>
                  {seg.value}
                </div>
                <div className="pe-ribbon-sub">{seg.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ═══ POSTURA & PERCEPÇÃO — MATURIDADE + NPS lado a lado ═══ */}
        <div className="pe-fadeup" style={{ animationDelay: "140ms" }}>
          <div className="pe-eyebrow">Postura &amp; Percepção</div>
          <div className="pe-grid-posture">
            {maturidade ? (
              <div className="pe-card" style={{ padding: 16 }}>
                <div
                  className="pe-card-accent"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${T.accent}, ${T.success}, transparent)`,
                    opacity: 0.8,
                  }}
                />
                <div className="pe-grid-hero">
                  {/* Esquerda — notas com escala 0–4 espelhando o gráfico */}
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 14,
                      justifyContent: "center",
                    }}
                  >
                    {[
                      {
                        label: "NIST CSF",
                        nota: maturidade.nist,
                        vsEdu: maturidade.vsEduNist,
                        mediaEdu: maturidade.mediaEduNist,
                        periodo: maturidade.periodoNist,
                        color: T.accent,
                      },
                      {
                        label: "ISO 27001",
                        nota: maturidade.iso,
                        vsEdu: maturidade.vsEduIso,
                        mediaEdu: maturidade.mediaEduIso,
                        periodo: maturidade.periodoIso,
                        color: T.success,
                      },
                    ].map(({ label, nota, vsEdu, mediaEdu, periodo, color }) => (
                      <div
                        key={label}
                        style={{
                          background: T.surfaceAlt,
                          border: `1px solid ${T.border}`,
                          borderRadius: 10,
                          padding: "11px 13px",
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
                            background: color,
                            opacity: 0.7,
                          }}
                        />
                        <div
                          style={{
                            display: "flex",
                            alignItems: "flex-start",
                            justifyContent: "space-between",
                            gap: 8,
                          }}
                        >
                          <span
                            className="pe-mono"
                            style={{
                              fontSize: 9,
                              fontWeight: 700,
                              letterSpacing: "0.14em",
                              textTransform: "uppercase",
                              color: T.textPrimary,
                            }}
                          >
                            {label} · {periodo ?? maturidade.periodo}
                          </span>
                          {vsEdu != null && (
                            <span className={`pe-badge ${vsEdu >= 0 ? "ok" : "crit"}`}>
                              {vsEdu >= 0 ? "▲" : "▼"} {Math.abs(vsEdu).toFixed(2)} vs Educação
                            </span>
                          )}
                        </div>
                        <div style={{ display: "flex", alignItems: "flex-end", gap: 14, marginTop: 8 }}>
                          <div className="pe-num-hero" style={{ color: T.textPrimary }}>
                            <CountUp value={nota ?? 0} digits={2} />
                          </div>
                          {mediaEdu != null && (
                            <div style={{ paddingBottom: 4 }}>
                              <div
                                style={{
                                  fontSize: 9,
                                  color: T.textSubtle,
                                  fontFamily: "'IBM Plex Mono',monospace",
                                }}
                              >
                                média Educação
                              </div>
                              <div className="pe-mono" style={{ fontSize: 16, fontWeight: 600, color: T.textMuted }}>
                                {mediaEdu.toFixed(2)}
                              </div>
                            </div>
                          )}
                        </div>
                        {/* escala 0–4: fill nota, marker meta 3.0, tick média Edu — mesma régua do gráfico */}
                        <div style={{ marginTop: 9 }}>
                          <MiniBar
                            pct={((nota ?? 0) / 4) * 100}
                            color={color}
                            markerPct={(3 / 4) * 100}
                            tickPct={mediaEdu != null ? (mediaEdu / 4) * 100 : undefined}
                            tickColor={T.textSubtle}
                          />
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              marginTop: 5,
                              fontSize: 9,
                              color: T.textSubtle,
                              fontFamily: "'IBM Plex Mono',monospace",
                            }}
                          >
                            <span>0</span>
                            <span>meta 3.0</span>
                            <span>4</span>
                          </div>
                        </div>
                      </div>
                    ))}
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span className={`pe-badge ${maturidade.delta >= 0 ? "ok" : "crit"}`}>
                        {maturidade.delta >= 0 ? "▲" : "▼"} {Math.abs(maturidade.delta).toFixed(2)} vs avaliação
                        anterior
                      </span>
                      <InfoTip>
                        Notas NIST CSF e ISO 27001 do Bernoulli na avaliação mais recente ({maturidade.periodo}).
                        Comparativo com a média do segmento Educação. Meta institucional: 3.0.
                      </InfoTip>
                    </div>
                  </div>

                  {/* Direita — evolução com as MESMAS referências da régua */}
                  <div style={{ minWidth: 0, display: "flex", flexDirection: "column" }}>
                    <div className="pe-chart-legend">
                      <span className="pe-leg">
                        <span className="pe-leg-line" style={{ background: T.accent }} /> NIST CSF
                      </span>
                      <span className="pe-leg">
                        <span className="pe-leg-line" style={{ background: T.success }} /> ISO 27001
                      </span>
                      <span className="pe-leg">
                        <span className="pe-leg-dash" style={{ borderColor: T.warning }} /> Meta 3.0
                      </span>
                      {maturidade.mediaEduNist != null && (
                        <span className="pe-leg" style={{ color: T.accent }}>
                          <span className="pe-leg-dash" style={{ borderColor: T.accent }} /> Educação NIST
                        </span>
                      )}
                      {maturidade.mediaEduIso != null && (
                        <span className="pe-leg" style={{ color: T.success }}>
                          <span className="pe-leg-dash" style={{ borderColor: T.success }} /> Educação ISO
                        </span>
                      )}
                    </div>
                    <div style={{ flex: 1, minHeight: 210 }}>
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={maturidade.history} margin={{ top: 8, right: 18, left: -18, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="2 4" stroke={T.chartGrid} vertical={false} />
                          <XAxis
                            dataKey="periodo"
                            className="pe-mat-xaxis"
                            stroke={T.chartAxis}
                            fontSize={10}
                            tickLine={false}
                            tick={{ fill: T.textPrimary, fontFamily: "'IBM Plex Mono',monospace" }}
                            axisLine={{ stroke: T.chartAxis }}
                          />
                          <YAxis
                            domain={[0, 4]}
                            tickCount={5}
                            stroke={T.chartAxis}
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                            tick={{ fill: T.chartTick, fontFamily: "'IBM Plex Mono',monospace" }}
                          />
                          <Tooltip content={<MatTooltip />} cursor={{ stroke: T.borderHi, strokeWidth: 1 }} />
                          <ReferenceLine
                            y={3}
                            stroke={T.warning}
                            strokeDasharray="4 4"
                            label={{
                              value: "Meta 3.0",
                              fontSize: 10,
                              fill: T.warning,
                              position: "insideTopRight",
                            }}
                          />
                          {maturidade.mediaEduNist != null && (
                            <ReferenceLine
                              y={maturidade.mediaEduNist}
                              stroke={T.accent}
                              strokeDasharray="3 5"
                              strokeOpacity={1}
                              label={{
                                value: `Educação ${maturidade.mediaEduNist.toFixed(2)}`,
                                fontSize: 10,
                                fill: T.accent,
                                position: "insideBottomRight",
                              }}
                            />
                          )}
                          {maturidade.mediaEduIso != null && (
                            <ReferenceLine
                              y={maturidade.mediaEduIso}
                              stroke={T.success}
                              strokeDasharray="3 5"
                              strokeOpacity={1}
                              label={{
                                value: `Educação ISO ${maturidade.mediaEduIso.toFixed(2)}`,
                                fontSize: 10,
                                fill: T.success,
                                position: "insideBottomLeft",
                              }}
                            />
                          )}
                          <Line
                            type="monotone"
                            dataKey="nist"
                            stroke={T.accent}
                            strokeWidth={2.5}
                            dot={{ r: 4, fill: T.accent, strokeWidth: 0 }}
                            activeDot={{ r: 6 }}
                            connectNulls
                            name="NIST CSF"
                          />
                          <Line
                            type="monotone"
                            dataKey="iso"
                            stroke={T.success}
                            strokeWidth={2.5}
                            dot={{ r: 4, fill: T.success, strokeWidth: 0 }}
                            activeDot={{ r: 6 }}
                            connectNulls
                            name="ISO 27001"
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyCard title="Maturidade" hint="Cadastre avaliações no módulo Maturidade." />
            )}
            {nps ? (
              <div className="pe-card">
                <div className="pe-card-accent" style={{ background: npsColor }} />
                <div className="pe-card-label">
                  <span className="pe-icon-pill" style={{ background: `color-mix(in srgb, ${npsColor} 13%, transparent)` }}>
                    <Smile size={15} color={npsColor} />
                  </span>
                  NPS · Segurança da Informação
                  {npsZona && (
                    <span className={`pe-badge ${npsZona.cls}`} style={{ marginLeft: "auto", flexShrink: 0 }}>
                      {npsZona.label}
                    </span>
                  )}
                </div>
                <div
                  className="pe-num-hero"
                  style={{ color: npsColor, fontSize: 54, lineHeight: 1, margin: "4px 0 2px" }}
                >
                  {nps.score >= 0 ? "+" : ""}
                  <CountUp value={nps.score} />
                </div>
                <div className="pe-mono" style={{ fontSize: 10, color: T.textSubtle, marginTop: 4 }}>
                  {fmtNum(nps.sampleSize)} respostas na última pesquisa
                </div>
                {/* Gráfico evolutivo abaixo do número (NPS por pesquisa) */}
                <div style={{ flex: 1, minHeight: 150, marginTop: 12 }}>
                  {nps.series && nps.series.length > 1 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={nps.series} margin={{ top: 8, right: 18, left: -18, bottom: 0 }}>
                        <defs>
                          <linearGradient id="npsGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={npsColor} stopOpacity={0.35} />
                            <stop offset="100%" stopColor={npsColor} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="2 4" stroke={T.chartGrid} vertical={false} />
                        <XAxis
                          dataKey="d"
                          stroke={T.chartAxis}
                          fontSize={10}
                          tickLine={false}
                          tick={{ fill: T.chartTick, fontFamily: "'IBM Plex Mono',monospace" }}
                          axisLine={{ stroke: T.chartAxis }}
                        />
                        <YAxis
                          domain={[-100, 100]}
                          stroke={T.chartAxis}
                          fontSize={10}
                          tickLine={false}
                          axisLine={false}
                          tickFormatter={(v: number) => (v > 0 ? `+${v}` : `${v}`)}
                          tick={{ fill: T.chartTick, fontFamily: "'IBM Plex Mono',monospace" }}
                        />
                        <Tooltip
                          contentStyle={{
                            background: T.surface,
                            border: `1px solid ${T.borderHi}`,
                            borderRadius: 8,
                          }}
                          labelStyle={{
                            color: T.textMuted,
                            fontFamily: "'IBM Plex Mono',monospace",
                            fontSize: 10,
                          }}
                          itemStyle={{ color: T.textPrimary, fontWeight: 700 }}
                          formatter={(v: any) => [v, "NPS"]}
                        />
                        <ReferenceLine
                          y={50}
                          stroke={T.success}
                          strokeDasharray="4 4"
                          strokeOpacity={0.6}
                          label={{
                            value: "+50",
                            fontSize: 10,
                            fill: T.success,
                            position: "insideTopLeft",
                          }}
                        />
                        <ReferenceLine
                          y={10}
                          stroke={T.danger}
                          strokeDasharray="4 4"
                          strokeOpacity={0.6}
                          label={{
                            value: "10",
                            fontSize: 10,
                            fill: T.danger,
                            position: "insideBottomLeft",
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="score"
                          stroke={npsColor}
                          strokeWidth={2.5}
                          fill="url(#npsGrad)"
                          dot={{ r: 3, fill: npsColor, strokeWidth: 0 }}
                          activeDot={{ r: 5 }}
                          name="NPS"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        height: "100%",
                        minHeight: 150,
                        border: `1px dashed ${T.border}`,
                        borderRadius: 10,
                        gap: 8,
                        background: T.surfaceAlt,
                      }}
                    >
                      <Activity size={20} color={T.textSubtle} />
                      <span
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: T.textMuted,
                          fontFamily: "'IBM Plex Mono',monospace",
                        }}
                      >
                        Gráfico de evolução do NPS
                      </span>
                      <span style={{ fontSize: 10, color: T.textSubtle }}>
                        Disponível quando houver histórico de pesquisas
                      </span>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <EmptyCard title="NPS" hint="Sem pesquisas registradas." />
            )}
          </div>
        </div>

        {/* ═══ DEFESA EM PROFUNDIDADE — perímetro → endpoint → SIEM ═══ */}
        <div className="pe-fadeup" style={{ animationDelay: "210ms" }}>
          <div className="pe-eyebrow">Defesa em Profundidade</div>
          <div className="pe-grid-3">
            {/* Monitoramento · 24/7 */}
            {eps || mttr ? (
              <div className="pe-card">
                <div className="pe-card-accent" style={{ background: T.purple }} />
                <div className="pe-card-label">
                  <span className="pe-icon-pill" style={{ background: "rgba(167,139,250,0.18)" }}>
                    <Activity size={15} color={T.purple} />
                  </span>
                  Monitoramento · 24/7
                </div>
                {eps ? (
                  <>
                    <div className="pe-num-xl" style={{ color: eps.overrun > 0 ? T.danger : T.textPrimary }}>
                      {fmtCompact(eps.avg)}
                    </div>
                    <div className="pe-sub">
                      EPS atual
                      {eps.overrun > 0 && (
                        <span style={{ color: T.danger }}> · {(eps.overrun * 100).toFixed(0)}% acima da licença</span>
                      )}
                    </div>
                    <div style={{ marginTop: 9 }}>
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          marginBottom: 6,
                          fontSize: 11,
                          color: T.textMuted,
                        }}
                      >
                        <span>Uso da licença ({fmtCompact(eps.licensed)})</span>
                        <span
                          className="pe-mono"
                          style={{
                            fontWeight: 700,
                            color: eps.overrun > 0 ? T.danger : eps.pctUse > 0.8 ? T.warning : T.accent,
                          }}
                        >
                          {fmtPct(eps.pctUse, 0)}
                        </span>
                      </div>
                      <MiniBar
                        pct={(eps.pctUse ?? 0) * 100}
                        color={eps.overrun > 0 ? T.danger : eps.pctUse > 0.8 ? T.warning : T.accent}
                        tickPct={Math.min(100, (eps.peakPct ?? 0) * 100)}
                        tickColor={T.warning}
                      />
                      <div className="pe-mono" style={{ fontSize: 9, color: T.textSubtle, marginTop: 5 }}>
                        pico {fmtCompact(eps.peak)} (tick âmbar) · limite = licença
                      </div>
                    </div>
                    <div style={{ flex: 1, minHeight: 34, marginTop: 8 }}>
                      <Sparkline data={eps.samples} dataKey="v" color={T.purple} />
                    </div>
                  </>
                ) : (
                  <div className="pe-sub">EPS sem amostras no período.</div>
                )}
                {mttr && (
                  <div style={{ marginTop: 10, paddingTop: 10, borderTop: `1px solid ${T.border}` }}>
                    {/* cabeçalho: MTTR atual (últimos 30d) */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <TrendingDown size={13} color={T.success} />
                      <span style={{ fontSize: 11, color: T.textMuted }}>MTTR</span>
                      <span className="pe-num-md" style={{ color: T.success }}>
                        {fmtDuration(mttr.avgHours)}
                      </span>
                      <span className="pe-mono" style={{ fontSize: 10, color: T.textPrimary, marginLeft: "auto" }}>
                        {mttr.openCount} em aberto · n={mttr.sampleSize}
                      </span>
                    </div>
                    {/* destaque: queda do tempo de reação ao longo da série (IA na triagem) */}
                    {mttrImprovedPct > 0 && (
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 10,
                          marginTop: 8,
                          padding: "8px 12px",
                          borderRadius: 9,
                          background: `color-mix(in srgb, ${T.success} 8%, transparent)`,
                          border: `1px solid color-mix(in srgb, ${T.success} 25%, transparent)`,
                        }}
                      >
                        <span style={{ fontSize: 24, lineHeight: 1, color: T.success }}>↓</span>
                        <span className="pe-num-xl" style={{ color: T.success, fontWeight: 800 }}>
                          {Math.round(mttrImprovedPct * 100)}%
                        </span>
                        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: T.textPrimary }}>
                            menos tempo de reação
                          </span>
                          <span style={{ fontSize: 10, color: T.textMuted }}>com IA na triagem de alertas</span>
                        </div>
                      </div>
                    )}
                    {/* gráfico de melhoria do MTTR — queda = menor tempo de reação com IA */}
                    {mttrSeries.length >= 2 && (
                      <div style={{ height: 30, marginTop: 8 }}>
                        <Sparkline data={mttrSeries} dataKey="v" color={T.success} />
                      </div>
                    )}
                    <div className="pe-mono" style={{ fontSize: 9, color: T.textSubtle, marginTop: 4 }}>
                      triagem com IA reduz falso-positivos · 24/7
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <EmptyCard title="Monitoramento" hint="Verifique a integração QRadar." />
            )}

            {/* Defesa Ativa · Externo (WAF + Firewall) */}
            {cloudflare ? (
              <div className="pe-card">
                <div className="pe-card-accent" style={{ background: T.accent }} />
                <div className="pe-card-label">
                  <span className="pe-icon-pill" style={{ background: "rgba(59,130,246,0.18)" }}>
                    <Globe size={15} color={T.accent} />
                  </span>
                  Defesa Ativa · Externo
                </div>
                <div className="pe-num-hero" style={{ color: T.success, fontSize: 30 }}>
                  <CountUp value={evitadosExterno} />
                </div>
                <div className="pe-sub" style={{ color: T.textPrimary, fontSize: 12 }}>
                  Possíveis incidentes evitados · externo
                </div>
                <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4, lineHeight: 1.4 }}>
                  WAF (borda) + Firewall (ofensores externos) — bloqueados antes de virarem incidentes
                </div>
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                    marginTop: 10,
                  }}
                >
                  <div>
                    <div className="pe-num-xl" style={{ color: T.success }}>
                      {fmtCompact(cloudflare.mitigated)}
                    </div>
                    <div className="pe-mono" style={{ fontSize: 9, color: T.textPrimary, marginTop: 2 }}>
                      Contidas · WAF
                    </div>
                  </div>
                  <div>
                    <div className="pe-num-xl" style={{ color: T.success }}>
                      {fmtCompact((firewall as any)?.total ?? 0)}
                    </div>
                    <div className="pe-mono" style={{ fontSize: 9, color: T.textPrimary, marginTop: 2 }}>
                      Bloqueios - Firewall
                    </div>
                  </div>
                </div>
                {/* Gráfico 1 — WAF (ameaças contidas/dia, 7d) */}
                <div style={{ marginTop: 10 }}>
                  <div className="pe-mono" style={{ fontSize: 9, color: T.textMuted, marginBottom: 4 }}>
                    WAF · ameaças contidas/dia
                  </div>
                  <div style={{ minHeight: 34 }}>
                    <Sparkline data={cloudflare.timeseries} dataKey="mitigated" color={T.accent} />
                  </div>
                </div>
                {/* Gráfico 2 — Firewall (bloqueios/dia · ofensores externos QRadar) */}
                {fwSeries.length > 1 && (
                  <div style={{ marginTop: 10 }}>
                    <div className="pe-mono" style={{ fontSize: 9, color: T.textMuted, marginBottom: 4 }}>
                      Firewall · bloqueios/dia
                    </div>
                    <div style={{ minHeight: 34 }}>
                      <Sparkline data={fwSeries} dataKey="v" color={T.danger} />
                    </div>
                  </div>
                )}
                {dominios && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 6,
                      marginTop: 10,
                      paddingTop: 10,
                      borderTop: `1px solid ${T.border}`,
                    }}
                  >
                    <Lock size={11} color={dominios.allTls ? T.success : T.warning} />
                    <span className="pe-mono" style={{ fontSize: 10, color: T.textMuted }}>
                      TLS: {dominios.validCerts}/{dominios.totalCerts} certificados válidos · {dominios.totalDomains}{" "}
                      domínios
                    </span>
                  </div>
                )}
              </div>
            ) : (
              <EmptyCard title="Perímetro" hint="Verifique a integração Cloudflare." />
            )}

            {/* Defesa Ativa · Interno (Sophos XDR) */}
            {sophos ? (
              <div className="pe-card">
                <div className="pe-card-accent" style={{ background: T.success }} />
                <div className="pe-card-label">
                  <span className="pe-icon-pill" style={{ background: "rgba(16,185,129,0.18)" }}>
                    <ShieldCheck size={15} color={T.success} />
                  </span>
                  Defesa Ativa · Interno
                </div>
                <div className="pe-num-hero" style={{ color: T.success, fontSize: 30 }}>
                  <CountUp value={incidentesEvitados} />
                </div>
                <div className="pe-sub" style={{ color: T.textPrimary, fontSize: 12 }}>
                  Possíveis incidentes evitados · 30 dias
                </div>
                <div style={{ fontSize: 11, color: T.textMuted, marginTop: 4, lineHeight: 1.4 }}>
                  Sophos XDR + correção de vulnerabilidades — riscos mitigados antes de virarem incidentes
                </div>
                {incidentesEvitadosPrev > 0 && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      marginTop: 10,
                      padding: "8px 12px",
                      borderRadius: 9,
                      background: evitadosMelhorou ? `color-mix(in srgb, ${T.success} 8%, transparent)` : "rgba(107,114,128,0.10)",
                      border: `1px solid ${evitadosMelhorou ? `color-mix(in srgb, ${T.success} 25%, transparent)` : T.border}`,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 24,
                        lineHeight: 1,
                        color: evitadosMelhorou ? T.success : T.textMuted,
                      }}
                    >
                      {evitadosMelhorou ? "▲" : evitadosDiff < 0 ? "▼" : "→"}
                    </span>
                    {evitadosMelhorou ? (
                      <>
                        <span className="pe-num-xl" style={{ color: T.success, fontWeight: 800 }}>
                          {fmtNum(evitadosDiff)}
                        </span>
                        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: T.textPrimary }}>a mais mitigados</span>
                          <span style={{ fontSize: 10, color: T.textMuted }}>que o período anterior</span>
                        </div>
                        <span
                          className="pe-badge"
                          style={{
                            marginLeft: "auto",
                            background: `color-mix(in srgb, ${T.success} 10%, transparent)`,
                            color: T.success,
                            borderColor: `color-mix(in srgb, ${T.success} 33%, transparent)`,
                            fontSize: 11,
                            padding: "4px 11px",
                          }}
                        >
                          melhorando
                        </span>
                      </>
                    ) : (
                      <span
                        style={{
                          fontSize: 11,
                          color: T.textSecondary,
                          fontFamily: "'IBM Plex Mono',monospace",
                        }}
                      >
                        {evitadosDiff < 0
                          ? `${fmtNum(Math.abs(evitadosDiff))} a menos que o período anterior`
                          : "estável vs. período anterior"}
                      </span>
                    )}
                  </div>
                )}
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr 1fr",
                    gap: 10,
                    marginTop: 10,
                  }}
                >
                  <div>
                    <div className="pe-num-xl" style={{ color: T.success }}>
                      {fmtNum(sophos.blocked)}
                    </div>
                    <div className="pe-mono" style={{ fontSize: 9, color: T.textPrimary, marginTop: 2 }}>
                      Bloqueados · Sophos XDR
                    </div>
                  </div>
                  <div>
                    <div className="pe-num-xl" style={{ color: T.success }}>
                      {fmtNum(vulnsFixed30d?.total ?? 0)}
                    </div>
                    <div className="pe-mono" style={{ fontSize: 9, color: T.textPrimary, marginTop: 2 }}>
                      Vulns corrigidas · 30 dias
                    </div>
                  </div>
                </div>
                {(() => {
                  const lista: Array<{
                    at: string | null;
                    sev: string;
                    desc: string;
                    who: string | null;
                  }> = (sophos as any).criticalList ?? [];
                  const restantes = sophos.critical - lista.length;
                  if (sophos.critical <= 0) return null;
                  const fmtDia = (iso: string | null) =>
                    iso
                      ? new Date(iso).toLocaleDateString("pt-BR", {
                          day: "2-digit",
                          month: "2-digit",
                        })
                      : "—";
                  return (
                    <div style={{ marginTop: 8 }}>
                      {sophos.critical > 0 && (
                        <div className="pe-tip-wrap">
                          <span className="pe-badge crit" style={{ cursor: lista.length ? "help" : "default" }}>
                            <ShieldAlert size={11} /> {fmtNum(sophos.critical)} seriam incidentes críticos / graves
                          </span>
                          {lista.length > 0 && (
                            <div className="pe-tip wide">
                              <div
                                className="pe-mono"
                                style={{
                                  fontSize: 9,
                                  fontWeight: 700,
                                  letterSpacing: "0.12em",
                                  textTransform: "uppercase",
                                  color: T.textMuted,
                                  marginBottom: 8,
                                }}
                              >
                                Incidentes críticos / graves · 30 dias
                              </div>
                              {lista.map((a, i) => (
                                <div
                                  key={i}
                                  style={{
                                    display: "flex",
                                    gap: 7,
                                    paddingTop: i === 0 ? 0 : 6,
                                    marginTop: i === 0 ? 0 : 6,
                                    borderTop: i === 0 ? "none" : `1px solid ${T.border}`,
                                  }}
                                >
                                  <span
                                    className="pe-mono"
                                    style={{
                                      fontSize: 10,
                                      color: T.textMuted,
                                      flexShrink: 0,
                                      paddingTop: 1,
                                    }}
                                  >
                                    {fmtDia(a.at)}
                                  </span>
                                  <span
                                    style={{
                                      width: 6,
                                      height: 6,
                                      borderRadius: "50%",
                                      flexShrink: 0,
                                      marginTop: 5,
                                      background: a.sev === "critical" ? T.danger : T.warning,
                                    }}
                                    title={a.sev === "critical" ? "Crítico" : "Alto"}
                                  />
                                  <span style={{ minWidth: 0 }}>
                                    <span style={{ color: T.textPrimary, fontSize: 11 }}>{a.desc}</span>
                                    {a.who && (
                                      <span
                                        className="pe-mono"
                                        style={{
                                          display: "block",
                                          fontSize: 9,
                                          color: T.textSubtle,
                                          marginTop: 2,
                                        }}
                                      >
                                        {a.who}
                                      </span>
                                    )}
                                  </span>
                                </div>
                              ))}
                              {restantes > 0 && (
                                <div
                                  className="pe-mono"
                                  style={{
                                    fontSize: 9,
                                    color: T.textMuted,
                                    marginTop: 8,
                                    paddingTop: 6,
                                    borderTop: `1px solid ${T.border}`,
                                  }}
                                >
                                  + {fmtNum(restantes)} não listados
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })()}
                {/* Gráficos evolutivos por tipo — Sophos (bloqueios) + Vulns corrigidas */}
                {sophos.series && sophos.series.length > 1 && (
                  <div style={{ marginTop: 10 }}>
                    <div className="pe-mono" style={{ fontSize: 9, color: T.textMuted, marginBottom: 4 }}>
                      Sophos · bloqueios/dia
                    </div>
                    <div style={{ minHeight: 34 }}>
                      <Sparkline data={sophos.series} dataKey="count" color={T.success} />
                    </div>
                  </div>
                )}
                {fixedSeries.length > 1 && (
                  <div style={{ marginTop: 10 }}>
                    <div className="pe-mono" style={{ fontSize: 9, color: T.textMuted, marginBottom: 4 }}>
                      Vulns corrigidas/dia
                    </div>
                    <div style={{ minHeight: 34 }}>
                      <Sparkline data={fixedSeries} dataKey="count" color={T.accent} />
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <EmptyCard title="Endpoint" hint="Verifique a integração Sophos." />
            )}
          </div>
        </div>

        {/* ═══ EXPOSIÇÃO & RESILIÊNCIA ═══ */}
        <div className="pe-fadeup" style={{ animationDelay: "280ms" }}>
          <div className="pe-eyebrow">Exposição & Resiliência</div>
          <div className="pe-grid-3">
            {/* Vulnerabilidades */}
            {vulns ? (
              <div className="pe-card">
                <div className="pe-card-accent" style={{ background: T.danger }} />
                <div className="pe-card-label">
                  <span className="pe-icon-pill" style={{ background: "rgba(239,68,68,0.18)" }}>
                    <ShieldAlert size={15} color={T.danger} />
                  </span>
                  Vulnerabilidades abertas
                </div>
                {vulnDiffHA != null && (
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 10,
                      padding: "8px 12px",
                      borderRadius: 9,
                      background: `color-mix(in srgb, ${vulnTrendColor} 8%, transparent)`,
                      border: `1px solid color-mix(in srgb, ${vulnTrendColor} 25%, transparent)`,
                      marginBottom: 12,
                    }}
                  >
                    <span style={{ fontSize: 24, lineHeight: 1, color: vulnTrendColor }}>
                      {vulnImproved ? "▼" : vulnWorsened ? "▲" : "→"}
                    </span>
                    {vulnDiffHA !== 0 ? (
                      <>
                        <span className="pe-num-xl" style={{ color: vulnTrendColor, fontWeight: 800 }}>
                          {fmtNum(Math.abs(vulnDiffHA))}
                        </span>
                        <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
                          <span style={{ fontSize: 11, fontWeight: 600, color: T.textPrimary }}>
                            {vulnImproved ? "a menos" : "a mais"}
                          </span>
                          <span style={{ fontSize: 10, color: T.textMuted }}>críticas+altas vs baseline</span>
                        </div>
                      </>
                    ) : (
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 14,
                            fontWeight: 700,
                            color: vulnTrendColor,
                            fontFamily: "'Space Grotesk',sans-serif",
                            lineHeight: 1,
                          }}
                        >
                          estável
                        </div>
                        <div
                          style={{
                            fontSize: 9,
                            color: T.textSecondary,
                            fontFamily: "'IBM Plex Mono',monospace",
                            marginTop: 3,
                          }}
                        >
                          críticas+altas vs baseline
                        </div>
                      </div>
                    )}
                    <span
                      className="pe-badge"
                      style={{
                        marginLeft: "auto",
                        background: `color-mix(in srgb, ${vulnTrendColor} 10%, transparent)`,
                        color: vulnTrendColor,
                        borderColor: `color-mix(in srgb, ${vulnTrendColor} 33%, transparent)`,
                        fontSize: 11,
                        padding: "4px 11px",
                      }}
                    >
                      {vulnImproved ? "melhorando" : vulnWorsened ? "piorando" : "estável"}
                    </span>
                  </div>
                )}
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginTop: 4 }}>
                  {[
                    { key: "criticas" as const, label: "Críticas", color: T.danger },
                    { key: "altas" as const, label: "Altas", color: T.warning },
                  ].map(({ key, label, color }) => (
                    <div key={key}>
                      <div
                        className="pe-mono"
                        style={{
                          fontSize: 9,
                          fontWeight: 700,
                          letterSpacing: "0.12em",
                          textTransform: "uppercase",
                          color: T.textPrimary,
                          marginBottom: 4,
                        }}
                      >
                        {label}
                      </div>
                      <div className="pe-num-xl" style={{ color }}>
                        {fmtNum(vulns.current[key])}
                      </div>
                      <div className="pe-mono" style={{ fontSize: 10, marginTop: 6, color: T.textMuted }}>
                        abertas
                      </div>
                    </div>
                  ))}
                </div>
                {vulnHist.length > 1 && (
                  <div style={{ marginTop: 16 }}>
                    <ResponsiveContainer width="100%" height={84}>
                      <AreaChart data={vulnHist} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                        <defs>
                          <linearGradient id="vulnGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={vulnHistColor} stopOpacity={0.4} />
                            <stop offset="100%" stopColor={vulnHistColor} stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="d" hide />
                        <Tooltip
                          contentStyle={{
                            background: T.surface,
                            border: `1px solid ${T.borderHi}`,
                            borderRadius: 8,
                          }}
                          labelStyle={{
                            color: T.textMuted,
                            fontFamily: "'IBM Plex Mono',monospace",
                            fontSize: 10,
                          }}
                          itemStyle={{ color: T.textPrimary, fontWeight: 700 }}
                          formatter={(v: any) => [v, "Críticas + Altas"]}
                        />
                        <Area
                          type="monotone"
                          dataKey="criticasAltas"
                          stroke={vulnHistColor}
                          strokeWidth={2}
                          fill="url(#vulnGrad)"
                          dot={false}
                          activeDot={{ r: 4 }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <div
                  className="pe-mono"
                  style={{ fontSize: 10, color: T.textPrimary, marginTop: "auto", paddingTop: 9 }}
                >
                  {vulns.previous?.date &&
                    `baseline ${new Date(vulns.previous.date).toLocaleDateString("pt-BR", { month: "short", year: "numeric" })}`}
                </div>
              </div>
            ) : (
              <EmptyCard title="Vulnerabilidades" />
            )}

            {/* WSUS */}
            {wsus ? (
              <div className="pe-card">
                <div
                  className="pe-card-accent"
                  style={{
                    background: wsus.coverage >= 0.85 ? T.success : wsus.coverage > 0.3 ? T.warning : T.danger,
                  }}
                />
                <div className="pe-card-label">
                  <span className="pe-icon-pill" style={{ background: "rgba(245,158,11,0.18)" }}>
                    <Server size={15} color={T.warning} />
                  </span>
                  Cobertura de Patches · WSUS
                </div>
                <div
                  className="pe-num-hero"
                  style={{
                    color: wsus.coverage >= 0.85 ? T.success : wsus.coverage > 0.3 ? T.warning : T.danger,
                  }}
                >
                  <CountUp value={(wsus.coverage ?? 0) * 100} digits={0} suffix="%" />
                </div>
                <div className="pe-sub" style={{ color: T.textPrimary }}>
                  {fmtNum(wsus.total)} de {fmtNum(wsus.cmdbServers)} servidores CMDB cobertos
                </div>
                <div style={{ marginTop: 9 }}>
                  <MiniBar
                    pct={(wsus.coverage ?? 0) * 100}
                    color={wsus.coverage >= 0.85 ? T.success : wsus.coverage > 0.3 ? T.warning : T.danger}
                    markerPct={85}
                  />
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginTop: 5,
                      fontSize: 9,
                      color: T.textPrimary,
                      fontFamily: "'IBM Plex Mono',monospace",
                    }}
                  >
                    <span>0%</span>
                    <span>meta 85%</span>
                    <span>100%</span>
                  </div>
                </div>
                <div style={{ marginTop: "auto", paddingTop: 9 }}>
                  {wsus.failed > 0 ? (
                    <span className="pe-badge warn">▲ {fmtNum(wsus.failed)} servidores em falha de atualização</span>
                  ) : (
                    <span className="pe-badge ok">✓ Sem falhas de atualização</span>
                  )}
                </div>
              </div>
            ) : (
              <EmptyCard title="WSUS" />
            )}

            {/* Disponibilidade */}
            {disponibilidade ? (
              <div className="pe-card">
                <div
                  className="pe-card-accent"
                  style={{
                    background:
                      disponibilidade.availablePct >= 0.85
                        ? T.success
                        : disponibilidade.availablePct > 0.3
                          ? T.warning
                          : T.danger,
                  }}
                />
                <div className="pe-card-label">
                  <span className="pe-icon-pill" style={{ background: "rgba(34,211,238,0.16)" }}>
                    <Network size={15} color={T.cyan} />
                  </span>
                  Disponibilidade de Ativos
                </div>
                <div
                  className="pe-num-hero"
                  style={{
                    color:
                      disponibilidade.availablePct >= 0.85
                        ? T.success
                        : disponibilidade.availablePct > 0.3
                          ? T.warning
                          : T.danger,
                  }}
                >
                  {fmtPct(disponibilidade.availablePct, 2)}
                </div>
                <div className="pe-sub" style={{ color: T.textPrimary }}>
                  {fmtNum(disponibilidade.total)} ativos monitorados no CMDB
                </div>
                <div style={{ marginTop: 9 }}>
                  <MiniBar
                    pct={(disponibilidade.availablePct ?? 0) * 100}
                    color={
                      disponibilidade.availablePct >= 0.85
                        ? T.success
                        : disponibilidade.availablePct > 0.3
                          ? T.warning
                          : T.danger
                    }
                    markerPct={85}
                  />
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      marginTop: 5,
                      fontSize: 9,
                      color: T.textPrimary,
                      fontFamily: "'IBM Plex Mono',monospace",
                    }}
                  >
                    <span>0%</span>
                    <span>meta 85%</span>
                    <span>100%</span>
                  </div>
                </div>
                <div style={{ marginTop: "auto", paddingTop: 9 }}>
                  {disponibilidade.open > 0 ? (
                    <span className="pe-badge warn">{fmtNum(disponibilidade.open)} indisponibilidade(s) em aberto</span>
                  ) : (
                    <span className="pe-badge ok">✓ Nenhuma indisponibilidade aberta</span>
                  )}
                </div>
              </div>
            ) : (
              <EmptyCard title="Disponibilidade" />
            )}
          </div>
        </div>

        {/* ═══ FATOR HUMANO ═══ */}
        <div className="pe-fadeup" style={{ animationDelay: "350ms" }}>
          <div className="pe-eyebrow">Fator Humano</div>
          <div className="pe-grid-3">
            {/* Phishing */}
            {phishing ? (
              <div className="pe-card">
                <div
                  className="pe-card-accent"
                  style={{
                    background:
                      phishing.compromisePct > 0.2 ? T.danger : phishing.compromisePct >= 0.05 ? T.warning : T.success,
                  }}
                />
                <div className="pe-card-label">
                  <span className="pe-icon-pill" style={{ background: "rgba(239,68,68,0.18)" }}>
                    <Fish size={15} color={T.danger} />
                  </span>
                  Phishing · Simulações
                </div>
                {/* FIX: compromisePct já normalizado para 0–1 na server fn */}
                <div
                  className="pe-num-hero"
                  style={{
                    color:
                      phishing.compromisePct > 0.2 ? T.danger : phishing.compromisePct >= 0.05 ? T.warning : T.success,
                  }}
                >
                  {fmtPct(phishing.compromisePct, 1)}
                </div>
                <div className="pe-sub">taxa de comprometimento — seria a perda em um ataque real</div>
                {phishing.reportRate != null && (
                  <div style={{ marginTop: 10 }}>
                    <span className="pe-badge ok">▲ {fmtPct(phishing.reportRate, 1)} reportaram a tentativa</span>
                  </div>
                )}
                {phishing.topDeptsCompromise?.length > 0 && (
                  <div style={{ marginTop: 9 }}>
                    <div
                      className="pe-mono"
                      style={{
                        fontSize: 9,
                        fontWeight: 700,
                        letterSpacing: "0.12em",
                        textTransform: "uppercase",
                        color: T.textMuted,
                        marginBottom: 6,
                      }}
                    >
                      Departamentos mais comprometidos
                    </div>
                    {phishing.topDeptsCompromise.slice(0, 5).map((d: any, i: number) => (
                      <div key={i} className="pe-row">
                        <span className="pe-row-name" title={d.name}>
                          {d.name ?? "—"}
                        </span>
                        <div className="pe-row-bar-wrap">
                          <div
                            className="pe-row-bar"
                            style={{
                              width: `${Math.max(5, (d.count / maxDept) * 100)}%`,
                              background: `linear-gradient(90deg,color-mix(in srgb, ${T.danger} 33%, transparent),${T.danger})`,
                            }}
                          />
                        </div>
                        <span className="pe-row-val">{fmtNum(d.count)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <EmptyCard title="Phishing" />
            )}

            {/* Treinamentos */}
            {treinamentos ? (
              <div className="pe-card">
                <div
                  className="pe-card-accent"
                  style={{
                    background: `linear-gradient(90deg, transparent, ${T.accent}, transparent)`,
                    opacity: 0.9,
                  }}
                />
                <div className="pe-card-label">
                  <span className="pe-icon-pill" style={{ background: "rgba(59,130,246,0.18)" }}>
                    <GraduationCap size={15} color={T.accent} />
                  </span>
                  Treinamentos em Políticas
                </div>

                {/* Treinamentos concluídos — herói + barra */}
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span className="pe-num-hero" style={{ color: T.accent }}>
                    <CountUp value={(treinamentos.trainedPct ?? 0) * 100} digits={0} suffix="%" />
                  </span>
                  <span className="pe-sub" style={{ marginTop: 0 }}>
                    concluídos
                  </span>
                </div>
                <div style={{ marginTop: 10 }}>
                  <MiniBar pct={(treinamentos.trainedPct ?? 0) * 100} color={T.accent} />
                </div>
                <div className="pe-mono" style={{ fontSize: 10, color: T.textSubtle, marginTop: 6 }}>
                  {fmtNum(treinamentos.trained)} de {fmtNum(treinamentos.target)} treinamentos
                </div>

                {/* Políticas publicadas — tile destacado (fonte: módulo Políticas) */}
                {(() => {
                  const pub = (treinamentos as any).publishedPolicies ?? 0;
                  const tot = (treinamentos as any).totalPolicies ?? treinamentos.policies ?? 0;
                  const pct = tot > 0 ? (pub / tot) * 100 : 0;
                  const pend = Math.max(0, tot - pub);
                  return (
                    <div
                      style={{
                        marginTop: "auto",
                        paddingTop: 12,
                      }}
                    >
                      <div
                        style={{
                          background: T.surfaceAlt,
                          border: `1px solid ${T.border}`,
                          borderRadius: 10,
                          padding: "11px 13px",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            marginBottom: 9,
                          }}
                        >
                          <span
                            className="pe-mono"
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 6,
                              fontSize: 9,
                              fontWeight: 700,
                              letterSpacing: "0.12em",
                              textTransform: "uppercase",
                              color: T.textMuted,
                            }}
                          >
                            <FileCheck size={11} color={T.success} /> Políticas publicadas
                          </span>
                          <span style={{ display: "flex", alignItems: "baseline", gap: 2 }}>
                            <span className="pe-num-md" style={{ color: T.success }}>
                              {fmtNum(pub)}
                            </span>
                            <span className="pe-mono" style={{ fontSize: 12, color: T.textSubtle }}>
                              /{fmtNum(tot)}
                            </span>
                          </span>
                        </div>
                        <MiniBar pct={pct} color={T.success} />
                        <div
                          className="pe-mono"
                          style={{
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "baseline",
                            color: T.textSubtle,
                            marginTop: 6,
                          }}
                        >
                          <span style={{ fontSize: 12, fontWeight: 700, color: T.success }}>
                            {Math.round(pct)}% publicadas
                          </span>
                          <span style={{ fontSize: 9 }}>{pend} pendente(s)</span>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : (
              <EmptyCard title="Treinamentos" />
            )}

            {/* IA */}
            {ia ? (
              <div className="pe-card">
                <div className="pe-card-accent" style={{ background: T.purple }} />
                <div className="pe-card-label">
                  <span className="pe-icon-pill" style={{ background: "rgba(167,139,250,0.18)" }}>
                    <Sparkles size={15} color={T.purple} />
                  </span>
                  Adoção de IA · 30 dias
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                  <div className="pe-num-xl" style={{ color: T.textPrimary }}>
                    {fmtNum(ia.activeUsers)}
                  </div>
                  <span style={{ fontSize: 11, color: T.textMuted }}>
                    usuários ativos · {fmtCompact(ia.totalEvents)} eventos
                  </span>
                </div>
                <div style={{ marginTop: 9 }}>
                  <div
                    className="pe-mono"
                    style={{
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "0.12em",
                      textTransform: "uppercase",
                      color: T.textMuted,
                      marginBottom: 6,
                    }}
                  >
                    Top ferramentas
                  </div>
                  {ia.topTools.slice(0, 5).map((t: any) => (
                    <div key={t.tool} className="pe-row">
                      <span className="pe-row-name" title={t.tool}>
                        {t.tool}
                      </span>
                      <div className="pe-row-bar-wrap">
                        <div
                          className="pe-row-bar"
                          style={{
                            width: `${Math.max(5, (t.count / maxTool) * 100)}%`,
                            background: `linear-gradient(90deg,color-mix(in srgb, ${T.purple} 33%, transparent),${T.purple})`,
                          }}
                        />
                      </div>
                      <span className="pe-row-val">{fmtCompact(t.count)}</span>
                    </div>
                  ))}
                </div>
                {/* FIX: ranking nominal removido — user_email não existe na tabela */}
                <div
                  style={{
                    fontSize: 9,
                    color: T.textPrimary,
                    fontStyle: "italic",
                    marginTop: "auto",
                    paddingTop: 12,
                  }}
                >
                  Engajamento agregado por ferramenta. Ranking nominal sob solicitação.
                </div>
              </div>
            ) : (
              <EmptyCard title="Adoção de IA" />
            )}
          </div>
        </div>

        {/* ═══ GOVERNANÇA & CULTURA ═══ */}
        <div className="pe-fadeup" style={{ animationDelay: "420ms" }}>
          <div className="pe-eyebrow">Governança & Cultura</div>
          <div className="pe-grid-gov">
            {/* Não conformidades */}
            {naoConformidades?.top?.length ? (
              <div className="pe-card">
                <div className="pe-card-accent" style={{ background: T.warning }} />
                <div className="pe-card-label">
                  <span className="pe-icon-pill" style={{ background: "rgba(245,158,11,0.18)" }}>
                    <FileWarning size={15} color={T.warning} />
                  </span>
                  Não conformidades em aberto
                </div>
                <div style={{ display: "flex", flexDirection: "column" }}>
                  {naoConformidades.top.map((n: any, i: number) => (
                    <div
                      key={n.id}
                      style={{
                        display: "flex",
                        alignItems: "flex-start",
                        justifyContent: "space-between",
                        gap: 10,
                        padding: "9px 0",
                        borderBottom: i < naoConformidades.top.length - 1 ? `1px solid ${T.border}` : "none",
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div
                          style={{
                            fontSize: 12,
                            fontWeight: 600,
                            color: T.textPrimary,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {n.plataforma}
                        </div>
                        <div
                          style={{
                            fontSize: 10,
                            color: T.textMuted,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                            marginTop: 2,
                          }}
                          title={n.fora_compliance}
                        >
                          {n.fora_compliance}
                        </div>
                      </div>
                      <span
                        className={`pe-badge ${
                          n.aceite_risco === "Aceito" ? "warn" : n.aceite_risco === "Não aceito" ? "crit" : "info"
                        }`}
                      >
                        {n.aceite_risco === "Aceito"
                          ? "Risco aceito"
                          : n.aceite_risco === "Não aceito"
                            ? "Risco não aceito"
                            : (n.aceite_risco ?? "Aberto")}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyCard title="Não conformidades" hint="Nenhum registro em aberto." />
            )}

            {/* Comitês + NPS + Pílulas */}
            <div className="pe-grid-gov-r">
              {comites ? (
                <div className="pe-card">
                  <div
                    className="pe-card-accent"
                    style={{
                      background: `linear-gradient(90deg, transparent, ${T.accent}, transparent)`,
                      opacity: 0.9,
                    }}
                  />
                  <div className="pe-card-label">
                    <span className="pe-icon-pill" style={{ background: "rgba(59,130,246,0.18)" }}>
                      <CalendarCheck size={15} color={T.accent} />
                    </span>
                    Comitês
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                    <span className="pe-num-hero" style={{ color: T.textPrimary }}>
                      <CountUp value={comites.realizados} />
                    </span>
                    <span className="pe-num-md" style={{ color: T.textSubtle }}>
                      /{comites.total}
                    </span>
                  </div>
                  <div className="pe-sub">reuniões realizadas em {comites.year}</div>
                  <div style={{ marginTop: 9 }}>
                    <MiniBar
                      pct={comites.total > 0 ? (comites.realizados / comites.total) * 100 : 0}
                      color={T.accent}
                    />
                  </div>

                  {/* Sub-stats em tiles — mesmo tratamento do card Pílulas.
                      Agendadas = a realizar; Não realizadas = não aconteceram (inclui canceladas,
                      que no módulo Comitês são registradas como "Não Realizado"). */}
                  {(() => {
                    const agendadas = (comites as any).agendados ?? 0;
                    const naoRealizadas = (comites as any).naoRealizados ?? 0;
                    const tile: React.CSSProperties = {
                      background: T.surfaceAlt,
                      border: `1px solid ${T.border}`,
                      borderRadius: 10,
                      padding: "9px 11px",
                    };
                    const tileHdr: React.CSSProperties = {
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: T.textMuted,
                      marginBottom: 6,
                    };
                    return (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 8,
                          marginTop: "auto",
                          paddingTop: 12,
                        }}
                      >
                        <div style={tile}>
                          <div className="pe-mono" style={tileHdr}>
                            <Clock size={10} color={T.textMuted} /> Agendadas
                          </div>
                          <div className="pe-num-md" style={{ color: T.textPrimary }}>
                            {agendadas}
                          </div>
                          <div className="pe-mono" style={{ fontSize: 9, color: T.accent, marginTop: 3 }}>
                            a realizar
                          </div>
                        </div>
                        <div style={tile}>
                          <div className="pe-mono" style={tileHdr}>
                            <XCircle size={10} color={T.textMuted} /> Não realizadas
                          </div>
                          <div className="pe-num-md" style={{ color: T.textPrimary }}>
                            {naoRealizadas}
                          </div>
                          <div
                            className="pe-mono"
                            style={{
                              fontSize: 9,
                              color: naoRealizadas > 0 ? T.warning : T.textSubtle,
                              marginTop: 3,
                            }}
                          >
                            no ano
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <EmptyCard title="Comitês" />
              )}

              {pilulas ? (
                <div className="pe-card">
                  <div
                    className="pe-card-accent"
                    style={{
                      background: `linear-gradient(90deg, transparent, ${T.purple}, transparent)`,
                      opacity: 0.9,
                    }}
                  />
                  <div className="pe-card-label">
                    <span className="pe-icon-pill" style={{ background: "rgba(167,139,250,0.18)" }}>
                      <Pill size={15} color={T.purple} />
                    </span>
                    Pílulas de SI
                  </div>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                    <span className="pe-num-hero" style={{ color: T.textPrimary }}>
                      <CountUp value={pilulas.count} />
                    </span>
                    <span className="pe-num-md" style={{ color: T.textSubtle }}>
                      {pilulas.count === 1 ? "pílula" : "pílulas"}
                    </span>
                  </div>
                  <div className="pe-sub">publicadas em {new Date().getFullYear()}</div>

                  {/* Sub-stats em tiles — mesmo tratamento dos blocos internos do card de Maturidade */}
                  {(() => {
                    const last = pilulas.lastDate;
                    const days = last ? Math.floor((Date.now() - new Date(last).getTime()) / 86400000) : null;
                    const rel = days == null ? "—" : days <= 0 ? "hoje" : days === 1 ? "ontem" : `há ${days} dias`;
                    const cad = (pilulas.count / (new Date().getMonth() + 1)).toFixed(1);
                    const tile: React.CSSProperties = {
                      background: T.surfaceAlt,
                      border: `1px solid ${T.border}`,
                      borderRadius: 10,
                      padding: "9px 11px",
                    };
                    const tileHdr: React.CSSProperties = {
                      display: "flex",
                      alignItems: "center",
                      gap: 5,
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "0.1em",
                      textTransform: "uppercase",
                      color: T.textMuted,
                      marginBottom: 6,
                    };
                    return (
                      <div
                        style={{
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr",
                          gap: 8,
                          marginTop: "auto",
                          paddingTop: 12,
                        }}
                      >
                        <div style={tile}>
                          <div className="pe-mono" style={tileHdr}>
                            <Clock size={10} color={T.textMuted} /> Última
                          </div>
                          <div className="pe-num-md" style={{ color: T.textPrimary }}>
                            {last
                              ? new Date(last).toLocaleDateString("pt-BR", {
                                  day: "2-digit",
                                  month: "short",
                                })
                              : "—"}
                          </div>
                          <div className="pe-mono" style={{ fontSize: 9, color: T.purple, marginTop: 3 }}>
                            {rel}
                          </div>
                        </div>
                        <div style={tile}>
                          <div className="pe-mono" style={tileHdr}>
                            <TrendingUp size={10} color={T.textMuted} /> Cadência
                          </div>
                          <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                            <span className="pe-num-md" style={{ color: T.textPrimary }}>
                              {cad}
                            </span>
                            <span className="pe-mono" style={{ fontSize: 10, color: T.textSubtle }}>
                              /mês
                            </span>
                          </div>
                          <div className="pe-mono" style={{ fontSize: 9, color: T.purple, marginTop: 3 }}>
                            no ano
                          </div>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              ) : (
                <EmptyCard title="Pílulas" />
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default PainelExecutivoDashboard;
