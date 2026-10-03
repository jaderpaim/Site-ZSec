import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  type DepartmentRow,
} from "@/lib/departments.functions";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { DetailSection, DetailSheet } from "@/components/layout/DetailSheet";
import { ModuleLoading } from "@/components/layout/ModuleLoading";
import { toast } from "sonner";
import { AlertTriangle, Loader2, Mail, Pencil, Plus, Search, Trash2, X } from "lucide-react";
import {
  ColaboradoresPanel,
  NO_DEPT,
  dialogStyle,
  useVisibleColaboradores,
} from "./ColaboradoresPanel";
import { usePermissions } from "@/lib/use-permissions";
import { listAprovadoresOfDepartment } from "@/lib/aprovadores.functions";
import { Link } from "@tanstack/react-router";

const MODULE = "departamentos";

function splitEmails(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function isValidEmail(e: string): boolean {
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(e);
}

const initials = (n: string) =>
  n
    .split(/\s+/)
    .filter(Boolean)
    .map((x) => x[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
const fmtDate = (iso: string) => iso.slice(0, 10).split("-").reverse().join("/");

// ── CSS (interface v2) ─────────────────────────────────────────────────────────
const CSS = `
  .dp-root { font-family:var(--font-ui); color:var(--v2-fg); display:flex; flex-direction:column; gap:20px; font-size:14px; }
  .dp-root * { box-sizing:border-box; }
  .dp-root ::-webkit-scrollbar { width:6px; height:6px; }
  .dp-root ::-webkit-scrollbar-thumb { background:var(--v2-line-strong); border-radius:3px; }
  .dp-root :focus-visible { outline:2px solid var(--v2-accent); outline-offset:2px; }
  .dp-dim { color:var(--v2-fg-3); }
  .dp-mono { font-family:var(--font-data); font-size:12.5px; }

  .dp-ph { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  .dp-ph-title { font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.2; margin:0; }
  .dp-ph-sub { margin:4px 0 0; font-size:13px; color:var(--v2-fg-3); }
  .dp-btn { display:inline-flex; align-items:center; gap:7px; height:34px; padding:0 14px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; font-family:var(--font-ui); white-space:nowrap; border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-fg); }
  .dp-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .dp-btn:hover:not(:disabled) { background:var(--v2-hover); }
  .dp-btn.primary { background:var(--v2-accent); border-color:var(--v2-accent); color:var(--v2-accent-ink); }
  .dp-btn.primary:hover:not(:disabled) { background:var(--v2-accent); filter:brightness(1.08); }
  .dp-btn.ghost { background:transparent; border-color:transparent; color:var(--v2-fg-2); }
  .dp-btn.danger { background:var(--v2-crit); border-color:var(--v2-crit); color:#fff; }
  .dp-btn.danger-ghost { background:transparent; border-color:transparent; color:var(--v2-crit); }

  .dp-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(190px, 1fr)); background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
  .dp-kpi { position:relative; text-align:left; border:0; background:transparent; padding:16px 18px 14px; display:grid; gap:2px; align-content:start; box-shadow:1px 0 0 var(--v2-line), 0 1px 0 var(--v2-line); color:inherit; font-family:inherit; min-width:0; }
  button.dp-kpi { cursor:pointer; }
  button.dp-kpi:hover, .dp-kpi[aria-pressed="true"] { background:var(--v2-hover); }
  .dp-kpi[aria-pressed="true"]::after { content:""; position:absolute; left:0; right:0; bottom:0; height:2px; background:var(--v2-accent); }
  .dp-kpi-label { font-size:12.5px; color:var(--v2-fg-2); display:flex; align-items:center; gap:6px; }
  .dp-kpi-value { font-size:28px; font-weight:600; letter-spacing:-0.02em; line-height:1.25; font-variant-numeric:tabular-nums; }
  .dp-kpi-foot { font-size:12px; color:var(--v2-fg-3); }
  .dp-sw { width:8px; height:8px; border-radius:2px; display:inline-block; flex-shrink:0; }

  .dp-subnav { display:flex; gap:2px; padding:4px; background:var(--v2-surface-2); border:1px solid var(--v2-line); border-radius:8px; width:fit-content; max-width:100%; flex-wrap:wrap; }
  .dp-subnav button { display:inline-flex; align-items:center; gap:8px; border:1px solid transparent; background:transparent; padding:6px 14px; border-radius:6px; font:500 13px var(--font-ui); color:var(--v2-fg-3); cursor:pointer; }
  .dp-subnav button:hover { color:var(--v2-fg); background:var(--v2-hover); }
  .dp-subnav button[aria-selected="true"] { background:var(--v2-surface); color:var(--v2-fg); border-color:var(--v2-line); }
  .dp-subnav .n { font:500 12px var(--font-data); color:var(--v2-fg-3); }

  .dp-panel { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; min-width:0; }
  .dp-tbar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding:12px 18px; border-bottom:1px solid var(--v2-line); }
  .dp-tbar > b { font-size:14px; font-weight:600; margin-right:4px; }
  .dp-tbar > b span { font-weight:400; font-size:13px; color:var(--v2-fg-3); }
  .dp-seg { display:inline-flex; padding:3px; gap:2px; background:var(--v2-bg); border:1px solid var(--v2-line); border-radius:8px; }
  .dp-seg button { border:0; background:transparent; padding:4px 12px; border-radius:5px; font-size:13px; color:var(--v2-fg-2); cursor:pointer; font-family:inherit; }
  .dp-seg button[aria-pressed="true"] { background:var(--v2-surface-2); color:var(--v2-fg); font-weight:500; box-shadow:inset 0 0 0 1px var(--v2-line); }
  .dp-select { height:32px; border:1px solid var(--v2-line); background:var(--v2-bg); color:var(--v2-fg); border-radius:8px; font:13px var(--font-ui); padding:0 10px; max-width:240px; }
  .dp-search { display:inline-flex; align-items:center; gap:8px; height:32px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg-3); width:260px; max-width:100%; margin-left:auto; }
  .dp-search input { flex:1; min-width:0; border:0; outline:none; background:transparent; color:var(--v2-fg); font-size:13px; font-family:inherit; }
  .dp-empty { padding:36px 16px; text-align:center; color:var(--v2-fg-3); font-size:13px; }
  .dp-foot { margin:0; padding:10px 18px; font-size:12.5px; color:var(--v2-fg-3); border-top:1px solid var(--v2-line); }

  .dp-scroll { overflow:auto; max-height:600px; }
  .dp-table { width:100%; border-collapse:collapse; font-size:13px; }
  .dp-table thead { position:sticky; top:0; z-index:1; }
  .dp-table th { padding:9px 12px; font-size:12px; font-weight:500; color:var(--v2-fg-3); text-align:left; background:var(--v2-surface); border-bottom:1px solid var(--v2-line); white-space:nowrap; }
  .dp-table td { padding:8px 12px; height:48px; border-bottom:1px solid var(--v2-line); vertical-align:middle; }
  .dp-table th:first-child, .dp-table td:first-child { padding-left:18px; }
  .dp-table th:last-child, .dp-table td:last-child { padding-right:18px; }
  .dp-table tbody tr:hover td { background:var(--v2-hover); }
  .dp-table tbody tr.click { cursor:pointer; }
  .dp-table tbody tr:last-child td { border-bottom:none; }
  .dp-table td.nm b { display:block; font-weight:500; }
  .dp-table td.nm small { display:block; font-size:12px; color:var(--v2-fg-3); max-width:360px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .dp-bar { display:grid; grid-template-columns:minmax(40px, 90px) 34px; gap:8px; align-items:center; font:500 12.5px var(--font-data); }
  .dp-bar .tr { height:6px; border-radius:99px; background:var(--v2-surface-2); overflow:hidden; }
  .dp-bar .tr i { display:block; height:100%; border-radius:99px; background:var(--v2-accent); }
  .dp-chips { display:flex; gap:4px; flex-wrap:wrap; align-items:center; }
  .dp-echip { display:inline-flex; align-items:center; gap:5px; height:22px; padding:0 8px; border-radius:5px; background:var(--v2-surface-2); border:1px solid var(--v2-line); font:400 11.5px var(--font-data); color:var(--v2-fg-2); white-space:nowrap; }
  .dp-echip button { border:0; background:none; color:var(--v2-fg-3); cursor:pointer; padding:0; display:grid; }
  .dp-echip button:hover { color:var(--v2-crit); }
  .dp-more { font-size:12px; color:var(--v2-fg-3); }
  .dp-pill { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; white-space:nowrap; background:color-mix(in oklch, var(--c) 14%, transparent); color:color-mix(in oklch, var(--c) 72%, var(--v2-fg)); }
  .dp-pill::before { content:""; width:6px; height:6px; border-radius:50%; background:var(--c); }
  .dp-row-act { display:flex; justify-content:flex-end; gap:2px; }
  .dp-icon-btn { display:grid; place-items:center; width:30px; height:30px; border-radius:8px; border:0; background:transparent; color:var(--v2-fg-2); cursor:pointer; }
  .dp-icon-btn:hover { background:var(--v2-hover); color:var(--v2-fg); }
  .dp-icon-btn.danger:hover { color:var(--v2-crit); background:color-mix(in oklch, var(--v2-crit) 12%, transparent); }
  .dp-av { width:28px; height:28px; border-radius:50%; display:grid; place-items:center; font:600 11px var(--font-ui); background:color-mix(in oklch, var(--v2-accent) 16%, transparent); color:var(--v2-accent); flex:none; }
  .dp-who { display:flex; align-items:center; gap:10px; }
  .dp-who b { display:block; font-weight:500; }
  .dp-who small { display:block; font:400 12px var(--font-data); color:var(--v2-fg-3); }
  .dp-plist { display:grid; max-height:340px; overflow-y:auto; }
  .dp-plist > div { display:grid; grid-template-columns:28px minmax(0, 1fr) auto; gap:10px; align-items:center; padding:6px 0; border-bottom:1px solid var(--v2-line); font-size:13px; }
  .dp-plist > div:last-child { border-bottom:0; }
  .dp-plist small { display:block; font-size:12px; color:var(--v2-fg-3); overflow:hidden; text-overflow:ellipsis; }
  .dp-plist .c { font-size:12px; color:var(--v2-fg-3); }
  .dp-callout { display:flex; gap:10px; padding:10px 12px; border-radius:8px; font-size:12.5px; line-height:1.5; color:var(--v2-fg-2); background:color-mix(in oklch, var(--v2-med) 10%, transparent); border:1px solid color-mix(in oklch, var(--v2-med) 35%, transparent); }
  .dp-callout svg { color:var(--v2-med); flex-shrink:0; margin-top:2px; }

  .dp-form { display:grid; gap:14px; padding-top:4px; font-family:var(--font-ui); color:var(--v2-fg); }
  .dp-row2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  @media (max-width: 560px) { .dp-row2 { grid-template-columns:1fr; } }
  .dp-field { display:grid; gap:6px; align-content:start; }
  .dp-field label { font-size:12.5px; font-weight:500; color:var(--v2-fg-2); }
  .dp-field small { font-size:12px; color:var(--v2-fg-3); }
  .dp-input { width:100%; height:34px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg); font-size:13px; font-family:inherit; outline:none; }
  .dp-input:focus { border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }
`;

function EmailEditor({
  emails,
  onChange,
  disabled,
}: {
  emails: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = React.useState("");

  const add = () => {
    const candidates = splitEmails(draft);
    if (candidates.length === 0) return;
    const invalid = candidates.find((c) => !isValidEmail(c));
    if (invalid) {
      toast.error(`E-mail inválido: ${invalid}`);
      return;
    }
    const merged = Array.from(new Set([...emails, ...candidates]));
    if (merged.length > 20) {
      toast.error("Máximo de 20 e-mails por departamento");
      return;
    }
    onChange(merged);
    setDraft("");
  };

  return (
    <div className="dp-field">
      <label htmlFor="dp-email-draft">E-mails de contato</label>
      <div style={{ display: "flex", gap: 8 }}>
        <input
          id="dp-email-draft"
          className="dp-input"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="email@dominio.com (vírgula para vários)"
          disabled={disabled}
          maxLength={500}
        />
        <button type="button" className="dp-btn" onClick={add} disabled={disabled}>
          <Plus size={14} /> Adicionar
        </button>
      </div>
      <small>Até 20 e-mails. Enter ou vírgula adiciona.</small>
      {emails.length > 0 && (
        <div className="dp-chips" style={{ marginTop: 4 }}>
          {emails.map((e) => (
            <span key={e} className="dp-echip">
              {e}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => onChange(emails.filter((x) => x !== e))}
                  aria-label={`Remover ${e}`}
                >
                  <X size={11} />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function DepartamentosDashboard() {
  const qc = useQueryClient();
  const { can, isModuleAdmin, isAdmin } = usePermissions();

  const canCreate =
    isAdmin || isModuleAdmin(MODULE) || can(MODULE, "create") || can(MODULE, "manage");
  const canEdit = isAdmin || isModuleAdmin(MODULE) || can(MODULE, "edit") || can(MODULE, "manage");
  const canDelete =
    isAdmin || isModuleAdmin(MODULE) || can(MODULE, "delete") || can(MODULE, "manage");

  const fetchDepartments = useServerFn(listDepartments);
  const fnCreate = useServerFn(createDepartment);
  const fnUpdate = useServerFn(updateDepartment);
  const fnDelete = useServerFn(deleteDepartment);

  const [tab, setTab] = React.useState<"deps" | "cols">("deps");
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<DepartmentRow | null>(null);
  const [detail, setDetail] = React.useState<DepartmentRow | null>(null);
  const [confirmDel, setConfirmDel] = React.useState<DepartmentRow | null>(null);
  const [onlyNoMail, setOnlyNoMail] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const [colDeptFilter, setColDeptFilter] = React.useState("");
  const [colCreateOpen, setColCreateOpen] = React.useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["departments-admin"],
    queryFn: async () => (await fetchDepartments()).departments,
  });
  const { rows: colabs, isLoading: colLoading } = useVisibleColaboradores();

  // Aprovadores do departamento a remover: sem FK, ficariam apontando para um
  // departamento inexistente — avisa na confirmação.
  const fetchDeptApprovers = useServerFn(listAprovadoresOfDepartment);
  const deptApprovers = useQuery({
    queryKey: ["dept-approvers", confirmDel?.id],
    queryFn: () => fetchDeptApprovers({ data: { departmentId: confirmDel!.id } }),
    enabled: !!confirmDel,
    retry: false,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["departments-admin"] });
    qc.invalidateQueries({ queryKey: ["departments"] });
  };

  const save = useMutation({
    mutationFn: (p: {
      id: string | null;
      name: string;
      description: string | null;
      emails: string[];
    }) =>
      p.id
        ? fnUpdate({
            data: { id: p.id, name: p.name, description: p.description, emails: p.emails },
          })
        : fnCreate({ data: { name: p.name, description: p.description, emails: p.emails } }),
    onSuccess: (_r, p) => {
      toast.success(p.id ? "Departamento atualizado" : "Departamento criado");
      setFormOpen(false);
      setEditing(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => fnDelete({ data: { id } }),
    onSuccess: () => {
      toast.success("Departamento removido");
      setConfirmDel(null);
      setDetail(null);
      invalidate();
      qc.invalidateQueries({ queryKey: ["colaboradores"] });
    },
    onError: (e: Error) =>
      toast.error(
        /foreign key|violates|restrict/i.test(e.message)
          ? "Há aplicações vinculadas a este departamento. Troque-as de departamento antes de remover."
          : e.message,
      ),
  });

  const deps = React.useMemo(() => data ?? [], [data]);
  const countByDept = React.useMemo(() => {
    const m = new Map<string, number>();
    colabs.forEach(
      (c) => c.department_id && m.set(c.department_id, (m.get(c.department_id) ?? 0) + 1),
    );
    return m;
  }, [colabs]);

  if (isLoading || colLoading) return <ModuleLoading />;

  const noMail = deps.filter((d) => d.emails.length === 0).length;
  const noDept = colabs.filter((c) => !c.department_id).length;
  const units = new Set(colabs.map((c) => c.unidade).filter(Boolean)).size;
  const maxCount = Math.max(1, ...deps.map((d) => countByDept.get(d.id) ?? 0));
  const q = search.trim().toLowerCase();
  const filteredDeps = deps.filter(
    (d) =>
      (!onlyNoMail || d.emails.length === 0) &&
      (!q || `${d.name} ${d.description ?? ""} ${d.emails.join(" ")}`.toLowerCase().includes(q)),
  );
  const detailPeople = detail ? colabs.filter((c) => c.department_id === detail.id) : [];

  const openEdit = (d: DepartmentRow) => {
    setDetail(null);
    setEditing(d);
    setFormOpen(true);
  };

  return (
    <div className="dp-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Cabeçalho ──────────────────────────────────────────────────── */}
      <div className="dp-ph">
        <div>
          <h1 className="dp-ph-title">Departamentos</h1>
          <p className="dp-ph-sub">
            Áreas da empresa, seus e-mails de contato e os colaboradores de cada uma
          </p>
        </div>
        {canCreate &&
          (tab === "deps" ? (
            <button
              className="dp-btn primary"
              onClick={() => {
                setEditing(null);
                setFormOpen(true);
              }}
            >
              <Plus size={14} /> Novo departamento
            </button>
          ) : (
            <button className="dp-btn primary" onClick={() => setColCreateOpen(true)}>
              <Plus size={14} /> Novo colaborador
            </button>
          ))}
      </div>

      {/* ── KPIs ───────────────────────────────────────────────────────── */}
      <div className="dp-kpis">
        <div className="dp-kpi">
          <span className="dp-kpi-label">Departamentos</span>
          <span className="dp-kpi-value">{deps.length}</span>
          <span className="dp-kpi-foot">cadastrados</span>
        </div>
        <div className="dp-kpi">
          <span className="dp-kpi-label">Colaboradores</span>
          <span className="dp-kpi-value">{colabs.length}</span>
          <span className="dp-kpi-foot">
            {units ? `em ${units} unidade${units > 1 ? "s" : ""}` : "cadastrados"}
          </span>
        </div>
        <button
          type="button"
          className="dp-kpi"
          aria-pressed={tab === "deps" && onlyNoMail}
          onClick={() => {
            setTab("deps");
            setOnlyNoMail((v) => !(tab === "deps" && v));
          }}
        >
          <span className="dp-kpi-label">
            {noMail > 0 && <span className="dp-sw" style={{ background: "var(--v2-med)" }} />}
            Sem e-mail de contato
          </span>
          <span className="dp-kpi-value">{noMail}</span>
          <span className="dp-kpi-foot">departamentos sem e-mail cadastrado</span>
        </button>
        <button
          type="button"
          className="dp-kpi"
          aria-pressed={tab === "cols" && colDeptFilter === NO_DEPT}
          onClick={() => {
            setTab("cols");
            setColDeptFilter((v) => (tab === "cols" && v === NO_DEPT ? "" : NO_DEPT));
          }}
        >
          <span className="dp-kpi-label">
            {noDept > 0 && <span className="dp-sw" style={{ background: "var(--v2-med)" }} />}
            Colaboradores sem departamento
          </span>
          <span className="dp-kpi-value">{noDept}</span>
          <span className="dp-kpi-foot">ficam de fora de relatórios por área</span>
        </button>
      </div>

      <div className="dp-subnav" role="tablist" aria-label="Seções">
        <button
          type="button"
          role="tab"
          aria-selected={tab === "deps"}
          onClick={() => setTab("deps")}
        >
          Departamentos <span className="n">{deps.length}</span>
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={tab === "cols"}
          onClick={() => setTab("cols")}
        >
          Colaboradores <span className="n">{colabs.length}</span>
        </button>
      </div>

      <div className="dp-panel">
        {tab === "cols" ? (
          <ColaboradoresPanel
            rows={colabs}
            deptFilter={colDeptFilter}
            onDeptFilter={setColDeptFilter}
            createOpen={colCreateOpen}
            onCreateOpenChange={setColCreateOpen}
          />
        ) : (
          <>
            <div className="dp-tbar">
              <b>
                Departamentos{" "}
                <span>
                  (
                  {filteredDeps.length === deps.length
                    ? deps.length
                    : `${filteredDeps.length} de ${deps.length}`}
                  )
                </span>
              </b>
              <div className="dp-seg" role="group" aria-label="Filtro">
                <button
                  type="button"
                  aria-pressed={!onlyNoMail}
                  onClick={() => setOnlyNoMail(false)}
                >
                  Todos
                </button>
                <button type="button" aria-pressed={onlyNoMail} onClick={() => setOnlyNoMail(true)}>
                  Sem e-mail
                </button>
              </div>
              <label className="dp-search">
                <Search size={14} />
                <input
                  placeholder="Buscar nome, descrição ou e-mail"
                  aria-label="Buscar departamentos"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
            </div>
            {filteredDeps.length === 0 ? (
              <div className="dp-empty">
                {deps.length === 0
                  ? "Nenhum departamento cadastrado."
                  : "Nenhum departamento com esses filtros."}
              </div>
            ) : (
              <div className="dp-scroll">
                <table className="dp-table">
                  <thead>
                    <tr>
                      <th>Departamento</th>
                      <th>Colaboradores</th>
                      <th>E-mails de contato</th>
                      <th>Criado em</th>
                      {(canEdit || canDelete) && (
                        <th>
                          <span style={{ fontSize: 0 }}>Ações</span>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredDeps.map((d) => {
                      const n = countByDept.get(d.id) ?? 0;
                      return (
                        <tr
                          key={d.id}
                          className="click"
                          tabIndex={0}
                          onClick={() => setDetail(d)}
                          onKeyDown={(e) => e.key === "Enter" && setDetail(d)}
                        >
                          <td className="nm">
                            <b>{d.name}</b>
                            <small>
                              {d.description ?? (
                                <span style={{ fontStyle: "italic" }}>sem descrição</span>
                              )}
                            </small>
                          </td>
                          <td>
                            <div className="dp-bar">
                              <span className="tr">
                                <i style={{ width: `${(n / maxCount) * 100}%` }} />
                              </span>
                              <span>{n}</span>
                            </div>
                          </td>
                          <td>
                            {d.emails.length === 0 ? (
                              <span
                                className="dp-pill"
                                style={{ "--c": "var(--v2-med)" } as React.CSSProperties}
                              >
                                Sem e-mail
                              </span>
                            ) : (
                              <div className="dp-chips">
                                {d.emails.slice(0, 2).map((e) => (
                                  <span key={e} className="dp-echip">
                                    {e}
                                  </span>
                                ))}
                                {d.emails.length > 2 && (
                                  <span className="dp-more" title={d.emails.slice(2).join("\n")}>
                                    +{d.emails.length - 2}
                                  </span>
                                )}
                              </div>
                            )}
                          </td>
                          <td className="dp-mono dp-dim">{fmtDate(d.created_at)}</td>
                          {(canEdit || canDelete) && (
                            <td onClick={(e) => e.stopPropagation()}>
                              <div className="dp-row-act">
                                {canEdit && (
                                  <button
                                    className="dp-icon-btn"
                                    title="Editar"
                                    aria-label="Editar"
                                    onClick={() => openEdit(d)}
                                  >
                                    <Pencil size={14} />
                                  </button>
                                )}
                                {canDelete && (
                                  <button
                                    className="dp-icon-btn danger"
                                    title="Remover"
                                    aria-label="Remover"
                                    onClick={() => setConfirmDel(d)}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Detalhe do departamento ── */}
      <DetailSheet
        open={!!detail}
        onOpenChange={(o) => !o && setDetail(null)}
        eyebrow={detail ? `criado em ${fmtDate(detail.created_at)}` : ""}
        title={detail?.name ?? ""}
        width={560}
        footer={
          detail && (
            <>
              {canDelete && (
                <button
                  className="dp-btn danger-ghost"
                  style={{ marginRight: "auto" }}
                  onClick={() => {
                    setConfirmDel(detail);
                    setDetail(null);
                  }}
                >
                  <Trash2 size={14} /> Remover
                </button>
              )}
              <button
                className="dp-btn"
                onClick={() => {
                  setTab("cols");
                  setColDeptFilter(detail.id);
                  setDetail(null);
                }}
              >
                Ver na lista de colaboradores
              </button>
              {canEdit && (
                <button className="dp-btn primary" onClick={() => openEdit(detail)}>
                  <Pencil size={14} /> Editar
                </button>
              )}
            </>
          )
        }
      >
        {detail && (
          <>
            <DetailSection title="Descrição">
              <p style={{ margin: 0, fontSize: 13, color: "var(--v2-fg-2)" }}>
                {detail.description ?? <span className="dp-dim">Sem descrição.</span>}
              </p>
            </DetailSection>
            <DetailSection title={`E-mails de contato (${detail.emails.length})`}>
              {detail.emails.length ? (
                <div className="dp-chips">
                  {detail.emails.map((e) => (
                    <span key={e} className="dp-echip">
                      <Mail size={12} /> {e}
                    </span>
                  ))}
                </div>
              ) : (
                <div className="dp-callout">
                  <AlertTriangle size={15} />
                  <span>
                    Nenhum e-mail cadastrado: avisos endereçados ao departamento não têm para quem
                    ir.
                  </span>
                </div>
              )}
            </DetailSection>
            <DetailSection title={`Colaboradores (${detailPeople.length})`}>
              {detailPeople.length ? (
                <div className="dp-plist">
                  {detailPeople.map((c) => (
                    <div key={c.id}>
                      <span className="dp-av">{initials(c.display_name)}</span>
                      <span style={{ minWidth: 0 }}>
                        {c.display_name}
                        <small>{c.email}</small>
                      </span>
                      <span className="c">{c.cargo ?? ""}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="dp-dim" style={{ margin: 0, fontSize: 13 }}>
                  Nenhum colaborador neste departamento.
                </p>
              )}
            </DetailSection>
          </>
        )}
      </DetailSheet>

      <DepartmentDialog
        open={formOpen}
        dept={editing}
        saving={save.isPending}
        onClose={() => {
          setFormOpen(false);
          setEditing(null);
        }}
        onSave={(p) => save.mutate(p)}
      />

      <Dialog open={!!confirmDel} onOpenChange={(o) => !o && setConfirmDel(null)}>
        <DialogContent className="font-ui sm:max-w-md" style={dialogStyle}>
          <DialogHeader>
            <DialogTitle style={{ fontSize: 16, fontWeight: 600 }}>
              Remover departamento?
            </DialogTitle>
          </DialogHeader>
          {confirmDel && (
            <p style={{ margin: 0, fontSize: 13.5, color: "var(--v2-fg-2)", lineHeight: 1.55 }}>
              <b style={{ color: "var(--v2-fg)" }}>{confirmDel.name}</b> será removido.
              {(countByDept.get(confirmDel.id) ?? 0) > 0 &&
                ` ${countByDept.get(confirmDel.id)} colaborador${(countByDept.get(confirmDel.id) ?? 0) > 1 ? "es ficam" : " fica"} sem departamento.`}{" "}
              Se houver aplicações vinculadas a ele, a remoção é bloqueada até trocá-las de
              departamento. Não dá para desfazer.
            </p>
          )}
          {confirmDel && (deptApprovers.data?.length ?? 0) > 0 && (
            <div className="dp-callout">
              <AlertTriangle size={15} />
              <span>
                <b style={{ color: "var(--v2-fg)", fontWeight: 600 }}>
                  {deptApprovers.data!.length === 1
                    ? "1 aprovador de GMUD está neste departamento"
                    : `${deptApprovers.data!.length} aprovadores de GMUD estão neste departamento`}
                </b>{" "}
                ({deptApprovers.data!.map((a) => a.nome).join(", ")}). Depois da remoção,{" "}
                {deptApprovers.data!.length === 1
                  ? "ele continua cadastrado sem departamento e deixa de ser chamado nas GMUDs"
                  : "eles continuam cadastrados sem departamento e deixam de ser chamados nas GMUDs"}
                . Se for o caso, mova ou remova antes em{" "}
                <Link
                  to="/app/$module"
                  params={{ module: "aprovadores" }}
                  style={{ color: "var(--v2-accent)", textDecoration: "underline" }}
                >
                  Aprovadores
                </Link>
                .
              </span>
            </div>
          )}
          <DialogFooter style={{ gap: 8 }}>
            <button
              className="dp-btn ghost"
              onClick={() => setConfirmDel(null)}
              disabled={remove.isPending}
            >
              Cancelar
            </button>
            <button
              className="dp-btn danger"
              disabled={remove.isPending || deptApprovers.isLoading}
              onClick={() => confirmDel && remove.mutate(confirmDel.id)}
            >
              {remove.isPending && <Loader2 size={13} className="animate-spin" />} Remover
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function DepartmentDialog({
  open,
  dept,
  saving,
  onClose,
  onSave,
}: {
  open: boolean;
  dept: DepartmentRow | null;
  saving: boolean;
  onClose: () => void;
  onSave: (p: {
    id: string | null;
    name: string;
    description: string | null;
    emails: string[];
  }) => void;
}) {
  const [name, setName] = React.useState("");
  const [desc, setDesc] = React.useState("");
  const [emails, setEmails] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (open) {
      setName(dept?.name ?? "");
      setDesc(dept?.description ?? "");
      setEmails(dept?.emails ?? []);
    }
  }, [open, dept]);

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        className="font-ui sm:max-w-lg max-h-[90dvh] overflow-y-auto"
        style={dialogStyle}
      >
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <DialogHeader>
          <DialogTitle style={{ fontSize: 16, fontWeight: 600 }}>
            {dept ? "Editar departamento" : "Novo departamento"}
          </DialogTitle>
        </DialogHeader>
        <form
          className="dp-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim())
              onSave({
                id: dept?.id ?? null,
                name: name.trim(),
                description: desc.trim() || null,
                emails,
              });
          }}
        >
          <div className="dp-row2">
            <div className="dp-field">
              <label htmlFor="dp-name">Nome</label>
              <input
                id="dp-name"
                className="dp-input"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={120}
                required
              />
            </div>
            <div className="dp-field">
              <label htmlFor="dp-desc">Descrição</label>
              <input
                id="dp-desc"
                className="dp-input"
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                maxLength={255}
                placeholder="Opcional"
              />
            </div>
          </div>
          <EmailEditor emails={emails} onChange={setEmails} />
          <DialogFooter style={{ gap: 8, paddingTop: 4 }}>
            <button type="button" className="dp-btn ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="dp-btn primary" disabled={saving || !name.trim()}>
              {saving && <Loader2 size={13} className="animate-spin" />} {dept ? "Salvar" : "Criar"}
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
