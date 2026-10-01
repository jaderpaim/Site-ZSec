import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  BarChart,
  Bar,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
  LabelList,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { SekTicketsPanel } from "./soc/SekTicketsPanel";
import { GripHorizontal, Minimize2, Maximize2 } from "lucide-react";
import {
  RefreshCw,
  Network,
  AlertTriangle,
  ShieldOff,
  Activity,
  Shield,
  TrendingUp,
  TrendingDown,
  ChevronUp,
  ChevronDown,
  Zap,
  Eye,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { CronHealthBadge, getCronHealth } from "./CronHealthBadge";

// Contrato de retorno do POST /api/public/hooks/qradar-sync-manual (mesmo
// shape de QradarSyncResult em qradar.server.ts) — não importamos o tipo de
// lá porque esse arquivo é server-only ("NEVER import this from client code").
type QradarSyncManualResult = {
  ok: boolean;
  counts: {
    logSources: number;
    epsSample: number;
    offenses: number;
    dropAlerts: number;
    rdpEvents: number;
    fortigatePolicyChanges: number;
    fortigateAdminConfigChanges: number;
    fortigateAdminLogins: number;
  };
  error?: string;
};

// ── Design Tokens — Executive Dark Intelligence Theme ──────────────────────────
const T = {
  // Core palette
  bg: "#0A0D14",
  surface: "#0F1420",
  surfaceAlt: "#131825",
  border: "#1E2640",
  borderHi: "#2A3560",

  // Accent brand
  accent: "#3B82F6", // electric blue
  accentGlow: "rgba(59,130,246,0.15)",
  accentSoft: "rgba(59,130,246,0.08)",

  // Semantic
  success: "#10B981",
  successBg: "rgba(16,185,129,0.10)",
  warning: "#F59E0B",
  warningBg: "rgba(245,158,11,0.10)",
  danger: "#EF4444",
  dangerBg: "rgba(239,68,68,0.10)",
  neutral: "#6B7280",

  // Text
  textPrimary: "#F1F5F9",
  textSecondary: "#F1F5F9",
  textMuted: "#F1F5F9",

  // Chart fills
  chartGrid: "rgba(30,38,64,0.8)",
  chartAxis: "#F1F5F9",
  chartTick: "#F1F5F9",
};

// Tooltip executivo
const execTooltip = {
  contentStyle: {
    background: "#0F1420",
    border: `1px solid ${T.borderHi}`,
    borderRadius: 8,
    fontSize: 12,
    color: T.textPrimary,
    boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
    fontFamily: "'IBM Plex Mono', monospace",
    padding: "10px 14px",
  },
  cursor: { fill: "rgba(59,130,246,0.06)" },
  labelStyle: { color: T.textSecondary, marginBottom: 4, fontFamily: "'DM Sans', sans-serif" },
};

const LICENSED_EPS = 2000;

// ── Inline CSS ─────────────────────────────────────────────────────────────────
const inlineStyles = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;1,9..40,300&family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');

  .soc-exec-root {
    font-family: 'DM Sans', sans-serif;
    background: ${T.bg};
    color: ${T.textPrimary};
    min-height: 100vh;
  }

  .soc-exec-root * {
    box-sizing: border-box;
  }

  /* KPI Card Premium */
  .exec-kpi {
    background: ${T.surface};
    border: 1px solid ${T.border};
    border-radius: 12px;
    padding: 20px 24px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    position: relative;
    overflow: hidden;
    transition: border-color 0.2s, box-shadow 0.2s;
  }
  .exec-kpi::before {
    content: '';
    position: absolute;
    top: 0; left: 0; right: 0;
    height: 2px;
    background: var(--kpi-accent, ${T.accent});
    opacity: 0.7;
  }
  .exec-kpi:hover {
    border-color: ${T.borderHi};
    box-shadow: 0 8px 32px rgba(0,0,0,0.4);
  }
  .exec-kpi-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.12em;
    text-transform: uppercase;
    color: ${T.textSecondary};
    font-family: 'IBM Plex Mono', monospace;
  }
  .exec-kpi-value {
    font-size: 28px;
    font-weight: 700;
    font-family: 'Space Grotesk', sans-serif;
    letter-spacing: -0.02em;
    line-height: 1;
    color: var(--kpi-color, ${T.textPrimary});
  }
  .exec-kpi-sub {
    font-size: 11px;
    color: ${T.textMuted};
    font-family: 'IBM Plex Mono', monospace;
  }
  .exec-kpi-icon {
    position: absolute;
    top: 10px; right: 10px;
    width: 42px; height: 42px;
    border-radius: 10px;
    display: flex; align-items: center; justify-content: center;
    background: color-mix(in srgb, var(--kpi-accent, #3B82F6) 18%, transparent);
  }
  /* Wrapper de KPI com tooltip — faz o card preencher a célula do grid (mesma altura dos demais) */
  .exec-kpi-wrap { position: relative; display: flex; }
  .exec-kpi-wrap > .exec-kpi { flex: 1; min-width: 0; }

  /* Panel Executivo */
  .exec-panel {
    background: ${T.surface};
    border: 1px solid ${T.border};
    border-radius: 12px;
    overflow: hidden;
  }
  .exec-panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 24px;
    border-bottom: 1px solid ${T.border};
    background: ${T.surfaceAlt};
  }
  .exec-panel-title {
    font-size: 13px;
    font-weight: 600;
    color: ${T.textPrimary};
    letter-spacing: 0.01em;
    display: flex;
    align-items: center;
    gap: 8px;
    font-family: 'DM Sans', sans-serif;
  }
  .exec-panel-body {
    padding: 20px 24px;
  }

  /* Chart Container */
  .exec-chart-card {
    background: ${T.surface};
    border: 1px solid ${T.border};
    border-radius: 12px;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    transition: border-color 0.2s;
  }
  .exec-chart-card:hover {
    border-color: ${T.borderHi};
  }
  .exec-chart-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    border-bottom: 1px solid ${T.border};
    background: ${T.surfaceAlt};
    flex-shrink: 0;
  }
  .exec-chart-title {
    font-size: 12px;
    font-weight: 600;
    color: ${T.textSecondary};
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-family: 'IBM Plex Mono', monospace;
  }
  .exec-chart-body {
    flex: 1;
    padding: 16px;
  }

  /* Table Executiva */
  .exec-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12.5px;
  }
  .exec-table thead tr {
    border-bottom: 1px solid ${T.border};
  }
  .exec-table th {
    padding: 8px 12px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: ${T.textMuted};
    font-family: 'IBM Plex Mono', monospace;
    text-align: left;
    white-space: nowrap;
    cursor: pointer;
    user-select: none;
  }
  .exec-table th:hover { color: ${T.textSecondary}; }
  .exec-table td {
    padding: 10px 12px;
    border-bottom: 1px solid rgba(30,38,64,0.5);
    font-family: 'DM Sans', sans-serif;
    color: ${T.textPrimary};
    vertical-align: middle;
  }
  .exec-table tbody tr:hover td { background: rgba(59,130,246,0.04); }
  .exec-table tbody tr:last-child td { border-bottom: none; }
  .exec-table .mono { font-family: 'IBM Plex Mono', monospace; font-size: 11.5px; }

  /* Status Badge Executivo */
  .exec-badge {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    font-family: 'IBM Plex Mono', monospace;
    white-space: nowrap;
  }
  .exec-badge-dot {
    width: 5px; height: 5px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .exec-badge.success { background: ${T.successBg}; color: ${T.success}; border: 1px solid rgba(16,185,129,0.2); }
  .exec-badge.warning { background: ${T.warningBg}; color: ${T.warning}; border: 1px solid rgba(245,158,11,0.2); }
  .exec-badge.danger  { background: ${T.dangerBg};  color: ${T.danger};  border: 1px solid rgba(239,68,68,0.2);  }
  .exec-badge.neutral { background: rgba(107,114,128,0.1); color: ${T.neutral}; border: 1px solid rgba(107,114,128,0.2); }
  .exec-badge.accent  { background: ${T.accentSoft}; color: ${T.accent}; border: 1px solid rgba(59,130,246,0.2); }

  /* Header Principal */
  .exec-header {
    background: ${T.surface};
    border-bottom: 1px solid ${T.border};
    padding: 16px 28px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    position: sticky;
    top: 0;
    z-index: 50;
    backdrop-filter: blur(20px);
  }
  .exec-header-brand {
    display: flex;
    align-items: center;
    gap: 12px;
  }
  .exec-header-shield {
    width: 36px; height: 36px;
    background: ${T.accentGlow};
    border: 1px solid rgba(59,130,246,0.3);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
  }
  .exec-header-title {
    font-size: 16px;
    font-weight: 700;
    color: ${T.textPrimary};
    font-family: 'Space Grotesk', sans-serif;
    letter-spacing: -0.01em;
  }
  .exec-header-sub {
    font-size: 11px;
    color: ${T.textMuted};
    font-family: 'IBM Plex Mono', monospace;
    margin-top: 1px;
  }
  .exec-header-meta {
    display: flex;
    align-items: center;
    gap: 16px;
  }
  .exec-header-sync-info {
    font-size: 11px;
    color: ${T.textMuted};
    font-family: 'IBM Plex Mono', monospace;
    text-align: right;
  }

  /* Sync Button */
  .exec-sync-btn {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 9px 18px;
    background: ${T.accentGlow};
    border: 1px solid rgba(59,130,246,0.4);
    border-radius: 8px;
    font-size: 12px;
    font-weight: 600;
    color: ${T.accent};
    cursor: pointer;
    transition: all 0.2s;
    font-family: 'DM Sans', sans-serif;
    letter-spacing: 0.01em;
  }
  .exec-sync-btn:hover:not(:disabled) {
    background: rgba(59,130,246,0.2);
    border-color: rgba(59,130,246,0.6);
    box-shadow: 0 0 20px rgba(59,130,246,0.15);
  }
  .exec-sync-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* Section Divider */
  .exec-section-label {
    font-size: 10px;
    font-weight: 600;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: ${T.textMuted};
    font-family: 'IBM Plex Mono', monospace;
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 14px;
  }
  .exec-section-label::after {
    content: '';
    flex: 1;
    height: 1px;
    background: ${T.border};
  }

  /* Resize controls */
  .resize-ctrl {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    opacity: 0;
    transition: opacity 0.15s;
  }
  .exec-chart-card:hover .resize-ctrl { opacity: 1; }
  .resize-btn {
    padding: 2px;
    border: none;
    background: transparent;
    color: ${T.textMuted};
    cursor: pointer;
    border-radius: 3px;
    line-height: 0;
    transition: color 0.15s, background 0.15s;
  }
  .resize-btn:hover { color: ${T.textPrimary}; background: rgba(255,255,255,0.07); }
  .resize-btn:disabled { opacity: 0.25; cursor: default; }

  /* Scrollbar */
  .exec-scroll::-webkit-scrollbar { width: 4px; height: 4px; }
  .exec-scroll::-webkit-scrollbar-track { background: transparent; }
  .exec-scroll::-webkit-scrollbar-thumb { background: ${T.borderHi}; border-radius: 2px; }

  /* Severity pill */
  .sev-pill {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    min-width: 24px;
    height: 20px;
    padding: 0 6px;
    border-radius: 3px;
    font-size: 11px;
    font-weight: 700;
    font-family: 'IBM Plex Mono', monospace;
  }
  .sev-1,.sev-2,.sev-3 { background: rgba(16,185,129,0.12); color: ${T.success}; }
  .sev-4,.sev-5,.sev-6 { background: rgba(245,158,11,0.12); color: ${T.warning}; }
  .sev-7,.sev-8,.sev-9,.sev-10 { background: rgba(239,68,68,0.12); color: ${T.danger}; }

  /* Pulse dot */
  @keyframes pulse-ring {
    0% { box-shadow: 0 0 0 0 rgba(16,185,129,0.5); }
    70% { box-shadow: 0 0 0 6px rgba(16,185,129,0); }
    100% { box-shadow: 0 0 0 0 rgba(16,185,129,0); }
  }
  .live-dot {
    width: 7px; height: 7px;
    border-radius: 50%;
    background: ${T.success};
    animation: pulse-ring 2s infinite;
  }

  /* Spin */
  @keyframes spin { to { transform: rotate(360deg); } }
  .spin { animation: spin 0.8s linear infinite; }

  /* Fade in */
  @keyframes fadeUp {
    from { opacity: 0; transform: translateY(8px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  .fade-up { animation: fadeUp 0.4s ease forwards; }

  /* Empty state */
  .exec-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 40px 24px;
    gap: 8px;
    color: ${T.textMuted};
    font-size: 13px;
    font-family: 'DM Sans', sans-serif;
  }
  .exec-empty-icon {
    width: 36px; height: 36px;
    background: rgba(107,114,128,0.08);
    border: 1px solid rgba(107,114,128,0.15);
    border-radius: 8px;
    display: flex; align-items: center; justify-content: center;
    margin-bottom: 4px;
    color: ${T.neutral};
  }

  /* Error banner */
  .exec-error-bar {
    background: ${T.dangerBg};
    border: 1px solid rgba(239,68,68,0.2);
    border-radius: 6px;
    padding: 8px 14px;
    font-size: 11.5px;
    color: ${T.danger};
    font-family: 'IBM Plex Mono', monospace;
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 12px;
  }

  /* Progress bar EPS */
  .eps-progress-track {
    height: 6px;
    background: rgba(59,130,246,0.1);
    border-radius: 3px;
    overflow: hidden;
    margin-top: 6px;
  }
  .eps-progress-fill {
    height: 100%;
    border-radius: 3px;
    transition: width 0.6s ease;
  }

  /* Log source pill status */
  .status-row { display: flex; align-items: center; gap: 6px; }
  .status-indicator {
    width: 6px; height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }
  .status-indicator.success { background: ${T.success}; box-shadow: 0 0 6px ${T.success}; }
  .status-indicator.error   { background: ${T.danger};  box-shadow: 0 0 6px ${T.danger}; }
  .status-indicator.disabled{ background: ${T.neutral}; }
  .status-indicator.stale   { background: ${T.warning}; box-shadow: 0 0 6px ${T.warning}; }

  /* ── Recharts global overrides ── */
  .recharts-cartesian-axis-tick-value { fill: ${T.chartTick} !important; font-size: 10px; font-family: 'IBM Plex Mono', monospace; }
  .recharts-text { fill: ${T.chartTick} !important; }
  .recharts-legend-item-text { color: ${T.textSecondary} !important; font-size: 11px; font-family: 'IBM Plex Mono', monospace; }
  .recharts-label { fill: ${T.textSecondary} !important; font-size: 11px; font-family: 'IBM Plex Mono', monospace; }

  /* Rótulos de IP (eixo Y) dos gráficos de ofensores/origens — em branco */
  .soc-scope .ip-axis .recharts-cartesian-axis-tick text { fill: ${T.textPrimary} !important; }
`;

// ── Utility Components ────────────────────────────────────────────────────────

function ExecBadge({
  tone,
  children,
}: {
  tone: "success" | "warning" | "danger" | "neutral" | "accent";
  children: React.ReactNode;
}) {
  const dotColor = { success: T.success, warning: T.warning, danger: T.danger, neutral: T.neutral, accent: T.accent }[
    tone
  ];
  return (
    <span className={`exec-badge ${tone}`}>
      <span className="exec-badge-dot" style={{ background: dotColor }} />
      {children}
    </span>
  );
}

function SevPill({ severity }: { severity: number | null | undefined }) {
  const s = severity ?? 0;
  return <span className={`sev-pill sev-${Math.min(s, 10)}`}>{s}</span>;
}

function fmtDate(s: string | null | undefined) {
  if (!s) return "—";
  return new Date(s).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

// Contagem de quanto tempo a fonte está no status atual (rastreado por nós via
// status_changed_at, já que o QRadar não manda um "último evento" confiável
// nesse ambiente — ver qradar_log_sources_track_status_change no banco).
function fmtDuration(s: string | null | undefined) {
  if (!s) return "—";
  const ms = Date.now() - new Date(s).getTime();
  if (ms < 0) return "—";
  const minutes = Math.floor(ms / 60_000);
  if (minutes < 60) return `${minutes}min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  return `${days}d`;
}

function fmtNum(n: number) {
  return Math.round(n).toLocaleString("pt-BR");
}

function fmtDayShort(day: string): string {
  const [, m, d] = day.split("-");
  return `${d}/${m}`;
}

function fortigateTypeBadge(queryType: string): { tone: "accent" | "warning" | "success"; label: string } {
  if (queryType === "admin_config") return { tone: "warning", label: "Admin/Config" };
  if (queryType === "admin_login") return { tone: "success", label: "Login Admin" };
  return { tone: "accent", label: "Policy Change" };
}

// O FortiGate só loga o ID numérico da policy nesse tipo de evento (ex.: "Edit
// firewall.policy 21"), sem o nome — não temos acesso à API do FortiGate pra
// resolver o nome, então só deixamos o ID mais legível nos detalhes do evento.
function extractFortigatePolicyId(msg: string | null): string | null {
  if (!msg) return null;
  const m = /firewall\.policy\s+(\d+)/i.exec(msg);
  return m ? m[1] : null;
}

// Janela de expediente 08:00–19:00 no horário local do navegador — mesmo
// critério da regra "Firewall Policy Actions After Work Hour" do QRadar.
function isOutsideBusinessHours(eventTime: string): boolean {
  const h = new Date(eventTime).getHours();
  return h < 8 || h >= 19;
}

function isInternalIp(ip: string | null | undefined): boolean {
  if (!ip) return false;
  const m = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)/);
  if (!m) return false;
  const [a, b] = [parseInt(m[1], 10), parseInt(m[2], 10)];
  if (a === 10) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  return false;
}

