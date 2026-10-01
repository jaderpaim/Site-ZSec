import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { decideGmudApproval, updateGmudStatus, cancelGmud } from "@/lib/gmud.functions";
import { useAuth } from "@/lib/auth-context";
import { usePermissions } from "@/lib/use-permissions";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "../primitives";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  Shield,
  FileText,
  Calendar,
  AlertTriangle,
  User,
  Ban,
  SkipForward,
} from "lucide-react";

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
  teal: "#14B8A6",
  tealBg: "rgba(20,184,166,0.10)",
  orange: "#FB923C",
  orangeBg: "rgba(251,146,60,0.10)",
  purple: "#A78BFA",
  neutral: "#6B7280",
  textPrimary: "#F1F5F9",
  textSecondary: "#F1F5F9",
  textMuted: "#F1F5F9",
  textSubtle: "#F1F5F9",
};

// ── Status styles ──────────────────────────────────────────────────────────────
const STATUS_MAP: Record<string, { bg: string; color: string; border: string }> = {
  Rascunho: { bg: "rgba(107,114,128,0.1)", color: T.neutral, border: "rgba(107,114,128,0.2)" },
  "Em Aprovação": { bg: T.warningBg, color: T.warning, border: "rgba(245,158,11,0.25)" },
  Aprovada: { bg: T.successBg, color: T.success, border: "rgba(16,185,129,0.25)" },
  Rejeitada: { bg: T.dangerBg, color: T.danger, border: "rgba(239,68,68,0.25)" },
  Cancelada: { bg: "rgba(107,114,128,0.1)", color: T.neutral, border: "rgba(107,114,128,0.25)" },
  "Em Execução": { bg: T.accentSoft, color: T.accent, border: "rgba(59,130,246,0.25)" },
  Concluída: { bg: T.tealBg, color: T.teal, border: "rgba(20,184,166,0.25)" },
  Rollback: { bg: T.orangeBg, color: T.orange, border: "rgba(251,146,60,0.25)" },
};

