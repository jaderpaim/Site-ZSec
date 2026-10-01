import type { ReactNode } from "react";
import "./soc-theme.css";

export function SocShell({ children }: { children: ReactNode }) {
  return (
    <div className="soc-scope min-h-full p-6 lg:p-8 -m-4 lg:-m-6 rounded-none">
      <div className="space-y-6">{children}</div>
    </div>
  );
}
