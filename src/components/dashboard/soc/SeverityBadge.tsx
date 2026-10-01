import type { ReactNode } from "react";

type Severity = "critical" | "high" | "medium" | "low" | "neutral";

const map: Record<Severity, { bg: string; fg: string }> = {
  critical: { bg: "#FF3B5C", fg: "#fff" },
  high: { bg: "#FF6B35", fg: "#fff" },
  medium: { bg: "#FFB020", fg: "#1a1300" },
  low: { bg: "#00C896", fg: "#04201a" },
  neutral: { bg: "rgba(255,255,255,0.08)", fg: "#8a95a8" },
};

export function SeverityBadge({ severity, children }: { severity: Severity; children: ReactNode }) {
  const c = map[severity];
  return (
    <span
      className="soc-body inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wide"
      style={{ background: c.bg, color: c.fg }}
    >
      {children}
    </span>
  );
}
