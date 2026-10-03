import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, GraduationCap, Loader2, Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { usePermissions } from "@/lib/use-permissions";
import { listPolicies, createPolicy, updatePolicy, deletePolicy } from "@/lib/policies.functions";
import { getAdesaoPoliticas } from "@/lib/treinamentos.functions";
import { DetailList, DetailSection, DetailSheet } from "@/components/layout/DetailSheet";

const STATUSES = ["Publicada", "Em Validação", "Revisão"] as const;
type Status = (typeof STATUSES)[number];
type Tipo = "Política" | "Processo";
const TRAININGS_URL = "/app/treinamentos";
const META_TREINAMENTO = 80;
const REVISAO_ALERTA_DIAS = 60;

type Policy = {
  id: string;
  name: string;
  status: Status;
  tipo?: Tipo | null;
  onda: string | null;
  indicador: string | null;
  publicacao: string | null;
  revisao: string | null;
  trained_count: number;
  target_count: number;
};

/** Espelha PolicyPatch / PolicyInput de policies.functions.ts (os schemas não são exportados). */
type PolicyPatch = Partial<{
  name: string;
  status: Status;
  tipo: Tipo;
  onda: string | null;
  indicador: string | null;
  publicacao: string | null;
  revisao: string | null;
  trained_count: number;
  target_count: number;
}>;
type PolicyCreate = Required<
  Pick<PolicyPatch, "name" | "status" | "tipo" | "trained_count" | "target_count">
> &
  Pick<PolicyPatch, "onda" | "indicador" | "publicacao" | "revisao">;

function fmtDate(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("T")[0].split("-");
  return `${day}/${m}/${y}`;
}
function parseIso(d: string) {
  const [y, m, day] = d.split("T")[0].split("-").map(Number);
  return new Date(y, m - 1, day);
}
/** Dias até a data (negativo = já passou). */
function daysUntil(d: string) {
  const t = new Date();
  const today = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  return Math.round((parseIso(d).getTime() - today.getTime()) / 86_400_000);
}
const pctOf = (p: Policy) =>
  p.target_count > 0 ? Math.round((p.trained_count * 100) / p.target_count) : null;
const toneOf = (v: number | null) =>
  v === null
    ? "var(--v2-fg-3)"
    : v >= 80
      ? "var(--v2-ok)"
      : v >= 50
        ? "var(--v2-med)"
        : "var(--v2-crit)";
const ST_CLS: Record<Status, string> = {
  Publicada: "ok",
  "Em Validação": "med",
  Revisão: "accent",
};
const tipoOf = (p: Policy): Tipo => p.tipo ?? "Política";
const errMsg = (e: unknown, fb: string) => (e instanceof Error ? e.message : fb);

const emptyForm = {
  name: "",
  status: "Revisão" as Status,
  tipo: "Política" as Tipo,
  indicador: "",
  publicacao: "",
  revisao: "",
  trained_count: 0,
  target_count: 0,
};

