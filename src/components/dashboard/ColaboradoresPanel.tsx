import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Panel } from "./primitives";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Trash2, Plus } from "lucide-react";
import { useDepartments } from "@/lib/use-departments";
import { usePermissions } from "@/lib/use-permissions";
import { useAuth } from "@/lib/auth-context";

const MODULE = "departamentos";

type Colab = {
  id: string;
  display_name: string;
  email: string;
  unidade: string | null;
  department_id: string | null;
  cargo: string | null;
};

export function ColaboradoresPanel() {
  const qc = useQueryClient();
  const { user } = useAuth();
  const { can, isAdmin, isModuleAdmin } = usePermissions();
  const canCreate = isAdmin || isModuleAdmin(MODULE) || can(MODULE, "create") || can(MODULE, "manage");
  const canDelete = isAdmin || isModuleAdmin(MODULE) || can(MODULE, "delete") || can(MODULE, "manage");
  const canViewAll = isAdmin || isModuleAdmin(MODULE) || can(MODULE, "manage");

  const { data: myDepartmentId } = useQuery({
    queryKey: ["my-profile-dept", user?.id],
    enabled: !!user && !canViewAll,
    queryFn: async () => {
      const { data } = await supabase.from("profiles").select("department_id").eq("id", user!.id).maybeSingle();
      return (data?.department_id as string | null) ?? null;
    },
  });

  const { data: depts } = useDepartments();
  const [open, setOpen] = React.useState(false);
  const [form, setForm] = React.useState({
    display_name: "",
    email: "",
    unidade: "",
    department_id: "",
    cargo: "",
  });

  const { data, isLoading } = useQuery({
    queryKey: ["colaboradores"],
    queryFn: async (): Promise<Colab[]> => {
      const PAGE = 1000;
      const all: Colab[] = [];
      let page = 0;
      while (true) {
        const { data, error } = await supabase
          .from("colaboradores")
          .select("id, display_name, email, unidade, department_id, cargo")
          .order("display_name")
          .range(page * PAGE, (page + 1) * PAGE - 1);
        if (error) throw error;
        if (!data || data.length === 0) break;
        all.push(...(data as Colab[]));
        if (data.length < PAGE) break;
        page++;
      }
      return all;
    },
  });

  const create = useMutation({
    mutationFn: async () => {
      const { error } = await supabase.from("colaboradores").insert({
        display_name: form.display_name.trim(),
        email: form.email.trim().toLowerCase(),
        unidade: form.unidade.trim() || null,
        department_id: form.department_id || null,
        cargo: form.cargo.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Colaborador adicionado");
      setForm({ display_name: "", email: "", unidade: "", department_id: "", cargo: "" });
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["colaboradores"] });
      qc.invalidateQueries({ queryKey: ["ia-ranking"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("colaboradores").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Colaborador removido");
      qc.invalidateQueries({ queryKey: ["colaboradores"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const deptNameById = new Map((depts ?? []).map((d) => [d.id, d.name]));

  const visibleData = canViewAll
    ? (data ?? [])
    : (data ?? []).filter((c) => c.department_id === (myDepartmentId ?? null));

  const closeDialog = () => {
    setOpen(false);
    setForm({ display_name: "", email: "", unidade: "", department_id: "", cargo: "" });
  };

  return (
    <>
      <Panel
        title={`Colaboradores (${visibleData.length})`}
        action={
          canCreate ? (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Novo colaborador
            </Button>
          ) : undefined
        }
      >
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : visibleData.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {canCreate
              ? 'Nenhum colaborador cadastrado. Use o botão acima ou importe via "Importar Dados".'
              : "Nenhum colaborador vinculado ao seu departamento."}
          </p>
        ) : (
          <div className="overflow-y-auto max-h-[600px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background z-10">
                <tr className="text-mono-xs text-muted-foreground border-b border-border">
                  <th className="text-left p-2">Display Name</th>
                  <th className="text-left p-2">E-mail</th>
                  <th className="text-left p-2">Unidade</th>
                  <th className="text-left p-2">Departamento</th>
                  <th className="text-left p-2">Cargo</th>
                  {canDelete && <th className="w-12"></th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {visibleData.map((c) => (
                  <tr key={c.id} className="hover:bg-accent/40">
                    <td className="p-2 font-medium">{c.display_name}</td>
                    <td className="p-2 text-muted-foreground">{c.email}</td>
                    <td className="p-2">{c.unidade ?? "—"}</td>
                    <td className="p-2">{c.department_id ? (deptNameById.get(c.department_id) ?? "—") : "—"}</td>
                    <td className="p-2">{c.cargo ?? "—"}</td>
                    {canDelete && (
                      <td className="p-2">
                        <button
                          onClick={() => {
                            if (confirm(`Remover "${c.display_name}"?`)) remove.mutate(c.id);
                          }}
                          className="text-muted-foreground hover:text-danger p-1"
                          title="Remover"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) closeDialog();
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo colaborador</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (!form.display_name.trim() || !form.email.trim()) {
                toast.error("Nome e e-mail são obrigatórios");
                return;
              }
              create.mutate();
            }}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-mono-xs text-muted-foreground">Display Name *</label>
                <Input
                  value={form.display_name}
                  onChange={(e) => setForm((f) => ({ ...f, display_name: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="text-mono-xs text-muted-foreground">E-mail *</label>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label className="text-mono-xs text-muted-foreground">Unidade</label>
                <Input value={form.unidade} onChange={(e) => setForm((f) => ({ ...f, unidade: e.target.value }))} />
              </div>
              <div>
                <label className="text-mono-xs text-muted-foreground">Departamento</label>
                <select
                  value={form.department_id}
                  onChange={(e) => setForm((f) => ({ ...f, department_id: e.target.value }))}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2 text-sm"
                >
                  <option value="">—</option>
                  {(depts ?? []).map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="md:col-span-2">
                <label className="text-mono-xs text-muted-foreground">Cargo</label>
                <Input value={form.cargo} onChange={(e) => setForm((f) => ({ ...f, cargo: e.target.value }))} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" type="button" onClick={closeDialog}>
                Cancelar
              </Button>
              <Button type="submit" disabled={create.isPending}>
                {create.isPending ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
