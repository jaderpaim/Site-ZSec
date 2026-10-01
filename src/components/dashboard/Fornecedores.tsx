import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Plus, Pencil, Trash2, Search, Bell, Building2, Loader2, AlertTriangle } from "lucide-react";
import { usePermissions } from "@/lib/use-permissions";
import {
  listFornecedores,
  deleteFornecedor,
  updateFornecedorAlertDays,
  triggerFornecedorAlertCheck,
} from "@/lib/fornecedores.functions";
import { FornecedorDialog, type FornecedorRow } from "./fornecedores/FornecedorDialog";

// ── Design Tokens ──────────────────────────────────────────────────────────────
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
  warningBg: "rgba(245,158,11,0.10)",
  danger: "#EF4444",
  dangerBg: "rgba(239,68,68,0.10)",
  neutral: "#6B7280",
  textPrimary: "#F1F5F9",
  textSecondary: "#F1F5F9",
  textMuted: "#F1F5F9",
  textSubtle: "#F1F5F9",
};

// ── CSS ────────────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');

  .forn-root { font-family:'DM Sans',sans-serif; color:${T.textPrimary}; display:flex; flex-direction:column; gap:16px; }
  .forn-root * { box-sizing:border-box; }

  @keyframes forn-spin { to{transform:rotate(360deg)} }
  .forn-spin { animation:forn-spin 0.75s linear infinite; }

  .forn-root ::-webkit-scrollbar       { width:4px; height:4px; }
  .forn-root ::-webkit-scrollbar-track { background:transparent; }
  .forn-root ::-webkit-scrollbar-thumb { background:${T.borderHi}; border-radius:2px; }

  /* ── Header ── */
  .forn-page-hdr {
    background:${T.surface}; border:1px solid ${T.border}; border-radius:12px;
    padding:16px 22px; display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap;
  }
  .forn-page-brand { display:flex; align-items:center; gap:12px; }
  .forn-page-icon  { width:40px; height:40px; border-radius:10px; display:flex; align-items:center; justify-content:center; background:${T.accentGlow}; border:1px solid rgba(59,130,246,0.3); flex-shrink:0; }
  .forn-page-title { font-size:15px; font-weight:700; color:${T.textPrimary}; font-family:'Space Grotesk',sans-serif; letter-spacing:-0.01em; }
  .forn-page-sub   { font-size:11px; color:${T.textMuted}; margin-top:2px; }

  /* ── Panel ── */
  .forn-panel { background:${T.surface}; border:1px solid ${T.border}; border-radius:12px; overflow:hidden; }
  .forn-panel-hdr {
    display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;
    padding:13px 20px; background:${T.surfaceAlt}; border-bottom:1px solid ${T.border};
  }
  .forn-panel-title { display:flex; align-items:center; gap:7px; font-size:11px; font-weight:700; letter-spacing:0.09em; text-transform:uppercase; color:${T.textPrimary}; font-family:'IBM Plex Mono',monospace; }
  .forn-panel-actions { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }

  /* ── Buttons ── */
  .forn-btn {
    display:inline-flex; align-items:center; gap:6px; padding:7px 14px; border-radius:7px;
    font-size:12px; font-weight:700; cursor:pointer; font-family:'DM Sans',sans-serif;
    transition:all 0.15s; white-space:nowrap; border:none;
  }
  .forn-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .forn-btn.outline { background:transparent; border:1px solid ${T.border}; color:${T.textSecondary}; }
  .forn-btn.outline:hover:not(:disabled) { border-color:${T.borderHi}; color:${T.textPrimary}; background:rgba(255,255,255,0.04); }
  .forn-btn.primary { background:${T.accentGlow}; border:1px solid rgba(59,130,246,0.35); color:${T.accent}; }
  .forn-btn.primary:hover:not(:disabled) { background:rgba(59,130,246,0.24); }
  .forn-btn.success { background:${T.successBg}; border:1px solid rgba(16,185,129,0.35); color:${T.success}; }
  .forn-btn.success:hover:not(:disabled) { background:rgba(16,185,129,0.2); }
  .forn-btn.danger  { background:${T.dangerBg};  border:1px solid rgba(239,68,68,0.35);  color:${T.danger};  }
  .forn-btn.danger:hover:not(:disabled)  { background:rgba(239,68,68,0.2); }
  .forn-btn.icon-only { padding:6px; border-radius:6px; }

  /* ── Search ── */
  .forn-search-wrap { position:relative; }
  .forn-search-ico  { position:absolute; left:9px; top:50%; transform:translateY(-50%); pointer-events:none; color:${T.neutral}; }
  .forn-search-input {
    padding:6px 10px 6px 30px; border:1px solid ${T.border}; border-radius:7px;
    background:${T.surfaceAlt}; color:${T.textPrimary}; font-family:'IBM Plex Mono',monospace;
    font-size:11px; outline:none; transition:border-color 0.15s; width:240px;
  }
  .forn-search-input:focus { border-color:rgba(59,130,246,0.5); box-shadow:0 0 0 2px rgba(59,130,246,0.1); }
  .forn-search-input::placeholder { color:${T.neutral}; }

  /* ── Table ── */
  .forn-table { width:100%; border-collapse:collapse; }
  .forn-table thead { position:sticky; top:0; z-index:10; }
  .forn-table th { padding:8px 12px; font-size:9px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:${T.textPrimary}; font-family:'IBM Plex Mono',monospace; text-align:left; background:${T.surface}; border-bottom:1px solid ${T.border}; white-space:nowrap; }
  .forn-table th.r { text-align:right; }
  .forn-table th.c { text-align:center; }
  .forn-table td { padding:10px 12px; border-bottom:1px solid rgba(30,38,64,0.4); font-size:12px; color:${T.textPrimary}; vertical-align:middle; }
  .forn-table tbody tr:hover td { background:rgba(59,130,246,0.04); }
  .forn-table tbody tr:last-child td { border-bottom:none; }
  .forn-table .mono { font-family:'IBM Plex Mono',monospace; font-size:11px; }
  .forn-table .dim  { color:${T.textMuted}; }

  /* ── Days chip ── */
  .forn-days { display:inline-flex; align-items:center; gap:4px; padding:3px 9px; border-radius:4px; font-size:10px; font-weight:700; font-family:'IBM Plex Mono',monospace; white-space:nowrap; }
  .forn-days.ok      { background:${T.successBg}; color:${T.success}; border:1px solid rgba(16,185,129,0.22); }
  .forn-days.warn    { background:${T.warningBg}; color:${T.warning}; border:1px solid rgba(245,158,11,0.22); }
  .forn-days.danger  { background:${T.dangerBg};  color:${T.danger};  border:1px solid rgba(239,68,68,0.22);  }
  .forn-days.neutral { background:rgba(107,114,128,0.08); color:${T.neutral}; border:1px solid rgba(107,114,128,0.15); }

  /* ── Alert days input ── */
  .forn-days-input {
    width:60px; padding:4px 6px; border:1px solid ${T.border}; border-radius:5px;
    background:${T.surfaceAlt}; color:${T.textPrimary}; font-family:'IBM Plex Mono',monospace;
    font-size:11px; text-align:center; outline:none; transition:border-color 0.15s;
  }
  .forn-days-input:focus { border-color:rgba(59,130,246,0.5); box-shadow:0 0 0 2px rgba(59,130,246,0.1); }

  /* ── Empty / Loading ── */
  .forn-empty   { padding:40px; text-align:center; color:${T.textMuted}; font-size:13px; }
  .forn-loading { display:flex; align-items:center; justify-content:center; gap:8px; padding:40px; color:${T.textMuted}; font-size:12px; font-family:'IBM Plex Mono',monospace; }

  /* ── Footer note ── */
  .forn-note { display:flex; align-items:flex-start; gap:7px; font-size:11px; color:${T.textSubtle}; padding:12px 16px 14px; line-height:1.5; font-family:'DM Sans',sans-serif; border-top:1px solid ${T.border}; }
