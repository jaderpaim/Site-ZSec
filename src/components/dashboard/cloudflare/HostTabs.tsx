import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { getHostCache, getHostSecurity } from "@/lib/cloudflare.hosts.functions";
import { listCustomRules } from "@/lib/cloudflare.functions";
import { getRulesOverview, listPageRules } from "@/lib/cloudflare.rules.functions";
import { usePermissions } from "@/lib/use-permissions";
import type { OpenConfig } from "./HostsView";

const fmt = (n: number) => n.toLocaleString("pt-BR");
const fmtK = (n: number) =>
  n >= 1e6
    ? `${(n / 1e6).toFixed(1).replace(".", ",")} mi`
    : n >= 1e3
      ? `${(n / 1e3).toFixed(1).replace(".", ",")} mil`
      : String(n);

const SOURCE_LABEL: Record<string, string> = {
  firewallrules: "Custom rules",
  firewallCustom: "Custom rules",
  firewallManaged: "Managed rules",
  waf: "Managed rules",
  ratelimit: "Rate limiting",
  l7ddos: "HTTP DDoS",
  bic: "Browser Integrity Check",
  hot: "Hotlink Protection",
  securitylevel: "Security Level",
  uablock: "User Agent Blocking",
  zonelockdown: "Zone Lockdown",
  iprange: "IP Access Rules",
  ip: "IP Access Rules",
  country: "IP Access Rules",
  asn: "IP Access Rules",
  botFight: "Bot Fight Mode",
  botManagement: "Bot Management",
  dlp: "Sensitive Data Detection",
  validation: "Validação",
};
const ACTION_LABEL: Record<string, string> = {
  block: "Block",
  managed_challenge: "Managed Challenge",
  challenge: "Interactive Challenge",
  jschallenge: "JS Challenge",
  js_challenge: "JS Challenge",
  log: "Log",
  skip: "Skip",
  allow: "Allow",
  bypass: "Bypass",
};
const actionColor = (a: string) =>
  a === "block"
    ? "var(--v2-crit)"
    : a === "log" || a === "skip" || a === "allow" || a === "bypass"
      ? "var(--v2-fg-3)"
      : "var(--v2-high)";

const CACHE_COLOR: Record<string, string> = {
  hit: "var(--v2-ok)",
  stale: "var(--v2-low)",
  revalidated: "var(--v2-low)",
  updating: "var(--v2-low)",
  dynamic: "var(--v2-accent)",
  miss: "var(--v2-high)",
  expired: "var(--v2-med)",
  bypass: "var(--v2-crit)",
  none: "var(--v2-fg-3)",
};

function Rank({ rows, color }: { rows: Array<[string, number]>; color: string }) {
  const mx = Math.max(1, ...rows.map((r) => r[1]));
  return (
    <div className="ht-rank">
      {rows.map(([n, v]) => (
        <div key={n} className="ht-r" style={{ "--c": color } as React.CSSProperties}>
          <span className="n" title={n}>
            {n}
          </span>
          <span className="v">{fmtK(v)}</span>
          <span className="t">
            <i style={{ width: `${(v / mx) * 100}%` }} />
          </span>
        </div>
      ))}
    </div>
  );
}

