import { SyncActions } from "@/components/layout/SyncActions";
import { ModuleLoading } from "@/components/layout/ModuleLoading";
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
  Legend,
  LineChart,
  Line,
  LabelList,
  Label,
} from "recharts";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useFilters } from "@/lib/filters-context";
import { useDepartments } from "@/lib/use-departments";
import { listApplications, getVulnFqdnDeptMap } from "@/lib/applications.functions";
import { useAuth } from "@/lib/auth-context";
import { usePermissions } from "@/lib/use-permissions";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { ArrowUpDown, ArrowUp, ArrowDown, Plus, Search, CalendarPlus, Lock, CheckCircle2, XCircle, X, ClipboardCheck, Maximize2, Minimize2, ShieldAlert, Activity, TrendingDown, AlertTriangle, BarChart2, Settings2, Wrench, LayoutDashboard, Download } from "lucide-react";
import * as XLSX from "xlsx";
import { cn } from "@/lib/utils";
import {
  type Vuln,
  SevBadge,
  StatusBadge,
  closedAt,
  infraCriadoDate,
  lastUpdatedAt,
  pickRaw,
} from "./vulnerabilidades/vuln-shared";
import { VulnDetailsSheet } from "./vulnerabilidades/VulnDetailsSheet";

// ── Design Tokens ──────────────────────────────────────────────────────────────
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
  neutral: "var(--tl-6b7280, #6B7280)",
  textPrimary: "var(--tl-f1f5f9, #F1F5F9)",
  textSecondary: "var(--tl-f1f5f9, #F1F5F9)",
  textMuted: "var(--tl-f1f5f9, #F1F5F9)",
  textSubtle: "var(--tl-f1f5f9, #F1F5F9)",
  chartGrid: "rgba(var(--tl-line-rgb, 30,38,64),0.7)",
  chartAxis: "var(--tl-f1f5f9, #F1F5F9)",
  chartTick: "var(--tl-f1f5f9, #F1F5F9)",
};

// Tokens da interface v2 (moldura: cabeçalho, filtros, KPIs, tabela, diálogos).
// Os gráficos (Severidade, Por Status, Evolução Mensal) continuam no T acima, sem mudança.
const V = {
  bg: "var(--v2-bg)",
  surface: "var(--v2-surface)",
  surface2: "var(--v2-surface-2)",
  hover: "var(--v2-hover)",
  line: "var(--v2-line)",
  lineStrong: "var(--v2-line-strong)",
  fg: "var(--v2-fg)",
  fg2: "var(--v2-fg-2)",
  fg3: "var(--v2-fg-3)",
  accent: "var(--v2-accent)",
  accentInk: "var(--v2-accent-ink)",
  crit: "var(--v2-crit)",
  med: "var(--v2-med)",
  ok: "var(--v2-ok)",
  font: "var(--font-ui)",
  mono: "var(--font-data)",
};

const SEV_MAP: Record<string, { color: string; bg: string; border: string }> = {
  Crítica: { color: T.danger, bg: T.dangerBg, border: "rgba(239,68,68,0.25)" },
  Alta: { color: T.warning, bg: T.warningBg, border: "rgba(245,158,11,0.25)" },
  Média: { color: T.accent, bg: T.accentSoft, border: "rgba(59,130,246,0.25)" },
  Baixa: { color: T.success, bg: T.successBg, border: "rgba(16,185,129,0.25)" },
};
const STATUS_MAP: Record<string, { color: string; bg: string; border: string }> = {
  Aberta: { color: T.danger, bg: T.dangerBg, border: "rgba(239,68,68,0.25)" },
  "Em tratamento": { color: T.warning, bg: T.warningBg, border: "rgba(245,158,11,0.25)" },
  Mitigada: { color: T.accent, bg: T.accentSoft, border: "rgba(59,130,246,0.25)" },
  Fechada: { color: T.success, bg: T.successBg, border: "rgba(16,185,129,0.25)" },
};
const SEV_CHART = { Crítica: T.danger, Alta: T.warning, Média: T.accent, Baixa: T.success };
const STAT_CHART = { Aberta: T.danger, "Em tratamento": T.warning, Mitigada: T.accent, Fechada: T.success };
const SLA_DAYS: Record<string, number> = { Crítica: 5, Alta: 8, Média: 30, Baixa: 60 };
const KPI_FILTER_LABEL: Record<"open" | "treatment" | "mitigated" | "retest" | "discovered", string> = {
  open: "Status: Abertas",
  treatment: "Status: Em tratamento",
  mitigated: "Status: Mitigadas / fechadas",
  retest: "Em reteste",
  discovered: "Descobertas no mês",
};

