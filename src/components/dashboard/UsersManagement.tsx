import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Shield,
  ShieldCheck,
  User as UserIcon,
  Loader2,
  KeyRound,
  UserPlus,
  Power,
  Trash2,
  Wrench,
  Users,
  Settings,
  Lock,
  Search,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  Wifi,
  Plus,
  Layers,
  Pencil,
} from "lucide-react";
import { Panel } from "./primitives";
import { usePermissions } from "@/lib/use-permissions";
import { MODULES } from "@/lib/modules";
import { isExclusiveModule } from "@/lib/exclusive-modules";
import { useDepartments } from "@/lib/use-departments";
import { useMaintenance, useMaintenanceToggle } from "@/lib/use-maintenance";
import {
  listUsers,
  listModulePermissionsCatalog,
  getUserPermissions,
  setUserPermission,
  setModuleAdmin,
  setUserRole,
  inviteUser,
  setUserDepartment,
  setUserActive,
  deleteUser,
  resetUserPassword,
  setUserAuthMethod,
  listPermissionProfiles,
  createPermissionProfile,
  updatePermissionProfile,
  deletePermissionProfile,
  applyPermissionProfile,
} from "@/lib/users.functions";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAuth } from "@/lib/auth-context";
import * as React from "react";

type ModuleSlug = string;

// ── Design Tokens ──────────────────────────────────────────────────────────────
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
  purple: "#A78BFA",
  purpleBg: "rgba(167,139,250,0.10)",
  neutral: "#6B7280",
  textPrimary: "#F1F5F9",
  textSecondary: "#94A3B8",
  textMuted: "#F1F5F9",
  textSubtle: "#475569",
};

// ── Avatar palette – colour derived from first char ────────────────────────────
const AV = [
  { bg: "rgba(59,130,246,0.18)", color: "#60A5FA", border: "rgba(59,130,246,0.3)" },
  { bg: "rgba(167,139,250,0.18)", color: "#A78BFA", border: "rgba(167,139,250,0.3)" },
  { bg: "rgba(16,185,129,0.18)", color: "#34D399", border: "rgba(16,185,129,0.3)" },
  { bg: "rgba(245,158,11,0.18)", color: "#FCD34D", border: "rgba(245,158,11,0.3)" },
  { bg: "rgba(239,68,68,0.18)", color: "#FCA5A5", border: "rgba(239,68,68,0.3)" },
  { bg: "rgba(34,211,238,0.18)", color: "#67E8F9", border: "rgba(34,211,238,0.3)" },
  { bg: "rgba(251,146,60,0.18)", color: "#FDBA74", border: "rgba(251,146,60,0.3)" },
  { bg: "rgba(99,102,241,0.18)", color: "#A5B4FC", border: "rgba(99,102,241,0.3)" },
];
const avPalette = (email?: string) => AV[(email?.charCodeAt(0) ?? 0) % AV.length];

