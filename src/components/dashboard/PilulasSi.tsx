import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Search,
  ExternalLink,
  BookOpen,
  Activity,
  Clock,
  GripHorizontal,
  Minimize2,
  Maximize2,
  Loader2,
  Lock,
} from "lucide-react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, Legend, LabelList } from "recharts";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/lib/auth-context";
import { usePermissions } from "@/lib/use-permissions";
import { listPilulas, upsertPilula, deletePilula, getPilulasOverview, type PilulaRow } from "@/lib/pilulas.functions";

// ── Design Tokens ──────────────────────────────────────────────────────────────
const T = {
  surface: "var(--tl-0f1420, #0F1420)",
  surfaceAlt: "var(--tl-131825, #131825)",
  border: "var(--tl-1e2640, #1E2640)",
  borderHi: "var(--tl-2a3560, #2A3560)",
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
  neutral: "var(--tl-6b7280, #6B7280)",
  textPrimary: "var(--tl-f1f5f9, #F1F5F9)",
  textSecondary: "var(--tl-94a3b8, #94A3B8)",
  textMuted: "var(--tl-64748b, #64748B)",
  textSubtle: "var(--tl-475569, #475569)",
  chartGrid: "rgba(var(--tl-line-rgb, 30,38,64),0.7)",
  chartAxis: "var(--tl-334155, #334155)",
  chartTick: "var(--tl-64748b, #64748B)",
};

