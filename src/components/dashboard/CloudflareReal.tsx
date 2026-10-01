import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  LineChart,
  Line,
} from "recharts";
import {
  getCloudflareAnalytics,
  triggerCloudflareSync,
  listCloudflareZones,
  syncCloudflareZone,
} from "@/lib/cloudflare.functions";
import {
  GripHorizontal,
  Maximize2,
  Minimize2,
  RotateCcw,
  Check,
  ChevronsUpDown,
  Globe,
  Shield,
  Zap,
  TrendingUp,
  AlertTriangle,
  Activity,
  RefreshCw,
  Server,
  Link2,
  BarChart2,
  SkipForward,
  Clock,
  Filter,
  X,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OperationsTab } from "@/components/dashboard/cloudflare/OperationsTab";
import { AnalyticsTab } from "@/components/dashboard/cloudflare/AnalyticsTab";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { usePermissions } from "@/lib/use-permissions";
import { CronHealthBadge } from "@/components/dashboard/CronHealthBadge";

const STORAGE_KEY = "cloudflare_dashboard_layout_densegrid_final_v7";

interface DashboardBlock {
  id: string;
  title: string;
  size: string;
}

// ── Design Tokens — Executive Dark Intelligence ────────────────────────────────
const T = {
  bg: "#0A0D14",
  surface: "#0F1420",
  surfaceAlt: "#131825",
  surfaceHover: "#161C2E",
  border: "#1E2640",
  borderHi: "#2A3560",

  accent: "#3B82F6",
  accentGlow: "rgba(59,130,246,0.15)",
  accentSoft: "rgba(59,130,246,0.08)",

  success: "#10B981",
  successBg: "rgba(16,185,129,0.10)",
  warning: "#F59E0B",
  warningBg: "rgba(245,158,11,0.10)",
  danger: "#EF4444",
  dangerBg: "rgba(239,68,68,0.10)",
  purple: "#A78BFA",
  purpleBg: "rgba(167,139,250,0.10)",
  neutral: "#6B7280",

  textPrimary: "#F1F5F9",
  textSecondary: "#F1F5F9",
  textMuted: "#F1F5F9",

  chartGrid: "rgba(30,38,64,0.7)",
  chartAxis: "#F1F5F9",
  chartTick: "#F1F5F9",
};

// ── Action palette ─────────────────────────────────────────────────────────────
const ACTION_TONE: Record<string, "danger" | "warning" | "accent" | "success"> = {
  block: "danger",
  challenge: "warning",
  managed_challenge: "warning",
  jschallenge: "warning",
  js_challenge: "warning",
  log: "accent",
  skip: "success",
  allow: "success",
};

const ACTION_COLOR: Record<string, { bg: string; color: string; border: string }> = {
  danger: { bg: T.dangerBg, color: T.danger, border: "rgba(239,68,68,0.25)" },
  warning: { bg: T.warningBg, color: T.warning, border: "rgba(245,158,11,0.25)" },
  accent: { bg: T.accentSoft, color: T.accent, border: "rgba(59,130,246,0.25)" },
  success: { bg: T.successBg, color: T.success, border: "rgba(16,185,129,0.25)" },
};

const COUNTRY_ISO: Record<string, string> = {
  Brazil: "BR",
  "United States": "US",
  "United Kingdom": "GB",
  Germany: "DE",
  France: "FR",
  Spain: "ES",
  Italy: "IT",
  Portugal: "PT",
  Russia: "RU",
  China: "CN",
  Japan: "JP",
  Netherlands: "NL",
  Sweden: "SE",
  Norway: "NO",
  Finland: "FI",
  Denmark: "DK",
  Poland: "PL",
};

