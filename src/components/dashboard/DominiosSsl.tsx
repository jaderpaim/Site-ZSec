import { SyncActions } from "@/components/layout/SyncActions";
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  RefreshCw,
  Trash2,
  Loader2,
  ShieldCheck,
  Cloud,
  Search,
  Bell,
  Globe,
  Lock,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ChevronRight,
  Link2,
  StickyNote,
  FileUp,
  Pencil,
  X,
  History,
} from "lucide-react";
import { DetailList, DetailSection, DetailSheet } from "@/components/layout/DetailSheet";
import {
  listDomains,
  createDomain,
  refreshDomain,
  refreshAllDomains,
  deleteDomain,
  updateDomain,
  syncCloudflareZonesAsDomains,
} from "@/lib/domains.functions";
import {
  listSslCerts,
  importSslCert,
  refreshSslCert,
  refreshAllSslCerts,
  deleteSslCert,
  updateSslCert,
  createSslCertByDomain,
  syncCloudflareZonesAsSslCerts,
  triggerSslAlertCheck,
  renewSslCert,
  getSslCertDetails,
  updateSslCertMeta,
} from "@/lib/ssl.functions";
import type { SslRow, SslEdgeInfo } from "@/lib/ssl.functions";
import { getAlertRecipientDept, setAlertRecipientDept } from "@/lib/alerts-recipients.functions";
import { useDepartments } from "@/lib/use-departments";
import { usePermissions } from "@/lib/use-permissions";

// ── Design Tokens ──────────────────────────────────────────────────────────────
const T = {
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
  textSubtle: "var(--tl-f1f5f9, #F1F5F9)",
};

// ── CSS (interface v2) ─────────────────────────────────────────────────────────
const CSS = `
  .dssl-root { font-family:var(--font-ui); color:var(--v2-fg); display:flex; flex-direction:column; gap:20px; font-size:14px; }
  .dssl-root * { box-sizing:border-box; }
  @keyframes dssl-spin { to{transform:rotate(360deg)} }
  .dssl-spin { animation:dssl-spin 0.75s linear infinite; }
  @media (prefers-reduced-motion: reduce) { .dssl-spin { animation:none; } }
  .dssl-root ::-webkit-scrollbar { width:6px; height:6px; }
  .dssl-root ::-webkit-scrollbar-track { background:transparent; }
  .dssl-root ::-webkit-scrollbar-thumb { background:var(--v2-line-strong); border-radius:3px; }
  .dssl-root :focus-visible { outline:2px solid var(--v2-accent); outline-offset:2px; }
  .dssl-root .mono { font-family:var(--font-data); font-size:12.5px; }
  .dssl-root .dim { color:var(--v2-fg-3); }

  /* ── Cabeçalho ── */
  .dssl-ph { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  .dssl-ph-title { font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.2; margin:0; }
  .dssl-ph-sub { margin:4px 0 0; font-size:13px; color:var(--v2-fg-3); display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  .dssl-ph-actions { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }

  /* ── KPIs ── */
  .dssl-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
  .dssl-kpi { position:relative; text-align:left; border:0; background:transparent; padding:16px 18px 14px; display:grid; gap:2px; align-content:start; box-shadow:1px 0 0 var(--v2-line), 0 1px 0 var(--v2-line); cursor:pointer; color:inherit; font-family:inherit; }
  .dssl-kpi:hover { background:var(--v2-hover); }
  .dssl-kpi[aria-pressed="true"] { background:color-mix(in oklch, var(--v2-accent) 14%, transparent); }
  .dssl-kpi[aria-pressed="true"]::after { content:""; position:absolute; left:0; right:0; bottom:0; height:2px; background:var(--v2-accent); }
  .dssl-kpi-label { font-size:12.5px; color:var(--v2-fg-2); display:flex; align-items:center; gap:6px; }
  .dssl-kpi-value { font-size:28px; font-weight:600; letter-spacing:-0.02em; line-height:1.25; font-variant-numeric:tabular-nums; }
  .dssl-kpi-foot { font-size:12px; color:var(--v2-fg-3); }
  .dssl-sw { width:8px; height:8px; border-radius:2px; display:inline-block; }

  /* ── Grade e cartões ── */
  .dssl-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:20px; align-items:start; }
  .dssl-span-2 { grid-column:span 2; }
  @media (max-width: 1100px) { .dssl-grid { grid-template-columns:minmax(0, 1fr); } .dssl-span-2 { grid-column:auto; } }
  .dssl-panel { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; min-width:0; overflow:hidden; display:flex; flex-direction:column; }
  .dssl-panel-hdr { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 18px 4px; flex-wrap:wrap; }
  .dssl-panel-title { font-size:14px; font-weight:600; margin:0; color:var(--v2-fg); }
  .dssl-panel-sub { margin:2px 0 0; font-size:12.5px; color:var(--v2-fg-3); }
  .dssl-panel-body { padding:10px 18px 16px; }
  .dssl-toolbar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:12px 18px; border-bottom:1px solid var(--v2-line); }
  .dssl-toolbar.split { justify-content:space-between; }
  .dssl-actions { display:flex; gap:8px; flex-wrap:wrap; margin-left:auto; }

  /* ── Abas ── */
  .dssl-seg { display:inline-flex; padding:3px; gap:2px; background:var(--v2-bg); border:1px solid var(--v2-line); border-radius:8px; }
  .dssl-seg button { display:inline-flex; align-items:center; gap:6px; border:0; background:transparent; padding:4px 12px; border-radius:5px; font-size:13px; color:var(--v2-fg-2); cursor:pointer; font-family:inherit; }
  .dssl-seg button:hover { color:var(--v2-fg); }
  .dssl-seg button[aria-pressed="true"] { background:var(--v2-surface-2); color:var(--v2-fg); font-weight:500; box-shadow:inset 0 0 0 1px var(--v2-line); }
  .dssl-n { font-family:var(--font-data); font-size:12px; color:var(--v2-fg-3); }
  .dssl-urg { font-family:var(--font-data); font-size:11px; font-weight:500; padding:0 6px; border-radius:99px; background:color-mix(in oklch, var(--v2-crit) 18%, transparent); color:var(--v2-crit); }
  .dssl-recip { display:flex; align-items:center; gap:10px; font-size:13px; color:var(--v2-fg-2); flex-wrap:wrap; }

  /* ── Busca e filtros ── */
  .dssl-search { display:inline-flex; align-items:center; gap:8px; height:32px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg-3); width:260px; max-width:100%; }
  .dssl-search:focus-within { border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }
  .dssl-search input { flex:1; min-width:0; border:0; outline:none; background:transparent; color:var(--v2-fg); font-size:13px; font-family:inherit; }
  .dssl-search input::placeholder { color:var(--v2-fg-3); }
  .dssl-chip { display:inline-flex; align-items:center; gap:6px; height:28px; padding:0 8px 0 10px; border-radius:99px; border:0; background:color-mix(in oklch, var(--v2-accent) 14%, transparent); color:var(--v2-fg); font-size:12.5px; cursor:pointer; font-family:inherit; }
  .dssl-chip svg { color:var(--v2-fg-3); }

  /* ── Botões ── */
  .dssl-btn { display:inline-flex; align-items:center; gap:7px; height:32px; padding:0 12px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; font-family:var(--font-ui); white-space:nowrap; border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-fg); transition:background .15s, border-color .15s; }
  .dssl-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .dssl-btn:hover:not(:disabled) { background:var(--v2-hover); border-color:var(--v2-line-strong); }
  .dssl-btn.outline { background:var(--v2-surface); }
  .dssl-btn.ghost { background:transparent; border-color:transparent; color:var(--v2-fg-2); }
  .dssl-btn.primary { background:var(--v2-accent); border-color:var(--v2-accent); color:var(--v2-accent-ink); }
  .dssl-btn.primary:hover:not(:disabled) { background:var(--v2-accent); filter:brightness(1.08); }
  .dssl-btn.success { background:color-mix(in oklch, var(--v2-ok) 14%, transparent); border-color:color-mix(in oklch, var(--v2-ok) 40%, transparent); color:var(--v2-ok); }
  .dssl-btn.danger { background:transparent; border-color:color-mix(in oklch, var(--v2-crit) 40%, transparent); color:var(--v2-crit); }
  .dssl-btn.danger:hover:not(:disabled) { background:color-mix(in oklch, var(--v2-crit) 10%, transparent); }
  .dssl-btn.icon-only { width:30px; height:30px; padding:0; justify-content:center; border-color:transparent; background:transparent; color:var(--v2-fg-2); }
  .dssl-btn.icon-only:hover:not(:disabled) { background:var(--v2-hover); color:var(--v2-fg); border-color:transparent; }
  .dssl-btn.icon-only.danger:hover:not(:disabled) { color:var(--v2-crit); background:color-mix(in oklch, var(--v2-crit) 12%, transparent); }
  .dssl-btn.icon-only.success { color:var(--v2-ok); }

  /* ── Tabela ── */
  .dssl-scroll { overflow:auto; max-height:580px; }
  .dssl-table { width:100%; border-collapse:collapse; font-size:13px; }
  .dssl-table thead { position:sticky; top:0; z-index:1; }
  .dssl-table th { padding:9px 12px; font-size:12px; font-weight:500; color:var(--v2-fg-3); text-align:left; background:var(--v2-surface); border-bottom:1px solid var(--v2-line); white-space:nowrap; }
  .dssl-table th.r, .dssl-table td.r { text-align:right; }
  .dssl-table th.c { text-align:center; }
  .dssl-table td { padding:8px 12px; height:44px; border-bottom:1px solid var(--v2-line); vertical-align:middle; }
  .dssl-table th:first-child, .dssl-table td:first-child { padding-left:18px; }
  .dssl-table th:last-child, .dssl-table td:last-child { padding-right:18px; }
  .dssl-table tbody tr:hover td { background:var(--v2-hover); }
  .dssl-table tbody tr:last-child td { border-bottom:none; }
  .dssl-table tbody tr.clickable { cursor:pointer; }
  .dssl-row-act { display:flex; justify-content:flex-end; gap:2px; }

  /* ── Vence em ── */
  .dssl-days { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:5px; font:500 12px var(--font-data); white-space:nowrap; --c:var(--v2-ok); background:color-mix(in oklch, var(--c) 14%, transparent); color:color-mix(in oklch, var(--c) 72%, var(--v2-fg)); }
  .dssl-days svg { color:var(--c); }
  .dssl-days.warn { --c:var(--v2-med); }
  .dssl-days.danger { --c:var(--v2-crit); }
  .dssl-days.neutral { --c:var(--v2-fg-3); }

  /* ── Status ── */
  .dssl-status { display:inline-flex; align-items:center; gap:7px; font-size:13px; color:var(--v2-fg-2); }
  .dssl-status-dot { width:7px; height:7px; border-radius:50%; background:var(--v2-ok); flex-shrink:0; }
  .dssl-status.exp .dssl-status-dot { background:var(--v2-crit); }

  /* ── Alerta (dias) editável ── */
  .dssl-days-input { width:64px; height:28px; padding:0 8px; border:1px solid var(--v2-line); border-radius:6px; background:var(--v2-bg); color:var(--v2-fg); font:500 12.5px var(--font-data); text-align:center; outline:none; }
  .dssl-days-input:focus { border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }

  /* ── Origem ── */
  .dssl-src { display:inline-flex; align-items:center; gap:6px; font-size:12.5px; color:var(--v2-fg-2); white-space:nowrap; }
  .dssl-src svg { color:var(--v2-fg-3); }
  .dssl-row-tags { display:inline-flex; align-items:center; gap:6px; margin-left:8px; vertical-align:middle; }
  .dssl-row-tag { display:inline-flex; align-items:center; gap:4px; height:18px; padding:0 6px; border-radius:4px; background:var(--v2-surface-2); border:1px solid var(--v2-line); font:500 11px var(--font-data); color:var(--v2-fg-2); }

  /* ── Próximos vencimentos ── */
  .dssl-upcoming { display:grid; }
  .dssl-upcoming button { display:grid; grid-template-columns:24px minmax(0, 1fr) auto; gap:10px; align-items:center; padding:9px 8px; margin:0 -8px; border:0; border-radius:8px; background:transparent; text-align:left; color:var(--v2-fg); cursor:pointer; font-family:inherit; }
  .dssl-upcoming button:hover { background:var(--v2-hover); }
  .dssl-kind { width:24px; height:24px; border-radius:6px; display:grid; place-items:center; background:var(--v2-surface-2); border:1px solid var(--v2-line); color:var(--v2-fg-3); }
  .dssl-upcoming b { display:block; font:500 12.5px var(--font-data); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .dssl-upcoming small { display:block; font-size:12px; color:var(--v2-fg-3); }

  /* ── Vazio / carregando / nota ── */
  .dssl-empty { padding:40px; text-align:center; color:var(--v2-fg-3); font-size:13px; }
  .dssl-loading { display:flex; align-items:center; justify-content:center; gap:8px; padding:40px; color:var(--v2-fg-3); font-size:13px; }
  .dssl-note { display:flex; align-items:flex-start; gap:10px; font-size:12.5px; color:var(--v2-fg-3); padding:10px 18px 12px; line-height:1.5; border-top:1px solid var(--v2-line); }
  .dssl-note svg { flex-shrink:0; margin-top:2px; }

  /* ── Diálogos ── */
  .dssl-dlg-field { display:flex; flex-direction:column; gap:6px; }
  .dssl-dlg-label { font-size:12.5px; font-weight:500; color:var(--v2-fg-2); font-family:var(--font-ui); }
  .dssl-dlg-hint { font-size:12px; color:var(--v2-fg-3); line-height:1.5; }
  .dssl-dlg-input { width:100%; padding:8px 12px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-surface-2); color:var(--v2-fg); font-family:var(--font-ui); font-size:13px; outline:none; }
  .dssl-dlg-input:focus { border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }
  .dssl-dlg-input::placeholder { color:var(--v2-fg-3); }
  .dssl-dlg-sep { height:1px; background:var(--v2-line); margin:4px 0; }
  .dssl-dlg-section-label { font-size:12px; font-weight:600; color:var(--v2-fg-3); display:flex; align-items:center; gap:6px; }
  .dssl-dlg-section-label::after { content:''; flex:1; height:1px; background:var(--v2-line); }
  .dssl-choice { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 12px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-surface-2); }

  /* ── Painel lateral ── */
  .dssl-sh-section { display:grid; gap:10px; }
  .dssl-sh-hd { display:flex; align-items:center; justify-content:space-between; gap:8px; }
  .dssl-sh-title { font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.08em; color:var(--v2-fg-3); margin:0; }
  .dssl-sh-grid { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:12px 16px; }
  .dssl-sh-k { font-size:12px; color:var(--v2-fg-3); margin-bottom:2px; }
  .dssl-sh-v { font-size:13px; color:var(--v2-fg); word-break:break-word; }
  .dssl-sh-v.mono { font-family:var(--font-data); font-size:12.5px; }
  .dssl-sh-full { grid-column:1 / -1; }
  .dssl-sh-empty { font-size:13px; color:var(--v2-fg-3); }
  .dssl-sh-list { display:grid; border:1px solid var(--v2-line); border-radius:8px; overflow:hidden; }
  .dssl-sh-item { display:flex; flex-direction:column; gap:2px; padding:9px 12px; border-top:1px solid var(--v2-line); background:var(--v2-surface); }
  .dssl-sh-item:first-child { border-top:0; }
  .dssl-sh-item a { color:var(--v2-accent); text-decoration:none; font-family:var(--font-data); font-size:12.5px; word-break:break-all; }
  .dssl-sh-item a:hover { text-decoration:underline; }
  .dssl-sh-edit-row { display:flex; gap:6px; align-items:flex-start; }
  .dssl-sh-notes { white-space:pre-wrap; font-size:13px; line-height:1.6; color:var(--v2-fg-2); padding:10px 12px; border-radius:8px; background:var(--v2-surface-2); border:1px solid var(--v2-line); }
  .dssl-warn { display:flex; gap:8px; padding:9px 12px; border-radius:8px; font-size:12.5px; background:color-mix(in oklch, var(--v2-med) 12%, transparent); border:1px solid color-mix(in oklch, var(--v2-med) 35%, transparent); color:var(--v2-fg); }
  .dssl-warn svg { flex-shrink:0; margin-top:2px; color:var(--v2-med); }
  .dssl-hist { list-style:none; margin:0; padding:0; display:grid; gap:12px; }
  .dssl-hist li { display:grid; grid-template-columns:12px 1fr; gap:10px; font-size:13px; }
  .dssl-hist li::before { content:""; width:8px; height:8px; margin-top:6px; border-radius:50%; background:var(--v2-line-strong); }
  .dssl-hist small { display:block; font-size:12px; color:var(--v2-fg-3); }
  .dssl-hist code { display:block; font:400 11px var(--font-data); color:var(--v2-fg-3); overflow-wrap:anywhere; }
`;

