import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ModuleLoading } from "@/components/layout/ModuleLoading";
import { useDepartments } from "@/lib/use-departments";
import { useAuth } from "@/lib/auth-context";
import { usePermissions } from "@/lib/use-permissions";
import { listAprovadores, upsertAprovador, deleteAprovador } from "@/lib/aprovadores.functions";

const MODULE = "aprovadores";

type Row = {
  id: string;
  nome: string;
  email: string;
  department_id: string;
  ordem: number;
  papel: string | null;
};

const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .map((x) => x[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
const isGerenciaTI = (name: string) => /ger[eê]ncia de ti/i.test(name);

// ── CSS (interface v2) ─────────────────────────────────────────────────────────
const CSS = `
  .apv-root { font-family:var(--font-ui); color:var(--v2-fg); display:flex; flex-direction:column; gap:20px; font-size:14px; }
  .apv-root * { box-sizing:border-box; }
  .apv-root ::-webkit-scrollbar { width:6px; height:6px; }
  .apv-root ::-webkit-scrollbar-thumb { background:var(--v2-line-strong); border-radius:3px; }
  .apv-root :focus-visible { outline:2px solid var(--v2-accent); outline-offset:2px; }
  .apv-mono { font-family:var(--font-data); font-size:12.5px; }
  .apv-dim { color:var(--v2-fg-3); }

  .apv-ph { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  .apv-ph-title { font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.2; margin:0; }
  .apv-ph-sub { margin:4px 0 0; font-size:13px; color:var(--v2-fg-3); }
  .apv-btn { display:inline-flex; align-items:center; gap:7px; height:34px; padding:0 14px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; font-family:var(--font-ui); white-space:nowrap; border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-fg); }
  .apv-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .apv-btn:hover:not(:disabled) { background:var(--v2-hover); }
  .apv-btn.primary { background:var(--v2-accent); border-color:var(--v2-accent); color:var(--v2-accent-ink); }
  .apv-btn.primary:hover:not(:disabled) { background:var(--v2-accent); filter:brightness(1.08); }
  .apv-btn.ghost { background:transparent; border-color:transparent; color:var(--v2-fg-2); }
  .apv-btn.danger { background:var(--v2-crit); border-color:var(--v2-crit); color:#fff; }

  .apv-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(190px, 1fr)); background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
  .apv-kpi { padding:16px 18px 14px; display:grid; gap:2px; align-content:start; box-shadow:1px 0 0 var(--v2-line), 0 1px 0 var(--v2-line); min-width:0; }
  .apv-kpi-label { font-size:12.5px; color:var(--v2-fg-2); display:flex; align-items:center; gap:6px; }
  .apv-kpi-value { font-size:28px; font-weight:600; letter-spacing:-0.02em; line-height:1.25; font-variant-numeric:tabular-nums; }
  .apv-kpi-foot { font-size:12px; color:var(--v2-fg-3); }
  .apv-sw { width:8px; height:8px; border-radius:2px; display:inline-block; flex-shrink:0; }

  .apv-panel { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; min-width:0; }
  .apv-panel-hdr { padding:14px 18px 4px; }
  .apv-panel-title { font-size:14px; font-weight:600; margin:0; }
  .apv-panel-sub { margin:2px 0 0; font-size:12.5px; color:var(--v2-fg-3); }
  .apv-empty { padding:32px 16px; text-align:center; color:var(--v2-fg-3); font-size:13px; }

  .apv-chains { display:flex; gap:10px; overflow-x:auto; padding:12px 18px 18px; }
  .apv-chain { flex:1 0 220px; max-width:300px; display:grid; gap:6px; align-content:start; padding:12px; border:1px solid var(--v2-line); border-radius:12px; background:var(--v2-surface-2); }
  .apv-chain > b { font-size:13px; font-weight:600; margin-bottom:2px; }
  .apv-lnk { display:grid; grid-template-columns:24px minmax(0, 1fr); gap:8px; align-items:center; padding:6px 8px; border-radius:8px; background:var(--v2-surface); border:1px solid var(--v2-line); }
  .apv-lnk.off { opacity:.6; }
  .apv-lnk b { display:block; font-size:13px; font-weight:500; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .apv-lnk small { display:block; font-size:12px; color:var(--v2-fg-3); }
  .apv-ord { display:inline-grid; place-items:center; width:24px; height:24px; border-radius:50%; font:600 12px var(--font-data); background:color-mix(in oklch, var(--v2-accent) 14%, transparent); color:var(--v2-accent); }
  .apv-role { display:inline-flex; align-items:center; height:20px; padding:0 7px; border-radius:5px; font-size:11.5px; font-weight:500; white-space:nowrap; background:color-mix(in oklch, var(--c) 15%, transparent); color:color-mix(in oklch, var(--c) 75%, var(--v2-fg)); vertical-align:1px; }

  .apv-simctl { display:flex; flex-wrap:wrap; gap:8px; align-items:center; padding:12px 18px; }
  .apv-dchip { display:inline-flex; align-items:center; gap:6px; height:30px; padding:0 10px; border:1px solid var(--v2-line); border-radius:99px; background:var(--v2-bg); color:var(--v2-fg-2); font:500 12.5px var(--font-ui); cursor:pointer; }
  .apv-dchip[aria-pressed="true"] { border-color:var(--v2-accent); background:color-mix(in oklch, var(--v2-accent) 12%, transparent); color:var(--v2-fg); }
  .apv-dchip .k { font:600 11px var(--font-data); width:18px; height:18px; border-radius:50%; display:grid; place-items:center; background:var(--v2-accent); color:var(--v2-accent-ink); }
  .apv-urg { display:inline-flex; gap:8px; align-items:center; margin-left:8px; font-size:13px; color:var(--v2-fg-2); cursor:pointer; }
  .apv-urg input { accent-color:var(--v2-accent); width:15px; height:15px; }
  .apv-sim { display:grid; gap:10px; padding:0 18px 12px; }
  .apv-step { display:grid; grid-template-columns:36px minmax(0, 1fr); gap:12px; }
  .apv-step .n { width:28px; height:28px; border-radius:50%; display:grid; place-items:center; font:600 13px var(--font-data); background:var(--v2-accent); color:var(--v2-accent-ink); margin-top:8px; }
  .apv-gbox { padding:10px 12px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-surface-2); display:grid; gap:6px; }
  .apv-gbox-h { font-size:12.5px; color:var(--v2-fg-3); }
  .apv-gbox-h b { color:var(--v2-fg); font-weight:600; }
  .apv-mem { display:grid; grid-template-columns:28px minmax(0, 1fr) auto; gap:8px; align-items:center; }
  .apv-mem b { display:block; font-size:13px; font-weight:500; }
  .apv-mem small { display:block; font-size:12px; color:var(--v2-fg-3); }
  .apv-av { width:28px; height:28px; border-radius:50%; display:grid; place-items:center; font:600 11px var(--font-ui); background:color-mix(in oklch, var(--v2-accent) 16%, transparent); color:var(--v2-accent); flex:none; }
  .apv-note { margin:0; padding:0 18px 16px; font-size:12.5px; line-height:1.5; color:var(--v2-fg-3); }

  .apv-tbar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding:12px 18px; border-bottom:1px solid var(--v2-line); }
  .apv-tbar > b { font-size:14px; font-weight:600; margin-right:4px; }
  .apv-tbar > b span { font-weight:400; font-size:13px; color:var(--v2-fg-3); }
  .apv-select { height:32px; border:1px solid var(--v2-line); background:var(--v2-bg); color:var(--v2-fg); border-radius:8px; font:13px var(--font-ui); padding:0 10px; max-width:260px; }
  .apv-search { display:inline-flex; align-items:center; gap:8px; height:32px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg-3); width:250px; max-width:100%; margin-left:auto; }
  .apv-search input { flex:1; min-width:0; border:0; outline:none; background:transparent; color:var(--v2-fg); font-size:13px; font-family:inherit; }
  .apv-scroll { overflow:auto; max-height:560px; }
  .apv-table { width:100%; border-collapse:collapse; font-size:13px; }
  .apv-table thead { position:sticky; top:0; z-index:1; }
  .apv-table th { padding:9px 12px; font-size:12px; font-weight:500; color:var(--v2-fg-3); text-align:left; background:var(--v2-surface); border-bottom:1px solid var(--v2-line); white-space:nowrap; }
  .apv-table td { padding:8px 12px; height:48px; border-bottom:1px solid var(--v2-line); vertical-align:middle; }
  .apv-table th:first-child, .apv-table td:first-child { padding-left:18px; }
  .apv-table th:last-child, .apv-table td:last-child { padding-right:18px; }
  .apv-table tbody tr:hover td { background:var(--v2-hover); }
  .apv-table tbody tr:last-child td { border-bottom:none; }
  .apv-who { display:flex; align-items:center; gap:10px; font-weight:500; }
  .apv-tag { display:inline-flex; align-items:center; height:22px; padding:0 8px; border-radius:5px; background:var(--v2-surface-2); border:1px solid var(--v2-line); font-size:12px; color:var(--v2-fg-2); white-space:nowrap; }
  .apv-row-act { display:flex; justify-content:flex-end; gap:2px; }
  .apv-icon-btn { display:grid; place-items:center; width:30px; height:30px; border-radius:8px; border:0; background:transparent; color:var(--v2-fg-2); cursor:pointer; }
  .apv-icon-btn:hover { background:var(--v2-hover); color:var(--v2-fg); }
  .apv-icon-btn.danger:hover { color:var(--v2-crit); background:color-mix(in oklch, var(--v2-crit) 12%, transparent); }

  .apv-form { display:grid; gap:14px; padding-top:4px; font-family:var(--font-ui); color:var(--v2-fg); }
  .apv-row2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  @media (max-width: 560px) { .apv-row2 { grid-template-columns:1fr; } }
  .apv-field { display:grid; gap:6px; align-content:start; }
  .apv-field label { font-size:12.5px; font-weight:500; color:var(--v2-fg-2); }
  .apv-field small { font-size:12px; color:var(--v2-fg-3); line-height:1.45; }
  .apv-input { width:100%; height:34px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg); font-size:13px; font-family:inherit; outline:none; }
  .apv-input:focus { border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }
`;

const dialogStyle: React.CSSProperties = {
  background: "var(--v2-surface)",
  border: "1px solid var(--v2-line-strong)",
  borderRadius: 12,
  color: "var(--v2-fg)",
};

export function AprovadoresDashboard() {
  const qc = useQueryClient();
  const { can, isAdmin, isModuleAdmin } = usePermissions();
  const canCreate =
    isAdmin || isModuleAdmin(MODULE) || can(MODULE, "create") || can(MODULE, "manage");
  const canEdit = isAdmin || isModuleAdmin(MODULE) || can(MODULE, "edit") || can(MODULE, "manage");
  const canDelete =
    isAdmin || isModuleAdmin(MODULE) || can(MODULE, "delete") || can(MODULE, "manage");

  const fetchList = useServerFn(listAprovadores);
  const deleteFn = useServerFn(deleteAprovador);

  const { data: depts } = useDepartments();
  const deptName = React.useMemo(() => {
    const m = new Map<string, string>();
    (depts ?? []).forEach((d) => m.set(d.id, d.name));
    return m;
  }, [depts]);

  const { data, isLoading } = useQuery({
    queryKey: ["aprovadores"],
    queryFn: () => fetchList() as Promise<Row[]>,
  });

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Row | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Row | null>(null);
  const [deptFilter, setDeptFilter] = React.useState("");
  const [search, setSearch] = React.useState("");
  const [simDepts, setSimDepts] = React.useState<string[] | null>(null);
  const [urgent, setUrgent] = React.useState(false);

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Aprovador removido");
      qc.invalidateQueries({ queryKey: ["aprovadores"] });
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = React.useMemo(() => data ?? [], [data]);
  const nameOf = React.useCallback((id: string) => deptName.get(id) ?? "—", [deptName]);

  // Departamentos com aprovadores, cada um com sua cadeia ordenada
  const chains = React.useMemo(() => {
    const m = new Map<string, Row[]>();
    for (const r of rows) {
      const arr = m.get(r.department_id) ?? [];
      arr.push(r);
      m.set(r.department_id, arr);
    }
    return [...m.entries()]
      .map(([id, list]) => ({
        id,
        name: nameOf(id),
        list: [...list].sort((a, b) => a.ordem - b.ordem),
      }))
      .sort(
        (a, b) =>
          Number(isGerenciaTI(a.name)) - Number(isGerenciaTI(b.name)) ||
          a.name.localeCompare(b.name),
      );
  }, [rows, nameOf]);

  // Mesmo departamento + mesma ordem: a GMUD usa só um deles (o que o banco devolver primeiro)
  const conflictIds = React.useMemo(() => {
    const seen = new Map<string, number>();
    rows.forEach((r) =>
      seen.set(
        `${r.department_id}|${r.ordem}`,
        (seen.get(`${r.department_id}|${r.ordem}`) ?? 0) + 1,
      ),
    );
    return new Set(
      rows.filter((r) => (seen.get(`${r.department_id}|${r.ordem}`) ?? 0) > 1).map((r) => r.id),
    );
  }, [rows]);

  const gerenciaTI = chains.find((c) => isGerenciaTI(c.name));
  const selectable = chains.filter((c) => c !== gerenciaTI);
  const chosen = (simDepts ?? selectable.slice(0, 2).map((c) => c.id)).filter((id) =>
    chains.some((c) => c.id === id),
  );

  // Simulação: mesma montagem da GMUD (createGmud + computeDecisionGroups em gmud.functions.ts)
  const simulation = React.useMemo(() => {
    const order = [...chosen];
    if (urgent && gerenciaTI && !order.includes(gerenciaTI.id)) order.push(gerenciaTI.id);
    const byDept = new Map(chains.map((c) => [c.id, c.list]));
    const ordens = [
      ...new Set(order.flatMap((id) => (byDept.get(id) ?? []).map((r) => r.ordem))),
    ].sort((a, b) => a - b);
    const interleaved: Row[] = [];
    for (const o of ordens)
      for (const id of order) {
        const match = (byDept.get(id) ?? []).find((r) => r.ordem === o);
        if (match) interleaved.push(match);
      }
    const seen = new Set<string>();
    const seq = interleaved.filter((r) => {
      const k = r.email.toLowerCase().trim();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
    const groups = new Map<string, Row[]>();
    for (const r of seq) {
      const k = r.papel ? `${r.department_id}|${r.papel}` : `solo|${r.id}`;
      const arr = groups.get(k) ?? [];
      arr.push(r);
      groups.set(k, arr);
    }
    return [...groups.values()];
  }, [chosen, urgent, gerenciaTI, chains]);

  if (isLoading) return <ModuleLoading />;

  const filtered = rows
    .filter(
      (r) =>
        (!deptFilter || r.department_id === deptFilter) &&
        (!search.trim() ||
          `${r.nome} ${r.email} ${r.papel ?? ""}`
            .toLowerCase()
            .includes(search.trim().toLowerCase())),
    )
    .sort((a, b) => a.ordem - b.ordem || a.nome.localeCompare(b.nome));
  const maxChain = Math.max(0, ...chains.map((c) => new Set(c.list.map((r) => r.ordem)).size));

  const toggleSim = (id: string) =>
    setSimDepts((cur) => {
      const base = cur ?? chosen;
      return base.includes(id) ? base.filter((x) => x !== id) : [...base, id];
    });

  return (
    <div className="apv-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Cabeçalho ──────────────────────────────────────────────────── */}
      <div className="apv-ph">
        <div>
          <h1 className="apv-ph-title">Aprovadores</h1>
          <p className="apv-ph-sub">Quem aprova as mudanças (GMUD) e em que ordem</p>
        </div>
        {canCreate && (
          <button
            className="apv-btn primary"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus size={14} /> Adicionar aprovador
          </button>
        )}
      </div>

      {/* ── KPIs ───────────────────────────────────────────────────────── */}
      <div className="apv-kpis">
        <div className="apv-kpi">
          <span className="apv-kpi-label">Aprovadores</span>
          <span className="apv-kpi-value">{rows.length}</span>
          <span className="apv-kpi-foot">cadastrados no fluxo</span>
        </div>
        <div className="apv-kpi">
          <span className="apv-kpi-label">Maior cadeia</span>
          <span className="apv-kpi-value">{maxChain}</span>
          <span className="apv-kpi-foot">ordens no departamento com mais níveis</span>
        </div>
        <div className="apv-kpi">
          <span className="apv-kpi-label">Departamentos envolvidos</span>
          <span className="apv-kpi-value">{chains.length}</span>
          <span className="apv-kpi-foot">com ao menos um aprovador</span>
        </div>
        {conflictIds.size > 0 && (
          <div className="apv-kpi">
            <span className="apv-kpi-label">
              <span className="apv-sw" style={{ background: "var(--v2-med)" }} />
              Conflitos de ordem
            </span>
            <span className="apv-kpi-value">{conflictIds.size}</span>
            <span className="apv-kpi-foot">mesmo departamento e ordem: só um deles é usado</span>
          </div>
        )}
      </div>

      {rows.length === 0 ? (
        <div className="apv-panel apv-empty">
          Nenhum aprovador cadastrado. Clique em "Adicionar aprovador" para começar.
        </div>
      ) : (
        <>
          {/* ── Cadeia por departamento ── */}
          <div className="apv-panel">
            <div className="apv-panel-hdr">
              <h2 className="apv-panel-title">Cadeia por departamento</h2>
              <p className="apv-panel-sub">
                A ordem de cada departamento · numa GMUD, os departamentos escolhidos são
                intercalados por ordem e cada um aprova na sua vez
              </p>
            </div>
            <div className="apv-chains">
              {chains.map((c) => (
                <div key={c.id} className="apv-chain">
                  <b>{c.name}</b>
                  {c.list.map((r) => {
                    const conflict = conflictIds.has(r.id);
                    const backup =
                      !conflict &&
                      c.list.some((x) => x !== r && x.papel === r.papel && x.ordem < r.ordem);
                    return (
                      <div key={r.id} className={`apv-lnk${conflict ? " off" : ""}`}>
                        <span className="apv-ord">{r.ordem}</span>
                        <div style={{ minWidth: 0 }}>
                          <b title={r.nome}>{r.nome}</b>
                          <small>
                            {r.papel ?? "sem papel"}
                            {conflict && (
                              <>
                                {" · "}
                                <span
                                  className="apv-role"
                                  style={{ "--c": "var(--v2-med)" } as React.CSSProperties}
                                  title={`Há mais de um aprovador de ${c.name} na ordem ${r.ordem}: a GMUD usa só um deles`}
                                >
                                  conflito
                                </span>
                              </>
                            )}
                            {backup && (
                              <>
                                {" · "}
                                <span
                                  className="apv-role"
                                  style={{ "--c": "var(--v2-accent)" } as React.CSSProperties}
                                  title="Mesmo papel de alguém anterior do departamento: é o backup dele"
                                >
                                  backup
                                </span>
                              </>
                            )}
                          </small>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>

          {/* ── Simulação ── */}
          <div className="apv-panel">
            <div className="apv-panel-hdr">
              <h2 className="apv-panel-title">Simular uma GMUD</h2>
              <p className="apv-panel-sub">
                Escolha os departamentos na ordem em que entram na GMUD (o primeiro é o principal) e
                veja quem aprova e em que sequência
              </p>
            </div>
            <div className="apv-simctl">
              {selectable.map((c) => {
                const i = chosen.indexOf(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    className="apv-dchip"
                    aria-pressed={i >= 0}
                    onClick={() => toggleSim(c.id)}
                  >
                    {i >= 0 && <span className="k">{i + 1}</span>}
                    {c.name}
                    {i === 0 && " · principal"}
                  </button>
                );
              })}
              {gerenciaTI && (
                <label className="apv-urg">
                  <input
                    type="checkbox"
                    checked={urgent}
                    onChange={(e) => setUrgent(e.target.checked)}
                  />
                  Emergencial ou impacto crítico (inclui {gerenciaTI.name} no fim)
                </label>
              )}
            </div>
            {simulation.length === 0 ? (
              <div className="apv-empty">Escolha ao menos um departamento.</div>
            ) : (
              <>
                <div className="apv-sim">
                  {simulation.map((g, i) => {
                    const first = g[0];
                    return (
                      <div key={first.id} className="apv-step">
                        <span className="n">{i + 1}</span>
                        <div className="apv-gbox">
                          <div className="apv-gbox-h">
                            <b>Etapa {i + 1}</b> · {nameOf(first.department_id)} ·{" "}
                            {first.papel ?? "sem papel"} ·{" "}
                            {i === 0
                              ? "começa ao criar a GMUD"
                              : "começa quando a etapa anterior aprovar"}
                          </div>
                          {g.map((r) => {
                            const isFirst = r.id === first.id;
                            return (
                              <div key={r.id} className="apv-mem">
                                <span className="apv-av">{initials(r.nome)}</span>
                                <div style={{ minWidth: 0 }}>
                                  <b>{r.nome}</b>
                                  <small>
                                    {r.papel ?? "sem papel"} · {nameOf(r.department_id)} · ordem{" "}
                                    {r.ordem} no departamento
                                  </small>
                                </div>
                                <span
                                  className="apv-role"
                                  style={
                                    {
                                      "--c": isFirst ? "var(--v2-accent)" : "var(--v2-med)",
                                    } as React.CSSProperties
                                  }
                                  title={
                                    isFirst
                                      ? "Notificado quando a etapa começa; só ele pode aprovar"
                                      : `Só é chamado se ${first.nome} não decidir em 5 dias (24h se emergencial ou crítico); aí ${first.nome} perde a vez. Se ${first.nome} aprovar, fica dispensado`
                                  }
                                >
                                  {isFirst ? "Recebe o e-mail" : "Backup"}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
                <p className="apv-note">
                  Cada etapa só começa depois que a anterior aprova. Rejeição de qualquer pessoa
                  encerra a GMUD. Ninguém é aprovado automaticamente: sem decisão no prazo, o
                  sistema chama o backup ou, sem backup, passa para a próxima etapa.
                </p>
              </>
            )}
          </div>

          {/* ── Tabela ── */}
          <div className="apv-panel">
            <div className="apv-tbar">
              <b>
                Aprovadores{" "}
                <span>
                  (
                  {filtered.length === rows.length
                    ? rows.length
                    : `${filtered.length} de ${rows.length}`}
                  )
                </span>
              </b>
              <select
                className="apv-select"
                aria-label="Departamento"
                value={deptFilter}
                onChange={(e) => setDeptFilter(e.target.value)}
              >
                <option value="">Todos os departamentos</option>
                {chains.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <label className="apv-search">
                <Search size={14} />
                <input
                  placeholder="Buscar nome, e-mail ou papel"
                  aria-label="Buscar aprovadores"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            </div>
            {filtered.length === 0 ? (
              <div className="apv-empty">Nenhum aprovador com esses filtros.</div>
            ) : (
              <div className="apv-scroll">
                <table className="apv-table">
                  <thead>
                    <tr>
                      <th>Ordem</th>
                      <th>Aprovador</th>
                      <th>E-mail</th>
                      <th>Departamento</th>
                      <th>Papel</th>
                      {(canEdit || canDelete) && (
                        <th>
                          <span style={{ fontSize: 0 }}>Ações</span>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr key={r.id}>
                        <td>
                          <span className="apv-ord">{r.ordem}</span>
                        </td>
                        <td>
                          <span className="apv-who">
                            <span className="apv-av">{initials(r.nome)}</span>
                            {r.nome}
                          </span>
                        </td>
                        <td className="apv-mono apv-dim">{r.email}</td>
                        <td>{nameOf(r.department_id)}</td>
                        <td>
                          <span className="apv-tag">{r.papel ?? "—"}</span>
                          {conflictIds.has(r.id) && (
                            <>
                              {" "}
                              <span
                                className="apv-role"
                                style={{ "--c": "var(--v2-med)" } as React.CSSProperties}
                                title="Há outro aprovador deste departamento nessa ordem: a GMUD usa só um deles"
                              >
                                conflito de ordem
                              </span>
                            </>
                          )}
                        </td>
                        {(canEdit || canDelete) && (
                          <td>
                            <div className="apv-row-act">
                              {canEdit && (
                                <button
                                  className="apv-icon-btn"
                                  title="Editar"
                                  aria-label="Editar"
                                  onClick={() => {
                                    setEditing(r);
                                    setDialogOpen(true);
                                  }}
                                >
                                  <Pencil size={14} />
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  className="apv-icon-btn danger"
                                  title="Remover"
                                  aria-label="Remover"
                                  onClick={() => setDeleteTarget(r)}
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
            )}
          </div>
        </>
      )}

      <AprovadorDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />

      <Dialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <DialogContent className="font-ui sm:max-w-md" style={dialogStyle}>
          <DialogHeader>
            <DialogTitle style={{ fontSize: 16, fontWeight: 600 }}>Remover aprovador?</DialogTitle>
          </DialogHeader>
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--v2-fg-2)", lineHeight: 1.55 }}>
            <b style={{ color: "var(--v2-fg)" }}>{deleteTarget?.nome}</b> sai da ordem{" "}
            {deleteTarget?.ordem} de {deleteTarget ? nameOf(deleteTarget.department_id) : ""}. Não
            dá para desfazer.
          </p>
          <DialogFooter style={{ gap: 8 }}>
            <button
              className="apv-btn ghost"
              onClick={() => setDeleteTarget(null)}
              disabled={del.isPending}
            >
              Cancelar
            </button>
            <button
              className="apv-btn danger"
              disabled={del.isPending}
              onClick={() => deleteTarget && del.mutate(deleteTarget.id)}
            >
              {del.isPending && <Loader2 size={13} className="animate-spin" />} Remover
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function AprovadorDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Row | null;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: depts } = useDepartments();
  const submit = useServerFn(upsertAprovador);

  const [nome, setNome] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [deptId, setDeptId] = React.useState("");
  const [ordem, setOrdem] = React.useState<number>(1);
  const [papel, setPapel] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setNome(editing?.nome ?? "");
      setEmail(editing?.email ?? "");
      setDeptId(editing?.department_id ?? "");
      setOrdem(editing?.ordem ?? 1);
      setPapel(editing?.papel ?? "");
    }
  }, [open, editing]);

  async function handleSubmit() {
    if (!nome.trim()) return toast.error("Informe o nome");
    if (!email.trim()) return toast.error("Informe o e-mail");
    if (!deptId) return toast.error("Selecione o departamento");
    if (!ordem || ordem < 1) return toast.error("Ordem deve ser maior ou igual a 1");
    if (!papel.trim())
      return toast.error("Informe o papel: ele define quem é backup de quem no departamento");

    setLoading(true);
    try {
      await submit({
        data: {
          id: editing?.id ?? null,
          nome: nome.trim(),
          email: email.trim().toLowerCase(),
          department_id: deptId,
          ordem: Number(ordem),
          papel: papel.trim(),
          created_by: user?.id ?? null,
        },
      });
      toast.success(editing ? "Aprovador atualizado" : "Aprovador criado");
      qc.invalidateQueries({ queryKey: ["aprovadores"] });
      onOpenChange(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar aprovador");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="font-ui sm:max-w-lg max-h-[90dvh] overflow-y-auto"
        style={dialogStyle}
      >
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <DialogHeader>
          <DialogTitle style={{ fontSize: 16, fontWeight: 600 }}>
            {editing ? "Editar aprovador" : "Novo aprovador"}
          </DialogTitle>
        </DialogHeader>
        <div className="apv-form">
          <div className="apv-field">
            <label htmlFor="apv-nome">Nome</label>
            <input
              id="apv-nome"
              className="apv-input"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={200}
            />
          </div>
          <div className="apv-field">
            <label htmlFor="apv-email">E-mail</label>
            <input
              id="apv-email"
              type="email"
              className="apv-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              maxLength={255}
            />
          </div>
          <div className="apv-field">
            <label htmlFor="apv-dept">Departamento</label>
            <select
              id="apv-dept"
              className="apv-input"
              value={deptId}
              onChange={(e) => setDeptId(e.target.value)}
            >
              <option value="">Selecione</option>
              {(depts ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>
          <div className="apv-row2">
            <div className="apv-field">
              <label htmlFor="apv-ordem">Ordem no departamento</label>
              <input
                id="apv-ordem"
                type="number"
                min={1}
                max={50}
                className="apv-input"
                value={ordem}
                onChange={(e) => setOrdem(Number(e.target.value))}
              />
              <small>1 é chamado primeiro. Uma pessoa por ordem em cada departamento.</small>
            </div>
            <div className="apv-field">
              <label htmlFor="apv-papel">Papel/função</label>
              <input
                id="apv-papel"
                className="apv-input"
                value={papel}
                onChange={(e) => setPapel(e.target.value)}
                maxLength={120}
                placeholder="Ex.: Analista, Coordenador"
              />
              <small>
                Mesmo papel repetido no departamento vira backup: uma aprovação basta. Departamentos
                diferentes aprovam cada um na sua vez.
              </small>
            </div>
          </div>
        </div>
        <DialogFooter style={{ gap: 8, paddingTop: 8 }}>
          <button className="apv-btn ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </button>
          <button className="apv-btn primary" onClick={handleSubmit} disabled={loading}>
            {loading && <Loader2 size={13} className="animate-spin" />}{" "}
            {editing ? "Salvar" : "Criar"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
