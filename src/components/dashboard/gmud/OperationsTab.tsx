import * as React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { listGmuds, deleteGmud } from "@/lib/gmud.functions";
import { Plus, Search, X, Users, Trash2, Filter } from "lucide-react";
import { NewGmudDialog } from "./NewGmudDialog";
import { GmudDetailsSheet, StatusBadge, TipoBadge } from "./GmudDetailsSheet";
import { GMUD_OPEN_NEW_EVENT } from "@/lib/gmud-events";
import { usePermissions } from "@/lib/use-permissions";
import { useAuth } from "@/lib/auth-context";
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

const T = {
  surface: "#0F1420",
  surfaceAlt: "#131825",
  border: "#1E2640",
  borderHi: "#2A3560",
  accent: "#3B82F6",
  accentGlow: "rgba(59,130,246,0.15)",
  accentSoft: "rgba(59,130,246,0.08)",
  success: "#10B981",
  successBg: "rgba(16,185,129,0.10)",
  warning: "#F59E0B",
  danger: "#EF4444",
  dangerBg: "rgba(239,68,68,0.10)",
  teal: "#14B8A6",
  orange: "#FB923C",
  neutral: "#6B7280",
  textPrimary: "#F1F5F9",
  textSecondary: "#F1F5F9",
  textMuted: "#F1F5F9",
  textSubtle: "#F1F5F9",
};

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');
  .got-root{font-family:'DM Sans',sans-serif;color:${T.textPrimary};display:flex;flex-direction:column;gap:14px;}
  .got-root *{box-sizing:border-box;}
  .got-root ::-webkit-scrollbar{width:4px;height:4px;}.got-root ::-webkit-scrollbar-track{background:transparent;}.got-root ::-webkit-scrollbar-thumb{background:${T.borderHi};border-radius:2px;}
  .got-toolbar{display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;padding:12px 16px;background:${T.surface};border:1px solid ${T.border};border-radius:10px;}
  .got-tl{display:flex;align-items:center;gap:8px;flex-wrap:wrap;}
  .got-tr{display:flex;align-items:center;gap:8px;}
  .got-search-wrap{position:relative;display:inline-flex;align-items:center;}
  .got-search-icon{position:absolute;left:9px;pointer-events:none;color:${T.textMuted};}
  .got-search{background:${T.surfaceAlt};border:1px solid ${T.border};border-radius:6px;padding:5px 10px 5px 29px;font-size:12px;font-family:'IBM Plex Mono',monospace;color:${T.textPrimary};outline:none;transition:border-color 0.15s;width:220px;}
  .got-search:focus{border-color:rgba(59,130,246,0.5);box-shadow:0 0 0 2px rgba(59,130,246,0.1);}
  .got-search::placeholder{color:${T.textSubtle};}
  .got-clear-btn{display:inline-flex;align-items:center;gap:4px;padding:5px 10px;background:transparent;border:1px solid ${T.border};border-radius:6px;font-size:11px;color:${T.textMuted};cursor:pointer;transition:all 0.15s;font-family:'DM Sans',sans-serif;}
  .got-clear-btn:hover{border-color:${T.borderHi};color:${T.textPrimary};}
  .got-new-btn{display:inline-flex;align-items:center;gap:7px;padding:8px 16px;background:${T.successBg};border:1px solid rgba(16,185,129,0.35);border-radius:7px;font-size:12px;font-weight:700;color:${T.success};cursor:pointer;font-family:'DM Sans',sans-serif;transition:all 0.15s;white-space:nowrap;}
  .got-new-btn:hover{background:rgba(16,185,129,0.2);box-shadow:0 0 16px rgba(16,185,129,0.1);}
  .got-panel{background:${T.surface};border:1px solid ${T.border};border-radius:10px;overflow:hidden;}
  .got-phdr{display:flex;align-items:center;justify-content:space-between;padding:12px 18px;background:${T.surfaceAlt};border-bottom:1px solid ${T.border};}
  .got-ptitle{display:flex;align-items:center;gap:7px;font-size:11px;font-weight:700;letter-spacing:0.09em;text-transform:uppercase;color:${T.textMuted};font-family:'IBM Plex Mono',monospace;}
  .got-pcount{font-size:11px;color:${T.textMuted};font-family:'IBM Plex Mono',monospace;}
  .got-table{width:100%;border-collapse:collapse;}
  .got-table th{padding:8px 12px;font-size:9px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;color:${T.textMuted};font-family:'IBM Plex Mono',monospace;text-align:left;background:${T.surface};border-bottom:1px solid ${T.border};white-space:nowrap;}
  .got-table td{padding:10px 12px;border-bottom:1px solid rgba(30,38,64,0.4);font-size:12px;color:${T.textPrimary};vertical-align:middle;}
  .got-table tbody tr{cursor:pointer;transition:background 0.1s;}
  .got-table tbody tr:hover td{background:rgba(59,130,246,0.045);}
  .got-table tbody tr:last-child td{border-bottom:none;}
  .got-table .mono{font-family:'IBM Plex Mono',monospace;font-size:11px;}
  .got-table .dim{color:${T.textMuted};}
  .got-id{font-family:'IBM Plex Mono',monospace;font-size:10px;color:${T.textSubtle};background:${T.surfaceAlt};border:1px solid ${T.border};border-radius:4px;padding:2px 6px;}
  .got-window{font-size:11px;color:${T.textMuted};font-family:'IBM Plex Mono',monospace;white-space:nowrap;}
  .got-dots{display:flex;align-items:center;gap:3px;}
  .got-dot{width:14px;height:14px;border-radius:50%;border:2px solid ${T.surface};flex-shrink:0;}
  .got-dot.ok{background:${T.success};}.got-dot.no{background:${T.danger};}.got-dot.pnd{background:${T.warning};}.got-dot.cnl{background:${T.neutral};}
  .got-dots-meta{font-size:10px;color:${T.textMuted};font-family:'IBM Plex Mono',monospace;margin-left:4px;}
  .got-apr-chips{display:flex;flex-wrap:wrap;gap:4px;max-width:200px;}
  .got-apr-chip{font-size:10px;color:${T.textSecondary};background:${T.surfaceAlt};border:1px solid ${T.border};border-radius:4px;padding:2px 7px;white-space:nowrap;}
  .got-del-btn{padding:5px 6px;border-radius:5px;border:1px solid ${T.border};background:transparent;color:${T.textMuted};cursor:pointer;transition:all 0.15s;display:inline-flex;align-items:center;}
  .got-del-btn:hover{border-color:rgba(239,68,68,0.4);color:${T.danger};background:${T.dangerBg};}
  .got-empty{padding:40px;text-align:center;color:${T.textMuted};font-size:13px;font-family:'DM Sans',sans-serif;}