// ── Inline CSS ─────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');

  .cf-root { font-family:'DM Sans',sans-serif; color:${T.textPrimary}; }
  .cf-root * { box-sizing:border-box; }

  /* ── Tabs ── */
  .cf-tabs-bar { display:flex; align-items:center; gap:2px; padding:4px; background:${T.surface}; border:1px solid ${T.border}; border-radius:8px; width:fit-content; }
  .cf-tab-btn { padding:6px 16px; border-radius:6px; font-size:12px; font-weight:600; border:none; cursor:pointer; font-family:'DM Sans',sans-serif; transition:all 0.15s; color:${T.textMuted}; background:transparent; }
  .cf-tab-btn.active { background:${T.accentGlow}; color:${T.accent}; border:1px solid rgba(59,130,246,0.25); }
  .cf-tab-btn:hover:not(.active) { color:${T.textSecondary}; background:rgba(255,255,255,0.04); }

  /* ── Toolbar ── */
  .cf-toolbar { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; padding:14px 20px; background:${T.surface}; border:1px solid ${T.border}; border-radius:10px; }
  .cf-toolbar-group { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }

  .cf-day-btn { padding:5px 14px; border-radius:6px; font-size:11px; font-weight:600; border:1px solid ${T.border}; cursor:pointer; font-family:'IBM Plex Mono',monospace; transition:all 0.15s; color:${T.textMuted}; background:transparent; letter-spacing:0.04em; }
  .cf-day-btn.active { background:${T.accentGlow}; border-color:rgba(59,130,246,0.4); color:${T.accent}; }
  .cf-day-btn:hover:not(.active) { border-color:${T.borderHi}; color:${T.textSecondary}; }

  .cf-sync-btn { display:inline-flex; align-items:center; gap:6px; padding:6px 14px; background:${T.accentGlow}; border:1px solid rgba(59,130,246,0.35); border-radius:6px; font-size:11px; font-weight:600; color:${T.accent}; cursor:pointer; font-family:'DM Sans',sans-serif; transition:all 0.15s; }
  .cf-sync-btn:hover:not(:disabled) { background:rgba(59,130,246,0.2); box-shadow:0 0 16px rgba(59,130,246,0.12); }
  .cf-sync-btn:disabled { opacity:0.45; cursor:not-allowed; }

  .cf-reset-btn { display:inline-flex; align-items:center; gap:5px; padding:6px 12px; background:transparent; border:1px solid rgba(239,68,68,0.25); border-radius:6px; font-size:11px; font-weight:600; color:${T.danger}; cursor:pointer; font-family:'DM Sans',sans-serif; transition:all 0.15s; }
  .cf-reset-btn:hover { background:${T.dangerBg}; }

  .cf-filter-chip { display:inline-flex; align-items:center; gap:5px; padding:4px 10px; border-radius:5px; font-size:11px; font-weight:500; border:1px solid ${T.borderHi}; cursor:pointer; font-family:'IBM Plex Mono',monospace; color:${T.warning}; background:${T.warningBg}; transition:all 0.15s; }
  .cf-filter-chip:hover { border-color:${T.warning}; }
  .cf-filter-chip .close { opacity:0.6; }
  .cf-filter-chip:hover .close { opacity:1; }

  .cf-zone-btn { display:inline-flex; align-items:center; justify-content:space-between; gap:8px; padding:5px 12px; border:1px solid ${T.border}; border-radius:6px; background:${T.surfaceAlt}; font-size:11px; color:${T.textPrimary}; cursor:pointer; min-width:200px; font-family:'DM Sans',sans-serif; transition:border-color 0.15s; }
  .cf-zone-btn:hover { border-color:${T.borderHi}; }
  .cf-zone-live { display:inline-flex; align-items:center; gap:5px; padding:3px 8px; border-radius:4px; font-size:10px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; font-family:'IBM Plex Mono',monospace; background:${T.accentSoft}; color:${T.accent}; border:1px solid rgba(59,130,246,0.25); }

  /* ── Block card ── */
  .cf-block { background:${T.surface}; border:1px solid ${T.border}; border-radius:10px; display:flex; flex-direction:column; min-width:200px; min-height:140px; resize:vertical; overflow:auto; transition:border-color 0.2s,box-shadow 0.2s; }
  .cf-block:hover { border-color:${T.borderHi}; }
  .cf-block.dragging { opacity:0.2; border:1px dashed ${T.accent}; }

  .cf-block-header { display:flex; align-items:center; justify-content:space-between; padding:10px 16px; background:${T.surfaceAlt}; border-bottom:1px solid ${T.border}; cursor:grab; user-select:none; flex-shrink:0; border-radius:10px 10px 0 0; }
  .cf-block-header:active { cursor:grabbing; }
  .cf-block-title { display:flex; align-items:center; gap:7px; font-size:11px; font-weight:600; color:${T.textPrimary}; text-transform:uppercase; letter-spacing:0.09em; font-family:'IBM Plex Mono',monospace; }
  .cf-block-title-icon { color:${T.textMuted}; opacity:0.5; }

  .cf-resize-ctrl { display:flex; align-items:center; gap:2px; opacity:0; transition:opacity 0.15s; }
  .cf-block:hover .cf-resize-ctrl { opacity:1; }
  .cf-resize-btn { padding:2px; border:none; background:transparent; color:${T.textMuted}; cursor:pointer; border-radius:3px; line-height:0; transition:color 0.15s,background 0.15s; }
  .cf-resize-btn:hover { color:${T.textPrimary}; background:rgba(255,255,255,0.07); }

  .cf-block-body { flex:1; padding:16px; display:flex; flex-direction:column; }
  .cf-block-body-scroll { flex:1; overflow:auto; max-height:240px; }

  /* ── KPI row ── */
  .cf-kpi-grid { display:grid; grid-template-columns:repeat(6,1fr); gap:12px; width:100%; }
  .cf-kpi { background:${T.surfaceAlt}; border:1px solid ${T.border}; border-radius:8px; padding:16px 18px; display:flex; flex-direction:column; gap:5px; position:relative; overflow:hidden; }
  .cf-kpi::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; background:var(--kc,${T.accent}); }
  .cf-kpi-label { font-size:9px; font-weight:700; letter-spacing:0.14em; text-transform:uppercase; color:${T.textPrimary}; font-family:'IBM Plex Mono',monospace; text-align:center;}
  .cf-kpi-value { font-size:24px; font-weight:700; font-family:'Space Grotesk',sans-serif; letter-spacing:-0.02em; line-height:1; color:var(--kc,${T.textPrimary}); text-align:center;}

  /* ── Table ── */
  .cf-table { width:100%; border-collapse:collapse; }
  .cf-table th { padding:6px 10px; font-size:9px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:${T.textPrimary}; font-family:'IBM Plex Mono',monospace; text-align:left; border-bottom:1px solid ${T.border}; }
  .cf-table td { padding:8px 10px; border-bottom:1px solid rgba(30,38,64,0.45); font-size:12px; color:${T.textPrimary}; vertical-align:middle; }
  .cf-table tbody tr:hover td { background:rgba(59,130,246,0.04); }
  .cf-table tbody tr:last-child td { border-bottom:none; }
  .cf-table .mono { font-family:'IBM Plex Mono',monospace; font-size:11px; }
  .cf-table .dim { color:${T.textPrimary}; }
  .cf-table .right { text-align:right; }
  .cf-table .clickrow { cursor:pointer; }
  .cf-table .selected td { background:rgba(59,130,246,0.07); }

  /* ── Badge ── */
  .cf-badge { display:inline-flex; align-items:center; gap:3px; padding:2px 7px; border-radius:4px; font-size:10px; font-weight:700; letter-spacing:0.07em; text-transform:uppercase; font-family:'IBM Plex Mono',monospace; white-space:nowrap; }
  .cf-badge-dot { width:5px; height:5px; border-radius:50%; flex-shrink:0; }

  /* ── Proxy bar ── */
  .cf-proxy-row { display:flex; align-items:center; justify-content:space-between; margin-bottom:6px; }
  .cf-proxy-label { font-size:11px; color:${T.textPrimary}; }
  .cf-proxy-val { font-size:13px; font-weight:600; font-family:'IBM Plex Mono',monospace; }
  .cf-progress-track { height:5px; background:rgba(59,130,246,0.08); border-radius:3px; overflow:hidden; margin-bottom:14px; }
  .cf-progress-fill { height:100%; border-radius:3px; transition:width 0.6s ease; }

  /* ── Loading / Error states ── */
  .cf-state-box { padding:32px 24px; background:${T.surface}; border:1px solid ${T.border}; border-radius:10px; display:flex; flex-direction:column; align-items:center; gap:10px; text-align:center; }
  .cf-state-icon { width:40px; height:40px; border-radius:8px; display:flex; align-items:center; justify-content:center; }

  /* ── Pulse ── */
  @keyframes pulse-ring { 0%{box-shadow:0 0 0 0 rgba(16,185,129,0.5)} 70%{box-shadow:0 0 0 6px rgba(16,185,129,0)} 100%{box-shadow:0 0 0 0 rgba(16,185,129,0)} }
  .live-dot { width:6px; height:6px; border-radius:50%; background:${T.success}; animation:pulse-ring 2s infinite; flex-shrink:0; }

  /* ── Spin ── */
  @keyframes exec-spin { to{transform:rotate(360deg)} }
  .exec-spin { animation:exec-spin 0.8s linear infinite; }

  /* ── Scrollbar ── */
  .cf-root ::-webkit-scrollbar { width:4px; height:4px; }
  .cf-root ::-webkit-scrollbar-track { background:transparent; }
  .cf-root ::-webkit-scrollbar-thumb { background:${T.borderHi}; border-radius:2px; }

  /* ── Tooltip ── */
  .cf-tip { background:${T.surface}; border:1px solid ${T.borderHi}; border-radius:8px; padding:10px 14px; font-family:'DM Sans',sans-serif; box-shadow:0 20px 40px rgba(0,0,0,0.5); min-width:150px; }
  .cf-tip-label { font-size:10px; font-family:'IBM Plex Mono',monospace; color:${T.textMuted}; text-transform:uppercase; letter-spacing:0.08em; margin-bottom:6px; }
  .cf-tip-row { display:flex; align-items:center; gap:6px; font-size:12px; margin-bottom:3px; }
  .cf-tip-dot { width:7px; height:7px; border-radius:2px; flex-shrink:0; }
  .cf-tip-name { color:${T.textSecondary}; font-size:11px; }
  .cf-tip-val { color:${T.textPrimary}; font-weight:600; font-family:'IBM Plex Mono',monospace; margin-left:auto; }
  .cf-tip-divider { border-top:1px solid ${T.border}; margin:7px 0; }
  .cf-tip-sub { font-size:10px; font-family:'IBM Plex Mono',monospace; color:${T.textMuted}; margin-bottom:5px; }

  /* ── Section label ── */
  .cf-section-header { padding:0 0 16px 0; display:flex; align-items:center; gap:8px; }
  .cf-section-title { font-size:11px; font-weight:700; letter-spacing:0.12em; text-transform:uppercase; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; }

  /* ── Chart legend ── */
  .recharts-legend-item-text { color:${T.textSecondary} !important; font-size:11px; font-family:'IBM Plex Mono',monospace; }
  .recharts-cartesian-axis-tick-value { fill:${T.chartTick} !important; font-size:10px; font-family:'IBM Plex Mono',monospace; }
  .recharts-text { fill:${T.chartTick} !important; }
  .recharts-label { fill:${T.textSecondary} !important; font-size:11px; font-family:'IBM Plex Mono',monospace; }