// ── CSS ────────────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');

  .ps-root { font-family:'DM Sans',sans-serif; color:${T.textPrimary}; display:flex; flex-direction:column; gap:16px; }
  .ps-root * { box-sizing:border-box; }

  @keyframes ps-spin   { to{transform:rotate(360deg)} }
  @keyframes ps-fadeup { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  .ps-spin    { animation:ps-spin 0.75s linear infinite; }
  .ps-fadeup  { animation:ps-fadeup 0.3s ease forwards; }

  .ps-root ::-webkit-scrollbar       { width:4px; height:4px; }
  .ps-root ::-webkit-scrollbar-track { background:transparent; }
  .ps-root ::-webkit-scrollbar-thumb { background:${T.borderHi}; border-radius:2px; }

  .ps-root .recharts-cartesian-axis-tick-value { fill:${T.chartTick} !important; font-size:10px; font-family:'IBM Plex Mono',monospace; }
  .ps-root .recharts-label { fill:${T.textPrimary} !important; }
  .ps-root .recharts-text.recharts-label { fill:${T.textPrimary} !important; }
  .ps-root .recharts-legend-item-text { color:${T.textSecondary} !important; font-size:11px; font-family:'IBM Plex Mono',monospace; }

  /* ── Page header ── */
  .ps-hdr { background:${T.surface}; border:1px solid ${T.border}; border-radius:12px; padding:16px 22px; display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  .ps-hdr-brand { display:flex; align-items:center; gap:12px; }
  .ps-hdr-icon  { width:40px; height:40px; border-radius:10px; display:flex; align-items:center; justify-content:center; background:${T.purpleBg}; border:1px solid rgba(167,139,250,0.3); flex-shrink:0; }
  .ps-hdr-title { font-size:15px; font-weight:700; color:${T.textPrimary}; font-family:'Space Grotesk',sans-serif; letter-spacing:-0.01em; }
  .ps-hdr-sub   { font-size:11px; color:${T.textMuted}; margin-top:2px; }

  /* ── KPI strip ── */
  .ps-kpi-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:12px; }
  .ps-kpi { background:${T.surface}; border:1px solid ${T.border}; border-radius:10px; padding:14px 18px; position:relative; overflow:hidden; transition:border-color 0.2s; }
  .ps-kpi:hover { border-color:${T.borderHi}; }
  .ps-kpi::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; background:var(--kc,${T.accent}); }
  .ps-kpi-icon  { position:absolute; top:10px; right:10px; width:40px; height:40px; border-radius:9px; display:flex; align-items:center; justify-content:center; background:var(--ki-bg,${T.accentGlow}); }
  .ps-kpi-label { font-size:9px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; margin-bottom:5px; }
  .ps-kpi-value { font-size:26px; font-weight:700; font-family:'Space Grotesk',sans-serif; letter-spacing:-0.02em; line-height:1; color:var(--kc,${T.textPrimary}); }
  .ps-kpi-hint  { font-size:10px; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; margin-top:5px; }

  /* ── Block card ── */
  .ps-block { background:${T.surface}; border:1px solid ${T.border}; border-radius:10px; display:flex; flex-direction:column; min-height:200px; resize:vertical; overflow:auto; transition:border-color 0.2s; }
  .ps-block:hover { border-color:${T.borderHi}; }
  .ps-block-hdr { display:flex; align-items:center; justify-content:space-between; padding:10px 16px; background:${T.surfaceAlt}; border-bottom:1px solid ${T.border}; cursor:grab; user-select:none; flex-shrink:0; border-radius:10px 10px 0 0; }
  .ps-block-hdr:active { cursor:grabbing; }
  .ps-block-title { display:flex; align-items:center; gap:7px; font-size:11px; font-weight:700; color:${T.textPrimary}; text-transform:uppercase; letter-spacing:0.09em; font-family:'IBM Plex Mono',monospace; }
  .ps-resize-ctrl { display:flex; align-items:center; gap:2px; opacity:0; transition:opacity 0.15s; }
  .ps-block:hover .ps-resize-ctrl { opacity:1; }
  .ps-resize-btn { padding:2px; border:none; background:transparent; color:${T.textMuted}; cursor:pointer; border-radius:3px; line-height:0; transition:all 0.15s; }
  .ps-resize-btn:hover { color:${T.textPrimary}; background:rgba(var(--tl-ink, 255,255,255),0.07); }
  .ps-resize-btn:disabled { opacity:0.25; cursor:default; }
  .ps-block-body { flex:1; padding:16px; }

  /* ── Tooltip ── */
  .ps-tooltip { background:${T.surface}; border:1px solid ${T.borderHi}; border-radius:8px; padding:10px 14px; box-shadow:0 20px 40px rgba(0,0,0,0.5); }
  .ps-tooltip-label { font-size:10px; font-family:'IBM Plex Mono',monospace; color:${T.textMuted}; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:6px; }
  .ps-tooltip-row { display:flex; align-items:center; gap:6px; font-size:12px; margin-bottom:3px; }
  .ps-tooltip-dot { width:7px; height:7px; border-radius:2px; flex-shrink:0; }
  .ps-tooltip-name { color:${T.textSecondary}; font-size:11px; }
  .ps-tooltip-val  { color:${T.textPrimary}; font-weight:700; font-family:'IBM Plex Mono',monospace; margin-left:auto; }

  /* ── Panel / table ── */
  .ps-panel { background:${T.surface}; border:1px solid ${T.border}; border-radius:12px; overflow:hidden; }
  .ps-panel-hdr { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; padding:13px 20px; background:${T.surfaceAlt}; border-bottom:1px solid ${T.border}; }
  .ps-panel-title { display:flex; align-items:center; gap:8px; font-size:11px; font-weight:700; letter-spacing:0.09em; text-transform:uppercase; color:${T.textPrimary}; font-family:'IBM Plex Mono',monospace; }
  .ps-panel-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }

  .ps-table { width:100%; border-collapse:collapse; }
  .ps-table thead { position:sticky; top:0; z-index:10; }
  .ps-table th { padding:8px 12px; font-size:9px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:${T.textPrimary}; font-family:'IBM Plex Mono',monospace; text-align:left; background:${T.surface}; border-bottom:1px solid ${T.border}; white-space:nowrap; }
  .ps-table td { padding:10px 12px; border-bottom:1px solid rgba(var(--tl-line-rgb, 30,38,64),0.4); font-size:12px; color:${T.textPrimary}; vertical-align:top; }
  .ps-table tbody tr:hover td { background:rgba(167,139,250,0.04); }
  .ps-table tbody tr:last-child td { border-bottom:none; }
  .ps-table .mono { font-family:'IBM Plex Mono',monospace; font-size:11px; }
  .ps-table .dim  { color:${T.textMuted}; }

  /* ── Search ── */
  .ps-search-wrap { position:relative; display:inline-flex; align-items:center; }
  .ps-search-icon { position:absolute; left:9px; pointer-events:none; color:${T.textMuted}; }
  .ps-search { background:${T.surfaceAlt}; border:1px solid ${T.border}; border-radius:6px; padding:5px 10px 5px 29px; font-size:12px; font-family:'IBM Plex Mono',monospace; color:${T.textPrimary}; outline:none; transition:border-color 0.15s; width:240px; }
  .ps-search:focus { border-color:rgba(167,139,250,0.5); box-shadow:0 0 0 2px rgba(167,139,250,0.1); }
  .ps-search::placeholder { color:${T.textSubtle}; }

  /* ── Buttons ── */
  .ps-btn { display:inline-flex; align-items:center; gap:6px; padding:7px 14px; border-radius:7px; font-size:12px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; transition:all 0.15s; white-space:nowrap; }
  .ps-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .ps-btn.primary { background:${T.purpleBg}; border:1px solid rgba(167,139,250,0.35); color:${T.purple}; }
  .ps-btn.primary:hover:not(:disabled) { background:rgba(167,139,250,0.2); }
  .ps-btn.ghost   { background:transparent; border:1px solid ${T.border}; color:${T.textSecondary}; padding:5px 8px; }
  .ps-btn.ghost:hover:not(:disabled) { border-color:${T.borderHi}; color:${T.textPrimary}; }
  .ps-btn.danger  { background:transparent; border:none; color:${T.textMuted}; padding:5px 6px; }
  .ps-btn.danger:hover:not(:disabled) { color:${T.danger}; }

  /* ── Empty ── */
  .ps-empty { padding:40px; text-align:center; color:${T.textMuted}; font-size:13px; }

  /* ── Dialog ── */
  .ps-dlg-field { display:flex; flex-direction:column; gap:5px; }
  .ps-dlg-label { font-size:9px; font-weight:700; letter-spacing:0.13em; text-transform:uppercase; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; }
  .ps-dlg-input { width:100%; padding:8px 11px; border:1px solid ${T.border}; border-radius:6px; background:${T.surfaceAlt}; color:${T.textPrimary}; font-family:'DM Sans',sans-serif; font-size:13px; outline:none; transition:border-color 0.15s; }
  .ps-dlg-input:focus { border-color:rgba(167,139,250,0.5); box-shadow:0 0 0 2px rgba(167,139,250,0.1); }
  .ps-dlg-input::placeholder { color:${T.textSubtle}; }
  .ps-root-dlg textarea { background:${T.surfaceAlt} !important; border-color:${T.border} !important; color:${T.textPrimary} !important; font-family:'DM Sans',sans-serif !important; font-size:13px !important; border-radius:6px !important; }
  .ps-root-dlg textarea:focus { border-color:rgba(167,139,250,0.5) !important; box-shadow:0 0 0 2px rgba(167,139,250,0.1) !important; outline:none !important; }
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

