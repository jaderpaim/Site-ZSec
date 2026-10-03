import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ModuleLoading } from "@/components/layout/ModuleLoading";
import { DetailList, DetailSection, DetailSheet } from "@/components/layout/DetailSheet";
import { dialogStyle } from "./ColaboradoresPanel";
import { type CronJobRun, getCronHealth, fmtDateTime } from "./CronHealthBadge";
import { toggleCronJob, createCronJobEntry, updateCronJobEntry } from "@/lib/cron-jobs.functions";
import { AlertTriangle, Check, Plus } from "lucide-react";

const CSS = `
  .cj-root { font-family:var(--font-ui); color:var(--v2-fg); display:flex; flex-direction:column; gap:20px; font-size:14px; }
  .cj-root * { box-sizing:border-box; }
  .cj-root :focus-visible { outline:2px solid var(--v2-accent); outline-offset:2px; }
  .cj-ph { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  .cj-ph-title { font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.2; margin:0; }
  .cj-ph-sub { margin:4px 0 0; font-size:13px; color:var(--v2-fg-3); }

  .cj-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(180px, 1fr)); background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
  .cj-kpi { padding:16px 18px 14px; display:grid; gap:2px; align-content:start; box-shadow:1px 0 0 var(--v2-line), 0 1px 0 var(--v2-line); min-width:0; text-align:left; background:transparent; border:0; color:inherit; font:inherit; position:relative; }
  button.cj-kpi { cursor:pointer; }
  button.cj-kpi:hover { background:var(--v2-hover); }
  button.cj-kpi[aria-pressed="true"]::after { content:""; position:absolute; left:18px; right:18px; bottom:0; height:2px; background:var(--v2-accent); border-radius:2px; }
  .cj-kpi-label { font-size:12.5px; color:var(--v2-fg-2); display:flex; align-items:center; gap:6px; }
  .cj-kpi-value { font-size:28px; font-weight:600; letter-spacing:-0.02em; line-height:1.25; font-variant-numeric:tabular-nums; }
  .cj-kpi-foot { font-size:12px; color:var(--v2-fg-3); }
  .cj-sw { width:8px; height:8px; border-radius:2px; display:inline-block; flex-shrink:0; }

  .cj-btn { display:inline-flex; align-items:center; gap:7px; height:34px; padding:0 14px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; font-family:var(--font-ui); white-space:nowrap; border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-fg); }
  .cj-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .cj-btn:hover:not(:disabled) { background:var(--v2-hover); }
  .cj-btn.primary { background:var(--v2-accent); border-color:var(--v2-accent); color:var(--v2-accent-ink); }
  .cj-btn.primary:hover:not(:disabled) { background:var(--v2-accent); filter:brightness(1.08); }
  .cj-btn.ghost { border-color:transparent; background:transparent; }
  .cj-input, .cj-select { width:100%; height:34px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg); font-size:13px; font-family:var(--font-ui); outline:none; }
  .cj-input:focus, .cj-select:focus { border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }
  .cj-field { display:grid; gap:6px; min-width:0; font-size:12.5px; font-weight:500; color:var(--v2-fg-2); }
  .cj-field small { font-size:12px; font-weight:400; color:var(--v2-fg-3); }

  .cj-pill { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; white-space:nowrap; background:color-mix(in oklch, var(--c) 14%, transparent); color:color-mix(in oklch, var(--c) 72%, var(--v2-fg)); }
  .cj-pill::before { content:""; width:6px; height:6px; border-radius:50%; background:var(--c); }
  .cj-tag { display:inline-flex; align-items:center; height:20px; padding:0 7px; border-radius:5px; background:var(--v2-surface-2); border:1px solid var(--v2-line); font-size:11.5px; color:var(--v2-fg-2); white-space:nowrap; }
  .cj-tag.alert { color:color-mix(in oklch, var(--v2-high) 80%, var(--v2-fg)); border-color:color-mix(in oklch, var(--v2-high) 40%, transparent); }
  .cj-seg { display:inline-flex; padding:2px; gap:2px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); }
  .cj-seg button { height:28px; padding:0 10px; border:0; border-radius:6px; background:transparent; color:var(--v2-fg-2); font:500 13px var(--font-ui); cursor:pointer; white-space:nowrap; }
  .cj-seg button:hover { color:var(--v2-fg); }
  .cj-seg button[aria-pressed="true"] { background:var(--v2-surface-2); color:var(--v2-fg); box-shadow:0 0 0 1px var(--v2-line); }

  /* ── Linha do tempo ── */
  .cj-tl { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; min-width:0; }
  .cj-tl-h { display:flex; gap:8px 12px; align-items:center; flex-wrap:wrap; padding:12px 18px; border-bottom:1px solid var(--v2-line); }
  .cj-tl-h > b { font-size:14px; font-weight:600; }
  .cj-tl-h > b span { font-weight:400; font-size:13px; color:var(--v2-fg-3); }
  .cj-tl-h .cj-input { margin-left:auto; width:200px; max-width:100%; }
  .cj-tl-scroll { overflow-x:auto; }
  .cj-tl-grid { min-width:900px; display:grid; grid-template-columns:250px minmax(0, 1fr) 64px; }
  .cj-tl-grid > * { min-width:0; }
  .cj-tl-axis { position:relative; height:30px; border-bottom:1px solid var(--v2-line); }
  .cj-tl-axis span { position:absolute; top:9px; transform:translateX(-50%); font:500 11px var(--font-data); color:var(--v2-fg-3); white-space:nowrap; }
  .cj-tl-axis span.now { color:var(--v2-accent); font-weight:600; }
  .cj-tl-gh { grid-column:1 / -1; padding:10px 18px 6px; font-size:11px; font-weight:600; letter-spacing:0.06em; text-transform:uppercase; color:var(--v2-fg-3); background:var(--v2-surface-2); border-bottom:1px solid var(--v2-line); }
  .cj-tl-empty { grid-column:1 / -1; padding:24px 18px; color:var(--v2-fg-3); font-size:13px; }
  .cj-tl-row { display:contents; cursor:pointer; }
  .cj-tl-row > div { border-bottom:1px solid var(--v2-line); min-height:52px; }
  .cj-tl-row:hover > div, .cj-tl-row:focus-visible > div { background:var(--v2-hover); }
  .cj-tl-row:focus-visible { outline:none; }
  .cj-tl-name { display:flex; gap:10px; align-items:center; padding:8px 12px 8px 18px; }
  .cj-tl-name .dot { width:9px; height:9px; border-radius:50%; background:var(--c); flex:none; box-shadow:0 0 0 3px color-mix(in oklch, var(--c) 20%, transparent); }
  .cj-tl-name b { display:block; font-size:13px; font-weight:500; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .cj-tl-name small { display:block; font:400 11.5px var(--font-data); color:var(--v2-fg-3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .cj-tl-row.off .cj-tl-name, .cj-tl-row.off .cj-tl-track { opacity:0.45; }
  .cj-tl-track { position:relative; }
  .cj-tl-track > svg { position:absolute; inset:0; width:100%; height:100%; overflow:visible; }
  .cj-tl-track .vl { position:absolute; top:0; bottom:0; width:1px; background:var(--v2-line); opacity:0.6; }
  .cj-tl-track .base { position:absolute; left:0; right:0; top:50%; height:1px; background:var(--v2-line); }
  .cj-tl-track .nowl { position:absolute; top:0; bottom:0; width:2px; margin-left:-1px; background:var(--v2-accent); opacity:0.7; }
  .cj-tl-track .fut1 { position:absolute; top:50%; width:10px; height:10px; margin:-5px 0 0 -5px; border-radius:50%; border:1.5px dashed var(--v2-fg-3); background:var(--v2-surface); }
  .cj-tl-track .last { position:absolute; top:50%; width:14px; height:14px; margin:-7px 0 0 -7px; border-radius:50%; background:var(--c); border:2px solid var(--v2-surface); box-shadow:0 0 0 1px var(--c); z-index:2; }
  .cj-tl-track .gap { position:absolute; top:50%; height:18px; margin-top:-9px; border-radius:3px; background:repeating-linear-gradient(135deg, color-mix(in oklch, var(--v2-crit) 35%, transparent) 0 4px, transparent 4px 8px); border:1px solid color-mix(in oklch, var(--v2-crit) 45%, transparent); }
  .cj-tl-track .edge { position:absolute; left:4px; top:50%; transform:translateY(-50%); font:500 11px var(--font-data); color:var(--v2-crit); background:var(--v2-surface); padding:0 4px; z-index:2; white-space:nowrap; }
  .cj-tl-row:hover .edge { background:var(--v2-hover); }
  .cj-tl-sw { display:grid; place-items:center; }
  .cj-tl-leg { display:flex; flex-wrap:wrap; gap:6px 16px; padding:10px 18px; font-size:12px; color:var(--v2-fg-3); }
  .cj-tl-leg span { display:inline-flex; gap:6px; align-items:center; }
  .cj-tl-leg i { display:inline-block; }

  /* ── Listas ── */
  .cj-duo { display:grid; grid-template-columns:repeat(auto-fit, minmax(340px, 1fr)); gap:16px; }
  .cj-lst { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; min-width:0; }
  .cj-lst h3 { margin:0; padding:12px 18px; font-size:14px; font-weight:600; border-bottom:1px solid var(--v2-line); }
  .cj-lst h3 span { font-weight:400; font-size:12.5px; color:var(--v2-fg-3); }
  .cj-lst ol { list-style:none; margin:0; padding:4px 0; }
  .cj-lst li { display:grid; grid-template-columns:84px minmax(0, 1fr) auto; gap:12px; align-items:center; padding:8px 18px; cursor:pointer; }
  .cj-lst li.prob { grid-template-columns:120px minmax(0, 1fr); }
  .cj-lst li:hover { background:var(--v2-hover); }
  .cj-lst .t { font:500 13px var(--font-data); }
  .cj-lst .t small { display:block; font-weight:400; font-size:11px; color:var(--v2-fg-3); }
  .cj-lst li b { font-size:13px; font-weight:500; display:block; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .cj-lst .e { display:block; font:400 12px var(--font-data); color:var(--v2-fg-3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  .cj-lst .empty { padding:20px 18px; color:var(--v2-fg-3); font-size:13px; }

  .cj-errbox { padding:10px 12px; border-radius:8px; background:color-mix(in oklch, var(--v2-crit) 9%, transparent); border:1px solid color-mix(in oklch, var(--v2-crit) 28%, transparent); font:400 12.5px var(--font-data); color:var(--v2-fg-2); overflow-wrap:anywhere; white-space:pre-wrap; }
  .cj-mods { display:grid; gap:6px; max-height:280px; overflow-y:auto; }
  .cj-mods button { display:grid; grid-template-columns:minmax(0, 1fr) auto; gap:2px 10px; align-items:center; padding:9px 12px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-surface); color:var(--v2-fg); font:13px var(--font-ui); text-align:left; cursor:pointer; }
  .cj-mods button:hover { background:var(--v2-hover); }
  .cj-mods button[aria-pressed="true"] { border-color:var(--v2-accent); background:color-mix(in oklch, var(--v2-accent) 10%, transparent); }
  .cj-mods b { font-weight:500; }
  .cj-mods small { grid-column:1; font-size:12px; color:var(--v2-fg-3); font-weight:400; }
  .cj-mods svg { grid-row:1 / span 2; grid-column:2; color:var(--v2-accent); }
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
const JOB_KIND: Record<string, "sync" | "alert"> = Object.fromEntries(
  KNOWN_MODULES.map((m) => [m.jobName, m.kind]),
);

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

const INTERVAL_OPTIONS: Array<[number, string]> = [
  [15, "15 minutos"],
  [30, "30 minutos"],
  [60, "1 hora"],
  [120, "2 horas"],
  [240, "4 horas"],
  [480, "8 horas"],
  [720, "12 horas"],
  [1440, "24 horas (diário)"],
  [10080, "7 dias (semanal)"],
];

const MIN = 60_000;
// Mesmo limiar do getCronHealth para considerar o job atrasado
const STALE_BUFFER_MS = 60 * MIN;
// Janela da linha do tempo: últimas 24h → agora → próximas 12h
const PAST_MS = 24 * 60 * MIN;
const FUTURE_MS = 12 * 60 * MIN;
const AXIS_HOURS = [-24, -18, -12, -6, 0, 6, 12];

function fmtFreq(minutes: number) {
  if (minutes === 1440) return "diário";
  if (minutes === 10080) return "semanal";
  return `a cada ${fmtInterval(minutes)}`;
}

function fmtRel(ms: number) {
  const m = Math.round(Math.abs(ms) / MIN);
  if (m < 60) return `${m} min`;
  if (m < 1440) return `${Math.round(m / 60)}h`;
  return `${Math.round(m / 1440)}d`;
}

const fmtHour = (t: number) =>
  new Date(t).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

type StatusKey = "ok" | "bad" | "off";
type Status = { key: StatusKey; label: string; color: string };

// Traduz o getCronHealth para a situação exibida (com "Desativado" à parte)
function statusOf(job: CronJobRun, enabled: boolean): Status {
  if (!enabled) return { key: "off", label: "Desativado", color: "var(--v2-fg-3)" };
  const { tone, label } = getCronHealth(job);
  if (tone === "success") return { key: "ok", label: "No prazo", color: "var(--v2-ok)" };
  if (label.startsWith("Em execução"))
    return { key: "ok", label: "Em execução", color: "var(--v2-low)" };
  if (tone === "danger") {
    return {
      key: "bad",
      label: job.last_attempt_at ? "Atrasado" : "Nunca executado",
      color: "var(--v2-crit)",
    };
  }
  return {
    key: "bad",
    label: label === "Cron interrompido" ? "Interrompido" : "Com erro",
    color: "var(--v2-high)",
  };
}

function isStale(job: CronJobRun, now: number) {
  if (!job.last_attempt_at) return true;
  return (
    now - new Date(job.last_attempt_at).getTime() >
    job.expected_interval_minutes * MIN + STALE_BUFFER_MS
  );
}

// ─── Linha do tempo de um job ─────────────────────────────────────────────────

function TimelineTrack({
  job,
  status,
  enabled,
  dispatches,
  now,
}: {
  job: CronJobRun;
  status: Status;
  enabled: boolean;
  dispatches: number[];
  now: number;
}) {
  const t0 = now - PAST_MS;
  const t1 = now + FUTURE_MS;
  const x = (t: number) => ((t - t0) / (t1 - t0)) * 100;
  const span = job.expected_interval_minutes * MIN;
  const last = job.last_attempt_at ? new Date(job.last_attempt_at).getTime() : null;
  const next = last !== null ? last + span : null;
  const stale = enabled && isStale(job, now);

  // Execuções previstas (só para jobs ativos e sem atraso)
  const future: number[] = [];
  if (enabled && next !== null && !stale) {
    for (let t = Math.max(next, now); t <= t1 && future.length < 400; t += span) future.push(t);
  }
  const dense = future.length > 24;
  // Disparos do agendador (cron_http_dispatch_log) — um path só por linha
  const dispPath = dispatches
    .filter((t) => t >= t0 && t <= now)
    .map((t) => `M${(x(t) * 10).toFixed(1)} 15V29`)
    .join("");
  const futPath = dense ? future.map((t) => `M${(x(t) * 10).toFixed(1)} 17V27`).join("") : "";

  return (
    <div className="cj-tl-track">
      {AXIS_HOURS.map((h) => (
        <i key={h} className="vl" style={{ left: `${x(now + h * 60 * MIN)}%` }} />
      ))}
      <i className="base" />
      <svg viewBox="0 0 1000 44" preserveAspectRatio="none" aria-hidden="true">
        {dispPath && (
          <path
            d={dispPath}
            stroke="var(--v2-fg-3)"
            strokeOpacity={0.6}
            strokeWidth={2}
            vectorEffect="non-scaling-stroke"
          />
        )}
        {futPath && (
          <path
            d={futPath}
            stroke="var(--v2-fg-3)"
            strokeOpacity={0.4}
            strokeWidth={1}
            strokeDasharray="2 2"
            vectorEffect="non-scaling-stroke"
          />
        )}
      </svg>
      {stale && next !== null && (
        <i
          className="gap"
          style={{ left: `${Math.max(0, x(next))}%`, width: `${x(now) - Math.max(0, x(next))}%` }}
          title={`Deveria ter rodado em ${fmtDateTime(new Date(next).toISOString())}`}
        />
      )}
      {!dense &&
        future.map((t) => (
          <i
            key={t}
            className="fut1"
            style={{ left: `${x(t)}%` }}
            title={`Prevista ${fmtDateTime(new Date(t).toISOString())}`}
          />
        ))}
      {dense && (
        <i
          className="fut1"
          style={{ left: `${x(future[0])}%` }}
          title={`Próxima ${fmtDateTime(new Date(future[0]).toISOString())}`}
        />
      )}
      <i className="nowl" style={{ left: `${x(now)}%` }} />
      {last === null ? (
        <i className="edge" style={enabled ? undefined : { color: "var(--v2-fg-3)" }}>
          nunca executado
        </i>
      ) : last < t0 ? (
        <i
          className="edge"
          style={enabled ? undefined : { color: "var(--v2-fg-3)" }}
          title="Última execução fora da janela de 24h"
        >
          ◀ {fmtDateTime(job.last_attempt_at)}
        </i>
      ) : (
        <i
          className="last"
          style={{ left: `${x(last)}%`, "--c": status.color } as React.CSSProperties}
          title={`Última execução: ${fmtDateTime(job.last_attempt_at)} · ${fmtDuration(job.last_duration_ms)}`}
        />
      )}
    </div>
  );
}

// ─── CronJobsDashboard ────────────────────────────────────────────────────────

type Filter = "all" | StatusKey;

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

  // Disparos do pg_cron nas últimas 24h (só admin lê; jobs agendados antes do log não aparecem)
  const { data: dispatchLog = [] } = useQuery({
    queryKey: ["cron-dispatch-log"],
    queryFn: async () => {
      const since = new Date(Date.now() - PAST_MS).toISOString();
      const { data, error } = await supabase
        .from("cron_http_dispatch_log")
        .select("job_name, dispatched_at")
        .gte("dispatched_at", since)
        .order("dispatched_at", { ascending: false })
        .limit(5000);
      if (error) return [];
      return data ?? [];
    },
    refetchInterval: 60_000,
  });

  const dispatches = React.useMemo(() => {
    const map = new Map<string, number[]>();
    for (const d of dispatchLog) {
      const list = map.get(d.job_name) ?? [];
      list.push(new Date(d.dispatched_at).getTime());
      map.set(d.job_name, list);
    }
    return map;
  }, [dispatchLog]);

  // "Agora" da linha do tempo — avança a cada minuto
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const [filter, setFilter] = React.useState<Filter>("all");
  const [search, setSearch] = React.useState("");

  // Optimistic enabled state per job
  const [pendingToggles, setPendingToggles] = React.useState<Record<string, boolean>>({});

  // Painel lateral (detalhe + edição)
  const [openJob, setOpenJob] = React.useState<string | null>(null);
  const [editLabel, setEditLabel] = React.useState("");
  const [editInterval, setEditInterval] = React.useState(1440);
  const [saving, setSaving] = React.useState(false);

  // Modal state
  const [modalOpen, setModalOpen] = React.useState(false);
  const [selectedModule, setSelectedModule] = React.useState<(typeof KNOWN_MODULES)[number] | null>(
    null,
  );
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
      toast.success(
        `Cron job registrado e agendado (${(res as { schedule?: string }).schedule ?? ""})`,
      );
      setModalOpen(false);
    } catch (e: unknown) {
      toast.error(String(e instanceof Error ? e.message : e));
    } finally {
      setCreating(false);
    }
  }

  function openDetail(job: CronJobRun) {
    setOpenJob(job.job_name);
    setEditLabel(job.label);
    setEditInterval(job.expected_interval_minutes);
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
      setOpenJob(null);
    } catch (e: unknown) {
      toast.error(String(e instanceof Error ? e.message : e));
    } finally {
      setSaving(false);
    }
  }

  function getEnabled(job: CronJobRun): boolean {
    if (job.job_name in pendingToggles) return pendingToggles[job.job_name];
    return job.enabled !== false; // default true when column not yet present
  }

  if (isLoading) return <ModuleLoading />;

  const items = jobs.map((j) => {
    const enabled = getEnabled(j);
    return { job: j, enabled, status: statusOf(j, enabled), kind: JOB_KIND[j.job_name] ?? "sync" };
  });
  const count = (k: StatusKey) => items.filter((i) => i.status.key === k).length;
  const okCount = count("ok");
  const badCount = count("bad");
  const offCount = count("off");
  const syncTotal = items.filter((i) => i.kind === "sync").length;

  const q = search.trim().toLowerCase();
  const order: Record<StatusKey, number> = { bad: 0, ok: 1, off: 2 };
  const rows = items
    .filter((i) => filter === "all" || i.status.key === filter)
    .filter((i) => !q || `${i.job.label} ${i.job.job_name}`.toLowerCase().includes(q))
    .sort((a, b) => order[a.status.key] - order[b.status.key]);
  const syncRows = rows.filter((i) => i.kind === "sync");
  const alertRows = rows.filter((i) => i.kind === "alert");

  const upcoming = items
    .filter((i) => i.enabled && i.job.last_attempt_at)
    .map((i) => ({
      ...i,
      next: new Date(i.job.last_attempt_at!).getTime() + i.job.expected_interval_minutes * MIN,
    }))
    .sort((a, b) => a.next - b.next)
    .slice(0, 6);
  const problems = items.filter((i) => i.status.key === "bad");

  const selected = items.find((i) => i.job.job_name === openJob) ?? null;
  const t0 = now - PAST_MS;
  const axisX = (t: number) => ((t - t0) / (PAST_MS + FUTURE_MS)) * 100;

  const kpiFilter = (k: StatusKey) => setFilter((f) => (f === k ? "all" : k));

  const renderRow = (i: (typeof items)[number]) => (
    <div
      key={i.job.job_name}
      className={`cj-tl-row${i.enabled ? "" : " off"}`}
      role="button"
      tabIndex={0}
      onClick={() => openDetail(i.job)}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          openDetail(i.job);
        }
      }}
    >
      <div
        className="cj-tl-name"
        style={{ "--c": i.status.color } as React.CSSProperties}
        title={i.status.label}
      >
        <span className="dot" />
        <div style={{ minWidth: 0 }}>
          <b>{i.job.label}</b>
          <small>
            {i.job.job_name} · {fmtFreq(i.job.expected_interval_minutes)}
          </small>
        </div>
      </div>
      <TimelineTrack
        job={i.job}
        status={i.status}
        enabled={i.enabled}
        dispatches={dispatches.get(i.job.job_name) ?? []}
        now={now}
      />
      <div
        className="cj-tl-sw"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <Switch
          checked={i.enabled}
          onCheckedChange={(v) => handleToggle(i.job, v)}
          aria-label={`${i.enabled ? "Desativar" : "Ativar"} ${i.job.label}`}
        />
      </div>
    </div>
  );

  return (
    <div className="cj-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="cj-ph">
        <div>
          <h1 className="cj-ph-title">Cron Jobs</h1>
          <p className="cj-ph-sub">
            Tarefas agendadas: sincronizações, verificações e alertas automáticos · atualiza a cada
            minuto
          </p>
        </div>
        <button className="cj-btn primary" onClick={openModal}>
          <Plus size={14} />
          Novo cron
        </button>
      </div>

      <div className="cj-kpis">
        <div className="cj-kpi">
          <span className="cj-kpi-label">Jobs monitorados</span>
          <span className="cj-kpi-value">{jobs.length}</span>
          <span className="cj-kpi-foot">
            {syncTotal} sincronizações · {jobs.length - syncTotal} alertas
          </span>
        </div>
        <button className="cj-kpi" aria-pressed={filter === "ok"} onClick={() => kpiFilter("ok")}>
          <span className="cj-kpi-label">
            <span className="cj-sw" style={{ background: "var(--v2-ok)" }} />
            No prazo
          </span>
          <span className="cj-kpi-value">{okCount}</span>
          <span className="cj-kpi-foot">rodaram dentro do intervalo</span>
        </button>
        <button className="cj-kpi" aria-pressed={filter === "bad"} onClick={() => kpiFilter("bad")}>
          <span className="cj-kpi-label">
            {badCount > 0 && <span className="cj-sw" style={{ background: "var(--v2-crit)" }} />}
            Atrasados ou com erro
          </span>
          <span className="cj-kpi-value">{badCount}</span>
          <span className="cj-kpi-foot">precisam de atenção</span>
        </button>
        <button className="cj-kpi" aria-pressed={filter === "off"} onClick={() => kpiFilter("off")}>
          <span className="cj-kpi-label">Desativados</span>
          <span className="cj-kpi-value">{offCount}</span>
          <span className="cj-kpi-foot">não estão rodando</span>
        </button>
      </div>

      <section className="cj-tl">
        <div className="cj-tl-h">
          <b>
            Linha do tempo <span>· últimas 24h e próximas 12h</span>
          </b>
          <div className="cj-seg" role="group" aria-label="Situação">
            {(
              [
                ["all", "Todos"],
                ["bad", "Com problema"],
                ["ok", "No prazo"],
                ["off", "Desativados"],
              ] as Array<[Filter, string]>
            ).map(([k, l]) => (
              <button key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>
                {l}
              </button>
            ))}
          </div>
          <input
            className="cj-input"
            placeholder="Buscar job"
            aria-label="Buscar job"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="cj-tl-scroll">
          <div className="cj-tl-grid">
            <div />
            <div className="cj-tl-axis">
              {AXIS_HOURS.map((h) => (
                <span
                  key={h}
                  className={h === 0 ? "now" : undefined}
                  style={{ left: `${axisX(now + h * 60 * MIN)}%` }}
                >
                  {h === 0 ? "agora" : fmtHour(now + h * 60 * MIN)}
                </span>
              ))}
            </div>
            <div />
            {syncRows.length > 0 && (
              <>
                <div className="cj-tl-gh">Sincronizações · {syncRows.length}</div>
                {syncRows.map(renderRow)}
              </>
            )}
            {alertRows.length > 0 && (
              <>
                <div className="cj-tl-gh">Alertas e verificações · {alertRows.length}</div>
                {alertRows.map(renderRow)}
              </>
            )}
            {rows.length === 0 && (
              <div className="cj-tl-empty">
                {jobs.length === 0
                  ? "Nenhum cron job monitorado ainda."
                  : "Nenhum job encontrado com esse filtro."}
              </div>
            )}
          </div>
        </div>
        <div className="cj-tl-leg">
          <span>
            <i style={{ width: 12, height: 12, borderRadius: "50%", background: "var(--v2-ok)" }} />
            Última execução (cor = situação)
          </span>
          <span>
            <i style={{ width: 2, height: 12, background: "var(--v2-fg-3)" }} />
            Disparos do agendador
          </span>
          <span>
            <i
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                border: "1.5px dashed var(--v2-fg-3)",
              }}
            />
            Previstas
          </span>
          <span>
            <i
              style={{
                width: 18,
                height: 10,
                borderRadius: 2,
                background:
                  "repeating-linear-gradient(135deg, color-mix(in oklch, var(--v2-crit) 45%, transparent) 0 3px, transparent 3px 6px)",
              }}
            />
            Atraso
          </span>
        </div>
      </section>

      <div className="cj-duo">
        <section className="cj-lst">
          <h3>
            Próximas execuções <span>· ativos</span>
          </h3>
          {upcoming.length ? (
            <ol>
              {upcoming.map((i) => (
                <li key={i.job.job_name} onClick={() => openDetail(i.job)}>
                  <span className="t">
                    {i.status.label === "Atrasado" ? (
                      <span style={{ color: "var(--v2-crit)" }}>atrasado</span>
                    ) : i.next < now ? (
                      "agora"
                    ) : (
                      fmtHour(i.next)
                    )}
                    <small>
                      {i.next < now ? `há ${fmtRel(now - i.next)}` : `em ${fmtRel(i.next - now)}`}
                    </small>
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <b>{i.job.label}</b>
                    <span className="e">{i.job.job_name}</span>
                  </span>
                  <span className={`cj-tag${i.kind === "alert" ? " alert" : ""}`}>
                    {i.kind === "sync" ? "Sync" : "Alerta"}
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="empty">Nenhum job ativo com execução registrada.</div>
          )}
        </section>
        <section className="cj-lst">
          <h3>
            Precisam de atenção <span>· {problems.length}</span>
          </h3>
          {problems.length ? (
            <ol>
              {problems.map((i) => (
                <li key={i.job.job_name} className="prob" onClick={() => openDetail(i.job)}>
                  <span>
                    <span
                      className="cj-pill"
                      style={{ "--c": i.status.color } as React.CSSProperties}
                    >
                      {i.status.label}
                    </span>
                  </span>
                  <span style={{ minWidth: 0 }}>
                    <b>{i.job.label}</b>
                    <span className="e" title={i.job.last_error ?? undefined}>
                      {i.job.last_error ||
                        (i.job.last_attempt_at
                          ? `sem execução desde ${fmtDateTime(i.job.last_attempt_at)}`
                          : "nunca executado")}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="empty">Tudo rodando dentro do prazo.</div>
          )}
        </section>
      </div>

      {/* ── Detalhe / edição ── */}
      <DetailSheet
        open={!!selected}
        onOpenChange={(o) => !o && setOpenJob(null)}
        eyebrow={selected?.job.job_name}
        title={selected?.job.label ?? ""}
        badges={
          selected && (
            <>
              <span
                className="cj-pill"
                style={{ "--c": selected.status.color } as React.CSSProperties}
              >
                {selected.status.label}
              </span>
              <span className={`cj-tag${selected.kind === "alert" ? " alert" : ""}`}>
                {selected.kind === "sync" ? "Sincronização" : "Alerta"}
              </span>
            </>
          )
        }
        footer={
          selected && (
            <>
              <button
                className="cj-btn ghost"
                style={{ marginRight: "auto" }}
                onClick={() => setOpenJob(null)}
              >
                Fechar
              </button>
              <button
                className="cj-btn primary"
                onClick={() => handleUpdate(selected.job)}
                disabled={saving || !editLabel.trim()}
              >
                <Check size={14} />
                {saving ? "Salvando…" : "Salvar"}
              </button>
            </>
          )
        }
      >
        {selected && (
          <div className="cj-root" style={{ gap: 20 }}>
            {selected.job.last_error && (
              <DetailSection title="Último erro">
                <div className="cj-errbox">{selected.job.last_error}</div>
              </DetailSection>
            )}
            <DetailSection title="Execuções">
              <DetailList
                items={[
                  [
                    "Última tentativa",
                    selected.job.last_attempt_at
                      ? `${fmtDateTime(selected.job.last_attempt_at)}${
                          selected.job.last_trigger
                            ? ` · ${selected.job.last_trigger === "cron" ? "automática" : "manual"}`
                            : ""
                        }`
                      : "nunca",
                  ],
                  ["Último sucesso", fmtDateTime(selected.job.last_success_at)],
                  ["Duração", fmtDuration(selected.job.last_duration_ms), true],
                  [
                    "Próxima prevista",
                    !selected.enabled
                      ? "desativado"
                      : selected.job.last_attempt_at
                        ? fmtDateTime(
                            new Date(
                              new Date(selected.job.last_attempt_at).getTime() +
                                selected.job.expected_interval_minutes * MIN,
                            ).toISOString(),
                          )
                        : "—",
                  ],
                  [
                    "Disparos (24h)",
                    dispatches.has(selected.job.job_name)
                      ? String(dispatches.get(selected.job.job_name)!.length)
                      : "sem registro no log",
                  ],
                ]}
              />
            </DetailSection>
            <DetailSection title="Configuração">
              <div style={{ display: "grid", gap: 12 }}>
                <label className="cj-field">
                  Nome
                  <input
                    className="cj-input"
                    value={editLabel}
                    onChange={(e) => setEditLabel(e.target.value)}
                  />
                </label>
                <label className="cj-field">
                  Intervalo esperado
                  <select
                    className="cj-select"
                    value={editInterval}
                    onChange={(e) => setEditInterval(Number(e.target.value))}
                  >
                    {!INTERVAL_OPTIONS.some(([v]) => v === editInterval) && (
                      <option value={editInterval}>{fmtInterval(editInterval)}</option>
                    )}
                    {INTERVAL_OPTIONS.map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </select>
                  <small>
                    Reagenda o job no pg_cron e define quando ele passa a contar como atrasado
                  </small>
                </label>
              </div>
            </DetailSection>
          </div>
        )}
      </DetailSheet>

      {/* ── Novo cron ── */}
      <Dialog open={modalOpen} onOpenChange={(o) => !creating && setModalOpen(o)}>
        <DialogContent className="font-ui sm:max-w-lg" style={dialogStyle}>
          <DialogHeader>
            <DialogTitle>Registrar novo cron</DialogTitle>
          </DialogHeader>
          <div className="cj-root" style={{ gap: 14 }}>
            <div className="cj-field">
              Módulo / função
              <div className="cj-mods">
                {availableModules.map((m) => {
                  const on = selectedModule?.jobName === m.jobName;
                  return (
                    <button
                      key={m.jobName}
                      type="button"
                      aria-pressed={on}
                      onClick={() => {
                        setSelectedModule(m);
                        setCustomLabel(m.label);
                        setCustomInterval(m.defaultInterval);
                        setCustomHookPath(m.hookPath);
                      }}
                    >
                      <b>{m.label}</b>
                      {on && <Check size={14} />}
                      <small>
                        {m.module} · {fmtFreq(m.defaultInterval)}
                      </small>
                    </button>
                  );
                })}
                <button
                  type="button"
                  aria-pressed={!selectedModule}
                  onClick={() => {
                    setSelectedModule(null);
                    setCustomHookPath("");
                  }}
                >
                  <b>Personalizado</b>
                  {!selectedModule && <Check size={14} />}
                  <small>Informe o caminho do hook</small>
                </button>
              </div>
            </div>
            <label className="cj-field">
              Nome
              <input
                className="cj-input"
                placeholder="Ex.: Meu job de sincronização"
                value={customLabel}
                onChange={(e) => setCustomLabel(e.target.value)}
              />
            </label>
            {!selectedModule && (
              <label className="cj-field">
                Caminho do hook
                <input
                  className="cj-input"
                  placeholder="/api/public/hooks/meu-hook"
                  value={customHookPath}
                  onChange={(e) => setCustomHookPath(e.target.value)}
                />
                <small>Rota pública em src/routes/api/public/hooks</small>
              </label>
            )}
            <label className="cj-field">
              Intervalo esperado
              <select
                className="cj-select"
                value={customInterval}
                onChange={(e) => setCustomInterval(Number(e.target.value))}
              >
                {!INTERVAL_OPTIONS.some(([v]) => v === customInterval) && (
                  <option value={customInterval}>{fmtInterval(customInterval)}</option>
                )}
                {INTERVAL_OPTIONS.map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <p
              className="cj-ph-sub"
              style={{ margin: 0, display: "flex", gap: 6, alignItems: "flex-start" }}
            >
              <AlertTriangle size={13} style={{ flex: "none", marginTop: 2 }} />
              {selectedModule
                ? `Cria a entrada de monitoramento e agenda o job no pg_cron. Hook: ${selectedModule.hookPath}`
                : "Cria a entrada de monitoramento e agenda o job no pg_cron chamando o hook informado."}
            </p>
          </div>
          <DialogFooter>
            <button
              className="cj-btn ghost"
              onClick={() => setModalOpen(false)}
              disabled={creating}
            >
              Cancelar
            </button>
            <button
              className="cj-btn primary"
              onClick={handleCreate}
              disabled={creating || !customLabel.trim()}
            >
              {creating ? "Registrando…" : "Registrar e agendar"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
