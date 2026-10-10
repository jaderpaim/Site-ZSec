import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { ArrowUp, Crown, Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DetailSection, DetailSheet } from "@/components/layout/DetailSheet";
import {
  listSegmentos,
  upsertSegmento,
  deleteSegmento,
  upsertSegmentoNota,
  deleteSegmentoNota,
  type SegmentoRow,
} from "@/lib/segmentos.functions";
import { usePermissions } from "@/lib/use-permissions";

// Aba "Notas e segmentos" da Maturidade: cadastro das notas NIST/ISO por
// período. O segmento marcado como da empresa (is_propria) são as nossas
// avaliações; os demais são benchmarks de mercado. O trigger
// trg_segmentos_notas_sync recalcula a tabela maturidade a cada alteração.
// Permissões continuam no slug "segmentos" (oculto do menu).
const MODULE = "segmentos";

type NotaRow = SegmentoRow["notas"][number];

const fmt = (n: number | null | undefined) =>
  n === null || n === undefined
    ? "—"
    : n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const byOrdem = (a: NotaRow, b: NotaRow) => a.periodo_ordem - b.periodo_ordem;
const lastWith = (notas: NotaRow[], k: "nota_nist" | "nota_iso") =>
  [...notas]
    .filter((n) => n[k] !== null)
    .sort(byOrdem)
    .pop();

const CSS = `
  .mn-sync { display:flex; gap:10px; align-items:flex-start; padding:10px 14px; border-radius:10px; font-size:12.5px; line-height:1.5; color:var(--v2-fg-2); background:color-mix(in oklch, var(--v2-accent) 10%, transparent); border:1px solid color-mix(in oklch, var(--v2-accent) 30%, transparent); }
  .mn-sync svg { color:var(--v2-accent); flex:none; margin-top:2px; }
  .mn-panel { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; min-width:0; }
  .mn-bar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding:12px 18px; border-bottom:1px solid var(--v2-line); }
  .mn-bar b { font-size:14px; font-weight:600; display:block; }
  .mn-bar b span { font-weight:400; font-size:13px; color:var(--v2-fg-3); }
  .mn-bar small { font-size:12.5px; color:var(--v2-fg-3); }
  .mn-bar .mn-btn { margin-left:auto; }
  .mn-empty { padding:32px 16px; text-align:center; color:var(--v2-fg-3); font-size:13px; }
  .mn-scroll { overflow:auto; }
  .mn-table { width:100%; border-collapse:collapse; font-size:13px; }
  .mn-table th { padding:9px 12px; font-size:12px; font-weight:500; color:var(--v2-fg-3); text-align:left; background:var(--v2-surface); border-bottom:1px solid var(--v2-line); white-space:nowrap; }
  .mn-table th.r, .mn-table td.r { text-align:right; }
  .mn-table td { padding:8px 12px; height:46px; border-bottom:1px solid var(--v2-line); white-space:nowrap; vertical-align:middle; }
  .mn-table th:first-child, .mn-table td:first-child { padding-left:18px; }
  .mn-table th:last-child, .mn-table td:last-child { padding-right:18px; }
  .mn-table tbody tr:last-child td { border-bottom:none; }
  .mn-table tbody tr:hover td { background:var(--v2-hover); }
  .mn-table tbody tr.click { cursor:pointer; }
  .mn-num { font:500 13px var(--font-data); }
  .mn-num small { font:400 12px var(--font-ui); color:var(--v2-fg-3); margin-left:6px; }
  .mn-dl { font:500 12px var(--font-data); }
  .mn-dl.up { color:var(--v2-ok); }
  .mn-dl.dn { color:var(--v2-crit); }
  .mn-dim { color:var(--v2-fg-3); }
  .mn-row-act { display:flex; justify-content:flex-end; gap:2px; }
  .mn-icon-btn { display:grid; place-items:center; width:30px; height:30px; border-radius:8px; border:0; background:transparent; color:var(--v2-fg-2); cursor:pointer; }
  .mn-icon-btn:hover { background:var(--v2-hover); color:var(--v2-fg); }
  .mn-icon-btn.danger:hover { color:var(--v2-crit); background:color-mix(in oklch, var(--v2-crit) 12%, transparent); }
  .mn-btn { display:inline-flex; align-items:center; gap:7px; height:34px; padding:0 14px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; font-family:var(--font-ui); white-space:nowrap; border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-fg); }
  .mn-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .mn-btn:hover:not(:disabled) { background:var(--v2-hover); }
  .mn-btn.primary { background:var(--v2-accent); border-color:var(--v2-accent); color:var(--v2-accent-ink); }
  .mn-btn.primary:hover:not(:disabled) { background:var(--v2-accent); filter:brightness(1.08); }
  .mn-btn.ghost { background:transparent; border-color:transparent; color:var(--v2-fg-2); }
  .mn-btn.danger { background:var(--v2-crit); border-color:var(--v2-crit); color:#fff; }
  .mn-form { display:grid; gap:14px; padding-top:4px; font-family:var(--font-ui); color:var(--v2-fg); }
  .mn-row2 { display:grid; grid-template-columns:1fr 1fr; gap:12px; }
  .mn-field { display:grid; gap:6px; align-content:start; }
  .mn-field label { font-size:12.5px; font-weight:500; color:var(--v2-fg-2); }
  .mn-field small { font-size:12px; color:var(--v2-fg-3); }
  .mn-input { width:100%; height:34px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg); font-size:13px; font-family:inherit; outline:none; }
  .mn-input:focus { border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }
  .mn-chk { display:flex; align-items:center; gap:8px; font-size:13px; cursor:pointer; }
  .mn-sub { margin:0; font-size:13px; color:var(--v2-fg-2); }
`;

