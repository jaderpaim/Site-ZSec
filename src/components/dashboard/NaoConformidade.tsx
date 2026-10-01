import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Plus,
  Pencil,
  Trash2,
  Activity,
  MonitorOff,
  ShieldAlert,
  Shield,
  Server,
  Laptop,
  RadioTower,
  FileWarning,
  Loader2,
  Minimize2,
  Maximize2,
  GripHorizontal,
  Ticket,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/lib/use-permissions";
import { listIndisponibilidades } from "@/lib/disponibilidade.functions";
import { getSophosEncryptionDetail } from "@/lib/sophos.functions";
import { getWsusOverview } from "@/lib/wsus.functions";
import { listAllSkipCustomRules, getSkipCountsByRule } from "@/lib/cloudflare.functions";
import {
  listNaoConformidadesManuais,
  deleteNaoConformidadeManual,
  listNaoConformidadeChamados,
  deleteNaoConformidadeChamado,
  type NaoConformidadeManualRow,
  type NaoConformidadeChamadoRow,
} from "@/lib/nao-conformidade.functions";
import { NaoConformidadeManualDialog } from "./nao-conformidade/NaoConformidadeManualDialog";
import { NaoConformidadeChamadoDialog } from "./nao-conformidade/NaoConformidadeChamadoDialog";

// ── Design Tokens ──────────────────────────────────────────────────────────────
const T = {
  bg: "#0A0D14",
  surface: "#0F1420",
  surfaceAlt: "#131825",
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
  cyan: "#22D3EE",
  neutral: "#6B7280",
  textPrimary: "#F1F5F9",
  textSecondary: "#F1F5F9",
  textMuted: "#F1F5F9",
  textSubtle: "#F1F5F9",
};

const LICENSED_EPS = 2000;
const SLA_DAYS: Record<string, number> = { Crítica: 5, Alta: 8, Média: 30, Baixa: 60 };
function daysBetween(a: Date, b: Date) {
  return Math.floor((b.getTime() - a.getTime()) / 86400000);
}
type VulnRow = {
  id: string;
  fqdn: string | null;
  severity: string;
  status: string;
  identified_at: string | null;
  department_id: string | null;
  kind?: string | null;
};
function isForaDoPrazo(v: VulnRow): { fora: boolean; atraso: number } {
  if (v.status === "Mitigada" || v.status === "Fechada") return { fora: false, atraso: 0 };
  if (!v.identified_at) return { fora: false, atraso: 0 };
  const sla = SLA_DAYS[v.severity] ?? 30;
  const elapsed = Math.max(0, daysBetween(new Date(v.identified_at), new Date()));
  if (elapsed > sla) return { fora: true, atraso: elapsed - sla };
  return { fora: false, atraso: 0 };
}
function fmtDateBR(d: string | null) {
  if (!d) return "—";
  const [y, m, day] = d.split("-");
  if (!y || !m || !day) return d;
  return `${day}/${m}/${y}`;
}
const sevColor = (s: string) =>
  s === "Crítica" ? T.danger : s === "Alta" ? T.warning : s === "Média" ? T.accent : T.success;

