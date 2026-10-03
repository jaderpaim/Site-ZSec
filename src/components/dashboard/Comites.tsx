import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  Loader2,
  Lock,
  CheckCircle2,
  XCircle,
  Clock,
  X,
  AlertTriangle,
} from "lucide-react";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  LabelList,
} from "recharts";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import { usePermissions } from "@/lib/use-permissions";
import {
  listComites,
  upsertComite,
  deleteComite,
  getComitesOverview,
  type ComiteRow,
} from "@/lib/comites.functions";
import { DetailList, DetailSection, DetailSheet } from "@/components/layout/DetailSheet";

const STATUSES = ["Agendado", "Realizado", "Não Realizado", "Cancelado"] as const;
const PERIODICIDADES = [
  "Semanal",
  "Quinzenal",
  "Mensal",
  "Bimestral",
  "Trimestral",
  "Semestral",
  "Anual",
  "Ad-hoc",
] as const;
const TIPOS_SUGERIDOS = [
  "Estratégico",
  "Riscos & GRC",
  "Privacidade",
  "Crisis Mgmt",
  "Tech Review",
  "Operacional",
] as const;

// Paleta categórica validada (mesma do Sophos): a cor segue o tipo pela posição
// na lista (do mais frequente ao menos), e o nome/número fica sempre escrito.
const CAT_COLORS = [
  "var(--cm-cat-1)",
  "var(--cm-cat-2)",
  "var(--cm-cat-3)",
  "var(--cm-cat-4)",
  "var(--cm-cat-5)",
  "var(--cm-cat-6)",
];
const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

