import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, CalendarCheck, Loader2, Lock, CheckCircle2, XCircle, Clock } from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, LabelList } from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";
import { usePermissions } from "@/lib/use-permissions";
import { listComites, upsertComite, deleteComite, getComitesOverview, type ComiteRow } from "@/lib/comites.functions";

// ── Design Tokens ──────────────────────────────────────────────────────────────
const T = {
  surface: "#0F1420",
  surfaceAlt: "#131825",
  border: "#1E2640",
  borderHi: "#2A3560",
  accent: "#3B82F6",
  accentGlow: "rgba(59,130,246,0.15)",
  accentSoft: "rgba(59,130,246,0.08)",
  success: "#10B981",
  successBg: "rgba(16,185,129,0.10)",
  warning: "#F59E0B",
  warningBg: "rgba(245,158,11,0.10)",
  danger: "#EF4444",
  dangerBg: "rgba(239,68,68,0.10)",
  purple: "#A78BFA",
  purpleBg: "rgba(167,139,250,0.10)",
  cyan: "#22D3EE",
  neutral: "#6B7280",
  textPrimary: "#F1F5F9",
  textSecondary: "#94A3B8",
  textMuted: "#64748B",
  textSubtle: "#475569",
  chartGrid: "rgba(30,38,64,0.7)",
  chartAxis: "#334155",
  chartTick: "#64748B",
};

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

// Paleta para anel de tipos
const TIPO_PALETTE = [T.accent, T.success, T.purple, T.warning, T.cyan, "#FB923C", T.danger, T.neutral];