`;

// ── Helpers ────────────────────────────────────────────────────────────────────
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

// ── Sub-components ─────────────────────────────────────────────────────────────
function DaysChip({ days, alertDays }: { days: number | null; alertDays: number }) {
  if (days === null) return <span className="forn-days neutral">—</span>;
  if (days < 0) return <span className="forn-days danger">Vencido há {Math.abs(days)}d</span>;
  if (days <= alertDays) return <span className="forn-days danger">{days}d</span>;
  if (days <= 60) return <span className="forn-days warn">{days}d</span>;
  return <span className="forn-days ok">{days}d</span>;
}

// ── Main ───────────────────────────────────────────────────────────────────────
export function FornecedoresDashboard() {
  const qc = useQueryClient();
  const { can, isAdmin, isModuleAdmin } = usePermissions();

  const canView = isAdmin || isModuleAdmin("fornecedores") || can("fornecedores", "view");
  const canCreate = isAdmin || isModuleAdmin("fornecedores") || can("fornecedores", "create");
  const canEdit = isAdmin || isModuleAdmin("fornecedores") || can("fornecedores", "edit");
  const canDelete = isAdmin || isModuleAdmin("fornecedores") || can("fornecedores", "delete");

  const fetchList = useServerFn(listFornecedores);
  const deleteFn = useServerFn(deleteFornecedor);
  const updateAlertFn = useServerFn(updateFornecedorAlertDays);
  const alertCheckFn = useServerFn(triggerFornecedorAlertCheck);

  const { data, isLoading } = useQuery({
    queryKey: ["fornecedores"],
    queryFn: () => fetchList() as Promise<FornecedorRow[]>,
    enabled: canView,
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
        r.servico_prestado.toLowerCase().includes(s) ||
        (r.department_name ?? "").toLowerCase().includes(s),
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

  const alertCheck = useMutation({
    mutationFn: () => alertCheckFn(),
    onSuccess: (r: any) => {
      if (r.notified > 0) {
        toast.success(`Alerta enviado: ${r.notified} e-mail(s) — ${r.fornecedores} fornecedor(es) no prazo.`);
      } else if (r.fornecedores > 0) {
        toast.warning(
          `${r.fornecedores} fornecedor(es) no prazo, mas nenhum e-mail enviado (SMTP: ${r.smtp}, sem destinatários?).`,
          { duration: 10000 },
        );
      } else {
        toast.info("Nenhum fornecedor dentro do prazo de alerta.");
      }
      qc.invalidateQueries({ queryKey: ["fornecedores"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  if (!canView && !canCreate && !canEdit && !canDelete) {
    return (
      <p className="text-sm text-muted-foreground py-10 text-center">
        Você não tem permissão para acessar este módulo.
      </p>
    );
  }

  const allRows = data ?? [];
  const expiredCount = allRows.filter((r) => {
    const d = daysToExpire(r.data_expiracao);
    return d !== null && d < 0;
  }).length;
  const criticalCount = allRows.filter((r) => {
    const d = daysToExpire(r.data_expiracao);
    return d !== null && d >= 0 && d <= (r.alert_days ?? 30);
  }).length;

  return (
    <div className="forn-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Page header ──────────────────────────────────────────────── */}
      <div className="forn-page-hdr">
        <div className="forn-page-brand">
          <div className="forn-page-icon">
            <Building2 size={18} color={T.accent} />
          </div>
          <div>
            <div className="forn-page-title">Fornecedores</div>
            <div className="forn-page-sub">Monitoramento de vencimento de contratos de fornecedores</div>
          </div>
        </div>

        {/* KPI pills */}
        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              padding: "4px 10px",
              borderRadius: 5,
              background: "rgba(107,114,128,0.08)",
              border: `1px solid ${T.border}`,
              fontSize: 11,
              fontFamily: "'IBM Plex Mono',monospace",
              color: T.textMuted,
            }}
          >
            <Building2 size={11} /> {allRows.length} fornecedores
          </span>
          {criticalCount > 0 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "4px 10px",
                borderRadius: 5,
                background: T.warningBg,
                border: "1px solid rgba(245,158,11,0.25)",
                fontSize: 11,
                fontFamily: "'IBM Plex Mono',monospace",
                color: T.warning,
              }}
            >
              <AlertTriangle size={11} /> {criticalCount} a vencer
            </span>
          )}
          {expiredCount > 0 && (
            <span
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 5,
                padding: "4px 10px",
                borderRadius: 5,
                background: T.dangerBg,
                border: "1px solid rgba(239,68,68,0.25)",
                fontSize: 11,
                fontFamily: "'IBM Plex Mono',monospace",
                color: T.danger,
              }}
            >
              <AlertTriangle size={11} /> {expiredCount} expirados
            </span>
          )}
        </div>
      </div>

      {/* ── Fornecedores panel ───────────────────────────────────────── */}
      <div className="forn-panel">
        <div className="forn-panel-hdr">
          <div className="forn-panel-title">
            <Building2 size={11} /> Fornecedores cadastrados
            <span style={{ fontWeight: 400, color: T.textSubtle }}>({rows.length})</span>
          </div>
          <div className="forn-panel-actions">
            <div className="forn-search-wrap">
              <Search size={12} className="forn-search-ico" />
              <input
                className="forn-search-input"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar nome, serviço ou depto."
              />
            </div>
            {canEdit && (
              <button
                className="forn-btn outline"
                onClick={() => alertCheck.mutate()}
                disabled={alertCheck.isPending}
                title="Verificar vencimentos e enviar alertas por e-mail agora"
              >
                <Bell size={12} className={alertCheck.isPending ? "forn-spin" : ""} />
                Testar alertas
              </button>
            )}
            {canCreate && (
              <button
                className="forn-btn success"
                onClick={() => {
                  setEditing(null);
                  setDialogOpen(true);
                }}
              >
                <Plus size={13} /> Novo fornecedor
              </button>
            )}
          </div>
        </div>

        {isLoading ? (
          <div className="forn-loading">
            <Loader2 size={13} className="forn-spin" color={T.accent} /> Carregando…
          </div>
        ) : rows.length === 0 ? (
          <div className="forn-empty">
            Nenhum fornecedor cadastrado.
            {canCreate && ' Clique em "Novo fornecedor" para começar.'}
          </div>
        ) : (
          <div style={{ overflowX: "auto", maxHeight: 710, overflowY: "auto" }}>
            <table className="forn-table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 18 }}>Nome</th>
                  <th>Serviço prestado</th>
                  <th>Departamento</th>
                  <th>Contratação</th>
                  <th>Expiração</th>
                  <th className="r">Dias p/ vencer</th>
                  <th className="c">Alerta (dias)</th>
                  {(canEdit || canDelete) && (
                    <th className="r" style={{ paddingRight: 18 }}>
                      Ações
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => {
                  const days = daysToExpire(r.data_expiracao);
                  return (
                    <tr key={r.id}>
                      <td className="mono" style={{ paddingLeft: 18, color: T.textPrimary, fontWeight: 500 }}>
                        {r.nome}
                      </td>
                      <td className="dim" style={{ fontSize: 11 }}>
                        {r.servico_prestado}
                      </td>
                      <td className="dim" style={{ fontSize: 11 }}>
                        {r.department_name ?? "—"}
                      </td>
                      <td className="mono dim">{fmtDate(r.data_contratacao)}</td>
                      <td className="mono dim">{fmtDate(r.data_expiracao)}</td>
                      <td style={{ textAlign: "right" }}>
                        <DaysChip days={days} alertDays={r.alert_days ?? 30} />
                      </td>
                      <td style={{ textAlign: "center" }}>
                        {canEdit ? (
                          <input
                            type="number"
                            min={1}
                            max={365}
                            defaultValue={r.alert_days ?? 30}
                            className="forn-days-input"
                            onBlur={(e) => {
                              const v = parseInt(e.target.value, 10);
                              if (v && v !== r.alert_days) updateAlert.mutate({ id: r.id, alert_days: v });
                            }}
                          />
                        ) : (
                          <span className="mono dim">{r.alert_days ?? 30}</span>
                        )}
                      </td>
                      {(canEdit || canDelete) && (
                        <td style={{ textAlign: "right", paddingRight: 18 }}>
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: 6 }}>
                            {canEdit && (
                              <button
                                className="forn-btn outline icon-only"
                                onClick={() => {
                                  setEditing(r);
                                  setDialogOpen(true);
                                }}
                                title="Editar"
                              >
                                <Pencil size={12} />
                              </button>
                            )}
                            {canDelete && (
                              <AlertDialog>
                                <AlertDialogTrigger asChild>
                                  <button className="forn-btn danger icon-only" title="Remover">
                                    <Trash2 size={12} />
                                  </button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                  <AlertDialogHeader>
                                    <AlertDialogTitle>Remover fornecedor</AlertDialogTitle>
                                    <AlertDialogDescription>
                                      Tem certeza que deseja remover <b>{r.nome}</b>? Esta ação não pode ser desfeita.
                                    </AlertDialogDescription>
                                  </AlertDialogHeader>
                                  <AlertDialogFooter>
                                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                    <AlertDialogAction onClick={() => del.mutate(r.id)}>Remover</AlertDialogAction>
                                  </AlertDialogFooter>
                                </AlertDialogContent>
                              </AlertDialog>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <div className="forn-note">
          <Bell size={11} style={{ marginTop: 1, flexShrink: 0, color: T.textMuted }} />
          Quando a data de expiração chega ao prazo de "Alerta (dias)", é enviado e-mail aos administradores globais,
          administradores do módulo e ao departamento vinculado ao fornecedor, diariamente às 09h30 (Brasília).
        </div>
      </div>

      <FornecedorDialog open={dialogOpen} onOpenChange={setDialogOpen} editing={editing} />
    </div>
  );
}