// ── CSS (interface v2) ─────────────────────────────────────────────────────────
const CSS = `
  :root { --cm-cat-1:#3987e5; --cm-cat-2:#d95926; --cm-cat-3:#199e70; --cm-cat-4:#c98500; --cm-cat-5:#d55181; --cm-cat-6:#9085e9; }
  :root[data-theme="light"] { --cm-cat-1:#2a78d6; --cm-cat-2:#eb6834; --cm-cat-3:#1baf7a; --cm-cat-4:#eda100; --cm-cat-5:#e87ba4; --cm-cat-6:#4a3aa7; }

  .cm-root { font-family:var(--font-ui); color:var(--v2-fg); display:flex; flex-direction:column; gap:20px; font-size:14px; }
  .cm-root * { box-sizing:border-box; }
  @keyframes cm-spin { to{transform:rotate(360deg)} }
  .cm-spin { animation:cm-spin 0.75s linear infinite; }
  @media (prefers-reduced-motion: reduce) { .cm-spin { animation:none; } }
  .cm-root ::-webkit-scrollbar { width:6px; height:6px; }
  .cm-root ::-webkit-scrollbar-track { background:transparent; }
  .cm-root ::-webkit-scrollbar-thumb { background:var(--v2-line-strong); border-radius:3px; }
  .cm-root :focus-visible { outline:2px solid var(--v2-accent); outline-offset:2px; }
  .cm-root .mono { font-family:var(--font-data); font-size:12.5px; }
  .cm-root .dim { color:var(--v2-fg-3); }
  .cm-root .recharts-cartesian-axis-tick-value { fill:var(--v2-fg-3) !important; font-size:11px; font-family:var(--font-data); }

  /* ── Cabeçalho ── */
  .cm-ph { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  .cm-ph-title { font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.2; margin:0; }
  .cm-ph-sub { margin:4px 0 0; font-size:13px; color:var(--v2-fg-3); }

  /* ── Estado (acesso restrito) ── */
  .cm-state { display:flex; flex-direction:column; align-items:center; gap:10px; padding:48px 24px; text-align:center; background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; }
  .cm-empty { padding:28px 16px; text-align:center; color:var(--v2-fg-3); font-size:13px; }

  /* ── KPIs ── */
  .cm-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
  .cm-kpi { position:relative; text-align:left; border:0; background:transparent; padding:16px 18px 14px; display:grid; gap:2px; align-content:start; box-shadow:1px 0 0 var(--v2-line), 0 1px 0 var(--v2-line); color:inherit; font-family:inherit; min-width:0; }
  button.cm-kpi { cursor:pointer; }
  button.cm-kpi:hover { background:var(--v2-hover); }
  .cm-kpi[aria-pressed="true"] { background:color-mix(in oklch, var(--v2-accent) 14%, transparent); }
  .cm-kpi[aria-pressed="true"]::after { content:""; position:absolute; left:0; right:0; bottom:0; height:2px; background:var(--v2-accent); }
  .cm-kpi-label { font-size:12.5px; color:var(--v2-fg-2); display:flex; align-items:center; gap:6px; }
  .cm-kpi-value { font-size:28px; font-weight:600; letter-spacing:-0.02em; line-height:1.25; font-variant-numeric:tabular-nums; }
  .cm-kpi-foot { font-size:12px; color:var(--v2-fg-3); }
  .cm-sw { width:8px; height:8px; border-radius:2px; display:inline-block; flex-shrink:0; }
  .cm-meter { height:6px; border-radius:99px; background:var(--v2-surface-2); overflow:hidden; margin:6px 0 2px; }
  .cm-meter i { display:block; height:100%; border-radius:99px; }

  /* ── Grade: cada linha com quadros da mesma altura ── */
  .cm-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:20px; align-items:stretch; }
  .cm-span-2 { grid-column:span 2; }
  .cm-card { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; min-width:0; overflow:hidden; }
  /* A agenda não define a altura da linha: acompanha o gráfico e rola por dentro */
  .cm-fit { height:0; min-height:100%; display:flex; flex-direction:column; }
  .cm-fit .cm-card-body { flex:1; min-height:0; overflow-y:auto; }
  @media (max-width: 1100px) {
    .cm-grid { grid-template-columns:minmax(0, 1fr); }
    .cm-span-2 { grid-column:auto; }
    .cm-fit { height:auto; min-height:0; max-height:420px; }
  }
  .cm-card-hdr { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap; padding:14px 18px 4px; }
  .cm-card-title { font-size:14px; font-weight:600; margin:0; }
  .cm-card-sub { margin:2px 0 0; font-size:12.5px; color:var(--v2-fg-3); }
  .cm-card-body { padding:10px 18px 16px; }
  .cm-legend { display:flex; gap:14px; flex-wrap:wrap; font-size:12px; color:var(--v2-fg-2); }
  .cm-legend span { display:inline-flex; align-items:center; gap:6px; }

  /* ── Agenda ── */
  .cm-agenda { display:grid; }
  .cm-agenda button { display:grid; grid-template-columns:44px minmax(0, 1fr) auto; gap:12px; align-items:center; padding:8px; margin:0 -8px; border:0; border-radius:8px; background:transparent; text-align:left; color:var(--v2-fg); cursor:pointer; font-family:inherit; }
  .cm-agenda button:hover { background:var(--v2-hover); }
  .cm-cal { display:grid; place-items:center; width:44px; height:44px; border-radius:8px; border:1px solid var(--v2-line); background:var(--v2-surface-2); line-height:1.05; }
  .cm-cal b { font-size:16px; font-weight:600; font-variant-numeric:tabular-nums; }
  .cm-cal small { font:500 10.5px var(--font-data); color:var(--v2-fg-3); text-transform:uppercase; letter-spacing:.04em; }
  .cm-agenda .t { min-width:0; }
  .cm-agenda .t b { display:block; font-weight:500; font-size:13px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .cm-agenda .t small { display:block; font-size:12px; color:var(--v2-fg-3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .cm-sub-h { font-size:12px; font-weight:500; color:var(--v2-fg-3); margin:14px 0 4px; display:flex; align-items:center; gap:6px; }
  .cm-sub-h:first-child { margin-top:0; }
  .cm-days { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:5px; font:500 12px var(--font-data); white-space:nowrap; --c:var(--v2-fg-3); background:color-mix(in oklch, var(--c) 14%, transparent); color:color-mix(in oklch, var(--c) 72%, var(--v2-fg)); }
  .cm-days.warn { --c:var(--v2-med); }
  .cm-days.soon { --c:var(--v2-accent); }

  /* ── Por tipo ── */
  .cm-cat-tot { display:flex; align-items:baseline; gap:8px; margin-bottom:10px; }
  .cm-cat-tot b { font-size:28px; font-weight:600; letter-spacing:-0.02em; font-variant-numeric:tabular-nums; }
  .cm-cat-tot span { font-size:12.5px; color:var(--v2-fg-3); }
  .cm-cat-stack { display:flex; height:12px; border-radius:99px; overflow:hidden; gap:2px; margin-bottom:14px; }
  .cm-cat-stack i { display:block; height:100%; }
  .cm-cat-list { display:grid; gap:2px; }
  .cm-cat-list button { display:grid; grid-template-columns:10px minmax(0, 1fr) auto auto; gap:10px; align-items:center; padding:7px 8px; margin:0 -8px; border:0; border-radius:8px; background:transparent; text-align:left; color:var(--v2-fg); font-size:13px; cursor:pointer; font-family:inherit; }
  .cm-cat-list button:hover { background:var(--v2-hover); }
  .cm-cat-list button[aria-pressed="true"] { background:color-mix(in oklch, var(--v2-accent) 14%, transparent); }
  .cm-cat-list.filtering button[aria-pressed="false"] { opacity:.5; }
  .cm-cat-list .sw { width:10px; height:10px; border-radius:3px; }
  .cm-cat-list span:nth-child(2) { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .cm-cat-list .n { font:500 12.5px var(--font-data); text-align:right; }
  .cm-cat-list .p { font:400 12px var(--font-data); color:var(--v2-fg-3); text-align:right; min-width:44px; }

  /* ── Taxa por comitê ── */
  .cm-rate { display:grid; grid-template-columns:minmax(60px, 1fr) 40px; gap:10px; align-items:center; min-width:140px; }
  .cm-track { height:8px; border-radius:99px; background:var(--v2-surface-2); overflow:hidden; }
  .cm-track i { display:block; height:100%; border-radius:99px; }
  .cm-rate b { font:500 12.5px var(--font-data); text-align:right; }

  /* ── Barra de ferramentas e tabelas ── */
  .cm-toolbar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:12px 18px; border-bottom:1px solid var(--v2-line); }
  .cm-toolbar > b { font-size:14px; font-weight:600; }
  .cm-count { font-weight:400; font-size:13px; color:var(--v2-fg-3); }
  .cm-seg { display:inline-flex; padding:3px; gap:2px; background:var(--v2-bg); border:1px solid var(--v2-line); border-radius:8px; flex-wrap:wrap; }
  .cm-seg button { border:0; background:transparent; padding:4px 12px; border-radius:5px; font-size:13px; color:var(--v2-fg-2); cursor:pointer; font-family:inherit; }
  .cm-seg button[aria-pressed="true"] { background:var(--v2-surface-2); color:var(--v2-fg); font-weight:500; box-shadow:inset 0 0 0 1px var(--v2-line); }
  .cm-search { display:inline-flex; align-items:center; gap:8px; height:32px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg-3); width:280px; max-width:100%; }
  .cm-search:focus-within { border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }
  .cm-search input { flex:1; min-width:0; border:0; outline:none; background:transparent; color:var(--v2-fg); font-size:13px; font-family:inherit; }
  .cm-search input::placeholder { color:var(--v2-fg-3); }
  .cm-chip { display:inline-flex; align-items:center; gap:6px; height:28px; padding:0 8px 0 10px; border-radius:99px; border:0; background:color-mix(in oklch, var(--v2-accent) 14%, transparent); color:var(--v2-fg); font-size:12.5px; cursor:pointer; font-family:inherit; }
  .cm-chip svg { color:var(--v2-fg-3); }
  .cm-scroll { overflow:auto; }
  .cm-table { width:100%; border-collapse:collapse; font-size:13px; }
  .cm-table thead { position:sticky; top:0; z-index:1; }
  .cm-table th { padding:9px 12px; font-size:12px; font-weight:500; color:var(--v2-fg-3); text-align:left; background:var(--v2-surface); border-bottom:1px solid var(--v2-line); white-space:nowrap; }
  .cm-table th.r, .cm-table td.r { text-align:right; }
  .cm-table td { padding:8px 12px; height:48px; border-bottom:1px solid var(--v2-line); vertical-align:middle; }
  .cm-table th:first-child, .cm-table td:first-child { padding-left:18px; }
  .cm-table th:last-child, .cm-table td:last-child { padding-right:18px; }
  .cm-table tbody tr:hover td { background:var(--v2-hover); }
  .cm-table tbody tr:last-child td { border-bottom:none; }
  .cm-table tbody tr.clickable { cursor:pointer; }
  .cm-name { display:block; font-weight:500; }
  .cm-who { display:block; max-width:340px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-size:12px; color:var(--v2-fg-3); }
  .cm-row-act { display:flex; justify-content:flex-end; gap:2px; }

  /* ── Pílulas de status ── */
  .cm-tag { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; white-space:nowrap; --c:var(--v2-fg-3); background:color-mix(in oklch, var(--c) 14%, transparent); color:color-mix(in oklch, var(--c) 72%, var(--v2-fg)); }
  .cm-tag svg { color:var(--c); }
  .cm-tag.ok { --c:var(--v2-ok); } .cm-tag.no { --c:var(--v2-crit); } .cm-tag.sched { --c:var(--v2-accent); } .cm-tag.warn { --c:var(--v2-med); }

  /* ── Botões ── */
  .cm-btn { display:inline-flex; align-items:center; gap:7px; height:32px; padding:0 12px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; font-family:var(--font-ui); white-space:nowrap; border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-fg); }
  .cm-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .cm-btn:hover:not(:disabled) { background:var(--v2-hover); border-color:var(--v2-line-strong); }
  .cm-btn.lg { height:34px; padding:0 14px; }
  .cm-btn.ghost { background:transparent; border-color:transparent; color:var(--v2-fg-2); }
  .cm-btn.primary { background:var(--v2-accent); border-color:var(--v2-accent); color:var(--v2-accent-ink); }
  .cm-btn.primary:hover:not(:disabled) { background:var(--v2-accent); filter:brightness(1.08); }
  .cm-btn.danger { background:var(--v2-crit); border-color:var(--v2-crit); color:#fff; }
  .cm-btn.danger:hover:not(:disabled) { background:var(--v2-crit); filter:brightness(1.08); }
  .cm-btn.danger-text { background:transparent; border-color:transparent; color:var(--v2-crit); margin-right:auto; }
  .cm-btn.danger-text:hover:not(:disabled) { background:color-mix(in oklch, var(--v2-crit) 10%, transparent); border-color:transparent; }
  .cm-icon-btn { display:grid; place-items:center; width:30px; height:30px; border-radius:8px; border:0; background:transparent; color:var(--v2-fg-2); cursor:pointer; }
  .cm-icon-btn:hover { background:var(--v2-hover); color:var(--v2-fg); }
  .cm-icon-btn.danger:hover { color:var(--v2-crit); background:color-mix(in oklch, var(--v2-crit) 12%, transparent); }

  /* ── Painel lateral ── */
  .cm-people { display:flex; flex-wrap:wrap; gap:6px; }
  .cm-people span { display:inline-flex; align-items:center; height:26px; padding:0 10px; border-radius:99px; background:var(--v2-surface-2); border:1px solid var(--v2-line); font-size:12.5px; }
  .cm-note { font-size:13px; line-height:1.55; color:var(--v2-fg-2); white-space:pre-wrap; padding:10px 12px; border-radius:8px; background:var(--v2-surface-2); border:1px solid var(--v2-line); overflow-wrap:anywhere; }
  .cm-note.warn { border-color:color-mix(in oklch, var(--v2-med) 40%, transparent); }
  .cm-confirm { display:flex; align-items:center; gap:8px; flex-wrap:wrap; width:100%; font-size:13px; }
  .cm-confirm span { margin-right:auto; color:var(--v2-fg-2); }

  /* ── Formulário ── */
  .cm-form { display:grid; gap:14px; padding-top:6px; font-family:var(--font-ui); }
  .cm-row2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  @media (max-width: 560px) { .cm-row2 { grid-template-columns:1fr; } }
  .cm-field { display:grid; gap:6px; min-width:0; }
  .cm-field label { font-size:12.5px; font-weight:500; color:var(--v2-fg-2); }
  .cm-req { color:var(--v2-crit); }
  .cm-input { width:100%; height:34px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg); font-size:13px; font-family:inherit; outline:none; }
  textarea.cm-input { height:auto; min-height:72px; padding:8px 10px; resize:vertical; line-height:1.5; }
  .cm-input:focus { border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }
`;

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtDate(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function parseIso(d: string) {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day);
}
/** Dias de hoje até a data (negativo = já passou). */
function daysFromToday(d: string) {
  return Math.round((parseIso(d).getTime() - parseIso(todayIso()).getTime()) / 86400000);
}
function statusBadgeClass(s: string) {
  const v = s.trim().toLowerCase();
  if (v === "realizado" || v === "realizada") return "ok";
  if (v.startsWith("não real") || v.startsWith("nao real")) return "no";
  if (v === "agendado" || v === "agendada") return "sched";
  if (v === "cancelado" || v === "cancelada") return "cancel";
  return "warn";
}
/** Agendada, mas a data já passou sem o status ser atualizado. */
const isOverdue = (r: ComiteRow) => statusBadgeClass(r.status) === "sched" && r.data < todayIso();
const people = (s: string | null) =>
  (s ?? "")
    .split(",")
    .map((x) => x.trim())
    .filter(Boolean);

