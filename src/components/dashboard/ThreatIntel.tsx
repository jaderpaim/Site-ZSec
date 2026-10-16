import { SyncActions } from "@/components/layout/SyncActions";
import * as React from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import {
  Search,
  X,
  Lock,
  Unlock,
  Info,
  Eye,
  EyeOff,
  Copy,
  ShieldCheck,
  Plus,
  Trash2,
  Pencil,
  User,
  Bell,
  Send,
  AlertTriangle,
  Check,
  Radar,
} from "lucide-react";
import { toast } from "sonner";
import { DetailList, DetailSection, DetailSheet } from "@/components/layout/DetailSheet";
import { usePermissions } from "@/lib/use-permissions";
import {
  listLeaks,
  getThreatIntelSyncStatus,
  getLeakTimeseries,
  getTopHosts,
  getStatusCounts,
  getThreatIntelAdAlert,
  updateLeakStatus,
  unlockLeaks,
  getLeakRadarAccountInfo,
  getLeakContext,
  revealLeakPassword,
  validateLeak,
  setLeakValidationManual,
  listLeakApps,
  upsertLeakApp,
  deleteLeakApp,
  type LeakRow,
  type LeakStatus,
  type LeakApp,
} from "@/lib/leakradar.functions";
import {
  listIncidents,
  createIncident,
  updateIncident,
  listIncidentChannels,
  upsertIncidentChannel,
  deleteIncidentChannel,
  testIncidentChannel,
  type IncidentRow,
  type IncidentChannel,
} from "@/lib/leakradar-incidents.functions";
import {
  listMonitors,
  listMonitorRuns,
  getMonitorOverview,
  upsertMonitor,
  toggleMonitor,
  deleteMonitor,
  type MonitorRow,
} from "@/lib/leakradar-monitors.functions";

// Módulo Threat Intelligence — Fase 1: credenciais vazadas coletadas do
// LeakRadar (ver leakradar.server.ts). A API não informa família do
// infostealer nem máquina infectada, então a tela não mostra isso. A senha
// nunca chega aqui: só a força dela.

const MODULE = "threat-intel";

const CATEGORIAS = [
  { k: "employees", rotulo: "Colaboradores", cor: "var(--v2-accent)" },
  { k: "customers", rotulo: "Clientes", cor: "var(--v2-med)" },
  { k: "third_parties", rotulo: "Terceiros", cor: "var(--v2-low)" },
] as const;
type CategoriaKey = (typeof CATEGORIAS)[number]["k"];

const STATUS: Record<LeakStatus, { rotulo: string; cor: string }> = {
  novo: { rotulo: "Novo", cor: "var(--v2-crit)" },
  em_tratamento: { rotulo: "Em tratamento", cor: "var(--v2-high)" },
  resolvido: { rotulo: "Resolvido", cor: "var(--v2-ok)" },
  risco_aceito: { rotulo: "Risco aceito", cor: "var(--v2-fg-3)" },
  falso_positivo: { rotulo: "Falso positivo", cor: "var(--v2-fg-3)" },
};
const STATUS_ORDEM = Object.keys(STATUS) as LeakStatus[];

// Escala do LeakRadar: 0-2 muito fraca, 3-4 fraca, 5-7 média, 8+ forte
function forca(s: number | null): { rotulo: string; nivel: 0 | 1 | 2 | 3; cor: string } | null {
  if (s == null) return null;
  if (s <= 2) return { rotulo: "Muito fraca", nivel: 0, cor: "var(--v2-crit)" };
  if (s <= 4) return { rotulo: "Fraca", nivel: 1, cor: "var(--v2-high)" };
  if (s <= 7) return { rotulo: "Média", nivel: 2, cor: "var(--v2-med)" };
  return { rotulo: "Forte", nivel: 3, cor: "var(--v2-ok)" };
}

const nf = new Intl.NumberFormat("pt-BR");
const fmtData = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : "sem data";

function fmtRel(iso: string | null): string {
  if (!iso) return "nunca";
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 60) return `há ${d} ${d === 1 ? "dia" : "dias"}`;
  const m = Math.floor(d / 30);
  return `há ${m} meses`;
}

const CSS = `
  .ti-root { font-family:var(--font-ui); color:var(--v2-fg); display:flex; flex-direction:column; gap:20px; font-size:14px; }
  .ti-root * { box-sizing:border-box; }
  .ti-root button:focus-visible, .ti-root input:focus-visible, .ti-root textarea:focus-visible, .ti-root tr:focus-visible { outline:2px solid var(--v2-accent); outline-offset:2px; }
  .ti-root .recharts-cartesian-axis-tick-value { fill:var(--v2-fg-3) !important; font-size:11px; font-family:var(--font-data); }
  .ti-root .mono { font-family:var(--font-data); font-size:12.5px; }
  .ti-root .dim { color:var(--v2-fg-3); }

  .ti-ph { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  .ti-ph-title { font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.2; margin:0; }
  .ti-ph-sub { margin:4px 0 0; font-size:13px; color:var(--v2-fg-3); display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  .ti-live { display:inline-flex; align-items:center; gap:6px; }
  .ti-live::before { content:""; width:7px; height:7px; border-radius:50%; background:var(--v2-ok); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-ok) 25%, transparent); }

  .ti-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
  .ti-kpi { padding:16px 18px 14px; display:grid; gap:2px; align-content:start; box-shadow:1px 0 0 var(--v2-line), 0 1px 0 var(--v2-line); min-width:0; }
  .ti-kpi-label { font-size:12.5px; color:var(--v2-fg-2); }
  .ti-kpi-value { font-size:28px; font-weight:600; letter-spacing:-0.02em; line-height:1.25; font-variant-numeric:tabular-nums; }
  .ti-kpi.hot .ti-kpi-value { color:var(--v2-crit); }
  .ti-kpi-hint { font-size:12px; color:var(--v2-fg-3); }

  .ti-grid { display:grid; grid-template-columns:minmax(0, 1.6fr) minmax(0, 1fr); gap:20px; }
  @media (max-width: 1100px) { .ti-grid { grid-template-columns:minmax(0, 1fr); } }
  .ti-panel { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; min-width:0; }
  .ti-panel-hdr { padding:14px 18px 4px; }
  .ti-panel-title { font-size:14px; font-weight:600; margin:0; }
  .ti-panel-sub { margin:2px 0 0; font-size:12.5px; color:var(--v2-fg-3); }
  .ti-panel-body { padding:12px 18px 18px; }
  .ti-legend { display:flex; gap:14px; flex-wrap:wrap; font-size:12px; color:var(--v2-fg-2); padding:0 18px; }
  .ti-legend i { display:inline-block; width:9px; height:9px; border-radius:2px; margin-right:6px; vertical-align:-1px; }

  .ti-hosts { display:grid; gap:4px; }
  .ti-host { display:grid; grid-template-columns:minmax(0,1fr) 48px; gap:4px 10px; align-items:center; padding:6px 8px; margin:0 -8px; border:0; border-radius:8px; background:transparent; color:var(--v2-fg); text-align:left; cursor:pointer; font-family:inherit; }
  .ti-host:hover { background:var(--v2-hover); }
  .ti-host[aria-pressed="true"] { background:color-mix(in oklch, var(--v2-accent) 14%, transparent); }
  .ti-host span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-family:var(--font-data); font-size:12.5px; color:var(--v2-fg-2); }
  .ti-host b { font-family:var(--font-data); font-weight:600; font-size:12.5px; text-align:right; font-variant-numeric:tabular-nums; }
  .ti-host .bar { grid-column:1 / -1; height:5px; border-radius:3px; background:var(--v2-surface-2); overflow:hidden; }
  .ti-host .bar i { display:block; height:100%; border-radius:3px; background:var(--v2-accent); }

  .ti-note { display:flex; gap:10px; align-items:flex-start; padding:10px 14px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-surface); font-size:12.5px; color:var(--v2-fg-2); }
  .ti-note svg { flex-shrink:0; margin-top:1px; color:var(--v2-fg-3); }

  .ti-toolbar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:12px 18px; border-bottom:1px solid var(--v2-line); }
  .ti-seg { display:inline-flex; padding:3px; gap:2px; background:var(--v2-bg); border:1px solid var(--v2-line); border-radius:8px; flex-wrap:wrap; }
  .ti-seg button { display:inline-flex; align-items:center; gap:6px; border:0; background:transparent; padding:4px 12px; border-radius:5px; font-size:13px; color:var(--v2-fg-2); cursor:pointer; font-family:inherit; }
  .ti-seg button:hover { color:var(--v2-fg); }
  .ti-seg button[aria-pressed="true"] { background:var(--v2-surface-2); color:var(--v2-fg); font-weight:500; box-shadow:inset 0 0 0 1px var(--v2-line); }
  .ti-seg button b { font-family:var(--font-data); font-weight:400; font-size:11.5px; color:var(--v2-fg-3); }
  .ti-busca { display:inline-flex; align-items:center; gap:8px; height:32px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg-3); width:280px; max-width:100%; margin-left:auto; }
  .ti-busca:focus-within { border-color:var(--v2-accent); }
  .ti-busca input { flex:1; min-width:0; border:0; outline:none; background:transparent; color:var(--v2-fg); font-size:13px; font-family:inherit; }
  .ti-chips { display:flex; gap:6px; flex-wrap:wrap; padding:10px 18px; border-bottom:1px solid var(--v2-line); }
  .ti-chip { display:inline-flex; align-items:center; gap:6px; height:28px; padding:0 10px; border-radius:99px; border:1px solid var(--v2-line); background:transparent; color:var(--v2-fg-2); font-size:12.5px; font-family:inherit; cursor:pointer; }
  .ti-chip[aria-pressed="true"] { border-color:var(--v2-accent); color:var(--v2-fg); background:color-mix(in oklch, var(--v2-accent) 12%, transparent); }
  .ti-chip[data-readonly] { cursor:default; color:var(--v2-fg-3); }
  .ti-chip.rm { border:0; background:color-mix(in oklch, var(--v2-accent) 14%, transparent); color:var(--v2-fg); }

  .ti-scroll { overflow:auto; max-height:600px; }
  .ti-table { width:100%; border-collapse:collapse; font-size:13px; }
  .ti-table th { position:sticky; top:0; z-index:1; padding:9px 12px; font-size:12px; font-weight:500; color:var(--v2-fg-3); text-align:left; background:var(--v2-surface); border-bottom:1px solid var(--v2-line); white-space:nowrap; }
  .ti-table td { padding:8px 12px; height:44px; border-bottom:1px solid var(--v2-line); vertical-align:middle; }
  .ti-table th:first-child, .ti-table td:first-child { padding-left:18px; }
  .ti-table th:last-child, .ti-table td:last-child { padding-right:18px; }
  .ti-table tbody tr { cursor:pointer; }
  .ti-table tbody tr:hover td { background:var(--v2-hover); }
  .ti-table tbody tr:last-child td { border-bottom:0; }
  .ti-trunc { display:block; max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .ti-acc { display:inline-flex; align-items:center; gap:6px; max-width:300px; }
  .ti-acc svg { flex-shrink:0; color:var(--v2-fg-3); }
  .ti-pill { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; white-space:nowrap; background:color-mix(in srgb, var(--c) 14%, transparent); color:color-mix(in srgb, var(--c) 75%, var(--v2-fg)); }
  .ti-pill::before { content:""; width:7px; height:7px; border-radius:50%; background:var(--c); }
  .ti-str { display:inline-flex; align-items:center; gap:8px; white-space:nowrap; font-size:12.5px; color:var(--v2-fg-2); }
  .ti-str-bars { display:inline-flex; gap:2px; }
  .ti-str-bars i { width:9px; height:4px; border-radius:1px; background:var(--v2-surface-2); }

  .ti-empty { padding:40px 24px; display:flex; flex-direction:column; align-items:center; gap:8px; text-align:center; }
  .ti-empty-t { font-weight:600; }
  .ti-empty-s { font-size:13px; color:var(--v2-fg-3); max-width:56ch; }
  .ti-caminho { font-family:var(--font-data); font-size:12.5px; color:var(--v2-fg-2); padding:6px 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-surface-2); }

  .ti-btn { display:inline-flex; align-items:center; gap:7px; height:34px; padding:0 14px; border-radius:8px; border:1px solid var(--v2-line); background:var(--v2-surface); font-size:13px; font-weight:500; color:var(--v2-fg); cursor:pointer; font-family:inherit; }
  .ti-btn:hover:not(:disabled) { background:var(--v2-hover); border-color:var(--v2-line-strong); }
  .ti-btn:disabled { opacity:.55; cursor:default; }
  .ti-btn.pri { background:var(--v2-accent); border-color:var(--v2-accent); color:var(--v2-accent-ink); }
  .ti-btn.pri:hover:not(:disabled) { background:var(--v2-accent); filter:brightness(1.06); }
  .ti-btn.ghost { background:transparent; border-color:transparent; color:var(--v2-fg-2); }
  .ti-btn.sm { height:28px; padding:0 10px; font-size:12.5px; }

  .ti-tip { display:grid; gap:2px; padding:8px 10px; background:var(--v2-surface-2); border:1px solid var(--v2-line-strong); border-radius:8px; font-size:12px; box-shadow:0 12px 32px rgba(0,0,0,0.3); }
  .ti-tip span { color:var(--v2-fg-2); font-family:var(--font-data); }

  .ti-sheet { gap:20px; }
  .ti-status-opts { display:flex; flex-wrap:wrap; align-items:center; gap:6px; }
  .ti-status-sep { width:1px; align-self:stretch; min-height:22px; background:var(--v2-line); margin:0 2px; }
  .ti-notes { width:100%; min-height:72px; padding:8px 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg); font:13px var(--font-ui); resize:vertical; }
  .ti-confirm { display:grid; gap:8px; padding:10px 12px; border:1px solid color-mix(in oklch, var(--v2-high) 45%, var(--v2-line)); border-radius:8px; background:color-mix(in oklch, var(--v2-high) 8%, var(--v2-surface)); font-size:12.5px; color:var(--v2-fg-2); }

  .ti-alert { display:flex; align-items:center; gap:14px; width:100%; text-align:left; cursor:pointer; padding:12px 16px; border-radius:10px; font-family:inherit; color:var(--v2-fg); border:1px solid color-mix(in oklch, var(--v2-crit) 45%, var(--v2-line)); background:color-mix(in oklch, var(--v2-crit) 9%, var(--v2-surface)); }
  .ti-alert:hover { background:color-mix(in oklch, var(--v2-crit) 13%, var(--v2-surface)); }
  .ti-alert-ic { width:30px; height:30px; border-radius:8px; display:grid; place-items:center; background:color-mix(in oklch, var(--v2-crit) 20%, transparent); color:var(--v2-crit); flex:none; }
  .ti-alert-tx { display:grid; gap:2px; flex:1; min-width:0; }
  .ti-alert-tx b { font-size:14px; }
  .ti-alert-tx span { font-size:12.5px; color:var(--v2-fg-2); }
  .ti-alert-cta { font-size:12.5px; font-weight:500; color:var(--v2-crit); white-space:nowrap; flex:none; }

  .ti-mon { display:grid; grid-template-columns:1fr auto; gap:4px 12px; align-items:center; padding:13px 18px; border-bottom:1px solid var(--v2-line); cursor:pointer; }
  .ti-mon:hover { background:var(--v2-hover); }
  .ti-mon-main { min-width:0; display:grid; gap:3px; }
  .ti-mon-t { display:flex; align-items:center; gap:8px; min-width:0; flex-wrap:wrap; }
  .ti-mon-t b { font-size:13.5px; font-weight:600; }
  .ti-scope { font:500 10.5px var(--font-data); padding:1px 7px; border-radius:99px; background:var(--v2-surface-2); color:var(--v2-fg-2); white-space:nowrap; }
  .ti-mon-sub { font:12px var(--font-data); color:var(--v2-fg-3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .ti-sw { width:34px; height:20px; border-radius:99px; border:0; background:var(--v2-line-strong); position:relative; cursor:pointer; flex:none; }
  .ti-sw::after { content:""; position:absolute; top:2px; left:2px; width:16px; height:16px; border-radius:50%; background:#fff; transition:transform .15s; }
  .ti-sw.on { background:var(--v2-ok); }
  .ti-sw.on::after { transform:translateX(14px); }
  .ti-sw:disabled { opacity:.6; cursor:default; }

  .ti-feed { display:grid; }
  .ti-find { display:grid; grid-template-columns:auto 1fr auto; gap:2px 10px; align-items:center; padding:9px 0; border-bottom:1px solid var(--v2-line); }
  .ti-find:last-child { border-bottom:0; }
  .ti-find-d { width:8px; height:8px; border-radius:50%; background:var(--v2-crit); grid-row:span 2; }
  .ti-find-acc { font-size:12.5px; color:var(--v2-fg); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .ti-find-when { font-size:11.5px; color:var(--v2-fg-3); text-align:right; grid-row:span 2; align-self:center; }
  .ti-find-meta { grid-column:2; font-size:11.5px; color:var(--v2-fg-3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

  .ti-tabs { display:inline-flex; padding:3px; gap:2px; background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:8px; }
  .ti-tabs button { display:inline-flex; align-items:center; gap:6px; border:0; background:transparent; padding:5px 14px; border-radius:5px; font-size:13px; color:var(--v2-fg-2); cursor:pointer; font-family:inherit; }
  .ti-tabs button[aria-pressed="true"] { background:var(--v2-surface-2); color:var(--v2-fg); font-weight:500; box-shadow:inset 0 0 0 1px var(--v2-line); }

  .ti-reveal { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:10px 12px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-surface-2); }
  .ti-reveal code { font-family:var(--font-data); font-size:13px; color:var(--v2-fg); word-break:break-all; flex:1; min-width:0; }
  .ti-reveal-note { font-size:11.5px; color:var(--v2-fg-3); }

  .ti-form { display:grid; gap:14px; }
  .ti-field { display:grid; gap:5px; }
  .ti-field > span { font-size:12.5px; color:var(--v2-fg-2); }
  .ti-field-row { display:grid; grid-template-columns:1fr 1fr 1fr; gap:10px; }
  @media (max-width: 560px) { .ti-field-row { grid-template-columns:1fr; } }
  .ti-input { height:34px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg); font:13px var(--font-ui); width:100%; }
  .ti-input:focus { outline:none; border-color:var(--v2-accent); }
  select.ti-input { height:34px; }
  .ti-check { display:flex; align-items:center; gap:8px; font-size:13px; color:var(--v2-fg-2); }

  .ti-cat-cards { display:grid; grid-template-columns:repeat(3, minmax(0,1fr)); gap:12px; }
  @media (max-width: 900px) { .ti-cat-cards { grid-template-columns:minmax(0,1fr); } }
  .ti-cat-card { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; padding:16px 18px; display:grid; gap:4px; align-content:start; min-width:0; }
  .ti-cat-head { display:flex; align-items:center; gap:8px; font-size:14px; }
  .ti-cat-dot { width:9px; height:9px; border-radius:50%; flex:none; }
  .ti-cat-num { font-size:28px; font-weight:600; letter-spacing:-0.02em; line-height:1.2; font-variant-numeric:tabular-nums; margin-top:4px; }
  .ti-cat-sub { font-size:12px; color:var(--v2-fg-3); margin-bottom:10px; }
  .ti-cat-bar { display:flex; height:7px; border-radius:4px; overflow:hidden; background:var(--v2-surface-2); margin-bottom:10px; }
  .ti-cat-bar i { display:block; height:100%; }
  .ti-cat-faixas { display:grid; grid-template-columns:repeat(4, minmax(0,1fr)); gap:6px; }
  .ti-cat-faixas > div { display:grid; gap:1px; }
  .ti-cat-faixas span { font:600 15px var(--font-data); font-variant-numeric:tabular-nums; }
  .ti-cat-faixas small { font-size:10px; color:var(--v2-fg-3); text-transform:uppercase; letter-spacing:0.03em; }

  .ti-pager { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; padding:12px 18px; border-top:1px solid var(--v2-line); font-size:12.5px; }
  .ti-pager-btns { display:flex; align-items:center; gap:10px; }

  .ti-corr { display:grid; gap:8px; }
  .ti-corr-row { display:flex; align-items:center; gap:10px; }
  .ti-corr-row > svg { color:var(--v2-fg-3); flex:none; }
  .ti-corr-row > div { display:grid; gap:1px; min-width:0; flex:1; }
  .ti-corr-row b { font-size:13.5px; }
  .ti-corr-row span { font-size:12px; color:var(--v2-fg-3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

  .ti-tl { display:grid; gap:0; }
  .ti-tl-item { position:relative; display:flex; gap:10px; padding:0 0 14px 2px; }
  .ti-tl-item:not(:last-child)::before { content:""; position:absolute; left:5.5px; top:14px; bottom:0; width:1px; background:var(--v2-line); }
  .ti-tl-dot { width:11px; height:11px; border-radius:50%; margin-top:2px; flex:none; box-shadow:0 0 0 3px var(--v2-surface); }
  .ti-tl-item > div { display:grid; gap:1px; }
  .ti-tl-item b { font-size:13px; font-weight:500; }
  .ti-tl-item small { font:11.5px var(--font-data); color:var(--v2-fg-3); }
  .ti-tl-motivo { margin:4px 0 0; font-size:12.5px; color:var(--v2-fg-2); white-space:pre-wrap; padding:6px 8px; border-left:2px solid var(--v2-line-strong); background:var(--v2-surface-2); border-radius:0 6px 6px 0; }

  .ti-steps { display:flex; align-items:center; gap:4px; flex-wrap:wrap; }
  .ti-step { display:inline-flex; align-items:center; gap:7px; padding:5px 10px; border-radius:8px; border:1px solid var(--v2-line); background:var(--v2-surface); }
  .ti-step-dot { width:20px; height:20px; border-radius:50%; display:grid; place-items:center; font:600 11px var(--font-data); background:var(--v2-surface-2); color:var(--v2-fg-3); flex:none; }
  .ti-step-lbl { font-size:12.5px; color:var(--v2-fg-3); white-space:nowrap; }
  .ti-step.current { border-color:var(--v2-accent); background:color-mix(in oklch, var(--v2-accent) 12%, var(--v2-surface)); }
  .ti-step.current .ti-step-dot { background:var(--v2-accent); color:var(--v2-accent-ink); }
  .ti-step.current .ti-step-lbl { color:var(--v2-fg); font-weight:600; }
  .ti-step.done .ti-step-dot { background:var(--v2-ok); color:var(--v2-accent-ink); }
  .ti-step.done .ti-step-lbl { color:var(--v2-fg-2); }
  .ti-step-line { flex:1 1 16px; min-width:12px; height:2px; border-radius:2px; background:var(--v2-line); }
  .ti-step-line.done { background:var(--v2-ok); }
  .ti-step-cancel { font:600 11px var(--font-data); color:var(--v2-crit); padding:4px 8px; border-radius:6px; background:color-mix(in oklch, var(--v2-crit) 12%, transparent); }
`;

