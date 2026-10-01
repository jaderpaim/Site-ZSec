import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip } from "recharts";
import {
  getLoadBalancingOverview,
  getLoadBalancingLogs,
  type LbLogEvent,
} from "@/lib/cloudflare.loadbalancing.functions";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { AlertTriangle, Info } from "lucide-react";

// ── Design tokens (mesmos do resto da aba Analytics) ───────────────────────────
const T = {
  surface: "#0F1420",
  surfaceAlt: "#131825",
  border: "#1E2640",
  borderHi: "#2A3560",
  accent: "#3B82F6",
  accentGlow: "rgba(59,130,246,0.15)",
  accentSoft: "rgba(59,130,246,0.08)",
  success: "#10B981",
  danger: "#F87171",
  warning: "#F59E0B",
  textPrimary: "#F1F5F9",
  textMuted: "#8B96AC",
  textDim: "#5B6478",
};

const POOL_PALETTE = [T.accent, T.success, T.warning, "#EC4899", "#A78BFA", "#F87171"];

const CSS = `
  .lb-root { display:flex; flex-direction:column; gap:16px; }
  .lb-root input, .lb-root select {
    background:${T.surfaceAlt}; border:1px solid ${T.border}; color:${T.textPrimary};
    font-family:'IBM Plex Mono',monospace; font-size:12px; border-radius:6px; padding:6px 8px;
  }
  .lb-select-trigger { background:${T.surfaceAlt} !important; border:1px solid ${T.border} !important; color:${T.textPrimary} !important; font-family:'IBM Plex Mono',monospace !important; font-size:12px !important; height:32px !important; }
  .lb-select-content { background:${T.surface} !important; border:1px solid ${T.borderHi} !important; color:${T.textPrimary} !important; z-index:1000 !important; }
  .lb-select-item { color:${T.textPrimary} !important; font-family:'IBM Plex Mono',monospace !important; font-size:12px !important; cursor:pointer !important; }
  .lb-select-item[data-highlighted] { background:${T.accentGlow} !important; color:${T.accent} !important; }

  .lb-subnav { display:flex; gap:4px; padding:14px 20px; background:${T.surface}; border:1px solid ${T.border}; border-radius:10px; }
  .lb-subnav button { padding:7px 14px; border-radius:7px; border:none; background:transparent; color:${T.textMuted}; font-size:12.5px; font-weight:600; cursor:pointer; font-family:'DM Sans',sans-serif; display:flex; align-items:center; gap:6px; }
  .lb-subnav button.active { background:${T.accentGlow}; color:${T.accent}; }
  .lb-subnav button.soon { opacity:0.45; cursor:not-allowed; }
  .lb-soon-tag { font-size:8.5px; font-family:'IBM Plex Mono',monospace; letter-spacing:0.06em; padding:1px 5px; border-radius:4px; background:rgba(139,150,172,0.15); color:${T.textMuted}; }

  .lb-block { background:${T.surface}; border:1px solid ${T.border}; border-radius:10px; overflow:hidden; }
  .lb-block-header { display:flex; align-items:baseline; justify-content:space-between; gap:12px; padding:16px 20px 4px; flex-wrap:wrap; }
  .lb-block-title { font-size:14px; font-weight:700; font-family:'DM Sans',sans-serif; color:${T.textPrimary}; }
  .lb-block-desc { font-size:11.5px; color:${T.textMuted}; margin-top:3px; max-width:60ch; }
  .lb-block-body { padding:16px 20px 20px; }

  .lb-pool-totals { display:flex; gap:36px; flex-wrap:wrap; padding:0 20px 16px; border-top:1px solid ${T.border}; margin-top:12px; padding-top:16px; }
  .lb-pool-total-item { display:flex; flex-direction:column; gap:6px; }
  .lb-pool-total-label { display:flex; align-items:center; gap:6px; font-size:10px; letter-spacing:0.06em; text-transform:uppercase; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; }
  .lb-pool-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; }
  .lb-pool-total-value { font-size:24px; font-weight:700; font-family:'Space Grotesk',sans-serif; color:${T.textPrimary}; }

  .lb-dist-wrap { padding:4px 20px 20px; }
  .lb-dist-bar { display:flex; height:34px; border-radius:6px; overflow:hidden; background:rgba(255,255,255,0.04); }
  .lb-dist-seg { display:flex; align-items:center; justify-content:center; font-size:11px; font-weight:600; color:#fff; font-family:'DM Sans',sans-serif; white-space:nowrap; overflow:hidden; }
  .lb-dist-legend { display:flex; gap:16px; margin-top:10px; flex-wrap:wrap; }
  .lb-dist-legend-item { display:flex; align-items:center; gap:6px; font-size:11px; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; }

  .lb-endpoint-groups { display:flex; flex-direction:column; gap:18px; padding:4px 20px 20px; }
  .lb-endpoint-group-title { font-size:10px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:${T.textPrimary}; font-family:'IBM Plex Mono',monospace; margin-bottom:8px; display:flex; align-items:center; gap:7px; }
  .lb-endpoint-row { position:relative; display:flex; align-items:center; height:28px; border-radius:5px; }
  .lb-endpoint-bar { position:absolute; left:0; top:2px; bottom:2px; background:${T.accentSoft}; border-radius:4px; z-index:0; }
  .lb-endpoint-label { position:relative; z-index:1; font-size:12px; color:${T.textPrimary}; font-family:'IBM Plex Mono',monospace; padding-left:10px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; flex:1; }
  .lb-endpoint-count { position:relative; z-index:1; font-size:11.5px; font-weight:600; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; padding:0 10px; }

  .lb-rtip { background:${T.surfaceAlt}; border:1px solid ${T.borderHi}; border-radius:8px; padding:8px 12px; font-family:'DM Sans',sans-serif; box-shadow:0 20px 40px rgba(0,0,0,0.5); }
  .lb-rtip-label { font-size:10px; font-family:'IBM Plex Mono',monospace; color:${T.textMuted}; margin-bottom:5px; }
  .lb-rtip-row { display:flex; align-items:center; gap:6px; font-size:11px; margin-bottom:2px; }
  .lb-rtip-row:last-child { margin-bottom:0; }
  .lb-rtip-dot { width:7px; height:7px; border-radius:2px; flex-shrink:0; }
  .lb-rtip-name { color:${T.textMuted}; }
  .lb-rtip-val { color:${T.textPrimary}; font-weight:700; margin-left:auto; font-family:'IBM Plex Mono',monospace; }

  .lb-filter-row { display:flex; gap:16px; flex-wrap:wrap; padding:0 20px 18px; border-bottom:1px solid ${T.border}; }
  .lb-filter { display:flex; flex-direction:column; gap:5px; min-width:170px; flex:1; }
  .lb-filter-label { font-size:10px; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; }

  .lb-table-wrap { overflow-x:auto; }
  .lb-table { width:100%; border-collapse:collapse; min-width:720px; table-layout:fixed; }
  .lb-table col.col-chevron { width:32px; }
  .lb-table col.col-date { width:190px; }
  .lb-table col.col-event { width:38%; }
  .lb-table col.col-status { width:38%; }
  .lb-table th { text-align:left; padding:10px 14px; font-size:9.5px; letter-spacing:0.07em; text-transform:uppercase; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; border-bottom:1px solid ${T.border}; white-space:nowrap; }
  .lb-log-row { cursor:pointer; }
  .lb-log-row:hover td { background:rgba(255,255,255,0.02); }
  .lb-log-row td { padding:11px 14px; border-bottom:1px solid rgba(30,38,64,0.5); font-size:12.5px; vertical-align:middle; }
  .lb-chevron { display:inline-block; transition:transform 0.15s; color:${T.textDim}; font-size:10px; width:14px; }
  .lb-log-row.expanded .lb-chevron { transform:rotate(90deg); color:${T.textPrimary}; }

  .lb-badge { display:inline-flex; align-items:center; gap:5px; padding:2px 9px; border-radius:10px; font-size:10.5px; font-weight:600; font-family:'DM Sans',sans-serif; flex-shrink:0; }
  .lb-badge.healthy { background:rgba(16,185,129,0.14); color:${T.success}; }
  .lb-badge.critical { background:rgba(248,113,113,0.14); color:${T.danger}; }

  .lb-event-cell { display:flex; align-items:center; gap:10px; min-width:0; overflow:hidden; }
  .lb-event-name { font-family:'IBM Plex Mono',monospace; color:${T.textPrimary}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
  .lb-status-cell { display:flex; align-items:center; gap:10px; min-width:0; overflow:hidden; }
  .lb-health-bar { width:60px; height:6px; border-radius:3px; background:rgba(255,255,255,0.06); overflow:hidden; flex-shrink:0; }
  .lb-health-bar-fill { height:100%; background:${T.success}; border-radius:3px; }
  .lb-health-bar-fill.critical { background:rgba(255,255,255,0.08); }
  .lb-pool-name { font-family:'IBM Plex Mono',monospace; color:${T.warning}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }

  .lb-detail-row td { padding:0; border-bottom:1px solid rgba(30,38,64,0.5); }
  .lb-detail { display:grid; grid-template-columns:repeat(auto-fit,minmax(220px,1fr)); gap:10px 24px; padding:16px 14px 16px 20px; background:rgba(59,130,246,0.04); border-left:3px solid ${T.accent}; }
  .lb-detail-item { display:flex; flex-direction:column; gap:3px; }
  .lb-detail-label { font-size:10px; font-weight:700; color:${T.textPrimary}; font-family:'DM Sans',sans-serif; }
  .lb-detail-value { font-size:12px; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; word-break:break-all; }

  .lb-empty { padding:24px; text-align:center; font-size:12px; color:${T.textMuted}; }
  .lb-state-box { padding:32px 24px; background:${T.surface}; border:1px solid ${T.border}; border-radius:10px; display:flex; flex-direction:column; align-items:center; gap:10px; text-align:center; }
  .lb-hint-box { display:flex; gap:8px; padding:10px 14px; background:${T.surfaceAlt}; border:1px solid ${T.border}; border-radius:8px; font-size:11px; color:${T.textMuted}; line-height:1.5; }
`;