function StatusTag({ row }: { row: ComiteRow }) {
  if (isOverdue(row))
    return (
      <span className="cm-tag warn">
        <AlertTriangle size={11} /> Agendado · data passou
      </span>
    );
  const cls = statusBadgeClass(row.status);
  const Icon = cls === "ok" ? CheckCircle2 : cls === "no" ? XCircle : cls === "cancel" ? X : Clock;
  return (
    <span className={`cm-tag ${cls}`}>
      <Icon size={11} /> {row.status}
    </span>
  );
}

function MesTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  label?: string;
  payload?: Array<{ dataKey: string; value: number }>;
}) {
  if (!active || !payload?.length) return null;
  const get = (k: string) => payload.find((p) => p.dataKey === k)?.value ?? 0;
  return (
    <div
      style={{
        display: "grid",
        gap: 2,
        padding: "8px 10px",
        background: "var(--v2-surface-2)",
        border: "1px solid var(--v2-line-strong)",
        borderRadius: 8,
        fontSize: 12,
        boxShadow: "0 12px 32px rgba(0,0,0,0.3)",
      }}
    >
      <b>{label}</b>
      <span style={{ color: "var(--v2-fg-2)", fontFamily: "var(--font-data)" }}>
        Realizadas {get("realizadas")}
      </span>
      <span style={{ color: "var(--v2-fg-2)", fontFamily: "var(--font-data)" }}>
        Não realizadas {get("naoRealizadas")}
      </span>
    </div>
  );
}

