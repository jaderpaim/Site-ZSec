import * as React from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { checkZoneActivation, getZoneOverview, type ZoneOverviewPoint } from "@/lib/cloudflare.functions";
import { AlertTriangle, ArrowRight, Copy, Download, ExternalLink, Loader2, RefreshCw, XCircle } from "lucide-react";
import { Skel, SkelChart } from "./cf-ui";

// Tokens do tema (mesmos CSS vars do OperationsTab/AnalyticsTab).
const T = {
  surface: "var(--v2-surface)",
  surfaceAlt: "var(--v2-surface-2)",
  border: "var(--v2-line)",
  accent: "var(--v2-accent)",
  danger: "var(--v2-crit)",
  warning: "var(--v2-high)",
  warningBg: "color-mix(in oklch, var(--v2-high) 12%, transparent)",
  success: "var(--v2-ok)",
  successBg: "color-mix(in oklch, var(--v2-ok) 12%, transparent)",
  text: "var(--v2-fg)",
  text2: "var(--v2-fg-2)",
  grid: "var(--v2-line)",
};

type RangeKey = "24h" | "7d" | "30d";
const RANGES: { key: RangeKey; label: string }[] = [
  { key: "24h", label: "24 horas" },
  { key: "7d", label: "7 dias" },
  { key: "30d", label: "30 dias" },
];

