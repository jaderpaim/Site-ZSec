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
  BarChart,
  Bar,
  Cell,
  Area,
  AreaChart,
  Legend,
} from "recharts";
import { ShieldCheck, Award, Trophy, BarChart3, Lock, FileDown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { listMaturidade, type MaturidadePayload, type BernoulliRow } from "@/lib/segmentos.functions";

/* ============ Constantes fixas (metas) ============ */
const META_NIST = 3.0;
const META_ISO = 3.0;

type Point = { label: string; v: number; delta: number | null; deltaTotal: number | null };
type RankRow = MaturidadePayload["ranking_nist"][number];

/* ============ Utils ============ */
function useCountUp(target: number, durationMs = 1500, decimals = 2) {
  const [v, setV] = React.useState(0);
  React.useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setV(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return v.toFixed(decimals);
}

const fmt = (n: number, d = 2) => n.toLocaleString("pt-BR", { minimumFractionDigits: d, maximumFractionDigits: d });

/* ============ Header ============ */
function HeaderExecutivo({ atualizadoEm }: { atualizadoEm: string }) {
  return (
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 border border-border bg-surface-elevated rounded-lg px-6 py-5 animate-fade-in">
      <div className="flex items-center gap-4">
        <div className="size-12 rounded-md flex items-center justify-center font-serif text-2xl font-bold text-primary-foreground bg-gradient-to-br from-primary to-success shadow-[0_0_24px_-6px_var(--primary)]">
          B
        </div>
        <div>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight text-foreground">
            Maturidade em Segurança da Informação
          </h1>
          <p className="text-sm text-muted-foreground">Bernoulli Educação · Evolução Estratégica</p>
        </div>
      </div>
      <div className="hidden lg:flex items-center">
        <span className="text-mono-xs px-3 py-1.5 rounded border border-border bg-surface text-muted-foreground">
          NIST CSF · ISO/IEC 27001
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-mono-xs px-3 py-1.5 rounded border border-primary/30 bg-primary/10 text-primary">
          Atualizado: {atualizadoEm}
        </span>
        <span className="inline-flex items-center gap-1 text-mono-xs px-3 py-1.5 rounded border border-warning/30 bg-warning/10 text-warning">
          <Lock className="size-3" /> CONFIDENCIAL
        </span>
      </div>
    </div>
  );
}

/* ============ KPI ============ */
function KpiExecCard({
  icon: Icon,
  label,
  value,
  sub,
  footer,
  tone,
  badge,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number;
  sub: string;
  footer?: string;
  tone: "primary" | "success" | "warning";
  badge?: string;
}) {
  const display = useCountUp(value, 1500);
  const toneCls = {
    primary: {
      border: "border-l-primary",
      text: "text-primary",
      glow: "shadow-[0_0_28px_-10px_var(--primary)]",
      bg: "bg-primary/10",
    },
    success: {
      border: "border-l-success",
      text: "text-success",
      glow: "shadow-[0_0_28px_-10px_var(--success)]",
      bg: "bg-success/10",
    },
    warning: {
      border: "border-l-warning",
      text: "text-warning",
      glow: "shadow-[0_0_28px_-10px_var(--warning)]",
      bg: "bg-warning/10",
    },
  }[tone];
  return (
    <div
      className={`group bg-surface border border-border rounded-lg p-5 border-l-4 ${toneCls.border} ${toneCls.glow} transition-all hover:-translate-y-1`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`size-10 rounded-md flex items-center justify-center ${toneCls.bg} ${toneCls.text}`}>
          <Icon className="size-5" />
        </div>
        {badge && (
          <span className={`text-mono-xs px-2 py-0.5 rounded border ${toneCls.text} border-current ${toneCls.bg}`}>
            {badge}
          </span>
        )}
      </div>
      <div className="text-mono-xs text-muted-foreground mb-1">{label}</div>
      <div className={`text-4xl font-semibold tracking-tight font-mono ${toneCls.text}`}>
        {display.replace(".", ",")}
      </div>
      <div className="mt-2 text-xs text-muted-foreground">{sub}</div>
      {footer && <div className="mt-1 text-mono-xs text-foreground/80">{footer}</div>}
    </div>
  );
}

/* ============ Timeline ============ */
function TimelineEvolucao({ nist, iso }: { nist: Point[]; iso: Point[] }) {
  const renderTrack = (data: Point[], tone: "primary" | "success", scaleMax: number) => {
    const colorVar = tone === "primary" ? "var(--primary)" : "var(--success)";
    if (data.length === 0) {
      return <div className="text-xs text-muted-foreground py-8 text-center">Sem dados.</div>;
    }
    return (
      <div className="relative pt-10 pb-2 px-2 min-w-[640px]">
        <div className="absolute left-2 right-2 top-1/2 h-px bg-border" />
        <div className="relative flex items-center justify-between">
          {data.map((p, i) => {
            const size = 14 + (p.v / scaleMax) * 26;
            return (
              <div key={i} className="flex flex-col items-center gap-2 relative" style={{ width: 96 }}>
                <div
                  className="absolute -top-9 text-mono-xs px-1.5 py-0.5 rounded border whitespace-nowrap"
                  style={{
                    color: colorVar,
                    borderColor: colorVar,
                    background: `color-mix(in oklab, ${colorVar} 12%, transparent)`,
                  }}
                >
                  {fmt(p.v)}{" "}
                  {p.delta !== null && (
                    <span className="opacity-80">
                      · {p.delta >= 0 ? "+" : ""}
                      {fmt(p.delta, 1)}%
                    </span>
                  )}
                </div>
                <div
                  className="rounded-full ring-2 ring-background transition-transform hover:scale-110"
                  style={{
                    width: size,
                    height: size,
                    background: colorVar,
                    boxShadow: `0 0 16px -2px ${colorVar}`,
                  }}
                />
                <div className="text-mono-xs text-muted-foreground mt-1">{p.label}</div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const totalNist = nist.length > 1 ? nist[nist.length - 1].deltaTotal : null;
  const totalIso = iso.length > 1 ? iso[iso.length - 1].deltaTotal : null;

  return (
    <div className="bg-surface border border-border rounded-lg animate-fade-in" style={{ animationDelay: "120ms" }}>
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold">Jornada de Evolução · Timeline Estratégica</h3>
        <div className="flex items-center gap-3 text-mono-xs text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full bg-primary" /> NIST
          </span>
          <span className="inline-flex items-center gap-1">
            <span className="size-2 rounded-full bg-success" /> ISO
          </span>
        </div>
      </div>
      <div className="p-5 grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <div className="text-mono-xs text-primary mb-1">NIST CSF</div>
          <div className="overflow-x-auto">{renderTrack(nist, "primary", META_NIST)}</div>
          <div className="mt-3 flex items-center justify-between p-3 rounded-md border border-primary/30 bg-primary/5">
            <span className="text-xs text-muted-foreground">
              Evolução global {nist[0]?.label ?? "—"} → {nist[nist.length - 1]?.label ?? "—"}
            </span>
            <span className="text-xl font-mono font-semibold text-primary">
              {totalNist === null ? "—" : `${totalNist >= 0 ? "+" : ""}${fmt(totalNist, 1)}%`}
            </span>
          </div>
        </div>
        <div>
          <div className="text-mono-xs text-success mb-1">ISO 27001</div>
          <div className="overflow-x-auto">{renderTrack(iso, "success", META_ISO)}</div>
          <div className="mt-3 flex items-center justify-between p-3 rounded-md border border-success/30 bg-success/5">
            <span className="text-xs text-muted-foreground">
              Evolução global {iso[0]?.label ?? "—"} → {iso[iso.length - 1]?.label ?? "—"}
            </span>
            <span className="text-xl font-mono font-semibold text-success">
              {totalIso === null ? "—" : `${totalIso >= 0 ? "+" : ""}${fmt(totalIso, 1)}%`}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============ Line chart ============ */
function EvolucaoLineChart({
  chartData,
  mediaEduNist,
  mediaEduIso,
}: {
  chartData: Array<{ p: string; NIST: number | null; ISO: number | null }>;
  mediaEduNist: number | null;
  mediaEduIso: number | null;
}) {
  return (
    <div className="bg-surface border border-border rounded-lg animate-fade-in" style={{ animationDelay: "180ms" }}>
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold">Evolução Comparada · NIST × ISO</h3>
        <span className="text-mono-xs text-muted-foreground">Escala 0 – 3,5</span>
      </div>
      <div className="p-5">
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={chartData} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="gNist" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gIso" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--success)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="var(--success)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="p" stroke="var(--muted-foreground)" fontSize={11} />
            <YAxis domain={[0, 3.5]} stroke="var(--muted-foreground)" fontSize={11} />
            <Tooltip
              contentStyle={{
                background: "var(--surface-elevated)",
                border: "1px solid var(--border)",
                borderRadius: 8,
                fontSize: 12,
              }}
            />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            <ReferenceLine
              y={META_NIST}
              stroke="var(--danger)"
              strokeDasharray="4 4"
              label={{ value: "Meta NIST 3,00", fill: "var(--danger)", fontSize: 10, position: "insideTopRight" }}
            />
            <ReferenceLine
              y={META_ISO}
              stroke="var(--success)"
              strokeDasharray="4 4"
              label={{ value: "Meta ISO 3,00", fill: "var(--success)", fontSize: 10, position: "insideTopLeft" }}
            />
            {mediaEduNist !== null && (
              <ReferenceLine
                y={mediaEduNist}
                stroke="var(--muted-foreground)"
                strokeDasharray="2 4"
                label={{
                  value: `Média Edu NIST ${fmt(mediaEduNist)}`,
                  fill: "var(--muted-foreground)",
                  fontSize: 10,
                  position: "insideBottomRight",
                }}
              />
            )}
            {mediaEduIso !== null && (
              <ReferenceLine
                y={mediaEduIso}
                stroke="var(--muted-foreground)"
                strokeDasharray="2 4"
                label={{
                  value: `Média Edu ISO ${fmt(mediaEduIso)}`,
                  fill: "var(--muted-foreground)",
                  fontSize: 10,
                  position: "insideBottomLeft",
                }}
              />
            )}
            <Area
              type="monotone"
              dataKey="NIST"
              stroke="var(--primary)"
              strokeWidth={2.5}
              fill="url(#gNist)"
              connectNulls
            />
            <Area
              type="monotone"
              dataKey="ISO"
              stroke="var(--success)"
              strokeWidth={2.5}
              fill="url(#gIso)"
              connectNulls
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

/* ============ Progresso barras ============ */
function ProgressoPorPeriodo({ nist, iso }: { nist: Point[]; iso: Point[] }) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setMounted(true), 100);
    return () => clearTimeout(t);
  }, []);

  const renderBars = (data: Point[], scale: number, tone: "primary" | "success") => {
    const colorVar = tone === "primary" ? "var(--primary)" : "var(--success)";
    if (data.length === 0) {
      return <div className="text-xs text-muted-foreground py-4 text-center">Sem dados.</div>;
    }
    return (
      <div className="space-y-3">
        {data.map((p, i) => {
          const pct = (p.v / scale) * 100;
          const isLast = i === data.length - 1;
          return (
            <div key={p.label}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className={`text-muted-foreground ${isLast ? "font-semibold text-foreground" : ""}`}>
                  {p.label}
                </span>
                <span className="font-mono text-foreground">
                  {fmt(p.v)} / {fmt(scale, 2)} · <span style={{ color: colorVar }}>{fmt(pct, 1)}%</span>
                </span>
              </div>
              <div className="h-2.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full transition-[width] ease-out"
                  style={{
                    width: mounted ? `${pct}%` : "0%",
                    background: `linear-gradient(90deg, color-mix(in oklab, ${colorVar} 45%, transparent), ${colorVar})`,
                    transitionDuration: "1100ms",
                    transitionDelay: `${i * 120}ms`,
                    boxShadow: isLast ? `0 0 12px -2px ${colorVar}` : "none",
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in" style={{ animationDelay: "240ms" }}>
      <div className="bg-surface border border-border rounded-lg">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold">Progresso NIST · Evolução por Etapa</h3>
          <p className="text-mono-xs text-muted-foreground mt-1">Escala 0 – 3,00 (meta interna)</p>
        </div>
        <div className="p-5">{renderBars(nist, META_NIST, "primary")}</div>
      </div>
      <div className="bg-surface border border-border rounded-lg">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold">Progresso ISO · Evolução por Etapa</h3>
          <p className="text-mono-xs text-muted-foreground mt-1">Escala 0 – 3,00 (meta interna)</p>
        </div>
        <div className="p-5">{renderBars(iso, META_ISO, "success")}</div>
      </div>
    </div>
  );
}

/* ============ Ranking ============ */
function RankingPanel({
  title,
  data,
  tone,
  anotacao,
}: {
  title: string;
  data: RankRow[];
  tone: "primary" | "success";
  anotacao: string;
}) {
  const colorMain = tone === "primary" ? "var(--primary)" : "var(--success)";
  const sorted = [...data].sort((a, b) => a.v - b.v);
  const max = sorted.length ? Math.max(...sorted.map((d) => d.v)) : 1;
  return (
    <div className="bg-surface border border-border rounded-lg">
      <div className="px-5 py-4 border-b border-border">
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      <div className="p-5">
        {sorted.length === 0 ? (
          <div className="text-xs text-muted-foreground py-4 text-center">Sem dados.</div>
        ) : (
          <ResponsiveContainer width="100%" height={sorted.length * 28 + 20}>
            <BarChart data={sorted} layout="vertical" margin={{ top: 0, right: 32, left: 8, bottom: 0 }}>
              <CartesianGrid horizontal={false} stroke="var(--border)" />
              <XAxis
                type="number"
                domain={[0, Math.ceil(max * 10) / 10 + 0.2]}
                stroke="var(--muted-foreground)"
                fontSize={10}
              />
              <YAxis type="category" dataKey="name" stroke="var(--muted-foreground)" fontSize={11} width={120} />
              <Tooltip
                contentStyle={{
                  background: "var(--surface-elevated)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  fontSize: 12,
                }}
                formatter={(v: number) => fmt(v)}
              />
              <Bar
                dataKey="v"
                radius={[0, 4, 4, 0]}
                label={{ position: "right", fill: "var(--foreground)", fontSize: 11, formatter: (v: number) => fmt(v) }}
              >
                {sorted.map((row, i) => {
                  const color =
                    row.kind === "bernoulli"
                      ? colorMain
                      : row.kind === "edu"
                        ? "var(--warning)"
                        : "color-mix(in oklab, var(--muted-foreground) 35%, transparent)";
                  return <Cell key={i} fill={color} />;
                })}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
        <div className="mt-3 text-xs text-muted-foreground border-t border-border pt-3" style={{ color: colorMain }}>
          {anotacao}
        </div>
      </div>
    </div>
  );
}

function RankingSegmento({
  rankingNist,
  rankingIso,
  bernNist,
  bernIso,
  mediaEduNist,
  mediaEduIso,
}: {
  rankingNist: RankRow[];
  rankingIso: RankRow[];
  bernNist: number | null;
  bernIso: number | null;
  mediaEduNist: number | null;
  mediaEduIso: number | null;
}) {
  const pct = (curr: number | null, base: number | null) =>
    curr === null || base === null || base === 0 ? null : Math.round(((curr - base) / base) * 100);
  const pNist = pct(bernNist, mediaEduNist);
  const pIso = pct(bernIso, mediaEduIso);
  return (
    <div className="space-y-4 animate-fade-in" style={{ animationDelay: "300ms" }}>
      <div>
        <h2 className="text-base font-semibold text-foreground">Posicionamento Competitivo · Bernoulli vs. Mercado</h2>
        <p className="text-xs text-muted-foreground">
          Comparativo de pontuação de maturidade por segmento de indústria.
        </p>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <RankingPanel
          title="NIST · Ranking por Segmento"
          data={rankingNist}
          tone="primary"
          anotacao={
            pNist === null
              ? "Sem média do segmento Educação."
              : `Bernoulli ${pNist >= 0 ? "supera" : "abaixo"} a média do segmento Educação em ${Math.abs(pNist)}%.`
          }
        />
        <RankingPanel
          title="ISO · Ranking por Segmento"
          data={rankingIso}
          tone="success"
          anotacao={
            pIso === null
              ? "Sem média do segmento Educação."
              : `Bernoulli ${pIso >= 0 ? "supera" : "abaixo"} a média do segmento Educação em ${Math.abs(pIso)}%.`
          }
        />
      </div>
    </div>
  );
}

/* ============ Gauges ============ */
function Gauge({
  value,
  max,
  label,
  sub,
  tone,
}: {
  value: number;
  max: number;
  label: string;
  sub: string;
  tone: "primary" | "success";
}) {
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setMounted(true), 150);
    return () => clearTimeout(t);
  }, []);
  const pct = Math.min(1, value / max);
  const angle = mounted ? -90 + pct * 180 : -90;
  const colorMain = tone === "primary" ? "var(--primary)" : "var(--success)";
  const segments =
    tone === "primary"
      ? [
          { from: 0, to: 1 / 3, color: "var(--danger)" },
          { from: 1 / 3, to: 2 / 3, color: "var(--warning)" },
          { from: 2 / 3, to: 5 / 6, color: "color-mix(in oklab, var(--primary) 60%, transparent)" },
          { from: 5 / 6, to: 1, color: "var(--primary)" },
        ]
      : [
          { from: 0, to: 0.2, color: "var(--danger)" },
          { from: 0.2, to: 0.4, color: "var(--warning)" },
          { from: 0.4, to: 0.6, color: "color-mix(in oklab, var(--success) 55%, transparent)" },
          { from: 0.6, to: 1, color: "var(--success)" },
        ];
  const arcPath = (from: number, to: number) => {
    const r = 80;
    const cx = 100,
      cy = 100;
    const a1 = Math.PI - from * Math.PI;
    const a2 = Math.PI - to * Math.PI;
    const x1 = cx + r * Math.cos(a1),
      y1 = cy - r * Math.sin(a1);
    const x2 = cx + r * Math.cos(a2),
      y2 = cy - r * Math.sin(a2);
    const large = to - from > 0.5 ? 1 : 0;
    return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2}`;
  };
  return (
    <div className="bg-surface border border-border rounded-lg p-5 flex flex-col items-center">
      <div className="text-mono-xs text-muted-foreground mb-2">{label}</div>
      <svg viewBox="0 0 200 120" className="w-full max-w-[280px]">
        {segments.map((s, i) => (
          <path key={i} d={arcPath(s.from, s.to)} stroke={s.color} strokeWidth={14} fill="none" strokeLinecap="butt" />
        ))}
        {Array.from({ length: 5 }, (_, i) => i / 4).map((t, i) => {
          const a = Math.PI - t * Math.PI;
          const x1 = 100 + 64 * Math.cos(a),
            y1 = 100 - 64 * Math.sin(a);
          const x2 = 100 + 72 * Math.cos(a),
            y2 = 100 - 72 * Math.sin(a);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="var(--muted-foreground)" strokeWidth={1} />;
        })}
        <g
          style={{
            transformOrigin: "100px 100px",
            transform: `rotate(${angle}deg)`,
            transition: "transform 1200ms cubic-bezier(0.22,1,0.36,1)",
          }}
        >
          <line x1="100" y1="100" x2="100" y2="30" stroke={colorMain} strokeWidth={3} strokeLinecap="round" />
          <circle cx="100" cy="100" r="6" fill={colorMain} />
        </g>
      </svg>
      <div className="text-4xl font-mono font-semibold tracking-tight" style={{ color: colorMain }}>
        {fmt(value).replace(".", ",")}
      </div>
      <div className="text-xs text-muted-foreground mt-1">{sub}</div>
    </div>
  );
}

function GaugesMaturidade({
  nistLatest,
  isoLatest,
}: {
  nistLatest: { periodo: string; v: number } | null;
  isoLatest: { periodo: string; v: number } | null;
}) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in" style={{ animationDelay: "360ms" }}>
      {nistLatest && (
        <Gauge
          value={nistLatest.v}
          max={META_NIST}
          label={`NIST · ${nistLatest.periodo}`}
          sub={`${fmt((nistLatest.v / META_NIST) * 100, 1)}% da meta (${fmt(META_NIST)})`}
          tone="primary"
        />
      )}
      {isoLatest && (
        <Gauge
          value={isoLatest.v}
          max={META_ISO}
          label={`ISO · ${isoLatest.periodo}`}
          sub={`${fmt((isoLatest.v / META_ISO) * 100, 1)}% da meta (${fmt(META_ISO)})`}
          tone="success"
        />
      )}
    </div>
  );
}

/* ============ Incrementos ============ */
function IncrementosTabela({ nist, iso }: { nist: Point[]; iso: Point[] }) {
  const renderRows = (data: Point[], tone: "primary" | "success") => {
    const colorVar = tone === "primary" ? "var(--primary)" : "var(--success)";
    if (data.length === 0) {
      return <div className="text-xs text-muted-foreground py-4 text-center">Sem dados.</div>;
    }
    return (
      <div className="divide-y divide-border">
        <div className="grid grid-cols-4 gap-2 px-3 py-2 text-mono-xs text-muted-foreground">
          <span>Período</span>
          <span>Score</span>
          <span>Δ vs Anterior</span>
          <span>Δ vs Início</span>
        </div>
        {data.map((p, i) => {
          const isLast = i === data.length - 1;
          return (
            <div
              key={p.label}
              className={`grid grid-cols-4 gap-2 px-3 py-2.5 text-sm font-mono ${i % 2 === 1 ? "bg-muted/30" : ""} ${isLast ? "border-l-2" : ""}`}
              style={isLast ? { borderLeftColor: colorVar } : undefined}
            >
              <span className="text-muted-foreground">{p.label}</span>
              <span className="text-foreground font-semibold">{fmt(p.v)}</span>
              <span className="text-success">
                {p.delta === null ? "— baseline" : `${p.delta >= 0 ? "+" : ""}${fmt(p.delta, 1)}%`}
              </span>
              <span
                className={isLast ? "font-semibold" : ""}
                style={isLast ? { color: "var(--primary)" } : { color: "var(--success)" }}
              >
                {p.deltaTotal === null ? "—" : `${p.deltaTotal >= 0 ? "+" : ""}${fmt(p.deltaTotal, 1)}%`}
              </span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-fade-in" style={{ animationDelay: "420ms" }}>
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold">NIST · Crescimento por Período</h3>
        </div>
        {renderRows(nist, "primary")}
      </div>
      <div className="bg-surface border border-border rounded-lg overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <h3 className="text-sm font-semibold">ISO · Crescimento por Período</h3>
        </div>
        {renderRows(iso, "success")}
      </div>
    </div>
  );
}

/* ============ Footer ============ */
function RodapeExecutivo() {
  return (
    <div
      className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 border-t border-border pt-5 mt-2 text-xs text-muted-foreground animate-fade-in"
      style={{ animationDelay: "480ms" }}
    >
      <div>
        <div className="text-foreground font-medium">
          Dashboard elaborado pelo time de Segurança da Informação · Bernoulli Educação
        </div>
        <div>Dados baseados em avaliações internas e benchmarks do setor</div>
      </div>
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1 text-mono-xs">
          <ShieldCheck className="size-3.5 text-primary" /> NIST CSF
        </span>
        <span className="inline-flex items-center gap-1 text-mono-xs">
          <Award className="size-3.5 text-success" /> ISO/IEC 27001
        </span>
        <button className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded border border-border hover:bg-accent transition-colors text-foreground">
          <FileDown className="size-3.5" /> Exportar PDF
        </button>
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

  if (isLoading) {
    return <div className="py-12 text-center text-sm text-muted-foreground">Carregando dados de maturidade…</div>;
  }
  if (error || !data) {
    return <div className="py-12 text-center text-sm text-danger">Erro ao carregar maturidade.</div>;
  }

  const nistTimeline: Point[] = data.bernoulli.nist_timeline.map((p) => ({
    label: p.label,
    v: p.v,
    delta: p.delta,
    deltaTotal: p.deltaTotal,
  }));
  const isoTimeline: Point[] = data.bernoulli.iso_timeline.map((p) => ({
    label: p.label,
    v: p.v,
    delta: p.delta,
    deltaTotal: p.deltaTotal,
  }));

  // Chart combinado: união por periodo_ordem
  const chartData = [...data.bernoulli.rows]
    .sort((a, b) => a.periodo_ordem - b.periodo_ordem)
    .map((r: BernoulliRow) => ({ p: r.periodo, NIST: r.nota_nist, ISO: r.nota_iso }));

  const latestNist = data.bernoulli.latest_nist;
  const latestIso = data.bernoulli.latest_iso;
  const mediaEduNist = data.media_edu_nist;
  const mediaEduIso = data.media_edu_iso;

  const pctEdu = (curr: number | null, base: number | null) =>
    curr === null || base === null || base === 0 ? null : Math.round(((curr - base) / base) * 100);
  const subEduNist = pctEdu(latestNist?.v ?? null, mediaEduNist);
  const subEduIso = pctEdu(latestIso?.v ?? null, mediaEduIso);

  const lastPeriodo = data.bernoulli.latest_score?.periodo ?? latestNist?.periodo ?? latestIso?.periodo ?? "—";

  return (
    <div className="space-y-6">
      <HeaderExecutivo atualizadoEm={lastPeriodo} />

      <div
        className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4 animate-fade-in"
        style={{ animationDelay: "60ms" }}
      >
        {latestNist && (
          <KpiExecCard
            icon={ShieldCheck}
            tone="primary"
            label={`Pontuação NIST · ${latestNist.periodo}`}
            value={latestNist.v}
            sub={
              nistTimeline.length > 1 && nistTimeline[nistTimeline.length - 1].deltaTotal !== null
                ? `${nistTimeline[nistTimeline.length - 1].deltaTotal! >= 0 ? "+" : ""}${fmt(nistTimeline[nistTimeline.length - 1].deltaTotal!, 1)}% desde ${nistTimeline[0].label}`
                : "—"
            }
            footer={`Meta ${fmt(META_NIST)} · Progresso ${fmt((latestNist.v / META_NIST) * 100, 1)}%`}
          />
        )}
        {latestIso && (
          <KpiExecCard
            icon={Award}
            tone="success"
            label={`Pontuação ISO · ${latestIso.periodo}`}
            value={latestIso.v}
            sub={
              isoTimeline.length > 1 && isoTimeline[isoTimeline.length - 1].deltaTotal !== null
                ? `${isoTimeline[isoTimeline.length - 1].deltaTotal! >= 0 ? "+" : ""}${fmt(isoTimeline[isoTimeline.length - 1].deltaTotal!, 1)}% desde ${isoTimeline[0].label}`
                : "—"
            }
            footer={`Meta ${fmt(META_ISO)} · Progresso ${fmt((latestIso.v / META_ISO) * 100, 1)}%`}
          />
        )}
        {latestNist && mediaEduNist !== null && (
          <KpiExecCard
            icon={BarChart3}
            tone="warning"
            badge={latestNist.v >= mediaEduNist ? "Líder do Segmento" : "Abaixo do Segmento"}
            label={`Bernoulli vs Educação (NIST ${fmt(mediaEduNist)})`}
            value={latestNist.v}
            sub={subEduNist === null ? "—" : `${subEduNist >= 0 ? "+" : ""}${subEduNist}% vs média do setor`}
          />
        )}
        {latestIso && mediaEduIso !== null && (
          <KpiExecCard
            icon={Trophy}
            tone="warning"
            badge={latestIso.v >= mediaEduIso ? "Acima da Média" : "Abaixo da Média"}
            label={`Bernoulli vs Educação (ISO ${fmt(mediaEduIso)})`}
            value={latestIso.v}
            sub={subEduIso === null ? "—" : `${subEduIso >= 0 ? "+" : ""}${subEduIso}% vs média do setor`}
          />
        )}
      </div>

      <TimelineEvolucao nist={nistTimeline} iso={isoTimeline} />
      <EvolucaoLineChart chartData={chartData} mediaEduNist={mediaEduNist} mediaEduIso={mediaEduIso} />
      <ProgressoPorPeriodo nist={nistTimeline} iso={isoTimeline} />
      <RankingSegmento
        rankingNist={data.ranking_nist}
        rankingIso={data.ranking_iso}
        bernNist={latestNist?.v ?? null}
        bernIso={latestIso?.v ?? null}
        mediaEduNist={mediaEduNist}
        mediaEduIso={mediaEduIso}
      />
      <GaugesMaturidade nistLatest={latestNist} isoLatest={latestIso} />
      <IncrementosTabela nist={nistTimeline} iso={isoTimeline} />
      <RodapeExecutivo />
    </div>
  );
}

export default MaturidadeExecutive;