// ── Tooltip ────────────────────────────────────────────────────────────────────
function ExecTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="ps-tooltip">
      <div className="ps-tooltip-label">{label}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="ps-tooltip-row">
          <div className="ps-tooltip-dot" style={{ background: p.color || p.fill }} />
          <span className="ps-tooltip-name">{p.name}</span>
          <span className="ps-tooltip-val">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

// ── Resizable block ────────────────────────────────────────────────────────────
const COL_SIZES = ["col-span-1", "col-span-2", "col-span-3"] as const;
type ColSize = (typeof COL_SIZES)[number];
function Block({
  title,
  children,
  chartHeight = 280,
  defaultSize = "col-span-1" as ColSize,
}: {
  title: React.ReactNode;
  children: React.ReactNode;
  chartHeight?: number;
  defaultSize?: ColSize;
}) {
  const [size, setSize] = React.useState<ColSize>(defaultSize);
  return (
    <div className={`${size} ps-block`} style={{ minHeight: chartHeight + 52 }}>
      <div className="ps-block-hdr">
        <div className="ps-block-title">
          <GripHorizontal size={11} color={T.textMuted} />
          <span>{title}</span>
        </div>
        <div className="ps-resize-ctrl">
          <button
            className="ps-resize-btn"
            disabled={size === COL_SIZES[0]}
            onClick={() => setSize(COL_SIZES[Math.max(0, COL_SIZES.indexOf(size) - 1)])}
          >
            <Minimize2 size={11} />
          </button>
          <button
            className="ps-resize-btn"
            disabled={size === COL_SIZES[2]}
            onClick={() => setSize(COL_SIZES[Math.min(2, COL_SIZES.indexOf(size) + 1)])}
          >
            <Maximize2 size={11} />
          </button>
        </div>
      </div>
      <div className="ps-block-body" style={{ height: chartHeight }}>
        {children}
      </div>
    </div>
  );
}

const axisProps = {
  stroke: T.chartAxis,
  fontSize: 10,
  tick: { fill: T.chartTick, fontFamily: "'IBM Plex Mono',monospace" },
  tickLine: false,
  axisLine: { stroke: T.chartAxis },
};

