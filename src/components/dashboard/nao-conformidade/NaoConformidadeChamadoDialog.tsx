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
import { upsertNaoConformidadeChamado, type NaoConformidadeChamadoRow } from "@/lib/nao-conformidade.functions";

export function NaoConformidadeChamadoDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: NaoConformidadeChamadoRow | null;
}) {
  const qc = useQueryClient();
  const submit = useServerFn(upsertNaoConformidadeChamado);

  const [chamado, setChamado] = React.useState("");
  const [descricao, setDescricao] = React.useState("");
  const [dataAbertura, setDataAbertura] = React.useState("");
  const [responsavel, setResponsavel] = React.useState("");
  const [impacto, setImpacto] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setChamado(editing?.chamado ?? "");
      setDescricao(editing?.descricao ?? "");
      setDataAbertura(editing?.data_abertura ?? "");
      setResponsavel(editing?.responsavel ?? "");
      setImpacto(editing?.impacto ?? "");
    }
  }, [open, editing]);

  async function handleSubmit() {
    if (!chamado.trim()) return toast.error("Informe o chamado");

    setLoading(true);
    try {
      await submit({
        data: {
          id: editing?.id ?? null,
          chamado: chamado.trim(),
          descricao: descricao.trim() || null,
          data_abertura: dataAbertura || null,
          responsavel: responsavel.trim() || null,
          impacto: impacto.trim() || null,
        },
      });
      toast.success(editing ? "Chamado atualizado" : "Chamado criado");
      qc.invalidateQueries({ queryKey: ["nao-conformidade-chamados"] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar chamado");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar chamado" : "Novo chamado"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Chamado *</Label>
              <Input
                value={chamado}
                onChange={(e) => setChamado(e.target.value)}
                maxLength={200}
                placeholder="Ex.: INC-123456"
              />
            </div>
            <div>
              <Label>Data de Abertura</Label>
              <Input type="date" value={dataAbertura} onChange={(e) => setDataAbertura(e.target.value)} />
            </div>
          </div>

          <div>
            <Label>Descrição</Label>
            <Textarea
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              maxLength={2000}
              rows={3}
              placeholder="Descreva o chamado / o que foi solicitado"
            />
          </div>

          <div>
            <Label>Responsável (área / pessoa com o chamado)</Label>
            <Input
              value={responsavel}
              onChange={(e) => setResponsavel(e.target.value)}
              maxLength={300}
              placeholder="Ex.: Infraestrutura / Fulano"
            />
          </div>

          <div>
            <Label>Impacto nas entregas de SI</Label>
            <Textarea value={impacto} onChange={(e) => setImpacto(e.target.value)} maxLength={2000} rows={3} />
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
