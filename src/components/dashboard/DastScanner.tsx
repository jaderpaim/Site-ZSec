import { SyncActions } from "@/components/layout/SyncActions";
import { ModuleLoading } from "@/components/layout/ModuleLoading";
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Radar,
  Loader2,
  Lock,
  Plus,
  RefreshCw,
  Ban,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Download,
  CalendarClock,
  Trash2,
  Play,
  Pause,
  KeyRound,
  AlertTriangle,
  Triangle,
  Diamond,
  Square,
  Circle,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogTrigger,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";

import {
  getDastAccess,
  getDastOverview,
  listDastScans,
  startDastScan,
  retestDastVuln,
  listDastVulns,
  listDastOutOfScopeHosts,
  cancelDastScan,
  setDastVulnStatus,
  getDastAlerts,
  listDastRetests,
  listDastSchedules,
  upsertDastSchedule,
  toggleDastSchedule,
  deleteDastSchedule,
  exportDastReport,
  listDastAssets,
  deleteDastScan,
  deleteDastAsset,
  startDastDiscovery,
  startDastDiscoveryFromCloudflare,
  saveDastAdLdapCredential,
  getDastAdLdapCredentialStatus,
  listDastAuthCredentialsFn,
  saveDastAuthCredentialFn,
  deleteDastAuthCredentialFn,
  startInternalAppsDiscovery,
  getInternalAppsCandidates,
  confirmInternalApps,
  type DastOverview,
} from "@/lib/dast.functions";
import { listCloudflareZones } from "@/lib/cloudflare.functions";
import { Checkbox } from "@/components/ui/checkbox";

// ── Design Tokens ──────────────────────────────────────────────────────────────
const T = {
  surface: "var(--v2-surface)",
  surfaceAlt: "var(--v2-surface-2)",
  border: "var(--v2-line)",
  borderHi: "var(--v2-line-strong)",
  accent: "var(--v2-accent)",
  accentBg: "color-mix(in oklch, var(--v2-accent) 14%, transparent)",
  critical: "var(--v2-crit)",
  high: "var(--v2-high)",
  medium: "var(--v2-med)",
  low: "var(--v2-low)",
  info: "var(--v2-fg-3)",
  success: "var(--v2-ok)",
  textPrimary: "var(--v2-fg)",
  textSecondary: "var(--v2-fg-2)",
  textMuted: "var(--v2-fg-3)",
  textSubtle: "var(--v2-fg-3)",
  chartGrid: "var(--v2-line)",
  chartAxis: "var(--v2-line)",
  chartTick: "var(--v2-fg-3)",
};

const SEV_COLOR: Record<string, string> = {
  critical: T.critical,
  high: T.high,
  medium: T.medium,
  low: T.low,
  info: T.info,
};
const SEV_ICON: Record<
  string,
  React.ComponentType<{ size?: number; fill?: string; strokeWidth?: number }>
> = {
  critical: Triangle,
  high: Diamond,
  medium: Square,
  low: Circle,
};
const SEV_LABEL: Record<string, string> = {
  critical: "Crítico",
  high: "Alto",
  medium: "Médio",
  low: "Baixo",
  info: "Info",
};
const STATUS_LABEL: Record<string, string> = {
  queued: "Na fila",
  running: "Em execução",
  done: "Concluído",
  error: "Falhou",
  cancelled: "Cancelado",
};
const VULN_STATUS: Record<string, [string, string]> = {
  open: ["Aberta", T.critical],
  resolved: ["Resolvida", T.success],
  false_positive: ["Falso positivo", T.textMuted],
  accepted: ["Risco aceito", T.medium],
};
const MODE_LABEL: Record<string, string> = {
  url: "URL avulsa",
  bulk: "Lista de alvos",
  domain: "Domínio",
  full: "Completo",
  ativos: "Ativos descobertos",
  network_discovery: "Rede interna",
  cloudflare_dns: "Cloudflare DNS",
  internal_apps: "Apps internas",
};
const LEVEL_LABEL: Record<string, string> = {
  basic: "Básico",
  intermediate: "Intermediário",
  advanced: "Avançado",
};
const STATUS_TONE: Record<string, string> = {
  queued: T.textMuted,
  running: T.accent,
  done: T.success,
  error: T.critical,
  cancelled: T.textMuted,
};
const ENGINES = ["zap", "nuclei", "amass", "nmap", "nikto"] as const;
// Amass fica de fora do "Novo scan" -- ele é uma operação de descoberta à
// parte (igual a descoberta de rede), não mais combinável num scan de
// vulnerabilidade. Pra achar+escanear subdomínios, primeiro descobre em
// "Ativos Descobertos", depois escolhe o modo "Ativos descobertos" aqui.
const SCAN_ENGINES = ENGINES.filter((e) => e !== "amass");

// Perfis de scan -- presets nomeados no estilo "scan policy" de Nessus/Qualys/
// Burp: cada perfil trava um conjunto fixo de engines pra quem não quer (ou
// não sabe) escolher motor por motor. "Personalizado" libera os checkboxes
// pra escolha manual, igual ao comportamento anterior.
const SCAN_PROFILES: Record<string, { label: string; engines: string[] }> = {
  rapido: { label: "Rápido (triagem)", engines: ["nuclei"] },
  web: { label: "Aplicação Web", engines: ["zap", "nuclei", "nikto"] },
  infra: { label: "Infraestrutura / Rede", engines: ["nmap", "nikto"] },
  completo: { label: "Completo", engines: ["zap", "nuclei", "nmap", "nikto"] },
  personalizado: { label: "Personalizado", engines: [] },
};
const PROFILE_ORDER = ["rapido", "web", "infra", "completo", "personalizado"] as const;

const CSS = `
    .dast-root { font-family:var(--font-ui); color:var(--v2-fg); display:flex; flex-direction:column; gap:20px; font-size:14px; }
    .dast-root * { box-sizing:border-box; }
    .dast-root ::-webkit-scrollbar { width:6px; height:6px; }
    .dast-root ::-webkit-scrollbar-thumb { background:var(--v2-line-strong); border-radius:3px; }
    .dast-root :focus-visible { outline:2px solid var(--v2-accent); outline-offset:2px; }
    @keyframes dast-spin { to { transform:rotate(360deg) } }
    @keyframes dast-pulse { 0%,100%{opacity:1} 50%{opacity:0.35} }
    .dast-spin { animation:dast-spin 0.8s linear infinite; }
    .dast-mono { font-family:var(--font-data); font-size:12.5px; }
    .dast-dim { color:var(--v2-fg-3); }

    .dast-ph { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; }
    .dast-ph-title { font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.2; margin:0; }
    .dast-ph-sub { margin:4px 0 0; font-size:13px; color:var(--v2-fg-3); }
    .dast-ph-actions { display:flex; gap:8px; flex-wrap:wrap; justify-content:flex-end; }
    .dast-subnav { display:flex; gap:2px; padding:4px; background:var(--v2-surface-2); border:1px solid var(--v2-line); border-radius:8px; width:fit-content; max-width:100%; flex-wrap:wrap; }
    .dast-subnav button { display:inline-flex; align-items:center; gap:8px; border:1px solid transparent; background:transparent; padding:6px 14px; border-radius:6px; font:500 13px var(--font-ui); color:var(--v2-fg-3); cursor:pointer; }
    .dast-subnav button:hover { color:var(--v2-fg); background:var(--v2-hover); }
    .dast-subnav button[aria-selected="true"] { background:var(--v2-surface); color:var(--v2-fg); border-color:var(--v2-line); }
    .dast-subnav .n { font:500 12px var(--font-data); color:var(--v2-fg-3); }
    .dast-subnav .live { font:500 11.5px var(--font-data); padding:1px 7px; border-radius:99px; background:color-mix(in oklch, var(--v2-accent) 14%, transparent); color:var(--v2-accent); }
    .dast-state { display:flex; flex-direction:column; align-items:center; gap:10px; padding:48px 24px; text-align:center; background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; }

    .dast-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(150px, 1fr)); background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
    .dast-kpi { position:relative; text-align:left; border:0; background:transparent; padding:16px 18px 14px; display:grid; gap:2px; align-content:start; box-shadow:1px 0 0 var(--v2-line), 0 1px 0 var(--v2-line); color:inherit; font-family:inherit; min-width:0; }
    button.dast-kpi { cursor:pointer; }
    button.dast-kpi:hover, .dast-kpi[aria-pressed="true"] { background:var(--v2-hover); }
    .dast-kpi[aria-pressed="true"]::after { content:""; position:absolute; left:0; right:0; bottom:0; height:2px; background:var(--v2-accent); }
    .dast-kpi-label { font-size:12.5px; color:var(--v2-fg-2); display:flex; align-items:center; gap:6px; }
    .dast-kpi-value { font-size:28px; font-weight:600; letter-spacing:-0.02em; line-height:1.25; font-variant-numeric:tabular-nums; }
    .dast-kpi-foot { font-size:12px; color:var(--v2-fg-3); }

    .dast-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:20px; align-items:stretch; }
    .dast-span-2 { grid-column:span 2; }
    .dast-fit { height:0; min-height:100%; display:flex; flex-direction:column; }
    .dast-fit .dast-panel-body { flex:1; min-height:0; overflow-y:auto; }
    @media (max-width: 1100px) { .dast-grid { grid-template-columns:minmax(0, 1fr); } .dast-span-2 { grid-column:auto; } .dast-fit { height:auto; min-height:0; max-height:440px; } }

    .dast-panel { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; min-width:0; }
    .dast-panel-hdr { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:14px 18px; border-bottom:1px solid var(--v2-line); flex-wrap:wrap; }
    .dast-panel-hdr.plain { border-bottom:0; padding-bottom:4px; align-items:flex-start; }
    .dast-panel-title { display:flex; align-items:center; gap:6px; font-size:14px; font-weight:600; color:var(--v2-fg); margin:0; }
    .dast-panel-title > svg { display:none; }
    .dast-panel-title .n { font-weight:400; font-size:13px; color:var(--v2-fg-3); }
    .dast-panel-sub { margin:2px 0 0; font-size:12.5px; color:var(--v2-fg-3); }
    .dast-panel-body { padding:12px 18px 16px; }

    .dast-table { width:100%; border-collapse:collapse; font-size:13px; }
    .dast-table thead { position:sticky; top:0; z-index:1; }
    .dast-table th { padding:9px 12px; font-size:12px; font-weight:500; color:var(--v2-fg-3); text-align:left; background:var(--v2-surface); border-bottom:1px solid var(--v2-line); white-space:nowrap; }
    .dast-table td { padding:8px 12px; height:48px; border-bottom:1px solid var(--v2-line); color:var(--v2-fg); vertical-align:middle; }
    .dast-table th:first-child, .dast-table td:first-child { padding-left:18px; }
    .dast-table th:last-child, .dast-table td:last-child { padding-right:18px; }
    .dast-table tbody tr:hover td { background:var(--v2-hover); }
    .dast-table tbody tr:last-child td { border-bottom:none; }
    .dast-table td.nm b { display:block; font-weight:500; }
    .dast-table td.nm small { display:block; font:400 12px var(--font-data); color:var(--v2-fg-3); max-width:300px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

    .dast-badge { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; white-space:nowrap; font-family:var(--font-ui); }
    .dast-st { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; white-space:nowrap; background:color-mix(in oklch, var(--c) 14%, transparent); color:color-mix(in oklch, var(--c) 72%, var(--v2-fg)); }
    .dast-st::before { content:""; width:6px; height:6px; border-radius:50%; background:var(--c); }
    .dast-st.live::before { animation:dast-pulse 1.6s infinite; }
    @media (prefers-reduced-motion: reduce) { .dast-st.live::before { animation:none; } }
    .dast-tag { display:inline-flex; align-items:center; height:22px; padding:0 7px; border-radius:5px; background:var(--v2-surface-2); border:1px solid var(--v2-line); font:400 11.5px var(--font-data); color:var(--v2-fg-2); white-space:nowrap; }
    .dast-tags { display:flex; gap:4px; flex-wrap:wrap; }
    .dast-progress { display:grid; grid-template-columns:minmax(60px, 1fr) 38px; gap:8px; align-items:center; font:500 12px var(--font-data); min-width:120px; }

    .dast-btn { display:inline-flex; align-items:center; gap:7px; height:32px; padding:0 12px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; font-family:var(--font-ui); white-space:nowrap; border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-fg); }
    .dast-btn:disabled { opacity:0.45; cursor:not-allowed; }
    .dast-btn:hover:not(:disabled) { background:var(--v2-hover); }
    .dast-btn.lg { height:34px; padding:0 14px; }
    .dast-btn.pri { background:var(--v2-accent); border-color:var(--v2-accent); color:var(--v2-accent-ink); }
    .dast-btn.pri:hover:not(:disabled) { background:var(--v2-accent); filter:brightness(1.08); }
    .dast-btn.gst { background:var(--v2-surface); }
    .dast-btn.dng { background:transparent; border-color:transparent; color:var(--v2-fg-2); padding:0 8px; }
    .dast-btn.dng:hover:not(:disabled) { color:var(--v2-crit); background:color-mix(in oklch, var(--v2-crit) 12%, transparent); }
    .dast-empty { padding:32px 16px; text-align:center; color:var(--v2-fg-3); font-size:13px; }

    .dast-field { display:flex; flex-direction:column; gap:6px; font-family:var(--font-ui); }
    .dast-field-lbl { font-size:12.5px; font-weight:500; color:var(--v2-fg-2); }
    .dast-input { width:100%; height:34px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg); font-size:13px; font-family:var(--font-ui); outline:none; }
    textarea.dast-input { height:auto; padding:8px 10px; }
    .dast-input:focus { border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }
    .dast-eng { display:flex; flex-wrap:wrap; gap:6px; }
    .dast-eng-btn { height:30px; padding:0 12px; border-radius:8px; border:1px solid var(--v2-line); background:var(--v2-bg); color:var(--v2-fg-2); font:500 12.5px var(--font-data); cursor:pointer; }
    .dast-eng-btn.on { border-color:var(--v2-accent); background:color-mix(in oklch, var(--v2-accent) 14%, transparent); color:var(--v2-fg); }
    .dast-eng-btn.locked { cursor:default; opacity:0.85; }
    .dast-eng-btn.locked:not(.on) { opacity:0.4; }
    .dast-prog { height:6px; border-radius:99px; background:var(--v2-surface-2); overflow:hidden; }
    .dast-prog > i { display:block; height:100%; background:var(--v2-accent); border-radius:99px; transition:width 0.5s ease; }
    .dast-pill { height:28px; padding:0 11px; border-radius:6px; border:1px solid transparent; background:transparent; color:var(--v2-fg-2); font:500 12.5px var(--font-ui); cursor:pointer; }
    .dast-pill:hover { background:var(--v2-hover); color:var(--v2-fg); }
    .dast-pill.on { background:var(--v2-surface-2); border-color:var(--v2-line); color:var(--v2-fg); }
    .dast-segs { display:inline-flex; gap:2px; padding:3px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); flex-wrap:wrap; }

    .dast-acc { border-bottom:1px solid var(--v2-line); }
    .dast-acc:last-child { border-bottom:0; }
    .dast-acc-hd { display:flex; align-items:center; gap:12px; padding:10px 18px; cursor:pointer; font-size:13px; }
    .dast-acc-hd:hover { background:var(--v2-hover); }
    .dast-acc-bd { padding:6px 18px 18px 44px; font-size:13px; line-height:1.55; color:var(--v2-fg-2); display:flex; flex-direction:column; gap:12px; }
    .dast-acc-bd .dast-field-lbl { font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:.06em; color:var(--v2-fg-3); }
    .dast-code { background:var(--v2-bg); border:1px solid var(--v2-line); border-radius:6px; padding:8px 10px; font-family:var(--font-data); font-size:12px; color:var(--v2-fg); word-break:break-all; }
    .dast-code.scroll { max-height:260px; overflow:auto; white-space:pre-wrap; margin:0; }
    .dast-alert { display:grid; grid-template-columns:auto minmax(0, 1fr) auto; gap:4px 10px; align-items:center; padding:10px 0; border-bottom:1px solid var(--v2-line); }
    .dast-alert:last-child { border-bottom:0; }
    .dast-alert b { display:block; font-size:13px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .dast-alert small { display:block; font:400 12px var(--font-data); color:var(--v2-fg-3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .dast-run { display:grid; grid-template-columns:minmax(0, 1fr) auto; gap:8px 14px; align-items:center; padding:12px 14px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-surface-2); }
    .dast-run + .dast-run { margin-top:10px; }
    .dast-run b { font-weight:600; font-size:13.5px; }
    .dast-run small { display:block; font:400 12px var(--font-data); color:var(--v2-fg-3); margin-top:2px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .dast-run .dast-progress { grid-column:1 / -1; }
    .dast-run .dast-prog { height:8px; }
    .dast-feed > div { display:grid; grid-template-columns:84px minmax(0, 1fr) auto; gap:10px; align-items:center; padding:9px 0; border-bottom:1px solid var(--v2-line); }
    .dast-feed > div:last-child { border-bottom:0; }
    .dast-feed b { display:block; font-weight:500; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .dast-feed small { display:block; font-size:12px; color:var(--v2-fg-3); }
    .dast-feed .t { font:400 12px var(--font-data); color:var(--v2-fg-3); white-space:nowrap; }
  `;

