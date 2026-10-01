import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2 } from "lucide-react";
import { Panel } from "./primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useDepartments } from "@/lib/use-departments";
import { useAuth } from "@/lib/auth-context";
import { usePermissions } from "@/lib/use-permissions";
import { listAprovadores, upsertAprovador, deleteAprovador } from "@/lib/aprovadores.functions";

const MODULE = "aprovadores";

type Row = {
  id: string;
  nome: string;
  email: string;
  department_id: string;
  ordem: number;
  papel: string | null;
};

export function AprovadoresDashboard() {
  const qc = useQueryClient();
  const { can, isAdmin, isModuleAdmin } = usePermissions();
  const canCreate = isAdmin || isModuleAdmin(MODULE) || can(MODULE, "create") || can(MODULE, "manage");
  const canEdit = isAdmin || isModuleAdmin(MODULE) || can(MODULE, "edit") || can(MODULE, "manage");
  const canDelete = isAdmin || isModuleAdmin(MODULE) || can(MODULE, "delete") || can(MODULE, "manage");

  const fetchList = useServerFn(listAprovadores);
  const deleteFn = useServerFn(deleteAprovador);

  const { data: depts } = useDepartments();
  const deptName = React.useMemo(() => {
    const m = new Map<string, string>();
    (depts ?? []).forEach((d) => m.set(d.id, d.name));
    return m;
  }, [depts]);

  const { data, isLoading } = useQuery({
    queryKey: ["aprovadores"],
    queryFn: () => fetchList() as Promise<Row[]>,
  });

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Row | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<Row | null>(null);

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Aprovador removido");
      qc.invalidateQueries({ queryKey: ["aprovadores"] });
      setDeleteTarget(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <Panel
        title={`Aprovadores (${data?.length ?? 0})`}
        action={
          canCreate ? (
            <Button
              size="sm"
              onClick={() => {
                setEditing(null);
                setDialogOpen(true);
              }}
            >
              <Plus className="size-4 mr-1" /> Adicionar aprovador
            </Button>
          ) : undefined
        }
      >
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : !data || data.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nenhum aprovador cadastrado. Clique em "Adicionar aprovador" para começar.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-mono-xs text-muted-foreground border-b border-border">
                <th className="text-left p-2">Nome</th>
                <th className="text-left p-2">E-mail</th>
                <th className="text-left p-2">Departamento</th>
                <th className="text-left p-2">Ordem de aprovação</th>
                <th className="text-left p-2">Papel</th>
                <th className="w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((r) => (
                <tr key={r.id} className="hover:bg-accent/40">
                  <td className="p-2 font-medium">{r.nome}</td>
                  <td className="p-2 text-muted-foreground">{r.email}</td>
                  <td className="p-2">{deptName.get(r.department_id) ?? "—"}</td>
                  <td className="p-2 font-mono">{r.ordem}</td>
                  <td className="p-2 text-muted-foreground">{r.papel ?? "—"}</td>
                  <td className="p-2">
                    <div className="flex justify-end gap-1">
                      {canEdit && (
                        <button
                          onClick={() => {
                            setEditing(r);
                            setDialogOpen(true);
                          }}
                          className="text-muted-foreground hover:text-foreground p-1"
                          title="Editar"
                        >
                          <Pencil className="size-4" />
                        </button>
                      )}
                      {canDelete && (
                        <button
                          onClick={() => setDeleteTarget(r)}
                          className="text-muted-foreground hover:text-danger p-1"
                          title="Remover"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <AprovadorDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => !v && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover aprovador?</AlertDialogTitle>
            <AlertDialogDescription>
              O aprovador <strong>"{deleteTarget?.nome}"</strong> será removido permanentemente. Esta ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={del.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={del.isPending}
              className="bg-destructive hover:bg-destructive/90"
              onClick={() => deleteTarget && del.mutate(deleteTarget.id)}
            >
              {del.isPending ? "Removendo…" : "Remover"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function AprovadorDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Row | null;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { data: depts } = useDepartments();
  const submit = useServerFn(upsertAprovador);

  const [nome, setNome] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [deptId, setDeptId] = React.useState("");
  const [ordem, setOrdem] = React.useState<number>(1);
  const [papel, setPapel] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setNome(editing?.nome ?? "");
      setEmail(editing?.email ?? "");
      setDeptId(editing?.department_id ?? "");
      setOrdem(editing?.ordem ?? 1);
      setPapel(editing?.papel ?? "");
    }
  }, [open, editing]);

  async function handleSubmit() {
    if (!nome.trim()) return toast.error("Informe o nome");
    if (!email.trim()) return toast.error("Informe o e-mail");
    if (!deptId) return toast.error("Selecione o departamento");
    if (!ordem || ordem < 1) return toast.error("Ordem deve ser maior ou igual a 1");
    if (!papel.trim()) return toast.error("Informe o papel — ele define os grupos de aprovação entre departamentos");

    setLoading(true);
    try {
      await submit({
        data: {
          id: editing?.id ?? null,
          nome: nome.trim(),
          email: email.trim().toLowerCase(),
          department_id: deptId,
          ordem: Number(ordem),
          papel: papel.trim(),
          created_by: user?.id ?? null,
        },
      });
      toast.success(editing ? "Aprovador atualizado" : "Aprovador criado");
      qc.invalidateQueries({ queryKey: ["aprovadores"] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar aprovador");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar aprovador" : "Novo aprovador"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          <div>
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={200} />
          </div>
          <div>
            <Label>E-mail *</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={255} />
          </div>
          <div>
            <Label>Departamento *</Label>
            <Select value={deptId} onValueChange={setDeptId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione" />
              </SelectTrigger>
              <SelectContent>
                {(depts ?? []).map((d) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Ordem de aprovação *</Label>
              <Input type="number" min={1} max={50} value={ordem} onChange={(e) => setOrdem(Number(e.target.value))} />
              <p className="text-xs text-muted-foreground mt-1">Quem aprova primeiro recebe a notificação inicial.</p>
            </div>
            <div>
              <Label>Papel/Função *</Label>
              <Input
                value={papel}
                onChange={(e) => setPapel(e.target.value)}
                maxLength={120}
                placeholder="Ex: Analista, Coordenador"
              />
              <p className="text-xs text-muted-foreground mt-1">
                Aprovadores de departamentos diferentes com o mesmo papel/ordem formam um grupo — qualquer um dos dois
                aprovando dispensa o outro.
              </p>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading && <Loader2 className="size-4 mr-2 animate-spin" />}
              {editing ? "Salvar" : "Criar"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
