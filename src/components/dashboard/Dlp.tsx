import { SyncActions } from "@/components/layout/SyncActions";
import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";
import { ShieldAlert, Search, ExternalLink, ChevronDown, X } from "lucide-react";
import { DetailList, DetailSection, DetailSheet } from "@/components/layout/DetailSheet";
import { listDlpEvents, getDlpSyncStatus } from "@/lib/dlp.functions";

// Módulo DLP (Purview) — Fase 1: só leitura dos eventos já sincronizados
// (ver dlp.server.ts / api/public/hooks/dlp-sync.ts). Não há severidade nem
// status de investigação no modelo ainda, então NADA aqui inventa criticidade:
// o que a tela mostra é volume, canal de saída, tipo de informação detectada e
// o evento completo. Tudo derivado das mesmas 500 linhas que a listagem já
// carrega — sem consulta nova ao banco.

// ── Design Tokens ──────────────────────────────────────────────────────────────
const T = {
  surface: "var(--tl-0f1420, #0F1420)",
  surfaceAlt: "var(--tl-131825, #131825)",
  border: "var(--tl-1e2640, #1E2640)",
  borderHi: "var(--tl-2a3560, #2A3560)",
  accent: "#3B82F6",
  accentGlow: "rgba(59,130,246,0.15)",
  success: "#10B981",
  successBg: "rgba(16,185,129,0.10)",
  warning: "#F59E0B",
  warningBg: "rgba(245,158,11,0.10)",
  danger: "#EF4444",
  dangerBg: "rgba(239,68,68,0.10)",
  purple: "#A78BFA",
  cyan: "#22D3EE",
  textPrimary: "var(--tl-f1f5f9, #F1F5F9)",
  textSecondary: "var(--tl-94a3b8, #94A3B8)",
  textMuted: "var(--tl-7c8aa0, #7C8AA0)",
  chartGrid: "rgba(var(--tl-line-rgb, 30,38,64),0.7)",
};

// Cor por canal de saída. A mesma cor identifica o workload na barra, no badge
// da tabela e no filtro — é o que permite ler a tela sem legenda.
const CANAL: Record<string, { nome: string; cor: string }> = {
  Exchange: { nome: "E-mail", cor: T.accent },
  SharePoint: { nome: "SharePoint", cor: T.success },
  OneDrive: { nome: "OneDrive", cor: T.cyan },
  MicrosoftTeams: { nome: "Teams", cor: T.purple },
  Endpoint: { nome: "Endpoint", cor: T.warning },
  EndpointDevices: { nome: "Endpoint", cor: T.warning },
};
const canalDe = (w: string | null) =>
  (w && CANAL[w]) || { nome: w ?? "Outro", cor: "var(--tl-6b7280, #6B7280)" };