function Kpi({
  label,
  valor,
  hint,
  hot,
}: {
  label: string;
  valor: string;
  hint?: string;
  hot?: boolean;
}) {
  return (
    <div className={`ti-kpi${hot ? " hot" : ""}`}>
      <span className="ti-kpi-label">{label}</span>
      <span className="ti-kpi-value">{valor}</span>
      {hint && <span className="ti-kpi-hint">{hint}</span>}
    </div>
  );
}

function Forca({ s }: { s: number | null }) {
  const f = forca(s);
  if (!f) return <span className="dim">—</span>;
  return (
    <span className="ti-str" title={`Pontuação ${s} no CTI`}>
      <span className="ti-str-bars" aria-hidden="true">
        {[0, 1, 2, 3].map((i) => (
          <i key={i} style={i <= f.nivel ? { background: f.cor } : undefined} />
        ))}
      </span>
      {f.rotulo}
    </span>
  );
}

function StatusPill({ s }: { s: LeakStatus }) {
  return (
    <span className="ti-pill" style={{ ["--c" as string]: STATUS[s].cor } as React.CSSProperties}>
      {STATUS[s].rotulo}
    </span>
  );
}

const TONE_COR: Record<string, string> = {
  ok: "var(--v2-ok)",
  warn: "var(--v2-high)",
  crit: "var(--v2-crit)",
  info: "var(--v2-accent)",
  neutral: "var(--v2-fg-3)",
};

const VALIDACAO: Record<string, { rotulo: string; cor: string }> = {
  valida: { rotulo: "Credencial válida", cor: "var(--v2-crit)" },
  invalida: { rotulo: "Não autentica", cor: "var(--v2-ok)" },
  inconclusiva: { rotulo: "Inconclusiva", cor: "var(--v2-fg-3)" },
};

function ValidacaoPill({ v }: { v: string | null }) {
  if (!v || !VALIDACAO[v]) return <span className="dim">—</span>;
  return (
    <span
      className="ti-pill"
      style={{ ["--c" as string]: VALIDACAO[v].cor } as React.CSSProperties}
    >
      {VALIDACAO[v].rotulo}
    </span>
  );
}

function SemanaTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: Record<string, number | string> }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="ti-tip">
      <b>{p.rotulo}</b>
      {CATEGORIAS.map((c) => (
        <span key={c.k}>
          {c.rotulo}: {nf.format(Number(p[c.k] ?? 0))}
        </span>
      ))}
    </div>
  );
}

// Início da semana (segunda-feira) em data local, formato AAAA-MM-DD
function inicioSemana(d: Date): string {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x.toISOString().slice(0, 10);
}

// Monta a série do gráfico a partir dos buckets semanais já agregados no banco.
// Cobre do primeiro período até hoje (inclusive os vazios) e re-agrega em meses
// quando o histórico passa de ~26 semanas, para não virar centenas de barras.
function buildSerie(rows: Array<{ period: string; category: string; n: number }>): {
  serie: Array<Record<string, number | string>>;
  granularidade: "semana" | "mes";
} {
  if (!rows.length) return { serie: [], granularidade: "semana" };
  const times = rows.map((r) => new Date(`${r.period}T00:00:00`).getTime());
  const primeiro = new Date(Math.min(...times));
  const hoje = new Date();
  const mensal = Math.floor((hoje.getTime() - primeiro.getTime()) / (7 * 86400_000)) > 26;

  const chave = (d: Date) => (mensal ? d.toISOString().slice(0, 7) : inicioSemana(d));
  const rotuloDe = (k: string) => {
    if (mensal) {
      const [y, m] = k.split("-");
      return `${m}/${y.slice(2)}`;
    }
    const [, m, d] = k.split("-");
    return `${d}/${m}`;
  };

  const out: Array<Record<string, number | string>> = [];
  const idx = new Map<string, number>();
  const cursor = mensal
    ? new Date(primeiro.getFullYear(), primeiro.getMonth(), 1)
    : new Date(`${inicioSemana(primeiro)}T00:00:00`);
  const limite = chave(hoje);
  for (let guard = 0; guard < 2000; guard++) {
    const k = chave(cursor);
    idx.set(k, out.length);
    out.push({ k, rotulo: rotuloDe(k), employees: 0, customers: 0, third_parties: 0 });
    if (k === limite) break;
    if (mensal) cursor.setMonth(cursor.getMonth() + 1);
    else cursor.setDate(cursor.getDate() + 7);
  }
  for (const r of rows) {
    const i = idx.get(chave(new Date(`${r.period}T00:00:00`)));
    if (
      i != null &&
      (r.category === "employees" || r.category === "customers" || r.category === "third_parties")
    ) {
      out[i][r.category] = Number(out[i][r.category]) + Number(r.n);
    }
  }
  return { serie: out, granularidade: mensal ? "mes" : "semana" };
}

// ── Aba Aplicações: allowlist de destinos de validação ──────────────────────
const APP_VAZIO: LeakApp = {
  id: "",
  name: "",
  host: "",
  login_url: "",
  method: "http_form",
  username_field: "username",
  password_field: "password",
  extra_fields: {},
  success_type: "status",
  success_value: "200",
  enabled: true,
};

