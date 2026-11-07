import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
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
import { Textarea } from "@/components/ui/textarea";
import { usePermissions } from "@/lib/use-permissions";
import {
  createDeleteRequest,
  deleteWithException,
  getMyDeleteException,
  listDeleteRequests,
  type DeleteException,
} from "@/lib/cloudflare.guard.functions";

// Lixeira da tela Registros DNS: NÃO apaga na Cloudflare — abre um pedido de
// exclusão com justificativa, que outra pessoa confirma na aba Solicitações.
// Exceção: com janela de exceção ativa (liberada por admin) pra zona do
// registro, a lixeira fica roxa e apaga na hora (cópia + Histórico + alerta).
// A janela do pedido fica na tela (não na linha) pra sobreviver à troca de
// zona do topo quando o registro é de outra zona (busca em todas as zonas).

const MIN_JUSTIFICATION = 20;

export type DeleteTargetRecord = {
  id: string;
  type: string;
  name: string;
  content: string;
  proxied: boolean | null;
};
export type DeleteTarget = { zoneId: string; zoneName: string; record: DeleteTargetRecord };

export function useMyDeleteException(enabled: boolean) {
  const fetchMine = useServerFn(getMyDeleteException);
  const q = useQuery({
    queryKey: ["cf-dns-exception", "mine"],
    queryFn: () => fetchMine(),
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
  const ex = (q.data as DeleteException | null | undefined) ?? null;
  // Venceu enquanto a tela estava aberta: some sem esperar o próximo refetch.
  const [, tick] = React.useReducer((n: number) => n + 1, 0);
  React.useEffect(() => {
    if (!ex) return;
    const ms = new Date(ex.expiresAt).getTime() - Date.now();
    if (ms <= 0) return;
    const t = setTimeout(tick, Math.min(ms + 500, 2_147_000_000));
    return () => clearTimeout(t);
  }, [ex]);
  if (!ex || new Date(ex.expiresAt).getTime() <= Date.now() || ex.used >= ex.maxDeletes)
    return null;
  return ex;
}

export function useDnsDeleteRequests(zoneId: string | null) {
  const { can } = usePermissions();
  const canRequest = can("cloudflare-waf", "manage_solicitar_exclusao_dns");
  const fetchList = useServerFn(listDeleteRequests);
  const list = useQuery({
    queryKey: ["cf-dns-delete-requests", zoneId, "pending"],
    queryFn: () => fetchList({ data: { zoneId: zoneId!, status: "pending" } }),
    enabled: !!zoneId && canRequest,
  });
  const exception = useMyDeleteException(canRequest);
  const pendingIds = React.useMemo(
    () => new Set(((list.data as any)?.requests ?? []).map((r: any) => r.recordId as string)),
    [list.data],
  );
  // loaded: lista de pendentes da zona atual já respondeu (após trocar de zona).
  // Com erro também libera: o servidor barra pedido duplicado de qualquer forma.
  return {
    canRequest,
    pendingIds,
    exception,
    // A janela vale pra esta zona?
    exceptionFor: (zid: string | null | undefined) =>
      !!exception && !!zid && exception.zoneIds.includes(zid),
    loaded: (list.isSuccess || list.isError) && !list.isFetching,
  };
}

export function DeleteRequestButton({
  pending,
  onClick,
  tourTarget = false,
  title,
  disabled = false,
  exception = false,
}: {
  pending: boolean;
  onClick: () => void;
  disabled?: boolean;
  // Marca este botão como alvo do tour de novidades (só o primeiro da lista).
  tourTarget?: boolean;
  title?: string;
  // Janela de exceção ativa pra zona: apaga na hora (lixeira roxa).
  exception?: boolean;
}) {
  // Com exceção, um pedido pendente não bloqueia: a exclusão direta o encerra.
  const blocked = (pending && !exception) || disabled;
  return (
    <button
      className="ops-btn ghost sm"
      data-cf-tour={tourTarget ? "dns-delete" : undefined}
      onClick={onClick}
      disabled={blocked}
      title={
        exception
          ? "Excluir agora (exceção de aprovação ativa)"
          : pending
            ? "Já existe uma solicitação de exclusão pendente"
            : (title ?? "Solicitar exclusão")
      }
      aria-label={exception ? "Excluir agora" : "Solicitar exclusão"}
      style={{
        color: exception ? "var(--v2-cat-exec)" : pending ? undefined : "var(--v2-crit)",
      }}
    >
      <Trash2 size={13} />
    </button>
  );
}

// Faixa roxa no topo de Registros DNS enquanto a janela está ativa.
export function DeleteExceptionBanner({ exception: ex }: { exception: DeleteException | null }) {
  if (!ex) return null;
  const pct = Math.min(100, Math.round((ex.used / Math.max(1, ex.maxDeletes)) * 100));
  const until = new Date(ex.expiresAt).toLocaleString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    ...(new Date(ex.expiresAt).toDateString() !== new Date().toDateString()
      ? { day: "2-digit", month: "2-digit" }
      : {}),
  });
  return (
    <div
      role="status"
      style={{
        display: "flex",
        alignItems: "center",
        gap: 12,
        flexWrap: "wrap",
        padding: "10px 14px",
        borderRadius: 9,
        border: "1px solid color-mix(in oklch, var(--v2-cat-exec) 40%, transparent)",
        background: "color-mix(in oklch, var(--v2-cat-exec) 12%, transparent)",
        color: "var(--v2-fg)",
        fontSize: 12.5,
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: 8,
          height: 8,
          borderRadius: 99,
          background: "var(--v2-cat-exec)",
          flex: "none",
        }}
      />
      <div style={{ flex: 1, minWidth: 220 }}>
        <b>Exceção de aprovação ativa até {until}</b> · você pode excluir registros de{" "}
        <span style={{ fontFamily: "var(--font-data)" }}>{ex.zoneNames.join(", ")}</span>{" "}
        na hora.{" "}
        <span style={{ color: "var(--v2-fg-3)" }}>
          Liberada por {ex.grantedByEmail ?? "—"}
          {ex.ticket ? ` · ${ex.ticket}` : ""}
        </span>
      </div>
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div
          style={{
            width: 90,
            height: 6,
            borderRadius: 99,
            background: "color-mix(in oklch, var(--v2-cat-exec) 18%, transparent)",
            overflow: "hidden",
          }}
        >
          <i
            style={{ display: "block", height: "100%", width: `${pct}%`, background: "var(--v2-cat-exec)" }}
          />
        </div>
        <span style={{ fontFamily: "var(--font-data)", fontSize: 12 }}>
          {ex.used} de {ex.maxDeletes} usadas
        </span>
      </div>
    </div>
  );
}

