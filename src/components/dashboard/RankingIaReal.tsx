import { SyncActions } from "@/components/layout/SyncActions";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, Search } from "lucide-react";
import { toast } from "sonner";
import * as XLSX from "xlsx";
import { getIaRanking, getRankingIaUsuarios } from "@/lib/ia.functions";
import { useRankingIA } from "@/lib/use-ranking-ia";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useFilters } from "@/lib/filters-context";
import { usePermissions } from "@/lib/use-permissions";
import { DetailList, DetailSection, DetailSheet } from "@/components/layout/DetailSheet";

// ── CSS (interface v2) ─────────────────────────────────────────────────────────
const CSS = `
  .iad-root { font-family:var(--font-ui); color:var(--v2-fg); display:flex; flex-direction:column; gap:20px; font-size:14px; }
  .iad-root * { box-sizing:border-box; }
  @keyframes iad-spin { to{transform:rotate(360deg)} }
  .iad-spin { animation:iad-spin 0.75s linear infinite; }
  @media (prefers-reduced-motion: reduce) { .iad-spin { animation:none; } }
  .iad-root ::-webkit-scrollbar { width:6px; height:6px; }
  .iad-root ::-webkit-scrollbar-track { background:transparent; }
  .iad-root ::-webkit-scrollbar-thumb { background:var(--v2-line-strong); border-radius:3px; }
  .iad-root :focus-visible { outline:2px solid var(--v2-accent); outline-offset:2px; }
  .iad-root .mono { font-family:var(--font-data); font-size:12.5px; }
  .iad-root .dim { color:var(--v2-fg-3); }
  .iad-root .recharts-cartesian-axis-tick-value { fill:var(--v2-fg-3) !important; font-size:11px; font-family:var(--font-data); }

  /* ── Cabeçalho ── */
  .iad-ph { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  .iad-ph-title { font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.2; margin:0; }
  .iad-ph-sub { margin:4px 0 0; font-size:13px; color:var(--v2-fg-3); display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  .iad-live { display:inline-flex; align-items:center; gap:6px; }
  .iad-live::before { content:""; width:7px; height:7px; border-radius:50%; background:var(--v2-ok); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-ok) 25%, transparent); }
  .iad-actions { display:flex; gap:8px; flex-wrap:wrap; }

  /* ── Botões ── */
  .iad-btn { display:inline-flex; align-items:center; gap:7px; height:34px; padding:0 14px; border-radius:8px; border:1px solid var(--v2-line); background:var(--v2-surface); font-size:13px; font-weight:500; color:var(--v2-fg); cursor:pointer; font-family:inherit; white-space:nowrap; }
  .iad-btn:hover:not(:disabled) { background:var(--v2-hover); border-color:var(--v2-line-strong); }
  .iad-btn:disabled { opacity:0.45; cursor:not-allowed; }
  .iad-btn.primary { background:var(--v2-accent); border-color:var(--v2-accent); color:var(--v2-accent-ink); }
  .iad-btn.primary:hover:not(:disabled) { background:var(--v2-accent); filter:brightness(1.08); }
  .iad-btn.ghost { background:transparent; border-color:transparent; color:var(--v2-fg-2); }
  .iad-btn.sm { height:28px; padding:0 10px; font-size:12.5px; }
  .iad-menu { display:grid; gap:2px; min-width:170px; }
  .iad-menu button { display:flex; align-items:center; gap:8px; padding:8px 10px; border:0; border-radius:6px; background:transparent; color:inherit; font-size:13px; text-align:left; cursor:pointer; font-family:var(--font-ui); }
  .iad-menu button:hover { background:var(--v2-hover); }

  /* ── Filtros ── */
  .iad-panel { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; min-width:0; overflow:hidden; }
  .iad-filters { display:flex; align-items:flex-end; gap:12px; flex-wrap:wrap; padding:14px 18px; }
  .iad-filter-field { display:grid; gap:6px; min-width:180px; flex:0 1 220px; }
  .iad-filter-label { font-size:12.5px; font-weight:500; color:var(--v2-fg-2); }
  .iad-filter-select { width:100%; min-width:0; height:34px; padding:0 28px 0 12px; border:1px solid var(--v2-line); border-radius:8px; background-color:var(--v2-surface); color:var(--v2-fg); font-size:13px; font-family:inherit; appearance:none; background-image:linear-gradient(45deg, transparent 50%, var(--v2-fg-3) 50%), linear-gradient(135deg, var(--v2-fg-3) 50%, transparent 50%); background-position:calc(100% - 16px) 15px, calc(100% - 11px) 15px; background-size:5px 5px; background-repeat:no-repeat; }
  .iad-filter-select:focus { outline:none; border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }
  .iad-filter-select.on { border-color:color-mix(in oklch, var(--v2-accent) 55%, transparent); background-color:color-mix(in oklch, var(--v2-accent) 12%, var(--v2-surface)); }

  /* ── KPIs ── */
  .iad-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
  .iad-kpi { padding:16px 18px 14px; display:grid; gap:2px; align-content:start; box-shadow:1px 0 0 var(--v2-line), 0 1px 0 var(--v2-line); min-width:0; }
  .iad-kpi-label { font-size:12.5px; color:var(--v2-fg-2); }
  .iad-kpi-value { font-size:28px; font-weight:600; letter-spacing:-0.02em; line-height:1.25; font-variant-numeric:tabular-nums; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .iad-kpi-foot { font-size:12px; color:var(--v2-fg-3); }

  /* ── Grade e cartões ── */
  .iad-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:20px; align-items:start; }
  .iad-span-2 { grid-column:span 2; }
  .iad-col { display:grid; gap:20px; min-width:0; align-content:start; }
  @media (max-width: 1100px) { .iad-grid { grid-template-columns:minmax(0, 1fr); } .iad-span-2 { grid-column:auto; } }
  .iad-panel-hdr { padding:14px 18px 4px; }
  .iad-panel-title { font-size:14px; font-weight:600; margin:0; }
  .iad-panel-sub { margin:2px 0 0; font-size:12.5px; color:var(--v2-fg-3); }
  .iad-panel-body { padding:10px 18px 16px; }
  .iad-empty { padding:24px 0; text-align:center; color:var(--v2-fg-3); font-size:13px; }

  /* ── Barras clicáveis (ferramenta / departamento) ── */
  .iad-bars { display:grid; gap:4px; max-height:360px; overflow:auto; }
  .iad-bars button { display:grid; grid-template-columns:minmax(0, 1fr) auto; gap:5px 10px; align-items:center; padding:7px 8px; margin:0 -8px; border:0; border-radius:8px; background:transparent; text-align:left; color:var(--v2-fg); font-size:13px; cursor:pointer; font-family:inherit; }
  .iad-bars button:hover { background:var(--v2-hover); }
  .iad-bars button[aria-pressed="true"] { background:color-mix(in oklch, var(--v2-accent) 14%, transparent); }
  .iad-bars.filtering button[aria-pressed="false"] { opacity:.5; }
  .iad-bars span:first-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .iad-bars .n { font:500 12.5px var(--font-data); color:var(--v2-fg-2); text-align:right; white-space:nowrap; }
  .iad-bars .n small { font:400 11.5px var(--font-ui); color:var(--v2-fg-3); margin-left:6px; }
  .iad-track { grid-column:1 / -1; position:relative; height:8px; border-radius:99px; background:var(--v2-surface-2); overflow:hidden; }
  .iad-fill { position:absolute; inset:0 auto 0 0; border-radius:99px; background:var(--v2-accent); }

  /* ── Ranking ── */
  .iad-toolbar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:12px 18px; border-bottom:1px solid var(--v2-line); }
  .iad-count { font-weight:400; font-size:13px; color:var(--v2-fg-3); }
  .iad-search { display:inline-flex; align-items:center; gap:8px; height:32px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg-3); width:240px; max-width:100%; margin-left:auto; }
  .iad-search:focus-within { border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }
  .iad-search input { flex:1; min-width:0; border:0; outline:none; background:transparent; color:var(--v2-fg); font-size:13px; font-family:inherit; }
  .iad-search input::placeholder { color:var(--v2-fg-3); }
  .iad-scroll { overflow:auto; max-height:640px; }
  .iad-table { width:100%; border-collapse:collapse; font-size:13px; }
  .iad-table thead { position:sticky; top:0; z-index:1; }
  .iad-table th { padding:9px 12px; font-size:12px; font-weight:500; color:var(--v2-fg-3); text-align:left; background:var(--v2-surface); border-bottom:1px solid var(--v2-line); white-space:nowrap; }
  .iad-table th.r, .iad-table td.r { text-align:right; }
  .iad-table td { padding:8px 12px; height:44px; border-bottom:1px solid var(--v2-line); vertical-align:middle; }
  .iad-table th:first-child, .iad-table td:first-child { padding-left:18px; }
  .iad-table th:last-child, .iad-table td:last-child { padding-right:18px; }
  .iad-table tbody tr { cursor:pointer; }
  .iad-table tbody tr:hover td { background:var(--v2-hover); }
  .iad-table tbody tr:last-child td { border-bottom:none; }
  .iad-rank { display:inline-grid; place-items:center; width:24px; height:24px; border-radius:50%; font:600 12px var(--font-data); color:var(--v2-fg-2); background:var(--v2-surface-2); border:1px solid var(--v2-line); }
  .iad-rank.r1 { background:color-mix(in oklch, oklch(0.8 0.14 85) 25%, transparent); border-color:color-mix(in oklch, oklch(0.8 0.14 85) 55%, transparent); color:var(--v2-fg); }
  .iad-rank.r2 { background:color-mix(in oklch, oklch(0.78 0.02 255) 25%, transparent); border-color:color-mix(in oklch, oklch(0.78 0.02 255) 55%, transparent); color:var(--v2-fg); }
  .iad-rank.r3 { background:color-mix(in oklch, oklch(0.68 0.12 50) 25%, transparent); border-color:color-mix(in oklch, oklch(0.68 0.12 50) 55%, transparent); color:var(--v2-fg); }
  .iad-ubar { display:grid; grid-template-columns:minmax(80px, 1fr) 64px; gap:10px; align-items:center; min-width:180px; }
  .iad-ubar .iad-track { height:6px; }
  .iad-ubar span { font:500 12.5px var(--font-data); text-align:right; }
  .iad-foot { display:flex; justify-content:space-between; gap:12px; padding:10px 18px; border-top:1px solid var(--v2-line); font-size:12.5px; color:var(--v2-fg-3); }
  .iad-skel { height:12px; border-radius:4px; background:linear-gradient(90deg, var(--v2-surface-2), var(--v2-hover), var(--v2-surface-2)); background-size:200% 100%; animation:iad-shimmer 1.4s infinite linear; }
  @keyframes iad-shimmer { to { background-position:-200% 0; } }

  /* ── Tooltip / painel lateral ── */
  .iad-tip { display:grid; gap:2px; padding:8px 10px; background:var(--v2-surface-2); border:1px solid var(--v2-line-strong); border-radius:8px; font-size:12px; box-shadow:0 12px 32px rgba(0,0,0,0.3); }
  .iad-tip span { color:var(--v2-fg-2); font-family:var(--font-data); }
  .iad-chips { display:flex; gap:6px; flex-wrap:wrap; }
  .iad-chip { display:inline-flex; align-items:center; height:24px; padding:0 9px; border-radius:6px; background:var(--v2-surface-2); border:1px solid var(--v2-line); font-size:12.5px; color:var(--v2-fg-2); }
`;

