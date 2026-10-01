import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { usePermissions } from "@/lib/use-permissions";
import {
  listSophosExcecoes,
  upsertSophosExcecao,
  deleteSophosExcecao,
  type SophosExcecaoRow,
} from "@/lib/sophos-excecoes.functions";

const T = {
  surface: "#0F1420",
  surfaceAlt: "#131825",
  border: "#1E2640",
  borderHi: "#2A3560",
  accent: "#3B82F6",
  danger: "#EF4444",
  cyan: "#22D3EE",
  neutral: "#6B7280",
  textPrimary: "#F1F5F9",
  textMuted: "#94A3B8",
};

const CSS = `
  .se-root { font-family:'DM Sans',sans-serif; color:${T.textPrimary}; display:flex; flex-direction:column; gap:16px; }
  .se-root * { box-sizing:border-box; }
  .se-head { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
  .se-title { display:flex; align-items:center; gap:9px; font-size:15px; font-weight:700; font-family:'Space Grotesk',sans-serif; }
  .se-sub { font-size:12px; color:${T.textMuted}; margin-top:2px; }
  .se-panel { background:${T.surface}; border:1px solid ${T.border}; border-radius:11px; overflow:hidden; }
  .se-table { width:100%; border-collapse:collapse; }
  .se-table th { padding:9px 14px; font-size:9px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:${T.textMuted};
    font-family:'IBM Plex Mono',monospace; text-align:left; background:${T.surfaceAlt}; border-bottom:1px solid ${T.border}; white-space:nowrap; }
  .se-table td { padding:11px 14px; border-bottom:1px solid rgba(30,38,64,.4); font-size:13px; color:${T.textPrimary}; vertical-align:middle; }
  .se-table tbody tr:last-child td { border-bottom:none; }
  .se-table tbody tr:hover td { background:rgba(59,130,246,.03); }
  .se-tag { display:inline-flex; align-items:center; padding:2px 8px; border-radius:5px; font-size:10px; font-weight:700;
    font-family:'IBM Plex Mono',monospace; border:1px solid transparent; }
  .se-tag.exact { background:rgba(59,130,246,.10); color:${T.accent}; border-color:rgba(59,130,246,.3); }
  .se-tag.contains { background:rgba(167,139,250,.10); color:#A78BFA; border-color:rgba(167,139,250,.3); }
  .se-icon-btn { background:transparent; border:none; cursor:pointer; padding:6px; border-radius:6px; color:${T.textMuted}; display:inline-flex; transition:all .15s; }
  .se-icon-btn:hover { background:${T.surfaceAlt}; color:${T.danger}; }
  .se-empty { padding:34px; text-align:center; color:${T.textMuted}; font-size:13px; }
  .se-hint { font-size:11px; color:${T.textMuted}; background:${T.surfaceAlt}; border:1px solid ${T.border}; border-radius:8px; padding:10px 14px; }
  .se-select { width:100%; background:${T.surfaceAlt}; border:1px solid ${T.border}; border-radius:8px; color:${T.textPrimary};
    padding:8px 10px; font-size:13px; font-family:'DM Sans',sans-serif; outline:none; }
  .se-select:focus { border-color:rgba(59,130,246,.5); }
`;

function ExcecaoDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const qc = useQueryClient();
  const submit = useServerFn(upsertSophosExcecao);
  const [target, setTarget] = React.useState<"event" | "user">("event");
  const [eventName, setEventName] = React.useState("");
  const [matchType, setMatchType] = React.useState<"exact" | "contains">("exact");
  const [loading, setLoading] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setTarget("event");
      setEventName("");
      setMatchType("exact");
    }
  }, [open]);

  async function handleSubmit() {
    if (!eventName.trim()) return toast.error(target === "user" ? "Informe o usuário" : "Informe o nome do evento");
    setLoading(true);
    try {
      await submit({ data: { event_name: eventName.trim(), match_type: matchType, target } });
      toast.success("Exceção incluída");
      qc.invalidateQueries({ queryKey: ["sophos-excecoes"] });
      onOpenChange(false);
    } catch (e: any) {
      toast.error(e?.message ?? "Erro ao salvar exceção");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Nova exceção</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          <div>
            <Label>Aplica a</Label>
            <select className="se-select" value={target} onChange={(e) => setTarget(e.target.value as "event" | "user")}>
              <option value="event">Evento (nome da ameaça)</option>
              <option value="user">Usuário (tira do ranking inteiro)</option>
            </select>
          </div>
          <div>
            <Label>{target === "user" ? "Usuário *" : "Nome do evento *"}</Label>
            <Input
              value={eventName}
              onChange={(e) => setEventName(e.target.value)}
              maxLength={200}
              placeholder={target === "user" ? "Ex.: SISTEMA, n/a, autologon_" : "Ex.: Atualização bem-sucedida"}
            />
            <p style={{ fontSize: 11, color: T.textMuted, marginTop: 4 }}>
              {target === "user"
                ? "Deve casar com o valor de usuário que aparece no Top 10 (ex.: contas de sistema/serviço como SISTEMA, n/a, autologon_*)."
                : 'Deve ser igual ao que aparece na coluna Ameaça do Top 10 do Sophos (no drill-down).'}
            </p>
          </div>
          <div>
            <Label>Tipo de correspondência</Label>
            <select
              className="se-select"
              value={matchType}
              onChange={(e) => setMatchType(e.target.value as "exact" | "contains")}
            >
              <option value="exact">Exato (idêntico)</option>
              <option value="contains">Contém (inclui este texto)</option>
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2 border-t border-border">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>
              Cancelar
            </Button>
            <Button onClick={handleSubmit} disabled={loading}>
              {loading && <Loader2 className="size-4 mr-2 animate-spin" />}
              Incluir
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SophosExcecoesDashboard() {
  const qc = useQueryClient();
  const { can, isAdmin, isModuleAdmin } = usePermissions();
  const canCreate = isAdmin || isModuleAdmin("excecao-sophos") || can("excecao-sophos", "create");
  const canDelete = isAdmin || isModuleAdmin("excecao-sophos") || can("excecao-sophos", "delete");

  const fetchList = useServerFn(listSophosExcecoes);
  const deleteFn = useServerFn(deleteSophosExcecao);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const list = useQuery({
    queryKey: ["sophos-excecoes"],
    queryFn: () => fetchList() as Promise<SophosExcecaoRow[]>,
    staleTime: 60_000,
  });

  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Exceção removida");
      qc.invalidateQueries({ queryKey: ["sophos-excecoes"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const rows = list.data ?? [];

  return (
    <div className="se-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="se-head">
        <div>
          <div className="se-title">
            <ShieldCheck size={18} color={T.cyan} /> Exceção Sophos
          </div>
          <div className="se-sub">
            Eventos que <b>não</b> são ameaças e devem ser excluídos do "Top 10 Usuários com Ameaças" (contagem e
            drill-down).
          </div>
        </div>
        {canCreate && (
          <Button size="sm" onClick={() => setDialogOpen(true)}>
            <Plus className="size-4 mr-1" /> Adicionar exceção
          </Button>
        )}
      </div>

      <div className="se-hint">
        As exceções valem para todos: o Top 10 do Sophos passa a contar apenas ameaças reais. Exceção de{" "}
        <b>Evento</b> casa com a coluna <b>Ameaça</b> (ex.: "Atualização bem-sucedida"). Exceção de <b>Usuário</b> tira
        o usuário inteiro do ranking (ex.: contas de sistema/serviço como "SISTEMA", "n/a", "autologon_*"). Tipo{" "}
        <b>Exato</b> = idêntico; <b>Contém</b> = inclui o texto informado.
      </div>

      <div className="se-panel">
        {list.isLoading ? (
          <div className="se-empty">Carregando exceções…</div>
        ) : list.isError ? (
          <div className="se-empty" style={{ color: T.danger }}>
            Erro ao carregar exceções: {(list.error as Error)?.message ?? "erro desconhecido"}
          </div>
        ) : rows.length === 0 ? (
          <div className="se-empty">
            Nenhuma exceção cadastrada.{canCreate && ' Clique em "Adicionar exceção" para começar.'}
          </div>
        ) : (
          <table className="se-table">
            <thead>
              <tr>
                <th style={{ paddingLeft: 18 }}>Valor</th>
                <th>Aplica a</th>
                <th>Tipo</th>
                <th>Criado em</th>
                {canDelete && <th style={{ width: 70 }} />}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td style={{ paddingLeft: 18, fontWeight: 500 }}>{r.event_name}</td>
                  <td>
                    <span className={`se-tag ${r.target === "user" ? "contains" : "exact"}`}>
                      {r.target === "user" ? "Usuário" : "Evento"}
                    </span>
                  </td>
                  <td>
                    <span className={`se-tag ${r.match_type}`}>{r.match_type === "exact" ? "Exato" : "Contém"}</span>
                  </td>
                  <td style={{ color: T.textMuted, fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 }}>
                    {r.created_at ? new Date(r.created_at).toLocaleDateString("pt-BR") : "—"}
                  </td>
                  {canDelete && (
                    <td>
                      <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <button
                          className="se-icon-btn"
                          title="Remover"
                          onClick={() => {
                            if (confirm(`Remover a exceção "${r.event_name}"?`)) del.mutate(r.id);
                          }}
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <ExcecaoDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}
