import * as React from "react";
import { GmudDashboardTab } from "./gmud/DashboardTab";
import { GmudOperationsTab } from "./gmud/OperationsTab";
import { usePermissions } from "@/lib/use-permissions";
import { LayoutDashboard, Settings2 } from "lucide-react";
import { CronHealthBadge } from "./CronHealthBadge";

// ── Design Tokens — mesma paleta dos outros dashboards ─────────────────────────
const T = {
  surface: "#0F1420",
  surfaceAlt: "#131825",
  border: "#1E2640",
  accent: "#3B82F6",
  accentGlow: "rgba(59,130,246,0.15)",
  accentSoft: "rgba(59,130,246,0.08)",
  success: "#10B981",
  textPrimary: "#F1F5F9",
  textSecondary: "#94A3B8",
  textMuted: "#64748B",
};

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,500;9..40,600;9..40,700&family=IBM+Plex+Mono:wght@500;600&display=swap');

  .gmud-root { font-family:'DM Sans',sans-serif; color:${T.textPrimary}; display:flex; flex-direction:column; gap:16px; }
  .gmud-root * { box-sizing:border-box; }

  /* Live dot */
  @keyframes gmud-pulse { 0%,100%{box-shadow:0 0 0 0 rgba(16,185,129,0.45)} 50%{box-shadow:0 0 0 5px rgba(16,185,129,0)} }
  .gmud-live-dot { width:6px; height:6px; border-radius:50%; background:${T.success}; animation:gmud-pulse 2s infinite; flex-shrink:0; }

  /* Tabs bar */
  .gmud-tabs-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-wrap: wrap;
  }
  .gmud-tabs-group {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 4px;
    background: ${T.surface};
    border: 1px solid ${T.border};
    border-radius: 8px;
  }
  .gmud-tab {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 16px;
    border-radius: 6px;
    border: none;
    background: transparent;
    font-size: 12px;
    font-weight: 600;
    font-family: 'DM Sans', sans-serif;
    color: ${T.textMuted};
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
    letter-spacing: 0.01em;
  }
  .gmud-tab:hover:not(.active) {
    color: ${T.textSecondary};
    background: rgba(255,255,255,0.04);
  }
  .gmud-tab.active {
    background: ${T.accentGlow};
    color: ${T.accent};
    border: 1px solid rgba(59,130,246,0.25);
  }
  .gmud-tab-icon {
    opacity: 0.7;
  }
  .gmud-tab.active .gmud-tab-icon {
    opacity: 1;
  }

  /* Meta */
  .gmud-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 10px;
    color: ${T.textMuted};
    font-family: 'IBM Plex Mono', monospace;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  /* Content wrapper */
  .gmud-content { margin-top: 4px; }

  /* Scrollbar */
  .gmud-root ::-webkit-scrollbar       { width: 4px; height: 4px; }
  .gmud-root ::-webkit-scrollbar-track { background: transparent; }
  .gmud-root ::-webkit-scrollbar-thumb { background: #2A3560; border-radius: 2px; }
`;

export function GmudDashboard() {
  // ── logic UNCHANGED ────────────────────────────────────────────────────────
  const { can, isAdmin, isModuleAdmin } = usePermissions();
  const canViewDashboard = isAdmin || isModuleAdmin("gmud") || can("gmud", "view");

  const [activeTab, setActiveTab] = React.useState<"dashboard" | "operacoes">(
    canViewDashboard ? "dashboard" : "operacoes",
  );

  return (
    <div className="gmud-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Tabs bar ──────────────────────────────────────────────────── */}
      <div className="gmud-tabs-bar">
        <div className="gmud-tabs-group">
          {canViewDashboard && (
            <button
              className={`gmud-tab${activeTab === "dashboard" ? " active" : ""}`}
              onClick={() => setActiveTab("dashboard")}
            >
              <LayoutDashboard size={13} className="gmud-tab-icon" />
              Dashboard
            </button>
          )}
          <button
            className={`gmud-tab${activeTab === "operacoes" ? " active" : ""}`}
            onClick={() => setActiveTab("operacoes")}
          >
            <Settings2 size={13} className="gmud-tab-icon" />
            Operações
          </button>
        </div>

        <div className="gmud-meta">
          <div className="gmud-live-dot" />
          <span>GMUD · Gestão de Mudanças</span>
          <CronHealthBadge jobName="gmud-escalate-inactive" moduleSlug="gmud" />
        </div>
      </div>

      {/* ── Content ───────────────────────────────────────────────────── */}
      <div className="gmud-content">
        {canViewDashboard && activeTab === "dashboard" && <GmudDashboardTab />}
        {activeTab === "operacoes" && <GmudOperationsTab />}
      </div>
    </div>
  );
}
