import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Pencil, Plus, Zap } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { HostCacheTab, HostRulesTab, HostSecurityTab } from "./HostTabs";
import { getCloudflareAnalytics, updateDnsRecord } from "@/lib/cloudflare.functions";
import { getZoneHosts, type ZoneHost } from "@/lib/cloudflare.hosts.functions";
import type { ZoneChange } from "@/lib/cloudflare.hosts.functions";
import { usePermissions } from "@/lib/use-permissions";
import type { WafDraft, ZoneConfigView } from "./OperationsTab";
import { ChangeDetailSheet } from "./HistoryView";
import {
  changeHosts,
  changeInitials,
  changeText,
  changeWho,
  fmtWhen,
  useZoneChanges,
} from "./change-utils";

export type OpenConfig = (
  view: ZoneConfigView,
  opts?: {
    wafDraft?: WafDraft;
    initialQuery?: string;
    autoEditName?: string;
    initialHosts?: string[];
    initialPurgeAll?: boolean;
  },
) => void;

const fmtK = (n: number) =>
  n >= 1e6
    ? `${(n / 1e6).toFixed(1).replace(".", ",")} mi`
    : n >= 1e5
      ? `${Math.round(n / 1e3)} mil`
      : n >= 1e3
        ? `${(n / 1e3).toFixed(1).replace(".", ",")} mil`
        : String(n);
