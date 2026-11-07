import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Info, Inbox, RotateCcw } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { usePermissions } from "@/lib/use-permissions";
import {
  approveDeleteRequest,
  cancelDeleteRequest,
  listDeleteRequests,
  rejectDeleteRequest,
  type DeleteRequest,
} from "@/lib/cloudflare.guard.functions";
import { Badge, Block, Empty, Note } from "./cf-ui";
import { fmtDateTime, timeAgo } from "./change-utils";
import { DeleteExceptionsView } from "./DeleteExceptionsView";
import { RequestRestoreDialog, useCanRestoreDns } from "./RequestRestoreDialog";

type Filter = "pending" | "approved" | "rejected" | "all";
const FILTERS: Array<{ key: Filter; label: string; color: string }> = [
  { key: "pending", label: "Pendentes", color: "var(--v2-crit)" },
  { key: "approved", label: "Excluídas", color: "var(--v2-ok)" },
  { key: "rejected", label: "Recusadas", color: "var(--v2-fg-3)" },
  { key: "all", label: "Todas", color: "var(--v2-accent)" },
];
const STATUS: Record<DeleteRequest["status"], { label: string; color: string }> = {
  pending: { label: "Pendente", color: "var(--v2-crit)" },
  approved: { label: "Excluído", color: "var(--v2-ok)" },
  rejected: { label: "Recusado", color: "var(--v2-fg-3)" },
  cancelled: { label: "Cancelado", color: "var(--v2-fg-3)" },
  failed: { label: "Falhou", color: "var(--v2-high)" },
};

// Sub-abas: "Pedidos de exclusão" (todos) e "Exceções de aprovação" (só
// admin/super admin com manage_liberar_excecao_dns).
export function RequestsView({ zoneId }: { zoneId: string }) {
  const { can, isAdmin } = usePermissions();
  const canExceptions = isAdmin && can("cloudflare-waf", "manage_liberar_excecao_dns");
  const [sub, setSub] = React.useState<"requests" | "exceptions">("requests");
  if (!canExceptions) return <RequestsList zoneId={zoneId} />;
  return (
    <div className="cfx-col">
      <div className="cfx-tabs" role="tablist" aria-label="Solicitações">
        <button
          role="tab"
          aria-selected={sub === "requests"}
          className={`cfx-tab${sub === "requests" ? " on" : ""}`}
          onClick={() => setSub("requests")}
        >
          Pedidos de exclusão
        </button>
        <button
          role="tab"
          aria-selected={sub === "exceptions"}
          className={`cfx-tab${sub === "exceptions" ? " on" : ""}`}
          data-cf-tour="dns-exception-tab"
          onClick={() => setSub("exceptions")}
        >
          Exceções de aprovação
        </button>
      </div>
      {sub === "requests" ? <RequestsList zoneId={zoneId} /> : <DeleteExceptionsView />}
    </div>
  );
}

