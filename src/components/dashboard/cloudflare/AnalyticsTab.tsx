import { ModuleLoading } from "@/components/layout/ModuleLoading";
import * as React from "react";
import * as ReactDOM from "react-dom";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  getHttpTrafficAnalytics,
  getHttpTrafficTopStatsByMetric,
  getHttpTrafficGroupedTimeseries,
  listCloudflareZones,
} from "@/lib/cloudflare.functions";
import {
  getSecurityOverview,
  getSecurityTopStats,
  getSecuritySampledLogs,
  type SecuritySampledLog,
  getSecurityAttackAnalysis,
  getSecurityBotAnalysis,
  getSecurityRuleHitsForRay,
  type SecurityRuleHit,
  getSecurityEventsOverview,
  getSecurityEventsTopStats,
  getSecurityEventsSampledLogs,
  type SecurityEventLog,
} from "@/lib/cloudflare.security.functions";
import { WebAnalyticsTab } from "@/components/dashboard/cloudflare/WebAnalyticsTab";
import { LoadBalancingTab } from "@/components/dashboard/cloudflare/LoadBalancingTab";
import {
  HTTP_TRAFFIC_FILTER_FIELDS,
  SECURITY_ANALYTICS_FILTER_FIELDS,
  SECURITY_EVENTS_FILTER_FIELDS,
  type AnalyticsFilterCondition,
  type AnalyticsFilterOp,
  type FilterFieldDef,
} from "@/lib/cloudflare.analytics-filters";
import {
  ChevronsUpDown,
  ChevronDown,
  ChevronRight,
  Check,
  Plus,
  Globe,
  Shield,
  Activity,
  SkipForward,
  Link2,
  X,
  Lock,
  Hash,
  Cpu,
  Database,
  Search,
  Server,
  Network,
  ArrowUpRight,
  ArrowDownRight,
} from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { usePermissions } from "@/lib/use-permissions";
import { useOrganizacao } from "@/lib/use-organizacao";
import { pickDefaultZone } from "@/lib/cloudflare-zones";

// ── Design tokens (mesmos de CloudflareReal.tsx / OperationsTab.tsx) ───────────
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
  neutral: "var(--tl-6b7280, #6B7280)",
  textPrimary: "var(--tl-f1f5f9, #F1F5F9)",
  textSecondary: "var(--tl-f1f5f9, #F1F5F9)",
  textMuted: "var(--tl-f1f5f9, #F1F5F9)",
  chartGrid: "rgba(var(--tl-line-rgb, 30,38,64),0.7)",
  chartAxis: "var(--tl-f1f5f9, #F1F5F9)",
  chartTick: "var(--tl-f1f5f9, #F1F5F9)",
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
const SERIES_PALETTE = [T.accent, T.success, T.warning, T.danger, T.purple];
// Largura da janela flutuante de detalhe de log/evento (Security · Sampled logs).
const LOG_PANEL_WIDTH = 760;

const HTTP_KPI_LABEL: Record<"requests" | "bytes" | "pageViews" | "visits" | "apiRequests", string> = {
  requests: "Requisições",
  bytes: "Data transfer",
  pageViews: "Page views",
  visits: "Visits",
  apiRequests: "API requests",
};

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

  .an-root { font-family:var(--font-ui); color:var(--v2-fg); }
  .an-root * { box-sizing:border-box; }
  .an-root input, .an-root select {
    background:var(--v2-surface-2); border:1px solid var(--v2-line); color:var(--v2-fg);
    font-family:'IBM Plex Mono',monospace; font-size:12px; border-radius:6px; padding:6px 8px;
  }
  .an-root input:focus, .an-root select:focus { outline:none; border-color:rgba(59,130,246,0.5); }
  .an-root select option { background:var(--v2-surface); color:var(--v2-fg); }

  .an-select-trigger { background:var(--v2-surface-2) !important; border:1px solid var(--v2-line) !important; color:var(--v2-fg) !important; font-family:'IBM Plex Mono',monospace !important; font-size:12px !important; height:32px !important; }
  .an-select-content { background:var(--v2-surface) !important; border:1px solid var(--v2-line-strong) !important; color:var(--v2-fg) !important; z-index:1000 !important; }
  .an-select-item { color:var(--v2-fg) !important; font-family:'IBM Plex Mono',monospace !important; font-size:12px !important; cursor:pointer !important; }
  .an-select-item[data-highlighted] { background:var(--v2-hover) !important; color:var(--v2-fg) !important; }

  /* ── Toolbar / sub-nav ── */
  .an-toolbar { display:flex; align-items:flex-end; justify-content:space-between; flex-wrap:wrap; gap:12px; border-bottom:1px solid var(--v2-line); }
  .an-toolbar-group { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding-bottom:8px; }

  .an-subnav { display:flex; align-items:center; gap:4px; flex-wrap:wrap; margin-bottom:-1px; }
  .an-subnav-btn { display:inline-flex; align-items:center; gap:6px; height:36px; padding:0 12px; font-size:13.5px; font-weight:500; border:0; border-bottom:2px solid transparent; cursor:pointer; font-family:var(--font-ui); color:var(--v2-fg-2); background:transparent; }
  .an-subnav-btn.active { color:var(--v2-fg); border-bottom-color:var(--v2-accent); }
  .an-subnav-btn:hover:not(.active):not(:disabled) { color:var(--v2-fg); }
  .an-subnav-btn:disabled { opacity:0.4; cursor:not-allowed; }
  .an-badge-soon { font-size:9px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; padding:1px 6px; border-radius:4px; background:rgba(107,114,128,0.18); color:${T.neutral}; font-family:'IBM Plex Mono',monospace; }

  .an-day-btn { padding:5px 14px; border-radius:6px; font-size:11px; font-weight:600; border:1px solid var(--v2-line); cursor:pointer; font-family:'IBM Plex Mono',monospace; transition:all 0.15s; color:var(--v2-fg-3); background:transparent; letter-spacing:0.04em; }
  .an-day-btn.active { background:${T.accentGlow}; border-color:rgba(59,130,246,0.4); color:${T.accent}; }
  .an-day-btn:hover:not(.active) { border-color:var(--v2-line-strong); color:var(--v2-fg-2); }

  .an-zone-btn { display:inline-flex; align-items:center; justify-content:space-between; gap:8px; padding:5px 12px; border:1px solid var(--v2-line); border-radius:6px; background:var(--v2-surface-2); font-size:11px; color:var(--v2-fg); cursor:pointer; min-width:200px; font-family:var(--font-ui); transition:border-color 0.15s; }
  .an-zone-btn:hover { border-color:var(--v2-line-strong); }

  .an-add-filter-btn { display:inline-flex; align-items:center; gap:6px; height:30px; padding:0 12px; border-radius:8px; font-size:12.5px; font-weight:500; border:1px solid var(--v2-line); cursor:pointer; font-family:var(--font-ui); color:var(--v2-fg); background:var(--v2-surface); }
  .an-add-filter-btn:hover { background:var(--v2-hover); border-color:var(--v2-line-strong); }
  .an-filter-chip { display:inline-flex; align-items:center; gap:6px; height:28px; padding:0 8px 0 10px; border-radius:99px; font-size:12.5px; font-weight:500; border:1px solid color-mix(in oklch, var(--v2-accent) 35%, var(--v2-line)); font-family:var(--font-ui); color:var(--v2-fg); background:color-mix(in oklch, var(--v2-accent) 8%, var(--v2-surface)); }
  .an-filter-chip .close { opacity:0.6; cursor:pointer; display:flex; }
  .an-filter-chip .close:hover { opacity:1; }
  .an-filter-popover { width:auto; padding:14px; display:flex; align-items:flex-end; gap:10px; flex-wrap:wrap; background:var(--v2-surface); border:1px solid var(--v2-line-strong); border-radius:8px; }
  .an-filter-field-label { font-size:12px; font-weight:500;   color:var(--v2-fg-3); font-family:var(--font-ui); }
  .an-filter-field { display:flex; flex-direction:column; gap:5px; min-width:150px; }
  .an-filter-hint { font-size:10px; color:var(--v2-fg-3); font-family:var(--font-ui); }

  /* ── Block card ── */
  .an-block { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; display:flex; flex-direction:column; min-width:200px; min-height:140px; overflow:auto; }
  .an-block-header { display:flex; align-items:center; gap:8px; padding:14px 18px 6px; font-size:14px; font-weight:600; color:var(--v2-fg); font-family:var(--font-ui); flex-wrap:wrap; }
  .an-block-body { flex:1; padding:8px 18px 18px; display:flex; flex-direction:column; }

  /* ── KPI row ── */
  .an-kpi-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(170px,1fr)); width:100%; background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
  .an-kpi { padding:16px 18px 14px; display:flex; flex-direction:column; gap:2px; position:relative; min-width:0; box-shadow:1px 0 0 var(--v2-line), 0 1px 0 var(--v2-line); }
  .an-kpi-label { font-size:12.5px; font-weight:400; color:var(--v2-fg-2); font-family:var(--font-ui); display:flex; align-items:center; gap:6px; }
  .an-kpi-label::before { content:""; width:8px; height:8px; border-radius:2px; background:var(--kc, var(--v2-accent)); flex-shrink:0; }
  .an-kpi-value { font-size:28px; font-weight:600; font-family:var(--font-ui); letter-spacing:-0.02em; line-height:1.25; color:var(--v2-fg); font-variant-numeric:tabular-nums; }
  .an-kpi-spark { height:26px; margin-top:2px; }
  .an-kpi-trend { display:inline-flex; align-items:center; gap:1px; font-size:11px; font-weight:700; font-family:'IBM Plex Mono',monospace; }
  .an-kpi-clickable { cursor:pointer; transition:background 0.15s; }
  .an-kpi-clickable:hover { background:var(--v2-hover); }
  .an-kpi-clickable:focus-visible { outline:2px solid var(--v2-accent); outline-offset:-2px; }
  .an-kpi-clickable.active::after { content:""; position:absolute; left:18px; right:18px; bottom:0; height:2px; border-radius:2px; background:var(--v2-accent); }
  .an-kpi-locked { gap:6px; }
  .an-kpi-locked .an-kpi-label::before { background:var(--v2-line-strong); }
  .an-kpi-locked .an-kpi-value { color:var(--v2-fg-3); font-size:18px; }
  .an-kpi-source-tag { display:inline-flex; align-items:center; gap:4px; font-family:'IBM Plex Mono',monospace; font-size:9px; color:var(--v2-fg-3); background:rgba(107,114,128,0.12); border:1px solid var(--v2-line); border-radius:4px; padding:3px 6px; width:fit-content; }

  /* ── Group tabs (gráfico central) ── */
  .an-group-tabs { display:inline-flex; align-items:center; gap:2px; padding:2px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-surface); flex-wrap:wrap; }
  .an-group-tab { height:26px; padding:0 10px; border-radius:6px; font-size:12.5px; font-weight:500; border:0; cursor:pointer; font-family:var(--font-ui); color:var(--v2-fg-2); background:transparent; }
  .an-group-tab.active { background:var(--v2-surface-2); color:var(--v2-fg); box-shadow:0 0 0 1px var(--v2-line); }
  .an-group-tab:hover:not(.active) { color:var(--v2-fg); }
  .an-live-tag { font-size:11.5px; font-family:var(--font-ui); padding:2px 8px; border-radius:99px; }
  .an-live-tag.live { background:${T.successBg}; color:${T.success}; }
  .an-live-tag.sampled { background:rgba(107,114,128,0.15); color:${T.neutral}; }

  /* ── Top statistics grid ── */
  .an-stats-grid { display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:14px; }
  .an-stat-panel { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; display:flex; flex-direction:column; transition:border-color 0.15s; }
  .an-stat-panel:hover { border-color:var(--v2-line-strong); }
  .an-stat-panel-header { display:flex; align-items:center; gap:8px; padding:14px 16px 6px; font-size:14px; font-weight:600; color:var(--v2-fg); font-family:var(--font-ui); }
  .an-stat-expand { margin-left:auto; background:none; border:none; color:var(--v2-accent); font-size:12px; font-weight:500; cursor:pointer; font-family:var(--font-ui); text-transform:none; letter-spacing:0; padding:2px 4px; }
  .an-stat-expand:hover { text-decoration:underline; }
  .an-stat-panel-body { padding:8px 14px 12px; display:flex; flex-direction:column; gap:2px; min-height:70px; }
  .an-stat-row { position:relative; display:flex; align-items:center; height:30px; cursor:default; border-radius:5px; }
  .an-stat-row.clickable { cursor:pointer; }
  .an-stat-row.clickable:hover { background:var(--v2-hover); }
  .an-stat-row.clickable:hover .an-stat-label { color:var(--v2-fg); text-decoration:underline; }
  .an-stat-row.active { box-shadow:0 0 0 1px color-mix(in oklch, var(--v2-accent) 45%, transparent) inset; }
  .an-stat-bar { position:absolute; left:0; top:2px; bottom:2px; background:color-mix(in oklch, var(--v2-accent) 13%, transparent); border-radius:4px; z-index:0; }
  .an-stat-label { position:relative; z-index:1; font-size:12.5px; color:var(--v2-fg); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; padding-left:10px; font-family:'IBM Plex Mono',monospace; }
  .an-stat-count { position:relative; z-index:1; font-size:11.5px; font-weight:600; color:var(--v2-fg-2); font-family:'IBM Plex Mono',monospace; padding-left:10px; padding-right:2px; }
  .an-empty-mini { font-size:12px; color:var(--v2-fg-3); padding:10px 4px; font-family:var(--font-ui); }

  /* ── Table (sample logs) ── */
  .an-table { width:100%; border-collapse:collapse; }
  .an-table th { padding:8px 10px; font-size:12px; font-weight:500; color:var(--v2-fg-3); font-family:var(--font-ui); text-align:left; border-bottom:1px solid var(--v2-line); white-space:nowrap; }
  .an-table td { padding:8px 10px; border-bottom:1px solid var(--v2-line); font-size:12.5px; color:var(--v2-fg); vertical-align:middle; }
  .an-table tbody tr:hover td { background:var(--v2-hover); }
  .an-table tbody tr:last-child td { border-bottom:none; }
  .an-table .mono { font-family:var(--font-data); font-size:12px; }
  .an-table .dim { color:var(--v2-fg); }
  .an-table .right { text-align:right; }
  .an-log-detail { background:var(--v2-surface-2); padding:14px 18px; font-size:12.5px; line-height:1.7; font-family:'IBM Plex Mono',monospace; color:var(--v2-fg-3); display:grid; grid-template-columns:repeat(auto-fit, minmax(240px,1fr)); gap:14px 28px; border-radius:8px; }
  .an-log-detail-title { font-size:10.5px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:var(--v2-fg); font-family:'IBM Plex Mono',monospace; margin-bottom:8px; }
  .an-row-open > td { background:color-mix(in oklch, var(--v2-accent) 8%, transparent) !important; }
  .an-row-open > td:first-child { box-shadow: inset 3px 0 0 var(--v2-accent); }
  .an-log-panel { position:fixed; width:${LOG_PANEL_WIDTH}px; max-width:94vw; max-height:80vh; overflow-y:auto; background:var(--v2-surface); border:1px solid var(--v2-line-strong); border-radius:12px; box-shadow:0 20px 48px rgba(0,0,0,0.55); color:var(--v2-fg); }
  .an-log-panel-header { display:flex; align-items:center; justify-content:space-between; padding:14px 20px; border-bottom:1px solid var(--v2-line); position:sticky; top:0; background:var(--v2-surface); border-radius:12px 12px 0 0; cursor:move; user-select:none; touch-action:none; }
  .an-log-panel-title { font-family:var(--font-ui); font-weight:700; font-size:15px; color:var(--v2-fg); }
  .an-log-panel-close { background:transparent; border:none; color:var(--v2-fg-3); cursor:pointer; padding:6px; border-radius:6px; display:flex; align-items:center; justify-content:center; }
  .an-log-panel-close:hover { background:rgba(var(--tl-ink, 255,255,255),0.08); color:var(--v2-fg); }
  .an-log-panel-body { padding:18px 20px 22px; display:flex; flex-direction:column; gap:18px; }
  .an-related-events-btn { background:var(--v2-surface); border:1px solid var(--v2-line); color:var(--v2-fg); font-size:12.5px; font-weight:500; padding:0 12px; height:30px; border-radius:8px; cursor:pointer; font-family:var(--font-ui); }
  .an-related-events-btn:hover { background:var(--v2-hover); }
  .an-rule-hit-card { border:1px solid var(--v2-line); border-radius:8px; padding:10px 12px; background:var(--v2-surface-2); }
  .an-log-detail b { color:var(--v2-fg); font-weight:600; }
  .an-pagination { display:flex; align-items:center; justify-content:space-between; padding:10px 12px; border-top:1px solid var(--v2-line); font-size:12.5px; color:var(--v2-fg-3); font-family:var(--font-ui); }
  .an-page-btn { height:28px; padding:0 10px; border-radius:6px; border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-fg); cursor:pointer; font-size:12.5px; }
  .an-page-btn:hover:not(:disabled) { background:var(--v2-hover); }
  .an-page-btn:disabled { opacity:0.35; cursor:not-allowed; }

  /* ── Badge ── */
  .an-badge { display:inline-flex; align-items:center; gap:3px; padding:2px 7px; border-radius:4px; font-size:12px; font-weight:500;   font-family:var(--font-ui); white-space:nowrap; }
  .an-badge-dot { width:5px; height:5px; border-radius:50%; flex-shrink:0; }

  /* ── Loading / Error / Empty states ── */
  .an-state-box { padding:32px 24px; background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; display:flex; flex-direction:column; align-items:center; gap:10px; text-align:center; }
  .an-state-icon { width:40px; height:40px; border-radius:8px; display:flex; align-items:center; justify-content:center; }
  .an-empty { padding:28px 16px; text-align:center; color:var(--v2-fg-3); font-size:12px; font-family:var(--font-ui); }
  .an-hint-box { padding:10px 14px; background:var(--v2-surface-2); border:1px solid var(--v2-line); border-radius:8px; font-size:12.5px; color:var(--v2-fg-2); font-family:var(--font-ui); }

  @keyframes an-spin { to{transform:rotate(360deg)} }
  .an-spin { animation:an-spin 0.8s linear infinite; }

  /* ── Scrollbar ── */
  .an-root ::-webkit-scrollbar { width:4px; height:4px; }
  .an-root ::-webkit-scrollbar-track { background:transparent; }
  .an-root ::-webkit-scrollbar-thumb { background:var(--v2-line-strong); border-radius:2px; }

  /* ── Tooltip (recharts) ── */
  .an-tip { background:var(--v2-surface); border:1px solid var(--v2-line-strong); border-radius:8px; padding:10px 14px; font-family:var(--font-ui); box-shadow:0 20px 40px rgba(0,0,0,0.5); min-width:150px; }
  .an-tip-label { font-size:12px; font-family:var(--font-ui); color:var(--v2-fg-3);   margin-bottom:6px; }
  .an-tip-row { display:flex; align-items:center; gap:6px; font-size:12px; margin-bottom:3px; }
  .an-tip-dot { width:7px; height:7px; border-radius:2px; flex-shrink:0; }
  .an-tip-name { color:var(--v2-fg-2); font-size:11px; max-width:160px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .an-tip-val { color:var(--v2-fg); font-weight:600; font-family:'IBM Plex Mono',monospace; margin-left:auto; }

  .recharts-legend-item-text { color:var(--v2-fg-2) !important; font-size:11px; font-family:'IBM Plex Mono',monospace; }
  .recharts-cartesian-axis-tick-value { fill:${T.chartTick} !important; font-size:10px; font-family:'IBM Plex Mono',monospace; }
  .recharts-text { fill:${T.chartTick} !important; }
`;

// ── Utilities ──────────────────────────────────────────────────────────────────
function getFlagUrl(countryInput: string) {
  if (!countryInput) return "https://flagcdn.com/w40/un.png";
  if (countryInput.length === 2) return `https://flagcdn.com/w40/${countryInput.toLowerCase()}.png`;
  const iso = COUNTRY_ISO[countryInput]?.toLowerCase();
  return iso ? `https://flagcdn.com/w40/${iso}.png` : "https://flagcdn.com/w40/un.png";
}

