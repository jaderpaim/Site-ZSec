import * as React from "react";
import { APP_NAME } from "@/lib/brand";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { AlertTriangle, Archive, Download, Info, RefreshCw } from "lucide-react";
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
  getSnapshotDiff,
  getSnapshotDownload,
  listDnsSnapshots,
  restoreDnsRecords,
  runDnsBackupNow,
  type SnapshotDiffRow,
  type SnapshotMeta,
} from "@/lib/cloudflare.guard.functions";
import { Badge, Block, Empty, Note } from "./cf-ui";

const KIND: Record<SnapshotDiffRow["kind"], { label: string; color: string; bg: string }> = {
  removed: {
    label: "Apagado",
    color: "var(--v2-crit)",
    bg: "color-mix(in oklch, var(--v2-crit) 6%, transparent)",
  },
  changed: {
    label: "Alterado",
    color: "var(--v2-high)",
    bg: "color-mix(in oklch, var(--v2-high) 7%, transparent)",
  },
  added: { label: "Novo depois", color: "var(--v2-accent)", bg: "transparent" },
};

export type BackupsFilter = "all" | "daily" | "pre_delete";
const FILTERS: { key: BackupsFilter; label: string }[] = [
  { key: "all", label: "Todos" },
  { key: "daily", label: "Diários e manuais" },
  { key: "pre_delete", label: "Antes da exclusão" },
];

const fmtShort = (iso: string) =>
  new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const recText = (
  r: { type: string; content: string; proxied: boolean | null; ttl: number | null } | null,
) =>
  r
    ? `${r.content}${r.proxied ? " · proxied" : ""}${r.ttl && r.ttl !== 1 ? ` · TTL ${r.ttl}` : ""}`
    : "—";

// Primeiro rótulo do nome (hml-portal.bernoulli.com.br → hml-portal).
const shortName = (name: string) => name.split(".")[0] || name;

const CSS = `
.bk-seg{display:inline-flex;border:1px solid var(--v2-line);border-radius:8px;overflow:hidden;flex-wrap:wrap}
.bk-seg button{font:inherit;font-size:12px;padding:5px 11px;border:0;background:transparent;color:var(--v2-fg-2);cursor:pointer;display:inline-flex;gap:6px;align-items:center}
.bk-seg button+button{border-left:1px solid var(--v2-line)}
.bk-seg button.on{background:color-mix(in oklch,var(--v2-accent) 12%,transparent);color:var(--v2-accent);font-weight:600}
.bk-seg .n{font-size:10.5px;background:var(--v2-surface-2);color:var(--v2-fg-3);padding:0 6px;border-radius:99px}
.cfx-day.bk-pd{border-style:dashed;border-color:color-mix(in oklch,var(--v2-crit) 45%,var(--v2-line))}
.cfx-day.bk-pd .r{font-family:'JetBrains Mono',ui-monospace,monospace;font-size:11px;color:var(--v2-crit)}
.cfx-day.bk-pd.on{border-style:solid;border-color:var(--v2-crit);background:color-mix(in oklch,var(--v2-crit) 9%,transparent);color:var(--v2-crit)}
.bk-ctx{border:1px solid color-mix(in oklch,var(--v2-crit) 30%,var(--v2-line));background:color-mix(in oklch,var(--v2-crit) 6%,transparent);border-radius:9px;padding:11px 13px;display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px 18px;font-size:12.5px}
.bk-ctx>div{min-width:0;word-break:break-word}
.bk-ctx .full{grid-column:1/-1}
.bk-warn{border:1px solid color-mix(in oklch,var(--v2-high) 40%,var(--v2-line));background:color-mix(in oklch,var(--v2-high) 8%,transparent);border-radius:8px;padding:9px 12px;font-size:12.5px}
.bk-sub{display:block;font-size:10.5px;color:var(--v2-fg-3);font-weight:500;margin-top:3px}
`;

