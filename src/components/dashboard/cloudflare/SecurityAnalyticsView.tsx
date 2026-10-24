import * as React from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { AnalyticsFilterCondition } from "@/lib/cloudflare.analytics-filters";
import type {
  SecurityEventLog,
  SecurityEventsTopStats,
  SecurityKpiKey,
  SecuritySampledLog,
  SecurityTopStats,
} from "@/lib/cloudflare.security.functions";
import { ModuleLoading } from "@/components/layout/ModuleLoading";

// Seção Security do Analytics no layout da repaginada (Opção B): Tráfego /
// Eventos, faixa de indicadores clicáveis, gráfico empilhado, blocos em grade
// e Sampled logs com as janelas flutuantes de detalhe. Os dados, filtros e
// janelas continuam vindo do AnalyticsTab.

type Rows = Array<{ value: string; count: number }> | undefined | null;
type Labeler = (v: string) => string;
type Colorer = (v: string, idx: number) => string;

export type SecurityAnalyticsViewProps = {
  isLive: boolean;
  tab: "traffic" | "events";
  setTab: (t: "traffic" | "events") => void;
  // Tráfego
  trafficFilterBar: React.ReactNode;
  setTrafficFilters: React.Dispatch<React.SetStateAction<AnalyticsFilterCondition[]>>;
  overview: {
    suspiciousActivityCount: number | null;
    totals: {
      total: number;
      mitigatedByWaf: number;
      servedByCloudflare: number;
      servedByOrigin: number;
    };
    series: Array<{
      ts: string;
      mitigatedByWaf: number;
      servedByCloudflare: number;
      servedByOrigin: number;
    }>;
  } | null;
  overviewLoading: boolean;
  overviewError: string | null;
  activeKpi: SecurityKpiKey;
  setActiveKpi: (k: SecurityKpiKey) => void;
  attackTotals: Array<{ score: string; count: number }>;
  activeAttackScore: string | null;
  setActiveAttackScore: (s: string | null) => void;
  botDecisions: Array<{ decision: string; count: number }>;
  botSources: Array<{ source: string; count: number }>;
  activeBotDecision: string | null;
  setActiveBotDecision: (d: string | null) => void;
  topStats: SecurityTopStats | null;
  topStatsLoading: boolean;
  logs: SecuritySampledLog[];
  logsLoading: boolean;
  onOpenLog: (l: SecuritySampledLog, e: React.MouseEvent) => void;
  /** Linhas com janela de detalhe aberta (marcadas na tabela) */
  openLogKeys: string[];
  // Eventos
  eventsFilterBar: React.ReactNode;
  setEventsFilters: React.Dispatch<React.SetStateAction<AnalyticsFilterCondition[]>>;
  events: {
    total: number;
    actionTotals: Array<{ action: string; count: number }>;
    series: Array<Record<string, number | string>>;
    byService: Array<{ source: string; count: number }>;
  } | null;
  eventsLoading: boolean;
  eventsError: string | null;
  eventsTopStats: SecurityEventsTopStats | null;
  eventLogs: SecurityEventLog[];
  eventLogsLoading: boolean;
  onOpenEventLog: (l: SecurityEventLog, e: React.MouseEvent) => void;
  openEventLogKeys: string[];
  // Rótulos/cores do AnalyticsTab
  attackScoreLabel: Labeler;
  attackScoreColor: Colorer;
  botDecisionLabel: Labeler;
  botDecisionColor: Colorer;
  botSourceLabel: Labeler;
  eventActionLabel: Labeler;
  eventActionColor: Colorer;
  eventServiceLabel: Labeler;
};

const fmt = (n: number) => n.toLocaleString("pt-BR");
const fk = (n: number) =>
  n >= 1e6
    ? `${(n / 1e6).toFixed(1).replace(".", ",")} mi`
    : n >= 1e5
      ? `${Math.round(n / 1e3)} mil`
      : n >= 1e3
        ? `${(n / 1e3).toFixed(1).replace(".", ",")} mil`
        : String(n);
const pct = (a: number, b: number) =>
  b
    ? `${((a / b) * 100).toLocaleString("pt-BR", { maximumFractionDigits: a / b < 0.01 ? 2 : 1 })}%`
    : "—";
const hourLabel = (ts: string) => {
  try {
    return new Date(ts).toLocaleString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return ts;
  }
};

