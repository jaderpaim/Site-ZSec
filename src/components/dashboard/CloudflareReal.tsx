import { SyncActions } from "@/components/layout/SyncActions";
import { ModuleLoading } from "@/components/layout/ModuleLoading";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  LineChart,
  Line,
} from "recharts";
import {
  getCloudflareAnalytics,
  listCloudflareZones,
  syncCloudflareZone,
} from "@/lib/cloudflare.functions";
import {
  Maximize2,
  Minimize2,
  RotateCcw,
  GripVertical,
  Save,
  Check,
  ChevronsUpDown,
  Globe,
  Shield,
  Zap,
  TrendingUp,
  AlertTriangle,
  Activity,
  Server,
  Link2,
  BarChart2,
  SkipForward,
  Clock,
  Filter,
  X,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OperationsTab } from "@/components/dashboard/cloudflare/OperationsTab";
import { SharedZoneContext } from "@/components/dashboard/cloudflare/shared-zone";
import { AnalyticsTab } from "@/components/dashboard/cloudflare/AnalyticsTab";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { DetailList, DetailSection, DetailSheet } from "@/components/layout/DetailSheet";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/use-permissions";

const STORAGE_KEY = "cloudflare_dashboard_layout_densegrid_final_v7";
const DAYS_STORAGE_KEY = "cloudflare_dashboard_days";

const DEFAULT_BLOCKS: DashboardBlock[] = [
  { id: "kpis", title: "Métricas Gerais (KPIs)", size: "col-span-1 md:col-span-2 lg:col-span-6" },
  { id: "proxy", title: "Proxy Cloudflare", size: "col-span-1 md:col-span-1 lg:col-span-2" },
  { id: "hosts", title: "Top 10 Hosts", size: "col-span-1 md:col-span-1 lg:col-span-2" },
  { id: "security", title: "Top 10 Security Actions", size: "col-span-1 md:col-span-1 lg:col-span-2" },
  { id: "countries", title: "Países de Origem", size: "col-span-1 md:col-span-2 lg:col-span-3" },
  { id: "urls", title: "URLs mais Requisitadas", size: "col-span-1 md:col-span-2 lg:col-span-3" },
  { id: "ips", title: "Top IPs de origem", size: "col-span-1 md:col-span-1 lg:col-span-2" },
  { id: "traffic", title: "Traffic Analyser — evolução", size: "col-span-1 md:col-span-1 lg:col-span-2" },
  { id: "attack", title: "Attack Analyser — evolução", size: "col-span-1 md:col-span-1 lg:col-span-2" },
  { id: "skip", title: "Requisições em Skip — evolução", size: "col-span-1 md:col-span-2 lg:col-span-3" },
  { id: "skip-hosts", title: "Top Hosts em Skip", size: "col-span-1 md:col-span-2 lg:col-span-3" },
  { id: "history", title: "Histórico Local", size: "col-span-1 md:col-span-2 lg:col-span-3" },
  { id: "logs", title: "Sample Logs (Firewall)", size: "col-span-1 md:col-span-2 lg:col-span-3" },
];

// Layout salvo no navegador (ordem e tamanho). Lido já no estado inicial — e não num
// efeito depois do primeiro render — para o layout salvo valer desde a abertura do módulo.
// Blocos novos (que não existiam quando o layout foi salvo) entram no fim.
function loadSavedBlocks(): DashboardBlock[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const saved = raw ? (JSON.parse(raw) as DashboardBlock[]) : null;
    if (!Array.isArray(saved) || saved.length === 0) return DEFAULT_BLOCKS;
    const known = new Map(DEFAULT_BLOCKS.map((b) => [b.id, b]));
    const kept = saved.filter((b) => b && known.has(b.id)).map((b) => ({ ...known.get(b.id)!, size: b.size }));
    const ids = new Set(kept.map((b) => b.id));
    return [...kept, ...DEFAULT_BLOCKS.filter((b) => !ids.has(b.id))];
  } catch {
    return DEFAULT_BLOCKS;
  }
}

interface DashboardBlock {
  id: string;
  title: string;
  size: string;
}

// ── Design Tokens — Executive Dark Intelligence ────────────────────────────────
const T = {
  bg: "var(--tl-0a0d14, #0A0D14)",
  surface: "var(--tl-0f1420, #0F1420)",
  surfaceAlt: "var(--tl-131825, #131825)",
  surfaceHover: "var(--tl-161c2e, #161C2E)",
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
  neutral: "var(--tl-6b7280, #6B7280)",

  textPrimary: "var(--tl-f1f5f9, #F1F5F9)",
  textSecondary: "var(--tl-f1f5f9, #F1F5F9)",
  textMuted: "var(--tl-f1f5f9, #F1F5F9)",

  chartGrid: "rgba(var(--tl-line-rgb, 30,38,64),0.7)",
  chartAxis: "var(--tl-f1f5f9, #F1F5F9)",
  chartTick: "var(--tl-f1f5f9, #F1F5F9)",
};

// Tokens da interface v2 (moldura). Os gráficos continuam no T acima.
const V = {
  surface: "var(--v2-surface)",
  surface2: "var(--v2-surface-2)",
  line: "var(--v2-line)",
  lineStrong: "var(--v2-line-strong)",
  fg: "var(--v2-fg)",
  fg2: "var(--v2-fg-2)",
  fg3: "var(--v2-fg-3)",
  accent: "var(--v2-accent)",
  crit: "var(--v2-crit)",
  ok: "var(--v2-ok)",
  font: "var(--font-ui)",
  mono: "var(--font-data)",
};

// Títulos dos blocos (o layout salvo no navegador guarda o título antigo; o título
// exibido vem daqui, pelo id, para não depender do que está salvo).
const BLOCK_TITLES: Record<string, string> = {
  kpis: "Métricas gerais",
  proxy: "Proxy Cloudflare",
  hosts: "Hosts mais acessados",
  security: "Ações de segurança",
  countries: "Países de origem",
  urls: "URLs mais requisitadas",
  ips: "IPs de origem",
  traffic: "Tráfego",
  attack: "Ataques mitigados",
  skip: "Requisições em skip",
  "skip-hosts": "Hosts com mais skip",
  history: "Histórico local",
  logs: "Eventos do firewall",
};

const ACTION_LABEL: Record<string, string> = {
  block: "Bloqueio",
  challenge: "Desafio",
  managed_challenge: "Desafio gerenciado",
  jschallenge: "Desafio JS",
  js_challenge: "Desafio JS",
  log: "Registro",
  skip: "Skip",
  allow: "Permitido",
};

// Evento do firewall (mesmo formato de sampleLogs em getCloudflareAnalytics)
type SampleLog = {
  datetime: string;
  action: string;
  clientIP: string;
  country: string;
  host: string;
  path: string;
  method: string;
  userAgent: string;
  ruleId: string;
  rayId: string;
};

// ── Action palette ─────────────────────────────────────────────────────────────
const ACTION_TONE: Record<string, "danger" | "warning" | "accent" | "success"> = {
  block: "danger",
  challenge: "warning",
  managed_challenge: "warning",
  jschallenge: "warning",
  js_challenge: "warning",
  log: "accent",
  skip: "success",
  allow: "success",
};

const ACTION_COLOR: Record<string, { bg: string; color: string; border: string }> = {
  danger: { bg: T.dangerBg, color: T.danger, border: "rgba(239,68,68,0.25)" },
  warning: { bg: T.warningBg, color: T.warning, border: "rgba(245,158,11,0.25)" },
  accent: { bg: T.accentSoft, color: T.accent, border: "rgba(59,130,246,0.25)" },
  success: { bg: T.successBg, color: T.success, border: "rgba(16,185,129,0.25)" },
};