// ── Segurança ────────────────────────────────────────────────────────────────
export function HostSecurityTab({
  zoneId,
  host,
  days,
}: {
  zoneId: string;
  host: string;
  days: 1 | 3;
}) {
  const fn = useServerFn(getHostSecurity);
  const q = useQuery({
    queryKey: ["cf-host-security", zoneId, host, days],
    queryFn: () => fn({ data: { zoneId, host, days } }),
  });
  const d = q.data;
  if (q.isLoading) return <p className="ht-muted">Carregando eventos de segurança…</p>;
  if (!d || !d.ok) return <p className="ht-muted">{d && !d.ok ? d.error : "Sem dados."}</p>;
  if (d.rules.length === 0)
    return <p className="ht-muted">Nenhum evento de segurança neste host no período.</p>;
  return (
    <>
      <p className="hv-lbl">O que agiu neste host</p>
      <div className="ht-list">
        {d.rules.map((r, i) => (
          <div key={i} className="ht-li">
            <span style={{ minWidth: 0 }}>
              <b>{r.description || SOURCE_LABEL[r.source] || r.source}</b>{" "}
              <span className="cat">· {SOURCE_LABEL[r.source] ?? r.source}</span>
              {r.ruleId && <small>{r.ruleId}</small>}
            </span>
            <span
              className="ht-pill"
              style={{ "--c": actionColor(r.action) } as React.CSSProperties}
            >
              {ACTION_LABEL[r.action] ?? r.action}
            </span>
            <span className="ht-m" style={{ fontSize: 12.5 }}>
              {fmt(r.count)}
            </span>
          </div>
        ))}
      </div>
      <div className="ht-two">
        <div>
          <p className="hv-lbl" style={{ marginBottom: 8 }}>
            IPs de origem
          </p>
          <Rank
            rows={d.topIps.map((x) => [`${x.ip}${x.country ? ` · ${x.country}` : ""}`, x.count])}
            color="var(--v2-crit)"
          />
        </div>
        <div>
          <p className="hv-lbl" style={{ marginBottom: 8 }}>
            Caminhos visados
          </p>
          <Rank rows={d.topPaths.map((x) => [x.path, x.count])} color="var(--v2-crit)" />
        </div>
      </div>
      <p className="hv-lbl">Últimos eventos</p>
      <div className="ht-tw">
        <table>
          <thead>
            <tr>
              <th>Quando</th>
              <th>Ação</th>
              <th>País</th>
              <th>IP</th>
              <th>Caminho</th>
              <th>Regra</th>
            </tr>
          </thead>
          <tbody>
            {d.events.slice(0, 12).map((e, i) => (
              <tr key={i}>
                <td className="ht-m">
                  {new Date(e.datetime).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </td>
                <td>
                  <span
                    className="ht-pill"
                    style={{ "--c": actionColor(e.action) } as React.CSSProperties}
                  >
                    {ACTION_LABEL[e.action] ?? e.action}
                  </span>
                </td>
                <td>{e.country || "—"}</td>
                <td className="ht-m">{e.ip}</td>
                <td
                  className="ht-m"
                  style={{ maxWidth: 220, overflow: "hidden", textOverflow: "ellipsis" }}
                  title={e.path}
                >
                  {e.method} {e.path}
                </td>
                <td>{e.description || SOURCE_LABEL[e.source] || e.source}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

// ── Regras que se aplicam ────────────────────────────────────────────────────
// Uma regra vale para o host quando a condição cita o host ou não restringe
// hostname nenhum (vale para todos). Page Rules: o padrão de URL casa com o host.
function scopeFor(expression: string, host: string): "host" | "all" | null {
  const e = expression.toLowerCase();
  if (e.includes(`"${host}"`) || e.includes(`//${host}/`) || e.includes(`${host}"`)) return "host";
  if (!/http\.host|http\.request\.full_uri|http\.request\.uri\b/.test(e)) return "all";
  return null;
}
function pageRuleMatches(pattern: string, host: string): boolean {
  const hostPart = pattern.replace(/^[a-z]+:\/\//i, "").split("/")[0];
  const re = new RegExp(
    `^${hostPart.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*")}$`,
    "i",
  );
  return re.test(host);
}

export function HostRulesTab({
  zoneId,
  host,
  onOpenConfig,
}: {
  zoneId: string;
  host: string;
  onOpenConfig: OpenConfig;
}) {
  const { can } = usePermissions();
  const canWaf = can("cloudflare-waf", "manage_custom_rules");
  const canOverview =
    can("cloudflare-waf", "manage_rules") && can("cloudflare-waf", "manage_rules_overview");
  const canPage =
    can("cloudflare-waf", "manage_rules") && can("cloudflare-waf", "manage_rules_page_rules");
  const wafFn = useServerFn(listCustomRules);
  const ovFn = useServerFn(getRulesOverview);
  const prFn = useServerFn(listPageRules);
  const waf = useQuery({
    queryKey: ["cf-custom-rules", zoneId],
    enabled: canWaf,
    queryFn: () => wafFn({ data: { zoneId } }),
  });
  const ov = useQuery({
    queryKey: ["cf-rules-overview", zoneId],
    enabled: canOverview,
    queryFn: () => ovFn({ data: { zoneId } }),
  });
  const pr = useQuery({
    queryKey: ["cf-page-rules", zoneId],
    enabled: canPage,
    queryFn: () => prFn({ data: { zoneId } }),
  });

  type Row = {
    name: string;
    cat: string;
    expr: string;
    scope: "host" | "all";
    on: boolean;
    open: () => void;
  };
  const rows: Row[] = [];
  const wafRules =
    (
      waf.data as
        | {
            ok?: boolean;
            rules?: Array<{ description: string; expression: string; enabled: boolean }>;
          }
        | undefined
    )?.rules ?? [];
  for (const r of wafRules) {
    const sc = scopeFor(r.expression, host);
    if (sc)
      rows.push({
        name: r.description || "Sem nome",
        cat: "Custom rule (WAF)",
        expr: r.expression,
        scope: sc,
        on: r.enabled,
        open: () => onOpenConfig("waf"),
      });
  }
  if (ov.data?.ok)
    for (const c of ov.data.categories)
      for (const r of c.rules) {
        const sc = scopeFor(r.expression, host);
        if (sc)
          rows.push({
            name: r.description || "Sem nome",
            cat: c.label,
            expr: r.expression,
            scope: sc,
            on: r.enabled,
            open: () => onOpenConfig("rules"),
          });
      }
  if (pr.data?.ok)
    for (const r of pr.data.rules)
      if (pageRuleMatches(r.urlPattern, host))
        rows.push({
          name: r.urlPattern,
          cat: "Page Rule",
          expr: r.actionsLabel,
          scope: r.urlPattern
            .replace(/^[a-z]+:\/\//i, "")
            .split("/")[0]
            .includes("*")
            ? "all"
            : "host",
          on: r.status === "active",
          open: () => onOpenConfig("pagerules"),
        });

  const loading = waf.isLoading || ov.isLoading || pr.isLoading;
  const missing = [
    !canWaf && "Custom rules",
    !canOverview && "Regras",
    !canPage && "Page Rules",
  ].filter(Boolean);
  return (
    <>
      <p className="ht-muted">
        Regras da zona cuja condição cita{" "}
        <b style={{ fontFamily: "var(--font-data)", color: "var(--v2-fg)" }}>{host}</b> ou vale para
        todos os hosts, na ordem em que a Cloudflare executa.
      </p>
      {loading ? (
        <p className="ht-muted">Carregando regras…</p>
      ) : rows.length === 0 ? (
        <p className="ht-muted">Nenhuma regra se aplica a este host.</p>
      ) : (
        <div className="ht-list">
          {rows.map((r, i) => (
            <button key={i} className="ht-li" onClick={r.open} title="Abrir a tela da regra">
              <span style={{ minWidth: 0 }}>
                <b>{r.name}</b> <span className="cat">· {r.cat}</span>
                <small title={r.expr}>{r.expr}</small>
              </span>
              <span className="ht-tag">{r.scope === "host" ? "este host" : "todos os hosts"}</span>
              <span
                className="ht-pill"
                style={{ "--c": r.on ? "var(--v2-ok)" : "var(--v2-fg-3)" } as React.CSSProperties}
              >
                {r.on ? "Ativa" : "Desabilitada"}
              </span>
            </button>
          ))}
        </div>
      )}
      {missing.length > 0 && (
        <p className="ht-muted">Sem permissão para ver: {missing.join(", ")}.</p>
      )}
    </>
  );
}

// ── Cache ────────────────────────────────────────────────────────────────────
export function HostCacheTab({
  zoneId,
  host,
  days,
  onOpenConfig,
}: {
  zoneId: string;
  host: string;
  days: 1 | 3;
  onOpenConfig: OpenConfig;
}) {
  const { can } = usePermissions();
  const canCacheRules =
    can("cloudflare-waf", "manage_rules") && can("cloudflare-waf", "manage_rules_overview_cache");
  const fn = useServerFn(getHostCache);
  const q = useQuery({
    queryKey: ["cf-host-cache", zoneId, host, days],
    queryFn: () => fn({ data: { zoneId, host, days } }),
  });
  const d = q.data;
  if (q.isLoading) return <p className="ht-muted">Carregando cache…</p>;
  if (!d || !d.ok) return <p className="ht-muted">{d && !d.ok ? d.error : "Sem dados."}</p>;
  const total = d.byStatus.reduce((a, b) => a + b.count, 0);
  if (total === 0) return <p className="ht-muted">Sem requisições neste host no período.</p>;
  const pctOf = (n: number) =>
    `${((n / total) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
  const top = d.uncachedPaths[0];
  return (
    <>
      <p className="hv-lbl">Status de cache</p>
      <div className="ht-stack">
        {d.byStatus.map((s) => (
          <i
            key={s.status}
            style={{ flex: s.count, background: CACHE_COLOR[s.status] ?? "var(--v2-fg-3)" }}
            title={`${s.status}: ${fmt(s.count)} (${pctOf(s.count)})`}
          />
        ))}
      </div>
      <div className="ht-leg">
        {d.byStatus.map((s) => (
          <span key={s.status}>
            <i style={{ background: CACHE_COLOR[s.status] ?? "var(--v2-fg-3)" }} />
            {s.status} {pctOf(s.count)}
          </span>
        ))}
      </div>
      <p className="hv-lbl">Caminhos mais pedidos que não vêm do cache</p>
      {d.uncachedPaths.length ? (
        <Rank rows={d.uncachedPaths.map((p) => [p.path, p.count])} color="var(--v2-high)" />
      ) : (
        <p className="ht-muted">Tudo o que é pedido está vindo do cache.</p>
      )}
      {top && top.count / total >= 0.1 && (
        <div className="ht-tip">
          <span className="i">i</span>
          <span>
            <b style={{ fontFamily: "var(--font-data)" }}>{top.path}</b> responde por{" "}
            {pctOf(top.count)} das requisições deste host e vai sempre à origem. Se a resposta for
            igual para todos por alguns minutos, uma Cache Rule para esse caminho alivia o servidor.
          </span>
          {canCacheRules && (
            <button className="cf-btn sm" onClick={() => onOpenConfig("rules")}>
              Abrir Cache Rules
            </button>
          )}
        </div>
      )}
    </>
  );
}