// ── Helpers ────────────────────────────────────────────────────────────────────
const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" }) : "—";
const fmtNum = (n: number) => n.toLocaleString("pt-BR");

// Formata "YYYY-MM-DD" -> "DD/MM" (sem ano) para os rótulos do gráfico de evolução
const fmtDiaMes = (s: string) => {
  const p = (s ?? "").split("-");
  return p.length === 3 ? `${p[2]}/${p[1]}` : s;
};

function fmtRel(iso: string | null): string {
  if (!iso) return "nunca";
  const min = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  return `há ${d} ${d === 1 ? "dia" : "dias"}`;
}

type IaFilters = { dept: string; tool: string; unit: string; user: string };

function SerieTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { d: string; count: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const dt = new Date(p.d + "T12:00:00");
  return (
    <div className="iad-tip">
      <b>
        {dt.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}
      </b>
      <span>
        {fmtNum(p.count)} {p.count === 1 ? "evento" : "eventos"}
      </span>
    </div>
  );
}

// Barras clicáveis de "Por ferramenta" e "Por departamento"
function UsageBars({
  rows,
  selected,
  onPick,
}: {
  rows: Array<{ key: string; name: string; count: number; userCount: number }>;
  selected: string | null;
  onPick: (key: string) => void;
}) {
  const max = rows[0]?.count || 1;
  if (rows.length === 0) return <div className="iad-empty">Sem dados no filtro atual.</div>;
  return (
    <div className={`iad-bars${selected ? " filtering" : ""}`}>
      {rows.map((r) => (
        <button
          key={r.key}
          type="button"
          aria-pressed={selected === r.key}
          onClick={() => onPick(r.key)}
          title={`${r.name}: ${fmtNum(r.count)} acessos · ${r.userCount} pessoas`}
        >
          <span>{r.name}</span>
          <span className="n">
            {fmtNum(r.count)}
            <small>
              {r.userCount} {r.userCount === 1 ? "pessoa" : "pessoas"}
            </small>
          </span>
          <span className="iad-track">
            <span className="iad-fill" style={{ width: `${(r.count / max) * 100}%` }} />
          </span>
        </button>
      ))}
    </div>
  );
}

