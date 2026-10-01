import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { Panel } from "../primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { usePermissions } from "@/lib/use-permissions";
import {
  listFornecedores,
  deleteFornecedor,
  updateFornecedorAlertDays,
} from "@/lib/fornecedores.functions";
import { FornecedorDialog, type FornecedorRow } from "./FornecedorDialog";

function fmtDate(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function daysToExpire(d: string | null): number | null {
  if (!d) return null;
  const [y, m, day] = d.split("-").map((n) => parseInt(n, 10));
  const target = new Date(Date.UTC(y, m - 1, day));
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  return Math.floor((target.getTime() - todayUtc) / 86400000);
}

export function FornecedoresOperationsTab() {
  const qc = useQueryClient();
  const { can, isAdmin, isModuleAdmin } = usePermissions();
  const canCreate = isAdmin || isModuleAdmin("fornecedores") || can("fornecedores", "create");
  const canEdit = isAdmin || isModuleAdmin("fornecedores") || can("fornecedores", "edit");
  const canDelete = isAdmin || isModuleAdmin("fornecedores") || can("fornecedores", "delete");

  const fetchList = useServerFn(listFornecedores);
  const deleteFn = useServerFn(deleteFornecedor);
  const updateAlertFn = useServerFn(updateFornecedorAlertDays);

  const { data, isLoading } = useQuery({
    queryKey: ["fornecedores"],
    queryFn: () => fetchList() as Promise<FornecedorRow[]>,
  });

  const [search, setSearch] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<FornecedorRow | null>(null);

  const rows = React.useMemo(() => {
    const list = data ?? [];
    const s = search.trim().toLowerCase();
    if (!s) return list;
    return list.filter(
      (r) =>
        r.nome.toLowerCase().includes(s) ||
        r.servico_prestado.toLowerCase().includes(s),
    );
  }, [data, search]);

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Fornecedor removido");
      qc.invalidateQueries({ queryKey: ["fornecedores"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateAlert = useMutation({
    mutationFn: (v: { id: string; alert_days: number }) => updateAlertFn({ data: v }),
    onSuccess: () => {
      toast.success("Alerta atualizado");
      qc.invalidateQueries({ queryKey: ["fornecedores"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <div className="space-y-6">
      <Panel
        title={`Fornecedores (${rows.length})`}
        action={
          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search className="size-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nome ou serviço"
                className="pl-8 h-8"
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
                <Plus className="size-4 mr-1" /> Novo fornecedor
              </Button>
            )}
          </div>
        }
      >
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Carregando...</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nenhum fornecedor cadastrado.
            {canCreate && ' Clique em "Novo fornecedor" para começar.'}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-mono-xs text-muted-foreground border-b border-border">
                <th className="text-left p-2">Nome</th>
                <th className="text-left p-2">Serviço prestado</th>
                <th className="text-left p-2">Data de contratação</th>
                <th className="text-left p-2">Data de expiração</th>
                <th className="text-right p-2">Dias p/ vencer</th>
                <th className="text-center p-2">Alerta (dias)</th>
                <th className="w-24"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((r) => {
                const days = daysToExpire(r.data_expiracao);
                const daysCls =
                  days === null ? "text-muted-foreground"
                  : days < 0 ? "text-danger font-semibold"
                  : days <= (r.alert_days ?? 30) ? "text-danger font-semibold"
                  : days <= 60 ? "text-warning font-medium"
                  : "text-foreground";
                return (
                  <tr key={r.id} className="hover:bg-accent/40">
                    <td className="p-2 font-medium">{r.nome}</td>
                    <td className="p-2 text-muted-foreground">{r.servico_prestado}</td>
                    <td className="p-2 font-mono text-xs">{fmtDate(r.data_contratacao)}</td>
                    <td className="p-2 font-mono text-xs">{fmtDate(r.data_expiracao)}</td>
                    <td className={`p-2 font-mono text-xs text-right ${daysCls}`}>
                      {days === null ? "—" : days < 0 ? `Vencido há ${Math.abs(days)}d` : `${days}d`}
                    </td>
                    <td className="p-2 text-center">
                      {canEdit ? (
                        <Input
                          type="number"
                          min={1}
                          max={365}
                          defaultValue={r.alert_days ?? 30}
                          onBlur={(e) => {
                            const v = parseInt(e.target.value, 10);
                            if (v && v !== r.alert_days) updateAlert.mutate({ id: r.id, alert_days: v });
                          }}
                          className="h-7 w-16 text-xs text-center mx-auto"
                        />
                      ) : (
                        <span className="text-xs">{r.alert_days ?? 30}</span>
                      )}
                    </td>
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
                            onClick={() => {
                              if (confirm(`Remover fornecedor "${r.nome}"?`)) del.mutate(r.id);
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
                );
              })}
            </tbody>
          </table>
        )}
      </Panel>

      <FornecedorDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
    </div>
  );
}