function fmtCompact(n: number) {
  if (!Number.isFinite(n)) return "—";
  const abs = Math.abs(n);
  if (abs >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (abs >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (abs >= 1e3) return `${(n / 1e3).toFixed(2)}k`;
  return String(Math.round(n));
}
function fmtBytes(n: number) {
  if (!Number.isFinite(n) || n <= 0) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB", "PB"];
  const i = Math.min(Math.floor(Math.log(n) / Math.log(1024)), u.length - 1);
  const v = n / 1024 ** i;
  return `${v >= 100 ? Math.round(v) : v.toFixed(v >= 10 ? 1 : 2)} ${u[i]}`;
}
function fmtPct(n: number) {
  return `${(Number.isFinite(n) ? n : 0).toFixed(2)}%`;
}

type MetricKey = "uniques" | "requests" | "pctCached" | "bytes" | "cachedBytes";
const METRICS: { key: MetricKey; label: string; fmt: (n: number) => string }[] = [
  { key: "uniques", label: "Visitantes únicos", fmt: fmtCompact },
  { key: "requests", label: "Total de requisições", fmt: fmtCompact },
  { key: "pctCached", label: "Percentual em cache", fmt: fmtPct },
  { key: "bytes", label: "Total de dados servidos", fmt: fmtBytes },
  { key: "cachedBytes", label: "Dados em cache", fmt: fmtBytes },
];

// "Percent Cached" do painel nativo é por bytes (cachedBytes / bytes) —
// confere com os prints: 388 GB / 509 GB = 76,2%.
const pctOf = (cached: number, total: number) => (total > 0 ? (cached / total) * 100 : 0);

export function ZoneOverview({ zoneId }: { zoneId: string }) {
  const fetchOverview = useServerFn(getZoneOverview);
  const doCheck = useServerFn(checkZoneActivation);
  const [range, setRange] = React.useState<RangeKey>("24h");
  const [checking, setChecking] = React.useState(false);

  const { data, isLoading, isFetching, isPlaceholderData, refetch } = useQuery({
    queryKey: ["cloudflare-zone-overview", zoneId, range],
    queryFn: () => fetchOverview({ data: { zoneId, range } }),
    enabled: !!zoneId,
    staleTime: 60_000,
    // Trocar o período mantém os gráficos na tela (esmaecidos) até chegar o novo.
    // Trocar a zona não (o cabeçalho mostraria a zona antiga): volta ao esqueleto.
    placeholderData: (prev, prevQuery) =>
      prevQuery?.queryKey[1] === zoneId ? keepPreviousData(prev) : undefined,
  });

  if (!zoneId) {
    return <Empty>Selecione um domínio para ver o overview.</Empty>;
  }
  if (isLoading) {
    // Primeira carga: já no tamanho final, em esqueleto, com o aviso no topo.
    return (
      <section className="cfx-block cfx-loading" aria-busy style={{ border: 0, background: "transparent" }}>
        <div className="cfx-load-bar" aria-hidden />
        <div className="cfx-load-pill" role="status">
          <span className="cfx-load-spin" aria-hidden />
          Carregando overview…
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <Skel w={70} h={10} />
            <Skel w={220} h={20} />
            <Skel w={320} h={11} />
          </div>
          <Skel w={230} h={30} />
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {METRICS.map((m) => (
              <div
                key={m.key}
                className="zo-metric"
                style={{
                  display: "grid",
                  gridTemplateColumns: "minmax(140px, 180px) minmax(0, 1fr)",
                  alignItems: "center",
                  gap: 12,
                  padding: "12px 16px",
                  border: `1px solid ${T.border}`,
                  borderRadius: 10,
                  background: T.surface,
                }}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <div style={{ fontSize: 12, color: T.text2 }}>{m.label}</div>
                  <Skel w="60%" h={20} />
                </div>
                <SkelChart h={120} />
              </div>
            ))}
          </div>
        </div>
      </section>
    );
  }
  if (!data) return null;
  if (!data.ok) {
    return (
      <Empty>
        <AlertTriangle size={14} color={T.danger} /> {data.error}
      </Empty>
    );
  }

  const { zone } = data;
  const pending = zone.status !== "active";

  async function checkNow() {
    setChecking(true);
    try {
      const r = await doCheck({ data: { zoneId } });
      if (r.ok) {
        toast.success("Verificação de nameservers solicitada à Cloudflare.");
        setTimeout(() => refetch(), 4000);
      } else toast.error(r.error);
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao verificar nameservers.");
    } finally {
      setChecking(false);
    }
  }

  const chartData = data.series.map((p) => ({ ...p, pctCached: pctOf(p.cachedBytes, p.bytes) }));
  const totals = data.totals
    ? { ...data.totals, pctCached: pctOf(data.totals.cachedBytes, data.totals.bytes) }
    : null;

  const fmtTick = (t: string) => {
    const d = new Date(t.length === 10 ? `${t}T00:00:00Z` : t);
    if (Number.isNaN(d.getTime())) return t;
    return range === "24h"
      ? d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "UTC" });
  };
  const rangeLabel = (() => {
    const opt: Intl.DateTimeFormatOptions = { day: "numeric", month: "long" };
    const s = new Date(data.range.since).toLocaleDateString("pt-BR", opt);
    const u = new Date(data.range.until).toLocaleDateString("pt-BR", opt);
    return `${s} — ${u}`.toUpperCase();
  })();

  function downloadCsv() {
    const head = ["periodo", "visitantes_unicos", "requisicoes", "requisicoes_cache", "bytes", "bytes_cache", "percentual_cache"];
    const rows = chartData.map((p) =>
      [p.t, p.uniques, p.requests, p.cachedRequests, p.bytes, p.cachedBytes, p.pctCached.toFixed(2)].join(","),
    );
    const blob = new Blob([[head.join(","), ...rows].join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `overview-${zone.name}-${range}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const dashUrl = zone.accountId
    ? `https://dash.cloudflare.com/${zone.accountId}/${zone.name}${pending ? "" : "/analytics/traffic"}`
    : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Cabeçalho */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 11, color: T.text2 }}>Overview</div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
            <span style={{ fontSize: 20, fontWeight: 600, wordBreak: "break-all" }}>{zone.name}</span>
            {zone.plan && <Pill>{zone.plan}</Pill>}
            <StatusPill status={zone.status} paused={zone.paused} />
          </div>
          <div style={{ fontSize: 12, color: T.text2, marginTop: 2 }}>
            {pending
              ? "Este é o último passo para a Cloudflare acelerar e proteger o tráfego do domínio."
              : "Monitore como a Cloudflare processa o tráfego deste domínio."}
          </div>
        </div>
        {dashUrl && (
          <a className="ops-btn outline sm" href={dashUrl} target="_blank" rel="noreferrer noopener">
            <ExternalLink size={12} /> Abrir na Cloudflare
          </a>
        )}
      </div>

      {zone.paused && (
        <Notice tone="warning">Cloudflare pausada neste domínio — o tráfego vai direto para a origem, sem proxy.</Notice>
      )}

      {pending ? (
        <PendingSteps zone={zone} checking={checking} onCheck={checkNow} />
      ) : (
        <>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <div
              role="tablist"
              aria-label="Período"
              style={{ display: "inline-flex", padding: 3, gap: 2, borderRadius: 8, background: T.surfaceAlt, border: `1px solid ${T.border}` }}
            >
              {RANGES.map((r) => (
                <button
                  key={r.key}
                  role="tab"
                  aria-selected={range === r.key}
                  onClick={() => setRange(r.key)}
                  style={{
                    padding: "5px 12px",
                    borderRadius: 6,
                    fontSize: 12,
                    border: range === r.key ? `1px solid ${T.border}` : "1px solid transparent",
                    background: range === r.key ? T.surface : "transparent",
                    color: range === r.key ? T.text : T.text2,
                    cursor: "pointer",
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>
            <span style={{ fontSize: 11, color: T.text2, display: "inline-flex", alignItems: "center", gap: 6, fontFamily: "var(--font-data)" }}>
              {isFetching && <Loader2 size={12} className="animate-spin" />}
              {rangeLabel}
            </span>
          </div>

          {data.analyticsError ? (
            <Notice tone="warning">Não foi possível carregar o tráfego: {data.analyticsError}</Notice>
          ) : (
            <div
              className={`cfx-block${isPlaceholderData ? " cfx-busy" : ""}`}
              aria-busy={isPlaceholderData}
              style={{ border: 0, background: "transparent" }}
            >
              <div className="cfx-load-bar" aria-hidden />
              {isPlaceholderData && (
                <div className="cfx-load-pill" role="status" style={{ top: 12 }}>
                  <span className="cfx-load-spin" aria-hidden />
                  Carregando {RANGES.find((r) => r.key === range)?.label.toLowerCase()}…
                </div>
              )}
            <div className="cfx-block-b" style={{ display: "flex", flexDirection: "column", gap: 10, padding: 0 }}>
              {METRICS.map((m) => (
                <MetricRow
                  key={m.key}
                  label={m.label}
                  value={totals ? m.fmt(totals[m.key]) : "—"}
                  data={chartData}
                  dataKey={m.key}
                  fmt={m.fmt}
                  fmtTick={fmtTick}
                  isPct={m.key === "pctCached"}
                />
              ))}
            </div>
            </div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            {dashUrl ? (
              <a href={dashUrl} target="_blank" rel="noreferrer noopener" style={{ fontSize: 12, color: T.accent, textDecoration: "underline" }}>
                Ver mais analytics
              </a>
            ) : (
              <span />
            )}
            <button className="ops-btn ghost" onClick={downloadCsv} disabled={chartData.length === 0} style={{ color: T.accent, fontSize: 12 }}>
              <Download size={12} /> Baixar dados
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function MetricRow({
  label,
  value,
  data,
  dataKey,
  fmt,
  fmtTick,
  isPct,
}: {
  label: string;
  value: string;
  data: Array<ZoneOverviewPoint & { pctCached: number }>;
  dataKey: MetricKey;
  fmt: (n: number) => string;
  fmtTick: (t: string) => string;
  isPct: boolean;
}) {
  const gid = `zo-${dataKey}`;
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "minmax(140px, 180px) minmax(0, 1fr)",
        alignItems: "center",
        gap: 12,
        padding: "12px 16px",
        border: `1px solid ${T.border}`,
        borderRadius: 10,
        background: T.surface,
      }}
      className="zo-metric"
    >
      <div>
        <div style={{ fontSize: 12, color: T.text2 }}>{label}</div>
        <div style={{ fontSize: 22, fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      </div>
      <div style={{ height: 120, minWidth: 0 }}>
        {data.length === 0 ? (
          <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, color: T.text2 }}>
            Sem dados no período.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 6, right: 12, bottom: 0, left: 4 }}>
              <defs>
                <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={T.accent} stopOpacity={0.22} />
                  <stop offset="100%" stopColor={T.accent} stopOpacity={0.02} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="2 4" stroke={T.grid} vertical={false} />
              <XAxis
                dataKey="t"
                tickFormatter={fmtTick}
                tick={{ fill: T.text2, fontSize: 10, fontFamily: "var(--font-data)" }}
                stroke={T.grid}
                minTickGap={28}
              />
              <YAxis
                width={52}
                axisLine={false}
                tickLine={false}
                domain={isPct ? [0, 100] : [0, "auto"]}
                tickFormatter={(v) => fmt(Number(v))}
                tick={{ fill: T.text2, fontSize: 10, fontFamily: "var(--font-data)" }}
              />
              <Tooltip
                cursor={{ stroke: T.text2, strokeDasharray: "3 3" }}
                content={({ active, payload }) => {
                  if (!active || !payload?.length) return null;
                  const p = payload[0].payload as ZoneOverviewPoint & { pctCached: number };
                  return (
                    <div
                      style={{
                        background: T.surface,
                        border: `1px solid ${T.border}`,
                        borderRadius: 6,
                        padding: "6px 10px",
                        fontSize: 11,
                        boxShadow: "0 8px 20px rgba(0,0,0,0.25)",
                      }}
                    >
                      <div style={{ color: T.text2, fontFamily: "var(--font-data)" }}>{fmtTick(p.t)}</div>
                      <div style={{ color: T.text, fontWeight: 600 }}>
                        {label}: {fmt(p[dataKey])}
                      </div>
                    </div>
                  );
                }}
              />
              <Area
                type="monotone"
                dataKey={dataKey}
                stroke={T.accent}
                strokeWidth={2}
                fill={`url(#${gid})`}
                dot={false}
                activeDot={{ r: 4, fill: T.accent, stroke: T.surface, strokeWidth: 2 }}
                isAnimationActive={false}
              />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

function PendingSteps({
  zone,
  checking,
  onCheck,
}: {
  zone: { name: string; nameServers: string[]; originalNameServers: string[]; originalRegistrar: string | null };
  checking: boolean;
  onCheck: () => void;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14, padding: 18, borderRadius: 10, background: T.surfaceAlt, border: `1px solid ${T.border}` }}>
      <div>
        <div style={{ fontSize: 15, fontWeight: 600 }}>Aguardando o registrador propagar os novos nameservers</div>
        <div style={{ fontSize: 13, color: T.text2, marginTop: 4 }}>
          A Cloudflare está verificando se o domínio aponta para ela. Isso costuma levar 1–2 horas, mas pode chegar a 24 horas
          dependendo do registrador. O status é checado periodicamente.
        </div>
      </div>
      <button className="ops-btn outline sm" style={{ alignSelf: "flex-start" }} onClick={onCheck} disabled={checking}>
        {checking ? <Loader2 size={12} className="animate-spin" /> : <RefreshCw size={12} />} Verificar nameservers agora
      </button>

      <Step n={1} title="Acesse seu provedor de DNS (provavelmente o registrador)">
        <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13 }}>
          <ArrowRight size={14} color={T.warning} />
          {zone.originalRegistrar ? (
            <span>
              Registrador atual: <strong>{zone.originalRegistrar}</strong>
            </span>
          ) : (
            <span>
              Descubra o registrador no{" "}
              <a
                href={`https://lookup.icann.org/en/lookup?name=${encodeURIComponent(zone.name)}`}
                target="_blank"
                rel="noreferrer noopener"
                style={{ color: T.accent }}
              >
                ICANN Lookup
              </a>
              {zone.name.endsWith(".br") && (
                <>
                  {" "}
                  ou no{" "}
                  <a href={`https://registro.br/tecnologia/ferramentas/whois/?search=${encodeURIComponent(zone.name)}`} target="_blank" rel="noreferrer noopener" style={{ color: T.accent }}>
                    Registro.br
                  </a>
                </>
              )}
            </span>
          )}
        </div>
        <div style={{ fontSize: 12, color: T.text2 }}>
          Se o domínio foi comprado por um revendedor ou usa outro provedor de DNS, entre nessa conta.
        </div>
      </Step>

      <Step n={2} title="Troque os nameservers atuais pelos da Cloudflare">
        <div style={{ fontSize: 13 }}>A. Encontre a seção de nameservers</div>
        <div style={{ fontSize: 13 }}>B. Adicione cada nameserver atribuído pela Cloudflare:</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, paddingLeft: 12 }}>
          {zone.nameServers.length === 0 && <span style={{ fontSize: 12, color: T.text2 }}>—</span>}
          {zone.nameServers.map((ns) => (
            <CopyChip key={ns} value={ns} />
          ))}
        </div>
        {zone.originalNameServers.length > 0 && (
          <>
            <div style={{ fontSize: 13 }}>C. Remova os outros nameservers:</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, paddingLeft: 12 }}>
              {zone.originalNameServers.map((ns) => (
                <span key={ns} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: T.danger }}>
                  <XCircle size={14} /> {ns}
                </span>
              ))}
            </div>
          </>
        )}
        <div style={{ fontSize: 13 }}>{zone.originalNameServers.length > 0 ? "D." : "C."} Salve as alterações</div>
      </Step>

      <div style={{ fontSize: 13, fontWeight: 600, marginTop: 4 }}>Recomendado</div>
      <div style={{ padding: "10px 12px", borderRadius: 8, background: T.surface, border: `1px solid ${T.border}`, fontSize: 12 }}>
        <strong>Confirme que o DNSSEC está desligado</strong> no registrador antes de trocar os nameservers — senão o domínio pode
        ficar fora do ar. Depois de ativo, dá pra reativar o DNSSEC pela Cloudflare.
      </div>
      <div style={{ fontSize: 12, color: T.text2 }}>
        Próximos passos: confira os registros DNS e o status de proxy na aba <strong>Registro DNS</strong>. A Cloudflare emite um
        certificado SSL universal grátis para o domínio raiz e subdomínios de primeiro nível.
      </div>
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ fontSize: 14, fontWeight: 600 }}>
        {n}. {title}
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6, padding: "12px 14px", borderRadius: 8, background: T.surface, border: `1px solid ${T.border}` }}>
        {children}
      </div>
    </div>
  );
}