function fmtNum(n: number) {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("pt-BR");
}

function fmtBytes(bytes: number) {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

function SafeHourDateTime(iso: string, formatType: "hour" | "full") {
  if (!iso) return "";
  const d = new Date(iso);
  // "hour" alimenta o eixo X do gráfico — só a hora, pra não poluir o eixo
  // com a data repetida em cada tick (a data completa já aparece no tooltip).
  return formatType === "hour"
    ? d.toLocaleString("pt-BR", { hour: "2-digit", minute: "2-digit" })
    : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function ExecBadge({ action }: { action: string }) {
  const tone = ACTION_TONE[(action || "").toLowerCase()] ?? "accent";
  const col = ACTION_COLOR[tone];
  return (
    <span className="an-badge" style={{ background: col.bg, color: col.color, border: `1px solid ${col.border}` }}>
      <span className="an-badge-dot" style={{ background: col.color }} />
      {action || "LOG"}
    </span>
  );
}

function GenericTooltip({ active, payload, label, valueFormatter }: any) {
  if (!active || !payload?.length) return null;
  const fmt = valueFormatter ?? fmtNum;
  return (
    <div className="an-tip">
      <div className="an-tip-label">{SafeHourDateTime(String(label), "full")}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="an-tip-row">
          <div className="an-tip-dot" style={{ background: p.color }} />
          <span className="an-tip-name">{p.name}</span>
          <span className="an-tip-val">{fmt(Number(p.value))}</span>
        </div>
      ))}
    </div>
  );
}

// Cabeçalho de bloco no padrão v2: só o título (o ícone recebido não é mais exibido)
function BlockHeader({
  title,
  right,
}: {
  icon?: React.ElementType;
  title: string;
  right?: React.ReactNode;
}) {
  return (
    <div className="an-block-header">
      <span>{title}</span>
      {right && <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>{right}</div>}
    </div>
  );
}

// Seta de tendência (mesmo padrão da aba Web Analytics). `invert`: pra métricas
// onde subir é ruim (nenhuma no HTTP Traffic hoje, mas mantém a API simétrica).
function TrendTag({ pct, invert = false }: { pct: number; invert?: boolean }) {
  const down = pct < 0;
  const isGood = invert ? down : !down;
  const color = isGood ? T.success : T.danger;
  return (
    <span className="an-kpi-trend" style={{ color }}>
      {down ? <ArrowDownRight size={12} /> : <ArrowUpRight size={12} />}
      {Math.abs(pct).toFixed(2)}%
    </span>
  );
}