// ── Dialog ─────────────────────────────────────────────────────────────────────
function ComiteDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: ComiteRow | null;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const upsertFn = useServerFn(upsertComite);
  const [nome, setNome] = React.useState("");
  const [tipo, setTipo] = React.useState<string>(TIPOS_SUGERIDOS[0]);
  const [periodicidade, setPeriodicidade] = React.useState<string>("Mensal");
  const [participantes, setParticipantes] = React.useState("");
  const [data, setData] = React.useState(todayIso());
  const [status, setStatus] = React.useState<string>("Agendado");
  const [observacao, setObservacao] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setNome(editing?.nome ?? "");
      setTipo(editing?.tipo ?? TIPOS_SUGERIDOS[0]);
      setPeriodicidade(editing?.periodicidade ?? "Mensal");
      setParticipantes(editing?.participantes ?? "");
      setData(editing?.data ?? todayIso());
      setStatus(editing?.status ?? "Agendado");
      setObservacao(editing?.observacao ?? "");
    }
  }, [open, editing]);

  const save = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          id: editing?.id,
          nome: nome.trim(),
          tipo: tipo.trim(),
          periodicidade: periodicidade.trim(),
          participantes: participantes.trim() || null,
          data,
          status: status.trim(),
          observacao: observacao.trim() || null,
          created_by: user?.id ?? null,
        },
      }),
    onSuccess: () => {
      toast.success(editing ? "Comitê atualizado" : "Comitê criado");
      qc.invalidateQueries({ queryKey: ["comites"] });
      qc.invalidateQueries({ queryKey: ["comites-overview"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const valid = nome.trim() && tipo.trim() && periodicidade.trim() && data && status.trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="font-ui"
        style={{
          background: "var(--v2-surface)",
          border: "1px solid var(--v2-line-strong)",
          borderRadius: 12,
          maxWidth: 560,
          color: "var(--v2-fg)",
        }}
      >
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <DialogHeader>
          <DialogTitle style={{ fontSize: 16, fontWeight: 600 }}>
            {editing ? "Editar reunião" : "Nova reunião de comitê"}
          </DialogTitle>
        </DialogHeader>
        <div className="cm-form">
          <div className="cm-row2">
            <div className="cm-field">
              <label htmlFor="cm-f-nome">
                Comitê <span className="cm-req">*</span>
              </label>
              <input
                id="cm-f-nome"
                className="cm-input"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                maxLength={200}
                placeholder="Ex.: Comitê de Riscos"
              />
            </div>
            <div className="cm-field">
              <label htmlFor="cm-f-tipo">
                Tipo <span className="cm-req">*</span>
              </label>
              <input
                id="cm-f-tipo"
                className="cm-input"
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                list="cm-tipo-list"
                maxLength={120}
              />
              <datalist id="cm-tipo-list">
                {TIPOS_SUGERIDOS.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
          </div>
          <div className="cm-row2">
            <div className="cm-field">
              <label htmlFor="cm-f-per">
                Periodicidade <span className="cm-req">*</span>
              </label>
              <select
                id="cm-f-per"
                className="cm-input"
                value={periodicidade}
                onChange={(e) => setPeriodicidade(e.target.value)}
              >
                {PERIODICIDADES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div className="cm-field">
              <label htmlFor="cm-f-data">
                Data <span className="cm-req">*</span>
              </label>
              <input
                id="cm-f-data"
                type="date"
                className="cm-input"
                value={data}
                onChange={(e) => setData(e.target.value)}
              />
            </div>
          </div>
          <div className="cm-field">
            <label htmlFor="cm-f-st">
              Status <span className="cm-req">*</span>
            </label>
            <select
              id="cm-f-st"
              className="cm-input"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="cm-field">
            <label htmlFor="cm-f-part">Participantes</label>
            <textarea
              id="cm-f-part"
              className="cm-input"
              value={participantes}
              onChange={(e) => setParticipantes(e.target.value)}
              rows={3}
              maxLength={5000}
              placeholder="Nomes ou áreas separados por vírgula"
            />
          </div>
          <div className="cm-field">
            <label htmlFor="cm-f-obs">Observação</label>
            <textarea
              id="cm-f-obs"
              className="cm-input"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={3}
              maxLength={5000}
              placeholder="Pauta, decisões, próximos passos…"
            />
          </div>
        </div>
        <DialogFooter style={{ gap: 8, paddingTop: 8 }}>
          <button
            className="cm-btn ghost"
            onClick={() => onOpenChange(false)}
            disabled={save.isPending}
          >
            Cancelar
          </button>
          <button
            className="cm-btn primary"
            disabled={!valid || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? (
              <>
                <Loader2 size={13} className="cm-spin" /> Salvando…
              </>
            ) : (
              "Salvar"
            )}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════
export function ComitesDashboard() {
  // ── back-end UNCHANGED ─────────────────────────────────────────────────────
  const qc = useQueryClient();
  const { can, isAdmin, isModuleAdmin } = usePermissions();
  const canView = isAdmin || isModuleAdmin("comites") || can("comites", "view");
  const canCreate = isAdmin || isModuleAdmin("comites") || can("comites", "create");
  const canEdit = isAdmin || isModuleAdmin("comites") || can("comites", "edit");
  const canDelete = isAdmin || isModuleAdmin("comites") || can("comites", "delete");

  const fetchList = useServerFn(listComites);
  const fetchOverview = useServerFn(getComitesOverview);
  const deleteFn = useServerFn(deleteComite);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["comites"],
    queryFn: () => fetchList(),
    enabled: canView,
  });
  const { data: overview } = useQuery({
    queryKey: ["comites-overview"],
    queryFn: () => fetchOverview(),
    enabled: canView,
  });

  const [search, setSearch] = React.useState("");
  const [statusFilter, setStatusFilter] = React.useState<string>("todos");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ComiteRow | null>(null);
  const [activeTipo, setActiveTipo] = React.useState<string | null>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);

  const filtered = React.useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (statusFilter !== "todos" && r.status.toLowerCase() !== statusFilter.toLowerCase())
          return false;
        if (activeTipo && r.tipo !== activeTipo) return false;
        if (!s) return true;
        return (
          r.nome.toLowerCase().includes(s) ||
          r.tipo.toLowerCase().includes(s) ||
          (r.participantes ?? "").toLowerCase().includes(s)
        );
      })
      .sort((a, b) => b.data.localeCompare(a.data));
  }, [rows, search, statusFilter, activeTipo]);

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Comitê removido");
      qc.invalidateQueries({ queryKey: ["comites"] });
      qc.invalidateQueries({ queryKey: ["comites-overview"] });
      setOpenId(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  // ──────────────────────────────────────────────────────────────────────────

  // Derivados (calculados antes de qualquer retorno, para manter a ordem dos hooks)
  const porTipo = React.useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r) => map.set(r.tipo, (map.get(r.tipo) ?? 0) + 1));
    return [...map.entries()]
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [rows]);

  // Por comitê (agrupado pelo nome): taxa = realizadas ÷ (realizadas + não realizadas)
  const porComite = React.useMemo(() => {
    const map = new Map<
      string,
      {
        nome: string;
        tipo: string;
        per: string;
        lastData: string;
        total: number;
        real: number;
        nao: number;
        lastReal: string | null;
      }
    >();
    rows.forEach((r) => {
      const c = map.get(r.nome) ?? {
        nome: r.nome,
        tipo: r.tipo,
        per: r.periodicidade,
        lastData: r.data,
        total: 0,
        real: 0,
        nao: 0,
        lastReal: null,
      };
      // tipo e periodicidade da reunião mais recente
      if (r.data >= c.lastData) {
        c.lastData = r.data;
        c.tipo = r.tipo;
        c.per = r.periodicidade;
      }
      c.total++;
      const cls = statusBadgeClass(r.status);
      if (cls === "ok") {
        c.real++;
        if (!c.lastReal || r.data > c.lastReal) c.lastReal = r.data;
      } else if (cls === "no") c.nao++;
      map.set(r.nome, c);
    });
    return [...map.values()].sort((a, b) => b.total - a.total);
  }, [rows]);

  const agenda = React.useMemo(() => {
    const ag = rows.filter((r) => statusBadgeClass(r.status) === "sched");
    const today = todayIso();
    return {
      late: ag.filter((r) => r.data < today).sort((a, b) => a.data.localeCompare(b.data)),
      next: ag.filter((r) => r.data >= today).sort((a, b) => a.data.localeCompare(b.data)),
    };
  }, [rows]);

  if (!canView && !canCreate && !canEdit && !canDelete)
    return (
      <div className="cm-root">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="cm-state">
          <Lock size={22} color="var(--v2-crit)" />
          <span style={{ fontSize: 15, fontWeight: 600 }}>Acesso restrito</span>
          <span style={{ fontSize: 13, color: "var(--v2-fg-3)" }}>
            Você não tem permissão para acessar este módulo.
          </span>
        </div>
      </div>
    );

  const rate = overview?.percentRealizacao ?? 0;
  const rateColor = rate >= 85 ? "var(--v2-ok)" : rate >= 70 ? "var(--v2-med)" : "var(--v2-crit)";
  const typesTotal = porTipo.reduce((a, t) => a + t.value, 0);
  const pctTxt = (v: number) =>
    typesTotal > 0 ? `${((v / typesTotal) * 100).toFixed(1).replace(".", ",")}%` : "—";
  const open = openId ? (rows.find((r) => r.id === openId) ?? null) : null;
  const openPeople = people(open?.participantes ?? null);

  const pickStatus = (s: string | null) =>
    setStatusFilter((cur) => (s === null || cur === s ? "todos" : s));
  const openRow = (id: string, askDelete = false) => {
    setOpenId(id);
    setConfirmDelete(askDelete);
  };
  const startEdit = (r: ComiteRow) => {
    setOpenId(null);
    setEditing(r);
    setDialogOpen(true);
  };

  const agendaItem = (r: ComiteRow) => {
    const n = daysFromToday(r.data);
    const d = parseIso(r.data);
    return (
      <button key={r.id} type="button" onClick={() => openRow(r.id)}>
        <span className="cm-cal">
          <b>{String(d.getDate()).padStart(2, "0")}</b>
          <small>{MES[d.getMonth()]}</small>
        </span>
        <span className="t">
          <b>{r.nome}</b>
          <small>
            {r.tipo} · {r.periodicidade}
          </small>
        </span>
        {n < 0 ? (
          <span className="cm-days warn">há {-n} d</span>
        ) : (
          <span className={`cm-days${n <= 7 ? " soon" : ""}`}>
            {n === 0 ? "hoje" : `em ${n} d`}
          </span>
        )}
      </button>
    );
  };

  return (
    <div className="cm-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Cabeçalho ────────────────────────────────────────────────────── */}
      <div className="cm-ph">
        <div>
          <h1 className="cm-ph-title">Comitês</h1>
          <p className="cm-ph-sub">Agenda, execução e taxa de realização das reuniões de comitês</p>
        </div>
        {canCreate && (
          <button
            className="cm-btn primary lg"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus size={14} /> Nova reunião
          </button>
        )}
      </div>

      {/* ── KPIs (clique filtra a tabela) ─────────────────────────────────── */}
      <div className="cm-kpis">
        <button
          type="button"
          className="cm-kpi"
          aria-pressed={false}
          onClick={() => pickStatus(null)}
        >
          <span className="cm-kpi-label">Reuniões</span>
          <span className="cm-kpi-value">{overview?.totalReunioes ?? "—"}</span>
          <span className="cm-kpi-foot">
            {porComite.length} {porComite.length === 1 ? "comitê" : "comitês"}
          </span>
        </button>
        <button
          type="button"
          className="cm-kpi"
          aria-pressed={statusFilter === "Realizado"}
          onClick={() => pickStatus("Realizado")}
        >
          <span className="cm-kpi-label">
            <span className="cm-sw" style={{ background: "var(--v2-ok)" }} /> Realizadas
          </span>
          <span className="cm-kpi-value">{overview?.realizadas ?? "—"}</span>
          <span className="cm-kpi-foot">reuniões concluídas</span>
        </button>
        <div className="cm-kpi">
          <span className="cm-kpi-label">Taxa de realização</span>
          <span className="cm-kpi-value">{overview ? `${rate}%` : "—"}</span>
          <div className="cm-meter" aria-hidden="true">
            <i style={{ width: `${rate}%`, background: rateColor }} />
          </div>
          <span className="cm-kpi-foot">realizadas ÷ (realizadas + não realizadas)</span>
        </div>
        <button
          type="button"
          className="cm-kpi"
          aria-pressed={statusFilter === "Não Realizado"}
          onClick={() => pickStatus("Não Realizado")}
        >
          <span className="cm-kpi-label">
            {(overview?.naoRealizadas ?? 0) > 0 && (
              <span className="cm-sw" style={{ background: "var(--v2-crit)" }} />
            )}
            Não realizadas
          </span>
          <span className="cm-kpi-value">{overview?.naoRealizadas ?? "—"}</span>
          <span className="cm-kpi-foot">previstas e não aconteceram</span>
        </button>
        <button
          type="button"
          className="cm-kpi"
          aria-pressed={statusFilter === "Agendado"}
          onClick={() => pickStatus("Agendado")}
        >
          <span className="cm-kpi-label">
            {agenda.late.length > 0 && (
              <span className="cm-sw" style={{ background: "var(--v2-med)" }} />
            )}
            Agendadas
          </span>
          <span className="cm-kpi-value">{overview?.agendadas ?? "—"}</span>
          <span className="cm-kpi-foot">
            {agenda.late.length > 0
              ? `${agenda.late.length} com a data já passada`
              : agenda.next[0]
                ? `próxima em ${fmtDate(agenda.next[0].data)}`
                : "nenhuma"}
          </span>
        </button>
      </div>

      {/* ── Reuniões por mês + agenda ──────────────────────────────────────── */}
      <div className="cm-grid">
        <div className="cm-card cm-span-2">
          <div className="cm-card-hdr">
            <div>
              <h2 className="cm-card-title">Reuniões por mês</h2>
              <p className="cm-card-sub">Últimos 12 meses</p>
            </div>
            <div className="cm-legend">
              <span>
                <span className="cm-sw" style={{ background: "var(--v2-ok)" }} /> Realizadas
              </span>
              <span>
                <span className="cm-sw" style={{ background: "var(--v2-crit)" }} /> Não realizadas
              </span>
            </div>
          </div>
          <div className="cm-card-body" style={{ height: 270 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={overview?.porMes ?? []}
                margin={{ top: 18, right: 8, left: 0, bottom: 0 }}
                barCategoryGap="25%"
                barGap={3}
              >
                <CartesianGrid stroke="var(--v2-line)" vertical={false} />
                <XAxis dataKey="m" tickLine={false} axisLine={false} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={32} />
                <Tooltip
                  content={<MesTooltip />}
                  cursor={{ fill: "color-mix(in oklch, var(--v2-accent) 7%, transparent)" }}
                />
                {(
                  [
                    ["realizadas", "Realizadas", "var(--v2-ok)"],
                    ["naoRealizadas", "Não realizadas", "var(--v2-crit)"],
                  ] as const
                ).map(([key, name, color]) => (
                  <Bar
                    key={key}
                    dataKey={key}
                    name={name}
                    fill={color}
                    radius={[3, 3, 0, 0]}
                    maxBarSize={16}
                  >
                    <LabelList
                      dataKey={key}
                      position="top"
                      formatter={(v: number) => (v > 0 ? v : "")}
                      style={{
                        fill: "var(--v2-fg-2)",
                        fontSize: 11,
                        fontWeight: 500,
                        fontFamily: "var(--font-data)",
                      }}
                    />
                  </Bar>
                ))}
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="cm-card cm-fit">
          <div className="cm-card-hdr">
            <div>
              <h2 className="cm-card-title">Agenda</h2>
              <p className="cm-card-sub">
                {agenda.next.length}{" "}
                {agenda.next.length === 1 ? "reunião agendada" : "reuniões agendadas"}
                {agenda.late.length > 0 && ` · ${agenda.late.length} com a data já passada`}
              </p>
            </div>
          </div>
          <div className="cm-card-body">
            {agenda.late.length === 0 && agenda.next.length === 0 ? (
              <div className="cm-empty">Nenhuma reunião agendada.</div>
            ) : (
              <>
                {agenda.late.length > 0 && (
                  <>
                    <div className="cm-sub-h">
                      <AlertTriangle size={13} /> Data passou, status não atualizado
                    </div>
                    <div className="cm-agenda">{agenda.late.map(agendaItem)}</div>
                    {agenda.next.length > 0 && <div className="cm-sub-h">Próximas</div>}
                  </>
                )}
                <div className="cm-agenda">{agenda.next.map(agendaItem)}</div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Por comitê + por tipo ──────────────────────────────────────────── */}
      <div className="cm-grid">
        <div className="cm-card cm-span-2">
          <div className="cm-card-hdr" style={{ paddingBottom: 10 }}>
            <div>
              <h2 className="cm-card-title">Por comitê</h2>
              <p className="cm-card-sub">
                Reuniões de cada comitê e quanto do combinado foi cumprido
              </p>
            </div>
          </div>
          {porComite.length === 0 ? (
            <div className="cm-empty">Sem reuniões cadastradas.</div>
          ) : (
            <div className="cm-scroll" style={{ maxHeight: 420 }}>
              <table className="cm-table">
                <thead>
                  <tr>
                    <th>Comitê</th>
                    <th>Periodicidade</th>
                    <th className="r">Reuniões</th>
                    <th className="r">Realizadas</th>
                    <th>Taxa de realização</th>
                    <th>Última realizada</th>
                  </tr>
                </thead>
                <tbody>
                  {porComite.map((c) => {
                    const denom = c.real + c.nao;
                    const p = denom > 0 ? Math.round((c.real / denom) * 100) : null;
                    const col =
                      p === null
                        ? "var(--v2-fg-3)"
                        : p >= 85
                          ? "var(--v2-ok)"
                          : p >= 70
                            ? "var(--v2-med)"
                            : "var(--v2-crit)";
                    return (
                      <tr key={c.nome}>
                        <td>
                          <span className="cm-name">{c.nome}</span>
                          <span className="dim" style={{ fontSize: 12 }}>
                            {c.tipo}
                          </span>
                        </td>
                        <td style={{ color: "var(--v2-fg-2)" }}>{c.per}</td>
                        <td className="r mono">{c.total}</td>
                        <td className="r mono">{c.real}</td>
                        <td>
                          {p === null ? (
                            <span className="dim">sem histórico</span>
                          ) : (
                            <div
                              className="cm-rate"
                              title={`${c.real} realizadas · ${c.nao} não realizadas`}
                            >
                              <div className="cm-track">
                                <i style={{ width: `${p}%`, background: col }} />
                              </div>
                              <b>{p}%</b>
                            </div>
                          )}
                        </td>
                        <td className="mono dim">{fmtDate(c.lastReal)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="cm-card">
          <div className="cm-card-hdr">
            <div>
              <h2 className="cm-card-title">Por tipo</h2>
              <p className="cm-card-sub">Clique para filtrar as reuniões</p>
            </div>
          </div>
          <div className="cm-card-body">
            {porTipo.length === 0 ? (
              <div className="cm-empty">Sem dados.</div>
            ) : (
              <>
                <div className="cm-cat-tot">
                  <b>{typesTotal}</b>
                  <span>reuniões cadastradas</span>
                </div>
                <div
                  className="cm-cat-stack"
                  role="img"
                  aria-label="Composição das reuniões por tipo"
                >
                  {porTipo.map((t, i) => (
                    <i
                      key={t.name}
                      style={{
                        width: `${(t.value / typesTotal) * 100}%`,
                        background: CAT_COLORS[i % CAT_COLORS.length],
                      }}
                      title={`${t.name}: ${t.value} · ${pctTxt(t.value)}`}
                    />
                  ))}
                </div>
                <div className={`cm-cat-list${activeTipo ? " filtering" : ""}`}>
                  {porTipo.map((t, i) => (
                    <button
                      key={t.name}
                      type="button"
                      aria-pressed={activeTipo === t.name}
                      onClick={() => setActiveTipo((cur) => (cur === t.name ? null : t.name))}
                    >
                      <span
                        className="sw"
                        style={{ background: CAT_COLORS[i % CAT_COLORS.length] }}
                      />
                      <span>{t.name}</span>
                      <span className="n">{t.value}</span>
                      <span className="p">{pctTxt(t.value)}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Reuniões ───────────────────────────────────────────────────────── */}
      <div className="cm-card">
        <div className="cm-toolbar">
          <b>
            Reuniões{" "}
            <span className="cm-count">
              {filtered.length === rows.length
                ? rows.length
                : `${filtered.length} de ${rows.length}`}
            </span>
          </b>
          <div className="cm-seg" role="group" aria-label="Status">
            {(
              [
                ["todos", "Todos"],
                ["Agendado", "Agendadas"],
                ["Realizado", "Realizadas"],
                ["Não Realizado", "Não realizadas"],
                ["Cancelado", "Canceladas"],
              ] as const
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                aria-pressed={statusFilter === k}
                onClick={() => setStatusFilter(k)}
              >
                {l}
              </button>
            ))}
          </div>
          <label className="cm-search">
            <Search size={14} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar reunião, tipo ou participante"
              aria-label="Buscar reuniões"
            />
          </label>
          {activeTipo && (
            <button type="button" className="cm-chip" onClick={() => setActiveTipo(null)}>
              Tipo: {activeTipo} <X size={14} aria-label="Remover filtro" />
            </button>
          )}
        </div>

        {isLoading ? (
          <div className="cm-empty">
            <Loader2
              size={14}
              className="cm-spin"
              style={{ display: "inline", verticalAlign: "-2px" }}
            />{" "}
            Carregando…
          </div>
        ) : filtered.length === 0 ? (
          <div className="cm-empty">
            {search || statusFilter !== "todos" || activeTipo
              ? "Nenhuma reunião com esses filtros."
              : `Nenhuma reunião de comitê cadastrada.${canCreate ? ' Clique em "Nova reunião" para começar.' : ""}`}
          </div>
        ) : (
          <div className="cm-scroll" style={{ maxHeight: 620 }}>
            <table className="cm-table">
              <thead>
                <tr>
                  <th style={{ width: 110 }}>Data</th>
                  <th>Reunião</th>
                  <th>Tipo</th>
                  <th>Periodicidade</th>
                  <th>Status</th>
                  {(canEdit || canDelete) && (
                    <th>
                      <span style={{ fontSize: 0 }}>Ações</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => {
                  const ps = people(r.participantes);
                  return (
                    <tr
                      key={r.id}
                      className="clickable"
                      tabIndex={0}
                      onClick={() => openRow(r.id)}
                      onKeyDown={(e) => e.key === "Enter" && openRow(r.id)}
                    >
                      <td className="mono dim" style={{ whiteSpace: "nowrap" }}>
                        {fmtDate(r.data)}
                      </td>
                      <td>
                        <span className="cm-name">{r.nome}</span>
                        {ps.length > 0 && (
                          <span className="cm-who" title={r.participantes ?? undefined}>
                            {ps.length} {ps.length === 1 ? "participante" : "participantes"} ·{" "}
                            {ps.join(", ")}
                          </span>
                        )}
                      </td>
                      <td style={{ color: "var(--v2-fg-2)" }}>{r.tipo}</td>
                      <td style={{ color: "var(--v2-fg-2)" }}>{r.periodicidade}</td>
                      <td>
                        <StatusTag row={r} />
                      </td>
                      {(canEdit || canDelete) && (
                        <td>
                          <div className="cm-row-act" onClick={(e) => e.stopPropagation()}>
                            {canEdit && (
                              <button
                                className="cm-icon-btn"
                                title="Editar"
                                aria-label="Editar"
                                onClick={() => startEdit(r)}
                              >
                                <Pencil size={14} />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                className="cm-icon-btn danger"
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
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Painel lateral: reunião ──────────────────────────────────────── */}
      <DetailSheet
        open={!!open}
        onOpenChange={(o) => {
          if (!o) {
            setOpenId(null);
            setConfirmDelete(false);
          }
        }}
        eyebrow={
          open
            ? `${parseIso(open.data).toLocaleDateString("pt-BR", { weekday: "long" })} · ${fmtDate(open.data)}`
            : null
        }
        title={open?.nome ?? ""}
        badges={
          open && (
            <>
              <StatusTag row={open} />
              <span className="cm-tag">{open.tipo}</span>
            </>
          )
        }
        footer={
          open && (canEdit || canDelete) ? (
            confirmDelete ? (
              <div className="cm-confirm">
                <span>Remover esta reunião?</span>
                <button
                  className="cm-btn ghost"
                  onClick={() => setConfirmDelete(false)}
                  disabled={del.isPending}
                >
                  Cancelar
                </button>
                <button
                  className="cm-btn danger"
                  onClick={() => del.mutate(open.id)}
                  disabled={del.isPending}
                >
                  {del.isPending ? <Loader2 size={13} className="cm-spin" /> : <Trash2 size={13} />}{" "}
                  Remover
                </button>
              </div>
            ) : (
              <>
                {canDelete && (
                  <button className="cm-btn danger-text" onClick={() => setConfirmDelete(true)}>
                    Remover
                  </button>
                )}
                {canEdit && (
                  <button className="cm-btn primary" onClick={() => startEdit(open)}>
                    <Pencil size={13} /> Editar reunião
                  </button>
                )}
              </>
            )
          ) : null
        }
      >
        {open && (
          <>
            {isOverdue(open) && (
              <div className="cm-note warn">
                A data desta reunião já passou e ela ainda está como Agendado. Atualize para
                Realizado ou Não realizado para entrar na taxa de realização.
              </div>
            )}
            <DetailSection title="Reunião">
              <DetailList
                items={[
                  ["Data", fmtDate(open.data), true],
                  ["Tipo", open.tipo],
                  ["Periodicidade", open.periodicidade],
                  ["Status", open.status],
                  ["Cadastrada em", new Date(open.created_at).toLocaleDateString("pt-BR"), true],
                ]}
              />
            </DetailSection>
            <DetailSection title={`Participantes · ${openPeople.length}`}>
              {openPeople.length > 0 ? (
                <div className="cm-people">
                  {openPeople.map((p) => (
                    <span key={p}>{p}</span>
                  ))}
                </div>
              ) : (
                <p style={{ margin: 0, fontSize: 13, color: "var(--v2-fg-3)" }}>
                  Nenhum participante informado.
                </p>
              )}
            </DetailSection>
            <DetailSection title="Observação">
              {open.observacao ? (
                <div className="cm-note">{open.observacao}</div>
              ) : (
                <p style={{ margin: 0, fontSize: 13, color: "var(--v2-fg-3)" }}>Sem observação.</p>
              )}
            </DetailSection>
          </>
        )}
      </DetailSheet>

      <ComiteDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
    </div>
  );
}
