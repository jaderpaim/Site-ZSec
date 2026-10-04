import { SyncActions } from "@/components/layout/SyncActions";
import * as React from "react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  RefreshCw,
  ShieldCheck,
  CheckCircle2,
  XCircle,
  Users,
  Globe,
  Building2,
  Database,
  Activity,
  LayoutDashboard,
  Cookie,
  FileBarChart,
  Lock,
} from "lucide-react";
import { usePermissions } from "@/lib/use-permissions";
import {
  getPrivacyConsentamentos,
  getPrivacyCookies,
  getPrivacyUso,
  type ConsentamentosFilter,
  type CookiesFilter,
} from "@/lib/privacy-tools.functions";

// ── Design Tokens (idêntico ao VulnerabilidadesReal) ─────────────────────────
const T = {
  bg: "var(--tl-0a0d14, #0A0D14)",
  surface: "var(--tl-0f1420, #0F1420)",
  surfaceAlt: "var(--tl-131825, #131825)",
  surfaceHi: "var(--tl-161c2e, #161C2E)",
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
  cyanBg: "rgba(34,211,238,0.10)",
  neutral: "var(--tl-6b7280, #6B7280)",
  textPrimary: "var(--tl-f1f5f9, #F1F5F9)",
  textSecondary: "var(--tl-f1f5f9, #F1F5F9)",
  textMuted: "var(--tl-f1f5f9, #F1F5F9)",
  textSubtle: "var(--tl-f1f5f9, #F1F5F9)",
  chartGrid: "rgba(var(--tl-line-rgb, 30,38,64),0.7)",
  chartAxis: "var(--tl-f1f5f9, #F1F5F9)",
  chartTick: "var(--tl-f1f5f9, #F1F5F9)",
};

