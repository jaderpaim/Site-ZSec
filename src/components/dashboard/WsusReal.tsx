import { ModuleLoading } from "@/components/layout/ModuleLoading";
import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link } from "@tanstack/react-router";
import { getWsusOverview, deleteWsusServers, type WsusDetailRow } from "@/lib/wsus.functions";
import { usePermissions } from "@/lib/use-permissions";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Loader2, Search, Server, Trash2, Upload, X } from "lucide-react";
import { APP_NAME } from "@/lib/brand";

const META = 85;
type KpiFilter = "all" | "ok" | "failures" | "pending" | "alerts";
const KPI_LABEL: Record<Exclude<KpiFilter, "all">, string> = {
  ok: "Com patches aplicados",
  pending: "Com updates pendentes",
  failures: "Com falhas",
  alerts: "Com alertas",
};

// Mesma regra do card "Servidores com patches aplicados" de antes
const isPatched = (r: WsusDetailRow) => r.installed_or_na > 0 && r.failed === 0 && !r.has_alert;

// Situação resumida por servidor (pior estado primeiro)
function situation(r: WsusDetailRow): { label: string; color: string } {
  if (r.failed > 0) return { label: "Falhou", color: "var(--v2-crit)" };
  if (r.has_alert) return { label: "Alerta", color: "var(--v2-high)" };
  if (r.needed > 0) return { label: "Pendente", color: "var(--v2-med)" };
  return { label: "Em dia", color: "var(--v2-ok)" };
}

const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "—");