function fmtRel(iso: string | null): string {
  if (!iso) return "—";
  const diff = Math.max(0, Date.now() - new Date(iso).getTime());
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}

// Duração só é conhecida quando o scan já terminou (started_at + finished_at
// presentes) -- enquanto está queued/running, o progresso já mostra o
// andamento, então aqui mostra "—" em vez de um cronômetro em tempo real.
function fmtDuration(startIso: string | null, endIso: string | null): string {
  if (!startIso || !endIso) return "—";
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min ${s}s`;
  return `${s}s`;
}

// Um scan de descoberta (Amass externo, rede interna, ou pull de zona
// Cloudflare) não é um "scan" de vulnerabilidade -- nunca gera
// dast_vulnerabilities, então não faz sentido aparecer misturado no quadro
// de Scans do Dashboard nem no seletor de "Vulnerabilidades do scan" em
// Acompanhamento. Fica isolado no quadro próprio dentro de Ativos
// Descobertos.
function isDiscoveryScan(s: any): boolean {
  return (
    s.mode === "network_discovery" ||
    s.mode === "cloudflare_dns" ||
    s.mode === "internal_apps" ||
    (s.mode === "domain" && (s.engines ?? []).length === 1 && s.engines[0] === "amass")
  );
}

// Coluna "Alvo" da tabela de scans -- scan "bulk" com vários domínios
// mostrava só o primeiro (target_url), enganoso (parecia scan de 1 alvo
// só). A lista completa já existe em config.targets desde sempre (ver
// startDastScan em dast.functions.ts), só não estava sendo trazida no
// select nem exibida -- não precisou de nenhuma mudança de schema.
function TargetsCell({ scan }: { scan: any }) {
  const [open, setOpen] = React.useState(false);
  const targets: string[] = Array.isArray(scan.config?.targets) ? scan.config.targets : [];
  const fallback = scan.target_url ?? scan.domain ?? "—";

  if (targets.length <= 1) {
    return (
      <span
        style={{
          display: "inline-block",
          color: T.textSecondary,
          fontSize: 11,
          maxWidth: 220,
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          verticalAlign: "middle",
        }}
        title={fallback}
      >
        {fallback}
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        style={{
          color: T.accent,
          fontSize: 11,
          fontWeight: 600,
          background: "none",
          border: "none",
          padding: 0,
          cursor: "pointer",
          textDecoration: "underline",
          textUnderlineOffset: 2,
        }}
      >
        {targets.length} alvos
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          style={{
            background: T.surface,
            border: `1px solid ${T.borderHi}`,
            borderRadius: 12,
            maxWidth: 520,
          }}
        >
          <DialogHeader>
            <DialogTitle
              style={{ fontFamily: "var(--font-ui)", fontSize: 15, color: T.textPrimary }}
            >
              Alvos deste scan ({targets.length})
            </DialogTitle>
          </DialogHeader>
          <div
            style={{
              maxHeight: 360,
              overflowY: "auto",
              display: "flex",
              flexDirection: "column",
              gap: 2,
              border: `1px solid ${T.border}`,
              borderRadius: 8,
              padding: 8,
            }}
          >
            {targets.map((t, i) => (
              <div
                key={i}
                style={{
                  fontFamily: "var(--font-data)",
                  fontSize: 12,
                  color: T.textPrimary,
                  padding: "5px 8px",
                  wordBreak: "break-all",
                  borderBottom: i < targets.length - 1 ? `1px solid ${T.border}` : "none",
                }}
              >
                {t}
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SevBadge({ severity }: { severity: string | null }) {
  const s = severity ?? "info";
  const c = SEV_COLOR[s] ?? T.info;
  const Icon = SEV_ICON[s] ?? Circle;
  return (
    <span
      className="dast-badge"
      style={{
        background: `color-mix(in oklch, ${c} 14%, transparent)`,
        color: `color-mix(in oklch, ${c} 72%, var(--v2-fg))`,
      }}
    >
      <span style={{ color: c, display: "grid" }}>
        <Icon size={10} fill="currentColor" strokeWidth={0} />
      </span>
      {SEV_LABEL[s] ?? s}
    </span>
  );
}

function SevIcon({ severity }: { severity: string }) {
  const Icon = SEV_ICON[severity] ?? Circle;
  return (
    <span style={{ color: SEV_COLOR[severity] ?? T.info, display: "grid" }}>
      <Icon size={10} fill="currentColor" strokeWidth={0} />
    </span>
  );
}

function StatusPill({ label, color, live }: { label: string; color: string; live?: boolean }) {
  return (
    <span
      className={`dast-st${live ? " live" : ""}`}
      style={{ "--c": color } as React.CSSProperties}
    >
      {label}
    </span>
  );
}

// ── Dialog de novo scan ─────────────────────────────────────────────────────────
function NewScanDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const startFn = useServerFn(startDastScan);
  const fetchAssets = useServerFn(listDastAssets);
  const [name, setName] = React.useState("");
  const [environment, setEnvironment] = React.useState<"prod" | "homolog" | "dev" | "outro">(
    "outro",
  );
  // "Modo" só decide de onde vêm os alvos -- URL avulsa (um alvo) ou Lista
  // (vários, digitados e/ou puxados de Ativos Descobertos). Não tem mais
  // "bulk"/"full"/"ativos" como modos separados: eram só formas diferentes
  // de preencher a mesma lista, então virou tudo uma coisa só aqui embaixo.
  const [mode, setMode] = React.useState<"url" | "lista">("url");
  const [profile, setProfile] = React.useState<keyof typeof SCAN_PROFILES>("web");
  const [level, setLevel] = React.useState<"basic" | "intermediate" | "advanced">("basic");
  const [engines, setEngines] = React.useState<string[]>(SCAN_PROFILES.web.engines);
  const [urlValue, setUrlValue] = React.useState("");
  const [targets, setTargets] = React.useState("");
  // Antes disso, um scan virava autenticado (white box) silenciosamente
  // sempre que existia credencial cadastrada pro domínio -- sem escolha
  // nenhuma por scan. Default "blackbox": autenticação passa a ser opt-in
  // explícito (ver StartSchema.authMode em dast.functions.ts).
  const [authMode, setAuthMode] = React.useState<"blackbox" | "whitebox">("blackbox");
  const [assetScope, setAssetScope] = React.useState<"all" | "external" | "internal">("all");
  const [assetSearch, setAssetSearch] = React.useState("");

  // Perfil trava as engines (preset); só em "Personalizado" o usuário edita.
  React.useEffect(() => {
    if (profile !== "personalizado") setEngines(SCAN_PROFILES[profile].engines);
  }, [profile]);

  const assetsQuery = useQuery({
    queryKey: ["dast-assets", assetScope],
    queryFn: () => fetchAssets({ data: { scope: assetScope } }),
    enabled: open && mode === "lista",
  });
  const uniqueAssets = React.useMemo(() => {
    const map = new Map<string, any>();
    for (const a of (assetsQuery.data?.assets ?? []) as any[])
      if (!map.has(a.subdomain)) map.set(a.subdomain, a);
    return [...map.values()];
  }, [assetsQuery.data]);
  const filteredAssets = React.useMemo(() => {
    const q = assetSearch.trim().toLowerCase();
    if (!q) return uniqueAssets;
    return uniqueAssets.filter(
      (a: any) => a.subdomain.toLowerCase().includes(q) || getRootDomain(a.subdomain).includes(q),
    );
  }, [uniqueAssets, assetSearch]);
  const targetLines = React.useMemo(
    () =>
      targets
        .split(/\r?\n/)
        .map((t) => t.trim())
        .filter(Boolean),
    [targets],
  );

  function toggleAssetLine(subdomain: string) {
    setTargets((prev) => {
      const lines = prev
        .split(/\r?\n/)
        .map((t) => t.trim())
        .filter(Boolean);
      const next = lines.includes(subdomain)
        ? lines.filter((l) => l !== subdomain)
        : [...lines, subdomain];
      return next.join("\n");
    });
  }
  function selectAllFiltered() {
    const toAdd = filteredAssets
      .map((a: any) => a.subdomain)
      .filter((s) => !targetLines.includes(s));
    if (toAdd.length) setTargets([...targetLines, ...toAdd].join("\n"));
  }

  React.useEffect(() => {
    if (open) {
      setName("");
      setEnvironment("outro");
      setMode("url");
      setProfile("web");
      setLevel("basic");
      setEngines(SCAN_PROFILES.web.engines);
      setUrlValue("");
      setTargets("");
      setAssetScope("all");
      setAssetSearch("");
      setAuthMode("blackbox");
    }
  }, [open]);

  const targetList = mode === "url" ? (urlValue.trim() ? [urlValue.trim()] : []) : targetLines;

  const save = useMutation({
    mutationFn: () =>
      startFn({
        data: {
          name: name.trim() || null,
          environment,
          mode: mode === "url" ? "url" : "bulk",
          level,
          engines: engines as ("zap" | "nuclei" | "amass" | "nmap" | "nikto")[],
          targets: targetList,
          authMode,
        },
      }),
    onSuccess: () => {
      toast.success("Scan iniciado");
      qc.invalidateQueries({ queryKey: ["dast-scans"] });
      qc.invalidateQueries({ queryKey: ["dast-overview"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const valid = targetList.length > 0 && engines.length > 0;
  const selStyle = {
    background: T.surfaceAlt,
    borderColor: T.border,
    color: T.textPrimary,
    fontSize: 12,
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{
          background: T.surface,
          border: `1px solid ${T.borderHi}`,
          borderRadius: 12,
          maxHeight: "85vh",
          overflowY: "auto",
        }}
      >
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "var(--font-ui)", fontSize: 15, color: T.textPrimary }}>
            Novo scan DAST
          </DialogTitle>
        </DialogHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 8 }}>
          <div className="dast-field">
            <span className="dast-field-lbl">Nome</span>
            <input
              className="dast-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              placeholder="Ex.: Scan portal — julho"
            />
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1fr)",
              gap: 10,
            }}
          >
            <div className="dast-field">
              <span className="dast-field-lbl">Ambiente</span>
              <Select value={environment} onValueChange={(v) => setEnvironment(v as any)}>
                <SelectTrigger style={selStyle}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="prod">Produção</SelectItem>
                  <SelectItem value="homolog">Homologação</SelectItem>
                  <SelectItem value="dev">Desenvolvimento</SelectItem>
                  <SelectItem value="outro">Outro</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="dast-field">
              <span className="dast-field-lbl">Modo</span>
              <Select value={mode} onValueChange={(v) => setMode(v as any)}>
                <SelectTrigger style={selStyle}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="url">URL avulsa</SelectItem>
                  <SelectItem value="lista">Lista de alvos</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="dast-field">
              <span className="dast-field-lbl">Nível</span>
              <Select value={level} onValueChange={(v) => setLevel(v as any)}>
                <SelectTrigger style={selStyle}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">Básico (passivo)</SelectItem>
                  <SelectItem value="intermediate">Intermediário</SelectItem>
                  <SelectItem value="advanced">Avançado controlado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "minmax(0, 1fr)",
              gap: 10,
            }}
          >
            <div className="dast-field">
              <span className="dast-field-lbl">Tipo de teste</span>
              <Select value={authMode} onValueChange={(v) => setAuthMode(v as any)}>
                <SelectTrigger style={selStyle}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="blackbox">Black box (sem autenticação)</SelectItem>
                  <SelectItem value="whitebox">White box (autenticado)</SelectItem>
                </SelectContent>
              </Select>
              {authMode === "whitebox" && (
                <span className="dast-field-helper" style={{ fontSize: 10, color: T.textSubtle }}>
                  Exige credencial cadastrada pro domínio (botão "Scan autenticado") e engine ZAP
                  habilitada.
                </span>
              )}
            </div>
          </div>
          <div className="dast-field">
            <span className="dast-field-lbl">Perfil de scan</span>
            <Select value={profile} onValueChange={(v) => setProfile(v as any)}>
              <SelectTrigger style={selStyle}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PROFILE_ORDER.map((p) => (
                  <SelectItem key={p} value={p}>
                    {SCAN_PROFILES[p].label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="dast-field">
            <span className="dast-field-lbl">
              Engines{" "}
              {profile !== "personalizado" && (
                <span style={{ color: T.textSubtle }}>(definidos pelo perfil)</span>
              )}
            </span>
            <div className="dast-eng">
              {SCAN_ENGINES.map((e) => {
                const locked = profile !== "personalizado";
                return (
                  <button
                    key={e}
                    type="button"
                    disabled={locked}
                    className={`dast-eng-btn ${engines.includes(e) ? "on" : ""} ${locked ? "locked" : ""}`}
                    onClick={() =>
                      setEngines((prev) =>
                        prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e],
                      )
                    }
                  >
                    {e.toUpperCase()}
                  </button>
                );
              })}
            </div>
            <span className="dast-field-helper" style={{ fontSize: 10, color: T.textSubtle }}>
              Amass não aparece aqui — descoberta de subdomínio agora é feita à parte, em "Ativos
              Descobertos".
            </span>
          </div>
          {mode === "url" ? (
            <div className="dast-field">
              <span className="dast-field-lbl">URL</span>
              <input
                className="dast-input"
                value={urlValue}
                onChange={(e) => setUrlValue(e.target.value)}
                placeholder="https://exemplo.com.br"
              />
            </div>
          ) : (
            <>
              <div className="dast-field">
                <span className="dast-field-lbl">Alvos (um por linha)</span>
                <Textarea
                  value={targets}
                  onChange={(e) => setTargets(e.target.value)}
                  rows={4}
                  placeholder="https://exemplo.com.br"
                />
              </div>
              <div className="dast-field">
                <span className="dast-field-lbl">Adicionar de Ativos Descobertos</span>
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  {(["all", "external", "internal"] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      className={`dast-pill ${assetScope === s ? "on" : ""}`}
                      onClick={() => setAssetScope(s)}
                    >
                      {s === "all" ? "Todos" : s === "external" ? "Externo" : "Interno"}
                    </button>
                  ))}
                  <span
                    style={{
                      marginLeft: "auto",
                      fontSize: 11,
                      color: T.textMuted,
                      alignSelf: "center",
                    }}
                  >
                    {targetLines.length} alvo(s) na lista
                  </span>
                </div>
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  <input
                    className="dast-input"
                    style={{ flex: 1, minWidth: 0 }}
                    value={assetSearch}
                    onChange={(e) => setAssetSearch(e.target.value)}
                    placeholder="Filtrar por domínio (ex.: empresa.com.br)"
                  />
                  <button
                    type="button"
                    className="dast-btn gst"
                    style={{ flexShrink: 0 }}
                    disabled={filteredAssets.length === 0}
                    onClick={selectAllFiltered}
                  >
                    Adicionar todos {assetSearch.trim() ? "(filtrados)" : ""}
                  </button>
                </div>
                <div
                  style={{
                    maxHeight: 220,
                    overflowY: "auto",
                    overflowX: "hidden",
                    border: `1px solid ${T.border}`,
                    borderRadius: 8,
                    padding: 8,
                    display: "flex",
                    flexDirection: "column",
                    gap: 4,
                  }}
                >
                  {assetsQuery.isLoading ? (
                    <div className="dast-empty">Carregando…</div>
                  ) : filteredAssets.length === 0 ? (
                    <div className="dast-empty">
                      {uniqueAssets.length === 0
                        ? 'Nenhum ativo descoberto ainda pra esse escopo — rode uma descoberta em "Ativos Descobertos" primeiro.'
                        : "Nenhum ativo bate com esse filtro."}
                    </div>
                  ) : (
                    filteredAssets.map((a: any) => (
                      <label
                        key={a.subdomain}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 8,
                          fontSize: 12,
                          padding: "4px 6px",
                          cursor: "pointer",
                          minWidth: 0,
                        }}
                      >
                        <input
                          type="checkbox"
                          checked={targetLines.includes(a.subdomain)}
                          style={{ flexShrink: 0 }}
                          onChange={() => toggleAssetLine(a.subdomain)}
                        />
                        <span
                          title={a.subdomain}
                          style={{
                            fontFamily: "var(--font-data)",
                            flex: 1,
                            minWidth: 0,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {a.subdomain}
                        </span>
                        <span
                          className="dast-badge"
                          style={{
                            flexShrink: 0,
                            background:
                              a.scope === "internal"
                                ? `color-mix(in oklch, ${T.low} 13%, transparent)`
                                : `color-mix(in oklch, ${T.accent} 13%, transparent)`,
                            color: a.scope === "internal" ? T.low : T.accent,
                          }}
                        >
                          {a.scope === "internal" ? "Interno" : "Externo"}
                        </span>
                      </label>
                    ))
                  )}
                </div>
              </div>
            </>
          )}
        </div>
        <DialogFooter style={{ gap: 8, paddingTop: 8 }}>
          <button
            className="dast-btn gst"
            onClick={() => onOpenChange(false)}
            disabled={save.isPending}
          >
            Cancelar
          </button>
          <button
            className="dast-btn pri"
            disabled={!valid || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? (
              <>
                <Loader2 size={13} className="dast-spin" /> Iniciando…
              </>
            ) : (
              <>
                <Radar size={13} /> Iniciar scan
              </>
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Linha de vulnerabilidade (accordion com detalhe) ─────────────────────────────
function VulnRow({ v, onChanged }: { v: any; onChanged: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [showRaw, setShowRaw] = React.useState(false);
  // Cada ocorrência agrupada (ver group_zap_alerts no scanner) pode ter sua
  // própria requisição/resposta capturada -- expande independente uma da
  // outra, por índice na lista de raw_output.instances.
  const [expandedInstances, setExpandedInstances] = React.useState<Set<number>>(new Set());
  const toggleInstance = (i: number) =>
    setExpandedInstances((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  const retestFn = useServerFn(retestDastVuln);
  const statusFn = useServerFn(setDastVulnStatus);
  const listRetestsFn = useServerFn(listDastRetests);

  const retests = useQuery({
    queryKey: ["dast-retests", v.id],
    queryFn: () => listRetestsFn({ data: { vulnerabilityId: v.id } }),
    enabled: open,
  });

  const retest = useMutation({
    mutationFn: () => retestFn({ data: { vulnerabilityId: v.id } }),
    onSuccess: (r: any) => {
      toast[r?.still_vulnerable ? "warning" : "success"](
        r?.still_vulnerable ? "Ainda vulnerável" : "Retest confirmou correção",
      );
      onChanged();
      retests.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const setStatus = useMutation({
    mutationFn: (status: string) =>
      statusFn({ data: { vulnerabilityId: v.id, status: status as any } }),
    onSuccess: () => {
      toast.success("Status atualizado");
      onChanged();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // raw_output varia por engine -- só o Nuclei traz request/response HTTP
  // completos e o vetor CVSS; ZAP/Nmap/Nikto não têm esses campos.
  const cvssVector = v.raw_output?.info?.classification?.["cvss-metrics"];
  const rawRequest = v.raw_output?.request;
  const rawResponse = v.raw_output?.response;
  const hasTechDetail = Boolean(v.attack_payload || rawRequest || rawResponse);
  // description/remediation são texto fixo por tipo de alerta (ex.: ZAP
  // "Vulnerable JS Library" sempre traz o mesmo texto genérico) -- o que o
  // scanner encontrou de fato (lib/versão, trecho responsável) fica em
  // evidence/otherinfo, que ficavam gravados no banco mas nunca apareciam aqui.
  const otherInfo = v.raw_output?.otherinfo ?? v.raw_output?.other_info;
  // cweid vem só do ZAP (raw_output.cweid) -- referência padrão de mercado,
  // mesmo tratamento que já existe pro CVE (link direto pra definição).
  const cweId = v.raw_output?.cweid;

  return (
    <div className="dast-acc">
      <div className="dast-acc-hd" onClick={() => setOpen((o) => !o)}>
        {open ? (
          <ChevronDown size={14} color={T.textMuted} />
        ) : (
          <ChevronRight size={14} color={T.textMuted} />
        )}
        <SevBadge severity={v.severity} />
        <span
          style={{
            flex: 1,
            fontWeight: 600,
            minWidth: 0,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {v.name}
        </span>
        <span style={{ fontFamily: "var(--font-data)", fontSize: 11, color: T.textMuted }}>
          {v.engine ?? "—"}
        </span>
        {v.cvss_score != null && (
          <span style={{ fontFamily: "var(--font-data)", fontSize: 11 }}>
            CVSS {Number(v.cvss_score)}
          </span>
        )}
        <span style={{ fontSize: 11, color: T.textMuted }}>{fmtRel(v.found_at)}</span>
        <StatusPill
          label={VULN_STATUS[v.status]?.[0] ?? v.status}
          color={VULN_STATUS[v.status]?.[1] ?? T.textMuted}
        />
      </div>
      {open && (
        <div className="dast-acc-bd">
          {v.matched_url && (
            <div>
              <div className="dast-field-lbl" style={{ marginBottom: 4 }}>
                URL afetada
              </div>
              <div className="dast-code">
                {v.http_method ? `${v.http_method} ` : ""}
                {v.matched_url}
                {v.param ? `  (param: ${v.param})` : ""}
              </div>
            </div>
          )}
          {v.description && (
            <div>
              <div className="dast-field-lbl" style={{ marginBottom: 4 }}>
                Descrição
              </div>
              <div>{v.description}</div>
            </div>
          )}
          {v.remediation && (
            <div>
              <div className="dast-field-lbl" style={{ marginBottom: 4 }}>
                Remediação
              </div>
              <div>{v.remediation}</div>
            </div>
          )}
          {(v.evidence || otherInfo) && (
            <div>
              <div className="dast-field-lbl" style={{ marginBottom: 4 }}>
                Evidência
              </div>
              {v.evidence && (
                <pre
                  className="dast-code scroll"
                  style={{ margin: 0, marginBottom: otherInfo ? 6 : 0 }}
                >
                  {v.evidence}
                </pre>
              )}
              {otherInfo && <div style={{ fontSize: 12 }}>{otherInfo}</div>}
            </div>
          )}
          {Array.isArray(v.raw_output?.instances) && v.raw_output.instances.length > 1 && (
            <div>
              <div className="dast-field-lbl" style={{ marginBottom: 4 }}>
                Ocorrências ({v.raw_output.instances.length})
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {v.raw_output.instances.map((inst: any, i: number) => {
                  const hasDetail = Boolean(inst.request || inst.response);
                  const isOpen = expandedInstances.has(i);
                  return (
                    <div key={i}>
                      <div
                        onClick={() => hasDetail && toggleInstance(i)}
                        style={{
                          display: "flex",
                          gap: 6,
                          alignItems: "center",
                          fontSize: 11,
                          fontFamily: "var(--font-data)",
                          color: hasDetail ? T.accent : T.textMuted,
                          cursor: hasDetail ? "pointer" : "default",
                        }}
                        title={
                          hasDetail ? "Ver requisição/resposta bruta desta ocorrência" : undefined
                        }
                      >
                        {hasDetail ? (
                          isOpen ? (
                            <ChevronDown size={10} />
                          ) : (
                            <ChevronRight size={10} />
                          )
                        ) : (
                          <span style={{ width: 10, display: "inline-block" }} />
                        )}
                        <span
                          style={{
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {inst.method ? `${inst.method} ` : ""}
                          {inst.url}
                          {inst.param ? `  (param: ${inst.param})` : ""}
                        </span>
                      </div>
                      {isOpen && hasDetail && (
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            gap: 6,
                            marginLeft: 16,
                            marginTop: 4,
                            marginBottom: 4,
                          }}
                        >
                          {inst.request && (
                            <div>
                              <div style={{ fontSize: 10, color: T.textSubtle, marginBottom: 3 }}>
                                Requisição
                              </div>
                              <pre className="dast-code scroll">{inst.request}</pre>
                            </div>
                          )}
                          {inst.response && (
                            <div>
                              <div style={{ fontSize: 10, color: T.textSubtle, marginBottom: 3 }}>
                                Resposta
                              </div>
                              <pre className="dast-code scroll">{inst.response}</pre>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          {(v.owasp_category || v.cve_id || cweId || cvssVector) && (
            <div
              style={{
                fontSize: 11,
                color: T.textMuted,
                display: "flex",
                flexWrap: "wrap",
                gap: 6,
              }}
            >
              {v.owasp_category && <span>OWASP: {v.owasp_category}</span>}
              {v.cve_id && (
                <a
                  href={`https://nvd.nist.gov/vuln/detail/${encodeURIComponent(v.cve_id)}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: T.accent }}
                >
                  {v.cve_id}
                </a>
              )}
              {cweId && (
                <a
                  href={`https://cwe.mitre.org/data/definitions/${encodeURIComponent(cweId)}.html`}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: T.accent }}
                >
                  CWE-{cweId}
                </a>
              )}
              {cvssVector && <span style={{ fontFamily: "var(--font-data)" }}>{cvssVector}</span>}
            </div>
          )}
          {(v.occurrence_count > 1 || v.reopened_at) && (
            <div style={{ fontSize: 11, color: T.textSubtle }}>
              {v.occurrence_count > 1 &&
                `Visto ${v.occurrence_count}x` +
                  (v.first_seen_at ? ` · desde ${fmtRel(v.first_seen_at)}` : "")}
              {v.reopened_at &&
                (v.occurrence_count > 1 ? " · " : "") + `Reaberto ${fmtRel(v.reopened_at)}`}
            </div>
          )}
          {v.reference && (
            <div>
              <div className="dast-field-lbl" style={{ marginBottom: 4 }}>
                Referência
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {String(v.reference)
                  .split(/\n|;\s*/)
                  .map((r: string) => r.trim())
                  .filter(Boolean)
                  .map((r: string, i: number) =>
                    r.startsWith("http") ? (
                      <a
                        key={i}
                        href={r}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ fontSize: 11, color: T.accent, wordBreak: "break-all" }}
                      >
                        {r}
                      </a>
                    ) : (
                      <span key={i} style={{ fontSize: 11, color: T.textMuted }}>
                        {r}
                      </span>
                    ),
                  )}
              </div>
            </div>
          )}
          {hasTechDetail && (
            <div>
              <div className="dast-field-lbl" style={{ marginBottom: 4 }}>
                Detalhes técnicos
              </div>
              {v.attack_payload && (
                <div style={{ marginBottom: rawRequest || rawResponse ? 8 : 0 }}>
                  <div style={{ fontSize: 10, color: T.textSubtle, marginBottom: 3 }}>
                    {String(v.attack_payload).trim().startsWith("curl")
                      ? "Comando (reprodução)"
                      : "Payload"}
                  </div>
                  <pre className="dast-code scroll" style={{ margin: 0 }}>
                    {v.attack_payload}
                  </pre>
                </div>
              )}
              {(rawRequest || rawResponse) && (
                <>
                  <button
                    type="button"
                    className="dast-btn gst"
                    style={{ marginBottom: showRaw ? 8 : 0 }}
                    onClick={() => setShowRaw((s) => !s)}
                  >
                    {showRaw ? <ChevronDown size={12} /> : <ChevronRight size={12} />} Ver
                    requisição/resposta bruta
                  </button>
                  {showRaw && (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {rawRequest && (
                        <div>
                          <div style={{ fontSize: 10, color: T.textSubtle, marginBottom: 3 }}>
                            Requisição
                          </div>
                          <pre className="dast-code scroll">{rawRequest}</pre>
                        </div>
                      )}
                      {rawResponse && (
                        <div>
                          <div style={{ fontSize: 10, color: T.textSubtle, marginBottom: 3 }}>
                            Resposta
                          </div>
                          <pre className="dast-code scroll">{rawResponse}</pre>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}
          <div>
            <div className="dast-field-lbl" style={{ marginBottom: 4 }}>
              Histórico de retests
            </div>
            {retests.data?.retests?.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                {retests.data.retests.map((r: any) => (
                  <div
                    key={r.id}
                    style={{ fontSize: 11, color: T.textMuted, fontFamily: "var(--font-data)" }}
                  >
                    {fmtRel(r.tested_at)} · {r.result} {r.engine ? `· ${r.engine}` : ""}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 11, color: T.textSubtle }}>Nenhum retest ainda.</div>
            )}
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", paddingTop: 4 }}>
            <button
              className="dast-btn gst"
              disabled={retest.isPending}
              onClick={() => retest.mutate()}
            >
              {retest.isPending ? (
                <Loader2 size={12} className="dast-spin" />
              ) : (
                <RefreshCw size={12} />
              )}{" "}
              Retest
            </button>
            <button
              className="dast-btn gst"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate("resolved")}
            >
              <CheckCircle2 size={12} /> Marcar resolvida
            </button>
            <button
              className="dast-btn gst"
              disabled={setStatus.isPending}
              onClick={() => setStatus.mutate("false_positive")}
            >
              <XCircle size={12} /> Falso positivo
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Aba Acompanhamento ────────────────────────────────────────────────────────────
function AcompanhamentoView({ scanRows }: { scanRows: any[] }) {
  const qc = useQueryClient();
  const cancelFn = useServerFn(cancelDastScan);
  const fetchAlerts = useServerFn(getDastAlerts);
  const fetchVulns = useServerFn(listDastVulns);
  const fetchOutOfScopeHosts = useServerFn(listDastOutOfScopeHosts);
  const retestFn = useServerFn(retestDastVuln);

  const active = scanRows.filter((s) => s.status === "queued" || s.status === "running");
  const vulnScanRows = scanRows.filter((s) => !isDiscoveryScan(s));
  const [scanId, setScanId] = React.useState<string>("");
  const effScan = scanId || vulnScanRows[0]?.id || "";
  const [sevFilter, setSevFilter] = React.useState<string>("all");
  const [statusFilter, setStatusFilter] = React.useState<string>("all");

  const alerts = useQuery({
    queryKey: ["dast-alerts"],
    queryFn: () => fetchAlerts(),
    refetchInterval: 30_000,
  });
  const vulns = useQuery({
    queryKey: ["dast-vulns", effScan],
    queryFn: () => fetchVulns({ data: { scanId: effScan } }),
    enabled: !!effScan,
  });
  const outOfScopeHosts = useQuery({
    queryKey: ["dast-out-of-scope-hosts", effScan],
    queryFn: () => fetchOutOfScopeHosts({ data: { scanId: effScan } }),
    enabled: !!effScan,
  });

  const cancel = useMutation({
    mutationFn: (id: string) => cancelFn({ data: { scanId: id } }),
    onSuccess: () => {
      toast.success("Scan cancelado");
      qc.invalidateQueries({ queryKey: ["dast-scans"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const alertRetest = useMutation({
    mutationFn: (id: string) => retestFn({ data: { vulnerabilityId: id } }),
    onSuccess: (r: any) => {
      toast[r?.still_vulnerable ? "warning" : "success"](
        r?.still_vulnerable ? "Ainda vulnerável" : "Corrigida",
      );
      alerts.refetch();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // "info" (observação/fingerprint, não vulnerabilidade explorável) já
  // vem excluído do listDastVulns -- só aparece no relatório exportado.
  const allVulns = (vulns.data?.vulns ?? []) as any[];
  const vulnTotalCount = allVulns.length;
  const vulnRows = allVulns.filter(
    (v) =>
      (sevFilter === "all" || v.severity === sevFilter) &&
      (statusFilter === "all" || v.status === statusFilter),
  );
  const refetchVulns = () => {
    vulns.refetch();
    alerts.refetch();
    qc.invalidateQueries({ queryKey: ["dast-overview"] });
  };

  return (
    <>
      <div className="dast-grid">
        {/* Scans ativos */}
        <div className="dast-panel dast-span-2">
          <div className="dast-panel-hdr plain">
            <div>
              <h2 className="dast-panel-title">
                Em execução <span className="n">({active.length})</span>
              </h2>
              <p className="dast-panel-sub">Atualiza sozinho a cada 20 segundos</p>
            </div>
          </div>
          <div className="dast-panel-body">
            {active.length ? (
              active.map((s) => (
                <div key={s.id} className="dast-run">
                  <div style={{ minWidth: 0 }}>
                    <b>{s.name ?? s.target_url}</b>
                    <small>
                      {[
                        s.target_url,
                        (s.engines ?? []).join(", "),
                        s.started_at ? `iniciado ${fmtRel(s.started_at)}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </div>
                  <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <StatusPill
                      label={STATUS_LABEL[s.status] ?? s.status}
                      color={STATUS_TONE[s.status] ?? T.textMuted}
                      live={s.status === "running"}
                    />
                    <button
                      className="dast-btn"
                      disabled={cancel.isPending}
                      onClick={() => cancel.mutate(s.id)}
                    >
                      <Ban size={13} /> Cancelar
                    </button>
                  </div>
                  <div className="dast-progress">
                    <div className="dast-prog">
                      <i style={{ width: `${s.progress ?? 0}%` }} />
                    </div>
                    <span>{s.progress ?? 0}%</span>
                  </div>
                </div>
              ))
            ) : (
              <div className="dast-empty">Nenhum scan em execução.</div>
            )}
          </div>
        </div>

        {/* Alertas imediatos */}
        <div className="dast-panel dast-fit">
          <div className="dast-panel-hdr plain">
            <div>
              <h2 className="dast-panel-title">Alertas imediatos</h2>
              <p className="dast-panel-sub">Críticas e altas em aberto</p>
            </div>
          </div>
          <div className="dast-panel-body">
            {alerts.data?.alerts?.length ? (
              alerts.data.alerts.map((a: any) => (
                <div key={a.id} className="dast-alert">
                  <SevBadge severity={a.severity} />
                  <div style={{ minWidth: 0 }}>
                    <b title={a.name}>{a.name}</b>
                    <small>
                      {[
                        a.engine,
                        a.cvss_score != null ? `CVSS ${Number(a.cvss_score)}` : null,
                        fmtRel(a.found_at),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </small>
                  </div>
                  <button
                    className="dast-btn"
                    disabled={alertRetest.isPending}
                    onClick={() => alertRetest.mutate(a.id)}
                    title="Roda o teste de novo só nesta falha"
                  >
                    <RefreshCw size={12} /> Retest
                  </button>
                </div>
              ))
            ) : (
              <div className="dast-empty">
                Sem alertas críticos ou altos em aberto. Médias e baixas entram na lista do scan
                abaixo.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Vulnerabilidades do scan */}
      <div className="dast-panel">
        <div className="dast-panel-hdr">
          <h2 className="dast-panel-title">
            Vulnerabilidades do scan{" "}
            <span className="n">
              (
              {vulnRows.length === vulnTotalCount
                ? vulnTotalCount
                : `${vulnRows.length} de ${vulnTotalCount}`}
              )
            </span>
          </h2>
          <div style={{ minWidth: 260 }}>
            <Select value={effScan} onValueChange={setScanId}>
              <SelectTrigger
                style={{
                  background: T.surfaceAlt,
                  borderColor: T.border,
                  color: T.textPrimary,
                  fontSize: 12,
                }}
              >
                <SelectValue placeholder="Selecione um scan" />
              </SelectTrigger>
              <SelectContent>
                {vulnScanRows.map((s) => (
                  <SelectItem key={s.id} value={s.id}>
                    {(s.name ?? s.target_url ?? s.id) +
                      " · " +
                      (STATUS_LABEL[s.status] ?? s.status)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div>
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              padding: "12px 18px",
              borderBottom: `1px solid ${T.border}`,
            }}
          >
            <div className="dast-segs" role="group" aria-label="Severidade">
              {["all", "critical", "high", "medium", "low"].map((s) => (
                <button
                  key={s}
                  className={`dast-pill ${sevFilter === s ? "on" : ""}`}
                  onClick={() => setSevFilter(s)}
                >
                  {s === "all" ? "Todas" : SEV_LABEL[s]}
                </button>
              ))}
            </div>
            <div className="dast-segs" role="group" aria-label="Status">
              {["all", "open", "resolved", "false_positive"].map((s) => (
                <button
                  key={s}
                  className={`dast-pill ${statusFilter === s ? "on" : ""}`}
                  onClick={() => setStatusFilter(s)}
                >
                  {s === "all"
                    ? "Todos"
                    : s === "open"
                      ? "Abertas"
                      : s === "resolved"
                        ? "Resolvidas"
                        : "Falso positivo"}
                </button>
              ))}
            </div>
          </div>
          {!effScan ? (
            <div className="dast-empty">Nenhum scan disponível.</div>
          ) : vulns.isLoading ? (
            <div className="dast-empty">
              <Loader2 size={14} className="dast-spin" /> Carregando…
            </div>
          ) : vulnRows.length === 0 ? (
            <div className="dast-empty">Nenhuma vulnerabilidade para os filtros selecionados.</div>
          ) : (
            vulnRows.map((v) => <VulnRow key={v.id} v={v} onChanged={refetchVulns} />)
          )}
        </div>
      </div>

      {/* Domínios de terceiro fora do escopo (analytics/tracking/CDN) --
            puramente informativo, não é vulnerabilidade. Ver
            extract_out_of_scope_hosts no main.py do scanner. */}
      {(outOfScopeHosts.data?.hosts ?? []).length > 0 && (
        <div className="dast-panel">
          <div className="dast-panel-hdr">
            <div>
              <h2 className="dast-panel-title">Domínios de terceiros encontrados</h2>
              <p className="dast-panel-sub">
                Fora do escopo do scan (analytics, tracking, CDN): não foram rastreados nem atacados
              </p>
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="dast-table">
              <thead>
                <tr>
                  <th>Domínio</th>
                  <th>Requisições</th>
                  <th>URL de amostra</th>
                </tr>
              </thead>
              <tbody>
                {(outOfScopeHosts.data?.hosts ?? []).map((h: any) => (
                  <tr key={h.id}>
                    <td style={{ fontFamily: "var(--font-data)", fontSize: 11 }}>{h.host}</td>
                    <td style={{ fontFamily: "var(--font-data)", fontSize: 11 }}>
                      {h.request_count}
                    </td>
                    <td
                      style={{
                        fontSize: 11,
                        color: T.textMuted,
                        maxWidth: 420,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={(h.sample_urls ?? []).join("\n")}
                    >
                      {(h.sample_urls ?? [])[0] ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

// ── Exportar relatório ──────────────────────────────────────────────────────────
function downloadFile(filename: string, mime: string, content: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// PDF vem em base64 (bytes binários não trafegam direto numa server function
// do TanStack, que serializa como JSON) -- decodifica pra Blob antes de
// baixar, em vez de tratar como texto igual html/csv/json.
function downloadBase64File(filename: string, mime: string, base64: string) {
  const bin = atob(base64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const blob = new Blob([bytes], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function ExportButtons({ scanId }: { scanId: string }) {
  const exportFn = useServerFn(exportDastReport);
  const [busy, setBusy] = React.useState<string | null>(null);
  const run = async (format: "json" | "csv" | "html" | "pdf") => {
    setBusy(format);
    try {
      const r = await exportFn({ data: { scanId, format } });
      if (format === "pdf") {
        // PDF de verdade, renderizado pelo scanner (Chromium headless) --
        // vem pronto em bytes (base64), baixa direto, sem diálogo de
        // impressão do navegador.
        downloadBase64File(r.filename, r.mime, r.content);
      } else {
        downloadFile(r.filename, r.mime, r.content);
      }
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setBusy(null);
    }
  };
  return (
    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
      {(["pdf", "html", "csv", "json"] as const).map((f) => (
        <button
          key={f}
          className="dast-btn gst"
          style={{ padding: "3px 7px" }}
          disabled={busy !== null}
          onClick={() => run(f)}
        >
          {busy === f ? <Loader2 size={11} className="dast-spin" /> : <Download size={11} />}{" "}
          {f.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

// ── Confirmação de exclusão com o visual do próprio DAST (AlertDialog do
// design system), em vez do confirm() nativo do navegador -- reusado nos 3
// pontos de exclusão do módulo (scan, agendamento, ativo descoberto).
function ConfirmDeleteButton({
  triggerClassName,
  triggerTitle,
  triggerDisabled,
  icon,
  dialogTitle,
  dialogDescription,
  confirmLabel = "Excluir",
  onConfirm,
}: {
  triggerClassName: string;
  triggerTitle?: string;
  triggerDisabled?: boolean;
  icon: React.ReactNode;
  dialogTitle: string;
  dialogDescription: string;
  confirmLabel?: string;
  onConfirm: () => void;
}) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <button className={triggerClassName} title={triggerTitle} disabled={triggerDisabled}>
          {icon}
        </button>
      </AlertDialogTrigger>
      <AlertDialogContent
        style={{
          background: T.surface,
          border: `1px solid ${T.borderHi}`,
          borderRadius: 12,
          maxWidth: 440,
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle
            style={{ fontFamily: "var(--font-ui)", fontSize: 15, color: T.textPrimary }}
          >
            {dialogTitle}
          </AlertDialogTitle>
          <AlertDialogDescription style={{ fontSize: 12.5, color: T.textSecondary }}>
            {dialogDescription}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel asChild>
            <button className="dast-btn gst">Cancelar</button>
          </AlertDialogCancel>
          <AlertDialogAction asChild>
            <button className="dast-btn dng" onClick={onConfirm}>
              {confirmLabel}
            </button>
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// ── Excluir scan (bloqueado em teste/produção pra scans ainda ativos) ───────
function DeleteScanButton({ scanId, status }: { scanId: string; status: string }) {
  const qc = useQueryClient();
  const deleteFn = useServerFn(deleteDastScan);
  const isActive = status === "queued" || status === "running";
  const del = useMutation({
    mutationFn: () => deleteFn({ data: { scanId } }),
    onSuccess: () => {
      toast.success("Scan excluído");
      qc.invalidateQueries({ queryKey: ["dast-scans"] });
      qc.invalidateQueries({ queryKey: ["dast-overview"] });
      qc.invalidateQueries({ queryKey: ["dast-assets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <ConfirmDeleteButton
      triggerClassName="dast-btn dng"
      triggerTitle={isActive ? "Cancele o scan antes de excluir" : "Excluir scan"}
      triggerDisabled={isActive || del.isPending}
      icon={del.isPending ? <Loader2 size={12} className="dast-spin" /> : <Trash2 size={12} />}
      dialogTitle="Excluir scan"
      dialogDescription="Excluir este scan e todas as vulnerabilidades/ativos associados? Essa ação não pode ser desfeita."
      onConfirm={() => del.mutate()}
    />
  );
}

// ── Cancelar scan direto do Dashboard (sem precisar trocar de aba) ───────────
function CancelScanButton({ scanId, status }: { scanId: string; status: string }) {
  const qc = useQueryClient();
  const cancelFn = useServerFn(cancelDastScan);
  const isActive = status === "queued" || status === "running";
  const cancel = useMutation({
    mutationFn: () => cancelFn({ data: { scanId } }),
    onSuccess: () => {
      toast.success("Scan cancelado");
      qc.invalidateQueries({ queryKey: ["dast-scans"] });
      qc.invalidateQueries({ queryKey: ["dast-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  if (!isActive) return null;
  return (
    <button
      className="dast-btn dng"
      title="Cancelar scan"
      disabled={cancel.isPending}
      onClick={() => cancel.mutate()}
    >
      {cancel.isPending ? <Loader2 size={12} className="dast-spin" /> : <Ban size={12} />}
    </button>
  );
}

// ── Dialog de agendamento ─────────────────────────────────────────────────────────
function ScheduleDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const upFn = useServerFn(upsertDastSchedule);
  const [name, setName] = React.useState("");
  const [target, setTarget] = React.useState("");
  const [mode, setMode] = React.useState<"url" | "domain" | "bulk" | "full">("url");
  const [level, setLevel] = React.useState<"basic" | "intermediate" | "advanced">("basic");
  const [engines, setEngines] = React.useState<string[]>(["zap"]);
  const [frequency, setFrequency] = React.useState<"daily" | "weekly" | "monthly">("daily");
  const [runAt, setRunAt] = React.useState("03:00");
  React.useEffect(() => {
    if (open) {
      setName("");
      setTarget("");
      setMode("url");
      setLevel("basic");
      setEngines(["zap"]);
      setFrequency("daily");
      setRunAt("03:00");
    }
  }, [open]);
  const save = useMutation({
    mutationFn: () =>
      upFn({
        data: {
          name: name.trim() || null,
          target_url: target.trim(),
          mode,
          level,
          engines: engines as any,
          frequency,
          run_at_time: runAt,
        },
      }),
    onSuccess: () => {
      toast.success("Agendamento salvo");
      qc.invalidateQueries({ queryKey: ["dast-schedules"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const valid = target.trim().length > 0 && engines.length > 0 && /^\d{2}:\d{2}$/.test(runAt);
  const selStyle = {
    background: T.surfaceAlt,
    borderColor: T.border,
    color: T.textPrimary,
    fontSize: 12,
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{ background: T.surface, border: `1px solid ${T.borderHi}`, borderRadius: 12 }}
      >
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "var(--font-ui)", fontSize: 15, color: T.textPrimary }}>
            Novo agendamento
          </DialogTitle>
        </DialogHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 8 }}>
          <div className="dast-field">
            <span className="dast-field-lbl">Nome</span>
            <input
              className="dast-input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={200}
              placeholder="Ex.: Portal — diário"
            />
          </div>
          <div className="dast-field">
            <span className="dast-field-lbl">Alvo (URL/domínio)</span>
            <input
              className="dast-input"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="https://exemplo.com.br"
            />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div className="dast-field">
              <span className="dast-field-lbl">Modo</span>
              <Select value={mode} onValueChange={(v) => setMode(v as any)}>
                <SelectTrigger style={selStyle}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="url">URL avulsa</SelectItem>
                  <SelectItem value="domain">Domínio</SelectItem>
                  <SelectItem value="full">Completo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="dast-field">
              <span className="dast-field-lbl">Nível</span>
              <Select value={level} onValueChange={(v) => setLevel(v as any)}>
                <SelectTrigger style={selStyle}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">Básico</SelectItem>
                  <SelectItem value="intermediate">Intermediário</SelectItem>
                  <SelectItem value="advanced">Avançado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
            <div className="dast-field">
              <span className="dast-field-lbl">Frequência</span>
              <Select value={frequency} onValueChange={(v) => setFrequency(v as any)}>
                <SelectTrigger style={selStyle}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Diária</SelectItem>
                  <SelectItem value="weekly">Semanal</SelectItem>
                  <SelectItem value="monthly">Mensal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="dast-field">
              <span className="dast-field-lbl">Horário</span>
              <input
                className="dast-input"
                type="time"
                value={runAt}
                onChange={(e) => setRunAt(e.target.value)}
              />
            </div>
          </div>
          <div className="dast-field">
            <span className="dast-field-lbl">Engines</span>
            <div className="dast-eng">
              {ENGINES.map((e) => (
                <button
                  key={e}
                  type="button"
                  className={`dast-eng-btn ${engines.includes(e) ? "on" : ""}`}
                  onClick={() =>
                    setEngines((prev) =>
                      prev.includes(e) ? prev.filter((x) => x !== e) : [...prev, e],
                    )
                  }
                >
                  {e.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter style={{ gap: 8, paddingTop: 8 }}>
          <button
            className="dast-btn gst"
            onClick={() => onOpenChange(false)}
            disabled={save.isPending}
          >
            Cancelar
          </button>
          <button
            className="dast-btn pri"
            disabled={!valid || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? (
              <>
                <Loader2 size={13} className="dast-spin" /> Salvando…
              </>
            ) : (
              "Salvar"
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Aba Agendamentos ────────────────────────────────────────────────────────────
const FREQ_LABEL: Record<string, string> = {
  daily: "Diário",
  weekly: "Semanal",
  monthly: "Mensal",
};
function AgendamentosView() {
  const qc = useQueryClient();
  const listFn = useServerFn(listDastSchedules);
  const toggleFn = useServerFn(toggleDastSchedule);
  const delFn = useServerFn(deleteDastSchedule);
  const [dlgOpen, setDlgOpen] = React.useState(false);
  const q = useQuery({ queryKey: ["dast-schedules"], queryFn: () => listFn() });
  const rows = (q.data?.schedules ?? []) as any[];
  const toggle = useMutation({
    mutationFn: (v: { id: string; active: boolean }) => toggleFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["dast-schedules"] }),
    onError: (e: Error) => toast.error(e.message),
  });
  const del = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Agendamento removido");
      qc.invalidateQueries({ queryKey: ["dast-schedules"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  return (
    <div className="dast-panel">
      <div className="dast-panel-hdr">
        <div className="dast-panel-title">
          <CalendarClock size={11} color={T.accent} /> Agendamentos ({rows.length})
        </div>
        <button className="dast-btn pri" onClick={() => setDlgOpen(true)}>
          <Plus size={13} /> Novo agendamento
        </button>
      </div>
      {rows.length ? (
        <div style={{ overflowX: "auto" }}>
          <table className="dast-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 18 }}>Nome</th>
                <th>Alvo</th>
                <th>Frequência</th>
                <th>Horário</th>
                <th>Próxima</th>
                <th>Engines</th>
                <th>Status</th>
                <th style={{ paddingRight: 18, textAlign: "right" }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id}>
                  <td style={{ paddingLeft: 18, fontWeight: 600 }}>{s.name ?? "—"}</td>
                  <td
                    style={{
                      color: T.textSecondary,
                      fontSize: 11,
                      maxWidth: 200,
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                      whiteSpace: "nowrap",
                    }}
                    title={s.target_url ?? ""}
                  >
                    {s.target_url ?? s.domain}
                  </td>
                  <td style={{ fontFamily: "var(--font-data)", fontSize: 11 }}>
                    {FREQ_LABEL[s.frequency] ?? s.frequency}
                  </td>
                  <td style={{ fontFamily: "var(--font-data)", fontSize: 11 }}>
                    {(s.run_at_time ?? "").slice(0, 5)}
                  </td>
                  <td style={{ fontSize: 11, color: T.textMuted }}>
                    {s.next_run_at ? new Date(s.next_run_at).toLocaleString("pt-BR") : "—"}
                  </td>
                  <td>
                    <div className="dast-tags">
                      {(s.engines ?? []).map((e: string) => (
                        <span key={e} className="dast-tag">
                          {e}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td>
                    <StatusPill
                      label={s.active ? "Ativo" : "Pausado"}
                      color={s.active ? T.success : T.textMuted}
                    />
                  </td>
                  <td style={{ textAlign: "right", paddingRight: 18 }}>
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end" }}>
                      <button
                        className="dast-btn gst"
                        title={s.active ? "Pausar" : "Ativar"}
                        onClick={() => toggle.mutate({ id: s.id, active: !s.active })}
                      >
                        {s.active ? <Pause size={12} /> : <Play size={12} />}
                      </button>
                      <ConfirmDeleteButton
                        triggerClassName="dast-btn dng"
                        triggerTitle="Remover"
                        icon={<Trash2 size={12} />}
                        dialogTitle="Remover agendamento"
                        dialogDescription={`Remover o agendamento "${s.name ?? "sem nome"}"? Essa ação não pode ser desfeita.`}
                        confirmLabel="Remover"
                        onConfirm={() => del.mutate(s.id)}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="dast-empty">Nenhum agendamento. Clique em "Novo agendamento".</div>
      )}
      <ScheduleDialog open={dlgOpen} onOpenChange={setDlgOpen} />
    </div>
  );
}

// Agrupa candidatas de app interna pela "extensão de domínio" (ex.: tudo que
// termina em .bernoulli.com.br vira um grupo, .bernoulli.local outro) --
// cada zona AD-integrada aqui é o FQDN de 1 app (ver comentário no
// main.py/run_ad_ldap_discovery), então "extensão" != TLD puro: pra sufixo
// composto tipo .com.br/.dev.br, o grupo inclui o label antes dele (senão
// bernoulli.com.br e portalmodulo.com.br cairiam juntos só por ".com.br").
const COMPOUND_SUFFIXES = new Set(["com.br", "dev.br", "net.br", "org.br", "gov.br", "edu.br"]);

function domainGroup(fqdn: string): string {
  const parts = fqdn.split(".").filter(Boolean);
  if (parts.length < 2) return fqdn;
  const last2 = parts.slice(-2).join(".").toLowerCase();
  if (parts.length >= 3 && COMPOUND_SUFFIXES.has(last2)) return parts.slice(-3).join(".");
  return parts.slice(-2).join(".");
}

function groupFqdnsByDomain(fqdns: string[]): Array<{ group: string; items: string[] }> {
  const map = new Map<string, string[]>();
  for (const f of fqdns) {
    const g = domainGroup(f);
    if (!map.has(g)) map.set(g, []);
    map.get(g)!.push(f);
  }
  return Array.from(map.entries())
    .map(([group, items]) => ({ group, items: items.sort() }))
    .sort((a, b) => a.group.localeCompare(b.group));
}

// ── Dialog de nova descoberta (Amass externo ou Nmap interno/shadow IT) ──────
function DiscoveryDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const qc = useQueryClient();
  const startFn = useServerFn(startDastDiscovery);
  const startCfFn = useServerFn(startDastDiscoveryFromCloudflare);
  const fetchZones = useServerFn(listCloudflareZones);
  const startInternalFn = useServerFn(startInternalAppsDiscovery);
  const getCandidatesFn = useServerFn(getInternalAppsCandidates);
  const confirmInternalFn = useServerFn(confirmInternalApps);
  const [kind, setKind] = React.useState<"external" | "internal-apps" | "cloudflare">("external");
  const [domain, setDomain] = React.useState("");
  const [zoneId, setZoneId] = React.useState("");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());

  const zonesQuery = useQuery({
    queryKey: ["cloudflare-zones"],
    queryFn: () => fetchZones(),
    enabled: open && kind === "cloudflare",
  });
  const zones = zonesQuery.data?.ok ? zonesQuery.data.zones : [];

  // scanId guardado via qc.setQueryData (não useState puro) -- o cache do
  // TanStack Query vive num nível acima do componente, no QueryClientProvider,
  // e sobrevive a "Ativos Descobertos" sendo desmontada/remontada ao trocar de
  // aba (confirmado: {view === "ativos" && <AtivosDescobertosView/>} remonta o
  // dialog inteiro). Sem isso, trocar de aba durante um scan "running" perdia
  // o scanId e o dialog voltava pra tela inicial de "Buscar zonas".
  const SCAN_ID_KEY = ["dast-internal-apps-scan-id"];
  const [scanId, setScanIdState] = React.useState<string | null>(
    () => qc.getQueryData(SCAN_ID_KEY) ?? null,
  );
  const setScanId = (id: string | null) => {
    setScanIdState(id);
    qc.setQueryData(SCAN_ID_KEY, id);
  };

  // Descoberta agora é assíncrona igual aos demais tipos de scan (fila +
  // callback do FastAPI) -- pra ter "running"/cancelar/excluir e visibilidade
  // de erro sem precisar de uma chamada HTTP bloqueante. Poll a cada 2.5s até
  // status virar done/error; a queryKey inclui o scanId, então o resultado
  // também sobrevive ao remount da aba.
  const candidatesQuery = useQuery({
    queryKey: ["dast-internal-apps-candidates", scanId],
    queryFn: () => getCandidatesFn({ data: { scanId: scanId as string } }),
    enabled: kind === "internal-apps" && !!scanId,
    refetchInterval: (q) =>
      q.state.data?.status === "done" || q.state.data?.status === "error" ? false : 2500,
  });
  const scanStatus = candidatesQuery.data?.status ?? null;
  const fqdns = scanStatus === "done" ? (candidatesQuery.data?.fqdns ?? []) : null;
  const groupedFqdns = React.useMemo(() => groupFqdnsByDomain(fqdns ?? []), [fqdns]);

  // Marca tudo de novo sempre que a lista de candidatas chega (busca nova ou
  // rehidratada do cache após remount) -- usuário desmarca o que não quer.
  React.useEffect(() => {
    if (scanStatus === "done" && candidatesQuery.data?.fqdns)
      setSelected(new Set(candidatesQuery.data.fqdns));
  }, [scanStatus, candidatesQuery.data]);

  const startInternal = useMutation({
    mutationFn: () => startInternalFn(),
    onSuccess: (r: { scanId: string }) => {
      setScanId(r.scanId);
      qc.invalidateQueries({ queryKey: ["dast-scans"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const resetInternal = () => {
    if (scanId) qc.removeQueries({ queryKey: ["dast-internal-apps-candidates", scanId] });
    setScanId(null);
    setSelected(new Set());
  };

  // Reset só acontece quando uma ação TERMINA de verdade (ver onSuccess de
  // cada mutation abaixo) -- não a cada abertura do dialog. Antes zerava tudo
  // (inclusive a lista já buscada em "Interno") só por fechar sem querer
  // (clique fora) e reabrir, perdendo a busca/seleção em andamento.

  const save = useMutation({
    mutationFn: () => {
      if (kind === "cloudflare") return startCfFn({ data: { zoneId } });
      return startFn({ data: { kind: "external", domain: domain.trim() } });
    },
    onSuccess: (r: any) => {
      toast.success(
        kind === "cloudflare"
          ? `Descoberta concluída: ${r?.count ?? 0} ativo(s) catalogado(s)`
          : "Descoberta iniciada",
      );
      qc.invalidateQueries({ queryKey: ["dast-scans"] });
      qc.invalidateQueries({ queryKey: ["dast-assets"] });
      qc.invalidateQueries({ queryKey: ["dast-overview"] });
      setDomain("");
      setZoneId("");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const confirmInternal = useMutation({
    mutationFn: () =>
      confirmInternalFn({ data: { scanId: scanId as string, fqdns: [...selected] } }),
    onSuccess: (r) => {
      toast.success(`${r.count} aplicação(ões) adicionada(s) a Ativos Descobertos`);
      qc.invalidateQueries({ queryKey: ["dast-assets"] });
      qc.invalidateQueries({ queryKey: ["dast-scans"] });
      resetInternal();
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const toggleFqdn = (f: string) =>
    setSelected((cur) => {
      const next = new Set(cur);
      if (next.has(f)) next.delete(f);
      else next.add(f);
      return next;
    });

  const setGroupSelected = (items: string[], value: boolean) =>
    setSelected((cur) => {
      const next = new Set(cur);
      for (const f of items) {
        if (value) next.add(f);
        else next.delete(f);
      }
      return next;
    });

  const valid =
    kind === "external"
      ? domain.trim().length > 0
      : kind === "cloudflare"
        ? zoneId.length > 0
        : true;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{
          background: T.surface,
          border: `1px solid ${T.borderHi}`,
          borderRadius: 12,
          maxWidth: 560,
        }}
      >
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "var(--font-ui)", fontSize: 15, color: T.textPrimary }}>
            Nova descoberta
          </DialogTitle>
        </DialogHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 8 }}>
          <div className="dast-field">
            <span className="dast-field-lbl">Tipo</span>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              <button
                type="button"
                className={`dast-pill ${kind === "external" ? "on" : ""}`}
                onClick={() => setKind("external")}
              >
                Externo (domínio → Amass)
              </button>
              <button
                type="button"
                className={`dast-pill ${kind === "internal-apps" ? "on" : ""}`}
                onClick={() => setKind("internal-apps")}
              >
                Interno (aplicação → zona DNS AD)
              </button>
              <button
                type="button"
                className={`dast-pill ${kind === "cloudflare" ? "on" : ""}`}
                onClick={() => setKind("cloudflare")}
              >
                Cloudflare (zona DNS)
              </button>
            </div>
          </div>
          {kind === "external" && (
            <div className="dast-field">
              <span className="dast-field-lbl">Domínio</span>
              <input
                className="dast-input"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="empresa.com.br"
              />
              <span className="dast-field-helper" style={{ fontSize: 10, color: T.textSubtle }}>
                Roda só o Amass (OSINT público) contra esse domínio e cataloga os subdomínios
                encontrados como externos. Não escaneia vulnerabilidades.
              </span>
            </div>
          )}
          {kind === "cloudflare" && (
            <div className="dast-field">
              <span className="dast-field-lbl">Zona</span>
              <Select value={zoneId} onValueChange={setZoneId}>
                <SelectTrigger
                  style={{
                    background: T.surfaceAlt,
                    borderColor: T.border,
                    color: T.textPrimary,
                    fontSize: 12,
                  }}
                >
                  <SelectValue
                    placeholder={zonesQuery.isLoading ? "Carregando…" : "Selecione a zona"}
                  />
                </SelectTrigger>
                <SelectContent>
                  {zones.map((z: any) => (
                    <SelectItem key={z.id} value={z.id}>
                      {z.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="dast-field-helper" style={{ fontSize: 10, color: T.textSubtle }}>
                Puxa direto da API da Cloudflare todos os registros A/AAAA/CNAME da zona — mais
                completo que o Amass pra domínio que sua conta já gerencia (não depende de rastro
                público). Instantâneo, não usa o scanner.
              </span>
            </div>
          )}
          {kind === "internal-apps" &&
            (!scanId ? (
              <div className="dast-field">
                <span
                  className="dast-field-helper"
                  style={{ fontSize: 11, color: T.textSecondary }}
                >
                  Lista as zonas DNS AD-integradas via LDAP (precisa da credencial em "Credencial
                  AD", ao lado de "Nova descoberta"). Acha{" "}
                  <b style={{ color: T.textPrimary }}>aplicação</b> por FQDN vaidade (ex.:
                  gophish.bernoulli.com.br) — diferente de descoberta de dispositivo. Nada é gravado
                  ainda; a próxima tela deixa você escolher quais confirmar.
                </span>
              </div>
            ) : scanStatus === "error" ? (
              <div className="dast-field">
                <span className="dast-field-helper" style={{ fontSize: 11.5, color: T.critical }}>
                  Falha na busca:{" "}
                  {candidatesQuery.data?.error || "erro desconhecido no motor de scan"}. Veja os
                  logs do scanner (journalctl) para detalhes.
                </span>
              </div>
            ) : scanStatus !== "done" ? (
              <div
                className="dast-field"
                style={{ display: "flex", alignItems: "center", gap: 10 }}
              >
                <Loader2 size={16} className="dast-spin" style={{ color: T.textSecondary }} />
                <span style={{ fontSize: 11.5, color: T.textSecondary }}>
                  Consultando zonas DNS AD via LDAP ({scanStatus ?? "queued"})… pode levar alguns
                  segundos.
                </span>
              </div>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    fontSize: 11.5,
                    color: T.textMuted,
                  }}
                >
                  <span>
                    {(fqdns ?? []).length} candidata(s) · {selected.size} selecionada(s)
                  </span>
                  <div style={{ display: "flex", gap: 10 }}>
                    <button
                      className="dast-btn gst"
                      style={{ padding: "3px 8px" }}
                      onClick={() => setSelected(new Set(fqdns ?? []))}
                    >
                      Marcar todos
                    </button>
                    <button
                      className="dast-btn gst"
                      style={{ padding: "3px 8px" }}
                      onClick={() => setSelected(new Set())}
                    >
                      Desmarcar todos
                    </button>
                  </div>
                </div>
                <div
                  style={{
                    maxHeight: 340,
                    overflowY: "auto",
                    border: `1px solid ${T.border}`,
                    borderRadius: 8,
                    padding: 4,
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                  }}
                >
                  {groupedFqdns.map(({ group, items }) => {
                    const allSelected = items.every((f) => selected.has(f));
                    const someSelected = !allSelected && items.some((f) => selected.has(f));
                    return (
                      <div key={group}>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "4px 8px",
                            background: T.surfaceAlt,
                            borderRadius: 6,
                          }}
                        >
                          <label
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              fontSize: 11.5,
                              fontWeight: 700,
                              color: T.textSecondary,
                              cursor: "pointer",
                            }}
                          >
                            <Checkbox
                              checked={allSelected ? true : someSelected ? "indeterminate" : false}
                              onCheckedChange={(v) => setGroupSelected(items, !!v)}
                            />
                            {group}
                          </label>
                          <span style={{ fontSize: 10.5, color: T.textMuted }}>{items.length}</span>
                        </div>
                        {items.map((f) => (
                          <label
                            key={f}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              gap: 8,
                              padding: "6px 8px 6px 24px",
                              fontSize: 12.5,
                              fontFamily: "var(--font-data)",
                              color: T.textPrimary,
                              cursor: "pointer",
                            }}
                          >
                            <Checkbox
                              checked={selected.has(f)}
                              onCheckedChange={() => toggleFqdn(f)}
                            />
                            {f}
                          </label>
                        ))}
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
        </div>
        <DialogFooter style={{ gap: 8, paddingTop: 8 }}>
          {kind === "internal-apps" ? (
            !scanId ? (
              <>
                <button
                  className="dast-btn gst"
                  onClick={() => onOpenChange(false)}
                  disabled={startInternal.isPending}
                >
                  Cancelar
                </button>
                <button
                  className="dast-btn pri"
                  disabled={startInternal.isPending}
                  onClick={() => startInternal.mutate()}
                >
                  {startInternal.isPending ? (
                    <Loader2 size={13} className="dast-spin" />
                  ) : (
                    <Radar size={13} />
                  )}{" "}
                  Buscar zonas
                </button>
              </>
            ) : scanStatus === "error" ? (
              <>
                <button className="dast-btn gst" onClick={() => onOpenChange(false)}>
                  Fechar
                </button>
                <button className="dast-btn pri" onClick={resetInternal}>
                  <Radar size={13} /> Tentar novamente
                </button>
              </>
            ) : scanStatus !== "done" ? (
              <>
                <button className="dast-btn gst" onClick={() => onOpenChange(false)}>
                  Fechar (continua em segundo plano)
                </button>
                <CancelScanButton scanId={scanId} status={scanStatus ?? "running"} />
              </>
            ) : (
              <>
                <button className="dast-btn gst" onClick={resetInternal}>
                  Voltar
                </button>
                <button
                  className="dast-btn pri"
                  disabled={selected.size === 0 || confirmInternal.isPending}
                  onClick={() => confirmInternal.mutate()}
                >
                  {confirmInternal.isPending ? <Loader2 size={13} className="dast-spin" /> : null}{" "}
                  Adicionar selecionados ({selected.size})
                </button>
              </>
            )
          ) : (
            <>
              <button
                className="dast-btn gst"
                onClick={() => onOpenChange(false)}
                disabled={save.isPending}
              >
                Cancelar
              </button>
              <button
                className="dast-btn pri"
                disabled={!valid || save.isPending}
                onClick={() => save.mutate()}
              >
                {save.isPending ? (
                  <>
                    <Loader2 size={13} className="dast-spin" /> Iniciando…
                  </>
                ) : (
                  <>
                    <Radar size={13} /> Iniciar descoberta
                  </>
                )}
              </button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Credencial de domínio pro LDAP (adidnsdump) -- entrada própria em
// Integrações (dast_ad_ldap), separada da credencial SMB do Shadow IT de
// propósito (mesma separação de módulo mantida em todo o resto).
function AdLdapCredentialDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const fetchStatus = useServerFn(getDastAdLdapCredentialStatus);
  const save = useServerFn(saveDastAdLdapCredential);
  const qc = useQueryClient();
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [dcHost, setDcHost] = React.useState("");

  const statusQ = useQuery({
    queryKey: ["dast-ad-ldap-cred-status"],
    queryFn: () => fetchStatus(),
    enabled: open,
  });

  const saveMutation = useMutation({
    mutationFn: () => save({ data: { username, password, dcHost } }),
    onSuccess: () => {
      toast.success("Credencial salva");
      qc.invalidateQueries({ queryKey: ["dast-ad-ldap-cred-status"] });
      setPassword("");
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{ background: T.surface, border: `1px solid ${T.borderHi}`, borderRadius: 12 }}
      >
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "var(--font-ui)", fontSize: 15, color: T.textPrimary }}>
            Credencial AD (LDAP)
          </DialogTitle>
        </DialogHeader>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            fontSize: 12,
            color: T.textSecondary,
          }}
        >
          <p>
            Usada pra listar zonas DNS AD-integradas via LDAP (<code>adidnsdump</code>) — acha
            aplicação interna por FQDN, não dispositivo. Sessão anônima não serve aqui, precisa de
            conta de domínio (mesmo perfil baixo-privilégio do Shadow IT, mas cadastro separado).
          </p>
          <p style={{ color: T.textMuted }}>
            {statusQ.isLoading
              ? "Verificando…"
              : statusQ.data?.configured
                ? `Configurada como: ${statusQ.data.username} · DC: ${statusQ.data.dcHost}`
                : "Nenhuma credencial configurada ainda."}
          </p>
          <div className="dast-field">
            <span className="dast-field-lbl">Usuário (DOMINIO\usuario)</span>
            <input
              className="dast-input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="DOMINIO\svc-dast"
              autoComplete="off"
            />
          </div>
          <div className="dast-field">
            <span className="dast-field-lbl">Senha</span>
            <input
              className="dast-input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>
          <div className="dast-field">
            <span className="dast-field-lbl">
              Domain controller (IP/host — LDAP, não o nome da zona)
            </span>
            <input
              className="dast-input"
              value={dcHost}
              onChange={(e) => setDcHost(e.target.value)}
              placeholder="10.1.2.10"
            />
          </div>
        </div>
        <DialogFooter style={{ paddingTop: 8 }}>
          <button
            className="dast-btn pri"
            disabled={!username || !password || !dcHost || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? <Loader2 size={13} className="dast-spin" /> : null} Salvar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Credencial de login por domínio-alvo, pro scan autenticado (ZAP
// Browser-Based Authentication) -- reutilizável entre scans manuais e
// Agendamentos, diferente da credencial AD/LDAP acima (que é única/global,
// não por aplicação). Domínio precisa bater exatamente com o hostname do
// alvo escaneado (ex.: "gestaox.bernoulli.com.br").
function AuthCredentialsDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const list = useServerFn(listDastAuthCredentialsFn);
  const save = useServerFn(saveDastAuthCredentialFn);
  const del = useServerFn(deleteDastAuthCredentialFn);
  const qc = useQueryClient();
  const [domain, setDomain] = React.useState("");
  const [loginUrl, setLoginUrl] = React.useState("");
  const [username, setUsername] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [loggedInIndicator, setLoggedInIndicator] = React.useState("");

  const listQ = useQuery({
    queryKey: ["dast-auth-credentials"],
    queryFn: () => list(),
    enabled: open,
  });

  const resetForm = () => {
    setDomain("");
    setLoginUrl("");
    setUsername("");
    setPassword("");
    setLoggedInIndicator("");
  };

  const saveMutation = useMutation({
    mutationFn: () =>
      save({
        data: {
          domain,
          loginUrl,
          username,
          password,
          loggedInIndicator: loggedInIndicator || null,
        },
      }),
    onSuccess: () => {
      toast.success("Credencial salva");
      qc.invalidateQueries({ queryKey: ["dast-auth-credentials"] });
      resetForm();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => del({ data: { id } }),
    onSuccess: () => {
      toast.success("Credencial removida");
      qc.invalidateQueries({ queryKey: ["dast-auth-credentials"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        style={{
          background: T.surface,
          border: `1px solid ${T.borderHi}`,
          borderRadius: 12,
          maxWidth: 520,
        }}
      >
        <DialogHeader>
          <DialogTitle style={{ fontFamily: "var(--font-ui)", fontSize: 15, color: T.textPrimary }}>
            Scan autenticado — credenciais por domínio
          </DialogTitle>
        </DialogHeader>
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 12,
            fontSize: 12,
            color: T.textSecondary,
          }}
        >
          <p>
            Cadastre usuário/senha de teste de cada aplicação-alvo — o scan (ZAP) faz o login
            sozinho antes de rastrear/atacar, então cobre também o que fica atrás de tela de login.
            O domínio precisa bater exatamente com o alvo escaneado.
          </p>

          {listQ.data?.credentials?.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {listQ.data.credentials.map((cred) => (
                <div
                  key={cred.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    gap: 8,
                    padding: "7px 10px",
                    borderRadius: 8,
                    border: `1px solid ${T.border}`,
                    background: T.surfaceAlt,
                  }}
                >
                  <div style={{ display: "flex", flexDirection: "column", gap: 1, minWidth: 0 }}>
                    <span style={{ color: T.textPrimary, fontWeight: 600, fontSize: 12 }}>
                      {cred.domain}
                    </span>
                    <span
                      style={{
                        color: T.textMuted,
                        fontSize: 10.5,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                    >
                      {cred.username} ·{" "}
                      {cred.loginUrl || "raiz do alvo (sem URL de login específica)"}
                    </span>
                  </div>
                  <ConfirmDeleteButton
                    triggerClassName="dast-btn gst"
                    triggerTitle="Remover credencial"
                    icon={<Trash2 size={13} />}
                    dialogTitle="Remover credencial?"
                    dialogDescription={`Scans futuros contra ${cred.domain} voltam a rodar anônimos.`}
                    onConfirm={() => deleteMutation.mutate(cred.id)}
                  />
                </div>
              ))}
            </div>
          ) : (
            <p style={{ color: T.textMuted }}>
              {listQ.isLoading ? "Carregando…" : "Nenhuma credencial cadastrada ainda."}
            </p>
          )}

          <div
            style={{
              borderTop: `1px solid ${T.border}`,
              paddingTop: 12,
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div className="dast-field">
              <span className="dast-field-lbl">Domínio do alvo</span>
              <input
                className="dast-input"
                value={domain}
                onChange={(e) => setDomain(e.target.value)}
                placeholder="app.empresa.com.br"
              />
            </div>
            <div className="dast-field">
              <span className="dast-field-lbl">
                URL da página de login <span style={{ color: T.textSubtle }}>(opcional)</span>
              </span>
              <input
                className="dast-input"
                value={loginUrl}
                onChange={(e) => setLoginUrl(e.target.value)}
                placeholder="https://app.empresa.com.br/login"
              />
              <span className="dast-field-helper" style={{ fontSize: 10.5, color: T.textMuted }}>
                Deixe em branco se o login está na própria raiz do site (o scan usa a raiz do alvo e
                deixa o navegador do ZAP seguir o redirecionamento até a tela real). Só preencha se
                o login mora em outro domínio (ex.: SSO).
              </span>
            </div>
            <div className="dast-field">
              <span className="dast-field-lbl">Usuário de teste</span>
              <input
                className="dast-input"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
            <div className="dast-field">
              <span className="dast-field-lbl">Senha</span>
              <input
                className="dast-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
              />
            </div>
            <div className="dast-field">
              <span className="dast-field-lbl">Indicador de sessão logada (regex, opcional)</span>
              <input
                className="dast-input"
                value={loggedInIndicator}
                onChange={(e) => setLoggedInIndicator(e.target.value)}
                placeholder="Sair|Logout"
              />
              <span className="dast-field-helper" style={{ fontSize: 10.5, color: T.textMuted }}>
                Texto que só aparece com sessão válida — ajuda o scan a perceber se caiu no meio da
                varredura.
              </span>
            </div>
          </div>
        </div>
        <DialogFooter style={{ paddingTop: 8 }}>
          <button
            className="dast-btn pri"
            disabled={!domain || !username || !password || saveMutation.isPending}
            onClick={() => saveMutation.mutate()}
          >
            {saveMutation.isPending ? <Loader2 size={13} className="dast-spin" /> : null} Salvar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Aba Ativos Descobertos (Amass externo + descoberta de rede/shadow IT) ────
const SCOPE_LABEL: Record<string, string> = { external: "Externo", internal: "Interno" };

// Heurística simples de domínio-raiz (sem lib de eTLD) -- cobre o caso comum
// (ex.: "sub.bernoulli.com.br" -> "bernoulli.com.br") lidando com o 2º nível
// composto mais comum em domínios .br/.co etc. Hosts sem padrão de domínio
// (ex.: IP puro da descoberta interna) caem no fallback e viram seu próprio
// "grupo" no filtro, o que já é o comportamento esperado ali.
function getRootDomain(raw: string): string {
  // O amass devolve algumas entradas com esquema ("https://sub.dominio.com")
  // e outras sem -- sem normalizar isso aqui, o mesmo domínio aparecia
  // duplicado no filtro (uma vez puro, outra com "https://" na frente).
  const host = raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, "")
    .split(/[/?#]/)[0]
    .split(":")[0]
    .replace(/\.$/, "");
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return host;
  const secondLevel = parts[parts.length - 2];
  const tld = parts[parts.length - 1];
  const compoundSecondLevels = new Set(["com", "net", "org", "gov", "edu", "mil", "co"]);
  if (tld.length === 2 && compoundSecondLevels.has(secondLevel)) return parts.slice(-3).join(".");
  return parts.slice(-2).join(".");
}

function AtivosDescobertosView({ discoveryScans }: { discoveryScans: any[] }) {
  const fetchAssets = useServerFn(listDastAssets);
  const deleteAssetFn = useServerFn(deleteDastAsset);
  const qc = useQueryClient();
  const [scope, setScope] = React.useState<"all" | "external" | "internal">("all");
  const [domainFilter, setDomainFilter] = React.useState("all");
  const [dlgOpen, setDlgOpen] = React.useState(false);
  const [adCredDlgOpen, setAdCredDlgOpen] = React.useState(false);
  const [authCredDlgOpen, setAuthCredDlgOpen] = React.useState(false);
  const q = useQuery({
    queryKey: ["dast-assets", scope],
    queryFn: () => fetchAssets({ data: { scope } }),
  });
  const deleteAsset = useMutation({
    mutationFn: (assetId: string) => deleteAssetFn({ data: { assetId } }),
    onSuccess: () => {
      toast.success("Ativo excluído");
      qc.invalidateQueries({ queryKey: ["dast-assets"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const rows = (q.data?.assets ?? []) as any[];
  const domains = React.useMemo(
    () => [...new Set(rows.map((r) => getRootDomain(r.subdomain)))].sort(),
    [rows],
  );
  const filteredRows =
    domainFilter === "all" ? rows : rows.filter((r) => getRootDomain(r.subdomain) === domainFilter);

  React.useEffect(() => {
    if (domainFilter !== "all" && !domains.includes(domainFilter)) setDomainFilter("all");
  }, [domains, domainFilter]);

  const semCadastro = filteredRows.filter((r) => !r.in_applications).length;
  return (
    <>
      <div className="dast-kpis">
        <div className="dast-kpi">
          <span className="dast-kpi-label">
            {scope === "all"
              ? "Ativos descobertos"
              : scope === "external"
                ? "Ativos externos"
                : "Ativos internos"}
          </span>
          <span className="dast-kpi-value">{filteredRows.length}</span>
          <span className="dast-kpi-foot">
            {filteredRows.length
              ? `último encontrado ${fmtRel(filteredRows.reduce((m, r) => (r.discovered_at > m ? r.discovered_at : m), ""))}`
              : "nenhuma descoberta ainda"}
          </span>
        </div>
        <div className="dast-kpi">
          <span className="dast-kpi-label">
            <span style={{ width: 8, height: 8, borderRadius: 2, background: T.success }} />
            Cadastrados em Aplicações
          </span>
          <span className="dast-kpi-value">{filteredRows.length - semCadastro}</span>
          <span className="dast-kpi-foot">com dono e sistema conhecidos</span>
        </div>
        <div className="dast-kpi">
          <span className="dast-kpi-label">
            <span style={{ width: 8, height: 8, borderRadius: 2, background: T.medium }} />
            Sem cadastro
          </span>
          <span className="dast-kpi-value">{semCadastro}</span>
          <span className="dast-kpi-foot">possível shadow IT</span>
        </div>
        <div className="dast-kpi">
          <span className="dast-kpi-label">Scans de descoberta</span>
          <span className="dast-kpi-value">{discoveryScans.length}</span>
          <span className="dast-kpi-foot">
            {discoveryScans[0] ? `último ${fmtRel(discoveryScans[0].created_at)}` : "nenhum ainda"}
          </span>
        </div>
      </div>
      <div className="dast-panel">
        <div className="dast-panel-hdr">
          <h2 className="dast-panel-title">
            Ativos descobertos <span className="n">({filteredRows.length})</span>
          </h2>
          <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <div className="dast-segs" role="group" aria-label="Escopo">
              {(["all", "external", "internal"] as const).map((s) => (
                <button
                  key={s}
                  className={`dast-pill ${scope === s ? "on" : ""}`}
                  onClick={() => setScope(s)}
                >
                  {s === "all" ? "Todos" : SCOPE_LABEL[s]}
                </button>
              ))}
            </div>
            <Select value={domainFilter} onValueChange={setDomainFilter}>
              <SelectTrigger
                style={{
                  background: T.surfaceAlt,
                  borderColor: T.border,
                  color: T.textPrimary,
                  fontSize: 12,
                  height: 32,
                  minWidth: 170,
                }}
              >
                <SelectValue placeholder="Domínio" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos os domínios</SelectItem>
                {domains.map((d) => (
                  <SelectItem key={d} value={d}>
                    {d}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <button className="dast-btn gst" onClick={() => setAdCredDlgOpen(true)}>
              Credencial AD
            </button>
            <button className="dast-btn gst" onClick={() => setAuthCredDlgOpen(true)}>
              <KeyRound size={13} /> Scan autenticado
            </button>
            <button className="dast-btn pri" onClick={() => setDlgOpen(true)}>
              <Plus size={13} /> Nova descoberta
            </button>
          </div>
        </div>
        <DiscoveryDialog open={dlgOpen} onOpenChange={setDlgOpen} />
        <AdLdapCredentialDialog open={adCredDlgOpen} onOpenChange={setAdCredDlgOpen} />
        <AuthCredentialsDialog open={authCredDlgOpen} onOpenChange={setAuthCredDlgOpen} />
        <div style={{ padding: filteredRows.length ? 0 : 20 }}>
          {q.isLoading ? (
            <div className="dast-empty">
              <Loader2 size={14} className="dast-spin" /> Carregando…
            </div>
          ) : rows.length === 0 ? (
            <div className="dast-empty">
              Nenhum ativo descoberto ainda — clique em "Nova descoberta" pra rodar o Amass
              (subdomínios) ou a descoberta de rede local (shadow IT).
            </div>
          ) : filteredRows.length === 0 ? (
            <div className="dast-empty">Nenhum ativo bate com o domínio filtrado.</div>
          ) : (
            <div style={{ overflowX: "auto", overflowY: "auto", maxHeight: 460 }}>
              <table className="dast-table">
                <thead>
                  <tr>
                    <th style={{ paddingLeft: 18 }}>Subdomínio / Host</th>
                    <th>IP</th>
                    <th>Escopo</th>
                    <th>Fonte</th>
                    <th>Aplicações</th>
                    <th>Descoberto em</th>
                    <th style={{ paddingRight: 18, textAlign: "right" }}>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((r) => (
                    <tr key={r.id}>
                      <td style={{ paddingLeft: 18, fontFamily: "var(--font-data)", fontSize: 12 }}>
                        {r.subdomain}
                      </td>
                      <td
                        style={{ fontFamily: "var(--font-data)", fontSize: 11, color: T.textMuted }}
                      >
                        {r.ip ?? "—"}
                      </td>
                      <td>
                        <StatusPill
                          label={SCOPE_LABEL[r.scope] ?? r.scope}
                          color={r.scope === "internal" ? T.low : T.accent}
                        />
                      </td>
                      <td
                        style={{ fontFamily: "var(--font-data)", fontSize: 11, color: T.textMuted }}
                      >
                        {r.source ?? "—"}
                      </td>
                      <td>
                        {r.in_applications ? (
                          <StatusPill label="Cadastrada" color={T.success} />
                        ) : (
                          <StatusPill label="Sem cadastro" color={T.medium} />
                        )}
                      </td>
                      <td style={{ color: T.textMuted, fontSize: 11 }}>
                        {fmtRel(r.discovered_at)}
                      </td>
                      <td style={{ paddingRight: 18, textAlign: "right" }}>
                        <ConfirmDeleteButton
                          triggerClassName="dast-btn dng"
                          triggerTitle="Excluir ativo"
                          triggerDisabled={deleteAsset.isPending}
                          icon={<Trash2 size={12} />}
                          dialogTitle="Excluir ativo descoberto"
                          dialogDescription={`Excluir "${r.subdomain}" de Ativos Descobertos? Essa ação não pode ser desfeita.`}
                          onConfirm={() => deleteAsset.mutate(r.id)}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <div className="dast-panel">
        <div className="dast-panel-hdr">
          <div>
            <h2 className="dast-panel-title">
              Scans de descoberta <span className="n">({discoveryScans.length})</span>
            </h2>
            <p className="dast-panel-sub">Amass externo, rede interna e zonas do Cloudflare</p>
          </div>
        </div>
        {discoveryScans.length > 0 ? (
          <div style={{ overflowX: "auto", maxHeight: 460, overflowY: "auto" }}>
            <table className="dast-table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 18 }}>Nome</th>
                  <th>Alvo</th>
                  <th>Modo</th>
                  <th>Status</th>
                  <th>Criado</th>
                  <th>Duração</th>
                  <th style={{ paddingRight: 18, textAlign: "right" }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {discoveryScans.map((s) => {
                  const tone = STATUS_TONE[s.status] ?? T.textMuted;
                  return (
                    <tr key={s.id}>
                      <td style={{ paddingLeft: 18, fontWeight: 600 }}>{s.name ?? "—"}</td>
                      <td style={{ maxWidth: 220 }}>
                        <TargetsCell scan={s} />
                      </td>
                      <td className="dast-dim">{MODE_LABEL[s.mode] ?? s.mode}</td>
                      <td>
                        <StatusPill
                          label={STATUS_LABEL[s.status] ?? s.status}
                          color={tone}
                          live={s.status === "running"}
                        />
                        {s.error && (
                          <span
                            title={s.error}
                            style={{
                              marginLeft: 6,
                              fontSize: 10,
                              color: T.critical,
                              cursor: "help",
                            }}
                          >
                            ⚠
                          </span>
                        )}
                      </td>
                      <td style={{ color: T.textMuted, fontSize: 11 }}>{fmtRel(s.created_at)}</td>
                      <td
                        style={{ fontFamily: "var(--font-data)", fontSize: 11, color: T.textMuted }}
                      >
                        {fmtDuration(s.started_at, s.finished_at)}
                      </td>
                      <td style={{ paddingRight: 18 }}>
                        <div
                          style={{
                            display: "flex",
                            gap: 6,
                            justifyContent: "flex-end",
                            alignItems: "center",
                          }}
                        >
                          <CancelScanButton scanId={s.id} status={s.status} />
                          <DeleteScanButton scanId={s.id} status={s.status} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="dast-empty">Nenhum scan de descoberta ainda.</div>
        )}
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
export function DastScannerDashboard() {
  const qc = useQueryClient();
  const fetchAccess = useServerFn(getDastAccess);
  const accessQuery = useQuery({
    queryKey: ["dast-access"],
    queryFn: () => fetchAccess({ data: {} as any }),
  });
  const isDastAllowed = !!accessQuery.data?.allowed;
  const loading = accessQuery.isLoading;

  const fetchOverview = useServerFn(getDastOverview);
  const fetchScans = useServerFn(listDastScans);

  const overview = useQuery({
    queryKey: ["dast-overview"],
    queryFn: () => fetchOverview({ data: { days: 30 } }),
    enabled: isDastAllowed,
    refetchInterval: 60_000,
  });
  const scans = useQuery({
    queryKey: ["dast-scans"],
    queryFn: () => fetchScans(),
    enabled: isDastAllowed,
    refetchInterval: 20_000,
  });

  const [view, setView] = React.useState<
    "dashboard" | "acompanhamento" | "ativos" | "agendamentos"
  >("dashboard");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [kpiFilter, setKpiFilter] = React.useState<
    "all" | "critical" | "high" | "medium" | "low" | "resolved"
  >("all");

  // Realtime: qualquer mudança em scans/vulnerabilities dispara refetch (dados
  // continuam protegidos por RLS is_dast_allowed nas queries).
  React.useEffect(() => {
    if (!isDastAllowed) return;
    const invalidate = () => {
      qc.invalidateQueries({ queryKey: ["dast-scans"] });
      qc.invalidateQueries({ queryKey: ["dast-overview"] });
      qc.invalidateQueries({ queryKey: ["dast-alerts"] });
      qc.invalidateQueries({ queryKey: ["dast-vulns"] });
    };
    const ch = supabase
      .channel("dast-rt")
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "dast_scans" },
        invalidate,
      )
      .on(
        "postgres_changes" as any,
        { event: "*", schema: "public", table: "dast_vulnerabilities" },
        invalidate,
      );
    ch.subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [isDastAllowed, qc]);

  if (loading) return <ModuleLoading />;

  if (!isDastAllowed) {
    return (
      <div className="dast-root">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="dast-state">
          <Lock size={22} color={T.critical} />
          <span style={{ fontSize: 15, fontWeight: 600 }}>Acesso restrito</span>
          <span className="dast-dim" style={{ fontSize: 13, maxWidth: 420 }}>
            Este módulo é exclusivo para administradores do departamento de Segurança da Informação.
          </span>
        </div>
      </div>
    );
  }

  const ov: DastOverview | undefined = overview.data;
  const sev = ov?.bySeverity;
  const scanRows = (scans.data?.scans ?? []) as any[];
  // Scans de descoberta (Amass/rede interna/pull Cloudflare) saem do quadro
  // de Scans do Dashboard e vão pro quadro próprio dentro de Ativos
  // Descobertos -- não são scan de vulnerabilidade, misturados só poluíam.
  const dashboardScanRows = scanRows.filter((s) => !isDiscoveryScan(s));
  const discoveryScanRows = scanRows.filter((s) => isDiscoveryScan(s));
  const activeCount = scanRows.filter(
    (s) => s.status === "queued" || s.status === "running",
  ).length;
  const sevKpis = [
    { key: "critical" as const, label: "Críticas" },
    { key: "high" as const, label: "Altas" },
    { key: "medium" as const, label: "Médias" },
    { key: "low" as const, label: "Baixas" },
  ];
  const filteredRecent = (ov?.recent ?? []).filter((v) => {
    if (kpiFilter === "all") return true;
    if (kpiFilter === "resolved") return v.status === "resolved";
    return v.severity === kpiFilter;
  });
  const toggleKpi = (k: typeof kpiFilter) => setKpiFilter((prev) => (prev === k ? "all" : k));

  return (
    <div className="dast-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Cabeçalho ──────────────────────────────────────────────────── */}
      <div className="dast-ph">
        <div>
          <h1 className="dast-ph-title">DAST Scanner</h1>
          <p className="dast-ph-sub">
            Varredura dinâmica de aplicações web · uso interno autorizado
          </p>
        </div>
        <SyncActions
          moduleSlug="dast-scanner"
          jobs={["dast-schedules-run", "dast-stale-scan-sweep"]}
        >
          <div className="dast-ph-actions">
            <button
              className="dast-btn lg"
              onClick={() => {
                overview.refetch();
                scans.refetch();
              }}
            >
              <RefreshCw
                size={14}
                className={overview.isFetching || scans.isFetching ? "dast-spin" : ""}
              />{" "}
              Atualizar
            </button>
            <button className="dast-btn pri lg" onClick={() => setDialogOpen(true)}>
              <Plus size={14} /> Novo scan
            </button>
          </div>
        </SyncActions>
      </div>

      <div className="dast-subnav" role="tablist" aria-label="Seções do DAST">
        {(
          [
            ["dashboard", "Dashboard"],
            ["acompanhamento", "Acompanhamento"],
            ["ativos", "Ativos descobertos"],
            ["agendamentos", "Agendamentos"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={view === k}
            onClick={() => setView(k)}
          >
            {l}
            {k === "acompanhamento" && activeCount > 0 && (
              <span className="live">
                {activeCount} {activeCount === 1 ? "ativo" : "ativos"}
              </span>
            )}
          </button>
        ))}
      </div>

      {view === "dashboard" && (
        <>
          <div className="dast-kpis">
            <div className="dast-kpi">
              <span className="dast-kpi-label">Scans em 30 dias</span>
              <span className="dast-kpi-value">{ov?.totalScans ?? "—"}</span>
              <span className="dast-kpi-foot">
                {activeCount ? `${activeCount} em andamento agora` : "nenhum em andamento"}
              </span>
            </div>
            {sevKpis.map((k) => (
              <button
                key={k.key}
                type="button"
                className="dast-kpi"
                aria-pressed={kpiFilter === k.key}
                onClick={() => toggleKpi(k.key)}
                title="Filtrar Últimas vulnerabilidades"
              >
                <span className="dast-kpi-label">
                  <SevIcon severity={k.key} />
                  {k.label}
                </span>
                <span className="dast-kpi-value">{sev?.[k.key] ?? "—"}</span>
                <span className="dast-kpi-foot">encontradas em 30 dias</span>
              </button>
            ))}
            <button
              type="button"
              className="dast-kpi"
              aria-pressed={kpiFilter === "resolved"}
              onClick={() => toggleKpi("resolved")}
              title="Filtrar Últimas vulnerabilidades"
            >
              <span className="dast-kpi-label">
                <span style={{ width: 8, height: 8, borderRadius: 2, background: T.success }} />
                Resolvidas
              </span>
              <span className="dast-kpi-value">{ov?.resolved ?? "—"}</span>
              <span className="dast-kpi-foot">das encontradas em 30 dias</span>
            </button>
          </div>

          <div className="dast-grid">
            <div className="dast-panel dast-span-2">
              <div className="dast-panel-hdr plain">
                <div>
                  <h2 className="dast-panel-title">Vulnerabilidades encontradas por dia</h2>
                  <p className="dast-panel-sub">Últimos 30 dias, por severidade</p>
                </div>
              </div>
              <div className="dast-panel-body" style={{ height: 290 }}>
                {ov && ov.series.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={ov.series}
                      margin={{ top: 8, right: 8, left: -22, bottom: 0 }}
                      barCategoryGap="18%"
                    >
                      <CartesianGrid strokeDasharray="3 4" stroke={T.chartGrid} vertical={false} />
                      <XAxis
                        dataKey="d"
                        stroke={T.chartAxis}
                        fontSize={11}
                        tickLine={false}
                        minTickGap={24}
                        tick={{ fill: T.chartTick, fontFamily: "var(--font-data)" }}
                      />
                      <YAxis
                        stroke={T.chartAxis}
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        allowDecimals={false}
                        tick={{ fill: T.chartTick, fontFamily: "var(--font-data)" }}
                      />
                      <Tooltip
                        cursor={{ fill: "var(--v2-hover)" }}
                        contentStyle={{
                          background: T.surface,
                          border: `1px solid ${T.borderHi}`,
                          borderRadius: 8,
                          fontSize: 12,
                          color: T.textPrimary,
                        }}
                        labelStyle={{ color: T.textPrimary, fontWeight: 600 }}
                      />
                      <Legend
                        iconType="square"
                        iconSize={9}
                        wrapperStyle={{ fontSize: 12, color: T.textSecondary }}
                      />
                      <Bar dataKey="critical" name="Crítico" stackId="s" fill={T.critical} />
                      <Bar dataKey="high" name="Alto" stackId="s" fill={T.high} />
                      <Bar
                        dataKey="medium"
                        name="Médio"
                        stackId="s"
                        fill={T.medium}
                        radius={[3, 3, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="dast-empty">Sem vulnerabilidades registradas no período.</div>
                )}
              </div>
            </div>

            <div className="dast-panel dast-fit">
              <div className="dast-panel-hdr plain">
                <div>
                  <h2 className="dast-panel-title">Últimas vulnerabilidades</h2>
                  <p className="dast-panel-sub">
                    {kpiFilter === "all" ? (
                      "Mais recentes primeiro"
                    ) : (
                      <>
                        Filtro:{" "}
                        {kpiFilter === "resolved"
                          ? "resolvidas"
                          : SEV_LABEL[kpiFilter].toLowerCase()}{" "}
                        ·{" "}
                        <button
                          type="button"
                          onClick={() => setKpiFilter("all")}
                          style={{
                            border: 0,
                            background: "none",
                            color: T.accent,
                            cursor: "pointer",
                            padding: 0,
                            font: "inherit",
                          }}
                        >
                          limpar
                        </button>
                      </>
                    )}
                  </p>
                </div>
              </div>
              <div className="dast-panel-body">
                {ov && filteredRecent.length > 0 ? (
                  <div className="dast-feed">
                    {filteredRecent.map((v) => (
                      <div key={v.id}>
                        <SevBadge severity={v.severity} />
                        <span style={{ minWidth: 0 }}>
                          <b title={v.name}>{v.name}</b>
                          <small>
                            {[
                              v.engine,
                              v.cvss_score != null ? `CVSS ${v.cvss_score}` : null,
                              v.status === "resolved" ? "resolvida" : null,
                            ]
                              .filter(Boolean)
                              .join(" · ")}
                          </small>
                        </span>
                        <span className="t">{fmtRel(v.found_at)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="dast-empty">
                    {kpiFilter === "all"
                      ? "Nenhuma vulnerabilidade recente."
                      : "Nenhuma vulnerabilidade recente para esse filtro."}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="dast-panel">
            <div className="dast-panel-hdr">
              <div>
                <h2 className="dast-panel-title">
                  Scans de vulnerabilidade <span className="n">({dashboardScanRows.length})</span>
                </h2>
                <p className="dast-panel-sub">Scans de descoberta ficam em Ativos descobertos</p>
              </div>
            </div>
            {dashboardScanRows.length > 0 ? (
              <div style={{ overflowX: "auto", maxHeight: 520, overflowY: "auto" }}>
                <table className="dast-table">
                  <thead>
                    <tr>
                      <th>Scan</th>
                      <th>Modo · nível</th>
                      <th>Engines</th>
                      <th>Status</th>
                      <th>Progresso</th>
                      <th>Criado</th>
                      <th>Duração</th>
                      <th>
                        <span style={{ fontSize: 0 }}>Ações</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboardScanRows.map((s) => {
                      const tone = STATUS_TONE[s.status] ?? T.textMuted;
                      const prog = s.progress ?? 0;
                      return (
                        <tr key={s.id}>
                          <td className="nm">
                            <b>{s.name ?? "—"}</b>
                            <small>
                              <TargetsCell scan={s} />
                            </small>
                          </td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            {MODE_LABEL[s.mode] ?? s.mode}{" "}
                            <span className="dast-dim">· {LEVEL_LABEL[s.level] ?? s.level}</span>
                          </td>
                          <td>
                            <div className="dast-tags">
                              {(s.engines ?? []).map((e: string) => (
                                <span key={e} className="dast-tag">
                                  {e}
                                </span>
                              ))}
                            </div>
                          </td>
                          <td style={{ whiteSpace: "nowrap" }}>
                            <StatusPill
                              label={STATUS_LABEL[s.status] ?? s.status}
                              color={tone}
                              live={s.status === "running"}
                            />
                            {s.auth_status && (
                              <span
                                title={
                                  s.auth_status === "authenticated"
                                    ? "Scan autenticado — login confirmado no ZAP"
                                    : "Credencial configurada, mas a autenticação falhou — scan rodou anônimo"
                                }
                                style={{
                                  marginLeft: 6,
                                  display: "inline-flex",
                                  color: s.auth_status === "authenticated" ? T.success : T.critical,
                                  cursor: "help",
                                  verticalAlign: "middle",
                                }}
                              >
                                <KeyRound size={13} />
                              </span>
                            )}
                            {s.error && (
                              <span
                                title={s.error}
                                style={{
                                  marginLeft: 6,
                                  display: "inline-flex",
                                  color: T.critical,
                                  cursor: "help",
                                  verticalAlign: "middle",
                                }}
                              >
                                <AlertTriangle size={13} />
                              </span>
                            )}
                          </td>
                          <td>
                            <div className="dast-progress">
                              <div className="dast-prog">
                                <i
                                  style={{
                                    width: `${prog}%`,
                                    background:
                                      s.status === "error"
                                        ? T.critical
                                        : s.status === "done"
                                          ? T.success
                                          : T.accent,
                                  }}
                                />
                              </div>
                              <span>{prog}%</span>
                            </div>
                          </td>
                          <td className="dast-dim" style={{ whiteSpace: "nowrap" }}>
                            {fmtRel(s.created_at)}
                          </td>
                          <td className="dast-mono dast-dim" style={{ whiteSpace: "nowrap" }}>
                            {fmtDuration(s.started_at, s.finished_at)}
                          </td>
                          <td>
                            <div
                              style={{
                                display: "flex",
                                gap: 4,
                                justifyContent: "flex-end",
                                alignItems: "center",
                              }}
                            >
                              <ExportButtons scanId={s.id} />
                              <CancelScanButton scanId={s.id} status={s.status} />
                              <DeleteScanButton scanId={s.id} status={s.status} />
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="dast-empty">
                Nenhum scan ainda. Clique em "Novo scan" para começar.
              </div>
            )}
          </div>
        </>
      )}

      {view === "acompanhamento" && <AcompanhamentoView scanRows={scanRows} />}

      {view === "ativos" && <AtivosDescobertosView discoveryScans={discoveryScanRows} />}

      {view === "agendamentos" && <AgendamentosView />}

      <NewScanDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
