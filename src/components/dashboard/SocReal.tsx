import { SyncActions } from "@/components/layout/SyncActions";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  ComposedChart,
  Area,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";
import { supabase } from "@/integrations/supabase/client";
import { SekTicketsPanel } from "./soc/SekTicketsPanel";
import { AlertTriangle, Shield } from "lucide-react";
import { DetailList, DetailSection, DetailSheet } from "@/components/layout/DetailSheet";
import { toast } from "sonner";
import { getCronHealth } from "./CronHealthBadge";

// ── Design Tokens — Executive Dark Intelligence Theme ──────────────────────────
const T = {
  // Core palette
  bg: "var(--tl-0a0d14, #0A0D14)",
  surface: "var(--tl-0f1420, #0F1420)",
  surfaceAlt: "var(--tl-131825, #131825)",
  border: "var(--tl-1e2640, #1E2640)",
  borderHi: "var(--tl-2a3560, #2A3560)",

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
  neutral: "var(--tl-6b7280, #6B7280)",

  // Text
  textPrimary: "var(--tl-f1f5f9, #F1F5F9)",
  textSecondary: "var(--tl-f1f5f9, #F1F5F9)",
  textMuted: "var(--tl-f1f5f9, #F1F5F9)",

  // Chart fills
  chartGrid: "rgba(var(--tl-line-rgb, 30,38,64),0.8)",
  chartAxis: "var(--tl-f1f5f9, #F1F5F9)",
  chartTick: "var(--tl-f1f5f9, #F1F5F9)",
};

const LICENSED_EPS = 2000;