// ── Inline CSS ─────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');

  .um { font-family:'DM Sans',sans-serif; color:${T.textPrimary}; }
  .um * { box-sizing:border-box; }

  /* keyframes */
  @keyframes um-spin    { to{transform:rotate(360deg)} }
  @keyframes um-fadeup  { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  @keyframes um-pulse   { 0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,0.45)} 50%{box-shadow:0 0 0 5px rgba(16,185,129,0)} }
  .um-spin   { animation:um-spin 0.75s linear infinite; }
  .um-fadeup { animation:um-fadeup 0.3s ease forwards; }

  /* scrollbar */
  .um ::-webkit-scrollbar       { width:4px; height:4px; }
  .um ::-webkit-scrollbar-track { background:transparent; }
  .um ::-webkit-scrollbar-thumb { background:${T.borderHi}; border-radius:2px; }

  /* ── PAGE HEADER ── */
  .um-hdr {
    background:${T.surface}; border:1px solid ${T.border}; border-radius:12px;
    padding:18px 24px; display:flex; align-items:center; justify-content:space-between; gap:16px;
  }
  .um-hdr-brand { display:flex; align-items:center; gap:12px; }
  .um-hdr-icon  { width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;background:${T.accentGlow};border:1px solid rgba(59,130,246,0.3);flex-shrink:0; }
  .um-hdr-title { font-size:15px;font-weight:700;color:${T.textPrimary};font-family:'Space Grotesk',sans-serif;letter-spacing:-0.01em; }
  .um-hdr-sub   { font-size:11px;color:${T.textMuted};margin-top:2px;line-height:1.5; }

  /* ── INVITE BUTTON ── */
  .um-invite {
    display:inline-flex;align-items:center;gap:7px;padding:9px 18px;flex-shrink:0;
    background:${T.accentGlow};border:1px solid rgba(59,130,246,0.35);border-radius:8px;
    font-size:12px;font-weight:700;color:${T.accent};cursor:pointer;
    font-family:'DM Sans',sans-serif;transition:all 0.15s;white-space:nowrap;
  }
  .um-invite:hover { background:rgba(59,130,246,0.24);box-shadow:0 0 20px rgba(59,130,246,0.12); }

  /* ── KPI ROW ── */
  .um-kpi-row { display:grid;grid-template-columns:repeat(5,1fr);gap:12px; }
  .um-kpi {
    background:${T.surface};border:1px solid ${T.border};border-radius:10px;
    padding:14px 18px;position:relative;overflow:hidden;transition:border-color 0.2s;
  }
  .um-kpi:hover { border-color:${T.borderHi}; }
  .um-kpi::before { content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--kc,${T.accent}); }
  .um-kpi-ico   { position:absolute;top:12px;right:12px;opacity:0.08; }
  .um-kpi-label { font-size:9px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${T.textMuted};font-family:'IBM Plex Mono',monospace;margin-bottom:5px; }
  .um-kpi-value { font-size:26px;font-weight:700;font-family:'Space Grotesk',sans-serif;letter-spacing:-0.02em;line-height:1;color:var(--kc,${T.textPrimary}); }

  /* ── PANEL / TABLE ── */
  .um-panel  { background:${T.surface};border:1px solid ${T.border};border-radius:12px;overflow:hidden; }
  .um-phdr   { display:flex;align-items:center;justify-content:space-between;padding:13px 20px;background:${T.surfaceAlt};border-bottom:1px solid ${T.border}; }
  .um-ptitle { display:flex;align-items:center;gap:7px;font-size:11px;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;color:${T.textMuted};font-family:'IBM Plex Mono',monospace; }

  /* search bar */
  .um-search-wrap  { display:flex;align-items:center;gap:8px;padding:10px 16px;border-bottom:1px solid ${T.border};background:${T.surfaceAlt}; }
  .um-search-input { flex:1;background:${T.surface};border:1px solid ${T.border};border-radius:6px;padding:6px 10px;font-size:12px;font-family:'IBM Plex Mono',monospace;color:${T.textPrimary};outline:none;transition:border-color 0.15s; }
  .um-search-input:focus { border-color:rgba(59,130,246,0.5);box-shadow:0 0 0 2px rgba(59,130,246,0.1); }
  .um-search-input::placeholder { color:${T.textSubtle}; }

  /* table */
  .um-table { width:100%;border-collapse:collapse; }
  .um-table th { padding:9px 14px;font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${T.textMuted};font-family:'IBM Plex Mono',monospace;text-align:left;background:${T.surface};border-bottom:1px solid ${T.border};white-space:nowrap; }
  .um-table td { padding:11px 14px;border-bottom:1px solid rgba(30,38,64,0.4);vertical-align:middle; }
  .um-table tbody tr { cursor:pointer;transition:background 0.1s; }
  .um-table tbody tr:hover td { background:rgba(59,130,246,0.045); }
  .um-table tbody tr:last-child td { border-bottom:none; }

  /* avatar */
  .um-av { width:36px;height:36px;border-radius:9px;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;font-family:'Space Grotesk',sans-serif;flex-shrink:0;background:var(--av-bg);border:1px solid var(--av-bd);color:var(--av-co); }
  .um-av.lg { width:44px;height:44px;border-radius:11px;font-size:17px; }
  .um-uname  { font-size:13px;font-weight:600;color:${T.textPrimary};line-height:1.2; }
  .um-uemail { font-size:11px;color:${T.textMuted};font-family:'IBM Plex Mono',monospace;margin-top:1px; }

  /* status badge */
  .um-status { display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;font-family:'IBM Plex Mono',monospace;white-space:nowrap; }
  .um-status-dot { width:5px;height:5px;border-radius:50%;background:currentColor;flex-shrink:0; }
  .um-status.ok  { background:${T.successBg};color:${T.success};border:1px solid rgba(16,185,129,0.25); }
  .um-status.dis { background:${T.dangerBg}; color:${T.danger}; border:1px solid rgba(239,68,68,0.25);  }
  .um-status.pnd { background:${T.warningBg};color:${T.warning};border:1px solid rgba(245,158,11,0.25); }
  .um-status.online  { background:${T.successBg};color:${T.success};border:1px solid rgba(16,185,129,0.25); }
  .um-status.offline { background:rgba(107,114,128,0.10);color:${T.neutral};border:1px solid rgba(107,114,128,0.2); }
  .um-status-dot.pulse { animation:um-pulse 2s ease-in-out infinite; }

  /* role badge */
  .um-role { display:inline-flex;align-items:center;gap:4px;padding:3px 9px;border-radius:4px;font-size:10px;font-weight:700;letter-spacing:0.07em;text-transform:uppercase;font-family:'IBM Plex Mono',monospace;white-space:nowrap; }
  .um-role.admin        { background:${T.purpleBg}; color:${T.purple};  border:1px solid rgba(167,139,250,0.25); }
  .um-role.super_admin  { background:rgba(99,102,241,0.12); color:#818CF8; border:1px solid rgba(99,102,241,0.3); }
  .um-role.analista     { background:${T.accentSoft};color:${T.accent};  border:1px solid rgba(59,130,246,0.25);  }
  .um-role.visualizador { background:rgba(107,114,128,0.10);color:${T.neutral};border:1px solid rgba(107,114,128,0.2); }
  .um-role.personalizado{ background:${T.warningBg}; color:${T.warning};border:1px solid rgba(245,158,11,0.25);  }

  /* module badge */
  .um-mod-badge { display:inline-flex;padding:2px 6px;border-radius:3px;font-size:9px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;font-family:'IBM Plex Mono',monospace;background:${T.accentSoft};color:${T.accent};border:1px solid rgba(59,130,246,0.18); }

  /* perm count chip */
  .um-perm-chip { display:inline-flex;align-items:center;gap:4px;padding:3px 8px;border-radius:4px;font-size:10px;font-weight:600;font-family:'IBM Plex Mono',monospace;background:rgba(107,114,128,0.08);color:${T.textMuted};border:1px solid ${T.border}; }

  /* action buttons */
  .um-act-btn { padding:5px 6px;border-radius:5px;border:1px solid ${T.border};background:transparent;color:${T.textMuted};cursor:pointer;transition:all 0.15s;display:inline-flex;align-items:center;line-height:0; }
  .um-act-btn:hover     { border-color:${T.borderHi};color:${T.textPrimary};background:rgba(255,255,255,0.05); }
  .um-act-btn.del:hover { border-color:rgba(239,68,68,0.4);color:${T.danger};background:${T.dangerBg}; }
  .um-manage-btn { display:inline-flex;align-items:center;gap:4px;padding:5px 10px;border-radius:5px;font-size:11px;font-weight:700;color:${T.accent};font-family:'IBM Plex Mono',monospace;background:${T.accentSoft};border:1px solid rgba(59,130,246,0.2);cursor:pointer;transition:all 0.15s;white-space:nowrap; }
  .um-manage-btn:hover { background:${T.accentGlow};border-color:rgba(59,130,246,0.4); }

  /* maintenance btn */
  .um-maint { display:inline-flex;align-items:center;gap:5px;padding:4px 10px;border-radius:5px;font-size:10px;font-weight:700;letter-spacing:0.06em;font-family:'IBM Plex Mono',monospace;border:1px solid;cursor:pointer;transition:all 0.15s; }
  .um-maint.on  { background:rgba(251,146,60,0.14);color:#FB923C;border-color:rgba(251,146,60,0.35); }
  .um-maint.on:hover  { background:rgba(251,146,60,0.24); }
  .um-maint.off { background:rgba(107,114,128,0.07);color:${T.neutral};border-color:${T.border}; }
  .um-maint.off:hover { background:rgba(107,114,128,0.14); }

  /* empty / loading */
  .um-empty    { padding:40px;text-align:center;color:${T.textMuted};font-size:12px;font-family:'DM Sans',sans-serif; }
  .um-load-row { display:flex;align-items:center;gap:8px;justify-content:center;padding:32px;color:${T.textMuted};font-size:12px;font-family:'IBM Plex Mono',monospace; }

  /* ── SHEET ── */
  .um-sheet-body { display:flex;flex-direction:column;gap:14px;margin-top:22px; }

  .um-hero { background:${T.surfaceAlt};border:1px solid ${T.border};border-radius:10px;padding:16px 18px;display:flex;align-items:center;gap:14px; }
  .um-hero-info { flex:1;min-width:0; }
  .um-hero-name  { font-size:16px;font-weight:700;color:${T.textPrimary};font-family:'Space Grotesk',sans-serif;letter-spacing:-0.01em;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
  .um-hero-email { font-size:11px;color:${T.textMuted};font-family:'IBM Plex Mono',monospace;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap; }
  .um-hero-badges { display:flex;align-items:center;gap:6px;margin-top:8px;flex-wrap:wrap; }

  /* section card */
  .um-sec    { background:${T.surface};border:1px solid ${T.border};border-radius:10px;overflow:hidden; }
  .um-sec-hd { padding:11px 16px;background:${T.surfaceAlt};border-bottom:1px solid ${T.border};display:flex;align-items:center;justify-content:space-between; }
  .um-sec-title { font-size:10px;font-weight:700;letter-spacing:0.1em;text-transform:uppercase;color:${T.textMuted};font-family:'IBM Plex Mono',monospace;display:flex;align-items:center;gap:6px; }
  .um-sec-body { padding:14px 16px;display:flex;flex-direction:column;gap:12px; }

  /* config row */
  .um-cfg { display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:11px 12px;background:${T.surfaceAlt};border-radius:7px;border:1px solid ${T.border}; }
  .um-cfg + .um-cfg { margin-top:8px; }
  .um-cfg-label { font-size:12px;font-weight:600;color:${T.textPrimary};display:flex;align-items:center;gap:6px;margin-bottom:3px; }
  .um-cfg-hint  { font-size:11px;color:${T.textMuted};line-height:1.45;max-width:320px; }

  /* module tabs */
  .um-mod-tabs { display:flex;flex-wrap:wrap;border-bottom:1px solid ${T.border};background:${T.surfaceAlt}; }
  .um-mod-tab  { padding:8px 13px;font-size:11px;font-weight:600;border:none;background:transparent;color:${T.textMuted};cursor:pointer;border-right:1px solid ${T.border};border-bottom:2px solid transparent;transition:all 0.15s;white-space:nowrap;font-family:'DM Sans',sans-serif; }
  .um-mod-tab:hover  { color:${T.textSecondary};background:rgba(59,130,246,0.05); }
  .um-mod-tab.active { color:${T.accent};background:${T.accentSoft};border-bottom-color:${T.accent}; }

  /* admin toggle row */
  .um-adm-row { display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:12px 14px;background:${T.surfaceAlt};border-radius:7px;border:1px solid ${T.border}; }
  .um-adm-label { font-size:12px;font-weight:600;color:${T.textPrimary};display:flex;align-items:center;gap:6px;margin-bottom:3px; }
  .um-adm-hint  { font-size:11px;color:${T.textMuted};line-height:1.45;max-width:300px; }

  /* sub-label */
  .um-sublabel { font-size:9px;font-weight:700;letter-spacing:0.14em;text-transform:uppercase;color:${T.textMuted};font-family:'IBM Plex Mono',monospace;display:flex;align-items:center;gap:6px; }
  .um-sublabel::after { content:'';flex:1;height:1px;background:${T.border}; }

  /* perm row */
  .um-perm { display:flex;align-items:flex-start;gap:10px;padding:7px 10px;border-radius:6px;transition:background 0.1s; }
  .um-perm.can:hover { background:rgba(59,130,246,0.06);cursor:pointer; }
  .um-perm.ind { padding-left:28px; }
  .um-perm-label { font-size:12px;color:${T.textPrimary};font-weight:500; }
  .um-perm-code  { font-size:10px;color:${T.textMuted};font-family:'IBM Plex Mono',monospace;margin-left:4px; }
  .um-perm-desc  { font-size:11px;color:${T.textMuted};margin-top:2px;line-height:1.4; }
  .um-perm-indent { border-left:2px solid ${T.border};margin-left:16px;margin-top:4px;display:flex;flex-direction:column;gap:2px; }

  /* div */
  .um-div { height:1px;background:${T.border}; }

  /* ── DIALOG FORM ── */
  .um-field { display:flex;flex-direction:column;gap:5px; }
  .um-field-lbl { font-size:9px;font-weight:700;letter-spacing:0.13em;text-transform:uppercase;color:${T.textMuted};font-family:'IBM Plex Mono',monospace; }
  .um-field-hint { font-size:11px;color:${T.textSubtle};line-height:1.5; }
  .um-dinput { width:100%;padding:8px 11px;border:1px solid ${T.border};border-radius:6px;background:${T.surfaceAlt};color:${T.textPrimary};font-family:'IBM Plex Mono',monospace;font-size:12px;outline:none;transition:border-color 0.15s,box-shadow 0.15s; }
  .um-dinput:focus { border-color:rgba(59,130,246,0.5);box-shadow:0 0 0 2px rgba(59,130,246,0.1); }
  .um-dinput::placeholder { color:${T.textSubtle}; }

  .um-btn { display:inline-flex;align-items:center;justify-content:center;gap:6px;padding:8px 16px;border-radius:7px;font-size:12px;font-weight:700;cursor:pointer;font-family:'DM Sans',sans-serif;transition:all 0.15s; }
  .um-btn.pri { background:${T.accentGlow};border:1px solid rgba(59,130,246,0.35);color:${T.accent}; }
  .um-btn.pri:hover:not(:disabled) { background:rgba(59,130,246,0.24); }
  .um-btn.gst { background:transparent;border:1px solid ${T.border};color:${T.textSecondary}; }
  .um-btn.gst:hover { border-color:${T.borderHi};color:${T.textPrimary}; }
  .um-btn:disabled { opacity:0.45;cursor:not-allowed; }

  .um-pwd-btn { display:inline-flex;align-items:center;gap:5px;padding:7px 13px;background:${T.accentGlow};border:1px solid rgba(59,130,246,0.3);border-radius:6px;font-size:11px;font-weight:700;color:${T.accent};cursor:pointer;font-family:'DM Sans',sans-serif;transition:all 0.15s;white-space:nowrap;flex-shrink:0; }
  .um-pwd-btn:hover:not(:disabled) { background:rgba(59,130,246,0.24); }
  .um-pwd-btn:disabled { opacity:0.45;cursor:not-allowed; }

  .um-footer { display:flex;align-items:flex-start;gap:7px;font-size:11px;color:${T.textMuted};font-family:'DM Sans',sans-serif;padding:0 2px;line-height:1.5; }
`;

// ── Small components ───────────────────────────────────────────────────────────
function Av({ email, large }: { email?: string; large?: boolean }) {
  const p = avPalette(email);
  return (
    <div
      className={`um-av${large ? " lg" : ""}`}
      style={{ "--av-bg": p.bg, "--av-bd": p.border, "--av-co": p.color } as React.CSSProperties}
    >
      {email?.[0]?.toUpperCase() ?? "?"}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: React.ReactNode; label: string }> = {
    active: { cls: "ok", icon: <CheckCircle2 size={10} />, label: "Ativo" },
    disabled: { cls: "dis", icon: <XCircle size={10} />, label: "Desativado" },
    pending: { cls: "pnd", icon: <Clock size={10} />, label: "Pendente" },
  };
  const { cls, icon, label } = map[status] ?? map.pending;
  return (
    <span className={`um-status ${cls}`}>
      {icon} {label}
    </span>
  );
}

function ActivityBadge({ online }: { online: boolean }) {
  return (
    <span className={`um-status ${online ? "online" : "offline"}`}>
      <span className={`um-status-dot${online ? " pulse" : ""}`} /> {online ? "Conectado" : "Desconectado"}
    </span>
  );
}

function RoleBadge({ role }: { role: string }) {
  const icons: Record<string, React.ReactNode> = {
    admin: <Shield size={9} />,
    super_admin: <ShieldCheck size={9} />,
    analista: <Settings size={9} />,
    visualizador: <UserIcon size={9} />,
    personalizado: <Wrench size={9} />,
  };
  const labels: Record<string, string> = { super_admin: "super admin" };
  return (
    <span className={`um-role ${role}`}>
      {icons[role]} {labels[role] ?? role}
    </span>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN — logic UNCHANGED
// ══════════════════════════════════════════════════════════════════════════════
export function UsersManagementDashboard() {
  const { isAdmin, loading: permLoading } = usePermissions();
  const { user: currentUser, role } = useAuth();
  // admin enxerga esta tela (isAdmin acima já inclui admin e super_admin) e agora
  // também pode cadastrar/ativar/desativar/excluir — só não pode mexer em um
  // usuário que já é super_admin (gate real fica no backend, ver
  // setUserActive/deleteUser/assertTargetIsNotSuperAdmin em users.functions.ts).
  const canManageUsers = role === "super_admin" || role === "admin";
  // Cadastrar usuário agora também é permitido pra admin — só não pode atribuir
  // o papel Super Admin nem propagar (via cópia) config exclusiva de super_admin
  // (gate real fica no backend, ver inviteUser/copyUserConfig em users.functions.ts).
  const canInviteUsers = role === "super_admin" || role === "admin";
  const { data: departments = [] } = useDepartments();
  const { maintenance } = useMaintenance();
  const toggleMaintenance = useMaintenanceToggle();

  const { user } = useAuth();
  const listUsersFn = useServerFn(listUsers);
  const listCatalogFn = useServerFn(listModulePermissionsCatalog);
  const inviteUserFn = useServerFn(inviteUser);
  const setUserActiveFn = useServerFn(setUserActive);
  const deleteUserFn = useServerFn(deleteUser);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [confirmAction, setConfirmAction] = useState<{ kind: "deactivate" | "activate" | "delete"; user: any } | null>(
    null,
  );
  const qc = useQueryClient();

  const usersQuery = useQuery({
    queryKey: ["users-mgmt", "list"],
    queryFn: () => listUsersFn({ data: undefined as any }),
    enabled: !!user && !permLoading && isAdmin,
    retry: false,
    refetchInterval: 30_000,
  });

  const catalogQuery = useQuery({
    queryKey: ["module-permissions-catalog"],
    queryFn: () => listCatalogFn(),
    enabled: !!user && !permLoading && isAdmin,
    retry: false,
  });

  // ── Loading ────────────────────────────────────────────────────────────────
  if (permLoading)
    return (
      <div
        className="um"
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "64px 0",
          gap: 8,
          color: T.textMuted,
          fontSize: 13,
        }}
      >
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <Loader2 size={14} className="um-spin" color={T.accent} /> Carregando…
      </div>
    );

  if (!isAdmin)
    return (
      <div className="um">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="um-panel">
          <div className="um-phdr">
            <div className="um-ptitle">
              <Lock size={11} /> Acesso Restrito
            </div>
          </div>
          <div style={{ padding: "36px 20px", textAlign: "center", fontSize: 13, color: T.textMuted }}>
            Este módulo só está disponível para administradores globais.
          </div>
        </div>
      </div>
    );

  const users = usersQuery.data?.users ?? [];
  const catalog = catalogQuery.data?.catalog ?? [];

  // KPI counts
  const kpis = {
    total: users.length,
    active: users.filter((u: any) => u.status === "active").length,
    connected: users.filter((u: any) => u.online).length,
    pending: users.filter((u: any) => u.status === "pending").length,
    admins: users.filter((u: any) => u.role === "admin" || u.role === "super_admin").length,
  };

  // Search filter
  const filtered = searchQ.trim()
    ? users.filter((u: any) =>
        [u.full_name, u.email, u.department_name].some((v) =>
          String(v ?? "")
            .toLowerCase()
            .includes(searchQ.toLowerCase()),
        ),
      )
    : users;

  return (
    <div className="um" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Header ──────────────────────────────────────────────────────── */}
      <div className="um-hdr">
        <div className="um-hdr-brand">
          <div className="um-hdr-icon">
            <Users size={18} color={T.accent} />
          </div>
          <div>
            <div className="um-hdr-title">Gestão de Usuários</div>
            <div className="um-hdr-sub">Papéis globais e permissões granulares por módulo</div>
          </div>
        </div>
        {canInviteUsers && (
          <button className="um-invite" onClick={() => setCreateOpen(true)}>
            <UserPlus size={13} /> Cadastrar usuário
          </button>
        )}
      </div>

      {/* ── KPIs ────────────────────────────────────────────────────────── */}
      {!usersQuery.isLoading && (
        <div className="um-kpi-row um-fadeup">
          {[
            {
              label: "Total de Usuários",
              value: kpis.total,
              color: T.accent,
              icon: <Users size={36} color={T.accent} />,
            },
            {
              label: "Usuários Ativos",
              value: kpis.active,
              color: T.success,
              icon: <CheckCircle2 size={36} color={T.success} />,
            },
            {
              label: "Usuários Conectados",
              value: kpis.connected,
              color: T.success,
              icon: <Wifi size={36} color={T.success} />,
            },
            { label: "Pendentes", value: kpis.pending, color: T.warning, icon: <Clock size={36} color={T.warning} /> },
            {
              label: "Administradores",
              value: kpis.admins,
              color: T.purple,
              icon: <Shield size={36} color={T.purple} />,
            },
          ].map(({ label, value, color, icon }) => (
            <div key={label} className="um-kpi" style={{ "--kc": color } as React.CSSProperties}>
              <div className="um-kpi-ico">{icon}</div>
              <div className="um-kpi-label">{label}</div>
              <div className="um-kpi-value">{value}</div>
            </div>
          ))}
        </div>
      )}

      {/* ── Table panel ─────────────────────────────────────────────────── */}
      <div className="um-panel">
        <div className="um-phdr">
          <div className="um-ptitle">
            <Users size={11} /> Usuários do sistema
          </div>
          <span style={{ fontSize: 11, color: T.textMuted, fontFamily: "'IBM Plex Mono',monospace" }}>
            {usersQuery.isLoading ? "…" : `${filtered.length} de ${users.length}`}
          </span>
        </div>

        {/* Search */}
        <div className="um-search-wrap">
          <Search size={13} color={T.textMuted} />
          <input
            className="um-search-input"
            placeholder="Buscar por nome, email ou departamento…"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
          />
        </div>

        <div style={{ overflowX: "auto" }}>
          <table className="um-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 20 }}>Usuário</th>
                <th>Departamento</th>
                <th>Status</th>
                <th>Atividade</th>
                <th>Papel</th>
                <th>Admin de Módulos</th>
                <th>Permissões</th>
                <th style={{ textAlign: "center" }}>Manutenção</th>
                <th style={{ textAlign: "right", paddingRight: 20 }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {usersQuery.isLoading && (
                <tr>
                  <td colSpan={9}>
                    <div className="um-load-row">
                      <Loader2 size={13} className="um-spin" color={T.accent} /> Carregando usuários…
                    </div>
                  </td>
                </tr>
              )}

              {filtered.map((u: any) => (
                <tr key={u.id} onClick={() => setSelectedId(u.id)}>
                  {/* Usuário */}
                  <td style={{ paddingLeft: 20 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <Av email={u.email} />
                      <div>
                        <div className="um-uname">{u.full_name || u.email}</div>
                        <div className="um-uemail">{u.email}</div>
                      </div>
                    </div>
                  </td>

                  {/* Departamento */}
                  <td style={{ fontSize: 12, color: T.textMuted }}>{u.department_name ?? "—"}</td>

                  {/* Status */}
                  <td>
                    <StatusBadge status={u.status} />
                  </td>

                  {/* Atividade */}
                  <td>
                    <ActivityBadge online={!!u.online} />
                  </td>

                  {/* Papel */}
                  <td>
                    <RoleBadge role={u.role} />
                  </td>

                  {/* Admin de módulos */}
                  <td>
                    {u.role === "admin" || u.role === "super_admin" ? (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 11,
                          color: T.success,
                          fontFamily: "'IBM Plex Mono',monospace",
                        }}
                      >
                        <ShieldCheck size={12} /> todos
                      </span>
                    ) : u.moduleAdmins.length === 0 ? (
                      <span style={{ color: T.textMuted, fontSize: 12 }}>—</span>
                    ) : (
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                        {u.moduleAdmins.slice(0, 3).map((m: string) => (
                          <span key={m} className="um-mod-badge">
                            {m}
                          </span>
                        ))}
                        {u.moduleAdmins.length > 3 && (
                          <span className="um-mod-badge">+{u.moduleAdmins.length - 3}</span>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Permissões */}
                  <td>
                    {u.role === "super_admin" ? (
                      <span className="um-perm-chip">
                        <Lock size={9} /> todas
                      </span>
                    ) : u.role === "admin" ? (
                      <span className="um-perm-chip">
                        <Lock size={9} /> todas (exceto usuários)
                      </span>
                    ) : (
                      <span className="um-perm-chip">
                        <Lock size={9} /> {u.permissionCount} ações
                      </span>
                    )}
                  </td>

                  {/* Manutenção */}
                  <td style={{ textAlign: "center" }}>
                    {u.department_name?.toLowerCase().includes("seguranca informacao") ||
                    u.department_name?.toLowerCase().includes("segurança da informação") ? (
                      <button
                        className={`um-maint ${maintenance.active ? "on" : "off"}`}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleMaintenance.mutate(!maintenance.active);
                        }}
                        disabled={toggleMaintenance.isPending}
                        title={maintenance.active ? "Desativar manutenção" : "Ativar manutenção"}
                      >
                        <Wrench size={11} /> {maintenance.active ? "Ativo" : "Inativo"}
                      </button>
                    ) : (
                      <span style={{ color: T.textSubtle, fontSize: 12 }}>—</span>
                    )}
                  </td>

                  {/* Ações */}
                  <td style={{ paddingRight: 16, textAlign: "right" }}>
                    <div
                      style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button className="um-manage-btn" onClick={() => setSelectedId(u.id)}>
                        Gerenciar <ChevronRight size={11} />
                      </button>
                      {/* admin não pode ativar/desativar/excluir um super_admin — só outro super_admin */}
                      {canManageUsers &&
                        currentUser?.id !== u.id &&
                        !(role === "admin" && u.role === "super_admin") && (
                          <>
                            <button
                              className="um-act-btn"
                              title={u.status === "disabled" ? "Reativar" : "Desativar"}
                              onClick={() =>
                                setConfirmAction({ kind: u.status === "disabled" ? "activate" : "deactivate", user: u })
                              }
                            >
                              <Power size={13} />
                            </button>
                            <button
                              className="um-act-btn del"
                              title="Excluir usuário"
                              onClick={() => setConfirmAction({ kind: "delete", user: u })}
                            >
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                    </div>
                  </td>
                </tr>
              ))}

              {!usersQuery.isLoading && filtered.length === 0 && (
                <tr>
                  <td colSpan={9}>
                    <div className="um-empty">
                      {searchQ ? `Nenhum usuário corresponde a "${searchQ}".` : "Nenhum usuário encontrado."}
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Sheet ───────────────────────────────────────────────────────── */}
      <UserPermissionsSheet
        userId={selectedId}
        user={users.find((u: any) => u.id === selectedId) ?? null}
        catalog={catalog}
        departments={departments}
        onClose={() => setSelectedId(null)}
      />

      {/* ── Create dialog ───────────────────────────────────────────────── */}
      <CreateUserDialog
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        onCreated={() => {
          qc.invalidateQueries({ queryKey: ["users-mgmt", "list"] });
          setCreateOpen(false);
        }}
        inviteUserFn={inviteUserFn}
        users={users}
        viewerRole={role}
        departments={departments}
      />

      {/* ── Confirm dialog ──────────────────────────────────────────────── */}
      <AlertDialog
        open={!!confirmAction}
        onOpenChange={(o) => {
          if (!o) setConfirmAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {confirmAction?.kind === "delete" && "Excluir usuário"}
              {confirmAction?.kind === "deactivate" && "Desativar usuário"}
              {confirmAction?.kind === "activate" && "Reativar usuário"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmAction?.kind === "delete" && (
                <>
                  Esta ação é permanente e removerá{" "}
                  <strong>{confirmAction.user.full_name || confirmAction.user.email}</strong> do sistema.
                </>
              )}
              {confirmAction?.kind === "deactivate" && (
                <>
                  O usuário <strong>{confirmAction.user.full_name || confirmAction.user.email}</strong> não poderá mais
                  acessar o sistema até ser reativado.
                </>
              )}
              {confirmAction?.kind === "activate" && (
                <>
                  O usuário <strong>{confirmAction.user.full_name || confirmAction.user.email}</strong> poderá voltar a
                  acessar o sistema.
                </>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className={
                confirmAction?.kind === "delete"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : ""
              }
              onClick={async () => {
                if (!confirmAction) return;
                try {
                  if (confirmAction.kind === "delete") {
                    await deleteUserFn({ data: { userId: confirmAction.user.id } });
                    toast.success("Usuário excluído");
                  } else {
                    await setUserActiveFn({
                      data: { userId: confirmAction.user.id, active: confirmAction.kind === "activate" },
                    });
                    toast.success(confirmAction.kind === "activate" ? "Usuário reativado" : "Usuário desativado");
                  }
                  qc.invalidateQueries({ queryKey: ["users-mgmt", "list"] });
                } catch (e: any) {
                  toast.error(e?.message ?? "Falha na operação");
                } finally {
                  setConfirmAction(null);
                }
              }}
            >
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CREATE USER DIALOG
// ══════════════════════════════════════════════════════════════════════════════
function CreateUserDialog({
  open,
  onClose,
  onCreated,
  inviteUserFn,
  users,
  viewerRole,
  departments,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
  inviteUserFn: any;
  users: any[];
  viewerRole: string | null;
  departments: Array<{ id: string; name: string }>;
}) {
  const isSuperAdminViewer = viewerRole === "super_admin";
  const [email, setEmail] = useState("");
  const [fullName, setFullName] = useState("");
  const [role, setRole] = useState<"admin" | "analista" | "visualizador" | "personalizado" | "super_admin">(
    "visualizador",
  );
  const [copyFrom, setCopyFrom] = useState<string>("__none__");
  const [departmentId, setDepartmentId] = useState<string>("__none");
  const [permissionProfileId, setPermissionProfileId] = useState<string>("__none__");
  const [busy, setBusy] = useState(false);
  // Admin (não super_admin) não pode virar fonte de cópia super_admin — evita
  // clonar acesso que ele próprio não tem como conceder (ver copyUserConfig).
  const copySources = isSuperAdminViewer ? users : users.filter((u: any) => u.role !== "super_admin");

  const listProfilesFn = useServerFn(listPermissionProfiles);
  const profilesQuery = useQuery({
    queryKey: ["permission-profiles"],
    queryFn: () => listProfilesFn(),
    enabled: open && role === "personalizado",
  });
  const profiles = profilesQuery.data?.profiles ?? [];
  // Perfil só se aplica quando não há cópia — cópia já traz as permissões prontas.
  const showProfilePicker = role === "personalizado" && copyFrom === "__none__";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      await inviteUserFn({
        data: {
          email,
          fullName,
          role,
          copyFromUserId: copyFrom === "__none__" ? null : copyFrom,
          departmentId: departmentId === "__none" ? null : departmentId,
          permissionProfileId: showProfilePicker && permissionProfileId !== "__none__" ? permissionProfileId : null,
        },
      });
      toast.success(
        copyFrom === "__none__"
          ? `Convite enviado para ${email}.`
          : `Convite enviado para ${email} com as configurações copiadas.`,
      );
      setEmail("");
      setFullName("");
      setRole("visualizador");
      setCopyFrom("__none__");
      setDepartmentId("__none");
      setPermissionProfileId("__none__");
      onCreated();
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao cadastrar");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-md"
        style={{ background: T.surface, border: `1px solid ${T.borderHi}`, borderRadius: 12 }}
      >
        <DialogHeader>
          <DialogTitle
            style={{
              fontFamily: "'Space Grotesk',sans-serif",
              fontSize: 15,
              fontWeight: 700,
              color: T.textPrimary,
              display: "flex",
              alignItems: "center",
              gap: 8,
            }}
          >
            <UserPlus size={15} color={T.accent} /> Cadastrar usuário
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 8 }}>
          <div className="um-field">
            <span className="um-field-lbl">Nome completo</span>
            <input
              className="um-dinput"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              required
              placeholder="João da Silva"
            />
          </div>
          <div className="um-field">
            <span className="um-field-lbl">Email</span>
            <input
              className="um-dinput"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="joao.silva@empresa.com"
            />
          </div>
          <div className="um-field">
            <span className="um-field-lbl">Papel inicial</span>
            <Select value={role} onValueChange={(v) => setRole(v as any)}>
              <SelectTrigger
                style={{
                  background: T.surfaceAlt,
                  borderColor: T.border,
                  color: T.textPrimary,
                  fontFamily: "'IBM Plex Mono',monospace",
                  fontSize: 12,
                }}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="visualizador">Visualizador — somente leitura</SelectItem>
                <SelectItem value="analista">Analista — leitura e operação</SelectItem>
                <SelectItem value="admin">Admin — acesso total, exceto gerenciar usuários</SelectItem>
                {isSuperAdminViewer && (
                  <SelectItem value="super_admin">Super Admin — acesso total, incluindo gerenciar usuários</SelectItem>
                )}
                <SelectItem value="personalizado">Personalizado — sem permissões por padrão</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {showProfilePicker && (
            <div className="um-field">
              <span className="um-field-lbl">Perfil de permissão (opcional)</span>
              <Select value={permissionProfileId} onValueChange={setPermissionProfileId}>
                <SelectTrigger
                  disabled={profilesQuery.isLoading}
                  style={{
                    background: T.surfaceAlt,
                    borderColor: T.border,
                    color: T.textPrimary,
                    fontFamily: "'IBM Plex Mono',monospace",
                    fontSize: 12,
                  }}
                >
                  <SelectValue placeholder="Escolher perfil…" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">
                    {profiles.length === 0 ? "Nenhum perfil cadastrado" : "Nenhum — sem permissões por padrão"}
                  </SelectItem>
                  {profiles.map((p: any) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="um-field">
            <span className="um-field-lbl">Departamento (opcional)</span>
            <Select value={departmentId} onValueChange={setDepartmentId}>
              <SelectTrigger
                style={{
                  background: T.surfaceAlt,
                  borderColor: T.border,
                  color: T.textPrimary,
                  fontFamily: "'IBM Plex Mono',monospace",
                  fontSize: 12,
                }}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none">Sem departamento</SelectItem>
                {departments.map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="um-field">
            <span className="um-field-lbl">Copiar configurações de (opcional)</span>
            <Select
              value={copyFrom}
              onValueChange={(v) => {
                setCopyFrom(v);
                if (v !== "__none__") {
                  const src = users.find((u: any) => u.id === v);
                  if (src?.role) setRole(src.role);
                }
              }}
            >
              <SelectTrigger
                style={{
                  background: T.surfaceAlt,
                  borderColor: T.border,
                  color: T.textPrimary,
                  fontFamily: "'IBM Plex Mono',monospace",
                  fontSize: 12,
                }}
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__none__">Nenhum — usar o papel selecionado</SelectItem>
                {[...copySources]
                  .sort((a: any, b: any) =>
                    (a.full_name || a.email || "").localeCompare(b.full_name || b.email || "", "pt-BR"),
                  )
                  .map((u: any) => (
                    <SelectItem key={u.id} value={u.id}>
                      {(u.full_name || u.email) + " · " + u.role}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="um-field-hint">
            {copyFrom !== "__none__"
              ? "As configurações (papel, admin de módulo e permissões granulares) serão clonadas do usuário selecionado — isso sobrescreve o papel acima."
              : "Um email de ativação será enviado. O acesso é via SSO — não é necessário criar senha. Permissões padrão aplicadas conforme o papel selecionado."}
          </div>
          <DialogFooter style={{ gap: 8 }}>
            <button type="button" className="um-btn gst" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="um-btn pri" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 size={12} className="um-spin" /> Enviando…
                </>
              ) : (
                <>
                  <UserPlus size={12} /> Enviar convite
                </>
              )}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// USER PERMISSIONS SHEET — logic UNCHANGED
// ══════════════════════════════════════════════════════════════════════════════
function UserPermissionsSheet({
  userId,
  user,
  catalog,
  departments,
  onClose,
}: {
  userId: string | null;
  user: any | null;
  catalog: any[];
  departments: Array<{ id: string; name: string }>;
  onClose: () => void;
}) {
  const { isAdmin, matrix } = usePermissions();
  const { refreshRole, user: currentUser, role: viewerRole } = useAuth();
  // admin enxerga esta tela (isAdmin acima já inclui admin e super_admin), mas só
  // super_admin (hierarquia mais alta) pode conceder permissão/admin de módulo,
  // convidar, excluir, ativar/desativar, mudar método de autenticação e perfis
  // de permissão — por isso usamos `matrix.moduleAdmins` (sem o bypass automático
  // de admin) em vez de `isModuleAdmin` no gate de edição das permissões.
  const canManageUsers = viewerRole === "super_admin";
  // admin PODE editar papel (exceto atribuir super_admin), senha e departamento
  // de outros — menos de um super_admin, que só outro super_admin pode alterar.
  const canEditBasics = viewerRole === "super_admin" || viewerRole === "admin";
  const qc = useQueryClient();
  const getUserPermsFn = useServerFn(getUserPermissions);
  const setPermFn = useServerFn(setUserPermission);
  const setModAdminFn = useServerFn(setModuleAdmin);
  const setRoleFn = useServerFn(setUserRole);
  const setUserDepartmentFn = useServerFn(setUserDepartment);
  const resetUserPasswordFn = useServerFn(resetUserPassword);
  const setUserAuthMethodFn = useServerFn(setUserAuthMethod);
  const listProfilesFn = useServerFn(listPermissionProfiles);
  const createProfileFn = useServerFn(createPermissionProfile);
  const updateProfileFn = useServerFn(updatePermissionProfile);
  const deleteProfileFn = useServerFn(deletePermissionProfile);
  const applyProfileFn = useServerFn(applyPermissionProfile);

  const [resetPwdOpen, setResetPwdOpen] = useState(false);
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);
  const [createProfileOpen, setCreateProfileOpen] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("__none__");

  const permsQuery = useQuery({
    queryKey: ["user-perms", userId],
    queryFn: () => getUserPermsFn({ data: { userId: userId! } }),
    enabled: !!userId,
  });

  const profilesQuery = useQuery({
    queryKey: ["permission-profiles"],
    queryFn: () => listProfilesFn(),
    enabled: isAdmin,
  });
  const profiles = profilesQuery.data?.profiles ?? [];

  // Mantém a caixa mostrando qual perfil está aplicado agora (checkmark do
  // Select) em vez de sempre voltar pro placeholder depois de aplicar.
  useEffect(() => {
    setSelectedProfileId(user?.permission_profile_id ?? "__none__");
  }, [userId, user?.permission_profile_id]);

  // Módulos exclusivos (ex.: benchmark) saem daqui — têm quadro próprio
  // ("Permissões Exclusivas", só super_admin), não os tabs normais.
  const moduleSlugs = useMemo(() => MODULES.map((m) => m.slug).filter((s) => !isExclusiveModule(s)), []);
  const exclusiveModuleSlugs = useMemo(() => MODULES.map((m) => m.slug).filter((s) => isExclusiveModule(s)), []);
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const currentModule = activeModule ?? moduleSlugs[0] ?? null;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["user-perms", userId] });
    qc.invalidateQueries({ queryKey: ["users-mgmt", "list"] });
    qc.invalidateQueries({ queryKey: ["permissions"] });
  };

  const applyProfile = useMutation({
    mutationFn: async (profileId: string) => applyProfileFn({ data: { userId: userId!, profileId } }),
    onSuccess: (_res, profileId) => {
      invalidate();
      setSelectedProfileId(profileId);
      toast.success("Perfil de permissão aplicado.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao aplicar perfil"),
  });

  const togglePerm = useMutation({
    mutationFn: async (v: { module: string; action: string; granted: boolean }) =>
      setPermFn({ data: { userId: userId!, ...v } }),
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar"),
  });
  const toggleModAdmin = useMutation({
    mutationFn: async (v: { module: string; isAdmin: boolean }) => setModAdminFn({ data: { userId: userId!, ...v } }),
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar"),
  });
  const changeRole = useMutation({
    mutationFn: async (role: "admin" | "analista" | "visualizador" | "personalizado" | "super_admin") =>
      setRoleFn({ data: { userId: userId!, role } }),
    onSuccess: async () => {
      invalidate();
      if (userId === currentUser?.id) await refreshRole();
      toast.success("Papel atualizado");
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar"),
  });
  const changeDepartment = useMutation({
    mutationFn: async (departmentId: string | null) => setUserDepartmentFn({ data: { userId: userId!, departmentId } }),
    onSuccess: () => {
      invalidate();
      toast.success("Departamento atualizado");
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar"),
  });

  const changeAuthMethod = useMutation({
    mutationFn: async (authMethod: "sso" | "email" | "ambos") =>
      setUserAuthMethodFn({ data: { userId: userId!, authMethod } }),
    onSuccess: () => {
      invalidate();
      toast.success("Método de autenticação atualizado");
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar"),
  });

  if (!userId || !user) return null;

  const moduleAdmins = new Set<string>(permsQuery.data?.moduleAdmins ?? []);
  const perms = new Set<string>((permsQuery.data?.permissions ?? []).map((p) => `${p.module}:${p.action}`));
  const isTrueAdmin = user.role === "admin";
  const isSuperAdmin = user.role === "super_admin";
  // Módulos exclusivos (ex.: benchmark): só super_admin tem bypass automático,
  // admin nunca (ver src/lib/exclusive-modules.ts). "usuarios" é parecido, mas
  // hardcoded aqui (não está na lista de módulos exclusivos porque não tem
  // catálogo de ações normal — é tratado à parte em assertCanManageUsers, ver
  // users.functions.ts e a migration 20260825140000).
  const autoGrantsModule = (mod: string) => {
    if (isExclusiveModule(mod)) return isSuperAdmin;
    if (isSuperAdmin) return true;
    return isTrueAdmin && mod !== "usuarios";
  };
  const actionsForModule = (mod: string) => catalog.filter((c) => c.module_slug === mod);
  // admin (canEditBasics) não pode editar papel/senha/departamento de um alvo
  // que já é super_admin — só outro super_admin mexe nele.
  const canEditThisUsersBasics = canManageUsers || (canEditBasics && user.role !== "super_admin");

  return (
    <Sheet
      open={!!userId}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <SheetContent
        className="w-full sm:max-w-2xl overflow-y-auto"
        style={{ background: T.surface, borderLeft: `1px solid ${T.border}`, padding: "20px 20px 32px" }}
      >
        <SheetHeader>
          <SheetTitle asChild>
            <div>
              <div className="um-hero">
                <Av email={user.email} large />
                <div className="um-hero-info">
                  <div className="um-hero-name">{user.full_name || user.email}</div>
                  <div className="um-hero-email">{user.email}</div>
                  <div className="um-hero-badges">
                    <StatusBadge status={user.status} />
                    <RoleBadge role={user.role} />
                    {user.role === "personalizado" && user.permission_profile_name && (
                      <span
                        style={{
                          display: "inline-flex",
                          alignItems: "center",
                          gap: 4,
                          fontSize: 10,
                          fontWeight: 700,
                          color: T.warning,
                          fontFamily: "'IBM Plex Mono',monospace",
                          background: T.warningBg,
                          border: "1px solid rgba(245,158,11,0.25)",
                          borderRadius: 4,
                          padding: "2px 7px",
                        }}
                        title="Perfil de permissão aplicado"
                      >
                        <Layers size={9} /> {user.permission_profile_name}
                      </span>
                    )}
                    {user.department_name && (
                      <span
                        style={{
                          fontSize: 10,
                          color: T.textMuted,
                          fontFamily: "'IBM Plex Mono',monospace",
                          background: T.surfaceAlt,
                          border: `1px solid ${T.border}`,
                          borderRadius: 4,
                          padding: "2px 7px",
                        }}
                      >
                        {user.department_name}
                      </span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </SheetTitle>
        </SheetHeader>

        <div className="um-sheet-body">
          {/* ── Acesso e Papel ────────────────────────────────────────── */}
          <div className="um-sec">
            <div className="um-sec-hd">
              <div className="um-sec-title">
                <Shield size={11} /> Acesso e Papel
              </div>
            </div>
            <div className="um-sec-body">
              {/* Papel global */}
              <div className="um-cfg">
                <div>
                  <div className="um-cfg-label">
                    <Shield size={12} color={T.textMuted} /> Papel global
                  </div>
                  <div className="um-cfg-hint">
                    Super Admin tem acesso irrestrito, inclusive nos módulos exclusivos, "Admin do módulo", convidar/
                    excluir e atribuir o papel Super Admin. Admin tem o mesmo acesso operacional e pode alterar papel
                    (exceto tornar alguém Super Admin), senha, departamento, método de autenticação e conceder permissão
                    granular de outros usuários nos módulos não-exclusivos — mas não pode ligar "Admin do módulo",
                    conceder permissão nos módulos exclusivos, convidar, excluir, nem mexer em um usuário que já é Super
                    Admin. Analista, Visualizador e Personalizado dependem das permissões abaixo — Personalizado não
                    recebe nenhuma permissão por padrão, exceto criar/excluir GMUD (liberado a todo mundo).
                  </div>
                  {/* Criar/editar/excluir perfil: admin também pode, já que perfil nunca
                      carrega módulo exclusivo (barrado no servidor). */}
                  {canEditBasics && (
                    <button
                      type="button"
                      className="um-manage-btn"
                      style={{ marginTop: 8 }}
                      onClick={() => setCreateProfileOpen(true)}
                    >
                      <Plus size={11} /> Gerenciar perfis de permissão
                    </button>
                  )}
                </div>
                <div style={{ width: 160, flexShrink: 0 }}>
                  <Select
                    value={user.role}
                    disabled={!canEditThisUsersBasics || changeRole.isPending}
                    onValueChange={(v) => changeRole.mutate(v as any)}
                  >
                    <SelectTrigger
                      style={{
                        background: T.surface,
                        borderColor: T.border,
                        color: T.textPrimary,
                        fontFamily: "'IBM Plex Mono',monospace",
                        fontSize: 12,
                      }}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      {/* Só super_admin pode atribuir o papel Super Admin (ver setUserRole) */}
                      {canManageUsers && <SelectItem value="super_admin">Super Admin</SelectItem>}
                      <SelectItem value="analista">Analista</SelectItem>
                      <SelectItem value="visualizador">Visualizador</SelectItem>
                      <SelectItem value="personalizado">Personalizado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Aplicar perfil de permissão — só para papel Personalizado */}
              {user.role === "personalizado" && (
                <div className="um-cfg">
                  <div>
                    <div className="um-cfg-label">
                      <Layers size={12} color={T.textMuted} /> Aplicar perfil de permissão
                    </div>
                    <div className="um-cfg-hint">
                      Copia as permissões do perfil escolhido para este usuário agora — é uma cópia única, editar o
                      perfil depois não afeta quem já usou.
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6, width: 200, flexShrink: 0 }}>
                    <Select
                      value={selectedProfileId}
                      disabled={!canEditBasics || profilesQuery.isLoading}
                      onValueChange={setSelectedProfileId}
                    >
                      <SelectTrigger
                        style={{
                          background: T.surface,
                          borderColor: T.border,
                          color: T.textPrimary,
                          fontFamily: "'IBM Plex Mono',monospace",
                          fontSize: 12,
                        }}
                      >
                        <SelectValue placeholder="Escolher perfil…" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__none__" disabled>
                          {profiles.length === 0 ? "Nenhum perfil cadastrado" : "Escolher perfil…"}
                        </SelectItem>
                        {profiles.map((p: any) => (
                          <SelectItem key={p.id} value={p.id}>
                            {p.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <button
                      type="button"
                      className="um-btn pri"
                      style={{ width: "100%" }}
                      disabled={!canEditBasics || selectedProfileId === "__none__" || applyProfile.isPending}
                      onClick={() => applyProfile.mutate(selectedProfileId)}
                    >
                      {applyProfile.isPending ? (
                        <>
                          <Loader2 size={12} className="um-spin" /> Aplicando…
                        </>
                      ) : (
                        "Aplicar perfil"
                      )}
                    </button>
                  </div>
                </div>
              )}

              {/* Departamento */}
              <div className="um-cfg">
                <div>
                  <div className="um-cfg-label">
                    <UserIcon size={12} color={T.textMuted} /> Departamento vinculado
                  </div>
                  <div className="um-cfg-hint">
                    O módulo de vulnerabilidades respeita este vínculo para usuários sem acesso administrativo.
                  </div>
                </div>
                <div style={{ width: 200, flexShrink: 0 }}>
                  <Select
                    value={user.department_id ?? "__none"}
                    disabled={!canEditThisUsersBasics || changeDepartment.isPending}
                    onValueChange={(v) => changeDepartment.mutate(v === "__none" ? null : v)}
                  >
                    <SelectTrigger
                      style={{
                        background: T.surface,
                        borderColor: T.border,
                        color: T.textPrimary,
                        fontFamily: "'IBM Plex Mono',monospace",
                        fontSize: 12,
                      }}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Sem departamento</SelectItem>
                      {departments.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Método de autenticação */}
              <div className="um-cfg">
                <div>
                  <div className="um-cfg-label">
                    <Lock size={12} color={T.textMuted} /> Método de autenticação
                  </div>
                  <div className="um-cfg-hint">
                    <strong>SSO apenas</strong> — acesso via provedor de identidade; senha bloqueada.{" "}
                    <strong>Email + senha</strong> — login local sem SSO (útil para testes e ambientes offline).{" "}
                    <strong>Ambos</strong> — aceita SSO ou senha (recomendado para admins).
                  </div>
                </div>
                <div style={{ width: 170, flexShrink: 0 }}>
                  <Select
                    value={user.auth_method ?? "sso"}
                    disabled={!canEditThisUsersBasics || changeAuthMethod.isPending}
                    onValueChange={(v) => changeAuthMethod.mutate(v as "sso" | "email" | "ambos")}
                  >
                    <SelectTrigger
                      style={{
                        background: T.surface,
                        borderColor: T.border,
                        color: T.textPrimary,
                        fontFamily: "'IBM Plex Mono',monospace",
                        fontSize: 12,
                      }}
                    >
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sso">SSO apenas</SelectItem>
                      <SelectItem value="email">Email + senha</SelectItem>
                      <SelectItem value="ambos">Ambos</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Senha — visível apenas para usuários com método email ou ambos */}
              {user.auth_method !== "sso" && (
                <div className="um-cfg">
                  <div>
                    <div className="um-cfg-label">
                      <KeyRound size={12} color={T.textMuted} /> Redefinir senha
                    </div>
                    <div className="um-cfg-hint">
                      Define uma nova senha para{" "}
                      <span style={{ fontFamily: "'IBM Plex Mono',monospace", color: T.accent }}>{user.email}</span> sem
                      necessidade de e-mail.
                    </div>
                  </div>
                  <button
                    className="um-pwd-btn"
                    disabled={!canEditThisUsersBasics}
                    onClick={() => setResetPwdOpen(true)}
                  >
                    <KeyRound size={11} /> Redefinir
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* ── Permissões por módulo ──────────────────────────────────── */}
          <div className="um-sec">
            <div className="um-sec-hd">
              <div className="um-sec-title">
                <Settings size={11} /> Permissões por Módulo
              </div>
            </div>

            {/* Tabs */}
            <div className="um-mod-tabs">
              {moduleSlugs.map((m) => {
                const def = MODULES.find((x) => x.slug === m);
                const isModAdm = moduleAdmins.has(m) || autoGrantsModule(m);
                return (
                  <button
                    key={m}
                    className={`um-mod-tab${currentModule === m ? " active" : ""}`}
                    onClick={() => setActiveModule(m)}
                    title={isModAdm ? "Admin do módulo" : undefined}
                  >
                    {isModAdm && (
                      <ShieldCheck
                        size={9}
                        style={{ marginRight: 3, color: currentModule === m ? T.accent : T.success }}
                      />
                    )}
                    {def?.short ?? m}
                  </button>
                );
              })}
            </div>

            {/* Module body */}
            {currentModule && (
              <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Admin toggle */}
                <div className="um-adm-row">
                  <div>
                    <div className="um-adm-label">
                      <ShieldCheck size={12} color={T.accent} /> Admin do módulo
                    </div>
                    <div className="um-adm-hint">
                      Concede todas as permissões deste módulo e direito de gerenciar permissões dos demais usuários
                      nele.
                    </div>
                  </div>
                  <Switch
                    checked={autoGrantsModule(currentModule) || moduleAdmins.has(currentModule)}
                    disabled={autoGrantsModule(currentModule) || !canManageUsers || toggleModAdmin.isPending}
                    onCheckedChange={(v) => toggleModAdmin.mutate({ module: currentModule, isAdmin: v })}
                  />
                </div>

                {/* Granular perms */}
                <div>
                  <div className="um-sublabel" style={{ marginBottom: 8 }}>
                    Permissões granulares
                  </div>
                  {permsQuery.isLoading ? (
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "14px 0",
                        color: T.textMuted,
                        fontSize: 12,
                      }}
                    >
                      <Loader2 size={12} className="um-spin" color={T.accent} /> Carregando…
                    </div>
                  ) : (
                    (() => {
                      const all = actionsForModule(currentModule);
                      const isCfWaf = currentModule === "cloudflare-waf";
                      // Árvore de permissões só pro cloudflare-waf — cada action-pai lista
                      // os action_strings dos filhos diretos. Desmarcar um pai desmarca
                      // TODOS os descendentes (recursivo), não só os filhos diretos.
                      const PERM_TREE: Record<string, string[]> = {
                        manage: [
                          "manage_buscar_dns",
                          "manage_purge_cache",
                          "manage_cache_performance",
                          "manage_adicionar_dns",
                          "manage_editar_dns",
                          "manage_custom_rules",
                        ],
                        manage_rules: ["manage_rules_overview", "manage_rules_page_rules"],
                        manage_rules_overview: [
                          "manage_rules_overview_url_rewrite",
                          "manage_rules_overview_redirect",
                          "manage_rules_overview_origin",
                          "manage_rules_overview_cache",
                          "manage_rules_overview_cache_response",
                          "manage_rules_overview_request_header_transform",
                          "manage_rules_overview_response_header_transform",
                          "manage_rules_overview_custom_error",
                          "manage_rules_overview_configuration",
                        ],
                      };
                      const childrenOf = (action: string): string[] => (isCfWaf ? (PERM_TREE[action] ?? []) : []);
                      const descendantsOf = (action: string): string[] => childrenOf(action).flatMap((c) => [c, ...descendantsOf(c)]);
                      const nestedActions = new Set(isCfWaf ? Object.values(PERM_TREE).flat() : []);
                      const analyticsSet = new Set([
                        "view_analytics_http",
                        "view_analytics_security",
                        "view_analytics_web",
                        "view_analytics_loadbalancing",
                      ]);
                      const topLevel = isCfWaf ? all.filter((a) => !nestedActions.has(a.action) && !analyticsSet.has(a.action)) : all;
                      const analyticsActions = isCfWaf ? all.filter((a) => analyticsSet.has(a.action)) : [];
                      const byAction = new Map(all.map((a) => [a.action, a]));
                      const auto = autoGrantsModule(currentModule) || moduleAdmins.has(currentModule);

                      const renderRow = (a: any, depth = 0): React.ReactNode => {
                        const key = `${currentModule}:${a.action}`;
                        const checked = auto || perms.has(key);
                        // "Permissões por Módulo" só lista módulos não-exclusivos — admin já
                        // tem bypass total neles, então pode conceder pra outros aqui também
                        // (módulo exclusivo tem quadro à parte, só super_admin).
                        const canEdit =
                          (canManageUsers || viewerRole === "admin" || matrix.moduleAdmins.has(currentModule)) &&
                          !auto &&
                          !togglePerm.isPending;
                        const children = childrenOf(a.action)
                          .map((ca) => byAction.get(ca))
                          .filter((x): x is NonNullable<typeof x> => !!x);
                        return (
                          <div key={a.id}>
                            <label className={`um-perm${canEdit ? " can" : ""}${depth > 0 ? " ind" : ""}`}>
                              <Checkbox
                                checked={checked}
                                disabled={!canEdit}
                                onCheckedChange={(v) => {
                                  const granted = !!v;
                                  togglePerm.mutate({ module: currentModule, action: a.action, granted });
                                  if (isCfWaf && !granted)
                                    for (const d of descendantsOf(a.action))
                                      if (perms.has(`${currentModule}:${d}`)) togglePerm.mutate({ module: currentModule, action: d, granted: false });
                                }}
                                className="mt-0.5"
                              />
                              <div style={{ flex: 1 }}>
                                <span className="um-perm-label">{a.label}</span>
                                <span className="um-perm-code">({a.action})</span>
                                {a.description && <div className="um-perm-desc">{a.description}</div>}
                              </div>
                            </label>
                            {children.length > 0 && (auto || checked) && (
                              <div className="um-perm-indent">{children.map((c) => renderRow(c, depth + 1))}</div>
                            )}
                          </div>
                        );
                      };

                      return (
                        <div style={{ display: "flex", flexDirection: "column", gap: 2, maxHeight: 360, overflowY: "auto", paddingRight: 4 }}>
                          {topLevel.map((a) => renderRow(a))}
                          {isCfWaf && analyticsActions.length > 0 && (
                            <div>
                              <div
                                style={{
                                  fontSize: 10,
                                  fontWeight: 700,
                                  letterSpacing: "0.08em",
                                  textTransform: "uppercase",
                                  color: T.textMuted,
                                  margin: "8px 0 2px",
                                }}
                              >
                                Analytics
                              </div>
                              <div className="um-perm-indent">{analyticsActions.map((a) => renderRow(a, 1))}</div>
                            </div>
                          )}
                          {all.length === 0 && (
                            <div style={{ fontSize: 12, color: T.textMuted, padding: "12px 0" }}>
                              Nenhuma ação cadastrada para este módulo.
                            </div>
                          )}
                        </div>
                      );
                    })()
                  )}

                  {!canManageUsers &&
                    viewerRole !== "admin" &&
                    currentModule &&
                    !matrix.moduleAdmins.has(currentModule) && (
                      <div style={{ fontSize: 11, color: T.textMuted, marginTop: 10 }}>
                        Você não é admin deste módulo — visualização somente.
                      </div>
                    )}
                </div>
              </div>
            )}
          </div>

          {/* ── Permissões Exclusivas — só super_admin vê e edita ───────── */}
          {canManageUsers && exclusiveModuleSlugs.length > 0 && (
            <div className="um-sec" style={{ borderColor: "rgba(167,139,250,0.35)" }}>
              <div className="um-sec-hd">
                <div className="um-sec-title" style={{ color: T.purple }}>
                  <Lock size={11} /> Permissões Exclusivas
                </div>
              </div>
              <div style={{ padding: "14px 16px", display: "flex", flexDirection: "column", gap: 14 }}>
                <div className="um-cfg-hint">
                  Módulos com dados restritos — só Super Admin enxerga este quadro e concede ou revoga acesso aqui,
                  inclusive para usuários com papel Admin (que não têm bypass automático nestes módulos).
                </div>
                {exclusiveModuleSlugs.map((mod) => {
                  const def = MODULES.find((x) => x.slug === mod);
                  const auto = autoGrantsModule(mod) || moduleAdmins.has(mod);
                  const all = actionsForModule(mod);
                  return (
                    <div key={mod} className="um-sec">
                      <div className="um-sec-hd">
                        <div className="um-sec-title">
                          <Lock size={10} /> {def?.short ?? mod}
                        </div>
                      </div>
                      <div style={{ padding: "12px 14px", display: "flex", flexDirection: "column", gap: 10 }}>
                        <div className="um-adm-row">
                          <div>
                            <div className="um-adm-label">
                              <ShieldCheck size={12} color={T.accent} /> Admin do módulo
                            </div>
                            <div className="um-adm-hint">
                              Concede todas as permissões deste módulo exclusivo e o direito de gerenciar quem mais tem
                              acesso a ele.
                            </div>
                          </div>
                          <Switch
                            checked={auto}
                            disabled={autoGrantsModule(mod) || toggleModAdmin.isPending}
                            onCheckedChange={(v) => toggleModAdmin.mutate({ module: mod, isAdmin: v })}
                          />
                        </div>
                        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                          {all.map((a) => {
                            const key = `${mod}:${a.action}`;
                            const checked = auto || perms.has(key);
                            // Painel só renderiza pra canManageUsers (super_admin) — não precisa
                            // reavaliar a permissão do viewer aqui, só o bypass do alvo (`auto`).
                            const canEdit = !auto && !togglePerm.isPending;
                            return (
                              <label key={a.id} className={`um-perm${canEdit ? " can" : ""}`}>
                                <Checkbox
                                  checked={checked}
                                  disabled={!canEdit}
                                  onCheckedChange={(v) =>
                                    togglePerm.mutate({ module: mod, action: a.action, granted: !!v })
                                  }
                                  className="mt-0.5"
                                />
                                <div style={{ flex: 1 }}>
                                  <span className="um-perm-label">{a.label}</span>
                                  <span className="um-perm-code">({a.action})</span>
                                  {a.description && <div className="um-perm-desc">{a.description}</div>}
                                </div>
                              </label>
                            );
                          })}
                          {all.length === 0 && (
                            <div style={{ fontSize: 12, color: T.textMuted, padding: "8px 0" }}>
                              Nenhuma ação cadastrada para este módulo.
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Footer note */}
          <div className="um-footer">
            <UserIcon size={12} style={{ marginTop: 1, flexShrink: 0 }} />
            As permissões granulares controlam o que aparece e o que está habilitado na interface. As regras de banco
            (RLS) continuam aplicadas como camada adicional de proteção.
          </div>
        </div>

        {/* ── Reset password dialog ──────────────────────────────────────── */}
        <Dialog
          open={resetPwdOpen}
          onOpenChange={(o) => {
            if (!o) {
              setNewPwd("");
              setConfirmPwd("");
              setResetPwdOpen(false);
            }
          }}
        >
          <DialogContent style={{ background: T.surface, border: `1px solid ${T.borderHi}`, borderRadius: 12 }}>
            <DialogHeader>
              <DialogTitle
                style={{
                  fontFamily: "'Space Grotesk',sans-serif",
                  fontSize: 15,
                  fontWeight: 700,
                  color: T.textPrimary,
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <KeyRound size={15} color={T.accent} /> Redefinir senha
              </DialogTitle>
            </DialogHeader>
            <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 4 }}>
              <div style={{ fontSize: 12, color: T.textMuted, lineHeight: 1.5 }}>
                Defina uma nova senha para{" "}
                <span style={{ fontFamily: "'IBM Plex Mono',monospace", color: T.accent }}>{user?.email}</span>. O
                usuário poderá usar esta senha para acessar o sistema.
              </div>
              <div className="um-field">
                <span className="um-field-lbl">Nova senha</span>
                <input
                  className="um-dinput"
                  type="password"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  placeholder="mínimo 8 caracteres"
                  autoComplete="new-password"
                />
              </div>
              <div className="um-field">
                <span className="um-field-lbl">Confirmar senha</span>
                <input
                  className="um-dinput"
                  type="password"
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  placeholder="repita a senha"
                  autoComplete="new-password"
                />
                {confirmPwd && newPwd !== confirmPwd && (
                  <span style={{ fontSize: 11, color: T.danger, marginTop: 2 }}>As senhas não coincidem.</span>
                )}
              </div>
            </div>
            <DialogFooter style={{ gap: 8, paddingTop: 4 }}>
              <button
                type="button"
                className="um-btn gst"
                onClick={() => {
                  setNewPwd("");
                  setConfirmPwd("");
                  setResetPwdOpen(false);
                }}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="um-btn pri"
                disabled={savingPwd || newPwd.length < 8 || newPwd !== confirmPwd}
                onClick={async () => {
                  setSavingPwd(true);
                  try {
                    await resetUserPasswordFn({ data: { userId: userId!, password: newPwd } });
                    toast.success("Senha redefinida com sucesso.");
                    setNewPwd("");
                    setConfirmPwd("");
                    setResetPwdOpen(false);
                  } catch (e: any) {
                    toast.error(e?.message ?? "Falha ao redefinir senha");
                  } finally {
                    setSavingPwd(false);
                  }
                }}
              >
                {savingPwd ? (
                  <>
                    <Loader2 size={12} className="um-spin" /> Salvando…
                  </>
                ) : (
                  <>
                    <KeyRound size={12} /> Redefinir
                  </>
                )}
              </button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* ── Gerenciar perfis de permissão (criar/editar/excluir) ────────── */}
        <CreatePermissionProfileDialog
          open={createProfileOpen}
          onClose={() => setCreateProfileOpen(false)}
          catalog={catalog}
          moduleSlugs={moduleSlugs}
          profiles={profiles}
          createProfileFn={createProfileFn}
          updateProfileFn={updateProfileFn}
          deleteProfileFn={deleteProfileFn}
          onChanged={() => qc.invalidateQueries({ queryKey: ["permission-profiles"] })}
        />
      </SheetContent>
    </Sheet>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CREATE PERMISSION PROFILE DIALOG
// ══════════════════════════════════════════════════════════════════════════════
function CreatePermissionProfileDialog({
  open,
  onClose,
  catalog,
  moduleSlugs,
  profiles,
  createProfileFn,
  updateProfileFn,
  deleteProfileFn,
  onChanged,
}: {
  open: boolean;
  onClose: () => void;
  catalog: any[];
  moduleSlugs: string[];
  profiles: any[];
  createProfileFn: any;
  updateProfileFn: any;
  deleteProfileFn: any;
  onChanged: () => void;
}) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function resetForm() {
    setEditingId(null);
    setName("");
    setDescription("");
    setSelected(new Set());
  }

  function startEdit(p: any) {
    setEditingId(p.id);
    setName(p.name);
    setDescription(p.description ?? "");
    setSelected(new Set((p.items ?? []).map((it: any) => `${it.module_slug}:${it.action}`)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || selected.size === 0) return;
    setBusy(true);
    try {
      const items = [...selected].map((key) => {
        const [module, action] = key.split(":");
        return { module, action };
      });
      if (editingId) {
        await updateProfileFn({
          data: { id: editingId, name: name.trim(), description: description.trim() || null, items },
        });
        toast.success(`Perfil "${name.trim()}" atualizado.`);
      } else {
        await createProfileFn({ data: { name: name.trim(), description: description.trim() || null, items } });
        toast.success(`Perfil "${name.trim()}" criado.`);
      }
      resetForm();
      onChanged();
    } catch (err: any) {
      toast.error(err?.message ?? (editingId ? "Falha ao editar perfil" : "Falha ao criar perfil"));
    } finally {
      setBusy(false);
    }
  }

  async function confirmDelete() {
    if (!confirmDeleteId) return;
    setDeleting(true);
    try {
      await deleteProfileFn({ data: { id: confirmDeleteId } });
      toast.success("Perfil excluído.");
      if (editingId === confirmDeleteId) resetForm();
      onChanged();
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao excluir perfil");
    } finally {
      setDeleting(false);
      setConfirmDeleteId(null);
    }
  }

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) {
            resetForm();
            onClose();
          }
        }}
      >
        <DialogContent
          className="sm:max-w-lg"
          style={{ background: T.surface, border: `1px solid ${T.borderHi}`, borderRadius: 12 }}
        >
          <DialogHeader>
            <DialogTitle
              style={{
                fontFamily: "'Space Grotesk',sans-serif",
                fontSize: 15,
                fontWeight: 700,
                color: T.textPrimary,
                display: "flex",
                alignItems: "center",
                gap: 8,
              }}
            >
              <Layers size={15} color={T.accent} />{" "}
              {editingId ? "Editar perfil de permissão" : "Criar perfil de permissão"}
            </DialogTitle>
          </DialogHeader>

          {profiles.length > 0 && (
            <div className="um-field">
              <span className="um-field-lbl">Perfis existentes</span>
              <div style={{ display: "flex", flexDirection: "column", gap: 4, maxHeight: 140, overflowY: "auto" }}>
                {profiles.map((p: any) => (
                  <div
                    key={p.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      padding: "6px 10px",
                      background: editingId === p.id ? T.accentSoft : T.surfaceAlt,
                      border: `1px solid ${editingId === p.id ? "rgba(59,130,246,0.35)" : T.border}`,
                      borderRadius: 6,
                    }}
                  >
                    <div style={{ minWidth: 0, overflow: "hidden" }}>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: T.textPrimary,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {p.name}
                      </div>
                      <div style={{ fontSize: 10, color: T.textMuted, fontFamily: "'IBM Plex Mono',monospace" }}>
                        {(p.items ?? []).length} permissões
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                      <button type="button" className="um-act-btn" title="Editar" onClick={() => startEdit(p)}>
                        <Pencil size={12} />
                      </button>
                      <button
                        type="button"
                        className="um-act-btn del"
                        title="Excluir"
                        onClick={() => setConfirmDeleteId(p.id)}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12, paddingTop: 8 }}>
            <div className="um-field">
              <span className="um-field-lbl">Nome do perfil</span>
              <input
                className="um-dinput"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Ex: Aprovador de GMUD"
              />
            </div>
            <div className="um-field">
              <span className="um-field-lbl">Descrição (opcional)</span>
              <input
                className="um-dinput"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="Pra que serve esse perfil"
              />
            </div>
            <div className="um-field">
              <span className="um-field-lbl">Permissões ({selected.size} selecionadas)</span>
              <div
                style={{
                  maxHeight: 320,
                  overflowY: "auto",
                  border: `1px solid ${T.border}`,
                  borderRadius: 8,
                  padding: "4px 10px",
                }}
              >
                {moduleSlugs.map((m) => {
                  const def = MODULES.find((x) => x.slug === m);
                  const actions = catalog.filter((c) => c.module_slug === m);
                  if (actions.length === 0) return null;
                  return (
                    <div key={m} style={{ padding: "8px 0", borderBottom: `1px solid ${T.border}` }}>
                      <div className="um-sublabel" style={{ marginBottom: 6 }}>
                        {def?.short ?? m}
                      </div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                        {actions.map((a) => {
                          const key = `${m}:${a.action}`;
                          return (
                            <label key={a.id} className="um-perm can">
                              <Checkbox
                                checked={selected.has(key)}
                                onCheckedChange={() => toggle(key)}
                                className="mt-0.5"
                              />
                              <div style={{ flex: 1 }}>
                                <span className="um-perm-label">{a.label}</span>
                                <span className="um-perm-code">({a.action})</span>
                              </div>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <DialogFooter style={{ gap: 8 }}>
              {editingId && (
                <button type="button" className="um-btn gst" onClick={resetForm}>
                  Novo perfil
                </button>
              )}
              <button
                type="button"
                className="um-btn gst"
                onClick={() => {
                  resetForm();
                  onClose();
                }}
              >
                Cancelar
              </button>
              <button type="submit" className="um-btn pri" disabled={busy || !name.trim() || selected.size === 0}>
                {busy ? (
                  <>
                    <Loader2 size={12} className="um-spin" /> {editingId ? "Salvando…" : "Criando…"}
                  </>
                ) : editingId ? (
                  <>
                    <Pencil size={12} /> Salvar alterações
                  </>
                ) : (
                  <>
                    <Plus size={12} /> Criar perfil
                  </>
                )}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDeleteId} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir perfil de permissão</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente. Usuários que já aplicaram este perfil não são afetados — só remove o perfil como
              opção pra futuras aplicações.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleting}
              onClick={confirmDelete}
            >
              {deleting ? "Excluindo…" : "Confirmar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