// ── CSS (interface v2) ─────────────────────────────────────────────────────────
const CSS = `
  .pol-root { font-family:var(--font-ui); color:var(--v2-fg); display:flex; flex-direction:column; gap:20px; font-size:14px; }
  .pol-root * { box-sizing:border-box; }
  .pol-root ::-webkit-scrollbar { width:6px; height:6px; }
  .pol-root ::-webkit-scrollbar-thumb { background:var(--v2-line-strong); border-radius:3px; }
  .pol-root :focus-visible { outline:2px solid var(--v2-accent); outline-offset:2px; }
  .pol-root .mono, .pol-sheet .mono { font-family:var(--font-data); font-size:12.5px; }
  .pol-root .dim { color:var(--v2-fg-3); }
  @keyframes pol-spin { to{transform:rotate(360deg)} }
  .pol-spin { animation:pol-spin .8s linear infinite; }

  .pol-ph { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  .pol-ph-title { font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.2; margin:0; }
  .pol-ph-sub { margin:4px 0 0; font-size:13px; color:var(--v2-fg-3); }
  .pol-ph-actions { display:flex; gap:8px; flex-wrap:wrap; }

  /* KPIs */
  .pol-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
  .pol-kpi { position:relative; text-align:left; border:0; background:transparent; padding:16px 18px 14px; display:grid; gap:2px; align-content:start; box-shadow:1px 0 0 var(--v2-line), 0 1px 0 var(--v2-line); color:inherit; font-family:inherit; min-width:0; }
  button.pol-kpi { cursor:pointer; }
  button.pol-kpi:hover { background:var(--v2-hover); }
  .pol-kpi[aria-pressed="true"] { background:color-mix(in oklch, var(--v2-accent) 14%, transparent); }
  .pol-kpi-label { font-size:12.5px; color:var(--v2-fg-2); display:flex; align-items:center; gap:6px; }
  .pol-kpi-value { font-size:28px; font-weight:600; letter-spacing:-0.02em; line-height:1.25; font-variant-numeric:tabular-nums; }
  .pol-kpi-value small { font-size:15px; font-weight:500; color:var(--v2-fg-3); margin-left:4px; }
  .pol-kpi-foot { font-size:12px; color:var(--v2-fg-3); }
  .pol-sw { width:8px; height:8px; border-radius:2px; display:inline-block; flex-shrink:0; }
  .pol-stack { display:flex; height:8px; border-radius:99px; overflow:hidden; gap:2px; margin:8px 0 4px; background:var(--v2-surface-2); }
  .pol-stack i { display:block; height:100%; }
  .pol-meter { height:6px; border-radius:99px; background:var(--v2-surface-2); overflow:hidden; margin:6px 0 2px; }
  .pol-meter i { display:block; height:100%; border-radius:99px; }

  /* Grade */
  .pol-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:20px; align-items:stretch; }
  .pol-span-2 { grid-column:span 2; }
  .pol-card { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; min-width:0; overflow:hidden; }
  .pol-fit { height:0; min-height:100%; display:flex; flex-direction:column; }
  .pol-fit .pol-card-body { flex:1; min-height:0; overflow-y:auto; }
  @media (max-width: 1100px) { .pol-grid { grid-template-columns:minmax(0, 1fr); } .pol-span-2 { grid-column:auto; } .pol-fit { height:auto; min-height:0; max-height:420px; } }
  .pol-card-hdr { padding:14px 18px 4px; }
  .pol-card-title { font-size:14px; font-weight:600; margin:0; }
  .pol-card-sub { margin:2px 0 0; font-size:12.5px; color:var(--v2-fg-3); }
  .pol-card-body { padding:12px 18px 16px; }
  .pol-empty { padding:28px 16px; text-align:center; color:var(--v2-fg-3); font-size:13px; }

  /* Adesão por documento */
  .pol-adh { display:grid; gap:6px; }
  .pol-adh button { display:grid; grid-template-columns:minmax(0, 220px) minmax(0, 1fr) 100px; gap:12px; align-items:center; padding:6px 8px; margin:0 -8px; border:0; border-radius:8px; background:transparent; color:var(--v2-fg); text-align:left; font-size:13px; cursor:pointer; font-family:inherit; }
  .pol-adh button:hover { background:var(--v2-hover); }
  .pol-adh .nm { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .pol-adh .bar { position:relative; height:10px; border-radius:99px; background:var(--v2-surface-2); }
  .pol-adh .bar i { display:block; height:100%; border-radius:99px; }
  .pol-adh .bar .goal { position:absolute; top:-3px; bottom:-3px; border-left:1.5px dashed var(--v2-fg-3); }
  .pol-adh .v { font:500 12.5px var(--font-data); text-align:right; white-space:nowrap; }
  .pol-adh .v small { color:var(--v2-fg-3); font-weight:400; }
  @media (max-width: 640px) { .pol-adh button { grid-template-columns:minmax(0, 1fr) 96px; } .pol-adh .bar { grid-column:1 / -1; grid-row:2; } }
  .pol-legend { display:flex; gap:14px; flex-wrap:wrap; font-size:12px; color:var(--v2-fg-3); margin-top:12px; }
  .pol-legend span { display:inline-flex; align-items:center; gap:6px; }

  /* Agenda de revisão */
  .pol-agenda { display:grid; }
  .pol-agenda button { display:grid; grid-template-columns:minmax(0, 1fr) auto; gap:2px 10px; align-items:center; padding:9px 8px; margin:0 -8px; border:0; border-radius:8px; background:transparent; text-align:left; color:var(--v2-fg); cursor:pointer; font-family:inherit; }
  .pol-agenda button:hover { background:var(--v2-hover); }
  .pol-agenda b { font-weight:500; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .pol-agenda small { grid-column:1; font-size:12px; color:var(--v2-fg-3); }
  .pol-agenda .when { grid-row:span 2; }
  .pol-sub-h { font-size:12px; font-weight:500; color:var(--v2-fg-3); margin:14px 0 2px; display:flex; align-items:center; gap:6px; }
  .pol-sub-h:first-child { margin-top:0; }

  /* Pílulas */
  .pol-tag, .pol-days { display:inline-flex; align-items:center; gap:5px; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; white-space:nowrap; --c:var(--v2-fg-3); background:color-mix(in oklch, var(--c) 14%, transparent); color:color-mix(in oklch, var(--c) 72%, var(--v2-fg)); }
  .pol-days { font-family:var(--font-data); }
  .pol-tag svg, .pol-days svg { color:var(--c); }
  .pol-tag.ok { --c:var(--v2-ok); } .pol-tag.med, .pol-days.warn { --c:var(--v2-med); } .pol-tag.accent { --c:var(--v2-accent); }
  .pol-tag.proc { --c:#9085e9; } .pol-days.crit { --c:var(--v2-crit); }

  /* Tabela */
  .pol-toolbar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:12px 18px; border-bottom:1px solid var(--v2-line); }
  .pol-toolbar > b { font-size:14px; font-weight:600; }
  .pol-count { font-weight:400; font-size:13px; color:var(--v2-fg-3); }
  .pol-seg { display:inline-flex; padding:3px; gap:2px; background:var(--v2-bg); border:1px solid var(--v2-line); border-radius:8px; flex-wrap:wrap; }
  .pol-seg button { border:0; background:transparent; padding:4px 12px; border-radius:5px; font-size:13px; color:var(--v2-fg-2); cursor:pointer; font-family:inherit; }
  .pol-seg button[aria-pressed="true"] { background:var(--v2-surface-2); color:var(--v2-fg); font-weight:500; box-shadow:inset 0 0 0 1px var(--v2-line); }
  .pol-search { display:inline-flex; align-items:center; gap:8px; height:32px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg-3); width:260px; max-width:100%; margin-left:auto; }
  .pol-search:focus-within { border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }
  .pol-search input { flex:1; min-width:0; border:0; outline:none; background:transparent; color:var(--v2-fg); font-size:13px; font-family:inherit; }
  .pol-scroll { overflow:auto; max-height:620px; }
  .pol-table { width:100%; border-collapse:collapse; font-size:13px; }
  .pol-table thead { position:sticky; top:0; z-index:1; }
  .pol-table th { padding:9px 12px; font-size:12px; font-weight:500; color:var(--v2-fg-3); text-align:left; background:var(--v2-surface); border-bottom:1px solid var(--v2-line); white-space:nowrap; }
  .pol-table td { padding:8px 12px; height:50px; border-bottom:1px solid var(--v2-line); vertical-align:middle; }
  .pol-table th:first-child, .pol-table td:first-child { padding-left:18px; }
  .pol-table th:last-child, .pol-table td:last-child { padding-right:18px; }
  .pol-table tbody tr { cursor:pointer; }
  .pol-table tbody tr:hover td { background:var(--v2-hover); }
  .pol-table tbody tr:last-child td { border-bottom:none; }
  .pol-doc b { display:block; font-weight:500; }
  .pol-doc small { font:400 12px var(--font-data); color:var(--v2-fg-3); }
  .pol-tr { display:grid; grid-template-columns:80px auto; gap:8px; align-items:center; }
  .pol-tr .track { height:6px; border-radius:99px; background:var(--v2-surface-2); overflow:hidden; }
  .pol-tr .track i { display:block; height:100%; border-radius:99px; }
  .pol-tr span { font:500 12px var(--font-data); }
  .pol-row-act { display:flex; justify-content:flex-end; gap:2px; }
  .pol-icon-btn { display:grid; place-items:center; width:30px; height:30px; border-radius:8px; border:0; background:transparent; color:var(--v2-fg-2); cursor:pointer; }
  .pol-icon-btn:hover { background:var(--v2-hover); color:var(--v2-fg); }
  .pol-icon-btn.danger:hover { color:var(--v2-crit); background:color-mix(in oklch, var(--v2-crit) 12%, transparent); }

  /* Botões */
  .pol-btn { display:inline-flex; align-items:center; gap:7px; height:32px; padding:0 12px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; font-family:var(--font-ui); white-space:nowrap; border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-fg); text-decoration:none; }
  .pol-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .pol-btn:hover:not(:disabled) { background:var(--v2-hover); }
  .pol-btn.lg { height:34px; padding:0 14px; }
  .pol-btn.primary { background:var(--v2-accent); border-color:var(--v2-accent); color:var(--v2-accent-ink); }
  .pol-btn.primary:hover:not(:disabled) { background:var(--v2-accent); filter:brightness(1.08); }
  .pol-btn.ghost { background:transparent; border-color:transparent; color:var(--v2-fg-2); }
  .pol-btn.danger { background:var(--v2-crit); border-color:var(--v2-crit); color:#fff; }
  .pol-btn.danger:hover:not(:disabled) { background:var(--v2-crit); filter:brightness(1.08); }
  .pol-btn.danger-text { background:transparent; border-color:transparent; color:var(--v2-crit); margin-right:auto; }
  .pol-btn.danger-text:hover:not(:disabled) { background:color-mix(in oklch, var(--v2-crit) 10%, transparent); }

  /* Painel */
  .pol-big { display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; }
  .pol-big b { font-size:28px; font-weight:600; letter-spacing:-0.02em; font-variant-numeric:tabular-nums; }
  .pol-big span { font-size:13px; color:var(--v2-fg-3); }
  .pol-inline { display:grid; grid-template-columns:1fr 1fr auto; gap:8px; align-items:end; margin-top:12px; }
  .pol-inline label { display:grid; gap:4px; font-size:12px; color:var(--v2-fg-2); }
  .pol-p { margin:0; font-size:13px; color:var(--v2-fg-3); }
  .pol-confirm { display:flex; align-items:center; gap:8px; flex-wrap:wrap; width:100%; font-size:13px; }
  .pol-confirm span { margin-right:auto; color:var(--v2-fg-2); }

  /* Formulário */
  .pol-form { display:grid; grid-template-columns:1fr 1fr; gap:14px; padding-top:4px; font-family:var(--font-ui); }
  .pol-form .full { grid-column:1 / -1; }
  @media (max-width: 560px) { .pol-form { grid-template-columns:1fr; } }
  .pol-field { display:grid; gap:6px; min-width:0; }
  .pol-field label { font-size:12.5px; font-weight:500; color:var(--v2-fg-2); }
  .pol-field small { font-size:12px; color:var(--v2-fg-3); }
  .pol-req { color:var(--v2-crit); }
  .pol-input { width:100%; height:34px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg); font-size:13px; font-family:inherit; outline:none; }
  .pol-input:focus { border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }
`;

