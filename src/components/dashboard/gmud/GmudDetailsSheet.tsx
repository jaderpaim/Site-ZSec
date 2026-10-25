import * as React from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { decideGmudApproval, updateGmudStatus, cancelGmud, deleteGmud } from "@/lib/gmud.functions";
import { useAuth } from "@/lib/auth-context";
import { usePermissions } from "@/lib/use-permissions";
import { allowedStatusTransitions } from "@/lib/gmud-rules";
import { DetailList, DetailSection, DetailSheet } from "@/components/layout/DetailSheet";
import {
  errMsg,
  sortAprovadores,
  useCanDeleteGmud,
  type GmudRow,
  type GmudStatus,
} from "./gmud-shared";
import {
  CheckCircle2,
  XCircle,
  Clock,
  Ban,
  Loader2,
  FileText,
  RotateCcw,
  PlayCircle,
  Trash2,
  AlertTriangle,
  UserCheck,
} from "lucide-react";

// Estilos: classes gm-* definidas em GmudReal.tsx (casco do módulo).

const STATUS_STYLE: Record<string, { cls: string; Icon: React.ElementType }> = {
  Rascunho: { cls: "", Icon: FileText },
  "Em Aprovação": { cls: "accent", Icon: Clock },
  Aprovada: { cls: "low", Icon: CheckCircle2 },
  Rejeitada: { cls: "crit", Icon: XCircle },
  Cancelada: { cls: "", Icon: Ban },
  "Em Execução": { cls: "accent", Icon: PlayCircle },
  Concluída: { cls: "ok", Icon: CheckCircle2 },
  Rollback: { cls: "high", Icon: RotateCcw },
};
const TIPO_CLS: Record<string, string> = { Normal: "", Prioritária: "med", Emergencial: "crit" };

function fmt(s: string | null) {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return s;
  }
}

// ── Pílulas (usadas também pela lista) ──────────────────────────────────────────
export function StatusBadge({ status }: { status: string }) {
  const st = STATUS_STYLE[status] ?? STATUS_STYLE.Rascunho;
  return (
    <span className={`gm-tag ${st.cls}`}>
      <st.Icon size={11} /> {status}
    </span>
  );
}

export function TipoBadge({ tipo }: { tipo: string }) {
  return <span className={`gm-tag ${TIPO_CLS[tipo] ?? ""}`}>{tipo}</span>;
}

