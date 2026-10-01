import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
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
import { cn } from "@/lib/utils";
import { upsertCmdbAtivo, listCmdbDepartamentos, type CmdbAtivo } from "@/lib/cmdb.functions";
import { CRITICIDADE_META, type Criticidade, type CmdbStatus } from "./CmdbBadges";

const TIPOS_PRE = [
  "Servidor",
  "Switch",
  "Roteador",
  "Firewall",
  "Storage",
  "Software",
  "Notebook",
  "Desktop",
  "Impressora",
  "Outro",
];

const SISTEMAS_OPERACIONAIS_PRE = [
  "Windows Server",
  "Windows",
  "Ubuntu Server",
  "Debian",
  "Red Hat Enterprise Linux",
  "CentOS",
  "FreeBSD",
  "Fortigate",
  "Outro",
];

const CRITICIDADES: Criticidade[] = ["Baixo", "Médio", "Alto", "Crítico"];
const STATUSES: CmdbStatus[] = ["Ativo", "Em manutenção", "Desativado"];

const STATUS_BTN: Record<CmdbStatus, { active: string }> = {
  Ativo: { active: "ring-emerald-500 bg-emerald-500/15 text-emerald-400 border-emerald-500/40" },
  "Em manutenção": { active: "ring-amber-500 bg-amber-500/15 text-amber-400 border-amber-500/40" },
  Desativado: { active: "ring-muted-foreground bg-muted text-foreground border-border" },
};

const CRITICIDADE_BTN: Record<Criticidade, string> = {
  Baixo: "ring-emerald-500 bg-emerald-500/15 text-emerald-400 border-emerald-500/40",
  Médio: "ring-blue-500 bg-blue-500/15 text-blue-400 border-blue-500/40",
  Alto: "ring-amber-500 bg-amber-500/15 text-amber-400 border-amber-500/40",
  Crítico: "ring-red-500 bg-red-500/15 text-red-400 border-red-500/40",
};