// ── Inline CSS ─────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');

  .vr { font-family:var(--font-ui); color:var(--v2-fg); font-size:14px; }
  .vr * { box-sizing:border-box; }
  .vr-stack { display:flex; flex-direction:column; gap:20px; }

  @keyframes vr-spin    { to{transform:rotate(360deg)} }
  @keyframes vr-fadeup  { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  .vr-fadeup { animation:vr-fadeup 0.3s ease forwards; }
  .vr-spin   { animation:vr-spin 0.75s linear infinite; }
  @media (prefers-reduced-motion: reduce) { .vr-fadeup, .vr-spin { animation:none; } }

  .vr ::-webkit-scrollbar       { width:6px; height:6px; }
  .vr ::-webkit-scrollbar-track { background:transparent; }
  .vr ::-webkit-scrollbar-thumb { background:var(--v2-line-strong); border-radius:3px; }
  .vr :focus-visible { outline:2px solid var(--v2-accent); outline-offset:2px; }

  /* ── Gráficos (inalterado) ── */
  .vr .recharts-cartesian-axis-tick-value { fill:var(--v2-fg-2) !important; font-size:10px; font-family:'IBM Plex Mono',monospace; }
  .vr .recharts-label { fill:var(--v2-fg) !important; }
  .vr .recharts-text.recharts-label { fill:var(--v2-fg) !important; }
  .vr .recharts-label-list text { fill:var(--v2-fg) !important; }
  .vr .recharts-cartesian-axis-line { stroke:var(--v2-line-strong) !important; }
  .vr .recharts-cartesian-grid line { stroke:var(--v2-line) !important; }
  .vr .recharts-line-dots circle, .vr .recharts-active-dot circle { stroke:var(--v2-surface) !important; }
  .vr-arc-track { stroke:var(--v2-line); }
  .vr .recharts-legend-item-text { color:var(--v2-fg-2) !important; font-size:11px; font-family:'IBM Plex Mono',monospace; }
  .vr-tooltip { background:var(--v2-surface); border:1px solid var(--v2-line-strong); border-radius:8px; padding:10px 14px; box-shadow:0 20px 40px rgba(0,0,0,0.5); }
  .vr-tooltip-label { font-size:10px; font-family:'IBM Plex Mono',monospace; color:var(--v2-fg-3); text-transform:uppercase; letter-spacing:0.08em; margin-bottom:6px; }
  .vr-tooltip-row { display:flex; align-items:center; gap:6px; font-size:12px; margin-bottom:3px; }
  .vr-tooltip-dot { width:7px; height:7px; border-radius:2px; flex-shrink:0; }
  .vr-tooltip-name { color:var(--v2-fg-2); font-size:11px; }
  .vr-tooltip-val { color:var(--v2-fg); font-weight:700; font-family:'IBM Plex Mono',monospace; margin-left:auto; }

  /* ── Cabeçalho da página ── */
  .vr-ph { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  .vr-ph-title { font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.2; margin:0; color:var(--v2-fg); }
  .vr-ph-sub { margin:4px 0 0; font-size:13px; color:var(--v2-fg-3); }
  .vr-ph-actions { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }

  /* ── Controle segmentado ── */
  .vr-seg { display:inline-flex; padding:3px; gap:2px; background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:8px; flex-wrap:wrap; }
  .vr-seg button { display:inline-flex; align-items:center; gap:6px; border:0; background:transparent; padding:4px 12px; border-radius:5px; font-size:13px; color:var(--v2-fg-2); cursor:pointer; font-family:inherit; }
  .vr-seg button:hover { color:var(--v2-fg); }
  .vr-seg button[aria-pressed="true"] { background:var(--v2-surface-2); color:var(--v2-fg); font-weight:500; box-shadow:inset 0 0 0 1px var(--v2-line); }
  .vr-sw { width:8px; height:8px; border-radius:2px; flex-shrink:0; display:inline-block; }
  .vr-pending-badge {
    display:inline-flex; align-items:center; justify-content:center; min-width:18px; height:18px; padding:0 5px;
    border-radius:99px; background:color-mix(in oklch, var(--v2-med) 18%, transparent); color:var(--v2-med);
    font-size:11px; font-weight:500; font-family:var(--font-data);
  }

  /* ── Filtros ── */
  .vr-filters { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .vr-filters-label { font-size:12.5px; color:var(--v2-fg-3); }
  .vr-chip { display:inline-flex; align-items:center; gap:6px; height:28px; padding:0 8px 0 10px; border-radius:99px; border:0; background:color-mix(in oklch, var(--v2-accent) 14%, transparent); color:var(--v2-fg); font-size:12.5px; cursor:pointer; font-family:inherit; }
  .vr-chip svg { color:var(--v2-fg-3); }
  .vr-chip:hover svg { color:var(--v2-fg); }

  /* ── Faixa de KPIs ── */
  .vr-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
  .vr-kpi { position:relative; text-align:left; border:0; background:transparent; padding:16px 18px 14px; display:grid; gap:2px; align-content:start; box-shadow:1px 0 0 var(--v2-line), 0 1px 0 var(--v2-line); cursor:pointer; font-family:inherit; color:inherit; }
  .vr-kpi:hover { background:var(--v2-hover); }
  .vr-kpi[aria-pressed="true"] { background:color-mix(in oklch, var(--v2-accent) 14%, transparent); }
  .vr-kpi[aria-pressed="true"]::after { content:""; position:absolute; left:0; right:0; bottom:0; height:2px; background:var(--v2-accent); }
  .vr-kpi-label { font-size:12.5px; color:var(--v2-fg-2); }
  .vr-kpi-value { font-size:28px; font-weight:600; letter-spacing:-0.02em; line-height:1.25; font-variant-numeric:tabular-nums; color:var(--v2-fg); }
  .vr-kpi-foot { font-size:12px; color:var(--v2-fg-3); display:flex; align-items:center; gap:6px; flex-wrap:wrap; }
  .vr-delta { font-family:var(--font-data); font-weight:500; font-size:12px; }
  .vr-delta.bad { color:var(--v2-crit); }
  .vr-delta.good { color:var(--v2-ok); }

  /* ── Cartões dos gráficos (moldura) ── */
  .vr-block { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; display:flex; flex-direction:column; min-height:200px; min-width:0; }
  .vr-block-hdr { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 18px 4px; flex-shrink:0; }
  .vr-block-title { display:flex; align-items:center; gap:8px; font-size:14px; font-weight:600; color:var(--v2-fg); }
  .vr-resize-ctrl { display:flex; align-items:center; gap:2px; opacity:0; transition:opacity 0.15s; }
  .vr-block:hover .vr-resize-ctrl, .vr-resize-ctrl:focus-within { opacity:1; }
  .vr-resize-btn { width:26px; height:26px; display:grid; place-items:center; border:none; background:transparent; color:var(--v2-fg-3); cursor:pointer; border-radius:5px; }
  .vr-resize-btn:hover { color:var(--v2-fg); background:var(--v2-hover); }
  .vr-resize-btn:disabled { opacity:0.3; cursor:default; }
  .vr-block-body { flex:1; padding:12px 18px 18px; }

  /* ── Barras horizontais (Top responsáveis) ── */
  .vr-hbars { display:grid; gap:12px; }
  .vr-hbar { display:grid; gap:5px; }
  .vr-hbar-top { display:flex; justify-content:space-between; gap:8px; font-size:13px; color:var(--v2-fg); }
  .vr-hbar-top span:first-child { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .vr-hbar-top span:last-child { font-family:var(--font-data); font-size:12.5px; font-weight:500; color:var(--v2-fg-2); }
  .vr-track { position:relative; height:8px; background:var(--v2-surface-2); border-radius:99px; overflow:hidden; }
  .vr-fill { position:absolute; inset:0 auto 0 0; background:var(--v2-accent); border-radius:99px; }

  /* ── Badges ── */
  .vr-badge { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; white-space:nowrap; font-family:var(--font-ui); }

  /* ── Painel / tabela ── */
  .vr-panel { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
  .vr-panel-hdr { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; padding:12px 18px; border-bottom:1px solid var(--v2-line); }
  .vr-panel-title { display:flex; align-items:center; gap:8px; font-size:14px; font-weight:600; color:var(--v2-fg); }

  .vr-table { width:100%; border-collapse:collapse; font-size:13px; }
  .vr-table thead { position:sticky; top:0; z-index:10; }
  .vr-table th { padding:9px 12px; font-size:12px; font-weight:500; color:var(--v2-fg-3); text-align:left; background:var(--v2-surface); border-bottom:1px solid var(--v2-line); white-space:nowrap; cursor:pointer; user-select:none; }
  .vr-table th:hover { color:var(--v2-fg); }
  .vr-table td { padding:8px 12px; height:44px; border-bottom:1px solid var(--v2-line); color:var(--v2-fg); vertical-align:middle; }
  .vr-table tbody tr:hover td { background:var(--v2-hover); }
  .vr-table tbody tr:last-child td { border-bottom:none; }
  .vr-table .mono { font-family:var(--font-data); font-size:12.5px; }
  .vr-table .dim  { color:var(--v2-fg-3); }

  /* ── Prazo (SLA) ── */
  .vr-sla { display:grid; gap:4px; min-width:110px; }
  .vr-sla .vr-track { height:4px; }
  .vr-sla small { font-size:11.5px; color:var(--v2-fg-3); white-space:nowrap; }

  /* ── Busca ── */
  .vr-search-wrap { position:relative; display:inline-flex; align-items:center; }
  .vr-search-icon { position:absolute; left:10px; pointer-events:none; color:var(--v2-fg-3); }
  .vr-search { height:32px; background:var(--v2-bg); border:1px solid var(--v2-line); border-radius:8px; padding:0 10px 0 30px; font-size:13px; font-family:var(--font-ui); color:var(--v2-fg); outline:none; width:260px; max-width:100%; }
  .vr-search:focus { border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }
  .vr-search::placeholder { color:var(--v2-fg-3); }

  /* ── Paginação ── */
  .vr-pager { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; padding:10px 18px; border-top:1px solid var(--v2-line); }
  .vr-pager-info { font-size:12.5px; color:var(--v2-fg-3); }
  .vr-pager-btns { display:flex; gap:8px; }
  .vr-pager-btn { height:28px; padding:0 12px; border-radius:8px; font-size:12.5px; font-weight:500; border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-fg); cursor:pointer; font-family:inherit; }
  .vr-pager-btn:hover:not(:disabled) { background:var(--v2-hover); border-color:var(--v2-line-strong); }
  .vr-pager-btn:disabled { opacity:0.4; cursor:default; }

  /* ── Botões ── */
  .vr-btn { display:inline-flex; align-items:center; gap:7px; height:34px; padding:0 14px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; font-family:var(--font-ui); white-space:nowrap; border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-fg); transition:background .15s, border-color .15s; }
  .vr-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .vr-btn.sm { height:28px; padding:0 10px; font-size:12.5px; }
  .vr-btn.primary { background:var(--v2-accent); border-color:var(--v2-accent); color:var(--v2-accent-ink); }
  .vr-btn.primary:hover:not(:disabled) { filter:brightness(1.08); }
  .vr-btn.success { background:color-mix(in oklch, var(--v2-ok) 16%, transparent); border-color:color-mix(in oklch, var(--v2-ok) 40%, transparent); color:var(--v2-ok); }
  .vr-btn.success:hover:not(:disabled) { background:color-mix(in oklch, var(--v2-ok) 24%, transparent); }
  .vr-btn.danger  { background:color-mix(in oklch, var(--v2-crit) 16%, transparent); border-color:color-mix(in oklch, var(--v2-crit) 40%, transparent); color:var(--v2-crit); }
  .vr-btn.danger:hover:not(:disabled)  { background:color-mix(in oklch, var(--v2-crit) 24%, transparent); }
  .vr-btn.ghost   { background:transparent; border-color:transparent; color:var(--v2-fg-2); }
  .vr-btn.ghost:hover:not(:disabled)   { background:var(--v2-hover); color:var(--v2-fg); }

  /* ── Vazio ── */
  .vr-empty { padding:40px; text-align:center; color:var(--v2-fg-3); font-size:13px; }

  /* ── Operações ── */
  .vr-ops-empty { display:flex; flex-direction:column; align-items:center; gap:10px; padding:48px; color:var(--v2-fg-3); font-size:13px; }
  .vr-ops-icon  { width:44px; height:44px; border-radius:10px; display:flex; align-items:center; justify-content:center; background:color-mix(in oklch, var(--v2-ok) 14%, transparent); }

  /* ── Diálogos ── */
  .vr-dlg-field { display:flex; flex-direction:column; gap:6px; }
  .vr-dlg-label { font-size:12.5px; font-weight:500; color:var(--v2-fg-2); font-family:var(--font-ui); }
  .vr-dlg-input { width:100%; height:36px; padding:0 12px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-surface-2); color:var(--v2-fg); font-family:var(--font-ui); font-size:13px; outline:none; }
  .vr-dlg-input:focus { border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }
  .vr-dlg-input::placeholder { color:var(--v2-fg-3); }
  .vr .vr-dlg textarea { background:var(--v2-surface-2)!important; border-color:var(--v2-line)!important; color:var(--v2-fg)!important; font-family:var(--font-ui)!important; font-size:13px!important; border-radius:8px!important; }

  /* ── Acesso restrito ── */
  .vr-restricted { display:flex; flex-direction:column; align-items:center; gap:14px; padding:64px 24px; text-align:center; }
  .vr-restricted-icon { width:52px; height:52px; border-radius:12px; display:flex; align-items:center; justify-content:center; background:color-mix(in oklch, var(--v2-crit) 14%, transparent); }
`;

// ── Back-end helpers — ALL UNCHANGED ──────────────────────────────────────────
const SEVS = ["Crítica", "Alta", "Média", "Baixa"] as const;
const STATUSES = ["Aberta", "Em tratamento", "Mitigada", "Fechada"] as const;
const PAGE_SIZE = 15;
function daysBetween(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}
function ageDays(v: Vuln): number | null {
  if (v.status !== "Aberta") return null;
  if (!v.identified_at) return null;
  return Math.max(0, daysBetween(new Date(v.identified_at), new Date()));
}
const PT_MONTH_ABBR = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
function monthLabel(m: string): string {
  const [y, mm] = m.split("-");
  const idx = parseInt(mm, 10) - 1;
  return `${PT_MONTH_ABBR[idx] ?? mm}/${y}`;
}
function slaStatus(v: Vuln): { label: string; ok: boolean; muted: boolean } {
  if (v.status === "Mitigada" || v.status === "Fechada") return { label: "Resolvida", ok: false, muted: true };
  if (!v.identified_at) return { label: "Sem data", ok: false, muted: true };
  const days = SLA_DAYS[v.severity] ?? 30;
  const elapsed = Math.max(0, daysBetween(new Date(v.identified_at), new Date()));
  if (v.severity === "Baixa") return { label: "No prazo", ok: true, muted: false };
  if (elapsed > days) return { label: `Fora (${elapsed - days}d)`, ok: false, muted: false };
  return { label: `${days - elapsed}d`, ok: true, muted: false };
}

// Agregação mensal (descobertas / mitigadas / corrigidas / abertas acumuladas).
// Reutilizada com bases diferentes: os gráficos passam `filteredByKpi` (reage ao
// card selecionado); os cards passam `filtered` (estável, ignora o filtro de KPI).
function infraKind(v: Vuln): "new" | "maintained" | "fix" {
  const raw = (v.raw ?? {}) as Record<string, unknown>;
  const sit = String(raw["Situação"] ?? raw["Situacao"] ?? "")
    .trim()
    .toLowerCase();
  if (sit === "new") return "new";
  if (sit === "fix" || sit === "fixed") return "fix";
  if (sit === "maintained") return "maintained";
  // Fallback quando raw["Situação"] não está acessível: status + comparação Criado vs Atualizado
  if (v.status === "Fechada" || v.status === "Mitigada") return "fix";
  const criadoDate = infraCriadoDate(v);
  const atualizadoDate = v.status_changed_at?.slice(0, 10) ?? null;
  if (criadoDate && atualizadoDate && criadoDate === atualizadoDate) return "new";
  return "maintained";
}

// Chave de identidade de uma instância de vulnerabilidade de infra: o scanner reexporta a
// mesma vulnerabilidade em uma linha por mês (raw["Situação"] = New/Maintained/Fix), então
// Ativo + Vulnerabilidade sozinhos não bastam — o mesmo host costuma ter o mesmo achado
// (ex. TLSv1.1) repetido em várias portas, que são instâncias distintas e legítimas (foi
// por isso que a constraint única (department_id, fqdn, vuln_type) foi revertida em
// 20260701160000 — ela colapsava essas portas).
function infraIdentityKey(v: Vuln): string {
  const raw = (v.raw ?? {}) as Record<string, unknown>;
  const porta = String(raw["Porta"] ?? raw["Port"] ?? raw["Campo personalizado (Port)"] ?? "")
    .trim()
    .toLowerCase();
  const vulnName = String(v.vuln_type ?? raw["Vulnerabilidade"] ?? raw["Vulnerability"] ?? "")
    .trim()
    .toLowerCase();
  return `${(v.fqdn ?? "").trim().toLowerCase()}|${vulnName}|${porta}`;
}

function computeByMonth(list: Vuln[]) {
  const isInfra = list[0]?.kind === "infraestrutura";
  const monthSet = new Set<string>();
  list.forEach((v) => {
    if (v.identified_at) monthSet.add(v.identified_at.slice(0, 7));
    const c = closedAt(v);
    if (c) monthSet.add(c.slice(0, 7));
  });
  const months = Array.from(monthSet).sort();

  // Para infra: 1ª ocorrência e mês do Fix por chave (Ativo+Vulnerabilidade+Porta), lidos
  // direto de identified_at/closed_at — campos que o upsert (ver
  // 20260812140200_upsert_vuln_infra_rpc_v2) preserva de forma estável a cada import
  // (identified_at nunca regride; closed_at só é setado quando o achado é corrigido).
  // NÃO usar mais raw["Atualizado"]/Situação por linha aqui: desde que o import faz upsert
  // (1 linha por achado, sem histórico mensal), não sobra mais uma linha "New" separada pra
  // achados antigos — só o snapshot atual, que pode já estar "Maintained". Ler Atualizado
  // desse snapshot como "1ª ocorrência" colapsaria a descoberta pro mês do scan mais recente.
  let keyFirstSeen: Map<string, string> | null = null;
  let keyFixedAt: Map<string, string> | null = null;
  if (isInfra) {
    keyFirstSeen = new Map();
    keyFixedAt = new Map();
    for (const v of list) {
      const key = infraIdentityKey(v);
      if (v.identified_at) {
        const prevSeen = keyFirstSeen.get(key);
        if (!prevSeen || v.identified_at < prevSeen) keyFirstSeen.set(key, v.identified_at);
      }
      const c = closedAt(v);
      if (c) {
        const prevFix = keyFixedAt.get(key);
        if (!prevFix || c < prevFix) keyFixedAt.set(key, c);
      }
    }
  }

  let acc = 0;
  return months.map((m) => {
    // Infra: conta por CHAVE (keyFirstSeen), não por linha — mesmo com 1 linha por chave no
    // banco, isso protege contra o dashboard reagrupar linhas duplicadas remanescentes.
    const descobertas = isInfra
      ? Array.from(keyFirstSeen!.values()).filter((d) => d.slice(0, 7) === m).length
      : list.filter((v) => v.identified_at && v.identified_at.slice(0, 7) === m).length;
    const mitigadas = list.filter((v) => v.status === "Mitigada" && closedAt(v)?.slice(0, 7) === m).length;
    const fechadas = list.filter((v) => v.status === "Fechada" && closedAt(v)?.slice(0, 7) === m).length;
    const corrigidas = mitigadas + fechadas;
    let abertas: number;
    if (isInfra) {
      abertas = Array.from(keyFirstSeen!.entries()).filter(([key, firstDate]) => {
        if (firstDate.slice(0, 7) > m) return false;
        const fixDate = keyFixedAt!.get(key);
        return !fixDate || fixDate.slice(0, 7) > m;
      }).length;
    } else {
      acc += descobertas - corrigidas;
      abertas = Math.max(0, acc);
    }
    return { m, descobertas, mitigadas, corrigidas: fechadas, abertas };
  });
}

// Infra: converte o retrato mensal (vuln_infra_monthly_snapshot — contagem bruta de
// raw["Situação"] gravada no momento de cada import, ANTES de qualquer merge/upsert) pro
// formato do gráfico "Evolução Mensal". Substitui computeByMonth pra infra porque, desde que
// vulnerabilities_infra guarda só o estado atual (1 linha por achado), reconstruir "o que era
// verdade no mês X" a partir do estado de hoje deixa de bater assim que algo muda (fecha,
// reabre) — o retrato mensal é uma foto congelada que nunca muda depois, batendo com o
// gráfico de referência do Sek mês a mês. "Abertas" aqui não é acumulado — é o total
// ativo (New+Maintained) daquele mês específico, igual ao "Total" do gráfico do Sek.
function infraSnapshotToByMonth(
  snapshot: Array<{ month: string; new_count: number; maintained_count: number; fix_count: number }>,
) {
  return [...snapshot]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((r) => ({
      m: r.month,
      descobertas: r.new_count,
      mitigadas: 0,
      corrigidas: r.fix_count,
      abertas: r.new_count + r.maintained_count,
    }));
}

// ── Reusable components ────────────────────────────────────────────────────────
function SlaBadge({ v }: { v: Vuln }) {
  const s = slaStatus(v);
  const bg = s.muted ? "rgba(107,114,128,0.08)" : s.ok ? T.successBg : T.dangerBg;
  const color = s.muted ? T.neutral : s.ok ? T.success : T.danger;
  const border = s.muted ? "rgba(107,114,128,0.2)" : s.ok ? "rgba(16,185,129,0.22)" : "rgba(239,68,68,0.22)";
  return (
    <span className="vr-badge" style={{ background: bg, color, border: `1px solid ${border}` }}>
      {s.label}
    </span>
  );
}

// Prazo (SLA) na tabela: barra de consumo do prazo + texto. Mesma regra do slaStatus.
function SlaCell({ v }: { v: Vuln }) {
  const s = slaStatus(v);
  if (s.muted || !v.identified_at) return <span style={{ fontSize: 12.5, color: V.fg3 }}>{s.label}</span>;
  if (v.severity === "Baixa") return <span style={{ fontSize: 12.5, color: V.fg2 }}>{s.label}</span>;
  const days = SLA_DAYS[v.severity] ?? 30;
  const elapsed = Math.max(0, daysBetween(new Date(v.identified_at), new Date()));
  const pct = Math.min(100, (elapsed / days) * 100);
  const late = elapsed > days;
  const color = late ? V.crit : pct > 70 ? V.med : V.ok;
  const left = days - elapsed;
  const text = late
    ? `vencido há ${elapsed - days} ${elapsed - days === 1 ? "dia" : "dias"}`
    : `${left} ${left === 1 ? "dia restante" : "dias restantes"}`;
  return (
    <div className="vr-sla" title={`Prazo de ${days} dias para severidade ${v.severity}`}>
      <div className="vr-track">
        <div className="vr-fill" style={{ width: `${pct}%`, background: color }} />
      </div>
      <small>{text}</small>
    </div>
  );
}

// ── Tooltip ────────────────────────────────────────────────────────────────────
function ExecTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="vr-tooltip">
      <div className="vr-tooltip-label">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="vr-tooltip-row">
          <div className="vr-tooltip-dot" style={{ background: p.color || p.fill }} />
          <span className="vr-tooltip-name">{p.name}</span>
          <span className="vr-tooltip-val">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Resizable block ────────────────────────────────────────────────────────────
const COL_SIZES = ["col-span-1", "col-span-2", "col-span-3"] as const;
type ColSize = (typeof COL_SIZES)[number];
// No mobile o grid tem 1 coluna; o tamanho escolhido só vale a partir de lg.
const LG_COL: Record<ColSize, string> = {
  "col-span-1": "lg:col-span-1",
  "col-span-2": "lg:col-span-2",
  "col-span-3": "lg:col-span-3",
};
function Block({
  title,
  children,
  chartHeight = 260,
  defaultSize = "col-span-1" as ColSize,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  chartHeight?: number;
  defaultSize?: ColSize;
}) {
  const [size, setSize] = React.useState<ColSize>(defaultSize);
  return (
    <div className={`${LG_COL[size]} vr-block`} style={{ minHeight: chartHeight + 52 }}>
      <div className="vr-block-hdr">
        <div className="vr-block-title">
          <span>{title}</span>
        </div>
        <div className="vr-resize-ctrl">
          <button
            className="vr-resize-btn"
            aria-label="Diminuir cartão"
            title="Diminuir"
            disabled={size === COL_SIZES[0]}
            onClick={() => setSize(COL_SIZES[Math.max(0, COL_SIZES.indexOf(size) - 1)])}
          >
            <Minimize2 size={13} />
          </button>
          <button
            className="vr-resize-btn"
            aria-label="Aumentar cartão"
            title="Aumentar"
            disabled={size === COL_SIZES[2]}
            onClick={() => setSize(COL_SIZES[Math.min(2, COL_SIZES.indexOf(size) + 1)])}
          >
            <Maximize2 size={13} />
          </button>
        </div>
      </div>
      <div className="vr-block-body" style={{ height: chartHeight }}>
        <ResponsiveContainer width="100%" height="100%">
          {children as React.ReactElement}
        </ResponsiveContainer>
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
// MAIN DASHBOARD — all back-end logic UNCHANGED
// ══════════════════════════════════════════════════════════════════════════════
export function VulnerabilidadesRealDashboard() {
  const { user } = useAuth();
  const { isAdmin, isModuleAdmin, can } = usePermissions();
  const { filters, dateRange, setMonthOptions } = useFilters();
  const { data: depts } = useDepartments();

  // Mapa de FQDN → department_id com permissão vulnerabilidades:view (não requer aplicacoes:view)
  const fetchVulnFqdnMap = useServerFn(getVulnFqdnDeptMap);
  const { data: appsData } = useQuery({
    queryKey: ["vuln-fqdn-dept-map"],
    queryFn: () => fetchVulnFqdnMap(),
    staleTime: 5 * 60 * 1000,
  });
  const fqdnDeptMap = React.useMemo(() => {
    const m = new Map<string, string>(); // fqdn.toLowerCase() → department_id
    (appsData ?? []).forEach((a) => m.set(a.name.toLowerCase(), a.department_id));
    return m;
  }, [appsData]);

  // Apenas departamentos que têm aplicações cadastradas
  const appDepts = React.useMemo(() => {
    const ids = new Set((appsData ?? []).map((a) => a.department_id));
    return (depts ?? []).filter((d) => ids.has(d.id));
  }, [appsData, depts]);
  const qc = useQueryClient();
  const isVulnAdmin = isAdmin || isModuleAdmin("vulnerabilidades");

  const logVuln = async (opts: {
    vuln_id: string;
    fqdn: string | null;
    tipo_evento: string;
    descricao: string;
    status: "success" | "error" | "info";
    detalhes?: Record<string, unknown> | null;
  }) => {
    try {
      await (supabase as any).from("vuln_logs").insert({
        vuln_id: opts.vuln_id,
        fqdn: opts.fqdn ?? null,
        tipo_evento: opts.tipo_evento,
        descricao: opts.descricao,
        usuario_email: user?.email ?? null,
        usuario_nome: user?.email?.split("@")[0] ?? null,
        status: opts.status,
        detalhes: opts.detalhes ?? null,
      });
    } catch (e) {
      // silently ignore audit log failures
    }
  };
  const tableForKind = (k: string | null | undefined) =>
    k === "infraestrutura" ? "vulnerabilities_infra" : "vulnerabilities_aplicacao";
  const tableForId = (id: string): "vulnerabilities_aplicacao" | "vulnerabilities_infra" => {
    const all = qc.getQueriesData<Vuln[]>({ queryKey: ["vulns-summary"], exact: false }).flatMap(([, d]) => d ?? []);
    const v = all.find((x) => x.id === id);
    return tableForKind(v?.kind);
  };

  const { data: myProfile } = useQuery({
    queryKey: ["my-profile-department", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("department_id").eq("id", user!.id).maybeSingle();
      if (error) throw error;
      return data;
    },
  });

  // Editar/Excluir nos detalhes: restrito a admins do departamento "Seguranca Informacao" —
  // pedido explícito do usuário, mais restritivo que isVulnAdmin sozinho (que também libera
  // qualquer module_admin de vulnerabilidades, independente do departamento).
  const SEC_INFO_DEPARTMENT_ID = "7ff618e6-cab6-49e4-a4b9-58b55b08e1f4";
  const canManageVulns = isVulnAdmin && myProfile?.department_id === SEC_INFO_DEPARTMENT_ID;

  // Retrato mensal de infra (ver 20260813160000_vuln_infra_monthly_snapshot) — alimenta o
  // "Evolução Mensal" pra infra, no lugar de reconstruir a partir de vulnerabilities_infra.
  const { data: infraMonthlySnapshot } = useQuery({
    queryKey: ["vuln-infra-monthly-snapshot"],
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await (supabase as any)
        .from("vuln_infra_monthly_snapshot")
        .select("month, new_count, maintained_count, fix_count")
        .order("month", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Array<{ month: string; new_count: number; maintained_count: number; fix_count: number }>;
    },
  });

  const [sevFilter, setSevFilter] = React.useState<string>("all");
  const [kindFilter, setKindFilter] = React.useState<"aplicacao" | "infraestrutura">("aplicacao");
  const [kpiFilter, setKpiFilter] = React.useState<
    "all" | "open" | "treatment" | "mitigated" | "retest" | "discovered"
  >("all");
  const [activeTab, setActiveTab] = React.useState<"dashboard" | "operacoes">("dashboard");

  const deptName = React.useCallback((id: string | null) => depts?.find((d) => d.id === id)?.name ?? "—", [depts]);

  // Resolve nome do responsável priorizando o módulo de Aplicações pelo FQDN
  const resolveResponsible = React.useCallback(
    (fqdn: string | null, deptId: string | null): string => {
      if (fqdn) {
        const appDeptId = fqdnDeptMap.get(fqdn.toLowerCase());
        if (appDeptId) return depts?.find((d) => d.id === appDeptId)?.name ?? "—";
      }
      return deptId ? (depts?.find((d) => d.id === deptId)?.name ?? "—") : "—";
    },
    [fqdnDeptMap, depts],
  );
  const respOf = React.useCallback((v: Vuln) => resolveResponsible(v.fqdn, v.department_id), [resolveResponsible]);

  const periodIsUnbounded = filters.period === "all" || filters.period === "months";
  const periodFromISO = periodIsUnbounded ? null : dateRange.from.toISOString();
  const periodToISO = periodIsUnbounded ? null : dateRange.to.toISOString();

  const { data: vulns, isLoading } = useQuery({
    queryKey: ["vulns-summary", filters.departmentId, filters.period, periodFromISO, periodToISO],
    staleTime: 5 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    queryFn: async (): Promise<Vuln[]> => {
      const PAGE_SZ = 1000;
      const cols =
        "id, fqdn, severity, status, responsible, identified_at, updated_at, source, vuln_type, system_app, department_id, kind, closed_at, status_changed_at, pending_approval, pending_status, pending_by, pending_at, mitigation_description, treatment_due_date, raw, created_at";
      // presumed_closed/reopened_at só existem em vulnerabilities_infra (ver
      // 20260813150000_infra_gap_close_columns) — selecionar em vulnerabilities_aplicacao
      // quebraria a query (coluna inexistente).
      const fetchTable = async (table: "vulnerabilities_aplicacao" | "vulnerabilities_infra"): Promise<Vuln[]> => {
        const tableCols = table === "vulnerabilities_infra" ? `${cols}, presumed_closed, reopened_at` : cols;
        const buildBase = (withCount: boolean) => {
          let q = withCount
            ? (supabase as any)
                .from(table)
                .select(tableCols, { count: "exact" })
                .order("identified_at", { ascending: false })
            : (supabase as any).from(table).select(tableCols).order("identified_at", { ascending: false });
          // Filtro por departamento feito no frontend (inclui vulns via fqdnDeptMap).
          // Infra: não filtrar por identified_at — vulns mantidas têm Criado histórico
          // (outubro, novembro etc.) que ficaria fora do range e desapareceria do gráfico.
          if (periodFromISO && periodToISO && table !== "vulnerabilities_infra")
            q = q.gte("identified_at", periodFromISO).lte("identified_at", periodToISO);
          return q;
        };
        const first = await buildBase(true).range(0, PAGE_SZ - 1);
        if (first.error) throw first.error;
        const total = first.count ?? first.data?.length ?? 0;
        const all: Vuln[] = (first.data ?? []) as Vuln[];
        if (total > PAGE_SZ) {
          const pages = Math.ceil(total / PAGE_SZ);
          const reqs = [];
          for (let i = 1; i < pages; i++) {
            const from = i * PAGE_SZ;
            const to = from + PAGE_SZ - 1;
            reqs.push(
              (async () => {
                const { data, error } = await buildBase(false).range(from, to);
                if (error) throw error;
                return (data ?? []) as Vuln[];
              })(),
            );
          }
          const rest = await Promise.all(reqs);
          for (const chunk of rest) all.push(...chunk);
        }
        return all;
      };
      const [apl, inf] = await Promise.all([
        fetchTable("vulnerabilities_aplicacao"),
        fetchTable("vulnerabilities_infra"),
      ]);
      return [...apl, ...inf];
    },
  });

  const filtered = React.useMemo(() => {
    if (!vulns) return [];
    const includeAll = filters.period === "all";
    const isMonthsMode = filters.period === "months";
    const selectedMonths = filters.selectedMonths ?? [];
    const fromISO = dateRange.from.toISOString().slice(0, 10);
    const toISO = dateRange.to.toISOString().slice(0, 10);

    // Para não-admin: restringe automaticamente ao dept do próprio perfil
    const forcedDeptId = !isVulnAdmin && myProfile?.department_id ? myProfile.department_id : null;
    const activeDeptId = forcedDeptId ?? (filters.departmentId !== "all" ? filters.departmentId : null);

    return vulns.filter((v) => {
      if (sevFilter !== "all" && v.severity !== sevFilter) return false;
      const vKind = v.kind ?? "aplicacao";
      if (vKind !== kindFilter) return false;
      // Filtro por departamento: v.department_id tem prioridade (fonte autoritativa);
      // fqdnDeptMap é fallback apenas para vulns sem department_id (ex: infra sem dept).
      if (activeDeptId) {
        const appDeptId = v.fqdn ? fqdnDeptMap.get(v.fqdn.toLowerCase()) : undefined;
        const effectiveDeptId = v.department_id ?? appDeptId;
        if (effectiveDeptId !== activeDeptId) return false;
      }
      if (isMonthsMode) {
        // Sem meses marcados ainda: não restringe (evita dashboard vazio ao só trocar de modo).
        if (selectedMonths.length === 0) return true;
        const date = vKind === "infraestrutura" ? infraCriadoDate(v) : v.identified_at;
        if (!date) return false;
        return selectedMonths.includes(date.slice(0, 7));
      }
      if (includeAll) return true;
      if (!v.identified_at) return false;
      const d = v.identified_at.slice(0, 10);
      return d >= fromISO && d <= toISO;
    });
  }, [
    vulns,
    sevFilter,
    kindFilter,
    dateRange,
    filters.period,
    filters.departmentId,
    filters.selectedMonths,
    fqdnDeptMap,
    isVulnAdmin,
    myProfile,
  ]);

  // Dedupe de infra: o import insere uma linha nova por mês pra cada achado que persiste
  // (raw["Situação"] = Maintained), então somar linhas cruas conta a mesma instância várias
  // vezes. Mantemos só o snapshot mais recente por chave (infraIdentityKey) — quem decide
  // "mais recente" é raw["Atualizado"] (lastUpdatedAt), não raw["Criado"], que fica igual em
  // todo snapshot de um item Maintained.
  const dedupedFiltered = React.useMemo(() => {
    if (kindFilter !== "infraestrutura") return filtered;
    const latest = new Map<string, Vuln>();
    for (const v of filtered) {
      const key = infraIdentityKey(v);
      const date = lastUpdatedAt(v) ?? v.identified_at ?? "";
      const prev = latest.get(key);
      const prevDate = prev ? (lastUpdatedAt(prev) ?? prev.identified_at ?? "") : "";
      if (!prev || date > prevDate) latest.set(key, v);
    }
    return Array.from(latest.values());
  }, [filtered, kindFilter]);

  // Achados de infra ainda abertos (status Aberta/Em tratamento) cujo snapshot mais recente
  // é de um mês anterior ao último scan disponível. Desde que o import passou a fechar
  // automaticamente achados ausentes dos hosts escaneados (close_missing_infra_vulns), isso
  // só deveria continuar acontecendo quando o HOST INTEIRO parou de aparecer no import (daí a
  // rotina de fechamento não mexe nele, de propósito — não dá pra presumir corrigido algo de
  // um host que a gente nem sabe se foi escaneado). Alerta visual, não fecha nada sozinho.
  const staleInfraMonths = React.useMemo(() => {
    const m = new Map<string, number>();
    if (kindFilter !== "infraestrutura") return m;
    const toIdx = (ym: string) => {
      const [y, mo] = ym.split("-").map(Number);
      return y * 12 + (mo - 1);
    };
    const monthsPresent = dedupedFiltered.map((v) => lastUpdatedAt(v)?.slice(0, 7)).filter((x): x is string => !!x);
    if (monthsPresent.length === 0) return m;
    const latestIdx = Math.max(...monthsPresent.map(toIdx));
    for (const v of dedupedFiltered) {
      if (v.status === "Mitigada" || v.status === "Fechada") continue;
      const own = lastUpdatedAt(v)?.slice(0, 7);
      if (!own) continue;
      const diff = latestIdx - toIdx(own);
      if (diff > 0) m.set(v.id, diff);
    }
    return m;
  }, [dedupedFiltered, kindFilter]);

  // Meses com dados disponíveis para o filtro "Por mês" (reage ao tipo Aplicação/Internas ativo).
  const monthOptionsForFilter = React.useMemo(() => {
    const isInfra = kindFilter === "infraestrutura";
    const set = new Set<string>();
    (vulns ?? []).forEach((v) => {
      if ((v.kind ?? "aplicacao") !== kindFilter) return;
      const date = isInfra ? infraCriadoDate(v) : v.identified_at;
      if (date) set.add(date.slice(0, 7));
    });
    return Array.from(set)
      .sort()
      .reverse()
      .map((m) => ({ value: m, label: monthLabel(m) }));
  }, [vulns, kindFilter]);

  // Publica as opções de mês no contexto global — o AppHeader é compartilhado entre
  // módulos e não conhece os dados de vulnerabilidades, então quem popula é este dashboard.
  React.useEffect(() => {
    setMonthOptions(monthOptionsForFilter);
    return () => setMonthOptions([]);
  }, [monthOptionsForFilter, setMonthOptions]);

  const total = dedupedFiltered.length;
  const open = dedupedFiltered.filter((v) => v.status === "Aberta").length;
  const emTratamento = dedupedFiltered.filter((v) => v.status === "Em tratamento").length;
  const mitigated = dedupedFiltered.filter((v) => v.status === "Mitigada" || v.status === "Fechada").length;
  const emRetest = dedupedFiltered.filter((v) => v.pending_approval === true).length;

  const prevMonthStats = React.useMemo(() => {
    const today = new Date();
    const prevFrom = new Date(today.getFullYear(), today.getMonth() - 1, 1);
    const prevTo = new Date(today.getFullYear(), today.getMonth(), 1);
    const inPrev = (iso: string | null) => {
      if (!iso) return false;
      const d = new Date(iso.slice(0, 10));
      return d >= prevFrom && d < prevTo;
    };
    const base = (vulns ?? []).filter(
      (v) => (v.kind ?? "aplicacao") === kindFilter && (sevFilter === "all" || v.severity === sevFilter),
    );
    const opened = base.filter((v) => inPrev(v.identified_at));
    const fixed = opened.filter((v) => v.status === "Mitigada" || v.status === "Fechada");
    const pct = opened.length > 0 ? Math.round((fixed.length / opened.length) * 100) : 0;
    return { opened: opened.length, fixed: fixed.length, stillOpen: opened.length - fixed.length, pct };
  }, [vulns, kindFilter, sevFilter]);

  const discoveryStats = React.useMemo(() => {
    const base = (vulns ?? []).filter(
      (v) => (v.kind ?? "aplicacao") === kindFilter && (sevFilter === "all" || v.severity === sevFilter),
    );
    const currentCount = filtered.filter((v) => v.identified_at).length;
    const periodDays = dateRange
      ? Math.max(1, Math.round((new Date(dateRange.to).getTime() - new Date(dateRange.from).getTime()) / 86400000))
      : 30;
    const prevEnd = dateRange ? new Date(dateRange.from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const prevStart = new Date(prevEnd.getTime() - periodDays * 86400000);
    const prevFromISO = prevStart.toISOString().slice(0, 10);
    const prevToISO = prevEnd.toISOString().slice(0, 10);
    const prevCount = base.filter((v) => {
      if (!v.identified_at) return false;
      const d = v.identified_at.slice(0, 10);
      return d >= prevFromISO && d <= prevToISO;
    }).length;
    const diff = currentCount - prevCount;
    const pct = prevCount > 0 ? Math.round(Math.abs(diff / prevCount) * 100) : null;
    return { current: currentCount, prev: prevCount, diff, pct, up: diff > 0 };
  }, [vulns, filtered, kindFilter, sevFilter, dateRange]);

  const openPctVsPrev = React.useMemo(() => {
    const base = (vulns ?? []).filter(
      (v) => (v.kind ?? "aplicacao") === kindFilter && (sevFilter === "all" || v.severity === sevFilter),
    );
    const periodDays = dateRange
      ? Math.max(1, Math.round((new Date(dateRange.to).getTime() - new Date(dateRange.from).getTime()) / 86400000))
      : 30;
    const prevEnd = dateRange ? new Date(dateRange.from) : new Date(new Date().getFullYear(), new Date().getMonth(), 1);
    const prevStart = new Date(prevEnd.getTime() - periodDays * 86400000);
    const prevFromISO = prevStart.toISOString().slice(0, 10);
    const prevToISO = prevEnd.toISOString().slice(0, 10);
    const prevOpen = base.filter((v) => {
      if (!v.identified_at) return false;
      const d = v.identified_at.slice(0, 10);
      return d >= prevFromISO && d <= prevToISO && v.status === "Aberta";
    }).length;
    const diff = open - prevOpen;
    const pct = prevOpen > 0 ? Math.round(Math.abs(diff / prevOpen) * 100) : null;
    return { prev: prevOpen, diff, pct, up: diff > 0 };
  }, [vulns, open, kindFilter, sevFilter, dateRange]);

  // Para os KPI cards: estável, ignora o filtro de KPI — assim os cards não "tremem"
  // ao serem clicados (eles são a origem do filtro, não o resultado dele). Infra usa o
  // retrato mensal (foto congelada por import), não reconstrução a partir do estado atual.
  const byMonthCards = React.useMemo(
    () =>
      kindFilter === "infraestrutura" ? infraSnapshotToByMonth(infraMonthlySnapshot ?? []) : computeByMonth(filtered),
    [filtered, kindFilter, infraMonthlySnapshot],
  );
  // Mês mais recente da série — o card "Descobertas" mostra as descobertas desse mês.
  const lastDiscoveryMonth = byMonthCards.length ? byMonthCards[byMonthCards.length - 1].m : null;

  const applyKpiFilter = React.useCallback(
    (list: Vuln[]) => {
      if (kpiFilter === "all") return list;
      if (kpiFilter === "open") return list.filter((v) => v.status === "Aberta");
      if (kpiFilter === "treatment") return list.filter((v) => v.status === "Em tratamento");
      if (kpiFilter === "mitigated") return list.filter((v) => v.status === "Mitigada" || v.status === "Fechada");
      if (kpiFilter === "retest") return list.filter((v) => v.pending_approval === true);
      // Descobertas: vulnerabilidades identificadas no mês mais recente da série (bate com o número do card).
      if (kpiFilter === "discovered")
        return list.filter((v) => v.identified_at && v.identified_at.slice(0, 7) === lastDiscoveryMonth);
      return list;
    },
    [kpiFilter, lastDiscoveryMonth],
  );
  // filtered (cru) com kpiFilter aplicado — alimenta só o gráfico "Evolução Mensal", que
  // precisa de todos os snapshots mensais de infra pra contar Descobertas/Fechadas por mês.
  const filteredByKpi = React.useMemo(() => applyKpiFilter(filtered), [applyKpiFilter, filtered]);
  // dedupedFiltered com kpiFilter aplicado — alimenta os gráficos de composição e a tabela,
  // que devem mostrar 1 linha por instância de vulnerabilidade, não 1 por snapshot mensal.
  const dedupedFilteredByKpi = React.useMemo(() => applyKpiFilter(dedupedFiltered), [applyKpiFilter, dedupedFiltered]);

  const bySev = React.useMemo(
    () =>
      SEVS.map((s) => ({
        name: s,
        value: dedupedFilteredByKpi.filter((v) => v.severity === s).length,
        fill: SEV_CHART[s],
      })),
    [dedupedFilteredByKpi],
  );
  const byStatus = React.useMemo(
    () =>
      STATUSES.map((s) => ({
        name: s,
        value: dedupedFilteredByKpi.filter((v) => v.status === s).length,
        fill: STAT_CHART[s],
      })),
    [dedupedFilteredByKpi],
  );
  const byResp = React.useMemo(() => {
    const m = new Map<string, number>();
    dedupedFilteredByKpi.forEach((v) => {
      // Inclui vulns com dept via fqdnDeptMap mesmo que department_id seja null no banco
      const appDeptId = v.fqdn ? fqdnDeptMap.get(v.fqdn.toLowerCase()) : undefined;
      if (!appDeptId && !v.department_id) return;
      const k = respOf(v);
      if (!k || k === "—") return;
      m.set(k, (m.get(k) ?? 0) + 1);
    });
    return Array.from(m.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([name, value]) => ({ name, value }))
      .slice(0, 10);
  }, [dedupedFilteredByKpi, respOf]);
  // Para os gráficos: reage ao card selecionado (kpiFilter). Infra com kpiFilter="all" usa o
  // retrato mensal (bate com o Sek); qualquer card específico (Abertas, Em Tratamento etc.)
  // exige recortar por status atual, que o retrato mensal não guarda — nesse caso volta pra
  // reconstrução a partir do estado atual (computeByMonth), como já funcionava antes. Ou seja:
  // "Todos" é a foto histórica fiel; um card específico é sempre um recorte de hoje.
  const byMonth = React.useMemo(() => {
    if (kindFilter === "infraestrutura") {
      return kpiFilter === "all"
        ? infraSnapshotToByMonth(infraMonthlySnapshot ?? [])
        : computeByMonth(dedupedFilteredByKpi);
    }
    return computeByMonth(filteredByKpi);
  }, [filteredByKpi, dedupedFilteredByKpi, kindFilter, kpiFilter, infraMonthlySnapshot]);

  // dueDate: data final do plano de ação, gravada apenas quando o status vira "Em tratamento".
  const updateStatus = async (id: string, status: Vuln["status"], dueDate?: string | null) => {
    const today = new Date().toISOString().slice(0, 10);
    const patch: Record<string, unknown> = { status, status_changed_at: today };
    if (status === "Em tratamento") patch.treatment_due_date = dueDate ?? null;
    const { error } = await (supabase as any).from(tableForId(id)).update(patch).eq("id", id);
    if (error) {
      toast.error(`Falha: ${error.message}`);
      return;
    }
    toast.success("Status atualizado");
    qc.setQueriesData({ queryKey: ["vulns-summary"], exact: false }, (old: Vuln[] | undefined) =>
      old?.map((v) =>
        v.id === id
          ? { ...v, status, ...(status === "Em tratamento" ? { treatment_due_date: dueDate ?? null } : {}) }
          : v,
      ),
    );
    const vuln = qc
      .getQueriesData<Vuln[]>({ queryKey: ["vulns-summary"], exact: false })
      .flatMap(([, d]) => d ?? [])
      .find((v) => v.id === id);
    await logVuln({
      vuln_id: id,
      fqdn: vuln?.fqdn ?? null,
      tipo_evento: "mudanca_status",
      descricao: `Status alterado para "${status}"`,
      status: "success",
      detalhes: {
        status_novo: status,
        severity: vuln?.severity,
        department: vuln?.responsible,
        ...(status === "Em tratamento" ? { prazo_plano_acao: dueDate ?? null } : {}),
      },
    });
  };
  const requestStatusChange = async (id: string, pendingStatus: "Mitigada" | "Fechada", description: string | null) => {
    const payload = {
      pending_approval: true,
      pending_status: pendingStatus,
      pending_by: user?.email ?? null,
      pending_at: new Date().toISOString(),
      mitigation_description: description,
    } as never;
    const { error } = await (supabase as any).from(tableForId(id)).update(payload).eq("id", id);
    if (error) {
      toast.error(`Falha: ${error.message}`);
      return;
    }
    toast.success(`Solicitação enviada (${pendingStatus})`);
    const vulnReq = qc
      .getQueriesData<Vuln[]>({ queryKey: ["vulns-summary"], exact: false })
      .flatMap(([, d]) => d ?? [])
      .find((v) => v.id === id);
    await logVuln({
      vuln_id: id,
      fqdn: vulnReq?.fqdn ?? null,
      tipo_evento: "solicitacao_aprovacao",
      descricao: `Solicitação de "${pendingStatus}" enviada`,
      status: "info",
      detalhes: { pending_status: pendingStatus, solicitado_por: user?.email, description },
    });
    qc.setQueriesData({ queryKey: ["vulns-summary"], exact: false }, (old: Vuln[] | undefined) =>
      old?.map((v) =>
        v.id === id
          ? {
              ...v,
              pending_approval: true,
              pending_status: pendingStatus,
              pending_by: user?.email ?? null,
              pending_at: new Date().toISOString(),
              mitigation_description: description,
            }
          : v,
      ),
    );
  };
  const approvePending = async (v: Vuln) => {
    if (!v.pending_status) return;
    const today = new Date().toISOString().slice(0, 10);
    const { error } = await (supabase as any)
      .from(tableForKind(v.kind))
      .update({
        status: v.pending_status as Vuln["status"],
        status_changed_at: today,
        pending_approval: false,
        pending_status: null,
        pending_by: null,
        pending_at: null,
      })
      .eq("id", v.id);
    if (error) {
      toast.error(`Falha: ${error.message}`);
      return;
    }
    toast.success(`Aprovado: ${v.pending_status}`);
    await logVuln({
      vuln_id: v.id,
      fqdn: v.fqdn,
      tipo_evento: "aprovacao",
      descricao: `Aprovação de "${v.pending_status}"`,
      status: "success",
      detalhes: { status_aprovado: v.pending_status, fqdn: v.fqdn, severity: v.severity, solicitado_por: v.pending_by },
    });
    qc.setQueriesData({ queryKey: ["vulns-summary"], exact: false }, (old: Vuln[] | undefined) =>
      old?.map((item) =>
        item.id === v.id
          ? {
              ...item,
              status: v.pending_status as Vuln["status"],
              pending_approval: false,
              pending_status: null,
              pending_by: null,
              pending_at: null,
            }
          : item,
      ),
    );
  };
  const rejectPending = async (v: Vuln) => {
    const { error } = await (supabase as any)
      .from(tableForKind(v.kind))
      .update({
        pending_approval: false,
        pending_status: null,
        pending_by: null,
        pending_at: null,
        mitigation_description: null,
      })
      .eq("id", v.id);
    if (error) {
      toast.error(`Falha: ${error.message}`);
      return;
    }
    toast.success("Solicitação rejeitada");
    await logVuln({
      vuln_id: v.id,
      fqdn: v.fqdn,
      tipo_evento: "rejeicao",
      descricao: `Solicitação de "${v.pending_status}" rejeitada`,
      status: "error",
      detalhes: { pending_status: v.pending_status, fqdn: v.fqdn, severity: v.severity, solicitado_por: v.pending_by },
    });
    qc.setQueriesData({ queryKey: ["vulns-summary"], exact: false }, (old: Vuln[] | undefined) =>
      old?.map((item) =>
        item.id === v.id
          ? {
              ...item,
              pending_approval: false,
              pending_status: null,
              pending_by: null,
              pending_at: null,
              mitigation_description: null,
            }
          : item,
      ),
    );
  };
  const updateResponsible = async (id: string, departmentId: string | null) => {
    // Busca o nome do responsável do módulo de Aplicações (pelo FQDN da vuln)
    const vuln = qc
      .getQueriesData<Vuln[]>({ queryKey: ["vulns-summary"], exact: false })
      .flatMap(([, d]) => d ?? [])
      .find((v) => v.id === id);
    const fqdn = vuln?.fqdn?.toLowerCase() ?? "";
    const appMatch = (appsData ?? []).find((a) => a.name.toLowerCase() === fqdn);
    // Se há match no módulo de Aplicações, usa o nome do departamento da aplicação
    // Senão, cai no departamento manual (depts)
    const responsible = appMatch
      ? (depts?.find((d) => d.id === appMatch.department_id)?.name ?? appMatch.department_id)
      : departmentId
        ? (depts?.find((d) => d.id === departmentId)?.name ?? null)
        : null;
    const effectiveDeptId = appMatch ? appMatch.department_id : departmentId;
    const previous = qc.getQueriesData<Vuln[]>({ queryKey: ["vulns-summary"], exact: false });
    qc.setQueriesData({ queryKey: ["vulns-summary"], exact: false }, (old: Vuln[] | undefined) =>
      old?.map((v) => (v.id === id ? { ...v, department_id: effectiveDeptId, responsible } : v)),
    );
    const { error } = await (supabase as any)
      .from(tableForId(id))
      .update({ department_id: effectiveDeptId, responsible })
      .eq("id", id);
    if (error) {
      previous.forEach(([key, data]) => qc.setQueryData(key, data));
      toast.error(`Falha: ${error.message}`);
      return;
    }
    toast.success("Responsável atualizado");
    const vulnResp = qc
      .getQueriesData<Vuln[]>({ queryKey: ["vulns-summary"], exact: false })
      .flatMap(([, d]) => d ?? [])
      .find((v) => v.id === id);
    await logVuln({
      vuln_id: id,
      fqdn: vulnResp?.fqdn ?? null,
      tipo_evento: "mudanca_departamento",
      descricao: `Responsável → "${responsible ?? "Nenhum"}"`,
      status: "success",
      detalhes: { department_id: effectiveDeptId, responsible, fqdn: vulnResp?.fqdn, severity: vulnResp?.severity },
    });
  };

  // Exclusão definitiva — gated no chamador por canManageVulns (admin + depto Segurança
  // da Informação); aqui só executa, sem checagem extra de permissão.
  const deleteVuln = async (v: Vuln) => {
    const { error } = await (supabase as any).from(tableForKind(v.kind)).delete().eq("id", v.id);
    if (error) {
      toast.error(`Falha ao excluir: ${error.message}`);
      return;
    }
    toast.success("Vulnerabilidade excluída");
    qc.setQueriesData({ queryKey: ["vulns-summary"], exact: false }, (old: Vuln[] | undefined) =>
      old?.filter((item) => item.id !== v.id),
    );
    await logVuln({
      vuln_id: v.id,
      fqdn: v.fqdn,
      tipo_evento: "exclusao",
      descricao: `Vulnerabilidade excluída (${v.vuln_type ?? v.fqdn})`,
      status: "success",
      detalhes: { fqdn: v.fqdn, severity: v.severity, vuln_type: v.vuln_type },
    });
  };

  // Edição de todos os campos (não só status/departamento) — gated no chamador por
  // canManageVulns, igual deleteVuln.
  const editVuln = async (
    id: string,
    kind: "aplicacao" | "infraestrutura",
    patch: {
      fqdn: string;
      severity: Vuln["severity"];
      status: Vuln["status"];
      department_id: string | null;
      responsible: string | null;
      source: string | null;
      vuln_type: string | null;
      system_app: string | null;
      identified_at: string | null;
      raw: Record<string, string> | null;
    },
  ) => {
    const { error } = await (supabase as any).from(tableForKind(kind)).update(patch).eq("id", id);
    if (error) {
      toast.error(`Falha ao editar: ${error.message}`);
      return false;
    }
    toast.success("Vulnerabilidade atualizada");
    qc.invalidateQueries({ queryKey: ["vulns-summary"], exact: false });
    await logVuln({
      vuln_id: id,
      fqdn: patch.fqdn,
      tipo_evento: "edicao",
      descricao: `Vulnerabilidade editada (${patch.vuln_type ?? patch.fqdn})`,
      status: "success",
      detalhes: { fqdn: patch.fqdn, severity: patch.severity, vuln_type: patch.vuln_type },
    });
    return true;
  };

  // ── Exportação (respeita RBAC: não-admin só o próprio departamento) ─────────
  const handleExport = (format: "csv" | "xls" | "xlsx", deptId: string | null) => {
    // Não-admin é sempre forçado ao departamento do próprio perfil
    const forcedDeptId = !isVulnAdmin && myProfile?.department_id ? myProfile.department_id : null;
    const activeDeptId = forcedDeptId ?? deptId; // admin: null = todos

    const rowsForKind = (kind: "aplicacao" | "infraestrutura") =>
      (vulns ?? [])
        .filter((v) => (v.kind ?? "aplicacao") === kind)
        .filter((v) => {
          if (!activeDeptId) return true;
          const appDeptId = v.fqdn ? fqdnDeptMap.get(v.fqdn.toLowerCase()) : undefined;
          const effectiveDeptId = appDeptId ?? v.department_id;
          return effectiveDeptId === activeDeptId;
        });

    const toRow = (v: Vuln): Record<string, unknown> => {
      const base: Record<string, unknown> = {
        "FQDN / Host": v.fqdn,
        Severidade: v.severity,
        Status: v.status,
        Responsável: resolveResponsible(v.fqdn, v.department_id),
        Origem: v.source ?? "",
        Tipo: v.vuln_type ?? "",
        Sistema: v.system_app ?? "",
        "Identificada em": v.identified_at ? v.identified_at.slice(0, 10) : "",
        "Fechada em": closedAt(v) ?? "",
        "AGE (dias)": ageDays(v) ?? "",
        SLA: slaStatus(v).label,
      };
      // Dados originais da importação (raw) — só valores simples e sem colidir com as colunas-base
      const raw = (v.raw ?? {}) as Record<string, unknown>;
      for (const [k, val] of Object.entries(raw)) {
        if (val === null || val === undefined || val === "") continue;
        if (typeof val !== "string" && typeof val !== "number" && typeof val !== "boolean") continue;
        if (k in base) continue;
        base[k] = val;
      }
      return base;
    };

    const apl = rowsForKind("aplicacao").map(toRow);
    const inf = rowsForKind("infraestrutura").map(toRow);
    if (apl.length === 0 && inf.length === 0) {
      toast.error("Nenhuma vulnerabilidade para exportar.");
      return;
    }

    const fname = `vulnerabilidades_${new Date().toISOString().slice(0, 10)}`;

    if (format === "csv") {
      // CSV não tem abas → junta tudo com uma coluna "Tabela"
      const rows = [
        ...apl.map((r) => ({ Tabela: "Externas/FQDN", ...r })),
        ...inf.map((r) => ({ Tabela: "Internas", ...r })),
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
      if (apl.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(apl), "Externas-FQDN");
      if (inf.length) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(inf), "Internas");
      XLSX.writeFile(wb, `${fname}.${format}`, { bookType: format === "xls" ? "biff8" : "xlsx" });
    }
    toast.success("Exportação concluída");
  };

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) return <ModuleLoading />;

  // ── Access denied ──────────────────────────────────────────────────────────
  if (!isVulnAdmin && can("vulnerabilidades", "view") && !myProfile?.department_id)
    return (
      <div className="vr">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="vr-restricted">
          <div className="vr-restricted-icon">
            <Lock size={22} color={T.danger} />
          </div>
          <div
            style={{ fontFamily: V.font, fontSize: 15, fontWeight: 700, color: V.fg }}
          >
            Acesso restrito
          </div>
          <div style={{ fontSize: 13, color: V.fg3, maxWidth: 440, lineHeight: 1.6 }}>
            Seu usuário não possui departamento vinculado. Solicite ao administrador a associação a um departamento para
            visualizar vulnerabilidades.
          </div>
        </div>
      </div>
    );

  const pendingItems = (vulns ?? []).filter((v) => v.pending_approval === true);

  // ── KPIs (mesmos números de antes, agora no formato da faixa da interface v2) ──
  const lastMonthCard = byMonthCards[byMonthCards.length - 1];
  const prevMonthCard = byMonthCards[byMonthCards.length - 2];
  const kpiDelta = (last: number, prev: number, prevMonth: string | undefined) => {
    if (!prevMonth) return null;
    const diff = last - prev;
    const pct = prev > 0 ? Math.round(Math.abs(diff / prev) * 100) : null;
    return (
      <>
        {pct !== null && diff !== 0 && (
          <span className={`vr-delta ${diff > 0 ? "bad" : "good"}`}>
            {diff > 0 ? "▲" : "▼"} {pct}%
          </span>
        )}
        <span>
          {prev.toLocaleString("pt-BR")} em {monthLabel(prevMonth)}
        </span>
      </>
    );
  };
  const kpiItems: Array<{ key: typeof kpiFilter; label: string; value: number; title: string; foot?: React.ReactNode }> =
    [
      { key: "all", label: "Total", value: total, title: "Ver todas as vulnerabilidades" },
      {
        key: "open",
        label: "Abertas",
        value: open,
        title: "Filtrar por abertas",
        foot: kpiDelta(lastMonthCard?.abertas ?? 0, prevMonthCard?.abertas ?? 0, prevMonthCard?.m),
      },
      { key: "treatment", label: "Em tratamento", value: emTratamento, title: "Filtrar por em tratamento" },
      { key: "mitigated", label: "Mitigadas / fechadas", value: mitigated, title: "Filtrar por mitigadas e fechadas" },
      { key: "retest", label: "Em reteste", value: emRetest, title: "Filtrar por aguardando aprovação de reteste" },
      {
        key: "discovered",
        label: "Descobertas no mês",
        value: lastMonthCard?.descobertas ?? 0,
        title: "Filtrar pelas descobertas do mês mais recente",
        foot: kpiDelta(lastMonthCard?.descobertas ?? 0, prevMonthCard?.descobertas ?? 0, prevMonthCard?.m),
      },
    ];

  return (
    <div className="vr vr-stack">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Cabeçalho da página ─────────────────────────────────────── */}
      <div className="vr-ph">
        <div>
          <h1 className="vr-ph-title">Gestão de Vulnerabilidades</h1>
          <p className="vr-ph-sub">
            Monitoramento e tratamento · {kindFilter === "aplicacao" ? "Externas / FQDN" : "Internas"}
          </p>
        </div>
        <SyncActions moduleSlug="vulnerabilidades" jobs={["vuln-snapshot"]}>
        <div className="vr-ph-actions">
          {activeTab === "dashboard" && (
            <div className="vr-seg" role="group" aria-label="Tipo de vulnerabilidade">
              {(["aplicacao", "infraestrutura"] as const).map((k) => (
                <button key={k} type="button" aria-pressed={kindFilter === k} onClick={() => setKindFilter(k)}>
                  {k === "aplicacao" ? "Externas / FQDN" : "Internas"}
                </button>
              ))}
            </div>
          )}
          {isVulnAdmin && (
            <div className="vr-seg" role="group" aria-label="Visão">
              <button type="button" aria-pressed={activeTab === "dashboard"} onClick={() => setActiveTab("dashboard")}>
                <LayoutDashboard size={14} /> Dashboard
              </button>
              <button type="button" aria-pressed={activeTab === "operacoes"} onClick={() => setActiveTab("operacoes")}>
                <Settings2 size={14} /> Operações
                {pendingItems.length > 0 && <span className="vr-pending-badge">{pendingItems.length}</span>}
              </button>
            </div>
          )}
        </div>
        </SyncActions>
      </div>

      {/* ══ DASHBOARD TAB ════════════════════════════════════════════════ */}
      {activeTab === "dashboard" && (
        <div className="vr-stack vr-fadeup">
          {/* ── Faixa de KPIs (clique filtra gráficos e tabela) ─────────── */}
          <div className="vr-kpis">
            {kpiItems.map((k) => (
              <button
                key={k.key}
                type="button"
                className="vr-kpi"
                aria-pressed={kpiFilter === k.key}
                title={k.title}
                onClick={() => setKpiFilter(k.key === "all" || kpiFilter === k.key ? "all" : k.key)}
              >
                <span className="vr-kpi-label">{k.label}</span>
                <span className="vr-kpi-value">{k.value.toLocaleString("pt-BR")}</span>
                {k.foot && <span className="vr-kpi-foot">{k.foot}</span>}
              </button>
            ))}
          </div>

          {/* ── Filtros: severidade + filtro ativo do KPI ───────────────── */}
          <div className="vr-filters">
            <span className="vr-filters-label">Severidade</span>
            <div className="vr-seg" role="group" aria-label="Filtrar por severidade">
              <button type="button" aria-pressed={sevFilter === "all"} onClick={() => setSevFilter("all")}>
                Todas
              </button>
              {SEVS.map((sv) => (
                <button
                  key={sv}
                  type="button"
                  aria-pressed={sevFilter === sv}
                  onClick={() => setSevFilter(sv === sevFilter ? "all" : sv)}
                >
                  <span className="vr-sw" style={{ background: SEV_MAP[sv].color }} />
                  {sv}
                </button>
              ))}
            </div>
            {kpiFilter !== "all" && (
              <button type="button" className="vr-chip" onClick={() => setKpiFilter("all")}>
                {KPI_FILTER_LABEL[kpiFilter]}
                <X size={14} aria-label="Remover filtro" />
              </button>
            )}
            {(kpiFilter !== "all" || sevFilter !== "all") && (
              <button
                type="button"
                className="vr-btn ghost sm"
                onClick={() => {
                  setKpiFilter("all");
                  setSevFilter("all");
                }}
              >
                Limpar filtros
              </button>
            )}
          </div>

          {/* ── Charts grid ──────────────────────────────────────────── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5" style={{ gridAutoFlow: "row dense" }}>
            {/* ── Severidade: arcos radiais ── */}
            <div className="lg:col-span-1 vr-block" style={{ minHeight: 260 }}>
              <div className="vr-block-hdr">
                <div className="vr-block-title">
                  <span>Severidade</span>
                </div>
              </div>
              <div
                className="vr-block-body"
                style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
              >
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20, width: "100%" }}>
                  {bySev.map((s) => {
                    const maxVal = Math.max(...bySev.map((x) => x.value), 1);
                    const pct = s.value / maxVal;
                    const r = 44;
                    const circ = Math.PI * r;
                    const offset = circ * (1 - pct);
                    const isActive = sevFilter === s.name;
                    const isDimmed = sevFilter !== "all" && !isActive;
                    return (
                      <div
                        key={s.name}
                        onClick={() => setSevFilter(s.name === sevFilter ? "all" : s.name)}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: 6,
                          cursor: "pointer",
                          opacity: isDimmed ? 0.25 : 1,
                          transition: "opacity 0.2s",
                          padding: "8px 4px",
                        }}
                      >
                        <svg width="108" height="62" viewBox="0 0 108 62" fill="none">
                          <path
                            className="vr-arc-track"
                            d="M10,56 A44,44 0 0,1 98,56"
                            stroke={T.border}
                            strokeWidth={isActive ? 9 : 7}
                            strokeLinecap="round"
                          />
                          <path
                            d="M10,56 A44,44 0 0,1 98,56"
                            stroke={s.fill}
                            strokeWidth={isActive ? 9 : 7}
                            strokeLinecap="round"
                            strokeDasharray={circ}
                            strokeDashoffset={offset}
                            style={{ filter: isActive ? `drop-shadow(0 0 6px color-mix(in srgb, ${s.fill} 60%, transparent))` : "none" }}
                          />
                        </svg>
                        <span
                          style={{
                            fontSize: 22,
                            fontWeight: 700,
                            fontFamily: "'Space Grotesk',sans-serif",
                            color: s.fill,
                            lineHeight: 1,
                            marginTop: -6,
                          }}
                        >
                          {s.value}
                        </span>
                        <span
                          style={{
                            fontSize: 11,
                            color: V.fg,
                            fontFamily: "'IBM Plex Mono',monospace",
                            letterSpacing: "0.04em",
                          }}
                        >
                          {s.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* ── Por Status: barras horizontais ── */}
            <div className="lg:col-span-1 vr-block" style={{ minHeight: 260 }}>
              <div className="vr-block-hdr">
                <div className="vr-block-title">
                  <span>Por status</span>
                </div>
              </div>
              <div
                className="vr-block-body"
                style={{ display: "flex", flexDirection: "column", justifyContent: "center", gap: 18 }}
              >
                {(() => {
                  const maxVal = Math.max(...byStatus.map((s) => s.value), 1);
                  return byStatus.map((s) => {
                    const barPct = Math.max(8, (s.value / maxVal) * 100);
                    const pct = total > 0 ? Math.round((s.value / total) * 100) : 0;
                    const sm = STATUS_MAP[s.name] ?? STATUS_MAP["Aberta"];
                    return (
                      <div key={s.name} style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                          <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                            <span
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 2,
                                background: s.fill,
                                flexShrink: 0,
                                display: "inline-block",
                              }}
                            />
                            <span
                              style={{
                                fontSize: 12,
                                color: V.fg,
                                fontFamily: "'DM Sans',sans-serif",
                                fontWeight: 500,
                              }}
                            >
                              {s.name}
                            </span>
                          </div>
                          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                            <span
                              style={{
                                fontSize: 10,
                                fontFamily: "'IBM Plex Mono',monospace",
                                color: sm.color,
                                background: sm.bg,
                                border: `1px solid ${sm.border}`,
                                borderRadius: 4,
                                padding: "1px 6px",
                                fontWeight: 700,
                              }}
                            >
                              {pct}%
                            </span>
                            <span
                              style={{
                                fontSize: 14,
                                fontWeight: 700,
                                fontFamily: "'Space Grotesk',sans-serif",
                                color: V.fg,
                                minWidth: 28,
                                textAlign: "right",
                              }}
                            >
                              {s.value}
                            </span>
                          </div>
                        </div>
                        <div
                          style={{
                            height: 8,
                            background: V.surface2,
                            borderRadius: 4,
                            overflow: "hidden",
                            border: `1px solid ${V.line}`,
                          }}
                        >
                          <div
                            style={{
                              width: `${barPct}%`,
                              height: "100%",
                              borderRadius: 4,
                              background: `linear-gradient(90deg,color-mix(in srgb, ${s.fill} 53%, transparent),${s.fill})`,
                              transition: "width 0.5s ease",
                            }}
                          />
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            </div>

            {/* ── Top responsáveis: barras horizontais (interface v2) ── */}
            <div className="lg:col-span-1 vr-block" style={{ minHeight: 260 }}>
              <div className="vr-block-hdr">
                <div className="vr-block-title">
                  <span>Top responsáveis</span>
                </div>
              </div>
              <div className="vr-block-body">
                {byResp.length === 0 ? (
                  <div className="vr-empty">Nenhum responsável no filtro atual.</div>
                ) : (
                  <div className="vr-hbars">
                    {byResp.map((r) => {
                      const maxResp = byResp[0]?.value || 1;
                      return (
                        <div key={r.name} className="vr-hbar" title={`${r.name}: ${r.value}`}>
                          <div className="vr-hbar-top">
                            <span>{r.name}</span>
                            <span>{r.value}</span>
                          </div>
                          <div className="vr-track">
                            <div className="vr-fill" style={{ width: `${(r.value / maxResp) * 100}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <Block title="Evolução mensal" chartHeight={300} defaultSize="col-span-3">
              <LineChart data={byMonth} margin={{ top: 16, right: 20, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="2 4" stroke={T.chartGrid} vertical={false} />
                <XAxis dataKey="m" {...axisProps} />
                <YAxis {...axisProps} axisLine={false} />
                <Tooltip content={<ExecTooltip />} cursor={{ stroke: T.borderHi, strokeWidth: 1 }} />
                <Legend
                  wrapperStyle={{ fontSize: 11, fontFamily: "'IBM Plex Mono',monospace", color: V.fg2 }}
                />
                {[
                  { key: "descobertas", name: "Descobertas", color: T.warning },
                  { key: "mitigadas", name: "Mitigadas", color: T.accent },
                  { key: "corrigidas", name: "Fechadas", color: T.success },
                  { key: "abertas", name: "Acumulado", color: T.danger, dashed: true },
                ].map(({ key, name, color, dashed }) => (
                  <Line
                    key={key}
                    type="monotone"
                    dataKey={key}
                    name={name}
                    stroke={color}
                    strokeWidth={2}
                    strokeDasharray={dashed ? "4 4" : undefined}
                    dot={{ r: 3, fill: color, stroke: T.surface, strokeWidth: 2 }}
                    activeDot={{ r: 5, fill: color, stroke: T.surface, strokeWidth: 2 }}
                  >
                    <LabelList
                      dataKey={key}
                      position={key === "corrigidas" ? "bottom" : "top"}
                      fill={T.textPrimary}
                      fontSize={10}
                      fontFamily="'IBM Plex Mono',monospace"
                    />
                  </Line>
                ))}
              </LineChart>
            </Block>
          </div>

          {/* ── Tabela de detalhe ─────────────────────────────────────── */}
          <div className="vr-panel">
            <DetailTable
              kind={kindFilter}
              rows={dedupedFilteredByKpi.filter((v) => (v.kind ?? "aplicacao") === kindFilter)}
              staleInfraMonths={staleInfraMonths}
              depts={depts ?? []}
              fqdnDeptMap={fqdnDeptMap}
              resolveResponsible={resolveResponsible}
              onUpdateStatus={updateStatus}
              onRequestStatusChange={requestStatusChange}
              onUpdateResp={updateResponsible}
              canEdit={isVulnAdmin || can("vulnerabilidades", "edit")}
              canEditResp={isVulnAdmin}
              canCreate={isVulnAdmin || can("vulnerabilidades", "create")}
              isAdmin={isVulnAdmin}
              exportDepts={appDepts}
              onExport={handleExport}
              canManage={canManageVulns}
              onDeleteVuln={deleteVuln}
              onEditVuln={editVuln}
            />
          </div>
        </div>
      )}

      {/* ══ OPERAÇÕES TAB ════════════════════════════════════════════════ */}
      {activeTab === "operacoes" && isVulnAdmin && (
        <div className="vr-stack vr-fadeup">
          <OperacoesPanel
            kind="aplicacao"
            rows={pendingItems.filter((v) => (v.kind ?? "aplicacao") === "aplicacao")}
            isAdmin={isVulnAdmin}
            onApprove={approvePending}
            onReject={rejectPending}
            deptName={deptName}
            resolveResponsible={resolveResponsible}
          />
          <OperacoesPanel
            kind="infraestrutura"
            rows={pendingItems.filter((v) => v.kind === "infraestrutura")}
            isAdmin={isVulnAdmin}
            onApprove={approvePending}
            onReject={rejectPending}
            deptName={deptName}
            resolveResponsible={resolveResponsible}
          />
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// EXPORT CONTROL — botão de exportação (CSV / XLS / XLSX)
// ══════════════════════════════════════════════════════════════════════════════
const EXPORT_FORMATS: Array<{ key: "csv" | "xls" | "xlsx"; label: string }> = [
  { key: "csv", label: "CSV (.csv)" },
  { key: "xls", label: "Excel 97-2003 (.xls)" },
  { key: "xlsx", label: "Excel (.xlsx)" },
];

function FormatButtons({ onPick }: { onPick: (f: "csv" | "xls" | "xlsx") => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      {EXPORT_FORMATS.map((f) => (
        <button
          key={f.key}
          className="vr-btn ghost"
          style={{ justifyContent: "flex-start", width: "100%" }}
          onClick={() => onPick(f.key)}
        >
          <Download size={12} /> {f.label}
        </button>
      ))}
    </div>
  );
}

function ExportControl({
  isAdmin,
  depts,
  onExport,
}: {
  isAdmin: boolean;
  depts: Array<{ id: string; name: string }>;
  onExport: (format: "csv" | "xls" | "xlsx", deptId: string | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [deptId, setDeptId] = React.useState<string>("all");

  // Não-admin: exporta direto o próprio escopo (departamento forçado no handler), só escolhe o formato
  if (!isAdmin) {
    return (
      <Popover>
        <PopoverTrigger asChild>
          <button className="vr-btn ghost">
            <Download size={13} /> Exportar
          </button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-2">
          <FormatButtons onPick={(f) => onExport(f, null)} />
        </PopoverContent>
      </Popover>
    );
  }

  // Admin: pop-up para escolher escopo (todos ou um departamento) + formato
  const selectStyle = {
    background: V.surface2,
    borderColor: V.line,
    color: V.fg,
    fontFamily: "'IBM Plex Mono',monospace",
    fontSize: 12,
  };
  const sortedDepts = [...depts].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <button className="vr-btn ghost" onClick={() => setOpen(true)}>
        <Download size={13} /> Exportar
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          style={{ background: V.surface, border: `1px solid ${V.lineStrong}`, borderRadius: 12, maxWidth: 440 }}
        >
          <DialogHeader>
            <DialogTitle
              style={{ fontFamily: V.font, fontSize: 15, fontWeight: 700, color: V.fg }}
            >
              Exportar vulnerabilidades
            </DialogTitle>
            <DialogDescription style={{ fontSize: 12, color: V.fg3 }}>
              Escolha o escopo e o formato. As Externas/FQDN e Internas saem em abas separadas no Excel.
            </DialogDescription>
          </DialogHeader>
          <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "4px 0" }}>
            <span
              style={{
                fontSize: 12.5,
                fontWeight: 500,
                color: V.fg3,
                fontFamily: "'IBM Plex Mono',monospace",
              }}
            >
              Departamento
            </span>
            <Select value={deptId} onValueChange={setDeptId}>
              <SelectTrigger style={{ ...selectStyle, height: 36 }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os departamentos</SelectItem>
                {sortedDepts.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <DialogFooter style={{ gap: 8 }}>
            {EXPORT_FORMATS.map((f) => (
              <button
                key={f.key}
                className="vr-btn primary"
                onClick={() => {
                  onExport(f.key, deptId === "all" ? null : deptId);
                  setOpen(false);
                }}
              >
                <Download size={12} /> {f.label}
              </button>
            ))}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// DETAIL TABLE — logic UNCHANGED
// ══════════════════════════════════════════════════════════════════════════════
type SortKey = "fqdn" | "severity" | "status" | "responsible" | "age" | "sla" | "source" | "identified_at";

function DetailTable({
  kind,
  rows,
  staleInfraMonths,
  depts,
  fqdnDeptMap,
  resolveResponsible,
  onUpdateStatus,
  onRequestStatusChange,
  onUpdateResp,
  canEdit,
  canEditResp,
  canCreate,
  isAdmin,
  exportDepts,
  onExport,
  canManage,
  onDeleteVuln,
  onEditVuln,
}: {
  kind: "aplicacao" | "infraestrutura";
  rows: Vuln[];
  staleInfraMonths?: Map<string, number>;
  depts: Array<{ id: string; name: string }>;
  fqdnDeptMap: Map<string, string>;
  resolveResponsible: (fqdn: string | null, deptId: string | null) => string;
  onUpdateStatus: (id: string, s: Vuln["status"], dueDate?: string | null) => Promise<void> | void;
  onRequestStatusChange: (id: string, s: "Mitigada" | "Fechada", description: string | null) => Promise<void> | void;
  onUpdateResp: (id: string, deptId: string | null) => void;
  canEdit: boolean;
  canEditResp: boolean;
  canCreate: boolean;
  isAdmin: boolean;
  exportDepts: Array<{ id: string; name: string }>;
  onExport: (format: "csv" | "xls" | "xlsx", deptId: string | null) => void;
  // Editar/Excluir nos detalhes — restrito a admins do depto Segurança da Informação.
  canManage?: boolean;
  onDeleteVuln?: (v: Vuln) => Promise<void> | void;
  onEditVuln?: (
    id: string,
    kind: "aplicacao" | "infraestrutura",
    patch: {
      fqdn: string;
      severity: Vuln["severity"];
      status: Vuln["status"];
      department_id: string | null;
      responsible: string | null;
      source: string | null;
      vuln_type: string | null;
      system_app: string | null;
      identified_at: string | null;
      raw: Record<string, string> | null;
    },
  ) => Promise<boolean>;
}) {
  const [pendingChange, setPendingChange] = React.useState<{ vuln: Vuln; newStatus: "Mitigada" | "Fechada" } | null>(
    null,
  );
  const [mitigationDesc, setMitigationDesc] = React.useState("");
  // Popup de "Em tratamento": captura a data final do plano de ação.
  const [treatmentChange, setTreatmentChange] = React.useState<{ vuln: Vuln } | null>(null);
  const [treatmentDate, setTreatmentDate] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [page, setPage] = React.useState(0);
  const [selectedVuln, setSelectedVuln] = React.useState<Vuln | null>(null);
  const [editingVuln, setEditingVuln] = React.useState<Vuln | null>(null);
  const [pendingDelete, setPendingDelete] = React.useState<Vuln | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [sort, setSort] = React.useState<{ key: SortKey; dir: "asc" | "desc" }>({ key: "identified_at", dir: "desc" });

  React.useEffect(() => {
    setPage(0);
  }, [query]);

  const respText = React.useCallback((v: Vuln) => resolveResponsible(v.fqdn, v.department_id), [resolveResponsible]);

  const sevWeight = { Crítica: 4, Alta: 3, Média: 2, Baixa: 1 };
  const statusWeight = { Aberta: 4, "Em tratamento": 3, Mitigada: 2, Fechada: 1 };

  const processed = React.useMemo(() => {
    let list = rows;
    if (query.trim()) {
      // Host + Resumo (mesmas chaves do raw que o VulnDetailsSheet mostra),
      // sem acento/caixa: "injecao sql" acha "Injeção SQL".
      const norm = (s: string | null | undefined) =>
        (s ?? "")
          .normalize("NFD")
          .replace(/[̀-ͯ]/g, "")
          .toLowerCase();
      const q = norm(query).trim();
      list = list.filter((v) => {
        const resumo = pickRaw((v.raw ?? {}) as Record<string, unknown>, [
          "Resumo",
          "Título",
          "Titulo",
          "Title",
          "Nome",
          "Name",
          "Summary",
          "Vulnerability",
        ]);
        return norm(v.fqdn).includes(q) || norm(resumo).includes(q);
      });
    }
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...list].sort((a, b) => {
      switch (sort.key) {
        case "fqdn":
          return a.fqdn.localeCompare(b.fqdn) * dir;
        case "severity":
          return (
            ((sevWeight[a.severity as keyof typeof sevWeight] ?? 0) -
              (sevWeight[b.severity as keyof typeof sevWeight] ?? 0)) *
            dir
          );
        case "status":
          return (
            ((statusWeight[a.status as keyof typeof statusWeight] ?? 0) -
              (statusWeight[b.status as keyof typeof statusWeight] ?? 0)) *
            dir
          );
        case "responsible":
          return respText(a).localeCompare(respText(b)) * dir;
        case "age":
          return ((ageDays(a) ?? -1) - (ageDays(b) ?? -1)) * dir;
        case "sla": {
          const ea = a.identified_at
            ? daysBetween(new Date(a.identified_at), new Date()) - (SLA_DAYS[a.severity] ?? 30)
            : Number.NEGATIVE_INFINITY;
          const eb = b.identified_at
            ? daysBetween(new Date(b.identified_at), new Date()) - (SLA_DAYS[b.severity] ?? 30)
            : Number.NEGATIVE_INFINITY;
          return (ea - eb) * dir;
        }
        case "source":
          return (a.source ?? "").localeCompare(b.source ?? "") * dir;
        case "identified_at":
          return (a.identified_at ?? "").localeCompare(b.identified_at ?? "") * dir;
        default:
          return 0;
      }
    });
  }, [rows, query, sort, respText]);

  const paginated = React.useMemo(() => {
    const start = page * PAGE_SIZE;
    return processed.slice(start, start + PAGE_SIZE);
  }, [processed, page]);

  const toggleSort = (key: SortKey) =>
    setSort((prev) => (prev.key === key ? { key, dir: prev.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

  function SIcon({ k }: { k: SortKey }) {
    if (sort.key !== k) return <ArrowUpDown size={12} style={{ display: "inline", marginLeft: 4, opacity: 0.4 }} />;
    return sort.dir === "asc" ? (
      <ArrowUp size={12} style={{ display: "inline", marginLeft: 4, color: V.accent }} />
    ) : (
      <ArrowDown size={12} style={{ display: "inline", marginLeft: 4, color: V.accent }} />
    );
  }

  const selectStyle = {
    background: V.surface,
    borderColor: V.line,
    color: V.fg,
    fontFamily: V.font,
    fontSize: 12.5,
  };

  return (
    <>
      <div className="vr-panel-hdr">
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div className="vr-panel-title">
            {kind === "aplicacao" ? "Externas / FQDN" : "Internas"}
            <span style={{ fontWeight: 400, fontSize: 13, color: V.fg3 }}>
              {processed.length.toLocaleString("pt-BR")} {processed.length === 1 ? "registro" : "registros"}
            </span>
          </div>
          <div className="vr-search-wrap">
            <Search size={14} className="vr-search-icon" />
            <input
              className="vr-search"
              placeholder="Buscar host ou resumo…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <ExportControl isAdmin={isAdmin} depts={exportDepts} onExport={onExport} />
          {canCreate && <CreateVulnDialog kind={kind} depts={depts} fqdnDeptMap={fqdnDeptMap} />}
        </div>
      </div>

      <div style={{ overflowX: "auto", maxHeight: 520, overflowY: "auto" }}>
        <table className="vr-table">
          <thead>
            <tr>
              {(
                [
                  ["fqdn", "FQDN / Host"],
                  ["severity", "Severidade"],
                  ["status", "Status"],
                  ["responsible", "Responsável"],
                  ["age", "Idade"],
                  ["sla", "Prazo (SLA)"],
                  ["source", "Origem"],
                  ["identified_at", "Data"],
                ] as Array<[SortKey, string]>
              ).map(([k, label]) => (
                <th key={k} onClick={() => toggleSort(k)} style={{ paddingLeft: k === "fqdn" ? 18 : undefined }}>
                  {label}
                  <SIcon k={k} />
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginated.map((v) => {
              const age = ageDays(v);
              const staleMonths = staleInfraMonths?.get(v.id);
              return (
                <tr key={v.id} style={{ cursor: "pointer" }} onClick={() => setSelectedVuln(v)}>
                  <td className="mono" style={{ paddingLeft: 18, color: V.fg, fontWeight: 500 }}>
                    {v.fqdn}
                    {staleMonths && (
                      <div style={{ marginTop: 3 }}>
                        <span
                          className="vr-badge"
                          title="Não aparece no import mais recente e nunca teve Fix registrado — pode ser falha de scan ou o achado ter parado de ser reportado."
                          style={{
                            background: T.warningBg,
                            color: T.warning,
                            border: "1px solid rgba(245,158,11,0.22)",
                            fontWeight: 400,
                          }}
                        >
                          ⚠ não confirmado há {staleMonths} {staleMonths === 1 ? "mês" : "meses"}
                        </span>
                      </div>
                    )}
                    {v.reopened_at && (
                      <div style={{ marginTop: 3 }}>
                        <span
                          className="vr-badge"
                          title="Esteve fechado por ausência no import (sem Fix explícito) e voltou a aparecer depois."
                          style={{
                            background: T.accentSoft,
                            color: T.accent,
                            border: "1px solid rgba(59,130,246,0.22)",
                            fontWeight: 400,
                          }}
                        >
                          ↺ reaberto em {v.reopened_at.slice(0, 10)}
                        </span>
                      </div>
                    )}
                  </td>
                  <td>
                    <SevBadge sev={v.severity} />
                  </td>
                  <td onClick={(e) => e.stopPropagation()}>
                    <Select
                      value={v.status}
                      disabled={!canEdit || v.pending_approval === true}
                      onValueChange={(val) => {
                        if (val === v.status) return;
                        if (val === "Mitigada" || val === "Fechada") {
                          setMitigationDesc("");
                          setPendingChange({ vuln: v, newStatus: val as "Mitigada" | "Fechada" });
                        } else if (val === "Em tratamento") {
                          setTreatmentDate(v.treatment_due_date?.slice(0, 10) ?? "");
                          setTreatmentChange({ vuln: v });
                        } else onUpdateStatus(v.id, val as Vuln["status"]);
                      }}
                    >
                      <SelectTrigger style={{ ...selectStyle, height: 30, width: 148 }}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {STATUSES.map((s) => (
                          <SelectItem key={s} value={s}>
                            {s}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {v.pending_approval === true && (
                      <div style={{ marginTop: 4 }}>
                        <span
                          className="vr-badge"
                          style={{
                            background: T.warningBg,
                            color: T.warning,
                            border: "1px solid rgba(245,158,11,0.22)",
                          }}
                        >
                          ⏳ {v.pending_status}
                        </span>
                      </div>
                    )}
                  </td>
                  <td>
                    {(() => {
                      // Dept vem do módulo de Aplicações pelo FQDN — somente leitura
                      const fqdnKey = v.fqdn?.toLowerCase() ?? "";
                      const appDeptId = fqdnKey ? fqdnDeptMap.get(fqdnKey) : undefined;
                      const deptLabel = appDeptId
                        ? (depts.find((d) => d.id === appDeptId)?.name ?? appDeptId)
                        : "Sem departamento";
                      // Se tem match em Aplicações, exibe só o nome (sem Select)
                      if (appDeptId) {
                        return (
                          <span
                            style={{
                              ...selectStyle,
                              fontSize: 12,
                              padding: "4px 8px",
                              borderRadius: 6,
                              border: `1px solid ${V.line}`,
                              display: "inline-block",
                              opacity: 0.8,
                            }}
                          >
                            {deptLabel}
                          </span>
                        );
                      }
                      // Sem match: exibe debug info
                      return (
                        <span style={{ fontSize: 12.5, color: V.fg3 }}>
                          {deptLabel}
                        </span>
                      );
                    })()}
                  </td>
                  <td className="mono dim">{age == null ? "—" : `${age}d`}</td>
                  <td>
                    <SlaCell v={v} />
                  </td>
                  <td className="dim" style={{ fontSize: 12.5 }}>
                    {v.source ?? "—"}
                  </td>
                  <td className="mono dim" onClick={(e) => e.stopPropagation()}>
                    {v.identified_at ? v.identified_at.slice(0, 10) : <AddDateCell vulnId={v.id} kind={v.kind} />}
                  </td>
                </tr>
              );
            })}
            {processed.length === 0 && (
              <tr>
                <td colSpan={8}>
                  <div className="vr-empty">Nenhum registro no período.</div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {processed.length > PAGE_SIZE && (
        <div className="vr-pager">
          <div className="vr-pager-info">
            Mostrando {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, processed.length)} de {processed.length}
          </div>
          <div className="vr-pager-btns">
            <button className="vr-pager-btn" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>
              Anterior
            </button>
            <button
              className="vr-pager-btn"
              disabled={(page + 1) * PAGE_SIZE >= processed.length}
              onClick={() => setPage((p) => p + 1)}
            >
              Próxima
            </button>
          </div>
        </div>
      )}

      <Dialog open={!!pendingChange} onOpenChange={(o) => !o && !submitting && setPendingChange(null)}>
        <DialogContent style={{ background: V.surface, border: `1px solid ${V.lineStrong}`, borderRadius: 12 }}>
          <DialogHeader>
            <DialogTitle
              style={{ fontFamily: V.font, fontSize: 15, fontWeight: 700, color: V.fg }}
            >
              Solicitar mudança para "{pendingChange?.newStatus}"
            </DialogTitle>
            <DialogDescription style={{ fontSize: 12, color: V.fg3 }}>
              {pendingChange?.newStatus === "Mitigada"
                ? "Descreva como esta vulnerabilidade foi mitigada. A solicitação aguardará aprovação do administrador."
                : "Explique de forma resumida como esta vulnerabilidade foi solucionada. A solicitação aguardará aprovação do administrador."}
            </DialogDescription>
          </DialogHeader>
          {pendingChange && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "8px 0" }}>
              <div style={{ fontSize: 11, color: V.fg3, fontFamily: "'IBM Plex Mono',monospace" }}>
                Host / FQDN
              </div>
              <div
                style={{
                  fontFamily: "'IBM Plex Mono',monospace",
                  fontSize: 12,
                  color: V.fg,
                  background: V.surface2,
                  border: `1px solid ${V.line}`,
                  borderRadius: 6,
                  padding: "7px 10px",
                }}
              >
                {pendingChange.vuln.fqdn}
              </div>
              <>
                <div
                  style={{
                    fontSize: 12.5,
                    fontWeight: 500,
                    color: V.fg3,
                    fontFamily: "'IBM Plex Mono',monospace",
                    marginTop: 8,
                  }}
                >
                  {pendingChange.newStatus === "Mitigada"
                    ? "Descrição da mitigação *"
                    : "Como foi solucionado (resumo) *"}
                </div>
                <Textarea
                  rows={5}
                  value={mitigationDesc}
                  onChange={(e) => setMitigationDesc(e.target.value)}
                  placeholder={
                    pendingChange.newStatus === "Mitigada"
                      ? "Ex.: Aplicado patch X, regra de WAF Y bloqueando o vetor…"
                      : "Ex.: Vulnerabilidade corrigida via atualização do componente X, validado em retest…"
                  }
                  style={{
                    background: V.surface2,
                    borderColor: V.line,
                    color: V.fg,
                    fontFamily: V.font,
                    fontSize: 13,
                    borderRadius: 6,
                  }}
                />
              </>
            </div>
          )}
          <DialogFooter style={{ gap: 8 }}>
            <button className="vr-btn ghost" onClick={() => setPendingChange(null)} disabled={submitting}>
              Cancelar
            </button>
            <button
              className="vr-btn primary"
              disabled={submitting || mitigationDesc.trim().length < 5}
              onClick={async () => {
                if (!pendingChange) return;
                setSubmitting(true);
                await onRequestStatusChange(pendingChange.vuln.id, pendingChange.newStatus, mitigationDesc.trim());
                setSubmitting(false);
                setPendingChange(null);
                setMitigationDesc("");
              }}
            >
              {submitting ? "Enviando…" : "Enviar para aprovação"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Popup: data final do plano de ação ao mover para "Em tratamento" */}
      <Dialog open={!!treatmentChange} onOpenChange={(o) => !o && !submitting && setTreatmentChange(null)}>
        <DialogContent style={{ background: V.surface, border: `1px solid ${V.lineStrong}`, borderRadius: 12 }}>
          <DialogHeader>
            <DialogTitle
              style={{ fontFamily: V.font, fontSize: 15, fontWeight: 700, color: V.fg }}
            >
              Mover para "Em tratamento"
            </DialogTitle>
            <DialogDescription style={{ fontSize: 12, color: V.fg3 }}>
              Informe a <strong>data final do plano de ação</strong> — o prazo previsto para concluir o tratamento desta
              vulnerabilidade.
            </DialogDescription>
          </DialogHeader>
          {treatmentChange && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10, padding: "8px 0" }}>
              <div style={{ fontSize: 11, color: V.fg3, fontFamily: "'IBM Plex Mono',monospace" }}>
                Host / FQDN
              </div>
              <div
                style={{
                  fontFamily: "'IBM Plex Mono',monospace",
                  fontSize: 12,
                  color: V.fg,
                  background: V.surface2,
                  border: `1px solid ${V.line}`,
                  borderRadius: 6,
                  padding: "7px 10px",
                }}
              >
                {treatmentChange.vuln.fqdn}
              </div>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: V.fg3,
                  fontFamily: "'IBM Plex Mono',monospace",
                  marginTop: 8,
                }}
              >
                Data final do plano de ação *
              </div>
              <input
                type="date"
                value={treatmentDate}
                onChange={(e) => setTreatmentDate(e.target.value)}
                style={{
                  background: V.surface2,
                  border: `1px solid ${V.line}`,
                  color: V.fg,
                  fontFamily: "'IBM Plex Mono',monospace",
                  fontSize: 13,
                  borderRadius: 6,
                  padding: "8px 10px",
                  colorScheme: "dark",
                }}
              />
            </div>
          )}
          <DialogFooter style={{ gap: 8 }}>
            <button className="vr-btn ghost" onClick={() => setTreatmentChange(null)} disabled={submitting}>
              Cancelar
            </button>
            <button
              className="vr-btn primary"
              disabled={submitting || !treatmentDate}
              onClick={async () => {
                if (!treatmentChange || !treatmentDate) return;
                setSubmitting(true);
                await onUpdateStatus(treatmentChange.vuln.id, "Em tratamento", treatmentDate);
                setSubmitting(false);
                setTreatmentChange(null);
                setTreatmentDate("");
              }}
            >
              {submitting ? "Salvando…" : "Confirmar"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <VulnDetailsSheet
        open={!!selectedVuln}
        onOpenChange={(o) => !o && setSelectedVuln(null)}
        vuln={selectedVuln}
        responsavel={selectedVuln ? respText(selectedVuln) : undefined}
        canManage={canManage}
        onEdit={(v) => {
          setSelectedVuln(null);
          setEditingVuln(v);
        }}
        onDelete={(v) => {
          setSelectedVuln(null);
          setPendingDelete(v);
        }}
      />

      <Dialog open={!!pendingDelete} onOpenChange={(o) => !o && !deleting && setPendingDelete(null)}>
        <DialogContent style={{ background: V.surface, border: `1px solid ${V.lineStrong}`, borderRadius: 12 }}>
          <DialogHeader>
            <DialogTitle
              style={{ fontFamily: V.font, fontSize: 15, fontWeight: 700, color: T.danger }}
            >
              Excluir vulnerabilidade?
            </DialogTitle>
            <DialogDescription style={{ fontSize: 12, color: V.fg3 }}>
              Essa ação é definitiva e não pode ser desfeita.
              {pendingDelete && (
                <div
                  style={{
                    marginTop: 10,
                    fontFamily: "'IBM Plex Mono',monospace",
                    fontSize: 12,
                    color: V.fg,
                    background: V.surface2,
                    border: `1px solid ${V.line}`,
                    borderRadius: 6,
                    padding: "7px 10px",
                  }}
                >
                  {pendingDelete.fqdn} — {pendingDelete.vuln_type ?? "sem tipo"}
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter style={{ gap: 8 }}>
            <button className="vr-btn ghost" onClick={() => setPendingDelete(null)} disabled={deleting}>
              Cancelar
            </button>
            <button
              className="vr-btn danger"
              disabled={deleting}
              onClick={async () => {
                if (!pendingDelete || !onDeleteVuln) return;
                setDeleting(true);
                await onDeleteVuln(pendingDelete);
                setDeleting(false);
                setPendingDelete(null);
              }}
            >
              {deleting ? "Excluindo…" : "Excluir definitivamente"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {editingVuln && onEditVuln && (
        <EditVulnDialog
          vuln={editingVuln}
          depts={depts}
          fqdnDeptMap={fqdnDeptMap}
          onClose={() => setEditingVuln(null)}
          onSave={onEditVuln}
        />
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// OPERAÇÕES PANEL — logic UNCHANGED
// ══════════════════════════════════════════════════════════════════════════════
function OperacoesPanel({
  kind,
  rows,
  isAdmin,
  onApprove,
  onReject,
  deptName,
  resolveResponsible,
}: {
  kind: "aplicacao" | "infraestrutura";
  rows: Vuln[];
  isAdmin: boolean;
  onApprove: (v: Vuln) => Promise<void> | void;
  onReject: (v: Vuln) => Promise<void> | void;
  deptName: (id: string | null) => string;
  resolveResponsible?: (fqdn: string | null, deptId: string | null) => string;
}) {
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [viewMitigation, setViewMitigation] = React.useState<Vuln | null>(null);
  const [selectedVuln, setSelectedVuln] = React.useState<Vuln | null>(null);
  const [query, setQuery] = React.useState("");

  const respOf = React.useCallback(
    (v: Vuln) =>
      resolveResponsible
        ? resolveResponsible(v.fqdn, v.department_id)
        : (v.responsible ?? "").trim() || (v.department_id ? deptName(v.department_id) : "—"),
    [resolveResponsible, deptName],
  );

  // Busca sem acento/caixa: "critica" acha "Crítica", "joao" acha "João".
  const norm = (s: string | null | undefined) =>
    (s ?? "")
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();

  const hasFilter = !!query.trim();

  // Uma busca só em FQDN + responsável + severidade. Cada palavra digitada tem
  // que aparecer em algum dos três ("critica joao" = crítica E do João).
  const visibleRows = React.useMemo(() => {
    const terms = norm(query).split(/\s+/).filter(Boolean);
    if (!terms.length) return rows;
    return rows.filter((v) => {
      const hay = `${norm(v.fqdn)} ${norm(respOf(v))} ${norm(v.severity)}`;
      return terms.every((t) => hay.includes(t));
    });
  }, [rows, query, respOf]);

  return (
    <div className="vr-panel">
      <div className="vr-panel-hdr">
        <div style={{ display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
          <div className="vr-panel-title">
            <ClipboardCheck size={11} color={T.accent} />
            Aprovações pendentes — {kind === "aplicacao" ? "Aplicação" : "Internas"}
            <span style={{ fontWeight: 400, color: V.fg3 }}>
              ({hasFilter ? `${visibleRows.length} de ${rows.length}` : rows.length})
            </span>
          </div>
          <div className="vr-search-wrap">
            <Search size={14} className="vr-search-icon" />
            <input
              className="vr-search"
              style={{ minWidth: 260 }}
              placeholder={`Buscar ${kind === "aplicacao" ? "FQDN" : "host"}, responsável ou severidade…`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          {hasFilter && (
            <button
              className="vr-btn ghost"
              style={{ padding: "4px 10px", fontSize: 11 }}
              onClick={() => setQuery("")}
            >
              <X size={11} /> Limpar
            </button>
          )}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="vr-ops-empty">
          <div className="vr-ops-icon">
            <CheckCircle2 size={20} color={T.success} />
          </div>
          <div>Nenhuma solicitação pendente.</div>
        </div>
      ) : visibleRows.length === 0 ? (
        <div className="vr-ops-empty">
          <div className="vr-ops-icon">
            <Search size={20} color={T.textMuted} />
          </div>
          <div>Nenhuma solicitação pendente corresponde aos filtros.</div>
        </div>
      ) : (
        <div style={{ overflowX: "auto" }}>
          <table className="vr-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 18 }}>Host / FQDN</th>
                <th>Severidade</th>
                <th>Status atual</th>
                <th>Solicitado</th>
                <th>Responsável</th>
                <th>Solicitante</th>
                <th>Em</th>
                <th>Descrição</th>
                <th style={{ textAlign: "right", paddingRight: 18 }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((v) => (
                <tr key={v.id} style={{ cursor: "pointer" }} onClick={() => setSelectedVuln(v)}>
                  <td className="mono" style={{ paddingLeft: 18, fontWeight: 500 }}>
                    {v.fqdn}
                  </td>
                  <td>
                    <SevBadge sev={v.severity} />
                  </td>
                  <td>
                    <StatusBadge status={v.status} />
                  </td>
                  <td>
                    <span
                      className="vr-badge"
                      style={{
                        background: v.pending_status === "Mitigada" ? T.accentSoft : T.successBg,
                        color: v.pending_status === "Mitigada" ? T.accent : T.success,
                        border: `1px solid ${v.pending_status === "Mitigada" ? "rgba(59,130,246,0.25)" : "rgba(16,185,129,0.25)"}`,
                      }}
                    >
                      {v.pending_status}
                    </span>
                  </td>
                  <td className="dim" style={{ fontSize: 11 }}>
                    {respOf(v)}
                  </td>
                  <td className="dim" style={{ fontSize: 11 }}>
                    {v.pending_by ?? "—"}
                  </td>
                  <td className="mono dim">{v.pending_at ? new Date(v.pending_at).toLocaleString("pt-BR") : "—"}</td>
                  <td>
                    {v.mitigation_description ? (
                      <button
                        className="vr-btn ghost"
                        style={{ padding: "4px 10px", fontSize: 11 }}
                        onClick={(e) => {
                          e.stopPropagation();
                          setViewMitigation(v);
                        }}
                      >
                        Ver
                      </button>
                    ) : (
                      <span className="dim" style={{ fontSize: 11 }}>
                        —
                      </span>
                    )}
                  </td>
                  <td style={{ textAlign: "right", paddingRight: 18 }}>
                    <div style={{ display: "flex", gap: 8, justifyContent: "flex-end" }}>
                      <button
                        className="vr-btn danger"
                        style={{ padding: "5px 12px" }}
                        disabled={!isAdmin || busyId === v.id}
                        onClick={async (e) => {
                          e.stopPropagation();
                          setBusyId(v.id);
                          await onReject(v);
                          setBusyId(null);
                        }}
                      >
                        <XCircle size={12} /> Rejeitar
                      </button>
                      <button
                        className="vr-btn success"
                        style={{ padding: "5px 12px" }}
                        disabled={!isAdmin || busyId === v.id}
                        onClick={async (e) => {
                          e.stopPropagation();
                          setBusyId(v.id);
                          await onApprove(v);
                          setBusyId(null);
                        }}
                      >
                        <CheckCircle2 size={12} /> Aprovar
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!isAdmin && (
            <div style={{ fontSize: 11, color: V.fg3, padding: "10px 16px" }}>
              Somente administradores do módulo podem aprovar ou rejeitar.
            </div>
          )}
        </div>
      )}

      <Dialog open={!!viewMitigation} onOpenChange={(o) => !o && setViewMitigation(null)}>
        <DialogContent style={{ background: V.surface, border: `1px solid ${V.lineStrong}`, borderRadius: 12 }}>
          <DialogHeader>
            <DialogTitle
              style={{ fontFamily: V.font, fontSize: 15, fontWeight: 700, color: V.fg }}
            >
              {viewMitigation?.pending_status === "Fechada" ? "Descrição da solução" : "Descrição da mitigação"}
            </DialogTitle>
            <DialogDescription style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: V.fg3 }}>
              {viewMitigation?.fqdn}
            </DialogDescription>
          </DialogHeader>
          <div
            style={{
              whiteSpace: "pre-wrap",
              fontSize: 13,
              background: V.surface2,
              border: `1px solid ${V.line}`,
              borderRadius: 8,
              padding: "12px 14px",
              color: V.fg2,
              lineHeight: 1.6,
            }}
          >
            {viewMitigation?.mitigation_description}
          </div>
          <DialogFooter>
            <button className="vr-btn ghost" onClick={() => setViewMitigation(null)}>
              Fechar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <VulnDetailsSheet
        open={!!selectedVuln}
        onOpenChange={(o) => !o && setSelectedVuln(null)}
        vuln={selectedVuln}
        responsavel={
          selectedVuln
            ? resolveResponsible
              ? resolveResponsible(selectedVuln.fqdn, selectedVuln.department_id)
              : (selectedVuln.responsible ?? "").trim() ||
                (selectedVuln.department_id ? deptName(selectedVuln.department_id) : "—")
            : undefined
        }
      />
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CREATE VULN DIALOG — logic UNCHANGED
// ══════════════════════════════════════════════════════════════════════════════
function CreateVulnDialog({
  kind,
  depts,
  fqdnDeptMap,
}: {
  kind: "aplicacao" | "infraestrutura";
  depts: Array<{ id: string; name: string }>;
  fqdnDeptMap: Map<string, string>;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    fqdn: "",
    severity: "Média" as Vuln["severity"],
    status: "Aberta" as Vuln["status"],
    department_id: "",
    source: "",
    vuln_type: "",
    system_app: "",
    identified_at: new Date().toISOString().slice(0, 10),
    resumo: "",
    cve: "",
    descricao: "",
    referencias: "",
  });

  const submit = async () => {
    if (!form.fqdn.trim()) {
      toast.error(`Informe o ${kind === "aplicacao" ? "FQDN" : "host/IP"}`);
      return;
    }
    setSaving(true);
    const responsible = form.department_id ? (depts.find((d) => d.id === form.department_id)?.name ?? null) : null;
    // Resumo/CVE/Descrição/Referências vão em `raw` com as mesmas chaves que
    // VulnDetailsSheet já lê (pickRaw) — assim um achado cadastrado manualmente exibe esses
    // campos corretamente ao abrir os detalhes depois, igual um achado importado.
    const raw: Record<string, string> = {};
    if (form.resumo.trim()) raw["Resumo"] = form.resumo.trim();
    if (form.cve.trim()) raw["CVE"] = form.cve.trim();
    if (form.descricao.trim()) raw["Descrição"] = form.descricao.trim();
    if (form.referencias.trim()) raw["Referências"] = form.referencias.trim();
    const { error } = await (supabase as any)
      .from(kind === "infraestrutura" ? "vulnerabilities_infra" : "vulnerabilities_aplicacao")
      .insert({
        fqdn: form.fqdn.trim(),
        severity: form.severity,
        status: form.status,
        department_id: form.department_id || null,
        responsible,
        source: form.source || null,
        vuln_type: form.vuln_type || null,
        system_app: form.system_app || null,
        identified_at: form.identified_at,
        kind,
        raw: Object.keys(raw).length > 0 ? raw : null,
      });
    setSaving(false);
    if (error) {
      toast.error(`Erro: ${error.message}`);
      return;
    }
    toast.success("Vulnerabilidade cadastrada");
    qc.invalidateQueries({ queryKey: ["vulns-summary"], exact: false });
    setOpen(false);
    setForm({
      ...form,
      fqdn: "",
      source: "",
      vuln_type: "",
      system_app: "",
      resumo: "",
      cve: "",
      descricao: "",
      referencias: "",
    });
  };

  const selectStyle = {
    background: V.surface2,
    borderColor: V.line,
    color: V.fg,
    fontFamily: V.font,
    fontSize: 13,
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="vr-btn success">
          <Plus size={13} /> Cadastrar
        </button>
      </DialogTrigger>
      <DialogContent
        style={{ background: V.surface, border: `1px solid ${V.lineStrong}`, borderRadius: 12, maxWidth: 480 }}
      >
        <DialogHeader>
          <DialogTitle
            style={{ fontFamily: V.font, fontSize: 15, fontWeight: 700, color: V.fg }}
          >
            Cadastrar — {kind === "aplicacao" ? "Aplicação" : "Internas"}
          </DialogTitle>
        </DialogHeader>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, paddingTop: 8 }}>
          <div style={{ gridColumn: "span 2" }}>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 500,
                color: V.fg3,
                fontFamily: "'IBM Plex Mono',monospace",
                marginBottom: 5,
              }}
            >
              {kind === "aplicacao" ? "FQDN / URL *" : "Host / IP *"}
            </div>
            <input
              className="vr-dlg-input"
              style={{ width: "100%" }}
              value={form.fqdn}
              onChange={(e) => {
                const fqdn = e.target.value;
                const appDeptId = fqdnDeptMap.get(fqdn.trim().toLowerCase());
                setForm({ ...form, fqdn, department_id: appDeptId ?? form.department_id });
              }}
            />
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 500,
                color: V.fg3,
                fontFamily: "'IBM Plex Mono',monospace",
                marginBottom: 5,
              }}
            >
              Título / Resumo
            </div>
            <input
              className="vr-dlg-input"
              style={{ width: "100%" }}
              value={form.resumo}
              placeholder="Título curto exibido nos detalhes (sem isso, usa o FQDN)"
              onChange={(e) => setForm({ ...form, resumo: e.target.value })}
            />
          </div>
          {(
            [
              { label: "Severidade", field: "severity", options: [...SEVS] },
              { label: "Status", field: "status", options: [...STATUSES] },
            ] as Array<{ label: string; field: "severity" | "status"; options: string[] }>
          ).map(({ label, field, options }) => (
            <div key={field}>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: V.fg3,
                  fontFamily: "'IBM Plex Mono',monospace",
                  marginBottom: 5,
                }}
              >
                {label}
              </div>
              <Select value={form[field]} onValueChange={(v) => setForm({ ...form, [field]: v })}>
                <SelectTrigger style={{ ...selectStyle, height: 36 }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
          <div style={{ gridColumn: "span 2" }}>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 500,
                color: V.fg3,
                fontFamily: "'IBM Plex Mono',monospace",
                marginBottom: 5,
              }}
            >
              Responsável (Departamento)
            </div>
            {(() => {
              const fqdnKey = form.fqdn.trim().toLowerCase();
              const appDeptId = fqdnKey ? fqdnDeptMap.get(fqdnKey) : undefined;
              const deptLabel = appDeptId ? (depts.find((d) => d.id === appDeptId)?.name ?? "—") : null;
              if (deptLabel) {
                // FQDN tem match em Aplicações — mostra nome fixo
                return (
                  <div
                    style={{
                      ...selectStyle,
                      height: 36,
                      display: "flex",
                      alignItems: "center",
                      padding: "0 12px",
                      borderRadius: 6,
                      border: `1px solid ${V.line}`,
                      opacity: 0.8,
                    }}
                  >
                    {deptLabel}
                    <span style={{ marginLeft: 8, fontSize: 10, color: V.fg3 }}>(via Aplicações)</span>
                  </div>
                );
              }
              // Sem match — mostra "Sem departamento" (não editável)
              return (
                <div
                  style={{
                    ...selectStyle,
                    height: 36,
                    display: "flex",
                    alignItems: "center",
                    padding: "0 12px",
                    borderRadius: 6,
                    border: `1px solid ${V.line}`,
                    color: V.fg3,
                  }}
                >
                  Sem departamento
                </div>
              );
            })()}
          </div>
          {(
            [
              { label: "Origem", field: "source", placeholder: "Nessus, Burp, etc.", type: "text" },
              { label: "Data", field: "identified_at", placeholder: "", type: "date" },
              { label: "Tipo", field: "vuln_type", placeholder: "XSS, RCE, etc.", type: "text" },
              { label: "Sistema", field: "system_app", placeholder: "", type: "text" },
              { label: "CVE", field: "cve", placeholder: "CVE-2024-…", type: "text" },
            ] as Array<{ label: string; field: keyof typeof form; placeholder: string; type: string }>
          ).map(({ label, field, placeholder, type }) => (
            <div key={field}>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 500,
                  color: V.fg3,
                  fontFamily: "'IBM Plex Mono',monospace",
                  marginBottom: 5,
                }}
              >
                {label}
              </div>
              <input
                type={type}
                className="vr-dlg-input"
                style={{ width: "100%" }}
                value={form[field] as string}
                placeholder={placeholder}
                onChange={(e) => setForm({ ...form, [field]: e.target.value })}
              />
            </div>
          ))}
          <div style={{ gridColumn: "span 2" }}>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 500,
                color: V.fg3,
                fontFamily: "'IBM Plex Mono',monospace",
                marginBottom: 5,
              }}
            >
              Descrição
            </div>
            <Textarea
              rows={4}
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              style={{
                background: V.surface2,
                borderColor: V.line,
                color: V.fg,
                fontFamily: V.font,
                fontSize: 13,
                borderRadius: 6,
              }}
            />
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <div
              style={{
                fontSize: 12.5,
                fontWeight: 500,
                color: V.fg3,
                fontFamily: "'IBM Plex Mono',monospace",
                marginBottom: 5,
              }}
            >
              Referências
            </div>
            <Textarea
              rows={2}
              value={form.referencias}
              placeholder="Links, plugin ID, etc."
              onChange={(e) => setForm({ ...form, referencias: e.target.value })}
              style={{
                background: V.surface2,
                borderColor: V.line,
                color: V.fg,
                fontFamily: V.font,
                fontSize: 13,
                borderRadius: 6,
              }}
            />
          </div>
        </div>
        <DialogFooter style={{ gap: 8, paddingTop: 8 }}>
          <button className="vr-btn ghost" onClick={() => setOpen(false)} disabled={saving}>
            Cancelar
          </button>
          <button className="vr-btn primary" onClick={submit} disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// EDIT VULN DIALOG — aberto a partir dos detalhes (canManage), edita todos os campos.
// Espelha o layout do CreateVulnDialog, mas pré-preenchido e fazendo UPDATE em vez de INSERT.
// ══════════════════════════════════════════════════════════════════════════════
function EditVulnDialog({
  vuln,
  depts,
  fqdnDeptMap,
  onClose,
  onSave,
}: {
  vuln: Vuln;
  depts: Array<{ id: string; name: string }>;
  fqdnDeptMap: Map<string, string>;
  onClose: () => void;
  onSave: (
    id: string,
    kind: "aplicacao" | "infraestrutura",
    patch: {
      fqdn: string;
      severity: Vuln["severity"];
      status: Vuln["status"];
      department_id: string | null;
      responsible: string | null;
      source: string | null;
      vuln_type: string | null;
      system_app: string | null;
      identified_at: string | null;
      raw: Record<string, string> | null;
    },
  ) => Promise<boolean>;
}) {
  const rawInitial = (vuln.raw ?? {}) as Record<string, unknown>;
  const [saving, setSaving] = React.useState(false);
  const [form, setForm] = React.useState({
    fqdn: vuln.fqdn,
    severity: vuln.severity,
    status: vuln.status,
    department_id: vuln.department_id ?? "",
    source: vuln.source ?? "",
    vuln_type: vuln.vuln_type ?? "",
    system_app: vuln.system_app ?? "",
    identified_at: vuln.identified_at ? vuln.identified_at.slice(0, 10) : "",
    resumo:
      pickRaw(rawInitial, ["Resumo", "Título", "Titulo", "Title", "Nome", "Name", "Summary", "Vulnerability"]) ?? "",
    cve: pickRaw(rawInitial, ["CVE", "Campo personalizado (CVE)", "CVE ID"]) ?? "",
    descricao: pickRaw(rawInitial, ["Descrição", "Descriação", "Descricao", "Description"]) ?? "",
    referencias:
      pickRaw(rawInitial, [
        "Campo personalizado (References)",
        "References",
        "Referências",
        "Referencias",
        "Plugin ID",
      ]) ?? "",
  });

  const submit = async () => {
    if (!form.fqdn.trim()) {
      toast.error(`Informe o ${(vuln.kind ?? "aplicacao") === "aplicacao" ? "FQDN" : "host/IP"}`);
      return;
    }
    setSaving(true);
    const responsible = form.department_id ? (depts.find((d) => d.id === form.department_id)?.name ?? null) : null;
    // Preserva os demais campos originais do raw (ex.: colunas vindas do import do scanner)
    // e só sobrescreve as 4 chaves editáveis aqui.
    const raw: Record<string, string> = {};
    for (const [k, v] of Object.entries(rawInitial)) {
      if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") raw[k] = String(v);
    }
    for (const [key, val] of [
      ["Resumo", form.resumo],
      ["CVE", form.cve],
      ["Descrição", form.descricao],
      ["Referências", form.referencias],
    ] as const) {
      if (val.trim()) raw[key] = val.trim();
      else delete raw[key];
    }
    const ok = await onSave(vuln.id, vuln.kind ?? "aplicacao", {
      fqdn: form.fqdn.trim(),
      severity: form.severity,
      status: form.status,
      department_id: form.department_id || null,
      responsible,
      source: form.source || null,
      vuln_type: form.vuln_type || null,
      system_app: form.system_app || null,
      identified_at: form.identified_at || null,
      raw: Object.keys(raw).length > 0 ? raw : null,
    });
    setSaving(false);
    if (ok) onClose();
  };

  const selectStyle = {
    background: V.surface2,
    borderColor: V.line,
    color: V.fg,
    fontFamily: V.font,
    fontSize: 13,
  };
  const labelStyle = {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.13em",
    textTransform: "uppercase" as const,
    color: V.fg3,
    fontFamily: "'IBM Plex Mono',monospace",
    marginBottom: 5,
  };
  const fqdnKey = form.fqdn.trim().toLowerCase();
  const appDeptId = fqdnKey ? fqdnDeptMap.get(fqdnKey) : undefined;
  const deptLabel = appDeptId
    ? (depts.find((d) => d.id === appDeptId)?.name ?? "—")
    : form.department_id
      ? (depts.find((d) => d.id === form.department_id)?.name ?? "—")
      : null;

  return (
    <Dialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <DialogContent
        style={{
          background: V.surface,
          border: `1px solid ${V.lineStrong}`,
          borderRadius: 12,
          maxWidth: 480,
          maxHeight: "85vh",
          overflowY: "auto",
        }}
      >
        <DialogHeader>
          <DialogTitle
            style={{ fontFamily: V.font, fontSize: 15, fontWeight: 700, color: V.fg }}
          >
            Editar — {(vuln.kind ?? "aplicacao") === "aplicacao" ? "Aplicação" : "Internas"}
          </DialogTitle>
        </DialogHeader>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, paddingTop: 8 }}>
          <div style={{ gridColumn: "span 2" }}>
            <div style={labelStyle}>{(vuln.kind ?? "aplicacao") === "aplicacao" ? "FQDN / URL *" : "Host / IP *"}</div>
            <input
              className="vr-dlg-input"
              style={{ width: "100%" }}
              value={form.fqdn}
              onChange={(e) => {
                const fqdn = e.target.value;
                const newAppDeptId = fqdnDeptMap.get(fqdn.trim().toLowerCase());
                setForm({ ...form, fqdn, department_id: newAppDeptId ?? form.department_id });
              }}
            />
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <div style={labelStyle}>Título / Resumo</div>
            <input
              className="vr-dlg-input"
              style={{ width: "100%" }}
              value={form.resumo}
              onChange={(e) => setForm({ ...form, resumo: e.target.value })}
            />
          </div>
          {(
            [
              { label: "Severidade", field: "severity", options: [...SEVS] },
              { label: "Status", field: "status", options: [...STATUSES] },
            ] as Array<{ label: string; field: "severity" | "status"; options: string[] }>
          ).map(({ label, field, options }) => (
            <div key={field}>
              <div style={labelStyle}>{label}</div>
              <Select value={form[field]} onValueChange={(v) => setForm({ ...form, [field]: v })}>
                <SelectTrigger style={{ ...selectStyle, height: 36 }}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {options.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
          <div style={{ gridColumn: "span 2" }}>
            <div style={labelStyle}>Responsável (Departamento)</div>
            {deptLabel ? (
              <div
                style={{
                  ...selectStyle,
                  height: 36,
                  display: "flex",
                  alignItems: "center",
                  padding: "0 12px",
                  borderRadius: 6,
                  border: `1px solid ${V.line}`,
                  opacity: 0.8,
                }}
              >
                {deptLabel}
                {appDeptId && <span style={{ marginLeft: 8, fontSize: 10, color: V.fg3 }}>(via Aplicações)</span>}
              </div>
            ) : (
              <div
                style={{
                  ...selectStyle,
                  height: 36,
                  display: "flex",
                  alignItems: "center",
                  padding: "0 12px",
                  borderRadius: 6,
                  border: `1px solid ${V.line}`,
                  color: V.fg3,
                }}
              >
                Sem departamento
              </div>
            )}
          </div>
          {(
            [
              { label: "Origem", field: "source", placeholder: "Nessus, Burp, etc.", type: "text" },
              { label: "Data", field: "identified_at", placeholder: "", type: "date" },
              { label: "Tipo", field: "vuln_type", placeholder: "XSS, RCE, etc.", type: "text" },
              { label: "Sistema", field: "system_app", placeholder: "", type: "text" },
              { label: "CVE", field: "cve", placeholder: "CVE-2024-…", type: "text" },
            ] as Array<{ label: string; field: keyof typeof form; placeholder: string; type: string }>
          ).map(({ label, field, placeholder, type }) => (
            <div key={field}>
              <div style={labelStyle}>{label}</div>
              <input
                type={type}
                className="vr-dlg-input"
                style={{ width: "100%" }}
                value={form[field] as string}
                placeholder={placeholder}
                onChange={(e) => setForm({ ...form, [field]: e.target.value })}
              />
            </div>
          ))}
          <div style={{ gridColumn: "span 2" }}>
            <div style={labelStyle}>Descrição</div>
            <Textarea
              rows={4}
              value={form.descricao}
              onChange={(e) => setForm({ ...form, descricao: e.target.value })}
              style={{
                background: V.surface2,
                borderColor: V.line,
                color: V.fg,
                fontFamily: V.font,
                fontSize: 13,
                borderRadius: 6,
              }}
            />
          </div>
          <div style={{ gridColumn: "span 2" }}>
            <div style={labelStyle}>Referências</div>
            <Textarea
              rows={2}
              value={form.referencias}
              placeholder="Links, plugin ID, etc."
              onChange={(e) => setForm({ ...form, referencias: e.target.value })}
              style={{
                background: V.surface2,
                borderColor: V.line,
                color: V.fg,
                fontFamily: V.font,
                fontSize: 13,
                borderRadius: 6,
              }}
            />
          </div>
        </div>
        <DialogFooter style={{ gap: 8, paddingTop: 8 }}>
          <button className="vr-btn ghost" onClick={onClose} disabled={saving}>
            Cancelar
          </button>
          <button className="vr-btn primary" onClick={submit} disabled={saving}>
            {saving ? "Salvando…" : "Salvar alterações"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// ADD DATE CELL — logic UNCHANGED
// ══════════════════════════════════════════════════════════════════════════════
function AddDateCell({ vulnId, kind }: { vulnId: string; kind: "aplicacao" | "infraestrutura" }) {
  const qc = useQueryClient();
  const [open, setOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const handleSelect = async (date: Date | undefined) => {
    if (!date) return;
    setSaving(true);
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const table = kind === "infraestrutura" ? "vulnerabilities_infra" : "vulnerabilities_aplicacao";
    const { error } = await (supabase as any).from(table).update({ identified_at: iso }).eq("id", vulnId);
    setSaving(false);
    if (error) {
      toast.error(`Falha: ${error.message}`);
      return;
    }
    toast.success("Data atualizada");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["vulns-summary"], exact: false });
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="vr-btn ghost" style={{ padding: "3px 8px", fontSize: 10 }} disabled={saving}>
          <CalendarPlus size={11} /> Adicionar
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" onSelect={handleSelect} initialFocus className={cn("p-3 pointer-events-auto")} />
      </PopoverContent>
    </Popover>
  );
}
