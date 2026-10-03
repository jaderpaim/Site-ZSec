import { SyncActions } from "@/components/layout/SyncActions";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus } from "lucide-react";
import { GmudDashboardTab } from "./gmud/DashboardTab";
import { GmudOperationsTab } from "./gmud/OperationsTab";
import { GmudDetailsSheet } from "./gmud/GmudDetailsSheet";
import { NewGmudDialog } from "./gmud/NewGmudDialog";
import { usePermissions } from "@/lib/use-permissions";
import { listGmuds, getGmud } from "@/lib/gmud.functions";
import { GMUD_OPEN_NEW_EVENT } from "@/lib/gmud-events";
import type { GmudRow } from "./gmud/gmud-shared";

// ── CSS compartilhado do módulo (interface v2) ─────────────────────────────────
// As abas e o painel lateral usam estas classes (gm-*); a tag <style> é global.
const CSS = `
  .gm-root { font-family:var(--font-ui); color:var(--v2-fg); display:flex; flex-direction:column; gap:20px; font-size:14px; }
  .gm-root * { box-sizing:border-box; }
  @keyframes gm-spin { to{transform:rotate(360deg)} }
  .gm-spin { animation:gm-spin 0.75s linear infinite; }
  @media (prefers-reduced-motion: reduce) { .gm-spin { animation:none; } }
  .gm-root ::-webkit-scrollbar { width:6px; height:6px; }
  .gm-root ::-webkit-scrollbar-track { background:transparent; }
  .gm-root ::-webkit-scrollbar-thumb { background:var(--v2-line-strong); border-radius:3px; }
  .gm-root :focus-visible { outline:2px solid var(--v2-accent); outline-offset:2px; }
  .gm-root .mono { font-family:var(--font-data); font-size:12.5px; }
  .gm-root .dim { color:var(--v2-fg-3); }
  .gm-root .recharts-cartesian-axis-tick-value { fill:var(--v2-fg-3) !important; font-size:11px; font-family:var(--font-data); }

  /* ── Cabeçalho e barra de navegação ── */
  .gm-ph { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  .gm-ph-title { font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.2; margin:0; }
  .gm-ph-sub { margin:4px 0 0; font-size:13px; color:var(--v2-fg-3); }
  .gm-bar { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
  .gm-bar-left { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
  .gm-subnav { display:flex; gap:2px; padding:4px; background:var(--v2-surface-2); border:1px solid var(--v2-line); border-radius:8px; width:fit-content; max-width:100%; flex-wrap:wrap; }
  .gm-subnav button { display:inline-flex; align-items:center; gap:8px; border:1px solid transparent; background:transparent; padding:6px 14px; border-radius:6px; font-size:13px; font-weight:500; color:var(--v2-fg-3); cursor:pointer; font-family:inherit; }
  .gm-subnav button:hover { color:var(--v2-fg); background:var(--v2-hover); }
  .gm-subnav button[aria-selected="true"] { background:var(--v2-surface); color:var(--v2-fg); border-color:var(--v2-line); }
  .gm-subnav .n { font:500 12px var(--font-data); color:var(--v2-fg-3); }
  .gm-seg { display:inline-flex; padding:3px; gap:2px; background:var(--v2-bg); border:1px solid var(--v2-line); border-radius:8px; flex-wrap:wrap; }
  .gm-seg button { border:0; background:transparent; padding:4px 12px; border-radius:5px; font-size:13px; color:var(--v2-fg-2); cursor:pointer; font-family:inherit; }
  .gm-seg button[aria-pressed="true"] { background:var(--v2-surface-2); color:var(--v2-fg); font-weight:500; box-shadow:inset 0 0 0 1px var(--v2-line); }

  /* ── KPIs ── */
  .gm-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
  .gm-kpi { position:relative; text-align:left; border:0; background:transparent; padding:16px 18px 14px; display:grid; gap:2px; align-content:start; box-shadow:1px 0 0 var(--v2-line), 0 1px 0 var(--v2-line); color:inherit; font-family:inherit; min-width:0; }
  button.gm-kpi { cursor:pointer; }
  button.gm-kpi:hover { background:var(--v2-hover); }
  .gm-kpi-label { font-size:12.5px; color:var(--v2-fg-2); display:flex; align-items:center; gap:6px; }
  .gm-kpi-value { font-size:28px; font-weight:600; letter-spacing:-0.02em; line-height:1.25; font-variant-numeric:tabular-nums; }
  .gm-kpi-foot { font-size:12px; color:var(--v2-fg-3); }
  .gm-sw { width:8px; height:8px; border-radius:2px; display:inline-block; flex-shrink:0; }
  .gm-meter { height:6px; border-radius:99px; background:var(--v2-surface-2); overflow:hidden; margin:6px 0 2px; }
  .gm-meter i { display:block; height:100%; border-radius:99px; }

  /* ── Grade e cartões ── */
  .gm-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:20px; align-items:stretch; }
  .gm-span-2 { grid-column:span 2; }
  /* Quadro que acompanha a altura do vizinho e rola por dentro */
  .gm-fit { height:0; min-height:100%; display:flex; flex-direction:column; }
  .gm-fit .gm-scroll { flex:1; min-height:0; }
  .gm-feed-scroll { max-height:440px; overflow-y:auto; }
  @media (max-width: 1100px) { .gm-grid { grid-template-columns:minmax(0, 1fr); } .gm-span-2 { grid-column:auto; } .gm-fit { height:auto; min-height:0; max-height:420px; } }
  .gm-card { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; min-width:0; overflow:hidden; }
  .gm-card-hdr { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap; padding:14px 18px 4px; }
  .gm-card-title { font-size:14px; font-weight:600; margin:0; }
  .gm-card-sub { margin:2px 0 0; font-size:12.5px; color:var(--v2-fg-3); }
  .gm-card-body { padding:10px 18px 16px; }
  .gm-legend { display:flex; gap:14px; flex-wrap:wrap; font-size:12px; color:var(--v2-fg-2); }
  .gm-legend span { display:inline-flex; align-items:center; gap:6px; }
  .gm-empty { padding:28px 16px; text-align:center; color:var(--v2-fg-3); font-size:13px; }
  .gm-tip { display:grid; gap:2px; padding:8px 10px; background:var(--v2-surface-2); border:1px solid var(--v2-line-strong); border-radius:8px; font-size:12px; box-shadow:0 12px 32px rgba(0,0,0,0.3); }
  .gm-tip span { color:var(--v2-fg-2); font-family:var(--font-data); }

  /* ── Por tipo ── */
  .gm-types { display:grid; gap:4px; }
  .gm-types button { display:grid; grid-template-columns:minmax(0, 1fr) auto auto; gap:5px 10px; align-items:center; padding:8px; margin:0 -8px; border:0; border-radius:8px; background:transparent; text-align:left; color:var(--v2-fg); font-size:13px; cursor:pointer; font-family:inherit; }
  .gm-types button:hover { background:var(--v2-hover); }
  .gm-types .n { font:500 12.5px var(--font-data); }
  .gm-types .p { font:400 12px var(--font-data); color:var(--v2-fg-3); min-width:36px; text-align:right; }
  .gm-types small { grid-column:1 / -1; font-size:12px; color:var(--v2-fg-3); margin-top:-2px; }
  .gm-track { grid-column:1 / -1; height:8px; border-radius:99px; background:var(--v2-surface-2); overflow:hidden; }
  .gm-track i { display:block; height:100%; border-radius:99px; }
  .gm-tot { display:flex; justify-content:space-between; padding-top:12px; margin-top:8px; border-top:1px solid var(--v2-line); font-size:13px; color:var(--v2-fg-2); }
  .gm-tot b { font:600 13px var(--font-data); color:var(--v2-fg); }

  /* ── Precisa de atenção ── */
  .gm-feed { display:grid; }
  .gm-feed button { display:grid; grid-template-columns:28px minmax(0, 1fr) auto; gap:12px; align-items:center; padding:10px 8px; margin:0 -8px; border:0; border-radius:8px; background:transparent; text-align:left; color:var(--v2-fg); cursor:pointer; font-family:inherit; }
  .gm-feed button:hover { background:var(--v2-hover); }
  .gm-feed .ic { width:28px; height:28px; border-radius:8px; display:grid; place-items:center; --c:var(--v2-accent); background:color-mix(in oklch, var(--c) 14%, transparent); color:var(--c); }
  .gm-feed .ic.warn { --c:var(--v2-med); }
  .gm-feed b { display:block; font-weight:500; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .gm-feed small { display:block; font-size:12px; color:var(--v2-fg-3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .gm-feed .age { font:500 12px var(--font-data); color:var(--v2-fg-3); white-space:nowrap; }
  .gm-sub-h { font-size:12px; font-weight:500; color:var(--v2-fg-3); margin:14px 0 2px; }
  .gm-sub-h:first-child { margin-top:0; }
  .gm-ok-state { display:flex; flex-direction:column; align-items:center; gap:6px; padding:24px 16px; text-align:center; font-size:13px; color:var(--v2-fg-3); }
  .gm-ok-state b { color:var(--v2-fg); font-size:14px; }
  .gm-ok-state svg { color:var(--v2-ok); }

  /* ── Barra de ferramentas e tabelas ── */
  .gm-toolbar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:12px 18px; border-bottom:1px solid var(--v2-line); }
  .gm-select { height:32px; border:1px solid var(--v2-line); background:var(--v2-bg); color:var(--v2-fg); border-radius:8px; font:inherit; font-size:13px; padding:0 10px; cursor:pointer; }
  .gm-select:focus { outline:none; border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }
  .gm-search { display:inline-flex; align-items:center; gap:8px; height:32px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg-3); width:300px; max-width:100%; }
  .gm-search:focus-within { border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }
  .gm-search input { flex:1; min-width:0; border:0; outline:none; background:transparent; color:var(--v2-fg); font-size:13px; font-family:inherit; }
  .gm-search input::placeholder { color:var(--v2-fg-3); }
  .gm-scroll { overflow:auto; }
  .gm-table { width:100%; border-collapse:collapse; font-size:13px; }
  .gm-table thead { position:sticky; top:0; z-index:1; }
  .gm-table th { padding:9px 12px; font-size:12px; font-weight:500; color:var(--v2-fg-3); text-align:left; background:var(--v2-surface); border-bottom:1px solid var(--v2-line); white-space:nowrap; }
  .gm-table th.r, .gm-table td.r { text-align:right; }
  .gm-table td { padding:8px 12px; height:48px; border-bottom:1px solid var(--v2-line); vertical-align:middle; }
  .gm-table th:first-child, .gm-table td:first-child { padding-left:18px; }
  .gm-table th:last-child, .gm-table td:last-child { padding-right:18px; }
  .gm-table tbody tr:hover td { background:var(--v2-hover); }
  .gm-table tbody tr:last-child td { border-bottom:none; }
  .gm-table tbody tr.clickable { cursor:pointer; }
  .gm-title { display:block; font-weight:500; }
  .gm-desc { display:block; font-size:12px; color:var(--v2-fg-3); max-width:340px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .gm-id { font:400 12px var(--font-data); color:var(--v2-fg-3); }
  .gm-win { font:400 12.5px var(--font-data); color:var(--v2-fg-2); white-space:nowrap; }
  .gm-steps { display:inline-flex; align-items:center; gap:3px; }
  .gm-steps i { width:14px; height:6px; border-radius:99px; background:var(--v2-surface-2); box-shadow:inset 0 0 0 1px var(--v2-line); }
  .gm-steps i.ok { background:var(--v2-ok); box-shadow:none; }
  .gm-steps i.no { background:var(--v2-crit); box-shadow:none; }
  .gm-steps i.cur { background:var(--v2-accent); box-shadow:none; }
  .gm-steps i.skip { background:var(--v2-fg-3); opacity:.45; box-shadow:none; }
  .gm-steps span { font:400 12px var(--font-data); color:var(--v2-fg-3); margin-left:6px; white-space:nowrap; }
  .gm-icon-btn { display:grid; place-items:center; width:30px; height:30px; border-radius:8px; border:0; background:transparent; color:var(--v2-fg-2); cursor:pointer; }
  .gm-icon-btn:hover { color:var(--v2-crit); background:color-mix(in oklch, var(--v2-crit) 12%, transparent); }

  /* ── Pílulas ── */
  .gm-tag { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; white-space:nowrap; --c:var(--v2-fg-3); background:color-mix(in oklch, var(--c) 14%, transparent); color:color-mix(in oklch, var(--c) 72%, var(--v2-fg)); }
  .gm-tag svg { color:var(--c); }
  .gm-tag.accent { --c:var(--v2-accent); } .gm-tag.low { --c:var(--v2-low); } .gm-tag.ok { --c:var(--v2-ok); }
  .gm-tag.crit { --c:var(--v2-crit); } .gm-tag.med { --c:var(--v2-med); } .gm-tag.high { --c:var(--v2-high); }

  /* ── Botões ── */
  .gm-btn { display:inline-flex; align-items:center; gap:7px; height:32px; padding:0 12px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; font-family:var(--font-ui); white-space:nowrap; border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-fg); }
  .gm-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .gm-btn:hover:not(:disabled) { background:var(--v2-hover); border-color:var(--v2-line-strong); }
  .gm-btn.lg { height:34px; padding:0 14px; }
  .gm-btn.ghost { background:transparent; border-color:transparent; color:var(--v2-fg-2); }
  .gm-btn.primary { background:var(--v2-accent); border-color:var(--v2-accent); color:var(--v2-accent-ink); }
  .gm-btn.primary:hover:not(:disabled) { background:var(--v2-accent); filter:brightness(1.08); }
  .gm-btn.ok { background:var(--v2-ok); border-color:var(--v2-ok); color:#fff; }
  .gm-btn.ok:hover:not(:disabled) { background:var(--v2-ok); filter:brightness(1.08); }
  .gm-btn.danger { background:var(--v2-crit); border-color:var(--v2-crit); color:#fff; }
  .gm-btn.danger:hover:not(:disabled) { background:var(--v2-crit); filter:brightness(1.08); }
  .gm-btn.danger-text { background:transparent; border-color:transparent; color:var(--v2-crit); }
  .gm-btn.danger-text:hover:not(:disabled) { background:color-mix(in oklch, var(--v2-crit) 10%, transparent); border-color:transparent; }

  /* ── Painel lateral ── */
  .gm-act { display:grid; gap:10px; padding:12px 14px; border-radius:8px; --c:var(--v2-accent); border:1px solid color-mix(in oklch, var(--c) 40%, transparent); background:color-mix(in oklch, var(--c) 8%, transparent); }
  .gm-act.ok { --c:var(--v2-ok); } .gm-act.neutral { --c:var(--v2-fg-3); }
  .gm-act b { font-size:13.5px; }
  .gm-act p { margin:0; font-size:12.5px; color:var(--v2-fg-2); line-height:1.5; }
  .gm-act .row { display:flex; gap:8px; flex-wrap:wrap; }
  .gm-textarea { width:100%; min-height:72px; border:1px solid var(--v2-line); background:var(--v2-bg); color:var(--v2-fg); border-radius:8px; font:inherit; font-size:13px; padding:8px 10px; resize:vertical; outline:none; }
  .gm-textarea:focus { border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }
  .gm-txt { font-size:13px; line-height:1.55; color:var(--v2-fg-2); white-space:pre-wrap; padding:10px 12px; border-radius:8px; background:var(--v2-surface-2); border:1px solid var(--v2-line); overflow-wrap:anywhere; }
  .gm-chain { display:grid; }
  .gm-chain > div { display:grid; grid-template-columns:26px minmax(0, 1fr) auto; gap:2px 12px; padding:10px 0; position:relative; }
  .gm-chain > div:not(:last-child)::before { content:""; position:absolute; left:12px; top:36px; bottom:-6px; width:2px; background:var(--v2-line); }
  .gm-chain .n { width:26px; height:26px; border-radius:50%; display:grid; place-items:center; font:600 12px var(--font-data); background:var(--v2-surface-2); border:1px solid var(--v2-line); color:var(--v2-fg-2); grid-row:span 2; position:relative; z-index:1; }
  .gm-chain .n.ok { background:var(--v2-ok); border-color:var(--v2-ok); color:#fff; }
  .gm-chain .n.no { background:var(--v2-crit); border-color:var(--v2-crit); color:#fff; }
  .gm-chain .n.cur { background:var(--v2-accent); border-color:var(--v2-accent); color:var(--v2-accent-ink); }
  .gm-chain b { font-weight:500; font-size:13px; overflow-wrap:anywhere; }
  .gm-chain small { grid-column:2; font-size:12px; color:var(--v2-fg-3); overflow-wrap:anywhere; }
  .gm-chain .when { font:400 12px var(--font-data); color:var(--v2-fg-3); text-align:right; white-space:nowrap; }
  .gm-chain .obs { grid-column:2 / -1; font-size:12.5px; color:var(--v2-fg-2); margin-top:4px; }
  .gm-foot { display:flex; align-items:center; gap:8px; flex-wrap:wrap; width:100%; }
  .gm-foot .lbl { font-size:12.5px; color:var(--v2-fg-3); }
`;

