import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Link2, Loader2, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ModuleLoading } from "@/components/layout/ModuleLoading";
import { useDepartments } from "@/lib/use-departments";
import {
  listApplicationsByDept,
  createApplication,
  updateApplication,
  deleteApplication,
  type ApplicationRow,
} from "@/lib/applications.functions";
import { usePermissions } from "@/lib/use-permissions";

const MODULE = "aplicacoes";
type SortKey = "name" | "department_name" | "created_at";

// ── CSS (interface v2) ─────────────────────────────────────────────────────────
const CSS = `
  .ap-root { font-family:var(--font-ui); color:var(--v2-fg); display:flex; flex-direction:column; gap:20px; font-size:14px; }
  .ap-root * { box-sizing:border-box; }
  .ap-root ::-webkit-scrollbar { width:6px; height:6px; }
  .ap-root ::-webkit-scrollbar-thumb { background:var(--v2-line-strong); border-radius:3px; }
  .ap-root :focus-visible { outline:2px solid var(--v2-accent); outline-offset:2px; }
  .ap-mono { font-family:var(--font-data); font-size:12.5px; }
  .ap-dim { color:var(--v2-fg-3); }

  .ap-ph { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  .ap-ph-title { font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.2; margin:0; }
  .ap-ph-sub { margin:4px 0 0; font-size:13px; color:var(--v2-fg-3); }
  .ap-btn { display:inline-flex; align-items:center; gap:7px; height:34px; padding:0 14px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; font-family:var(--font-ui); white-space:nowrap; border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-fg); }
  .ap-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .ap-btn:hover:not(:disabled) { background:var(--v2-hover); }
  .ap-btn.primary { background:var(--v2-accent); border-color:var(--v2-accent); color:var(--v2-accent-ink); }
  .ap-btn.primary:hover:not(:disabled) { background:var(--v2-accent); filter:brightness(1.08); }
  .ap-btn.ghost { background:transparent; border-color:transparent; color:var(--v2-fg-2); }
  .ap-btn.danger { background:var(--v2-crit); border-color:var(--v2-crit); color:#fff; }

  .ap-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
  .ap-kpi { position:relative; text-align:left; border:0; background:transparent; padding:16px 18px 14px; display:grid; gap:2px; align-content:start; box-shadow:1px 0 0 var(--v2-line), 0 1px 0 var(--v2-line); color:inherit; font-family:inherit; min-width:0; }
  button.ap-kpi { cursor:pointer; }
  button.ap-kpi:hover, .ap-kpi[aria-pressed="true"] { background:var(--v2-hover); }
  .ap-kpi[aria-pressed="true"]::after { content:""; position:absolute; left:0; right:0; bottom:0; height:2px; background:var(--v2-accent); }
  .ap-kpi-label { font-size:12.5px; color:var(--v2-fg-2); display:flex; align-items:center; gap:6px; }
  .ap-kpi-value { font-size:28px; font-weight:600; letter-spacing:-0.02em; line-height:1.25; font-variant-numeric:tabular-nums; }
  .ap-kpi-foot { font-size:12px; color:var(--v2-fg-3); }
  .ap-sw { width:8px; height:8px; border-radius:2px; display:inline-block; flex-shrink:0; }
  .ap-meter { height:6px; border-radius:99px; background:var(--v2-surface-2); overflow:hidden; margin:8px 0 4px; }
  .ap-meter i { display:block; height:100%; border-radius:99px; }

  .ap-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:20px; align-items:start; }
  .ap-span-2 { grid-column:span 2; }
  @media (max-width: 1100px) { .ap-grid { grid-template-columns:minmax(0, 1fr); } .ap-span-2 { grid-column:auto; } }
  .ap-panel { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; min-width:0; }
  .ap-panel-hdr { padding:14px 18px 4px; }
  .ap-panel-title { font-size:14px; font-weight:600; margin:0; }
  .ap-panel-sub { margin:2px 0 0; font-size:12.5px; color:var(--v2-fg-3); }
  .ap-panel-body { padding:12px 18px 16px; }
  .ap-empty { padding:36px 16px; text-align:center; color:var(--v2-fg-3); font-size:13px; }

  .ap-dep { display:grid; gap:2px; max-height:520px; overflow-y:auto; }
  .ap-dep button { display:grid; grid-template-columns:minmax(0, 1fr) minmax(0, 90px) 28px; gap:10px; align-items:center; padding:7px 8px; margin:0 -8px; border:0; border-radius:8px; background:transparent; color:var(--v2-fg); font:13px var(--font-ui); text-align:left; cursor:pointer; }
  .ap-dep button:hover { background:var(--v2-hover); }
  .ap-dep button[aria-pressed="true"] { background:color-mix(in oklch, var(--v2-accent) 12%, transparent); }
  .ap-dep .nm { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .ap-dep .tr { height:8px; border-radius:99px; background:var(--v2-surface-2); overflow:hidden; display:flex; }
  .ap-dep .tr i { display:block; height:100%; }
  .ap-dep .v { font:500 12.5px var(--font-data); text-align:right; }
  .ap-legend { display:flex; gap:14px; flex-wrap:wrap; margin-top:12px; font-size:12.5px; color:var(--v2-fg-2); }
  .ap-legend span { display:inline-flex; align-items:center; gap:6px; }

  .ap-tbar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding:12px 18px; border-bottom:1px solid var(--v2-line); }
  .ap-tbar > b { font-size:14px; font-weight:600; margin-right:4px; }
  .ap-tbar > b span { font-weight:400; font-size:13px; color:var(--v2-fg-3); }
  .ap-seg { display:inline-flex; padding:3px; gap:2px; background:var(--v2-bg); border:1px solid var(--v2-line); border-radius:8px; }
  .ap-seg button { border:0; background:transparent; padding:4px 12px; border-radius:5px; font-size:13px; color:var(--v2-fg-2); cursor:pointer; font-family:inherit; }
  .ap-seg button[aria-pressed="true"] { background:var(--v2-surface-2); color:var(--v2-fg); font-weight:500; box-shadow:inset 0 0 0 1px var(--v2-line); }
  .ap-chip { display:inline-flex; align-items:center; gap:6px; height:26px; padding:0 4px 0 9px; border-radius:5px; font-size:12.5px; background:color-mix(in oklch, var(--v2-accent) 12%, transparent); }
  .ap-chip button { border:0; background:none; color:var(--v2-fg-3); cursor:pointer; display:grid; place-items:center; width:20px; height:20px; border-radius:4px; }
  .ap-chip button:hover { background:var(--v2-hover); color:var(--v2-fg); }
  .ap-search { display:inline-flex; align-items:center; gap:8px; height:32px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg-3); width:250px; max-width:100%; margin-left:auto; }
  .ap-search input { flex:1; min-width:0; border:0; outline:none; background:transparent; color:var(--v2-fg); font-size:13px; font-family:inherit; }

  .ap-scroll { overflow:auto; max-height:600px; }
  .ap-table { width:100%; border-collapse:collapse; font-size:13px; }
  .ap-table thead { position:sticky; top:0; z-index:1; }
  .ap-table th { padding:9px 12px; font-size:12px; font-weight:500; color:var(--v2-fg-3); text-align:left; background:var(--v2-surface); border-bottom:1px solid var(--v2-line); white-space:nowrap; }
  .ap-table th button { display:inline-flex; align-items:center; gap:4px; border:0; background:none; color:inherit; font:inherit; cursor:pointer; padding:0; }
  .ap-table th[aria-sort] button { color:var(--v2-fg); }
  .ap-table th[aria-sort] svg { color:var(--v2-accent); }
  .ap-table td { padding:8px 12px; height:46px; border-bottom:1px solid var(--v2-line); vertical-align:middle; }
  .ap-table th:first-child, .ap-table td:first-child { padding-left:18px; }
  .ap-table th:last-child, .ap-table td:last-child { padding-right:18px; }
  .ap-table tbody tr:hover td { background:var(--v2-hover); }
  .ap-table tbody tr:last-child td { border-bottom:none; }
  .ap-pill { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; white-space:nowrap; background:color-mix(in oklch, var(--c) 14%, transparent); color:color-mix(in oklch, var(--c) 72%, var(--v2-fg)); }
  .ap-pill::before { content:""; width:6px; height:6px; border-radius:50%; background:var(--c); }
  .ap-row-act { display:flex; justify-content:flex-end; gap:2px; }
  .ap-icon-btn { display:grid; place-items:center; width:30px; height:30px; border-radius:8px; border:0; background:transparent; color:var(--v2-fg-2); cursor:pointer; }
  .ap-icon-btn:hover { background:var(--v2-hover); color:var(--v2-fg); }
  .ap-icon-btn.danger:hover { color:var(--v2-crit); background:color-mix(in oklch, var(--v2-crit) 12%, transparent); }

  .ap-form { display:grid; gap:14px; padding-top:4px; font-family:var(--font-ui); color:var(--v2-fg); }
  .ap-field { display:grid; gap:6px; }
  .ap-field label { font-size:12.5px; font-weight:500; color:var(--v2-fg-2); }
  .ap-field small { font-size:12px; color:var(--v2-fg-3); }
  .ap-input { width:100%; height:34px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg); font-size:13px; font-family:inherit; outline:none; }
  .ap-input:focus { border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }
  .ap-callout { display:flex; gap:10px; padding:10px 12px; border-radius:8px; font-size:12.5px; line-height:1.5; color:var(--v2-fg-2); background:color-mix(in oklch, var(--v2-accent) 9%, transparent); border:1px solid color-mix(in oklch, var(--v2-accent) 30%, transparent); }
  .ap-callout svg { color:var(--v2-accent); flex-shrink:0; margin-top:2px; }
`;

