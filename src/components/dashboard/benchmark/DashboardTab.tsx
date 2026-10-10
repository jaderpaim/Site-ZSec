import { ModuleLoading } from "@/components/layout/ModuleLoading";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell,
  LabelList,
  ReferenceLine,
} from "recharts";
import { TrendingUp, AlertTriangle, Target, Wallet, Gauge, ArrowUpRight } from "lucide-react";
import { getBenchmarkOverview, type MaturidadeRefRow, type InvestimentoRefRow } from "@/lib/benchmark.functions";
import { useOrganizacao } from "@/lib/use-organizacao";

// ── Tokens — mesma paleta do Painel Executivo (consistência entre painéis) ────
const T = {
  surface: "var(--tl-0f1420, #0F1420)",
  surfaceAlt: "var(--tl-131825, #131825)",
  // Fundo do tooltip: mais claro que os cartões, senão o texto branco não separa do fundo.
  tooltipBg: "var(--tl-1c2438, #1C2438)",
  border: "var(--tl-1e2640, #1E2640)",
  borderHi: "var(--tl-2a3560, #2A3560)",
  accent: "#3B82F6",
  // Azul escuro e saturado para a barra de posição na escala — contrasta com o
  // trilho sem clarear a tabela.
  accentDeep: "#1D4ED8",
  success: "#10B981",
  warning: "#F59E0B",
  danger: "#EF4444",
  purple: "#A78BFA",
  neutral: "var(--tl-6b7280, #6B7280)",
  textPrimary: "var(--tl-f1f5f9, #F1F5F9)",
  textSecondary: "var(--tl-94a3b8, #94A3B8)",
  textMuted: "var(--tl-64748b, #64748B)",
  chartGrid: "rgba(var(--tl-line-rgb, 30,38,64),0.7)",
};

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');

  .bmk-dash { font-family:'DM Sans',sans-serif; color:${T.textPrimary}; display:flex; flex-direction:column; gap:16px; }
  .bmk-dash * { box-sizing:border-box; }

  @keyframes bmk-fadeup { from{opacity:0;transform:translateY(8px)} to{opacity:1;transform:translateY(0)} }
  .bmk-fadeup { opacity:0; animation:bmk-fadeup .45s ease forwards; }
  @media (prefers-reduced-motion: reduce) { .bmk-fadeup { animation:none; opacity:1; } }

  .bmk-mono { font-family:'IBM Plex Mono',monospace; }
  .bmk-num-hero { font-family:'Space Grotesk',sans-serif; font-size:34px; font-weight:700; letter-spacing:-.03em; line-height:1; }
  .bmk-num-md { font-family:'Space Grotesk',sans-serif; font-size:18px; font-weight:700; line-height:1; }

  /* Faixa de indicadores */
  .bmk-ribbon { background:${T.surface}; border:1px solid ${T.border}; border-radius:12px; display:grid; grid-template-columns:repeat(4,1fr); overflow:hidden; }
  @media (max-width:900px){ .bmk-ribbon { grid-template-columns:repeat(2,1fr); } }
  @media (max-width:520px){ .bmk-ribbon { grid-template-columns:1fr; } }
  .bmk-rib-seg { padding:16px 18px; border-right:1px solid ${T.border}; display:flex; gap:11px; align-items:flex-start; min-width:0; }
  .bmk-rib-seg:last-child { border-right:none; }
  @media (max-width:900px){ .bmk-rib-seg:nth-child(2n){ border-right:none; } .bmk-rib-seg:nth-child(-n+2){ border-bottom:1px solid ${T.border}; } }
  .bmk-dot { width:8px; height:8px; border-radius:50%; flex-shrink:0; margin-top:5px; }
  .bmk-rib-label { font-family:'IBM Plex Mono',monospace; font-size:9px; font-weight:700; letter-spacing:.13em; text-transform:uppercase; color:${T.textPrimary}; }
  .bmk-rib-value { font-family:'Space Grotesk',sans-serif; font-size:23px; font-weight:700; letter-spacing:-.02em; line-height:1.15; margin-top:5px; }
  .bmk-rib-sub { font-family:'IBM Plex Mono',monospace; font-size:10px; color:${T.textPrimary}; margin-top:4px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

  /* Cabeçalho de seção */
  .bmk-eyebrow { display:flex; align-items:center; gap:10px; font-family:'IBM Plex Mono',monospace; font-size:9px; font-weight:700;
    letter-spacing:.18em; text-transform:uppercase; color:${T.textMuted}; margin-bottom:11px; }
  .bmk-eyebrow::after { content:""; flex:1; height:1px; background:${T.border}; }

  /* Cartões */
  .bmk-card { position:relative; background:${T.surface}; border:1px solid ${T.border}; border-radius:12px; padding:16px 18px;
    overflow:hidden; display:flex; flex-direction:column; transition:border-color .2s; }
  .bmk-card:hover { border-color:${T.borderHi}; }
  .bmk-card-accent { position:absolute; top:0; left:0; right:0; height:2px; }
  .bmk-card-hd { display:flex; align-items:center; gap:8px; }
  .bmk-card-title { font-size:13px; font-weight:700; color:${T.textPrimary}; }
  .bmk-card-sub { font-family:'IBM Plex Mono',monospace; font-size:11px; color:${T.textSecondary}; letter-spacing:.04em; margin-top:3px; }
  .bmk-pill { width:26px; height:26px; border-radius:7px; display:flex; align-items:center; justify-content:center; flex-shrink:0; }

  /* Aviso / veredito */
  .bmk-callout { display:flex; gap:12px; align-items:flex-start; border-radius:11px; padding:14px 16px; font-size:13px; line-height:1.5; }

  /* Régua — elemento recorrente do módulo */
  .bmk-ruler { position:relative; height:12px; background:${T.border}; border-radius:6px; }
  .bmk-ruler-band { position:absolute; top:0; bottom:0; background:rgba(16,185,129,.22); border-left:1px solid ${T.success}; border-right:1px solid ${T.success}; }
  .bmk-ruler-fill { position:absolute; left:0; top:0; bottom:0; border-radius:6px; }
  .bmk-ruler-mark { position:absolute; top:-5px; bottom:-5px; width:2px; border-radius:1px; }
  .bmk-ruler-scale { display:flex; justify-content:space-between; margin-top:6px; font-family:'IBM Plex Mono',monospace; font-size:9px; color:${T.textMuted}; }

  .bmk-tile { background:${T.surfaceAlt}; border:1px solid ${T.border}; border-radius:10px; padding:10px 12px; }
  .bmk-tile-hd { display:flex; align-items:center; gap:5px; font-family:'IBM Plex Mono',monospace; font-size:9px; font-weight:700;
    letter-spacing:.1em; text-transform:uppercase; color:${T.textMuted}; margin-bottom:6px; }

  .bmk-badge { display:inline-flex; align-items:center; gap:4px; padding:3px 8px; border-radius:5px; font-family:'IBM Plex Mono',monospace;
    font-size:10px; font-weight:700; border:1px solid transparent; white-space:nowrap; }
  .bmk-badge.ok { background:rgba(16,185,129,.10); color:${T.success}; border-color:rgba(16,185,129,.3); }
  .bmk-badge.warn { background:rgba(245,158,11,.10); color:${T.warning}; border-color:rgba(245,158,11,.3); }
  .bmk-badge.crit { background:rgba(239,68,68,.10); color:${T.danger}; border-color:rgba(239,68,68,.3); }

  /* Tabela de referências */
  .bmk-table { width:100%; border-collapse:collapse; font-size:12px; }
  .bmk-table th { text-align:left; padding:8px 10px; border-bottom:1px solid ${T.border}; font-family:'IBM Plex Mono',monospace;
    font-size:9px; font-weight:700; letter-spacing:.11em; text-transform:uppercase; color:${T.textMuted}; white-space:nowrap; }
  .bmk-table td { padding:10px; border-bottom:1px solid ${T.border}; color:${T.textSecondary}; vertical-align:middle; }
  .bmk-table tr:last-child td { border-bottom:none; }
  .bmk-table .nm { color:${T.textPrimary}; font-weight:600; }

  .bmk-grid-charts { display:grid; grid-template-columns:repeat(auto-fit,minmax(430px,1fr)); gap:14px; }
  @media (max-width:520px){ .bmk-grid-charts { grid-template-columns:1fr; } }
  .bmk-grid-inv { display:grid; grid-template-columns:minmax(280px,4fr) 7fr; gap:14px; }
  @media (max-width:1000px){ .bmk-grid-inv { grid-template-columns:1fr; } }

  .bmk-foot { font-family:'IBM Plex Mono',monospace; font-size:10px; color:${T.textPrimary}; line-height:1.75;
    border-top:1px solid ${T.border}; padding-top:12px; }
`;

// ── Formatadores ──────────────────────────────────────────────────────────────
const nf2 = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
const moneyC = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});

// Percentuais pequenos precisam da terceira casa: 0,075% não é 0,08%.
const pctFmt = (v: number | null | undefined) => {
  if (v == null || !isFinite(v)) return "—";
  const d = Math.abs(v) < 0.1 ? 3 : 2;
  return `${new Intl.NumberFormat("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d }).format(v)}%`;
};

// Encurta o rótulo da faixa para caber no eixo. O nome completo vai no tooltip.
function shortFaixa(s: string) {
  let v = (s ?? "").trim();
  v = v
    .replace(/^De\s+/i, "")
    .replace(/^Entre\s+/i, "")
    .replace(/^Acima de\s+/i, "> ")
    .replace(/^Até\s+/i, "≤ ");
  v = v.replace(/\s+a\s+R\$\s*/i, "–").replace(/\s+e\s+/i, "–");
  return v;
}

function Dot({ state }: { state: "ok" | "warn" | "crit" | "off" }) {
  const c = { ok: T.success, warn: T.warning, crit: T.danger, off: T.neutral }[state];
  return <span className="bmk-dot" style={{ background: c, opacity: state === "off" ? 0.5 : 1 }} />;
}

// ── Régua de maturidade — barras horizontais + linha da organização ───────────
function MaturidadeRuler({
  rows,
  nota,
  titulo,
  fonte,
}: {
  rows: MaturidadeRefRow[];
  nota: number | null;
  titulo: string;
  fonte: string;
}) {
  const org = useOrganizacao();
  const data = rows.map((r) => ({
    full: r.faixa,
    name: r.is_propria ? org.rotulo.toUpperCase() : shortFaixa(r.faixa),
    valor: r.is_propria && nota != null ? nota : Number(r.valor),
    destaque: r.is_propria,
  }));
  const mercado = data.filter((d) => !d.destaque);
  const media = mercado.length ? mercado.reduce((a, d) => a + d.valor, 0) / mercado.length : null;
  const ref = nota ?? data.find((d) => d.destaque)?.valor ?? null;
  const maxVal = Math.max(...data.map((d) => d.valor), ref ?? 0, 1);
  // Escala ancorada em 3,5 (mesma régua do módulo Maturidade); só cresce se algum valor passar dela.
  const domainMax = Math.max(3.5, Math.ceil((maxVal + 0.3) * 10) / 10);

  const Tick = ({ x, y, payload }: any) => {
    const d = data.find((r) => r.name === payload.value);
    return (
      <text
        x={x}
        y={y}
        dy={4}
        textAnchor="end"
        fontFamily="'IBM Plex Mono',monospace"
        fontSize={11}
        fontWeight={d?.destaque ? 700 : 500}
        fill={d?.destaque ? T.success : T.textPrimary}
      >
        {payload.value}
      </text>
    );
  };

  return (
    <div className="bmk-card">
      <div
        className="bmk-card-accent"
        style={{
          background: `linear-gradient(90deg, transparent, ${T.purple}, transparent)`,
          opacity: 0.9,
        }}
      />
      <div className="bmk-card-hd">
        <span className="bmk-pill" style={{ background: "rgba(167,139,250,.18)" }}>
          <Gauge size={14} color={T.purple} />
        </span>
        <div style={{ minWidth: 0 }}>
          <div className="bmk-card-title">{titulo}</div>
          <div className="bmk-card-sub">{fonte}</div>
        </div>
        {ref != null && media != null && (
          <span className={`bmk-badge ${ref >= media ? "ok" : "warn"}`} style={{ marginLeft: "auto" }}>
            {ref >= media ? "▲" : "▼"} {nf2.format(Math.abs(ref - media))} vs média
          </span>
        )}
      </div>

      <div style={{ height: data.length * 34 + 52, marginTop: 12 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 6, right: 54, left: 4, bottom: 6 }}>
            <CartesianGrid stroke={T.chartGrid} horizontal={false} />
            <XAxis
              type="number"
              domain={[0, domainMax]}
              tick={{
                fill: T.textSecondary,
                fontSize: 11,
                fontFamily: "'IBM Plex Mono',monospace",
              }}
              tickLine={false}
              axisLine={{ stroke: T.border }}
            />
            <YAxis
              type="category"
              dataKey="name"
              width={172}
              interval={0}
              tickLine={false}
              axisLine={false}
              tick={<Tick />}
            />
            <Tooltip
              cursor={{ fill: "rgba(var(--tl-ink, 255,255,255),0.05)" }}
              contentStyle={{
                background: T.tooltipBg,
                border: `1px solid ${T.borderHi}`,
                borderRadius: 8,
                fontSize: 12,
                color: T.textPrimary,
                boxShadow: "0 16px 36px rgba(0,0,0,.5)",
              }}
              labelStyle={{
                color: T.textPrimary,
                fontFamily: "'IBM Plex Mono',monospace",
                fontSize: 11,
                fontWeight: 600,
              }}
              itemStyle={{ color: T.textPrimary, fontWeight: 700 }}
              formatter={(v: any, _n: any, item: any) => [nf2.format(Number(v)), item?.payload?.full ?? "Nota"]}
            />
            {/* Sem rótulo na linha: o valor da média fica na legenda, para não sobrepor as barras. */}
            {media != null && <ReferenceLine x={media} stroke={T.textSecondary} strokeDasharray="3 4" />}
            {ref != null && <ReferenceLine x={ref} stroke={T.success} strokeDasharray="4 4" strokeOpacity={0.85} />}
            <Bar dataKey="valor" radius={[0, 4, 4, 0]} barSize={16}>
              <LabelList
                dataKey="valor"
                position="right"
                fill={T.textPrimary}
                fontSize={12}
                fontWeight={600}
                fontFamily="'IBM Plex Mono',monospace"
                formatter={(v: number) => nf2.format(Number(v))}
              />
              {data.map((d, i) => (
                <Cell
                  key={i}
                  fill={d.destaque ? T.success : ref != null && d.valor > ref ? T.warning : T.purple}
                  fillOpacity={d.destaque ? 1 : 0.85}
                />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div
        className="bmk-mono"
        style={{
          fontSize: 11,
          color: T.textSecondary,
          marginTop: "auto",
          paddingTop: 10,
          display: "flex",
          gap: 14,
          flexWrap: "wrap",
        }}
      >
        <span style={{ color: T.success }}>■ {org.rotulo}</span>
        <span style={{ color: T.purple }}>■ faixas de mercado</span>
        <span style={{ color: T.warning }}>■ acima de {org.rotulo}</span>
        {media != null && <span style={{ color: T.textPrimary }}>┄ média do mercado {nf2.format(media)}</span>}
      </div>
    </div>
  );
}

// ── Régua de investimento — banda de mercado + nossa posição ──────────────────
function InvestimentoRuler({ pct, min, max }: { pct: number | null; min: number | null; max: number | null }) {
  const org = useOrganizacao();
  const topo = Math.max(max ?? 1.2, (pct ?? 0) * 1.15, 0.2);
  const p = (v: number) => `${Math.min(100, Math.max(0, (v / topo) * 100))}%`;
  const abaixo = pct != null && min != null && pct < min;
  return (
    <div>
      <div className="bmk-ruler">
        {min != null && max != null && (
          <div
            className="bmk-ruler-band"
            style={{ left: p(min), width: `calc(${p(max)} - ${p(min)})` }}
            title={`Faixa de mercado ${pctFmt(min)}–${pctFmt(max)}`}
          />
        )}
        {pct != null && (
          <div
            className="bmk-ruler-fill"
            style={{
              width: p(pct),
              background: `linear-gradient(90deg, ${abaixo ? T.danger : T.success}55, ${abaixo ? T.danger : T.success})`,
            }}
          />
        )}
        {pct != null && (
          <div
            className="bmk-ruler-mark"
            style={{ left: p(pct), background: T.textPrimary }}
            title={`${org.rotulo} ${pctFmt(pct)}`}
          />
        )}
      </div>
      <div className="bmk-ruler-scale">
        <span>0%</span>
        {min != null && <span style={{ color: T.success }}>piso {pctFmt(min)}</span>}
        <span>{pctFmt(topo)}</span>
      </div>
    </div>
  );
}

export function BenchmarkDashboardTab() {
  const org = useOrganizacao();
  const fetchOverview = useServerFn(getBenchmarkOverview);
  const { data, isLoading, error } = useQuery({
    queryKey: ["benchmark", "overview"],
    queryFn: () => fetchOverview(),
  });

  if (isLoading) return <ModuleLoading />;
  if (error) {
    return (
      <div style={{ color: T.danger, fontSize: 13 }}>
        Não foi possível carregar o benchmark: {(error as Error).message}
      </div>
    );
  }

  const maturidade = data?.maturidade ?? [];
  const porFaturamento = maturidade.filter((m) => m.tipo === "faturamento");
  const porFuncionarios = maturidade.filter((m) => m.tipo === "funcionarios");
  const investimento: InvestimentoRefRow[] = data?.investimento ?? [];
  const empresa = (data?.empresa ?? [])[0];
  const nist = data?.nist ?? null;

  // Nota de referência: módulo Maturidade; se ausente, a faixa marcada como da organização.
  const linhaPropria = maturidade.find((m) => m.is_propria);
  const nota = nist?.nota ?? (linhaPropria ? Number(linhaPropria.valor) : null);

  // Posição contra as faixas de mercado — contada, não afirmada.
  const faixasMercado = maturidade.filter((m) => !m.is_propria);
  const totalFaixas = faixasMercado.length;
  const superadas = nota != null ? faixasMercado.filter((m) => Number(m.valor) < nota).length : 0;
  const acimaDeNos = nota != null ? faixasMercado.filter((m) => Number(m.valor) > nota) : [];
  const bemPosicionada = totalFaixas > 0 && superadas / totalFaixas >= 0.6;

  const pct =
    empresa?.faturamento_anual != null && empresa?.investimento_ciber != null && Number(empresa.faturamento_anual) > 0
      ? (Number(empresa.investimento_ciber) / Number(empresa.faturamento_anual)) * 100
      : null;
  const refMin = investimento[0]?.pct_min != null ? Number(investimento[0].pct_min) : 0.5;
  const refMax = investimento[0]?.pct_max != null ? Number(investimento[0].pct_max) : 1.2;
  const abaixo = pct != null && pct < refMin;
  const gap =
    pct != null && abaixo && empresa?.faturamento_anual != null
      ? (refMin / 100) * Number(empresa.faturamento_anual) - Number(empresa.investimento_ciber ?? 0)
      : null;
  const vezes = pct != null && pct > 0 ? refMin / pct : null;

  const ribbon: Array<{
    k: string;
    label: string;
    value: string;
    sub: string;
    state: "ok" | "warn" | "crit" | "off";
    color: string;
  }> = [
    {
      k: "mat",
      label: "Maturidade",
      value: nota != null ? nf2.format(nota) : "—",
      sub: nist?.periodo ? `NIST CSF · ${nist.periodo}` : "NIST CSF · meta 3,00",
      state: nota == null ? "off" : nota >= 3 ? "ok" : nota >= 2 ? "warn" : "crit",
      color: nota != null && nota >= 3 ? T.success : T.warning,
    },
    {
      k: "pos",
      label: "Posição",
      value: totalFaixas ? `${superadas}/${totalFaixas}` : "—",
      sub: "faixas de mercado superadas",
      state: !totalFaixas ? "off" : bemPosicionada ? "ok" : "warn",
      color: bemPosicionada ? T.success : T.warning,
    },
    {
      k: "inv",
      label: "Investimento",
      value: pctFmt(pct),
      sub: `da receita · piso ${pctFmt(refMin)}`,
      state: pct == null ? "off" : abaixo ? "crit" : "ok",
      color: abaixo ? T.danger : T.success,
    },
    {
      k: "gap",
      label: "Para o piso",
      value: gap != null && gap > 0 ? moneyC.format(gap) : "—",
      sub: vezes != null && vezes > 1 ? `${nf2.format(vezes)}× o valor atual` : "no patamar de mercado",
      state: gap != null && gap > 0 ? "warn" : "ok",
      color: gap != null && gap > 0 ? T.warning : T.success,
    },
  ];

  return (
    <div className="bmk-dash">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* Indicadores */}
      <div className="bmk-ribbon bmk-fadeup">
        {ribbon.map((s) => (
          <div key={s.k} className="bmk-rib-seg">
            <Dot state={s.state} />
            <div style={{ minWidth: 0 }}>
              <div className="bmk-rib-label">{s.label}</div>
              <div className="bmk-rib-value" style={{ color: s.color }}>
                {s.value}
              </div>
              <div className="bmk-rib-sub">{s.sub}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Veredito de maturidade — contado a partir dos dados */}
      {nota != null && totalFaixas > 0 && (
        <div
          className="bmk-callout bmk-fadeup"
          style={{
            animationDelay: "60ms",
            background: bemPosicionada ? "rgba(16,185,129,.08)" : "rgba(245,158,11,.08)",
            border: `1px solid ${bemPosicionada ? "rgba(16,185,129,.25)" : "rgba(245,158,11,.25)"}`,
          }}
        >
          <TrendingUp
            size={17}
            color={bemPosicionada ? T.success : T.warning}
            style={{ flexShrink: 0, marginTop: 2 }}
          />
          <div>
            Com nota NIST <strong>{nf2.format(nota)}</strong>, {org.rotulo} supera{" "}
            <strong>
              {superadas} das {totalFaixas}
            </strong>{" "}
            faixas de referência de mercado, somando faturamento e número de funcionários.
            {acimaDeNos.length > 0 && (
              <span style={{ color: T.textSecondary }}>
                {" "}
                Seguem acima:{" "}
                {acimaDeNos.map((m) => `${shortFaixa(m.faixa)} (${nf2.format(Number(m.valor))})`).join(" · ")}.
              </span>
            )}
          </div>
        </div>
      )}

      {/* Réguas de maturidade */}
      <div className="bmk-fadeup" style={{ animationDelay: "120ms" }}>
        <div className="bmk-eyebrow">Maturidade vs Mercado</div>
        <div className="bmk-grid-charts">
          <MaturidadeRuler
            rows={porFaturamento}
            nota={nota}
            titulo="Por faturamento"
            fonte={`Referências ${porFaturamento[0]?.fonte ?? "—"} · ${porFaturamento[0]?.ano ?? "—"}`}
          />
          <MaturidadeRuler
            rows={porFuncionarios}
            nota={nota}
            titulo="Por número de funcionários"
            fonte={`Referências ${porFuncionarios[0]?.fonte ?? "—"} · ${porFuncionarios[0]?.ano ?? "—"}`}
          />
        </div>
      </div>

      {/* Investimento */}
      <div className="bmk-fadeup" style={{ animationDelay: "180ms" }}>
        <div className="bmk-eyebrow">Investimento em Cibersegurança</div>
        <div className="bmk-grid-inv">
          <div className="bmk-card">
            <div className="bmk-card-accent" style={{ background: abaixo ? T.danger : T.success }} />
            <div className="bmk-card-hd">
              <span
                className="bmk-pill"
                style={{ background: abaixo ? "rgba(239,68,68,.18)" : "rgba(16,185,129,.18)" }}
              >
                <Wallet size={14} color={abaixo ? T.danger : T.success} />
              </span>
              <div>
                <div className="bmk-card-title">Percentual da receita</div>
                <div className="bmk-card-sub">{empresa?.ano ? `ANO ${empresa.ano}` : "sem ano cadastrado"}</div>
              </div>
            </div>

            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginTop: 12 }}>
              <span className="bmk-num-hero" style={{ color: abaixo ? T.danger : T.success }}>
                {pctFmt(pct)}
              </span>
              {abaixo && <span className="bmk-badge crit">abaixo do piso</span>}
            </div>

            <div style={{ marginTop: 14 }}>
              <InvestimentoRuler pct={pct} min={refMin} max={refMax} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 14 }}>
              <div className="bmk-tile">
                <div className="bmk-tile-hd">Faturamento</div>
                <div className="bmk-num-md" style={{ color: T.textPrimary }}>
                  {empresa?.faturamento_anual != null ? moneyC.format(Number(empresa.faturamento_anual)) : "—"}
                </div>
                <div className="bmk-mono" style={{ fontSize: 9, color: T.textMuted, marginTop: 3 }}>
                  {empresa?.faturamento_anual != null
                    ? money.format(Number(empresa.faturamento_anual))
                    : "não informado"}
                </div>
              </div>
              <div className="bmk-tile">
                <div className="bmk-tile-hd">Investimento</div>
                <div className="bmk-num-md" style={{ color: T.textPrimary }}>
                  {empresa?.investimento_ciber != null ? moneyC.format(Number(empresa.investimento_ciber)) : "—"}
                </div>
                <div className="bmk-mono" style={{ fontSize: 9, color: T.textMuted, marginTop: 3 }}>
                  {empresa?.investimento_ciber != null
                    ? money.format(Number(empresa.investimento_ciber))
                    : "não informado"}
                </div>
              </div>
            </div>

            {gap != null && gap > 0 && (
              <div
                className="bmk-tile"
                style={{
                  marginTop: 8,
                  borderColor: "rgba(245,158,11,.35)",
                  background: "rgba(245,158,11,.07)",
                }}
              >
                <div className="bmk-tile-hd" style={{ color: T.warning }}>
                  <Target size={10} color={T.warning} /> Para alcançar o piso de {pctFmt(refMin)}
                </div>
                <div style={{ display: "flex", alignItems: "baseline", gap: 7 }}>
                  <span className="bmk-num-md" style={{ color: T.warning }}>
                    +{money.format(gap)}
                  </span>
                  {vezes != null && (
                    <span className="bmk-mono" style={{ fontSize: 10, color: T.textMuted }}>
                      <ArrowUpRight size={9} style={{ verticalAlign: "middle" }} /> {nf2.format(vezes)}× o atual
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="bmk-card">
            <div
              className="bmk-card-accent"
              style={{
                background: `linear-gradient(90deg, transparent, ${T.accent}, transparent)`,
                opacity: 0.9,
              }}
            />
            <div className="bmk-card-hd">
              <span className="bmk-pill" style={{ background: "rgba(59,130,246,.18)" }}>
                <AlertTriangle size={14} color={T.accent} />
              </span>
              <div>
                <div className="bmk-card-title">Percentual de referência por tipo de organização</div>
                <div className="bmk-card-sub">A barra mostra a faixa na escala comum · nossa posição em branco</div>
              </div>
            </div>

            <div style={{ overflowX: "auto", marginTop: 12 }}>
              <table className="bmk-table">
                <thead>
                  <tr>
                    <th>Tipo de organização</th>
                    <th style={{ width: 118 }}>Faixa</th>
                    <th style={{ minWidth: 170 }}>Posição na escala</th>
                  </tr>
                </thead>
                <tbody>
                  {investimento.map((r) => {
                    const mn = r.pct_min != null ? Number(r.pct_min) : null;
                    const mx = r.pct_max != null ? Number(r.pct_max) : null;
                    const escala = Math.max(...investimento.map((x) => Number(x.pct_max ?? 0)), pct ?? 0, 1);
                    const faixaTxt =
                      mn != null && mx != null
                        ? `${pctFmt(mn)}–${pctFmt(mx)}`
                        : mx != null
                          ? `< ${pctFmt(mx)}`
                          : mn != null
                            ? `> ${pctFmt(mn)}`
                            : "—";
                    return (
                      <tr key={r.id}>
                        <td className="nm">
                          {r.tipo_organizacao}
                          {r.observacao && (
                            <div
                              style={{
                                fontSize: 10,
                                color: T.textMuted,
                                fontWeight: 400,
                                marginTop: 2,
                              }}
                            >
                              {r.observacao}
                            </div>
                          )}
                        </td>
                        <td className="bmk-mono" style={{ whiteSpace: "nowrap", color: T.textPrimary }}>
                          {faixaTxt}
                        </td>
                        <td>
                          <div className="bmk-ruler" style={{ height: 10 }}>
                            <div
                              className="bmk-ruler-band"
                              style={{
                                left: `${((mn ?? 0) / escala) * 100}%`,
                                width: `${(((mx ?? escala) - (mn ?? 0)) / escala) * 100}%`,
                                background: `linear-gradient(90deg, var(--tl-1e3a8a, #1E3A8A), ${T.accentDeep})`,
                                borderLeftColor: T.accent,
                                borderRightColor: T.accent,
                                borderRadius: 4,
                              }}
                            />
                            {pct != null && (
                              <div
                                className="bmk-ruler-mark"
                                style={{
                                  left: `${(pct / escala) * 100}%`,
                                  background: T.textPrimary,
                                  width: 3,
                                  boxShadow: "0 0 0 1px rgba(10,13,20,.9)",
                                }}
                              />
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {investimento.length === 0 && (
                    <tr>
                      <td colSpan={3} style={{ padding: 14, color: T.textMuted }}>
                        Nenhuma referência cadastrada. Cadastre na aba Operações.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div className="bmk-foot">
        Fontes: Vultus Cybersecurity Ecosystem (2023–2025, 117 médias e grandes empresas brasileiras, 13 setores) ·
        IANS/Artico Security Budget Benchmark 2025 · Avasant IT Security &amp; Cybersecurity Spending Benchmarks 2025 ·
        Cisco Cybersecurity Readiness Index 2025 (Brasil).
        <br />
        Nota de maturidade lida do módulo Maturidade
        {nist?.periodo ? ` (NIST CSF · ${nist.periodo})` : ""}.
      </div>
    </div>
  );
}
