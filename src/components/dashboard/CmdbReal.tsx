import { SyncActions } from "@/components/layout/SyncActions";
import * as React from "react";
import * as XLSX from "xlsx";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  Circle,
  Cpu,
  Diamond,
  Download,
  Globe,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Pencil,
  Plus,
  Search,
  Server,
  Square,
  Trash2,
  Triangle,
  X,
} from "lucide-react";
import { usePermissions } from "@/lib/use-permissions";
import { supabase } from "@/integrations/supabase/client";
import { listCmdbAtivos, deleteCmdbAtivo, type CmdbAtivo } from "@/lib/cmdb.functions";
import { runCmdbDeviceAlertsNow } from "@/lib/cmdb-alerts.functions";
import { getZabbixCachedHosts, getZabbixLiveHosts } from "@/lib/zabbix.functions";
import { getCmdbDnsCache, refreshCmdbDnsCacheNow } from "@/lib/cmdb-dns.functions";
import { getCronHealth } from "./CronHealthBadge";
import { ModuleLoading } from "@/components/layout/ModuleLoading";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  CRITICIDADE_ORDER,
  critColor,
  statusColor,
  type Criticidade,
  type CmdbDisplayStatus,
} from "./cmdb/CmdbBadges";
import { CmdbFormDialog } from "./cmdb/CmdbFormDialog";
import { CmdbDetailsSheet, CmdbPill } from "./cmdb/CmdbDetailsSheet";
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

// Forma por criticidade: identifica a coluna sem depender só da cor
const CRIT_ICON: Record<
  Criticidade,
  React.ComponentType<{ size?: number; fill?: string; strokeWidth?: number }>
> = {
  Crítico: Triangle,
  Alto: Diamond,
  Médio: Square,
  Baixo: Circle,
};

const STATUS_FILTER_COLOR = (s: StatusFilterValue) =>
  s === "Divergência" ? "var(--v2-med)" : statusColor(s);