// ── CSS (interface v2) ─────────────────────────────────────────────────────────
// Moldura nos tokens v2-*. O quadro "Por onde o dado tentou sair" mantém o
// formato anterior (classes .dlp-canal*), por decisão de produto.
const CSS = `
  .dlp-root { font-family:var(--font-ui); color:var(--v2-fg); display:flex; flex-direction:column; gap:20px; font-size:14px; }
  .dlp-root * { box-sizing:border-box; }
  .dlp-root ::-webkit-scrollbar { width:6px; height:6px; }
  .dlp-root ::-webkit-scrollbar-track { background:transparent; }
  .dlp-root ::-webkit-scrollbar-thumb { background:var(--v2-line-strong); border-radius:3px; }
  .dlp-root button:focus-visible, .dlp-root input:focus-visible, .dlp-root tr:focus-visible { outline:2px solid var(--v2-accent); outline-offset:2px; }
  .dlp-root .recharts-cartesian-axis-tick-value { fill:var(--v2-fg-3) !important; font-size:11px; font-family:var(--font-data); }
  .dlp-root .mono { font-family:var(--font-data); font-size:12.5px; }
  .dlp-root .dim { color:var(--v2-fg-3); }
  .dlp-muted { font-size:13px; color:var(--v2-fg-3); }

  /* ── Cabeçalho ── */
  .dlp-ph { display:flex; align-items:flex-end; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  .dlp-ph-title { font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.2; margin:0; }
  .dlp-ph-sub { margin:4px 0 0; font-size:13px; color:var(--v2-fg-3); display:flex; gap:8px; flex-wrap:wrap; align-items:center; }
  .dlp-live { display:inline-flex; align-items:center; gap:6px; }
  .dlp-live::before { content:""; width:7px; height:7px; border-radius:50%; background:var(--v2-ok); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-ok) 25%, transparent); }
  .dlp-seg { display:inline-flex; padding:3px; gap:2px; background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:8px; }
  .dlp-seg button { border:0; background:transparent; padding:4px 12px; border-radius:5px; font-size:13px; color:var(--v2-fg-2); cursor:pointer; font-family:inherit; }
  .dlp-seg button:hover { color:var(--v2-fg); }
  .dlp-seg button[aria-pressed="true"] { background:var(--v2-surface-2); color:var(--v2-fg); font-weight:500; box-shadow:inset 0 0 0 1px var(--v2-line); }

  /* ── KPIs ── */
  .dlp-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(170px, 1fr)); background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
  .dlp-kpi { padding:16px 18px 14px; display:grid; gap:2px; align-content:start; box-shadow:1px 0 0 var(--v2-line), 0 1px 0 var(--v2-line); min-width:0; }
  .dlp-kpi-label { font-size:12.5px; color:var(--v2-fg-2); }
  .dlp-kpi-value { font-size:28px; font-weight:600; letter-spacing:-0.02em; line-height:1.25; font-variant-numeric:tabular-nums; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .dlp-kpi-hint { font-size:12px; color:var(--v2-fg-3); }

  /* ── Painéis ── */
  .dlp-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:20px; }
  .dlp-span-2 { grid-column:span 2; }
  @media (max-width: 1100px) { .dlp-grid { grid-template-columns:minmax(0, 1fr); } .dlp-span-2 { grid-column:auto; } }
  .dlp-panel { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; min-width:0; }
  .dlp-panel-hdr { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:14px 18px 4px; flex-wrap:wrap; }
  .dlp-panel-title { font-size:14px; font-weight:600; margin:0; color:var(--v2-fg); }
  .dlp-panel-sub { margin:2px 0 0; font-size:12.5px; color:var(--v2-fg-3); }
  .dlp-panel-body { padding:12px 18px 18px; }

  /* ── Por onde o dado tentou sair (formato anterior) ── */
  .dlp-canal { display:grid; grid-template-columns:104px 1fr 46px; align-items:center; gap:12px;
    width:100%; padding:7px 8px; border:none; background:transparent; border-radius:8px;
    font-family:'DM Sans',sans-serif; text-align:left; cursor:pointer; transition:background .15s, opacity .15s; }
  .dlp-canal:hover { background:rgba(var(--tl-ink, 255,255,255),0.035); }
  .dlp-canal.on { background:rgba(var(--tl-ink, 255,255,255),0.06); }
  .dlp-canal.off { opacity:.4; }
  .dlp-canal-nome { font-size:11px; color:${T.textSecondary}; font-family:'IBM Plex Mono',monospace; text-align:right;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .dlp-canal-track { height:22px; border-radius:5px; overflow:hidden; background:rgba(var(--tl-line-rgb, 30,38,64),0.5); }
  .dlp-canal-fill { height:100%; border-radius:5px; transition:width .6s ease; }
  .dlp-canal-val { font-size:12px; font-weight:700; font-family:'IBM Plex Mono',monospace; text-align:right; }

  /* ── Etiquetas (informação sensível) ── */
  .dlp-tags { display:flex; flex-wrap:wrap; gap:8px; }
  .dlp-tag { display:inline-flex; align-items:center; gap:8px; height:30px; padding:0 10px; border-radius:8px; border:1px solid var(--v2-line); background:var(--v2-surface); font-size:12.5px; color:var(--v2-fg); font-family:inherit; cursor:pointer; }
  .dlp-tag:hover:not(.static) { background:var(--v2-hover); }
  .dlp-tag.static { cursor:default; }
  .dlp-tag[aria-pressed="true"] { background:color-mix(in oklch, var(--v2-accent) 14%, transparent); border-color:color-mix(in oklch, var(--v2-accent) 45%, transparent); }
  .dlp-tag b { font-family:var(--font-data); font-weight:500; font-size:12px; color:var(--v2-fg-2); }

  /* ── Quem mais acionou ── */
  .dlp-list { display:grid; }
  .dlp-list button { display:grid; grid-template-columns:minmax(0, 1fr) auto; gap:10px; align-items:center; padding:8px; margin:0 -8px; border:0; border-radius:8px; background:transparent; text-align:left; color:var(--v2-fg); cursor:pointer; font-family:inherit; }
  .dlp-list button:hover { background:var(--v2-hover); }
  .dlp-list button[aria-pressed="true"] { background:color-mix(in oklch, var(--v2-accent) 14%, transparent); }
  .dlp-list span { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .dlp-list b { font-family:var(--font-data); font-weight:500; font-size:12.5px; color:var(--v2-fg-2); }

  /* ── Aviso ── */
  .dlp-note { display:flex; gap:10px; align-items:flex-start; padding:10px 14px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-surface); font-size:12.5px; color:var(--v2-fg-2); }
  .dlp-note svg { flex-shrink:0; margin-top:1px; color:var(--v2-fg-3); }

  /* ── Tabela ── */
  .dlp-toolbar { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:12px 18px; border-bottom:1px solid var(--v2-line); }
  .dlp-toolbar .dlp-panel-title { margin-right:4px; }
  .dlp-count { font-weight:400; font-size:13px; color:var(--v2-fg-3); }
  .dlp-busca { display:inline-flex; align-items:center; gap:8px; height:32px; padding:0 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-bg); color:var(--v2-fg-3); width:300px; max-width:100%; }
  .dlp-busca:focus-within { border-color:var(--v2-accent); box-shadow:0 0 0 3px color-mix(in oklch, var(--v2-accent) 18%, transparent); }
  .dlp-busca input { flex:1; min-width:0; border:0; outline:none; background:transparent; color:var(--v2-fg); font-size:13px; font-family:inherit; }
  .dlp-busca input::placeholder { color:var(--v2-fg-3); }
  .dlp-chip { display:inline-flex; align-items:center; gap:6px; height:28px; padding:0 8px 0 10px; border-radius:99px; border:0; background:color-mix(in oklch, var(--v2-accent) 14%, transparent); color:var(--v2-fg); font-size:12.5px; font-family:inherit; cursor:pointer; max-width:100%; }
  .dlp-chip svg { color:var(--v2-fg-3); flex-shrink:0; }
  .dlp-scroll { overflow:auto; max-height:560px; }
  .dlp-table { width:100%; border-collapse:collapse; font-size:13px; }
  .dlp-table th { position:sticky; top:0; z-index:1; padding:9px 12px; font-size:12px; font-weight:500; color:var(--v2-fg-3); text-align:left; background:var(--v2-surface); border-bottom:1px solid var(--v2-line); white-space:nowrap; }
  .dlp-table td { padding:8px 12px; height:44px; border-bottom:1px solid var(--v2-line); vertical-align:middle; }
  .dlp-table th:first-child, .dlp-table td:first-child { padding-left:18px; }
  .dlp-table th:last-child, .dlp-table td:last-child { padding-right:18px; }
  .dlp-table tbody tr { cursor:pointer; }
  .dlp-table tbody tr:hover td { background:var(--v2-hover); }
  .dlp-table tbody tr:last-child td { border-bottom:0; }
  .dlp-trunc { display:block; max-width:220px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .dlp-cpill { display:inline-flex; align-items:center; gap:6px; height:22px; padding:0 8px; border-radius:5px; font-size:12px; font-weight:500; white-space:nowrap; background:color-mix(in srgb, var(--c) 14%, transparent); color:color-mix(in srgb, var(--c) 75%, var(--v2-fg)); }
  .dlp-cpill::before { content:""; width:7px; height:7px; border-radius:50%; background:var(--c); }

  /* ── Vazio ── */
  .dlp-empty { padding:40px 24px; display:flex; flex-direction:column; align-items:center; gap:8px; text-align:center; }
  .dlp-empty-t { font-weight:600; }
  .dlp-empty-s { font-size:13px; color:var(--v2-fg-3); max-width:52ch; }
  .dlp-caminho { font-family:var(--font-data); font-size:12.5px; color:var(--v2-fg-2); padding:6px 10px; border:1px solid var(--v2-line); border-radius:8px; background:var(--v2-surface-2); }

  /* ── Botões ── */
  .dlp-btn { display:inline-flex; align-items:center; gap:7px; height:34px; padding:0 14px; border-radius:8px; border:1px solid var(--v2-line); background:var(--v2-surface); font-size:13px; font-weight:500; color:var(--v2-fg); cursor:pointer; font-family:inherit; }
  .dlp-btn:hover { background:var(--v2-hover); border-color:var(--v2-line-strong); }
  .dlp-btn.ghost { background:transparent; border-color:transparent; color:var(--v2-fg-2); }
  .dlp-btn.sm { height:28px; padding:0 10px; font-size:12.5px; }

  /* ── Tooltip do gráfico ── */
  .dlp-tip { display:grid; gap:2px; padding:8px 10px; background:var(--v2-surface-2); border:1px solid var(--v2-line-strong); border-radius:8px; font-size:12px; box-shadow:0 12px 32px rgba(0,0,0,0.3); }
  .dlp-tip span { color:var(--v2-fg-2); font-family:var(--font-data); }

  /* ── Painel lateral ── */
  .dlp-sheet { gap:20px; }
  .dlp-dl { display:grid; grid-template-columns:130px minmax(0, 1fr); gap:10px 16px; font-size:13px; margin:0; }
  .dlp-dl dt { color:var(--v2-fg-3); }
  .dlp-dl dd { margin:0; min-width:0; overflow-wrap:anywhere; }
  .dlp-secao { font-size:12px; font-weight:600; text-transform:uppercase; letter-spacing:0.08em; color:var(--v2-fg-3); margin:0 0 8px; }
  .dlp-link { color:var(--v2-accent); display:inline-flex; align-items:center; gap:5px; }
  .dlp-toggle { display:inline-flex; align-items:center; gap:6px; border:0; background:transparent; padding:0; font-size:13px; color:var(--v2-accent); cursor:pointer; font-family:inherit; }
  .dlp-raw { margin:10px 0 0; font:400 11.5px/1.55 var(--font-data); background:var(--v2-surface-2); border:1px solid var(--v2-line); border-radius:8px; padding:10px 12px; color:var(--v2-fg-2); overflow:auto; max-height:320px; }
  .dlp-sheet-actions { display:flex; flex-wrap:wrap; gap:8px; justify-content:flex-end; border-top:1px solid var(--v2-line); padding-top:14px; }
`;