// ── CSS ────────────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');

  .gds-root { font-family:'DM Sans',sans-serif; color:${T.textPrimary}; display:flex; flex-direction:column; gap:14px; margin-top:20px; }
  .gds-root * { box-sizing:border-box; }

  .gds-root ::-webkit-scrollbar       { width:4px; height:4px; }
  .gds-root ::-webkit-scrollbar-track { background:transparent; }
  .gds-root ::-webkit-scrollbar-thumb { background:${T.borderHi}; border-radius:2px; }

  /* status badge */
  .gds-status { display:inline-flex; align-items:center; gap:4px; padding:3px 9px; border-radius:4px; font-size:10px; font-weight:700; letter-spacing:0.07em; text-transform:uppercase; font-family:'IBM Plex Mono',monospace; white-space:nowrap; }
  .gds-status-dot { width:5px; height:5px; border-radius:50%; background:currentColor; flex-shrink:0; }

  /* tipo badge */
  .gds-tipo { display:inline-flex; align-items:center; padding:3px 8px; border-radius:4px; font-size:10px; font-weight:700; letter-spacing:0.07em; text-transform:uppercase; font-family:'IBM Plex Mono',monospace; white-space:nowrap; }
  .gds-tipo.Normal      { background:${T.accentSoft}; color:${T.accent};  border:1px solid rgba(59,130,246,0.25);  }
  .gds-tipo.Prioritária { background:${T.warningBg};  color:${T.warning}; border:1px solid rgba(245,158,11,0.25); }
  .gds-tipo.Emergencial { background:${T.dangerBg};   color:${T.danger};  border:1px solid rgba(239,68,68,0.25);  }

  /* hero */
  .gds-hero { background:${T.surfaceAlt}; border:1px solid ${T.border}; border-radius:10px; padding:16px 18px; }
  .gds-hero-title { font-size:16px; font-weight:700; color:${T.textPrimary}; font-family:'Space Grotesk',sans-serif; letter-spacing:-0.01em; margin-bottom:8px; line-height:1.3; }
  .gds-hero-badges { display:flex; align-items:center; gap:6px; flex-wrap:wrap; }

  /* meta grid */
  .gds-meta-grid { display:grid; grid-template-columns:1fr 1fr; gap:8px; }
  .gds-meta-item { background:${T.surfaceAlt}; border:1px solid ${T.border}; border-radius:7px; padding:10px 12px; }
  .gds-meta-label { font-size:9px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; margin-bottom:4px; display:flex; align-items:center; gap:5px; }
  .gds-meta-value { font-size:13px; color:${T.textPrimary}; font-weight:500; }

  /* section */
  .gds-sec { background:${T.surface}; border:1px solid ${T.border}; border-radius:10px; overflow:hidden; }
  .gds-sec-hd { padding:10px 14px; background:${T.surfaceAlt}; border-bottom:1px solid ${T.border}; display:flex; align-items:center; gap:7px; font-size:10px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; }
  .gds-sec-body { padding:14px; font-size:13px; color:${T.textSecondary}; line-height:1.6; white-space:pre-wrap; font-family:'DM Sans',sans-serif; }

  /* approvers table */
  .gds-apr-table { width:100%; border-collapse:collapse; }
  .gds-apr-table th { padding:7px 12px; font-size:9px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; text-align:left; background:${T.surface}; border-bottom:1px solid ${T.border}; }
  .gds-apr-table td { padding:9px 12px; border-bottom:1px solid rgba(30,38,64,0.4); font-size:12px; color:${T.textPrimary}; vertical-align:middle; }
  .gds-apr-table tbody tr:hover td { background:rgba(59,130,246,0.04); }
  .gds-apr-table tbody tr:last-child td { border-bottom:none; }
  .gds-apr-table tbody tr.active-row td { background:rgba(59,130,246,0.06); }
  .gds-apr-table .mono { font-family:'IBM Plex Mono',monospace; font-size:11px; }
  .gds-apr-table .dim  { color:${T.textMuted}; }

  /* apr status */
  .gds-apr-ok  { display:inline-flex; align-items:center; gap:4px; font-size:11px; color:${T.success}; font-weight:600; font-family:'IBM Plex Mono',monospace; }
  .gds-apr-no  { display:inline-flex; align-items:center; gap:4px; font-size:11px; color:${T.danger};  font-weight:600; font-family:'IBM Plex Mono',monospace; }
  .gds-apr-pnd { display:inline-flex; align-items:center; gap:4px; font-size:11px; color:${T.warning}; font-weight:600; font-family:'IBM Plex Mono',monospace; }
  .gds-apr-cnl { display:inline-flex; align-items:center; gap:4px; font-size:11px; color:${T.neutral}; font-weight:600; font-family:'IBM Plex Mono',monospace; }
  .gds-apr-dsp { display:inline-flex; align-items:center; gap:4px; font-size:11px; color:${T.accent}; font-weight:600; font-family:'IBM Plex Mono',monospace; }

  /* action areas */
  .gds-action-box {
    border:1px solid; border-radius:10px; padding:14px 16px; display:flex; flex-direction:column; gap:10px;
  }
  .gds-action-box.mine    { border-color:rgba(59,130,246,0.3);  background:${T.accentSoft}; }
  .gds-action-box.manager { border-color:${T.border}; background:${T.surfaceAlt}; }
  .gds-action-box.conclude{ border-color:rgba(20,184,166,0.3);  background:${T.tealBg};   }
  .gds-action-box.cancel  { border-color:rgba(107,114,128,0.3); background:rgba(107,114,128,0.06); }
  .gds-action-label { font-size:12px; font-weight:600; color:${T.textPrimary}; margin-bottom:2px; }
  .gds-action-hint  { font-size:11px; color:${T.textMuted}; }
  .gds-action-row   { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }

  /* buttons */
  .gds-btn { display:inline-flex; align-items:center; justify-content:center; gap:6px; padding:8px 16px; border-radius:7px; font-size:12px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif; transition:all 0.15s; border:none; white-space:nowrap; }
  .gds-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .gds-btn.approve  { background:${T.successBg}; border:1px solid rgba(16,185,129,0.35); color:${T.success}; }
  .gds-btn.approve:hover:not(:disabled)  { background:rgba(16,185,129,0.2); }
  .gds-btn.reject   { background:${T.dangerBg};  border:1px solid rgba(239,68,68,0.35);  color:${T.danger};  }
  .gds-btn.reject:hover:not(:disabled)   { background:rgba(239,68,68,0.2); }
  .gds-btn.conclude { background:${T.tealBg};    border:1px solid rgba(20,184,166,0.35); color:${T.teal};   }
  .gds-btn.conclude:hover:not(:disabled) { background:rgba(20,184,166,0.2); }
  .gds-btn.rollback { background:${T.orangeBg};  border:1px solid rgba(251,146,60,0.35); color:${T.orange}; }
  .gds-btn.rollback:hover:not(:disabled) { background:rgba(251,146,60,0.2); }
  .gds-btn.outline  { background:transparent; border:1px solid ${T.border}; color:${T.textSecondary}; }
  .gds-btn.outline:hover:not(:disabled)  { border-color:${T.borderHi}; color:${T.textPrimary}; }
  .gds-btn.cancel   { background:rgba(107,114,128,0.12); border:1px solid rgba(107,114,128,0.35); color:${T.neutral}; }
  .gds-btn.cancel:hover:not(:disabled)   { background:rgba(107,114,128,0.22); }

  /* textarea override */
  .gds-root textarea {
    background:${T.surfaceAlt} !important; border-color:${T.border} !important;
    color:${T.textPrimary} !important; font-family:'DM Sans',sans-serif !important;
    font-size:12px !important; border-radius:6px !important;
  }
  .gds-root textarea:focus { border-color:rgba(59,130,246,0.5) !important; box-shadow:0 0 0 2px rgba(59,130,246,0.1) !important; outline:none !important; }
  .gds-root textarea::placeholder { color:${T.textSubtle} !important; }

  /* spinner */
  @keyframes gds-spin { to{transform:rotate(360deg)} }
  .gds-spin { animation:gds-spin 0.75s linear infinite; }