`;

function ApproverDots({ aprovadores, total, statusGeral }: { aprovadores: any[]; total: number; statusGeral: string }) {
  const ok = aprovadores.filter((a) => a.status_aprovacao === "Aprovado").length;
  const no = aprovadores.filter((a) => a.status_aprovacao === "Rejeitado").length;
  const pnd = aprovadores.filter((a) => a.status_aprovacao === "Pendente").length;

  // Etapas escondidas (Cancelado/Dispensado, nunca expostas pelo backend) só
  // ganham um ponto visual quando a GMUD termina — preenchidas com a cor do
  // desfecho final (vermelho se rejeitada, verde se aprovada), sem expor quem
  // são. Enquanto ainda está em aprovação, só os pontos reais aparecem.
  const hiddenCount = Math.max(0, total - aprovadores.length);
  const fillCls =
    statusGeral === "Rejeitada" ? "no" : statusGeral === "Aprovada" ? "ok" : statusGeral === "Cancelada" ? "cnl" : null;

  return (
    <div className="got-dots">
      {aprovadores.map((a, i) => {
        const cls = a.status_aprovacao === "Aprovado" ? "ok" : a.status_aprovacao === "Rejeitado" ? "no" : "pnd";
        return (
          <span key={a.id ?? i} className={`got-dot ${cls}`} title={`${a.nome_aprovador} — ${a.status_aprovacao}`} />
        );
      })}
      {fillCls &&
        Array.from({ length: hiddenCount }).map((_, i) => (
          <span key={`hidden-${i}`} className={`got-dot ${fillCls}`} />
        ))}
      <span className="got-dots-meta">
        {ok}/{total}
        {no > 0 && ` · ${no}✕`}
        {pnd > 0 && ` · ${pnd}⏳`}
      </span>
    </div>
  );
}

function fmtShort(s: string | null) {
  if (!s) return "—";
  try {
    const d = new Date(s);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return s;
  }
}

export function GmudOperationsTab() {
  const list = useServerFn(listGmuds);
  const doDelete = useServerFn(deleteGmud);
  const qc = useQueryClient();
  const { isAdmin, can } = usePermissions();
  const { role, user } = useAuth();
  const isPrivilegedDeleter = isAdmin || role === "analista";

  // Fora de admin/analista, só o criador pode excluir — e só enquanto a GMUD
  // ainda está "Em Aprovação" sem nenhuma decisão registrada (mesma regra do
  // backend em deleteGmud, aqui só pra decidir se o botão aparece).
  function canDeleteRow(g: any): boolean {
    if (!can("gmud", "delete")) return false;
    if (isPrivilegedDeleter) return true;
    if (g.criado_por !== user?.id) return false;
    if (g.status_geral !== "Em Aprovação") return false;
    return !(g.aprovadores ?? []).some((a: any) => a.status_aprovacao !== "Pendente");
  }
  const [deleteTarget, setDeleteTarget] = React.useState<any | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [status, setStatus] = React.useState<string>("all");
  const [tipo, setTipo] = React.useState<string>("all");
  const [search, setSearch] = React.useState("");
  const [openNew, setOpenNew] = React.useState(false);
  const [selected, setSelected] = React.useState<any | null>(null);

  React.useEffect(() => {
    const h = () => setOpenNew(true);
    window.addEventListener(GMUD_OPEN_NEW_EVENT, h);
    return () => window.removeEventListener(GMUD_OPEN_NEW_EVENT, h);
  }, []);
  React.useEffect(() => {
    const h = (e: Event) => setTipo((e as CustomEvent).detail ?? "all");
    window.addEventListener("gmud-tipo-filter", h);
    return () => window.removeEventListener("gmud-tipo-filter", h);
  }, []);

  const q = useQuery({
    queryKey: ["gmuds", status, tipo],
    queryFn: () => list({ data: { status, tipo } }),
    refetchInterval: 30_000,
  });

  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const id = params.get("gmud");
    if (!id || !q.data) return;
    const target = (q.data as any[]).find((g) => g.id === id);
    if (target) {
      setSelected(target);
      const url = new URL(window.location.href);
      url.searchParams.delete("gmud");
      window.history.replaceState({}, "", url.toString());
    }
  }, [q.data]);

  const filtered = React.useMemo(() => {
    const data = q.data ?? [];
    if (!search.trim()) return data;
    const s = search.toLowerCase();
    return data.filter(
      (g: any) =>
        g.titulo?.toLowerCase().includes(s) ||
        g.descricao?.toLowerCase().includes(s) ||
        g.aprovadores?.some((a: any) => a.email_aprovador?.toLowerCase().includes(s)),
    );
  }, [q.data, search]);

  const hasFilter = status !== "all" || tipo !== "all" || search.trim() !== "";
  const selectStyle = {
    background: T.surfaceAlt,
    borderColor: T.border,
    color: T.textPrimary,
    fontFamily: "'IBM Plex Mono',monospace",
    fontSize: 11,
  };

  return (
    <div className="got-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="got-toolbar">
        <div className="got-tl">
          <Filter size={13} color={T.textMuted} />
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger style={{ ...selectStyle, width: 176, height: 34 }}>
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os status</SelectItem>
              {[
                "Rascunho",
                "Em Aprovação",
                "Aprovada",
                "Rejeitada",
                "Cancelada",
                "Em Execução",
                "Concluída",
                "Rollback",
              ].map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={tipo} onValueChange={setTipo}>
            <SelectTrigger style={{ ...selectStyle, width: 160, height: 34 }}>
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos os tipos</SelectItem>
              <SelectItem value="Normal">Normal</SelectItem>
              <SelectItem value="Prioritária">Prioritária</SelectItem>
              <SelectItem value="Emergencial">Emergencial</SelectItem>
            </SelectContent>
          </Select>
          <div className="got-search-wrap">
            <Search size={12} className="got-search-icon" />
            <input
              className="got-search"
              placeholder="Buscar título, e-mail…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          {hasFilter && (
            <button
              className="got-clear-btn"
              onClick={() => {
                setStatus("all");
                setTipo("all");
                setSearch("");
              }}
            >
              <X size={11} /> Limpar
            </button>
          )}
        </div>
        <div className="got-tr">
          <button className="got-new-btn" onClick={() => setOpenNew(true)}>
            <Plus size={13} /> Nova GMUD
          </button>
        </div>
      </div>

      <div className="got-panel">
        <div className="got-phdr">
          <div className="got-ptitle">
            <Filter size={11} /> GMUDs
          </div>
          <span className="got-pcount">
            {q.isLoading ? "…" : `${filtered.length} ${filtered.length === 1 ? "mudança" : "mudanças"}`}
          </span>
        </div>
        {q.isLoading ? (
          <div style={{ padding: 32, textAlign: "center", color: T.textMuted, fontSize: 13 }}>Carregando…</div>
        ) : filtered.length === 0 ? (
          <div className="got-empty">
            {hasFilter ? "Nenhuma GMUD corresponde aos filtros." : "Nenhuma GMUD encontrada."}
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="got-table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 18 }}>ID</th>
                  <th>Título</th>
                  <th>Tipo</th>
                  <th>Criada em</th>
                  <th>Janela</th>
                  <th>Enviado para</th>
                  <th>Aprovações</th>
                  <th>Status</th>
                  {can("gmud", "delete") && <th style={{ textAlign: "right", paddingRight: 18 }}>Ações</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map((g: any) => (
                  <tr key={g.id} onClick={() => setSelected(g)}>
                    <td style={{ paddingLeft: 18 }}>
                      <span className="got-id">{g.id.slice(0, 8)}</span>
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: T.textPrimary, fontSize: 13 }}>{g.titulo}</div>
                      {g.descricao && (
                        <div
                          className="dim"
                          style={{
                            fontSize: 11,
                            marginTop: 2,
                            maxWidth: 280,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {g.descricao}
                        </div>
                      )}
                    </td>
                    <td>
                      <TipoBadge tipo={g.tipo} />
                    </td>
                    <td>
                      <span className="got-window">{fmtShort(g.created_at)}</span>
                    </td>
                    <td>
                      <span className="got-window">
                        {fmtShort(g.data_inicio)} → {fmtShort(g.data_fim)}
                      </span>
                    </td>
                    <td>
                      {(() => {
                        // Cumulativo: todo aprovador que já recebeu o e-mail (mesmo
                        // já decidido) — quem nunca foi notificado nunca aparece, o
                        // que já respeita sozinho a regra de não revelar quem ainda
                        // não chegou a vez.
                        const notificados = (g.aprovadores ?? []).filter((a: any) => a.notificado_em);
                        return (
                          <div className="got-apr-chips">
                            {notificados.slice(0, 3).map((a: any) => (
                              <span key={a.id} className="got-apr-chip" title={a.email_aprovador}>
                                {a.nome_aprovador.split(" ")[0]}
                              </span>
                            ))}
                            {notificados.length > 3 && (
                              <span className="got-apr-chip" style={{ color: T.textMuted }}>
                                +{notificados.length - 3}
                              </span>
                            )}
                          </div>
                        );
                      })()}
                    </td>
                    <td>
                      <ApproverDots
                        aprovadores={g.aprovadores ?? []}
                        total={g.total_aprovadores ?? (g.aprovadores ?? []).length}
                        statusGeral={g.status_geral}
                      />
                    </td>
                    <td>
                      <StatusBadge status={g.status_geral} />
                    </td>
                    {can("gmud", "delete") && (
                      <td style={{ textAlign: "right", paddingRight: 18 }} onClick={(e) => e.stopPropagation()}>
                        {canDeleteRow(g) ? (
                          <button className="got-del-btn" title="Excluir GMUD" onClick={() => setDeleteTarget(g)}>
                            <Trash2 size={13} />
                          </button>
                        ) : (
                          <span style={{ color: T.textSubtle, fontSize: 12 }}>—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <NewGmudDialog open={openNew} onOpenChange={setOpenNew} />
      <GmudDetailsSheet gmud={selected} open={!!selected} onOpenChange={(v) => !v && setSelected(null)} />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir GMUD?</AlertDialogTitle>
            <AlertDialogDescription>
              A GMUD <strong>"{deleteTarget?.titulo}"</strong> será removida permanentemente. Esta ação não pode ser
              desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              className="bg-destructive hover:bg-destructive/90"
              onClick={async () => {
                if (!deleteTarget) return;
                setDeleting(true);
                try {
                  await doDelete({ data: { id: deleteTarget.id } });
                  toast.success("GMUD excluída.");
                  qc.invalidateQueries({ queryKey: ["gmuds"] });
                  setDeleteTarget(null);
                } catch (e: any) {
                  toast.error(e?.message ?? "Erro ao excluir GMUD.");
                } finally {
                  setDeleting(false);
                }
              }}
            >
              {deleting ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