const dialogStyle: React.CSSProperties = {
  background: "var(--v2-surface)",
  border: "1px solid var(--v2-line-strong)",
  borderRadius: 12,
  color: "var(--v2-fg)",
};

export function AplicacoesDashboard() {
  const qc = useQueryClient();
  const { can, isAdmin, isModuleAdmin } = usePermissions();
  const canCreate =
    isAdmin || isModuleAdmin(MODULE) || can(MODULE, "create") || can(MODULE, "manage");
  const canEdit = isAdmin || isModuleAdmin(MODULE) || can(MODULE, "edit") || can(MODULE, "manage");
  const canDelete =
    isAdmin || isModuleAdmin(MODULE) || can(MODULE, "delete") || can(MODULE, "manage");

  const fetchList = useServerFn(listApplicationsByDept);
  const createFn = useServerFn(createApplication);
  const updateFn = useServerFn(updateApplication);
  const deleteFn = useServerFn(deleteApplication);

  const { data: depts } = useDepartments();

  const { data, isLoading } = useQuery({
    queryKey: ["applications"],
    queryFn: async () => (await fetchList()).applications,
  });

  const [search, setSearch] = React.useState("");
  const [sortBy, setSortBy] = React.useState<SortKey>("name");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");
  const [onlyNoMatch, setOnlyNoMatch] = React.useState(false);
  const [deptFilter, setDeptFilter] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ApplicationRow | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<ApplicationRow | null>(null);

  const [name, setName] = React.useState("");
  const [deptId, setDeptId] = React.useState("");

  React.useEffect(() => {
    if (dialogOpen) {
      setName(editing?.name ?? "");
      setDeptId(editing?.department_id ?? "");
    }
  }, [dialogOpen, editing]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!name.trim() || !deptId) throw new Error("Preencha todos os campos.");
      if (editing) {
        await updateFn({ data: { id: editing.id, name: name.trim(), department_id: deptId } });
      } else {
        await createFn({ data: { name: name.trim(), department_id: deptId } });
      }
    },
    onSuccess: () => {
      toast.success(
        editing
          ? "Aplicação atualizada"
          : "Aplicação cadastrada e responsável atualizado nas vulnerabilidades",
      );
      qc.invalidateQueries({ queryKey: ["applications"] });
      setDialogOpen(false);
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Aplicação removida");
      qc.invalidateQueries({ queryKey: ["applications"] });
      setConfirmDelete(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = React.useMemo(() => data ?? [], [data]);
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = rows.filter(
      (r) =>
        (!onlyNoMatch || !r.has_match) &&
        (!deptFilter || r.department_id === deptFilter) &&
        (!q ||
          r.name.toLowerCase().includes(q) ||
          (r.department_name ?? "").toLowerCase().includes(q)),
    );
    const dir = sortDir === "asc" ? 1 : -1;
    return [...matched].sort((a, b) => {
      if (sortBy === "created_at") {
        return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
      }
      const av = (a[sortBy] ?? "").toString().toLowerCase();
      const bv = (b[sortBy] ?? "").toString().toLowerCase();
      return av.localeCompare(bv, "pt-BR") * dir;
    });
  }, [rows, search, sortBy, sortDir, onlyNoMatch, deptFilter]);

  const byDept = React.useMemo(() => {
    const m = new Map<string, { id: string; name: string; n: number; no: number }>();
    for (const r of rows) {
      const cur = m.get(r.department_id) ?? {
        id: r.department_id,
        name: r.department_name ?? "—",
        n: 0,
        no: 0,
      };
      cur.n++;
      if (!r.has_match) cur.no++;
      m.set(r.department_id, cur);
    }
    return [...m.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, "pt-BR"));
  }, [rows]);

  const toggleSort = (col: SortKey) => {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir("asc");
    }
  };

  if (isLoading) return <ModuleLoading />;

  const total = rows.length;
  const noMatch = rows.filter((r) => !r.has_match).length;
  const deptMax = Math.max(1, ...byDept.map((d) => d.n));
  const deptName = deptFilter ? (byDept.find((d) => d.id === deptFilter)?.name ?? "") : "";

  const Th = ({ col, label }: { col: SortKey; label: string }) => (
    <th aria-sort={sortBy === col ? (sortDir === "asc" ? "ascending" : "descending") : undefined}>
      <button type="button" onClick={() => toggleSort(col)}>
        {label}
        {sortBy === col && (sortDir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />)}
      </button>
    </th>
  );

  return (
    <div className="ap-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Cabeçalho ──────────────────────────────────────────────────── */}
      <div className="ap-ph">
        <div>
          <h1 className="ap-ph-title">Aplicações</h1>
          <p className="ap-ph-sub">
            Catálogo de aplicações e o departamento responsável por cada uma, usado para atribuir
            vulnerabilidades
          </p>
        </div>
        {canCreate && (
          <button
            className="ap-btn primary"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus size={14} /> Nova aplicação
          </button>
        )}
      </div>

      {/* ── KPIs ───────────────────────────────────────────────────────── */}
      <div className="ap-kpis">
        <div className="ap-kpi">
          <span className="ap-kpi-label">Aplicações cadastradas</span>
          <span className="ap-kpi-value">{total}</span>
          <span className="ap-kpi-foot">FQDNs com dono definido</span>
        </div>
        <div className="ap-kpi">
          <span className="ap-kpi-label">Departamentos responsáveis</span>
          <span className="ap-kpi-value">{byDept.length}</span>
          <span className="ap-kpi-foot">com pelo menos uma aplicação</span>
        </div>
        <button
          type="button"
          className="ap-kpi"
          aria-pressed={onlyNoMatch}
          onClick={() => setOnlyNoMatch((v) => !v)}
          title="Filtrar aplicações sem match"
        >
          <span className="ap-kpi-label">
            <span className="ap-sw" style={{ background: "var(--v2-med)" }} />
            Sem match
          </span>
          <span className="ap-kpi-value">{noMatch}</span>
          <div className="ap-meter">
            <i
              style={{
                width: `${total ? (noMatch / total) * 100 : 0}%`,
                background: "var(--v2-med)",
              }}
            />
          </div>
          <span className="ap-kpi-foot">nome não encontrado nos FQDNs de Vulnerabilidades</span>
        </button>
      </div>

      <div className="ap-grid">
        {/* ── Por departamento ── */}
        <div className="ap-panel">
          <div className="ap-panel-hdr">
            <h2 className="ap-panel-title">Por departamento</h2>
            <p className="ap-panel-sub">Clique para filtrar a lista</p>
          </div>
          <div className="ap-panel-body">
            {byDept.length === 0 ? (
              <div className="ap-empty">Nenhuma aplicação cadastrada.</div>
            ) : (
              <>
                <div className="ap-dep">
                  {byDept.map((d) => (
                    <button
                      key={d.id}
                      type="button"
                      aria-pressed={deptFilter === d.id}
                      onClick={() => setDeptFilter((cur) => (cur === d.id ? null : d.id))}
                      title={`${d.name}: ${d.n} aplicações${d.no ? ` · ${d.no} sem match` : ""}`}
                    >
                      <span className="nm">{d.name}</span>
                      <span className="tr">
                        <i
                          style={{
                            width: `${((d.n - d.no) / deptMax) * 100}%`,
                            background: "var(--v2-accent)",
                          }}
                        />
                        <i
                          style={{
                            width: `${(d.no / deptMax) * 100}%`,
                            background: "var(--v2-med)",
                          }}
                        />
                      </span>
                      <span className="v">{d.n}</span>
                    </button>
                  ))}
                </div>
                <div className="ap-legend">
                  <span>
                    <span className="ap-sw" style={{ background: "var(--v2-accent)" }} /> Com match
                  </span>
                  <span>
                    <span className="ap-sw" style={{ background: "var(--v2-med)" }} /> Sem match
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* ── Tabela ── */}
        <div className="ap-panel ap-span-2">
          <div className="ap-tbar">
            <b>
              Aplicações{" "}
              <span>({filtered.length === total ? total : `${filtered.length} de ${total}`})</span>
            </b>
            <div className="ap-seg" role="group" aria-label="Match">
              <button
                type="button"
                aria-pressed={!onlyNoMatch}
                onClick={() => setOnlyNoMatch(false)}
              >
                Todas
              </button>
              <button type="button" aria-pressed={onlyNoMatch} onClick={() => setOnlyNoMatch(true)}>
                Sem match
              </button>
            </div>
            {deptFilter && (
              <span className="ap-chip">
                {deptName}
                <button
                  onClick={() => setDeptFilter(null)}
                  aria-label="Limpar filtro de departamento"
                >
                  <X size={12} />
                </button>
              </span>
            )}
            <label className="ap-search">
              <Search size={14} />
              <input
                placeholder="Buscar nome ou departamento"
                aria-label="Buscar aplicações"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </label>
          </div>
          {filtered.length === 0 ? (
            <div className="ap-empty">
              {total === 0
                ? "Nenhuma aplicação cadastrada."
                : "Nenhuma aplicação com esses filtros."}
            </div>
          ) : (
            <div className="ap-scroll">
              <table className="ap-table">
                <thead>
                  <tr>
                    <Th col="name" label="Aplicação (FQDN)" />
                    <th>Vulnerabilidades</th>
                    <Th col="department_name" label="Departamento" />
                    <Th col="created_at" label="Cadastrada em" />
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
                      <td className="ap-mono" style={{ fontWeight: 500 }}>
                        {r.name}
                      </td>
                      <td>
                        {r.has_match ? (
                          <span
                            className="ap-pill"
                            style={{ "--c": "var(--v2-ok)" } as React.CSSProperties}
                          >
                            Vinculada
                          </span>
                        ) : (
                          <span
                            className="ap-pill"
                            style={{ "--c": "var(--v2-med)" } as React.CSSProperties}
                            title="Nenhuma vulnerabilidade com esse FQDN: confira se o nome está igual ao do scanner"
                          >
                            Sem match
                          </span>
                        )}
                      </td>
                      <td>{r.department_name ?? "—"}</td>
                      <td className="ap-mono ap-dim">
                        {new Date(r.created_at).toLocaleDateString("pt-BR")}
                      </td>
                      {(canEdit || canDelete) && (
                        <td>
                          <div className="ap-row-act">
                            {canEdit && (
                              <button
                                className="ap-icon-btn"
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
                                className="ap-icon-btn danger"
                                title="Remover"
                                aria-label="Remover"
                                onClick={() => setConfirmDelete(r)}
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
      </div>

      {/* ── Nova / editar ── */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="font-ui sm:max-w-lg" style={dialogStyle}>
          <style dangerouslySetInnerHTML={{ __html: CSS }} />
          <DialogHeader>
            <DialogTitle style={{ fontSize: 16, fontWeight: 600 }}>
              {editing ? "Editar aplicação" : "Nova aplicação"}
            </DialogTitle>
          </DialogHeader>
          <div className="ap-form">
            <div className="ap-field">
              <label htmlFor="ap-name">Nome da aplicação (FQDN)</label>
              <input
                id="ap-name"
                className="ap-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="ex.: portal.empresa.com.br"
              />
              <small>
                Precisa ser igual ao FQDN registrado em Vulnerabilidades para vincular
                automaticamente.
              </small>
            </div>
            <div className="ap-field">
              <label htmlFor="ap-dept">Departamento responsável</label>
              <select
                id="ap-dept"
                className="ap-input"
                value={deptId}
                onChange={(e) => setDeptId(e.target.value)}
              >
                <option value="">Selecione um departamento</option>
                {(depts ?? []).map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </div>
            {!editing && (
              <div className="ap-callout">
                <Link2 size={15} />
                <span>
                  Ao salvar, o departamento passa a ser o responsável pelas vulnerabilidades desse
                  FQDN.
                </span>
              </div>
            )}
          </div>
          <DialogFooter style={{ gap: 8, paddingTop: 8 }}>
            <button
              className="ap-btn ghost"
              onClick={() => setDialogOpen(false)}
              disabled={saveMut.isPending}
            >
              Cancelar
            </button>
            <button
              className="ap-btn primary"
              onClick={() => saveMut.mutate()}
              disabled={saveMut.isPending || !name.trim() || !deptId}
            >
              {saveMut.isPending && <Loader2 size={13} className="animate-spin" />} Salvar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Remover ── */}
      <Dialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <DialogContent className="font-ui sm:max-w-md" style={dialogStyle}>
          <DialogHeader>
            <DialogTitle style={{ fontSize: 16, fontWeight: 600 }}>Remover aplicação?</DialogTitle>
          </DialogHeader>
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--v2-fg-2)", lineHeight: 1.55 }}>
            <b style={{ color: "var(--v2-fg)" }}>{confirmDelete?.name}</b> será removida do
            catálogo. O responsável já preenchido nas vulnerabilidades é mantido.
          </p>
          <DialogFooter style={{ gap: 8 }}>
            <button
              className="ap-btn ghost"
              onClick={() => setConfirmDelete(null)}
              disabled={delMut.isPending}
            >
              Cancelar
            </button>
            <button
              className="ap-btn danger"
              disabled={delMut.isPending}
              onClick={() => confirmDelete && delMut.mutate(confirmDelete.id)}
            >
              {delMut.isPending && <Loader2 size={13} className="animate-spin" />} Remover
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