// ── Dialog ─────────────────────────────────────────────────────────────────────
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
      <DialogContent style={{ background: T.surface, border: `1px solid ${T.borderHi}`, borderRadius: 12 }}>
        <DialogHeader>
          <DialogTitle
            style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700, color: T.textPrimary }}
          >
            {editing ? "Editar pílula" : "Nova pílula de SI"}
          </DialogTitle>
        </DialogHeader>
        <div className="ps-root-dlg" style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 8 }}>
          <style dangerouslySetInnerHTML={{ __html: CSS }} />
          <div className="ps-dlg-field">
            <span className="ps-dlg-label">Nome *</span>
            <input
              className="ps-dlg-input"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={200}
              placeholder="Título da pílula de segurança"
            />
          </div>
          <div className="ps-dlg-field">
            <span className="ps-dlg-label">Data *</span>
            <input type="date" className="ps-dlg-input" value={data} onChange={(e) => setData(e.target.value)} />
          </div>
          <div className="ps-dlg-field">
            <span className="ps-dlg-label">Descrição</span>
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              rows={4}
              maxLength={5000}
              placeholder="Descreva o conteúdo desta pílula de segurança…"
            />
          </div>
          <div className="ps-dlg-field">
            <span className="ps-dlg-label">Link</span>
            <input
              className="ps-dlg-input"
              value={link}
              onChange={(e) => setLink(e.target.value)}
              maxLength={1000}
              placeholder="https://… (link do conteúdo, opcional)"
            />
          </div>
        </div>
        <DialogFooter style={{ gap: 8, paddingTop: 8 }}>
          <button className="ps-btn ghost" onClick={() => onOpenChange(false)} disabled={save.isPending}>
            Cancelar
          </button>
          <button className="ps-btn primary" disabled={!valid || save.isPending} onClick={() => save.mutate()}>
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
  const fetchOverview = useServerFn(getPilulasOverview);
  const deleteFn = useServerFn(deletePilula);

  const { data: rows = [], isLoading } = useQuery({
    queryKey: ["pilulas"],
    queryFn: () => fetchList(),
    enabled: canView,
  });
  const { data: overview } = useQuery({
    queryKey: ["pilulas-overview"],
    queryFn: () => fetchOverview(),
    enabled: canView,
  });

  const [search, setSearch] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PilulaRow | null>(null);

  const filtered = React.useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return rows;
    return rows.filter((r) => r.nome.toLowerCase().includes(s) || (r.descricao ?? "").toLowerCase().includes(s));
  }, [rows, search]);

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Pílula removida");
      qc.invalidateQueries({ queryKey: ["pilulas"] });
      qc.invalidateQueries({ queryKey: ["pilulas-overview"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
  // ──────────────────────────────────────────────────────────────────────────

  if (!canView && !canCreate && !canEdit && !canDelete)
    return (
      <div className="ps-root">
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
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 10,
              background: T.dangerBg,
              border: "1px solid rgba(239,68,68,0.3)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Lock size={20} color={T.danger} />
          </div>
          <div
            style={{ fontFamily: "'Space Grotesk',sans-serif", fontSize: 15, fontWeight: 700, color: T.textPrimary }}
          >
            Acesso restrito
          </div>
          <div style={{ fontSize: 13, color: T.textMuted }}>Você não tem permissão para acessar este módulo.</div>
        </div>
      </div>
    );

  return (
    <div className="ps-root ps-fadeup">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="ps-hdr">
        <div className="ps-hdr-brand">
          <div className="ps-hdr-icon">
            <BookOpen size={18} color={T.purple} />
          </div>
          <div>
            <div className="ps-hdr-title">Pílulas de Segurança da Informação</div>
            <div className="ps-hdr-sub">Conteúdo educativo e campanhas de conscientização</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 10px",
              borderRadius: 5,
              background: T.purpleBg,
              border: "1px solid rgba(167,139,250,0.25)",
              fontSize: 11,
              fontFamily: "'IBM Plex Mono',monospace",
              color: T.purple,
              fontWeight: 700,
            }}
          >
            <BookOpen size={11} /> {overview?.totalPilulas ?? "—"} pílulas
          </span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 10px",
              borderRadius: 5,
              background: T.warningBg,
              border: "1px solid rgba(245,158,11,0.25)",
              fontSize: 11,
              fontFamily: "'IBM Plex Mono',monospace",
              color: T.warning,
              fontWeight: 700,
            }}
          >
            <Clock size={11} /> {overview?.pilulasUltimos30d ?? "—"} nos últimos 30d
          </span>
        </div>
      </div>

      {/* ── KPIs ─────────────────────────────────────────────────────── */}
      <div className="ps-kpi-grid">
        <div
          className="ps-kpi"
          style={{ "--kc": T.purple, "--ki-bg": "rgba(167,139,250,0.18)" } as React.CSSProperties}
        >
          <div className="ps-kpi-icon">
            <BookOpen size={22} color={T.purple} />
          </div>
          <div className="ps-kpi-label">Total de Pílulas</div>
          <div className="ps-kpi-value">{overview?.totalPilulas ?? "—"}</div>
          <div className="ps-kpi-hint">conteúdos cadastrados</div>
        </div>
        <div className="ps-kpi" style={{ "--kc": T.warning, "--ki-bg": "rgba(245,158,11,0.2)" } as React.CSSProperties}>
          <div className="ps-kpi-icon">
            <Activity size={22} color={T.warning} />
          </div>
          <div className="ps-kpi-label">Pílulas (30 dias)</div>
          <div className="ps-kpi-value">{overview?.pilulasUltimos30d ?? "—"}</div>
          <div className="ps-kpi-hint">publicadas no período</div>
        </div>
      </div>

      {/* ── Chart ────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-3 gap-4">
        <Block title="Pílulas por mês — últimos 12 meses" chartHeight={260} defaultSize="col-span-3">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={overview?.porMes ?? []} margin={{ top: 16, right: 20, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="psBarGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={T.purple} stopOpacity={1} />
                  <stop offset="100%" stopColor={T.purple} stopOpacity={0.5} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke={T.chartGrid} vertical={false} />
              <XAxis dataKey="m" {...axisProps} />
              <YAxis {...axisProps} axisLine={false} allowDecimals={false} />
              <Tooltip content={<ExecTooltip />} cursor={{ fill: "rgba(167,139,250,0.06)" }} />
              <Bar dataKey="pilulas" name="Pílulas" fill="url(#psBarGrad)" radius={[4, 4, 0, 0]}>
                <LabelList
                  dataKey="pilulas"
                  position="top"
                  fill={T.textPrimary}
                  fontSize={10}
                  fontFamily="'IBM Plex Mono',monospace"
                />
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </Block>
      </div>

      {/* ── Table ────────────────────────────────────────────────────── */}
      <div className="ps-panel">
        <div className="ps-panel-hdr">
          <div className="ps-panel-title">
            <BookOpen size={11} color={T.purple} />
            Pílulas cadastradas
            <span style={{ fontWeight: 400, color: T.textSubtle }}>({filtered.length})</span>
          </div>
          <div className="ps-panel-actions">
            <div className="ps-search-wrap">
              <Search size={12} className="ps-search-icon" />
              <input
                className="ps-search"
                placeholder="Buscar nome ou descrição…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            {canCreate && (
              <button
                className="ps-btn primary"
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                <Plus size={13} /> Nova pílula
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
            <Loader2 size={13} className="ps-spin" color={T.purple} /> Carregando…
          </div>
        ) : filtered.length === 0 ? (
          <div className="ps-empty">
            {search
              ? "Nenhuma pílula corresponde à busca."
              : `Nenhuma pílula cadastrada.${canCreate ? ' Clique em "Nova pílula" para começar.' : ""}`}
          </div>
        ) : (
          <div style={{ overflowX: "auto", maxHeight: 520, overflowY: "auto" }}>
            <table className="ps-table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 18, width: 110 }}>Data</th>
                  <th>Nome</th>
                  <th>Descrição</th>
                  <th style={{ width: 90 }}>Link</th>
                  {(canEdit || canDelete) && <th style={{ width: 80, paddingRight: 18, textAlign: "right" }}>Ações</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id}>
                    <td className="mono dim" style={{ paddingLeft: 18, whiteSpace: "nowrap" }}>
                      {fmtDate(r.data)}
                    </td>
                    <td style={{ fontWeight: 600, color: T.textPrimary, maxWidth: 240 }}>{r.nome}</td>
                    <td
                      style={{
                        fontSize: 11,
                        maxWidth: 360,
                        overflow: "hidden",
                        textOverflow: "ellipsis",
                        whiteSpace: "nowrap",
                      }}
                      title={r.descricao ?? undefined}
                    >
                      {r.descricao ?? "—"}
                    </td>
                    <td>
                      {r.link ? (
                        <a
                          href={r.link}
                          target="_blank"
                          rel="noopener noreferrer"
                          style={{
                            color: T.accent,
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 4,
                            fontSize: 11,
                          }}
                          title={r.link}
                        >
                          <ExternalLink size={12} /> Abrir
                        </a>
                      ) : (
                        <span className="dim">—</span>
                      )}
                    </td>
                    {(canEdit || canDelete) && (
                      <td style={{ textAlign: "right", paddingRight: 18 }}>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
                          {canEdit && (
                            <button
                              className="ps-btn ghost"
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
                              className="ps-btn danger"
                              title="Remover"
                              onClick={() => {
                                if (confirm(`Remover pílula "${r.nome}"?`)) del.mutate(r.id);
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

      <PilulaDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
    </div>
  );
}