const CSS = `
.sa { display:flex; flex-direction:column; gap:14px; min-width:0; font-family:var(--font-ui); color:var(--v2-fg); }
.sa-bar { display:flex; gap:8px; align-items:center; flex-wrap:wrap; }
.sa-seg { display:inline-flex; padding:2px; gap:2px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-surface); }
.sa-seg button { height:28px; padding:0 12px; border:0; border-radius:6px; background:transparent; color:var(--v2-fg-2); font:500 13px var(--font-ui); cursor:pointer; }
.sa-seg button[aria-pressed="true"] { background:var(--v2-surface-2); color:var(--v2-fg); box-shadow:0 0 0 1px var(--v2-line); }
.sa-kpis { display:grid; grid-template-columns:repeat(auto-fit,minmax(160px,1fr)); background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
.sa-kpi { padding:14px 16px 12px; display:grid; gap:2px; text-align:left; border:0; background:transparent; box-shadow:1px 0 0 var(--v2-line), 0 1px 0 var(--v2-line); font:inherit; color:inherit; }
button.sa-kpi { cursor:pointer; } button.sa-kpi:hover { background:var(--v2-hover); }
.sa-kpi[aria-pressed="true"] { box-shadow:inset 0 -2px 0 var(--v2-accent), 1px 0 0 var(--v2-line); }
.sa-kpi .l { font-size:12.5px; color:var(--v2-fg-2); display:flex; gap:6px; align-items:center; }
.sa-kpi .sw { width:8px; height:8px; border-radius:2px; display:inline-block; }
.sa-kpi .v { font-size:24px; font-weight:600; letter-spacing:-0.02em; font-variant-numeric:tabular-nums; }
.sa-kpi .f { font-size:12px; color:var(--v2-fg-3); }
.sa-grid { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:14px; }
.sa-grid .s2 { grid-column:span 2; } .sa-grid .s3 { grid-column:span 3; } .sa-grid .s6 { grid-column:span 6; }
@media (max-width:1100px) { .sa-grid { grid-template-columns:1fr 1fr; } .sa-grid .s2, .sa-grid .s3, .sa-grid .s6 { grid-column:span 2; } }
@media (max-width:640px) { .sa-grid { grid-template-columns:minmax(0,1fr); } .sa-grid .s2, .sa-grid .s3, .sa-grid .s6 { grid-column:span 1; } }
.sa-blk { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; min-width:0; display:flex; flex-direction:column; }
.sa-bh { display:flex; align-items:center; gap:8px; padding:12px 14px 6px; flex-wrap:wrap; }
.sa-bh b { font-size:13.5px; font-weight:600; } .sa-bh small { font-size:12px; color:var(--v2-fg-3); }
.sa-bb { padding:6px 14px 14px; flex:1; min-width:0; }
.sa-rank { display:grid; gap:8px; }
.sa-r { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:4px 10px; font-size:12.5px; width:100%; border:0; background:transparent; padding:2px 0; text-align:left; color:inherit; font-family:inherit; }
button.sa-r { cursor:pointer; } button.sa-r:hover .n { text-decoration:underline; text-underline-offset:3px; }
.sa-r[aria-pressed="true"] .n { color:var(--v2-accent); font-weight:600; }
.sa-r .n { font-family:var(--font-data); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.sa-r .v { font:500 12.5px var(--font-data); color:var(--v2-fg-2); font-variant-numeric:tabular-nums; }
.sa-r .t { grid-column:1 / -1; height:6px; border-radius:3px; background:var(--v2-surface-2); overflow:hidden; }
.sa-r .t i { display:block; height:100%; border-radius:3px; background:var(--c); }
.sa-empty { font-size:12.5px; color:var(--v2-fg-3); padding:6px 0; }
.sa-sec { font-size:12px; font-weight:600; letter-spacing:.05em; text-transform:uppercase; color:var(--v2-fg-3); display:flex; gap:8px; align-items:center; margin-top:4px; }
.sa-hist { display:flex; align-items:flex-end; gap:6px; height:120px; }
.sa-hist button { flex:1; min-width:0; border:0; padding:0; background:transparent; cursor:pointer; display:flex; flex-direction:column; justify-content:flex-end; height:100%; gap:4px; }
.sa-hist i { display:block; width:100%; border-radius:3px 3px 0 0; min-height:2px; }
.sa-hist span { font-size:11px; color:var(--v2-fg-3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.sa-hist button[aria-pressed="true"] span { color:var(--v2-accent); font-weight:600; }
.sa-leg { display:flex; gap:14px; flex-wrap:wrap; font-size:12px; color:var(--v2-fg-2); margin-bottom:6px; }
.sa-leg span { display:inline-flex; gap:6px; align-items:center; } .sa-leg i { width:10px; height:10px; border-radius:3px; display:inline-block; }
.sa-tw { overflow-x:auto; border-top:1px solid var(--v2-line); }
.sa-tw table { width:100%; border-collapse:collapse; font-size:12.5px; }
.sa-tw th { text-align:left; font-weight:500; font-size:11.5px; color:var(--v2-fg-3); padding:8px 12px; border-bottom:1px solid var(--v2-line); white-space:nowrap; }
.sa-tw td { padding:8px 12px; border-bottom:1px solid var(--v2-line); white-space:nowrap; }
.sa-tw tbody tr { cursor:pointer; } .sa-tw tbody tr:hover td { background:var(--v2-hover); }
.sa-tw tr:last-child td { border-bottom:0; }
.sa-tw tbody tr.sa-open td { background:color-mix(in oklch, var(--v2-accent) 12%, transparent); }
.sa-tw tbody tr.sa-open td:first-child { box-shadow:inset 3px 0 0 var(--v2-accent); }
.sa-tw tbody tr.sa-open td:first-child::after { content:"aberta"; margin-left:8px; font:600 10.5px var(--font-ui); color:var(--v2-accent); text-transform:uppercase; letter-spacing:.04em; }
.sa-m { font-family:var(--font-data); }
.sa-trunc { max-width:220px; overflow:hidden; text-overflow:ellipsis; }
.sa-pill { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; white-space:nowrap; background:color-mix(in oklch, var(--c) 14%, transparent); color:color-mix(in oklch, var(--c) 72%, var(--v2-fg)); }
.sa-pill::before { content:""; width:6px; height:6px; border-radius:50%; background:var(--c); }
.sa-more { display:flex; justify-content:space-between; align-items:center; gap:8px; padding:10px 14px; border-top:1px solid var(--v2-line); font-size:12.5px; color:var(--v2-fg-3); }
.sa-state { padding:28px 16px; text-align:center; color:var(--v2-fg-3); border:1px dashed var(--v2-line-strong); border-radius:12px; font-size:13px; }
`;

