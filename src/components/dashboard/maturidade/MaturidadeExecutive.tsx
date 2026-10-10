import { ModuleLoading } from "@/components/layout/ModuleLoading";
import React from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ResponsiveContainer,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  Area,
  AreaChart,
} from "recharts";
import { AlertTriangle, Lock, TrendingDown, TrendingUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  listMaturidade,
  type MaturidadePayload,
  type PropriaRow,
} from "@/lib/segmentos.functions";
import { usePermissions } from "@/lib/use-permissions";
import { MaturidadeNotas } from "./MaturidadeNotas";

/* ============ Constantes fixas (metas) ============ */
const META_NIST = 3.0;
const META_ISO = 3.0;
const ESCALA_MAX = 3.5;

type RankRow = MaturidadePayload["ranking_nist"][number];
type Fw = "nist" | "iso";

// Cores dos frameworks: paleta categórica validada (NIST azul, ISO laranja) —
// verde/vermelho ficam reservados para status (meta, acima/abaixo).
const CSS = `
  :root { --mt-nist:#3987e5; --mt-iso:#d95926; }
  :root[data-theme="light"] { --mt-nist:#2a78d6; --mt-iso:#eb6834; }

  .mt-root { font-family:var(--font-ui); color:var(--v2-fg); display:flex; flex-direction:column; gap:20px; font-size:14px; }
  .mt-root * { box-sizing:border-box; }
  .mt-root ::-webkit-scrollbar { width:6px; height:6px; }
  .mt-root ::-webkit-scrollbar-track { background:transparent; }
  .mt-root ::-webkit-scrollbar-thumb { background:var(--v2-line-strong); border-radius:3px; }
  .mt-root .mono { font-family:var(--font-data); font-size:12.5px; }
  .mt-root .dim { color:var(--v2-fg-3); }
  .mt-root .recharts-cartesian-axis-tick-value { fill:var(--v2-fg-3) !important; font-size:11px; font-family:var(--font-data); }
  .mt-up { color:color-mix(in oklch, var(--v2-ok) 75%, var(--v2-fg)); }
  .mt-dn { color:color-mix(in oklch, var(--v2-crit) 75%, var(--v2-fg)); }

  /* ── Cabeçalho ── */
  .mt-ph { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  .mt-ph-title { font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.2; margin:0; }
  .mt-ph-sub { margin:4px 0 0; font-size:13px; color:var(--v2-fg-3); }
  .mt-tags { display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  .mt-tag { display:inline-flex; align-items:center; gap:6px; height:26px; padding:0 10px; border-radius:6px; font-size:12.5px; border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-fg-2); }
  .mt-tag b { font-weight:600; color:var(--v2-fg); }
  .mt-tag.conf { border-color:color-mix(in oklch, var(--v2-med) 40%, transparent); background:color-mix(in oklch, var(--v2-med) 10%, transparent); color:color-mix(in oklch, var(--v2-med) 75%, var(--v2-fg)); }
  .mt-state { display:flex; flex-direction:column; align-items:center; gap:10px; padding:48px 24px; text-align:center; background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; }

  /* ── KPIs ── */
  .mt-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
  .mt-kpi { padding:16px 18px 14px; display:grid; gap:2px; align-content:start; box-shadow:1px 0 0 var(--v2-line), 0 1px 0 var(--v2-line); min-width:0; }
  .mt-kpi-label { font-size:12.5px; color:var(--v2-fg-2); display:flex; align-items:center; gap:6px; }
  .mt-kpi-value { font-size:28px; font-weight:600; letter-spacing:-0.02em; line-height:1.25; font-variant-numeric:tabular-nums; }
  .mt-kpi-value small { font-size:15px; font-weight:500; color:var(--v2-fg-3); margin-left:4px; }
  .mt-kpi-foot { font-size:12px; color:var(--v2-fg-3); }
  .mt-sw { width:8px; height:8px; border-radius:2px; display:inline-block; flex-shrink:0; }
  .mt-meter { height:6px; border-radius:99px; background:var(--v2-surface-2); overflow:hidden; margin:6px 0 2px; }
  .mt-meter i { display:block; height:100%; border-radius:99px; }

  /* ── Grade e cartões ── */
  .mt-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:20px; align-items:stretch; }
  .mt-grid-2 { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:20px; align-items:stretch; }
  .mt-span-2 { grid-column:span 2; }
  .mt-card { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; min-width:0; overflow:hidden; }
  /* Tabela por avaliação acompanha a altura do gráfico e rola por dentro */
  .mt-fit { height:0; min-height:100%; display:flex; flex-direction:column; }
  .mt-fit .mt-scroll { flex:1; min-height:0; overflow-y:auto; }
  @media (max-width: 1100px) {
    .mt-grid, .mt-grid-2 { grid-template-columns:minmax(0, 1fr); }
    .mt-span-2 { grid-column:auto; }
    .mt-fit { height:auto; min-height:0; max-height:420px; }
  }
  .mt-card-hdr { display:flex; align-items:flex-start; justify-content:space-between; gap:12px; flex-wrap:wrap; padding:14px 18px 4px; }
  .mt-card-title { font-size:14px; font-weight:600; margin:0; }
  .mt-card-sub { margin:2px 0 0; font-size:12.5px; color:var(--v2-fg-3); }
  .mt-card-body { padding:10px 18px 16px; }
  .mt-legend { display:flex; gap:14px; flex-wrap:wrap; font-size:12px; color:var(--v2-fg-2); }
  .mt-legend span { display:inline-flex; align-items:center; gap:6px; }
  .mt-legend .ln { width:14px; height:0; border-top:2px dashed; }
  .mt-empty { padding:28px 16px; text-align:center; color:var(--v2-fg-3); font-size:13px; }
  .mt-tip { display:grid; gap:2px; padding:8px 10px; background:var(--v2-surface-2); border:1px solid var(--v2-line-strong); border-radius:8px; font-size:12px; box-shadow:0 12px 32px rgba(0,0,0,0.3); }
  .mt-tip span { color:var(--v2-fg-2); font-family:var(--font-data); }

  /* ── Tabela ── */
  .mt-subnav { display:flex; gap:2px; padding:4px; background:var(--v2-surface-2); border:1px solid var(--v2-line); border-radius:8px; width:fit-content; max-width:100%; flex-wrap:wrap; }
  .mt-subnav button { border:1px solid transparent; background:transparent; padding:6px 14px; border-radius:6px; font:500 13px var(--font-ui); color:var(--v2-fg-3); cursor:pointer; }
  .mt-subnav button:hover { color:var(--v2-fg); background:var(--v2-hover); }
  .mt-subnav button[aria-selected="true"] { background:var(--v2-surface); color:var(--v2-fg); border-color:var(--v2-line); }
  .mt-table { width:100%; border-collapse:collapse; font-size:13px; }
  .mt-table thead { position:sticky; top:0; z-index:1; }
  .mt-table th { padding:9px 12px; font-size:12px; font-weight:500; color:var(--v2-fg-3); text-align:left; background:var(--v2-surface); border-bottom:1px solid var(--v2-line); white-space:nowrap; }
  .mt-table th.r, .mt-table td.r { text-align:right; }
  .mt-table td { padding:8px 12px; height:44px; border-bottom:1px solid var(--v2-line); white-space:nowrap; }
  .mt-table th:first-child, .mt-table td:first-child { padding-left:18px; }
  .mt-table th:last-child, .mt-table td:last-child { padding-right:18px; }
  .mt-table tbody tr:last-child td { border-bottom:none; }
  .mt-table tr.cur td { background:color-mix(in oklch, var(--v2-accent) 6%, transparent); }
  .mt-delta { font:500 12px var(--font-data); margin-left:6px; }

  /* ── Comparação por segmento ── */
  .mt-sec-h { margin:4px 0 0; font-size:16px; font-weight:600; }
  .mt-sec-p { margin:2px 0 0; font-size:13px; color:var(--v2-fg-3); }
  .mt-rank { display:grid; gap:6px; }
  .mt-rank-row { display:grid; grid-template-columns:minmax(90px, 140px) minmax(0, 1fr) 44px; gap:10px; align-items:center; font-size:13px; padding:3px 0; }
  .mt-rank-row .nm { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--v2-fg-2); }
  .mt-rank-row .bar { position:relative; height:18px; border-radius:4px; background:var(--v2-surface-2); }
  .mt-rank-row .bar i { display:block; height:100%; border-radius:4px; background:color-mix(in oklch, var(--v2-fg-3) 40%, transparent); }
  .mt-rank-row .bar .meta { position:absolute; top:-4px; bottom:-4px; width:0; border-left:1.5px dashed var(--v2-crit); }
  .mt-rank-row .v { font:500 12.5px var(--font-data); text-align:right; }
  .mt-rank-row.me .nm { color:var(--v2-fg); font-weight:600; }
  .mt-rank-row.edu .nm { color:var(--v2-fg); }
  .mt-rank-note { margin-top:14px; padding-top:12px; border-top:1px solid var(--v2-line); font-size:13px; color:var(--v2-fg-2); display:flex; gap:8px; align-items:flex-start; line-height:1.5; }
  .mt-rank-note svg { flex-shrink:0; margin-top:3px; }
  .mt-foot { display:flex; justify-content:space-between; gap:12px; flex-wrap:wrap; font-size:12.5px; color:var(--v2-fg-3); }
`;

