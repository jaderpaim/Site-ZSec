import * as React from "react";
import type { ReactNode } from "react";
import { ArrowDown, ArrowUp } from "lucide-react";

export function KpiCard({
  label,
  value,
  delta,
  hint,
  accent,
  onClick,
  active,
}: {
  label: string;
  value: ReactNode;
  delta?: { value: string; positive?: boolean };
  hint?: React.ReactNode;
  accent?: "primary" | "danger" | "warning" | "success";
  onClick?: () => void;
  active?: boolean;
}) {
  const accentBorder =
    accent === "danger"
      ? "border-l-danger"
      : accent === "warning"
        ? "border-l-warning"
        : accent === "success"
          ? "border-l-success"
          : accent === "primary"
            ? "border-l-primary"
            : "border-l-transparent";
  const interactive = onClick ? "cursor-pointer hover:bg-accent/40 transition-colors" : "";
  const activeRing = active ? "ring-2 ring-primary ring-offset-2 ring-offset-background" : "";
  return (
    <div
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={
        onClick
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick();
              }
            }
          : undefined
      }
      className={`bg-surface border border-border rounded-lg p-5 border-l-4 ${accentBorder} ${interactive} ${activeRing}`}
    >
      <div className="text-mono-xs text-muted-foreground mb-2">{label}</div>
      <div className="text-3xl font-semibold tracking-tight text-foreground font-mono">{value}</div>
      {(delta || hint) && (
        <div className="mt-2 flex items-center gap-2 text-mono-xs">
          {delta && (
            <span className={`flex items-center gap-1 font-medium ${delta.positive ? "text-success" : "text-danger"}`}>
              {delta.positive ? <ArrowDown className="size-3" /> : <ArrowUp className="size-3" />}
              {delta.value}
            </span>
          )}
          {hint && <span className="text-muted-foreground">{hint}</span>}
        </div>
      )}
    </div>
  );
}

export function Panel({
  title,
  action,
  children,
  className = "",
}: {
  title: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={`bg-surface border border-border rounded-lg ${className}`}>
      <div className="px-5 py-4 border-b border-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">{title}</h3>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </div>
  );
}

export function Badge({
  tone,
  children,
}: {
  tone: "danger" | "warning" | "success" | "info" | "muted";
  children: ReactNode;
}) {
  const cls = {
    danger: "bg-danger/15 text-danger border border-danger/30",
    warning: "bg-warning/15 text-warning border border-warning/30",
    success: "bg-success/15 text-success border border-success/30",
    info: "bg-primary/15 text-primary border border-primary/30",
    muted: "bg-muted text-muted-foreground border border-border",
  }[tone];
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-mono-xs font-semibold ${cls}`}>
      {children}
    </span>
  );
}
