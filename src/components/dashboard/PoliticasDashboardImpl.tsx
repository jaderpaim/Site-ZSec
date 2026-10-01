import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  GraduationCap,
  Loader2,
  Maximize2,
  Minimize2,
  GripHorizontal,
  Pencil,
  Search,
  X,
  ExternalLink,
} from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  AreaChart,
  Area,
  Legend,
} from "recharts";
import { Panel, KpiCard, Badge } from "./primitives";
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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { usePermissions } from "@/lib/use-permissions";
import { listPolicies, createPolicy, updatePolicy, deletePolicy } from "@/lib/policies.functions";

const STATUSES = ["Publicada", "Em Validação", "Revisão"] as const;

// Cores padrão do dashboard (idêntico ao Vulnerabilidades/Sophos/Cloudflare)
const C = {
  primary: "oklch(0.66 0.18 254)",
  success: "oklch(0.70 0.16 160)",
  warning: "oklch(0.78 0.16 75)",
  danger: "oklch(0.65 0.22 25)",
  muted: "oklch(0.55 0.01 250)",
};

// ResizableChart — padrão visual idêntico ao Vulnerabilidades
const COL_SIZES_POL = ["col-span-1", "col-span-2", "col-span-3"] as const;
type ColSizePol = (typeof COL_SIZES_POL)[number];

function ResizableChart({
  title,
  children,
  chartHeight = 260,
  defaultSize = "col-span-1",
}: {
  title: string;
  children: React.ReactNode;
  chartHeight?: number;
  defaultSize?: ColSizePol;
}) {
  const [colSize, setColSize] = React.useState<ColSizePol>(defaultSize);
  function grow() {
    const idx = COL_SIZES_POL.indexOf(colSize);
    if (idx < COL_SIZES_POL.length - 1) setColSize(COL_SIZES_POL[idx + 1]);
  }
  function shrink() {
    const idx = COL_SIZES_POL.indexOf(colSize);
    if (idx > 0) setColSize(COL_SIZES_POL[idx - 1]);
  }
  return (
    <div
      className={`${colSize} bg-card rounded-lg border border-border shadow-sm flex flex-col min-h-[200px] group transition-all duration-150`}
      style={{ resize: "vertical", overflow: "auto" }}
    >
      <div className="flex items-center justify-between px-4 py-2 bg-muted/40 border-b border-border cursor-grab active:cursor-grabbing select-none text-xs font-semibold text-muted-foreground hover:bg-muted/60 transition-colors flex-shrink-0">
        <div className="flex items-center gap-2">
          <GripHorizontal className="size-3.5 opacity-50" />
          <span>{title}</span>
        </div>
        <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={shrink}
            disabled={colSize === COL_SIZES_POL[0]}
            title="Diminuir largura"
            className="p-0.5 hover:bg-background rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <Minimize2 className="size-3" />
          </button>
          <button
            onClick={grow}
            disabled={colSize === COL_SIZES_POL[COL_SIZES_POL.length - 1]}
            title="Aumentar largura"
            className="p-0.5 hover:bg-background rounded text-muted-foreground hover:text-foreground disabled:opacity-30"
          >
            <Maximize2 className="size-3" />
          </button>
        </div>
      </div>
      <div className="p-4 flex-1">
        <ResponsiveContainer width="100%" height={chartHeight}>
          {children as React.ReactElement}
        </ResponsiveContainer>
      </div>
    </div>
  );
}
type Status = (typeof STATUSES)[number];

type Policy = {
  id: string;
  name: string;
  status: Status;
  tipo?: "Política" | "Processo" | null;
  onda: string | null;
  indicador: string | null;
  publicacao: string | null;
  revisao: string | null;
  trained_count: number;
  target_count: number;
};

function statusTone(s: Status): "success" | "warning" | "info" {
  if (s === "Publicada") return "success";
  if (s === "Em Validação") return "warning";
  return "info";
}

function pctTone(pct: number | null): "success" | "warning" | "danger" | "muted" {
  if (pct == null) return "muted";
  if (pct >= 80) return "success";
  if (pct >= 50) return "warning";
  return "danger";
}