/* ============ Utils ============ */
const fmt = (n: number, d = 2) =>
  n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });
const signPct = (n: number, d = 1) => `${n >= 0 ? "+" : "−"}${fmt(Math.abs(n), d)}%`;
const pctOf = (curr: number | null, base: number | null) =>
  curr === null || base === null || base === 0 ? null : ((curr - base) / base) * 100;

/** Posição da organização no ranking (maior nota = 1º). */
function rankPosition(rows: RankRow[], ownValue: number | null) {
  if (rows.length === 0) return null;
  const sorted = [...rows].sort((a, b) => b.v - a.v);
  const idx = sorted.findIndex((r) => r.kind === "propria");
  if (idx >= 0) return { pos: idx + 1, of: sorted.length };
  if (ownValue === null) return null;
  const pos = sorted.filter((r) => r.v > ownValue).length + 1;
  return { pos, of: sorted.length + 1 };
}

/* ============ KPIs ============ */
function ScoreKpi({
  label,
  color,
  latest,
  meta,
  totalDelta,
  since,
}: {
  label: string;
  color: string;
  latest: { periodo: string; v: number } | null;
  meta: number;
  totalDelta: number | null;
  since: string | null;
}) {
  const p = latest ? (latest.v / meta) * 100 : 0;
  return (
    <div className="mt-kpi">
      <span className="mt-kpi-label">
        <span className="mt-sw" style={{ background: color }} /> {label}
      </span>
      <span className="mt-kpi-value">
        {latest ? fmt(latest.v) : "—"}
        <small>/ {fmt(meta)}</small>
      </span>
      <div className="mt-meter" aria-hidden="true">
        <i style={{ width: `${Math.min(100, p)}%`, background: color }} />
      </div>
      <span className="mt-kpi-foot">
        {latest ? `${fmt(p, 0)}% da meta` : "Sem avaliação"}
        {totalDelta !== null && since && (
          <>
            {" · "}
            <span className={totalDelta >= 0 ? "mt-up" : "mt-dn"}>
              {signPct(totalDelta)}
            </span> desde {since}
          </>
        )}
      </span>
    </div>
  );
}