const COUNTRY_ISO: Record<string, string> = {
  Brazil: "BR",
  "United States": "US",
  "United Kingdom": "GB",
  Germany: "DE",
  France: "FR",
  Spain: "ES",
  Italy: "IT",
  Portugal: "PT",
  Russia: "RU",
  China: "CN",
  Japan: "JP",
  Netherlands: "NL",
  Sweden: "SE",
  Norway: "NO",
  Finland: "FI",
  Denmark: "DK",
  Poland: "PL",
};

// ── Inline CSS ─────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');

  .cf-root { font-family:var(--font-ui); color:var(--v2-fg); font-size:14px; }
  .cf-root * { box-sizing:border-box; }
  .cf-root :focus-visible { outline:2px solid var(--v2-accent); outline-offset:2px; }
  .cf-stack { display:flex; flex-direction:column; gap:20px; }

  /* ── Cabeçalho da página ── */
  .cf-ph { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  .cf-ph-title { font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.2; margin:0; color:var(--v2-fg); }
  .cf-ph-sub { margin:4px 0 0; font-size:13px; color:var(--v2-fg-3); display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .cf-ph-actions { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  .cf-live { display:inline-flex; align-items:center; gap:6px; }
  .cf-live::before { content:""; width:7px; height:7px; border-radius:50%; background:var(--v2-ok); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-ok) 25%, transparent); }

  /* ── Controle segmentado (abas e período) ── */
  .cf-seg { display:inline-flex; padding:3px; gap:2px; background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:8px; }
  .cf-seg button { display:inline-flex; align-items:center; gap:6px; border:0; background:transparent; padding:4px 12px; border-radius:5px; font-size:13px; color:var(--v2-fg-2); cursor:pointer; font-family:inherit; }
  .cf-seg button:hover { color:var(--v2-fg); }
  .cf-seg button[aria-pressed="true"] { background:var(--v2-surface-2); color:var(--v2-fg); font-weight:500; box-shadow:inset 0 0 0 1px var(--v2-line); }

  /* ── Botões ── */
  .cf-btn { display:inline-flex; align-items:center; gap:7px; height:34px; padding:0 14px; border-radius:8px; border:1px solid var(--v2-line); background:var(--v2-surface); font-size:13px; font-weight:500; color:var(--v2-fg); cursor:pointer; font-family:inherit; white-space:nowrap; }
  .cf-btn:hover:not(:disabled) { background:var(--v2-hover); border-color:var(--v2-line-strong); }
  .cf-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .cf-btn.ghost { background:transparent; border-color:transparent; color:var(--v2-fg-2); }
  .cf-btn.ghost:hover:not(:disabled) { background:var(--v2-hover); color:var(--v2-fg); }
  .cf-btn.sm { height:28px; padding:0 10px; font-size:12.5px; }
  .cf-btn.primary { background:var(--v2-accent); border-color:var(--v2-accent); color:var(--v2-accent-ink); }
  .cf-btn.primary:hover:not(:disabled) { background:var(--v2-accent); border-color:var(--v2-accent); filter:brightness(1.08); }
  .cf-bar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding-bottom:14px; border-bottom:1px solid var(--v2-line); }
  .cf-bar-right { margin-left:auto; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .cf-bar-sep { width:1px; height:22px; background:var(--v2-line); margin:0 2px; }
  .cf-tabs button { height:28px; }
  .cf-icon-btn { position:relative; width:34px; height:34px; display:inline-grid; place-items:center; border:0; border-radius:8px; background:transparent; color:var(--v2-fg-2); cursor:pointer; }
  .cf-icon-btn:hover { background:var(--v2-hover); color:var(--v2-fg); }
  .cf-icon-btn.dirty::after { content:""; position:absolute; top:6px; right:6px; width:7px; height:7px; border-radius:50%; background:var(--v2-med); box-shadow:0 0 0 2px var(--v2-bg); }

  .cf-zone-btn { display:inline-flex; align-items:center; justify-content:space-between; gap:8px; height:34px; padding:0 10px 0 12px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-surface); font-size:12.5px; font-family:var(--font-data); color:var(--v2-fg); cursor:pointer; min-width:210px; }
  .cf-zone-btn:hover { background:var(--v2-hover); }

  /* ── Filtros ativos ── */
  .cf-filters { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .cf-filters-label { font-size:12.5px; color:var(--v2-fg-3); }
  .cf-filter-chip { display:inline-flex; align-items:center; gap:6px; height:28px; padding:0 8px 0 10px; border-radius:99px; border:0; cursor:pointer; font-size:12.5px; font-family:inherit; color:var(--v2-fg); background:color-mix(in oklch, var(--v2-accent) 14%, transparent); }
  .cf-filter-chip .close { color:var(--v2-fg-3); }
  .cf-filter-chip:hover .close { color:var(--v2-fg); }

  /* ── Cartões (blocos arrastáveis) ── */
  .cf-block { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; display:flex; flex-direction:column; min-width:0; min-height:140px; resize:vertical; overflow:auto; }
  .cf-block.bare { background:transparent; border:0; min-height:0; resize:none; overflow:visible; }
  .cf-block.dragging { opacity:0.35; border:1px dashed var(--v2-accent); }
  .cf-block-header { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 18px 6px; cursor:grab; user-select:none; flex-shrink:0; }
  .cf-block-header:active { cursor:grabbing; }
  .cf-block-title { display:flex; align-items:center; gap:8px; font-size:14px; font-weight:600; color:var(--v2-fg); }
  .cf-resize-ctrl { display:flex; align-items:center; gap:2px; opacity:0; transition:opacity 0.15s; }
  .cf-block:hover .cf-resize-ctrl, .cf-resize-ctrl:focus-within { opacity:1; }
  .cf-resize-btn { width:26px; height:26px; display:grid; place-items:center; border:none; background:transparent; color:var(--v2-fg-3); cursor:pointer; border-radius:5px; }
  .cf-resize-btn:hover { color:var(--v2-fg); background:var(--v2-hover); }
  .cf-resize-btn.grip { cursor:grab; }
  .cf-block-body { flex:1; padding:8px 18px 18px; display:flex; flex-direction:column; }
  .cf-block-body-scroll { flex:1; overflow:auto; max-height:240px; }

  /* ── Faixa de KPIs ── */
  .cf-kpi-grid { display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); width:100%; background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
  .cf-kpi { padding:16px 18px 14px; display:grid; gap:2px; align-content:start; box-shadow:1px 0 0 var(--v2-line), 0 1px 0 var(--v2-line); }
  .cf-kpi-label { font-size:12.5px; color:var(--v2-fg-2); display:flex; align-items:center; gap:6px; }
  .cf-kpi-value { font-size:28px; font-weight:600; letter-spacing:-0.02em; line-height:1.25; font-variant-numeric:tabular-nums; color:var(--v2-fg); }
  .cf-kpi-foot { font-size:12px; color:var(--v2-fg-3); }
  .cf-sw { width:8px; height:8px; border-radius:2px; flex-shrink:0; display:inline-block; }

  /* ── Tabelas ── */
  .cf-table { width:100%; border-collapse:collapse; font-size:13px; }
  .cf-table th { padding:9px 12px; font-size:12px; font-weight:500; color:var(--v2-fg-3); text-align:left; border-bottom:1px solid var(--v2-line); background:var(--v2-surface); white-space:nowrap; }
  .cf-table td { padding:8px 12px; height:40px; border-bottom:1px solid var(--v2-line); color:var(--v2-fg); vertical-align:middle; }
  .cf-table tbody tr:hover td { background:var(--v2-hover); }
  .cf-table tbody tr:last-child td { border-bottom:none; }
  .cf-table .mono { font-family:var(--font-data); font-size:12.5px; }
  .cf-table .dim { color:var(--v2-fg-2); }
  .cf-table .right { text-align:right; font-variant-numeric:tabular-nums; }
  .cf-table .clickrow { cursor:pointer; }
  .cf-table .selected td { background:color-mix(in oklch, var(--v2-accent) 12%, transparent); }
  .cf-table td:first-child, .cf-table th:first-child { padding-left:18px; }
  .cf-table td:last-child, .cf-table th:last-child { padding-right:18px; }

  /* ── Pílulas de ação ── */
  .cf-badge { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; white-space:nowrap; }
  .cf-badge-dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }

  /* ── Barras horizontais ── */
  .cf-hbars { display:grid; gap:12px; }
  .cf-hbar { display:grid; gap:5px; }
  .cf-hbar-top { display:flex; justify-content:space-between; gap:8px; font-size:13px; }
  .cf-hbar-top span:first-child { min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:var(--font-data); font-size:12.5px; }
  .cf-hbar-top span:last-child { font-family:var(--font-data); font-size:12.5px; font-weight:500; color:var(--v2-fg-2); }
  .cf-track { position:relative; height:8px; background:var(--v2-surface-2); border-radius:99px; overflow:hidden; }
  .cf-fill { position:absolute; inset:0 auto 0 0; background:var(--v2-accent); border-radius:99px; }
  .cf-hbar.sel { width:100%; padding:4px 6px; margin:-4px -6px; border:0; border-radius:8px; background:transparent; color:inherit; font:inherit; text-align:left; cursor:pointer; box-sizing:content-box; }
  .cf-hbar.sel:hover { background:var(--v2-hover); }
  .cf-hbar.sel.on { background:color-mix(in oklch, var(--v2-accent) 10%, transparent); box-shadow:inset 0 0 0 1px color-mix(in oklch, var(--v2-accent) 35%, transparent); }
  .cf-hbar.sel.dim { opacity:0.45; }
  .cf-hbar-top span:first-child { display:inline-flex; align-items:center; gap:2px; }
  .cf-dim { color:var(--v2-fg-3); }
  .cf-ip-country { display:inline-flex; align-items:center; margin-left:8px; font-family:var(--font-ui); font-size:12px; }
  .cf-proxy { display:flex; align-items:center; gap:18px; flex-wrap:wrap; }
  .cf-proxy-leg { flex:1; min-width:160px; display:grid; gap:10px; font-size:13px; color:var(--v2-fg-2); }
  .cf-proxy-leg div { display:grid; grid-template-columns:10px minmax(0, 1fr) auto; gap:8px; align-items:center; }
  .cf-proxy-leg i { width:10px; height:10px; border-radius:3px; }
  .cf-proxy-leg b { font:500 13px var(--font-data); color:var(--v2-fg); }
  .cf-proxy-leg .muted { padding-top:10px; border-top:1px solid var(--v2-line); color:var(--v2-fg-3); }

  /* ── Proxy ── */
  .cf-proxy-big { font-size:34px; font-weight:600; letter-spacing:-0.02em; line-height:1.1; font-variant-numeric:tabular-nums; margin-bottom:10px; }
  .cf-proxy-row { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-top:10px; font-size:13px; color:var(--v2-fg-2); }
  .cf-proxy-val { font-family:var(--font-data); font-size:13px; font-weight:500; color:var(--v2-fg); }
  .cf-progress-track { height:8px; background:var(--v2-surface-2); border-radius:99px; overflow:hidden; }
  .cf-progress-fill { height:100%; border-radius:99px; transition:width 0.6s ease; }

  /* ── Estados ── */
  .cf-state-box { padding:40px 24px; background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; display:flex; flex-direction:column; align-items:center; gap:10px; text-align:center; }
  .cf-state-icon { width:44px; height:44px; border-radius:10px; display:flex; align-items:center; justify-content:center; }
  .cf-empty { padding:28px 16px; text-align:center; color:var(--v2-fg-3); font-size:13px; }

  @keyframes exec-spin { to{transform:rotate(360deg)} }
  .exec-spin { animation:exec-spin 0.8s linear infinite; }
  @media (prefers-reduced-motion: reduce) { .exec-spin { animation:none; } }

  .cf-root ::-webkit-scrollbar { width:6px; height:6px; }
  .cf-root ::-webkit-scrollbar-track { background:transparent; }
  .cf-root ::-webkit-scrollbar-thumb { background:var(--v2-line-strong); border-radius:3px; }

  /* ── Tooltip dos gráficos ── */
  .cf-tip { background:var(--v2-surface); border:1px solid var(--v2-line-strong); border-radius:8px; padding:10px 14px; font-family:var(--font-ui); box-shadow:0 12px 32px rgba(0,0,0,0.35); min-width:150px; }
  .cf-tip-label { font-size:12px; font-weight:600; color:var(--v2-fg); margin-bottom:6px; }
  .cf-tip-row { display:flex; align-items:center; gap:6px; font-size:12px; margin-bottom:3px; }
  .cf-tip-dot { width:7px; height:7px; border-radius:2px; flex-shrink:0; }
  .cf-tip-name { color:var(--v2-fg-2); font-size:12px; }
  .cf-tip-val { color:var(--v2-fg); font-weight:500; font-family:var(--font-data); margin-left:auto; }
  .cf-tip-divider { border-top:1px solid var(--v2-line); margin:7px 0; }
  .cf-tip-sub { font-size:11.5px; color:var(--v2-fg-3); margin-bottom:5px; }

  /* ── Gráficos: só a "tinta" segue o tema; as cores dos dados não mudam ── */
  .cf-root .recharts-legend-item-text { color:var(--v2-fg-2) !important; font-size:12px; font-family:var(--font-ui); }
  .cf-root .recharts-cartesian-axis-tick-value { fill:var(--v2-fg-3) !important; font-size:11px; font-family:var(--font-data); }
  .cf-root .recharts-text { fill:var(--v2-fg-3) !important; }
  .cf-root .recharts-label { fill:var(--v2-fg-2) !important; font-size:11px; font-family:var(--font-data); }
  .cf-root .recharts-cartesian-axis-line { stroke:var(--v2-line-strong) !important; }
  .cf-root .recharts-cartesian-grid line { stroke:var(--v2-line) !important; }
  .cf-root .recharts-active-dot circle { stroke:var(--v2-surface) !important; }
