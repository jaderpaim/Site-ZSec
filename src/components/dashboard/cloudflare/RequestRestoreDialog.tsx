import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Check, Loader2, RotateCcw } from "lucide-react";
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
import { usePermissions } from "@/lib/use-permissions";
import {
  getRequestRestoreInfo,
  restoreDeletedRequest,
  type RequestRestoreInfo,
} from "@/lib/cloudflare.guard.functions";

// Restaurar um registro excluído (pedido aprovado ou por exceção) a partir da
// cópia feita antes da exclusão. Usado no cartão do pedido (Solicitações) e na
// linha da exclusão no Histórico. A checagem vem do servidor: se o registro
// foi recriado com outro valor, restaurar SUBSTITUI (não cria um segundo).

// Mesma regra do servidor (restoreDeletedRequest): permissão de Backups de DNS
// + perfil admin/super admin.
export function useCanRestoreDns() {
  const { can, isAdmin } = usePermissions();
  return isAdmin && can("cloudflare-waf", "manage_backups_dns");
}

const recText = (r: { content: string; proxied: boolean | null; ttl: number | null } | null) =>
  r
    ? `${r.content}${r.proxied ? " · proxied" : ""}${r.ttl && r.ttl !== 1 ? ` · TTL ${r.ttl}` : ""}`
    : "—";

function Line({ tone, children }: { tone: "ok" | "warn" | "muted"; children: React.ReactNode }) {
  const color =
    tone === "ok" ? "var(--v2-ok)" : tone === "warn" ? "var(--v2-high)" : "var(--v2-fg-3)";
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", fontSize: 12.5 }}>
      <span style={{ color, flex: "none", marginTop: 2 }}>
        {tone === "warn" ? <AlertTriangle size={13} /> : <Check size={13} />}
      </span>
      <span style={{ minWidth: 0, wordBreak: "break-word" }}>{children}</span>
    </div>
  );
}

export function RequestRestoreDialog({
  requestId,
  onClose,
}: {
  requestId: string | null;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const fetchInfo = useServerFn(getRequestRestoreInfo);
  const restore = useServerFn(restoreDeletedRequest);
  const [busy, setBusy] = React.useState(false);
  const q = useQuery({
    queryKey: ["cf-dns-request-restore", requestId],
    queryFn: () => fetchInfo({ data: { requestId: requestId! } }),
    enabled: !!requestId,
    staleTime: 0,
  });
  const info = q.data as RequestRestoreInfo | undefined;
  const ok = info && info.ok ? info : null;
  const canRun =
    !!ok && !ok.restoredAt && ["gone", "changed", "recreated"].includes(ok.state);
  const title = ok ? `Restaurar ${ok.record.type} ${ok.record.name}?` : "Restaurar registro";

  return (
    <AlertDialog open={!!requestId} onOpenChange={(o) => !o && !busy && onClose()}>
      <AlertDialogContent className="min-w-0 overflow-hidden">
        <AlertDialogHeader>
          <AlertDialogTitle style={{ wordBreak: "break-all" }}>{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {q.isLoading ? (
                <span style={{ display: "inline-flex", gap: 6, alignItems: "center" }}>
                  <Loader2 size={13} className="animate-spin" /> Conferindo o registro na
                  Cloudflare…
                </span>
              ) : info && !info.ok ? (
                <span style={{ color: "var(--v2-crit)" }}>{info.error}</span>
              ) : ok ? (
                <>
                  {ok.state !== "no_copy" && ok.takenAt && (
                    <span>
                      Volta com os valores da cópia feita antes da exclusão (
                      {new Date(ok.takenAt).toLocaleString("pt-BR")}):{" "}
                      <span className="cfx-mono" style={{ wordBreak: "break-all" }}>
                        {recText(ok.record)}
                      </span>
                      .
                    </span>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    {ok.restoredAt && (
                      <Line tone="muted">
                        Já restaurado por {ok.restoredByEmail ?? "—"} em{" "}
                        {new Date(ok.restoredAt).toLocaleString("pt-BR")}.
                      </Line>
                    )}
                    {ok.state === "no_copy" && (
                      <Line tone="warn">
                        Não achei a cópia feita antes desta exclusão. Use Ações › Backups de DNS e
                        escolha o backup diário anterior.
                      </Line>
                    )}
                    {ok.state === "same" && (
                      <Line tone="ok">
                        O registro já está na Cloudflare igual à cópia. Nada a restaurar.
                      </Line>
                    )}
                    {ok.state === "gone" && (
                      <Line tone="ok">O registro não existe hoje na Cloudflare. Vai ser recriado.</Line>
                    )}
                    {(ok.state === "changed" || ok.state === "recreated") && (
                      <Line tone="warn">
                        {ok.state === "recreated" ? "Alguém criou de novo" : "Existe hoje"}{" "}
                        <span className="cfx-mono">
                          {ok.record.type} {ok.record.name}
                        </span>{" "}
                        com outro valor (
                        <span className="cfx-mono" style={{ wordBreak: "break-all" }}>
                          {recText(ok.now)}
                        </span>
                        ). Restaurar <b>substitui</b> esse valor; não cria um segundo registro.
                      </Line>
                    )}
                    {ok.state === "ambiguous" && (
                      <Line tone="warn">
                        Há mais de um registro com esse tipo e nome criado depois da exclusão. A
                        restauração não escolhe sozinha: confira no painel da Cloudflare qual deve
                        ficar.
                      </Line>
                    )}
                    {canRun && (
                      <>
                        <Line tone="ok">
                          Antes, o estado atual da zona é guardado numa cópia própria.
                        </Line>
                        <Line tone="ok">
                          Gera alerta e entra no Histórico como "Restaurou registros DNS".
                        </Line>
                      </>
                    )}
                    {ok.linked === "time" && (
                      <Line tone="muted">
                        Exclusão antiga: a cópia foi localizada pela zona, pelo registro e pelo
                        horário.
                      </Line>
                    )}
                  </div>
                </>
              ) : null}
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>{canRun ? "Cancelar" : "Fechar"}</AlertDialogCancel>
          {canRun && (
            <AlertDialogAction
              disabled={busy}
              onClick={async (e) => {
                e.preventDefault();
                if (!requestId) return;
                setBusy(true);
                try {
                  const res: any = await restore({ data: { requestId } });
                  if (res?.ok && res.restored > 0 && !res.failed?.length)
                    toast.success("Registro restaurado.");
                  else if (res?.ok && res.failed?.length) toast.error(res.failed[0]);
                  else if (res?.ok) toast.info("Nada a restaurar: o registro já está igual.");
                  else toast.error(res?.error ?? "Falha ao restaurar.");
                  if (res?.ok) {
                    qc.invalidateQueries({ queryKey: ["cf-dns-delete-requests"] });
                    qc.invalidateQueries({ queryKey: ["cf-dns-request-restore"] });
                    qc.invalidateQueries({ queryKey: ["cloudflare-zone-changes"] });
                    qc.invalidateQueries({ queryKey: ["cf-dns-snapshots"] });
                    qc.invalidateQueries({ queryKey: ["cf-dns-snapshot-diff"] });
                    onClose();
                  }
                } catch (err: any) {
                  toast.error(err?.message ?? "Falha ao restaurar.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              <RotateCcw size={13} style={{ marginRight: 6 }} />
              {busy ? "Restaurando…" : "Restaurar"}
            </AlertDialogAction>
          )}
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