`;

// ── Helpers ────────────────────────────────────────────────────────────────────
function fmt(s: string | null) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("pt-BR");
  } catch {
    return s;
  }
}

// ── Exported badge components (used by OperationsTab) ─────────────────────────
export function StatusBadge({ status }: { status: string }) {
  const st = STATUS_MAP[status] ?? STATUS_MAP.Rascunho;
  return (
    <span className="gds-status" style={{ background: st.bg, color: st.color, border: `1px solid ${st.border}` }}>
      <span className="gds-status-dot" />
      {status}
    </span>
  );
}

export function TipoBadge({ tipo }: { tipo: string }) {
  return <span className={`gds-tipo ${tipo}`}>{tipo}</span>;
}

export function AprStatus({ s }: { s: string }) {
  if (s === "Aprovado")
    return (
      <span className="gds-apr-ok">
        <CheckCircle2 size={11} /> Aprovado
      </span>
    );
  if (s === "Rejeitado")
    return (
      <span className="gds-apr-no">
        <XCircle size={11} /> Rejeitado
      </span>
    );
  if (s === "Cancelado")
    return (
      <span className="gds-apr-cnl">
        <Ban size={11} /> Cancelado
      </span>
    );
  if (s === "Dispensado")
    return (
      <span className="gds-apr-dsp">
        <SkipForward size={11} /> Dispensado
      </span>
    );
  return (
    <span className="gds-apr-pnd">
      <Clock size={11} /> Pendente
    </span>
  );
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────────
export function GmudDetailsSheet({
  gmud,
  open,
  onOpenChange,
}: {
  gmud: any;
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  // ── back-end UNCHANGED ───────────────────────────────────────────────────
  const { user } = useAuth();
  const { isAdmin, isModuleAdmin, can } = usePermissions();
  const qc = useQueryClient();
  const decide = useServerFn(decideGmudApproval);
  const setStatus = useServerFn(updateGmudStatus);
  const cancel = useServerFn(cancelGmud);

  const [showReject, setShowReject] = React.useState(false);
  const [obs, setObs] = React.useState("");
  const [showCancel, setShowCancel] = React.useState(false);
  const [cancelMotivo, setCancelMotivo] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    setShowReject(false);
    setObs("");
    setShowCancel(false);
    setCancelMotivo("");
  }, [gmud?.id]);

  if (!gmud) return null;

  const aprsOrdered = [...(gmud.aprovadores ?? [])].sort((a: any, b: any) => (a.ordem ?? 0) - (b.ordem ?? 0));
  // "ativo" vem calculado do backend: membros da onda atual (mesmo papel,
  // ordem consecutiva) que ainda podem decidir — pode ter mais de um (ex:
  // mesmo papel em departamentos diferentes), qualquer um deles satisfaz a
  // onda e dispensa os demais.
  const activeAprs = aprsOrdered.filter((a: any) => a.ativo);
  const myApr = activeAprs.find((a: any) => a.email_aprovador?.toLowerCase() === (user?.email ?? "").toLowerCase());
  const canManage = isAdmin || isModuleAdmin("gmud") || can("gmud", "edit");
  const isCreator = !!user && !!gmud?.criado_por && user.id === gmud.criado_por;
  const canConclude = canManage || isCreator;

  async function approve() {
    setLoading(true);
    try {
      await decide({ data: { gmudId: gmud.id, aprovadorId: myApr.id, decisao: "Aprovado", observacoes: null } });
      toast.success("GMUD aprovada");
      qc.invalidateQueries({ queryKey: ["gmuds"] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }
  async function reject() {
    if (!obs.trim()) return toast.error("Informe a justificativa");
    setLoading(true);
    try {
      await decide({ data: { gmudId: gmud.id, aprovadorId: myApr.id, decisao: "Rejeitado", observacoes: obs.trim() } });
      toast.success("GMUD rejeitada");
      qc.invalidateQueries({ queryKey: ["gmuds"] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }
  async function changeStatus(s: string) {
    setLoading(true);
    try {
      await setStatus({ data: { id: gmud.id, status: s as any } });
      toast.success("Status atualizado");
      qc.invalidateQueries({ queryKey: ["gmuds"] });
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }
  async function confirmCancel() {
    if (!cancelMotivo.trim()) return toast.error("Informe a justificativa do cancelamento");
    setLoading(true);
    try {
      await cancel({ data: { id: gmud.id, motivo: cancelMotivo.trim(), usuario_email: user?.email ?? null } });
      toast.success("GMUD cancelada");
      qc.invalidateQueries({ queryKey: ["gmuds"] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setLoading(false);
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        className="w-full sm:max-w-2xl overflow-y-auto"
        style={{ background: T.surface, borderLeft: `1px solid ${T.border}`, padding: "20px 20px 32px" }}
      >
        <SheetHeader>
          <SheetTitle asChild>
            <div style={{ fontFamily: "'Space Grotesk',sans-serif", color: T.textPrimary }}>Detalhes da GMUD</div>
          </SheetTitle>
        </SheetHeader>

        <div className="gds-root">
          <style dangerouslySetInnerHTML={{ __html: CSS }} />

          {/* Hero */}
          <div className="gds-hero">
            <div className="gds-hero-title">{gmud.titulo}</div>
            <div className="gds-hero-badges">
              <StatusBadge status={gmud.status_geral} />
              <TipoBadge tipo={gmud.tipo} />
              {gmud.impacto && (
                <span
                  style={{
                    fontSize: 10,
                    color: T.textMuted,
                    fontFamily: "'IBM Plex Mono',monospace",
                    background: T.surfaceAlt,
                    border: `1px solid ${T.border}`,
                    borderRadius: 4,
                    padding: "2px 7px",
                  }}
                >
                  Impacto: {gmud.impacto}
                </span>
              )}
            </div>
          </div>

          {/* Meta grid */}
          <div className="gds-meta-grid">
            <div className="gds-meta-item" style={{ gridColumn: "1 / -1" }}>
              <div className="gds-meta-label">
                <User size={10} /> Criado por
              </div>
              <div className="gds-meta-value">{gmud.criado_por_nome || gmud.criado_por_email || "—"}</div>
            </div>
            <div className="gds-meta-item">
              <div className="gds-meta-label">
                <Calendar size={10} /> Início
              </div>
              <div className="gds-meta-value">{fmt(gmud.data_inicio)}</div>
            </div>
            <div className="gds-meta-item">
              <div className="gds-meta-label">
                <Calendar size={10} /> Fim
              </div>
              <div className="gds-meta-value">{fmt(gmud.data_fim)}</div>
            </div>
          </div>

          {/* Sections */}
          {gmud.status_geral === "Cancelada" && gmud.motivo_cancelamento && (
            <div className="gds-sec">
              <div className="gds-sec-hd">
                <Ban size={10} /> Motivo do cancelamento
              </div>
              <div className="gds-sec-body">{gmud.motivo_cancelamento}</div>
            </div>
          )}
          {gmud.descricao && (
            <div className="gds-sec">
              <div className="gds-sec-hd">
                <FileText size={10} /> Descrição
              </div>
              <div className="gds-sec-body">{gmud.descricao}</div>
            </div>
          )}
          {gmud.justificativa && (
            <div className="gds-sec">
              <div className="gds-sec-hd">
                <FileText size={10} /> Justificativa
              </div>
              <div className="gds-sec-body">{gmud.justificativa}</div>
            </div>
          )}
          <div className="gds-sec">
            <div className="gds-sec-hd">
              <FileText size={10} /> Plano de execução
            </div>
            <div className="gds-sec-body">
              {gmud.plano_execucao || <em style={{ color: T.textSubtle }}>Não informado</em>}
            </div>
          </div>
          <div className="gds-sec">
            <div className="gds-sec-hd">
              <FileText size={10} /> Plano de rollback
            </div>
            <div className="gds-sec-body">
              {gmud.plano_rollback || <em style={{ color: T.textSubtle }}>Não informado</em>}
            </div>
          </div>

          {/* Approvers */}
          <div className="gds-sec">
            <div className="gds-sec-hd">
              <Shield size={10} /> Aprovadores
            </div>
            <div style={{ overflowX: "auto" }}>
              <table className="gds-apr-table">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Nome</th>
                    <th>E-mail</th>
                    <th>Papel</th>
                    <th>Status</th>
                    <th>Quando</th>
                  </tr>
                </thead>
                <tbody>
                  {aprsOrdered.map((a: any) => {
                    const isActive = !!a.ativo;
                    return (
                      <tr key={a.id} className={isActive ? "active-row" : ""}>
                        <td className="mono dim">
                          {a.ordem ?? "—"}
                          {isActive ? <span style={{ color: T.accent, marginLeft: 4 }}>●</span> : ""}
                        </td>
                        <td style={{ fontWeight: 500 }}>{a.nome_aprovador}</td>
                        <td className="dim">{a.email_aprovador}</td>
                        <td className="dim">{a.papel ?? "—"}</td>
                        <td>
                          <AprStatus s={a.status_aprovacao} />
                        </td>
                        <td className="mono dim">{a.data_acao ? fmt(a.data_acao) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* My approval */}
          {myApr && (
            <div className="gds-action-box mine">
              <div>
                <div className="gds-action-label">Sua aprovação é necessária</div>
                <div className="gds-action-hint">
                  {activeAprs.length > 1
                    ? "Você é um dos aprovadores desta etapa — sua decisão já é suficiente, os demais serão dispensados."
                    : "Você é o próximo aprovador desta GMUD."}
                </div>
              </div>
              {!showReject ? (
                <div className="gds-action-row">
                  <button className="gds-btn approve" onClick={approve} disabled={loading}>
                    {loading ? <Loader2 size={12} className="gds-spin" /> : <CheckCircle2 size={13} />}
                    Aprovar mudança
                  </button>
                  <button className="gds-btn reject" onClick={() => setShowReject(true)} disabled={loading}>
                    <XCircle size={13} /> Rejeitar mudança
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <Textarea
                    rows={3}
                    placeholder="Justificativa obrigatória para rejeitar a mudança…"
                    value={obs}
                    onChange={(e) => setObs(e.target.value)}
                  />
                  <div className="gds-action-row">
                    <button className="gds-btn reject" onClick={reject} disabled={loading || !obs.trim()}>
                      {loading ? <Loader2 size={12} className="gds-spin" /> : <XCircle size={13} />}
                      Confirmar rejeição
                    </button>
                    <button className="gds-btn outline" onClick={() => setShowReject(false)} disabled={loading}>
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Cancelar GMUD (só o criador, enquanto ainda em aprovação) */}
          {isCreator && gmud.status_geral === "Em Aprovação" && (
            <div className="gds-action-box cancel">
              <div>
                <div className="gds-action-label">Cancelar esta GMUD</div>
                <div className="gds-action-hint">
                  Você pode cancelar a GMUD que criou enquanto ela ainda estiver em aprovação. Após é necessário
                  informar uma justificativa.
                </div>
              </div>
              {!showCancel ? (
                <div className="gds-action-row">
                  <button className="gds-btn cancel" onClick={() => setShowCancel(true)} disabled={loading}>
                    <Ban size={13} /> Cancelar GMUD
                  </button>
                </div>
              ) : (
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  <Textarea
                    rows={3}
                    placeholder="Justificativa obrigatória para cancelar a GMUD…"
                    value={cancelMotivo}
                    onChange={(e) => setCancelMotivo(e.target.value)}
                  />
                  <div className="gds-action-row">
                    <button
                      className="gds-btn cancel"
                      onClick={confirmCancel}
                      disabled={loading || !cancelMotivo.trim()}
                    >
                      {loading ? <Loader2 size={12} className="gds-spin" /> : <Ban size={13} />}
                      Confirmar cancelamento
                    </button>
                    <button className="gds-btn outline" onClick={() => setShowCancel(false)} disabled={loading}>
                      Voltar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Conclude / Rollback */}
          {canConclude && gmud.status_geral === "Aprovada" && (
            <div className="gds-action-box conclude">
              <div>
                <div className="gds-action-label">GMUD aprovada — registre o resultado</div>
                <div className="gds-action-hint">A mudança foi aprovada. Informe o desfecho após a execução.</div>
              </div>
              <div className="gds-action-row">
                <button className="gds-btn conclude" onClick={() => changeStatus("Concluída")} disabled={loading}>
                  {loading ? <Loader2 size={12} className="gds-spin" /> : <CheckCircle2 size={13} />}
                  Marcar como Concluída
                </button>
                <button className="gds-btn rollback" onClick={() => changeStatus("Rollback")} disabled={loading}>
                  ↩ Acionar Rollback
                </button>
              </div>
            </div>
          )}

          {/* Manager status change */}
          {canManage && (
            <div className="gds-action-box manager">
              <div>
                <div className="gds-action-label">Atualizar status (gestor)</div>
                <div className="gds-action-hint">Altere manualmente o status desta GMUD.</div>
              </div>
              <Select value={gmud.status_geral} onValueChange={changeStatus}>
                <SelectTrigger
                  style={{
                    background: T.surface,
                    borderColor: T.border,
                    color: T.textPrimary,
                    fontFamily: "'IBM Plex Mono',monospace",
                    fontSize: 12,
                    width: 260,
                  }}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[
                    "Rascunho",
                    "Em Aprovação",
                    "Aprovada",
                    "Rejeitada",
                    "Cancelada",
                    "Em Execução",
                    "Concluída",
                    "Rollback",
                  ].map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
