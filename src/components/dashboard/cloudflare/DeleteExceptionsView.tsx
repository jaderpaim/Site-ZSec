import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Check, Info, Loader2, Plus, ShieldAlert, Zap } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  getDeleteExceptionOptions,
  grantDeleteException,
  listDeleteExceptions,
  revokeDeleteException,
  type DeleteException,
} from "@/lib/cloudflare.guard.functions";
import { Badge, Block, Empty, Note, SkelRows } from "./cf-ui";
import { fmtDateTime } from "./change-utils";

// Aba Solicitações › Exceções de aprovação. Admin/super admin com
// manage_liberar_excecao_dns libera, para OUTRO usuário, uma janela em que as
// exclusões de DNS dele nas zonas escolhidas acontecem na hora (sem pedido),
// com prazo (até 24 h) e limite (até 200). Chamado/GMUD é opcional.

const HOURS = [1, 2, 4, 8, 24] as const;
const MIN_JUSTIFICATION = 20;
const PURPLE = "var(--v2-cat-exec)";

// Lista de usuários (linha com inicial + check) e zonas em pílulas clicáveis.
// flex-shrink:0 nas linhas: sem isso a lista de altura fixa espremia os itens
// e os e-mails ficavam sobrepostos.
const EXC_CSS = `
  .exc-opt { flex:none; display:flex; align-items:center; gap:8px; width:100%; text-align:left; padding:6px 8px; border-radius:6px; border:0; cursor:pointer; font-size:12.5px; line-height:1.3; background:transparent; color:var(--v2-fg); font-family:inherit; }
  .exc-opt:hover { background:var(--v2-hover); }
  .exc-opt[data-on] { background:color-mix(in oklch, var(--v2-cat-exec) 12%, transparent); color:var(--v2-cat-exec); font-weight:600; }
  .exc-opt-txt { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .exc-av { flex:none; width:22px; height:22px; border-radius:99px; display:inline-flex; align-items:center; justify-content:center; font-size:10.5px; font-weight:700; background:color-mix(in oklch, var(--v2-cat-exec) 14%, transparent); color:var(--v2-cat-exec); }
  .exc-zones { height:150px; overflow-y:auto; border:1px solid var(--v2-line); border-radius:8px; padding:8px; display:flex; flex-wrap:wrap; align-content:flex-start; gap:6px; }
  .exc-zone { flex:none; display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:99px; border:1px solid var(--v2-line); background:transparent; color:var(--v2-fg-2); font-family:var(--font-data); font-size:11.5px; line-height:1.4; cursor:pointer; transition:all .12s; }
  .exc-zone:hover { border-color:color-mix(in oklch, var(--v2-cat-exec) 45%, transparent); color:var(--v2-fg); }
  .exc-zone[data-on] { background:color-mix(in oklch, var(--v2-cat-exec) 12%, transparent); border-color:color-mix(in oklch, var(--v2-cat-exec) 55%, transparent); color:var(--v2-cat-exec); font-weight:600; }
`;

const CLOSE_LABEL: Record<NonNullable<DeleteException["closeReason"]>, string> = {
  expired: "Expirada",
  limit: "Limite atingido",
  revoked: "Encerrada",
};

function hhmm(iso: string) {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  return d.toLocaleString("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    ...(sameDay ? {} : { day: "2-digit", month: "2-digit" }),
  });
}

function UsageBar({ used, max }: { used: number; max: number }) {
  const pct = Math.min(100, Math.round((used / Math.max(1, max)) * 100));
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          width: 70,
          height: 6,
          borderRadius: 99,
          background: "color-mix(in oklch, var(--v2-cat-exec) 16%, transparent)",
          overflow: "hidden",
        }}
      >
        <i style={{ display: "block", height: "100%", width: `${pct}%`, background: PURPLE }} />
      </div>
      <span style={{ fontFamily: "var(--font-data)", fontSize: 12 }}>
        {used}/{max}
      </span>
    </div>
  );
}

