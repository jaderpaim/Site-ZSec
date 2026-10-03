import type { ReactNode } from "react";

export function ExecTable({
  children,
  maxHeight,
}: {
  children: ReactNode;
  maxHeight?: number;
}) {
  return (
    <div className="overflow-auto" style={{ maxHeight }}>
      <table className="w-full text-sm border-collapse soc-body">{children}</table>
    </div>
  );
}

export function ExecTHead({ children }: { children: ReactNode }) {
  return (
    <thead className="sticky top-0 z-10" style={{ background: "var(--soc-bg-2)" }}>
      <tr style={{ borderBottom: "1px solid var(--soc-border)" }}>{children}</tr>
    </thead>
  );
}

export function ExecTH({
  children,
  align = "left",
  onClick,
  className = "",
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  onClick?: () => void;
  className?: string;
}) {
  return (
    <th
      onClick={onClick}
      className={`px-4 py-3 text-[10px] uppercase tracking-[0.12em] font-semibold ${
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"
      } ${onClick ? "cursor-pointer hover:text-white transition-colors select-none" : ""} ${className}`}
      style={{ color: "var(--soc-text-muted)" }}
    >
      {children}
    </th>
  );
}

export function ExecTBody({ children }: { children: ReactNode }) {
  return (
    <tbody>
      {children}
    </tbody>
  );
}

export function ExecTR({ children, index }: { children: ReactNode; index: number }) {
  return (
    <tr
      className="transition-colors hover:bg-white/[0.03]"
      style={{
        background: index % 2 === 0 ? "transparent" : "rgba(var(--tl-ink, 255,255,255),0.015)",
        borderBottom: "1px solid var(--soc-border)",
      }}
    >
      {children}
    </tr>
  );
}

export function ExecTD({
  children,
  align = "left",
  mono = false,
  muted = false,
  className = "",
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  mono?: boolean;
  muted?: boolean;
  className?: string;
}) {
  return (
    <td
      className={`px-4 py-2.5 text-xs ${
        align === "right" ? "text-right" : align === "center" ? "text-center" : "text-left"
      } ${mono ? "tabular-nums font-medium" : ""} ${className}`}
      style={{ color: muted ? "var(--soc-text-muted)" : "var(--soc-text)" }}
    >
      {children}
    </td>
  );
}

export function ExecEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="soc-body text-sm py-8 text-center" style={{ color: "var(--soc-text-muted)" }}>
      {children}
    </p>
  );
}