`;

// ── Utilities ──────────────────────────────────────────────────────────────────

function getFlagUrl(countryInput: string) {
  if (!countryInput) return "https://flagcdn.com/w40/un.png";
  if (countryInput.length === 2) return `https://flagcdn.com/w40/${countryInput.toLowerCase()}.png`;
  const iso = COUNTRY_ISO[countryInput]?.toLowerCase();
  return iso ? `https://flagcdn.com/w40/${iso}.png` : "https://flagcdn.com/w40/un.png";
}

function Flag({ name }: { name: string }) {
  return (
    <img
      src={getFlagUrl(name)}
      alt={name}
      style={{
        display: "inline-block",
        width: 16,
        height: 12,
        objectFit: "cover",
        borderRadius: 2,
        marginRight: 6,
        marginBottom: 1,
        boxShadow: "0 1px 3px rgba(0,0,0,0.4)",
        flexShrink: 0,
      }}
      onError={(e) => (e.currentTarget.style.display = "none")}
    />
  );
}

function fmtNum(n: number) {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 10_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("pt-BR");
}

function SafeHourDateTime(iso: string, formatType: "hour" | "full") {
  if (!iso) return "";
  const d = new Date(iso);
  return formatType === "hour"
    ? d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit" })
    : d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

function ExecBadge({ action }: { action: string }) {
  const tone = ACTION_TONE[(action || "").toLowerCase()] ?? "accent";
  const col = ACTION_COLOR[tone];
  return (
    <span className="cf-badge" style={{ background: col.bg, color: col.color, border: `1px solid ${col.border}` }}>
      <span className="cf-badge-dot" style={{ background: col.color }} />
      {action || "LOG"}
    </span>
  );
}

// ── Custom Tooltip ─────────────────────────────────────────────────────────────
function ExecTrafficTooltip({ active, payload, label, hostsByBucket }: any) {
  if (!active || !payload?.length) return null;
  const hosts: Array<{ host: string; count: number }> = hostsByBucket?.[label] ?? [];
  return (
    <div className="cf-tip">
      <div className="cf-tip-label">{SafeHourDateTime(String(label), "full")}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="cf-tip-row">
          <div className="cf-tip-dot" style={{ background: p.color }} />
          <span className="cf-tip-name">{p.name}</span>
          <span className="cf-tip-val">{fmtNum(Number(p.value))}</span>
        </div>
      ))}
      {hosts.length > 0 && (
        <>
          <div className="cf-tip-divider" />
          <div className="cf-tip-sub">Top FQDN</div>
          {hosts.map((h) => (
            <div key={h.host} className="cf-tip-row">
              <span
                className="cf-tip-name"
                style={{
                  fontFamily: "'IBM Plex Mono',monospace",
                  fontSize: 10,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  maxWidth: 180,
                }}
              >
                {h.host}
              </span>
              <span className="cf-tip-val">{fmtNum(h.count)}</span>
            </div>
          ))}
        </>
      )}
    </div>
  );
}

function ExecGenericTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="cf-tip">
      <div className="cf-tip-label">{SafeHourDateTime(String(label), "full")}</div>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="cf-tip-row">
          <div className="cf-tip-dot" style={{ background: p.color }} />
          <span className="cf-tip-name">{p.name}</span>
          <span className="cf-tip-val">{fmtNum(Number(p.value))}</span>
        </div>
      ))}
    </div>
  );
}