// ── KPI com sparkline ────────────────────────────────────────────────────────
function KpiCard({
  label,
  value,
  color,
  sparkData,
  sparkKey,
  onClick,
  active,
  deltaPct,
  invert,
  clickHint,
}: {
  label: string;
  value: string;
  color: string;
  sparkData?: Array<Record<string, any>>;
  sparkKey?: string;
  onClick?: () => void;
  active?: boolean;
  deltaPct?: number | null;
  invert?: boolean;
  clickHint?: string;
}) {
  return (
    <div
      className={`an-kpi${onClick ? " an-kpi-clickable" : ""}${active ? " active" : ""}`}
      style={{ "--kc": color } as React.CSSProperties}
      onClick={onClick}
      onKeyDown={onClick ? (e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), onClick()) : undefined}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      aria-pressed={onClick ? !!active : undefined}
      title={onClick ? (clickHint ?? "Clique para usar essa métrica no gráfico central") : undefined}
    >
      <span className="an-kpi-label">{label}</span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
        <span className="an-kpi-value">{value}</span>
        {deltaPct != null && <TrendTag pct={deltaPct} invert={invert} />}
      </div>
      {sparkData && sparkKey && sparkData.length > 1 && (
        <div className="an-kpi-spark">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={sparkData} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
              <Area
                type="monotone"
                dataKey={sparkKey}
                stroke={color}
                fill={color}
                fillOpacity={0.15}
                strokeWidth={1.5}
                dot={false}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

// KPI cujo dado depende de outro produto Cloudflare que ainda não integramos
// (Web Analytics/RUM, API Gateway) — mostra a origem em vez de inventar número.
function LockedKpiCard({ label, source }: { label: string; source: string }) {
  return (
    <div className="an-kpi an-kpi-locked">
      <span className="an-kpi-label">{label}</span>
      <span className="an-kpi-value">—</span>
      <span className="an-kpi-source-tag">
        <Lock size={9} />
        {source}
      </span>
    </div>
  );
}

// ── Painel compacto de "Top statistics" ────────────────────────────────────────
function StatPanel({
  title,
  icon: Icon,
  rows,
  onRowClick,
  emptyHint,
  valueFormatter = fmtNum,
}: {
  title: string;
  icon: React.ElementType;
  rows: Array<{ value: string; requests: number }>;
  onRowClick?: (value: string) => void;
  emptyHint?: string;
  // "requests" carrega bytes (não contagem) quando o KPI ativo é Data transfer —
  // ver activeHttpKpi/HTTP_ZONE_METRIC_FILTER. Formatter plugável pra exibir do
  // jeito certo em cada caso, sem duplicar o componente inteiro.
  valueFormatter?: (n: number) => string;
}) {
  const [expanded, setExpanded] = React.useState(false);
  const shown = expanded ? rows.slice(0, 25) : rows.slice(0, 5);
  const max = Math.max(1, ...rows.map((r) => r.requests));
  return (
    <div className="an-stat-panel">
      <div className="an-stat-panel-header">
        <Icon size={11} color={T.textMuted} />
        <span>{title}</span>
        {rows.length > 5 && (
          <button className="an-stat-expand" onClick={() => setExpanded((e) => !e)}>
            {expanded ? "menos" : `+${Math.min(rows.length, 25) - 5}`}
          </button>
        )}
      </div>
      <div className="an-stat-panel-body">
        {shown.length === 0 ? (
          <div className="an-empty-mini">{emptyHint ?? "Sem dados no período."}</div>
        ) : (
          shown.map((r, i) => (
            <div
              key={i}
              className={`an-stat-row${onRowClick ? " clickable" : ""}`}
              onClick={() => onRowClick?.(r.value)}
              title={r.value}
            >
              <div className="an-stat-bar" style={{ width: `${Math.max(4, (r.requests / max) * 100)}%` }} />
              <span className="an-stat-label">{r.value}</span>
              <span className="an-stat-count">{valueFormatter(r.requests)}</span>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

// ── Filtro composável ("+ Add filter") ─────────────────────────────────────────
function FilterBar({
  fields,
  filters,
  onChange,
  isLive,
}: {
  fields: Record<string, FilterFieldDef>;
  filters: AnalyticsFilterCondition[];
  onChange: (next: AnalyticsFilterCondition[]) => void;
  isLive: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [fieldKey, setFieldKey] = React.useState("");
  const [op, setOp] = React.useState<AnalyticsFilterOp>("eq");
  const [value, setValue] = React.useState("");
  const def = fieldKey ? fields[fieldKey] : null;

  function addFilter() {
    if (!def || !value.trim()) return;
    const v = def.valueType === "number" ? Number(value) : value.trim();
    onChange([...filters, { field: def.key, op, value: v }]);
    setFieldKey("");
    setValue("");
    setOp("eq");
    setOpen(false);
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button className="an-add-filter-btn">
            <Plus size={12} /> Add filter
          </button>
        </PopoverTrigger>
        <PopoverContent className="an-filter-popover" align="start">
          <div className="an-filter-field">
            <span className="an-filter-field-label">Campo</span>
            <Select
              value={fieldKey || undefined}
              onValueChange={(v) => {
                setFieldKey(v);
                setOp("eq");
              }}
            >
              <SelectTrigger className="an-select-trigger">
                <SelectValue placeholder="Selecione…" />
              </SelectTrigger>
              <SelectContent className="an-select-content">
                {Object.values(fields).map((f) => {
                  const disabled = !isLive && !f.pgColumn;
                  return (
                    <SelectItem key={f.key} value={f.key} disabled={disabled} className="an-select-item">
                      {f.label}
                      {disabled ? " (só na janela ao vivo)" : ""}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
          </div>
          {def && (
            <>
              <div className="an-filter-field">
                <span className="an-filter-field-label">Operador</span>
                <Select value={op} onValueChange={(v) => setOp(v as AnalyticsFilterOp)}>
                  <SelectTrigger className="an-select-trigger">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="an-select-content">
                    {def.ops.map((o) => (
                      <SelectItem key={o} value={o} className="an-select-item">
                        {o === "eq" ? "é" : o === "neq" ? "não é" : "está em (lista)"}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="an-filter-field">
                <span className="an-filter-field-label">Valor</span>
                <input
                  type={def.valueType === "number" ? "number" : "text"}
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addFilter()}
                  placeholder={def.valueType === "number" ? "ex.: 404" : "ex.: www.exemplo.com"}
                />
              </div>
              <button className="an-add-filter-btn" onClick={addFilter}>
                <Check size={12} /> Adicionar
              </button>
            </>
          )}
        </PopoverContent>
      </Popover>
      {filters.map((c, i) => (
        <span key={i} className="an-filter-chip">
          {fields[c.field]?.label ?? c.field} {c.op === "eq" ? "=" : c.op === "neq" ? "≠" : "∈"}{" "}
          {Array.isArray(c.value) ? c.value.join(", ") : String(c.value)}
          <span className="close" onClick={() => onChange(filters.filter((_, j) => j !== i))}>
            <X size={10} />
          </span>
        </span>
      ))}
    </div>
  );
}

// ── Zone picker (compartilhado pelas duas seções) ──────────────────────────────
function ZonePicker({
  zones,
  zoneId,
  onChange,
}: {
  zones: Array<{ id: string; name: string }>;
  zoneId: string | null;
  onChange: (id: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = zones.find((z) => z.id === zoneId) || null;
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button className="an-zone-btn" role="combobox" aria-expanded={open}>
          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {selected ? selected.name : "Todas as zonas"}
          </span>
          <ChevronsUpDown size={12} color={T.textMuted} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        style={{
          width: 300,
          padding: 0,
          background: V2.surface,
          border: `1px solid ${V2.borderHi}`,
          borderRadius: 8,
          boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
        }}
        align="start"
      >
        <Command style={{ background: "transparent" }}>
          <CommandInput placeholder="Buscar zona…" style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 }} />
          <CommandList>
            <CommandEmpty style={{ color: V2.textMuted, fontSize: 12, padding: 12 }}>
              Nenhuma zona encontrada.
            </CommandEmpty>
            <CommandGroup>
              {zones.map((z) => (
                <CommandItem
                  key={z.id}
                  value={z.name}
                  onSelect={() => {
                    onChange(z.id);
                    setOpen(false);
                  }}
                  style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: V2.textPrimary }}
                >
                  <Check size={14} style={{ opacity: zoneId === z.id ? 1 : 0, color: T.success }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{z.name}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// ── Sub-nav ────────────────────────────────────────────────────────────────────
type Section = "web" | "http" | "network" | "security";
const SECTIONS: Array<{ id: Section; label: string; comingSoon?: boolean }> = [
  { id: "web", label: "Web Analytics" },
  { id: "http", label: "HTTP Traffic" },
  { id: "network", label: "Load Balancing" },
  { id: "security", label: "Security" },
];

const axisProps = {
  stroke: T.chartAxis,
  fontSize: 10,
  tick: { fill: T.chartTick, fontFamily: "'IBM Plex Mono',monospace" },
  tickLine: false,
  axisLine: { stroke: T.chartAxis },
};

// ── Security · Events — mapeamento de rótulo/cor por action e por source ──────
// Cloudflare devolve o valor "cru" (action/source); rótulo e cor são só
// apresentação, os nomes conhecidos batem com o painel nativo (prints).
const EVENT_ACTION_LABELS: Record<string, string> = {
  skip: "Skip",
  block: "Block",
  challenge: "Interactive Challenge",
  jschallenge: "Non-Interactive Challenge",
  managed_challenge: "Managed Challenge",
  log: "Log",
  simulate: "Simulate",
  connection_close: "Connection Close",
  allow: "Allow",
};
const EVENT_ACTION_COLORS: Record<string, string> = {
  skip: "#EAB308",
  block: T.accent,
  challenge: T.danger,
  jschallenge: "#F97316",
  managed_challenge: T.purple,
  log: T.neutral,
  simulate: T.success,
  connection_close: T.danger,
  allow: T.success,
};
const EVENT_ACTION_FALLBACK_PALETTE = [T.accent, T.success, T.warning, T.danger, T.purple, "#EAB308", "#F97316"];
function eventActionLabel(action: string): string {
  return EVENT_ACTION_LABELS[action] ?? action.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function eventActionColor(action: string, idx: number): string {
  return EVENT_ACTION_COLORS[action] ?? EVENT_ACTION_FALLBACK_PALETTE[idx % EVENT_ACTION_FALLBACK_PALETTE.length];
}
const EVENT_SERVICE_META: Record<string, { label: string; color: string }> = {
  firewallrules: { label: "Custom rules", color: T.accent },
  firewallCustom: { label: "Custom rules", color: T.accent },
  firewallManaged: { label: "Managed rules", color: "#EAB308" },
  ratelimit: { label: "Rate limiting rules", color: T.purple },
  l7ddos: { label: "HTTP DDoS rules", color: T.danger },
  waf: { label: "Managed rules", color: "#EAB308" },
  sdd: { label: "Sensitive Data Detection", color: T.success },
  dlp: { label: "Sensitive Data Detection", color: T.success },
};
function eventServiceLabel(source: string): string {
  return EVENT_SERVICE_META[source]?.label ?? source;
}

// ── Security · Request activity → Attack analysis — rótulo/cor por wafAttackScoreClass ──
// Valor "cru" vem sempre da própria API (getSecurityAttackAnalysis); rótulo e
// cor são só apresentação — chute educado nos nomes conhecidos (batendo com
// os prints), com fallback pra não quebrar se algum vier diferente.
const ATTACK_SCORE_LABELS: Record<string, string> = {
  attack: "Exploit",
  likely_attack: "Likely an exploit",
  unlikely_attack: "Unlikely an exploit",
  unknown: "Not an exploit",
  not_scored: "Not scored",
};
const ATTACK_SCORE_COLORS: Record<string, string> = {
  attack: "var(--tl-7f1d1d, #7F1D1D)",
  likely_attack: "#F87171",
  unlikely_attack: "#22C55E",
  unknown: "var(--tl-14532d, #14532D)",
  not_scored: "var(--tl-9ca3af, #9CA3AF)",
};
const ATTACK_SCORE_ORDER = ["attack", "likely_attack", "unlikely_attack", "unknown", "not_scored"];
function attackScoreLabel(score: string): string {
  return ATTACK_SCORE_LABELS[score] ?? score.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function attackScoreColor(score: string, idx: number): string {
  return ATTACK_SCORE_COLORS[score] ?? EVENT_ACTION_FALLBACK_PALETTE[idx % EVENT_ACTION_FALLBACK_PALETTE.length];
}
function sortByOrder<T, K extends keyof T>(items: T[], order: string[], key: K): T[] {
  return [...items].sort((a, b) => {
    const ia = order.indexOf(String(a[key]));
    const ib = order.indexOf(String(b[key]));
    if (ia === -1 && ib === -1) return 0;
    if (ia === -1) return 1;
    if (ib === -1) return -1;
    return ia - ib;
  });
}

// ── Security · Request activity → Bot analysis — rótulo/cor por botManagementDecision ──
// Mesma lógica: valor cru vem sempre da própria API (getSecurityBotAnalysis).
const BOT_DECISION_LABELS: Record<string, string> = {
  automated: "Automated",
  likely_automated: "Likely automated",
  likely_human: "Likely human",
  verified_bot: "Verified bot",
};
const BOT_DECISION_COLORS: Record<string, string> = {
  automated: "#A16207",
  likely_automated: "var(--tl-7f1d1d, #7F1D1D)",
  likely_human: "#22C55E",
  verified_bot: "var(--tl-14532d, #14532D)",
};
const BOT_DECISION_ORDER = ["automated", "likely_automated", "likely_human", "verified_bot"];
function botDecisionLabel(decision: string): string {
  return BOT_DECISION_LABELS[decision] ?? decision.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function botDecisionColor(decision: string, idx: number): string {
  return BOT_DECISION_COLORS[decision] ?? EVENT_ACTION_FALLBACK_PALETTE[idx % EVENT_ACTION_FALLBACK_PALETTE.length];
}
const BOT_SOURCE_META: Record<string, { label: string; color: string }> = {
  machine_learning: { label: "Machine learning", color: "#1D4ED8" },
  not_computed: { label: "Not computed", color: "var(--tl-9ca3af, #9CA3AF)" },
  heuristics: { label: "Heuristics", color: "#EC4899" },
  verified_bot: { label: "Verified bot", color: "#38BDF8" },
  javascript_detections: { label: "JavaScript detections", color: "var(--tl-312e81, #312E81)" },
};
function botSourceLabel(source: string): string {
  return BOT_SOURCE_META[source]?.label ?? source.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
function botSourceColor(source: string, idx: number): string {
  return BOT_SOURCE_META[source]?.color ?? EVENT_ACTION_FALLBACK_PALETTE[idx % EVENT_ACTION_FALLBACK_PALETTE.length];
}

// ── "Ver eventos de segurança relacionados" (botão do Edge response) ──────────
// O log de Traffic (httpRequestsAdaptive) não tem ruleId/ruleset — busca sob
// demanda (só quando clicado) no dataset de firewall pelo mesmo Ray ID, pra
// mostrar qual regra (custom/managed/rate limit) bateu nessa requisição.
function RelatedSecurityEventsButton({
  zoneId,
  days,
  rayName,
}: {
  zoneId: string | null;
  days: number;
  rayName: string;
}) {
  const [open, setOpen] = React.useState(false);
  const fetchHits = useServerFn(getSecurityRuleHitsForRay);
  const { data, isFetching } = useQuery({
    queryKey: ["cloudflare-security-rule-hits", zoneId, days, rayName],
    enabled: open && !!rayName,
    queryFn: () => fetchHits({ data: { zoneId, days, rayName } }),
  });
  const ok = (data as any)?.ok === true;
  const hits: SecurityRuleHit[] = ok ? (data as any).hits : [];
  const errorMsg = !ok && data ? (data as any).error : null;

  return (
    <div>
      <button className="an-related-events-btn" onClick={() => setOpen((o) => !o)}>
        {open ? "Ocultar" : "Ver"} eventos de segurança relacionados
      </button>
      {open && (
        <div style={{ marginTop: 8, display: "flex", flexDirection: "column", gap: 8 }}>
          {isFetching ? (
            <span style={{ fontSize: 11, color: V2.textMuted }}>Carregando…</span>
          ) : errorMsg ? (
            <span style={{ fontSize: 11, color: T.danger }}>{errorMsg}</span>
          ) : hits.length === 0 ? (
            <span style={{ fontSize: 11, color: V2.textMuted }}>Nenhuma regra de firewall bateu nesse Ray ID.</span>
          ) : (
            hits.map((h, i) => (
              <div key={i} className="an-rule-hit-card">
                <div style={{ fontSize: 12, fontWeight: 700, color: V2.textPrimary, textTransform: "capitalize" }}>
                  {h.action} · {eventServiceLabel(h.source)}
                </div>
                {h.rulesetId && (
                  <div style={{ fontSize: 11, color: V2.textMuted, marginTop: 6 }}>
                    Ruleset{" "}
                    <span style={{ color: V2.textSecondary, fontFamily: "'IBM Plex Mono',monospace" }}>
                      {h.rulesetId}
                    </span>
                  </div>
                )}
                <div style={{ fontSize: 11, color: V2.textMuted, marginTop: 4 }}>
                  Rule <span style={{ color: V2.textSecondary }}>{h.description || h.ruleId}</span>
                </div>
                {h.description && h.ruleId && h.ruleId !== h.description && (
                  <div
                    style={{ fontSize: 10, color: V2.textMuted, fontFamily: "'IBM Plex Mono',monospace", marginTop: 2 }}
                  >
                    {h.ruleId}
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Janela flutuante e arrastável de detalhe de log/evento ─────────────────────
// Em vez de popover ancorado (empilhava uma janela em cima da outra quando
// mais de uma ficava aberta): posição livre, arrastável pelo cabeçalho, só
// fecha pelo X.
type LogPanelState<T> = { log: T; x: number; y: number; z: number };
function initialPanelPos(e: React.MouseEvent): { x: number; y: number } {
  const x = Math.min(Math.max(8, e.clientX + 16), window.innerWidth - LOG_PANEL_WIDTH - 8);
  const y = Math.min(Math.max(8, e.clientY - 40), window.innerHeight - 160);
  return { x, y };
}

function DraggableLogPanel({
  title,
  x,
  y,
  z,
  onClose,
  onFocus,
  onMove,
  children,
}: {
  title: string;
  x: number;
  y: number;
  z: number;
  onClose: () => void;
  onFocus: () => void;
  onMove: (x: number, y: number) => void;
  children: React.ReactNode;
}) {
  const dragRef = React.useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null);

  function onHeaderPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    onFocus();
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: x, origY: y };
  }
  function onHeaderPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const dx = e.clientX - dragRef.current.startX;
    const dy = e.clientY - dragRef.current.startY;
    onMove(dragRef.current.origX + dx, dragRef.current.origY + dy);
  }
  function onHeaderPointerUp() {
    dragRef.current = null;
  }

  return ReactDOM.createPortal(
    <div className="an-log-panel" style={{ left: x, top: y, zIndex: z }} onMouseDown={onFocus}>
      <div
        className="an-log-panel-header"
        onPointerDown={onHeaderPointerDown}
        onPointerMove={onHeaderPointerMove}
        onPointerUp={onHeaderPointerUp}
      >
        <span className="an-log-panel-title">{title}</span>
        <button className="an-log-panel-close" onPointerDown={(e) => e.stopPropagation()} onClick={onClose}>
          <X size={14} />
        </button>
      </div>
      <div className="an-log-panel-body">{children}</div>
    </div>,
    document.body,
  );
}

const HTTP_GROUP_TABS = [
  { key: "all", label: "All" },
  { key: "host", label: "Host" },
  { key: "path", label: "Path" },
  { key: "country", label: "Country" },
  { key: "statusCodeEdge", label: "Status Code" },
];

// ══════════════════════════════════════════════════════════════════════════════
// AnalyticsTab
// ══════════════════════════════════════════════════════════════════════════════
// zoneId/days vêm da barra do módulo (compartilhados com o Dashboard). Sem eles,
// a aba mantém os próprios seletores, como antes.
export function AnalyticsTab({ zoneId: sharedZoneId, days: sharedDays }: { zoneId?: string | null; days?: number } = {}) {
  const org = useOrganizacao();
  const { can, isModuleAdmin, isAdmin } = usePermissions();
  const canHttp = isAdmin || isModuleAdmin("cloudflare-waf") || can("cloudflare-waf", "view_analytics_http");
  const canSecurity = isAdmin || isModuleAdmin("cloudflare-waf") || can("cloudflare-waf", "view_analytics_security");
  const canWeb = isAdmin || isModuleAdmin("cloudflare-waf") || can("cloudflare-waf", "view_analytics_web");
  const canNetwork =
    isAdmin || isModuleAdmin("cloudflare-waf") || can("cloudflare-waf", "view_analytics_loadbalancing");

  const [activeSection, setActiveSection] = React.useState<Section>(() => (canHttp ? "http" : "security"));
  React.useEffect(() => {
    if (activeSection === "http" && !canHttp && canSecurity) setActiveSection("security");
    else if (activeSection === "security" && !canSecurity && canHttp) setActiveSection("http");
  }, [canHttp, canSecurity, activeSection]);

  const shared = sharedZoneId !== undefined;
  const [ownDays, setDays] = React.useState(1);
  const days = sharedDays ?? ownDays;
  const [ownZoneId, setZoneId] = React.useState<string | null>(() => {
    try {
      return localStorage.getItem("cloudflare_selected_zone") || null;
    } catch {
      return null;
    }
  });
  const zoneId = shared ? sharedZoneId : ownZoneId;
  const isLiveWindow = !!(zoneId && days <= 4);

  const [httpFilters, setHttpFilters] = React.useState<AnalyticsFilterCondition[]>([]);
  const [httpGroupDim, setHttpGroupDim] = React.useState("all");
  // Clicar no KPI "Requisições"/"Data transfer" troca a métrica do gráfico
  // central (só faz sentido na aba "All" — trocar de métrica junto com um
  // agrupamento por dimensão exigiria contar bytes por host/path, que não
  // temos hoje, por isso o clique também volta o agrupamento pra "All").
  const [httpMetric, setHttpMetric] = React.useState<"requests" | "bytes">("requests");
  // Qual KPI está "ativo" pro Top Statistics reagir (os 5 cards, não só os 2 que
  // trocam o gráfico) — Page views/Visits/API requests recortam o mesmo grid de
  // dimensões pela métrica (ver getHttpTrafficTopStatsByMetric), sem mexer no
  // gráfico central (que continua mostrando Requisições/Data transfer).
  const [activeHttpKpi, setActiveHttpKpi] = React.useState<
    "requests" | "bytes" | "pageViews" | "visits" | "apiRequests"
  >("requests");
  const [securityFilters, setSecurityFilters] = React.useState<AnalyticsFilterCondition[]>([]);
  // "Traffic"/"Events" (só Traffic tem query confirmada) e, dentro dele,
  // "Traffic analysis"/"Attack analysis"/"Bot analysis" (só Traffic analysis
  // tem query confirmada — os outros 2 ficam "em breve").
  const [securityTab, setSecurityTab] = React.useState<"traffic" | "events">("traffic");
  const [requestActivityTab, setRequestActivityTab] = React.useState<"traffic" | "attack" | "bot">("traffic");
  const [eventsFilters, setEventsFilters] = React.useState<AnalyticsFilterCondition[]>([]);
  // KPI clicado (Total/Mitigated/Served CF/Served origin) — recorta Top
  // Statistics e Sampled Logs pelo mesmo filtro da série do gráfico.
  const [activeSecurityKpi, setActiveSecurityKpi] = React.useState<
    "total" | "mitigatedByWaf" | "servedByCloudflare" | "servedByOrigin"
  >("total");
  // KPI/legenda clicado em Request activity → Attack analysis (valor cru de
  // wafAttackScoreClass, null = Total) — recorta os MESMOS Top statistics e
  // Sampled logs de "Traffic analysis" (via `wafScore`), igual ao padrão do
  // activeSecurityKpi acima.
  const [activeAttackScore, setActiveAttackScore] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (requestActivityTab !== "attack") setActiveAttackScore(null);
  }, [requestActivityTab]);
  // Mesma ideia, pra Request activity → Bot analysis (valor cru de
  // botManagementDecision).
  const [activeBotDecision, setActiveBotDecision] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (requestActivityTab !== "bot") setActiveBotDecision(null);
  }, [requestActivityTab]);
  const [logsPage, setLogsPage] = React.useState(1);
  const [eventsLogsPage, setEventsLogsPage] = React.useState(1);
  // Detalhe do log/evento clicado — abre numa janela flutuante e arrastável
  // (não um popover ancorado), pra não escurecer o fundo e não empilhar uma
  // em cima da outra quando várias ficam abertas ao mesmo tempo. Chave é o
  // Ray ID (rayName), único por requisição/evento — sobrevive à paginação.
  // Base bem acima de qualquer z-index já usado na página (sticky thead=20,
  // dropdown do Select=1000) pra nunca nascer atrás de nada, mesmo antes de
  // ganhar foco (ex.: arrastar sem antes clicar em cima).
  const zPanelCounter = React.useRef(2000);
  function nextPanelZ() {
    zPanelCounter.current += 1;
    return zPanelCounter.current;
  }
  const [secLogPanels, setSecLogPanels] = React.useState<Record<string, LogPanelState<SecuritySampledLog>>>({});
  const [eventLogPanels, setEventLogPanels] = React.useState<Record<string, LogPanelState<SecurityEventLog>>>({});
  function openSecLogPanel(l: SecuritySampledLog, e: React.MouseEvent) {
    const key = l.rayName || `${l.datetime}-${l.clientIP}`;
    if (secLogPanels[key]) return;
    setSecLogPanels((prev) => ({ ...prev, [key]: { log: l, ...initialPanelPos(e), z: nextPanelZ() } }));
  }
  function closeSecLogPanel(key: string) {
    setSecLogPanels((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }
  function moveSecLogPanel(key: string, x: number, y: number) {
    setSecLogPanels((prev) => (prev[key] ? { ...prev, [key]: { ...prev[key], x, y } } : prev));
  }
  function focusSecLogPanel(key: string) {
    setSecLogPanels((prev) => (prev[key] ? { ...prev, [key]: { ...prev[key], z: nextPanelZ() } } : prev));
  }
  function openEventLogPanel(l: SecurityEventLog, e: React.MouseEvent) {
    const key = l.rayName || `${l.datetime}-${l.clientIP}`;
    if (eventLogPanels[key]) return;
    setEventLogPanels((prev) => ({ ...prev, [key]: { log: l, ...initialPanelPos(e), z: nextPanelZ() } }));
  }
  function closeEventLogPanel(key: string) {
    setEventLogPanels((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }
  function moveEventLogPanel(key: string, x: number, y: number) {
    setEventLogPanels((prev) => (prev[key] ? { ...prev, [key]: { ...prev[key], x, y } } : prev));
  }
  function focusEventLogPanel(key: string) {
    setEventLogPanels((prev) => (prev[key] ? { ...prev, [key]: { ...prev[key], z: nextPanelZ() } } : prev));
  }
  const LOGS_PAGE_SIZE = 10;

  const fetchZones = useServerFn(listCloudflareZones);
  const { data: zonesData } = useQuery({
    queryKey: ["cloudflare-zones-list"],
    queryFn: () => fetchZones(),
  });
  const zones = ((zonesData as any)?.zones ?? []) as Array<{ id: string; name: string; status: string | null }>;

  function persistZone(id: string) {
    setZoneId(id);
    try {
      localStorage.setItem("cloudflare_selected_zone", id);
    } catch {}
  }

  // Sem zona selecionada, a busca cai no caminho "banco" (aproximado, baseado
  // em eventos de firewall) em vez do caminho "ao vivo" (API real da
  // Cloudflare) — mesmo auto-select que a aba Dashboard já faz, pra abrir
  // direto na janela precisa por padrão.
  React.useEffect(() => {
    if (zones.length === 0) return;
    // Zona salva no navegador só vale se o token atual enxergá-la.
    if (zoneId && zones.some((z) => z.id === zoneId)) return;
    const zona = pickDefaultZone(zones, org.dominio_corporativo);
    if (zona) persistZone(zona.id);
  }, [zones, zoneId, org.dominio_corporativo]);

  // ── HTTP Traffic ──────────────────────────────────────────────────────────
  // KPIs, gráfico central e Top Statistics reagem juntos ao "+ Add filter" —
  // uma busca só, filtrada.
  const fetchHttp = useServerFn(getHttpTrafficAnalytics);
  const {
    data: httpData,
    isLoading: httpLoading,
    error: httpError,
  } = useQuery({
    queryKey: ["cloudflare-analytics-http", days, zoneId, httpFilters],
    enabled: activeSection === "http" && canHttp,
    queryFn: () => fetchHttp({ data: { days, zoneId, filters: httpFilters } }),
  });
  const h = (httpData as any)?.ok ? (httpData as any) : null;

  const fetchHttpGrouped = useServerFn(getHttpTrafficGroupedTimeseries);
  const { data: httpGrouped, isFetching: httpGroupedLoading } = useQuery({
    queryKey: ["cloudflare-analytics-http-grouped", days, zoneId, httpFilters, httpGroupDim],
    enabled: activeSection === "http" && canHttp && httpGroupDim !== "all",
    queryFn: () => fetchHttpGrouped({ data: { zoneId, days, dimension: httpGroupDim, filters: httpFilters } }),
  });

  // Top Statistics recortado pela métrica ativa — só busca quando o KPI
  // selecionado é um dos 3 que precisam de filtro (Page views/Visits/API
  // requests); Requisições/Data transfer continuam usando h.topStats de sempre.
  const isMetricTopStats = activeHttpKpi !== "requests";
  const httpTopStatsValueFormatter = activeHttpKpi === "bytes" ? fmtBytes : fmtNum;
  const fetchHttpTopStatsByMetric = useServerFn(getHttpTrafficTopStatsByMetric);
  const { data: httpTopStatsByMetricData, isFetching: httpTopStatsByMetricLoading } = useQuery({
    queryKey: ["cloudflare-analytics-http-topstats-by-metric", days, zoneId, httpFilters, activeHttpKpi],
    enabled: activeSection === "http" && canHttp && isMetricTopStats && !!zoneId && days <= 4,
    queryFn: () => fetchHttpTopStatsByMetric({ data: { zoneId, days, metric: activeHttpKpi, filters: httpFilters } }),
  });
  const httpTopStatsByMetric = (httpTopStatsByMetricData as any)?.ok
    ? (httpTopStatsByMetricData as any).topStats
    : null;
  const activeTopStats = isMetricTopStats ? (httpTopStatsByMetric ?? {}) : (h?.topStats ?? {});

  // ── Security ──────────────────────────────────────────────────────────────
  // Reescrito pra bater com o dash nativo (httpRequestsAdaptiveGroups filtrado
  // por requestSource:"eyeball", confirmado via captura das queries reais) —
  // só funciona na janela ao vivo (zona + até 4 dias), sem caminho de banco.
  const fetchSecurityOverview = useServerFn(getSecurityOverview);
  const {
    data: securityOverviewData,
    isLoading: securityOverviewLoading,
    error: securityOverviewError,
  } = useQuery({
    queryKey: ["cloudflare-security-overview", days, zoneId, securityFilters],
    enabled: activeSection === "security" && canSecurity && isLiveWindow,
    queryFn: () => fetchSecurityOverview({ data: { zoneId, days, filters: securityFilters } }),
  });
  const ov = (securityOverviewData as any)?.ok ? (securityOverviewData as any) : null;

  const fetchSecurityTopStats = useServerFn(getSecurityTopStats);
  const { data: securityTopStatsData, isFetching: securityTopStatsLoading } = useQuery({
    queryKey: [
      "cloudflare-security-topstats",
      days,
      zoneId,
      securityFilters,
      activeSecurityKpi,
      activeAttackScore,
      activeBotDecision,
    ],
    enabled: activeSection === "security" && canSecurity && isLiveWindow,
    queryFn: () =>
      fetchSecurityTopStats({
        data: {
          zoneId,
          days,
          filters: securityFilters,
          kpi: activeSecurityKpi,
          wafScore: activeAttackScore ?? undefined,
          botDecision: activeBotDecision ?? undefined,
        },
      }),
  });
  const secTopStats = (securityTopStatsData as any)?.ok ? (securityTopStatsData as any).topStats : null;

  const fetchSecuritySampledLogs = useServerFn(getSecuritySampledLogs);
  const { data: securityLogsData, isFetching: securityLogsLoading } = useQuery({
    queryKey: [
      "cloudflare-security-sampled-logs",
      days,
      zoneId,
      securityFilters,
      activeSecurityKpi,
      activeAttackScore,
      activeBotDecision,
    ],
    enabled: activeSection === "security" && canSecurity && isLiveWindow,
    queryFn: () =>
      fetchSecuritySampledLogs({
        data: {
          zoneId,
          days,
          filters: securityFilters,
          kpi: activeSecurityKpi,
          wafScore: activeAttackScore ?? undefined,
          botDecision: activeBotDecision ?? undefined,
        },
      }),
  });
  const secLogs: SecuritySampledLog[] = (securityLogsData as any)?.ok ? (securityLogsData as any).logs : [];

  // ── Security · Attack analysis (Request activity) ───────────────────────
  const fetchSecurityAttackAnalysis = useServerFn(getSecurityAttackAnalysis);
  const {
    data: attackOverviewData,
    isLoading: attackOverviewLoading,
    error: attackOverviewError,
  } = useQuery({
    queryKey: ["cloudflare-security-attack-analysis", days, zoneId, securityFilters],
    enabled:
      activeSection === "security" &&
      canSecurity &&
      isLiveWindow &&
      securityTab === "traffic" &&
      requestActivityTab === "attack",
    queryFn: () => fetchSecurityAttackAnalysis({ data: { zoneId, days, filters: securityFilters } }),
  });
  const attackOv = (attackOverviewData as any)?.ok ? (attackOverviewData as any) : null;
  const orderedAttackScores = React.useMemo(
    () =>
      sortByOrder(
        (attackOv?.scoreTotals ?? []) as Array<{ score: string; count: number }>,
        ATTACK_SCORE_ORDER,
        "score",
      ),
    [attackOv],
  );
  const attackScoreTotal = Math.max(
    1,
    orderedAttackScores.reduce((sum, s) => sum + s.count, 0),
  );

  // ── Security · Bot analysis (Request activity) ───────────────────────────
  const fetchSecurityBotAnalysis = useServerFn(getSecurityBotAnalysis);
  const {
    data: botOverviewData,
    isLoading: botOverviewLoading,
    error: botOverviewError,
  } = useQuery({
    queryKey: ["cloudflare-security-bot-analysis", days, zoneId, securityFilters],
    enabled:
      activeSection === "security" &&
      canSecurity &&
      isLiveWindow &&
      securityTab === "traffic" &&
      requestActivityTab === "bot",
    queryFn: () => fetchSecurityBotAnalysis({ data: { zoneId, days, filters: securityFilters } }),
  });
  const botOv = (botOverviewData as any)?.ok ? (botOverviewData as any) : null;
  const orderedBotDecisions = React.useMemo(
    () =>
      sortByOrder(
        (botOv?.decisionTotals ?? []) as Array<{ decision: string; count: number }>,
        BOT_DECISION_ORDER,
        "decision",
      ),
    [botOv],
  );
  const botSourceBuckets = React.useMemo(() => {
    const sources = (botOv?.detectionSources ?? []) as Array<{ source: string; count: number }>;
    return sources.filter((s) => s.count > 0).sort((a, b) => b.count - a.count);
  }, [botOv]);
  const botSourceTotal = Math.max(
    1,
    botSourceBuckets.reduce((sum, s) => sum + s.count, 0),
  );

  React.useEffect(() => {
    setLogsPage(1);
    setSecLogPanels({});
  }, [days, zoneId, securityFilters, activeSecurityKpi, activeAttackScore, activeBotDecision]);

  // ── Security · Events ────────────────────────────────────────────────────
  // Aba "Events" — dataset firewallEventsAdaptiveGroups/firewallEventsAdaptive,
  // confirmado via captura real. "Top events by source" é filtrável igual o
  // "Top statistics" de Traffic — clicar numa linha recorta KPIs/gráfico/logs.
  const fetchSecurityEventsOverview = useServerFn(getSecurityEventsOverview);
  const {
    data: eventsOverviewData,
    isLoading: eventsOverviewLoading,
    error: eventsOverviewError,
  } = useQuery({
    queryKey: ["cloudflare-security-events-overview", days, zoneId, eventsFilters],
    enabled: activeSection === "security" && canSecurity && isLiveWindow && securityTab === "events",
    queryFn: () => fetchSecurityEventsOverview({ data: { zoneId, days, filters: eventsFilters } }),
  });
  const evOv = (eventsOverviewData as any)?.ok ? (eventsOverviewData as any) : null;

  const fetchSecurityEventsTopStats = useServerFn(getSecurityEventsTopStats);
  const { data: eventsTopStatsData, isFetching: eventsTopStatsLoading } = useQuery({
    queryKey: ["cloudflare-security-events-topstats", days, zoneId, eventsFilters],
    enabled: activeSection === "security" && canSecurity && isLiveWindow && securityTab === "events",
    queryFn: () => fetchSecurityEventsTopStats({ data: { zoneId, days, filters: eventsFilters } }),
  });
  const evTopStats = (eventsTopStatsData as any)?.ok ? (eventsTopStatsData as any).topStats : null;

  const fetchSecurityEventsLogs = useServerFn(getSecurityEventsSampledLogs);
  const { data: eventsLogsData, isFetching: eventsLogsLoading } = useQuery({
    queryKey: ["cloudflare-security-events-logs", days, zoneId, eventsFilters],
    enabled: activeSection === "security" && canSecurity && isLiveWindow && securityTab === "events",
    queryFn: () => fetchSecurityEventsLogs({ data: { zoneId, days, filters: eventsFilters } }),
  });
  const evLogs: SecurityEventLog[] = (eventsLogsData as any)?.ok ? (eventsLogsData as any).logs : [];

  React.useEffect(() => {
    setEventsLogsPage(1);
    setEventLogPanels({});
  }, [days, zoneId, securityTab, eventsFilters]);

  const eventServiceBuckets = React.useMemo(() => {
    if (!evOv?.byService) return [];
    const map = new Map<string, { count: number; color: string }>();
    for (const s of evOv.byService as Array<{ source: string; count: number }>) {
      const meta = EVENT_SERVICE_META[s.source] ?? { label: s.source, color: T.neutral };
      const prev = map.get(meta.label);
      map.set(meta.label, { count: (prev?.count ?? 0) + s.count, color: meta.color });
    }
    return Array.from(map.entries())
      .map(([label, v]) => ({ label, count: v.count, color: v.color }))
      .filter((b) => b.count > 0)
      .sort((a, b) => b.count - a.count);
  }, [evOv]);
  const eventServiceTotal = Math.max(
    1,
    eventServiceBuckets.reduce((sum, b) => sum + b.count, 0),
  );

  function toReqRows(rows: Array<{ value: string; count: number }> | undefined | null) {
    return (rows ?? []).map((r) => ({ value: r.value, requests: r.count }));
  }

  function isDisabled(sec: (typeof SECTIONS)[number]) {
    if (sec.comingSoon) return true;
    if (sec.id === "http") return !canHttp;
    if (sec.id === "network") return !canNetwork;
    if (sec.id === "security") return !canSecurity;
    if (sec.id === "web") return !canWeb;
    return false;
  }

  const totalSecLogPages = Math.max(1, Math.ceil(secLogs.length / LOGS_PAGE_SIZE));
  const pageSecLogs = secLogs.slice((logsPage - 1) * LOGS_PAGE_SIZE, logsPage * LOGS_PAGE_SIZE);
  const totalEventLogPages = Math.max(1, Math.ceil(evLogs.length / LOGS_PAGE_SIZE));
  const pageEventLogs = evLogs.slice((eventsLogsPage - 1) * LOGS_PAGE_SIZE, eventsLogsPage * LOGS_PAGE_SIZE);

  return (
    <div className="an-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
        {/* ── Toolbar: sub-nav + dias + zona ── */}
        <div className="an-toolbar">
          <div className="an-subnav">
            {SECTIONS.map((sec) => {
              const disabled = isDisabled(sec);
              return (
                <button
                  key={sec.id}
                  className={`an-subnav-btn${activeSection === sec.id ? " active" : ""}`}
                  disabled={disabled}
                  onClick={() => !disabled && setActiveSection(sec.id)}
                  title={
                    sec.comingSoon ? "Em breve" : disabled ? "Você não tem permissão para ver esta seção" : undefined
                  }
                >
                  {sec.label}
                  {sec.comingSoon && <span className="an-badge-soon">em breve</span>}
                  {!sec.comingSoon && disabled && <Lock size={10} />}
                </button>
              );
            })}
          </div>

          <div className="an-toolbar-group">
            {!shared && (
              <>
                {[1, 2, 3].map((n) => (
                  <button key={n} className={`an-day-btn${days === n ? " active" : ""}`} onClick={() => setDays(n)}>
                    {n === 1 ? "24h" : `${n}d`}
                  </button>
                ))}
                <ZonePicker zones={zones} zoneId={zoneId} onChange={persistZone} />
              </>
            )}
            <span className={`an-live-tag ${isLiveWindow ? "live" : "sampled"}`}>
              {isLiveWindow ? "ao vivo (adaptativo)" : "agregado (banco)"}
            </span>
          </div>
        </div>

        {/* ── HTTP Traffic ── */}
        {activeSection === "http" && (
          <>
            <FilterBar
              fields={HTTP_TRAFFIC_FILTER_FIELDS}
              filters={httpFilters}
              onChange={setHttpFilters}
              isLive={isLiveWindow}
            />

            {httpLoading ? (
              <ModuleLoading />
            ) : httpError || (httpData && !(httpData as any).ok) ? (
              <div className="an-state-box">
                <div
                  className="an-state-icon"
                  style={{ background: T.dangerBg, border: `1px solid rgba(239,68,68,0.3)` }}
                >
                  <Activity size={18} color={T.danger} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.danger }}>Erro ao carregar HTTP Traffic</span>
                <span style={{ fontSize: 11, color: V2.textMuted, fontFamily: "'IBM Plex Mono',monospace" }}>
                  {httpData && !(httpData as any).ok ? (httpData as any).error : ((httpError as Error)?.message ?? "")}
                </span>
              </div>
            ) : (
              <>
                {h?.warning && <div className="an-hint-box">{h.warning}</div>}

                {/* KPIs — reagem ao filtro junto com o gráfico e o Top Statistics.
                    Todos os 5 são clicáveis: escolhem qual KPI o Top Statistics
                    recorta; Requisições/Data transfer também trocam a métrica do
                    gráfico central (os outros 3 não têm série no gráfico hoje). */}
                <div className="an-kpi-grid">
                  <KpiCard
                    label="Requisições"
                    value={fmtNum(h?.totals?.requests || 0)}
                    color={T.accent}
                    sparkData={h?.timeseries}
                    sparkKey="requests"
                    active={activeHttpKpi === "requests"}
                    deltaPct={h?.requestsDeltaPct}
                    onClick={() => {
                      setHttpMetric("requests");
                      setHttpGroupDim("all");
                      setActiveHttpKpi("requests");
                    }}
                  />
                  <KpiCard
                    label="Data transfer"
                    value={fmtBytes(h?.totals?.bytes || 0)}
                    color={T.accent}
                    sparkData={h?.timeseries}
                    sparkKey="bytes"
                    active={activeHttpKpi === "bytes"}
                    deltaPct={h?.bytesDeltaPct}
                    onClick={() => {
                      setHttpMetric("bytes");
                      setHttpGroupDim("all");
                      setActiveHttpKpi("bytes");
                    }}
                  />
                  {h?.live ? (
                    <KpiCard
                      label="Page views"
                      value={fmtNum(h.pageViews || 0)}
                      color={T.accent}
                      sparkData={h.pageViewsSeries}
                      sparkKey="views"
                      deltaPct={h.pageViewsDeltaPct}
                      active={activeHttpKpi === "pageViews"}
                      onClick={() => setActiveHttpKpi("pageViews")}
                      clickHint="Clique pra ver o Top Statistics recortado por Page views"
                    />
                  ) : (
                    <LockedKpiCard label="Page views" source="disponível só na janela ao vivo (zona + até 4 dias)" />
                  )}
                  {h?.live ? (
                    <KpiCard
                      label="Visits"
                      value={fmtNum(h.visits || 0)}
                      color={T.accent}
                      sparkData={h.visitsSeries}
                      sparkKey="visits"
                      deltaPct={h.visitsDeltaPct}
                      active={activeHttpKpi === "visits"}
                      onClick={() => setActiveHttpKpi("visits")}
                      clickHint="Clique pra ver o Top Statistics recortado por Visits"
                    />
                  ) : (
                    <LockedKpiCard label="Visits" source="disponível só na janela ao vivo (zona + até 4 dias)" />
                  )}
                  {h?.live ? (
                    <KpiCard
                      label="API requests"
                      value={fmtNum(h.apiRequests || 0)}
                      color={T.accent}
                      sparkData={h.apiRequestsSeries}
                      sparkKey="requests"
                      deltaPct={h.apiRequestsDeltaPct}
                      active={activeHttpKpi === "apiRequests"}
                      onClick={() => setActiveHttpKpi("apiRequests")}
                      clickHint="Clique pra ver o Top Statistics recortado por API requests"
                    />
                  ) : (
                    <LockedKpiCard label="API requests" source="disponível só na janela ao vivo (zona + até 4 dias)" />
                  )}
                </div>

                {/* Gráfico central com abas de agrupamento */}
                <div className="an-block">
                  <BlockHeader
                    icon={Activity}
                    title={httpMetric === "bytes" ? "Data Transfer over time" : "Requests over time"}
                    right={
                      <div className="an-group-tabs">
                        {HTTP_GROUP_TABS.map((t) => (
                          <button
                            key={t.key}
                            className={`an-group-tab${httpGroupDim === t.key ? " active" : ""}`}
                            onClick={() => setHttpGroupDim(t.key)}
                          >
                            {t.label}
                          </button>
                        ))}
                      </div>
                    }
                  />
                  <div className="an-block-body" style={{ height: 280, padding: 0 }}>
                    {httpGroupDim === "all" ? (
                      <ChartBox height={280}>
                        {(width) => (
                          <AreaChart
                            width={width}
                            height={280}
                            data={h?.timeseries ?? []}
                            margin={{ top: 14, right: 16, bottom: 8, left: 8 }}
                          >
                            <defs>
                              <linearGradient id="an-req" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor={T.accent} stopOpacity={0.35} />
                                <stop offset="100%" stopColor={T.accent} stopOpacity={0.02} />
                              </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="2 4" stroke={T.chartGrid} vertical={false} />
                            <XAxis dataKey="t" {...axisProps} tickFormatter={(v) => SafeHourDateTime(v, "hour")} />
                            <YAxis
                              {...axisProps}
                              axisLine={false}
                              tickFormatter={(v) => (httpMetric === "bytes" ? fmtBytes(Number(v)) : fmtNum(Number(v)))}
                            />
                            <Tooltip
                              content={<GenericTooltip valueFormatter={httpMetric === "bytes" ? fmtBytes : fmtNum} />}
                              cursor={{ fill: "rgba(59,130,246,0.05)" }}
                            />
                            <Area
                              type="monotone"
                              dataKey={httpMetric}
                              stroke={T.accent}
                              fill="url(#an-req)"
                              strokeWidth={2}
                              name={httpMetric === "bytes" ? "Data Transfer" : "Requisições"}
                              dot={false}
                              activeDot={{ r: 3, fill: T.accent, stroke: T.surface, strokeWidth: 2 }}
                            />
                          </AreaChart>
                        )}
                      </ChartBox>
                    ) : httpGroupedLoading ? (
                      <EmptyState message="Carregando série agrupada…" />
                    ) : !(httpGrouped as any)?.ok ? (
                      <EmptyState message={(httpGrouped as any)?.error ?? "Sem dados pra essa dimensão."} />
                    ) : (httpGrouped as any).keys.length === 0 ? (
                      <EmptyState message="Sem dados no período." />
                    ) : (
                      <ChartBox height={280}>
                        {(width) => (
                          <AreaChart
                            width={width}
                            height={280}
                            data={(httpGrouped as any).series}
                            margin={{ top: 14, right: 16, bottom: 8, left: 8 }}
                          >
                            <CartesianGrid strokeDasharray="2 4" stroke={T.chartGrid} vertical={false} />
                            <XAxis dataKey="t" {...axisProps} tickFormatter={(v) => SafeHourDateTime(v, "hour")} />
                            <YAxis {...axisProps} axisLine={false} tickFormatter={(v) => fmtNum(Number(v))} />
                            <Tooltip content={<GenericTooltip />} cursor={{ fill: "rgba(59,130,246,0.05)" }} />
                            <Legend wrapperStyle={{ fontSize: 10, fontFamily: "'IBM Plex Mono',monospace" }} />
                            {(httpGrouped as any).keys.map((k: string, i: number) => (
                              <Area
                                key={k}
                                type="monotone"
                                dataKey={k}
                                stackId="1"
                                stroke={SERIES_PALETTE[i % SERIES_PALETTE.length]}
                                fill={SERIES_PALETTE[i % SERIES_PALETTE.length]}
                                fillOpacity={0.3}
                                strokeWidth={1.5}
                                name={k}
                                dot={false}
                              />
                            ))}
                          </AreaChart>
                        )}
                      </ChartBox>
                    )}
                  </div>
                </div>

                {/* Top statistics — recortado pelo KPI ativo (ver activeHttpKpi) */}
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    fontSize: 11,
                    color: V2.textMuted,
                    fontFamily: "'IBM Plex Mono',monospace",
                  }}
                >
                  <span>Top Statistics — {HTTP_KPI_LABEL[activeHttpKpi]}</span>
                  {isMetricTopStats && httpTopStatsByMetricLoading && <span>carregando…</span>}
                </div>
                <div className="an-stats-grid">
                  <StatPanel
                    title="Hosts"
                    icon={Globe}
                    valueFormatter={httpTopStatsValueFormatter}
                    rows={activeTopStats?.host ?? []}
                    onRowClick={(v) => setHttpFilters((f) => [...f, { field: "host", op: "eq", value: v }])}
                  />
                  <StatPanel
                    title="Paths"
                    icon={Link2}
                    valueFormatter={httpTopStatsValueFormatter}
                    rows={activeTopStats?.path ?? []}
                    onRowClick={(v) => setHttpFilters((f) => [...f, { field: "path", op: "eq", value: v }])}
                  />
                  <StatPanel
                    title="Source IPs"
                    icon={Activity}
                    valueFormatter={httpTopStatsValueFormatter}
                    rows={activeTopStats?.sourceIp ?? []}
                    onRowClick={(v) => {
                      const ip = v.split(" · ")[0];
                      setHttpFilters((f) => [...f, { field: "ip", op: "eq", value: ip }]);
                    }}
                  />
                  <StatPanel
                    title="Countries"
                    icon={Globe}
                    valueFormatter={httpTopStatsValueFormatter}
                    rows={activeTopStats?.country ?? []}
                    onRowClick={(v) => setHttpFilters((f) => [...f, { field: "country", op: "eq", value: v }])}
                  />
                  <StatPanel
                    title="Status Codes (edge)"
                    icon={Hash}
                    valueFormatter={httpTopStatsValueFormatter}
                    rows={activeTopStats?.statusCodeEdge ?? []}
                    emptyHint={h?.live ? "Sem dados." : "Disponível só na janela ao vivo (zona + até 4 dias)."}
                    onRowClick={(v) => setHttpFilters((f) => [...f, { field: "statusCodeEdge", op: "eq", value: v }])}
                  />
                  <StatPanel
                    title="Status Codes (origin)"
                    icon={Hash}
                    valueFormatter={httpTopStatsValueFormatter}
                    rows={activeTopStats?.statusCodeOrigin ?? []}
                    emptyHint={h?.live ? "Sem dados." : "Disponível só na janela ao vivo (zona + até 4 dias)."}
                    onRowClick={(v) => {
                      const status = v === "Sem origem (cache/edge)" ? "0" : v;
                      setHttpFilters((f) => [...f, { field: "statusCodeOrigin", op: "eq", value: status }]);
                    }}
                  />
                  <StatPanel
                    title="ASNs"
                    icon={Cpu}
                    valueFormatter={httpTopStatsValueFormatter}
                    rows={activeTopStats?.asn ?? []}
                    emptyHint={h?.live ? "Sem dados." : "Disponível só na janela ao vivo (zona + até 4 dias)."}
                    onRowClick={(v) => {
                      const asn = v.match(/^AS(\d+)/)?.[1] ?? v;
                      setHttpFilters((f) => [...f, { field: "asn", op: "eq", value: asn }]);
                    }}
                  />
                  <StatPanel
                    title="Cache Status"
                    icon={Database}
                    valueFormatter={httpTopStatsValueFormatter}
                    rows={activeTopStats?.cacheStatus ?? []}
                    emptyHint={h?.live ? "Sem dados." : "Disponível só na janela ao vivo (zona + até 4 dias)."}
                    onRowClick={(v) => setHttpFilters((f) => [...f, { field: "cacheStatus", op: "eq", value: v }])}
                  />
                  <StatPanel
                    title="Device Type"
                    icon={Cpu}
                    valueFormatter={httpTopStatsValueFormatter}
                    rows={activeTopStats?.deviceType ?? []}
                    emptyHint={h?.live ? "Sem dados." : "Disponível só na janela ao vivo (zona + até 4 dias)."}
                    onRowClick={(v) => setHttpFilters((f) => [...f, { field: "deviceType", op: "eq", value: v }])}
                  />
                  <StatPanel
                    title="Query Strings"
                    icon={Search}
                    valueFormatter={httpTopStatsValueFormatter}
                    rows={activeTopStats?.queryString ?? []}
                    emptyHint={h?.live ? "Sem dados." : "Disponível só na janela ao vivo (zona + até 4 dias)."}
                    onRowClick={(v) =>
                      setHttpFilters((f) => [...f, { field: "queryString", op: "eq", value: v === "(vazio)" ? "" : v }])
                    }
                  />
                  <StatPanel
                    title="Source user agents"
                    icon={Cpu}
                    valueFormatter={httpTopStatsValueFormatter}
                    rows={activeTopStats?.userAgent ?? []}
                    emptyHint={h?.live ? "Sem dados." : "Disponível só na janela ao vivo (zona + até 4 dias)."}
                    onRowClick={(v) => setHttpFilters((f) => [...f, { field: "userAgent", op: "eq", value: v }])}
                  />
                  <StatPanel
                    title="Data centers"
                    icon={Server}
                    valueFormatter={httpTopStatsValueFormatter}
                    rows={activeTopStats?.dataCenter ?? []}
                    emptyHint={h?.live ? "Sem dados." : "Disponível só na janela ao vivo (zona + até 4 dias)."}
                    onRowClick={(v) => {
                      const colo = v.match(/\(([^)]+)\)\s*$/)?.[1] ?? v;
                      setHttpFilters((f) => [...f, { field: "dataCenter", op: "eq", value: colo }]);
                    }}
                  />
                  <StatPanel
                    title="HTTP versions"
                    icon={Network}
                    valueFormatter={httpTopStatsValueFormatter}
                    rows={activeTopStats?.httpVersion ?? []}
                    emptyHint={h?.live ? "Sem dados." : "Disponível só na janela ao vivo (zona + até 4 dias)."}
                    onRowClick={(v) => setHttpFilters((f) => [...f, { field: "httpVersion", op: "eq", value: v }])}
                  />
                  <StatPanel
                    title="X-Requested-With headers"
                    icon={Hash}
                    valueFormatter={httpTopStatsValueFormatter}
                    rows={activeTopStats?.xRequestedWith ?? []}
                    emptyHint={h?.live ? "Sem dados." : "Disponível só na janela ao vivo (zona + até 4 dias)."}
                    onRowClick={(v) =>
                      setHttpFilters((f) => [
                        ...f,
                        { field: "xRequestedWith", op: "eq", value: v === "(vazio)" ? "" : v },
                      ])
                    }
                  />
                </div>
              </>
            )}
          </>
        )}

        {/* ── Security ── */}
        {activeSection === "security" && (
          <>
            <div className="an-group-tabs" style={{ borderBottom: `1px solid ${V2.border}`, paddingBottom: 10 }}>
              <button
                className={`an-group-tab${securityTab === "traffic" ? " active" : ""}`}
                onClick={() => setSecurityTab("traffic")}
              >
                Traffic
              </button>
              <button
                className={`an-group-tab${securityTab === "events" ? " active" : ""}`}
                onClick={() => setSecurityTab("events")}
              >
                Events
              </button>
            </div>

            {securityTab === "events" ? (
              !isLiveWindow ? (
                <div className="an-state-box">
                  <Shield size={20} color={T.textMuted} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: V2.textPrimary }}>
                    Security Events só funciona na janela ao vivo
                  </span>
                  <span style={{ fontSize: 11, color: V2.textMuted }}>
                    Selecione uma zona e um período de até 4 dias.
                  </span>
                </div>
              ) : eventsOverviewLoading ? (
                <ModuleLoading />
              ) : eventsOverviewError || !evOv ? (
                <div className="an-state-box">
                  <div
                    className="an-state-icon"
                    style={{ background: T.dangerBg, border: `1px solid rgba(239,68,68,0.3)` }}
                  >
                    <Shield size={18} color={T.danger} />
                  </div>
                  <span style={{ fontSize: 13, fontWeight: 600, color: T.danger }}>Erro ao carregar Events</span>
                  <span style={{ fontSize: 11, color: V2.textMuted, fontFamily: "'IBM Plex Mono',monospace" }}>
                    {(eventsOverviewData as any)?.ok === false
                      ? (eventsOverviewData as any).error
                      : ((eventsOverviewError as Error)?.message ?? "")}
                  </span>
                </div>
              ) : (
                <>
                  {/* Events summary */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      flexWrap: "wrap",
                      gap: 10,
                    }}
                  >
                    <span
                      style={{
                        fontSize: 12.5,
                        fontWeight: 600,
                        color: V2.textPrimary,
                        fontFamily: "var(--font-ui)",
                      }}
                    >
                      Events summary
                    </span>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 11, color: V2.textMuted, fontFamily: "var(--font-ui)" }}>
                        Group view by
                      </span>
                      <Select value="action" onValueChange={() => {}}>
                        <SelectTrigger className="an-select-trigger" style={{ width: 130 }}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent className="an-select-content">
                          <SelectItem value="action" className="an-select-item">
                            Action
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <FilterBar
                    fields={SECURITY_EVENTS_FILTER_FIELDS}
                    filters={eventsFilters}
                    onChange={setEventsFilters}
                    isLive={true}
                  />

                  <div
                    className="an-kpi-grid"
                    style={{ gridTemplateColumns: `repeat(${Math.min(5, evOv.actionTotals.length + 1)},1fr)` }}
                  >
                    <KpiCard label="Total" value={fmtNum(evOv.total)} color={T.textPrimary} />
                    {evOv.actionTotals.slice(0, 4).map((a: { action: string; count: number }, i: number) => (
                      <KpiCard
                        key={a.action}
                        label={eventActionLabel(a.action)}
                        value={fmtNum(a.count)}
                        color={eventActionColor(a.action, i)}
                        sparkData={evOv.series}
                        sparkKey={a.action}
                      />
                    ))}
                  </div>

                  <div className="an-block">
                    <BlockHeader icon={Activity} title="Number of events" />
                    <div className="an-block-body" style={{ height: 280, padding: 0 }}>
                      {evOv.series.length === 0 ? (
                        <EmptyState message="Sem dados no período." />
                      ) : (
                        <ChartBox height={280}>
                          {(width) => (
                            <LineChart
                              width={width}
                              height={280}
                              data={evOv.series}
                              margin={{ top: 14, right: 16, bottom: 8, left: 8 }}
                            >
                              <CartesianGrid strokeDasharray="2 4" stroke={T.chartGrid} vertical={false} />
                              <XAxis dataKey="ts" {...axisProps} tickFormatter={(v) => SafeHourDateTime(v, "hour")} />
                              <YAxis {...axisProps} axisLine={false} tickFormatter={(v) => fmtNum(Number(v))} />
                              <Tooltip content={<GenericTooltip />} cursor={{ stroke: T.borderHi }} />
                              <Legend wrapperStyle={{ fontSize: 10, fontFamily: "'IBM Plex Mono',monospace" }} />
                              {evOv.actionTotals.slice(0, 6).map((a: { action: string; count: number }, i: number) => (
                                <Line
                                  key={a.action}
                                  type="monotone"
                                  dataKey={a.action}
                                  stroke={eventActionColor(a.action, i)}
                                  strokeWidth={2}
                                  dot={false}
                                  name={eventActionLabel(a.action)}
                                />
                              ))}
                            </LineChart>
                          )}
                        </ChartBox>
                      )}
                    </div>
                  </div>

                  {/* Events by service */}
                  <div className="an-block">
                    <BlockHeader icon={Shield} title="Events by service" />
                    <div className="an-block-body">
                      {eventServiceBuckets.length === 0 ? (
                        <EmptyState message="Sem dados no período." />
                      ) : (
                        <>
                          <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 12 }}>
                            {eventServiceBuckets.map((b) => (
                              <div
                                key={b.label}
                                style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}
                              >
                                <span
                                  style={{
                                    width: 8,
                                    height: 8,
                                    borderRadius: "50%",
                                    background: b.color,
                                    display: "inline-block",
                                  }}
                                />
                                <span style={{ color: V2.textSecondary, fontFamily: "var(--font-ui)" }}>
                                  {b.label}
                                </span>
                                <span
                                  style={{
                                    color: V2.textPrimary,
                                    fontFamily: "'IBM Plex Mono',monospace",
                                    fontWeight: 600,
                                  }}
                                >
                                  {fmtNum(b.count)}
                                </span>
                              </div>
                            ))}
                          </div>
                          <div
                            style={{
                              display: "flex",
                              width: "100%",
                              height: 10,
                              borderRadius: 6,
                              overflow: "hidden",
                              background: V2.surfaceAlt,
                            }}
                          >
                            {eventServiceBuckets.map((b) => (
                              <div
                                key={b.label}
                                style={{ width: `${(b.count / eventServiceTotal) * 100}%`, background: b.color }}
                                title={`${b.label}: ${fmtNum(b.count)}`}
                              />
                            ))}
                          </div>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Top events by source */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      fontSize: 11,
                      color: V2.textMuted,
                      fontFamily: "'IBM Plex Mono',monospace",
                    }}
                  >
                    <span>Top events by source</span>
                    {eventsTopStatsLoading && <span>carregando…</span>}
                  </div>
                  <div className="an-stats-grid">
                    <StatPanel
                      title="Source IP Addresses"
                      icon={Activity}
                      rows={toReqRows(evTopStats?.clientIPs)}
                      onRowClick={(v) => setEventsFilters((f) => [...f, { field: "ip", op: "eq", value: v }])}
                    />
                    <StatPanel
                      title="Hosts"
                      icon={Globe}
                      rows={toReqRows(evTopStats?.hosts)}
                      onRowClick={(v) => setEventsFilters((f) => [...f, { field: "host", op: "eq", value: v }])}
                    />
                    <StatPanel
                      title="Paths"
                      icon={Link2}
                      rows={toReqRows(evTopStats?.paths)}
                      onRowClick={(v) => setEventsFilters((f) => [...f, { field: "path", op: "eq", value: v }])}
                    />
                    <StatPanel
                      title="Source ASNs"
                      icon={Cpu}
                      rows={toReqRows(evTopStats?.asns)}
                      onRowClick={(v) =>
                        setEventsFilters((f) => [
                          ...f,
                          { field: "asn", op: "eq", value: v.match(/^AS(\d+)/)?.[1] ?? v },
                        ])
                      }
                    />
                    <StatPanel
                      title="User Agents"
                      icon={Cpu}
                      rows={toReqRows(evTopStats?.userAgents)}
                      onRowClick={(v) => setEventsFilters((f) => [...f, { field: "userAgent", op: "eq", value: v }])}
                    />
                    <StatPanel
                      title="Referers"
                      icon={Link2}
                      rows={toReqRows(evTopStats?.referers)}
                      onRowClick={(v) => setEventsFilters((f) => [...f, { field: "referer", op: "eq", value: v }])}
                    />
                    <StatPanel
                      title="HTTP Methods"
                      icon={Activity}
                      rows={toReqRows(evTopStats?.methods)}
                      onRowClick={(v) => setEventsFilters((f) => [...f, { field: "method", op: "eq", value: v }])}
                    />
                    <StatPanel
                      title="Countries"
                      icon={Globe}
                      rows={toReqRows(evTopStats?.countries)}
                      onRowClick={(v) => setEventsFilters((f) => [...f, { field: "country", op: "eq", value: v }])}
                    />
                    <StatPanel
                      title="Custom rules"
                      icon={Shield}
                      rows={toReqRows(evTopStats?.customRules)}
                      onRowClick={(v) => setEventsFilters((f) => [...f, { field: "ruleId", op: "eq", value: v }])}
                    />
                    <StatPanel
                      title="Managed rules"
                      icon={Shield}
                      rows={toReqRows(evTopStats?.managedRules)}
                      onRowClick={(v) => setEventsFilters((f) => [...f, { field: "ruleId", op: "eq", value: v }])}
                    />
                    <StatPanel
                      title="HTTP DDoS rules"
                      icon={Shield}
                      rows={toReqRows(evTopStats?.ddosRules)}
                      emptyHint="No data"
                      onRowClick={(v) => setEventsFilters((f) => [...f, { field: "ruleId", op: "eq", value: v }])}
                    />
                    <StatPanel
                      title="Rate limiting rules"
                      icon={Shield}
                      rows={toReqRows(evTopStats?.rateLimitRules)}
                      onRowClick={(v) => setEventsFilters((f) => [...f, { field: "ruleId", op: "eq", value: v }])}
                    />
                  </div>

                  {/* Sampled logs */}
                  <div className="an-block">
                    <BlockHeader icon={Search} title="Sampled logs" />
                    {eventsLogsLoading && (
                      <div
                        style={{
                          padding: "8px 16px 0",
                          fontSize: 10,
                          color: V2.textMuted,
                          fontFamily: "var(--font-ui)",
                        }}
                      >
                        Atualizando…
                      </div>
                    )}
                    <div style={{ flex: 1, overflow: "auto", maxHeight: 460 }}>
                      <table className="an-table">
                        <thead style={{ position: "sticky", top: 0, zIndex: 20 }}>
                          <tr>
                            <th style={{ background: V2.surface, width: 24 }}></th>
                            <th style={{ background: V2.surface }}>Date</th>
                            <th style={{ background: V2.surface }}>Action taken</th>
                            <th style={{ background: V2.surface }}>Country</th>
                            <th style={{ background: V2.surface }}>IP address</th>
                            <th style={{ background: V2.surface }}>Service</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pageEventLogs.length === 0 && (
                            <tr>
                              <td colSpan={6} className="an-empty">
                                Nenhum evento no período.
                              </td>
                            </tr>
                          )}
                          {pageEventLogs.map((l: SecurityEventLog, i: number) => {
                            const key = l.rayName || `${l.datetime}-${l.clientIP}-${i}`;
                            const isOpen = !!eventLogPanels[key];
                            return (
                              <tr
                                key={key}
                                className={isOpen ? "an-row-open" : undefined}
                                style={{ cursor: "pointer" }}
                                onClick={(e) => openEventLogPanel(l, e)}
                              >
                                <td>{isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</td>
                                <td className="mono dim" style={{ whiteSpace: "nowrap" }}>
                                  {SafeHourDateTime(l.datetime, "full")}
                                </td>
                                <td>
                                  <span
                                    className="an-badge"
                                    style={{
                                      background: `${eventActionColor(l.action, 0)}22`,
                                      color: eventActionColor(l.action, 0),
                                      border: `1px solid ${eventActionColor(l.action, 0)}55`,
                                    }}
                                  >
                                    {eventActionLabel(l.action)}
                                  </span>
                                </td>
                                <td className="mono dim">{l.clientCountryName}</td>
                                <td className="mono dim">{l.clientIP}</td>
                                <td className="mono dim">{eventServiceLabel(l.source)}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <div className="an-pagination">
                      <span>
                        {evLogs.length === 0 ? 0 : (eventsLogsPage - 1) * LOGS_PAGE_SIZE + 1}–
                        {Math.min(eventsLogsPage * LOGS_PAGE_SIZE, evLogs.length)} de {evLogs.length}
                      </span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button
                          className="an-page-btn"
                          disabled={eventsLogsPage <= 1}
                          onClick={() => setEventsLogsPage((p) => Math.max(1, p - 1))}
                        >
                          Anterior
                        </button>
                        <span>
                          Página {eventsLogsPage} de {totalEventLogPages}
                        </span>
                        <button
                          className="an-page-btn"
                          disabled={eventsLogsPage >= totalEventLogPages}
                          onClick={() => setEventsLogsPage((p) => Math.min(totalEventLogPages, p + 1))}
                        >
                          Próxima
                        </button>
                      </div>
                    </div>
                  </div>
                </>
              )
            ) : (
              <>
                <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                  <span
                    style={{
                      fontSize: 12.5,
                      fontWeight: 600,
                      color: V2.textPrimary,
                      fontFamily: "var(--font-ui)",
                    }}
                  >
                    Suspicious activity
                  </span>
                  <span
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      padding: "2px 9px",
                      borderRadius: 10,
                      background: (ov?.suspiciousActivityCount ?? 0) > 0 ? T.dangerBg : "rgba(139,150,172,0.12)",
                      color: (ov?.suspiciousActivityCount ?? 0) > 0 ? T.danger : V2.textMuted,
                      fontFamily: "'IBM Plex Mono',monospace",
                    }}
                  >
                    {ov?.suspiciousActivityCount ?? 0}
                  </span>
                </div>

                <FilterBar
                  fields={SECURITY_ANALYTICS_FILTER_FIELDS}
                  filters={securityFilters}
                  onChange={setSecurityFilters}
                  isLive={true}
                />

                {!isLiveWindow ? (
                  <div className="an-state-box">
                    <Shield size={20} color={T.textMuted} />
                    <span style={{ fontSize: 13, fontWeight: 600, color: V2.textPrimary }}>
                      Security Analytics só funciona na janela ao vivo
                    </span>
                    <span style={{ fontSize: 11, color: V2.textMuted }}>
                      Selecione uma zona e um período de até 4 dias.
                    </span>
                  </div>
                ) : securityOverviewLoading ? (
                  <ModuleLoading />
                ) : securityOverviewError || !ov ? (
                  <div className="an-state-box">
                    <div
                      className="an-state-icon"
                      style={{ background: T.dangerBg, border: `1px solid rgba(239,68,68,0.3)` }}
                    >
                      <Shield size={18} color={T.danger} />
                    </div>
                    <span style={{ fontSize: 13, fontWeight: 600, color: T.danger }}>Erro ao carregar Security</span>
                    <span style={{ fontSize: 11, color: V2.textMuted, fontFamily: "'IBM Plex Mono',monospace" }}>
                      {(securityOverviewData as any)?.ok === false
                        ? (securityOverviewData as any).error
                        : ((securityOverviewError as Error)?.message ?? "")}
                    </span>
                  </div>
                ) : (
                  <>
                    {/* Request activity */}
                    <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                      <span
                        style={{
                          fontSize: 12.5,
                          fontWeight: 600,
                          color: V2.textPrimary,
                          fontFamily: "var(--font-ui)",
                        }}
                      >
                        Request activity
                      </span>
                    </div>
                    <div className="an-group-tabs">
                      <button
                        className={`an-group-tab${requestActivityTab === "traffic" ? " active" : ""}`}
                        onClick={() => setRequestActivityTab("traffic")}
                      >
                        Traffic analysis
                      </button>
                      <button
                        className={`an-group-tab${requestActivityTab === "attack" ? " active" : ""}`}
                        onClick={() => setRequestActivityTab("attack")}
                      >
                        Attack analysis
                      </button>
                      <button
                        className={`an-group-tab${requestActivityTab === "bot" ? " active" : ""}`}
                        onClick={() => setRequestActivityTab("bot")}
                      >
                        Bot analysis
                      </button>
                    </div>

                    {requestActivityTab === "bot" ? (
                      <>
                        {/* Number of requests made by bots and humans */}
                        <div>
                          <span
                            style={{
                              fontSize: 12.5,
                              fontWeight: 600,
                              color: V2.textPrimary,
                              fontFamily: "var(--font-ui)",
                            }}
                          >
                            Number of requests made by bots and humans
                          </span>
                          <div
                            style={{
                              fontSize: 11,
                              color: V2.textMuted,
                              marginTop: 4,
                              fontFamily: "var(--font-ui)",
                            }}
                          >
                            Identify how much traffic came from bots or humans based on the{" "}
                            <a
                              href="https://developers.cloudflare.com/bots/concepts/bot-score/"
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: T.accent }}
                            >
                              bot scores
                            </a>{" "}
                            of requests.
                          </div>
                        </div>

                        {botOverviewLoading ? (
                          <div className="an-state-box">
                            <span style={{ fontSize: 13, color: V2.textSecondary }}>Carregando…</span>
                          </div>
                        ) : botOverviewError || !botOv ? (
                          <div className="an-state-box">
                            <span style={{ fontSize: 13, fontWeight: 600, color: T.danger }}>
                              Erro ao carregar Bot analysis
                            </span>
                            <span style={{ fontSize: 11, color: V2.textMuted, fontFamily: "'IBM Plex Mono',monospace" }}>
                              {(botOverviewData as any)?.ok === false
                                ? (botOverviewData as any).error
                                : ((botOverviewError as Error)?.message ?? "")}
                            </span>
                          </div>
                        ) : (
                          <>
                            <div
                              className="an-kpi-grid"
                              style={{
                                gridTemplateColumns: `repeat(${Math.min(5, orderedBotDecisions.length + 1)},1fr)`,
                              }}
                            >
                              <KpiCard
                                label="Total"
                                value={fmtNum(botOv.total)}
                                color={T.textPrimary}
                                onClick={() => setActiveBotDecision(null)}
                                active={activeBotDecision === null}
                              />
                              {orderedBotDecisions.map((d, i) => (
                                <KpiCard
                                  key={d.decision}
                                  label={botDecisionLabel(d.decision)}
                                  value={fmtNum(d.count)}
                                  color={botDecisionColor(d.decision, i)}
                                  sparkData={botOv.series}
                                  sparkKey={d.decision}
                                  onClick={() => setActiveBotDecision(d.decision)}
                                  active={activeBotDecision === d.decision}
                                />
                              ))}
                            </div>

                            <div className="an-block">
                              <BlockHeader icon={Cpu} title="Requests by bot management decision" />
                              <div className="an-block-body" style={{ height: 280, padding: 0 }}>
                                {botOv.series.length === 0 ? (
                                  <EmptyState message="Sem dados no período." />
                                ) : (
                                  <ChartBox height={280}>
                                    {(width) => (
                                      <BarChart
                                        width={width}
                                        height={280}
                                        data={botOv.series}
                                        margin={{ top: 14, right: 16, bottom: 8, left: 8 }}
                                      >
                                        <CartesianGrid strokeDasharray="2 4" stroke={T.chartGrid} vertical={false} />
                                        <XAxis
                                          dataKey="ts"
                                          {...axisProps}
                                          tickFormatter={(v) => SafeHourDateTime(v, "hour")}
                                        />
                                        <YAxis
                                          {...axisProps}
                                          axisLine={false}
                                          tickFormatter={(v) => fmtNum(Number(v))}
                                        />
                                        <Tooltip
                                          content={<GenericTooltip />}
                                          cursor={{ fill: "rgba(var(--tl-ink, 255,255,255),0.04)" }}
                                        />
                                        <Legend
                                          wrapperStyle={{ fontSize: 10, fontFamily: "'IBM Plex Mono',monospace" }}
                                        />
                                        {orderedBotDecisions.map((d, i) => (
                                          <Bar
                                            key={d.decision}
                                            dataKey={d.decision}
                                            stackId="decision"
                                            fill={botDecisionColor(d.decision, i)}
                                            name={botDecisionLabel(d.decision)}
                                          />
                                        ))}
                                      </BarChart>
                                    )}
                                  </ChartBox>
                                )}
                              </div>
                            </div>

                            <div className="an-block">
                              <BlockHeader icon={Cpu} title="Requests by detection source" />
                              <div className="an-block-body">
                                <div
                                  style={{
                                    fontSize: 11,
                                    color: V2.textMuted,
                                    marginBottom: 12,
                                    fontFamily: "var(--font-ui)",
                                  }}
                                >
                                  Review which engines or services were responsible for applying bot scores to requests.
                                </div>
                                {botSourceBuckets.length === 0 ? (
                                  <EmptyState message="Sem dados no período." />
                                ) : (
                                  <>
                                    <div style={{ display: "flex", gap: 18, flexWrap: "wrap", marginBottom: 12 }}>
                                      {botSourceBuckets.map((s, i) => (
                                        <div
                                          key={s.source}
                                          style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11 }}
                                        >
                                          <span
                                            style={{
                                              width: 8,
                                              height: 8,
                                              borderRadius: "50%",
                                              background: botSourceColor(s.source, i),
                                              display: "inline-block",
                                            }}
                                          />
                                          <span style={{ color: V2.textSecondary, fontFamily: "var(--font-ui)" }}>
                                            {botSourceLabel(s.source)}
                                          </span>
                                          <span
                                            style={{
                                              color: V2.textPrimary,
                                              fontFamily: "'IBM Plex Mono',monospace",
                                              fontWeight: 600,
                                            }}
                                          >
                                            {fmtNum(s.count)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                    <div
                                      style={{
                                        display: "flex",
                                        width: "100%",
                                        height: 10,
                                        borderRadius: 6,
                                        overflow: "hidden",
                                        background: V2.surfaceAlt,
                                      }}
                                    >
                                      {botSourceBuckets.map((s, i) => (
                                        <div
                                          key={s.source}
                                          style={{
                                            width: `${(s.count / botSourceTotal) * 100}%`,
                                            background: botSourceColor(s.source, i),
                                          }}
                                          title={`${botSourceLabel(s.source)}: ${fmtNum(s.count)} (${((s.count / botSourceTotal) * 100).toFixed(1)}%)`}
                                        />
                                      ))}
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          </>
                        )}
                      </>
                    ) : requestActivityTab === "attack" ? (
                      <>
                        {/* Number of clean and malicious requests */}
                        <div>
                          <span
                            style={{
                              fontSize: 12.5,
                              fontWeight: 600,
                              color: V2.textPrimary,
                              fontFamily: "var(--font-ui)",
                            }}
                          >
                            Number of clean and malicious requests
                          </span>
                          <div
                            style={{
                              fontSize: 11,
                              color: V2.textMuted,
                              marginTop: 4,
                              fontFamily: "var(--font-ui)",
                            }}
                          >
                            Determine how much traffic was clean or malicious based on the{" "}
                            <a
                              href="https://developers.cloudflare.com/waf/detections/attack-score/"
                              target="_blank"
                              rel="noreferrer"
                              style={{ color: T.accent }}
                            >
                              WAF attack scores
                            </a>{" "}
                            of requests.
                          </div>
                        </div>

                        {attackOverviewLoading ? (
                          <div className="an-state-box">
                            <span style={{ fontSize: 13, color: V2.textSecondary }}>Carregando…</span>
                          </div>
                        ) : attackOverviewError || !attackOv ? (
                          <div className="an-state-box">
                            <span style={{ fontSize: 13, fontWeight: 600, color: T.danger }}>
                              Erro ao carregar Attack analysis
                            </span>
                            <span style={{ fontSize: 11, color: V2.textMuted, fontFamily: "'IBM Plex Mono',monospace" }}>
                              {(attackOverviewData as any)?.ok === false
                                ? (attackOverviewData as any).error
                                : ((attackOverviewError as Error)?.message ?? "")}
                            </span>
                          </div>
                        ) : (
                          <>
                            <div
                              className="an-kpi-grid"
                              style={{
                                gridTemplateColumns: `repeat(${Math.min(6, orderedAttackScores.length + 1)},1fr)`,
                              }}
                            >
                              <KpiCard
                                label="Total"
                                value={fmtNum(ov.totals.total)}
                                color={T.textPrimary}
                                onClick={() => setActiveAttackScore(null)}
                                active={activeAttackScore === null}
                              />
                              {orderedAttackScores.map((s, i) => (
                                <KpiCard
                                  key={s.score}
                                  label={attackScoreLabel(s.score)}
                                  value={fmtNum(s.count)}
                                  color={attackScoreColor(s.score, i)}
                                  sparkData={attackOv.series}
                                  sparkKey={s.score}
                                  onClick={() => setActiveAttackScore(s.score)}
                                  active={activeAttackScore === s.score}
                                />
                              ))}
                            </div>

                            <div className="an-block">
                              <BlockHeader icon={Shield} title="Requests by WAF attack score" />
                              <div className="an-block-body" style={{ height: 280, padding: 0 }}>
                                {attackOv.series.length === 0 ? (
                                  <EmptyState message="Sem dados no período." />
                                ) : (
                                  <ChartBox height={280}>
                                    {(width) => (
                                      <BarChart
                                        width={width}
                                        height={280}
                                        data={attackOv.series}
                                        margin={{ top: 14, right: 16, bottom: 8, left: 8 }}
                                      >
                                        <CartesianGrid strokeDasharray="2 4" stroke={T.chartGrid} vertical={false} />
                                        <XAxis
                                          dataKey="ts"
                                          {...axisProps}
                                          tickFormatter={(v) => SafeHourDateTime(v, "hour")}
                                        />
                                        <YAxis
                                          {...axisProps}
                                          axisLine={false}
                                          tickFormatter={(v) => fmtNum(Number(v))}
                                        />
                                        <Tooltip
                                          content={<GenericTooltip />}
                                          cursor={{ fill: "rgba(var(--tl-ink, 255,255,255),0.04)" }}
                                        />
                                        <Legend
                                          wrapperStyle={{ fontSize: 10, fontFamily: "'IBM Plex Mono',monospace" }}
                                        />
                                        {orderedAttackScores.map((s, i) => (
                                          <Bar
                                            key={s.score}
                                            dataKey={s.score}
                                            stackId="score"
                                            fill={attackScoreColor(s.score, i)}
                                            name={attackScoreLabel(s.score)}
                                          />
                                        ))}
                                      </BarChart>
                                    )}
                                  </ChartBox>
                                )}
                              </div>
                            </div>

                            <div className="an-block">
                              <BlockHeader icon={Shield} title="WAF attack score distribution" />
                              <div className="an-block-body">
                                <div
                                  style={{
                                    fontSize: 11,
                                    color: V2.textMuted,
                                    marginBottom: 12,
                                    fontFamily: "var(--font-ui)",
                                  }}
                                >
                                  Cloudflare scores each request 1 (attack) through 99 (clean).
                                </div>
                                {orderedAttackScores.length === 0 ? (
                                  <EmptyState message="Sem dados no período." />
                                ) : (
                                  <>
                                    <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                                      {orderedAttackScores.map((s, i) => (
                                        <div
                                          key={s.score}
                                          className={`an-stat-row clickable${activeAttackScore === s.score ? " active" : ""}`}
                                          style={{
                                            position: "static",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 8,
                                            padding: "4px 0",
                                          }}
                                          onClick={() =>
                                            setActiveAttackScore(activeAttackScore === s.score ? null : s.score)
                                          }
                                        >
                                          <span
                                            style={{
                                              width: 8,
                                              height: 8,
                                              borderRadius: "50%",
                                              background: attackScoreColor(s.score, i),
                                              flexShrink: 0,
                                            }}
                                          />
                                          <span
                                            style={{
                                              fontSize: 12,
                                              color: V2.textSecondary,
                                              fontFamily: "var(--font-ui)",
                                              flex: 1,
                                            }}
                                          >
                                            {attackScoreLabel(s.score)}
                                          </span>
                                          <span
                                            style={{
                                              fontSize: 12,
                                              fontWeight: 600,
                                              color: V2.textPrimary,
                                              fontFamily: "'IBM Plex Mono',monospace",
                                            }}
                                          >
                                            {fmtNum(s.count)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                    <div
                                      style={{
                                        display: "flex",
                                        width: "100%",
                                        height: 10,
                                        borderRadius: 6,
                                        overflow: "hidden",
                                        background: V2.surfaceAlt,
                                      }}
                                    >
                                      {orderedAttackScores.map((s, i) => (
                                        <div
                                          key={s.score}
                                          style={{
                                            width: `${(s.count / attackScoreTotal) * 100}%`,
                                            background: attackScoreColor(s.score, i),
                                          }}
                                          title={`${attackScoreLabel(s.score)}: ${fmtNum(s.count)} (${((s.count / attackScoreTotal) * 100).toFixed(1)}%)`}
                                        />
                                      ))}
                                    </div>
                                  </>
                                )}
                                <div
                                  style={{
                                    fontSize: 11,
                                    color: V2.textMuted,
                                    marginTop: 14,
                                    fontFamily: "var(--font-ui)",
                                  }}
                                >
                                  Gain deeper control with granular attack scores, including various sub attack vectors
                                  such as SQLi, XSS and RCE.
                                </div>
                                <div style={{ display: "flex", justifyContent: "center", marginTop: 10 }}>
                                  <button
                                    className="an-page-btn"
                                    style={{ color: T.accent, borderColor: T.accent, cursor: "default" }}
                                    disabled
                                  >
                                    Upgrade to Enterprise
                                  </button>
                                </div>
                              </div>
                            </div>
                          </>
                        )}
                      </>
                    ) : (
                      <>
                        {/* KPIs */}
                        <div className="an-kpi-grid" style={{ gridTemplateColumns: "repeat(4,1fr)" }}>
                          <KpiCard
                            label="Total"
                            value={fmtNum(ov.totals.total)}
                            color={T.textPrimary}
                            onClick={() => setActiveSecurityKpi("total")}
                            active={activeSecurityKpi === "total"}
                          />
                          <KpiCard
                            label="Mitigated by Cloudflare"
                            value={fmtNum(ov.totals.mitigatedByWaf)}
                            color={T.warning}
                            sparkData={ov.series}
                            sparkKey="mitigatedByWaf"
                            onClick={() => setActiveSecurityKpi("mitigatedByWaf")}
                            active={activeSecurityKpi === "mitigatedByWaf"}
                          />
                          <KpiCard
                            label="Served by Cloudflare"
                            value={fmtNum(ov.totals.servedByCloudflare)}
                            color="#0D9488"
                            sparkData={ov.series}
                            sparkKey="servedByCloudflare"
                            onClick={() => setActiveSecurityKpi("servedByCloudflare")}
                            active={activeSecurityKpi === "servedByCloudflare"}
                          />
                          <KpiCard
                            label="Served by origin"
                            value={fmtNum(ov.totals.servedByOrigin)}
                            color={T.accent}
                            sparkData={ov.series}
                            sparkKey="servedByOrigin"
                            onClick={() => setActiveSecurityKpi("servedByOrigin")}
                            active={activeSecurityKpi === "servedByOrigin"}
                          />
                        </div>

                        {/* Number of requests mitigated and served by Cloudflare */}
                        <div className="an-block">
                          <BlockHeader icon={Shield} title="Number of requests mitigated and served by Cloudflare" />
                          <div className="an-block-body" style={{ height: 280, padding: 0 }}>
                            {ov.series.length === 0 ? (
                              <EmptyState message="Sem dados no período." />
                            ) : (
                              <ChartBox height={280}>
                                {(width) => (
                                  <LineChart
                                    width={width}
                                    height={280}
                                    data={ov.series}
                                    margin={{ top: 14, right: 16, bottom: 8, left: 8 }}
                                  >
                                    <CartesianGrid strokeDasharray="2 4" stroke={T.chartGrid} vertical={false} />
                                    <XAxis
                                      dataKey="ts"
                                      {...axisProps}
                                      tickFormatter={(v) => SafeHourDateTime(v, "hour")}
                                    />
                                    <YAxis {...axisProps} axisLine={false} tickFormatter={(v) => fmtNum(Number(v))} />
                                    <Tooltip content={<GenericTooltip />} cursor={{ stroke: T.borderHi }} />
                                    <Legend wrapperStyle={{ fontSize: 10, fontFamily: "'IBM Plex Mono',monospace" }} />
                                    <Line
                                      type="monotone"
                                      dataKey="mitigatedByWaf"
                                      stroke={T.warning}
                                      strokeWidth={2}
                                      dot={false}
                                      name="Mitigated by Cloudflare"
                                    />
                                    <Line
                                      type="monotone"
                                      dataKey="servedByCloudflare"
                                      stroke="#0D9488"
                                      strokeWidth={2}
                                      dot={false}
                                      name="Served by Cloudflare"
                                    />
                                    <Line
                                      type="monotone"
                                      dataKey="servedByOrigin"
                                      stroke={T.accent}
                                      strokeWidth={2}
                                      dot={false}
                                      name="Served by origin"
                                    />
                                  </LineChart>
                                )}
                              </ChartBox>
                            )}
                          </div>
                        </div>
                      </>
                    )}

                    {/* Top statistics */}
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        fontSize: 11,
                        color: V2.textMuted,
                        fontFamily: "'IBM Plex Mono',monospace",
                      }}
                    >
                      <span>Top statistics</span>
                      {securityTopStatsLoading && <span>carregando…</span>}
                    </div>
                    <div className="an-stats-grid">
                      <StatPanel
                        title="Source IPs"
                        icon={Activity}
                        rows={toReqRows(secTopStats?.clientIPs)}
                        onRowClick={(v) => setSecurityFilters((f) => [...f, { field: "ip", op: "eq", value: v }])}
                      />
                      <StatPanel
                        title="Origin IPs"
                        icon={Server}
                        rows={toReqRows(secTopStats?.originIPs)}
                        onRowClick={(v) => setSecurityFilters((f) => [...f, { field: "originIp", op: "eq", value: v }])}
                      />
                      <StatPanel
                        title="Hosts"
                        icon={Globe}
                        rows={toReqRows(secTopStats?.hosts)}
                        onRowClick={(v) => setSecurityFilters((f) => [...f, { field: "host", op: "eq", value: v }])}
                      />
                      <StatPanel
                        title="Paths"
                        icon={Link2}
                        rows={toReqRows(secTopStats?.paths)}
                        onRowClick={(v) => setSecurityFilters((f) => [...f, { field: "path", op: "eq", value: v }])}
                      />
                      <StatPanel
                        title="Edge status codes"
                        icon={Hash}
                        rows={toReqRows(secTopStats?.edgeStatusCodes)}
                        onRowClick={(v) =>
                          setSecurityFilters((f) => [...f, { field: "statusCodeEdge", op: "eq", value: v }])
                        }
                      />
                      <StatPanel
                        title="Source ASNs"
                        icon={Cpu}
                        rows={toReqRows(secTopStats?.asns)}
                        onRowClick={(v) =>
                          setSecurityFilters((f) => [
                            ...f,
                            { field: "asn", op: "eq", value: v.match(/^AS(\d+)/)?.[1] ?? v },
                          ])
                        }
                      />
                      <StatPanel
                        title="Source device types"
                        icon={Cpu}
                        rows={toReqRows(secTopStats?.deviceTypes)}
                        onRowClick={(v) =>
                          setSecurityFilters((f) => [...f, { field: "deviceType", op: "eq", value: v }])
                        }
                      />
                      <StatPanel
                        title="Web asset endpoints"
                        icon={Network}
                        rows={toReqRows(secTopStats?.apiGatewayEndpoints)}
                        onRowClick={(v) =>
                          setSecurityFilters((f) => [...f, { field: "apiGatewayEndpoint", op: "eq", value: v }])
                        }
                      />
                      <StatPanel
                        title="Origin status codes"
                        icon={Hash}
                        rows={toReqRows(secTopStats?.originStatusCodes)}
                        onRowClick={(v) =>
                          setSecurityFilters((f) => [...f, { field: "statusCodeOrigin", op: "eq", value: v }])
                        }
                      />
                      <StatPanel
                        title="Source user agents"
                        icon={Cpu}
                        rows={toReqRows(secTopStats?.userAgents)}
                        onRowClick={(v) =>
                          setSecurityFilters((f) => [...f, { field: "userAgent", op: "eq", value: v }])
                        }
                      />
                      <StatPanel
                        title="Source operating systems"
                        icon={Cpu}
                        rows={toReqRows(secTopStats?.operatingSystems)}
                        onRowClick={(v) => setSecurityFilters((f) => [...f, { field: "os", op: "eq", value: v }])}
                      />
                      <StatPanel
                        title="Query strings"
                        icon={Search}
                        rows={toReqRows(secTopStats?.queryStrings)}
                        onRowClick={(v) =>
                          setSecurityFilters((f) => [
                            ...f,
                            { field: "queryString", op: "eq", value: v === "(vazio)" ? "" : v },
                          ])
                        }
                      />
                      <StatPanel
                        title="Cache statuses"
                        icon={Database}
                        rows={toReqRows(secTopStats?.cacheStatuses)}
                        onRowClick={(v) =>
                          setSecurityFilters((f) => [...f, { field: "cacheStatus", op: "eq", value: v }])
                        }
                      />
                      <StatPanel
                        title="Source browsers"
                        icon={Cpu}
                        rows={toReqRows(secTopStats?.browsers)}
                        onRowClick={(v) => setSecurityFilters((f) => [...f, { field: "browser", op: "eq", value: v }])}
                      />
                      <StatPanel
                        title="Referers"
                        icon={Link2}
                        rows={toReqRows(secTopStats?.referers)}
                        onRowClick={(v) => setSecurityFilters((f) => [...f, { field: "referer", op: "eq", value: v }])}
                      />
                      <StatPanel
                        title="HTTP methods"
                        icon={Activity}
                        rows={toReqRows(secTopStats?.methods)}
                        onRowClick={(v) => setSecurityFilters((f) => [...f, { field: "method", op: "eq", value: v }])}
                      />
                      <StatPanel
                        title="Countries"
                        icon={Globe}
                        rows={toReqRows(secTopStats?.countries)}
                        onRowClick={(v) => setSecurityFilters((f) => [...f, { field: "country", op: "eq", value: v }])}
                      />
                      <StatPanel
                        title="X-Requested-With headers"
                        icon={Hash}
                        rows={toReqRows(secTopStats?.xRequestedWith)}
                        onRowClick={(v) =>
                          setSecurityFilters((f) => [
                            ...f,
                            { field: "xRequestedWith", op: "eq", value: v === "(vazio)" ? "" : v },
                          ])
                        }
                      />
                      <StatPanel
                        title="HTTP versions"
                        icon={Hash}
                        rows={toReqRows(secTopStats?.httpVersions)}
                        onRowClick={(v) =>
                          setSecurityFilters((f) => [...f, { field: "httpVersion", op: "eq", value: v }])
                        }
                      />
                      <StatPanel
                        title="Data centers"
                        icon={Server}
                        rows={toReqRows(secTopStats?.dataCenters)}
                        onRowClick={(v) =>
                          setSecurityFilters((f) => [...f, { field: "dataCenter", op: "eq", value: v }])
                        }
                      />
                      <StatPanel
                        title="Security services"
                        icon={Shield}
                        rows={toReqRows(secTopStats?.securitySources)}
                        onRowClick={(v) =>
                          setSecurityFilters((f) => [...f, { field: "securitySource", op: "eq", value: v }])
                        }
                      />
                      <StatPanel
                        title="Security actions"
                        icon={Shield}
                        rows={toReqRows(secTopStats?.securityActions)}
                        onRowClick={(v) =>
                          setSecurityFilters((f) => [...f, { field: "securityAction", op: "eq", value: v }])
                        }
                      />
                      <StatPanel
                        title="SSL Protocols"
                        icon={Lock}
                        rows={toReqRows(secTopStats?.sslProtocols)}
                        onRowClick={(v) =>
                          setSecurityFilters((f) => [...f, { field: "sslProtocol", op: "eq", value: v }])
                        }
                      />
                    </div>

                    {/* Sampled Logs */}
                    <div className="an-block">
                      <BlockHeader icon={Search} title="Sampled logs" />
                      {securityLogsLoading && (
                        <div
                          style={{
                            padding: "8px 16px 0",
                            fontSize: 10,
                            color: V2.textMuted,
                            fontFamily: "var(--font-ui)",
                          }}
                        >
                          Atualizando…
                        </div>
                      )}
                      <div style={{ flex: 1, overflow: "auto", maxHeight: 460 }}>
                        <table className="an-table">
                          <thead style={{ position: "sticky", top: 0, zIndex: 20 }}>
                            <tr>
                              <th style={{ background: V2.surface, width: 24 }}></th>
                              <th style={{ background: V2.surface }}>Time</th>
                              <th style={{ background: V2.surface }}>Source IP</th>
                              <th style={{ background: V2.surface }}>Host</th>
                              <th style={{ background: V2.surface }}>Path</th>
                              <th style={{ background: V2.surface }}>Ray ID</th>
                              <th style={{ background: V2.surface }}>Analyses</th>
                            </tr>
                          </thead>
                          <tbody>
                            {pageSecLogs.length === 0 && (
                              <tr>
                                <td colSpan={7} className="an-empty">
                                  Nenhum log no período.
                                </td>
                              </tr>
                            )}
                            {pageSecLogs.map((l: SecuritySampledLog, i: number) => {
                              const key = l.rayName || `${l.datetime}-${l.clientIP}-${i}`;
                              const isOpen = !!secLogPanels[key];
                              return (
                                <tr
                                  key={key}
                                  className={isOpen ? "an-row-open" : undefined}
                                  style={{ cursor: "pointer" }}
                                  onClick={(e) => openSecLogPanel(l, e)}
                                >
                                  <td>{isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}</td>
                                  <td className="mono dim" style={{ whiteSpace: "nowrap" }}>
                                    {SafeHourDateTime(l.datetime, "full")}
                                  </td>
                                  <td className="mono dim">{l.clientIP}</td>
                                  <td
                                    className="mono dim"
                                    style={{
                                      maxWidth: 160,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {l.host}
                                  </td>
                                  <td
                                    className="mono dim"
                                    style={{
                                      maxWidth: 180,
                                      overflow: "hidden",
                                      textOverflow: "ellipsis",
                                      whiteSpace: "nowrap",
                                    }}
                                  >
                                    {l.path}
                                  </td>
                                  <td className="mono dim">{l.rayName}</td>
                                  <td>
                                    <span
                                      className="an-badge"
                                      style={{
                                        background: T.accentSoft,
                                        color: T.accent,
                                        border: "1px solid rgba(59,130,246,0.25)",
                                      }}
                                    >
                                      {l.wafAttackScoreClass && l.wafAttackScoreClass !== "unknown"
                                        ? l.wafAttackScoreClass
                                        : "Not an exploit"}
                                    </span>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                      <div className="an-pagination">
                        <span>
                          {secLogs.length === 0 ? 0 : (logsPage - 1) * LOGS_PAGE_SIZE + 1}–
                          {Math.min(logsPage * LOGS_PAGE_SIZE, secLogs.length)} de {secLogs.length}
                        </span>
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            className="an-page-btn"
                            disabled={logsPage <= 1}
                            onClick={() => setLogsPage((p) => Math.max(1, p - 1))}
                          >
                            Anterior
                          </button>
                          <span>
                            Página {logsPage} de {totalSecLogPages}
                          </span>
                          <button
                            className="an-page-btn"
                            disabled={logsPage >= totalSecLogPages}
                            onClick={() => setLogsPage((p) => Math.min(totalSecLogPages, p + 1))}
                          >
                            Próxima
                          </button>
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </>
            )}
          </>
        )}

        {/* ── Janelas flutuantes de detalhe (Sampled logs · Traffic/Events) ── */}
        {Object.entries(secLogPanels).map(([key, p]) => (
          <DraggableLogPanel
            key={key}
            title="Detalhes da requisição"
            x={p.x}
            y={p.y}
            z={p.z}
            onClose={() => closeSecLogPanel(key)}
            onFocus={() => focusSecLogPanel(key)}
            onMove={(x, y) => moveSecLogPanel(key, x, y)}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 8,
                  flexWrap: "wrap",
                }}
              >
                <div className="an-log-detail-title" style={{ marginBottom: 0 }}>
                  Edge response
                </div>
                <RelatedSecurityEventsButton zoneId={zoneId} days={days} rayName={p.log.rayName} />
              </div>
              <div className="an-log-detail" style={{ marginTop: 8 }}>
                <div>
                  <b>Mitigation:</b>{" "}
                  {p.log.securityAction && p.log.securityAction !== "unknown" ? p.log.securityAction : "Not mitigated"}
                </div>
                <div>
                  <b>Cache status:</b> {p.log.cacheStatus || "—"}
                </div>
                <div>
                  <b>Edge status code:</b> {p.log.edgeResponseStatus || "—"}
                </div>
                <div>
                  <b>Delivered Content type:</b> {p.log.edgeResponseContentTypeName || "—"}
                </div>
                <div>
                  <b>Origin status code:</b> {p.log.originResponseStatus || "None"}
                </div>
              </div>
            </div>
            <div>
              <div className="an-log-detail-title">Request analyses</div>
              <div className="an-log-detail">
                <div>
                  <b>WAF Attack Score:</b>{" "}
                  {p.log.wafAttackScoreClass && p.log.wafAttackScoreClass !== "unknown"
                    ? p.log.wafAttackScoreClass
                    : "Not an exploit"}
                </div>
                <div>
                  <b>Other suspicious activity:</b> {p.log.leakedCredentialCheckResult || "None"}
                </div>
              </div>
            </div>
            <div>
              <div className="an-log-detail-title">Request details</div>
              <div className="an-log-detail">
                <div>
                  <b>IP:</b> {p.log.clientIP}
                </div>
                <div>
                  <b>Country:</b> {p.log.clientCountryName}
                </div>
                <div>
                  <b>ASN:</b> {p.log.clientAsn ? `${p.log.clientAsn} - ${p.log.clientASNDescription}` : "—"}
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <b>User agent:</b> {p.log.userAgent || "—"}
                </div>
                <div>
                  <b>Referer:</b> {p.log.referer || "None"}
                </div>
                <div>
                  <b>Method:</b> {p.log.method}
                </div>
                <div>
                  <b>Scheme:</b> {p.log.scheme}
                </div>
                <div>
                  <b>Host:</b> {p.log.host}
                </div>
                <div>
                  <b>Path:</b> {p.log.path}
                </div>
                <div>
                  <b>Query string:</b> {p.log.queryString || "None"}
                </div>
                <div>
                  <b>Verified Bot Category:</b> {p.log.verifiedBotCategory || "None"}
                </div>
              </div>
            </div>
          </DraggableLogPanel>
        ))}

        {Object.entries(eventLogPanels).map(([key, p]) => (
          <DraggableLogPanel
            key={key}
            title="Detalhes do evento"
            x={p.x}
            y={p.y}
            z={p.z}
            onClose={() => closeEventLogPanel(key)}
            onFocus={() => focusEventLogPanel(key)}
            onMove={(x, y) => moveEventLogPanel(key, x, y)}
          >
            <div>
              <div className="an-log-detail-title">Event details</div>
              <div className="an-log-detail">
                <div>
                  <b>Action taken:</b> {eventActionLabel(p.log.action)}
                </div>
                <div>
                  <b>Service:</b> {eventServiceLabel(p.log.source)}
                </div>
                <div>
                  <b>Rule:</b> {p.log.description || p.log.ruleId}
                </div>
                <div>
                  <b>Ray ID:</b> {p.log.rayName}
                </div>
              </div>
            </div>
            <div>
              <div className="an-log-detail-title">Request details</div>
              <div className="an-log-detail">
                <div>
                  <b>IP:</b> {p.log.clientIP}
                </div>
                <div>
                  <b>Country:</b> {p.log.clientCountryName}
                </div>
                <div>
                  <b>ASN:</b> {p.log.clientAsn ? `${p.log.clientAsn} - ${p.log.clientASNDescription}` : "—"}
                </div>
                <div style={{ gridColumn: "1 / -1" }}>
                  <b>User agent:</b> {p.log.userAgent || "—"}
                </div>
                <div>
                  <b>Referer:</b> {p.log.referer || "None"}
                </div>
                <div>
                  <b>Method:</b> {p.log.method}
                </div>
                <div>
                  <b>Host:</b> {p.log.host}
                </div>
                <div>
                  <b>Path:</b> {p.log.path}
                </div>
                <div>
                  <b>Query string:</b> {p.log.queryString || "None"}
                </div>
                <div>
                  <b>WAF Attack Score:</b>{" "}
                  {p.log.wafAttackScoreClass && p.log.wafAttackScoreClass !== "unknown"
                    ? p.log.wafAttackScoreClass
                    : "Not an exploit"}
                </div>
              </div>
            </div>
          </DraggableLogPanel>
        ))}

        {/* ── Web Analytics ── */}
        {activeSection === "web" && <WebAnalyticsTab zoneId={zoneId} days={days} />}

        {/* ── Network (Load Balancing Analytics) ── */}
        {activeSection === "network" && <LoadBalancingTab zoneId={zoneId} days={days} />}
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%" }}>
      <span style={{ fontSize: 12, color: V2.textMuted, fontFamily: "var(--font-ui)" }}>{message}</span>
    </div>
  );
}

// Mede a própria largura via ResizeObserver e passa width/height numéricos
// diretamente pro recharts, em vez de depender do <ResponsiveContainer>
// (que, dentro de um flex column sem grid explícito, às vezes nunca resolve
// uma altura/largura definida e renderiza o SVG com 0x0 — gráfico "some").
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