// ── CSS (interface v2) ─────────────────────────────────────────────────────────
// As classes exec-* continuam existindo porque o painel de chamados da Sek
// (soc/SekTicketsPanel.tsx) depende delas; aqui elas ganham o visual v2.
const inlineStyles = `
  .soc-root { font-family:var(--font-ui); color:var(--v2-fg); display:flex; flex-direction:column; gap:20px; font-size:14px; }
  .soc-root * { box-sizing:border-box; }
  @keyframes soc-spin { to{transform:rotate(360deg)} }
  .spin { animation:soc-spin 0.8s linear infinite; }
  @media (prefers-reduced-motion: reduce) { .spin { animation:none; } }
  .soc-root ::-webkit-scrollbar { width:6px; height:6px; }
  .soc-root ::-webkit-scrollbar-track { background:transparent; }
  .soc-root ::-webkit-scrollbar-thumb { background:var(--v2-line-strong); border-radius:3px; }
  .soc-root :focus-visible { outline:2px solid var(--v2-accent); outline-offset:2px; }
  .soc-root .mono, .exec-table .mono { font-family:var(--font-data); font-size:12.5px; }
  .soc-root .dim { color:var(--v2-fg-3); }
  .soc-root .recharts-cartesian-axis-tick-value { fill:var(--v2-fg-3) !important; font-size:11px; font-family:var(--font-data); }
  .soc-root .recharts-reference-line text { fill:var(--v2-crit) !important; font-size:11px; font-family:var(--font-data); }

  /* ── Cabeçalho ── */
  .soc-ph { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  .soc-ph-title { font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.2; margin:0; }
  .soc-ph-sub { margin:4px 0 0; font-size:13px; color:var(--v2-fg-3); display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  .soc-live { display:inline-flex; align-items:center; gap:6px; }
  .soc-live::before { content:""; width:7px; height:7px; border-radius:50%; background:var(--v2-ok); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-ok) 25%, transparent); }
  .soc-live.warn::before { background:var(--v2-med); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-med) 25%, transparent); }
  .soc-actions { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  .soc-btn { display:inline-flex; align-items:center; gap:7px; height:34px; padding:0 14px; border-radius:8px; border:1px solid var(--v2-accent); background:var(--v2-accent); color:var(--v2-accent-ink); font-size:13px; font-weight:500; cursor:pointer; font-family:inherit; }
  .soc-btn:hover:not(:disabled) { filter:brightness(1.08); }
  .soc-btn:disabled { opacity:0.5; cursor:not-allowed; }
  .soc-error { display:flex; gap:8px; align-items:flex-start; padding:10px 14px; border-radius:8px; font-size:13px; background:color-mix(in oklch, var(--v2-med) 12%, transparent); border:1px solid color-mix(in oklch, var(--v2-med) 35%, transparent); }
  .soc-error svg { flex-shrink:0; margin-top:2px; color:var(--v2-med); }

  /* ── Submenu ── */
  .soc-subnav { display:flex; gap:2px; padding:4px; background:var(--v2-surface-2); border:1px solid var(--v2-line); border-radius:8px; width:fit-content; max-width:100%; flex-wrap:wrap; }
  .soc-subnav button { display:inline-flex; align-items:center; gap:8px; border:1px solid transparent; background:transparent; padding:6px 14px; border-radius:6px; font-size:13px; font-weight:500; color:var(--v2-fg-3); cursor:pointer; font-family:inherit; }
  .soc-subnav button:hover { color:var(--v2-fg); background:var(--v2-hover); }
  .soc-subnav button[aria-selected="true"] { background:var(--v2-surface); color:var(--v2-fg); border-color:var(--v2-line); }
  .soc-count { font:500 11px var(--font-data); padding:0 6px; border-radius:99px; background:color-mix(in oklch, var(--v2-crit) 18%, transparent); color:var(--v2-crit); }
  .soc-count.warn { background:color-mix(in oklch, var(--v2-med) 18%, transparent); color:var(--v2-med); }

  /* ── KPIs ── */
  .soc-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
  .soc-kpi { position:relative; text-align:left; border:0; background:transparent; padding:16px 18px 14px; display:grid; gap:2px; align-content:start; box-shadow:1px 0 0 var(--v2-line), 0 1px 0 var(--v2-line); color:inherit; font-family:inherit; min-width:0; }
  button.soc-kpi { cursor:pointer; }
  button.soc-kpi:hover { background:var(--v2-hover); }
  .soc-kpi-label { font-size:12.5px; color:var(--v2-fg-2); display:flex; align-items:center; gap:6px; }
  .soc-kpi-value { font-size:28px; font-weight:600; letter-spacing:-0.02em; line-height:1.25; font-variant-numeric:tabular-nums; }
  .soc-kpi-foot { font-size:12px; color:var(--v2-fg-3); }
  .soc-sw { width:8px; height:8px; border-radius:2px; display:inline-block; flex-shrink:0; }
  .soc-meter { height:6px; border-radius:99px; background:var(--v2-surface-2); overflow:hidden; margin:6px 0 2px; }
  .soc-meter i { display:block; height:100%; border-radius:99px; }

  /* ── Grades e cartões ── */
  .soc-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:20px; align-items:start; }
  .soc-grid-2 { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:20px; align-items:start; }
  .soc-span-2 { grid-column:span 2; }
  @media (max-width: 1100px) { .soc-grid, .soc-grid-2 { grid-template-columns:minmax(0, 1fr); } .soc-span-2 { grid-column:auto; } }
  .soc-card { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; min-width:0; overflow:hidden; }
  .soc-card-hdr { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap; padding:14px 18px 4px; }
  .soc-card-title { font-size:14px; font-weight:600; margin:0; }
  .soc-card-sub { margin:2px 0 0; font-size:12.5px; color:var(--v2-fg-3); }
  .soc-card-body { padding:10px 18px 16px; }
  .soc-legend { display:flex; gap:14px; flex-wrap:wrap; font-size:12px; color:var(--v2-fg-2); }
  .soc-legend span { display:inline-flex; align-items:center; gap:6px; }
  .soc-toolbar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:12px 18px; border-bottom:1px solid var(--v2-line); }
  .soc-toolbar b { font-size:14px; font-weight:600; }
  .soc-toolbar small { font-size:13px; color:var(--v2-fg-3); }
  .soc-foot { padding:10px 18px; border-top:1px solid var(--v2-line); font-size:12.5px; color:var(--v2-fg-3); }

  /* ── Triagem ── */
  .soc-feed { display:grid; }
  .soc-feed button { display:grid; grid-template-columns:auto minmax(0, 1fr); gap:2px 10px; padding:10px 8px; margin:0 -8px; border:0; border-radius:8px; background:transparent; text-align:left; color:var(--v2-fg); cursor:pointer; font-family:inherit; }
  .soc-feed button:hover { background:var(--v2-hover); }
  .soc-feed .k { grid-row:span 2; align-self:start; margin-top:1px; }
  .soc-feed b { font-weight:500; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .soc-feed small { font-size:12px; color:var(--v2-fg-3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

  /* ── Pílulas ── */
  .soc-tag { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; white-space:nowrap; --c:var(--v2-fg-3); background:color-mix(in oklch, var(--c) 14%, transparent); color:color-mix(in oklch, var(--c) 72%, var(--v2-fg)); }
  .soc-tag.crit { --c:var(--v2-crit); } .soc-tag.high { --c:var(--v2-high); } .soc-tag.med { --c:var(--v2-med); } .soc-tag.ok { --c:var(--v2-ok); } .soc-tag.info { --c:var(--v2-accent); }
  .sev-pill { display:inline-grid; place-items:center; min-width:26px; height:22px; padding:0 6px; border-radius:5px; font:600 12px var(--font-data); --c:var(--v2-low); background:color-mix(in oklch, var(--c) 16%, transparent); color:color-mix(in oklch, var(--c) 72%, var(--v2-fg)); }
  .sev-pill.sev-crit { --c:var(--v2-crit); } .sev-pill.sev-high { --c:var(--v2-high); } .sev-pill.sev-med { --c:var(--v2-med); }
  .soc-diag { display:inline-flex; align-items:center; gap:6px; font-size:12.5px; color:var(--v2-fg-2); white-space:nowrap; }
  .soc-diag.late { color:color-mix(in oklch, var(--v2-med) 75%, var(--v2-fg)); }
  .soc-flag { display:inline-flex; align-items:center; gap:4px; margin-left:6px; font-size:11.5px; color:color-mix(in oklch, var(--v2-med) 75%, var(--v2-fg)); }

  /* ── Barras horizontais ── */
  .soc-bars { display:grid; gap:10px; }
  .soc-bar { display:grid; grid-template-columns:minmax(0, 1fr) auto; gap:5px 10px; font-size:13px; }
  .soc-bar span:first-child { font:400 12.5px var(--font-data); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .soc-bar span:nth-child(2) { font:500 12.5px var(--font-data); color:var(--v2-fg-2); }
  .soc-track { grid-column:1 / -1; height:8px; border-radius:99px; background:var(--v2-surface-2); overflow:hidden; }
  .soc-track i { display:block; height:100%; border-radius:99px; background:var(--v2-accent); }

  /* ── Painel lateral ── */
  .soc-warnbox { display:flex; gap:8px; padding:9px 12px; border-radius:8px; font-size:12.5px; background:color-mix(in oklch, var(--v2-med) 12%, transparent); border:1px solid color-mix(in oklch, var(--v2-med) 35%, transparent); }
  .soc-warnbox svg { flex-shrink:0; margin-top:2px; color:var(--v2-med); }
  .soc-diff { display:grid; gap:10px; }
  .soc-diff-item { display:grid; gap:4px; font-size:13px; }
  .soc-diff-item b { font-weight:500; }
  .soc-diff .add { font:400 12.5px var(--font-data); padding:6px 10px; border-radius:6px; color:color-mix(in oklch, var(--v2-ok) 75%, var(--v2-fg)); background:color-mix(in oklch, var(--v2-ok) 10%, transparent); overflow-wrap:anywhere; }
  .soc-diff .rem { font:400 12.5px var(--font-data); padding:6px 10px; border-radius:6px; color:color-mix(in oklch, var(--v2-crit) 75%, var(--v2-fg)); background:color-mix(in oklch, var(--v2-crit) 10%, transparent); text-decoration:line-through; overflow-wrap:anywhere; }
  .soc-diff .same { font-size:12.5px; color:var(--v2-fg-3); }
  .soc-raw { font:400 12px/1.5 var(--font-data); padding:8px 10px; border-radius:8px; background:var(--v2-surface-2); border:1px solid var(--v2-line); color:var(--v2-fg-2); overflow-wrap:anywhere; }
  .soc-chips { display:flex; gap:6px; flex-wrap:wrap; }

  /* ── Classes exec-* (também usadas pelo painel da Sek) ── */
  .exec-section-label { font-size:14px; font-weight:600; color:var(--v2-fg); display:flex; align-items:center; gap:8px; margin-bottom:10px; }
  .exec-panel { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; min-width:0; }
  .exec-panel-header { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; padding:12px 18px; border-bottom:1px solid var(--v2-line); }
  .exec-panel-title { display:flex; align-items:center; gap:8px; font-size:14px; font-weight:600; color:var(--v2-fg); }
  .exec-panel-body { padding:12px 18px; }
  .exec-scroll { overflow:auto; }
  .exec-table { width:100%; border-collapse:collapse; font-size:13px; }
  .exec-table thead { position:sticky; top:0; z-index:1; }
  .exec-table th { padding:9px 12px; font-size:12px; font-weight:500; color:var(--v2-fg-3); text-align:left; background:var(--v2-surface); border-bottom:1px solid var(--v2-line); white-space:nowrap; cursor:default; user-select:none; }
  .exec-table th.r, .exec-table td.r { text-align:right; }
  .exec-table td { padding:8px 12px; height:44px; border-bottom:1px solid var(--v2-line); color:var(--v2-fg); vertical-align:middle; }
  .exec-table th:first-child, .exec-table td:first-child { padding-left:18px; }
  .exec-table th:last-child, .exec-table td:last-child { padding-right:18px; }
  .exec-table tbody tr:hover td { background:var(--v2-hover); }
  .exec-table tbody tr:last-child td { border-bottom:none; }
  .exec-table tbody tr.clickable { cursor:pointer; }
  .exec-table th.sortable { cursor:pointer; }
  .exec-table th.sortable:hover { color:var(--v2-fg); }
  .exec-badge { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; white-space:nowrap; background:var(--v2-surface-2); color:var(--v2-fg-2); }
  .exec-badge.success { background:color-mix(in oklch, var(--v2-ok) 14%, transparent); color:color-mix(in oklch, var(--v2-ok) 72%, var(--v2-fg)); }
  .exec-badge.warning { background:color-mix(in oklch, var(--v2-med) 14%, transparent); color:color-mix(in oklch, var(--v2-med) 72%, var(--v2-fg)); }
  .exec-badge.danger { background:color-mix(in oklch, var(--v2-crit) 14%, transparent); color:color-mix(in oklch, var(--v2-crit) 72%, var(--v2-fg)); }
  .exec-badge.accent { background:color-mix(in oklch, var(--v2-accent) 14%, transparent); color:color-mix(in oklch, var(--v2-accent) 72%, var(--v2-fg)); }
  .exec-badge-dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
  .exec-empty { display:flex; flex-direction:column; align-items:center; gap:8px; padding:32px 16px; color:var(--v2-fg-3); font-size:13px; text-align:center; }
  .exec-empty-icon { width:36px; height:36px; border-radius:10px; display:grid; place-items:center; background:var(--v2-surface-2); color:var(--v2-fg-3); }
`;