// ── CSS ────────────────────────────────────────────────────────────────────────
const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');

  .nc-root { font-family:'DM Sans',sans-serif; color:${T.textPrimary}; display:flex; flex-direction:column; gap:16px; }
  .nc-root * { box-sizing:border-box; }
  @keyframes nc-spin   { to{transform:rotate(360deg)} }
  @keyframes nc-fadeup { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  .nc-spin   { animation:nc-spin 0.75s linear infinite; }
  .nc-fadeup { animation:nc-fadeup 0.3s ease forwards; }

  .nc-root ::-webkit-scrollbar       { width:4px; height:4px; }
  .nc-root ::-webkit-scrollbar-track { background:transparent; }
  .nc-root ::-webkit-scrollbar-thumb { background:${T.borderHi}; border-radius:2px; }

  .nc-root .recharts-cartesian-axis-tick-value { fill:${T.textMuted} !important; font-size:10px; font-family:'IBM Plex Mono',monospace; }
  .nc-root .recharts-label { fill:${T.textPrimary} !important; }

  /* ── KPI ── */
  .nc-kpi-grid { display:grid; grid-template-columns:repeat(5,1fr); gap:12px; }
  @media (max-width:980px){ .nc-kpi-grid { grid-template-columns:repeat(2,1fr); } }
  .nc-kpi { background:${T.surfaceAlt}; border:1px solid ${T.border}; border-radius:10px; padding:14px 16px; position:relative; overflow:hidden; transition:border-color 0.2s; }
  .nc-kpi:hover { border-color:${T.borderHi}; }
  .nc-kpi::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; background:var(--kc,${T.accent}); }
  .nc-kpi-icon { position:absolute; top:10px; right:10px; width:40px; height:40px; border-radius:9px; display:flex; align-items:center; justify-content:center; background:var(--ki-bg,${T.accentGlow}); }
  .nc-kpi-label { font-size:9px; font-weight:700; letter-spacing:0.13em; text-transform:uppercase; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; margin-bottom:5px; max-width:calc(100% - 44px); }
  .nc-kpi-value { font-size:26px; font-weight:700; font-family:'Space Grotesk',sans-serif; letter-spacing:-0.02em; line-height:1; color:var(--kc,${T.textPrimary}); }
  .nc-kpi-hint { font-size:10px; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; margin-top:5px; }

  /* ── Panel / Block ── */
  .nc-panel { background:${T.surface}; border:1px solid ${T.border}; border-radius:12px; overflow:hidden; display:flex; flex-direction:column; min-width:0; transition:border-color 0.2s,box-shadow 0.2s; }
  .nc-panel.nc-dragging { opacity:0.3; border:1px dashed ${T.accent}; }
  .nc-panel-hdr { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; padding:13px 20px; background:${T.surfaceAlt}; border-bottom:1px solid ${T.border}; cursor:grab; user-select:none; }
  .nc-panel-hdr:active { cursor:grabbing; }
  .nc-panel-title { display:flex; align-items:center; gap:8px; font-size:11px; font-weight:700; letter-spacing:0.09em; text-transform:uppercase; font-family:'IBM Plex Mono',monospace; color:${T.textPrimary}; min-width:0; }
  .nc-panel-count { font-weight:400; color:${T.textSubtle}; }
  .nc-panel-body { padding:16px 20px; flex:1; min-width:0; }

  /* ── Resize controls ── */
  .nc-resize-ctrl { display:flex; align-items:center; gap:2px; opacity:0; transition:opacity 0.15s; }
  .nc-panel:hover .nc-resize-ctrl { opacity:1; }
  .nc-resize-btn { padding:2px; border:none; background:transparent; color:${T.textMuted}; cursor:pointer; border-radius:3px; line-height:0; display:inline-flex; transition:color 0.15s,background 0.15s; }
  .nc-resize-btn:hover { color:${T.textPrimary}; background:rgba(255,255,255,0.07); }

  .nc-grid-2 { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  @media (max-width:1100px){ .nc-grid-2 { grid-template-columns:1fr; } }
  .nc-split { display:grid; grid-template-columns:1fr 1fr; gap:18px; }
  @media (max-width:760px){ .nc-split { grid-template-columns:1fr; } }

  /* ── SKIP rule cards ── */
  .nc-skip-grid { display:grid; grid-template-columns:repeat(3,1fr); gap:12px; }
  @media (max-width:1100px){ .nc-skip-grid { grid-template-columns:repeat(2,1fr); } }
  @media (max-width:680px){ .nc-skip-grid { grid-template-columns:1fr; } }
  .nc-skip-card { padding:13px 15px; background:${T.surfaceAlt}; border:1px solid ${T.border}; border-radius:10px; display:flex; flex-direction:column; gap:9px; transition:border-color 0.2s; }
  .nc-skip-card:hover { border-color:${T.borderHi}; }
  .nc-skip-name { font-size:12px; font-weight:600; color:${T.textPrimary}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .nc-skip-zone { font-size:10px; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; margin-top:2px; }

  /* ── Ranking bars (RDP, indisp) ── */
  .nc-rank-row { display:flex; align-items:center; gap:11px; padding:6px 0; }
  .nc-rank-name { width:150px; flex-shrink:0; font-size:11px; color:${T.textPrimary}; font-family:'IBM Plex Mono',monospace; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .nc-rank-track { flex:1; height:18px; background:rgba(30,38,64,0.5); border-radius:4px; overflow:hidden; min-width:0; position:relative; }
  .nc-rank-fill { height:100%; border-radius:4px; transition:width 0.6s ease; display:flex; align-items:center; justify-content:flex-end; padding-right:7px; }
  .nc-rank-fill-val { font-size:10px; font-weight:700; color:rgba(255,255,255,0.92); font-family:'IBM Plex Mono',monospace; }
  .nc-rank-val-ext { width:48px; flex-shrink:0; text-align:right; font-size:12px; font-weight:700; font-family:'IBM Plex Mono',monospace; color:${T.textPrimary}; }

  /* ── List rows ── */
  .nc-list { display:flex; flex-direction:column; gap:5px; overflow-y:auto; }
  .nc-list-row { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:8px 11px; background:${T.surfaceAlt}; border:1px solid ${T.border}; border-radius:7px; font-size:12px; }
  .nc-list-row .mono { font-family:'IBM Plex Mono',monospace; font-size:11px; }
  .nc-list-name { font-weight:500; color:${T.textPrimary}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; min-width:0; }
  .nc-list-meta { font-size:10px; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; white-space:nowrap; }

  /* ── Encryption tiles (Sophos) ── */
  .nc-enc-tiles { display:grid; grid-template-columns:1fr 1fr; gap:10px; }
  .nc-enc-tile { position:relative; border-radius:10px; padding:13px 15px; overflow:hidden; }
  .nc-enc-tile::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; }
  .nc-enc-tile.ok   { background:${T.successBg}; border:1px solid rgba(16,185,129,0.25); }
  .nc-enc-tile.ok::before   { background:${T.success}; }
  .nc-enc-tile.bad  { background:${T.dangerBg}; border:1px solid rgba(239,68,68,0.25); }
  .nc-enc-tile.bad::before  { background:${T.danger}; }
  .nc-enc-tile-label { display:flex; align-items:center; gap:6px; font-size:10px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; font-family:'IBM Plex Mono',monospace; margin-bottom:8px; }
  .nc-enc-tile-num { font-size:28px; font-weight:700; font-family:'Space Grotesk',sans-serif; letter-spacing:-0.02em; line-height:1; }
  .nc-enc-tile-sub { font-size:10px; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; margin-top:4px; }
  .nc-enc-bar { height:18px; border-radius:5px; overflow:hidden; display:flex; background:rgba(30,38,64,0.5); margin-top:12px; position:relative; }
  .nc-enc-bar-seg { display:flex; align-items:center; padding:0 8px; transition:width 0.6s ease; }
  .nc-enc-bar-val { font-size:10px; font-weight:700; color:rgba(255,255,255,0.95); font-family:'IBM Plex Mono',monospace; white-space:nowrap; }
  .nc-enc-meta { display:flex; justify-content:space-between; margin-top:8px; font-size:10px; color:${T.textSubtle}; font-family:'IBM Plex Mono',monospace; }

  /* ── Coverage bar (WSUS) ── */
  .nc-cov-head { display:flex; align-items:center; justify-content:space-between; margin-bottom:8px; }
  .nc-cov-label { font-size:11px; color:${T.textSecondary}; }
  .nc-cov-bar { width:100%; height:18px; border-radius:5px; overflow:hidden; display:flex; background:rgba(30,38,64,0.5); }
  .nc-cov-seg { display:flex; align-items:center; padding:0 8px; transition:width 0.6s ease; }
  .nc-cov-val { font-size:10px; font-weight:700; color:rgba(255,255,255,0.95); font-family:'IBM Plex Mono',monospace; white-space:nowrap; }

  /* ── Badge ── */
  .nc-badge { display:inline-flex; align-items:center; gap:4px; padding:3px 9px; border-radius:5px; font-size:10px; font-weight:700; font-family:'IBM Plex Mono',monospace; border:1px solid transparent; white-space:nowrap; }
  .nc-badge.danger  { background:${T.dangerBg}; color:${T.danger}; border-color:rgba(239,68,68,0.3); }
  .nc-badge.warning { background:${T.warningBg}; color:${T.warning}; border-color:rgba(245,158,11,0.3); }
  .nc-badge.success { background:${T.successBg}; color:${T.success}; border-color:rgba(16,185,129,0.3); }
  .nc-badge.info    { background:${T.accentSoft}; color:${T.accent}; border-color:rgba(59,130,246,0.3); }
  .nc-badge.neutral { background:rgba(107,114,128,0.12); color:${T.textSecondary}; border-color:rgba(107,114,128,0.3); }

  /* ── Severity chips row (vulns) ── */
  .nc-sev-row { display:flex; gap:10px; flex-wrap:wrap; margin-bottom:14px; }
  .nc-sev-chip { flex:1; min-width:90px; background:${T.surfaceAlt}; border:1px solid ${T.border}; border-radius:9px; padding:11px 13px; position:relative; overflow:hidden; }
  .nc-sev-chip::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; background:var(--sc); }
  .nc-sev-chip-label { font-size:9px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; }
  .nc-sev-chip-num { font-size:24px; font-weight:700; font-family:'Space Grotesk',sans-serif; line-height:1; margin-top:5px; color:var(--sc); }

  /* ── Table ── */
  .nc-table-wrap { overflow-x:auto; }
  .nc-table { width:100%; border-collapse:collapse; }
  .nc-table thead { position:sticky; top:0; z-index:10; }
  .nc-table th { padding:8px 12px; font-size:9px; font-weight:700; letter-spacing:0.1em; text-transform:uppercase; color:${T.textPrimary}; font-family:'IBM Plex Mono',monospace; text-align:left; background:${T.surface}; border-bottom:1px solid ${T.border}; white-space:nowrap; }
  .nc-table td { padding:10px 12px; border-bottom:1px solid rgba(30,38,64,0.4); font-size:12px; color:${T.textPrimary}; vertical-align:middle; }
  .nc-table tbody tr:hover td { background:rgba(59,130,246,0.03); }
  .nc-table tbody tr:last-child td { border-bottom:none; }
  .nc-table .mono { font-family:'IBM Plex Mono',monospace; font-size:11px; }
  .nc-table .dim  { color:${T.textMuted}; }
  .nc-trunc { max-width:200px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

  .nc-icon-btn { background:transparent; border:none; cursor:pointer; padding:5px; border-radius:6px; color:${T.textMuted}; display:inline-flex; transition:all 0.15s; }
  .nc-icon-btn:hover { background:${T.surfaceAlt}; color:${T.textPrimary}; }
  .nc-icon-btn.danger:hover { color:${T.danger}; }

  .nc-empty { padding:36px; text-align:center; color:${T.textMuted}; font-size:13px; }
  .nc-loading { display:flex; align-items:center; justify-content:center; gap:8px; padding:36px; color:${T.textMuted}; font-size:12px; font-family:'IBM Plex Mono',monospace; }
`;

// ── Small components ───────────────────────────────────────────────────────────
function Loading({ label = "Carregando…" }: { label?: string }) {
  return (
    <div className="nc-loading">
      <Loader2 size={13} className="nc-spin" color={T.cyan} /> {label}
    </div>
  );
}

function RankBars({
  data,
  maxVal,
  colorFor,
}: {
  data: Array<{ label: string; value: number }>;
  maxVal: number;
  colorFor: (v: number, i: number) => string;
}) {
  return (
    <div>
      {data.map((d, i) => {
        const pct = maxVal > 0 ? (d.value / maxVal) * 100 : 0;
        const color = colorFor(d.value, i);
        const showInside = pct >= 18;
        return (
          <div key={i} className="nc-rank-row">
            <span className="nc-rank-name" title={d.label}>
              {d.label}
            </span>
            <div className="nc-rank-track">
              <div
                className="nc-rank-fill"
                style={{
                  width: `${Math.max(4, pct)}%`,
                  background: `linear-gradient(90deg,${color}66,${color})`,
                }}
              >
                {showInside ? <span className="nc-rank-fill-val">{d.value.toLocaleString("pt-BR")}</span> : null}
              </div>
            </div>
            {!showInside ? (
              <span className="nc-rank-val-ext">{d.value.toLocaleString("pt-BR")}</span>
            ) : (
              <span className="nc-rank-val-ext" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ── Layout de blocos (redimensionar/arrastar/salvar) — padrão Cloudflare/Sophos ──
type NcBlock = { id: string; title: string; size: string };
const NC_STORAGE_KEY = "nao_conformidade_layout_v1";
const DEFAULT_BLOCKS: NcBlock[] = [
  { id: "kpis", title: "Indicadores", size: "col-span-1 md:col-span-2 lg:col-span-6" },
  {
    id: "skip",
    title: "Custom Rules com ação SKIP",
    size: "col-span-1 md:col-span-2 lg:col-span-3",
  },
  {
    id: "rdp",
    title: "Usuários que usaram RDP · 7 dias",
    size: "col-span-1 md:col-span-2 lg:col-span-3",
  },
  {
    id: "indisp",
    title: "Dispositivos Indisponíveis",
    size: "col-span-1 md:col-span-2 lg:col-span-3",
  },
  {
    id: "sophos",
    title: "Endpoints Não Criptografados",
    size: "col-span-1 md:col-span-2 lg:col-span-3",
  },
  { id: "wsus", title: "WSUS · Cobertura vs CMDB", size: "col-span-1 md:col-span-2 lg:col-span-3" },
  {
    id: "vulns",
    title: "Vulnerabilidades fora do prazo",
    size: "col-span-1 md:col-span-2 lg:col-span-6",
  },
  {
    id: "manuais",
    title: "Detalhamento de Não Conformidades",
    size: "col-span-1 md:col-span-2 lg:col-span-6",
  },
  {
    id: "chamados",
    title: "Chamados Atrasados · SI",
    size: "col-span-1 md:col-span-2 lg:col-span-6",
  },
];
const BLOCK_ICON: Record<string, React.ReactNode> = {
  kpis: <Activity size={12} color={T.textMuted} />,
  skip: <Shield size={12} color={T.purple} />,
  rdp: <RadioTower size={12} color={T.purple} />,
  indisp: <MonitorOff size={12} color={T.warning} />,
  sophos: <Laptop size={12} color={T.danger} />,
  wsus: <Server size={12} color={T.accent} />,
  vulns: <ShieldAlert size={12} color={T.danger} />,
  manuais: <FileWarning size={12} color={T.warning} />,
  chamados: <Ticket size={12} color={T.cyan} />,
};

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════
export function NaoConformidadeDashboard() {
  // ── back-end UNCHANGED ─────────────────────────────────────────────────────
  const qc = useQueryClient();
  const { can, isAdmin, isModuleAdmin } = usePermissions();
  const canCreate = isAdmin || isModuleAdmin("nao-conformidade") || can("nao-conformidade", "create");
  const canEdit = isAdmin || isModuleAdmin("nao-conformidade") || can("nao-conformidade", "edit");
  const canDelete = isAdmin || isModuleAdmin("nao-conformidade") || can("nao-conformidade", "delete");

  const listIndisp = useServerFn(listIndisponibilidades);
  const fetchSophos = useServerFn(getSophosEncryptionDetail);
  const fetchWsus = useServerFn(getWsusOverview);
  const fetchSkipRules = useServerFn(listAllSkipCustomRules);
  const fetchSkipCounts = useServerFn(getSkipCountsByRule);
  const fetchManuais = useServerFn(listNaoConformidadesManuais);
  const deleteManualFn = useServerFn(deleteNaoConformidadeManual);
  const fetchChamados = useServerFn(listNaoConformidadeChamados);
  const deleteChamadoFn = useServerFn(deleteNaoConformidadeChamado);

  const eps = useQuery({
    queryKey: ["nc-eps", "breach-7d"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      // Janela de 7 dias: % de vezes que o EPS ultrapassou o limite licenciado.
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const licensed = LICENSED_EPS;

      const [totalRes, breachRes, lastRes] = await Promise.all([
        // total de amostras no período
        supabase.from("qradar_eps_samples").select("*", { count: "exact", head: true }).gte("sampled_at", since),
        // amostras que ultrapassaram o limite
        supabase
          .from("qradar_eps_samples")
          .select("*", { count: "exact", head: true })
          .gte("sampled_at", since)
          .gt("total_eps", licensed),
        // última amostra (para mostrar o EPS atual no hint)
        supabase
          .from("qradar_eps_samples")
          .select("total_eps")
          .gte("sampled_at", since)
          .order("sampled_at", { ascending: false })
          .limit(1),
      ]);
      if (totalRes.error) throw totalRes.error;
      if (breachRes.error) throw breachRes.error;

      const totalSamples = totalRes.count ?? 0;
      const breaches = breachRes.count ?? 0;
      const current = Number(lastRes.data?.[0]?.total_eps ?? 0);
      const breachPct = totalSamples > 0 ? Math.round((breaches / totalSamples) * 100) : 0;
      return { current, licensed, breaches, totalSamples, breachPct };
    },
  });

  const rdp = useQuery({
    queryKey: ["nc-rdp"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
      const { data, error } = await supabase
        .from("qradar_rdp_events")
        .select("username, event_time")
        .gte("event_time", since)
        .order("event_time", { ascending: false })
        .limit(2000);
      if (error) throw error;
      const counts = new Map<string, number>();
      for (const r of data ?? []) {
        const u = (r.username ?? "—").trim() || "—";
        counts.set(u, (counts.get(u) ?? 0) + 1);
      }
      const byUser = Array.from(counts.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([user, count]) => ({ user, count }));
      const recent = (data ?? []).slice(0, 50).map((r) => ({
        user: (r.username ?? "—").trim() || "—",
        time: r.event_time as string,
      }));
      return { byUser, recent };
    },
  });

  const skipRules = useQuery({
    queryKey: ["nc-cf-skip-rules"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const r = await fetchSkipRules();
      return r.ok ? r : { rules: [], total: 0 };
    },
  });

  const indisp = useQuery({
    queryKey: ["nc-indisp"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const rows = await listIndisp();
      return (rows as any[]).filter((r) => !r.fim);
    },
  });

  const sophos = useQuery({
    queryKey: ["nc-sophos"],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      const r = await fetchSophos();
      if (!("ok" in r) || r.ok === false) return null;
      return r;
    },
  });

  const wsus = useQuery({
    queryKey: ["nc-wsus"],
    staleTime: 10 * 60_000,
    queryFn: async () => await fetchWsus(),
  });

  const manuais = useQuery({
    queryKey: ["nao-conformidades-manuais"],
    staleTime: 60_000,
    queryFn: () => fetchManuais() as Promise<NaoConformidadeManualRow[]>,
  });
  const [manualDialogOpen, setManualDialogOpen] = React.useState(false);
  const [editingManual, setEditingManual] = React.useState<NaoConformidadeManualRow | null>(null);
  const deleteManual = useMutation({
    mutationFn: (id: string) => deleteManualFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Registro removido");
      qc.invalidateQueries({ queryKey: ["nao-conformidades-manuais"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const chamados = useQuery({
    queryKey: ["nao-conformidade-chamados"],
    staleTime: 60_000,
    queryFn: () => fetchChamados() as Promise<NaoConformidadeChamadoRow[]>,
  });
  const [chamadoDialogOpen, setChamadoDialogOpen] = React.useState(false);
  const [editingChamado, setEditingChamado] = React.useState<NaoConformidadeChamadoRow | null>(null);
  const deleteChamado = useMutation({
    mutationFn: (id: string) => deleteChamadoFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Chamado removido");
      qc.invalidateQueries({ queryKey: ["nao-conformidade-chamados"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const vulns = useQuery({
    queryKey: ["nc-vulns-fora"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const cols = "id, fqdn, severity, status, identified_at, department_id, kind";
      const [apl, inf] = await Promise.all([
        supabase.from("vulnerabilities_aplicacao").select(cols).neq("status", "Fechada").neq("status", "Mitigada"),
        supabase.from("vulnerabilities_infra").select(cols).neq("status", "Fechada").neq("status", "Mitigada"),
      ]);
      const rows = [...(apl.data ?? []), ...(inf.data ?? [])] as VulnRow[];
      return rows
        .map((v) => ({ v, ...isForaDoPrazo(v) }))
        .filter((x) => x.fora)
        .sort((a, b) => b.atraso - a.atraso);
    },
  });

  // Filtro de severidade do detalhamento (clique nos chips); null = todas.
  const [sevFiltro, setSevFiltro] = React.useState<string | null>(null);

  const skipCounts = useQuery({
    queryKey: ["nc-cf-skip-counts"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const r = await fetchSkipCounts();
      return r.ok ? r.counts : {};
    },
  });

  // ── Layout dos blocos (redimensionar/arrastar/salvar) ──────────────────────
  const [blocks, setBlocks] = React.useState<NcBlock[]>(DEFAULT_BLOCKS);
  const [draggedId, setDraggedId] = React.useState<string | null>(null);

  React.useEffect(() => {
    const saved = localStorage.getItem(NC_STORAGE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as NcBlock[];
      setBlocks((prev) => {
        const known = parsed.filter((b) => prev.some((p) => p.id === b.id));
        const missing = prev.filter((b) => !known.some((k) => k.id === b.id));
        return [...known, ...missing];
      });
    } catch {
      /* ignora layout inválido */
    }
  }, []);

  const saveLayout = (cur: NcBlock[]) => {
    try {
      localStorage.setItem(NC_STORAGE_KEY, JSON.stringify(cur));
    } catch {
      /* ignora */
    }
  };

  const changeBlockSize = (id: string, action: "grow" | "shrink") => {
    const next = blocks.map((b) => {
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
    setBlocks(next);
    saveLayout(next);
  };

  const handleDragOver = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) return;
    const from = blocks.findIndex((b) => b.id === draggedId);
    const to = blocks.findIndex((b) => b.id === targetId);
    if (from < 0 || to < 0) return;
    const next = [...blocks];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    setBlocks(next);
    saveLayout(next);
  };

  // ── Derivações ─────────────────────────────────────────────────────────────
  const indispByType = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const r of indisp.data ?? []) {
      const t = (r.ativo_tipo ?? "—") || "—";
      m.set(t, (m.get(t) ?? 0) + 1);
    }
    return Array.from(m.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value);
  }, [indisp.data]);

  const vulnsBySev = React.useMemo(() => {
    const order = ["Crítica", "Alta", "Média", "Baixa"];
    const m = new Map<string, number>();
    for (const x of vulns.data ?? []) m.set(x.v.severity, (m.get(x.v.severity) ?? 0) + 1);
    return order.filter((s) => m.has(s)).map((s) => ({ sev: s, value: m.get(s) ?? 0, fill: sevColor(s) }));
  }, [vulns.data]);

  const wsusFailures = React.useMemo(
    () => (wsus.data?.details ?? []).filter((d: any) => d.failed > 0).slice(0, 15),
    [wsus.data],
  );

  const sophosEnc = sophos.data?.encryption?.endpoints;
  const unencList = sophos.data?.unencryptedList ?? [];

  const criticasAltas = vulns.data
    ? vulns.data.filter((x) => x.v.severity === "Crítica" || x.v.severity === "Alta").length
    : null;

  // Chamados "fora do prazo": mais de 5 dias em aberto (precisam ter data de abertura).
  const chamadosForaPrazo = chamados.data
    ? chamados.data.filter((c) => c.data_abertura && daysBetween(new Date(c.data_abertura), new Date()) > 5).length
    : null;

  // Detalhamento respeitando o filtro de severidade (mantém a ordem por atraso).
  const vulnsFiltradas = sevFiltro ? (vulns.data ?? []).filter((x) => x.v.severity === sevFiltro) : (vulns.data ?? []);

  // ── Conteúdo de cada bloco ─────────────────────────────────────────────────
  const renderBlockBody = (id: string): React.ReactNode => {
    switch (id) {
      case "kpis":
        return (
          <div className="nc-kpi-grid">
            <div
              className="nc-kpi"
              style={
                {
                  "--kc": eps.data && eps.data.breaches > 0 ? T.danger : T.success,
                  "--ki-bg": "rgba(59,130,246,0.18)",
                } as React.CSSProperties
              }
            >
              <div className="nc-kpi-icon">
                <Activity size={22} color={T.accent} />
              </div>
              <div className="nc-kpi-label">EPS Excedente · SOC</div>
              <div className="nc-kpi-value">{eps.data ? `${eps.data.breachPct}%` : "—"}</div>
              <div className="nc-kpi-hint">
                {eps.data
                  ? `${eps.data.breaches} de ${eps.data.totalSamples} amostras acima · ${eps.data.current.toLocaleString("pt-BR")}/${eps.data.licensed.toLocaleString("pt-BR")} EPS`
                  : "carregando…"}
              </div>
            </div>

            <div
              className="nc-kpi"
              style={
                {
                  "--kc": (indisp.data?.length ?? 0) > 0 ? T.warning : T.success,
                  "--ki-bg": "rgba(245,158,11,0.2)",
                } as React.CSSProperties
              }
            >
              <div className="nc-kpi-icon">
                <MonitorOff size={22} color={T.warning} />
              </div>
              <div className="nc-kpi-label">Dispositivos Indisponíveis</div>
              <div className="nc-kpi-value">{indisp.data?.length ?? "—"}</div>
              <div className="nc-kpi-hint">em aberto</div>
            </div>

            <div
              className="nc-kpi"
              style={
                {
                  "--kc": (criticasAltas ?? 0) > 0 ? T.danger : T.success,
                  "--ki-bg": "rgba(239,68,68,0.18)",
                } as React.CSSProperties
              }
            >
              <div className="nc-kpi-icon">
                <ShieldAlert size={22} color={T.danger} />
              </div>
              <div className="nc-kpi-label">Vulns Fora do Prazo</div>
              <div className="nc-kpi-value">{criticasAltas ?? "—"}</div>
              <div className="nc-kpi-hint">críticas e altas · SLA estourado</div>
            </div>

            <div
              className="nc-kpi"
              style={
                {
                  "--kc": (skipRules.data?.total ?? 0) > 0 ? T.warning : T.success,
                  "--ki-bg": "rgba(167,139,250,0.18)",
                } as React.CSSProperties
              }
            >
              <div className="nc-kpi-icon">
                <Shield size={22} color={T.purple} />
              </div>
              <div className="nc-kpi-label">Custom Rules SKIP · CF</div>
              <div className="nc-kpi-value">{skipRules.data?.total ?? "—"}</div>
              <div className="nc-kpi-hint">ações permissivas</div>
            </div>

            <div
              className="nc-kpi"
              style={
                {
                  "--kc": (chamadosForaPrazo ?? 0) > 0 ? T.danger : T.success,
                  "--ki-bg": "rgba(34,211,238,0.18)",
                } as React.CSSProperties
              }
            >
              <div className="nc-kpi-icon">
                <Ticket size={22} color={T.cyan} />
              </div>
              <div className="nc-kpi-label">Chamados Atrasados · SI</div>
              <div className="nc-kpi-value">{chamadosForaPrazo ?? "—"}</div>
              <div className="nc-kpi-hint">mais de 5 dias em aberto</div>
            </div>
          </div>
        );

      case "skip":
        return !skipRules.data || skipRules.data.rules.length === 0 ? (
          skipRules.isLoading ? (
            <Loading />
          ) : (
            <div className="nc-empty">Nenhuma regra SKIP encontrada.</div>
          )
        ) : (
          (() => {
            const rulesWithCounts = skipRules.data.rules
              .map((r) => ({ ...r, reqs: r.ruleId ? (skipCounts.data?.[r.ruleId] ?? 0) : 0 }))
              .sort((a, b) => b.reqs - a.reqs);
            const maxReqs = rulesWithCounts[0]?.reqs ?? 0;
            return (
              <div className="nc-skip-grid">
                {rulesWithCounts.map((r, i) => {
                  const pct = maxReqs > 0 ? (r.reqs / maxReqs) * 100 : 0;
                  const barColor = r.reqs > maxReqs * 0.66 ? T.danger : r.reqs > 0 ? T.warning : T.border;
                  const countColor = r.reqs > maxReqs * 0.66 ? T.danger : r.reqs > 0 ? T.warning : T.textMuted;
                  return (
                    <div key={i} className="nc-skip-card">
                      <div
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          justifyContent: "space-between",
                          gap: 8,
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div className="nc-skip-name" title={r.ruleName}>
                            {r.ruleName}
                          </div>
                          <div className="nc-skip-zone" title={r.zone}>
                            {r.zone}
                          </div>
                        </div>
                        <span className="nc-badge warning">SKIP</span>
                      </div>
                      <div>
                        <div
                          style={{
                            display: "flex",
                            alignItems: "baseline",
                            justifyContent: "space-between",
                            gap: 8,
                            marginBottom: 5,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 9,
                              color: T.textMuted,
                              textTransform: "uppercase",
                              letterSpacing: "0.1em",
                              fontFamily: "'IBM Plex Mono',monospace",
                            }}
                          >
                            req 24h
                          </span>
                          <span
                            style={{
                              fontSize: 17,
                              fontWeight: 700,
                              fontFamily: "'Space Grotesk',sans-serif",
                              lineHeight: 1,
                              color: countColor,
                            }}
                          >
                            {r.reqs.toLocaleString("pt-BR")}
                          </span>
                        </div>
                        <div
                          style={{
                            width: "100%",
                            height: 6,
                            background: "rgba(30,38,64,0.5)",
                            borderRadius: 4,
                            overflow: "hidden",
                          }}
                        >
                          <div
                            style={{
                              width: `${pct}%`,
                              height: "100%",
                              borderRadius: 4,
                              background: barColor,
                              transition: "width 0.5s ease",
                            }}
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })()
        );

      case "rdp":
        return (rdp.data?.byUser?.length ?? 0) === 0 ? (
          rdp.isLoading ? (
            <Loading />
          ) : (
            <div className="nc-empty">Nenhum evento de RDP.</div>
          )
        ) : (
          <div className="nc-split">
            <RankBars
              data={(rdp.data?.byUser ?? []).map((u) => ({ label: u.user, value: u.count }))}
              maxVal={Math.max(...(rdp.data?.byUser ?? []).map((u) => u.count), 1)}
              colorFor={(_, i) => (i === 0 ? T.purple : T.accent)}
            />
            <div className="nc-list" style={{ maxHeight: 260 }}>
              {(rdp.data?.recent ?? []).map((r, i) => (
                <div key={i} className="nc-list-row">
                  <span className="nc-list-name">{r.user}</span>
                  <span className="nc-list-meta">
                    {new Date(r.time).toLocaleString("pt-BR", {
                      day: "2-digit",
                      month: "2-digit",
                      hour: "2-digit",
                      minute: "2-digit",
                    })}
                  </span>
                </div>
              ))}
            </div>
          </div>
        );

      case "indisp":
        return indispByType.length === 0 ? (
          indisp.isLoading ? (
            <Loading />
          ) : (
            <div className="nc-empty">Nenhum dispositivo indisponível.</div>
          )
        ) : (
          <div className="nc-split">
            <RankBars
              data={indispByType.map((d) => ({ label: d.name, value: d.value }))}
              maxVal={Math.max(...indispByType.map((d) => d.value), 1)}
              colorFor={(_, i) => (i === 0 ? T.danger : T.warning)}
            />
            <div className="nc-list" style={{ maxHeight: 260 }}>
              {(indisp.data ?? []).slice(0, 12).map((r) => (
                <div key={r.id} className="nc-list-row">
                  <div style={{ minWidth: 0 }}>
                    <div className="nc-list-name">{r.ativo_nome}</div>
                    <div className="nc-list-meta">{r.ativo_tipo}</div>
                  </div>
                  <span className="nc-badge warning">offline</span>
                </div>
              ))}
            </div>
          </div>
        );

      case "sophos":
        return !sophosEnc ? (
          <Loading />
        ) : (
          <>
            {(() => {
              const enc = sophosEnc.encrypted;
              const unenc = sophosEnc.unencrypted;
              const total = enc + unenc;
              return (
                <>
                  <div className="nc-enc-tile bad">
                    <div className="nc-enc-tile-label" style={{ color: T.danger }}>
                      <ShieldAlert size={11} /> Não criptografados
                    </div>
                    <div className="nc-enc-tile-num" style={{ color: T.danger }}>
                      {unenc.toLocaleString("pt-BR")}
                    </div>
                    <div className="nc-enc-tile-sub">sem criptografia de disco</div>
                  </div>
                  <div className="nc-enc-meta">
                    <span>de {total.toLocaleString("pt-BR")} endpoints monitorados</span>
                  </div>
                </>
              );
            })()}
            {unencList.length > 0 && (
              <div className="nc-list" style={{ maxHeight: 160, marginTop: 14 }}>
                {unencList.map((d, i) => (
                  <div key={i} className="nc-list-row">
                    <span className="nc-list-name mono">{d.hostname}</span>
                    <span className="nc-list-meta">{d.type ?? "—"}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        );

      case "wsus":
        return !wsus.data ? (
          <Loading />
        ) : (
          <>
            {(() => {
              const covered = wsus.data.coveredCount;
              const total = wsus.data.cmdbActiveServers;
              const uncovered = Math.max(0, total - covered);
              const covPct = total > 0 ? (covered / total) * 100 : 0;
              const uncovPct = total > 0 ? (uncovered / total) * 100 : 0;
              return (
                <>
                  <div className="nc-cov-head">
                    <span className="nc-cov-label">
                      {covered} de {total} servidores cobertos
                    </span>
                    <span className={`nc-badge ${wsus.data.coveragePct >= 85 ? "success" : "warning"}`}>
                      {wsus.data.coveragePct.toFixed(1)}%
                    </span>
                  </div>
                  <div className="nc-cov-bar">
                    {covPct > 0 && (
                      <div className="nc-cov-seg" style={{ width: `${covPct}%`, background: T.success }}>
                        {covPct >= 14 ? <span className="nc-cov-val">{covered}</span> : null}
                      </div>
                    )}
                    {uncovPct > 0 && (
                      <div className="nc-cov-seg" style={{ width: `${uncovPct}%`, background: T.danger }}>
                        {uncovPct >= 14 ? <span className="nc-cov-val">{uncovered}</span> : null}
                      </div>
                    )}
                  </div>
                  <div className="nc-enc-meta">
                    <span style={{ color: T.success }}>● Cobertos {covered}</span>
                    <span style={{ color: T.danger }}>● Descobertos {uncovered}</span>
                  </div>
                </>
              );
            })()}
            <div
              style={{
                fontSize: 10,
                color: T.textMuted,
                fontFamily: "'IBM Plex Mono',monospace",
                margin: "16px 0 8px",
              }}
            >
              Servidores com falha ({wsusFailures.length})
            </div>
            <div className="nc-list" style={{ maxHeight: 170 }}>
              {wsusFailures.length === 0 ? (
                <div style={{ fontSize: 12, color: T.textMuted }}>Nenhuma falha reportada.</div>
              ) : (
                wsusFailures.map((d: any, i: number) => (
                  <div key={i} className="nc-list-row">
                    <span className="nc-list-name mono">{d.computer_name}</span>
                    <span className="nc-badge danger">{d.failed} falhas</span>
                  </div>
                ))
              )}
            </div>
          </>
        );

      case "vulns":
        return (
          <>
            {vulnsBySev.length > 0 && (
              <div className="nc-sev-row">
                {vulnsBySev.map((d) => {
                  const active = sevFiltro === d.sev;
                  return (
                    <div
                      key={d.sev}
                      className="nc-sev-chip"
                      onClick={() => setSevFiltro((prev) => (prev === d.sev ? null : d.sev))}
                      title={active ? "Remover filtro" : `Filtrar por ${d.sev}`}
                      style={
                        {
                          "--sc": d.fill,
                          cursor: "pointer",
                          opacity: sevFiltro && !active ? 0.45 : 1,
                          boxShadow: active ? `0 0 0 2px ${d.fill}` : undefined,
                          transition: "opacity .15s, box-shadow .15s",
                        } as React.CSSProperties
                      }
                    >
                      <div className="nc-sev-chip-label">{d.sev}</div>
                      <div className="nc-sev-chip-num">{d.value}</div>
                    </div>
                  );
                })}
              </div>
            )}
            {vulns.isLoading ? (
              <Loading />
            ) : (vulns.data?.length ?? 0) === 0 ? (
              <div
                className="nc-empty"
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 10 }}
              >
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: T.successBg,
                    border: "1px solid rgba(16,185,129,0.3)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Shield size={18} color={T.success} />
                </div>
                Nenhuma vulnerabilidade fora do prazo.
              </div>
            ) : (
              <div className="nc-table-wrap" style={{ maxHeight: 320, overflowY: "auto" }}>
                <table className="nc-table">
                  <thead>
                    <tr>
                      <th style={{ paddingLeft: 4 }}>FQDN</th>
                      <th>Severidade</th>
                      <th>Identificada</th>
                      <th style={{ textAlign: "right" }}>Atraso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vulnsFiltradas.map((x) => (
                      <tr key={x.v.id}>
                        <td className="mono nc-trunc" style={{ paddingLeft: 4, color: T.textPrimary }}>
                          {x.v.fqdn ?? "—"}
                        </td>
                        <td>
                          <span
                            className={`nc-badge ${x.v.severity === "Crítica" ? "danger" : x.v.severity === "Alta" ? "warning" : "info"}`}
                          >
                            {x.v.severity}
                          </span>
                        </td>
                        <td className="mono dim">
                          {x.v.identified_at ? new Date(x.v.identified_at).toLocaleDateString("pt-BR") : "—"}
                        </td>
                        <td style={{ textAlign: "right" }}>
                          <span className="nc-badge danger">{x.atraso}d</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        );

      case "manuais":
        return manuais.isLoading ? (
          <Loading />
        ) : (manuais.data?.length ?? 0) === 0 ? (
          <div className="nc-empty">
            Nenhuma não conformidade cadastrada.
            {canCreate && ' Clique em "Adicionar" para começar.'}
          </div>
        ) : (
          <div className="nc-table-wrap">
            <table className="nc-table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 20 }}>Plataforma</th>
                  <th>Fora de Compliance</th>
                  <th>Prazo de Resolução</th>
                  <th>Observações</th>
                  <th>Aceite de Risco</th>
                  <th>Evidências</th>
                  <th>Impactos</th>
                  <th>Data de Configuração</th>
                  {(canEdit || canDelete) && <th style={{ width: 80 }} />}
                </tr>
              </thead>
              <tbody>
                {(manuais.data ?? []).map((r) => (
                  <tr key={r.id}>
                    <td
                      style={{
                        paddingLeft: 20,
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        color: T.textPrimary,
                      }}
                    >
                      {r.plataforma}
                    </td>
                    <td className="dim nc-trunc" style={{ maxWidth: 220 }} title={r.fora_compliance}>
                      {r.fora_compliance}
                    </td>
                    <td className="mono" style={{ whiteSpace: "nowrap" }}>
                      {fmtDateBR(r.prazo_resolucao)}
                    </td>
                    <td className="dim nc-trunc" title={r.observacoes ?? ""}>
                      {r.observacoes ?? "—"}
                    </td>
                    <td style={{ whiteSpace: "nowrap" }}>
                      {r.aceite_risco ? (
                        <span
                          className={`nc-badge ${r.aceite_risco === "Aceito" ? "warning" : r.aceite_risco === "Não aceito" ? "danger" : "info"}`}
                        >
                          {r.aceite_risco}
                        </span>
                      ) : (
                        "—"
                      )}
                    </td>
                    <td className="dim nc-trunc" title={r.evidencias ?? ""}>
                      {r.evidencias ?? "—"}
                    </td>
                    <td className="dim nc-trunc" title={r.impactos ?? ""}>
                      {r.impactos ?? "—"}
                    </td>
                    <td className="mono" style={{ whiteSpace: "nowrap" }}>
                      {fmtDateBR(r.data_configuracao)}
                    </td>
                    {(canEdit || canDelete) && (
                      <td>
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
                          {canEdit && (
                            <button
                              className="nc-icon-btn"
                              title="Editar"
                              onClick={() => {
                                setEditingManual(r);
                                setManualDialogOpen(true);
                              }}
                            >
                              <Pencil className="size-4" />
                            </button>
                          )}
                          {canDelete && (
                            <button
                              className="nc-icon-btn danger"
                              title="Remover"
                              onClick={() => {
                                if (confirm(`Remover não conformidade de "${r.plataforma}"?`))
                                  deleteManual.mutate(r.id);
                              }}
                            >
                              <Trash2 className="size-4" />
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
        );

      case "chamados":
        return chamados.isLoading ? (
          <Loading />
        ) : (chamados.data?.length ?? 0) === 0 ? (
          <div className="nc-empty">
            Nenhum chamado cadastrado.
            {canCreate && ' Clique em "Adicionar" para começar.'}
          </div>
        ) : (
          <div className="nc-table-wrap">
            <table className="nc-table">
              <thead>
                <tr>
                  <th style={{ paddingLeft: 20 }}>Chamado</th>
                  <th>Descrição</th>
                  <th>Data de Abertura</th>
                  <th>Dias em Aberto</th>
                  <th>Responsável</th>
                  <th>Impacto</th>
                  {(canEdit || canDelete) && <th style={{ width: 80 }} />}
                </tr>
              </thead>
              <tbody>
                {(chamados.data ?? []).map((r) => {
                  const dias = r.data_abertura ? daysBetween(new Date(r.data_abertura), new Date()) : null;
                  // Fora do prazo = mais de 5 dias em aberto → vermelho; até 5 dias → verde (dentro do prazo).
                  const diasTone = dias == null ? "neutral" : dias > 5 ? "danger" : "success";
                  return (
                    <tr key={r.id}>
                      <td style={{ paddingLeft: 20, fontWeight: 600, whiteSpace: "nowrap", color: T.textPrimary }}>
                        {r.chamado}
                      </td>
                      <td className="dim nc-trunc" style={{ maxWidth: 260 }} title={r.descricao ?? ""}>
                        {r.descricao ?? "—"}
                      </td>
                      <td className="mono" style={{ whiteSpace: "nowrap" }}>
                        {fmtDateBR(r.data_abertura)}
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>
                        {dias == null ? "—" : <span className={`nc-badge ${diasTone}`}>{dias} d</span>}
                      </td>
                      <td className="dim nc-trunc" style={{ maxWidth: 220 }} title={r.responsavel ?? ""}>
                        {r.responsavel ?? "—"}
                      </td>
                      <td className="dim nc-trunc" style={{ maxWidth: 320 }} title={r.impacto ?? ""}>
                        {r.impacto ?? "—"}
                      </td>
                      {(canEdit || canDelete) && (
                        <td>
                          <div style={{ display: "flex", justifyContent: "flex-end", gap: 4 }}>
                            {canEdit && (
                              <button
                                className="nc-icon-btn"
                                title="Editar"
                                onClick={() => {
                                  setEditingChamado(r);
                                  setChamadoDialogOpen(true);
                                }}
                              >
                                <Pencil className="size-4" />
                              </button>
                            )}
                            {canDelete && (
                              <button
                                className="nc-icon-btn danger"
                                title="Remover"
                                onClick={() => {
                                  if (confirm(`Remover chamado "${r.chamado}"?`)) deleteChamado.mutate(r.id);
                                }}
                              >
                                <Trash2 className="size-4" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        );

      default:
        return null;
    }
  };

  // Contagem exibida ao lado do título de cada bloco.
  const renderHeaderCount = (id: string): React.ReactNode => {
    if (id === "skip") return <span className="nc-panel-count">({skipRules.data?.total ?? 0})</span>;
    if (id === "indisp") return <span className="nc-panel-count">({indisp.data?.length ?? 0})</span>;
    if (id === "vulns")
      return (
        <span className="nc-panel-count">
          ({vulns.data?.length ?? 0} total · {criticasAltas ?? 0} críticas/altas)
        </span>
      );
    if (id === "manuais") return <span className="nc-panel-count">({manuais.data?.length ?? 0})</span>;
    if (id === "chamados") return <span className="nc-panel-count">({chamados.data?.length ?? 0})</span>;
    return null;
  };

  return (
    <div className="nc-root nc-fadeup">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-6 gap-4">
        {blocks.map((block) => (
          <div
            key={block.id}
            draggable
            onDragStart={() => setDraggedId(block.id)}
            onDragOver={(e) => handleDragOver(e, block.id)}
            onDragEnd={() => setDraggedId(null)}
            className={`${block.size} nc-panel${draggedId === block.id ? " nc-dragging" : ""}`}
          >
            <div className="nc-panel-hdr">
              <div className="nc-panel-title">
                <GripHorizontal size={11} color={T.textMuted} />
                {BLOCK_ICON[block.id]}
                {block.title}
                {renderHeaderCount(block.id)}
              </div>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {block.id === "manuais" && canCreate && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditingManual(null);
                      setManualDialogOpen(true);
                    }}
                  >
                    <Plus className="size-4 mr-1" /> Adicionar
                  </Button>
                )}
                {block.id === "chamados" && canCreate && (
                  <Button
                    size="sm"
                    onClick={() => {
                      setEditingChamado(null);
                      setChamadoDialogOpen(true);
                    }}
                  >
                    <Plus className="size-4 mr-1" /> Adicionar
                  </Button>
                )}
                <div className="nc-resize-ctrl">
                  <button
                    className="nc-resize-btn"
                    onClick={() => changeBlockSize(block.id, "shrink")}
                    title="Diminuir"
                  >
                    <Minimize2 size={12} />
                  </button>
                  <button className="nc-resize-btn" onClick={() => changeBlockSize(block.id, "grow")} title="Aumentar">
                    <Maximize2 size={12} />
                  </button>
                </div>
              </div>
            </div>
            <div className="nc-panel-body">{renderBlockBody(block.id)}</div>
          </div>
        ))}
      </div>

      <NaoConformidadeManualDialog open={manualDialogOpen} onOpenChange={setManualDialogOpen} editing={editingManual} />
      <NaoConformidadeChamadoDialog
        open={chamadoDialogOpen}
        onOpenChange={setChamadoDialogOpen}
        editing={editingChamado}
      />
    </div>
  );
}