type DlpEventRow = {
  id: string;
  creation_time: string | null;
  collected_at: string;
  operation: string | null;
  workload: string | null;
  user_id: string | null;
  client_ip: string | null;
  policy_name: string | null;
  rule_name: string | null;
  sensitive_info: unknown;
  file_name: string | null;
  file_url: string | null;
  raw_event: unknown;
  status: string;
};

// Janelas do seletor de período. `creation_time` é quando o evento aconteceu
// no Purview; `collected_at` é o fallback de quando nós o coletamos.
type PeriodoKey = "7" | "14" | "30" | "tudo";
const PERIODOS: Array<{ k: PeriodoKey; rotulo: string; dias?: number }> = [
  { k: "7", rotulo: "7 dias", dias: 7 },
  { k: "14", rotulo: "14 dias", dias: 14 },
  { k: "30", rotulo: "30 dias", dias: 30 },
  { k: "tudo", rotulo: "Tudo" },
];
const tsDe = (ev?: { creation_time: string | null; collected_at: string } | null) =>
  ev ? (ev.creation_time ?? ev.collected_at) : null;

const nf = new Intl.NumberFormat("pt-BR");
const fmtDate = (iso: string | null) =>
  iso
    ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" })
    : "sem data";

// Tempo relativo: "há 12 min" comunica frescor melhor que um carimbo de data.
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