// ── Helpers — UNCHANGED ────────────────────────────────────────────────────────
const REGISTRARS: Array<{ value: "godaddy" | "registro_br" | "outro"; label: string }> = [
  { value: "godaddy", label: "GoDaddy" },
  { value: "registro_br", label: "Registro.br" },
  { value: "outro", label: "Outro" },
];
const regLabel = (v: string) => REGISTRARS.find((r) => r.value === v)?.label ?? v;

function fmtDate(d: string | null) {
  if (!d) return "—";
  const s = d.includes("T") ? d : d + "T12:00:00";
  return new Date(s).toLocaleDateString("pt-BR");
}

function calcDaysToExpire(validTo: string | null): number | null {
  if (!validTo) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const s = validTo.includes("T") ? validTo : validTo + "T12:00:00";
  const exp = new Date(s);
  exp.setHours(0, 0, 0, 0);
  return Math.round((exp.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function useLiveDate() {
  const [today, setToday] = React.useState(() => new Date().toDateString());
  React.useEffect(() => {
    function scheduleNextDay() {
      const now = new Date();
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(0, 0, 0, 100);
      const ms = tomorrow.getTime() - now.getTime();
      return setTimeout(() => {
        setToday(new Date().toDateString());
        scheduleNextDay();
      }, ms);
    }
    const t = scheduleNextDay();
    const interval = setInterval(() => setToday(new Date().toDateString()), 3_600_000);
    return () => {
      clearTimeout(t);
      clearInterval(interval);
    };
  }, []);
  return today;
}

// ── Sub-components ─────────────────────────────────────────────────────────────
const plural = (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`;

// "Vence em": cor + ícone + texto (vermelho = vencido ou dentro do alerta; âmbar = até 60 dias)
function DaysChip({ days, alertDays }: { days: number | null; alertDays: number }) {
  if (days === null) return <span className="dssl-days neutral">sem data</span>;
  if (days < 0)
    return (
      <span className="dssl-days danger">
        <AlertTriangle size={11} /> vencido há {plural(Math.abs(days))}
      </span>
    );
  if (days <= alertDays)
    return (
      <span className="dssl-days danger">
        <AlertTriangle size={11} /> {plural(days)}
      </span>
    );
  if (days <= 60)
    return (
      <span className="dssl-days warn">
        <Clock size={11} /> {plural(days)}
      </span>
    );
  return (
    <span className="dssl-days ok">
      <CheckCircle2 size={11} /> {plural(days)}
    </span>
  );
}

function StatusBadge({ status }: { status: string }) {
  const isExp = status === "expirado";
  return (
    <span className={`dssl-status ${isExp ? "exp" : "ok"}`}>
      <span className="dssl-status-dot" />
      {isExp ? "Expirado" : "Ativo"}
    </span>
  );
}

// Filtro de situação (vindo dos KPIs) e helpers de ordenação
type Situacao = "exp" | "soon" | null;
const SITUACAO_LABEL: Record<"exp" | "soon", string> = { exp: "Situação: vencidos", soon: "Situação: a vencer" };
function matchSituacao(f: Situacao, days: number | null, alert: number) {
  if (!f) return true;
  if (days === null) return false;
  return f === "exp" ? days < 0 : days >= 0 && days <= alert;
}
const byDays = (a: number | null, b: number | null) => (a ?? Infinity) - (b ?? Infinity);

// ── AlertDeptSelector — logic UNCHANGED ───────────────────────────────────────
function AlertDeptSelector({ scope }: { scope: "domains" | "ssl" }) {
  const qc = useQueryClient();
  const getFn = useServerFn(getAlertRecipientDept);
  const setFn = useServerFn(setAlertRecipientDept);
  const depts = useDepartments();
  const q = useQuery({
    queryKey: ["alert-recipient-dept", scope],
    queryFn: () => getFn({ data: { scope } }),
  });
  const mut = useMutation({
    mutationFn: (department_id: string | null) => setFn({ data: { scope, department_id } }),
    onSuccess: () => {
      toast.success("Departamento de alertas atualizado");
      qc.invalidateQueries({ queryKey: ["alert-recipient-dept", scope] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao atualizar"),
  });
  const value = q.data?.department_id ?? "__none__";
  return (
    <Select
      value={value}
      onValueChange={(v) => mut.mutate(v === "__none__" ? null : v)}
      disabled={mut.isPending || q.isLoading}
    >
      <SelectTrigger
        aria-label="Departamento que também recebe os alertas"
        style={{
          background: "var(--v2-surface)",
          borderColor: "var(--v2-line)",
          color: "var(--v2-fg)",
          fontFamily: "var(--font-ui)",
          fontSize: 13,
          height: 32,
          width: 230,
        }}
      >
        <SelectValue placeholder="Nenhum departamento" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">Nenhum departamento</SelectItem>
        {(depts.data ?? []).map((d) => (
          <SelectItem key={d.id} value={d.id}>
            {d.name}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════
export function DominiosSslDashboard() {
  // ── permissions + hooks — UNCHANGED ───────────────────────────────────────
  const { isAdmin, isModuleAdmin, can } = usePermissions();
  const canEdit =
    isAdmin || isModuleAdmin("dominios-ssl") || can("dominios-ssl", "edit") || can("dominios-ssl", "create");
  const canDelete = isAdmin || isModuleAdmin("dominios-ssl") || can("dominios-ssl", "delete");

  const qc = useQueryClient();
  const listFn = useServerFn(listDomains);
  const createFn = useServerFn(createDomain);
  const refreshFn = useServerFn(refreshDomain);
  const refreshAllFn = useServerFn(refreshAllDomains);
  const deleteFn = useServerFn(deleteDomain);
  const updateFn = useServerFn(updateDomain);

  const q = useQuery({ queryKey: ["domains"], queryFn: () => listFn() });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["domains"] });

  const createMut = useMutation({
    mutationFn: (data: { domain_name: string; alert_days: number }) => createFn({ data }),
    onSuccess: () => {
      toast.success("Domínio cadastrado");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao cadastrar"),
  });
  const refreshMut = useMutation({
    mutationFn: (id: string) => refreshFn({ data: { id } }),
    onSuccess: (r) => {
      toast.success(
        r.domain.last_check_error ? `Atualizado com aviso: ${r.domain.last_check_error}` : "Domínio atualizado",
      );
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao atualizar"),
  });
  const refreshAllMut = useMutation({
    mutationFn: () => refreshAllFn(),
    onSuccess: (r) => {
      toast.success(`${r.ok}/${r.total} domínios atualizados`);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao atualizar"),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Domínio removido");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao remover"),
  });
  const updateMut = useMutation({
    mutationFn: (data: { id: string; alert_days?: number; registrar?: "godaddy" | "registro_br" | "outro" }) =>
      updateFn({ data }),
    onSuccess: () => {
      toast.success("Atualizado");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });

  const domains = q.data?.domains ?? [];
  useLiveDate();
  // ─────────────────────────────────────────────────────────────────────────

  // ── Certificados (mesma consulta do painel de SSL; o React Query compartilha o cache) ──
  const sslListFn = useServerFn(listSslCerts);
  const sslQ = useQuery({ queryKey: ["ssl_certificates"], queryFn: () => sslListFn() });
  const certs = sslQ.data?.certs ?? [];

  // ── Estado da tela ──
  const [view, setView] = React.useState<"ssl" | "dom">("ssl");
  const [fSsl, setFSsl] = React.useState<Situacao>(null);
  const [fDom, setFDom] = React.useState<Situacao>(null);
  const [qDom, setQDom] = React.useState("");
  const [certOpenId, setCertOpenId] = React.useState<string | null>(null);
  const [domOpenId, setDomOpenId] = React.useState<string | null>(null);

  // ── KPIs ──
  const isExp = (d: number | null) => d !== null && d < 0;
  const isSoon = (d: number | null, alert: number) => d !== null && d >= 0 && d <= alert;
  const certDays = (c: SslRow) => calcDaysToExpire(c.valid_to);
  const domDays = (d: (typeof domains)[number]) => calcDaysToExpire(d.expiry_date);
  const certsExp = certs.filter((c) => isExp(certDays(c))).length;
  const certsSoon = certs.filter((c) => isSoon(certDays(c), c.alert_days ?? 30)).length;
  const domsExp = domains.filter((d) => isExp(domDays(d))).length;
  const domsSoon = domains.filter((d) => isSoon(domDays(d), d.alert_days ?? 30)).length;
  const kpiActive = view === "ssl" ? (fSsl ? `ssl:${fSsl}` : null) : fDom ? `dom:${fDom}` : null;
  const clickKpi = (key: string) => {
    if (key === "all") {
      setFSsl(null);
      setFDom(null);
      return;
    }
    const [v, f] = key.split(":") as ["ssl" | "dom", "exp" | "soon"];
    setView(v);
    if (v === "ssl") setFSsl((cur) => (cur === f ? null : f));
    else setFDom((cur) => (cur === f ? null : f));
  };
  const kpis: Array<{ key: string; label: string; value: number; foot: string; tone?: string }> = [
    { key: "ssl:exp", label: "Certificados vencidos", value: certsExp, foot: "precisam de ação agora", tone: "var(--v2-crit)" },
    { key: "ssl:soon", label: "Certificados a vencer", value: certsSoon, foot: "dentro do prazo de alerta", tone: "var(--v2-med)" },
    { key: "dom:exp", label: "Domínios vencidos", value: domsExp, foot: "registro expirado", tone: "var(--v2-crit)" },
    { key: "dom:soon", label: "Domínios a vencer", value: domsSoon, foot: "dentro do prazo de alerta", tone: "var(--v2-med)" },
    {
      key: "all",
      label: "Monitorados",
      value: certs.length + domains.length,
      foot: `${certs.length} certificados · ${domains.length} domínios`,
    },
  ];

  // ── Próximos vencimentos: domínios e certificados juntos, do mais urgente ao menos ──
  const upcoming = [
    ...certs.map((c) => ({ kind: "ssl" as const, id: c.id, name: c.domain_name, to: c.valid_to, alert: c.alert_days ?? 30 })),
    ...domains.map((d) => ({ kind: "dom" as const, id: d.id, name: d.domain_name, to: d.expiry_date, alert: d.alert_days ?? 30 })),
  ]
    .map((x) => ({ ...x, days: calcDaysToExpire(x.to) }))
    .filter((x) => x.days !== null)
    .sort((a, b) => byDays(a.days, b.days))
    .slice(0, 7);
  const openItem = (kind: "ssl" | "dom", id: string) => {
    setView(kind);
    if (kind === "ssl") setCertOpenId(id);
    else setDomOpenId(id);
  };

  // ── Domínios filtrados e ordenados pelo vencimento ──
  const domRows = domains
    .filter((d) => matchSituacao(fDom, domDays(d), d.alert_days ?? 30))
    .filter((d) => !qDom.trim() || d.domain_name.toLowerCase().includes(qDom.trim().toLowerCase()))
    .sort((a, b) => byDays(domDays(a), domDays(b)));
  const urgentCerts = certsExp + certsSoon;
  const urgentDoms = domsExp + domsSoon;
  const openDomain = domains.find((d) => d.id === domOpenId) ?? null;

  return (
    <div className="dssl-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Cabeçalho ────────────────────────────────────────────────────── */}
      <div className="dssl-ph">
        <div>
          <h1 className="dssl-ph-title">Domínios e SSL</h1>
          <p className="dssl-ph-sub">
            <span>Vencimento de domínios e certificados, com alerta diário por e-mail às 09h</span>
          </p>
        </div>
        <SyncActions moduleSlug="dominios-ssl" jobs={["ssl-expiry-check", "domains-expiry-check"]} />
      </div>

      {/* ── KPIs (clique filtra a aba correspondente) ───────────────────── */}
      <div className="dssl-kpis">
        {kpis.map((k) => (
          <button
            key={k.key}
            type="button"
            className="dssl-kpi"
            aria-pressed={kpiActive === k.key}
            onClick={() => clickKpi(k.key)}
          >
            <span className="dssl-kpi-label">
              {k.tone && k.value > 0 && <span className="dssl-sw" style={{ background: k.tone }} />}
              {k.label}
            </span>
            <span className="dssl-kpi-value">{q.isLoading || sslQ.isLoading ? "…" : k.value}</span>
            <span className="dssl-kpi-foot">{k.foot}</span>
          </button>
        ))}
      </div>

      <div className="dssl-grid">
        {/* ── Próximos vencimentos ────────────────────────────────────────── */}
        <div className="dssl-panel">
          <div className="dssl-panel-hdr">
            <div>
              <h2 className="dssl-panel-title">Próximos vencimentos</h2>
              <p className="dssl-panel-sub">Domínios e certificados, do mais urgente ao menos</p>
            </div>
          </div>
          <div className="dssl-panel-body">
            {upcoming.length === 0 ? (
              <div className="dssl-sh-empty">Nada cadastrado ainda.</div>
            ) : (
              <div className="dssl-upcoming">
                {upcoming.map((x) => (
                  <button key={`${x.kind}:${x.id}`} type="button" onClick={() => openItem(x.kind, x.id)}>
                    <span className="dssl-kind" title={x.kind === "ssl" ? "Certificado" : "Domínio"}>
                      {x.kind === "ssl" ? <Lock size={12} /> : <Globe size={12} />}
                    </span>
                    <span style={{ minWidth: 0 }}>
                      <b>{x.name}</b>
                      <small>
                        {x.kind === "ssl" ? "Certificado" : "Domínio"} · vence em {fmtDate(x.to)}
                      </small>
                    </span>
                    <DaysChip days={x.days} alertDays={x.alert} />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* ── Certificados / Domínios ─────────────────────────────────────── */}
        <div className="dssl-panel dssl-span-2">
          <div className="dssl-toolbar split">
            <div className="dssl-seg" role="tablist" aria-label="Visão">
              <button type="button" aria-pressed={view === "ssl"} onClick={() => setView("ssl")}>
                Certificados SSL <span className="dssl-n">{certs.length}</span>
                {urgentCerts > 0 && <span className="dssl-urg">{urgentCerts}</span>}
              </button>
              <button type="button" aria-pressed={view === "dom"} onClick={() => setView("dom")}>
                Domínios <span className="dssl-n">{domains.length}</span>
                {urgentDoms > 0 && <span className="dssl-urg">{urgentDoms}</span>}
              </button>
            </div>
            {canEdit && (
              <div className="dssl-recip">
                <span>Alertas também para</span>
                <AlertDeptSelector key={view} scope={view === "ssl" ? "ssl" : "domains"} />
              </div>
            )}
          </div>

          {/* Certificados (fica montado para o painel lateral abrir de qualquer aba) */}
          <div style={{ display: view === "ssl" ? "flex" : "none", flexDirection: "column" }}>
            <SslCertsPanel
              canEdit={canEdit}
              canDelete={canDelete}
              filter={fSsl}
              onClearFilter={() => setFSsl(null)}
              openId={certOpenId}
              setOpenId={setCertOpenId}
            />
          </div>

          {/* Domínios */}
          <div style={{ display: view === "dom" ? "flex" : "none", flexDirection: "column" }}>
            <div className="dssl-toolbar">
              <label className="dssl-search">
                <Search size={14} />
                <input
                  value={qDom}
                  onChange={(e) => setQDom(e.target.value)}
                  placeholder="Buscar domínio"
                  aria-label="Buscar domínios"
                />
              </label>
              {fDom && (
                <button type="button" className="dssl-chip" onClick={() => setFDom(null)}>
                  {SITUACAO_LABEL[fDom]} <X size={14} aria-label="Remover filtro" />
                </button>
              )}
              {canEdit && (
                <div className="dssl-actions">
                  <button
                    className="dssl-btn"
                    onClick={() => refreshAllMut.mutate()}
                    disabled={refreshAllMut.isPending || domains.length === 0}
                  >
                    <RefreshCw size={14} className={refreshAllMut.isPending ? "dssl-spin" : ""} />
                    Atualizar todos
                  </button>
                  <NewDomainDialog onSubmit={(d) => createMut.mutateAsync(d)} pending={createMut.isPending} />
                </div>
              )}
            </div>

            {q.isLoading ? (
              <div className="dssl-loading">
                <Loader2 size={14} className="dssl-spin" /> Carregando…
              </div>
            ) : domains.length === 0 ? (
              <div className="dssl-empty">Nenhum domínio cadastrado ainda.</div>
            ) : domRows.length === 0 ? (
              <div className="dssl-empty">Nenhum domínio com esses filtros.</div>
            ) : (
              <div className="dssl-scroll">
                <table className="dssl-table">
                  <thead>
                    <tr>
                      <th>Domínio</th>
                      <th>Registro</th>
                      <th>Criação</th>
                      <th>Última mudança</th>
                      <th>Validade</th>
                      <th>Vence em</th>
                      <th className="r">Alerta (dias)</th>
                      <th>Status</th>
                      <th className="r">
                        <span className="sr-only">Ações</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {domRows.map((d) => {
                      const days = domDays(d);
                      return (
                        <tr
                          key={d.id}
                          className="clickable"
                          tabIndex={0}
                          onClick={() => setDomOpenId(d.id)}
                          onKeyDown={(e) => e.key === "Enter" && setDomOpenId(d.id)}
                        >
                          <td className="mono" style={{ fontWeight: 500 }}>
                            {d.domain_name}
                          </td>
                          <td className="dim">{regLabel(d.registrar)}</td>
                          <td className="mono dim">{fmtDate(d.created_date)}</td>
                          <td className="mono dim">{fmtDate(d.last_changed_date)}</td>
                          <td className="mono dim">{fmtDate(d.expiry_date)}</td>
                          <td>
                            <DaysChip days={days} alertDays={d.alert_days ?? 30} />
                          </td>
                          <td className="r" onClick={(e) => e.stopPropagation()}>
                            {canEdit ? (
                              <input
                                type="number"
                                min={1}
                                max={365}
                                defaultValue={d.alert_days}
                                className="dssl-days-input"
                                aria-label={`Dias de alerta de ${d.domain_name}`}
                                onBlur={(e) => {
                                  const v = parseInt(e.target.value, 10);
                                  if (v && v !== d.alert_days) updateMut.mutate({ id: d.id, alert_days: v });
                                }}
                              />
                            ) : (
                              <span className="mono dim">{d.alert_days}</span>
                            )}
                          </td>
                          <td>
                            <StatusBadge status={d.status} />
                          </td>
                          <td onClick={(e) => e.stopPropagation()}>
                            <div className="dssl-row-act">
                              {canEdit && (
                                <button
                                  className="dssl-btn icon-only"
                                  onClick={() => refreshMut.mutate(d.id)}
                                  disabled={refreshMut.isPending}
                                  title="Revalidar agora"
                                  aria-label={`Revalidar ${d.domain_name}`}
                                >
                                  <RefreshCw
                                    size={14}
                                    className={refreshMut.isPending && refreshMut.variables === d.id ? "dssl-spin" : ""}
                                  />
                                </button>
                              )}
                              {canDelete && (
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <button
                                      className="dssl-btn icon-only danger"
                                      title="Remover"
                                      aria-label={`Remover ${d.domain_name}`}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Remover domínio</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Tem certeza que deseja remover <b>{d.domain_name}</b>? Esta ação não pode ser
                                        desfeita.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => deleteMut.mutate(d.id)}>Remover</AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <div className="dssl-note">
              <Bell size={14} />
              <span>
                Alertas por e-mail diariamente às 09h (Brasília) para administradores globais, administradores do módulo
                e o departamento escolhido, conforme o "Alerta (dias)" de cada domínio.
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Painel lateral: domínio ──────────────────────────────────────────── */}
      <DetailSheet
        open={!!openDomain}
        onOpenChange={(o) => !o && setDomOpenId(null)}
        eyebrow={openDomain ? `Domínio · vence em ${fmtDate(openDomain.expiry_date)}` : null}
        title={openDomain?.domain_name ?? ""}
        badges={
          openDomain && (
            <>
              <StatusBadge status={openDomain.status} />
              <DaysChip days={domDays(openDomain)} alertDays={openDomain.alert_days ?? 30} />
            </>
          )
        }
        footer={
          openDomain && canEdit ? (
            <button
              className="dssl-btn"
              onClick={() => refreshMut.mutate(openDomain.id)}
              disabled={refreshMut.isPending}
            >
              <RefreshCw size={14} className={refreshMut.isPending ? "dssl-spin" : ""} /> Revalidar agora
            </button>
          ) : null
        }
      >
        {openDomain && (
          <>
            <DetailSection title="Registro">
              <DetailList
                items={[
                  ["Registrador", regLabel(openDomain.registrar)],
                  ["Criação", fmtDate(openDomain.created_date), true],
                  ["Última mudança", fmtDate(openDomain.last_changed_date), true],
                  ["Validade", fmtDate(openDomain.expiry_date), true],
                  ["Alerta", `${openDomain.alert_days} dias antes`],
                  [
                    "Última verificação",
                    openDomain.last_checked_at ? new Date(openDomain.last_checked_at).toLocaleString("pt-BR") : "—",
                    true,
                  ],
                ]}
              />
            </DetailSection>
            {openDomain.last_check_error && (
              <div className="dssl-warn" style={{ fontFamily: "var(--font-ui)" }}>
                <AlertTriangle size={14} />
                <span>Aviso na última verificação: {openDomain.last_check_error}</span>
              </div>
            )}
            {isExp(domDays(openDomain)) && (
              <div className="dssl-warn" style={{ fontFamily: "var(--font-ui)" }}>
                <AlertTriangle size={14} />
                <span>
                  Registro expirado. Se o domínio ainda for usado, renove no registrador antes que ele fique disponível
                  para terceiros.
                </span>
              </div>
            )}
          </>
        )}
      </DetailSheet>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// NEW DOMAIN DIALOG — logic UNCHANGED
// ══════════════════════════════════════════════════════════════════════════════
function NewDomainDialog({
  onSubmit,
  pending,
}: {
  onSubmit: (data: { domain_name: string; alert_days: number }) => Promise<unknown>;
  pending: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [days, setDays] = React.useState(30);
  const qc = useQueryClient();
  const syncFn = useServerFn(syncCloudflareZonesAsDomains);
  const syncMut = useMutation({
    mutationFn: () => syncFn(),
    onSuccess: (r) => {
      toast.success(
        `Sincronização concluída: ${r.added} novos, ${r.skipped} já existiam${r.failed ? `, ${r.failed} falharam` : ""}`,
      );
      qc.invalidateQueries({ queryKey: ["domains"] });
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao sincronizar zonas"),
  });
  const submit = async () => {
    try {
      await onSubmit({ domain_name: name.trim().toLowerCase(), alert_days: days });
      setOpen(false);
      setName("");
      setDays(30);
    } catch {}
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <button className="dssl-btn primary">
          <Plus size={14} /> Novo domínio
        </button>
      </DialogTrigger>
      <DialogContent style={{ background: "var(--v2-surface)", border: "1px solid var(--v2-line-strong)", borderRadius: 12, color: "var(--v2-fg)" }}>
        <DialogHeader>
          <DialogTitle
            style={{ fontFamily: "var(--font-ui)", fontSize: 16, fontWeight: 600, color: "var(--v2-fg)" }}
          >
            Cadastrar domínio
          </DialogTitle>
        </DialogHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 8 }}>
          <button
            className="dssl-btn outline"
            style={{ alignSelf: "flex-start" }}
            onClick={() => syncMut.mutate()}
            disabled={syncMut.isPending}
          >
            {syncMut.isPending ? <Loader2 size={12} className="dssl-spin" /> : <Cloud size={12} />}
            Sincronizar zonas Cloudflare
          </button>
          <div className="dssl-dlg-field">
            <span className="dssl-dlg-label">Domínio</span>
            <input
              className="dssl-dlg-input"
              placeholder="exemplo.com.br"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <span className="dssl-dlg-hint">
              O registrador é detectado automaticamente pelo WHOIS/RDAP ao cadastrar.
            </span>
          </div>
          <div className="dssl-dlg-field">
            <span className="dssl-dlg-label">Alerta (dias antes do vencimento)</span>
            <input
              type="number"
              min={1}
              max={365}
              className="dssl-dlg-input"
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value, 10) || 30)}
            />
          </div>
        </div>
        <DialogFooter style={{ gap: 8, paddingTop: 8 }}>
          <button className="dssl-btn outline" onClick={() => setOpen(false)} disabled={pending}>
            Cancelar
          </button>
          <button className="dssl-btn primary" onClick={submit} disabled={pending || !name.trim()}>
            {pending && <Loader2 size={12} className="dssl-spin" />} Cadastrar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SSL CERTS PANEL
// ══════════════════════════════════════════════════════════════════════════════
function SslCertsPanel({
  canEdit,
  canDelete,
  filter,
  onClearFilter,
  openId,
  setOpenId,
}: {
  canEdit: boolean;
  canDelete: boolean;
  /** Situação vinda dos KPIs (vencidos / a vencer) */
  filter: Situacao;
  onClearFilter: () => void;
  /** Certificado aberto no painel lateral (controlado pela tela, para abrir também pelos "Próximos vencimentos") */
  openId: string | null;
  setOpenId: (id: string | null) => void;
}) {
  const qc = useQueryClient();
  const listFn = useServerFn(listSslCerts);
  const createFn = useServerFn(importSslCert);
  const refreshFn = useServerFn(refreshSslCert);
  const refreshAllFn = useServerFn(refreshAllSslCerts);
  const deleteFn = useServerFn(deleteSslCert);
  const updateFn = useServerFn(updateSslCert);

  const renewFn = useServerFn(renewSslCert);

  const q = useQuery({ queryKey: ["ssl_certificates"], queryFn: () => listFn() });
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["ssl_certificates"] });
    qc.invalidateQueries({ queryKey: ["ssl_certificate_details"] });
  };

  const detailId = openId;
  const setDetailId = setOpenId;
  const [busca, setBusca] = React.useState("");
  const [renewTarget, setRenewTarget] = React.useState<SslRow | null>(null);

  const createMut = useMutation({
    mutationFn: (data: { pem: string; alert_days: number; force_new?: boolean }) => createFn({ data }),
    onSuccess: (r) => {
      // needsDecision: o diálogo pergunta se é renovação ou certificado novo.
      if (r.needsDecision) return;
      toast.success("Certificado importado");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao importar"),
  });
  const renewMut = useMutation({
    mutationFn: (data: { id: string; pem: string }) => renewFn({ data }),
    onSuccess: (r) => {
      toast.success(`Certificado renovado — novo vencimento ${fmtDate(r.cert.valid_to)}`);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao renovar"),
  });
  const refreshMut = useMutation({
    mutationFn: (id: string) => refreshFn({ data: { id } }),
    onSuccess: (r) => {
      toast.success(
        r.cert.last_check_error ? `Atualizado com aviso: ${r.cert.last_check_error}` : "Certificado atualizado",
      );
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao atualizar"),
  });
  const refreshAllMut = useMutation({
    mutationFn: () => refreshAllFn(),
    onSuccess: (r) => {
      toast.success(`${r.ok}/${r.total} certificados atualizados`);
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao atualizar"),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Certificado removido");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao remover"),
  });
  const updateMut = useMutation({
    mutationFn: (data: { id: string; alert_days?: number }) => updateFn({ data }),
    onSuccess: () => {
      toast.success("Atualizado");
      invalidate();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro"),
  });
  const alertFn = useServerFn(triggerSslAlertCheck);
  const alertMut = useMutation({
    mutationFn: () => alertFn(),
    onSuccess: (r: any) => {
      if (r.debug) console.table(r.debug);
      if (r.smtp) console.log("SMTP:", r.smtp);
      if (r.destinatarios) console.log("Destinatários:", r.destinatarios);
      if (r.todayMidnight) console.log("Hoje meia-noite:", r.todayMidnight, "BRT:", r.startTodayBRT);
      if (r.notified === 0 && r.certs === 0) {
        const semPrazo = (r.debug ?? []).map((d: any) => `${d.domain}: ${d.reason}`).join("\n");
        toast.info(`Nenhum certificado no prazo.\n\n${semPrazo}`, { duration: 8000 });
      } else if (r.notified === 0) {
        const smtp = r.smtp === "NAO_CONFIGURADO" ? "SMTP não configurado!" : `SMTP: ${r.smtp}`;
        const dest = r.destinatarios?.length
          ? `Destinatários: ${r.destinatarios.join(", ")}`
          : "Nenhum destinatário configurado!";
        toast.warning(`${r.certs} cert(s) no prazo mas e-mail não enviado.\n${smtp}\n${dest}`, { duration: 10000 });
      } else {
        toast.success(`Alerta enviado para ${r.notified} destinatário(s) — ${r.certs} certificado(s) no prazo.`);
      }
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao enviar alerta"),
  });

  const certs = q.data?.certs ?? [];
  useLiveDate();

  const rows = certs
    .filter((c) => matchSituacao(filter, calcDaysToExpire(c.valid_to), c.alert_days ?? 30))
    .filter((c) => {
      const t = busca.trim().toLowerCase();
      return !t || c.domain_name.toLowerCase().includes(t) || (c.issuer ?? "").toLowerCase().includes(t);
    })
    .sort((a, b) => byDays(calcDaysToExpire(a.valid_to), calcDaysToExpire(b.valid_to)));

  return (
    <>
      <div className="dssl-toolbar">
        <label className="dssl-search">
          <Search size={14} />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar domínio ou emissor"
            aria-label="Buscar certificados"
          />
        </label>
        {filter && (
          <button type="button" className="dssl-chip" onClick={onClearFilter}>
            {SITUACAO_LABEL[filter]} <X size={14} aria-label="Remover filtro" />
          </button>
        )}
        {canEdit && (
          <div className="dssl-actions">
            <button className="dssl-btn ghost" onClick={() => alertMut.mutate()} disabled={alertMut.isPending}>
              <Bell size={14} className={alertMut.isPending ? "dssl-spin" : ""} /> Testar alertas
            </button>
            <button
              className="dssl-btn"
              onClick={() => refreshAllMut.mutate()}
              disabled={refreshAllMut.isPending || certs.length === 0}
            >
              <RefreshCw size={14} className={refreshAllMut.isPending ? "dssl-spin" : ""} /> Atualizar todos
            </button>
            <ImportSslDialog
              onSubmit={(d) => createMut.mutateAsync(d)}
              onRenew={(d) => renewMut.mutateAsync(d)}
              pending={createMut.isPending || renewMut.isPending}
              onChanged={invalidate}
            />
          </div>
        )}
      </div>

      {q.isLoading ? (
        <div className="dssl-loading">
          <Loader2 size={14} className="dssl-spin" /> Carregando…
        </div>
      ) : certs.length === 0 ? (
        <div className="dssl-empty">Nenhum certificado SSL cadastrado ainda.</div>
      ) : rows.length === 0 ? (
        <div className="dssl-empty">Nenhum certificado com esses filtros.</div>
      ) : (
        <div className="dssl-scroll">
          <table className="dssl-table">
            <thead>
              <tr>
                <th>Domínio</th>
                <th>Origem</th>
                <th>Emissor</th>
                <th>Validade</th>
                <th>Vence em</th>
                <th className="r">Alerta (dias)</th>
                <th>Status</th>
                <th className="r">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const days = calcDaysToExpire(c.valid_to);
                return (
                  <tr
                    key={c.id}
                    className="clickable"
                    tabIndex={0}
                    onClick={() => setDetailId(c.id)}
                    onKeyDown={(e) => e.key === "Enter" && setDetailId(c.id)}
                  >
                    <td>
                      <span className="mono" style={{ fontWeight: 500 }}>
                        {c.domain_name}
                      </span>
                      <span className="dssl-row-tags">
                        {c.bindings_count > 0 && (
                          <span
                            className="dssl-row-tag"
                            title={
                              c.sync_kind === "cloudflare"
                                ? `${c.bindings_count} host(s) com proxy na Cloudflare`
                                : `${c.bindings_count} URL(s) vinculada(s)`
                            }
                          >
                            <Link2 size={10} /> {c.bindings_count}
                          </span>
                        )}
                        {c.notes && (
                          <span className="dssl-row-tag" title="Possui observações">
                            <StickyNote size={10} />
                          </span>
                        )}
                      </span>
                    </td>
                    <td>
                      <SyncKindTag kind={c.sync_kind} />
                    </td>
                    <td className="dim">{c.issuer || "—"}</td>
                    <td className="mono dim">{fmtDate(c.valid_to)}</td>
                    <td>
                      <DaysChip days={days} alertDays={c.alert_days ?? 30} />
                    </td>
                    <td className="r" onClick={(e) => e.stopPropagation()}>
                      {canEdit ? (
                        <input
                          type="number"
                          min={1}
                          max={365}
                          defaultValue={c.alert_days}
                          className="dssl-days-input"
                          aria-label={`Dias de alerta de ${c.domain_name}`}
                          onBlur={(e) => {
                            const v = parseInt(e.target.value, 10);
                            if (v && v !== c.alert_days) updateMut.mutate({ id: c.id, alert_days: v });
                          }}
                        />
                      ) : (
                        <span className="mono dim">{c.alert_days}</span>
                      )}
                    </td>
                    <td>
                      <StatusBadge status={c.status} />
                    </td>
                    <td onClick={(e) => e.stopPropagation()}>
                      <div className="dssl-row-act">
                        {canEdit && c.source === "imported" && (
                          <button
                            className="dssl-btn icon-only success"
                            onClick={() => setRenewTarget(c)}
                            title="Renovar (substituir por novo arquivo)"
                            aria-label={`Renovar ${c.domain_name}`}
                          >
                            <FileUp size={14} />
                          </button>
                        )}
                        {canEdit && c.source !== "imported" && (
                          <button
                            className="dssl-btn icon-only"
                            onClick={() => refreshMut.mutate(c.id)}
                            disabled={refreshMut.isPending}
                            title="Revalidar agora"
                            aria-label={`Revalidar ${c.domain_name}`}
                          >
                            <RefreshCw
                              size={14}
                              className={refreshMut.isPending && refreshMut.variables === c.id ? "dssl-spin" : ""}
                            />
                          </button>
                        )}
                        {canDelete && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button
                                className="dssl-btn icon-only danger"
                                title="Remover"
                                aria-label={`Remover ${c.domain_name}`}
                              >
                                <Trash2 size={14} />
                              </button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>Remover certificado</AlertDialogTitle>
                                <AlertDialogDescription>
                                  Tem certeza que deseja remover o certificado de <b>{c.domain_name}</b>?
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                <AlertDialogAction onClick={() => deleteMut.mutate(c.id)}>Remover</AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="dssl-note">
        <ShieldCheck size={14} />
        <span>
          Validade e emissor vêm do certificado público do domínio; certificados importados usam o arquivo e são
          renovados pelo botão Renovar. Clique numa linha para ver detalhes, URLs vinculadas e histórico.
        </span>
      </div>

      <SslCertDetailsSheet
        certId={detailId}
        onOpenChange={(v) => !v && setDetailId(null)}
        canEdit={canEdit}
        onRenew={(c) => setRenewTarget(c)}
        onChanged={invalidate}
        onRefresh={(id) => refreshMut.mutate(id)}
        refreshing={refreshMut.isPending}
      />
      <RenewSslDialog
        cert={renewTarget}
        onClose={() => setRenewTarget(null)}
        onSubmit={(pem) => renewMut.mutateAsync({ id: renewTarget!.id, pem })}
        pending={renewMut.isPending}
      />
    </>
  );
}

// Lê .crt/.pem/.cer/.der: PEM vai como texto, DER binário vai em base64.
async function readCertFile(f: File): Promise<string> {
  const text = await f.text();
  if (text.includes("-----BEGIN CERTIFICATE-----")) return text;
  const bytes = new Uint8Array(await f.arrayBuffer());
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

const CERT_FILE_ACCEPT = ".crt,.pem,.cer,.der,application/x-x509-ca-cert,application/pkix-cert";
const SYNC_KIND: Record<SslRow["sync_kind"], { label: string; hint: string; cls: string }> = {
  imported: {
    label: "Importado",
    hint: "Dados lidos do arquivo do certificado; renovado manualmente.",
    cls: "",
  },
  cloudflare: {
    label: "Cloudflare",
    hint: "Certificado da borda da Cloudflare, servido nos hosts proxyados da zona. Revalidado automaticamente.",
    cls: "cf",
  },
  public: {
    label: "Sincronizado",
    hint: "Verificação pública do certificado do domínio (fora da Cloudflare ou sem proxy). Revalidado automaticamente.",
    cls: "pub",
  },
};

function SyncKindTag({ kind }: { kind: SslRow["sync_kind"] }) {
  const k = SYNC_KIND[kind];
  const Icon = kind === "imported" ? FileUp : kind === "cloudflare" ? Cloud : RefreshCw;
  return (
    <span className={`dssl-src ${k.cls}`} title={k.hint}>
      <Icon size={13} /> {k.label}
    </span>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// RENEW SSL DIALOG — substitui o certificado importado no mesmo registro
// ══════════════════════════════════════════════════════════════════════════════
function RenewSslDialog({
  cert,
  onClose,
  onSubmit,
  pending,
}: {
  cert: SslRow | null;
  onClose: () => void;
  onSubmit: (pem: string) => Promise<unknown>;
  pending: boolean;
}) {
  const [pem, setPem] = React.useState("");
  const [fileName, setFileName] = React.useState("");
  React.useEffect(() => {
    if (!cert) {
      setPem("");
      setFileName("");
    }
  }, [cert]);

  const submit = async () => {
    try {
      await onSubmit(pem);
      onClose();
    } catch {}
  };

  return (
    <Dialog open={!!cert} onOpenChange={(v) => !v && onClose()}>
      <DialogContent style={{ background: "var(--v2-surface)", border: "1px solid var(--v2-line-strong)", borderRadius: 12, color: "var(--v2-fg)" }}>
        <DialogHeader>
          <DialogTitle
            style={{ fontFamily: "var(--font-ui)", fontSize: 16, fontWeight: 600, color: "var(--v2-fg)" }}
          >
            Renovar certificado
          </DialogTitle>
        </DialogHeader>
        {cert && (
          <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 8 }}>
            <div className="dssl-sh-section">
              <div className="dssl-sh-grid">
                <div className="dssl-sh-full">
                  <div className="dssl-sh-k">Domínio</div>
                  <div className="dssl-sh-v mono">{cert.domain_name}</div>
                </div>
                <div>
                  <div className="dssl-sh-k">Emissor atual</div>
                  <div className="dssl-sh-v">{cert.issuer || "—"}</div>
                </div>
                <div>
                  <div className="dssl-sh-k">Vence em</div>
                  <div className="dssl-sh-v mono">{fmtDate(cert.valid_to)}</div>
                </div>
              </div>
            </div>
            <div className="dssl-dlg-field">
              <span className="dssl-dlg-label">Novo arquivo do certificado (.crt, .pem, .cer)</span>
              <input
                type="file"
                accept={CERT_FILE_ACCEPT}
                onChange={async (e) => {
                  const f = e.target.files?.[0] ?? null;
                  setFileName(f?.name ?? "");
                  setPem(f ? await readCertFile(f) : "");
                }}
                className="dssl-dlg-input"
                style={{ cursor: "pointer" }}
              />
              {fileName && <span className="dssl-dlg-hint">Selecionado: {fileName}</span>}
              <span className="dssl-dlg-hint">
                O registro é atualizado no lugar: alerta, observações e URLs vinculadas são mantidos, e a versão
                anterior fica no histórico. O domínio do arquivo precisa ser o mesmo.
              </span>
            </div>
          </div>
        )}
        <DialogFooter style={{ gap: 8, paddingTop: 8 }}>
          <button className="dssl-btn outline" onClick={onClose} disabled={pending}>
            Cancelar
          </button>
          <button className="dssl-btn success" onClick={submit} disabled={pending || !pem}>
            {pending ? <Loader2 size={12} className="dssl-spin" /> : <FileUp size={12} />} Renovar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Hosts proxyados da zona que recebem o certificado da borda — lidos dos
// registros DNS sincronizados, sem cadastro manual.
function EdgeHostsList({ edge }: { edge: SslEdgeInfo }) {
  const uncovered = edge.hosts.filter((h) => !h.covered);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div className="dssl-dlg-hint" style={{ display: "flex", gap: 6 }}>
        <Cloud size={12} style={{ flexShrink: 0, marginTop: 2, color: T.warning }} />
        <span>
          Servido pela borda da Cloudflare (zona <b>{edge.zone}</b>) somente nos registros proxyados. Registros
          DNS-only usam o certificado do servidor de origem — cadastre-o como certificado importado.
        </span>
      </div>
      {uncovered.length > 0 && (
        <div
          style={{
            display: "flex",
            gap: 6,
            fontSize: 11.5,
            lineHeight: 1.5,
            padding: "8px 10px",
            borderRadius: 7,
            background: T.warningBg,
            border: "1px solid rgba(245,158,11,0.3)",
          }}
        >
          <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 2, color: T.warning }} />
          <span>
            {uncovered.length} host(s) com dois ou mais níveis de subdomínio não são cobertos pelo Universal SSL
            (*.{edge.zone}). Confira se há um certificado avançado na Cloudflare para eles.
          </span>
        </div>
      )}
      <div className="dssl-sh-list">
        {edge.hosts.map((h) => (
          <div
            key={h.name}
            className="dssl-sh-item"
            style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 }}
          >
            {h.name.startsWith("*") ? (
              <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 }}>{h.name}</span>
            ) : (
              <a href={`https://${h.name}`} target="_blank" rel="noopener noreferrer">
                {h.name}
              </a>
            )}
            <span style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
              {!h.covered && (
                <span className="dssl-days danger" title="Fora da cobertura do Universal SSL">
                  Não coberto
                </span>
              )}
              <span style={{ fontSize: 10, color: T.neutral, fontFamily: "'IBM Plex Mono',monospace" }}>{h.type}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// SSL CERT DETAILS SHEET — mesmo padrão do HostDetailsSheet (Shadow IT)
// ══════════════════════════════════════════════════════════════════════════════

type BindingDraft = { key: number; url: string; description: string };

function SslCertDetailsSheet({
  certId,
  onOpenChange,
  canEdit,
  onRenew,
  onChanged,
  onRefresh,
  refreshing,
}: {
  certId: string | null;
  onOpenChange: (v: boolean) => void;
  canEdit: boolean;
  onRenew: (c: SslRow) => void;
  onChanged: () => void;
  onRefresh: (id: string) => void;
  refreshing: boolean;
}) {
  // Mantém o último id enquanto o Sheet anima a saída.
  const [lastId, setLastId] = React.useState<string | null>(certId);
  React.useEffect(() => {
    if (certId) setLastId(certId);
  }, [certId]);
  const id = certId ?? lastId;

  const detailsFn = useServerFn(getSslCertDetails);
  const metaFn = useServerFn(updateSslCertMeta);
  const q = useQuery({
    queryKey: ["ssl_certificate_details", id],
    queryFn: () => detailsFn({ data: { id: id! } }),
    enabled: !!id,
  });

  const [editing, setEditing] = React.useState(false);
  const [notesDraft, setNotesDraft] = React.useState("");
  const [bindingsDraft, setBindingsDraft] = React.useState<BindingDraft[]>([]);
  const keyRef = React.useRef(0);
  React.useEffect(() => {
    setEditing(false);
  }, [certId]);

  const startEdit = () => {
    const d = q.data;
    if (!d) return;
    setNotesDraft(d.cert.notes ?? "");
    setBindingsDraft(
      d.bindings.map((b) => ({ key: keyRef.current++, url: b.url, description: b.description ?? "" })),
    );
    setEditing(true);
  };

  const saveMut = useMutation({
    mutationFn: () =>
      metaFn({
        data: {
          id: id!,
          notes: notesDraft.trim() ? notesDraft : null,
          // Borda Cloudflare: hosts são automáticos, só as observações são editáveis.
          bindings: (q.data?.edge ? [] : bindingsDraft)
            .filter((b) => b.url.trim())
            .map((b) => ({ url: b.url.trim(), description: b.description.trim() || null })),
        },
      }),
    onSuccess: () => {
      toast.success("Certificado atualizado");
      setEditing(false);
      onChanged();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao salvar"),
  });

  if (!id) return null;
  const d = q.data;
  const c = d?.cert;
  const days = c ? calcDaysToExpire(c.valid_to) : null;

  return (
    <DetailSheet
      open={!!certId}
      onOpenChange={onOpenChange}
      width={560}
      eyebrow={c ? `Certificado · vence em ${fmtDate(c.valid_to)}` : "Certificado"}
      title={c?.domain_name ?? "Certificado"}
      badges={
        c && (
          <>
            <StatusBadge status={c.status} />
            <DaysChip days={days} alertDays={c.alert_days ?? 30} />
            <SyncKindTag kind={c.sync_kind} />
          </>
        )
      }
      footer={
        c && canEdit && !editing ? (
          <>
            <button className="dssl-btn ghost" onClick={startEdit}>
              <Pencil size={14} /> {d?.edge ? "Editar observações" : "Editar URLs e observações"}
            </button>
            {c.source === "imported" ? (
              <button className="dssl-btn primary" onClick={() => onRenew(c)}>
                <FileUp size={14} /> Renovar
              </button>
            ) : (
              <button className="dssl-btn" onClick={() => onRefresh(c.id)} disabled={refreshing}>
                <RefreshCw size={14} className={refreshing ? "dssl-spin" : ""} /> Revalidar agora
              </button>
            )}
          </>
        ) : null
      }
    >
      {q.isError ? (
        <div className="dssl-sh-empty">{(q.error as any)?.message ?? "Erro ao carregar o certificado."}</div>
      ) : !d || !c ? (
        <div className="dssl-loading">
          <Loader2 size={14} className="dssl-spin" /> Carregando…
        </div>
      ) : (
        <>
          {/* Certificado */}
          <DetailSection title="Certificado">
            <DetailList
              items={[
                ["Emissor", c.issuer || "—"],
                ["Emissão", fmtDate(c.valid_from), true],
                ["Validade", fmtDate(c.valid_to), true],
                ["Alerta", `${c.alert_days} dias antes`],
                ...(c.subject_alt_names && c.subject_alt_names.length > 0
                  ? ([["Nomes cobertos (SAN)", c.subject_alt_names.join(", "), true]] as Array<[string, string, boolean]>)
                  : []),
                ...(c.fingerprint_sha256
                  ? ([["Fingerprint SHA-256", c.fingerprint_sha256, true]] as Array<[string, string, boolean]>)
                  : []),
                ...(c.serial_number
                  ? ([["Número de série", c.serial_number, true]] as Array<[string, string, boolean]>)
                  : []),
              ]}
            />
            {c.source === "imported" && !c.fingerprint_sha256 && (
              <p className="dssl-dlg-hint" style={{ margin: "8px 0 0" }}>
                Importado antes do registro de fingerprint. Na próxima renovação, esses dados passam a ser gravados.
              </p>
            )}
          </DetailSection>

          {/* URLs vinculadas / hosts com proxy */}
          <DetailSection
            title={`${d.edge ? "Hosts com proxy (Cloudflare)" : "URLs vinculadas"} (${d.edge ? d.edge.hosts.length : d.bindings.length})`}
          >
            {editing ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {!d.edge && (
                  <div className="dssl-dlg-field">
                    <span className="dssl-dlg-label">URLs / hosts onde o certificado está instalado</span>
                    {bindingsDraft.length === 0 && <span className="dssl-sh-empty">Nenhuma URL.</span>}
                    {bindingsDraft.map((b) => (
                      <div key={b.key} className="dssl-sh-edit-row">
                        <input
                          className="dssl-dlg-input"
                          placeholder="https://app.dominio.com.br"
                          value={b.url}
                          maxLength={500}
                          aria-label="URL"
                          onChange={(e) =>
                            setBindingsDraft((prev) =>
                              prev.map((x) => (x.key === b.key ? { ...x, url: e.target.value } : x)),
                            )
                          }
                          style={{ flex: 3 }}
                        />
                        <input
                          className="dssl-dlg-input"
                          placeholder="Descrição (opcional)"
                          value={b.description}
                          maxLength={300}
                          aria-label="Descrição"
                          onChange={(e) =>
                            setBindingsDraft((prev) =>
                              prev.map((x) => (x.key === b.key ? { ...x, description: e.target.value } : x)),
                            )
                          }
                          style={{ flex: 2 }}
                        />
                        <button
                          className="dssl-btn icon-only danger"
                          title="Remover URL"
                          aria-label="Remover URL"
                          onClick={() => setBindingsDraft((prev) => prev.filter((x) => x.key !== b.key))}
                          style={{ marginTop: 3 }}
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    <button
                      className="dssl-btn"
                      style={{ alignSelf: "flex-start" }}
                      onClick={() =>
                        setBindingsDraft((prev) => [...prev, { key: keyRef.current++, url: "", description: "" }])
                      }
                    >
                      <Plus size={14} /> Adicionar URL
                    </button>
                  </div>
                )}
                <div className="dssl-dlg-field">
                  <span className="dssl-dlg-label">Observações</span>
                  <textarea
                    className="dssl-dlg-input"
                    rows={5}
                    maxLength={5000}
                    placeholder="Ex.: instalado no IIS do servidor X; responsável; onde renovar…"
                    value={notesDraft}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    style={{ resize: "vertical" }}
                  />
                </div>
                <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                  <button className="dssl-btn ghost" onClick={() => setEditing(false)} disabled={saveMut.isPending}>
                    Cancelar
                  </button>
                  <button className="dssl-btn primary" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
                    {saveMut.isPending && <Loader2 size={14} className="dssl-spin" />} Salvar
                  </button>
                </div>
              </div>
            ) : d.edge ? (
              <EdgeHostsList edge={d.edge} />
            ) : d.bindings.length === 0 ? (
              <div className="dssl-sh-empty">
                Nenhuma URL vinculada.
                {canEdit ? " Use Editar para informar onde este certificado está instalado." : ""}
              </div>
            ) : (
              <div className="dssl-sh-list">
                {d.bindings.map((b) => (
                  <div key={b.id} className="dssl-sh-item">
                    {/^https?:\/\//i.test(b.url) ? (
                      <a href={b.url} target="_blank" rel="noopener noreferrer">
                        {b.url}
                      </a>
                    ) : (
                      <span className="mono">{b.url}</span>
                    )}
                    {b.description && <span className="dssl-dlg-hint">{b.description}</span>}
                  </div>
                ))}
              </div>
            )}
          </DetailSection>

          {/* Observações */}
          {!editing && (
            <DetailSection title="Observações">
              {c.notes ? (
                <div className="dssl-sh-notes">{c.notes}</div>
              ) : (
                <div className="dssl-sh-empty">Sem observações.</div>
              )}
            </DetailSection>
          )}

          {/* Histórico */}
          {d.history.length > 0 && (
            <DetailSection title="Histórico de renovações">
              <ul className="dssl-hist">
                {d.history.map((h) => (
                  <li key={h.id}>
                    <div>
                      {h.issuer || "—"} · {fmtDate(h.valid_from)} até {fmtDate(h.valid_to)}
                      <small>
                        Substituído em {new Date(h.replaced_at).toLocaleString("pt-BR")}
                        {h.replaced_by_name ? ` por ${h.replaced_by_name}` : ""}
                      </small>
                      {h.fingerprint_sha256 && <code>{h.fingerprint_sha256}</code>}
                    </div>
                  </li>
                ))}
              </ul>
            </DetailSection>
          )}
        </>
      )}
    </DetailSheet>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// IMPORT SSL DIALOG
// ══════════════════════════════════════════════════════════════════════════════
type ImportDecision = {
  parsed: { domain_name: string; issuer: string; valid_from: string; valid_to: string };
  candidates: Array<{ id: string; issuer: string; valid_from: string | null; valid_to: string | null }>;
};

function ImportSslDialog({
  onSubmit,
  onRenew,
  pending,
  onChanged,
}: {
  onSubmit: (data: {
    pem: string;
    alert_days: number;
    force_new?: boolean;
  }) => Promise<{ needsDecision: false } | ({ needsDecision: true } & ImportDecision)>;
  onRenew: (data: { id: string; pem: string }) => Promise<unknown>;
  pending: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [pem, setPem] = React.useState("");
  const [fileName, setFileName] = React.useState("");
  const [days, setDays] = React.useState(30);
  const [lookupDomain, setLookupDomain] = React.useState("");
  // Já existe importado pro mesmo domínio: usuário escolhe renovar um deles
  // (atualiza no lugar) ou adicionar como certificado separado.
  const [decision, setDecision] = React.useState<ImportDecision | null>(null);

  const lookupFn = useServerFn(createSslCertByDomain);
  const syncCfFn = useServerFn(syncCloudflareZonesAsSslCerts);

  const lookupMut = useMutation({
    mutationFn: (domain_name: string) => lookupFn({ data: { domain_name, alert_days: days } }),
    onSuccess: (r) => {
      if (!r.ok) {
        toast.error(r.error);
        return;
      }
      toast.success("Certificado adicionado");
      setLookupDomain("");
      onChanged();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao buscar certificado"),
  });
  const syncCfMut = useMutation({
    mutationFn: () => syncCfFn(),
    onSuccess: (r) => {
      toast.success(
        `Sincronização: ${r.added} importados, ${r.noCert} sem certificado, ${r.skipped} já existiam${r.failed ? `, ${r.failed} falharam` : ""}`,
      );
      onChanged();
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao sincronizar zonas"),
  });

  const onFile = async (f: File | null) => {
    setDecision(null);
    if (!f) {
      setPem("");
      setFileName("");
      return;
    }
    setFileName(f.name);
    setPem(await readCertFile(f));
  };
  const reset = () => {
    setOpen(false);
    setPem("");
    setFileName("");
    setDays(30);
    setDecision(null);
  };
  const submit = async (forceNew = false) => {
    try {
      const r = await onSubmit({ pem, alert_days: days, force_new: forceNew || undefined });
      if (r.needsDecision) {
        setDecision({ parsed: r.parsed, candidates: r.candidates });
        return;
      }
      reset();
    } catch {}
  };
  const renew = async (id: string) => {
    try {
      await onRenew({ id, pem });
      reset();
    } catch {}
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : reset())}>
      <DialogTrigger asChild>
        <button className="dssl-btn primary">
          <Plus size={14} /> Importar certificado
        </button>
      </DialogTrigger>
      <DialogContent style={{ background: "var(--v2-surface)", border: "1px solid var(--v2-line-strong)", borderRadius: 12, color: "var(--v2-fg)" }}>
        <DialogHeader>
          <DialogTitle
            style={{ fontFamily: "var(--font-ui)", fontSize: 16, fontWeight: 600, color: "var(--v2-fg)" }}
          >
            Importar certificado SSL
          </DialogTitle>
        </DialogHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 8 }}>
          {/* File upload */}
          <div className="dssl-dlg-field">
            <span className="dssl-dlg-label">Arquivo do certificado (.crt, .pem, .cer)</span>
            <input
              type="file"
              accept={CERT_FILE_ACCEPT}
              onChange={(e) => onFile(e.target.files?.[0] ?? null)}
              className="dssl-dlg-input"
              style={{ cursor: "pointer" }}
            />
            {fileName && <span className="dssl-dlg-hint">Selecionado: {fileName}</span>}
            <span className="dssl-dlg-hint">Domínio, emissor, datas e status extraídos automaticamente.</span>
          </div>

          {decision && (
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 8,
                padding: 12,
                borderRadius: 9,
                background: T.warningBg,
                border: "1px solid rgba(245,158,11,0.3)",
              }}
            >
              <div style={{ display: "flex", gap: 7, fontSize: 12, lineHeight: 1.5 }}>
                <AlertTriangle size={14} color={T.warning} style={{ flexShrink: 0, marginTop: 2 }} />
                <span>
                  Já existe certificado importado para <b>{decision.parsed.domain_name}</b>. O arquivo enviado (
                  {decision.parsed.issuer}, vence {fmtDate(decision.parsed.valid_to)}) é a renovação de um deles?
                </span>
              </div>
              {decision.candidates.map((cand) => (
                <div key={cand.id} className="dssl-choice">
                  <span style={{ fontSize: 12 }}>
                    {cand.issuer || "—"} · vence <span style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{fmtDate(cand.valid_to)}</span>
                  </span>
                  <button className="dssl-btn success" onClick={() => renew(cand.id)} disabled={pending}>
                    <FileUp size={12} /> Substituir este
                  </button>
                </div>
              ))}
              <button
                className="dssl-btn outline"
                style={{ alignSelf: "flex-start" }}
                onClick={() => submit(true)}
                disabled={pending}
              >
                <Plus size={12} /> Não, adicionar como outro certificado
              </button>
            </div>
          )}

          <div className="dssl-dlg-field">
            <span className="dssl-dlg-label">Alerta (dias antes do vencimento)</span>
            <input
              type="number"
              min={1}
              max={365}
              className="dssl-dlg-input"
              value={days}
              onChange={(e) => setDays(parseInt(e.target.value, 10) || 30)}
            />
          </div>

          <div className="dssl-dlg-sep" />
          <div className="dssl-dlg-section-label">Checar por domínio</div>

          {/* Domain lookup */}
          <div className="dssl-dlg-field">
            <div style={{ display: "flex", gap: 8 }}>
              <input
                className="dssl-dlg-input"
                placeholder="dominio.com"
                value={lookupDomain}
                onChange={(e) => setLookupDomain(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && lookupDomain.trim()) {
                    e.preventDefault();
                    lookupMut.mutate(lookupDomain.trim().toLowerCase());
                  }
                }}
                style={{ flex: 1 }}
              />
              <button
                className="dssl-btn primary"
                onClick={() => lookupDomain.trim() && lookupMut.mutate(lookupDomain.trim().toLowerCase())}
                disabled={lookupMut.isPending || !lookupDomain.trim()}
              >
                {lookupMut.isPending ? <Loader2 size={12} className="dssl-spin" /> : <Search size={12} />}
                Buscar SSL
              </button>
            </div>
            <span className="dssl-dlg-hint">Consulta o certificado SSL público do domínio e adiciona à lista.</span>
          </div>

          <div className="dssl-dlg-sep" />
          <div className="dssl-dlg-section-label">Sincronizar Cloudflare</div>

          {/* CF sync */}
          <div className="dssl-dlg-field">
            <button
              className="dssl-btn outline"
              style={{ width: "100%" }}
              onClick={() => syncCfMut.mutate()}
              disabled={syncCfMut.isPending}
            >
              {syncCfMut.isPending ? <Loader2 size={12} className="dssl-spin" /> : <Cloud size={12} />}
              Sincronizar zonas Cloudflare
            </button>
            <span className="dssl-dlg-hint">
              Importa apenas zonas com certificado SSL válido e ignora as já cadastradas.
            </span>
          </div>
        </div>
        <DialogFooter style={{ gap: 8, paddingTop: 8 }}>
          <button className="dssl-btn outline" onClick={reset} disabled={pending}>
            Fechar
          </button>
          {!decision && (
            <button className="dssl-btn primary" onClick={() => submit()} disabled={pending || !pem}>
              {pending && <Loader2 size={12} className="dssl-spin" />} Importar
            </button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