export function CmdbFormDialog({
  open,
  onOpenChange,
  editing,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: CmdbAtivo | null;
}) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const submit = useServerFn(upsertCmdbAtivo);
  const fetchDepartamentos = useServerFn(listCmdbDepartamentos);

  const { data: departamentos } = useQuery({
    queryKey: ["cmdb", "departamentos"],
    queryFn: () => fetchDepartamentos(),
    enabled: open,
  });

  const [nome, setNome] = React.useState("");
  const [tipoSel, setTipoSel] = React.useState("Servidor");
  const [tipoLivre, setTipoLivre] = React.useState("");
  const [ipHostname, setIpHostname] = React.useState("");
  const [fabModelo, setFabModelo] = React.useState("");
  const [soSel, setSoSel] = React.useState<string>("");
  const [soLivre, setSoLivre] = React.useState("");
  const [departamentoId, setDepartamentoId] = React.useState<string>("");
  const [localizacao, setLocalizacao] = React.useState("");
  const [criticidade, setCriticidade] = React.useState<Criticidade>("Médio");
  const [status, setStatus] = React.useState<CmdbStatus>("Ativo");
  const [observacoes, setObservacoes] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setNome(editing?.nome ?? "");
    const isPre = editing ? TIPOS_PRE.includes(editing.tipo) : true;
    setTipoSel(editing ? (isPre ? editing.tipo : "Outro") : "Servidor");
    setTipoLivre(editing && !isPre ? editing.tipo : "");
    setIpHostname(editing?.ip_hostname ?? "");
    setFabModelo(editing?.fabricante_modelo ?? "");
    const so = editing?.sistema_operacional ?? "";
    const isSoPre = so ? SISTEMAS_OPERACIONAIS_PRE.includes(so) : false;
    setSoSel(so ? (isSoPre ? so : "Outro") : "");
    setSoLivre(so && !isSoPre ? so : "");
    setDepartamentoId(editing?.departamento_id ?? "");
    setLocalizacao(editing?.localizacao ?? "");
    setCriticidade((editing?.criticidade as Criticidade) ?? "Médio");
    setStatus((editing?.status as CmdbStatus) ?? "Ativo");
    setObservacoes(editing?.observacoes ?? "");
  }, [open, editing]);

  // Novo ativo: pré-seleciona "Infraestrutura" assim que os departamentos carregam (mantém editável)
  React.useEffect(() => {
    if (!open || editing) return;
    if (departamentoId) return;
    const infra = (departamentos ?? []).find((d) => d.name.trim().toLowerCase() === "infraestrutura");
    if (infra) setDepartamentoId(infra.id);
  }, [open, editing, departamentos, departamentoId]);

  async function handleSubmit() {
    const tipoFinal = tipoSel === "Outro" ? tipoLivre.trim() : tipoSel;
    const sistemaOperacionalFinal = soSel === "Outro" ? soLivre.trim() : soSel;
    if (!nome.trim()) return toast.error("Informe o nome do ativo");
    if (!tipoFinal) return toast.error("Informe o tipo do ativo");
    if (!departamentoId) return toast.error("Selecione o departamento");
    if (!localizacao.trim()) return toast.error("Informe a localização");

    setLoading(true);
    try {
      await submit({
        data: {
          id: editing?.id ?? null,
          nome: nome.trim(),
          tipo: tipoFinal,
          ip_hostname: ipHostname || null,
          fabricante_modelo: fabModelo || null,
          sistema_operacional: sistemaOperacionalFinal || null,
          departamento_id: departamentoId,
          localizacao: localizacao.trim(),
          criticidade,
          status,
          observacoes: observacoes || null,
          created_by: user?.id ?? null,
        },
      });
      toast.success("Ativo salvo com sucesso");
      qc.invalidateQueries({ queryKey: ["cmdb", "ativos"] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar ativo");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar ativo" : "Novo ativo"}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Nome do ativo *</Label>
              <Input value={nome} onChange={(e) => setNome(e.target.value)} maxLength={200} placeholder="SRV-PROD-01" />
            </div>
            <div>
              <Label>Tipo *</Label>
              <Select value={tipoSel} onValueChange={setTipoSel}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TIPOS_PRE.map((t) => (
                    <SelectItem key={t} value={t}>
                      {t}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {tipoSel === "Outro" && (
                <Input
                  className="mt-2"
                  placeholder="Digite o tipo"
                  value={tipoLivre}
                  onChange={(e) => setTipoLivre(e.target.value)}
                  maxLength={100}
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>IP / Hostname</Label>
              <Input
                value={ipHostname}
                onChange={(e) => setIpHostname(e.target.value)}
                maxLength={255}
                className="font-mono"
                placeholder="10.0.0.10"
              />
            </div>
            <div>
              <Label>Fabricante / Modelo</Label>
              <Input
                value={fabModelo}
                onChange={(e) => setFabModelo(e.target.value)}
                maxLength={255}
                placeholder="Dell / PowerEdge R740"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Sistema Operacional</Label>
              <Select value={soSel} onValueChange={setSoSel}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {SISTEMAS_OPERACIONAIS_PRE.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {soSel === "Outro" && (
                <Input
                  className="mt-2"
                  placeholder="Digite o sistema operacional"
                  value={soLivre}
                  onChange={(e) => setSoLivre(e.target.value)}
                  maxLength={255}
                />
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Label>Departamento *</Label>
              <Select value={departamentoId} onValueChange={setDepartamentoId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione" />
                </SelectTrigger>
                <SelectContent>
                  {(departamentos ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Localização / Ambiente *</Label>
              <Input
                value={localizacao}
                onChange={(e) => setLocalizacao(e.target.value)}
                maxLength={255}
                placeholder="Datacenter SP"
              />
            </div>
          </div>

          <div>
            <Label>Criticidade *</Label>
            <div className="grid grid-cols-4 gap-2 mt-1">
              {CRITICIDADES.map((c) => {
                const active = criticidade === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setCriticidade(c)}
                    className={cn(
                      "rounded-md border px-3 py-2 text-sm font-medium transition-all",
                      active
                        ? `ring-2 ring-offset-2 ring-offset-background ${CRITICIDADE_BTN[c]}`
                        : `${CRITICIDADE_META[c].badge} opacity-70 hover:opacity-100`,
                    )}
                  >
                    {c}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label>Status *</Label>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {STATUSES.map((s) => {
                const active = status === s;
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setStatus(s)}
                    className={cn(
                      "rounded-md border px-3 py-2 text-sm font-medium transition-all",
                      active
                        ? `ring-2 ring-offset-2 ring-offset-background ${STATUS_BTN[s].active}`
                        : "bg-muted/30 text-muted-foreground border-border hover:bg-muted/50",
                    )}
                  >
                    {s}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <Label>Observações</Label>
            <Textarea value={observacoes} onChange={(e) => setObservacoes(e.target.value)} maxLength={2000} rows={3} />
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