function AplicacoesTab({ podeGerenciar }: { podeGerenciar: boolean }) {
  const qc = useQueryClient();
  const fetchApps = useServerFn(listLeakApps);
  const salvarFn = useServerFn(upsertLeakApp);
  const removerFn = useServerFn(deleteLeakApp);
  const { data, isLoading } = useQuery({
    queryKey: ["threat-intel-apps"],
    queryFn: () => fetchApps(),
  });
  const apps = data?.apps ?? [];
  const [editando, setEditando] = React.useState<LeakApp | null>(null);
  const [extraTexto, setExtraTexto] = React.useState("");

  const abrir = (a: LeakApp) => {
    setEditando(a);
    setExtraTexto(
      Object.entries(a.extra_fields ?? {})
        .map(([k, v]) => `${k}=${String(v)}`)
        .join("\n"),
    );
  };

  const salvar = useMutation({
    mutationFn: () => {
      if (!editando) throw new Error("nada a salvar");
      const extra_fields: Record<string, string> = {};
      for (const linha of extraTexto.split("\n")) {
        const i = linha.indexOf("=");
        if (i > 0) extra_fields[linha.slice(0, i).trim()] = linha.slice(i + 1).trim();
      }
      return salvarFn({
        data: {
          id: editando.id || null,
          name: editando.name,
          host: editando.host,
          login_url: editando.login_url,
          method: editando.method,
          username_field: editando.username_field,
          password_field: editando.password_field,
          extra_fields,
          success_type: editando.success_type,
          success_value: editando.success_value,
          enabled: editando.enabled,
        },
      });
    },
    onSuccess: () => {
      toast.success("Aplicação salva");
      setEditando(null);
      qc.invalidateQueries({ queryKey: ["threat-intel-apps"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remover = useMutation({
    mutationFn: (id: string) => removerFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Aplicação removida");
      setEditando(null);
      qc.invalidateQueries({ queryKey: ["threat-intel-apps"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const up = (patch: Partial<LeakApp>) => setEditando((e) => (e ? { ...e, ...patch } : e));

  return (
    <div className="ti-panel">
      <div className="ti-toolbar">
        <div className="ti-panel-title">
          Aplicações para validação{" "}
          <span className="dim" style={{ fontWeight: 400, fontSize: 13 }}>
            {apps.length}
          </span>
        </div>
        {podeGerenciar && (
          <button
            type="button"
            className="ti-btn sm pri"
            style={{ marginLeft: "auto" }}
            onClick={() => abrir(APP_VAZIO)}
          >
            <Plus size={14} /> Nova aplicação
          </button>
        )}
      </div>

      <div className="ti-note" style={{ margin: "12px 18px" }}>
        <ShieldCheck size={15} />
        <span>
          Cadastre apenas sistemas que você opera. A validação submete usuário e senha ao endpoint
          de login cadastrado — só isso autoriza o teste, e cada cadastro fica no log de auditoria.
          Provedores de identidade de terceiros (Microsoft, Google, GitHub…) são recusados: contas
          nesses serviços se validam pelo diretório.
        </span>
      </div>

      {isLoading ? (
        <div className="ti-empty">
          <div className="ti-empty-s">Carregando aplicações…</div>
        </div>
      ) : apps.length === 0 ? (
        <div className="ti-empty">
          <div className="ti-empty-t">Nenhuma aplicação cadastrada</div>
          <div className="ti-empty-s">
            Sem uma aplicação cadastrada, as credenciais ficam apenas informativas: o botão Validar
            só habilita quando a URL capturada bate com um host daqui.
          </div>
        </div>
      ) : (
        <div className="ti-scroll">
          <table className="ti-table">
            <thead>
              <tr>
                <th>Aplicação</th>
                <th>Host</th>
                <th>Método</th>
                <th>Sucesso</th>
                <th>Ativa</th>
                {podeGerenciar && <th></th>}
              </tr>
            </thead>
            <tbody>
              {apps.map((a) => (
                <tr key={a.id} tabIndex={0} onClick={() => podeGerenciar && abrir(a)}>
                  <td>{a.name}</td>
                  <td className="mono dim">{a.host}</td>
                  <td className="mono dim">{a.method === "http_json" ? "JSON" : "Form"}</td>
                  <td className="mono dim">
                    {a.success_type}: {a.success_value}
                  </td>
                  <td>
                    <span
                      className="ti-pill"
                      style={
                        {
                          ["--c" as string]: a.enabled ? "var(--v2-ok)" : "var(--v2-fg-3)",
                        } as React.CSSProperties
                      }
                    >
                      {a.enabled ? "Sim" : "Não"}
                    </span>
                  </td>
                  {podeGerenciar && (
                    <td style={{ textAlign: "right" }}>
                      <Pencil size={14} className="dim" />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <DetailSheet
        open={!!editando}
        onOpenChange={(o) => !o && setEditando(null)}
        eyebrow="aplicação de validação"
        title={editando?.id ? editando.name || "Editar aplicação" : "Nova aplicação"}
        footer={
          editando && (
            <>
              {editando.id && (
                <button
                  type="button"
                  className="ti-btn ghost"
                  onClick={() => remover.mutate(editando.id)}
                  disabled={remover.isPending}
                >
                  <Trash2 size={14} /> Remover
                </button>
              )}
              <button
                type="button"
                className="ti-btn pri"
                onClick={() => salvar.mutate()}
                disabled={salvar.isPending}
              >
                {salvar.isPending ? "Salvando…" : "Salvar"}
              </button>
            </>
          )
        }
      >
        {editando && (
          <div className="ti-root ti-sheet">
            <style>{CSS}</style>
            <div className="ti-form">
              <label className="ti-field">
                <span>Nome</span>
                <input
                  className="ti-input"
                  value={editando.name}
                  onChange={(e) => up({ name: e.target.value })}
                />
              </label>
              <label className="ti-field">
                <span>Host (bate com a URL capturada)</span>
                <input
                  className="ti-input mono"
                  value={editando.host}
                  placeholder="portal.bernoulli.com.br"
                  onChange={(e) => up({ host: e.target.value })}
                />
              </label>
              <label className="ti-field">
                <span>Endpoint de login (https, mesmo host)</span>
                <input
                  className="ti-input mono"
                  value={editando.login_url}
                  placeholder="https://portal.bernoulli.com.br/api/login"
                  onChange={(e) => up({ login_url: e.target.value })}
                />
              </label>
              <div className="ti-field-row">
                <label className="ti-field">
                  <span>Formato</span>
                  <select
                    className="ti-input"
                    value={editando.method}
                    onChange={(e) => up({ method: e.target.value as LeakApp["method"] })}
                  >
                    <option value="http_form">Formulário (urlencoded)</option>
                    <option value="http_json">JSON</option>
                  </select>
                </label>
                <label className="ti-field">
                  <span>Campo usuário</span>
                  <input
                    className="ti-input mono"
                    value={editando.username_field}
                    onChange={(e) => up({ username_field: e.target.value })}
                  />
                </label>
                <label className="ti-field">
                  <span>Campo senha</span>
                  <input
                    className="ti-input mono"
                    value={editando.password_field}
                    onChange={(e) => up({ password_field: e.target.value })}
                  />
                </label>
              </div>
              <label className="ti-field">
                <span>Campos extras (um por linha, chave=valor)</span>
                <textarea
                  className="ti-notes mono"
                  value={extraTexto}
                  placeholder="grant_type=password"
                  onChange={(e) => setExtraTexto(e.target.value)}
                />
              </label>
              <div className="ti-field-row">
                <label className="ti-field">
                  <span>Sinal de sucesso</span>
                  <select
                    className="ti-input"
                    value={editando.success_type}
                    onChange={(e) =>
                      up({ success_type: e.target.value as LeakApp["success_type"] })
                    }
                  >
                    <option value="status">Código HTTP</option>
                    <option value="body_contains">Corpo contém</option>
                    <option value="body_not_contains">Corpo NÃO contém</option>
                    <option value="json_field">Campo JSON presente</option>
                  </select>
                </label>
                <label className="ti-field">
                  <span>Valor</span>
                  <input
                    className="ti-input mono"
                    value={editando.success_value}
                    placeholder={editando.success_type === "status" ? "200" : "access_token"}
                    onChange={(e) => up({ success_value: e.target.value })}
                  />
                </label>
              </div>
              <label className="ti-check">
                <input
                  type="checkbox"
                  checked={editando.enabled}
                  onChange={(e) => up({ enabled: e.target.checked })}
                />
                <span>Ativa para validação</span>
              </label>
              {!podeGerenciar && <span className="dim">Você não pode editar aplicações.</span>}
            </div>
          </div>
        )}
      </DetailSheet>
    </div>
  );
}

// ── Aba Incidentes ──────────────────────────────────────────────────────────
const SEV: Record<string, { rotulo: string; cor: string }> = {
  baixa: { rotulo: "Baixa", cor: "var(--v2-fg-3)" },
  media: { rotulo: "Média", cor: "var(--v2-med)" },
  alta: { rotulo: "Alta", cor: "var(--v2-high)" },
  critica: { rotulo: "Crítica", cor: "var(--v2-crit)" },
};
const SEV_ORDEM = ["baixa", "media", "alta", "critica"] as const;
const INC_STATUS: Record<string, { rotulo: string; cor: string }> = {
  aberto: { rotulo: "Aberto", cor: "var(--v2-crit)" },
  em_andamento: { rotulo: "Em andamento", cor: "var(--v2-high)" },
  resolvido: { rotulo: "Resolvido", cor: "var(--v2-ok)" },
  cancelado: { rotulo: "Cancelado", cor: "var(--v2-fg-3)" },
};
const INC_STEPS = [
  { k: "aberto", rotulo: "Novo" },
  { k: "em_andamento", rotulo: "Em tratamento" },
  { k: "resolvido", rotulo: "Resolvido" },
] as const;
const CANAL_KIND: Record<string, string> = {
  email: "E-mail",
  teams: "Microsoft Teams",
  google_chat: "Google Chat",
  webhook: "Webhook (ITSM/genérico)",
};
const CANAL_VAZIO: IncidentChannel & { target: string } = {
  id: "",
  name: "",
  kind: "email",
  target: "",
  target_hint: "",
  min_severity: "alta",
  enabled: true,
};

function Pill({ map, k }: { map: Record<string, { rotulo: string; cor: string }>; k: string }) {
  const v = map[k];
  if (!v) return <span className="dim">—</span>;
  return (
    <span className="ti-pill" style={{ ["--c" as string]: v.cor } as React.CSSProperties}>
      {v.rotulo}
    </span>
  );
}

function IncidentStepper({ status }: { status: string }) {
  const cancel = status === "cancelado";
  const idx = cancel ? -1 : INC_STEPS.findIndex((s) => s.k === status);
  return (
    <div className="ti-steps">
      {INC_STEPS.map((s, i) => {
        const state = cancel ? "idle" : i < idx ? "done" : i === idx ? "current" : "idle";
        return (
          <React.Fragment key={s.k}>
            <div className={`ti-step ${state}`}>
              <span className="ti-step-dot">{state === "done" ? <Check size={12} /> : i + 1}</span>
              <span className="ti-step-lbl">{s.rotulo}</span>
            </div>
            {i < INC_STEPS.length - 1 && (
              <span className={`ti-step-line${!cancel && i < idx ? " done" : ""}`} />
            )}
          </React.Fragment>
        );
      })}
      {cancel && <span className="ti-step-cancel">Cancelado</span>}
    </div>
  );
}

function CanaisSheet({
  open,
  onOpenChange,
  podeGerenciar,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  podeGerenciar: boolean;
}) {
  const qc = useQueryClient();
  const fetchChannels = useServerFn(listIncidentChannels);
  const salvarFn = useServerFn(upsertIncidentChannel);
  const removerFn = useServerFn(deleteIncidentChannel);
  const testarFn = useServerFn(testIncidentChannel);
  const { data } = useQuery({
    queryKey: ["threat-intel-channels"],
    queryFn: () => fetchChannels(),
    enabled: open,
  });
  const channels = data?.channels ?? [];
  const [edit, setEdit] = React.useState<(IncidentChannel & { target: string }) | null>(null);

  const salvar = useMutation({
    mutationFn: () => {
      if (!edit) throw new Error("nada a salvar");
      return salvarFn({
        data: {
          id: edit.id || null,
          name: edit.name,
          kind: edit.kind,
          target: edit.target || null,
          min_severity: edit.min_severity,
          enabled: edit.enabled,
        },
      });
    },
    onSuccess: () => {
      toast.success("Canal salvo");
      setEdit(null);
      qc.invalidateQueries({ queryKey: ["threat-intel-channels"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remover = useMutation({
    mutationFn: (id: string) => removerFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Canal removido");
      setEdit(null);
      qc.invalidateQueries({ queryKey: ["threat-intel-channels"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const testar = useMutation({
    mutationFn: (id: string) => testarFn({ data: { id } }),
    onSuccess: (r) =>
      r.ok ? toast.success("Teste enviado") : toast.error(`Falha no teste: ${r.error}`),
    onError: (e: Error) => toast.error(e.message),
  });
  const up = (p: Partial<IncidentChannel & { target: string }>) =>
    setEdit((e) => (e ? { ...e, ...p } : e));

  return (
    <DetailSheet
      open={open}
      onOpenChange={onOpenChange}
      eyebrow="threat intelligence"
      title="Canais de alerta"
      footer={
        podeGerenciar && !edit ? (
          <button type="button" className="ti-btn pri" onClick={() => setEdit({ ...CANAL_VAZIO })}>
            <Plus size={14} /> Novo canal
          </button>
        ) : edit ? (
          <>
            {edit.id && (
              <button
                type="button"
                className="ti-btn ghost"
                onClick={() => remover.mutate(edit.id)}
                disabled={remover.isPending}
              >
                <Trash2 size={14} /> Remover
              </button>
            )}
            <button type="button" className="ti-btn" onClick={() => setEdit(null)}>
              Voltar
            </button>
            <button
              type="button"
              className="ti-btn pri"
              onClick={() => salvar.mutate()}
              disabled={salvar.isPending}
            >
              {salvar.isPending ? "Salvando…" : "Salvar"}
            </button>
          </>
        ) : null
      }
    >
      <div className="ti-root ti-sheet">
        <style>{CSS}</style>
        {edit ? (
          <div className="ti-form">
            <label className="ti-field">
              <span>Nome</span>
              <input
                className="ti-input"
                value={edit.name}
                onChange={(e) => up({ name: e.target.value })}
              />
            </label>
            <label className="ti-field">
              <span>Tipo</span>
              <select
                className="ti-input"
                value={edit.kind}
                onChange={(e) => up({ kind: e.target.value as IncidentChannel["kind"] })}
              >
                {Object.entries(CANAL_KIND).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
            <label className="ti-field">
              <span>{edit.kind === "email" ? "E-mail de destino" : "URL do webhook"}</span>
              <input
                className="ti-input mono"
                value={edit.target}
                placeholder={
                  edit.kind === "email"
                    ? "soc@empresa.com.br"
                    : edit.kind === "teams"
                      ? "https://….webhook.office.com/…"
                      : edit.kind === "google_chat"
                        ? "https://chat.googleapis.com/v1/spaces/…"
                        : "https://itsm.empresa.com.br/intake"
                }
                onChange={(e) => up({ target: e.target.value })}
              />
              {edit.id && (
                <span className="ti-reveal-note">Deixe em branco para manter o destino atual.</span>
              )}
            </label>
            <label className="ti-field">
              <span>Disparar a partir de</span>
              <select
                className="ti-input"
                value={edit.min_severity}
                onChange={(e) =>
                  up({ min_severity: e.target.value as IncidentChannel["min_severity"] })
                }
              >
                {SEV_ORDEM.map((s) => (
                  <option key={s} value={s}>
                    {SEV[s].rotulo}
                  </option>
                ))}
              </select>
            </label>
            <label className="ti-check">
              <input
                type="checkbox"
                checked={edit.enabled}
                onChange={(e) => up({ enabled: e.target.checked })}
              />
              <span>Ativo</span>
            </label>
            <div className="ti-reveal-note">
              Teams: Incoming Webhook do canal. Google Chat: webhook do espaço. Genérico: qualquer
              endpoint https (gancho para ITSM). A URL nunca volta para a tela depois de salva.
            </div>
          </div>
        ) : channels.length === 0 ? (
          <div className="ti-empty">
            <div className="ti-empty-t">Nenhum canal configurado</div>
            <div className="ti-empty-s">
              Sem canal, o incidente é só registrado. Cadastre e-mail ou webhook para disparar
              alerta.
            </div>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 8 }}>
            {channels.map((c) => (
              <div
                key={c.id}
                className="ti-corr-row"
                style={{
                  border: "1px solid var(--v2-line)",
                  borderRadius: 8,
                  padding: "10px 12px",
                }}
              >
                <Bell size={14} />
                <div>
                  <b>{c.name}</b>
                  <span>
                    {CANAL_KIND[c.kind]} · {c.target_hint} · ≥ {SEV[c.min_severity].rotulo}
                    {!c.enabled && " · inativo"}
                  </span>
                </div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button
                    type="button"
                    className="ti-btn sm ghost"
                    title="Testar"
                    onClick={() => testar.mutate(c.id)}
                    disabled={testar.isPending}
                  >
                    <Send size={13} />
                  </button>
                  {podeGerenciar && (
                    <button
                      type="button"
                      className="ti-btn sm ghost"
                      title="Editar"
                      onClick={() => setEdit({ ...c, target: "" })}
                    >
                      <Pencil size={13} />
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </DetailSheet>
  );
}

function IncidentesTab({
  podeTratar,
  podeGerenciar,
}: {
  podeTratar: boolean;
  podeGerenciar: boolean;
}) {
  const qc = useQueryClient();
  const fetchIncidents = useServerFn(listIncidents);
  const criarFn = useServerFn(createIncident);
  const atualizarFn = useServerFn(updateIncident);
  const { data, isLoading } = useQuery({
    queryKey: ["threat-intel-incidents"],
    queryFn: () => fetchIncidents(),
  });
  const incidents = data?.incidents ?? [];
  const [selId, setSelId] = React.useState<string | null>(null);
  const sel = incidents.find((i) => i.id === selId) ?? null;
  const [canais, setCanais] = React.useState(false);
  const [novo, setNovo] = React.useState<{
    title: string;
    severity: string;
    description: string;
  } | null>(null);

  // Mudança de incidente reflete na credencial (status) → invalida os dois.
  const invalidarTudo = () => {
    qc.invalidateQueries({ queryKey: ["threat-intel-incidents"] });
    qc.invalidateQueries({ queryKey: ["threat-intel-leaks"] });
    qc.invalidateQueries({ queryKey: ["threat-intel-status"] });
    qc.invalidateQueries({ queryKey: ["threat-intel-ctx"] });
  };

  const criar = useMutation({
    mutationFn: () =>
      criarFn({
        data: {
          title: novo!.title,
          severity: novo!.severity as "baixa" | "media" | "alta" | "critica",
          description: novo!.description || null,
        },
      }),
    onSuccess: (r) => {
      const falhas = r.dispatch.filter((d) => !d.ok).length;
      toast.success(
        `Incidente ${r.refCode} aberto${falhas ? ` · ${falhas} canal(is) falharam` : ""}`,
      );
      setNovo(null);
      invalidarTudo();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  // Fluxo de conclusão: anotação obrigatória do que foi feito.
  const [concluindo, setConcluindo] = React.useState(false);
  const [resolucao, setResolucao] = React.useState("");
  React.useEffect(() => {
    setConcluindo(false);
    setResolucao(sel?.resolution ?? "");
    // ao trocar de incidente
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selId]);

  const atualizar = useMutation({
    mutationFn: (p: {
      id: string;
      status?: string;
      external_ref?: string | null;
      resolution?: string | null;
    }) => atualizarFn({ data: p as never }),
    onSuccess: (_r, vars) => {
      toast.success(vars.status === "resolvido" ? "Incidente concluído" : "Incidente atualizado");
      setConcluindo(false);
      invalidarTudo();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="ti-panel">
      <div className="ti-toolbar">
        <div className="ti-panel-title">
          Incidentes{" "}
          <span className="dim" style={{ fontWeight: 400, fontSize: 13 }}>
            {incidents.length}
          </span>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button type="button" className="ti-btn sm" onClick={() => setCanais(true)}>
            <Bell size={14} /> Canais
          </button>
          {podeTratar && (
            <button
              type="button"
              className="ti-btn sm pri"
              onClick={() => setNovo({ title: "", severity: "alta", description: "" })}
            >
              <Plus size={14} /> Novo incidente
            </button>
          )}
        </div>
      </div>

      {isLoading ? (
        <div className="ti-empty">
          <div className="ti-empty-s">Carregando incidentes…</div>
        </div>
      ) : incidents.length === 0 ? (
        <div className="ti-empty">
          <div className="ti-empty-t">Nenhum incidente aberto</div>
          <div className="ti-empty-s">
            Abra um incidente a partir de uma credencial (botão no detalhe) ou aqui. Configure os
            canais para disparar alerta por e-mail e webhook.
          </div>
        </div>
      ) : (
        <div className="ti-scroll">
          <table className="ti-table">
            <thead>
              <tr>
                <th>Código</th>
                <th>Título</th>
                <th>Conta</th>
                <th>Severidade</th>
                <th>Status</th>
                <th>Aberto</th>
                <th>Alerta</th>
              </tr>
            </thead>
            <tbody>
              {incidents.map((i) => {
                const falhas = (i.last_notify ?? []).filter((d) => !d.ok).length;
                const oks = (i.last_notify ?? []).filter((d) => d.ok).length;
                return (
                  <tr key={i.id} tabIndex={0} onClick={() => setSelId(i.id)}>
                    <td className="mono" style={{ fontSize: 12.5 }}>
                      {i.ref_code}
                    </td>
                    <td>
                      <span className="ti-trunc">{i.title}</span>
                    </td>
                    <td>
                      <span className="ti-trunc mono dim">{i.account ?? "—"}</span>
                    </td>
                    <td>
                      <Pill map={SEV} k={i.severity} />
                    </td>
                    <td>
                      <Pill map={INC_STATUS} k={i.status} />
                    </td>
                    <td className="mono dim">{fmtRel(i.created_at)}</td>
                    <td className="mono dim" style={{ fontSize: 12 }}>
                      {i.notified_at ? (falhas ? `${oks} ok · ${falhas} falha` : `${oks} ok`) : "—"}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <CanaisSheet open={canais} onOpenChange={setCanais} podeGerenciar={podeGerenciar} />

      {/* Novo incidente manual */}
      <DetailSheet
        open={!!novo}
        onOpenChange={(o) => !o && setNovo(null)}
        eyebrow="threat intelligence"
        title="Novo incidente"
        footer={
          novo && (
            <button
              type="button"
              className="ti-btn pri"
              disabled={!novo.title.trim() || criar.isPending}
              onClick={() => criar.mutate()}
            >
              {criar.isPending ? "Abrindo…" : "Abrir e notificar"}
            </button>
          )
        }
      >
        {novo && (
          <div className="ti-root ti-sheet">
            <style>{CSS}</style>
            <div className="ti-form">
              <label className="ti-field">
                <span>Título</span>
                <input
                  className="ti-input"
                  value={novo.title}
                  onChange={(e) => setNovo({ ...novo, title: e.target.value })}
                />
              </label>
              <label className="ti-field">
                <span>Severidade</span>
                <select
                  className="ti-input"
                  value={novo.severity}
                  onChange={(e) => setNovo({ ...novo, severity: e.target.value })}
                >
                  {SEV_ORDEM.map((s) => (
                    <option key={s} value={s}>
                      {SEV[s].rotulo}
                    </option>
                  ))}
                </select>
              </label>
              <label className="ti-field">
                <span>Descrição</span>
                <textarea
                  className="ti-notes"
                  value={novo.description}
                  onChange={(e) => setNovo({ ...novo, description: e.target.value })}
                />
              </label>
            </div>
          </div>
        )}
      </DetailSheet>

      {/* Detalhe do incidente */}
      <DetailSheet
        open={!!sel}
        onOpenChange={(o) => !o && setSelId(null)}
        eyebrow={sel ? fmtData(sel.created_at) : null}
        title={sel?.title ?? ""}
        badges={
          sel && (
            <>
              <Pill map={SEV} k={sel.severity} />
              <Pill map={INC_STATUS} k={sel.status} />
            </>
          )
        }
      >
        {sel && (
          <div className="ti-root ti-sheet">
            <style>{CSS}</style>
            <DetailList
              items={[
                [
                  "Código de referência",
                  <span key="ref" className="ti-reveal" style={{ padding: "6px 10px" }}>
                    <code>{sel.ref_code}</code>
                    <button
                      type="button"
                      className="ti-btn sm ghost"
                      onClick={() =>
                        navigator.clipboard?.writeText(sel.ref_code).then(
                          () => toast.success("Código copiado"),
                          () => toast.error("Não foi possível copiar"),
                        )
                      }
                    >
                      <Copy size={13} /> Copiar
                    </button>
                  </span>,
                ],
                ["Conta", sel.account ?? <span className="dim">—</span>, true],
                [
                  "Categoria",
                  sel.category
                    ? (CATEGORIAS.find((c) => c.k === sel.category)?.rotulo ?? sel.category)
                    : "—",
                ],
                ["Aberto em", `${fmtData(sel.created_at)} · ${fmtRel(sel.created_at)}`],
                ["Notificado", sel.notified_at ? fmtRel(sel.notified_at) : "não"],
              ]}
            />
            {sel.description && (
              <DetailSection title="Descrição">
                <div style={{ fontSize: 13, color: "var(--v2-fg-2)", whiteSpace: "pre-wrap" }}>
                  {sel.description}
                </div>
              </DetailSection>
            )}
            {sel.last_notify && sel.last_notify.length > 0 && (
              <DetailSection title="Disparo do alerta">
                <div style={{ display: "grid", gap: 6 }}>
                  {sel.last_notify.map((d, i) => (
                    <div key={i} className="ti-corr-row">
                      {d.ok ? (
                        <Check size={14} style={{ color: "var(--v2-ok)" }} />
                      ) : (
                        <AlertTriangle size={14} style={{ color: "var(--v2-crit)" }} />
                      )}
                      <div>
                        <b>{d.channel}</b>
                        <span>
                          {CANAL_KIND[d.kind] ?? d.kind}
                          {d.error ? ` · ${d.error}` : " · enviado"}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </DetailSection>
            )}
            <DetailSection title="Workflow">
              <div style={{ display: "grid", gap: 14 }}>
                <IncidentStepper status={sel.status} />

                {sel.status === "cancelado" ? (
                  <span className="dim" style={{ fontSize: 13 }}>
                    Incidente cancelado — encerrado para preservar o log.
                  </span>
                ) : sel.status === "resolvido" ? (
                  <div style={{ display: "grid", gap: 8 }}>
                    <div className="ti-field">
                      <span>O que foi feito</span>
                      <div className="ti-caminho" style={{ whiteSpace: "pre-wrap" }}>
                        {sel.resolution || "—"}
                      </div>
                    </div>
                    <span className="dim" style={{ fontSize: 12 }}>
                      Concluído {sel.resolved_at ? fmtRel(sel.resolved_at) : ""} · encerrado para
                      preservar o log.
                    </span>
                  </div>
                ) : !podeTratar ? (
                  <span className="dim" style={{ fontSize: 12 }}>
                    Você não tem a permissão Tratar deste módulo.
                  </span>
                ) : sel.status === "aberto" ? (
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      type="button"
                      className="ti-btn pri"
                      disabled={atualizar.isPending}
                      onClick={() => atualizar.mutate({ id: sel.id, status: "em_andamento" })}
                    >
                      Iniciar tratamento
                    </button>
                    <button
                      type="button"
                      className="ti-btn ghost"
                      onClick={() => atualizar.mutate({ id: sel.id, status: "cancelado" })}
                    >
                      Cancelar incidente
                    </button>
                  </div>
                ) : (
                  // em_andamento
                  <div style={{ display: "grid", gap: 8 }}>
                    {concluindo ? (
                      <>
                        <label className="ti-field">
                          <span>O que foi feito (obrigatório)</span>
                          <textarea
                            className="ti-notes"
                            autoFocus
                            value={resolucao}
                            placeholder="Ex.: senha trocada no AD, sessões revogadas, colaborador avisado."
                            onChange={(e) => setResolucao(e.target.value)}
                          />
                        </label>
                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                          <button
                            type="button"
                            className="ti-btn pri"
                            disabled={!resolucao.trim() || atualizar.isPending}
                            onClick={() =>
                              atualizar.mutate({
                                id: sel.id,
                                status: "resolvido",
                                resolution: resolucao.trim(),
                              })
                            }
                          >
                            {atualizar.isPending ? "Concluindo…" : "Confirmar conclusão"}
                          </button>
                          <button
                            type="button"
                            className="ti-btn ghost"
                            onClick={() => setConcluindo(false)}
                          >
                            Voltar
                          </button>
                        </div>
                      </>
                    ) : (
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="ti-btn pri"
                          onClick={() => setConcluindo(true)}
                        >
                          <Check size={14} /> Concluir
                        </button>
                        <button
                          type="button"
                          className="ti-btn ghost"
                          onClick={() => atualizar.mutate({ id: sel.id, status: "cancelado" })}
                        >
                          Cancelar incidente
                        </button>
                      </div>
                    )}
                  </div>
                )}

                <label className="ti-field">
                  <span>Nº do chamado no ITSM (opcional)</span>
                  <input
                    className="ti-input mono"
                    defaultValue={sel.external_ref ?? ""}
                    placeholder="preenchido pelo ITSM, ex: INC0012345"
                    disabled={!podeTratar}
                    onBlur={(e) =>
                      e.target.value !== (sel.external_ref ?? "") &&
                      atualizar.mutate({ id: sel.id, external_ref: e.target.value })
                    }
                  />
                </label>
              </div>
            </DetailSection>
          </div>
        )}
      </DetailSheet>
    </div>
  );
}

// ── Aba Monitoramento ───────────────────────────────────────────────────────
const SCOPE_LABEL: Record<string, string> = {
  employees: "Colaboradores",
  customers: "Clientes",
  third_parties: "Terceiros",
  all: "Todas",
};
type MonitorEdit = Omit<MonitorRow, "last_run_at">;
const MONITOR_VAZIO: MonitorEdit = {
  id: "",
  name: "",
  scope_category: "employees",
  host: "",
  keyword: "",
  cond_senha_valida: false,
  cond_sem_mfa: false,
  open_incident: false,
  channel_ids: [],
  enabled: true,
};

function MonitoramentoTab({ podeTratar }: { podeTratar: boolean }) {
  const qc = useQueryClient();
  const fetchMonitors = useServerFn(listMonitors);
  const fetchRuns = useServerFn(listMonitorRuns);
  const fetchOverview = useServerFn(getMonitorOverview);
  const fetchChannels = useServerFn(listIncidentChannels);
  const salvarFn = useServerFn(upsertMonitor);
  const toggleFn = useServerFn(toggleMonitor);
  const removerFn = useServerFn(deleteMonitor);

  const { data: monData, isLoading } = useQuery({
    queryKey: ["cti-monitors"],
    queryFn: () => fetchMonitors(),
  });
  const { data: runData } = useQuery({
    queryKey: ["cti-monitor-runs"],
    queryFn: () => fetchRuns(),
  });
  const { data: ov } = useQuery({
    queryKey: ["cti-monitor-overview"],
    queryFn: () => fetchOverview(),
    refetchInterval: 60_000,
  });
  const { data: chData } = useQuery({
    queryKey: ["threat-intel-channels"],
    queryFn: () => fetchChannels(),
  });
  const monitors = monData?.monitors ?? [];
  const runs = runData?.runs ?? [];
  const channels = chData?.channels ?? [];
  const monNome = (id: string | null) => monitors.find((m) => m.id === id)?.name ?? "—";

  const [edit, setEdit] = React.useState<MonitorEdit | null>(null);
  const abrir = (m?: MonitorRow) =>
    setEdit(m ? { ...m, host: m.host ?? "", keyword: m.keyword ?? "" } : { ...MONITOR_VAZIO });

  const salvar = useMutation({
    mutationFn: () => {
      if (!edit) throw new Error("nada a salvar");
      return salvarFn({
        data: {
          id: edit.id || null,
          name: edit.name,
          scope_category: edit.scope_category,
          host: edit.host || null,
          keyword: edit.keyword || null,
          cond_senha_valida: edit.cond_senha_valida,
          cond_sem_mfa: edit.cond_sem_mfa,
          open_incident: edit.open_incident,
          channel_ids: edit.channel_ids,
          enabled: edit.enabled,
        },
      });
    },
    onSuccess: () => {
      toast.success("Monitor salvo");
      setEdit(null);
      qc.invalidateQueries({ queryKey: ["cti-monitors"] });
      qc.invalidateQueries({ queryKey: ["cti-monitor-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const remover = useMutation({
    mutationFn: (id: string) => removerFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Monitor removido");
      setEdit(null);
      qc.invalidateQueries({ queryKey: ["cti-monitors"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggle = useMutation({
    mutationFn: (p: { id: string; enabled: boolean }) => toggleFn({ data: p }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cti-monitors"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const up = (p: Partial<MonitorEdit>) => setEdit((e) => (e ? { ...e, ...p } : e));
  const toggleChan = (id: string) =>
    up({
      channel_ids: edit!.channel_ids.includes(id)
        ? edit!.channel_ids.filter((x) => x !== id)
        : [...edit!.channel_ids, id],
    });

  return (
    <>
      <div className="ti-kpis">
        <Kpi
          label="Monitores ativos"
          valor={nf.format(ov?.monitoresAtivos ?? 0)}
          hint={`de ${monitors.length} configurados`}
        />
        <Kpi
          label="Novos vazamentos (7 dias)"
          valor={nf.format(ov?.novos7 ?? 0)}
          hint="coletados na última semana"
          hot={(ov?.novos7 ?? 0) > 0}
        />
        <Kpi
          label="Canais de alerta"
          valor={nf.format(channels.length)}
          hint="e-mail · Teams · Google Chat · webhook"
        />
        <Kpi
          label="Última execução"
          valor={runs[0] ? fmtRel(runs[0].ran_at) : "—"}
          hint={runs[0] ? `${nf.format(runs[0].found)} novo(s)` : "nenhuma ainda"}
        />
      </div>

      <div className="ti-grid">
        <div className="ti-panel">
          <div className="ti-toolbar">
            <div className="ti-panel-title">
              Monitores{" "}
              <span className="dim" style={{ fontWeight: 400, fontSize: 13 }}>
                {monitors.length}
              </span>
            </div>
            {podeTratar && (
              <button
                type="button"
                className="ti-btn sm pri"
                style={{ marginLeft: "auto" }}
                onClick={() => abrir()}
              >
                <Plus size={14} /> Novo monitor
              </button>
            )}
          </div>
          {isLoading ? (
            <div className="ti-empty">
              <div className="ti-empty-s">Carregando monitores…</div>
            </div>
          ) : monitors.length === 0 ? (
            <div className="ti-empty">
              <div className="ti-empty-t">Nenhum monitor configurado</div>
              <div className="ti-empty-s">
                Crie um monitor para ser avisado quando surgir vazamento novo. Ative o cron{" "}
                <b>cti-monitor-run</b> para as verificações rodarem sozinhas.
              </div>
            </div>
          ) : (
            <div>
              {monitors.map((m) => (
                <div
                  key={m.id}
                  className="ti-mon"
                  tabIndex={0}
                  onClick={() => abrir(m)}
                  onKeyDown={(e) => e.key === "Enter" && abrir(m)}
                >
                  <div className="ti-mon-main">
                    <div className="ti-mon-t">
                      <b>{m.name}</b>
                      <span className="ti-scope">{SCOPE_LABEL[m.scope_category]}</span>
                      {m.open_incident && <span className="ti-scope">abre incidente</span>}
                    </div>
                    <span className="ti-mon-sub">
                      {[
                        m.host,
                        m.keyword && `"${m.keyword}"`,
                        m.cond_senha_valida && "senha válida no AD",
                        m.cond_sem_mfa && "sem MFA",
                        m.channel_ids.length
                          ? `${m.channel_ids.length} canal(is)`
                          : "todos os canais",
                        m.last_run_at ? `rodou ${fmtRel(m.last_run_at)}` : "ainda não rodou",
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </div>
                  <button
                    type="button"
                    className={`ti-sw${m.enabled ? " on" : ""}`}
                    role="switch"
                    aria-checked={m.enabled}
                    aria-label="Ativo"
                    disabled={!podeTratar || toggle.isPending}
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle.mutate({ id: m.id, enabled: !m.enabled });
                    }}
                  />
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="ti-panel">
          <div className="ti-panel-hdr" style={{ padding: "14px 18px" }}>
            <h2 className="ti-panel-title">Novidades</h2>
            <p className="ti-panel-sub">Vazamentos coletados recentemente</p>
          </div>
          <div className="ti-panel-body" style={{ paddingTop: 0 }}>
            {(ov?.novidades ?? []).length === 0 ? (
              <div className="dim" style={{ fontSize: 13 }}>
                Nada novo. As novidades aparecem conforme a coleta encontra vazamentos.
              </div>
            ) : (
              <div className="ti-feed">
                {(ov?.novidades ?? []).map((n) => (
                  <div className="ti-find" key={n.id}>
                    <span className="ti-find-d" />
                    <span className="ti-find-acc mono">{n.username ?? n.url_host ?? "—"}</span>
                    <span className="ti-find-when mono">{fmtRel(n.first_seen_at)}</span>
                    <span className="ti-find-meta">
                      {SCOPE_LABEL[n.category] ?? n.category}
                      {n.url_host ? ` · ${n.url_host}` : ""}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="ti-panel">
        <div className="ti-panel-hdr" style={{ padding: "14px 18px" }}>
          <h2 className="ti-panel-title">Execuções recentes</h2>
          <p className="ti-panel-sub">Histórico das verificações de monitoramento</p>
        </div>
        {runs.length === 0 ? (
          <div className="ti-empty">
            <div className="ti-empty-s">
              Nenhuma execução ainda. Rode o Sincronizar do cti-monitor-run.
            </div>
          </div>
        ) : (
          <div className="ti-scroll">
            <table className="ti-table">
              <thead>
                <tr>
                  <th>Quando</th>
                  <th>Monitor</th>
                  <th>Verificados</th>
                  <th>Novos</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr key={r.id}>
                    <td className="mono dim">{fmtRel(r.ran_at)}</td>
                    <td>{monNome(r.monitor_id)}</td>
                    <td className="mono num dim">{nf.format(r.checked)}</td>
                    <td
                      className="mono num"
                      style={{
                        color: r.found > 0 ? "var(--v2-crit)" : "var(--v2-fg-3)",
                        fontWeight: r.found > 0 ? 600 : 400,
                      }}
                    >
                      {nf.format(r.found)}
                    </td>
                    <td title={r.detail ?? undefined}>
                      <span
                        className="ti-pill"
                        style={
                          {
                            ["--c" as string]:
                              r.status === "ok" ? "var(--v2-ok)" : "var(--v2-crit)",
                          } as React.CSSProperties
                        }
                      >
                        {r.status === "ok" ? "Concluída" : "Erro"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Criar/editar monitor */}
      <DetailSheet
        open={!!edit}
        onOpenChange={(o) => !o && setEdit(null)}
        width={520}
        eyebrow="monitoramento"
        title={edit?.id ? edit.name || "Editar monitor" : "Novo monitor"}
        footer={
          edit &&
          podeTratar && (
            <>
              {edit.id && (
                <button
                  type="button"
                  className="ti-btn ghost"
                  onClick={() => remover.mutate(edit.id)}
                  disabled={remover.isPending}
                >
                  <Trash2 size={14} /> Remover
                </button>
              )}
              <button
                type="button"
                className="ti-btn pri"
                onClick={() => salvar.mutate()}
                disabled={salvar.isPending}
              >
                {salvar.isPending ? "Salvando…" : "Salvar monitor"}
              </button>
            </>
          )
        }
      >
        {edit && (
          <div className="ti-root ti-sheet">
            <style>{CSS}</style>
            <div className="ti-form">
              <label className="ti-field">
                <span>Nome</span>
                <input
                  className="ti-input"
                  value={edit.name}
                  onChange={(e) => up({ name: e.target.value })}
                />
              </label>
              <label className="ti-field">
                <span>Escopo</span>
                <select
                  className="ti-input"
                  value={edit.scope_category}
                  onChange={(e) =>
                    up({ scope_category: e.target.value as MonitorEdit["scope_category"] })
                  }
                >
                  <option value="employees">Colaboradores</option>
                  <option value="customers">Clientes</option>
                  <option value="third_parties">Terceiros</option>
                  <option value="all">Todas as categorias</option>
                </select>
              </label>
              <label className="ti-field">
                <span>Filtrar por site (opcional)</span>
                <input
                  className="ti-input mono"
                  value={edit.host ?? ""}
                  placeholder="portal.homepaim.com.br"
                  onChange={(e) => up({ host: e.target.value })}
                />
              </label>
              <label className="ti-field">
                <span>Filtrar por termo (opcional)</span>
                <input
                  className="ti-input mono"
                  value={edit.keyword ?? ""}
                  placeholder="homepaim, diretoria…"
                  onChange={(e) => up({ keyword: e.target.value })}
                />
              </label>
              <div className="ti-field">
                <span>Avisar quando</span>
                <div className="ti-status-opts">
                  <span className="ti-chip" data-readonly="1" aria-current="true">
                    Surgir vazamento novo
                  </span>
                  <button
                    type="button"
                    className="ti-chip"
                    aria-pressed={edit.cond_senha_valida}
                    onClick={() => up({ cond_senha_valida: !edit.cond_senha_valida })}
                  >
                    Senha ainda válida no AD
                  </button>
                  <button
                    type="button"
                    className="ti-chip"
                    aria-pressed={edit.cond_sem_mfa}
                    onClick={() => up({ cond_sem_mfa: !edit.cond_sem_mfa })}
                  >
                    Conta sem MFA
                  </button>
                </div>
              </div>
              <div className="ti-field">
                <span>
                  Canais de alerta {edit.channel_ids.length === 0 && "(todos habilitados)"}
                </span>
                {channels.length === 0 ? (
                  <span className="dim" style={{ fontSize: 12 }}>
                    Nenhum canal cadastrado. Configure em Incidentes → Canais.
                  </span>
                ) : (
                  <div className="ti-status-opts">
                    {channels.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        className="ti-chip"
                        aria-pressed={edit.channel_ids.includes(c.id)}
                        onClick={() => toggleChan(c.id)}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <label className="ti-check">
                <input
                  type="checkbox"
                  checked={edit.open_incident}
                  onChange={(e) => up({ open_incident: e.target.checked })}
                />
                <span>Abrir incidente automaticamente ao encontrar</span>
              </label>
              <label className="ti-check">
                <input
                  type="checkbox"
                  checked={edit.enabled}
                  onChange={(e) => up({ enabled: e.target.checked })}
                />
                <span>Monitor ativo</span>
              </label>
              <div className="ti-note">
                <Info size={15} />
                <span>
                  A cada execução, compara com a rodada anterior e alerta só o que é novo.
                  Reaproveita a coleta do CTI, o cruzamento com o AD e os canais de alerta.
                </span>
              </div>
            </div>
          </div>
        )}
      </DetailSheet>
    </>
  );
}

export function ThreatIntelDashboard() {
  const qc = useQueryClient();
  const { can, isModuleAdmin } = usePermissions();
  const podeTratar = can(MODULE, "edit");
  const podeDesbloquear = can(MODULE, "execute");
  const podeGerenciarApps = isModuleAdmin(MODULE);
  const [aba, setAba] = React.useState<
    "credenciais" | "incidentes" | "monitoramento" | "aplicacoes"
  >("credenciais");

  const fetchLeaks = useServerFn(listLeaks);
  const fetchStatus = useServerFn(getThreatIntelSyncStatus);
  const fetchConta = useServerFn(getLeakRadarAccountInfo);
  const salvarStatusFn = useServerFn(updateLeakStatus);
  const desbloquearFn = useServerFn(unlockLeaks);
  const revelarFn = useServerFn(revealLeakPassword);
  const validarFn = useServerFn(validateLeak);

  // ── Filtros e paginação (tabela paginada no servidor) ──────────────────────
  const PAGE_SIZE = 100;
  const [categoria, setCategoria] = React.useState<CategoriaKey>("employees");
  const [status, setStatus] = React.useState<LeakStatus | null>(null);
  const [host, setHost] = React.useState<string | null>(null);
  const [busca, setBusca] = React.useState("");
  const [buscaDeb, setBuscaDeb] = React.useState("");
  const [adRisk, setAdRisk] = React.useState(false);
  const [validacao, setValidacao] = React.useState<"valida" | "invalida" | "inconclusiva" | null>(
    null,
  );
  const [page, setPage] = React.useState(1);
  const [selId, setSelId] = React.useState<string | null>(null);
  const tabelaRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const t = setTimeout(() => setBuscaDeb(busca.trim()), 400);
    return () => clearTimeout(t);
  }, [busca]);
  React.useEffect(() => setPage(1), [categoria, status, host, buscaDeb, adRisk, validacao]);

  const { data, isLoading, isFetching, isError, error, refetch } = useQuery({
    queryKey: ["threat-intel-leaks", categoria, status, host, buscaDeb, adRisk, validacao, page],
    queryFn: () =>
      fetchLeaks({
        data: {
          category: categoria,
          status: status ?? undefined,
          host: host ?? undefined,
          search: buscaDeb || undefined,
          adRisk: adRisk || undefined,
          validation: validacao ?? undefined,
          page,
          pageSize: PAGE_SIZE,
        },
      }),
    placeholderData: (prev) => prev,
  });
  const leaks = React.useMemo(() => data?.leaks ?? [], [data]);
  const totalFiltrado = data?.total ?? 0;
  const totalPaginas = Math.max(1, Math.ceil(totalFiltrado / PAGE_SIZE));
  const selected = React.useMemo(() => leaks.find((l) => l.id === selId) ?? null, [leaks, selId]);

  const { data: sync } = useQuery({
    queryKey: ["threat-intel-sync"],
    queryFn: () => fetchStatus(),
    refetchInterval: 60_000,
  });
  const fetchApps = useServerFn(listLeakApps);
  const { data: appsData } = useQuery({
    queryKey: ["threat-intel-apps"],
    queryFn: () => fetchApps(),
  });
  const hostsValidaveis = React.useMemo(
    () => new Set((appsData?.apps ?? []).filter((a) => a.enabled).map((a) => a.host)),
    [appsData],
  );
  // Hosts de login Microsoft: validáveis pelo próprio tenant (ROPC), sem cadastro.
  const MS_HOSTS = [
    "login.microsoftonline.com",
    "login.microsoft.com",
    "login.windows.net",
    "login.live.com",
    "sts.windows.net",
  ];
  const ehMicrosoft = (h: string | null) =>
    !!h && MS_HOSTS.some((d) => h.toLowerCase() === d || h.toLowerCase().endsWith(`.${d}`));
  const podeValidar = (h: string | null) => !!h && (hostsValidaveis.has(h) || ehMicrosoft(h));

  // Agregações no servidor (não carregam linhas): série, top hosts e contagem
  // de status. Tudo o mais que escala com o tamanho do domínio sai daqui.
  const fetchSeries = useServerFn(getLeakTimeseries);
  const { data: tsData, error: tsError } = useQuery({
    queryKey: ["threat-intel-ts"],
    queryFn: () => fetchSeries({ data: { bucket: "week" } }),
  });
  const { serie, granularidade } = React.useMemo(() => buildSerie(tsData?.rows ?? []), [tsData]);

  const fetchHosts = useServerFn(getTopHosts);
  const { data: hostsData, error: hostsError } = useQuery({
    queryKey: ["threat-intel-hosts", categoria],
    queryFn: () => fetchHosts({ data: { category: categoria } }),
  });
  const hosts = React.useMemo(
    () => (hostsData?.hosts ?? []).map((h) => ({ h: h.url_host, qtd: h.n })),
    [hostsData],
  );

  const fetchStatusCounts = useServerFn(getStatusCounts);
  const { data: statusData } = useQuery({
    queryKey: ["threat-intel-status"],
    queryFn: () => fetchStatusCounts(),
  });

  const fetchAdAlert = useServerFn(getThreatIntelAdAlert);
  const { data: adAlert } = useQuery({
    queryKey: ["threat-intel-ad"],
    queryFn: () => fetchAdAlert(),
    refetchInterval: 5 * 60_000,
  });
  const statusCounts = React.useMemo(() => {
    let pendentesColab = 0;
    let resolvidas = 0;
    for (const r of statusData?.rows ?? []) {
      if (r.category === "employees" && r.status === "novo") pendentesColab += r.n;
      if (r.status === "resolvido") resolvidas += r.n;
    }
    return { pendentesColab, resolvidas };
  }, [statusData]);

  const foraDaColeta = React.useMemo(() => {
    let total = 0;
    let coletado = 0;
    for (const porCat of Object.values(sync?.totals ?? {})) {
      for (const t of Object.values(porCat)) {
        total += t.total;
        coletado += t.collected;
      }
    }
    return total > coletado ? { total, coletado } : null;
  }, [sync]);
  const dominios = Object.keys(sync?.totals ?? {});

  // Totais oficiais do relatório do LeakRadar (contas comprometidas e força da
  // senha por categoria), somados entre os domínios. É a mesma contagem da tela
  // do LeakRadar — independe de quantas linhas a coleta trouxe para a tabela.
  const relatorio = React.useMemo(() => {
    const r = sync?.report;
    if (!r) return null;
    const vazia = () => ({ comp: 0, strong: 0, medium: 0, weak: 0, too_weak: 0, total: 0 });
    const base: Record<CategoriaKey, ReturnType<typeof vazia>> = {
      employees: vazia(),
      customers: vazia(),
      third_parties: vazia(),
    };
    const soma = (
      alvo: ReturnType<typeof vazia>,
      comp: number | undefined,
      pw:
        | {
            total_pass?: number;
            strong?: { qty?: number };
            medium?: { qty?: number };
            weak?: { qty?: number };
            too_weak?: { qty?: number };
          }
        | undefined,
    ) => {
      alvo.comp += comp ?? 0;
      alvo.strong += pw?.strong?.qty ?? 0;
      alvo.medium += pw?.medium?.qty ?? 0;
      alvo.weak += pw?.weak?.qty ?? 0;
      alvo.too_weak += pw?.too_weak?.qty ?? 0;
      alvo.total += pw?.total_pass ?? 0;
    };
    for (const dom of Object.values(r)) {
      soma(base.employees, dom.employees_compromised, dom.employee_passwords);
      soma(base.customers, dom.customers_compromised, dom.customer_passwords);
      soma(base.third_parties, dom.third_parties_compromised, dom.third_parties_passwords);
    }
    return base;
  }, [sync]);

  // Contagem por categoria: usa o relatório oficial quando há; senão, o coletado.
  const contaCategoria = (c: CategoriaKey) => relatorio?.[c].comp ?? 0;
  const totalExposto = relatorio
    ? relatorio.employees.comp + relatorio.customers.comp + relatorio.third_parties.comp
    : totalFiltrado;

  const limpar = () => {
    setStatus(null);
    setHost(null);
    setBusca("");
    setAdRisk(false);
    setValidacao(null);
  };

  // ── Detalhe: tratamento e desbloqueio ──────────────────────────────────────
  const [confirmando, setConfirmando] = React.useState(false);
  // Marcador em confirmação (risco aceito / falso positivo) + motivo obrigatório.
  const [marcadorPara, setMarcadorPara] = React.useState<LeakStatus | null>(null);
  const [motivo, setMotivo] = React.useState("");
  React.useEffect(() => {
    if (!selected) return;
    setConfirmando(false);
    setMarcadorPara(null);
    setMotivo("");
    // só ao trocar de item
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const { data: conta } = useQuery({
    queryKey: ["threat-intel-conta"],
    queryFn: () => fetchConta(),
    enabled: confirmando && podeDesbloquear,
    staleTime: 60_000,
  });

  const fetchCtx = useServerFn(getLeakContext);
  const { data: ctxData } = useQuery({
    queryKey: ["threat-intel-ctx", selId],
    queryFn: () => fetchCtx({ data: { id: selId as string } }),
    enabled: !!selId,
    staleTime: 60_000,
  });

  // Marcadores da credencial (risco aceito / falso positivo). Clicar aplica na
  // hora; clicar no ativo volta para "novo". Novo/Em tratamento/Resolvido são só
  // indicadores (seguem o incidente).
  const marcar = useMutation({
    mutationFn: (p: { id: string; status: LeakStatus; notes?: string }) =>
      salvarStatusFn({ data: p }),
    onSuccess: () => {
      toast.success("Marcador aplicado");
      setMarcadorPara(null);
      setMotivo("");
      qc.invalidateQueries({ queryKey: ["threat-intel-leaks"] });
      qc.invalidateQueries({ queryKey: ["threat-intel-status"] });
      qc.invalidateQueries({ queryKey: ["threat-intel-ctx"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const desbloquear = useMutation({
    mutationFn: (l: LeakRow) => desbloquearFn({ data: { ids: [l.id] } }),
    onSuccess: (r) => {
      setConfirmando(false);
      if (r.unlocked > 0) toast.success("Credencial desbloqueada");
      else toast.warning("O CTI não desbloqueou este item");
      qc.invalidateQueries({ queryKey: ["threat-intel-leaks"] });
      qc.invalidateQueries({ queryKey: ["threat-intel-conta"] });
      qc.invalidateQueries({ queryKey: ["threat-intel-ctx"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Senha revelada: só em memória no cliente, nunca persistida. Esconde sozinha.
  const [senha, setSenha] = React.useState<string | null>(null);
  React.useEffect(() => {
    setSenha(null);
  }, [selected?.id]);
  React.useEffect(() => {
    if (senha == null) return;
    const t = setTimeout(() => setSenha(null), 30_000);
    return () => clearTimeout(t);
  }, [senha]);

  const revelar = useMutation({
    mutationFn: (l: LeakRow) => revelarFn({ data: { id: l.id } }),
    onSuccess: (r) => {
      if (r.password) setSenha(r.password);
      else toast.warning("O CTI não retornou a senha deste item.");
      qc.invalidateQueries({ queryKey: ["threat-intel-leaks"] });
      qc.invalidateQueries({ queryKey: ["threat-intel-ctx"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const validar = useMutation({
    mutationFn: (l: LeakRow) => validarFn({ data: { id: l.id } }),
    onSuccess: (r) => {
      const msg =
        r.status === "valida"
          ? "Credencial válida — acione o time de resposta"
          : r.status === "invalida"
            ? "A credencial não autentica mais"
            : "Validação inconclusiva";
      (r.status === "valida"
        ? toast.error
        : r.status === "invalida"
          ? toast.success
          : toast.warning)(msg);
      qc.invalidateQueries({ queryKey: ["threat-intel-leaks"] });
      qc.invalidateQueries({ queryKey: ["threat-intel-ctx"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Validação/marcação manual (contas não auto-validáveis). Exige justificativa.
  const [manual, setManual] = React.useState<"valida" | "invalida" | "inconclusiva" | null>(null);
  const [manualNota, setManualNota] = React.useState("");
  React.useEffect(() => {
    setManual(null);
    setManualNota("");
  }, [selId]);
  const marcarManualFn = useServerFn(setLeakValidationManual);
  const marcarManual = useMutation({
    mutationFn: (l: LeakRow) =>
      marcarManualFn({ data: { id: l.id, status: manual!, note: manualNota.trim() } }),
    onSuccess: () => {
      toast.success("Validação registrada manualmente");
      setManual(null);
      setManualNota("");
      qc.invalidateQueries({ queryKey: ["threat-intel-leaks"] });
      qc.invalidateQueries({ queryKey: ["threat-intel-ctx"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const criarIncidenteFn = useServerFn(createIncident);
  const abrirIncidente = useMutation({
    mutationFn: (l: LeakRow) =>
      criarIncidenteFn({
        data: {
          leakId: l.id,
          title: `Credencial vazada: ${l.username ?? l.domain}`,
          severity: l.validation_status === "valida" ? "critica" : "alta",
          description: `Credencial de ${CATEGORIAS.find((c) => c.k === l.category)?.rotulo ?? l.category} exposta no CTI${l.url_host ? ` (login em ${l.url_host})` : ""}.${l.validation_status === "valida" ? " Validada: ainda autentica." : ""}`,
        },
      }),
    onSuccess: (r) => {
      const falhas = r.dispatch.filter((d) => !d.ok).length;
      toast.success(
        `Incidente ${r.refCode} aberto${falhas ? ` · ${falhas} canal(is) falharam` : " e notificado"}`,
      );
      setSelId(null);
      setAba("incidentes");
      qc.invalidateQueries({ queryKey: ["threat-intel-incidents"] });
      qc.invalidateQueries({ queryKey: ["threat-intel-leaks"] });
      qc.invalidateQueries({ queryKey: ["threat-intel-status"] });
      qc.invalidateQueries({ queryKey: ["threat-intel-ctx"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const semDados = !isLoading && !isError && leaks.length === 0;
  const catRotulo = CATEGORIAS.find((c) => c.k === categoria)!.rotulo;

  return (
    <div className="ti-root">
      <style>{CSS}</style>

      <div className="ti-ph">
        <div>
          <h1 className="ti-ph-title">Threat Intelligence</h1>
          <p className="ti-ph-sub">
            <span className="ti-live">Coletado {fmtRel(sync?.lastSync ?? null)}</span>
            <span>·</span>
            <span>
              CTI · credenciais vazadas
              {dominios.length > 0 && ` de ${dominios.join(", ")}`}
            </span>
          </p>
        </div>
        <SyncActions
          moduleSlug={MODULE}
          jobs={["leakradar-sync"]}
          onSynced={() => {
            qc.invalidateQueries({ queryKey: ["threat-intel-leaks"] });
            qc.invalidateQueries({ queryKey: ["threat-intel-sync"] });
          }}
        >
          <div className="ti-tabs" role="group" aria-label="Seção">
            <button
              type="button"
              aria-pressed={aba === "credenciais"}
              onClick={() => setAba("credenciais")}
            >
              Credenciais
            </button>
            <button
              type="button"
              aria-pressed={aba === "incidentes"}
              onClick={() => setAba("incidentes")}
            >
              <Bell size={14} /> Incidentes
            </button>
            <button
              type="button"
              aria-pressed={aba === "monitoramento"}
              onClick={() => setAba("monitoramento")}
            >
              <Radar size={14} /> Monitoramento
            </button>
            <button
              type="button"
              aria-pressed={aba === "aplicacoes"}
              onClick={() => setAba("aplicacoes")}
            >
              <ShieldCheck size={14} /> Aplicações
            </button>
          </div>
        </SyncActions>
      </div>

      {aba === "credenciais" && adAlert && adAlert.emRisco > 0 && (
        <button
          type="button"
          className="ti-alert"
          onClick={() => {
            setCategoria("employees");
            setStatus(null);
            setHost(null);
            setBusca("");
            setAdRisk(true);
            setTimeout(
              () => tabelaRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
              60,
            );
          }}
        >
          <span className="ti-alert-ic">
            <AlertTriangle size={18} />
          </span>
          <span className="ti-alert-tx">
            <b>
              {nf.format(adAlert.emRisco)}{" "}
              {adAlert.emRisco === 1
                ? "conta com senha vazada ainda válida"
                : "contas com senha vazada ainda válida"}
            </b>
            <span>
              Senha não trocada no AD desde o vazamento
              {adAlert.semMfa > 0 && ` · ${nf.format(adAlert.semMfa)} sem MFA`}
              {adAlert.semDados > 0 && ` · ${nf.format(adAlert.semDados)} não verificadas no AD`}
            </span>
          </span>
          <span className="ti-alert-cta">Ver colaboradores →</span>
        </button>
      )}
      {aba === "credenciais" && adAlert && adAlert.emRisco === 0 && adAlert.lastSync === null && (
        <div className="ti-note">
          <Info size={15} />
          <span>
            Cruzamento com o AD ainda não feito. Ative o cron <b>ad-status-sync</b> (usa o app do
            SSO por padrão, ou um app dedicado em Integrações → Entra ID) para destacar contas com
            senha vazada ainda válida e sem MFA.
          </span>
        </div>
      )}

      {aba === "aplicacoes" ? (
        <AplicacoesTab podeGerenciar={podeGerenciarApps} />
      ) : aba === "incidentes" ? (
        <IncidentesTab podeTratar={podeTratar} podeGerenciar={podeGerenciarApps} />
      ) : aba === "monitoramento" ? (
        <MonitoramentoTab podeTratar={podeTratar} />
      ) : isError ? (
        <div className="ti-panel">
          <div className="ti-empty">
            <div className="ti-empty-t">Não foi possível carregar as credenciais</div>
            <div className="ti-empty-s">{(error as Error)?.message}</div>
            <button type="button" className="ti-btn sm" onClick={() => refetch()}>
              Tentar de novo
            </button>
          </div>
        </div>
      ) : semDados ? (
        <div className="ti-panel">
          <div className="ti-empty">
            <div className="ti-empty-t">Nenhuma credencial coletada ainda</div>
            <div className="ti-empty-s">
              Configure a API key e os domínios da fonte CTI e ative o cron de coleta. As
              credenciais aparecem aqui depois da primeira coleta.
            </div>
            <div className="ti-caminho">Integrações → CTI · Cron Jobs → leakradar-sync</div>
          </div>
        </div>
      ) : (
        <>
          <div className="ti-kpis">
            <Kpi
              label="Credenciais expostas"
              valor={isLoading ? "…" : nf.format(totalExposto)}
              hint={relatorio ? "contas comprometidas (relatório CTI)" : "contas comprometidas"}
            />
            <Kpi
              label="Colaboradores expostos"
              valor={isLoading ? "…" : nf.format(contaCategoria("employees"))}
              hint="contas de colaboradores comprometidas"
              hot={contaCategoria("employees") > 0}
            />
            <Kpi
              label="Colaboradores sem tratamento"
              valor={nf.format(statusCounts.pendentesColab)}
              hint="credenciais de colaboradores com status Novo"
            />
            <Kpi
              label="Senhas fracas (colab.)"
              valor={
                relatorio && relatorio.employees.total
                  ? `${Math.round(((relatorio.employees.too_weak + relatorio.employees.weak) / relatorio.employees.total) * 100)}%`
                  : "n/d"
              }
              hint="muito fracas ou fracas"
            />
            <Kpi
              label="Resolvidas"
              valor={nf.format(statusCounts.resolvidas)}
              hint="credenciais marcadas como resolvidas"
            />
          </div>

          {relatorio && (
            <div className="ti-cat-cards">
              {CATEGORIAS.map((c) => {
                const r = relatorio[c.k];
                const faixas = [
                  { k: "strong", rotulo: "Forte", qtd: r.strong, cor: "var(--v2-ok)" },
                  { k: "medium", rotulo: "Média", qtd: r.medium, cor: "var(--v2-med)" },
                  { k: "weak", rotulo: "Fraca", qtd: r.weak, cor: "var(--v2-low)" },
                  { k: "too_weak", rotulo: "Muito fraca", qtd: r.too_weak, cor: "var(--v2-crit)" },
                ];
                return (
                  <div className="ti-cat-card" key={c.k}>
                    <div className="ti-cat-head">
                      <span className="ti-cat-dot" style={{ background: c.cor }} />
                      <b>{c.rotulo}</b>
                    </div>
                    <div className="ti-cat-num">{nf.format(r.comp)}</div>
                    <div className="ti-cat-sub">contas comprometidas</div>
                    {r.total > 0 && (
                      <>
                        <div className="ti-cat-bar" aria-hidden="true">
                          {faixas.map(
                            (f) =>
                              f.qtd > 0 && (
                                <i
                                  key={f.k}
                                  style={{
                                    width: `${(f.qtd / r.total) * 100}%`,
                                    background: f.cor,
                                  }}
                                />
                              ),
                          )}
                        </div>
                        <div className="ti-cat-faixas">
                          {faixas.map((f) => (
                            <div key={f.k}>
                              <span style={{ color: f.cor }}>{nf.format(f.qtd)}</span>
                              <small>
                                {((f.qtd / r.total) * 100).toLocaleString("pt-BR", {
                                  maximumFractionDigits: 1,
                                })}
                                % · {f.rotulo}
                              </small>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          <div className="ti-grid">
            <div className="ti-panel">
              <div className="ti-panel-hdr">
                <h2 className="ti-panel-title">
                  Novas exposições por {granularidade === "mes" ? "mês" : "semana"}
                </h2>
                <p className="ti-panel-sub">
                  Data em que o CTI indexou a credencial · todo o histórico
                </p>
              </div>
              <div className="ti-legend" style={{ marginTop: 8 }}>
                {CATEGORIAS.map((c) => (
                  <span key={c.k}>
                    <i style={{ background: c.cor }} />
                    {c.rotulo}
                  </span>
                ))}
              </div>
              <div className="ti-panel-body" style={{ height: 230 }}>
                {tsError ? (
                  <div className="dim" style={{ fontSize: 13 }}>
                    Não foi possível carregar a série: {(tsError as Error).message}. Confira se a
                    migração das agregações (leakradar_timeseries) foi aplicada.
                  </div>
                ) : serie.length === 0 ? (
                  <div className="dim" style={{ fontSize: 13 }}>
                    Sem dados ainda. Rode o Sincronizar para coletar as credenciais.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      key={`${granularidade}-${serie.length}`}
                      data={serie}
                      margin={{ top: 8, right: 8, left: 4, bottom: 0 }}
                      barCategoryGap="18%"
                    >
                      <CartesianGrid stroke="var(--v2-line)" vertical={false} />
                      <XAxis
                        dataKey="rotulo"
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                        minTickGap={16}
                      />
                      <YAxis
                        allowDecimals={false}
                        tickLine={false}
                        axisLine={false}
                        width={40}
                        tickCount={5}
                        tickFormatter={(v: number) =>
                          v >= 1000
                            ? `${(v / 1000).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}k`
                            : String(v)
                        }
                      />
                      <Tooltip cursor={{ fill: "var(--v2-hover)" }} content={<SemanaTooltip />} />
                      {CATEGORIAS.map((c, i) => (
                        <Bar
                          key={c.k}
                          dataKey={c.k}
                          stackId="s"
                          fill={c.cor}
                          radius={i === CATEGORIAS.length - 1 ? [2, 2, 0, 0] : 0}
                          isAnimationActive={false}
                        />
                      ))}
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>

            <div className="ti-panel">
              <div className="ti-panel-hdr">
                <h2 className="ti-panel-title">
                  Onde as credenciais de {catRotulo.toLowerCase()} aparecem
                </h2>
                <p className="ti-panel-sub">Site de login capturado · clique para filtrar</p>
              </div>
              <div className="ti-panel-body">
                {hostsError ? (
                  <div className="dim" style={{ fontSize: 13 }}>
                    Não foi possível carregar os sites: {(hostsError as Error).message}. Confira se
                    a migração das agregações (leakradar_top_hosts) foi aplicada.
                  </div>
                ) : hosts.length === 0 ? (
                  <div className="dim" style={{ fontSize: 13 }}>
                    Nenhum site identificado nesta categoria.
                  </div>
                ) : (
                  <div className="ti-hosts">
                    {hosts.map((h) => (
                      <button
                        key={h.h}
                        type="button"
                        className="ti-host"
                        aria-pressed={host === h.h}
                        onClick={() => setHost(host === h.h ? null : h.h)}
                        title={host === h.h ? "Remover filtro" : `Filtrar por ${h.h}`}
                      >
                        <span>{h.h}</span>
                        <b>{nf.format(h.qtd)}</b>
                        <span className="bar">
                          <i style={{ width: `${(h.qtd / hosts[0].qtd) * 100}%` }} />
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {foraDaColeta && (
            <div className="ti-note">
              <Info size={15} />
              <span>
                O CTI tem {nf.format(foraDaColeta.total)} credenciais para os domínios monitorados;
                a coleta trouxe {nf.format(foraDaColeta.coletado)} (limite de 20 mil por categoria,
                para preservar a cota diária da API).
              </span>
            </div>
          )}

          <div className="ti-panel" ref={tabelaRef} style={{ scrollMarginTop: 16 }}>
            <div className="ti-toolbar">
              <div className="ti-seg" role="group" aria-label="Categoria">
                {CATEGORIAS.map((c) => (
                  <button
                    key={c.k}
                    type="button"
                    aria-pressed={categoria === c.k}
                    onClick={() => {
                      setCategoria(c.k);
                      setHost(null);
                    }}
                  >
                    {c.rotulo} <b>{nf.format(contaCategoria(c.k))}</b>
                  </button>
                ))}
              </div>
              <label className="ti-busca">
                <Search size={14} />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar conta ou URL"
                  aria-label="Buscar credenciais"
                />
              </label>
            </div>
            <div className="ti-chips" role="group" aria-label="Status">
              <button
                type="button"
                className="ti-chip"
                aria-pressed={status === null}
                onClick={() => setStatus(null)}
              >
                Todos
              </button>
              {STATUS_ORDEM.map((s) => (
                <button
                  key={s}
                  type="button"
                  className="ti-chip"
                  aria-pressed={status === s}
                  onClick={() => setStatus(status === s ? null : s)}
                >
                  {STATUS[s].rotulo}
                </button>
              ))}
              <span className="ti-status-sep" aria-hidden="true" />
              <button
                type="button"
                className="ti-chip"
                aria-pressed={validacao === "valida"}
                title="Confirmadas válidas na validação ativa"
                onClick={() => setValidacao(validacao === "valida" ? null : "valida")}
              >
                Validada: válida
              </button>
              {adRisk && (
                <button
                  type="button"
                  className="ti-chip rm"
                  onClick={() => setAdRisk(false)}
                  title="Remover filtro"
                >
                  Em risco (AD) <X size={13} aria-label="Remover filtro" />
                </button>
              )}
              {host && (
                <button
                  type="button"
                  className="ti-chip rm"
                  onClick={() => setHost(null)}
                  title="Remover filtro"
                >
                  Site: {host} <X size={13} aria-label="Remover filtro" />
                </button>
              )}
            </div>

            {isLoading ? (
              <div className="ti-empty">
                <div className="ti-empty-s">Carregando credenciais…</div>
              </div>
            ) : leaks.length === 0 ? (
              <div className="ti-empty">
                <div className="ti-empty-t">
                  {status || host || buscaDeb || adRisk || validacao
                    ? "Nenhuma credencial com esses filtros"
                    : `Nenhuma credencial de ${catRotulo.toLowerCase()}`}
                </div>
                {(status || host || buscaDeb || adRisk || validacao) && (
                  <button type="button" className="ti-btn sm" onClick={limpar}>
                    Limpar filtros
                  </button>
                )}
              </div>
            ) : (
              <div className="ti-scroll">
                <table className="ti-table" style={isFetching ? { opacity: 0.6 } : undefined}>
                  <thead>
                    <tr>
                      <th>Conta</th>
                      <th>Site capturado</th>
                      <th>Força da senha</th>
                      <th>Indexada</th>
                      <th>Validação</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leaks.map((l) => (
                      <tr
                        key={l.id}
                        tabIndex={0}
                        onClick={() => setSelId(l.id)}
                        onKeyDown={(e) => e.key === "Enter" && setSelId(l.id)}
                      >
                        <td>
                          <span className="ti-acc mono" title={l.username ?? undefined}>
                            {!l.unlocked && <Lock size={12} aria-label="Bloqueada" />}
                            <span className="ti-trunc">{l.username ?? "—"}</span>
                          </span>
                        </td>
                        <td>
                          <span className="ti-trunc mono dim" title={l.url ?? undefined}>
                            {l.url ? l.url.replace(/^https?:\/\//, "") : "—"}
                          </span>
                        </td>
                        <td>
                          <Forca s={l.password_strength} />
                        </td>
                        <td className="mono dim" title={fmtData(l.added_at)}>
                          {fmtRel(l.added_at)}
                        </td>
                        <td title={l.validation_detail ?? undefined}>
                          <ValidacaoPill v={l.validation_status} />
                        </td>
                        <td>
                          <StatusPill s={l.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {totalFiltrado > PAGE_SIZE && (
              <div className="ti-pager">
                <span className="dim">
                  {nf.format((page - 1) * PAGE_SIZE + 1)}–
                  {nf.format(Math.min(page * PAGE_SIZE, totalFiltrado))} de{" "}
                  {nf.format(totalFiltrado)}
                </span>
                <div className="ti-pager-btns">
                  <button
                    type="button"
                    className="ti-btn sm"
                    disabled={page <= 1 || isFetching}
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                  >
                    Anterior
                  </button>
                  <span className="dim">
                    {page} / {totalPaginas}
                  </span>
                  <button
                    type="button"
                    className="ti-btn sm"
                    disabled={page >= totalPaginas || isFetching}
                    onClick={() => setPage((p) => Math.min(totalPaginas, p + 1))}
                  >
                    Próxima
                  </button>
                </div>
              </div>
            )}
          </div>
        </>
      )}

      <DetailSheet
        open={!!selected}
        width={600}
        onOpenChange={(o) => !o && setSelId(null)}
        eyebrow={
          selected
            ? `${CATEGORIAS.find((c) => c.k === selected.category)?.rotulo} · ${selected.domain}`
            : null
        }
        title={<span className="font-data">{selected?.username ?? "Conta não identificada"}</span>}
        badges={
          selected && (
            <>
              <StatusPill s={selected.status} />
              <span
                className="ti-pill"
                style={{ ["--c" as string]: "var(--v2-fg-3)" } as React.CSSProperties}
              >
                {selected.unlocked ? "Desbloqueada" : "Bloqueada"}
              </span>
            </>
          )
        }
        footer={
          selected &&
          podeTratar &&
          (() => {
            const marcada =
              selected.status === "risco_aceito" || selected.status === "falso_positivo";
            const semIndex = ctxData ? !ctxData.incident.allowNew : false;
            const bloqueado = marcada || semIndex;
            const motivo = marcada
              ? "Credencial marcada como risco aceito / falso positivo."
              : semIndex
                ? `Já existe o incidente ${ctxData?.incident.refCode} para esta captura.`
                : undefined;
            return (
              <button
                type="button"
                className="ti-btn pri"
                disabled={abrirIncidente.isPending || bloqueado}
                title={motivo}
                onClick={() => abrirIncidente.mutate(selected)}
              >
                <Bell size={14} /> {abrirIncidente.isPending ? "Abrindo…" : "Abrir incidente"}
              </button>
            );
          })()
        }
      >
        {selected && (
          <div className="ti-root ti-sheet">
            <style>{CSS}</style>
            <DetailList
              items={[
                [
                  "Site capturado",
                  selected.url ?? <span className="dim">não informado</span>,
                  true,
                ],
                ["Força da senha", <Forca key="f" s={selected.password_strength} />],
                ["Indexada em", `${fmtData(selected.added_at)} · ${fmtRel(selected.added_at)}`],
                ["Vista pela 1ª vez", fmtData(selected.first_seen_at)],
                ["Última coleta", fmtRel(selected.last_seen_at)],
                ["ID CTI", selected.leak_id, true],
              ]}
            />

            <DetailSection title="Correlação">
              {ctxData?.colaborador ? (
                <div className="ti-corr">
                  <div className="ti-corr-row">
                    <User size={14} />
                    <div>
                      <b>{ctxData.colaborador.displayName}</b>
                      <span>
                        {[
                          ctxData.colaborador.cargo,
                          ctxData.colaborador.departamento,
                          ctxData.colaborador.unidade,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "colaborador cadastrado"}
                      </span>
                    </div>
                    <span
                      className="ti-pill"
                      style={{ ["--c" as string]: "var(--v2-crit)" } as React.CSSProperties}
                    >
                      Colaborador ativo
                    </span>
                  </div>
                </div>
              ) : ctxData?.masked ? (
                <span className="dim" style={{ fontSize: 13 }}>
                  Usuário mascarado. Desbloqueie para cruzar com o cadastro de colaboradores.
                </span>
              ) : (
                <span className="dim" style={{ fontSize: 13 }}>
                  Não encontrada no cadastro de colaboradores (pode ser cliente, terceiro ou conta
                  pessoal).
                </span>
              )}

              {/* Cruzamento com o Active Directory (Entra) — só colaboradores */}
              {selected.category === "employees" && (
                <div style={{ marginTop: 12 }}>
                  <h4
                    style={{
                      margin: "0 0 8px",
                      font: "500 10.5px var(--font-data)",
                      textTransform: "uppercase",
                      letterSpacing: "0.09em",
                      color: "var(--v2-fg-3)",
                    }}
                  >
                    Active Directory (Entra)
                  </h4>
                  {ctxData?.ad ? (
                    (() => {
                      const externa = ctxData.ad.externa;
                      const aindaValida =
                        !externa &&
                        ctxData.ad.accountEnabled === true &&
                        !!ctxData.ad.lastPasswordChange &&
                        !!selected.added_at &&
                        new Date(ctxData.ad.lastPasswordChange) < new Date(selected.added_at);
                      return (
                        <div style={{ display: "grid", gap: 8 }}>
                          <DetailList
                            items={[
                              [
                                "Tipo",
                                externa ? (
                                  <span style={{ color: "var(--v2-med)" }}>
                                    {ctxData.ad.userType === "Guest"
                                      ? "Convidado (externa)"
                                      : "Membro — identidade externa"}
                                  </span>
                                ) : (
                                  "Membro"
                                ),
                              ],
                              [
                                "Última troca de senha",
                                ctxData.ad.lastPasswordChange ? (
                                  `${fmtData(ctxData.ad.lastPasswordChange)} · ${fmtRel(ctxData.ad.lastPasswordChange)}`
                                ) : (
                                  <span className="dim">—</span>
                                ),
                              ],
                              [
                                "MFA",
                                ctxData.ad.mfaRegistered === true ? (
                                  <span style={{ color: "var(--v2-ok)" }}>Habilitado</span>
                                ) : ctxData.ad.mfaRegistered === false ? (
                                  <span style={{ color: "var(--v2-crit)" }}>Não habilitado</span>
                                ) : (
                                  <span className="dim">—</span>
                                ),
                              ],
                              [
                                "Conta",
                                ctxData.ad.accountEnabled === true
                                  ? "Ativa"
                                  : ctxData.ad.accountEnabled === false
                                    ? "Desativada"
                                    : "—",
                              ],
                            ]}
                          />
                          {externa && (
                            <span className="ti-reveal-note">
                              Identidade externa/federada (ex.: conta Microsoft pessoal): a senha é
                              do provedor de origem, não do seu tenant. O "senha ainda válida" e a
                              validação por ROPC não se aplicam — use a marcação manual e troque a
                              senha no provedor (ex.: account.microsoft.com).
                            </span>
                          )}
                          {aindaValida && (
                            <div className="ti-confirm">
                              <b>Senha vazada provavelmente ainda válida</b> — não trocada no AD
                              desde o vazamento
                              {ctxData.ad.mfaRegistered === false ? " e sem MFA." : "."}
                            </div>
                          )}
                          {ctxData.ad.error && (
                            <span className="ti-reveal-note">AD: {ctxData.ad.error}</span>
                          )}
                          <span className="ti-reveal-note">
                            Verificado {fmtRel(ctxData.ad.checkedAt)}
                          </span>
                        </div>
                      );
                    })()
                  ) : (
                    <span className="dim" style={{ fontSize: 13 }}>
                      Conta ainda não verificada no AD. Ative e rode o cron <b>ad-status-sync</b>{" "}
                      (usa o app do SSO).
                    </span>
                  )}
                </div>
              )}
            </DetailSection>

            <DetailSection title="Validação de legitimidade">
              <div style={{ display: "grid", gap: 10, fontSize: 13, color: "var(--v2-fg-2)" }}>
                {selected.validation_status ? (
                  <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                    <ValidacaoPill v={selected.validation_status} />
                    <span className="dim" style={{ fontSize: 12 }}>
                      {selected.validation_detail} · {fmtRel(selected.validation_checked_at)}
                    </span>
                  </div>
                ) : (
                  <span>
                    Sem validação ainda — a credencial é apenas um informativo. Validar confirma se
                    ela ainda autentica, para abrir incidente.
                  </span>
                )}
                {selected.validation_status === "valida" && (
                  <div className="ti-confirm">
                    Esta credencial <b>ainda autentica</b>. Acione o time de resposta: force a troca
                    de senha e revise os acessos dessa conta.
                  </div>
                )}
                {!podeDesbloquear ? (
                  <span className="dim">
                    Você não tem a permissão Validar/Desbloquear deste módulo.
                  </span>
                ) : !selected.url_host ? (
                  <span className="dim">Sem URL de origem, não há onde validar.</span>
                ) : !podeValidar(selected.url_host) ? (
                  <span className="dim">
                    {selected.url_host} não está em Aplicações. Cadastre-a (aba Aplicações) para
                    validar — só sistemas que você opera. (Contas Microsoft/Entra não precisam de
                    cadastro: são validadas pelo diretório.)
                  </span>
                ) : (
                  <div>
                    <button
                      type="button"
                      className="ti-btn sm"
                      disabled={validar.isPending}
                      onClick={() => validar.mutate(selected)}
                    >
                      <ShieldCheck size={13} />
                      {validar.isPending ? "Validando…" : "Validar credencial"}
                    </button>
                    <span className="ti-reveal-note" style={{ display: "block", marginTop: 6 }}>
                      {ehMicrosoft(selected.url_host)
                        ? "Valida pelo seu tenant Entra (ROPC): diz se a senha ainda autentica e se o MFA barra. Pode gerar log de sign-in e, após muitas tentativas, smart lockout."
                        : `Testa o login em ${selected.url_host} com a senha vazada. Pode gerar bloqueio na conta real conforme a política do sistema. A senha não é gravada.`}
                    </span>
                  </div>
                )}

                {/* Marcação manual: para contas que o tool não valida sozinho
                    (convidados, contas externas) ou confirmação feita por fora. */}
                {podeDesbloquear &&
                  (manual ? (
                    <div className="ti-confirm">
                      <span>
                        Marcar manualmente como <b>{VALIDACAO[manual]?.rotulo}</b>. Justificativa
                        obrigatória (não submete senha a lugar nenhum):
                      </span>
                      <textarea
                        className="ti-notes"
                        autoFocus
                        value={manualNota}
                        placeholder="Ex.: conta owner guest; senha confirmada válida fora do tenant; trocar no account.microsoft.com."
                        onChange={(e) => setManualNota(e.target.value)}
                      />
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="ti-btn sm pri"
                          disabled={!manualNota.trim() || marcarManual.isPending}
                          onClick={() => marcarManual.mutate(selected)}
                        >
                          {marcarManual.isPending ? "Salvando…" : "Confirmar"}
                        </button>
                        <button
                          type="button"
                          className="ti-btn sm ghost"
                          onClick={() => setManual(null)}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}
                    >
                      <span className="ti-reveal-note">Marcação manual:</span>
                      <button
                        type="button"
                        className="ti-btn sm ghost"
                        onClick={() => setManual("valida")}
                      >
                        Válida
                      </button>
                      <button
                        type="button"
                        className="ti-btn sm ghost"
                        onClick={() => setManual("invalida")}
                      >
                        Não autentica
                      </button>
                      <button
                        type="button"
                        className="ti-btn sm ghost"
                        onClick={() => setManual("inconclusiva")}
                      >
                        Inconclusiva
                      </button>
                    </div>
                  ))}
              </div>
            </DetailSection>

            {podeDesbloquear && (
              <DetailSection title="Senha vazada">
                <div style={{ display: "grid", gap: 8, fontSize: 13, color: "var(--v2-fg-2)" }}>
                  {senha != null ? (
                    <div className="ti-reveal">
                      <code>{senha}</code>
                      <button
                        type="button"
                        className="ti-btn sm ghost"
                        onClick={() => {
                          navigator.clipboard?.writeText(senha).then(
                            () => toast.success("Senha copiada"),
                            () => toast.error("Não foi possível copiar"),
                          );
                        }}
                      >
                        <Copy size={13} /> Copiar
                      </button>
                      <button
                        type="button"
                        className="ti-btn sm ghost"
                        onClick={() => setSenha(null)}
                      >
                        <EyeOff size={13} /> Ocultar
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="ti-btn sm"
                      disabled={revelar.isPending}
                      onClick={() => revelar.mutate(selected)}
                    >
                      <Eye size={13} /> {revelar.isPending ? "Revelando…" : "Revelar senha"}
                    </button>
                  )}
                  <span className="ti-reveal-note">
                    A senha é exibida só nesta tela e some em 30s. Nunca é gravada no banco nem no
                    log — o log registra apenas que você a revelou.
                  </span>
                </div>
              </DetailSection>
            )}

            {!selected.unlocked && (
              <DetailSection title="Desbloqueio">
                <div style={{ display: "grid", gap: 8, fontSize: 13, color: "var(--v2-fg-2)" }}>
                  <span>
                    Enquanto bloqueada, a conta aparece mascarada. Desbloquear libera a conta
                    completa, a validação e a opção de revelar a senha, e espelha o status no CTI. A
                    senha nunca é gravada no banco.
                  </span>
                  {!podeDesbloquear ? (
                    <span className="dim">Você não tem a permissão Desbloquear deste módulo.</span>
                  ) : confirmando ? (
                    <div className="ti-confirm">
                      <span>
                        Custa 1 ponto do CTI.
                        {conta?.points != null &&
                          ` Saldo atual: ${nf.format(conta.points)} pontos.`}
                      </span>
                      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                        <button
                          type="button"
                          className="ti-btn sm pri"
                          disabled={desbloquear.isPending}
                          onClick={() => desbloquear.mutate(selected)}
                        >
                          <Unlock size={13} />
                          {desbloquear.isPending ? "Desbloqueando…" : "Confirmar desbloqueio"}
                        </button>
                        <button
                          type="button"
                          className="ti-btn sm ghost"
                          onClick={() => setConfirmando(false)}
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <button
                        type="button"
                        className="ti-btn sm"
                        onClick={() => setConfirmando(true)}
                      >
                        <Unlock size={13} /> Desbloquear
                      </button>
                    </div>
                  )}
                </div>
              </DetailSection>
            )}

            <DetailSection title="Tratamento">
              <div style={{ display: "grid", gap: 10 }}>
                {/* Tudo numa linha: etapas (indicadores) · separador · marcadores */}
                <div className="ti-status-opts" aria-label="Status">
                  {(["novo", "em_tratamento", "resolvido"] as LeakStatus[]).map((s) => (
                    <span
                      key={s}
                      className="ti-chip"
                      data-readonly="1"
                      aria-current={selected.status === s}
                      style={
                        selected.status === s
                          ? ({
                              borderColor: STATUS[s].cor,
                              background: `color-mix(in oklch, ${STATUS[s].cor} 14%, transparent)`,
                              color: "var(--v2-fg)",
                            } as React.CSSProperties)
                          : undefined
                      }
                    >
                      {STATUS[s].rotulo}
                    </span>
                  ))}
                  <span className="ti-status-sep" aria-hidden="true" />
                  {(["risco_aceito", "falso_positivo"] as LeakStatus[]).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className="ti-chip"
                      aria-pressed={selected.status === s || marcadorPara === s}
                      // o marcador já ativo fica desabilitado; o outro troca (com justificativa)
                      disabled={!podeTratar || selected.status === s || marcar.isPending}
                      onClick={() => {
                        setMarcadorPara(s);
                        setMotivo("");
                      }}
                    >
                      {STATUS[s].rotulo}
                    </button>
                  ))}
                </div>

                {/* Card de justificativa obrigatória ao marcar/trocar */}
                {marcadorPara && (
                  <div className="ti-confirm">
                    <span>
                      {selected.status === "risco_aceito" || selected.status === "falso_positivo"
                        ? "Trocar para "
                        : "Marcar como "}
                      <b>{STATUS[marcadorPara].rotulo}</b>. Justificativa obrigatória:
                    </span>
                    <textarea
                      className="ti-notes"
                      autoFocus
                      value={motivo}
                      placeholder="Ex.: conta de aluno, sem acesso a sistemas internos; risco aceito pelo gestor X."
                      onChange={(e) => setMotivo(e.target.value)}
                    />
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <button
                        type="button"
                        className="ti-btn sm pri"
                        disabled={!motivo.trim() || marcar.isPending}
                        onClick={() =>
                          marcar.mutate({
                            id: selected.id,
                            status: marcadorPara,
                            notes: motivo.trim(),
                          })
                        }
                      >
                        {marcar.isPending ? "Salvando…" : "Confirmar"}
                      </button>
                      <button
                        type="button"
                        className="ti-btn sm ghost"
                        onClick={() => setMarcadorPara(null)}
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}

                {selected.status_updated_at && (
                  <span className="dim" style={{ fontSize: 12 }}>
                    Status alterado {fmtRel(selected.status_updated_at)}
                  </span>
                )}
                <span className="dim" style={{ fontSize: 12 }}>
                  As etapas (Novo → Em tratamento → Resolvido) seguem o incidente na aba Incidentes.
                  Risco aceito e falso positivo são marcadores manuais e impedem abrir incidente;
                  trocar entre eles exige justificativa (registrada no log).
                </span>
                {!podeTratar && (
                  <span className="dim" style={{ fontSize: 12 }}>
                    Você não tem a permissão Tratar deste módulo.
                  </span>
                )}
              </div>
            </DetailSection>

            <DetailSection title="Histórico">
              <div className="ti-tl">
                {[
                  // Base do ciclo de vida (derivada); as demais mudanças vêm do
                  // log de eventos (append-only), cada alteração é um evento novo.
                  selected.added_at && {
                    cor: "var(--v2-crit)",
                    titulo: "Indexada no CTI",
                    quando: selected.added_at,
                  },
                  {
                    cor: "var(--v2-accent)",
                    titulo: "Coletada pelo Z-Sec",
                    quando: selected.first_seen_at,
                  },
                  ...(ctxData?.events ?? []).map((e) => ({
                    cor: TONE_COR[e.tone ?? "neutral"] ?? "var(--v2-fg-3)",
                    titulo: e.label,
                    quando: e.created_at,
                    detalhe: e.detail,
                  })),
                ]
                  .filter(Boolean)
                  .map((e, i) => {
                    const ev = e as {
                      cor: string;
                      titulo: string;
                      quando: string | null;
                      detalhe?: string | null;
                    };
                    return (
                      <div className="ti-tl-item" key={i}>
                        <span className="ti-tl-dot" style={{ background: ev.cor }} />
                        <div>
                          <b>{ev.titulo}</b>
                          <small>
                            {ev.quando ? `${fmtData(ev.quando)} · ${fmtRel(ev.quando)}` : "—"}
                          </small>
                          {ev.detalhe && <p className="ti-tl-motivo">{ev.detalhe}</p>}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </DetailSection>
          </div>
        )}
      </DetailSheet>
    </div>
  );
}

export default ThreatIntelDashboard;