// ── Utility Components ────────────────────────────────────────────────────────

function ExecBadge({
  tone,
  children,
}: {
  tone: "success" | "warning" | "danger" | "neutral" | "accent";
  children: React.ReactNode;
}) {
  const dotColor = {
    success: T.success,
    warning: T.warning,
    danger: T.danger,
    neutral: T.neutral,
    accent: T.accent,
  }[tone];
  return (
    <span className={`exec-badge ${tone}`}>
      <span className="exec-badge-dot" style={{ background: dotColor }} />
      {children}
    </span>
  );
}

function SevPill({ severity }: { severity: number | null | undefined }) {
  const s = severity ?? 0;
  const cls = s >= 8 ? "sev-crit" : s >= 6 ? "sev-high" : s >= 4 ? "sev-med" : "sev-low";
  return (
    <span className={`sev-pill ${cls}`} title={`Severidade ${s} de 10`}>
      {s}
    </span>
  );
}

// Tooltip do gráfico de EPS diário
function EpsTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { day: string; avg: number; peak: number | null; lic: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div
      style={{
        display: "grid",
        gap: 2,
        padding: "8px 10px",
        background: "var(--v2-surface-2)",
        border: "1px solid var(--v2-line-strong)",
        borderRadius: 8,
        fontSize: 12,
        boxShadow: "0 12px 32px rgba(0,0,0,0.3)",
      }}
    >
      <b>
        {new Date(p.day + "T12:00:00").toLocaleDateString("pt-BR", {
          weekday: "short",
          day: "2-digit",
          month: "2-digit",
        })}
      </b>
      <span style={{ fontFamily: "var(--font-data)", color: "var(--v2-fg-2)" }}>
        EPS médio {fmtNum(p.avg)}
      </span>
      <span style={{ fontFamily: "var(--font-data)", color: "var(--v2-fg-2)" }}>
        Pico {p.peak != null ? fmtNum(p.peak) : "—"}
        {p.peak != null && p.peak > p.lic ? " · acima da licença" : ""}
      </span>
    </div>
  );
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

