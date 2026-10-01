import type { ReactNode, CSSProperties } from "react";

export function ExecPanel({
  title,
  action,
  children,
  className = "",
  delay = 0,
  bodyClassName = "",
}: {
  title?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  delay?: number;
  bodyClassName?: string;
}) {
  const style: CSSProperties = {
    background: "var(--soc-surface)",
    border: "1px solid var(--soc-border)",
    boxShadow: "var(--soc-shadow)",
    animationDelay: `${delay}ms`,
  };
  return (
    <div className={`soc-stagger-in rounded-xl overflow-hidden ${className}`} style={style}>
      {title && (
        <div
          className="flex items-center justify-between px-7 py-4"
          style={{ borderBottom: "1px solid var(--soc-border)" }}
        >
          <h3 className="soc-display text-base uppercase tracking-wider font-semibold" style={{ color: "var(--soc-text)" }}>
            {title}
          </h3>
          {action}
        </div>
      )}
      <div className={`p-7 ${bodyClassName}`}>{children}</div>
    </div>
  );
}