function Block({
  span,
  title,
  sub,
  children,
}: {
  span: string;
  title: string;
  sub?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={`sa-blk ${span}`}>
      <div className="sa-bh">
        <b>{title}</b>
        {sub && <small>{sub}</small>}
      </div>
      <div className="sa-bb">{children}</div>
    </section>
  );
}

function Rank({
  rows,
  color = "var(--v2-accent)",
  label,
  onPick,
  active,
  limit = 6,
}: {
  rows: Rows;
  color?: string;
  label?: Labeler;
  onPick?: (v: string) => void;
  active?: string | null;
  limit?: number;
}) {
  const list = (rows ?? []).slice(0, limit);
  if (!list.length) return <div className="sa-empty">Sem dados no período.</div>;
  const mx = Math.max(1, ...list.map((r) => r.count));
  return (
    <div className="sa-rank">
      {list.map((r) => {
        const inner = (
          <>
            <span className="n" title={r.value}>
              {label ? label(r.value) : r.value || "—"}
            </span>
            <span className="v">{fk(r.count)}</span>
            <span className="t">
              <i style={{ width: `${(r.count / mx) * 100}%` }} />
            </span>
          </>
        );
        return onPick ? (
          <button
            key={r.value}
            className="sa-r"
            style={{ "--c": color } as React.CSSProperties}
            aria-pressed={active === r.value}
            title={`Filtrar por ${label ? label(r.value) : r.value}`}
            onClick={() => onPick(r.value)}
          >
            {inner}
          </button>
        ) : (
          <div key={r.value} className="sa-r" style={{ "--c": color } as React.CSSProperties}>
            {inner}
          </div>
        );
      })}
    </div>
  );
}