function fortigateTypeBadge(queryType: string): {
  tone: "accent" | "warning" | "success";
  label: string;
} {
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
): {
  tone: "neutral" | "warning";
  label: string;
  elapsedHours: number | null;
  medianHours: number | null;
} {
  const stats = statsByDesc.get(o.description ?? "");
  const elapsedHours = o.start_time
    ? (Date.now() - new Date(o.start_time).getTime()) / 3_600_000
    : null;
  if (!stats || stats.count < 2 || elapsedHours === null) {
    return { tone: "neutral", label: "Sem histórico", elapsedHours, medianHours: null };
  }
  const threshold = Math.max(stats.medianHours * 4, 6);
  if (elapsedHours > threshold) {
    return {
      tone: "warning",
      label: "Atraso no fechamento",
      elapsedHours,
      medianHours: stats.medianHours,
    };
  }
  return {
    tone: "neutral",
    label: "Dentro do padrão",
    elapsedHours,
    medianHours: stats.medianHours,
  };
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
  const [sortBy, setSortBy] = React.useState<string>("status-asc");
  const [delSortBy, setDelSortBy] = React.useState<"event_count" | "username" | "event_time">(
    "event_count",
  );
  const [delSortDir, setDelSortDir] = React.useState<"asc" | "desc">("desc");
  const [dlSortBy, setDlSortBy] = React.useState<"event_count" | "username" | "event_time">(
    "event_count",
  );
  const [dlSortDir, setDlSortDir] = React.useState<"asc" | "desc">("desc");
  // Itens abertos nos painéis laterais
  const [openOffenseId, setOpenOffenseId] = React.useState<number | null>(null);
  const [openFgId, setOpenFgId] = React.useState<string | null>(null);

  // ── ALL QUERIES UNCHANGED (back-end) ────────────────────────────────────────
  const state = useQuery({
    queryKey: ["qradar-sync-state"],
    queryFn: async () => {
      const { data } = await supabase
        .from("qradar_sync_state")
        .select("*")
        .eq("id", true)
        .maybeSingle();
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
        {
          sum: number;
          count: number;
          lic: number;
          peak: number | null;
          avgPeakSum: number;
          avgPeakCount: number;
        }
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
      const { data } = await supabase
        .from("cron_job_runs")
        .select("*")
        .eq("job_name", "qradar-sync")
        .maybeSingle();
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
    LICENSED_EPS > 0
      ? Math.max(0, Math.round(((currentEps - LICENSED_EPS) / LICENSED_EPS) * 100))
      : 0;

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
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, peak]) => ({ day, peak }));
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
      const hours =
        (new Date(o.closed_at).getTime() - new Date(o.start_time).getTime()) / 3_600_000;
      if (hours < 0) continue;
      const key = o.description ?? "";
      const arr = byDesc.get(key) ?? [];
      arr.push(hours);
      byDesc.set(key, arr);
    }
    const stats = new Map<string, { medianHours: number; count: number }>();
    for (const [desc, hours] of byDesc)
      stats.set(desc, { medianHours: median(hours), count: hours.length });
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

  // ── Visão da tela (submenu) ─────────────────────────────────────────────────
  const SOC_VIEWS = ["geral", "ofensas", "ameacas", "m365", "infra", "sek"] as const;
  type SocView = (typeof SOC_VIEWS)[number];
  const [view, setView] = React.useState<SocView>(() => {
    try {
      const v = localStorage.getItem("soc_view") as SocView | null;
      return v && (SOC_VIEWS as readonly string[]).includes(v) ? v : "geral";
    } catch {
      return "geral";
    }
  });
  const go = (v: SocView) => {
    setView(v);
    try {
      localStorage.setItem("soc_view", v);
    } catch {
      /* storage indisponível */
    }
  };

  // ── EPS diário (média e pico) para o gráfico da visão geral ─────────────────
  const epsDaily = (() => {
    const byDay = new Map<string, { sum: number; n: number; peak: number | null; lic: number }>();
    for (const s of eps.data ?? []) {
      const day = s.sampled_at.slice(0, 10);
      const cur = byDay.get(day) ?? {
        sum: 0,
        n: 0,
        peak: null,
        lic: s.licensed_eps ?? LICENSED_EPS,
      };
      cur.sum += Number(s.total_eps ?? 0);
      cur.n += 1;
      if (s.peak_eps != null)
        cur.peak = cur.peak == null ? Number(s.peak_eps) : Math.max(cur.peak, Number(s.peak_eps));
      byDay.set(day, cur);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([day, v]) => ({
        day,
        label: fmtDayShort(day),
        avg: Math.round(v.sum / v.n),
        peak: v.peak,
        lic: v.lic,
      }));
  })();

  // ── M365: usuários distintos com anomalia ──
  const m365Users = new Set([
    ...(o365Deletions.data ?? []).map((r) => r.username),
    ...(o365Downloads.data ?? []).map((r) => r.username),
  ]).size;
  const dropCount = drops.data?.length ?? 0;
  const fgEvents = fortigatePolicyChanges.data ?? [];
  const lateOffenses = openOffensesList.filter(
    (o) => diagnoseOpenOffense(o, closeStatsByDesc).tone === "warning",
  );

  // ── "Precisa de atenção": junta o que pede ação, de todas as fontes ──
  type FeedItem = {
    key: string;
    tag: React.ReactNode;
    title: string;
    sub: string;
    onClick: () => void;
  };
  const feed: FeedItem[] = [];
  for (const o of openOffensesList.filter((x) => (x.severity ?? 0) >= 7).slice(0, 3)) {
    feed.push({
      key: `off-${o.id}`,
      tag: <SevPill severity={o.severity} />,
      title: o.description ?? "Ofensa sem descrição",
      sub: `Ofensa #${o.id} · aberta ${fmtDate(o.start_time)} · origem ${o.source_ip ?? "—"}`,
      onClick: () => setOpenOffenseId(o.id),
    });
  }
  for (const e of fgEvents.filter((x) => x.event_category === "any_any_accept").slice(0, 2)) {
    feed.push({
      key: `fg-${e.id}`,
      tag: <span className="soc-tag crit">any/any</span>,
      title: "Policy any/any habilitada no FortiGate",
      sub: `${e.username ?? "—"} · ${fmtDate(e.event_time)}${isOutsideBusinessHours(e.event_time) ? " · fora do horário" : ""}`,
      onClick: () => setOpenFgId(e.id),
    });
  }
  for (const o of lateOffenses.filter((x) => (x.severity ?? 0) < 7).slice(0, 2)) {
    feed.push({
      key: `late-${o.id}`,
      tag: <SevPill severity={o.severity} />,
      title: o.description ?? "Ofensa sem descrição",
      sub: `Ofensa #${o.id} · aberta há mais tempo que o normal para a regra`,
      onClick: () => setOpenOffenseId(o.id),
    });
  }
  if (m365Users > 0) {
    feed.push({
      key: "m365",
      tag: <span className="soc-tag med">M365</span>,
      title: "Deleção ou download em massa no Microsoft 365",
      sub: `${m365Users} ${m365Users === 1 ? "usuário" : "usuários"} acima do limite de eventos por minuto`,
      onClick: () => go("m365"),
    });
  }
  if (errorSources.length > 0) {
    feed.push({
      key: "ls",
      tag: <span className="soc-tag med">Log</span>,
      title: `${errorSources.length} ${errorSources.length === 1 ? "fonte de log com erro" : "fontes de log com erro"}`,
      sub: errorSources
        .slice(0, 3)
        .map(
          (s) => `${s.name.replace(/@\s*.+$/, "").trim()} há ${fmtDuration(s.status_changed_at)}`,
        )
        .join(" · "),
      onClick: () => go("infra"),
    });
  }
  if (dropCount > 0) {
    feed.push({
      key: "drop",
      tag: <span className="soc-tag crit">EPS</span>,
      title: `${dropCount} ${dropCount === 1 ? "descarte de logs" : "descartes de logs"} por excesso de EPS`,
      sub: "Eventos descartados pelo QRadar por estourar a licença",
      onClick: () => go("infra"),
    });
  }

  const openOffense = openOffensesList.find((o) => o.id === openOffenseId) ?? null;
  const openFg = fgEvents.find((e) => e.id === openFgId) ?? null;
  const peakTip = dailyPeaksLast7
    .map((d) => `${fmtDayShort(d.day)}: ${fmtNum(d.peak)} EPS`)
    .join("\n");
  const sevClass = (s: number | null | undefined) =>
    (s ?? 0) >= 8 ? "crit" : (s ?? 0) >= 6 ? "high" : (s ?? 0) >= 4 ? "med" : "low";

  const HBars = ({ rows, unit }: { rows: Array<{ ip: string; v: number }>; unit: string }) => {
    const max = rows[0]?.v || 1;
    if (rows.length === 0) return <EmptyState message="Sem dados no último sync." />;
    return (
      <div className="soc-bars">
        {rows.map((r) => (
          <div key={r.ip} className="soc-bar" title={`${r.ip}: ${fmtNum(r.v)} ${unit}`}>
            <span>{r.ip}</span>
            <span>{fmtNum(r.v)}</span>
            <div className="soc-track">
              <i style={{ width: `${(r.v / max) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    );
  };

  const M365Table = ({
    rows,
    sortBy: sb,
    sortDir: sd,
    setSortBy: ssb,
    setSortDir: ssd,
    countLabel,
    tone,
  }: {
    rows: Array<{
      username: string;
      source_ip: string;
      event_count: number;
      event_time: string | null;
    }>;
    sortBy: "event_count" | "username" | "event_time";
    sortDir: "asc" | "desc";
    setSortBy: (v: "event_count" | "username" | "event_time") => void;
    setSortDir: React.Dispatch<React.SetStateAction<"asc" | "desc">>;
    countLabel: string;
    tone: "crit" | "med";
  }) => {
    const sortTh = (key: "event_count" | "username" | "event_time", label: string, cls = "") => (
      <th
        className={`sortable ${cls}`}
        onClick={() => {
          ssb(key);
          ssd((d) => (d === "asc" ? "desc" : "asc"));
        }}
      >
        {label} {sb === key ? (sd === "asc" ? "↑" : "↓") : ""}
      </th>
    );
    return (
      <div className="exec-scroll" style={{ maxHeight: 420 }}>
        <table className="exec-table">
          <thead>
            <tr>
              {sortTh("username", "Usuário")}
              <th>IP de origem</th>
              {sortTh("event_count", countLabel, "r")}
              {sortTh("event_time", "Quando", "r")}
            </tr>
          </thead>
          <tbody>
            {[...rows]
              .sort((a, b) => {
                const dir = sd === "asc" ? 1 : -1;
                if (sb === "event_count") return (a.event_count - b.event_count) * dir;
                if (sb === "username") return a.username.localeCompare(b.username) * dir;
                return ((a.event_time ?? "") > (b.event_time ?? "") ? 1 : -1) * dir;
              })
              .map((r, i) => (
                <tr key={i}>
                  <td className="mono" style={{ fontWeight: 500 }}>
                    {r.username || "—"}
                  </td>
                  <td className="mono dim">{r.source_ip || "—"}</td>
                  <td className="r">
                    <span className={`soc-tag ${tone}`} style={{ fontFamily: "var(--font-data)" }}>
                      {r.event_count.toLocaleString("pt-BR")}
                    </span>
                  </td>
                  <td className="r mono dim">{fmtDate(r.event_time)}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    );
  };

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div className="soc-root">
      <style dangerouslySetInnerHTML={{ __html: inlineStyles }} />

      {/* ── Cabeçalho ─────────────────────────────────────────────────────────── */}
      <div className="soc-ph">
        <div>
          <h1 className="soc-ph-title">Centro de Operações de Segurança</h1>
          <p className="soc-ph-sub">
            <span
              className={`soc-live${state.data?.last_error ? " warn" : ""}`}
              title={
                state.data?.last_full_sync_at
                  ? new Date(state.data.last_full_sync_at).toLocaleString("pt-BR")
                  : undefined
              }
            >
              Sincronizado em {fmtDate(state.data?.last_full_sync_at ?? null)}
            </span>
            <span>·</span>
            <span>IBM QRadar SIEM, Microsoft 365 e chamados da Sek</span>
          </p>
        </div>
        <SyncActions moduleSlug="soc" />
      </div>

      {state.data?.last_error && (
        <div className="soc-error">
          <AlertTriangle size={14} />
          <span>Último erro de sincronização: {state.data.last_error}</span>
        </div>
      )}

      {/* ── Submenu ─────────────────────────────────────────────────────────── */}
      <div className="soc-subnav" role="tablist" aria-label="Seções do SOC">
        {(
          [
            ["geral", "Visão geral", null, ""],
            [
              "ofensas",
              "Ofensas",
              openOffenses,
              openOffensesList.some((o) => (o.severity ?? 0) >= 7) ? "" : "warn",
            ],
            ["ameacas", "Ameaças", null, ""],
            ["m365", "Microsoft 365", m365Users, "warn"],
            ["infra", "Infraestrutura", errorSources.length + dropCount, "warn"],
            ["sek", "Chamados Sek", null, ""],
          ] as Array<[SocView, string, number | null, string]>
        ).map(([id, label, n, tone]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={view === id}
            onClick={() => go(id)}
          >
            {label}
            {n ? <span className={`soc-count ${tone}`}>{n}</span> : null}
          </button>
        ))}
      </div>

      {/* ══ VISÃO GERAL ═════════════════════════════════════════════════════ */}
      {view === "geral" && (
        <>
          <div className="soc-kpis">
            <div className="soc-kpi">
              <span className="soc-kpi-label">EPS atual</span>
              <span className="soc-kpi-value">{fmtNum(currentEps)}</span>
              <div className="soc-meter" aria-hidden="true">
                <i
                  style={{
                    width: `${Math.min(100, usagePct)}%`,
                    background:
                      usagePct >= 90
                        ? "var(--v2-crit)"
                        : usagePct >= 70
                          ? "var(--v2-med)"
                          : "var(--v2-accent)",
                  }}
                />
              </div>
              <span className="soc-kpi-foot">
                {usagePct}% da licença de {fmtNum(LICENSED_EPS)} EPS
                {excedentePct > 0 ? ` · ${excedentePct}% acima` : ""}
              </span>
            </div>
            <div className="soc-kpi" title={peakTip ? `Pico diário:\n${peakTip}` : undefined}>
              <span className="soc-kpi-label">
                {maxPeak7d >= LICENSED_EPS && (
                  <span className="soc-sw" style={{ background: "var(--v2-crit)" }} />
                )}
                Pico em 7 dias
              </span>
              <span className="soc-kpi-value">{fmtNum(maxPeak7d)}</span>
              <span className="soc-kpi-foot">
                {maxPeak7d >= LICENSED_EPS ? "acima da licença" : "dentro da licença"} · passe o
                mouse para ver por dia
              </span>
            </div>
            <button type="button" className="soc-kpi" onClick={() => go("ofensas")}>
              <span className="soc-kpi-label">
                {openOffenses > 0 && (
                  <span className="soc-sw" style={{ background: "var(--v2-crit)" }} />
                )}
                Ofensas abertas
              </span>
              <span className="soc-kpi-value">{openOffenses}</span>
              <span className="soc-kpi-foot">
                {lateOffenses.length > 0
                  ? `${lateOffenses.length} há mais tempo que o normal`
                  : openOffenses > 0
                    ? "dentro do tempo normal"
                    : "nada aberto"}
              </span>
            </button>
            <button type="button" className="soc-kpi" onClick={() => go("m365")}>
              <span className="soc-kpi-label">
                {m365Users > 0 && (
                  <span className="soc-sw" style={{ background: "var(--v2-med)" }} />
                )}
                Anomalias no M365
              </span>
              <span className="soc-kpi-value">{m365Users}</span>
              <span className="soc-kpi-foot">usuários com deleção ou download em massa</span>
            </button>
            <button type="button" className="soc-kpi" onClick={() => go("infra")}>
              <span className="soc-kpi-label">
                {errorSources.length > 0 && (
                  <span className="soc-sw" style={{ background: "var(--v2-med)" }} />
                )}
                Fontes de log com erro
              </span>
              <span className="soc-kpi-value">{errorSources.length}</span>
              <span className="soc-kpi-foot">
                de {allSources.length} fontes · {dropCount}{" "}
                {dropCount === 1 ? "descarte" : "descartes"} de log
              </span>
            </button>
            <div className="soc-kpi">
              <span className="soc-kpi-label">Eventos registrados</span>
              <span className="soc-kpi-value">{fmtNum(totalEvents)}</span>
              <span className="soc-kpi-foot">nas ofensas sincronizadas</span>
            </div>
          </div>

          <div className="soc-grid">
            <div className="soc-card soc-span-2">
              <div className="soc-card-hdr">
                <div>
                  <h2 className="soc-card-title">EPS nos últimos 30 dias</h2>
                  <p className="soc-card-sub">
                    Média e pico de cada dia, comparados à licença contratada
                  </p>
                </div>
                <div className="soc-legend">
                  <span>
                    <span className="soc-sw" style={{ background: "var(--v2-accent)" }} /> EPS médio
                  </span>
                  <span>
                    <span className="soc-sw" style={{ background: "var(--v2-high)" }} /> Pico
                  </span>
                  <span>
                    <span className="soc-sw" style={{ background: "var(--v2-crit)", height: 2 }} />{" "}
                    Licença
                  </span>
                </div>
              </div>
              <div className="soc-card-body" style={{ height: 280 }}>
                {epsDaily.length === 0 ? (
                  <EmptyState message="Sem amostras de EPS nos últimos 30 dias." />
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart
                      data={epsDaily}
                      margin={{ top: 10, right: 12, bottom: 0, left: -6 }}
                    >
                      <CartesianGrid stroke="var(--v2-line)" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                      />
                      <YAxis
                        tickLine={false}
                        axisLine={false}
                        width={52}
                        tickFormatter={(v) => fmtNum(Number(v))}
                      />
                      <Tooltip
                        cursor={{ stroke: "var(--v2-line-strong)" }}
                        content={<EpsTooltip />}
                      />
                      <ReferenceLine
                        y={LICENSED_EPS}
                        stroke="var(--v2-crit)"
                        strokeWidth={1.5}
                        label={{
                          value: `licença ${fmtNum(LICENSED_EPS)}`,
                          position: "insideTopRight",
                        }}
                      />
                      <Area
                        type="linear"
                        dataKey="avg"
                        name="EPS médio"
                        stroke="var(--v2-accent)"
                        strokeWidth={2}
                        fill="color-mix(in oklch, var(--v2-accent) 16%, transparent)"
                        dot={false}
                        activeDot={{
                          r: 4,
                          fill: "var(--v2-accent)",
                          stroke: "var(--v2-surface)",
                          strokeWidth: 2,
                        }}
                      />
                      <Line
                        type="linear"
                        dataKey="peak"
                        name="Pico"
                        stroke="var(--v2-high)"
                        strokeWidth={1.6}
                        strokeDasharray="4 3"
                        connectNulls
                        dot={(p: {
                          cx?: number;
                          cy?: number;
                          index?: number;
                          payload?: { peak: number | null; lic: number };
                        }) =>
                          p.payload?.peak != null && p.payload.peak > p.payload.lic ? (
                            <circle
                              key={`o${p.index}`}
                              cx={p.cx}
                              cy={p.cy}
                              r={4}
                              fill="var(--v2-crit)"
                              stroke="var(--v2-surface)"
                              strokeWidth={2}
                            />
                          ) : (
                            <g key={`d${p.index}`} />
                          )
                        }
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="soc-card">
              <div className="soc-card-hdr">
                <div>
                  <h2 className="soc-card-title">Precisa de atenção</h2>
                  <p className="soc-card-sub">O que olhar primeiro, de todas as fontes</p>
                </div>
              </div>
              <div className="soc-card-body">
                {feed.length === 0 ? (
                  <EmptyState message="Nada pedindo atenção agora." />
                ) : (
                  <div className="soc-feed">
                    {feed.map((f) => (
                      <button key={f.key} type="button" onClick={f.onClick}>
                        <span className="k">{f.tag}</span>
                        <b title={f.title}>{f.title}</b>
                        <small title={f.sub}>{f.sub}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}

      {/* ══ OFENSAS ═════════════════════════════════════════════════════════ */}
      {view === "ofensas" && (
        <div className="exec-panel">
          <div className="soc-toolbar">
            <b>Ofensas abertas</b>
            <small>
              {openOffenses} ·{" "}
              {fmtNum(openOffensesList.reduce((a, o) => a + (o.event_count ?? 0), 0))} eventos
            </small>
          </div>
          {openOffensesList.length === 0 ? (
            <EmptyState message="Nenhuma ofensa aberta." />
          ) : (
            <div className="exec-scroll" style={{ maxHeight: 640 }}>
              <table className="exec-table">
                <thead>
                  <tr>
                    <th>Sev.</th>
                    <th>Descrição</th>
                    <th className="r">Magnitude</th>
                    <th>Início</th>
                    <th>Origem</th>
                    <th>Rede de destino</th>
                    <th className="r">Eventos</th>
                    <th>Diagnóstico</th>
                  </tr>
                </thead>
                <tbody>
                  {openOffensesList.map((o) => {
                    const diag = diagnoseOpenOffense(o, closeStatsByDesc);
                    return (
                      <tr
                        key={o.id}
                        className="clickable"
                        tabIndex={0}
                        onClick={() => setOpenOffenseId(o.id)}
                        onKeyDown={(e) => e.key === "Enter" && setOpenOffenseId(o.id)}
                      >
                        <td>
                          <SevPill severity={o.severity} />
                        </td>
                        <td style={{ maxWidth: 340 }}>
                          <span
                            style={{
                              display: "block",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                              fontWeight: 500,
                            }}
                            title={o.description ?? undefined}
                          >
                            {o.description ?? "—"}
                          </span>
                          <span className="mono dim" style={{ fontSize: 12 }}>
                            #{o.id}
                          </span>
                        </td>
                        <td className="r mono">{o.magnitude ?? "—"}</td>
                        <td className="mono dim">{fmtDate(o.start_time)}</td>
                        <td className="mono">{o.source_ip ?? "—"}</td>
                        <td className="mono dim">{o.destination_ip ?? "—"}</td>
                        <td className="r mono">{fmtNum(o.event_count ?? 0)}</td>
                        <td title="Estimativa por comparação com a mediana histórica da mesma regra — o QRadar não informa o motivo real do atraso.">
                          <span className={`soc-diag${diag.tone === "warning" ? " late" : ""}`}>
                            {diag.tone === "warning" && <AlertTriangle size={12} />}
                            {diag.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <div className="soc-foot">
            O diagnóstico compara o tempo aberto com a mediana histórica da mesma regra · o QRadar
            não informa o motivo real do atraso
          </div>
        </div>
      )}

      {/* ══ AMEAÇAS ═════════════════════════════════════════════════════════ */}
      {view === "ameacas" && (
        <>
          <div className="soc-grid">
            {(
              [
                [
                  "Maiores ofensores externos",
                  "IPs de fora com mais eventos",
                  externalOffenders.data ?? [],
                  "eventos",
                ],
                [
                  "Origens internas · mais eventos",
                  "Máquinas da rede com mais eventos",
                  topSourceEvents.data ?? [],
                  "eventos",
                ],
                [
                  "Origens internas · mais ofensas",
                  "Máquinas envolvidas em mais ofensas",
                  internalSources,
                  "ofensas",
                ],
              ] as Array<[string, string, Array<{ ip: string; v: number }>, string]>
            ).map(([title, sub, rows, unit]) => (
              <div key={title} className="soc-card">
                <div className="soc-card-hdr">
                  <div>
                    <h2 className="soc-card-title">{title}</h2>
                    <p className="soc-card-sub">{sub}</p>
                  </div>
                </div>
                <div className="soc-card-body">
                  <HBars rows={rows} unit={unit} />
                </div>
              </div>
            ))}
          </div>

          <div className="exec-panel">
            <div className="soc-toolbar">
              <b>Conexões RDP suspeitas</b>
              <small>Logon tipo 10 · evento 4624 · usuário "infra" · últimas 24 h</small>
            </div>
            {(rdp.data?.length ?? 0) === 0 ? (
              <EmptyState message="Nenhum evento correspondente nas últimas 24h." />
            ) : (
              <div className="exec-scroll" style={{ maxHeight: 420 }}>
                <table className="exec-table">
                  <thead>
                    <tr>
                      <th>Quando</th>
                      <th>Usuário</th>
                      <th>IP de origem</th>
                      <th>IP de destino</th>
                      <th>Fonte de log</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(rdp.data ?? []).map((e) => (
                      <tr key={e.id}>
                        <td className="mono dim">
                          {fmtDate(e.event_time)}
                          {e.event_time && isOutsideBusinessHours(e.event_time) && (
                            <span className="soc-flag" title="Fora do horário comercial (08h–19h)">
                              <AlertTriangle size={11} /> fora do horário
                            </span>
                          )}
                        </td>
                        <td className="mono" style={{ fontWeight: 500 }}>
                          {e.username ?? "—"}
                        </td>
                        <td className="mono">{e.source_ip ?? "—"}</td>
                        <td className="mono">{e.destination_ip ?? "—"}</td>
                        <td className="dim">{e.log_source ?? "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══ MICROSOFT 365 ═══════════════════════════════════════════════════ */}
      {view === "m365" && (
        <div className="soc-grid-2">
          <div className="exec-panel">
            <div className="soc-toolbar">
              <b>Deleção em massa</b>
              <small>≥ 50 deleções por minuto</small>
            </div>
            {(o365Deletions.data?.length ?? 0) === 0 ? (
              <EmptyState message="Nenhuma deleção suspeita nas últimas 24h." />
            ) : (
              <M365Table
                rows={o365Deletions.data ?? []}
                sortBy={delSortBy}
                sortDir={delSortDir}
                setSortBy={setDelSortBy}
                setSortDir={setDelSortDir}
                countLabel="Deleções"
                tone="crit"
              />
            )}
          </div>
          <div className="exec-panel">
            <div className="soc-toolbar">
              <b>Download em massa</b>
              <small>≥ 50 eventos por minuto</small>
            </div>
            {(o365Downloads.data?.length ?? 0) === 0 ? (
              <EmptyState message="Nenhum download suspeito nas últimas 24h." />
            ) : (
              <M365Table
                rows={o365Downloads.data ?? []}
                sortBy={dlSortBy}
                sortDir={dlSortDir}
                setSortBy={setDlSortBy}
                setSortDir={setDlSortDir}
                countLabel="Eventos"
                tone="med"
              />
            )}
          </div>
        </div>
      )}

      {/* ══ INFRAESTRUTURA ══════════════════════════════════════════════════ */}
      {view === "infra" && (
        <>
          <div className="soc-grid">
            <div className="exec-panel soc-span-2">
              <div className="soc-toolbar">
                <b>Fontes de log · FortiGate e WinCollect</b>
                <small>{allSources.length}</small>
                <span style={{ marginLeft: "auto", display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {logSourcesSyncUnhealthy ? (
                    <ExecBadge tone="warning">{staleSources.length} desatualizadas</ExecBadge>
                  ) : (
                    <ExecBadge tone="success">{activeSources.length} ativas</ExecBadge>
                  )}
                  {errorSources.length > 0 && (
                    <ExecBadge tone="danger">{errorSources.length} com erro</ExecBadge>
                  )}
                  {disabledSources.length > 0 && (
                    <ExecBadge tone="neutral">{disabledSources.length} desabilitadas</ExecBadge>
                  )}
                </span>
              </div>
              {allSources.length === 0 ? (
                <EmptyState message="Nenhuma fonte encontrada." />
              ) : (
                <div className="exec-scroll" style={{ maxHeight: 420 }}>
                  <table className="exec-table">
                    <thead>
                      <tr>
                        <th
                          className="sortable"
                          onClick={() =>
                            setSortBy((s) => (s === "name-asc" ? "name-desc" : "name-asc"))
                          }
                        >
                          Fonte{" "}
                          {sortBy.startsWith("name") ? (sortBy === "name-asc" ? "↑" : "↓") : ""}
                        </th>
                        <th className="r">EPS</th>
                        <th
                          className="sortable"
                          onClick={() =>
                            setSortBy((s) => (s === "status-asc" ? "status-desc" : "status-asc"))
                          }
                        >
                          Status{" "}
                          {sortBy.startsWith("status") ? (sortBy === "status-asc" ? "↑" : "↓") : ""}
                        </th>
                        <th className="r">Status há</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        const order = { error: 0, success: 1, disabled: 2 };
                        const rank = (s: string | null) => order[s as keyof typeof order] ?? 3;
                        return [...allSources]
                          .sort((a, b) => {
                            if (sortBy === "name-asc") return a.name.localeCompare(b.name);
                            if (sortBy === "name-desc") return b.name.localeCompare(a.name);
                            if (sortBy === "status-desc") return rank(b.status) - rank(a.status);
                            return rank(a.status) - rank(b.status);
                          })
                          .map((s) => {
                            const isStale = s.status === "success" && logSourcesSyncUnhealthy;
                            const st = isStale ? "stale" : s.status;
                            const [label, tone] =
                              st === "error"
                                ? ["Erro", "danger"]
                                : st === "success"
                                  ? ["Ativa", "success"]
                                  : st === "stale"
                                    ? ["Desatualizada", "warning"]
                                    : ["Desabilitada", "neutral"];
                            return (
                              <tr key={s.id}>
                                <td
                                  className="mono"
                                  style={{
                                    fontWeight: 500,
                                    color: s.status === "disabled" ? "var(--v2-fg-3)" : undefined,
                                  }}
                                >
                                  {s.name}
                                </td>
                                <td className="r mono">{fmtNum(Number(s.avg_eps ?? 0))}</td>
                                <td>
                                  <ExecBadge
                                    tone={tone as "danger" | "success" | "warning" | "neutral"}
                                  >
                                    {label}
                                  </ExecBadge>
                                </td>
                                <td
                                  className="r mono dim"
                                  title={
                                    s.status_changed_at
                                      ? `desde ${fmtDate(s.status_changed_at)}`
                                      : undefined
                                  }
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

            <div className="soc-card">
              <div className="soc-card-hdr">
                <div>
                  <h2 className="soc-card-title">Consumo de EPS por fonte</h2>
                  <p className="soc-card-sub">Top 10 · % do EPS somado dessas fontes</p>
                </div>
              </div>
              <div className="soc-card-body">
                {sourcesByEps.length === 0 ? (
                  <EmptyState message="Sem consumo registrado." />
                ) : (
                  <div className="soc-bars">
                    {sourcesByEps.map((s) => (
                      <div
                        key={s.name}
                        className="soc-bar"
                        title={`${s.name}: ${s.pct}% · ${fmtNum(s.eps)} EPS`}
                      >
                        <span>{s.name}</span>
                        <span>{s.pct}%</span>
                        <div className="soc-track">
                          <i style={{ width: `${(s.pct / (sourcesByEps[0]?.pct || 1)) * 100}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="exec-panel">
            <div className="soc-toolbar">
              <b>Mudanças de policy no FortiGate</b>
              <small>últimas 24 h · clique para ver o que mudou</small>
            </div>
            {fgEvents.length === 0 ? (
              <EmptyState message="Nenhum evento de policy/admin/config detectado nas últimas 24h." />
            ) : (
              <div className="exec-scroll" style={{ maxHeight: 420 }}>
                <table className="exec-table">
                  <thead>
                    <tr>
                      <th>Quando</th>
                      <th>Tipo</th>
                      <th>Administrador</th>
                      <th>IP de origem</th>
                      <th>Ação</th>
                      <th>Mensagem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {fgEvents.map((e) => {
                      const tb = fortigateTypeBadge(e.query_type);
                      return (
                        <tr
                          key={e.id}
                          className="clickable"
                          tabIndex={0}
                          onClick={() => setOpenFgId(e.id)}
                          onKeyDown={(ev) => ev.key === "Enter" && setOpenFgId(e.id)}
                        >
                          <td className="mono dim" style={{ whiteSpace: "nowrap" }}>
                            {fmtDate(e.event_time)}
                            {isOutsideBusinessHours(e.event_time) && (
                              <span
                                className="soc-flag"
                                title="Fora do horário comercial (08h–19h)"
                              >
                                <AlertTriangle size={11} /> fora do horário
                              </span>
                            )}
                          </td>
                          <td>
                            <span style={{ display: "inline-flex", gap: 6 }}>
                              <ExecBadge tone={tb.tone}>{tb.label}</ExecBadge>
                              {e.event_category === "any_any_accept" && (
                                <span
                                  className="soc-tag crit"
                                  title="Policy any/any com ação accept, habilitada a partir de disabled"
                                >
                                  any/any
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="mono" style={{ fontWeight: 500 }}>
                            {e.username ?? "—"}
                          </td>
                          <td className="mono dim">{e.source_ip ?? "—"}</td>
                          <td>{e.action ?? e.event_name ?? "—"}</td>
                          <td className="dim" style={{ maxWidth: 280 }}>
                            <span
                              style={{
                                display: "block",
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                              title={e.message ?? undefined}
                            >
                              {e.message ?? "—"}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ══ CHAMADOS SEK ════════════════════════════════════════════════════ */}
      {view === "sek" && <SekTicketsPanel />}

      {/* ── Painel lateral: ofensa ───────────────────────────────────────────── */}
      <DetailSheet
        open={!!openOffense}
        onOpenChange={(o) => !o && setOpenOffenseId(null)}
        eyebrow={
          openOffense
            ? `Ofensa #${openOffense.id} · aberta em ${fmtDate(openOffense.start_time)}`
            : null
        }
        title={openOffense?.description ?? "Ofensa sem descrição"}
        badges={
          openOffense && (
            <>
              <SevPill severity={openOffense.severity} />
              <span className="soc-tag">Magnitude {openOffense.magnitude ?? "—"}</span>
              <span className="soc-tag info">{openOffense.status ?? "—"}</span>
            </>
          )
        }
      >
        {openOffense &&
          (() => {
            const detail = offenseRawDetail(openOffense.raw);
            const diag = diagnoseOpenOffense(openOffense, closeStatsByDesc);
            return (
              <>
                {diag.tone === "warning" && (
                  <div className="soc-warnbox">
                    <AlertTriangle size={14} />
                    <span>
                      Aberta há {diag.elapsedHours != null ? fmtHours(diag.elapsedHours) : "—"}, bem
                      acima da mediana de fechamento da regra (
                      {diag.medianHours != null ? fmtHours(diag.medianHours) : "—"}). Estimativa por
                      comparação com o histórico; o QRadar não informa o motivo real.
                    </span>
                  </div>
                )}
                <DetailSection title="Ofensa">
                  <DetailList
                    items={[
                      ["Origem", openOffense.source_ip ?? "—", true],
                      ["Rede de destino", openOffense.destination_ip ?? "—", true],
                      ["Eventos", fmtNum(openOffense.event_count ?? 0), true],
                      ["Atualizada", fmtDate(openOffense.last_updated_time), true],
                      ["Credibilidade", String(detail.credibility ?? "—")],
                      ["Relevância", String(detail.relevance ?? "—")],
                      ["Atribuída a", detail.assignedTo ?? "Não atribuída"],
                      ["Dispositivos", String(detail.deviceCount ?? "—")],
                      ["Origens", String(detail.sourceCount ?? "—")],
                      ["Flows", String(detail.flowCount ?? "—")],
                      ["Acompanhamento", detail.followUp ? "Sim" : "Não"],
                    ]}
                  />
                </DetailSection>
                <DetailSection title="Tempo">
                  <DetailList
                    items={[
                      [
                        "Tempo aberta",
                        diag.elapsedHours != null ? fmtHours(diag.elapsedHours) : "—",
                      ],
                      [
                        "Mediana da regra",
                        diag.medianHours != null ? fmtHours(diag.medianHours) : "Sem histórico",
                      ],
                      ["Diagnóstico", diag.label],
                    ]}
                  />
                </DetailSection>
                {detail.categories.length > 0 && (
                  <DetailSection title="Categorias">
                    <div className="soc-chips">
                      {detail.categories.map((c) => (
                        <span key={c} className="soc-tag">
                          {c}
                        </span>
                      ))}
                    </div>
                  </DetailSection>
                )}
              </>
            );
          })()}
      </DetailSheet>

      {/* ── Painel lateral: mudança no FortiGate ─────────────────────────────── */}
      <DetailSheet
        open={!!openFg}
        onOpenChange={(o) => !o && setOpenFgId(null)}
        eyebrow={openFg ? `FortiGate · ${fmtDate(openFg.event_time)}` : null}
        title={
          openFg
            ? extractFortigatePolicyId(openFg.message)
              ? `Policy ${extractFortigatePolicyId(openFg.message)}`
              : (openFg.action ?? openFg.event_name ?? "Mudança de configuração")
            : ""
        }
        badges={
          openFg && (
            <>
              <ExecBadge tone={fortigateTypeBadge(openFg.query_type).tone}>
                {fortigateTypeBadge(openFg.query_type).label}
              </ExecBadge>
              {openFg.event_category === "any_any_accept" && (
                <span className="soc-tag crit">any/any habilitada</span>
              )}
              {isOutsideBusinessHours(openFg.event_time) && (
                <span className="soc-tag med">fora do horário</span>
              )}
            </>
          )
        }
      >
        {openFg &&
          (() => {
            const changes = parseFortigateCfgAttr(fortigateRawDetail(openFg.raw).cfgattr);
            const raw = fortigateRawDetail(openFg.raw).cfgattr;
            return (
              <>
                <DetailSection title="Quem e de onde">
                  <DetailList
                    items={[
                      ["Administrador", openFg.username ?? "—", true],
                      ["IP de origem", openFg.source_ip ?? "—", true],
                      ["IP de destino", openFg.destination_ip ?? "—", true],
                      ["Ação", openFg.action ?? openFg.event_name ?? "—"],
                      ["Regra QRadar", openFg.qid_name ?? "—"],
                      ["QID", String(openFg.qid ?? "—"), true],
                      ["Fonte de log", openFg.log_source_name ?? "—"],
                    ]}
                  />
                </DetailSection>
                <DetailSection title="O que mudou">
                  {!changes ? (
                    <div className="soc-raw">
                      {raw ?? "Não disponível para este tipo de evento"}
                    </div>
                  ) : (
                    <div className="soc-diff">
                      {changes.map((c, i) => (
                        <div key={i} className="soc-diff-item">
                          <b>{c.label}</b>
                          {c.unchanged ? (
                            <span className="same">sem alteração</span>
                          ) : c.added.length > 0 || c.removed.length > 0 ? (
                            <>
                              {c.removed.length > 0 && (
                                <span className="rem">{c.removed.join(" ")}</span>
                              )}
                              {c.added.length > 0 && (
                                <span className="add">{c.added.join(" ")}</span>
                              )}
                            </>
                          ) : c.before ? (
                            <>
                              <span className="rem">{c.before}</span>
                              <span className="add">{c.after}</span>
                            </>
                          ) : (
                            <span className="add">{c.after}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </DetailSection>
                {openFg.message && (
                  <DetailSection title="Mensagem">
                    <div className="soc-raw">{openFg.message}</div>
                  </DetailSection>
                )}
              </>
            );
          })()}
      </DetailSheet>
    </div>
  );
}
