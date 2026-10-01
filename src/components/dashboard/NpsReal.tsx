import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, Loader2 } from "lucide-react";
import { Panel } from "./primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
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
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";

type Categoria = "Detrator" | "Neutro" | "Promotor";
type Cliente = { id: string; nome: string; email: string | null };
type Registro = {
  id: string;
  cliente_id: string;
  nota: number;
  categoria: Categoria;
  data_pesquisa: string;
  comentario: string | null;
  created_at: string;
  nps_clientes: { nome: string } | null;
};

function categoriaDe(nota: number): Categoria {
  if (nota <= 6) return "Detrator";
  if (nota <= 8) return "Neutro";
  return "Promotor";
}

function fmtDate(d: string) {
  const [y, m, day] = d.split("-");
  return `${day}/${m}/${y}`;
}

function todayIso() {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function CategoriaBadge({ c }: { c: Categoria }) {
  const cls =
    c === "Promotor"
      ? "bg-success/15 text-success border-success/30"
      : c === "Neutro"
        ? "bg-warning/15 text-warning border-warning/30"
        : "bg-danger/15 text-danger border-danger/30";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-mono-xs font-semibold border ${cls}`}>{c}</span>
  );
}

function NotaButton({ n, selected, onClick }: { n: number; selected: boolean; onClick: () => void }) {
  const cat = categoriaDe(n);
  const base =
    cat === "Promotor"
      ? "bg-success/15 text-success border-success/40 hover:bg-success/25"
      : cat === "Neutro"
        ? "bg-warning/15 text-warning border-warning/40 hover:bg-warning/25"
        : "bg-danger/15 text-danger border-danger/40 hover:bg-danger/25";
  const ring = selected ? "ring-2 ring-foreground ring-offset-2 ring-offset-background" : "";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`h-10 w-full rounded-md border font-semibold text-sm transition-colors ${base} ${ring}`}
    >
      {n}
    </button>
  );
}

function NpsClienteDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: (c: Cliente) => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [nome, setNome] = React.useState("");
  const [email, setEmail] = React.useState("");

  React.useEffect(() => {
    if (open) {
      setNome("");
      setEmail("");
    }
  }, [open]);

  const create = useMutation({
    mutationFn: async () => {
      const payload = { nome: nome.trim(), email: email.trim() || null, created_by: user?.id ?? null };
      const { data, error } = await supabase.from("nps_clientes").insert(payload).select("id, nome, email").single();
      if (error) throw new Error(error.message);
      return data as Cliente;
    },
    onSuccess: (c) => {
      toast.success("Cliente criado");
      qc.invalidateQueries({ queryKey: ["nps-clientes"] });
      onCreated(c);
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Novo cliente</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="cli-nome">Nome *</Label>
            <Input id="cli-nome" value={nome} onChange={(e) => setNome(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="cli-email">E-mail</Label>
            <Input id="cli-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => create.mutate()} disabled={!nome.trim() || create.isPending}>
            {create.isPending && <Loader2 className="size-4 mr-1 animate-spin" />}
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function NpsDialog({
  open,
  onOpenChange,
  editing,
  clientes,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  editing: Registro | null;
  clientes: Cliente[];
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [clienteId, setClienteId] = React.useState<string>("");
  const [nota, setNota] = React.useState<number | null>(null);
  const [dataPesquisa, setDataPesquisa] = React.useState<string>(todayIso());
  const [comentario, setComentario] = React.useState("");
  const [clienteDialogOpen, setClienteDialogOpen] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setClienteId(editing?.cliente_id ?? "");
      setNota(editing?.nota ?? null);
      setDataPesquisa(editing?.data_pesquisa ?? todayIso());
      setComentario(editing?.comentario ?? "");
    }
  }, [open, editing]);

  const save = useMutation({
    mutationFn: async () => {
      if (!clienteId) throw new Error("Selecione um cliente");
      if (nota === null) throw new Error("Selecione uma nota");
      if (!dataPesquisa) throw new Error("Informe a data da pesquisa");
      const payload = {
        cliente_id: clienteId,
        nota,
        categoria: categoriaDe(nota),
        data_pesquisa: dataPesquisa,
        comentario: comentario.trim() || null,
      };
      if (editing) {
        const { error } = await supabase.from("nps_registros").update(payload).eq("id", editing.id);
        if (error) throw new Error(error.message);
      } else {
        const { error } = await supabase.from("nps_registros").insert({ ...payload, created_by: user?.id ?? null });
        if (error) throw new Error(error.message);
      }
    },
    onSuccess: () => {
      toast.success("Registro salvo com sucesso");
      qc.invalidateQueries({ queryKey: ["nps-registros"] });
      onOpenChange(false);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar registro NPS" : "Novo registro NPS"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>Cliente / Respondente *</Label>
              <div className="flex gap-2">
                <Select value={clienteId} onValueChange={setClienteId}>
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder="Selecione um cliente" />
                  </SelectTrigger>
                  <SelectContent>
                    {clientes.map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.nome}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button type="button" variant="outline" onClick={() => setClienteDialogOpen(true)}>
                  <Plus className="size-4" />
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="data">Data da pesquisa *</Label>
              <Input id="data" type="date" value={dataPesquisa} onChange={(e) => setDataPesquisa(e.target.value)} />
            </div>

            <div className="space-y-2">
              <Label>Nota NPS *</Label>
              <div className="grid grid-cols-11 gap-1.5">
                {Array.from({ length: 11 }, (_, i) => (
                  <NotaButton key={i} n={i} selected={nota === i} onClick={() => setNota(i)} />
                ))}
              </div>
              <p className="text-mono-xs text-muted-foreground">Detrator (0–6) · Neutro (7–8) · Promotor (9–10)</p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="coment">Comentário / Justificativa</Label>
              <Textarea id="coment" rows={3} value={comentario} onChange={(e) => setComentario(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              {save.isPending && <Loader2 className="size-4 mr-1 animate-spin" />}
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NpsClienteDialog
        open={clienteDialogOpen}
        onOpenChange={setClienteDialogOpen}
        onCreated={(c) => setClienteId(c.id)}
      />
    </>
  );
}

export function NpsDashboard() {
  const qc = useQueryClient();
  const { can, isAdmin, isModuleAdmin } = usePermissions();

  const canView = isAdmin || isModuleAdmin("nps") || can("nps", "view");
  const canCreate = isAdmin || isModuleAdmin("nps") || can("nps", "create");
  const canEdit = isAdmin || isModuleAdmin("nps") || can("nps", "edit");
  const canDelete = isAdmin || isModuleAdmin("nps") || can("nps", "delete");

  const [search, setSearch] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Registro | null>(null);
  const [toDelete, setToDelete] = React.useState<Registro | null>(null);

  const registrosQ = useQuery({
    queryKey: ["nps-registros"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("nps_registros")
        .select("id, cliente_id, nota, categoria, data_pesquisa, comentario, created_at, nps_clientes(nome)")
        .order("data_pesquisa", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw new Error(error.message);
      return (data ?? []) as unknown as Registro[];
    },
  });

  const clientesQ = useQuery({
    queryKey: ["nps-clientes"],
    enabled: canView,
    queryFn: async () => {
      const { data, error } = await supabase.from("nps_clientes").select("id, nome, email").order("nome");
      if (error) throw new Error(error.message);
      return (data ?? []) as Cliente[];
    },
  });

  const del = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("nps_registros").delete().eq("id", id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      toast.success("Registro removido");
      qc.invalidateQueries({ queryKey: ["nps-registros"] });
      setToDelete(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const registros = registrosQ.data ?? [];
  const filtered = React.useMemo(() => {
    const s = search.trim().toLowerCase();
    if (!s) return registros;
    return registros.filter((r) => (r.nps_clientes?.nome ?? "").toLowerCase().includes(s));
  }, [registros, search]);

  const metrics = React.useMemo(() => {
    const totalAll = registros.length;
    if (totalAll === 0)
      return {
        score: null as number | null,
        media: null as number | null,
        totalAll: 0,
        monthCount: 0,
        monthLabel: null as string | null,
        promotores: 0,
        neutros: 0,
        detratores: 0,
      };
    // Score/Média refletem o MÊS mais recente com registros (score "atual"),
    // não o histórico inteiro. O total geral fica no card "Total de respostas".
    const latestMonth = registros.reduce((m, r) => {
      const ym = (r.data_pesquisa ?? "").slice(0, 7);
      return ym > m ? ym : m;
    }, "");
    const monthRegs = registros.filter((r) => (r.data_pesquisa ?? "").slice(0, 7) === latestMonth);
    const monthCount = monthRegs.length;
    const promotores = monthRegs.filter((r) => r.categoria === "Promotor").length;
    const neutros = monthRegs.filter((r) => r.categoria === "Neutro").length;
    const detratores = monthRegs.filter((r) => r.categoria === "Detrator").length;
    const score = monthCount > 0 ? Math.round(((promotores - detratores) / monthCount) * 100) : null;
    const media = monthCount > 0 ? monthRegs.reduce((s, r) => s + r.nota, 0) / monthCount : null;
    const MESES = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
    const [y, mm] = latestMonth.split("-");
    const monthLabel = mm ? `${MESES[Number(mm) - 1]}/${y}` : null;
    return { score, media, totalAll, monthCount, monthLabel, promotores, neutros, detratores };
  }, [registros]);

  if (!canView) {
    return (
      <p className="text-sm text-muted-foreground py-10 text-center">
        Você não tem permissão para acessar este módulo.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-surface border border-border rounded-lg p-5">
          <div className="text-mono-xs text-muted-foreground mb-1">
            NPS Score{metrics.monthLabel ? ` · ${metrics.monthLabel}` : ""}
          </div>
          <div
            className={`text-3xl font-semibold ${
              metrics.score === null
                ? "text-muted-foreground"
                : metrics.score >= 50
                  ? "text-success"
                  : metrics.score >= 0
                    ? "text-warning"
                    : "text-danger"
            }`}
          >
            {metrics.score === null ? "—" : `${metrics.score > 0 ? "+" : ""}${metrics.score}`}
          </div>
          <div className="text-xs text-muted-foreground mt-1">
            {metrics.monthCount} resp. no mês · (promotores − detratores) / total × 100
          </div>
        </div>
        <div className="bg-surface border border-border rounded-lg p-5">
          <div className="text-mono-xs text-muted-foreground mb-1">
            Média das notas{metrics.monthLabel ? ` · ${metrics.monthLabel}` : ""}
          </div>
          <div className="text-3xl font-semibold text-foreground">
            {metrics.media === null ? "—" : metrics.media.toFixed(1)}
          </div>
          <div className="text-xs text-muted-foreground mt-1">Média das notas do mês mais recente</div>
        </div>
        <div className="bg-surface border border-border rounded-lg p-5">
          <div className="text-mono-xs text-muted-foreground mb-1">
            Composição{metrics.monthLabel ? ` · ${metrics.monthLabel}` : ""}
          </div>
          <div className="flex items-baseline gap-5 mt-1">
            <div>
              <div className="text-2xl font-semibold text-success">{metrics.promotores}</div>
              <div className="text-mono-xs text-muted-foreground">Promotores</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-warning">{metrics.neutros}</div>
              <div className="text-mono-xs text-muted-foreground">Neutros</div>
            </div>
            <div>
              <div className="text-2xl font-semibold text-danger">{metrics.detratores}</div>
              <div className="text-mono-xs text-muted-foreground">Detratores</div>
            </div>
          </div>
          <div className="text-xs text-muted-foreground mt-2">notas 9–10 · 7–8 · 0–6 · {metrics.monthCount} no mês</div>
        </div>
        <div className="bg-surface border border-border rounded-lg p-5">
          <div className="text-mono-xs text-muted-foreground mb-1">Total de respostas</div>
          <div className="text-3xl font-semibold text-foreground">{metrics.totalAll}</div>
          <div className="text-xs text-muted-foreground mt-1">Registros cadastrados (todo o histórico)</div>
        </div>
      </div>

      <Panel
        title={`Registros de NPS (${filtered.length})`}
        action={
          <div className="flex items-center gap-2">
            <div className="relative w-64">
              <Search className="size-4 absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por cliente"
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
                <Plus className="size-4 mr-1" /> Novo registro
              </Button>
            )}
          </div>
        }
      >
        {registrosQ.isLoading ? (
          <p className="text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" /> Carregando...
          </p>
        ) : registrosQ.isError ? (
          <p className="text-sm text-danger">Erro ao carregar registros.</p>
        ) : filtered.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            Nenhum registro encontrado.
            {canCreate && registros.length === 0 && ' Clique em "Novo registro" para começar.'}
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-mono-xs text-muted-foreground border-b border-border">
                <th className="text-left p-2">Cliente</th>
                <th className="text-center p-2">Nota</th>
                <th className="text-left p-2">Categoria</th>
                <th className="text-left p-2">Data da pesquisa</th>
                <th className="text-left p-2">Comentário</th>
                {(canEdit || canDelete) && <th className="w-24" />}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map((r) => (
                <tr key={r.id} className="hover:bg-accent/40">
                  <td className="p-2 font-medium">{r.nps_clientes?.nome ?? "—"}</td>
                  <td className="p-2 text-center font-mono font-semibold">{r.nota}</td>
                  <td className="p-2">
                    <CategoriaBadge c={r.categoria} />
                  </td>
                  <td className="p-2 font-mono text-xs">{fmtDate(r.data_pesquisa)}</td>
                  <td className="p-2 text-muted-foreground" title={r.comentario ?? ""}>
                    {r.comentario ? (r.comentario.length > 60 ? r.comentario.slice(0, 60) + "…" : r.comentario) : "—"}
                  </td>
                  {(canEdit || canDelete) && (
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
                            onClick={() => setToDelete(r)}
                            className="text-muted-foreground hover:text-danger p-1"
                            title="Remover"
                          >
                            <Trash2 className="size-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Panel>

      <NpsDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} clientes={clientesQ.data ?? []} />

      <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover registro?</AlertDialogTitle>
            <AlertDialogDescription>
              O registro de NPS de <strong>{toDelete?.nps_clientes?.nome}</strong> (nota {toDelete?.nota}) será removido
              permanentemente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => toDelete && del.mutate(toDelete.id)}>Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