export function BackupsView({
  zoneId,
  initialFilter,
}: {
  zoneId: string;
  initialFilter?: BackupsFilter;
}) {
  const { isAdmin } = usePermissions();
  const qc = useQueryClient();
  const fetchList = useServerFn(listDnsSnapshots);
  const fetchDiff = useServerFn(getSnapshotDiff);
  const download = useServerFn(getSnapshotDownload);
  const backupNow = useServerFn(runDnsBackupNow);
  const restore = useServerFn(restoreDnsRecords);
  const { data: snaps, isLoading } = useQuery({
    queryKey: ["cf-dns-snapshots", zoneId],
    queryFn: () => fetchList({ data: { zoneId } }),
  });
  const all = React.useMemo(() => (snaps ?? []) as SnapshotMeta[], [snaps]);
  const [filter, setFilter] = React.useState<BackupsFilter>(initialFilter ?? "all");
  React.useEffect(() => {
    if (initialFilter) setFilter(initialFilter);
  }, [initialFilter]);
  const counts = {
    all: all.length,
    daily: all.filter((s) => s.kind !== "pre_delete").length,
    pre_delete: all.filter((s) => s.kind === "pre_delete").length,
  };
  const list = React.useMemo(
    () =>
      all.filter(
        (s) =>
          filter === "all" || (filter === "pre_delete" ? s.kind === "pre_delete" : s.kind !== "pre_delete"),
      ),
    [all, filter],
  );
  const latestFullId = all.find((s) => s.kind !== "pre_delete")?.id ?? null;
  const [selId, setSelId] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (!list.length) return;
    if (!selId || !list.some((s) => s.id === selId)) setSelId(list[0].id);
  }, [list, selId]);
  const diffQ = useQuery({
    queryKey: ["cf-dns-snapshot-diff", zoneId, selId],
    queryFn: () => fetchDiff({ data: { zoneId, snapshotId: selId! } }),
    enabled: !!selId,
  });
  const diff = diffQ.data as
    | { ok: true; rows: SnapshotDiffRow[]; takenAt: string }
    | { ok: false; error: string }
    | undefined;
  const rows = diff && diff.ok ? diff.rows : [];
  const restorable = rows.filter((r) => r.kind !== "added" && !r.ambiguous);
  const [picked, setPicked] = React.useState<Set<string>>(new Set());
  React.useEffect(() => setPicked(new Set()), [selId]);
  const [confirm, setConfirm] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [backing, setBacking] = React.useState(false);
  const sel = all.find((s) => s.id === selId) ?? null;
  const isPre = sel?.kind === "pre_delete";
  const pickedRows = rows.filter((r) => picked.has(r.id));
  const replacing = pickedRows.filter((r) => r.recreated).length;

  function chipLabel(s: SnapshotMeta) {
    const base = fmtShort(s.takenAt);
    if (s.kind === "pre_delete") return base;
    if (s.id === latestFullId) return `${base} · último`;
    return s.kind === "manual" ? `${base} · manual` : base;
  }

  async function doDownload() {
    if (!selId) return;
    const res: any = await download({ data: { snapshotId: selId } });
    if (!res?.ok) return toast.error(res?.error ?? "Falha ao baixar.");
    if (res.url) {
      window.open(res.url, "_blank", "noopener");
      return;
    }
    const blob = new Blob([JSON.stringify(res.records, null, 2)], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = res.fileName;
    a.click();
    URL.revokeObjectURL(a.href);
  }

  const ctx = sel?.context ?? null;

  return (
    <div className="cfx-col">
      <style>{CSS}</style>
      <Block
        title="Backups de DNS"
        icon={Archive}
        extra={
          <div className="cfx-grp">
            {sel && (
              <Badge
                label={`${sel.recordCount} registro${sel.recordCount === 1 ? "" : "s"}`}
                color="var(--v2-ok)"
                dot={false}
              />
            )}
            <button className="cfx-btn sm" onClick={doDownload} disabled={!selId}>
              <Download size={12} /> {sel?.hasFile ? "Baixar arquivo BIND" : "Baixar cópia (JSON)"}
            </button>
            <button
              className="cfx-btn sm"
              disabled={backing}
              onClick={async () => {
                setBacking(true);
                try {
                  const res: any = await backupNow({ data: { zoneId } });
                  if (res?.ok) {
                    toast.success(`Backup feito: ${res.count} registros.`);
                    setSelId(null);
                    if (filter === "pre_delete") setFilter("all");
                    qc.invalidateQueries({ queryKey: ["cf-dns-snapshots", zoneId] });
                  } else toast.error(res?.error ?? "Falha no backup.");
                } finally {
                  setBacking(false);
                }
              }}
            >
              <RefreshCw size={12} className={backing ? "animate-spin" : ""} /> Fazer backup agora
            </button>
          </div>
        }
      >
        {isLoading ? (
          <Empty>Carregando backups…</Empty>
        ) : all.length === 0 ? (
          <Empty>
            Ainda não há backup desta zona. O backup diário roda pelo job em Cron Jobs; use "Fazer backup agora"
            para criar o primeiro.
          </Empty>
        ) : (
          <>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
                alignItems: "center",
              }}
            >
              <div className="bk-seg" role="group" aria-label="Tipo de cópia">
                {FILTERS.map((f) => (
                  <button
                    key={f.key}
                    className={filter === f.key ? "on" : ""}
                    aria-pressed={filter === f.key}
                    onClick={() => setFilter(f.key)}
                  >
                    {f.label} <span className="n">{counts[f.key]}</span>
                  </button>
                ))}
              </div>
              <span className="cfx-muted" style={{ fontSize: 11.5 }}>
                As cópias de antes da exclusão nunca são apagadas.
              </span>
            </div>
            {list.length === 0 ? (
              <Empty>
                {filter === "pre_delete"
                  ? `Nenhuma exclusão feita pelo ${APP_NAME} nesta zona ainda.`
                  : "Nenhum backup neste filtro."}
              </Empty>
            ) : (
              <>
                <div className="cfx-chips" style={{ maxHeight: 120, overflowY: "auto" }}>
                  {list.map((s) => (
                    <button
                      key={s.id}
                      className={`cfx-day${s.kind === "pre_delete" ? " bk-pd" : ""}${selId === s.id ? " on" : ""}`}
                      onClick={() => setSelId(s.id)}
                      title={
                        s.kind === "pre_delete" && s.record
                          ? `Antes da exclusão: ${s.record.type} ${s.record.name}`
                          : undefined
                      }
                    >
                      {chipLabel(s)}
                      {s.kind === "pre_delete" && s.record && (
                        <>
                          {" "}
                          · <span className="r">
                            {s.record.type} {shortName(s.record.name)}
                          </span>
                        </>
                      )}
                    </button>
                  ))}
                </div>

                {isPre && (
                  <div className="bk-ctx">
                    <div>
                      <div className="cfx-lbl">Cópia</div>
                      Antes da exclusão · {sel ? new Date(sel.takenAt).toLocaleString("pt-BR") : "—"}
                    </div>
                    {ctx ? (
                      <>
                        <div>
                          <div className="cfx-lbl">Como foi apagado</div>
                          {ctx.byException ? (
                            <Badge label="Por exceção" color="var(--v2-cat-exec)" />
                          ) : (
                            "Pedido aprovado"
                          )}
                        </div>
                        <div>
                          <div className="cfx-lbl">Pedido por</div>
                          {ctx.requestedByEmail ?? "—"}
                        </div>
                        <div>
                          <div className="cfx-lbl">
                            {ctx.byException ? "Apagado por" : "Aprovado por"}
                          </div>
                          {ctx.decidedByEmail ?? "—"}
                        </div>
                        {ctx.restoredAt && (
                          <div>
                            <div className="cfx-lbl">Restaurado</div>
                            {ctx.restoredByEmail ?? "—"} ·{" "}
                            {new Date(ctx.restoredAt).toLocaleString("pt-BR")}
                          </div>
                        )}
                        {ctx.justification && (
                          <div className="full">
                            <div className="cfx-lbl">Justificativa</div>
                            {ctx.justification}
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="full cfx-muted">
                        Sem pedido de exclusão ligado a esta cópia (ex.: remoção de registro criado
                        fora do fluxo, a partir do alerta).
                      </div>
                    )}
                  </div>
                )}

                {diffQ.isLoading ? (
                  <Empty>Comparando com a Cloudflare agora…</Empty>
                ) : diff && !diff.ok ? (
                  <Empty>{diff.error}</Empty>
                ) : (
                  <>
                    <div style={{ fontSize: 12.5 }}>
                      {rows.length === 0 ? (
                        <span className="cfx-muted">
                          {isPre
                            ? "O registro já está na Cloudflare igual à cópia. Nada a restaurar."
                            : "Nenhuma diferença entre esta cópia e a Cloudflare agora."}
                        </span>
                      ) : isPre && rows[0]?.recreated ? (
                        <div className="bk-warn">
                          <b style={{ color: "var(--v2-high)" }}>Recriado com outro valor.</b>{" "}
                          Existe hoje um {rows[0].before?.type} com o mesmo nome. Restaurar{" "}
                          <b>substitui</b> o valor dele pelo da cópia, sem criar um segundo
                          registro.
                        </div>
                      ) : (
                        <>
                          Desde esta cópia:{" "}
                          <b style={{ color: "var(--v2-crit)" }}>
                            {rows.filter((r) => r.kind === "removed").length} apagado(s)
                          </b>{" "}
                          ·{" "}
                          <b style={{ color: "var(--v2-high)" }}>
                            {rows.filter((r) => r.kind === "changed").length} alterado(s)
                          </b>
                          {!isPre && (
                            <>
                              {" "}
                              ·{" "}
                              <b style={{ color: "var(--v2-accent)" }}>
                                {rows.filter((r) => r.kind === "added").length} novo(s)
                              </b>
                            </>
                          )}
                          .{isPre && " Só o registro da cópia é comparado."}
                        </>
                      )}
                    </div>
                    {rows.some((r) => r.ambiguous) && (
                      <Note color="var(--v2-high)" icon={AlertTriangle}>
                        Há registro com mais de um candidato de mesmo tipo e nome criado depois da
                        cópia. A restauração não escolhe sozinha: confira no painel da Cloudflare
                        qual deve ficar.
                      </Note>
                    )}
                    {rows.length > 0 && (
                      <div className="cfx-tbl-wrap cfx-tbl-scroll">
                        <table className="cfx-tbl">
                          <thead>
                            <tr>
                              <th style={{ width: 30 }} />
                              <th>Mudança</th>
                              <th>Tipo</th>
                              <th>Nome</th>
                              <th>{isPre ? "Na cópia" : "No backup"}</th>
                              <th>Hoje na Cloudflare</th>
                            </tr>
                          </thead>
                          <tbody>
                            {rows.map((r) => {
                              const rec = r.before ?? r.now!;
                              const canPick = r.kind !== "added" && !r.ambiguous && isAdmin;
                              return (
                                <tr
                                  key={`${r.kind}-${r.id}`}
                                  style={{ background: KIND[r.kind].bg }}
                                >
                                  <td>
                                    {r.kind !== "added" && (
                                      <input
                                        type="checkbox"
                                        aria-label={`Restaurar ${rec.name}`}
                                        disabled={!canPick}
                                        checked={picked.has(r.id)}
                                        onChange={(e) => {
                                          const n = new Set(picked);
                                          if (e.target.checked) n.add(r.id);
                                          else n.delete(r.id);
                                          setPicked(n);
                                        }}
                                      />
                                    )}
                                  </td>
                                  <td>
                                    <Badge
                                      label={KIND[r.kind].label}
                                      color={KIND[r.kind].color}
                                      dot={false}
                                    />
                                    {r.recreated && (
                                      <span className="bk-sub">recriado com outro id</span>
                                    )}
                                    {r.ambiguous && (
                                      <span className="bk-sub">mais de um candidato</span>
                                    )}
                                  </td>
                                  <td className="cfx-mono">{rec.type}</td>
                                  <td className="cfx-mono" style={{ wordBreak: "break-all" }}>
                                    {rec.name}
                                  </td>
                                  <td className="cfx-mono" style={{ wordBreak: "break-all" }}>
                                    {recText(r.before)}
                                  </td>
                                  <td className="cfx-mono" style={{ wordBreak: "break-all" }}>
                                    {r.now ? (
                                      recText(r.now)
                                    ) : (
                                      <span style={{ color: "var(--v2-crit)" }}>
                                        — não existe mais
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                    {restorable.length > 0 && (
                      <div
                        style={{
                          display: "flex",
                          justifyContent: "space-between",
                          gap: 10,
                          flexWrap: "wrap",
                          alignItems: "center",
                        }}
                      >
                        <span className="cfx-muted" style={{ fontSize: 11.5, maxWidth: "64ch" }}>
                          {!isAdmin
                            ? "Restaurar exige perfil admin/super admin."
                            : isPre && rows[0]?.recreated
                              ? "Restaurar substitui o valor atual pelo da cópia. Guarda cópia da zona antes, gera alerta e entra no Histórico."
                              : "Restaurar recria os apagados e devolve os alterados aos valores da cópia; registro recriado com outro id é substituído, não duplicado. Até 50 por vez; gera alerta e entra no Histórico."}
                        </span>
                        <button
                          className="cfx-btn solid"
                          disabled={!isAdmin || picked.size === 0}
                          onClick={() => setConfirm(true)}
                        >
                          Restaurar selecionados ({picked.size})
                        </button>
                      </div>
                    )}
                  </>
                )}
              </>
            )}
          </>
        )}
      </Block>
      <Note color="var(--v2-fg-3)" icon={Info}>
        Cópia completa de todos os registros da zona, uma vez por dia (job “Backup diário de DNS” em Cron Jobs), guardada no banco (90 dias
        + 1 por mês por 12 meses) e como arquivo de zona BIND num armazenamento privado — o arquivo
        dá para importar direto no painel da Cloudflare mesmo com o {APP_NAME} fora do ar. Se a zona
        perder mais de 10% dos registros de um dia para o outro, ou o backup falhar, sai alerta.
        Toda exclusão feita pelo {APP_NAME} também guarda uma cópia do registro logo antes
        ("Antes da exclusão").
      </Note>
      <AlertDialog open={confirm} onOpenChange={(o) => !busy && setConfirm(o)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Restaurar {picked.size} registro(s)?</AlertDialogTitle>
            <AlertDialogDescription>
              Os registros marcados voltam para a Cloudflare com os valores da cópia{" "}
              {isPre ? "feita antes da exclusão" : "de"}{" "}
              {sel ? `(${new Date(sel.takenAt).toLocaleString("pt-BR")})` : ""}.
              {replacing > 0 &&
                ` ${replacing} foi(ram) recriado(s) com outro valor: o valor atual é substituído, sem criar um segundo registro.`}{" "}
              Antes, o estado atual da zona é guardado numa cópia própria. A restauração gera
              alerta e entra no Histórico.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy}
              onClick={async (e) => {
                e.preventDefault();
                if (!selId) return;
                setBusy(true);
                try {
                  const res: any = await restore({
                    data: { zoneId, snapshotId: selId, recordIds: [...picked] },
                  });
                  if (res?.ok) {
                    if (res.failed?.length)
                      toast.warning(
                        `${res.restored} restaurado(s), ${res.failed.length} falha(s): ${res.failed[0]}`,
                      );
                    else toast.success(`${res.restored} registro(s) restaurado(s).`);
                    setConfirm(false);
                    setPicked(new Set());
                    qc.invalidateQueries({ queryKey: ["cf-dns-snapshot-diff", zoneId] });
                    qc.invalidateQueries({ queryKey: ["cf-dns-snapshots", zoneId] });
                    qc.invalidateQueries({ queryKey: ["cf-dns-delete-requests"] });
                    qc.invalidateQueries({ queryKey: ["cloudflare-zone-changes"] });
                  } else toast.error(res?.error ?? "Falha ao restaurar.");
                } catch (err: any) {
                  toast.error(err?.message ?? "Falha ao restaurar.");
                } finally {
                  setBusy(false);
                }
              }}
            >
              {busy ? "Restaurando…" : "Restaurar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
