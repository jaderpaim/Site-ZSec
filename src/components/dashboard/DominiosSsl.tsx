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
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
import { CronHealthBadge } from "@/components/dashboard/CronHealthBadge";

// ── Design Tokens ──────────────────────────────────────────────────────────────
const T = {
  surface: "#0F1420",
  surfaceAlt: "#131825",
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
  purple: "#A78BFA",
  neutral: "#6B7280",
  textPrimary: "#F1F5F9",
  textSecondary: "#F1F5F9",
  textMuted: "#F1F5F9",
  textSubtle: "#F1F5F9",
};

// ── CSS ────────────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');

  .dssl-root { font-family:'DM Sans',sans-serif; color:${T.textPrimary}; display:flex; flex-direction:column; gap:16px; }
  .dssl-root * { box-sizing:border-box; }

  @keyframes dssl-spin { to{transform:rotate(360deg)} }
  @keyframes dssl-pulse-dot { 0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,0.45)} 50%{box-shadow:0 0 0 5px rgba(16,185,129,0)} }
  .dssl-spin { animation:dssl-spin 0.75s linear infinite; }

  .dssl-root ::-webkit-scrollbar       { width:4px; height:4px; }
  .dssl-root ::-webkit-scrollbar-track { background:transparent; }
  .dssl-root ::-webkit-scrollbar-thumb { background:${T.borderHi}; border-radius:2px; }

  /* ── Header ── */
  .dssl-page-hdr {
    background:${T.surface}; border:1px solid ${T.border}; border-radius:12px;
    padding:16px 22px; display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap;
  }
  .dssl-page-brand { display:flex; align-items:center; gap:12px; }
  .dssl-page-icon  { width:40px; height:40px; border-radius:10px; display:flex; align-items:center; justify-content:center; background:${T.accentGlow}; border:1px solid rgba(59,130,246,0.3); flex-shrink:0; }
  .dssl-page-title { font-size:15px; font-weight:700; color:${T.textPrimary}; font-family:'Space Grotesk',sans-serif; letter-spacing:-0.01em; }
  .dssl-page-sub   { font-size:11px; color:${T.textMuted}; margin-top:2px; }

  /* ── Alert dept row ── */
  .dssl-alert-row {
    display:flex; align-items:center; gap:10px; padding:11px 16px;
    background:${T.surface}; border:1px solid ${T.border}; border-radius:9px;
  }
  .dssl-alert-label { font-size:10px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; white-space:nowrap; display:flex; align-items:center; gap:6px; }

  /* ── Panel ── */
  .dssl-panel { background:${T.surface}; border:1px solid ${T.border}; border-radius:12px; overflow:hidden; }
  .dssl-panel-hdr {
    display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;
    padding:13px 20px; background:${T.surfaceAlt}; border-bottom:1px solid ${T.border};
  }
  .dssl-panel-title { display:flex; align-items:center; gap:7px; font-size:11px; font-weight:700; letter-spacing:0.09em; text-transform:uppercase; color:${T.textPrimary}; font-family:'IBM Plex Mono',monospace; }
  .dssl-panel-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }

  /* ── Buttons ── */
  .dssl-btn {
    display:inline-flex; align-items:center; gap:6px; padding:7px 14px; border-radius:7px;
    font-size:12px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif;
    transition:all 0.15s; white-space:nowrap; border:none;
  }
  .dssl-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .dssl-btn.outline { background:transparent; border:1px solid ${T.border}; color:${T.textSecondary}; }
  .dssl-btn.outline:hover:not(:disabled) { border-color:${T.borderHi}; color:${T.textPrimary}; background:rgba(255,255,255,0.04); }
  .dssl-btn.primary { background:${T.accentGlow}; border:1px solid rgba(59,130,246,0.35); color:${T.accent}; }
  .dssl-btn.primary:hover:not(:disabled) { background:rgba(59,130,246,0.24); }
  .dssl-btn.success { background:${T.successBg}; border:1px solid rgba(16,185,129,0.35); color:${T.success}; }
  .dssl-btn.success:hover:not(:disabled) { background:rgba(16,185,129,0.2); }
  .dssl-btn.danger  { background:${T.dangerBg};  border:1px solid rgba(239,68,68,0.35);  color:${T.danger};  }
  .dssl-btn.danger:hover:not(:disabled)  { background:rgba(239,68,68,0.2); }
  .dssl-btn.icon-only { padding:6px; border-radius:6px; }

  /* ── Table ── */
  .dssl-table { width:100%; border-collapse:collapse; }
  .dssl-table thead { position:sticky; top:0; z-index:10; }
  .dssl-table th { padding:8px 12px; font-size:9px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:${T.textPrimary}; font-family:'IBM Plex Mono',monospace; text-align:left; background:${T.surface}; border-bottom:1px solid ${T.border}; white-space:nowrap; }
  .dssl-table th.r { text-align:right; }
  .dssl-table th.c { text-align:center; }
  .dssl-table td { padding:10px 12px; border-bottom:1px solid rgba(30,38,64,0.4); font-size:12px; color:${T.textPrimary}; vertical-align:middle; }
  .dssl-table tbody tr:hover td { background:rgba(59,130,246,0.04); }
  .dssl-table tbody tr:last-child td { border-bottom:none; }
  .dssl-table .mono { font-family:'IBM Plex Mono',monospace; font-size:11px; }
  .dssl-table .dim  { color:${T.textMuted}; }
  .dssl-table .r td { text-align:right; }

  /* ── Days chip ── */
  .dssl-days { display:inline-flex; align-items:center; gap:4px; padding:3px 9px; border-radius:4px; font-size:10px; font-weight:700; font-family:'IBM Plex Mono',monospace; white-space:nowrap; }
  .dssl-days.ok      { background:${T.successBg}; color:${T.success}; border:1px solid rgba(16,185,129,0.22); }
  .dssl-days.warn    { background:${T.warningBg}; color:${T.warning}; border:1px solid rgba(245,158,11,0.22); }
  .dssl-days.danger  { background:${T.dangerBg};  color:${T.danger};  border:1px solid rgba(239,68,68,0.22);  }
  .dssl-days.neutral { background:rgba(107,114,128,0.08); color:${T.neutral}; border:1px solid rgba(107,114,128,0.15); }

  /* ── Status badge ── */
  .dssl-status { display:inline-flex; align-items:center; gap:4px; padding:3px 8px; border-radius:4px; font-size:10px; font-weight:700; letter-spacing:0.07em; text-transform:uppercase; font-family:'IBM Plex Mono',monospace; }
  .dssl-status.ok  { background:${T.successBg}; color:${T.success}; border:1px solid rgba(16,185,129,0.22); }
  .dssl-status.exp { background:${T.dangerBg};  color:${T.danger};  border:1px solid rgba(239,68,68,0.22);  }
  .dssl-status-dot { width:5px; height:5px; border-radius:50%; background:currentColor; flex-shrink:0; }

  /* ── Alert days input ── */
  .dssl-days-input {
    width:60px; padding:4px 6px; border:1px solid ${T.border}; border-radius:5px;
    background:${T.surfaceAlt}; color:${T.textPrimary}; font-family:'IBM Plex Mono',monospace;
    font-size:11px; text-align:center; outline:none; transition:border-color 0.15s;
  }
  .dssl-days-input:focus { border-color:rgba(59,130,246,0.5); box-shadow:0 0 0 2px rgba(59,130,246,0.1); }

  /* ── Empty / Loading ── */
  .dssl-empty { padding:40px; text-align:center; color:${T.textMuted}; font-size:13px; }
  .dssl-loading { display:flex; align-items:center; justify-content:center; gap:8px; padding:40px; color:${T.textMuted}; font-size:12px; font-family:'IBM Plex Mono',monospace; }

  /* ── Footer note ── */
  .dssl-note { display:flex; align-items:flex-start; gap:7px; font-size:11px; color:${T.textSubtle}; padding:12px 16px 14px; line-height:1.5; font-family:'DM Sans',sans-serif; border-top:1px solid ${T.border}; }

  /* ── Dialog ── */
  .dssl-dlg-field { display:flex; flex-direction:column; gap:5px; }
  .dssl-dlg-label { font-size:9px; font-weight:700; letter-spacing:0.13em; text-transform:uppercase; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; }
  .dssl-dlg-hint  { font-size:11px; color:${T.textSubtle}; line-height:1.5; }
  .dssl-dlg-input {
    width:100%; padding:8px 11px; border:1px solid ${T.border}; border-radius:6px;
    background:${T.surfaceAlt}; color:${T.textPrimary}; font-family:'IBM Plex Mono',monospace;
    font-size:12px; outline:none; transition:border-color 0.15s, box-shadow 0.15s;
  }
  .dssl-dlg-input:focus { border-color:rgba(59,130,246,0.5); box-shadow:0 0 0 2px rgba(59,130,246,0.1); }
  .dssl-dlg-input::placeholder { color:${T.textSubtle}; }
  .dssl-dlg-sep { height:1px; background:${T.border}; margin:4px 0; }
  .dssl-dlg-section-label { font-size:9px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; display:flex; align-items:center; gap:6px; }
  .dssl-dlg-section-label::after { content:''; flex:1; height:1px; background:${T.border}; }

  /* ── Row clicável / indicadores ── */
  .dssl-table tbody tr.clickable { cursor:pointer; }
  .dssl-row-tags { display:inline-flex; align-items:center; gap:6px; margin-left:8px; vertical-align:middle; }
  .dssl-row-tag { display:inline-flex; align-items:center; gap:3px; font-size:10px; font-family:'IBM Plex Mono',monospace; color:${T.accent}; }
  .dssl-src { display:inline-flex; align-items:center; padding:1px 6px; border-radius:4px; font-size:9px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; font-family:'IBM Plex Mono',monospace; background:rgba(167,139,250,0.10); color:${T.purple}; border:1px solid rgba(167,139,250,0.25); white-space:nowrap; }
  .dssl-src.cf  { background:rgba(245,158,11,0.10); color:${T.warning}; border-color:rgba(245,158,11,0.25); }
  .dssl-src.pub { background:${T.accentSoft}; color:${T.accent}; border-color:rgba(59,130,246,0.25); }

  /* ── Sheet de detalhe ── */
  .dssl-sh-wrap { display:flex; flex-direction:column; gap:18px; padding-top:16px; }
  .dssl-sh-section { background:${T.surfaceAlt}; border:1px solid ${T.border}; border-radius:10px; padding:14px 16px; }
  .dssl-sh-hd { display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:12px; }
  .dssl-sh-title { display:flex; align-items:center; gap:6px; font-size:10px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:${T.textPrimary}; font-family:'IBM Plex Mono',monospace; }
  .dssl-sh-grid { display:grid; grid-template-columns:repeat(2, minmax(0,1fr)); gap:12px 16px; }
  .dssl-sh-k { font-size:9px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:${T.neutral}; font-family:'IBM Plex Mono',monospace; margin-bottom:4px; }
  .dssl-sh-v { font-size:12.5px; color:${T.textPrimary}; word-break:break-word; }
  .dssl-sh-v.mono { font-family:'IBM Plex Mono',monospace; font-size:11px; }
  .dssl-sh-full { grid-column:1 / -1; }
  .dssl-sh-empty { font-size:12px; color:${T.neutral}; }
  .dssl-sh-list { display:flex; flex-direction:column; gap:8px; }
  .dssl-sh-item { display:flex; flex-direction:column; gap:2px; padding:9px 11px; border:1px solid ${T.border}; border-radius:7px; background:${T.surface}; }
  .dssl-sh-item a { color:${T.accent}; text-decoration:none; font-family:'IBM Plex Mono',monospace; font-size:12px; word-break:break-all; }
  .dssl-sh-item a:hover { text-decoration:underline; }
  .dssl-sh-edit-row { display:flex; gap:6px; align-items:flex-start; }
  .dssl-sh-notes { white-space:pre-wrap; font-size:12.5px; line-height:1.6; color:${T.textPrimary}; }
  .dssl-choice { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 12px; border:1px solid ${T.border}; border-radius:8px; background:${T.surfaceAlt}; }

  /* ── Select override ── */
  .dssl-root .dssl-select-trigger {
    background:${T.surfaceAlt} !important; border-color:${T.border} !important;
    color:${T.textPrimary} !important; font-family:'IBM Plex Mono',monospace !important; font-size:11px !important;
  }
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
function DaysChip({ days, alertDays }: { days: number | null; alertDays: number }) {
  if (days === null) return <span className="dssl-days neutral">—</span>;
  if (days < 0) return <span className="dssl-days danger">Vencido há {Math.abs(days)}d</span>;
  if (days <= alertDays) return <span className="dssl-days danger">{days}d</span>;
  if (days <= 60) return <span className="dssl-days warn">{days}d</span>;
  return <span className="dssl-days ok">{days}d</span>;
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
        style={{
          background: T.surfaceAlt,
          borderColor: T.border,
          color: T.textPrimary,
          fontFamily: "'IBM Plex Mono',monospace",
          fontSize: 11,
          height: 32,
          width: 200,
        }}
      >
        <SelectValue placeholder="Nenhum" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="__none__">Nenhum</SelectItem>
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

  // KPI counts
  const expiredDomains = domains.filter((d) => d.status === "expirado").length;
  const criticalDomains = domains.filter((d) => {
    const x = calcDaysToExpire(d.expiry_date);
    return x !== null && x >= 0 && x <= (d.alert_days ?? 30);
  }).length;

  return (
    <div className="dssl-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="dssl-page-hdr">
        <div className="dssl-page-brand">
          <div className="dssl-page-icon">
            <Globe size={18} color={T.accent} />
          </div>
          <div>
            <div className="dssl-page-title">Domínios &amp; SSL</div>
            <div className="dssl-page-sub">Monitoramento de vencimento de domínios e certificados</div>
          </div>
        </div>

        {/* KPI pills */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 10px",
              borderRadius: 5,
              background: "rgba(107,114,128,0.08)",
              border: `1px solid ${T.border}`,
              fontSize: 11,
              fontFamily: "'IBM Plex Mono',monospace",
              color: T.textMuted,
            }}
          >
            <Globe size={11} /> {domains.length} domínios
          </span>
          {criticalDomains > 0 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "4px 10px",
                borderRadius: 5,
                background: T.warningBg,
                border: "1px solid rgba(245,158,11,0.25)",
                fontSize: 11,
                fontFamily: "'IBM Plex Mono',monospace",
                color: T.warning,
              }}
            >
              <AlertTriangle size={11} /> {criticalDomains} a vencer
            </span>
          )}
          {expiredDomains > 0 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "4px 10px",
                borderRadius: 5,
                background: T.dangerBg,
                border: "1px solid rgba(239,68,68,0.25)",
                fontSize: 11,
                fontFamily: "'IBM Plex Mono',monospace",
                color: T.danger,
              }}
            >
              <AlertTriangle size={11} /> {expiredDomains} expirados
            </span>
          )}
          <CronHealthBadge jobName="domains-expiry-check" moduleSlug="dominios-ssl" />
        </div>
      </div>

      {/* ── Alert dept row ───────────────────────────────────────────── */}
      {canEdit && (
        <div className="dssl-alert-row">
          <span className="dssl-alert-label">
            <Bell size={10} /> Alertas por departamento
          </span>
          <AlertDeptSelector scope="domains" />
        </div>
      )}

      {/* ── Domains panel ────────────────────────────────────────────── */}
      <div className="dssl-panel">
        <div className="dssl-panel-hdr">
          <div className="dssl-panel-title">
            <Globe size={11} /> Domínios cadastrados
            <span style={{ fontWeight: 400, color: T.textSubtle }}>({domains.length})</span>
          </div>
          {canEdit && (
            <div className="dssl-panel-actions">
              <button
                className="dssl-btn outline"
                onClick={() => refreshAllMut.mutate()}
                disabled={refreshAllMut.isPending || domains.length === 0}
              >
                <RefreshCw size={12} className={refreshAllMut.isPending ? "dssl-spin" : ""} />
                Atualizar todos
              </button>
              <NewDomainDialog onSubmit={(d) => createMut.mutateAsync(d)} pending={createMut.isPending} />
            </div>
          )}
        </div>

        {q.isLoading ? (
          <div className="dssl-loading">
            <Loader2 size={13} className="dssl-spin" color={T.accent} /> Carregando…
          </div>
        ) : domains.length === 0 ? (
          <div className="dssl-empty">Nenhum domínio cadastrado ainda.</div>
        ) : (
          <div style={{ overflowX: "auto", maxHeight: 580, overflowY: "auto" }}>
            <table className="dssl-table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 18 }}>Domínio</th>
                  <th>Registro</th>
                  <th>Criação</th>
                  <th>Última mudança</th>
                  <th>Validade</th>
                  <th className="r">Dias p/ vencer</th>
                  <th className="c">Alerta (dias)</th>
                  <th>Status</th>
                  <th className="r" style={{ paddingRight: 18 }}>
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {domains.map((d) => {
                  const days = calcDaysToExpire(d.expiry_date);
                  return (
                    <tr key={d.id}>
                      <td className="mono" style={{ paddingLeft: 18, color: T.textPrimary, fontWeight: 500 }}>
                        {d.domain_name}
                      </td>
                      <td className="dim" style={{ fontSize: 11 }}>
                        {regLabel(d.registrar)}
                      </td>
                      <td className="mono dim">{fmtDate(d.created_date)}</td>
                      <td className="mono dim">{fmtDate(d.last_changed_date)}</td>
                      <td className="mono dim">{fmtDate(d.expiry_date)}</td>
                      <td style={{ textAlign: "right" }}>
                        <DaysChip days={days} alertDays={d.alert_days ?? 30} />
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {canEdit ? (
                          <input
                            type="number"
                            min={1}
                            max={365}
                            defaultValue={d.alert_days}
                            className="dssl-days-input"
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
                      <td style={{ textAlign: "right", paddingRight: 18 }}>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                          {canEdit && (
                            <button
                              className="dssl-btn outline icon-only"
                              onClick={() => refreshMut.mutate(d.id)}
                              disabled={refreshMut.isPending}
                              title="Revalidar agora"
                            >
                              <RefreshCw
                                size={12}
                                className={refreshMut.isPending && refreshMut.variables === d.id ? "dssl-spin" : ""}
                              />
                            </button>
                          )}
                          {canDelete && (
                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <button className="dssl-btn danger icon-only" title="Remover">
                                  <Trash2 size={12} />
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
          <Bell size={11} style={{ marginTop: 1, flexShrink: 0, color: T.textMuted }} />
          Alertas por e-mail enviados aos administradores globais, administradores do módulo e departamento vinculado,
          diariamente às 09h (Brasília), conforme "Alerta (dias)" de cada domínio.
        </div>
      </div>

      {/* ── SSL panel ────────────────────────────────────────────────── */}
      <SslCertsPanel canEdit={canEdit} canDelete={canDelete} />
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
        <button className="dssl-btn success">
          <Plus size={13} /> Adicionar domínio
        </button>
      </DialogTrigger>
      <DialogContent style={{ background: T.surface, border: `1px solid ${T.borderHi}`, borderRadius: 12 }}>
        <DialogHeader>
          <DialogTitle
            style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700, color: T.textPrimary }}
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
function SslCertsPanel({ canEdit, canDelete }: { canEdit: boolean; canDelete: boolean }) {
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

  const [detailId, setDetailId] = React.useState<string | null>(null);
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

  // KPI counts for SSL
  const expiredSsl = certs.filter((c) => c.status === "expirado").length;
  const criticalSsl = certs.filter((c) => {
    const x = calcDaysToExpire(c.valid_to);
    return x !== null && x >= 0 && x <= (c.alert_days ?? 30);
  }).length;

  return (
    <div className="dssl-panel">
      <div className="dssl-panel-hdr">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="dssl-panel-title">
            <Lock size={11} /> Certificados SSL
            <span style={{ fontWeight: 400, color: T.textSubtle }}>({certs.length})</span>
          </div>
          {criticalSsl > 0 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "2px 8px",
                borderRadius: 4,
                background: T.warningBg,
                border: "1px solid rgba(245,158,11,0.22)",
                fontSize: 10,
                fontFamily: "'IBM Plex Mono',monospace",
                color: T.warning,
              }}
            >
              <AlertTriangle size={10} /> {criticalSsl} a vencer
            </span>
          )}
          {expiredSsl > 0 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 4,
                padding: "2px 8px",
                borderRadius: 4,
                background: T.dangerBg,
                border: "1px solid rgba(239,68,68,0.22)",
                fontSize: 10,
                fontFamily: "'IBM Plex Mono',monospace",
                color: T.danger,
              }}
            >
              <AlertTriangle size={10} /> {expiredSsl} expirados
            </span>
          )}
          <CronHealthBadge jobName="ssl-expiry-check" moduleSlug="dominios-ssl" />
        </div>
        {canEdit && (
          <div className="dssl-panel-actions">
            <button
              className="dssl-btn outline"
              onClick={() => refreshAllMut.mutate()}
              disabled={refreshAllMut.isPending || certs.length === 0}
            >
              <RefreshCw size={12} className={refreshAllMut.isPending ? "dssl-spin" : ""} /> Atualizar todos
            </button>
            <button className="dssl-btn outline" onClick={() => alertMut.mutate()} disabled={alertMut.isPending}>
              <Bell size={12} className={alertMut.isPending ? "dssl-spin" : ""} /> Testar alertas
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
          <Loader2 size={13} className="dssl-spin" color={T.accent} /> Carregando…
        </div>
      ) : certs.length === 0 ? (
        <div className="dssl-empty">Nenhum certificado SSL cadastrado ainda.</div>
      ) : (
        <div style={{ overflowX: "auto", maxHeight: 580, overflowY: "auto" }}>
          <table className="dssl-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 18 }}>Domínio</th>
                <th>Origem</th>
                <th>Emissor</th>
                <th>Emissão</th>
                <th>Validade</th>
                <th className="r">Dias p/ vencer</th>
                <th className="c">Alerta (dias)</th>
                <th>Status</th>
                <th className="r" style={{ paddingRight: 18 }}>
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {certs.map((c) => {
                const days = calcDaysToExpire(c.valid_to);
                return (
                  <tr key={c.id} className="clickable" onClick={() => setDetailId(c.id)} title="Ver detalhes">
                    <td className="mono" style={{ paddingLeft: 18, color: T.textPrimary, fontWeight: 500 }}>
                      {c.domain_name}
                      <span className="dssl-row-tags">
                        {c.bindings_count > 0 && (
                          <span
                            className="dssl-row-tag"
                            title={
                              c.sync_kind === "cloudflare"
                                ? `${c.bindings_count} host(s) proxyado(s) na Cloudflare`
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
                    <td className="dim" style={{ fontSize: 11 }}>
                      {c.issuer || "—"}
                    </td>
                    <td className="mono dim">{fmtDate(c.valid_from)}</td>
                    <td className="mono dim">{fmtDate(c.valid_to)}</td>
                    <td style={{ textAlign: "right" }}>
                      <DaysChip days={days} alertDays={c.alert_days ?? 30} />
                    </td>
                    <td style={{ textAlign: "center" }} onClick={(e) => e.stopPropagation()}>
                      {canEdit ? (
                        <input
                          type="number"
                          min={1}
                          max={365}
                          defaultValue={c.alert_days}
                          className="dssl-days-input"
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
                    <td style={{ textAlign: "right", paddingRight: 18 }} onClick={(e) => e.stopPropagation()}>
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                        {canEdit && c.source === "imported" && (
                          <button
                            className="dssl-btn success icon-only"
                            onClick={() => setRenewTarget(c)}
                            title="Renovar (substituir por novo arquivo)"
                          >
                            <FileUp size={12} />
                          </button>
                        )}
                        {canEdit && c.source !== "imported" && (
                          <button
                            className="dssl-btn outline icon-only"
                            onClick={() => refreshMut.mutate(c.id)}
                            disabled={refreshMut.isPending}
                            title="Revalidar agora"
                          >
                            <RefreshCw
                              size={12}
                              className={refreshMut.isPending && refreshMut.variables === c.id ? "dssl-spin" : ""}
                            />
                          </button>
                        )}
                        {canDelete && (
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <button className="dssl-btn danger icon-only" title="Remover">
                                <Trash2 size={12} />
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
        <ShieldCheck size={11} style={{ marginTop: 1, flexShrink: 0, color: T.textMuted }} />
        Validade e emissor obtidos diretamente do certificado SSL público do domínio (certificados importados usam os
        dados do arquivo e são renovados pelo botão de renovar). Clique numa linha para ver detalhes, observações e
        URLs vinculadas. Alertas enviados aos administradores globais, administradores do módulo e departamento
        vinculado, diariamente às 09h (Brasília).
      </div>

      <SslCertDetailsSheet
        certId={detailId}
        onOpenChange={(v) => !v && setDetailId(null)}
        canEdit={canEdit}
        onRenew={(c) => setRenewTarget(c)}
        onChanged={invalidate}
      />
      <RenewSslDialog
        cert={renewTarget}
        onClose={() => setRenewTarget(null)}
        onSubmit={(pem) => renewMut.mutateAsync({ id: renewTarget!.id, pem })}
        pending={renewMut.isPending}
      />
    </div>
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
    label: "Sincronizado · Cloudflare",
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
  return (
    <span className={`dssl-src ${k.cls}`} title={k.hint}>
      {k.label}
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
      <DialogContent style={{ background: T.surface, border: `1px solid ${T.borderHi}`, borderRadius: 12 }}>
        <DialogHeader>
          <DialogTitle
            style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700, color: T.textPrimary }}
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
const CERT_SHEET_MIN_WIDTH = 440;
const CERT_SHEET_MAX_WIDTH = 1000;

type BindingDraft = { key: number; url: string; description: string };

function SslCertDetailsSheet({
  certId,
  onOpenChange,
  canEdit,
  onRenew,
  onChanged,
}: {
  certId: string | null;
  onOpenChange: (v: boolean) => void;
  canEdit: boolean;
  onRenew: (c: SslRow) => void;
  onChanged: () => void;
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

  // Largura customizada (arrastando a alça na borda esquerda).
  const [width, setWidth] = React.useState<number | null>(null);
  const draggingRef = React.useRef(false);
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    draggingRef.current = true;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const onMove = (ev: MouseEvent) => {
      if (!draggingRef.current) return;
      const next = window.innerWidth - ev.clientX;
      setWidth(Math.min(CERT_SHEET_MAX_WIDTH, window.innerWidth - 80, Math.max(CERT_SHEET_MIN_WIDTH, next)));
    };
    const onUp = () => {
      draggingRef.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  };

  if (!id) return null;
  const d = q.data;
  const c = d?.cert;
  const days = c ? calcDaysToExpire(c.valid_to) : null;

  return (
    <Sheet open={!!certId} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full sm:max-w-xl overflow-y-auto"
        style={{
          background: T.surface,
          borderLeft: `1px solid ${T.borderHi}`,
          color: T.textPrimary,
          fontFamily: "'DM Sans',sans-serif",
          ...(width ? { width, maxWidth: "none" } : {}),
        }}
      >
        <div
          onMouseDown={handleResizeStart}
          className="absolute left-0 top-0 hidden h-full w-1.5 cursor-col-resize transition-colors hover:bg-primary/30 active:bg-primary/40 sm:block"
        />
        <SheetHeader className="space-y-1 pr-8">
          <SheetTitle
            style={{ color: T.textPrimary, fontFamily: "'Space Grotesk',sans-serif", fontSize: 18, fontWeight: 700 }}
          >
            {c?.domain_name ?? "Certificado"}
          </SheetTitle>
          {c && (
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              <StatusBadge status={c.status} />
              <DaysChip days={days} alertDays={c.alert_days ?? 30} />
              <SyncKindTag kind={c.sync_kind} />
            </div>
          )}
        </SheetHeader>

        {q.isError ? (
          <div className="dssl-empty">{(q.error as any)?.message ?? "Erro ao carregar o certificado."}</div>
        ) : !d || !c ? (
          <div className="dssl-loading">
            <Loader2 size={13} className="dssl-spin" color={T.accent} /> Carregando…
          </div>
        ) : (
          <div className="dssl-sh-wrap">
            {/* Certificado */}
            <div className="dssl-sh-section">
              <div className="dssl-sh-hd">
                <div className="dssl-sh-title">
                  <Lock size={11} /> Certificado
                </div>
                {canEdit && c.source === "imported" && (
                  <button className="dssl-btn success" onClick={() => onRenew(c)}>
                    <FileUp size={12} /> Renovar
                  </button>
                )}
              </div>
              <div className="dssl-sh-grid">
                <div>
                  <div className="dssl-sh-k">Emissor</div>
                  <div className="dssl-sh-v">{c.issuer || "—"}</div>
                </div>
                <div>
                  <div className="dssl-sh-k">Alerta</div>
                  <div className="dssl-sh-v">{c.alert_days} dias antes</div>
                </div>
                <div>
                  <div className="dssl-sh-k">Emissão</div>
                  <div className="dssl-sh-v mono">{fmtDate(c.valid_from)}</div>
                </div>
                <div>
                  <div className="dssl-sh-k">Validade</div>
                  <div className="dssl-sh-v mono">{fmtDate(c.valid_to)}</div>
                </div>
                {c.subject_alt_names && c.subject_alt_names.length > 0 && (
                  <div className="dssl-sh-full">
                    <div className="dssl-sh-k">Nomes cobertos (SAN)</div>
                    <div className="dssl-sh-v mono">{c.subject_alt_names.join(", ")}</div>
                  </div>
                )}
                {c.fingerprint_sha256 && (
                  <div className="dssl-sh-full">
                    <div className="dssl-sh-k">Fingerprint SHA-256</div>
                    <div className="dssl-sh-v mono">{c.fingerprint_sha256}</div>
                  </div>
                )}
                {c.serial_number && (
                  <div className="dssl-sh-full">
                    <div className="dssl-sh-k">Número de série</div>
                    <div className="dssl-sh-v mono">{c.serial_number}</div>
                  </div>
                )}
                {c.source === "imported" && !c.fingerprint_sha256 && (
                  <div className="dssl-sh-full dssl-dlg-hint">
                    Importado antes do registro de fingerprint. Na próxima renovação, esses dados passam a ser gravados.
                  </div>
                )}
              </div>
            </div>

            {/* Observações + URLs vinculadas */}
            <div className="dssl-sh-section">
              <div className="dssl-sh-hd">
                <div className="dssl-sh-title">
                  <Link2 size={11} /> {d.edge ? "Hosts proxyados (Cloudflare)" : "URLs vinculadas"}
                  <span style={{ fontWeight: 400, color: T.neutral }}>
                    ({d.edge ? d.edge.hosts.length : d.bindings.length})
                  </span>
                </div>
                {canEdit && !editing && (
                  <button className="dssl-btn outline" onClick={startEdit}>
                    <Pencil size={12} /> {d.edge ? "Editar observações" : "Editar"}
                  </button>
                )}
              </div>

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
                          onChange={(e) =>
                            setBindingsDraft((prev) =>
                              prev.map((x) => (x.key === b.key ? { ...x, description: e.target.value } : x)),
                            )
                          }
                          style={{ flex: 2 }}
                        />
                        <button
                          className="dssl-btn danger icon-only"
                          title="Remover URL"
                          onClick={() => setBindingsDraft((prev) => prev.filter((x) => x.key !== b.key))}
                          style={{ marginTop: 3 }}
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                    <button
                      className="dssl-btn outline"
                      style={{ alignSelf: "flex-start" }}
                      onClick={() =>
                        setBindingsDraft((prev) => [...prev, { key: keyRef.current++, url: "", description: "" }])
                      }
                    >
                      <Plus size={12} /> Adicionar URL
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
                      style={{ fontFamily: "'DM Sans',sans-serif", resize: "vertical" }}
                    />
                  </div>
                  <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                    <button className="dssl-btn outline" onClick={() => setEditing(false)} disabled={saveMut.isPending}>
                      Cancelar
                    </button>
                    <button className="dssl-btn primary" onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
                      {saveMut.isPending && <Loader2 size={12} className="dssl-spin" />} Salvar
                    </button>
                  </div>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  {d.edge ? (
                    <EdgeHostsList edge={d.edge} />
                  ) : d.bindings.length === 0 ? (
                    <div className="dssl-sh-empty">
                      Nenhuma URL vinculada.{canEdit ? " Use Editar para informar onde este certificado está instalado." : ""}
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
                            <span style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 }}>{b.url}</span>
                          )}
                          {b.description && <span style={{ fontSize: 11.5, color: T.neutral }}>{b.description}</span>}
                        </div>
                      ))}
                    </div>
                  )}
                  <div>
                    <div className="dssl-sh-k" style={{ display: "flex", alignItems: "center", gap: 5 }}>
                      <StickyNote size={10} /> Observações
                    </div>
                    {c.notes ? (
                      <div className="dssl-sh-notes">{c.notes}</div>
                    ) : (
                      <div className="dssl-sh-empty">Sem observações.</div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Histórico */}
            {d.history.length > 0 && (
              <div className="dssl-sh-section">
                <div className="dssl-sh-hd">
                  <div className="dssl-sh-title">
                    <History size={11} /> Histórico de renovações
                  </div>
                </div>
                <div className="dssl-sh-list">
                  {d.history.map((h) => (
                    <div key={h.id} className="dssl-sh-item">
                      <span style={{ fontSize: 12 }}>
                        {h.issuer || "—"} · {fmtDate(h.valid_from)} até {fmtDate(h.valid_to)}
                      </span>
                      <span style={{ fontSize: 11, color: T.neutral }}>
                        Substituído em {new Date(h.replaced_at).toLocaleString("pt-BR")}
                        {h.replaced_by_name ? ` por ${h.replaced_by_name}` : ""}
                      </span>
                      {h.fingerprint_sha256 && (
                        <span
                          style={{
                            fontSize: 10,
                            color: T.neutral,
                            fontFamily: "'IBM Plex Mono',monospace",
                            wordBreak: "break-all",
                          }}
                        >
                          {h.fingerprint_sha256}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
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
        <button className="dssl-btn success">
          <Plus size={13} /> Importar certificado
        </button>
      </DialogTrigger>
      <DialogContent style={{ background: T.surface, border: `1px solid ${T.borderHi}`, borderRadius: 12 }}>
        <DialogHeader>
          <DialogTitle
            style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700, color: T.textPrimary }}
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