function fmtNum(n: number) {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("pt-BR");
}
function pct(part: number, total: number) {
  return total > 0 ? (part / total) * 100 : 0;
}
function fmtTickTime(iso: string) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}
function fmtLogDateTime(iso: string) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

// Mede a própria largura via ResizeObserver (mesmo padrão do resto da aba).
function ChartBox({ height, children }: { height: number; children: (width: number) => React.ReactNode }) {
  const ref = React.useRef<HTMLDivElement>(null);
  const [width, setWidth] = React.useState(0);
  React.useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => setWidth(Math.floor(el.getBoundingClientRect().width));
    measure();
    const ro = new ResizeObserver(() => measure());
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return (
    <div ref={ref} style={{ width: "100%", height }}>
      {width > 0 ? children(width) : null}
    </div>
  );
}

function SeriesTooltip({ active, payload, label, poolColor }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="lb-rtip">
      <div className="lb-rtip-label">{fmtTickTime(String(label))}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="lb-rtip-row">
          <span className="lb-rtip-dot" style={{ background: poolColor.get(p.dataKey) ?? p.color }} />
          <span className="lb-rtip-name">{p.dataKey}</span>
          <span className="lb-rtip-val">{fmtNum(Number(p.value))}</span>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Overview
// ══════════════════════════════════════════════════════════════════════════════
function OverviewSection({ zoneId, days }: { zoneId: string | null; days: number }) {
  const fetchOverview = useServerFn(getLoadBalancingOverview);
  const { data, isLoading } = useQuery({
    queryKey: ["cloudflare-lb-overview", zoneId, days],
    enabled: !!zoneId,
    queryFn: () => fetchOverview({ data: { zoneId, days } }),
  });
  const d = (data as any)?.ok ? (data as any) : null;
  const notConfigured = data && !(data as any).ok && (data as any).notConfigured;

  if (!zoneId) return <div className="lb-state-box">Selecione uma zona pra ver Load Balancing.</div>;
  if (isLoading) return <div className="lb-state-box">Carregando Load Balancing…</div>;
  if (notConfigured) {
    return (
      <div className="lb-state-box">
        <Info size={20} color={T.textMuted} />
        <span style={{ fontSize: 13, fontWeight: 600, color: T.textPrimary }}>Nenhum Load Balancer nessa zona</span>
        <span style={{ fontSize: 11, color: T.textMuted }}>{(data as any)?.error}</span>
      </div>
    );
  }
  if (!d) {
    return (
      <div className="lb-state-box">
        <AlertTriangle size={20} color={T.danger} />
        <span style={{ fontSize: 13, fontWeight: 600, color: T.danger }}>Erro ao carregar Load Balancing</span>
        <span style={{ fontSize: 11, color: T.textMuted, fontFamily: "'IBM Plex Mono',monospace" }}>{(data as any)?.error}</span>
      </div>
    );
  }

  const poolColor = new Map<string, string>();
  d.byPool.forEach((p: any, i: number) => poolColor.set(p.poolName, POOL_PALETTE[i % POOL_PALETTE.length]));
  const poolKeys = d.byPool.map((p: any) => p.poolName);

  return (
    <>
      <div className="lb-block">
        <div className="lb-block-header">
          <div>
            <div className="lb-block-title">Load Balancing Requests</div>
            <div className="lb-block-desc">Volume de requisições avaliadas pelo load balancer "{d.lbName}", por pool de origem.</div>
          </div>
        </div>

        <div className="lb-pool-totals">
          <div className="lb-pool-total-item">
            <span className="lb-pool-total-label">Total</span>
            <span className="lb-pool-total-value">{fmtNum(d.total)}</span>
          </div>
          {d.byPool.map((p: any) => (
            <div key={p.poolId || p.poolName} className="lb-pool-total-item">
              <span className="lb-pool-total-label">
                <span className="lb-pool-dot" style={{ background: poolColor.get(p.poolName) }} />
                {p.poolName}
              </span>
              <span className="lb-pool-total-value" style={{ color: poolColor.get(p.poolName) }}>
                {fmtNum(p.count)}
              </span>
            </div>
          ))}
        </div>

        {d.series.length > 1 && (
          <ChartBox height={240}>
            {(width) => {
              const interval = Math.max(0, Math.ceil(d.series.length / 8) - 1);
              return (
                <LineChart width={width} height={240} data={d.series} margin={{ top: 14, right: 16, bottom: 8, left: 0 }}>
                  <CartesianGrid strokeDasharray="2 4" stroke={T.border} vertical={false} />
                  <XAxis
                    dataKey="ts"
                    interval={interval}
                    stroke={T.textDim}
                    fontSize={10}
                    tick={{ fill: T.textDim, fontFamily: "'IBM Plex Mono',monospace" }}
                    tickLine={false}
                    axisLine={{ stroke: T.border }}
                    tickFormatter={fmtTickTime}
                  />
                  <YAxis
                    width={44}
                    stroke={T.textDim}
                    fontSize={10}
                    tick={{ fill: T.textDim, fontFamily: "'IBM Plex Mono',monospace" }}
                    tickLine={false}
                    axisLine={false}
                    tickFormatter={(v) => fmtNum(Number(v))}
                  />
                  <RTooltip content={<SeriesTooltip poolColor={poolColor} />} cursor={{ stroke: T.borderHi }} />
                  {poolKeys.map((k: string) => (
                    <Line key={k} type="monotone" dataKey={k} stroke={poolColor.get(k)} strokeWidth={2} dot={false} name={k} connectNulls />
                  ))}
                </LineChart>
              );
            }}
          </ChartBox>
        )}
      </div>

      <div className="lb-block">
        <div className="lb-block-header">
          <div>
            <div className="lb-block-title">Distribution by pool</div>
            <div className="lb-block-desc">Participação de cada pool no total de requisições do período.</div>
          </div>
        </div>
        <div className="lb-dist-wrap">
          {d.total === 0 ? (
            <div className="lb-empty">Sem dados no período.</div>
          ) : (
            <>
              <div className="lb-dist-bar">
                {d.byPool.map((p: any) => (
                  <div
                    key={p.poolId || p.poolName}
                    className="lb-dist-seg"
                    style={{ width: `${pct(p.count, d.total)}%`, background: poolColor.get(p.poolName) }}
                    title={`${p.poolName}: ${fmtNum(p.count)} (${pct(p.count, d.total).toFixed(0)}%)`}
                  >
                    {pct(p.count, d.total) >= 12 ? `${p.poolName} — ${pct(p.count, d.total).toFixed(0)}%` : ""}
                  </div>
                ))}
              </div>
              <div className="lb-dist-legend">
                {d.byPool.map((p: any) => (
                  <span key={p.poolId || p.poolName} className="lb-dist-legend-item">
                    <span className="lb-pool-dot" style={{ background: poolColor.get(p.poolName) }} />
                    {p.poolName}: {fmtNum(p.count)} ({pct(p.count, d.total).toFixed(0)}%)
                  </span>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="lb-block">
        <div className="lb-block-header">
          <div>
            <div className="lb-block-title">Top traffic by endpoint</div>
            <div className="lb-block-desc">Requisições por endpoint de origem, agrupadas por pool.</div>
          </div>
        </div>
        <div className="lb-endpoint-groups">
          {d.endpoints.length === 0 ? (
            <div className="lb-empty">Sem dados no período.</div>
          ) : (
            d.endpoints.map((g: any) => {
              const max = Math.max(1, ...g.rows.map((r: any) => r.count));
              return (
                <div key={g.poolId || g.poolName}>
                  <div className="lb-endpoint-group-title">
                    <span className="lb-pool-dot" style={{ background: poolColor.get(g.poolName) }} />
                    {g.poolName}
                  </div>
                  {g.rows.map((r: any, i: number) => (
                    <div key={i} className="lb-endpoint-row">
                      <div className="lb-endpoint-bar" style={{ width: `${Math.max(4, (r.count / max) * 100)}%` }} />
                      <span className="lb-endpoint-label" title={r.value}>
                        {r.value}
                      </span>
                      <span className="lb-endpoint-count">{fmtNum(r.count)}</span>
                    </div>
                  ))}
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// Logs
// ══════════════════════════════════════════════════════════════════════════════
const LOGS_DAYS = 7; // janela fixa (o seletor de dias 1/2/3 do resto da aba é curto
// demais pra ver mudanças de saúde relevantes — mesma ideia do "Aug 26 → Sep 2" visto no nativo).

function LogsSection({ zoneId }: { zoneId: string | null }) {
  const [poolId, setPoolId] = React.useState<string>("");
  const [poolHealthy, setPoolHealthy] = React.useState<string>("");
  const [originHealthy, setOriginHealthy] = React.useState<string>("");
  const [originName, setOriginName] = React.useState<string>("");
  const [expanded, setExpanded] = React.useState<Set<number>>(new Set());

  const fetchLogs = useServerFn(getLoadBalancingLogs);
  const { data, isLoading } = useQuery({
    queryKey: ["cloudflare-lb-logs", zoneId, poolId, poolHealthy, originHealthy, originName],
    enabled: !!zoneId,
    queryFn: () =>
      fetchLogs({
        data: {
          zoneId,
          days: LOGS_DAYS,
          poolId: poolId || null,
          poolHealthy: poolHealthy === "" ? null : poolHealthy === "true",
          originHealthy: originHealthy === "" ? null : originHealthy === "true",
          originName: originName || null,
        },
      }),
  });
  const d = (data as any)?.ok ? (data as any) : null;
  const notConfigured = data && !(data as any).ok && (data as any).notConfigured;

  function toggle(id: number) {
    setExpanded((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="lb-block">
      <div className="lb-block-header">
        <div>
          <div className="lb-block-title">Load Balancing Logs</div>
          <div className="lb-block-desc">
            Eventos de mudança de saúde do endpoint/pool nos últimos {LOGS_DAYS} dias — o que disparou cada troca de status.
          </div>
        </div>
      </div>

      <div className="lb-filter-row">
        <div className="lb-filter">
          <span className="lb-filter-label">Pool Health</span>
          <Select value={poolHealthy || "any"} onValueChange={(v) => setPoolHealthy(v === "any" ? "" : v)}>
            <SelectTrigger className="lb-select-trigger">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="lb-select-content">
              <SelectItem value="any" className="lb-select-item">Qualquer</SelectItem>
              <SelectItem value="true" className="lb-select-item">Healthy</SelectItem>
              <SelectItem value="false" className="lb-select-item">Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="lb-filter">
          <span className="lb-filter-label">Pool</span>
          <Select value={poolId || "any"} onValueChange={(v) => setPoolId(v === "any" ? "" : v)}>
            <SelectTrigger className="lb-select-trigger">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="lb-select-content">
              <SelectItem value="any" className="lb-select-item">Todas as pools</SelectItem>
              {(d?.pools ?? []).map((p: any) => (
                <SelectItem key={p.id} value={p.id} className="lb-select-item">
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="lb-filter">
          <span className="lb-filter-label">Endpoint Health</span>
          <Select value={originHealthy || "any"} onValueChange={(v) => setOriginHealthy(v === "any" ? "" : v)}>
            <SelectTrigger className="lb-select-trigger">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="lb-select-content">
              <SelectItem value="any" className="lb-select-item">Qualquer</SelectItem>
              <SelectItem value="true" className="lb-select-item">Healthy</SelectItem>
              <SelectItem value="false" className="lb-select-item">Critical</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="lb-filter">
          <span className="lb-filter-label">Endpoint</span>
          <input
            type="text"
            value={originName}
            onChange={(e) => setOriginName(e.target.value)}
            placeholder="ex.: vpnbhlourd-Kater"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="lb-empty">Carregando…</div>
      ) : notConfigured ? (
        <div className="lb-empty">{(data as any)?.error}</div>
      ) : !d ? (
        <div className="lb-empty">{(data as any)?.error ?? "Erro ao carregar os logs."}</div>
      ) : (
        <>
          {d.warning && (
            <div className="lb-hint-box" style={{ margin: "0 20px 12px" }}>
              <AlertTriangle size={13} color={T.warning} style={{ flexShrink: 0, marginTop: 1 }} />
              <span>{d.warning}</span>
            </div>
          )}
          <div className="lb-table-wrap">
            <table className="lb-table">
              <colgroup>
                <col className="col-chevron" />
                <col className="col-date" />
                <col className="col-event" />
                <col className="col-status" />
              </colgroup>
              <thead>
                <tr>
                  <th></th>
                  <th>Date</th>
                  <th>Triggering Endpoint Event</th>
                  <th>Pool Status</th>
                </tr>
              </thead>
              <tbody>
                {d.events.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="lb-empty">
                      Sem eventos no período.
                    </td>
                  </tr>
                ) : (
                  (d.events as LbLogEvent[]).map((ev) => {
                    const triggering = ev.origins.find((o) => o.changed) ?? ev.origins[0];
                    const healthyCount = ev.origins.filter((o) => o.healthy).length;
                    const barPct = ev.origins.length ? (healthyCount / ev.origins.length) * 100 : 0;
                    const isOpen = expanded.has(ev.id);
                    return (
                      <React.Fragment key={ev.id}>
                        <tr className={`lb-log-row${isOpen ? " expanded" : ""}`} onClick={() => toggle(ev.id)}>
                          <td>
                            <span className="lb-chevron">▶</span>
                          </td>
                          <td>{fmtLogDateTime(ev.timestamp)}</td>
                          <td>
                            <div className="lb-event-cell">
                              <span className={`lb-badge ${triggering?.healthy ? "healthy" : "critical"}`}>
                                {triggering?.healthy ? "Healthy" : "Critical"}
                              </span>
                              <span className="lb-event-name">{triggering?.name ?? "—"}</span>
                            </div>
                          </td>
                          <td>
                            <div className="lb-status-cell">
                              <span className={`lb-badge ${ev.pool.healthy ? "healthy" : "critical"}`}>
                                {ev.pool.healthy ? "Healthy" : "Critical"}
                              </span>
                              <div className="lb-health-bar">
                                <div className={`lb-health-bar-fill${ev.pool.healthy ? "" : " critical"}`} style={{ width: `${barPct}%` }} />
                              </div>
                              <span className="lb-pool-name">{ev.pool.name}</span>
                            </div>
                          </td>
                        </tr>
                        {isOpen && (
                          <tr className="lb-detail-row">
                            <td colSpan={4}>
                              <div className="lb-detail">
                                <div className="lb-detail-item">
                                  <span className="lb-detail-label">Expected Response Codes:</span>
                                  <span className="lb-detail-value">{ev.expectedCodes ?? "—"}</span>
                                </div>
                                <div className="lb-detail-item">
                                  <span className="lb-detail-label">All Healthy Endpoints:</span>
                                  <span className="lb-detail-value">
                                    {ev.origins.filter((o) => o.healthy).map((o) => o.name).join(", ") || "—"}
                                  </span>
                                </div>
                                <div className="lb-detail-item">
                                  <span className="lb-detail-label">Health Threshold:</span>
                                  <span className="lb-detail-value">{ev.pool.minimumOrigins}</span>
                                </div>
                                <div className="lb-detail-item">
                                  <span className="lb-detail-label">Pool ID:</span>
                                  <span className="lb-detail-value">{ev.pool.id}</span>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// LoadBalancingTab
// ══════════════════════════════════════════════════════════════════════════════
export function LoadBalancingTab({ zoneId, days }: { zoneId: string | null; days: number }) {
  return (
    <div className="lb-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div className="lb-subnav">
        <button className="active">Overview</button>
        <button className="soon">
          Latency <span className="lb-soon-tag">EM BREVE</span>
        </button>
      </div>
      <OverviewSection zoneId={zoneId} days={days} />
      <LogsSection zoneId={zoneId} />
    </div>
  );
}