function RequestsList({ zoneId }: { zoneId: string }) {
  const { can, isAdmin } = usePermissions();
  const canApprove = can("cloudflare-waf", "manage_aprovar_exclusao_dns") && isAdmin;
  // Recusar também é só admin/super admin: os demais nem veem pedidos alheios.
  const canReject = can("cloudflare-waf", "manage_aprovar_exclusao_dns") && isAdmin;
  const [filter, setFilter] = React.useState<Filter>("pending");
  const fetchList = useServerFn(listDeleteRequests);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["cf-dns-delete-requests", zoneId, "all"],
    queryFn: () => fetchList({ data: { zoneId, status: "all" } }),
    refetchInterval: 60_000,
  });
  const all: DeleteRequest[] = (data as any)?.requests ?? [];
  const canViewAll: boolean = (data as any)?.canViewAll ?? false;
  const counts = {
    pending: all.filter((r) => r.status === "pending").length,
    approved: all.filter((r) => r.status === "approved").length,
    rejected: all.filter((r) => r.status === "rejected").length,
    all: all.length,
  };
  const list = all.filter((r) => filter === "all" || r.status === filter);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["cf-dns-delete-requests"] });
    qc.invalidateQueries({ queryKey: ["cf-guard-status"] });
    qc.invalidateQueries({ queryKey: ["cloudflare-zone-changes"] });
  };

  const [approving, setApproving] = React.useState<DeleteRequest | null>(null);
  const [rejecting, setRejecting] = React.useState<DeleteRequest | null>(null);
  const [restoring, setRestoring] = React.useState<string | null>(null);
  const canRestore = useCanRestoreDns();
  const cancel = useServerFn(cancelDeleteRequest);

  return (
    <div className="cfx-col">
      <Block title="Solicitações de exclusão de DNS" icon={Inbox}>
        <div className="cfx-chips">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              className={`cfx-chip${filter === f.key ? " on" : ""}`}
              style={{ "--cc": f.color } as React.CSSProperties}
              onClick={() => setFilter(f.key)}
            >
              {f.label}
              <span className="n">{counts[f.key]}</span>
            </button>
          ))}
        </div>
        {!canViewAll && (
          <Note color="var(--v2-accent)" icon={Info}>
            Você vê só os pedidos que abriu. Os pedidos de todos os usuários ficam visíveis só para
            admin e super admin, que são quem confirma ou recusa.
          </Note>
        )}
        {isLoading ? (
          <Empty>Carregando solicitações…</Empty>
        ) : error ? (
          <Empty>{(error as Error).message}</Empty>
        ) : list.length === 0 ? (
          <Empty>Nenhuma solicitação neste filtro.</Empty>
        ) : (
          list.map((r) => (
            <article
              key={r.id}
              style={{
                border: "1px solid var(--v2-line)",
                borderLeft:
                  r.status === "pending"
                    ? "3px solid var(--v2-crit)"
                    : "1px solid var(--v2-line)",
                borderRadius: 9,
                padding: 14,
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                  alignItems: "flex-start",
                }}
              >
                <div className="cfx-host" style={{ fontSize: 13 }}>
                  {r.record.type} {r.record.name}
                  <small>
                    → {r.record.content} · {r.record.proxied ? "proxied" : "só DNS"}
                  </small>
                </div>
                <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap" }}>
                  {r.byException && <Badge label="Por exceção" color="var(--v2-cat-exec)" />}
                  {r.restoredAt ? (
                    <Badge label="Restaurado" color="var(--v2-accent)" />
                  ) : (
                    <Badge label={STATUS[r.status].label} color={STATUS[r.status].color} />
                  )}
                </span>
              </div>
              <div
                style={{
                  border: "1px solid var(--v2-line)",
                  background: "var(--v2-surface-2)",
                  borderRadius: 7,
                  padding: "9px 12px",
                  fontSize: 12.5,
                }}
              >
                <span className="cfx-lbl" style={{ display: "block", marginBottom: 3 }}>
                  Justificativa
                </span>
                {r.justification}
              </div>
              <div
                className="cfx-muted"
                style={{ fontSize: 11.5, display: "flex", gap: 14, flexWrap: "wrap" }}
              >
                <span>
                  Solicitado por <b>{r.requestedByEmail ?? "—"}</b>
                </span>
                <span title={fmtDateTime(r.createdAt)}>{timeAgo(r.createdAt)}</span>
                {r.decidedAt && r.status !== "pending" && (
                  <span>
                    {r.status === "approved"
                      ? "Excluído"
                      : r.status === "rejected"
                        ? "Recusado"
                        : r.status === "cancelled"
                          ? "Cancelado"
                          : "Decidido"}{" "}
                    por <b>{r.decidedByEmail ?? "—"}</b> · {timeAgo(r.decidedAt)}
                  </span>
                )}
              </div>
              {r.status === "rejected" && r.decisionReason && (
                <div
                  style={{
                    border: "1px solid var(--v2-line)",
                    borderRadius: 7,
                    padding: "9px 12px",
                    fontSize: 12.5,
                  }}
                >
                  <span className="cfx-lbl" style={{ display: "block", marginBottom: 3 }}>
                    Motivo da recusa
                  </span>
                  {r.decisionReason}
                </div>
              )}
              {r.status === "failed" && r.error && (
                <Note color="var(--v2-high)" icon={Info}>
                  {r.error}
                </Note>
              )}
              {r.status === "approved" && r.restoredAt && (
                <div
                  style={{
                    border: "1px solid color-mix(in oklch, var(--v2-accent) 35%, var(--v2-line))",
                    background: "color-mix(in oklch, var(--v2-accent) 8%, transparent)",
                    borderRadius: 7,
                    padding: "8px 12px",
                    fontSize: 12.5,
                  }}
                >
                  <b style={{ color: "var(--v2-accent)" }}>Restaurado</b> por{" "}
                  {r.restoredByEmail ?? "—"} ·{" "}
                  <span title={fmtDateTime(r.restoredAt)}>{timeAgo(r.restoredAt)}</span>. O registro
                  voltou com os valores da cópia feita antes da exclusão.
                </div>
              )}
              {r.status === "approved" && !r.restoredAt && canRestore && (
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 10,
                    flexWrap: "wrap",
                    alignItems: "center",
                    borderTop: "1px dashed var(--v2-line)",
                    paddingTop: 10,
                  }}
                >
                  <span className="cfx-muted" style={{ fontSize: 11.5, flex: "1 1 260px" }}>
                    Uma cópia do registro foi guardada antes da exclusão. Restaurar confere antes
                    como ele está hoje na Cloudflare.
                  </span>
                  <button
                    className="cfx-btn sm"
                    style={{
                      color: "var(--v2-ok)",
                      borderColor: "color-mix(in oklch, var(--v2-ok) 45%, var(--v2-line))",
                    }}
                    onClick={() => setRestoring(r.id)}
                  >
                    <RotateCcw size={12} /> Restaurar registro
                  </button>
                </div>
              )}
              {r.status === "pending" && (
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                  {r.mine ? (
                    <>
                      <button
                        className="cfx-btn sm"
                        onClick={async () => {
                          const res: any = await cancel({ data: { id: r.id } });
                          if (res?.ok) toast.success("Pedido cancelado.");
                          else toast.error(res?.error ?? "Falha ao cancelar.");
                          refresh();
                        }}
                      >
                        Cancelar meu pedido
                      </button>
                      <span className="cfx-muted" style={{ fontSize: 11.5 }}>
                        {canApprove
                          ? "Você abriu este pedido: outro aprovador precisa confirmar."
                          : "Aguardando um aprovador."}
                      </span>
                    </>
                  ) : (
                    <>
                      {canApprove && (
                        <button
                          className="cfx-btn sm"
                          style={{
                            background: "var(--v2-crit)",
                            borderColor: "var(--v2-crit)",
                            color: "#fff",
                          }}
                          onClick={() => setApproving(r)}
                        >
                          Confirmar exclusão
                        </button>
                      )}
                      {canReject && (
                        <button className="cfx-btn sm" onClick={() => setRejecting(r)}>
                          Recusar
                        </button>
                      )}
                      {!canApprove && !canReject && (
                        <span className="cfx-muted" style={{ fontSize: 11.5 }}>
                          Aguardando um aprovador.
                        </span>
                      )}
                    </>
                  )}
                </div>
              )}
            </article>
          ))
        )}
        <RequestRestoreDialog requestId={restoring} onClose={() => setRestoring(null)} />
        <span className="cfx-muted" style={{ fontSize: 11 }}>
          A lixeira em Ações › Registros DNS cria o pedido; o registro só sai da Cloudflare quando
          outra pessoa confirmar aqui. Todo pedido e toda decisão geram alerta e entram no
          Histórico.
        </span>
      </Block>
      <ApproveDialog request={approving} onClose={() => setApproving(null)} onDone={refresh} />
      <RejectDialog request={rejecting} onClose={() => setRejecting(null)} onDone={refresh} />
    </div>
  );
}