`;

// ── Utilities ──────────────────────────────────────────────────────────────────

function getFlagUrl(countryInput: string) {
  if (!countryInput) return "https://flagcdn.com/w40/un.png";
  if (countryInput.length === 2) return `https://flagcdn.com/w40/${countryInput.toLowerCase()}.png`;
  const iso = COUNTRY_ISO[countryInput]?.toLowerCase();
  return iso ? `https://flagcdn.com/w40/${iso}.png` : "https://flagcdn.com/w40/un.png";
}

function Flag({ name }: { name: string }) {
  return (
    <img
      src={getFlagUrl(name)}
      alt={name}
      style={{
        display: "inline-block",
        width: 16,
        height: 12,
        objectFit: "cover",
        borderRadius: 2,
        marginRight: 6,
        marginBottom: 1,
        boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
        flexShrink: 0,
      }}
      onError={(e) => (e.currentTarget.style.display = "none")}
    />
  );
}

function fmtNum(n: number) {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("pt-BR");
}

function SafeHourDateTime(iso: string, formatType: "hour" | "full") {
  if (!iso) return "";
  const d = new Date(iso);
  return formatType === "hour"
    ? d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit" })
    : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function ExecBadge({ action }: { action: string }) {
  const tone = ACTION_TONE[(action || "").toLowerCase()] ?? "accent";
  const col = ACTION_COLOR[tone];
  return (
    <span className="cf-badge" style={{ background: col.bg, color: col.color }} title={action || "log"}>
      <span className="cf-badge-dot" style={{ background: col.color }} />
      {ACTION_LABEL[(action || "log").toLowerCase()] ?? action}
    </span>
  );
}

// ── Custom Tooltip ─────────────────────────────────────────────────────────────
function ExecTrafficTooltip({ active, payload, label, hostsByBucket }: any) {
  if (!active || !payload?.length) return null;
  const hosts: Array<{ host: string; count: number }> = hostsByBucket?.[label] ?? [];
  return (
    <div className="cf-tip">
      <div className="cf-tip-label">{SafeHourDateTime(String(label), "full")}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="cf-tip-row">
          <div className="cf-tip-dot" style={{ background: p.color }} />
          <span className="cf-tip-name">{p.name}</span>
          <span className="cf-tip-val">{fmtNum(Number(p.value))}</span>
        </div>
      ))}
      {hosts.length > 0 && (
        <>
          <div className="cf-tip-divider" />
          <div className="cf-tip-sub">Top FQDN</div>
          {hosts.map((h) => (
            <div key={h.host} className="cf-tip-row">
              <span
                className="cf-tip-name"
                style={{
                  fontFamily: "'IBM Plex Mono',monospace",
                  fontSize: 10,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: 180,
                }}
              >
                {h.host}
              </span>
              <span className="cf-tip-val">{fmtNum(h.count)}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function ExecGenericTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="cf-tip">
      <div className="cf-tip-label">{SafeHourDateTime(String(label), "full")}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="cf-tip-row">
          <div className="cf-tip-dot" style={{ background: p.color }} />
          <span className="cf-tip-name">{p.name}</span>
          <span className="cf-tip-val">{fmtNum(Number(p.value))}</span>
        </div>
      ))}
    </div>
  );
}