function fmtDate(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("T")[0].split("-");
  return `${day}/${m}/${y.slice(2)}`;
}

const emptyForm = {
  name: "",
  status: "Revisão" as Status,
  tipo: "Política" as "Política" | "Processo",
  indicador: "",
  publicacao: "",
  revisao: "",
  trained_count: 0,
  target_count: 0,
};

export function PoliticasDashboardImpl() {
  const qc = useQueryClient();
  const { can, isAdmin } = usePermissions();
  const canCreate = isAdmin || can("politicas", "create");
  const canEdit = isAdmin || can("politicas", "edit");
  const canDelete = isAdmin || can("politicas", "delete");

  const listFn = useServerFn(listPolicies);
  const createFn = useServerFn(createPolicy);
  const updateFn = useServerFn(updatePolicy);
  const deleteFn = useServerFn(deletePolicy);

  const { data, isLoading } = useQuery({
    queryKey: ["policies"],
    queryFn: () => listFn(),
  });
  const policies: Policy[] = (data?.policies ?? []) as unknown as Policy[];

  const invalidate = () => qc.invalidateQueries({ queryKey: ["policies"] });

  const updateMut = useMutation({
    mutationFn: (vars: { id: string; patch: Partial<Policy> }) =>
      updateFn({ data: { id: vars.id, patch: vars.patch as any } }),
    onSuccess: (_, vars) => {
      invalidate();
      const tipo = editTarget?.tipo ?? vars.patch?.tipo ?? "Política";
      toast.success(tipo === "Processo" ? "Processo atualizado" : "Política atualizada");
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao atualizar"),
  });
  const createMut = useMutation({
    mutationFn: (payload: any) => createFn({ data: payload }),
    onSuccess: (_, vars) => {
      invalidate();
      toast.success(vars.tipo === "Processo" ? "Processo criado" : "Política criada");
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao criar"),
  });
  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      invalidate();
      const tipo = deleteTarget?.tipo ?? "Política";
      toast.success(tipo === "Processo" ? "Processo excluído" : "Política excluída");
    },
    onError: (e: any) => toast.error(e?.message ?? "Erro ao excluir"),
  });

  const [createOpen, setCreateOpen] = React.useState(false);
  const [detailSearch, setDetailSearch] = React.useState("");
  const [detailTipoFilter, setDetailTipoFilter] = React.useState<"Todos" | "Política" | "Processo">("Todos");
  const [form, setForm] = React.useState(emptyForm);
  const [trainingFor, setTrainingFor] = React.useState<Policy | null>(null);
  const [trainingForm, setTrainingForm] = React.useState({ trained_count: 0, target_count: 0 });
  const [deleteTarget, setDeleteTarget] = React.useState<Policy | null>(null);
  const [editTarget, setEditTarget] = React.useState<Policy | null>(null);
  const [editForm, setEditForm] = React.useState(emptyForm);

  function openEdit(p: Policy) {
    setEditTarget(p);
    setEditForm({
      name: p.name,
      status: p.status,
      tipo: p.tipo ?? "Política",
      indicador: p.indicador ?? "",
      publicacao: p.publicacao ?? "",
      revisao: p.revisao ?? "",
      trained_count: p.trained_count,
      target_count: p.target_count,
    });
  }

  function submitEdit() {
    if (!editTarget || !editForm.name.trim()) {
      toast.error("Informe o nome");
      return;
    }
    updateMut.mutate(
      {
        id: editTarget.id,
        patch: {
          name: editForm.name.trim(),
          status: editForm.status,
          tipo: editForm.tipo,
          indicador: editForm.indicador || null,
          publicacao: editForm.publicacao || null,
          revisao: editForm.revisao || null,
          trained_count: Number(editForm.trained_count) || 0,
          target_count: Number(editForm.target_count) || 0,
        } as any,
      },
      { onSuccess: () => setEditTarget(null) },
    );
  }

  const kpis = React.useMemo(() => {
    const c = { Publicada: 0, "Em Validação": 0, Revisão: 0 } as Record<Status, number>;
    for (const p of policies) c[p.status] = (c[p.status] ?? 0) + 1;
    return c;
  }, [policies]);

  const filteredPolicies = React.useMemo(() => {
    return policies.filter((p) => {
      const matchTipo =
        detailTipoFilter === "Todos" ||
        (detailTipoFilter === "Política" ? (p.tipo ?? "Política") === "Política" : p.tipo === "Processo");
      const matchSearch =
        detailSearch.trim() === "" || p.name.toLowerCase().includes(detailSearch.trim().toLowerCase());
      return matchTipo && matchSearch;
    });
  }, [policies, detailTipoFilter, detailSearch]);

  function openCreate() {
    setForm(emptyForm);
    setCreateOpen(true);
  }

  function submitCreate() {
    if (!form.name.trim()) {
      toast.error(form.tipo === "Processo" ? "Informe o nome do processo" : "Informe o nome da política");
      return;
    }
    createMut.mutate(
      {
        name: form.name.trim(),
        status: form.status,
        tipo: form.tipo,
        onda: null,
        indicador: form.indicador || null,
        publicacao: form.publicacao || null,
        revisao: form.revisao || null,
        trained_count: Number(form.trained_count) || 0,
        target_count: Number(form.target_count) || 0,
      },
      { onSuccess: () => setCreateOpen(false) },
    );
  }

  function openTraining(p: Policy) {
    setTrainingFor(p);
    setTrainingForm({ trained_count: p.trained_count, target_count: p.target_count });
  }

  function submitTraining() {
    if (!trainingFor) return;
    updateMut.mutate(
      {
        id: trainingFor.id,
        patch: {
          trained_count: Number(trainingForm.trained_count) || 0,
          target_count: Number(trainingForm.target_count) || 0,
        },
      },
      { onSuccess: () => setTrainingFor(null) },
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-muted/30 border border-border p-4 rounded-md flex flex-col items-center justify-center text-center gap-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
            Políticas Publicadas
          </span>
          <span className="text-2xl font-bold font-mono" style={{ color: C.success }}>
            {kpis.Publicada}
          </span>
        </div>
        <div className="bg-muted/30 border border-border p-4 rounded-md flex flex-col items-center justify-center text-center gap-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Em Validação</span>
          <span className="text-2xl font-bold font-mono" style={{ color: C.warning }}>
            {kpis["Em Validação"]}
          </span>
        </div>
        <div className="bg-muted/30 border border-border p-4 rounded-md flex flex-col items-center justify-center text-center gap-1">
          <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Revisão</span>
          <span className="text-2xl font-bold font-mono" style={{ color: C.muted }}>
            {kpis["Revisão"]}
          </span>
        </div>
      </div>

      {/* Gráfico evolutivo de treinamentos por mês de publicação */}
      {(() => {
        // Agrupa políticas por mês de publicação e acumula trained/target
        const byMonth: Record<string, { trained: number; target: number }> = {};
        for (const p of policies) {
          if (!p.publicacao) continue;
          const mes = p.publicacao.slice(0, 7); // "YYYY-MM"
          if (!byMonth[mes]) byMonth[mes] = { trained: 0, target: 0 };
          byMonth[mes].trained += p.trained_count;
          byMonth[mes].target += p.target_count;
        }
        // Acumula em ordem cronológica
        const sorted = Object.keys(byMonth).sort();
        let accTrained = 0;
        let accTarget = 0;
        const chartData = sorted.map((mes) => {
          accTrained += byMonth[mes].trained;
          accTarget += byMonth[mes].target;
          const pctTreinados = accTarget > 0 ? Math.round((accTrained * 100) / accTarget) : 0;
          const [y, m] = mes.split("-");
          return {
            mes: `${m}/${y.slice(2)}`,
            "Treinados (%)": pctTreinados,
            "Não Treinados (%)": 100 - pctTreinados,
            _trained: accTrained,
            _target: accTarget,
          };
        });
        if (chartData.length === 0) return null;
        return (
          <div className="grid grid-cols-3 gap-6">
            <ResizableChart
              title="Evolução de Treinamentos — % Treinados vs Não Treinados (acumulado por publicação)"
              chartHeight={260}
              defaultSize="col-span-3"
            >
              <AreaChart data={chartData} margin={{ left: 8, right: 32, top: 12, bottom: 8 }}>
                <defs>
                  <linearGradient id="gradTreinados" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.success} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={C.success} stopOpacity={0.03} />
                  </linearGradient>
                  <linearGradient id="gradNaoTreinados" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.danger} stopOpacity={0.35} />
                    <stop offset="95%" stopColor={C.danger} stopOpacity={0.03} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.30 0.014 250)" />
                <XAxis dataKey="mes" stroke="oklch(0.66 0.02 250)" fontSize={11} />
                <YAxis
                  domain={[0, 100]}
                  tickFormatter={(v: number) => `${v}%`}
                  stroke="oklch(0.66 0.02 250)"
                  fontSize={11}
                  width={40}
                />
                <Tooltip
                  contentStyle={{
                    background: "oklch(0.20 0.014 250)",
                    border: "1px solid oklch(0.30 0.014 250)",
                    borderRadius: 6,
                    fontSize: 12,
                    color: "oklch(0.96 0.005 250)",
                  }}
                  formatter={(value: any, name: any, item: any) => {
                    const p = item?.payload;
                    if (name === "Treinados (%)") return [`${value}% (${p?._trained ?? 0} pessoas)`, name];
                    return [`${value}% (${(p?._target ?? 0) - (p?._trained ?? 0)} pessoas)`, name];
                  }}
                />
                <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} />
                <Area
                  type="monotone"
                  dataKey="Treinados (%)"
                  stroke={C.success}
                  strokeWidth={2.5}
                  fill="url(#gradTreinados)"
                  dot={{ r: 4, fill: C.success, strokeWidth: 0 }}
                  activeDot={{ r: 6 }}
                />
                <Area
                  type="monotone"
                  dataKey="Não Treinados (%)"
                  stroke={C.danger}
                  strokeWidth={2.5}
                  fill="url(#gradNaoTreinados)"
                  dot={{ r: 4, fill: C.danger, strokeWidth: 0 }}
                  activeDot={{ r: 6 }}
                />
              </AreaChart>
            </ResizableChart>
          </div>
        );
      })()}

      <Panel
        title="Detalhamento de Políticas e Processos"
        action={
          canCreate ? (
            <Button size="sm" onClick={() => openCreate()}>
              <Plus className="h-4 w-4" /> Nova Política/Processo
            </Button>
          ) : null
        }
      >
        {/* Filter bar */}
        <div className="flex items-center gap-2 mb-4">
          <div className="relative flex-1 max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Buscar por nome..."
              value={detailSearch}
              onChange={(e) => setDetailSearch(e.target.value)}
              className="w-full h-8 pl-8 pr-7 text-xs rounded-md border border-border bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {detailSearch && (
              <button
                onClick={() => setDetailSearch("")}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 rounded-md border border-border bg-muted/30 p-0.5">
            {(["Todos", "Política", "Processo"] as const).map((opt) => (
              <button
                key={opt}
                onClick={() => setDetailTipoFilter(opt)}
                className={`px-2.5 py-1 text-xs rounded font-medium transition-colors ${
                  detailTipoFilter === opt
                    ? "bg-background text-foreground shadow-sm"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {opt === "Todos" ? "Todos" : opt === "Política" ? "Políticas" : "Processos"}
              </button>
            ))}
          </div>
          {(detailSearch || detailTipoFilter !== "Todos") && (
            <span className="text-xs text-muted-foreground font-mono">
              {filteredPolicies.length} resultado{filteredPolicies.length !== 1 ? "s" : ""}
            </span>
          )}
          <Button
            size="sm"
            variant="outline"
            className="ml-auto"
            onClick={() =>
              window.open(
                "https://bernoullieducacao.learningflix.net/local/trails/14/",
                "_blank",
                "noopener,noreferrer",
              )
            }
          >
            <ExternalLink className="h-4 w-4" /> Treinamentos Políticas SI
          </Button>
        </div>
        {isLoading ? (
          <div className="flex items-center justify-center py-10 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
          </div>
        ) : (
          <div className="overflow-y-auto max-h-[480px]">
            <table className="w-full text-sm border-collapse">
              <thead className="sticky top-0 z-10 bg-background border-b border-border">
                <tr className="text-mono-xs text-muted-foreground bg-background">
                  <th className="text-left px-3 py-2 font-medium">Nome</th>
                  <th className="text-left px-3 py-2 font-medium">Tipo</th>
                  <th className="text-left px-3 py-2 font-medium">Status</th>
                  <th className="text-left px-3 py-2 font-medium">% Treinados</th>
                  <th className="text-left px-3 py-2 font-medium">Indicador</th>
                  <th className="text-left px-3 py-2 font-medium">Publicação</th>
                  <th className="text-left px-3 py-2 font-medium">Revisão</th>
                  <th className="text-right px-3 py-2 font-medium">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredPolicies.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-muted-foreground">
                      {policies.length === 0
                        ? "Nenhuma política ou processo cadastrado."
                        : "Nenhum resultado encontrado para o filtro aplicado."}
                    </td>
                  </tr>
                )}
                {filteredPolicies.map((p) => {
                  const pct = p.target_count > 0 ? Math.round((p.trained_count * 100) / p.target_count) : null;
                  return (
                    <tr key={p.id} className="hover:bg-accent/40">
                      <td className="px-3 py-2.5 font-medium">{p.name}</td>
                      <td className="px-3 py-2.5">
                        {canEdit ? (
                          <Select
                            value={p.tipo ?? "Política"}
                            onValueChange={(v) =>
                              updateMut.mutate({ id: p.id, patch: { tipo: v as "Política" | "Processo" } })
                            }
                          >
                            <SelectTrigger
                              className={`h-7 w-[110px] text-xs border font-mono ${
                                (p.tipo ?? "Política") === "Processo"
                                  ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                                  : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                              }`}
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Política">Política</SelectItem>
                              <SelectItem value="Processo">Processo</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-mono ${
                              (p.tipo ?? "Política") === "Processo"
                                ? "bg-purple-500/10 text-purple-400 border-purple-500/20"
                                : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                            }`}
                          >
                            {p.tipo ?? "Política"}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        {canEdit ? (
                          <Select
                            value={p.status}
                            onValueChange={(v) => updateMut.mutate({ id: p.id, patch: { status: v as Status } })}
                          >
                            <SelectTrigger className="h-7 w-[140px] text-xs">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {STATUSES.map((s) => (
                                <SelectItem key={s} value={s}>
                                  {s}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : (
                          <Badge tone={statusTone(p.status)}>{p.status}</Badge>
                        )}
                      </td>
                      <td className="px-3 py-2.5">
                        <span title={`${p.trained_count} / ${p.target_count}`}>
                          <Badge tone={pctTone(pct)}>{pct == null ? "—" : `${pct}%`}</Badge>
                        </span>
                      </td>
                      <td className="px-3 py-2.5 font-mono text-xs text-muted-foreground">{p.indicador ?? "—"}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{fmtDate(p.publicacao)}</td>
                      <td className="px-3 py-2.5 font-mono text-xs">{fmtDate(p.revisao)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <div className="inline-flex gap-1">
                          {canEdit && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => openEdit(p)}
                              title={p.tipo === "Processo" ? "Editar processo" : "Editar política"}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                          )}
                          {canEdit && (
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => openTraining(p)}
                              title="Editar treinamentos"
                            >
                              <GraduationCap className="h-4 w-4" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button size="icon" variant="ghost" onClick={() => setDeleteTarget(p)} title="Excluir">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(o) => !o && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editForm.tipo === "Processo" ? "Editar Processo" : "Editar Política"}</DialogTitle>
            <DialogDescription>
              {editForm.tipo === "Processo"
                ? "Edite os dados do processo selecionado."
                : "Edite os dados da política selecionada."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Nome</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select
                value={editForm.tipo ?? "Política"}
                onValueChange={(v) => setEditForm({ ...editForm, tipo: v as "Política" | "Processo" })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o tipo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Política">Política</SelectItem>
                  <SelectItem value="Processo">Processo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v as Status })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Indicador</Label>
              <Input
                value={editForm.indicador}
                onChange={(e) => setEditForm({ ...editForm, indicador: e.target.value })}
              />
            </div>
            <div>
              <Label>Publicação</Label>
              <Input
                type="date"
                value={editForm.publicacao}
                onChange={(e) => setEditForm({ ...editForm, publicacao: e.target.value })}
              />
            </div>
            <div>
              <Label>Revisão</Label>
              <Input
                type="date"
                value={editForm.revisao}
                onChange={(e) => setEditForm({ ...editForm, revisao: e.target.value })}
              />
            </div>
            <div>
              <Label>Treinados</Label>
              <Input
                type="number"
                min={0}
                value={editForm.trained_count}
                onChange={(e) => setEditForm({ ...editForm, trained_count: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Alvo</Label>
              <Input
                type="number"
                min={0}
                value={editForm.target_count}
                onChange={(e) => setEditForm({ ...editForm, target_count: Number(e.target.value) })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Cancelar
            </Button>
            <Button onClick={submitEdit} disabled={updateMut.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Create dialog */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{form.tipo === "Processo" ? "Novo Processo" : "Nova Política"}</DialogTitle>
            <DialogDescription>
              {form.tipo === "Processo"
                ? "Cadastre um novo processo manualmente."
                : "Cadastre uma nova política manualmente."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label>Nome</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div>
              <Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={(v) => setForm({ ...form, tipo: v as "Política" | "Processo" })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Política">Política</SelectItem>
                  <SelectItem value="Processo">Processo</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Status</Label>
              <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v as Status })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Indicador</Label>
              <Input value={form.indicador} onChange={(e) => setForm({ ...form, indicador: e.target.value })} />
            </div>
            <div>
              <Label>Publicação</Label>
              <Input
                type="date"
                value={form.publicacao}
                onChange={(e) => setForm({ ...form, publicacao: e.target.value })}
              />
            </div>
            <div>
              <Label>Revisão</Label>
              <Input type="date" value={form.revisao} onChange={(e) => setForm({ ...form, revisao: e.target.value })} />
            </div>
            <div>
              <Label>Treinados</Label>
              <Input
                type="number"
                min={0}
                value={form.trained_count}
                onChange={(e) => setForm({ ...form, trained_count: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Alvo</Label>
              <Input
                type="number"
                min={0}
                value={form.target_count}
                onChange={(e) => setForm({ ...form, target_count: Number(e.target.value) })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancelar
            </Button>
            <Button onClick={submitCreate} disabled={createMut.isPending}>
              Criar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Training dialog */}
      <Dialog open={!!trainingFor} onOpenChange={(o) => !o && setTrainingFor(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Treinamentos — {trainingFor?.name}</DialogTitle>
            <DialogDescription>Atualize o número de pessoas treinadas e o alvo total.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Treinados</Label>
              <Input
                type="number"
                min={0}
                value={trainingForm.trained_count}
                onChange={(e) => setTrainingForm({ ...trainingForm, trained_count: Number(e.target.value) })}
              />
            </div>
            <div>
              <Label>Alvo</Label>
              <Input
                type="number"
                min={0}
                value={trainingForm.target_count}
                onChange={(e) => setTrainingForm({ ...trainingForm, target_count: Number(e.target.value) })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTrainingFor(null)}>
              Cancelar
            </Button>
            <Button onClick={submitTraining} disabled={updateMut.isPending}>
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {deleteTarget?.tipo === "Processo" ? "Excluir processo?" : "Excluir política?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {deleteTarget?.tipo === "Processo"
                ? `O processo "${deleteTarget?.name}" será removido permanentemente.`
                : `A política "${deleteTarget?.name}" será removida permanentemente.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (deleteTarget) deleteMut.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) });
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
