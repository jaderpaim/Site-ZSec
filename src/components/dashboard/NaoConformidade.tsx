import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  Loader2,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { usePermissions } from "@/lib/use-permissions";
import { listIndisponibilidades, type IndisponibilidadeRow } from "@/lib/disponibilidade.functions";
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
import { DetailList, DetailSection, DetailSheet } from "@/components/layout/DetailSheet";
import { NaoConformidadeManualDialog } from "./nao-conformidade/NaoConformidadeManualDialog";
import { NaoConformidadeChamadoDialog } from "./nao-conformidade/NaoConformidadeChamadoDialog";

const LICENSED_EPS = 2000;
const SLA_DAYS: Record<string, number> = { Crítica: 5, Alta: 8, Média: 30, Baixa: 60 };
const CHAMADO_PRAZO_DIAS = 5;
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
  return `${day.slice(0, 2)}/${m}/${y}`;
}
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const nf = (n: number) => n.toLocaleString("pt-BR");
const SEVERIDADES = ["Crítica", "Alta", "Média", "Baixa"] as const;
const SEV_CLS: Record<string, string> = {
  Crítica: "crit",
  Alta: "high",
  Média: "med",
  Baixa: "low",
};
const SEV_COLOR: Record<string, string> = {
  Crítica: "var(--v2-crit)",
  Alta: "var(--v2-high)",
  Média: "var(--v2-med)",
  Baixa: "var(--v2-low)",
};