function Stacked({
  data,
  keys,
}: {
  data: Array<Record<string, number | string>>;
  keys: Array<{ key: string; label: string; color: string }>;
}) {
  if (!data.length) return <div className="sa-empty">Sem dados no período.</div>;
  return (
    <>
      <div className="sa-leg">
        {keys.map((k) => (
          <span key={k.key}>
            <i style={{ background: k.color }} />
            {k.label}
          </span>
        ))}
      </div>
      <div style={{ height: 220 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
            <CartesianGrid stroke="var(--v2-line)" vertical={false} />
            <XAxis
              dataKey="ts"
              tickFormatter={hourLabel}
              tick={{ fontSize: 11, fill: "var(--v2-fg-3)" }}
              axisLine={false}
              tickLine={false}
              minTickGap={40}
            />
            <YAxis
              tickFormatter={(v) => fk(Number(v))}
              tick={{ fontSize: 11, fill: "var(--v2-fg-3)" }}
              axisLine={false}
              tickLine={false}
              width={48}
            />
            <Tooltip
              labelFormatter={(v) => hourLabel(String(v))}
              formatter={(v: number, name: string) => [
                fmt(Number(v)),
                keys.find((k) => k.key === name)?.label ?? name,
              ]}
              contentStyle={{
                background: "var(--v2-surface)",
                border: "1px solid var(--v2-line)",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            {keys.map((k) => (
              <Area
                key={k.key}
                type="monotone"
                dataKey={k.key}
                stackId="1"
                stroke={k.color}
                fill={k.color}
                fillOpacity={0.35}
                strokeWidth={1.5}
              />
            ))}
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

const PAGE = 15;
// Mesma chave usada pelo AnalyticsTab para as janelas de detalhe
const logKey = (l: { rayName: string; datetime: string; clientIP: string }) =>
  l.rayName || `${l.datetime}-${l.clientIP}`;

export function SecurityAnalyticsView(p: SecurityAnalyticsViewProps) {
  const [shown, setShown] = React.useState(PAGE);
  React.useEffect(() => setShown(PAGE), [p.tab, p.logs, p.eventLogs]);
  const add = (field: string) => (v: string) =>
    p.setTrafficFilters((f) => [...f, { field, op: "eq", value: v }]);
  const addEv = (field: string) => (v: string) =>
    p.setEventsFilters((f) => [...f, { field, op: "eq", value: v }]);

  const seg = (
    <div className="sa-seg" role="group" aria-label="Visão">
      <button aria-pressed={p.tab === "traffic"} onClick={() => p.setTab("traffic")}>
        Tráfego
      </button>
      <button aria-pressed={p.tab === "events"} onClick={() => p.setTab("events")}>
        Eventos
      </button>
    </div>
  );

  if (!p.isLive)
    return (
      <div className="sa">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="sa-bar">{seg}</div>
        <div className="sa-state">
          Security Analytics só funciona na janela ao vivo: selecione uma zona e um período de até 4
          dias.
        </div>
      </div>
    );

  // ── Eventos ──
  if (p.tab === "events") {
    const ev = p.events;
    const s = p.eventsTopStats;
    const actions = [...(ev?.actionTotals ?? [])].sort((a, b) => b.count - a.count);
    const seriesKeys = actions.map((a, i) => ({
      key: a.action,
      label: p.eventActionLabel(a.action),
      color: p.eventActionColor(a.action, i),
    }));
    const logs = p.eventLogs;
    return (
      <div className="sa">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="sa-bar">{seg}</div>
        {p.eventsFilterBar}
        {p.eventsLoading ? (
          <ModuleLoading />
        ) : !ev ? (
          <div className="sa-state">
            Erro ao carregar Events{p.eventsError ? `: ${p.eventsError}` : ""}
          </div>
        ) : (
          <>
            <div className="sa-kpis">
              <div className="sa-kpi">
                <span className="l">
                  <i className="sw" style={{ background: "var(--v2-crit)" }} />
                  Number of events
                </span>
                <span className="v">{fk(ev.total)}</span>
                <span className="f">eventos de segurança no período</span>
              </div>
              {actions.slice(0, 4).map((a, i) => (
                <button
                  key={a.action}
                  className="sa-kpi"
                  title={`Filtrar por ${p.eventActionLabel(a.action)}`}
                  onClick={() => addEv("action")(a.action)}
                >
                  <span className="l">
                    <i className="sw" style={{ background: p.eventActionColor(a.action, i) }} />
                    {p.eventActionLabel(a.action)}
                  </span>
                  <span className="v">{fk(a.count)}</span>
                  <span className="f">{pct(a.count, ev.total)} dos eventos</span>
                </button>
              ))}
            </div>
            <div className="sa-grid">
              <Block span="s6" title="Events by action" sub="por hora">
                <Stacked data={ev.series} keys={seriesKeys} />
              </Block>
              <Block span="s2" title="Security actions">
                <Rank
                  rows={actions.map((a) => ({ value: a.action, count: a.count }))}
                  label={p.eventActionLabel}
                  color="var(--v2-crit)"
                  onPick={addEv("action")}
                />
              </Block>
              <Block span="s2" title="Security services">
                <Rank
                  rows={ev.byService.map((x) => ({ value: x.source, count: x.count }))}
                  label={p.eventServiceLabel}
                  color="var(--v2-crit)"
                  onPick={addEv("source")}
                />
              </Block>
              <Block span="s2" title="Countries">
                <Rank rows={s?.countries} color="var(--v2-crit)" onPick={addEv("country")} />
              </Block>
            </div>
            <div className="sa-sec">Top events by source</div>
            <div className="sa-grid">
              <Block span="s2" title="Source IP Addresses">
                <Rank rows={s?.clientIPs} color="var(--v2-crit)" onPick={addEv("ip")} />
              </Block>
              <Block span="s2" title="Source ASNs">
                <Rank
                  rows={s?.asns}
                  color="var(--v2-crit)"
                  onPick={(v) => addEv("asn")(v.replace(/^AS/, "").split(" ")[0])}
                />
              </Block>
              <Block span="s2" title="Paths">
                <Rank rows={s?.paths} color="var(--v2-crit)" onPick={addEv("path")} />
              </Block>
              <Block span="s2" title="Hosts">
                <Rank rows={s?.hosts} color="var(--v2-crit)" onPick={addEv("host")} />
              </Block>
              <Block span="s2" title="User Agents">
                <Rank rows={s?.userAgents} color="var(--v2-crit)" onPick={addEv("userAgent")} />
              </Block>
              <Block span="s2" title="HTTP Methods">
                <Rank rows={s?.methods} color="var(--v2-crit)" onPick={addEv("method")} />
              </Block>
              <Block span="s3" title="Custom rules">
                <Rank rows={s?.customRules} color="var(--v2-crit)" onPick={addEv("ruleId")} />
              </Block>
              <Block span="s3" title="Managed rules">
                <Rank rows={s?.managedRules} color="var(--v2-crit)" onPick={addEv("ruleId")} />
              </Block>
              <Block span="s3" title="Rate limiting rules">
                <Rank rows={s?.rateLimitRules} color="var(--v2-crit)" onPick={addEv("ruleId")} />
              </Block>
              <Block span="s3" title="HTTP DDoS rules">
                <Rank rows={s?.ddosRules} color="var(--v2-crit)" onPick={addEv("ruleId")} />
              </Block>
              <Block span="s3" title="Referers">
                <Rank rows={s?.referers} color="var(--v2-crit)" onPick={addEv("referer")} />
              </Block>
            </div>
            <section className="sa-blk">
              <div className="sa-bh">
                <b>Sampled logs</b>
                <small>
                  clique numa linha para abrir os detalhes · dá para abrir várias janelas e arrastar
                </small>
              </div>
              <div className="sa-tw">
                <table>
                  <thead>
                    <tr>
                      <th>Quando</th>
                      <th>Ação</th>
                      <th>Host</th>
                      <th>Path</th>
                      <th>Regra</th>
                      <th>Serviço</th>
                      <th>País</th>
                      <th>IP</th>
                    </tr>
                  </thead>
                  <tbody>
                    {p.eventLogsLoading && !logs.length ? (
                      <tr>
                        <td colSpan={8} className="sa-empty">
                          Carregando…
                        </td>
                      </tr>
                    ) : logs.length === 0 ? (
                      <tr>
                        <td colSpan={8} className="sa-empty">
                          Nenhum evento no período.
                        </td>
                      </tr>
                    ) : (
                      logs.slice(0, shown).map((l, i) => (
                        <tr
                          key={`${l.rayName}-${i}`}
                          className={p.openEventLogKeys.includes(logKey(l)) ? "sa-open" : undefined}
                          aria-selected={p.openEventLogKeys.includes(logKey(l))}
                          onClick={(e) => p.onOpenEventLog(l, e)}
                        >
                          <td className="sa-m">{hourLabel(l.datetime)}</td>
                          <td>
                            <span
                              className="sa-pill"
                              style={
                                { "--c": p.eventActionColor(l.action, 0) } as React.CSSProperties
                              }
                            >
                              {p.eventActionLabel(l.action)}
                            </span>
                          </td>
                          <td className="sa-m sa-trunc">{l.host}</td>
                          <td className="sa-m sa-trunc" title={l.path}>
                            {l.path}
                          </td>
                          <td className="sa-trunc" title={l.description || l.ruleId}>
                            {l.description || l.ruleId}
                          </td>
                          <td>{p.eventServiceLabel(l.source)}</td>
                          <td>{l.clientCountryName}</td>
                          <td className="sa-m">{l.clientIP}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
              {logs.length > shown && (
                <div className="sa-more">
                  <span>
                    {shown} de {logs.length}
                  </span>
                  <button className="cf-btn sm" onClick={() => setShown((n) => n + PAGE)}>
                    Mostrar mais
                  </button>
                </div>
              )}
            </section>
          </>
        )}
      </div>
    );
  }

  // ── Tráfego ──
  const ov = p.overview;
  const s = p.topStats;
  const attack = p.attackTotals
    .filter((a) => a.score === "attack" || a.score === "likely_attack")
    .reduce((n, a) => n + a.count, 0);
  const attackAll = p.attackTotals.reduce((n, a) => n + a.count, 0);
  const bots = p.botDecisions
    .filter((d) => d.decision === "automated" || d.decision === "likely_automated")
    .reduce((n, d) => n + d.count, 0);
  const botsAll = p.botDecisions.reduce((n, d) => n + d.count, 0);
  const kpi = (k: SecurityKpiKey) => p.setActiveKpi(p.activeKpi === k ? "total" : k);
  const attackMax = Math.max(1, ...p.attackTotals.map((a) => a.count));
  const logs = p.logs;

  return (
    <div className="sa">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="sa-bar">{seg}</div>
      {p.trafficFilterBar}
      {p.overviewLoading ? (
        <ModuleLoading />
      ) : !ov ? (
        <div className="sa-state">
          Erro ao carregar Security{p.overviewError ? `: ${p.overviewError}` : ""}
        </div>
      ) : (
        <>
          <div className="sa-kpis">
            <button
              className="sa-kpi"
              aria-pressed={p.activeKpi === "mitigatedByWaf"}
              onClick={() => kpi("mitigatedByWaf")}
            >
              <span className="l">
                <i className="sw" style={{ background: "var(--v2-crit)" }} />
                Mitigated
              </span>
              <span className="v">{fk(ov.totals.mitigatedByWaf)}</span>
              <span className="f">
                {pct(ov.totals.mitigatedByWaf, ov.totals.total)} das requisições
              </span>
            </button>
            <button
              className="sa-kpi"
              aria-pressed={p.activeKpi === "servedByCloudflare"}
              onClick={() => kpi("servedByCloudflare")}
            >
              <span className="l">
                <i className="sw" style={{ background: "var(--v2-ok)" }} />
                Served by Cloudflare
              </span>
              <span className="v">{fk(ov.totals.servedByCloudflare)}</span>
              <span className="f">
                {pct(ov.totals.servedByCloudflare, ov.totals.total)} do cache
              </span>
            </button>
            <button
              className="sa-kpi"
              aria-pressed={p.activeKpi === "servedByOrigin"}
              onClick={() => kpi("servedByOrigin")}
            >
              <span className="l">
                <i className="sw" style={{ background: "var(--v2-accent)" }} />
                Served by origin
              </span>
              <span className="v">{fk(ov.totals.servedByOrigin)}</span>
              <span className="f">
                {pct(ov.totals.servedByOrigin, ov.totals.total)} das requisições
              </span>
            </button>
            <button
              className="sa-kpi"
              aria-pressed={p.activeAttackScore === "attack"}
              onClick={() =>
                p.setActiveAttackScore(p.activeAttackScore === "attack" ? null : "attack")
              }
              title="Filtrar por requisições classificadas como ataque"
            >
              <span className="l">
                <i className="sw" style={{ background: "var(--v2-high)" }} />
                Ataques prováveis
              </span>
              <span className="v">{attackAll ? fk(attack) : "—"}</span>
              <span className="f">
                {attackAll
                  ? `${pct(attack, attackAll)} · WAF attack score`
                  : "sem pontuação no período"}
              </span>
            </button>
            <button
              className="sa-kpi"
              aria-pressed={p.activeBotDecision === "automated"}
              onClick={() =>
                p.setActiveBotDecision(p.activeBotDecision === "automated" ? null : "automated")
              }
              title="Filtrar por requisições automatizadas"
            >
              <span className="l">Bots prováveis</span>
              <span className="v">{botsAll ? pct(bots, botsAll) : "—"}</span>
              <span className="f">
                {botsAll ? `${fk(bots)} automatizadas` : "sem bot management no período"}
              </span>
            </button>
          </div>

          <div className="sa-grid">
            <Block
              span="s6"
              title="Number of requests mitigated and served by Cloudflare"
              sub="por hora"
            >
              <Stacked
                data={ov.series}
                keys={[
                  {
                    key: "servedByCloudflare",
                    label: "Servidas pela Cloudflare",
                    color: "var(--v2-ok)",
                  },
                  {
                    key: "servedByOrigin",
                    label: "Servidas pela origem",
                    color: "var(--v2-accent)",
                  },
                  { key: "mitigatedByWaf", label: "Mitigadas", color: "var(--v2-crit)" },
                ]}
              />
            </Block>
            <Block span="s3" title="Requests by WAF attack score" sub="clique para filtrar">
              {p.attackTotals.length ? (
                <div className="sa-hist">
                  {p.attackTotals.map((a, i) => (
                    <button
                      key={a.score}
                      aria-pressed={p.activeAttackScore === a.score}
                      title={`${p.attackScoreLabel(a.score)}: ${fmt(a.count)} (${pct(a.count, attackAll)})`}
                      onClick={() =>
                        p.setActiveAttackScore(p.activeAttackScore === a.score ? null : a.score)
                      }
                    >
                      <i
                        style={{
                          height: `${Math.max(2, (a.count / attackMax) * 100)}%`,
                          background: p.attackScoreColor(a.score, i),
                        }}
                      />
                      <span>{p.attackScoreLabel(a.score)}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="sa-empty">
                  Sem pontuação de ataque no período (pode depender do plano).
                </div>
              )}
            </Block>
            <Block span="s3" title="Requests by bot management decision" sub="clique para filtrar">
              <Rank
                rows={p.botDecisions.map((d) => ({ value: d.decision, count: d.count }))}
                label={p.botDecisionLabel}
                color="var(--v2-high)"
                active={p.activeBotDecision}
                onPick={(v) => p.setActiveBotDecision(p.activeBotDecision === v ? null : v)}
              />
            </Block>
            <Block span="s2" title="Requests by detection source">
              <Rank
                rows={p.botSources.map((x) => ({ value: x.source, count: x.count }))}
                label={p.botSourceLabel}
              />
            </Block>
            <Block span="s2" title="Source browsers">
              <Rank rows={s?.browsers} onPick={add("browser")} />
            </Block>
            <Block span="s2" title="Source operating systems">
              <Rank rows={s?.operatingSystems} onPick={add("os")} />
            </Block>
            <Block span="s3" title="Web asset endpoints" sub="API descobertas">
              <Rank rows={s?.apiGatewayEndpoints} onPick={add("apiGatewayEndpoint")} />
            </Block>
            <Block span="s3" title="Source device types">
              <Rank rows={s?.deviceTypes} onPick={add("deviceType")} />
            </Block>
          </div>

          <div className="sa-sec">
            Top statistics
            {p.topStatsLoading && (
              <span style={{ fontWeight: 400, textTransform: "none" }}>carregando…</span>
            )}
          </div>
          <div className="sa-grid">
            <Block span="s2" title="Source IPs">
              <Rank rows={s?.clientIPs} onPick={add("ip")} />
            </Block>
            <Block span="s2" title="Hosts">
              <Rank rows={s?.hosts} onPick={add("host")} />
            </Block>
            <Block span="s2" title="Paths">
              <Rank rows={s?.paths} onPick={add("path")} />
            </Block>
            <Block span="s2" title="Countries">
              <Rank rows={s?.countries} onPick={add("country")} />
            </Block>
            <Block span="s2" title="Source ASNs">
              <Rank rows={s?.asns} onPick={(v) => add("asn")(v.replace(/^AS/, "").split(" ")[0])} />
            </Block>
            <Block span="s2" title="Source user agents">
              <Rank rows={s?.userAgents} onPick={add("userAgent")} />
            </Block>
            <Block span="s2" title="Security services">
              <Rank
                rows={s?.securitySources}
                color="var(--v2-crit)"
                onPick={add("securitySource")}
              />
            </Block>
            <Block span="s2" title="Security actions">
              <Rank
                rows={s?.securityActions}
                color="var(--v2-crit)"
                onPick={add("securityAction")}
              />
            </Block>
            <Block span="s2" title="Edge status codes">
              <Rank rows={s?.edgeStatusCodes} color="var(--v2-ok)" onPick={add("statusCodeEdge")} />
            </Block>
            <Block span="s2" title="Origin status codes">
              <Rank
                rows={s?.originStatusCodes}
                color="var(--v2-ok)"
                onPick={add("statusCodeOrigin")}
              />
            </Block>
            <Block span="s2" title="Cache statuses">
              <Rank rows={s?.cacheStatuses} color="var(--v2-ok)" onPick={add("cacheStatus")} />
            </Block>
            <Block span="s2" title="Origin IPs">
              <Rank rows={s?.originIPs} onPick={add("originIp")} />
            </Block>
            <Block span="s2" title="HTTP methods">
              <Rank rows={s?.methods} onPick={add("method")} />
            </Block>
            <Block span="s2" title="HTTP versions">
              <Rank rows={s?.httpVersions} onPick={add("httpVersion")} />
            </Block>
            <Block span="s2" title="SSL Protocols">
              <Rank rows={s?.sslProtocols} onPick={add("sslProtocol")} />
            </Block>
            <Block span="s2" title="Data centers">
              <Rank rows={s?.dataCenters} onPick={add("dataCenter")} />
            </Block>
            <Block span="s2" title="Query strings">
              <Rank rows={s?.queryStrings} onPick={add("queryString")} />
            </Block>
            <Block span="s2" title="Referers">
              <Rank rows={s?.referers} onPick={add("referer")} />
            </Block>
            <Block span="s2" title="X-Requested-With headers">
              <Rank rows={s?.xRequestedWith} onPick={add("xRequestedWith")} />
            </Block>
          </div>

          <section className="sa-blk">
            <div className="sa-bh">
              <b>Sampled logs</b>
              <small>
                clique numa linha para abrir os detalhes · dá para abrir várias janelas e arrastar
              </small>
            </div>
            <div className="sa-tw">
              <table>
                <thead>
                  <tr>
                    <th>Quando</th>
                    <th>Método</th>
                    <th>Host</th>
                    <th>Path</th>
                    <th>Status</th>
                    <th>Cache</th>
                    <th>País</th>
                    <th>IP</th>
                    <th>Mitigação</th>
                  </tr>
                </thead>
                <tbody>
                  {p.logsLoading && !logs.length ? (
                    <tr>
                      <td colSpan={9} className="sa-empty">
                        Carregando…
                      </td>
                    </tr>
                  ) : logs.length === 0 ? (
                    <tr>
                      <td colSpan={9} className="sa-empty">
                        Nenhuma requisição no período.
                      </td>
                    </tr>
                  ) : (
                    logs.slice(0, shown).map((l, i) => {
                      const st = Number(l.edgeResponseStatus);
                      const mit =
                        l.securityAction && l.securityAction !== "unknown" ? l.securityAction : "";
                      return (
                        <tr
                          key={`${l.rayName}-${i}`}
                          className={p.openLogKeys.includes(logKey(l)) ? "sa-open" : undefined}
                          aria-selected={p.openLogKeys.includes(logKey(l))}
                          onClick={(e) => p.onOpenLog(l, e)}
                        >
                          <td className="sa-m">{hourLabel(l.datetime)}</td>
                          <td>{l.method}</td>
                          <td className="sa-m sa-trunc">{l.host}</td>
                          <td className="sa-m sa-trunc" title={l.path}>
                            {l.path}
                          </td>
                          <td>
                            <span
                              className="sa-pill"
                              style={
                                {
                                  "--c":
                                    st >= 500
                                      ? "var(--v2-crit)"
                                      : st >= 400
                                        ? "var(--v2-med)"
                                        : "var(--v2-ok)",
                                } as React.CSSProperties
                              }
                            >
                              {st || "—"}
                            </span>
                          </td>
                          <td>{l.cacheStatus || "—"}</td>
                          <td>{l.clientCountryName}</td>
                          <td className="sa-m">{l.clientIP}</td>
                          <td>
                            {mit ? (
                              <span
                                className="sa-pill"
                                style={
                                  {
                                    "--c": mit === "block" ? "var(--v2-crit)" : "var(--v2-high)",
                                  } as React.CSSProperties
                                }
                              >
                                {mit}
                              </span>
                            ) : (
                              <span style={{ color: "var(--v2-fg-3)" }}>—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
            {logs.length > shown && (
              <div className="sa-more">
                <span>
                  {shown} de {logs.length}
                </span>
                <button className="cf-btn sm" onClick={() => setShown((n) => n + PAGE)}>
                  Mostrar mais
                </button>
              </div>
            )}
          </section>
        </>
      )}
    </div>
  );
}