// ── Inline CSS ────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');

  .pt { font-family:'DM Sans',sans-serif; color:${T.textPrimary}; }
  .pt * { box-sizing:border-box; }

  @keyframes pt-spin   { to{transform:rotate(360deg)} }
  @keyframes pt-fadeup { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  .pt-fadeup { animation:pt-fadeup 0.3s ease forwards; }
  .pt-spin   { animation:pt-spin 0.75s linear infinite; }

  .pt ::-webkit-scrollbar       { width:4px; height:4px; }
  .pt ::-webkit-scrollbar-track { background:transparent; }
  .pt ::-webkit-scrollbar-thumb { background:${T.borderHi}; border-radius:2px; }
  .pt .recharts-cartesian-axis-tick-value { fill:${T.chartTick} !important; font-size:10px; font-family:'IBM Plex Mono',monospace; }
  .pt .recharts-legend-item-text { color:${T.textSecondary} !important; font-size:11px; font-family:'IBM Plex Mono',monospace; }

  /* ── Header ── */
  .pt-hdr {
    background:${T.surface}; border:1px solid ${T.border}; border-radius:12px;
    padding:16px 22px; display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap;
    margin-bottom:18px;
  }
  .pt-hdr-brand { display:flex; align-items:center; gap:12px; }
  .pt-hdr-icon  { width:40px; height:40px; border-radius:10px; display:flex; align-items:center; justify-content:center; background:${T.successBg}; border:1px solid rgba(16,185,129,0.3); flex-shrink:0; }
  .pt-hdr-title { font-size:15px; font-weight:700; color:${T.textPrimary}; font-family:'Space Grotesk',sans-serif; letter-spacing:-0.01em; }
  .pt-hdr-sub   { font-size:11px; color:${T.textMuted}; margin-top:2px; }
  .pt-hdr-pills { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .pt-pill { display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:5px; font-size:10px; font-weight:700; font-family:'IBM Plex Mono',monospace; letter-spacing:0.04em; border:1px solid; }
  .pt-pill.green { background:${T.successBg}; border-color:rgba(16,185,129,0.25); color:${T.success}; }
  .pt-pill.red   { background:${T.dangerBg};  border-color:rgba(239,68,68,0.25);  color:${T.danger}; }
  .pt-pill.blue  { background:${T.accentSoft}; border-color:rgba(59,130,246,0.25); color:${T.accent}; }
  .pt-pill.gray  { background:rgba(107,114,128,0.1); border-color:rgba(107,114,128,0.25); color:${T.neutral}; }

  /* ── Sync btn ── */
  .pt-sync-btn { display:inline-flex; align-items:center; gap:6px; padding:7px 14px; border-radius:7px; font-size:12px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; transition:all 0.15s; background:${T.accentGlow}; border:1px solid rgba(59,130,246,0.35); color:${T.accent}; white-space:nowrap; }
  .pt-sync-btn:hover:not(:disabled) { background:rgba(59,130,246,0.24); }
  .pt-sync-btn:disabled { opacity:0.45; cursor:not-allowed; }

  /* ── Tabs ── */
  .pt-tabs-bar   { display:flex; align-items:center; gap:12px; flex-wrap:wrap; margin-bottom:18px; }
  .pt-tabs-group { display:flex; align-items:center; gap:4px; padding:4px; background:${T.surface}; border:1px solid ${T.border}; border-radius:8px; }
  .pt-tab {
    display:inline-flex; align-items:center; gap:6px; padding:7px 16px; border-radius:6px;
    border:none; background:transparent; font-size:12px; font-weight:600; font-family:'DM Sans',sans-serif;
    color:${T.textMuted}; cursor:pointer; transition:all 0.15s; white-space:nowrap; letter-spacing:0.01em;
  }
  .pt-tab:hover:not(.active) { color:${T.textSecondary}; background:rgba(var(--tl-ink, 255,255,255),0.04); }
  .pt-tab.consent.active { background:${T.successBg}; color:${T.success}; border:1px solid rgba(16,185,129,0.25); }
  .pt-tab.cookies.active { background:${T.warningBg}; color:${T.warning}; border:1px solid rgba(245,158,11,0.25); }
  .pt-tab.uso.active     { background:${T.accentSoft}; color:${T.accent}; border:1px solid rgba(59,130,246,0.25); }

  /* ── Filter bar ── */
  .pt-filter-bar { display:flex; align-items:flex-end; gap:14px; flex-wrap:wrap; padding:12px 16px; background:${T.surface}; border:1px solid ${T.border}; border-radius:10px; margin-bottom:16px; }
  .pt-filter-grp { display:flex; flex-direction:column; gap:5px; }
  .pt-filter-lbl { font-size:9px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; }
  .pt-filter-sel {
    background:${T.surfaceAlt}; border:1px solid ${T.border}; color:${T.textPrimary};
    border-radius:6px; padding:6px 28px 6px 10px; font-size:12px; font-family:'DM Sans',sans-serif; cursor:pointer;
    appearance:none; -webkit-appearance:none; min-width:150px; outline:none; transition:border-color 0.15s;
    background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23F1F5F9' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
    background-repeat:no-repeat; background-position:right 8px center;
  }
  .pt-filter-sel:focus { border-color:rgba(59,130,246,0.5); box-shadow:0 0 0 2px rgba(59,130,246,0.1); }
  .pt-filter-sel:disabled { opacity:0.45; cursor:default; }

  /* ── KPI grid ── */
  .pt-kpi-grid-4 { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:12px; }
  .pt-kpi-grid-3 { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; margin-bottom:18px; }
  @media(max-width:960px) { .pt-kpi-grid-4 { grid-template-columns:repeat(2,1fr); } }
  @media(max-width:700px) { .pt-kpi-grid-3,.pt-kpi-grid-4 { grid-template-columns:1fr; } }

  .pt-kpi {
    background:${T.surface}; border:1px solid ${T.border}; border-radius:10px;
    padding:14px 16px; position:relative; overflow:hidden;
    transition:border-color 0.2s, transform 0.15s, box-shadow 0.2s;
  }
  .pt-kpi:hover { border-color:var(--kc,${T.borderHi}); transform:translateY(-2px); box-shadow:0 8px 24px rgba(0,0,0,0.3); }
  .pt-kpi::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; background:var(--kc,${T.accent}); }
  .pt-kpi-icon  { position:absolute; top:12px; right:12px; width:36px; height:36px; border-radius:8px; display:flex; align-items:center; justify-content:center; background:var(--ki-bg,rgba(59,130,246,0.18)); }
  .pt-kpi-lbl   { font-size:9px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; margin-bottom:6px; padding-right:44px; }
  .pt-kpi-val   { font-size:26px; font-weight:700; font-family:'Space Grotesk',sans-serif; letter-spacing:-0.02em; line-height:1; color:var(--kc,${T.textPrimary}); }
  .pt-kpi-delta { font-size:10px; font-family:'IBM Plex Mono',monospace; margin-top:5px; }
  .pt-kpi-delta.pos { color:${T.success}; }
  .pt-kpi-delta.neg { color:${T.danger}; }

  /* ── Block / chart card ── */
  .pt-block {
    background:${T.surface}; border:1px solid ${T.border}; border-radius:10px;
    overflow:hidden; transition:border-color 0.2s; margin-bottom:16px;
  }
  .pt-block:hover { border-color:${T.borderHi}; }
  .pt-block-hdr {
    display:flex; align-items:center; justify-content:space-between;
    padding:10px 16px; background:${T.surfaceAlt}; border-bottom:1px solid ${T.border};
  }
  .pt-block-title { display:flex; align-items:center; gap:7px; font-size:11px; font-weight:700; color:${T.textPrimary}; text-transform:uppercase; letter-spacing:0.09em; font-family:'IBM Plex Mono',monospace; }
  .pt-block-body  { padding:16px; }

  /* ── Pie circle ── */
  .pt-pie-wrap { display:flex; flex-direction:column; align-items:center; gap:6px; }
  .pt-pie-lbl  { font-size:10px; font-weight:600; font-family:'IBM Plex Mono',monospace; color:${T.textMuted}; text-align:center; letter-spacing:0.05em; text-transform:uppercase; }

  /* ── Chart area ── */
  .pt-chart-area { display:grid; grid-template-columns:130px 1fr; gap:16px; align-items:center; }
  @media(max-width:680px) { .pt-chart-area { grid-template-columns:1fr; } }

  /* ── Tooltip ── */
  .pt-tooltip { background:${T.surfaceHi}; border:1px solid ${T.borderHi}; border-radius:8px; padding:10px 14px; box-shadow:0 20px 40px rgba(0,0,0,0.5); }
  .pt-tooltip-label { font-size:10px; font-family:'IBM Plex Mono',monospace; color:${T.textMuted}; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:6px; }
  .pt-tooltip-row { display:flex; align-items:center; gap:6px; font-size:12px; margin-bottom:3px; }
  .pt-tooltip-dot { width:7px; height:7px; border-radius:2px; flex-shrink:0; }
  .pt-tooltip-name { color:${T.textSecondary}; font-size:11px; }
  .pt-tooltip-val { color:${T.textPrimary}; font-weight:700; font-family:'IBM Plex Mono',monospace; margin-left:auto; padding-left:12px; }

  /* ── Sync info ── */
  .pt-sync-info { display:inline-flex; align-items:center; gap:5px; font-size:10px; font-family:'IBM Plex Mono',monospace; color:${T.textMuted}; }

  /* ── Empty / error / restricted ── */
  .pt-empty { display:flex; flex-direction:column; align-items:center; gap:14px; padding:60px 24px; text-align:center; }
  .pt-empty-icon { width:52px; height:52px; border-radius:13px; display:flex; align-items:center; justify-content:center; background:${T.accentSoft}; border:1px solid rgba(59,130,246,0.25); }
  .pt-empty-text { font-size:13px; color:${T.textMuted}; font-family:'DM Sans',sans-serif; line-height:1.6; }
  .pt-error { background:${T.dangerBg}; border:1px solid rgba(239,68,68,0.3); border-radius:8px; padding:12px 16px; font-size:12px; font-family:'IBM Plex Mono',monospace; color:${T.danger}; display:flex; align-items:center; gap:8px; margin-bottom:16px; }
  .pt-restricted { display:flex; flex-direction:column; align-items:center; gap:14px; padding:64px 24px; text-align:center; }
  .pt-restricted-icon { width:56px; height:56px; border-radius:14px; display:flex; align-items:center; justify-content:center; background:${T.dangerBg}; border:1px solid rgba(239,68,68,0.3); }

  /* ── Uso section ── */
  .pt-uso-hdr { background:${T.cyanBg}; border:1px solid rgba(34,211,238,0.25); border-radius:8px; padding:10px 16px; margin-bottom:16px; font-size:11px; font-weight:700; letter-spacing:0.09em; text-transform:uppercase; font-family:'IBM Plex Mono',monospace; color:${T.cyan}; display:flex; align-items:center; gap:8px; }
`;

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtNum(n: number): string {
  return n.toLocaleString("pt-BR");
}

function fmtAxisDate(dateStr: string): string {
  const [, m, d] = dateStr.split("-");
  return `${Number(d)}/${Number(m)}`;
}

function fmtDelta(v: number | null): React.ReactNode {
  if (v === null) return null;
  const sign = v >= 0 ? "▲" : "▼";
  return (
    <div className={`pt-kpi-delta ${v >= 0 ? "pos" : "neg"}`}>
      {sign} {Math.abs(v).toFixed(2)}%
    </div>
  );
}

const MES_LABELS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
const PERIOD_OPTIONS = [
  { value: "7d",  label: "Últimos 7 dias" },
  { value: "30d", label: "Últimos 30 dias" },
  { value: "6m",  label: "Últimos 6 meses" },
  { value: "12m", label: "Últimos 12 meses" },
];
const MONTH_OPTIONS = [
  { value: "0", label: "Selecione" },
  ...MES_LABELS.map((l, i) => ({ value: String(i + 1), label: `${String(i + 1).padStart(2,"0")} — ${l}` })),
];

// ── Tooltip customizado ───────────────────────────────────────────────────────
function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="pt-tooltip">
      <div className="pt-tooltip-label">{label}</div>
      {payload.map((p: any) => (
        <div key={p.name} className="pt-tooltip-row">
          <span className="pt-tooltip-dot" style={{ background: p.color }} />
          <span className="pt-tooltip-name">{p.name}</span>
          <span className="pt-tooltip-val">{fmtNum(p.value)}</span>
        </div>
      ))}
    </div>
  );
}

// ── KPI Card ─────────────────────────────────────────────────────────────────
function KpiCard({
  label, value, delta, color, iconBg, icon: Icon,
}: {
  label: string;
  value: string | number;
  delta?: number | null;
  color: string;
  iconBg: string;
  icon: React.ElementType;
}) {
  return (
    <div className="pt-kpi" style={{ "--kc": color, "--ki-bg": iconBg } as React.CSSProperties}>
      <div className="pt-kpi-icon">
        <Icon size={16} color={color} />
      </div>
      <div className="pt-kpi-lbl">{label}</div>
      <div className="pt-kpi-val">{typeof value === "number" ? fmtNum(value) : value}</div>
      {delta != null && fmtDelta(delta)}
    </div>
  );
}

// ── PieChart de porcentagem ───────────────────────────────────────────────────
function PercentCircle({ pct, color, label }: { pct: number; color: string; label: string }) {
  const safe = Math.max(0, Math.min(100, pct));
  const data = [{ v: safe, fill: color }, { v: 100 - safe, fill: T.border }];
  return (
    <div className="pt-pie-wrap">
      <div style={{ position: "relative", width: 120, height: 120 }}>
        <PieChart width={120} height={120}>
          <Pie data={data} dataKey="v" innerRadius={42} outerRadius={56}
            startAngle={90} endAngle={-270} cx="50%" cy="50%" stroke="none">
            {data.map((d, i) => <Cell key={i} fill={d.fill} />)}
          </Pie>
        </PieChart>
        <div style={{
          position: "absolute", top: "50%", left: "50%",
          transform: "translate(-50%,-50%)", textAlign: "center",
        }}>
          <div style={{ fontSize: 20, fontWeight: 700, fontFamily: "'Space Grotesk',sans-serif", color: T.textPrimary }}>
            {Math.round(safe)}%
          </div>
        </div>
      </div>
      <div className="pt-pie-lbl">{label}</div>
    </div>
  );
}

// ── Filter select ─────────────────────────────────────────────────────────────
function FilterSelect({
  label, value, onChange, options, disabled,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}) {
  return (
    <div className="pt-filter-grp">
      <span className="pt-filter-lbl">{label}</span>
      <select
        className="pt-filter-sel"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

// ── Tab: Consentamentos ───────────────────────────────────────────────────────
function ConsentamentosTab() {
  const thisYear = new Date().getFullYear();
  const [ano, setAno] = React.useState(thisYear);
  const [period, setPeriod] = React.useState<ConsentamentosFilter["period"]>("30d");
  const [mes, setMes] = React.useState<number | null>(null);
  const [grupo, setGrupo] = React.useState("");
  const [hipotese, setHipotese] = React.useState("");

  const getFn = useServerFn(getPrivacyConsentamentos);
  const { data, isLoading, error } = useQuery({
    queryKey: ["privacy-consentamentos", { ano, period, mes, grupo, hipotese }],
    queryFn: () => getFn({ data: { ano, period, mes, grupo: grupo || undefined, hipoteseTratamento: hipotese || undefined } }),
    staleTime: 60_000,
  });

  const totals = data?.totals;
  const series = data?.series ?? [];
  const pctConcedidos = totals?.total
    ? Math.round((totals.concedidos / totals.total) * 100)
    : 0;

  const years = Array.from({ length: 5 }, (_, i) => thisYear - i).map((y) => ({
    value: String(y), label: String(y),
  }));

  const grupoOptions = [
    { value: "", label: "Todos" },
    ...(data?.grupos ?? []).map((g) => ({ value: g, label: g })),
  ];
  const hipoteseOptions = [
    { value: "", label: "Todos" },
    ...(data?.hipoteses ?? []).map((h) => ({ value: h, label: h })),
  ];

  return (
    <div className="pt-fadeup">
      {/* Filter bar */}
      <div className="pt-filter-bar">
        <FilterSelect label="Filtrar por tipo" value="consentamentos"
          onChange={() => {}} options={[{ value: "consentamentos", label: "Consentimentos" }]} disabled />
        <FilterSelect label="Ano" value={ano}
          onChange={(v) => setAno(Number(v))} options={years} />
        <FilterSelect label="Período" value={mes ? "" : (period ?? "30d")}
          onChange={(v) => { setPeriod(v as any); setMes(null); }}
          options={PERIOD_OPTIONS} disabled={mes != null} />
        <FilterSelect label="Mês" value={mes ?? 0}
          onChange={(v) => { const n = Number(v); setMes(n > 0 ? n : null); }}
          options={MONTH_OPTIONS} />
        {grupoOptions.length > 1 && (
          <FilterSelect label="Grupo de Consentimentos" value={grupo}
            onChange={setGrupo} options={grupoOptions} />
        )}
        {hipoteseOptions.length > 1 && (
          <FilterSelect label="Hipótese de tratamento" value={hipotese}
            onChange={setHipotese} options={hipoteseOptions} />
        )}
      </div>

      {error && (
        <div className="pt-error">
          <XCircle size={14} /> {(error as Error).message}
        </div>
      )}

      {isLoading ? (
        <div className="pt-empty">
          <div className="pt-empty-icon"><RefreshCw size={22} color={T.accent} className="pt-spin" /></div>
          <div className="pt-empty-text">Carregando dados...</div>
        </div>
      ) : !totals || series.length === 0 ? (
        <div className="pt-empty">
          <div className="pt-empty-icon"><ShieldCheck size={22} color={T.accent} /></div>
          <div className="pt-empty-text">
            Nenhum dado disponível para o período selecionado.<br />
            Execute a sincronização para importar dados do Privacy Tools.
          </div>
        </div>
      ) : (
        <>
          {/* KPIs linha 1: Titulares */}
          <div className="pt-kpi-grid-4">
            <KpiCard label="Titulares Concedidos" value={totals.titularesConcedidos}
              color={T.success} iconBg={T.successBg} icon={CheckCircle2} />
            <KpiCard label="Titulares Recusados" value={totals.titularesRecusados}
              color={T.danger} iconBg={T.dangerBg} icon={XCircle} />
            <KpiCard label="Titulares Mistos" value={totals.titularesMistos}
              color={T.cyan} iconBg={T.cyanBg} icon={Users} />
            <KpiCard label="Total Titulares" value={totals.titularesTotal}
              color={T.neutral} iconBg="rgba(107,114,128,0.12)" icon={Database} />
          </div>

          {/* KPIs linha 2: Consentamentos */}
          <div className="pt-kpi-grid-3">
            <KpiCard label="Concedidos" value={totals.concedidos} delta={totals.deltaConcedidos}
              color={T.success} iconBg={T.successBg} icon={CheckCircle2} />
            <KpiCard label="Recusados" value={totals.recusados} delta={totals.deltaRecusados}
              color={T.danger} iconBg={T.dangerBg} icon={XCircle} />
            <KpiCard label="Total" value={totals.total}
              color={T.accent} iconBg={T.accentSoft} icon={Activity} />
          </div>

          {/* Gráfico */}
          <div className="pt-block">
            <div className="pt-block-hdr">
              <div className="pt-block-title">
                <Activity size={13} color={T.success} />
                Visão Geral de Consentimento
              </div>
            </div>
            <div className="pt-block-body">
              <div className="pt-chart-area">
                <PercentCircle pct={pctConcedidos} color={T.success} label="Taxa de consentimento" />
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={series} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid} />
                    <XAxis dataKey="date" stroke={T.chartAxis}
                      tick={{ fontSize: 10, fill: T.chartTick, fontFamily: "'IBM Plex Mono',monospace" }}
                      tickFormatter={fmtAxisDate} />
                    <YAxis stroke={T.chartAxis}
                      tick={{ fontSize: 10, fill: T.chartTick, fontFamily: "'IBM Plex Mono',monospace" }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="concedidos" name="Concedidos"
                      stroke={T.success} strokeWidth={2} dot={{ r: 3, fill: T.success }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="recusados" name="Recusados"
                      stroke={T.danger} strokeWidth={2} dot={{ r: 3, fill: T.danger }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Tab: Cookies Incrementais ─────────────────────────────────────────────────
function CookiesIncrementaisTab() {
  const [period, setPeriod] = React.useState<CookiesFilter["period"]>("30d");

  const getFn = useServerFn(getPrivacyCookies);
  const { data, isLoading, error } = useQuery({
    queryKey: ["privacy-cookies", { period }],
    queryFn: () => getFn({ data: { period } }),
    staleTime: 60_000,
  });

  const totals = data?.totals;
  const series = data?.series ?? [];
  const pctConcedidos = totals?.total
    ? Math.round((totals.concedidos / totals.total) * 100)
    : 0;

  return (
    <div className="pt-fadeup">
      <div className="pt-filter-bar">
        <FilterSelect label="Filtrar por tipo" value="cookies"
          onChange={() => {}} options={[{ value: "cookies", label: "Cookies" }]} disabled />
        <FilterSelect label="Período" value={period ?? "30d"}
          onChange={(v) => setPeriod(v as any)} options={PERIOD_OPTIONS} />
      </div>

      {error && (
        <div className="pt-error">
          <XCircle size={14} /> {(error as Error).message}
        </div>
      )}

      {isLoading ? (
        <div className="pt-empty">
          <div className="pt-empty-icon"><RefreshCw size={22} color={T.accent} className="pt-spin" /></div>
          <div className="pt-empty-text">Carregando dados...</div>
        </div>
      ) : !totals || series.length === 0 ? (
        <div className="pt-empty">
          <div className="pt-empty-icon"><Cookie size={22} color={T.warning} /></div>
          <div className="pt-empty-text">
            Nenhum dado disponível para o período selecionado.<br />
            Execute a sincronização para importar dados do Privacy Tools.
          </div>
        </div>
      ) : (
        <>
          <div className="pt-kpi-grid-3">
            <KpiCard label="Concedidos em Cookies" value={totals.concedidos} delta={totals.deltaConcedidos}
              color={T.success} iconBg={T.successBg} icon={CheckCircle2} />
            <KpiCard label="Recusados em Cookies" value={totals.recusados} delta={totals.deltaRecusados}
              color={T.warning} iconBg={T.warningBg} icon={XCircle} />
            <KpiCard label="Total" value={totals.total}
              color={T.accent} iconBg={T.accentSoft} icon={Activity} />
          </div>

          <div className="pt-block">
            <div className="pt-block-hdr">
              <div className="pt-block-title">
                <Cookie size={13} color={T.warning} />
                Visão Geral de Cookies Incrementais
              </div>
            </div>
            <div className="pt-block-body">
              <div className="pt-chart-area">
                <PercentCircle pct={pctConcedidos} color={T.success} label="Taxa de consentimento" />
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart data={series} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid} />
                    <XAxis dataKey="date" stroke={T.chartAxis}
                      tick={{ fontSize: 10, fill: T.chartTick, fontFamily: "'IBM Plex Mono',monospace" }}
                      tickFormatter={fmtAxisDate} />
                    <YAxis stroke={T.chartAxis}
                      tick={{ fontSize: 10, fill: T.chartTick, fontFamily: "'IBM Plex Mono',monospace" }} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="concedidos" name="Concedidos em Cookies"
                      stroke={T.success} strokeWidth={2} dot={{ r: 3, fill: T.success }} activeDot={{ r: 5 }} />
                    <Line type="monotone" dataKey="recusados" name="Recusados em Cookies"
                      stroke={T.warning} strokeWidth={2} dot={{ r: 3, fill: T.warning }} activeDot={{ r: 5 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Tab: Relatório de Uso ─────────────────────────────────────────────────────
function RelatorioUsoTab() {
  const thisYear = new Date().getFullYear();
  const [ano, setAno] = React.useState(thisYear);

  const getFn = useServerFn(getPrivacyUso);
  const { data, isLoading, error } = useQuery({
    queryKey: ["privacy-uso", { ano }],
    queryFn: () => getFn({ data: { ano } }),
    staleTime: 60_000,
  });

  const anos = (data?.anos ?? [thisYear]).map((y) => ({ value: String(y), label: String(y) }));

  return (
    <div className="pt-fadeup">
      {/* Cabeçalho de seção */}
      <div className="pt-uso-hdr">
        <FileBarChart size={14} />
        Relatório de Uso
      </div>

      {error && (
        <div className="pt-error">
          <XCircle size={14} /> {(error as Error).message}
        </div>
      )}

      {isLoading ? (
        <div className="pt-empty">
          <div className="pt-empty-icon"><RefreshCw size={22} color={T.accent} className="pt-spin" /></div>
          <div className="pt-empty-text">Carregando dados...</div>
        </div>
      ) : (
        <>
          {/* KPIs de uso */}
          <div className="pt-kpi-grid-3" style={{ marginBottom: 18 }}>
            <KpiCard label="Número de Sites" value={data?.summary?.numSites ?? 0}
              color={T.accent} iconBg={T.accentSoft} icon={Globe} />
            <KpiCard label="Número de Empresas" value={data?.summary?.numEmpresas ?? 0}
              color={T.warning} iconBg={T.warningBg} icon={Building2} />
            <KpiCard label="Titulares de Dados" value={data?.summary?.numTitulares ?? 0}
              color={T.purple} iconBg={T.purpleBg} icon={Database} />
          </div>

          {/* Filtro de ano */}
          <div className="pt-filter-bar" style={{ marginBottom: 16 }}>
            <FilterSelect label="Ano" value={ano} onChange={(v) => setAno(Number(v))} options={anos} />
          </div>

          {/* Gráfico Page Views */}
          {(data?.series?.length ?? 0) === 0 ? (
            <div className="pt-empty">
              <div className="pt-empty-icon"><LayoutDashboard size={22} color={T.accent} /></div>
              <div className="pt-empty-text">
                Nenhum dado de uso para {ano}.<br />
                Execute a sincronização para importar dados do Privacy Tools.
              </div>
            </div>
          ) : (
            <div className="pt-block">
              <div className="pt-block-hdr">
                <div className="pt-block-title">
                  <Activity size={13} color={T.accent} />
                  Page Views por Mês — {ano}
                </div>
              </div>
              <div className="pt-block-body">
                <ResponsiveContainer width="100%" height={280}>
                  <LineChart data={data!.series} margin={{ top: 5, right: 10, left: 10, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={T.chartGrid} />
                    <XAxis dataKey="mesLabel" stroke={T.chartAxis}
                      tick={{ fontSize: 10, fill: T.chartTick, fontFamily: "'IBM Plex Mono',monospace" }} />
                    <YAxis stroke={T.chartAxis}
                      tick={{ fontSize: 10, fill: T.chartTick, fontFamily: "'IBM Plex Mono',monospace" }}
                      tickFormatter={(v) => v >= 1000 ? `${(v / 1000).toFixed(0)}k` : String(v)} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Line type="monotone" dataKey="pageViews" name="Page Views"
                      stroke={T.success} strokeWidth={2}
                      dot={{ r: 4, fill: T.success }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ── Componente principal ──────────────────────────────────────────────────────
type Tab = "consentamentos" | "cookies" | "uso";

const TABS: { key: Tab; label: string; icon: React.ElementType; cls: string }[] = [
  { key: "consentamentos", label: "Consentimentos",       icon: ShieldCheck,    cls: "consent" },
  { key: "cookies",        label: "Cookies Incrementais", icon: Cookie,         cls: "cookies" },
  { key: "uso",            label: "Relatório de uso",     icon: FileBarChart,   cls: "uso"     },
];

export function PrivacyToolsRealDashboard() {
  const [activeTab, setActiveTab] = React.useState<Tab>("consentamentos");
  const { isAdmin, isModuleAdmin, can } = usePermissions();

  const canManage = isAdmin || isModuleAdmin("privacy-tools");
  const canView = canManage || can("privacy-tools", "view");


  return (
    <div className="pt" style={{ background: T.bg, minHeight: "100%", padding: "20px" }}>
      <style>{CSS}</style>

      {!canView ? (
        <div className="pt-restricted">
          <div className="pt-restricted-icon">
            <Lock size={24} color={T.danger} />
          </div>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 700, fontSize: 15, color: T.textPrimary }}>
            Acesso Restrito
          </div>
          <div style={{ fontSize: 13, color: T.textMuted, fontFamily: "'DM Sans',sans-serif" }}>
            Você não tem permissão para visualizar este módulo.
          </div>
        </div>
      ) : (
        <>
          {/* Header */}
          <div className="pt-hdr">
            <div className="pt-hdr-brand">
              <div className="pt-hdr-icon">
                <ShieldCheck size={20} color={T.success} />
              </div>
              <div>
                <div className="pt-hdr-title">Privacy Tools (LGPD)</div>
                <div className="pt-hdr-sub">Consentimentos · Cookies Incrementais · Relatório de Uso</div>
              </div>
            </div>
            <SyncActions moduleSlug="privacy-tools" />
          </div>

          {/* Tabs */}
          <div className="pt-tabs-bar">
            <div className="pt-tabs-group">
              {TABS.map(({ key, label, icon: Icon, cls }) => (
                <button
                  key={key}
                  className={`pt-tab ${cls}${activeTab === key ? " active" : ""}`}
                  onClick={() => setActiveTab(key)}
                >
                  <Icon size={13} />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Conteúdo */}
          {activeTab === "consentamentos" && <ConsentamentosTab />}
          {activeTab === "cookies"        && <CookiesIncrementaisTab />}
          {activeTab === "uso"            && <RelatorioUsoTab />}
        </>
      )}
    </div>
  );
}