// ── CSS (interface v2) ─────────────────────────────────────────────────────────
const CSS = `
  .ws-root { font-family:var(--font-ui); color:var(--v2-fg); display:flex; flex-direction:column; gap:20px; font-size:14px; }
  .ws-root * { box-sizing:border-box; }
  .ws-root ::-webkit-scrollbar { width:6px; height:6px; }
  .ws-root ::-webkit-scrollbar-thumb { background:var(--v2-line-strong); border-radius:3px; }
  .ws-root :focus-visible { outline:2px solid var(--v2-accent); outline-offset:2px; }
  .ws-mono { font-family:var(--font-data); font-size:12.5px; }
  .ws-dim { color:var(--v2-fg-3); }

  .ws-ph { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  .ws-ph-title { font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.2; margin:0; }
  .ws-ph-sub { margin:4px 0 0; font-size:13px; color:var(--v2-fg-3); display:flex; gap:6px; flex-wrap:wrap; }
  .ws-btn { display:inline-flex; align-items:center; gap:7px; height:34px; padding:0 14px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; font-family:var(--font-ui); white-space:nowrap; border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-fg); text-decoration:none; }
  .ws-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .ws-btn:hover:not(:disabled) { background:var(--v2-hover); }
  .ws-btn.sm { height:30px; padding:0 10px; }
  .ws-btn.ghost { background:transparent; border-color:transparent; color:var(--v2-fg-2); }
  .ws-btn.danger { background:var(--v2-crit); border-color:var(--v2-crit); color:#fff; }
  .ws-btn.danger-ghost { color:var(--v2-crit); }
  .ws-link { border:0; background:none; color:var(--v2-accent); font:500 12.5px var(--font-ui); cursor:pointer; padding:0; }
  .ws-state { display:flex; flex-direction:column; align-items:center; gap:10px; padding:48px 24px; text-align:center; background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; }

  .ws-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
  .ws-kpi { position:relative; text-align:left; border:0; background:transparent; padding:16px 18px 14px; display:grid; gap:2px; align-content:start; box-shadow:1px 0 0 var(--v2-line), 0 1px 0 var(--v2-line); color:inherit; font-family:inherit; min-width:0; cursor:pointer; }
  .ws-kpi:hover, .ws-kpi[aria-pressed="true"] { background:var(--v2-hover); }
  .ws-kpi[aria-pressed="true"]::after { content:""; position:absolute; left:0; right:0; bottom:0; height:2px; background:var(--v2-accent); }
  .ws-kpi-label { font-size:12.5px; color:var(--v2-fg-2); display:flex; align-items:center; gap:6px; }
  .ws-kpi-value { font-size:28px; font-weight:600; letter-spacing:-0.02em; line-height:1.25; font-variant-numeric:tabular-nums; }
  .ws-kpi-value small { font-size:15px; font-weight:500; color:var(--v2-fg-3); margin-left:4px; }
  .ws-kpi-foot { font-size:12px; color:var(--v2-fg-3); }
  .ws-sw { width:8px; height:8px; border-radius:2px; display:inline-block; flex-shrink:0; }
  .ws-meter { height:6px; border-radius:99px; background:var(--v2-surface-2); overflow:hidden; margin:8px 0 4px; }
  .ws-meter i { display:block; height:100%; border-radius:99px; }

  .ws-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:20px; align-items:stretch; }
  .ws-span-2 { grid-column:span 2; }
  @media (max-width: 1100px) { .ws-grid { grid-template-columns:minmax(0, 1fr); } .ws-span-2 { grid-column:auto; } }
  .ws-panel { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; min-width:0; }
  .ws-panel-hdr { padding:14px 18px 4px; }
  .ws-panel-title { font-size:14px; font-weight:600; margin:0; }
  .ws-panel-sub { margin:2px 0 0; font-size:12.5px; color:var(--v2-fg-3); }
  .ws-panel-body { padding:12px 18px 16px; }
  .ws-empty { padding:32px 16px; text-align:center; color:var(--v2-fg-3); font-size:13px; }

  .ws-cov-num { font-size:40px; font-weight:600; letter-spacing:-0.03em; line-height:1.1; font-variant-numeric:tabular-nums; }
  .ws-pill { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; white-space:nowrap; background:color-mix(in oklch, var(--c) 14%, transparent); color:color-mix(in oklch, var(--c) 72%, var(--v2-fg)); }
  .ws-pill::before { content:""; width:6px; height:6px; border-radius:50%; background:var(--c); }
  .ws-cov-head { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .ws-cov-desc { font-size:13px; color:var(--v2-fg-2); margin:6px 0 16px; }
  .ws-scale { position:relative; height:14px; border-radius:4px; background:var(--v2-surface-2); }
  .ws-scale i { display:block; height:100%; border-radius:4px; }
  .ws-scale .mk { position:absolute; top:-4px; bottom:-4px; border-left:1.5px dashed var(--v2-fg-3); }
  .ws-scale-l { position:relative; height:18px; margin-top:6px; font:400 11.5px var(--font-data); color:var(--v2-fg-3); }
  .ws-scale-l span { position:absolute; transform:translateX(-50%); white-space:nowrap; }
  .ws-scale-l span:first-child { transform:none; }
  .ws-scale-l span:last-child { transform:translateX(-100%); }
  .ws-dl { display:grid; grid-template-columns:1fr auto; gap:8px 12px; margin:16px 0 0; padding-top:14px; border-top:1px solid var(--v2-line); font-size:13px; }
  .ws-dl dt { color:var(--v2-fg-3); }
  .ws-dl dd { margin:0; font:500 13px var(--font-data); text-align:right; }
  .ws-h4 { margin:18px 0 8px; font-size:12px; font-weight:500; color:var(--v2-fg-3); }
  .ws-stack { display:flex; height:10px; gap:2px; border-radius:99px; overflow:hidden; background:var(--v2-surface-2); }
  .ws-stack i { display:block; height:100%; }
  .ws-legend { display:flex; flex-wrap:wrap; gap:6px 14px; margin-top:10px; font-size:12.5px; color:var(--v2-fg-2); }
  .ws-legend span { display:inline-flex; align-items:center; gap:6px; }
  .ws-legend b { font:500 12.5px var(--font-data); }

  .ws-hb { display:grid; gap:6px; }
  .ws-hb > div { display:grid; grid-template-columns:minmax(0, 170px) minmax(0, 1fr) 40px; gap:12px; align-items:center; font-size:12.5px; padding:2px 6px; margin:0 -6px; border-radius:5px; }
  .ws-hb > div:hover { background:var(--v2-hover); }
  .ws-hb .nm { font-family:var(--font-data); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .ws-hb .tr { height:10px; border-radius:3px; background:var(--v2-surface-2); overflow:hidden; }
  .ws-hb .tr i { display:block; height:100%; border-radius:3px; }
  .ws-hb .v { font:500 12.5px var(--font-data); text-align:right; }

  .ws-tbar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding:12px 18px; border-bottom:1px solid var(--v2-line); }
  .ws-tbar > b { font-size:14px; font-weight:600; margin-right:4px; }
  .ws-tbar > b span { font-weight:400; font-size:13px; color:var(--v2-fg-3); }
  .ws-chip { display:inline-flex; align-items:center; gap:6px; height:26px; padding:0 4px 0 9px; border-radius:5px; font-size:12.5px; background:color-mix(in oklch, var(--v2-accent) 12%, transparent); color:var(--v2-fg); }
  .ws-chip button { border:0; background:none; color:var(--v2-fg-3); cursor:pointer; display:grid; place-items:center; width:20px; height:20px; border-radius:4px; }
  .ws-chip button:hover { background:var(--v2-hover); color:var(--v2-fg); }
  .ws-search { display:inline-flex; align-items:center; gap:8px; height:32px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg-3); width:240px; max-width:100%; margin-left:auto; }
  .ws-search input { flex:1; min-width:0; border:0; outline:none; background:transparent; color:var(--v2-fg); font-size:13px; font-family:inherit; }
  .ws-selbar { display:flex; gap:12px; align-items:center; flex-wrap:wrap; padding:10px 18px; border-bottom:1px solid var(--v2-line); background:color-mix(in oklch, var(--v2-accent) 10%, transparent); font-size:13px; }
  .ws-scroll { overflow:auto; max-height:560px; }
  .ws-table { width:100%; border-collapse:collapse; font-size:13px; }
  .ws-table thead { position:sticky; top:0; z-index:1; }
  .ws-table th { padding:9px 12px; font-size:12px; font-weight:500; color:var(--v2-fg-3); text-align:left; background:var(--v2-surface); border-bottom:1px solid var(--v2-line); white-space:nowrap; }
  .ws-table th.r, .ws-table td.r { text-align:right; }
  .ws-table td { padding:8px 12px; height:46px; border-bottom:1px solid var(--v2-line); vertical-align:middle; }
  .ws-table th:first-child, .ws-table td:first-child { padding-left:18px; }
  .ws-table th:last-child, .ws-table td:last-child { padding-right:18px; }
  .ws-table tbody tr:hover td { background:var(--v2-hover); }
  .ws-table tbody tr.sel td { background:color-mix(in oklch, var(--v2-accent) 8%, transparent); }
  .ws-table tbody tr:last-child td { border-bottom:none; }
  .ws-num { font:500 12.5px var(--font-data); }
  .ws-num.z { color:var(--v2-fg-3); font-weight:400; }
  .ws-num.ok { color:color-mix(in oklch, var(--v2-ok) 80%, var(--v2-fg)); }
  .ws-num.warn { color:color-mix(in oklch, var(--v2-med) 80%, var(--v2-fg)); }
  .ws-num.bad { color:var(--v2-crit); font-weight:600; }
`;

