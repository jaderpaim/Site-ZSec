import { ModuleLoading } from "@/components/layout/ModuleLoading";
import { useState, useMemo, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Check,
  KeyRound,
  Layers,
  Loader2,
  Lock,
  Plus,
  Power,
  Trash2,
  UserPlus,
  Wrench,
  Pencil,
} from "lucide-react";
import { usePermissions } from "@/lib/use-permissions";
import { MODULES } from "@/lib/modules";
import { isExclusiveModule } from "@/lib/exclusive-modules";
import { useDepartments } from "@/lib/use-departments";
import { useMaintenance, useMaintenanceToggle } from "@/lib/use-maintenance";
import {
  listUsers,
  listModulePermissionsCatalog,
  getUserPermissions,
  setUserPermissionsBatch,
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
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
import { DetailSheet } from "@/components/layout/DetailSheet";
import { useAuth } from "@/lib/auth-context";
import { getSsoPublicConfig } from "@/lib/sso.functions";
import * as React from "react";
import { APP_NAME } from "@/lib/brand";

type ModuleSlug = string;

// ── Tokens (v2) — os diálogos de cadastro/perfis ainda usam `T` inline ────────
const T = {
  surface: "var(--v2-surface)",
  surfaceAlt: "var(--v2-surface-2)",
  surfaceHover: "var(--v2-hover)",
  border: "var(--v2-line)",
  borderHi: "var(--v2-line-strong)",
  accent: "var(--v2-accent)",
  accentSoft: "color-mix(in oklch, var(--v2-accent) 12%, transparent)",
  success: "var(--v2-ok)",
  warning: "var(--v2-med)",
  danger: "var(--v2-crit)",
  purple: "var(--v2-low)",
  textPrimary: "var(--v2-fg)",
  textSecondary: "var(--v2-fg-2)",
  textMuted: "var(--v2-fg-3)",
  textSubtle: "var(--v2-fg-3)",
};

const ROLE: Record<string, { label: string; color: string; desc: string }> = {
  super_admin: {
    label: "Super Admin",
    color: "var(--v2-crit)",
    desc: "Tudo, inclusive exclusivos e usuários",
  },
  admin: { label: "Admin", color: "var(--v2-low)", desc: "Tudo, exceto exclusivos e Usuários" },
  analista: { label: "Analista", color: "var(--v2-accent)", desc: "Permissões concedidas" },
  visualizador: { label: "Visualizador", color: "var(--v2-fg-3)", desc: "Permissões concedidas" },
  personalizado: {
    label: "Personalizado",
    color: "var(--v2-med)",
    desc: "Começa vazio ou por perfil",
  },
};
const STATUS: Record<string, { label: string; color: string }> = {
  active: { label: "Ativo", color: "var(--v2-ok)" },
  pending: { label: "Convite pendente", color: "var(--v2-med)" },
  disabled: { label: "Desativado", color: "var(--v2-fg-3)" },
};
const AUTH_LABEL: Record<string, string> = {
  sso: "SSO",
  email: "E-mail e senha",
  ambos: "SSO ou senha",
};
const IDLE_DAYS = 30;

const AV_HUES = [250, 160, 70, 20, 300, 200, 130, 340];
const avHue = (email?: string) => AV_HUES[(email?.charCodeAt(0) ?? 0) % AV_HUES.length];
const initials = (u: { full_name?: string | null; email?: string }) => {
  const base = (u.full_name || u.email || "?").trim();
  const parts = base.split(/\s+/).filter(Boolean);
  return (
    parts.length > 1 ? parts[0][0] + parts[parts.length - 1][0] : base.slice(0, 2)
  ).toUpperCase();
};

function lastAccess(u: any): string | null {
  return u.last_active_at ?? u.last_sign_in_at ?? null;
}
function fmtAgo(iso: string | null) {
  if (!iso) return null;
  const m = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  if (m < 2) return "agora";
  if (m < 60) return `há ${m} min`;
  if (m < 1440) return `há ${Math.round(m / 60)}h`;
  const d = Math.round(m / 1440);
  return d === 1 ? "ontem" : `há ${d}d`;
}
const isIdle = (u: any) => {
  const t = lastAccess(u);
  return (
    u.status === "active" && (!t || Date.now() - new Date(t).getTime() > IDLE_DAYS * 86_400_000)
  );
};

function Av({ user, large }: { user: any; large?: boolean }) {
  return (
    <span
      className={`um-av${large ? " lg" : ""}`}
      style={{ "--h": avHue(user.email) } as React.CSSProperties}
    >
      {initials(user)}
      {user.online && <i className="on" title="Online agora" />}
    </span>
  );
}

function Pill({
  color,
  children,
  dot = true,
}: {
  color: string;
  children: React.ReactNode;
  dot?: boolean;
}) {
  return (
    <span className={`um-pill${dot ? "" : " nd"}`} style={{ "--c": color } as React.CSSProperties}>
      {children}
    </span>
  );
}

// ── CSS ───────────────────────────────────────────────────────────────────────
const CSS = `
  .um { font-family:var(--font-ui); color:var(--v2-fg); display:flex; flex-direction:column; gap:20px; font-size:14px; }
  .um * { box-sizing:border-box; }
  .um :focus-visible { outline:2px solid var(--v2-accent); outline-offset:2px; }
  .um-ph { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  .um-ph-title { font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.2; margin:0; }
  .um-ph-sub { margin:4px 0 0; font-size:13px; color:var(--v2-fg-3); }
  .um-ph-act { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .um-maint { display:inline-flex; align-items:center; gap:8px; height:34px; padding:0 6px 0 12px; border:1px solid var(--v2-line); border-radius:8px; font-size:13px; color:var(--v2-fg-2); background:var(--v2-surface); }
  .um-maint.on { border-color:color-mix(in oklch, var(--v2-med) 50%, transparent); background:color-mix(in oklch, var(--v2-med) 10%, transparent); color:var(--v2-fg); }

  .um-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(160px, 1fr)); background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
  .um-kpi { padding:16px 18px 14px; display:grid; gap:2px; align-content:start; box-shadow:1px 0 0 var(--v2-line), 0 1px 0 var(--v2-line); min-width:0; text-align:left; background:transparent; border:0; color:inherit; font:inherit; position:relative; }
  button.um-kpi { cursor:pointer; }
  button.um-kpi:hover { background:var(--v2-hover); }
  button.um-kpi[aria-pressed="true"]::after { content:""; position:absolute; left:18px; right:18px; bottom:0; height:2px; background:var(--v2-accent); border-radius:2px; }
  .um-kpi-label { font-size:12.5px; color:var(--v2-fg-2); display:flex; align-items:center; gap:6px; }
  .um-kpi-value { font-size:28px; font-weight:600; letter-spacing:-0.02em; line-height:1.25; font-variant-numeric:tabular-nums; }
  .um-kpi-foot { font-size:12px; color:var(--v2-fg-3); }
  .um-sw { width:8px; height:8px; border-radius:2px; display:inline-block; flex-shrink:0; }

  .um-panel { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; min-width:0; }
  .um-tbar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding:12px 16px; border-bottom:1px solid var(--v2-line); }
  .um-tbar .um-input { margin-left:auto; width:260px; }
  .um-seg { display:inline-flex; padding:2px; gap:2px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); }
  .um-seg button { height:28px; padding:0 10px; border:0; border-radius:6px; background:transparent; color:var(--v2-fg-2); font:500 13px var(--font-ui); cursor:pointer; white-space:nowrap; }
  .um-seg button:hover { color:var(--v2-fg); }
  .um-seg button[aria-pressed="true"] { background:var(--v2-surface-2); color:var(--v2-fg); box-shadow:0 0 0 1px var(--v2-line); }
  .um-input, .um-select { height:32px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg); font-size:13px; font-family:var(--font-ui); outline:none; max-width:100%; min-width:0; }
  .um-input:focus, .um-select:focus { border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }

  .um-tbl { overflow-x:auto; }
  .um-tbl table { width:100%; border-collapse:collapse; font-size:13px; }
  .um-tbl th { text-align:left; font-weight:500; font-size:12.5px; color:var(--v2-fg-3); padding:10px 16px; border-bottom:1px solid var(--v2-line); white-space:nowrap; }
  .um-tbl td { padding:10px 16px; border-bottom:1px solid var(--v2-line); vertical-align:middle; }
  .um-tbl tr.row { cursor:pointer; }
  .um-tbl tr.row:hover td { background:var(--v2-hover); }
  .um-tbl tr:last-child td { border-bottom:0; }
  .um-user { display:flex; gap:10px; align-items:center; min-width:220px; }
  .um-user b { display:block; font-weight:500; }
  .um-user small { display:block; font-size:12px; color:var(--v2-fg-3); }
  .um-acc b { display:block; font-size:12.5px; font-weight:500; white-space:nowrap; }
  .um-acc small { display:block; font-size:12px; color:var(--v2-fg-3); }
  .um-mchips { display:flex; gap:4px; flex-wrap:wrap; margin-top:3px; }
  .um-mchips span { font-size:11px; padding:1px 6px; border-radius:4px; background:var(--v2-surface-2); border:1px solid var(--v2-line); color:var(--v2-fg-2); white-space:nowrap; }
  .um-when { font-size:12.5px; color:var(--v2-fg-2); white-space:nowrap; }
  .um-when small { display:block; font-size:11.5px; color:var(--v2-fg-3); }
  .um-rowact { display:flex; gap:4px; justify-content:flex-end; }
  .um-icon { width:30px; height:30px; display:grid; place-items:center; border:0; border-radius:8px; background:transparent; color:var(--v2-fg-2); cursor:pointer; }
  .um-icon:hover { background:var(--v2-hover); color:var(--v2-fg); }
  .um-icon.del:hover { color:var(--v2-crit); }
  .um-empty { padding:28px 16px; color:var(--v2-fg-3); font-size:13px; text-align:center; }

  .um-av { width:32px; height:32px; border-radius:50%; display:grid; place-items:center; font:600 12px var(--font-ui); flex:none; position:relative; background:color-mix(in oklch, oklch(0.7 0.14 var(--h)) 22%, var(--v2-surface)); color:color-mix(in oklch, oklch(0.7 0.14 var(--h)) 80%, var(--v2-fg)); }
  .um-av.lg { width:48px; height:48px; font-size:16px; }
  .um-av .on { position:absolute; right:-1px; bottom:-1px; width:10px; height:10px; border-radius:50%; background:var(--v2-ok); border:2px solid var(--v2-surface); }
  .um-pill { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; white-space:nowrap; background:color-mix(in oklch, var(--c) 14%, transparent); color:color-mix(in oklch, var(--c) 72%, var(--v2-fg)); }
  .um-pill::before { content:""; width:6px; height:6px; border-radius:50%; background:var(--c); }
  .um-pill.nd::before { display:none; }

  .um-btn { display:inline-flex; align-items:center; justify-content:center; gap:7px; height:34px; padding:0 14px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; font-family:var(--font-ui); white-space:nowrap; border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-fg); }
  .um-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .um-btn:hover:not(:disabled) { background:var(--v2-hover); }
  .um-btn.pri { background:var(--v2-accent); border-color:var(--v2-accent); color:var(--v2-accent-ink); }
  .um-btn.pri:hover:not(:disabled) { background:var(--v2-accent); filter:brightness(1.08); }
  .um-btn.gst { border-color:transparent; background:transparent; }
  .um-btn.danger { color:var(--v2-crit); border-color:transparent; background:transparent; }
  .um-spin { animation:um-spin 0.8s linear infinite; }
  @keyframes um-spin { to { transform:rotate(360deg); } }

  /* diálogos (cadastro e perfis) */
  .um-field { display:flex; flex-direction:column; gap:6px; }
  .um-field-lbl { font-size:12.5px; font-weight:500; color:var(--v2-fg-2); }
  .um-field-hint { font-size:12px; color:var(--v2-fg-3); line-height:1.5; }
  .um-dinput { width:100%; height:34px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg); font-size:13px; font-family:var(--font-ui); outline:none; }
  .um-dinput:focus { border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }
  .um-act-btn { width:28px; height:28px; display:inline-grid; place-items:center; border:1px solid var(--v2-line); border-radius:6px; background:var(--v2-surface); color:var(--v2-fg-2); cursor:pointer; }
  .um-act-btn:hover { background:var(--v2-hover); color:var(--v2-fg); }
  .um-act-btn.del:hover { color:var(--v2-crit); }
  .um-sublabel { font-size:11px; font-weight:600; letter-spacing:0.06em; text-transform:uppercase; color:var(--v2-fg-3); }

  /* painel do usuário */
  .um-hero { display:flex; gap:14px; align-items:center; }
  .um-hero b { display:block; font-size:17px; font-weight:600; }
  .um-hero small { display:block; font-size:13px; color:var(--v2-fg-3); font-weight:400; }
  .um-stabs { display:flex; gap:4px; border-bottom:1px solid var(--v2-line); }
  .um-stabs button { height:38px; padding:0 12px; border:0; background:transparent; color:var(--v2-fg-2); font:500 13.5px var(--font-ui); cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-1px; display:inline-flex; gap:6px; align-items:center; }
  .um-stabs button:hover { color:var(--v2-fg); }
  .um-stabs button[aria-selected="true"] { color:var(--v2-fg); border-bottom-color:var(--v2-accent); }
  .um-stabs .c { font:500 11.5px var(--font-data); color:var(--v2-fg-3); }
  .um-cfg { display:grid; grid-template-columns:minmax(0, 1fr) 220px; gap:16px; align-items:center; padding:14px 0; border-top:1px solid var(--v2-line); }
  .um-cfg.full { grid-template-columns:minmax(0, 1fr); }
  .um-cfg:first-child { border-top:0; padding-top:4px; }
  .um-cfg b { display:block; font-size:13px; font-weight:500; }
  .um-cfg small { display:block; font-size:12px; color:var(--v2-fg-3); line-height:1.5; margin-top:2px; }
  @media (max-width: 640px) { .um-cfg { grid-template-columns:1fr; } }
  .um-roles { display:grid; grid-template-columns:repeat(5, minmax(0, 1fr)); gap:6px; }
  .um-roles button { display:grid; gap:2px; align-content:start; padding:10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-surface); color:var(--v2-fg); font:13px var(--font-ui); text-align:left; cursor:pointer; }
  .um-roles button:disabled { cursor:not-allowed; opacity:0.55; }
  .um-roles button b { font-weight:500; }
  .um-roles button small { font-size:11.5px; color:var(--v2-fg-3); line-height:1.35; }
  .um-roles button[aria-pressed="true"] { border-color:var(--v2-accent); background:color-mix(in oklch, var(--v2-accent) 10%, transparent); opacity:1; }
  @media (max-width: 760px) { .um-roles { grid-template-columns:1fr 1fr; } }
  .um-note { padding:10px 12px; border-radius:8px; background:var(--v2-surface-2); border:1px solid var(--v2-line); font-size:12.5px; color:var(--v2-fg-2); line-height:1.5; }

  .um-perm-box { display:grid; grid-template-columns:220px minmax(0, 1fr); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; min-height:460px; }
  @media (max-width: 760px) { .um-perm-box { grid-template-columns:1fr; } }
  .um-mlist { border-right:1px solid var(--v2-line); background:var(--v2-surface-2); display:flex; flex-direction:column; max-height:560px; overflow-y:auto; }
  .um-mlist .s { padding:8px; border-bottom:1px solid var(--v2-line); position:sticky; top:0; background:var(--v2-surface-2); z-index:1; }
  .um-mlist .s .um-input { width:100%; height:30px; }
  .um-mlist .g { font-size:10.5px; font-weight:600; letter-spacing:0.06em; text-transform:uppercase; color:var(--v2-fg-3); padding:10px 12px 4px; }
  .um-mlist button { display:grid; grid-template-columns:minmax(0, 1fr) auto; gap:8px; align-items:center; padding:7px 12px; border:0; background:transparent; color:var(--v2-fg-2); font:13px var(--font-ui); text-align:left; cursor:pointer; }
  .um-mlist button span:first-child { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .um-mlist button:hover { background:var(--v2-hover); color:var(--v2-fg); }
  .um-mlist button[aria-current="true"] { background:var(--v2-surface); color:var(--v2-fg); font-weight:500; box-shadow:inset 2px 0 0 var(--v2-accent); }
  .um-mlist .ct { font:500 11px var(--font-data); color:var(--v2-fg-3); white-space:nowrap; }
  .um-mlist .ct.adm { color:var(--v2-accent); }
  .um-mlist .ct.some { color:var(--v2-ok); }
  .um-mbody { padding:16px; display:grid; gap:14px; align-content:start; min-width:0; }
  .um-mbody h4 { margin:0; font-size:15px; font-weight:600; }
  .um-admrow { display:flex; justify-content:space-between; gap:12px; align-items:center; padding:12px 14px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-surface-2); }
  .um-admrow b { display:block; font-size:13px; font-weight:500; }
  .um-admrow small { display:block; font-size:12px; color:var(--v2-fg-3); }
  .um-acts-h { display:flex; justify-content:space-between; align-items:center; font-size:11px; font-weight:600; letter-spacing:0.06em; text-transform:uppercase; color:var(--v2-fg-3); }
  .um-acts-h button { font:500 12px var(--font-ui); letter-spacing:0; text-transform:none; color:var(--v2-accent); background:none; border:0; cursor:pointer; padding:0; }
  .um-acts-h button:disabled { opacity:0.5; cursor:not-allowed; }
  .um-perm { display:flex; gap:10px; align-items:flex-start; padding:8px 10px; border-radius:8px; }
  .um-perm.can { cursor:pointer; }
  .um-perm.can:hover { background:var(--v2-hover); }
  .um-perm.pending { background:color-mix(in oklch, var(--v2-med) 9%, transparent); box-shadow:inset 2px 0 0 var(--v2-med); }
  .um-dirty { margin-right:auto; font-size:12.5px; color:color-mix(in oklch, var(--v2-med) 80%, var(--v2-fg)); display:inline-flex; align-items:center; gap:6px; }
  .um-dirty::before { content:""; width:7px; height:7px; border-radius:50%; background:var(--v2-med); }
  .um-dot { width:7px; height:7px; border-radius:50%; background:var(--v2-med); display:inline-block; }
  .um-perm-label { font-size:13px; font-weight:500; }
  .um-perm-code { font:11.5px var(--font-data); color:var(--v2-fg-3); margin-left:6px; }
  .um-perm-desc { font-size:12px; color:var(--v2-fg-3); margin-top:1px; }
  .um-perm-indent { margin-left:26px; border-left:1px dashed var(--v2-line); padding-left:4px; }
  .um-excl { border-color:color-mix(in oklch, var(--v2-low) 40%, var(--v2-line)); }

  /* diálogos v2 */
  .um-dlg { gap:0; }
  .um-dlg-h { padding:18px 20px 14px; border-bottom:1px solid var(--v2-line); text-align:left; }
  .um-dlg-h h2 { font-size:17px; font-weight:600; margin:0; }
  .um-dlg-h p { margin:2px 0 0; font-size:13px; color:var(--v2-fg-3); }
  .um-dlg-b { padding:16px 20px; display:grid; gap:18px; max-height:calc(100vh - 220px); overflow-y:auto; }
  .um-dlg-f { display:flex; justify-content:flex-end; align-items:center; gap:8px; padding:12px 20px; border-top:1px solid var(--v2-line); flex-wrap:wrap; }
  .um-dlg-f .sum { margin-right:auto; font-size:12.5px; color:var(--v2-fg-3); }
  .um-dsec { display:grid; gap:10px; }
  .um-g2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  @media (max-width: 600px) { .um-g2 { grid-template-columns:1fr; } }
  .um-field .opt { font-weight:400; color:var(--v2-fg-3); }
  .um-field-hint.ok { color:color-mix(in oklch, var(--v2-ok) 75%, var(--v2-fg)); }
  .um-choice { display:grid; grid-template-columns:1fr 1fr; gap:6px; }
  .um-choice button { display:flex; gap:10px; align-items:center; padding:10px 12px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-surface); color:var(--v2-fg); font:13px var(--font-ui); text-align:left; cursor:pointer; }
  .um-choice button b { display:block; font-weight:500; }
  .um-choice button small { display:block; font-size:12px; color:var(--v2-fg-3); }
  .um-choice button[aria-pressed="true"] { border-color:var(--v2-accent); background:color-mix(in oklch, var(--v2-accent) 10%, transparent); }
  .um-choice .rd { width:16px; height:16px; border-radius:50%; border:1.5px solid var(--v2-line-strong); flex:none; display:grid; place-items:center; }
  .um-choice button[aria-pressed="true"] .rd { border-color:var(--v2-accent); }
  .um-choice button[aria-pressed="true"] .rd::after { content:""; width:8px; height:8px; border-radius:50%; background:var(--v2-accent); }
  .um-roles.three { grid-template-columns:repeat(3, minmax(0, 1fr)); }
  .um-ulist { border:1px solid var(--v2-line); border-radius:8px; max-height:240px; overflow-y:auto; }
  .um-ulist .s { padding:8px; border-bottom:1px solid var(--v2-line); position:sticky; top:0; background:var(--v2-surface); z-index:1; }
  .um-ulist .s .um-input { width:100%; }
  .um-ulist button { width:100%; display:grid; grid-template-columns:32px minmax(0, 1fr) auto; gap:10px; align-items:center; padding:8px 10px; border:0; border-top:1px solid var(--v2-line); background:transparent; color:var(--v2-fg); font:13px var(--font-ui); text-align:left; cursor:pointer; }
  .um-ulist .s + button { border-top:0; }
  .um-ulist button:hover { background:var(--v2-hover); }
  .um-ulist button[aria-pressed="true"] { background:color-mix(in oklch, var(--v2-accent) 10%, transparent); }
  .um-ulist b { display:block; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .um-ulist small { display:block; font-size:12px; color:var(--v2-fg-3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .um-note ul { margin:4px 0 0; padding-left:18px; display:grid; gap:2px; }
  .um-pf { display:grid; grid-template-columns:280px minmax(0, 1fr); min-height:560px; max-height:calc(100vh - 160px); }
  @media (max-width: 860px) { .um-pf { grid-template-columns:1fr; max-height:none; } }
  .um-pf-list { border-right:1px solid var(--v2-line); background:var(--v2-surface-2); display:flex; flex-direction:column; min-height:0; }
  .um-pf-top { flex:none; padding:12px; border-bottom:1px solid var(--v2-line); display:grid; gap:8px; }
  .um-pf-items { overflow-y:auto; min-height:0; }
  .um-pf-item { width:100%; display:grid; gap:2px; padding:12px 14px; border:0; border-bottom:1px solid var(--v2-line); background:transparent; color:var(--v2-fg); font:13px var(--font-ui); text-align:left; cursor:pointer; }
  .um-pf-item:hover { background:var(--v2-hover); }
  .um-pf-item[aria-current="true"] { background:var(--v2-surface); box-shadow:inset 3px 0 0 var(--v2-accent); }
  .um-pf-item b { font-weight:500; }
  .um-pf-item small { font-size:12px; color:var(--v2-fg-3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .um-pf-item .meta { display:flex; gap:10px; font:11.5px var(--font-data); color:var(--v2-fg-3); margin-top:2px; }
  .um-pf-ed { display:flex; flex-direction:column; min-width:0; min-height:0; }
  .um-pf-ed .body { padding:16px 20px; display:grid; gap:14px; overflow-y:auto; align-content:start; flex:1; min-height:0; }
  .um-pm { display:grid; grid-template-columns:210px minmax(0, 1fr); border:1px solid var(--v2-line); border-radius:8px; overflow:hidden; height:420px; }
  @media (max-width: 640px) { .um-pm { grid-template-columns:1fr; height:auto; } }
  .um-pm-mods { border-right:1px solid var(--v2-line); overflow-y:auto; background:var(--v2-surface-2); }
  .um-pm-mods .g { font-size:10.5px; font-weight:600; letter-spacing:0.06em; text-transform:uppercase; color:var(--v2-fg-3); padding:10px 12px 4px; }
  .um-pm-mods button { width:100%; display:grid; grid-template-columns:minmax(0, 1fr) auto; gap:8px; padding:7px 12px; border:0; background:transparent; color:var(--v2-fg-2); font:13px var(--font-ui); text-align:left; cursor:pointer; }
  .um-pm-mods button span:first-child { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .um-pm-mods button:hover { background:var(--v2-hover); }
  .um-pm-mods button[aria-current="true"] { background:var(--v2-surface); color:var(--v2-fg); font-weight:500; box-shadow:inset 2px 0 0 var(--v2-accent); }
  .um-pm-mods .ct { font:500 11px var(--font-data); color:var(--v2-fg-3); }
  .um-pm-mods .ct.some { color:var(--v2-ok); }
  .um-pm-acts { padding:10px; overflow-y:auto; display:grid; gap:2px; align-content:start; }
  .um-chips { display:flex; flex-wrap:wrap; gap:6px; }
  .um-chips span { font-size:12px; padding:2px 8px; border-radius:99px; background:var(--v2-surface-2); border:1px solid var(--v2-line); color:var(--v2-fg-2); }
  .um-chips span b { color:var(--v2-fg); font-weight:500; }
`;

// ══════════════════════════════════════════════════════════════════════════════
// PÁGINA
// ══════════════════════════════════════════════════════════════════════════════
type StatusFilter = "all" | "active" | "pending" | "disabled" | "idle";

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

  const listUsersFn = useServerFn(listUsers);
  const listCatalogFn = useServerFn(listModulePermissionsCatalog);
  const inviteUserFn = useServerFn(inviteUser);
  const setUserActiveFn = useServerFn(setUserActive);
  const deleteUserFn = useServerFn(deleteUser);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [roleFilter, setRoleFilter] = useState("all");
  const [deptFilter, setDeptFilter] = useState("all");
  const [confirmAction, setConfirmAction] = useState<{
    kind: "deactivate" | "activate" | "delete";
    user: any;
  } | null>(null);
  const qc = useQueryClient();

  const usersQuery = useQuery({
    queryKey: ["users-mgmt", "list"],
    queryFn: () => listUsersFn({ data: undefined as any }),
    enabled: !!currentUser && !permLoading && isAdmin,
    retry: false,
    refetchInterval: 30_000,
  });

  const catalogQuery = useQuery({
    queryKey: ["module-permissions-catalog"],
    queryFn: () => listCatalogFn(),
    enabled: !!currentUser && !permLoading && isAdmin,
    retry: false,
  });

  if (permLoading) return <ModuleLoading />;

  if (!isAdmin)
    return (
      <div className="um">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="um-panel">
          <div className="um-empty">
            <Lock size={14} style={{ verticalAlign: -2, marginRight: 6 }} />
            Este módulo só está disponível para administradores globais.
          </div>
        </div>
      </div>
    );

  if (usersQuery.isLoading) return <ModuleLoading />;

  const users: any[] = usersQuery.data?.users ?? [];
  const catalog = catalogQuery.data?.catalog ?? [];

  const count = (f: (u: any) => boolean) => users.filter(f).length;
  const kpis = {
    total: users.length,
    admins: count((u) => u.role === "admin" || u.role === "super_admin"),
    active: count((u) => u.status === "active"),
    online: count((u) => u.online),
    pending: count((u) => u.status === "pending"),
    disabled: count((u) => u.status === "disabled"),
    idle: count(isIdle),
  };

  const q = searchQ.trim().toLowerCase();
  const filtered = users.filter(
    (u) =>
      (statusFilter === "all" ||
        (statusFilter === "idle" ? isIdle(u) : u.status === statusFilter)) &&
      (roleFilter === "all" || u.role === roleFilter) &&
      (deptFilter === "all" ||
        (deptFilter === "__none" ? !u.department_id : u.department_id === deptFilter)) &&
      (!q ||
        [u.full_name, u.email, u.department_name].some((v) =>
          String(v ?? "")
            .toLowerCase()
            .includes(q),
        )),
  );

  const kpiFilter = (k: StatusFilter) => setStatusFilter((s) => (s === k ? "all" : k));
  const openUser = (id: string) => {
    setSelectedId(id);
    setSheetOpen(true);
  };
  const canActOn = (u: any) =>
    canManageUsers && currentUser?.id !== u.id && !(role === "admin" && u.role === "super_admin");
  const selectedUser = users.find((u) => u.id === selectedId) ?? null;

  const accessCell = (u: any) => {
    if (u.role === "super_admin")
      return (
        <>
          <b>Acesso total</b>
          <small>inclusive módulos exclusivos</small>
        </>
      );
    if (u.role === "admin")
      return (
        <>
          <b>Acesso total</b>
          <small>exceto Usuários e exclusivos</small>
        </>
      );
    return (
      <>
        <b>
          {u.permissionCount} {u.permissionCount === 1 ? "permissão" : "permissões"}
        </b>
        {u.moduleAdmins.length > 0 ? (
          <div className="um-mchips">
            {u.moduleAdmins.slice(0, 3).map((m: string) => (
              <span key={m} title="Admin do módulo">
                ★ {MODULES.find((x) => x.slug === m)?.short ?? m}
              </span>
            ))}
            {u.moduleAdmins.length > 3 && <span>+{u.moduleAdmins.length - 3}</span>}
          </div>
        ) : (
          <small>
            {u.permission_profile_name
              ? `perfil ${u.permission_profile_name}`
              : "concedidas uma a uma"}
          </small>
        )}
      </>
    );
  };

  return (
    <div className="um">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="um-ph">
        <div>
          <h1 className="um-ph-title">Usuários</h1>
          <p className="um-ph-sub">Quem acessa o {APP_NAME}, com qual papel e quais permissões</p>
        </div>
        <div className="um-ph-act">
          <span
            className={`um-maint${maintenance.active ? " on" : ""}`}
            title="Bloqueia o acesso de quem não é admin enquanto estiver ativo"
          >
            <Wrench size={14} />
            Modo manutenção
            <Switch
              checked={maintenance.active}
              disabled={toggleMaintenance.isPending}
              onCheckedChange={(v) => toggleMaintenance.mutate(v)}
              aria-label="Modo manutenção"
            />
          </span>
          {canInviteUsers && (
            <button className="um-btn pri" onClick={() => setCreateOpen(true)}>
              <Plus size={14} />
              Cadastrar usuário
            </button>
          )}
        </div>
      </div>

      <div className="um-kpis">
        <div className="um-kpi">
          <span className="um-kpi-label">Usuários</span>
          <span className="um-kpi-value">{kpis.total}</span>
          <span className="um-kpi-foot">
            {kpis.admins} {kpis.admins === 1 ? "administrador" : "administradores"}
          </span>
        </div>
        <button
          className="um-kpi"
          aria-pressed={statusFilter === "active"}
          onClick={() => kpiFilter("active")}
        >
          <span className="um-kpi-label">
            <span className="um-sw" style={{ background: "var(--v2-ok)" }} />
            Ativos
          </span>
          <span className="um-kpi-value">{kpis.active}</span>
          <span className="um-kpi-foot">{kpis.online} online agora</span>
        </button>
        <button
          className="um-kpi"
          aria-pressed={statusFilter === "pending"}
          onClick={() => kpiFilter("pending")}
        >
          <span className="um-kpi-label">
            {kpis.pending > 0 && <span className="um-sw" style={{ background: "var(--v2-med)" }} />}
            Convites pendentes
          </span>
          <span className="um-kpi-value">{kpis.pending}</span>
          <span className="um-kpi-foot">ainda não entraram</span>
        </button>
        <button
          className="um-kpi"
          aria-pressed={statusFilter === "disabled"}
          onClick={() => kpiFilter("disabled")}
        >
          <span className="um-kpi-label">Desativados</span>
          <span className="um-kpi-value">{kpis.disabled}</span>
          <span className="um-kpi-foot">sem acesso</span>
        </button>
        <button
          className="um-kpi"
          aria-pressed={statusFilter === "idle"}
          onClick={() => kpiFilter("idle")}
        >
          <span className="um-kpi-label">Sem acesso há {IDLE_DAYS}+ dias</span>
          <span className="um-kpi-value">{kpis.idle}</span>
          <span className="um-kpi-foot">ativos, candidatos a revisão</span>
        </button>
      </div>

      <section className="um-panel">
        <div className="um-tbar">
          <div className="um-seg" role="group" aria-label="Situação">
            {(
              [
                ["all", "Todos"],
                ["active", "Ativos"],
                ["pending", "Pendentes"],
                ["disabled", "Desativados"],
              ] as Array<[StatusFilter, string]>
            ).map(([k, l]) => (
              <button key={k} aria-pressed={statusFilter === k} onClick={() => setStatusFilter(k)}>
                {l}
              </button>
            ))}
          </div>
          <select
            className="um-select"
            aria-label="Papel"
            value={roleFilter}
            onChange={(e) => setRoleFilter(e.target.value)}
          >
            <option value="all">Todos os papéis</option>
            {Object.entries(ROLE).map(([k, r]) => (
              <option key={k} value={k}>
                {r.label}
              </option>
            ))}
          </select>
          <select
            className="um-select"
            aria-label="Departamento"
            value={deptFilter}
            onChange={(e) => setDeptFilter(e.target.value)}
          >
            <option value="all">Todos os departamentos</option>
            <option value="__none">Sem departamento</option>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
          <input
            className="um-input"
            placeholder="Buscar nome, e-mail ou departamento"
            aria-label="Buscar usuário"
            value={searchQ}
            onChange={(e) => setSearchQ(e.target.value)}
          />
        </div>
        <div className="um-tbl">
          <table>
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Departamento</th>
                <th>Papel</th>
                <th>Acesso</th>
                <th>Login</th>
                <th>Situação</th>
                <th>
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="um-empty">
                    {users.length === 0
                      ? "Nenhum usuário encontrado."
                      : "Nenhum usuário com esses filtros."}
                  </td>
                </tr>
              )}
              {filtered.map((u) => {
                const r = ROLE[u.role] ?? ROLE.visualizador;
                const st = STATUS[u.status] ?? STATUS.active;
                const last = fmtAgo(lastAccess(u));
                return (
                  <tr
                    key={u.id}
                    className="row"
                    tabIndex={0}
                    onClick={() => openUser(u.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") openUser(u.id);
                    }}
                  >
                    <td>
                      <div className="um-user">
                        <Av user={u} />
                        <span>
                          <b>{u.full_name || u.email}</b>
                          <small>{u.email}</small>
                        </span>
                      </div>
                    </td>
                    <td style={{ color: "var(--v2-fg-2)" }}>{u.department_name ?? "—"}</td>
                    <td>
                      <Pill color={r.color} dot={false}>
                        {r.label}
                      </Pill>
                    </td>
                    <td className="um-acc">{accessCell(u)}</td>
                    <td className="um-when">
                      {AUTH_LABEL[u.auth_method] ?? "SSO"}
                      <small>{last ? `último acesso ${last}` : "nunca entrou"}</small>
                    </td>
                    <td>
                      <Pill color={st.color}>{st.label}</Pill>
                    </td>
                    <td>
                      <div className="um-rowact" onClick={(e) => e.stopPropagation()}>
                        {canActOn(u) && (
                          <>
                            <button
                              className="um-icon"
                              title={u.status === "disabled" ? "Reativar" : "Desativar"}
                              aria-label={u.status === "disabled" ? "Reativar" : "Desativar"}
                              onClick={() =>
                                setConfirmAction({
                                  kind: u.status === "disabled" ? "activate" : "deactivate",
                                  user: u,
                                })
                              }
                            >
                              <Power size={15} />
                            </button>
                            <button
                              className="um-icon del"
                              title="Excluir usuário"
                              aria-label="Excluir usuário"
                              onClick={() => setConfirmAction({ kind: "delete", user: u })}
                            >
                              <Trash2 size={15} />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {selectedUser && (
        <UserPermissionsSheet
          key={selectedUser.id}
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          user={selectedUser}
          catalog={catalog}
          departments={departments}
          canActOnUser={canActOn(selectedUser)}
          onRequestAction={(kind) => setConfirmAction({ kind, user: selectedUser })}
        />
      )}

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

      <AlertDialog
        open={!!confirmAction}
        onOpenChange={(o) => {
          if (!o) setConfirmAction(null);
        }}
      >
        <AlertDialogContent
          className="font-ui"
          style={{ background: T.surface, border: `1px solid ${T.borderHi}` }}
        >
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
                  <strong>{confirmAction.user.full_name || confirmAction.user.email}</strong> do
                  sistema.
                </>
              )}
              {confirmAction?.kind === "deactivate" && (
                <>
                  O usuário{" "}
                  <strong>{confirmAction.user.full_name || confirmAction.user.email}</strong> não
                  poderá mais acessar o sistema até ser reativado.
                </>
              )}
              {confirmAction?.kind === "activate" && (
                <>
                  O usuário{" "}
                  <strong>{confirmAction.user.full_name || confirmAction.user.email}</strong> poderá
                  voltar a acessar o sistema.
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
                    if (confirmAction.user.id === selectedId) setSheetOpen(false);
                  } else {
                    await setUserActiveFn({
                      data: {
                        userId: confirmAction.user.id,
                        active: confirmAction.kind === "activate",
                      },
                    });
                    toast.success(
                      confirmAction.kind === "activate"
                        ? "Usuário reativado"
                        : "Usuário desativado",
                    );
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
// CADASTRAR USUÁRIO
// ══════════════════════════════════════════════════════════════════════════════
const ROLE_ORDER = ["visualizador", "analista", "personalizado", "admin", "super_admin"] as const;
const ROLE_INVITE_DESC: Record<string, string> = {
  visualizador: "Somente leitura nos módulos liberados",
  analista: "Leitura e operação",
  personalizado: "Começa sem permissões, ou por perfil",
  admin: "Tudo, exceto exclusivos e Usuários",
  super_admin: "Tudo, inclusive Usuários",
};

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
  const [role, setRole] = useState<
    "admin" | "analista" | "visualizador" | "personalizado" | "super_admin"
  >("visualizador");
  const [mode, setMode] = useState<"role" | "copy">("role");
  const [copyFrom, setCopyFrom] = useState<string>("__none__");
  const [copySearch, setCopySearch] = useState("");
  const [departmentId, setDepartmentId] = useState<string>("__none");
  const [permissionProfileId, setPermissionProfileId] = useState<string>("__none__");
  const [busy, setBusy] = useState(false);

  // Admin (não super_admin) não pode virar fonte de cópia super_admin — evita
  // clonar acesso que ele próprio não tem como conceder (ver copyUserConfig).
  const copySources = isSuperAdminViewer
    ? users
    : users.filter((u: any) => u.role !== "super_admin");
  const effectiveCopy = mode === "copy" ? copyFrom : "__none__";

  const listProfilesFn = useServerFn(listPermissionProfiles);
  const profilesQuery = useQuery({
    queryKey: ["permission-profiles"],
    queryFn: () => listProfilesFn(),
    enabled: open && role === "personalizado",
  });
  const profiles = profilesQuery.data?.profiles ?? [];

  // Domínios do SSO (mesma config pública usada pela tela de login)
  const ssoFn = useServerFn(getSsoPublicConfig);
  const ssoQuery = useQuery({
    queryKey: ["sso-public-config"],
    queryFn: () => ssoFn(),
    enabled: open,
  });
  const domain = email.includes("@") ? email.split("@")[1]?.trim().toLowerCase() : "";
  const ssoOn = !!ssoQuery.data?.oauthEnabled;
  const viaSso = ssoOn && !!domain && (ssoQuery.data?.allowedDomains ?? []).includes(domain);

  // Perfil só se aplica quando não há cópia — cópia já traz as permissões prontas.
  const showProfilePicker = mode === "role" && role === "personalizado";
  const source = users.find((u: any) => u.id === copyFrom) ?? null;

  function reset() {
    setEmail("");
    setFullName("");
    setRole("visualizador");
    setMode("role");
    setCopyFrom("__none__");
    setCopySearch("");
    setDepartmentId("__none");
    setPermissionProfileId("__none__");
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "copy" && copyFrom === "__none__") {
      toast.error("Escolha de quem copiar as configurações");
      return;
    }
    setBusy(true);
    try {
      await inviteUserFn({
        data: {
          email,
          fullName,
          role: mode === "copy" && source?.role ? source.role : role,
          copyFromUserId: effectiveCopy === "__none__" ? null : effectiveCopy,
          departmentId: departmentId === "__none" ? null : departmentId,
          permissionProfileId:
            showProfilePicker && permissionProfileId !== "__none__" ? permissionProfileId : null,
        },
      });
      toast.success(
        effectiveCopy === "__none__"
          ? `Convite enviado para ${email}.`
          : `Convite enviado para ${email} com as configurações copiadas.`,
      );
      reset();
      onCreated();
    } catch (err: any) {
      toast.error(err?.message ?? "Falha ao cadastrar");
    } finally {
      setBusy(false);
    }
  }

  const cq = copySearch.trim().toLowerCase();
  const copyList = [...copySources]
    .filter((u: any) => !cq || `${u.full_name ?? ""} ${u.email}`.toLowerCase().includes(cq))
    .sort((a: any, b: any) =>
      (a.full_name || a.email || "").localeCompare(b.full_name || b.email || "", "pt-BR"),
    );

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <DialogContent
        className="font-ui sm:max-w-2xl p-0 gap-0"
        style={{
          background: T.surface,
          border: `1px solid ${T.borderHi}`,
          borderRadius: 12,
          color: T.textPrimary,
        }}
      >
        <form onSubmit={submit} className="um um-dlg">
          <DialogHeader className="um-dlg-h">
            <DialogTitle>Cadastrar usuário</DialogTitle>
            <p>A pessoa recebe um convite por e-mail para ativar o acesso.</p>
          </DialogHeader>

          <div className="um-dlg-b">
            <div className="um-dsec">
              <div className="um-sublabel">Quem</div>
              <div className="um-g2">
                <label className="um-field">
                  <span className="um-field-lbl">Nome completo</span>
                  <input
                    className="um-dinput"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    required
                    placeholder="Maria Costa"
                  />
                </label>
                <label className="um-field">
                  <span className="um-field-lbl">E-mail</span>
                  <input
                    className="um-dinput"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="maria.costa@empresa.com.br"
                  />
                  {domain && ssoOn && (
                    <span className={`um-field-hint${viaSso ? " ok" : ""}`}>
                      {viaSso
                        ? "✓ Domínio com SSO — entra com a conta Microsoft"
                        : "Domínio fora do SSO — vai precisar de senha"}
                    </span>
                  )}
                </label>
              </div>
              <label className="um-field">
                <span className="um-field-lbl">
                  Departamento <span className="opt">(opcional)</span>
                </span>
                <Select value={departmentId} onValueChange={setDepartmentId}>
                  <SelectTrigger className="font-ui">
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
              </label>
            </div>

            <div className="um-dsec">
              <div className="um-sublabel">Acesso inicial</div>
              <div className="um-choice" role="radiogroup" aria-label="Acesso inicial">
                {(
                  [
                    ["role", "Escolher um papel", "Permissões padrão do papel"],
                    ["copy", "Copiar de outro usuário", "Mesmo papel e permissões"],
                  ] as const
                ).map(([k, t, d]) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={mode === k}
                    aria-pressed={mode === k}
                    onClick={() => setMode(k)}
                  >
                    <span className="rd" />
                    <span>
                      <b>{t}</b>
                      <small>{d}</small>
                    </span>
                  </button>
                ))}
              </div>

              {mode === "role" ? (
                <>
                  <div className="um-roles three" role="radiogroup" aria-label="Papel">
                    {ROLE_ORDER.filter((k) => k !== "super_admin" || isSuperAdminViewer).map(
                      (k) => (
                        <button
                          key={k}
                          type="button"
                          role="radio"
                          aria-checked={role === k}
                          aria-pressed={role === k}
                          onClick={() => setRole(k)}
                        >
                          <b>{ROLE[k].label}</b>
                          <small>{ROLE_INVITE_DESC[k]}</small>
                        </button>
                      ),
                    )}
                  </div>
                  {showProfilePicker && (
                    <label className="um-field">
                      <span className="um-field-lbl">
                        Perfil de permissão <span className="opt">(opcional)</span>
                      </span>
                      <Select value={permissionProfileId} onValueChange={setPermissionProfileId}>
                        <SelectTrigger className="font-ui" disabled={profilesQuery.isLoading}>
                          <SelectValue placeholder="Escolher perfil…" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="__none__">
                            {profiles.length === 0
                              ? "Nenhum perfil cadastrado"
                              : "Nenhum — começa sem permissões"}
                          </SelectItem>
                          {profiles.map((p: any) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name} · {(p.items ?? []).length} permissões
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </label>
                  )}
                </>
              ) : (
                <>
                  <div className="um-ulist">
                    <div className="s">
                      <input
                        className="um-input"
                        placeholder="Buscar usuário"
                        aria-label="Buscar usuário para copiar"
                        value={copySearch}
                        onChange={(e) => setCopySearch(e.target.value)}
                      />
                    </div>
                    {copyList.length === 0 && (
                      <div className="um-empty">Nenhum usuário encontrado.</div>
                    )}
                    {copyList.map((u: any) => (
                      <button
                        key={u.id}
                        type="button"
                        aria-pressed={copyFrom === u.id}
                        onClick={() => setCopyFrom(u.id)}
                      >
                        <Av user={u} />
                        <span style={{ minWidth: 0 }}>
                          <b>{u.full_name || u.email}</b>
                          <small>{u.email}</small>
                        </span>
                        <Pill color={(ROLE[u.role] ?? ROLE.visualizador).color} dot={false}>
                          {(ROLE[u.role] ?? ROLE.visualizador).label}
                        </Pill>
                      </button>
                    ))}
                  </div>
                  {source && (
                    <div className="um-note">
                      <b>Será copiado de {source.full_name || source.email}:</b>
                      <ul>
                        <li>Papel {(ROLE[source.role] ?? ROLE.visualizador).label}</li>
                        <li>
                          {source.role === "admin" || source.role === "super_admin"
                            ? "Acesso total (pelo papel)"
                            : `${source.permissionCount} permissões granulares`}
                        </li>
                        {source.moduleAdmins?.length > 0 && (
                          <li>
                            Admin de {source.moduleAdmins.length}{" "}
                            {source.moduleAdmins.length === 1 ? "módulo" : "módulos"} (
                            {source.moduleAdmins
                              .map((m: string) => MODULES.find((x) => x.slug === m)?.short ?? m)
                              .join(", ")}
                            )
                          </li>
                        )}
                      </ul>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>

          <DialogFooter className="um-dlg-f">
            <span className="sum">
              {email
                ? `Convite para ${email}${viaSso ? " · acesso via SSO" : ""}`
                : "Um e-mail de ativação será enviado"}
            </span>
            <button type="button" className="um-btn gst" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="um-btn pri" disabled={busy}>
              {busy ? <Loader2 size={14} className="um-spin" /> : <UserPlus size={14} />}
              {busy ? "Enviando…" : "Enviar convite"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PAINEL DO USUÁRIO — regras de permissão inalteradas, só reorganizadas em abas
// ══════════════════════════════════════════════════════════════════════════════

// Árvore de permissões só pro cloudflare-waf — cada action-pai lista os
// action_strings dos filhos diretos. Desmarcar um pai desmarca TODOS os
// descendentes (recursivo), não só os filhos diretos.
const CF_PERM_TREE: Record<string, string[]> = {
  manage: [
    "manage_buscar_dns",
    "manage_purge_cache",
    "manage_cache_performance",
    "manage_adicionar_dns",
    "manage_editar_dns",
    "manage_custom_rules",
    "manage_managed_rules",
    "manage_load_balancing",
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
const CF_ANALYTICS = new Set([
  "view_analytics_http",
  "view_analytics_security",
  "view_analytics_web",
  "view_analytics_loadbalancing",
]);

type SheetTab = "access" | "perms" | "exclusive";

function UserPermissionsSheet({
  open,
  onOpenChange,
  user,
  catalog,
  departments,
  canActOnUser,
  onRequestAction,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  user: any;
  catalog: any[];
  departments: Array<{ id: string; name: string }>;
  canActOnUser: boolean;
  onRequestAction: (kind: "deactivate" | "activate" | "delete") => void;
}) {
  const userId: string = user.id;
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
  const setPermsBatchFn = useServerFn(setUserPermissionsBatch);
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

  const [tab, setTab] = useState<SheetTab>("access");
  const [resetPwdOpen, setResetPwdOpen] = useState(false);
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [savingPwd, setSavingPwd] = useState(false);
  const [createProfileOpen, setCreateProfileOpen] = useState(false);
  const [selectedProfileId, setSelectedProfileId] = useState<string>("__none__");
  const [modSearch, setModSearch] = useState("");
  // Rascunho das permissões: só vai para o servidor ao clicar em "Salvar"
  const [draft, setDraft] = useState<Map<string, boolean>>(() => new Map());
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const permsQuery = useQuery({
    queryKey: ["user-perms", userId],
    queryFn: () => getUserPermsFn({ data: { userId } }),
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

  // Módulos exclusivos (ex.: benchmark) saem daqui — têm aba própria
  // ("Exclusivas", só super_admin), não a lista normal.
  const moduleSlugs = useMemo(
    () => MODULES.map((m) => m.slug).filter((s) => !isExclusiveModule(s)),
    [],
  );
  const exclusiveModuleSlugs = useMemo(
    () => MODULES.map((m) => m.slug).filter((s) => isExclusiveModule(s)),
    [],
  );
  const [activeModule, setActiveModule] = useState<string | null>(null);
  const currentModule = activeModule ?? moduleSlugs[0] ?? null;
  const [activeExclusive, setActiveExclusive] = useState<string | null>(null);
  const currentExclusive = activeExclusive ?? exclusiveModuleSlugs[0] ?? null;

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["user-perms", userId] });
    qc.invalidateQueries({ queryKey: ["users-mgmt", "list"] });
    qc.invalidateQueries({ queryKey: ["permissions"] });
  };

  const applyProfile = useMutation({
    mutationFn: async (profileId: string) => applyProfileFn({ data: { userId, profileId } }),
    onSuccess: (_res, profileId) => {
      invalidate();
      setSelectedProfileId(profileId);
      toast.success("Perfil de permissão aplicado.");
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao aplicar perfil"),
  });

  const savePerms = useMutation({
    mutationFn: async () => {
      const changes = [...draft.entries()].map(([key, granted]) => {
        const [module, action] = key.split(":");
        return { module, action, granted };
      });
      return setPermsBatchFn({ data: { userId, changes } });
    },
    onSuccess: (res) => {
      setDraft(new Map());
      invalidate();
      toast.success(`${res.count} ${res.count === 1 ? "permissão salva" : "permissões salvas"}`);
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar"),
  });

  const toggleModAdmin = useMutation({
    mutationFn: async (v: { module: string; isAdmin: boolean }) =>
      setModAdminFn({ data: { userId, ...v } }),
    onSuccess: invalidate,
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar"),
  });

  const changeRole = useMutation({
    mutationFn: async (
      role: "admin" | "analista" | "visualizador" | "personalizado" | "super_admin",
    ) => setRoleFn({ data: { userId, role } }),
    onSuccess: async () => {
      invalidate();
      if (userId === currentUser?.id) await refreshRole();
      toast.success("Papel atualizado");
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar"),
  });

  const changeDepartment = useMutation({
    mutationFn: async (departmentId: string | null) =>
      setUserDepartmentFn({ data: { userId, departmentId } }),
    onSuccess: () => {
      invalidate();
      toast.success("Departamento atualizado");
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar"),
  });

  const changeAuthMethod = useMutation({
    mutationFn: async (authMethod: "sso" | "email" | "ambos") =>
      setUserAuthMethodFn({ data: { userId, authMethod } }),
    onSuccess: () => {
      invalidate();
      toast.success("Método de autenticação atualizado");
    },
    onError: (e: any) => toast.error(e?.message ?? "Falha ao salvar"),
  });

  const moduleAdmins = new Set<string>(permsQuery.data?.moduleAdmins ?? []);
  const savedPerms = new Set<string>(
    (permsQuery.data?.permissions ?? []).map((p) => `${p.module}:${p.action}`),
  );
  // Permissões efetivas na tela = salvas + rascunho
  const perms = new Set(savedPerms);
  for (const [key, granted] of draft) {
    if (granted) perms.add(key);
    else perms.delete(key);
  }
  const dirtyCount = draft.size;
  // Marca/desmarca no rascunho; voltar ao valor salvo remove a pendência
  const setPerms = (updates: Array<[key: string, granted: boolean]>) =>
    setDraft((prev) => {
      const next = new Map(prev);
      for (const [key, granted] of updates) {
        if (savedPerms.has(key) === granted) next.delete(key);
        else next.set(key, granted);
      }
      return next;
    });
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
  // "Permissões por módulo" só lista módulos não-exclusivos — admin já tem
  // bypass total neles, então pode conceder pra outros aqui também.
  const canEditModule = (mod: string) =>
    canManageUsers || viewerRole === "admin" || matrix.moduleAdmins.has(mod);

  const grantedCount = moduleSlugs.reduce(
    (n, m) => n + actionsForModule(m).filter((a) => perms.has(`${m}:${a.action}`)).length,
    0,
  );
  const exclusiveGrantedCount = exclusiveModuleSlugs.reduce(
    (n, m) => n + actionsForModule(m).filter((a) => perms.has(`${m}:${a.action}`)).length,
    0,
  );
  const role = ROLE[user.role] ?? ROLE.visualizador;
  const st = STATUS[user.status] ?? STATUS.active;
  const fullAccess = isSuperAdmin || isTrueAdmin;

  // Marca/desmarca todas as ações do módulo (no rascunho)
  function bulkSet(mod: string, granted: boolean) {
    setPerms(actionsForModule(mod).map((a) => [`${mod}:${a.action}`, granted]));
  }

  // Fechar com alterações pendentes pede confirmação
  const requestClose = (o: boolean) => {
    if (!o && dirtyCount > 0) setConfirmDiscard(true);
    else onOpenChange(o);
  };

  // Lista de módulos agrupada por área, com contador
  const ms = modSearch.trim().toLowerCase();
  const groups = useMemo(() => {
    const map = new Map<string, typeof MODULES>();
    for (const m of MODULES) {
      if (isExclusiveModule(m.slug)) continue;
      const g = m.group ?? "Outros";
      map.set(g, [...(map.get(g) ?? []), m]);
    }
    return [...map.entries()];
  }, []);
  const moduleCounter = (mod: string): { text: string; cls: string } => {
    if (autoGrantsModule(mod)) return { text: "tudo", cls: "adm" };
    if (moduleAdmins.has(mod)) return { text: "★ admin", cls: "adm" };
    const all = actionsForModule(mod);
    const n = all.filter((a) => perms.has(`${mod}:${a.action}`)).length;
    return { text: `${n}/${all.length}`, cls: n > 0 ? "some" : "" };
  };

  const renderActions = (mod: string, exclusive: boolean) => {
    const all = actionsForModule(mod);
    const isCfWaf = mod === "cloudflare-waf" && !exclusive;
    const childrenOf = (action: string): string[] => (isCfWaf ? (CF_PERM_TREE[action] ?? []) : []);
    const descendantsOf = (action: string): string[] =>
      childrenOf(action).flatMap((c) => [c, ...descendantsOf(c)]);
    const nestedActions = new Set(isCfWaf ? Object.values(CF_PERM_TREE).flat() : []);
    const topLevel = isCfWaf
      ? all.filter((a) => !nestedActions.has(a.action) && !CF_ANALYTICS.has(a.action))
      : all;
    const analyticsActions = isCfWaf ? all.filter((a) => CF_ANALYTICS.has(a.action)) : [];
    const byAction = new Map(all.map((a) => [a.action, a]));
    const auto = autoGrantsModule(mod) || moduleAdmins.has(mod);
    // Exclusivas: aba só renderiza pra super_admin — só o bypass do alvo (`auto`) importa
    const viewerCan = exclusive ? true : canEditModule(mod);

    const renderRow = (a: any): React.ReactNode => {
      const key = `${mod}:${a.action}`;
      const checked = auto || perms.has(key);
      const canEdit = viewerCan && !auto && !savePerms.isPending;
      const pending = draft.has(key);
      const children = childrenOf(a.action)
        .map((ca) => byAction.get(ca))
        .filter((x): x is NonNullable<typeof x> => !!x);
      return (
        <div key={a.id}>
          <label className={`um-perm${canEdit ? " can" : ""}${pending ? " pending" : ""}`}>
            <Checkbox
              checked={checked}
              disabled={!canEdit}
              onCheckedChange={(v) => {
                const granted = !!v;
                const updates: Array<[string, boolean]> = [[key, granted]];
                // Desmarcar um pai do Cloudflare WAF desmarca todos os descendentes
                if (isCfWaf && !granted)
                  for (const d of descendantsOf(a.action))
                    if (perms.has(`${mod}:${d}`)) updates.push([`${mod}:${d}`, false]);
                setPerms(updates);
              }}
              className="mt-0.5"
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <span className="um-perm-label">{a.label}</span>
              <span className="um-perm-code">{a.action}</span>
              {a.description && <div className="um-perm-desc">{a.description}</div>}
            </div>
          </label>
          {children.length > 0 && (auto || checked) && (
            <div className="um-perm-indent">{children.map((c) => renderRow(c))}</div>
          )}
        </div>
      );
    };

    return (
      <>
        <div className="um-admrow">
          <span>
            <b>Admin do módulo</b>
            <small>
              Todas as permissões deste módulo e direito de gerenciar as dos demais usuários nele.
              {!canManageUsers && " Só Super Admin liga."}
            </small>
          </span>
          <Switch
            checked={auto}
            disabled={autoGrantsModule(mod) || !canManageUsers || toggleModAdmin.isPending}
            onCheckedChange={(v) => toggleModAdmin.mutate({ module: mod, isAdmin: v })}
            aria-label="Admin do módulo"
          />
        </div>
        <div style={{ display: "grid", gap: 4 }}>
          <div className="um-acts-h">
            <span>Permissões</span>
            {!auto && viewerCan && all.length > 0 && (
              <span>
                <button disabled={savePerms.isPending} onClick={() => bulkSet(mod, true)}>
                  Marcar todas
                </button>
                {" · "}
                <button disabled={savePerms.isPending} onClick={() => bulkSet(mod, false)}>
                  Limpar
                </button>
              </span>
            )}
          </div>
          {permsQuery.isLoading ? (
            <div className="um-empty" style={{ textAlign: "left", padding: "12px 0" }}>
              <Loader2
                size={13}
                className="um-spin"
                style={{ verticalAlign: -2, marginRight: 6 }}
              />
              Carregando…
            </div>
          ) : (
            <>
              {topLevel.map((a) => renderRow(a))}
              {analyticsActions.length > 0 && (
                <>
                  <div className="um-sublabel" style={{ margin: "8px 0 2px" }}>
                    Analytics
                  </div>
                  <div className="um-perm-indent">{analyticsActions.map((a) => renderRow(a))}</div>
                </>
              )}
              {all.length === 0 && (
                <div className="um-empty" style={{ textAlign: "left", padding: "12px 0" }}>
                  Nenhuma ação cadastrada para este módulo.
                </div>
              )}
            </>
          )}
          {!viewerCan && (
            <div className="um-note" style={{ marginTop: 8 }}>
              Você não é admin deste módulo — visualização somente.
            </div>
          )}
        </div>
      </>
    );
  };

  const curDef = currentModule ? MODULES.find((m) => m.slug === currentModule) : null;
  const curExclDef = currentExclusive ? MODULES.find((m) => m.slug === currentExclusive) : null;
  const created = user.created_at ? new Date(user.created_at).toLocaleDateString("pt-BR") : null;

  return (
    <DetailSheet
      open={open}
      onOpenChange={requestClose}
      width={840}
      eyebrow={`${user.email}${created ? ` · desde ${created}` : ""}`}
      title={
        <span className="um-hero">
          <Av user={user} large />
          <span>
            <b>{user.full_name || user.email}</b>
            <small>{user.department_name ?? "Sem departamento"}</small>
          </span>
        </span>
      }
      badges={
        <>
          <Pill color={st.color}>{st.label}</Pill>
          <Pill color={role.color} dot={false}>
            {role.label}
          </Pill>
          {user.role === "personalizado" && user.permission_profile_name && (
            <Pill color="var(--v2-med)" dot={false}>
              perfil {user.permission_profile_name}
            </Pill>
          )}
          <Pill color="var(--v2-fg-3)" dot={false}>
            {AUTH_LABEL[user.auth_method] ?? "SSO"}
          </Pill>
        </>
      }
      footer={
        <>
          {canActOnUser && (
            <>
              <button
                className="um-btn danger"
                style={{ marginRight: "auto" }}
                onClick={() => onRequestAction("delete")}
              >
                <Trash2 size={14} />
                Excluir
              </button>
              <button
                className="um-btn"
                onClick={() =>
                  onRequestAction(user.status === "disabled" ? "activate" : "deactivate")
                }
              >
                <Power size={14} />
                {user.status === "disabled" ? "Reativar" : "Desativar"}
              </button>
            </>
          )}
          {dirtyCount > 0 ? (
            <>
              <span className="um-dirty">
                {dirtyCount} {dirtyCount === 1 ? "alteração pendente" : "alterações pendentes"}
              </span>
              <button
                className="um-btn gst"
                disabled={savePerms.isPending}
                onClick={() => setDraft(new Map())}
              >
                Descartar
              </button>
              <button
                className="um-btn pri"
                disabled={savePerms.isPending}
                onClick={() => savePerms.mutate()}
              >
                {savePerms.isPending ? (
                  <Loader2 size={14} className="um-spin" />
                ) : (
                  <Check size={14} />
                )}
                {savePerms.isPending ? "Salvando…" : "Salvar permissões"}
              </button>
            </>
          ) : (
            <button className="um-btn pri" onClick={() => onOpenChange(false)}>
              Concluir
            </button>
          )}
        </>
      }
    >
      <div className="um" style={{ gap: 16 }}>
        <div className="um-stabs" role="tablist">
          <button role="tab" aria-selected={tab === "access"} onClick={() => setTab("access")}>
            Acesso
          </button>
          <button role="tab" aria-selected={tab === "perms"} onClick={() => setTab("perms")}>
            Permissões {!fullAccess && <span className="c">{grantedCount}</span>}
            {dirtyCount > 0 && <span className="um-dot" title="Alterações não salvas" />}
          </button>
          {canManageUsers && exclusiveModuleSlugs.length > 0 && (
            <button
              role="tab"
              aria-selected={tab === "exclusive"}
              onClick={() => setTab("exclusive")}
            >
              Exclusivas {!isSuperAdmin && <span className="c">{exclusiveGrantedCount}</span>}
            </button>
          )}
        </div>

        {tab === "access" && (
          <div>
            <div className="um-cfg full">
              <span>
                <b>Papel</b>
                <small>
                  Super Admin e Admin têm acesso total (Admin não altera Super Admins, não liga
                  "Admin do módulo" nem mexe nos módulos exclusivos). Analista, Visualizador e
                  Personalizado dependem das permissões — Personalizado começa sem nenhuma, exceto
                  criar/excluir GMUD.
                </small>
              </span>
              <div className="um-roles" role="radiogroup" aria-label="Papel">
                {(
                  ["super_admin", "admin", "analista", "visualizador", "personalizado"] as const
                ).map((k) => {
                  // Só super_admin pode atribuir o papel Super Admin (ver setUserRole)
                  const blocked =
                    k === "super_admin" && !canManageUsers && user.role !== "super_admin";
                  return (
                    <button
                      key={k}
                      type="button"
                      role="radio"
                      aria-checked={user.role === k}
                      aria-pressed={user.role === k}
                      disabled={!canEditThisUsersBasics || changeRole.isPending || blocked}
                      onClick={() => user.role !== k && changeRole.mutate(k)}
                    >
                      <b>{ROLE[k].label}</b>
                      <small>{ROLE[k].desc}</small>
                    </button>
                  );
                })}
              </div>
            </div>

            {user.role === "personalizado" && (
              <div className="um-cfg">
                <span>
                  <b>Perfil de permissão</b>
                  <small>
                    Copia as permissões do perfil para este usuário agora — editar o perfil depois
                    não afeta quem já recebeu.
                  </small>
                </span>
                <span style={{ display: "grid", gap: 6 }}>
                  <Select
                    value={selectedProfileId}
                    disabled={!canEditBasics || profilesQuery.isLoading}
                    onValueChange={setSelectedProfileId}
                  >
                    <SelectTrigger className="font-ui">
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
                    className="um-btn"
                    disabled={
                      !canEditBasics || selectedProfileId === "__none__" || applyProfile.isPending
                    }
                    onClick={() => applyProfile.mutate(selectedProfileId)}
                  >
                    {applyProfile.isPending ? "Aplicando…" : "Aplicar perfil"}
                  </button>
                </span>
              </div>
            )}

            <div className="um-cfg">
              <span>
                <b>Departamento</b>
                <small>
                  Vulnerabilidades mostra só o que é do departamento para quem não é admin.
                </small>
              </span>
              <Select
                value={user.department_id ?? "__none"}
                disabled={!canEditThisUsersBasics || changeDepartment.isPending}
                onValueChange={(v) => changeDepartment.mutate(v === "__none" ? null : v)}
              >
                <SelectTrigger className="font-ui">
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

            <div className="um-cfg">
              <span>
                <b>Método de login</b>
                <small>
                  SSO apenas bloqueia a senha. E-mail e senha serve para testes e ambientes sem SSO.
                  "SSO ou senha" é recomendado para admins.
                </small>
              </span>
              <Select
                value={user.auth_method ?? "sso"}
                disabled={!canEditThisUsersBasics || changeAuthMethod.isPending}
                onValueChange={(v) => changeAuthMethod.mutate(v as "sso" | "email" | "ambos")}
              >
                <SelectTrigger className="font-ui">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="sso">SSO apenas</SelectItem>
                  <SelectItem value="email">E-mail e senha</SelectItem>
                  <SelectItem value="ambos">SSO ou senha</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Senha — visível apenas para usuários com método email ou ambos */}
            {user.auth_method !== "sso" && (
              <div className="um-cfg">
                <span>
                  <b>Senha</b>
                  <small>Define uma nova senha para {user.email} sem enviar e-mail.</small>
                </span>
                <button
                  className="um-btn"
                  disabled={!canEditThisUsersBasics}
                  onClick={() => setResetPwdOpen(true)}
                >
                  <KeyRound size={14} />
                  Redefinir senha
                </button>
              </div>
            )}

            {/* Criar/editar/excluir perfil: admin também pode, já que perfil nunca
                carrega módulo exclusivo (barrado no servidor). */}
            {canEditBasics && (
              <div className="um-cfg">
                <span>
                  <b>Perfis de permissão</b>
                  <small>Modelos reutilizáveis para o papel Personalizado.</small>
                </span>
                <button className="um-btn" onClick={() => setCreateProfileOpen(true)}>
                  <Pencil size={14} />
                  Gerenciar perfis
                </button>
              </div>
            )}
          </div>
        )}

        {tab === "perms" && (
          <>
            {fullAccess && (
              <div className="um-note">
                {role.label} já tem todas as permissões dos módulos abaixo
                {isTrueAdmin ? " (exceto Usuários)" : ""} — nada para ajustar aqui.
              </div>
            )}
            <div className="um-perm-box">
              <div className="um-mlist">
                <div className="s">
                  <input
                    className="um-input"
                    placeholder="Filtrar módulos"
                    aria-label="Filtrar módulos"
                    value={modSearch}
                    onChange={(e) => setModSearch(e.target.value)}
                  />
                </div>
                {groups.map(([g, mods]) => {
                  const visible = mods.filter(
                    (m) =>
                      !ms || `${m.short ?? ""} ${m.title} ${m.slug}`.toLowerCase().includes(ms),
                  );
                  if (!visible.length) return null;
                  return (
                    <React.Fragment key={g}>
                      <div className="g">{g}</div>
                      {visible.map((m) => {
                        const c = moduleCounter(m.slug);
                        return (
                          <button
                            key={m.slug}
                            aria-current={currentModule === m.slug}
                            onClick={() => setActiveModule(m.slug)}
                          >
                            <span>{m.short ?? m.title}</span>
                            <span className={`ct ${c.cls}`}>{c.text}</span>
                          </button>
                        );
                      })}
                    </React.Fragment>
                  );
                })}
              </div>
              <div className="um-mbody">
                {currentModule && (
                  <>
                    <h4>{curDef?.title ?? currentModule}</h4>
                    {renderActions(currentModule, false)}
                  </>
                )}
              </div>
            </div>
            <div className="um-note">
              As permissões controlam o que aparece e o que fica habilitado na interface. As regras
              do banco (RLS) continuam valendo como proteção adicional.
            </div>
          </>
        )}

        {tab === "exclusive" && canManageUsers && (
          <>
            {isSuperAdmin && (
              <div className="um-note">
                Super Admin já tem todas as permissões dos módulos exclusivos — nada para ajustar
                aqui.
              </div>
            )}
            <div className="um-perm-box um-excl">
              <div className="um-mlist">
                <div className="g">Exclusivos</div>
                {exclusiveModuleSlugs.map((slug) => {
                  const m = MODULES.find((x) => x.slug === slug);
                  const c = moduleCounter(slug);
                  return (
                    <button
                      key={slug}
                      aria-current={currentExclusive === slug}
                      onClick={() => setActiveExclusive(slug)}
                    >
                      <span>
                        <Lock size={11} style={{ verticalAlign: -1, marginRight: 6 }} />
                        {m?.short ?? m?.title ?? slug}
                      </span>
                      <span className={`ct ${c.cls}`}>{c.text}</span>
                    </button>
                  );
                })}
              </div>
              <div className="um-mbody">
                {currentExclusive && (
                  <>
                    <h4>{curExclDef?.title ?? currentExclusive}</h4>
                    {renderActions(currentExclusive, true)}
                  </>
                )}
              </div>
            </div>
            <div className="um-note">
              Módulos com dados restritos. Só Super Admin vê esta aba e concede acesso — inclusive
              para Admins, que não têm acesso automático aqui.
            </div>
          </>
        )}
      </div>

      {/* ── Sair sem salvar ─────────────────────────────────────────────── */}
      <AlertDialog open={confirmDiscard} onOpenChange={setConfirmDiscard}>
        <AlertDialogContent
          className="font-ui"
          style={{ background: T.surface, border: `1px solid ${T.borderHi}` }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar alterações?</AlertDialogTitle>
            <AlertDialogDescription>
              Há {dirtyCount} {dirtyCount === 1 ? "permissão alterada" : "permissões alteradas"} que
              ainda não {dirtyCount === 1 ? "foi salva" : "foram salvas"}.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setDraft(new Map());
                onOpenChange(false);
              }}
            >
              Descartar e fechar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* ── Redefinir senha ─────────────────────────────────────────────── */}
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
        <DialogContent
          className="font-ui"
          style={{
            background: T.surface,
            border: `1px solid ${T.borderHi}`,
            borderRadius: 12,
            color: T.textPrimary,
          }}
        >
          <DialogHeader>
            <DialogTitle>Redefinir senha</DialogTitle>
          </DialogHeader>
          <div className="um" style={{ gap: 14 }}>
            <div className="um-field-hint">
              Nova senha para <b>{user?.email}</b>. A pessoa poderá usá-la para entrar no sistema.
            </div>
            <label className="um-field">
              <span className="um-field-lbl">Nova senha</span>
              <input
                className="um-dinput"
                type="password"
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                placeholder="mínimo 8 caracteres"
                autoComplete="new-password"
              />
            </label>
            <label className="um-field">
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
                <span style={{ fontSize: 12, color: T.danger }}>As senhas não coincidem.</span>
              )}
            </label>
          </div>
          <DialogFooter style={{ gap: 8 }}>
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
                  await resetUserPasswordFn({ data: { userId, password: newPwd } });
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
              <KeyRound size={14} />
              {savingPwd ? "Salvando…" : "Redefinir"}
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
    </DetailSheet>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PERFIS DE PERMISSÃO
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
  const qc = useQueryClient();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [search, setSearch] = useState("");
  const [activeMod, setActiveMod] = useState<string | null>(null);

  // Quantos usuários têm cada perfil aplicado (vem da lista já carregada na página)
  const usersData = qc.getQueryData<{ users?: Array<{ permission_profile_id?: string | null }> }>([
    "users-mgmt",
    "list",
  ]);
  const usageByProfile = useMemo(() => {
    const m = new Map<string, number>();
    for (const u of usersData?.users ?? [])
      if (u.permission_profile_id)
        m.set(u.permission_profile_id, (m.get(u.permission_profile_id) ?? 0) + 1);
    return m;
  }, [usersData]);

  // Módulos com ações no catálogo, agrupados por área
  const groups = useMemo(() => {
    const map = new Map<string, Array<{ slug: string; label: string }>>();
    for (const slug of moduleSlugs) {
      if (!catalog.some((c) => c.module_slug === slug)) continue;
      const def = MODULES.find((x) => x.slug === slug);
      const g = def?.group ?? "Outros";
      map.set(g, [...(map.get(g) ?? []), { slug, label: def?.short ?? def?.title ?? slug }]);
    }
    return [...map.entries()];
  }, [moduleSlugs, catalog]);
  const firstMod = groups[0]?.[1][0]?.slug ?? null;
  const currentMod = activeMod ?? firstMod;
  const actionsOf = (slug: string) => catalog.filter((c) => c.module_slug === slug);
  const countOf = (slug: string) =>
    actionsOf(slug).filter((a) => selected.has(`${slug}:${a.action}`)).length;

  function toggle(key: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function setModule(slug: string, on: boolean) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const a of actionsOf(slug)) {
        const key = `${slug}:${a.action}`;
        if (on) next.add(key);
        else next.delete(key);
      }
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

  // Duplicar: vira um perfil novo com as mesmas permissões
  function duplicate() {
    setEditingId(null);
    setName(`${name.trim()} (cópia)`);
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
          data: {
            id: editingId,
            name: name.trim(),
            description: description.trim() || null,
            items,
          },
        });
        toast.success(`Perfil "${name.trim()}" atualizado.`);
      } else {
        await createProfileFn({
          data: { name: name.trim(), description: description.trim() || null, items },
        });
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

  // Mesmo formato do painel do usuário: descrição de cada ação e, no
  // Cloudflare WAF, a árvore pai → filhos (desmarcar o pai limpa os filhos)
  // e o grupo Analytics.
  function renderProfileActions(mod: string) {
    const all = actionsOf(mod);
    const isCfWaf = mod === "cloudflare-waf";
    const childrenOf = (action: string): string[] => (isCfWaf ? (CF_PERM_TREE[action] ?? []) : []);
    const descendantsOf = (action: string): string[] =>
      childrenOf(action).flatMap((c) => [c, ...descendantsOf(c)]);
    const nested = new Set(isCfWaf ? Object.values(CF_PERM_TREE).flat() : []);
    const topLevel = isCfWaf
      ? all.filter((a) => !nested.has(a.action) && !CF_ANALYTICS.has(a.action))
      : all;
    const analytics = isCfWaf ? all.filter((a) => CF_ANALYTICS.has(a.action)) : [];
    const byAction = new Map(all.map((a) => [a.action, a]));

    const onToggle = (action: string) => {
      const key = `${mod}:${action}`;
      setSelected((prev) => {
        const next = new Set(prev);
        if (next.has(key)) {
          next.delete(key);
          for (const d of descendantsOf(action)) next.delete(`${mod}:${d}`);
        } else next.add(key);
        return next;
      });
    };

    const row = (a: (typeof all)[number]): React.ReactNode => {
      const key = `${mod}:${a.action}`;
      const checked = selected.has(key);
      const children = childrenOf(a.action)
        .map((c) => byAction.get(c))
        .filter((x): x is NonNullable<typeof x> => !!x);
      return (
        <div key={a.id}>
          <label className="um-perm can">
            <Checkbox
              checked={checked}
              onCheckedChange={() => onToggle(a.action)}
              className="mt-0.5"
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <span className="um-perm-label">{a.label}</span>
              <span className="um-perm-code">{a.action}</span>
              {a.description && <div className="um-perm-desc">{a.description}</div>}
            </div>
          </label>
          {children.length > 0 && checked && (
            <div className="um-perm-indent">{children.map((c) => row(c))}</div>
          )}
        </div>
      );
    };

    return (
      <>
        {topLevel.map((a) => row(a))}
        {analytics.length > 0 && (
          <>
            <div className="um-sublabel" style={{ margin: "8px 8px 2px" }}>
              Analytics
            </div>
            <div className="um-perm-indent">{analytics.map((a) => row(a))}</div>
          </>
        )}
      </>
    );
  }

  const sq = search.trim().toLowerCase();
  const visibleProfiles = profiles.filter(
    (p) => !sq || `${p.name} ${p.description ?? ""}`.toLowerCase().includes(sq),
  );
  const usage = editingId ? (usageByProfile.get(editingId) ?? 0) : 0;
  const usedModules = groups.flatMap(([, ms]) => ms).filter((m) => countOf(m.slug) > 0);
  const curLabel =
    groups.flatMap(([, ms]) => ms).find((m) => m.slug === currentMod)?.label ?? currentMod;

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
          className="font-ui p-0 gap-0 sm:max-w-5xl"
          style={{
            background: T.surface,
            border: `1px solid ${T.borderHi}`,
            borderRadius: 12,
            color: T.textPrimary,
            width: "min(1040px, calc(100vw - 32px))",
            maxWidth: "none",
          }}
        >
          <div className="um um-dlg">
            <DialogHeader className="um-dlg-h">
              <DialogTitle>Perfis de permissão</DialogTitle>
              <p>
                Modelos para o papel Personalizado. Aplicar copia as permissões — editar o perfil
                depois não muda quem já recebeu.
              </p>
            </DialogHeader>

            <div className="um-pf">
              <div className="um-pf-list">
                <div className="um-pf-top">
                  <button type="button" className="um-btn" onClick={resetForm}>
                    <Plus size={14} />
                    Novo perfil
                  </button>
                  <input
                    className="um-input"
                    placeholder="Buscar perfil"
                    aria-label="Buscar perfil"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                  />
                </div>
                <div className="um-pf-items">
                  {profiles.length === 0 && (
                    <div className="um-empty">Nenhum perfil cadastrado ainda.</div>
                  )}
                  {visibleProfiles.map((p: any) => {
                    const used = usageByProfile.get(p.id) ?? 0;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        className="um-pf-item"
                        aria-current={editingId === p.id}
                        onClick={() => startEdit(p)}
                      >
                        <b>{p.name}</b>
                        {p.description && <small>{p.description}</small>}
                        <span className="meta">
                          <span>{(p.items ?? []).length} permissões</span>
                          <span>
                            {used
                              ? `${used} ${used === 1 ? "usuário" : "usuários"}`
                              : "não aplicado"}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              <form onSubmit={submit} className="um-pf-ed">
                <div className="body">
                  <div className="um-g2">
                    <label className="um-field">
                      <span className="um-field-lbl">Nome do perfil</span>
                      <input
                        className="um-dinput"
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        required
                        placeholder="Ex.: Aprovador de GMUD"
                      />
                    </label>
                    <label className="um-field">
                      <span className="um-field-lbl">
                        Descrição <span className="opt">(opcional)</span>
                      </span>
                      <input
                        className="um-dinput"
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        placeholder="Para que serve este perfil"
                      />
                    </label>
                  </div>

                  <div className="um-field">
                    <span className="um-field-lbl">
                      Permissões <span className="opt">· {selected.size} selecionadas</span>
                    </span>
                    <div className="um-pm">
                      <div className="um-pm-mods">
                        {groups.map(([g, ms]) => (
                          <React.Fragment key={g}>
                            <div className="g">{g}</div>
                            {ms.map((m) => {
                              const n = countOf(m.slug);
                              return (
                                <button
                                  key={m.slug}
                                  type="button"
                                  aria-current={currentMod === m.slug}
                                  onClick={() => setActiveMod(m.slug)}
                                >
                                  <span>{m.label}</span>
                                  <span className={`ct${n ? " some" : ""}`}>
                                    {n}/{actionsOf(m.slug).length}
                                  </span>
                                </button>
                              );
                            })}
                          </React.Fragment>
                        ))}
                      </div>
                      <div className="um-pm-acts">
                        {currentMod && (
                          <>
                            <div className="um-acts-h" style={{ padding: "2px 8px 6px" }}>
                              <span>{curLabel}</span>
                              <span>
                                <button type="button" onClick={() => setModule(currentMod, true)}>
                                  Marcar todas
                                </button>
                                {" · "}
                                <button type="button" onClick={() => setModule(currentMod, false)}>
                                  Limpar
                                </button>
                              </span>
                            </div>
                            {renderProfileActions(currentMod)}
                          </>
                        )}
                      </div>
                    </div>
                    {usedModules.length > 0 && (
                      <div className="um-chips">
                        {usedModules.map((m) => (
                          <span key={m.slug}>
                            <b>{m.label}</b> {countOf(m.slug)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {editingId && usage > 0 && (
                    <div className="um-note">
                      Já aplicado a {usage} {usage === 1 ? "usuário" : "usuários"}. Salvar aqui não
                      altera as permissões {usage === 1 ? "dele" : "deles"}.
                    </div>
                  )}
                </div>

                <div className="um-dlg-f">
                  {editingId && (
                    <>
                      <button
                        type="button"
                        className="um-btn danger"
                        style={{ marginRight: "auto" }}
                        onClick={() => setConfirmDeleteId(editingId)}
                      >
                        <Trash2 size={14} />
                        Excluir perfil
                      </button>
                      <button type="button" className="um-btn" onClick={duplicate}>
                        <Layers size={14} />
                        Duplicar
                      </button>
                    </>
                  )}
                  {!editingId && (
                    <button
                      type="button"
                      className="um-btn gst"
                      style={{ marginRight: "auto" }}
                      onClick={() => {
                        resetForm();
                        onClose();
                      }}
                    >
                      Fechar
                    </button>
                  )}
                  <button
                    type="submit"
                    className="um-btn pri"
                    disabled={busy || !name.trim() || selected.size === 0}
                  >
                    {busy ? (
                      <Loader2 size={14} className="um-spin" />
                    ) : editingId ? (
                      <Pencil size={14} />
                    ) : (
                      <Plus size={14} />
                    )}
                    {busy
                      ? editingId
                        ? "Salvando…"
                        : "Criando…"
                      : editingId
                        ? "Salvar alterações"
                        : "Criar perfil"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDeleteId} onOpenChange={(o) => !o && setConfirmDeleteId(null)}>
        <AlertDialogContent
          className="font-ui"
          style={{ background: T.surface, border: `1px solid ${T.borderHi}` }}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir perfil de permissão</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente. Usuários que já aplicaram este perfil não são afetados — só
              remove o perfil como opção para futuras aplicações.
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
