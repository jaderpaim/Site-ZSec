import * as React from "react";
import { useIsFetching, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import {
  listCloudflareZones,
  searchDnsRecords,
  purgeCache,
  createDnsRecord,
  updateDnsRecord,
  getCacheStatus,
  listCustomRules,
  createCustomRule,
  updateCustomRule,
} from "@/lib/cloudflare.functions";
import {
  getRulesOverview,
  createRedirectRule,
  updateRedirectRule,
  deleteRedirectRule,
  deleteCacheRule,
  createOverviewRule,
  updateOverviewRule,
  deleteOverviewRule,
  reorderOverviewRule,
  GENERIC_CRUD_CATEGORIES,
  type RuleCategoryKey,
  type GenericCrudCategory,
  listPageRules,
  createPageRule,
  updatePageRule,
  togglePageRule,
  deletePageRule,
  reorderPageRules,
  type RuleCategoryResult,
  type OverviewRule,
  type PageRule,
  type PageRuleSettingDef,
  type PageRuleSettingValue,
  PAGE_RULE_SETTINGS,
} from "@/lib/cloudflare.rules.functions";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Switch } from "@/components/ui/switch";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import {
  Search,
  RefreshCw,
  Copy,
  Trash2,
  Plus,
  Globe,
  ShieldCheck,
  X,
  Loader2,
  Database,
  ChevronDown,
  Check,
  Pencil,
  Power,
  Shield,
  ArrowUp,
  MoreHorizontal,
  ArrowDown,
  Info,
  BookOpen,
  Lock,
  AlertTriangle,
  Download,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { usePermissions } from "@/lib/use-permissions";
import { SharedZoneContext } from "./shared-zone";
import { DetailList, DetailSection, DetailSheet } from "@/components/layout/DetailSheet";

// ── Design Tokens (same as CloudflareReal) ────────────────────────────────────
const T = {
  bg: "var(--tl-0a0d14, #0A0D14)",
  surface: "var(--tl-0f1420, #0F1420)",
  surfaceAlt: "var(--tl-131825, #131825)",
  border: "var(--tl-1e2640, #1E2640)",
  borderHi: "var(--tl-2a3560, #2A3560)",
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
  cyan: "#22D3EE",
  cyanBg: "rgba(34,211,238,0.10)",
  orange: "#FB923C",
  orangeBg: "rgba(251,146,60,0.10)",
  neutral: "var(--tl-6b7280, #6B7280)",
  textPrimary: "var(--tl-f1f5f9, #F1F5F9)",
  textSecondary: "var(--tl-f1f5f9, #F1F5F9)",
  textMuted: "var(--tl-f1f5f9, #F1F5F9)",
  textSubtle: "var(--tl-f1f5f9, #F1F5F9)",
};

// Moldura da interface v2 (mesmos nomes do T; os gráficos continuam no T)
const V2 = {
  surfaceAlt: "var(--v2-surface-2)",
  surface: "var(--v2-surface)",
  borderHi: "var(--v2-line-strong)",
  border: "var(--v2-line)",
  textPrimary: "var(--v2-fg)",
  textSecondary: "var(--v2-fg-2)",
  textMuted: "var(--v2-fg-3)",
  textSubtle: "var(--v2-fg-3)",
  textDim: "var(--v2-fg-3)",
};

// ── Inline CSS ─────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700&family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');

  .ops-root { font-family:var(--font-ui); color:var(--v2-fg); }
  .ops-root * { box-sizing:border-box; }

  /* ── Block card ── */
  .ops-block { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:10px; display:flex; flex-direction:column; min-width:220px; min-height:160px; resize:vertical; overflow:auto; transition:border-color 0.2s; }
  .ops-block:hover { border-color:var(--v2-line-strong); }
  .ops-block.dragging { opacity:0.2; border:1px dashed ${T.accent}; }

  .ops-block-header { display:flex; align-items:center; justify-content:space-between; padding:10px 16px; background:var(--v2-surface-2); border-bottom:1px solid var(--v2-line); cursor:grab; user-select:none; flex-shrink:0; border-radius:10px 10px 0 0; }
  .ops-block-header:active { cursor:grabbing; }
  .ops-block-title { display:flex; align-items:center; gap:7px; font-size:12px; font-weight:500; color:var(--v2-fg);   font-family:var(--font-ui); }

  .ops-resize-ctrl { display:flex; align-items:center; gap:2px; opacity:0; transition:opacity 0.15s; }
  .ops-block:hover .ops-resize-ctrl { opacity:1; }
  .ops-resize-btn { padding:2px; border:none; background:transparent; color:var(--v2-fg-3); cursor:pointer; border-radius:3px; line-height:0; transition:color 0.15s,background 0.15s; }
  .ops-resize-btn:hover { color:var(--v2-fg); background:rgba(var(--tl-ink, 255,255,255),0.07); }

  .ops-block-body { flex:1; padding:16px 20px; display:flex; flex-direction:column; gap:14px; overflow:auto; }

  /* ── Section title inside block ── */
  .ops-subnav { display:flex; align-items:center; gap:4px; flex-wrap:wrap; border-bottom:1px solid var(--v2-line); }
  .ops-subnav-btn { display:inline-flex; align-items:center; gap:6px; height:36px; padding:0 12px; margin-bottom:-1px; font-size:13.5px; font-weight:500; border:0; border-bottom:2px solid transparent; cursor:pointer; font-family:var(--font-ui); color:var(--v2-fg-2); background:transparent; }
  .ops-subnav-btn:hover:not(.active):not(:disabled) { color:var(--v2-fg); }
  .ops-subnav-btn.active { color:var(--v2-fg); border-bottom-color:var(--v2-accent); }
  .ops-subnav-btn:disabled { opacity:0.4; cursor:not-allowed; }
  .ops-cards { display:grid; grid-template-columns:repeat(2, minmax(0, 1fr)); gap:20px; }
  .ops-cards.one { grid-template-columns:minmax(0, 1fr); }
  @media (max-width: 1100px) { .ops-cards { grid-template-columns:minmax(0, 1fr); } }
  .ops-card { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; display:flex; flex-direction:column; min-width:0; }
  .ops-card-h { display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; padding:16px 18px 8px; }
  .ops-card-h > div { display:flex; align-items:baseline; gap:4px 10px; flex-wrap:wrap; min-width:0; }
  .ops-card-title { font-size:14px; font-weight:600; color:var(--v2-fg); margin:0; }
  .ops-card-desc { margin:0; font-size:12.5px; color:var(--v2-fg-3); }
  .ops-card-body { padding:8px 18px 18px; flex:1; min-width:0; display:flex; flex-direction:column; gap:14px; }
  .ops-card-body .ops-field .ops-hint { margin-top:0; }
  /* O título interno de cada ferramenta vira o título do cartão */
  .ops-card .ops-section-title { display:none; }
  .ops-card-btn { display:inline-flex; align-items:center; gap:7px; height:32px; padding:0 12px; border-radius:8px; font-size:13px; font-weight:500; font-family:var(--font-ui); cursor:pointer; white-space:nowrap; border:1px solid var(--v2-accent); background:var(--v2-accent); color:var(--v2-accent-ink); }
  .ops-card-btn:hover { filter:brightness(1.08); }
  .ops-zone-bar { display:flex; align-items:flex-end; gap:12px; flex-wrap:wrap; padding:14px 18px; background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; }
  .ops-zone-bar > div { min-width:260px; flex:0 1 360px; }
  .ops-section-title { display:flex; align-items:center; gap:8px; padding-bottom:10px; border-bottom:1px solid var(--v2-line); margin-bottom:2px; }
  .ops-section-title-text { font-size:13px; font-weight:600; color:var(--v2-fg); font-family:var(--font-ui); }

  /* ── Toolbar ── */
  .ops-toolbar { display:flex; align-items:center; justify-content:flex-end; padding:10px 16px; background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:10px; }
  .ops-reset-btn { display:inline-flex; align-items:center; gap:5px; padding:6px 12px; background:transparent; border:1px solid rgba(239,68,68,0.25); border-radius:6px; font-size:11px; font-weight:600; color:${T.danger}; cursor:pointer; font-family:var(--font-ui); transition:all 0.15s; }
  .ops-reset-btn:hover { background:${T.dangerBg}; }

  /* ── Form field ── */
  .ops-field { display:flex; flex-direction:column; gap:5px; }
  .ops-label { font-size:12.5px; font-weight:500; color:var(--v2-fg-2); font-family:var(--font-ui); }

  /* ── Input override ── */
  .ops-root input, .ops-root textarea, .ops-root select {
    background:var(--v2-bg) !important;
    border-color:var(--v2-line) !important;
    color:var(--v2-fg) !important;
    font-family:var(--font-ui) !important;
    font-size:13px !important;
    border-radius:8px !important;
  }
  .ops-root input:focus, .ops-root textarea:focus {
    border-color:var(--v2-accent) !important;
    outline:none !important;
    box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent) !important;
  }
  .ops-root input::placeholder, .ops-root textarea::placeholder { color:var(--v2-fg-3) !important; }

  /* ── SearchableSelect trigger ── */
  .ops-select-trigger { display:flex; width:100%; align-items:center; justify-content:space-between; min-height:34px; border-radius:8px; border:1px solid var(--v2-line); background:var(--v2-bg); padding:0 10px; font-size:13px; font-family:var(--font-ui); color:var(--v2-fg); cursor:pointer; transition:border-color 0.15s; }
  .ops-select-trigger:hover:not(:disabled) { border-color:var(--v2-line-strong); }
  .ops-select-trigger:disabled { opacity:0.45; cursor:not-allowed; }
  .ops-select-trigger.open { border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }

  .ops-select-popover { background:var(--v2-surface); border:1px solid var(--v2-line-strong); border-radius:8px; box-shadow:0 20px 40px rgba(0,0,0,0.5); overflow:hidden; }
  .ops-select-search { display:flex; align-items:center; gap:8px; padding:8px 12px; border-bottom:1px solid var(--v2-line); background:var(--v2-surface-2); }
  .ops-select-search input { background:transparent !important; border:none !important; box-shadow:none !important; font-size:12px; color:var(--v2-fg); outline:none; width:100%; }
  .ops-select-list { max-height:220px; overflow-y:auto; }
  .ops-select-opt { display:flex; align-items:center; justify-content:space-between; padding:8px 12px; font-size:12px; font-family:'IBM Plex Mono',monospace; color:var(--v2-fg); cursor:pointer; transition:background 0.1s; }
  .ops-select-opt:hover { background:var(--v2-hover); color:var(--v2-fg); }
  .ops-select-opt.selected { background:color-mix(in oklch, var(--v2-accent) 10%, transparent); color:var(--v2-fg); font-weight:500; }
  .ops-select-footer { padding:5px 12px; border-top:1px solid var(--v2-line); background:var(--v2-surface-2); font-size:10px; color:var(--v2-fg-3); font-family:'IBM Plex Mono',monospace; }
  .ops-select-empty { padding:20px; text-align:center; font-size:12px; color:var(--v2-fg); font-family:var(--font-ui); }

  /* ── Day selector ── */
  .ops-day-btn { height:30px; padding:0 12px; border-radius:7px; font-size:13px; font-weight:500; border:1px solid var(--v2-line); cursor:pointer; font-family:var(--font-ui); transition:all 0.15s; color:var(--v2-fg-2); background:var(--v2-surface); }
  .ops-day-btn.active { background:var(--v2-surface-2); border-color:var(--v2-line-strong); color:var(--v2-fg); box-shadow:inset 0 0 0 1px var(--v2-line); }
  .ops-day-btn:hover:not(.active) { border-color:var(--v2-line-strong); color:var(--v2-fg-2); }

  /* ── Rules submenu (Overview / Page Rules) ── */
  .ops-subtabs { display:flex; align-items:center; gap:2px; border-bottom:1px solid var(--v2-line); padding-bottom:0; }
  .ops-subtab { height:34px; padding:0 12px; font-size:13px; font-weight:500; border:0; border-bottom:2px solid transparent; cursor:pointer; font-family:var(--font-ui); color:var(--v2-fg-2); background:transparent; margin-bottom:-1px; }
  .ops-subtab.active { color:var(--v2-fg); border-bottom-color:var(--v2-accent); }
  .ops-subtab:hover:not(.active) { color:var(--v2-fg-2); }
  .ops-subtab:disabled { opacity:0.4; cursor:not-allowed; }
  .ops-subtab:disabled:hover { color:var(--v2-fg-3); }

  /* ── Rule category card (Rules → Overview) ── */
  .ops-rule-cat { border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; background:var(--v2-surface); }
  .ops-rule-cat-header { display:flex; align-items:center; justify-content:space-between; padding:12px 16px; border-bottom:1px solid var(--v2-line); gap:10px; flex-wrap:wrap; }
  .ops-rule-cat-title { display:flex; align-items:center; gap:8px; font-size:13.5px; font-weight:600; color:var(--v2-fg); font-family:var(--font-ui); }
  .ops-rule-cat-count { font-size:11.5px; font-weight:500; color:var(--v2-fg-3); font-family:var(--font-data); padding:1px 7px; border-radius:99px; background:var(--v2-surface-2); }
  .ops-rule-status-active { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; background:color-mix(in oklch, var(--v2-ok) 14%, transparent); color:color-mix(in oklch, var(--v2-ok) 72%, var(--v2-fg)); }
  .ops-rule-status-active::before { content:''; width:6px; height:6px; border-radius:50%; background:var(--v2-ok); }
  .ops-rule-status-disabled { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; background:color-mix(in oklch, var(--v2-fg-3) 14%, transparent); color:var(--v2-fg-2); }

  /* ── Exec button ── */
  .ops-btn { display:inline-flex; align-items:center; justify-content:center; gap:7px; height:34px; padding:0 14px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; font-family:var(--font-ui); transition:background 0.15s, border-color 0.15s, filter 0.15s; border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-fg); white-space:nowrap; }
  .ops-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .ops-btn:hover:not(:disabled) { background:var(--v2-hover); }
  .ops-btn.primary { background:var(--v2-accent); border-color:var(--v2-accent); color:var(--v2-accent-ink); }
  .ops-btn.primary:hover:not(:disabled) { background:var(--v2-accent); filter:brightness(1.08); }
  .ops-btn.success { background:var(--v2-accent); border-color:var(--v2-accent); color:var(--v2-accent-ink); }
  .ops-btn.success:hover:not(:disabled) { background:var(--v2-accent); filter:brightness(1.08); }
  .ops-btn.danger { background:var(--v2-surface); border-color:color-mix(in oklch, var(--v2-crit) 45%, var(--v2-line)); color:var(--v2-crit); }
  .ops-btn.danger:hover:not(:disabled) { background:color-mix(in oklch, var(--v2-crit) 8%, var(--v2-surface)); }
  .ops-btn.outline { background:var(--v2-surface); border:1px solid var(--v2-line); color:var(--v2-fg); }
  .ops-btn.outline:hover:not(:disabled) { background:var(--v2-hover); border-color:var(--v2-line-strong); }
  .ops-btn.full { width:100%; }
  .ops-btn.sm { height:28px; padding:0 10px; font-size:12.5px; }
  .ops-btn.ghost { background:transparent; border-color:transparent; color:var(--v2-fg-2); height:28px; padding:0 8px; border-radius:6px; }
  .ops-btn.ghost:hover:not(:disabled) { background:var(--v2-hover); color:var(--v2-fg); }

  /* ── Table ── */
  .ops-table-wrap { border:1px solid var(--v2-line); border-radius:8px; overflow:auto; max-height:360px; }
  .ops-table-wrap.flat { border:0; border-radius:12px 12px 0 0; max-height:560px; }
  .ops-table-foot { padding:10px 16px; border-top:1px solid var(--v2-line); font-size:12.5px; color:var(--v2-fg-3); }
  .ops-table { width:100%; border-collapse:separate; border-spacing:0; font-size:13px; }
  .ops-table thead { position:sticky; top:0; z-index:20; }
  .ops-table th { padding:10px 14px; font-size:12.5px; font-weight:500; color:var(--v2-fg-3); font-family:var(--font-ui); text-align:left; background:var(--v2-surface); border-bottom:1px solid var(--v2-line); white-space:nowrap; }
  .ops-table td { padding:10px 14px; border-bottom:1px solid var(--v2-line); color:var(--v2-fg); vertical-align:middle; }
  .ops-table tbody tr:hover td { background:var(--v2-hover); }
  .ops-table tbody tr:last-child td { border-bottom:none; }
  .ops-table .mono { font-family:var(--font-data); font-size:12.5px; }
  .ops-table .dim { color:var(--v2-fg); }
  .ops-table .trunc { max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .ops-table .right { text-align:right; }

  /* ── DNS Result badge (Proxy) ── */
  .ops-proxy-yes { color:color-mix(in oklch, var(--v2-high) 72%, var(--v2-fg)); font-weight:500; font-size:12px; }
  .ops-proxy-no  { color:var(--v2-fg-3); font-size:12px; }
  .ops-pill { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; white-space:nowrap; background:color-mix(in oklch, var(--c) 14%, transparent); color:color-mix(in oklch, var(--c) 72%, var(--v2-fg)); }
  .ops-pill::before { content:""; width:6px; height:6px; border-radius:50%; background:var(--c); }

  /* ── Badge ── */
  .ops-badge { display:inline-flex; align-items:center; gap:4px; padding:2px 8px; border-radius:4px; font-size:12px; font-weight:500;   font-family:var(--font-ui); white-space:nowrap; }

  /* ── Hostname chips ── */
  .ops-chip-list { display:flex; flex-wrap:wrap; gap:6px; }
  .ops-chip { display:inline-flex; align-items:center; gap:6px; height:28px; padding:0 6px 0 10px; background:var(--v2-surface-2); border:1px solid var(--v2-line); color:var(--v2-fg); font-size:12.5px; font-family:var(--font-data); border-radius:6px; }
  .ops-chip button { background:none; border:none; cursor:pointer; color:var(--v2-fg-3); display:flex; align-items:center; transition:color 0.15s; padding:2px; border-radius:4px; }
  .ops-chip button:hover { color:var(--v2-crit); }
  .ops-chip button:hover { opacity:1; }

  /* ── Cache metrics grid ── */
  .ops-cache-stack { display:flex; height:12px; border-radius:6px; overflow:hidden; gap:2px; background:var(--v2-surface); }
  .ops-cache-stack i { display:block; height:100%; min-width:3px; }
  .ops-cache-grid { display:grid; grid-template-columns:repeat(2,1fr); gap:8px; }
  @media(min-width:640px) { .ops-cache-grid { grid-template-columns:repeat(4,1fr); } }
  .ops-cache-card { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:8px; padding:10px 12px; display:flex; flex-direction:column; gap:2px; }
  .ops-cache-card-label { display:flex; align-items:center; gap:5px; }
  .ops-cache-dot { width:7px; height:7px; border-radius:50%; flex-shrink:0; }
  .ops-cache-value { font-size:18px; font-weight:600; font-family:var(--font-ui); letter-spacing:-0.02em; line-height:1.2; color:var(--v2-fg) !important; font-variant-numeric:tabular-nums; }
  .ops-cache-pct { font-size:11.5px; color:var(--v2-fg-3); font-family:var(--font-data); }

  /* ── Cache total card ── */
  .ops-cache-total { border-top:1px solid var(--v2-line); padding-top:12px; display:flex; align-items:flex-end; justify-content:space-between; gap:8px; }
  .ops-cache-total-label { font-size:12.5px; font-weight:400; color:var(--v2-fg-3); font-family:var(--font-ui); margin-bottom:2px; }
  .ops-cache-total-val { font-size:24px; font-weight:600; font-family:var(--font-ui); letter-spacing:-0.02em; color:var(--v2-fg); font-variant-numeric:tabular-nums; }

  /* ── WAF action badge ── */
  .ops-action-pill { display:inline-flex; align-items:center; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; font-family:var(--font-data); background:var(--v2-surface-2); border:1px solid var(--v2-line); color:var(--v2-fg-2); }

  /* ── Status indicator ── */
  .ops-status-active { color:color-mix(in oklch, var(--v2-ok) 72%, var(--v2-fg)); font-weight:500; font-size:12.5px; display:flex; align-items:center; gap:6px; }
  .ops-status-active::before { content:''; width:6px; height:6px; border-radius:50%; background:var(--v2-ok); flex-shrink:0; }
  .ops-status-disabled { color:var(--v2-fg-3); font-size:12px; }

  /* ── Empty state ── */
  .ops-empty { padding:32px; text-align:center; color:var(--v2-fg-3); font-size:13px; font-family:var(--font-ui); }

  /* ── Scrollbar ── */
  .ops-root ::-webkit-scrollbar { width:4px; height:4px; }
  .ops-root ::-webkit-scrollbar-track { background:transparent; }
  .ops-root ::-webkit-scrollbar-thumb { background:var(--v2-line-strong); border-radius:2px; }

  /* ── Spin ── */
  @keyframes ops-spin { to{transform:rotate(360deg)} }
  .ops-spin { animation:ops-spin 0.8s linear infinite; }

  /* ── Dialog override ── */
  .ops-dialog-content { background:var(--v2-surface) !important; border:1px solid var(--v2-line-strong) !important; border-radius:12px !important; color:var(--v2-fg) !important; }
  .ops-dialog-title { color:var(--v2-fg) !important; font-family:var(--font-ui); font-weight:600 !important; font-size:17px !important; }

  /* ── Helper hint ── */
  .ops-hint { font-size:12px; color:var(--v2-fg-3); font-family:var(--font-ui); margin-top:3px; line-height:1.5; }

  /* ── Grid form ── */
  .ops-form-grid { display:grid; grid-template-columns:1fr; gap:12px; }
  @media(min-width:768px) { .ops-form-grid { grid-template-columns:1fr 1fr; } }
  @media(min-width:1024px) { .ops-form-grid { grid-template-columns:1fr 1fr 1fr; } }

  /* ── Checkbox row ── */
  .ops-check-row { display:flex; align-items:center; gap:8px; }
  .ops-seg { display:inline-flex; padding:2px; gap:2px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-surface); width:fit-content; }
  .ops-seg button { height:30px; padding:0 12px; border:0; border-radius:6px; background:transparent; color:var(--v2-fg-2); font:500 13px var(--font-ui); cursor:pointer; white-space:nowrap; }
  .ops-seg button[aria-pressed="true"] { background:var(--v2-surface-2); color:var(--v2-fg); box-shadow:0 0 0 1px var(--v2-line); }
  .ops-types { display:flex; flex-wrap:wrap; gap:4px; }
  .ops-types button { height:30px; min-width:52px; padding:0 10px; border:1px solid var(--v2-line); border-radius:7px; background:var(--v2-surface); color:var(--v2-fg-2); font:500 12.5px var(--font-data); cursor:pointer; }
  .ops-types button:hover { color:var(--v2-fg); }
  .ops-types button[aria-pressed="true"] { border-color:var(--v2-accent); background:color-mix(in oklch, var(--v2-accent) 10%, transparent); color:var(--v2-fg); }
  .ops-dns-grid { display:grid; grid-template-columns:minmax(0, 1fr) minmax(0, 1.4fr) 160px; gap:12px; align-items:end; }
  @media(max-width:640px) { .ops-dns-grid { grid-template-columns:1fr; } }
  .ops-toggle-row { display:flex; justify-content:space-between; align-items:center; gap:12px; padding:10px 12px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-surface-2); }
  .ops-toggle-row b { display:block; font-size:13px; font-weight:500; color:var(--v2-fg); }
  .ops-toggle-row small { display:block; font-size:12px; color:var(--v2-fg-3); }
  .ops-cache-form { display:grid; grid-template-columns:minmax(0, 1fr) auto; gap:12px; align-items:start; }
  @media(max-width:640px) { .ops-cache-form { grid-template-columns:1fr; } }
  .ops-warn { padding:10px 12px; border-radius:8px; font-size:13px; line-height:1.5; color:var(--v2-fg-2); background:color-mix(in oklch, var(--v2-crit) 7%, transparent); border:1px solid color-mix(in oklch, var(--v2-crit) 30%, transparent); }
  .ops-details summary { cursor:pointer; font-size:12.5px; color:var(--v2-fg-2); width:fit-content; }
  .ops-details summary:hover { color:var(--v2-fg); }
  .ops-details[open] summary { margin-bottom:8px; }
  .ops-row-click { cursor:pointer; }
  .ops-row-click:focus-visible td { outline:none; background:var(--v2-hover); }
  .ops-code-wrap { position:relative; }
  .ops-code-copy { position:absolute; top:6px; right:6px; }
  .ops-waf-sec { border:1px solid var(--v2-line); border-radius:10px; background:var(--v2-surface); padding:16px 18px; display:flex; flex-direction:column; gap:10px; min-width:0; }
  .ops-waf-sec h4 { margin:0; font:600 13px/1.3 var(--font-ui); color:var(--v2-fg); }
  .ops-waf-cond { display:grid; grid-template-columns:minmax(0,170px) minmax(0,170px) minmax(0,1fr) auto; gap:10px; align-items:start; }
  .ops-waf-cond-actions { display:flex; gap:6px; align-self:end; min-height:36px; align-items:center; }
  @media (max-width:720px) { .ops-waf-cond { grid-template-columns:1fr; } .ops-waf-cond-actions { align-self:start; } }
  .ops-waf-comb { font:600 11px var(--font-data); color:var(--v2-fg-3); text-transform:uppercase; letter-spacing:.04em; }
  .ops-waf-preview-head { display:flex; justify-content:space-between; align-items:center; gap:8px; margin-bottom:6px; }
  .ops-waf-link { background:none; border:0; padding:0; cursor:pointer; font:500 12px var(--font-ui); color:var(--v2-accent); text-decoration:underline; text-underline-offset:3px; }
  .ops-waf-preview { border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-surface-2); padding:12px 14px; }
  .ops-waf-preview pre { margin:0; font:12px/1.55 var(--font-data); color:var(--v2-fg); white-space:pre-wrap; word-break:break-all; }
  .ops-waf-count { text-align:right; font:11px var(--font-data); color:var(--v2-fg-3); margin-top:6px; }
  .ops-waf-check { display:flex; align-items:center; gap:8px; font:13px var(--font-ui); color:var(--v2-fg); cursor:pointer; }
  .ops-waf-check-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:8px; }
  .ops-waf-api-toggle { display:flex; align-items:center; gap:6px; background:none; border:0; padding:0; cursor:pointer; font:600 13px var(--font-ui); color:var(--v2-fg); }
  .ops-waf-curl { margin:0; padding:12px 14px; padding-right:90px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-surface-2); font:11.5px/1.55 var(--font-data); color:var(--v2-fg); white-space:pre-wrap; word-break:break-all; }
  .ops-code { margin:0; padding:12px 14px; border-radius:8px; background:var(--v2-surface-2); border:1px solid var(--v2-line); font:12.5px/1.65 var(--font-data); color:var(--v2-fg); white-space:pre-wrap; overflow-wrap:anywhere; max-height:420px; overflow:auto; }
  .ops-dns-toolbar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .ops-dns-toolbar-right { margin-left:auto; display:flex; gap:8px; align-items:center; }
  .ops-dns-search { position:relative; display:flex; align-items:center; min-width:260px; flex:0 1 320px; }
  .ops-dns-search > svg { position:absolute; left:10px; color:var(--v2-fg-3); pointer-events:none; }
  .ops-dns-search input { padding-left:32px !important; height:34px; }
  .ops-dns-preview { padding:10px 12px; border-radius:8px; background:var(--v2-surface-2); border:1px solid var(--v2-line); font:12.5px/1.6 var(--font-data); color:var(--v2-fg-2); white-space:normal; overflow-wrap:anywhere; min-width:0; }
  .ops-dns-preview strong { color:var(--v2-fg); }
  .ops-check-label { font-size:12px; color:var(--v2-fg); cursor:pointer; font-family:var(--font-ui); }
`;

// ── Cache color palette (hex equivalents) ─────────────────────────────────────
const CACHE_COLORS: Record<string, string> = {
  hit: T.success,
  none: T.neutral,
  dynamic: T.warning,
  revalidated: T.purple,
  expired: T.accent,
  miss: T.danger,
  bypass: T.cyan,
  stale: T.orange,
};
const CACHE_LABELS: Record<string, string> = {
  hit: "Hit",
  none: "None",
  dynamic: "Dynamic",
  revalidated: "Revalidated",
  expired: "Expired",
  miss: "Miss",
  bypass: "Bypass",
  stale: "Stale",
};
const STATUS_KEYS = ["hit", "none", "dynamic", "revalidated", "expired", "miss", "bypass", "stale"] as const;

const CF_ACTION_LIST = ["block", "challenge", "managed_challenge", "js_challenge", "log", "skip", "allow"] as const;
const REDIRECT_STATUS_CODES = [301, 302, 303, 307, 308] as const;
const REDIRECT_STATUS_LABELS: Record<number, string> = {
  301: "301 - Permanent Redirect",
  302: "302 - Temporary Redirect",
  303: "303 - See Other",
  307: "307 - Advanced: Temporary, HTTP method preserved",
  308: "308 - Advanced: Permanent, HTTP method preserved",
};

const PAGE_RULE_SETTING_IDS = new Set(PAGE_RULE_SETTINGS.map((s) => s.id));
function pageRuleCanEdit(rule: PageRule): boolean {
  return rule.actions.length > 0 && rule.actions.every((a) => PAGE_RULE_SETTING_IDS.has(a.id));
}
function defaultValueForSetting(def: PageRuleSettingDef): PageRuleSettingValue {
  switch (def.kind) {
    case "flag":
      return true;
    case "onoff":
      return "on";
    case "seconds":
      return 14400;
    case "text":
      return "";
    case "url_redirect":
      return { url: "", status_code: 301 };
    case "select":
      return def.options?.[0]?.value ?? null;
    default:
      return null;
  }
}

// ── Types ──────────────────────────────────────────────────────────────────────
type Zone = { id: string; name: string };
interface CRZone {
  id: string;
  name: string;
  status?: string | null;
  account_name?: string | null;
}
interface SearchableOption {
  value: string;
  label: string;
}

const BLOCK_PERMISSION: Record<string, string> = {
  "dns-lookup": "manage_buscar_dns",
  "purge-cache": "manage_purge_cache",
  "cache-status": "manage_cache_performance",
  "create-dns": "manage_adicionar_dns",
  "custom-rules": "manage_custom_rules",
  rules: "manage_rules",
};
// Submenu de Operações (mesmo padrão do Analytics). Cada seção aparece se o
// usuário tiver permissão para pelo menos uma das ferramentas dela.
type OpsSection = "dns" | "cache" | "security" | "rules";
const OPS_SECTIONS: Array<{ id: OpsSection; label: string; blocks: string[] }> = [
  { id: "dns", label: "Registros DNS", blocks: ["dns-lookup", "create-dns"] },
  { id: "cache", label: "Cache", blocks: ["cache-status", "purge-cache"] },
  { id: "security", label: "Security", blocks: ["custom-rules"] },
  { id: "rules", label: "Regras", blocks: ["rules"] },
];
const OPS_SECTION_KEY = "cloudflare_operations_section";

// ── fmtNum ─────────────────────────────────────────────────────────────────────
function fmtNum(n: number) {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("pt-BR");
}

// ── ExecLabel ─────────────────────────────────────────────────────────────────
function ExecLabel({ children }: { children: React.ReactNode }) {
  return <span className="ops-label">{children}</span>;
}

// Nome do produto igual ao nativo, usado no texto do botão de documentação
// ("Origin Rules documentation" etc.).
const RULE_CATEGORY_LABELS: Record<RuleCategoryKey, string> = {
  url_rewrite: "URL Rewrite Rules",
  redirect: "Redirect Rules",
  configuration: "Configuration Rules",
  origin: "Origin Rules",
  request_header_transform: "Request Header Transform Rules",
  cache: "Cache Rules",
  cache_response: "Cache Response Rules",
  custom_error: "Custom Error Rules",
  response_header_transform: "Response Header Transform Rules",
};

// Permissão granular exigida pra criar/editar/excluir/reordenar cada
// categoria do Overview — espelha CATEGORY_PERMISSION de
// cloudflare.rules.functions.ts (duplicado aqui de propósito: esse arquivo é
// um server function module, importar dele pro client arriscaria empacotar
// código server-only, como a service-role key, no bundle do browser).
const OVERVIEW_CATEGORY_PERMISSION: Record<RuleCategoryKey, string> = {
  url_rewrite: "manage_rules_overview_url_rewrite",
  redirect: "manage_rules_overview_redirect",
  configuration: "manage_rules_overview_configuration",
  origin: "manage_rules_overview_origin",
  request_header_transform: "manage_rules_overview_request_header_transform",
  cache: "manage_rules_overview_cache",
  cache_response: "manage_rules_overview_cache_response",
  custom_error: "manage_rules_overview_custom_error",
  response_header_transform: "manage_rules_overview_response_header_transform",
};

// URLs reais da documentação pública da Cloudflare (confirmadas via busca,
// não chutadas) — mesmo link que aparece no topo da página nativa de cada
// tipo de regra ("Origin Rules documentation" etc.).
const RULE_DOCS_URL: Record<RuleCategoryKey, string> = {
  url_rewrite: "https://developers.cloudflare.com/rules/transform/url-rewrite/",
  redirect: "https://developers.cloudflare.com/rules/url-forwarding/single-redirects/",
  configuration: "https://developers.cloudflare.com/rules/configuration-rules/",
  origin: "https://developers.cloudflare.com/rules/origin-rules/",
  request_header_transform: "https://developers.cloudflare.com/rules/transform/request-header-modification/",
  cache: "https://developers.cloudflare.com/cache/how-to/cache-rules/",
  cache_response: "https://developers.cloudflare.com/cache/how-to/cache-response-rules/",
  custom_error: "https://developers.cloudflare.com/rules/custom-errors/",
  response_header_transform: "https://developers.cloudflare.com/rules/transform/response-header-modification/",
};

function DocsLinkButton({ category }: { category: RuleCategoryKey }) {
  return (
    <a
      href={RULE_DOCS_URL[category]}
      target="_blank"
      rel="noopener noreferrer"
      className="ops-btn outline sm"
      style={{ textDecoration: "none", flexShrink: 0 }}
    >
      <BookOpen size={11} />
      {RULE_CATEGORY_LABELS[category]} documentation
    </a>
  );
}

// Input com um prefixo fixo à esquerda (ex.: "/" ou "?"), igual ao nativo em
// Path/Query do URL Rewrite Rule.
function PrefixInput({
  prefix,
  value,
  onChange,
  placeholder,
}: {
  prefix: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div style={{ display: "flex" }}>
      <span
        style={{
          display: "flex",
          alignItems: "center",
          padding: "0 8px",
          border: `1px solid ${V2.border}`,
          borderRight: "none",
          borderRadius: "6px 0 0 6px",
          background: V2.surfaceAlt,
          color: V2.textSubtle,
          fontSize: 13,
        }}
      >
        {prefix}
      </span>
      <Input
        style={{ borderRadius: "0 6px 6px 0" }}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// Host Header, SNI e DNS Record de Origin Rules são Enterprise-only na
// Cloudflare — nosso contrato é Business, então ficam travados em "Preserve"
// com o mesmo aviso do nativo, em vez de deixar salvar e falhar na API.
// Destination Port já é liberado a partir do Business.
const ORIGIN_ENTERPRISE_ONLY_HINT = "Available on Enterprise plan only. Upgrade to enable this feature.";

// Radio Preserve / Rewrite-to (ou "Override to…") + input condicional, igual
// ao "Then… Set origin parameters" nativo do Origin Rule (Host Header, SNI,
// DNS Record, Destination Port).
function PreserveRewriteField({
  label,
  mode,
  onModeChange,
  value,
  onValueChange,
  preserveHint,
  rewriteLabel = "Rewrite to…",
  rewriteHint,
  placeholder,
  inputType = "text",
  planRestricted,
}: {
  label: string;
  mode: "preserve" | "rewrite";
  onModeChange: (m: "preserve" | "rewrite") => void;
  value: string;
  onValueChange: (v: string) => void;
  preserveHint: string;
  rewriteLabel?: string;
  rewriteHint: string;
  placeholder?: string;
  inputType?: "text" | "number";
  // Recurso indisponível no plano atual (ex.: Host Header/SNI/DNS Record de
  // Origin Rules são Enterprise-only) — trava em "Preserve" e mostra o mesmo
  // aviso do nativo ao passar o mouse, em vez de deixar salvar e falhar na API.
  planRestricted?: string;
}) {
  const disabledStyle = { cursor: "not-allowed", opacity: 0.5 } as const;
  const fieldBody = (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 4 }}>
      <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: planRestricted ? "not-allowed" : "pointer", ...(planRestricted ? disabledStyle : {}) }}>
        <input
          type="radio"
          checked={mode === "preserve"}
          disabled={!!planRestricted}
          onChange={() => !planRestricted && onModeChange("preserve")}
          style={{ marginTop: 3 }}
        />
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Preserve</div>
          <div className="ops-hint">{preserveHint}</div>
        </div>
      </label>
      <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: planRestricted ? "not-allowed" : "pointer", ...(planRestricted ? disabledStyle : {}) }}>
        <input
          type="radio"
          checked={mode === "rewrite"}
          disabled={!!planRestricted}
          onChange={() => !planRestricted && onModeChange("rewrite")}
          style={{ marginTop: 3 }}
        />
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>{rewriteLabel}</div>
          <div className="ops-hint">{rewriteHint}</div>
        </div>
      </label>
    </div>
  );
  return (
    <div className="ops-field">
      <ExecLabel>{label}</ExecLabel>
      {planRestricted ? (
        <TooltipProvider delayDuration={150}>
          <Tooltip>
            <TooltipTrigger asChild>
              <div>{fieldBody}</div>
            </TooltipTrigger>
            <TooltipContent side="top" collisionPadding={16} avoidCollisions>
              {planRestricted}
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      ) : (
        fieldBody
      )}
      {mode === "rewrite" && !planRestricted && (
        <Input
          style={{ marginTop: 6 }}
          type={inputType}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onValueChange(e.target.value)}
        />
      )}
    </div>
  );
}

// ── SearchableSelect (redesigned trigger + dropdown, same logic) ───────────────
interface SearchableSelectProps {
  options: SearchableOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  loading?: boolean;
  emptyMessage?: string;
  keepOpenOnSelect?: boolean;
}

function SearchableSelect({
  options,
  value,
  onValueChange,
  placeholder = "Selecione…",
  searchPlaceholder = "Buscar…",
  disabled = false,
  loading = false,
  emptyMessage = "Nenhum resultado.",
  keepOpenOnSelect = false,
}: SearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const inputRef = React.useRef<HTMLInputElement>(null);

  const filtered = React.useMemo(() => {
    const q = search.toLowerCase().trim();
    return q ? options.filter((o) => o.label.toLowerCase().includes(q)) : options;
  }, [options, search]);

  const selectedLabel = options.find((o) => o.value === value)?.label;

  React.useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 50);
    else setSearch("");
  }, [open]);

  function handleSelect(v: string) {
    onValueChange(v);
    if (!keepOpenOnSelect) setOpen(false);
    setSearch("");
  }

  return (
    <Popover open={open} onOpenChange={disabled ? undefined : setOpen}>
      <PopoverTrigger asChild>
        <button type="button" disabled={disabled} className={`ops-select-trigger${open ? " open" : ""}`}>
          <span
            style={{
              color: selectedLabel ? V2.textPrimary : V2.textPrimary,
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {loading ? (
              <span style={{ display: "flex", alignItems: "center", gap: 6, color: V2.textPrimary }}>
                <Loader2 size={12} className="ops-spin" /> Carregando…
              </span>
            ) : (
              (selectedLabel ?? placeholder)
            )}
          </span>
          <ChevronDown
            size={13}
            color={T.textPrimary}
            style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 0.15s", flexShrink: 0 }}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="ops-select-popover p-0"
        style={{ width: "var(--radix-popover-trigger-width)" }}
        align="start"
        sideOffset={4}
      >
        <div className="ops-select-search">
          <Search size={12} color={T.textPrimary} />
          <input
            ref={inputRef}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={searchPlaceholder}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              if (e.key === "Enter" && filtered.length === 1) handleSelect(filtered[0].value);
            }}
          />
          {search && (
            <button
              onClick={() => setSearch("")}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: V2.textPrimary,
                display: "flex",
                alignItems: "center",
              }}
            >
              <X size={11} />
            </button>
          )}
        </div>
        <div className="ops-select-list">
          {filtered.length === 0 ? (
            <div className="ops-select-empty">{emptyMessage}</div>
          ) : (
            filtered.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => handleSelect(opt.value)}
                className={`ops-select-opt${opt.value === value && !keepOpenOnSelect ? " selected" : ""}`}
                style={{ width: "100%", textAlign: "left" }}
              >
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{opt.label}</span>
                {opt.value === value && !keepOpenOnSelect && (
                  <Check size={12} color={T.accent} style={{ flexShrink: 0, marginLeft: 6 }} />
                )}
              </button>
            ))
          )}
        </div>
        <div className="ops-select-footer">
          {filtered.length} de {options.length} opções
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ── Cartão de ferramenta ─────────────────────────────────────────────────────
function OpsCard({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="ops-card">
      <div className="ops-card-h">
        <div>
          <h3 className="ops-card-title">{title}</h3>
          {description && <p className="ops-card-desc">{description}</p>}
        </div>
        {action}
      </div>
      <div className="ops-card-body">{children}</div>
    </section>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// OperationsTab
// ══════════════════════════════════════════════════════════════════════════════
function useZoneState(initial: string, onSharedChange?: () => void) {
  const shared = React.useContext(SharedZoneContext);
  const [zoneId, setZoneId] = React.useState<string>(shared ?? initial);
  const prev = React.useRef(shared);
  React.useEffect(() => {
    if (shared && shared !== prev.current) {
      prev.current = shared;
      setZoneId(shared);
      onSharedChange?.();
    }
  }, [shared, onSharedChange]);
  return [zoneId, setZoneId, !!shared] as const;
}

export function OperationsTab() {
  const { can } = usePermissions();

  // Mesma regra de antes: cada ferramenta exige a sua permissão manage_*
  const visibleKey = Object.entries(BLOCK_PERMISSION)
    .filter(([, perm]) => can("cloudflare-waf", perm))
    .map(([id]) => id)
    .sort()
    .join(",");
  const visibleIds = React.useMemo(() => new Set(visibleKey ? visibleKey.split(",") : []), [visibleKey]);
  const sectionAllowed = (sec: (typeof OPS_SECTIONS)[number]) => sec.blocks.some((b) => visibleIds.has(b));

  const [section, setSection] = React.useState<OpsSection>(() => {
    try {
      return (localStorage.getItem(OPS_SECTION_KEY) as OpsSection) || "dns";
    } catch {
      return "dns";
    }
  });
  // Se a seção salva não estiver liberada para o usuário, vai para a primeira que estiver
  React.useEffect(() => {
    const current = OPS_SECTIONS.find((x) => x.id === section);
    if (current && sectionAllowed(current)) return;
    const first = OPS_SECTIONS.find(sectionAllowed);
    if (first) setSection(first.id);
  }, [visibleKey]);
  function changeSection(id: OpsSection) {
    setSection(id);
    try {
      localStorage.setItem(OPS_SECTION_KEY, id);
    } catch {
      /* storage indisponível */
    }
  }

  const [createDnsOpen, setCreateDnsOpen] = React.useState(false);

  const fetchZones = useServerFn(listCloudflareZones);
  const { data: zonesData } = useQuery({
    queryKey: ["cloudflare-zones"],
    queryFn: () => fetchZones(),
  });
  const zones: Zone[] = zonesData?.ok ? zonesData.zones : [];

  const has = (id: string) => visibleIds.has(id);
  const newDnsButton = has("create-dns") ? (
    <button type="button" className="ops-btn primary" onClick={() => setCreateDnsOpen(true)}>
      <Plus size={14} /> Adicionar registro
    </button>
  ) : null;

  return (
    <div className="ops-root" style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Submenu ─────────────────────────────────────────────────────────── */}
      <div className="ops-subnav" role="tablist" aria-label="Operações">
        {OPS_SECTIONS.map((sec) => {
          const allowed = sectionAllowed(sec);
          return (
            <button
              key={sec.id}
              type="button"
              role="tab"
              aria-selected={section === sec.id}
              className={`ops-subnav-btn${section === sec.id ? " active" : ""}`}
              disabled={!allowed}
              onClick={() => allowed && changeSection(sec.id)}
              title={allowed ? undefined : "Você não tem permissão para ver esta seção"}
            >
              {sec.label}
              {!allowed && <Lock size={11} />}
            </button>
          );
        })}
      </div>

      {/* ── Registros DNS ───────────────────────────────────────────────────── */}
      {section === "dns" && (
        <div className="ops-cards one">
          {has("dns-lookup") ? (
            <DnsLookupInner zones={zones} action={newDnsButton} />
          ) : has("create-dns") ? (
            <OpsCard title="Novo registro DNS" description="Na zona escolhida">
              <CreateDnsInner zones={zones} />
            </OpsCard>
          ) : null}
        </div>
      )}

      {/* ── Cache ───────────────────────────────────────────────────────────── */}
      {section === "cache" && (
        <div className={`ops-cards${has("cache-status") && has("purge-cache") ? "" : " one"}`}>
          {has("cache-status") && (
            <OpsCard title="Performance de cache" description="Verifica se uma URL está sendo servida do cache">
              <CacheStatusInner zones={zones} />
            </OpsCard>
          )}
          {has("purge-cache") && (
            <OpsCard title="Limpar cache (purge)" description="Remove arquivos do cache da Cloudflare">
              <PurgeCacheInner zones={zones} />
            </OpsCard>
          )}
        </div>
      )}

      {/* ── Security ────────────────────────────────────────────────────────── */}
      {section === "security" && has("custom-rules") && (
        <div className="ops-cards one">
          <OpsCard title="Regras personalizadas (WAF)" description="Regras criadas na zona e criação de novas regras">
            <CustomRulesInner zones={zones} />
          </OpsCard>
        </div>
      )}

      {/* ── Regras ──────────────────────────────────────────────────────────── */}
      {section === "rules" && has("rules") && <RulesInner zones={zones} />}

      {/* Novo registro DNS: o formulário que era um bloco agora abre em janela */}
      <Dialog open={createDnsOpen} onOpenChange={setCreateDnsOpen}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Novo registro DNS</DialogTitle>
          </DialogHeader>
          <div className="ops-root ops-card" style={{ border: 0, background: "transparent", minWidth: 0 }}>
            <CreateDnsInner zones={zones} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// DNS LOOKUP
// ══════════════════════════════════════════════════════════════════════════════
function DnsLookupInner({
  zones,
  action,
}: {
  zones: Array<Zone & { status?: string | null }>;
  action?: React.ReactNode;
}) {
  const sharedZone = React.useContext(SharedZoneContext);
  const [ownZoneId, setZoneId] = React.useState<string>("__all__");
  const [allZones, setAllZones] = React.useState(false);
  const zoneId = sharedZone ? (allZones ? "__all__" : sharedZone) : ownZoneId;
  const [query, setQuery] = React.useState("");
  const [results, setResults] = React.useState<any[] | null>(null);
  const [loading, setLoading] = React.useState(false);
  const doSearch = useServerFn(searchDnsRecords);
  const doUpdate = useServerFn(updateDnsRecord);
  const { can } = usePermissions();
  const canEdit = can("cloudflare-waf", "manage_editar_dns");
  const [exportOpen, setExportOpen] = React.useState(false);

  const [editRecord, setEditRecord] = React.useState<any | null>(null);
  const [editForm, setEditForm] = React.useState({
    type: "A",
    name: "",
    content: "",
    ttl: 1,
    proxied: false,
    comment: "",
  });
  const [editConfirmOpen, setEditConfirmOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const zoneOptions: SearchableOption[] = [
    { value: "__all__", label: "Todas as zonas" },
    ...zones.map((z) => ({ value: z.id, label: z.name })),
  ];

  // Numa zona só, carrega todos os registros e filtra na tela; em "todas as
  // zonas" a busca vai ao servidor (Enter / Buscar), como antes.
  const singleZone = zoneId !== "__all__";
  const [typeFilter, setTypeFilter] = React.useState("all");

  async function onSearch(q = query) {
    setLoading(true);
    try {
      const res = await doSearch({ data: { zoneId: singleZone ? zoneId : undefined, query: singleZone ? "" : q } });
      if (res.ok) setResults(res.records);
      else toast.error(res.error);
    } finally {
      setLoading(false);
    }
  }

  React.useEffect(() => {
    setTypeFilter("all");
    if (singleZone) onSearch("");
    else setResults(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoneId]);

  const typesInResults = React.useMemo(
    () => Array.from(new Set((results ?? []).map((r) => String(r.type)))).sort(),
    [results],
  );
  const q = query.trim().toLowerCase();
  const visible = (results ?? []).filter(
    (r) =>
      (typeFilter === "all" || r.type === typeFilter) &&
      (!singleZone || !q || `${r.name} ${r.content} ${r.type} ${r.comment ?? ""}`.toLowerCase().includes(q)),
  );

  function openEdit(r: any) {
    setEditRecord(r);
    setEditForm({
      type: r.type,
      name: r.name,
      content: r.content,
      ttl: r.ttl && r.ttl !== 1 ? r.ttl : 1,
      proxied: !!r.proxied,
      comment: r.comment ?? "",
    });
  }

  async function executeEdit() {
    if (!editRecord) return;
    setSaving(true);
    setEditConfirmOpen(false);
    try {
      let res: Awaited<ReturnType<typeof doUpdate>>;
      try {
        res = await doUpdate({
          data: {
            zoneId: editRecord.zone_id,
            recordId: editRecord.id,
            type: editForm.type,
            name: editForm.name,
            content: editForm.content,
            ttl: editForm.ttl,
            proxied: PROXIABLE.has(editForm.type) && editForm.proxied,
            comment: editForm.comment,
          },
        });
      } catch (err: any) {
        toast.error(err?.message ?? "Erro inesperado ao editar registro DNS.");
        return;
      }
      if (res.ok) {
        toast.success(`Registro ${editForm.type} ${editForm.name} atualizado com sucesso.`);
        setResults((prev) =>
          prev
            ? prev.map((r) =>
                r.id === editRecord.id
                  ? {
                      ...r,
                      type: editForm.type,
                      name: editForm.name,
                      content: editForm.content,
                      ttl: editForm.ttl,
                      proxied: editForm.proxied,
                      comment: editForm.comment,
                    }
                  : r,
              )
            : prev,
        );
        setEditRecord(null);
      } else {
        toast.error((res as any).error ?? "Erro ao editar registro DNS.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <div className="ops-dns-toolbar">
        <div className="ops-dns-search">
          <Search size={14} />
          <Input
            placeholder={singleZone ? "Buscar por nome, conteúdo ou tipo" : "Nome para buscar em todas as zonas (Enter)"}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !singleZone && onSearch()}
            aria-label="Buscar registros DNS"
          />
        </div>
        {sharedZone ? (
          <div className="ops-seg" role="group" aria-label="Onde buscar">
            <button type="button" aria-pressed={!allZones} onClick={() => setAllZones(false)}>
              Esta zona
            </button>
            <button type="button" aria-pressed={allZones} onClick={() => setAllZones(true)}>
              Todas as zonas
            </button>
          </div>
        ) : (
          <div style={{ minWidth: 220 }}>
            <SearchableSelect
              options={zoneOptions}
              value={zoneId}
              onValueChange={setZoneId}
              placeholder="Todas as zonas"
              searchPlaceholder="Buscar zona…"
            />
          </div>
        )}
        {!singleZone && (
          <button className="ops-btn outline" onClick={() => onSearch()} disabled={loading}>
            {loading ? <Loader2 size={13} className="ops-spin" /> : <Search size={13} />}
            {loading ? "Buscando…" : "Buscar"}
          </button>
        )}
        {typesInResults.length > 1 && (
          <div className="ops-seg" role="group" aria-label="Tipo">
            <button type="button" aria-pressed={typeFilter === "all"} onClick={() => setTypeFilter("all")}>
              Todos
            </button>
            {typesInResults.slice(0, 6).map((t) => (
              <button key={t} type="button" aria-pressed={typeFilter === t} onClick={() => setTypeFilter(t)}>
                {t}
              </button>
            ))}
          </div>
        )}
        <div className="ops-dns-toolbar-right">
          {results && results.length > 0 && (
            <button className="ops-btn outline" onClick={() => setExportOpen(true)}>
              <Download size={13} /> Exportar
            </button>
          )}
          {action}
        </div>
      </div>

      <section className="ops-card">
        <div className="ops-table-wrap flat">
          <table className="ops-table">
            <thead>
              <tr>
                <th>Tipo</th>
                <th>Nome</th>
                <th>Conteúdo</th>
                <th>Proxy</th>
                <th>TTL</th>
                {!singleZone && <th>Zona</th>}
                {canEdit && (
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr>
                  <td colSpan={7} className="ops-empty">
                    <Loader2 size={14} className="ops-spin" style={{ verticalAlign: -2, marginRight: 6 }} />
                    Carregando registros…
                  </td>
                </tr>
              )}
              {!loading && !results && (
                <tr>
                  <td colSpan={7} className="ops-empty">
                    {singleZone ? "Selecione uma zona." : "Digite um nome e busque em todas as zonas."}
                  </td>
                </tr>
              )}
              {!loading && results && visible.length === 0 && (
                <tr>
                  <td colSpan={7} className="ops-empty">
                    Nenhum registro encontrado.
                  </td>
                </tr>
              )}
              {!loading &&
                visible.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <span className="ops-pill" style={{ "--c": "var(--v2-low)" } as React.CSSProperties}>
                        {r.type}
                      </span>
                    </td>
                    <td className="mono">{r.name}</td>
                    <td className="mono trunc" title={r.content}>
                      {r.content}
                    </td>
                    <td>
                      {r.proxied ? (
                        <span className="ops-pill" style={{ "--c": "var(--v2-high)" } as React.CSSProperties}>
                          Proxied
                        </span>
                      ) : (
                        <span className="ops-pill" style={{ "--c": "var(--v2-fg-3)" } as React.CSSProperties}>
                          DNS only
                        </span>
                      )}
                    </td>
                    <td className="mono">{r.ttl === 1 ? "Auto" : r.ttl}</td>
                    {!singleZone && <td className="mono">{r.zone_name}</td>}
                    {canEdit && (
                      <td style={{ textAlign: "right" }}>
                        <button className="ops-btn outline sm" onClick={() => openEdit(r)}>
                          <Pencil size={12} /> Editar
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
        {results && results.length > 0 && (
          <div className="ops-table-foot">
            {visible.length === results.length
              ? `${results.length} registro${results.length === 1 ? "" : "s"}`
              : `${visible.length} de ${results.length} registros`}
          </div>
        )}
      </section>

      {/* Dialog: Editar registro DNS */}
      <Dialog open={!!editRecord} onOpenChange={(o) => !o && setEditRecord(null)}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle style={{ display: "flex", alignItems: "center", gap: 8 }}>
              Editar registro DNS
            </DialogTitle>
          </DialogHeader>
          <div className="ops-root" style={{ display: "flex", flexDirection: "column", gap: 14, padding: "4px 0", minWidth: 0 }}>
            <p className="ops-hint" style={{ margin: 0 }}>
              Zona <strong style={{ fontFamily: "var(--font-data)" }}>{editRecord?.zone_name}</strong>
            </p>
            <div className="ops-field">
              <ExecLabel>Tipo</ExecLabel>
              <div className="ops-types" role="radiogroup" aria-label="Tipo de registro">
                {DNS_TYPES.map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="radio"
                    aria-checked={editForm.type === t}
                    aria-pressed={editForm.type === t}
                    onClick={() => setEditForm({ ...editForm, type: t })}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="ops-dns-grid">
              <div className="ops-field">
                <ExecLabel>Nome (subdomínio ou @)</ExecLabel>
                <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
              </div>
              <div className="ops-field">
                <ExecLabel>Conteúdo</ExecLabel>
                <Input value={editForm.content} onChange={(e) => setEditForm({ ...editForm, content: e.target.value })} />
              </div>
              <div className="ops-field">
                <ExecLabel>TTL (1 = Auto)</ExecLabel>
                <Input
                  type="number"
                  value={editForm.ttl}
                  onChange={(e) => setEditForm({ ...editForm, ttl: Number(e.target.value) || 1 })}
                  min={1}
                />
              </div>
            </div>
            <div className="ops-toggle-row">
              <span>
                <b>Proxy Cloudflare</b>
                <small>
                  {!PROXIABLE.has(editForm.type)
                    ? `Não se aplica a registros ${editForm.type}`
                    : editForm.proxied
                      ? "Tráfego passa pela Cloudflare (WAF e cache)"
                      : "Só resolve o DNS, sem proteção"}
                </small>
              </span>
              <Switch
                checked={PROXIABLE.has(editForm.type) && editForm.proxied}
                disabled={!PROXIABLE.has(editForm.type)}
                onCheckedChange={(v) => setEditForm({ ...editForm, proxied: !!v })}
                aria-label="Proxy Cloudflare"
              />
            </div>
            <div className="ops-field">
              <ExecLabel>Comentário</ExecLabel>
              <Input
                value={editForm.comment}
                onChange={(e) => setEditForm({ ...editForm, comment: e.target.value })}
                placeholder="ex.: solicitado por Fulano"
                maxLength={100}
              />
            </div>
            <div className="ops-dns-preview">
              Vai ficar: <strong>{editForm.name}</strong> {editForm.type} → <strong>{editForm.content || "…"}</strong> ·{" "}
              {PROXIABLE.has(editForm.type) && editForm.proxied ? "Proxied" : "DNS only"} · TTL{" "}
              {editForm.ttl === 1 ? "Auto" : `${editForm.ttl}s`}
            </div>
          </div>
          <DialogFooter>
            <button className="ops-btn outline" onClick={() => setEditRecord(null)}>
              Cancelar
            </button>
            <button
              className="ops-btn primary"
              onClick={() => setEditConfirmOpen(true)}
              disabled={!editForm.name || !editForm.content}
            >
              <Check size={12} /> Revisar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Confirmação antes de aplicar a edição — altera DNS de produção na Cloudflare */}
      <AlertDialog open={editConfirmOpen} onOpenChange={setEditConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar edição de DNS</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div
                style={{
                  fontSize: 13,
                  fontFamily: "'IBM Plex Mono',monospace",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <div>
                  Zona: <strong>{editRecord?.zone_name}</strong>
                </div>
                <div>
                  Tipo: <strong>{editForm.type}</strong>
                </div>
                <div>
                  Nome: <strong>{editForm.name}</strong>
                </div>
                <div>
                  Conteúdo anterior: <strong>{editRecord?.content}</strong>
                </div>
                <div>
                  Conteúdo novo: <strong>{editForm.content}</strong>
                </div>
                <div>
                  TTL: <strong>{editForm.ttl === 1 ? "Auto" : editForm.ttl}</strong>
                </div>
                <div>
                  Proxy: <strong>{PROXIABLE.has(editForm.type) && editForm.proxied ? "Ativo" : "Desativado"}</strong>
                </div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={saving}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={executeEdit} disabled={saving}>
              {saving ? "Salvando…" : "Salvar alteração"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DnsExportDialog open={exportOpen} onOpenChange={setExportOpen} records={results ?? []} />
    </>
  );
}

// Colunas disponíveis pra exportar (ordem = mesma da tabela de resultados +
// 2 extras que não aparecem na tela: Comentário e Modificado em).
const DNS_EXPORT_COLUMNS: Array<{ key: string; label: string }> = [
  { key: "name", label: "Nome" },
  { key: "type", label: "Tipo" },
  { key: "content", label: "Conteúdo" },
  { key: "proxied", label: "Proxy" },
  { key: "ttl", label: "TTL" },
  { key: "zone_name", label: "Zona" },
  { key: "comment", label: "Comentário" },
  { key: "modified_on", label: "Modificado em" },
];

function DnsExportDialog({
  open,
  onOpenChange,
  records,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  records: any[];
}) {
  const [format, setFormat] = React.useState<"xlsx" | "csv">("xlsx");
  const [selectedCols, setSelectedCols] = React.useState<string[]>(DNS_EXPORT_COLUMNS.map((c) => c.key));
  const [typeFilter, setTypeFilter] = React.useState<string[]>([]);
  const [proxyFilter, setProxyFilter] = React.useState<"__all__" | "yes" | "no">("__all__");

  const availableTypes = React.useMemo(() => Array.from(new Set(records.map((r) => r.type))).sort(), [records]);

  React.useEffect(() => {
    if (open) {
      setTypeFilter(availableTypes);
      setProxyFilter("__all__");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function toggleCol(key: string) {
    setSelectedCols((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }
  function toggleType(t: string) {
    setTypeFilter((prev) => (prev.includes(t) ? prev.filter((k) => k !== t) : [...prev, t]));
  }

  function handleExport() {
    const filtered = records.filter((r) => {
      if (!typeFilter.includes(r.type)) return false;
      if (proxyFilter === "yes" && !r.proxied) return false;
      if (proxyFilter === "no" && r.proxied) return false;
      return true;
    });
    if (filtered.length === 0) {
      toast.error("Nenhum registro pra exportar com esses filtros.");
      return;
    }
    const cols = DNS_EXPORT_COLUMNS.filter((c) => selectedCols.includes(c.key));
    if (cols.length === 0) {
      toast.error("Selecione ao menos uma coluna.");
      return;
    }
    const rows = filtered.map((r) => {
      const row: Record<string, unknown> = {};
      for (const c of cols) {
        let v: unknown = r[c.key];
        if (c.key === "proxied") v = v ? "Habilitado" : "Desabilitado";
        if (c.key === "modified_on" && v) v = String(v).slice(0, 10);
        row[c.label] = v ?? "";
      }
      return row;
    });

    const fname = `dns_export_${new Date().toISOString().slice(0, 10)}`;
    if (format === "csv") {
      const headers = cols.map((c) => c.label);
      const esc = (val: unknown) => {
        const s = String(val ?? "");
        return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
      };
      const csv = [headers.join(";"), ...rows.map((r) => headers.map((h) => esc((r as Record<string, unknown>)[h])).join(";"))].join(
        "\r\n",
      );
      const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${fname}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } else {
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), "Registros DNS");
      XLSX.writeFile(wb, `${fname}.xlsx`);
    }
    toast.success(`${filtered.length} registro(s) exportado(s).`);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Exportar registros DNS</DialogTitle>
        </DialogHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, paddingTop: 4 }}>
          <div className="ops-field">
            <ExecLabel>Formato</ExecLabel>
            <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
              <button className={`ops-btn ${format === "xlsx" ? "primary" : "outline"}`} onClick={() => setFormat("xlsx")}>
                Excel (.xlsx)
              </button>
              <button className={`ops-btn ${format === "csv" ? "primary" : "outline"}`} onClick={() => setFormat("csv")}>
                CSV (.csv)
              </button>
            </div>
          </div>
          <div className="ops-field">
            <ExecLabel>Proxy</ExecLabel>
            <Select value={proxyFilter} onValueChange={(v) => setProxyFilter(v as "__all__" | "yes" | "no")}>
              <SelectTrigger style={{ maxWidth: 220 }}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__all__">Todos</SelectItem>
                <SelectItem value="yes">Habilitado</SelectItem>
                <SelectItem value="no">Desabilitado</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="ops-field">
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <ExecLabel>Tipo (selecione um ou mais)</ExecLabel>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  type="button"
                  className="ops-btn ghost sm"
                  onClick={() => setTypeFilter(availableTypes)}
                  style={{ fontSize: 11, padding: "2px 8px" }}
                >
                  Todos
                </button>
                <button
                  type="button"
                  className="ops-btn ghost sm"
                  onClick={() => setTypeFilter([])}
                  style={{ fontSize: 11, padding: "2px 8px" }}
                >
                  Nenhum
                </button>
              </div>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6 }}>
              {availableTypes.map((t) => (
                <label
                  key={t}
                  style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 12, color: V2.textPrimary, cursor: "pointer" }}
                >
                  <Checkbox checked={typeFilter.includes(t)} onCheckedChange={() => toggleType(t)} />
                  {t}
                </label>
              ))}
            </div>
          </div>
          <div className="ops-field">
            <ExecLabel>Colunas</ExecLabel>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 6 }}>
              {DNS_EXPORT_COLUMNS.map((c) => (
                <label
                  key={c.key}
                  style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, color: V2.textPrimary, cursor: "pointer" }}
                >
                  <Checkbox checked={selectedCols.includes(c.key)} onCheckedChange={() => toggleCol(c.key)} />
                  {c.label}
                </label>
              ))}
            </div>
          </div>
        </div>
        <DialogFooter>
          <button className="ops-btn outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </button>
          <button className="ops-btn primary" onClick={handleExport}>
            <Download size={12} /> Exportar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PURGE CACHE
// ══════════════════════════════════════════════════════════════════════════════
function PurgeCacheInner({ zones }: { zones: CRZone[] }) {
  const resetOnZone = React.useCallback(() => setHostnames(""), []);
  const [zoneId, setZoneId, zoneShared] = useZoneState("", resetOnZone);
  const [hostnames, setHostnames] = React.useState("");
  const [purgeAll, setPurgeAll] = React.useState(false);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const doPurge = useServerFn(purgeCache);
  const doSearch = useServerFn(searchDnsRecords);

  const zoneOptions: SearchableOption[] = zones.map((z) => ({ value: z.id, label: z.name }));
  const { data: dnsData, isLoading: dnsLoading } = useQuery({
    queryKey: ["dns-records-for-purge", zoneId],
    queryFn: async () => (zoneId ? doSearch({ data: { zoneId, query: "" } }) : { ok: true, records: [] }),
    enabled: !!zoneId,
  });
  const subdomainOptions: SearchableOption[] = React.useMemo(() => {
    if (!dnsData?.ok) return [];
    const names = (dnsData.records ?? []).map((r: any) => String(r.name ?? "").trim()).filter(Boolean);
    return Array.from(new Set(names))
      .sort()
      .map((n) => ({ value: n, label: n }));
  }, [dnsData]);

  function addSubdomain(v: string) {
    if (!v) return;
    const cur = hostnames
      .split(/[\n,]/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (!cur.includes(v)) setHostnames([...cur, v].join("\n"));
  }
  function removeHostname(h: string) {
    setHostnames(
      hostnames
        .split(/[\n,]/)
        .map((s) => s.trim())
        .filter((s) => s && s !== h)
        .join("\n"),
    );
  }
  const hostList = hostnames
    .split(/[\n,]/)
    .map((s) => s.trim())
    .filter(Boolean);
  const canSubmit = zoneId && (purgeAll || hostList.length > 0);
  const zoneName = zones.find((z) => z.id === zoneId)?.name ?? "—";

  async function execute() {
    setLoading(true);
    setConfirmOpen(false);
    try {
      let res: Awaited<ReturnType<typeof doPurge>>;
      try {
        res = await doPurge({
          data: { zoneId, hostnames: purgeAll ? undefined : hostList, purgeEverything: purgeAll },
        });
      } catch (err: any) {
        toast.error(err?.message ?? "Erro inesperado ao chamar a API de purge.");
        return;
      }
      if (res.ok) {
        toast.success("Purge executado com sucesso.");
        setHostnames("");
      } else {
        toast.error((res as any).error ?? "Erro ao executar purge.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="ops-section-title">
        <Trash2 size={14} color={T.warning} />
        <span className="ops-section-title-text">Purge de Cache</span>
      </div>

      {!zoneShared && (
        <div className="ops-field">
          <ExecLabel>Zona</ExecLabel>
          <SearchableSelect
            options={zoneOptions}
            value={zoneId}
            onValueChange={(v) => {
              setZoneId(v);
              setHostnames("");
            }}
            placeholder="Selecione a zona"
            searchPlaceholder="Buscar zona…"
            emptyMessage="Nenhuma zona encontrada."
          />
        </div>
      )}

      <div className="ops-seg" role="group" aria-label="O que limpar">
        <button type="button" aria-pressed={!purgeAll} onClick={() => setPurgeAll(false)}>
          Por hostname
        </button>
        <button type="button" aria-pressed={purgeAll} onClick={() => setPurgeAll(true)}>
          Tudo da zona
        </button>
      </div>

      {purgeAll ? (
        <div className="ops-warn">
          Remove <strong>todo</strong> o cache da zona <strong>{zoneName}</strong>. A origem vai receber mais
          requisições até o cache se refazer.
        </div>
      ) : (
        <>
          {zoneId && (
            <div className="ops-field">
              <ExecLabel>
                Hostnames {dnsLoading && <Loader2 size={10} className="ops-spin" style={{ marginLeft: 4 }} />}
              </ExecLabel>
              <SearchableSelect
                options={subdomainOptions}
                value=""
                onValueChange={addSubdomain}
                placeholder={
                  dnsLoading
                    ? "Carregando subdomínios…"
                    : subdomainOptions.length === 0
                      ? "Nenhum subdomínio encontrado"
                      : "Selecione subdomínios para adicionar…"
                }
                searchPlaceholder="Buscar subdomínio…"
                disabled={dnsLoading || subdomainOptions.length === 0}
                loading={dnsLoading}
                emptyMessage="Nenhum subdomínio encontrado."
                keepOpenOnSelect
              />
              <p className="ops-hint">Cada subdomínio escolhido entra na lista abaixo.</p>
            </div>
          )}

          {hostList.length > 0 && (
            <div className="ops-chip-list">
              {hostList.map((h) => (
                <span key={h} className="ops-chip">
                  {h}
                  <button onClick={() => removeHostname(h)} title="Remover" aria-label={`Remover ${h}`}>
                    <X size={11} />
                  </button>
                </span>
              ))}
            </div>
          )}

          <details className="ops-details">
            <summary>Colar uma lista de hostnames</summary>
            <Textarea
              value={hostnames}
              onChange={(e) => setHostnames(e.target.value)}
              placeholder={"www.exemplo.com\napp.exemplo.com"}
              rows={3}
            />
            <p className="ops-hint">Um por linha ou separados por vírgula.</p>
          </details>
        </>
      )}

      <button
        className={`ops-btn ${purgeAll ? "danger" : "primary"}`}
        style={{ alignSelf: "flex-start" }}
        disabled={!canSubmit}
        onClick={() => setConfirmOpen(true)}
      >
        <Trash2 size={13} />
        {purgeAll
          ? "Limpar todo o cache da zona"
          : `Executar purge${hostList.length ? ` (${hostList.length} ${hostList.length === 1 ? "host" : "hosts"})` : ""}`}
      </button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar Purge</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div style={{ fontSize: 13, display: "flex", flexDirection: "column", gap: 6 }}>
                <div>
                  Zona: <strong>{zoneName}</strong>
                </div>
                {purgeAll ? (
                  <div style={{ color: T.danger, fontWeight: 600 }}>⚠️ TODO o cache desta zona será limpo.</div>
                ) : (
                  <div>
                    Hosts a purgar:
                    <ul
                      style={{
                        listStyleType: "disc",
                        paddingLeft: 20,
                        marginTop: 4,
                        fontFamily: "'IBM Plex Mono',monospace",
                        fontSize: 11,
                      }}
                    >
                      {hostList.map((h) => (
                        <li key={h}>{h}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <div>Deseja continuar?</div>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={execute} disabled={loading}>
              {loading ? "Executando…" : "Confirmar Purge"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CACHE STATUS
// ══════════════════════════════════════════════════════════════════════════════
type CacheStatusResultOk = {
  hostname: string;
  zoneId: string;
  range: { since: string; until: string; days: number };
  totals: {
    total: number;
    hit: number;
    none: number;
    dynamic: number;
    revalidated: number;
    expired: number;
    miss: number;
    bypass: number;
    stale: number;
    age?: number | null;
  };
  timeseries: Array<{
    t: string;
    hit: number;
    miss: number;
    dynamic: number;
    expired: number;
    bypass: number;
    none: number;
  }>;
};

function CacheStatusInner({ zones }: { zones: CRZone[] }) {
  const resetOnZone = React.useCallback(() => {
    setSelectedSubdomain("");
    setStatusResult(null);
  }, []);
  const [zoneId, setZoneId, zoneShared] = useZoneState("", resetOnZone);
  const [selectedSubdomain, setSelectedSubdomain] = React.useState("");
  const [days, setDays] = React.useState(1);
  const [statusResult, setStatusResult] = React.useState<CacheStatusResultOk | null>(null);
  const [loading, setLoading] = React.useState(false);
  const doGetCacheStatus = useServerFn(getCacheStatus);
  const doSearch = useServerFn(searchDnsRecords);

  const zoneOptions: SearchableOption[] = zones.map((z) => ({ value: z.id, label: z.name }));
  const { data: dnsData, isLoading: dnsLoading } = useQuery({
    queryKey: ["dns-records-for-cache-status", zoneId],
    queryFn: async () => (zoneId ? doSearch({ data: { zoneId, query: "" } }) : { ok: true, records: [] }),
    enabled: !!zoneId,
  });
  const subdomainOptions: SearchableOption[] = React.useMemo(() => {
    if (!dnsData?.ok) return [];
    const names = (dnsData.records ?? []).map((r: any) => String(r.name ?? "").trim()).filter(Boolean);
    return Array.from(new Set(names))
      .sort()
      .map((n) => ({ value: n, label: n }));
  }, [dnsData]);

  function handleZoneChange(v: string) {
    setZoneId(v);
    setSelectedSubdomain("");
    setStatusResult(null);
  }

  async function checkStatus() {
    if (!selectedSubdomain || !zoneId) return;
    setLoading(true);
    try {
      const res = await doGetCacheStatus({ data: { hostname: selectedSubdomain, zoneId, days } });
      if (res.ok) setStatusResult(res.result as CacheStatusResultOk);
      else {
        toast.error(res.error);
        setStatusResult(null);
      }
    } finally {
      setLoading(false);
    }
  }

  const t = statusResult?.totals;

  return (
    <>
      <div className="ops-section-title">
        <Database size={14} color={T.accent} />
        <span className="ops-section-title-text">Cache Performance</span>
      </div>

      {!zoneShared && (
        <div className="ops-field">
          <ExecLabel>Zona</ExecLabel>
          <SearchableSelect
            options={zoneOptions}
            value={zoneId}
            onValueChange={handleZoneChange}
            placeholder="Selecione uma zona"
            searchPlaceholder="Buscar zona…"
            emptyMessage="Nenhuma zona encontrada."
          />
        </div>
      )}

      <div className="ops-cache-form">
      {zoneId && (
        <div className="ops-field">
          <ExecLabel>
            Subdomínio {dnsLoading && <Loader2 size={10} className="ops-spin" style={{ marginLeft: 4 }} />}
          </ExecLabel>
          <SearchableSelect
            options={subdomainOptions}
            value={selectedSubdomain}
            onValueChange={(v) => {
              setSelectedSubdomain(v);
              setStatusResult(null);
            }}
            placeholder={
              dnsLoading
                ? "Carregando…"
                : subdomainOptions.length === 0
                  ? "Nenhum encontrado"
                  : "Selecione um subdomínio"
            }
            searchPlaceholder="Buscar subdomínio…"
            disabled={dnsLoading || subdomainOptions.length === 0}
            loading={dnsLoading}
            emptyMessage="Nenhum subdomínio encontrado."
          />
          <p className="ops-hint">Mostra 1 subdomínio por vez.</p>
        </div>
      )}

      <div className="ops-field">
        <ExecLabel>Período</ExecLabel>
        <div className="ops-seg" role="group" aria-label="Período">
          {[1, 2, 3].map((n) => (
            <button key={n} type="button" aria-pressed={days === n} onClick={() => setDays(n)}>
              {n === 1 ? "24 h" : `${n} dias`}
            </button>
          ))}
        </div>
      </div>
      </div>

      <button
        className="ops-btn primary"
        style={{ alignSelf: "flex-start" }}
        onClick={checkStatus}
        disabled={!selectedSubdomain || !zoneId || loading}
      >
        {loading ? (
          <>
            <Loader2 size={13} className="ops-spin" /> Consultando…
          </>
        ) : (
          <>
            <ShieldCheck size={13} /> Verificar cache
          </>
        )}
      </button>

      {t && (
        <>
          <div className="ops-cache-total">
            <div>
              <div className="ops-cache-total-label">Total de Requisições</div>
              <div className="ops-cache-total-val">{fmtNum(t.total)}</div>
            </div>
            <span
              style={{
                fontSize: 11,
                color: V2.textPrimary,
                fontFamily: "'IBM Plex Mono',monospace",
                maxWidth: "55%",
                textAlign: "right",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {statusResult?.hostname}
            </span>
          </div>

          {t.total > 0 && (
            <div className="ops-cache-stack" role="img" aria-label="Proporção de cada status de cache">
              {STATUS_KEYS.filter((k) => t[k] > 0).map((key) => (
                <i
                  key={key}
                  style={{ flex: t[key], background: CACHE_COLORS[key] }}
                  title={`${CACHE_LABELS[key]}: ${fmtNum(t[key])} (${((t[key] / t.total) * 100).toFixed(1)}%)`}
                />
              ))}
            </div>
          )}
          <div className="ops-cache-grid">
            {STATUS_KEYS.filter((k) => t[k] > 0 || ["hit", "miss", "none", "dynamic"].includes(k)).map((key) => (
              <div key={key} className="ops-cache-card">
                <div className="ops-cache-card-label">
                  <div className="ops-cache-dot" style={{ background: CACHE_COLORS[key] }} />
                  <span
                    style={{
                      fontSize: 10,
                      fontFamily: "'IBM Plex Mono',monospace",
                      fontWeight: 700,
                      color: CACHE_COLORS[key],
                      letterSpacing: "0.06em",
                    }}
                  >
                    {CACHE_LABELS[key]}
                  </span>
                </div>
                <div className="ops-cache-value" style={{ color: CACHE_COLORS[key] }}>
                  {fmtNum(t[key])}
                </div>
                {t.total > 0 && <div className="ops-cache-pct">{((t[key] / t.total) * 100).toFixed(1)}%</div>}
              </div>
            ))}

            {/* Age card */}
            <div className="ops-cache-card">
              <div className="ops-cache-card-label">
                <div className="ops-cache-dot" style={{ background: T.accent }} />
                <span
                  style={{
                    fontSize: 10,
                    fontFamily: "'IBM Plex Mono',monospace",
                    fontWeight: 700,
                    color: T.accent,
                    letterSpacing: "0.06em",
                  }}
                >
                  Age
                </span>
              </div>
              {t.age != null ? (
                <>
                  <div className="ops-cache-value" style={{ color: T.accent }}>
                    {t.age < 60
                      ? `${t.age}s`
                      : t.age < 3600
                        ? `${Math.floor(t.age / 60)}m`
                        : `${Math.floor(t.age / 3600)}h`}
                  </div>
                  <div className="ops-cache-pct">tempo em cache</div>
                </>
              ) : (
                <>
                  <div className="ops-cache-value" style={{ color: V2.textPrimary }}>
                    —
                  </div>
                  <div className="ops-cache-pct">não disponível</div>
                </>
              )}
            </div>
          </div>
        </>
      )}

      {!t && !loading && selectedSubdomain && (
        <p
          style={{
            fontSize: 11,
            color: V2.textPrimary,
            textAlign: "center",
            padding: "12px 0",
            fontFamily: "var(--font-ui)",
          }}
        >
          Clique em <strong style={{ color: V2.textPrimary }}>Verificar Cache</strong> para consultar{" "}
          <span style={{ fontFamily: "'IBM Plex Mono',monospace" }}>{selectedSubdomain}</span>.
        </p>
      )}
      {!zoneId && (
        <p
          style={{
            fontSize: 11,
            color: V2.textPrimary,
            textAlign: "center",
            padding: "24px 0",
            fontFamily: "var(--font-ui)",
          }}
        >
          Selecione uma zona para começar.
        </p>
      )}
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CREATE DNS
// ══════════════════════════════════════════════════════════════════════════════
const DNS_TYPES = ["A", "AAAA", "CNAME", "TXT", "MX", "NS", "SRV", "CAA"] as const;
// Só A/AAAA/CNAME podem passar pelo proxy da Cloudflare
const PROXIABLE = new Set(["A", "AAAA", "CNAME"]);

function CreateDnsInner({ zones }: { zones: CRZone[] }) {
  const qc = useQueryClient();
  const [zoneId, setZoneId, zoneShared] = useZoneState("");
  const [type, setType] = React.useState("A");
  const [name, setName] = React.useState("");
  const [content, setContent] = React.useState("");
  const [ttl, setTtl] = React.useState<number>(1);
  const [proxied, setProxied] = React.useState(false);
  const [comment, setComment] = React.useState("");
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [loading, setLoading] = React.useState(false);
  const doCreate = useServerFn(createDnsRecord);

  const zoneOptions: SearchableOption[] = zones.map((z) => ({ value: z.id, label: z.name }));
  const canSubmit = zoneId && name && content && comment.trim();
  const zoneName = zones.find((z) => z.id === zoneId)?.name ?? "—";
  const proxiable = PROXIABLE.has(type);
  const effectiveProxied = proxiable && proxied;
  const fqdn = name && name !== "@" ? `${name}.${zoneName}` : zoneName;

  async function execute() {
    setLoading(true);
    setConfirmOpen(false);
    try {
      let res: Awaited<ReturnType<typeof doCreate>>;
      try {
        res = await doCreate({ data: { zoneId, type, name, content, ttl, proxied: effectiveProxied, comment } });
      } catch (err: any) {
        toast.error(err?.message ?? "Erro inesperado ao criar registro DNS.");
        return;
      }
      if (res.ok) {
        toast.success(`Registro ${type} ${name} criado com sucesso.`);
        setName("");
        setContent("");
        setComment("");
        qc.invalidateQueries({ queryKey: ["cloudflare-analytics"] });
      } else {
        toast.error((res as any).error ?? "Erro ao criar registro DNS.");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {zoneShared ? (
        <p className="ops-hint" style={{ margin: 0 }}>
          Zona <strong style={{ fontFamily: "var(--font-data)" }}>{zoneName}</strong> · a mesma escolhida na barra
        </p>
      ) : (
        <div className="ops-field">
          <ExecLabel>Zona</ExecLabel>
          <SearchableSelect
            options={zoneOptions}
            value={zoneId}
            onValueChange={setZoneId}
            placeholder="Selecione a zona"
            searchPlaceholder="Buscar zona…"
            emptyMessage="Nenhuma zona encontrada."
          />
        </div>
      )}

      <div className="ops-field">
        <ExecLabel>Tipo</ExecLabel>
        <div className="ops-types" role="radiogroup" aria-label="Tipo de registro">
          {DNS_TYPES.map((t) => (
            <button key={t} type="button" role="radio" aria-checked={type === t} aria-pressed={type === t} onClick={() => setType(t)}>
              {t}
            </button>
          ))}
        </div>
      </div>

      <div className="ops-dns-grid">
        <div className="ops-field">
          <ExecLabel>Nome (subdomínio ou @)</ExecLabel>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="api" />
        </div>
        <div className="ops-field">
          <ExecLabel>Conteúdo</ExecLabel>
          <Input
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder={
              type === "A" ? "192.0.2.1" : type === "AAAA" ? "2001:db8::1" : type === "CNAME" ? "alvo.exemplo.com" : "valor"
            }
          />
        </div>
        <div className="ops-field">
          <ExecLabel>TTL (segundos · 1 = Auto)</ExecLabel>
          <Input type="number" value={ttl} onChange={(e) => setTtl(Number(e.target.value) || 1)} min={1} />
        </div>
      </div>

      <div className="ops-toggle-row">
        <span>
          <b>Proxy Cloudflare</b>
          <small>
            {!proxiable
              ? `Não se aplica a registros ${type}`
              : proxied
                ? "Tráfego passa pela Cloudflare (WAF e cache)"
                : "Só resolve o DNS, sem proteção"}
          </small>
        </span>
        <Switch
          checked={effectiveProxied}
          disabled={!proxiable}
          onCheckedChange={(v) => setProxied(!!v)}
          aria-label="Proxy Cloudflare"
        />
      </div>

      <div className="ops-field">
        <ExecLabel>Comentário</ExecLabel>
        <Input
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          placeholder="ex.: solicitado por Fulano"
          maxLength={100}
        />
      </div>

      {(name || content) && (
        <div className="ops-dns-preview">
          Vai ficar: <strong>{fqdn}</strong> {type} → <strong>{content || "…"}</strong> ·{" "}
          {effectiveProxied ? "Proxied" : "DNS only"} · TTL {ttl === 1 ? "Auto" : `${ttl}s`}
        </div>
      )}

      <button className="ops-btn primary full" disabled={!canSubmit} onClick={() => setConfirmOpen(true)}>
        <Globe size={13} /> Revisar e criar
      </button>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Confirmar criação de DNS</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div
                style={{
                  fontSize: 13,
                  fontFamily: "'IBM Plex Mono',monospace",
                  display: "flex",
                  flexDirection: "column",
                  gap: 4,
                }}
              >
                <div>
                  Zona: <strong>{zoneName}</strong>
                </div>
                <div>
                  Tipo: <strong>{type}</strong>
                </div>
                <div>
                  Nome: <strong>{name}</strong>
                </div>
                <div>
                  Conteúdo: <strong>{content}</strong>
                </div>
                <div>
                  TTL: <strong>{ttl === 1 ? "Auto" : ttl}</strong>
                </div>
                <div>
                  Proxy: <strong>{effectiveProxied ? "Ativo" : "Desativado"}</strong>
                </div>
                {comment && (
                  <div>
                    Comentário: <strong>{comment}</strong>
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={loading}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={execute} disabled={loading}>
              {loading ? "Criando…" : "Criar registro"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// CUSTOM RULES (WAF)
// ══════════════════════════════════════════════════════════════════════════════
function CustomRulesInner({ zones }: { zones: CRZone[] }) {
  const resetOnZone = React.useCallback(() => setRulesetId(null), []);
  const [zoneId, setZoneId, zoneShared] = useZoneState("", resetOnZone);
  const [search, setSearch] = React.useState("");
  const [rulesetId, setRulesetId] = React.useState<string | null>(null);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [editRule, setEditRule] = React.useState<WafRule | null>(null);
  // Regra aberta no painel lateral (só leitura)
  const [viewRuleId, setViewRuleId] = React.useState<string | null>(null);
  const [viewOpen, setViewOpen] = React.useState(false);

  const list = useServerFn(listCustomRules);
  const update = useServerFn(updateCustomRule);
  const qc = useQueryClient();

  const { data, isFetching, refetch } = useQuery({
    queryKey: ["cf-custom-rules", zoneId],
    queryFn: () => list({ data: { zoneId } }),
    enabled: !!zoneId,
  });

  React.useEffect(() => {
    if ((data as any)?.ok) setRulesetId((data as any).rulesetId ?? null);
  }, [data]);

  const rules = (data as any)?.ok ? (data as any).rules : [];
  const filtered = search.trim()
    ? rules.filter(
        (r: any) =>
          r.description.toLowerCase().includes(search.toLowerCase()) ||
          r.expression.toLowerCase().includes(search.toLowerCase()),
      )
    : rules;

  async function handleToggle(rule: any) {
    if (!rulesetId) {
      toast.error("Ruleset ID não encontrado. Clique em Atualizar.");
      return;
    }
    const newEnabled = !rule.enabled;
    const res: any = await update({
      data: {
        zoneId,
        rulesetId,
        ruleId: rule.id,
        description: rule.description,
        expression: rule.expression,
        action: rule.action,
        action_parameters: rule.action_parameters ?? null,
        enabled: newEnabled,
      },
    });
    if (res.ok) {
      toast.success(newEnabled ? "Rule habilitada." : "Rule desabilitada.");
      qc.invalidateQueries({ queryKey: ["cf-custom-rules", zoneId] });
    } else toast.error(res.error);
  }

  function openEdit(rule: WafRule) {
    setEditRule(rule);
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
      <div className="ops-section-title">
        <Shield size={14} color={T.danger} />
        <span className="ops-section-title-text">Custom Rules (WAF)</span>
      </div>

      {/* Toolbar */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
        {!zoneShared && (
          <div className="ops-field" style={{ flex: "1 1 220px" }}>
            <ExecLabel>Domínio (zona)</ExecLabel>
            <SearchableSelect
              options={zones.map((z) => ({ value: z.id, label: z.name }))}
              value={zoneId}
              onValueChange={(v) => {
                setZoneId(v);
                setRulesetId(null);
              }}
              placeholder="Selecione uma zona…"
              searchPlaceholder="Buscar por domínio…"
            />
          </div>
        )}
        <div className="ops-field" style={{ flex: "1 1 200px" }}>
          <ExecLabel>Buscar rule</ExecLabel>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filtrar por descrição/expressão"
          />
        </div>
        <button className="ops-btn outline" onClick={() => refetch()} disabled={!zoneId || isFetching}>
          {isFetching ? <Loader2 size={12} className="ops-spin" /> : <Search size={12} />}
          Atualizar
        </button>
        {zoneId && (
          <button className="ops-btn primary" onClick={() => setCreateOpen(true)}>
            <Plus size={12} /> Adicionar Rule
          </button>
        )}
      </div>

      {/* Rules table */}
      {zoneId && (
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th>Descrição</th>
                <th>Expressão</th>
                <th>Action</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="ops-empty">
                    {isFetching ? "Carregando…" : "Nenhuma regra encontrada."}
                  </td>
                </tr>
              )}
              {filtered.map((r: any) => (
                <tr
                  key={r.id}
                  className="ops-row-click"
                  tabIndex={0}
                  title="Ver a regra completa"
                  onClick={() => {
                    setViewRuleId(r.id);
                    setViewOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setViewRuleId(r.id);
                      setViewOpen(true);
                    }
                  }}
                >
                  <td style={{ fontWeight: 500 }}>{r.description || "—"}</td>
                  <td className="mono trunc" style={{ maxWidth: 220 }} title={r.expression}>
                    {r.expression}
                  </td>
                  <td>
                    <span className="ops-action-pill">{r.action}</span>
                  </td>
                  <td>
                    {r.enabled ? (
                      <span className="ops-status-active">Ativa</span>
                    ) : (
                      <span className="ops-status-disabled">Desabilitada</span>
                    )}
                  </td>
                  <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2 }}>
                      <button className="ops-btn outline sm" onClick={() => openEdit(r)}>
                        <Pencil size={12} /> Editar
                      </button>
                      <button
                        className="ops-btn ghost sm"
                        onClick={() => handleToggle(r)}
                        title={r.enabled ? "Desabilitar" : "Habilitar"}
                      >
                        <Power size={13} color={r.enabled ? T.success : V2.textMuted} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(() => {
        const idx = rules.findIndex((x: { id: string }) => x.id === viewRuleId);
        const vr = idx >= 0 ? rules[idx] : null;
        const asRule: OverviewRule | null = vr
          ? {
              order: idx + 1,
              id: vr.id,
              description: vr.description ?? "",
              expression: vr.expression ?? "",
              action: vr.action ?? "",
              action_parameters: vr.action_parameters ?? null,
              enabled: !!vr.enabled,
            }
          : null;
        return (
          <DetailSheet
            open={viewOpen && !!asRule}
            onOpenChange={setViewOpen}
            width={620}
            eyebrow={`Custom Rules (WAF) · ordem ${asRule?.order ?? "—"}`}
            title={asRule?.description || "Regra sem nome"}
            badges={
              asRule && (
                <>
                  {asRule.enabled ? (
                    <span className="ops-rule-status-active">Ativa</span>
                  ) : (
                    <span className="ops-rule-status-disabled">Desabilitada</span>
                  )}
                  <span className="ops-action-pill">{asRule.action}</span>
                </>
              )
            }
            footer={
              <>
                <button className="ops-btn outline" style={{ marginRight: "auto" }} onClick={() => setViewOpen(false)}>
                  Fechar
                </button>
                {vr && (
                  <button
                    className="ops-btn primary"
                    onClick={() => {
                      setViewOpen(false);
                      openEdit(vr);
                    }}
                  >
                    <Pencil size={13} /> Editar
                  </button>
                )}
              </>
            }
          >
            {asRule && <RuleReadOnly rule={asRule} />}
          </DetailSheet>
        );
      })()}

      <WafCustomRuleDialog
        open={createOpen || !!editRule}
        onOpenChange={(o) => {
          if (!o) {
            setCreateOpen(false);
            setEditRule(null);
          }
        }}
        zoneId={zoneId}
        rulesetId={rulesetId}
        rules={rules}
        editing={editRule}
        onSaved={() => {
          setCreateOpen(false);
          setEditRule(null);
          qc.invalidateQueries({ queryKey: ["cf-custom-rules", zoneId] });
        }}
      />
    </div>
  );
}

// ── Custom Rules (WAF): criar/editar no mesmo fluxo do "Edit custom rule" ────
// nativo — Nome, "Quando a requisição bater com…" (builder Field/Operator/
// Value + And/Or, ou expressão livre), ação (com parâmetros de Block e Skip),
// ordem de execução, status e o "Salvar via API" (cURL equivalente).
type WafRule = {
  id: string;
  description: string;
  expression: string;
  action: string;
  action_parameters: Record<string, unknown> | null;
  logging?: { enabled: boolean } | null;
  enabled: boolean;
};
const WAF_ACTIONS: Array<{ key: (typeof CF_ACTION_LIST)[number]; label: string; desc: string }> = [
  { key: "managed_challenge", label: "Managed Challenge", desc: "A Cloudflare decide, pelas características da requisição, se apresenta um desafio ao visitante." },
  { key: "block", label: "Block", desc: "Bloqueia as requisições que baterem e para de avaliar as demais regras." },
  { key: "js_challenge", label: "JS Challenge", desc: "Apresenta um desafio JavaScript não interativo ao visitante." },
  { key: "skip", label: "Skip", desc: "Deixa a requisição passar e pula os componentes de segurança selecionados." },
  { key: "challenge", label: "Interactive Challenge", desc: "Apresenta um desafio interativo que o visitante precisa resolver." },
  { key: "log", label: "Log", desc: "Só registra as requisições que baterem (disponível no plano Enterprise)." },
  { key: "allow", label: "Allow", desc: "Libera a requisição sem aplicar a ação das regras seguintes." },
];
// Opções do Skip — mesmos componentes que o nativo deixa pular
const WAF_SKIP_RULESETS = [{ key: "current", label: "Todas as custom rules restantes" }];
const WAF_SKIP_PHASES = [
  { key: "http_ratelimit", label: "Todas as rate limiting rules" },
  { key: "http_request_firewall_managed", label: "Todas as managed rules" },
  { key: "http_request_sbfm", label: "Todas as regras do Super Bot Fight Mode" },
];
const WAF_SKIP_PRODUCTS = [
  { key: "zoneLockdown", label: "Zone Lockdown" },
  { key: "uaBlock", label: "User Agent Blocking" },
  { key: "bic", label: "Browser Integrity Check" },
  { key: "hot", label: "Hotlink Protection" },
  { key: "securityLevel", label: "Security Level" },
  { key: "rateLimit", label: "Rate limiting rules (versão anterior)" },
  { key: "waf", label: "Managed rules (versão anterior)" },
];
const WAF_BLOCK_RESPONSE_TYPES = [
  { key: "default", label: "Página de bloqueio padrão da Cloudflare" },
  { key: "text/html", label: "HTML customizado" },
  { key: "text/plain", label: "Texto customizado" },
  { key: "application/json", label: "JSON customizado" },
  { key: "application/xml", label: "XML customizado" },
];
// ISO 3166-1 alfa-2 + T1 (Tor) — o "Country" do nativo é um dropdown com nome
const COUNTRY_CODES =
  "AD AE AF AG AI AL AM AO AQ AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BV BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GS GT GU GW GY HK HM HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TF TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG UM US UY UZ VA VC VE VG VI VN VU WF WS XK YE YT ZA ZM ZW".split(
    " ",
  );
const CONTINENTS: Record<string, string> = {
  AF: "África",
  AN: "Antártida",
  AS: "Ásia",
  EU: "Europa",
  NA: "América do Norte",
  OC: "Oceania",
  SA: "América do Sul",
  T1: "Tor",
};
let countryOptionsCache: Array<{ value: string; label: string }> | null = null;
function countryOptions(): Array<{ value: string; label: string }> {
  if (countryOptionsCache) return countryOptionsCache;
  let names: Intl.DisplayNames | null = null;
  try {
    names = new Intl.DisplayNames(["pt-BR"], { type: "region" });
  } catch {
    names = null;
  }
  countryOptionsCache = [
    ...COUNTRY_CODES.map((c) => ({ value: c, label: `${names?.of(c) ?? c} (${c})` })).sort((a, b) =>
      a.label.localeCompare(b.label, "pt-BR"),
    ),
    { value: "T1", label: "Rede Tor (T1)" },
  ];
  return countryOptionsCache;
}
function geoValueOptions(field: string): Array<{ value: string; label: string }> | null {
  if (field === "ip.src.country" || field === "ip.geoip.country") return countryOptions();
  if (field === "ip.src.continent" || field === "ip.geoip.continent") return Object.entries(CONTINENTS).map(([value, n]) => ({ value, label: `${n} (${value})` }));
  return null;
}

// Builder Field/Operator/Value + And/Or que escreve numa expressão de texto.
// `seed` muda a cada abertura do diálogo: aí ele relê `value` e decide se
// abre no builder (expressão reconhecida) ou no texto livre (não reconhecida —
// nunca apaga o que já estava escrito).
function ExpressionBuilderField({ value, onChange, seed }: { value: string; onChange: (v: string) => void; seed: number }) {
  const blank: ExprCondition = { field: "ip.src.country", operator: "eq", value: "" };
  const [mode, setMode] = React.useState<"builder" | "raw">("builder");
  const [conditions, setConditions] = React.useState<ExprCondition[]>([blank]);
  const [combinators, setCombinators] = React.useState<Array<"and" | "or">>([]);

  React.useEffect(() => {
    if (!value.trim()) {
      setConditions([blank]);
      setCombinators([]);
      setMode("builder");
      return;
    }
    const parsed = parseMultiCondition(value);
    if (parsed) {
      setConditions(parsed.conditions);
      setCombinators(parsed.combinators);
      setMode("builder");
    } else setMode("raw");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seed]);

  React.useEffect(() => {
    if (mode === "builder") onChange(compileExpression(conditions, combinators));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conditions, combinators, mode]);

  function patch(idx: number, p: Partial<ExprCondition>) {
    setConditions((cs) => cs.map((c, i) => (i === idx ? { ...c, ...p } : c)));
  }
  function setField(idx: number, fieldKey: string) {
    const op = getExprOperators(fieldKey)[0];
    patch(idx, { field: fieldKey, operator: op.key, value: op.valueKind === "bool" ? "true" : "" });
  }
  function setOperator(idx: number, opKey: string, ops: ExprOperator[]) {
    const op = ops.find((o) => o.key === opKey) ?? ops[0];
    const prev = ops.find((o) => o.key === conditions[idx].operator);
    // Mantém o valor quando o tipo de valor não muda (ex.: equals → does not equal)
    patch(idx, { operator: opKey, value: prev?.valueKind === op.valueKind ? conditions[idx].value : op.valueKind === "bool" ? "true" : "" });
  }
  function add(comb: "and" | "or") {
    setConditions((cs) => [...cs, blank]);
    setCombinators((cb) => [...cb, comb]);
  }
  function remove(idx: number) {
    if (conditions.length <= 1) return;
    setConditions((cs) => cs.filter((_, i) => i !== idx));
    setCombinators((cb) => cb.filter((_, i) => i !== (idx === 0 ? 0 : idx - 1)));
  }
  function toBuilder() {
    if (!value.trim()) {
      setConditions([blank]);
      setCombinators([]);
      setMode("builder");
      return;
    }
    const parsed = parseMultiCondition(value);
    if (!parsed) {
      toast.warning("O builder não reconhece esta expressão. Continue editando no modo texto para não perdê-la.");
      return;
    }
    setConditions(parsed.conditions);
    setCombinators(parsed.combinators);
    setMode("builder");
  }

  function valueInput(c: ExprCondition, idx: number, op: ExprOperator) {
    const field = EXPR_FIELDS.find((f) => f.key === c.field) ?? EXPR_FIELDS[0];
    if (op.valueKind === "bool")
      return <Switch checked={c.value === "true"} onCheckedChange={(v) => patch(idx, { value: v ? "true" : "false" })} />;
    const geo = geoValueOptions(c.field);
    if (op.valueKind === "text" && geo)
      return (
        <SearchableSelect
          options={geo}
          value={c.value}
          onValueChange={(v) => patch(idx, { value: v })}
          placeholder="Selecione…"
          searchPlaceholder="Buscar…"
        />
      );
    const enumOptions = ENUM_VALUE_OPTIONS[c.field];
    if (op.valueKind === "text" && enumOptions)
      return (
        <Select value={c.value} onValueChange={(v) => patch(idx, { value: v })}>
          <SelectTrigger>
            <SelectValue placeholder="Selecione…" />
          </SelectTrigger>
          <SelectContent>
            {enumOptions.map((v) => (
              <SelectItem key={v} value={v}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      );
    if (op.valueKind === "listref")
      return <Input placeholder="nome_da_list" value={c.value} onChange={(e) => patch(idx, { value: e.target.value })} />;
    if (op.valueKind === "list")
      return (
        <Input
          placeholder={geo ? "BR, US, PT" : enumOptions ? `${enumOptions.slice(0, 2).join(", ")}, …` : "valor1, valor2, valor3"}
          value={c.value}
          onChange={(e) => patch(idx, { value: e.target.value })}
        />
      );
    return (
      <Input
        placeholder={EXPR_VALUE_EXAMPLE[field.key] ?? (field.type === "ip" ? "e.g. 203.0.113.0/24" : "Valor")}
        value={c.value}
        onChange={(e) => patch(idx, { value: e.target.value })}
      />
    );
  }

  const preview = (
    <div className="ops-waf-preview">
      <pre>{value || "—"}</pre>
    </div>
  );

  if (mode === "raw")
    return (
      <div className="ops-field">
        <div className="ops-waf-preview-head">
          <ExecLabel>Expressão</ExecLabel>
          <button className="ops-waf-link" onClick={toBuilder}>
            Usar o expression builder
          </button>
        </div>
        <Textarea
          className="mono"
          rows={5}
          placeholder={'(ip.src.country ne "BR")'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          style={{ fontFamily: "var(--font-data)", fontSize: 12 }}
        />
        <div className="ops-waf-count">{value.length} / 4000 caracteres</div>
      </div>
    );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {conditions.map((c, idx) => {
        const field = EXPR_FIELDS.find((f) => f.key === c.field) ?? EXPR_FIELDS[0];
        const ops = getExprOperators(c.field);
        const op = ops.find((o) => o.key === c.operator) ?? ops[0];
        const isLast = idx === conditions.length - 1;
        return (
          <React.Fragment key={idx}>
            {idx > 0 && <div className="ops-waf-comb">{combinators[idx - 1]}</div>}
            <div className="ops-waf-cond">
              <div className="ops-field">
                {idx === 0 && <ExecLabel>Campo</ExecLabel>}
                <Select value={c.field} onValueChange={(v) => setField(idx, v)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {EXPR_FIELDS.map((f) => (
                      <SelectItem key={f.key} value={f.key}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="ops-field">
                {idx === 0 && <ExecLabel>Operador</ExecLabel>}
                <Select value={c.operator} onValueChange={(v) => setOperator(idx, v, ops)} disabled={field.type === "bool"}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ops.map((o) => (
                      <SelectItem key={o.key} value={o.key}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="ops-field" style={{ minWidth: 0 }}>
                {idx === 0 && <ExecLabel>Valor</ExecLabel>}
                {valueInput(c, idx, op)}
                {geoValueOptions(c.field) && op.valueKind === "text" && <span className="ops-hint">e.g. GB</span>}
              </div>
              <div className="ops-waf-cond-actions">
                {isLast && (
                  <>
                    <button className="ops-btn outline sm" onClick={() => add("and")}>
                      And
                    </button>
                    <button className="ops-btn outline sm" onClick={() => add("or")}>
                      Or
                    </button>
                  </>
                )}
                {conditions.length > 1 && (
                  <button className="ops-btn ghost sm" onClick={() => remove(idx)} title="Remover condição" aria-label="Remover condição">
                    <X size={14} />
                  </button>
                )}
              </div>
            </div>
          </React.Fragment>
        );
      })}
      <div>
        <div className="ops-waf-preview-head">
          <ExecLabel>Prévia da expressão</ExecLabel>
          <button className="ops-waf-link" onClick={() => setMode("raw")}>
            Editar expressão
          </button>
        </div>
        {preview}
        <div className="ops-waf-count">{value.length} / 4000 caracteres</div>
      </div>
    </div>
  );
}

function WafCustomRuleDialog({
  open,
  onOpenChange,
  zoneId,
  rulesetId,
  rules,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  zoneId: string;
  rulesetId: string | null;
  rules: WafRule[];
  editing: WafRule | null;
  onSaved: () => void;
}) {
  const create = useServerFn(createCustomRule);
  const update = useServerFn(updateCustomRule);
  const [seed, setSeed] = React.useState(0);
  const [name, setName] = React.useState("");
  const [expression, setExpression] = React.useState("");
  const [action, setAction] = React.useState<(typeof CF_ACTION_LIST)[number]>("block");
  const [enabled, setEnabled] = React.useState(true);
  // Execution order
  const [order, setOrder] = React.useState<"first" | "last" | "custom">("last");
  const [afterId, setAfterId] = React.useState("");
  const [initialOrder, setInitialOrder] = React.useState<{ order: string; afterId: string }>({ order: "last", afterId: "" });
  // Block — resposta customizada
  const [respType, setRespType] = React.useState("default");
  const [respCode, setRespCode] = React.useState("403");
  const [respContent, setRespContent] = React.useState("");
  // Skip
  const [skipRulesets, setSkipRulesets] = React.useState<string[]>([]);
  const [skipPhases, setSkipPhases] = React.useState<string[]>([]);
  const [skipProducts, setSkipProducts] = React.useState<string[]>([]);
  const [skipLog, setSkipLog] = React.useState(true);
  const [apiOpen, setApiOpen] = React.useState(false);
  const [saving, setSaving] = React.useState(false);

  const others = rules.filter((r) => r.id !== editing?.id);

  React.useEffect(() => {
    if (!open) return;
    const ap = (editing?.action_parameters ?? {}) as {
      response?: { status_code?: number; content_type?: string; content?: string };
      ruleset?: string;
      phases?: string[];
      products?: string[];
    };
    setName(editing?.description ?? "");
    setExpression(editing?.expression ?? "");
    setSeed((s) => s + 1);
    setAction(((CF_ACTION_LIST as readonly string[]).includes(editing?.action ?? "") ? editing!.action : "block") as (typeof CF_ACTION_LIST)[number]);
    setEnabled(editing ? editing.enabled : true);
    let o: "first" | "last" | "custom" = "last";
    let after = "";
    if (editing) {
      const idx = rules.findIndex((r) => r.id === editing.id);
      if (idx === 0) o = "first";
      else if (idx === rules.length - 1) o = "last";
      else if (idx > 0) {
        o = "custom";
        after = rules[idx - 1].id;
      }
    }
    setOrder(o);
    setAfterId(after);
    setInitialOrder({ order: o, afterId: after });
    setRespType(ap.response?.content_type ?? "default");
    setRespCode(String(ap.response?.status_code ?? 403));
    setRespContent(ap.response?.content ?? "");
    setSkipRulesets(ap.ruleset ? [ap.ruleset] : editing ? [] : ["current"]);
    setSkipPhases(ap.phases ?? []);
    setSkipProducts(ap.products ?? []);
    setSkipLog(editing?.logging?.enabled !== false);
    setApiOpen(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  function actionParameters(): Record<string, unknown> | null {
    if (action === "block") {
      if (respType === "default") return null;
      return { response: { status_code: Number(respCode) || 403, content_type: respType, content: respContent } };
    }
    if (action === "skip") {
      const ap: Record<string, unknown> = {};
      if (skipRulesets.includes("current")) ap.ruleset = "current";
      if (skipPhases.length) ap.phases = skipPhases;
      if (skipProducts.length) ap.products = skipProducts;
      return ap;
    }
    return null;
  }

  function position(): { before: string } | { after: string } | undefined {
    const changed = !editing || order !== initialOrder.order || (order === "custom" && afterId !== initialOrder.afterId);
    if (!changed) return undefined;
    if (order === "first") return { before: "" };
    if (order === "custom" && afterId) return { after: afterId };
    if (order === "last") return editing && others.length ? { after: others[others.length - 1].id } : undefined;
    return undefined;
  }

  const ap = actionParameters();
  const code = Number(respCode);
  const blockedReason = !name.trim()
    ? "Dê um nome para a regra."
    : !expression.trim()
      ? "Monte a expressão da regra."
      : expression.length > 4000
        ? "A expressão passa de 4000 caracteres."
        : action === "block" && respType !== "default" && (!Number.isInteger(code) || code < 400 || code > 499)
          ? "O código de resposta precisa estar entre 400 e 499."
          : action === "skip" && !skipRulesets.length && !skipPhases.length && !skipProducts.length
            ? "Escolha ao menos um componente para pular."
            : order === "custom" && !afterId
              ? "Escolha depois de qual regra esta deve rodar."
              : null;

  const pos = position();
  const body: Record<string, unknown> = {
    description: name,
    expression,
    action,
    ...(ap ? { action_parameters: ap } : {}),
    enabled,
    ...(action === "skip" ? { logging: { enabled: skipLog } } : {}),
    ...(pos ? { position: pos } : {}),
  };
  const curl = editing
    ? `curl -X PATCH "https://api.cloudflare.com/client/v4/zones/${zoneId}/rulesets/${rulesetId ?? "{ruleset_id}"}/rules/${editing.id}" \\\n  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  --data '${JSON.stringify(body, null, 2)}'`
    : `curl -X POST "https://api.cloudflare.com/client/v4/zones/${zoneId}/rulesets/phases/http_request_firewall_custom/entrypoint/rules" \\\n  -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \\\n  -H "Content-Type: application/json" \\\n  --data '${JSON.stringify(body, null, 2)}'`;

  async function save() {
    if (blockedReason) {
      toast.error(blockedReason);
      return;
    }
    setSaving(true);
    try {
      const common = {
        zoneId,
        description: name.trim(),
        expression,
        action,
        action_parameters: ap,
        enabled,
        ...(action === "skip" ? { logging: { enabled: skipLog } } : {}),
        ...(pos ? { position: pos } : {}),
      };
      let res: { ok: boolean; error?: string };
      if (editing) {
        if (!rulesetId) {
          toast.error("Ruleset ID não encontrado. Atualize a lista e tente de novo.");
          return;
        }
        res = (await update({ data: { ...common, rulesetId, ruleId: editing.id } })) as { ok: boolean; error?: string };
      } else {
        res = (await create({ data: common })) as { ok: boolean; error?: string };
      }
      if (res.ok) {
        toast.success(editing ? "Custom rule atualizada." : "Custom rule criada.");
        onSaved();
      } else toast.error(res.error ?? "Falha ao salvar a regra.");
    } finally {
      setSaving(false);
    }
  }

  function toggle(list: string[], set: (v: string[]) => void, key: string, on: boolean) {
    set(on ? [...list, key] : list.filter((k) => k !== key));
  }
  const actionMeta = WAF_ACTIONS.find((a) => a.key === action);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" style={{ maxHeight: "88vh", overflowY: "auto", background: "var(--v2-bg)" }}>
        <DialogHeader>
          <DialogTitle style={{ fontSize: 20 }}>{editing ? "Editar custom rule" : "Criar custom rule"}</DialogTitle>
          <p className="ops-hint" style={{ margin: 0 }}>
            Proteja o site e as APIs contra tráfego malicioso com custom rules. Configure os critérios de mitigação e a ação.
          </p>
        </DialogHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 14, minWidth: 0 }}>
          <section className="ops-waf-sec">
            <div className="ops-field">
              <ExecLabel>Nome da regra</ExecLabel>
              <Input value={name} maxLength={500} placeholder="Ex.: Geoblock" onChange={(e) => setName(e.target.value)} />
              <span className="ops-hint">Dê um nome descritivo para a regra.</span>
            </div>
          </section>

          <section className="ops-waf-sec">
            <h4>Quando a requisição bater com…</h4>
            <ExpressionBuilderField value={expression} onChange={setExpression} seed={seed} />
          </section>

          <section className="ops-waf-sec">
            <h4>Então executar a ação…</h4>
            <div className="ops-field" style={{ maxWidth: 320 }}>
              <ExecLabel>Escolher ação</ExecLabel>
              <Select value={action} onValueChange={(v) => setAction(v as (typeof CF_ACTION_LIST)[number])}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {WAF_ACTIONS.map((a) => (
                    <SelectItem key={a.key} value={a.key}>
                      {a.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span className="ops-hint">{actionMeta?.desc}</span>
            </div>

            {action === "block" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <div className="ops-field" style={{ flex: "1 1 260px" }}>
                    <ExecLabel>Tipo de resposta</ExecLabel>
                    <Select value={respType} onValueChange={setRespType}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {WAF_BLOCK_RESPONSE_TYPES.map((t) => (
                          <SelectItem key={t.key} value={t.key}>
                            {t.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {respType !== "default" && (
                    <div className="ops-field" style={{ flex: "0 0 140px" }}>
                      <ExecLabel>Código de resposta</ExecLabel>
                      <Input inputMode="numeric" value={respCode} onChange={(e) => setRespCode(e.target.value.replace(/\D/g, "").slice(0, 3))} />
                      <span className="ops-hint">Entre 400 e 499.</span>
                    </div>
                  )}
                </div>
                {respType !== "default" && (
                  <div className="ops-field">
                    <ExecLabel>Corpo da resposta</ExecLabel>
                    <Textarea
                      rows={5}
                      value={respContent}
                      onChange={(e) => setRespContent(e.target.value)}
                      style={{ fontFamily: "var(--font-data)", fontSize: 12 }}
                    />
                  </div>
                )}
              </div>
            )}

            {action === "skip" && (
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <ExecLabel>Componentes de WAF a pular</ExecLabel>
                {[
                  ...WAF_SKIP_RULESETS.map((o) => ({ ...o, list: skipRulesets, set: setSkipRulesets })),
                  ...WAF_SKIP_PHASES.map((o) => ({ ...o, list: skipPhases, set: setSkipPhases })),
                ].map((o) => (
                  <label key={o.key} className="ops-waf-check">
                    <Checkbox checked={o.list.includes(o.key)} onCheckedChange={(v) => toggle(o.list, o.set, o.key, v === true)} />
                    {o.label}
                  </label>
                ))}
                <ExecLabel>Mais componentes</ExecLabel>
                <div className="ops-waf-check-grid">
                  {WAF_SKIP_PRODUCTS.map((o) => (
                    <label key={o.key} className="ops-waf-check">
                      <Checkbox
                        checked={skipProducts.includes(o.key)}
                        onCheckedChange={(v) => toggle(skipProducts, setSkipProducts, o.key, v === true)}
                      />
                      {o.label}
                    </label>
                  ))}
                </div>
                <label className="ops-waf-check" style={{ marginTop: 4 }}>
                  <Checkbox checked={skipLog} onCheckedChange={(v) => setSkipLog(v === true)} />
                  Registrar as requisições que baterem (Log matching requests)
                </label>
              </div>
            )}
          </section>

          <section className="ops-waf-sec">
            <h4>Ordem de execução</h4>
            <span className="ops-hint" style={{ marginTop: -4 }}>
              As regras são avaliadas em sequência. A posição escolhida define em que ponto dessa sequência esta regra avalia o tráfego.
            </span>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              <div className="ops-field" style={{ flex: "0 1 240px" }}>
                <ExecLabel>Selecionar ordem</ExecLabel>
                <Select value={order} onValueChange={(v) => setOrder(v as "first" | "last" | "custom")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="first">Primeira (First)</SelectItem>
                    <SelectItem value="last">Última (Last)</SelectItem>
                    <SelectItem value="custom" disabled={others.length === 0}>
                      Personalizada (Custom)
                    </SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {order === "custom" && (
                <div className="ops-field" style={{ flex: "1 1 280px" }}>
                  <ExecLabel>Rodar depois da regra</ExecLabel>
                  <Select value={afterId} onValueChange={setAfterId}>
                    <SelectTrigger>
                      <SelectValue placeholder="Selecione a regra…" />
                    </SelectTrigger>
                    <SelectContent>
                      {others.map((r) => (
                        <SelectItem key={r.id} value={r.id}>
                          {rules.indexOf(r) + 1}. {r.description || r.id}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              )}
            </div>
          </section>

          <section className="ops-waf-sec">
            <h4>Status</h4>
            <span className="ops-hint" style={{ marginTop: -4 }}>
              Controla se a regra avalia ativamente o tráfego que chega.
            </span>
            <label className="ops-waf-check">
              <input type="radio" name="waf-status" checked={!enabled} onChange={() => setEnabled(false)} />
              Desabilitada
            </label>
            <label className="ops-waf-check">
              <input type="radio" name="waf-status" checked={enabled} onChange={() => setEnabled(true)} />
              Ativa
            </label>
          </section>

          <section className="ops-waf-sec">
            <button className="ops-waf-api-toggle" onClick={() => setApiOpen((v) => !v)} aria-expanded={apiOpen}>
              Salvar via chamada de API <ChevronDown size={14} style={{ transform: apiOpen ? "rotate(180deg)" : undefined }} />
            </button>
            {apiOpen && (
              <div className="ops-code-wrap">
                <pre className="ops-waf-curl">{curl}</pre>
                <button
                  className="ops-btn outline sm ops-code-copy"
                  onClick={() =>
                    navigator.clipboard.writeText(curl).then(
                      () => toast.success("Comando copiado."),
                      () => toast.error("Não foi possível copiar."),
                    )
                  }
                >
                  <Copy size={12} /> Copiar
                </button>
              </div>
            )}
          </section>
        </div>
        <DialogFooter style={{ justifyContent: "space-between", alignItems: "center", gap: 10 }}>
          <button className="ops-btn outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            {blockedReason && <span className="ops-hint">{blockedReason}</span>}
            <button className="ops-btn primary" onClick={save} disabled={saving || !!blockedReason}>
              {saving ? <Loader2 size={12} className="ops-spin" /> : <Check size={12} />}
              {editing ? "Salvar" : "Criar regra"}
            </button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// RULES (Overview + Page Rules)
// ══════════════════════════════════════════════════════════════════════════════
// Igual ao padrão já usado em AnalyticsTab: admin/module admin sempre passam;
// senão depende da permissão granular específica.
function useCfWafCan() {
  const { can, isAdmin, isModuleAdmin } = usePermissions();
  return (action: string) => isAdmin || isModuleAdmin("cloudflare-waf") || can("cloudflare-waf", action);
}

// Mesmo texto/ícone usados em app.$module.tsx pro bloqueio de módulo inteiro
// — reaproveitado aqui pra sub-seção, já que não existe componente
// compartilhado pra isso no app.
function AccessRestrictedCard({ text }: { text?: string }) {
  return (
    <div
      style={{
        border: `1px solid ${V2.border}`,
        background: V2.surface,
        borderRadius: 8,
        padding: 32,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        textAlign: "center",
        gap: 10,
      }}
    >
      <Lock size={28} color={T.textMuted} />
      <div style={{ fontSize: 14, fontWeight: 700, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Acesso restrito</div>
      <div style={{ fontSize: 12, color: V2.textMuted, maxWidth: 360 }}>
        {text ?? "Você não tem permissão para visualizar esta seção. Solicite acesso ao administrador."}
      </div>
    </div>
  );
}

function RulesInner({ zones }: { zones: CRZone[] }) {
  const [zoneId, setZoneId, zoneShared] = useZoneState("");
  const qc = useQueryClient();
  const overviewFetching = useIsFetching({ queryKey: ["cf-rules-overview", zoneId] }) > 0;
  const pageRulesFetching = useIsFetching({ queryKey: ["cf-page-rules", zoneId] }) > 0;
  const refreshPageRules = zoneId ? (
    <button
      className="ops-btn outline sm"
      onClick={() => qc.invalidateQueries({ queryKey: ["cf-page-rules", zoneId] })}
      disabled={pageRulesFetching}
    >
      {pageRulesFetching ? <Loader2 size={12} className="ops-spin" /> : <RefreshCw size={12} />}
      Atualizar
    </button>
  ) : null;
  const refreshOverview = zoneId ? (
    <button
      className="ops-btn outline sm"
      onClick={() => qc.invalidateQueries({ queryKey: ["cf-rules-overview", zoneId] })}
      disabled={overviewFetching}
    >
      {overviewFetching ? <Loader2 size={12} className="ops-spin" /> : <RefreshCw size={12} />}
      Atualizar
    </button>
  ) : null;
  const cfCan = useCfWafCan();
  const canOverview = cfCan("manage_rules_overview");
  const canPageRules = cfCan("manage_rules_page_rules");
  const [rulesTab, setRulesTab] = React.useState<"overview" | "page">(canOverview ? "overview" : "page");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
      {/* Zona compartilhada pelos dois cartões (escondida quando vem da barra do módulo) */}
      {!zoneShared && (
      <div className="ops-zone-bar">
        <div className="ops-field">
          <ExecLabel>Domínio (zona)</ExecLabel>
          <SearchableSelect
            options={zones.map((z) => ({ value: z.id, label: z.name }))}
            value={zoneId}
            onValueChange={setZoneId}
            placeholder="Selecione uma zona…"
            searchPlaceholder="Buscar por domínio…"
          />
        </div>
      </div>
      )}

      {!canOverview && !canPageRules ? (
        <AccessRestrictedCard text="Você não tem permissão pra ver Overview nem Page Rules. Solicite acesso ao administrador." />
      ) : (
        <div className="ops-cards one">
          {canOverview && canPageRules && (
            <div className="ops-subtabs" role="tablist" aria-label="Regras">
              <button
                type="button"
                role="tab"
                aria-selected={rulesTab === "overview"}
                className={`ops-subtab${rulesTab === "overview" ? " active" : ""}`}
                onClick={() => setRulesTab("overview")}
              >
                Visão geral
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={rulesTab === "page"}
                className={`ops-subtab${rulesTab === "page" ? " active" : ""}`}
                onClick={() => setRulesTab("page")}
              >
                Page Rules
              </button>
            </div>
          )}
          {canOverview && (!canPageRules || rulesTab === "overview") && (
            <OpsCard title="Visão geral das regras" description="Todas as regras da zona por categoria" action={refreshOverview}>
              {zoneId ? (
                <RulesOverviewSection zoneId={zoneId} />
              ) : (
                <p className="ops-card-desc" style={{ textAlign: "center", padding: "20px 0" }}>
                  Selecione uma zona para ver as regras.
                </p>
              )}
            </OpsCard>
          )}
          {canPageRules && (!canOverview || rulesTab === "page") && (
            <OpsCard title="Page Rules" description="Regras por URL (modelo antigo da Cloudflare)" action={refreshPageRules}>
              {zoneId ? (
                <PageRulesSection zoneId={zoneId} />
              ) : (
                <p className="ops-card-desc" style={{ textAlign: "center", padding: "20px 0" }}>
                  Selecione uma zona para ver as Page Rules.
                </p>
              )}
            </OpsCard>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Rules → Overview ───────────────────────────────────────────────────────────
function RulesOverviewSection({ zoneId }: { zoneId: string }) {
  const qc = useQueryClient();
  const fetchOverview = useServerFn(getRulesOverview);
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["cf-rules-overview", zoneId],
    queryFn: () => fetchOverview({ data: { zoneId } }),
    enabled: !!zoneId,
  });
  const categories: RuleCategoryResult[] = (data as any)?.ok ? (data as any).categories : [];
  const topError = (data as any)?.ok === false ? (data as any).error : null;

  const [createCategory, setCreateCategory] = React.useState<RuleCategoryKey | null>(null);
  const [editRule, setEditRule] = React.useState<{ cat: RuleCategoryResult; rule: OverviewRule } | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<{ cat: RuleCategoryResult; rule: OverviewRule } | null>(null);
  // Toda regra nova sobe desativada por segurança (ver enabled:false nas
  // funções de create em cloudflare.rules.functions.ts) — esse alerta avisa
  // isso logo após criar, só no fluxo de criação (não em edição).
  const [showDisabledNotice, setShowDisabledNotice] = React.useState(false);
  function afterRuleCreated() {
    setCreateCategory(null);
    invalidate();
    setShowDisabledNotice(true);
  }
  const [deleting, setDeleting] = React.useState(false);
  const doDeleteRedirect = useServerFn(deleteRedirectRule);
  const doDeleteCache = useServerFn(deleteCacheRule);
  const doDeleteGeneric = useServerFn(deleteOverviewRule);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["cf-rules-overview", zoneId] });
  }

  // "configuration", "cache" e "cache_response" também estão em
  // GENERIC_CRUD_CATEGORIES (reaproveitam createOverviewRule/updateOverviewRule
  // por baixo), mas cada uma tem diálogo PRÓPRIO
  // (ConfigurationRuleDialog/CacheRuleDialog/CacheResponseRuleDialog) — nunca
  // devem virar o activeGenericCategory do OverviewRuleDialog genérico, que
  // nem sabe montar o formato delas.
  function isGenericCategory(key: RuleCategoryKey): key is OverviewDialogCategory {
    return (
      (GENERIC_CRUD_CATEGORIES as readonly string[]).includes(key) &&
      key !== "configuration" &&
      key !== "cache" &&
      key !== "cache_response"
    );
  }

  async function handleDelete() {
    if (!deleteTarget || !deleteTarget.cat.rulesetId) return;
    setDeleting(true);
    try {
      const res: any =
        deleteTarget.cat.key === "cache"
          ? await doDeleteCache({
              data: { zoneId, rulesetId: deleteTarget.cat.rulesetId, ruleId: deleteTarget.rule.id, description: deleteTarget.rule.description },
            })
          : deleteTarget.cat.key === "redirect"
            ? await doDeleteRedirect({
                data: { zoneId, rulesetId: deleteTarget.cat.rulesetId, ruleId: deleteTarget.rule.id, description: deleteTarget.rule.description },
              })
            : await doDeleteGeneric({
                data: {
                  zoneId,
                  category: deleteTarget.cat.key as GenericCrudCategory,
                  rulesetId: deleteTarget.cat.rulesetId,
                  ruleId: deleteTarget.rule.id,
                  description: deleteTarget.rule.description,
                },
              });
      if (res.ok) {
        toast.success("Regra excluída.");
        setDeleteTarget(null);
        invalidate();
      } else toast.error(res.error);
    } finally {
      setDeleting(false);
    }
  }

  const redirectCategory = categories.find((c) => c.key === "redirect") ?? null;
  const cacheCategory = categories.find((c) => c.key === "cache") ?? null;
  const cacheResponseCategory = categories.find((c) => c.key === "cache_response") ?? null;
  const configurationCategory = categories.find((c) => c.key === "configuration") ?? null;
  const activeGenericCategory: RuleCategoryKey | null =
    createCategory && isGenericCategory(createCategory) ? createCategory : editRule && isGenericCategory(editRule.cat.key) ? editRule.cat.key : null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>

      {topError && <div className="ops-empty">{topError}</div>}

      {categories.map((cat) => (
        <RuleCategoryCard
          key={cat.key}
          zoneId={zoneId}
          category={cat}
          onCreate={cat.supportsCrud ? () => setCreateCategory(cat.key) : undefined}
          onEdit={cat.supportsCrud ? (rule) => setEditRule({ cat, rule }) : undefined}
          onDelete={cat.supportsCrud ? (rule) => setDeleteTarget({ cat, rule }) : undefined}
          onToggled={invalidate}
          onDuplicated={() => setShowDisabledNotice(true)}
        />
      ))}

      <RedirectRuleDialog
        open={createCategory === "redirect"}
        onOpenChange={(o) => !o && setCreateCategory(null)}
        zoneId={zoneId}
        rulesetId={redirectCategory?.rulesetId ?? null}
        existingRules={redirectCategory?.rules ?? []}
        onSaved={afterRuleCreated}
      />
      <RedirectRuleDialog
        open={!!editRule && editRule.cat.key === "redirect"}
        onOpenChange={(o) => !o && setEditRule(null)}
        zoneId={zoneId}
        existingRules={redirectCategory?.rules ?? []}
        rulesetId={editRule?.cat.rulesetId ?? null}
        editing={editRule?.cat.key === "redirect" ? editRule.rule : null}
        onSaved={() => {
          setEditRule(null);
          invalidate();
        }}
      />

      <CacheRuleDialog
        open={createCategory === "cache"}
        onOpenChange={(o) => !o && setCreateCategory(null)}
        zoneId={zoneId}
        rulesetId={cacheCategory?.rulesetId ?? null}
        existingRules={cacheCategory?.rules ?? []}
        onSaved={afterRuleCreated}
      />
      <CacheRuleDialog
        open={!!editRule && editRule.cat.key === "cache"}
        onOpenChange={(o) => !o && setEditRule(null)}
        zoneId={zoneId}
        rulesetId={editRule?.cat.rulesetId ?? null}
        existingRules={cacheCategory?.rules ?? []}
        editing={editRule?.cat.key === "cache" ? editRule.rule : null}
        onSaved={() => {
          setEditRule(null);
          invalidate();
        }}
      />

      <OverviewRuleDialog
        open={
          !!createCategory &&
          createCategory !== "redirect" &&
          createCategory !== "cache" &&
          createCategory !== "cache_response" &&
          createCategory !== "configuration" &&
          !!activeGenericCategory
        }
        onOpenChange={(o) => !o && setCreateCategory(null)}
        zoneId={zoneId}
        categoryKey={(activeGenericCategory as OverviewDialogCategory) ?? "url_rewrite"}
        rulesetId={categories.find((c) => c.key === activeGenericCategory)?.rulesetId ?? null}
        existingRules={categories.find((c) => c.key === activeGenericCategory)?.rules ?? []}
        onSaved={afterRuleCreated}
      />
      <OverviewRuleDialog
        open={
          !!editRule &&
          editRule.cat.key !== "redirect" &&
          editRule.cat.key !== "cache" &&
          editRule.cat.key !== "cache_response" &&
          editRule.cat.key !== "configuration"
        }
        onOpenChange={(o) => !o && setEditRule(null)}
        zoneId={zoneId}
        categoryKey={(activeGenericCategory as OverviewDialogCategory) ?? "url_rewrite"}
        rulesetId={editRule?.cat.rulesetId ?? null}
        existingRules={editRule?.cat.rules ?? []}
        editing={
          editRule &&
          editRule.cat.key !== "redirect" &&
          editRule.cat.key !== "cache" &&
          editRule.cat.key !== "cache_response" &&
          editRule.cat.key !== "configuration"
            ? editRule.rule
            : null
        }
        onSaved={() => {
          setEditRule(null);
          invalidate();
        }}
      />

      <CacheResponseRuleDialog
        open={createCategory === "cache_response"}
        onOpenChange={(o) => !o && setCreateCategory(null)}
        zoneId={zoneId}
        rulesetId={cacheResponseCategory?.rulesetId ?? null}
        existingRules={cacheResponseCategory?.rules ?? []}
        onSaved={afterRuleCreated}
      />
      <CacheResponseRuleDialog
        open={!!editRule && editRule.cat.key === "cache_response"}
        onOpenChange={(o) => !o && setEditRule(null)}
        zoneId={zoneId}
        rulesetId={editRule?.cat.rulesetId ?? null}
        existingRules={cacheResponseCategory?.rules ?? []}
        editing={editRule?.cat.key === "cache_response" ? editRule.rule : null}
        onSaved={() => {
          setEditRule(null);
          invalidate();
        }}
      />

      <ConfigurationRuleDialog
        open={createCategory === "configuration"}
        onOpenChange={(o) => !o && setCreateCategory(null)}
        zoneId={zoneId}
        rulesetId={configurationCategory?.rulesetId ?? null}
        existingRules={configurationCategory?.rules ?? []}
        onSaved={afterRuleCreated}
      />
      <ConfigurationRuleDialog
        open={!!editRule && editRule.cat.key === "configuration"}
        onOpenChange={(o) => !o && setEditRule(null)}
        zoneId={zoneId}
        rulesetId={editRule?.cat.rulesetId ?? null}
        existingRules={configurationCategory?.rules ?? []}
        editing={editRule?.cat.key === "configuration" ? editRule.rule : null}
        onSaved={() => {
          setEditRule(null);
          invalidate();
        }}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir regra</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a regra <strong>{deleteTarget?.rule.description}</strong>? Essa ação não
              pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDisabledNotice} onOpenChange={setShowDisabledNotice}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ShieldCheck size={16} color={T.accent} />
              Regra criada — desativada por segurança
            </AlertDialogTitle>
            <AlertDialogDescription>
              Toda regra nova é criada desativada por padrão. Confira se ela está correta e habilite pelo botão de
              energia na listagem quando estiver pronta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowDisabledNotice(false)}>Entendi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Menu de ações por linha (Edit/Duplicate/Move up/Move down/Move to…) — igual
// ao nativo. Disable/Delete ficam de fora de propósito: já existem como
// botões próprios ao lado, então não duplica aqui.
function RuleRowActionsMenu({
  onEdit,
  onDuplicate,
  duplicating,
  canMoveUp,
  onMoveUp,
  canMoveDown,
  onMoveDown,
  onMoveTo,
  moving,
  locked,
}: {
  onEdit?: () => void;
  onDuplicate: () => void;
  duplicating?: boolean;
  canMoveUp: boolean;
  onMoveUp: () => void;
  canMoveDown: boolean;
  onMoveDown: () => void;
  onMoveTo: () => void;
  moving?: boolean;
  // Sem a permissão granular dessa categoria — trava o menu inteiro (Edit/
  // Duplicate/Move* são todas ações de escrita).
  locked?: boolean;
}) {
  if (locked) {
    return (
      <button className="ops-btn ghost sm" disabled title="Você não tem permissão pra gerenciar esta categoria">
        <Lock size={12} color={T.textMuted} />
      </button>
    );
  }
  return (
    <>
    {onEdit && (
      <button className="ops-btn outline sm" onClick={onEdit}>
        <Pencil size={12} /> Editar
      </button>
    )}
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="ops-btn ghost sm" title="Mais ações" aria-label="Mais ações" disabled={duplicating || moving}>
          {duplicating || moving ? <Loader2 size={13} className="ops-spin" /> : <MoreHorizontal size={14} />}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={onDuplicate}>Duplicate</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={onMoveUp} disabled={!canMoveUp}>
          <ArrowUp size={13} style={{ marginRight: 6 }} /> Move up
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onMoveDown} disabled={!canMoveDown}>
          <ArrowDown size={13} style={{ marginRight: 6 }} /> Move down
        </DropdownMenuItem>
        <DropdownMenuItem onClick={onMoveTo}>Move to…</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    </>
  );
}

// Popup "Move row" — Current position (read-only) + New position, igual ao
// print nativo.
function MoveToPositionDialog({
  open,
  onOpenChange,
  currentPosition,
  maxPosition,
  onConfirm,
  saving,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  currentPosition: number;
  maxPosition: number;
  onConfirm: (newPosition: number) => void;
  saving?: boolean;
}) {
  const [value, setValue] = React.useState(currentPosition);
  React.useEffect(() => {
    if (open) setValue(currentPosition);
  }, [open, currentPosition]);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Move row</DialogTitle>
        </DialogHeader>
        <div style={{ display: "flex", gap: 16, padding: "8px 0" }}>
          <div className="ops-field" style={{ flex: 1 }}>
            <ExecLabel>Current position</ExecLabel>
            <Input value={currentPosition} disabled />
          </div>
          <div className="ops-field" style={{ flex: 1 }}>
            <ExecLabel>New position</ExecLabel>
            <Input
              type="number"
              min={1}
              max={maxPosition}
              value={value}
              onChange={(e) => setValue(Number(e.target.value) || 1)}
            />
          </div>
        </div>
        <DialogFooter>
          <button className="ops-btn outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </button>
          <button
            className="ops-btn primary"
            onClick={() => onConfirm(Math.max(1, Math.min(maxPosition, value)))}
            disabled={saving}
          >
            {saving ? <Loader2 size={12} className="ops-spin" /> : <Check size={12} />}
            Confirm
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Expressão da Cloudflare quebrada em linhas nos and/or do nível mais externo
// em que eles aparecem (só para leitura; o texto enviado à API não muda)
function formatRuleExpression(expr: string): string {
  if (!expr) return "";
  const tokenAt = (i: number) => /^ (and|or) /.exec(expr.slice(i));
  // 1ª passada: menor profundidade de parênteses com and/or
  let depth = 0;
  let minDepth = Infinity;
  let inStr = false;
  for (let i = 0; i < expr.length; i++) {
    const ch = expr[i];
    if (ch === '"') inStr = !inStr;
    if (inStr) continue;
    if (ch === "(") depth++;
    else if (ch === ")") depth = Math.max(0, depth - 1);
    else if (ch === " " && tokenAt(i)) minDepth = Math.min(minDepth, depth);
  }
  if (!Number.isFinite(minDepth)) return expr;
  // 2ª passada: quebra só nessa profundidade
  depth = 0;
  inStr = false;
  let out = "";
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (ch === '"') inStr = !inStr;
    if (!inStr) {
      if (ch === "(") depth++;
      else if (ch === ")") depth = Math.max(0, depth - 1);
      const m = ch === " " && depth === minDepth ? tokenAt(i) : null;
      if (m) {
        out += `\n${m[1]} `;
        i += m[0].length;
        continue;
      }
    }
    out += ch;
    i++;
  }
  return out;
}

function RuleReadOnly({ rule }: { rule: OverviewRule }) {
  const [copied, setCopied] = React.useState(false);
  const params = rule.action_parameters && Object.keys(rule.action_parameters).length > 0 ? rule.action_parameters : null;
  function copy() {
    navigator.clipboard.writeText(rule.expression).then(
      () => {
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1500);
      },
      () => toast.error("Não foi possível copiar"),
    );
  }
  return (
    <div className="ops-root" style={{ display: "grid", gap: 20 }}>
      <DetailSection title="Resumo">
        <DetailList
          items={[
            ["Nome", rule.description || "—"],
            ["Ação", rule.action, true],
            ["Status", rule.enabled ? "Ativa" : "Desativada"],
            ["Ordem", String(rule.order)],
            ["ID", rule.id, true],
          ]}
        />
      </DetailSection>
      <DetailSection title="Quando dispara (expressão)">
        <div className="ops-code-wrap">
          <button type="button" className="ops-btn ghost sm ops-code-copy" onClick={copy}>
            {copied ? <Check size={12} /> : <Copy size={12} />}
            {copied ? "Copiado" : "Copiar"}
          </button>
          <pre className="ops-code">{rule.expression ? formatRuleExpression(rule.expression) : "—"}</pre>
        </div>
      </DetailSection>
      {params && (
        <DetailSection title="O que faz (parâmetros da ação)">
          <pre className="ops-code">{JSON.stringify(params, null, 2)}</pre>
        </DetailSection>
      )}
    </div>
  );
}

function RuleCategoryCard({
  zoneId,
  category,
  onCreate,
  onEdit,
  onDelete,
  onToggled,
  onDuplicated,
}: {
  zoneId: string;
  category: RuleCategoryResult;
  onCreate?: () => void;
  onEdit?: (rule: OverviewRule) => void;
  onDelete?: (rule: OverviewRule) => void;
  onToggled: () => void;
  // Duplicar também cria uma regra nova (sobe desativada por segurança, igual
  // ao Create) — dispara o mesmo alerta de aviso lá em RulesInner.
  onDuplicated?: () => void;
}) {
  const cfCan = useCfWafCan();
  const { isAdmin } = usePermissions();
  // Só criar/editar/excluir/reordenar exige a permissão da categoria — ver a
  // listagem já foi liberada por "manage_rules_overview" (isso aqui é chamado
  // de dentro de RulesOverviewSection, que já garantiu isso).
  const canManage = cfCan(OVERVIEW_CATEGORY_PERMISSION[category.key]);
  // Excluir é destrutivo/irreversível — exige perfil global admin/super admin
  // além da permissão granular da categoria (mesmo piso extra do backend).
  const canDelete = canManage && isAdmin;
  const doUpdateRedirect = useServerFn(updateRedirectRule);
  const doUpdateGeneric = useServerFn(updateOverviewRule);
  const doCreateRedirect = useServerFn(createRedirectRule);
  const doCreateGeneric = useServerFn(createOverviewRule);
  const doReorder = useServerFn(reorderOverviewRule);
  const [togglingId, setTogglingId] = React.useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = React.useState<string | null>(null);
  const [movingId, setMovingId] = React.useState<string | null>(null);
  const [moveToTarget, setMoveToTarget] = React.useState<OverviewRule | null>(null);
  // Regra aberta no painel lateral (só leitura). Guarda o id para refletir
  // mudanças (ligar/desligar) feitas com o painel aberto.
  const [viewRuleId, setViewRuleId] = React.useState<string | null>(null);
  const [viewOpen, setViewOpen] = React.useState(false);
  const viewRule = category.rules.find((x) => x.id === viewRuleId) ?? null;

  async function handleToggle(rule: OverviewRule) {
    if (!category.rulesetId || !category.supportsCrud || !canManage) return;
    setTogglingId(rule.id);
    try {
      let res: any;
      if (category.key === "redirect") {
        const fromValue = (rule.action_parameters as any)?.from_value ?? {};
        res = await doUpdateRedirect({
          data: {
            zoneId,
            rulesetId: category.rulesetId,
            ruleId: rule.id,
            description: rule.description,
            expression: rule.expression,
            targetType: typeof fromValue?.target_url?.expression === "string" ? "dynamic" : "static",
            targetUrl: fromValue?.target_url?.expression ?? fromValue?.target_url?.value ?? "",
            statusCode: fromValue?.status_code ?? 301,
            preserveQueryString: fromValue?.preserve_query_string ?? false,
            enabled: !rule.enabled,
            changeKind: "toggle",
          },
        });
      } else {
        // Categorias genéricas: reenvia a própria action/action_parameters
        // já carregada na listagem, só inverte enabled — não precisa saber o
        // formato específico de cada categoria pra isso.
        res = await doUpdateGeneric({
          data: {
            zoneId,
            category: category.key as GenericCrudCategory,
            rulesetId: category.rulesetId,
            ruleId: rule.id,
            description: rule.description,
            expression: rule.expression,
            action: rule.action,
            action_parameters: rule.action_parameters ?? {},
            enabled: !rule.enabled,
            changeKind: "toggle",
          },
        });
      }
      if (res.ok) {
        toast.success(rule.enabled ? "Regra desabilitada." : "Regra habilitada.");
        onToggled();
      } else toast.error(res.error);
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDuplicate(rule: OverviewRule) {
    if (!category.rulesetId || !category.supportsCrud || !canManage) return;
    setDuplicatingId(rule.id);
    try {
      let res: any;
      const description = `${rule.description} (copy)`;
      const position = { after: rule.id };
      if (category.key === "redirect") {
        const fromValue = (rule.action_parameters as any)?.from_value ?? {};
        res = await doCreateRedirect({
          data: {
            zoneId,
            description,
            expression: rule.expression,
            targetType: typeof fromValue?.target_url?.expression === "string" ? "dynamic" : "static",
            targetUrl: fromValue?.target_url?.expression ?? fromValue?.target_url?.value ?? "",
            statusCode: fromValue?.status_code ?? 301,
            preserveQueryString: fromValue?.preserve_query_string ?? false,
            position,
          },
        });
      } else {
        res = await doCreateGeneric({
          data: {
            zoneId,
            category: category.key as GenericCrudCategory,
            description,
            expression: rule.expression,
            action: rule.action,
            action_parameters: rule.action_parameters ?? {},
            position,
          },
        });
      }
      if (res.ok) {
        toast.success("Regra duplicada.");
        onToggled();
        onDuplicated?.();
      } else toast.error(res.error);
    } finally {
      setDuplicatingId(null);
    }
  }

  async function handleReorder(rule: OverviewRule, position: { index: number } | { before: string } | { after: string }) {
    if (!category.rulesetId || !canManage) return;
    setMovingId(rule.id);
    try {
      const res: any = await doReorder({ data: { zoneId, category: category.key, rulesetId: category.rulesetId, ruleId: rule.id, position } });
      if (res.ok) onToggled();
      else toast.error(res.error);
    } finally {
      setMovingId(null);
    }
  }

  function handleMoveUp(rule: OverviewRule) {
    const idx = category.rules.findIndex((r) => r.id === rule.id);
    if (idx <= 0) return;
    handleReorder(rule, { before: category.rules[idx - 1].id });
  }
  function handleMoveDown(rule: OverviewRule) {
    const idx = category.rules.findIndex((r) => r.id === rule.id);
    if (idx === -1 || idx >= category.rules.length - 1) return;
    handleReorder(rule, { after: category.rules[idx + 1].id });
  }
  async function handleMoveToConfirm(newPosition: number) {
    if (!moveToTarget) return;
    const others = category.rules.filter((r) => r.id !== moveToTarget.id);
    const clamped = Math.max(1, Math.min(others.length + 1, newPosition));
    const position = clamped <= 1 ? { before: "" } : { after: others[clamped - 2].id };
    await handleReorder(moveToTarget, position);
    setMoveToTarget(null);
  }

  const activeCount = category.rules.filter((r) => r.enabled).length;
  const hasActions = !!(onEdit || onDelete || category.supportsCrud);

  return (
    <>
    <div className="ops-rule-cat">
      <div className="ops-rule-cat-header">
        <div className="ops-rule-cat-title">
          <span>{category.label}</span>
          {category.rules.length > 0 && <span className="ops-rule-cat-count">{activeCount} active</span>}
        </div>
        {!onCreate ? (
          <button className="ops-btn outline sm" disabled title="Em breve — falta confirmar o formato de action_parameters dessa categoria">
            <Plus size={11} /> Create rule
          </button>
        ) : !canManage ? (
          <button className="ops-btn outline sm" disabled title="Você não tem permissão pra gerenciar esta categoria">
            <Lock size={11} /> Create rule
          </button>
        ) : (
          <button className="ops-btn primary sm" onClick={onCreate}>
            <Plus size={11} /> Create rule
          </button>
        )}
      </div>
      {category.error ? (
        <div className="ops-empty">{category.error}</div>
      ) : category.rules.length === 0 ? (
        <div className="ops-empty">No {category.label} created</div>
      ) : (
        <div className="ops-table-wrap" style={{ maxHeight: 280 }}>
          <table className="ops-table">
            <thead>
              <tr>
                <th style={{ width: 40 }}>Order</th>
                <th>Name</th>
                <th>Match against</th>
                <th>Action</th>
                <th>Status</th>
                {hasActions && <th style={{ textAlign: "right" }}>Ações</th>}
              </tr>
            </thead>
            <tbody>
              {category.rules.map((r, rowIdx) => (
                <tr
                  key={r.id}
                  className="ops-row-click"
                  tabIndex={0}
                  title="Ver a regra completa"
                  onClick={() => {
                    setViewRuleId(r.id);
                    setViewOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setViewRuleId(r.id);
                      setViewOpen(true);
                    }
                  }}
                >
                  <td className="mono dim">{r.order}</td>
                  <td style={{ fontWeight: 500 }}>{r.description || "—"}</td>
                  <td className="mono trunc" style={{ maxWidth: 260 }} title={r.expression}>
                    {r.expression || "—"}
                  </td>
                  <td className="mono dim">{r.action}</td>
                  <td>
                    {r.enabled ? (
                      <span className="ops-rule-status-active">Active</span>
                    ) : (
                      <span className="ops-rule-status-disabled">Disabled</span>
                    )}
                  </td>
                  {hasActions && (
                    <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2 }}>
                        {category.supportsCrud && (
                          <RuleRowActionsMenu
                            onEdit={onEdit ? () => onEdit(r) : undefined}
                            onDuplicate={() => handleDuplicate(r)}
                            duplicating={duplicatingId === r.id}
                            moving={movingId === r.id}
                            canMoveUp={rowIdx > 0}
                            onMoveUp={() => handleMoveUp(r)}
                            canMoveDown={rowIdx < category.rules.length - 1}
                            onMoveDown={() => handleMoveDown(r)}
                            onMoveTo={() => setMoveToTarget(r)}
                            locked={!canManage}
                          />
                        )}
                        {category.supportsCrud && (
                          <button
                            className="ops-btn ghost sm"
                            onClick={() => handleToggle(r)}
                            disabled={togglingId === r.id || !canManage}
                            title={!canManage ? "Você não tem permissão pra gerenciar esta categoria" : r.enabled ? "Desabilitar" : "Habilitar"}
                          >
                            {togglingId === r.id ? (
                              <Loader2 size={13} className="ops-spin" />
                            ) : !canManage ? (
                              <Lock size={12} color={T.textMuted} />
                            ) : (
                              <Power size={13} color={r.enabled ? T.success : V2.textMuted} />
                            )}
                          </button>
                        )}
                        {onDelete && (
                          <button
                            className="ops-btn ghost sm"
                            onClick={() => canDelete && onDelete(r)}
                            disabled={!canDelete}
                            title={
                              canDelete
                                ? "Excluir"
                                : !canManage
                                  ? "Você não tem permissão pra gerenciar esta categoria"
                                  : "Contate alguém de SI para Excluir esta regra"
                            }
                          >
                            <Trash2 size={13} color={canDelete ? T.danger : V2.textMuted} />
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {moveToTarget && (
        <MoveToPositionDialog
          open={!!moveToTarget}
          onOpenChange={(o) => !o && setMoveToTarget(null)}
          currentPosition={category.rules.findIndex((r) => r.id === moveToTarget.id) + 1}
          maxPosition={category.rules.length}
          saving={movingId === moveToTarget.id}
          onConfirm={handleMoveToConfirm}
        />
      )}
    </div>
      <DetailSheet
        open={viewOpen && !!viewRule}
        onOpenChange={setViewOpen}
        width={620}
        eyebrow={`${category.label} · ordem ${viewRule?.order ?? "—"}`}
        title={viewRule?.description || "Regra sem nome"}
        badges={
          viewRule && (
            <>
              {viewRule.enabled ? (
                <span className="ops-rule-status-active">Active</span>
              ) : (
                <span className="ops-rule-status-disabled">Disabled</span>
              )}
              <span className="ops-action-pill">{viewRule.action}</span>
            </>
          )
        }
        footer={
          <>
            <button className="ops-btn outline" style={{ marginRight: "auto" }} onClick={() => setViewOpen(false)}>
              Fechar
            </button>
            {viewRule && onEdit && category.supportsCrud && canManage && (
              <button
                className="ops-btn primary"
                onClick={() => {
                  setViewOpen(false);
                  onEdit(viewRule);
                }}
              >
                <Pencil size={13} /> Editar
              </button>
            )}
          </>
        }
      >
        {viewRule && <RuleReadOnly rule={viewRule} />}
      </DetailSheet>
    </>
  );
}

// Redirect Rule em modo "Padrão wildcard" não tem o seletor Type nativo — o
// campo único "Target URL" vira wildcard_replace() reaproveitando o mesmo
// padrão do "Request URL" só quando usa ${1}/${2}; senão é um valor estático.
function parseRedirectWildcardTarget(target: any): string {
  if (typeof target?.value === "string") return target.value;
  if (typeof target?.expression === "string") {
    const m = target.expression.match(/^wildcard_replace\([^,]+,\s*r?"(?:[^"\\]|\\.)*",\s*r?"((?:[^"\\]|\\.)*)"\)$/);
    if (m) return unescStr(m[1]);
  }
  return "";
}
function buildRedirectWildcardTarget(pattern: string, replacement: string): { targetType: "static" | "dynamic"; targetUrl: string } {
  if (replacement.includes("${")) {
    return {
      targetType: "dynamic",
      targetUrl: `wildcard_replace(http.request.full_uri, r"${escStr(pattern)}", r"${escStr(replacement)}")`,
    };
  }
  return { targetType: "static", targetUrl: replacement.trim() };
}

function RedirectRuleDialog({
  open,
  onOpenChange,
  zoneId,
  rulesetId,
  editing,
  existingRules,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  zoneId: string;
  rulesetId: string | null;
  editing?: OverviewRule | null;
  existingRules?: OverviewRule[];
  onSaved: () => void;
}) {
  const doCreate = useServerFn(createRedirectRule);
  const doUpdate = useServerFn(updateRedirectRule);
  const [description, setDescription] = React.useState("");
  // Espelha o "If incoming requests match…" nativo — mesmo padrão do URL
  // Rewrite Rule (Overview).
  const [matchMode, setMatchMode] = React.useState<"wildcard" | "expression" | "all">("wildcard");
  const [wildcardUrl, setWildcardUrl] = React.useState("");
  const [expression, setExpression] = React.useState("");
  const [exprMode, setExprMode] = React.useState<"builder" | "raw">("builder");
  const [conditions, setConditions] = React.useState<ExprCondition[]>([{ field: EXPR_FIELDS[0].key, operator: "wildcard", value: "" }]);
  const [combinators, setCombinators] = React.useState<Array<"and" | "or">>([]);
  // "Then… URL redirect" — Type (Static/Dynamic) + URL + Status code, igual ao nativo.
  const [targetType, setTargetType] = React.useState<"static" | "dynamic">("static");
  const [targetUrl, setTargetUrl] = React.useState("");
  const [statusCode, setStatusCode] = React.useState(301);
  const [preserveQueryString, setPreserveQueryString] = React.useState(false);
  // "Place at" — First/Last/Custom (Custom = "fire after" outra rule já existente).
  const [placeAt, setPlaceAt] = React.useState<"first" | "last" | "custom">("last");
  const [placeAfterRuleId, setPlaceAfterRuleId] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setDescription(editing?.description ?? "");
    const parsedMatch = parseMatchExpression(editing?.expression ?? "");
    setMatchMode(editing ? parsedMatch.mode : "wildcard");
    setWildcardUrl(parsedMatch.wildcardUrl);
    setExpression(parsedMatch.expression);
    if (parsedMatch.mode === "expression" && parsedMatch.expression) {
      const parsedMulti = parseMultiCondition(parsedMatch.expression);
      if (parsedMulti) {
        setConditions(parsedMulti.conditions);
        setCombinators(parsedMulti.combinators);
        setExprMode("builder");
      } else {
        setExprMode("raw");
      }
    } else {
      setConditions([{ field: EXPR_FIELDS[0].key, operator: "wildcard", value: "" }]);
      setCombinators([]);
      setExprMode("builder");
    }
    const fromValue = (editing?.action_parameters as any)?.from_value ?? {};
    if (parsedMatch.mode === "wildcard") {
      // Modo wildcard não tem o seletor "Type" — o target vira wildcard_replace()
      // usando o mesmo padrão do "Request URL" só quando tem ${1}/${2}.
      setTargetType("static");
      setTargetUrl(parseRedirectWildcardTarget(fromValue?.target_url));
    } else if (typeof fromValue?.target_url?.expression === "string") {
      setTargetType("dynamic");
      setTargetUrl(fromValue.target_url.expression);
    } else {
      setTargetType("static");
      setTargetUrl(fromValue?.target_url?.value ?? "");
    }
    setStatusCode(fromValue?.status_code ?? 301);
    setPreserveQueryString(fromValue?.preserve_query_string ?? false);
    setPlaceAt("last");
    setPlaceAfterRuleId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  React.useEffect(() => {
    if (exprMode === "builder") setExpression(compileExpression(conditions, combinators));
  }, [conditions, combinators, exprMode]);

  function updateCondition(idx: number, patch: Partial<ExprCondition>) {
    setConditions(conditions.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }
  function updateFieldForCondition(idx: number, fieldKey: string) {
    const defaultOp = getExprOperators(fieldKey)[0];
    updateCondition(idx, { field: fieldKey, operator: defaultOp.key, value: defaultOp.valueKind === "bool" ? "true" : "" });
  }
  function updateOperatorForCondition(idx: number, opKey: string, ops: ExprOperator[]) {
    const op = ops.find((o) => o.key === opKey) ?? ops[0];
    updateCondition(idx, { operator: opKey, value: op.valueKind === "bool" ? "true" : "" });
  }
  function addCondition(combinator: "and" | "or") {
    setConditions([...conditions, { field: EXPR_FIELDS[0].key, operator: "wildcard", value: "" }]);
    setCombinators([...combinators, combinator]);
  }
  function removeCondition(idx: number) {
    if (conditions.length <= 1) return;
    setConditions(conditions.filter((_, i) => i !== idx));
    setCombinators(combinators.filter((_, i) => i !== (idx === 0 ? 0 : idx - 1)));
  }
  function switchToExpressionBuilder() {
    const parsedMulti = parseMultiCondition(expression);
    // Expressão vazia: começa o builder do zero
    if (!expression.trim()) {
      setConditions([{ field: EXPR_FIELDS[0].key, operator: "wildcard", value: "" }]);
      setCombinators([]);
      setExprMode("builder");
      return;
    }
    // Se o builder não reconhece a expressão, ficar no modo texto em vez de
    // trocar e apagar o que já estava escrito
    if (!parsedMulti) {
      toast.warning("O builder não reconhece esta expressão. Continue editando no modo texto para não perdê-la.");
      return;
    }
    setConditions(parsedMulti.conditions);
    setCombinators(parsedMulti.combinators);
    setExprMode("builder");
  }

  const finalExpression = buildMatchExpression(matchMode, wildcardUrl, expression);
  const builderConditionsFilled = exprMode === "raw" || conditions.every((c) => c.value.trim().length > 0);
  const matchFilled =
    matchMode === "all" || (matchMode === "wildcard" ? wildcardUrl.trim() : !!expression.trim() && builderConditionsFilled);
  const canSubmit = !!(description.trim() && matchFilled && targetUrl.trim());
  const otherRules = (existingRules ?? []).filter((r) => r.id !== editing?.id);

  async function handleSave() {
    setSaving(true);
    try {
      // Modo wildcard não tem "Type" — decide estático/dinâmico sozinho a
      // partir do próprio texto digitado (usa ${1}/${2}?).
      const effective = matchMode === "wildcard" ? buildRedirectWildcardTarget(wildcardUrl, targetUrl) : { targetType, targetUrl };
      if (editing) {
        if (!rulesetId) {
          toast.error("Ruleset ID não encontrado. Atualize a lista e tente de novo.");
          return;
        }
        const res: any = await doUpdate({
          data: {
            zoneId,
            rulesetId,
            ruleId: editing.id,
            description,
            expression: finalExpression,
            targetType: effective.targetType,
            targetUrl: effective.targetUrl,
            statusCode,
            preserveQueryString,
            enabled: editing.enabled,
          },
        });
        if (res.ok) {
          toast.success("Redirect Rule atualizada.");
          onSaved();
        } else toast.error(res.error);
      } else {
        const position =
          placeAt === "first" ? { index: 0 } : placeAt === "custom" && placeAfterRuleId ? { after: placeAfterRuleId } : undefined;
        const res: any = await doCreate({
          data: {
            zoneId,
            description,
            expression: finalExpression,
            targetType: effective.targetType,
            targetUrl: effective.targetUrl,
            statusCode,
            preserveQueryString,
            ...(position ? { position } : {}),
          },
        });
        if (res.ok) {
          toast.success("Redirect Rule criada.");
          onSaved();
        } else toast.error(res.error);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" style={{ maxHeight: "85vh", overflowY: "auto" }}>
        <DialogHeader>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingRight: 24 }}>
            <DialogTitle style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {editing ? <Pencil size={16} color={T.accent} /> : <Plus size={16} color={T.accent} />}
              {editing ? "Editar Redirect Rule" : "Criar Redirect Rule"}
            </DialogTitle>
            <DocsLinkButton category="redirect" />
          </div>
        </DialogHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 22, padding: "8px 0" }}>
          <div className="ops-field">
            <ExecLabel>Nome da regra</ExecLabel>
            <Input placeholder="Ex.: Redirect to www" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div style={{ height: 1, background: V2.border }} />

          <div className="ops-field">
            <ExecLabel>Se a requisição bater com…</ExecLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 4 }}>
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
                <input type="radio" checked={matchMode === "wildcard"} onChange={() => setMatchMode("wildcard")} style={{ marginTop: 3 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Padrão wildcard</div>
                  <div className="ops-hint">Só aplica a regra em requisições que baterem com o padrão.</div>
                </div>
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
                <input type="radio" checked={matchMode === "expression"} onChange={() => {
                    // Vindo do "Padrão wildcard": leva a URL para o builder em vez de abrir vazio
                    if (matchMode === "wildcard" && wildcardUrl.trim() && conditions.every((c) => !c.value.trim())) {
                      setConditions([{ field: "http.request.full_uri", operator: "wildcard", value: wildcardUrl.trim() }]);
                      setCombinators([]);
                      setExprMode("builder");
                    }
                    setMatchMode("expression");
                  }} style={{ marginTop: 3 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Expressão customizada</div>
                  <div className="ops-hint">Só aplica a regra em requisições que baterem com a expressão.</div>
                </div>
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
                <input type="radio" checked={matchMode === "all"} onChange={() => setMatchMode("all")} style={{ marginTop: 3 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Todas as requisições</div>
                  <div className="ops-hint">Aplica a regra em toda requisição, sem filtro.</div>
                </div>
              </label>
            </div>
          </div>

          {matchMode === "wildcard" && (
            <div className="ops-field">
              <ExecLabel>Request URL</ExecLabel>
              <Input placeholder="https://*.exemplo.com/arquivos/*" value={wildcardUrl} onChange={(e) => setWildcardUrl(e.target.value)} />
              <p className="ops-hint">Use * pra casar com várias requisições, ex.: https://*.exemplo.com/files/*</p>
            </div>
          )}

          {matchMode === "expression" &&
            (exprMode === "raw" ? (
              <div className="ops-field">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <ExecLabel>Expressão</ExecLabel>
                  <button className="ops-btn ghost sm" style={{ color: T.accent }} onClick={switchToExpressionBuilder}>
                    Use expression builder
                  </button>
                </div>
                <Textarea
                  placeholder={'(http.host eq "exemplo.com")'}
                  rows={2}
                  value={expression}
                  onChange={(e) => setExpression(e.target.value)}
                />
                <p className="ops-hint">Mesma sintaxe de expressão usada em Custom Rules (WAF).</p>
              </div>
            ) : (
              <div className="ops-field">
                <ExecLabel>When incoming requests match…</ExecLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
                  {conditions.map((c, idx) => {
                    const field = EXPR_FIELDS.find((f) => f.key === c.field) ?? EXPR_FIELDS[0];
                    const ops = getExprOperators(c.field);
                    return (
                      <div key={idx}>
                        {idx > 0 && (
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 500,
                              color: V2.textMuted,
                              fontFamily: "'IBM Plex Mono',monospace",
                              margin: "6px 0",
                            }}
                          >
                            {combinators[idx - 1]}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <div style={{ flex: "0 0 140px" }}>
                            <Select value={c.field} onValueChange={(v) => updateFieldForCondition(idx, v)}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {EXPR_FIELDS.map((f) => (
                                  <SelectItem key={f.key} value={f.key}>
                                    {f.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div style={{ flex: "0 0 140px" }}>
                            <Select
                              value={c.operator}
                              onValueChange={(v) => updateOperatorForCondition(idx, v, ops)}
                              disabled={field.type === "bool"}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ops.map((o) => (
                                  <SelectItem key={o.key} value={o.key}>
                                    {o.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
                            {(() => {
                              const op = ops.find((o) => o.key === c.operator) ?? ops[0];
                              if (op.valueKind === "bool") {
                                return <Switch checked={c.value === "true"} onCheckedChange={(v) => updateCondition(idx, { value: v ? "true" : "false" })} />;
                              }
                              const enumOptions = ENUM_VALUE_OPTIONS[c.field];
                              if (op.valueKind === "text" && enumOptions) {
                                return (
                                  <Select value={c.value} onValueChange={(v) => updateCondition(idx, { value: v })}>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select…" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {enumOptions.map((v) => (
                                        <SelectItem key={v} value={v}>
                                          {v}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                );
                              }
                              if (op.valueKind === "listref") {
                                return (
                                  <Input
                                    placeholder="nome_da_list"
                                    value={c.value}
                                    onChange={(e) => updateCondition(idx, { value: e.target.value })}
                                  />
                                );
                              }
                              if (op.valueKind === "list") {
                                return (
                                  <Input
                                    placeholder={enumOptions ? `${enumOptions.slice(0, 2).join(", ")}, …` : "valor1, valor2, valor3"}
                                    value={c.value}
                                    onChange={(e) => updateCondition(idx, { value: e.target.value })}
                                  />
                                );
                              }
                              return (
                                <Input
                                  placeholder={field.type === "ip" ? "1.2.3.4" : EXPR_VALUE_EXAMPLE[field.key] ?? "e.g. https://*.exemplo.com/files/*"}
                                  value={c.value}
                                  onChange={(e) => updateCondition(idx, { value: e.target.value })}
                                />
                              );
                            })()}
                          </div>
                          {conditions.length > 1 && (
                            <button className="ops-btn ghost sm" onClick={() => removeCondition(idx)} title="Remover">
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="ops-btn outline sm" onClick={() => addCondition("and")}>
                      And
                    </button>
                    <button className="ops-btn outline sm" onClick={() => addCondition("or")}>
                      Or
                    </button>
                  </div>
                </div>
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: V2.textMuted,
                        fontFamily: "'IBM Plex Mono',monospace",
                      }}
                    >
                      Expression Preview
                    </span>
                    <button className="ops-btn ghost sm" style={{ color: T.accent }} onClick={() => setExprMode("raw")}>
                      Editar expressão
                    </button>
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      border: `1px solid ${V2.border}`,
                      borderRadius: 6,
                      background: V2.surfaceAlt,
                      padding: "10px 12px",
                    }}
                  >
                    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: V2.textPrimary, wordBreak: "break-all" }}>
                      {expression || "—"}
                    </div>
                    <div style={{ marginTop: 6, textAlign: "right", fontSize: 10, color: V2.textSubtle, fontFamily: "'IBM Plex Mono',monospace" }}>
                      {expression.length} / 4000 characters
                    </div>
                  </div>
                </div>
              </div>
            ))}

          <div style={{ height: 1, background: V2.border }} />

          <div className="ops-field" style={{ gap: 14 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>
              {matchMode === "wildcard" ? "Then…" : "URL redirect"}
            </div>
            <p className="ops-hint">
              Redireciona pra URL de destino. Pode ser estático ou dinâmico usando os grupos capturados pelo * (ex.: ${"{1}"}, ${"{2}"}).
            </p>
            <div style={{ display: "flex", gap: 12 }}>
              {matchMode !== "wildcard" && (
                <div className="ops-field" style={{ flex: "0 0 120px" }}>
                  <ExecLabel>Type</ExecLabel>
                  <Select value={targetType} onValueChange={(v) => setTargetType(v as "static" | "dynamic")}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="static">Static</SelectItem>
                      <SelectItem value="dynamic">Dynamic</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              )}
              <div className="ops-field" style={{ flex: 1 }}>
                <ExecLabel>{matchMode === "wildcard" ? "Target URL" : "URL"}</ExecLabel>
                <Input
                  placeholder={
                    matchMode === "wildcard" || targetType === "static"
                      ? "https://www.exemplo.com"
                      : 'concat("https://www.exemplo.com", http.request.uri.path)'
                  }
                  value={targetUrl}
                  onChange={(e) => setTargetUrl(e.target.value)}
                />
                <p className="ops-hint">e.g. https://exemplo.com/${"{1}"}/${"{2}"}</p>
              </div>
              <div className="ops-field" style={{ flex: "0 0 220px" }}>
                <ExecLabel>Status code</ExecLabel>
                <Select value={String(statusCode)} onValueChange={(v) => setStatusCode(Number(v))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {REDIRECT_STATUS_CODES.map((c) => (
                      <SelectItem key={c} value={String(c)}>
                        {REDIRECT_STATUS_LABELS[c]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="ops-check-row">
              <Checkbox id="preserve-qs" checked={preserveQueryString} onCheckedChange={(v) => setPreserveQueryString(!!v)} />
              <label htmlFor="preserve-qs" className="ops-check-label">
                Preserve query string
              </label>
            </div>
            <div
              style={{
                display: "flex",
                gap: 8,
                padding: "10px 12px",
                borderRadius: 6,
                background: "rgba(59,130,246,0.08)",
                border: "1px solid rgba(59,130,246,0.2)",
              }}
            >
              <Info size={14} color={T.accent} style={{ flexShrink: 0, marginTop: 2 }} />
              <div style={{ fontSize: 11, color: V2.textMuted, fontFamily: "var(--font-ui)" }}>
                <strong style={{ color: V2.textPrimary }}>Redirect POST requests?</strong> Pra evitar que o método da requisição vire GET,
                use um redirect 307/308.
              </div>
            </div>
          </div>

          {!editing && (
            <>
              <div style={{ height: 1, background: V2.border }} />
              <div className="ops-field" style={{ alignSelf: "flex-start", width: 220 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: V2.textPrimary, fontFamily: "var(--font-ui)", marginBottom: 6 }}>
                  Place at
                </div>
                <span className="ops-hint" style={{ display: "block", marginBottom: 4 }}>
                  Select order:
                </span>
                <Select value={placeAt} onValueChange={(v) => setPlaceAt(v as "first" | "last" | "custom")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="first">First</SelectItem>
                    <SelectItem value="last">Last</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
                {placeAt === "custom" && (
                  <div style={{ marginTop: 10 }}>
                    <span className="ops-hint" style={{ display: "block", marginBottom: 4 }}>
                      Select which rule this will fire after:
                    </span>
                    <Select value={placeAfterRuleId} onValueChange={setPlaceAfterRuleId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
                      <SelectContent>
                        {otherRules.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.description || r.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <button className="ops-btn outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </button>
          <button className="ops-btn primary" onClick={handleSave} disabled={!canSubmit || saving}>
            {saving ? <Loader2 size={12} className="ops-spin" /> : <Check size={12} />}
            Salvar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Catálogo de status HTTP pro Status code TTL (inclui os "520-530" próprios
// da Cloudflare, confirmados no print real).
const HTTP_STATUS_CATALOG: Array<{ code: number; label: string }> = [
  { code: 100, label: "Continue" },
  { code: 101, label: "Switching Protocols" },
  { code: 102, label: "Processing" },
  { code: 103, label: "Early Hints" },
  { code: 200, label: "OK" },
  { code: 201, label: "Created" },
  { code: 202, label: "Accepted" },
  { code: 203, label: "Non-Authoritative Information" },
  { code: 204, label: "No Content" },
  { code: 205, label: "Reset Content" },
  { code: 206, label: "Partial Content" },
  { code: 226, label: "IM Used" },
  { code: 300, label: "Multiple Choices" },
  { code: 301, label: "Moved Permanently" },
  { code: 302, label: "Found" },
  { code: 303, label: "See Other" },
  { code: 304, label: "Not Modified" },
  { code: 307, label: "Temporary Redirect" },
  { code: 308, label: "Permanent Redirect" },
  { code: 400, label: "Bad Request" },
  { code: 401, label: "Unauthorized" },
  { code: 402, label: "Payment Required" },
  { code: 403, label: "Forbidden" },
  { code: 404, label: "Not Found" },
  { code: 405, label: "Method Not Allowed" },
  { code: 406, label: "Not Acceptable" },
  { code: 408, label: "Request Timeout" },
  { code: 409, label: "Conflict" },
  { code: 410, label: "Gone" },
  { code: 411, label: "Length Required" },
  { code: 412, label: "Precondition Failed" },
  { code: 413, label: "Payload Too Large" },
  { code: 414, label: "URI Too Long" },
  { code: 415, label: "Unsupported Media Type" },
  { code: 416, label: "Range Not Satisfiable" },
  { code: 417, label: "Expectation Failed" },
  { code: 425, label: "Too Early" },
  { code: 426, label: "Upgrade Required" },
  { code: 428, label: "Precondition Required" },
  { code: 429, label: "Too Many Requests" },
  { code: 431, label: "Request Header Fields Too Large" },
  { code: 451, label: "Unavailable For Legal Reasons" },
  { code: 500, label: "Internal Server Error" },
  { code: 501, label: "Not Implemented" },
  { code: 502, label: "Bad Gateway" },
  { code: 503, label: "Service Unavailable" },
  { code: 504, label: "Gateway Timeout" },
  { code: 505, label: "HTTP Version Not Supported" },
  { code: 506, label: "Variant Also Negotiates" },
  { code: 507, label: "Insufficient Storage" },
  { code: 508, label: "Loop Detected" },
  { code: 510, label: "Not Extended" },
  { code: 511, label: "Network Authentication Required" },
  { code: 520, label: "Web Server Returned an Unknown Error" },
  { code: 521, label: "Web Server Is Down" },
  { code: 522, label: "Connection Timed Out" },
  { code: 523, label: "Origin Is Unreachable" },
  { code: 524, label: "A Timeout Occurred" },
  { code: 525, label: "SSL Handshake Failed" },
  { code: 526, label: "Invalid SSL Certificate" },
  { code: 530, label: "Origin DNS Error" },
];

// Presets de duração (segundos) do "Select or add a duration in seconds"
// nativo. `allowSpecial` liga "No store"(-1)/"No cache"(0), que só existem
// no Duration do Status code TTL (confirmado: value 0=no-cache, -1=no-store).
const DURATION_PRESETS: Array<{ value: number; label: string }> = [
  { value: 1, label: "1 second" },
  { value: 3, label: "3 seconds" },
  { value: 5, label: "5 seconds" },
  { value: 10, label: "10 seconds" },
  { value: 30, label: "30 seconds" },
  { value: 60, label: "1 minute" },
  { value: 120, label: "2 minutes" },
  { value: 300, label: "5 minutes" },
  { value: 600, label: "10 minutes" },
  { value: 900, label: "15 minutes" },
  { value: 1800, label: "30 minutes" },
  { value: 3600, label: "1 hour" },
  { value: 7200, label: "2 hours" },
  { value: 14400, label: "4 hours" },
  { value: 28800, label: "8 hours" },
  { value: 43200, label: "12 hours" },
  { value: 86400, label: "1 day" },
  { value: 172800, label: "2 days" },
  { value: 604800, label: "7 days" },
  { value: 2592000, label: "30 days" },
  { value: 7776000, label: "90 days" },
  { value: 31536000, label: "365 days" },
];

function DurationSelect({
  value,
  onChange,
  allowSpecial,
}: {
  value: string;
  onChange: (v: string) => void;
  allowSpecial?: boolean;
}) {
  const isCustom = value.trim() !== "" && !DURATION_PRESETS.some((p) => String(p.value) === value) && value !== "-1" && value !== "0";
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <Select value={isCustom ? "custom" : value} onValueChange={(v) => onChange(v === "custom" ? "" : v)}>
        <SelectTrigger>
          <SelectValue placeholder="Select or add a duration in seconds" />
        </SelectTrigger>
        <SelectContent>
          {allowSpecial && (
            <>
              <SelectItem value="-1">No store</SelectItem>
              <SelectItem value="0">No cache</SelectItem>
            </>
          )}
          {DURATION_PRESETS.map((p) => (
            <SelectItem key={p.value} value={String(p.value)}>
              {p.label}
            </SelectItem>
          ))}
          <SelectItem value="custom">Custom (segundos)…</SelectItem>
        </SelectContent>
      </Select>
      {isCustom && (
        <Input
          type="number"
          style={{ flex: "0 0 140px" }}
          placeholder="segundos"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </div>
  );
}

// TTL de Edge/Browser: 3 modos confirmados na documentação pública da
// Cloudflare (mesmo enum pros dois campos, só o texto do rótulo muda).
const TTL_MODE_LABELS_EDGE: Record<string, string> = {
  bypass_by_default: "Use cache-control header if present, bypass cache if not",
  respect_origin: "Use cache-control header if present, cache request with Cloudflare's default TTL for the response status if not",
  override_origin: "Ignore cache-control header and use this TTL",
};
const TTL_MODE_LABELS_BROWSER: Record<string, string> = {
  bypass_by_default: "Bypass cache",
  respect_origin: "Respect origin TTL",
  override_origin: "Override origin and use this TTL",
};

// "+ Add setting" — cada seção só entra no action_parameters se for
// adicionada. Confiança alta pra edge_ttl/browser_ttl/cache_key/vary/
// serve_stale/respect_strong_etags/origin_error_page_passthru — nomes de
// campo confirmados na documentação pública da Cloudflare. A única parte sem
// confirmação 1:1 é a divisão exata "Status code" vs "Status code range" no
// Status Code TTL — implementei como status code único (from=to=código).
function CacheAddableSetting({
  label,
  optional,
  description,
  added,
  onAdd,
  onRemove,
  children,
}: {
  label: string;
  optional?: boolean;
  description: string;
  added: boolean;
  onAdd: () => void;
  onRemove: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div style={{ padding: "14px 0", borderTop: `1px solid ${V2.border}` }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>
            {label} {optional !== false && <span style={{ color: V2.textSubtle, fontWeight: 400 }}>(optional)</span>}
          </div>
          <p className="ops-hint" style={{ marginTop: 4, maxWidth: 560 }}>
            {description}
          </p>
        </div>
        {added ? (
          <button className="ops-btn ghost sm" onClick={onRemove} title="Remover">
            <X size={14} />
          </button>
        ) : (
          <button className="ops-btn outline sm" onClick={onAdd} style={{ flexShrink: 0 }}>
            <Plus size={11} /> Add setting
          </button>
        )}
      </div>
      {added && <div style={{ marginTop: 10 }}>{children}</div>}
    </div>
  );
}

// Radio de 3 modos (Edge/Browser TTL) + input de segundos quando "override_origin".
function TtlModeRadios({
  mode,
  onModeChange,
  seconds,
  onSecondsChange,
  labels,
}: {
  mode: string;
  onModeChange: (m: "bypass_by_default" | "respect_origin" | "override_origin") => void;
  seconds: string;
  onSecondsChange: (v: string) => void;
  labels: Record<string, string>;
}) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {(["bypass_by_default", "respect_origin", "override_origin"] as const).map((m) => (
        <label key={m} style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
          <input type="radio" checked={mode === m} onChange={() => onModeChange(m)} style={{ marginTop: 3 }} />
          <div style={{ fontSize: 12, fontWeight: mode === m ? 600 : 400, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>
            {labels[m]}
          </div>
        </label>
      ))}
      <div className="ops-field" style={{ maxWidth: 320, opacity: mode === "override_origin" ? 1 : 0.5 }}>
        <ExecLabel>Input time-to-live (TTL) {mode === "override_origin" && "(required)"}</ExecLabel>
        {mode === "override_origin" ? (
          <DurationSelect value={seconds} onChange={onSecondsChange} />
        ) : (
          <Input disabled placeholder="Select or add a duration in seconds" value="" onChange={() => {}} />
        )}
      </div>
    </div>
  );
}

function CacheRuleDialog({
  open,
  onOpenChange,
  zoneId,
  rulesetId,
  editing,
  existingRules,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  zoneId: string;
  rulesetId: string | null;
  editing?: OverviewRule | null;
  existingRules?: OverviewRule[];
  onSaved: () => void;
}) {
  const doCreate = useServerFn(createOverviewRule);
  const doUpdate = useServerFn(updateOverviewRule);
  const [description, setDescription] = React.useState("");
  // Cache Rules nativo só tem 2 opções aqui — sem "Padrão wildcard".
  const [matchMode, setMatchMode] = React.useState<"expression" | "all">("expression");
  const [expression, setExpression] = React.useState("");
  const [exprMode, setExprMode] = React.useState<"builder" | "raw">("builder");
  const [conditions, setConditions] = React.useState<ExprCondition[]>([{ field: EXPR_FIELDS[0].key, operator: "wildcard", value: "" }]);
  const [combinators, setCombinators] = React.useState<Array<"and" | "or">>([]);

  const [cacheEligible, setCacheEligible] = React.useState(true);

  type TtlMode = "bypass_by_default" | "respect_origin" | "override_origin";
  const [edgeTtlAdded, setEdgeTtlAdded] = React.useState(false);
  const [edgeTtlMode, setEdgeTtlMode] = React.useState<TtlMode>("bypass_by_default");
  const [edgeTtlSeconds, setEdgeTtlSeconds] = React.useState("");
  const [edgeStatusRows, setEdgeStatusRows] = React.useState<
    Array<{ scope: "single" | "gte" | "lte" | "range"; statusCode: string; statusCodeTo: string; seconds: string }>
  >([]);

  const [browserTtlAdded, setBrowserTtlAdded] = React.useState(false);
  const [browserTtlMode, setBrowserTtlMode] = React.useState<TtlMode>("bypass_by_default");
  const [browserTtlSeconds, setBrowserTtlSeconds] = React.useState("");

  const [cacheKeyAdded, setCacheKeyAdded] = React.useState(false);
  const [cacheDeceptionArmor, setCacheDeceptionArmor] = React.useState(false);
  const [cacheByDeviceType, setCacheByDeviceType] = React.useState(false);
  const [ignoreQueryStringsOrder, setIgnoreQueryStringsOrder] = React.useState(false);
  const [queryStringMode, setQueryStringMode] = React.useState<"all" | "all_except" | "only" | "ignore">("all");
  const [queryStringParams, setQueryStringParams] = React.useState("");
  const [cacheHeaderRows, setCacheHeaderRows] = React.useState<Array<{ name: string; values: string }>>([]);
  const [headerCheckPresence, setHeaderCheckPresence] = React.useState("");
  const [includeOriginHeader, setIncludeOriginHeader] = React.useState(true);
  const [hostMode, setHostMode] = React.useState<"original" | "resolved">("original");
  const [userDeviceType, setUserDeviceType] = React.useState(false);
  const [userCountry, setUserCountry] = React.useState(false);
  const [userLang, setUserLang] = React.useState(false);

  const [varyAdded, setVaryAdded] = React.useState(false);
  const [varyDefaultAction, setVaryDefaultAction] = React.useState<"normalize" | "passthrough" | "bypass">("normalize");
  const [varyHeaderRows, setVaryHeaderRows] = React.useState<Array<{ name: string; action: "normalize" | "passthrough" | "bypass" }>>([]);

  const [serveStaleAdded, setServeStaleAdded] = React.useState(false);
  const [disableStaleWhileUpdating, setDisableStaleWhileUpdating] = React.useState(false);

  const [respectStrongEtagsAdded, setRespectStrongEtagsAdded] = React.useState(false);
  const [useStrongEtags, setUseStrongEtags] = React.useState(false);

  const [originErrorPageAdded, setOriginErrorPageAdded] = React.useState(false);
  const [originErrorPagePassthru, setOriginErrorPagePassthru] = React.useState(false);

  const [placeAt, setPlaceAt] = React.useState<"first" | "last" | "custom">("last");
  const [placeAfterRuleId, setPlaceAfterRuleId] = React.useState("");

  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setDescription(editing?.description ?? "");
    const parsedMatchRaw = parseMatchExpression(editing?.expression ?? "");
    const resolvedMode = parsedMatchRaw.mode === "wildcard" ? "expression" : parsedMatchRaw.mode;
    const resolvedExpr =
      parsedMatchRaw.mode === "wildcard" ? buildMatchExpression("wildcard", parsedMatchRaw.wildcardUrl, "") : parsedMatchRaw.expression;
    setMatchMode(editing ? resolvedMode : "expression");
    setExpression(resolvedExpr);
    if (resolvedMode === "expression" && resolvedExpr) {
      const parsedMulti = parseMultiCondition(resolvedExpr);
      if (parsedMulti) {
        setConditions(parsedMulti.conditions);
        setCombinators(parsedMulti.combinators);
        setExprMode("builder");
      } else {
        setExprMode("raw");
      }
    } else {
      setConditions([{ field: EXPR_FIELDS[0].key, operator: "wildcard", value: "" }]);
      setCombinators([]);
      setExprMode("builder");
    }

    const ap = (editing?.action_parameters as any) ?? {};
    setCacheEligible(ap.cache !== false);

    const edge = ap.edge_ttl;
    setEdgeTtlAdded(!!edge);
    setEdgeTtlMode(edge?.mode ?? "bypass_by_default");
    setEdgeTtlSeconds(edge?.default != null ? String(edge.default) : "");
    setEdgeStatusRows(
      (edge?.status_code_ttl ?? []).map((r: any) => {
        const from = r.status_code_range?.from;
        const to = r.status_code_range?.to;
        const scope: "single" | "gte" | "lte" | "range" =
          from != null && to != null ? (from === to ? "single" : "range") : from != null ? "gte" : "lte";
        return {
          scope,
          statusCode: String(from ?? to ?? ""),
          statusCodeTo: scope === "range" ? String(to ?? "") : "",
          seconds: String(r.value ?? ""),
        };
      }),
    );

    const browser = ap.browser_ttl;
    setBrowserTtlAdded(!!browser);
    setBrowserTtlMode(browser?.mode ?? "bypass_by_default");
    setBrowserTtlSeconds(browser?.default != null ? String(browser.default) : "");

    const ck = ap.cache_key;
    setCacheKeyAdded(!!ck);
    setCacheDeceptionArmor(!!ck?.cache_deception_armor);
    setCacheByDeviceType(!!ck?.cache_by_device_type);
    setIgnoreQueryStringsOrder(!!ck?.ignore_query_strings_order);
    const qs = ck?.custom_key?.query_string;
    if (qs?.exclude?.includes("*")) {
      setQueryStringMode("ignore");
      setQueryStringParams("");
    } else if (qs?.exclude) {
      setQueryStringMode("all_except");
      setQueryStringParams(qs.exclude.join(", "));
    } else if (qs?.include) {
      setQueryStringMode("only");
      setQueryStringParams(qs.include.join(", "));
    } else {
      setQueryStringMode("all");
      setQueryStringParams("");
    }
    const hdr = ck?.custom_key?.header;
    setCacheHeaderRows([
      ...((hdr?.include ?? []) as string[]).map((n) => ({ name: n, values: "" })),
      ...Object.entries((hdr?.contains ?? {}) as Record<string, string[]>).map(([n, v]) => ({ name: n, values: v.join(", ") })),
    ]);
    setHeaderCheckPresence(((hdr?.check_presence ?? []) as string[]).join(", "));
    setIncludeOriginHeader(hdr?.exclude_origin !== true);
    setHostMode(ck?.custom_key?.host?.resolved ? "resolved" : "original");
    setUserDeviceType(!!ck?.custom_key?.user?.device_type);
    setUserCountry(!!ck?.custom_key?.user?.geo);
    setUserLang(!!ck?.custom_key?.user?.lang);

    const vary = ap.vary;
    setVaryAdded(!!vary);
    setVaryDefaultAction(vary?.default?.action ?? "normalize");
    setVaryHeaderRows(
      Object.entries((vary?.headers ?? {}) as Record<string, any>).map(([n, v]) => ({ name: n, action: v?.action ?? "normalize" })),
    );

    setServeStaleAdded(!!ap.serve_stale);
    setDisableStaleWhileUpdating(!!ap.serve_stale?.disable_stale_while_updating);
    setRespectStrongEtagsAdded(ap.respect_strong_etags !== undefined);
    setUseStrongEtags(!!ap.respect_strong_etags);
    setOriginErrorPageAdded(ap.origin_error_page_passthru !== undefined);
    setOriginErrorPagePassthru(!!ap.origin_error_page_passthru);

    setPlaceAt("last");
    setPlaceAfterRuleId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  React.useEffect(() => {
    if (exprMode === "builder") setExpression(compileExpression(conditions, combinators));
  }, [conditions, combinators, exprMode]);

  function updateCondition(idx: number, patch: Partial<ExprCondition>) {
    setConditions(conditions.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }
  function updateFieldForCondition(idx: number, fieldKey: string) {
    const defaultOp = getExprOperators(fieldKey)[0];
    updateCondition(idx, { field: fieldKey, operator: defaultOp.key, value: defaultOp.valueKind === "bool" ? "true" : "" });
  }
  function updateOperatorForCondition(idx: number, opKey: string, ops: ExprOperator[]) {
    const op = ops.find((o) => o.key === opKey) ?? ops[0];
    updateCondition(idx, { operator: opKey, value: op.valueKind === "bool" ? "true" : "" });
  }
  function addConditionRow(combinator: "and" | "or") {
    setConditions([...conditions, { field: EXPR_FIELDS[0].key, operator: "wildcard", value: "" }]);
    setCombinators([...combinators, combinator]);
  }
  function removeConditionRow(idx: number) {
    if (conditions.length <= 1) return;
    setConditions(conditions.filter((_, i) => i !== idx));
    setCombinators(combinators.filter((_, i) => i !== (idx === 0 ? 0 : idx - 1)));
  }
  function switchToExpressionBuilder() {
    const parsedMulti = parseMultiCondition(expression);
    // Expressão vazia: começa o builder do zero
    if (!expression.trim()) {
      setConditions([{ field: EXPR_FIELDS[0].key, operator: "wildcard", value: "" }]);
      setCombinators([]);
      setExprMode("builder");
      return;
    }
    // Se o builder não reconhece a expressão, ficar no modo texto em vez de
    // trocar e apagar o que já estava escrito
    if (!parsedMulti) {
      toast.warning("O builder não reconhece esta expressão. Continue editando no modo texto para não perdê-la.");
      return;
    }
    setConditions(parsedMulti.conditions);
    setCombinators(parsedMulti.combinators);
    setExprMode("builder");
  }

  const finalExpression = buildMatchExpression(matchMode, "", expression);
  const builderConditionsFilled = exprMode === "raw" || conditions.every((c) => c.value.trim().length > 0);
  const matchFilled = matchMode === "all" || (!!expression.trim() && builderConditionsFilled);
  const canSubmit = !!(description.trim() && matchFilled);
  const otherRules = (existingRules ?? []).filter((r) => r.id !== editing?.id);

  function buildActionParameters(): Record<string, unknown> {
    const params: Record<string, unknown> = { cache: cacheEligible };
    if (cacheEligible && edgeTtlAdded) {
      const edge: Record<string, unknown> = { mode: edgeTtlMode };
      if (edgeTtlMode === "override_origin") edge.default = Number(edgeTtlSeconds) || 0;
      const rows = edgeStatusRows
        .filter((r) => r.seconds.trim() && (r.scope === "range" ? r.statusCode.trim() && r.statusCodeTo.trim() : r.statusCode.trim()))
        .map((r) => {
          const range: { from?: number; to?: number } = {};
          if (r.scope === "single") {
            range.from = Number(r.statusCode);
            range.to = Number(r.statusCode);
          } else if (r.scope === "gte") {
            range.from = Number(r.statusCode);
          } else if (r.scope === "lte") {
            range.to = Number(r.statusCode);
          } else {
            range.from = Number(r.statusCode);
            range.to = Number(r.statusCodeTo);
          }
          return { status_code_range: range, value: Number(r.seconds) };
        });
      if (rows.length > 0) edge.status_code_ttl = rows;
      params.edge_ttl = edge;
    }
    if (browserTtlAdded) {
      const browser: Record<string, unknown> = { mode: browserTtlMode };
      if (browserTtlMode === "override_origin") browser.default = Number(browserTtlSeconds) || 0;
      params.browser_ttl = browser;
    }
    if (cacheEligible && cacheKeyAdded) {
      const cacheKey: Record<string, unknown> = {};
      if (cacheDeceptionArmor) cacheKey.cache_deception_armor = true;
      if (cacheByDeviceType) cacheKey.cache_by_device_type = true;
      if (ignoreQueryStringsOrder) cacheKey.ignore_query_strings_order = true;
      const customKey: Record<string, unknown> = {};
      if (queryStringMode === "ignore") customKey.query_string = { exclude: ["*"] };
      else if (queryStringMode === "all_except") customKey.query_string = { exclude: splitListValues(queryStringParams) };
      else if (queryStringMode === "only") customKey.query_string = { include: splitListValues(queryStringParams) };
      const headerInclude: string[] = [];
      const headerContains: Record<string, string[]> = {};
      for (const row of cacheHeaderRows) {
        if (!row.name.trim()) continue;
        const vals = splitListValues(row.values);
        if (vals.length > 0) headerContains[row.name.trim()] = vals;
        else headerInclude.push(row.name.trim());
      }
      const checkPresenceList = splitListValues(headerCheckPresence);
      if (headerInclude.length > 0 || Object.keys(headerContains).length > 0 || checkPresenceList.length > 0 || !includeOriginHeader) {
        customKey.header = {
          ...(headerInclude.length > 0 ? { include: headerInclude } : {}),
          ...(Object.keys(headerContains).length > 0 ? { contains: headerContains } : {}),
          ...(checkPresenceList.length > 0 ? { check_presence: checkPresenceList } : {}),
          ...(!includeOriginHeader ? { exclude_origin: true } : {}),
        };
      }
      if (hostMode === "resolved") customKey.host = { resolved: true };
      if (userDeviceType || userCountry || userLang) customKey.user = { device_type: userDeviceType, geo: userCountry, lang: userLang };
      if (Object.keys(customKey).length > 0) cacheKey.custom_key = customKey;
      if (Object.keys(cacheKey).length > 0) params.cache_key = cacheKey;
    }
    if (cacheEligible && varyAdded) {
      const vary: Record<string, unknown> = { default: { action: varyDefaultAction } };
      const headers: Record<string, unknown> = {};
      for (const row of varyHeaderRows) {
        if (!row.name.trim()) continue;
        headers[row.name.trim()] = { action: row.action };
      }
      if (Object.keys(headers).length > 0) vary.headers = headers;
      params.vary = vary;
    }
    if (cacheEligible && serveStaleAdded) params.serve_stale = { disable_stale_while_updating: disableStaleWhileUpdating };
    if (cacheEligible && respectStrongEtagsAdded) params.respect_strong_etags = useStrongEtags;
    if (cacheEligible && originErrorPageAdded) params.origin_error_page_passthru = originErrorPagePassthru;
    return params;
  }

  async function handleSave() {
    setSaving(true);
    try {
      const action_parameters = buildActionParameters();
      if (editing) {
        if (!rulesetId) {
          toast.error("Ruleset ID não encontrado. Atualize a lista e tente de novo.");
          return;
        }
        const res: any = await doUpdate({
          data: {
            zoneId,
            category: "cache",
            rulesetId,
            ruleId: editing.id,
            description,
            expression: finalExpression,
            action: "set_cache_settings",
            action_parameters,
            enabled: editing.enabled,
          },
        });
        if (res.ok) {
          toast.success("Cache Rule atualizada.");
          onSaved();
        } else toast.error(res.error);
      } else {
        const position =
          placeAt === "first" ? { index: 0 } : placeAt === "custom" && placeAfterRuleId ? { after: placeAfterRuleId } : undefined;
        const res: any = await doCreate({
          data: {
            zoneId,
            category: "cache",
            description,
            expression: finalExpression,
            action: "set_cache_settings",
            action_parameters,
            ...(position ? { position } : {}),
          },
        });
        if (res.ok) {
          toast.success("Cache Rule criada.");
          onSaved();
        } else toast.error(res.error);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl" style={{ maxHeight: "85vh", overflowY: "auto" }}>
        <DialogHeader>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingRight: 24 }}>
            <DialogTitle style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {editing ? <Pencil size={16} color={T.accent} /> : <Plus size={16} color={T.accent} />}
              {editing ? "Editar Cache Rule" : "Criar Cache Rule"}
            </DialogTitle>
            <DocsLinkButton category="cache" />
          </div>
        </DialogHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 22, padding: "8px 0" }}>
          <div className="ops-field">
            <ExecLabel>Nome da regra</ExecLabel>
            <Input placeholder="Ex.: Bypass de cache — portal-blue" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div style={{ height: 1, background: V2.border }} />

          <div className="ops-field">
            <ExecLabel>Se a requisição bater com…</ExecLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 4 }}>
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
                <input type="radio" checked={matchMode === "expression"} onChange={() => setMatchMode("expression")} style={{ marginTop: 3 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Expressão customizada</div>
                  <div className="ops-hint">Só aplica a regra em requisições que baterem com a expressão.</div>
                </div>
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
                <input type="radio" checked={matchMode === "all"} onChange={() => setMatchMode("all")} style={{ marginTop: 3 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Todas as requisições</div>
                  <div className="ops-hint">Aplica a regra em toda requisição, sem filtro.</div>
                </div>
              </label>
            </div>
          </div>

          {matchMode === "expression" &&
            (exprMode === "raw" ? (
              <div className="ops-field">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <ExecLabel>Expressão</ExecLabel>
                  <button className="ops-btn ghost sm" style={{ color: T.accent }} onClick={switchToExpressionBuilder}>
                    Use expression builder
                  </button>
                </div>
                <Textarea
                  placeholder={'(http.host eq "exemplo.com")'}
                  rows={2}
                  value={expression}
                  onChange={(e) => setExpression(e.target.value)}
                />
                <p className="ops-hint">Mesma sintaxe de expressão usada em Custom Rules (WAF).</p>
              </div>
            ) : (
              <div className="ops-field">
                <ExecLabel>When incoming requests match…</ExecLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
                  {conditions.map((c, idx) => {
                    const field = EXPR_FIELDS.find((f) => f.key === c.field) ?? EXPR_FIELDS[0];
                    const ops = getExprOperators(c.field);
                    return (
                      <div key={idx}>
                        {idx > 0 && (
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 500,
                              color: V2.textMuted,
                              fontFamily: "'IBM Plex Mono',monospace",
                              margin: "6px 0",
                            }}
                          >
                            {combinators[idx - 1]}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <div style={{ flex: "0 0 140px" }}>
                            <Select value={c.field} onValueChange={(v) => updateFieldForCondition(idx, v)}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {EXPR_FIELDS.map((f) => (
                                  <SelectItem key={f.key} value={f.key}>
                                    {f.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div style={{ flex: "0 0 140px" }}>
                            <Select
                              value={c.operator}
                              onValueChange={(v) => updateOperatorForCondition(idx, v, ops)}
                              disabled={field.type === "bool"}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ops.map((o) => (
                                  <SelectItem key={o.key} value={o.key}>
                                    {o.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
                            {(() => {
                              const op = ops.find((o) => o.key === c.operator) ?? ops[0];
                              if (op.valueKind === "bool") {
                                return <Switch checked={c.value === "true"} onCheckedChange={(v) => updateCondition(idx, { value: v ? "true" : "false" })} />;
                              }
                              const enumOptions = ENUM_VALUE_OPTIONS[c.field];
                              if (op.valueKind === "text" && enumOptions) {
                                return (
                                  <Select value={c.value} onValueChange={(v) => updateCondition(idx, { value: v })}>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select…" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {enumOptions.map((v) => (
                                        <SelectItem key={v} value={v}>
                                          {v}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                );
                              }
                              if (op.valueKind === "listref") {
                                return (
                                  <Input
                                    placeholder="nome_da_list"
                                    value={c.value}
                                    onChange={(e) => updateCondition(idx, { value: e.target.value })}
                                  />
                                );
                              }
                              if (op.valueKind === "list") {
                                return (
                                  <Input
                                    placeholder={enumOptions ? `${enumOptions.slice(0, 2).join(", ")}, …` : "valor1, valor2, valor3"}
                                    value={c.value}
                                    onChange={(e) => updateCondition(idx, { value: e.target.value })}
                                  />
                                );
                              }
                              return (
                                <Input
                                  placeholder={field.type === "ip" ? "1.2.3.4" : EXPR_VALUE_EXAMPLE[field.key] ?? "e.g. https://*.exemplo.com/files/*"}
                                  value={c.value}
                                  onChange={(e) => updateCondition(idx, { value: e.target.value })}
                                />
                              );
                            })()}
                          </div>
                          {conditions.length > 1 && (
                            <button className="ops-btn ghost sm" onClick={() => removeConditionRow(idx)} title="Remover">
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="ops-btn outline sm" onClick={() => addConditionRow("and")}>
                      And
                    </button>
                    <button className="ops-btn outline sm" onClick={() => addConditionRow("or")}>
                      Or
                    </button>
                  </div>
                </div>
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: V2.textMuted,
                        fontFamily: "'IBM Plex Mono',monospace",
                      }}
                    >
                      Expression Preview
                    </span>
                    <button className="ops-btn ghost sm" style={{ color: T.accent }} onClick={() => setExprMode("raw")}>
                      Editar expressão
                    </button>
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      border: `1px solid ${V2.border}`,
                      borderRadius: 6,
                      background: V2.surfaceAlt,
                      padding: "10px 12px",
                    }}
                  >
                    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: V2.textPrimary, wordBreak: "break-all" }}>
                      {expression || "—"}
                    </div>
                    <div style={{ marginTop: 6, textAlign: "right", fontSize: 10, color: V2.textSubtle, fontFamily: "'IBM Plex Mono',monospace" }}>
                      {expression.length} / 4000 characters
                    </div>
                  </div>
                </div>
              </div>
            ))}

          <div style={{ height: 1, background: V2.border }} />

          <div className="ops-field">
            <div style={{ fontSize: 13, fontWeight: 700, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Then…</div>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>
                  Cache eligibility <span style={{ color: V2.textSubtle, fontWeight: 400 }}>(required)</span>
                </div>
              </div>
              <p className="ops-hint" style={{ marginTop: 4 }}>
                Mark whether the request's response from origin is eligible for caching. Caching itself will still depend on the
                cache-control header and your other caching configurations.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                  <input type="radio" checked={!cacheEligible} onChange={() => setCacheEligible(false)} />
                  <span style={{ fontSize: 12, fontWeight: !cacheEligible ? 600 : 400, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>
                    Bypass cache
                  </span>
                </label>
                <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                  <input type="radio" checked={cacheEligible} onChange={() => setCacheEligible(true)} />
                  <span style={{ fontSize: 12, fontWeight: cacheEligible ? 600 : 400, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>
                    Eligible for cache
                  </span>
                </label>
              </div>
            </div>
          </div>

          <div className="ops-field" style={{ gap: 0 }}>
            {cacheEligible && (
              <CacheAddableSetting
                label="Edge TTL"
                description="Specify if and how long Cloudflare should cache the response, depending on if a cache-control header is present on the origin response."
                added={edgeTtlAdded}
                onAdd={() => setEdgeTtlAdded(true)}
                onRemove={() => setEdgeTtlAdded(false)}
              >
                <TtlModeRadios
                  mode={edgeTtlMode}
                  onModeChange={setEdgeTtlMode}
                  seconds={edgeTtlSeconds}
                  onSecondsChange={setEdgeTtlSeconds}
                  labels={TTL_MODE_LABELS_EDGE}
                />
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Status code TTL</div>
                  <p className="ops-hint" style={{ marginTop: 2 }}>
                    Specify how long Cloudflare should cache the response based on the status code from the origin.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 8 }}>
                    {edgeStatusRows.map((row, idx) => (
                      <div key={idx} style={{ display: "flex", gap: 8, alignItems: "flex-end" }}>
                        <div className="ops-field" style={{ flex: "0 0 170px" }}>
                          <ExecLabel>Scope</ExecLabel>
                          <Select
                            value={row.scope}
                            onValueChange={(v) =>
                              setEdgeStatusRows(edgeStatusRows.map((r, i) => (i === idx ? { ...r, scope: v as typeof r.scope } : r)))
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="single">Single code</SelectItem>
                              <SelectItem value="gte">Greater than or equal</SelectItem>
                              <SelectItem value="lte">Less than or equal</SelectItem>
                              <SelectItem value="range">Range</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        {row.scope === "range" ? (
                          <>
                            <div className="ops-field" style={{ flex: "0 0 160px" }}>
                              <ExecLabel>From</ExecLabel>
                              <Select
                                value={row.statusCode}
                                onValueChange={(v) =>
                                  setEdgeStatusRows(edgeStatusRows.map((r, i) => (i === idx ? { ...r, statusCode: v } : r)))
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select" />
                                </SelectTrigger>
                                <SelectContent>
                                  {HTTP_STATUS_CATALOG.map((s) => (
                                    <SelectItem key={s.code} value={String(s.code)}>
                                      {s.code} - {s.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="ops-field" style={{ flex: "0 0 160px" }}>
                              <ExecLabel>to</ExecLabel>
                              <Select
                                value={row.statusCodeTo}
                                onValueChange={(v) =>
                                  setEdgeStatusRows(edgeStatusRows.map((r, i) => (i === idx ? { ...r, statusCodeTo: v } : r)))
                                }
                              >
                                <SelectTrigger>
                                  <SelectValue placeholder="Select" />
                                </SelectTrigger>
                                <SelectContent>
                                  {HTTP_STATUS_CATALOG.map((s) => (
                                    <SelectItem key={s.code} value={String(s.code)}>
                                      {s.code} - {s.label}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </>
                        ) : (
                          <div className="ops-field" style={{ flex: "0 0 200px" }}>
                            <ExecLabel>Status code</ExecLabel>
                            <Select
                              value={row.statusCode}
                              onValueChange={(v) =>
                                setEdgeStatusRows(edgeStatusRows.map((r, i) => (i === idx ? { ...r, statusCode: v } : r)))
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select" />
                              </SelectTrigger>
                              <SelectContent>
                                {HTTP_STATUS_CATALOG.map((s) => (
                                  <SelectItem key={s.code} value={String(s.code)}>
                                    {s.code} - {s.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                        )}
                        <div className="ops-field" style={{ flex: 1, minWidth: 220 }}>
                          <ExecLabel>Duration</ExecLabel>
                          <DurationSelect
                            allowSpecial
                            value={row.seconds}
                            onChange={(v) => setEdgeStatusRows(edgeStatusRows.map((r, i) => (i === idx ? { ...r, seconds: v } : r)))}
                          />
                        </div>
                        <button
                          className="ops-btn ghost sm"
                          onClick={() => setEdgeStatusRows(edgeStatusRows.filter((_, i) => i !== idx))}
                          title="Remover"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    <button
                      className="ops-btn outline sm"
                      style={{ alignSelf: "flex-start" }}
                      onClick={() => setEdgeStatusRows([...edgeStatusRows, { scope: "single", statusCode: "", statusCodeTo: "", seconds: "" }])}
                    >
                      <Plus size={11} /> Add status code setting
                    </button>
                  </div>
                </div>
              </CacheAddableSetting>
            )}

            <CacheAddableSetting
              label="Browser TTL"
                description="Specify how long client browsers should cache the response. Cloudflare cache purge will not purge content cached on client browsers, so high browser TTLs may lead to stale content."
                added={browserTtlAdded}
                onAdd={() => setBrowserTtlAdded(true)}
                onRemove={() => setBrowserTtlAdded(false)}
              >
                <TtlModeRadios
                  mode={browserTtlMode}
                  onModeChange={setBrowserTtlMode}
                  seconds={browserTtlSeconds}
                  onSecondsChange={setBrowserTtlSeconds}
                  labels={TTL_MODE_LABELS_BROWSER}
                />
              </CacheAddableSetting>

            {cacheEligible && (
              <>
              <CacheAddableSetting
                label="Cache key"
                description="Define which components of the request are included or excluded from the cache key Cloudflare uses to store the response in cache."
                added={cacheKeyAdded}
                onAdd={() => setCacheKeyAdded(true)}
                onRemove={() => setCacheKeyAdded(false)}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Cache deception armor</div>
                    <p className="ops-hint">Protect from web cache deception attacks while allowing static assets to be cached.</p>
                    <Switch checked={cacheDeceptionArmor} onCheckedChange={setCacheDeceptionArmor} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Cache by device type</div>
                    <p className="ops-hint">Separate cached content based on the visitor's device type.</p>
                    <Switch checked={cacheByDeviceType} onCheckedChange={setCacheByDeviceType} />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Sort query string</div>
                    <p className="ops-hint">Treat requests with the same query parameters the same, regardless of the order those query parameters are in.</p>
                    <Switch checked={ignoreQueryStringsOrder} onCheckedChange={setIgnoreQueryStringsOrder} />
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: 8,
                      padding: "10px 12px",
                      borderRadius: 6,
                      background: "rgba(59,130,246,0.08)",
                      border: "1px solid rgba(59,130,246,0.2)",
                    }}
                  >
                    <Info size={14} color={T.accent} style={{ flexShrink: 0, marginTop: 2 }} />
                    <div style={{ fontSize: 11, color: V2.textMuted, fontFamily: "var(--font-ui)" }}>
                      Changing the below settings will modify the cache key, effectively purging cache for matching URLs.
                    </div>
                  </div>
                  {/* Query string, Headers, Cookie, Host e User: tudo abaixo de "Sort
                      query string" é Enterprise-only no plano Business (confirmado
                      visualmente — só Cache deception armor/Cache by device
                      type/Sort query string ficam liberados). */}
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <div style={{ display: "flex", flexDirection: "column", gap: 14, opacity: 0.5, cursor: "not-allowed" }}>
                          <div>
                            <ExecLabel>
                              Query string <span style={{ color: V2.textSubtle, fontWeight: 400 }}>(opcional)</span>
                            </ExecLabel>
                            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
                              {(
                                [
                                  ["all", "All query string parameters"],
                                  ["all_except", "All query string parameters except:"],
                                  ["only", "No query parameters except:"],
                                  ["ignore", "Ignore query string"],
                                ] as const
                              ).map(([val, label]) => (
                                <label key={val} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                  <input type="radio" checked={val === "all"} disabled />
                                  <span style={{ fontSize: 12, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>{label}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                          <div>
                            <ExecLabel>
                              Headers <span style={{ color: V2.textSubtle, fontWeight: 400 }}>(opcional)</span>
                            </ExecLabel>
                            <p className="ops-hint">Define which headers will go into the Cache Key.</p>
                            <Input disabled placeholder="custom-header" style={{ marginTop: 6 }} />
                            <div className="ops-field" style={{ marginTop: 10 }}>
                              <ExecLabel>Check presence of</ExecLabel>
                              <Input disabled placeholder="Enter header names" />
                            </div>
                            <div className="ops-check-row" style={{ marginTop: 8 }}>
                              <Checkbox id="include-origin-header" checked disabled />
                              <label htmlFor="include-origin-header" className="ops-check-label">
                                Include origin header
                              </label>
                            </div>
                          </div>
                          <div>
                            <ExecLabel>
                              Cookie <span style={{ color: V2.textSubtle, fontWeight: 400 }}>(opcional)</span>
                            </ExecLabel>
                            <p className="ops-hint">Include these cookie names and their values in the cache key.</p>
                            <Input disabled placeholder="Enter cookie names" style={{ marginTop: 4 }} />
                            <p className="ops-hint" style={{ marginTop: 8 }}>
                              Check presence of
                            </p>
                            <Input disabled placeholder="Enter cookie names" style={{ marginTop: 4 }} />
                          </div>
                          <div>
                            <ExecLabel>Host</ExecLabel>
                            <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
                              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <input type="radio" checked disabled />
                                <span style={{ fontSize: 12, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Use original host</span>
                              </label>
                              <label style={{ display: "flex", gap: 8, alignItems: "center" }}>
                                <input type="radio" checked={false} disabled />
                                <span style={{ fontSize: 12, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Resolved host</span>
                              </label>
                            </div>
                          </div>
                          <div>
                            <ExecLabel>
                              User <span style={{ color: V2.textSubtle, fontWeight: 400 }}>(opcional)</span>
                            </ExecLabel>
                            <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                              <div className="ops-check-row">
                                <Checkbox id="user-device" checked={false} disabled />
                                <label htmlFor="user-device" className="ops-check-label">
                                  Device type
                                </label>
                              </div>
                              <div className="ops-check-row">
                                <Checkbox id="user-country" checked={false} disabled />
                                <label htmlFor="user-country" className="ops-check-label">
                                  Country
                                </label>
                              </div>
                              <div className="ops-check-row">
                                <Checkbox id="user-lang" checked={false} disabled />
                                <label htmlFor="user-lang" className="ops-check-label">
                                  Language
                                </label>
                              </div>
                            </div>
                          </div>
                        </div>
                      </TooltipTrigger>
                      <TooltipContent side="top">{ORIGIN_ENTERPRISE_ONLY_HINT}</TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
              </CacheAddableSetting>

              <CacheAddableSetting
                label="Vary"
                description="Determine how Cloudflare segments responses based on the Vary header."
                added={varyAdded}
                onAdd={() => setVaryAdded(true)}
                onRemove={() => setVaryAdded(false)}
              >
                <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                  {(
                    [
                      ["normalize", "Normalize values (recommended)"],
                      ["passthrough", "Use raw header values"],
                      ["bypass", "Bypass caching"],
                    ] as const
                  ).map(([val, label]) => (
                    <label key={val} style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                      <input type="radio" checked={varyDefaultAction === val} onChange={() => setVaryDefaultAction(val)} />
                      <span style={{ fontSize: 12, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>{label}</span>
                    </label>
                  ))}
                </div>
                <div style={{ marginTop: 14 }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Per header configuration</div>
                  <p className="ops-hint" style={{ marginTop: 2 }}>
                    Determine whether we normalize, use raw value, or bypass cache for specific request headers.
                  </p>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
                    {varyHeaderRows.map((row, idx) => (
                      <div key={idx} style={{ display: "flex", gap: 12, alignItems: "center" }}>
                        <Input
                          placeholder="e.g. accept-encoding"
                          style={{ flex: 1 }}
                          value={row.name}
                          onChange={(e) => setVaryHeaderRows(varyHeaderRows.map((r, i) => (i === idx ? { ...r, name: e.target.value } : r)))}
                        />
                        <Select
                          value={row.action}
                          onValueChange={(v) =>
                            setVaryHeaderRows(varyHeaderRows.map((r, i) => (i === idx ? { ...r, action: v as any } : r)))
                          }
                        >
                          <SelectTrigger style={{ flex: "0 0 200px" }}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="normalize">Normalize values</SelectItem>
                            <SelectItem value="passthrough">Use raw header values</SelectItem>
                            <SelectItem value="bypass">Bypass caching</SelectItem>
                          </SelectContent>
                        </Select>
                        <button
                          className="ops-btn ghost sm"
                          onClick={() => setVaryHeaderRows(varyHeaderRows.filter((_, i) => i !== idx))}
                          title="Remover"
                        >
                          <X size={14} />
                        </button>
                      </div>
                    ))}
                    <button
                      className="ops-btn outline sm"
                      style={{ alignSelf: "flex-start" }}
                      onClick={() => setVaryHeaderRows([...varyHeaderRows, { name: "", action: "normalize" }])}
                    >
                      <Plus size={11} /> Add request header
                    </button>
                  </div>
                </div>
              </CacheAddableSetting>
              </>
            )}
          </div>

          {cacheEligible && (
          <div className="ops-field" style={{ gap: 0 }}>
            <CacheAddableSetting
              label="Serve stale content while revalidating"
              description="Define if Cloudflare should serve stale content while getting the latest content from the origin."
              added={serveStaleAdded}
              onAdd={() => setServeStaleAdded(true)}
              onRemove={() => setServeStaleAdded(false)}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>
                Do not serve stale content while updating
              </div>
              <p className="ops-hint">If on, Cloudflare will not serve stale content while getting the latest content from the origin.</p>
              <Switch checked={disableStaleWhileUpdating} onCheckedChange={setDisableStaleWhileUpdating} />
            </CacheAddableSetting>

            <CacheAddableSetting
              label="Respect strong ETags"
              description="Specify whether or not Cloudflare should respect strong ETag (entity tag) headers."
              added={respectStrongEtagsAdded}
              onAdd={() => setRespectStrongEtagsAdded(true)}
              onRemove={() => setRespectStrongEtagsAdded(false)}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Use strong ETag headers</div>
              <p className="ops-hint">When off, Cloudflare converts strong ETag headers to weak ETag headers.</p>
              <Switch checked={useStrongEtags} onCheckedChange={setUseStrongEtags} />
            </CacheAddableSetting>

            <CacheAddableSetting
              label="Origin error page pass-through"
              description="Define if Cloudflare should use error pages issued by the origin server in case of HTTP error status codes."
              added={originErrorPageAdded}
              onAdd={() => setOriginErrorPageAdded(true)}
              onRemove={() => setOriginErrorPageAdded(false)}
            >
              <div style={{ fontSize: 12, fontWeight: 600, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Use Origin error page pass-thru</div>
              <p className="ops-hint">When enabled, HTTP error pages will be issued from the origin server instead of Cloudflare.</p>
              <Switch checked={originErrorPagePassthru} onCheckedChange={setOriginErrorPagePassthru} />
            </CacheAddableSetting>
          </div>
          )}

          {!editing && (
            <>
              <div style={{ height: 1, background: V2.border }} />
              <div className="ops-field" style={{ alignSelf: "flex-start", width: 220 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: V2.textPrimary, fontFamily: "var(--font-ui)", marginBottom: 6 }}>
                  Place at
                </div>
                <span className="ops-hint" style={{ display: "block", marginBottom: 4 }}>
                  Select order:
                </span>
                <Select value={placeAt} onValueChange={(v) => setPlaceAt(v as "first" | "last" | "custom")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="first">First</SelectItem>
                    <SelectItem value="last">Last</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
                {placeAt === "custom" && (
                  <div style={{ marginTop: 10 }}>
                    <span className="ops-hint" style={{ display: "block", marginBottom: 4 }}>
                      Select which rule this will fire after:
                    </span>
                    <Select value={placeAfterRuleId} onValueChange={setPlaceAfterRuleId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
                      <SelectContent>
                        {otherRules.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.description || r.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <button className="ops-btn outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </button>
          <button className="ops-btn primary" onClick={handleSave} disabled={!canSubmit || saving}>
            {saving ? <Loader2 size={12} className="ops-spin" /> : <Check size={12} />}
            Salvar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Configuration Rules — "Then the settings are…" (lista de settings, cada
// um com "+ Add" pra habilitar) — action "set_config" no Ruleset Engine.
// Confiança: nomes de campo booleanos (automatic_https_rewrites, bic,
// disable_rum, disable_zaraz, email_obfuscation, fonts, hotlink_protection,
// opportunistic_encryption) e os enums (polish, ssl) vêm de documentação
// pública da Cloudflare — alta confiança. "I'm Under Attack" mapeado pro
// campo security_level (under_attack/off) — confiança moderada. "Markdown
// for Agents" e os dois "Body Buffering" são recursos muito recentes e o
// nome exato do campo é o palpite mais fraco daqui — só entram no payload se
// o usuário adicionar aquele setting específico, então um nome errado só
// aparece como erro nessa hora (isolado), sem quebrar os demais.
type ConfigSettingKind = "onoff" | "select";
type ConfigSettingDef = {
  id: string;
  label: string;
  description: string;
  kind: ConfigSettingKind;
  selectLabel?: string;
  options?: Array<{ value: string; label: string }>;
  onValue?: string;
  offValue?: string;
};
const CONFIG_RULE_SETTINGS: ConfigSettingDef[] = [
  {
    id: "automatic_https_rewrites",
    label: "Automatic HTTPS Rewrites",
    description: "Turn on or off the Cloudflare Automatic HTTPS Rewrites feature available in SSL/TLS > Edge Certificates tab.",
    kind: "onoff",
  },
  {
    id: "bic",
    label: "Browser Integrity Check",
    description: "Turn on or off the Browser Integrity Check feature available in Security > Settings tab.",
    kind: "onoff",
  },
  {
    id: "disable_rum",
    label: "Disable Real User Monitoring (RUM)",
    description: "Turn off collecting page load performance information from browsers used by Analytics & Logs > Web Analytics feature.",
    kind: "onoff",
  },
  { id: "disable_zaraz", label: "Disable Zaraz", description: "Turn off Zaraz.", kind: "onoff" },
  {
    id: "email_obfuscation",
    label: "Email Obfuscation",
    description: "Turn on or off the Cloudflare Email Obfuscation feature of the Cloudflare Scrape Shield app.",
    kind: "onoff",
  },
  {
    id: "fonts",
    label: "Fonts",
    description:
      "Turn on or off the Cloudflare Fonts feature that rewrites Google Fonts to be delivered from a website's own origin, eliminating the need to rely on third-party font providers.",
    kind: "onoff",
  },
  {
    id: "hotlink_protection",
    label: "Hotlink Protection",
    description: "Turn on or off the Hotlink Protection feature of the Cloudflare Scrape Shield app.",
    kind: "onoff",
  },
  {
    id: "security_level",
    label: "I'm Under Attack",
    description: "Configure the I'm Under Attack mode setting available in Security > Settings tab.",
    kind: "onoff",
    onValue: "under_attack",
    offValue: "off",
  },
  {
    id: "markdown_for_ai_agents",
    label: "Markdown for Agents - BETA",
    description: "Automatically convert HTML to Markdown for requests that use content negotiation headers (Accept: text/markdown).",
    kind: "onoff",
  },
  {
    id: "opportunistic_encryption",
    label: "Opportunistic Encryption",
    description: "Turn on or off the Cloudflare Opportunistic Encryption feature available in SSL/TLS > Edge Certificates tab.",
    kind: "onoff",
  },
  {
    id: "polish",
    label: "Polish",
    description: "Change the settings of the Polish feature available in the Cloudflare Speed app.",
    kind: "select",
    selectLabel: "Select value",
    options: [
      { value: "off", label: "Off" },
      { value: "lossy", label: "Lossy" },
      { value: "lossless", label: "Lossless" },
      { value: "webp", label: "WebP" },
    ],
  },
  {
    id: "request_body_buffering",
    label: "Request Body Buffering",
    description: "Control how Cloudflare buffers request bodies before sending them to your origin.",
    kind: "select",
    selectLabel: "Select request body buffering",
    options: [
      { value: "standard", label: "Standard (default)" },
      { value: "full", label: "Full" },
      { value: "none", label: "None" },
    ],
  },
  {
    id: "response_body_buffering",
    label: "Response Body Buffering",
    description: "Control how Cloudflare buffers response bodies before sending them to clients.",
    kind: "select",
    selectLabel: "Select response body buffering",
    options: [
      { value: "standard", label: "Standard (default)" },
      { value: "none", label: "None" },
    ],
  },
  {
    id: "ssl",
    label: "SSL",
    description: "Configure SSL settings available in SSL/TLS > Overview tab.",
    kind: "select",
    selectLabel: "Select SSL/TLS encryption mode",
    options: [
      { value: "off", label: "Off" },
      { value: "flexible", label: "Flexible" },
      { value: "full", label: "Full" },
      { value: "strict", label: "Strict" },
    ],
  },
];
function configDefaultValue(def: ConfigSettingDef): string {
  if (def.kind === "select") return def.options?.[0]?.value ?? "";
  return def.offValue ?? "false";
}

function ConfigurationRuleDialog({
  open,
  onOpenChange,
  zoneId,
  rulesetId,
  editing,
  existingRules,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  zoneId: string;
  rulesetId: string | null;
  editing?: OverviewRule | null;
  existingRules?: OverviewRule[];
  onSaved: () => void;
}) {
  const doCreate = useServerFn(createOverviewRule);
  const doUpdate = useServerFn(updateOverviewRule);
  const [description, setDescription] = React.useState("");
  // Configuration Rules nativo só tem 2 opções aqui — sem "Padrão wildcard".
  const [matchMode, setMatchMode] = React.useState<"expression" | "all">("expression");
  const [expression, setExpression] = React.useState("");
  const [exprMode, setExprMode] = React.useState<"builder" | "raw">("builder");
  const [conditions, setConditions] = React.useState<ExprCondition[]>([{ field: EXPR_FIELDS[0].key, operator: "wildcard", value: "" }]);
  const [combinators, setCombinators] = React.useState<Array<"and" | "or">>([]);
  // "Then the settings are…" — cada setting só entra no payload se for adicionado.
  const [addedSettings, setAddedSettings] = React.useState<string[]>([]);
  const [settingValues, setSettingValues] = React.useState<Record<string, string>>({});
  const [placeAt, setPlaceAt] = React.useState<"first" | "last" | "custom">("last");
  const [placeAfterRuleId, setPlaceAfterRuleId] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setDescription(editing?.description ?? "");
    const parsedMatch = parseMatchExpression(editing?.expression ?? "");
    // Não existe modo wildcard aqui — se uma regra antiga tiver esse formato
    // (improvável, já que essa UI nunca oferece essa opção), reconstrói a
    // mesma expressão como texto e trata como "Expressão customizada".
    const resolvedMode = parsedMatch.mode === "wildcard" ? "expression" : parsedMatch.mode;
    const resolvedExpr = parsedMatch.mode === "wildcard" ? buildMatchExpression("wildcard", parsedMatch.wildcardUrl, "") : parsedMatch.expression;
    setMatchMode(editing ? resolvedMode : "expression");
    setExpression(resolvedExpr);
    if (resolvedMode === "expression" && resolvedExpr) {
      const parsedMulti = parseMultiCondition(resolvedExpr);
      if (parsedMulti) {
        setConditions(parsedMulti.conditions);
        setCombinators(parsedMulti.combinators);
        setExprMode("builder");
      } else {
        setExprMode("raw");
      }
    } else {
      setConditions([{ field: EXPR_FIELDS[0].key, operator: "wildcard", value: "" }]);
      setCombinators([]);
      setExprMode("builder");
    }
    const ap = (editing?.action_parameters as any) ?? {};
    const added = CONFIG_RULE_SETTINGS.filter((def) => Object.prototype.hasOwnProperty.call(ap, def.id)).map((def) => def.id);
    setAddedSettings(added);
    const values: Record<string, string> = {};
    for (const def of CONFIG_RULE_SETTINGS) {
      if (added.includes(def.id)) values[def.id] = String(ap[def.id]);
    }
    setSettingValues(values);
    setPlaceAt("last");
    setPlaceAfterRuleId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  React.useEffect(() => {
    if (exprMode === "builder") setExpression(compileExpression(conditions, combinators));
  }, [conditions, combinators, exprMode]);

  function updateCondition(idx: number, patch: Partial<ExprCondition>) {
    setConditions(conditions.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }
  function updateFieldForCondition(idx: number, fieldKey: string) {
    const defaultOp = getExprOperators(fieldKey)[0];
    updateCondition(idx, { field: fieldKey, operator: defaultOp.key, value: defaultOp.valueKind === "bool" ? "true" : "" });
  }
  function updateOperatorForCondition(idx: number, opKey: string, ops: ExprOperator[]) {
    const op = ops.find((o) => o.key === opKey) ?? ops[0];
    updateCondition(idx, { operator: opKey, value: op.valueKind === "bool" ? "true" : "" });
  }
  function addConditionRow(combinator: "and" | "or") {
    setConditions([...conditions, { field: EXPR_FIELDS[0].key, operator: "wildcard", value: "" }]);
    setCombinators([...combinators, combinator]);
  }
  function removeConditionRow(idx: number) {
    if (conditions.length <= 1) return;
    setConditions(conditions.filter((_, i) => i !== idx));
    setCombinators(combinators.filter((_, i) => i !== (idx === 0 ? 0 : idx - 1)));
  }
  function switchToExpressionBuilder() {
    const parsedMulti = parseMultiCondition(expression);
    // Expressão vazia: começa o builder do zero
    if (!expression.trim()) {
      setConditions([{ field: EXPR_FIELDS[0].key, operator: "wildcard", value: "" }]);
      setCombinators([]);
      setExprMode("builder");
      return;
    }
    // Se o builder não reconhece a expressão, ficar no modo texto em vez de
    // trocar e apagar o que já estava escrito
    if (!parsedMulti) {
      toast.warning("O builder não reconhece esta expressão. Continue editando no modo texto para não perdê-la.");
      return;
    }
    setConditions(parsedMulti.conditions);
    setCombinators(parsedMulti.combinators);
    setExprMode("builder");
  }

  function addSetting(def: ConfigSettingDef) {
    if (addedSettings.includes(def.id)) return;
    setAddedSettings([...addedSettings, def.id]);
    setSettingValues({ ...settingValues, [def.id]: configDefaultValue(def) });
  }
  function removeSetting(id: string) {
    setAddedSettings(addedSettings.filter((s) => s !== id));
  }

  const finalExpression = buildMatchExpression(matchMode, "", expression);
  const builderConditionsFilled = exprMode === "raw" || conditions.every((c) => c.value.trim().length > 0);
  const matchFilled = matchMode === "all" || (!!expression.trim() && builderConditionsFilled);
  const canSubmit = !!(description.trim() && matchFilled && addedSettings.length > 0);
  const otherRules = (existingRules ?? []).filter((r) => r.id !== editing?.id);

  function buildActionParameters(): Record<string, unknown> {
    const params: Record<string, unknown> = {};
    for (const id of addedSettings) {
      const def = CONFIG_RULE_SETTINGS.find((d) => d.id === id);
      if (!def) continue;
      const raw = settingValues[id] ?? configDefaultValue(def);
      if (def.kind === "onoff") {
        params[id] = raw === (def.onValue ?? "true") ? def.onValue ?? true : def.offValue ?? false;
      } else {
        params[id] = raw;
      }
    }
    return params;
  }

  async function handleSave() {
    setSaving(true);
    try {
      const action_parameters = buildActionParameters();
      if (editing) {
        if (!rulesetId) {
          toast.error("Ruleset ID não encontrado. Atualize a lista e tente de novo.");
          return;
        }
        const res: any = await doUpdate({
          data: {
            zoneId,
            category: "configuration",
            rulesetId,
            ruleId: editing.id,
            description,
            expression: finalExpression,
            action: "set_config",
            action_parameters,
            enabled: editing.enabled,
          },
        });
        if (res.ok) {
          toast.success("Configuration Rule atualizada.");
          onSaved();
        } else toast.error(res.error);
      } else {
        const position =
          placeAt === "first" ? { index: 0 } : placeAt === "custom" && placeAfterRuleId ? { after: placeAfterRuleId } : undefined;
        const res: any = await doCreate({
          data: {
            zoneId,
            category: "configuration",
            description,
            expression: finalExpression,
            action: "set_config",
            action_parameters,
            ...(position ? { position } : {}),
          },
        });
        if (res.ok) {
          toast.success("Configuration Rule criada.");
          onSaved();
        } else toast.error(res.error);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" style={{ maxHeight: "85vh", overflowY: "auto" }}>
        <DialogHeader>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingRight: 24 }}>
            <DialogTitle style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {editing ? <Pencil size={16} color={T.accent} /> : <Plus size={16} color={T.accent} />}
              {editing ? "Editar Configuration Rule" : "Criar Configuration Rule"}
            </DialogTitle>
            <DocsLinkButton category="configuration" />
          </div>
        </DialogHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 22, padding: "8px 0" }}>
          <div className="ops-field">
            <ExecLabel>Nome da regra</ExecLabel>
            <Input placeholder="Ex.: Configuração — portal-blue" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div style={{ height: 1, background: V2.border }} />

          <div className="ops-field">
            <ExecLabel>Se a requisição bater com…</ExecLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 4 }}>
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
                <input type="radio" checked={matchMode === "expression"} onChange={() => setMatchMode("expression")} style={{ marginTop: 3 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Expressão customizada</div>
                  <div className="ops-hint">Só aplica a regra em requisições que baterem com a expressão.</div>
                </div>
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
                <input type="radio" checked={matchMode === "all"} onChange={() => setMatchMode("all")} style={{ marginTop: 3 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Todas as requisições</div>
                  <div className="ops-hint">Aplica a regra em toda requisição, sem filtro.</div>
                </div>
              </label>
            </div>
          </div>

          {matchMode === "expression" &&
            (exprMode === "raw" ? (
              <div className="ops-field">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <ExecLabel>Expressão</ExecLabel>
                  <button className="ops-btn ghost sm" style={{ color: T.accent }} onClick={switchToExpressionBuilder}>
                    Use expression builder
                  </button>
                </div>
                <Textarea
                  placeholder={'(http.host eq "exemplo.com")'}
                  rows={2}
                  value={expression}
                  onChange={(e) => setExpression(e.target.value)}
                />
                <p className="ops-hint">Mesma sintaxe de expressão usada em Custom Rules (WAF).</p>
              </div>
            ) : (
              <div className="ops-field">
                <ExecLabel>When incoming requests match…</ExecLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
                  {conditions.map((c, idx) => {
                    const field = EXPR_FIELDS.find((f) => f.key === c.field) ?? EXPR_FIELDS[0];
                    const ops = getExprOperators(c.field);
                    return (
                      <div key={idx}>
                        {idx > 0 && (
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 500,
                              color: V2.textMuted,
                              fontFamily: "'IBM Plex Mono',monospace",
                              margin: "6px 0",
                            }}
                          >
                            {combinators[idx - 1]}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <div style={{ flex: "0 0 140px" }}>
                            <Select value={c.field} onValueChange={(v) => updateFieldForCondition(idx, v)}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {EXPR_FIELDS.map((f) => (
                                  <SelectItem key={f.key} value={f.key}>
                                    {f.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div style={{ flex: "0 0 140px" }}>
                            <Select
                              value={c.operator}
                              onValueChange={(v) => updateOperatorForCondition(idx, v, ops)}
                              disabled={field.type === "bool"}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ops.map((o) => (
                                  <SelectItem key={o.key} value={o.key}>
                                    {o.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
                            {(() => {
                              const op = ops.find((o) => o.key === c.operator) ?? ops[0];
                              if (op.valueKind === "bool") {
                                return <Switch checked={c.value === "true"} onCheckedChange={(v) => updateCondition(idx, { value: v ? "true" : "false" })} />;
                              }
                              const enumOptions = ENUM_VALUE_OPTIONS[c.field];
                              if (op.valueKind === "text" && enumOptions) {
                                return (
                                  <Select value={c.value} onValueChange={(v) => updateCondition(idx, { value: v })}>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select…" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {enumOptions.map((v) => (
                                        <SelectItem key={v} value={v}>
                                          {v}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                );
                              }
                              if (op.valueKind === "listref") {
                                return (
                                  <Input
                                    placeholder="nome_da_list"
                                    value={c.value}
                                    onChange={(e) => updateCondition(idx, { value: e.target.value })}
                                  />
                                );
                              }
                              if (op.valueKind === "list") {
                                return (
                                  <Input
                                    placeholder={enumOptions ? `${enumOptions.slice(0, 2).join(", ")}, …` : "valor1, valor2, valor3"}
                                    value={c.value}
                                    onChange={(e) => updateCondition(idx, { value: e.target.value })}
                                  />
                                );
                              }
                              return (
                                <Input
                                  placeholder={field.type === "ip" ? "1.2.3.4" : EXPR_VALUE_EXAMPLE[field.key] ?? "e.g. https://*.exemplo.com/files/*"}
                                  value={c.value}
                                  onChange={(e) => updateCondition(idx, { value: e.target.value })}
                                />
                              );
                            })()}
                          </div>
                          {conditions.length > 1 && (
                            <button className="ops-btn ghost sm" onClick={() => removeConditionRow(idx)} title="Remover">
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="ops-btn outline sm" onClick={() => addConditionRow("and")}>
                      And
                    </button>
                    <button className="ops-btn outline sm" onClick={() => addConditionRow("or")}>
                      Or
                    </button>
                  </div>
                </div>
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: V2.textMuted,
                        fontFamily: "'IBM Plex Mono',monospace",
                      }}
                    >
                      Expression Preview
                    </span>
                    <button className="ops-btn ghost sm" style={{ color: T.accent }} onClick={() => setExprMode("raw")}>
                      Editar expressão
                    </button>
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      border: `1px solid ${V2.border}`,
                      borderRadius: 6,
                      background: V2.surfaceAlt,
                      padding: "10px 12px",
                    }}
                  >
                    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: V2.textPrimary, wordBreak: "break-all" }}>
                      {expression || "—"}
                    </div>
                    <div style={{ marginTop: 6, textAlign: "right", fontSize: 10, color: V2.textSubtle, fontFamily: "'IBM Plex Mono',monospace" }}>
                      {expression.length} / 4000 characters
                    </div>
                  </div>
                </div>
              </div>
            ))}

          <div style={{ height: 1, background: V2.border }} />

          <div className="ops-field" style={{ gap: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: V2.textPrimary, fontFamily: "var(--font-ui)", marginBottom: 4 }}>
              Then the settings are…
            </div>
            {CONFIG_RULE_SETTINGS.map((def, idx) => {
              const isAdded = addedSettings.includes(def.id);
              return (
                <div key={def.id} style={{ borderTop: idx > 0 ? `1px solid ${V2.border}` : "none", padding: "14px 0" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>
                        {def.label} <span style={{ color: V2.textSubtle, fontWeight: 400 }}>(optional)</span>
                      </div>
                      <p className="ops-hint" style={{ marginTop: 4, maxWidth: 560 }}>
                        {def.description}
                      </p>
                    </div>
                    {isAdded ? (
                      <button className="ops-btn ghost sm" onClick={() => removeSetting(def.id)} title="Remover">
                        <X size={14} />
                      </button>
                    ) : (
                      <button className="ops-btn outline sm" onClick={() => addSetting(def)} style={{ flexShrink: 0 }}>
                        <Plus size={11} /> Add
                      </button>
                    )}
                  </div>
                  {isAdded && (
                    <div style={{ marginTop: 10 }}>
                      {def.kind === "onoff" ? (
                        <Switch
                          checked={settingValues[def.id] === (def.onValue ?? "true")}
                          onCheckedChange={(v) => setSettingValues({ ...settingValues, [def.id]: v ? def.onValue ?? "true" : def.offValue ?? "false" })}
                        />
                      ) : (
                        <div style={{ maxWidth: 280 }}>
                          {def.selectLabel && <span className="ops-hint" style={{ display: "block", marginBottom: 4 }}>{def.selectLabel}</span>}
                          <Select value={settingValues[def.id] ?? configDefaultValue(def)} onValueChange={(v) => setSettingValues({ ...settingValues, [def.id]: v })}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {def.options?.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                  {o.label}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {!editing && (
            <>
              <div style={{ height: 1, background: V2.border }} />
              <div className="ops-field" style={{ alignSelf: "flex-start", width: 220 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: V2.textPrimary, fontFamily: "var(--font-ui)", marginBottom: 6 }}>
                  Place at
                </div>
                <span className="ops-hint" style={{ display: "block", marginBottom: 4 }}>
                  Select order:
                </span>
                <Select value={placeAt} onValueChange={(v) => setPlaceAt(v as "first" | "last" | "custom")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="first">First</SelectItem>
                    <SelectItem value="last">Last</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
                {placeAt === "custom" && (
                  <div style={{ marginTop: 10 }}>
                    <span className="ops-hint" style={{ display: "block", marginBottom: 4 }}>
                      Select which rule this will fire after:
                    </span>
                    <Select value={placeAfterRuleId} onValueChange={setPlaceAfterRuleId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
                      <SelectContent>
                        {otherRules.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.description || r.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <button className="ops-btn outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </button>
          <button className="ops-btn primary" onClick={handleSave} disabled={!canSubmit || saving}>
            {saving ? <Loader2 size={12} className="ops-spin" /> : <Check size={12} />}
            Salvar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Cache Response Rules — phase http_response_cache_settings, com 3 ações
// mutuamente exclusivas (uma regra só pode ter UMA): set_cache_control (13
// directives confirmadas via documentação pública, na mesma ordem do
// dropdown nativo), set_cache_tags (manual ou parse de header via split()) e
// set_cache_settings (strip de 3 headers específicos). Todos os nomes de
// campo (operation/value/cloudflare_only/qualifiers/strip_etags/
// strip_set_cookie/strip_last_modified) vêm confirmados de exemplos JSON
// reais da documentação da Cloudflare — alta confiança.
const CACHE_CONTROL_DIRECTIVES = [
  "max-age",
  "immutable",
  "must-revalidate",
  "must-understand",
  "no-cache",
  "no-store",
  "no-transform",
  "private",
  "proxy-revalidate",
  "public",
  "s-maxage",
  "stale-if-error",
  "stale-while-revalidate",
] as const;
const DIRECTIVES_WITH_VALUE = new Set(["max-age", "s-maxage", "stale-if-error", "stale-while-revalidate"]);
const DIRECTIVES_WITH_QUALIFIERS = new Set(["private", "no-cache"]);

function CacheResponseRuleDialog({
  open,
  onOpenChange,
  zoneId,
  rulesetId,
  editing,
  existingRules,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  zoneId: string;
  rulesetId: string | null;
  editing?: OverviewRule | null;
  existingRules?: OverviewRule[];
  onSaved: () => void;
}) {
  const doCreate = useServerFn(createOverviewRule);
  const doUpdate = useServerFn(updateOverviewRule);
  const [description, setDescription] = React.useState("");
  const [matchMode, setMatchMode] = React.useState<"expression" | "all">("expression");
  const [expression, setExpression] = React.useState("");
  const [exprMode, setExprMode] = React.useState<"builder" | "raw">("builder");
  const [conditions, setConditions] = React.useState<ExprCondition[]>([{ field: EXPR_FIELDS[0].key, operator: "wildcard", value: "" }]);
  const [combinators, setCombinators] = React.useState<Array<"and" | "or">>([]);

  // "Then…" — 3 tipos de ação mutuamente exclusivos.
  const [responseAction, setResponseAction] = React.useState<"cache_control" | "cache_tags" | "strip_headers">("cache_control");

  // Modify cache-control directives
  const [directiveRows, setDirectiveRows] = React.useState<
    Array<{ directive: string; op: "set" | "remove"; value: string; qualifiers: string; cloudflareOnly: boolean }>
  >([]);

  // Modify cache tags
  const [tagSource, setTagSource] = React.useState<"manual" | "header">("manual");
  const [tagValues, setTagValues] = React.useState("");
  const [tagHeaderName, setTagHeaderName] = React.useState("");
  const [tagSeparator, setTagSeparator] = React.useState(",");
  const [tagLimit, setTagLimit] = React.useState("");
  const [tagAction, setTagAction] = React.useState<"add" | "remove" | "set">("add");

  // Strip headers — linhas dinâmicas Action (Strip/Don't strip) + Header,
  // igual ao nativo ("+ Add action"), não 3 checkboxes fixos.
  const [stripRows, setStripRows] = React.useState<Array<{ header: "etag" | "set_cookie" | "last_modified"; action: "strip" | "dont_strip" }>>(
    [],
  );

  const [placeAt, setPlaceAt] = React.useState<"first" | "last" | "custom">("last");
  const [placeAfterRuleId, setPlaceAfterRuleId] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) return;
    setDescription(editing?.description ?? "");
    const parsedMatchRaw = parseMatchExpression(editing?.expression ?? "");
    const resolvedMode = parsedMatchRaw.mode === "wildcard" ? "expression" : parsedMatchRaw.mode;
    const resolvedExpr =
      parsedMatchRaw.mode === "wildcard" ? buildMatchExpression("wildcard", parsedMatchRaw.wildcardUrl, "") : parsedMatchRaw.expression;
    setMatchMode(editing ? resolvedMode : "expression");
    setExpression(resolvedExpr);
    if (resolvedMode === "expression" && resolvedExpr) {
      const parsedMulti = parseMultiCondition(resolvedExpr);
      if (parsedMulti) {
        setConditions(parsedMulti.conditions);
        setCombinators(parsedMulti.combinators);
        setExprMode("builder");
      } else {
        setExprMode("raw");
      }
    } else {
      setConditions([{ field: EXPR_FIELDS[0].key, operator: "wildcard", value: "" }]);
      setCombinators([]);
      setExprMode("builder");
    }

    const ap = (editing?.action_parameters as any) ?? {};
    if (editing?.action === "set_cache_tags") {
      setResponseAction("cache_tags");
      setTagAction(ap.operation ?? "add");
      if (typeof ap.expression === "string") {
        setTagSource("header");
        const m = ap.expression.match(/^split\(http\.response\.headers\["([^"]*)"\]\[0\],\s*"([^"]*)",\s*(\d+)\)$/);
        if (m) {
          setTagHeaderName(m[1]);
          setTagSeparator(m[2]);
          setTagLimit(m[3]);
        } else {
          setTagHeaderName("");
          setTagSeparator(",");
          setTagLimit("");
        }
        setTagValues("");
      } else {
        setTagSource("manual");
        setTagValues((ap.values ?? []).join(", "));
        setTagHeaderName("");
        setTagSeparator(",");
        setTagLimit("");
      }
      setDirectiveRows([]);
      setStripRows([]);
    } else if (editing?.action === "set_cache_settings") {
      setResponseAction("strip_headers");
      const rows: Array<{ header: "etag" | "set_cookie" | "last_modified"; action: "strip" | "dont_strip" }> = [];
      if (ap.strip_etags !== undefined) rows.push({ header: "etag", action: ap.strip_etags ? "strip" : "dont_strip" });
      if (ap.strip_set_cookie !== undefined) rows.push({ header: "set_cookie", action: ap.strip_set_cookie ? "strip" : "dont_strip" });
      if (ap.strip_last_modified !== undefined)
        rows.push({ header: "last_modified", action: ap.strip_last_modified ? "strip" : "dont_strip" });
      setStripRows(rows);
      setDirectiveRows([]);
      setTagSource("manual");
      setTagValues("");
      setTagHeaderName("");
      setTagSeparator(",");
      setTagLimit("");
    } else {
      // set_cache_control (ou regra nova) — padrão
      setResponseAction("cache_control");
      setDirectiveRows(
        Object.entries(ap).map(([directive, cfg]: [string, any]) => ({
          directive,
          op: cfg?.operation === "remove" ? "remove" : "set",
          value: cfg?.value != null ? String(cfg.value) : "",
          qualifiers: Array.isArray(cfg?.qualifiers) ? cfg.qualifiers.join(", ") : "",
          cloudflareOnly: !!cfg?.cloudflare_only,
        })),
      );
      setStripRows([]);
      setTagSource("manual");
      setTagValues("");
      setTagHeaderName("");
      setTagSeparator(",");
      setTagLimit("");
    }

    setPlaceAt("last");
    setPlaceAfterRuleId("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  React.useEffect(() => {
    if (exprMode === "builder") setExpression(compileExpression(conditions, combinators));
  }, [conditions, combinators, exprMode]);

  function updateCondition(idx: number, patch: Partial<ExprCondition>) {
    setConditions(conditions.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }
  function updateFieldForCondition(idx: number, fieldKey: string) {
    const defaultOp = getExprOperators(fieldKey)[0];
    updateCondition(idx, { field: fieldKey, operator: defaultOp.key, value: defaultOp.valueKind === "bool" ? "true" : "" });
  }
  function updateOperatorForCondition(idx: number, opKey: string, ops: ExprOperator[]) {
    const op = ops.find((o) => o.key === opKey) ?? ops[0];
    updateCondition(idx, { operator: opKey, value: op.valueKind === "bool" ? "true" : "" });
  }
  function addConditionRow(combinator: "and" | "or") {
    setConditions([...conditions, { field: EXPR_FIELDS[0].key, operator: "wildcard", value: "" }]);
    setCombinators([...combinators, combinator]);
  }
  function removeConditionRow(idx: number) {
    if (conditions.length <= 1) return;
    setConditions(conditions.filter((_, i) => i !== idx));
    setCombinators(combinators.filter((_, i) => i !== (idx === 0 ? 0 : idx - 1)));
  }
  function switchToExpressionBuilder() {
    const parsedMulti = parseMultiCondition(expression);
    // Expressão vazia: começa o builder do zero
    if (!expression.trim()) {
      setConditions([{ field: EXPR_FIELDS[0].key, operator: "wildcard", value: "" }]);
      setCombinators([]);
      setExprMode("builder");
      return;
    }
    // Se o builder não reconhece a expressão, ficar no modo texto em vez de
    // trocar e apagar o que já estava escrito
    if (!parsedMulti) {
      toast.warning("O builder não reconhece esta expressão. Continue editando no modo texto para não perdê-la.");
      return;
    }
    setConditions(parsedMulti.conditions);
    setCombinators(parsedMulti.combinators);
    setExprMode("builder");
  }

  function addDirectiveRow() {
    setDirectiveRows([...directiveRows, { directive: CACHE_CONTROL_DIRECTIVES[0], op: "set", value: "", qualifiers: "", cloudflareOnly: false }]);
  }
  function updateDirectiveRow(idx: number, patch: Partial<(typeof directiveRows)[number]>) {
    setDirectiveRows(directiveRows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  const finalExpression = buildMatchExpression(matchMode, "", expression);
  const builderConditionsFilled = exprMode === "raw" || conditions.every((c) => c.value.trim().length > 0);
  const matchFilled = matchMode === "all" || (!!expression.trim() && builderConditionsFilled);
  const otherRules = (existingRules ?? []).filter((r) => r.id !== editing?.id);

  function buildActionAndParameters(): { action: string; action_parameters: Record<string, unknown> } | null {
    if (responseAction === "cache_control") {
      const params: Record<string, unknown> = {};
      for (const row of directiveRows) {
        if (!row.directive) continue;
        if (row.op === "remove") {
          params[row.directive] = { operation: "remove" };
          continue;
        }
        const entry: Record<string, unknown> = { operation: "set" };
        if (DIRECTIVES_WITH_VALUE.has(row.directive) && row.value.trim()) entry.value = Number(row.value);
        if (DIRECTIVES_WITH_QUALIFIERS.has(row.directive) && row.qualifiers.trim()) entry.qualifiers = splitListValues(row.qualifiers);
        if (row.cloudflareOnly) entry.cloudflare_only = true;
        params[row.directive] = entry;
      }
      return Object.keys(params).length > 0 ? { action: "set_cache_control", action_parameters: params } : null;
    }
    if (responseAction === "cache_tags") {
      const params: Record<string, unknown> = { operation: tagAction };
      if (tagSource === "manual") {
        const vals = splitListValues(tagValues);
        if (vals.length === 0) return null;
        params.values = vals;
      } else {
        if (!tagHeaderName.trim() || !tagLimit.trim()) return null;
        params.expression = `split(http.response.headers["${escStr(tagHeaderName.trim())}"][0], "${escStr(tagSeparator)}", ${Number(tagLimit)})`;
      }
      return { action: "set_cache_tags", action_parameters: params };
    }
    const STRIP_PARAM_KEY: Record<string, string> = { etag: "strip_etags", set_cookie: "strip_set_cookie", last_modified: "strip_last_modified" };
    const params: Record<string, unknown> = {};
    for (const row of stripRows) {
      params[STRIP_PARAM_KEY[row.header]] = row.action === "strip";
    }
    return Object.keys(params).length > 0 ? { action: "set_cache_settings", action_parameters: params } : null;
  }

  const built = buildActionAndParameters();
  const canSubmit = !!(description.trim() && matchFilled && built);

  async function handleSave() {
    if (!built) return;
    setSaving(true);
    try {
      if (editing) {
        if (!rulesetId) {
          toast.error("Ruleset ID não encontrado. Atualize a lista e tente de novo.");
          return;
        }
        const res: any = await doUpdate({
          data: {
            zoneId,
            category: "cache_response",
            rulesetId,
            ruleId: editing.id,
            description,
            expression: finalExpression,
            action: built.action,
            action_parameters: built.action_parameters,
            enabled: editing.enabled,
          },
        });
        if (res.ok) {
          toast.success("Cache Response Rule atualizada.");
          onSaved();
        } else toast.error(res.error);
      } else {
        const position =
          placeAt === "first" ? { index: 0 } : placeAt === "custom" && placeAfterRuleId ? { after: placeAfterRuleId } : undefined;
        const res: any = await doCreate({
          data: {
            zoneId,
            category: "cache_response",
            description,
            expression: finalExpression,
            action: built.action,
            action_parameters: built.action_parameters,
            ...(position ? { position } : {}),
          },
        });
        if (res.ok) {
          toast.success("Cache Response Rule criada.");
          onSaved();
        } else toast.error(res.error);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl" style={{ maxHeight: "85vh", overflowY: "auto" }}>
        <DialogHeader>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingRight: 24 }}>
            <DialogTitle style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {editing ? <Pencil size={16} color={T.accent} /> : <Plus size={16} color={T.accent} />}
              {editing ? "Editar Cache Response Rule" : "Criar Cache Response Rule"}
            </DialogTitle>
            <DocsLinkButton category="cache_response" />
          </div>
        </DialogHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 22, padding: "8px 0" }}>
          <div className="ops-field">
            <ExecLabel>Nome da regra</ExecLabel>
            <Input placeholder="Ex.: Cache tags — portal-blue" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>

          <div style={{ height: 1, background: V2.border }} />

          <div className="ops-field">
            <ExecLabel>Se a requisição bater com…</ExecLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 4 }}>
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
                <input type="radio" checked={matchMode === "expression"} onChange={() => setMatchMode("expression")} style={{ marginTop: 3 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Expressão customizada</div>
                  <div className="ops-hint">Só aplica a regra em requisições que baterem com a expressão.</div>
                </div>
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
                <input type="radio" checked={matchMode === "all"} onChange={() => setMatchMode("all")} style={{ marginTop: 3 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Todas as requisições</div>
                  <div className="ops-hint">Aplica a regra em toda requisição, sem filtro.</div>
                </div>
              </label>
            </div>
          </div>

          {matchMode === "expression" &&
            (exprMode === "raw" ? (
              <div className="ops-field">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <ExecLabel>Expressão</ExecLabel>
                  <button className="ops-btn ghost sm" style={{ color: T.accent }} onClick={switchToExpressionBuilder}>
                    Use expression builder
                  </button>
                </div>
                <Textarea
                  placeholder={'(http.host eq "exemplo.com")'}
                  rows={2}
                  value={expression}
                  onChange={(e) => setExpression(e.target.value)}
                />
                <p className="ops-hint">Mesma sintaxe de expressão usada em Custom Rules (WAF).</p>
              </div>
            ) : (
              <div className="ops-field">
                <ExecLabel>When incoming requests match…</ExecLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
                  {conditions.map((c, idx) => {
                    const field = EXPR_FIELDS.find((f) => f.key === c.field) ?? EXPR_FIELDS[0];
                    const ops = getExprOperators(c.field);
                    return (
                      <div key={idx}>
                        {idx > 0 && (
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 500,
                              color: V2.textMuted,
                              fontFamily: "'IBM Plex Mono',monospace",
                              margin: "6px 0",
                            }}
                          >
                            {combinators[idx - 1]}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <div style={{ flex: "0 0 140px" }}>
                            <Select value={c.field} onValueChange={(v) => updateFieldForCondition(idx, v)}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {EXPR_FIELDS.map((f) => (
                                  <SelectItem key={f.key} value={f.key}>
                                    {f.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div style={{ flex: "0 0 140px" }}>
                            <Select
                              value={c.operator}
                              onValueChange={(v) => updateOperatorForCondition(idx, v, ops)}
                              disabled={field.type === "bool"}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ops.map((o) => (
                                  <SelectItem key={o.key} value={o.key}>
                                    {o.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
                            {(() => {
                              const op = ops.find((o) => o.key === c.operator) ?? ops[0];
                              if (op.valueKind === "bool") {
                                return <Switch checked={c.value === "true"} onCheckedChange={(v) => updateCondition(idx, { value: v ? "true" : "false" })} />;
                              }
                              const enumOptions = ENUM_VALUE_OPTIONS[c.field];
                              if (op.valueKind === "text" && enumOptions) {
                                return (
                                  <Select value={c.value} onValueChange={(v) => updateCondition(idx, { value: v })}>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select…" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {enumOptions.map((v) => (
                                        <SelectItem key={v} value={v}>
                                          {v}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                );
                              }
                              if (op.valueKind === "listref") {
                                return (
                                  <Input
                                    placeholder="nome_da_list"
                                    value={c.value}
                                    onChange={(e) => updateCondition(idx, { value: e.target.value })}
                                  />
                                );
                              }
                              if (op.valueKind === "list") {
                                return (
                                  <Input
                                    placeholder={enumOptions ? `${enumOptions.slice(0, 2).join(", ")}, …` : "valor1, valor2, valor3"}
                                    value={c.value}
                                    onChange={(e) => updateCondition(idx, { value: e.target.value })}
                                  />
                                );
                              }
                              return (
                                <Input
                                  placeholder={field.type === "ip" ? "1.2.3.4" : EXPR_VALUE_EXAMPLE[field.key] ?? "e.g. https://*.exemplo.com/files/*"}
                                  value={c.value}
                                  onChange={(e) => updateCondition(idx, { value: e.target.value })}
                                />
                              );
                            })()}
                          </div>
                          {conditions.length > 1 && (
                            <button className="ops-btn ghost sm" onClick={() => removeConditionRow(idx)} title="Remover">
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="ops-btn outline sm" onClick={() => addConditionRow("and")}>
                      And
                    </button>
                    <button className="ops-btn outline sm" onClick={() => addConditionRow("or")}>
                      Or
                    </button>
                  </div>
                </div>
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: V2.textMuted,
                        fontFamily: "'IBM Plex Mono',monospace",
                      }}
                    >
                      Expression Preview
                    </span>
                    <button className="ops-btn ghost sm" style={{ color: T.accent }} onClick={() => setExprMode("raw")}>
                      Editar expressão
                    </button>
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      border: `1px solid ${V2.border}`,
                      borderRadius: 6,
                      background: V2.surfaceAlt,
                      padding: "10px 12px",
                    }}
                  >
                    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: V2.textPrimary, wordBreak: "break-all" }}>
                      {expression || "—"}
                    </div>
                    <div style={{ marginTop: 6, textAlign: "right", fontSize: 10, color: V2.textSubtle, fontFamily: "'IBM Plex Mono',monospace" }}>
                      {expression.length} / 4000 characters
                    </div>
                  </div>
                </div>
              </div>
            ))}

          <div style={{ height: 1, background: V2.border }} />

          <div className="ops-field">
            <div style={{ fontSize: 13, fontWeight: 700, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Then…</div>
            <p className="ops-hint">
              Select how to transform the cached response.
            </p>
            <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
                <input type="radio" checked={responseAction === "cache_control"} onChange={() => setResponseAction("cache_control")} style={{ marginTop: 3 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Modify cache-control directives</div>
                  <div className="ops-hint">Set or remove directives sent by your origin.</div>
                </div>
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
                <input type="radio" checked={responseAction === "cache_tags"} onChange={() => setResponseAction("cache_tags")} style={{ marginTop: 3 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Modify cache tags</div>
                  <div className="ops-hint">
                    Add to an existing set of tags, override the current set of tags with new tags, or specify which tags to remove
                    from the current set of tags.
                  </div>
                </div>
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
                <input type="radio" checked={responseAction === "strip_headers"} onChange={() => setResponseAction("strip_headers")} style={{ marginTop: 3 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Strip headers</div>
                  <div className="ops-hint">Strip last-modified, Etag or Set-Cookie headers before Cloudflare evaluates these responses for caching.</div>
                </div>
              </label>
            </div>

            {responseAction === "cache_control" && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Cache-control directives</div>
                <p className="ops-hint">Set or remove cache-control directives sent by your origin.</p>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 8 }}>
                  {directiveRows.map((row, idx) => (
                    <div key={idx} style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
                      <div className="ops-field" style={{ flex: "0 0 160px" }}>
                        <ExecLabel>Action</ExecLabel>
                        <Select value={row.op} onValueChange={(v) => updateDirectiveRow(idx, { op: v as "set" | "remove" })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="set">Add directive</SelectItem>
                            <SelectItem value="remove">Remove directive</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="ops-field" style={{ flex: "0 0 200px" }}>
                        <ExecLabel>Directive</ExecLabel>
                        <Select value={row.directive} onValueChange={(v) => updateDirectiveRow(idx, { directive: v })}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select…" />
                          </SelectTrigger>
                          <SelectContent>
                            {CACHE_CONTROL_DIRECTIVES.map((d) => (
                              <SelectItem key={d} value={d}>
                                {d}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {row.op === "set" && DIRECTIVES_WITH_VALUE.has(row.directive) && (
                        <div className="ops-field" style={{ flex: "0 0 140px" }}>
                          <ExecLabel>Value (segundos)</ExecLabel>
                          <Input type="number" min={0} value={row.value} onChange={(e) => updateDirectiveRow(idx, { value: e.target.value })} />
                        </div>
                      )}
                      {row.op === "set" && DIRECTIVES_WITH_QUALIFIERS.has(row.directive) && (
                        <div className="ops-field" style={{ flex: 1 }}>
                          <ExecLabel>Qualifiers (opcional, nomes de header separados por vírgula)</ExecLabel>
                          <Input value={row.qualifiers} onChange={(e) => updateDirectiveRow(idx, { qualifiers: e.target.value })} />
                        </div>
                      )}
                      {row.op === "set" && (
                        <TooltipProvider delayDuration={150}>
                          <Tooltip>
                            <TooltipTrigger asChild>
                              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                                <span style={{ fontSize: 11, color: V2.textMuted, fontFamily: "var(--font-ui)", display: "flex", alignItems: "center", gap: 4 }}>
                                  Cloudflare only <Info size={11} />
                                </span>
                                <Switch checked={row.cloudflareOnly} onCheckedChange={(v) => updateDirectiveRow(idx, { cloudflareOnly: v })} />
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="top">
                              Aplica só pra decisão de cache da Cloudflare, sem alterar o header Cache-Control enviado ao visitante.
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                      <button className="ops-btn ghost sm" onClick={() => setDirectiveRows(directiveRows.filter((_, i) => i !== idx))} title="Remover">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  <button className="ops-btn outline sm" style={{ alignSelf: "flex-start" }} onClick={addDirectiveRow}>
                    <Plus size={11} /> Add action
                  </button>
                </div>
              </div>
            )}

            {responseAction === "cache_tags" && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Cache tags</div>
                <p className="ops-hint">
                  Add to an existing set of tags, override the current set of tags with new tags, or specify which tags to remove
                  from the current set of tags.
                </p>
                <div style={{ marginTop: 10 }}>
                  <ExecLabel>Source</ExecLabel>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
                    <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                      <input type="radio" checked={tagSource === "manual"} onChange={() => setTagSource("manual")} />
                      <span style={{ fontSize: 12, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Specify tags manually</span>
                    </label>
                    <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                      <input type="radio" checked={tagSource === "header"} onChange={() => setTagSource("header")} />
                      <span style={{ fontSize: 12, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Parse from response header</span>
                    </label>
                  </div>
                </div>
                {tagSource === "manual" ? (
                  <div className="ops-field" style={{ marginTop: 10 }}>
                    <ExecLabel>Tag(s)</ExecLabel>
                    <Input placeholder="Enter a tag (separado por vírgula)" value={tagValues} onChange={(e) => setTagValues(e.target.value)} />
                  </div>
                ) : (
                  <div style={{ display: "flex", gap: 12, marginTop: 10 }}>
                    <div className="ops-field" style={{ flex: 1 }}>
                      <ExecLabel>Header Name</ExecLabel>
                      <Input placeholder="header-name" value={tagHeaderName} onChange={(e) => setTagHeaderName(e.target.value)} />
                    </div>
                    <div className="ops-field" style={{ flex: "0 0 140px" }}>
                      <ExecLabel>Separator</ExecLabel>
                      <Input value={tagSeparator} onChange={(e) => setTagSeparator(e.target.value)} />
                    </div>
                    <div className="ops-field" style={{ flex: "0 0 140px" }}>
                      <ExecLabel>Limit (required)</ExecLabel>
                      <Input type="number" min={1} value={tagLimit} onChange={(e) => setTagLimit(e.target.value)} />
                    </div>
                  </div>
                )}
                <div style={{ marginTop: 14 }}>
                  <ExecLabel>Action</ExecLabel>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 6 }}>
                    <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                      <input type="radio" checked={tagAction === "add"} onChange={() => setTagAction("add")} />
                      <span style={{ fontSize: 12, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Add to existing tags</span>
                    </label>
                    <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                      <input type="radio" checked={tagAction === "remove"} onChange={() => setTagAction("remove")} />
                      <span style={{ fontSize: 12, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Remove from existing tags</span>
                    </label>
                    <label style={{ display: "flex", gap: 8, alignItems: "center", cursor: "pointer" }}>
                      <input type="radio" checked={tagAction === "set"} onChange={() => setTagAction("set")} />
                      <span style={{ fontSize: 12, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Override existing tags</span>
                    </label>
                  </div>
                </div>
              </div>
            )}

            {responseAction === "strip_headers" && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Strip headers</div>
                <p className="ops-hint">
                  Strip last-modified, Etag or Set-Cookie headers before Cloudflare evaluates these responses for caching.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 10 }}>
                  {stripRows.map((row, idx) => (
                    <div key={idx} style={{ display: "flex", gap: 12, alignItems: "flex-end" }}>
                      <div className="ops-field" style={{ flex: "0 0 180px" }}>
                        <ExecLabel>Action</ExecLabel>
                        <Select
                          value={row.action}
                          onValueChange={(v) => setStripRows(stripRows.map((r, i) => (i === idx ? { ...r, action: v as "strip" | "dont_strip" } : r)))}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="strip">Strip</SelectItem>
                            <SelectItem value="dont_strip">Don't strip</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="ops-field" style={{ flex: "0 0 220px" }}>
                        <ExecLabel>Header</ExecLabel>
                        <Select
                          value={row.header}
                          onValueChange={(v) =>
                            setStripRows(stripRows.map((r, i) => (i === idx ? { ...r, header: v as typeof r.header } : r)))
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Select…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="set_cookie">Set-Cookie header</SelectItem>
                            <SelectItem value="etag">ETag header</SelectItem>
                            <SelectItem value="last_modified">Last-Modified header</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <button className="ops-btn ghost sm" onClick={() => setStripRows(stripRows.filter((_, i) => i !== idx))} title="Remover">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  <button
                    className="ops-btn outline sm"
                    style={{ alignSelf: "flex-start" }}
                    onClick={() => setStripRows([...stripRows, { header: "set_cookie", action: "strip" }])}
                  >
                    <Plus size={11} /> Add action
                  </button>
                </div>
              </div>
            )}
          </div>

          {!editing && (
            <>
              <div style={{ height: 1, background: V2.border }} />
              <div className="ops-field" style={{ alignSelf: "flex-start", width: 220 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: V2.textPrimary, fontFamily: "var(--font-ui)", marginBottom: 6 }}>
                  Place at
                </div>
                <span className="ops-hint" style={{ display: "block", marginBottom: 4 }}>
                  Select order:
                </span>
                <Select value={placeAt} onValueChange={(v) => setPlaceAt(v as "first" | "last" | "custom")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="first">First</SelectItem>
                    <SelectItem value="last">Last</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
                {placeAt === "custom" && (
                  <div style={{ marginTop: 10 }}>
                    <span className="ops-hint" style={{ display: "block", marginBottom: 4 }}>
                      Select which rule this will fire after:
                    </span>
                    <Select value={placeAfterRuleId} onValueChange={setPlaceAfterRuleId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
                      <SelectContent>
                        {otherRules.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.description || r.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        <DialogFooter>
          <button className="ops-btn outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </button>
          <button className="ops-btn primary" onClick={handleSave} disabled={!canSubmit || saving}>
            {saving ? <Loader2 size={12} className="ops-spin" /> : <Check size={12} />}
            Salvar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Escape/unescape compartilhado por toda expressão montada aqui — string
// literal comum ("...") ou raw string (r"...", usada pela Cloudflare pra
// wildcard/regex, confirmado no preview real: `(field wildcard r"")`).
function escStr(s: string): string {
  return s.trim().replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}
function unescStr(s: string): string {
  return s.replace(/\\"/g, '"').replace(/\\\\/g, "\\");
}

// Espelha o "If incoming requests match…" nativo: converte o modo escolhido
// (wildcard/expressão/todas) numa única string de expressão, e faz o caminho
// inverso ao reabrir uma regra existente pra edição.
function parseMatchExpression(expr: string): { mode: "wildcard" | "expression" | "all"; wildcardUrl: string; expression: string } {
  const trimmed = expr.trim();
  if (trimmed === "true") return { mode: "all", wildcardUrl: "", expression: "" };
  const m = trimmed.match(/^\(?http\.request\.full_uri wildcard r?"((?:[^"\\]|\\.)*)"\)?$/);
  if (m) return { mode: "wildcard", wildcardUrl: unescStr(m[1]), expression: "" };
  return { mode: "expression", wildcardUrl: "", expression: expr };
}
function buildMatchExpression(mode: "wildcard" | "expression" | "all", wildcardUrl: string, expression: string): string {
  if (mode === "all") return "true";
  if (mode === "wildcard") return `(http.request.full_uri wildcard r"${escStr(wildcardUrl)}")`;
  return expression;
}

// ── Custom filter expression: builder por Field/Operator/Value + And/Or ──────
// Catálogo curado (não é o catálogo inteiro da Cloudflare, que passa de 60
// campos) — cobre os campos mais usados nas categorias já implementadas aqui,
// com os operadores por TIPO de campo (string livre, enum de valor fixo, ip
// com suporte a Lists, booleano) — espelhando o que aparece nos dropdowns
// nativos (Request Method só tem equals/does not equal/is in/is not in, sem
// "is in list"; IP Source Address tem também "is in list"/"is not in list").
type ExprFieldType = "string" | "enum" | "ip" | "bool";
const EXPR_FIELDS: Array<{ key: string; label: string; type: ExprFieldType }> = [
  { key: "http.request.full_uri", label: "URI Full", type: "string" },
  { key: "http.request.uri", label: "URI", type: "string" },
  { key: "http.request.uri.path", label: "URI Path", type: "string" },
  { key: "http.request.uri.query", label: "URI Query String", type: "string" },
  { key: "http.host", label: "Hostname", type: "string" },
  { key: "http.request.method", label: "Request Method", type: "enum" },
  { key: "http.request.version", label: "HTTP Version", type: "enum" },
  { key: "http.user_agent", label: "User Agent", type: "string" },
  { key: "http.referer", label: "Referer", type: "string" },
  { key: "http.cookie", label: "Cookie", type: "string" },
  { key: "http.x_forwarded_for", label: "X-Forwarded-For", type: "string" },
  { key: "ip.src", label: "IP Source Address", type: "ip" },
  { key: "ip.src.country", label: "Country", type: "enum" },
  { key: "ip.src.continent", label: "Continent", type: "enum" },
  { key: "ip.src.asnum", label: "AS Num", type: "ip" },
  // Nomes antigos dos mesmos campos — continuam aceitos em regras existentes
  { key: "ip.geoip.country", label: "Country (ip.geoip)", type: "enum" },
  { key: "ip.geoip.continent", label: "Continent (ip.geoip)", type: "enum" },
  { key: "ip.geoip.is_in_european_union", label: "European Union", type: "bool" },
  { key: "ssl", label: "SSL/HTTPS", type: "bool" },
  { key: "cf.tls_client_auth.cert_verified", label: "Client Certificate Verified", type: "bool" },
];
// Exemplo de placeholder do campo Value — varia por field (igual ao nativo),
// não é um texto fixo pra todos os campos de texto.
const EXPR_VALUE_EXAMPLE: Record<string, string> = {
  "http.request.full_uri": "e.g. https://www.exemplo.com/files/relatorio.pdf",
  "http.request.uri": "e.g. /files/relatorio.pdf?ref=1",
  "http.request.uri.path": "e.g. /files/relatorio.pdf",
  "http.request.uri.query": "e.g. ref=1&lang=pt",
  "http.host": "e.g. www.exemplo.com",
  "http.user_agent": "e.g. Mozilla/5.0 (Windows NT 10.0; Win64; x64)",
  "http.referer": "e.g. https://www.google.com/",
  "http.cookie": "e.g. session=abc123",
  "http.x_forwarded_for": "e.g. 203.0.113.1",
  "ip.src.asnum": "e.g. 13335",
};
type ExprValueKind = "text" | "list" | "listref" | "bool";
type ExprOperator = { key: string; label: string; valueKind: ExprValueKind; build: (field: string, value: string) => string };
// Vírgula ou quebra de linha separam múltiplos valores em "is in"/"is not in".
function splitListValues(v: string): string[] {
  return v
    .split(/[,\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}
const STRING_OPERATORS: ExprOperator[] = [
  { key: "wildcard", label: "wildcard", valueKind: "text", build: (f, v) => `${f} wildcard r"${escStr(v)}"` },
  { key: "strict_wildcard", label: "strict wildcard", valueKind: "text", build: (f, v) => `${f} strict wildcard r"${escStr(v)}"` },
  { key: "eq", label: "equals", valueKind: "text", build: (f, v) => `${f} eq "${escStr(v)}"` },
  { key: "ne", label: "does not equal", valueKind: "text", build: (f, v) => `${f} ne "${escStr(v)}"` },
  { key: "contains", label: "contains", valueKind: "text", build: (f, v) => `${f} contains "${escStr(v)}"` },
  { key: "not_contains", label: "does not contain", valueKind: "text", build: (f, v) => `not (${f} contains "${escStr(v)}")` },
  { key: "matches", label: "matches regex", valueKind: "text", build: (f, v) => `${f} matches r"${escStr(v)}"` },
  { key: "not_matches", label: "does not match", valueKind: "text", build: (f, v) => `not (${f} matches r"${escStr(v)}")` },
  { key: "starts_with", label: "starts with", valueKind: "text", build: (f, v) => `starts_with(${f}, "${escStr(v)}")` },
  { key: "not_starts_with", label: "does not start with", valueKind: "text", build: (f, v) => `not starts_with(${f}, "${escStr(v)}")` },
  { key: "ends_with", label: "ends with", valueKind: "text", build: (f, v) => `ends_with(${f}, "${escStr(v)}")` },
  { key: "not_ends_with", label: "does not end with", valueKind: "text", build: (f, v) => `not ends_with(${f}, "${escStr(v)}")` },
];
const ENUM_OPERATORS: ExprOperator[] = [
  { key: "eq", label: "equals", valueKind: "text", build: (f, v) => `${f} eq "${escStr(v)}"` },
  { key: "ne", label: "does not equal", valueKind: "text", build: (f, v) => `${f} ne "${escStr(v)}"` },
  {
    key: "in",
    label: "is in",
    valueKind: "list",
    build: (f, v) => `${f} in {${splitListValues(v).map((x) => `"${escStr(x)}"`).join(" ")}}`,
  },
  {
    key: "not_in",
    label: "is not in",
    valueKind: "list",
    build: (f, v) => `not (${f} in {${splitListValues(v).map((x) => `"${escStr(x)}"`).join(" ")}})`,
  },
];
const IP_OPERATORS: ExprOperator[] = [
  { key: "eq", label: "equals", valueKind: "text", build: (f, v) => `${f} eq ${v.trim()}` },
  { key: "ne", label: "does not equal", valueKind: "text", build: (f, v) => `${f} ne ${v.trim()}` },
  { key: "in", label: "is in", valueKind: "list", build: (f, v) => `${f} in {${splitListValues(v).join(" ")}}` },
  { key: "not_in", label: "is not in", valueKind: "list", build: (f, v) => `not (${f} in {${splitListValues(v).join(" ")}})` },
  { key: "in_list", label: "is in list", valueKind: "listref", build: (f, v) => `${f} in $${v.trim()}` },
  { key: "not_in_list", label: "is not in list", valueKind: "listref", build: (f, v) => `not (${f} in $${v.trim()})` },
];
// Campos booleanos no nativo (SSL/HTTPS, Client Certificate Verified, European
// Union) não têm dropdown de operador — só "equals" (fixo) + um toggle.
const BOOL_OPERATORS: ExprOperator[] = [
  { key: "eq", label: "equals", valueKind: "bool", build: (f, v) => `${f} eq ${v === "true" ? "true" : "false"}` },
];
// Campos enum com catálogo de valor fechado — vira dropdown de Value em vez
// de texto livre, igual ao nativo (Request Method / HTTP Version).
const ENUM_VALUE_OPTIONS: Record<string, string[]> = {
  "http.request.method": ["GET", "POST", "PURGE", "PUT", "HEAD", "OPTIONS", "DELETE", "PATCH"],
  "http.request.version": ["HTTP/1.0", "HTTP/1.1", "HTTP/1.2", "HTTP/2", "HTTP/3", "SPDY/3.1"],
};
function getExprOperators(fieldKey: string): ExprOperator[] {
  const field = EXPR_FIELDS.find((f) => f.key === fieldKey);
  if (field?.type === "ip") return IP_OPERATORS;
  if (field?.type === "enum") return ENUM_OPERATORS;
  if (field?.type === "bool") return BOOL_OPERATORS;
  return STRING_OPERATORS;
}
type ExprCondition = { field: string; operator: string; value: string };
function compileCondition(c: ExprCondition): string {
  const ops = getExprOperators(c.field);
  const op = ops.find((o) => o.key === c.operator) ?? ops[0];
  return op.build(c.field, c.value);
}
function compileExpression(conditions: ExprCondition[], combinators: Array<"and" | "or">): string {
  if (conditions.length === 0) return "";
  // Envolve em parênteses mesmo com 1 condição só — é assim que o builder
  // visual nativo da Cloudflare sempre gera, e sem isso ele rejeita o
  // round-trip ao clicar "Use expression builder" (mesmo a expressão sendo
  // válida). parseSingleCondition já tolera essa camada extra de parêntese.
  if (conditions.length === 1) return `(${compileCondition(conditions[0])})`;
  let result = compileCondition(conditions[0]);
  for (let i = 1; i < conditions.length; i++) {
    result = `(${result} ${combinators[i - 1]} ${compileCondition(conditions[i])})`;
  }
  return result;
}
// Só reconhece expressões de UMA condição só, num campo/operador conhecido —
// qualquer coisa mais complexa (múltiplas condições, campo fora do catálogo,
// digitada à mão) cai pra edição em modo texto livre, sem risco de montar
// errado.
function parseSingleCondition(expr: string): ExprCondition | null {
  const trimmed = expr
    .trim()
    .replace(/^\((.*)\)$/, "$1")
    .trim();
  let m = trimmed.match(/^([\w.]+) (wildcard|strict wildcard|matches) r"((?:[^"\\]|\\.)*)"$/);
  if (m) {
    const opKey = m[2] === "strict wildcard" ? "strict_wildcard" : m[2];
    if (EXPR_FIELDS.some((f) => f.key === m![1])) return { field: m[1], operator: opKey, value: unescStr(m[3]) };
  }
  m = trimmed.match(/^not \(([\w.]+) matches r"((?:[^"\\]|\\.)*)"\)$/);
  if (m && EXPR_FIELDS.some((f) => f.key === m![1])) return { field: m[1], operator: "not_matches", value: unescStr(m[2]) };
  m = trimmed.match(/^([\w.]+) (eq|ne|contains) "((?:[^"\\]|\\.)*)"$/);
  if (m && EXPR_FIELDS.some((f) => f.key === m![1])) return { field: m[1], operator: m[2], value: unescStr(m[3]) };
  m = trimmed.match(/^not \(?([\w.]+) contains "((?:[^"\\]|\\.)*)"\)?$/);
  if (m && EXPR_FIELDS.some((f) => f.key === m![1])) return { field: m[1], operator: "not_contains", value: unescStr(m[2]) };
  m = trimmed.match(/^not \(?([\w.]+) matches r"((?:[^"\\]|\\.)*)"\)?$/);
  if (m && EXPR_FIELDS.some((f) => f.key === m![1])) return { field: m[1], operator: "not_matches", value: unescStr(m[2]) };
  // starts_with(campo, "x") / ends_with(...), com ou sem "not" na frente
  m = trimmed.match(/^(not\s+)?\(?(starts_with|ends_with)\(([\w.]+),\s*"((?:[^"\\]|\\.)*)"\)\)?$/);
  if (m && EXPR_FIELDS.some((f) => f.key === m![3]))
    return { field: m[3], operator: `${m[1] ? "not_" : ""}${m[2]}`, value: unescStr(m[4]) };
  m = trimmed.match(/^(ip\.src|ip\.src\.asnum) (eq|ne) ([^\s"()]+)$/);
  if (m) return { field: m[1], operator: m[2], value: m[3].trim() };
  // campo in {"a" "b"} / not (campo in {...}) — lista de valores
  m = trimmed.match(/^(not\s*\(\s*)?([\w.]+) in \{([^}]*)\}\s*(\))?$/);
  if (m && !!m[1] === !!m[4] && EXPR_FIELDS.some((f) => f.key === m![2])) {
    const vals = [...m[3].matchAll(/"((?:[^"\\]|\\.)*)"|(\S+)/g)].map((x) => (x[1] !== undefined ? unescStr(x[1]) : x[2]));
    return { field: m[2], operator: m[1] ? "not_in" : "in", value: vals.join(", ") };
  }
  // campo in $lista / not (campo in $lista)
  m = trimmed.match(/^(not\s*\(\s*)?([\w.]+) in \$(\w+)\s*(\))?$/);
  if (m && !!m[1] === !!m[4] && EXPR_FIELDS.some((f) => f.key === m![2] && f.type === "ip"))
    return { field: m[2], operator: m[1] ? "not_in_list" : "in_list", value: m[3] };
  // booleanos: "ssl", "not ssl", "ssl eq true"
  m = trimmed.match(/^(not\s+)?([\w.]+)(?: eq (true|false))?$/);
  if (m && EXPR_FIELDS.some((f) => f.key === m![2] && f.type === "bool")) {
    const v = (m[3] ?? "true") === "true";
    return { field: m[2], operator: "eq", value: String(m[1] ? !v : v) };
  }
  return null;
}

// Separa "cond1 and cond2 or cond3" nos pedaços de nível 0 (sem entrar em
// parênteses nem em string entre aspas) + a lista de combinadores entre eles.
function splitTopLevelBoolean(expr: string): { parts: string[]; combinators: Array<"and" | "or"> } {
  const parts: string[] = [];
  const combinators: Array<"and" | "or"> = [];
  let depth = 0;
  let inString = false;
  let current = "";
  let i = 0;
  while (i < expr.length) {
    const ch = expr[i];
    if (inString) {
      current += ch;
      if (ch === "\\") {
        current += expr[i + 1] ?? "";
        i += 2;
        continue;
      }
      if (ch === '"') inString = false;
      i++;
      continue;
    }
    if (ch === '"') {
      inString = true;
      current += ch;
      i++;
      continue;
    }
    if (ch === "(") {
      depth++;
      current += ch;
      i++;
      continue;
    }
    if (ch === ")") {
      depth--;
      current += ch;
      i++;
      continue;
    }
    if (depth === 0) {
      const rest = expr.slice(i);
      const andMatch = rest.match(/^\s+and\s+/i);
      const orMatch = rest.match(/^\s+or\s+/i);
      if (andMatch) {
        parts.push(current.trim());
        combinators.push("and");
        current = "";
        i += andMatch[0].length;
        continue;
      }
      if (orMatch) {
        parts.push(current.trim());
        combinators.push("or");
        current = "";
        i += orMatch[0].length;
        continue;
      }
    }
    current += ch;
    i++;
  }
  parts.push(current.trim());
  return { parts, combinators };
}
// Reconhece múltiplas condições combinadas com and/or — cada pedaço no nível
// 0 (com no máximo uma camada de parênteses ao redor) precisa bater com
// parseSingleCondition; se qualquer pedaço não for reconhecido, devolve null
// e a edição cai pro modo texto livre em vez de arriscar montar errado.
// true quando o primeiro "(" fecha só no último caractere (envolve tudo)
function wrapsWhole(e: string): boolean {
  if (!e.startsWith("(") || !e.endsWith(")")) return false;
  let depth = 0;
  let inString = false;
  for (let i = 0; i < e.length; i++) {
    const ch = e[i];
    if (inString) {
      if (ch === "\\") i++;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === "(") depth++;
    else if (ch === ")") {
      depth--;
      if (depth === 0 && i < e.length - 1) return false;
    }
  }
  return depth === 0;
}
function unwrapParens(e: string): string {
  let out = e.trim();
  while (wrapsWhole(out)) out = out.slice(1, -1).trim();
  return out;
}

function parseMultiCondition(expr: string): { conditions: ExprCondition[]; combinators: Array<"and" | "or"> } | null {
  const { parts, combinators } = splitTopLevelBoolean(unwrapParens(expr));
  if (parts.length === 0 || parts.some((p) => !p)) return null;
  const conditions: ExprCondition[] = [];
  const outCombinators: Array<"and" | "or"> = [];
  for (let k = 0; k < parts.length; k++) {
    const part = parts[k];
    if (k > 0) outCombinators.push(combinators[k - 1]);
    const cond = parseSingleCondition(part);
    if (cond) {
      conditions.push(cond);
      continue;
    }
    // Grupo entre parênteses com várias condições: o builder monta tudo da
    // esquerda pra direita, então só dá pra "achatar" sem mudar o sentido se o
    // grupo for o primeiro pedaço ou se todos os combinadores forem iguais.
    if (!wrapsWhole(part)) return null;
    const inner = parseMultiCondition(part);
    if (!inner) return null;
    const allSame = new Set([...combinators, ...inner.combinators]).size <= 1;
    if (k !== 0 && !allSame) return null;
    conditions.push(...inner.conditions);
    outCombinators.push(...inner.combinators);
  }
  return { conditions, combinators: outCombinators };
}

// URL Rewrite — espelha o nativo: "Preserve" (não manda a chave) ou
// "Rewrite to…" com sub-modo Static (valor literal) ou Dynamic (expressão
// da Rulesets language, ex.: usando wildcard_replace() manualmente).
type UriRewritePart = { mode: "preserve" | "rewrite"; valueMode: "static" | "dynamic"; value: string };
function parseUriRewritePart(part: any): UriRewritePart {
  if (!part) return { mode: "preserve", valueMode: "static", value: "" };
  if (typeof part.value === "string") return { mode: "rewrite", valueMode: "static", value: part.value };
  if (typeof part.expression === "string") return { mode: "rewrite", valueMode: "dynamic", value: part.expression };
  return { mode: "preserve", valueMode: "static", value: "" };
}
function buildUriRewritePart(part: UriRewritePart, staticPrefix: string): Record<string, unknown> | null {
  if (part.mode === "preserve") return null;
  if (part.valueMode === "dynamic") {
    if (!part.value.trim()) return null;
    return { expression: part.value.trim() };
  }
  // Modo estático: em branco é uma configuração válida (não "não preenchido")
  // — vira só o prefixo, ou seja, raiz ("/") pra Path e string vazia pra Query.
  return { value: `${staticPrefix}${part.value.trim()}` };
}

// URL Rewrite quando "Se a requisição bater com…" = Padrão wildcard: nativo
// usa "Target path/query" + "Rewrite to" (com ${1}/${2}), via wildcard_replace().
function parseUriRewriteWildcard(part: any): { target: string; rewrite: string } {
  if (!part) return { target: "", rewrite: "" };
  if (typeof part.value === "string") return { target: "", rewrite: part.value };
  if (typeof part.expression === "string") {
    const m = part.expression.match(/^wildcard_replace\([^,]+,\s*r?"((?:[^"\\]|\\.)*)",\s*r?"((?:[^"\\]|\\.)*)"\)$/);
    if (m) return { target: unescStr(m[1]), rewrite: unescStr(m[2]) };
  }
  return { target: "", rewrite: "" };
}
function buildUriRewriteWildcardPart(field: string, target: string, rewrite: string): Record<string, unknown> | null {
  if (!target.trim() && !rewrite.trim()) return null;
  if (target.trim()) {
    return { expression: `wildcard_replace(${field}, r"${escStr(target)}", r"${escStr(rewrite)}")` };
  }
  return { value: rewrite.trim() };
}

// Configuration Rules e Cache Rules têm UI própria (não os campos fixos por
// categoria daqui) — ver ConfigurationRuleDialog/CacheRuleDialog mais abaixo.
type OverviewDialogCategory = Exclude<GenericCrudCategory, "configuration" | "cache" | "cache_response">;

// Header Transform — confirmado: Request só tem Set static/Set dynamic/Remove
// (operation "set"/"remove"); Response tem também Add static/Add dynamic
// (operation "add", mantém headers já existentes com o mesmo nome em vez de
// sobrescrever).
type HeaderTransformOp = "add_static" | "add_dynamic" | "set_static" | "set_dynamic" | "remove";
const OVERVIEW_CATEGORY_META: Record<OverviewDialogCategory, { title: string; action: string }> = {
  url_rewrite: { title: "URL Rewrite Rule", action: "rewrite" },
  origin: { title: "Origin Rule", action: "route" },
  request_header_transform: { title: "Request Header Transform Rule", action: "rewrite" },
  response_header_transform: { title: "Response Header Transform Rule", action: "rewrite" },
  custom_error: { title: "Custom Error Rule", action: "serve_error" },
};

function OverviewRuleDialog({
  open,
  onOpenChange,
  zoneId,
  categoryKey,
  rulesetId,
  existingRules,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  zoneId: string;
  categoryKey: OverviewDialogCategory;
  rulesetId: string | null;
  existingRules?: OverviewRule[];
  editing?: OverviewRule | null;
  onSaved: () => void;
}) {
  const doCreate = useServerFn(createOverviewRule);
  const doUpdate = useServerFn(updateOverviewRule);
  const [description, setDescription] = React.useState("");
  // Como a requisição precisa bater — espelha o "If incoming requests
  // match…" nativo: padrão wildcard (compila pra `wildcard`), expressão
  // customizada (mesma sintaxe de Custom Rules) ou todas as requisições.
  const [matchMode, setMatchMode] = React.useState<"wildcard" | "expression" | "all">("expression");
  const [wildcardUrl, setWildcardUrl] = React.useState("");
  const [expression, setExpression] = React.useState("");
  // "Expressão customizada" por padrão usa o builder (Field/Operator/Value +
  // And/Or, igual ao nativo); "Editar expressão" cai pro texto livre.
  const [exprMode, setExprMode] = React.useState<"builder" | "raw">("builder");
  const [conditions, setConditions] = React.useState<ExprCondition[]>([{ field: EXPR_FIELDS[0].key, operator: "wildcard", value: "" }]);
  const [combinators, setCombinators] = React.useState<Array<"and" | "or">>([]);
  // "Place at" — First/Last/Custom (Custom = "fire after" outra rule já existente).
  const [placeAt, setPlaceAt] = React.useState<"first" | "last" | "custom">("last");
  const [placeAfterRuleId, setPlaceAfterRuleId] = React.useState("");
  const otherRules = (existingRules ?? []).filter((r) => r.id !== editing?.id);
  // url_rewrite — Preserve ou Rewrite to… (Static = valor literal, Dynamic =
  // expressão da Rulesets language), igual ao "Then… Set Rewrite parameters" nativo.
  const [pathMode, setPathMode] = React.useState<"preserve" | "rewrite">("preserve");
  const [pathValueMode, setPathValueMode] = React.useState<"static" | "dynamic">("static");
  const [pathValue, setPathValue] = React.useState("");
  const [queryMode, setQueryMode] = React.useState<"preserve" | "rewrite">("preserve");
  const [queryValueMode, setQueryValueMode] = React.useState<"static" | "dynamic">("static");
  const [queryValue, setQueryValue] = React.useState("");
  // url_rewrite — quando o match é "Padrão wildcard": "Target path/query" +
  // "Rewrite to" (com ${1}/${2}), igual ao nativo nesse modo específico.
  const [pathTarget, setPathTarget] = React.useState("");
  const [pathRewrite, setPathRewrite] = React.useState("");
  const [queryTarget, setQueryTarget] = React.useState("");
  const [queryRewrite, setQueryRewrite] = React.useState("");
  // origin — 4 seções Preserve/Rewrite-to (DNS Record usa "Override to…"),
  // igual ao "Then… Set origin parameters" nativo.
  const [hostHeaderMode, setHostHeaderMode] = React.useState<"preserve" | "rewrite">("preserve");
  const [hostHeaderValue, setHostHeaderValue] = React.useState("");
  const [sniMode, setSniMode] = React.useState<"preserve" | "rewrite">("preserve");
  const [sniValue, setSniValue] = React.useState("");
  const [dnsRecordMode, setDnsRecordMode] = React.useState<"preserve" | "rewrite">("preserve");
  const [dnsRecordValue, setDnsRecordValue] = React.useState("");
  const [portMode, setPortMode] = React.useState<"preserve" | "rewrite">("preserve");
  const [portValue, setPortValue] = React.useState("");
  // request/response header transform — múltiplos headers (até 30, igual ao
  // nativo), cada um Set static/Set dynamic/Remove.
  const [headerRows, setHeaderRows] = React.useState<Array<{ name: string; op: HeaderTransformOp; value: string }>>([]);
  // custom error — "Response type" (Custom error asset não é suportado aqui,
  // já que exige upload de asset via API separada da Cloudflare) + status
  // code opcional + conteúdo por tipo.
  const [contentType, setContentType] = React.useState<"application/json" | "text/html" | "text/plain" | "application/xml" | "asset">(
    "text/html",
  );
  const [statusCode, setStatusCode] = React.useState("");
  const [content, setContent] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const meta = OVERVIEW_CATEGORY_META[categoryKey];

  React.useEffect(() => {
    if (!open) return;
    const ap = (editing?.action_parameters as any) ?? {};
    setDescription(editing?.description ?? "");
    const parsedMatchRaw = parseMatchExpression(editing?.expression ?? "");
    // Fora de url_rewrite não existe "Padrão wildcard" na UI — se uma regra
    // antiga tiver esse formato mesmo assim, reconstrói como texto puro em
    // "Expressão customizada" em vez de esconder o dado.
    const parsedMatch =
      parsedMatchRaw.mode === "wildcard" && categoryKey !== "url_rewrite"
        ? { mode: "expression" as const, wildcardUrl: "", expression: buildMatchExpression("wildcard", parsedMatchRaw.wildcardUrl, "") }
        : parsedMatchRaw;
    setMatchMode(editing ? parsedMatch.mode : "expression");
    setWildcardUrl(parsedMatch.wildcardUrl);
    setExpression(parsedMatch.expression);
    if (parsedMatch.mode === "expression" && parsedMatch.expression) {
      const parsedMulti = parseMultiCondition(parsedMatch.expression);
      if (parsedMulti) {
        setConditions(parsedMulti.conditions);
        setCombinators(parsedMulti.combinators);
        setExprMode("builder");
      } else {
        setExprMode("raw");
      }
    } else {
      setConditions([{ field: EXPR_FIELDS[0].key, operator: "wildcard", value: "" }]);
      setCombinators([]);
      setExprMode("builder");
    }
    setPlaceAt("last");
    const path = parseUriRewritePart(ap.uri?.path);
    setPathMode(path.mode);
    setPathValueMode(path.valueMode);
    setPathValue(path.valueMode === "static" ? path.value.replace(/^\//, "") : path.value);
    const query = parseUriRewritePart(ap.uri?.query);
    setQueryMode(query.mode);
    setQueryValueMode(query.valueMode);
    setQueryValue(query.value);
    const pathW = parseUriRewriteWildcard(ap.uri?.path);
    setPathTarget(pathW.target);
    setPathRewrite(pathW.rewrite);
    const queryW = parseUriRewriteWildcard(ap.uri?.query);
    setQueryTarget(queryW.target);
    setQueryRewrite(queryW.rewrite);
    setHostHeaderMode(ap.host_header ? "rewrite" : "preserve");
    setHostHeaderValue(ap.host_header ?? "");
    setSniMode(ap.sni?.value ? "rewrite" : "preserve");
    setSniValue(ap.sni?.value ?? "");
    setDnsRecordMode(ap.origin?.host ? "rewrite" : "preserve");
    setDnsRecordValue(ap.origin?.host ?? "");
    setPortMode(ap.origin?.port != null ? "rewrite" : "preserve");
    setPortValue(ap.origin?.port != null ? String(ap.origin.port) : "");
    const headers = ap.headers ?? {};
    setHeaderRows(
      Object.entries(headers).map(([name, h]: [string, any]) => {
        const isDynamic = typeof h?.expression === "string";
        const op: HeaderTransformOp =
          h?.operation === "remove" ? "remove" : h?.operation === "add" ? (isDynamic ? "add_dynamic" : "add_static") : isDynamic ? "set_dynamic" : "set_static";
        return { name, op, value: h?.operation === "remove" ? "" : (h?.expression ?? h?.value ?? "") };
      }),
    );
    setStatusCode(ap.status_code != null ? String(ap.status_code) : "");
    setContentType(ap.content_type ?? "text/html");
    setContent(ap.content ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing, categoryKey]);

  // Builder escreve na mesma `expression` que vai pro backend — troca só
  // quando em modo builder, pra não sobrescrever o que o usuário digitou
  // direto no modo texto livre.
  React.useEffect(() => {
    if (exprMode === "builder") setExpression(compileExpression(conditions, combinators));
  }, [conditions, combinators, exprMode]);

  function updateCondition(idx: number, patch: Partial<ExprCondition>) {
    setConditions(conditions.map((c, i) => (i === idx ? { ...c, ...patch } : c)));
  }
  function updateFieldForCondition(idx: number, fieldKey: string) {
    const defaultOp = getExprOperators(fieldKey)[0];
    updateCondition(idx, { field: fieldKey, operator: defaultOp.key, value: defaultOp.valueKind === "bool" ? "true" : "" });
  }
  function updateOperatorForCondition(idx: number, opKey: string, ops: ExprOperator[]) {
    const op = ops.find((o) => o.key === opKey) ?? ops[0];
    updateCondition(idx, { operator: opKey, value: op.valueKind === "bool" ? "true" : "" });
  }
  function addCondition(combinator: "and" | "or") {
    setConditions([...conditions, { field: EXPR_FIELDS[0].key, operator: "wildcard", value: "" }]);
    setCombinators([...combinators, combinator]);
  }
  function removeCondition(idx: number) {
    if (conditions.length <= 1) return;
    setConditions(conditions.filter((_, i) => i !== idx));
    setCombinators(combinators.filter((_, i) => i !== (idx === 0 ? 0 : idx - 1)));
  }
  // Volta do modo texto livre pro builder — tenta reconhecer o que foi digitado
  // (mesma lógica usada ao abrir o diálogo pra editar); se não reconhecer, cai
  // pra uma condição em branco em vez de arriscar montar algo errado.
  function switchToExpressionBuilder() {
    const parsedMulti = parseMultiCondition(expression);
    // Expressão vazia: começa o builder do zero
    if (!expression.trim()) {
      setConditions([{ field: EXPR_FIELDS[0].key, operator: "wildcard", value: "" }]);
      setCombinators([]);
      setExprMode("builder");
      return;
    }
    // Se o builder não reconhece a expressão, ficar no modo texto em vez de
    // trocar e apagar o que já estava escrito
    if (!parsedMulti) {
      toast.warning("O builder não reconhece esta expressão. Continue editando no modo texto para não perdê-la.");
      return;
    }
    setConditions(parsedMulti.conditions);
    setCombinators(parsedMulti.combinators);
    setExprMode("builder");
  }

  function addHeaderRow() {
    setHeaderRows([...headerRows, { name: "", op: "set_static", value: "" }]);
  }
  function updateHeaderRow(idx: number, patch: Partial<{ name: string; op: HeaderTransformOp; value: string }>) {
    setHeaderRows(headerRows.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }
  function removeHeaderRow(idx: number) {
    setHeaderRows(headerRows.filter((_, i) => i !== idx));
  }

  function buildActionParameters(): Record<string, unknown> | null {
    if (categoryKey === "url_rewrite") {
      const uri: Record<string, unknown> = {};
      if (matchMode === "wildcard") {
        // Padrão wildcard: "Target path/query" + "Rewrite to" com ${1}/${2}.
        const path = buildUriRewriteWildcardPart("http.request.uri.path", pathTarget, pathRewrite);
        const query = buildUriRewriteWildcardPart("http.request.uri.query", queryTarget, queryRewrite);
        if (path) uri.path = path;
        if (query) uri.query = query;
      } else {
        const path = buildUriRewritePart({ mode: pathMode, valueMode: pathValueMode, value: pathValue }, "/");
        const query = buildUriRewritePart({ mode: queryMode, valueMode: queryValueMode, value: queryValue }, "");
        if (path) uri.path = path;
        if (query) uri.query = query;
        if (pathMode === "rewrite" && !path) return null;
        if (queryMode === "rewrite" && !query) return null;
      }
      return Object.keys(uri).length > 0 ? { uri } : null;
    }
    if (categoryKey === "origin") {
      const params: Record<string, unknown> = {};
      if (hostHeaderMode === "rewrite" && hostHeaderValue.trim()) params.host_header = hostHeaderValue.trim();
      if (sniMode === "rewrite" && sniValue.trim()) params.sni = { value: sniValue.trim() };
      const origin: Record<string, unknown> = {};
      if (dnsRecordMode === "rewrite" && dnsRecordValue.trim()) origin.host = dnsRecordValue.trim();
      if (portMode === "rewrite" && portValue.trim()) origin.port = Number(portValue);
      if (Object.keys(origin).length > 0) params.origin = origin;
      if (hostHeaderMode === "rewrite" && !hostHeaderValue.trim()) return null;
      if (sniMode === "rewrite" && !sniValue.trim()) return null;
      if (dnsRecordMode === "rewrite" && !dnsRecordValue.trim()) return null;
      if (portMode === "rewrite" && !portValue.trim()) return null;
      return Object.keys(params).length > 0 ? params : null;
    }
    if (categoryKey === "request_header_transform" || categoryKey === "response_header_transform") {
      const headers: Record<string, unknown> = {};
      for (const row of headerRows) {
        if (!row.name.trim()) continue;
        if (row.op === "remove") {
          headers[row.name.trim()] = { operation: "remove" };
        } else {
          if (!row.value.trim()) continue;
          const operation = row.op.startsWith("add") ? "add" : "set";
          if (row.op.endsWith("_dynamic")) headers[row.name.trim()] = { operation, expression: row.value.trim() };
          else headers[row.name.trim()] = { operation, value: row.value };
        }
      }
      return Object.keys(headers).length > 0 ? { headers } : null;
    }
    if (categoryKey === "custom_error") {
      if (contentType === "asset" || !content.trim()) return null;
      return {
        content,
        content_type: contentType,
        ...(statusCode.trim() ? { status_code: Number(statusCode) } : {}),
      };
    }
    return null;
  }

  const actionParameters = buildActionParameters();
  const finalExpression = buildMatchExpression(matchMode, wildcardUrl, expression);
  const builderConditionsFilled = exprMode === "raw" || conditions.every((c) => c.value.trim().length > 0);
  const matchFilled =
    matchMode === "all" || (matchMode === "wildcard" ? wildcardUrl.trim() : !!expression.trim() && builderConditionsFilled);
  const canSubmit = !!(description.trim() && matchFilled && actionParameters);

  // Explica por que o botão Salvar está bloqueado — sem isso o usuário só via
  // o botão desabilitado, sem nenhuma pista do que faltava preencher.
  function getBlockedReason(): string | null {
    if (!description.trim()) return "Informe uma descrição pra regra.";
    if (!matchFilled) {
      if (matchMode === "wildcard") return 'Informe a URL do padrão wildcard em "Se a requisição bater com…".';
      if (!expression.trim()) return "Monte a expressão de match (adicione ao menos uma condição) ou selecione uma opção de match.";
      return "Preencha o valor de todas as condições da expressão de match.";
    }
    if (!actionParameters) {
      if (categoryKey === "url_rewrite") return 'Configure "Rewrite to" em Path e/ou Query String — pelo menos um dos dois.';
      if (categoryKey === "origin") return 'Configure "Rewrite to"/"Override to" em pelo menos um destino: Host Header, SNI, DNS Record ou Destination Port.';
      if (categoryKey === "request_header_transform" || categoryKey === "response_header_transform")
        return "Adicione ao menos um header com nome e valor preenchidos.";
      if (categoryKey === "custom_error") return "Selecione um tipo de resposta (JSON/HTML/Text/XML) e preencha o conteúdo.";
      return "Preencha os campos da ação.";
    }
    return null;
  }
  const blockedReason = getBlockedReason();

  async function handleSave() {
    if (!actionParameters) return;
    setSaving(true);
    try {
      if (editing) {
        if (!rulesetId) {
          toast.error("Ruleset ID não encontrado. Atualize a lista e tente de novo.");
          return;
        }
        const res: any = await doUpdate({
          data: {
            zoneId,
            category: categoryKey,
            rulesetId,
            ruleId: editing.id,
            description,
            expression: finalExpression,
            action: meta.action,
            action_parameters: actionParameters,
            enabled: editing.enabled,
          },
        });
        if (res.ok) {
          toast.success(`${meta.title} atualizada.`);
          onSaved();
        } else toast.error(res.error);
      } else {
        const res: any = await doCreate({
          data: {
            zoneId,
            category: categoryKey,
            description,
            expression: finalExpression,
            action: meta.action,
            action_parameters: actionParameters,
            ...(placeAt === "first"
              ? { position: { index: 0 } }
              : placeAt === "custom" && placeAfterRuleId
                ? { position: { after: placeAfterRuleId } }
                : {}),
          },
        });
        if (res.ok) {
          toast.success(`${meta.title} criada.`);
          onSaved();
        } else toast.error(res.error);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl" style={{ maxHeight: "85vh", overflowY: "auto" }}>
        <DialogHeader>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, paddingRight: 24 }}>
            <DialogTitle style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {editing ? <Pencil size={16} color={T.accent} /> : <Plus size={16} color={T.accent} />}
              {editing ? `Editar ${meta.title}` : `Criar ${meta.title}`}
            </DialogTitle>
            <DocsLinkButton category={categoryKey} />
          </div>
        </DialogHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 22, padding: "8px 0" }}>
          <div className="ops-field">
            <ExecLabel>Nome da regra</ExecLabel>
            <Input placeholder="Ex.: Meu app — regra" value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="ops-field">
            <ExecLabel>Se a requisição bater com…</ExecLabel>
            <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 4 }}>
              {categoryKey === "url_rewrite" && (
                <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
                  <input type="radio" checked={matchMode === "wildcard"} onChange={() => setMatchMode("wildcard")} style={{ marginTop: 3 }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Padrão wildcard</div>
                    <div className="ops-hint">Só aplica a regra em requisições que baterem com o padrão.</div>
                  </div>
                </label>
              )}
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
                <input type="radio" checked={matchMode === "expression"} onChange={() => {
                    // Vindo do "Padrão wildcard": leva a URL para o builder em vez de abrir vazio
                    if (matchMode === "wildcard" && wildcardUrl.trim() && conditions.every((c) => !c.value.trim())) {
                      setConditions([{ field: "http.request.full_uri", operator: "wildcard", value: wildcardUrl.trim() }]);
                      setCombinators([]);
                      setExprMode("builder");
                    }
                    setMatchMode("expression");
                  }} style={{ marginTop: 3 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Expressão customizada</div>
                  <div className="ops-hint">Só aplica a regra em requisições que baterem com a expressão.</div>
                </div>
              </label>
              <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
                <input type="radio" checked={matchMode === "all"} onChange={() => setMatchMode("all")} style={{ marginTop: 3 }} />
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Todas as requisições</div>
                  <div className="ops-hint">Aplica a regra em toda requisição, sem filtro.</div>
                </div>
              </label>
            </div>
          </div>
          {matchMode === "wildcard" && categoryKey === "url_rewrite" && (
            <div className="ops-field">
              <ExecLabel>Request URL</ExecLabel>
              <Input placeholder="https://*.exemplo.com/arquivos/*" value={wildcardUrl} onChange={(e) => setWildcardUrl(e.target.value)} />
              <p className="ops-hint">Use * pra casar com várias requisições, ex.: https://*.exemplo.com/files/*</p>
            </div>
          )}
          {matchMode === "expression" &&
            (exprMode === "raw" ? (
              <div className="ops-field">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <ExecLabel>Expressão</ExecLabel>
                  <button className="ops-btn ghost sm" style={{ color: T.accent }} onClick={switchToExpressionBuilder}>
                    Use expression builder
                  </button>
                </div>
                <Textarea
                  placeholder={'(http.host eq "exemplo.com")'}
                  rows={2}
                  value={expression}
                  onChange={(e) => setExpression(e.target.value)}
                />
                <p className="ops-hint">Mesma sintaxe de expressão usada em Custom Rules (WAF).</p>
              </div>
            ) : (
              <div className="ops-field">
                <ExecLabel>When incoming requests match…</ExecLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 4 }}>
                  {conditions.map((c, idx) => {
                    const field = EXPR_FIELDS.find((f) => f.key === c.field) ?? EXPR_FIELDS[0];
                    const ops = getExprOperators(c.field);
                    return (
                      <div key={idx}>
                        {idx > 0 && (
                          <div
                            style={{
                              fontSize: 12,
                              fontWeight: 500,
                              color: V2.textMuted,
                              fontFamily: "'IBM Plex Mono',monospace",
                              margin: "6px 0",
                            }}
                          >
                            {combinators[idx - 1]}
                          </div>
                        )}
                        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                          <div style={{ flex: "0 0 140px" }}>
                            <Select value={c.field} onValueChange={(v) => updateFieldForCondition(idx, v)}>
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {EXPR_FIELDS.map((f) => (
                                  <SelectItem key={f.key} value={f.key}>
                                    {f.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div style={{ flex: "0 0 140px" }}>
                            <Select
                              value={c.operator}
                              onValueChange={(v) => updateOperatorForCondition(idx, v, ops)}
                              disabled={field.type === "bool"}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {ops.map((o) => (
                                  <SelectItem key={o.key} value={o.key}>
                                    {o.label}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div style={{ flex: 1, display: "flex", alignItems: "center" }}>
                            {(() => {
                              const op = ops.find((o) => o.key === c.operator) ?? ops[0];
                              if (op.valueKind === "bool") {
                                return <Switch checked={c.value === "true"} onCheckedChange={(v) => updateCondition(idx, { value: v ? "true" : "false" })} />;
                              }
                              const enumOptions = ENUM_VALUE_OPTIONS[c.field];
                              if (op.valueKind === "text" && enumOptions) {
                                return (
                                  <Select value={c.value} onValueChange={(v) => updateCondition(idx, { value: v })}>
                                    <SelectTrigger>
                                      <SelectValue placeholder="Select…" />
                                    </SelectTrigger>
                                    <SelectContent>
                                      {enumOptions.map((v) => (
                                        <SelectItem key={v} value={v}>
                                          {v}
                                        </SelectItem>
                                      ))}
                                    </SelectContent>
                                  </Select>
                                );
                              }
                              if (op.valueKind === "listref") {
                                return (
                                  <Input
                                    placeholder="nome_da_list"
                                    value={c.value}
                                    onChange={(e) => updateCondition(idx, { value: e.target.value })}
                                  />
                                );
                              }
                              if (op.valueKind === "list") {
                                return (
                                  <Input
                                    placeholder={enumOptions ? `${enumOptions.slice(0, 2).join(", ")}, …` : "valor1, valor2, valor3"}
                                    value={c.value}
                                    onChange={(e) => updateCondition(idx, { value: e.target.value })}
                                  />
                                );
                              }
                              return (
                                <Input
                                  placeholder={field.type === "ip" ? "1.2.3.4" : EXPR_VALUE_EXAMPLE[field.key] ?? "e.g. https://*.exemplo.com/files/*"}
                                  value={c.value}
                                  onChange={(e) => updateCondition(idx, { value: e.target.value })}
                                />
                              );
                            })()}
                          </div>
                          {conditions.length > 1 && (
                            <button className="ops-btn ghost sm" onClick={() => removeCondition(idx)} title="Remover">
                              <X size={14} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="ops-btn outline sm" onClick={() => addCondition("and")}>
                      And
                    </button>
                    <button className="ops-btn outline sm" onClick={() => addCondition("or")}>
                      Or
                    </button>
                  </div>
                </div>
                <div style={{ marginTop: 16 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 500,
                        color: V2.textMuted,
                        fontFamily: "'IBM Plex Mono',monospace",
                      }}
                    >
                      Expression Preview
                    </span>
                    <button className="ops-btn ghost sm" style={{ color: T.accent }} onClick={() => setExprMode("raw")}>
                      Editar expressão
                    </button>
                  </div>
                  <div
                    style={{
                      marginTop: 6,
                      border: `1px solid ${V2.border}`,
                      borderRadius: 6,
                      background: V2.surfaceAlt,
                      padding: "10px 12px",
                    }}
                  >
                    <div style={{ fontFamily: "'IBM Plex Mono',monospace", fontSize: 11, color: V2.textPrimary, wordBreak: "break-all" }}>
                      {expression || "—"}
                    </div>
                    <div style={{ marginTop: 6, textAlign: "right", fontSize: 10, color: V2.textSubtle, fontFamily: "'IBM Plex Mono',monospace" }}>
                      {expression.length} / 4000 characters
                    </div>
                  </div>
                </div>
              </div>
            ))}

          {categoryKey === "url_rewrite" && matchMode === "wildcard" && (
            <>
              <div style={{ height: 1, background: V2.border }} />
              <div style={{ fontSize: 13, fontWeight: 700, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>
                Then rewrite the path and/or query…
              </div>
              <p className="ops-hint" style={{ marginTop: -6 }}>
                Informe o path e/ou query do padrão wildcard acima, e pra que reescrever. Pode ser estático ou dinâmico
                usando os grupos capturados pelo * (ex.: ${"{1}"}, ${"{2}"}).
              </p>
              <div style={{ display: "flex", gap: 16 }}>
                <div className="ops-field" style={{ flex: 1 }}>
                  <ExecLabel>Target path</ExecLabel>
                  <PrefixInput prefix="/" value={pathTarget} onChange={setPathTarget} placeholder="files/*" />
                  <p className="ops-hint">e.g. /files/*</p>
                </div>
                <div className="ops-field" style={{ flex: 1 }}>
                  <ExecLabel>Rewrite to</ExecLabel>
                  <PrefixInput prefix="/" value={pathRewrite} onChange={setPathRewrite} placeholder={"newfiles/${1}"} />
                  <p className="ops-hint">e.g. /newfiles/${"{1}"}, ou deixe em branco pra remover o path</p>
                </div>
              </div>
              <div style={{ display: "flex", gap: 16 }}>
                <div className="ops-field" style={{ flex: 1 }}>
                  <ExecLabel>Target query</ExecLabel>
                  <PrefixInput prefix="?" value={queryTarget} onChange={setQueryTarget} placeholder="session=*" />
                  <p className="ops-hint">e.g. ?session=*</p>
                </div>
                <div className="ops-field" style={{ flex: 1 }}>
                  <ExecLabel>Rewrite to</ExecLabel>
                  <PrefixInput prefix="?" value={queryRewrite} onChange={setQueryRewrite} placeholder={"newsession=${1}"} />
                  <p className="ops-hint">e.g. ?newsession=${"{1}"}, ou deixe em branco pra remover a query string</p>
                </div>
              </div>
            </>
          )}
          {categoryKey === "url_rewrite" && matchMode !== "wildcard" && (
            <>
              <div style={{ height: 1, background: V2.border }} />
              <div style={{ fontSize: 13, fontWeight: 700, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>
                Then… Set Rewrite parameters
              </div>
              <div className="ops-field">
                <ExecLabel>Path</ExecLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 6 }}>
                  <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
                    <input type="radio" checked={pathMode === "preserve"} onChange={() => setPathMode("preserve")} style={{ marginTop: 3 }} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Preserve</div>
                      <div className="ops-hint">Maintains the path from the original request.</div>
                    </div>
                  </label>
                  <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
                    <input type="radio" checked={pathMode === "rewrite"} onChange={() => setPathMode("rewrite")} style={{ marginTop: 3 }} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Rewrite to…</div>
                      <div className="ops-hint">Ex.: content/images/thumbnails</div>
                    </div>
                  </label>
                </div>
                {pathMode === "rewrite" && (
                  <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                    <Select value={pathValueMode} onValueChange={(v) => setPathValueMode(v as "static" | "dynamic")}>
                      <SelectTrigger style={{ width: 120, flexShrink: 0 }}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="static">Static</SelectItem>
                        <SelectItem value="dynamic">Dynamic</SelectItem>
                      </SelectContent>
                    </Select>
                    {pathValueMode === "static" ? (
                      <div style={{ flex: 1 }}>
                        <PrefixInput prefix="/" value={pathValue} onChange={setPathValue} placeholder="content/images/thumbnails" />
                        <p className="ops-hint">ou deixe em branco pra reescrever para a raiz (/)</p>
                      </div>
                    ) : (
                      <Input
                        placeholder='wildcard_replace(http.request.uri.path, r"/files/*", r"/newfiles/${1}")'
                        value={pathValue}
                        onChange={(e) => setPathValue(e.target.value)}
                      />
                    )}
                  </div>
                )}
              </div>
              <div className="ops-field">
                <ExecLabel>Query</ExecLabel>
                <div style={{ display: "flex", flexDirection: "column", gap: 12, marginTop: 6 }}>
                  <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
                    <input type="radio" checked={queryMode === "preserve"} onChange={() => setQueryMode("preserve")} style={{ marginTop: 3 }} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Preserve</div>
                      <div className="ops-hint">Maintains the query from the original request.</div>
                    </div>
                  </label>
                  <label style={{ display: "flex", gap: 8, alignItems: "flex-start", cursor: "pointer" }}>
                    <input type="radio" checked={queryMode === "rewrite"} onChange={() => setQueryMode("rewrite")} style={{ marginTop: 3 }} />
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Rewrite to…</div>
                      <div className="ops-hint">Ex.: page=1234</div>
                    </div>
                  </label>
                </div>
                {queryMode === "rewrite" && (
                  <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                    <Select value={queryValueMode} onValueChange={(v) => setQueryValueMode(v as "static" | "dynamic")}>
                      <SelectTrigger style={{ width: 120, flexShrink: 0 }}>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="static">Static</SelectItem>
                        <SelectItem value="dynamic">Dynamic</SelectItem>
                      </SelectContent>
                    </Select>
                    <div style={{ flex: 1 }}>
                      <Input
                        placeholder={queryValueMode === "static" ? "page=1234" : 'wildcard_replace(http.request.uri.query, r"session=*", r"session=${1}")'}
                        value={queryValue}
                        onChange={(e) => setQueryValue(e.target.value)}
                      />
                      {queryValueMode === "static" && <p className="ops-hint">ou deixe em branco pra remover a query string</p>}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}

          {categoryKey === "origin" && (
            <>
              <div style={{ height: 1, background: V2.border }} />
              <div style={{ fontSize: 13, fontWeight: 700, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>
                Then… Set origin parameters
              </div>
              <PreserveRewriteField
                label="Host Header"
                mode={hostHeaderMode}
                onModeChange={setHostHeaderMode}
                value={hostHeaderValue}
                onValueChange={setHostHeaderValue}
                preserveHint="Maintains the host header from the original request."
                rewriteHint="e.g. www.exemplo.com, www.exemplo.com:8081"
                placeholder="www.exemplo.com"
                planRestricted={ORIGIN_ENTERPRISE_ONLY_HINT}
              />
              <PreserveRewriteField
                label="Server Name Indication (SNI)"
                mode={sniMode}
                onModeChange={setSniMode}
                value={sniValue}
                onValueChange={setSniValue}
                preserveHint="Maintains the SNI value from the original request."
                rewriteHint="e.g. images.exemplo.com"
                placeholder="images.exemplo.com"
                planRestricted={ORIGIN_ENTERPRISE_ONLY_HINT}
              />
              <PreserveRewriteField
                label="DNS Record"
                mode={dnsRecordMode}
                onModeChange={setDnsRecordMode}
                value={dnsRecordValue}
                onValueChange={setDnsRecordValue}
                preserveHint="Use the DNS records specified for the top level record."
                rewriteLabel="Override to…"
                rewriteHint="e.g. images.exemplo.com"
                placeholder="images.exemplo.com"
                planRestricted={ORIGIN_ENTERPRISE_ONLY_HINT}
              />
              <PreserveRewriteField
                label="Destination Port"
                mode={portMode}
                onModeChange={setPortMode}
                value={portValue}
                onValueChange={setPortValue}
                preserveHint="Maintains the destination port from the original request."
                rewriteHint="e.g. 8081"
                placeholder="8081"
                inputType="number"
              />
            </>
          )}

          {(categoryKey === "request_header_transform" || categoryKey === "response_header_transform") && (
            <>
              <div style={{ height: 1, background: V2.border }} />
              <div className="ops-field">
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>
                    Modify {categoryKey === "request_header_transform" ? "request" : "response"} header
                  </div>
                  <TooltipProvider delayDuration={150}>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Info size={12} color={T.textSubtle} style={{ cursor: "default" }} />
                      </TooltipTrigger>
                      <TooltipContent side="top">
                        {categoryKey === "request_header_transform"
                          ? "Manipula os headers HTTP da requisição antes de enviar pra origem."
                          : "Manipula os headers HTTP da resposta antes de enviar pro visitante."}
                      </TooltipContent>
                    </Tooltip>
                  </TooltipProvider>
                </div>
                <p className="ops-hint">
                  You can modify up to 30 {categoryKey === "request_header_transform" ? "request" : "response"} headers.
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 8 }}>
                  {headerRows.map((row, idx) => (
                    <div key={idx} style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <div style={{ flex: "0 0 130px" }}>
                        <Select value={row.op} onValueChange={(v) => updateHeaderRow(idx, { op: v as HeaderTransformOp })}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {categoryKey === "response_header_transform" && (
                              <>
                                <SelectItem value="add_static">Add static</SelectItem>
                                <SelectItem value="add_dynamic">Add dynamic</SelectItem>
                              </>
                            )}
                            <SelectItem value="set_static">Set static</SelectItem>
                            <SelectItem value="set_dynamic">Set dynamic</SelectItem>
                            <SelectItem value="remove">Remove</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div style={{ flex: 1 }}>
                        <Input
                          placeholder="Header name"
                          value={row.name}
                          onChange={(e) => updateHeaderRow(idx, { name: e.target.value })}
                        />
                      </div>
                      {row.op !== "remove" && (
                        <>
                          <span style={{ color: V2.textSubtle, fontSize: 12 }}>=</span>
                          <div style={{ flex: 1 }}>
                            <Input
                              placeholder={row.op.endsWith("_dynamic") ? 'concat("Bearer ", http.request.headers["x-token"][0])' : "valor"}
                              value={row.value}
                              onChange={(e) => updateHeaderRow(idx, { value: e.target.value })}
                            />
                          </div>
                        </>
                      )}
                      <button className="ops-btn ghost sm" onClick={() => removeHeaderRow(idx)} title="Remover">
                        <X size={14} />
                      </button>
                    </div>
                  ))}
                  <button className="ops-btn outline sm" style={{ alignSelf: "flex-start" }} onClick={addHeaderRow}>
                    <Plus size={11} /> Set new header
                  </button>
                </div>
              </div>
            </>
          )}

          {categoryKey === "custom_error" && (
            <>
              <div style={{ height: 1, background: V2.border }} />
              <div className="ops-field">
                <div style={{ fontSize: 13, fontWeight: 700, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Then…</div>
                <p className="ops-hint">Deliver a custom error response.</p>
                <div style={{ display: "flex", gap: 12, marginTop: 6 }}>
                  <div className="ops-field" style={{ flex: 1 }}>
                    <ExecLabel>Response type</ExecLabel>
                    <Select value={contentType} onValueChange={(v) => setContentType(v as typeof contentType)}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="asset">Custom error asset</SelectItem>
                        <SelectItem value="application/json">JSON response</SelectItem>
                        <SelectItem value="text/html">HTML response</SelectItem>
                        <SelectItem value="text/plain">Text response</SelectItem>
                        <SelectItem value="application/xml">XML Response</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="ops-field" style={{ flex: "0 0 200px" }}>
                    <ExecLabel>
                      Response code <span style={{ color: V2.textSubtle, fontWeight: 400 }}>(Optional)</span>
                    </ExecLabel>
                    <Input type="number" min={400} max={599} placeholder="Mantém o status original" value={statusCode} onChange={(e) => setStatusCode(e.target.value)} />
                  </div>
                </div>
                {contentType === "asset" ? (
                  <div style={{ marginTop: 12 }}>
                    <ExecLabel>Asset</ExecLabel>
                    <Select disabled value="">
                      <SelectTrigger>
                        <SelectValue placeholder="No custom assets created" />
                      </SelectTrigger>
                      <SelectContent />
                    </Select>
                    <p className="ops-hint">
                      Upload de assets de erro customizado não é suportado por aqui ainda — use um dos outros tipos de resposta
                      (JSON/HTML/Text/XML) por enquanto.
                    </p>
                  </div>
                ) : (
                  <div className="ops-field" style={{ marginTop: 12 }}>
                    <ExecLabel>
                      {contentType === "application/json"
                        ? "JSON response"
                        : contentType === "text/html"
                          ? "HTML response"
                          : contentType === "application/xml"
                            ? "XML Response"
                            : "Text response"}
                    </ExecLabel>
                    <Textarea rows={6} value={content} onChange={(e) => setContent(e.target.value)} placeholder="<html>...</html>" />
                  </div>
                )}
              </div>
            </>
          )}

          {!editing && (
            <>
              <div style={{ height: 1, background: V2.border }} />
              <div className="ops-field" style={{ alignSelf: "flex-start", width: 200 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: V2.textPrimary, fontFamily: "var(--font-ui)", marginBottom: 6 }}>
                  Place at
                </div>
                <span className="ops-hint" style={{ display: "block", marginBottom: 4 }}>
                  Select order:
                </span>
                <Select value={placeAt} onValueChange={(v) => setPlaceAt(v as "first" | "last" | "custom")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="first">First</SelectItem>
                    <SelectItem value="last">Last</SelectItem>
                    <SelectItem value="custom">Custom</SelectItem>
                  </SelectContent>
                </Select>
                {placeAt === "custom" && (
                  <div style={{ marginTop: 10 }}>
                    <span className="ops-hint" style={{ display: "block", marginBottom: 4 }}>
                      Select which rule this will fire after:
                    </span>
                    <Select value={placeAfterRuleId} onValueChange={setPlaceAfterRuleId}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select…" />
                      </SelectTrigger>
                      <SelectContent>
                        {otherRules.map((r) => (
                          <SelectItem key={r.id} value={r.id}>
                            {r.description || r.id}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        {blockedReason && (
          <div
            style={{
              display: "flex",
              alignItems: "flex-start",
              gap: 6,
              padding: "8px 10px",
              borderRadius: 6,
              background: T.dangerBg,
              border: "1px solid rgba(239,68,68,0.25)",
            }}
          >
            <AlertTriangle size={13} color={T.danger} style={{ marginTop: 1, flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: T.danger, fontFamily: "var(--font-ui)" }}>{blockedReason}</span>
          </div>
        )}
        <DialogFooter>
          <button className="ops-btn outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </button>
          <button className="ops-btn primary" onClick={handleSave} disabled={!canSubmit || saving}>
            {saving ? <Loader2 size={12} className="ops-spin" /> : <Check size={12} />}
            Salvar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ─── Rules → Page Rules ─────────────────────────────────────────────────────────
function PageRulesSection({ zoneId }: { zoneId: string }) {
  const qc = useQueryClient();
  // Excluir é destrutivo/irreversível — exige perfil global admin/super admin
  // (mesmo piso extra aplicado no backend de deletePageRule).
  const { isAdmin } = usePermissions();
  const fetchList = useServerFn(listPageRules);
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["cf-page-rules", zoneId],
    queryFn: () => fetchList({ data: { zoneId } }),
    enabled: !!zoneId,
  });
  const rules: PageRule[] = (data as any)?.ok ? (data as any).rules : [];
  const topError = (data as any)?.ok === false ? (data as any).error : null;

  const [createOpen, setCreateOpen] = React.useState(false);
  const [editRule, setEditRule] = React.useState<PageRule | null>(null);
  // Regra aberta no painel lateral (só leitura)
  const [viewRuleId, setViewRuleId] = React.useState<string | null>(null);
  const [viewOpen, setViewOpen] = React.useState(false);
  const [deleteTarget, setDeleteTarget] = React.useState<PageRule | null>(null);
  const [deleting, setDeleting] = React.useState(false);
  const [togglingId, setTogglingId] = React.useState<string | null>(null);
  const [reordering, setReordering] = React.useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = React.useState<string | null>(null);
  const [moveToTarget, setMoveToTarget] = React.useState<PageRule | null>(null);
  // Toda regra nova sobe desativada por segurança (status:"disabled" em
  // createPageRule) — esse alerta avisa isso logo após criar.
  const [showDisabledNotice, setShowDisabledNotice] = React.useState(false);
  const doToggle = useServerFn(togglePageRule);
  const doDelete = useServerFn(deletePageRule);
  const doReorder = useServerFn(reorderPageRules);
  const doCreate = useServerFn(createPageRule);

  function invalidate() {
    qc.invalidateQueries({ queryKey: ["cf-page-rules", zoneId] });
  }
  function afterRuleCreated() {
    setCreateOpen(false);
    invalidate();
    setShowDisabledNotice(true);
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= rules.length) return;
    const orderedRuleIds = rules.map((r) => r.id);
    [orderedRuleIds[index], orderedRuleIds[target]] = [orderedRuleIds[target], orderedRuleIds[index]];
    setReordering(rules[index].id);
    try {
      const res: any = await doReorder({ data: { zoneId, orderedRuleIds } });
      if (res.ok) invalidate();
      else toast.error(res.error);
    } finally {
      setReordering(null);
    }
  }

  async function handleDuplicate(rule: PageRule) {
    setDuplicatingId(rule.id);
    try {
      const res: any = await doCreate({
        data: { zoneId, urlPattern: rule.urlPattern, settings: rule.actions, priority: rules.length + 1 },
      });
      if (res.ok) {
        toast.success("Page Rule duplicada.");
        invalidate();
        setShowDisabledNotice(true);
      } else toast.error(res.error);
    } finally {
      setDuplicatingId(null);
    }
  }

  async function handleMoveTo(rule: PageRule, newPosition: number) {
    const idx = rules.findIndex((r) => r.id === rule.id);
    if (idx === -1) return;
    const orderedRuleIds = rules.map((r) => r.id);
    const [item] = orderedRuleIds.splice(idx, 1);
    const insertAt = Math.max(0, Math.min(orderedRuleIds.length, newPosition - 1));
    orderedRuleIds.splice(insertAt, 0, item);
    setReordering(rule.id);
    try {
      const res: any = await doReorder({ data: { zoneId, orderedRuleIds } });
      if (res.ok) invalidate();
      else toast.error(res.error);
    } finally {
      setReordering(null);
      setMoveToTarget(null);
    }
  }

  async function handleToggle(rule: PageRule) {
    setTogglingId(rule.id);
    try {
      const res: any = await doToggle({
        data: { zoneId, ruleId: rule.id, status: rule.status === "active" ? "disabled" : "active", urlPattern: rule.urlPattern },
      });
      if (res.ok) {
        toast.success(rule.status === "active" ? "Page Rule desabilitada." : "Page Rule habilitada.");
        invalidate();
      } else toast.error(res.error);
    } finally {
      setTogglingId(null);
    }
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res: any = await doDelete({ data: { zoneId, ruleId: deleteTarget.id, urlPattern: deleteTarget.urlPattern } });
      if (res.ok) {
        toast.success("Page Rule excluída.");
        setDeleteTarget(null);
        invalidate();
      } else toast.error(res.error);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 8 }}>
        <span className="ops-hint" style={{ margin: 0 }}>
          {rules.length} de 50 Page Rules usadas
        </span>
        <button className="ops-btn primary" onClick={() => setCreateOpen(true)}>
          <Plus size={13} /> Create Page Rule
        </button>
      </div>

      {topError ? (
        <div className="ops-empty">{topError}</div>
      ) : (
        <div className="ops-table-wrap">
          <table className="ops-table">
            <thead>
              <tr>
                <th style={{ width: 70 }}>Position</th>
                <th>URL / Description</th>
                <th>Action</th>
                <th>Status</th>
                <th style={{ textAlign: "right" }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 && (
                <tr>
                  <td colSpan={5} className="ops-empty">
                    {isFetching ? "Carregando…" : "Nenhuma Page Rule encontrada."}
                  </td>
                </tr>
              )}
              {rules.map((r, i) => (
                <tr
                  key={r.id}
                  className="ops-row-click"
                  tabIndex={0}
                  title="Ver a regra completa"
                  onClick={() => {
                    setViewRuleId(r.id);
                    setViewOpen(true);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      setViewRuleId(r.id);
                      setViewOpen(true);
                    }
                  }}
                >
                  <td className="mono dim">{reordering === r.id ? <Loader2 size={11} className="ops-spin" /> : i + 1}</td>
                  <td className="mono trunc" style={{ maxWidth: 320 }} title={r.urlPattern}>
                    {r.urlPattern}
                  </td>
                  <td className="trunc" style={{ maxWidth: 280 }} title={r.actionsLabel}>
                    {r.actionsLabel}
                  </td>
                  <td>
                    {r.status === "active" ? (
                      <span className="ops-rule-status-active">Active</span>
                    ) : (
                      <span className="ops-rule-status-disabled">Disabled</span>
                    )}
                  </td>
                  <td style={{ textAlign: "right" }} onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 2 }}>
                      <RuleRowActionsMenu
                        onEdit={pageRuleCanEdit(r) ? () => setEditRule(r) : undefined}
                        onDuplicate={() => handleDuplicate(r)}
                        duplicating={duplicatingId === r.id}
                        moving={reordering === r.id}
                        canMoveUp={i > 0}
                        onMoveUp={() => handleMove(i, -1)}
                        canMoveDown={i < rules.length - 1}
                        onMoveDown={() => handleMove(i, 1)}
                        onMoveTo={() => setMoveToTarget(r)}
                      />
                      <button
                        className="ops-btn ghost sm"
                        onClick={() => handleToggle(r)}
                        disabled={togglingId === r.id}
                        title={r.status === "active" ? "Desabilitar" : "Habilitar"}
                      >
                        {togglingId === r.id ? (
                          <Loader2 size={13} className="ops-spin" />
                        ) : (
                          <Power size={13} color={r.status === "active" ? T.success : V2.textMuted} />
                        )}
                      </button>
                      <button
                        className="ops-btn ghost sm"
                        onClick={() => isAdmin && setDeleteTarget(r)}
                        disabled={!isAdmin}
                        title={isAdmin ? "Excluir" : "Excluir regras exige perfil admin ou super admin"}
                      >
                        <Trash2 size={13} color={isAdmin ? T.danger : V2.textMuted} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {(() => {
        const idx = rules.findIndex((x) => x.id === viewRuleId);
        const vr = idx >= 0 ? rules[idx] : null;
        return (
          <DetailSheet
            open={viewOpen && !!vr}
            onOpenChange={setViewOpen}
            width={620}
            eyebrow={`Page Rule · posição ${idx + 1}`}
            title={<span style={{ fontFamily: "var(--font-data)", fontSize: 15, overflowWrap: "anywhere" }}>{vr?.urlPattern}</span>}
            badges={
              vr &&
              (vr.status === "active" ? (
                <span className="ops-rule-status-active">Active</span>
              ) : (
                <span className="ops-rule-status-disabled">Disabled</span>
              ))
            }
            footer={
              <>
                <button className="ops-btn outline" style={{ marginRight: "auto" }} onClick={() => setViewOpen(false)}>
                  Fechar
                </button>
                {vr && pageRuleCanEdit(vr) && (
                  <button
                    className="ops-btn primary"
                    onClick={() => {
                      setViewOpen(false);
                      setEditRule(vr);
                    }}
                  >
                    <Pencil size={13} /> Editar
                  </button>
                )}
              </>
            }
          >
            {vr && (
              <div className="ops-root" style={{ display: "grid", gap: 20 }}>
                <DetailSection title="Quando a URL bater com">
                  <pre className="ops-code">{vr.urlPattern}</pre>
                </DetailSection>
                <DetailSection title="Configurações aplicadas">
                  {vr.actions.length === 0 ? (
                    <p className="ops-hint" style={{ margin: 0 }}>
                      Nenhuma configuração.
                    </p>
                  ) : (
                    <DetailList
                      items={vr.actions.map((a): [string, React.ReactNode, boolean] => [
                        PAGE_RULE_SETTINGS.find((d) => d.id === a.id)?.label ?? a.id,
                        a.value === undefined || a.value === null
                          ? "ativado"
                          : typeof a.value === "object"
                            ? JSON.stringify(a.value)
                            : String(a.value),
                        true,
                      ])}
                    />
                  )}
                </DetailSection>
                <DetailSection title="Resumo">
                  <DetailList
                    items={[
                      ["Posição", String(idx + 1)],
                      ["Status", vr.status === "active" ? "Ativa" : "Desativada"],
                      ["ID", vr.id, true],
                    ]}
                  />
                </DetailSection>
              </div>
            )}
          </DetailSheet>
        );
      })()}
      {moveToTarget && (
        <MoveToPositionDialog
          open={!!moveToTarget}
          onOpenChange={(o) => !o && setMoveToTarget(null)}
          currentPosition={rules.findIndex((r) => r.id === moveToTarget.id) + 1}
          maxPosition={rules.length}
          saving={reordering === moveToTarget.id}
          onConfirm={(newPosition) => handleMoveTo(moveToTarget, newPosition)}
        />
      )}

      <PageRuleDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        zoneId={zoneId}
        existingRules={rules}
        onSaved={afterRuleCreated}
      />
      <PageRuleDialog
        open={!!editRule}
        onOpenChange={(o) => !o && setEditRule(null)}
        zoneId={zoneId}
        editing={editRule}
        existingRules={rules}
        onSaved={() => {
          setEditRule(null);
          invalidate();
        }}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Page Rule</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza que deseja excluir a regra pra <strong>{deleteTarget?.urlPattern}</strong>? Essa ação não
              pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showDisabledNotice} onOpenChange={setShowDisabledNotice}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <ShieldCheck size={16} color={T.accent} />
              Regra criada — desativada por segurança
            </AlertDialogTitle>
            <AlertDialogDescription>
              Toda regra nova é criada desativada por padrão. Confira se ela está correta e habilite pelo botão de
              energia na listagem quando estiver pronta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowDisabledNotice(false)}>Entendi</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

type PageRuleSettingRow = { id: string; value: PageRuleSettingValue };

function SettingValueEditor({
  def,
  value,
  onChange,
}: {
  def: PageRuleSettingDef;
  value: PageRuleSettingValue;
  onChange: (v: PageRuleSettingValue) => void;
}) {
  if (def.kind === "flag") {
    return <span className="ops-hint">Sem valor adicional — só ativa a configuração.</span>;
  }
  if (def.kind === "onoff") {
    const isOn = value !== "off";
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
        <span style={{ fontSize: 12, color: V2.textPrimary, fontFamily: "'IBM Plex Mono',monospace", fontWeight: 600 }}>
          {isOn ? "On" : "Off"}
        </span>
        <Switch checked={isOn} onCheckedChange={(checked) => onChange(checked ? "on" : "off")} />
      </div>
    );
  }
  if (def.kind === "seconds") {
    return (
      <Input
        type="number"
        min={0}
        value={typeof value === "number" ? value : 0}
        onChange={(e) => onChange(Number(e.target.value) || 0)}
        placeholder="Segundos"
      />
    );
  }
  if (def.kind === "text") {
    return <Input value={typeof value === "string" ? value : ""} onChange={(e) => onChange(e.target.value)} placeholder="Valor" />;
  }
  if (def.kind === "select") {
    return (
      <Select value={typeof value === "string" ? value : (def.options?.[0]?.value ?? "")} onValueChange={(v) => onChange(v)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {def.options?.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  // url_redirect
  const v = value && typeof value === "object" && "url" in value ? value : { url: "", status_code: 301 };
  return (
    <div style={{ display: "flex", gap: 8 }}>
      <Input
        style={{ flex: 1 }}
        placeholder="https://www.exemplo.com/novo/$1"
        value={v.url}
        onChange={(e) => onChange({ ...v, url: e.target.value })}
      />
      <Select value={String(v.status_code)} onValueChange={(sv) => onChange({ ...v, status_code: Number(sv) })}>
        <SelectTrigger style={{ width: 170, flexShrink: 0 }}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="301">301 - Permanent</SelectItem>
          <SelectItem value="302">302 - Temporary</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function PageRuleDialog({
  open,
  onOpenChange,
  zoneId,
  editing,
  existingRules,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  zoneId: string;
  editing?: PageRule | null;
  existingRules: PageRule[];
  onSaved: () => void;
}) {
  const doCreate = useServerFn(createPageRule);
  const doUpdate = useServerFn(updatePageRule);
  const doReorder = useServerFn(reorderPageRules);
  const [urlPattern, setUrlPattern] = React.useState("");
  const [rows, setRows] = React.useState<PageRuleSettingRow[]>([]);
  const [status, setStatus] = React.useState<"active" | "disabled">("active");
  const [position, setPosition] = React.useState(1);
  const [saving, setSaving] = React.useState(false);

  // Editando: a regra já ocupa uma das N posições existentes. Criando: entra
  // como uma posição extra (N+1 possíveis lugares, "Last" por padrão).
  const totalSlots = editing ? Math.max(1, existingRules.length) : existingRules.length + 1;

  React.useEffect(() => {
    if (!open) return;
    if (editing) {
      setUrlPattern(editing.urlPattern);
      setRows(editing.actions.map((a) => ({ id: a.id, value: a.value })));
      setStatus(editing.status);
      const idx = existingRules.findIndex((r) => r.id === editing.id);
      setPosition(idx >= 0 ? idx + 1 : existingRules.length);
    } else {
      setUrlPattern("");
      setRows([{ id: PAGE_RULE_SETTINGS[0].id, value: defaultValueForSetting(PAGE_RULE_SETTINGS[0]) }]);
      setStatus("active");
      setPosition(existingRules.length + 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  function addRow() {
    const usedIds = new Set(rows.map((r) => r.id));
    const next = PAGE_RULE_SETTINGS.find((s) => !usedIds.has(s.id));
    if (!next) return;
    setRows([...rows, { id: next.id, value: defaultValueForSetting(next) }]);
  }
  function removeRow(idx: number) {
    setRows(rows.filter((_, i) => i !== idx));
  }
  function changeRowSetting(idx: number, id: string) {
    const def = PAGE_RULE_SETTINGS.find((s) => s.id === id);
    if (!def) return;
    setRows(rows.map((r, i) => (i === idx ? { id, value: defaultValueForSetting(def) } : r)));
  }
  function changeRowValue(idx: number, value: PageRuleSettingValue) {
    setRows(rows.map((r, i) => (i === idx ? { ...r, value } : r)));
  }

  const canSubmit = !!(urlPattern.trim() && rows.length > 0);

  async function handleSave() {
    setSaving(true);
    try {
      const settings = rows.map((r) => ({ id: r.id, value: r.value }));
      if (editing) {
        const res: any = await doUpdate({
          data: { zoneId, ruleId: editing.id, urlPattern, settings, priority: editing.priority, status },
        });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        const currentIds = existingRules.map((r) => r.id);
        const oldIdx = currentIds.indexOf(editing.id);
        const newIdx = Math.min(Math.max(position - 1, 0), currentIds.length - 1);
        if (oldIdx !== -1 && oldIdx !== newIdx) {
          const reordered = [...currentIds];
          reordered.splice(oldIdx, 1);
          reordered.splice(newIdx, 0, editing.id);
          const rres: any = await doReorder({ data: { zoneId, orderedRuleIds: reordered } });
          if (!rres.ok) {
            toast.error(rres.error);
            return;
          }
        }
        toast.success("Page Rule atualizada.");
        onSaved();
      } else {
        const res: any = await doCreate({ data: { zoneId, urlPattern, settings, priority: existingRules.length + 1 } });
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        const desiredIdx = Math.min(Math.max(position - 1, 0), existingRules.length);
        if (res.ruleId && desiredIdx < existingRules.length) {
          const ids = existingRules.map((r) => r.id);
          ids.splice(desiredIdx, 0, res.ruleId);
          const rres: any = await doReorder({ data: { zoneId, orderedRuleIds: ids } });
          if (!rres.ok) {
            toast.error(rres.error);
            return;
          }
        }
        toast.success("Page Rule criada.");
        onSaved();
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle style={{ display: "flex", alignItems: "center", gap: 8 }}>
            {editing ? <Pencil size={16} color={T.accent} /> : <Plus size={16} color={T.accent} />}
            {editing ? "Editar Page Rule" : "Criar Page Rule"}
          </DialogTitle>
        </DialogHeader>
        <div style={{ display: "flex", flexDirection: "column", gap: 12, padding: "8px 0", maxHeight: "65vh", overflowY: "auto" }}>
          <div className="ops-field">
            <ExecLabel>Padrão de URL</ExecLabel>
            <Input placeholder="www.exemplo.com/antigo/*" value={urlPattern} onChange={(e) => setUrlPattern(e.target.value)} />
            <p className="ops-hint">Suporta * como coringa, igual ao Page Rules nativo.</p>
          </div>

          <div style={{ fontSize: 12.5, fontWeight: 600, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>
            Then the settings are:
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {rows.map((row, idx) => {
              const def = PAGE_RULE_SETTINGS.find((s) => s.id === row.id) ?? PAGE_RULE_SETTINGS[0];
              const usedIds = new Set(rows.map((r) => r.id));
              return (
                <div
                  key={idx}
                  style={{
                    border: `1px solid ${V2.border}`,
                    borderRadius: 8,
                    padding: 10,
                    display: "flex",
                    flexDirection: "column",
                    gap: 8,
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <ExecLabel>Pick a Setting</ExecLabel>
                    <button className="ops-btn ghost sm" onClick={() => removeRow(idx)} title="Remover">
                      <X size={14} />
                    </button>
                  </div>
                  <Select value={row.id} onValueChange={(v) => changeRowSetting(idx, v)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_RULE_SETTINGS.filter((s) => s.id === row.id || !usedIds.has(s.id)).map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <SettingValueEditor def={def} value={row.value} onChange={(v) => changeRowValue(idx, v)} />
                </div>
              );
            })}
            <button
              className="ops-btn outline sm"
              style={{ alignSelf: "flex-start" }}
              onClick={addRow}
              disabled={rows.length >= PAGE_RULE_SETTINGS.length}
            >
              <Plus size={11} /> Add a Setting
            </button>
          </div>

          <div style={{ fontSize: 12.5, fontWeight: 600, color: V2.textPrimary, fontFamily: "var(--font-ui)" }}>Order:</div>
          <div style={{ display: "flex", gap: 12 }}>
            <div className="ops-field" style={{ flex: "0 0 200px" }}>
              <ExecLabel>Posição</ExecLabel>
              <Select value={String(position)} onValueChange={(v) => setPosition(Number(v))}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: totalSlots }, (_, i) => i + 1).map((p) => (
                    <SelectItem key={p} value={String(p)}>
                      {p}
                      {p === 1 ? " (First)" : p === totalSlots ? " (Last)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="ops-hint">Só a primeira regra que bater é aplicada — a ordem importa.</p>
            </div>
            {editing && (
              <div className="ops-field" style={{ flex: "0 0 160px" }}>
                <ExecLabel>Status</ExecLabel>
                <Select value={status} onValueChange={(v) => setStatus(v as "active" | "disabled")}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Active</SelectItem>
                    <SelectItem value="disabled">Disabled</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </div>
        <DialogFooter>
          <button className="ops-btn outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </button>
          <button className="ops-btn primary" onClick={handleSave} disabled={!canSubmit || saving}>
            {saving ? <Loader2 size={12} className="ops-spin" /> : <Check size={12} />}
            Salvar
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
