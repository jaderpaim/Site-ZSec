import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Layers, Crown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
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
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Panel, Badge } from "./primitives";
import { supabase } from "@/integrations/supabase/client";
import {
  listSegmentos,
  upsertSegmento,
  deleteSegmento,
  upsertSegmentoNota,
  deleteSegmentoNota,
  type SegmentoRow,
} from "@/lib/segmentos.functions";
import { usePermissions } from "@/lib/use-permissions";

const MODULE = "segmentos";

const fmt = (n: number | null | undefined, d = 2) =>
  n === null || n === undefined
    ? "—"
    : n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

type NotaRow = SegmentoRow["notas"][number];

export function SegmentosDashboard() {
  const qc = useQueryClient();
  const { can, isAdmin, isModuleAdmin } = usePermissions();
  const canCreate = isAdmin || isModuleAdmin(MODULE) || can(MODULE, "create") || can(MODULE, "manage");
  const canEdit = isAdmin || isModuleAdmin(MODULE) || can(MODULE, "edit") || can(MODULE, "manage");
  const canDelete = isAdmin || isModuleAdmin(MODULE) || can(MODULE, "delete") || can(MODULE, "manage");

  const fetchList = useServerFn(listSegmentos);
  const { data, isLoading, refetch } = useQuery({
    queryKey: ["segmentos"],
    queryFn: () => fetchList(),
  });

  React.useEffect(() => {
    const ch = supabase
      .channel("segmentos-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "segmentos" }, () =>
        qc.invalidateQueries({ queryKey: ["segmentos"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "segmentos_notas" }, () => {
        qc.invalidateQueries({ queryKey: ["segmentos"] });
        qc.invalidateQueries({ queryKey: ["maturidade"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  const segs = data ?? [];
  const bernoulli = segs.find((s) => s.is_bernoulli) ?? null;

  const [segDialog, setSegDialog] = React.useState<{ open: boolean; row: SegmentoRow | null }>({
    open: false,
    row: null,
  });
  const [notaDialog, setNotaDialog] = React.useState<{
    open: boolean;
    segmento: SegmentoRow | null;
    nota: NotaRow | null;
  }>({ open: false, segmento: null, nota: null });
  const [deleteSeg, setDeleteSeg] = React.useState<SegmentoRow | null>(null);
  const [deleteNotaItem, setDeleteNotaItem] = React.useState<NotaRow | null>(null);

  const delSegFn = useServerFn(deleteSegmento);
  const delNotaFn = useServerFn(deleteSegmentoNota);

  return (
    <div className="space-y-6">
      <Panel
        title="Segmentos"
        action={
          canCreate ? (
            <Button size="sm" onClick={() => setSegDialog({ open: true, row: null })}>
              <Plus className="size-4" /> Novo segmento
            </Button>
          ) : undefined
        }
      >
        {isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Carregando…</p>
        ) : segs.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Nenhum segmento cadastrado.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Nome</TableHead>
                <TableHead className="w-[100px]">Períodos</TableHead>
                <TableHead className="w-[160px]">Última NIST</TableHead>
                <TableHead className="w-[160px]">Última ISO</TableHead>
                <TableHead className="w-[140px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {segs.map((s) => {
                const lastNist = [...s.notas]
                  .filter((n) => n.nota_nist !== null)
                  .sort((a, b) => a.periodo_ordem - b.periodo_ordem)
                  .pop();
                const lastIso = [...s.notas]
                  .filter((n) => n.nota_iso !== null)
                  .sort((a, b) => a.periodo_ordem - b.periodo_ordem)
                  .pop();
                return (
                  <TableRow key={s.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-foreground">{s.nome}</span>
                        {s.is_bernoulli && (
                          <Badge tone="info">
                            <Crown className="size-3" /> Bernoulli
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="font-mono text-xs">{s.notas.length}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {lastNist ? `${fmt(lastNist.nota_nist)} · ${lastNist.periodo}` : "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {lastIso ? `${fmt(lastIso.nota_iso)} · ${lastIso.periodo}` : "—"}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setSegDialog({ open: true, row: s })}
                            title="Editar"
                          >
                            <Pencil className="size-4" />
                          </Button>
                        )}
                        {canCreate && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setNotaDialog({ open: true, segmento: s, nota: null })}
                            title="Adicionar período"
                          >
                            <Plus className="size-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button variant="ghost" size="icon" onClick={() => setDeleteSeg(s)} title="Excluir">
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Panel
        title="Períodos do Bernoulli"
        action={
          canCreate && bernoulli ? (
            <Button size="sm" onClick={() => setNotaDialog({ open: true, segmento: bernoulli, nota: null })}>
              <Plus className="size-4" /> Adicionar período
            </Button>
          ) : undefined
        }
      >
        {!bernoulli ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Nenhum segmento marcado como Bernoulli.</p>
        ) : bernoulli.notas.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Sem períodos cadastrados.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[80px]">Ordem</TableHead>
                <TableHead>Período</TableHead>
                <TableHead className="w-[120px]">NIST</TableHead>
                <TableHead className="w-[120px]">ISO</TableHead>
                <TableHead className="w-[140px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...bernoulli.notas]
                .sort((a, b) => a.periodo_ordem - b.periodo_ordem)
                .map((n) => (
                  <TableRow key={n.id}>
                    <TableCell className="font-mono text-xs text-muted-foreground">{n.periodo_ordem}</TableCell>
                    <TableCell className="font-medium">{n.periodo}</TableCell>
                    <TableCell className="font-mono text-primary">{fmt(n.nota_nist)}</TableCell>
                    <TableCell className="font-mono text-success">{fmt(n.nota_iso)}</TableCell>
                    <TableCell className="text-right">
                      <div className="inline-flex gap-1">
                        {canEdit && (
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => setNotaDialog({ open: true, segmento: bernoulli, nota: n })}
                          >
                            <Pencil className="size-4" />
                          </Button>
                        )}
                        {canDelete && (
                          <Button variant="ghost" size="icon" onClick={() => setDeleteNotaItem(n)}>
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
            </TableBody>
          </Table>
        )}
        <p className="text-mono-xs text-muted-foreground mt-3 flex items-center gap-2">
          <Layers className="size-3" /> Toda inserção/edição atualiza o módulo Maturidade automaticamente via trigger no
          banco.
        </p>
      </Panel>

      <SegmentoDialog
        state={segDialog}
        onClose={() => setSegDialog({ open: false, row: null })}
        onSaved={() => {
          setSegDialog({ open: false, row: null });
          refetch();
        }}
      />
      <NotaDialog
        state={notaDialog}
        onClose={() => setNotaDialog({ open: false, segmento: null, nota: null })}
        onSaved={() => {
          setNotaDialog({ open: false, segmento: null, nota: null });
          refetch();
        }}
      />

      <AlertDialog open={!!deleteSeg} onOpenChange={(o) => !o && setDeleteSeg(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir segmento?</AlertDialogTitle>
            <AlertDialogDescription>
              Todas as notas e linhas de Maturidade de <strong>{deleteSeg?.nome}</strong> serão removidas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleteSeg) return;
                try {
                  await delSegFn({ data: { id: deleteSeg.id } });
                  toast.success("Segmento removido");
                  setDeleteSeg(null);
                  refetch();
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!deleteNotaItem} onOpenChange={(o) => !o && setDeleteNotaItem(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir período?</AlertDialogTitle>
            <AlertDialogDescription>
              O período <strong>{deleteNotaItem?.periodo}</strong> será removido (afeta Maturidade).
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!deleteNotaItem) return;
                try {
                  await delNotaFn({ data: { id: deleteNotaItem.id } });
                  toast.success("Período removido");
                  setDeleteNotaItem(null);
                  refetch();
                } catch (e) {
                  toast.error((e as Error).message);
                }
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
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
  const [isB, setIsB] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (state.open) {
      setNome(state.row?.nome ?? "");
      setIsB(state.row?.is_bernoulli ?? false);
    }
  }, [state.open, state.row]);

  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{state.row ? "Editar segmento" : "Novo segmento"}</DialogTitle>
          <DialogDescription>Cadastre o nome do segmento de mercado.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="nome">Nome</Label>
            <Input
              id="nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              placeholder="Ex: Saúde, Bernoulli, ..."
            />
          </div>
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={isB} onChange={(e) => setIsB(e.target.checked)} />
            Este é o segmento <strong>Bernoulli</strong> (referência para timeline)
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={saving || !nome.trim()}
            onClick={async () => {
              setSaving(true);
              try {
                await upsert({ data: { id: state.row?.id ?? null, nome: nome.trim(), is_bernoulli: isB } });
                toast.success(state.row ? "Segmento atualizado" : "Segmento criado");
                onSaved();
              } catch (e) {
                toast.error((e as Error).message);
              } finally {
                setSaving(false);
              }
            }}
          >
            Salvar
          </Button>
        </DialogFooter>
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
  const [nista, setNista] = React.useState("");
  const [iso, setIso] = React.useState("");
  const [ordem, setOrdem] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (state.open) {
      setPeriodo(state.nota?.periodo ?? "");
      setNista(state.nota?.nota_nist?.toString().replace(".", ",") ?? "");
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

  return (
    <Dialog open={state.open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{state.nota ? "Editar período" : "Adicionar período"}</DialogTitle>
          <DialogDescription>
            Segmento: <strong>{state.segmento?.nome}</strong>. Ao salvar, a linha em Maturidade é gerada/atualizada
            automaticamente.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2 col-span-2">
            <Label>Período</Label>
            <Input value={periodo} onChange={(e) => setPeriodo(e.target.value)} placeholder="Ex: Mai 2026" />
          </div>
          <div className="space-y-2">
            <Label>Ordem (opcional)</Label>
            <Input value={ordem} onChange={(e) => setOrdem(e.target.value)} placeholder="auto" inputMode="numeric" />
          </div>
          <div className="space-y-2">
            <Label>Nota NIST</Label>
            <Input
              value={nista}
              onChange={(e) => setNista(e.target.value)}
              placeholder="0,00 — 5,00"
              inputMode="decimal"
            />
          </div>
          <div className="space-y-2 col-span-2">
            <Label>Nota ISO</Label>
            <Input value={iso} onChange={(e) => setIso(e.target.value)} placeholder="0,00 — 5,00" inputMode="decimal" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={saving || !state.segmento || !periodo.trim()}
            onClick={async () => {
              if (!state.segmento) return;
              setSaving(true);
              try {
                const ordemNum = ordem.trim() ? Number(ordem) : undefined;
                const r = await upsert({
                  data: {
                    id: state.nota?.id ?? null,
                    segmento_id: state.segmento.id,
                    periodo: periodo.trim(),
                    periodo_ordem: ordemNum,
                    nota_nist: parseN(nista),
                    nota_iso: parseN(iso),
                  },
                });
                if (r.maturidade && r.maturidade.score !== null) {
                  const d = r.maturidade.delta_anterior;
                  toast.success(
                    `✓ Maturidade atualizada — Score ${r.maturidade.score!.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` +
                      (d !== null
                        ? ` · Δ ${d >= 0 ? "+" : ""}${d.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
                        : ""),
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
            }}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default SegmentosDashboard;
