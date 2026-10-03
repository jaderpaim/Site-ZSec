import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { AlertTriangle, CheckCircle2, Clock } from "lucide-react";
import { gmudMetrics, listGmuds } from "@/lib/gmud.functions";
import { useAuth } from "@/lib/auth-context";
import type { GmudRow } from "./gmud-shared";

// Estilos: classes gm-* definidas em GmudReal.tsx (casco do módulo).

const SERIES = [
  { key: "v", name: "Criadas", color: "var(--v2-accent)" },
  { key: "concluidas", name: "Concluídas", color: "var(--v2-ok)" },
  { key: "rollback", name: "Rollback", color: "var(--v2-high)" },
  { key: "rejeitadas", name: "Rejeitadas", color: "var(--v2-crit)" },
] as const;

const TIPOS = [
  { name: "Normal", color: "var(--v2-accent)", hint: "planejadas, seguem a cadeia completa" },
  { name: "Prioritária", color: "var(--v2-med)", hint: "precisam entrar na próxima janela" },
  { name: "Emergencial", color: "var(--v2-crit)", hint: "correção imediata de incidente" },
] as const;

function fmtShort(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}
/** Horas → "36 h" até 48 h; acima disso em dias ("109 d"). */
function fmtHoras(h: number) {
  return h <= 48 ? `${h} h` : `${Math.round(h / 24)} d`;
}
function ago(s: string) {
  const h = Math.max(0, Math.round((Date.now() - new Date(s).getTime()) / 3_600_000));
  return h < 24 ? `há ${h} h` : `há ${Math.round(h / 24)} d`;
}

function VolTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  label?: string;
  payload?: Array<{ dataKey: string; value: number }>;
}) {
  if (!active || !payload?.length) return null;
  const get = (k: string) => payload.find((p) => p.dataKey === k)?.value ?? 0;
  return (
    <div className="gm-tip">
      <b>{label}</b>
      <span>
        Criadas {get("v")} · Concluídas {get("concluidas")}
      </span>
      <span>
        Rollback {get("rollback")} · Rejeitadas {get("rejeitadas")}
      </span>
    </div>
  );
}