// Diálogo da lixeira: com janela de exceção pra zona → "Excluir agora";
// senão → pedido de exclusão normal.
export function DeleteRequestDialog({
  target,
  onClose,
  onDeleted,
}: {
  target: DeleteTarget | null;
  onClose: () => void;
  // Exclusão na hora (janela de exceção): tira a linha da lista.
  onDeleted?: (recordId: string) => void;
}) {
  const { can } = usePermissions();
  const ex = useMyDeleteException(can("cloudflare-waf", "manage_solicitar_exclusao_dns"));
  if (target && ex && ex.zoneIds.includes(target.zoneId))
    return (
      <DeleteNowDialog target={target} exception={ex} onClose={onClose} onDeleted={onDeleted} />
    );
  return <RequestDialog target={target} onClose={onClose} />;
}

function DeleteNowDialog({
  target,
  exception: ex,
  onClose,
  onDeleted,
}: {
  target: DeleteTarget;
  exception: DeleteException;
  onClose: () => void;
  onDeleted?: (recordId: string) => void;
}) {
  const [reason, setReason] = React.useState("");
  const [saving, setSaving] = React.useState(false);
  const del = useServerFn(deleteWithException);
  const qc = useQueryClient();
  React.useEffect(() => setReason(""), [target.record.id]);
  const record = target.record;

  async function submit() {
    setSaving(true);
    try {
      const res: any = await del({
        data: {
          zoneId: target.zoneId,
          recordId: record.id,
          reason: reason.trim() || null,
        },
      });
      if (res?.ok) {
        toast.success(
          `Registro excluído (${res.used} de ${res.max} da janela). Cópia guardada em Backups de DNS.`,
        );
        onDeleted?.(record.id);
        onClose();
      } else toast.error(res?.error ?? "Falha ao excluir.");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao excluir.");
    } finally {
      setSaving(false);
      qc.invalidateQueries({ queryKey: ["cf-dns-exception"] });
      qc.invalidateQueries({ queryKey: ["cf-dns-delete-requests"] });
      qc.invalidateQueries({ queryKey: ["cf-guard-status"] });
      qc.invalidateQueries({ queryKey: ["cloudflare-dns-search"] });
      qc.invalidateQueries({ queryKey: ["cloudflare-zone-hosts"] });
      qc.invalidateQueries({ queryKey: ["cloudflare-zone-changes"] });
    }
  }

  return (
    <AlertDialog open onOpenChange={(o) => !o && !saving && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Excluir agora (exceção de aprovação)</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13 }}>
              <div
                style={{
                  fontFamily: "var(--font-data)",
                  fontSize: 12.5,
                  wordBreak: "break-all",
                }}
              >
                <div>
                  Zona: <strong>{target.zoneName}</strong>
                </div>
                <div>
                  Registro:{" "}
                  <strong>
                    {record.type} {record.name}
                  </strong>
                </div>
                <div>
                  Conteúdo: <strong>{record.content}</strong>
                </div>
              </div>
              <label
                style={{ display: "flex", flexDirection: "column", gap: 6 }}
                htmlFor={`exc-why-${record.id}`}
              >
                <span style={{ color: "var(--v2-fg)" }}>
                  Motivo (opcional, já vale o da janela)
                </span>
                <Textarea
                  id={`exc-why-${record.id}`}
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  maxLength={1000}
                />
              </label>
              <div
                style={{
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "1px solid color-mix(in oklch, var(--v2-crit) 35%, transparent)",
                  background: "color-mix(in oklch, var(--v2-crit) 12%, transparent)",
                  color: "var(--v2-fg)",
                }}
              >
                <b style={{ color: "var(--v2-crit)" }}>Apaga na Cloudflare agora,</b> sem pedido.
                Fica uma cópia em Backups de DNS para desfazer. Esta é a exclusão{" "}
                <b>
                  {ex.used + 1} de {ex.maxDeletes}
                </b>{" "}
                da janela.
              </div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={saving}
            onClick={(e) => {
              e.preventDefault();
              void submit();
            }}
            style={{ background: "var(--v2-crit)" }}
          >
            {saving ? "Excluindo…" : "Excluir agora"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

function RequestDialog({
  target,
  onClose,
}: {
  target: DeleteTarget | null;
  onClose: () => void;
}) {
  const [why, setWhy] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const create = useServerFn(createDeleteRequest);
  const qc = useQueryClient();
  const len = why.trim().length;
  const ok = len >= MIN_JUSTIFICATION;
  React.useEffect(() => {
    setWhy("");
    setTouched(false);
  }, [target?.record.id]);
  const record = target?.record;

  async function submit() {
    if (!target) return;
    setSaving(true);
    try {
      const res: any = await create({
        data: { zoneId: target.zoneId, recordId: target.record.id, justification: why.trim() },
      });
      if (res?.ok) {
        toast.success(
          "Solicitação enviada. Ela aparece na aba Solicitações e os admins foram avisados.",
        );
        onClose();
      } else toast.error(res?.error ?? "Falha ao enviar a solicitação.");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao enviar a solicitação.");
    } finally {
      setSaving(false);
      qc.invalidateQueries({ queryKey: ["cf-dns-delete-requests"] });
      qc.invalidateQueries({ queryKey: ["cf-guard-status"] });
    }
  }

  return (
    <AlertDialog open={!!target} onOpenChange={(o) => !o && !saving && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Solicitar exclusão de registro</AlertDialogTitle>
          <AlertDialogDescription asChild>
            {record ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 12, fontSize: 13 }}>
                <div
                  style={{
                    fontFamily: "var(--font-data)",
                    fontSize: 12.5,
                    wordBreak: "break-all",
                  }}
                >
                  <div>
                    Zona: <strong>{target!.zoneName}</strong>
                  </div>
                  <div>
                    Registro:{" "}
                    <strong>
                      {record.type} {record.name}
                    </strong>
                  </div>
                  <div>
                    Conteúdo: <strong>{record.content}</strong>
                  </div>
                  <div>
                    Proxy: <strong>{record.proxied ? "Ligado" : "Desligado"}</strong>
                  </div>
                </div>
                <div
                  style={{
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid color-mix(in oklch, var(--v2-high) 35%, transparent)",
                    background: "color-mix(in oklch, var(--v2-high) 12%, transparent)",
                    color: "var(--v2-fg)",
                  }}
                >
                  <b style={{ color: "var(--v2-high)" }}>O registro não é apagado agora.</b> Vira
                  um pedido na aba Solicitações e só sai da Cloudflare quando outra pessoa
                  confirmar.
                </div>
                <label
                  style={{ display: "flex", flexDirection: "column", gap: 6 }}
                  htmlFor={`why-${record.id}`}
                >
                  <span style={{ color: "var(--v2-fg)" }}>Justificativa (obrigatória)</span>
                  <Textarea
                    id={`why-${record.id}`}
                    value={why}
                    onChange={(e) => {
                      setWhy(e.target.value);
                      setTouched(true);
                    }}
                    rows={4}
                    placeholder="Por que este registro pode ser excluído? Cite o chamado ou a GMUD, se tiver."
                    style={touched && !ok ? { borderColor: "var(--v2-crit)" } : undefined}
                  />
                  <span
                    style={{
                      fontSize: 11,
                      color: touched && !ok ? "var(--v2-crit)" : "var(--v2-fg-3)",
                    }}
                  >
                    {ok
                      ? `${len} caracteres`
                      : `Mínimo de ${MIN_JUSTIFICATION} caracteres (${len}/${MIN_JUSTIFICATION})`}
                  </span>
                </label>
              </div>
            ) : (
              <div />
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
          <AlertDialogAction
            disabled={!ok || saving}
            onClick={(e) => {
              e.preventDefault();
              void submit();
            }}
            style={{ background: "var(--v2-crit)" }}
          >
            {saving ? "Enviando…" : "Enviar solicitação"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