export function DeleteExceptionsView() {
  const fetchList = useServerFn(listDeleteExceptions);
  const revoke = useServerFn(revokeDeleteException);
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: ["cf-dns-exceptions"],
    queryFn: () => fetchList(),
    refetchInterval: 60_000,
  });
  const list: DeleteException[] = (data as DeleteException[] | undefined) ?? [];
  const [grantOpen, setGrantOpen] = React.useState(false);
  const [revoking, setRevoking] = React.useState<DeleteException | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [expanded, setExpanded] = React.useState<string | null>(null);
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["cf-dns-exceptions"] });
    qc.invalidateQueries({ queryKey: ["cf-dns-exception"] });
    qc.invalidateQueries({ queryKey: ["cloudflare-zone-changes"] });
  };

  return (
    <div className="cfx-col">
      <Block
        title="Janelas de exceção"
        icon={Zap}
        extra={
          <button
            className="cfx-btn sm"
            data-cf-tour="dns-exception"
            style={{ background: PURPLE, borderColor: PURPLE, color: "#fff" }}
            onClick={() => setGrantOpen(true)}
          >
            <Zap size={12} /> Liberar exceção
          </button>
        }
      >
        <Note color={PURPLE} icon={Info}>
          Para demandas urgentes: durante a janela, as exclusões do usuário nas zonas liberadas
          acontecem na hora, sem pedido. Cada uma guarda cópia, entra no Histórico como{" "}
          <b>"por exceção"</b> e avisa no Teams e no e-mail. A janela fecha sozinha no prazo ou no
          limite.
        </Note>
        {isLoading ? (
          <div className="cfx-tbl-wrap">
            <table className="cfx-tbl">
              <tbody>
                <SkelRows rows={3} cols={6} />
              </tbody>
            </table>
          </div>
        ) : error ? (
          <Empty>{(error as Error).message}</Empty>
        ) : list.length === 0 ? (
          <Empty>Nenhuma janela de exceção liberada ainda.</Empty>
        ) : (
          <div className="cfx-tbl-wrap">
            <table className="cfx-tbl">
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>Zonas</th>
                  <th>Situação</th>
                  <th>Uso</th>
                  <th>Liberado por</th>
                  <th>Motivo</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {list.map((x) => (
                  <React.Fragment key={x.id}>
                    <tr>
                      <td>{x.userEmail ?? "—"}</td>
                      <td style={{ fontFamily: "var(--font-data)", fontSize: 12 }}>
                        {x.zoneNames.join(", ")}
                      </td>
                      <td>
                        {x.active ? (
                          <Badge label={`Ativa até ${hhmm(x.expiresAt)}`} color={PURPLE} />
                        ) : (
                          <span title={x.closedAt ? fmtDateTime(x.closedAt) : undefined}>
                            <Badge
                              label={`${CLOSE_LABEL[x.closeReason ?? "expired"]} · ${hhmm(x.closedAt ?? x.expiresAt)}`}
                              color="var(--v2-fg-3)"
                            />
                          </span>
                        )}
                      </td>
                      <td>
                        <UsageBar used={x.used} max={x.maxDeletes} />
                      </td>
                      <td>{x.grantedByEmail ?? "—"}</td>
                      <td
                        title={x.justification}
                        style={{
                          maxWidth: 240,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {x.ticket ? `${x.ticket} · ` : ""}
                        {x.justification}
                      </td>
                      <td style={{ whiteSpace: "nowrap", textAlign: "right" }}>
                        <span style={{ display: "inline-flex", gap: 8, alignItems: "center" }}>
                          {x.deletions.length > 0 && (
                            <button
                              className="dnsx-edit"
                              style={{ background: "none", border: 0, cursor: "pointer" }}
                              onClick={() => setExpanded(expanded === x.id ? null : x.id)}
                            >
                              {expanded === x.id ? "Ocultar" : "Ver o que foi apagado"}
                            </button>
                          )}
                          {x.active && (
                            <button className="cfx-btn sm" onClick={() => setRevoking(x)}>
                              Encerrar agora
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                    {expanded === x.id && (
                      <tr>
                        <td colSpan={7} style={{ background: "var(--v2-surface-2)" }}>
                          <ul
                            style={{
                              margin: 0,
                              paddingLeft: 18,
                              fontFamily: "var(--font-data)",
                              fontSize: 12,
                              display: "flex",
                              flexDirection: "column",
                              gap: 3,
                            }}
                          >
                            {x.deletions.map((d, i) => (
                              <li key={i}>
                                {d.type} {d.name} → {d.content}
                                <span style={{ color: "var(--v2-fg-3)" }}>
                                  {" "}
                                  · {d.zoneName ?? ""} · {d.at ? fmtDateTime(d.at) : ""}
                                </span>
                              </li>
                            ))}
                          </ul>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Block>

      <GrantDialog open={grantOpen} onOpenChange={setGrantOpen} onDone={refresh} />

      <AlertDialog open={!!revoking} onOpenChange={(o) => !o && !busy && setRevoking(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar a janela agora?</AlertDialogTitle>
            <AlertDialogDescription>
              {revoking?.userEmail} volta a precisar de aprovação para excluir. O resumo com o que
              foi apagado ({revoking?.used} de {revoking?.maxDeletes}) vai para o Teams e o e-mail.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={async (e) => {
                e.preventDefault();
                if (!revoking) return;
                setBusy(true);
                try {
                  const res: any = await revoke({ data: { id: revoking.id } });
                  if (res?.ok) {
                    toast.success("Janela encerrada.");
                    setRevoking(null);
                  } else toast.error(res?.error ?? "Falha ao encerrar.");
                } catch (err: any) {
                  toast.error(err?.message ?? "Falha ao encerrar.");
                } finally {
                  setBusy(false);
                  refresh();
                }
              }}
            >
              {busy ? "Encerrando…" : "Encerrar agora"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function GrantDialog({
  open,
  onOpenChange,
  onDone,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onDone: () => void;
}) {
  const fetchOpts = useServerFn(getDeleteExceptionOptions);
  const grant = useServerFn(grantDeleteException);
  const opts = useQuery({
    queryKey: ["cf-dns-exception-options"],
    queryFn: () => fetchOpts(),
    enabled: open,
    staleTime: 60_000,
  });
  const users = opts.data?.users ?? [];
  const zones = opts.data?.zones ?? [];
  const [userId, setUserId] = React.useState("");
  const [userQ, setUserQ] = React.useState("");
  const [zoneIds, setZoneIds] = React.useState<string[]>([]);
  const [zoneQ, setZoneQ] = React.useState("");
  const [hours, setHours] = React.useState<(typeof HOURS)[number]>(4);
  const [max, setMax] = React.useState("50");
  const [ticket, setTicket] = React.useState("");
  const [why, setWhy] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setUserId("");
    setUserQ("");
    setZoneIds([]);
    setZoneQ("");
    setHours(4);
    setMax("50");
    setTicket("");
    setWhy("");
  }, [open]);

  const maxN = Number(max);
  const maxOk = Number.isInteger(maxN) && maxN >= 1 && maxN <= 200;
  const whyLen = why.trim().length;
  const ok = !!userId && zoneIds.length > 0 && maxOk && whyLen >= MIN_JUSTIFICATION;
  const user = users.find((u) => u.id === userId);
  const shownUsers = users
    .filter((u) => !userQ.trim() || u.email.toLowerCase().includes(userQ.trim().toLowerCase()))
    .slice(0, 50);
  const shownZones = zones.filter(
    (z) => !zoneQ.trim() || z.name.toLowerCase().includes(zoneQ.trim().toLowerCase()),
  );
  const zoneNames = zones.filter((z) => zoneIds.includes(z.id)).map((z) => z.name);

  async function submit() {
    setSaving(true);
    try {
      const res: any = await grant({
        data: {
          userId,
          zoneIds,
          hours,
          maxDeletes: maxN,
          ticket: ticket.trim() || null,
          justification: why.trim(),
        },
      });
      if (res?.ok) {
        toast.success("Exceção liberada. Os admins foram avisados no Teams e no e-mail.");
        onOpenChange(false);
      } else toast.error(res?.error ?? "Falha ao liberar.");
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao liberar.");
    } finally {
      setSaving(false);
      onDone();
    }
  }

  const lbl: React.CSSProperties = { fontSize: 12, fontWeight: 600, color: "var(--v2-fg)" };
  const hint: React.CSSProperties = { fontSize: 11, color: "var(--v2-fg-3)" };
  const listBox: React.CSSProperties = {
    height: 150,
    overflowY: "auto",
    border: "1px solid var(--v2-line)",
    borderRadius: 8,
    padding: 4,
    display: "flex",
    flexDirection: "column",
    gap: 2,
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !saving && onOpenChange(o)}>
      <DialogContent className="max-w-2xl min-w-0" style={{ width: "min(672px, calc(100vw - 32px))" }}>
        <style>{EXC_CSS}</style>
        <DialogHeader>
          <DialogTitle style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <ShieldAlert size={16} color="var(--v2-cat-exec)" /> Liberar exceção de aprovação
          </DialogTitle>
        </DialogHeader>
        {opts.isLoading ? (
          <div style={{ padding: 20, display: "flex", gap: 8, alignItems: "center", fontSize: 13 }}>
            <Loader2 size={14} className="animate-spin" /> Carregando usuários e zonas…
          </div>
        ) : opts.error ? (
          <Empty>{(opts.error as Error).message}</Empty>
        ) : (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
              gap: 14,
              minWidth: 0,
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
              <span style={lbl}>Usuário</span>
              <Input
                placeholder="Filtrar por e-mail…"
                value={userQ}
                onChange={(e) => setUserQ(e.target.value)}
              />
              <div style={listBox} role="listbox" aria-label="Usuário">
                {shownUsers.length === 0 ? (
                  <span style={{ ...hint, padding: 6 }}>Nenhum usuário.</span>
                ) : (
                  shownUsers.map((u) => {
                    const on = u.id === userId;
                    return (
                      <button
                        key={u.id}
                        type="button"
                        role="option"
                        aria-selected={on}
                        onClick={() => setUserId(u.id)}
                        className="exc-opt"
                        data-on={on || undefined}
                      >
                        <span className="exc-av" aria-hidden="true">
                          {u.email.slice(0, 1).toUpperCase()}
                        </span>
                        <span className="exc-opt-txt">{u.email}</span>
                        {on && <Check size={13} style={{ flex: "none" }} />}
                      </button>
                    );
                  })
                )}
              </div>
              <span style={hint}>
                Quem tem "Solicitar exclusão de DNS". Não pode ser você mesmo.
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}>
              <span style={lbl}>Zonas</span>
              <Input
                placeholder="Filtrar zona…"
                value={zoneQ}
                onChange={(e) => setZoneQ(e.target.value)}
              />
              <div className="exc-zones" role="group" aria-label="Zonas">
                {shownZones.length === 0 ? (
                  <span style={{ ...hint, padding: 6 }}>Nenhuma zona.</span>
                ) : (
                  shownZones.map((z) => {
                    const on = zoneIds.includes(z.id);
                    return (
                      <button
                        key={z.id}
                        type="button"
                        aria-pressed={on}
                        className="exc-zone"
                        data-on={on || undefined}
                        onClick={() =>
                          setZoneIds((prev) =>
                            on ? prev.filter((id) => id !== z.id) : [...prev, z.id],
                          )
                        }
                      >
                        {on ? <Check size={12} /> : <Plus size={12} />}
                        {z.name}
                      </button>
                    );
                  })
                )}
              </div>
              <span style={{ ...hint, display: "flex", gap: 8, alignItems: "center" }}>
                {zoneIds.length ? (
                  <>
                    {zoneIds.length} selecionada(s).
                    <button
                      type="button"
                      onClick={() => setZoneIds([])}
                      style={{
                        background: "none",
                        border: 0,
                        padding: 0,
                        cursor: "pointer",
                        color: "var(--v2-cat-exec)",
                        fontSize: 11,
                      }}
                    >
                      Limpar
                    </button>
                  </>
                ) : (
                  "Clique para escolher uma ou mais."
                )}
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={lbl}>Duração</span>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {HOURS.map((h) => (
                  <button
                    key={h}
                    type="button"
                    className={`cfx-day${hours === h ? " on" : ""}`}
                    onClick={() => setHours(h)}
                  >
                    {h} h
                  </button>
                ))}
              </div>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={lbl}>Limite de exclusões</span>
              <Input
                type="number"
                min={1}
                max={200}
                value={max}
                onChange={(e) => setMax(e.target.value)}
                style={!maxOk ? { borderColor: "var(--v2-crit)" } : undefined}
              />
              <span style={{ ...hint, color: maxOk ? hint.color : "var(--v2-crit)" }}>
                Entre 1 e 200. Acabou o limite, a janela fecha.
              </span>
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: "1 / -1" }}>
              <span style={lbl}>
                Chamado ou GMUD <span style={{ fontWeight: 400, color: "var(--v2-fg-3)" }}>(opcional)</span>
              </span>
              <Input
                placeholder="Ex.: GMUD 4821"
                maxLength={120}
                value={ticket}
                onChange={(e) => setTicket(e.target.value)}
              />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: 6, gridColumn: "1 / -1" }}>
              <span style={lbl}>Justificativa</span>
              <Textarea
                rows={3}
                value={why}
                onChange={(e) => setWhy(e.target.value)}
                placeholder="Por que esta pessoa precisa excluir sem aprovação agora?"
              />
              <span style={hint}>
                {whyLen >= MIN_JUSTIFICATION
                  ? `${whyLen} caracteres`
                  : `Mínimo de ${MIN_JUSTIFICATION} caracteres (${whyLen}/${MIN_JUSTIFICATION})`}
              </span>
            </div>

            {user && zoneIds.length > 0 && (
              <div style={{ gridColumn: "1 / -1" }}>
                <Note color={PURPLE} icon={Info}>
                  Durante {hours} h, as exclusões de <b>{user.email}</b> em{" "}
                  <b style={{ fontFamily: "var(--font-data)" }}>{zoneNames.join(", ")}</b>{" "}
                  acontecem na hora, sem pedido, até {maxOk ? maxN : "?"}. Cada uma guarda cópia,
                  entra no Histórico como "por exceção" e avisa no Teams e no e-mail.
                </Note>
              </div>
            )}
          </div>
        )}
        <DialogFooter>
          <button className="cfx-btn" disabled={saving} onClick={() => onOpenChange(false)}>
            Cancelar
          </button>
          <button
            className="cfx-btn"
            disabled={!ok || saving}
            onClick={() => void submit()}
            style={{ background: PURPLE, borderColor: PURPLE, color: "#fff", opacity: !ok ? 0.55 : 1 }}
          >
            {saving ? "Liberando…" : `Liberar por ${hours} h`}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