// O Purview varia o formato do payload por workload, e o campo
// `sensitive_info` guarda o evento inteiro. Em vez de assumir um caminho fixo
// (PolicyDetails[].Rules[].ConditionsMatched.SensitiveInformation[]), varremos
// o objeto atrás de qualquer nó com SensitiveInformationTypeName. Se nada for
// encontrado, o detalhe cai para o JSON bruto — nunca inventa classificação.
function tiposSensiveis(raw: unknown): Array<{ nome: string; qtd: number }> {
  const mapa = new Map<string, number>();
  const visita = (n: unknown, prof: number) => {
    if (prof > 8 || n == null || typeof n !== "object") return;
    if (Array.isArray(n)) {
      n.forEach((i) => visita(i, prof + 1));
      return;
    }
    const o = n as Record<string, unknown>;
    const nome = o.SensitiveInformationTypeName ?? o.SensitiveInfoTypeName ?? o.SensitiveType;
    if (typeof nome === "string" && nome.trim()) {
      const qtd = Number(o.Count ?? o.SensitiveInformationCount ?? 1) || 1;
      mapa.set(nome, (mapa.get(nome) ?? 0) + qtd);
    }
    Object.values(o).forEach((v) => visita(v, prof + 1));
  };
  visita(raw, 0);
  return [...mapa.entries()].map(([nome, qtd]) => ({ nome, qtd })).sort((a, b) => b.qtd - a.qtd);
}

function Kpi({ label, valor, hint }: { label: string; valor: string; hint?: string }) {
  return (
    <div className="dlp-kpi">
      <span className="dlp-kpi-label">{label}</span>
      <span className="dlp-kpi-value">{valor}</span>
      {hint && <span className="dlp-kpi-hint">{hint}</span>}
    </div>
  );
}

// Tooltip do gráfico "Eventos por dia"
function SerieTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: Array<{ payload: { dia: string; qtd: number } }>;
}) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  const d = new Date(p.dia + "T12:00:00");
  return (
    <div className="dlp-tip">
      <b>{d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}</b>
      <span>
        {nf.format(p.qtd)} {p.qtd === 1 ? "evento" : "eventos"}
      </span>
    </div>
  );
}

