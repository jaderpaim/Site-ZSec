import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/lib/auth-context";
import { useDepartments } from "@/lib/use-departments";
import { upsertFornecedor } from "@/lib/fornecedores.functions";

export type FornecedorRow = {
  id: string;
  nome: string;
  servico_prestado: string;
  data_contratacao: string;
  data_expiracao: string | null;
  department_id: string | null;
  department_name: string | null;
  alert_days: number;
  last_alert_sent_at: string | null;
};

export function FornecedorDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: FornecedorRow | null;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const submit = useServerFn(upsertFornecedor);
  const { data: depts } = useDepartments();

  const [nome, setNome] = React.useState("");
  const [servico, setServico] = React.useState("");
  const [dataContratacao, setDataContratacao] = React.useState("");
  const [dataExpiracao, setDataExpiracao] = React.useState("");
  const [departmentId, setDepartmentId] = React.useState("");
  const [alertDays, setAlertDays] = React.useState(30);
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setNome(editing?.nome ?? "");
      setServico(editing?.servico_prestado ?? "");
      setDataContratacao(editing?.data_contratacao ?? "");
      setDataExpiracao(editing?.data_expiracao ?? "");
      setDepartmentId(editing?.department_id ?? "");
      setAlertDays(editing?.alert_days ?? 30);
    }
  }, [open, editing]);

  async function handleSubmit() {
    if (!nome.trim()) return toast.error("Informe o nome");
    if (!servico.trim()) return toast.error("Informe o serviço prestado");
    if (!dataContratacao) return toast.error("Informe a data de contratação");

    setLoading(true);
    try {
      await submit({
        data: {
          id: editing?.id ?? null,
          nome: nome.trim(),
          servico_prestado: servico.trim(),
          data_contratacao: dataContratacao,
          data_expiracao: dataExpiracao || null,
          department_id: departmentId || null,
          alert_days: alertDays,
          created_by: user?.id ?? null,
        },
      });
      toast.success(editing ? "Fornecedor atualizado" : "Fornecedor criado");
      qc.invalidateQueries({ queryKey: ["fornecedores"] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar fornecedor");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar fornecedor" : "Novo fornecedor"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          <div>
            <Label>Nome *</Label>
            <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={200} />
          </div>
          <div>
            <Label>Serviço prestado *</Label>
            <Textarea value={servico} onChange={(e) => setServico(e.target.value)} maxLength={500} rows={3} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Data de contratação *</Label>
              <Input type="date" value={dataContratacao} onChange={(e) => setDataContratacao(e.target.value)} />
            </div>
            <div>
              <Label>Data de expiração</Label>
              <Input type="date" value={dataExpiracao} onChange={(e) => setDataExpiracao(e.target.value)} />
            </div>

            <div>
              <Label>Alerta (dias antes do vencimento)</Label>
              <Input
                type="number"
                min={1}
                max={365}
                value={alertDays}
                onChange={(e) => setAlertDays(parseInt(e.target.value, 10) || 30)}
              />
            </div>
          </div>

          <div>
            <Label>Departamento</Label>
            <Select value={departmentId} onValueChange={setDepartmentId}>
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
            <p className="text-mono-xs text-muted-foreground mt-1">
              Os e-mails deste departamento recebem o alerta de vencimento (junto aos administradores).
            </p>
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
