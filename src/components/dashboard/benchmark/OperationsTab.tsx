import { ModuleLoading } from "@/components/layout/ModuleLoading";
import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Save } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useOrganizacao } from "@/lib/use-organizacao";
import {
  getBenchmarkOverview,
  upsertMaturidadeRef,
  deleteMaturidadeRef,
  upsertInvestimentoRef,
  deleteInvestimentoRef,
  upsertBenchmarkEmpresa,
  type MaturidadeRefRow,
  type InvestimentoRefRow,
} from "@/lib/benchmark.functions";

const T = {
  surface: "var(--tl-0f1420, #0F1420)",
  border: "var(--tl-1e2640, #1E2640)",
  textPrimary: "var(--tl-f1f5f9, #F1F5F9)",
  textSecondary: "var(--tl-94a3b8, #94A3B8)",
  textMuted: "var(--tl-64748b, #64748B)",
};

const num = (v: string) => (v.trim() === "" ? null : Number(v.replace(",", ".")));

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.border}`, borderRadius: 10, padding: 18 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
        <div style={{ fontSize: 13, fontWeight: 700, color: T.textPrimary }}>{title}</div>
        {action}
      </div>
      {children}
    </div>
  );
}

const th: React.CSSProperties = {
  padding: "8px 10px",
  borderBottom: `1px solid ${T.border}`,
  textAlign: "left",
  color: T.textMuted,
  fontWeight: 600,
};
const td: React.CSSProperties = { padding: "9px 10px", borderBottom: `1px solid ${T.border}`, color: T.textSecondary };

export function BenchmarkOperationsTab() {
  const org = useOrganizacao();
  const qc = useQueryClient();
  const fetchOverview = useServerFn(getBenchmarkOverview);
  const saveMat = useServerFn(upsertMaturidadeRef);
  const delMat = useServerFn(deleteMaturidadeRef);
  const saveInv = useServerFn(upsertInvestimentoRef);
  const delInv = useServerFn(deleteInvestimentoRef);
  const saveEmp = useServerFn(upsertBenchmarkEmpresa);

  const { data, isLoading } = useQuery({ queryKey: ["benchmark", "overview"], queryFn: () => fetchOverview() });
  const invalidate = () => qc.invalidateQueries({ queryKey: ["benchmark"] });

  const [matDialog, setMatDialog] = React.useState<Partial<MaturidadeRefRow> | null>(null);
  const [invDialog, setInvDialog] = React.useState<Partial<InvestimentoRefRow> | null>(null);
  const empresa = (data?.empresa ?? [])[0];
  const nist = data?.nist ?? null;
  const [emp, setEmp] = React.useState({ ano: "", fat: "", inv: "" });

  React.useEffect(() => {
    if (empresa) {
      setEmp({
        ano: String(empresa.ano),
        fat: empresa.faturamento_anual != null ? String(empresa.faturamento_anual) : "",
        inv: empresa.investimento_ciber != null ? String(empresa.investimento_ciber) : "",
      });
    }
  }, [empresa?.id]);

  const matMut = useMutation({
    mutationFn: (v: Record<string, unknown>) => saveMat({ data: v as never }),
    onSuccess: () => {
      toast.success("Referência salva");
      setMatDialog(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const invMut = useMutation({
    mutationFn: (v: Record<string, unknown>) => saveInv({ data: v as never }),
    onSuccess: () => {
      toast.success("Referência salva");
      setInvDialog(null);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const empMut = useMutation({
    mutationFn: (v: Record<string, unknown>) => saveEmp({ data: v as never }),
    onSuccess: () => {
      toast.success(`Dados de ${org.rotulo} atualizados`);
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delMatMut = useMutation({
    mutationFn: (id: string) => delMat({ data: { id } }),
    onSuccess: () => {
      toast.success("Removido");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });
  const delInvMut = useMutation({
    mutationFn: (id: string) => delInv({ data: { id } }),
    onSuccess: () => {
      toast.success("Removido");
      invalidate();
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (isLoading) return <ModuleLoading />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, fontFamily: "'DM Sans',sans-serif" }}>
      <Card title={`Dados de ${org.rotulo} (ano corrente)`}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(160px,1fr))",
            gap: 12,
            alignItems: "end",
          }}
        >
          <div>
            <Label className="text-xs">Ano</Label>
            <Input value={emp.ano} onChange={(e) => setEmp({ ...emp, ano: e.target.value })} placeholder="2025" />
          </div>
          <div>
            <Label className="text-xs">Score de maturidade</Label>
            <div
              style={{
                height: 36,
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "0 12px",
                border: `1px solid ${T.border}`,
                borderRadius: 6,
                color: T.textPrimary,
                fontSize: 14,
              }}
            >
              {nist ? nist.nota.toFixed(2) : "—"}
              <span style={{ fontSize: 10, color: T.textMuted }}>
                {nist ? `NIST · ${nist.periodo}` : "sem avaliação cadastrada"}
              </span>
            </div>
            <div style={{ fontSize: 10, color: T.textMuted, marginTop: 4 }}>
              Vem do módulo Maturidade — não editável aqui
            </div>
          </div>
          <div>
            <Label className="text-xs">Faturamento anual (R$)</Label>
            <Input value={emp.fat} onChange={(e) => setEmp({ ...emp, fat: e.target.value })} placeholder="1000000000" />
          </div>
          <div>
            <Label className="text-xs">Investimento em cibersegurança (R$)</Label>
            <Input value={emp.inv} onChange={(e) => setEmp({ ...emp, inv: e.target.value })} placeholder="750000" />
          </div>
          <Button
            disabled={empMut.isPending}
            onClick={() =>
              empMut.mutate({
                ano: Number(emp.ano),
                score_maturidade: nist?.nota ?? null,
                faturamento_anual: num(emp.fat),
                investimento_ciber: num(emp.inv),
              })
            }
          >
            <Save className="size-4 mr-1" /> Salvar
          </Button>
        </div>
      </Card>

      <Card
        title="Faixas de referência de maturidade"
        action={
          <Button size="sm" onClick={() => setMatDialog({ tipo: "faturamento", ordem: 0, is_propria: false })}>
            <Plus className="size-4 mr-1" /> Nova faixa
          </Button>
        }
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={th}>Tipo</th>
                <th style={th}>Faixa</th>
                <th style={th}>Valor</th>
                <th style={th}>Ordem</th>
                <th style={th}>{org.rotulo}</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {(data?.maturidade ?? []).map((r) => (
                <tr key={r.id}>
                  <td style={td}>{r.tipo === "faturamento" ? "Faturamento" : "Funcionários"}</td>
                  <td style={{ ...td, color: T.textPrimary }}>{r.faixa}</td>
                  <td style={td}>{Number(r.valor).toFixed(2)}</td>
                  <td style={td}>{r.ordem}</td>
                  <td style={td}>{r.is_propria ? "Sim" : "—"}</td>
                  <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                    <Button size="icon" variant="ghost" onClick={() => setMatDialog(r)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => delMatMut.mutate(r.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <Card
        title="Percentuais de investimento de referência"
        action={
          <Button size="sm" onClick={() => setInvDialog({ ordem: 0 })}>
            <Plus className="size-4 mr-1" /> Nova referência
          </Button>
        }
      >
        <div style={{ overflowX: "auto" }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead>
              <tr>
                <th style={th}>Tipo de organização</th>
                <th style={th}>Mín (%)</th>
                <th style={th}>Máx (%)</th>
                <th style={th}>Observação</th>
                <th style={th}>Ordem</th>
                <th style={th}></th>
              </tr>
            </thead>
            <tbody>
              {(data?.investimento ?? []).map((r) => (
                <tr key={r.id}>
                  <td style={{ ...td, color: T.textPrimary }}>{r.tipo_organizacao}</td>
                  <td style={td}>{r.pct_min ?? "—"}</td>
                  <td style={td}>{r.pct_max ?? "—"}</td>
                  <td style={td}>{r.observacao ?? "—"}</td>
                  <td style={td}>{r.ordem}</td>
                  <td style={{ ...td, textAlign: "right", whiteSpace: "nowrap" }}>
                    <Button size="icon" variant="ghost" onClick={() => setInvDialog(r)}>
                      <Pencil className="size-4" />
                    </Button>
                    <Button size="icon" variant="ghost" onClick={() => delInvMut.mutate(r.id)}>
                      <Trash2 className="size-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Dialog maturidade */}
      <Dialog open={!!matDialog} onOpenChange={(o) => !o && setMatDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{matDialog?.id ? "Editar faixa" : "Nova faixa"}</DialogTitle>
          </DialogHeader>
          {matDialog && (
            <div className="grid gap-3">
              <div>
                <Label className="text-xs">Tipo</Label>
                <select
                  className="w-full h-9 rounded-md border border-input bg-background px-3 text-sm"
                  value={matDialog.tipo ?? "faturamento"}
                  onChange={(e) => setMatDialog({ ...matDialog, tipo: e.target.value as MaturidadeRefRow["tipo"] })}
                >
                  <option value="faturamento">Faturamento</option>
                  <option value="funcionarios">Funcionários</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">Faixa</Label>
                <Input
                  value={matDialog.faixa ?? ""}
                  onChange={(e) => setMatDialog({ ...matDialog, faixa: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Valor (0 a 5)</Label>
                  <Input
                    value={matDialog.valor ?? ""}
                    disabled={!!matDialog.is_propria}
                    onChange={(e) => setMatDialog({ ...matDialog, valor: e.target.value as unknown as number })}
                  />
                  {matDialog.is_propria && (
                    <div style={{ fontSize: 10, color: T.textMuted, marginTop: 4 }}>
                      A barra de {org.rotulo} usa a nota NIST do módulo Maturidade
                    </div>
                  )}
                </div>
                <div>
                  <Label className="text-xs">Ordem</Label>
                  <Input
                    value={matDialog.ordem ?? 0}
                    onChange={(e) => setMatDialog({ ...matDialog, ordem: e.target.value as unknown as number })}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Fonte</Label>
                  <Input
                    value={matDialog.fonte ?? ""}
                    onChange={(e) => setMatDialog({ ...matDialog, fonte: e.target.value })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Ano / período</Label>
                  <Input
                    value={matDialog.ano ?? ""}
                    onChange={(e) => setMatDialog({ ...matDialog, ano: e.target.value })}
                  />
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={!!matDialog.is_propria}
                  onChange={(e) => setMatDialog({ ...matDialog, is_propria: e.target.checked })}
                />
                É a barra de {org.rotulo} (destacada)
              </label>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setMatDialog(null)}>
              Cancelar
            </Button>
            <Button
              disabled={matMut.isPending}
              onClick={() =>
                matDialog &&
                matMut.mutate({
                  id: matDialog.id ?? null,
                  tipo: matDialog.tipo ?? "faturamento",
                  faixa: String(matDialog.faixa ?? ""),
                  valor: Number(String(matDialog.valor ?? "0").replace(",", ".")),
                  ordem: Number(matDialog.ordem ?? 0),
                  is_propria: !!matDialog.is_propria,
                  fonte: matDialog.fonte ?? null,
                  ano: matDialog.ano ?? null,
                })
              }
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog investimento */}
      <Dialog open={!!invDialog} onOpenChange={(o) => !o && setInvDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{invDialog?.id ? "Editar referência" : "Nova referência"}</DialogTitle>
          </DialogHeader>
          {invDialog && (
            <div className="grid gap-3">
              <div>
                <Label className="text-xs">Tipo de organização</Label>
                <Input
                  value={invDialog.tipo_organizacao ?? ""}
                  onChange={(e) => setInvDialog({ ...invDialog, tipo_organizacao: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs">Mín (%)</Label>
                  <Input
                    value={invDialog.pct_min ?? ""}
                    onChange={(e) => setInvDialog({ ...invDialog, pct_min: e.target.value as unknown as number })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Máx (%)</Label>
                  <Input
                    value={invDialog.pct_max ?? ""}
                    onChange={(e) => setInvDialog({ ...invDialog, pct_max: e.target.value as unknown as number })}
                  />
                </div>
                <div>
                  <Label className="text-xs">Ordem</Label>
                  <Input
                    value={invDialog.ordem ?? 0}
                    onChange={(e) => setInvDialog({ ...invDialog, ordem: e.target.value as unknown as number })}
                  />
                </div>
              </div>
              <div>
                <Label className="text-xs">Observação</Label>
                <Input
                  value={invDialog.observacao ?? ""}
                  onChange={(e) => setInvDialog({ ...invDialog, observacao: e.target.value })}
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setInvDialog(null)}>
              Cancelar
            </Button>
            <Button
              disabled={invMut.isPending}
              onClick={() =>
                invDialog &&
                invMut.mutate({
                  id: invDialog.id ?? null,
                  tipo_organizacao: String(invDialog.tipo_organizacao ?? ""),
                  pct_min: num(String(invDialog.pct_min ?? "")),
                  pct_max: num(String(invDialog.pct_max ?? "")),
                  observacao: invDialog.observacao ?? null,
                  ordem: Number(invDialog.ordem ?? 0),
                })
              }
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