function RankKpi({
  label,
  rank,
  vsEdu,
  mediaEdu,
}: {
  label: string;
  rank: { pos: number; of: number } | null;
  vsEdu: number | null;
  mediaEdu: number | null;
}) {
  return (
    <div className="mt-kpi">
      <span className="mt-kpi-label">{label}</span>
      <span className="mt-kpi-value">
        {rank ? `${rank.pos}º` : "—"}
        {rank && <small>de {rank.of} segmentos</small>}
      </span>
      <span className="mt-kpi-foot">
        {vsEdu === null || mediaEdu === null ? (
          "Sem média do segmento Educação"
        ) : (
          <>
            <span className={vsEdu >= 0 ? "mt-up" : "mt-dn"}>{signPct(vsEdu, 0)}</span> vs. média de
            Educação ({fmt(mediaEdu)})
          </>
        )}
      </span>
    </div>
  );
}

/* ============ Gráfico de evolução ============ */
function EvoTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  label?: string;
  payload?: Array<{ dataKey: string; value: number | null }>;
}) {
  if (!active || !payload?.length) return null;
  const get = (k: string) => payload.find((p) => p.dataKey === k)?.value ?? null;
  const n = get("NIST");
  const i = get("ISO");
  return (
    <div className="mt-tip">
      <b>{label}</b>
      <span>NIST {n === null ? "—" : fmt(n)}</span>
      <span>ISO {i === null ? "—" : fmt(i)}</span>
    </div>
  );
}