function CopyChip({ value }: { value: string }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        alignSelf: "flex-start",
        border: `1px solid ${T.border}`,
        borderRadius: 6,
        background: T.surfaceAlt,
        fontFamily: "var(--font-data)",
        fontSize: 12,
      }}
    >
      <span style={{ padding: "6px 12px" }}>{value}</span>
      <button
        type="button"
        title="Copiar"
        aria-label={`Copiar ${value}`}
        onClick={() =>
          navigator.clipboard?.writeText(value).then(
            () => toast.success("Copiado."),
            () => toast.error("Não foi possível copiar."),
          )
        }
        style={{ padding: "6px 8px", borderLeft: `1px solid ${T.border}`, background: "transparent", color: T.text, cursor: "pointer", lineHeight: 0 }}
      >
        <Copy size={12} />
      </button>
    </span>
  );
}

function Pill({ children }: { children: React.ReactNode }) {
  return (
    <span style={{ fontSize: 11, padding: "1px 8px", borderRadius: 999, border: `1px solid ${T.border}`, background: T.surfaceAlt, color: T.text }}>
      {children}
    </span>
  );
}

function StatusPill({ status, paused }: { status: string | null; paused: boolean }) {
  const active = status === "active" && !paused;
  const label = paused ? "pausado" : status === "active" ? "ativo" : status === "pending" ? "pendente" : (status ?? "—");
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 5,
        fontSize: 11,
        padding: "1px 8px",
        borderRadius: 999,
        background: active ? T.successBg : T.warningBg,
        color: active ? T.success : T.warning,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: "50%", background: "currentColor" }} />
      {label}
    </span>
  );
}

function Notice({ tone, children }: { tone: "warning"; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "10px 12px", borderRadius: 8, background: T.warningBg, color: T.warning, fontSize: 12 }} data-tone={tone}>
      <AlertTriangle size={14} style={{ flexShrink: 0, marginTop: 1 }} />
      <span>{children}</span>
    </div>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "40px 16px", fontSize: 13, color: T.text2 }}>
      {children}
    </div>
  );
}