function RevisaoPill({ revisao }: { revisao: string | null }) {
  if (!revisao) return <span className="dim">—</span>;
  const n = daysUntil(revisao);
  if (n < 0)
    return (
      <span className="pol-days crit">
        <AlertTriangle size={11} /> venceu há {-n} d
      </span>
    );
  if (n <= REVISAO_ALERTA_DIAS) return <span className="pol-days warn">em {n} d</span>;
  return <span className="mono dim">{fmtDate(revisao)}</span>;
}

type FormState = typeof emptyForm;
function PolicyDialog({
  open,
  onOpenChange,
  title,
  form,
  setForm,
  onSubmit,
  pending,
  submitLabel,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  form: FormState;
  setForm: (f: FormState) => void;
  onSubmit: () => void;
  pending: boolean;
  submitLabel: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="font-ui sm:max-w-xl"
        style={{
          background: "var(--v2-surface)",
          border: "1px solid var(--v2-line-strong)",
          borderRadius: 12,
          color: "var(--v2-fg)",
        }}
      >
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <DialogHeader>
          <DialogTitle style={{ fontSize: 16, fontWeight: 600 }}>{title}</DialogTitle>
        </DialogHeader>
        <div className="pol-form">
          <div className="pol-field full">
            <label htmlFor="pol-name">
              Nome <span className="pol-req">*</span>
            </label>
            <input
              id="pol-name"
              className="pol-input"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div className="pol-field">
            <label htmlFor="pol-tipo">Tipo</label>
            <select
              id="pol-tipo"
              className="pol-input"
              value={form.tipo}
              onChange={(e) => setForm({ ...form, tipo: e.target.value as Tipo })}
            >
              <option value="Política">Política</option>
              <option value="Processo">Processo</option>
            </select>
          </div>
          <div className="pol-field">
            <label htmlFor="pol-status">Status</label>
            <select
              id="pol-status"
              className="pol-input"
              value={form.status}
              onChange={(e) => setForm({ ...form, status: e.target.value as Status })}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="pol-field full">
            <label htmlFor="pol-ind">Indicador</label>
            <input
              id="pol-ind"
              className="pol-input"
              value={form.indicador}
              onChange={(e) => setForm({ ...form, indicador: e.target.value })}
              placeholder="Ex.: ISO-A.5.15"
            />
          </div>
          <div className="pol-field">
            <label htmlFor="pol-pub">Publicação</label>
            <input
              id="pol-pub"
              type="date"
              className="pol-input"
              value={form.publicacao}
              onChange={(e) => setForm({ ...form, publicacao: e.target.value })}
            />
          </div>
          <div className="pol-field">
            <label htmlFor="pol-rev">Próxima revisão</label>
            <input
              id="pol-rev"
              type="date"
              className="pol-input"
              value={form.revisao}
              onChange={(e) => setForm({ ...form, revisao: e.target.value })}
            />
          </div>
          <div className="pol-field">
            <label htmlFor="pol-tr">Pessoas treinadas</label>
            <input
              id="pol-tr"
              type="number"
              min={0}
              className="pol-input"
              value={form.trained_count}
              onChange={(e) => setForm({ ...form, trained_count: Number(e.target.value) })}
            />
          </div>
          <div className="pol-field">
            <label htmlFor="pol-tg">Público-alvo</label>
            <input
              id="pol-tg"
              type="number"
              min={0}
              className="pol-input"
              value={form.target_count}
              onChange={(e) => setForm({ ...form, target_count: Number(e.target.value) })}
            />
          </div>
        </div>
        <DialogFooter style={{ gap: 8, paddingTop: 8 }}>
          <button className="pol-btn ghost" onClick={() => onOpenChange(false)} disabled={pending}>
            Cancelar
          </button>
          <button className="pol-btn primary" onClick={onSubmit} disabled={pending}>
            {pending && <Loader2 size={13} className="pol-spin" />} {submitLabel}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PoliticasDashboardImpl() {
  const qc = useQueryClient();
  const { can, isAdmin } = usePermissions();
  const canCreate = isAdmin || can("politicas", "create");
  const canEdit = isAdmin || can("politicas", "edit");
  const canDelete = isAdmin || can("politicas", "delete");

  const listFn = useServerFn(listPolicies);
  const createFn = useServerFn(createPolicy);
  const updateFn = useServerFn(updatePolicy);
  const deleteFn = useServerFn(deletePolicy);

  const { data, isLoading } = useQuery({
    queryKey: ["policies"],
    queryFn: () => listFn(),
  });
  // Políticas com treinamento vinculado no módulo Treinamentos usam as conclusões de lá como adesão
  const adesaoFn = useServerFn(getAdesaoPoliticas);
  const { data: adesao } = useQuery({
    queryKey: ["policies", "adesao-treinamentos"],
    queryFn: () => adesaoFn(),
    retry: false,
  });
  const policies = React.useMemo(
    () =>
      ((data?.policies ?? []) as unknown as Policy[]).map((p) => {
        const a = adesao?.[p.id];
        return a ? { ...p, trained_count: a.trained, target_count: a.target } : p;
      }),
    [data, adesao],
  );

  const invalidate = () => qc.invalidateQueries({ queryKey: ["policies"] });

  const [createOpen, setCreateOpen] = React.useState(false);
  const [form, setForm] = React.useState(emptyForm);
  const [editTarget, setEditTarget] = React.useState<Policy | null>(null);
  const [editForm, setEditForm] = React.useState(emptyForm);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [trainingForm, setTrainingForm] = React.useState({ trained_count: 0, target_count: 0 });
  const [search, setSearch] = React.useState("");
  const [tipoF, setTipoF] = React.useState<Tipo | null>(null);
  const [statusF, setStatusF] = React.useState<Status | null>(null);

  const updateMut = useMutation({
    mutationFn: (vars: { id: string; patch: PolicyPatch }) =>
      updateFn({ data: { id: vars.id, patch: vars.patch } }),
    onSuccess: (_, vars) => {
      invalidate();
      const p = policies.find((x) => x.id === vars.id);
      const tipo = vars.patch?.tipo ?? (p ? tipoOf(p) : "Política");
      toast.success(tipo === "Processo" ? "Processo atualizado" : "Política atualizada");
    },
    onError: (e) => toast.error(errMsg(e, "Erro ao atualizar")),
  });
  const createMut = useMutation({
    mutationFn: (payload: PolicyCreate) => createFn({ data: payload }),
    onSuccess: (_, vars) => {
      invalidate();
      toast.success(vars.tipo === "Processo" ? "Processo criado" : "Política criada");
    },
    onError: (e) => toast.error(errMsg(e, "Erro ao criar")),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: (_, id) => {
      invalidate();
      const p = policies.find((x) => x.id === id);
      toast.success(p && tipoOf(p) === "Processo" ? "Processo excluído" : "Política excluída");
      setOpenId(null);
      setConfirmDelete(false);
    },
    onError: (e) => toast.error(errMsg(e, "Erro ao excluir")),
  });

  const stats = React.useMemo(() => {
    const c = { Publicada: 0, "Em Validação": 0, Revisão: 0 } as Record<Status, number>;
    for (const p of policies) c[p.status] = (c[p.status] ?? 0) + 1;
    const vencidas = policies.filter((p) => p.revisao && daysUntil(p.revisao) < 0);
    const proximas = policies.filter(
      (p) => p.revisao && daysUntil(p.revisao) >= 0 && daysUntil(p.revisao) <= REVISAO_ALERTA_DIAS,
    );
    const trained = policies.reduce((a, p) => a + p.trained_count, 0);
    const target = policies.reduce((a, p) => a + p.target_count, 0);
    return {
      c,
      vencidas,
      proximas,
      trained,
      target,
      adesao: target > 0 ? Math.round((trained * 100) / target) : null,
      politicas: policies.filter((p) => tipoOf(p) === "Política").length,
      processos: policies.filter((p) => tipoOf(p) === "Processo").length,
    };
  }, [policies]);

  const filtered = React.useMemo(() => {
    const s = search.trim().toLowerCase();
    return policies.filter(
      (p) =>
        (!tipoF || tipoOf(p) === tipoF) &&
        (!statusF || p.status === statusF) &&
        (!s || p.name.toLowerCase().includes(s) || (p.indicador ?? "").toLowerCase().includes(s)),
    );
  }, [policies, tipoF, statusF, search]);

  const open = openId ? (policies.find((p) => p.id === openId) ?? null) : null;
  React.useEffect(() => {
    if (open)
      setTrainingForm({ trained_count: open.trained_count, target_count: open.target_count });
    // só ao trocar de documento
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open?.id]);

  function openEdit(p: Policy) {
    setOpenId(null);
    setEditTarget(p);
    setEditForm({
      name: p.name,
      status: p.status,
      tipo: tipoOf(p),
      indicador: p.indicador ?? "",
      publicacao: p.publicacao ?? "",
      revisao: p.revisao ?? "",
      trained_count: p.trained_count,
      target_count: p.target_count,
    });
  }
  function submitEdit() {
    if (!editTarget || !editForm.name.trim()) {
      toast.error("Informe o nome");
      return;
    }
    updateMut.mutate(
      {
        id: editTarget.id,
        patch: {
          name: editForm.name.trim(),
          status: editForm.status,
          tipo: editForm.tipo,
          indicador: editForm.indicador || null,
          publicacao: editForm.publicacao || null,
          revisao: editForm.revisao || null,
          trained_count: Number(editForm.trained_count) || 0,
          target_count: Number(editForm.target_count) || 0,
        },
      },
      { onSuccess: () => setEditTarget(null) },
    );
  }
  function submitCreate() {
    if (!form.name.trim()) {
      toast.error(
        form.tipo === "Processo" ? "Informe o nome do processo" : "Informe o nome da política",
      );
      return;
    }
    createMut.mutate(
      {
        name: form.name.trim(),
        status: form.status,
        tipo: form.tipo,
        onda: null,
        indicador: form.indicador || null,
        publicacao: form.publicacao || null,
        revisao: form.revisao || null,
        trained_count: Number(form.trained_count) || 0,
        target_count: Number(form.target_count) || 0,
      },
      { onSuccess: () => setCreateOpen(false) },
    );
  }
  function submitTraining() {
    if (!open) return;
    updateMut.mutate({
      id: open.id,
      patch: {
        trained_count: Number(trainingForm.trained_count) || 0,
        target_count: Number(trainingForm.target_count) || 0,
      },
    });
  }

  const adesaoDocs = policies
    .filter((p) => p.target_count > 0)
    .sort((a, b) => (pctOf(a) ?? 0) - (pctOf(b) ?? 0));
  const futuras = policies
    .filter((p) => p.revisao && daysUntil(p.revisao) >= 0)
    .sort((a, b) => (a.revisao ?? "").localeCompare(b.revisao ?? ""))
    .slice(0, 8);
  const vencidasOrd = [...stats.vencidas].sort((a, b) =>
    (a.revisao ?? "").localeCompare(b.revisao ?? ""),
  );
  const total = policies.length || 1;

  const agendaItem = (p: Policy) => (
    <button key={p.id} type="button" onClick={() => setOpenId(p.id)}>
      <b>{p.name}</b>
      <span className="when">
        <RevisaoPill revisao={p.revisao} />
      </span>
      <small>
        {tipoOf(p)} · revisão em {fmtDate(p.revisao)}
      </small>
    </button>
  );

  return (
    <div className="pol-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Cabeçalho ────────────────────────────────────────────────────── */}
      <div className="pol-ph">
        <div>
          <h1 className="pol-ph-title">Políticas e processos</h1>
          <p className="pol-ph-sub">
            Documentos normativos de SI: publicação, revisão anual e adesão ao treinamento
          </p>
        </div>
        <div className="pol-ph-actions">
          <a className="pol-btn lg" href={TRAININGS_URL}>
            <GraduationCap size={14} /> Treinamentos das políticas
          </a>
          {canCreate && (
            <button
              className="pol-btn primary lg"
              onClick={() => {
                setForm(emptyForm);
                setCreateOpen(true);
              }}
            >
              <Plus size={14} /> Nova política ou processo
            </button>
          )}
        </div>
      </div>

      {/* ── KPIs ───────────────────────────────────────────────────────── */}
      <div className="pol-kpis">
        <div className="pol-kpi">
          <span className="pol-kpi-label">Documentos</span>
          <span className="pol-kpi-value">{isLoading ? "—" : policies.length}</span>
          <span className="pol-kpi-foot">
            {stats.politicas} políticas · {stats.processos} processos
          </span>
        </div>
        <button
          type="button"
          className="pol-kpi"
          aria-pressed={statusF === "Publicada"}
          onClick={() => setStatusF((s) => (s === "Publicada" ? null : "Publicada"))}
        >
          <span className="pol-kpi-label">Publicados</span>
          <span className="pol-kpi-value">
            {stats.c.Publicada}
            <small>de {policies.length}</small>
          </span>
          <div className="pol-stack" aria-hidden="true">
            <i
              style={{ width: `${(stats.c.Publicada / total) * 100}%`, background: "var(--v2-ok)" }}
            />
            <i
              style={{
                width: `${(stats.c["Em Validação"] / total) * 100}%`,
                background: "var(--v2-med)",
              }}
            />
            <i
              style={{
                width: `${(stats.c.Revisão / total) * 100}%`,
                background: "var(--v2-accent)",
              }}
            />
          </div>
          <span className="pol-kpi-foot">
            {stats.c["Em Validação"]} em validação · {stats.c.Revisão} em revisão
          </span>
        </button>
        <div className="pol-kpi">
          <span className="pol-kpi-label">
            {stats.vencidas.length > 0 && (
              <span className="pol-sw" style={{ background: "var(--v2-crit)" }} />
            )}
            Revisões vencidas
          </span>
          <span className="pol-kpi-value">{stats.vencidas.length}</span>
          <span className="pol-kpi-foot">
            {stats.proximas.length} vencem nos próximos {REVISAO_ALERTA_DIAS} dias
          </span>
        </div>
        <div className="pol-kpi">
          <span className="pol-kpi-label">Adesão ao treinamento</span>
          <span className="pol-kpi-value">{stats.adesao === null ? "—" : `${stats.adesao}%`}</span>
          <div className="pol-meter" aria-hidden="true">
            <i style={{ width: `${stats.adesao ?? 0}%`, background: toneOf(stats.adesao) }} />
          </div>
          <span className="pol-kpi-foot">
            {stats.trained.toLocaleString("pt-BR")} de {stats.target.toLocaleString("pt-BR")}{" "}
            pessoas-alvo · meta {META_TREINAMENTO}%
          </span>
        </div>
      </div>

      {/* ── Adesão + agenda ────────────────────────────────────────────── */}
      <div className="pol-grid">
        <div className="pol-card pol-span-2">
          <div className="pol-card-hdr">
            <h2 className="pol-card-title">Adesão ao treinamento</h2>
            <p className="pol-card-sub">
              % do público-alvo treinado em cada documento · meta de {META_TREINAMENTO}%
            </p>
          </div>
          <div className="pol-card-body">
            {adesaoDocs.length === 0 ? (
              <div className="pol-empty">Nenhum documento com público-alvo definido.</div>
            ) : (
              <>
                <div className="pol-adh">
                  {adesaoDocs.map((p) => {
                    const v = pctOf(p) ?? 0;
                    return (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setOpenId(p.id)}
                        title={`${p.name}: ${p.trained_count} de ${p.target_count} pessoas treinadas`}
                      >
                        <span className="nm">{p.name}</span>
                        <span className="bar">
                          <i style={{ width: `${Math.min(100, v)}%`, background: toneOf(v) }} />
                          <span className="goal" style={{ left: `${META_TREINAMENTO}%` }} />
                        </span>
                        <span className="v">
                          {v}%{" "}
                          <small>
                            {p.trained_count}/{p.target_count}
                          </small>
                        </span>
                      </button>
                    );
                  })}
                </div>
                <div className="pol-legend">
                  <span>
                    <span className="pol-sw" style={{ background: "var(--v2-ok)" }} /> 80% ou mais
                  </span>
                  <span>
                    <span className="pol-sw" style={{ background: "var(--v2-med)" }} /> 50 a 79%
                  </span>
                  <span>
                    <span className="pol-sw" style={{ background: "var(--v2-crit)" }} /> abaixo de
                    50%
                  </span>
                </div>
              </>
            )}
          </div>
        </div>

        <div className="pol-card pol-fit">
          <div className="pol-card-hdr">
            <h2 className="pol-card-title">Agenda de revisão</h2>
            <p className="pol-card-sub">Revisão anual de cada documento</p>
          </div>
          <div className="pol-card-body">
            {vencidasOrd.length === 0 && futuras.length === 0 ? (
              <div className="pol-empty">Nenhuma revisão programada.</div>
            ) : (
              <>
                {vencidasOrd.length > 0 && (
                  <>
                    <div className="pol-sub-h">
                      <AlertTriangle size={13} /> Vencidas · {vencidasOrd.length}
                    </div>
                    <div className="pol-agenda">{vencidasOrd.map(agendaItem)}</div>
                    {futuras.length > 0 && <div className="pol-sub-h">Próximas</div>}
                  </>
                )}
                <div className="pol-agenda">{futuras.map(agendaItem)}</div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Documentos ─────────────────────────────────────────────────── */}
      <div className="pol-card">
        <div className="pol-toolbar">
          <b>
            Documentos{" "}
            <span className="pol-count">
              {filtered.length === policies.length
                ? policies.length
                : `${filtered.length} de ${policies.length}`}
            </span>
          </b>
          <div className="pol-seg" role="group" aria-label="Tipo">
            {(
              [
                [null, "Todos"],
                ["Política", "Políticas"],
                ["Processo", "Processos"],
              ] as Array<[Tipo | null, string]>
            ).map(([k, l]) => (
              <button key={l} type="button" aria-pressed={tipoF === k} onClick={() => setTipoF(k)}>
                {l}
              </button>
            ))}
          </div>
          <div className="pol-seg" role="group" aria-label="Status">
            {(
              [
                [null, "Todos os status"],
                ["Publicada", "Publicados"],
                ["Em Validação", "Em validação"],
                ["Revisão", "Em revisão"],
              ] as Array<[Status | null, string]>
            ).map(([k, l]) => (
              <button
                key={l}
                type="button"
                aria-pressed={statusF === k}
                onClick={() => setStatusF(k)}
              >
                {l}
              </button>
            ))}
          </div>
          <label className="pol-search">
            <Search size={14} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar documento ou indicador"
              aria-label="Buscar documentos"
            />
          </label>
        </div>
        {isLoading ? (
          <div className="pol-empty">
            <Loader2
              size={14}
              className="pol-spin"
              style={{ display: "inline", verticalAlign: "-2px" }}
            />{" "}
            Carregando…
          </div>
        ) : filtered.length === 0 ? (
          <div className="pol-empty">
            {policies.length === 0
              ? "Nenhuma política ou processo cadastrado."
              : "Nenhum documento com esses filtros. Troque o tipo, o status ou a busca."}
          </div>
        ) : (
          <div className="pol-scroll">
            <table className="pol-table">
              <thead>
                <tr>
                  <th>Documento</th>
                  <th>Tipo</th>
                  <th>Status</th>
                  <th>Treinamento</th>
                  <th>Publicação</th>
                  <th>Próxima revisão</th>
                  {(canEdit || canDelete) && (
                    <th>
                      <span style={{ fontSize: 0 }}>Ações</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((p) => {
                  const v = pctOf(p);
                  return (
                    <tr
                      key={p.id}
                      tabIndex={0}
                      onClick={() => setOpenId(p.id)}
                      onKeyDown={(e) => e.key === "Enter" && setOpenId(p.id)}
                    >
                      <td className="pol-doc">
                        <b>{p.name}</b>
                        {p.indicador && <small>{p.indicador}</small>}
                      </td>
                      <td>
                        <span className={`pol-tag ${tipoOf(p) === "Processo" ? "proc" : "accent"}`}>
                          {tipoOf(p)}
                        </span>
                      </td>
                      <td>
                        <span className={`pol-tag ${ST_CLS[p.status]}`}>{p.status}</span>
                      </td>
                      <td>
                        {v === null ? (
                          <span className="dim">—</span>
                        ) : (
                          <span
                            className="pol-tr"
                            title={`${p.trained_count} de ${p.target_count}`}
                          >
                            <span className="track">
                              <i style={{ width: `${Math.min(100, v)}%`, background: toneOf(v) }} />
                            </span>
                            <span>{v}%</span>
                          </span>
                        )}
                      </td>
                      <td className="mono dim">{fmtDate(p.publicacao)}</td>
                      <td>
                        <RevisaoPill revisao={p.revisao} />
                      </td>
                      {(canEdit || canDelete) && (
                        <td onClick={(e) => e.stopPropagation()}>
                          <div className="pol-row-act">
                            {canEdit && (
                              <button
                                className="pol-icon-btn"
                                title="Editar"
                                aria-label="Editar"
                                onClick={() => openEdit(p)}
                              >
                                <Pencil size={14} />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                className="pol-icon-btn danger"
                                title="Excluir"
                                aria-label="Excluir"
                                onClick={() => {
                                  setOpenId(p.id);
                                  setConfirmDelete(true);
                                }}
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
      </div>

      {/* ── Painel lateral ─────────────────────────────────────────────── */}
      <DetailSheet
        open={!!open}
        onOpenChange={(o) => {
          if (!o) {
            setOpenId(null);
            setConfirmDelete(false);
          }
        }}
        eyebrow={open ? `${tipoOf(open)}${open.indicador ? ` · ${open.indicador}` : ""}` : null}
        title={open?.name ?? ""}
        badges={
          open && (
            <>
              <span className={`pol-tag ${ST_CLS[open.status]}`}>{open.status}</span>
              {open.revisao && daysUntil(open.revisao) < 0 && (
                <span className="pol-days crit">
                  <AlertTriangle size={11} /> Revisão vencida
                </span>
              )}
            </>
          )
        }
        footer={
          open && (canEdit || canDelete) ? (
            confirmDelete ? (
              <div className="pol-confirm">
                <span>
                  Excluir {tipoOf(open) === "Processo" ? "este processo" : "esta política"}?
                </span>
                <button
                  className="pol-btn ghost"
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleteMut.isPending}
                >
                  Cancelar
                </button>
                <button
                  className="pol-btn danger"
                  onClick={() => deleteMut.mutate(open.id)}
                  disabled={deleteMut.isPending}
                >
                  {deleteMut.isPending ? (
                    <Loader2 size={13} className="pol-spin" />
                  ) : (
                    <Trash2 size={13} />
                  )}{" "}
                  Excluir
                </button>
              </div>
            ) : (
              <>
                {canDelete && (
                  <button className="pol-btn danger-text" onClick={() => setConfirmDelete(true)}>
                    Excluir
                  </button>
                )}
                {canEdit && (
                  <button className="pol-btn primary" onClick={() => openEdit(open)}>
                    <Pencil size={13} /> Editar
                  </button>
                )}
              </>
            )
          ) : null
        }
      >
        {open && (
          <div className="pol-sheet" style={{ display: "contents" }}>
            <DetailSection title="Datas">
              <DetailList
                items={[
                  ["Publicação", fmtDate(open.publicacao), true],
                  [
                    "Próxima revisão",
                    open.revisao
                      ? `${fmtDate(open.revisao)} · ${
                          daysUntil(open.revisao) < 0
                            ? `venceu há ${-daysUntil(open.revisao)} dias`
                            : `em ${daysUntil(open.revisao)} dias`
                        }`
                      : "—",
                  ],
                  ["Indicador", open.indicador ?? "—", true],
                ]}
              />
            </DetailSection>
            <DetailSection title="Treinamento">
              {open.target_count > 0 ? (
                <>
                  <div className="pol-big">
                    <b>{pctOf(open)}%</b>
                    <span>
                      {open.trained_count} de {open.target_count} pessoas treinadas · meta{" "}
                      {META_TREINAMENTO}%
                    </span>
                  </div>
                  <div className="pol-meter" style={{ height: 8 }} aria-hidden="true">
                    <i
                      style={{
                        width: `${Math.min(100, pctOf(open) ?? 0)}%`,
                        background: toneOf(pctOf(open)),
                      }}
                    />
                  </div>
                </>
              ) : (
                <p className="pol-p">Público-alvo ainda não definido.</p>
              )}
              {canEdit && (
                <div className="pol-inline">
                  <label>
                    Treinados
                    <input
                      type="number"
                      min={0}
                      className="pol-input"
                      value={trainingForm.trained_count}
                      onChange={(e) =>
                        setTrainingForm({ ...trainingForm, trained_count: Number(e.target.value) })
                      }
                    />
                  </label>
                  <label>
                    Público-alvo
                    <input
                      type="number"
                      min={0}
                      className="pol-input"
                      value={trainingForm.target_count}
                      onChange={(e) =>
                        setTrainingForm({ ...trainingForm, target_count: Number(e.target.value) })
                      }
                    />
                  </label>
                  <button
                    className="pol-btn"
                    onClick={submitTraining}
                    disabled={updateMut.isPending}
                  >
                    {updateMut.isPending && <Loader2 size={13} className="pol-spin" />} Atualizar
                  </button>
                </div>
              )}
            </DetailSection>
          </div>
        )}
      </DetailSheet>

      <PolicyDialog
        open={!!editTarget}
        onOpenChange={(o) => !o && setEditTarget(null)}
        title={editForm.tipo === "Processo" ? "Editar processo" : "Editar política"}
        form={editForm}
        setForm={setEditForm}
        onSubmit={submitEdit}
        pending={updateMut.isPending}
        submitLabel="Salvar"
      />
      <PolicyDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title={form.tipo === "Processo" ? "Novo processo" : "Nova política"}
        form={form}
        setForm={setForm}
        onSubmit={submitCreate}
        pending={createMut.isPending}
        submitLabel="Criar"
      />
    </div>
  );
}
