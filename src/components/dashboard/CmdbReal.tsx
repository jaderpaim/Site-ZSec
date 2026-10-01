import * as React from "react";
import * as XLSX from "xlsx";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Server,
  Cpu,
  MapPin,
  ShieldCheck,
  ShieldX,
  ShieldAlert,
  AlertTriangle,
  Layers,
  Mail,
  Loader2,
  Database,
  Download,
  RefreshCw,
  Check,
  ChevronDown,
  X,
} from "lucide-react";
import { usePermissions } from "@/lib/use-permissions";
import { supabase } from "@/integrations/supabase/client";
import { listCmdbAtivos, deleteCmdbAtivo, type CmdbAtivo } from "@/lib/cmdb.functions";
import { runCmdbDeviceAlertsNow } from "@/lib/cmdb-alerts.functions";
import { getZabbixCachedHosts, getZabbixLiveHosts } from "@/lib/zabbix.functions";
import { getCmdbDnsCache, refreshCmdbDnsCacheNow } from "@/lib/cmdb-dns.functions";
import { getCronHealth } from "./CronHealthBadge";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CRITICIDADE_ORDER, type Criticidade, type CmdbDisplayStatus } from "./cmdb/CmdbBadges";
import { CmdbFormDialog } from "./cmdb/CmdbFormDialog";
import { CmdbDetailsSheet } from "./cmdb/CmdbDetailsSheet";
import { osFilterGroup, type OsFilterGroup } from "@/lib/cmdb-os";

const EXPORT_FORMATS: Array<{ key: "csv" | "xlsx"; label: string }> = [
  { key: "csv", label: "CSV (.csv)" },
  { key: "xlsx", label: "Excel (.xlsx)" },
];

const CRITICIDADES: Criticidade[] = ["Crítico", "Alto", "Médio", "Baixo"];
const STATUSES: CmdbDisplayStatus[] = ["Ativo", "Alerta", "Inativo", "Em manutenção", "Desativado"];
// "Divergência" não é um status real do ativo (não convive com CmdbDisplayStatus) — é um
// filtro à parte pra achar ativos com hostname divergente do Zabbix/DNS.
type StatusFilterValue = CmdbDisplayStatus | "Divergência";
const STATUS_FILTER_OPTIONS: StatusFilterValue[] = [...STATUSES, "Divergência"];
const TIPOS_KPI = [
  { label: "Servidores", match: "servidor" },
  { label: "Firewalls", match: "firewall" },
  { label: "Switches", match: "switch" },
];

// ── Design Tokens (mesma paleta dos outros dashboards) ──────────────────────────
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
  neutral: "var(--tl-6b7280, #6B7280)",
  textPrimary: "var(--tl-f1f5f9, #F1F5F9)",
  textSecondary: "var(--tl-94a3b8, #94A3B8)",
  textMuted: "var(--tl-f1f5f9, #F1F5F9)",
  textSubtle: "var(--tl-475569, #475569)",
};

const CRIT_COLOR: Record<Criticidade, string> = {
  Crítico: T.danger,
  Alto: T.warning,
  Médio: T.accent,
  Baixo: T.success,
};

const STATUS_COLOR: Record<CmdbDisplayStatus, string> = {
  Ativo: T.success,
  "Em manutenção": T.warning,
  Desativado: T.neutral,
  Alerta: T.warning,
  Inativo: T.danger,
};

const STATUS_FILTER_COLOR: Record<StatusFilterValue, string> = {
  ...STATUS_COLOR,
  Divergência: T.warning,
};

