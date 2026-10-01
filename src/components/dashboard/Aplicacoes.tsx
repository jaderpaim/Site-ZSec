import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Loader2, Search, AppWindow, ArrowUp, ArrowDown, ChevronsUpDown } from "lucide-react";
import { KpiCard, Panel } from "./primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useDepartments } from "@/lib/use-departments";
import {
  listApplications,
  listApplicationsByDept,
  createApplication,
  updateApplication,
  deleteApplication,
  type ApplicationRow,
} from "@/lib/applications.functions";
import { usePermissions } from "@/lib/use-permissions";

const MODULE = "aplicacoes";

export function AplicacoesDashboard() {
  const qc = useQueryClient();
  const { can, isAdmin, isModuleAdmin } = usePermissions();
  const canCreate = isAdmin || isModuleAdmin(MODULE) || can(MODULE, "create") || can(MODULE, "manage");
  const canEdit = isAdmin || isModuleAdmin(MODULE) || can(MODULE, "edit") || can(MODULE, "manage");
  const canDelete = isAdmin || isModuleAdmin(MODULE) || can(MODULE, "delete") || can(MODULE, "manage");

  const fetchList = useServerFn(listApplicationsByDept);
  const createFn = useServerFn(createApplication);
  const updateFn = useServerFn(updateApplication);
  const deleteFn = useServerFn(deleteApplication);

  const { data: depts } = useDepartments();

  const { data, isLoading } = useQuery({
    queryKey: ["applications"],
    queryFn: async () => (await fetchList()).applications,
  });

  const [search, setSearch] = React.useState("");
  const [sortBy, setSortBy] = React.useState<"name" | "department_name" | "created_at">("name");
  const [sortDir, setSortDir] = React.useState<"asc" | "desc">("asc");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ApplicationRow | null>(null);
  const [confirmDelete, setConfirmDelete] = React.useState<ApplicationRow | null>(null);

  const [name, setName] = React.useState("");
  const [deptId, setDeptId] = React.useState("");

  React.useEffect(() => {
    if (dialogOpen) {
      setName(editing?.name ?? "");
      setDeptId(editing?.department_id ?? "");
    }
  }, [dialogOpen, editing]);

  const saveMut = useMutation({
    mutationFn: async () => {
      if (!name.trim() || !deptId) throw new Error("Preencha todos os campos.");
      if (editing) {
        await updateFn({ data: { id: editing.id, name: name.trim(), department_id: deptId } });
      } else {
        await createFn({ data: { name: name.trim(), department_id: deptId } });
      }
    },
    onSuccess: () => {
      toast.success(
        editing ? "Aplicação atualizada" : "Aplicação cadastrada e responsável atualizado nas vulnerabilidades",
      );
      qc.invalidateQueries({ queryKey: ["applications"] });
      setDialogOpen(false);
      setEditing(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const delMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Aplicação removida");
      qc.invalidateQueries({ queryKey: ["applications"] });
      setConfirmDelete(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = data ?? [];
  const filtered = React.useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = q
      ? rows.filter((r) => r.name.toLowerCase().includes(q) || (r.department_name ?? "").toLowerCase().includes(q))
      : rows;
    const dir = sortDir === "asc" ? 1 : -1;
    return [...matched].sort((a, b) => {
      if (sortBy === "created_at") {
        return (new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) * dir;
      }
      const av = (a[sortBy] ?? "").toString().toLowerCase();
      const bv = (b[sortBy] ?? "").toString().toLowerCase();
      return av.localeCompare(bv, "pt-BR") * dir;
    });
  }, [rows, search, sortBy, sortDir]);

  const toggleSort = (col: "name" | "department_name" | "created_at") => {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir("asc");
    }
  };

  const SortIcon = ({ col }: { col: "name" | "department_name" | "created_at" }) => {
    if (sortBy !== col) return <ChevronsUpDown className="size-3.5 opacity-40" />;
    return sortDir === "asc" ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />;
  };

  const total = rows.length;
  const distinctDepts = new Set(rows.map((r) => r.department_id)).size;
  const noMatch = rows.filter((r) => !r.has_match).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <KpiCard label="Total de Aplicações" value={total} accent="primary" />
        <KpiCard label="Departamentos com aplicações" value={distinctDepts} accent="success" />
        <KpiCard
          label="Aplicações sem match"
          value={noMatch}
          accent="warning"
          hint="Nome não encontrado nos FQDNs de vulnerabilidades"
        />
      </div>

      <Panel
        title={
          <span className="flex items-center gap-2">
            <AppWindow className="size-4" /> Aplicações
          </span>
        }
        action={
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="size-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Buscar por nome ou departamento"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 h-9 w-72"
              />
            </div>
            {canCreate && (
              <Button
                size="sm"
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                <Plus className="size-4 mr-1" /> Nova Aplicação
              </Button>
            )}
          </div>
        }
      >
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Nenhuma aplicação cadastrada.</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>
                  <button
                    type="button"
                    onClick={() => toggleSort("name")}
                    className="flex items-center gap-1 hover:text-foreground transition-colors"
                  >
                    Nome da Aplicação <SortIcon col="name" />
                  </button>
                </TableHead>
                <TableHead>
                  <button
                    type="button"
                    onClick={() => toggleSort("department_name")}
                    className="flex items-center gap-1 hover:text-foreground transition-colors"
                  >
                    Departamento <SortIcon col="department_name" />
                  </button>
                </TableHead>
                <TableHead>
                  <button
                    type="button"
                    onClick={() => toggleSort("created_at")}
                    className="flex items-center gap-1 hover:text-foreground transition-colors"
                  >
                    Cadastrado em <SortIcon col="created_at" />
                  </button>
                </TableHead>
                <TableHead className="w-[120px] text-right">Ações</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((r) => (
                <TableRow key={r.id}>
                  <TableCell className="font-medium">
                    <span className="flex items-center gap-2">
                      {r.name}
                      {!r.has_match && (
                        <span className="text-mono-xs px-1.5 py-0.5 rounded bg-warning/15 text-warning border border-warning/30">
                          sem match
                        </span>
                      )}
                    </span>
                  </TableCell>
                  <TableCell>{r.department_name ?? "—"}</TableCell>
                  <TableCell className="text-muted-foreground">
                    {new Date(r.created_at).toLocaleDateString("pt-BR")}
                  </TableCell>
                  <TableCell className="text-right">
                    {canEdit && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditing(r);
                          setDialogOpen(true);
                        }}
                      >
                        <Pencil className="size-4" />
                      </Button>
                    )}
                    {canDelete && (
                      <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(r)}>
                        <Trash2 className="size-4 text-danger" />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Panel>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editing ? "Editar Aplicação" : "Nova Aplicação"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Nome da Aplicação</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="ex: portal.empresa.com.br" />
              <p className="text-mono-xs text-muted-foreground">
                O nome deve corresponder exatamente ao FQDN registrado em Vulnerabilidades.
              </p>
            </div>
            <div className="space-y-2">
              <Label>Departamento</Label>
              <Select value={deptId} onValueChange={setDeptId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um departamento" />
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
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={() => saveMut.mutate()} disabled={saveMut.isPending}>
              {saveMut.isPending && <Loader2 className="size-4 mr-1 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!confirmDelete} onOpenChange={(o) => !o && setConfirmDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover aplicação?</AlertDialogTitle>
            <AlertDialogDescription>
              A aplicação <strong>{confirmDelete?.name}</strong> será removida. Os campos já preenchidos nas
              vulnerabilidades serão mantidos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => confirmDelete && delMut.mutate(confirmDelete.id)}>
              Remover
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
