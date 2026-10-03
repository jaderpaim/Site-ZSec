import { SyncActions } from "@/components/layout/SyncActions";
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Bell,
  Loader2,
  AlertTriangle,
  Clock,
  CheckCircle2,
  X,
} from "lucide-react";
import { usePermissions } from "@/lib/use-permissions";
import {
  listFornecedores,
  deleteFornecedor,
  updateFornecedorAlertDays,
  triggerFornecedorAlertCheck,
} from "@/lib/fornecedores.functions";
import { DetailList, DetailSection, DetailSheet } from "@/components/layout/DetailSheet";
import { FornecedorDialog, type FornecedorRow } from "./fornecedores/FornecedorDialog";

// ── CSS (interface v2) ─────────────────────────────────────────────────────────
const CSS = `
  .forn-root { font-family:var(--font-ui); color:var(--v2-fg); display:flex; flex-direction:column; gap:20px; font-size:14px; }
  .forn-root * { box-sizing:border-box; }
  @keyframes forn-spin { to{transform:rotate(360deg)} }
  .forn-spin { animation:forn-spin 0.75s linear infinite; }
  @media (prefers-reduced-motion: reduce) { .forn-spin { animation:none; } }
  .forn-root ::-webkit-scrollbar { width:6px; height:6px; }
  .forn-root ::-webkit-scrollbar-track { background:transparent; }
  .forn-root ::-webkit-scrollbar-thumb { background:var(--v2-line-strong); border-radius:3px; }
  .forn-root :focus-visible { outline:2px solid var(--v2-accent); outline-offset:2px; }
  .forn-root .mono { font-family:var(--font-data); font-size:12.5px; }
  .forn-root .dim { color:var(--v2-fg-3); }

  /* ── Cabeçalho ── */
  .forn-ph { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  .forn-ph-title { font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.2; margin:0; }
  .forn-ph-sub { margin:4px 0 0; font-size:13px; color:var(--v2-fg-3); }

  /* ── KPIs ── */
  .forn-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
  .forn-kpi { position:relative; text-align:left; border:0; background:transparent; padding:16px 18px 14px; display:grid; gap:2px; align-content:start; box-shadow:1px 0 0 var(--v2-line), 0 1px 0 var(--v2-line); cursor:pointer; color:inherit; font-family:inherit; }
  .forn-kpi:hover { background:var(--v2-hover); }
  .forn-kpi[aria-pressed="true"] { background:color-mix(in oklch, var(--v2-accent) 14%, transparent); }
  .forn-kpi[aria-pressed="true"]::after { content:""; position:absolute; left:0; right:0; bottom:0; height:2px; background:var(--v2-accent); }
  .forn-kpi-label { font-size:12.5px; color:var(--v2-fg-2); display:flex; align-items:center; gap:6px; }
  .forn-kpi-value { font-size:28px; font-weight:600; letter-spacing:-0.02em; line-height:1.25; font-variant-numeric:tabular-nums; }
  .forn-kpi-foot { font-size:12px; color:var(--v2-fg-3); }
  .forn-sw { width:8px; height:8px; border-radius:2px; display:inline-block; flex-shrink:0; }

  /* ── Grade ── */
  .forn-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:20px; align-items:start; }
  .forn-col { display:grid; gap:20px; min-width:0; }
  .forn-span-2 { grid-column:span 2; }
  @media (max-width: 1100px) { .forn-grid { grid-template-columns:minmax(0, 1fr); } .forn-span-2 { grid-column:auto; } }
  .forn-panel { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; min-width:0; overflow:hidden; }
  .forn-panel-hdr { padding:14px 18px 4px; }
  .forn-panel-title { font-size:14px; font-weight:600; margin:0; }
  .forn-panel-sub { margin:2px 0 0; font-size:12.5px; color:var(--v2-fg-3); }
  .forn-panel-body { padding:10px 18px 16px; }

  /* ── Próximos vencimentos ── */
  .forn-upcoming { display:grid; }
  .forn-upcoming button { display:grid; grid-template-columns:minmax(0, 1fr) auto; gap:10px; align-items:center; padding:9px 8px; margin:0 -8px; border:0; border-radius:8px; background:transparent; text-align:left; color:var(--v2-fg); cursor:pointer; font-family:inherit; }
  .forn-upcoming button:hover { background:var(--v2-hover); }
  .forn-upcoming b { display:block; font-weight:500; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .forn-upcoming small { display:block; font-size:12px; color:var(--v2-fg-3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

  /* ── Por departamento ── */
  .forn-dept { display:grid; gap:4px; }
  .forn-dept button { display:grid; grid-template-columns:minmax(0, 1fr) auto; gap:4px 10px; align-items:center; padding:7px 8px; margin:0 -8px; border:0; border-radius:8px; background:transparent; text-align:left; color:var(--v2-fg); font-size:13px; cursor:pointer; font-family:inherit; }
  .forn-dept button:hover { background:var(--v2-hover); }
  .forn-dept button[aria-pressed="true"] { background:color-mix(in oklch, var(--v2-accent) 14%, transparent); }
  .forn-dept .n { font:500 12.5px var(--font-data); color:var(--v2-fg-2); }
  .forn-dept .bar { grid-column:1 / -1; display:flex; height:6px; border-radius:99px; overflow:hidden; background:var(--v2-surface-2); }
  .forn-dept .bar i { display:block; height:100%; }
  .forn-legend { display:flex; gap:12px; flex-wrap:wrap; font-size:12px; color:var(--v2-fg-3); margin-top:10px; }
  .forn-legend span { display:inline-flex; align-items:center; gap:6px; }

  /* ── Barra de ferramentas e tabela ── */
  .forn-toolbar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:12px 18px; border-bottom:1px solid var(--v2-line); }
  .forn-count { font-weight:400; font-size:13px; color:var(--v2-fg-3); }
  .forn-actions { display:flex; gap:8px; flex-wrap:wrap; margin-left:auto; }
  .forn-search { display:inline-flex; align-items:center; gap:8px; height:32px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg-3); width:280px; max-width:100%; }
  .forn-search:focus-within { border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }
  .forn-search input { flex:1; min-width:0; border:0; outline:none; background:transparent; color:var(--v2-fg); font-size:13px; font-family:inherit; }
  .forn-search input::placeholder { color:var(--v2-fg-3); }
  .forn-chip { display:inline-flex; align-items:center; gap:6px; height:28px; padding:0 8px 0 10px; border-radius:99px; border:0; background:color-mix(in oklch, var(--v2-accent) 14%, transparent); color:var(--v2-fg); font-size:12.5px; cursor:pointer; font-family:inherit; }
  .forn-chip svg { color:var(--v2-fg-3); }
  .forn-scroll { overflow:auto; max-height:640px; }
  .forn-table { width:100%; border-collapse:collapse; font-size:13px; }
  .forn-table thead { position:sticky; top:0; z-index:1; }
  .forn-table th { padding:9px 12px; font-size:12px; font-weight:500; color:var(--v2-fg-3); text-align:left; background:var(--v2-surface); border-bottom:1px solid var(--v2-line); white-space:nowrap; }
  .forn-table th.r, .forn-table td.r { text-align:right; }
  .forn-table td { padding:8px 12px; height:48px; border-bottom:1px solid var(--v2-line); vertical-align:middle; }
  .forn-table th:first-child, .forn-table td:first-child { padding-left:18px; }
  .forn-table th:last-child, .forn-table td:last-child { padding-right:18px; }
  .forn-table tbody tr { cursor:pointer; }
  .forn-table tbody tr:hover td { background:var(--v2-hover); }
  .forn-table tbody tr:last-child td { border-bottom:none; }
  .forn-name { display:block; font-weight:500; }
  .forn-svc { display:block; max-width:280px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12.5px; color:var(--v2-fg-3); }
  .forn-row-act { display:flex; justify-content:flex-end; gap:2px; }

  /* ── Vence em ── */
  .forn-days { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:5px; font:500 12px var(--font-data); white-space:nowrap; --c:var(--v2-ok); background:color-mix(in oklch, var(--c) 14%, transparent); color:color-mix(in oklch, var(--c) 72%, var(--v2-fg)); }
  .forn-days svg { color:var(--c); }
  .forn-days.warn { --c:var(--v2-med); }
  .forn-days.danger { --c:var(--v2-crit); }
  .forn-days.neutral { --c:var(--v2-fg-3); }
  .forn-days-input { width:64px; height:28px; padding:0 8px; border:1px solid var(--v2-line); border-radius:6px; background:var(--v2-bg); color:var(--v2-fg); font:500 12.5px var(--font-data); text-align:center; outline:none; }
  .forn-days-input:focus { border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }

  /* ── Botões ── */
  .forn-btn { display:inline-flex; align-items:center; gap:7px; height:32px; padding:0 12px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; font-family:var(--font-ui); white-space:nowrap; border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-fg); }
  .forn-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .forn-btn:hover:not(:disabled) { background:var(--v2-hover); border-color:var(--v2-line-strong); }
  .forn-btn.ghost { background:transparent; border-color:transparent; color:var(--v2-fg-2); }
  .forn-btn.primary { background:var(--v2-accent); border-color:var(--v2-accent); color:var(--v2-accent-ink); }
  .forn-btn.primary:hover:not(:disabled) { background:var(--v2-accent); filter:brightness(1.08); }
  .forn-btn.danger-text { background:transparent; border-color:transparent; color:var(--v2-crit); margin-right:auto; }
  .forn-btn.danger-text:hover:not(:disabled) { background:color-mix(in oklch, var(--v2-crit) 10%, transparent); border-color:transparent; }
  .forn-btn.icon-only { width:30px; height:30px; padding:0; justify-content:center; border-color:transparent; background:transparent; color:var(--v2-fg-2); }
  .forn-btn.icon-only:hover:not(:disabled) { background:var(--v2-hover); color:var(--v2-fg); border-color:transparent; }
  .forn-btn.icon-only.danger:hover:not(:disabled) { color:var(--v2-crit); background:color-mix(in oklch, var(--v2-crit) 12%, transparent); }

  /* ── Estados e notas ── */
  .forn-empty { padding:40px; text-align:center; color:var(--v2-fg-3); font-size:13px; }
  .forn-loading { display:flex; align-items:center; justify-content:center; gap:8px; padding:40px; color:var(--v2-fg-3); font-size:13px; }
  .forn-note { display:flex; align-items:flex-start; gap:10px; font-size:12.5px; color:var(--v2-fg-3); padding:10px 18px 12px; line-height:1.5; border-top:1px solid var(--v2-line); }
  .forn-note svg { flex-shrink:0; margin-top:2px; }

  /* ── Painel lateral ── */
  .forn-vig { display:grid; gap:6px; }
  .forn-vig-track { height:8px; border-radius:99px; background:var(--v2-surface-2); overflow:hidden; }
  .forn-vig-track i { display:block; height:100%; border-radius:99px; }
  .forn-vig-labels { display:flex; justify-content:space-between; gap:8px; font:400 12px var(--font-data); color:var(--v2-fg-3); }
  .forn-who { margin:0; padding-left:18px; display:grid; gap:4px; font-size:13px; color:var(--v2-fg-2); }
`;

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtDate(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function daysToExpire(d: string | null): number | null {
  if (!d) return null;
  const [y, m, day] = d.split("-").map((n) => parseInt(n, 10));
  const target = new Date(Date.UTC(y, m - 1, day));
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.floor((target.getTime() - todayUtc) / 86400000);
}

const plural = (n: number) => `${n} ${n === 1 ? "dia" : "dias"}`;

// Gravidade do vencimento: vencido ou dentro do alerta (crit), até 60 dias (warn), em dia (ok)
type Sev = "crit" | "warn" | "ok" | "none";
function sevOf(days: number | null, alertDays: number): Sev {
  if (days === null) return "none";
  if (days < 0 || days <= alertDays) return "crit";
  if (days <= 60) return "warn";
  return "ok";
}

// ── Sub-components ─────────────────────────────────────────────────────────────
function DaysChip({ days, alertDays }: { days: number | null; alertDays: number }) {
  const s = sevOf(days, alertDays);
  if (days === null) return <span className="forn-days neutral">sem expiração</span>;
  if (s === "crit")
    return (
      <span className="forn-days danger">
        <AlertTriangle size={11} />{" "}
        {days < 0 ? `vencido há ${plural(Math.abs(days))}` : plural(days)}
      </span>
    );
  if (s === "warn")
    return (
      <span className="forn-days warn">
        <Clock size={11} /> {plural(days)}
      </span>
    );
  return (
    <span className="forn-days ok">
      <CheckCircle2 size={11} /> {plural(days)}
    </span>
  );
}

// Filtro de situação vindo dos KPIs
type Situacao = "exp" | "soon" | "q90" | "none" | null;
const SITUACAO_LABEL: Record<Exclude<Situacao, null>, string> = {
  exp: "Situação: vencidos",
  soon: "Situação: a vencer",
  q90: "Situação: vencem em 90 dias",
  none: "Situação: sem expiração",
};
function matchSituacao(f: Situacao, r: FornecedorRow) {
  if (!f) return true;
  const d = daysToExpire(r.data_expiracao);
  if (f === "none") return d === null;
  if (d === null) return false;
  if (f === "exp") return d < 0;
  if (f === "soon") return d >= 0 && d <= (r.alert_days ?? 30);
  return d >= 0 && d <= 90;
}

// ── Main ───────────────────────────────────────────────────────────────────────
export function FornecedoresDashboard() {
  const qc = useQueryClient();
  const { can, isAdmin, isModuleAdmin } = usePermissions();

  const canView = isAdmin || isModuleAdmin("fornecedores") || can("fornecedores", "view");
  const canCreate = isAdmin || isModuleAdmin("fornecedores") || can("fornecedores", "create");
  const canEdit = isAdmin || isModuleAdmin("fornecedores") || can("fornecedores", "edit");
  const canDelete = isAdmin || isModuleAdmin("fornecedores") || can("fornecedores", "delete");

  const fetchList = useServerFn(listFornecedores);
  const deleteFn = useServerFn(deleteFornecedor);
  const updateAlertFn = useServerFn(updateFornecedorAlertDays);
  const alertCheckFn = useServerFn(triggerFornecedorAlertCheck);

  const { data, isLoading } = useQuery({
    queryKey: ["fornecedores"],
    queryFn: () => fetchList() as Promise<FornecedorRow[]>,
    enabled: canView,
  });

  const [search, setSearch] = React.useState("");
  const [situacao, setSituacao] = React.useState<Situacao>(null);
  const [dept, setDept] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<FornecedorRow | null>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);

  const allRows = React.useMemo(() => data ?? [], [data]);
  const deptOf = (r: FornecedorRow) => r.department_name ?? "Sem departamento";

  // Tabela: situação + departamento + busca, ordenada pelo vencimento mais próximo
  const rows = React.useMemo(() => {
    const s = search.trim().toLowerCase();
    return allRows
      .filter((r) => matchSituacao(situacao, r))
      .filter((r) => !dept || (r.department_name ?? "Sem departamento") === dept)
      .filter(
        (r) =>
          !s ||
          r.nome.toLowerCase().includes(s) ||
          r.servico_prestado.toLowerCase().includes(s) ||
          (r.department_name ?? "").toLowerCase().includes(s),
      )
      .sort(
        (a, b) =>
          (daysToExpire(a.data_expiracao) ?? Infinity) -
          (daysToExpire(b.data_expiracao) ?? Infinity),
      );
  }, [allRows, search, situacao, dept]);

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Fornecedor removido");
      setOpenId(null);
      qc.invalidateQueries({ queryKey: ["fornecedores"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateAlert = useMutation({
    mutationFn: (v: { id: string; alert_days: number }) => updateAlertFn({ data: v }),
    onSuccess: () => {
      toast.success("Alerta atualizado");
      qc.invalidateQueries({ queryKey: ["fornecedores"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const alertCheck = useMutation({
    mutationFn: () => alertCheckFn(),
    onSuccess: (r: { notified: number; fornecedores: number; smtp?: string }) => {
      if (r.notified > 0) {
        toast.success(
          `Alerta enviado: ${r.notified} e-mail(s) — ${r.fornecedores} fornecedor(es) no prazo.`,
        );
      } else if (r.fornecedores > 0) {
        toast.warning(
          `${r.fornecedores} fornecedor(es) no prazo, mas nenhum e-mail enviado (SMTP: ${r.smtp}, sem destinatários?).`,
          { duration: 10000 },
        );
      } else {
        toast.info("Nenhum fornecedor dentro do prazo de alerta.");
      }
      qc.invalidateQueries({ queryKey: ["fornecedores"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!canView && !canCreate && !canEdit && !canDelete) {
    return (
      <p className="text-sm text-muted-foreground py-10 text-center">
        Você não tem permissão para acessar este módulo.
      </p>
    );
  }

  // ── KPIs ──
  const daysOf = (r: FornecedorRow) => daysToExpire(r.data_expiracao);
  const expiredCount = allRows.filter((r) => matchSituacao("exp", r)).length;
  const soonCount = allRows.filter((r) => matchSituacao("soon", r)).length;
  const q90Count = allRows.filter((r) => matchSituacao("q90", r)).length;
  const noneCount = allRows.filter((r) => matchSituacao("none", r)).length;
  const deptCount = new Set(allRows.map(deptOf)).size;
  const kpis: Array<{
    key: Situacao | "all";
    label: string;
    value: number;
    foot: string;
    tone?: string;
  }> = [
    {
      key: "exp",
      label: "Contratos vencidos",
      value: expiredCount,
      foot: "precisam de renovação ou baixa",
      tone: "var(--v2-crit)",
    },
    {
      key: "soon",
      label: "A vencer",
      value: soonCount,
      foot: "dentro do prazo de alerta",
      tone: "var(--v2-med)",
    },
    { key: "q90", label: "Vencem em 90 dias", value: q90Count, foot: "para planejar renovações" },
    {
      key: "none",
      label: "Sem data de expiração",
      value: noneCount,
      foot: "contratos por prazo indeterminado",
    },
    {
      key: "all",
      label: "Fornecedores",
      value: allRows.length,
      foot: `${deptCount} ${deptCount === 1 ? "departamento" : "departamentos"}`,
    },
  ];
  const clickKpi = (key: Situacao | "all") => {
    if (key === "all") {
      setSituacao(null);
      setDept(null);
      return;
    }
    setSituacao((cur) => (cur === key ? null : key));
  };

  // ── Próximos vencimentos ──
  const upcoming = allRows
    .filter((r) => r.data_expiracao)
    .sort((a, b) => (daysOf(a) ?? 0) - (daysOf(b) ?? 0))
    .slice(0, 6);

  // ── Por departamento (contagem por gravidade) ──
  const byDept = new Map<string, { crit: number; warn: number; ok: number; total: number }>();
  for (const r of allRows) {
    const k = deptOf(r);
    const cur = byDept.get(k) ?? { crit: 0, warn: 0, ok: 0, total: 0 };
    const s = sevOf(daysOf(r), r.alert_days ?? 30);
    cur[s === "none" ? "ok" : s] += 1;
    cur.total += 1;
    byDept.set(k, cur);
  }
  const depts = [...byDept.entries()].sort(
    (a, b) => b[1].crit - a[1].crit || b[1].total - a[1].total,
  );

  const open = allRows.find((r) => r.id === openId) ?? null;
  const openEdit = (r: FornecedorRow) => {
    setEditing(r);
    setDialogOpen(true);
  };

  return (
    <div className="forn-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Cabeçalho ────────────────────────────────────────────────────── */}
      <div className="forn-ph">
        <div>
          <h1 className="forn-ph-title">Fornecedores</h1>
          <p className="forn-ph-sub">
            Vencimento de contratos, com alerta diário por e-mail às 09h30
          </p>
        </div>
        <SyncActions moduleSlug="fornecedores" jobs={["fornecedores-check"]} />
      </div>

      {/* ── KPIs (clique filtra a tabela) ────────────────────────────────── */}
      <div className="forn-kpis">
        {kpis.map((k) => (
          <button
            key={k.key}
            type="button"
            className="forn-kpi"
            aria-pressed={k.key !== "all" && situacao === k.key}
            onClick={() => clickKpi(k.key)}
          >
            <span className="forn-kpi-label">
              {k.tone && k.value > 0 && <span className="forn-sw" style={{ background: k.tone }} />}
              {k.label}
            </span>
            <span className="forn-kpi-value">{isLoading ? "…" : k.value}</span>
            <span className="forn-kpi-foot">{k.foot}</span>
          </button>
        ))}
      </div>

      <div className="forn-grid">
        <div className="forn-col">
          {/* ── Próximos vencimentos ──────────────────────────────────────── */}
          <div className="forn-panel">
            <div className="forn-panel-hdr">
              <h2 className="forn-panel-title">Próximos vencimentos</h2>
              <p className="forn-panel-sub">Do mais urgente ao menos</p>
            </div>
            <div className="forn-panel-body">
              {upcoming.length === 0 ? (
                <div className="dim" style={{ fontSize: 13 }}>
                  Nenhum contrato com data de expiração.
                </div>
              ) : (
                <div className="forn-upcoming">
                  {upcoming.map((r) => (
                    <button key={r.id} type="button" onClick={() => setOpenId(r.id)}>
                      <span style={{ minWidth: 0 }}>
                        <b>{r.nome}</b>
                        <small>
                          {deptOf(r)} · vence em {fmtDate(r.data_expiracao)}
                        </small>
                      </span>
                      <DaysChip days={daysOf(r)} alertDays={r.alert_days ?? 30} />
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* ── Por departamento ──────────────────────────────────────────── */}
          <div className="forn-panel">
            <div className="forn-panel-hdr">
              <h2 className="forn-panel-title">Por departamento</h2>
              <p className="forn-panel-sub">Contratos de cada área · clique para filtrar</p>
            </div>
            <div className="forn-panel-body">
              {depts.length === 0 ? (
                <div className="dim" style={{ fontSize: 13 }}>
                  Nenhum fornecedor cadastrado.
                </div>
              ) : (
                <div className="forn-dept">
                  {depts.map(([name, d]) => (
                    <button
                      key={name}
                      type="button"
                      aria-pressed={dept === name}
                      onClick={() => setDept((cur) => (cur === name ? null : name))}
                      title={`${name}: ${d.total} contratos · ${d.crit} urgentes · ${d.warn} até 60 dias`}
                    >
                      <span>{name}</span>
                      <span className="n">{d.total}</span>
                      <span className="bar" aria-hidden="true">
                        <i
                          style={{
                            width: `${(d.crit / d.total) * 100}%`,
                            background: "var(--v2-crit)",
                          }}
                        />
                        <i
                          style={{
                            width: `${(d.warn / d.total) * 100}%`,
                            background: "var(--v2-med)",
                          }}
                        />
                        <i
                          style={{
                            width: `${(d.ok / d.total) * 100}%`,
                            background: "var(--v2-ok)",
                          }}
                        />
                      </span>
                    </button>
                  ))}
                </div>
              )}
              <div className="forn-legend">
                <span>
                  <span className="forn-sw" style={{ background: "var(--v2-crit)" }} /> Vencido ou
                  no alerta
                </span>
                <span>
                  <span className="forn-sw" style={{ background: "var(--v2-med)" }} /> Até 60 dias
                </span>
                <span>
                  <span className="forn-sw" style={{ background: "var(--v2-ok)" }} /> Em dia
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* ── Contratos ──────────────────────────────────────────────────────── */}
        <div className="forn-panel forn-span-2">
          <div className="forn-toolbar">
            <span style={{ fontWeight: 600, fontSize: 14, marginRight: 4 }}>
              Contratos{" "}
              <span className="forn-count">
                {rows.length === allRows.length
                  ? allRows.length
                  : `${rows.length} de ${allRows.length}`}
              </span>
            </span>
            <label className="forn-search">
              <Search size={14} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar nome, serviço ou departamento"
                aria-label="Buscar fornecedores"
              />
            </label>
            {situacao && (
              <button type="button" className="forn-chip" onClick={() => setSituacao(null)}>
                {SITUACAO_LABEL[situacao]} <X size={14} aria-label="Remover filtro" />
              </button>
            )}
            {dept && (
              <button type="button" className="forn-chip" onClick={() => setDept(null)}>
                Departamento: {dept} <X size={14} aria-label="Remover filtro" />
              </button>
            )}
            <div className="forn-actions">
              {canEdit && (
                <button
                  className="forn-btn ghost"
                  onClick={() => alertCheck.mutate()}
                  disabled={alertCheck.isPending}
                  title="Verificar vencimentos e enviar alertas por e-mail agora"
                >
                  <Bell size={14} className={alertCheck.isPending ? "forn-spin" : ""} /> Testar
                  alertas
                </button>
              )}
              {canCreate && (
                <button
                  className="forn-btn primary"
                  onClick={() => {
                    setEditing(null);
                    setDialogOpen(true);
                  }}
                >
                  <Plus size={14} /> Novo fornecedor
                </button>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="forn-loading">
              <Loader2 size={14} className="forn-spin" /> Carregando…
            </div>
          ) : allRows.length === 0 ? (
            <div className="forn-empty">
              Nenhum fornecedor cadastrado.
              {canCreate && ' Clique em "Novo fornecedor" para começar.'}
            </div>
          ) : rows.length === 0 ? (
            <div className="forn-empty">Nenhum fornecedor com esses filtros.</div>
          ) : (
            <div className="forn-scroll">
              <table className="forn-table">
                <thead>
                  <tr>
                    <th>Fornecedor</th>
                    <th>Departamento</th>
                    <th>Contratação</th>
                    <th>Expiração</th>
                    <th>Vence em</th>
                    <th className="r">Alerta (dias)</th>
                    {(canEdit || canDelete) && (
                      <th className="r">
                        <span className="sr-only">Ações</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr
                      key={r.id}
                      tabIndex={0}
                      onClick={() => setOpenId(r.id)}
                      onKeyDown={(e) => e.key === "Enter" && setOpenId(r.id)}
                    >
                      <td>
                        <span className="forn-name">{r.nome}</span>
                        <span className="forn-svc" title={r.servico_prestado}>
                          {r.servico_prestado}
                        </span>
                      </td>
                      <td className="dim">{r.department_name ?? "—"}</td>
                      <td className="mono dim">{fmtDate(r.data_contratacao)}</td>
                      <td className="mono dim">{fmtDate(r.data_expiracao)}</td>
                      <td>
                        <DaysChip days={daysOf(r)} alertDays={r.alert_days ?? 30} />
                      </td>
                      <td className="r" onClick={(e) => e.stopPropagation()}>
                        {canEdit ? (
                          <input
                            type="number"
                            min={1}
                            max={365}
                            defaultValue={r.alert_days ?? 30}
                            className="forn-days-input"
                            aria-label={`Dias de alerta de ${r.nome}`}
                            onBlur={(e) => {
                              const v = parseInt(e.target.value, 10);
                              if (v && v !== r.alert_days)
                                updateAlert.mutate({ id: r.id, alert_days: v });
                            }}
                          />
                        ) : (
                          <span className="mono dim">{r.alert_days ?? 30}</span>
                        )}
                      </td>
                      {(canEdit || canDelete) && (
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="forn-row-act">
                            {canEdit && (
                              <button
                                className="forn-btn icon-only"
                                onClick={() => openEdit(r)}
                                title="Editar"
                                aria-label={`Editar ${r.nome}`}
                              >
                                <Pencil size={14} />
                              </button>
                            )}
                            {canDelete && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <button
                                    className="forn-btn icon-only danger"
                                    title="Remover"
                                    aria-label={`Remover ${r.nome}`}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Remover fornecedor</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Tem certeza que deseja remover <b>{r.nome}</b>? Esta ação não
                                      pode ser desfeita.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => del.mutate(r.id)}>
                                      Remover
                                    </AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="forn-note">
            <Bell size={14} />
            <span>
              Quando a expiração entra no prazo de "Alerta (dias)", um e-mail vai para os
              administradores globais, os administradores do módulo e o departamento do fornecedor,
              diariamente às 09h30 (Brasília).
            </span>
          </div>
        </div>
      </div>

      {/* ── Painel lateral: fornecedor ───────────────────────────────────────── */}
      <DetailSheet
        open={!!open}
        onOpenChange={(o) => !o && setOpenId(null)}
        eyebrow={
          open
            ? open.data_expiracao
              ? `Contrato · vence em ${fmtDate(open.data_expiracao)}`
              : "Contrato por prazo indeterminado"
            : null
        }
        title={open?.nome ?? ""}
        badges={
          open && (
            <>
              <DaysChip days={daysOf(open)} alertDays={open.alert_days ?? 30} />
              <span
                className="forn-days neutral"
                style={{ fontFamily: "var(--font-ui)", color: "var(--v2-fg-2)" }}
              >
                {deptOf(open)}
              </span>
            </>
          )
        }
        footer={
          open && (canEdit || canDelete) ? (
            <>
              {canDelete && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button className="forn-btn danger-text">Remover</button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Remover fornecedor</AlertDialogTitle>
                      <AlertDialogDescription>
                        Tem certeza que deseja remover <b>{open.nome}</b>? Esta ação não pode ser
                        desfeita.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction onClick={() => del.mutate(open.id)}>
                        Remover
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              )}
              {canEdit && (
                <button className="forn-btn primary" onClick={() => openEdit(open)}>
                  <Pencil size={14} /> Editar contrato
                </button>
              )}
            </>
          ) : null
        }
      >
        {open &&
          (() => {
            const days = daysOf(open);
            const sev = sevOf(days, open.alert_days ?? 30);
            const ini = new Date(open.data_contratacao + "T12:00:00").getTime();
            const fim = open.data_expiracao
              ? new Date(open.data_expiracao + "T12:00:00").getTime()
              : null;
            const totalDias = fim ? Math.round((fim - ini) / 86400000) : null;
            const pct =
              fim && totalDias
                ? Math.max(0, Math.min(100, ((Date.now() - ini) / (fim - ini)) * 100))
                : null;
            const cor =
              sev === "crit"
                ? "var(--v2-crit)"
                : sev === "warn"
                  ? "var(--v2-med)"
                  : "var(--v2-accent)";
            return (
              <>
                <DetailSection title="Contrato">
                  <DetailList
                    items={[
                      ["Serviço prestado", open.servico_prestado],
                      ["Departamento", open.department_name ?? "—"],
                      ["Contratação", fmtDate(open.data_contratacao), true],
                      ["Expiração", fmtDate(open.data_expiracao), true],
                      [
                        "Duração",
                        totalDias !== null
                          ? `${Math.max(1, Math.round(totalDias / 30))} ${Math.round(totalDias / 30) === 1 ? "mês" : "meses"}`
                          : "indeterminada",
                      ],
                      ["Alerta", `${open.alert_days ?? 30} dias antes da expiração`],
                      [
                        "Último alerta enviado",
                        open.last_alert_sent_at
                          ? new Date(open.last_alert_sent_at).toLocaleString("pt-BR")
                          : "—",
                        true,
                      ],
                    ]}
                  />
                </DetailSection>

                {pct !== null && (
                  <DetailSection title="Vigência">
                    <div className="forn-vig">
                      <div
                        className="forn-vig-track"
                        role="img"
                        aria-label={`${Math.round(pct)}% do contrato decorrido`}
                      >
                        <i style={{ width: `${pct}%`, background: cor }} />
                      </div>
                      <div className="forn-vig-labels">
                        <span>{fmtDate(open.data_contratacao)}</span>
                        <span>{Math.round(pct)}% decorrido</span>
                        <span>{fmtDate(open.data_expiracao)}</span>
                      </div>
                    </div>
                  </DetailSection>
                )}

                <DetailSection title="Quem recebe o alerta">
                  <ul className="forn-who">
                    <li>Administradores globais</li>
                    <li>Administradores do módulo Fornecedores</li>
                    <li>
                      {open.department_name
                        ? `Departamento ${open.department_name}`
                        : "Nenhum departamento vinculado"}
                    </li>
                  </ul>
                </DetailSection>
              </>
            );
          })()}
      </DetailSheet>

      <FornecedorDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
    </div>
  );
}