function ApproveDialog({
  request: r,
  onClose,
  onDone,
}: {
  request: DeleteRequest | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [typed, setTyped] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const approve = useServerFn(approveDeleteRequest);
  React.useEffect(() => setTyped(""), [r?.id]);
  const match = !!r && typed.trim().toLowerCase() === r.record.name.toLowerCase();
  return (
    <AlertDialog open={!!r} onOpenChange={(o) => !o && !busy && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Confirmar exclusão na Cloudflare?</AlertDialogTitle>
          <AlertDialogDescription asChild>
            {r ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
                <div
                  style={{
                    fontFamily: "var(--font-data)",
                    fontSize: 12.5,
                    wordBreak: "break-all",
                  }}
                >
                  <div>
                    Registro:{" "}
                    <strong>
                      {r.record.type} {r.record.name}
                    </strong>
                  </div>
                  <div>
                    Conteúdo: <strong>{r.record.content}</strong>
                  </div>
                  <div>
                    Pedido por: <strong>{r.requestedByEmail ?? "—"}</strong>
                  </div>
                </div>
                <div
                  style={{
                    border: "1px solid var(--v2-line)",
                    borderRadius: 7,
                    padding: "8px 10px",
                  }}
                >
                  <b>Justificativa:</b> {r.justification}
                </div>
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid color-mix(in oklch, var(--v2-crit) 35%, transparent)",
                    background: "color-mix(in oklch, var(--v2-crit) 12%, transparent)",
                    color: "var(--v2-fg)",
                  }}
                >
                  <b style={{ color: "var(--v2-crit)" }}>Apaga o registro na Cloudflare.</b> Antes,
                  o servidor confere que o registro não mudou desde o pedido e guarda uma cópia (dá
                  para restaurar pelo próprio pedido ou em Ações › Backups de DNS).
                </div>
                <label
                  style={{ display: "flex", flexDirection: "column", gap: 5 }}
                  htmlFor="confirm-name"
                >
                  <span style={{ color: "var(--v2-fg)" }}>
                    Digite{" "}
                    <b style={{ fontFamily: "var(--font-data)" }}>{r.record.name}</b> para
                    confirmar
                  </span>
                  <Input
                    id="confirm-name"
                    autoComplete="off"
                    value={typed}
                    onChange={(e) => setTyped(e.target.value)}
                  />
                </label>
              </div>
            ) : (
              <div />
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={!match || busy}
            style={{ background: "var(--v2-crit)" }}
            onClick={async (e) => {
              e.preventDefault();
              if (!r) return;
              setBusy(true);
              try {
                const res: any = await approve({ data: { id: r.id, confirmName: typed.trim() } });
                if (res?.ok) {
                  toast.success(
                    "Registro excluído na Cloudflare. Cópia guardada, alerta enviado e linha no Histórico.",
                  );
                  onClose();
                } else toast.error(res?.error ?? "Falha ao excluir.");
              } catch (err: any) {
                toast.error(err?.message ?? "Falha ao excluir.");
              } finally {
                setBusy(false);
                onDone();
              }
            }}
          >
            {busy ? "Excluindo…" : "Excluir na Cloudflare"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RejectDialog({
  request: r,
  onClose,
  onDone,
}: {
  request: DeleteRequest | null;
  onClose: () => void;
  onDone: () => void;
}) {
  const [reason, setReason] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const reject = useServerFn(rejectDeleteRequest);
  React.useEffect(() => setReason(""), [r?.id]);
  const ok = reason.trim().length >= 10;
  return (
    <AlertDialog open={!!r} onOpenChange={(o) => !o && !busy && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Recusar solicitação</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, fontSize: 13 }}>
              <span>
                O registro <b>{r?.record.name}</b> continua na Cloudflare e o motivo fica registrado
                no pedido e no alerta.
              </span>
              <label
                style={{ display: "flex", flexDirection: "column", gap: 5 }}
                htmlFor="reject-reason"
              >
                <span style={{ color: "var(--v2-fg)" }}>Motivo da recusa (obrigatório)</span>
                <Textarea
                  id="reject-reason"
                  rows={3}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="Ex.: ainda é usado pela equipe X."
                />
                {!ok && (
                  <span style={{ fontSize: 11, color: "var(--v2-fg-3)" }}>
                    Mínimo de 10 caracteres
                  </span>
                )}
              </label>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={!ok || busy}
            onClick={async (e) => {
              e.preventDefault();
              if (!r) return;
              setBusy(true);
              try {
                const res: any = await reject({ data: { id: r.id, reason: reason.trim() } });
                if (res?.ok) {
                  toast.success("Solicitação recusada.");
                  onClose();
                } else toast.error(res?.error ?? "Falha ao recusar.");
              } catch (err: any) {
                toast.error(err?.message ?? "Falha ao recusar.");
              } finally {
                setBusy(false);
                onDone();
              }
            }}
          >
            {busy ? "Salvando…" : "Recusar"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