// ── CSS (interface v2) ─────────────────────────────────────────────────────────
const CSS = `
  .cm-root { font-family:var(--font-ui); color:var(--v2-fg); display:flex; flex-direction:column; gap:20px; font-size:14px; }
  .cm-root * { box-sizing:border-box; }
  .cm-root ::-webkit-scrollbar { width:6px; height:6px; }
  .cm-root ::-webkit-scrollbar-thumb { background:var(--v2-line-strong); border-radius:3px; }
  .cm-root :focus-visible { outline:2px solid var(--v2-accent); outline-offset:2px; }
  .cm-root .mono { font-family:var(--font-data); font-size:12.5px; }
  .cm-root .dim { color:var(--v2-fg-3); }
  @keyframes cm-spin { to{transform:rotate(360deg)} }
  .cm-spin { animation:cm-spin .8s linear infinite; }

  .cm-ph { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  .cm-ph-title { font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.2; margin:0; }
  .cm-ph-sub { margin:4px 0 0; font-size:13px; color:var(--v2-fg-3); }
  .cm-ph-actions { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
  .cm-state { display:flex; flex-direction:column; align-items:center; gap:10px; padding:48px 24px; text-align:center; background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; }

  .cm-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
  .cm-kpi { position:relative; text-align:left; border:0; background:transparent; padding:16px 18px 14px; display:grid; gap:2px; align-content:start; box-shadow:1px 0 0 var(--v2-line), 0 1px 0 var(--v2-line); color:inherit; font-family:inherit; min-width:0; }
  button.cm-kpi { cursor:pointer; }
  button.cm-kpi:hover { background:var(--v2-hover); }
  .cm-kpi[aria-pressed="true"] { background:var(--v2-hover); }
  .cm-kpi[aria-pressed="true"]::after { content:""; position:absolute; left:0; right:0; bottom:0; height:2px; background:var(--v2-accent); }
  .cm-kpi-label { font-size:12.5px; color:var(--v2-fg-2); display:flex; align-items:center; gap:6px; }
  .cm-kpi-value { font-size:28px; font-weight:600; letter-spacing:-0.02em; line-height:1.25; font-variant-numeric:tabular-nums; }
  .cm-kpi-foot { font-size:12px; color:var(--v2-fg-3); }
  .cm-sw { width:8px; height:8px; border-radius:2px; display:inline-block; flex-shrink:0; }
  .cm-stack { display:flex; height:8px; border-radius:99px; overflow:hidden; gap:2px; margin:8px 0 4px; background:var(--v2-surface-2); }
  .cm-stack i { display:block; height:100%; }
  .cm-meter { height:6px; border-radius:99px; background:var(--v2-surface-2); overflow:hidden; margin:8px 0 4px; }
  .cm-meter i { display:block; height:100%; border-radius:99px; }
  .cm-types { display:grid; gap:4px; margin-top:6px; font-size:13px; }
  .cm-types div { display:flex; justify-content:space-between; gap:8px; }
  .cm-types span { color:var(--v2-fg-2); }
  .cm-types b { font:500 13px var(--font-data); }

  .cm-panel { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; min-width:0; }
  .cm-fbar { display:flex; flex-wrap:wrap; gap:8px; align-items:center; padding:12px 18px; border-bottom:1px solid var(--v2-line); }
  .cm-fbox { display:inline-flex; align-items:center; gap:7px; height:32px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg); font:500 13px var(--font-ui); cursor:pointer; }
  .cm-fbox:hover { border-color:var(--v2-line-strong); }
  .cm-fbox .k { color:var(--v2-fg-3); font-weight:400; }
  .cm-fbox .n { font:500 11.5px var(--font-data); padding:1px 6px; border-radius:99px; background:color-mix(in oklch, var(--v2-accent) 14%, transparent); color:var(--v2-accent); }
  .cm-fbox.set { border-color:color-mix(in oklch, var(--v2-accent) 55%, transparent); }
  .cm-fbox svg { color:var(--v2-fg-3); }
  .cm-fmenu { display:flex; flex-direction:column; font-family:var(--font-ui); }
  .cm-fopt { display:flex; align-items:center; gap:9px; width:100%; padding:7px 8px; border:none; background:transparent; color:var(--v2-fg); font-size:13px; border-radius:5px; cursor:pointer; text-align:left; }
  .cm-fopt:hover, .cm-fopt:focus-visible { background:var(--v2-hover); outline:none; }
  .cm-fopt-chk { width:15px; height:15px; border-radius:4px; border:1px solid var(--v2-line-strong); display:grid; place-items:center; flex-shrink:0; }
  .cm-fopt.on .cm-fopt-chk { background:var(--v2-accent); border-color:var(--v2-accent); color:var(--v2-accent-ink); }
  .cm-fopt-hint { display:block; font-size:11.5px; color:var(--v2-fg-3); }
  .cm-fopt-n { margin-left:auto; padding-left:12px; font:400 12px var(--font-data); color:var(--v2-fg-3); }
  .cm-fmenu-foot { border-top:1px solid var(--v2-line); margin-top:4px; padding:6px 8px 2px; }
  .cm-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; display:inline-block; }
  .cm-link { border:0; background:none; color:var(--v2-accent); font:500 12.5px var(--font-ui); cursor:pointer; padding:0; }
  .cm-link:disabled { color:var(--v2-fg-3); cursor:default; }
  .cm-chips { display:flex; flex-wrap:wrap; gap:6px; padding:10px 18px 0; }
  .cm-fchip { display:inline-flex; align-items:center; gap:6px; height:26px; padding:0 4px 0 9px; border-radius:5px; background:var(--v2-surface-2); border:1px solid var(--v2-line); font-size:12.5px; }
  .cm-fchip b { color:var(--v2-fg-3); font-weight:400; }
  .cm-fchip button { border:0; background:none; color:var(--v2-fg-3); cursor:pointer; display:grid; place-items:center; width:20px; height:20px; border-radius:4px; }
  .cm-fchip button:hover { background:var(--v2-hover); color:var(--v2-fg); }

  .cm-viewbar { display:flex; align-items:center; justify-content:space-between; gap:10px; flex-wrap:wrap; padding:14px 18px 0; }
  .cm-viewbar-l { display:flex; gap:12px; align-items:center; flex-wrap:wrap; }
  .cm-viewbar-r { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
  .cm-title { font-weight:600; font-size:14px; }
  .cm-title span { font-weight:400; font-size:13px; color:var(--v2-fg-3); }
  .cm-seg { display:inline-flex; padding:3px; gap:2px; background:var(--v2-bg); border:1px solid var(--v2-line); border-radius:8px; }
  .cm-seg button { border:0; background:transparent; padding:4px 12px; border-radius:5px; font-size:13px; color:var(--v2-fg-2); cursor:pointer; font-family:inherit; }
  .cm-seg button[aria-pressed="true"] { background:var(--v2-surface-2); color:var(--v2-fg); font-weight:500; box-shadow:inset 0 0 0 1px var(--v2-line); }
  .cm-search { display:inline-flex; align-items:center; gap:8px; height:32px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg-3); width:240px; max-width:100%; }
  .cm-search input { flex:1; min-width:0; border:0; outline:none; background:transparent; color:var(--v2-fg); font-size:13px; font-family:inherit; }

  .cm-btn { display:inline-flex; align-items:center; gap:7px; height:32px; padding:0 12px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; font-family:var(--font-ui); white-space:nowrap; border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-fg); }
  .cm-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .cm-btn:hover:not(:disabled) { background:var(--v2-hover); }
  .cm-btn.lg { height:34px; padding:0 14px; }
  .cm-btn.primary { background:var(--v2-accent); border-color:var(--v2-accent); color:var(--v2-accent-ink); }
  .cm-btn.primary:hover:not(:disabled) { background:var(--v2-accent); filter:brightness(1.08); }
  .cm-btn.ghost { background:transparent; border-color:transparent; color:var(--v2-fg-2); }
  .cm-btn.danger { background:var(--v2-crit); border-color:var(--v2-crit); color:#fff; }

  /* colunas por criticidade */
  .cm-board { display:grid; grid-template-columns:repeat(4, minmax(0, 1fr)); gap:14px; padding:14px 18px 18px; }
  @media (max-width: 1280px) { .cm-board { grid-template-columns:repeat(2, minmax(0, 1fr)); } }
  @media (max-width: 640px) { .cm-board { grid-template-columns:minmax(0, 1fr); } }
  .cm-col { display:flex; flex-direction:column; min-width:0; border-radius:12px; background:var(--v2-surface-2); border:1px solid var(--v2-line); overflow:hidden; }
  .cm-col-h { display:flex; align-items:center; gap:8px; padding:12px 12px 4px; }
  .cm-col-h .ic { width:22px; height:22px; border-radius:6px; display:grid; place-items:center; color:var(--cc); background:color-mix(in oklch, var(--cc) 16%, transparent); }
  .cm-col-h b { font-size:13.5px; font-weight:600; }
  .cm-col-h .cnt { margin-left:auto; font:500 13px var(--font-data); color:var(--v2-fg-2); }
  .cm-col-sub { padding:0 12px 10px 42px; font-size:12px; color:var(--v2-fg-3); }
  .cm-col-sub .bad { color:color-mix(in oklch, var(--v2-crit) 75%, var(--v2-fg)); }
  .cm-col-b { display:flex; flex-direction:column; gap:6px; padding:0 8px 8px; max-height:62vh; overflow-y:auto; }
  .cm-col-empty { padding:26px 0; text-align:center; font-size:12.5px; color:var(--v2-fg-3); }

  .cm-asset { display:grid; gap:10px; width:100%; text-align:left; padding:12px 12px 10px; border-radius:8px; border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-fg); font-family:var(--font-ui); cursor:pointer; transition:border-color .12s, box-shadow .12s; }
  .cm-asset:hover { border-color:var(--v2-line-strong); box-shadow:0 4px 14px oklch(0 0 0 / 0.18); }
  .cm-asset.inactive { box-shadow:inset 3px 0 0 var(--v2-crit); }
  .cm-asset.alerting { box-shadow:inset 3px 0 0 var(--v2-med); }
  .cm-as-head { display:flex; align-items:flex-start; gap:10px; min-width:0; }
  .cm-as-name { min-width:0; flex:1; }
  .cm-as-name b { display:block; font-size:13.5px; font-weight:600; line-height:1.3; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .cm-as-name small { display:block; margin-top:2px; font:400 12px var(--font-data); color:var(--v2-fg-3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .cm-as-meta { display:flex; flex-wrap:wrap; gap:4px 14px; font-size:12.5px; color:var(--v2-fg-2); }
  .cm-as-meta span { display:inline-flex; align-items:center; gap:6px; min-width:0; }
  .cm-as-meta svg { color:var(--v2-fg-3); flex-shrink:0; }
  .cm-as-foot { display:flex; align-items:center; gap:14px; padding-top:9px; border-top:1px solid var(--v2-line); }
  .cm-as-warn { margin-left:auto; display:inline-flex; align-items:center; gap:5px; font-size:12px; color:color-mix(in oklch, var(--v2-med) 75%, var(--v2-fg)); }

  .cm-mon { --mc:var(--v2-ok); display:inline-flex; align-items:center; gap:6px; font-size:12px; color:var(--v2-fg-2); white-space:nowrap; }
  .cm-mon i { width:7px; height:7px; border-radius:50%; background:var(--mc); }
  .cm-mon.unk { --mc:var(--v2-med); }
  .cm-mon.off { --mc:var(--v2-crit); color:var(--v2-fg-3); }
  .cm-crit-tag { display:inline-flex; align-items:center; gap:6px; font-size:12.5px; font-weight:500; white-space:nowrap; }
  .cm-tag { display:inline-flex; align-items:center; height:22px; padding:0 8px; border-radius:5px; background:var(--v2-surface-2); border:1px solid var(--v2-line); font-size:12px; color:var(--v2-fg-2); white-space:nowrap; }

  .cm-scroll { overflow:auto; max-height:640px; margin-top:14px; }
  .cm-table { width:100%; border-collapse:collapse; font-size:13px; }
  .cm-table thead { position:sticky; top:0; z-index:1; }
  .cm-table th { padding:9px 12px; font-size:12px; font-weight:500; color:var(--v2-fg-3); text-align:left; background:var(--v2-surface); border-bottom:1px solid var(--v2-line); white-space:nowrap; }
  .cm-table td { padding:8px 12px; height:48px; border-bottom:1px solid var(--v2-line); vertical-align:middle; }
  .cm-table th:first-child, .cm-table td:first-child { padding-left:18px; }
  .cm-table th:last-child, .cm-table td:last-child { padding-right:18px; }
  .cm-table tbody tr { cursor:pointer; }
  .cm-table tbody tr:hover td { background:var(--v2-hover); }
  .cm-table tbody tr:last-child td { border-bottom:none; }
  .cm-table td.nm b { display:block; font-weight:500; }
  .cm-table td.nm small { font:400 12px var(--font-data); color:var(--v2-fg-3); }
  .cm-row-act { display:flex; justify-content:flex-end; gap:2px; }
  .cm-icon-btn { display:grid; place-items:center; width:30px; height:30px; border-radius:8px; border:0; background:transparent; color:var(--v2-fg-2); cursor:pointer; }
  .cm-icon-btn:hover { background:var(--v2-hover); color:var(--v2-fg); }
  .cm-icon-btn.danger:hover { color:var(--v2-crit); background:color-mix(in oklch, var(--v2-crit) 12%, transparent); }
  .cm-empty { padding:40px 16px; text-align:center; color:var(--v2-fg-3); font-size:13px; }
  .cm-foot { padding:12px 18px; border-top:1px solid var(--v2-line); font-size:12.5px; color:var(--v2-fg-3); }
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
  const toggle = (o: T) =>
    onChange(selected.includes(o) ? selected.filter((s) => s !== o) : [...selected, o]);
  const first = selected[0];
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className={`cm-fbox${selected.length ? " set" : ""}`}>
          <span className="k">{label}</span>
          {first === undefined ? (
            "Todos"
          ) : (
            <>
              {first}
              {selected.length > 1 && <span className="n">+{selected.length - 1}</span>}
            </>
          )}
          <ChevronDown size={14} />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-auto min-w-[230px] p-1.5"
        style={{
          background: "var(--v2-surface)",
          borderColor: "var(--v2-line-strong)",
          color: "var(--v2-fg)",
        }}
      >
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
                <span className="cm-fopt-chk">{on && <Check size={11} />}</span>
                {colorFor && <span className="cm-dot" style={{ background: colorFor(o) }} />}
                <span>
                  {o}
                  {hint && <span className="cm-fopt-hint">{hint}</span>}
                </span>
                <span className="cm-fopt-n">{countFor(o)}</span>
              </button>
            );
          })}
          <div className="cm-fmenu-foot">
            <button
              className="cm-link"
              disabled={selected.length === 0}
              onClick={() => onChange([])}
            >
              Limpar
            </button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

const OS_WINDOWS = ["Windows Server", "Windows"];
const OS_LINUX_PRESET = [
  "Ubuntu Server",
  "Debian",
  "Red Hat Enterprise Linux",
  "CentOS",
  "FreeBSD",
];

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
  Windows: "var(--v2-accent)",
  Linux: "var(--v2-med)",
  Fortigate: "var(--v2-high)",
  Outros: "var(--v2-fg-3)",
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

function CritTag({ value }: { value: Criticidade }) {
  const Icon = CRIT_ICON[value] ?? Circle;
  return (
    <span className="cm-crit-tag">
      <span style={{ color: critColor(value), display: "grid" }}>
        <Icon size={11} fill="currentColor" strokeWidth={0} />
      </span>
      {value}
    </span>
  );
}

function SiemFlag({ ok, stale = false }: { ok: boolean; stale?: boolean }) {
  const title = ok
    ? "Monitorado pelo SIEM (QRadar)"
    : stale
      ? "Sem confirmação do SIEM no momento — sincronização do QRadar desatualizada (não significa que o host caiu, só que não temos como confirmar via SIEM agora)"
      : "Não monitorado pelo SIEM";
  return (
    <span className={`cm-mon${ok ? "" : stale ? " unk" : " off"}`} title={title}>
      <i />
      SIEM
    </span>
  );
}

function ZabbixFlag({ state }: { state: "ok" | "unknown" | "off" }) {
  const title =
    state === "ok"
      ? "Monitorado pelo Zabbix (disponível)"
      : state === "unknown"
        ? "Cadastrado no Zabbix mas disponibilidade não confirmada (Unknown/Unavailable)"
        : "Não encontrado no Zabbix";
  return (
    <span
      className={`cm-mon${state === "ok" ? "" : state === "unknown" ? " unk" : " off"}`}
      title={title}
    >
      <i />
      Zabbix
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
      const { data } = await supabase
        .from("cron_job_runs")
        .select("*")
        .eq("job_name", "qradar-sync")
        .maybeSingle();
      return data;
    },
    enabled: canView,
    refetchInterval: 60_000,
  });
  const siemCoverageStale = qradarCronHealth
    ? getCronHealth(qradarCronHealth).tone !== "success"
    : false;

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
  const [confirmDel, setConfirmDel] = React.useState<CmdbAtivo | null>(null);

  const all = React.useMemo(() => data ?? [], [data]);

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
      if (
        skip !== "tipo" &&
        tipoFilter.length &&
        !tipoFilter.includes((r.tipo ?? "").trim() || "Não informado")
      )
        return false;
      if (
        skip !== "os" &&
        osFilter.length &&
        !osFilter.includes(osFilterGroup(r.sistema_operacional))
      )
        return false;
      if (
        skip !== "crit" &&
        critFilter.length &&
        !critFilter.includes(r.criticidade as Criticidade)
      )
        return false;
      if (
        skip !== "status" &&
        statusFilter.length &&
        !statusFilter.some((v) => matchesStatus(r, v))
      )
        return false;
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
    ...tipoFilter.map((v) => ({
      group: "Tipo",
      value: v,
      remove: () => setTipoFilter((p) => p.filter((x) => x !== v)),
    })),
    ...osFilter.map((v) => ({
      group: "SO",
      value: v,
      remove: () => setOsFilter((p) => p.filter((x) => x !== v)),
    })),
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

  const statusCounts = React.useMemo(() => {
    const c = { Ativo: 0, Alerta: 0, Inativo: 0 } as Record<"Ativo" | "Alerta" | "Inativo", number>;
    for (const r of all) {
      const s = displayStatus(r);
      if (s === "Ativo" || s === "Alerta" || s === "Inativo") c[s]++;
    }
    return c;
  }, [all, displayStatus]);

  const problemByCrit = React.useMemo(() => {
    const m = { Crítico: 0, Alto: 0, Médio: 0, Baixo: 0 } as Record<Criticidade, number>;
    for (const r of all) {
      const s = displayStatus(r);
      if ((s === "Alerta" || s === "Inativo") && r.criticidade in m)
        m[r.criticidade as Criticidade]++;
    }
    return m;
  }, [all, displayStatus]);

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Ativo removido");
      qc.invalidateQueries({ queryKey: ["cmdb", "ativos"] });
      setDetail(null);
      setConfirmDel(null);
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
    setConfirmDel(a);
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
        <div className="cm-state">
          <Lock size={22} color="var(--v2-crit)" />
          <span style={{ fontSize: 15, fontWeight: 600 }}>Acesso restrito</span>
          <span className="dim" style={{ fontSize: 13 }}>
            Você não tem permissão para acessar este módulo.
          </span>
        </div>
      </div>
    );
  }

  if (isLoading) return <ModuleLoading />;

  const pctOf = (n: number) => (counts.total > 0 ? Math.round((n / counts.total) * 100) : 0);
  const tone = (v: number) =>
    v >= 80 ? "var(--v2-ok)" : v >= 50 ? "var(--v2-med)" : "var(--v2-crit)";
  const siemPct = pctOf(counts.siem);
  const zbxPct = pctOf(counts.zabbix);
  const critOnly = (c: Criticidade) => critFilter.length === 1 && critFilter[0] === c;

  return (
    <div className="cm-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Cabeçalho ────────────────────────────────────────────────────── */}
      <div className="cm-ph">
        <div>
          <h1 className="cm-ph-title">CMDB</h1>
          <p className="cm-ph-sub">
            Inventário de ativos de infraestrutura, com cobertura de monitoramento SIEM e Zabbix
          </p>
        </div>
        <SyncActions moduleSlug="cmdb" jobs={["cmdb-device-alerts", "cmdb-dns-cache-refresh"]}>
          <div className="cm-ph-actions">
            {canSendAlerts && (
              <button
                className="cm-btn lg"
                onClick={() => sendAlerts.mutate()}
                disabled={sendAlerts.isPending}
                title="Envia agora um e-mail consolidado com ativos em Alerta e Inativos para administradores"
              >
                {sendAlerts.isPending ? (
                  <Loader2 size={14} className="cm-spin" />
                ) : (
                  <Mail size={14} />
                )}
                Enviar alerta agora
              </button>
            )}
            {isAdmin && (
              <button
                className="cm-btn lg"
                onClick={() => refreshDnsCache.mutate()}
                disabled={refreshDnsCache.isPending}
                title="Chama o scanner DAST agora e resolve o hostname (PTR) de cada IP cadastrado no CMDB"
              >
                {refreshDnsCache.isPending ? (
                  <Loader2 size={14} className="cm-spin" />
                ) : (
                  <Globe size={14} />
                )}
                NSLOOKUP
              </button>
            )}
            {canCreate && (
              <button className="cm-btn primary lg" onClick={openNew}>
                <Plus size={14} /> Novo ativo
              </button>
            )}
          </div>
        </SyncActions>
      </div>

      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div className="cm-kpis">
        <div className="cm-kpi">
          <span className="cm-kpi-label">Total de ativos</span>
          <span className="cm-kpi-value">{counts.total}</span>
          <div
            className="cm-stack"
            title={`Ativos: ${statusCounts.Ativo} · Em alerta: ${statusCounts.Alerta} · Inativos: ${statusCounts.Inativo}`}
          >
            <i style={{ width: `${pctOf(statusCounts.Ativo)}%`, background: "var(--v2-ok)" }} />
            <i style={{ width: `${pctOf(statusCounts.Alerta)}%`, background: "var(--v2-med)" }} />
            <i style={{ width: `${pctOf(statusCounts.Inativo)}%`, background: "var(--v2-crit)" }} />
          </div>
          <span className="cm-kpi-foot">
            {statusCounts.Alerta} em alerta · {statusCounts.Inativo} inativos
          </span>
        </div>
        {(["Crítico", "Alto"] as Criticidade[]).map((c) => (
          <button
            key={c}
            type="button"
            className="cm-kpi"
            aria-pressed={critOnly(c)}
            onClick={() => setCritFilter(critOnly(c) ? [] : [c])}
            title={
              critOnly(c)
                ? "Limpar filtro"
                : `Filtrar ativos ${c === "Crítico" ? "críticos" : "altos"}`
            }
          >
            <span className="cm-kpi-label">
              <span className="cm-sw" style={{ background: critColor(c) }} />
              {c === "Crítico" ? "Críticos" : "Altos"}
            </span>
            <span className="cm-kpi-value">{c === "Crítico" ? counts.critico : counts.alto}</span>
            <span className="cm-kpi-foot">{problemByCrit[c]} em alerta ou inativos</span>
          </button>
        ))}
        <div className="cm-kpi">
          <span className="cm-kpi-label">Hosts por tipo</span>
          <div className="cm-types">
            {hostsPorTipoKpi.map(({ tipo, count }) => (
              <div key={tipo}>
                <span>{tipo}</span>
                <b>{count}</b>
              </div>
            ))}
          </div>
        </div>
        <div className="cm-kpi">
          <span className="cm-kpi-label">
            Cobertura SIEM
            {siemCoverageStale && <AlertTriangle size={13} color="var(--v2-med)" />}
          </span>
          <span className="cm-kpi-value">{siemPct}%</span>
          <div className="cm-meter">
            <i
              style={{
                width: `${siemPct}%`,
                background: siemCoverageStale ? "var(--v2-med)" : tone(siemPct),
              }}
            />
          </div>
          <span className="cm-kpi-foot">
            {siemCoverageStale
              ? "Sincronização do QRadar atrasada"
              : `${counts.siem} de ${counts.total} ativos no QRadar`}
          </span>
        </div>
        <div className="cm-kpi">
          <span className="cm-kpi-label">Cobertura Zabbix</span>
          <span className="cm-kpi-value">{zbxPct}%</span>
          <div className="cm-meter">
            <i style={{ width: `${zbxPct}%`, background: tone(zbxPct) }} />
          </div>
          <span className="cm-kpi-foot">
            {counts.zabbix} de {counts.total} disponíveis no Zabbix
          </span>
        </div>
      </div>

      {/* ── Ativos ───────────────────────────────────────────────────────── */}
      <div className="cm-panel">
        <div className="cm-fbar">
          <FilterBox
            label="Tipo"
            options={tipoOptions}
            selected={tipoFilter}
            onChange={setTipoFilter}
            countFor={(o) =>
              all.filter(
                (r) => passesFilters(r, "tipo") && ((r.tipo ?? "").trim() || "Não informado") === o,
              ).length
            }
          />
          <FilterBox
            label="Sistema operacional"
            options={OS_FILTER_OPTIONS}
            selected={osFilter}
            onChange={setOsFilter}
            countFor={(o) =>
              all.filter(
                (r) => passesFilters(r, "os") && osFilterGroup(r.sistema_operacional) === o,
              ).length
            }
            colorFor={(o) => OS_FILTER_COLOR[o]}
            hintFor={(o) => OS_FILTER_HINT[o]}
          />
          <FilterBox
            label="Criticidade"
            options={CRITICIDADES}
            selected={critFilter}
            onChange={setCritFilter}
            countFor={(o) =>
              all.filter((r) => passesFilters(r, "crit") && r.criticidade === o).length
            }
            colorFor={critColor}
          />
          <FilterBox
            label="Status"
            options={STATUS_FILTER_OPTIONS}
            selected={statusFilter}
            onChange={setStatusFilter}
            countFor={(o) =>
              all.filter((r) => passesFilters(r, "status") && matchesStatus(r, o)).length
            }
            colorFor={STATUS_FILTER_COLOR}
          />
          <button
            className="cm-link"
            style={{ marginLeft: 4 }}
            disabled={activeFilterChips.length === 0}
            onClick={clearAllFilters}
          >
            Limpar filtros
          </button>
        </div>
        {activeFilterChips.length > 0 && (
          <div className="cm-chips">
            {activeFilterChips.map((c) => (
              <span key={`${c.group}:${c.value}`} className="cm-fchip">
                <b>{c.group}:</b> {c.value}
                <button onClick={c.remove} aria-label={`Remover filtro ${c.value}`}>
                  <X size={12} />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="cm-viewbar">
          <div className="cm-viewbar-l">
            <div className="cm-title">
              Ativos{" "}
              <span>
                (
                {filtered.length === all.length
                  ? all.length
                  : `${filtered.length} de ${all.length}`}
                )
              </span>
            </div>
            {canViewTabela && (
              <div className="cm-seg" role="group" aria-label="Visualização">
                <button
                  type="button"
                  aria-pressed={tab === "cards"}
                  onClick={() => setTab("cards")}
                >
                  Cards por criticidade
                </button>
                <button
                  type="button"
                  aria-pressed={tab === "tabela"}
                  onClick={() => setTab("tabela")}
                >
                  Tabela
                </button>
              </div>
            )}
          </div>
          <div className="cm-viewbar-r">
            <label className="cm-search">
              <Search size={14} />
              <input
                placeholder="Buscar nome, IP ou tipo"
                aria-label="Buscar ativos"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
            <Popover>
              <PopoverTrigger asChild>
                <button className="cm-btn" title="Exportar ativos filtrados">
                  <Download size={14} /> Exportar
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="end"
                className="w-auto min-w-[170px] p-1.5"
                style={{
                  background: "var(--v2-surface)",
                  borderColor: "var(--v2-line-strong)",
                  color: "var(--v2-fg)",
                }}
              >
                <div className="cm-fmenu">
                  {EXPORT_FORMATS.map((f) => (
                    <button key={f.key} className="cm-fopt" onClick={() => handleExport(f.key)}>
                      <Download size={13} /> {f.label}
                    </button>
                  ))}
                </div>
              </PopoverContent>
            </Popover>
          </div>
        </div>

        {filtered.length === 0 ? (
          <div className="cm-empty">
            {all.length === 0 ? "Nenhum ativo cadastrado." : "Nenhum ativo com esses filtros."}
          </div>
        ) : tab === "tabela" && canViewTabela ? (
          <div className="cm-scroll">
            <table className="cm-table">
              <thead>
                <tr>
                  <th>Ativo</th>
                  <th>Tipo</th>
                  <th>Criticidade</th>
                  <th>Status</th>
                  <th>Fabricante / modelo</th>
                  <th>Departamento</th>
                  <th>Localização</th>
                  <th>Monitoramento</th>
                  {(canEdit || canDelete) && (
                    <th>
                      <span style={{ fontSize: 0 }}>Ações</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} onClick={() => setDetail(r)}>
                    <td className="nm">
                      <b>{r.nome}</b>
                      <small>{r.ip_hostname ?? "—"}</small>
                    </td>
                    <td>
                      <span className="cm-tag">{r.tipo}</span>
                    </td>
                    <td>
                      <CritTag value={r.criticidade as Criticidade} />
                    </td>
                    <td>
                      <CmdbPill color={statusColor(displayStatus(r))}>{displayStatus(r)}</CmdbPill>
                    </td>
                    <td className="dim">{r.fabricante_modelo ?? "—"}</td>
                    <td>{r.departamento_nome ?? "—"}</td>
                    <td className="dim">{r.localizacao ?? "—"}</td>
                    <td>
                      <div style={{ display: "flex", gap: 12 }}>
                        <SiemFlag ok={isInSiem(r)} stale={siemCoverageStale} />
                        <ZabbixFlag state={zabbixState(r)} />
                      </div>
                    </td>
                    {(canEdit || canDelete) && (
                      <td onClick={(e) => e.stopPropagation()}>
                        <div className="cm-row-act">
                          {canEdit && (
                            <button
                              className="cm-icon-btn"
                              onClick={() => openEdit(r)}
                              title="Editar"
                              aria-label="Editar"
                            >
                              <Pencil size={14} />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              className="cm-icon-btn danger"
                              onClick={() => handleDelete(r)}
                              title="Excluir"
                              aria-label="Excluir"
                            >
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
        ) : (
          <div className="cm-board">
            {CRITICIDADES.map((c) => {
              const itens = filtered.filter((r) => r.criticidade === c);
              const alerta = itens.filter((r) => displayStatus(r) === "Alerta").length;
              const inativos = itens.filter((r) => displayStatus(r) === "Inativo").length;
              const Icon = CRIT_ICON[c];
              return (
                <section
                  key={c}
                  className="cm-col"
                  aria-label={c}
                  style={{ "--cc": critColor(c) } as React.CSSProperties}
                >
                  <div className="cm-col-h">
                    <span className="ic">
                      <Icon size={11} fill="currentColor" strokeWidth={0} />
                    </span>
                    <b>{c}</b>
                    <span className="cnt">{itens.length}</span>
                  </div>
                  <div className="cm-col-sub">
                    {alerta + inativos === 0 ? (
                      "tudo operando"
                    ) : (
                      <span className="bad">
                        {[
                          alerta && `${alerta} em alerta`,
                          inativos && `${inativos} inativo${inativos > 1 ? "s" : ""}`,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    )}
                  </div>
                  <div className="cm-col-b">
                    {itens.length === 0 ? (
                      <div className="cm-col-empty">Nenhum ativo</div>
                    ) : (
                      itens.map((a) => {
                        const st = displayStatus(a);
                        const div = zabbixHostnameDivergence(a);
                        return (
                          <button
                            key={a.id}
                            onClick={() => setDetail(a)}
                            className={`cm-asset${st === "Inativo" ? " inactive" : st === "Alerta" ? " alerting" : ""}`}
                          >
                            <div className="cm-as-head">
                              <div className="cm-as-name">
                                <b title={a.nome}>{a.nome}</b>
                                {a.ip_hostname && <small>{a.ip_hostname}</small>}
                              </div>
                              <CmdbPill color={statusColor(st)}>{st}</CmdbPill>
                            </div>
                            <div className="cm-as-meta">
                              <span>
                                <Server size={14} /> {a.tipo}
                              </span>
                              {a.sistema_operacional && (
                                <span>
                                  <Cpu size={14} /> {osCardLabel(a.sistema_operacional)}
                                </span>
                              )}
                              {a.localizacao && (
                                <span>
                                  <MapPin size={14} /> {a.localizacao}
                                </span>
                              )}
                            </div>
                            <div className="cm-as-foot">
                              <SiemFlag ok={isInSiem(a)} stale={siemCoverageStale} />
                              <ZabbixFlag state={zabbixState(a)} />
                              {div && (
                                <span
                                  className="cm-as-warn"
                                  title="Hostname divergente do Zabbix/DNS"
                                >
                                  <AlertTriangle size={13} /> Divergência
                                </span>
                              )}
                            </div>
                          </button>
                        );
                      })
                    )}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        <div className="cm-foot">
          Alertas por e-mail (Device Alert / Device Stopped) vão para os administradores globais e
          do módulo todos os dias às 07:00 (BRT), além do envio manual.
        </div>
      </div>

      <CmdbFormDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
      <CmdbDetailsSheet
        open={!!detail}
        onOpenChange={(v) => !v && setDetail(null)}
        ativo={detail}
        status={detail ? displayStatus(detail) : "Inativo"}
        siem={detail ? isInSiem(detail) : false}
        zabbix={detail ? zabbixState(detail) : "off"}
        siemStale={siemCoverageStale}
        zabbixDivergence={detail ? zabbixHostnameDivergence(detail) : null}
        onEdit={openEdit}
        onDelete={handleDelete}
        canEdit={canEdit}
        canDelete={canDelete}
      />
      <Dialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <DialogContent
          className="font-ui sm:max-w-md"
          style={{
            background: "var(--v2-surface)",
            border: "1px solid var(--v2-line-strong)",
            color: "var(--v2-fg)",
          }}
        >
          <DialogHeader>
            <DialogTitle style={{ fontSize: 16, fontWeight: 600 }}>Excluir ativo?</DialogTitle>
          </DialogHeader>
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--v2-fg-2)", lineHeight: 1.55 }}>
            O ativo <b style={{ color: "var(--v2-fg)" }}>{confirmDel?.nome}</b> será removido do
            CMDB. Não dá para desfazer.
          </p>
          <DialogFooter style={{ gap: 8 }}>
            <button
              className="cm-btn ghost"
              onClick={() => setConfirmDel(null)}
              disabled={del.isPending}
            >
              Cancelar
            </button>
            <button
              className="cm-btn danger"
              disabled={del.isPending}
              onClick={() => confirmDel && del.mutate(confirmDel.id)}
            >
              {del.isPending && <Loader2 size={13} className="cm-spin" />} Excluir
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