export function DlpDashboard() {
  const fetchEvents = useServerFn(listDlpEvents);
  const fetchStatus = useServerFn(getDlpSyncStatus);

  const { data: eventsData, isLoading } = useQuery({
    queryKey: ["dlp-events"],
    queryFn: () => fetchEvents(),
    refetchInterval: 60_000,
  });
  const { data: statusData } = useQuery({
    queryKey: ["dlp-sync-status"],
    queryFn: () => fetchStatus(),
    refetchInterval: 60_000,
  });

  const events = React.useMemo(() => (eventsData?.events ?? []) as DlpEventRow[], [eventsData]);
  const [selected, setSelected] = React.useState<DlpEventRow | null>(null);
  const [verRaw, setVerRaw] = React.useState(false);
  const [busca, setBusca] = React.useState("");
  const [periodo, setPeriodo] = React.useState<PeriodoKey>("tudo");
  const [canal, setCanal] = React.useState<string | null>(null);
  const [tipo, setTipo] = React.useState<string | null>(null);
  const [pessoa, setPessoa] = React.useState<string | null>(null);
  const [politica, setPolitica] = React.useState<string | null>(null);

  // A varredura do payload é cara (recursiva, sobre o evento inteiro), então
  // roda UMA vez por evento e o resultado alimenta tanto o resumo quanto o
  // filtro por tipo de informação.
  const tiposPorEvento = React.useMemo(() => {
    const m = new Map<string, Array<{ nome: string; qtd: number }>>();
    for (const ev of events) m.set(ev.id, tiposSensiveis(ev.sensitive_info ?? ev.raw_event));
    return m;
  }, [events]);

  // O período é o filtro de cima: tudo que a tela mostra passa por ele antes,
  // então KPI, barra, gráfico e tabela contam sempre a mesma janela.
  const noPeriodo = React.useMemo(() => {
    const dias = PERIODOS.find((p) => p.k === periodo)?.dias;
    if (!dias) return events;
    const corte = Date.now() - dias * 86400_000;
    return events.filter((ev) => {
      const t = tsDe(ev);
      return t != null && new Date(t).getTime() >= corte;
    });
  }, [events, periodo]);

  // Tudo o que a tela resume sai daqui, das mesmas linhas já carregadas.
  const resumo = React.useMemo(() => {
    const usuarios = new Set<string>();
    const politicas = new Set<string>();
    const porCanal = new Map<string, number>();
    const porPessoa = new Map<string, number>();
    const tipos = new Map<string, number>();
    for (const ev of noPeriodo) {
      if (ev.user_id) {
        usuarios.add(ev.user_id.toLowerCase());
        porPessoa.set(ev.user_id, (porPessoa.get(ev.user_id) ?? 0) + 1);
      }
      if (ev.policy_name) politicas.add(ev.policy_name);
      const w = ev.workload ?? "Outro";
      porCanal.set(w, (porCanal.get(w) ?? 0) + 1);
      for (const t of tiposPorEvento.get(ev.id) ?? []) {
        tipos.set(t.nome, (tipos.get(t.nome) ?? 0) + t.qtd);
      }
    }
    const canais = [...porCanal.entries()]
      .map(([w, qtd]) => ({ w, qtd, ...canalDe(w) }))
      .sort((a, b) => b.qtd - a.qtd);
    return {
      usuarios: usuarios.size,
      politicas: politicas.size,
      canais,
      maxCanal: canais[0]?.qtd ?? 0,
      pessoas: [...porPessoa.entries()]
        .map(([nome, qtd]) => ({ nome, qtd }))
        .sort((a, b) => b.qtd - a.qtd)
        .slice(0, 6),
      tipos: [...tipos.entries()]
        .map(([nome, qtd]) => ({ nome, qtd }))
        .sort((a, b) => b.qtd - a.qtd)
        .slice(0, 10),
      ultimo: tsDe(noPeriodo[0] ?? events[0]),
    };
  }, [noPeriodo, events, tiposPorEvento]);

  // Série com todos os dias da janela, inclusive os sem evento: buraco no meio
  // é informação, e sumir com ele distorce a leitura.
  const serieDias = periodo === "tudo" ? 30 : (PERIODOS.find((p) => p.k === periodo)?.dias ?? 30);
  const serie = React.useMemo(() => {
    const dias: Array<{ dia: string; rotulo: string; qtd: number }> = [];
    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);
    for (let i = serieDias - 1; i >= 0; i--) {
      const d = new Date(hoje.getTime() - i * 86400_000);
      dias.push({
        dia: d.toISOString().slice(0, 10),
        rotulo: d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        qtd: 0,
      });
    }
    const idx = new Map(dias.map((d, i) => [d.dia, i]));
    for (const ev of noPeriodo) {
      const q = tsDe(ev)?.slice(0, 10);
      const i = q != null ? idx.get(q) : undefined;
      if (i != null) dias[i].qtd += 1;
    }
    return dias;
  }, [noPeriodo, serieDias]);

  const filtrados = React.useMemo(() => {
    const q = busca.trim().toLowerCase();
    return noPeriodo.filter((ev) => {
      if (canal && (ev.workload ?? "Outro") !== canal) return false;
      if (tipo && !(tiposPorEvento.get(ev.id) ?? []).some((t) => t.nome === tipo)) return false;
      if (pessoa && ev.user_id !== pessoa) return false;
      if (politica && ev.policy_name !== politica) return false;
      if (!q) return true;
      return [ev.user_id, ev.policy_name, ev.rule_name, ev.file_name, ev.client_ip, ev.operation]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [noPeriodo, busca, canal, tipo, pessoa, politica, tiposPorEvento]);

  const semEventos = !isLoading && events.length === 0;

  // Cada filtro ativo vira uma etiqueta removível na faixa acima da tabela.
  const ativos: Array<{ id: string; texto: string; limpar: () => void }> = [
    canal
      ? { id: "canal", texto: `Canal: ${canalDe(canal).nome}`, limpar: () => setCanal(null) }
      : null,
    tipo ? { id: "tipo", texto: `Informação: ${tipo}`, limpar: () => setTipo(null) } : null,
    pessoa ? { id: "pessoa", texto: `Pessoa: ${pessoa}`, limpar: () => setPessoa(null) } : null,
    politica
      ? { id: "politica", texto: `Política: ${politica}`, limpar: () => setPolitica(null) }
      : null,
    busca.trim()
      ? { id: "busca", texto: `Busca: ${busca.trim()}`, limpar: () => setBusca("") }
      : null,
  ].filter(Boolean) as Array<{ id: string; texto: string; limpar: () => void }>;

  const limparTudo = () => {
    setCanal(null);
    setTipo(null);
    setPessoa(null);
    setPolitica(null);
    setBusca("");
  };

  const selTipos = selected ? tiposSensiveis(selected.sensitive_info ?? selected.raw_event) : [];

  return (
    <div className="dlp-root">
      <style>{CSS}</style>

      {/* ── Cabeçalho da página ──────────────────────────────────────────── */}
      <div className="dlp-ph">
        <div>
          <h1 className="dlp-ph-title">Prevenção de vazamento de dados</h1>
          <p className="dlp-ph-sub">
            <span className="dlp-live">
              Sincronizado {fmtRel(statusData?.lastCollection ?? null)}
            </span>
            <span>·</span>
            <span>Microsoft Purview · eventos de política DLP</span>
          </p>
        </div>
        <SyncActions moduleSlug="dlp" jobs={["dlp-sync"]}>
          <div className="dlp-seg" role="group" aria-label="Período">
            {PERIODOS.map((p) => (
              <button
                key={p.k}
                type="button"
                aria-pressed={periodo === p.k}
                onClick={() => setPeriodo(p.k)}
              >
                {p.rotulo}
              </button>
            ))}
          </div>
        </SyncActions>
      </div>

      {semEventos ? (
        <div className="dlp-panel">
          <div className="dlp-empty">
            <div className="dlp-empty-t">Nenhum evento coletado ainda</div>
            <div className="dlp-empty-s">
              Conecte o Microsoft Purview para que as políticas de DLP passem a reportar aqui. Os
              eventos aparecem na primeira sincronização depois da configuração.
            </div>
            <div className="dlp-caminho">Integrações → Microsoft Purview DLP</div>
          </div>
        </div>
      ) : (
        <>
          {/* ── KPIs ───────────────────────────────────────────────────────── */}
          <div className="dlp-kpis">
            <Kpi
              label="Eventos"
              valor={isLoading ? "…" : nf.format(noPeriodo.length)}
              hint={
                periodo === "tudo"
                  ? "todos os sincronizados"
                  : `nos últimos ${PERIODOS.find((p) => p.k === periodo)?.dias} dias`
              }
            />
            <Kpi
              label="Pessoas envolvidas"
              valor={isLoading ? "…" : nf.format(resumo.usuarios)}
              hint="usuários distintos"
            />
            <Kpi
              label="Políticas acionadas"
              valor={isLoading ? "…" : nf.format(resumo.politicas)}
              hint="políticas que dispararam"
            />
            <Kpi
              label="Canal mais usado"
              valor={isLoading ? "…" : (resumo.canais[0]?.nome ?? "n/d")}
              hint={
                resumo.canais[0]
                  ? `${nf.format(resumo.canais[0].qtd)} de ${nf.format(noPeriodo.length)} eventos`
                  : undefined
              }
            />
            <Kpi
              label="Último evento"
              valor={isLoading ? "…" : fmtRel(resumo.ultimo)}
              hint={resumo.ultimo ? fmtDate(resumo.ultimo) : undefined}
            />
          </div>

          <div className="dlp-grid">
            {/* ── Por onde o dado tentou sair (mesmo formato de antes) ────── */}
            <div className="dlp-panel">
              <div className="dlp-panel-hdr">
                <div>
                  <h2 className="dlp-panel-title">Por onde o dado tentou sair</h2>
                  <p className="dlp-panel-sub">Clique num canal para filtrar</p>
                </div>
              </div>
              <div className="dlp-panel-body">
                {resumo.canais.length === 0 ? (
                  <div className="dlp-muted">Sem canal identificado.</div>
                ) : (
                  resumo.canais.map((c) => (
                    <button
                      key={c.w}
                      className={`dlp-canal${canal === c.w ? " on" : canal ? " off" : ""}`}
                      aria-pressed={canal === c.w}
                      onClick={() => setCanal(canal === c.w ? null : c.w)}
                      title={canal === c.w ? "Remover filtro" : `Filtrar por ${c.nome}`}
                    >
                      <span className="dlp-canal-nome">{c.nome}</span>
                      <span className="dlp-canal-track">
                        <span
                          className="dlp-canal-fill"
                          style={{
                            display: "block",
                            width: `${resumo.maxCanal ? (c.qtd / resumo.maxCanal) * 100 : 0}%`,
                            background: c.cor,
                          }}
                        />
                      </span>
                      <span className="dlp-canal-val" style={{ color: c.cor }}>
                        {nf.format(c.qtd)}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* ── Eventos por dia ─────────────────────────────────────────── */}
            <div className="dlp-panel dlp-span-2">
              <div className="dlp-panel-hdr">
                <div>
                  <h2 className="dlp-panel-title">Eventos por dia</h2>
                  <p className="dlp-panel-sub">
                    Últimos {serieDias} dias, inclusive os dias sem evento
                  </p>
                </div>
              </div>
              <div className="dlp-panel-body" style={{ height: 240 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={serie} margin={{ top: 8, right: 10, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke="var(--v2-line)" vertical={false} />
                    <XAxis
                      dataKey="rotulo"
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={44} />
                    <Tooltip
                      cursor={{ stroke: "var(--v2-line-strong)" }}
                      content={<SerieTooltip />}
                    />
                    <Area
                      type="linear"
                      dataKey="qtd"
                      stroke="var(--v2-med)"
                      strokeWidth={2}
                      fill="color-mix(in oklch, var(--v2-med) 20%, transparent)"
                      dot={(props: { cx?: number; cy?: number; index?: number }) =>
                        props.index === serie.length - 1 ? (
                          <circle
                            key="ultimo"
                            cx={props.cx}
                            cy={props.cy}
                            r={4}
                            fill="var(--v2-med)"
                            stroke="var(--v2-surface)"
                            strokeWidth={2}
                          />
                        ) : (
                          <g key={`d${props.index}`} />
                        )
                      }
                      activeDot={{
                        r: 4,
                        fill: "var(--v2-med)",
                        stroke: "var(--v2-surface)",
                        strokeWidth: 2,
                      }}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="dlp-grid">
            {/* ── Informação sensível detectada ───────────────────────────── */}
            <div className="dlp-panel dlp-span-2">
              <div className="dlp-panel-hdr">
                <div>
                  <h2 className="dlp-panel-title">Informação sensível detectada</h2>
                  <p className="dlp-panel-sub">
                    Quantidade de ocorrências nos eventos · clique para filtrar
                  </p>
                </div>
              </div>
              <div className="dlp-panel-body">
                {resumo.tipos.length === 0 ? (
                  <div className="dlp-muted">
                    Nenhum tipo de informação identificado nos eventos do período.
                  </div>
                ) : (
                  <div className="dlp-tags">
                    {resumo.tipos.map((t) => (
                      <button
                        key={t.nome}
                        type="button"
                        className="dlp-tag"
                        aria-pressed={tipo === t.nome}
                        onClick={() => setTipo(tipo === t.nome ? null : t.nome)}
                        title={tipo === t.nome ? "Remover filtro" : `Filtrar por ${t.nome}`}
                      >
                        {t.nome} <b>{nf.format(t.qtd)}</b>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* ── Quem mais acionou ───────────────────────────────────────── */}
            <div className="dlp-panel">
              <div className="dlp-panel-hdr">
                <div>
                  <h2 className="dlp-panel-title">Quem mais acionou</h2>
                  <p className="dlp-panel-sub">Pessoas com mais eventos · clique para filtrar</p>
                </div>
              </div>
              <div className="dlp-panel-body">
                {resumo.pessoas.length === 0 ? (
                  <div className="dlp-muted">Nenhuma pessoa identificada.</div>
                ) : (
                  <div className="dlp-list">
                    {resumo.pessoas.map((p) => (
                      <button
                        key={p.nome}
                        type="button"
                        aria-pressed={pessoa === p.nome}
                        onClick={() => setPessoa(pessoa === p.nome ? null : p.nome)}
                        title={pessoa === p.nome ? "Remover filtro" : `Filtrar por ${p.nome}`}
                      >
                        <span className="mono">{p.nome}</span>
                        <b>{nf.format(p.qtd)}</b>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="dlp-note">
            <ShieldAlert size={15} />
            <span>
              O Purview ainda não envia severidade nem status de investigação. Por isso o painel
              mostra volume, canal e tipo de informação, sem classificar o risco de cada evento.
            </span>
          </div>

          {/* ── Eventos ────────────────────────────────────────────────────── */}
          <div className="dlp-panel">
            <div className="dlp-toolbar">
              <div className="dlp-panel-title">
                Eventos{" "}
                <span className="dlp-count">
                  {nf.format(filtrados.length)}
                  {filtrados.length !== noPeriodo.length
                    ? ` de ${nf.format(noPeriodo.length)}`
                    : ""}
                </span>
              </div>
              <label className="dlp-busca">
                <Search size={14} />
                <input
                  value={busca}
                  onChange={(e) => setBusca(e.target.value)}
                  placeholder="Buscar pessoa, política, arquivo ou IP"
                  aria-label="Buscar eventos"
                />
              </label>
              {ativos.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="dlp-chip"
                  onClick={a.limpar}
                  title="Remover filtro"
                >
                  {a.texto} <X size={14} aria-label="Remover filtro" />
                </button>
              ))}
              {ativos.length > 1 && (
                <button type="button" className="dlp-btn ghost sm" onClick={limparTudo}>
                  Limpar tudo
                </button>
              )}
            </div>

            {isLoading ? (
              <div className="dlp-empty">
                <div className="dlp-empty-s">Carregando eventos…</div>
              </div>
            ) : filtrados.length === 0 ? (
              <div className="dlp-empty">
                <div className="dlp-empty-t">Nenhum evento com esses filtros</div>
                <div className="dlp-empty-s">Remova um filtro ou mude o período.</div>
                {ativos.length > 0 && (
                  <button type="button" className="dlp-btn sm" onClick={limparTudo}>
                    Limpar filtros
                  </button>
                )}
              </div>
            ) : (
              <div className="dlp-scroll">
                <table className="dlp-table">
                  <thead>
                    <tr>
                      <th>Data e hora</th>
                      <th>Pessoa</th>
                      <th>Política</th>
                      <th>Regra</th>
                      <th>Canal</th>
                      <th>Arquivo</th>
                      <th>IP de origem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map((ev) => {
                      const c = canalDe(ev.workload);
                      const abrir = () => {
                        // O JSON bruto volta recolhido a cada evento: quem
                        // abriu um raw antes não quer o próximo já aberto.
                        setVerRaw(false);
                        setSelected(ev);
                      };
                      return (
                        <tr
                          key={ev.id}
                          tabIndex={0}
                          onClick={abrir}
                          onKeyDown={(e) => e.key === "Enter" && abrir()}
                        >
                          <td className="mono dim">{fmtDate(ev.creation_time)}</td>
                          <td>
                            <span className="dlp-trunc mono" title={ev.user_id ?? undefined}>
                              {ev.user_id ?? <span className="dim">não identificada</span>}
                            </span>
                          </td>
                          <td>
                            <span className="dlp-trunc" title={ev.policy_name ?? undefined}>
                              {ev.policy_name ?? <span className="dim">sem política</span>}
                            </span>
                          </td>
                          <td>
                            <span className="dlp-trunc dim" title={ev.rule_name ?? undefined}>
                              {ev.rule_name ?? "sem regra"}
                            </span>
                          </td>
                          <td>
                            <span
                              className="dlp-cpill"
                              style={{ ["--c" as string]: c.cor } as React.CSSProperties}
                            >
                              {c.nome}
                            </span>
                          </td>
                          <td>
                            <span className="dlp-trunc" title={ev.file_name ?? undefined}>
                              {ev.file_name ?? <span className="dim">sem arquivo</span>}
                            </span>
                          </td>
                          <td className="mono dim">{ev.client_ip ?? "—"}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}

      {/* ── Painel lateral: detalhe do evento ──────────────────────────────── */}
      <DetailSheet
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        eyebrow={
          selected ? `${fmtDate(selected.creation_time)} · ${fmtRel(selected.creation_time)}` : null
        }
        title={selected?.policy_name ?? "Sem política identificada"}
        badges={
          selected && (
            <>
              <span
                className="dlp-cpill"
                style={{ ["--c" as string]: canalDe(selected.workload).cor } as React.CSSProperties}
              >
                {canalDe(selected.workload).nome}
              </span>
              <span className="dlp-tag static">{selected.rule_name ?? "sem regra"}</span>
            </>
          )
        }
        footer={
          selected && (
            <>
              {selected.user_id && (
                <button
                  type="button"
                  className="dlp-btn ghost"
                  onClick={() => {
                    setPessoa(selected.user_id);
                    setSelected(null);
                  }}
                >
                  Ver eventos desta pessoa
                </button>
              )}
              {selected.policy_name && (
                <button
                  type="button"
                  className="dlp-btn"
                  onClick={() => {
                    setPolitica(selected.policy_name);
                    setSelected(null);
                  }}
                >
                  Ver eventos desta política
                </button>
              )}
            </>
          )
        }
      >
        {selected && (
          <div className="dlp-root dlp-sheet">
            <style>{CSS}</style>
            <DetailList
              items={[
                ["Pessoa", selected.user_id ?? <span className="dim">não identificada</span>, true],
                [
                  "Operação",
                  selected.operation ?? <span className="dim">não informada</span>,
                  true,
                ],
                ["Canal", canalDe(selected.workload).nome],
                [
                  "Arquivo",
                  selected.file_url ? (
                    <a
                      className="dlp-link"
                      href={selected.file_url}
                      target="_blank"
                      rel="noreferrer"
                    >
                      {selected.file_name ?? "abrir arquivo"} <ExternalLink size={12} />
                    </a>
                  ) : (
                    (selected.file_name ?? <span className="dim">sem arquivo</span>)
                  ),
                ],
                [
                  "IP de origem",
                  selected.client_ip ?? <span className="dim">não informado</span>,
                  true,
                ],
              ]}
            />

            {selTipos.length > 0 && (
              <DetailSection title="Informação sensível detectada">
                <div className="dlp-tags">
                  {selTipos.map((t) => (
                    <span key={t.nome} className="dlp-tag static">
                      {t.nome} <b>{nf.format(t.qtd)}</b>
                    </span>
                  ))}
                </div>
              </DetailSection>
            )}

            <div>
              {/* O JSON bruto continua acessível, mas recolhido: é material
                  de investigação, não a leitura principal do evento. */}
              <button
                type="button"
                className="dlp-toggle"
                aria-expanded={verRaw}
                onClick={() => setVerRaw((v) => !v)}
              >
                <ChevronDown
                  size={14}
                  style={{
                    transform: verRaw ? "rotate(180deg)" : "none",
                    transition: "transform .15s",
                  }}
                />
                {verRaw ? "Ocultar evento bruto" : "Ver evento bruto"}
              </button>
              {verRaw && (
                <pre className="dlp-raw">{JSON.stringify(selected.raw_event, null, 2)}</pre>
              )}
            </div>
          </div>
        )}
      </DetailSheet>
    </div>
  );
}

export default DlpDashboard;