// cfgattr é o diff bruto do FortiGate (ex.: "action[disable->enable]") — já
// vem na AQL e é usado pro badge de risco, mas só existe dentro do raw, sem
// coluna dedicada na tabela qradar_fortigate_policy_changes.
function fortigateRawDetail(raw: unknown) {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    cfgattr: typeof r.cfgattr === "string" ? r.cfgattr : null,
  };
}

// Nomes técnicos mais comuns do cfgattr do Fortigate, traduzidos. Cobre os
// casos vistos até agora — atributo que não estiver aqui aparece com o nome
// técnico original (sem quebrar o parser).
const FORTIGATE_ATTR_LABELS: Record<string, string> = {
  dstintf: "Interface de Destino",
  srcintf: "Interface de Origem",
  dstaddr: "Endereços de Destino",
  srcaddr: "Endereços de Origem",
  action: "Ação",
  schedule: "Agendamento",
  service: "Serviço",
  status: "Status",
  name: "Nome",
  comments: "Comentários",
  nat: "NAT",
  logtraffic: "Log de Tráfego",
  "utm-status": "UTM",
  "ips-sensor": "Sensor IPS",
  "av-profile": "Perfil Antivírus",
  "webfilter-profile": "Perfil Web Filter",
  "ssl-ssh-profile": "Perfil SSL/SSH",
  groups: "Grupos",
  users: "Usuários",
  poolname: "Pool de IP",
};

type FortigateCfgAttrChange = {
  label: string;
  unchanged: boolean;
  before?: string;
  after?: string;
  added: string[];
  removed: string[];
};

function diffWords(before: string, after: string): { added: string[]; removed: string[] } {
  const b = before.split(/\s+/).filter(Boolean);
  const a = after.split(/\s+/).filter(Boolean);
  const bSet = new Set(b);
  const aSet = new Set(a);
  return { added: a.filter((w) => !bSet.has(w)), removed: b.filter((w) => !aSet.has(w)) };
}

// cfgattr vem como "attr1[antes->depois]attr2[valor]..." concatenado, sem
// separador entre atributos — só os colchetes delimitam cada um. Quando
// antes/depois é uma lista separada por espaço (ex.: endereços), calcula o
// diff item a item em vez de mostrar o bloco inteiro repetido. Formatos não
// reconhecidos (ex.: eventos sem colchetes) retornam null — quem chama cai
// de volta pro texto bruto.
function parseFortigateCfgAttr(cfgattr: string | null): FortigateCfgAttrChange[] | null {
  if (!cfgattr) return null;
  const matches = [...cfgattr.matchAll(/([a-zA-Z0-9_-]+)\[([^\]]*)\]/g)];
  if (matches.length === 0) return null;
  return matches.map((m) => {
    const name = m[1];
    const content = m[2];
    const label = FORTIGATE_ATTR_LABELS[name] ?? name;
    const arrowIdx = content.indexOf("->");
    if (arrowIdx === -1) {
      return { label, unchanged: false, after: content.trim(), added: [], removed: [] };
    }
    const before = content.slice(0, arrowIdx).trim();
    const after = content.slice(arrowIdx + 2).trim();
    if (before === after) {
      return { label, unchanged: true, before, after, added: [], removed: [] };
    }
    return { label, unchanged: false, before, after, ...diffWords(before, after) };
  });
}

// Campos extras do offense que só existem dentro do payload bruto do QRadar
// (não têm coluna dedicada na tabela qradar_offenses)
function offenseRawDetail(raw: unknown) {
  const r = (raw ?? {}) as Record<string, unknown>;
  return {
    categories: Array.isArray(r.categories) ? (r.categories as string[]) : [],
    credibility: typeof r.credibility === "number" ? r.credibility : null,
    relevance: typeof r.relevance === "number" ? r.relevance : null,
    deviceCount: typeof r.device_count === "number" ? r.device_count : null,
    sourceCount: typeof r.source_count === "number" ? r.source_count : null,
    flowCount: typeof r.flow_count === "number" ? r.flow_count : null,
    assignedTo: typeof r.assigned_to === "string" ? r.assigned_to : null,
    followUp: typeof r.follow_up === "boolean" ? r.follow_up : null,
  };
}