function EvolucaoChart({
  chartData,
  mediaEduNist,
  mediaEduIso,
}: {
  chartData: Array<{ p: string; NIST: number | null; ISO: number | null }>;
  mediaEduNist: number | null;
  mediaEduIso: number | null;
}) {
  return (
    <div className="mt-card mt-span-2">
      <div className="mt-card-hdr">
        <div>
          <h2 className="mt-card-title">Evolução</h2>
          <p className="mt-card-sub">Nota por avaliação · escala 0 a {fmt(ESCALA_MAX, 1)}</p>
        </div>
        <div className="mt-legend">
          <span>
            <span className="mt-sw" style={{ background: "var(--mt-nist)" }} /> NIST CSF
          </span>
          <span>
            <span className="mt-sw" style={{ background: "var(--mt-iso)" }} /> ISO 27001
          </span>
          <span>
            <span className="ln" style={{ borderColor: "var(--v2-crit)" }} /> Meta {fmt(META_NIST)}
          </span>
          {(mediaEduNist !== null || mediaEduIso !== null) && (
            <span>
              <span className="ln" style={{ borderColor: "var(--v2-fg-3)" }} /> Média Educação
            </span>
          )}
        </div>
      </div>
      <div className="mt-card-body" style={{ height: 320 }}>
        {chartData.length === 0 ? (
          <div className="mt-empty">Sem avaliações cadastradas.</div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={chartData} margin={{ top: 14, right: 16, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="mt-gNist" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--mt-nist)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="var(--mt-nist)" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="mt-gIso" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="var(--mt-iso)" stopOpacity={0.22} />
                  <stop offset="100%" stopColor="var(--mt-iso)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="var(--v2-line)" vertical={false} />
              <XAxis dataKey="p" tickLine={false} axisLine={false} />
              <YAxis
                domain={[0, ESCALA_MAX]}
                ticks={[0, 1, 2, 3]}
                tickFormatter={(v: number) => fmt(v, 1)}
                tickLine={false}
                axisLine={false}
                width={36}
              />
              <Tooltip content={<EvoTooltip />} cursor={{ stroke: "var(--v2-line-strong)" }} />
              <ReferenceLine
                y={META_NIST}
                stroke="var(--v2-crit)"
                strokeDasharray="5 5"
                label={{
                  value: `Meta ${fmt(META_NIST)}`,
                  fill: "var(--v2-crit)",
                  fontSize: 11,
                  position: "insideTopRight",
                }}
              />
              {mediaEduNist !== null && (
                <ReferenceLine
                  y={mediaEduNist}
                  stroke="var(--v2-fg-3)"
                  strokeDasharray="2 4"
                  label={{
                    value: `Educação · NIST ${fmt(mediaEduNist)}`,
                    fill: "var(--v2-fg-3)",
                    fontSize: 11,
                    position: "insideTopLeft",
                  }}
                />
              )}
              {mediaEduIso !== null && (
                <ReferenceLine
                  y={mediaEduIso}
                  stroke="var(--v2-fg-3)"
                  strokeDasharray="2 4"
                  label={{
                    value: `Educação · ISO ${fmt(mediaEduIso)}`,
                    fill: "var(--v2-fg-3)",
                    fontSize: 11,
                    position: "insideBottomLeft",
                  }}
                />
              )}
              {(
                [
                  ["NIST", "var(--mt-nist)", "url(#mt-gNist)"],
                  ["ISO", "var(--mt-iso)", "url(#mt-gIso)"],
                ] as const
              ).map(([key, color, fill]) => (
                <Area
                  key={key}
                  type="monotone"
                  dataKey={key}
                  stroke={color}
                  strokeWidth={2.4}
                  fill={fill}
                  connectNulls
                  dot={{ r: 3.5, fill: color, stroke: "var(--v2-surface)", strokeWidth: 2 }}
                  activeDot={{ r: 5, fill: color, stroke: "var(--v2-surface)", strokeWidth: 2 }}
                />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}

/* ============ Tabela por avaliação ============ */
function PorAvaliacao({ rows }: { rows: PropriaRow[] }) {
  // Variação de cada nota sobre a avaliação anterior que tinha nota do mesmo framework
  const enriched = React.useMemo(() => {
    const asc = [...rows].sort((a, b) => a.periodo_ordem - b.periodo_ordem);
    let prevN: number | null = null;
    let prevI: number | null = null;
    const out = asc.map((r) => {
      const dN = r.nota_nist !== null ? pctOf(r.nota_nist, prevN) : null;
      const dI = r.nota_iso !== null ? pctOf(r.nota_iso, prevI) : null;
      const item = { ...r, dN, dI, baseN: prevN === null, baseI: prevI === null };
      if (r.nota_nist !== null) prevN = r.nota_nist;
      if (r.nota_iso !== null) prevI = r.nota_iso;
      return item;
    });
    return out.reverse();
  }, [rows]);

  const cell = (v: number | null, d: number | null, base: boolean) =>
    v === null ? (
      <span className="dim">—</span>
    ) : (
      <>
        {fmt(v)}
        {base ? (
          <span className="mt-delta dim">base</span>
        ) : (
          d !== null && (
            <span className={`mt-delta ${d >= 0 ? "mt-up" : "mt-dn"}`}>{signPct(d, 0)}</span>
          )
        )}
      </>
    );

  return (
    <div className="mt-card mt-fit">
      <div className="mt-card-hdr" style={{ paddingBottom: 10 }}>
        <div>
          <h2 className="mt-card-title">Por avaliação</h2>
          <p className="mt-card-sub">Nota e variação sobre a anterior</p>
        </div>
      </div>
      {enriched.length === 0 ? (
        <div className="mt-empty">Sem avaliações.</div>
      ) : (
        <div className="mt-scroll">
          <table className="mt-table">
            <thead>
              <tr>
                <th>Avaliação</th>
                <th className="r">NIST</th>
                <th className="r">ISO</th>
              </tr>
            </thead>
            <tbody>
              {enriched.map((r, i) => (
                <tr key={r.periodo} className={i === 0 ? "cur" : ""}>
                  <td
                    className={`mono ${i === 0 ? "" : "dim"}`}
                    style={i === 0 ? { fontWeight: 600 } : undefined}
                  >
                    {r.periodo}
                  </td>
                  <td className="r mono">{cell(r.nota_nist, r.dN, r.baseN)}</td>
                  <td className="r mono">{cell(r.nota_iso, r.dI, r.baseI)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

/* ============ Ranking por segmento ============ */
function RankingCard({
  fw,
  rows,
  own,
  mediaEdu,
}: {
  fw: Fw;
  rows: RankRow[];
  own: { periodo: string; v: number } | null;
  mediaEdu: number | null;
}) {
  const color = fw === "nist" ? "var(--mt-nist)" : "var(--mt-iso)";
  const meta = fw === "nist" ? META_NIST : META_ISO;
  const sorted = [...rows].sort((a, b) => b.v - a.v);
  const rank = rankPosition(rows, own?.v ?? null);
  const vsEdu = pctOf(own?.v ?? null, mediaEdu);
  const ownName = rows.find((r) => r.kind === "propria")?.name ?? "Nossa nota";

  return (
    <div className="mt-card">
      <div className="mt-card-hdr">
        <div>
          <h2 className="mt-card-title">{fw === "nist" ? "NIST CSF" : "ISO/IEC 27001"}</h2>
          <p className="mt-card-sub">
            {own ? `Nossa nota ${fmt(own.v)} na avaliação ${own.periodo}` : "Sem avaliação"}
          </p>
        </div>
      </div>
      <div className="mt-card-body">
        {sorted.length === 0 ? (
          <div className="mt-empty">Sem dados de segmentos.</div>
        ) : (
          <div className="mt-rank">
            {sorted.map((r) => {
              const me = r.kind === "propria";
              const edu = r.kind === "edu";
              return (
                <div
                  key={`${r.kind}-${r.name}`}
                  className={`mt-rank-row${me ? " me" : ""}${edu ? " edu" : ""}`}
                  title={`${r.name}: ${fmt(r.v)}`}
                >
                  <span className="nm">{r.name}</span>
                  <span className="bar">
                    <i
                      style={{
                        width: `${Math.min(100, (r.v / ESCALA_MAX) * 100)}%`,
                        ...(me
                          ? { background: color }
                          : edu
                            ? { background: "color-mix(in oklch, var(--v2-fg-3) 75%, transparent)" }
                            : {}),
                      }}
                    />
                    <span
                      className="meta"
                      style={{ left: `${(meta / ESCALA_MAX) * 100}%` }}
                      title={`Meta ${fmt(meta)}`}
                    />
                  </span>
                  <span className="v">{fmt(r.v)}</span>
                </div>
              );
            })}
          </div>
        )}
        {own && (vsEdu !== null || rank) && (
          <div className="mt-rank-note">
            {vsEdu !== null && vsEdu < 0 ? (
              <TrendingDown size={14} className="mt-dn" />
            ) : (
              <TrendingUp size={14} className="mt-up" />
            )}
            <span>
              {vsEdu !== null && (
                <>
                  {ownName} está{" "}
                  <b>
                    {fmt(Math.abs(vsEdu), 0)}% {vsEdu >= 0 ? "acima" : "abaixo"}
                  </b>{" "}
                  da média do segmento Educação
                </>
              )}
              {vsEdu !== null && rank ? " e " : ""}
              {rank && (
                <>
                  {vsEdu === null ? `${ownName} está ` : ""}em {rank.pos}º entre {rank.of} segmentos
                </>
              )}
              . A linha tracejada vermelha marca a meta {fmt(meta)}.
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/* ============ Root ============ */
export function MaturidadeExecutive() {
  const qc = useQueryClient();
  const fetchMat = useServerFn(listMaturidade);
  const { data, isLoading, error } = useQuery({
    queryKey: ["maturidade"],
    queryFn: () => fetchMat(),
  });

  // Aba de cadastro das notas (ex-módulo Segmentos): permissões continuam no slug "segmentos".
  const { can, isAdmin, isModuleAdmin } = usePermissions();
  const canNotas =
    isAdmin || isModuleAdmin("segmentos") || can("segmentos", "view") || can("segmentos", "manage");
  const [tab, setTab] = React.useState<"geral" | "notas">(() =>
    typeof window !== "undefined" && window.location.hash === "#notas" ? "notas" : "geral",
  );

  React.useEffect(() => {
    const ch = supabase
      .channel("maturidade-realtime")
      .on("postgres_changes", { event: "*", schema: "public", table: "maturidade" }, () =>
        qc.invalidateQueries({ queryKey: ["maturidade"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "segmentos_notas" }, () =>
        qc.invalidateQueries({ queryKey: ["maturidade"] }),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "segmentos" }, () =>
        qc.invalidateQueries({ queryKey: ["maturidade"] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [qc]);

  if (isLoading) return <ModuleLoading />;
  if (error || !data) {
    return (
      <div className="mt-root">
        <style dangerouslySetInnerHTML={{ __html: CSS }} />
        <div className="mt-state">
          <AlertTriangle size={22} color="var(--v2-crit)" />
          <span style={{ fontSize: 14, fontWeight: 600 }}>
            Não foi possível carregar a maturidade
          </span>
          <span className="dim" style={{ fontSize: 13 }}>
            {(error as Error | null)?.message ?? "Tente novamente em instantes."}
          </span>
        </div>
      </div>
    );
  }

  const b = data.propria;
  const nistTl = b.nist_timeline;
  const isoTl = b.iso_timeline;
  const latestNist = b.latest_nist;
  const latestIso = b.latest_iso;
  const mediaEduNist = data.media_edu_nist;
  const mediaEduIso = data.media_edu_iso;

  // Chart combinado: união por periodo_ordem
  const chartData = [...b.rows]
    .sort((a, c) => a.periodo_ordem - c.periodo_ordem)
    .map((r: PropriaRow) => ({ p: r.periodo, NIST: r.nota_nist, ISO: r.nota_iso }));

  const lastPeriodo = b.latest_score?.periodo ?? latestNist?.periodo ?? latestIso?.periodo ?? "—";

  return (
    <div className="mt-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Cabeçalho ────────────────────────────────────────────────────── */}
      <div className="mt-ph">
        <div>
          <h1 className="mt-ph-title">Maturidade em segurança</h1>
          <p className="mt-ph-sub">
            Evolução no NIST CSF e na ISO/IEC 27001 e comparação com outros segmentos
          </p>
        </div>
        <div className="mt-tags">
          <span className="mt-tag">
            Última avaliação: <b>{lastPeriodo}</b>
          </span>
          <span className="mt-tag conf">
            <Lock size={12} /> Confidencial
          </span>
        </div>
      </div>

      {canNotas && (
        <div className="mt-subnav" role="tablist" aria-label="Seções da Maturidade">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "geral"}
            onClick={() => setTab("geral")}
          >
            Visão geral
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "notas"}
            onClick={() => setTab("notas")}
          >
            Notas e segmentos
          </button>
        </div>
      )}

      {canNotas && tab === "notas" ? (
        <MaturidadeNotas />
      ) : (
        <>
          {/* ── Onde estamos ─────────────────────────────────────────────────── */}
          <div className="mt-kpis">
            <ScoreKpi
              label="NIST CSF"
              color="var(--mt-nist)"
              latest={latestNist}
              meta={META_NIST}
              totalDelta={nistTl.length > 1 ? nistTl[nistTl.length - 1].deltaTotal : null}
              since={nistTl.length > 1 ? nistTl[0].label : null}
            />
            <ScoreKpi
              label="ISO/IEC 27001"
              color="var(--mt-iso)"
              latest={latestIso}
              meta={META_ISO}
              totalDelta={isoTl.length > 1 ? isoTl[isoTl.length - 1].deltaTotal : null}
              since={isoTl.length > 1 ? isoTl[0].label : null}
            />
            <RankKpi
              label="Posição no ranking · NIST"
              rank={rankPosition(data.ranking_nist, latestNist?.v ?? null)}
              vsEdu={pctOf(latestNist?.v ?? null, mediaEduNist)}
              mediaEdu={mediaEduNist}
            />
            <RankKpi
              label="Posição no ranking · ISO"
              rank={rankPosition(data.ranking_iso, latestIso?.v ?? null)}
              vsEdu={pctOf(latestIso?.v ?? null, mediaEduIso)}
              mediaEdu={mediaEduIso}
            />
          </div>

          {/* ── Como evoluímos ───────────────────────────────────────────────── */}
          <div className="mt-grid">
            <EvolucaoChart
              chartData={chartData}
              mediaEduNist={mediaEduNist}
              mediaEduIso={mediaEduIso}
            />
            <PorAvaliacao rows={b.rows} />
          </div>

          {/* ── Como nos comparamos ──────────────────────────────────────────── */}
          <div>
            <h2 className="mt-sec-h">Comparação com outros segmentos</h2>
            <p className="mt-sec-p">
              Nota de maturidade média de cada segmento de mercado, frente à nossa nota mais
              recente.
            </p>
          </div>
          <div className="mt-grid-2">
            <RankingCard
              fw="nist"
              rows={data.ranking_nist}
              own={latestNist}
              mediaEdu={mediaEduNist}
            />
            <RankingCard fw="iso" rows={data.ranking_iso} own={latestIso} mediaEdu={mediaEduIso} />
          </div>

          <div className="mt-foot">
            <span>
              Avaliações internas do time de Segurança da Informação e benchmarks de mercado por
              segmento.
            </span>
            <span>
              Meta interna: {fmt(META_NIST)} no NIST e {fmt(META_ISO)} na ISO
            </span>
          </div>
        </>
      )}
    </div>
  );
}

export default MaturidadeExecutive;