// ── CSS (interface v2) ─────────────────────────────────────────────────────────
const CSS = `
  .nc-root { font-family:var(--font-ui); color:var(--v2-fg); display:flex; flex-direction:column; gap:20px; font-size:14px; }
  .nc-root * { box-sizing:border-box; }
  .nc-root ::-webkit-scrollbar { width:6px; height:6px; }
  .nc-root ::-webkit-scrollbar-track { background:transparent; }
  .nc-root ::-webkit-scrollbar-thumb { background:var(--v2-line-strong); border-radius:3px; }
  .nc-root :focus-visible { outline:2px solid var(--v2-accent); outline-offset:2px; }
  .nc-root .mono, .nc-sheet .mono { font-family:var(--font-data); font-size:12.5px; }
  .nc-root .dim, .nc-sheet .dim { color:var(--v2-fg-3); }
  @keyframes nc-spin { to{transform:rotate(360deg)} }
  .nc-spin { animation:nc-spin .8s linear infinite; }

  .nc-ph-title { font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.2; margin:0; }
  .nc-ph-sub { margin:4px 0 0; font-size:13px; color:var(--v2-fg-3); }

  .nc-subnav { display:flex; gap:2px; padding:4px; background:var(--v2-surface-2); border:1px solid var(--v2-line); border-radius:8px; width:fit-content; max-width:100%; flex-wrap:wrap; }
  .nc-subnav button { display:inline-flex; align-items:center; gap:8px; border:1px solid transparent; background:transparent; padding:6px 14px; border-radius:6px; font-size:13px; font-weight:500; color:var(--v2-fg-3); cursor:pointer; font-family:inherit; }
  .nc-subnav button:hover { color:var(--v2-fg); background:var(--v2-hover); }
  .nc-subnav button[aria-selected="true"] { background:var(--v2-surface); color:var(--v2-fg); border-color:var(--v2-line); }
  .nc-subnav .n { font:500 12px var(--font-data); color:var(--v2-fg-3); }

  /* KPIs */
  .nc-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
  .nc-kpi { position:relative; text-align:left; border:0; background:transparent; padding:16px 18px 14px; display:grid; gap:2px; align-content:start; box-shadow:1px 0 0 var(--v2-line), 0 1px 0 var(--v2-line); color:inherit; font-family:inherit; min-width:0; }
  button.nc-kpi { cursor:pointer; }
  button.nc-kpi:hover { background:var(--v2-hover); }
  .nc-kpi-label { font-size:12.5px; color:var(--v2-fg-2); display:flex; align-items:center; gap:6px; }
  .nc-kpi-value { font-size:28px; font-weight:600; letter-spacing:-0.02em; line-height:1.25; font-variant-numeric:tabular-nums; }
  .nc-kpi-value small { font-size:15px; font-weight:500; color:var(--v2-fg-3); margin-left:4px; }
  .nc-kpi-foot { font-size:12px; color:var(--v2-fg-3); }
  .nc-sw { width:8px; height:8px; border-radius:2px; display:inline-block; flex-shrink:0; }
  .nc-meter { height:6px; border-radius:99px; background:var(--v2-surface-2); overflow:hidden; margin:6px 0 2px; display:flex; gap:2px; }
  .nc-meter i { display:block; height:100%; }

  /* Cartões */
  .nc-card { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; min-width:0; overflow:hidden; }
  .nc-card-hdr { padding:14px 18px 10px; }
  .nc-card-title { font-size:14px; font-weight:600; margin:0; }
  .nc-card-sub { margin:2px 0 0; font-size:12.5px; color:var(--v2-fg-3); }
  .nc-empty { padding:28px 16px; text-align:center; color:var(--v2-fg-3); font-size:13px; }
  .nc-toolbar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:12px 18px; border-bottom:1px solid var(--v2-line); }
  .nc-toolbar > b { font-size:14px; font-weight:600; }
  .nc-count { font-weight:400; font-size:13px; color:var(--v2-fg-3); }
  .nc-note { padding:10px 18px 12px; border-top:1px solid var(--v2-line); font-size:12.5px; color:var(--v2-fg-3); }

  /* Lista de controles */
  .nc-ctrl-head, .nc-ctrl-row { display:grid; grid-template-columns:140px minmax(0, 1.1fr) minmax(0, 1.5fr) auto; gap:16px; align-items:center; padding:12px 18px; }
  .nc-ctrl-head { padding-block:8px; font-size:12px; font-weight:500; color:var(--v2-fg-3); border-top:1px solid var(--v2-line); }
  .nc-ctrl-row { border-top:1px solid var(--v2-line); cursor:pointer; width:100%; border-left:0; border-right:0; border-bottom:0; background:transparent; color:inherit; font:inherit; text-align:left; }
  .nc-ctrl-row:hover { background:var(--v2-hover); }
  .nc-ctrl-row .nm b { display:block; font-weight:500; font-size:13.5px; }
  .nc-ctrl-row .nm small { display:block; font-size:12px; color:var(--v2-fg-3); margin-top:2px; }
  .nc-ctrl-row .fd { font-size:13px; color:var(--v2-fg-2); }
  .nc-ctrl-row .fd b { font:600 13px var(--font-data); color:var(--v2-fg); }
  .nc-ctrl-row .go { color:var(--v2-fg-3); display:inline-flex; align-items:center; gap:4px; font-size:12.5px; white-space:nowrap; }
  .nc-ctrl-row:hover .go { color:var(--v2-fg); }
  @media (max-width: 900px) {
    .nc-ctrl-head, .nc-ctrl-row { grid-template-columns:130px minmax(0, 1fr); }
    .nc-ctrl-row .fd { grid-column:1 / -1; }
    .nc-ctrl-row .go, .nc-ctrl-head span:nth-child(n+3) { display:none; }
  }

  /* Pílulas */
  .nc-st, .nc-tag { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; white-space:nowrap; --c:var(--v2-fg-3); background:color-mix(in oklch, var(--c) 14%, transparent); color:color-mix(in oklch, var(--c) 72%, var(--v2-fg)); }
  .nc-st { height:24px; padding:0 9px; }
  .nc-st svg, .nc-tag svg { color:var(--c); }
  .nc-st.ok, .nc-tag.ok { --c:var(--v2-ok); }
  .nc-st.warn, .nc-tag.med { --c:var(--v2-med); }
  .nc-st.bad, .nc-tag.crit { --c:var(--v2-crit); }
  .nc-tag.high { --c:var(--v2-high); } .nc-tag.low { --c:var(--v2-low); }

  /* Tabelas */
  .nc-scroll { overflow:auto; max-height:620px; }
  .nc-table { width:100%; border-collapse:collapse; font-size:13px; }
  .nc-table thead { position:sticky; top:0; z-index:1; }
  .nc-table th { padding:9px 12px; font-size:12px; font-weight:500; color:var(--v2-fg-3); text-align:left; background:var(--v2-surface); border-bottom:1px solid var(--v2-line); white-space:nowrap; }
  .nc-table th.r, .nc-table td.r { text-align:right; }
  .nc-table td { padding:8px 12px; height:46px; border-bottom:1px solid var(--v2-line); vertical-align:middle; }
  .nc-table th:first-child, .nc-table td:first-child { padding-left:18px; }
  .nc-table th:last-child, .nc-table td:last-child { padding-right:18px; }
  .nc-table tbody tr:hover td { background:var(--v2-hover); }
  .nc-table tbody tr:last-child td { border-bottom:none; }
  .nc-table tbody tr.clickable { cursor:pointer; }
  .nc-trunc { display:block; max-width:320px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--v2-fg-2); }
  .nc-late { font:600 12.5px var(--font-data); color:color-mix(in oklch, var(--v2-crit) 78%, var(--v2-fg)); }
  .nc-row-act { display:flex; justify-content:flex-end; gap:2px; }
  .nc-icon-btn { display:grid; place-items:center; width:30px; height:30px; border-radius:8px; border:0; background:transparent; color:var(--v2-fg-2); cursor:pointer; }
  .nc-icon-btn:hover { background:var(--v2-hover); color:var(--v2-fg); }
  .nc-icon-btn.danger:hover { color:var(--v2-crit); background:color-mix(in oklch, var(--v2-crit) 12%, transparent); }
  .nc-sev-chips { display:flex; gap:8px; flex-wrap:wrap; }
  .nc-sev-chips button { display:inline-flex; align-items:center; gap:8px; height:30px; padding:0 12px; border-radius:99px; border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-fg); font-size:13px; cursor:pointer; font-family:inherit; }
  .nc-sev-chips button b { font:600 12.5px var(--font-data); }
  .nc-sev-chips button[aria-pressed="true"] { border-color:var(--v2-accent); background:color-mix(in oklch, var(--v2-accent) 14%, transparent); }

  /* Botões */
  .nc-btn { display:inline-flex; align-items:center; gap:7px; height:32px; padding:0 12px; border-radius:8px; font-size:13px; font-weight:500; cursor:pointer; font-family:var(--font-ui); white-space:nowrap; border:1px solid var(--v2-line); background:var(--v2-surface); color:var(--v2-fg); }
  .nc-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .nc-btn:hover:not(:disabled) { background:var(--v2-hover); }
  .nc-btn.primary { background:var(--v2-accent); border-color:var(--v2-accent); color:var(--v2-accent-ink); }
  .nc-btn.primary:hover:not(:disabled) { background:var(--v2-accent); filter:brightness(1.08); }
  .nc-btn.ghost { background:transparent; border-color:transparent; color:var(--v2-fg-2); }
  .nc-btn.danger { background:var(--v2-crit); border-color:var(--v2-crit); color:#fff; }
  .nc-btn.danger:hover:not(:disabled) { background:var(--v2-crit); filter:brightness(1.08); }
  .nc-btn.danger-text { background:transparent; border-color:transparent; color:var(--v2-crit); margin-right:auto; }
  .nc-btn.danger-text:hover:not(:disabled) { background:color-mix(in oklch, var(--v2-crit) 10%, transparent); }

  /* Painel lateral */
  .nc-bars { display:grid; gap:8px; }
  .nc-bars > div { display:grid; grid-template-columns:minmax(0, 1fr) auto; gap:4px 10px; align-items:center; font-size:13px; }
  .nc-bars > div > span:first-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .nc-bars .n { font:500 12.5px var(--font-data); color:var(--v2-fg-2); }
  .nc-track { grid-column:1 / -1; height:7px; border-radius:99px; background:var(--v2-surface-2); overflow:hidden; }
  .nc-track i { display:block; height:100%; border-radius:99px; }
  .nc-lst { display:grid; border:1px solid var(--v2-line); border-radius:8px; max-height:320px; overflow-y:auto; }
  .nc-lst > div { display:flex; justify-content:space-between; gap:10px; padding:8px 12px; border-bottom:1px solid var(--v2-line); font-size:13px; }
  .nc-lst > div:last-child { border-bottom:0; }
  .nc-lst .m { font:400 12px var(--font-data); color:var(--v2-fg-3); white-space:nowrap; }
  .nc-big { display:flex; align-items:baseline; gap:8px; flex-wrap:wrap; }
  .nc-big b { font-size:28px; font-weight:600; letter-spacing:-0.02em; font-variant-numeric:tabular-nums; }
  .nc-big span { font-size:13px; color:var(--v2-fg-3); }
  .nc-stack { display:flex; height:10px; border-radius:99px; overflow:hidden; gap:2px; background:var(--v2-surface-2); margin-top:8px; }
  .nc-stack i { display:block; height:100%; }
  .nc-txt { font-size:13px; line-height:1.55; color:var(--v2-fg-2); white-space:pre-wrap; padding:10px 12px; border-radius:8px; background:var(--v2-surface-2); border:1px solid var(--v2-line); overflow-wrap:anywhere; }
  .nc-p { margin:0; font-size:13px; color:var(--v2-fg-3); }
  .nc-confirm { display:flex; align-items:center; gap:8px; flex-wrap:wrap; width:100%; font-size:13px; }
  .nc-confirm span { margin-right:auto; color:var(--v2-fg-2); }
`;

