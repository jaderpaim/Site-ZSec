import { SyncActions } from "@/components/layout/SyncActions";
import { ModuleLoading } from "@/components/layout/ModuleLoading";
import { DetailList, DetailSection, DetailSheet } from "@/components/layout/DetailSheet";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  getPhishingOverview,
  getPhishingTemplateCached,
  getPhishingOperations,
  getGophishSyncState,
  syncGophishData,
  type PhishingOverview,
} from "@/lib/phishing.functions";
import {
  AlertCircle,
  AlertTriangle,
  ArrowUpDown,
  ChevronDown,
  Eye,
  RefreshCw,
  Search,
  X,
} from "lucide-react";
import { toast } from "sonner";

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtDate(iso: string | null | undefined) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}
function fmtRel(iso: string | null | undefined) {
  if (!iso) return "—";
  const min = Math.floor(Math.max(0, Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  return `há ${Math.floor(h / 24)}d`;
}
const pct = (n: number, d: number) => (d > 0 ? Math.round((n / d) * 100) : 0);
// Faixas de cor para taxas de risco: até `good` verde, até `warn` âmbar, acima vermelho
const tone = (v: number, good: number, warn: number) =>
  v <= good ? "var(--v2-ok)" : v <= warn ? "var(--v2-med)" : "var(--v2-crit)";

const ACTION_COLOR: Record<string, string> = {
  "Dados Submetidos": "var(--v2-crit)",
  "Clicou no Link": "var(--v2-high)",
  "Abriu o E-mail": "var(--v2-med)",
  "E-mail Enviado": "var(--v2-low)",
};

// ── CSS (interface v2) ─────────────────────────────────────────────────────────
const CSS = `
  .ph-root { font-family:var(--font-ui); color:var(--v2-fg); display:flex; flex-direction:column; gap:20px; font-size:14px; }
  .ph-root * { box-sizing:border-box; }
  .ph-root ::-webkit-scrollbar { width:6px; height:6px; }
  .ph-root ::-webkit-scrollbar-thumb { background:var(--v2-line-strong); border-radius:3px; }
  .ph-root :focus-visible { outline:2px solid var(--v2-accent); outline-offset:2px; }
  .ph-root .mono { font-family:var(--font-data); font-size:12.5px; }
  .ph-root .dim { color:var(--v2-fg-3); }
  @keyframes ph-spin { to { transform:rotate(360deg) } }
  @keyframes ph-pulse { 50% { opacity:.3 } }
  .ph-spin { animation:ph-spin .8s linear infinite; }

  .ph-ph { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  .ph-ph-title { font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.2; margin:0; }
  .ph-ph-sub { margin:4px 0 0; font-size:13px; color:var(--v2-fg-3); display:flex; gap:6px; flex-wrap:wrap; align-items:center; }
  .ph-live { display:inline-flex; align-items:center; gap:6px; }
  .ph-live::before { content:""; width:7px; height:7px; border-radius:50%; background:var(--v2-ok); }
  .ph-subnav { display:flex; gap:2px; padding:4px; background:var(--v2-surface-2); border:1px solid var(--v2-line); border-radius:8px; width:fit-content; max-width:100%; flex-wrap:wrap; }
  .ph-subnav button { display:inline-flex; align-items:center; gap:8px; border:1px solid transparent; background:transparent; padding:6px 14px; border-radius:6px; font:500 13px var(--font-ui); color:var(--v2-fg-3); cursor:pointer; }
  .ph-subnav button:hover { color:var(--v2-fg); background:var(--v2-hover); }
  .ph-subnav button[aria-selected="true"] { background:var(--v2-surface); color:var(--v2-fg); border-color:var(--v2-line); }
  .ph-state { display:flex; flex-direction:column; align-items:center; gap:10px; padding:48px 24px; text-align:center; background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; }

  .ph-btn { display:inline-flex; align-items:center; gap:7px; height:32px; padding:0 12px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; font-family:var(--font-ui); white-space:nowrap; border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-fg); }
  .ph-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .ph-btn:hover:not(:disabled) { background:var(--v2-hover); }
  .ph-btn.lg { height:34px; padding:0 14px; }
  .ph-link { border:0; background:none; color:var(--v2-accent); font:500 12.5px var(--font-ui); cursor:pointer; padding:0; }
  .ph-select { height:32px; border:1px solid var(--v2-line); background:var(--v2-bg); color:var(--v2-fg); border-radius:8px; font:13px var(--font-ui); padding:0 10px; max-width:100%; }
  .ph-select.lg { height:34px; background:var(--v2-surface); }
  .ph-bar { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .ph-note { font-size:12.5px; color:var(--v2-fg-3); }

  .ph-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
  .ph-kpi { padding:16px 18px 14px; display:grid; gap:2px; align-content:start; box-shadow:1px 0 0 var(--v2-line), 0 1px 0 var(--v2-line); min-width:0; }
  .ph-kpi-label { font-size:12.5px; color:var(--v2-fg-2); display:flex; align-items:center; gap:6px; }
  .ph-kpi-value { font-size:28px; font-weight:600; letter-spacing:-0.02em; line-height:1.25; font-variant-numeric:tabular-nums; }
  .ph-kpi-value small { font-size:15px; font-weight:500; color:var(--v2-fg-3); margin-left:4px; }
  .ph-kpi-foot { font-size:12px; color:var(--v2-fg-3); }
  .ph-sw { width:8px; height:8px; border-radius:2px; display:inline-block; flex-shrink:0; }
  .ph-meter { height:6px; border-radius:99px; background:var(--v2-surface-2); overflow:hidden; margin:8px 0 4px; }
  .ph-meter i { display:block; height:100%; border-radius:99px; }

  .ph-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:20px; align-items:stretch; }
  .ph-span-2 { grid-column:span 2; }
  @media (max-width: 1100px) { .ph-grid { grid-template-columns:minmax(0, 1fr); } .ph-span-2 { grid-column:auto; } }
  .ph-panel { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; min-width:0; }
  .ph-panel-hdr { padding:14px 18px 4px; }
  .ph-panel-title { font-size:14px; font-weight:600; margin:0; }
  .ph-panel-title .n { font-weight:400; font-size:13px; color:var(--v2-fg-3); }
  .ph-panel-sub { margin:2px 0 0; font-size:12.5px; color:var(--v2-fg-3); }
  .ph-panel-body { padding:12px 18px 16px; }
  .ph-empty { padding:28px 16px; text-align:center; color:var(--v2-fg-3); font-size:13px; }

  .ph-funnel { display:grid; gap:14px; }
  .ph-stage { display:grid; gap:6px; }
  .ph-stage-top { display:flex; justify-content:space-between; gap:8px; font-size:13px; }
  .ph-stage-top b { font-weight:500; }
  .ph-stage-top span { font:500 13px var(--font-data); }
  .ph-stage-top span small { color:var(--v2-fg-3); font-weight:400; margin-left:6px; }
  .ph-track { height:12px; border-radius:4px; background:var(--v2-surface-2); overflow:hidden; }
  .ph-track i { display:block; height:100%; border-radius:4px; }
  .ph-drop { font-size:12px; color:var(--v2-fg-3); }
  .ph-callout { display:flex; gap:10px; padding:10px 12px; margin-top:16px; border-radius:8px; font-size:13px; line-height:1.5; color:var(--v2-fg-2); background:color-mix(in oklch, var(--v2-crit) 9%, transparent); border:1px solid color-mix(in oklch, var(--v2-crit) 30%, transparent); }
  .ph-callout svg { color:var(--v2-crit); flex-shrink:0; margin-top:2px; }
  .ph-callout b { color:var(--v2-fg); font-weight:600; }

  .ph-dept-h, .ph-dept > button { display:grid; grid-template-columns:minmax(0, 1.2fr) 72px minmax(0, 1fr) minmax(0, 1fr); gap:14px; align-items:center; }
  .ph-dept-h { font-size:12px; color:var(--v2-fg-3); padding:0 8px 8px; border-bottom:1px solid var(--v2-line); }
  .ph-dept-h span:nth-child(2) { text-align:right; }
  .ph-dept { max-height:420px; overflow-y:auto; }
  .ph-dept > button { width:100%; padding:9px 8px; border:0; border-bottom:1px solid var(--v2-line); background:transparent; color:var(--v2-fg); font:13px var(--font-ui); text-align:left; cursor:pointer; }
  .ph-dept > button:last-child { border-bottom:0; }
  .ph-dept > button:hover { background:var(--v2-hover); }
  .ph-dept > button[aria-pressed="true"] { background:color-mix(in oklch, var(--v2-accent) 12%, transparent); }
  .ph-dept .nm { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .ph-dept .n { font:400 12.5px var(--font-data); color:var(--v2-fg-2); text-align:right; }
  .ph-rate { display:grid; grid-template-columns:minmax(40px, 1fr) 40px; gap:8px; align-items:center; font:500 12.5px var(--font-data); }
  .ph-rate .tr { height:8px; border-radius:99px; background:var(--v2-surface-2); overflow:hidden; }
  .ph-rate .tr i { display:block; height:100%; border-radius:99px; }
  .ph-rate span:last-child { text-align:right; }
  @media (max-width: 640px) { .ph-dept-h, .ph-dept > button { grid-template-columns:minmax(0, 1fr) 90px 90px; } .ph-dept-h span:nth-child(2), .ph-dept .n { display:none; } }

  .ph-filters { display:flex; flex-wrap:wrap; gap:8px; align-items:center; padding:12px 18px; border-bottom:1px solid var(--v2-line); }
  .ph-filters > b { font-size:14px; font-weight:600; margin-right:4px; }
  .ph-filters > b span { font-weight:400; font-size:13px; color:var(--v2-fg-3); }
  .ph-search { display:inline-flex; align-items:center; gap:8px; height:32px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg-3); width:250px; max-width:100%; margin-left:auto; }
  .ph-search input { flex:1; min-width:0; border:0; outline:none; background:transparent; color:var(--v2-fg); font-size:13px; font-family:inherit; }
  .ph-chips { display:flex; flex-wrap:wrap; gap:6px; align-items:center; padding:10px 18px; border-bottom:1px solid var(--v2-line); }
  .ph-fchip { display:inline-flex; align-items:center; gap:6px; height:26px; padding:0 4px 0 9px; border-radius:5px; background:var(--v2-surface-2); border:1px solid var(--v2-line); font-size:12.5px; }
  .ph-fchip b { color:var(--v2-fg-3); font-weight:400; }
  .ph-fchip button { border:0; background:none; color:var(--v2-fg-3); cursor:pointer; display:grid; place-items:center; width:20px; height:20px; border-radius:4px; }
  .ph-fchip button:hover { background:var(--v2-hover); color:var(--v2-fg); }

  .ph-scroll { overflow:auto; max-height:560px; }
  .ph-table { width:100%; border-collapse:collapse; font-size:13px; }
  .ph-table thead { position:sticky; top:0; z-index:1; }
  .ph-table th { padding:9px 12px; font-size:12px; font-weight:500; color:var(--v2-fg-3); text-align:left; background:var(--v2-surface); border-bottom:1px solid var(--v2-line); white-space:nowrap; }
  .ph-table th button { display:inline-flex; align-items:center; gap:4px; border:0; background:none; color:inherit; font:inherit; cursor:pointer; padding:0; }
  .ph-table th button svg { opacity:.45; }
  .ph-table th[aria-sort] button { color:var(--v2-fg); }
  .ph-table th[aria-sort] button svg { opacity:1; color:var(--v2-accent); }
  .ph-table td { padding:8px 12px; height:44px; border-bottom:1px solid var(--v2-line); vertical-align:middle; }
  .ph-table th:first-child, .ph-table td:first-child { padding-left:18px; }
  .ph-table th:last-child, .ph-table td:last-child { padding-right:18px; }
  .ph-table tbody tr:hover td { background:var(--v2-hover); }
  .ph-table tbody tr:last-child td { border-bottom:none; }
  .ph-table td.trunc { max-width:240px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .ph-pill { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; white-space:nowrap; background:color-mix(in oklch, var(--c) 14%, transparent); color:color-mix(in oklch, var(--c) 72%, var(--v2-fg)); }
  .ph-pill::before { content:""; width:6px; height:6px; border-radius:50%; background:var(--c); }
  .ph-pill.live::before { animation:ph-pulse 1.6s infinite; }
  @media (prefers-reduced-motion: reduce) { .ph-pill.live::before { animation:none; } }

  .ph-camps { display:grid; grid-template-columns:repeat(auto-fill, minmax(320px, 1fr)); gap:14px; }
  .ph-camp { display:grid; gap:12px; padding:16px; border:1px solid var(--v2-line); border-radius:12px; background:var(--v2-surface); }
  .ph-camp-h { display:flex; gap:10px; align-items:flex-start; }
  .ph-camp-h b { font-size:14px; font-weight:600; display:block; }
  .ph-camp-h small { font-size:12px; color:var(--v2-fg-3); }
  .ph-camp-h .ph-pill { margin-left:auto; }
  .ph-mini { display:grid; grid-template-columns:repeat(5, minmax(0, 1fr)); gap:6px; }
  .ph-mini div { display:grid; gap:2px; padding:8px; border-radius:8px; background:var(--v2-surface-2); min-width:0; }
  .ph-mini b { font:600 16px var(--font-data); }
  .ph-mini span { font-size:11.5px; color:var(--v2-fg-3); }
  .ph-stk { display:flex; height:8px; gap:2px; border-radius:99px; overflow:hidden; background:var(--v2-surface-2); }
  .ph-stk i { display:block; height:100%; }

  .ph-grp { border-bottom:1px solid var(--v2-line); }
  .ph-grp:last-child { border-bottom:0; }
  .ph-grp > button { display:grid; grid-template-columns:minmax(0, 1fr) auto auto 18px; gap:12px; align-items:center; width:100%; padding:11px 18px; border:0; background:transparent; color:var(--v2-fg); font:13px var(--font-ui); text-align:left; cursor:pointer; }
  .ph-grp > button:hover { background:var(--v2-hover); }
  .ph-grp > button b { font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .ph-grp .chev { color:var(--v2-fg-3); transition:transform .15s; }
  .ph-grp.open .chev { transform:rotate(180deg); }
  .ph-grp-b { padding:0 18px 12px; max-height:320px; overflow-y:auto; }
  .ph-grp-b > div { display:grid; grid-template-columns:minmax(0, 1.3fr) minmax(0, 1fr) minmax(0, 1fr); gap:10px; padding:6px 0; font-size:12.5px; border-top:1px dashed var(--v2-line); }
  .ph-grp-b span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
`;

// ══════════════════════════════════════════════════════════════════════════════
export function PhishingDashboard() {
  // ── back-end UNCHANGED ─────────────────────────────────────────────────────
  const qc = useQueryClient();
  const fetchOverview = useServerFn(getPhishingOverview);
  const fetchSyncState = useServerFn(getGophishSyncState);
  const doSync = useServerFn(syncGophishData);
  const [syncing, setSyncing] = React.useState(false);
  const [activeTab, setActiveTab] = React.useState<"dashboard" | "operacoes">("dashboard");

  const { data, isLoading, error } = useQuery({
    queryKey: ["phishing", "overview"],
    queryFn: () => fetchOverview(),
    staleTime: 5 * 60 * 1000,
  });
  const { data: syncState } = useQuery({
    queryKey: ["phishing", "sync-state"],
    queryFn: () => fetchSyncState(),
    staleTime: 5 * 60 * 1000,
  });

  async function handleSync() {
    setSyncing(true);
    try {
      const r = await doSync();
      if (r.ok)
        toast.success(
          `Sincronizado: ${r.counts?.campaigns ?? 0} campanhas, ${r.counts?.groups ?? 0} grupos`,
        );
      else toast.error(`Erro no sync: ${r.error ?? "desconhecido"}`);
      await qc.refetchQueries({ queryKey: ["phishing"] });
    } finally {
      setSyncing(false);
    }
  }
  // ──────────────────────────────────────────────────────────────────────────

  const errorMsg = error
    ? (error as Error).message || "Erro ao carregar."
    : !data || data.ok === false
      ? (data?.error ?? "Sem dados.")
      : null;

  if (isLoading) return <ModuleLoading />;

  return (
    <div className="ph-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Cabeçalho ──────────────────────────────────────────────────── */}
      <div className="ph-ph">
        <div>
          <h1 className="ph-ph-title">Simulação de phishing</h1>
          <p className="ph-ph-sub">
            {syncState?.synced_at && (
              <>
                <span className="ph-live" title={fmtDate(syncState.synced_at)}>
                  Sincronizado {fmtRel(syncState.synced_at)}
                </span>
                <span>·</span>
              </>
            )}
            <span>Gophish: campanhas, cliques e comprometimentos</span>
          </p>
        </div>
        <SyncActions moduleSlug="phishing" jobs={["gophish-sync"]}>
          <button className="ph-btn lg" onClick={handleSync} disabled={syncing}>
            <RefreshCw size={14} className={syncing ? "ph-spin" : ""} />
            {syncing ? "Sincronizando…" : "Sincronizar"}
          </button>
        </SyncActions>
      </div>

      <div className="ph-subnav" role="tablist" aria-label="Seções do Phishing">
        {(
          [
            ["dashboard", "Dashboard"],
            ["operacoes", "Operações"],
          ] as const
        ).map(([k, l]) => (
          <button
            key={k}
            type="button"
            role="tab"
            aria-selected={activeTab === k}
            onClick={() => setActiveTab(k)}
          >
            {l}
          </button>
        ))}
      </div>

      {errorMsg ? (
        <div className="ph-state">
          <AlertCircle size={22} color="var(--v2-crit)" />
          <span style={{ fontSize: 15, fontWeight: 600 }}>Sem dados do Gophish</span>
          <span className="dim" style={{ fontSize: 13, maxWidth: 420 }}>
            {errorMsg}
          </span>
          <span className="dim" style={{ fontSize: 12.5 }}>
            Verifique em Integrações → Gophish e sincronize.
          </span>
          <button className="ph-btn" onClick={handleSync} disabled={syncing}>
            <RefreshCw size={14} className={syncing ? "ph-spin" : ""} />
            {syncing ? "Sincronizando…" : "Sincronizar agora"}
          </button>
        </div>
      ) : (
        data &&
        data.ok !== false && (
          <>
            {activeTab === "dashboard" && <DashboardTab data={data as PhishingOverview} />}
            {activeTab === "operacoes" && <OperationsTab />}
          </>
        )
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
type SortKey =
  | "email"
  | "status"
  | "action"
  | "cargo"
  | "departamento"
  | "campanha"
  | "launch_date";
type Row = PhishingOverview["details"][number];

function DashboardTab({ data }: { data: PhishingOverview }) {
  // ── back-end UNCHANGED ─────────────────────────────────────────────────────
  const [filters, setFilters] = React.useState({
    dept: "all",
    cargo: "all",
    nivel: "all",
    action: "all",
  });
  const [search, setSearch] = React.useState("");
  const [sortKey, setSortKey] = React.useState<SortKey>("launch_date");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("desc");
  const [selectedTemplate, setSelectedTemplate] = React.useState<number | null>(null);
  const [tplOpen, setTplOpen] = React.useState(false);
  const fetchTemplate = useServerFn(getPhishingTemplateCached);
  const tplQuery = useQuery({
    queryKey: ["phishing", "template", selectedTemplate],
    queryFn: () => fetchTemplate({ data: { id: selectedTemplate! } }),
    enabled: selectedTemplate !== null && tplOpen,
  });
  // ──────────────────────────────────────────────────────────────────────────

  // Base do painel: tudo, ou só as campanhas que usaram o template escolhido
  const base = React.useMemo(
    () =>
      selectedTemplate === null
        ? data.details
        : data.details.filter((r) => r.template_id === selectedTemplate),
    [data.details, selectedTemplate],
  );
  const selectedTemplateName =
    selectedTemplate === null
      ? null
      : (data.templatesUsed.find((t) => t.id === selectedTemplate)?.name ?? null);

  const deptOptions = React.useMemo(
    () => Array.from(new Set(base.map((d) => d.departamento))).sort(),
    [base],
  );
  const cargoOptions = React.useMemo(
    () => Array.from(new Set(base.map((d) => d.cargo).filter((c) => c && c !== "—"))).sort(),
    [base],
  );
  const nivelOptions = React.useMemo(
    () => Array.from(new Set(base.map((d) => d.nivel))).sort(),
    [base],
  );
  const actionOptions = React.useMemo(
    () => Array.from(new Set(base.map((d) => d.action))).sort(),
    [base],
  );

  const filtered = React.useMemo(() => {
    const s = search.trim().toLowerCase();
    return base.filter((row) => {
      if (filters.dept !== "all" && row.departamento !== filters.dept) return false;
      if (filters.cargo !== "all" && row.cargo !== filters.cargo) return false;
      if (filters.nivel !== "all" && row.nivel !== filters.nivel) return false;
      if (filters.action !== "all" && row.action !== filters.action) return false;
      if (s) {
        const hay =
          `${row.email} ${row.cargo} ${row.departamento} ${row.campanha} ${row.status}`.toLowerCase();
        if (!hay.includes(s)) return false;
      }
      return true;
    });
  }, [base, filters, search]);

  const sorted = React.useMemo(() => {
    const arr = [...filtered];
    arr.sort((a, b) => {
      const av = String(a[sortKey] ?? "").toLowerCase();
      const bv = String(b[sortKey] ?? "").toLowerCase();
      return av < bv ? (sortDir === "asc" ? -1 : 1) : av > bv ? (sortDir === "asc" ? 1 : -1) : 0;
    });
    return arr;
  }, [filtered, sortKey, sortDir]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(k);
      setSortDir("asc");
    }
  }

  // KPIs: globais do sync, ou recalculados quando há template escolhido
  const sent = selectedTemplate !== null ? base.length : data.kpis.sent;
  const opened = selectedTemplate !== null ? base.filter((r) => r.opened).length : data.kpis.opened;
  const clicked =
    selectedTemplate !== null ? base.filter((r) => r.clicked).length : data.kpis.clicked;
  const submitted =
    selectedTemplate !== null ? base.filter((r) => r.submitted).length : data.kpis.submitted;
  const openPct = selectedTemplate !== null ? pct(opened, sent) : data.kpis.openedPct;
  const clickPct = selectedTemplate !== null ? pct(clicked, sent) : data.kpis.clickedPct;
  const compPct = selectedTemplate !== null ? pct(submitted, sent) : data.kpis.compromisePct;

  // Risco por departamento: taxa sobre quem recebeu (contagem bruta favorece áreas grandes)
  const deptRisk = React.useMemo(() => {
    const m = new Map<string, { n: number; c: number; s: number }>();
    for (const r of base) {
      const x = m.get(r.departamento) ?? { n: 0, c: 0, s: 0 };
      x.n++;
      if (r.clicked) x.c++;
      if (r.submitted) x.s++;
      m.set(r.departamento, x);
    }
    return [...m.entries()]
      .map(([dept, x]) => ({ dept, n: x.n, c: pct(x.c, x.n), s: pct(x.s, x.n) }))
      .sort((a, b) => b.c - a.c || b.s - a.s || b.n - a.n);
  }, [base]);

  const chips = (
    [
      ["dept", "Departamento"],
      ["cargo", "Cargo"],
      ["nivel", "Nível"],
      ["action", "Ação"],
    ] as const
  )
    .filter(([k]) => filters[k] !== "all")
    .map(([k, l]) => ({ k, l, v: filters[k] }));
  const setFilter = (k: keyof typeof filters, v: string) => setFilters((f) => ({ ...f, [k]: v }));
  const totalCampaigns = data.campaignsStatus.ativas + data.campaignsStatus.arquivadas;

  const Stage = ({
    label,
    n,
    color,
    prev,
    prevLabel,
  }: {
    label: string;
    n: number;
    color: string;
    prev?: number;
    prevLabel?: string;
  }) => (
    <div className="ph-stage">
      <div className="ph-stage-top">
        <b>{label}</b>
        <span>
          {n.toLocaleString("pt-BR")}
          <small>{pct(n, sent)}%</small>
        </span>
      </div>
      <div className="ph-track">
        <i style={{ width: `${pct(n, sent)}%`, background: color }} />
      </div>
      {prev !== undefined && (
        <span className="ph-drop">
          {pct(n, prev)}% de quem {prevLabel}
        </span>
      )}
    </div>
  );

  const Th = ({ k, label }: { k: SortKey; label: string }) => (
    <th aria-sort={sortKey === k ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>
      <button type="button" onClick={() => toggleSort(k)}>
        {label}
        <ArrowUpDown size={11} />
      </button>
    </th>
  );

  return (
    <>
      {/* ── Template ── */}
      <div className="ph-bar">
        <select
          className="ph-select lg"
          aria-label="Template"
          value={selectedTemplate === null ? "" : String(selectedTemplate)}
          onChange={(e) => {
            setSelectedTemplate(e.target.value ? Number(e.target.value) : null);
            setFilters({ dept: "all", cargo: "all", nivel: "all", action: "all" });
          }}
        >
          <option value="">
            Todos os templates ({data.templatesUsed.length} em uso de {data.templatesTotal})
          </option>
          {data.templatesUsed.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        {selectedTemplate !== null ? (
          <>
            <button className="ph-btn" onClick={() => setTplOpen(true)}>
              <Eye size={14} /> Ver e-mail do template
            </button>
            <button className="ph-link" onClick={() => setSelectedTemplate(null)}>
              Limpar
            </button>
          </>
        ) : (
          <span className="ph-note">
            Escolha um template para filtrar todo o painel e ver o e-mail usado
          </span>
        )}
      </div>

      {/* ── KPIs ── */}
      <div className="ph-kpis">
        <div className="ph-kpi">
          <span className="ph-kpi-label">E-mails enviados</span>
          <span className="ph-kpi-value">{sent.toLocaleString("pt-BR")}</span>
          <span className="ph-kpi-foot">
            {selectedTemplateName ? "filtrado por template" : "em todas as campanhas sincronizadas"}
          </span>
        </div>
        <div className="ph-kpi">
          <span className="ph-kpi-label">Abriram</span>
          <span className="ph-kpi-value">
            {openPct}%<small>{opened.toLocaleString("pt-BR")}</small>
          </span>
          <div className="ph-meter">
            <i style={{ width: `${openPct}%`, background: "var(--v2-med)" }} />
          </div>
          <span className="ph-kpi-foot">dos e-mails enviados</span>
        </div>
        <div className="ph-kpi">
          <span className="ph-kpi-label">
            <span className="ph-sw" style={{ background: "var(--v2-high)" }} />
            Clicaram no link
          </span>
          <span className="ph-kpi-value">
            {clickPct}%<small>{clicked.toLocaleString("pt-BR")}</small>
          </span>
          <div className="ph-meter">
            <i style={{ width: `${clickPct}%`, background: tone(clickPct, 10, 20) }} />
          </div>
          <span className="ph-kpi-foot">dos e-mails enviados</span>
        </div>
        <div className="ph-kpi">
          <span className="ph-kpi-label">
            <span className="ph-sw" style={{ background: "var(--v2-crit)" }} />
            Comprometidos
          </span>
          <span className="ph-kpi-value">
            {compPct}%<small>{submitted.toLocaleString("pt-BR")}</small>
          </span>
          <div className="ph-meter">
            <i style={{ width: `${compPct}%`, background: tone(compPct, 3, 8) }} />
          </div>
          <span className="ph-kpi-foot">digitaram dados na página falsa</span>
        </div>
        <div className="ph-kpi">
          <span className="ph-kpi-label">Campanhas</span>
          <span className="ph-kpi-value">{totalCampaigns}</span>
          <span className="ph-kpi-foot">
            {data.campaignsStatus.ativas} ativas · {data.campaignsStatus.arquivadas} arquivadas ·{" "}
            {data.templatesUsed.length} de {data.templatesTotal} templates em uso
          </span>
        </div>
      </div>

      <div className="ph-grid">
        {/* ── Funil ── */}
        <div className="ph-panel">
          <div className="ph-panel-hdr">
            <h2 className="ph-panel-title">Funil de risco</h2>
            <p className="ph-panel-sub">Do envio ao comprometimento</p>
          </div>
          <div className="ph-panel-body">
            <div className="ph-funnel">
              <Stage label="Enviados" n={sent} color="var(--v2-low)" />
              <Stage
                label="Abriram"
                n={opened}
                color="var(--v2-med)"
                prev={sent}
                prevLabel="recebeu"
              />
              <Stage
                label="Clicaram"
                n={clicked}
                color="var(--v2-high)"
                prev={opened}
                prevLabel="abriu"
              />
              <Stage
                label="Submeteram dados"
                n={submitted}
                color="var(--v2-crit)"
                prev={clicked}
                prevLabel="clicou"
              />
            </div>
            {clicked > 0 && (
              <div className="ph-callout">
                <AlertTriangle size={15} />
                <span>
                  <b>{pct(submitted, clicked)}% de quem clicou entregou dados.</b> O treinamento
                  logo depois do clique é o ponto de maior ganho.
                </span>
              </div>
            )}
          </div>
        </div>

        {/* ── Risco por departamento ── */}
        <div className="ph-panel ph-span-2">
          <div className="ph-panel-hdr">
            <h2 className="ph-panel-title">Risco por departamento</h2>
            <p className="ph-panel-sub">
              Taxa sobre quem recebeu, pior primeiro · clique para filtrar o detalhamento
            </p>
          </div>
          <div className="ph-panel-body">
            {deptRisk.length === 0 ? (
              <div className="ph-empty">Sem envios no período.</div>
            ) : (
              <>
                <div className="ph-dept-h">
                  <span>Departamento</span>
                  <span>Receberam</span>
                  <span>Clicaram</span>
                  <span>Submeteram</span>
                </div>
                <div className="ph-dept">
                  {deptRisk.map((d) => (
                    <button
                      key={d.dept}
                      type="button"
                      aria-pressed={filters.dept === d.dept}
                      onClick={() => setFilter("dept", filters.dept === d.dept ? "all" : d.dept)}
                    >
                      <span className="nm" title={d.dept}>
                        {d.dept}
                      </span>
                      <span className="n">{d.n}</span>
                      <span className="ph-rate">
                        <span className="tr">
                          <i style={{ width: `${d.c}%`, background: tone(d.c, 10, 20) }} />
                        </span>
                        <span>{d.c}%</span>
                      </span>
                      <span className="ph-rate">
                        <span className="tr">
                          <i
                            style={{
                              width: `${Math.min(100, d.s * 2)}%`,
                              background: tone(d.s, 3, 8),
                            }}
                          />
                        </span>
                        <span>{d.s}%</span>
                      </span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Detalhamento ── */}
      <div className="ph-panel">
        <div className="ph-filters">
          <b>
            Detalhamento{" "}
            <span>
              ({sorted.length === base.length ? base.length : `${sorted.length} de ${base.length}`})
            </span>
          </b>
          <select
            className="ph-select"
            aria-label="Departamento"
            value={filters.dept}
            onChange={(e) => setFilter("dept", e.target.value)}
          >
            <option value="all">Departamento: todos</option>
            {deptOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <select
            className="ph-select"
            aria-label="Cargo"
            value={filters.cargo}
            onChange={(e) => setFilter("cargo", e.target.value)}
          >
            <option value="all">Cargo: todos</option>
            {cargoOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <select
            className="ph-select"
            aria-label="Nível"
            value={filters.nivel}
            onChange={(e) => setFilter("nivel", e.target.value)}
          >
            <option value="all">Nível: todos</option>
            {nivelOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <select
            className="ph-select"
            aria-label="Ação"
            value={filters.action}
            onChange={(e) => setFilter("action", e.target.value)}
          >
            <option value="all">Ação: todas</option>
            {actionOptions.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
          <label className="ph-search">
            <Search size={14} />
            <input
              placeholder="Buscar e-mail, cargo, campanha"
              aria-label="Buscar no detalhamento"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        {chips.length > 0 && (
          <div className="ph-chips">
            {chips.map((c) => (
              <span key={c.k} className="ph-fchip">
                <b>{c.l}:</b> {c.v}
                <button onClick={() => setFilter(c.k, "all")} aria-label={`Remover filtro ${c.v}`}>
                  <X size={12} />
                </button>
              </span>
            ))}
            <button
              className="ph-link"
              onClick={() => setFilters({ dept: "all", cargo: "all", nivel: "all", action: "all" })}
            >
              Limpar filtros
            </button>
          </div>
        )}
        {sorted.length === 0 ? (
          <div className="ph-empty">Nenhum registro com os filtros aplicados.</div>
        ) : (
          <div className="ph-scroll">
            <table className="ph-table">
              <thead>
                <tr>
                  <Th k="launch_date" label="Data" />
                  <Th k="email" label="E-mail" />
                  <Th k="action" label="Ação" />
                  <Th k="cargo" label="Cargo" />
                  <Th k="departamento" label="Departamento" />
                  <Th k="campanha" label="Campanha" />
                </tr>
              </thead>
              <tbody>
                {sorted.map((r: Row, i) => (
                  <tr key={`${r.email}-${r.campanha}-${i}`}>
                    <td className="mono dim" style={{ whiteSpace: "nowrap" }}>
                      {r.launch_date ? new Date(r.launch_date).toLocaleDateString("pt-BR") : "—"}
                    </td>
                    <td className="mono trunc" title={r.email} style={{ maxWidth: 280 }}>
                      {r.email}
                    </td>
                    <td>
                      <span
                        className="ph-pill"
                        style={
                          {
                            "--c": ACTION_COLOR[r.action] ?? "var(--v2-fg-3)",
                          } as React.CSSProperties
                        }
                        title={r.status}
                      >
                        {r.action}
                      </span>
                    </td>
                    <td className="trunc">
                      {r.cargo}
                      {r.nivel && <span className="dim"> · {r.nivel}</span>}
                    </td>
                    <td className="trunc" title={r.departamento}>
                      {r.departamento}
                    </td>
                    <td className="trunc dim" title={r.campanha}>
                      {r.campanha}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <DetailSheet
        open={tplOpen && selectedTemplate !== null}
        onOpenChange={setTplOpen}
        eyebrow="Template do Gophish"
        title={tplQuery.data?.ok ? tplQuery.data.name : (selectedTemplateName ?? "Template")}
        width={680}
      >
        {tplQuery.isLoading ? (
          <div className="flex items-center gap-2 text-[13px] text-v2-fg-3">
            <RefreshCw size={14} className="animate-spin" /> Carregando template…
          </div>
        ) : tplQuery.data?.ok ? (
          <>
            <DetailSection title="Mensagem">
              <DetailList items={[["Assunto", tplQuery.data.subject || "(sem assunto)"]]} />
            </DetailSection>
            <iframe
              title={`Prévia: ${tplQuery.data.name}`}
              srcDoc={tplQuery.data.html || "<p style='padding:1rem'>Sem HTML.</p>"}
              sandbox=""
              style={{
                width: "100%",
                height: 480,
                background: "white",
                borderRadius: 8,
                border: "1px solid var(--v2-line)",
              }}
            />
          </>
        ) : (
          <div className="flex items-center gap-2 text-[13px]" style={{ color: "var(--v2-crit)" }}>
            <AlertCircle size={14} /> {tplQuery.data?.error ?? "Falha ao carregar template."}
          </div>
        )}
      </DetailSheet>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// OPERAÇÕES
// ══════════════════════════════════════════════════════════════════════════════
function OperationsTab() {
  // ── back-end UNCHANGED ─────────────────────────────────────────────────────
  const fetchOps = useServerFn(getPhishingOperations);
  const { data, isLoading, error } = useQuery({
    queryKey: ["phishing", "operations"],
    queryFn: () => fetchOps(),
    staleTime: 5 * 60 * 1000,
  });
  // ──────────────────────────────────────────────────────────────────────────
  if (isLoading)
    return (
      <div className="ph-state">
        <RefreshCw size={18} className="ph-spin" />
      </div>
    );
  if (error || !data || data.ok === false)
    return (
      <div className="ph-state">
        <span className="dim" style={{ fontSize: 13 }}>
          {(error as Error)?.message || (data && !data.ok ? data.error : "Sem dados.")}
        </span>
      </div>
    );
  return (
    <>
      <RunningCampaignsPanel campaigns={data.runningCampaigns} />
      <div className="ph-grid">
        <GroupsPanel groups={data.groups} />
        <UsersPanel users={data.users} />
      </div>
    </>
  );
}

type Group = {
  id: number;
  name: string;
  targets: number;
  modified_date?: string;
  members: Array<{ email: string; first_name?: string; last_name?: string; position?: string }>;
};

function GroupsPanel({ groups }: { groups: Group[] }) {
  const [search, setSearch] = React.useState("");
  const [expanded, setExpanded] = React.useState<number | null>(null);
  const filtered = React.useMemo(() => {
    const s = search.trim().toLowerCase();
    return s ? groups.filter((g) => g.name.toLowerCase().includes(s)) : groups;
  }, [groups, search]);

  return (
    <div className="ph-panel ph-span-2">
      <div className="ph-filters">
        <b>
          Grupos de destinatários <span>({groups.length})</span>
        </b>
        <label className="ph-search">
          <Search size={14} />
          <input
            placeholder="Buscar grupo"
            aria-label="Buscar grupo"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
      </div>
      <div style={{ maxHeight: 560, overflowY: "auto" }}>
        {filtered.length === 0 ? (
          <div className="ph-empty">Nenhum grupo.</div>
        ) : (
          filtered.map((g) => {
            const open = expanded === g.id;
            return (
              <div key={g.id} className={`ph-grp${open ? " open" : ""}`}>
                <button
                  type="button"
                  aria-expanded={open}
                  onClick={() => setExpanded(open ? null : g.id)}
                >
                  <b title={g.name}>{g.name}</b>
                  <span className="mono dim">{g.targets} pessoas</span>
                  <span className="dim" style={{ fontSize: 12.5 }}>
                    {g.modified_date ? `alterado ${fmtRel(g.modified_date)}` : "—"}
                  </span>
                  <ChevronDown size={16} className="chev" />
                </button>
                {open && (
                  <div className="ph-grp-b">
                    {g.members.length === 0 ? (
                      <div className="dim">Nenhum membro.</div>
                    ) : (
                      g.members.map((m, i) => (
                        <div key={i}>
                          <span className="mono" title={m.email}>
                            {m.email}
                          </span>
                          <span>
                            {[m.first_name, m.last_name].filter(Boolean).join(" ") || "—"}
                          </span>
                          <span className="dim">{m.position || "—"}</span>
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

function UsersPanel({ users }: { users: Array<{ id: number; username: string; role?: string }> }) {
  return (
    <div className="ph-panel">
      <div className="ph-panel-hdr">
        <h2 className="ph-panel-title">
          Usuários do Gophish <span className="n">({users.length})</span>
        </h2>
        <p className="ph-panel-sub">Contas com acesso ao console</p>
      </div>
      {users.length === 0 ? (
        <div className="ph-empty">Nenhum usuário.</div>
      ) : (
        <div className="ph-scroll" style={{ marginTop: 8 }}>
          <table className="ph-table">
            <thead>
              <tr>
                <th>Usuário</th>
                <th>Papel</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const admin = (u.role ?? "").toLowerCase() === "admin";
                return (
                  <tr key={u.id}>
                    <td className="mono">{u.username}</td>
                    <td>
                      <span
                        className="ph-pill"
                        style={
                          {
                            "--c": admin ? "var(--v2-accent)" : "var(--v2-fg-3)",
                          } as React.CSSProperties
                        }
                      >
                        {admin ? "Admin" : u.role || "Usuário"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

type RunningCampaign = {
  id: number;
  name: string;
  status: string;
  launch_date?: string;
  template?: string;
  counters: { sent: number; opened: number; clicked: number; submitted: number; reported: number };
};

function RunningCampaignsPanel({ campaigns }: { campaigns: RunningCampaign[] }) {
  return (
    <div className="ph-panel">
      <div className="ph-panel-hdr">
        <h2 className="ph-panel-title">
          Campanhas em andamento <span className="n">({campaigns.length})</span>
        </h2>
        <p className="ph-panel-sub">Ao serem concluídas no Gophish, entram no Dashboard</p>
      </div>
      <div className="ph-panel-body">
        {campaigns.length === 0 ? (
          <div className="ph-empty">Nenhuma campanha em andamento.</div>
        ) : (
          <div className="ph-camps">
            {campaigns.map((c) => {
              const { sent, opened, clicked, submitted, reported } = c.counters;
              return (
                <div key={c.id} className="ph-camp">
                  <div className="ph-camp-h">
                    <div style={{ minWidth: 0 }}>
                      <b>{c.name}</b>
                      <small>
                        {c.template ?? "—"} · lançada {c.launch_date ? fmtDate(c.launch_date) : "—"}
                      </small>
                    </div>
                    <span
                      className="ph-pill live"
                      style={{ "--c": "var(--v2-accent)" } as React.CSSProperties}
                    >
                      {c.status === "In progress" ? "Em andamento" : c.status}
                    </span>
                  </div>
                  <div className="ph-mini">
                    {(
                      [
                        ["Enviados", sent, undefined],
                        ["Abriram", opened, undefined],
                        ["Clicaram", clicked, "var(--v2-high)"],
                        ["Submeteram", submitted, "var(--v2-crit)"],
                        ["Reportaram", reported, "var(--v2-ok)"],
                      ] as Array<[string, number, string | undefined]>
                    ).map(([l, v, color]) => (
                      <div key={l}>
                        <b style={color ? { color } : undefined}>{v}</b>
                        <span>{l}</span>
                      </div>
                    ))}
                  </div>
                  <div
                    className="ph-stk"
                    title={`Clique ${pct(clicked, sent)}% · submissão ${pct(submitted, sent)}% · reporte ${pct(reported, sent)}%`}
                  >
                    <i
                      style={{ width: `${pct(submitted, sent)}%`, background: "var(--v2-crit)" }}
                    />
                    <i
                      style={{
                        width: `${pct(Math.max(0, clicked - submitted), sent)}%`,
                        background: "var(--v2-high)",
                      }}
                    />
                    <i
                      style={{
                        width: `${pct(Math.max(0, opened - clicked), sent)}%`,
                        background: "var(--v2-med)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