type Tab = "geral" | "lista";
const PERIODS = [7, 30, 90, 180] as const;

export function GmudDashboard() {
  // ── logic UNCHANGED ────────────────────────────────────────────────────────
  const { can, isAdmin, isModuleAdmin } = usePermissions();
  const canViewDashboard = isAdmin || isModuleAdmin("gmud") || can("gmud", "view");

  const [tab, setTab] = React.useState<Tab>(canViewDashboard ? "geral" : "lista");
  React.useEffect(() => {
    if (!canViewDashboard && tab === "geral") setTab("lista");
  }, [canViewDashboard, tab]);

  // Período compartilhado pelas duas abas
  const [days, setDays] = React.useState<number>(30);
  // Filtros da lista (a Visão geral também navega para a lista já filtrada)
  const [statusF, setStatusF] = React.useState<string>("all");
  const [tipoF, setTipoF] = React.useState<string>("all");
  const [search, setSearch] = React.useState("");

  const [openNew, setOpenNew] = React.useState(false);
  const [selected, setSelected] = React.useState<GmudRow | null>(null);
  const [askDelete, setAskDelete] = React.useState(false);

  // Atalho "Nova GMUD" vindo de outras telas
  React.useEffect(() => {
    const h = () => setOpenNew(true);
    window.addEventListener(GMUD_OPEN_NEW_EVENT, h);
    return () => window.removeEventListener(GMUD_OPEN_NEW_EVENT, h);
  }, []);

  // Lista do período (aba Mudanças)
  const list = useServerFn(listGmuds);
  const fetchOne = useServerFn(getGmud);
  const from = React.useMemo(() => new Date(Date.now() - days * 86400000).toISOString(), [days]);
  const listQ = useQuery({
    queryKey: ["gmuds", "period", days],
    queryFn: () => list({ data: { status: "all", tipo: "all", from } }),
    refetchInterval: 30_000,
  });
  const rows = React.useMemo(() => (listQ.data ?? []) as GmudRow[], [listQ.data]);

  // O painel acompanha os dados novos depois de aprovar/rejeitar/mudar status
  React.useEffect(() => {
    if (!selected) return;
    const fresh = rows.find((g) => g.id === selected.id);
    if (fresh && fresh !== selected) setSelected(fresh);
  }, [rows, selected]);

  // Link direto ?gmud=<id> (e-mails de aprovação): abre o painel mesmo se a
  // GMUD estiver fora do período escolhido.
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const id = new URLSearchParams(window.location.search).get("gmud");
    if (!id || !listQ.data) return;
    const clearParam = () => {
      const url = new URL(window.location.href);
      url.searchParams.delete("gmud");
      window.history.replaceState({}, "", url.toString());
    };
    const target = rows.find((g) => g.id === id);
    if (target) {
      setTab("lista");
      setSelected(target);
      clearParam();
      return;
    }
    fetchOne({ data: { id } })
      .then((g) => {
        if (g) {
          setTab("lista");
          setSelected(g);
        }
      })
      .catch(() => {})
      .finally(clearParam);
  }, [listQ.data]);

  const openGmud = (g: GmudRow, del = false) => {
    setAskDelete(del);
    setSelected(g);
  };
  const goToList = (f: { status?: string; tipo?: string }) => {
    setStatusF(f.status ?? "all");
    setTipoF(f.tipo ?? "all");
    setSearch("");
    setTab("lista");
  };

  return (
    <div className="gm-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Cabeçalho ────────────────────────────────────────────────────── */}
      <div className="gm-ph">
        <div>
          <h1 className="gm-ph-title">Gestão de mudanças</h1>
          <p className="gm-ph-sub">
            Solicitação, aprovação em cadeia e resultado das mudanças (GMUD)
          </p>
        </div>
        <SyncActions moduleSlug="gmud" jobs={["gmud-escalate-inactive"]} />
      </div>

      {/* ── Abas, nova GMUD e período ──────────────────────────────────────── */}
      <div className="gm-bar">
        <div className="gm-bar-left">
          <div className="gm-subnav" role="tablist" aria-label="Seções da GMUD">
            {canViewDashboard && (
              <button
                type="button"
                role="tab"
                aria-selected={tab === "geral"}
                onClick={() => setTab("geral")}
              >
                Visão geral
              </button>
            )}
            <button
              type="button"
              role="tab"
              aria-selected={tab === "lista"}
              onClick={() => setTab("lista")}
            >
              Mudanças {listQ.data && <span className="n">{rows.length}</span>}
            </button>
          </div>
          <button className="gm-btn primary lg" onClick={() => setOpenNew(true)}>
            <Plus size={14} /> Nova GMUD
          </button>
        </div>
        <div className="gm-seg" role="group" aria-label="Período">
          {PERIODS.map((d) => (
            <button key={d} type="button" aria-pressed={days === d} onClick={() => setDays(d)}>
              {d} dias
            </button>
          ))}
        </div>
      </div>

      {/* ── Conteúdo ───────────────────────────────────────────────────────── */}
      {canViewDashboard && tab === "geral" && (
        <GmudDashboardTab days={days} onOpen={openGmud} onGoToList={goToList} />
      )}
      {tab === "lista" && (
        <GmudOperationsTab
          rows={rows}
          isLoading={listQ.isLoading}
          status={statusF}
          onStatus={setStatusF}
          tipo={tipoF}
          onTipo={setTipoF}
          search={search}
          onSearch={setSearch}
          onOpen={openGmud}
        />
      )}

      <NewGmudDialog open={openNew} onOpenChange={setOpenNew} />
      <GmudDetailsSheet
        gmud={selected}
        open={!!selected}
        askDelete={askDelete}
        onOpenChange={(v) => {
          if (!v) {
            setSelected(null);
            setAskDelete(false);
          }
        }}
      />
    </div>
  );
}