// ── Block header ───────────────────────────────────────────────────────────────
function BlockHeader({
  id,
  title,
  icon: Icon,
  showResize = true,
  onGrow,
  onShrink,
}: {
  id: string;
  title: React.ReactNode;
  icon?: React.ElementType;
  showResize?: boolean;
  onGrow?: () => void;
  onShrink?: () => void;
}) {
  return (
    <div className="cf-block-header">
      <div className="cf-block-title">
        <GripHorizontal size={11} color={T.textMuted} />
        {Icon && <Icon size={12} color={T.textMuted} />}
        <span>{title}</span>
      </div>
      {showResize && (
        <div className="cf-resize-ctrl">
          <button className="cf-resize-btn" onClick={onShrink} title="Diminuir">
            <Minimize2 size={11} />
          </button>
          <button className="cf-resize-btn" onClick={onGrow} title="Aumentar">
            <Maximize2 size={11} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Empty micro state ──────────────────────────────────────────────────────────
function EmptyRow({ message }: { message: string }) {
  return (
    <div
      style={{
        padding: "28px 16px",
        textAlign: "center",
        color: T.textMuted,
        fontSize: 12,
        fontFamily: "'DM Sans',sans-serif",
      }}
    >
      {message}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN DASHBOARD
// ══════════════════════════════════════════════════════════════════════════════
export function CloudflareDashboardReal() {
  const { can, isModuleAdmin, isAdmin, loading: permLoading } = usePermissions();
  const canManageCf = isAdmin || isModuleAdmin("cloudflare-waf") || can("cloudflare-waf", "manage");
  const canViewCf = isAdmin || isModuleAdmin("cloudflare-waf") || can("cloudflare-waf", "view");
  const canSyncCf = isAdmin || isModuleAdmin("cloudflare-waf") || can("cloudflare-waf", "execute");
  const canAnalyticsHttp = isAdmin || isModuleAdmin("cloudflare-waf") || can("cloudflare-waf", "view_analytics_http");
  const canAnalyticsSecurity =
    isAdmin || isModuleAdmin("cloudflare-waf") || can("cloudflare-waf", "view_analytics_security");
  const canAnalytics = canAnalyticsHttp || canAnalyticsSecurity;
  const [days, setDays] = React.useState(3);
  const [selectedCountry, setSelectedCountry] = React.useState<string | null>(null);
  const [activeTab, setActiveTab] = React.useState<string>(() => {
    try {
      return localStorage.getItem("cloudflare_active_tab") ?? "dashboard";
    } catch {
      return "dashboard";
    }
  });

  function handleTabChange(value: string) {
    setActiveTab(value);
    try {
      localStorage.setItem("cloudflare_active_tab", value);
    } catch {}
  }

  React.useEffect(() => {
    if (permLoading) return;
    if (canManageCf && !canViewCf) {
      setActiveTab("operations");
    } else if (!canViewCf && !canManageCf && canAnalytics) {
      setActiveTab("analytics");
    }
  }, [permLoading, canManageCf, canViewCf, canAnalytics]);

  const [selectedAction, setSelectedAction] = React.useState<string | null>(null);
  const [draggedId, setDraggedId] = React.useState<string | null>(null);
  const [syncing, setSyncing] = React.useState(false);
  const [selectedZoneId, setSelectedZoneId] = React.useState<string | null>(() => {
    try {
      return localStorage.getItem("cloudflare_selected_zone") || null;
    } catch {
      return null;
    }
  });
  const [zonePopoverOpen, setZonePopoverOpen] = React.useState(false);

  // ── QUERIES — UNCHANGED ────────────────────────────────────────────────────
  const fetchZones = useServerFn(listCloudflareZones);
  const { data: zonesData } = useQuery({
    queryKey: ["cloudflare-zones-list"],
    queryFn: () => fetchZones(),
  });
  const zones = ((zonesData as any)?.zones ?? []) as Array<{ id: string; name: string; status: string | null }>;

  React.useEffect(() => {
    if (zones.length === 0) return;
    if (selectedZoneId) return;
    const bernoulli = zones.find((z) => z.name.includes("bernoulli.com.br"));
    if (bernoulli) persistZone(bernoulli.id);
  }, [zones]);

  const selectedZone = zones.find((z) => z.id === selectedZoneId) || null;
  const syncZoneFn = useServerFn(syncCloudflareZone);

  function persistZone(id: string | null) {
    setSelectedZoneId(id);
    try {
      if (id) localStorage.setItem("cloudflare_selected_zone", id);
      else localStorage.removeItem("cloudflare_selected_zone");
    } catch {}
  }

  async function handleZoneSelect(id: string) {
    persistZone(id);
    setZonePopoverOpen(false);
    const zName = zones.find((z) => z.id === id)?.name ?? id;
    const tid = toast.loading(`Sincronizando ${zName}…`);
    try {
      const res = await syncZoneFn({ data: { zoneId: id } });
      if ("ok" in res && res.ok) {
        toast.success(`Sync de ${zName}: ${res.dnsRecords} DNS, ${res.firewallEvents} eventos`, { id: tid });
        refetch();
      } else {
        toast.error("Falha no sync: " + (res as any).error, { id: tid });
      }
    } catch (e) {
      toast.error((e as Error).message, { id: tid });
    }
  }

  const [blocks, setBlocks] = React.useState<DashboardBlock[]>([
    { id: "kpis", title: "Métricas Gerais (KPIs)", size: "col-span-1 md:col-span-2 lg:col-span-6" },
    { id: "proxy", title: "Proxy Cloudflare", size: "col-span-1 md:col-span-1 lg:col-span-2" },
    { id: "hosts", title: "Top 10 Hosts", size: "col-span-1 md:col-span-1 lg:col-span-2" },
    { id: "security", title: "Top 10 Security Actions", size: "col-span-1 md:col-span-1 lg:col-span-2" },
    { id: "countries", title: "Países de Origem", size: "col-span-1 md:col-span-2 lg:col-span-3" },
    { id: "urls", title: "URLs mais Requisitadas", size: "col-span-1 md:col-span-2 lg:col-span-3" },
    { id: "ips", title: "Top IPs de origem", size: "col-span-1 md:col-span-1 lg:col-span-2" },
    { id: "traffic", title: "Traffic Analyser — evolução", size: "col-span-1 md:col-span-1 lg:col-span-2" },
    { id: "attack", title: "Attack Analyser — evolução", size: "col-span-1 md:col-span-1 lg:col-span-2" },
    { id: "skip", title: "Requisições em Skip — evolução", size: "col-span-1 md:col-span-2 lg:col-span-3" },
    { id: "skip-hosts", title: "Top Hosts em Skip", size: "col-span-1 md:col-span-2 lg:col-span-3" },
    { id: "history", title: "Histórico Local", size: "col-span-1 md:col-span-2 lg:col-span-3" },
    { id: "logs", title: "Sample Logs (Firewall)", size: "col-span-1 md:col-span-2 lg:col-span-3" },
  ]);

  const fetchAnalytics = useServerFn(getCloudflareAnalytics);
  const triggerSync = useServerFn(triggerCloudflareSync);
  const { data, isLoading, error, refetch, isFetching } = useQuery({
    queryKey: ["cloudflare-analytics", days, selectedAction, selectedZoneId],
    enabled: canViewCf,
    queryFn: () => fetchAnalytics({ data: { days, action: selectedAction, zoneId: selectedZoneId } }),
  });

  async function handleSync() {
    setSyncing(true);
    try {
      const res = await triggerSync({ data: { fullResync: false } });
      if ("ok" in res && res.ok) {
        toast.success(`Sync concluído: ${res.zones} zonas, ${res.dnsRecords} DNS, ${res.firewallEvents} eventos.`);
        refetch();
      } else {
        toast.error("Falha no sync: " + (res as any).error);
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSyncing(false);
    }
  }

  React.useEffect(() => {
    const savedLayout = localStorage.getItem(STORAGE_KEY);
    if (savedLayout) {
      try {
        const saved = JSON.parse(savedLayout) as DashboardBlock[];
        setBlocks((prev) => {
          const savedIds = new Set(saved.map((b) => b.id));
          const missing = prev.filter((b) => !savedIds.has(b.id));
          return [...saved, ...missing];
        });
      } catch {
        console.error("Layout resetado.");
      }
    }
  }, []);

  const saveLayout = (currentBlocks = blocks) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(currentBlocks));
  };

  const resetLayout = () => {
    localStorage.removeItem(STORAGE_KEY);
    window.location.reload();
  };

  const changeBlockSize = (id: string, action: "grow" | "shrink") => {
    const nextBlocks = blocks.map((b) => {
      if (b.id !== id) return b;
      let size = b.size;
      if (action === "grow") {
        if (size.includes("lg:col-span-2")) size = "col-span-1 md:col-span-2 lg:col-span-3";
        else if (size.includes("lg:col-span-3")) size = "col-span-1 md:col-span-2 lg:col-span-6";
      } else {
        if (size.includes("lg:col-span-6")) size = "col-span-1 md:col-span-2 lg:col-span-3";
        else if (size.includes("lg:col-span-3")) size = "col-span-1 md:col-span-1 lg:col-span-2";
      }
      return { ...b, size };
    });
    setBlocks(nextBlocks);
    saveLayout(nextBlocks);
  };

  // ── Derived data ───────────────────────────────────────────────────────────
  const d = (data as any) ?? null;
  const mitigationRate = d?.totals?.requests > 0 ? (d.totals.mitigated / d.totals.requests) * 100 : 0;
  const proxyTotal = (d?.proxy?.proxied ?? 0) + (d?.proxy?.unproxied ?? 0);
  const proxyRate = proxyTotal > 0 ? ((d.proxy?.proxied ?? 0) / proxyTotal) * 100 : 0;

  const filteredLogs = selectedCountry
    ? (d?.sampleLogs || []).filter((l: any) => l.country === selectedCountry)
    : d?.sampleLogs || [];
  const filteredIps = selectedCountry
    ? (d?.topIps || []).filter((i: any) => i.country === selectedCountry)
    : d?.topIps || [];

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;
    const currentIdx = blocks.findIndex((b) => b.id === draggedId);
    const targetIdx = blocks.findIndex((b) => b.id === targetId);
    const newBlocks = [...blocks];
    const [removed] = newBlocks.splice(currentIdx, 1);
    newBlocks.splice(targetIdx, 0, removed);
    setBlocks(newBlocks);
    saveLayout(newBlocks);
  };

  // ── BLOCK ICON MAP ─────────────────────────────────────────────────────────
  const BLOCK_ICONS: Record<string, React.ElementType> = {
    kpis: Zap,
    proxy: Server,
    hosts: Globe,
    security: Shield,
    countries: Globe,
    urls: Link2,
    ips: Activity,
    traffic: TrendingUp,
    attack: AlertTriangle,
    skip: SkipForward,
    "skip-hosts": SkipForward,
    history: Clock,
    logs: Filter,
  };

  // ── CHART SHARED PROPS ─────────────────────────────────────────────────────
  const axisProps = {
    stroke: T.chartAxis,
    fontSize: 10,
    tick: { fill: T.chartTick, fontFamily: "'IBM Plex Mono',monospace" },
    tickLine: false,
    axisLine: { stroke: T.chartAxis },
  };

  // ── RENDER ─────────────────────────────────────────────────────────────────
  return (
    <div className="cf-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 20 }}>
        {/* ── Tabs ─────────────────────────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div className="cf-tabs-bar">
            {canViewCf && (
              <button
                className={`cf-tab-btn${activeTab === "dashboard" ? " active" : ""}`}
                onClick={() => handleTabChange("dashboard")}
              >
                Dashboard
              </button>
            )}
            {canAnalytics && (
              <button
                className={`cf-tab-btn${activeTab === "analytics" ? " active" : ""}`}
                onClick={() => handleTabChange("analytics")}
              >
                Analytics
              </button>
            )}
            {canManageCf && (
              <button
                className={`cf-tab-btn${activeTab === "operations" ? " active" : ""}`}
                onClick={() => handleTabChange("operations")}
              >
                Operações
              </button>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <div className="live-dot" />
            <span
              style={{
                fontSize: 10,
                color: T.success,
                fontFamily: "'IBM Plex Mono',monospace",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
              }}
            >
              Live
            </span>
          </div>
        </div>

        {/* ── Analytics Tab content ────────────────────────────────────────── */}
        {canAnalytics && activeTab === "analytics" && <AnalyticsTab />}

        {/* ── Operations Tab content ───────────────────────────────────────── */}
        {canManageCf && activeTab === "operations" && <OperationsTab />}

        {/* ── Dashboard Tab content ────────────────────────────────────────── */}
        {canViewCf && activeTab === "dashboard" && (
          <>
            {isLoading ? (
              <div className="cf-state-box">
                <div
                  className="cf-state-icon"
                  style={{ background: T.accentGlow, border: `1px solid rgba(59,130,246,0.3)` }}
                >
                  <RefreshCw size={18} color={T.accent} className="exec-spin" />
                </div>
                <span style={{ fontSize: 13, color: T.textSecondary, fontFamily: "'DM Sans',sans-serif" }}>
                  Sincronizando dados Bernoulli com a Cloudflare…
                </span>
              </div>
            ) : error || (d && !d.ok) ? (
              <div className="cf-state-box">
                <div
                  className="cf-state-icon"
                  style={{ background: T.dangerBg, border: `1px solid rgba(239,68,68,0.3)` }}
                >
                  <AlertTriangle size={18} color={T.danger} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 600, color: T.danger }}>
                  Erro crítico na comunicação com a API Cloudflare
                </span>
                <span style={{ fontSize: 11, color: T.textMuted, fontFamily: "'IBM Plex Mono',monospace" }}>
                  {d && !d.ok ? d.error : ((error as Error)?.message ?? "Erro desconhecido")}
                </span>
              </div>
            ) : (
              <>
                {/* Toolbar */}
                <div className="cf-toolbar">
                  <div className="cf-toolbar-group">
                    {/* Day selector */}
                    {[1, 2, 3].map((n) => (
                      <button key={n} className={`cf-day-btn${days === n ? " active" : ""}`} onClick={() => setDays(n)}>
                        {n === 1 ? "24h" : `${n}d`}
                      </button>
                    ))}

                    {/* Sync — restrito a admin global ou admin do módulo */}
                    {canSyncCf && (
                      <button className="cf-sync-btn" onClick={handleSync} disabled={syncing || isFetching}>
                        <RefreshCw size={12} className={syncing ? "exec-spin" : ""} />
                        {syncing ? "Sincronizando…" : "Sincronizar Agora"}
                      </button>
                    )}

                    <CronHealthBadge jobName="cloudflare-daily-sync" moduleSlug="cloudflare-waf" />

                    {/* Zone picker */}
                    <Popover open={zonePopoverOpen} onOpenChange={setZonePopoverOpen}>
                      <PopoverTrigger asChild>
                        <button className="cf-zone-btn" role="combobox" aria-expanded={zonePopoverOpen}>
                          <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                            {selectedZone ? selectedZone.name : "bernoulli.com.br"}
                          </span>
                          <ChevronsUpDown size={12} color={T.textMuted} />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent
                        style={{
                          width: 300,
                          padding: 0,
                          background: T.surface,
                          border: `1px solid ${T.borderHi}`,
                          borderRadius: 8,
                          boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
                        }}
                        align="start"
                      >
                        <Command style={{ background: "transparent" }}>
                          <CommandInput
                            placeholder="Buscar zona…"
                            style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 12 }}
                          />
                          <CommandList>
                            <CommandEmpty style={{ color: T.textMuted, fontSize: 12, padding: 12 }}>
                              Nenhuma zona encontrada.
                            </CommandEmpty>
                            <CommandGroup>
                              {zones.map((z) => (
                                <CommandItem
                                  key={z.id}
                                  value={z.name}
                                  onSelect={() => handleZoneSelect(z.id)}
                                  style={{ fontFamily: "'DM Sans',sans-serif", fontSize: 12, color: T.textPrimary }}
                                >
                                  <Check
                                    size={14}
                                    style={{ opacity: selectedZoneId === z.id ? 1 : 0, color: T.success }}
                                  />
                                  <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>{z.name}</span>
                                  {z.status && (
                                    <span
                                      style={{
                                        marginLeft: "auto",
                                        fontSize: 10,
                                        color: T.textMuted,
                                        fontFamily: "'IBM Plex Mono',monospace",
                                      }}
                                    >
                                      {z.status}
                                    </span>
                                  )}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>

                    {/* Live zone badge */}
                    {selectedZone && (
                      <span className="cf-zone-live">
                        <div className="live-dot" style={{ width: 5, height: 5 }} />
                        {selectedZone.name}
                      </span>
                    )}

                    {/* Active filters */}
                    {selectedCountry && (
                      <button className="cf-filter-chip" onClick={() => setSelectedCountry(null)}>
                        <Flag name={selectedCountry} />
                        {selectedCountry}
                        <X size={10} className="close" />
                      </button>
                    )}
                    {selectedAction && (
                      <button className="cf-filter-chip" onClick={() => setSelectedAction(null)}>
                        <Filter size={10} />
                        {selectedAction}
                        <X size={10} className="close" />
                      </button>
                    )}
                  </div>

                  {/* Reset layout */}
                  <button className="cf-reset-btn" onClick={resetLayout}>
                    <RotateCcw size={12} />
                    Restaurar Layout
                  </button>
                </div>

                {/* ── Grid ─────────────────────────────────────────────────────── */}
                <div
                  className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4"
                  style={{ gridAutoFlow: "row dense" }}
                >
                  {blocks.map((block: DashboardBlock) => {
                    const BlockIcon = BLOCK_ICONS[block.id] ?? Activity;
                    const isDragging = draggedId === block.id;
                    const blockCls = `${block.size} cf-block${isDragging ? " dragging" : ""}`;
                    const header = (showResize = true) => (
                      <BlockHeader
                        id={block.id}
                        title={block.title}
                        icon={BlockIcon}
                        showResize={showResize}
                        onGrow={() => changeBlockSize(block.id, "grow")}
                        onShrink={() => changeBlockSize(block.id, "shrink")}
                      />
                    );
                    const dragProps = {
                      draggable: true,
                      onDragStart: () => setDraggedId(block.id),
                      onDragOver: (e: React.DragEvent) => handleDragOver(e, block.id),
                      onDragEnd: () => setDraggedId(null),
                    };

                    /* ── KPIs ─────────────────────────────────────────────────── */
                    if (block.id === "kpis" && d?.totals) {
                      return (
                        <div key={block.id} {...dragProps} className={blockCls}>
                          {header(false)}
                          <div className="cf-block-body">
                            <div className="cf-kpi-grid">
                              {[
                                { label: "Domínios", value: String(d.domains?.zones || 0), color: T.accent },
                                { label: "Subdomínios", value: String(d.domains?.subdomains || 0), color: T.accent },
                                { label: "Requisições", value: fmtNum(d.totals.requests), color: T.accent },
                                { label: "Cacheadas", value: fmtNum(d.totals.cached), color: T.success },
                                { label: "Mitigadas", value: fmtNum(d.totals.mitigated), color: T.danger },
                                { label: "Taxa Mitigação", value: `${mitigationRate.toFixed(2)}%`, color: T.warning },
                              ].map(({ label, value, color }) => (
                                <div key={label} className="cf-kpi" style={{ "--kc": color } as React.CSSProperties}>
                                  <span className="cf-kpi-label">{label}</span>
                                  <span className="cf-kpi-value">{value}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      );
                    }

                    /* ── PROXY ────────────────────────────────────────────────── */
                    if (block.id === "proxy" && d?.proxy) {
                      return (
                        <div key={block.id} {...dragProps} className={blockCls}>
                          {header()}
                          <div className="cf-block-body" style={{ justifyContent: "center", gap: 2, minHeight: 140 }}>
                            <div className="cf-proxy-row">
                              <span className="cf-proxy-label">Proxy Ativo</span>
                              <span className="cf-proxy-val" style={{ color: T.success }}>
                                {fmtNum(d.proxy.proxied)}{" "}
                                <span style={{ color: T.textMuted, fontSize: 11 }}>({proxyRate.toFixed(1)}%)</span>
                              </span>
                            </div>
                            <div className="cf-progress-track">
                              <div
                                className="cf-progress-fill"
                                style={{ width: `${proxyRate}%`, background: T.success }}
                              />
                            </div>
                            <div className="cf-proxy-row">
                              <span className="cf-proxy-label">Direto / Desativado</span>
                              <span className="cf-proxy-val" style={{ color: T.textMuted }}>
                                {fmtNum(d.proxy.unproxied)}
                              </span>
                            </div>
                            <p
                              style={{
                                fontSize: 11,
                                color: T.textMuted,
                                marginTop: 8,
                                fontFamily: "'DM Sans',sans-serif",
                              }}
                            >
                              IPs únicos:{" "}
                              <strong style={{ color: T.textPrimary }}>{fmtNum(d.totals?.uniqueIps || 0)}</strong>
                            </p>
                          </div>
                        </div>
                      );
                    }

                    /* ── HOSTS ────────────────────────────────────────────────── */
                    if (block.id === "hosts" && d?.topHosts) {
                      return (
                        <div key={block.id} {...dragProps} className={blockCls}>
                          {header()}
                          <div style={{ flex: 1, overflow: "auto", maxHeight: 220 }}>
                            <table className="cf-table">
                              <tbody>
                                {d.topHosts.slice(0, 10).map((r: any, i: number) => (
                                  <tr key={i}>
                                    <td
                                      className="mono dim"
                                      style={{
                                        maxWidth: 150,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {r.host}
                                    </td>
                                    <td className="mono right">{fmtNum(r.requests)}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    }

                    /* ── SECURITY ─────────────────────────────────────────────── */
                    if (block.id === "security" && d?.securityActions) {
                      return (
                        <div key={block.id} {...dragProps} className={blockCls}>
                          {header()}
                          <div style={{ flex: 1, overflow: "auto", maxHeight: 220 }}>
                            <table className="cf-table">
                              <tbody>
                                {d.securityActions.slice(0, 10).map((a: any, i: number) => (
                                  <tr
                                    key={i}
                                    className={`clickrow${selectedAction === a.action ? " selected" : ""}`}
                                    onClick={() => setSelectedAction(selectedAction === a.action ? null : a.action)}
                                  >
                                    <td>
                                      <ExecBadge action={a.action} />
                                    </td>
                                    <td className="mono right" style={{ color: T.textSecondary }}>
                                      {fmtNum(a.count)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    }

                    /* ── COUNTRIES ────────────────────────────────────────────── */
                    if (block.id === "countries" && d?.topCountries) {
                      return (
                        <div key={block.id} {...dragProps} className={blockCls}>
                          {header()}
                          <div style={{ flex: 1, overflow: "auto", maxHeight: 240 }}>
                            <table className="cf-table">
                              <tbody>
                                {d.topCountries.map((c: any, i: number) => (
                                  <tr key={i} className="clickrow" onClick={() => setSelectedCountry(c.country)}>
                                    <td style={{ display: "flex", alignItems: "center" }}>
                                      <Flag name={c.country} />
                                      <span
                                        style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
                                      >
                                        {c.country}
                                      </span>
                                    </td>
                                    <td className="mono right" style={{ color: T.textSecondary }}>
                                      {fmtNum(c.requests)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    }

                    /* ── URLS ─────────────────────────────────────────────────── */
                    if (block.id === "urls" && d?.topUrls) {
                      return (
                        <div key={block.id} {...dragProps} className={blockCls}>
                          {header()}
                          <div style={{ flex: 1, overflow: "auto", maxHeight: 240 }}>
                            <table className="cf-table">
                              <thead>
                                <tr>
                                  <th>Host</th>
                                  <th>Path</th>
                                  <th style={{ textAlign: "right" }}>Req.</th>
                                </tr>
                              </thead>
                              <tbody>
                                {d.topUrls.map((r: any, i: number) => (
                                  <tr key={i}>
                                    <td
                                      className="mono dim"
                                      style={{
                                        maxWidth: 110,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {r.host}
                                    </td>
                                    <td
                                      className="mono dim"
                                      style={{
                                        maxWidth: 120,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {r.path}
                                    </td>
                                    <td className="mono right" style={{ color: T.textSecondary }}>
                                      {fmtNum(r.requests)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    }

                    /* ── IPS ──────────────────────────────────────────────────── */
                    if (block.id === "ips" && filteredIps) {
                      return (
                        <div key={block.id} {...dragProps} className={blockCls}>
                          {header()}
                          <div style={{ flex: 1, overflow: "auto", maxHeight: 240 }}>
                            <table className="cf-table">
                              <thead>
                                <tr>
                                  <th>IP</th>
                                  <th>País</th>
                                  <th style={{ textAlign: "right" }}>Req.</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredIps.map((r: any, i: number) => (
                                  <tr key={i}>
                                    <td className="mono" style={{ color: T.textSecondary }}>
                                      {r.ip}
                                    </td>
                                    <td style={{ display: "flex", alignItems: "center" }}>
                                      <Flag name={r.country} />
                                      <span
                                        style={{
                                          overflow: "hidden",
                                          textOverflow: "ellipsis",
                                          whiteSpace: "nowrap",
                                          fontSize: 11,
                                        }}
                                      >
                                        {r.country}
                                      </span>
                                    </td>
                                    <td className="mono right" style={{ color: T.textMuted }}>
                                      {fmtNum(r.requests)}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    }

                    /* ── TRAFFIC ──────────────────────────────────────────────── */
                    if (block.id === "traffic" && d?.timeseries) {
                      return (
                        <div key={block.id} {...dragProps} className={blockCls}>
                          {header()}
                          <div className="cf-block-body" style={{ minHeight: 250 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={d.timeseries} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                                <defs>
                                  <linearGradient id="cf-req" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={T.accent} stopOpacity={0.35} />
                                    <stop offset="100%" stopColor={T.accent} stopOpacity={0.02} />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="2 4" stroke={T.chartGrid} vertical={false} />
                                <XAxis dataKey="t" {...axisProps} tickFormatter={(v) => SafeHourDateTime(v, "hour")} />
                                <YAxis {...axisProps} axisLine={false} tickFormatter={(v) => fmtNum(Number(v))} />
                                <Tooltip
                                  content={<ExecTrafficTooltip hostsByBucket={d?.hostsByBucket ?? {}} />}
                                  cursor={{ fill: "rgba(59,130,246,0.05)" }}
                                />
                                <Legend
                                  wrapperStyle={{
                                    fontSize: 11,
                                    fontFamily: "'IBM Plex Mono',monospace",
                                    color: T.textPrimary,
                                  }}
                                />
                                <Area
                                  type="monotone"
                                  dataKey="requests"
                                  stroke={T.accent}
                                  fill="url(#cf-req)"
                                  strokeWidth={2}
                                  name="Requisições"
                                  dot={false}
                                  activeDot={{ r: 3, fill: T.accent, stroke: T.surface, strokeWidth: 2 }}
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      );
                    }

                    /* ── ATTACK ───────────────────────────────────────────────── */
                    if (block.id === "attack" && d?.timeseries) {
                      return (
                        <div key={block.id} {...dragProps} className={blockCls}>
                          {header()}
                          <div className="cf-block-body" style={{ minHeight: 230 }}>
                            <ResponsiveContainer width="100%" height="100%">
                              <AreaChart data={d.timeseries} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                                <defs>
                                  <linearGradient id="cf-mit" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="0%" stopColor={T.danger} stopOpacity={0.35} />
                                    <stop offset="100%" stopColor={T.danger} stopOpacity={0.02} />
                                  </linearGradient>
                                </defs>
                                <CartesianGrid strokeDasharray="2 4" stroke={T.chartGrid} vertical={false} />
                                <XAxis dataKey="t" {...axisProps} tickFormatter={(v) => SafeHourDateTime(v, "hour")} />
                                <YAxis {...axisProps} axisLine={false} tickFormatter={(v) => fmtNum(Number(v))} />
                                <Tooltip
                                  content={<ExecTrafficTooltip hostsByBucket={d?.hostsByBucket ?? {}} />}
                                  cursor={{ fill: "rgba(239,68,68,0.05)" }}
                                />
                                <Legend
                                  wrapperStyle={{
                                    fontSize: 11,
                                    fontFamily: "'IBM Plex Mono',monospace",
                                    color: T.textPrimary,
                                  }}
                                />
                                <Area
                                  type="monotone"
                                  dataKey="mitigated"
                                  stroke={T.danger}
                                  fill="url(#cf-mit)"
                                  strokeWidth={2}
                                  name="Mitigadas"
                                  dot={false}
                                  activeDot={{ r: 3, fill: T.danger, stroke: T.surface, strokeWidth: 2 }}
                                />
                              </AreaChart>
                            </ResponsiveContainer>
                          </div>
                        </div>
                      );
                    }

                    /* ── SKIP series ──────────────────────────────────────────── */
                    if (block.id === "skip" && d?.timeseries) {
                      const hasSkip = d.timeseries.some((p: any) => Number(p.skip) > 0);
                      return (
                        <div key={block.id} {...dragProps} className={blockCls}>
                          {header()}
                          <div className="cf-block-body" style={{ minHeight: 230 }}>
                            {hasSkip ? (
                              <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={d.timeseries} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                                  <defs>
                                    <linearGradient id="cf-skip" x1="0" y1="0" x2="0" y2="1">
                                      <stop offset="0%" stopColor={T.success} stopOpacity={0.35} />
                                      <stop offset="100%" stopColor={T.success} stopOpacity={0.02} />
                                    </linearGradient>
                                  </defs>
                                  <CartesianGrid strokeDasharray="2 4" stroke={T.chartGrid} vertical={false} />
                                  <XAxis
                                    dataKey="t"
                                    {...axisProps}
                                    tickFormatter={(v) => SafeHourDateTime(v, "hour")}
                                  />
                                  <YAxis {...axisProps} axisLine={false} tickFormatter={(v) => fmtNum(Number(v))} />
                                  <Tooltip
                                    content={<ExecTrafficTooltip hostsByBucket={d?.hostsByBucket ?? {}} />}
                                    cursor={{ fill: "rgba(16,185,129,0.05)" }}
                                  />
                                  <Legend wrapperStyle={{ fontSize: 11, fontFamily: "'IBM Plex Mono',monospace" }} />
                                  <Area
                                    type="monotone"
                                    dataKey="skip"
                                    stroke={T.success}
                                    fill="url(#cf-skip)"
                                    strokeWidth={2}
                                    name="Skip"
                                    dot={false}
                                    activeDot={{ r: 3, fill: T.success, stroke: T.surface, strokeWidth: 2 }}
                                  />
                                </AreaChart>
                              </ResponsiveContainer>
                            ) : (
                              <EmptyRow message="Sem requisições em Skip no período." />
                            )}
                          </div>
                        </div>
                      );
                    }

                    /* ── SKIP top hosts ───────────────────────────────────────── */
                    if (block.id === "skip-hosts") {
                      const rows = (d?.skipByHost ?? []) as Array<{ host: string; count: number }>;
                      return (
                        <div key={block.id} {...dragProps} className={blockCls}>
                          {header()}
                          <div style={{ flex: 1, overflow: "auto", maxHeight: 340 }}>
                            {rows.length === 0 ? (
                              <EmptyRow message="Sem hosts em Skip no período." />
                            ) : (
                              <table className="cf-table">
                                <tbody>
                                  {rows.map((r, i) => (
                                    <tr key={i}>
                                      <td
                                        className="mono dim"
                                        style={{
                                          maxWidth: 260,
                                          overflow: "hidden",
                                          textOverflow: "ellipsis",
                                          whiteSpace: "nowrap",
                                        }}
                                      >
                                        {r.host}
                                      </td>
                                      <td className="mono right" style={{ color: T.success }}>
                                        {fmtNum(r.count)}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            )}
                          </div>
                        </div>
                      );
                    }

                    /* ── HISTORY ──────────────────────────────────────────────── */
                    if (block.id === "history" && d?.history) {
                      return (
                        <div key={block.id} {...dragProps} className={blockCls}>
                          {header()}
                          <div className="cf-block-body" style={{ minHeight: 230 }}>
                            {d.history.length > 1 ? (
                              <ResponsiveContainer width="100%" height="100%">
                                <LineChart data={d.history} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                                  <CartesianGrid strokeDasharray="2 4" stroke={T.chartGrid} vertical={false} />
                                  <XAxis
                                    dataKey="captured_at"
                                    {...axisProps}
                                    tickFormatter={(v) => SafeHourDateTime(v, "hour")}
                                  />
                                  <YAxis {...axisProps} axisLine={false} tickFormatter={(v) => fmtNum(Number(v))} />
                                  <Tooltip
                                    content={<ExecGenericTooltip />}
                                    cursor={{ stroke: T.borderHi, strokeWidth: 1 }}
                                  />
                                  <Legend wrapperStyle={{ fontSize: 11, fontFamily: "'IBM Plex Mono',monospace" }} />
                                  <Line
                                    type="monotone"
                                    dataKey="requests"
                                    stroke={T.accent}
                                    strokeWidth={2}
                                    dot={false}
                                    name="Requisições"
                                    activeDot={{ r: 3 }}
                                  />
                                  <Line
                                    type="monotone"
                                    dataKey="mitigated"
                                    stroke={T.danger}
                                    strokeWidth={2}
                                    dot={false}
                                    name="Mitigadas"
                                    activeDot={{ r: 3 }}
                                  />
                                  <Line
                                    type="monotone"
                                    dataKey="skip"
                                    stroke={T.success}
                                    strokeWidth={2}
                                    dot={false}
                                    name="Skip"
                                    activeDot={{ r: 3 }}
                                  />
                                </LineChart>
                              </ResponsiveContainer>
                            ) : (
                              <EmptyRow message="Histórico local insuficiente." />
                            )}
                          </div>
                        </div>
                      );
                    }

                    /* ── LOGS ─────────────────────────────────────────────────── */
                    if (block.id === "logs" && filteredLogs) {
                      return (
                        <div key={block.id} {...dragProps} className={blockCls}>
                          {header()}
                          <div style={{ flex: 1, overflow: "auto", maxHeight: 340 }}>
                            <table className="cf-table" style={{ borderCollapse: "separate", borderSpacing: 0 }}>
                              <thead style={{ position: "sticky", top: 0, zIndex: 20 }}>
                                <tr>
                                  <th style={{ background: T.surface, paddingLeft: 16 }}>Data</th>
                                  <th style={{ background: T.surface }}>Action</th>
                                  <th style={{ background: T.surface }}>Path</th>
                                </tr>
                              </thead>
                              <tbody>
                                {filteredLogs.map((l: any, i: number) => (
                                  <tr key={i}>
                                    <td className="mono dim" style={{ paddingLeft: 16, whiteSpace: "nowrap" }}>
                                      {SafeHourDateTime(l.datetime, "full")}
                                    </td>
                                    <td>
                                      <ExecBadge action={l.action} />
                                    </td>
                                    <td
                                      className="mono dim"
                                      style={{
                                        maxWidth: 150,
                                        overflow: "hidden",
                                        textOverflow: "ellipsis",
                                        whiteSpace: "nowrap",
                                      }}
                                    >
                                      {l.path}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      );
                    }

                    return null;
                  })}
                </div>
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}
