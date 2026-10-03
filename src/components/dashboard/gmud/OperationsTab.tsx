import * as React from "react";
import { Search, Trash2 } from "lucide-react";
import { StatusBadge, TipoBadge } from "./GmudDetailsSheet";
import { GMUD_STATUSES, sortAprovadores, useCanDeleteGmud, type GmudRow } from "./gmud-shared";

// Estilos: classes gm-* definidas em GmudReal.tsx (casco do módulo).

function fmtShort(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
function fmtHour(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
const sameDay = (a: string | null, b: string | null) =>
  !!a && !!b && new Date(a).toDateString() === new Date(b).toDateString();

/** Barrinha por etapa da cadeia + "etapa X de Y". Tooltip só com quem já foi notificado. */
function ApprovalSteps({ g }: { g: GmudRow }) {
  const aprs = sortAprovadores(g.aprovadores);
  const total = g.total_aprovadores ?? aprs.length;
  if (aprs.length === 0) return <span className="dim">—</span>;
  const done = aprs.filter((a) => a.status_aprovacao === "Aprovado").length;
  const cur = aprs.find((a) => a.ativo);
  // Cumulativo: todo aprovador que já recebeu o e-mail (mesmo já decidido) —
  // quem nunca foi notificado nunca aparece, o que respeita a regra de não
  // revelar quem ainda não chegou a vez.
  const notificados = aprs.filter((a) => a.notificado_em);
  const title = notificados.length
    ? notificados.map((a) => `${a.ordem}. ${a.nome_aprovador} · ${a.status_aprovacao}`).join("\n")
    : "Ninguém notificado ainda";
  const label =
    g.status_geral === "Em Aprovação" && cur
      ? `etapa ${cur.ordem} de ${total}`
      : `${done} de ${total}`;
  return (
    <span className="gm-steps" title={title}>
      {aprs.map((a) => (
        <i
          key={a.id}
          className={
            a.status_aprovacao === "Aprovado"
              ? "ok"
              : a.status_aprovacao === "Rejeitado"
                ? "no"
                : a.ativo
                  ? "cur"
                  : a.status_aprovacao === "Cancelado" || a.status_aprovacao === "Dispensado"
                    ? "skip"
                    : ""
          }
        />
      ))}
      <span>{label}</span>
    </span>
  );
}

export function GmudOperationsTab({
  rows,
  isLoading,
  status,
  onStatus,
  tipo,
  onTipo,
  search,
  onSearch,
  onOpen,
}: {
  rows: GmudRow[];
  isLoading: boolean;
  status: string;
  onStatus: (v: string) => void;
  tipo: string;
  onTipo: (v: string) => void;
  search: string;
  onSearch: (v: string) => void;
  onOpen: (g: GmudRow, askDelete?: boolean) => void;
}) {
  const canDeleteRow = useCanDeleteGmud();
  const anyDeletable = rows.some(canDeleteRow);

  const counts = React.useMemo(() => {
    const c: Record<string, number> = {};
    rows.forEach((g) => (c[g.status_geral] = (c[g.status_geral] ?? 0) + 1));
    return c;
  }, [rows]);

  const filtered = React.useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((g) => {
      if (status !== "all" && g.status_geral !== status) return false;
      if (tipo !== "all" && g.tipo !== tipo) return false;
      if (!s) return true;
      return (
        g.titulo?.toLowerCase().includes(s) ||
        g.descricao?.toLowerCase().includes(s) ||
        g.aprovadores?.some((a) => a.email_aprovador?.toLowerCase().includes(s))
      );
    });
  }, [rows, status, tipo, search]);

  const hasFilter = status !== "all" || tipo !== "all" || search.trim() !== "";

  return (
    <div className="gm-card">
      <div className="gm-toolbar">
        <select
          className="gm-select"
          value={status}
          onChange={(e) => onStatus(e.target.value)}
          aria-label="Status"
        >
          <option value="all">Todos os status · {rows.length}</option>
          {GMUD_STATUSES.map((s) => (
            <option key={s} value={s}>
              {s} · {counts[s] ?? 0}
            </option>
          ))}
        </select>
        <div className="gm-seg" role="group" aria-label="Tipo">
          {(
            [
              ["all", "Todos"],
              ["Normal", "Normal"],
              ["Prioritária", "Prioritária"],
              ["Emergencial", "Emergencial"],
            ] as const
          ).map(([k, l]) => (
            <button key={k} type="button" aria-pressed={tipo === k} onClick={() => onTipo(k)}>
              {l}
            </button>
          ))}
        </div>
        <label className="gm-search">
          <Search size={14} />
          <input
            value={search}
            onChange={(e) => onSearch(e.target.value)}
            placeholder="Buscar título, descrição ou aprovador"
            aria-label="Buscar GMUDs"
          />
        </label>
        {hasFilter && (
          <button
            className="gm-btn ghost"
            onClick={() => {
              onStatus("all");
              onTipo("all");
              onSearch("");
            }}
          >
            Limpar
          </button>
        )}
      </div>

      {isLoading ? (
        <div className="gm-empty">Carregando…</div>
      ) : filtered.length === 0 ? (
        <div className="gm-empty">
          {hasFilter ? "Nenhuma GMUD com esses filtros." : "Nenhuma GMUD criada no período."}
        </div>
      ) : (
        <div className="gm-scroll" style={{ maxHeight: 680 }}>
          <table className="gm-table">
            <thead>
              <tr>
                <th>GMUD</th>
                <th>Tipo</th>
                <th>Janela</th>
                <th>Aprovação</th>
                <th>Status</th>
                {anyDeletable && (
                  <th>
                    <span style={{ fontSize: 0 }}>Ações</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {filtered.map((g) => (
                <tr
                  key={g.id}
                  className="clickable"
                  tabIndex={0}
                  onClick={() => onOpen(g)}
                  onKeyDown={(e) => e.key === "Enter" && onOpen(g)}
                >
                  <td>
                    <span className="gm-title">{g.titulo}</span>
                    <span className="gm-desc">
                      <span className="gm-id">{g.id.slice(0, 8)}</span>
                      {g.descricao ? ` · ${g.descricao}` : ""}
                    </span>
                  </td>
                  <td>
                    <TipoBadge tipo={g.tipo} />
                  </td>
                  <td>
                    <span className="gm-win">
                      {fmtShort(g.data_inicio)} →{" "}
                      {sameDay(g.data_inicio, g.data_fim)
                        ? fmtHour(g.data_fim)
                        : fmtShort(g.data_fim)}
                    </span>
                  </td>
                  <td>
                    <ApprovalSteps g={g} />
                  </td>
                  <td>
                    <StatusBadge status={g.status_geral} />
                  </td>
                  {anyDeletable && (
                    <td onClick={(e) => e.stopPropagation()}>
                      {canDeleteRow(g) && (
                        <button
                          className="gm-icon-btn"
                          title="Excluir GMUD"
                          aria-label="Excluir GMUD"
                          onClick={() => onOpen(g, true)}
                        >
                          <Trash2 size={14} />
                        </button>
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
  );
}
