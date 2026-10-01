import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { MODULE_BY_SLUG } from "@/lib/modules";
import { seedAuthAccessHistory } from "@/lib/access-logs.functions";
import { type CronJobRun, getCronHealth, fmtDateTime } from "./CronHealthBadge";
import {
  Trash2,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  X,
  GitBranch,
  Mail,
  ShieldCheck,
  AlertTriangle,
  RefreshCw,
  UserCheck,
  Timer,
  KeyRound,
  UserPlus,
  LogIn,
  LogOut,
  Activity,
  MapPin,
  Globe,
  Monitor,
  Wifi,
  AlertCircle,
  Terminal,
  Laptop,
  Smartphone,
  Pencil,
  Power,
} from "lucide-react";

// ─── Design Tokens (espelho do módulo Integrações) ──────────────────────────
const T = {
  surface: "#0F1420",
  surfaceAlt: "#131825",
  surfaceHover: "#161C2E",
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
  info: "#6366F1",
  infoBg: "rgba(99,102,241,0.10)",
  neutral: "#6B7280",
  textPrimary: "#F1F5F9",
  textSecondary: "#F1F5F9",
  textMuted: "#F1F5F9",
  textSubtle: "#F1F5F9",
};

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');

  .logs-root { font-family:'DM Sans',sans-serif; color:${T.textPrimary}; }
  .logs-root * { box-sizing:border-box; }

  /* ── Page header ── */
  .logs-page-header {
    background:${T.surface}; border:1px solid ${T.border}; border-radius:10px;
    padding:16px 22px; display:flex; align-items:center; justify-content:space-between;
    margin-bottom:4px;
  }
  .logs-page-title {
    font-size:14px; font-weight:700; color:${T.textPrimary};
    font-family:'Space Grotesk',sans-serif; letter-spacing:-0.01em;
  }
  .logs-page-sub { font-size:12px; color:${T.textMuted}; margin-top:3px; line-height:1.5; }

  .logs-stat-pill {
    display:inline-flex; align-items:center; gap:5px; padding:4px 10px;
    border-radius:5px; font-size:10px; font-weight:700; letter-spacing:0.08em;
    text-transform:uppercase; font-family:'IBM Plex Mono',monospace; white-space:nowrap;
  }
  .logs-stat-pill.ok   { background:${T.successBg}; color:${T.success}; border:1px solid rgba(16,185,129,0.2); }
  .logs-stat-pill.err  { background:${T.dangerBg};  color:${T.danger};  border:1px solid rgba(239,68,68,0.2); }
  .logs-stat-pill.info { background:${T.accentSoft}; color:${T.accent}; border:1px solid rgba(59,130,246,0.2); }
  .logs-stat-dot { width:5px; height:5px; border-radius:50%; background:currentColor; flex-shrink:0; }

  /* ── Tab navigation ── */
  .logs-root [role="tablist"] {
    background:${T.surfaceAlt}; border:1px solid ${T.border}; border-radius:10px;
    padding:4px; gap:2px; height:auto; overflow-x:auto; flex-wrap:nowrap;
    scrollbar-width:none; -ms-overflow-style:none;
  }
  .logs-root [role="tablist"]::-webkit-scrollbar { display:none; }
  .logs-root [role="tab"] {
    font-size:12px; font-weight:500; font-family:'DM Sans',sans-serif;
    color:rgba(148,163,184,0.7); border-radius:7px; padding:6px 12px; height:auto;
    white-space:nowrap; border:1px solid transparent; background:transparent;
    transition:color 0.15s, background 0.15s, border-color 0.15s;
    display:inline-flex; align-items:center; gap:5px; line-height:1;
  }
  .logs-root [role="tab"]:hover:not([data-state="active"]) {
    background:${T.surfaceHover}; color:rgba(241,245,249,0.75);
  }
  .logs-root [role="tab"][data-state="active"] {
    background:${T.accentSoft}; border-color:rgba(59,130,246,0.22);
    color:${T.accent}; font-weight:600; box-shadow:none;
  }
  .logs-tab-badge {
    display:inline-flex; align-items:center; justify-content:center;
    min-width:15px; height:15px; padding:0 4px; border-radius:99px;
    background:${T.danger}; color:#fff;
    font-size:9px; font-weight:700; font-family:'IBM Plex Mono',monospace; line-height:1;
  }

  /* ── KPI grid ── */
  .logs-kpi-grid { display:grid; gap:12px; }
  .logs-kpi-grid.col3 { grid-template-columns:repeat(3,1fr); }
  .logs-kpi-grid.col4 { grid-template-columns:repeat(4,1fr); }
  .logs-kpi-grid.col5 { grid-template-columns:repeat(5,1fr); }
  .logs-kpi-grid.col6 { grid-template-columns:repeat(6,1fr); }

  .logs-kpi-card {
    background:${T.surface}; border:1px solid ${T.border}; border-radius:10px;
    padding:14px 16px; display:flex; flex-direction:column; gap:6px;
    position:relative; overflow:hidden; transition:border-color 0.2s;
  }
  .logs-kpi-card:hover { border-color:${T.borderHi}; }
  .logs-kpi-card::before {
    content:''; position:absolute; top:0; left:0; right:0; height:2px;
    background:var(--kpi-color,${T.accent});
  }
  .logs-kpi-label {
    font-size:9px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase;
    color:${T.textMuted}; font-family:'IBM Plex Mono',monospace;
  }
  .logs-kpi-value {
    font-size:22px; font-weight:700; font-family:'Space Grotesk',sans-serif;
    color:var(--kpi-color,${T.accent}); line-height:1; display:flex; align-items:center; gap:7px;
  }

  /* ── Panel ── */
  .logs-panel {
    background:${T.surface}; border:1px solid ${T.border}; border-radius:10px; overflow:hidden;
  }
  .logs-panel-header {
    padding:12px 18px; border-bottom:1px solid ${T.border};
    font-size:11px; font-weight:700; color:${T.textSecondary};
    font-family:'IBM Plex Mono',monospace; letter-spacing:0.06em; text-transform:uppercase;
    display:flex; align-items:center; justify-content:space-between;
  }
  .logs-panel-body { padding:16px 18px; }

  /* ── Filters bar ── */
  .logs-filters {
    display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin-bottom:14px;
  }
  .logs-select {
    background:${T.surfaceAlt}; border:1px solid ${T.border}; border-radius:6px;
    padding:6px 10px; font-size:12px; color:${T.textPrimary};
    font-family:'IBM Plex Mono',monospace; outline:none; cursor:pointer;
    transition:border-color 0.15s;
  }
  .logs-select:focus { border-color:rgba(59,130,246,0.5); }
  .logs-search {
    background:${T.surfaceAlt}; border:1px solid ${T.border}; border-radius:6px;
    padding:6px 28px 6px 10px; font-size:12px; color:${T.textPrimary};
    font-family:'IBM Plex Mono',monospace; outline:none; width:200px;
    transition:border-color 0.15s;
  }
  .logs-search:focus { border-color:rgba(59,130,246,0.5); }
  .logs-search::placeholder { color:${T.textSubtle}; }
  .logs-search-wrap { position:relative; }
  .logs-search-clear {
    position:absolute; right:7px; top:50%; transform:translateY(-50%);
    background:none; border:none; cursor:pointer; color:${T.textMuted}; display:flex; align-items:center;
    padding:0;
  }
  .logs-clear-btn {
    display:flex; align-items:center; gap:4px; padding:5px 9px; border-radius:5px;
    background:${T.dangerBg}; border:1px solid rgba(239,68,68,0.2); color:${T.danger};
    font-size:11px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif;
    transition:filter 0.15s;
  }
  .logs-clear-btn:hover { filter:brightness(1.2); }
  .logs-count { margin-left:auto; font-size:11px; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; }

  /* ── Table ── */
  .logs-table-wrap { overflow:auto; max-height:560px; }
  .logs-table { width:100%; border-collapse:collapse; font-size:12px; }
  .logs-table thead { position:sticky; top:0; z-index:10; background:${T.surfaceAlt}; }
  .logs-table th {
    text-align:left; padding:9px 12px; font-size:9px; font-weight:700;
    letter-spacing:0.12em; text-transform:uppercase; color:${T.textMuted};
    font-family:'IBM Plex Mono',monospace; border-bottom:1px solid ${T.border};
    white-space:nowrap;
  }
  .logs-table td { padding:9px 12px; border-bottom:1px solid ${T.border}; vertical-align:middle; }
  .logs-table tr:last-child td { border-bottom:none; }
  .logs-table tbody tr { transition:background 0.12s; }
  .logs-table tbody tr:hover { background:${T.surfaceHover}; }
  .logs-table .mono { font-family:'IBM Plex Mono',monospace; }
  .logs-table .muted { color:${T.textMuted}; }

  /* ── Method badge ── */
  .logs-method-sso {
    display:inline-flex; align-items:center; gap:4px; padding:2px 7px;
    border-radius:4px; font-size:9px; font-weight:700; letter-spacing:0.08em;
    text-transform:uppercase; font-family:'IBM Plex Mono',monospace;
    background:rgba(99,102,241,0.12); color:#818CF8; border:1px solid rgba(99,102,241,0.25);
  }
  .logs-method-email {
    display:inline-flex; align-items:center; gap:4px; padding:2px 7px;
    border-radius:4px; font-size:9px; font-weight:700; letter-spacing:0.08em;
    text-transform:uppercase; font-family:'IBM Plex Mono',monospace;
    background:${T.accentSoft}; color:${T.accent}; border:1px solid rgba(59,130,246,0.2);
  }
  .logs-method-invite {
    display:inline-flex; align-items:center; gap:4px; padding:2px 7px;
    border-radius:4px; font-size:9px; font-weight:700; letter-spacing:0.08em;
    text-transform:uppercase; font-family:'IBM Plex Mono',monospace;
    background:rgba(245,158,11,0.12); color:${T.warning}; border:1px solid rgba(245,158,11,0.25);
  }

  /* ── Status badge ── */
  .logs-badge-success {
    display:inline-flex; align-items:center; gap:4px; padding:2px 7px;
    border-radius:4px; font-size:9px; font-weight:700; letter-spacing:0.08em;
    text-transform:uppercase; font-family:'IBM Plex Mono',monospace;
    background:${T.successBg}; color:${T.success}; border:1px solid rgba(16,185,129,0.2);
  }
  .logs-badge-error {
    display:inline-flex; align-items:center; gap:4px; padding:2px 7px;
    border-radius:4px; font-size:9px; font-weight:700; letter-spacing:0.08em;
    text-transform:uppercase; font-family:'IBM Plex Mono',monospace;
    background:${T.dangerBg}; color:${T.danger}; border:1px solid rgba(239,68,68,0.2);
  }
  .logs-badge-warning {
    display:inline-flex; align-items:center; gap:4px; padding:2px 7px;
    border-radius:4px; font-size:9px; font-weight:700; letter-spacing:0.08em;
    text-transform:uppercase; font-family:'IBM Plex Mono',monospace;
    background:${T.warningBg}; color:${T.warning}; border:1px solid rgba(245,158,11,0.2);
  }
  .logs-badge-info {
    display:inline-flex; align-items:center; gap:4px; padding:2px 7px;
    border-radius:4px; font-size:9px; font-weight:700; letter-spacing:0.08em;
    text-transform:uppercase; font-family:'IBM Plex Mono',monospace;
    background:${T.infoBg}; color:${T.info}; border:1px solid rgba(99,102,241,0.2);
  }
  .logs-badge-muted {
    display:inline-flex; align-items:center; gap:4px; padding:2px 7px;
    border-radius:4px; font-size:9px; font-weight:700; letter-spacing:0.08em;
    text-transform:uppercase; font-family:'IBM Plex Mono',monospace;
    background:rgba(107,114,128,0.1); color:${T.neutral}; border:1px solid rgba(107,114,128,0.2);
  }

  /* ── Filter chips (botões inline da AuditTab) ── */
  .logs-chip {
    padding:4px 10px; border-radius:5px; font-size:11px; font-weight:600;
    border:1px solid ${T.border}; color:${T.textMuted}; cursor:pointer;
    background:${T.surfaceAlt}; transition:all 0.12s; font-family:'DM Sans',sans-serif;
  }
  .logs-chip.active {
    background:rgba(59,130,246,0.12); border-color:rgba(59,130,246,0.4); color:${T.textPrimary};
  }
  .logs-chip:hover:not(.active) { color:${T.textPrimary}; border-color:${T.borderHi}; }

  /* ── Details row ── */
  .logs-expand-row td { background:${T.surfaceAlt}; padding:14px 20px; }
  .logs-expand-label {
    font-size:9px; font-family:'IBM Plex Mono',monospace; text-transform:uppercase;
    letter-spacing:0.12em; color:${T.textMuted}; margin-bottom:6px;
  }

  /* ── Access detail cards ── */
  .logs-detail-section {
    display:flex; flex-direction:column; gap:10px;
  }
  .logs-detail-cards {
    display:grid; grid-template-columns:repeat(auto-fill,minmax(180px,1fr)); gap:10px;
  }
  .logs-detail-card {
    background:${T.surface}; border:1px solid ${T.border}; border-radius:8px;
    padding:12px 14px; border-left:3px solid var(--dc,${T.border});
    display:flex; flex-direction:column; gap:5px;
  }
  .logs-detail-card-hd {
    display:flex; align-items:center; gap:5px;
    font-size:9px; font-family:'IBM Plex Mono',monospace; text-transform:uppercase;
    letter-spacing:0.1em; color:${T.textMuted};
  }
  .logs-detail-card-val {
    font-size:13px; font-weight:600; color:${T.textPrimary};
    font-family:'Space Grotesk',sans-serif; line-height:1.3; word-break:break-all;
  }
  .logs-detail-card-val.mono { font-family:'IBM Plex Mono',monospace; font-size:12px; }
  .logs-detail-card-sub {
    font-size:10px; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace;
    line-height:1.4; word-break:break-all;
  }
  .logs-detail-divider {
    height:1px; background:${T.border}; margin:4px 0;
  }
  .logs-detail-error {
    background:rgba(239,68,68,0.06); border:1px solid rgba(239,68,68,0.2);
    border-radius:8px; padding:12px 14px; border-left:3px solid ${T.danger};
  }
  .logs-detail-error-hd {
    display:flex; align-items:center; gap:5px; margin-bottom:6px;
    font-size:9px; font-family:'IBM Plex Mono',monospace; text-transform:uppercase;
    letter-spacing:0.1em; color:${T.danger};
  }
  .logs-detail-error-msg {
    font-size:12px; color:${T.danger}; font-family:'IBM Plex Mono',monospace;
    line-height:1.5; word-break:break-word;
  }
  .logs-detail-ua {
    background:${T.surface}; border:1px solid ${T.border}; border-radius:8px;
    padding:10px 14px;
  }
  .logs-detail-ua-hd {
    display:flex; align-items:center; gap:5px; margin-bottom:5px;
    font-size:9px; font-family:'IBM Plex Mono',monospace; text-transform:uppercase;
    letter-spacing:0.1em; color:${T.textMuted};
  }
  .logs-detail-ua-val {
    font-size:10px; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace;
    line-height:1.5; word-break:break-all;
  }

  /* ── Cron cards ── */
  .logs-cron-grid {
    display:grid; grid-template-columns:repeat(auto-fill,minmax(480px,1fr)); gap:14px;
  }
  .logs-cron-card {
    background:${T.surface}; border:1px solid ${T.border}; border-radius:10px;
    overflow:hidden; border-left:3px solid var(--cc,${T.border});
    display:flex; flex-direction:column;
    transition:border-color 0.2s, box-shadow 0.2s;
  }
  .logs-cron-card:hover { box-shadow:0 0 0 1px ${T.borderHi}; }
  .logs-cron-card-hd {
    padding:14px 20px 12px; display:flex; align-items:center;
    justify-content:space-between; gap:8px; border-bottom:1px solid ${T.border};
  }
  .logs-cron-card-left { display:flex; align-items:center; gap:9px; min-width:0; }
  .logs-cron-dot {
    width:9px; height:9px; border-radius:50%; flex-shrink:0;
    background:var(--cc,${T.neutral}); position:relative;
  }
  .logs-cron-dot.pulse::after {
    content:''; position:absolute; inset:-3px; border-radius:50%;
    border:2px solid var(--cc,${T.neutral}); opacity:0;
    animation:cronRing 2.2s ease-out infinite;
  }
  @keyframes cronRing {
    0%   { transform:scale(0.6); opacity:0.7; }
    100% { transform:scale(1.8); opacity:0; }
  }
  .logs-cron-name {
    font-size:13px; font-weight:700; color:${T.textPrimary};
    font-family:'Space Grotesk',sans-serif; white-space:nowrap;
    overflow:hidden; text-overflow:ellipsis;
  }
  .logs-cron-badges { display:flex; gap:6px; flex-shrink:0; }
  .logs-cron-body { padding:16px 20px; display:flex; flex-direction:column; gap:14px; }
  .logs-cron-stats {
    display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px;
  }
  .logs-cron-stat { display:flex; flex-direction:column; gap:4px; }
  .logs-cron-stat-lbl {
    display:flex; align-items:center; gap:4px; font-size:9px;
    font-family:'IBM Plex Mono',monospace; text-transform:uppercase;
    letter-spacing:0.1em; color:${T.textMuted};
  }
  .logs-cron-stat-val {
    font-size:11px; font-family:'IBM Plex Mono',monospace; color:${T.textSecondary};
    font-weight:500;
  }
  .logs-cron-stat-val.large {
    font-size:15px; font-family:'Space Grotesk',sans-serif;
    font-weight:700; color:var(--cc,${T.accent});
  }
  .logs-cron-bar-wrap {
    height:4px; background:${T.border}; border-radius:2px; overflow:hidden;
  }
  .logs-cron-bar {
    height:100%; border-radius:2px; transition:width 0.6s ease;
    background:var(--bar-color,${T.success});
  }
  .logs-cron-bar-label {
    display:flex; justify-content:space-between; align-items:center;
    font-size:9px; font-family:'IBM Plex Mono',monospace;
    color:${T.textMuted}; margin-bottom:5px;
  }
  .logs-cron-error {
    background:rgba(239,68,68,0.06); border:1px solid rgba(239,68,68,0.2);
    border-radius:7px; padding:10px 12px; border-left:3px solid ${T.danger};
  }
  .logs-cron-error-hd {
    display:flex; align-items:center; gap:5px; margin-bottom:5px;
    font-size:9px; font-family:'IBM Plex Mono',monospace;
    text-transform:uppercase; letter-spacing:0.1em; color:${T.danger};
  }
  .logs-cron-error-msg {
    font-size:11px; color:${T.danger}; font-family:'IBM Plex Mono',monospace;
    line-height:1.5; word-break:break-word;
  }

  /* ── Scrollbar ── */
  .logs-root ::-webkit-scrollbar { width:4px; height:4px; }
  .logs-root ::-webkit-scrollbar-track { background:transparent; }
  .logs-root ::-webkit-scrollbar-thumb { background:${T.borderHi}; border-radius:2px; }

  .logs-empty {
    padding:40px 0; text-align:center; color:${T.textMuted};
    font-size:13px; font-family:'DM Sans',sans-serif;
  }
  .logs-loading { padding:32px 0; text-align:center; color:${T.textMuted}; font-size:13px; }