// ── CSS ────────────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');

  .cm-root { font-family:'DM Sans',sans-serif; color:${T.textPrimary}; display:flex; flex-direction:column; gap:16px; }
  .cm-root * { box-sizing:border-box; }
  @keyframes cm-spin { to { transform:rotate(360deg) } }
  .cm-spin { animation:cm-spin 0.75s linear infinite; }

  .cm-root ::-webkit-scrollbar       { width:4px; height:4px; }
  .cm-root ::-webkit-scrollbar-track { background:transparent; }
  .cm-root ::-webkit-scrollbar-thumb { background:${T.borderHi}; border-radius:2px; }

  .cm-root .recharts-cartesian-axis-tick-value { fill:${T.chartTick} !important; font-size:10px; font-family:'IBM Plex Mono',monospace; }
  .cm-root .recharts-legend-item-text { color:${T.textSecondary} !important; font-size:11px; font-family:'IBM Plex Mono',monospace; }

  /* ── Header ── */
  .cm-hdr { background:${T.surface}; border:1px solid ${T.border}; border-radius:12px; padding:16px 22px; display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  .cm-hdr-brand { display:flex; align-items:center; gap:12px; }
  .cm-hdr-icon { width:40px; height:40px; border-radius:10px; display:flex; align-items:center; justify-content:center; background:${T.accentGlow}; border:1px solid rgba(59,130,246,0.3); }
  .cm-hdr-title { font-size:15px; font-weight:700; font-family:'Space Grotesk',sans-serif; letter-spacing:-0.01em; }
  .cm-hdr-sub { font-size:11px; color:${T.textMuted}; margin-top:2px; }

  /* ── KPI ── */
  .cm-kpi-grid { display:grid; grid-template-columns:repeat(4,1fr); gap:12px; }
  .cm-kpi { background:${T.surface}; border:1px solid ${T.border}; border-radius:10px; padding:14px 18px; position:relative; overflow:hidden; transition:border-color 0.2s; }
  .cm-kpi:hover { border-color:${T.borderHi}; }
  .cm-kpi::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; background:var(--kc,${T.accent}); }
  .cm-kpi-icon  { position:absolute; top:10px; right:10px; width:40px; height:40px; border-radius:9px; display:flex; align-items:center; justify-content:center; background:var(--ki-bg,${T.accentGlow}); }
  .cm-kpi-label { font-size:9px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; margin-bottom:5px; }
  .cm-kpi-value { font-size:26px; font-weight:700; font-family:'Space Grotesk',sans-serif; letter-spacing:-0.02em; line-height:1; color:var(--kc,${T.textPrimary}); }
  .cm-kpi-hint  { font-size:10px; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; margin-top:5px; }

  /* ── Panel ── */
  .cm-panel { background:${T.surface}; border:1px solid ${T.border}; border-radius:12px; overflow:hidden; }
  .cm-panel-hdr { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; padding:13px 20px; background:${T.surfaceAlt}; border-bottom:1px solid ${T.border}; }
  .cm-panel-title { display:flex; align-items:center; gap:8px; font-size:11px; font-weight:700; letter-spacing:0.09em; text-transform:uppercase; font-family:'IBM Plex Mono',monospace; color:${T.textPrimary}; }
  .cm-panel-body { padding:16px; }

  /* ── Charts grid ── */
  .cm-grid-charts { display:grid; grid-template-columns:2fr 1fr; gap:12px; }

  /* ── Legend custom ── */
  .cm-chart-legend { display:flex; gap:14px; margin-bottom:12px; flex-wrap:wrap; }
  .cm-leg-item { display:flex; align-items:center; gap:5px; font-size:11px; color:${T.textSecondary}; font-family:'IBM Plex Mono',monospace; }
  .cm-leg-dot { width:10px; height:10px; border-radius:2px; flex-shrink:0; }

  /* ── Tipo ring ── */
  .cm-ring-wrap { display:flex; align-items:center; gap:16px; width:100%; height:100%; }
  .cm-ring-svg  { flex:0 0 auto; width:min(160px,42%); height:auto; }
  .cm-ring-legend { display:flex; flex-direction:column; gap:8px; flex:1; min-width:0; }
  .cm-ring-row { display:flex; align-items:center; gap:7px; cursor:pointer; border-radius:4px; padding:3px 5px; transition:background 0.1s; }
  .cm-ring-row:hover { background:rgba(59,130,246,0.06); }
  .cm-ring-row.dim { opacity:0.25; }
  .cm-ring-dot { width:8px; height:8px; border-radius:2px; flex-shrink:0; }
  .cm-ring-name { font-size:11px; color:${T.textPrimary}; flex:1; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .cm-ring-bar-wrap { width:140px; height:4px; background:${T.border}; border-radius:2px; overflow:hidden; flex-shrink:0; }
  .cm-ring-bar  { height:100%; border-radius:2px; transition:width 0.5s; }
  .cm-ring-val  { font-size:11px; font-weight:700; font-family:'IBM Plex Mono',monospace; color:${T.textPrimary}; width:28px; text-align:right; flex-shrink:0; }

  /* ── % por comitê bars ── */
  .cm-bar-row  { display:flex; align-items:center; gap:10px; padding:6px 0; }
  .cm-bar-name { width:32%; font-size:12px; color:${T.textPrimary}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .cm-bar-track{ flex:1; height:8px; background:${T.surfaceAlt}; border-radius:4px; overflow:hidden; }
  .cm-bar-fill { height:100%; background:linear-gradient(90deg,${T.accent},${T.purple}); border-radius:4px; }
  .cm-bar-meta { width:90px; text-align:right; font-family:'IBM Plex Mono',monospace; font-size:11px; color:${T.textPrimary}; }

  /* ── Table ── */
  .cm-table { width:100%; border-collapse:collapse; }
  .cm-table th { padding:8px 12px; font-size:9px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:${T.textPrimary}; font-family:'IBM Plex Mono',monospace; text-align:left; background:${T.surface}; border-bottom:1px solid ${T.border}; white-space:nowrap; position:sticky; top:0; z-index:1; }
  .cm-table td { padding:10px 12px; border-bottom:1px solid rgba(30,38,64,0.4); font-size:12px; color:${T.textPrimary}; vertical-align:top; }
  .cm-table tbody tr:hover td { background:rgba(59,130,246,0.04); }
  .cm-table tbody tr:last-child td { border-bottom:none; }
  .cm-table .mono { font-family:'IBM Plex Mono',monospace; font-size:11px; }
  .cm-table .dim  { color:${T.textMuted}; }

  /* ── Toolbar ── */
  .cm-search-wrap { position:relative; display:inline-flex; align-items:center; }
  .cm-search-icon { position:absolute; left:9px; pointer-events:none; color:${T.textMuted}; }
  .cm-search { background:${T.surfaceAlt}; border:1px solid ${T.border}; border-radius:6px; padding:5px 10px 5px 29px; font-size:12px; font-family:'IBM Plex Mono',monospace; color:${T.textPrimary}; outline:none; width:240px; }
  .cm-search:focus { border-color:rgba(59,130,246,0.5); box-shadow:0 0 0 2px rgba(59,130,246,0.1); }
  .cm-select { background:${T.surfaceAlt}; border:1px solid ${T.border}; border-radius:6px; padding:5px 10px; font-size:12px; font-family:'IBM Plex Mono',monospace; color:${T.textPrimary}; outline:none; }

  /* ── Buttons ── */
  .cm-btn { display:inline-flex; align-items:center; gap:6px; padding:7px 14px; border-radius:7px; font-size:12px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; transition:all 0.15s; white-space:nowrap; border:1px solid transparent; }
  .cm-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .cm-btn.primary { background:${T.accentGlow}; border-color:rgba(59,130,246,0.35); color:${T.accent}; }
  .cm-btn.primary:hover:not(:disabled) { background:rgba(59,130,246,0.25); }
  .cm-btn.ghost   { background:transparent; border-color:${T.border}; color:${T.textSecondary}; padding:5px 8px; }
  .cm-btn.ghost:hover:not(:disabled) { border-color:${T.borderHi}; color:${T.textPrimary}; }
  .cm-btn.danger  { background:transparent; border:none; color:${T.textMuted}; padding:5px 6px; }
  .cm-btn.danger:hover:not(:disabled) { color:${T.danger}; }

  /* ── Badges ── */
  .cm-badge { display:inline-flex; align-items:center; gap:4px; padding:3px 8px; border-radius:5px; font-size:10px; font-weight:700; font-family:'IBM Plex Mono',monospace; border:1px solid transparent; }
  .cm-badge.ok     { background:${T.successBg}; color:${T.success}; border-color:rgba(16,185,129,0.3); }
  .cm-badge.no     { background:${T.dangerBg};  color:${T.danger};  border-color:rgba(239,68,68,0.3); }
  .cm-badge.sched  { background:${T.accentSoft}; color:${T.accent}; border-color:rgba(59,130,246,0.3); }
  .cm-badge.cancel { background:rgba(107,114,128,0.15); color:${T.neutral}; border-color:rgba(107,114,128,0.35); }
  .cm-badge.warn   { background:${T.warningBg}; color:${T.warning}; border-color:rgba(245,158,11,0.3); }

  /* ── Dialog ── */
  .cm-dlg-field { display:flex; flex-direction:column; gap:5px; }
  .cm-dlg-label { font-size:9px; font-weight:700; letter-spacing:0.13em; text-transform:uppercase; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; }
  .cm-dlg-input { width:100%; padding:8px 11px; border:1px solid ${T.border}; border-radius:6px; background:${T.surfaceAlt}; color:${T.textPrimary}; font-family:'DM Sans',sans-serif; font-size:13px; outline:none; }
  .cm-dlg-input:focus { border-color:rgba(59,130,246,0.5); box-shadow:0 0 0 2px rgba(59,130,246,0.1); }
  .cm-row2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }

  .cm-empty { padding:40px; text-align:center; color:${T.textMuted}; font-size:13px; }
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
function statusBadgeClass(s: string) {
  const v = s.trim().toLowerCase();
  if (v === "realizado" || v === "realizada") return "ok";
  if (v.startsWith("não real") || v.startsWith("nao real")) return "no";
  if (v === "agendado" || v === "agendada") return "sched";
  if (v === "cancelado" || v === "cancelada") return "cancel";
  return "warn";
}

// ── Tooltip ────────────────────────────────────────────────────────────────────
function CTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: T.surface,
        border: `1px solid ${T.borderHi}`,
        borderRadius: 8,
        padding: "10px 14px",
        boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
      }}
    >
      <div
        style={{
          fontSize: 10,
          fontFamily: "'IBM Plex Mono',monospace",
          color: T.textMuted,
          textTransform: "uppercase",
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, marginBottom: 3 }}>
          <div style={{ width: 7, height: 7, borderRadius: 2, background: p.color || p.fill }} />
          <span style={{ color: T.textSecondary, fontSize: 11 }}>{p.name}</span>
          <span
            style={{
              color: T.textPrimary,
              fontWeight: 700,
              fontFamily: "'IBM Plex Mono',monospace",
              marginLeft: "auto",
            }}
          >
            {p.value}
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Segmented Ring (Tipos) ─────────────────────────────────────────────────────
function TipoRing({
  data,
  activeName,
  onSliceClick,
}: {
  data: Array<{ name: string; value: number }>;
  activeName: string | null;
  onSliceClick: (name: string) => void;
}) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (!data.length || total === 0) return <div className="cm-empty">Sem dados.</div>;

  const R = 52,
    CX = 64,
    CY = 64;
  const CIRC = 2 * Math.PI * R;
  const GAP = 2.5;
  let acc = 0;
  const segments = data.map((d, i) => {
    const arc = (d.value / total) * CIRC;
    const dash = Math.max(0, arc - GAP);
    const offset = CIRC - acc;
    acc += arc;
    return { ...d, dash, offset, color: TIPO_PALETTE[i % TIPO_PALETTE.length] };
  });
  const maxVal = Math.max(...data.map((d) => d.value), 1);

  return (
    <div className="cm-ring-wrap">
      <svg viewBox="0 0 128 128" className="cm-ring-svg">
        <circle cx={CX} cy={CY} r={R} fill="none" stroke={T.border} strokeWidth="14" />
        <g transform={`rotate(-90 ${CX} ${CY})`}>
          {segments.map((s, i) => (
            <circle
              key={i}
              cx={CX}
              cy={CY}
              r={R}
              fill="none"
              stroke={s.color}
              strokeWidth={activeName === s.name ? 17 : 13}
              strokeDasharray={`${s.dash} ${CIRC}`}
              strokeDashoffset={s.offset}
              strokeLinecap="butt"
              opacity={activeName && activeName !== s.name ? 0.2 : 1}
              style={{ cursor: "pointer", transition: "stroke-width 0.15s, opacity 0.2s" }}
              onClick={() => onSliceClick(s.name)}
            />
          ))}
        </g>
        <text
          x={CX}
          y={CY - 4}
          textAnchor="middle"
          fill={T.textPrimary}
          fontSize="16"
          fontWeight="700"
          fontFamily="'Space Grotesk',sans-serif"
        >
          {total}
        </text>
        <text
          x={CX}
          y={CY + 12}
          textAnchor="middle"
          fill={T.textMuted}
          fontSize="9"
          fontFamily="'IBM Plex Mono',monospace"
        >
          total
        </text>
      </svg>
      <div className="cm-ring-legend">
        {segments.map((s) => {
          const isActive = activeName === s.name;
          const isDimmed = !!activeName && !isActive;
          return (
            <div key={s.name} className={`cm-ring-row${isDimmed ? " dim" : ""}`} onClick={() => onSliceClick(s.name)}>
              <span className="cm-ring-dot" style={{ background: s.color }} />
              <span className="cm-ring-name" title={s.name}>
                {s.name}
              </span>
              <div className="cm-ring-bar-wrap">
                <div
                  className="cm-ring-bar"
                  style={{ width: `${Math.max(4, (s.value / maxVal) * 100)}%`, background: s.color }}
                />
              </div>
              <span className="cm-ring-val" style={{ color: T.textPrimary }}>
                {s.value}
              </span>
            </div>
          );
        })}
      </div>
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
        style={{ background: T.surface, border: `1px solid ${T.borderHi}`, borderRadius: 12, maxWidth: 640 }}
      >
        <DialogHeader>
          <DialogTitle
            style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700, color: T.textPrimary }}
          >
            {editing ? "Editar comitê" : "Nova reunião de comitê"}
          </DialogTitle>
        </DialogHeader>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 8 }}>
          <div className="cm-row2">
            <div className="cm-dlg-field">
              <span className="cm-dlg-label">Nome *</span>
              <input
                className="cm-dlg-input"
                value={nome}
                onChange={(e) => setNome(e.target.value)}
                maxLength={200}
                placeholder="Ex.: Comitê de Riscos — Outubro"
              />
            </div>
            <div className="cm-dlg-field">
              <span className="cm-dlg-label">Tipo *</span>
              <input
                className="cm-dlg-input"
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
            <div className="cm-dlg-field">
              <span className="cm-dlg-label">Periodicidade *</span>
              <select className="cm-dlg-input" value={periodicidade} onChange={(e) => setPeriodicidade(e.target.value)}>
                {PERIODICIDADES.map((p) => (
                  <option key={p} value={p}>
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div className="cm-dlg-field">
              <span className="cm-dlg-label">Data *</span>
              <input type="date" className="cm-dlg-input" value={data} onChange={(e) => setData(e.target.value)} />
            </div>
          </div>
          <div className="cm-dlg-field">
            <span className="cm-dlg-label">Status *</span>
            <select className="cm-dlg-input" value={status} onChange={(e) => setStatus(e.target.value)}>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
          <div className="cm-dlg-field">
            <span className="cm-dlg-label">Participantes</span>
            <Textarea
              value={participantes}
              onChange={(e) => setParticipantes(e.target.value)}
              rows={3}
              maxLength={5000}
              placeholder="Nomes ou áreas separados por vírgula"
            />
          </div>
          <div className="cm-dlg-field">
            <span className="cm-dlg-label">Observação</span>
            <Textarea
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              rows={3}
              maxLength={5000}
              placeholder="Pauta, decisões, próximos passos…"
            />
          </div>
        </div>
        <DialogFooter style={{ gap: 8, paddingTop: 8 }}>
          <button className="cm-btn ghost" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancelar
          </button>
          <button className="cm-btn primary" disabled={!valid || save.isPending} onClick={() => save.mutate()}>
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

  const filtered = React.useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((r) => {
      if (statusFilter !== "todos" && r.status.toLowerCase() !== statusFilter.toLowerCase()) return false;
      if (!s) return true;
      return (
        r.nome.toLowerCase().includes(s) ||
        r.tipo.toLowerCase().includes(s) ||
        (r.participantes ?? "").toLowerCase().includes(s)
      );
    });
  }, [rows, search, statusFilter]);

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Comitê removido");
      qc.invalidateQueries({ queryKey: ["comites"] });
      qc.invalidateQueries({ queryKey: ["comites-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  // ──────────────────────────────────────────────────────────────────────────

  if (!canView && !canCreate && !canEdit && !canDelete)
    return (
      <div className="cm-root">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div
          style={{
            background: T.surface,
            border: `1px solid ${T.border}`,
            borderRadius: 12,
            padding: "48px 24px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: 12,
            textAlign: "center",
          }}
        >
          <Lock size={20} color={T.danger} />
          <div style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700 }}>Acesso restrito</div>
          <div style={{ fontSize: 13, color: T.textMuted }}>Você não tem permissão para acessar este módulo.</div>
        </div>
      </div>
    );

  // Derived: porTipo para o anel
  const porTipo: Array<{ name: string; value: number }> = React.useMemo(() => {
    const map = new Map<string, number>();
    rows.forEach((r) => {
      map.set(r.tipo, (map.get(r.tipo) ?? 0) + 1);
    });
    return [...map.entries()].map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);
  }, [rows]);

  return (
    <div className="cm-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Header ───────────────────────────────────────────────────── */}
      <div className="cm-hdr">
        <div className="cm-hdr-brand">
          <div className="cm-hdr-icon">
            <CalendarCheck size={18} color={T.accent} />
          </div>
          <div>
            <div className="cm-hdr-title">Comitês</div>
            <div className="cm-hdr-sub">Agenda, execução e taxa de realização das reuniões de comitês</div>
          </div>
        </div>
      </div>

      {/* ── KPIs ─────────────────────────────────────────────────────── */}
      <div className="cm-kpi-grid">
        {[
          {
            label: "Total de Reuniões",
            value: overview?.totalReunioes,
            hint: "registros cadastrados",
            color: T.accent,
            kibg: "rgba(59,130,246,0.18)",
            icon: <CalendarCheck size={22} color={T.accent} />,
          },
          {
            label: "Realizadas",
            value: overview?.realizadas,
            hint: "reuniões concluídas",
            color: T.success,
            kibg: "rgba(16,185,129,0.18)",
            icon: <CheckCircle2 size={22} color={T.success} />,
          },
          {
            label: "% de Realização",
            value: overview ? `${overview.percentRealizacao}%` : "—",
            hint: "realizadas ÷ (realizadas + não realizadas)",
            color: T.purple,
            kibg: "rgba(167,139,250,0.18)",
            icon: <CalendarCheck size={22} color={T.purple} />,
          },
          {
            label: "Agendadas",
            value: overview?.agendadas,
            hint: "a executar",
            color: T.warning,
            kibg: "rgba(245,158,11,0.2)",
            icon: <Clock size={22} color={T.warning} />,
          },
        ].map(({ label, value, hint, color, kibg, icon }) => (
          <div key={label} className="cm-kpi" style={{ "--kc": color, "--ki-bg": kibg } as React.CSSProperties}>
            <div className="cm-kpi-icon">{icon}</div>
            <div className="cm-kpi-label">{label}</div>
            <div className="cm-kpi-value">{value ?? "—"}</div>
            <div className="cm-kpi-hint">{hint}</div>
          </div>
        ))}
      </div>

      {/* ── Charts ───────────────────────────────────────────────────── */}
      <div className="cm-grid-charts">
        {/* Barras agrupadas — Opção A (sem Agendadas, sem Legend do Recharts) */}
        <div className="cm-panel">
          <div className="cm-panel-hdr">
            <div className="cm-panel-title">
              <CheckCircle2 size={11} color={T.success} /> Reuniões por mês — últimos 12 meses
            </div>
          </div>
          <div className="cm-panel-body" style={{ height: 280 }}>
            <div className="cm-chart-legend">
              <span className="cm-leg-item">
                <span className="cm-leg-dot" style={{ background: T.success }} /> Realizadas
              </span>
              <span className="cm-leg-item">
                <span className="cm-leg-dot" style={{ background: T.danger }} /> Não Realizadas
              </span>
            </div>
            <ResponsiveContainer width="100%" height="92%">
              <BarChart
                data={overview?.porMes ?? []}
                margin={{ top: 4, right: 8, left: -14, bottom: 0 }}
                barCategoryGap="25%"
                barGap={3}
              >
                <CartesianGrid strokeDasharray="2 4" stroke={T.chartGrid} vertical={false} />
                <XAxis
                  dataKey="m"
                  stroke={T.chartAxis}
                  fontSize={10}
                  tickLine={false}
                  tick={{ fill: T.chartTick, fontFamily: "'IBM Plex Mono',monospace" }}
                  axisLine={{ stroke: T.chartAxis }}
                />
                <YAxis
                  stroke={T.chartAxis}
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  allowDecimals={false}
                  tick={{ fill: T.chartTick, fontFamily: "'IBM Plex Mono',monospace" }}
                />
                <Tooltip content={<CTooltip />} cursor={{ fill: "rgba(59,130,246,0.05)" }} />
                <Bar dataKey="realizadas" name="Realizadas" fill={T.success} fillOpacity={0.85} radius={[3, 3, 0, 0]}>
                  <LabelList
                    dataKey="realizadas"
                    position="top"
                    formatter={(v: number) => (v > 0 ? v : "")}
                    style={{
                      fill: T.textPrimary,
                      fontSize: 10,
                      fontWeight: 700,
                      fontFamily: "'IBM Plex Mono',monospace",
                    }}
                  />
                </Bar>
                <Bar
                  dataKey="naoRealizadas"
                  name="Não Realizadas"
                  fill={T.danger}
                  fillOpacity={0.85}
                  radius={[3, 3, 0, 0]}
                >
                  <LabelList
                    dataKey="naoRealizadas"
                    position="top"
                    formatter={(v: number) => (v > 0 ? v : "")}
                    style={{
                      fill: T.textPrimary,
                      fontSize: 10,
                      fontWeight: 700,
                      fontFamily: "'IBM Plex Mono',monospace",
                    }}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Anel segmentado por tipo */}
        <div className="cm-panel">
          <div className="cm-panel-hdr">
            <div className="cm-panel-title">
              <Clock size={11} color={T.purple} /> Distribuição por tipo
            </div>
          </div>
          <div className="cm-panel-body" style={{ height: 280, display: "flex", alignItems: "center" }}>
            <TipoRing
              data={porTipo}
              activeName={activeTipo}
              onSliceClick={(name) => setActiveTipo((prev) => (prev === name ? null : name))}
            />
          </div>
        </div>
      </div>

      {/* ── % por comitê ─────────────────────────────────────────────── */}
      <div className="cm-panel">
        <div className="cm-panel-hdr">
          <div className="cm-panel-title">
            <CalendarCheck size={11} color={T.accent} /> % por comitê
          </div>
        </div>
        <div className="cm-panel-body">
          {(overview?.porComite ?? []).length === 0 ? (
            <div className="cm-empty">Sem reuniões cadastradas.</div>
          ) : (
            (overview?.porComite ?? []).map((c) => (
              <div key={c.nome} className="cm-bar-row">
                <div className="cm-bar-name" title={c.nome}>
                  {c.nome}
                </div>
                <div className="cm-bar-track">
                  <div className="cm-bar-fill" style={{ width: `${Math.max(2, c.percent)}%` }} />
                </div>
                <div className="cm-bar-meta">
                  {c.total} · {c.percent}%
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* ── Tabela ───────────────────────────────────────────────────── */}
      <div className="cm-panel">
        <div className="cm-panel-hdr">
          <div className="cm-panel-title">
            <CalendarCheck size={11} color={T.accent} /> Reuniões cadastradas
            <span style={{ fontWeight: 400, color: T.textSubtle }}>({filtered.length})</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <select className="cm-select" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="todos">Todos status</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <div className="cm-search-wrap">
              <Search size={12} className="cm-search-icon" />
              <input
                className="cm-search"
                placeholder="Buscar nome, tipo ou participante…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {canCreate && (
              <button
                className="cm-btn primary"
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                <Plus size={13} /> Nova reunião
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              padding: "40px",
              color: T.textMuted,
              fontSize: 12,
              fontFamily: "'IBM Plex Mono',monospace",
            }}
          >
            <Loader2 size={13} className="cm-spin" color={T.accent} /> Carregando…
          </div>
        ) : filtered.length === 0 ? (
          <div className="cm-empty">
            {search || statusFilter !== "todos"
              ? "Nenhum comitê corresponde aos filtros."
              : `Nenhuma reunião de comitê cadastrada.${canCreate ? ' Clique em "Nova reunião" para começar.' : ""}`}
          </div>
        ) : (
          <div style={{ overflowX: "auto", maxHeight: 560, overflowY: "auto" }}>
            <table className="cm-table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 18, width: 110 }}>Data</th>
                  <th>Nome</th>
                  <th>Tipo</th>
                  <th>Periodicidade</th>
                  <th>Participantes</th>
                  <th style={{ width: 130 }}>Status</th>
                  <th>Observação</th>
                  {(canEdit || canDelete) && <th style={{ width: 90, paddingRight: 18, textAlign: "right" }}>Ações</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td className="mono dim" style={{ paddingLeft: 18, whiteSpace: "nowrap" }}>
                      {fmtDate(r.data)}
                    </td>
                    <td style={{ fontWeight: 600, maxWidth: 220 }}>{r.nome}</td>
                    <td className="mono">{r.tipo}</td>
                    <td className="mono dim">{r.periodicidade}</td>
                    <td
                      style={{
                        fontSize: 11,
                        maxWidth: 220,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={r.participantes ?? undefined}
                    >
                      {r.participantes ?? "—"}
                    </td>
                    <td>
                      <span className={`cm-badge ${statusBadgeClass(r.status)}`}>
                        {statusBadgeClass(r.status) === "ok" ? (
                          <CheckCircle2 size={10} />
                        ) : statusBadgeClass(r.status) === "no" ? (
                          <XCircle size={10} />
                        ) : (
                          <Clock size={10} />
                        )}
                        {r.status}
                      </span>
                    </td>
                    <td
                      style={{
                        fontSize: 11,
                        maxWidth: 300,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={r.observacao ?? undefined}
                    >
                      {r.observacao ?? "—"}
                    </td>
                    {(canEdit || canDelete) && (
                      <td style={{ textAlign: "right", paddingRight: 18 }}>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
                          {canEdit && (
                            <button
                              className="cm-btn ghost"
                              title="Editar"
                              onClick={() => {
                                setEditing(r);
                                setDialogOpen(true);
                              }}
                            >
                              <Pencil size={13} />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              className="cm-btn danger"
                              title="Remover"
                              onClick={() => {
                                if (confirm(`Remover reunião "${r.nome}"?`)) del.mutate(r.id);
                              }}
                            >
                              <Trash2 size={13} />
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

      <ComiteDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
    </div>
  );
}