export function WsusDashboard() {
  // ── back-end UNCHANGED ─────────────────────────────────────────────────────
  const fetchOverview = useServerFn(getWsusOverview);
  const deleteServers = useServerFn(deleteWsusServers);
  const qc = useQueryClient();
  const { isAdmin } = usePermissions();
  const { data, isLoading } = useQuery({
    queryKey: ["wsus-overview"],
    queryFn: () => fetchOverview(),
  });
  const [search, setSearch] = React.useState("");
  const [kpiFilter, setKpiFilter] = React.useState<KpiFilter>("all");
  const [selected, setSelected] = React.useState<Set<string>>(new Set());
  const [deleting, setDeleting] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  // Cada KPI vira um filtro do restante do módulo (tabela + Top 15).
  const matchesKpi = React.useCallback(
    (r: WsusDetailRow) =>
      kpiFilter === "failures"
        ? r.failed > 0
        : kpiFilter === "pending"
          ? r.needed > 0
          : kpiFilter === "alerts"
            ? r.has_alert === true
            : kpiFilter === "ok"
              ? isPatched(r)
              : true,
    [kpiFilter],
  );
  const details = React.useMemo(() => data?.details ?? [], [data]);
  const filteredDetails = details.filter((r) => {
    if (!matchesKpi(r)) return false;
    return search ? r.computer_name.toLowerCase().includes(search.toLowerCase()) : true;
  });

  const toggleOne = (name: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };
  const allSelected =
    filteredDetails.length > 0 && filteredDetails.every((r) => selected.has(r.computer_name));
  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allSelected) filteredDetails.forEach((r) => next.delete(r.computer_name));
      else filteredDetails.forEach((r) => next.add(r.computer_name));
      return next;
    });
  };
  const handleDelete = async () => {
    const names = Array.from(selected);
    if (!names.length) return;
    setDeleting(true);
    try {
      await deleteServers({ data: { computerNames: names } });
      toast.success(`${names.length} servidor(es) excluído(s)`);
      setSelected(new Set());
      setConfirmOpen(false);
      qc.invalidateQueries({ queryKey: ["wsus-overview"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Falha ao excluir");
    } finally {
      setDeleting(false);
    }
  };
  // ──────────────────────────────────────────────────────────────────────────

  if (isLoading) return <ModuleLoading />;
  if (!data || data.totalServers === 0)
    return (
      <div className="ws-root">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="ws-state">
          <Server size={22} color="var(--v2-accent)" />
          <span style={{ fontSize: 15, fontWeight: 600 }}>Nenhum dado do WSUS importado</span>
          <span className="ws-dim" style={{ fontSize: 13, maxWidth: 460, lineHeight: 1.6 }}>
            Em <b style={{ color: "var(--v2-fg-2)" }}>Importar dados</b>, módulo{" "}
            <b style={{ color: "var(--v2-fg-2)" }}>WSUS</b>, envie um arquivo (CSV, XLSX ou JSON)
            com as colunas: Computer Name, Needed, Installed/Not Applicable, Failed, No Status,
            Data.
          </span>
          <Link to="/app/$module" params={{ module: "upload" }} className="ws-btn">
            <Upload size={14} /> Importar dados
          </Link>
        </div>
      </div>
    );

  const total = data.totalServers;
  const pct = data.coveragePct;
  const patchedOk = details.filter(isPatched).length;
  const pendingServers = details.filter((r) => r.needed > 0).length;
  const totalNeeded = details.reduce((acc, r) => acc + (r.needed ?? 0), 0);
  const lastReport = details.reduce<string | null>(
    (m, r) => (r.last_report_at && (!m || r.last_report_at > m) ? r.last_report_at : m),
    null,
  );
  const covColor = pct < 50 ? "var(--v2-crit)" : pct < META ? "var(--v2-med)" : "var(--v2-ok)";
  const covStatus = pct < 50 ? "Crítico" : pct < META ? "Abaixo da meta" : "Meta atingida";
  const missing = Math.max(0, Math.ceil((data.cmdbActiveServers * META) / 100) - data.coveredCount);
  const outOfCmdb = details.filter((r) => !r.matched_in_cmdb).length;
  const bySituation = (["Em dia", "Pendente", "Alerta", "Falhou"] as const).map((label) => {
    const rows = details.filter((r) => situation(r).label === label);
    return { label, n: rows.length, color: rows[0] ? situation(rows[0]).color : "var(--v2-fg-3)" };
  });
  const SIT_COLOR: Record<string, string> = {
    "Em dia": "var(--v2-ok)",
    Pendente: "var(--v2-med)",
    Alerta: "var(--v2-high)",
    Falhou: "var(--v2-crit)",
  };

  // Top 15 reage ao KPI selecionado (quando "all", usa o pré-computado do back-end)
  const top15 =
    kpiFilter === "all"
      ? data.top15
      : [...details]
          .filter(matchesKpi)
          .sort((a, b) => b.not_installed - a.not_installed)
          .slice(0, 15)
          .map((r) => ({ computer_name: r.computer_name, not_installed: r.not_installed }));
  const topRows = top15.filter((t) => t.not_installed > 0);
  const topMax = Math.max(1, ...topRows.map((t) => t.not_installed));

  const Kpi = ({
    k,
    label,
    value,
    foot,
    sw,
    meter,
  }: {
    k: KpiFilter;
    label: string;
    value: React.ReactNode;
    foot: string;
    sw?: string;
    meter?: number;
  }) => (
    <button
      type="button"
      className="ws-kpi"
      aria-pressed={kpiFilter === k}
      onClick={() => setKpiFilter((cur) => (cur === k || k === "all" ? "all" : k))}
    >
      <span className="ws-kpi-label">
        {sw && <span className="ws-sw" style={{ background: sw }} />}
        {label}
      </span>
      <span className="ws-kpi-value">{value}</span>
      {meter !== undefined && (
        <div className="ws-meter">
          <i style={{ width: `${meter}%`, background: sw }} />
        </div>
      )}
      <span className="ws-kpi-foot">{foot}</span>
    </button>
  );

  return (
    <div className="ws-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Cabeçalho ──────────────────────────────────────────────────── */}
      <div className="ws-ph">
        <div>
          <h1 className="ws-ph-title">WSUS</h1>
          <p className="ws-ph-sub">
            <span>Atualizações dos servidores Windows</span>
            {lastReport && (
              <>
                <span>·</span>
                <span>última coleta {fmtDate(lastReport)} · importado por planilha</span>
              </>
            )}
          </p>
        </div>
        <Link to="/app/$module" params={{ module: "upload" }} className="ws-btn">
          <Upload size={14} /> Importar dados
        </Link>
      </div>

      {/* ── KPIs ───────────────────────────────────────────────────────── */}
      <div className="ws-kpis">
        <Kpi k="all" label="Servidores no WSUS" value={total} foot="reportando ao console" />
        <Kpi
          k="ok"
          label="Com patches aplicados"
          value={
            <>
              {total ? Math.round((patchedOk / total) * 100) : 0}%<small>{patchedOk}</small>
            </>
          }
          foot="sem falhas e sem alertas"
          sw="var(--v2-ok)"
          meter={total ? (patchedOk / total) * 100 : 0}
        />
        <Kpi
          k="pending"
          label="Com updates pendentes"
          value={pendingServers}
          foot={`${totalNeeded.toLocaleString("pt-BR")} atualizações faltando`}
          sw="var(--v2-med)"
        />
        <Kpi
          k="failures"
          label="Com falhas"
          value={data.serversWithFailures}
          foot="instalação falhou em algum update"
          sw="var(--v2-crit)"
        />
        <Kpi
          k="alerts"
          label="Com alertas"
          value={data.serversWithAlerts}
          foot="sinalizados na coleta"
          sw="var(--v2-high)"
        />
      </div>

      <div className="ws-grid">
        {/* ── Cobertura ── */}
        <div className="ws-panel">
          <div className="ws-panel-hdr">
            <h2 className="ws-panel-title">Cobertura do WSUS</h2>
            <p className="ws-panel-sub">Servidores Windows do CMDB que reportam ao WSUS</p>
          </div>
          <div className="ws-panel-body">
            <div className="ws-cov-head">
              <span className="ws-cov-num">{pct.toFixed(1).replace(".", ",")}%</span>
              <span className="ws-pill" style={{ "--c": covColor } as React.CSSProperties}>
                {covStatus}
              </span>
            </div>
            <p className="ws-cov-desc">
              {data.coveredCount} de {data.cmdbActiveServers} servidores Windows do CMDB reportam ao
              WSUS
            </p>
            <div className="ws-scale">
              <i style={{ width: `${Math.min(100, pct)}%`, background: covColor }} />
              <span className="mk" style={{ left: "50%" }} title="Abaixo de 50%: crítico" />
              <span
                className="mk"
                style={{ left: `${META}%`, borderLeftColor: "var(--v2-ok)" }}
                title={`Meta: ${META}%`}
              />
            </div>
            <div className="ws-scale-l">
              <span style={{ left: 0 }}>0%</span>
              <span style={{ left: "50%" }}>50%</span>
              <span style={{ left: `${META}%`, color: "var(--v2-ok)" }}>meta {META}%</span>
              <span style={{ left: "100%" }}>100%</span>
            </div>
            <dl className="ws-dl">
              <dt>Faltam para a meta</dt>
              <dd>{missing ? `${missing} servidores` : "—"}</dd>
              <dt>No WSUS, fora do CMDB</dt>
              <dd>{outOfCmdb}</dd>
            </dl>
            <h4 className="ws-h4">Situação dos servidores no WSUS</h4>
            <div className="ws-stack">
              {bySituation.map((g) => (
                <i
                  key={g.label}
                  title={`${g.label}: ${g.n} servidores`}
                  style={{
                    width: `${total ? (g.n / total) * 100 : 0}%`,
                    background: SIT_COLOR[g.label],
                  }}
                />
              ))}
            </div>
            <div className="ws-legend">
              {bySituation.map((g) => (
                <span key={g.label}>
                  <span className="ws-sw" style={{ background: SIT_COLOR[g.label] }} />
                  {g.label} <b>{g.n}</b>
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* ── Top 15 ── */}
        <div className="ws-panel ws-span-2">
          <div className="ws-panel-hdr">
            <h2 className="ws-panel-title">Top 15: updates não instalados</h2>
            <p className="ws-panel-sub">
              {kpiFilter === "all"
                ? "Servidores com mais atualizações faltando"
                : `Filtrado: ${KPI_LABEL[kpiFilter].toLowerCase()}`}
            </p>
          </div>
          <div className="ws-panel-body">
            {topRows.length === 0 ? (
              <div className="ws-empty">Nenhum servidor com updates faltando nesse filtro.</div>
            ) : (
              <div className="ws-hb">
                {topRows.map((t) => {
                  const ratio = t.not_installed / topMax;
                  return (
                    <div
                      key={t.computer_name}
                      title={`${t.computer_name}: ${t.not_installed} updates não instalados`}
                    >
                      <span className="nm">{t.computer_name}</span>
                      <span className="tr">
                        <i
                          style={{
                            width: `${ratio * 100}%`,
                            background:
                              ratio >= 0.66
                                ? "var(--v2-crit)"
                                : ratio >= 0.33
                                  ? "var(--v2-high)"
                                  : "var(--v2-med)",
                          }}
                        />
                      </span>
                      <span className="v">{t.not_installed}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Servidores ─────────────────────────────────────────────────── */}
      <div className="ws-panel">
        <div className="ws-tbar">
          <b>
            Servidores{" "}
            <span>
              ({filteredDetails.length === total ? total : `${filteredDetails.length} de ${total}`})
            </span>
          </b>
          {kpiFilter !== "all" && (
            <span className="ws-chip">
              {KPI_LABEL[kpiFilter]}
              <button onClick={() => setKpiFilter("all")} aria-label="Limpar filtro">
                <X size={12} />
              </button>
            </span>
          )}
          <label className="ws-search">
            <Search size={14} />
            <input
              placeholder="Buscar servidor"
              aria-label="Buscar servidor"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
        </div>
        {isAdmin && selected.size > 0 && (
          <div className="ws-selbar">
            <b style={{ fontWeight: 600 }}>
              {selected.size} selecionado{selected.size > 1 ? "s" : ""}
            </b>
            <button className="ws-btn sm danger-ghost" onClick={() => setConfirmOpen(true)}>
              <Trash2 size={13} /> Excluir do WSUS
            </button>
            <button className="ws-link" onClick={() => setSelected(new Set())}>
              Limpar seleção
            </button>
          </div>
        )}

        <div className="ws-scroll">
          <table className="ws-table">
            <thead>
              <tr>
                {isAdmin && (
                  <th style={{ width: 36 }}>
                    <Checkbox
                      checked={allSelected}
                      onCheckedChange={toggleAll}
                      aria-label="Selecionar todos"
                    />
                  </th>
                )}
                <th>Servidor</th>
                <th>Situação</th>
                <th className="r">Aplicados</th>
                <th className="r">Pendentes</th>
                <th className="r">Falharam</th>
                <th className="r" title="Updates sem status reportado pelo cliente">
                  Sem status
                </th>
                <th>Última coleta</th>
                <th>CMDB</th>
              </tr>
            </thead>
            <tbody>
              {filteredDetails.map((r) => {
                const st = situation(r);
                const sel = selected.has(r.computer_name);
                return (
                  <tr key={r.computer_name} className={sel ? "sel" : undefined}>
                    {isAdmin && (
                      <td>
                        <Checkbox
                          checked={sel}
                          onCheckedChange={() => toggleOne(r.computer_name)}
                          aria-label={`Selecionar ${r.computer_name}`}
                        />
                      </td>
                    )}
                    <td className="ws-mono" style={{ fontWeight: 500 }}>
                      {r.computer_name}
                    </td>
                    <td>
                      <span className="ws-pill" style={{ "--c": st.color } as React.CSSProperties}>
                        {st.label}
                      </span>
                    </td>
                    <td className={`r ws-num ${r.installed_or_na > 0 ? "ok" : "z"}`}>
                      {r.installed_or_na}
                    </td>
                    <td className={`r ws-num ${r.needed > 0 ? "warn" : "z"}`}>{r.needed}</td>
                    <td className={`r ws-num ${r.failed > 0 ? "bad" : "z"}`}>{r.failed}</td>
                    <td className="r ws-num z">{r.no_status}</td>
                    <td className="ws-mono ws-dim">{fmtDate(r.last_report_at)}</td>
                    <td>
                      <span
                        className="ws-pill"
                        style={
                          {
                            "--c": r.matched_in_cmdb ? "var(--v2-ok)" : "var(--v2-fg-3)",
                          } as React.CSSProperties
                        }
                      >
                        {r.matched_in_cmdb ? "No CMDB" : "Fora do CMDB"}
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filteredDetails.length === 0 && (
                <tr>
                  <td colSpan={isAdmin ? 9 : 8} className="ws-empty">
                    Nenhum servidor encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={(o) => !deleting && setConfirmOpen(o)}>
        <DialogContent
          className="font-ui sm:max-w-md"
          style={{
            background: "var(--v2-surface)",
            border: "1px solid var(--v2-line-strong)",
            color: "var(--v2-fg)",
          }}
        >
          <DialogHeader>
            <DialogTitle style={{ fontSize: 16, fontWeight: 600 }}>
              Excluir servidores do WSUS?
            </DialogTitle>
          </DialogHeader>
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--v2-fg-2)", lineHeight: 1.55 }}>
            {selected.size} servidor{selected.size > 1 ? "es serão removidos" : " será removido"} do
            WSUS no {APP_NAME}. A próxima importação pode trazê-los de volta. Não dá para desfazer.
          </p>
          <DialogFooter style={{ gap: 8 }}>
            <button
              className="ws-btn ghost"
              onClick={() => setConfirmOpen(false)}
              disabled={deleting}
            >
              Cancelar
            </button>
            <button className="ws-btn danger" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 size={13} className="animate-spin" />} Excluir
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