function median(nums: number[]): number {
  if (nums.length === 0) return 0;
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function fmtHours(h: number): string {
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

// Compara quanto tempo uma offense aberta já está sem fechar contra a mediana
// histórica de fechamento da mesma regra (closed_at - start_time). Não há campo
// do QRadar que diga "a integração de fechamento falhou" — isso é uma estimativa
// por comparação com o padrão observado, não uma certeza.
function diagnoseOpenOffense(
  o: { description: string | null; start_time: string | null },
  statsByDesc: Map<string, { medianHours: number; count: number }>,
): { tone: "neutral" | "warning"; label: string; elapsedHours: number | null; medianHours: number | null } {
  const stats = statsByDesc.get(o.description ?? "");
  const elapsedHours = o.start_time ? (Date.now() - new Date(o.start_time).getTime()) / 3_600_000 : null;
  if (!stats || stats.count < 2 || elapsedHours === null) {
    return { tone: "neutral", label: "Sem histórico", elapsedHours, medianHours: null };
  }
  const threshold = Math.max(stats.medianHours * 4, 6);
  if (elapsedHours > threshold) {
    return { tone: "warning", label: "Atraso no fechamento", elapsedHours, medianHours: stats.medianHours };
  }
  return { tone: "neutral", label: "Dentro do padrão", elapsedHours, medianHours: stats.medianHours };
}

// ── Resizable Chart Card ────────────────────────────────────────────────────────
const COL_SIZES_SOC = ["col-span-1", "col-span-2", "col-span-3"] as const;
type ColSizeSoc = (typeof COL_SIZES_SOC)[number];

function ResizableChart({
  title,
  children,
  chartHeight = 280,
  defaultSize = "col-span-1",
  badge,
  headerRight,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  chartHeight?: number;
  defaultSize?: ColSizeSoc;
  badge?: React.ReactNode;
  headerRight?: React.ReactNode;
}) {
  const [colSize, setColSize] = React.useState<ColSizeSoc>(defaultSize);
  function grow() {
    const i = COL_SIZES_SOC.indexOf(colSize);
    if (i < COL_SIZES_SOC.length - 1) setColSize(COL_SIZES_SOC[i + 1]);
  }
  function shrink() {
    const i = COL_SIZES_SOC.indexOf(colSize);
    if (i > 0) setColSize(COL_SIZES_SOC[i - 1]);
  }
  return (
    <div className={`${colSize} exec-chart-card`} style={{ minHeight: chartHeight + 52 }}>
      <div className="exec-chart-header">
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <GripHorizontal size={12} color={T.textMuted} style={{ cursor: "grab" }} />
          <span className="exec-chart-title">{title}</span>
          {badge && <span style={{ marginLeft: 4 }}>{badge}</span>}
        </div>
        {headerRight && (
          <span style={{ marginLeft: "auto", marginRight: 10, display: "flex", alignItems: "center" }}>
            {headerRight}
          </span>
        )}
        <div className="resize-ctrl">
          <button className="resize-btn" onClick={shrink} disabled={colSize === COL_SIZES_SOC[0]} title="Diminuir">
            <Minimize2 size={11} />
          </button>
          <button className="resize-btn" onClick={grow} disabled={colSize === COL_SIZES_SOC[2]} title="Aumentar">
            <Maximize2 size={11} />
          </button>
        </div>
      </div>
      <div className="exec-chart-body" style={{ height: chartHeight }}>
        {children}
      </div>
    </div>
  );
}

// ── Executive KPI Card ─────────────────────────────────────────────────────────
function ExecKpiCard({
  label,
  value,
  sub,
  accentColor = T.accent,
  icon: Icon,
  trend,
  footer,
}: {
  label: string;
  value: string;
  sub?: string;
  accentColor?: string;
  icon?: React.ElementType;
  trend?: "up" | "down" | "neutral";
  footer?: React.ReactNode;
}) {
  return (
    <div
      className="exec-kpi fade-up"
      style={{ "--kpi-accent": accentColor, "--kpi-color": accentColor } as React.CSSProperties}
    >
      {Icon && (
        <div className="exec-kpi-icon">
          <Icon size={22} color={accentColor} />
        </div>
      )}
      <span className="exec-kpi-label">{label}</span>
      <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
        <span className="exec-kpi-value">{value}</span>
        {trend && trend !== "neutral" && (
          <span style={{ color: trend === "up" ? T.danger : T.success, display: "flex", alignItems: "center" }}>
            {trend === "up" ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </span>
        )}
      </div>
      {sub && <span className="exec-kpi-sub">{sub}</span>}
      {footer}
    </div>
  );
}

// ── Custom Tooltip ──────────────────────────────────────────────────────────────
function ExecTooltip({ active, payload, label, formatter }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${T.borderHi}`,
        borderRadius: 8,
        padding: "10px 14px",
        fontSize: 12,
        fontFamily: "'DM Sans', sans-serif",
        boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
        minWidth: 140,
      }}
    >
      <div
        style={{
          color: T.textMuted,
          fontSize: 10,
          fontFamily: "'IBM Plex Mono', monospace",
          marginBottom: 6,
          textTransform: "uppercase",
          letterSpacing: "0.08em",
        }}
      >
        {label}
      </div>
      {payload.map((entry: any, i: number) => (
        <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 3 }}>
          <div style={{ width: 8, height: 8, borderRadius: 2, background: entry.color, flexShrink: 0 }} />
          <span style={{ color: T.textSecondary, fontSize: 11 }}>{entry.name}:</span>
          <span style={{ color: T.textPrimary, fontWeight: 600, fontFamily: "'IBM Plex Mono', monospace" }}>
            {formatter ? formatter(entry.value, entry.name, entry) : fmtNum(entry.value)}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Custom Bar Shape with gradient ─────────────────────────────────────────────
function ExecBarShape(props: any) {
  const { x, y, width, height, fill } = props;
  if (!width || !height) return null;
  const id = `bar-grad-${Math.random().toString(36).slice(2, 6)}`;
  return (
    <g>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor={fill} stopOpacity={0.6} />
          <stop offset="100%" stopColor={fill} stopOpacity={1} />
        </linearGradient>
      </defs>
      <rect x={x} y={y} width={width} height={height} fill={`url(#${id})`} rx={3} />
    </g>
  );
}

// ── Detail Field (linha expandida de tabela) ────────────────────────────────────
function DetailField({ label, value, span }: { label: string; value: React.ReactNode; span?: number }) {
  return (
    <div style={{ gridColumn: span ? `span ${span}` : undefined, minWidth: 0 }}>
      <div
        style={{
          fontSize: 9,
          color: T.textMuted,
          fontFamily: "'IBM Plex Mono', monospace",
          textTransform: "uppercase",
          letterSpacing: "0.08em",
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: 12,
          color: T.textPrimary,
          fontFamily: "'DM Sans', sans-serif",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
        title={typeof value === "string" ? value : undefined}
      >
        {value}
      </div>
    </div>
  );
}

// ── Empty State ────────────────────────────────────────────────────────────────
function EmptyState({ message }: { message: string }) {
  return (
    <div className="exec-empty">
      <div className="exec-empty-icon">
        <Shield size={18} />
      </div>
      <span>{message}</span>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
export function SocRealDashboard() {
  const qc = useQueryClient();
  const [syncing, setSyncing] = React.useState(false);
  const [sortBy, setSortBy] = React.useState<string>("status-asc");
  const [delSortBy, setDelSortBy] = React.useState<"event_count" | "username" | "event_time">("event_count");
  const [delSortDir, setDelSortDir] = React.useState<"asc" | "desc">("desc");
  const [dlSortBy, setDlSortBy] = React.useState<"event_count" | "username" | "event_time">("event_count");
  const [dlSortDir, setDlSortDir] = React.useState<"asc" | "desc">("desc");
  const [showOffensesTip, setShowOffensesTip] = React.useState(false);
  const [showEpsPeakTip, setShowEpsPeakTip] = React.useState(false);
  const [expandedOffenseIds, setExpandedOffenseIds] = React.useState<Set<number>>(new Set());

  function toggleOffenseExpand(id: number) {
    setExpandedOffenseIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const [expandedFortigateIds, setExpandedFortigateIds] = React.useState<Set<string>>(new Set());

  function toggleFortigateExpand(id: string) {
    setExpandedFortigateIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // ── ALL QUERIES UNCHANGED (back-end) ────────────────────────────────────────
  const state = useQuery({
    queryKey: ["qradar-sync-state"],
    queryFn: async () => {
      const { data } = await supabase.from("qradar_sync_state").select("*").eq("id", true).maybeSingle();
      return data;
    },
    // Refetch periódico pra refletir sync disparado por outra aba/pelo cron —
    // não só o disparado por este botão (esse já invalida a query no finally).
    refetchInterval: 60_000,
  });

  const eps = useQuery({
    queryKey: ["qradar-eps-samples"],
    queryFn: async () => {
      const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("qradar_eps_samples")
        .select("sampled_at,total_eps,peak_eps,peak_eps_avg,licensed_eps")
        .gte("sampled_at", since)
        .order("sampled_at", { ascending: true })
        .limit(10000);
      if (error) throw error;
      const byHour = new Map<
        string,
        { sum: number; count: number; lic: number; peak: number | null; avgPeakSum: number; avgPeakCount: number }
      >();
      for (const s of data ?? []) {
        const d = new Date(s.sampled_at);
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:00`;
        const cur = byHour.get(key) ?? {
          sum: 0,
          count: 0,
          lic: s.licensed_eps ?? 2000,
          peak: null,
          avgPeakSum: 0,
          avgPeakCount: 0,
        };
        cur.sum += Number(s.total_eps ?? 0);
        cur.count += 1;
        if (s.peak_eps != null)
          cur.peak = cur.peak == null ? Number(s.peak_eps) : Math.max(cur.peak, Number(s.peak_eps));
        if (s.peak_eps_avg != null) {
          cur.avgPeakSum += Number(s.peak_eps_avg);
          cur.avgPeakCount += 1;
        }
        byHour.set(key, cur);
      }
      return [...byHour.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, v]) => ({
          sampled_at: key,
          total_eps: Math.round(v.sum / v.count),
          peak_eps: v.peak,
          peak_eps_avg: v.avgPeakCount > 0 ? v.avgPeakSum / v.avgPeakCount : null,
          licensed_eps: v.lic,
        }));
    },
  });

  // Saúde do cron qradar-sync — usada pra avisar quando o status das fontes
  // abaixo pode estar desatualizado (qradar_log_sources só é atualizada
  // quando o sync roda com sucesso; se o cron estiver falhando, essa linha
  // continua congelada no último status bom, mesmo que a fonte real tenha
  // caído — cron_job_runs é a fonte de verdade sobre o cron em si).
  const qradarCronHealth = useQuery({
    queryKey: ["cron-job-run", "qradar-sync"],
    queryFn: async () => {
      const { data } = await supabase.from("cron_job_runs").select("*").eq("job_name", "qradar-sync").maybeSingle();
      return data;
    },
    refetchInterval: 60_000,
  });
  const logSourcesSyncUnhealthy = qradarCronHealth.data
    ? getCronHealth(qradarCronHealth.data).tone !== "success"
    : false;

  const logSources = useQuery({
    queryKey: ["qradar-log-sources"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("qradar_log_sources")
        .select("id,name,type_name,status,avg_eps,enabled,status_changed_at")
        .order("avg_eps", { ascending: false })
        .limit(500);
      if (error) throw error;
      return data ?? [];
    },
  });

  const drops = useQuery({
    queryKey: ["qradar-drop-alerts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("qradar_drop_alerts")
        .select("*")
        .order("occurred_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data ?? [];
    },
  });

  const offenses = useQuery({
    queryKey: ["qradar-offenses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("qradar_offenses")
        .select(
          "id,description,source_ip,destination_ip,event_count,severity,magnitude,status,start_time,last_updated_time,closed_at,raw",
        )
        .order("last_updated_time", { ascending: false })
        .limit(1000);
      if (error) throw error;
      return data ?? [];
    },
  });

  const externalOffenders = useQuery({
    queryKey: ["qradar-external-offenders"],
    queryFn: async () => {
      const { data: latest } = await (supabase as any)
        .from("qradar_external_offenders")
        .select("sampled_at")
        .order("sampled_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!latest) return [];
      const { data, error } = await (supabase as any)
        .from("qradar_external_offenders")
        .select("source_ip,event_count")
        .eq("sampled_at", latest.sampled_at)
        .order("event_count", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []).map((r: { source_ip: string; event_count: number | null }) => ({
        ip: r.source_ip,
        v: r.event_count ?? 0,
      }));
    },
  });

  const o365Deletions = useQuery({
    queryKey: ["qradar-o365-deletions"],
    queryFn: async () => {
      const { data: latest } = await (supabase as any)
        .from("qradar_o365_deletions")
        .select("sampled_at")
        .order("sampled_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!latest) return [];
      const { data, error } = await (supabase as any)
        .from("qradar_o365_deletions")
        .select("username,source_ip,qid,event_count,event_time")
        .eq("sampled_at", latest.sampled_at)
        .order("event_count", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{
        username: string;
        source_ip: string;
        qid: number;
        event_count: number;
        event_time: string | null;
      }>;
    },
  });

  const topSourceEvents = useQuery({
    queryKey: ["qradar-internal-offenders"],
    queryFn: async () => {
      const { data: latest } = await (supabase as any)
        .from("qradar_internal_offenders")
        .select("sampled_at")
        .order("sampled_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!latest) return [];
      const { data, error } = await (supabase as any)
        .from("qradar_internal_offenders")
        .select("source_ip,event_count")
        .eq("sampled_at", latest.sampled_at)
        .order("event_count", { ascending: false })
        .limit(10);
      if (error) throw error;
      return (data ?? []).map((r: { source_ip: string; event_count: number | null }) => ({
        ip: r.source_ip,
        v: r.event_count ?? 0,
      }));
    },
  });

  const o365Downloads = useQuery({
    queryKey: ["qradar-o365-downloads"],
    queryFn: async () => {
      const { data: latest } = await (supabase as any)
        .from("qradar_o365_downloads")
        .select("sampled_at")
        .order("sampled_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!latest) return [];
      const { data, error } = await (supabase as any)
        .from("qradar_o365_downloads")
        .select("username,source_ip,qid,event_count,event_time")
        .eq("sampled_at", latest.sampled_at)
        .order("event_count", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Array<{
        username: string;
        source_ip: string;
        qid: number;
        event_count: number;
        event_time: string | null;
      }>;
    },
  });

  const fortigatePolicyChanges = useQuery({
    queryKey: ["qradar-fortigate-policy-changes"],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("qradar_fortigate_policy_changes")
        .select("*")
        .gte("event_time", since)
        .order("event_time", { ascending: false })
        .limit(100);
      if (error) throw error;
      return data ?? [];
    },
  });

  const rdp = useQuery({
    queryKey: ["qradar-rdp-events"],
    queryFn: async () => {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("qradar_rdp_events")
        .select("*")
        .gte("event_time", since)
        .order("event_time", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data ?? [];
    },
  });

  // "syncing" só cobre o sync disparado por ESTE clique nesta instância do
  // componente — ao sair do módulo e voltar, o componente é desmontado e
  // remontado, "syncing" reseta para false mesmo que o sync ainda esteja
  // rodando no servidor (confirmado: sync sobrevive à navegação, já que roda
  // no backend independente do cliente ficar ouvindo). Cruza com o lease real
  // (qradar_sync_state.sync_running_since) pra refletir o estado verdadeiro.
  // 45min espelha SYNC_LEASE_STALE_MS em qradar.server.ts — mantido separado
  // aqui porque esse arquivo é server-only e não pode ser importado no client.
  const SYNC_LEASE_STALE_MS = 45 * 60 * 1000;
  const serverSyncRunning = state.data?.sync_running_since
    ? Date.now() - new Date(state.data.sync_running_since).getTime() < SYNC_LEASE_STALE_MS
    : false;
  const syncDisabled = syncing || serverSyncRunning;

  // Chama via fetch() cru (não createServerFn) porque a resposta é um stream
  // ndjson com heartbeats — necessário pra a borda da Cloudflare na frente de
  // bernoulli.com.br não cortar a conexão em ~100s de silêncio (ver
  // qradar-sync-manual.ts). O resultado final vem na última linha
  // ({"status":"done","result":{...}}); as linhas de heartbeat no meio só
  // existem pra manter a conexão viva e são ignoradas aqui.
  const handleSync = async () => {
    setSyncing(true);
    try {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session?.access_token) throw new Error("Sessão expirada — faça login novamente.");

      const res = await fetch("/api/public/hooks/qradar-sync-manual", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok || !res.body) {
        const text = await res.text().catch(() => "");
        throw new Error(text || `Falha ao iniciar sincronização (HTTP ${res.status})`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let final: QradarSyncManualResult | null = null;

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let newlineIndex: number;
        while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          if (!line.trim()) continue;
          const msg = JSON.parse(line) as { status: string; result?: QradarSyncManualResult };
          if (msg.status === "done" && msg.result) final = msg.result;
        }
      }

      if (!final) throw new Error("Conexão encerrada antes do resultado final da sincronização.");

      const r = final;
      if (r.ok)
        toast.success(
          `Sincronizado: ${r.counts.logSources} fontes, ${r.counts.offenses} offenses, ${r.counts.rdpEvents} RDP, ${r.counts.fortigatePolicyChanges} policy change, ${r.counts.fortigateAdminConfigChanges} admin/config, ${r.counts.fortigateAdminLogins} login admin`,
        );
      else toast.error(`Sync com erros: ${r.error ?? "desconhecido"}`);
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["qradar-sync-state"] }),
        qc.invalidateQueries({ queryKey: ["qradar-eps-samples"] }),
        qc.invalidateQueries({ queryKey: ["qradar-log-sources"] }),
        qc.invalidateQueries({ queryKey: ["qradar-drop-alerts"] }),
        qc.invalidateQueries({ queryKey: ["qradar-offenses"] }),
        qc.invalidateQueries({ queryKey: ["qradar-rdp-events"] }),
        qc.invalidateQueries({ queryKey: ["qradar-external-offenders"] }),
        qc.invalidateQueries({ queryKey: ["qradar-internal-offenders"] }),
        qc.invalidateQueries({ queryKey: ["qradar-o365-downloads"] }),
        qc.invalidateQueries({ queryKey: ["qradar-o365-deletions"] }),
        qc.invalidateQueries({ queryKey: ["qradar-fortigate-policy-changes"] }),
      ]);
    } catch (e) {
      toast.error(`Falha ao sincronizar: ${(e as Error).message}`);
    } finally {
      setSyncing(false);
    }
  };

  // ── Derived data (unchanged logic) ──────────────────────────────────────────
  // Pico do gráfico evolutivo usa peak_eps_avg — a MÉDIA da telemetria nativa do
  // QRadar ("Events per Second Raw - Peak 1 Sec"), calculada na própria AQL
  // (ver syncEpsPeak em qradar.server.ts) — não o máximo. O card "EPS Pico
  // (7 dias)" (dailyPeaksLast7/maxPeak7d, abaixo) continua usando peak_eps (o
  // máximo real) — são colunas/cálculos independentes.
  const epsSeries = (eps.data ?? []).map((s) => ({
    t: new Date(s.sampled_at)
      .toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit" })
      .replace(",", ""),
    eps: Number(s.total_eps),
    peak: s.peak_eps_avg != null ? Number(s.peak_eps_avg) : null,
    lic: s.licensed_eps ?? LICENSED_EPS,
  }));
  const currentEps = epsSeries.length ? epsSeries[epsSeries.length - 1].eps : 0;
  const usagePct = LICENSED_EPS > 0 ? Math.round((currentEps / LICENSED_EPS) * 100) : 0;
  const excedentePct =
    LICENSED_EPS > 0 ? Math.max(0, Math.round(((currentEps - LICENSED_EPS) / LICENSED_EPS) * 100)) : 0;

  // Pico diário = maior peak_eps do dia, vindo da telemetria nativa do QRadar
  // (StatFilter "Events per Second Raw - Peak 1 Sec"), não mais um derivado das
  // amostras esparsas de total_eps. Amostras antigas (antes da coluna existir) não
  // entram aqui — só contam ciclos de sync que já rodaram com a nova AQL de pico.
  const dailyPeaksLast7 = (() => {
    const sinceTs = Date.now() - 7 * 24 * 3600 * 1000;
    const byDay = new Map<string, number>();
    for (const s of eps.data ?? []) {
      const t = new Date(s.sampled_at).getTime();
      if (t < sinceTs || s.peak_eps == null) continue;
      const day = s.sampled_at.slice(0, 10);
      const v = Number(s.peak_eps);
      if (!byDay.has(day) || v > (byDay.get(day) as number)) byDay.set(day, v);
    }
    return [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([day, peak]) => ({ day, peak }));
  })();
  const maxPeak7d = dailyPeaksLast7.length ? Math.max(...dailyPeaksLast7.map((d) => d.peak)) : 0;

  const sourcesByEps = (() => {
    const filtered = (logSources.data ?? [])
      .filter((s) => (s.avg_eps ?? 0) > 0)
      .sort((a, b) => Number(b.avg_eps ?? 0) - Number(a.avg_eps ?? 0))
      .slice(0, 10);
    const totalEps = filtered.reduce((acc, s) => acc + Number(s.avg_eps ?? 0), 0);
    return filtered.map((s) => ({
      name: s.name.replace(/@\s*.+$/, "").trim(),
      eps: Number(s.avg_eps ?? 0),
      pct: totalEps > 0 ? Math.round((Number(s.avg_eps ?? 0) / totalEps) * 100) : 0,
    }));
  })();

  const aggOffense = (key: "source_ip" | "destination_ip") => {
    const m = new Map<string, number>();
    for (const o of offenses.data ?? []) {
      const k = (o as unknown as Record<string, string | null>)[key] ?? null;
      if (!k) continue;
      m.set(k, (m.get(k) ?? 0) + (o.event_count ?? 1));
    }
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([ip, v]) => ({ ip, v }));
  };

  const topSources = aggOffense("source_ip");
  const topDests = aggOffense("destination_ip");

  const internalSources = (() => {
    const m = new Map<string, number>();
    for (const o of offenses.data ?? []) {
      const src = o.source_ip;
      if (!src || src.toLowerCase() === "other") continue;
      m.set(src, (m.get(src) ?? 0) + 1);
    }
    return [...m.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([ip, v]) => ({ ip, v }));
  })();

  const totalEvents = (offenses.data ?? []).reduce((acc, o) => acc + (o.event_count ?? 0), 0);
  const openOffensesList = (offenses.data ?? [])
    .filter((o) => (o.status ?? "").toUpperCase() !== "CLOSED")
    .sort((a, b) => (b.severity ?? 0) - (a.severity ?? 0));
  const openOffenses = openOffensesList.length;

  const closeStatsByDesc = (() => {
    const byDesc = new Map<string, number[]>();
    for (const o of offenses.data ?? []) {
      if ((o.status ?? "").toUpperCase() !== "CLOSED") continue;
      if (!o.start_time || !o.closed_at) continue;
      const hours = (new Date(o.closed_at).getTime() - new Date(o.start_time).getTime()) / 3_600_000;
      if (hours < 0) continue;
      const key = o.description ?? "";
      const arr = byDesc.get(key) ?? [];
      arr.push(hours);
      byDesc.set(key, arr);
    }
    const stats = new Map<string, { medianHours: number; count: number }>();
    for (const [desc, hours] of byDesc) stats.set(desc, { medianHours: median(hours), count: hours.length });
    return stats;
  })();

  // Log Sources filtered
  const allSources = (logSources.data ?? []).filter(
    (s) => s.name.toLowerCase().includes("fgt") || s.name.toLowerCase().includes("wincollect"),
  );
  const activeSources = allSources.filter((s) => s.status === "success");
  const errorSources = allSources.filter((s) => s.status === "error");
  const disabledSources = allSources.filter((s) => s.status === "disabled");
  // Enquanto o cron estiver com problema, "success" não significa "confirmado
  // ativo agora" — é só o último status conhecido antes do cron parar de
  // atualizar essa tabela.
  const staleSources = logSourcesSyncUnhealthy ? activeSources : [];

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div className="soc-exec-root">
      <style dangerouslySetInnerHTML={{ __html: inlineStyles }} />

      {/* ── HEADER ──────────────────────────────────────────────────────────── */}
      <div className="exec-header">
        <div className="exec-header-brand">
          <div className="exec-header-shield">
            <Shield size={18} color={T.accent} />
          </div>
          <div>
            <div className="exec-header-title">Centro de Operações de Segurança</div>
            <div className="exec-header-sub">IBM QRadar SIEM · Painel Executivo</div>
          </div>
          <div style={{ marginLeft: 16, display: "flex", alignItems: "center", gap: 6 }}>
            <div className="live-dot" />
            <span
              style={{
                fontSize: 10,
                color: T.success,
                fontFamily: "'IBM Plex Mono', monospace",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Live
            </span>
          </div>
        </div>
        <div className="exec-header-meta">
          <div className="exec-header-sync-info">
            <div style={{ color: T.textSecondary, marginBottom: 2 }}>Última sincronização</div>
            <div style={{ color: state.data?.last_error ? T.warning : T.success }}>
              {fmtDate(state.data?.last_full_sync_at ?? null)}
            </div>
            <div style={{ marginTop: 4 }}>
              <CronHealthBadge jobName="qradar-sync" moduleSlug="soc" />
            </div>
          </div>
          <button className="exec-sync-btn" onClick={handleSync} disabled={syncDisabled}>
            <RefreshCw size={13} className={syncDisabled ? "spin" : ""} />
            {syncDisabled ? "Sincronizando…" : "Sincronizar"}
          </button>
        </div>
      </div>

      {/* Error banner */}
      {state.data?.last_error && (
        <div style={{ padding: "0 28px", marginTop: 12 }}>
          <div className="exec-error-bar">
            <AlertTriangle size={13} />
            Último erro de sincronização: {state.data.last_error}
          </div>
        </div>
      )}

      <div style={{ padding: "24px 28px", display: "flex", flexDirection: "column", gap: 28 }}>
        {/* ── SECTION: KPIs ─────────────────────────────────────────────────── */}
        <div>
          <div className="exec-section-label">
            <Zap size={10} />
            Indicadores-Chave de Desempenho
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: 14 }}>
            <ExecKpiCard
              label="Total de Eventos"
              value={fmtNum(totalEvents)}
              sub="offenses registradas"
              accentColor={T.accent}
              icon={Activity}
            />
            <ExecKpiCard
              label="EPS Atual"
              value={fmtNum(currentEps)}
              sub={`${usagePct}% da licença`}
              accentColor={usagePct >= 90 ? T.danger : usagePct >= 70 ? T.warning : T.accent}
              icon={TrendingUp}
              trend={currentEps > LICENSED_EPS ? "up" : "neutral"}
            />
            <ExecKpiCard
              label="EPS Excedente"
              value={`${excedentePct}%`}
              sub={currentEps > LICENSED_EPS ? "acima da licença" : "dentro do limite"}
              accentColor={currentEps > LICENSED_EPS ? T.danger : T.success}
              icon={currentEps > LICENSED_EPS ? TrendingUp : TrendingDown}
              footer={
                <span
                  className="exec-kpi-sub"
                  style={{ color: (drops.data?.length ?? 0) > 0 ? T.warning : T.success, marginTop: 2 }}
                >
                  Descarte de logs: {drops.data?.length ?? 0}
                </span>
              }
            />
            <div
              className="exec-kpi-wrap"
              onMouseEnter={() => setShowEpsPeakTip(true)}
              onMouseLeave={() => setShowEpsPeakTip(false)}
            >
              <ExecKpiCard
                label="EPS Pico (7 dias)"
                value={fmtNum(maxPeak7d)}
                sub="maior pico do período"
                accentColor={
                  maxPeak7d >= LICENSED_EPS ? T.danger : maxPeak7d >= LICENSED_EPS * 0.7 ? T.warning : T.accent
                }
                icon={Zap}
              />
              {showEpsPeakTip && dailyPeaksLast7.length > 0 && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    left: 0,
                    right: 0,
                    zIndex: 60,
                    background: T.surface,
                    border: `1px solid ${T.borderHi}`,
                    borderRadius: 8,
                    padding: "10px 12px",
                    boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      color: T.textMuted,
                      fontFamily: "'IBM Plex Mono', monospace",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      marginBottom: 8,
                    }}
                  >
                    Pico Diário — Últimos {dailyPeaksLast7.length} Dias
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                    {dailyPeaksLast7.map((d) => (
                      <div
                        key={d.day}
                        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}
                      >
                        <span
                          style={{
                            fontSize: 12,
                            color: T.textSecondary,
                            fontFamily: "'IBM Plex Mono', monospace",
                          }}
                        >
                          {fmtDayShort(d.day)}
                        </span>
                        <span
                          style={{
                            fontSize: 12,
                            color: d.peak >= LICENSED_EPS ? T.danger : T.textPrimary,
                            fontWeight: 600,
                            fontFamily: "'IBM Plex Mono', monospace",
                          }}
                        >
                          {fmtNum(d.peak)} EPS
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div
              className="exec-kpi-wrap"
              onMouseEnter={() => setShowOffensesTip(true)}
              onMouseLeave={() => setShowOffensesTip(false)}
            >
              <ExecKpiCard
                label="Offenses Abertos"
                value={String(openOffenses)}
                sub="requerem atenção"
                accentColor={openOffenses > 0 ? T.warning : T.success}
                icon={Eye}
                trend={openOffenses > 0 ? "up" : "neutral"}
              />
              {showOffensesTip && openOffenses > 0 && (
                <div
                  style={{
                    position: "absolute",
                    top: "calc(100% + 8px)",
                    left: 0,
                    right: 0,
                    zIndex: 60,
                    background: T.surface,
                    border: `1px solid ${T.borderHi}`,
                    borderRadius: 8,
                    padding: "10px 12px",
                    boxShadow: "0 20px 40px rgba(0,0,0,0.6)",
                  }}
                >
                  <div
                    style={{
                      fontSize: 10,
                      color: T.textMuted,
                      fontFamily: "'IBM Plex Mono', monospace",
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      marginBottom: 8,
                    }}
                  >
                    Offenses Abertos ({openOffenses})
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {openOffensesList.slice(0, 8).map((o) => (
                      <div key={o.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <SevPill severity={o.severity} />
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            fontSize: 12,
                            color: T.textPrimary,
                            fontFamily: "'DM Sans', sans-serif",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                          title={o.description ?? undefined}
                        >
                          {o.description ?? "—"}
                        </span>
                      </div>
                    ))}
                    {openOffenses > 8 && (
                      <div
                        style={{
                          fontSize: 11,
                          color: T.textMuted,
                          fontFamily: "'IBM Plex Mono', monospace",
                          paddingTop: 2,
                        }}
                      >
                        +{openOffenses - 8} mais
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
            <ExecKpiCard
              label="Download Suspeito"
              value={fmtNum(new Set((o365Downloads.data ?? []).map((r) => r.username)).size)}
              sub="usuários M365"
              accentColor={(o365Downloads.data?.length ?? 0) > 0 ? T.warning : T.success}
              icon={Network}
            />
            <ExecKpiCard
              label="Deleção Suspeita"
              value={fmtNum(new Set((o365Deletions.data ?? []).map((r) => r.username)).size)}
              sub="usuários M365"
              accentColor={(o365Deletions.data?.length ?? 0) > 0 ? T.danger : T.success}
              icon={ShieldOff}
              trend={(o365Deletions.data?.length ?? 0) > 0 ? "up" : "neutral"}
            />
          </div>
        </div>

        {/* ── SECTION: EPS TREND ────────────────────────────────────────────── */}
        <div>
          <div className="exec-section-label">
            <Activity size={10} />
            Volume de Tráfego — EPS vs. Licença Contratada ({fmtNum(LICENSED_EPS)} EPS)
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            <ResizableChart
              title={`EPS Médio — Últimos 30 dias`}
              defaultSize="col-span-3"
              chartHeight={260}
              badge={
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: "'IBM Plex Mono', monospace",
                    background: usagePct >= 90 ? T.dangerBg : T.accentSoft,
                    color: usagePct >= 90 ? T.danger : T.accent,
                    padding: "2px 7px",
                    borderRadius: 3,
                    border: `1px solid ${usagePct >= 90 ? "rgba(239,68,68,0.2)" : "rgba(59,130,246,0.2)"}`,
                  }}
                >
                  {usagePct}% utilizado
                </span>
              }
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={epsSeries} margin={{ top: 10, right: 20, bottom: 0, left: 0 }}>
                  <defs>
                    <linearGradient id="epsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={T.accent} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={T.accent} stopOpacity={0.02} />
                    </linearGradient>
                    <linearGradient id="epsPeakGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={T.danger} stopOpacity={0.3} />
                      <stop offset="100%" stopColor={T.danger} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke={T.chartGrid} vertical={false} />
                  <XAxis
                    dataKey="t"
                    stroke={T.chartAxis}
                    fontSize={10}
                    tick={{ fill: T.chartTick, fontFamily: "'IBM Plex Mono', monospace" }}
                    tickLine={false}
                    axisLine={{ stroke: T.border }}
                    interval="preserveStartEnd"
                  />
                  <YAxis
                    stroke={T.chartAxis}
                    fontSize={10}
                    tick={{ fill: T.chartTick, fontFamily: "'IBM Plex Mono', monospace" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => fmtNum(v)}
                  />
                  <Tooltip content={<ExecTooltip />} />
                  <ReferenceLine
                    y={LICENSED_EPS}
                    stroke={T.danger}
                    strokeDasharray="5 3"
                    strokeWidth={1.5}
                    label={{
                      value: `Limite ${fmtNum(LICENSED_EPS)}`,
                      fill: T.danger,
                      fontSize: 10,
                      fontFamily: "'IBM Plex Mono', monospace",
                      position: "insideTopRight",
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="peak"
                    name="Pico médio"
                    stroke={T.danger}
                    strokeWidth={1.5}
                    fill="url(#epsPeakGrad)"
                    dot={false}
                    activeDot={{ r: 4, fill: T.danger, stroke: T.surface, strokeWidth: 2 }}
                  />
                  <Area
                    type="monotone"
                    dataKey="eps"
                    name="EPS médio"
                    stroke={T.accent}
                    strokeWidth={2}
                    fill="url(#epsGrad)"
                    dot={false}
                    activeDot={{ r: 4, fill: T.accent, stroke: T.surface, strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </ResizableChart>
          </div>
        </div>

        {/* ── SECTION: LOG SOURCES + EPS por Fonte ─────────────────────────── */}
        <div>
          <div className="exec-section-label">
            <Lock size={10} />
            Fontes de Log e Consumo de EPS
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Log Sources Table */}
            <div className="exec-panel">
              <div className="exec-panel-header">
                <div className="exec-panel-title">
                  <Network size={14} color={T.accent} />
                  Fontes de Log — FGT / WinCollect
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  {logSourcesSyncUnhealthy ? (
                    <ExecBadge tone="warning">{staleSources.length} Desatualizadas</ExecBadge>
                  ) : (
                    <ExecBadge tone="success">{activeSources.length} Ativas</ExecBadge>
                  )}
                  {errorSources.length > 0 && <ExecBadge tone="danger">{errorSources.length} Erro</ExecBadge>}
                  {disabledSources.length > 0 && <ExecBadge tone="neutral">{disabledSources.length} Desab.</ExecBadge>}
                </div>
              </div>
              <div className="exec-panel-body" style={{ padding: 0 }}>
                {allSources.length === 0 ? (
                  <EmptyState message="Nenhuma fonte encontrada." />
                ) : (
                  <div className="exec-scroll" style={{ maxHeight: 340, overflowY: "auto" }}>
                    <table className="exec-table">
                      <thead>
                        <tr>
                          <th
                            onClick={() => setSortBy((s) => (s === "name-asc" ? "name-desc" : "name-asc"))}
                            style={{ paddingLeft: 20 }}
                          >
                            Fonte {sortBy.startsWith("name") ? (sortBy === "name-asc" ? "↑" : "↓") : ""}
                          </th>
                          <th onClick={() => setSortBy((s) => (s === "status-asc" ? "status-desc" : "status-asc"))}>
                            Status {sortBy.startsWith("status") ? (sortBy === "status-asc" ? "↑" : "↓") : ""}
                          </th>
                          <th>Status há</th>
                        </tr>
                      </thead>
                      <tbody>
                        {(() => {
                          const order = { error: 0, success: 1, disabled: 2 };
                          return [...allSources]
                            .sort((a, b) => {
                              if (sortBy === "name-asc") return a.name.localeCompare(b.name);
                              if (sortBy === "name-desc") return b.name.localeCompare(a.name);
                              if (sortBy === "status-asc")
                                return (
                                  (order[a.status as keyof typeof order] ?? 3) -
                                  (order[b.status as keyof typeof order] ?? 3)
                                );
                              if (sortBy === "status-desc")
                                return (
                                  (order[b.status as keyof typeof order] ?? 3) -
                                  (order[a.status as keyof typeof order] ?? 3)
                                );
                              return (
                                (order[a.status as keyof typeof order] ?? 3) -
                                (order[b.status as keyof typeof order] ?? 3)
                              );
                            })
                            .map((s) => {
                              const isStale = s.status === "success" && logSourcesSyncUnhealthy;
                              const displayStatus = isStale ? "stale" : s.status;
                              const tone =
                                displayStatus === "error"
                                  ? "danger"
                                  : displayStatus === "success"
                                    ? "success"
                                    : displayStatus === "stale"
                                      ? "warning"
                                      : "neutral";
                              const label =
                                displayStatus === "error"
                                  ? "Erro"
                                  : displayStatus === "success"
                                    ? "Ativo"
                                    : displayStatus === "stale"
                                      ? "Desatualizado"
                                      : "Desabilitado";
                              return (
                                <tr key={s.id}>
                                  <td style={{ paddingLeft: 20 }}>
                                    <div className="status-row">
                                      <div className={`status-indicator ${displayStatus}`} />
                                      <span
                                        style={{
                                          color: s.status === "disabled" ? T.textMuted : T.textPrimary,
                                          fontSize: 12,
                                        }}
                                      >
                                        {s.name}
                                      </span>
                                    </div>
                                  </td>
                                  <td>
                                    <ExecBadge tone={tone as any}>{label}</ExecBadge>
                                  </td>
                                  <td
                                    className="mono"
                                    style={{ color: T.textMuted, fontSize: 11 }}
                                    title={s.status_changed_at ? `desde ${fmtDate(s.status_changed_at)}` : undefined}
                                  >
                                    {fmtDuration(s.status_changed_at)}
                                  </td>
                                </tr>
                              );
                            });
                        })()}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* EPS por Fonte — Bar chart */}
            <ResizableChart title="Consumo de EPS por Fonte (Top 10)" defaultSize="col-span-1" chartHeight={320}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={sourcesByEps} layout="vertical" margin={{ top: 4, right: 52, bottom: 4, left: 4 }}>
                  <defs>
                    <linearGradient id="epsBarGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={T.accent} stopOpacity={0.5} />
                      <stop offset="100%" stopColor={T.accent} stopOpacity={1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke={T.chartGrid} horizontal={false} />
                  <XAxis
                    type="number"
                    domain={[0, "dataMax"]}
                    tickFormatter={(v) => `${v}%`}
                    stroke={T.chartAxis}
                    fontSize={10}
                    tick={{ fill: T.chartTick, fontFamily: "'IBM Plex Mono', monospace" }}
                    tickLine={false}
                    axisLine={{ stroke: T.border }}
                  />
                  <YAxis
                    type="category"
                    dataKey="name"
                    stroke={T.chartAxis}
                    fontSize={10}
                    width={150}
                    tick={{ fill: T.textSecondary, fontFamily: "'DM Sans', sans-serif" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    content={
                      <ExecTooltip
                        formatter={(v: any, _: any, item: any) => `${v}% · ${fmtNum(item?.payload?.eps)} EPS`}
                      />
                    }
                  />
                  <Bar dataKey="pct" name="Consumo" fill="url(#epsBarGrad)" radius={[0, 3, 3, 0]}>
                    <LabelList
                      dataKey="pct"
                      position="right"
                      formatter={(v: number) => `${v}%`}
                      style={{ fill: T.chartTick, fontSize: 10, fontFamily: "'IBM Plex Mono', monospace" }}
                    />
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ResizableChart>
          </div>
        </div>

        {/* ── SECTION: FORTIGATE POLICY CHANGE ──────────────────────────────── */}
        <div>
          <div className="exec-section-label">
            <Lock size={10} />
            Mudanças de Policy — Fortigate
          </div>
          <div className="exec-panel">
            <div className="exec-panel-header">
              <div className="exec-panel-title">
                <Lock size={14} color={T.accent} />
                Detalhamento - Fortigate
                <span style={{ color: T.textMuted, fontWeight: 400, fontSize: 11 }}>Últimas 24h</span>
              </div>
              <ExecBadge tone={(fortigatePolicyChanges.data?.length ?? 0) > 0 ? "warning" : "success"}>
                {fortigatePolicyChanges.data?.length ?? 0} eventos
              </ExecBadge>
            </div>
            <div className="exec-panel-body" style={{ padding: 0 }}>
              {(fortigatePolicyChanges.data?.length ?? 0) === 0 ? (
                <EmptyState message="Nenhum evento de policy/admin/config detectado nas últimas 24h." />
              ) : (
                <div className="exec-scroll" style={{ maxHeight: 340, overflowY: "auto" }}>
                  <table className="exec-table">
                    <thead>
                      <tr>
                        <th style={{ paddingLeft: 20, width: 16 }}></th>
                        <th>Quando</th>
                        <th>Tipo</th>
                        <th>Usuário Admin</th>
                        <th>IP Origem</th>
                        <th>IP Destino</th>
                        <th>Ação</th>
                        <th>Mensagem</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(fortigatePolicyChanges.data ?? []).map((e) => {
                        const typeBadge = fortigateTypeBadge(e.query_type);
                        const afterHours = isOutsideBusinessHours(e.event_time);
                        const expanded = expandedFortigateIds.has(e.id);
                        const detail = fortigateRawDetail(e.raw);
                        return (
                          <React.Fragment key={e.id}>
                            <tr style={{ cursor: "pointer" }} onClick={() => toggleFortigateExpand(e.id)}>
                              <td style={{ paddingLeft: 20 }}>
                                {expanded ? (
                                  <ChevronUp size={13} color={T.textMuted} />
                                ) : (
                                  <ChevronDown size={13} color={T.textMuted} />
                                )}
                              </td>
                              <td className="mono" style={{ color: T.textMuted, fontSize: 11 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  {fmtDate(e.event_time)}
                                  {afterHours && (
                                    <span title="Fora do horário comercial (08:00–19:00)">
                                      <ExecBadge tone="danger">Fora do horário</ExecBadge>
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <ExecBadge tone={typeBadge.tone}>{typeBadge.label}</ExecBadge>
                                  {e.event_category === "any_any_accept" && (
                                    <span title="Policy any/any com ação accept, habilitada a partir de disabled">
                                      <ExecBadge tone="danger">Risco Alto</ExecBadge>
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td style={{ fontWeight: 500 }}>{e.username ?? "—"}</td>
                              <td className="mono">{e.source_ip ?? "—"}</td>
                              <td className="mono">{e.destination_ip ?? "—"}</td>
                              <td>{e.action ?? e.event_name ?? "—"}</td>
                              <td
                                style={{
                                  color: T.textMuted,
                                  fontSize: 11,
                                  maxWidth: 220,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                                title={e.message ?? undefined}
                              >
                                {e.message ?? "—"}
                              </td>
                            </tr>
                            {expanded && (
                              <tr>
                                <td colSpan={8} style={{ padding: 0 }}>
                                  <div
                                    style={{
                                      display: "grid",
                                      gridTemplateColumns: "repeat(4, 1fr)",
                                      gap: 12,
                                      padding: "14px 24px",
                                      background: T.surfaceAlt,
                                      borderBottom: "1px solid rgba(30,38,64,0.5)",
                                    }}
                                  >
                                    <DetailField label="QID" value={e.qid ?? "—"} />
                                    <DetailField label="Regra QRadar" value={e.qid_name ?? "—"} />
                                    <DetailField label="Fonte de Log" value={e.log_source_name ?? "—"} />
                                    <DetailField
                                      label="ID da Policy"
                                      value={extractFortigatePolicyId(e.message) ?? "—"}
                                    />
                                    <div style={{ gridColumn: "span 4", minWidth: 0 }}>
                                      <div
                                        style={{
                                          fontSize: 9,
                                          color: T.textMuted,
                                          fontFamily: "'IBM Plex Mono', monospace",
                                          textTransform: "uppercase",
                                          letterSpacing: "0.08em",
                                          marginBottom: 6,
                                        }}
                                      >
                                        Detalhe da Mudança
                                      </div>
                                      {(() => {
                                        const changes = parseFortigateCfgAttr(detail.cfgattr);
                                        if (!changes) {
                                          return (
                                            <span style={{ fontSize: 12, color: T.textMuted }}>
                                              {detail.cfgattr ?? "Não disponível para este tipo de evento"}
                                            </span>
                                          );
                                        }
                                        return (
                                          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
                                            {changes.map((c, i) => (
                                              <div
                                                key={i}
                                                style={{
                                                  fontSize: 12,
                                                  fontFamily: "'DM Sans', sans-serif",
                                                  display: "flex",
                                                  flexDirection: "column",
                                                  gap: 2,
                                                }}
                                              >
                                                <span style={{ color: T.textSecondary, fontWeight: 600 }}>
                                                  {c.label}
                                                </span>
                                                {c.unchanged ? (
                                                  <span style={{ color: T.textMuted, paddingLeft: 10 }}>
                                                    sem alteração
                                                  </span>
                                                ) : c.added.length > 0 || c.removed.length > 0 ? (
                                                  <>
                                                    {c.removed.map((w) => (
                                                      <span key={`r-${w}`} style={{ color: T.danger, paddingLeft: 10 }}>
                                                        Removido: {w}
                                                      </span>
                                                    ))}
                                                    {c.added.map((w) => (
                                                      <span
                                                        key={`a-${w}`}
                                                        style={{ color: T.success, paddingLeft: 10 }}
                                                      >
                                                        Adicionado: {w}
                                                      </span>
                                                    ))}
                                                  </>
                                                ) : c.before ? (
                                                  <span style={{ color: T.textPrimary, paddingLeft: 10 }}>
                                                    Antes: {c.before} · Depois: {c.after}
                                                  </span>
                                                ) : (
                                                  <span style={{ color: T.textPrimary, paddingLeft: 10 }}>
                                                    Definido: {c.after}
                                                  </span>
                                                )}
                                              </div>
                                            ))}
                                          </div>
                                        );
                                      })()}
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

        {/* ── SECTION: THREAT CHARTS ─────────────────────────────────────────── */}
        <div>
          <div className="exec-section-label">
            <AlertTriangle size={10} />
            Mapa de Ameaças — Ofensores e Origens
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 16 }}>
            {/* Maiores Ofensores Externos */}
            <ResizableChart
              title="Maiores Ofensores Externos"
              chartHeight={300}
              badge={<ExecBadge tone="danger">{(externalOffenders.data ?? []).length} IPs</ExecBadge>}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={externalOffenders.data ?? []}
                  layout="vertical"
                  margin={{ top: 4, right: 16, bottom: 4, left: 4 }}
                >
                  <defs>
                    <linearGradient id="extGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={T.danger} stopOpacity={0.45} />
                      <stop offset="100%" stopColor={T.danger} stopOpacity={1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke={T.chartGrid} horizontal={false} />
                  <XAxis
                    type="number"
                    stroke={T.chartAxis}
                    fontSize={10}
                    tick={{ fill: T.chartTick, fontFamily: "'IBM Plex Mono', monospace" }}
                    tickLine={false}
                    axisLine={{ stroke: T.border }}
                    tickFormatter={(v) => fmtNum(v)}
                  />
                  <YAxis
                    className="ip-axis"
                    type="category"
                    dataKey="ip"
                    stroke={T.chartAxis}
                    fontSize={10}
                    width={108}
                    tick={{ fill: T.textPrimary, fontFamily: "'IBM Plex Mono', monospace" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<ExecTooltip formatter={(v: any) => `${fmtNum(v)} eventos`} />} />
                  <Bar dataKey="v" name="Eventos" fill="url(#extGrad)" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ResizableChart>

            {/* Origens Internas — mais eventos */}
            <ResizableChart
              title="Origens Internas — Mais Eventos"
              chartHeight={300}
              badge={<ExecBadge tone="warning">{(topSourceEvents.data ?? []).length} IPs</ExecBadge>}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={topSourceEvents.data ?? []}
                  layout="vertical"
                  margin={{ top: 4, right: 16, bottom: 4, left: 4 }}
                >
                  <defs>
                    <linearGradient id="intEvGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={T.warning} stopOpacity={0.45} />
                      <stop offset="100%" stopColor={T.warning} stopOpacity={1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke={T.chartGrid} horizontal={false} />
                  <XAxis
                    type="number"
                    stroke={T.chartAxis}
                    fontSize={10}
                    tick={{ fill: T.chartTick, fontFamily: "'IBM Plex Mono', monospace" }}
                    tickLine={false}
                    axisLine={{ stroke: T.border }}
                    tickFormatter={(v) => fmtNum(v)}
                  />
                  <YAxis
                    className="ip-axis"
                    type="category"
                    dataKey="ip"
                    stroke={T.chartAxis}
                    fontSize={10}
                    width={108}
                    tick={{ fill: T.textPrimary, fontFamily: "'IBM Plex Mono', monospace" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<ExecTooltip formatter={(v: any) => `${fmtNum(v)} eventos`} />} />
                  <Bar dataKey="v" name="Eventos" fill="url(#intEvGrad)" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ResizableChart>

            {/* Origens Internas — mais ofensores */}
            <ResizableChart
              title="Origens Internas — Mais Ofensores"
              chartHeight={300}
              badge={<ExecBadge tone="accent">{internalSources.length} IPs</ExecBadge>}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={internalSources} layout="vertical" margin={{ top: 4, right: 16, bottom: 4, left: 4 }}>
                  <defs>
                    <linearGradient id="intOffGrad" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor={T.accent} stopOpacity={0.45} />
                      <stop offset="100%" stopColor={T.accent} stopOpacity={1} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="2 4" stroke={T.chartGrid} horizontal={false} />
                  <XAxis
                    type="number"
                    stroke={T.chartAxis}
                    fontSize={10}
                    tick={{ fill: T.chartTick, fontFamily: "'IBM Plex Mono', monospace" }}
                    tickLine={false}
                    axisLine={{ stroke: T.border }}
                    tickFormatter={(v) => fmtNum(v)}
                  />
                  <YAxis
                    className="ip-axis"
                    type="category"
                    dataKey="ip"
                    stroke={T.chartAxis}
                    fontSize={10}
                    width={108}
                    tick={{ fill: T.textPrimary, fontFamily: "'IBM Plex Mono', monospace" }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip content={<ExecTooltip formatter={(v: any) => `${fmtNum(v)} ofensores`} />} />
                  <Bar dataKey="v" name="Ofensores" fill="url(#intOffGrad)" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ResizableChart>
          </div>
        </div>

        {/* ── SECTION: RDP ─────────────────────────────────────────────────── */}
        <div>
          <div className="exec-section-label">
            <Eye size={10} />
            Monitoramento de Acesso Remoto
          </div>
          <div className="exec-panel">
            <div className="exec-panel-header">
              <div className="exec-panel-title">
                <Network size={14} color={T.warning} />
                Conexões RDP Suspeitas
                <span
                  style={{
                    color: T.textMuted,
                    fontSize: 11,
                    fontFamily: "'IBM Plex Mono', monospace",
                    fontWeight: 400,
                  }}
                >
                  Logon Type 10 · Event 4624 · Usuário "infra"
                </span>
              </div>
              <ExecBadge tone={(rdp.data?.length ?? 0) > 0 ? "warning" : "success"}>
                {rdp.data?.length ?? 0} eventos · 24h
              </ExecBadge>
            </div>
            <div className="exec-panel-body" style={{ padding: 0 }}>
              {(rdp.data?.length ?? 0) === 0 ? (
                <EmptyState message="Nenhum evento correspondente nas últimas 24h." />
              ) : (
                <div className="exec-scroll" style={{ maxHeight: 360, overflowY: "auto" }}>
                  <table className="exec-table">
                    <thead>
                      <tr>
                        <th style={{ paddingLeft: 24 }}>Quando</th>
                        <th>Usuário</th>
                        <th>IP Origem</th>
                        <th>IP Destino</th>
                        <th>Fonte de Log</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(rdp.data ?? []).map((e) => (
                        <tr key={e.id}>
                          <td className="mono" style={{ paddingLeft: 24, color: T.textMuted }}>
                            {fmtDate(e.event_time)}
                          </td>
                          <td style={{ fontWeight: 500 }}>{e.username ?? "—"}</td>
                          <td className="mono">{e.source_ip ?? "—"}</td>
                          <td className="mono">{e.destination_ip ?? "—"}</td>
                          <td style={{ color: T.textMuted, fontSize: 11 }}>{e.log_source ?? "—"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── SECTION: O365 DELETIONS ───────────────────────────────────────── */}
        <div>
          <div className="exec-section-label">
            <ShieldOff size={10} />
            Anomalias Microsoft 365
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
            {/* Deleções */}
            <div className="exec-panel">
              <div className="exec-panel-header">
                <div className="exec-panel-title">
                  <AlertTriangle size={14} color={T.danger} />
                  Alto Volume de Deleção
                  <span style={{ color: T.textMuted, fontWeight: 400, fontSize: 11 }}>≥ 50 deleções/min</span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {(o365Deletions.data?.length ?? 0) > 0 && (
                    <span style={{ fontSize: 11, color: T.textMuted, fontFamily: "'IBM Plex Mono', monospace" }}>
                      {(o365Deletions.data ?? []).reduce((a, r) => a + r.event_count, 0).toLocaleString("pt-BR")}{" "}
                      deleções
                    </span>
                  )}
                  <ExecBadge tone={(o365Deletions.data?.length ?? 0) > 0 ? "danger" : "success"}>
                    {(o365Deletions.data?.length ?? 0) > 0 ? "Detectado" : "Normal"}
                  </ExecBadge>
                </div>
              </div>
              <div className="exec-panel-body" style={{ padding: 0 }}>
                {(o365Deletions.data?.length ?? 0) === 0 ? (
                  <EmptyState message="Nenhuma deleção suspeita nas últimas 24h." />
                ) : (
                  <div className="exec-scroll" style={{ maxHeight: 280, overflowY: "auto" }}>
                    <table className="exec-table">
                      <thead>
                        <tr>
                          <th
                            style={{ paddingLeft: 20 }}
                            onClick={() => {
                              setDelSortBy("event_time");
                              setDelSortDir((d) => (d === "asc" ? "desc" : "asc"));
                            }}
                          >
                            Hora {delSortBy === "event_time" ? (delSortDir === "asc" ? "↑" : "↓") : ""}
                          </th>
                          <th
                            onClick={() => {
                              setDelSortBy("username");
                              setDelSortDir((d) => (d === "asc" ? "desc" : "asc"));
                            }}
                          >
                            Usuário {delSortBy === "username" ? (delSortDir === "asc" ? "↑" : "↓") : ""}
                          </th>
                          <th>IP Origem</th>
                          <th
                            style={{ textAlign: "right", paddingRight: 20 }}
                            onClick={() => {
                              setDelSortBy("event_count");
                              setDelSortDir((d) => (d === "asc" ? "desc" : "asc"));
                            }}
                          >
                            Deleções {delSortBy === "event_count" ? (delSortDir === "asc" ? "↑" : "↓") : ""}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...(o365Deletions.data ?? [])]
                          .sort((a, b) => {
                            const dir = delSortDir === "asc" ? 1 : -1;
                            if (delSortBy === "event_count") return (a.event_count - b.event_count) * dir;
                            if (delSortBy === "username") return a.username.localeCompare(b.username) * dir;
                            if (delSortBy === "event_time")
                              return ((a.event_time ?? "") > (b.event_time ?? "") ? 1 : -1) * dir;
                            return 0;
                          })
                          .map((r, i) => (
                            <tr key={i}>
                              <td className="mono" style={{ paddingLeft: 20, color: T.textMuted }}>
                                {r.event_time ? new Date(r.event_time).toLocaleString("pt-BR") : "—"}
                              </td>
                              <td style={{ fontWeight: 500 }}>{r.username || "—"}</td>
                              <td className="mono">{r.source_ip || "—"}</td>
                              <td style={{ textAlign: "right", paddingRight: 20 }}>
                                <span
                                  style={{
                                    background: T.dangerBg,
                                    color: T.danger,
                                    padding: "2px 8px",
                                    borderRadius: 3,
                                    fontFamily: "'IBM Plex Mono', monospace",
                                    fontSize: 11,
                                    fontWeight: 600,
                                    border: "1px solid rgba(239,68,68,0.2)",
                                  }}
                                >
                                  {r.event_count.toLocaleString("pt-BR")}
                                </span>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>

            {/* Downloads */}
            <div className="exec-panel">
              <div className="exec-panel-header">
                <div className="exec-panel-title">
                  <AlertTriangle size={14} color={T.warning} />
                  Alto Volume de Download
                  <span style={{ color: T.textMuted, fontWeight: 400, fontSize: 11 }}>≥ 50 eventos/min</span>
                </div>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  {(o365Downloads.data?.length ?? 0) > 0 && (
                    <span style={{ fontSize: 11, color: T.textMuted, fontFamily: "'IBM Plex Mono', monospace" }}>
                      {(o365Downloads.data ?? []).reduce((a, r) => a + r.event_count, 0).toLocaleString("pt-BR")}{" "}
                      eventos
                    </span>
                  )}
                  <ExecBadge tone={(o365Downloads.data?.length ?? 0) > 0 ? "warning" : "success"}>
                    {(o365Downloads.data?.length ?? 0) > 0 ? "Detectado" : "Normal"}
                  </ExecBadge>
                </div>
              </div>
              <div className="exec-panel-body" style={{ padding: 0 }}>
                {(o365Downloads.data?.length ?? 0) === 0 ? (
                  <EmptyState message="Nenhum download suspeito nas últimas 24h." />
                ) : (
                  <div className="exec-scroll" style={{ maxHeight: 280, overflowY: "auto" }}>
                    <table className="exec-table">
                      <thead>
                        <tr>
                          <th
                            style={{ paddingLeft: 20 }}
                            onClick={() => {
                              setDlSortBy("event_time");
                              setDlSortDir((d) => (d === "asc" ? "desc" : "asc"));
                            }}
                          >
                            Hora {dlSortBy === "event_time" ? (dlSortDir === "asc" ? "↑" : "↓") : ""}
                          </th>
                          <th
                            onClick={() => {
                              setDlSortBy("username");
                              setDlSortDir((d) => (d === "asc" ? "desc" : "asc"));
                            }}
                          >
                            Usuário {dlSortBy === "username" ? (dlSortDir === "asc" ? "↑" : "↓") : ""}
                          </th>
                          <th>IP Origem</th>
                          <th
                            style={{ textAlign: "right", paddingRight: 20 }}
                            onClick={() => {
                              setDlSortBy("event_count");
                              setDlSortDir((d) => (d === "asc" ? "desc" : "asc"));
                            }}
                          >
                            Eventos {dlSortBy === "event_count" ? (dlSortDir === "asc" ? "↑" : "↓") : ""}
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {[...(o365Downloads.data ?? [])]
                          .sort((a, b) => {
                            const dir = dlSortDir === "asc" ? 1 : -1;
                            if (dlSortBy === "event_count") return (a.event_count - b.event_count) * dir;
                            if (dlSortBy === "username") return a.username.localeCompare(b.username) * dir;
                            if (dlSortBy === "event_time")
                              return ((a.event_time ?? "") > (b.event_time ?? "") ? 1 : -1) * dir;
                            return 0;
                          })
                          .map((r, i) => (
                            <tr key={i}>
                              <td className="mono" style={{ paddingLeft: 20, color: T.textMuted }}>
                                {r.event_time ? new Date(r.event_time).toLocaleString("pt-BR") : "—"}
                              </td>
                              <td style={{ fontWeight: 500 }}>{r.username || "—"}</td>
                              <td className="mono">{r.source_ip || "—"}</td>
                              <td style={{ textAlign: "right", paddingRight: 20 }}>
                                <span
                                  style={{
                                    background: T.warningBg,
                                    color: T.warning,
                                    padding: "2px 8px",
                                    borderRadius: 3,
                                    fontFamily: "'IBM Plex Mono', monospace",
                                    fontSize: 11,
                                    fontWeight: 600,
                                    border: "1px solid rgba(245,158,11,0.2)",
                                  }}
                                >
                                  {r.event_count.toLocaleString("pt-BR")}
                                </span>
                              </td>
                            </tr>
                          ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── SECTION: OFFENSES ABERTOS — DETALHAMENTO ─────────────────────── */}
        <div>
          <div className="exec-section-label">
            <Eye size={10} />
            Offenses Abertos — Detalhamento
          </div>
          <div className="exec-panel">
            <div className="exec-panel-header">
              <div className="exec-panel-title">
                <Eye size={14} color={T.warning} />
                Offenses em Aberto
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                {openOffenses > 0 && (
                  <span style={{ fontSize: 11, color: T.textMuted, fontFamily: "'IBM Plex Mono', monospace" }}>
                    {fmtNum(openOffensesList.reduce((a, o) => a + (o.event_count ?? 0), 0))} eventos
                  </span>
                )}
                <ExecBadge tone={openOffenses > 0 ? "warning" : "success"}>
                  {openOffenses} {openOffenses === 1 ? "offense" : "offenses"}
                </ExecBadge>
              </div>
            </div>
            <div className="exec-panel-body" style={{ padding: 0 }}>
              {openOffensesList.length === 0 ? (
                <EmptyState message="Nenhum offense aberto." />
              ) : (
                <div className="exec-scroll" style={{ maxHeight: 420, overflowY: "auto" }}>
                  <table className="exec-table">
                    <thead>
                      <tr>
                        <th style={{ paddingLeft: 20, width: 16 }}></th>
                        <th>Sev.</th>
                        <th>Descrição</th>
                        <th>Magnitude</th>
                        <th>Início</th>
                        <th>Origem</th>
                        <th>Rede Destino</th>
                        <th style={{ textAlign: "right" }}>Eventos</th>
                        <th>Status</th>
                        <th style={{ paddingRight: 20 }}>Diagnóstico</th>
                      </tr>
                    </thead>
                    <tbody>
                      {openOffensesList.map((o) => {
                        const expanded = expandedOffenseIds.has(o.id);
                        const detail = offenseRawDetail(o.raw);
                        const diag = diagnoseOpenOffense(o, closeStatsByDesc);
                        return (
                          <React.Fragment key={o.id}>
                            <tr style={{ cursor: "pointer" }} onClick={() => toggleOffenseExpand(o.id)}>
                              <td style={{ paddingLeft: 20 }}>
                                {expanded ? (
                                  <ChevronUp size={13} color={T.textMuted} />
                                ) : (
                                  <ChevronDown size={13} color={T.textMuted} />
                                )}
                              </td>
                              <td>
                                <SevPill severity={o.severity} />
                              </td>
                              <td
                                style={{
                                  maxWidth: 320,
                                  overflow: "hidden",
                                  textOverflow: "ellipsis",
                                  whiteSpace: "nowrap",
                                }}
                                title={o.description ?? undefined}
                              >
                                {o.description ?? "—"}
                              </td>
                              <td className="mono" style={{ color: T.textSecondary }}>
                                {o.magnitude ?? "—"}
                              </td>
                              <td className="mono" style={{ color: T.textMuted, fontSize: 11 }}>
                                {fmtDate(o.start_time)}
                              </td>
                              <td className="mono">{o.source_ip ?? "—"}</td>
                              <td className="mono">{o.destination_ip ?? "—"}</td>
                              <td style={{ textAlign: "right" }} className="mono">
                                {fmtNum(o.event_count ?? 0)}
                              </td>
                              <td>
                                <ExecBadge tone={(o.status ?? "").toUpperCase() === "OPEN" ? "warning" : "neutral"}>
                                  {o.status ?? "—"}
                                </ExecBadge>
                              </td>
                              <td
                                style={{ paddingRight: 20 }}
                                title="Estimativa por comparação com a mediana histórica da mesma regra — o QRadar não informa o motivo real do atraso."
                              >
                                <ExecBadge tone={diag.tone}>{diag.label}</ExecBadge>
                              </td>
                            </tr>
                            {expanded && (
                              <tr>
                                <td colSpan={10} style={{ padding: 0 }}>
                                  <div
                                    style={{
                                      display: "grid",
                                      gridTemplateColumns: "repeat(4, 1fr)",
                                      gap: 12,
                                      padding: "14px 24px",
                                      background: T.surfaceAlt,
                                      borderBottom: "1px solid rgba(30,38,64,0.5)",
                                    }}
                                  >
                                    <DetailField label="Atualizado" value={fmtDate(o.last_updated_time)} />
                                    <DetailField label="Credibilidade" value={detail.credibility ?? "—"} />
                                    <DetailField label="Relevância" value={detail.relevance ?? "—"} />
                                    <DetailField label="Atribuído a" value={detail.assignedTo ?? "Não atribuído"} />
                                    <DetailField label="Dispositivos" value={detail.deviceCount ?? "—"} />
                                    <DetailField label="Origens" value={detail.sourceCount ?? "—"} />
                                    <DetailField label="Flows" value={detail.flowCount ?? "—"} />
                                    <DetailField label="Acompanhamento" value={detail.followUp ? "Sim" : "Não"} />
                                    <DetailField
                                      label="Tempo Aberto"
                                      value={diag.elapsedHours != null ? fmtHours(diag.elapsedHours) : "—"}
                                    />
                                    <DetailField
                                      label="Mediana de Fechamento (regra)"
                                      value={diag.medianHours != null ? fmtHours(diag.medianHours) : "Sem histórico"}
                                    />
                                    <DetailField
                                      label="Categorias"
                                      span={4}
                                      value={detail.categories.length ? detail.categories.join(", ") : "—"}
                                    />
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

        <SekTicketsPanel />

        {/* Footer */}
        <div
          style={{
            borderTop: `1px solid ${T.border}`,
            paddingTop: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            fontSize: 11,
            color: T.textMuted,
            fontFamily: "'IBM Plex Mono', monospace",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <Shield size={12} color={T.textMuted} />
            <span>SOC · IBM QRadar SIEM · Sincronização automática diária 03:00</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <span style={{ color: state.data?.last_error ? T.warning : T.success }}>
              {state.data?.last_error ? "⚠ Erro na última sync" : "✓ Sistema operacional"}
            </span>
            <span>|</span>
            <span>Atualizado: {fmtDate(state.data?.last_full_sync_at ?? null)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
