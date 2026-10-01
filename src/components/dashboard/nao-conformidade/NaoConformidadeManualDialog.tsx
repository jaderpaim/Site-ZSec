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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  upsertNaoConformidadeManual,
  type NaoConformidadeManualRow,
} from "@/lib/nao-conformidade.functions";

const ACEITE_RISCO_OPTIONS = ["Não aplicável", "Pendente", "Aceito", "Não aceito"];

export function NaoConformidadeManualDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: NaoConformidadeManualRow | null;
}) {
  const qc = useQueryClient();
  const submit = useServerFn(upsertNaoConformidadeManual);

  const [plataforma, setPlataforma] = React.useState("");
  const [foraCompliance, setForaCompliance] = React.useState("");
  const [prazoResolucao, setPrazoResolucao] = React.useState("");
  const [observacoes, setObservacoes] = React.useState("");
  const [aceiteRisco, setAceiteRisco] = React.useState("");
  const [evidencias, setEvidencias] = React.useState("");
  const [impactos, setImpactos] = React.useState("");
  const [dataConfiguracao, setDataConfiguracao] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setPlataforma(editing?.plataforma ?? "");
      setForaCompliance(editing?.fora_compliance ?? "");
      setPrazoResolucao(editing?.prazo_resolucao ?? "");
      setObservacoes(editing?.observacoes ?? "");
      setAceiteRisco(editing?.aceite_risco ?? "");
      setEvidencias(editing?.evidencias ?? "");
      setImpactos(editing?.impactos ?? "");
      setDataConfiguracao(editing?.data_configuracao ?? "");
    }
  }, [open, editing]);

  async function handleSubmit() {
    if (!plataforma.trim()) return toast.error("Informe a plataforma");
    if (!foraCompliance.trim()) return toast.error("Informe o item fora de compliance");

    setLoading(true);
    try {
      await submit({
        data: {
          id: editing?.id ?? null,
          plataforma: plataforma.trim(),
          fora_compliance: foraCompliance.trim(),
          prazo_resolucao: prazoResolucao || null,
          observacoes: observacoes.trim() || null,
          aceite_risco: aceiteRisco || null,
          evidencias: evidencias.trim() || null,
          impactos: impactos.trim() || null,
          data_configuracao: dataConfiguracao || null,
        },
      });
      toast.success(editing ? "Registro atualizado" : "Registro criado");
      qc.invalidateQueries({ queryKey: ["nao-conformidades-manuais"] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar registro");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar não conformidade" : "Nova não conformidade"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 pt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Plataforma *</Label>
              <Input
                value={plataforma}
                onChange={(e) => setPlataforma(e.target.value)}
                maxLength={200}
              />
            </div>
            <div>
              <Label>Aceite de Risco</Label>
              <Select value={aceiteRisco} onValueChange={setAceiteRisco}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {ACEITE_RISCO_OPTIONS.map((o) => (
                    <SelectItem key={o} value={o}>
                      {o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div>
            <Label>Fora de Compliance *</Label>
            <Textarea
              value={foraCompliance}
              onChange={(e) => setForaCompliance(e.target.value)}
              maxLength={2000}
              rows={3}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Data de Configuração</Label>
              <Input
                type="date"
                value={dataConfiguracao}
                onChange={(e) => setDataConfiguracao(e.target.value)}
              />
            </div>
            <div>
              <Label>Prazo de Resolução</Label>
              <Input
                type="date"
                value={prazoResolucao}
                onChange={(e) => setPrazoResolucao(e.target.value)}
              />
            </div>
          </div>

          <div>
            <Label>Impactos</Label>
            <Textarea
              value={impactos}
              onChange={(e) => setImpactos(e.target.value)}
              maxLength={2000}
              rows={2}
            />
          </div>

          <div>
            <Label>Evidências</Label>
            <Textarea
              value={evidencias}
              onChange={(e) => setEvidencias(e.target.value)}
              maxLength={2000}
              rows={2}
            />
          </div>

          <div>
            <Label>Observações</Label>
            <Textarea
              value={observacoes}
              onChange={(e) => setObservacoes(e.target.value)}
              maxLength={2000}
              rows={2}
            />
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