// ── CSS ───────────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');

  .cm-root { font-family:'DM Sans',sans-serif; color:${T.textPrimary}; display:flex; flex-direction:column; gap:16px; }
  .cm-root * { box-sizing:border-box; }

  @keyframes cm-spin  { to{transform:rotate(360deg)} }
  @keyframes cm-fadeup{ from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  .cm-spin   { animation:cm-spin 0.75s linear infinite; }
  .cm-fadeup { animation:cm-fadeup 0.3s ease forwards; }

  .cm-root ::-webkit-scrollbar       { width:4px; height:4px; }
  .cm-root ::-webkit-scrollbar-track { background:transparent; }
  .cm-root ::-webkit-scrollbar-thumb { background:${T.borderHi}; border-radius:2px; }

  /* ── Page header ── */
  .cm-hdr {
    background:${T.surface}; border:1px solid ${T.border}; border-radius:12px;
    padding:16px 22px; display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap;
  }
  .cm-hdr-brand { display:flex; align-items:center; gap:12px; }
  .cm-hdr-icon  { width:40px; height:40px; border-radius:10px; display:flex; align-items:center; justify-content:center; background:${T.accentGlow}; border:1px solid rgba(59,130,246,0.3); flex-shrink:0; }
  .cm-hdr-title { font-size:15px; font-weight:700; color:${T.textPrimary}; font-family:'Space Grotesk',sans-serif; letter-spacing:-0.01em; }
  .cm-hdr-sub   { font-size:11px; color:${T.textMuted}; margin-top:2px; }
  .cm-chip { display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:5px; background:rgba(107,114,128,0.08); border:1px solid ${T.border}; font-size:11px; font-family:'IBM Plex Mono',monospace; color:${T.textMuted}; font-weight:700; }

  /* ── KPI strip ── */
  .cm-kpi-grid { display:grid; grid-template-columns:repeat(6,1fr); gap:12px; }
  .cm-kpi {
    background:${T.surface}; border:1px solid ${T.border}; border-radius:10px;
    padding:14px 16px; position:relative; overflow:hidden; transition:border-color 0.2s, box-shadow 0.2s;
    display:flex; flex-direction:column;
  }
  .cm-kpi:hover { border-color:${T.borderHi}; box-shadow:0 8px 24px rgba(0,0,0,0.2); }
  .cm-kpi::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; background:var(--kc,${T.accent}); }
  .cm-kpi-top   { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
  .cm-kpi-icon  { flex-shrink:0; width:34px; height:34px; border-radius:8px; display:flex; align-items:center; justify-content:center; background:var(--ki-bg,${T.accentGlow}); }
  .cm-kpi-label { font-size:10px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; line-height:1.4; padding-top:2px; }
  .cm-kpi-main  { display:flex; flex-direction:column; gap:4px; margin-top:10px; }
  .cm-kpi-value { font-size:28px; font-weight:700; font-family:'Space Grotesk',sans-serif; letter-spacing:-0.02em; line-height:1.1; color:var(--kc,${T.textPrimary}); }
  .cm-kpi-hint  { font-size:11px; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; }
  .cm-kpi-value.list { font-size:13px; font-family:'IBM Plex Mono',monospace; font-weight:600; display:flex; flex-direction:column; gap:5px; }
  .cm-kpi-value.list .row { display:flex; align-items:center; justify-content:space-between; gap:10px; }
  .cm-kpi-value.list .tipo { color:${T.textSecondary}; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .cm-kpi-value.list .count { color:${T.textPrimary}; font-weight:700; flex-shrink:0; }

  /* ── Panel ── */
  .cm-panel { background:${T.surface}; border:1px solid ${T.border}; border-radius:12px; overflow:hidden; }
  .cm-panel-hdr { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; padding:13px 20px; background:${T.surfaceAlt}; border-bottom:1px solid ${T.border}; }
  .cm-panel-title { display:flex; align-items:center; gap:8px; font-size:11px; font-weight:700; letter-spacing:0.09em; text-transform:uppercase; color:${T.textPrimary}; font-family:'IBM Plex Mono',monospace; }
  .cm-panel-title span { font-weight:400; color:${T.textSubtle}; text-transform:none; letter-spacing:normal; }
  .cm-panel-body { padding:16px 20px 20px; }
  .cm-panel-foot { padding:12px 20px; font-size:11px; color:${T.textMuted}; border-top:1px solid ${T.border}; }

  /* ── Toolbar ── */
  .cm-toolbar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .cm-search-wrap { position:relative; display:inline-flex; align-items:center; }
  .cm-search-icon { position:absolute; left:9px; pointer-events:none; color:${T.textMuted}; }
  .cm-search { background:${T.surfaceAlt}; border:1px solid ${T.border}; border-radius:6px; padding:6px 10px 6px 29px; font-size:12px; font-family:'IBM Plex Mono',monospace; color:${T.textPrimary}; outline:none; transition:border-color 0.15s; width:240px; }
  .cm-search:focus { border-color:rgba(59,130,246,0.5); box-shadow:0 0 0 2px rgba(59,130,246,0.1); }
  .cm-search::placeholder { color:${T.textSubtle}; }

  /* ── Buttons ── */
  .cm-btn { display:inline-flex; align-items:center; gap:6px; padding:7px 14px; border-radius:7px; font-size:12px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; transition:all 0.15s; white-space:nowrap; border:1px solid transparent; }
  .cm-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .cm-btn.primary { background:${T.accent}; color:#fff; }
  .cm-btn.primary:hover:not(:disabled) { background:#2563EB; }
  .cm-btn.outline { background:${T.accentSoft}; border:1px solid rgba(59,130,246,0.35); color:${T.accent}; }
  .cm-btn.outline:hover:not(:disabled) { background:rgba(59,130,246,0.2); }
  .cm-btn.ghost { background:transparent; border:1px solid transparent; color:${T.textSecondary}; }
  .cm-btn.ghost:hover:not(:disabled) { background:rgba(var(--tl-ink, 255,255,255),0.06); color:${T.textPrimary}; }

  /* ── Filters row ── */
  .cm-filters { margin-bottom:14px; }
  .cm-filters-row { display:flex; flex-wrap:wrap; align-items:stretch; gap:8px; }
  .cm-fbox { position:relative; display:flex; flex-direction:column; align-items:flex-start; gap:2px; min-width:150px; padding:6px 30px 6px 11px; border-radius:8px; border:1px solid ${T.border}; background:${T.surfaceAlt}; color:${T.textPrimary}; cursor:pointer; text-align:left; font-family:'DM Sans',sans-serif; transition:border-color .15s, background .15s; }
  .cm-fbox:hover { border-color:${T.borderHi}; }
  .cm-fbox:focus-visible { outline:2px solid ${T.accent}; outline-offset:2px; }
  .cm-fbox.set { border-color:rgba(59,130,246,0.55); background:${T.accentSoft}; }
  .cm-fbox-k { font-size:9px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:${T.textSecondary}; font-family:'IBM Plex Mono',monospace; }
  .cm-fbox-v { font-size:12.5px; font-weight:600; display:flex; align-items:center; gap:6px; white-space:nowrap; }
  .cm-fbox-v .muted { color:${T.textSecondary}; font-weight:500; }
  .cm-fbox-chev { position:absolute; right:10px; top:50%; transform:translateY(-50%); color:${T.textSecondary}; }
  .cm-fdot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
  .cm-fmenu { display:flex; flex-direction:column; font-family:'DM Sans',sans-serif; }
  .cm-fopt { display:flex; align-items:center; gap:8px; width:100%; padding:7px 9px; border:none; background:transparent; color:${T.textPrimary}; font-size:12.5px; border-radius:6px; cursor:pointer; text-align:left; }
  .cm-fopt:hover, .cm-fopt:focus-visible { background:rgba(var(--tl-ink, 255,255,255),0.06); outline:none; }
  .cm-fopt-chk { width:14px; height:14px; border-radius:4px; border:1px solid ${T.borderHi}; display:flex; align-items:center; justify-content:center; flex-shrink:0; }
  .cm-fopt.on .cm-fopt-chk { background:${T.accent}; border-color:${T.accent}; color:#fff; }
  .cm-fopt-hint { display:block; font-size:10.5px; color:${T.textSubtle}; font-family:'IBM Plex Mono',monospace; }
  .cm-fopt-n { margin-left:auto; padding-left:12px; font-family:'IBM Plex Mono',monospace; font-size:11px; color:${T.textSecondary}; font-variant-numeric:tabular-nums; }
  .cm-fmenu-sep { height:1px; background:${T.border}; margin:4px 2px; }
  .cm-fmenu-foot { display:flex; justify-content:flex-start; padding:2px 4px; }
  .cm-flink { background:none; border:none; color:${T.accent}; font-size:11.5px; font-family:'DM Sans',sans-serif; cursor:pointer; padding:3px 4px; border-radius:4px; }
  .cm-flink:hover:not(:disabled) { text-decoration:underline; }
  .cm-flink:disabled { color:${T.textSubtle}; cursor:default; }
  .cm-fclear { align-self:center; margin-left:4px; }
  .cm-fchips { display:flex; flex-wrap:wrap; gap:6px; margin-top:10px; align-items:center; }
  .cm-fchip { display:inline-flex; align-items:center; gap:6px; padding:3px 4px 3px 9px; border-radius:5px; font-family:'IBM Plex Mono',monospace; font-size:11px; color:${T.textPrimary}; border:1px solid ${T.border}; background:${T.surfaceAlt}; }
  .cm-fchip b { color:${T.textSecondary}; font-weight:600; }
  .cm-fchip button { border:none; background:transparent; color:${T.textSecondary}; cursor:pointer; line-height:0; padding:3px; border-radius:3px; }
  .cm-fchip button:hover { background:rgba(var(--tl-ink, 255,255,255),0.08); color:${T.textPrimary}; }

  /* ── Tabs ── */
  .cm-tabs-row { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:16px; }
  .cm-tabs-bar { display:flex; align-items:center; gap:4px; padding:4px; background:${T.surfaceAlt}; border:1px solid ${T.border}; border-radius:8px; width:fit-content; }
  .cm-tab { display:inline-flex; align-items:center; gap:6px; padding:7px 16px; border-radius:6px; border:none; background:transparent; font-size:12px; font-weight:600; font-family:'DM Sans',sans-serif; color:${T.textMuted}; cursor:pointer; transition:all 0.15s; white-space:nowrap; }
  .cm-tab:hover { color:${T.textSecondary}; }
  .cm-tab.active { background:${T.accent}; color:#fff; }

  /* ── Badges ── */
  .cm-badge { display:inline-flex; align-items:center; gap:3px; padding:2px 8px; border-radius:4px; font-size:10px; font-weight:700; letter-spacing:0.04em; font-family:'IBM Plex Mono',monospace; white-space:nowrap; border:1px solid var(--bc,${T.accent}); color:var(--bc,${T.accent}); background:color-mix(in srgb, var(--bc,${T.accent}) 14%, transparent); }
  .cm-tag { display:inline-flex; align-items:center; padding:2px 8px; border-radius:4px; font-size:11px; font-family:'IBM Plex Mono',monospace; color:${T.textSecondary}; background:${T.surfaceAlt}; border:1px solid ${T.border}; white-space:nowrap; }
  .cm-mon-flag { display:inline-flex; align-items:center; gap:4px; font-size:11px; font-weight:700; letter-spacing:0.03em; font-family:'IBM Plex Mono',monospace; }

  /* ── Table ── */
  .cm-table-wrap { overflow:auto; max-height:840px; }
  .cm-table { width:100%; border-collapse:collapse; }
  .cm-table thead { position:sticky; top:0; z-index:10; }
  .cm-table th { padding:8px 12px; font-size:9px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:${T.textPrimary}; font-family:'IBM Plex Mono',monospace; text-align:left; background:${T.surface}; border-bottom:1px solid ${T.border}; white-space:nowrap; }
  .cm-table td { padding:9px 12px; border-bottom:1px solid rgba(var(--tl-line-rgb, 30,38,64),0.4); font-size:12px; color:${T.textPrimary}; vertical-align:middle; }
  .cm-table tbody tr { cursor:pointer; transition:background 0.1s; }
  .cm-table tbody tr:hover td { background:rgba(59,130,246,0.05); }
  .cm-table tbody tr:last-child td { border-bottom:none; }
  .cm-table .mono { font-family:'IBM Plex Mono',monospace; font-size:11px; }
  .cm-table .dim  { color:${T.textMuted}; }
  .cm-row-actions { display:flex; justify-content:flex-end; gap:2px; }
  .cm-icon-btn { padding:5px; border:none; background:transparent; color:${T.textMuted}; cursor:pointer; border-radius:5px; line-height:0; transition:all 0.15s; }
  .cm-icon-btn:hover { color:${T.textPrimary}; background:rgba(var(--tl-ink, 255,255,255),0.07); }
  .cm-icon-btn.danger:hover { color:${T.danger}; background:${T.dangerBg}; }

  /* ── Cards por criticidade ── */
  .cm-crit-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:14px; }
  .cm-crit-col { border-radius:10px; border:1px solid ${T.border}; background:${T.surfaceAlt}; overflow:hidden; display:flex; flex-direction:column; }
  .cm-crit-hdr { padding:10px 14px; display:flex; align-items:center; justify-content:space-between; font-size:13.5px; font-weight:700; font-family:'Space Grotesk',sans-serif; border-bottom:1px solid ${T.border}; }
  .cm-crit-count { font-size:13px; font-weight:700; font-family:'IBM Plex Mono',monospace; background:rgba(var(--tl-ink, 255,255,255),0.1); border-radius:999px; padding:2px 11px; }
  .cm-crit-body { padding:8px; display:flex; flex-direction:column; gap:8px; max-height:65vh; overflow-y:auto; }
  .cm-crit-empty { font-size:11px; color:${T.textMuted}; text-align:center; padding:24px 0; }
  .cm-crit-item { width:100%; text-align:left; padding:11px 12px; border-radius:8px; border:1px solid ${T.border}; border-left:3px solid var(--cc,${T.accent}); background:${T.surface}; cursor:pointer; transition:all 0.15s; }
  .cm-crit-item:hover { background:rgba(59,130,246,0.06); border-color:${T.borderHi}; }
  .cm-crit-item-top { display:flex; align-items:flex-start; justify-content:space-between; gap:8px; }
  .cm-crit-item-name { font-size:14px; font-weight:600; color:${T.textPrimary}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .cm-crit-item-flags { display:flex; align-items:center; gap:8px; flex-shrink:0; }
  .cm-crit-item-meta { margin-top:7px; font-size:12px; color:${T.textMuted}; display:flex; flex-wrap:wrap; align-items:center; gap:5px 12px; font-family:'IBM Plex Mono',monospace; }
  .cm-crit-item-meta span { display:inline-flex; align-items:center; gap:5px; }

  .cm-empty { padding:40px; text-align:center; color:${T.textMuted}; font-size:13px; }
  .cm-loading { display:flex; align-items:center; justify-content:center; gap:8px; padding:40px 0; color:${T.textMuted}; font-size:13px; font-family:'IBM Plex Mono',monospace; }
`;

// Caixa de filtro com seleção múltipla — nenhum valor marcado equivale a "Todos".
function FilterBox<T extends string>({
  label,
  options,
  selected,
  onChange,
  countFor,
  colorFor,
  hintFor,
}: {
  label: string;
  options: T[];
  selected: T[];
  onChange: (next: T[]) => void;
  countFor: (option: T) => number;
  colorFor?: (option: T) => string;
  hintFor?: (option: T) => string | undefined;
}) {
  const toggle = (o: T) => onChange(selected.includes(o) ? selected.filter((s) => s !== o) : [...selected, o]);
  const first = selected[0];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={`cm-fbox${selected.length ? " set" : ""}`}>
          <span className="cm-fbox-k">{label}</span>
          <span className="cm-fbox-v">
            {first === undefined ? (
              <span className="muted">Todos</span>
            ) : (
              <>
                {colorFor && <span className="cm-fdot" style={{ background: colorFor(first) }} />}
                {first}
                {selected.length > 1 && <span className="muted">+{selected.length - 1}</span>}
              </>
            )}
          </span>
          <ChevronDown size={12} className="cm-fbox-chev" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto min-w-[220px] p-1.5">
        <div className="cm-fmenu" role="listbox" aria-multiselectable="true" aria-label={label}>
          {options.map((o) => {
            const on = selected.includes(o);
            const hint = hintFor?.(o);
            return (
              <button
                key={o}
                className={`cm-fopt${on ? " on" : ""}`}
                role="option"
                aria-selected={on}
                onClick={() => toggle(o)}
              >
                <span className="cm-fopt-chk">{on && <Check size={10} />}</span>
                {colorFor && <span className="cm-fdot" style={{ background: colorFor(o) }} />}
                <span>
                  {o}
                  {hint && <span className="cm-fopt-hint">{hint}</span>}
                </span>
                <span className="cm-fopt-n">{countFor(o)}</span>
              </button>
            );
          })}
          <div className="cm-fmenu-sep" />
          <div className="cm-fmenu-foot">
            <button className="cm-flink" disabled={selected.length === 0} onClick={() => onChange([])}>
              Limpar
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const OS_WINDOWS = ["Windows Server", "Windows"];
const OS_LINUX_PRESET = ["Ubuntu Server", "Debian", "Red Hat Enterprise Linux", "CentOS", "FreeBSD"];

function osCardLabel(so: string): string {
  if (OS_WINDOWS.includes(so)) return "Windows";
  if (OS_LINUX_PRESET.includes(so)) return "Linux";
  return so;
}

// Filtro de SO usa osFilterGroup (lib/cmdb-os). Diferente do osCardLabel de propósito:
// no filtro FreeBSD conta como Fortigate, no card segue "Linux".
const OS_FILTER_OPTIONS: OsFilterGroup[] = ["Windows", "Linux", "Fortigate", "Outros"];
const OS_FILTER_HINT: Record<OsFilterGroup, string> = {
  Windows: "Windows Server, Windows",
  Linux: "Ubuntu, Debian, RHEL, CentOS",
  Fortigate: "Fortigate, FreeBSD",
  Outros: "demais ou sem SO",
};
const OS_FILTER_COLOR: Record<OsFilterGroup, string> = {
  Windows: "#38BDF8",
  Linux: "#FACC15",
  Fortigate: "#F97316",
  Outros: T.textSecondary,
};

type DnsCacheEntry = {
  hostname: string | null;
  resolved: boolean;
  reason: "no_ptr" | "timeout" | null;
};

type ZabbixHostnameDivergence = {
  ip: string;
  zabbixHosts: string[];
  dns: { hostname: string; matchesCmdb: boolean; matchesZabbix: boolean } | null;
  // Só relevante quando dns === null — por que o DNS não pôde desempatar.
  dnsStatus: "no_ptr" | "timeout" | "unknown";
};

type RefreshDnsCacheResult = { ok: boolean; resolved: number; total: number; error?: string };

function CritBadge({ value }: { value: Criticidade }) {
  return (
    <span className="cm-badge" style={{ "--bc": CRIT_COLOR[value] } as React.CSSProperties}>
      {value}
    </span>
  );
}

function StatusPill({ value }: { value: CmdbDisplayStatus }) {
  return (
    <span className="cm-badge" style={{ "--bc": STATUS_COLOR[value] } as React.CSSProperties}>
      {value}
    </span>
  );
}

function SiemFlag({
  ok,
  variant = "icon",
  stale = false,
}: {
  ok: boolean;
  variant?: "icon" | "label";
  stale?: boolean;
}) {
  const title = ok
    ? "Monitorado pelo SIEM (QRadar)"
    : stale
      ? "Sem confirmação do SIEM no momento — sincronização do QRadar desatualizada (não significa que o host caiu, só que não temos como confirmar via SIEM agora)"
      : "Não monitorado pelo SIEM";
  return (
    <span className="cm-mon-flag" style={{ color: ok ? T.success : stale ? T.warning : T.danger }} title={title}>
      {ok ? <ShieldCheck size={13} /> : stale ? <ShieldAlert size={13} /> : <ShieldX size={13} />}
      {variant === "label" && "SIEM"}
    </span>
  );
}

function ZabbixFlag({ state, variant = "icon" }: { state: "ok" | "unknown" | "off"; variant?: "icon" | "label" }) {
  const color = state === "ok" ? T.success : state === "unknown" ? T.warning : T.danger;
  const title =
    state === "ok"
      ? "Monitorado pelo Zabbix (disponível)"
      : state === "unknown"
        ? "Cadastrado no Zabbix mas disponibilidade não confirmada (Unknown/Unavailable)"
        : "Não encontrado no Zabbix";
  return (
    <span className="cm-mon-flag" style={{ color }} title={title}>
      {state === "off" ? <ShieldX size={13} /> : <ShieldCheck size={13} />}
      {variant === "label" && "ZBX"}
    </span>
  );
}

export function CmdbDashboard() {
  const qc = useQueryClient();
  const { isAdmin, isModuleAdmin, can } = usePermissions();

  const canView = isAdmin || isModuleAdmin("cmdb") || can("cmdb", "view");
  const canCreate = isAdmin || isModuleAdmin("cmdb") || can("cmdb", "create");
  const canEdit = isAdmin || isModuleAdmin("cmdb") || can("cmdb", "edit");
  const canDelete = isAdmin || isModuleAdmin("cmdb") || can("cmdb", "delete");

  const fetchList = useServerFn(listCmdbAtivos);
  const deleteFn = useServerFn(deleteCmdbAtivo);

  // ── Log sources do QRadar para marcar ativos monitorados pelo SIEM ──────────
  const { data: logSources } = useQuery({
    queryKey: ["qradar-log-sources-siem-status"],
    queryFn: async () => {
      const { data: rows } = await supabase
        .from("qradar_log_sources")
        .select("name, status")
        .or("name.ilike.%FGT%,name.ilike.%WinCollect%");
      return (rows ?? []) as Array<{ name: string; status: string }>;
    },
    enabled: canView,
    staleTime: 5 * 60 * 1000,
  });

  // Saúde do cron qradar-sync — se ele estiver falhando, qradar_log_sources
  // fica congelada no último status bom e a cobertura SIEM acima pode não
  // refletir a realidade (mesmo raciocínio usado em SocReal.tsx).
  const { data: qradarCronHealth } = useQuery({
    queryKey: ["cron-job-run", "qradar-sync"],
    queryFn: async () => {
      const { data } = await supabase.from("cron_job_runs").select("*").eq("job_name", "qradar-sync").maybeSingle();
      return data;
    },
    enabled: canView,
    refetchInterval: 60_000,
  });
  const siemCoverageStale = qradarCronHealth ? getCronHealth(qradarCronHealth).tone !== "success" : false;

  // WinCollect: "WinCollect DSM - BNLSRVADVSE" → hostname "bnlsrvadvse"
  // FGT:        "FGT Cidade Jardim @ 10.18.100.25" → IP "10.18.100.25"
  //
  // Enquanto o cron qradar-sync estiver desatualizado, os conjuntos ficam
  // vazios de propósito — "success" congelado não é confirmação de cobertura,
  // e todo ativo aqui também é monitorado pelo Zabbix, então não vira falso
  // "Inativo": só deixa de contar o double-check do SIEM até o sync normalizar.
  const { siemHostSet, siemIpSet } = React.useMemo(() => {
    const hosts = new Set<string>();
    const ips = new Set<string>();
    if (siemCoverageStale) return { siemHostSet: hosts, siemIpSet: ips };
    (logSources ?? [])
      .filter((s) => !s.status || s.status === "success")
      .forEach(({ name }) => {
        if (name.toLowerCase().includes("wincollect")) {
          // Extrai hostname após " - "
          const parts = name.split(" - ");
          const host = (parts[parts.length - 1] ?? "").trim().toLowerCase();
          if (host) hosts.add(host);
        } else if (name.toLowerCase().includes("fgt")) {
          // Extrai IP após " @ "
          const atIdx = name.lastIndexOf(" @ ");
          if (atIdx >= 0) {
            const ip = name
              .slice(atIdx + 3)
              .trim()
              .toLowerCase();
            if (ip) ips.add(ip);
          } else {
            // Fallback: usa o nome inteiro normalizado
            hosts.add(name.trim().toLowerCase());
          }
        }
      });
    return { siemHostSet: hosts, siemIpSet: ips };
  }, [logSources, siemCoverageStale]);

  const isInSiem = React.useCallback(
    (ativo: CmdbAtivo): boolean => {
      const isFw = (ativo.tipo ?? "").toLowerCase().includes("firewall");
      const candidates = [ativo.nome, ativo.ip_hostname].filter(Boolean) as string[];
      return candidates.some((v) => {
        const val = v.trim().toLowerCase();
        // Firewall: compara pelo IP; demais: compara pelo hostname
        if (isFw) return siemIpSet.has(val) || siemHostSet.has(val);
        return siemHostSet.has(val);
      });
    },
    [siemHostSet, siemIpSet],
  );
  // ────────────────────────────────────────────────────────────────────────────

  // Zabbix monitored hosts
  // Admin/editor chama API ao vivo e atualiza cache; viewer lê do cache
  const fetchZabbixLive = useServerFn(getZabbixLiveHosts);
  const fetchZabbixCached = useServerFn(getZabbixCachedHosts);
  const { data: zabbixData } = useQuery({
    queryKey: ["zabbix-monitored-hosts", canEdit],
    queryFn: () => (canEdit ? fetchZabbixLive() : fetchZabbixCached()),
    enabled: canView,
    staleTime: 5 * 60 * 1000,
  });

  const { zbxHostSet, zbxIpSet, zbxUnkHostSet, zbxUnkIpSet, zbxIpToHost } = React.useMemo(() => {
    const h = new Set<string>((zabbixData?.hosts ?? []).map((x) => x.toLowerCase()));
    const i = new Set<string>((zabbixData?.ips ?? []).map((x) => x.toLowerCase()));
    const uh = new Set<string>((zabbixData?.unknownHosts ?? []).map((x) => x.toLowerCase()));
    const ui = new Set<string>((zabbixData?.unknownIps ?? []).map((x) => x.toLowerCase()));
    return {
      zbxHostSet: h,
      zbxIpSet: i,
      zbxUnkHostSet: uh,
      zbxUnkIpSet: ui,
      zbxIpToHost: zabbixData?.ipToHost ?? {},
    };
  }, [zabbixData]);

  const isInZabbix = React.useCallback(
    (ativo: CmdbAtivo): boolean => {
      const candidates = [ativo.nome, ativo.ip_hostname].filter(Boolean) as string[];
      return candidates.some((v) => {
        const val = v.trim().toLowerCase();
        return zbxHostSet.has(val) || zbxIpSet.has(val);
      });
    },
    [zbxHostSet, zbxIpSet],
  );

  // Host cadastrado no Zabbix mas com disponibilidade não confirmada (Unknown ou Unavailable)
  const isZabbixUnknown = React.useCallback(
    (ativo: CmdbAtivo): boolean => {
      if (isInZabbix(ativo)) return false; // já confirmado disponível
      const candidates = [ativo.nome, ativo.ip_hostname].filter(Boolean) as string[];
      return candidates.some((v) => {
        const val = v.trim().toLowerCase();
        return zbxUnkHostSet.has(val) || zbxUnkIpSet.has(val);
      });
    },
    [isInZabbix, zbxUnkHostSet, zbxUnkIpSet],
  );

  const zabbixState = React.useCallback(
    (ativo: CmdbAtivo): "ok" | "unknown" | "off" =>
      isInZabbix(ativo) ? "ok" : isZabbixUnknown(ativo) ? "unknown" : "off",
    [isInZabbix, isZabbixUnknown],
  );

  // Cache de resolução DNS reversa (PTR) dos IPs do CMDB, via o scanner DAST
  // (refresh diário por cron — ver cmdb-dns.server.ts). Usado só pra dizer
  // QUEM está desatualizado quando já existe divergência CMDB x Zabbix.
  const fetchDnsCache = useServerFn(getCmdbDnsCache);
  const { data: dnsCacheData } = useQuery({
    queryKey: ["cmdb-dns-cache"],
    queryFn: () => fetchDnsCache(),
    enabled: canView,
    staleTime: 5 * 60 * 1000,
  });

  // Refresh manual do cache DNS — só admin global, já que dispara N chamadas
  // reais ao scanner DAST (uma por IP cadastrado no CMDB).
  const refreshDnsCacheFn = useServerFn(refreshCmdbDnsCacheNow);
  const refreshDnsCache = useMutation({
    mutationFn: () => refreshDnsCacheFn() as Promise<RefreshDnsCacheResult>,
    onSuccess: (r) => {
      qc.invalidateQueries({ queryKey: ["cmdb-dns-cache"] });
      if (r.ok) {
        toast.success(`Cache DNS atualizado · ${r.resolved} de ${r.total} IP(s) resolvido(s).`);
      } else {
        toast.error(r.error ?? "Falha ao atualizar o cache DNS.");
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const dnsByIp = React.useMemo(() => {
    const map = new Map<string, DnsCacheEntry>();
    for (const e of dnsCacheData ?? []) {
      map.set(e.ip.trim().toLowerCase(), {
        hostname: e.hostname,
        resolved: e.resolved,
        reason: e.reason,
      });
    }
    return map;
  }, [dnsCacheData]);

  // Ativo bateu no Zabbix pelo IP, mas o hostname técnico que o Zabbix reporta para
  // esse mesmo IP é diferente do nome cadastrado no CMDB — sinal de possível drift
  // (host renomeado na infra, ou IP reaproveitado por outro servidor). Quando o
  // DNS (nslookup/PTR real, via scanner DAST) já resolveu esse IP, usa ele como
  // desempate pra dizer QUEM está desatualizado — CMDB ou Zabbix.
  const zabbixHostnameDivergence = React.useCallback(
    (ativo: CmdbAtivo): ZabbixHostnameDivergence | null => {
      // Compara só o rótulo do hostname (antes do primeiro "."), ignorando
      // sufixo de domínio — o DNS devolve FQDN (ex.: "host.bernoulli.local"),
      // mas CMDB/Zabbix guardam só o hostname curto. Sem isso, tudo que bate
      // via DNS aparece como "inconsistência tripla" por causa do domínio.
      const hostLabel = (s: string) => s.trim().toLowerCase().split(".")[0];
      const candidates = [ativo.nome, ativo.ip_hostname].filter(Boolean) as string[];
      const nomeNorm = hostLabel(ativo.nome);
      for (const v of candidates) {
        const val = v.trim().toLowerCase();
        if (!zbxIpSet.has(val)) continue;
        const zabbixHosts = zbxIpToHost[val] ?? [];
        if (zabbixHosts.length === 0) continue;
        const matches = zabbixHosts.some((h) => hostLabel(h) === nomeNorm);
        if (matches) continue;

        const dnsEntry = dnsByIp.get(val);
        let dns: { hostname: string; matchesCmdb: boolean; matchesZabbix: boolean } | null = null;
        if (dnsEntry?.resolved && dnsEntry.hostname) {
          const dnsNorm = hostLabel(dnsEntry.hostname);
          dns = {
            // Só o rótulo, sem domínio — mesmo padrão de exibição do CMDB/Zabbix
            // (o domínio não afeta o match, já confirmado; só sobrava na mensagem).
            hostname: dnsEntry.hostname.split(".")[0],
            matchesCmdb: dnsNorm === nomeNorm,
            matchesZabbix: zabbixHosts.some((h) => hostLabel(h) === dnsNorm),
          };
        }
        // Sem dns resolvido: distingue "sem PTR" (nslookup rodou e não achou
        // nada) de "sem resposta"/"ainda não verificado" — ajuda a saber se
        // vale a pena aguardar o próximo refresh ou se aquele IP nunca vai ter DNS.
        const dnsStatus = !dnsEntry ? "unknown" : (dnsEntry.reason ?? "unknown");
        return { ip: val, zabbixHosts, dns, dnsStatus };
      }
      return null;
    },
    [zbxIpSet, zbxIpToHost, dnsByIp],
  );

  const displayStatus = React.useCallback(
    (ativo: CmdbAtivo): CmdbDisplayStatus => {
      const s = isInSiem(ativo);
      // Unknown conta como "no Zabbix" para o status geral — o ícone amarelo já indica a incerteza
      const z = isInZabbix(ativo) || isZabbixUnknown(ativo);
      if (s && z) return "Ativo";
      if (s || z) return "Alerta";
      return "Inativo";
    },
    [isInSiem, isInZabbix, isZabbixUnknown],
  );

  const { data, isLoading } = useQuery({
    queryKey: ["cmdb", "ativos"],
    queryFn: () => fetchList() as Promise<CmdbAtivo[]>,
    enabled: canView,
  });

  const [tab, setTab] = React.useState<"tabela" | "cards">("cards");
  const [search, setSearch] = React.useState("");
  // Filtros com seleção múltipla — array vazio = "Todos".
  const [tipoFilter, setTipoFilter] = React.useState<string[]>([]);
  const [osFilter, setOsFilter] = React.useState<OsFilterGroup[]>([]);
  const [critFilter, setCritFilter] = React.useState<Criticidade[]>([]);
  const [statusFilter, setStatusFilter] = React.useState<StatusFilterValue[]>([]);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<CmdbAtivo | null>(null);
  const [detail, setDetail] = React.useState<CmdbAtivo | null>(null);

  const all = data ?? [];

  const matchesStatus = React.useCallback(
    (r: CmdbAtivo, v: StatusFilterValue): boolean => {
      // Pseudo-status: ativos com hostname divergente do Zabbix/DNS (não é um status real)
      if (v === "Divergência") return zabbixHostnameDivergence(r) !== null;
      // Ativo/Alerta/Inativo são o status calculado (monitoramento SIEM/Zabbix), o mesmo exibido na coluna Status
      if (v === "Ativo" || v === "Alerta" || v === "Inativo") return displayStatus(r) === v;
      // Em manutenção/Desativado são o campo administrativo cadastrado no CMDB
      return r.status === v;
    },
    [displayStatus, zabbixHostnameDivergence],
  );

  // Cada grupo testado isoladamente — `skip` permite contar as opções de um grupo
  // levando em conta só os OUTROS filtros (contagem facetada no menu da caixa).
  type FilterKey = "tipo" | "os" | "crit" | "status";
  const passesFilters = React.useCallback(
    (r: CmdbAtivo, skip?: FilterKey): boolean => {
      const s = search.trim().toLowerCase();
      if (skip !== "tipo" && tipoFilter.length && !tipoFilter.includes((r.tipo ?? "").trim() || "Não informado"))
        return false;
      if (skip !== "os" && osFilter.length && !osFilter.includes(osFilterGroup(r.sistema_operacional))) return false;
      if (skip !== "crit" && critFilter.length && !critFilter.includes(r.criticidade as Criticidade)) return false;
      if (skip !== "status" && statusFilter.length && !statusFilter.some((v) => matchesStatus(r, v))) return false;
      if (
        s &&
        !(
          r.nome.toLowerCase().includes(s) ||
          (r.ip_hostname ?? "").toLowerCase().includes(s) ||
          (r.tipo ?? "").toLowerCase().includes(s)
        )
      )
        return false;
      return true;
    },
    [search, tipoFilter, osFilter, critFilter, statusFilter, matchesStatus],
  );

  const filtered = React.useMemo(() => {
    return all
      .filter((r) => passesFilters(r))
      .sort((a, b) => {
        const da = CRITICIDADE_ORDER[a.criticidade as Criticidade] ?? 99;
        const db = CRITICIDADE_ORDER[b.criticidade as Criticidade] ?? 99;
        if (da !== db) return da - db;
        return a.nome.localeCompare(b.nome);
      });
  }, [all, passesFilters]);

  const activeFilterChips = [
    ...tipoFilter.map((v) => ({ group: "Tipo", value: v, remove: () => setTipoFilter((p) => p.filter((x) => x !== v)) })),
    ...osFilter.map((v) => ({ group: "SO", value: v, remove: () => setOsFilter((p) => p.filter((x) => x !== v)) })),
    ...critFilter.map((v) => ({
      group: "Criticidade",
      value: v,
      remove: () => setCritFilter((p) => p.filter((x) => x !== v)),
    })),
    ...statusFilter.map((v) => ({
      group: "Status",
      value: v,
      remove: () => setStatusFilter((p) => p.filter((x) => x !== v)),
    })),
  ];
  const clearAllFilters = () => {
    setTipoFilter([]);
    setOsFilter([]);
    setCritFilter([]);
    setStatusFilter([]);
  };

  const handleExport = (format: "csv" | "xlsx") => {
    if (filtered.length === 0) {
      toast.error("Nenhum ativo para exportar.");
      return;
    }
    const rows = filtered.map((r) => ({
      Nome: r.nome,
      Tipo: r.tipo,
      "IP / Hostname": r.ip_hostname ?? "",
      "Fabricante / Modelo": r.fabricante_modelo ?? "",
      "Sistema Operacional": r.sistema_operacional ?? "",
      Departamento: r.departamento_nome ?? "",
      Localização: r.localizacao ?? "",
      Status: displayStatus(r),
      Criticidade: r.criticidade,
      SIEM: isInSiem(r) ? "Sim" : "Não",
      Zabbix: zabbixState(r) === "ok" ? "Sim" : zabbixState(r) === "unknown" ? "Incerto" : "Não",
    }));
    const fname = `cmdb_ativos_${new Date().toISOString().slice(0, 10)}`;

    if (format === "csv") {
      const headers = Object.keys(rows[0]);
      const esc = (val: unknown) => {
        const s = String(val ?? "");
        return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const csv = [
        headers.join(";"),
        ...rows.map((r) => headers.map((h) => esc((r as Record<string, unknown>)[h])).join(";")),
      ].join("\r\n");
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fname}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Ativos");
      XLSX.writeFile(wb, `${fname}.xlsx`);
    }
    toast.success("Exportação concluída");
  };

  const counts = React.useMemo(() => {
    const total = all.length;
    const by = (c: Criticidade) => all.filter((r) => r.criticidade === c).length;
    const siem = all.filter(isInSiem).length;
    const zabbix = all.filter(isInZabbix).length;
    return {
      total,
      critico: by("Crítico"),
      alto: by("Alto"),
      medio: by("Médio"),
      baixo: by("Baixo"),
      siem,
      zabbix,
    };
  }, [all, isInSiem, isInZabbix]);

  const porTipo = React.useMemo(() => {
    const map = new Map<string, number>();
    for (const r of all) {
      const t = (r.tipo ?? "").trim() || "Não informado";
      map.set(t, (map.get(t) ?? 0) + 1);
    }
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
  }, [all]);

  const tipoOptions = React.useMemo(() => porTipo.map(([tipoNome]) => tipoNome), [porTipo]);

  const hostsPorTipoKpi = React.useMemo(
    () =>
      TIPOS_KPI.map(({ label, match }) => ({
        tipo: label,
        count: all.filter((r) => (r.tipo ?? "").trim().toLowerCase() === match).length,
      })),
    [all],
  );

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Ativo removido");
      qc.invalidateQueries({ queryKey: ["cmdb", "ativos"] });
      setDetail(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const runAlertsFn = useServerFn(runCmdbDeviceAlertsNow);
  const sendAlerts = useMutation({
    mutationFn: () =>
      runAlertsFn() as Promise<{
        alertCount: number;
        stoppedCount: number;
        notifiedRecipients: number;
      }>,
    onSuccess: (r) => {
      if (r.alertCount === 0 && r.stoppedCount === 0) {
        toast.success("Nenhum ativo em Alerta ou Inativo. Nenhum e-mail enviado.");
      } else {
        toast.success(
          `Alerta enviado · ${r.alertCount} em Alerta, ${r.stoppedCount} Inativo(s) — ${r.notifiedRecipients} destinatário(s).`,
        );
      }
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const canSendAlerts = isAdmin || isModuleAdmin("cmdb");
  // Tabela só é visível para admin global ou admin do módulo CMDB
  const canViewTabela = isAdmin || isModuleAdmin("cmdb");

  function handleDelete(a: CmdbAtivo) {
    if (confirm(`Excluir o ativo "${a.nome}"?`)) del.mutate(a.id);
  }
  function openNew() {
    setEditing(null);
    setDialogOpen(true);
  }
  function openEdit(a: CmdbAtivo) {
    setEditing(a);
    setDetail(null);
    setDialogOpen(true);
  }

  if (!canView) {
    return (
      <div className="cm-root">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <p className="cm-empty">Você não tem permissão para acessar este módulo.</p>
      </div>
    );
  }

  return (
    <div className="cm-root cm-fadeup">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="cm-hdr">
        <div className="cm-hdr-brand">
          <div className="cm-hdr-icon">
            <Database size={18} color={T.accent} />
          </div>
          <div>
            <div className="cm-hdr-title">CMDB — Configuration Management Database</div>
            <div className="cm-hdr-sub">Inventário de ativos de infraestrutura</div>
          </div>
        </div>
        <span className="cm-chip">
          <Server size={11} /> {counts.total} ativos
        </span>
      </div>

      {/* ── KPIs ─────────────────────────────────────────────────────── */}
      <div className="cm-kpi-grid">
        <div className="cm-kpi" style={{ "--kc": T.accent, "--ki-bg": "rgba(59,130,246,0.18)" } as React.CSSProperties}>
          <div className="cm-kpi-top">
            <div className="cm-kpi-label">Total de Ativos</div>
            <div className="cm-kpi-icon">
              <Server size={18} color={T.accent} />
            </div>
          </div>
          <div className="cm-kpi-main">
            <div className="cm-kpi-value">{counts.total}</div>
          </div>
        </div>

        <div className="cm-kpi" style={{ "--kc": T.danger, "--ki-bg": T.dangerBg } as React.CSSProperties}>
          <div className="cm-kpi-top">
            <div className="cm-kpi-label">Crítico</div>
            <div className="cm-kpi-icon">
              <ShieldAlert size={18} color={T.danger} />
            </div>
          </div>
          <div className="cm-kpi-main">
            <div className="cm-kpi-value">{counts.critico}</div>
          </div>
        </div>

        <div className="cm-kpi" style={{ "--kc": T.warning, "--ki-bg": T.warningBg } as React.CSSProperties}>
          <div className="cm-kpi-top">
            <div className="cm-kpi-label">Alto</div>
            <div className="cm-kpi-icon">
              <AlertTriangle size={18} color={T.warning} />
            </div>
          </div>
          <div className="cm-kpi-main">
            <div className="cm-kpi-value">{counts.alto}</div>
          </div>
        </div>

        <div className="cm-kpi" style={{ "--kc": T.accent, "--ki-bg": "rgba(59,130,246,0.18)" } as React.CSSProperties}>
          <div className="cm-kpi-top">
            <div className="cm-kpi-label">Hosts por Tipo</div>
            <div className="cm-kpi-icon">
              <Layers size={18} color={T.accent} />
            </div>
          </div>
          <div className="cm-kpi-main">
            <div className="cm-kpi-value list">
              {hostsPorTipoKpi.map(({ tipo, count }) => (
                <div className="row" key={tipo}>
                  <span className="tipo" title={tipo}>
                    {tipo}
                  </span>
                  <span className="count">{count}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div
          className="cm-kpi"
          style={
            {
              "--kc": siemCoverageStale ? T.warning : T.success,
              "--ki-bg": siemCoverageStale ? T.warningBg : T.successBg,
            } as React.CSSProperties
          }
        >
          <div className="cm-kpi-top">
            <div className="cm-kpi-label">Monitorados SIEM</div>
            <div className="cm-kpi-icon">
              <ShieldCheck size={18} color={siemCoverageStale ? T.warning : T.success} />
            </div>
          </div>
          <div className="cm-kpi-main">
            <div className="cm-kpi-value">{counts.siem}</div>
            <div className="cm-kpi-hint">
              {counts.siem} de {counts.total} ativos
            </div>
          </div>
        </div>

        <div className="cm-kpi" style={{ "--kc": T.success, "--ki-bg": T.successBg } as React.CSSProperties}>
          <div className="cm-kpi-top">
            <div className="cm-kpi-label">Monitorados Zabbix</div>
            <div className="cm-kpi-icon">
              <ShieldCheck size={18} color={T.success} />
            </div>
          </div>
          <div className="cm-kpi-main">
            <div className="cm-kpi-value">{counts.zabbix}</div>
            <div className="cm-kpi-hint">
              {counts.zabbix} de {counts.total} ativos
            </div>
          </div>
        </div>
      </div>

      {/* ── Painel principal ─────────────────────────────────────────── */}
      <div className="cm-panel">
        <div className="cm-panel-hdr">
          <div className="cm-panel-title">
            <Server size={11} color={T.accent} />
            Ativos <span>({filtered.length})</span>
          </div>
          <div className="cm-toolbar">
            <div className="cm-search-wrap">
              <Search size={12} className="cm-search-icon" />
              <input
                className="cm-search"
                placeholder="Buscar por nome, IP ou tipo"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {canSendAlerts && (
              <button
                className="cm-btn outline"
                onClick={() => sendAlerts.mutate()}
                disabled={sendAlerts.isPending}
                title="Envia agora um e-mail consolidado com ativos em Alerta e Inativos para administradores"
              >
                {sendAlerts.isPending ? <Loader2 size={14} className="cm-spin" /> : <Mail size={14} />}
                Enviar alerta agora
              </button>
            )}
            {isAdmin && (
              <button
                className="cm-btn outline"
                onClick={() => refreshDnsCache.mutate()}
                disabled={refreshDnsCache.isPending}
                title="Chama o scanner DAST agora e resolve o hostname (PTR) de cada IP cadastrado no CMDB"
              >
                {refreshDnsCache.isPending ? <Loader2 size={14} className="cm-spin" /> : <RefreshCw size={14} />}
                NSLOOKUP
              </button>
            )}
            {canCreate && (
              <button className="cm-btn primary" onClick={openNew}>
                <Plus size={14} /> Novo ativo
              </button>
            )}
          </div>
        </div>

        <div className="cm-panel-body">
          <div className="cm-filters">
            <div className="cm-filters-row">
              <FilterBox
                label="Tipo"
                options={tipoOptions}
                selected={tipoFilter}
                onChange={setTipoFilter}
                countFor={(o) =>
                  all.filter((r) => passesFilters(r, "tipo") && ((r.tipo ?? "").trim() || "Não informado") === o).length
                }
              />
              <FilterBox
                label="Sistema operacional"
                options={OS_FILTER_OPTIONS}
                selected={osFilter}
                onChange={setOsFilter}
                countFor={(o) =>
                  all.filter((r) => passesFilters(r, "os") && osFilterGroup(r.sistema_operacional) === o).length
                }
                colorFor={(o) => OS_FILTER_COLOR[o]}
                hintFor={(o) => OS_FILTER_HINT[o]}
              />
              <FilterBox
                label="Criticidade"
                options={CRITICIDADES}
                selected={critFilter}
                onChange={setCritFilter}
                countFor={(o) => all.filter((r) => passesFilters(r, "crit") && r.criticidade === o).length}
                colorFor={(c) => CRIT_COLOR[c]}
              />
              <FilterBox
                label="Status"
                options={STATUS_FILTER_OPTIONS}
                selected={statusFilter}
                onChange={setStatusFilter}
                countFor={(o) => all.filter((r) => passesFilters(r, "status") && matchesStatus(r, o)).length}
                colorFor={(s) => STATUS_FILTER_COLOR[s]}
              />
              <button
                className="cm-flink cm-fclear"
                disabled={activeFilterChips.length === 0}
                onClick={clearAllFilters}
              >
                Limpar filtros
              </button>
            </div>
            {activeFilterChips.length > 0 && (
              <div className="cm-fchips">
                {activeFilterChips.map((c) => (
                  <span key={`${c.group}:${c.value}`} className="cm-fchip">
                    <b>{c.group}:</b> {c.value}
                    <button onClick={c.remove} aria-label={`Remover filtro ${c.value}`}>
                      <X size={11} />
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="cm-tabs-row">
            <div className="cm-tabs-bar">
              <button className={`cm-tab${tab === "cards" ? " active" : ""}`} onClick={() => setTab("cards")}>
                Cards por criticidade
              </button>
              {canViewTabela && (
                <button className={`cm-tab${tab === "tabela" ? " active" : ""}`} onClick={() => setTab("tabela")}>
                  Tabela
                </button>
              )}
            </div>
            <Popover>
              <PopoverTrigger asChild>
                <button className="cm-btn outline" title="Exportar ativos filtrados">
                  <Download size={13} /> Exportar
                </button>
              </PopoverTrigger>
              <PopoverContent align="end" className="w-auto p-2">
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {EXPORT_FORMATS.map((f) => (
                    <button
                      key={f.key}
                      className="cm-btn ghost"
                      style={{ justifyContent: "flex-start", width: "100%" }}
                      onClick={() => handleExport(f.key)}
                    >
                      <Download size={12} /> {f.label}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>

          {tab === "tabela" && canViewTabela ? (
            isLoading ? (
              <div className="cm-loading">
                <Loader2 size={14} className="cm-spin" color={T.accent} /> Carregando...
              </div>
            ) : filtered.length === 0 ? (
              <div className="cm-empty">Nenhum ativo encontrado.</div>
            ) : (
              <div className="cm-table-wrap">
                <table className="cm-table">
                  <thead>
                    <tr>
                      <th>Nome</th>
                      <th>Tipo</th>
                      <th>IP / Hostname</th>
                      <th>Fabricante / Modelo</th>
                      <th>Departamento</th>
                      <th>Localização</th>
                      <th>Status</th>
                      <th>Criticidade</th>
                      <th>SIEM</th>
                      <th>Zabbix</th>
                      {(canEdit || canDelete) && <th />}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r.id} onClick={() => setDetail(r)}>
                        <td style={{ fontWeight: 600 }}>{r.nome}</td>
                        <td>
                          <span className="cm-tag">{r.tipo}</span>
                        </td>
                        <td className="mono dim">{r.ip_hostname ?? "—"}</td>
                        <td className="dim">{r.fabricante_modelo ?? "—"}</td>
                        <td>{r.departamento_nome ?? "—"}</td>
                        <td className="dim">{r.localizacao ?? "—"}</td>
                        <td>
                          <StatusPill value={displayStatus(r)} />
                        </td>
                        <td>
                          <CritBadge value={r.criticidade as Criticidade} />
                        </td>
                        <td>
                          <SiemFlag ok={isInSiem(r)} stale={siemCoverageStale} />
                        </td>
                        <td>
                          <ZabbixFlag state={zabbixState(r)} />
                        </td>
                        {(canEdit || canDelete) && (
                          <td onClick={(e) => e.stopPropagation()}>
                            <div className="cm-row-actions">
                              {canEdit && (
                                <button className="cm-icon-btn" onClick={() => openEdit(r)} title="Editar">
                                  <Pencil size={14} />
                                </button>
                              )}
                              {canDelete && (
                                <button className="cm-icon-btn danger" onClick={() => handleDelete(r)} title="Excluir">
                                  <Trash2 size={14} />
                                </button>
                              )}
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          ) : (
            <div className="cm-crit-grid">
              {CRITICIDADES.map((c) => {
                const itens = filtered.filter((r) => r.criticidade === c);
                const color = CRIT_COLOR[c];
                return (
                  <div key={c} className="cm-crit-col">
                    <div className="cm-crit-hdr" style={{ color }}>
                      <span>{c}</span>
                      <span className="cm-crit-count">{itens.length}</span>
                    </div>
                    <div className="cm-crit-body">
                      {itens.length === 0 ? (
                        <p className="cm-crit-empty">—</p>
                      ) : (
                        itens.map((a) => (
                          <button
                            key={a.id}
                            onClick={() => setDetail(a)}
                            className="cm-crit-item"
                            style={{ "--cc": color } as React.CSSProperties}
                          >
                            <div className="cm-crit-item-top">
                              <div className="cm-crit-item-name">{a.nome}</div>
                              <div className="cm-crit-item-flags">
                                <SiemFlag ok={isInSiem(a)} variant="label" stale={siemCoverageStale} />
                                <ZabbixFlag state={zabbixState(a)} variant="label" />
                                <StatusPill value={displayStatus(a)} />
                              </div>
                            </div>
                            <div className="cm-crit-item-meta">
                              <span>
                                <Server size={13} /> {a.tipo}
                              </span>
                              {a.sistema_operacional && (
                                <span>
                                  <Cpu size={13} /> {osCardLabel(a.sistema_operacional)}
                                </span>
                              )}
                              {a.localizacao && (
                                <span>
                                  <MapPin size={13} /> {a.localizacao}
                                </span>
                              )}
                              {zabbixHostnameDivergence(a) && (
                                <span title="Hostname divergente do Zabbix" style={{ color: T.warning }}>
                                  <AlertTriangle size={13} /> Divergência
                                </span>
                              )}
                            </div>
                          </button>
                        ))
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="cm-panel-foot">
          Alertas por e-mail (Device Alert / Device Stopped) são enviados aos administradores globais e do módulo
          automaticamente todos os dias às 10:00 e 16:00 (BRT), além do envio manual acima.
        </div>
      </div>

      <CmdbFormDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
      <CmdbDetailsSheet
        open={!!detail}
        onOpenChange={(v) => !v && setDetail(null)}
        ativo={detail}
        status={detail ? displayStatus(detail) : "Inativo"}
        zabbixDivergence={detail ? zabbixHostnameDivergence(detail) : null}
        onEdit={openEdit}
        onDelete={handleDelete}
        canEdit={canEdit}
        canDelete={canDelete}
      />
    </div>
  );
}