// ── MAIN COMPONENT ─────────────────────────────────────────────────────────────
export function GmudDetailsSheet({
  gmud,
  open,
  onOpenChange,
  askDelete = false,
}: {
  gmud: GmudRow | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  askDelete?: boolean;
}) {
  // ── back-end UNCHANGED ───────────────────────────────────────────────────
  const { user } = useAuth();
  const { isAdmin, isModuleAdmin, can } = usePermissions();
  const qc = useQueryClient();
  const decide = useServerFn(decideGmudApproval);
  const setStatus = useServerFn(updateGmudStatus);
  const cancel = useServerFn(cancelGmud);
  const doDelete = useServerFn(deleteGmud);
  const canDelete = useCanDeleteGmud();

  const [showReject, setShowReject] = React.useState(false);
  const [obs, setObs] = React.useState("");
  const [showCancel, setShowCancel] = React.useState(false);
  const [cancelMotivo, setCancelMotivo] = React.useState("");
  const [confirmDelete, setConfirmDelete] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  // Decisão em nome do aprovador (admin/super_admin)
  const [behalfOpen, setBehalfOpen] = React.useState(false);
  const [behalfAprId, setBehalfAprId] = React.useState<string>("");
  const [behalfObs, setBehalfObs] = React.useState("");

  React.useEffect(() => {
    setShowReject(false);
    setObs("");
    setShowCancel(false);
    setCancelMotivo("");
    setConfirmDelete(askDelete);
    setBehalfOpen(false);
    setBehalfAprId("");
    setBehalfObs("");
  }, [gmud?.id, askDelete]);

  const aprsOrdered = sortAprovadores(gmud?.aprovadores);
  // "ativo" vem calculado do backend: quem foi notificado no grupo da vez
  // (mesmo departamento + papel) e ainda pode decidir. Normalmente é uma
  // pessoa só; o backup só fica ativo depois do escalonamento por inatividade.
  const activeAprs = aprsOrdered.filter((a) => a.ativo);
  const myApr = activeAprs.find(
    (a) => a.email_aprovador?.toLowerCase() === (user?.email ?? "").toLowerCase(),
  );
  const canManage = isAdmin || isModuleAdmin("gmud") || can("gmud", "edit");
  const isCreator = !!user && !!gmud?.criado_por && user.id === gmud.criado_por;
  // Mesmas regras do servidor (gmud-rules.ts): a tela só oferece o que ele aceita.
  const nextStatuses = allowedStatusTransitions(gmud?.status_geral, {
    isCreator,
    canExecute: can("gmud", "execute"),
  });
  const canConclude = nextStatuses.includes("Concluída");
  // Admin/super_admin decide em nome do aprovador da vez (férias, ausência) —
  // nunca na GMUD que ele mesmo criou, e não quando ele já é o aprovador da vez.
  const canDecideOnBehalf =
    !!gmud &&
    isAdmin &&
    !isCreator &&
    !myApr &&
    gmud.status_geral === "Em Aprovação" &&
    activeAprs.length > 0;
  const behalfApr = activeAprs.find((a) => a.id === behalfAprId) ?? activeAprs[0];
  const deletable = canDelete(gmud);
  const totalEtapas = gmud?.total_aprovadores ?? aprsOrdered.length;

  const refresh = () => qc.invalidateQueries({ queryKey: ["gmuds"] });

  async function approve() {
    if (!gmud || !myApr) return;
    setLoading(true);
    try {
      await decide({
        data: { gmudId: gmud.id, aprovadorId: myApr.id, decisao: "Aprovado", observacoes: null },
      });
      toast.success("GMUD aprovada");
      refresh();
      onOpenChange(false);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }
  async function reject() {
    if (!gmud || !myApr) return;
    if (!obs.trim()) return toast.error("Informe a justificativa");
    setLoading(true);
    try {
      await decide({
        data: {
          gmudId: gmud.id,
          aprovadorId: myApr.id,
          decisao: "Rejeitado",
          observacoes: obs.trim(),
        },
      });
      toast.success("GMUD rejeitada");
      refresh();
      onOpenChange(false);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }
  async function decideOnBehalf(decisao: "Aprovado" | "Rejeitado") {
    if (!gmud || !behalfApr) return;
    if (!behalfObs.trim()) return toast.error("Informe a justificativa");
    setLoading(true);
    try {
      await decide({
        data: {
          gmudId: gmud.id,
          aprovadorId: behalfApr.id,
          decisao,
          observacoes: behalfObs.trim(),
        },
      });
      toast.success(
        decisao === "Aprovado"
          ? `Aprovado em nome de ${behalfApr.nome_aprovador}`
          : `Rejeitado em nome de ${behalfApr.nome_aprovador}`,
      );
      refresh();
      onOpenChange(false);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }
  async function changeStatus(s: string) {
    if (!gmud) return;
    setLoading(true);
    try {
      await setStatus({ data: { id: gmud.id, status: s as GmudStatus } });
      toast.success("Status atualizado");
      refresh();
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }
  async function confirmCancel() {
    if (!gmud) return;
    if (!cancelMotivo.trim()) return toast.error("Informe a justificativa do cancelamento");
    setLoading(true);
    try {
      await cancel({
        data: { id: gmud.id, motivo: cancelMotivo.trim() },
      });
      toast.success("GMUD cancelada");
      refresh();
      onOpenChange(false);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }
  async function remove() {
    if (!gmud) return;
    setLoading(true);
    try {
      await doDelete({ data: { id: gmud.id } });
      toast.success("GMUD excluída.");
      refresh();
      onOpenChange(false);
    } catch (e) {
      toast.error(errMsg(e, "Erro ao excluir GMUD."));
    } finally {
      setLoading(false);
    }
  }
  // ─────────────────────────────────────────────────────────────────────────

  const spin = <Loader2 size={13} className="gm-spin" />;
  const janelaPassou = !!gmud?.data_fim && new Date(gmud.data_fim).getTime() < Date.now();
  const duracaoH =
    gmud?.data_inicio && gmud?.data_fim
      ? Math.max(
          0,
          Math.round(
            (new Date(gmud.data_fim).getTime() - new Date(gmud.data_inicio).getTime()) / 3_600_000,
          ),
        )
      : null;

  // Ação principal no topo: o que esta pessoa pode fazer agora
  let action: React.ReactNode = null;
  if (gmud && myApr && !isCreator) {
    action = !showReject ? (
      <div className="gm-act">
        <b>Sua aprovação é necessária</b>
        <p>
          {activeAprs.length > 1
            ? "Você é um dos aprovadores desta etapa — sua decisão já é suficiente, os demais serão dispensados."
            : `Você é o aprovador da etapa ${myApr.ordem} de ${totalEtapas}. Ao aprovar, o próximo da cadeia recebe o e-mail.`}
        </p>
        <div className="row">
          <button className="gm-btn ok" onClick={approve} disabled={loading}>
            {loading ? spin : <CheckCircle2 size={14} />} Aprovar mudança
          </button>
          <button className="gm-btn" onClick={() => setShowReject(true)} disabled={loading}>
            <XCircle size={14} /> Rejeitar
          </button>
        </div>
      </div>
    ) : (
      <div className="gm-act">
        <b>Rejeitar esta mudança</b>
        <textarea
          className="gm-textarea"
          rows={3}
          placeholder="Justificativa obrigatória para rejeitar a mudança…"
          value={obs}
          onChange={(e) => setObs(e.target.value)}
          autoFocus
        />
        <div className="row">
          <button className="gm-btn danger" onClick={reject} disabled={loading || !obs.trim()}>
            {loading ? spin : <XCircle size={14} />} Confirmar rejeição
          </button>
          <button className="gm-btn ghost" onClick={() => setShowReject(false)} disabled={loading}>
            Voltar
          </button>
        </div>
      </div>
    );
  } else if (canDecideOnBehalf && behalfApr) {
    action = !behalfOpen ? (
      <div className="gm-act neutral">
        <b>Aguardando {behalfApr.nome_aprovador}</b>
        <p>
          Como administrador, você pode decidir em nome do aprovador da vez (ex.: férias ou
          ausência). A decisão fica registrada no histórico como sua, com a justificativa.
        </p>
        <div className="row">
          <button className="gm-btn" onClick={() => setBehalfOpen(true)} disabled={loading}>
            <UserCheck size={14} /> Decidir em nome do aprovador
          </button>
        </div>
      </div>
    ) : (
      <div className="gm-act neutral">
        <b>Decidir em nome do aprovador</b>
        {activeAprs.length > 1 && (
          <select
            className="gm-select"
            value={behalfApr.id}
            onChange={(e) => setBehalfAprId(e.target.value)}
            disabled={loading}
            aria-label="Aprovador"
          >
            {activeAprs.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome_aprovador} ({a.email_aprovador})
              </option>
            ))}
          </select>
        )}
        <p>
          Você vai decidir pela etapa {behalfApr.ordem} de {totalEtapas}, no lugar de{" "}
          <strong>{behalfApr.nome_aprovador}</strong>.
        </p>
        <textarea
          className="gm-textarea"
          rows={3}
          placeholder="Justificativa obrigatória (ex.: aprovador de férias, aprovado por telefone em 25/10)…"
          value={behalfObs}
          onChange={(e) => setBehalfObs(e.target.value)}
          autoFocus
        />
        <div className="row">
          <button
            className="gm-btn ok"
            onClick={() => decideOnBehalf("Aprovado")}
            disabled={loading || !behalfObs.trim()}
          >
            {loading ? spin : <CheckCircle2 size={14} />} Aprovar em nome
          </button>
          <button
            className="gm-btn danger"
            onClick={() => decideOnBehalf("Rejeitado")}
            disabled={loading || !behalfObs.trim()}
          >
            <XCircle size={14} /> Rejeitar em nome
          </button>
          <button className="gm-btn ghost" onClick={() => setBehalfOpen(false)} disabled={loading}>
            Voltar
          </button>
        </div>
      </div>
    );
  } else if (gmud && canConclude && gmud.status_geral === "Aprovada") {
    action = (
      <div className="gm-act ok">
        <b>Aprovada · registre o resultado</b>
        <p>
          {janelaPassou
            ? `A janela terminou em ${fmt(gmud.data_fim)}.`
            : `Janela de ${fmt(gmud.data_inicio)} a ${fmt(gmud.data_fim)}.`}{" "}
          Informe o desfecho após a execução.
        </p>
        <div className="row">
          <button
            className="gm-btn ok"
            onClick={() => changeStatus("Concluída")}
            disabled={loading}
          >
            {loading ? spin : <CheckCircle2 size={14} />} Concluída
          </button>
          <button className="gm-btn" onClick={() => changeStatus("Rollback")} disabled={loading}>
            <RotateCcw size={14} /> Acionar rollback
          </button>
        </div>
      </div>
    );
  } else if (gmud && isCreator && gmud.status_geral === "Em Aprovação") {
    action = !showCancel ? (
      <div className="gm-act neutral">
        <b>Você criou esta GMUD</b>
        <p>Enquanto estiver em aprovação, você pode cancelá-la informando o motivo.</p>
        <div className="row">
          <button className="gm-btn" onClick={() => setShowCancel(true)} disabled={loading}>
            <Ban size={14} /> Cancelar GMUD
          </button>
        </div>
      </div>
    ) : (
      <div className="gm-act neutral">
        <b>Cancelar esta GMUD</b>
        <textarea
          className="gm-textarea"
          rows={3}
          placeholder="Justificativa obrigatória do cancelamento…"
          value={cancelMotivo}
          onChange={(e) => setCancelMotivo(e.target.value)}
          autoFocus
        />
        <div className="row">
          <button
            className="gm-btn danger"
            onClick={confirmCancel}
            disabled={loading || !cancelMotivo.trim()}
          >
            {loading ? spin : <Ban size={14} />} Confirmar cancelamento
          </button>
          <button className="gm-btn ghost" onClick={() => setShowCancel(false)} disabled={loading}>
            Voltar
          </button>
        </div>
      </div>
    );
  }

  const footer =
    gmud && (canManage || deletable) ? (
      confirmDelete ? (
        <div className="gm-foot">
          <span className="lbl" style={{ marginRight: "auto" }}>
            Excluir esta GMUD? Não dá para desfazer.
          </span>
          <button
            className="gm-btn ghost"
            onClick={() => setConfirmDelete(false)}
            disabled={loading}
          >
            Cancelar
          </button>
          <button className="gm-btn danger" onClick={remove} disabled={loading}>
            {loading ? spin : <Trash2 size={13} />} Excluir
          </button>
        </div>
      ) : (
        <div className="gm-foot">
          {deletable && (
            <button className="gm-btn danger-text" onClick={() => setConfirmDelete(true)}>
              Excluir
            </button>
          )}
          {canManage && nextStatuses.length > 0 && (
            <span
              style={{ display: "inline-flex", alignItems: "center", gap: 8, marginLeft: "auto" }}
            >
              <span className="lbl">Gestor: alterar status</span>
              <select
                className="gm-select"
                value={gmud.status_geral}
                onChange={(e) => changeStatus(e.target.value)}
                disabled={loading}
                aria-label="Alterar status"
              >
                {[gmud.status_geral, ...nextStatuses].map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </span>
          )}
        </div>
      )
    ) : null;

  return (
    <DetailSheet
      open={open && !!gmud}
      onOpenChange={onOpenChange}
      width={640}
      eyebrow={
        gmud
          ? `GMUD ${gmud.id.slice(0, 8)} · criada ${fmt(gmud.created_at)}${
              gmud.criado_por_nome || gmud.criado_por_email
                ? ` por ${gmud.criado_por_nome || gmud.criado_por_email}`
                : ""
            }`
          : null
      }
      title={gmud?.titulo ?? ""}
      badges={
        gmud && (
          <>
            <StatusBadge status={gmud.status_geral} />
            <TipoBadge tipo={gmud.tipo} />
            {gmud.impacto && <span className="gm-tag">Impacto {gmud.impacto}</span>}
          </>
        )
      }
      footer={footer}
    >
      {gmud && (
        <>
          {action}

          {gmud.status_geral === "Cancelada" && gmud.motivo_cancelamento && (
            <DetailSection title="Motivo do cancelamento">
              <div className="gm-txt">{gmud.motivo_cancelamento}</div>
            </DetailSection>
          )}

          <DetailSection title="Janela">
            <DetailList
              items={[
                ["Início", fmt(gmud.data_inicio), true],
                ["Fim", fmt(gmud.data_fim), true],
                ["Duração", duracaoH !== null ? `${duracaoH} h` : "—"],
                ["Criada por", gmud.criado_por_nome || gmud.criado_por_email || "—"],
              ]}
            />
          </DetailSection>

          {gmud.descricao && (
            <DetailSection title="Descrição">
              <div className="gm-txt">{gmud.descricao}</div>
            </DetailSection>
          )}
          {gmud.justificativa && (
            <DetailSection title="Justificativa">
              <div className="gm-txt">{gmud.justificativa}</div>
            </DetailSection>
          )}
          <DetailSection title="Plano de execução">
            <div className="gm-txt">
              {gmud.plano_execucao || <em className="dim">Não informado</em>}
            </div>
          </DetailSection>
          <DetailSection title="Plano de rollback">
            <div className="gm-txt">
              {gmud.plano_rollback || <em className="dim">Não informado</em>}
            </div>
          </DetailSection>

          <DetailSection title="Cadeia de aprovação">
            {aprsOrdered.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: "var(--v2-fg-3)" }}>
                Nenhum aprovador definido.
              </p>
            ) : (
              <div className="gm-chain">
                {aprsOrdered.map((a) => {
                  const st = a.status_aprovacao;
                  const cls =
                    st === "Aprovado" ? "ok" : st === "Rejeitado" ? "no" : a.ativo ? "cur" : "";
                  return (
                    <div key={a.id}>
                      <span className={`n ${cls}`}>
                        {st === "Aprovado" ? "✓" : st === "Rejeitado" ? "✕" : (a.ordem ?? "·")}
                      </span>
                      <b>{a.nome_aprovador}</b>
                      <span className="when">
                        {a.data_acao ? fmt(a.data_acao) : a.ativo ? "aguardando" : "—"}
                      </span>
                      <small>
                        {[a.papel, st, a.ativo ? "etapa atual" : null].filter(Boolean).join(" · ")}
                        {a.email_aprovador ? ` · ${a.email_aprovador}` : ""}
                      </small>
                      {a.observacoes && <div className="obs">“{a.observacoes}”</div>}
                    </div>
                  );
                })}
              </div>
            )}
            {gmud.status_geral === "Em Aprovação" && activeAprs.length > 1 && (
              <p style={{ margin: "8px 0 0", fontSize: 12.5, color: "var(--v2-fg-3)" }}>
                <AlertTriangle size={12} style={{ display: "inline", verticalAlign: "-1px" }} />{" "}
                Esta etapa tem {activeAprs.length} aprovadores do mesmo departamento e papel; a
                decisão de qualquer um deles basta.
              </p>
            )}
          </DetailSection>
        </>
      )}
    </DetailSheet>
  );
}
