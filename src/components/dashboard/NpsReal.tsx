import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, Loader2, Lock } from "lucide-react";
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceArea,
  ReferenceLine,
} from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { usePermissions } from "@/lib/use-permissions";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { DetailList, DetailSection, DetailSheet } from "@/components/layout/DetailSheet";

type Categoria = "Detrator" | "Neutro" | "Promotor";
type Cliente = { id: string; nome: string; email: string | null };
type Registro = {
  id: string;
  cliente_id: string;
  nota: number;
  categoria: Categoria;
  data_pesquisa: string;
  comentario: string | null;
  created_at: string;
  nps_clientes: { nome: string } | null;
};

const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

function categoriaDe(nota: number): Categoria {
  if (nota <= 6) return "Detrator";
  if (nota <= 8) return "Neutro";
  return "Promotor";
}

function fmtDate(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function todayIso() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

const monthKey = (d: string) => (d ?? "").slice(0, 7);
const monthLabel = (k: string) => {
  const [y, m] = k.split("-");
  return m ? `${MESES[Number(m) - 1]}/${y}` : k;
};
/** NPS = % promotores (9–10) − % detratores (0–6), arredondado. */
function npsOf(rs: Registro[]) {
  if (rs.length === 0) return null;
  const p = rs.filter((r) => r.categoria === "Promotor").length;
  const d = rs.filter((r) => r.categoria === "Detrator").length;
  return Math.round(((p - d) / rs.length) * 100);
}
/** Faixas de referência de mercado para o NPS. */
function zoneOf(s: number | null) {
  if (s === null) return null;
  if (s >= 75) return { cls: "ok", label: "Excelente" };
  if (s >= 50) return { cls: "good", label: "Muito bom" };
  if (s >= 0) return { cls: "mid", label: "Razoável" };
  return { cls: "bad", label: "Crítico" };
}
const CAT_CLS: Record<Categoria, string> = { Promotor: "prom", Neutro: "neu", Detrator: "det" };
const CAT_COLOR: Record<Categoria, string> = {
  Promotor: "var(--v2-ok)",
  Neutro: "var(--v2-med)",
  Detrator: "var(--v2-crit)",
};
const signed = (n: number) => `${n > 0 ? "+" : ""}${n}`;

// ── CSS (interface v2) ─────────────────────────────────────────────────────────
const CSS = `
  .nps-root { font-family:var(--font-ui); color:var(--v2-fg); display:flex; flex-direction:column; gap:20px; font-size:14px; }
  .nps-root * { box-sizing:border-box; }
  .nps-root ::-webkit-scrollbar { width:6px; height:6px; }
  .nps-root ::-webkit-scrollbar-thumb { background:var(--v2-line-strong); border-radius:3px; }
  .nps-root :focus-visible { outline:2px solid var(--v2-accent); outline-offset:2px; }
  .nps-root .mono { font-family:var(--font-data); font-size:12.5px; }
  .nps-root .dim { color:var(--v2-fg-3); }
  .nps-root .recharts-cartesian-axis-tick-value { fill:var(--v2-fg-3) !important; font-size:11px; font-family:var(--font-data); }
  @keyframes nps-spin { to{transform:rotate(360deg)} }
  .nps-spin { animation:nps-spin .8s linear infinite; }

  .nps-ph { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  .nps-ph-title { font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.2; margin:0; }
  .nps-ph-sub { margin:4px 0 0; font-size:13px; color:var(--v2-fg-3); }
  .nps-bar { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
  .nps-month { display:inline-flex; align-items:center; gap:8px; font-size:13px; color:var(--v2-fg-2); }
  .nps-select { height:32px; border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-fg); border-radius:8px; font:inherit; font-size:13px; padding:0 10px; cursor:pointer; }
  .nps-state { display:flex; flex-direction:column; align-items:center; gap:10px; padding:48px 24px; text-align:center; background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; }

  /* KPIs */
  .nps-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(190px, 1fr)); background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
  .nps-kpi { padding:16px 18px 14px; display:grid; gap:2px; align-content:start; box-shadow:1px 0 0 var(--v2-line), 0 1px 0 var(--v2-line); min-width:0; }
  .nps-kpi-label { font-size:12.5px; color:var(--v2-fg-2); }
  .nps-kpi-value { font-size:28px; font-weight:600; letter-spacing:-0.02em; line-height:1.25; font-variant-numeric:tabular-nums; display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .nps-kpi-value small { font-size:15px; font-weight:500; color:var(--v2-fg-3); }
  .nps-kpi-foot { font-size:12px; color:var(--v2-fg-3); }
  .nps-up { color:color-mix(in oklch, var(--v2-ok) 75%, var(--v2-fg)); }
  .nps-dn { color:color-mix(in oklch, var(--v2-crit) 75%, var(--v2-fg)); }
  .nps-zone { display:inline-flex; align-items:center; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; letter-spacing:0; --c:var(--v2-ok); background:color-mix(in oklch, var(--c) 14%, transparent); color:color-mix(in oklch, var(--c) 72%, var(--v2-fg)); }
  .nps-zone.good { --c:var(--v2-accent); } .nps-zone.mid { --c:var(--v2-med); } .nps-zone.bad { --c:var(--v2-crit); }
  .nps-stack { display:flex; height:8px; border-radius:99px; overflow:hidden; gap:2px; margin:10px 0 6px; background:var(--v2-surface-2); }
  .nps-stack i { display:block; height:100%; }
  .nps-comp { display:flex; gap:14px; flex-wrap:wrap; font-size:12px; color:var(--v2-fg-3); }
  .nps-comp b { font:600 12.5px var(--font-data); color:var(--v2-fg); }

  /* Grade e cartões */
  .nps-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:20px; align-items:stretch; }
  .nps-span-2 { grid-column:span 2; }
  @media (max-width: 1100px) { .nps-grid { grid-template-columns:minmax(0, 1fr); } .nps-span-2 { grid-column:auto; } }
  .nps-card { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; min-width:0; overflow:hidden; }
  .nps-card-hdr { padding:14px 18px 4px; }
  .nps-card-title { font-size:14px; font-weight:600; margin:0; }
  .nps-card-sub { margin:2px 0 0; font-size:12.5px; color:var(--v2-fg-3); }
  .nps-card-body { padding:10px 18px 16px; }
  .nps-empty { padding:28px 16px; text-align:center; color:var(--v2-fg-3); font-size:13px; }
  .nps-tip { display:grid; gap:2px; padding:8px 10px; background:var(--v2-surface-2); border:1px solid var(--v2-line-strong); border-radius:8px; font-size:12px; box-shadow:0 12px 32px rgba(0,0,0,0.3); }
  .nps-tip span { color:var(--v2-fg-2); font-family:var(--font-data); }

  /* Distribuição 0–10 */
  .nps-hist { display:grid; grid-template-columns:repeat(11, 1fr); gap:4px; align-items:end; height:190px; padding-top:18px; }
  .nps-hist > div { display:flex; flex-direction:column; align-items:center; justify-content:flex-end; height:100%; gap:4px; min-width:0; }
  .nps-hist i { display:block; width:100%; border-radius:4px 4px 0 0; min-height:2px; }
  .nps-hist b { font:500 11px var(--font-data); color:var(--v2-fg-2); min-height:14px; }
  .nps-hist span { font:400 11px var(--font-data); color:var(--v2-fg-3); }
  .nps-hist-leg { display:flex; justify-content:space-between; gap:8px; flex-wrap:wrap; margin-top:10px; font-size:12px; color:var(--v2-fg-3); }

  /* Tabela */
  .nps-toolbar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:12px 18px; border-bottom:1px solid var(--v2-line); }
  .nps-toolbar > b { font-size:14px; font-weight:600; }
  .nps-count { font-weight:400; font-size:13px; color:var(--v2-fg-3); }
  .nps-seg { display:inline-flex; padding:3px; gap:2px; background:var(--v2-bg); border:1px solid var(--v2-line); border-radius:8px; flex-wrap:wrap; }
  .nps-seg button { border:0; background:transparent; padding:4px 12px; border-radius:5px; font-size:13px; color:var(--v2-fg-2); cursor:pointer; font-family:inherit; }
  .nps-seg button[aria-pressed="true"] { background:var(--v2-surface-2); color:var(--v2-fg); font-weight:500; box-shadow:inset 0 0 0 1px var(--v2-line); }
  .nps-search { display:inline-flex; align-items:center; gap:8px; height:32px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg-3); width:300px; max-width:100%; }
  .nps-search:focus-within { border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }
  .nps-search input { flex:1; min-width:0; border:0; outline:none; background:transparent; color:var(--v2-fg); font-size:13px; font-family:inherit; }
  .nps-scroll { overflow:auto; max-height:620px; }
  .nps-table { width:100%; border-collapse:collapse; font-size:13px; }
  .nps-table thead { position:sticky; top:0; z-index:1; }
  .nps-table th { padding:9px 12px; font-size:12px; font-weight:500; color:var(--v2-fg-3); text-align:left; background:var(--v2-surface); border-bottom:1px solid var(--v2-line); white-space:nowrap; }
  .nps-table td { padding:8px 12px; height:46px; border-bottom:1px solid var(--v2-line); vertical-align:middle; }
  .nps-table th:first-child, .nps-table td:first-child { padding-left:18px; }
  .nps-table th:last-child, .nps-table td:last-child { padding-right:18px; }
  .nps-table tbody tr { cursor:pointer; }
  .nps-table tbody tr:hover td { background:var(--v2-hover); }
  .nps-table tbody tr:last-child td { border-bottom:none; }
  .nps-trunc { display:block; max-width:440px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--v2-fg-2); }
  .nps-row-act { display:flex; justify-content:flex-end; gap:2px; }
  .nps-icon-btn { display:grid; place-items:center; width:30px; height:30px; border-radius:8px; border:0; background:transparent; color:var(--v2-fg-2); cursor:pointer; }
  .nps-icon-btn:hover { background:var(--v2-hover); color:var(--v2-fg); }
  .nps-icon-btn.danger:hover { color:var(--v2-crit); background:color-mix(in oklch, var(--v2-crit) 12%, transparent); }

  /* Nota e categoria (largura mínima, sem quebra: funciona em tabela, lista e painel) */
  .nps-score { display:inline-flex; align-items:center; justify-content:center; box-sizing:border-box; min-width:30px; height:26px; padding:0 7px; white-space:nowrap; flex-shrink:0; align-self:center; justify-self:start; line-height:1; border-radius:6px; font:600 13px var(--font-data); --c:var(--v2-ok); background:color-mix(in oklch, var(--c) 16%, transparent); color:color-mix(in oklch, var(--c) 75%, var(--v2-fg)); }
  .nps-score.neu, .nps-tag.neu { --c:var(--v2-med); }
  .nps-score.det, .nps-tag.det { --c:var(--v2-crit); }
  .nps-tag { display:inline-flex; align-items:center; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; white-space:nowrap; --c:var(--v2-ok); background:color-mix(in oklch, var(--c) 14%, transparent); color:color-mix(in oklch, var(--c) 72%, var(--v2-fg)); }

  /* Painel */
  .nps-quote { font-size:14px; line-height:1.6; color:var(--v2-fg); padding:12px 14px; border-left:3px solid var(--v2-line-strong); background:var(--v2-surface-2); border-radius:0 8px 8px 0; white-space:pre-wrap; overflow-wrap:anywhere; }
  .nps-p { margin:0; font-size:13px; color:var(--v2-fg-3); }
  .nps-hist-list { display:grid; gap:6px; }
  .nps-hist-list > div { display:flex; align-items:center; justify-content:space-between; gap:10px; font-size:13px; }
  .nps-confirm { display:flex; align-items:center; gap:8px; flex-wrap:wrap; width:100%; font-size:13px; }
  .nps-confirm span { margin-right:auto; color:var(--v2-fg-2); }

  /* Botões */
  .nps-btn { display:inline-flex; align-items:center; gap:7px; height:32px; padding:0 12px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; font-family:var(--font-ui); white-space:nowrap; border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-fg); }
  .nps-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .nps-btn:hover:not(:disabled) { background:var(--v2-hover); }
  .nps-btn.lg { height:34px; padding:0 14px; }
  .nps-btn.primary { background:var(--v2-accent); border-color:var(--v2-accent); color:var(--v2-accent-ink); }
  .nps-btn.primary:hover:not(:disabled) { background:var(--v2-accent); filter:brightness(1.08); }
  .nps-btn.ghost { background:transparent; border-color:transparent; color:var(--v2-fg-2); }
  .nps-btn.danger { background:var(--v2-crit); border-color:var(--v2-crit); color:#fff; }
  .nps-btn.danger:hover:not(:disabled) { background:var(--v2-crit); filter:brightness(1.08); }
  .nps-btn.danger-text { background:transparent; border-color:transparent; color:var(--v2-crit); margin-right:auto; }
  .nps-btn.danger-text:hover:not(:disabled) { background:color-mix(in oklch, var(--v2-crit) 10%, transparent); }

  /* Formulários */
  .nps-form { display:grid; gap:14px; padding-top:4px; font-family:var(--font-ui); }
  .nps-field { display:grid; gap:6px; min-width:0; }
  .nps-field label, .nps-field .lbl { font-size:12.5px; font-weight:500; color:var(--v2-fg-2); }
  .nps-req { color:var(--v2-crit); }
  .nps-input { width:100%; height:34px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg); font-size:13px; font-family:inherit; outline:none; }
  textarea.nps-input { height:auto; min-height:76px; padding:8px 10px; resize:vertical; line-height:1.5; }
  .nps-input:focus { border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }
  .nps-notes { display:grid; grid-template-columns:repeat(11, minmax(0, 1fr)); gap:6px; }
  .nps-notes button { height:38px; border-radius:8px; border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-fg); font:600 13px var(--font-data); cursor:pointer; --c:var(--v2-ok); }
  .nps-notes button:hover { background:var(--v2-hover); }
  .nps-notes button[aria-pressed="true"] { border-color:var(--c); background:color-mix(in oklch, var(--c) 18%, transparent); color:color-mix(in oklch, var(--c) 75%, var(--v2-fg)); box-shadow:0 0 0 2px color-mix(in oklch, var(--c) 35%, transparent); }
  .nps-notes button.neu { --c:var(--v2-med); } .nps-notes button.det { --c:var(--v2-crit); }
  .nps-hint { margin:0; font-size:12px; color:var(--v2-fg-3); }
`;

const dialogStyle: React.CSSProperties = {
  background: "var(--v2-surface)",
  border: "1px solid var(--v2-line-strong)",
  borderRadius: 12,
  color: "var(--v2-fg)",
};

function NpsClienteDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (c: Cliente) => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [nome, setNome] = React.useState("");
  const [email, setEmail] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setNome("");
      setEmail("");
    }
  }, [open]);

  const create = useMutation({
    mutationFn: async () => {
      const payload = {
        nome: nome.trim(),
        email: email.trim() || null,
        created_by: user?.id ?? null,
      };
      const { data, error } = await supabase
        .from("nps_clientes")
        .insert(payload)
        .select("id, nome, email")
        .single();
      if (error) throw new Error(error.message);
      return data as Cliente;
    },
    onSuccess: (c) => {
      toast.success("Cliente criado");
      qc.invalidateQueries({ queryKey: ["nps-clientes"] });
      onCreated(c);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="font-ui sm:max-w-md" style={dialogStyle}>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <DialogHeader>
          <DialogTitle style={{ fontSize: 16, fontWeight: 600 }}>Novo respondente</DialogTitle>
        </DialogHeader>
        <div className="nps-form">
          <div className="nps-field">
            <label htmlFor="cli-nome">
              Nome <span className="nps-req">*</span>
            </label>
            <input
              id="cli-nome"
              className="nps-input"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
            />
          </div>
          <div className="nps-field">
            <label htmlFor="cli-email">E-mail</label>
            <input
              id="cli-email"
              type="email"
              className="nps-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter style={{ gap: 8 }}>
          <button className="nps-btn ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </button>
          <button
            className="nps-btn primary"
            onClick={() => create.mutate()}
            disabled={!nome.trim() || create.isPending}
          >
            {create.isPending && <Loader2 size={13} className="nps-spin" />} Salvar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NpsDialog({
  open,
  onOpenChange,
  editing,
  clientes,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Registro | null;
  clientes: Cliente[];
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [clienteId, setClienteId] = React.useState<string>("");
  const [nota, setNota] = React.useState<number | null>(null);
  const [dataPesquisa, setDataPesquisa] = React.useState<string>(todayIso());
  const [comentario, setComentario] = React.useState("");
  const [clienteDialogOpen, setClienteDialogOpen] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setClienteId(editing?.cliente_id ?? "");
      setNota(editing?.nota ?? null);
      setDataPesquisa(editing?.data_pesquisa ?? todayIso());
      setComentario(editing?.comentario ?? "");
    }
  }, [open, editing]);

  const save = useMutation({
    mutationFn: async () => {
      if (!clienteId) throw new Error("Selecione um cliente");
      if (nota === null) throw new Error("Selecione uma nota");
      if (!dataPesquisa) throw new Error("Informe a data da pesquisa");
      const payload = {
        cliente_id: clienteId,
        nota,
        categoria: categoriaDe(nota),
        data_pesquisa: dataPesquisa,
        comentario: comentario.trim() || null,
      };
      if (editing) {
        const { error } = await supabase.from("nps_registros").update(payload).eq("id", editing.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase
          .from("nps_registros")
          .insert({ ...payload, created_by: user?.id ?? null });
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      toast.success("Registro salvo com sucesso");
      qc.invalidateQueries({ queryKey: ["nps-registros"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="font-ui sm:max-w-xl" style={dialogStyle}>
          <style dangerouslySetInnerHTML={{ __html: CSS }} />
          <DialogHeader>
            <DialogTitle style={{ fontSize: 16, fontWeight: 600 }}>
              {editing ? "Editar resposta" : "Nova resposta de NPS"}
            </DialogTitle>
          </DialogHeader>
          <div className="nps-form">
            <div className="nps-field">
              <label htmlFor="nps-cli">
                Respondente <span className="nps-req">*</span>
              </label>
              <div style={{ display: "flex", gap: 8 }}>
                <select
                  id="nps-cli"
                  className="nps-input"
                  value={clienteId}
                  onChange={(e) => setClienteId(e.target.value)}
                  style={{ flex: 1 }}
                >
                  <option value="">Selecione um respondente</option>
                  {clientes.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nome}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="nps-btn"
                  onClick={() => setClienteDialogOpen(true)}
                  title="Novo respondente"
                  aria-label="Novo respondente"
                >
                  <Plus size={14} />
                </button>
              </div>
            </div>

            <div className="nps-field">
              <label htmlFor="nps-data">
                Data da pesquisa <span className="nps-req">*</span>
              </label>
              <input
                id="nps-data"
                type="date"
                className="nps-input"
                value={dataPesquisa}
                onChange={(e) => setDataPesquisa(e.target.value)}
              />
            </div>

            <div className="nps-field">
              <span className="lbl">
                Nota <span className="nps-req">*</span>
              </span>
              <div className="nps-notes" role="group" aria-label="Nota de 0 a 10">
                {Array.from({ length: 11 }, (_, i) => (
                  <button
                    key={i}
                    type="button"
                    className={CAT_CLS[categoriaDe(i)] === "prom" ? "" : CAT_CLS[categoriaDe(i)]}
                    aria-pressed={nota === i}
                    onClick={() => setNota(i)}
                  >
                    {i}
                  </button>
                ))}
              </div>
              <p className="nps-hint">Detrator (0–6) · Neutro (7–8) · Promotor (9–10)</p>
            </div>

            <div className="nps-field">
              <label htmlFor="nps-com">Comentário / justificativa</label>
              <textarea
                id="nps-com"
                className="nps-input"
                rows={3}
                value={comentario}
                onChange={(e) => setComentario(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter style={{ gap: 8 }}>
            <button className="nps-btn ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </button>
            <button
              className="nps-btn primary"
              onClick={() => save.mutate()}
              disabled={save.isPending}
            >
              {save.isPending && <Loader2 size={13} className="nps-spin" />} Salvar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NpsClienteDialog
        open={clienteDialogOpen}
        onOpenChange={setClienteDialogOpen}
        onCreated={(c) => setClienteId(c.id)}
      />
    </>
  );
}

function ScoreBadge({ nota }: { nota: number }) {
  const c = CAT_CLS[categoriaDe(nota)];
  return <span className={`nps-score ${c === "prom" ? "" : c}`}>{nota}</span>;
}
function CatTag({ c }: { c: Categoria }) {
  const cls = CAT_CLS[c];
  return <span className={`nps-tag ${cls === "prom" ? "" : cls}`}>{c}</span>;
}

function EvoTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { m: string; s: number | null; n: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="nps-tip">
      <b>{monthLabel(p.m)}</b>
      <span>
        NPS {p.s === null ? "—" : signed(p.s)} · {p.n} {p.n === 1 ? "resposta" : "respostas"}
      </span>
      <span style={{ opacity: 0.7 }}>clique para ver o mês</span>
    </div>
  );
}

export function NpsDashboard() {
  const qc = useQueryClient();
  const { can, isAdmin, isModuleAdmin } = usePermissions();

  const canView = isAdmin || isModuleAdmin("nps") || can("nps", "view");
  const canCreate = isAdmin || isModuleAdmin("nps") || can("nps", "create");
  const canEdit = isAdmin || isModuleAdmin("nps") || can("nps", "edit");
  const canDelete = isAdmin || isModuleAdmin("nps") || can("nps", "delete");

  const [search, setSearch] = React.useState("");
  const [catFiltro, setCatFiltro] = React.useState<Categoria | null>(null);
  const [mes, setMes] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Registro | null>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const registrosQ = useQuery({
    queryKey: ["nps-registros"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nps_registros")
        .select(
          "id, cliente_id, nota, categoria, data_pesquisa, comentario, created_at, nps_clientes(nome)",
        )
        .order("data_pesquisa", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Registro[];
    },
  });

  const clientesQ = useQuery({
    queryKey: ["nps-clientes"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nps_clientes")
        .select("id, nome, email")
        .order("nome");
      if (error) throw new Error(error.message);
      return (data ?? []) as Cliente[];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("nps_registros").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Registro removido");
      qc.invalidateQueries({ queryKey: ["nps-registros"] });
      setOpenId(null);
      setConfirmDelete(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const registros = React.useMemo(() => registrosQ.data ?? [], [registrosQ.data]);

  // Meses com respostas (mais recente primeiro); o mês selecionado começa no mais recente.
  const meses = React.useMemo(
    () =>
      [...new Set(registros.map((r) => monthKey(r.data_pesquisa)).filter(Boolean))]
        .sort()
        .reverse(),
    [registros],
  );
  const mesAtual = mes && meses.includes(mes) ? mes : (meses[0] ?? null);
  const mesAnterior = mesAtual ? (meses[meses.indexOf(mesAtual) + 1] ?? null) : null;

  const doMes = React.useMemo(
    () => (mesAtual ? registros.filter((r) => monthKey(r.data_pesquisa) === mesAtual) : []),
    [registros, mesAtual],
  );
  const metrics = React.useMemo(() => {
    const p = doMes.filter((r) => r.categoria === "Promotor").length;
    const n = doMes.filter((r) => r.categoria === "Neutro").length;
    const d = doMes.filter((r) => r.categoria === "Detrator").length;
    const score = npsOf(doMes);
    const prev = mesAnterior
      ? npsOf(registros.filter((r) => monthKey(r.data_pesquisa) === mesAnterior))
      : null;
    const media = doMes.length ? doMes.reduce((s, r) => s + r.nota, 0) / doMes.length : null;
    const comentarios = doMes.filter((r) => r.comentario).length;
    return { p, n, d, score, prev, media, comentarios };
  }, [doMes, registros, mesAnterior]);

  // Evolução: últimos 12 meses com respostas
  const serie = React.useMemo(
    () =>
      meses
        .slice(0, 12)
        .reverse()
        .map((m) => {
          const rs = registros.filter((r) => monthKey(r.data_pesquisa) === m);
          return { m, label: MESES[Number(m.slice(5, 7)) - 1], s: npsOf(rs), n: rs.length };
        }),
    [meses, registros],
  );

  const hist = Array.from({ length: 11 }, (_, n) => doMes.filter((r) => r.nota === n).length);
  const histMax = Math.max(1, ...hist);

  const filtered = React.useMemo(() => {
    const s = search.trim().toLowerCase();
    return doMes.filter(
      (r) =>
        (!catFiltro || r.categoria === catFiltro) &&
        (!s ||
          (r.nps_clientes?.nome ?? "").toLowerCase().includes(s) ||
          (r.comentario ?? "").toLowerCase().includes(s)),
    );
  }, [doMes, search, catFiltro]);

  if (!canView) {
    return (
      <div className="nps-root">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="nps-state">
          <Lock size={22} color="var(--v2-crit)" />
          <span style={{ fontSize: 15, fontWeight: 600 }}>Acesso restrito</span>
          <span className="dim" style={{ fontSize: 13 }}>
            Você não tem permissão para acessar este módulo.
          </span>
        </div>
      </div>
    );
  }

  const zone = zoneOf(metrics.score);
  const delta =
    metrics.score !== null && metrics.prev !== null ? metrics.score - metrics.prev : null;
  const open = openId ? (registros.find((r) => r.id === openId) ?? null) : null;
  const outras = open
    ? registros.filter((r) => r.cliente_id === open.cliente_id && r.id !== open.id).slice(0, 8)
    : [];
  const openRow = (id: string, askDelete = false) => {
    setOpenId(id);
    setConfirmDelete(askDelete);
  };
  const startEdit = (r: Registro) => {
    setOpenId(null);
    setEditing(r);
    setDialogOpen(true);
  };

  return (
    <div className="nps-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Cabeçalho ────────────────────────────────────────────────────── */}
      <div className="nps-ph">
        <div>
          <h1 className="nps-ph-title">NPS</h1>
          <p className="nps-ph-sub">
            Satisfação dos respondentes medida pelo Net Promoter Score (nota de 0 a 10)
          </p>
        </div>
        {canCreate && (
          <button
            className="nps-btn primary lg"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus size={14} /> Novo registro
          </button>
        )}
      </div>

      {registrosQ.isLoading ? (
        <div className="nps-state">
          <Loader2 size={20} className="nps-spin" color="var(--v2-accent)" />
          <span className="dim" style={{ fontSize: 13 }}>
            Carregando respostas…
          </span>
        </div>
      ) : registrosQ.isError ? (
        <div className="nps-state">
          <span style={{ fontSize: 14, fontWeight: 600 }}>Erro ao carregar as respostas</span>
        </div>
      ) : registros.length === 0 ? (
        <div className="nps-state">
          <span style={{ fontSize: 14, fontWeight: 600 }}>Nenhuma resposta registrada ainda</span>
          <span className="dim" style={{ fontSize: 13 }}>
            {canCreate
              ? 'Clique em "Novo registro" para cadastrar a primeira.'
              : "Ainda não há respostas de NPS."}
          </span>
        </div>
      ) : (
        <>
          <div className="nps-bar">
            <label className="nps-month">
              Mês
              <select
                className="nps-select"
                value={mesAtual ?? ""}
                onChange={(e) => setMes(e.target.value)}
                aria-label="Mês"
              >
                {meses.map((m) => (
                  <option key={m} value={m}>
                    {monthLabel(m)}
                  </option>
                ))}
              </select>
            </label>
            <span className="dim" style={{ fontSize: 12.5 }}>
              NPS = % promotores (9–10) − % detratores (0–6)
            </span>
          </div>

          {/* ── KPIs ───────────────────────────────────────────────────── */}
          <div className="nps-kpis">
            <div className="nps-kpi">
              <span className="nps-kpi-label">NPS · {mesAtual ? monthLabel(mesAtual) : "—"}</span>
              <span className="nps-kpi-value">
                {metrics.score === null ? "—" : signed(metrics.score)}
                {zone && (
                  <span className={`nps-zone ${zone.cls === "ok" ? "" : zone.cls}`}>
                    {zone.label}
                  </span>
                )}
              </span>
              <span className="nps-kpi-foot">
                {delta === null || !mesAnterior ? (
                  "sem mês anterior para comparar"
                ) : (
                  <>
                    <span className={delta >= 0 ? "nps-up" : "nps-dn"}>
                      {delta >= 0 ? "▲" : "▼"} {Math.abs(delta)} pontos
                    </span>{" "}
                    vs. {monthLabel(mesAnterior)}
                  </>
                )}
              </span>
            </div>
            <div className="nps-kpi">
              <span className="nps-kpi-label">Composição</span>
              <div className="nps-stack" aria-hidden="true">
                {doMes.length > 0 && (
                  <>
                    <i
                      style={{
                        width: `${(metrics.p / doMes.length) * 100}%`,
                        background: CAT_COLOR.Promotor,
                      }}
                    />
                    <i
                      style={{
                        width: `${(metrics.n / doMes.length) * 100}%`,
                        background: CAT_COLOR.Neutro,
                      }}
                    />
                    <i
                      style={{
                        width: `${(metrics.d / doMes.length) * 100}%`,
                        background: CAT_COLOR.Detrator,
                      }}
                    />
                  </>
                )}
              </div>
              <div className="nps-comp">
                <span>
                  <b>{metrics.p}</b> promotores
                </span>
                <span>
                  <b>{metrics.n}</b> neutros
                </span>
                <span>
                  <b>{metrics.d}</b> detratores
                </span>
              </div>
            </div>
            <div className="nps-kpi">
              <span className="nps-kpi-label">Média das notas</span>
              <span className="nps-kpi-value">
                {metrics.media === null ? "—" : metrics.media.toFixed(1).replace(".", ",")}
                <small>/ 10</small>
              </span>
              <span className="nps-kpi-foot">
                {doMes.length} {doMes.length === 1 ? "resposta" : "respostas"} no mês
              </span>
            </div>
            <div className="nps-kpi">
              <span className="nps-kpi-label">Respostas</span>
              <span className="nps-kpi-value">{registros.length}</span>
              <span className="nps-kpi-foot">
                todo o histórico · {metrics.comentarios} com comentário no mês
              </span>
            </div>
          </div>

          {/* ── Evolução + distribuição ─────────────────────────────────── */}
          <div className="nps-grid">
            <div className="nps-card nps-span-2">
              <div className="nps-card-hdr">
                <h2 className="nps-card-title">Evolução do NPS</h2>
                <p className="nps-card-sub">
                  Últimos 12 meses com respostas · clique num mês para selecioná-lo
                </p>
              </div>
              <div className="nps-card-body" style={{ height: 270 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart
                    data={serie}
                    margin={{ top: 14, right: 16, left: 0, bottom: 0 }}
                    onClick={(e: { activePayload?: Array<{ payload: { m: string } }> }) => {
                      const m = e?.activePayload?.[0]?.payload?.m;
                      if (m) setMes(m);
                    }}
                    style={{ cursor: "pointer" }}
                  >
                    <CartesianGrid stroke="var(--v2-line)" vertical={false} />
                    <ReferenceArea y1={50} y2={100} fill="var(--v2-ok)" fillOpacity={0.06} />
                    <ReferenceLine y={0} stroke="var(--v2-line-strong)" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} />
                    <YAxis
                      domain={[-100, 100]}
                      ticks={[-100, -50, 0, 50, 100]}
                      tickFormatter={(v: number) => (v > 0 ? `+${v}` : `${v}`)}
                      tickLine={false}
                      axisLine={false}
                      width={40}
                    />
                    <Tooltip
                      content={<EvoTooltip />}
                      cursor={{ stroke: "var(--v2-line-strong)" }}
                    />
                    <Line
                      type="linear"
                      dataKey="s"
                      stroke="var(--v2-accent)"
                      strokeWidth={2.4}
                      connectNulls
                      isAnimationActive={false}
                      dot={(props: { cx?: number; cy?: number; payload?: { m: string } }) => {
                        const sel = props.payload?.m === mesAtual;
                        return (
                          <circle
                            key={props.payload?.m}
                            cx={props.cx}
                            cy={props.cy}
                            r={sel ? 6 : 4}
                            fill={sel ? "var(--v2-accent)" : "var(--v2-surface)"}
                            stroke="var(--v2-accent)"
                            strokeWidth={2}
                          />
                        );
                      }}
                      activeDot={{
                        r: 6,
                        fill: "var(--v2-accent)",
                        stroke: "var(--v2-surface)",
                        strokeWidth: 2,
                      }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="nps-card">
              <div className="nps-card-hdr">
                <h2 className="nps-card-title">Distribuição das notas</h2>
                <p className="nps-card-sub">
                  {doMes.length} {doMes.length === 1 ? "resposta" : "respostas"} em{" "}
                  {mesAtual ? monthLabel(mesAtual) : "—"}
                </p>
              </div>
              <div className="nps-card-body">
                <div className="nps-hist">
                  {hist.map((c, n) => (
                    <div key={n} title={`Nota ${n}: ${c} ${c === 1 ? "resposta" : "respostas"}`}>
                      <b>{c || ""}</b>
                      <i
                        style={{
                          height: `${(c / histMax) * 100}%`,
                          background: CAT_COLOR[categoriaDe(n)],
                        }}
                      />
                      <span>{n}</span>
                    </div>
                  ))}
                </div>
                <div className="nps-hist-leg">
                  <span>Detratores · 0–6</span>
                  <span>Neutros · 7–8</span>
                  <span>Promotores · 9–10</span>
                </div>
              </div>
            </div>
          </div>

          {/* ── Respostas ──────────────────────────────────────────────── */}
          <div className="nps-card">
            <div className="nps-toolbar">
              <b>
                Respostas{" "}
                <span className="nps-count">
                  {filtered.length === doMes.length
                    ? doMes.length
                    : `${filtered.length} de ${doMes.length}`}
                </span>
              </b>
              <div className="nps-seg" role="group" aria-label="Categoria">
                {(
                  [
                    [null, "Todas"],
                    ["Promotor", "Promotores"],
                    ["Neutro", "Neutros"],
                    ["Detrator", "Detratores"],
                  ] as Array<[Categoria | null, string]>
                ).map(([k, l]) => (
                  <button
                    key={l}
                    type="button"
                    aria-pressed={catFiltro === k}
                    onClick={() => setCatFiltro(k)}
                  >
                    {l}
                  </button>
                ))}
              </div>
              <label className="nps-search">
                <Search size={14} />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar respondente ou comentário"
                  aria-label="Buscar respostas"
                />
              </label>
            </div>
            {filtered.length === 0 ? (
              <div className="nps-empty">
                Nenhuma resposta com esses filtros. Troque o mês, a categoria ou a busca.
              </div>
            ) : (
              <div className="nps-scroll">
                <table className="nps-table">
                  <thead>
                    <tr>
                      <th>Respondente</th>
                      <th>Nota</th>
                      <th>Categoria</th>
                      <th>Data</th>
                      <th>Comentário</th>
                      {(canEdit || canDelete) && (
                        <th>
                          <span style={{ fontSize: 0 }}>Ações</span>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((r) => (
                      <tr
                        key={r.id}
                        tabIndex={0}
                        onClick={() => openRow(r.id)}
                        onKeyDown={(e) => e.key === "Enter" && openRow(r.id)}
                      >
                        <td style={{ fontWeight: 500 }}>{r.nps_clientes?.nome ?? "—"}</td>
                        <td>
                          <ScoreBadge nota={r.nota} />
                        </td>
                        <td>
                          <CatTag c={r.categoria} />
                        </td>
                        <td className="mono dim">{fmtDate(r.data_pesquisa)}</td>
                        <td>
                          {r.comentario ? (
                            <span className="nps-trunc" title={r.comentario}>
                              {r.comentario}
                            </span>
                          ) : (
                            <span className="dim">—</span>
                          )}
                        </td>
                        {(canEdit || canDelete) && (
                          <td onClick={(e) => e.stopPropagation()}>
                            <div className="nps-row-act">
                              {canEdit && (
                                <button
                                  className="nps-icon-btn"
                                  title="Editar"
                                  aria-label="Editar"
                                  onClick={() => startEdit(r)}
                                >
                                  <Pencil size={14} />
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  className="nps-icon-btn danger"
                                  title="Remover"
                                  aria-label="Remover"
                                  onClick={() => openRow(r.id, true)}
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

      {/* ── Painel lateral: resposta ─────────────────────────────────────── */}
      <DetailSheet
        open={!!open}
        onOpenChange={(o) => {
          if (!o) {
            setOpenId(null);
            setConfirmDelete(false);
          }
        }}
        eyebrow={open ? `Pesquisa de ${fmtDate(open.data_pesquisa)}` : null}
        title={open?.nps_clientes?.nome ?? "—"}
        badges={
          open && (
            <>
              <ScoreBadge nota={open.nota} />
              <CatTag c={open.categoria} />
            </>
          )
        }
        footer={
          open && (canEdit || canDelete) ? (
            confirmDelete ? (
              <div className="nps-confirm">
                <span>Remover esta resposta?</span>
                <button
                  className="nps-btn ghost"
                  onClick={() => setConfirmDelete(false)}
                  disabled={del.isPending}
                >
                  Cancelar
                </button>
                <button
                  className="nps-btn danger"
                  onClick={() => del.mutate(open.id)}
                  disabled={del.isPending}
                >
                  {del.isPending ? (
                    <Loader2 size={13} className="nps-spin" />
                  ) : (
                    <Trash2 size={13} />
                  )}{" "}
                  Remover
                </button>
              </div>
            ) : (
              <>
                {canDelete && (
                  <button className="nps-btn danger-text" onClick={() => setConfirmDelete(true)}>
                    Remover
                  </button>
                )}
                {canEdit && (
                  <button className="nps-btn primary" onClick={() => startEdit(open)}>
                    <Pencil size={13} /> Editar
                  </button>
                )}
              </>
            )
          ) : null
        }
      >
        {open && (
          <>
            <DetailSection title="Comentário">
              {open.comentario ? (
                <div className="nps-quote">{open.comentario}</div>
              ) : (
                <p className="nps-p">Sem comentário.</p>
              )}
            </DetailSection>
            <DetailSection title="Resposta">
              <DetailList
                items={[
                  ["Nota", `${open.nota} de 10`, true],
                  [
                    "Categoria",
                    `${open.categoria} (${open.categoria === "Promotor" ? "9–10" : open.categoria === "Neutro" ? "7–8" : "0–6"})`,
                  ],
                  ["Data da pesquisa", fmtDate(open.data_pesquisa), true],
                ]}
              />
            </DetailSection>
            <DetailSection title="Outras respostas deste respondente">
              {outras.length === 0 ? (
                <p className="nps-p">Primeira resposta.</p>
              ) : (
                <div className="nps-hist-list">
                  {outras.map((o) => (
                    <div key={o.id}>
                      <span className="mono dim">{fmtDate(o.data_pesquisa)}</span>
                      <ScoreBadge nota={o.nota} />
                    </div>
                  ))}
                </div>
              )}
            </DetailSection>
          </>
        )}
      </DetailSheet>

      <NpsDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={editing}
        clientes={clientesQ.data ?? []}
      />
    </div>
  );
}