`;

// ─── Types ─────────────────────────────────────────────────────────────────────

type VulnLog = {
  id: string;
  vuln_id: string | null;
  fqdn: string | null;
  tipo_evento: string;
  descricao: string;
  usuario_email: string | null;
  usuario_nome: string | null;
  status: string;
  detalhes: Record<string, unknown> | null;
  created_at: string;
};

type GmudLog = {
  id: string;
  gmud_id: string | null;
  gmud_titulo: string | null;
  tipo_evento:
    | "criacao"
    | "aprovacao"
    | "rejeicao"
    | "mudanca_status"
    | "exclusao"
    | "email_enviado"
    | "email_erro"
    | "erro";
  descricao: string;
  usuario_email: string | null;
  usuario_nome: string | null;
  status: "success" | "error" | "warning" | "info";
  detalhes: Record<string, unknown> | null;
  created_at: string;
};

type ImportLog = {
  id: string;
  module: string;
  filename: string | null;
  status: "success" | "error" | "partial";
  imported_count: number;
  ignored_count: number;
  total_count: number;
  message: string | null;
  created_at: string;
};

type ApiLog = {
  id: string;
  provider: string;
  status: "success" | "error";
  http_status: number | null;
  message: string | null;
  duration_ms: number | null;
  created_at: string;
};

type AuditLogRaw = {
  id: string;
  action: string;
  status: "success" | "error";
  zone_id: string | null;
  zone_name: string | null;
  details: unknown;
  message: string | null;
  user_email: string | null;
  duration_ms: number | null;
  created_at: string;
};

type AuditLog = {
  id: string;
  action: "purge_cache" | "create_dns" | "update_dns" | "update_rule" | "toggle_rule" | "delete_rule";
  status: "success" | "error";
  zone_id: string | null;
  zone_name: string | null;
  details: Record<string, unknown> | null;
  message: string | null;
  user_email: string | null;
  duration_ms: number | null;
  created_at: string;
};

type AccessLog = {
  id: string;
  created_at: string;
  email: string;
  user_id: string | null;
  full_name: string | null;
  role: string | null;
  status: "success" | "error";
  error_message: string | null;
  user_agent: string | null;
  login_method: string | null;
  ip: string | null;
  event_type: "login" | "logout";
  logout_reason: "manual" | "inactivity" | "expired" | null;
};

type SystemAuditLog = {
  id: string;
  created_at: string;
  user_id: string | null;
  usuario_email: string | null;
  usuario_nome: string | null;
  modulo: string;
  acao: string;
  descricao: string;
  status: "success" | "error";
  mensagem_erro: string | null;
  detalhes: Record<string, unknown> | null;
};

// ─── Helpers de IP / Geolocalização ──────────────────────────────────────────

type GeoResult = {
  country_name: string;
  country_code: string;
  city: string;
  org: string;
};

const geoCache = new Map<string, GeoResult | null>();

function isPrivateIp(ip: string): boolean {
  return (
    /^127\./.test(ip) ||
    /^10\./.test(ip) ||
    /^192\.168\./.test(ip) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(ip) ||
    ip === "::1" ||
    ip === "localhost"
  );
}

async function fetchGeo(ip: string): Promise<GeoResult | null> {
  if (!ip || isPrivateIp(ip)) return null;
  if (geoCache.has(ip)) return geoCache.get(ip)!;
  try {
    const res = await fetch(`https://ipapi.co/${ip}/json/`);
    if (!res.ok) {
      geoCache.set(ip, null);
      return null;
    }
    const d = (await res.json()) as any;
    const result: GeoResult = {
      country_name: d.country_name ?? "—",
      country_code: d.country_code ?? "",
      city: d.city ?? "—",
      org: d.org ?? "—",
    };
    geoCache.set(ip, result);
    return result;
  } catch {
    geoCache.set(ip, null);
    return null;
  }
}

function countryFlag(code: string): string {
  if (!code || code.length !== 2) return "🌐";
  return String.fromCodePoint(...[...code.toUpperCase()].map((c) => 0x1f1e6 + c.charCodeAt(0) - 65));
}

// ─── Helpers de User-Agent ────────────────────────────────────────────────────

function parseDevice(ua: string | null): string {
  if (!ua) return "—";
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Android/i.test(ua) && /Mobile/i.test(ua)) return "Android Phone";
  if (/Android/i.test(ua)) return "Android Tablet";
  if (/Windows NT/i.test(ua)) return "Windows";
  if (/Macintosh|Mac OS X/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "Desconhecido";
}

function parseBrowser(ua: string | null): string {
  if (!ua) return "—";
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\/|Opera/i.test(ua)) return "Opera";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Chrome\//i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua)) return "Safari";
  return "Outro";
}

function normalizeAuditLog(raw: AuditLogRaw): AuditLog {
  const details =
    raw.details && typeof raw.details === "object" && !Array.isArray(raw.details)
      ? (raw.details as Record<string, unknown>)
      : null;
  return {
    id: raw.id,
    action: raw.action as AuditLog["action"],
    status: raw.status ?? "success",
    zone_id: raw.zone_id ?? null,
    zone_name: raw.zone_name ?? null,
    details,
    message: raw.message ?? null,
    user_email: raw.user_email ?? null,
    duration_ms: raw.duration_ms ?? null,
    created_at: raw.created_at,
  };
}

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmt(ts: string) {
  return new Date(ts).toLocaleString("pt-BR");
}

