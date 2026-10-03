import { SyncActions } from "@/components/layout/SyncActions";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { Lock, Search, X, Check, AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";
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
import { DetailList, DetailSection, DetailSheet } from "@/components/layout/DetailSheet";

// ── CSS (interface v2) ─────────────────────────────────────────────────────────
const CSS = `
  .dp-root { font-family:var(--font-ui); color:var(--v2-fg); display:flex; flex-direction:column; gap:20px; font-size:14px; }
  .dp-root * { box-sizing:border-box; }
  @keyframes dp-spin { to{transform:rotate(360deg)} }
  .dp-spin { animation:dp-spin 0.75s linear infinite; }
  @media (prefers-reduced-motion: reduce) { .dp-spin { animation:none; } }
  .dp-root ::-webkit-scrollbar { width:6px; height:6px; }
  .dp-root ::-webkit-scrollbar-track { background:transparent; }
  .dp-root ::-webkit-scrollbar-thumb { background:var(--v2-line-strong); border-radius:3px; }
  .dp-root :focus-visible { outline:2px solid var(--v2-accent); outline-offset:2px; }
  .dp-root .mono { font-family:var(--font-data); font-size:12.5px; }
  .dp-root .dim { color:var(--v2-fg-3); }
  .dp-root .recharts-cartesian-axis-tick-value { fill:var(--v2-fg-3) !important; font-size:11px; font-family:var(--font-data); }

  /* ── Cabeçalho ── */
  .dp-ph { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  .dp-ph-title { font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.2; margin:0; }
  .dp-ph-sub { margin:4px 0 0; font-size:13px; color:var(--v2-fg-3); }
  .dp-state { display:flex; flex-direction:column; align-items:center; gap:10px; padding:48px 24px; text-align:center; background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; }
  .dp-warn { display:flex; gap:10px; align-items:flex-start; padding:10px 14px; border-radius:10px; font-size:13px; line-height:1.5; color:var(--v2-fg-2); background:color-mix(in oklch, var(--v2-med) 10%, transparent); border:1px solid color-mix(in oklch, var(--v2-med) 35%, transparent); }
  .dp-warn svg { color:var(--v2-med); flex-shrink:0; margin-top:2px; }

  /* ── KPIs ── */
  .dp-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
  .dp-kpi { position:relative; text-align:left; border:0; background:transparent; padding:16px 18px 14px; display:grid; gap:2px; align-content:start; box-shadow:1px 0 0 var(--v2-line), 0 1px 0 var(--v2-line); color:inherit; font-family:inherit; min-width:0; }
  button.dp-kpi { cursor:pointer; }
  button.dp-kpi:hover { background:var(--v2-hover); }
  .dp-kpi[aria-pressed="true"] { background:color-mix(in oklch, var(--v2-accent) 14%, transparent); }
  .dp-kpi[aria-pressed="true"]::after { content:""; position:absolute; left:0; right:0; bottom:0; height:2px; background:var(--v2-accent); }
  .dp-kpi-label { font-size:12.5px; color:var(--v2-fg-2); display:flex; align-items:center; gap:6px; }
  .dp-kpi-value { font-size:28px; font-weight:600; letter-spacing:-0.02em; line-height:1.25; font-variant-numeric:tabular-nums; }
  .dp-kpi-foot { font-size:12px; color:var(--v2-fg-3); }
  .dp-sw { width:8px; height:8px; border-radius:2px; display:inline-block; flex-shrink:0; }
  .dp-meter { height:6px; border-radius:99px; background:var(--v2-surface-2); overflow:hidden; margin:6px 0 2px; }
  .dp-meter i { display:block; height:100%; border-radius:99px; }

  /* ── Grade ── */
  .dp-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:20px; align-items:stretch; }
  .dp-span-2 { grid-column:span 2; }
  .dp-card { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; min-width:0; overflow:hidden; }
  /* Categorias acompanham a altura do gráfico e rolam por dentro */
  .dp-fit { height:0; min-height:100%; display:flex; flex-direction:column; }
  .dp-fit .dp-card-body { flex:1; min-height:0; overflow-y:auto; }
  @media (max-width: 1100px) {
    .dp-grid { grid-template-columns:minmax(0, 1fr); }
    .dp-span-2 { grid-column:auto; }
    .dp-fit { height:auto; min-height:0; max-height:420px; }
  }
  .dp-card-hdr { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap; padding:14px 18px 4px; }
  .dp-card-title { font-size:14px; font-weight:600; margin:0; }
  .dp-card-sub { margin:2px 0 0; font-size:12.5px; color:var(--v2-fg-3); }
  .dp-card-body { padding:10px 18px 16px; }
  .dp-legend { display:flex; gap:14px; flex-wrap:wrap; font-size:12px; color:var(--v2-fg-2); }
  .dp-legend span { display:inline-flex; align-items:center; gap:6px; }
  .dp-empty { padding:28px 16px; text-align:center; color:var(--v2-fg-3); font-size:13px; }
  .dp-empty-ok { display:flex; flex-direction:column; align-items:center; gap:8px; padding:32px 16px; text-align:center; font-size:13px; color:var(--v2-fg-3); }
  .dp-empty-ok b { color:var(--v2-fg); font-size:14px; }
  .dp-empty-ok svg { color:var(--v2-ok); }
  .dp-tip { display:grid; gap:2px; padding:8px 10px; background:var(--v2-surface-2); border:1px solid var(--v2-line-strong); border-radius:8px; font-size:12px; box-shadow:0 12px 32px rgba(0,0,0,0.3); }
  .dp-tip span { color:var(--v2-fg-2); font-family:var(--font-data); }

  /* ── Por categoria ── */
  .dp-cats { display:grid; gap:4px; }
  .dp-cats button { display:grid; grid-template-columns:minmax(0, 1fr) auto; gap:5px 10px; align-items:center; padding:7px 8px; margin:0 -8px; border:0; border-radius:8px; background:transparent; text-align:left; color:var(--v2-fg); font-size:13px; cursor:pointer; font-family:inherit; }
  .dp-cats button:hover { background:var(--v2-hover); }
  .dp-cats button[aria-pressed="true"] { background:color-mix(in oklch, var(--v2-accent) 14%, transparent); }
  .dp-cats.filtering button[aria-pressed="false"] { opacity:.5; }
  .dp-cats span:first-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .dp-cats .n { font:500 12.5px var(--font-data); color:var(--v2-fg-2); }
  .dp-cats .bar { grid-column:1 / -1; display:flex; gap:2px; height:8px; border-radius:99px; overflow:hidden; background:var(--v2-surface-2); }
  .dp-cats .bar i { display:block; height:100%; }

  /* ── Barra de ferramentas e tabela ── */
  .dp-toolbar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:12px 18px; border-bottom:1px solid var(--v2-line); }
  .dp-seg { display:inline-flex; padding:3px; gap:2px; background:var(--v2-bg); border:1px solid var(--v2-line); border-radius:8px; flex-wrap:wrap; }
  .dp-seg button { display:inline-flex; align-items:center; gap:6px; border:0; background:transparent; padding:4px 12px; border-radius:5px; font-size:13px; color:var(--v2-fg-2); cursor:pointer; font-family:inherit; }
  .dp-seg button[aria-pressed="true"] { background:var(--v2-surface-2); color:var(--v2-fg); font-weight:500; box-shadow:inset 0 0 0 1px var(--v2-line); }
  .dp-seg .n { font:500 12px var(--font-data); color:var(--v2-fg-3); }
  .dp-search { display:inline-flex; align-items:center; gap:8px; height:32px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg-3); width:280px; max-width:100%; }
  .dp-search:focus-within { border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }
  .dp-search input { flex:1; min-width:0; border:0; outline:none; background:transparent; color:var(--v2-fg); font-size:13px; font-family:inherit; }
  .dp-search input::placeholder { color:var(--v2-fg-3); }
  .dp-chip { display:inline-flex; align-items:center; gap:6px; height:28px; padding:0 8px 0 10px; border-radius:99px; border:0; background:color-mix(in oklch, var(--v2-accent) 14%, transparent); color:var(--v2-fg); font-size:12.5px; cursor:pointer; font-family:inherit; }
  .dp-chip svg { color:var(--v2-fg-3); }
  .dp-scroll { overflow:auto; max-height:620px; }
  .dp-table { width:100%; border-collapse:collapse; font-size:13px; }
  .dp-table thead { position:sticky; top:0; z-index:1; }
  .dp-table th { padding:9px 12px; font-size:12px; font-weight:500; color:var(--v2-fg-3); text-align:left; background:var(--v2-surface); border-bottom:1px solid var(--v2-line); white-space:nowrap; }
  .dp-table th.r, .dp-table td.r { text-align:right; }
  .dp-table td { padding:8px 12px; height:48px; border-bottom:1px solid var(--v2-line); vertical-align:middle; }
  .dp-table th:first-child, .dp-table td:first-child { padding-left:18px; }
  .dp-table th:last-child, .dp-table td:last-child { padding-right:18px; }
  .dp-table tbody tr { cursor:pointer; }
  .dp-table tbody tr:hover td { background:var(--v2-hover); }
  .dp-table tbody tr:last-child td { border-bottom:none; }
  .dp-asset { display:block; font:500 12.5px var(--font-data); }
  .dp-host { display:block; font:400 12px var(--font-data); color:var(--v2-fg-3); }

  /* ── Cobertura, criticidade e tempo ao vivo ── */
  .dp-cov { display:inline-flex; gap:6px; flex-wrap:wrap; }
  .dp-cov span { display:inline-flex; align-items:center; gap:5px; height:22px; padding:0 7px; border-radius:5px; font-size:12px; font-weight:500; --c:var(--v2-ok); background:color-mix(in oklch, var(--c) 12%, transparent); color:color-mix(in oklch, var(--c) 72%, var(--v2-fg)); }
  .dp-cov span.off { --c:var(--v2-crit); }
  .dp-cov svg { color:var(--c); }
  .dp-crit { display:inline-flex; align-items:center; gap:6px; font-size:12px; color:var(--v2-fg-2); }
  .dp-live { display:inline-flex; align-items:center; gap:6px; font:500 12.5px var(--font-data); color:color-mix(in oklch, var(--v2-crit) 75%, var(--v2-fg)); white-space:nowrap; }
  .dp-live::before { content:""; width:7px; height:7px; border-radius:50%; background:var(--v2-crit); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-crit) 25%, transparent); }
  .dp-tag { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; white-space:nowrap; --c:var(--v2-fg-3); background:color-mix(in oklch, var(--c) 14%, transparent); color:color-mix(in oklch, var(--c) 72%, var(--v2-fg)); }
  .dp-tag svg { color:var(--c); }
  .dp-tag.ok { --c:var(--v2-ok); } .dp-tag.warn { --c:var(--v2-med); } .dp-tag.crit { --c:var(--v2-crit); }

  /* ── Painel lateral ── */
  .dp-note { font-size:13px; line-height:1.55; color:var(--v2-fg-2); padding:10px 12px; border-radius:8px; background:var(--v2-surface-2); border:1px solid color-mix(in oklch, var(--v2-crit) 40%, transparent); }
  .dp-cov-box { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  .dp-cov-tile { display:grid; gap:2px; padding:10px 12px; border-radius:8px; border:1px solid var(--v2-line); background:var(--v2-surface-2); }
  .dp-cov-tile b { font-size:13px; display:flex; align-items:center; gap:6px; }
  .dp-cov-tile small { font-size:12px; color:var(--v2-fg-3); }
  .dp-cov-tile.on b svg { color:var(--v2-ok); } .dp-cov-tile.off b svg { color:var(--v2-crit); }
  .dp-ev { display:grid; }
  .dp-ev > div { display:grid; grid-template-columns:minmax(0, 1fr) auto; gap:2px 10px; padding:8px 0; border-bottom:1px solid var(--v2-line); font-size:13px; }
  .dp-ev > div:last-child { border-bottom:0; }
  .dp-ev small { grid-column:1 / -1; font-size:12px; color:var(--v2-fg-3); }
  .dp-ev .d { font:500 12.5px var(--font-data); }
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
function fmtDateTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function pad2(n: number) {
  return String(n).padStart(2, "0");
}
/** Minutos de um evento (em aberto conta até agora). */
function eventMinutes(r: IndisponibilidadeRow, now: number) {
  if (r.fim !== null && r.duracao_min) return r.duracao_min;
  const end = r.fim !== null ? new Date(r.fim).getTime() : now;
  return Math.max(0, Math.floor((end - new Date(r.inicio).getTime()) / 60_000));
}

// ── Contador ao vivo da indisponibilidade ─────────────────────────────────────
function DuracaoCounter({ inicio }: { inicio: string }) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const totalSec = Math.max(0, Math.floor((now - new Date(inicio).getTime()) / 1000));
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return (
    <span className="dp-live">
      {h > 0 ? `${h}h ${pad2(m)}m ${pad2(s)}s` : `${pad2(m)}m ${pad2(s)}s`}
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
type AtivoComStatus = CmdbAtivoMin & { siem: boolean; zbx: boolean; status: AtivoStatus };
type View = "down" | "alert" | "hist";

const CRIT_COLOR: Record<string, string> = {
  Crítico: "var(--v2-crit)",
  Alto: "var(--v2-high)",
  Médio: "var(--v2-med)",
  Baixo: "var(--v2-low)",
};
function CritTag({ value }: { value: string | null }) {
  return (
    <span className="dp-crit">
      <span className="dp-sw" style={{ background: CRIT_COLOR[value ?? ""] ?? "var(--v2-fg-3)" }} />
      {value || "—"}
    </span>
  );
}
function Coverage({ a }: { a: AtivoComStatus }) {
  return (
    <span className="dp-cov">
      <span className={a.siem ? "" : "off"}>
        {a.siem ? <Check size={11} /> : <X size={11} />} SIEM
      </span>
      <span className={a.zbx ? "" : "off"}>
        {a.zbx ? <Check size={11} /> : <X size={11} />} Zabbix
      </span>
    </span>
  );
}

// ── Tooltip do gráfico ─────────────────────────────────────────────────────────
function WaveTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ value: number; payload: { t: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const v = payload[0].value;
  const t = payload[0].payload.t;
  return (
    <div className="dp-tip">
      <b>
        {fmtDateTime(new Date(t).toISOString())} –{" "}
        {fmtTime(new Date(t + 4 * 3_600_000).toISOString())}
      </b>
      <span>
        {v} {v === 1 ? "indisponibilidade iniciada" : "indisponibilidades iniciadas"}
      </span>
    </div>
  );
}

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

  const siemSets = React.useMemo(
    () => buildSiemSets(siemSources, siemCoverageStale),
    [siemSources, siemCoverageStale],
  );
  const zbxSets = React.useMemo(() => {
    // Inclui unknownHosts/unknownIps (mesmo critério do CmdbReal: available OU unknown conta como coberto)
    const hosts = new Set<string>(
      [...(zabbixData?.hosts ?? []), ...(zabbixData?.unknownHosts ?? [])].map((x) =>
        x.toLowerCase(),
      ),
    );
    const ips = new Set<string>(
      [...(zabbixData?.ips ?? []), ...(zabbixData?.unknownIps ?? [])].map((x) => x.toLowerCase()),
    );
    return { hosts, ips };
  }, [zabbixData]);

  // Status do CMDB: Ativo (SIEM + Zabbix), Alerta (apenas um dos dois), Inativo (nenhum)
  const ativosComStatus = React.useMemo<AtivoComStatus[]>(
    () =>
      ativos.map((a) => {
        const siem = isInSiem(a, siemSets.hosts, siemSets.ips);
        const zbx = isInZabbix(a, zbxSets.hosts, zbxSets.ips);
        return {
          ...a,
          siem,
          zbx,
          status: siem && zbx ? "Ativo" : siem || zbx ? "Alerta" : "Inativo",
        };
      }),
    [ativos, siemSets, zbxSets],
  );
  const ativosIndisponiveis = React.useMemo(
    () => ativosComStatus.filter((a) => a.status === "Inativo"),
    [ativosComStatus],
  );
  const ativosAlerta = React.useMemo(
    () => ativosComStatus.filter((a) => a.status === "Alerta"),
    [ativosComStatus],
  );
  const openByAtivo = React.useMemo(() => {
    const m = new Map<string, IndisponibilidadeRow>();
    rows.forEach((r) => {
      if (r.fim === null) m.set(r.ativo_id, r);
    });
    return m;
  }, [rows]);

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
  const mesRows = React.useMemo(
    () => rows.filter((r) => new Date(r.inicio) >= monthStart),
    [rows, monthStart],
  );
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
    const porTipo = new Map<
      string,
      { disponiveis: number; alerta: number; indisponiveis: number }
    >();
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
      .sort(
        (a, b) =>
          b.indisponiveis - a.indisponiveis ||
          b.alerta - a.alerta ||
          b.disponiveis + b.alerta + b.indisponiveis - (a.disponiveis + a.alerta + a.indisponiveis),
      );
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
        t: ts,
        v: 0,
      };
    });
    const idx = new Map(slots.map((s, i) => [s.t, i]));
    rows.forEach((r) => {
      const ts = Math.floor(new Date(r.inicio).getTime() / SLOT_MS) * SLOT_MS;
      const i = idx.get(ts);
      if (i !== undefined) slots[i].v += 1;
    });
    return slots;
  }, [rows]);
  // Um rótulo por dia no eixo X (primeira faixa de cada dia)
  const dayTicks = React.useMemo(() => {
    const seen = new Set<string>();
    return waveData
      .filter((s) => {
        const day = s.d.slice(0, 5);
        if (seen.has(day)) return false;
        seen.add(day);
        return true;
      })
      .map((s) => s.d);
  }, [waveData]);

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

  const [view, setView] = React.useState<View>("down");
  const [cat, setCat] = React.useState<string | null>(null);
  const [query, setQuery] = React.useState("");
  const [openId, setOpenId] = React.useState<string | null>(null);

  const ativoById = React.useMemo(
    () => new Map(ativosComStatus.map((a) => [a.id, a])),
    [ativosComStatus],
  );
  const histRows = React.useMemo(() => rows.filter((r) => r.fim !== null), [rows]);

  if (!canView)
    return (
      <div className="dp-root">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="dp-state">
          <Lock size={22} color="var(--v2-crit)" />
          <span style={{ fontSize: 15, fontWeight: 600 }}>Acesso restrito</span>
          <span style={{ fontSize: 13, color: "var(--v2-fg-3)" }}>
            Você não tem permissão para acessar este módulo.
          </span>
        </div>
      </div>
    );

  const pctColor = (p: number | null) =>
    p == null
      ? "var(--v2-fg-3)"
      : p >= 95
        ? "var(--v2-ok)"
        : p >= 80
          ? "var(--v2-med)"
          : "var(--v2-crit)";
  const pctNum = dispStats.pct ? parseFloat(dispStats.pct) : null;
  const critPctNum = dispStats.critPct ? parseFloat(dispStats.critPct) : null;
  const fmtPct = (p: string | null) => (p ? `${p.replace(".", ",")}%` : "—");

  const q = query.trim().toLowerCase();
  const matchAtivo = (a: CmdbAtivoMin) =>
    (!cat || (a.tipo || "Outros") === cat) &&
    (!q || `${a.nome} ${a.ip_hostname ?? ""}`.toLowerCase().includes(q));

  const downList = ativosIndisponiveis
    .filter(matchAtivo)
    .sort((a, b) =>
      (openByAtivo.get(a.id)?.inicio ?? "").localeCompare(openByAtivo.get(b.id)?.inicio ?? ""),
    );
  const alertList = ativosAlerta
    .filter(matchAtivo)
    .sort((a, b) => Number(b.criticidade === "Crítico") - Number(a.criticidade === "Crítico"));
  const histList = histRows.filter((r) => {
    if (cat && (r.ativo_tipo || "Outros") !== cat) return false;
    if (!q) return true;
    const a = ativoById.get(r.ativo_id);
    return `${r.ativo_nome} ${a?.ip_hostname ?? ""}`.toLowerCase().includes(q);
  });

  // Painel lateral
  const open = openId ? (ativoById.get(openId) ?? null) : null;
  const openEvents = openId
    ? rows.filter((r) => r.ativo_id === openId).sort((a, b) => b.inicio.localeCompare(a.inicio))
    : [];
  const openNow = openId ? openByAtivo.get(openId) : undefined;
  const openDowntimeMes = openEvents
    .filter((r) => new Date(r.inicio) >= monthStart)
    .reduce((acc, r) => acc + eventMinutes(r, downtimeTick), 0);

  const rowProps = (id: string) => ({
    tabIndex: 0,
    onClick: () => setOpenId(id),
    onKeyDown: (e: React.KeyboardEvent) => e.key === "Enter" && setOpenId(id),
  });

  return (
    <div className="dp-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Cabeçalho ────────────────────────────────────────────────────── */}
      <div className="dp-ph">
        <div>
          <h1 className="dp-ph-title">Disponibilidade de ativos</h1>
          <p className="dp-ph-sub">
            Cobertura SIEM (QRadar) e Zabbix dos ativos do CMDB, com indisponibilidades em tempo
            real
          </p>
        </div>
        <SyncActions moduleSlug="disponibilidade" jobs={["zabbix-cache-refresh", "qradar-sync"]} />
      </div>

      {siemCoverageStale && (
        <div className="dp-warn">
          <AlertTriangle size={15} />
          <span>
            O sync do QRadar está atrasado ou com erro, então a cobertura SIEM foi desconsiderada
            até ele voltar. Ativos que dependem do SIEM aparecem como “Em alerta”, não como
            indisponíveis.
          </span>
        </div>
      )}

      {/* ── KPIs ───────────────────────────────────────────────────────────── */}
      <div className="dp-kpis">
        <div className="dp-kpi">
          <span className="dp-kpi-label">Disponibilidade geral</span>
          <span className="dp-kpi-value">{fmtPct(dispStats.pct)}</span>
          <div className="dp-meter" aria-hidden="true">
            <i style={{ width: `${pctNum ?? 0}%`, background: pctColor(pctNum) }} />
          </div>
          <span className="dp-kpi-foot">
            {dispStats.disp} de {dispStats.total} ativos disponíveis
          </span>
        </div>
        <div className="dp-kpi">
          <span className="dp-kpi-label">Ativos críticos</span>
          <span className="dp-kpi-value">{fmtPct(dispStats.critPct)}</span>
          <div className="dp-meter" aria-hidden="true">
            <i style={{ width: `${critPctNum ?? 0}%`, background: pctColor(critPctNum) }} />
          </div>
          <span className="dp-kpi-foot">
            {dispStats.critTotal > 0
              ? `${dispStats.critDisp} de ${dispStats.critTotal} disponíveis`
              : "Sem ativos críticos"}
          </span>
        </div>
        <button
          type="button"
          className="dp-kpi"
          aria-pressed={view === "down"}
          onClick={() => setView("down")}
        >
          <span className="dp-kpi-label">
            {ativosIndisponiveis.length > 0 && (
              <span className="dp-sw" style={{ background: "var(--v2-crit)" }} />
            )}
            Indisponíveis agora
          </span>
          <span className="dp-kpi-value">{ativosIndisponiveis.length}</span>
          <span className="dp-kpi-foot">sem SIEM e sem Zabbix</span>
        </button>
        <button
          type="button"
          className="dp-kpi"
          aria-pressed={view === "alert"}
          onClick={() => setView("alert")}
        >
          <span className="dp-kpi-label">
            {ativosAlerta.length > 0 && (
              <span className="dp-sw" style={{ background: "var(--v2-med)" }} />
            )}
            Em alerta
          </span>
          <span className="dp-kpi-value">{ativosAlerta.length}</span>
          <span className="dp-kpi-foot">cobertos só por um dos dois</span>
        </button>
        <button
          type="button"
          className="dp-kpi"
          aria-pressed={view === "hist"}
          onClick={() => setView("hist")}
        >
          <span className="dp-kpi-label">Downtime no mês</span>
          <span className="dp-kpi-value">{fmtDuration(downtimeMes)}</span>
          <span className="dp-kpi-foot">
            {mesRows.length} {mesRows.length === 1 ? "evento" : "eventos"} desde{" "}
            {monthStart.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
          </span>
        </button>
      </div>

      {/* ── Gráfico + categorias ───────────────────────────────────────────── */}
      <div className="dp-grid">
        <div className="dp-card dp-span-2">
          <div className="dp-card-hdr">
            <div>
              <h2 className="dp-card-title">Indisponibilidades</h2>
              <p className="dp-card-sub">Eventos iniciados a cada 4 horas · últimos 10 dias</p>
            </div>
          </div>
          <div className="dp-card-body" style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={waveData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="dpWaveGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--v2-crit)" stopOpacity={0.32} />
                    <stop offset="100%" stopColor="var(--v2-crit)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke="var(--v2-line)" vertical={false} />
                <XAxis
                  dataKey="d"
                  ticks={dayTicks}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(v: string) => v.slice(0, 5)}
                />
                <YAxis
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  domain={[0, "auto"]}
                  width={32}
                />
                <Tooltip content={<WaveTooltip />} cursor={{ stroke: "var(--v2-line-strong)" }} />
                <Area
                  type="monotoneX"
                  dataKey="v"
                  stroke="var(--v2-crit)"
                  strokeWidth={2}
                  fill="url(#dpWaveGrad)"
                  dot={false}
                  activeDot={{
                    r: 4,
                    fill: "var(--v2-crit)",
                    stroke: "var(--v2-surface)",
                    strokeWidth: 2,
                  }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="dp-card dp-fit">
          <div className="dp-card-hdr">
            <div>
              <h2 className="dp-card-title">Por categoria</h2>
              <p className="dp-card-sub">Clique para filtrar a tabela</p>
            </div>
          </div>
          <div className="dp-card-body">
            <div className="dp-legend" style={{ marginBottom: 10 }}>
              <span>
                <span className="dp-sw" style={{ background: "var(--v2-ok)" }} /> Disponível
              </span>
              <span>
                <span className="dp-sw" style={{ background: "var(--v2-med)" }} /> Alerta
              </span>
              <span>
                <span className="dp-sw" style={{ background: "var(--v2-crit)" }} /> Indisponível
              </span>
            </div>
            {dispCat.length === 0 ? (
              <div className="dp-empty">Sem ativos cadastrados no CMDB.</div>
            ) : (
              <div className={`dp-cats${cat ? " filtering" : ""}`}>
                {dispCat.map((c) => {
                  const total = c.disponiveis + c.alerta + c.indisponiveis;
                  return (
                    <button
                      key={c.c}
                      type="button"
                      aria-pressed={cat === c.c}
                      onClick={() => setCat((cur) => (cur === c.c ? null : c.c))}
                      title={`${c.c}: ${c.disponiveis} disponíveis · ${c.alerta} em alerta · ${c.indisponiveis} indisponíveis`}
                    >
                      <span>{c.c}</span>
                      <span className="n">{total}</span>
                      <span className="bar">
                        {c.disponiveis > 0 && (
                          <i
                            style={{
                              width: `${(c.disponiveis / total) * 100}%`,
                              background: "var(--v2-ok)",
                            }}
                          />
                        )}
                        {c.alerta > 0 && (
                          <i
                            style={{
                              width: `${(c.alerta / total) * 100}%`,
                              background: "var(--v2-med)",
                            }}
                          />
                        )}
                        {c.indisponiveis > 0 && (
                          <i
                            style={{
                              width: `${(c.indisponiveis / total) * 100}%`,
                              background: "var(--v2-crit)",
                            }}
                          />
                        )}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Tabela ─────────────────────────────────────────────────────────── */}
      <div className="dp-card">
        <div className="dp-toolbar">
          <div className="dp-seg" role="group" aria-label="Visão">
            {(
              [
                ["down", "Indisponíveis agora", ativosIndisponiveis.length],
                ["alert", "Em alerta", ativosAlerta.length],
                ["hist", "Histórico de eventos", histRows.length],
              ] as const
            ).map(([k, l, n]) => (
              <button key={k} type="button" aria-pressed={view === k} onClick={() => setView(k)}>
                {l}
                <span className="n">{n}</span>
              </button>
            ))}
          </div>
          <label className="dp-search">
            <Search size={14} />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar ativo, IP ou hostname"
              aria-label="Buscar ativos"
            />
          </label>
          {cat && (
            <button type="button" className="dp-chip" onClick={() => setCat(null)}>
              Categoria: {cat} <X size={14} aria-label="Remover filtro" />
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="dp-empty">
            <Loader2
              size={14}
              className="dp-spin"
              style={{ display: "inline", verticalAlign: "-2px" }}
            />{" "}
            Carregando…
          </div>
        ) : view === "down" ? (
          downList.length === 0 ? (
            <div className="dp-empty-ok">
              <CheckCircle2 size={22} />
              <b>
                {q || cat
                  ? "Nenhum ativo indisponível com esses filtros"
                  : "Nenhum ativo indisponível"}
              </b>
              Todos os ativos do CMDB aparecem no SIEM, no Zabbix ou nos dois.
            </div>
          ) : (
            <div className="dp-scroll">
              <table className="dp-table">
                <thead>
                  <tr>
                    <th>Ativo</th>
                    <th>Tipo</th>
                    <th>Criticidade</th>
                    <th>Cobertura</th>
                    <th>Desde</th>
                    <th>Indisponível há</th>
                  </tr>
                </thead>
                <tbody>
                  {downList.map((a) => {
                    const inicio = openByAtivo.get(a.id)?.inicio ?? new Date().toISOString();
                    return (
                      <tr key={a.id} {...rowProps(a.id)}>
                        <td>
                          <span className="dp-asset">{a.nome}</span>
                          {a.ip_hostname && <span className="dp-host">{a.ip_hostname}</span>}
                        </td>
                        <td style={{ color: "var(--v2-fg-2)" }}>{a.tipo}</td>
                        <td>
                          <CritTag value={a.criticidade} />
                        </td>
                        <td>
                          <Coverage a={a} />
                        </td>
                        <td className="mono dim">{fmtDateTime(inicio)}</td>
                        <td>
                          <DuracaoCounter inicio={inicio} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : view === "alert" ? (
          alertList.length === 0 ? (
            <div className="dp-empty-ok">
              <CheckCircle2 size={22} />
              <b>
                {q || cat ? "Nenhum ativo em alerta com esses filtros" : "Nenhum ativo em alerta"}
              </b>
              Todos os ativos estão no SIEM e no Zabbix ao mesmo tempo.
            </div>
          ) : (
            <div className="dp-scroll">
              <table className="dp-table">
                <thead>
                  <tr>
                    <th>Ativo</th>
                    <th>Tipo</th>
                    <th>Criticidade</th>
                    <th>Cobertura</th>
                    <th>O que falta</th>
                  </tr>
                </thead>
                <tbody>
                  {alertList.map((a) => (
                    <tr key={a.id} {...rowProps(a.id)}>
                      <td>
                        <span className="dp-asset">{a.nome}</span>
                        {a.ip_hostname && <span className="dp-host">{a.ip_hostname}</span>}
                      </td>
                      <td style={{ color: "var(--v2-fg-2)" }}>{a.tipo}</td>
                      <td>
                        <CritTag value={a.criticidade} />
                      </td>
                      <td>
                        <Coverage a={a} />
                      </td>
                      <td style={{ color: "var(--v2-fg-2)" }}>
                        {a.siem ? "Não aparece no Zabbix" : "Não envia log ao QRadar"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : histList.length === 0 ? (
          <div className="dp-empty">
            {q || cat
              ? "Nenhum evento com esses filtros."
              : "Nenhuma indisponibilidade encerrada registrada."}
          </div>
        ) : (
          <div className="dp-scroll">
            <table className="dp-table">
              <thead>
                <tr>
                  <th>Ativo</th>
                  <th>Tipo</th>
                  <th>Início</th>
                  <th>Fim</th>
                  <th className="r">Duração</th>
                  <th>Motivo</th>
                </tr>
              </thead>
              <tbody>
                {histList.map((r) => (
                  <tr key={r.id} {...rowProps(r.ativo_id)}>
                    <td>
                      <span className="dp-asset">{r.ativo_nome}</span>
                    </td>
                    <td style={{ color: "var(--v2-fg-2)" }}>{r.ativo_tipo}</td>
                    <td className="mono dim">{fmtDateTime(r.inicio)}</td>
                    <td className="mono dim">{r.fim ? fmtDateTime(r.fim) : "—"}</td>
                    <td className="r mono">{fmtDuration(eventMinutes(r, downtimeTick))}</td>
                    <td style={{ color: "var(--v2-fg-2)" }} title={r.observacao ?? undefined}>
                      {r.motivo ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Painel lateral: ativo ──────────────────────────────────────────── */}
      <DetailSheet
        open={!!open}
        onOpenChange={(o) => !o && setOpenId(null)}
        eyebrow={open ? `${open.tipo}${open.ip_hostname ? ` · ${open.ip_hostname}` : ""}` : null}
        title={open?.nome ?? ""}
        badges={
          open && (
            <>
              {open.status === "Inativo" ? (
                <span className="dp-tag crit">
                  <AlertTriangle size={11} /> Indisponível
                </span>
              ) : open.status === "Alerta" ? (
                <span className="dp-tag warn">
                  <AlertTriangle size={11} /> Em alerta
                </span>
              ) : (
                <span className="dp-tag ok">
                  <CheckCircle2 size={11} /> Disponível
                </span>
              )}
              <span className="dp-tag">Criticidade {open.criticidade ?? "—"}</span>
            </>
          )
        }
      >
        {open && (
          <>
            {open.status === "Inativo" && (
              <div className="dp-note">
                Indisponível desde {fmtDateTime(openNow?.inicio ?? new Date().toISOString())} · há{" "}
                <DuracaoCounter inicio={openNow?.inicio ?? new Date().toISOString()} />
              </div>
            )}
            <DetailSection title="Cobertura">
              <div className="dp-cov-box">
                <div className={`dp-cov-tile ${open.siem ? "on" : "off"}`}>
                  <b>{open.siem ? <Check size={14} /> : <X size={14} />} SIEM (QRadar)</b>
                  <small>
                    {open.siem
                      ? "Envia log ao QRadar"
                      : siemCoverageStale
                        ? "Desconsiderado: sync do QRadar atrasado"
                        : "Nenhuma fonte de log ativa"}
                  </small>
                </div>
                <div className={`dp-cov-tile ${open.zbx ? "on" : "off"}`}>
                  <b>{open.zbx ? <Check size={14} /> : <X size={14} />} Zabbix</b>
                  <small>{open.zbx ? "Host monitorado" : "Não aparece no Zabbix"}</small>
                </div>
              </div>
              <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--v2-fg-3)" }}>
                Disponível quando aparece nos dois; em alerta com só um; indisponível sem nenhum.
              </p>
            </DetailSection>
            <DetailSection title="Ativo">
              <DetailList
                items={[
                  ["Tipo", open.tipo],
                  ["IP / hostname", open.ip_hostname ?? "—", true],
                  ["Criticidade", open.criticidade ?? "—"],
                  ["Downtime no mês", fmtDuration(openDowntimeMes), true],
                ]}
              />
            </DetailSection>
            <DetailSection title="Eventos registrados">
              {openEvents.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, color: "var(--v2-fg-3)" }}>
                  Nenhuma indisponibilidade registrada.
                </p>
              ) : (
                <div className="dp-ev">
                  {openEvents.map((r) => (
                    <div key={r.id}>
                      <span className="mono">
                        {fmtDateTime(r.inicio)} → {r.fim ? fmtTime(r.fim) : "agora"}
                      </span>
                      <span className="d">
                        {r.fim ? fmtDuration(eventMinutes(r, downtimeTick)) : "em aberto"}
                      </span>
                      {(r.motivo || r.observacao) && (
                        <small>{[r.motivo, r.observacao].filter(Boolean).join(" · ")}</small>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </DetailSection>
          </>
        )}
      </DetailSheet>
    </div>
  );
}