// ── Block header ───────────────────────────────────────────────────────────────
function BlockHeader({
  id,
  title,
  icon: Icon,
  showResize = true,
  onGrow,
  onShrink,
}: {
  id: string;
  title: React.ReactNode;
  icon?: React.ElementType;
  showResize?: boolean;
  onGrow?: () => void;
  onShrink?: () => void;
}) {
  return (
    <div className="cf-block-header">
      <div className="cf-block-title" title="Arraste para reorganizar">
        <span>{title}</span>
      </div>
      {showResize && (
        <div className="cf-resize-ctrl">
          <span className="cf-resize-btn grip" aria-hidden="true" title="Arraste para reorganizar">
            <GripVertical size={14} />
          </span>
          <button className="cf-resize-btn" onClick={onShrink} title="Diminuir" aria-label="Diminuir cartão">
            <Minimize2 size={13} />
          </button>
          <button className="cf-resize-btn" onClick={onGrow} title="Aumentar" aria-label="Aumentar cartão">
            <Maximize2 size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Empty micro state ──────────────────────────────────────────────────────────
function EmptyRow({ message }: { message: string }) {
  return <div className="cf-empty">{message}</div>;
}

// Ranking com barra proporcional; com onSelect, cada linha vira um filtro
const SKIP_COLOR = "var(--v2-med)";
function RankBars({
  rows,
  color,
  selected,
  onSelect,
}: {
  rows: Array<{ key: string; label: React.ReactNode; value: number; title?: string }>;
  color?: string;
  selected?: string | null;
  onSelect?: (key: string) => void;
}) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  return (
    <div className="cf-hbars">
      {rows.map((r) => {
        const content = (
          <>
            <div className="cf-hbar-top">
              <span>{r.label}</span>
              <span>{fmtNum(r.value)}</span>
            </div>
            <div className="cf-track">
              <div className="cf-fill" style={{ width: `${(r.value / max) * 100}%`, ...(color ? { background: color } : {}) }} />
            </div>
          </>
        );
        return onSelect ? (
          <button
            key={r.key}
            type="button"
            className={`cf-hbar sel${selected === r.key ? " on" : ""}${selected && selected !== r.key ? " dim" : ""}`}
            title={r.title ?? `${r.key}: ${r.value.toLocaleString("pt-BR")} · clique para filtrar`}
            aria-pressed={selected === r.key}
            onClick={() => onSelect(r.key)}
          >
            {content}
          </button>
        ) : (
          <div key={r.key} className="cf-hbar" title={r.title ?? `${r.key}: ${r.value.toLocaleString("pt-BR")}`}>
            {content}
          </div>
        );
      })}
    </div>
  );
}

// Rosca simples (proxy): fatias proporcionais com o valor principal no centro
function Donut({ parts, center, sub }: { parts: Array<{ value: number; color: string }>; center: string; sub: string }) {
  const total = Math.max(
    parts.reduce((n, p) => n + p.value, 0),
    1,
  );
  const r = 46;
  const C = 2 * Math.PI * r;
  let acc = 0;
  return (
    <svg viewBox="0 0 120 120" width="120" height="120" aria-hidden="true" style={{ flex: "none" }}>
      <circle cx="60" cy="60" r={r} fill="none" stroke="var(--v2-surface-2)" strokeWidth={14} />
      {parts.map((p, i) => {
        const len = (p.value / total) * C;
        const el = (
          <circle
            key={i}
            cx="60"
            cy="60"
            r={r}
            fill="none"
            stroke={p.color}
            strokeWidth={14}
            strokeDasharray={`${Math.max(len - (parts.length > 1 ? 2 : 0), 0)} ${C}`}
            strokeDashoffset={-acc}
            transform="rotate(-90 60 60)"
          />
        );
        acc += len;
        return el;
      })}
      <text x="60" y="60" textAnchor="middle" style={{ font: "600 18px var(--font-ui)", fill: "var(--v2-fg)" }}>
        {center}
      </text>
      <text x="60" y="76" textAnchor="middle" style={{ font: "11px var(--font-ui)", fill: "var(--v2-fg-3)" }}>
        {sub}
      </text>
    </svg>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
export function CloudflareDashboardReal() {
  const { can, isModuleAdmin, isAdmin, loading: permLoading } = usePermissions();
  const canManageCf = isAdmin || isModuleAdmin("cloudflare-waf") || can("cloudflare-waf", "manage");
  const canViewCf = isAdmin || isModuleAdmin("cloudflare-waf") || can("cloudflare-waf", "view");
  const canAnalyticsHttp = isAdmin || isModuleAdmin("cloudflare-waf") || can("cloudflare-waf", "view_analytics_http");
  const canAnalyticsSecurity =
    isAdmin || isModuleAdmin("cloudflare-waf") || can("cloudflare-waf", "view_analytics_security");
  const canAnalytics = canAnalyticsHttp || canAnalyticsSecurity;
  // Período salvo pelo botão Salvar (junto com o layout); padrão: 3 dias
  const [days, setDays] = React.useState<number>(() => {
    try {
      const v = Number(localStorage.getItem(DAYS_STORAGE_KEY));
      return [1, 2, 3].includes(v) ? v : 3;
    } catch {
      return 3;
    }
  });
  const [selectedCountry, setSelectedCountry] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<string>(() => {
    try {
      return localStorage.getItem("cloudflare_active_tab") ?? "dashboard";
    } catch {
      return "dashboard";
    }
  });

  function handleTabChange(value: string) {
    setActiveTab(value);
    try {
      localStorage.setItem("cloudflare_active_tab", value);
    } catch {}
  }

  React.useEffect(() => {
    if (permLoading) return;
    if (canManageCf && !canViewCf) {
      setActiveTab("operations");
    } else if (!canViewCf && !canManageCf && canAnalytics) {
      setActiveTab("analytics");
    }
  }, [permLoading, canManageCf, canViewCf, canAnalytics]);

  const [selectedAction, setSelectedAction] = React.useState<string | null>(null);
  // Evento do firewall aberto no painel lateral
  const [selectedLog, setSelectedLog] = React.useState<SampleLog | null>(null);
  const [draggedId, setDraggedId] = React.useState<string | null>(null);
  const [selectedZoneId, setSelectedZoneId] = React.useState<string | null>(() => {
    try {
      return localStorage.getItem("cloudflare_selected_zone") || null;
    } catch {
      return null;
    }
  });
  const [zonePopoverOpen, setZonePopoverOpen] = React.useState(false);

  // ── QUERIES — UNCHANGED ────────────────────────────────────────────────────
  const fetchZones = useServerFn(listCloudflareZones);
  const { data: zonesData } = useQuery({
    queryKey: ["cloudflare-zones-list"],
    queryFn: () => fetchZones(),
  });
  const zones = ((zonesData as any)?.zones ?? []) as Array<{ id: string; name: string; status: string | null }>;

  React.useEffect(() => {
    if (zones.length === 0) return;
    if (selectedZoneId) return;
    const bernoulli = zones.find((z) => z.name.includes("bernoulli.com.br"));
    if (bernoulli) persistZone(bernoulli.id);
  }, [zones]);

  const selectedZone = zones.find((z) => z.id === selectedZoneId) || null;
  const syncZoneFn = useServerFn(syncCloudflareZone);

  function persistZone(id: string | null) {
    setSelectedZoneId(id);
    try {
      if (id) localStorage.setItem("cloudflare_selected_zone", id);
      else localStorage.removeItem("cloudflare_selected_zone");
    } catch {}
  }

  async function handleZoneSelect(id: string) {
    persistZone(id);
    setZonePopoverOpen(false);
    const zName = zones.find((z) => z.id === id)?.name ?? id;
    const tid = toast.loading(`Sincronizando ${zName}…`);
    try {
      const res = await syncZoneFn({ data: { zoneId: id } });
      if ("ok" in res && res.ok) {
        toast.success(`Sync de ${zName}: ${res.dnsRecords} DNS, ${res.firewallEvents} eventos`, { id: tid });
        refetch();
      } else {
        toast.error("Falha no sync: " + (res as any).error, { id: tid });
      }
    } catch (e) {
      toast.error((e as Error).message, { id: tid });
    }
  }

  const [blocks, setBlocks] = React.useState<DashboardBlock[]>(loadSavedBlocks);

  const fetchAnalytics = useServerFn(getCloudflareAnalytics);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["cloudflare-analytics", days, selectedAction, selectedZoneId],
    enabled: canViewCf,
    queryFn: () => fetchAnalytics({ data: { days, action: selectedAction, zoneId: selectedZoneId } }),
  });

  // Arrastar/redimensionar e trocar o período só alteram a tela; o botão Salvar
  // grava o layout e o período (aplicados de novo ao abrir o módulo).
  const [layoutDirty, setLayoutDirty] = React.useState(false);
  const [savedDays, setSavedDays] = React.useState(days);
  const unsaved = layoutDirty || days !== savedDays;
  const saveLayout = () => {
    try {
      const payload = JSON.stringify(blocks.map(({ id, size }) => ({ id, size })));
      localStorage.setItem(STORAGE_KEY, payload);
      localStorage.setItem(DAYS_STORAGE_KEY, String(days));
      // Confere a gravação: só confirma se o navegador devolveu o que foi salvo
      if (localStorage.getItem(STORAGE_KEY) !== payload) throw new Error("conferência falhou");
      setLayoutDirty(false);
      setSavedDays(days);
      toast.success(`Layout e período (${days === 1 ? "24 h" : `${days} dias`}) salvos`);
    } catch {
      toast.error("Não foi possível salvar. O navegador pode estar bloqueando o armazenamento local.");
    }
  };

  const resetLayout = () => {
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  };

  const changeBlockSize = (id: string, action: "grow" | "shrink") => {
    const nextBlocks = blocks.map((b) => {
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
    setBlocks(nextBlocks);
    setLayoutDirty(true);
  };

  // ── Derived data ───────────────────────────────────────────────────────────
  const d = (data as any) ?? null;
  const mitigationRate = d?.totals?.requests > 0 ? (d.totals.mitigated / d.totals.requests) * 100 : 0;
  const proxyTotal = (d?.proxy?.proxied ?? 0) + (d?.proxy?.unproxied ?? 0);
  const proxyRate = proxyTotal > 0 ? ((d.proxy?.proxied ?? 0) / proxyTotal) * 100 : 0;

  const filteredLogs = selectedCountry
    ? (d?.sampleLogs || []).filter((l: any) => l.country === selectedCountry)
    : d?.sampleLogs || [];
  const filteredIps = selectedCountry
    ? (d?.topIps || []).filter((i: any) => i.country === selectedCountry)
    : d?.topIps || [];

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;
    const currentIdx = blocks.findIndex((b) => b.id === draggedId);
    const targetIdx = blocks.findIndex((b) => b.id === targetId);
    const newBlocks = [...blocks];
    const [removed] = newBlocks.splice(currentIdx, 1);
    newBlocks.splice(targetIdx, 0, removed);
    setBlocks(newBlocks);
    setLayoutDirty(true);
  };

  // ── BLOCK ICON MAP ─────────────────────────────────────────────────────────
  const BLOCK_ICONS: Record<string, React.ElementType> = {
    kpis: Zap,
    proxy: Server,
    hosts: Globe,
    security: Shield,
    countries: Globe,
    urls: Link2,
    ips: Activity,
    traffic: TrendingUp,
    attack: AlertTriangle,
    skip: SkipForward,
    "skip-hosts": SkipForward,
    history: Clock,
    logs: Filter,
  };

  // ── CHART SHARED PROPS ─────────────────────────────────────────────────────
  const axisProps = {
    stroke: T.chartAxis,
    fontSize: 10,
    tick: { fill: T.chartTick, fontFamily: "'IBM Plex Mono',monospace" },
    tickLine: false,
    axisLine: { stroke: T.chartAxis },
  };

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className="cf-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="cf-stack">
        {/* ── Cabeçalho da página ──────────────────────────────────────────── */}
        <div className="cf-ph">
          <div>
            <h1 className="cf-ph-title">Cloudflare WAF</h1>
            <p className="cf-ph-sub">
              <span className="cf-live">{isFetching ? "Atualizando…" : "Ao vivo"}</span>
              <span>·</span>
              <span>
                {activeTab === "analytics"
                  ? "Análise de tráfego e segurança"
                  : activeTab === "operations"
                    ? "DNS, cache e regras"
                    : "Visão geral da zona"}
              </span>
            </p>
          </div>
          <SyncActions moduleSlug="cloudflare-waf" />
        </div>

        {/* ── Barra do módulo: abas + contexto (zona e período valem para Dashboard e Analytics) ── */}
        <div className="cf-bar">
          <div className="cf-seg cf-tabs" role="tablist" aria-label="Visão">
            {canViewCf && (
              <button type="button" role="tab" aria-pressed={activeTab === "dashboard"} onClick={() => handleTabChange("dashboard")}>
                Dashboard
              </button>
            )}
            {canAnalytics && (
              <button type="button" role="tab" aria-pressed={activeTab === "analytics"} onClick={() => handleTabChange("analytics")}>
                Analytics
              </button>
            )}
            {canManageCf && (
              <button type="button" role="tab" aria-pressed={activeTab === "operations"} onClick={() => handleTabChange("operations")}>
                Operações
              </button>
            )}
          </div>

          {(
            <div className="cf-bar-right">
              {/* Zona */}
              <Popover open={zonePopoverOpen} onOpenChange={setZonePopoverOpen}>
                <PopoverTrigger asChild>
                  <button className="cf-zone-btn" role="combobox" aria-expanded={zonePopoverOpen} aria-label="Trocar zona">
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                      <Globe size={14} color={V.fg3} />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {selectedZone ? selectedZone.name : "bernoulli.com.br"}
                      </span>
                    </span>
                    <ChevronsUpDown size={13} color={V.fg3} />
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-[300px] p-0" align="end">
                  <Command>
                    <CommandInput placeholder="Buscar zona…" />
                    <CommandList>
                      <CommandEmpty>Nenhuma zona encontrada.</CommandEmpty>
                      <CommandGroup>
                        {zones.map((z) => (
                          <CommandItem key={z.id} value={z.name} onSelect={() => handleZoneSelect(z.id)}>
                            <Check size={14} style={{ opacity: selectedZoneId === z.id ? 1 : 0, color: V.ok }} />
                            <span style={{ overflow: "hidden", textOverflow: "ellipsis", fontFamily: V.mono, fontSize: 12.5 }}>
                              {z.name}
                            </span>
                            {z.status && (
                              <span style={{ marginLeft: "auto", fontSize: 11.5, color: V.fg3 }}>{z.status}</span>
                            )}
                          </CommandItem>
                        ))}
                      </CommandGroup>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {/* Período (não se aplica a Operações) */}
              {activeTab !== "operations" && (
                <div className="cf-seg" role="group" aria-label="Período">
                  {[1, 2, 3].map((n) => (
                    <button key={n} type="button" aria-pressed={days === n} onClick={() => setDays(n)}>
                      {n === 1 ? "24 h" : `${n} dias`}
                    </button>
                  ))}
                </div>
              )}
              {/* Layout do Dashboard */}
              {activeTab === "dashboard" && canViewCf && (
                <>
                  <span className="cf-bar-sep" aria-hidden="true" />
                  <button className="cf-icon-btn" onClick={resetLayout} title="Restaurar layout" aria-label="Restaurar layout">
                    <RotateCcw size={15} />
                  </button>
                  <button
                    className={`cf-icon-btn${unsaved ? " dirty" : ""}`}
                    onClick={saveLayout}
                    title={unsaved ? "Salvar layout e período (há alterações não salvas)" : "Salvar layout e período"}
                    aria-label="Salvar layout e período"
                  >
                    <Save size={15} />
                  </button>
                </>
              )}
            </div>
          )}
        </div>
        {/* ── Analytics Tab content ────────────────────────────────────────── */}
        {canAnalytics && activeTab === "analytics" && <AnalyticsTab zoneId={selectedZoneId} days={days} />}

        {/* ── Operations Tab content ───────────────────────────────────────── */}
        {canManageCf && activeTab === "operations" && (
          <SharedZoneContext.Provider value={selectedZoneId}>
            <OperationsTab />
          </SharedZoneContext.Provider>
        )}

        {/* ── Dashboard Tab content ────────────────────────────────────────── */}
        {canViewCf && activeTab === "dashboard" && (
          <>
            {isLoading ? (
              <ModuleLoading />
            ) : error || (d && !d.ok) ? (
              <div className="cf-state-box">
                <div
                  className="cf-state-icon"
                  style={{ background: T.dangerBg, border: `1px solid rgba(239,68,68,0.3)` }}
                >
                  <AlertTriangle size={18} color={T.danger} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.danger }}>
                  Erro crítico na comunicação com a API Cloudflare
                </span>
                <span style={{ fontSize: 11, color: V.fg3, fontFamily: "'IBM Plex Mono',monospace" }}>
                  {d && !d.ok ? d.error : ((error as Error)?.message ?? "Erro desconhecido")}
                </span>
              </div>
            ) : (
              <>
                {/* Filtros ativos (país / ação) — só aparecem quando existem */}
                {(selectedCountry || selectedAction) && (
                <div className="cf-filters">
                  <span className="cf-filters-label">Filtrando por</span>
                  {selectedCountry && (
                    <button className="cf-filter-chip" onClick={() => setSelectedCountry(null)}>
                      <Flag name={selectedCountry} />
                      {selectedCountry}
                      <X size={14} className="close" aria-label="Remover filtro" />
                    </button>
                  )}
                  {selectedAction && (
                    <button className="cf-filter-chip" onClick={() => setSelectedAction(null)}>
                      Ação: {ACTION_LABEL[selectedAction.toLowerCase()] ?? selectedAction}
                      <X size={14} className="close" aria-label="Remover filtro" />
                    </button>
                  )}
                </div>
                )}

                {/* ── Grid ─────────────────────────────────────────────────────── */}
                <div
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-5"
                  style={{ gridAutoFlow: "row dense" }}
                >
                  {blocks.map((block: DashboardBlock) => {
                    const BlockIcon = BLOCK_ICONS[block.id] ?? Activity;
                    const isDragging = draggedId === block.id;
                    const blockCls = `${block.size} cf-block${block.id === "kpis" ? " bare" : ""}${isDragging ? " dragging" : ""}`;
                    const header = (showResize = true) => (
                      <BlockHeader
                        id={block.id}
                        title={BLOCK_TITLES[block.id] ?? block.title}
                        icon={BlockIcon}
                        showResize={showResize}
                        onGrow={() => changeBlockSize(block.id, "grow")}
                        onShrink={() => changeBlockSize(block.id, "shrink")}
                      />
                    );
                    const dragProps = {
                      draggable: true,
                      onDragStart: () => setDraggedId(block.id),
                      onDragOver: (e: React.DragEvent) => handleDragOver(e, block.id),
                      onDragEnd: () => setDraggedId(null),
                    };

                    /* ── KPIs ─────────────────────────────────────────────────── */
                    if (block.id === "kpis" && d?.totals) {
                      return (
                        <div key={block.id} {...dragProps} className={blockCls} title="Arraste para reorganizar">
                          <div className="cf-kpi-grid">
                            {[
                              {
                                label: "Requisições",
                                value: fmtNum(d.totals.requests),
                                foot: `${fmtNum(d.totals?.uniqueIps || 0)} IPs únicos`,
                              },
                              {
                                label: "Servidas do cache",
                                value: fmtNum(d.totals.cached),
                                foot:
                                  d.totals.requests > 0
                                    ? `${((d.totals.cached / d.totals.requests) * 100).toFixed(1).replace(".", ",")}% das requisições`
                                    : "—",
                              },
                              { label: "Mitigadas", value: fmtNum(d.totals.mitigated), foot: "bloqueios e desafios", sw: T.danger },
                              {
                                label: "Taxa de mitigação",
                                value: `${mitigationRate.toFixed(2).replace(".", ",")}%`,
                                foot: "das requisições",
                              },
                              {
                                label: "Domínios",
                                value: String(d.domains?.zones || 0),
                                foot: `${d.domains?.subdomains || 0} subdomínios`,
                              },
                            ].map(({ label, value, foot, sw }) => (
                              <div key={label} className="cf-kpi">
                                <span className="cf-kpi-label">
                                  {sw && <span className="cf-sw" style={{ background: sw }} />}
                                  {label}
                                </span>
                                <span className="cf-kpi-value">{value}</span>
                                <span className="cf-kpi-foot">{foot}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      );
                    }

                    /* ── PROXY ────────────────────────────────────────────────── */
                    if (block.id === "proxy" && d?.proxy) {
                      return (
                        <div key={block.id} {...dragProps} className={blockCls}>
                          {header()}
                          <div className="cf-block-body" style={{ minHeight: 140, justifyContent: "center" }}>
                            <div className="cf-proxy">
                              <Donut
                                parts={[
                                  { value: d.proxy.proxied ?? 0, color: "var(--v2-accent)" },
                                  { value: d.proxy.unproxied ?? 0, color: "var(--v2-line-strong)" },
                                ]}
                                center={`${proxyRate.toFixed(1).replace(".", ",")}%`}
                                sub="com proxy"
                              />
                              <div className="cf-proxy-leg">
                                <div>
                                  <i style={{ background: "var(--v2-accent)" }} />
                                  <span>Com proxy</span>
                                  <b>{fmtNum(d.proxy.proxied)}</b>
                                </div>
                                <div>
                                  <i style={{ background: "var(--v2-line-strong)" }} />
                                  <span>Direto (sem proxy)</span>
                                  <b>{fmtNum(d.proxy.unproxied)}</b>
                                </div>
                                <div className="muted">
                                  <i />
                                  <span>IPs únicos de origem</span>
                                  <b>{fmtNum(d.totals?.uniqueIps || 0)}</b>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    }

                    /* ── HOSTS ────────────────────────────────────────────────── */
                    if (block.id === "hosts" && d?.topHosts) {
                      return (
                        <div key={block.id} {...dragProps} className={blockCls}>
                          {header()}
                          <div className="cf-block-body" style={{ overflow: "auto", maxHeight: 320 }}>
                            <RankBars
                              rows={d.topHosts.slice(0, 10).map((r: any) => ({ key: r.host, label: r.host, value: r.requests }))}
                            />
                          </div>
                        </div>
                      );
                    }

                    /* ── SECURITY ─────────────────────────────────────────────── */
                    if (block.id === "security" && d?.securityActions) {
                      return (
                        <div key={block.id} {...dragProps} className={blockCls}>
                          {header()}
                          <div className="cf-block-body" style={{ overflow: "auto", maxHeight: 320 }}>
                            <RankBars
                              color={T.danger}
                              selected={selectedAction}
                              onSelect={(k) => setSelectedAction(selectedAction === k ? null : k)}
                              rows={d.securityActions.slice(0, 10).map((a: any) => ({
                                key: a.action,
                                label: ACTION_LABEL[String(a.action).toLowerCase()] ?? a.action,
                                value: a.count,
                              }))}
                            />
                          </div>
                        </div>
                      );
                    }

                    /* ── COUNTRIES ────────────────────────────────────────────── */
                    if (block.id === "countries" && d?.topCountries) {
                      return (
                        <div key={block.id} {...dragProps} className={blockCls}>
                          {header()}
                          <div className="cf-block-body" style={{ overflow: "auto", maxHeight: 320 }}>
                            <RankBars
                              selected={selectedCountry}
                              onSelect={(k) => setSelectedCountry(selectedCountry === k ? null : k)}
                              rows={d.topCountries.map((c: any) => ({
                                key: c.country,
                                label: (
                                  <>
                                    <Flag name={c.country} />
                                    {c.country}
                                  </>
                                ),
                                value: c.requests,
                              }))}
                            />
                          </div>
                        </div>
                      );
                    }

                    /* ── URLS ─────────────────────────────────────────────────── */
                    if (block.id === "urls" && d?.topUrls) {
                      return (
                        <div key={block.id} {...dragProps} className={blockCls}>
                          {header()}
                          <div className="cf-block-body" style={{ overflow: "auto", maxHeight: 320 }}>
                            <RankBars
                              rows={d.topUrls.map((r: any, i: number) => ({
                                key: `${r.host}${r.path}#${i}`,
                                label: (
                                  <>
                                    <span className="cf-dim">{r.host}</span>
                                    {r.path}
                                  </>
                                ),
                                value: r.requests,
                                title: `${r.host}${r.path}: ${Number(r.requests).toLocaleString("pt-BR")}`,
                              }))}
                            />
                          </div>
                        </div>
                      );
                    }

                    /* ── IPS ──────────────────────────────────────────────────── */
                    if (block.id === "ips" && filteredIps) {
                      return (
                        <div key={block.id} {...dragProps} className={blockCls}>
                          {header()}
                          <div className="cf-block-body" style={{ overflow: "auto", maxHeight: 320 }}>
                            {filteredIps.length === 0 ? (
                              <EmptyRow message="Nenhum IP com esses filtros." />
                            ) : (
                              <RankBars
                                rows={filteredIps.map((r: any, i: number) => ({
                                  key: `${r.ip}#${i}`,
                                  label: (
                                    <>
                                      {r.ip}
                                      <span className="cf-dim cf-ip-country">
                                        <Flag name={r.country} />
                                        {r.country}
                                      </span>
                                    </>
                                  ),
                                  value: r.requests,
                                  title: `${r.ip} · ${r.country}: ${Number(r.requests).toLocaleString("pt-BR")}`,
                                }))}
                              />
                            )}
                          </div>
                        </div>
                      );
                    }

                    /* ── TRAFFIC ──────────────────────────────────────────────── */
                    if (block.id === "traffic" && d?.timeseries) {
                      return (
                        <div key={block.id} {...dragProps} className={blockCls}>
                          {header()}
                          <div className="cf-block-body" style={{ minHeight: 250 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={d.timeseries} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                                <defs>
                                  <linearGradient id="cf-req" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={T.accent} stopOpacity={0.35} />
                                    <stop offset="100%" stopColor={T.accent} stopOpacity={0.02} />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="2 4" stroke={T.chartGrid} vertical={false} />
                                <XAxis dataKey="t" {...axisProps} tickFormatter={(v) => SafeHourDateTime(v, "hour")} />
                                <YAxis {...axisProps} axisLine={false} tickFormatter={(v) => fmtNum(Number(v))} />
                                <Tooltip
                                  content={<ExecTrafficTooltip hostsByBucket={d?.hostsByBucket ?? {}} />}
                                  cursor={{ fill: "rgba(59,130,246,0.05)" }}
                                />
                                <Legend
                                  wrapperStyle={{
                                    fontSize: 11,
                                    fontFamily: "'IBM Plex Mono',monospace",
                                    color: T.textPrimary,
                                  }}
                                />
                                <Area
                                  type="monotone"
                                  dataKey="requests"
                                  stroke={T.accent}
                                  fill="url(#cf-req)"
                                  strokeWidth={2}
                                  name="Requisições"
                                  dot={false}
                                  activeDot={{ r: 3, fill: T.accent, stroke: T.surface, strokeWidth: 2 }}
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      );
                    }

                    /* ── ATTACK ───────────────────────────────────────────────── */
                    if (block.id === "attack" && d?.timeseries) {
                      return (
                        <div key={block.id} {...dragProps} className={blockCls}>
                          {header()}
                          <div className="cf-block-body" style={{ minHeight: 230 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={d.timeseries} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                                <defs>
                                  <linearGradient id="cf-mit" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={T.danger} stopOpacity={0.35} />
                                    <stop offset="100%" stopColor={T.danger} stopOpacity={0.02} />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="2 4" stroke={T.chartGrid} vertical={false} />
                                <XAxis dataKey="t" {...axisProps} tickFormatter={(v) => SafeHourDateTime(v, "hour")} />
                                <YAxis {...axisProps} axisLine={false} tickFormatter={(v) => fmtNum(Number(v))} />
                                <Tooltip
                                  content={<ExecTrafficTooltip hostsByBucket={d?.hostsByBucket ?? {}} />}
                                  cursor={{ fill: "rgba(239,68,68,0.05)" }}
                                />
                                <Legend
                                  wrapperStyle={{
                                    fontSize: 11,
                                    fontFamily: "'IBM Plex Mono',monospace",
                                    color: T.textPrimary,
                                  }}
                                />
                                <Area
                                  type="monotone"
                                  dataKey="mitigated"
                                  stroke={T.danger}
                                  fill="url(#cf-mit)"
                                  strokeWidth={2}
                                  name="Mitigadas"
                                  dot={false}
                                  activeDot={{ r: 3, fill: T.danger, stroke: T.surface, strokeWidth: 2 }}
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      );
                    }

                    /* ── SKIP series ──────────────────────────────────────────── */
                    if (block.id === "skip" && d?.timeseries) {
                      const hasSkip = d.timeseries.some((p: any) => Number(p.skip) > 0);
                      return (
                        <div key={block.id} {...dragProps} className={blockCls}>
                          {header()}
                          <div className="cf-block-body" style={{ minHeight: 230 }}>
                            {hasSkip ? (
                              <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={d.timeseries} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                                  <defs>
                                    <linearGradient id="cf-skip" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="0%" stopColor={SKIP_COLOR} stopOpacity={0.35} />
                                      <stop offset="100%" stopColor={SKIP_COLOR} stopOpacity={0.02} />
                                    </linearGradient>
                                  </defs>
                                  <CartesianGrid strokeDasharray="2 4" stroke={T.chartGrid} vertical={false} />
                                  <XAxis
                                    dataKey="t"
                                    {...axisProps}
                                    tickFormatter={(v) => SafeHourDateTime(v, "hour")}
                                  />
                                  <YAxis {...axisProps} axisLine={false} tickFormatter={(v) => fmtNum(Number(v))} />
                                  <Tooltip
                                    content={<ExecTrafficTooltip hostsByBucket={d?.hostsByBucket ?? {}} />}
                                    cursor={{ fill: "rgba(245,158,11,0.05)" }}
                                  />
                                  <Legend wrapperStyle={{ fontSize: 11, fontFamily: "'IBM Plex Mono',monospace" }} />
                                  <Area
                                    type="monotone"
                                    dataKey="skip"
                                    stroke={SKIP_COLOR}
                                    fill="url(#cf-skip)"
                                    strokeWidth={2}
                                    name="Skip"
                                    dot={false}
                                    activeDot={{ r: 3, fill: SKIP_COLOR, stroke: T.surface, strokeWidth: 2 }}
                                  />
                                </AreaChart>
                              </ResponsiveContainer>
                            ) : (
                              <EmptyRow message="Sem requisições em Skip no período." />
                            )}
                          </div>
                        </div>
                      );
                    }

                    /* ── SKIP top hosts ───────────────────────────────────────── */
                    if (block.id === "skip-hosts") {
                      const rows = (d?.skipByHost ?? []) as Array<{ host: string; count: number }>;
                      return (
                        <div key={block.id} {...dragProps} className={blockCls}>
                          {header()}
                          <div className="cf-block-body" style={{ overflow: "auto", maxHeight: 340 }}>
                            {rows.length === 0 ? (
                              <EmptyRow message="Sem hosts em skip no período." />
                            ) : (
                              <RankBars rows={rows.map((r) => ({ key: r.host, label: r.host, value: r.count }))} color={SKIP_COLOR} />
                            )}
                          </div>
                        </div>
                      );
                    }

                    /* ── HISTORY ──────────────────────────────────────────────── */
                    if (block.id === "history" && d?.history) {
                      return (
                        <div key={block.id} {...dragProps} className={blockCls}>
                          {header()}
                          <div className="cf-block-body" style={{ minHeight: 230 }}>
                            {d.history.length > 1 ? (
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={d.history} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                                  <CartesianGrid strokeDasharray="2 4" stroke={T.chartGrid} vertical={false} />
                                  <XAxis
                                    dataKey="captured_at"
                                    {...axisProps}
                                    tickFormatter={(v) => SafeHourDateTime(v, "hour")}
                                  />
                                  <YAxis {...axisProps} axisLine={false} tickFormatter={(v) => fmtNum(Number(v))} />
                                  <Tooltip
                                    content={<ExecGenericTooltip />}
                                    cursor={{ stroke: T.borderHi, strokeWidth: 1 }}
                                  />
                                  <Legend wrapperStyle={{ fontSize: 11, fontFamily: "'IBM Plex Mono',monospace" }} />
                                  <Line
                                    type="monotone"
                                    dataKey="requests"
                                    stroke={T.accent}
                                    strokeWidth={2}
                                    dot={false}
                                    name="Requisições"
                                    activeDot={{ r: 3 }}
                                  />
                                  <Line
                                    type="monotone"
                                    dataKey="mitigated"
                                    stroke={T.danger}
                                    strokeWidth={2}
                                    dot={false}
                                    name="Mitigadas"
                                    activeDot={{ r: 3 }}
                                  />
                                  <Line
                                    type="monotone"
                                    dataKey="skip"
                                    stroke={SKIP_COLOR}
                                    strokeWidth={2}
                                    dot={false}
                                    name="Skip"
                                    activeDot={{ r: 3 }}
                                  />
                                </LineChart>
                              </ResponsiveContainer>
                            ) : (
                              <EmptyRow message="Histórico local insuficiente." />
                            )}
                          </div>
                        </div>
                      );
                    }

                    /* ── LOGS ─────────────────────────────────────────────────── */
                    if (block.id === "logs" && filteredLogs) {
                      return (
                        <div key={block.id} {...dragProps} className={blockCls}>
                          {header()}
                          <div style={{ flex: 1, overflow: "auto", maxHeight: 340 }}>
                            <table className="cf-table" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                              <thead style={{ position: "sticky", top: 0, zIndex: 20 }}>
                                <tr>
                                  <th>Quando</th>
                                  <th>Ação</th>
                                  <th>IP de origem</th>
                                  <th>País</th>
                                  <th>Host e caminho</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredLogs.length === 0 && (
                                  <tr>
                                    <td colSpan={5}>
                                      <EmptyRow message="Nenhum evento no período ou com esses filtros." />
                                    </td>
                                  </tr>
                                )}
                                {filteredLogs.map((l: SampleLog, i: number) => (
                                  <tr
                                    key={i}
                                    className="clickrow"
                                    tabIndex={0}
                                    onClick={() => setSelectedLog(l)}
                                    onKeyDown={(e) => e.key === "Enter" && setSelectedLog(l)}
                                  >
                                    <td className="mono dim" style={{ whiteSpace: "nowrap" }}>
                                      {SafeHourDateTime(l.datetime, "full")}
                                    </td>
                                    <td>
                                      <ExecBadge action={l.action} />
                                    </td>
                                    <td className="mono">{l.clientIP}</td>
                                    <td style={{ whiteSpace: "nowrap" }}>
                                      <Flag name={l.country} />
                                      <span style={{ fontSize: 12.5 }}>{l.country}</span>
                                    </td>
                                    <td
                                      className="mono"
                                      style={{ maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                                      title={`${l.host}${l.path}`}
                                    >
                                      {l.host}
                                      <span style={{ color: V.fg3 }}>{l.path}</span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    }

                    return null;
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>

      {/* ── Painel lateral: detalhe do evento do firewall ──────────────────── */}
      <DetailSheet
        open={!!selectedLog}
        onOpenChange={(o) => !o && setSelectedLog(null)}
        eyebrow={selectedLog ? `${SafeHourDateTime(selectedLog.datetime, "full")} · Ray ${selectedLog.rayId}` : null}
        title={selectedLog ? `${selectedLog.method} ${selectedLog.host}` : ""}
        badges={selectedLog && <ExecBadge action={selectedLog.action} />}
        footer={
          selectedLog && (
            <>
              <button
                className="cf-btn ghost"
                onClick={() => {
                  setSelectedCountry(selectedLog.country);
                  setSelectedLog(null);
                }}
              >
                Filtrar por este país
              </button>
              <button
                className="cf-btn"
                onClick={() => {
                  setSelectedAction(selectedLog.action);
                  setSelectedLog(null);
                }}
              >
                Filtrar por esta ação
              </button>
            </>
          )
        }
      >
        {selectedLog && (
          <>
            <DetailList
              items={[
                ["IP de origem", selectedLog.clientIP, true],
                [
                  "País",
                  <span key="pais" style={{ display: "inline-flex", alignItems: "center" }}>
                    <Flag name={selectedLog.country} />
                    {selectedLog.country}
                  </span>,
                ],
                ["Host", selectedLog.host, true],
                ["Caminho", selectedLog.path, true],
                ["Método", selectedLog.method, true],
                ["Regra", selectedLog.ruleId, true],
                ["Ray ID", selectedLog.rayId, true],
              ]}
            />
            {selectedLog.userAgent && (
              <DetailSection title="Agente do usuário">
                <div
                  style={{
                    font: "400 12px/1.5 var(--font-data)",
                    background: V.surface2,
                    border: `1px solid ${V.line}`,
                    borderRadius: 8,
                    padding: "8px 10px",
                    color: V.fg2,
                    overflowWrap: "anywhere",
                  }}
                >
                  {selectedLog.userAgent}
                </div>
              </DetailSection>
            )}
          </>
        )}
      </DetailSheet>
    </div>
  );
}