export function GmudDashboardTab({
  days,
  onOpen,
  onGoToList,
}: {
  days: number;
  onOpen: (g: GmudRow) => void;
  onGoToList: (f: { status?: string; tipo?: string }) => void;
}) {
  // ── back-end UNCHANGED ────────────────────────────────────────────────────
  const metrics = useServerFn(gmudMetrics);
  const q = useQuery({
    queryKey: ["gmud-metrics", days],
    queryFn: () => metrics({ data: { days } }),
    refetchInterval: 60_000,
  });
  const m = q.data;
  // ─────────────────────────────────────────────────────────────────────────

  // Pendências independem do período: uma GMUD parada há 40 dias continua aqui.
  const list = useServerFn(listGmuds);
  const pendQ = useQuery({
    queryKey: ["gmuds", "all"],
    queryFn: () => list({ data: { status: "all", tipo: "all" } }),
    refetchInterval: 60_000,
  });
  const { user } = useAuth();
  const myEmail = (user?.email ?? "").toLowerCase();

  const att = React.useMemo(() => {
    const all = (pendQ.data ?? []) as GmudRow[];
    const now = Date.now();
    const emAprov = all.filter((g) => g.status_geral === "Em Aprovação");
    const isMine = (g: GmudRow) =>
      (g.aprovadores ?? []).some(
        (a) => a.ativo && (a.email_aprovador ?? "").toLowerCase() === myEmail,
      );
    return {
      emAprov: emAprov.length,
      mine: emAprov.filter(isMine),
      semResultado: all
        .filter(
          (g) =>
            g.status_geral === "Aprovada" && g.data_fim && new Date(g.data_fim).getTime() < now,
        )
        .sort((a, b) => (a.data_fim ?? "").localeCompare(b.data_fim ?? "")),
      paradas: emAprov
        .filter((g) => !isMine(g) && now - new Date(g.created_at).getTime() > 86_400_000)
        .sort((a, b) => a.created_at.localeCompare(b.created_at)),
    };
  }, [pendQ.data, myEmail]);

  const tiposData = m?.tipos ?? [];
  const tiposTotal = tiposData.reduce((s, t) => s + t.value, 0);
  const taxa = m?.taxaSucesso ?? 0;
  const taxaColor = taxa >= 90 ? "var(--v2-ok)" : taxa >= 75 ? "var(--v2-med)" : "var(--v2-crit)";

  const feedSection = (
    title: string,
    items: GmudRow[],
    kind: "" | "warn",
    icon: React.ReactNode,
    line: (g: GmudRow) => string,
  ) =>
    items.length > 0 && (
      <>
        <div className="gm-sub-h">
          {title} · {items.length}
        </div>
        <div className="gm-feed">
          {items.map((g) => (
            <button key={g.id} type="button" onClick={() => onOpen(g)}>
              <span className={`ic ${kind}`}>{icon}</span>
              <span style={{ minWidth: 0 }}>
                <b>{g.titulo}</b>
                <small>{line(g)}</small>
              </span>
              <span className="age">{ago(g.created_at)}</span>
            </button>
          ))}
        </div>
      </>
    );
  const nothingPending = att.mine.length + att.semResultado.length + att.paradas.length === 0;

  return (
    <>
      {/* ── KPIs ───────────────────────────────────────────────────────── */}
      <div className="gm-kpis">
        <div className="gm-kpi">
          <span className="gm-kpi-label">GMUDs no período</span>
          <span className="gm-kpi-value">{m?.total ?? "—"}</span>
          <span className="gm-kpi-foot">
            {m
              ? `${m.concluidas} concluídas · ${m.rollback} rollback · ${m.rejeitadas} rejeitadas`
              : "—"}
          </span>
        </div>
        <div className="gm-kpi">
          <span className="gm-kpi-label">Taxa de sucesso</span>
          <span className="gm-kpi-value">{m ? `${taxa}%` : "—"}</span>
          <div className="gm-meter" aria-hidden="true">
            <i style={{ width: `${taxa}%`, background: taxaColor }} />
          </div>
          <span className="gm-kpi-foot">concluídas ÷ (concluídas + rollback)</span>
        </div>
        <div className="gm-kpi">
          <span className="gm-kpi-label">Tempo médio de aprovação</span>
          <span className="gm-kpi-value">{m ? `${m.mediaAprovHoras} h` : "—"}</span>
          <span className="gm-kpi-foot">da criação até cada decisão</span>
        </div>
        <button
          type="button"
          className="gm-kpi"
          onClick={() => onGoToList({ status: "Em Aprovação" })}
        >
          <span className="gm-kpi-label">
            {att.mine.length > 0 && (
              <span className="gm-sw" style={{ background: "var(--v2-accent)" }} />
            )}
            Em aprovação
          </span>
          <span className="gm-kpi-value">{pendQ.data ? att.emAprov : "—"}</span>
          <span className="gm-kpi-foot">
            {att.mine.length > 0 ? `${att.mine.length} aguardando você` : "nenhuma aguardando você"}
          </span>
        </button>
        <button
          type="button"
          className="gm-kpi"
          onClick={() => onGoToList({ status: "Em Execução" })}
        >
          <span className="gm-kpi-label">Em execução agora</span>
          <span className="gm-kpi-value">{m?.emExecucao ?? "—"}</span>
          <span className="gm-kpi-foot">mudanças em andamento</span>
        </button>
      </div>

      {/* ── Volume + por tipo ──────────────────────────────────────────── */}
      <div className="gm-grid">
        <div className="gm-card gm-span-2">
          <div className="gm-card-hdr">
            <div>
              <h2 className="gm-card-title">Volume de GMUDs</h2>
              <p className="gm-card-sub">
                {days > 60 ? "Por semana de criação" : "Por dia de criação"}
              </p>
            </div>
            <div className="gm-legend">
              {SERIES.map((s) => (
                <span key={s.key}>
                  <span className="gm-sw" style={{ background: s.color }} /> {s.name}
                </span>
              ))}
            </div>
          </div>
          <div className="gm-card-body" style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={m?.serie ?? []} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
                <defs>
                  {SERIES.map((s) => (
                    <linearGradient key={s.key} id={`gm-g-${s.key}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={s.color} stopOpacity={0.22} />
                      <stop offset="100%" stopColor={s.color} stopOpacity={0} />
                    </linearGradient>
                  ))}
                </defs>
                <CartesianGrid stroke="var(--v2-line)" vertical={false} />
                <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={16} />
                <YAxis tickLine={false} axisLine={false} allowDecimals={false} width={32} />
                <Tooltip content={<VolTooltip />} cursor={{ stroke: "var(--v2-line-strong)" }} />
                {SERIES.map((s) => (
                  <Area
                    key={s.key}
                    type="monotone"
                    dataKey={s.key}
                    name={s.name}
                    stroke={s.color}
                    strokeWidth={2}
                    fill={`url(#gm-g-${s.key})`}
                    dot={false}
                    activeDot={{ r: 4, fill: s.color, stroke: "var(--v2-surface)", strokeWidth: 2 }}
                  />
                ))}
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="gm-card">
          <div className="gm-card-hdr">
            <div>
              <h2 className="gm-card-title">Por tipo</h2>
              <p className="gm-card-sub">Clique para ver as mudanças</p>
            </div>
          </div>
          <div className="gm-card-body">
            <div className="gm-types">
              {TIPOS.map((t) => {
                const n = tiposData.find((x) => x.name === t.name)?.value ?? 0;
                const p = tiposTotal > 0 ? Math.round((n / tiposTotal) * 100) : 0;
                return (
                  <button key={t.name} type="button" onClick={() => onGoToList({ tipo: t.name })}>
                    <span>{t.name}</span>
                    <span className="n">{n}</span>
                    <span className="p">{p}%</span>
                    <span className="gm-track">
                      <i style={{ width: `${p}%`, background: t.color }} />
                    </span>
                    <small>{t.hint}</small>
                  </button>
                );
              })}
            </div>
            <div className="gm-tot">
              <span>Total no período</span>
              <b>{tiposTotal}</b>
            </div>
          </div>
        </div>
      </div>

      {/* ── Precisa de atenção + gargalos ──────────────────────────────── */}
      <div className="gm-grid">
        <div className="gm-card gm-span-2">
          <div className="gm-card-hdr">
            <div>
              <h2 className="gm-card-title">Precisa de atenção</h2>
              <p className="gm-card-sub">O que está esperando alguém agir</p>
            </div>
          </div>
          <div className="gm-card-body gm-feed-scroll">
            {pendQ.isLoading ? (
              <div className="gm-empty">Carregando…</div>
            ) : nothingPending ? (
              <div className="gm-ok-state">
                <CheckCircle2 size={22} />
                <b>Nada pendente</b>
                Nenhuma GMUD esperando ação.
              </div>
            ) : (
              <>
                {feedSection(
                  "Aguardando sua aprovação",
                  att.mine,
                  "",
                  <CheckCircle2 size={14} />,
                  (g) => `${g.tipo} · janela ${fmtShort(g.data_inicio)}`,
                )}
                {feedSection(
                  "Janela encerrada, resultado não registrado",
                  att.semResultado,
                  "warn",
                  <AlertTriangle size={14} />,
                  (g) => `Aprovada · janela terminou ${fmtShort(g.data_fim)}`,
                )}
                {feedSection(
                  "Em aprovação há mais de 24 h",
                  att.paradas,
                  "",
                  <Clock size={14} />,
                  (g) => {
                    const a = (g.aprovadores ?? []).find((x) => x.ativo);
                    const total = g.total_aprovadores ?? (g.aprovadores ?? []).length;
                    return a
                      ? `Etapa ${a.ordem} de ${total} · com ${a.nome_aprovador}`
                      : `${g.tipo}`;
                  },
                )}
              </>
            )}
          </div>
        </div>

        <div className="gm-card gm-fit">
          <div className="gm-card-hdr" style={{ paddingBottom: 10 }}>
            <div>
              <h2 className="gm-card-title">Gargalos</h2>
              <p className="gm-card-sub">Aprovadores com pendência há mais de 24 h</p>
            </div>
          </div>
          {(m?.gargalos ?? []).length === 0 ? (
            <div className="gm-empty">Nenhum gargalo no período.</div>
          ) : (
            <div className="gm-scroll">
              <table className="gm-table">
                <thead>
                  <tr>
                    <th>Aprovador</th>
                    <th className="r">Pendências</th>
                    <th className="r">Tempo médio</th>
                  </tr>
                </thead>
                <tbody>
                  {(m?.gargalos ?? []).map((g) => (
                    <tr key={g.email}>
                      <td>
                        <span className="gm-title">{g.nome}</span>
                        <span className="dim" style={{ fontSize: 12 }}>
                          {g.email}
                        </span>
                      </td>
                      <td
                        className="r mono"
                        style={{ color: "color-mix(in oklch, var(--v2-med) 75%, var(--v2-fg))" }}
                      >
                        {g.pendentes}
                      </td>
                      <td className="r mono" title={`${g.tempoMedioH} h`}>
                        {fmtHoras(g.tempoMedioH)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