function fmtDuration(ms: number | null) {
  if (ms === null) return "—";
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

const ACTION_LABEL: Record<string, string> = {
  purge_cache: "Purge de Cache",
  create_dns: "Adicionar DNS",
  update_dns: "Editar DNS",
  update_rule: "Editar Rule",
  toggle_rule: "Habilitar/Desabilitar Rule",
  delete_rule: "Excluir Rule",
};

const ACTION_ICON: Record<string, React.ReactNode> = {
  purge_cache: <Trash2 className="size-3.5 text-warning inline mr-1" />,
  create_dns: <Plus className="size-3.5 text-success inline mr-1" />,
  update_dns: <Pencil className="size-3.5 text-accent inline mr-1" />,
  update_rule: <Pencil className="size-3.5 text-accent inline mr-1" />,
  toggle_rule: <Power className="size-3.5 text-accent inline mr-1" />,
  delete_rule: <Trash2 className="size-3.5 text-danger inline mr-1" />,
};

// ─── LogsDashboard ─────────────────────────────────────────────────────────────

export function LogsDashboard() {
  const imports = useQuery({
    queryKey: ["import-logs"],
    queryFn: async (): Promise<ImportLog[]> => {
      const { data, error } = await supabase
        .from("import_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as ImportLog[];
    },
  });

  const apis = useQuery({
    queryKey: ["api-logs"],
    queryFn: async (): Promise<ApiLog[]> => {
      const { data, error } = await supabase
        .from("api_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as ApiLog[];
    },
  });

  const audits = useQuery({
    queryKey: ["audit-logs"],
    queryFn: async (): Promise<AuditLog[]> => {
      const { data, error } = await supabase
        .from("audit_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return ((data ?? []) as unknown as AuditLogRaw[]).map(normalizeAuditLog);
    },
    refetchInterval: 30_000,
  });

  const emails = useQuery({
    queryKey: ["email-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("email_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        to_email: string;
        subject: string | null;
        template: string | null;
        status: string;
        error_message: string | null;
        related_gmud_id: string | null;
        created_at: string;
      }>;
    },
    refetchInterval: 30_000,
  });

  const domains = useQuery({
    queryKey: ["domains-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("domains")
        .select("id, domain_name, registrar, status, expiry_date, created_at, last_checked_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as Array<{
        id: string;
        domain_name: string;
        registrar: string;
        status: string;
        expiry_date: string | null;
        created_at: string;
        last_checked_at: string | null;
      }>;
    },
    refetchInterval: 60_000,
  });

  const cronJobs = useQuery({
    queryKey: ["cron-job-runs"],
    queryFn: async (): Promise<CronJobRun[]> => {
      const { data, error } = await supabase.from("cron_job_runs").select("*").order("job_name");
      if (error) throw error;
      return (data ?? []) as CronJobRun[];
    },
    refetchInterval: 60_000,
  });

  const queryClient = useQueryClient();

  // Track which tab is active so we never badge the visible tab.
  const [activeTab, setActiveTab] = React.useState("imports");

  // Persist the ISO timestamp of when each tab was last viewed in localStorage.
  // This survives module navigation so badges don't reappear for already-seen errors.
  const [seenAt, setSeenAt] = React.useState<Record<string, string>>(() => {
    try {
      return JSON.parse(localStorage.getItem("logs_tab_seen_at") ?? "{}");
    } catch {
      return {};
    }
  });

  function markTabSeen(tab: string) {
    const now = new Date().toISOString();
    setSeenAt((prev) => {
      const next = { ...prev, [tab]: now };
      try {
        localStorage.setItem("logs_tab_seen_at", JSON.stringify(next));
      } catch {}
      return next;
    });
  }

  function handleTabChange(tab: string) {
    // Mark the tab being left as seen, then activate the new one.
    markTabSeen(activeTab);
    setActiveTab(tab);
  }

  // Snapshot timestamp taken when component first mounts, used as the baseline
  // "seen" for tabs the user has never explicitly visited in this browser.
  // This prevents ALL historical errors from lighting up on very first page load.
  const mountedAtRef = React.useRef(new Date().toISOString());

  // Returns the count of NEW logs since the last time this tab was visited.
  // Returns 0 if the tab is currently active (user is looking at it).
  function getTabNotification(tab: string): number {
    if (tab === activeTab) return 0;
    // Use the stored "seen" timestamp, or the component mount time as fallback
    // (so historical logs don't create false badges on first visit).
    const seen = seenAt[tab] ?? mountedAtRef.current;
    const countSince = (arr: any[] | undefined, onlyErrors = true) => {
      const items = (arr ?? []).filter((l: any) => !onlyErrors || l.status === "error");
      return items.filter((l: any) => (l.created_at as string) > seen).length;
    };
    if (tab === "imports") return countSince(imports.data);
    if (tab === "audit") return countSince(audits.data);
    if (tab === "emails") return countSince(emails.data);
    if (tab === "vulns") return countSince(vulnLogs.data);
    if (tab === "gmud") return countSince(gmudLogs.data);
    // Acessos: badge for ANY new log entry (success or error), not just errors.
    if (tab === "acessos") return countSince(accessLogs.data, false);
    if (tab === "sysaudit") return countSince(systemAuditLogs.data);
    if (tab === "cron") {
      const jobs = (cronJobs.data ?? []).filter((j) => getCronHealth(j).tone !== "success");
      return jobs.filter((j) => (j.updated_at ?? j.last_attempt_at ?? "") > seen).length;
    }
    return 0;
  }

  const gmudLogs = useQuery({
    queryKey: ["gmud-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gmud_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as GmudLog[];
    },
  });

  const vulnLogs = useQuery({
    queryKey: ["vuln-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("vuln_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as VulnLog[];
    },
  });

  const accessLogs = useQuery({
    queryKey: ["auth-access-logs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("auth_access_logs")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as AccessLog[];
    },
    refetchInterval: 5_000,
  });

  const systemAuditLogs = useQuery({
    queryKey: ["system-audit-log"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("system_audit_log")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data ?? []) as SystemAuditLog[];
    },
    refetchInterval: 30_000,
  });

  React.useEffect(() => {
    const channel = supabase
      .channel("auth-access-logs-realtime")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "auth_access_logs" }, () => {
        queryClient.invalidateQueries({ queryKey: ["auth-access-logs"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const seedFn = useServerFn(seedAuthAccessHistory);
  const seededRef = React.useRef(false);
  React.useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    seedFn()
      .then((res) => {
        if (res?.seeded && res.seeded > 0) accessLogs.refetch();
      })
      .catch(() => {});
  }, []);

  // Totais para o cabeçalho
  const totalErrors =
    (imports.data?.filter((l) => l.status === "error").length ?? 0) +
    (audits.data?.filter((l) => l.status === "error").length ?? 0) +
    (accessLogs.data?.filter((l) => l.status === "error").length ?? 0);

  return (
    <div className="logs-root" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Page header ── */}
      <div className="logs-page-header">
        <div>
          <div className="logs-page-title">Central de Logs</div>
          <div className="logs-page-sub">
            Histórico de eventos do sistema — importações, acessos, e-mails, integrações e tarefas agendadas.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, flexShrink: 0 }}>
          <span className="logs-stat-pill info">
            <span className="logs-stat-dot" />
            {accessLogs.data?.length ?? "—"} acessos
          </span>
          {totalErrors > 0 && (
            <span className="logs-stat-pill err">
              <span className="logs-stat-dot" />
              {totalErrors} erros
            </span>
          )}
          <span className="logs-stat-pill ok">
            <span className="logs-stat-dot" />
            {cronJobs.data?.filter((j) => getCronHealth(j).tone === "success").length ?? "—"} cron ok
          </span>
        </div>
      </div>

      <Tabs defaultValue="imports" onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="imports">
            Importações de dados
            {getTabNotification("imports") > 0 && (
              <span className="logs-tab-badge">{getTabNotification("imports")}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="apis">Conexões de API</TabsTrigger>
          <TabsTrigger value="audit">
            Auditoria Cloudflare
            {getTabNotification("audit") > 0 && <span className="logs-tab-badge">{getTabNotification("audit")}</span>}
          </TabsTrigger>
          <TabsTrigger value="emails">
            E-mails
            {getTabNotification("emails") > 0 && <span className="logs-tab-badge">{getTabNotification("emails")}</span>}
          </TabsTrigger>
          <TabsTrigger value="domains">Domínios/SSL</TabsTrigger>
          <TabsTrigger value="vulns">
            Vulnerabilidades
            {getTabNotification("vulns") > 0 && <span className="logs-tab-badge">{getTabNotification("vulns")}</span>}
          </TabsTrigger>
          <TabsTrigger value="gmud">
            GMUD
            {getTabNotification("gmud") > 0 && <span className="logs-tab-badge">{getTabNotification("gmud")}</span>}
          </TabsTrigger>
          <TabsTrigger value="acessos">
            Acessos
            {getTabNotification("acessos") > 0 && (
              <span className="logs-tab-badge">{getTabNotification("acessos")}</span>
            )}
          </TabsTrigger>
          <TabsTrigger value="cron">
            Cron Jobs
            {getTabNotification("cron") > 0 && <span className="logs-tab-badge">{getTabNotification("cron")}</span>}
          </TabsTrigger>
          <TabsTrigger value="sysaudit">
            Auditoria Sistema
            {getTabNotification("sysaudit") > 0 && (
              <span className="logs-tab-badge">{getTabNotification("sysaudit")}</span>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="imports" className="mt-4">
          <ImportsTab logs={imports.data ?? []} isLoading={imports.isLoading} />
        </TabsContent>

        <TabsContent value="apis" className="mt-4">
          <ApisTab logs={apis.data ?? []} isLoading={apis.isLoading} />
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <AuditTab logs={audits.data ?? []} isLoading={audits.isLoading} />
        </TabsContent>

        <TabsContent value="emails" className="mt-4">
          <EmailsTab logs={emails.data ?? []} isLoading={emails.isLoading} />
        </TabsContent>

        <TabsContent value="domains" className="mt-4">
          <DomainsTab logs={domains.data ?? []} isLoading={domains.isLoading} />
        </TabsContent>

        <TabsContent value="qradar" className="mt-4">
          <QRadarTab logs={apis.data?.filter((l) => l.provider === "qradar") ?? []} isLoading={apis.isLoading} />
        </TabsContent>

        <TabsContent value="acessos" className="mt-4">
          <AcessosTab logs={accessLogs.data ?? []} isLoading={accessLogs.isLoading} />
        </TabsContent>

        <TabsContent value="vulns" className="mt-4">
          <VulnsLogsTab logs={vulnLogs.data ?? []} isLoading={vulnLogs.isLoading} />
        </TabsContent>

        <TabsContent value="gmud" className="mt-4">
          <GmudLogsTab logs={gmudLogs.data ?? []} isLoading={gmudLogs.isLoading} />
        </TabsContent>

        <TabsContent value="cron" className="mt-4">
          <CronJobsTab logs={cronJobs.data ?? []} isLoading={cronJobs.isLoading} />
        </TabsContent>

        <TabsContent value="sysaudit" className="mt-4">
          <SystemAuditTab logs={systemAuditLogs.data ?? []} isLoading={systemAuditLogs.isLoading} />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── KpiCard ──────────────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string | number;
  color: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="logs-kpi-card" style={{ "--kpi-color": color } as React.CSSProperties}>
      <span className="logs-kpi-label">{label}</span>
      <span className="logs-kpi-value">
        {icon}
        {value}
      </span>
    </div>
  );
}

// ─── LogsBadge ────────────────────────────────────────────────────────────────

function LogsBadge({
  tone,
  children,
}: {
  tone: "success" | "error" | "warning" | "info" | "muted";
  children: React.ReactNode;
}) {
  return <span className={`logs-badge-${tone}`}>{children}</span>;
}

// ─── MethodBadge ──────────────────────────────────────────────────────────────

function MethodBadge({ method }: { method: string | null }) {
  if (method === "sso_azure")
    return (
      <span className="logs-method-sso">
        <ShieldCheck style={{ width: 10, height: 10 }} />
        SSO Azure
      </span>
    );
  if (method === "invite")
    return (
      <span className="logs-method-invite">
        <UserPlus style={{ width: 10, height: 10 }} />
        Convite (1º acesso)
      </span>
    );
  return (
    <span className="logs-method-email">
      <KeyRound style={{ width: 10, height: 10 }} />
      E-mail
    </span>
  );
}

// ─── EventTypeBadge / LogoutReasonBadge ────────────────────────────────────────

function EventTypeBadge({ type }: { type: "login" | "logout" }) {
  return type === "login" ? (
    <LogsBadge tone="info">
      <LogIn style={{ width: 10, height: 10 }} />
      Login
    </LogsBadge>
  ) : (
    <LogsBadge tone="muted">
      <LogOut style={{ width: 10, height: 10 }} />
      Logout
    </LogsBadge>
  );
}

function LogoutReasonBadge({ reason }: { reason: string | null }) {
  if (reason === "manual")
    return (
      <span className="logs-method-email">
        <LogOut style={{ width: 10, height: 10 }} />
        Manual
      </span>
    );
  if (reason === "inactivity")
    return (
      <span className="logs-method-invite">
        <Timer style={{ width: 10, height: 10 }} />
        Inatividade (8h)
      </span>
    );
  if (reason === "expired")
    return (
      <span className="logs-method-sso">
        <AlertCircle style={{ width: 10, height: 10 }} />
        Expiração (24h)
      </span>
    );
  return <span style={{ color: T.textMuted, fontSize: 11 }}>—</span>;
}

// ─── LogsTable ────────────────────────────────────────────────────────────────

function LogsTable({
  headers,
  children,
  isLoading,
  empty,
}: {
  headers: string[];
  children: React.ReactNode;
  isLoading: boolean;
  empty: string;
}) {
  if (isLoading) return <div className="logs-loading">Carregando…</div>;
  return (
    <div className="logs-table-wrap">
      <table className="logs-table">
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {React.Children.count(children) === 0 ? (
            <tr>
              <td colSpan={headers.length} className="logs-empty">
                {empty}
              </td>
            </tr>
          ) : (
            children
          )}
        </tbody>
      </table>
    </div>
  );
}

// ─── LogsFilters ──────────────────────────────────────────────────────────────

function LogsFilters({
  search,
  onSearch,
  filters,
  total,
  filtered,
}: {
  search: string;
  onSearch: (v: string) => void;
  filters: Array<{
    value: string;
    onChange: (v: string) => void;
    options: Array<{ value: string; label: string }>;
  }>;
  total: number;
  filtered: number;
}) {
  const hasFilter = search.trim() !== "" || filters.some((f) => f.value !== "all");
  return (
    <div className="logs-filters">
      <Filter style={{ width: 14, height: 14, color: T.textMuted, flexShrink: 0 }} />
      {filters.map((f, i) => (
        <select key={i} className="logs-select" value={f.value} onChange={(e) => f.onChange(e.target.value)}>
          {f.options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ))}
      <div className="logs-search-wrap">
        <input
          type="text"
          placeholder="Buscar…"
          value={search}
          onChange={(e) => onSearch(e.target.value)}
          className="logs-search"
        />
        {search && (
          <button className="logs-search-clear" onClick={() => onSearch("")}>
            <X style={{ width: 12, height: 12 }} />
          </button>
        )}
      </div>
      {hasFilter && (
        <button
          className="logs-clear-btn"
          onClick={() => {
            onSearch("");
            filters.forEach((f) => f.onChange("all"));
          }}
        >
          <X style={{ width: 11, height: 11 }} /> Limpar
        </button>
      )}
      <span className="logs-count">
        {filtered} / {total}
      </span>
    </div>
  );
}

// ─── AuditTab ──────────────────────────────────────────────────────────────────

function AuditTab({ logs, isLoading }: { logs: AuditLog[]; isLoading: boolean }) {
  const [filterAction, setFilterAction] = React.useState<string>("all");
  const [filterStatus, setFilterStatus] = React.useState<string>("all");
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    return logs.filter((l) => {
      if (filterAction !== "all" && l.action !== filterAction) return false;
      if (filterStatus !== "all" && l.status !== filterStatus) return false;
      return true;
    });
  }, [logs, filterAction, filterStatus]);

  const successCount = logs.filter((l) => l.status === "success").length;
  const errorCount = logs.filter((l) => l.status === "error").length;
  const purgeCount = logs.filter((l) => l.action === "purge_cache").length;
  const dnsCount = logs.filter((l) => l.action === "create_dns").length;
  const hasFilter = filterAction !== "all" || filterStatus !== "all";

  if (isLoading)
    return (
      <div className="logs-panel">
        <div className="logs-loading">Carregando…</div>
      </div>
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="logs-kpi-grid col4">
        <KpiCard
          label="Total de operações"
          value={logs.length}
          color={T.accent}
          icon={<Activity style={{ width: 18, height: 18 }} />}
        />
        <KpiCard
          label="Sucesso"
          value={successCount}
          color={T.success}
          icon={<CheckCircle2 style={{ width: 18, height: 18 }} />}
        />
        <KpiCard
          label="Erros"
          value={errorCount}
          color={T.danger}
          icon={<XCircle style={{ width: 18, height: 18 }} />}
        />
        <KpiCard label="Purges / DNS" value={`${purgeCount} / ${dnsCount}`} color={T.warning} />
      </div>

      <div className="logs-panel">
        <div className="logs-panel-header">
          Auditoria Cloudflare
          <span style={{ color: T.textSubtle, fontWeight: 400 }}>
            {filtered.length}
            {hasFilter ? " filtrado" : ""} de {logs.length}
          </span>
        </div>
        <div className="logs-panel-body">
          {/* Filtros inline */}
          <div className="logs-filters">
            <Filter style={{ width: 14, height: 14, color: T.textMuted }} />
            <span style={{ fontSize: 11, color: T.textMuted }}>Ação:</span>
            {[
              { value: "all", label: "Todas" },
              { value: "purge_cache", label: "Purge" },
              { value: "create_dns", label: "Add DNS" },
              { value: "update_rule", label: "Edit Rule" },
              { value: "toggle_rule", label: "Toggle Rule" },
              { value: "delete_rule", label: "Delete Rule" },
            ].map((opt) => (
              <button
                key={opt.value}
                className={`logs-chip${filterAction === opt.value ? " active" : ""}`}
                onClick={() => setFilterAction(opt.value)}
              >
                {opt.label}
              </button>
            ))}
            <span style={{ fontSize: 11, color: T.textMuted, marginLeft: 4 }}>Status:</span>
            {[
              { value: "all", label: "Todos" },
              { value: "success", label: "Sucesso" },
              { value: "error", label: "Erro" },
            ].map((opt) => (
              <button
                key={opt.value}
                className={`logs-chip${filterStatus === opt.value ? " active" : ""}`}
                onClick={() => setFilterStatus(opt.value)}
              >
                {opt.label}
              </button>
            ))}
            {hasFilter && (
              <button
                className="logs-clear-btn"
                onClick={() => {
                  setFilterAction("all");
                  setFilterStatus("all");
                }}
              >
                <X style={{ width: 11, height: 11 }} /> Limpar
              </button>
            )}
          </div>

          {filtered.length === 0 ? (
            <div className="logs-empty">
              {logs.length === 0
                ? "Nenhuma operação registrada. Realize um Purge ou crie um registro DNS para começar."
                : "Nenhum resultado para os filtros selecionados."}
            </div>
          ) : (
            <div className="logs-table-wrap">
              <table className="logs-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Operação</th>
                    <th>Zona</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>Duração</th>
                    <th>Usuário</th>
                    <th>Mensagem</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((l) => (
                    <React.Fragment key={l.id}>
                      <tr
                        style={{ cursor: "pointer" }}
                        onClick={() => setExpandedId(expandedId === l.id ? null : l.id)}
                      >
                        <td className="mono muted" style={{ whiteSpace: "nowrap", fontSize: 11 }}>
                          {fmt(l.created_at)}
                        </td>
                        <td style={{ fontWeight: 600, fontSize: 12 }}>
                          {ACTION_ICON[l.action]}
                          {ACTION_LABEL[l.action] ?? l.action}
                        </td>
                        <td className="mono muted" style={{ fontSize: 11 }}>
                          {l.zone_name ?? l.zone_id ?? "—"}
                        </td>
                        <td>
                          {l.status === "success" ? (
                            <LogsBadge tone="success">
                              <CheckCircle2 style={{ width: 10, height: 10 }} />
                              Sucesso
                            </LogsBadge>
                          ) : (
                            <LogsBadge tone="error">
                              <XCircle style={{ width: 10, height: 10 }} />
                              Erro
                            </LogsBadge>
                          )}
                        </td>
                        <td className="mono muted" style={{ textAlign: "right", fontSize: 11 }}>
                          {fmtDuration(l.duration_ms)}
                        </td>
                        <td
                          className="muted"
                          style={{
                            fontSize: 11,
                            maxWidth: 140,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {l.user_email ?? "—"}
                        </td>
                        <td
                          className="muted"
                          style={{
                            fontSize: 11,
                            maxWidth: 220,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {l.message ?? "—"}
                        </td>
                      </tr>
                      {expandedId === l.id && l.details && (
                        <tr className="logs-expand-row">
                          <td colSpan={7}>
                            <div className="logs-expand-label">Detalhes da operação</div>
                            <DetailsGrid action={l.action} details={l.details} />
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── DetailsGrid ───────────────────────────────────────────────────────────────

type ChangeEntry = { path: string; before: unknown; after: unknown };

// Tabela "o que mudou" — campo a campo, antes → depois. Sem isso, os detalhes
// de uma edição só mostravam o valor NOVO (a descrição/expressão podia ser
// reenviada igual, sem indicar se algo de fato mudou).
function ChangesTable({ changes }: { changes: ChangeEntry[] | undefined }) {
  if (!changes || changes.length === 0) {
    return (
      <div style={{ fontSize: 11, color: T.textMuted, fontFamily: "'IBM Plex Mono',monospace", marginTop: 8 }}>
        Nenhum campo alterado (reenviado igual).
      </div>
    );
  }
  const fmt = (v: unknown) => (v === null || v === undefined || v === "" ? "—" : String(v));
  return (
    <div style={{ marginTop: 10 }}>
      <div
        style={{
          fontSize: 10,
          color: T.textMuted,
          fontFamily: "'IBM Plex Mono',monospace",
          textTransform: "uppercase",
          letterSpacing: "0.05em",
          marginBottom: 4,
        }}
      >
        O que mudou
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11, fontFamily: "'IBM Plex Mono',monospace" }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", color: T.textMuted, fontWeight: 400, padding: "2px 8px 2px 0" }}>Campo</th>
            <th style={{ textAlign: "left", color: T.textMuted, fontWeight: 400, padding: "2px 8px" }}>Antes</th>
            <th style={{ textAlign: "left", color: T.textMuted, fontWeight: 400, padding: "2px 0" }}>Depois</th>
          </tr>
        </thead>
        <tbody>
          {changes.map((c) => (
            <tr key={c.path}>
              <td style={{ color: T.textPrimary, padding: "2px 8px 2px 0", whiteSpace: "nowrap" }}>{c.path}</td>
              <td style={{ color: T.danger, padding: "2px 8px" }}>{fmt(c.before)}</td>
              <td style={{ color: T.success, padding: "2px 0" }}>{fmt(c.after)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DetailsGrid({ action, details }: { action: string; details: Record<string, unknown> }) {
  if (action === "purge_cache") {
    const hosts = (details.hostnames as string[] | undefined) ?? [];
    const all = details.purge_everything as boolean | undefined;
    return (
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          gap: "4px 24px",
          fontSize: 11,
          fontFamily: "'IBM Plex Mono',monospace",
        }}
      >
        <span style={{ color: T.textMuted }}>Modo:</span>
        <span style={{ color: all ? T.danger : T.textPrimary, fontWeight: all ? 700 : 400 }}>
          {all ? "Purge total da zona" : "Hostnames específicos"}
        </span>
        {!all && hosts.length > 0 && (
          <>
            <span style={{ color: T.textMuted, width: "100%", marginTop: 4 }}>Hosts purgados:</span>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
              {hosts.map((h) => (
                <span
                  key={h}
                  style={{
                    background: T.accentSoft,
                    border: `1px solid rgba(59,130,246,0.2)`,
                    color: T.accent,
                    padding: "1px 8px",
                    borderRadius: 4,
                    fontSize: 10,
                  }}
                >
                  {h}
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    );
  }
  if (action === "create_dns") {
    const fields: Array<[string, unknown]> = [
      ["Tipo", details.type],
      ["Nome", details.name],
      ["Conteúdo", details.content],
      ["TTL", details.ttl === 1 ? "Auto" : details.ttl],
      ["Proxy", details.proxied ? "Ativo" : "Desativado"],
      ["Record ID", details.record_id ?? "—"],
    ];
    return (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: "4px 24px",
          fontSize: 11,
          fontFamily: "'IBM Plex Mono',monospace",
        }}
      >
        {fields.map(([label, value]) => (
          <React.Fragment key={label}>
            <span style={{ color: T.textMuted }}>{label}:</span>
            <span style={{ color: T.textPrimary }}>{String(value ?? "—")}</span>
          </React.Fragment>
        ))}
      </div>
    );
  }
  if (action === "update_dns") {
    const fields: Array<[string, unknown]> = [
      ["Tipo", details.type],
      ["Nome", details.name],
      ["Conteúdo", details.content],
      ["TTL", details.ttl],
      ["Proxy", details.proxied ? "Ativo" : "Desativado"],
      ["Record ID", details.record_id ?? "—"],
    ];
    return (
      <div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "4px 24px",
            fontSize: 11,
            fontFamily: "'IBM Plex Mono',monospace",
          }}
        >
          {fields.map(([label, value]) => (
            <React.Fragment key={label}>
              <span style={{ color: T.textMuted }}>{label}:</span>
              <span style={{ color: T.textPrimary }}>{String(value ?? "—")}</span>
            </React.Fragment>
          ))}
        </div>
        <ChangesTable changes={details.changes as ChangeEntry[] | undefined} />
      </div>
    );
  }
  if (action === "update_rule" || action === "toggle_rule" || action === "delete_rule") {
    const fields: Array<[string, unknown]> = [
      ["Categoria", details.category],
      ["Descrição", details.description],
      ...(action === "toggle_rule" ? ([["Novo status", details.enabled ? "Habilitada" : "Desabilitada"]] as Array<[string, unknown]>) : []),
    ];
    return (
      <div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(3, 1fr)",
            gap: "4px 24px",
            fontSize: 11,
            fontFamily: "'IBM Plex Mono',monospace",
          }}
        >
          {fields.map(([label, value]) => (
            <React.Fragment key={label}>
              <span style={{ color: T.textMuted }}>{label}:</span>
              <span style={{ color: T.textPrimary }}>{String(value ?? "—")}</span>
            </React.Fragment>
          ))}
        </div>
        {action === "update_rule" && <ChangesTable changes={details.changes as ChangeEntry[] | undefined} />}
      </div>
    );
  }
  return (
    <pre
      style={{
        fontSize: 11,
        color: T.textMuted,
        whiteSpace: "pre-wrap",
        fontFamily: "'IBM Plex Mono',monospace",
      }}
    >
      {JSON.stringify(details, null, 2)}
    </pre>
  );
}

// ─── SystemAuditTab ─────────────────────────────────────────────────────────────

const SYS_ACTION_LABEL: Record<string, string> = {
  create: "Criação",
  update: "Edição",
  delete: "Exclusão",
  enable: "Ativação",
  disable: "Desativação",
  grant_permission: "Concessão de permissão",
  revoke_permission: "Revogação de permissão",
  grant_module_admin: "Concessão de admin de módulo",
  revoke_module_admin: "Revogação de admin de módulo",
  change_role: "Alteração de papel",
  change_department: "Alteração de departamento",
  invite: "Convite de usuário",
  activate: "Reativação",
  deactivate: "Desativação de usuário",
  change_auth_method: "Alteração de método de login",
  reset_password: "Redefinição de senha",
  salvar_integracao: "Configuração de integração",
  update_template: "Edição de template de e-mail",
};

function sysModuleLabel(mod: string) {
  return MODULE_BY_SLUG[mod]?.short ?? mod;
}

function SystemAuditTab({ logs, isLoading }: { logs: SystemAuditLog[]; isLoading: boolean }) {
  const [filterModulo, setFilterModulo] = React.useState<string>("all");
  const [filterStatus, setFilterStatus] = React.useState<string>("all");
  const [search, setSearch] = React.useState("");
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const moduloOptions = React.useMemo(() => {
    const unique = [...new Set(logs.map((l) => l.modulo))].sort();
    return unique.map((m) => ({ value: m, label: sysModuleLabel(m) }));
  }, [logs]);

  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (filterModulo !== "all" && l.modulo !== filterModulo) return false;
      if (filterStatus !== "all" && l.status !== filterStatus) return false;
      if (q) {
        const haystack = `${l.usuario_email ?? ""} ${l.usuario_nome ?? ""} ${l.descricao} ${l.acao}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
  }, [logs, filterModulo, filterStatus, search]);

  const successCount = logs.filter((l) => l.status === "success").length;
  const errorCount = logs.filter((l) => l.status === "error").length;

  if (isLoading)
    return (
      <div className="logs-panel">
        <div className="logs-loading">Carregando…</div>
      </div>
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="logs-kpi-grid col4">
        <KpiCard
          label="Total de ações"
          value={logs.length}
          color={T.accent}
          icon={<Activity style={{ width: 18, height: 18 }} />}
        />
        <KpiCard
          label="Sucesso"
          value={successCount}
          color={T.success}
          icon={<CheckCircle2 style={{ width: 18, height: 18 }} />}
        />
        <KpiCard
          label="Erros"
          value={errorCount}
          color={T.danger}
          icon={<XCircle style={{ width: 18, height: 18 }} />}
        />
        <KpiCard label="Módulos com atividade" value={moduloOptions.length} color={T.info} />
      </div>

      <div className="logs-panel">
        <div className="logs-panel-header">
          Auditoria Sistema
          <span style={{ color: T.textSubtle, fontWeight: 400 }}>
            {filtered.length}
            {filterModulo !== "all" || filterStatus !== "all" || search ? " filtrado" : ""} de {logs.length}
          </span>
        </div>
        <div className="logs-panel-body">
          <LogsFilters
            search={search}
            onSearch={setSearch}
            filters={[
              {
                value: filterModulo,
                onChange: setFilterModulo,
                options: [{ value: "all", label: "Todos os módulos" }, ...moduloOptions],
              },
              {
                value: filterStatus,
                onChange: setFilterStatus,
                options: [
                  { value: "all", label: "Todos os status" },
                  { value: "success", label: "Sucesso" },
                  { value: "error", label: "Erro" },
                ],
              },
            ]}
            total={logs.length}
            filtered={filtered.length}
          />

          {filtered.length === 0 ? (
            <div className="logs-empty">
              {logs.length === 0
                ? "Nenhuma ação administrativa registrada ainda."
                : "Nenhum resultado para os filtros selecionados."}
            </div>
          ) : (
            <LogsTable
              headers={["Data", "Usuário", "Módulo", "Ação", "Descrição", "Status"]}
              isLoading={false}
              empty="Nenhum resultado."
            >
              {filtered.map((l) => (
                <React.Fragment key={l.id}>
                  <tr style={{ cursor: "pointer" }} onClick={() => setExpandedId(expandedId === l.id ? null : l.id)}>
                    <td className="mono muted" style={{ whiteSpace: "nowrap", fontSize: 11 }}>
                      {fmt(l.created_at)}
                    </td>
                    <td
                      className="muted"
                      style={{
                        fontSize: 11,
                        maxWidth: 160,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {l.usuario_nome ?? l.usuario_email ?? "—"}
                    </td>
                    <td className="mono muted" style={{ fontSize: 11 }}>
                      {sysModuleLabel(l.modulo)}
                    </td>
                    <td style={{ fontSize: 12, fontWeight: 600 }}>{SYS_ACTION_LABEL[l.acao] ?? l.acao}</td>
                    <td
                      className="muted"
                      style={{
                        fontSize: 11,
                        maxWidth: 320,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {l.descricao}
                    </td>
                    <td>
                      {l.status === "success" ? (
                        <LogsBadge tone="success">
                          <CheckCircle2 style={{ width: 10, height: 10 }} />
                          Sucesso
                        </LogsBadge>
                      ) : (
                        <LogsBadge tone="error">
                          <XCircle style={{ width: 10, height: 10 }} />
                          Erro
                        </LogsBadge>
                      )}
                    </td>
                  </tr>
                  {expandedId === l.id && (
                    <tr className="logs-expand-row">
                      <td colSpan={6}>
                        <div className="logs-expand-label">Detalhes da ação</div>
                        <div style={{ fontSize: 11, color: T.textPrimary, marginBottom: 6 }}>{l.descricao}</div>
                        {l.usuario_email && (
                          <div style={{ fontSize: 11, color: T.textMuted, marginBottom: 6 }}>
                            Usuário: {l.usuario_nome ? `${l.usuario_nome} (${l.usuario_email})` : l.usuario_email}
                          </div>
                        )}
                        {l.mensagem_erro && (
                          <div style={{ fontSize: 11, color: T.danger, marginBottom: 6 }}>Erro: {l.mensagem_erro}</div>
                        )}
                        {l.detalhes && Object.keys(l.detalhes).length > 0 && (
                          <pre
                            style={{
                              fontSize: 11,
                              color: T.textMuted,
                              whiteSpace: "pre-wrap",
                              fontFamily: "'IBM Plex Mono',monospace",
                            }}
                          >
                            {JSON.stringify(l.detalhes, null, 2)}
                          </pre>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </LogsTable>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ImportsTab ───────────────────────────────────────────────────────────────

function moduleLabel(mod: string) {
  if (mod === "upload-config") return "Configuração de bloqueio";
  return MODULE_BY_SLUG[mod]?.short ?? mod;
}

function ImportsTab({ logs, isLoading }: { logs: ImportLog[]; isLoading: boolean }) {
  const [status, setStatus] = React.useState("all");
  const [module, setModule] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  // Lista de módulos únicos presentes nos logs
  const moduleOptions = React.useMemo(() => {
    const unique = [...new Set(logs.map((l) => l.module))].sort();
    return unique.map((m) => ({ value: m, label: moduleLabel(m) }));
  }, [logs]);

  const filtered = React.useMemo(
    () =>
      logs.filter((l) => {
        if (status !== "all" && l.status !== status) return false;
        if (module !== "all" && l.module !== module) return false;
        if (search.trim())
          return (l.module + (l.filename ?? "") + (l.message ?? "")).toLowerCase().includes(search.toLowerCase());
        return true;
      }),
    [logs, status, module, search],
  );

  const erros = logs.filter((l) => l.status === "error").length;
  const sucesso = logs.filter((l) => l.status === "success").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="logs-kpi-grid col3">
        <KpiCard label="Total" value={logs.length} color={T.accent} icon={<Plus style={{ width: 18, height: 18 }} />} />
        <KpiCard
          label="Sucesso"
          value={sucesso}
          color={T.success}
          icon={<CheckCircle2 style={{ width: 18, height: 18 }} />}
        />
        <KpiCard label="Erros" value={erros} color={T.danger} icon={<XCircle style={{ width: 18, height: 18 }} />} />
      </div>
      <div className="logs-panel">
        <div className="logs-panel-header">
          Importações de Dados
          <span style={{ color: T.textSubtle, fontWeight: 400 }}>
            {filtered.length} de {logs.length} · clique na linha para detalhes
          </span>
        </div>
        <div className="logs-panel-body">
          <LogsFilters
            search={search}
            onSearch={setSearch}
            total={logs.length}
            filtered={filtered.length}
            filters={[
              {
                value: status,
                onChange: setStatus,
                options: [
                  { value: "all", label: "Todos os status" },
                  { value: "success", label: "Sucesso" },
                  { value: "error", label: "Erro" },
                  { value: "partial", label: "Parcial" },
                ],
              },
              {
                value: module,
                onChange: setModule,
                options: [{ value: "all", label: "Todos os módulos" }, ...moduleOptions],
              },
            ]}
          />

          {isLoading ? (
            <div className="logs-loading">Carregando…</div>
          ) : filtered.length === 0 ? (
            <div className="logs-empty">Nenhuma importação registrada.</div>
          ) : (
            <div className="logs-table-wrap">
              <table className="logs-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Módulo</th>
                    <th>Arquivo</th>
                    <th>Status</th>
                    <th style={{ width: 28 }} />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((l) => (
                    <React.Fragment key={l.id}>
                      <tr
                        style={{ cursor: "pointer" }}
                        onClick={() => setExpandedId(expandedId === l.id ? null : l.id)}
                      >
                        <td className="mono muted" style={{ whiteSpace: "nowrap", fontSize: 11 }}>
                          {fmt(l.created_at)}
                        </td>
                        <td style={{ fontSize: 12, fontWeight: 500 }}>{moduleLabel(l.module)}</td>
                        <td
                          className="mono muted"
                          style={{
                            fontSize: 11,
                            maxWidth: 260,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={l.filename ?? undefined}
                        >
                          {l.filename ?? "—"}
                        </td>
                        <td>
                          <LogsBadge
                            tone={l.status === "success" ? "success" : l.status === "error" ? "error" : "warning"}
                          >
                            {l.status === "success" ? "Sucesso" : l.status === "error" ? "Erro" : "Parcial"}
                          </LogsBadge>
                        </td>
                        <td style={{ textAlign: "center", color: T.textMuted, fontSize: 10 }}>
                          {expandedId === l.id ? "▲" : "▼"}
                        </td>
                      </tr>

                      {expandedId === l.id && (
                        <tr className="logs-expand-row">
                          <td colSpan={5}>
                            <div
                              style={{
                                display: "flex",
                                gap: 24,
                                flexWrap: "wrap",
                                alignItems: "flex-start",
                              }}
                            >
                              {/* Contadores */}
                              <div style={{ display: "flex", gap: 16 }}>
                                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                  <span
                                    style={{
                                      fontSize: 9,
                                      fontFamily: "'IBM Plex Mono',monospace",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.12em",
                                      color: T.textMuted,
                                    }}
                                  >
                                    Total
                                  </span>
                                  <span
                                    style={{
                                      fontSize: 18,
                                      fontWeight: 700,
                                      fontFamily: "'Space Grotesk',sans-serif",
                                      color: T.accent,
                                    }}
                                  >
                                    {l.total_count}
                                  </span>
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                  <span
                                    style={{
                                      fontSize: 9,
                                      fontFamily: "'IBM Plex Mono',monospace",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.12em",
                                      color: T.textMuted,
                                    }}
                                  >
                                    Importados
                                  </span>
                                  <span
                                    style={{
                                      fontSize: 18,
                                      fontWeight: 700,
                                      fontFamily: "'Space Grotesk',sans-serif",
                                      color: T.success,
                                    }}
                                  >
                                    {l.imported_count}
                                  </span>
                                </div>
                                <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                                  <span
                                    style={{
                                      fontSize: 9,
                                      fontFamily: "'IBM Plex Mono',monospace",
                                      textTransform: "uppercase",
                                      letterSpacing: "0.12em",
                                      color: T.textMuted,
                                    }}
                                  >
                                    Ignorados
                                  </span>
                                  <span
                                    style={{
                                      fontSize: 18,
                                      fontWeight: 700,
                                      fontFamily: "'Space Grotesk',sans-serif",
                                      color: T.neutral,
                                    }}
                                  >
                                    {l.ignored_count}
                                  </span>
                                </div>
                              </div>

                              {/* Mensagem */}
                              {l.message && (
                                <div style={{ flex: 1, minWidth: 200 }}>
                                  <div className="logs-expand-label" style={{ marginBottom: 4 }}>
                                    Mensagem
                                  </div>
                                  <p
                                    style={{
                                      fontSize: 12,
                                      color: l.status === "error" ? T.danger : T.textSecondary,
                                      margin: 0,
                                      lineHeight: 1.5,
                                      fontFamily: "'IBM Plex Mono',monospace",
                                    }}
                                  >
                                    {l.message}
                                  </p>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── ApisTab ──────────────────────────────────────────────────────────────────

function ApisTab({ logs, isLoading }: { logs: ApiLog[]; isLoading: boolean }) {
  const [status, setStatus] = React.useState("all");
  const [provider, setProvider] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [expandedId, setExpandedId] = React.useState<string | null>(null);

  const providers = [...new Set(logs.map((l) => l.provider))];
  const baseForKpi = React.useMemo(
    () => (provider === "all" ? logs : logs.filter((l) => l.provider === provider)),
    [logs, provider],
  );
  const filtered = React.useMemo(
    () =>
      baseForKpi.filter((l) => {
        if (status !== "all" && l.status !== status) return false;
        if (search.trim()) return (l.provider + (l.message ?? "")).toLowerCase().includes(search.toLowerCase());
        return true;
      }),
    [baseForKpi, status, search],
  );
  const erros = baseForKpi.filter((l) => l.status === "error").length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="logs-kpi-grid col3">
        <KpiCard
          label="Total"
          value={baseForKpi.length}
          color={T.accent}
          icon={<Plus style={{ width: 18, height: 18 }} />}
        />
        <KpiCard
          label="Sucesso"
          value={baseForKpi.length - erros}
          color={T.success}
          icon={<CheckCircle2 style={{ width: 18, height: 18 }} />}
        />
        <KpiCard
          label="Erros"
          value={erros}
          color={T.danger}
          icon={<AlertTriangle style={{ width: 18, height: 18 }} />}
        />
      </div>
      <div className="logs-panel">
        <div className="logs-panel-header">
          Conexões de API
          <span style={{ color: T.textSubtle, fontWeight: 400 }}>
            {filtered.length} de {baseForKpi.length} · clique na linha para detalhes
          </span>
        </div>
        <div className="logs-panel-body">
          <LogsFilters
            search={search}
            onSearch={setSearch}
            total={baseForKpi.length}
            filtered={filtered.length}
            filters={[
              {
                value: status,
                onChange: setStatus,
                options: [
                  { value: "all", label: "Todos os status" },
                  { value: "success", label: "Sucesso" },
                  { value: "error", label: "Erro" },
                ],
              },
              {
                value: provider,
                onChange: setProvider,
                options: [
                  { value: "all", label: "Todos os provedores" },
                  ...providers.map((p) => ({ value: p, label: p })),
                ],
              },
            ]}
          />

          {isLoading ? (
            <div className="logs-loading">Carregando…</div>
          ) : filtered.length === 0 ? (
            <div className="logs-empty">Nenhuma chamada de API registrada.</div>
          ) : (
            <div className="logs-table-wrap">
              <table className="logs-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Provedor</th>
                    <th>Status</th>
                    <th style={{ textAlign: "right" }}>HTTP</th>
                    <th style={{ textAlign: "right" }}>Duração</th>
                    <th style={{ width: 28 }} />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((l) => (
                    <React.Fragment key={l.id}>
                      <tr
                        style={{ cursor: "pointer" }}
                        onClick={() => setExpandedId(expandedId === l.id ? null : l.id)}
                      >
                        <td className="mono muted" style={{ whiteSpace: "nowrap", fontSize: 11 }}>
                          {fmt(l.created_at)}
                        </td>
                        <td style={{ fontSize: 12, textTransform: "capitalize", fontWeight: 500 }}>{l.provider}</td>
                        <td>
                          <LogsBadge tone={l.status === "success" ? "success" : "error"}>
                            {l.status === "success" ? "Sucesso" : "Erro"}
                          </LogsBadge>
                        </td>
                        <td className="mono" style={{ textAlign: "right", fontSize: 11 }}>
                          {l.http_status ?? "—"}
                        </td>
                        <td className="mono" style={{ textAlign: "right", fontSize: 11 }}>
                          {l.duration_ms ? `${l.duration_ms}ms` : "—"}
                        </td>
                        <td style={{ textAlign: "center", color: T.textMuted, fontSize: 10 }}>
                          {expandedId === l.id ? "▲" : "▼"}
                        </td>
                      </tr>

                      {expandedId === l.id && (
                        <tr className="logs-expand-row">
                          <td colSpan={6}>
                            <div className="logs-expand-label">Mensagem</div>
                            <p
                              style={{
                                margin: 0,
                                fontSize: 12,
                                fontFamily: "'IBM Plex Mono',monospace",
                                color: l.status === "error" ? T.danger : T.textSecondary,
                                lineHeight: 1.6,
                                whiteSpace: "pre-wrap",
                                wordBreak: "break-all",
                              }}
                            >
                              {l.message ?? "—"}
                            </p>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── EmailsTab ────────────────────────────────────────────────────────────────

function EmailsTab({ logs, isLoading }: { logs: any[]; isLoading: boolean }) {
  const [status, setStatus] = React.useState("all");
  const [template, setTemplate] = React.useState("all");
  const [search, setSearch] = React.useState("");

  const templateOptions = React.useMemo(() => {
    const unique = [...new Set(logs.map((l) => l.template).filter(Boolean))].sort() as string[];
    return unique.map((t) => ({ value: t, label: t }));
  }, [logs]);

  const filtered = React.useMemo(
    () =>
      logs.filter((l) => {
        if (status !== "all" && l.status !== status) return false;
        if (template !== "all" && l.template !== template) return false;
        if (search.trim())
          return ((l.to_email ?? "") + (l.subject ?? "") + (l.template ?? ""))
            .toLowerCase()
            .includes(search.toLowerCase());
        return true;
      }),
    [logs, status, template, search],
  );
  const enviados = logs.filter((l) => l.status === "success").length;
  const erros = logs.filter((l) => l.status === "error").length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="logs-kpi-grid col3">
        <KpiCard label="Total" value={logs.length} color={T.accent} icon={<Mail style={{ width: 18, height: 18 }} />} />
        <KpiCard
          label="Enviados"
          value={enviados}
          color={T.success}
          icon={<CheckCircle2 style={{ width: 18, height: 18 }} />}
        />
        <KpiCard label="Erros" value={erros} color={T.danger} icon={<XCircle style={{ width: 18, height: 18 }} />} />
      </div>
      <div className="logs-panel">
        <div className="logs-panel-header">
          E-mails
          <span style={{ color: T.textSubtle, fontWeight: 400 }}>
            {filtered.length} de {logs.length}
          </span>
        </div>
        <div className="logs-panel-body">
          <LogsFilters
            search={search}
            onSearch={setSearch}
            total={logs.length}
            filtered={filtered.length}
            filters={[
              {
                value: status,
                onChange: setStatus,
                options: [
                  { value: "all", label: "Todos os status" },
                  { value: "success", label: "Enviado" },
                  { value: "error", label: "Erro" },
                ],
              },
              {
                value: template,
                onChange: setTemplate,
                options: [{ value: "all", label: "Todos os templates" }, ...templateOptions],
              },
            ]}
          />
          <LogsTable
            isLoading={isLoading}
            empty="Nenhum e-mail registrado."
            headers={["Data", "Destinatário", "Assunto", "Template", "Status", "Erro", "GMUD"]}
          >
            {filtered.map((l) => (
              <tr key={l.id}>
                <td className="mono muted" style={{ whiteSpace: "nowrap", fontSize: 11 }}>
                  {fmt(l.created_at)}
                </td>
                <td style={{ fontSize: 12 }}>{l.to_email}</td>
                <td
                  style={{
                    fontSize: 11,
                    maxWidth: 220,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {l.subject ?? "—"}
                </td>
                <td className="muted" style={{ fontSize: 11 }}>
                  {l.template ?? "—"}
                </td>
                <td>
                  <LogsBadge tone={l.status === "success" ? "success" : "error"}>
                    {l.status === "success" ? "Enviado" : "Erro"}
                  </LogsBadge>
                </td>
                <td
                  style={{
                    fontSize: 11,
                    color: T.danger,
                    maxWidth: 200,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {l.error_message ?? "—"}
                </td>
                <td className="mono muted" style={{ fontSize: 10 }}>
                  {l.related_gmud_id ? l.related_gmud_id.slice(0, 8) : "—"}
                </td>
              </tr>
            ))}
          </LogsTable>
        </div>
      </div>
    </div>
  );
}

// ─── DomainsTab ───────────────────────────────────────────────────────────────

function DomainsTab({ logs, isLoading }: { logs: any[]; isLoading: boolean }) {
  const [status, setStatus] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const filtered = React.useMemo(
    () =>
      logs.filter((l) => {
        if (status !== "all" && l.status !== status) return false;
        if (search.trim())
          return ((l.domain_name ?? "") + (l.registrar ?? "")).toLowerCase().includes(search.toLowerCase());
        return true;
      }),
    [logs, status, search],
  );
  const ativos = logs.filter((l) => l.status === "ativo").length;
  const expirados = logs.filter((l) => l.status !== "ativo").length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="logs-kpi-grid col3">
        <KpiCard
          label="Total"
          value={logs.length}
          color={T.accent}
          icon={<GitBranch style={{ width: 18, height: 18 }} />}
        />
        <KpiCard
          label="Ativos"
          value={ativos}
          color={T.success}
          icon={<CheckCircle2 style={{ width: 18, height: 18 }} />}
        />
        <KpiCard
          label="Expirados"
          value={expirados}
          color={T.danger}
          icon={<AlertTriangle style={{ width: 18, height: 18 }} />}
        />
      </div>
      <div className="logs-panel">
        <div className="logs-panel-header">
          Domínios/SSL
          <span style={{ color: T.textSubtle, fontWeight: 400 }}>
            {filtered.length} de {logs.length}
          </span>
        </div>
        <div className="logs-panel-body">
          <LogsFilters
            search={search}
            onSearch={setSearch}
            total={logs.length}
            filtered={filtered.length}
            filters={[
              {
                value: status,
                onChange: setStatus,
                options: [
                  { value: "all", label: "Todos os status" },
                  { value: "ativo", label: "Ativo" },
                  { value: "expirado", label: "Expirado" },
                ],
              },
            ]}
          />
          <LogsTable
            isLoading={isLoading}
            empty="Nenhum domínio cadastrado."
            headers={["Data cadastro", "Domínio", "Registrador", "Validade", "Status", "Última verificação"]}
          >
            {filtered.map((d) => (
              <tr key={d.id}>
                <td className="mono muted" style={{ whiteSpace: "nowrap", fontSize: 11 }}>
                  {fmt(d.created_at)}
                </td>
                <td style={{ fontWeight: 600, fontSize: 12 }}>{d.domain_name}</td>
                <td className="muted" style={{ fontSize: 11, textTransform: "capitalize" }}>
                  {d.registrar}
                </td>
                <td className="mono" style={{ fontSize: 11 }}>
                  {d.expiry_date ? new Date(d.expiry_date).toLocaleDateString("pt-BR") : "—"}
                </td>
                <td>
                  <LogsBadge tone={d.status === "ativo" ? "success" : "error"}>
                    {d.status === "ativo" ? "Ativo" : "Expirado"}
                  </LogsBadge>
                </td>
                <td className="mono muted" style={{ fontSize: 11 }}>
                  {d.last_checked_at ? fmt(d.last_checked_at) : "—"}
                </td>
              </tr>
            ))}
          </LogsTable>
        </div>
      </div>
    </div>
  );
}

// ─── QRadarTab ────────────────────────────────────────────────────────────────

function QRadarTab({ logs, isLoading }: { logs: ApiLog[]; isLoading: boolean }) {
  const [status, setStatus] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const filtered = React.useMemo(
    () =>
      logs.filter((l) => {
        if (status !== "all" && l.status !== status) return false;
        if (search.trim()) return (l.message ?? "").toLowerCase().includes(search.toLowerCase());
        return true;
      }),
    [logs, status, search],
  );
  const erros = logs.filter((l) => l.status === "error").length;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="logs-kpi-grid col3">
        <KpiCard
          label="Total"
          value={logs.length}
          color={T.accent}
          icon={<RefreshCw style={{ width: 18, height: 18 }} />}
        />
        <KpiCard
          label="Sucesso"
          value={logs.length - erros}
          color={T.success}
          icon={<CheckCircle2 style={{ width: 18, height: 18 }} />}
        />
        <KpiCard
          label="Erros"
          value={erros}
          color={T.danger}
          icon={<AlertTriangle style={{ width: 18, height: 18 }} />}
        />
      </div>
      <div className="logs-panel">
        <div className="logs-panel-header">
          API QRadar
          <span style={{ color: T.textSubtle, fontWeight: 400 }}>
            {filtered.length} de {logs.length}
          </span>
        </div>
        <div className="logs-panel-body">
          <LogsFilters
            search={search}
            onSearch={setSearch}
            total={logs.length}
            filtered={filtered.length}
            filters={[
              {
                value: status,
                onChange: setStatus,
                options: [
                  { value: "all", label: "Todos os status" },
                  { value: "success", label: "Sucesso" },
                  { value: "error", label: "Erro" },
                ],
              },
            ]}
          />
          <LogsTable
            isLoading={isLoading}
            empty="Nenhuma chamada à API do QRadar registrada."
            headers={["Data", "Endpoint / Mensagem", "Status", "HTTP", "Duração"]}
          >
            {filtered.map((l) => (
              <tr key={l.id}>
                <td className="mono muted" style={{ whiteSpace: "nowrap", fontSize: 11 }}>
                  {fmt(l.created_at)}
                </td>
                <td
                  className="muted"
                  style={{
                    fontSize: 11,
                    maxWidth: 440,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {l.message ?? "—"}
                </td>
                <td>
                  <LogsBadge tone={l.status === "success" ? "success" : "error"}>
                    {l.status === "success" ? "Sucesso" : "Erro"}
                  </LogsBadge>
                </td>
                <td className="mono" style={{ textAlign: "right", fontSize: 11 }}>
                  {l.http_status ?? "—"}
                </td>
                <td className="mono" style={{ textAlign: "right", fontSize: 11 }}>
                  {fmtDuration(l.duration_ms)}
                </td>
              </tr>
            ))}
          </LogsTable>
        </div>
      </div>
    </div>
  );
}

// ─── AcessosTab ───────────────────────────────────────────────────────────────

function AcessosTab({ logs, isLoading }: { logs: AccessLog[]; isLoading: boolean }) {
  const [status, setStatus] = React.useState("all");
  const [method, setMethod] = React.useState("all");
  const [eventType, setEventType] = React.useState("all");
  const [search, setSearch] = React.useState("");
  const [expandedId, setExpandedId] = React.useState<string | null>(null);
  const [geoData, setGeoData] = React.useState<Record<string, GeoResult | null>>({});

  const filtered = React.useMemo(
    () =>
      logs.filter((l) => {
        if (status !== "all" && l.status !== status) return false;
        if (eventType !== "all" && l.event_type !== eventType) return false;
        // Método é um atributo de LOGIN — qualquer filtro de método exclui logouts.
        if (method !== "all" && l.event_type === "logout") return false;
        if (method === "sso" && l.login_method !== "sso_azure") return false;
        if (method === "invite" && l.login_method !== "invite") return false;
        if (method === "email" && (l.login_method === "sso_azure" || l.login_method === "invite")) return false;
        if (search.trim()) return ((l.email ?? "") + (l.full_name ?? "")).toLowerCase().includes(search.toLowerCase());
        return true;
      }),
    [logs, status, eventType, method, search],
  );

  const loginLogs = React.useMemo(() => logs.filter((l) => l.event_type !== "logout"), [logs]);
  const logoutLogs = React.useMemo(() => logs.filter((l) => l.event_type === "logout"), [logs]);

  const sucesso = logs.filter((l) => l.status === "success").length;
  const erros = logs.filter((l) => l.status === "error").length;
  const ssoCount = loginLogs.filter((l) => l.login_method === "sso_azure").length;
  const inviteCount = loginLogs.filter((l) => l.login_method === "invite").length;
  const emailCount = loginLogs.filter((l) => l.login_method !== "sso_azure" && l.login_method !== "invite").length;
  const logoutManualCount = logoutLogs.filter((l) => l.logout_reason === "manual").length;
  const logoutInactivityCount = logoutLogs.filter((l) => l.logout_reason === "inactivity").length;
  const logoutExpiredCount = logoutLogs.filter((l) => l.logout_reason === "expired").length;

  function handleExpand(log: AccessLog) {
    const next = expandedId === log.id ? null : log.id;
    setExpandedId(next);
    if (next && log.ip && !(log.ip in geoData)) {
      fetchGeo(log.ip).then((geo) => setGeoData((prev) => ({ ...prev, [log.ip!]: geo })));
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="logs-kpi-grid col6">
        <KpiCard
          label="Total eventos"
          value={logs.length}
          color={T.accent}
          icon={<LogIn style={{ width: 18, height: 18 }} />}
        />
        <KpiCard
          label="Sucesso"
          value={sucesso}
          color={T.success}
          icon={<CheckCircle2 style={{ width: 18, height: 18 }} />}
        />
        <KpiCard label="Erros" value={erros} color={T.danger} icon={<XCircle style={{ width: 18, height: 18 }} />} />
        <KpiCard
          label="Via SSO (Azure)"
          value={ssoCount}
          color="#818CF8"
          icon={<ShieldCheck style={{ width: 18, height: 18 }} />}
        />
        <KpiCard
          label="Via E-mail/Senha"
          value={emailCount}
          color={T.accent}
          icon={<KeyRound style={{ width: 18, height: 18 }} />}
        />
        <KpiCard
          label="Convite (1º acesso)"
          value={inviteCount}
          color={T.warning}
          icon={<UserPlus style={{ width: 18, height: 18 }} />}
        />
      </div>

      <div className="logs-kpi-grid col4">
        <KpiCard
          label="Logouts totais"
          value={logoutLogs.length}
          color={T.neutral}
          icon={<LogOut style={{ width: 18, height: 18 }} />}
        />
        <KpiCard
          label="Logout manual"
          value={logoutManualCount}
          color={T.accent}
          icon={<LogOut style={{ width: 18, height: 18 }} />}
        />
        <KpiCard
          label="Logout p/ inatividade"
          value={logoutInactivityCount}
          color={T.warning}
          icon={<Timer style={{ width: 18, height: 18 }} />}
        />
        <KpiCard
          label="Logout p/ expiração (24h)"
          value={logoutExpiredCount}
          color={T.danger}
          icon={<AlertCircle style={{ width: 18, height: 18 }} />}
        />
      </div>

      <div className="logs-panel">
        <div className="logs-panel-header">
          Acessos ao Sistema
          <span style={{ color: T.textSubtle, fontWeight: 400 }}>
            {filtered.length} de {logs.length} · atualiza em tempo real · clique na linha para detalhes
          </span>
        </div>
        <div className="logs-panel-body">
          <LogsFilters
            search={search}
            onSearch={setSearch}
            total={logs.length}
            filtered={filtered.length}
            filters={[
              {
                value: eventType,
                onChange: setEventType,
                options: [
                  { value: "all", label: "Login e Logout" },
                  { value: "login", label: "Somente Login" },
                  { value: "logout", label: "Somente Logout" },
                ],
              },
              {
                value: status,
                onChange: setStatus,
                options: [
                  { value: "all", label: "Todos os status" },
                  { value: "success", label: "Sucesso" },
                  { value: "error", label: "Erro" },
                ],
              },
              {
                value: method,
                onChange: setMethod,
                options: [
                  { value: "all", label: "Todos os métodos" },
                  { value: "sso", label: "SSO (Azure AD)" },
                  { value: "email", label: "E-mail / Senha" },
                  { value: "invite", label: "Convite (1º acesso)" },
                ],
              },
            ]}
          />

          {isLoading ? (
            <div className="logs-loading">Carregando…</div>
          ) : filtered.length === 0 ? (
            <div className="logs-empty">Nenhum acesso registrado.</div>
          ) : (
            <div className="logs-table-wrap">
              <table className="logs-table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Evento</th>
                    <th>E-mail</th>
                    <th>Nome</th>
                    <th>Papel</th>
                    <th>Método / Motivo</th>
                    <th>Status</th>
                    <th style={{ width: 28 }} />
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((l) => {
                    const isOpen = expandedId === l.id;
                    const geo = l.ip ? geoData[l.ip] : undefined;
                    const device = parseDevice(l.user_agent);
                    const browser = parseBrowser(l.user_agent);

                    return (
                      <React.Fragment key={l.id}>
                        <tr style={{ cursor: "pointer" }} onClick={() => handleExpand(l)}>
                          <td className="mono muted" style={{ whiteSpace: "nowrap", fontSize: 11 }}>
                            {fmt(l.created_at)}
                          </td>
                          <td>
                            <EventTypeBadge type={l.event_type === "logout" ? "logout" : "login"} />
                          </td>
                          <td style={{ fontSize: 12, fontWeight: 500 }}>{l.email}</td>
                          <td className="muted" style={{ fontSize: 11 }}>
                            {l.full_name ?? "—"}
                          </td>
                          <td>
                            {l.role ? (
                              <LogsBadge
                                tone={
                                  l.role === "admin" || l.role === "super_admin"
                                    ? "error"
                                    : l.role === "analista"
                                      ? "warning"
                                      : "info"
                                }
                              >
                                {l.role === "admin"
                                  ? "Admin"
                                  : l.role === "super_admin"
                                    ? "Super Admin"
                                    : l.role === "analista"
                                      ? "Analista"
                                      : "Visualizador"}
                              </LogsBadge>
                            ) : (
                              <span style={{ color: T.textMuted, fontSize: 11 }}>—</span>
                            )}
                          </td>
                          <td>
                            {l.event_type === "logout" ? (
                              <LogoutReasonBadge reason={l.logout_reason} />
                            ) : (
                              <MethodBadge method={l.login_method} />
                            )}
                          </td>
                          <td>
                            <LogsBadge tone={l.status === "success" ? "success" : "error"}>
                              {l.status === "success" ? "Sucesso" : "Erro"}
                            </LogsBadge>
                          </td>
                          <td style={{ textAlign: "center", color: T.textMuted, fontSize: 10 }}>
                            {isOpen ? "▲" : "▼"}
                          </td>
                        </tr>

                        {isOpen && (
                          <tr className="logs-expand-row">
                            <td colSpan={8}>
                              <div className="logs-detail-section">
                                {/* ── Cards de info ── */}
                                <div className="logs-detail-cards">
                                  {/* IP */}
                                  <div className="logs-detail-card" style={{ "--dc": T.accent } as React.CSSProperties}>
                                    <div className="logs-detail-card-hd">
                                      <MapPin style={{ width: 10, height: 10 }} />
                                      IP de Origem
                                    </div>
                                    <div className="logs-detail-card-val mono">{l.ip ?? "—"}</div>
                                    {l.ip && isPrivateIp(l.ip) && (
                                      <div className="logs-detail-card-sub" style={{ color: T.warning }}>
                                        rede local / dev
                                      </div>
                                    )}
                                  </div>

                                  {/* Localização */}
                                  <div className="logs-detail-card" style={{ "--dc": T.info } as React.CSSProperties}>
                                    <div className="logs-detail-card-hd">
                                      <Globe style={{ width: 10, height: 10 }} />
                                      Localização
                                    </div>
                                    {!l.ip || isPrivateIp(l.ip) ? (
                                      <div
                                        className="logs-detail-card-val"
                                        style={{ color: T.textMuted, fontWeight: 400 }}
                                      >
                                        N/A (IP local)
                                      </div>
                                    ) : geo === undefined ? (
                                      <div
                                        className="logs-detail-card-val"
                                        style={{
                                          color: T.textMuted,
                                          fontWeight: 400,
                                          fontSize: 11,
                                        }}
                                      >
                                        Buscando…
                                      </div>
                                    ) : geo === null ? (
                                      <div
                                        className="logs-detail-card-val"
                                        style={{ color: T.textMuted, fontWeight: 400 }}
                                      >
                                        Não identificado
                                      </div>
                                    ) : (
                                      <>
                                        <div className="logs-detail-card-val">
                                          {countryFlag(geo.country_code)} {geo.country_name}
                                        </div>
                                        <div className="logs-detail-card-sub">{geo.city}</div>
                                      </>
                                    )}
                                  </div>

                                  {/* ISP / Provedor */}
                                  {geo && (
                                    <div
                                      className="logs-detail-card"
                                      style={{ "--dc": "#6366F1" } as React.CSSProperties}
                                    >
                                      <div className="logs-detail-card-hd">
                                        <Wifi style={{ width: 10, height: 10 }} />
                                        Provedor (ISP)
                                      </div>
                                      <div className="logs-detail-card-val" style={{ fontSize: 11 }}>
                                        {geo.org}
                                      </div>
                                    </div>
                                  )}

                                  {/* Dispositivo */}
                                  <div
                                    className="logs-detail-card"
                                    style={{ "--dc": T.warning } as React.CSSProperties}
                                  >
                                    <div className="logs-detail-card-hd">
                                      {/phone|iphone|android/i.test(device) ? (
                                        <Smartphone style={{ width: 10, height: 10 }} />
                                      ) : (
                                        <Laptop style={{ width: 10, height: 10 }} />
                                      )}
                                      Dispositivo
                                    </div>
                                    <div className="logs-detail-card-val">{device}</div>
                                    <div className="logs-detail-card-sub">via {browser}</div>
                                  </div>
                                </div>

                                {/* ── Mensagem de erro ── */}
                                {l.error_message && (
                                  <div className="logs-detail-error">
                                    <div className="logs-detail-error-hd">
                                      <AlertCircle style={{ width: 11, height: 11 }} />
                                      Motivo do Erro
                                    </div>
                                    <div className="logs-detail-error-msg">{l.error_message}</div>
                                  </div>
                                )}

                                {/* ── User Agent ── */}
                                <div className="logs-detail-ua">
                                  <div className="logs-detail-ua-hd">
                                    <Terminal style={{ width: 10, height: 10 }} />
                                    User Agent
                                  </div>
                                  <div className="logs-detail-ua-val">{l.user_agent ?? "—"}</div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── GmudLogsTab ──────────────────────────────────────────────────────────────

const GMUD_EVENT_LABELS: Record<
  string,
  { label: string; icon: React.ReactNode; tone: "success" | "error" | "warning" | "info" | "muted" }
> = {
  criacao: { label: "Criação", icon: <Plus className="size-3.5" />, tone: "info" },
  aprovacao: { label: "Aprovação", icon: <CheckCircle2 className="size-3.5" />, tone: "success" },
  rejeicao: { label: "Rejeição", icon: <XCircle className="size-3.5" />, tone: "error" },
  mudanca_status: {
    label: "Mudança de Status",
    icon: <RefreshCw className="size-3.5" />,
    tone: "warning",
  },
  exclusao: { label: "Exclusão", icon: <Trash2 className="size-3.5" />, tone: "error" },
  email_enviado: { label: "E-mail Enviado", icon: <Mail className="size-3.5" />, tone: "success" },
  email_erro: { label: "Erro de E-mail", icon: <Mail className="size-3.5" />, tone: "error" },
  erro: { label: "Erro", icon: <AlertTriangle className="size-3.5" />, tone: "error" },
};

function GmudLogsTab({ logs, isLoading }: { logs: GmudLog[]; isLoading: boolean }) {
  const [filterTipo, setFilterTipo] = React.useState("all");
  const [filterStatus, setFilterStatus] = React.useState("all");
  const [search, setSearch] = React.useState("");

  const filtered = React.useMemo(() => {
    return logs.filter((l) => {
      if (filterTipo !== "all" && l.tipo_evento !== filterTipo) return false;
      if (filterStatus !== "all" && l.status !== filterStatus) return false;
      if (search.trim()) {
        const s = search.toLowerCase();
        if (
          !l.gmud_titulo?.toLowerCase().includes(s) &&
          !l.descricao?.toLowerCase().includes(s) &&
          !l.usuario_email?.toLowerCase().includes(s)
        )
          return false;
      }
      return true;
    });
  }, [logs, filterTipo, filterStatus, search]);

  const total = logs.length;
  const aprovados = logs.filter((l) => l.tipo_evento === "aprovacao").length;
  const rejeitados = logs.filter((l) => l.tipo_evento === "rejeicao").length;
  const erros = logs.filter((l) => l.status === "error").length;
  const emailsEnv = logs.filter((l) => l.tipo_evento === "email_enviado").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="logs-kpi-grid col5">
        <KpiCard
          label="Total eventos"
          value={total}
          color={T.accent}
          icon={<GitBranch style={{ width: 18, height: 18 }} />}
        />
        <KpiCard
          label="Aprovações"
          value={aprovados}
          color={T.success}
          icon={<CheckCircle2 style={{ width: 18, height: 18 }} />}
        />
        <KpiCard
          label="Rejeições"
          value={rejeitados}
          color={T.danger}
          icon={<XCircle style={{ width: 18, height: 18 }} />}
        />
        <KpiCard
          label="E-mails enviados"
          value={emailsEnv}
          color={T.accent}
          icon={<Mail style={{ width: 18, height: 18 }} />}
        />
        <KpiCard
          label="Erros"
          value={erros}
          color={T.danger}
          icon={<AlertTriangle style={{ width: 18, height: 18 }} />}
        />
      </div>

      <div className="logs-panel">
        <div className="logs-panel-header">
          Logs de GMUD
          <span style={{ color: T.textSubtle, fontWeight: 400 }}>
            {filtered.length} de {total}
          </span>
        </div>
        <div className="logs-panel-body">
          <LogsFilters
            search={search}
            onSearch={setSearch}
            total={total}
            filtered={filtered.length}
            filters={[
              {
                value: filterTipo,
                onChange: setFilterTipo,
                options: [
                  { value: "all", label: "Todos os tipos" },
                  ...Object.entries(GMUD_EVENT_LABELS).map(([k, v]) => ({
                    value: k,
                    label: v.label,
                  })),
                ],
              },
              {
                value: filterStatus,
                onChange: setFilterStatus,
                options: [
                  { value: "all", label: "Todos os status" },
                  { value: "success", label: "Sucesso" },
                  { value: "error", label: "Erro" },
                  { value: "warning", label: "Atenção" },
                  { value: "info", label: "Informação" },
                ],
              },
            ]}
          />
          <LogsTable
            isLoading={isLoading}
            empty="Nenhum log encontrado."
            headers={["Data", "Tipo", "GMUD", "Descrição", "Usuário", "Status"]}
          >
            {filtered.map((l) => {
              const ev = GMUD_EVENT_LABELS[l.tipo_evento] ?? {
                label: l.tipo_evento,
                icon: <Clock className="size-3.5" />,
                tone: "muted" as const,
              };
              return (
                <tr key={l.id}>
                  <td className="mono muted" style={{ whiteSpace: "nowrap", fontSize: 11 }}>
                    {new Date(l.created_at).toLocaleString("pt-BR")}
                  </td>
                  <td>
                    <LogsBadge tone={ev.tone}>{ev.label}</LogsBadge>
                  </td>
                  <td style={{ maxWidth: 180 }}>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        display: "block",
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={l.gmud_titulo ?? "—"}
                    >
                      {l.gmud_titulo ?? <span style={{ color: T.textMuted }}>—</span>}
                    </span>
                    {l.gmud_id && (
                      <span className="mono muted" style={{ fontSize: 10 }}>
                        {l.gmud_id.slice(0, 8)}
                      </span>
                    )}
                  </td>
                  <td style={{ maxWidth: 280 }}>
                    <span
                      style={{
                        fontSize: 11,
                        color: T.textMuted,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {l.descricao}
                    </span>
                    {l.detalhes && Object.keys(l.detalhes as object).length > 0 && (
                      <details style={{ marginTop: 2 }}>
                        <summary style={{ cursor: "pointer", fontSize: 10, color: T.accent }}>ver detalhes</summary>
                        <pre
                          style={{
                            fontSize: 10,
                            background: T.surfaceAlt,
                            borderRadius: 4,
                            padding: 6,
                            marginTop: 4,
                            overflow: "auto",
                            maxHeight: 96,
                            whiteSpace: "pre-wrap",
                            color: T.textMuted,
                          }}
                        >
                          {JSON.stringify(l.detalhes as Record<string, unknown>, null, 2)}
                        </pre>
                      </details>
                    )}
                  </td>
                  <td style={{ fontSize: 11, color: T.textMuted }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <UserCheck style={{ width: 11, height: 11, flexShrink: 0 }} />
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={l.usuario_email ?? ""}
                      >
                        {l.usuario_nome ?? l.usuario_email ?? <em>sistema</em>}
                      </span>
                    </div>
                  </td>
                  <td>
                    <LogsBadge
                      tone={
                        l.status === "success"
                          ? "success"
                          : l.status === "error"
                            ? "error"
                            : l.status === "warning"
                              ? "warning"
                              : "info"
                      }
                    >
                      {l.status === "success"
                        ? "Sucesso"
                        : l.status === "error"
                          ? "Erro"
                          : l.status === "warning"
                            ? "Atenção"
                            : "Info"}
                    </LogsBadge>
                  </td>
                </tr>
              );
            })}
          </LogsTable>
        </div>
      </div>
    </div>
  );
}

// ─── VulnsLogsTab ─────────────────────────────────────────────────────────────

const VULN_EVENT_LABELS: Record<
  string,
  { label: string; icon: React.ReactNode; tone: "success" | "error" | "warning" | "info" | "muted" }
> = {
  mudanca_status: {
    label: "Mudança de Status",
    icon: <RefreshCw className="size-3.5" />,
    tone: "info",
  },
  mudanca_departamento: {
    label: "Depto. Responsável",
    icon: <UserCheck className="size-3.5" />,
    tone: "warning",
  },
  solicitacao_aprovacao: {
    label: "Solicitação Aprovação",
    icon: <Clock className="size-3.5" />,
    tone: "warning",
  },
  aprovacao: { label: "Aprovação", icon: <CheckCircle2 className="size-3.5" />, tone: "success" },
  rejeicao: { label: "Rejeição", icon: <XCircle className="size-3.5" />, tone: "error" },
  criacao: { label: "Criação", icon: <Plus className="size-3.5" />, tone: "info" },
  mudanca_data: {
    label: "Mudança de Data",
    icon: <RefreshCw className="size-3.5" />,
    tone: "muted",
  },
};

function VulnsLogsTab({ logs, isLoading }: { logs: VulnLog[]; isLoading: boolean }) {
  const [filterTipo, setFilterTipo] = React.useState("all");
  const [filterStatus, setFilterStatus] = React.useState("all");
  const [search, setSearch] = React.useState("");

  const filtered = React.useMemo(
    () =>
      logs.filter((l) => {
        if (filterTipo !== "all" && l.tipo_evento !== filterTipo) return false;
        if (filterStatus !== "all" && l.status !== filterStatus) return false;
        if (search.trim()) {
          const s = search.toLowerCase();
          return (
            (l.fqdn ?? "").toLowerCase().includes(s) ||
            (l.descricao ?? "").toLowerCase().includes(s) ||
            (l.usuario_email ?? "").toLowerCase().includes(s)
          );
        }
        return true;
      }),
    [logs, filterTipo, filterStatus, search],
  );

  const total = logs.length;
  const aprovacoes = logs.filter((l) => l.tipo_evento === "aprovacao").length;
  const rejeicoes = logs.filter((l) => l.tipo_evento === "rejeicao").length;
  const erros = logs.filter((l) => l.status === "error").length;
  const deptChanges = logs.filter((l) => l.tipo_evento === "mudanca_departamento").length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="logs-kpi-grid col5">
        <KpiCard
          label="Total eventos"
          value={total}
          color={T.accent}
          icon={<GitBranch style={{ width: 18, height: 18 }} />}
        />
        <KpiCard
          label="Aprovações"
          value={aprovacoes}
          color={T.success}
          icon={<CheckCircle2 style={{ width: 18, height: 18 }} />}
        />
        <KpiCard
          label="Rejeições"
          value={rejeicoes}
          color={T.danger}
          icon={<XCircle style={{ width: 18, height: 18 }} />}
        />
        <KpiCard
          label="Mudança Depto."
          value={deptChanges}
          color={T.warning}
          icon={<UserCheck style={{ width: 18, height: 18 }} />}
        />
        <KpiCard
          label="Erros"
          value={erros}
          color={T.danger}
          icon={<AlertTriangle style={{ width: 18, height: 18 }} />}
        />
      </div>

      <div className="logs-panel">
        <div className="logs-panel-header">
          Logs de Vulnerabilidades
          <span style={{ color: T.textSubtle, fontWeight: 400 }}>
            {filtered.length} de {total}
          </span>
        </div>
        <div className="logs-panel-body">
          <LogsFilters
            search={search}
            onSearch={setSearch}
            total={total}
            filtered={filtered.length}
            filters={[
              {
                value: filterTipo,
                onChange: setFilterTipo,
                options: [
                  { value: "all", label: "Todos os tipos" },
                  ...Object.entries(VULN_EVENT_LABELS).map(([k, v]) => ({
                    value: k,
                    label: v.label,
                  })),
                ],
              },
              {
                value: filterStatus,
                onChange: setFilterStatus,
                options: [
                  { value: "all", label: "Todos os status" },
                  { value: "success", label: "Sucesso" },
                  { value: "error", label: "Erro" },
                  { value: "info", label: "Informação" },
                  { value: "warning", label: "Atenção" },
                ],
              },
            ]}
          />
          <LogsTable
            isLoading={isLoading}
            empty="Nenhum log de vulnerabilidade encontrado."
            headers={["Data/Hora", "Tipo", "Host / FQDN", "Descrição", "Usuário", "Depto.", "Severidade", "Status"]}
          >
            {filtered.map((l) => {
              const ev = VULN_EVENT_LABELS[l.tipo_evento] ?? {
                label: l.tipo_evento,
                icon: <Clock className="size-3.5" />,
                tone: "muted" as const,
              };
              const det = l.detalhes ?? {};
              return (
                <tr key={l.id}>
                  <td className="mono muted" style={{ whiteSpace: "nowrap", fontSize: 11 }}>
                    {new Date(l.created_at).toLocaleString("pt-BR")}
                  </td>
                  <td>
                    <LogsBadge tone={ev.tone}>{ev.label}</LogsBadge>
                  </td>
                  <td className="mono" style={{ fontWeight: 600, fontSize: 11 }}>
                    {l.fqdn ?? <span style={{ color: T.textMuted }}>—</span>}
                  </td>
                  <td style={{ maxWidth: 260 }}>
                    <span
                      style={{
                        fontSize: 11,
                        color: T.textMuted,
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                        overflow: "hidden",
                      }}
                    >
                      {l.descricao}
                    </span>
                    {Object.keys(det).length > 0 && (
                      <details style={{ marginTop: 2 }}>
                        <summary style={{ cursor: "pointer", fontSize: 10, color: T.accent }}>ver detalhes</summary>
                        <pre
                          style={{
                            fontSize: 10,
                            background: T.surfaceAlt,
                            borderRadius: 4,
                            padding: 6,
                            marginTop: 4,
                            overflow: "auto",
                            maxHeight: 96,
                            whiteSpace: "pre-wrap",
                            color: T.textMuted,
                          }}
                        >
                          {JSON.stringify(det as Record<string, unknown>, null, 2)}
                        </pre>
                      </details>
                    )}
                  </td>
                  <td style={{ fontSize: 11, color: T.textMuted }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <UserCheck style={{ width: 11, height: 11, flexShrink: 0 }} />
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                        title={l.usuario_email ?? ""}
                      >
                        {l.usuario_nome ?? l.usuario_email ?? <em>sistema</em>}
                      </span>
                    </div>
                  </td>
                  <td style={{ fontSize: 11, color: T.textMuted }}>
                    {(det as any).department ?? (det as any).responsible ?? "—"}
                  </td>
                  <td>
                    {(det as any).severity ? (
                      <LogsBadge
                        tone={
                          (det as any).severity === "Crítica" || (det as any).severity === "Alta"
                            ? "error"
                            : (det as any).severity === "Média"
                              ? "warning"
                              : "muted"
                        }
                      >
                        {(det as any).severity}
                      </LogsBadge>
                    ) : (
                      <span style={{ color: T.textMuted, fontSize: 11 }}>—</span>
                    )}
                  </td>
                  <td>
                    <LogsBadge
                      tone={
                        l.status === "success"
                          ? "success"
                          : l.status === "error"
                            ? "error"
                            : l.status === "warning"
                              ? "warning"
                              : "info"
                      }
                    >
                      {l.status === "success"
                        ? "Sucesso"
                        : l.status === "error"
                          ? "Erro"
                          : l.status === "warning"
                            ? "Atenção"
                            : "Info"}
                    </LogsBadge>
                  </td>
                </tr>
              );
            })}
          </LogsTable>
        </div>
      </div>
    </div>
  );
}

// ─── CronJobsTab ──────────────────────────────────────────────────────────────

function fmtInterval(minutes: number): string {
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  if (minutes < 60) return `${minutes}min`;
  return `${(minutes / 60).toFixed(1)}h`;
}

function CronJobsTab({ logs, isLoading }: { logs: CronJobRun[]; isLoading: boolean }) {
  const ok = logs.filter((j) => getCronHealth(j).tone === "success").length;
  const issues = logs.length - ok;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div className="logs-kpi-grid col3">
        <KpiCard
          label="Jobs monitorados"
          value={logs.length}
          color={T.accent}
          icon={<Timer style={{ width: 18, height: 18 }} />}
        />
        <KpiCard label="OK" value={ok} color={T.success} icon={<CheckCircle2 style={{ width: 18, height: 18 }} />} />
        <KpiCard
          label="Atrasados / com erro"
          value={issues}
          color={T.danger}
          icon={<AlertTriangle style={{ width: 18, height: 18 }} />}
        />
      </div>

      {isLoading ? (
        <div
          style={{
            textAlign: "center",
            padding: "48px 0",
            color: "#6B7280",
            fontSize: 13,
            fontFamily: "'DM Sans',sans-serif",
          }}
        >
          Carregando jobs...
        </div>
      ) : logs.length === 0 ? (
        <div className="logs-panel">
          <div className="logs-panel-body">
            <div style={{ textAlign: "center", padding: "40px 0", color: "#6B7280", fontSize: 13 }}>
              Nenhum cron job monitorado.
            </div>
          </div>
        </div>
      ) : (
        <div className="logs-cron-grid">
          {logs.map((j) => {
            const { tone, label } = getCronHealth(j);
            const cardColor = tone === "success" ? T.success : tone === "warning" ? T.warning : T.danger;
            const elapsed = j.last_attempt_at ? Date.now() - new Date(j.last_attempt_at).getTime() : null;
            const expectedMs = j.expected_interval_minutes * 60 * 1000;
            const pct = elapsed !== null ? Math.min(100, (elapsed / expectedMs) * 100) : 100;
            const barColor = pct < 70 ? T.success : pct < 100 ? T.warning : T.danger;

            return (
              <div key={j.job_name} className="logs-cron-card" style={{ "--cc": cardColor } as React.CSSProperties}>
                {/* Header */}
                <div className="logs-cron-card-hd">
                  <div className="logs-cron-card-left">
                    <div
                      className={`logs-cron-dot${tone === "success" ? " pulse" : ""}`}
                      style={{ "--cc": cardColor } as React.CSSProperties}
                    />
                    <span className="logs-cron-name">{j.label}</span>
                  </div>
                  <div className="logs-cron-badges">
                    <LogsBadge tone={tone as any}>{label}</LogsBadge>
                    {j.last_trigger && (
                      <LogsBadge tone="muted">{j.last_trigger === "cron" ? "Auto" : "Manual"}</LogsBadge>
                    )}
                  </div>
                </div>

                {/* Body */}
                <div className="logs-cron-body">
                  {/* Stats */}
                  <div className="logs-cron-stats">
                    <div className="logs-cron-stat">
                      <div className="logs-cron-stat-lbl">
                        <Clock size={9} />
                        Última tentativa
                      </div>
                      <div className="logs-cron-stat-val">{fmtDateTime(j.last_attempt_at)}</div>
                    </div>
                    <div className="logs-cron-stat">
                      <div className="logs-cron-stat-lbl">
                        <CheckCircle2 size={9} />
                        Último sucesso
                      </div>
                      <div className="logs-cron-stat-val">{fmtDateTime(j.last_success_at)}</div>
                    </div>
                    <div className="logs-cron-stat">
                      <div className="logs-cron-stat-lbl">
                        <Timer size={9} />
                        Intervalo
                      </div>
                      <div className="logs-cron-stat-val large" style={{ color: cardColor }}>
                        {fmtInterval(j.expected_interval_minutes)}
                      </div>
                    </div>
                  </div>

                  {/* Freshness bar */}
                  <div>
                    <div className="logs-cron-bar-label">
                      <span>Atualidade da execução</span>
                      <span style={{ color: barColor, fontWeight: 600 }}>{pct.toFixed(0)}%</span>
                    </div>
                    <div className="logs-cron-bar-wrap">
                      <div
                        className="logs-cron-bar"
                        style={{ width: `${pct}%`, "--bar-color": barColor } as React.CSSProperties}
                      />
                    </div>
                  </div>

                  {/* Technical job name */}
                  <div
                    style={{
                      fontSize: 10,
                      color: "#6B7280",
                      fontFamily: "'IBM Plex Mono',monospace",
                      background: T.surfaceAlt,
                      borderRadius: 5,
                      padding: "4px 8px",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                      border: `1px solid ${T.border}`,
                    }}
                  >
                    {j.job_name}
                  </div>

                  {/* Error panel */}
                  {j.last_error && (
                    <div className="logs-cron-error">
                      <div className="logs-cron-error-hd">
                        <AlertCircle size={10} />
                        Último erro registrado
                      </div>
                      <div className="logs-cron-error-msg">{j.last_error}</div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Legacy KpiTile (mantido para compatibilidade com outros imports externos) ─
export function KpiTile({
  label,
  value,
  color,
  icon,
}: {
  label: string;
  value: string | number;
  color: string;
  icon?: React.ReactNode;
}) {
  return <KpiCard label={label} value={value} color={color} icon={icon} />;
}
