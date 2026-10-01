import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { Network, Server, AlertOctagon, Clock, Activity, Loader2, Lock, ShieldOff } from "lucide-react";
import { usePermissions } from "@/lib/use-permissions";
import { supabase } from "@/integrations/supabase/client";
import {
  listIndisponibilidades,
  listCmdbAtivosMin,
  listSiemSources,
  syncIndisponibilidades,
  type IndisponibilidadeRow,
  type CmdbAtivoMin,
  type SiemSource,
} from "@/lib/disponibilidade.functions";
import { listZabbixMonitoredHosts } from "@/lib/zabbix.functions";
import { getCronHealth } from "./CronHealthBadge";

// ── Design Tokens ──────────────────────────────────────────────────────────────
const T = {
  bg: "#0A0D14",
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
  cyan: "#22D3EE",
  neutral: "#6B7280",
  textPrimary: "#F1F5F9",
  textSecondary: "#94A3B8",
  textMuted: "#64748B",
  textSubtle: "#475569",
  chartGrid: "rgba(30,38,64,0.7)",
  chartAxis: "#334155",
  chartTick: "#64748B",
};

// ── CSS ────────────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');

  .dp-root { font-family:'DM Sans',sans-serif; color:${T.textPrimary}; display:flex; flex-direction:column; gap:16px; }
  .dp-root * { box-sizing:border-box; }
  @keyframes dp-spin   { to{transform:rotate(360deg)} }
  @keyframes dp-fadeup { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  @keyframes dp-pulse  { 0%,100%{box-shadow:0 0 0 0 rgba(239,68,68,0.5)} 50%{box-shadow:0 0 0 5px rgba(239,68,68,0)} }
  .dp-spin   { animation:dp-spin 0.75s linear infinite; }
  .dp-fadeup { animation:dp-fadeup 0.3s ease forwards; }
  .dp-live-dot { width:6px;height:6px;border-radius:50%;background:${T.danger};animation:dp-pulse 1.6s infinite;flex-shrink:0; }

  .dp-root ::-webkit-scrollbar       { width:4px; height:4px; }
  .dp-root ::-webkit-scrollbar-track { background:transparent; }
  .dp-root ::-webkit-scrollbar-thumb { background:${T.borderHi}; border-radius:2px; }

  .dp-root .recharts-cartesian-axis-tick-value { fill:${T.chartTick} !important; font-size:10px; font-family:'IBM Plex Mono',monospace; }

  /* ── Header ── */
  .dp-hdr { background:${T.surface}; border:1px solid ${T.border}; border-radius:12px; padding:16px 22px; display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  .dp-hdr-brand { display:flex; align-items:center; gap:12px; }
  .dp-hdr-icon { width:40px; height:40px; border-radius:10px; display:flex; align-items:center; justify-content:center; background:rgba(34,211,238,0.14); border:1px solid rgba(34,211,238,0.3); flex-shrink:0; }
  .dp-hdr-title { font-size:15px; font-weight:700; font-family:'Space Grotesk',sans-serif; letter-spacing:-0.01em; }
  .dp-hdr-sub { font-size:11px; color:${T.textMuted}; margin-top:2px; }
  .dp-hdr-pills { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .dp-pill { display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:5px; font-size:11px; font-family:'IBM Plex Mono',monospace; font-weight:700; border:1px solid transparent; }

  /* ── KPI ── */
  .dp-kpi-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:12px; }
  @media (max-width:1100px){ .dp-kpi-grid { grid-template-columns:repeat(3,1fr); } }
  @media (max-width:700px){ .dp-kpi-grid { grid-template-columns:repeat(2,1fr); } }
  .dp-kpi { background:${T.surface}; border:1px solid ${T.border}; border-radius:10px; padding:14px 16px; position:relative; overflow:hidden; transition:border-color 0.2s; }
  .dp-kpi:hover { border-color:${T.borderHi}; }
  .dp-kpi::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; background:var(--kc,${T.accent}); }
  .dp-kpi-icon { position:absolute; top:10px; right:10px; width:40px; height:40px; border-radius:9px; display:flex; align-items:center; justify-content:center; background:var(--ki-bg,${T.accentGlow}); }
  .dp-kpi-label { font-size:9px; font-weight:700; letter-spacing:0.13em; text-transform:uppercase; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; margin-bottom:5px; max-width:calc(100% - 44px); }
  .dp-kpi-value { font-size:26px; font-weight:700; font-family:'Space Grotesk',sans-serif; letter-spacing:-0.02em; line-height:1; color:var(--kc,${T.textPrimary}); }
  .dp-kpi-hint { font-size:10px; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; margin-top:5px; }

  /* ── Panel ── */
  .dp-panel { background:${T.surface}; border:1px solid ${T.border}; border-radius:12px; overflow:hidden; }
  .dp-panel-hdr { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; padding:13px 20px; background:${T.surfaceAlt}; border-bottom:1px solid ${T.border}; }
  .dp-panel-title { display:flex; align-items:center; gap:8px; font-size:11px; font-weight:700; letter-spacing:0.09em; text-transform:uppercase; font-family:'IBM Plex Mono',monospace; color:${T.textPrimary}; }
  .dp-panel-body { padding:16px 20px; }

  .dp-grid-charts { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  @media (max-width:1100px){ .dp-grid-charts { grid-template-columns:1fr; } }

  /* ── Legend ── */
  .dp-legend { display:flex; gap:16px; flex-wrap:wrap; margin-bottom:14px; }
  .dp-leg { display:flex; align-items:center; gap:6px; font-size:11px; color:${T.textSecondary}; font-family:'IBM Plex Mono',monospace; }
  .dp-leg-dot { width:10px; height:10px; border-radius:2px; flex-shrink:0; }

  /* ── Stacked category bars ── */
  .dp-cat-row { display:flex; align-items:center; gap:12px; padding:7px 0; }
  .dp-cat-name { width:96px; flex-shrink:0; font-size:11px; color:${T.textSecondary}; font-family:'IBM Plex Mono',monospace; text-align:right; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .dp-cat-track { flex:1; height:22px; border-radius:5px; overflow:hidden; display:flex; background:rgba(30,38,64,0.5); min-width:0; }
  .dp-cat-seg { display:flex; align-items:center; justify-content:flex-start; padding-left:7px; transition:width 0.6s ease; overflow:hidden; }
  .dp-cat-seg-val { font-size:10px; font-weight:700; color:rgba(255,255,255,0.92); font-family:'IBM Plex Mono',monospace; white-space:nowrap; }
  .dp-cat-total { width:38px; flex-shrink:0; text-align:right; font-size:12px; font-weight:700; font-family:'IBM Plex Mono',monospace; color:${T.textPrimary}; }

  /* ── Tooltip ── */
  .dp-tooltip { background:${T.surface}; border:1px solid ${T.borderHi}; border-radius:8px; padding:10px 14px; box-shadow:0 20px 40px rgba(0,0,0,0.5); }
  .dp-tooltip-label { font-size:10px; font-family:'IBM Plex Mono',monospace; color:${T.textMuted}; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:6px; }
  .dp-tooltip-val { font-size:13px; font-weight:700; font-family:'IBM Plex Mono',monospace; color:${T.danger}; }

  /* ── Table ── */
  .dp-table { width:100%; border-collapse:collapse; }
  .dp-table thead { position:sticky; top:0; z-index:10; }
  .dp-table th { padding:8px 12px; font-size:9px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:${T.textPrimary}; font-family:'IBM Plex Mono',monospace; text-align:left; background:${T.surface}; border-bottom:1px solid ${T.border}; white-space:nowrap; }
  .dp-table td { padding:10px 12px; border-bottom:1px solid rgba(30,38,64,0.4); font-size:12px; color:${T.textPrimary}; vertical-align:middle; }
  .dp-table tbody tr:hover td { background:rgba(239,68,68,0.03); }
  .dp-table tbody tr:last-child td { border-bottom:none; }
  .dp-table .mono { font-family:'IBM Plex Mono',monospace; font-size:11px; }
  .dp-table .dim  { color:${T.textMuted}; }

  /* ── Badge ── */
  .dp-badge { display:inline-flex; align-items:center; gap:4px; padding:3px 9px; border-radius:5px; font-size:10px; font-weight:700; font-family:'IBM Plex Mono',monospace; border:1px solid transparent; white-space:nowrap; }
  .dp-badge.danger  { background:${T.dangerBg}; color:${T.danger}; border-color:rgba(239,68,68,0.3); }
  .dp-badge.warning { background:${T.warningBg}; color:${T.warning}; border-color:rgba(245,158,11,0.3); }
  .dp-badge.success { background:${T.successBg}; color:${T.success}; border-color:rgba(16,185,129,0.3); }
  .dp-badge.live    { background:${T.dangerBg}; color:${T.danger}; border-color:rgba(239,68,68,0.4); }

  .dp-empty { padding:40px; text-align:center; color:${T.textMuted}; font-size:13px; }
`;

// ── Helpers (UNCHANGED logic) ──────────────────────────────────────────────────
function fmtDuration(min: number | null | undefined): string {
  if (!min || min <= 0) return "—";
  const h = Math.floor(min / 60);
  const m = min % 60;
  if (h === 0) return `${m}min`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}min`;
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function pad2(n: number) {
  return String(n).padStart(2, "0");
}

// ── Live duration counter ──────────────────────────────────────────────────────
function DuracaoCounter({
  inicio,
  fim,
  duracaoMin,
}: {
  inicio: string;
  fim: string | null;
  duracaoMin: number | null;
}) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (fim) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [fim]);

  if (fim) return <span className="dp-badge warning">{fmtDuration(duracaoMin)}</span>;

  const totalSec = Math.max(0, Math.floor((now - new Date(inicio).getTime()) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  const label = h > 0 ? `${h}h ${pad2(m)}m ${pad2(s)}s` : `${pad2(m)}m ${pad2(s)}s`;
  return (
    <span className="dp-badge live">
      <span className="dp-live-dot" /> {label}
    </span>
  );
}

// Cobertura SIEM — mesma regra do CmdbReal; apenas fontes com status "success" (Ativo).
// Se `stale`, o cron qradar-sync está desatualizado e "success" pode já não
// refletir a realidade — retorna vazio de propósito (todo ativo aqui também
// tem Zabbix, então isso só reduz Ativo→Alerta, nunca cria Inativo falso).
function buildSiemSets(sources: SiemSource[], stale: boolean) {
  const hosts = new Set<string>();
  const ips = new Set<string>();
  if (stale) return { hosts, ips };
  sources
    .filter((s) => !s.status || s.status === "success")
    .forEach(({ name }) => {
      if (name.toLowerCase().includes("wincollect")) {
        const parts = name.split(" - ");
        const host = (parts[parts.length - 1] ?? "").trim().toLowerCase();
        if (host) hosts.add(host);
      } else if (name.toLowerCase().includes("fgt")) {
        const atIdx = name.lastIndexOf(" @ ");
        if (atIdx >= 0) {
          const ip = name
            .slice(atIdx + 3)
            .trim()
            .toLowerCase();
          if (ip) ips.add(ip);
        } else {
          hosts.add(name.trim().toLowerCase());
        }
      }
    });
  return { hosts, ips };
}
function isInSiem(a: CmdbAtivoMin, hosts: Set<string>, ips: Set<string>) {
  const isFw = (a.tipo ?? "").toLowerCase().includes("firewall");
  const cand = [a.nome, a.ip_hostname].filter(Boolean) as string[];
  return cand.some((v) => {
    const val = v.trim().toLowerCase();
    if (isFw) return ips.has(val) || hosts.has(val);
    return hosts.has(val);
  });
}
function isInZabbix(a: CmdbAtivoMin, hosts: Set<string>, ips: Set<string>) {
  const cand = [a.nome, a.ip_hostname].filter(Boolean) as string[];
  return cand.some((v) => {
    const val = v.trim().toLowerCase();
    return hosts.has(val) || ips.has(val);
  });
}

export type AtivoStatus = "Ativo" | "Alerta" | "Inativo";

// Status do CMDB: Ativo (SIEM + Zabbix), Alerta (apenas um dos dois), Inativo (nenhum)
function statusOf(
  a: CmdbAtivoMin,
  siem: { hosts: Set<string>; ips: Set<string> },
  zbx: { hosts: Set<string>; ips: Set<string> },
): AtivoStatus {
  const s = isInSiem(a, siem.hosts, siem.ips);
  const z = isInZabbix(a, zbx.hosts, zbx.ips);
  if (s && z) return "Ativo";
  if (s || z) return "Alerta";
  return "Inativo";
}

// ── Area chart tooltip ─────────────────────────────────────────────────────────
function WaveTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  const v = payload[0].value as number;
  return (
    <div className="dp-tooltip">
      <div className="dp-tooltip-label">{label}</div>
      <div className="dp-tooltip-val">
        {v} evento{v !== 1 ? "s" : ""}
      </div>
    </div>
  );
}

// Categoria → cor de status
const STATUS_COLORS = { disponiveis: T.success, alerta: T.warning, indisponiveis: T.danger };

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════
export function DisponibilidadeDashboard() {
  // ── back-end UNCHANGED ─────────────────────────────────────────────────────
  const qc = useQueryClient();
  const { isAdmin, isModuleAdmin, can } = usePermissions();
  const canView = isAdmin || isModuleAdmin("disponibilidade") || can("disponibilidade", "view");

  const fetchList = useServerFn(listIndisponibilidades);
  const fetchAtivos = useServerFn(listCmdbAtivosMin);
  const fetchSiem = useServerFn(listSiemSources);
  const fetchZabbix = useServerFn(listZabbixMonitoredHosts);
  const syncFn = useServerFn(syncIndisponibilidades);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["disponibilidade", "list"],
    queryFn: () => fetchList() as Promise<IndisponibilidadeRow[]>,
    enabled: canView,
  });
  const { data: ativos = [] } = useQuery({
    queryKey: ["disponibilidade", "ativos"],
    queryFn: () => fetchAtivos() as Promise<CmdbAtivoMin[]>,
    enabled: canView,
  });
  const { data: siemSources = [] } = useQuery({
    queryKey: ["disponibilidade", "siem-status"],
    queryFn: () => fetchSiem() as Promise<SiemSource[]>,
    enabled: canView,
    staleTime: 2 * 60 * 1000,
    refetchInterval: 2 * 60 * 1000,
  });
  const { data: zabbixData } = useQuery({
    queryKey: ["disponibilidade", "zabbix-monitored-hosts"],
    queryFn: () => fetchZabbix(),
    enabled: canView,
    staleTime: 5 * 60 * 1000,
  });
  // Saúde do cron qradar-sync — se ele estiver falhando, siemSources acima
  // fica congelada no último status bom (mesma ressalva de SocReal/CmdbReal).
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

  const siemSets = React.useMemo(() => buildSiemSets(siemSources, siemCoverageStale), [siemSources, siemCoverageStale]);
  const zbxSets = React.useMemo(() => {
    // Inclui unknownHosts/unknownIps (mesmo critério do CmdbReal: available OU unknown conta como coberto)
    const hosts = new Set<string>(
      [...(zabbixData?.hosts ?? []), ...(zabbixData?.unknownHosts ?? [])].map((x) => x.toLowerCase()),
    );
    const ips = new Set<string>(
      [...(zabbixData?.ips ?? []), ...(zabbixData?.unknownIps ?? [])].map((x) => x.toLowerCase()),
    );
    return { hosts, ips };
  }, [zabbixData]);

  const ativosComStatus = React.useMemo(
    () => ativos.map((a) => ({ ...a, status: statusOf(a, siemSets, zbxSets) })),
    [ativos, siemSets, zbxSets],
  );
  const ativosIndisponiveis = React.useMemo(
    () => ativosComStatus.filter((a) => a.status === "Inativo"),
    [ativosComStatus],
  );
  const ativosIndisponiveisComEvento = React.useMemo(() => {
    const openByAtivo = new Map<string, IndisponibilidadeRow>();
    rows.forEach((r) => {
      if (r.fim === null) openByAtivo.set(r.ativo_id, r);
    });
    return ativosIndisponiveis.map((a) => {
      const evento = openByAtivo.get(a.id) ?? null;
      return {
        ...a,
        evento,
        efectivoInicio: evento?.inicio ?? new Date().toISOString(),
        efectivoFim: null,
        efectivoDuracaoMin: null,
      };
    });
  }, [ativosIndisponiveis, rows]);

  const prevIdsRef = React.useRef("");
  React.useEffect(() => {
    if (!canView || ativos.length === 0) return;
    const ids = ativosIndisponiveis
      .map((a) => a.id)
      .sort()
      .join(",");
    if (ids === prevIdsRef.current) return;
    prevIdsRef.current = ids;
    syncFn()
      .then(() => {
        qc.invalidateQueries({ queryKey: ["disponibilidade", "list"] });
      })
      .catch(() => {});
  }, [canView, ativosIndisponiveis, ativos.length]);

  const [downtimeTick, setDowntimeTick] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setDowntimeTick(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const monthStart = React.useMemo(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  }, []);
  const mesRows = React.useMemo(() => rows.filter((r) => new Date(r.inicio) >= monthStart), [rows, monthStart]);
  const downtimeMes = React.useMemo(() => {
    // Constrói intervalos [inicioMs, fimMs] para cada evento
    const intervals = mesRows.map((r): [number, number] => {
      const start = new Date(r.inicio).getTime();
      const end = r.fim !== null ? new Date(r.fim).getTime() : downtimeTick;
      return [start, Math.max(start, end)];
    });
    if (intervals.length === 0) return 0;
    // Ordena por início e mescla sobrepostos — evita contar o mesmo período duas vezes
    intervals.sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [intervals[0]];
    for (let i = 1; i < intervals.length; i++) {
      const last = merged[merged.length - 1];
      const [s, e] = intervals[i];
      if (s <= last[1]) last[1] = Math.max(last[1], e);
      else merged.push([s, e]);
    }
    return merged.reduce((acc, [s, e]) => acc + Math.floor((e - s) / 60_000), 0);
  }, [mesRows, downtimeTick]);

  const dispCat = React.useMemo(() => {
    const porTipo = new Map<string, { disponiveis: number; alerta: number; indisponiveis: number }>();
    ativosComStatus.forEach((a) => {
      const t = a.tipo || "Outros";
      const e = porTipo.get(t) ?? { disponiveis: 0, alerta: 0, indisponiveis: 0 };
      if (a.status === "Inativo") e.indisponiveis += 1;
      else if (a.status === "Alerta") e.alerta += 1;
      else e.disponiveis += 1;
      porTipo.set(t, e);
    });
    return Array.from(porTipo.entries())
      .map(([c, v]) => ({ c, ...v }))
      .sort((a, b) => a.indisponiveis - b.indisponiveis);
  }, [ativosComStatus]);

  const SLOT_MS = 4 * 3_600_000;
  const waveData = React.useMemo(() => {
    const slotCount = 10 * 6;
    const now = Date.now();
    const slots = Array.from({ length: slotCount }, (_, i) => {
      const ts = Math.floor(now / SLOT_MS - (slotCount - 1 - i)) * SLOT_MS;
      const d = new Date(ts);
      return {
        d:
          d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) +
          " " +
          d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" }),
        key: ts,
        v: 0,
      };
    });
    const idx = new Map(slots.map((s, i) => [s.key, i]));
    rows.forEach((r) => {
      const ts = Math.floor(new Date(r.inicio).getTime() / SLOT_MS) * SLOT_MS;
      const i = idx.get(ts);
      if (i !== undefined) slots[i].v += 1;
    });
    return slots.map(({ d, v }) => ({ d, v }));
  }, [rows]);

  const dispStats = React.useMemo(() => {
    const total = ativos.length;
    const indisp = ativosIndisponiveis.length;
    const disp = total - indisp;
    const pct = total > 0 ? ((disp / total) * 100).toFixed(1) : null;
    const critTotal = ativos.filter((a) => a.criticidade === "Crítico").length;
    const critIndisp = ativosIndisponiveis.filter((a) => a.criticidade === "Crítico").length;
    const critDisp = critTotal - critIndisp;
    const critPct = critTotal > 0 ? ((critDisp / critTotal) * 100).toFixed(1) : null;
    return { disp, total, pct, critDisp, critTotal, critPct };
  }, [ativos, ativosIndisponiveis]);
  // ──────────────────────────────────────────────────────────────────────────

  if (!canView)
    return (
      <div className="dp-root">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div
          style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            padding: "48px 24px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
            textAlign: "center",
          }}
        >
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: T.dangerBg,
              border: "1px solid rgba(239,68,68,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Lock size={20} color={T.danger} />
          </div>
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700 }}>Acesso restrito</div>
          <div style={{ fontSize: 13, color: T.textMuted }}>Você não tem permissão para acessar este módulo.</div>
        </div>
      </div>
    );

  const maxCatTotal = Math.max(...dispCat.map((c) => c.disponiveis + c.alerta + c.indisponiveis), 1);
  const pctNum = dispStats.pct ? parseFloat(dispStats.pct) : null;
  const critPctNum = dispStats.critPct ? parseFloat(dispStats.critPct) : null;
  const geralColor = pctNum == null ? T.neutral : pctNum >= 80 ? T.success : pctNum >= 50 ? T.warning : T.danger;
  const critColor =
    critPctNum == null ? T.neutral : critPctNum >= 80 ? T.success : critPctNum >= 50 ? T.warning : T.danger;

  return (
    <div className="dp-root dp-fadeup">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="dp-hdr">
        <div className="dp-hdr-brand">
          <div className="dp-hdr-icon">
            <Network size={18} color={T.cyan} />
          </div>
          <div>
            <div className="dp-hdr-title">Disponibilidade de Ativos</div>
            <div className="dp-hdr-sub">Cobertura SIEM + Zabbix · monitoramento contínuo do CMDB</div>
          </div>
        </div>
        <div className="dp-hdr-pills">
          <span
            className="dp-pill"
            style={{ background: T.successBg, color: T.success, border: "1px solid rgba(16,185,129,0.25)" }}
          >
            <Server size={11} /> {dispStats.disp} disponíveis
          </span>
          {ativosIndisponiveis.length > 0 && (
            <span
              className="dp-pill"
              style={{ background: T.dangerBg, color: T.danger, border: "1px solid rgba(239,68,68,0.25)" }}
            >
              <span className="dp-live-dot" /> {ativosIndisponiveis.length} indisponíveis
            </span>
          )}
        </div>
      </div>

      {/* ── KPIs ─────────────────────────────────────────────────────── */}
      <div className="dp-kpi-grid">
        <div
          className="dp-kpi"
          style={{ "--kc": geralColor, "--ki-bg": "rgba(34,211,238,0.16)" } as React.CSSProperties}
        >
          <div className="dp-kpi-icon">
            <Network size={22} color={T.cyan} />
          </div>
          <div className="dp-kpi-label">Disponibilidade Geral</div>
          <div className="dp-kpi-value">{dispStats.pct ? `${dispStats.pct}%` : "—"}</div>
          <div className="dp-kpi-hint">
            {dispStats.disp}/{dispStats.total} disponíveis
          </div>
        </div>

        <div className="dp-kpi" style={{ "--kc": critColor, "--ki-bg": "rgba(239,68,68,0.18)" } as React.CSSProperties}>
          <div className="dp-kpi-icon">
            <ShieldOff size={22} color={critColor === T.success ? T.success : T.danger} />
          </div>
          <div className="dp-kpi-label">Ativos Críticos</div>
          <div className="dp-kpi-value">{dispStats.critPct !== null ? `${dispStats.critPct}%` : "—"}</div>
          <div className="dp-kpi-hint">
            {dispStats.critTotal > 0
              ? `${dispStats.critDisp}/${dispStats.critTotal} disponíveis`
              : "Sem ativos críticos"}
          </div>
        </div>

        <div className="dp-kpi" style={{ "--kc": T.danger, "--ki-bg": "rgba(239,68,68,0.18)" } as React.CSSProperties}>
          <div className="dp-kpi-icon">
            <AlertOctagon size={22} color={T.danger} />
          </div>
          <div className="dp-kpi-label">Ativos Indisponíveis</div>
          <div className="dp-kpi-value" style={{ color: ativosIndisponiveis.length > 0 ? T.danger : T.textPrimary }}>
            {ativosIndisponiveis.length}
          </div>
          <div className="dp-kpi-hint">status Inativo no CMDB</div>
        </div>

        <div className="dp-kpi" style={{ "--kc": T.warning, "--ki-bg": "rgba(245,158,11,0.2)" } as React.CSSProperties}>
          <div className="dp-kpi-icon">
            <Clock size={22} color={T.warning} />
          </div>
          <div className="dp-kpi-label">Downtime (mês)</div>
          <div className="dp-kpi-value" style={{ fontSize: 22 }}>
            {fmtDuration(downtimeMes)}
          </div>
          <div className="dp-kpi-hint">acumulado no mês corrente</div>
        </div>

        <div className="dp-kpi" style={{ "--kc": T.accent, "--ki-bg": "rgba(59,130,246,0.18)" } as React.CSSProperties}>
          <div className="dp-kpi-icon">
            <Activity size={22} color={T.accent} />
          </div>
          <div className="dp-kpi-label">Eventos (mês)</div>
          <div className="dp-kpi-value">{mesRows.length}</div>
          <div className="dp-kpi-hint">indisponibilidades no mês</div>
        </div>
      </div>

      {/* ── Charts ───────────────────────────────────────────────────── */}
      <div className="dp-grid-charts">
        {/* Gráfico A — Ativos por Categoria (barras horizontais empilhadas) */}
        <div className="dp-panel">
          <div className="dp-panel-hdr">
            <div className="dp-panel-title">
              <Server size={11} color={T.success} /> Ativos por Categoria
            </div>
          </div>
          <div className="dp-panel-body">
            <div className="dp-legend">
              <span className="dp-leg">
                <span className="dp-leg-dot" style={{ background: T.success }} /> Disponível
              </span>
              <span className="dp-leg">
                <span className="dp-leg-dot" style={{ background: T.warning }} /> Alerta
              </span>
              <span className="dp-leg">
                <span className="dp-leg-dot" style={{ background: T.danger }} /> Indisponível
              </span>
            </div>
            {dispCat.length === 0 ? (
              <div className="dp-empty">Sem ativos cadastrados no CMDB.</div>
            ) : (
              <div style={{ maxHeight: 280, overflowY: "auto" }}>
                {dispCat.map((cat) => {
                  const total = cat.disponiveis + cat.alerta + cat.indisponiveis;
                  if (total === 0) return null;
                  const segs = [
                    { key: "disponiveis", v: cat.disponiveis, color: T.success },
                    { key: "alerta", v: cat.alerta, color: T.warning },
                    { key: "indisponiveis", v: cat.indisponiveis, color: T.danger },
                  ];
                  return (
                    <div key={cat.c} className="dp-cat-row">
                      <span className="dp-cat-name" title={cat.c}>
                        {cat.c}
                      </span>
                      <div className="dp-cat-track">
                        {segs.map((s) => {
                          if (s.v <= 0) return null;
                          const segPct = (s.v / total) * 100;
                          const showVal = segPct >= 12;
                          return (
                            <div
                              key={s.key}
                              className="dp-cat-seg"
                              style={{ width: `${segPct}%`, background: s.color }}
                            >
                              {showVal ? <span className="dp-cat-seg-val">{s.v}</span> : null}
                            </div>
                          );
                        })}
                      </div>
                      <span className="dp-cat-total">{total}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Gráfico D — Indisponibilidades ao longo do tempo (AreaChart refinado) */}
        <div className="dp-panel">
          <div className="dp-panel-hdr">
            <div className="dp-panel-title">
              <Activity size={11} color={T.danger} /> Indisponibilidades — últimos 10 dias
            </div>
          </div>
          <div className="dp-panel-body">
            <ResponsiveContainer width="100%" height={280}>
              <AreaChart data={waveData} margin={{ top: 8, right: 12, left: -12, bottom: 40 }}>
                <defs>
                  <linearGradient id="dpWaveGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={T.danger} stopOpacity={0.4} />
                    <stop offset="100%" stopColor={T.danger} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="2 4" stroke={T.chartGrid} vertical={false} />
                <XAxis
                  dataKey="d"
                  stroke={T.chartAxis}
                  fontSize={10}
                  interval={5}
                  tickLine={false}
                  tick={{ fill: T.chartTick, fontFamily: "'IBM Plex Mono',monospace", textAnchor: "end" }}
                  axisLine={{ stroke: T.chartAxis }}
                  angle={-35}
                  dy={6}
                  tickFormatter={(v: string) => v.slice(0, 5)}
                />
                <YAxis
                  stroke={T.chartAxis}
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  domain={[0, "auto"]}
                  tick={{ fill: T.chartTick, fontFamily: "'IBM Plex Mono',monospace" }}
                />
                <Tooltip content={<WaveTooltip />} cursor={{ stroke: T.borderHi, strokeWidth: 1 }} />
                <Area
                  type="monotoneX"
                  dataKey="v"
                  stroke={T.danger}
                  strokeWidth={2}
                  fill="url(#dpWaveGrad)"
                  dot={false}
                  activeDot={{ r: 4, fill: T.danger, stroke: T.surface, strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* ── Tabela ───────────────────────────────────────────────────── */}
      <div className="dp-panel">
        <div className="dp-panel-hdr">
          <div className="dp-panel-title">
            <AlertOctagon size={11} color={T.danger} /> Ativos Indisponíveis — Status Inativo no CMDB
            <span style={{ fontWeight: 400, color: T.textSubtle }}>({ativosIndisponiveisComEvento.length})</span>
          </div>
        </div>
        {isLoading ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "40px",
              color: T.textMuted,
              fontSize: 12,
              fontFamily: "'IBM Plex Mono',monospace",
            }}
          >
            <Loader2 size={13} className="dp-spin" color={T.cyan} /> Carregando…
          </div>
        ) : ativosIndisponiveisComEvento.length === 0 ? (
          <div className="dp-empty" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}>
            <div
              style={{
                width: 40,
                height: 40,
                borderRadius: 10,
                background: T.successBg,
                border: "1px solid rgba(16,185,129,0.3)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <Server size={18} color={T.success} />
            </div>
            Todos os ativos do CMDB estão com status Ativo ou Alerta.
          </div>
        ) : (
          <div style={{ overflowX: "auto", maxHeight: 520, overflowY: "auto" }}>
            <table className="dp-table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 18 }}>Ativo</th>
                  <th>Tipo</th>
                  <th>IP / Hostname</th>
                  <th>Status</th>
                  <th>Data</th>
                  <th>Hora</th>
                  <th style={{ paddingRight: 18 }}>Duração</th>
                </tr>
              </thead>
              <tbody>
                {ativosIndisponiveisComEvento.map((a) => (
                  <tr key={a.id}>
                    <td className="mono" style={{ paddingLeft: 18, fontWeight: 600, color: T.textPrimary }}>
                      {a.nome}
                    </td>
                    <td className="dim">{a.tipo}</td>
                    <td className="mono dim">{a.ip_hostname ?? "—"}</td>
                    <td>
                      <span className="dp-badge danger">
                        <AlertOctagon size={10} /> Indisponível
                      </span>
                    </td>
                    <td className="dim">{fmtDate(a.efectivoInicio)}</td>
                    <td className="mono dim">{fmtTime(a.efectivoInicio)}</td>
                    <td style={{ paddingRight: 18 }}>
                      <DuracaoCounter inicio={a.efectivoInicio} fim={a.efectivoFim} duracaoMin={a.efectivoDuracaoMin} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
