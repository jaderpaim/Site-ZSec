import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import { type CronJobRun, getCronHealth, fmtDateTime } from "./CronHealthBadge";
import { toggleCronJob, createCronJobEntry, updateCronJobEntry } from "@/lib/cron-jobs.functions";
import {
  Timer,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  Clock,
  Plus,
  X,
  Power,
  Pencil,
  Save,
  Hourglass,
  CalendarClock,
} from "lucide-react";

// ─── Design Tokens (espelho do módulo Logs) ────────────────────────────────────
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
  neutral: "#6B7280",
  textPrimary: "#F1F5F9",
  textSecondary: "#F1F5F9",
  textMuted: "#F1F5F9",
  textSubtle: "#F1F5F9",
};

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');

  .cj-root { font-family:'DM Sans',sans-serif; color:${T.textPrimary}; }
  .cj-root * { box-sizing:border-box; }

  /* ── Page header ── */
  .cj-page-header {
    background:${T.surface}; border:1px solid ${T.border}; border-radius:10px;
    padding:16px 22px; display:flex; align-items:center; justify-content:space-between;
    margin-bottom:4px;
  }
  .cj-page-title {
    font-size:14px; font-weight:700; color:${T.textPrimary};
    font-family:'Space Grotesk',sans-serif; letter-spacing:-0.01em;
  }
  .cj-page-sub { font-size:12px; color:${T.textMuted}; margin-top:3px; line-height:1.5; }

  .cj-stat-pill {
    display:inline-flex; align-items:center; gap:5px; padding:4px 10px;
    border-radius:5px; font-size:10px; font-weight:700; letter-spacing:0.08em;
    text-transform:uppercase; font-family:'IBM Plex Mono',monospace; white-space:nowrap;
  }
  .cj-stat-pill.ok   { background:${T.successBg}; color:${T.success}; border:1px solid rgba(16,185,129,0.2); }
  .cj-stat-pill.err  { background:${T.dangerBg};  color:${T.danger};  border:1px solid rgba(239,68,68,0.2); }
  .cj-stat-pill.info { background:${T.accentSoft}; color:${T.accent}; border:1px solid rgba(59,130,246,0.2); }
  .cj-stat-dot { width:5px; height:5px; border-radius:50%; background:currentColor; flex-shrink:0; }

  /* ── KPI grid ── */
  .cj-kpi-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; margin-bottom:16px; }
  .cj-kpi-card {
    background:${T.surface}; border:1px solid ${T.border}; border-radius:10px;
    padding:14px 16px; display:flex; flex-direction:column; gap:6px;
    position:relative; overflow:hidden; transition:border-color 0.2s;
  }
  .cj-kpi-card:hover { border-color:${T.borderHi}; }
  .cj-kpi-card::before {
    content:''; position:absolute; top:0; left:0; right:0; height:2px;
    background:var(--kpi-color,${T.accent});
  }
  .cj-kpi-label {
    font-size:9px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase;
    color:${T.textMuted}; font-family:'IBM Plex Mono',monospace;
  }
  .cj-kpi-value {
    font-size:22px; font-weight:700; font-family:'Space Grotesk',sans-serif;
    color:var(--kpi-color,${T.accent}); line-height:1; display:flex; align-items:center; gap:7px;
  }

  /* ── Cron cards ── */
  .cj-grid {
    display:grid; grid-template-columns:repeat(auto-fill,minmax(480px,1fr)); gap:14px;
  }
  .cj-card {
    background:${T.surface}; border:1px solid ${T.border}; border-radius:10px;
    overflow:hidden; border-left:3px solid var(--cc,${T.border});
    display:flex; flex-direction:column;
    transition:border-color 0.2s, box-shadow 0.2s, opacity 0.2s;
  }
  .cj-card:hover { box-shadow:0 0 0 1px ${T.borderHi}; }
  .cj-card.disabled { opacity:0.55; }

  .cj-card-hd {
    padding:14px 20px 12px; display:flex; align-items:center;
    justify-content:space-between; gap:8px; border-bottom:1px solid ${T.border};
  }
  .cj-card-left { display:flex; align-items:center; gap:9px; min-width:0; }
  .cj-dot {
    width:9px; height:9px; border-radius:50%; flex-shrink:0;
    background:var(--cc,${T.neutral}); position:relative;
  }
  .cj-dot.pulse::after {
    content:''; position:absolute; inset:-3px; border-radius:50%;
    border:2px solid var(--cc,${T.neutral}); opacity:0;
    animation:cjRing 2.2s ease-out infinite;
  }
  @keyframes cjRing {
    0%   { transform:scale(0.6); opacity:0.7; }
    100% { transform:scale(1.8); opacity:0; }
  }
  .cj-name {
    font-size:13px; font-weight:700; color:${T.textPrimary};
    font-family:'Space Grotesk',sans-serif; white-space:nowrap;
    overflow:hidden; text-overflow:ellipsis;
  }
  .cj-card-right { display:flex; align-items:center; gap:8px; flex-shrink:0; }

  /* ── Badges ── */
  .cj-badge {
    display:inline-flex; align-items:center; gap:4px; padding:2px 7px;
    border-radius:4px; font-size:9px; font-weight:700; letter-spacing:0.08em;
    text-transform:uppercase; font-family:'IBM Plex Mono',monospace;
  }
  .cj-badge.success { background:${T.successBg}; color:${T.success}; border:1px solid rgba(16,185,129,0.2); }
  .cj-badge.warning { background:${T.warningBg}; color:${T.warning}; border:1px solid rgba(245,158,11,0.2); }
  .cj-badge.danger  { background:${T.dangerBg};  color:${T.danger};  border:1px solid rgba(239,68,68,0.2); }
  .cj-badge.muted   { background:rgba(107,114,128,0.1); color:${T.neutral}; border:1px solid rgba(107,114,128,0.2); }

  /* ── Toggle row ── */
  .cj-toggle-row {
    display:flex; align-items:center; gap:8px;
    font-size:10px; font-family:'IBM Plex Mono',monospace;
    color:${T.textMuted}; white-space:nowrap;
  }
  .cj-toggle-label { font-size:9px; text-transform:uppercase; letter-spacing:0.1em; }

  /* ── Card body ── */
  .cj-card-body { padding:16px 20px; display:flex; flex-direction:column; gap:14px; }
  .cj-stats { display:grid; grid-template-columns:1fr 1fr 1fr 1fr; gap:16px; }
  .cj-stat { display:flex; flex-direction:column; gap:4px; }
  .cj-stat-lbl {
    display:flex; align-items:center; gap:4px; font-size:9px;
    font-family:'IBM Plex Mono',monospace; text-transform:uppercase;
    letter-spacing:0.1em; color:${T.textMuted};
  }
  .cj-stat-val { font-size:11px; font-family:'IBM Plex Mono',monospace; color:${T.textSecondary}; font-weight:500; }
  .cj-stat-val.large {
    font-size:15px; font-family:'Space Grotesk',sans-serif;
    font-weight:700; color:var(--cc,${T.accent});
  }

  /* ── Freshness bar ── */
  .cj-bar-wrap { height:4px; background:${T.border}; border-radius:2px; overflow:hidden; }
  .cj-bar { height:100%; border-radius:2px; transition:width 0.6s ease; background:var(--bar-color,${T.success}); }
  .cj-bar-label {
    display:flex; justify-content:space-between; align-items:center;
    font-size:9px; font-family:'IBM Plex Mono',monospace;
    color:${T.textMuted}; margin-bottom:5px;
  }

  /* ── Job name chip ── */
  .cj-jobname {
    font-size:10px; color:#6B7280;
    font-family:'IBM Plex Mono',monospace;
    background:${T.surfaceAlt}; border-radius:5px; padding:4px 6px 4px 8px;
    border:1px solid ${T.border};
    display:flex; align-items:center; justify-content:space-between; gap:8px;
  }
  .cj-jobname-text { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .cj-jobname-kind {
    flex-shrink:0; font-size:8px; font-weight:700; letter-spacing:0.08em;
    text-transform:uppercase; padding:2px 6px; border-radius:4px;
    font-family:'IBM Plex Mono',monospace;
  }
  .cj-jobname-kind.sync  { background:${T.accentSoft}; color:${T.accent}; }
  .cj-jobname-kind.alert { background:${T.warningBg};  color:${T.warning}; }

  /* ── Error panel ── */
  .cj-error {
    background:rgba(239,68,68,0.06); border:1px solid rgba(239,68,68,0.2);
    border-radius:7px; padding:10px 12px; border-left:3px solid ${T.danger};
  }
  .cj-error-hd {
    display:flex; align-items:center; gap:5px; margin-bottom:5px;
    font-size:9px; font-family:'IBM Plex Mono',monospace;
    text-transform:uppercase; letter-spacing:0.1em; color:${T.danger};
  }
  .cj-error-msg {
    font-size:11px; color:${T.danger}; font-family:'IBM Plex Mono',monospace;
    line-height:1.5; word-break:break-word;
  }

  /* ── Inline edit panel ── */
  .cj-edit-panel {
    background:${T.surfaceAlt}; border-top:1px solid ${T.border};
    padding:14px 20px; display:flex; flex-direction:column; gap:12px;
    animation:cjFadeIn 0.15s ease;
  }
  @keyframes cjFadeIn { from { opacity:0; transform:translateY(-4px); } to { opacity:1; transform:none; } }
  .cj-edit-panel-title {
    font-size:10px; font-weight:700; text-transform:uppercase;
    letter-spacing:0.1em; color:${T.accent}; font-family:'IBM Plex Mono',monospace;
    display:flex; align-items:center; gap:5px;
  }
  .cj-edit-row { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .cj-edit-actions { display:flex; justify-content:flex-end; gap:8px; }

  /* ── Modal overlay ── */
  .cj-overlay {
    position:fixed; inset:0; background:rgba(0,0,0,0.7);
    display:flex; align-items:center; justify-content:center;
    z-index:9999; padding:16px;
  }
  .cj-modal {
    background:#0D1117; border:1px solid ${T.border}; border-radius:12px;
    width:100%; max-width:540px; display:flex; flex-direction:column; gap:0;
    box-shadow:0 24px 48px rgba(0,0,0,0.5);
  }
  .cj-modal-hd {
    display:flex; align-items:center; justify-content:space-between;
    padding:18px 22px 14px; border-bottom:1px solid ${T.border};
  }
  .cj-modal-title {
    font-size:13px; font-weight:700; color:${T.textPrimary};
    font-family:'Space Grotesk',sans-serif;
  }
  .cj-modal-body { padding:20px 22px; display:flex; flex-direction:column; gap:16px; }
  .cj-modal-footer {
    padding:14px 22px; border-top:1px solid ${T.border};
    display:flex; justify-content:flex-end; gap:8px;
  }
  .cj-field { display:flex; flex-direction:column; gap:6px; }
  .cj-field-label {
    font-size:10px; font-weight:700; text-transform:uppercase;
    letter-spacing:0.1em; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace;
  }
  .cj-input, .cj-select {
    background:${T.surfaceAlt}; border:1px solid ${T.border}; border-radius:6px;
    padding:8px 12px; font-size:12px; color:${T.textPrimary};
    font-family:'IBM Plex Mono',monospace; outline:none; width:100%;
    transition:border-color 0.15s;
  }
  .cj-input:focus, .cj-select:focus { border-color:rgba(59,130,246,0.5); }
  .cj-input::placeholder { color:${T.textSubtle}; }
  .cj-btn {
    display:inline-flex; align-items:center; gap:6px;
    padding:8px 16px; border-radius:7px; font-size:12px; font-weight:600;
    cursor:pointer; border:none; font-family:'DM Sans',sans-serif;
    transition:filter 0.15s, opacity 0.15s;
  }
  .cj-btn:disabled { opacity:0.5; cursor:not-allowed; }
  .cj-btn.primary { background:${T.accent}; color:#fff; }
  .cj-btn.primary:hover:not(:disabled) { filter:brightness(1.1); }
  .cj-btn.ghost {
    background:transparent; color:${T.textMuted};
    border:1px solid ${T.border};
  }
  .cj-btn.ghost:hover:not(:disabled) { color:${T.textPrimary}; border-color:${T.borderHi}; }
  .cj-btn.accent-outline {
    background:transparent; color:${T.accent};
    border:1px solid rgba(59,130,246,0.35);
  }
  .cj-btn.accent-outline:hover:not(:disabled) { background:${T.accentSoft}; }

  /* ── Module list in modal ── */
  .cj-module-list {
    display:flex; flex-direction:column; gap:4px; max-height:240px; overflow-y:auto;
  }
  .cj-module-item {
    display:flex; align-items:center; gap:10px; padding:9px 12px;
    border:1px solid ${T.border}; border-radius:7px; cursor:pointer;
    background:${T.surfaceAlt}; transition:border-color 0.12s, background 0.12s;
  }
  .cj-module-item:hover { border-color:${T.borderHi}; background:${T.surfaceHover}; }
  .cj-module-item.selected {
    border-color:rgba(59,130,246,0.45); background:${T.accentSoft};
  }
  .cj-module-item-name { font-size:12px; font-weight:600; color:${T.textPrimary}; flex:1; }
  .cj-module-item-mod { font-size:10px; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; }

  /* ── Empty / loading ── */
  .cj-empty { padding:48px 0; text-align:center; color:${T.textMuted}; font-size:13px; }

  /* ── Scrollbar ── */
  .cj-root ::-webkit-scrollbar { width:4px; height:4px; }
  .cj-root ::-webkit-scrollbar-track { background:transparent; }
  .cj-root ::-webkit-scrollbar-thumb { background:${T.borderHi}; border-radius:2px; }
`;

// ─── Módulos com função de alertas / sincronização ─────────────────────────────
// hookPath deve corresponder ao arquivo em src/routes/api/public/hooks/*.ts
// kind: "sync" = sincroniza/atualiza dados; "alert" = só verifica e dispara e-mail/webhook (não sincroniza dados novos)
const KNOWN_MODULES = [
  {
    jobName: "cloudflare-daily-sync",
    hookPath: "/api/public/hooks/cloudflare-sync",
    label: "Cloudflare WAF Sync",
    module: "Cloudflare WAF",
    defaultInterval: 1440,
    kind: "sync" as const,
  },
  {
    jobName: "domains-expiry-check",
    hookPath: "/api/public/hooks/domains-check",
    label: "Domínios — Verificação de Expiração",
    module: "Domínios/SSL",
    defaultInterval: 1440,
    kind: "alert" as const,
  },
  {
    jobName: "ssl-expiry-check",
    hookPath: "/api/public/hooks/ssl-check",
    label: "SSL — Verificação de Expiração",
    module: "Domínios/SSL",
    defaultInterval: 1440,
    kind: "alert" as const,
  },
  {
    jobName: "gophish-sync",
    hookPath: "/api/public/hooks/gophish-sync",
    label: "Gophish Sync",
    module: "Phishing",
    defaultInterval: 1440,
    kind: "sync" as const,
  },
  {
    jobName: "qradar-sync",
    hookPath: "/api/public/hooks/qradar-sync",
    label: "SOC · QRadar Sync",
    module: "SOC",
    defaultInterval: 240,
    kind: "sync" as const,
  },
  {
    jobName: "sophos-sync",
    hookPath: "/api/public/hooks/sophos-sync",
    label: "Sophos XDR Sync",
    module: "Sophos XDR",
    defaultInterval: 1440,
    kind: "sync" as const,
  },
  {
    jobName: "sophos-audit-sync",
    hookPath: "/api/public/hooks/sophos-audit-sync",
    label: "Sophos Audit Log Sync",
    module: "Sophos XDR",
    defaultInterval: 60,
    kind: "sync" as const,
  },
  {
    jobName: "vuln-snapshot",
    hookPath: "/api/public/hooks/vuln-snapshot",
    label: "Vulnerabilidades — Snapshot",
    module: "Vulnerabilidades",
    defaultInterval: 1440,
    kind: "sync" as const,
  },
  {
    jobName: "ranking-ia-sync",
    hookPath: "/api/public/hooks/ranking-ia-sync",
    label: "Ranking IA Sync",
    module: "Ranking IA",
    defaultInterval: 1440,
    kind: "sync" as const,
  },
  {
    jobName: "zabbix-cache-refresh",
    hookPath: "/api/public/hooks/zabbix-cache-refresh",
    label: "CMDB — Cache de Hosts Zabbix",
    module: "CMDB",
    defaultInterval: 5,
    kind: "sync" as const,
  },
  {
    jobName: "cmdb-device-alerts",
    hookPath: "/api/public/hooks/cmdb-device-alerts",
    label: "CMDB — Alertas de Dispositivos",
    module: "CMDB",
    defaultInterval: 720,
    kind: "alert" as const,
  },
  {
    jobName: "gmud-escalate-inactive",
    hookPath: "/api/public/hooks/gmud-escalate",
    label: "GMUD — Escalonamento de Aprovações",
    module: "GMUD",
    defaultInterval: 1440,
    kind: "alert" as const,
  },
  {
    jobName: "fornecedores-check",
    hookPath: "/api/public/hooks/fornecedores-check",
    label: "Fornecedores — Verificação",
    module: "Fornecedores",
    defaultInterval: 1440,
    kind: "alert" as const,
  },
  {
    jobName: "privacy-tools-sync",
    hookPath: "/api/public/hooks/privacy-tools-sync",
    label: "Privacy Tools — Sincronização Diária",
    module: "Privacy Tools",
    defaultInterval: 1440,
    kind: "sync" as const,
  },
  {
    jobName: "sek-zendesk-sync",
    hookPath: "/api/public/hooks/sek-zendesk-sync",
    label: "SOC · SEK/Zendesk — Sincronização de Tickets",
    module: "SOC",
    // Sync hoje é sempre completo (repagina tudo, ~41 páginas) -- não incremental
    // ainda -- por isso um intervalo mais espaçado que o Zabbix (5min), meio-termo
    // entre o Sophos Audit (60min) e o QRadar (240min). Ajustar quando/se a
    // sincronização virar incremental de verdade.
    defaultInterval: 60,
    kind: "sync" as const,
  },
  {
    jobName: "sast-sync",
    hookPath: "/api/public/hooks/sast-sync",
    label: "SAST — Sync App Insights",
    module: "SAST",
    // Incremental (cursor por ingestion_time) -- barato de rodar com frequência.
    defaultInterval: 15,
    kind: "sync" as const,
  },
];

// Lookup rápido job_name → tipo, usado pra rotular os cards existentes (que vêm do banco, sem esse campo)
const JOB_KIND: Record<string, "sync" | "alert"> = Object.fromEntries(KNOWN_MODULES.map((m) => [m.jobName, m.kind]));

// ─── Helpers ───────────────────────────────────────────────────────────────────

function fmtInterval(minutes: number): string {
  if (minutes % 60 === 0) return `${minutes / 60}h`;
  if (minutes < 60) return `${minutes}min`;
  return `${(minutes / 60).toFixed(1)}h`;
}

function fmtDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return "—";
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m ${seconds}s`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

// ─── CronJobsDashboard ────────────────────────────────────────────────────────

export function CronJobsDashboard() {
  const queryClient = useQueryClient();
  const toggleFn = useServerFn(toggleCronJob);
  const createFn = useServerFn(createCronJobEntry);
  const updateFn = useServerFn(updateCronJobEntry);

  const { data: jobs = [], isLoading } = useQuery({
    queryKey: ["cron-job-runs"],
    queryFn: async (): Promise<CronJobRun[]> => {
      const { data, error } = await supabase.from("cron_job_runs").select("*").order("job_name");
      if (error) throw error;
      return (data ?? []) as CronJobRun[];
    },
    refetchInterval: 60_000,
  });

  // Optimistic enabled state per job
  const [pendingToggles, setPendingToggles] = React.useState<Record<string, boolean>>({});

  // Inline edit state per job
  const [editingJob, setEditingJob] = React.useState<string | null>(null);
  const [editLabel, setEditLabel] = React.useState("");
  const [editInterval, setEditInterval] = React.useState(1440);
  const [saving, setSaving] = React.useState(false);

  // Modal state
  const [modalOpen, setModalOpen] = React.useState(false);
  const [selectedModule, setSelectedModule] = React.useState<(typeof KNOWN_MODULES)[number] | null>(null);
  const [customLabel, setCustomLabel] = React.useState("");
  const [customInterval, setCustomInterval] = React.useState(1440);
  const [customHookPath, setCustomHookPath] = React.useState("");
  const [creating, setCreating] = React.useState(false);

  const existingJobNames = new Set(jobs.map((j) => j.job_name));
  const availableModules = KNOWN_MODULES.filter((m) => !existingJobNames.has(m.jobName));

  function openModal() {
    setSelectedModule(null);
    setCustomLabel("");
    setCustomInterval(1440);
    setCustomHookPath("");
    setModalOpen(true);
  }

  function closeModal() {
    setModalOpen(false);
  }

  async function handleToggle(job: CronJobRun, newEnabled: boolean) {
    setPendingToggles((p) => ({ ...p, [job.job_name]: newEnabled }));
    try {
      await toggleFn({ data: { jobName: job.job_name, enabled: newEnabled } });
      await queryClient.invalidateQueries({ queryKey: ["cron-job-runs"] });
      toast.success(`Cron "${job.label}" ${newEnabled ? "ativado" : "desativado"}`);
    } catch (e: unknown) {
      setPendingToggles((p) => {
        const next = { ...p };
        delete next[job.job_name];
        return next;
      });
      toast.error(String(e instanceof Error ? e.message : e));
    }
  }

  async function handleCreate() {
    const mod = selectedModule;
    const label = customLabel.trim() || (mod ? mod.label : "");
    const hookPath = mod ? mod.hookPath : customHookPath.trim();

    if (!label) {
      toast.error("Informe um nome para o job");
      return;
    }
    if (!hookPath) {
      toast.error("Informe o caminho do hook (ex: /api/public/hooks/meu-hook)");
      return;
    }

    setCreating(true);
    try {
      const res = await createFn({
        data: {
          jobName: mod ? mod.jobName : label.toLowerCase().replace(/\s+/g, "-"),
          label,
          intervalMinutes: customInterval,
          hookPath,
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["cron-job-runs"] });
      toast.success(`Cron job registrado e agendado (${(res as any).schedule ?? ""})`);
      closeModal();
    } catch (e: unknown) {
      toast.error(String(e instanceof Error ? e.message : e));
    } finally {
      setCreating(false);
    }
  }

  function openEdit(job: CronJobRun) {
    setEditingJob(job.job_name);
    setEditLabel(job.label);
    setEditInterval(job.expected_interval_minutes);
  }

  function closeEdit() {
    setEditingJob(null);
  }

  async function handleUpdate(job: CronJobRun) {
    if (!editLabel.trim()) {
      toast.error("Informe um nome para o job");
      return;
    }
    setSaving(true);
    try {
      await updateFn({
        data: { jobName: job.job_name, label: editLabel.trim(), intervalMinutes: editInterval },
      });
      await queryClient.invalidateQueries({ queryKey: ["cron-job-runs"] });
      toast.success(`Cron "${editLabel.trim()}" atualizado`);
      closeEdit();
    } catch (e: unknown) {
      toast.error(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  }

  function getEnabled(job: CronJobRun): boolean {
    if (job.job_name in pendingToggles) return pendingToggles[job.job_name];
    return (job as unknown as { enabled?: boolean }).enabled !== false; // default true when column not yet present
  }

  const ok = jobs.filter((j) => getCronHealth(j).tone === "success").length;
  const issues = jobs.length - ok;
  const activeCount = jobs.filter((j) => getEnabled(j)).length;

  return (
    <div className="cj-root" style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Page header ── */}
      <div className="cj-page-header">
        <div>
          <div className="cj-page-title">Cron Jobs</div>
          <div className="cj-page-sub">
            Gerenciamento de tarefas agendadas — alertas, sincronizações e verificações automáticas.
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, alignItems: "center", flexShrink: 0 }}>
          <span className="cj-stat-pill info">
            <span className="cj-stat-dot" />
            {jobs.length} jobs
          </span>
          <span className="cj-stat-pill ok">
            <span className="cj-stat-dot" />
            {ok} ok
          </span>
          {issues > 0 && (
            <span className="cj-stat-pill err">
              <span className="cj-stat-dot" />
              {issues} problema{issues !== 1 ? "s" : ""}
            </span>
          )}
          <button className="cj-btn accent-outline" onClick={openModal}>
            <Plus style={{ width: 14, height: 14 }} />
            Novo Cron
          </button>
        </div>
      </div>

      {/* ── KPI cards ── */}
      <div className="cj-kpi-grid">
        <div className="cj-kpi-card" style={{ "--kpi-color": T.accent } as React.CSSProperties}>
          <span className="cj-kpi-label">Jobs monitorados</span>
          <span className="cj-kpi-value">
            <Timer style={{ width: 18, height: 18 }} />
            {jobs.length}
          </span>
        </div>
        <div className="cj-kpi-card" style={{ "--kpi-color": T.success } as React.CSSProperties}>
          <span className="cj-kpi-label">Ativos</span>
          <span className="cj-kpi-value">
            <Power style={{ width: 18, height: 18 }} />
            {activeCount}
          </span>
        </div>
        <div className="cj-kpi-card" style={{ "--kpi-color": T.success } as React.CSSProperties}>
          <span className="cj-kpi-label">OK (no prazo)</span>
          <span className="cj-kpi-value">
            <CheckCircle2 style={{ width: 18, height: 18 }} />
            {ok}
          </span>
        </div>
        <div className="cj-kpi-card" style={{ "--kpi-color": T.danger } as React.CSSProperties}>
          <span className="cj-kpi-label">Atrasados / com erro</span>
          <span className="cj-kpi-value">
            <AlertTriangle style={{ width: 18, height: 18 }} />
            {issues}
          </span>
        </div>
      </div>

      {/* ── Cards ── */}
      {isLoading ? (
        <div className="cj-empty">Carregando cron jobs…</div>
      ) : jobs.length === 0 ? (
        <div className="cj-empty">
          Nenhum cron job monitorado.{" "}
          <button
            className="cj-btn accent-outline"
            onClick={openModal}
            style={{ display: "inline-flex", marginLeft: 8 }}
          >
            <Plus style={{ width: 13, height: 13 }} /> Registrar primeiro job
          </button>
        </div>
      ) : (
        <div className="cj-grid">
          {jobs.map((j) => {
            const { tone, label: healthLabel } = getCronHealth(j);
            const cardColor = tone === "success" ? T.success : tone === "warning" ? T.warning : T.danger;
            const elapsed = j.last_attempt_at ? Date.now() - new Date(j.last_attempt_at).getTime() : null;
            const expectedMs = j.expected_interval_minutes * 60 * 1000;
            const pct = elapsed !== null ? Math.min(100, (elapsed / expectedMs) * 100) : 100;
            const barColor = pct < 70 ? T.success : pct < 100 ? T.warning : T.danger;
            const enabled = getEnabled(j);
            const nextRun = j.last_attempt_at ? new Date(new Date(j.last_attempt_at).getTime() + expectedMs) : null;
            const nextRunOverdue = nextRun !== null && nextRun.getTime() < Date.now();
            const kind = JOB_KIND[j.job_name];

            return (
              <div
                key={j.job_name}
                className={`cj-card${enabled ? "" : " disabled"}`}
                style={{ "--cc": cardColor } as React.CSSProperties}
              >
                {/* Header */}
                <div className="cj-card-hd">
                  <div className="cj-card-left">
                    <div
                      className={`cj-dot${tone === "success" && enabled ? " pulse" : ""}`}
                      style={{ "--cc": enabled ? cardColor : T.neutral } as React.CSSProperties}
                    />
                    <span className="cj-name">{j.label}</span>
                  </div>

                  <div className="cj-card-right">
                    {/* Health badge */}
                    <span className={`cj-badge ${tone}`}>{healthLabel}</span>

                    {/* Trigger badge */}
                    {j.last_trigger && (
                      <span className="cj-badge muted">{j.last_trigger === "cron" ? "Auto" : "Manual"}</span>
                    )}

                    {/* Edit button */}
                    <button
                      className="cj-btn ghost"
                      style={{
                        padding: "4px 8px",
                        border: `1px solid ${editingJob === j.job_name ? T.accent : T.border}`,
                        color: editingJob === j.job_name ? T.accent : T.textMuted,
                      }}
                      onClick={() => (editingJob === j.job_name ? closeEdit() : openEdit(j))}
                      title="Editar cron job"
                    >
                      <Pencil style={{ width: 12, height: 12 }} />
                    </button>

                    {/* Enabled toggle */}
                    <div className="cj-toggle-row">
                      <span className="cj-toggle-label" style={{ color: enabled ? T.success : T.textMuted }}>
                        {enabled ? "Ativo" : "Inativo"}
                      </span>
                      <Switch checked={enabled} onCheckedChange={(v) => handleToggle(j, v)} />
                    </div>
                  </div>
                </div>

                {/* Body */}
                <div className="cj-card-body">
                  {/* Stats */}
                  <div className="cj-stats">
                    <div className="cj-stat">
                      <div className="cj-stat-lbl">
                        <Clock size={9} />
                        Última tentativa
                      </div>
                      <div className="cj-stat-val">{fmtDateTime(j.last_attempt_at)}</div>
                    </div>
                    <div className="cj-stat">
                      <div className="cj-stat-lbl">
                        <CheckCircle2 size={9} />
                        Último sucesso
                      </div>
                      <div className="cj-stat-val">{fmtDateTime(j.last_success_at)}</div>
                    </div>
                    <div className="cj-stat">
                      <div className="cj-stat-lbl">
                        <Hourglass size={9} />
                        Duração sync
                      </div>
                      <div className="cj-stat-val">{fmtDuration(j.last_duration_ms)}</div>
                    </div>
                    <div className="cj-stat">
                      <div className="cj-stat-lbl">
                        <Timer size={9} />
                        Intervalo
                      </div>
                      <div className="cj-stat-val large" style={{ color: enabled ? cardColor : T.neutral }}>
                        {fmtInterval(j.expected_interval_minutes)}
                      </div>
                    </div>
                  </div>

                  {/* Próxima execução */}
                  <div
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "flex-end",
                      gap: 6,
                      fontSize: 9,
                      fontFamily: "'IBM Plex Mono',monospace",
                      textTransform: "uppercase" as const,
                      letterSpacing: "0.1em",
                      color: T.textMuted,
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <CalendarClock size={9} />
                      Próxima execução
                    </span>
                    <span
                      style={{
                        fontWeight: 600,
                        color: !enabled
                          ? T.neutral
                          : nextRunOverdue
                            ? T.danger
                            : nextRun
                              ? T.textSecondary
                              : T.textMuted,
                      }}
                    >
                      {nextRun ? fmtDateTime(nextRun.toISOString()) : "—"}
                    </span>
                  </div>

                  {/* Freshness bar */}
                  <div>
                    <div className="cj-bar-label">
                      <span>Atualidade da execução</span>
                      <span style={{ color: enabled ? barColor : T.neutral, fontWeight: 600 }}>{pct.toFixed(0)}%</span>
                    </div>
                    <div className="cj-bar-wrap">
                      <div
                        className="cj-bar"
                        style={
                          {
                            width: `${pct}%`,
                            "--bar-color": enabled ? barColor : T.neutral,
                          } as React.CSSProperties
                        }
                      />
                    </div>
                  </div>

                  {/* Job name chip */}
                  <div className="cj-jobname">
                    <span className="cj-jobname-text">{j.job_name}</span>
                    {kind && <span className={`cj-jobname-kind ${kind}`}>{kind === "sync" ? "Sync" : "Alerta"}</span>}
                  </div>

                  {/* Error panel */}
                  {j.last_error && (
                    <div className="cj-error">
                      <div className="cj-error-hd">
                        <AlertCircle size={10} />
                        Último erro registrado
                      </div>
                      <div className="cj-error-msg">{j.last_error}</div>
                    </div>
                  )}
                </div>

                {/* ── Inline edit panel ── */}
                {editingJob === j.job_name && (
                  <div className="cj-edit-panel">
                    <div className="cj-edit-panel-title">
                      <Pencil size={10} />
                      Editar cron job
                    </div>

                    <div className="cj-edit-row">
                      <div className="cj-field">
                        <span className="cj-field-label">Nome (label)</span>
                        <input
                          className="cj-input"
                          type="text"
                          value={editLabel}
                          onChange={(e) => setEditLabel(e.target.value)}
                          placeholder="Nome do job"
                        />
                      </div>

                      <div className="cj-field">
                        <span className="cj-field-label">Intervalo esperado</span>
                        <select
                          className="cj-select"
                          value={editInterval}
                          onChange={(e) => setEditInterval(Number(e.target.value))}
                        >
                          <option value={15}>15 minutos</option>
                          <option value={30}>30 minutos</option>
                          <option value={60}>1 hora</option>
                          <option value={120}>2 horas</option>
                          <option value={240}>4 horas</option>
                          <option value={480}>8 horas</option>
                          <option value={720}>12 horas</option>
                          <option value={1440}>24 horas (diário)</option>
                          <option value={10080}>7 dias (semanal)</option>
                        </select>
                      </div>
                    </div>

                    <div className="cj-edit-actions">
                      <button className="cj-btn ghost" onClick={closeEdit} disabled={saving}>
                        <X style={{ width: 12, height: 12 }} />
                        Cancelar
                      </button>
                      <button
                        className="cj-btn primary"
                        onClick={() => handleUpdate(j)}
                        disabled={saving || !editLabel.trim()}
                      >
                        <Save style={{ width: 12, height: 12 }} />
                        {saving ? "Salvando…" : "Salvar"}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal Novo Cron ── */}
      {modalOpen && (
        <div className="cj-overlay" onClick={(e) => e.target === e.currentTarget && closeModal()}>
          <div className="cj-modal">
            <div className="cj-modal-hd">
              <div className="cj-modal-title">Registrar novo Cron Job</div>
              <button className="cj-btn ghost" onClick={closeModal} style={{ padding: "4px 8px", border: "none" }}>
                <X style={{ width: 14, height: 14 }} />
              </button>
            </div>

            <div className="cj-modal-body">
              {/* Module selection */}
              {availableModules.length > 0 && (
                <div className="cj-field">
                  <span className="cj-field-label">Módulo / função</span>
                  <div className="cj-module-list">
                    {availableModules.map((m) => (
                      <div
                        key={m.jobName}
                        className={`cj-module-item${selectedModule?.jobName === m.jobName ? " selected" : ""}`}
                        onClick={() => {
                          setSelectedModule(m);
                          setCustomLabel(m.label);
                          setCustomInterval(m.defaultInterval);
                          setCustomHookPath(m.hookPath);
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <div className="cj-module-item-name">{m.label}</div>
                          <div className="cj-module-item-mod">
                            {m.module} · a cada {fmtInterval(m.defaultInterval)}
                          </div>
                        </div>
                        {selectedModule?.jobName === m.jobName && (
                          <CheckCircle2 style={{ width: 14, height: 14, color: T.accent, flexShrink: 0 }} />
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {availableModules.length === 0 && (
                <p style={{ fontSize: 12, color: T.textMuted, margin: 0, fontFamily: "'IBM Plex Mono',monospace" }}>
                  Todos os módulos conhecidos já possuem cron jobs registrados. Preencha os campos abaixo para registrar
                  um job personalizado.
                </p>
              )}

              {/* Label */}
              <div className="cj-field">
                <span className="cj-field-label">Nome (label)</span>
                <input
                  className="cj-input"
                  type="text"
                  placeholder="Ex: Meu Job de Sincronização"
                  value={customLabel}
                  onChange={(e) => setCustomLabel(e.target.value)}
                />
              </div>

              {/* Hook path — oculto quando módulo selecionado, visível para custom */}
              {!selectedModule && (
                <div className="cj-field">
                  <span className="cj-field-label">Caminho do hook</span>
                  <input
                    className="cj-input"
                    type="text"
                    placeholder="/api/public/hooks/meu-hook"
                    value={customHookPath}
                    onChange={(e) => setCustomHookPath(e.target.value)}
                  />
                </div>
              )}

              {/* Interval */}
              <div className="cj-field">
                <span className="cj-field-label">Intervalo esperado</span>
                <select
                  className="cj-select"
                  value={customInterval}
                  onChange={(e) => setCustomInterval(Number(e.target.value))}
                >
                  <option value={15}>15 minutos</option>
                  <option value={30}>30 minutos</option>
                  <option value={60}>1 hora</option>
                  <option value={120}>2 horas</option>
                  <option value={240}>4 horas</option>
                  <option value={480}>8 horas</option>
                  <option value={720}>12 horas</option>
                  <option value={1440}>24 horas (diário)</option>
                  <option value={10080}>7 dias (semanal)</option>
                </select>
              </div>

              {/* Info sobre o que acontece */}
              <p
                style={{
                  fontSize: 11,
                  color: T.textMuted,
                  margin: 0,
                  lineHeight: 1.5,
                  fontFamily: "'IBM Plex Mono',monospace",
                }}
              >
                {selectedModule
                  ? `Cria a entrada de monitoramento e agenda o job real no pg_cron. Hook: ${selectedModule.hookPath}`
                  : "Cria a entrada de monitoramento e agenda o job real no pg_cron chamando o caminho do hook informado."}
              </p>
            </div>

            <div className="cj-modal-footer">
              <button className="cj-btn ghost" onClick={closeModal} disabled={creating}>
                Cancelar
              </button>
              <button className="cj-btn primary" onClick={handleCreate} disabled={creating || !customLabel.trim()}>
                {creating ? "Registrando…" : "Registrar Job"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