function IaSelect({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: Array<string | { value: string; label: string }>;
}) {
  const opts = options.map((o) => (typeof o === "string" ? { value: o, label: o } : o));
  return (
    <div className="iad-filter-field">
      <label className="iad-filter-label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`iad-filter-select${value !== "all" ? " on" : ""}`}
      >
        <option value="all">Todos</option>
        {opts.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

const RANKING_LIMIT = 20;

export function RankingIaDashboard() {
  const { can } = usePermissions();
  const canExport = can("ranking-ia", "manage_exportar_ranking_ia");
  const [f, setF] = React.useState<IaFilters>({
    dept: "all",
    tool: "all",
    unit: "all",
    user: "all",
  });
  const set = (p: Partial<IaFilters>) => setF((s) => ({ ...s, ...p }));
  const reset = () => setF({ dept: "all", tool: "all", unit: "all", user: "all" });

  // Período vem do filtro global do AppHeader (inclui a opção "Personalizado").
  const { dateRange } = useFilters();
  const from = dateRange.from.toISOString();
  const to = dateRange.to.toISOString();

  const fetchRanking = useServerFn(getIaRanking);
  const fetchRankingUsuarios = useServerFn(getRankingIaUsuarios);
  const [exporting, setExporting] = React.useState(false);
  const [exportOpen, setExportOpen] = React.useState(false);
  const [busca, setBusca] = React.useState("");
  const [openUser, setOpenUser] = React.useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["ia-ranking", f, from, to],
    queryFn: () =>
      fetchRanking({ data: { from, to, dept: f.dept, tool: f.tool, unit: f.unit, user: f.user } }),
  });

  // Ranking de usuários (top 20) com os mesmos filtros do restante da tela
  const rankingFilters = React.useMemo(
    () => ({ tool: f.tool, dept: f.dept, unit: f.unit, from, to }),
    [f.tool, f.dept, f.unit, from, to],
  );
  const ranking = useRankingIA(RANKING_LIMIT, rankingFilters);
  const rankRows = ranking.data ?? [];


  const opts = data?.filterOptions;
  const byTool = data?.byTool ?? [];
  const byDept = data?.byDept ?? [];
  const series = data?.series ?? [];
  const totals = data?.totals ?? { events: 0, users: 0, tools: 0 };
  const anyActive = f.dept !== "all" || f.tool !== "all" || f.unit !== "all" || f.user !== "all";

  // ── Exportação — respeita os filtros ativos (dept/tool/unit/período) ─────
  const onExport = async (format: "csv" | "xlsx") => {
    setExportOpen(false);
    setExporting(true);
    try {
      // Ranking de usuários busca até 5000 (teto do endpoint — folga acima da
      // base atual de usuários únicos), com os mesmos filtros aplicados no
      // gráfico — a lista da tela mostra só o top 20.
      const usuarios = await fetchRankingUsuarios({
        data: { limit: 5000, tool: f.tool, dept: f.dept, unit: f.unit, from, to },
      });

      const rankingSheet = usuarios.map((u) => ({
        Usuário: u.user_name,
        "Total de Acessos": u.total_acessos,
        "Último Acesso": u.ultimo_acesso
          ? new Date(u.ultimo_acesso).toLocaleString("pt-BR", {
              dateStyle: "short",
              timeStyle: "short",
            })
          : "—",
      }));
      const toolSheet = byTool.map((t) => ({
        Ferramenta: t.name,
        Acessos: t.count,
        "Usuários Únicos": t.userCount,
        Usuários: t.users.join(", "),
      }));
      const deptSheet = byDept.map((d) => ({
        Departamento: d.name,
        Acessos: d.count,
        "Usuários Únicos": d.userCount,
        Usuários: d.users.join(", "),
      }));
      const seriesSheet = series.map((s) => ({
        Data: fmtDiaMes(s.d),
        Eventos: s.count,
      }));

      if (![rankingSheet, toolSheet, deptSheet, seriesSheet].some((s) => s.length > 0)) {
        toast.error("Nenhum dado de IA para exportar.");
        return;
      }

      // Nome do arquivo carrega os filtros ativos, deixando explícito o recorte exportado.
      const filterParts: string[] = [];
      if (f.tool !== "all") filterParts.push(f.tool);
      if (f.dept !== "all") {
        const deptName = opts?.departments.find((d) => d.id === f.dept)?.name;
        if (deptName) filterParts.push(deptName);
      }
      if (f.unit !== "all") filterParts.push(f.unit);
      if (f.user !== "all") filterParts.push(f.user);
      const slug = filterParts
        .join("-")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[̀-ͯ]/g, "")
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/(^-|-$)/g, "");
      const fname = `ranking-ia${slug ? `_${slug}` : ""}_${new Date().toISOString().slice(0, 10)}`;

      if (format === "csv") {
        // CSV não tem abas → junta tudo com uma coluna "Tabela"
        const rows = [
          ...rankingSheet.map((r) => ({ Tabela: "Ranking de Usuários", ...r })),
          ...toolSheet.map((r) => ({ Tabela: "Por Ferramenta", ...r })),
          ...deptSheet.map((r) => ({ Tabela: "Por Departamento", ...r })),
          ...seriesSheet.map((r) => ({ Tabela: "Evolução Diária", ...r })),
        ];
        const headers = Array.from(
          rows.reduce((set, r) => {
            Object.keys(r).forEach((k) => set.add(k));
            return set;
          }, new Set<string>()),
        );
        const esc = (val: unknown) => {
          const s = String(val ?? "");
          return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
        };
        const csv = [
          headers.join(";"),
          ...rows.map((r) => headers.map((h) => esc((r as Record<string, unknown>)[h])).join(";")),
        ].join("\r\n");
        const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8;" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${fname}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const wb = XLSX.utils.book_new();
        if (rankingSheet.length)
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rankingSheet), "Ranking");
        if (toolSheet.length)
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(toolSheet), "Por Ferramenta");
        if (deptSheet.length)
          XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(deptSheet), "Por Departamento");
        if (seriesSheet.length)
          XLSX.utils.book_append_sheet(
            wb,
            XLSX.utils.json_to_sheet(seriesSheet),
            "Evolução Diária",
          );
        XLSX.writeFile(wb, `${fname}.xlsx`);
      }
      toast.success("Exportação concluída.");
    } catch (e) {
      toast.error((e as Error).message ?? "Erro ao exportar dados de IA.");
    } finally {
      setExporting(false);
    }
  };

  // ── Derivados para a tela ──────────────────────────────────────────────────
  const deptIdByName = (name: string) => opts?.departments.find((d) => d.name === name)?.id ?? null;
  const toolRows = byTool.map((t) => ({
    key: t.name,
    name: t.name,
    count: t.count,
    userCount: t.userCount,
  }));
  const deptRows = byDept.map((d) => ({
    key: deptIdByName(d.name) ?? d.name,
    name: d.name,
    count: d.count,
    userCount: d.userCount,
  }));
  const leader = rankRows[0];
  const media = totals.users > 0 ? Math.round(totals.events / totals.users) : null;
  const maxAcessos = rankRows[0]?.total_acessos || 1;
  const visiveis = rankRows
    .map((u, i) => ({ ...u, pos: i + 1 }))
    .filter((u) => !busca.trim() || u.user_name.toLowerCase().includes(busca.trim().toLowerCase()));
  // Departamento e ferramentas de cada pessoa vêm das listas "quem usou" por ferramenta/departamento
  const deptOf = (name: string) => byDept.find((d) => d.users.includes(name))?.name ?? null;
  const toolsOf = (name: string) => byTool.filter((t) => t.users.includes(name)).map((t) => t.name);
  const openRow = visiveis.find((u) => u.user_name === openUser) ?? null;

  return (
    <div className="iad-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      {/* ── Cabeçalho ────────────────────────────────────────────────────── */}
      <div className="iad-ph">
        <div>
          <h1 className="iad-ph-title">Uso de IA</h1>
          <p className="iad-ph-sub">
            {data?.lastSyncAt && (
              <>
                <span
                  className="iad-live"
                  title={new Date(data.lastSyncAt).toLocaleString("pt-BR")}
                >
                  Sincronizado {fmtRel(data.lastSyncAt)}
                </span>
                <span>·</span>
              </>
            )}
            <span>Acessos de colaboradores a ferramentas de IA, pelo proxy web</span>
          </p>
        </div>
        <SyncActions moduleSlug="ranking-ia" jobs={["ranking-ia-sync", "sophos-ia-sync"]}>
          <div className="iad-actions">
            {canExport && (
              <Popover open={exportOpen} onOpenChange={setExportOpen}>
                <PopoverTrigger asChild>
                  <button className="iad-btn" disabled={exporting}>
                    <Download size={14} className={exporting ? "iad-spin" : ""} />
                    {exporting ? "Exportando…" : "Exportar"}
                  </button>
                </PopoverTrigger>
                <PopoverContent align="end" className="w-auto p-1">
                  <div className="iad-menu">
                    <button onClick={() => onExport("csv")}>
                      <Download size={14} /> CSV (.csv)
                    </button>
                    <button onClick={() => onExport("xlsx")}>
                      <Download size={14} /> Excel (.xlsx)
                    </button>
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>
        </SyncActions>
      </div>

      {/* ── Filtros ──────────────────────────────────────────────────────── */}
      <div className="iad-panel">
        <div className="iad-filters">
          <IaSelect
            id="ia-f-dept"
            label="Departamento"
            value={f.dept}
            onChange={(v) => set({ dept: v })}
            options={(opts?.departments ?? []).map((d) => ({ value: d.id, label: d.name }))}
          />
          <IaSelect
            id="ia-f-tool"
            label="Ferramenta"
            value={f.tool}
            onChange={(v) => set({ tool: v })}
            options={opts?.tools ?? []}
          />
          <IaSelect
            id="ia-f-unit"
            label="Unidade"
            value={f.unit}
            onChange={(v) => set({ unit: v })}
            options={opts?.units ?? []}
          />
          <IaSelect
            id="ia-f-user"
            label="Usuário"
            value={f.user}
            onChange={(v) => set({ user: v })}
            options={opts?.users ?? []}
          />
          {anyActive && (
            <button className="iad-btn ghost sm" onClick={reset} style={{ marginBottom: 3 }}>
              Limpar filtros
            </button>
          )}
        </div>
      </div>

      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div className="iad-kpis">
        {[
          {
            label: "Eventos",
            value: isLoading ? "…" : fmtNum(totals.events),
            foot: "acessos a ferramentas de IA",
          },
          {
            label: "Usuários únicos",
            value: isLoading ? "…" : fmtNum(totals.users),
            foot: "pessoas que usaram IA",
          },
          {
            label: "Ferramentas em uso",
            value: isLoading ? "…" : fmtNum(totals.tools),
            foot: opts?.tools ? `de ${opts.tools.length} monitoradas` : "",
          },
          {
            label: "Média por usuário",
            value: isLoading ? "…" : media === null ? "—" : fmtNum(media),
            foot: "acessos no período",
          },
          {
            label: "Líder do ranking",
            value: ranking.isLoading ? "…" : (leader?.user_name ?? "—"),
            foot: leader ? `${fmtNum(leader.total_acessos)} acessos` : "",
          },
        ].map((k) => (
          <div key={k.label} className="iad-kpi">
            <span className="iad-kpi-label">{k.label}</span>
            <span className="iad-kpi-value" title={k.value}>
              {k.value}
            </span>
            <span className="iad-kpi-foot">{k.foot}</span>
          </div>
        ))}
      </div>

      {/* Duas colunas: à esquerda uso por dia + ranking; à direita ferramenta + departamento.
          Assim um cartão mais alto de um lado não abre buraco do outro. */}
      <div className="iad-grid">
        <div className="iad-col iad-span-2">
          {/* ── Uso por dia ─────────────────────────────────────────────────── */}
          <div className="iad-panel">
            <div className="iad-panel-hdr">
              <h2 className="iad-panel-title">Uso por dia</h2>
              <p className="iad-panel-sub">Eventos de acesso a ferramentas de IA no período</p>
            </div>
            <div className="iad-panel-body" style={{ height: 250 }}>
              {series.length === 0 ? (
                <div className="iad-empty">
                  {isLoading ? "Carregando…" : "Sem dados para o período selecionado."}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={series} margin={{ top: 8, right: 10, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke="var(--v2-line)" vertical={false} />
                    <XAxis
                      dataKey="d"
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={fmtDiaMes}
                      interval="preserveStartEnd"
                    />
                    <YAxis
                      tickLine={false}
                      axisLine={false}
                      allowDecimals={false}
                      width={56}
                      tickFormatter={(v) => Number(v).toLocaleString("pt-BR")}
                    />
                    <Tooltip
                      cursor={{ stroke: "var(--v2-line-strong)" }}
                      content={<SerieTooltip />}
                    />
                    <Area
                      type="linear"
                      dataKey="count"
                      stroke="var(--v2-accent)"
                      strokeWidth={2}
                      fill="color-mix(in oklch, var(--v2-accent) 16%, transparent)"
                      dot={(p: { cx?: number; cy?: number; index?: number }) =>
                        p.index === series.length - 1 ? (
                          <circle
                            key="ultimo"
                            cx={p.cx}
                            cy={p.cy}
                            r={4}
                            fill="var(--v2-accent)"
                            stroke="var(--v2-surface)"
                            strokeWidth={2}
                          />
                        ) : (
                          <g key={`d${p.index}`} />
                        )
                      }
                      activeDot={{
                        r: 4,
                        fill: "var(--v2-accent)",
                        stroke: "var(--v2-surface)",
                        strokeWidth: 2,
                      }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          {/* ── Ranking de usuários ─────────────────────────────────────────── */}
          <div className="iad-panel">
            <div className="iad-toolbar">
              <span style={{ fontWeight: 600, fontSize: 14 }}>
                Ranking de usuários{" "}
                <span className="iad-count">
                  {ranking.isLoading ? "…" : `${rankRows.length} usuários`}
                </span>
              </span>
              <label className="iad-search">
                <Search size={14} />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar usuário"
                  aria-label="Buscar usuário no ranking"
                />
              </label>
            </div>
            {ranking.isLoading ? (
              <div style={{ display: "grid", gap: 14, padding: 18 }}>
                {Array.from({ length: 8 }).map((_, i) => (
                  <div key={i} className="iad-skel" style={{ width: `${90 - i * 6}%` }} />
                ))}
              </div>
            ) : ranking.error ? (
              <div className="iad-empty">Erro ao carregar o ranking.</div>
            ) : rankRows.length === 0 ? (
              <div className="iad-empty">Sem dados de acesso à IA no período.</div>
            ) : visiveis.length === 0 ? (
              <div className="iad-empty">Nenhum usuário com esse nome no ranking.</div>
            ) : (
              <div className="iad-scroll">
                <table className="iad-table">
                  <thead>
                    <tr>
                      <th style={{ width: 56 }}>#</th>
                      <th>Usuário</th>
                      <th>Departamento</th>
                      <th>Acessos</th>
                      <th className="r">Último acesso</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visiveis.map((u) => (
                      <tr
                        key={u.user_name}
                        tabIndex={0}
                        onClick={() => setOpenUser(u.user_name)}
                        onKeyDown={(e) => e.key === "Enter" && setOpenUser(u.user_name)}
                      >
                        <td>
                          <span className={`iad-rank${u.pos <= 3 ? ` r${u.pos}` : ""}`}>
                            {u.pos}
                          </span>
                        </td>
                        <td style={{ fontWeight: u.pos <= 3 ? 600 : 500 }}>{u.user_name}</td>
                        <td className="dim">{deptOf(u.user_name) ?? "—"}</td>
                        <td>
                          <div className="iad-ubar">
                            <div className="iad-track">
                              <div
                                className="iad-fill"
                                style={{ width: `${(u.total_acessos / maxAcessos) * 100}%` }}
                              />
                            </div>
                            <span>{fmtNum(u.total_acessos)}</span>
                          </div>
                        </td>
                        <td className="r mono dim">{fmtDate(u.ultimo_acesso)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            <div className="iad-foot">
              <span>Mostrando os {RANKING_LIMIT} primeiros · a exportação traz todos</span>
            </div>
          </div>
        </div>
        <div className="iad-col">
          {/* ── Por ferramenta ──────────────────────────────────────────────── */}
          <div className="iad-panel">
            <div className="iad-panel-hdr">
              <h2 className="iad-panel-title">Por ferramenta</h2>
              <p className="iad-panel-sub">Acessos e pessoas · clique para filtrar</p>
            </div>
            <div className="iad-panel-body">
              {byTool.length === 0 && !isLoading ? (
                <div className="iad-empty">Sem dados. Sincronize para popular eventos.</div>
              ) : (
                <UsageBars
                  rows={toolRows}
                  selected={f.tool !== "all" ? f.tool : null}
                  onPick={(k) => set({ tool: f.tool === k ? "all" : k })}
                />
              )}
            </div>
          </div>
          {/* ── Por departamento ────────────────────────────────────────────── */}
          <div className="iad-panel">
            <div className="iad-panel-hdr">
              <h2 className="iad-panel-title">Por departamento</h2>
              <p className="iad-panel-sub">Acessos e pessoas · clique para filtrar</p>
            </div>
            <div className="iad-panel-body">
              {byDept.length === 0 && !isLoading ? (
                <div className="iad-empty">
                  Cadastre colaboradores em Departamentos para vincular eventos.
                </div>
              ) : (
                <UsageBars
                  rows={deptRows}
                  selected={f.dept !== "all" ? f.dept : null}
                  onPick={(k) => set({ dept: f.dept === k ? "all" : k })}
                />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* ── Painel lateral: usuário ──────────────────────────────────────────── */}
      <DetailSheet
        open={!!openRow}
        onOpenChange={(o) => !o && setOpenUser(null)}
        eyebrow={
          openRow
            ? `${openRow.pos}º no ranking · último acesso ${fmtDate(openRow.ultimo_acesso)}`
            : null
        }
        title={openRow?.user_name ?? ""}
        badges={
          openRow && deptOf(openRow.user_name) ? (
            <span className="iad-chip">{deptOf(openRow.user_name)}</span>
          ) : null
        }
        footer={
          openRow ? (
            <button
              className="iad-btn primary"
              onClick={() => {
                set({ user: openRow.user_name });
                setOpenUser(null);
              }}
            >
              Ver só este usuário
            </button>
          ) : null
        }
      >
        {openRow && (
          <>
            <DetailSection title="Resumo no período">
              <DetailList
                items={[
                  ["Acessos", fmtNum(openRow.total_acessos), true],
                  ["Posição", `${openRow.pos}º de ${rankRows.length}`],
                  ["Departamento", deptOf(openRow.user_name) ?? "—"],
                  ["Último acesso", fmtDate(openRow.ultimo_acesso), true],
                ]}
              />
            </DetailSection>
            <DetailSection title="Ferramentas usadas no período">
              {toolsOf(openRow.user_name).length === 0 ? (
                <span className="dim" style={{ fontSize: 13 }}>
                  Nenhuma ferramenta identificada no filtro atual.
                </span>
              ) : (
                <div className="iad-chips">
                  {toolsOf(openRow.user_name).map((t) => (
                    <span key={t} className="iad-chip">
                      {t}
                    </span>
                  ))}
                </div>
              )}
            </DetailSection>
          </>
        )}
      </DetailSheet>
    </div>
  );
}
