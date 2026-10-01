import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  listDepartments,
  createDepartment,
  updateDepartment,
  deleteDepartment,
  type DepartmentRow,
} from "@/lib/departments.functions";
import { Panel } from "./primitives";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Trash2, Plus, Pencil, X } from "lucide-react";
import { ColaboradoresPanel } from "./ColaboradoresPanel";
import { usePermissions } from "@/lib/use-permissions";

const MODULE = "departamentos";

function splitEmails(raw: string): string[] {
  return raw
    .split(/[\s,;]+/)
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
}

function isValidEmail(e: string): boolean {
  return /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(e);
}

function EmailEditor({
  emails,
  onChange,
  disabled,
}: {
  emails: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = React.useState("");

  const add = () => {
    const candidates = splitEmails(draft);
    if (candidates.length === 0) return;
    const invalid = candidates.find((c) => !isValidEmail(c));
    if (invalid) {
      toast.error(`E-mail inválido: ${invalid}`);
      return;
    }
    const merged = Array.from(new Set([...emails, ...candidates]));
    if (merged.length > 20) {
      toast.error("Máximo de 20 e-mails por departamento");
      return;
    }
    onChange(merged);
    setDraft("");
  };

  const remove = (e: string) => onChange(emails.filter((x) => x !== e));

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              add();
            }
          }}
          placeholder="email@dominio.com (vírgula para múltiplos)"
          disabled={disabled}
          maxLength={500}
        />
        <Button type="button" variant="outline" onClick={add} disabled={disabled}>
          <Plus className="size-4" /> Adicionar
        </Button>
      </div>
      {emails.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {emails.map((e) => (
            <span
              key={e}
              className="inline-flex items-center gap-1 rounded-md border border-border bg-accent/40 px-2 py-0.5 text-xs"
            >
              {e}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => remove(e)}
                  className="text-muted-foreground hover:text-danger"
                  title="Remover"
                >
                  <X className="size-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

export function DepartamentosDashboard() {
  const qc = useQueryClient();
  const { can, isModuleAdmin, isAdmin } = usePermissions();

  const canCreate = isAdmin || isModuleAdmin(MODULE) || can(MODULE, "create") || can(MODULE, "manage");
  const canEdit = isAdmin || isModuleAdmin(MODULE) || can(MODULE, "edit") || can(MODULE, "manage");
  const canDelete = isAdmin || isModuleAdmin(MODULE) || can(MODULE, "delete") || can(MODULE, "manage");

  const fetchDepartments = useServerFn(listDepartments);
  const fnCreate = useServerFn(createDepartment);
  const fnUpdate = useServerFn(updateDepartment);
  const fnDelete = useServerFn(deleteDepartment);

  const [open, setOpen] = React.useState(false);
  const [name, setName] = React.useState("");
  const [desc, setDesc] = React.useState("");
  const [newEmails, setNewEmails] = React.useState<string[]>([]);
  const [editing, setEditing] = React.useState<DepartmentRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["departments-admin"],
    queryFn: async () => (await fetchDepartments()).departments,
  });

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["departments-admin"] });
    qc.invalidateQueries({ queryKey: ["departments"] });
  };

  const create = useMutation({
    mutationFn: () => fnCreate({ data: { name, description: desc || null, emails: newEmails } }),
    onSuccess: () => {
      toast.success("Departamento criado");
      setName("");
      setDesc("");
      setNewEmails([]);
      setOpen(false);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: (payload: { id: string; name: string; description: string | null; emails: string[] }) =>
      fnUpdate({ data: payload }),
    onSuccess: () => {
      toast.success("Departamento atualizado");
      setEditing(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: (id: string) => fnDelete({ data: { id } }),
    onSuccess: () => {
      toast.success("Departamento removido");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <Panel
        title={`Departamentos (${data?.length ?? 0})`}
        action={
          canCreate ? (
            <Button size="sm" onClick={() => setOpen(true)}>
              <Plus className="size-4" /> Novo departamento
            </Button>
          ) : undefined
        }
      >
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : (
          <div className="overflow-y-auto max-h-[600px]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background z-10">
                <tr className="text-mono-xs text-muted-foreground border-b border-border">
                  <th className="text-left p-2">Nome</th>
                  <th className="text-left p-2">Descrição</th>
                  <th className="text-left p-2">E-mails</th>
                  <th className="text-left p-2">Criado em</th>
                  <th className="w-24"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {data?.map((d) => (
                  <tr key={d.id} className="hover:bg-accent/40">
                    <td className="p-2 font-medium">{d.name}</td>
                    <td className="p-2 text-muted-foreground">{d.description ?? "—"}</td>
                    <td className="p-2">
                      {d.emails.length === 0 ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <span title={d.emails.join(", ")}>
                          {d.emails.length} e-mail{d.emails.length > 1 ? "s" : ""}
                        </span>
                      )}
                    </td>
                    <td className="p-2 font-mono text-xs">{d.created_at.slice(0, 10)}</td>
                    <td className="p-2">
                      <div className="flex items-center gap-1">
                        {canEdit && (
                          <button
                            onClick={() => setEditing(d)}
                            className="text-muted-foreground hover:text-foreground p-1"
                            title="Editar"
                          >
                            <Pencil className="size-4" />
                          </button>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => {
                              if (confirm(`Remover "${d.name}"?`)) remove.mutate(d.id);
                            }}
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
          </div>
        )}
      </Panel>

      <ColaboradoresPanel />

      {/* Dialog — Novo departamento */}
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) {
            setOpen(false);
            setName("");
            setDesc("");
            setNewEmails([]);
          }
        }}
      >
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Novo departamento</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              if (name.trim()) create.mutate();
            }}
          >
            <div className="grid gap-3 md:grid-cols-2">
              <div>
                <label className="text-mono-xs text-muted-foreground">Nome *</label>
                <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} required />
              </div>
              <div>
                <label className="text-mono-xs text-muted-foreground">Descrição</label>
                <Input value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={255} />
              </div>
            </div>
            <div>
              <label className="text-mono-xs text-muted-foreground">E-mails</label>
              <EmailEditor emails={newEmails} onChange={setNewEmails} />
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                type="button"
                onClick={() => {
                  setOpen(false);
                  setName("");
                  setDesc("");
                  setNewEmails([]);
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={create.isPending || !name.trim()}>
                {create.isPending ? "Salvando..." : "Criar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <EditDialog
        dept={editing}
        onClose={() => setEditing(null)}
        onSave={(payload) => update.mutate(payload)}
        saving={update.isPending}
      />
    </div>
  );
}

function EditDialog({
  dept,
  onClose,
  onSave,
  saving,
}: {
  dept: DepartmentRow | null;
  onClose: () => void;
  onSave: (p: { id: string; name: string; description: string | null; emails: string[] }) => void;
  saving: boolean;
}) {
  const [name, setName] = React.useState("");
  const [desc, setDesc] = React.useState("");
  const [emails, setEmails] = React.useState<string[]>([]);

  React.useEffect(() => {
    if (dept) {
      setName(dept.name);
      setDesc(dept.description ?? "");
      setEmails(dept.emails ?? []);
    }
  }, [dept]);

  return (
    <Dialog open={!!dept} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar departamento</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <label className="text-mono-xs text-muted-foreground">Nome *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </div>
          <div>
            <label className="text-mono-xs text-muted-foreground">Descrição</label>
            <Input value={desc} onChange={(e) => setDesc(e.target.value)} maxLength={255} />
          </div>
          <div>
            <label className="text-mono-xs text-muted-foreground">E-mails</label>
            <EmailEditor emails={emails} onChange={setEmails} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            disabled={saving || !name.trim() || !dept}
            onClick={() => dept && onSave({ id: dept.id, name: name.trim(), description: desc.trim() || null, emails })}
          >
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
