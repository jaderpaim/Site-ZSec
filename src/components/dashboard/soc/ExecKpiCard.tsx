import type { ComponentType, CSSProperties } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

type Tone = "primary" | "critical" | "warning" | "success";

const toneColor: Record<Tone, string> = {
  primary: "var(--soc-accent)",
  critical: "var(--soc-critical)",
  warning: "var(--soc-warning)",
  success: "var(--soc-success)",
};

export function ExecKpiCard({
  label,
  value,
  delta,
  hint,
  Icon,
  tone = "primary",
  delay = 0,
}: {
  label: string;
  value: string | number;
  delta?: { value: string; positive: boolean };
  hint?: string;
  Icon?: ComponentType<{ className?: string }>;
  tone?: Tone;
  delay?: number;
}) {
  const accent = toneColor[tone];
  const style: CSSProperties = {
    background: "var(--soc-surface)",
    border: "1px solid var(--soc-border)",
    boxShadow: "var(--soc-shadow)",
    animationDelay: `${delay}ms`,
  };
  return (
    <div className="soc-stagger-in rounded-xl p-6 relative overflow-hidden" style={style}>
      <div
        aria-hidden
        className="absolute top-0 left-0 right-0 h-[2px]"
        style={{
          background: `linear-gradient(90deg, transparent, ${accent}, transparent)`,
          opacity: 0.7,
        }}
      />
      <div className="flex items-start justify-between">
        <span
          className="soc-body text-[10px] uppercase font-medium tracking-[0.12em]"
          style={{ color: "var(--soc-text-muted)" }}
        >
          {label}
        </span>
        {Icon && <Icon className="size-4" />}
      </div>
      <div className="mt-4 flex items-baseline gap-2 flex-wrap">
        <span
          className="soc-display text-4xl xl:text-5xl font-semibold leading-none tabular-nums"
          style={{ color: "var(--soc-text)" }}
        >
          {value}
        </span>
        {delta && (
          <span
            className="soc-body inline-flex items-center gap-0.5 text-sm font-semibold"
            style={{ color: delta.positive ? "var(--soc-success)" : "var(--soc-critical)" }}
          >
            {delta.positive ? <ArrowUp className="size-3.5" /> : <ArrowDown className="size-3.5" />}
            {delta.value}
          </span>
        )}
      </div>
      {hint && (
        <p className="soc-body text-xs mt-3" style={{ color: "var(--soc-text-muted)" }}>
          {hint}
        </p>
      )}
    </div>
  );
}
