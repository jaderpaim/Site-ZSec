import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ExternalLink, Loader2, Lock, Pencil, Plus, Search, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useAuth } from "@/lib/auth-context";
import { usePermissions } from "@/lib/use-permissions";
import { listPilulas, upsertPilula, deletePilula, type PilulaRow } from "@/lib/pilulas.functions";
import { DetailSection, DetailSheet } from "@/components/layout/DetailSheet";

const MES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
const MES_LONGO = [
  "Janeiro",
  "Fevereiro",
  "Março",
  "Abril",
  "Maio",
  "Junho",
  "Julho",
  "Agosto",
  "Setembro",
  "Outubro",
  "Novembro",
  "Dezembro",
];
const DAY_MS = 86_400_000;

function fmtDate(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}
function todayIso() {
  const d = new Date();
  return toIso(d);
}
function toIso(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
/** "2026-10-02" → Date local à meia-noite (sem deslocamento de fuso). */
function parseIso(s: string) {
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}
function startOfToday() {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}
const daysAgo = (iso: string) =>
  Math.round((startOfToday().getTime() - parseIso(iso).getTime()) / DAY_MS);
/** Segunda-feira da semana da data. */
function mondayOf(d: Date) {
  const m = new Date(d);
  m.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return m;
}

type Periodo = "1m" | "3m" | "all" | "custom";

// ── CSS (interface v2) ─────────────────────────────────────────────────────────
const CSS = `
  .ps-root { font-family:var(--font-ui); color:var(--v2-fg); display:flex; flex-direction:column; gap:20px; font-size:14px; }
  .ps-root * { box-sizing:border-box; }
  .ps-root ::-webkit-scrollbar { width:6px; height:6px; }
  .ps-root ::-webkit-scrollbar-thumb { background:var(--v2-line-strong); border-radius:3px; }
  .ps-root :focus-visible { outline:2px solid var(--v2-accent); outline-offset:2px; }
  .ps-root .dim { color:var(--v2-fg-3); }
  @keyframes ps-spin { to{transform:rotate(360deg)} }
  .ps-spin { animation:ps-spin .8s linear infinite; }

  .ps-ph { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  .ps-ph-title { font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.2; margin:0; }
  .ps-ph-sub { margin:4px 0 0; font-size:13px; color:var(--v2-fg-3); }
  .ps-state { display:flex; flex-direction:column; align-items:center; gap:10px; padding:48px 24px; text-align:center; background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; }

  /* KPIs */
  .ps-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(190px, 1fr)); background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
  .ps-kpi { padding:16px 18px 14px; display:grid; gap:2px; align-content:start; box-shadow:1px 0 0 var(--v2-line), 0 1px 0 var(--v2-line); min-width:0; }
  .ps-kpi-label { font-size:12.5px; color:var(--v2-fg-2); display:flex; align-items:center; gap:6px; }
  .ps-kpi-value { font-size:28px; font-weight:600; letter-spacing:-0.02em; line-height:1.25; font-variant-numeric:tabular-nums; }
  .ps-kpi-foot { font-size:12px; color:var(--v2-fg-3); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .ps-sw { width:8px; height:8px; border-radius:2px; display:inline-block; flex-shrink:0; }

  /* Cartões */
  .ps-card { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; min-width:0; overflow:hidden; }
  .ps-card-hdr { padding:14px 18px 4px; }
  .ps-card-title { font-size:14px; font-weight:600; margin:0; }
  .ps-card-sub { margin:2px 0 0; font-size:12.5px; color:var(--v2-fg-3); }
  .ps-card-body { padding:12px 18px 18px; }

  /* Ritmo de publicação: mapa de calor de 52 semanas */
  .ps-rhythm { display:grid; grid-template-columns:minmax(0, 1fr) 220px; gap:28px; align-items:center; }
  @media (max-width: 1000px) {
    .ps-rhythm { grid-template-columns:minmax(0, 1fr); }
    .ps-rstats { grid-template-columns:repeat(3, minmax(0, 1fr)); border-left:0; padding-left:0; border-top:1px solid var(--v2-line); padding-top:16px; }
  }
  @media (max-width: 560px) { .ps-rstats { grid-template-columns:1fr; } }
  .ps-heat-wrap { overflow-x:auto; padding-bottom:4px; }
  /* Quadrados fluidos: ocupam a largura disponível (mínimo 9px, máximo ~20px) */
  .ps-heat { display:grid; grid-template-columns:28px repeat(53, minmax(9px, 1fr)); grid-template-rows:18px; grid-auto-rows:auto; gap:3px; width:100%; min-width:560px; max-width:1180px; margin:0 auto; }
  .ps-heat .mlbl { font:400 11px var(--font-data); color:var(--v2-fg-3); white-space:nowrap; }
  .ps-heat .dlbl { font:400 10.5px var(--font-data); color:var(--v2-fg-3); align-self:center; line-height:1; }
  .ps-heat .c { width:100%; max-width:20px; aspect-ratio:1; height:auto; justify-self:center; border-radius:3px; background:var(--v2-surface-2); box-shadow:inset 0 0 0 1px var(--v2-line); cursor:pointer; padding:0; border:0; }
  .ps-heat .c.l1 { background:color-mix(in oklch, var(--v2-accent) 45%, var(--v2-surface-2)); box-shadow:none; }
  .ps-heat .c.l2 { background:var(--v2-accent); box-shadow:none; }
  .ps-heat .c.out { visibility:hidden; }
  .ps-heat .c.sel { outline:2px solid var(--v2-fg); outline-offset:1px; }
  .ps-heat .c:hover { outline:2px solid var(--v2-fg-3); outline-offset:1px; }
  .ps-heat-leg { display:flex; align-items:center; justify-content:flex-end; gap:6px; margin:10px auto 0; max-width:1180px; font-size:12px; color:var(--v2-fg-3); }
  .ps-heat-leg i { width:11px; height:11px; border-radius:3px; display:inline-block; }
  .ps-rstats { display:grid; gap:18px; border-left:1px solid var(--v2-line); padding-left:24px; }
  .ps-rstat small { display:block; font-size:12.5px; color:var(--v2-fg-2); }
  .ps-rstat b { display:block; font-size:22px; font-weight:600; letter-spacing:-0.02em; font-variant-numeric:tabular-nums; margin-top:2px; }
  .ps-rstat span { display:block; font-size:12px; color:var(--v2-fg-3); margin-top:1px; }

  /* Biblioteca */
  .ps-toolbar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:12px 18px; border-bottom:1px solid var(--v2-line); }
  .ps-toolbar > b { font-size:14px; font-weight:600; }
  .ps-count { font-weight:400; font-size:13px; color:var(--v2-fg-3); }
  .ps-seg { display:inline-flex; padding:3px; gap:2px; background:var(--v2-bg); border:1px solid var(--v2-line); border-radius:8px; flex-wrap:wrap; }
  .ps-seg button { border:0; background:transparent; padding:4px 12px; border-radius:5px; font-size:13px; color:var(--v2-fg-2); cursor:pointer; font-family:inherit; }
  .ps-seg button[aria-pressed="true"] { background:var(--v2-surface-2); color:var(--v2-fg); font-weight:500; box-shadow:inset 0 0 0 1px var(--v2-line); }
  .ps-range { display:inline-flex; align-items:center; gap:6px; font-size:13px; color:var(--v2-fg-2); }
  .ps-range input { height:32px; border:1px solid var(--v2-line); background:var(--v2-bg); color:var(--v2-fg); border-radius:8px; font:inherit; font-size:13px; padding:0 8px; }
  .ps-search { display:inline-flex; align-items:center; gap:8px; height:32px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg-3); width:280px; max-width:100%; margin-left:auto; }
  .ps-search:focus-within { border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }
  .ps-search input { flex:1; min-width:0; border:0; outline:none; background:transparent; color:var(--v2-fg); font-size:13px; font-family:inherit; }
  .ps-lib-scroll { max-height:640px; overflow-y:auto; }
  .ps-lib { display:grid; grid-template-columns:repeat(auto-fill, minmax(280px, 1fr)); gap:14px; padding:18px; }
  .ps-month { grid-column:1 / -1; font-size:12.5px; font-weight:500; color:var(--v2-fg-3); padding-top:6px; display:flex; align-items:center; gap:10px; }
  .ps-month::after { content:""; flex:1; height:1px; background:var(--v2-line); }
  .ps-month:first-child { padding-top:0; }
  .ps-pcard { position:relative; display:flex; flex-direction:column; gap:8px; padding:16px; border-radius:12px; border:1px solid var(--v2-line); background:var(--v2-surface); cursor:pointer; transition:border-color .15s, box-shadow .15s; min-width:0; text-align:left; color:inherit; font:inherit; }
  .ps-pcard:hover { border-color:var(--v2-line-strong); box-shadow:0 8px 24px -12px rgba(0,0,0,.35); }
  .ps-pcard .meta { display:flex; align-items:center; justify-content:space-between; gap:8px; font:400 12px var(--font-data); color:var(--v2-fg-3); }
  .ps-pcard .new { font:500 11px var(--font-ui); padding:2px 7px; border-radius:99px; background:color-mix(in oklch, var(--v2-accent) 14%, transparent); color:var(--v2-accent); }
  .ps-pcard h3 { margin:0; font-size:14.5px; font-weight:600; line-height:1.35; text-wrap:balance; overflow-wrap:anywhere; }
  .ps-pcard p { margin:0; font-size:13px; line-height:1.5; color:var(--v2-fg-2); display:-webkit-box; -webkit-line-clamp:3; -webkit-box-orient:vertical; overflow:hidden; }
  .ps-pcard .foot { margin-top:auto; padding-top:6px; display:flex; align-items:center; justify-content:space-between; gap:8px; }
  .ps-lnk { display:inline-flex; align-items:center; gap:6px; font-size:13px; font-weight:500; color:var(--v2-accent); text-decoration:none; }
  .ps-lnk:hover { text-decoration:underline; }
  .ps-nolnk { font-size:12.5px; color:var(--v2-fg-3); }
  .ps-act { display:flex; gap:2px; opacity:0; transition:opacity .15s; }
  .ps-pcard:hover .ps-act, .ps-pcard:focus-within .ps-act { opacity:1; }
  @media (hover: none) { .ps-act { opacity:1; } }
  .ps-icon-btn { display:grid; place-items:center; width:28px; height:28px; border-radius:8px; border:0; background:transparent; color:var(--v2-fg-2); cursor:pointer; }
  .ps-icon-btn:hover { background:var(--v2-hover); color:var(--v2-fg); }
  .ps-icon-btn.danger:hover { color:var(--v2-crit); background:color-mix(in oklch, var(--v2-crit) 12%, transparent); }
  .ps-empty { padding:28px 16px; text-align:center; color:var(--v2-fg-3); font-size:13px; }

  /* Painel */
  .ps-txt { font-size:14px; line-height:1.65; color:var(--v2-fg); white-space:pre-wrap; overflow-wrap:anywhere; }
  .ps-linkbox { display:flex; align-items:center; justify-content:space-between; gap:10px; padding:10px 12px; border-radius:8px; border:1px solid var(--v2-line); background:var(--v2-surface-2); font:400 12.5px var(--font-data); color:var(--v2-fg-2); overflow-wrap:anywhere; }
  .ps-p { margin:0; font-size:13px; color:var(--v2-fg-3); }
  .ps-confirm { display:flex; align-items:center; gap:8px; flex-wrap:wrap; width:100%; font-size:13px; }
  .ps-confirm span { margin-right:auto; color:var(--v2-fg-2); }

  /* Botões */
  .ps-btn { display:inline-flex; align-items:center; gap:7px; height:32px; padding:0 12px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; font-family:var(--font-ui); white-space:nowrap; border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-fg); text-decoration:none; }
  .ps-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .ps-btn:hover:not(:disabled) { background:var(--v2-hover); }
  .ps-btn.lg { height:34px; padding:0 14px; }
  .ps-btn.primary { background:var(--v2-accent); border-color:var(--v2-accent); color:var(--v2-accent-ink); }
  .ps-btn.primary:hover:not(:disabled) { background:var(--v2-accent); filter:brightness(1.08); }
  .ps-btn.ghost { background:transparent; border-color:transparent; color:var(--v2-fg-2); }
  .ps-btn.danger { background:var(--v2-crit); border-color:var(--v2-crit); color:#fff; }
  .ps-btn.danger:hover:not(:disabled) { background:var(--v2-crit); filter:brightness(1.08); }
  .ps-btn.danger-text { background:transparent; border-color:transparent; color:var(--v2-crit); margin-right:auto; }
  .ps-btn.danger-text:hover:not(:disabled) { background:color-mix(in oklch, var(--v2-crit) 10%, transparent); }

  /* Formulário */
  .ps-form { display:grid; gap:14px; padding-top:4px; font-family:var(--font-ui); }
  .ps-field { display:grid; gap:6px; }
  .ps-field label { font-size:12.5px; font-weight:500; color:var(--v2-fg-2); }
  .ps-req { color:var(--v2-crit); }
  .ps-input { width:100%; height:34px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg); font-size:13px; font-family:inherit; outline:none; }
  textarea.ps-input { height:auto; min-height:96px; padding:8px 10px; resize:vertical; line-height:1.5; }
  .ps-input:focus { border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }
`;

// ── Formulário ─────────────────────────────────────────────────────────────────
function PilulaDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: PilulaRow | null;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const upsertFn = useServerFn(upsertPilula);
  const [nome, setNome] = React.useState("");
  const [data, setData] = React.useState(todayIso());
  const [descricao, setDescricao] = React.useState("");
  const [link, setLink] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setNome(editing?.nome ?? "");
      setData(editing?.data ?? todayIso());
      setDescricao(editing?.descricao ?? "");
      setLink(editing?.link ?? "");
    }
  }, [open, editing]);

  const save = useMutation({
    mutationFn: () =>
      upsertFn({
        data: {
          id: editing?.id,
          nome: nome.trim(),
          descricao: descricao.trim() || null,
          link: link.trim() || null,
          quantidade: 1,
          data,
          created_by: user?.id ?? null,
        },
      }),
    onSuccess: () => {
      toast.success(editing ? "Pílula atualizada" : "Pílula criada");
      qc.invalidateQueries({ queryKey: ["pilulas"] });
      qc.invalidateQueries({ queryKey: ["pilulas-overview"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const valid = nome.trim().length > 0 && !!data;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="font-ui sm:max-w-lg"
        style={{
          background: "var(--v2-surface)",
          border: "1px solid var(--v2-line-strong)",
          borderRadius: 12,
          color: "var(--v2-fg)",
        }}
      >
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <DialogHeader>
          <DialogTitle style={{ fontSize: 16, fontWeight: 600 }}>
            {editing ? "Editar pílula" : "Nova pílula de SI"}
          </DialogTitle>
        </DialogHeader>
        <div className="ps-form">
          <div className="ps-field">
            <label htmlFor="ps-nome">
              Título <span className="ps-req">*</span>
            </label>
            <input
              id="ps-nome"
              className="ps-input"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={200}
              placeholder="Ex.: Como reconhecer um e-mail de phishing"
            />
          </div>
          <div className="ps-field">
            <label htmlFor="ps-data">
              Data de publicação <span className="ps-req">*</span>
            </label>
            <input
              id="ps-data"
              type="date"
              className="ps-input"
              value={data}
              onChange={(e) => setData(e.target.value)}
            />
          </div>
          <div className="ps-field">
            <label htmlFor="ps-desc">Conteúdo</label>
            <textarea
              id="ps-desc"
              className="ps-input"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={4}
              maxLength={5000}
              placeholder="O texto da pílula ou um resumo do conteúdo"
            />
          </div>
          <div className="ps-field">
            <label htmlFor="ps-link">Link</label>
            <input
              id="ps-link"
              className="ps-input"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              maxLength={1000}
              placeholder="https://… (opcional)"
            />
          </div>
        </div>
        <DialogFooter style={{ gap: 8, paddingTop: 8 }}>
          <button
            className="ps-btn ghost"
            onClick={() => onOpenChange(false)}
            disabled={save.isPending}
          >
            Cancelar
          </button>
          <button
            className="ps-btn primary"
            disabled={!valid || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? (
              <>
                <Loader2 size={13} className="ps-spin" /> Salvando…
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

// ── Ritmo de publicação ───────────────────────────────────────────────────────
function RitmoPublicacao({
  rows,
  selDay,
  onPickDay,
}: {
  rows: PilulaRow[];
  selDay: string | null;
  onPickDay: (iso: string) => void;
}) {
  const end = startOfToday();
  const start = mondayOf(new Date(end.getTime() - 7 * 52 * DAY_MS));
  const byDay = React.useMemo(() => {
    const m = new Map<string, number>();
    rows.forEach((r) => m.set(r.data, (m.get(r.data) ?? 0) + 1));
    return m;
  }, [rows]);

  // Estatísticas: semanas com publicação, maior intervalo e sequência atual
  const weekOf = (d: Date) => Math.floor((d.getTime() - start.getTime()) / (7 * DAY_MS));
  const curWeek = weekOf(end);
  const weeks = new Set(
    rows
      .map((r) => parseIso(r.data))
      .filter((d) => d >= start && d <= end)
      .map(weekOf),
  );
  const asc = [...rows].map((r) => parseIso(r.data)).sort((a, b) => a.getTime() - b.getTime());
  let gap = { n: 0, a: null as Date | null, b: null as Date | null };
  for (let i = 1; i < asc.length; i++) {
    const g = Math.round((asc[i].getTime() - asc[i - 1].getTime()) / DAY_MS);
    if (g > gap.n) gap = { n: g, a: asc[i - 1], b: asc[i] };
  }
  // A semana atual ainda está em curso: sem pílula nela, a sequência conta a partir da anterior
  let streak = 0;
  for (let w = weeks.has(curWeek) ? curWeek : curWeek - 1; w >= 0 && weeks.has(w); w--) streak++;
  const fd = (d: Date) =>
    d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

  const cells: React.ReactNode[] = [];
  const DOW = ["seg", "", "qua", "", "sex", "", ""];
  DOW.forEach((l, r) => {
    cells.push(
      <span key={`d${r}`} className="dlbl" style={{ gridColumn: 1, gridRow: r + 2 }}>
        {l}
      </span>,
    );
  });
  let lastM = -1;
  for (let w = 0; w < 53; w++) {
    const wd = new Date(start.getTime() + w * 7 * DAY_MS);
    if (wd.getMonth() !== lastM && wd.getDate() <= 7) {
      lastM = wd.getMonth();
      cells.push(
        <span key={`m${w}`} className="mlbl" style={{ gridColumn: w + 2, gridRow: 1 }}>
          {MES[lastM]}
        </span>,
      );
    }
    for (let r = 0; r < 7; r++) {
      const d = new Date(start);
      d.setDate(start.getDate() + w * 7 + r);
      const k = toIso(d);
      const n = byDay.get(k) ?? 0;
      const out = d > end;
      const label = `${d.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "2-digit" })}: ${
        n ? `${n} ${n === 1 ? "pílula" : "pílulas"}` : "sem publicação"
      }`;
      cells.push(
        <button
          key={k}
          type="button"
          className={`c${out ? " out" : n >= 2 ? " l2" : n === 1 ? " l1" : ""}${selDay === k ? " sel" : ""}`}
          style={{ gridColumn: w + 2, gridRow: r + 2 }}
          title={out ? undefined : label}
          aria-label={out ? undefined : label}
          aria-hidden={out || undefined}
          tabIndex={out ? -1 : undefined}
          onClick={() => !out && onPickDay(k)}
        />,
      );
    }
  }

  return (
    <div className="ps-card">
      <div className="ps-card-hdr">
        <h2 className="ps-card-title">Ritmo de publicação</h2>
        <p className="ps-card-sub">
          Cada quadrado é um dia das últimas 52 semanas · clique num dia para ver a semana na
          biblioteca
        </p>
      </div>
      <div className="ps-card-body">
        <div className="ps-rhythm">
          <div>
            <div className="ps-heat-wrap">
              <div className="ps-heat">{cells}</div>
            </div>
            <div className="ps-heat-leg">
              Menos
              <i
                style={{
                  background: "var(--v2-surface-2)",
                  boxShadow: "inset 0 0 0 1px var(--v2-line)",
                }}
              />
              <i
                style={{
                  background: "color-mix(in oklch, var(--v2-accent) 45%, var(--v2-surface-2))",
                }}
              />
              <i style={{ background: "var(--v2-accent)" }} />
              Mais
            </div>
          </div>
          <div className="ps-rstats">
            <div className="ps-rstat">
              <small>Semanas com publicação</small>
              <b>{weeks.size} de 52</b>
              <span>{Math.round((weeks.size / 52) * 100)}% das semanas do último ano</span>
            </div>
            <div className="ps-rstat">
              <small>Maior intervalo sem publicar</small>
              <b>{gap.n} dias</b>
              <span>{gap.a && gap.b ? `de ${fd(gap.a)} a ${fd(gap.b)}` : "—"}</span>
            </div>
            <div className="ps-rstat">
              <small>Sequência atual</small>
              <b>
                {streak} {streak === 1 ? "semana" : "semanas"}
              </b>
              <span>seguidas com pelo menos uma pílula</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════
export function PilulasSiDashboard() {
  // ── back-end UNCHANGED ─────────────────────────────────────────────────────
  const qc = useQueryClient();
  const { can, isAdmin, isModuleAdmin } = usePermissions();
  const canView = isAdmin || isModuleAdmin("pilulas-si") || can("pilulas-si", "view");
  const canCreate = isAdmin || isModuleAdmin("pilulas-si") || can("pilulas-si", "create");
  const canEdit = isAdmin || isModuleAdmin("pilulas-si") || can("pilulas-si", "edit");
  const canDelete = isAdmin || isModuleAdmin("pilulas-si") || can("pilulas-si", "delete");

  const fetchList = useServerFn(listPilulas);
  const deleteFn = useServerFn(deletePilula);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["pilulas"],
    queryFn: () => fetchList(),
    enabled: canView,
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Pílula removida");
      qc.invalidateQueries({ queryKey: ["pilulas"] });
      qc.invalidateQueries({ queryKey: ["pilulas-overview"] });
      setOpenId(null);
      setConfirmDelete(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });
  // ──────────────────────────────────────────────────────────────────────────

  const [search, setSearch] = React.useState("");
  const [periodo, setPeriodo] = React.useState<Periodo>("3m");
  const [from, setFrom] = React.useState<string>("");
  const [to, setTo] = React.useState<string>("");
  const [selDay, setSelDay] = React.useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PilulaRow | null>(null);
  const [openId, setOpenId] = React.useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const libRef = React.useRef<HTMLDivElement>(null);

  const stats = React.useMemo(() => {
    const ultimos30 = rows.filter((r) => daysAgo(r.data) <= 30).length;
    const now = startOfToday();
    const desde12m = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const em12m = rows.filter((r) => parseIso(r.data) >= desde12m).length;
    const ultima = rows.reduce<PilulaRow | null>((a, r) => (!a || r.data > a.data ? r : a), null);
    return { ultimos30, media: em12m / 12, ultima };
  }, [rows]);

  const filtered = React.useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows
      .filter((r) => {
        if (periodo === "1m" && daysAgo(r.data) > 30) return false;
        if (periodo === "3m" && daysAgo(r.data) > 91) return false;
        if (periodo === "custom" && ((from && r.data < from) || (to && r.data > to))) return false;
        if (!s) return true;
        return r.nome.toLowerCase().includes(s) || (r.descricao ?? "").toLowerCase().includes(s);
      })
      .sort((a, b) => b.data.localeCompare(a.data));
  }, [rows, search, periodo, from, to]);

  if (!canView && !canCreate && !canEdit && !canDelete)
    return (
      <div className="ps-root">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="ps-state">
          <Lock size={22} color="var(--v2-crit)" />
          <span style={{ fontSize: 15, fontWeight: 600 }}>Acesso restrito</span>
          <span className="dim" style={{ fontSize: 13 }}>
            Você não tem permissão para acessar este módulo.
          </span>
        </div>
      </div>
    );

  const pickPeriodo = (p: Periodo) => {
    setPeriodo(p);
    setSelDay(null);
    if (p === "custom" && !from) {
      const now = startOfToday();
      setFrom(toIso(new Date(now.getFullYear(), now.getMonth() - 1, 1)));
      setTo(toIso(now));
    }
  };
  const pickDay = (iso: string) => {
    const mon = mondayOf(parseIso(iso));
    const sun = new Date(mon.getTime() + 6 * DAY_MS);
    setPeriodo("custom");
    setFrom(toIso(mon));
    setTo(toIso(sun));
    setSelDay(iso);
    libRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  };

  const open = openId ? (rows.find((r) => r.id === openId) ?? null) : null;
  const startEdit = (r: PilulaRow) => {
    setOpenId(null);
    setEditing(r);
    setDialogOpen(true);
  };
  const dUltima = stats.ultima ? daysAgo(stats.ultima.data) : null;

  // Cartões agrupados por mês
  const lib: React.ReactNode[] = [];
  let curMonth = "";
  filtered.forEach((r) => {
    const mk = r.data.slice(0, 7);
    if (mk !== curMonth) {
      curMonth = mk;
      const [y, m] = mk.split("-");
      lib.push(
        <div key={`m-${mk}`} className="ps-month">
          {MES_LONGO[Number(m) - 1]} de {y}
        </div>,
      );
    }
    lib.push(
      <div
        key={r.id}
        className="ps-pcard"
        role="button"
        tabIndex={0}
        onClick={() => {
          setOpenId(r.id);
          setConfirmDelete(false);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            setOpenId(r.id);
            setConfirmDelete(false);
          }
        }}
      >
        <div className="meta">
          <span>{fmtDate(r.data)}</span>
          {daysAgo(r.data) <= 7 && <span className="new">Nova</span>}
        </div>
        <h3>{r.nome}</h3>
        {r.descricao && <p>{r.descricao}</p>}
        <div className="foot">
          {r.link ? (
            <a
              className="ps-lnk"
              href={r.link}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
            >
              <ExternalLink size={13} /> Abrir conteúdo
            </a>
          ) : (
            <span className="ps-nolnk">Sem link</span>
          )}
          {(canEdit || canDelete) && (
            <span
              className="ps-act"
              onClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
            >
              {canEdit && (
                <button
                  className="ps-icon-btn"
                  title="Editar"
                  aria-label="Editar"
                  onClick={() => startEdit(r)}
                >
                  <Pencil size={13} />
                </button>
              )}
              {canDelete && (
                <button
                  className="ps-icon-btn danger"
                  title="Remover"
                  aria-label="Remover"
                  onClick={() => {
                    setOpenId(r.id);
                    setConfirmDelete(true);
                  }}
                >
                  <Trash2 size={13} />
                </button>
              )}
            </span>
          )}
        </div>
      </div>,
    );
  });

  return (
    <div className="ps-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Cabeçalho ────────────────────────────────────────────────────── */}
      <div className="ps-ph">
        <div>
          <h1 className="ps-ph-title">Pílulas de Segurança da Informação</h1>
          <p className="ps-ph-sub">
            Conteúdos curtos de conscientização publicados para os colaboradores
          </p>
        </div>
        {canCreate && (
          <button
            className="ps-btn primary lg"
            onClick={() => {
              setEditing(null);
              setDialogOpen(true);
            }}
          >
            <Plus size={14} /> Nova pílula
          </button>
        )}
      </div>

      {/* ── KPIs ───────────────────────────────────────────────────────── */}
      <div className="ps-kpis">
        <div className="ps-kpi">
          <span className="ps-kpi-label">Pílulas publicadas</span>
          <span className="ps-kpi-value">{isLoading ? "—" : rows.length}</span>
          <span className="ps-kpi-foot">todo o histórico</span>
        </div>
        <div className="ps-kpi">
          <span className="ps-kpi-label">Últimos 30 dias</span>
          <span className="ps-kpi-value">{isLoading ? "—" : stats.ultimos30}</span>
          <span className="ps-kpi-foot">publicadas no período</span>
        </div>
        <div className="ps-kpi">
          <span className="ps-kpi-label">Média por mês</span>
          <span className="ps-kpi-value">
            {isLoading ? "—" : stats.media.toFixed(1).replace(".", ",")}
          </span>
          <span className="ps-kpi-foot">nos últimos 12 meses</span>
        </div>
        <div className="ps-kpi">
          <span className="ps-kpi-label">
            {dUltima !== null && dUltima > 30 && (
              <span className="ps-sw" style={{ background: "var(--v2-med)" }} />
            )}
            Última publicação
          </span>
          <span className="ps-kpi-value">
            {dUltima === null
              ? "—"
              : dUltima <= 0
                ? "hoje"
                : `há ${dUltima} ${dUltima === 1 ? "dia" : "dias"}`}
          </span>
          <span className="ps-kpi-foot" title={stats.ultima?.nome}>
            {stats.ultima
              ? `${fmtDate(stats.ultima.data)} · ${stats.ultima.nome}`
              : "nenhuma pílula ainda"}
          </span>
        </div>
      </div>

      {/* ── Ritmo ──────────────────────────────────────────────────────── */}
      <RitmoPublicacao rows={rows} selDay={selDay} onPickDay={pickDay} />

      {/* ── Biblioteca ─────────────────────────────────────────────────── */}
      <div className="ps-card" ref={libRef}>
        <div className="ps-toolbar">
          <b>
            Biblioteca{" "}
            <span className="ps-count">
              {filtered.length === rows.length
                ? rows.length
                : `${filtered.length} de ${rows.length}`}
            </span>
          </b>
          <div className="ps-seg" role="group" aria-label="Período">
            {(
              [
                ["1m", "Último mês"],
                ["3m", "Últimos 3 meses"],
                ["all", "Todas"],
                ["custom", "Personalizado"],
              ] as Array<[Periodo, string]>
            ).map(([k, l]) => (
              <button
                key={k}
                type="button"
                aria-pressed={periodo === k}
                onClick={() => pickPeriodo(k)}
              >
                {l}
              </button>
            ))}
          </div>
          {periodo === "custom" && (
            <span className="ps-range">
              <input
                type="date"
                value={from}
                onChange={(e) => {
                  setFrom(e.target.value);
                  setSelDay(null);
                }}
                aria-label="De"
              />
              até
              <input
                type="date"
                value={to}
                onChange={(e) => {
                  setTo(e.target.value);
                  setSelDay(null);
                }}
                aria-label="Até"
              />
            </span>
          )}
          <label className="ps-search">
            <Search size={14} />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar título ou conteúdo"
              aria-label="Buscar pílulas"
            />
          </label>
        </div>
        {isLoading ? (
          <div className="ps-empty">
            <Loader2
              size={14}
              className="ps-spin"
              style={{ display: "inline", verticalAlign: "-2px" }}
            />{" "}
            Carregando…
          </div>
        ) : filtered.length === 0 ? (
          <div className="ps-empty">
            {rows.length === 0
              ? `Nenhuma pílula cadastrada.${canCreate ? ' Clique em "Nova pílula" para começar.' : ""}`
              : "Nenhuma pílula neste período. Amplie o período ou busque por outro termo."}
          </div>
        ) : (
          <div className="ps-lib-scroll">
            <div className="ps-lib">{lib}</div>
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
        eyebrow={
          open
            ? `Publicada em ${fmtDate(open.data)}${daysAgo(open.data) > 0 ? ` · há ${daysAgo(open.data)} dias` : " · hoje"}`
            : null
        }
        title={open?.nome ?? ""}
        footer={
          open && (canEdit || canDelete) ? (
            confirmDelete ? (
              <div className="ps-confirm">
                <span>Remover esta pílula?</span>
                <button
                  className="ps-btn ghost"
                  onClick={() => setConfirmDelete(false)}
                  disabled={del.isPending}
                >
                  Cancelar
                </button>
                <button
                  className="ps-btn danger"
                  onClick={() => del.mutate(open.id)}
                  disabled={del.isPending}
                >
                  {del.isPending ? <Loader2 size={13} className="ps-spin" /> : <Trash2 size={13} />}{" "}
                  Remover
                </button>
              </div>
            ) : (
              <>
                {canDelete && (
                  <button className="ps-btn danger-text" onClick={() => setConfirmDelete(true)}>
                    Remover
                  </button>
                )}
                {canEdit && (
                  <button className="ps-btn primary" onClick={() => startEdit(open)}>
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
            <DetailSection title="Conteúdo">
              {open.descricao ? (
                <div className="ps-txt">{open.descricao}</div>
              ) : (
                <p className="ps-p">Sem descrição.</p>
              )}
            </DetailSection>
            <DetailSection title="Link">
              {open.link ? (
                <div className="ps-linkbox">
                  <span>{open.link}</span>
                  <a className="ps-btn" href={open.link} target="_blank" rel="noopener noreferrer">
                    Abrir <ExternalLink size={13} />
                  </a>
                </div>
              ) : (
                <p className="ps-p">Sem link cadastrado.</p>
              )}
            </DetailSection>
          </>
        )}
      </DetailSheet>

      <PilulaDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
    </div>
  );
}