type Tab = "controles" | "vulns" | "registros" | "chamados";
type CtrlId = "vulns" | "eps" | "indisp" | "sophos" | "wsus" | "skip" | "rdp" | "cham";
type Status = "ok" | "warn" | "bad" | "na" | "loading";
type Control = { id: CtrlId; nome: string; fonte: string; status: Status; achado: React.ReactNode };

const STATUS_META: Record<
  Status,
  { cls: string; label: string; Icon: React.ElementType; order: number }
> = {
  bad: { cls: "bad", label: "Não conforme", Icon: AlertTriangle, order: 0 },
  warn: { cls: "warn", label: "Atenção", Icon: AlertTriangle, order: 1 },
  ok: { cls: "ok", label: "Conforme", Icon: CheckCircle2, order: 2 },
  na: { cls: "", label: "Sem dados", Icon: CircleDashed, order: 3 },
  loading: { cls: "", label: "Carregando", Icon: CircleDashed, order: 4 },
};
function StatusPill({ s }: { s: Status }) {
  const m = STATUS_META[s];
  return (
    <span className={`nc-st ${m.cls}`}>
      {s === "loading" ? <Loader2 size={11} className="nc-spin" /> : <m.Icon size={11} />} {m.label}
    </span>
  );
}

function Bars({ rows, color }: { rows: Array<[string, number]>; color: string }) {
  const max = Math.max(...rows.map((r) => r[1]), 1);
  return (
    <div className="nc-bars">
      {rows.map(([label, n], i) => (
        <div key={`${label}-${i}`}>
          <span title={label}>{label}</span>
          <span className="n">{nf(n)}</span>
          <span className="nc-track">
            <i style={{ width: `${(n / max) * 100}%`, background: color }} />
          </span>
        </div>
      ))}
    </div>
  );
}
function List({ rows }: { rows: Array<[string, string]> }) {
  return (
    <div className="nc-lst">
      {rows.map(([a, b], i) => (
        <div key={`${a}-${i}`}>
          <span className="mono">{a}</span>
          <span className="m">{b}</span>
        </div>
      ))}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════
export function NaoConformidadeDashboard() {
  // ── back-end UNCHANGED ─────────────────────────────────────────────────────
  const qc = useQueryClient();
  const { can, isAdmin, isModuleAdmin } = usePermissions();
  const canCreate =
    isAdmin || isModuleAdmin("nao-conformidade") || can("nao-conformidade", "create");
  const canEdit = isAdmin || isModuleAdmin("nao-conformidade") || can("nao-conformidade", "edit");
  const canDelete =
    isAdmin || isModuleAdmin("nao-conformidade") || can("nao-conformidade", "delete");

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
        supabase
          .from("qradar_eps_samples")
          .select("*", { count: "exact", head: true })
          .gte("sampled_at", since),
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
      return { byUser, recent, total: (data ?? []).length, users: counts.size };
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
      const rows = (await listIndisp()) as IndisponibilidadeRow[];
      return rows.filter((r) => !r.fim);
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
      setSheet(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const chamados = useQuery({
    queryKey: ["nao-conformidade-chamados"],
    staleTime: 60_000,
    queryFn: () => fetchChamados() as Promise<NaoConformidadeChamadoRow[]>,
  });
  const [chamadoDialogOpen, setChamadoDialogOpen] = React.useState(false);
  const [editingChamado, setEditingChamado] = React.useState<NaoConformidadeChamadoRow | null>(
    null,
  );
  const deleteChamado = useMutation({
    mutationFn: (id: string) => deleteChamadoFn({ data: { id } }),
    onSuccess: () => {
      toast.success("Chamado removido");
      qc.invalidateQueries({ queryKey: ["nao-conformidade-chamados"] });
      setSheet(null);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const vulns = useQuery({
    queryKey: ["nc-vulns-fora"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const cols = "id, fqdn, severity, status, identified_at, department_id, kind";
      const [apl, inf] = await Promise.all([
        supabase
          .from("vulnerabilities_aplicacao")
          .select(cols)
          .neq("status", "Fechada")
          .neq("status", "Mitigada"),
        supabase
          .from("vulnerabilities_infra")
          .select(cols)
          .neq("status", "Fechada")
          .neq("status", "Mitigada"),
      ]);
      const rows = [...(apl.data ?? []), ...(inf.data ?? [])] as VulnRow[];
      return rows
        .map((v) => ({ v, ...isForaDoPrazo(v) }))
        .filter((x) => x.fora)
        .sort((a, b) => b.atraso - a.atraso);
    },
  });

  const skipCounts = useQuery({
    queryKey: ["nc-cf-skip-counts"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const r = await fetchSkipCounts();
      return r.ok ? r.counts : {};
    },
  });
  // ──────────────────────────────────────────────────────────────────────────

  const [tab, setTab] = React.useState<Tab>(() => {
    try {
      const v = localStorage.getItem("nc_tab") as Tab | null;
      return v && ["controles", "vulns", "registros", "chamados"].includes(v) ? v : "controles";
    } catch {
      return "controles";
    }
  });
  const go = (t: Tab) => {
    setTab(t);
    try {
      localStorage.setItem("nc_tab", t);
    } catch {
      /* storage indisponível */
    }
  };
  // Filtro de severidade da lista de vulnerabilidades; null = todas.
  const [sevFiltro, setSevFiltro] = React.useState<string | null>(null);
  // Painel lateral: controle, registro ou chamado (com pedido de exclusão opcional)
  const [sheet, setSheet] = React.useState<
    | { kind: "ctrl"; id: CtrlId }
    | { kind: "reg"; id: string; del: boolean }
    | { kind: "cham"; id: string; del: boolean }
    | null
  >(null);

  // ── Derivações ─────────────────────────────────────────────────────────────
  const hoje = todayIso();
  const vulnList = vulns.data ?? [];
  const criticasAltas = vulnList.filter(
    (x) => x.v.severity === "Crítica" || x.v.severity === "Alta",
  ).length;
  const chamadoDias = (c: NaoConformidadeChamadoRow) =>
    c.data_abertura ? daysBetween(new Date(c.data_abertura), new Date()) : null;
  // Chamados "fora do prazo": mais de 5 dias em aberto (precisam ter data de abertura).
  const chamadosAtrasados = (chamados.data ?? []).filter(
    (c) => (chamadoDias(c) ?? 0) > CHAMADO_PRAZO_DIAS,
  );
  const regVencidos = (manuais.data ?? []).filter(
    (r) => r.prazo_resolucao && r.prazo_resolucao < hoje,
  );
  const sophosEnc = sophos.data?.encryption?.endpoints;
  const unencList = sophos.data?.unencryptedList ?? [];
  const wsusFailures = (wsus.data?.details ?? []).filter((d) => d.failed > 0);
  const skipWithCounts = (skipRules.data?.rules ?? [])
    .map((r) => ({ ...r, reqs: r.ruleId ? (skipCounts.data?.[r.ruleId] ?? 0) : 0 }))
    .sort((a, b) => b.reqs - a.reqs);
  const indispByType = React.useMemo(() => {
    const m = new Map<string, number>();
    for (const r of indisp.data ?? []) {
      const t = (r.ativo_tipo ?? "—") || "—";
      m.set(t, (m.get(t) ?? 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [indisp.data]);

  const st = (loading: boolean, available: boolean, cond: () => Status): Status =>
    loading ? "loading" : !available ? "na" : cond();

  const controls: Control[] = [
    {
      id: "vulns",
      nome: "Vulnerabilidades dentro do prazo",
      fonte: "Gestão de Vulnerabilidades",
      status: st(vulns.isLoading, !!vulns.data, () =>
        criticasAltas > 0 ? "bad" : vulnList.length > 0 ? "warn" : "ok",
      ),
      achado: (
        <>
          <b>{vulnList.length}</b> fora do prazo, <b>{criticasAltas}</b> críticas ou altas
        </>
      ),
    },
    {
      id: "eps",
      nome: "EPS dentro da licença",
      fonte: "IBM QRadar · 7 dias",
      status: st(eps.isLoading, !!eps.data && eps.data.totalSamples > 0, () =>
        eps.data!.breaches > 0 ? "bad" : "ok",
      ),
      achado: eps.data ? (
        <>
          <b>{eps.data.breachPct}%</b> das amostras acima de {nf(eps.data.licensed)} EPS · agora{" "}
          {nf(eps.data.current)}
        </>
      ) : (
        "—"
      ),
    },
    {
      id: "indisp",
      nome: "Ativos disponíveis",
      fonte: "Zabbix e SIEM",
      status: st(indisp.isLoading, !!indisp.data, () =>
        (indisp.data?.length ?? 0) > 0 ? "bad" : "ok",
      ),
      achado: (
        <>
          <b>{indisp.data?.length ?? 0}</b>{" "}
          {indisp.data?.length === 1 ? "ativo indisponível" : "ativos indisponíveis"} agora
        </>
      ),
    },
    {
      id: "sophos",
      nome: "Disco criptografado nos endpoints",
      fonte: "Sophos Central",
      status: st(sophos.isLoading, !!sophosEnc, () => (sophosEnc!.unencrypted > 0 ? "bad" : "ok")),
      achado: sophosEnc ? (
        <>
          <b>{nf(sophosEnc.unencrypted)}</b> de {nf(sophosEnc.encrypted + sophosEnc.unencrypted)}{" "}
          endpoints sem criptografia
        </>
      ) : (
        "Integração Sophos sem dados de criptografia"
      ),
    },
    {
      id: "wsus",
      nome: "Servidores cobertos pelo WSUS",
      fonte: "WSUS × CMDB",
      status: st(wsus.isLoading, !!wsus.data && wsus.data.cmdbActiveServers > 0, () =>
        wsus.data!.coveredCount < wsus.data!.cmdbActiveServers || wsusFailures.length > 0
          ? "warn"
          : "ok",
      ),
      achado: wsus.data ? (
        <>
          <b>{wsus.data.coveragePct.toFixed(1).replace(".", ",")}%</b> cobertos ·{" "}
          {Math.max(0, wsus.data.cmdbActiveServers - wsus.data.coveredCount)} descobertos ·{" "}
          {wsusFailures.length} com falha
        </>
      ) : (
        "—"
      ),
    },
    {
      id: "skip",
      nome: "Sem regras permissivas no WAF",
      fonte: "Cloudflare · ação SKIP",
      status: st(skipRules.isLoading, !!skipRules.data, () =>
        (skipRules.data?.total ?? 0) > 0 ? "warn" : "ok",
      ),
      achado: (
        <>
          <b>{skipRules.data?.total ?? 0}</b> regras SKIP ·{" "}
          {nf(skipWithCounts.reduce((a, r) => a + r.reqs, 0))} requisições em 24 h
        </>
      ),
    },
    {
      id: "rdp",
      nome: "Uso de RDP acompanhado",
      fonte: "IBM QRadar · 7 dias",
      status: st(rdp.isLoading, !!rdp.data, () => ((rdp.data?.total ?? 0) > 0 ? "warn" : "ok")),
      achado: (
        <>
          <b>{nf(rdp.data?.total ?? 0)}</b> acessos de {rdp.data?.users ?? 0} usuários
        </>
      ),
    },
    {
      id: "cham",
      nome: "Chamados de SI no prazo",
      fonte: "Cadastro de chamados",
      status: st(chamados.isLoading, !!chamados.data, () =>
        chamadosAtrasados.length > 0 ? "bad" : "ok",
      ),
      achado: (
        <>
          <b>{chamadosAtrasados.length}</b> de {chamados.data?.length ?? 0} com mais de{" "}
          {CHAMADO_PRAZO_DIAS} dias em aberto
        </>
      ),
    },
  ];
  const sortedControls = [...controls].sort(
    (a, b) => STATUS_META[a.status].order - STATUS_META[b.status].order,
  );
  const okN = controls.filter((c) => c.status === "ok").length;
  const warnN = controls.filter((c) => c.status === "warn").length;
  const badN = controls.filter((c) => c.status === "bad").length;

  const vulnsFiltradas = sevFiltro ? vulnList.filter((x) => x.v.severity === sevFiltro) : vulnList;

  // ── Painel lateral ─────────────────────────────────────────────────────────
  const ctrlOpen = sheet?.kind === "ctrl" ? controls.find((c) => c.id === sheet.id) : null;
  const regOpen =
    sheet?.kind === "reg" ? (manuais.data ?? []).find((r) => r.id === sheet.id) : null;
  const chamOpen =
    sheet?.kind === "cham" ? (chamados.data ?? []).find((c) => c.id === sheet.id) : null;
  const askDelete = sheet && sheet.kind !== "ctrl" ? sheet.del : false;

  const ctrlBody = (id: CtrlId): React.ReactNode => {
    switch (id) {
      case "eps":
        return eps.data ? (
          <>
            <DetailSection title="Últimos 7 dias">
              <div className="nc-big">
                <b>{eps.data.breachPct}%</b>
                <span>das amostras acima da licença</span>
              </div>
              <p className="nc-p" style={{ marginTop: 6 }}>
                {nf(eps.data.breaches)} de {nf(eps.data.totalSamples)} amostras ultrapassaram{" "}
                {nf(eps.data.licensed)} EPS.
              </p>
            </DetailSection>
            <DetailSection title="Agora">
              <DetailList
                items={[
                  ["EPS atual", nf(eps.data.current), true],
                  ["Licença", `${nf(eps.data.licensed)} EPS`, true],
                ]}
              />
            </DetailSection>
          </>
        ) : (
          <p className="nc-p">Sem amostras de EPS.</p>
        );
      case "indisp":
        return (indisp.data?.length ?? 0) === 0 ? (
          <p className="nc-p">Nenhum ativo indisponível.</p>
        ) : (
          <>
            <DetailSection title="Por tipo">
              <Bars rows={indispByType} color="var(--v2-crit)" />
            </DetailSection>
            <DetailSection title="Ativos">
              <List
                rows={(indisp.data ?? []).map((r) => [
                  r.ativo_nome,
                  `${r.ativo_tipo} · desde ${new Date(r.inicio).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}`,
                ])}
              />
            </DetailSection>
          </>
        );
      case "sophos":
        return !sophosEnc ? (
          <p className="nc-p">A integração Sophos não retornou dados de criptografia.</p>
        ) : (
          <>
            <DetailSection title="Endpoints">
              <div className="nc-big">
                <b>{nf(sophosEnc.unencrypted)}</b>
                <span>
                  de {nf(sophosEnc.encrypted + sophosEnc.unencrypted)} endpoints sem criptografia de
                  disco
                </span>
              </div>
            </DetailSection>
            {unencList.length > 0 && (
              <DetailSection title="Sem criptografia">
                <List rows={unencList.map((d) => [d.hostname, d.type ?? "—"])} />
              </DetailSection>
            )}
          </>
        );
      case "wsus": {
        if (!wsus.data) return <p className="nc-p">Sem dados do WSUS.</p>;
        const covered = wsus.data.coveredCount;
        const total = wsus.data.cmdbActiveServers;
        const uncovered = Math.max(0, total - covered);
        return (
          <>
            <DetailSection title="Cobertura">
              <div className="nc-big">
                <b>
                  {covered} de {total}
                </b>
                <span>servidores ativos do CMDB no WSUS</span>
              </div>
              {total > 0 && (
                <div className="nc-stack" aria-hidden="true">
                  <i style={{ width: `${(covered / total) * 100}%`, background: "var(--v2-ok)" }} />
                  <i
                    style={{ width: `${(uncovered / total) * 100}%`, background: "var(--v2-crit)" }}
                  />
                </div>
              )}
            </DetailSection>
            <DetailSection title={`Servidores com falha de atualização · ${wsusFailures.length}`}>
              {wsusFailures.length === 0 ? (
                <p className="nc-p">Nenhuma falha reportada.</p>
              ) : (
                <List rows={wsusFailures.map((d) => [d.computer_name, `${d.failed} falhas`])} />
              )}
            </DetailSection>
          </>
        );
      }
      case "skip":
        return skipWithCounts.length === 0 ? (
          <p className="nc-p">Nenhuma regra com ação SKIP.</p>
        ) : (
          <>
            <DetailSection title="Regras com ação SKIP · requisições em 24 h">
              <Bars
                rows={skipWithCounts.map((r) => [`${r.ruleName} · ${r.zone}`, r.reqs])}
                color="var(--v2-med)"
              />
            </DetailSection>
            <p className="nc-p" style={{ fontSize: 12.5 }}>
              Regras SKIP pulam as proteções do WAF para o tráfego que casam com elas. Revise se
              ainda são necessárias.
            </p>
          </>
        );
      case "rdp":
        return (rdp.data?.byUser.length ?? 0) === 0 ? (
          <p className="nc-p">Nenhum acesso RDP nos últimos 7 dias.</p>
        ) : (
          <>
            <DetailSection title="Usuários · 7 dias">
              <Bars
                rows={(rdp.data?.byUser ?? []).map((u) => [u.user, u.count])}
                color="var(--v2-accent)"
              />
            </DetailSection>
            <DetailSection title="Acessos recentes">
              <List
                rows={(rdp.data?.recent ?? []).map((r) => [
                  r.user,
                  new Date(r.time).toLocaleString("pt-BR", {
                    day: "2-digit",
                    month: "2-digit",
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                ])}
              />
            </DetailSection>
          </>
        );
      case "vulns":
        return (
          <>
            <DetailSection title="Fora do prazo">
              <div className="nc-big">
                <b>{vulnList.length}</b>
                <span>vulnerabilidades com o prazo de correção estourado</span>
              </div>
            </DetailSection>
            {vulnList.length > 0 && (
              <DetailSection title="Por severidade">
                <Bars
                  rows={SEVERIDADES.map(
                    (s) =>
                      [s, vulnList.filter((x) => x.v.severity === s).length] as [string, number],
                  ).filter((r) => r[1] > 0)}
                  color="var(--v2-crit)"
                />
              </DetailSection>
            )}
          </>
        );
      case "cham":
        return chamadosAtrasados.length === 0 ? (
          <p className="nc-p">Nenhum chamado atrasado.</p>
        ) : (
          <DetailSection title="Atrasados">
            <List
              rows={chamadosAtrasados.map((c) => [
                c.chamado,
                `${chamadoDias(c)} dias · ${c.responsavel ?? "—"}`,
              ])}
            />
          </DetailSection>
        );
    }
  };

  const textSection = (title: string, v: string | null) => (
    <DetailSection title={title}>
      {v ? <div className="nc-txt">{v}</div> : <p className="nc-p">Não informado.</p>}
    </DetailSection>
  );
  const aceiteCls = (a: string | null) =>
    a === "Aceito" ? "med" : a === "Não aceito" ? "crit" : "";

  const editFooter = (
    onEdit: () => void,
    onDelete: () => void,
    pending: boolean,
    what: string,
    del: boolean,
  ) =>
    canEdit || canDelete ? (
      del ? (
        <div className="nc-confirm">
          <span>Remover {what}?</span>
          <button
            className="nc-btn ghost"
            onClick={() => setSheet((s) => (s && s.kind !== "ctrl" ? { ...s, del: false } : s))}
            disabled={pending}
          >
            Cancelar
          </button>
          <button className="nc-btn danger" onClick={onDelete} disabled={pending}>
            {pending ? <Loader2 size={13} className="nc-spin" /> : <Trash2 size={13} />} Remover
          </button>
        </div>
      ) : (
        <>
          {canDelete && (
            <button
              className="nc-btn danger-text"
              onClick={() => setSheet((s) => (s && s.kind !== "ctrl" ? { ...s, del: true } : s))}
            >
              Remover
            </button>
          )}
          {canEdit && (
            <button className="nc-btn primary" onClick={onEdit}>
              <Pencil size={13} /> Editar
            </button>
          )}
        </>
      )
    ) : null;

  const TABS: Array<[Tab, string, number | null]> = [
    ["controles", "Controles", null],
    ["vulns", "Vulnerabilidades fora do prazo", vulns.data ? vulnList.length : null],
    ["registros", "Registros", manuais.data ? manuais.data.length : null],
    ["chamados", "Chamados", chamados.data ? chamados.data.length : null],
  ];

  return (
    <div className="nc-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Cabeçalho ────────────────────────────────────────────────────── */}
      <div>
        <h1 className="nc-ph-title">Não conformidade</h1>
        <p className="nc-ph-sub">
          Controles verificados automaticamente nas integrações e desvios registrados pela equipe
        </p>
      </div>

      <div className="nc-subnav" role="tablist" aria-label="Seções">
        {TABS.map(([k, label, n]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} onClick={() => go(k)}>
            {label}
            {n !== null && <span className="n">{n}</span>}
          </button>
        ))}
      </div>

      {/* ══ CONTROLES ═══════════════════════════════════════════════════════ */}
      {tab === "controles" && (
        <>
          <div className="nc-kpis">
            <div className="nc-kpi">
              <span className="nc-kpi-label">Controles conformes</span>
              <span className="nc-kpi-value">
                {okN}
                <small>de {controls.length}</small>
              </span>
              <div className="nc-meter" aria-hidden="true">
                <i
                  style={{ width: `${(okN / controls.length) * 100}%`, background: "var(--v2-ok)" }}
                />
                <i
                  style={{
                    width: `${(warnN / controls.length) * 100}%`,
                    background: "var(--v2-med)",
                  }}
                />
                <i
                  style={{
                    width: `${(badN / controls.length) * 100}%`,
                    background: "var(--v2-crit)",
                  }}
                />
              </div>
              <span className="nc-kpi-foot">
                {badN} não conformes · {warnN} em atenção
              </span>
            </div>
            <button type="button" className="nc-kpi" onClick={() => go("vulns")}>
              <span className="nc-kpi-label">
                {criticasAltas > 0 && (
                  <span className="nc-sw" style={{ background: "var(--v2-crit)" }} />
                )}
                Vulnerabilidades fora do prazo
              </span>
              <span className="nc-kpi-value">{vulns.data ? vulnList.length : "—"}</span>
              <span className="nc-kpi-foot">{criticasAltas} críticas ou altas</span>
            </button>
            <button
              type="button"
              className="nc-kpi"
              onClick={() => setSheet({ kind: "ctrl", id: "indisp" })}
            >
              <span className="nc-kpi-label">
                {(indisp.data?.length ?? 0) > 0 && (
                  <span className="nc-sw" style={{ background: "var(--v2-crit)" }} />
                )}
                Ativos indisponíveis
              </span>
              <span className="nc-kpi-value">{indisp.data?.length ?? "—"}</span>
              <span className="nc-kpi-foot">sem SIEM e sem Zabbix</span>
            </button>
            <button type="button" className="nc-kpi" onClick={() => go("registros")}>
              <span className="nc-kpi-label">
                {regVencidos.length > 0 && (
                  <span className="nc-sw" style={{ background: "var(--v2-med)" }} />
                )}
                Registros abertos
              </span>
              <span className="nc-kpi-value">{manuais.data?.length ?? "—"}</span>
              <span className="nc-kpi-foot">
                {regVencidos.length} com o prazo de resolução vencido
              </span>
            </button>
            <button type="button" className="nc-kpi" onClick={() => go("chamados")}>
              <span className="nc-kpi-label">
                {chamadosAtrasados.length > 0 && (
                  <span className="nc-sw" style={{ background: "var(--v2-crit)" }} />
                )}
                Chamados atrasados
              </span>
              <span className="nc-kpi-value">{chamados.data ? chamadosAtrasados.length : "—"}</span>
              <span className="nc-kpi-foot">de {chamados.data?.length ?? 0} chamados de SI</span>
            </button>
          </div>

          <div className="nc-card">
            <div className="nc-card-hdr">
              <h2 className="nc-card-title">Controles monitorados</h2>
              <p className="nc-card-sub">
                Atualizados a partir do QRadar, Zabbix, Sophos, WSUS, Cloudflare e dos cadastros ·
                clique para ver o detalhe
              </p>
            </div>
            <div className="nc-ctrl-head">
              <span>Status</span>
              <span>Controle</span>
              <span>Situação atual</span>
              <span />
            </div>
            {sortedControls.map((c) => (
              <button
                key={c.id}
                type="button"
                className="nc-ctrl-row"
                onClick={() => setSheet({ kind: "ctrl", id: c.id })}
              >
                <StatusPill s={c.status} />
                <span className="nm">
                  <b>{c.nome}</b>
                  <small>{c.fonte}</small>
                </span>
                <span className="fd">{c.achado}</span>
                <span className="go">
                  Ver detalhe <ChevronRight size={14} />
                </span>
              </button>
            ))}
          </div>
        </>
      )}

      {/* ══ VULNERABILIDADES ════════════════════════════════════════════════ */}
      {tab === "vulns" && (
        <div className="nc-card">
          <div className="nc-toolbar">
            <b>
              Vulnerabilidades fora do prazo{" "}
              <span className="nc-count">
                {vulnsFiltradas.length === vulnList.length
                  ? vulnList.length
                  : `${vulnsFiltradas.length} de ${vulnList.length}`}
              </span>
            </b>
            <div className="nc-sev-chips">
              {SEVERIDADES.map((s) => {
                const n = vulnList.filter((x) => x.v.severity === s).length;
                if (n === 0) return null;
                return (
                  <button
                    key={s}
                    type="button"
                    aria-pressed={sevFiltro === s}
                    onClick={() => setSevFiltro((cur) => (cur === s ? null : s))}
                  >
                    <span className="nc-sw" style={{ background: SEV_COLOR[s] }} /> {s} <b>{n}</b>
                  </button>
                );
              })}
            </div>
          </div>
          {vulns.isLoading ? (
            <div className="nc-empty">Carregando…</div>
          ) : vulnsFiltradas.length === 0 ? (
            <div className="nc-empty">Nenhuma vulnerabilidade fora do prazo.</div>
          ) : (
            <div className="nc-scroll">
              <table className="nc-table">
                <thead>
                  <tr>
                    <th>Ativo (FQDN)</th>
                    <th>Severidade</th>
                    <th>Identificada</th>
                    <th className="r">Prazo</th>
                    <th className="r">Atraso</th>
                  </tr>
                </thead>
                <tbody>
                  {vulnsFiltradas.map((x) => (
                    <tr key={x.v.id}>
                      <td className="mono" style={{ color: "var(--v2-fg)" }}>
                        {x.v.fqdn ?? "—"}
                      </td>
                      <td>
                        <span className={`nc-tag ${SEV_CLS[x.v.severity] ?? ""}`}>
                          {x.v.severity}
                        </span>
                      </td>
                      <td className="mono dim">
                        {x.v.identified_at
                          ? new Date(x.v.identified_at).toLocaleDateString("pt-BR")
                          : "—"}
                      </td>
                      <td className="r mono dim">{SLA_DAYS[x.v.severity] ?? 30} dias</td>
                      <td className="r">
                        <span className="nc-late">{x.atraso} d</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <div className="nc-note">
            Prazo de correção por severidade: Crítica {SLA_DAYS.Crítica} dias · Alta {SLA_DAYS.Alta}{" "}
            · Média {SLA_DAYS.Média} · Baixa {SLA_DAYS.Baixa}.
          </div>
        </div>
      )}

      {/* ══ REGISTROS ═══════════════════════════════════════════════════════ */}
      {tab === "registros" && (
        <div className="nc-card">
          <div className="nc-toolbar">
            <b style={{ marginRight: "auto" }}>
              Não conformidades registradas{" "}
              <span className="nc-count">{manuais.data?.length ?? 0}</span>
            </b>
            {canCreate && (
              <button
                className="nc-btn primary"
                onClick={() => {
                  setEditingManual(null);
                  setManualDialogOpen(true);
                }}
              >
                <Plus size={14} /> Registrar não conformidade
              </button>
            )}
          </div>
          {manuais.isLoading ? (
            <div className="nc-empty">Carregando…</div>
          ) : (manuais.data?.length ?? 0) === 0 ? (
            <div className="nc-empty">
              Nenhuma não conformidade registrada.
              {canCreate && ' Clique em "Registrar não conformidade" para começar.'}
            </div>
          ) : (
            <div className="nc-scroll">
              <table className="nc-table">
                <thead>
                  <tr>
                    <th>Plataforma</th>
                    <th>Fora de compliance</th>
                    <th>Prazo de resolução</th>
                    <th>Aceite de risco</th>
                    <th>Configurada em</th>
                    {(canEdit || canDelete) && (
                      <th>
                        <span style={{ fontSize: 0 }}>Ações</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {(manuais.data ?? []).map((r) => {
                    const vencido = !!r.prazo_resolucao && r.prazo_resolucao < hoje;
                    return (
                      <tr
                        key={r.id}
                        className="clickable"
                        tabIndex={0}
                        onClick={() => setSheet({ kind: "reg", id: r.id, del: false })}
                        onKeyDown={(e) =>
                          e.key === "Enter" && setSheet({ kind: "reg", id: r.id, del: false })
                        }
                      >
                        <td style={{ fontWeight: 500, whiteSpace: "nowrap" }}>{r.plataforma}</td>
                        <td>
                          <span className="nc-trunc" title={r.fora_compliance}>
                            {r.fora_compliance}
                          </span>
                        </td>
                        <td style={{ whiteSpace: "nowrap" }}>
                          {vencido ? (
                            <span className="nc-tag crit">
                              <AlertTriangle size={11} /> venceu {fmtDateBR(r.prazo_resolucao)}
                            </span>
                          ) : (
                            <span className="mono dim">{fmtDateBR(r.prazo_resolucao)}</span>
                          )}
                        </td>
                        <td>
                          {r.aceite_risco ? (
                            <span className={`nc-tag ${aceiteCls(r.aceite_risco)}`}>
                              {r.aceite_risco}
                            </span>
                          ) : (
                            <span className="dim">—</span>
                          )}
                        </td>
                        <td className="mono dim">{fmtDateBR(r.data_configuracao)}</td>
                        {(canEdit || canDelete) && (
                          <td onClick={(e) => e.stopPropagation()}>
                            <div className="nc-row-act">
                              {canEdit && (
                                <button
                                  className="nc-icon-btn"
                                  title="Editar"
                                  aria-label="Editar"
                                  onClick={() => {
                                    setEditingManual(r);
                                    setManualDialogOpen(true);
                                  }}
                                >
                                  <Pencil size={14} />
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  className="nc-icon-btn danger"
                                  title="Remover"
                                  aria-label="Remover"
                                  onClick={() => setSheet({ kind: "reg", id: r.id, del: true })}
                                >
                                  <Trash2 size={14} />
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
          )}
        </div>
      )}

      {/* ══ CHAMADOS ════════════════════════════════════════════════════════ */}
      {tab === "chamados" && (
        <div className="nc-card">
          <div className="nc-toolbar">
            <b style={{ marginRight: "auto" }}>
              Chamados de Segurança da Informação{" "}
              <span className="nc-count">{chamados.data?.length ?? 0}</span>
            </b>
            {canCreate && (
              <button
                className="nc-btn primary"
                onClick={() => {
                  setEditingChamado(null);
                  setChamadoDialogOpen(true);
                }}
              >
                <Plus size={14} /> Registrar chamado
              </button>
            )}
          </div>
          {chamados.isLoading ? (
            <div className="nc-empty">Carregando…</div>
          ) : (chamados.data?.length ?? 0) === 0 ? (
            <div className="nc-empty">
              Nenhum chamado registrado.
              {canCreate && ' Clique em "Registrar chamado" para começar.'}
            </div>
          ) : (
            <div className="nc-scroll">
              <table className="nc-table">
                <thead>
                  <tr>
                    <th>Chamado</th>
                    <th>Descrição</th>
                    <th>Aberto em</th>
                    <th>Em aberto</th>
                    <th>Responsável</th>
                    {(canEdit || canDelete) && (
                      <th>
                        <span style={{ fontSize: 0 }}>Ações</span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {(chamados.data ?? []).map((c) => {
                    const dias = chamadoDias(c);
                    return (
                      <tr
                        key={c.id}
                        className="clickable"
                        tabIndex={0}
                        onClick={() => setSheet({ kind: "cham", id: c.id, del: false })}
                        onKeyDown={(e) =>
                          e.key === "Enter" && setSheet({ kind: "cham", id: c.id, del: false })
                        }
                      >
                        <td
                          className="mono"
                          style={{ fontWeight: 500, color: "var(--v2-fg)", whiteSpace: "nowrap" }}
                        >
                          {c.chamado}
                        </td>
                        <td>
                          <span className="nc-trunc" title={c.descricao ?? ""}>
                            {c.descricao ?? "—"}
                          </span>
                        </td>
                        <td className="mono dim">{fmtDateBR(c.data_abertura)}</td>
                        <td>
                          {dias === null ? (
                            <span className="dim">—</span>
                          ) : dias > CHAMADO_PRAZO_DIAS ? (
                            <span className="nc-tag crit">
                              <AlertTriangle size={11} /> {dias} dias
                            </span>
                          ) : (
                            <span className="nc-tag ok">{dias} dias</span>
                          )}
                        </td>
                        <td style={{ color: "var(--v2-fg-2)" }}>{c.responsavel ?? "—"}</td>
                        {(canEdit || canDelete) && (
                          <td onClick={(e) => e.stopPropagation()}>
                            <div className="nc-row-act">
                              {canEdit && (
                                <button
                                  className="nc-icon-btn"
                                  title="Editar"
                                  aria-label="Editar"
                                  onClick={() => {
                                    setEditingChamado(c);
                                    setChamadoDialogOpen(true);
                                  }}
                                >
                                  <Pencil size={14} />
                                </button>
                              )}
                              {canDelete && (
                                <button
                                  className="nc-icon-btn danger"
                                  title="Remover"
                                  aria-label="Remover"
                                  onClick={() => setSheet({ kind: "cham", id: c.id, del: true })}
                                >
                                  <Trash2 size={14} />
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
          )}
          <div className="nc-note">
            Chamado com mais de {CHAMADO_PRAZO_DIAS} dias em aberto conta como atrasado.
          </div>
        </div>
      )}

      {/* ── Painel lateral ─────────────────────────────────────────────────── */}
      <DetailSheet
        open={!!(ctrlOpen || regOpen || chamOpen)}
        onOpenChange={(o) => !o && setSheet(null)}
        eyebrow={
          ctrlOpen
            ? ctrlOpen.fonte
            : regOpen
              ? `Configurada em ${fmtDateBR(regOpen.data_configuracao)}`
              : chamOpen
                ? `Aberto em ${fmtDateBR(chamOpen.data_abertura)}`
                : null
        }
        title={
          ctrlOpen
            ? ctrlOpen.nome
            : regOpen
              ? regOpen.plataforma
              : chamOpen
                ? `${chamOpen.chamado}${chamOpen.descricao ? ` · ${chamOpen.descricao}` : ""}`
                : ""
        }
        badges={
          ctrlOpen ? (
            <StatusPill s={ctrlOpen.status} />
          ) : regOpen ? (
            <>
              {regOpen.prazo_resolucao && regOpen.prazo_resolucao < hoje ? (
                <span className="nc-tag crit">
                  <AlertTriangle size={11} /> Prazo vencido
                </span>
              ) : (
                <span className="nc-tag">Prazo {fmtDateBR(regOpen.prazo_resolucao)}</span>
              )}
              {regOpen.aceite_risco && (
                <span className={`nc-tag ${aceiteCls(regOpen.aceite_risco)}`}>
                  Aceite: {regOpen.aceite_risco}
                </span>
              )}
            </>
          ) : chamOpen ? (
            (chamadoDias(chamOpen) ?? 0) > CHAMADO_PRAZO_DIAS ? (
              <span className="nc-tag crit">
                <AlertTriangle size={11} /> Atrasado · {chamadoDias(chamOpen)} dias
              </span>
            ) : (
              <span className="nc-tag ok">No prazo · {chamadoDias(chamOpen) ?? "—"} dias</span>
            )
          ) : null
        }
        footer={
          ctrlOpen ? (
            ctrlOpen.id === "vulns" || ctrlOpen.id === "cham" ? (
              <button
                className="nc-btn primary"
                onClick={() => {
                  go(ctrlOpen.id === "vulns" ? "vulns" : "chamados");
                  setSheet(null);
                }}
              >
                Abrir lista completa <ChevronRight size={14} />
              </button>
            ) : (
              <span className="dim" style={{ fontSize: 12.5, marginRight: "auto" }}>
                Dados da integração; a correção é feita na origem.
              </span>
            )
          ) : regOpen ? (
            editFooter(
              () => {
                setEditingManual(regOpen);
                setManualDialogOpen(true);
                setSheet(null);
              },
              () => deleteManual.mutate(regOpen.id),
              deleteManual.isPending,
              "este registro",
              askDelete,
            )
          ) : chamOpen ? (
            editFooter(
              () => {
                setEditingChamado(chamOpen);
                setChamadoDialogOpen(true);
                setSheet(null);
              },
              () => deleteChamado.mutate(chamOpen.id),
              deleteChamado.isPending,
              "este chamado",
              askDelete,
            )
          ) : null
        }
      >
        <div className="nc-sheet" style={{ display: "contents" }}>
          {ctrlOpen && ctrlBody(ctrlOpen.id)}
          {regOpen && (
            <>
              {textSection("Fora de compliance", regOpen.fora_compliance)}
              <DetailSection title="Prazos">
                <DetailList
                  items={[
                    ["Prazo de resolução", fmtDateBR(regOpen.prazo_resolucao), true],
                    ["Configurada em", fmtDateBR(regOpen.data_configuracao), true],
                    ["Aceite de risco", regOpen.aceite_risco ?? "—"],
                  ]}
                />
              </DetailSection>
              {textSection("Impactos", regOpen.impactos)}
              {textSection("Evidências", regOpen.evidencias)}
              {textSection("Observações", regOpen.observacoes)}
            </>
          )}
          {chamOpen && (
            <>
              <DetailSection title="Chamado">
                <DetailList
                  items={[
                    ["Número", chamOpen.chamado, true],
                    ["Responsável", chamOpen.responsavel ?? "—"],
                    ["Aberto em", fmtDateBR(chamOpen.data_abertura), true],
                    [
                      "Em aberto",
                      chamadoDias(chamOpen) === null ? "—" : `${chamadoDias(chamOpen)} dias`,
                    ],
                  ]}
                />
              </DetailSection>
              {textSection("Descrição", chamOpen.descricao)}
              {textSection("Impacto", chamOpen.impacto)}
            </>
          )}
        </div>
      </DetailSheet>

      <NaoConformidadeManualDialog
        open={manualDialogOpen}
        onOpenChange={setManualDialogOpen}
        editing={editingManual}
      />
      <NaoConformidadeChamadoDialog
        open={chamadoDialogOpen}
        onOpenChange={setChamadoDialogOpen}
        editing={editingChamado}
      />
    </div>
  );
}