const pct = (n: number) => `${n.toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;

type HostState = {
  key: "exposed" | "attack" | "errors" | "cache" | "ok";
  label: string;
  color: string;
};
function stateOf(h: ZoneHost): HostState {
  if (h.record && !h.record.proxied)
    return { key: "exposed", label: "Exposto", color: "var(--v2-high)" };
  if (h.mitigated >= 1000 && h.requests > 0 && h.mitigated / h.requests >= 0.01)
    return { key: "attack", label: "Sob ataque", color: "var(--v2-crit)" };
  if (h.errors5xx >= 50 && h.requests > 0 && h.errors5xx / h.requests >= 0.002)
    return { key: "errors", label: "Erros 5xx", color: "var(--v2-high)" };
  if (h.cachedPct !== null && h.cachedPct < 50 && h.requests >= 1000)
    return { key: "cache", label: "Cache baixo", color: "var(--v2-med)" };
  return { key: "ok", label: "Normal", color: "var(--v2-ok)" };
}

const CSS = `
.hv { display:flex; flex-direction:column; gap:16px; font-family:var(--font-ui); color:var(--v2-fg); min-width:0; }
.hv-band { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:14px; padding:14px 16px 12px; display:grid; gap:10px; min-width:0; }
.hv-band-h { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
.hv-band-h b { font-size:14px; font-weight:600; } .hv-band-h small { color:var(--v2-fg-3); font-size:12.5px; }
.hv-zk { display:flex; gap:24px; flex-wrap:wrap; }
.hv-zk div { display:grid; } .hv-zk span { font-size:12px; color:var(--v2-fg-3); }
.hv-zk b { font-size:20px; font-weight:600; letter-spacing:-0.01em; font-variant-numeric:tabular-nums; }
.hv-tl { position:relative; }
.hv-tl svg { display:block; width:100%; }
.hv-lab { position:absolute; left:0; font-size:11.5px; color:var(--v2-fg-3); background:var(--v2-surface); padding-right:6px; pointer-events:none; }
.hv-pin { position:absolute; top:-2px; bottom:18px; width:0; border-left:1.5px dashed color-mix(in oklch, var(--v2-accent) 70%, transparent); }
.hv-pin button { position:absolute; top:-6px; left:-13px; width:26px; height:26px; border-radius:50%; border:2px solid var(--v2-surface); background:var(--v2-accent); color:var(--v2-accent-ink); font:600 10px var(--font-ui); cursor:pointer; display:grid; place-items:center; padding:0; }
.hv-ax { display:flex; justify-content:space-between; font:11px var(--font-data); color:var(--v2-fg-3); }
.hv-leg { display:flex; gap:14px; font-size:12px; color:var(--v2-fg-2); flex-wrap:wrap; }
.hv-leg span { display:inline-flex; gap:6px; align-items:center; } .hv-leg i { width:10px; height:10px; border-radius:3px; display:inline-block; }
.hv-split { display:grid; grid-template-columns:minmax(0,5fr) minmax(0,7fr); gap:16px; align-items:start; }
@media (max-width:1100px) { .hv-split { grid-template-columns:minmax(0,1fr); } }
.hv-panel { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:14px; min-width:0; }
.hv-ph { display:flex; align-items:center; gap:8px; padding:12px 14px; border-bottom:1px solid var(--v2-line); flex-wrap:wrap; }
.hv-ph b { font-size:14px; font-weight:600; }
.hv-fb { display:inline-flex; align-items:center; gap:6px; height:28px; padding:0 10px; border-radius:99px; border:1px solid var(--v2-line); background:var(--v2-surface); font-size:12.5px; color:var(--v2-fg-2); cursor:pointer; font-family:inherit; }
.hv-fb[aria-pressed="true"] { border-color:color-mix(in oklch, var(--v2-accent) 45%, var(--v2-line)); background:color-mix(in oklch, var(--v2-accent) 10%, transparent); color:var(--v2-accent); font-weight:500; }
.hv-fb .n { font:500 11px var(--font-data); opacity:.8; }
.hv-hh, .hv-row { display:grid; grid-template-columns:10px minmax(0,1fr) 70px 64px 70px; gap:4px 12px; align-items:center; }
.hv-hh { padding:8px 14px; font-size:11.5px; color:var(--v2-fg-3); border-bottom:1px solid var(--v2-line); }
.hv-hh span:nth-child(n+3) { text-align:right; }
.hv-row { padding:10px 14px; border:0; border-top:1px solid var(--v2-line); background:transparent; text-align:left; cursor:pointer; width:100%; font-family:inherit; color:inherit; }
.hv-row:first-child { border-top:0; }
.hv-row:hover { background:var(--v2-hover); }
.hv-row[aria-selected="true"] { background:color-mix(in oklch, var(--v2-accent) 10%, transparent); box-shadow:inset 3px 0 0 var(--v2-accent); }
.hv-dot { width:8px; height:8px; border-radius:50%; background:var(--c); }
.hv-nm { min-width:0; } .hv-nm b { display:block; font:500 13px var(--font-data); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.hv-nm small { display:block; font-size:11.5px; color:var(--v2-fg-3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.hv-num { font:500 12.5px var(--font-data); text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
.hv-mini { display:block; height:4px; border-radius:2px; background:var(--v2-surface-2); margin-top:4px; overflow:hidden; }
.hv-mini i { display:block; height:100%; background:var(--c); }
.hv-nd { grid-column:3 / -1; color:var(--v2-fg-3); font-size:12px; text-align:right; white-space:normal; }
@media (max-width:520px) { .hv-hh, .hv-row { grid-template-columns:10px minmax(0,1fr) 60px 60px; gap:4px 8px; } .hv-c4 { display:none; } }
.hv-dh { padding:16px 18px 14px; display:grid; gap:10px; border-bottom:1px solid var(--v2-line); }
.hv-dh-t { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap; }
.hv-dh h2 { margin:0; font:600 18px var(--font-data); word-break:break-all; }
.hv-rec { display:flex; gap:8px; align-items:center; flex-wrap:wrap; font-size:12.5px; color:var(--v2-fg-3); }
.hv-rec code { font:12.5px var(--font-data); color:var(--v2-fg-2); }
.hv-acts { display:flex; gap:6px; flex-wrap:wrap; }
.hv-tag { display:inline-flex; align-items:center; height:20px; padding:0 6px; border-radius:5px; font:500 11.5px var(--font-data); background:var(--v2-surface-2); border:1px solid var(--v2-line); color:var(--v2-fg-2); }
.hv-pill { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; white-space:nowrap; background:color-mix(in oklch, var(--c) 14%, transparent); color:color-mix(in oklch, var(--c) 72%, var(--v2-fg)); }
.hv-pill::before { content:""; width:6px; height:6px; border-radius:50%; background:var(--c); }
.hv-ins { display:grid; grid-template-columns:22px minmax(0,1fr) auto; gap:10px; align-items:center; padding:10px 12px; border-radius:10px; background:color-mix(in oklch, var(--c) 9%, var(--v2-surface)); border:1px solid color-mix(in oklch, var(--c) 30%, var(--v2-line)); font-size:13px; }
.hv-ins .i { width:22px; height:22px; border-radius:6px; display:grid; place-items:center; background:color-mix(in oklch, var(--c) 18%, transparent); color:var(--c); font-weight:700; font-size:12px; }
.hv-dk { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); border-bottom:1px solid var(--v2-line); }
.hv-dk div { padding:12px 18px; box-shadow:1px 0 0 var(--v2-line); display:grid; }
.hv-dk span { font-size:12px; color:var(--v2-fg-3); } .hv-dk b { font-size:20px; font-weight:600; font-variant-numeric:tabular-nums; } .hv-dk small { font-size:11.5px; color:var(--v2-fg-3); }
@media (max-width:560px) { .hv-dk { grid-template-columns:1fr 1fr; } }
.hv-tb { padding:14px 18px 18px; display:grid; gap:14px; }
.hv-lbl { font-size:12px; font-weight:600; letter-spacing:.05em; text-transform:uppercase; color:var(--v2-fg-3); margin:0; }
.hv-kv { margin:0; display:grid; grid-template-columns:120px minmax(0,1fr); gap:8px 14px; font-size:13px; }
.hv-kv dt { color:var(--v2-fg-3); } .hv-kv dd { margin:0; overflow-wrap:anywhere; }
.hv-list { display:grid; border:1px solid var(--v2-line); border-radius:10px; overflow:hidden; }
.hv-li { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:4px 12px; align-items:center; padding:10px 12px; border:0; border-top:1px solid var(--v2-line); background:transparent; text-align:left; cursor:pointer; font:inherit; color:inherit; }
.hv-li:first-child { border-top:0; } .hv-li:hover { background:var(--v2-hover); }
.hv-li small { font:12px var(--font-data); color:var(--v2-fg-3); }
.hv-empty { padding:26px 18px; text-align:center; color:var(--v2-fg-3); font-size:13px; }
.hv-warn { font-size:12.5px; color:var(--v2-fg-3); padding:8px 14px; border-bottom:1px solid var(--v2-line); }
.ht-rank { display:grid; gap:8px; }
.ht-r { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:4px 10px; font-size:12.5px; }
.ht-r .n { font-family:var(--font-data); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ht-r .v { font:500 12.5px var(--font-data); color:var(--v2-fg-2); }
.ht-r .t { grid-column:1 / -1; height:6px; border-radius:3px; background:var(--v2-surface-2); overflow:hidden; }
.ht-r .t i { display:block; height:100%; background:var(--c); }
.ht-two { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
@media (max-width:640px) { .ht-two { grid-template-columns:1fr; } }
.ht-tw { overflow-x:auto; border:1px solid var(--v2-line); border-radius:10px; }
.ht-tw table { width:100%; border-collapse:collapse; font-size:12.5px; }
.ht-tw th { text-align:left; font-weight:500; font-size:11.5px; color:var(--v2-fg-3); padding:8px 10px; border-bottom:1px solid var(--v2-line); white-space:nowrap; }
.ht-tw td { padding:8px 10px; border-bottom:1px solid var(--v2-line); white-space:nowrap; }
.ht-tw tr:last-child td { border-bottom:0; }
.ht-m { font-family:var(--font-data); }
.ht-pill { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; white-space:nowrap; background:color-mix(in oklch, var(--c) 14%, transparent); color:color-mix(in oklch, var(--c) 72%, var(--v2-fg)); }
.ht-pill::before { content:""; width:6px; height:6px; border-radius:50%; background:var(--c); }
.ht-list { display:grid; border:1px solid var(--v2-line); border-radius:10px; overflow:hidden; }
.ht-li { display:grid; grid-template-columns:minmax(0,1fr) auto auto; gap:4px 12px; align-items:center; padding:10px 12px; border:0; border-top:1px solid var(--v2-line); background:transparent; text-align:left; font:inherit; color:inherit; }
.ht-li:first-child { border-top:0; }
button.ht-li { cursor:pointer; } button.ht-li:hover { background:var(--v2-hover); }
.ht-li b { font-weight:500; font-size:13px; }
.ht-li small { display:block; font:12px var(--font-data); color:var(--v2-fg-3); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
.ht-li .cat { font-size:11.5px; color:var(--v2-fg-3); }
.ht-tag { display:inline-flex; align-items:center; height:20px; padding:0 6px; border-radius:5px; font:500 11.5px var(--font-data); background:var(--v2-surface-2); border:1px solid var(--v2-line); color:var(--v2-fg-2); white-space:nowrap; }
.ht-stack { display:flex; height:12px; border-radius:6px; overflow:hidden; gap:2px; }
.ht-stack i { display:block; height:100%; min-width:3px; }
.ht-leg { display:flex; gap:12px; flex-wrap:wrap; font-size:12px; color:var(--v2-fg-2); }
.ht-leg span { display:inline-flex; gap:6px; align-items:center; } .ht-leg i { width:10px; height:10px; border-radius:3px; display:inline-block; }
.ht-muted { margin:0; font-size:13px; color:var(--v2-fg-3); }
.ht-tip { display:grid; grid-template-columns:22px minmax(0,1fr) auto; gap:10px; align-items:center; padding:10px 12px; border-radius:10px; background:color-mix(in oklch, var(--v2-accent) 8%, var(--v2-surface)); border:1px solid color-mix(in oklch, var(--v2-accent) 30%, var(--v2-line)); font-size:13px; }
.ht-tip .i { width:22px; height:22px; border-radius:6px; display:grid; place-items:center; background:color-mix(in oklch, var(--v2-accent) 18%, transparent); color:var(--v2-accent); font-weight:700; font-size:12px; }
`;

function Timeline({
  series,
  sinceMs,
  untilMs,
  pins,
  onPin,
}: {
  series: Array<{ t: string; requests: number; mitigated: number; cached: number }>;
  sinceMs: number;
  untilMs: number;
  pins: ZoneChange[];
  onPin: (c: ZoneChange) => void;
}) {
  const N = series.length;
  if (N < 2) return <div className="hv-empty">Sem dados de tráfego no período.</div>;
  const W = 1000,
    H1 = 90,
    H2 = 44,
    G = 14;
  const tot = series.map((s) => s.requests);
  const orig = series.map((s) => Math.max(0, s.requests - s.cached));
  const mit = series.map((s) => s.mitigated);
  const mx = Math.max(1, ...tot) * 1.1,
    mm = Math.max(1, ...mit);
  const x = (i: number) => (i / (N - 1)) * W;
  const y = (v: number) => H1 - (v / mx) * (H1 - 4);
  const top = tot.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const mid = orig.map((v, i) => `${x(i)},${y(v)}`).join(" ");
  const peak = mit.indexOf(mm);
  const bw = W / N - 3;
  const t0 = new Date(series[0].t).getTime(),
    t1 = new Date(series[N - 1].t).getTime();
  const span = Math.max(1, t1 - t0);
  const fmtT = (ms: number) =>
    new Date(ms).toLocaleString(
      "pt-BR",
      untilMs - sinceMs > 26 * 3600e3
        ? { day: "2-digit", month: "2-digit" }
        : { hour: "2-digit", minute: "2-digit" },
    );
  const visiblePins = pins.filter((c) => {
    const ms = new Date(c.createdAt).getTime();
    return ms >= Math.min(t0, sinceMs) && ms <= Math.max(t1, untilMs);
  });
  return (
    <div className="hv-tl">
      <svg
        viewBox={`0 0 ${W} ${H1 + G + H2}`}
        preserveAspectRatio="none"
        style={{ height: H1 + G + H2 }}
        role="img"
        aria-label="Requisições (cache e origem) e mitigadas por hora"
      >
        <polygon points={`0,${H1} ${top} ${W},${H1}`} fill="var(--v2-ok)" opacity={0.25} />
        <polygon points={`0,${H1} ${mid} ${W},${H1}`} fill="var(--v2-accent)" opacity={0.4} />
        <polyline
          points={top}
          fill="none"
          stroke="var(--v2-ok)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
        <polyline
          points={mid}
          fill="none"
          stroke="var(--v2-accent)"
          strokeWidth={2}
          vectorEffect="non-scaling-stroke"
        />
        <line
          x1={0}
          x2={W}
          y1={H1 + G / 2}
          y2={H1 + G / 2}
          stroke="var(--v2-line)"
          vectorEffect="non-scaling-stroke"
        />
        {mit.map((v, i) => (
          <rect
            key={i}
            x={(i / N) * W + 1.5}
            y={H1 + G + H2 - (v / mm) * H2}
            width={Math.max(1, bw)}
            height={(v / mm) * H2}
            rx={2}
            fill="var(--v2-crit)"
            opacity={i === peak && v > 0 ? 1 : 0.45}
          >
            <title>{`${new Date(series[i].t).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · ${v.toLocaleString("pt-BR")} mitigadas`}</title>
          </rect>
        ))}
      </svg>
      <span className="hv-lab" style={{ top: 0 }}>
        Requisições
      </span>
      <span className="hv-lab" style={{ top: H1 + G }}>
        Mitigadas
      </span>
      {visiblePins.map((c) => {
        const left = Math.min(1, Math.max(0, (new Date(c.createdAt).getTime() - t0) / span)) * 100;
        const t = changeText(c);
        const label = `${changeWho(c)} ${t.verb} ${t.target} · ${fmtWhen(c.createdAt)}`;
        return (
          <div key={c.id} className="hv-pin" style={{ left: `${left}%` }}>
            <button title={label} aria-label={label} onClick={() => onPin(c)}>
              {changeInitials(c)}
            </button>
          </div>
        );
      })}
      <div className="hv-ax">
        {[0, 0.25, 0.5, 0.75, 1].map((f) => (
          <span key={f}>{f === 1 ? "agora" : fmtT(t0 + span * f)}</span>
        ))}
      </div>
    </div>
  );
}

export function HostsView({
  zoneId,
  zoneName,
  days,
  query,
  onOpenConfig,
}: {
  zoneId: string | null;
  zoneName: string | null;
  days: 1 | 3;
  query: string;
  onOpenConfig: OpenConfig;
}) {
  const { can } = usePermissions();
  const canHistory = can("cloudflare-waf", "view_history");
  const canEditDns = can("cloudflare-waf", "manage_editar_dns");
  const canPurge = can("cloudflare-waf", "manage_purge_cache");
  const canWaf = can("cloudflare-waf", "manage_custom_rules");

  const fetchHosts = useServerFn(getZoneHosts);
  const hostsQ = useQuery({
    queryKey: ["cf-zone-hosts", zoneId, days],
    enabled: !!zoneId,
    queryFn: () => fetchHosts({ data: { zoneId: zoneId!, days } }),
  });
  const fetchAnalytics = useServerFn(getCloudflareAnalytics);
  const anQ = useQuery({
    queryKey: ["cloudflare-analytics", days, null, zoneId],
    enabled: !!zoneId,
    queryFn: () => fetchAnalytics({ data: { days, action: null, zoneId } }),
  });
  // 30 dias: os marcadores da linha do tempo só mostram os do período; o histórico do host usa tudo
  const changesQ = useZoneChanges(zoneId, 30, canHistory);
  const changes = changesQ.data?.ok
    ? changesQ.data.changes.filter((c) => c.status === "success")
    : [];

  const hosts = hostsQ.data?.ok ? hostsQ.data.hosts : [];
  const [filter, setFilter] = React.useState<"all" | HostState["key"]>("all");
  const [sel, setSel] = React.useState<string | null>(null);
  const [tab, setTab] = React.useState<"sec" | "rules" | "cache" | "dns">("sec");
  const [openChange, setOpenChange] = React.useState<ZoneChange | null>(null);

  React.useEffect(() => {
    setSel(null);
    setFilter("all");
  }, [zoneId]);

  const q = query.trim().toLowerCase();
  const rows = hosts.filter(
    (h) =>
      (filter === "all" || stateOf(h).key === filter) &&
      (!q || `${h.host} ${h.record?.content ?? ""}`.toLowerCase().includes(q)),
  );
  const selected = hosts.find((h) => h.host === sel) ?? rows[0] ?? null;

  const an = anQ.data && "ok" in anQ.data && anQ.data.ok ? anQ.data : null;
  // Taxa de 5xx da zona (soma dos hosts com tráfego)
  const reqSum = hosts.reduce((a, h) => a + h.requests, 0);
  const errRate = reqSum
    ? Math.round((hosts.reduce((a, h) => a + h.errors5xx, 0) / reqSum) * 10000) / 100
    : null;
  const windowChanges = an
    ? changes.filter((c) => {
        const ms = new Date(c.createdAt).getTime();
        return ms >= new Date(an.range.since).getTime() && ms <= new Date(an.range.until).getTime();
      })
    : [];
  const counts = (k: HostState["key"]) => hosts.filter((h) => stateOf(h).key === k).length;
  const FILTERS: Array<[typeof filter, string, number]> = [
    ["all", "Todos", hosts.length],
    ["exposed", "Expostos", counts("exposed")],
    ["attack", "Sob ataque", counts("attack")],
    ["errors", "Com erros", counts("errors")],
    ["cache", "Cache baixo", counts("cache")],
  ];

  return (
    <div className="hv">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Linha do tempo da zona ── */}
      <section className="hv-band" aria-label="Linha do tempo da zona">
        <div className="hv-band-h">
          <b>{days === 1 ? "Últimas 24 h" : "Últimos 3 dias"} na zona</b>
          <small>
            {canHistory ? "alterações marcadas sobre o tráfego" : "tráfego e mitigações"}
          </small>
        </div>
        {an ? (
          <>
            <div className="hv-zk">
              <div>
                <span>Requisições</span>
                <b>{fmtK(an.totals.requests)}</b>
              </div>
              <div>
                <span>Do cache</span>
                <b>
                  {an.totals.requests
                    ? pct(Math.round((an.totals.cached / an.totals.requests) * 1000) / 10)
                    : "—"}
                </b>
              </div>
              <div>
                <span>Mitigadas</span>
                <b style={{ color: an.totals.mitigated ? "var(--v2-crit)" : undefined }}>
                  {fmtK(an.totals.mitigated)}
                </b>
              </div>
              <div>
                <span>Erros 5xx</span>
                <b>{errRate === null ? "—" : pct(errRate)}</b>
              </div>
              <div>
                <span>Hosts</span>
                <b>{hosts.length}</b>
              </div>
            </div>
            <Timeline
              series={an.timeseries}
              sinceMs={new Date(an.range.since).getTime()}
              untilMs={new Date(an.range.until).getTime()}
              pins={canHistory ? changes : []}
              onPin={setOpenChange}
            />
            <div className="hv-leg">
              <span>
                <i style={{ background: "var(--v2-ok)" }} />
                Do cache
              </span>
              <span>
                <i style={{ background: "var(--v2-accent)" }} />
                Da origem
              </span>
              <span>
                <i style={{ background: "var(--v2-crit)" }} />
                Mitigadas
              </span>
              {canHistory && (
                <span>
                  <i style={{ background: "var(--v2-accent)", borderRadius: "50%" }} />
                  {windowChanges.length
                    ? `Alteração (${windowChanges.length} no período, clique para ver)`
                    : "Nenhuma alteração no período"}
                </span>
              )}
            </div>
          </>
        ) : (
          <div className="hv-empty">
            {anQ.isLoading ? "Carregando tráfego…" : "Tráfego indisponível para esta zona."}
          </div>
        )}
      </section>

      {/* ── Hosts + detalhe ── */}
      <div className="hv-split">
        <section className="hv-panel" aria-label="Hosts">
          <div className="hv-ph">
            <b>Hosts</b>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {FILTERS.map(([k, l, n]) => (
                <button
                  key={k}
                  className="hv-fb"
                  aria-pressed={filter === k}
                  onClick={() => setFilter(k)}
                >
                  {l}
                  <span className="n">{n}</span>
                </button>
              ))}
            </div>
          </div>
          {hostsQ.data?.ok && hostsQ.data.metricsError && (
            <div className="hv-warn">
              Métricas por host indisponíveis: {hostsQ.data.metricsError}
            </div>
          )}
          <div className="hv-hh">
            <span />
            <span>Host</span>
            <span>Req.</span>
            <span className="hv-c4">Cache</span>
            <span>Mitig.</span>
          </div>
          <div>
            {hostsQ.isLoading ? (
              <div className="hv-empty">Carregando hosts…</div>
            ) : hostsQ.data && !hostsQ.data.ok ? (
              <div className="hv-empty">{hostsQ.data.error}</div>
            ) : rows.length === 0 ? (
              <div className="hv-empty">Nenhum host com esse filtro.</div>
            ) : (
              rows.map((h) => {
                const st = stateOf(h);
                const proxied = h.record ? h.record.proxied : true;
                return (
                  <button
                    key={h.host}
                    className="hv-row"
                    aria-selected={selected?.host === h.host}
                    onClick={() => setSel(h.host)}
                  >
                    <span
                      className="hv-dot"
                      style={{ "--c": st.color } as React.CSSProperties}
                      title={st.label}
                    />
                    <span className="hv-nm">
                      <b>{h.host}</b>
                      <small>
                        {h.record
                          ? `${h.record.type} → ${h.record.content}${proxied ? "" : " · sem proxy"}`
                          : "sem registro próprio (wildcard)"}
                      </small>
                    </span>
                    {!proxied ? (
                      <span className="hv-nd">sem dados — não passa pela Cloudflare</span>
                    ) : (
                      <>
                        <span className="hv-num">{fmtK(h.requests)}</span>
                        <span className="hv-num hv-c4">
                          {h.cachedPct === null ? "—" : `${Math.round(h.cachedPct)}%`}
                          {h.cachedPct !== null && (
                            <span
                              className="hv-mini"
                              style={
                                {
                                  "--c": h.cachedPct < 50 ? "var(--v2-high)" : "var(--v2-ok)",
                                } as React.CSSProperties
                              }
                            >
                              <i style={{ width: `${h.cachedPct}%` }} />
                            </span>
                          )}
                        </span>
                        <span
                          className="hv-num"
                          style={{ color: h.mitigated >= 1000 ? "var(--v2-crit)" : undefined }}
                        >
                          {fmtK(h.mitigated)}
                        </span>
                      </>
                    )}
                  </button>
                );
              })
            )}
          </div>
        </section>

        <section className="hv-panel" aria-live="polite">
          {!selected ? (
            <div className="hv-empty">Escolha um host na lista.</div>
          ) : (
            <HostDetail
              h={selected}
              zoneId={zoneId!}
              days={days}
              zoneName={zoneName}
              tab={tab}
              setTab={setTab}
              changes={changes.filter((c) => changeHosts(c).includes(selected.host))}
              canHistory={canHistory}
              canEditDns={canEditDns}
              canPurge={canPurge}
              canWaf={canWaf}
              onOpenConfig={onOpenConfig}
              onOpenChange={setOpenChange}
            />
          )}
        </section>
      </div>
      <ChangeDetailSheet change={openChange} onClose={() => setOpenChange(null)} />
    </div>
  );
}

function HostDetail({
  h,
  zoneId,
  days,
  zoneName,
  tab,
  setTab,
  changes,
  canHistory,
  canEditDns,
  canPurge,
  canWaf,
  onOpenConfig,
  onOpenChange,
}: {
  h: ZoneHost;
  zoneId: string;
  days: 1 | 3;
  zoneName: string | null;
  tab: "sec" | "rules" | "cache" | "dns";
  setTab: (t: "sec" | "rules" | "cache" | "dns") => void;
  changes: ZoneChange[];
  canHistory: boolean;
  canEditDns: boolean;
  canPurge: boolean;
  canWaf: boolean;
  onOpenConfig: OpenConfig;
  onOpenChange: (c: ZoneChange) => void;
}) {
  const st = stateOf(h);
  const proxied = h.record ? h.record.proxied : true;
  const [proxyOpen, setProxyOpen] = React.useState(false);
  const { can } = usePermissions();
  const canSec = can("cloudflare-waf", "view_analytics_security");
  const canCache = can("cloudflare-waf", "view_analytics_http");
  const allowedTab = (t: typeof tab) => (t === "sec" ? canSec : t === "cache" ? canCache : true);
  // Host sem proxy não tem tráfego na Cloudflare: só a aba de DNS faz sentido
  const activeTab = !proxied ? "dns" : allowedTab(tab) ? tab : canSec ? "sec" : "rules";
  const insight =
    st.key === "exposed" ? (
      <div className="hv-ins" style={{ "--c": "var(--v2-high)" } as React.CSSProperties}>
        <span className="i">!</span>
        <span>
          <b>O IP de origem ({h.record?.content}) está público.</b> Sem proxy, o tráfego vai direto
          ao servidor: WAF, cache e bloqueios não se aplicam. Se o serviço não for HTTP/HTTPS (VPN,
          FTP, e-mail), ligar o proxy derruba o acesso: nesse caso prefira Cloudflare Tunnel ou
          restringir por IP.
        </span>
        {canEditDns && h.record && (
          <button className="cf-btn sm primary" onClick={() => setProxyOpen(true)}>
            Ligar proxy
          </button>
        )}
      </div>
    ) : st.key === "attack" ? (
      <div className="hv-ins" style={{ "--c": "var(--v2-crit)" } as React.CSSProperties}>
        <span className="i">↑</span>
        <span>
          <b>{h.mitigated.toLocaleString("pt-BR")} requisições mitigadas</b> (
          {pct(Math.round((h.mitigated / h.requests) * 10000) / 100)} do tráfego deste host). Veja a
          origem e as regras que bloquearam em Analytics › Security, filtrando por este host.
        </span>
      </div>
    ) : st.key === "errors" ? (
      <div className="hv-ins" style={{ "--c": "var(--v2-high)" } as React.CSSProperties}>
        <span className="i">!</span>
        <span>
          <b>{h.errors5xx.toLocaleString("pt-BR")} respostas 5xx</b> (
          {pct(Math.round((h.errors5xx / h.requests) * 10000) / 100)} das requisições). A origem
          está respondendo com erro.
        </span>
      </div>
    ) : st.key === "cache" ? (
      <div className="hv-ins" style={{ "--c": "var(--v2-med)" } as React.CSSProperties}>
        <span className="i">%</span>
        <span>
          <b>Só {Math.round(h.cachedPct ?? 0)}% vem do cache.</b> A maior parte das requisições vai
          à origem; uma Cache Rule para os caminhos mais pedidos pode aliviar o servidor.
        </span>
      </div>
    ) : null;

  return (
    <>
      <div className="hv-dh">
        <div className="hv-dh-t">
          <div style={{ display: "grid", gap: 6, minWidth: 0 }}>
            <h2>{h.host}</h2>
            <div className="hv-rec">
              {h.record ? (
                <>
                  <span className="hv-tag">{h.record.type}</span>
                  <code>{h.record.content}</code>
                  <span
                    className="hv-pill"
                    style={
                      {
                        "--c": proxied ? "var(--v2-high)" : "var(--v2-fg-3)",
                      } as React.CSSProperties
                    }
                  >
                    {proxied ? "Proxied" : "DNS only"}
                  </span>
                </>
              ) : (
                <span>Coberto por um registro wildcard</span>
              )}
              <span className="hv-pill" style={{ "--c": st.color } as React.CSSProperties}>
                {st.label}
              </span>
            </div>
          </div>
          <div className="hv-acts">
            {canEditDns && h.record && (
              <button
                className="cf-btn sm"
                onClick={() => onOpenConfig("dns", { initialQuery: h.host, autoEditName: h.host })}
              >
                <Pencil size={12} /> Editar DNS
              </button>
            )}
            {canPurge && proxied && (
              <button
                className="cf-btn sm"
                onClick={() => onOpenConfig("purge", { initialHosts: [h.host] })}
              >
                <Zap size={12} /> Limpar cache
              </button>
            )}
            {canWaf && proxied && (
              <button
                className="cf-btn sm"
                onClick={() =>
                  onOpenConfig("waf", {
                    wafDraft: {
                      description: `Regra para ${h.host}`,
                      expression: `(http.host eq "${h.host}")`,
                    },
                  })
                }
              >
                <Plus size={12} /> Regra para este host
              </button>
            )}
          </div>
        </div>
        {insight}
      </div>
      {proxied && (
        <div className="hv-dk">
          <div>
            <span>Requisições</span>
            <b>{fmtK(h.requests)}</b>
          </div>
          <div>
            <span>Do cache</span>
            <b
              style={{
                color: h.cachedPct !== null && h.cachedPct < 50 ? "var(--v2-high)" : undefined,
              }}
            >
              {h.cachedPct === null ? "—" : `${Math.round(h.cachedPct)}%`}
            </b>
          </div>
          <div>
            <span>Mitigadas</span>
            <b style={{ color: h.mitigated >= 1000 ? "var(--v2-crit)" : undefined }}>
              {fmtK(h.mitigated)}
            </b>
            <small>
              {h.requests ? pct(Math.round((h.mitigated / h.requests) * 10000) / 100) : "—"}
            </small>
          </div>
          <div>
            <span>Erros 5xx</span>
            <b style={{ color: st.key === "errors" ? "var(--v2-high)" : undefined }}>
              {fmtK(h.errors5xx)}
            </b>
            <small>
              {h.requests ? pct(Math.round((h.errors5xx / h.requests) * 10000) / 100) : "—"}
            </small>
          </div>
        </div>
      )}
      <nav className="cf-subtabs" role="tablist" style={{ padding: "0 14px" }}>
        {proxied && (
          <>
            {canSec && (
              <button role="tab" aria-selected={activeTab === "sec"} onClick={() => setTab("sec")}>
                Segurança
              </button>
            )}
            <button
              role="tab"
              aria-selected={activeTab === "rules"}
              onClick={() => setTab("rules")}
            >
              Regras que se aplicam
            </button>
            {canCache && (
              <button
                role="tab"
                aria-selected={activeTab === "cache"}
                onClick={() => setTab("cache")}
              >
                Cache
              </button>
            )}
          </>
        )}
        <button role="tab" aria-selected={activeTab === "dns"} onClick={() => setTab("dns")}>
          DNS e histórico{canHistory && changes.length ? ` · ${changes.length}` : ""}
        </button>
      </nav>
      <div className="hv-tb">
        {activeTab === "sec" ? (
          <HostSecurityTab zoneId={zoneId} host={h.host} days={days} />
        ) : activeTab === "rules" ? (
          <HostRulesTab zoneId={zoneId} host={h.host} onOpenConfig={onOpenConfig} />
        ) : activeTab === "cache" ? (
          <HostCacheTab zoneId={zoneId} host={h.host} days={days} onOpenConfig={onOpenConfig} />
        ) : (
          <>
            {h.record ? (
              <dl className="hv-kv">
                <dt>Zona</dt>
                <dd>{zoneName ?? "—"}</dd>
                <dt>Tipo</dt>
                <dd>{h.record.type}</dd>
                <dt>Conteúdo</dt>
                <dd style={{ fontFamily: "var(--font-data)", fontSize: 12.5 }}>
                  {h.record.content}
                </dd>
                <dt>Proxy</dt>
                <dd>{h.record.proxied ? "Ativado" : "Desativado"}</dd>
                <dt>TTL</dt>
                <dd>{!h.record.ttl || h.record.ttl === 1 ? "Auto" : `${h.record.ttl} s`}</dd>
                <dt>Comentário</dt>
                <dd>{h.record.comment || "—"}</dd>
              </dl>
            ) : (
              <p style={{ margin: 0, fontSize: 13, color: "var(--v2-fg-3)" }}>
                Este host não tem registro próprio: é atendido por um registro wildcard (*.
                {zoneName}
                ).
              </p>
            )}
            <p className="hv-lbl">Histórico do host</p>
            {!canHistory ? (
              <p style={{ margin: 0, fontSize: 13, color: "var(--v2-fg-3)" }}>
                Você não tem permissão para ver o histórico de alterações.
              </p>
            ) : changes.length === 0 ? (
              <p style={{ margin: 0, fontSize: 13, color: "var(--v2-fg-3)" }}>
                Nenhuma alteração registrada para este host no período.
              </p>
            ) : (
              <div className="hv-list">
                {changes.map((c) => {
                  const t = changeText(c);
                  return (
                    <button key={c.id} className="hv-li" onClick={() => onOpenChange(c)}>
                      <span style={{ minWidth: 0 }}>
                        <b style={{ fontWeight: 500 }}>{changeWho(c)}</b> {t.verb}
                      </span>
                      <small>{fmtWhen(c.createdAt)}</small>
                    </button>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
      {h.record && (
        <ProxyDialog
          open={proxyOpen}
          onOpenChange={setProxyOpen}
          zoneId={zoneId}
          host={h.host}
          record={h.record}
        />
      )}
    </>
  );
}

// Serviços que não são HTTP/HTTPS param de funcionar com o proxy da Cloudflare
const NON_HTTP =
  /^(vpn|ftp|sftp|ssh|rdp|smtp|mail|imap|pop|pop3|mx|sip|voip|db|sql|mysql|postgres|redis|ldap)\d*\./i;

function ProxyDialog({
  open,
  onOpenChange,
  zoneId,
  host,
  record,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  zoneId: string;
  host: string;
  record: NonNullable<ZoneHost["record"]>;
}) {
  const qc = useQueryClient();
  const update = useServerFn(updateDnsRecord);
  const [saving, setSaving] = React.useState(false);
  const risky = NON_HTTP.test(host);
  async function confirm() {
    setSaving(true);
    try {
      const res = (await update({
        data: {
          zoneId,
          recordId: record.id,
          type: record.type as "A" | "AAAA" | "CNAME",
          name: host,
          content: record.content,
          ttl: 1,
          proxied: true,
          ...(record.comment ? { comment: record.comment } : {}),
        },
      })) as { ok: boolean; error?: string };
      if (res.ok) {
        toast.success(`Proxy ligado em ${host}.`);
        qc.invalidateQueries({ queryKey: ["cf-zone-hosts"] });
        qc.invalidateQueries({ queryKey: ["cf-zone-changes"] });
        onOpenChange(false);
      } else toast.error(res.error ?? "Falha ao ligar o proxy.");
    } finally {
      setSaving(false);
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Ligar o proxy de {host}?</DialogTitle>
        </DialogHeader>
        <div style={{ display: "grid", gap: 12, fontSize: 13.5, lineHeight: 1.55 }}>
          <p style={{ margin: 0, color: "var(--v2-fg-2)" }}>
            O tráfego passa a ir para a Cloudflare antes do servidor: WAF, cache e bloqueios começam
            a valer e o IP de origem deixa de aparecer no DNS. O TTL vira Automático.
          </p>
          <div
            className="hv-ins"
            style={
              {
                "--c": risky ? "var(--v2-crit)" : "var(--v2-med)",
                gridTemplateColumns: "22px minmax(0,1fr)",
              } as React.CSSProperties
            }
          >
            <span className="i">!</span>
            <span>
              {risky ? (
                <>
                  <b>Este nome indica um serviço que não é HTTP/HTTPS.</b> Com o proxy ligado ele{" "}
                  <b>para de funcionar</b>. Para protegê-lo, use Cloudflare Tunnel ou restrinja o
                  acesso por IP no firewall.
                </>
              ) : (
                <>
                  <b>Confira antes:</b> o servidor precisa responder em HTTP/HTTPS nas portas
                  aceitas pela Cloudflare (80, 443, 8080, 8443…) e, no modo SSL Full (strict), com
                  certificado válido.
                </>
              )}
            </span>
          </div>
        </div>
        <DialogFooter>
          <button className="cf-btn" onClick={() => onOpenChange(false)}>
            Cancelar
          </button>
          <button className="cf-btn primary" onClick={confirm} disabled={saving}>
            {saving && <Loader2 size={13} className="animate-spin" />}
            {risky ? "Ligar mesmo assim" : "Ligar proxy"}
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
