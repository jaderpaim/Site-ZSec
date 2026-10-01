import * as React from "react";
import { LayoutDashboard, Settings2 } from "lucide-react";
import { usePermissions } from "@/lib/use-permissions";
import { BenchmarkDashboardTab } from "./benchmark/DashboardTab";
import { BenchmarkOperationsTab } from "./benchmark/OperationsTab";

const T = {
  surface: "#0F1420",
  border: "#1E2640",
  accent: "#3B82F6",
  accentGlow: "rgba(59,130,246,0.15)",
  success: "#10B981",
  textPrimary: "#F1F5F9",
  textSecondary: "#94A3B8",
  textMuted: "#64748B",
};

const CSS = `
  .bmk-root { font-family:'DM Sans',sans-serif; color:${T.textPrimary}; display:flex; flex-direction:column; gap:16px; }
  .bmk-root * { box-sizing:border-box; }
  @keyframes bmk-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,0.45)} 50%{box-shadow:0 0 0 5px rgba(16,185,129,0)} }
  .bmk-live-dot { width:6px; height:6px; border-radius:50%; background:${T.success}; animation:bmk-pulse 2s infinite; flex-shrink:0; }
  .bmk-tabs-bar { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; }
  .bmk-tabs-group { display:flex; align-items:center; gap:4px; padding:4px; background:${T.surface}; border:1px solid ${T.border}; border-radius:8px; }
  .bmk-tab { display:inline-flex; align-items:center; gap:6px; padding:7px 16px; border-radius:6px; border:none; background:transparent;
    font-size:12px; font-weight:600; font-family:'DM Sans',sans-serif; color:${T.textMuted}; cursor:pointer; transition:all .15s; white-space:nowrap; }
  .bmk-tab:hover:not(.active) { color:${T.textSecondary}; background:rgba(255,255,255,0.04); }
  .bmk-tab.active { background:${T.accentGlow}; color:${T.accent}; border:1px solid rgba(59,130,246,0.25); }
  .bmk-meta { display:flex; align-items:center; gap:8px; font-size:10px; color:${T.textMuted};
    font-family:'IBM Plex Mono',monospace; letter-spacing:.06em; text-transform:uppercase; }
`;

export function BenchmarkDashboard() {
  const { can, isModuleAdmin } = usePermissions();
  // Benchmark é módulo exclusivo: sem bypass geral de isAdmin — isModuleAdmin/can
  // já sabem respeitar isso (ver src/lib/exclusive-modules.ts).
  const canManage = isModuleAdmin("benchmark") || can("benchmark", "manage");
  const [tab, setTab] = React.useState<"dashboard" | "operacoes">("dashboard");

  return (
    <div className="bmk-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="bmk-tabs-bar">
        <div className="bmk-tabs-group">
          <button className={`bmk-tab${tab === "dashboard" ? " active" : ""}`} onClick={() => setTab("dashboard")}>
            <LayoutDashboard size={13} />
            Dashboard
          </button>
          {canManage && (
            <button className={`bmk-tab${tab === "operacoes" ? " active" : ""}`} onClick={() => setTab("operacoes")}>
              <Settings2 size={13} />
              Operações
            </button>
          )}
        </div>
        <div className="bmk-meta">
          <div className="bmk-live-dot" />
          <span>Benchmark · Comparações de Mercado</span>
        </div>
      </div>

      <div>
        {tab === "dashboard" && <BenchmarkDashboardTab />}
        {tab === "operacoes" && canManage && <BenchmarkOperationsTab />}
      </div>
    </div>
  );
}