const dialogStyle: React.CSSProperties = {
  background: "var(--v2-surface)",
  border: "1px solid var(--v2-line-strong)",
  borderRadius: 12,
  color: "var(--v2-fg)",
};

export function MaturidadeNotas() {
  const qc = useQueryClient();
  const { can, isAdmin, isModuleAdmin } = usePermissions();
  const canCreate =
    isAdmin || isModuleAdmin(MODULE) || can(MODULE, "create") || can(MODULE, "manage");
  const canEdit = isAdmin || isModuleAdmin(MODULE) || can(MODULE, "edit") || can(MODULE, "manage");
  const canDelete =
    isAdmin || isModuleAdmin(MODULE) || can(MODULE, "delete") || can(MODULE, "manage");

  const fetchList = useServerFn(listSegmentos);
  const delSegFn = useServerFn(deleteSegmento);
  const delNotaFn = useServerFn(deleteSegmentoNota);
  const { data, isLoading } = useQuery({ queryKey: ["segmentos"], queryFn: () => fetchList() });

  const [segDialog, setSegDialog] = React.useState<{ open: boolean; row: SegmentoRow | null }>({
    open: false,
    row: null,
  });
  const [notaDialog, setNotaDialog] = React.useState<{
    open: boolean;
    segmento: SegmentoRow | null;
    nota: NotaRow | null;
  }>({ open: false, segmento: null, nota: null });
  const [detailId, setDetailId] = React.useState<string | null>(null);
  const [confirm, setConfirm] = React.useState<
    { kind: "seg"; seg: SegmentoRow } | { kind: "nota"; nota: NotaRow } | null
  >(null);
  const [deleting, setDeleting] = React.useState(false);

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["segmentos"] });
    qc.invalidateQueries({ queryKey: ["maturidade"] });
  };

  const segs = data ?? [];
  const own = segs.find((s) => s.is_propria) ?? null;
  const market = segs.filter((s) => !s.is_propria);
  const detail = segs.find((s) => s.id === detailId) ?? null;
  const ownRows = own ? [...own.notas].sort(byOrdem) : [];

  async function doDelete() {
    if (!confirm) return;
    setDeleting(true);
    try {
      if (confirm.kind === "seg") {
        await delSegFn({ data: { id: confirm.seg.id } });
        toast.success("Segmento removido");
        if (detailId === confirm.seg.id) setDetailId(null);
      } else {
        await delNotaFn({ data: { id: confirm.nota.id } });
        toast.success("Período removido");
      }
      setConfirm(null);
      refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setDeleting(false);
    }
  }

  const delta = (cur: NotaRow, prev: NotaRow | undefined, k: "nota_nist" | "nota_iso") => {
    if (!prev || cur[k] === null || prev[k] === null) return <span className="mn-dim">—</span>;
    const d = (cur[k] as number) - (prev[k] as number);
    return (
      <span className={`mn-dl ${d >= 0 ? "up" : "dn"}`}>
        {d >= 0 ? "+" : "−"}
        {fmt(Math.abs(d))}
      </span>
    );
  };

  const notaActions = (seg: SegmentoRow, n: NotaRow) =>
    (canEdit || canDelete) && (
      <div className="mn-row-act">
        {canEdit && (
          <button
            className="mn-icon-btn"
            title="Editar"
            aria-label="Editar período"
            onClick={() => setNotaDialog({ open: true, segmento: seg, nota: n })}
          >
            <Pencil size={14} />
          </button>
        )}
        {canDelete && (
          <button
            className="mn-icon-btn danger"
            title="Excluir"
            aria-label="Excluir período"
            onClick={() => setConfirm({ kind: "nota", nota: n })}
          >
            <Trash2 size={14} />
          </button>
        )}
      </div>
    );

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="mn-sync">
        <ArrowUp size={15} />
        <span>
          As notas cadastradas aqui alimentam a Visão geral: ao salvar, a evolução, as variações e a
          comparação com o mercado são recalculadas automaticamente.
        </span>
      </div>

      {isLoading ? (
        <div className="mn-panel mn-empty">
          <Loader2 size={16} className="animate-spin" style={{ display: "inline" }} /> Carregando…
        </div>
      ) : (
        <>
          {/* ── Avaliações da empresa ── */}
          <div className="mn-panel">
            <div className="mn-bar">
              <div>
                <b>
                  Avaliações da empresa <span>({ownRows.length})</span>
                </b>
                <small>
                  {own
                    ? `Notas do segmento “${own.nome}”, base da evolução e das variações`
                    : "Marque um segmento como o da empresa para cadastrar as avaliações"}
                </small>
              </div>
              {canCreate && own && (
                <button
                  className="mn-btn primary"
                  onClick={() => setNotaDialog({ open: true, segmento: own, nota: null })}
                >
                  <Plus size={14} /> Adicionar avaliação
                </button>
              )}
            </div>
            {!own ? (
              <div className="mn-empty">
                Nenhum segmento está marcado como o da empresa. Edite um segmento de mercado e
                marque “Este é o segmento da própria empresa”.
              </div>
            ) : ownRows.length === 0 ? (
              <div className="mn-empty">Sem avaliações cadastradas.</div>
            ) : (
              <div className="mn-scroll">
                <table className="mn-table">
                  <thead>
                    <tr>
                      <th>Ordem</th>
                      <th>Período</th>
                      <th className="r">NIST</th>
                      <th className="r">Δ NIST</th>
                      <th className="r">ISO</th>
                      <th className="r">Δ ISO</th>
                      {(canEdit || canDelete) && (
                        <th>
                          <span style={{ fontSize: 0 }}>Ações</span>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {ownRows.map((n, i) => (
                      <tr key={n.id}>
                        <td className="mn-num mn-dim">{n.periodo_ordem}</td>
                        <td style={{ fontWeight: 500 }}>{n.periodo}</td>
                        <td className="r mn-num">{fmt(n.nota_nist)}</td>
                        <td className="r">{delta(n, ownRows[i - 1], "nota_nist")}</td>
                        <td className="r mn-num">{fmt(n.nota_iso)}</td>
                        <td className="r">{delta(n, ownRows[i - 1], "nota_iso")}</td>
                        {(canEdit || canDelete) && <td>{notaActions(own, n)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* ── Segmentos de mercado ── */}
          <div className="mn-panel">
            <div className="mn-bar">
              <div>
                <b>
                  Segmentos de mercado <span>({market.length})</span>
                </b>
                <small>Benchmarks usados na comparação · clique para ver os períodos</small>
              </div>
              {canCreate && (
                <button className="mn-btn" onClick={() => setSegDialog({ open: true, row: null })}>
                  <Plus size={14} /> Novo segmento
                </button>
              )}
            </div>
            {segs.length === 0 ? (
              <div className="mn-empty">Nenhum segmento cadastrado.</div>
            ) : (
              <div className="mn-scroll">
                <table className="mn-table">
                  <thead>
                    <tr>
                      <th>Segmento</th>
                      <th>Períodos</th>
                      <th>Última NIST</th>
                      <th>Última ISO</th>
                      {(canCreate || canEdit || canDelete) && (
                        <th>
                          <span style={{ fontSize: 0 }}>Ações</span>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {[...(own ? [own] : []), ...market].map((s) => {
                      const ln = lastWith(s.notas, "nota_nist");
                      const li = lastWith(s.notas, "nota_iso");
                      return (
                        <tr
                          key={s.id}
                          className="click"
                          tabIndex={0}
                          onClick={() => setDetailId(s.id)}
                          onKeyDown={(e) => e.key === "Enter" && setDetailId(s.id)}
                        >
                          <td style={{ fontWeight: 500 }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                              {s.nome}
                              {s.is_propria && (
                                <span
                                  className="mn-dl"
                                  style={{
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: 4,
                                    height: 22,
                                    padding: "0 8px",
                                    borderRadius: 5,
                                    fontFamily: "var(--font-ui)",
                                    background:
                                      "color-mix(in oklch, var(--v2-accent) 14%, transparent)",
                                    color: "var(--v2-accent)",
                                  }}
                                >
                                  <Crown size={12} /> Empresa
                                </span>
                              )}
                            </span>
                          </td>
                          <td className="mn-num">{s.notas.length}</td>
                          <td className="mn-num">
                            {fmt(ln?.nota_nist)}
                            {ln && <small>{ln.periodo}</small>}
                          </td>
                          <td className="mn-num">
                            {fmt(li?.nota_iso)}
                            {li && <small>{li.periodo}</small>}
                          </td>
                          {(canCreate || canEdit || canDelete) && (
                            <td onClick={(e) => e.stopPropagation()}>
                              <div className="mn-row-act">
                                {canCreate && (
                                  <button
                                    className="mn-icon-btn"
                                    title="Adicionar período"
                                    aria-label="Adicionar período"
                                    onClick={() =>
                                      setNotaDialog({ open: true, segmento: s, nota: null })
                                    }
                                  >
                                    <Plus size={14} />
                                  </button>
                                )}
                                {canEdit && (
                                  <button
                                    className="mn-icon-btn"
                                    title="Editar"
                                    aria-label="Editar segmento"
                                    onClick={() => setSegDialog({ open: true, row: s })}
                                  >
                                    <Pencil size={14} />
                                  </button>
                                )}
                                {canDelete && (
                                  <button
                                    className="mn-icon-btn danger"
                                    title="Excluir"
                                    aria-label="Excluir segmento"
                                    onClick={() => setConfirm({ kind: "seg", seg: s })}
                                  >
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Períodos do segmento ── */}
      <DetailSheet
        open={!!detail}
        onOpenChange={(o) => !o && setDetailId(null)}
        eyebrow={
          detail ? (detail.is_propria ? "segmento da empresa" : "segmento de mercado") : ""
        }
        title={detail?.nome ?? ""}
        width={540}
        footer={
          detail && (
            <>
              {canEdit && (
                <button
                  className="mn-btn ghost"
                  style={{ marginRight: "auto" }}
                  onClick={() => setSegDialog({ open: true, row: detail })}
                >
                  <Pencil size={14} /> Editar segmento
                </button>
              )}
              {canCreate && (
                <button
                  className="mn-btn primary"
                  onClick={() => setNotaDialog({ open: true, segmento: detail, nota: null })}
                >
                  <Plus size={14} /> Adicionar período
                </button>
              )}
            </>
          )
        }
      >
        {detail && (
          <DetailSection title={`Períodos (${detail.notas.length})`}>
            {detail.notas.length === 0 ? (
              <p className="mn-sub mn-dim">Sem períodos cadastrados.</p>
            ) : (
              <div
                style={{ border: "1px solid var(--v2-line)", borderRadius: 8, overflow: "hidden" }}
              >
                <style dangerouslySetInnerHTML={{ __html: CSS }} />
                <table className="mn-table">
                  <thead>
                    <tr>
                      <th>Ordem</th>
                      <th>Período</th>
                      <th className="r">NIST</th>
                      <th className="r">ISO</th>
                      {(canEdit || canDelete) && (
                        <th>
                          <span style={{ fontSize: 0 }}>Ações</span>
                        </th>
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {[...detail.notas].sort(byOrdem).map((n) => (
                      <tr key={n.id}>
                        <td className="mn-num mn-dim">{n.periodo_ordem}</td>
                        <td style={{ fontWeight: 500 }}>{n.periodo}</td>
                        <td className="r mn-num">{fmt(n.nota_nist)}</td>
                        <td className="r mn-num">{fmt(n.nota_iso)}</td>
                        {(canEdit || canDelete) && <td>{notaActions(detail, n)}</td>}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </DetailSection>
        )}
      </DetailSheet>

      <SegmentoDialog
        state={segDialog}
        onClose={() => setSegDialog({ open: false, row: null })}
        onSaved={() => {
          setSegDialog({ open: false, row: null });
          refresh();
        }}
      />
      <NotaDialog
        state={notaDialog}
        onClose={() => setNotaDialog({ open: false, segmento: null, nota: null })}
        onSaved={() => {
          setNotaDialog({ open: false, segmento: null, nota: null });
          refresh();
        }}
      />

      <Dialog open={!!confirm} onOpenChange={(o) => !o && !deleting && setConfirm(null)}>
        <DialogContent className="font-ui sm:max-w-md" style={dialogStyle}>
          <DialogHeader>
            <DialogTitle style={{ fontSize: 16, fontWeight: 600 }}>
              {confirm?.kind === "seg" ? "Excluir segmento?" : "Excluir período?"}
            </DialogTitle>
          </DialogHeader>
          <p style={{ margin: 0, fontSize: 13.5, color: "var(--v2-fg-2)", lineHeight: 1.55 }}>
            {confirm?.kind === "seg" ? (
              <>
                <b style={{ color: "var(--v2-fg)" }}>{confirm.seg.nome}</b> e seus{" "}
                {confirm.seg.notas.length} períodos serão removidos, junto com as linhas de
                Maturidade dele. Não dá para desfazer.
              </>
            ) : confirm?.kind === "nota" ? (
              <>
                O período <b style={{ color: "var(--v2-fg)" }}>{confirm.nota.periodo}</b> será
                removido e a Visão geral recalculada. Não dá para desfazer.
              </>
            ) : null}
          </p>
          <DialogFooter style={{ gap: 8 }}>
            <button className="mn-btn ghost" onClick={() => setConfirm(null)} disabled={deleting}>
              Cancelar
            </button>
            <button className="mn-btn danger" onClick={doDelete} disabled={deleting}>
              {deleting && <Loader2 size={13} className="animate-spin" />} Excluir
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function SegmentoDialog({
  state,
  onClose,
  onSaved,
}: {
  state: { open: boolean; row: SegmentoRow | null };
  onClose: () => void;
  onSaved: () => void;
}) {
  const upsert = useServerFn(upsertSegmento);
  const [nome, setNome] = React.useState("");
  const [isOwn, setIsOwn] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (state.open) {
      setNome(state.row?.nome ?? "");
      setIsOwn(state.row?.is_propria ?? false);
    }
  }, [state.open, state.row]);

  async function save() {
    setSaving(true);
    try {
      await upsert({ data: { id: state.row?.id ?? null, nome: nome.trim(), is_propria: isOwn } });
      toast.success(state.row ? "Segmento atualizado" : "Segmento criado");
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="font-ui sm:max-w-md" style={dialogStyle}>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <DialogHeader>
          <DialogTitle style={{ fontSize: 16, fontWeight: 600 }}>
            {state.row ? "Editar segmento" : "Novo segmento de mercado"}
          </DialogTitle>
        </DialogHeader>
        <form
          className="mn-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (nome.trim()) save();
          }}
        >
          <div className="mn-field">
            <label htmlFor="mn-nome">Nome</label>
            <input
              id="mn-nome"
              className="mn-input"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex.: Saúde, Financeiro"
            />
          </div>
          <label className="mn-chk">
            <input type="checkbox" checked={isOwn} onChange={(e) => setIsOwn(e.target.checked)} />
            Este é o segmento da própria empresa
          </label>
          <small style={{ fontSize: 12, color: "var(--v2-fg-3)", marginTop: -8 }}>
            Só um segmento é o da empresa: as notas dele aparecem como “Avaliações da empresa”.
          </small>
          <DialogFooter style={{ gap: 8 }}>
            <button type="button" className="mn-btn ghost" onClick={onClose}>
              Cancelar
            </button>
            <button type="submit" className="mn-btn primary" disabled={saving || !nome.trim()}>
              {saving && <Loader2 size={13} className="animate-spin" />} Salvar
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function NotaDialog({
  state,
  onClose,
  onSaved,
}: {
  state: { open: boolean; segmento: SegmentoRow | null; nota: NotaRow | null };
  onClose: () => void;
  onSaved: () => void;
}) {
  const upsert = useServerFn(upsertSegmentoNota);
  const [periodo, setPeriodo] = React.useState("");
  const [nist, setNist] = React.useState("");
  const [iso, setIso] = React.useState("");
  const [ordem, setOrdem] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (state.open) {
      setPeriodo(state.nota?.periodo ?? "");
      setNist(state.nota?.nota_nist?.toString().replace(".", ",") ?? "");
      setIso(state.nota?.nota_iso?.toString().replace(".", ",") ?? "");
      setOrdem(state.nota?.periodo_ordem?.toString() ?? "");
    }
  }, [state.open, state.nota]);

  const parseN = (s: string): number | null => {
    const t = s.trim().replace(",", ".");
    if (!t) return null;
    const n = Number(t);
    return Number.isFinite(n) ? n : null;
  };

  async function save() {
    if (!state.segmento) return;
    setSaving(true);
    try {
      const r = await upsert({
        data: {
          id: state.nota?.id ?? null,
          segmento_id: state.segmento.id,
          periodo: periodo.trim(),
          periodo_ordem: ordem.trim() ? Number(ordem) : undefined,
          nota_nist: parseN(nist),
          nota_iso: parseN(iso),
        },
      });
      if (r.maturidade && r.maturidade.score !== null) {
        const d = r.maturidade.delta_anterior;
        toast.success(
          `Maturidade atualizada · score ${fmt(r.maturidade.score)}` +
            (d !== null ? ` · Δ ${d >= 0 ? "+" : ""}${fmt(d)}` : ""),
        );
      } else {
        toast.success("Período salvo");
      }
      onSaved();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  const isOwn = !!state.segmento?.is_propria;
  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="font-ui sm:max-w-md" style={dialogStyle}>
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <DialogHeader>
          <DialogTitle style={{ fontSize: 16, fontWeight: 600 }}>
            {state.nota ? "Editar período" : isOwn ? "Adicionar avaliação" : "Adicionar período"}
          </DialogTitle>
        </DialogHeader>
        <form
          className="mn-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (periodo.trim()) save();
          }}
        >
          <p className="mn-sub">
            {isOwn ? "Avaliação da empresa" : state.segmento?.nome} · ao salvar, a Maturidade é
            recalculada.
          </p>
          <div className="mn-row2">
            <div className="mn-field">
              <label htmlFor="mn-periodo">Período</label>
              <input
                id="mn-periodo"
                className="mn-input"
                value={periodo}
                onChange={(e) => setPeriodo(e.target.value)}
                placeholder="Ex.: 2026/1"
              />
            </div>
            <div className="mn-field">
              <label htmlFor="mn-ordem">Ordem</label>
              <input
                id="mn-ordem"
                className="mn-input"
                value={ordem}
                onChange={(e) => setOrdem(e.target.value)}
                placeholder="automática"
                inputMode="numeric"
              />
              <small>Sequência no gráfico</small>
            </div>
          </div>
          <div className="mn-row2">
            <div className="mn-field">
              <label htmlFor="mn-nist">Nota NIST</label>
              <input
                id="mn-nist"
                className="mn-input"
                value={nist}
                onChange={(e) => setNist(e.target.value)}
                placeholder="0,00 a 5,00"
                inputMode="decimal"
              />
            </div>
            <div className="mn-field">
              <label htmlFor="mn-iso">Nota ISO</label>
              <input
                id="mn-iso"
                className="mn-input"
                value={iso}
                onChange={(e) => setIso(e.target.value)}
                placeholder="0,00 a 5,00"
                inputMode="decimal"
              />
            </div>
          </div>
          <DialogFooter style={{ gap: 8 }}>
            <button type="button" className="mn-btn ghost" onClick={onClose}>
              Cancelar
            </button>
            <button
              type="submit"
              className="mn-btn primary"
              disabled={saving || !state.segmento || !periodo.trim()}
            >
              {saving && <Loader2 size={13} className="animate-spin" />} Salvar
            </button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
