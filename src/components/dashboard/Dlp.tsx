import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import {
  FileWarning,
  ShieldAlert,
  Clock,
  Users,
  ScrollText,
  Search,
  DoorOpen,
  ExternalLink,
  ChevronDown,
  X,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { listDlpEvents, getDlpSyncStatus } from "@/lib/dlp.functions";

// Módulo DLP (Purview) — Fase 1: só leitura dos eventos já sincronizados
// (ver dlp.server.ts / api/public/hooks/dlp-sync.ts). Não há severidade nem
// status de investigação no modelo ainda, então NADA aqui inventa criticidade:
// o que a tela mostra é volume, canal de saída, tipo de informação detectada e
// o evento completo. Tudo derivado das mesmas 500 linhas que a listagem já
// carrega — sem consulta nova ao banco.

// ── Design Tokens ──────────────────────────────────────────────────────────────
const T = {
  surface: "#0F1420",
  surfaceAlt: "#131825",
  border: "#1E2640",
  borderHi: "#2A3560",
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
  textPrimary: "#F1F5F9",
  textSecondary: "#94A3B8",
  textMuted: "#7C8AA0",
  chartGrid: "rgba(30,38,64,0.7)",
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
const canalDe = (w: string | null) => (w && CANAL[w]) || { nome: w ?? "Outro", cor: "#6B7280" };

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=IBM+Plex+Mono:wght@400;500;600&family=Space+Grotesk:wght@400;500;600;700&display=swap');

  .dlp-root { font-family:'DM Sans',sans-serif; color:${T.textPrimary}; display:flex; flex-direction:column; gap:16px; }
  .dlp-root * { box-sizing:border-box; }
  @keyframes dlp-fadeup { from{opacity:0;transform:translateY(6px)} to{opacity:1;transform:translateY(0)} }
  .dlp-fadeup { animation:dlp-fadeup .3s ease forwards; }
  .dlp-root ::-webkit-scrollbar { width:4px; height:4px; }
  .dlp-root ::-webkit-scrollbar-track { background:transparent; }
  .dlp-root ::-webkit-scrollbar-thumb { background:${T.borderHi}; border-radius:2px; }
  .dlp-root .recharts-cartesian-axis-tick-value { fill:${T.textMuted} !important; font-size:10px; font-family:'IBM Plex Mono',monospace; }

  /* ── Header ── */
  .dlp-hdr { background:${T.surface}; border:1px solid ${T.border}; border-radius:12px; padding:16px 22px;
    display:flex; align-items:center; justify-content:space-between; gap:16px; flex-wrap:wrap; }
  .dlp-hdr-brand { display:flex; align-items:center; gap:12px; }
  .dlp-hdr-icon { width:40px; height:40px; border-radius:10px; display:flex; align-items:center; justify-content:center;
    background:rgba(245,158,11,0.14); border:1px solid rgba(245,158,11,0.3); flex-shrink:0; }
  .dlp-hdr-title { font-size:15px; font-weight:700; font-family:'Space Grotesk',sans-serif; letter-spacing:-0.01em; }
  .dlp-hdr-sub { font-size:11px; color:${T.textMuted}; margin-top:2px; }
  .dlp-pill { display:inline-flex; align-items:center; gap:6px; padding:5px 11px; border-radius:6px; font-size:11px;
    font-family:'IBM Plex Mono',monospace; font-weight:600; background:${T.surfaceAlt}; border:1px solid ${T.border}; color:${T.textSecondary}; }

  /* ── KPI ── */
  .dlp-kpis { display:grid; grid-template-columns:repeat(5,1fr); gap:12px; }
  @media (max-width:1150px){ .dlp-kpis { grid-template-columns:repeat(3,1fr); } }
  @media (max-width:700px){ .dlp-kpis { grid-template-columns:repeat(2,1fr); } }
  .dlp-kpi { background:${T.surface}; border:1px solid ${T.border}; border-radius:10px; padding:14px 16px;
    position:relative; overflow:hidden; transition:border-color .2s; }
  .dlp-kpi:hover { border-color:${T.borderHi}; }
  .dlp-kpi::before { content:''; position:absolute; top:0; left:0; right:0; height:2px; background:var(--kc,${T.accent}); }
  .dlp-kpi-icon { position:absolute; top:10px; right:10px; width:38px; height:38px; border-radius:9px;
    display:flex; align-items:center; justify-content:center; background:var(--kbg,${T.accentGlow}); }
  .dlp-kpi-label { font-size:9px; font-weight:700; letter-spacing:.13em; text-transform:uppercase; color:${T.textMuted};
    font-family:'IBM Plex Mono',monospace; margin-bottom:6px; max-width:calc(100% - 42px); }
  .dlp-kpi-value { font-size:26px; font-weight:700; font-family:'Space Grotesk',sans-serif; letter-spacing:-0.02em;
    line-height:1.05; color:var(--kc,${T.textPrimary}); word-break:break-word; }
  .dlp-kpi-hint { font-size:10px; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; margin-top:6px; }

  /* ── Panel ── */
  .dlp-panel { background:${T.surface}; border:1px solid ${T.border}; border-radius:12px; overflow:hidden; }
  .dlp-panel-hdr { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px;
    padding:13px 20px; background:${T.surfaceAlt}; border-bottom:1px solid ${T.border}; }
  .dlp-panel-title { display:flex; align-items:center; gap:8px; font-size:11px; font-weight:700; letter-spacing:.09em;
    text-transform:uppercase; font-family:'IBM Plex Mono',monospace; color:${T.textPrimary}; }
  .dlp-panel-sub { font-size:11px; color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; }
  .dlp-panel-body { padding:16px 20px; }
  .dlp-grid { display:grid; grid-template-columns:minmax(320px,5fr) 7fr; gap:16px; }
  @media (max-width:1150px){ .dlp-grid { grid-template-columns:1fr; } }

  /* ── Canais de saída: a barra é a assinatura do módulo. Cada linha é uma
       porta pela qual o dado tentou sair, com o peso relativo à vista. ── */
  .dlp-canal { display:grid; grid-template-columns:104px 1fr 46px; align-items:center; gap:12px;
    width:100%; padding:7px 8px; border:none; background:transparent; border-radius:8px;
    font-family:'DM Sans',sans-serif; text-align:left; cursor:pointer; transition:background .15s, opacity .15s; }
  .dlp-canal:hover { background:rgba(255,255,255,0.035); }
  .dlp-canal.on { background:rgba(255,255,255,0.06); }
  .dlp-canal.off { opacity:.4; }
  .dlp-canal-nome { font-size:11px; color:${T.textSecondary}; font-family:'IBM Plex Mono',monospace; text-align:right;
    overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .dlp-canal-track { height:22px; border-radius:5px; overflow:hidden; background:rgba(30,38,64,0.5); }
  .dlp-canal-fill { height:100%; border-radius:5px; transition:width .6s ease; }
  .dlp-canal-val { font-size:12px; font-weight:700; font-family:'IBM Plex Mono',monospace; text-align:right; }

  /* ── Chips de informação sensível ── */
  .dlp-chips { display:flex; flex-wrap:wrap; gap:8px; }
  .dlp-chip { display:inline-flex; align-items:center; gap:7px; padding:5px 10px; border-radius:7px;
    background:${T.surfaceAlt}; border:1px solid ${T.border}; font-size:11.5px; color:${T.textPrimary}; }
  .dlp-chip b { font-family:'IBM Plex Mono',monospace; font-size:11px; color:${T.warning}; }
  button.dlp-chip { cursor:pointer; font-family:'DM Sans',sans-serif; transition:all .15s; }
  button.dlp-chip:hover { border-color:${T.borderHi}; }
  button.dlp-chip.on { border-color:${T.warning}; background:${T.warningBg}; }

  /* ── Seletor de período: um só estado governa KPIs, barras, gráfico e tabela,
       para os números da tela nunca discordarem entre si. ── */
  .dlp-seg { display:inline-flex; gap:2px; padding:3px; background:${T.surfaceAlt};
    border:1px solid ${T.border}; border-radius:8px; }
  .dlp-seg button { padding:5px 12px; border-radius:6px; border:none; background:transparent;
    color:${T.textMuted}; font-size:11.5px; font-weight:600; font-family:'DM Sans',sans-serif;
    cursor:pointer; transition:all .15s; }
  .dlp-seg button:hover:not(.on) { color:${T.textPrimary}; background:rgba(255,255,255,0.04); }
  .dlp-seg button.on { background:${T.accentGlow}; color:#93C5FD; }

  /* ── Filtros ativos: filtro por clique sem essa faixa vira armadilha, porque
       a lista encolhe e o motivo fica invisível. ── */
  .dlp-ativos { display:flex; align-items:center; gap:8px; flex-wrap:wrap; padding:11px 20px;
    border-bottom:1px solid ${T.border}; background:rgba(59,130,246,0.045); }
  .dlp-ativos-l { font-size:9px; font-weight:700; letter-spacing:.12em; text-transform:uppercase;
    color:${T.textMuted}; font-family:'IBM Plex Mono',monospace; }
  .dlp-ativo { display:inline-flex; align-items:center; gap:7px; padding:4px 7px 4px 10px; border-radius:6px;
    background:${T.surfaceAlt}; border:1px solid ${T.border}; font-size:11.5px; color:${T.textPrimary}; }
  .dlp-ativo button { background:none; border:none; padding:0; display:flex; cursor:pointer; color:${T.textMuted}; }
  .dlp-ativo button:hover { color:${T.danger}; }
  .dlp-limpar { background:none; border:none; color:#93C5FD; font-size:11.5px; font-weight:600;
    font-family:'DM Sans',sans-serif; cursor:pointer; padding:0 2px; }
  .dlp-limpar:hover { text-decoration:underline; }

  /* ── Filtros ── */
  .dlp-filtros { display:flex; align-items:center; gap:8px; flex-wrap:wrap; }
  .dlp-busca { display:flex; align-items:center; gap:7px; padding:6px 11px; border-radius:7px; background:${T.surfaceAlt};
    border:1px solid ${T.border}; min-width:230px; }
  .dlp-busca input { background:transparent; border:none; outline:none; color:${T.textPrimary}; font-size:12px;
    font-family:'DM Sans',sans-serif; width:100%; }
  .dlp-busca input::placeholder { color:${T.textMuted}; }
  .dlp-busca:focus-within { border-color:${T.accent}; }
  .dlp-root button:focus-visible, .dlp-root input:focus-visible { outline:2px solid ${T.accent}; outline-offset:2px; }

  /* ── Tabela ── */
  .dlp-scroll { max-height:560px; overflow:auto; }
  .dlp-table { width:100%; border-collapse:collapse; }
  .dlp-table thead { position:sticky; top:0; z-index:10; }
  .dlp-table th { padding:9px 14px; font-size:9px; font-weight:700; letter-spacing:.12em; text-transform:uppercase;
    color:${T.textPrimary}; font-family:'IBM Plex Mono',monospace; text-align:left; background:${T.surface};
    border-bottom:1px solid ${T.border}; white-space:nowrap; }
  .dlp-table td { padding:11px 14px; border-bottom:1px solid rgba(30,38,64,0.4); font-size:12.5px; vertical-align:middle; }
  .dlp-table tbody tr { cursor:pointer; transition:background .12s; }
  .dlp-table tbody tr:hover td { background:rgba(245,158,11,0.05); }
  .dlp-table tbody tr:last-child td { border-bottom:none; }
  .dlp-table .mono { font-family:'IBM Plex Mono',monospace; font-size:11px; color:${T.textSecondary}; white-space:nowrap; }
  .dlp-table .dim { color:${T.textMuted}; }
  .dlp-trunc { display:block; max-width:230px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

  .dlp-badge { display:inline-flex; align-items:center; gap:5px; padding:3px 9px; border-radius:5px; font-size:10px;
    font-weight:700; font-family:'IBM Plex Mono',monospace; border:1px solid transparent; white-space:nowrap; }
  .dlp-dot { width:7px; height:7px; border-radius:999px; flex-shrink:0; }

  /* ── Vazio: convite à ação, não aviso de erro ── */
  .dlp-empty { padding:56px 24px; text-align:center; }
  .dlp-empty-t { font-size:15px; font-weight:700; font-family:'Space Grotesk',sans-serif; }
  .dlp-empty-s { font-size:13px; color:${T.textMuted}; margin-top:8px; line-height:1.6; max-width:460px;
    margin-left:auto; margin-right:auto; }
  .dlp-caminho { display:inline-flex; align-items:center; gap:6px; margin-top:14px; padding:6px 12px; border-radius:7px;
    background:${T.accentGlow}; border:1px solid rgba(59,130,246,0.3); color:#93C5FD; font-size:11.5px;
    font-family:'IBM Plex Mono',monospace; font-weight:600; }

  /* ── Detalhe ── */
  .dlp-dl { display:grid; grid-template-columns:repeat(auto-fit,minmax(190px,1fr)); gap:1px; background:${T.border};
    border:1px solid ${T.border}; border-radius:10px; overflow:hidden; }
  .dlp-dl > div { background:${T.surface}; padding:12px 14px; }
  .dlp-dt { font-size:9px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:${T.textMuted};
    font-family:'IBM Plex Mono',monospace; margin-bottom:6px; }
  .dlp-dd { font-size:12.5px; color:${T.textPrimary}; word-break:break-word; }
  .dlp-secao { font-size:9px; font-weight:700; letter-spacing:.12em; text-transform:uppercase; color:${T.textMuted};
    font-family:'IBM Plex Mono',monospace; margin-bottom:9px; }
  .dlp-raw { background:${T.surfaceAlt}; border:1px solid ${T.border}; border-radius:8px; padding:12px;
    font-size:11px; font-family:'IBM Plex Mono',monospace; color:${T.textSecondary}; overflow:auto; max-height:300px;
    white-space:pre-wrap; word-break:break-word; margin:0; }
  .dlp-toggle { display:inline-flex; align-items:center; gap:6px; background:transparent; border:1px solid ${T.border};
    border-radius:7px; padding:6px 11px; color:${T.textSecondary}; font-size:11.5px; font-family:'DM Sans',sans-serif;
    font-weight:600; cursor:pointer; transition:all .15s; }
  .dlp-toggle:hover { border-color:${T.borderHi}; color:${T.textPrimary}; }
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
  iso ? new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "medium" }) : "sem data";

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

function Kpi({
  label,
  valor,
  hint,
  cor,
  bg,
  icon: Icon,
}: {
  label: string;
  valor: string;
  hint?: string;
  cor: string;
  bg: string;
  icon: any;
}) {
  return (
    <div className="dlp-kpi dlp-fadeup" style={{ ["--kc" as any]: cor, ["--kbg" as any]: bg }}>
      <div className="dlp-kpi-icon">
        <Icon size={17} color={cor} />
      </div>
      <div className="dlp-kpi-label">{label}</div>
      <div className="dlp-kpi-value">{valor}</div>
      {hint && <div className="dlp-kpi-hint">{hint}</div>}
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
    const tipos = new Map<string, number>();
    for (const ev of noPeriodo) {
      if (ev.user_id) usuarios.add(ev.user_id.toLowerCase());
      if (ev.policy_name) politicas.add(ev.policy_name);
      const w = ev.workload ?? "Outro";
      porCanal.set(w, (porCanal.get(w) ?? 0) + 1);
      for (const t of tiposPorEvento.get(ev.id) ?? []) {
        tipos.set(t.nome, (tipos.get(t.nome) ?? 0) + t.qtd);
      }
    }
    const canais = [...porCanal.entries()].map(([w, qtd]) => ({ w, qtd, ...canalDe(w) })).sort((a, b) => b.qtd - a.qtd);
    return {
      usuarios: usuarios.size,
      politicas: politicas.size,
      canais,
      maxCanal: canais[0]?.qtd ?? 0,
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
      if (!q) return true;
      return [ev.user_id, ev.policy_name, ev.rule_name, ev.file_name, ev.client_ip, ev.operation]
        .filter(Boolean)
        .some((v) => String(v).toLowerCase().includes(q));
    });
  }, [noPeriodo, busca, canal, tipo, tiposPorEvento]);

  const semEventos = !isLoading && events.length === 0;

  // Cada filtro ativo vira uma etiqueta removível na faixa acima da tabela.
  const ativos: Array<{ id: string; texto: string; limpar: () => void }> = [
    canal ? { id: "canal", texto: `Canal: ${canalDe(canal).nome}`, limpar: () => setCanal(null) } : null,
    tipo ? { id: "tipo", texto: `Informação: ${tipo}`, limpar: () => setTipo(null) } : null,
    busca.trim() ? { id: "busca", texto: `Busca: ${busca.trim()}`, limpar: () => setBusca("") } : null,
  ].filter(Boolean) as Array<{ id: string; texto: string; limpar: () => void }>;

  const limparTudo = () => {
    setCanal(null);
    setTipo(null);
    setBusca("");
  };

  return (
    <div className="dlp-root">
      <style>{CSS}</style>

      <div className="dlp-hdr dlp-fadeup">
        <div className="dlp-hdr-brand">
          <div className="dlp-hdr-icon">
            <FileWarning size={20} color={T.warning} />
          </div>
          <div>
            <div className="dlp-hdr-title">Prevenção de vazamento de dados</div>
            <div className="dlp-hdr-sub">Microsoft Purview · eventos de política DLP nos canais da empresa</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
          <div className="dlp-seg" role="group" aria-label="Período">
            {PERIODOS.map((p) => (
              <button key={p.k} className={periodo === p.k ? "on" : ""} onClick={() => setPeriodo(p.k)}>
                {p.rotulo}
              </button>
            ))}
          </div>
          <span className="dlp-pill">
            <Clock size={12} /> Sincronizado {fmtRel(statusData?.lastCollection ?? null)}
          </span>
        </div>
      </div>

      {semEventos ? (
        <div className="dlp-panel dlp-fadeup">
          <div className="dlp-empty">
            <div className="dlp-empty-t">Nenhum evento coletado ainda</div>
            <div className="dlp-empty-s">
              Conecte o Microsoft Purview para que as políticas de DLP passem a reportar aqui. Os eventos aparecem na
              primeira sincronização depois da configuração.
            </div>
            <div className="dlp-caminho">Integrações → Microsoft Purview DLP</div>
          </div>
        </div>
      ) : (
        <>
          <div className="dlp-kpis">
            <Kpi
              label="Eventos coletados"
              valor={isLoading ? "…" : nf.format(noPeriodo.length)}
              hint={
                periodo === "tudo"
                  ? "mais recentes primeiro"
                  : `nos últimos ${PERIODOS.find((p) => p.k === periodo)?.dias} dias`
              }
              cor={T.warning}
              bg={T.warningBg}
              icon={FileWarning}
            />
            <Kpi
              label="Pessoas envolvidas"
              valor={isLoading ? "…" : nf.format(resumo.usuarios)}
              hint="usuários distintos"
              cor={T.accent}
              bg={T.accentGlow}
              icon={Users}
            />
            <Kpi
              label="Políticas acionadas"
              valor={isLoading ? "…" : nf.format(resumo.politicas)}
              hint="regras que dispararam"
              cor={T.purple}
              bg="rgba(167,139,250,0.14)"
              icon={ScrollText}
            />
            <Kpi
              label="Canal mais usado"
              valor={isLoading ? "…" : (resumo.canais[0]?.nome ?? "n/d")}
              hint={
                resumo.canais[0]
                  ? `${nf.format(resumo.canais[0].qtd)} de ${nf.format(noPeriodo.length)} eventos`
                  : undefined
              }
              cor={resumo.canais[0]?.cor ?? T.cyan}
              bg="rgba(34,211,238,0.14)"
              icon={DoorOpen}
            />
            <Kpi
              label="Último evento"
              valor={isLoading ? "…" : fmtRel(resumo.ultimo)}
              hint={resumo.ultimo ? fmtDate(resumo.ultimo) : undefined}
              cor={T.success}
              bg={T.successBg}
              icon={Clock}
            />
          </div>

          <div className="dlp-grid">
            <div className="dlp-panel dlp-fadeup">
              <div className="dlp-panel-hdr">
                <div className="dlp-panel-title">
                  <DoorOpen size={13} /> Por onde o dado tentou sair
                </div>
                <div className="dlp-panel-sub">clique para filtrar</div>
              </div>
              <div className="dlp-panel-body">
                {resumo.canais.length === 0 ? (
                  <div style={{ fontSize: 12.5, color: T.textMuted }}>Sem canal identificado.</div>
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

                {resumo.tipos.length > 0 && (
                  <div style={{ marginTop: 20, paddingTop: 16, borderTop: `1px solid ${T.border}` }}>
                    <div className="dlp-secao">Informação sensível detectada</div>
                    <div className="dlp-chips">
                      {resumo.tipos.map((t) => (
                        <button
                          key={t.nome}
                          className={`dlp-chip${tipo === t.nome ? " on" : ""}`}
                          aria-pressed={tipo === t.nome}
                          onClick={() => setTipo(tipo === t.nome ? null : t.nome)}
                          title={tipo === t.nome ? "Remover filtro" : `Filtrar por ${t.nome}`}
                        >
                          {t.nome} <b>{nf.format(t.qtd)}</b>
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="dlp-panel dlp-fadeup">
              <div className="dlp-panel-hdr">
                <div className="dlp-panel-title">
                  <ShieldAlert size={13} /> Eventos por dia
                </div>
                <div className="dlp-panel-sub">últimos 14 dias</div>
              </div>
              <div className="dlp-panel-body" style={{ height: 232 }}>
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={serie} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                    <defs>
                      <linearGradient id="dlpGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={T.warning} stopOpacity={0.45} />
                        <stop offset="100%" stopColor={T.warning} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={T.chartGrid} strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="rotulo" tickLine={false} axisLine={false} interval="preserveStartEnd" />
                    <YAxis allowDecimals={false} tickLine={false} axisLine={false} width={44} />
                    <Tooltip
                      cursor={{ stroke: T.borderHi }}
                      contentStyle={{
                        background: T.surface,
                        border: `1px solid ${T.borderHi}`,
                        borderRadius: 8,
                        fontSize: 12,
                        fontFamily: "'IBM Plex Mono',monospace",
                        color: T.textPrimary,
                      }}
                      labelStyle={{ color: T.textMuted, fontSize: 10 }}
                      formatter={(v: any) => [nf.format(Number(v)), "eventos"]}
                    />
                    <Area type="monotone" dataKey="qtd" stroke={T.warning} strokeWidth={2} fill="url(#dlpGrad)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          <div className="dlp-panel dlp-fadeup">
            <div className="dlp-panel-hdr">
              <div className="dlp-panel-title">
                <ScrollText size={13} /> Eventos
                <span className="dlp-panel-sub" style={{ marginLeft: 4 }}>
                  {nf.format(filtrados.length)}
                  {filtrados.length !== noPeriodo.length ? ` de ${nf.format(noPeriodo.length)}` : ""}
                </span>
              </div>
              <div className="dlp-filtros">
                <label className="dlp-busca">
                  <Search size={13} color={T.textMuted} />
                  <input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar pessoa, política, arquivo ou IP"
                  />
                </label>
              </div>
            </div>

            {ativos.length > 0 && (
              <div className="dlp-ativos">
                <span className="dlp-ativos-l">Filtrando por</span>
                {ativos.map((a) => (
                  <span key={a.id} className="dlp-ativo">
                    {a.texto}
                    <button onClick={a.limpar} aria-label={`Remover filtro ${a.texto}`}>
                      <X size={12} />
                    </button>
                  </span>
                ))}
                {ativos.length > 1 && (
                  <button className="dlp-limpar" onClick={limparTudo}>
                    Limpar tudo
                  </button>
                )}
              </div>
            )}

            {isLoading ? (
              <div className="dlp-empty" style={{ padding: "40px 24px", color: T.textMuted }}>
                Carregando eventos…
              </div>
            ) : filtrados.length === 0 ? (
              <div className="dlp-empty" style={{ padding: "40px 24px" }}>
                <div className="dlp-empty-t">Nenhum evento com esse filtro</div>
                <div className="dlp-empty-s">Ajuste a busca ou volte para todos os canais.</div>
              </div>
            ) : (
              <div className="dlp-scroll">
                <table className="dlp-table">
                  <thead>
                    <tr>
                      <th style={{ width: 165 }}>Data e hora</th>
                      <th>Pessoa</th>
                      <th>Política</th>
                      <th>Regra</th>
                      <th style={{ width: 130 }}>Canal</th>
                      <th>Arquivo</th>
                      <th style={{ width: 130 }}>IP de origem</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtrados.map((ev) => {
                      const c = canalDe(ev.workload);
                      return (
                        <tr
                          key={ev.id}
                          onClick={() => {
                            // O JSON bruto volta recolhido a cada evento: quem
                            // abriu um raw antes não quer o próximo já aberto.
                            setVerRaw(false);
                            setSelected(ev);
                          }}
                        >
                          <td className="mono">{fmtDate(ev.creation_time)}</td>
                          <td>
                            <span className="dlp-trunc" title={ev.user_id ?? undefined}>
                              {ev.user_id ?? <span className="dim">não identificada</span>}
                            </span>
                          </td>
                          <td>
                            <span className="dlp-trunc" title={ev.policy_name ?? undefined}>
                              {ev.policy_name ?? <span className="dim">sem política</span>}
                            </span>
                          </td>
                          <td>
                            <span className="dlp-trunc" title={ev.rule_name ?? undefined}>
                              {ev.rule_name ?? <span className="dim">sem regra</span>}
                            </span>
                          </td>
                          <td>
                            <span
                              className="dlp-badge"
                              style={{
                                background: `${c.cor}1A`,
                                color: c.cor,
                                borderColor: `${c.cor}4D`,
                              }}
                            >
                              <span className="dlp-dot" style={{ background: c.cor }} />
                              {c.nome}
                            </span>
                          </td>
                          <td>
                            <span className="dlp-trunc" title={ev.file_name ?? undefined}>
                              {ev.file_name ?? <span className="dim">sem arquivo</span>}
                            </span>
                          </td>
                          <td className="mono">{ev.client_ip ?? "—"}</td>
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

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent
          className="max-w-3xl max-h-[85vh] overflow-y-auto"
          style={{ background: T.surfaceAlt, borderColor: T.border, color: T.textPrimary }}
        >
          <div className="dlp-root" style={{ gap: 16 }}>
            <style>{CSS}</style>
            <DialogHeader>
              <DialogTitle style={{ display: "flex", alignItems: "center", gap: 8, color: T.textPrimary }}>
                <ShieldAlert size={16} color={T.warning} /> Detalhe do evento
              </DialogTitle>
              <DialogDescription style={{ color: T.textMuted }}>
                {selected?.policy_name ?? "Sem política identificada"} · {selected?.rule_name ?? "sem regra"}
              </DialogDescription>
            </DialogHeader>

            {selected && (
              <>
                <div className="dlp-dl">
                  <div>
                    <div className="dlp-dt">Data e hora</div>
                    <div className="dlp-dd" style={{ fontFamily: "'IBM Plex Mono',monospace" }}>
                      {fmtDate(selected.creation_time)}
                    </div>
                  </div>
                  <div>
                    <div className="dlp-dt">Operação</div>
                    <div className="dlp-dd">{selected.operation ?? "não informada"}</div>
                  </div>
                  <div>
                    <div className="dlp-dt">Pessoa</div>
                    <div className="dlp-dd">{selected.user_id ?? "não identificada"}</div>
                  </div>
                  <div>
                    <div className="dlp-dt">Canal</div>
                    <div className="dlp-dd">{canalDe(selected.workload).nome}</div>
                  </div>
                  <div>
                    <div className="dlp-dt">IP de origem</div>
                    <div className="dlp-dd" style={{ fontFamily: "'IBM Plex Mono',monospace" }}>
                      {selected.client_ip ?? "não informado"}
                    </div>
                  </div>
                  <div>
                    <div className="dlp-dt">Arquivo</div>
                    <div className="dlp-dd">
                      {selected.file_url ? (
                        <a
                          href={selected.file_url}
                          target="_blank"
                          rel="noreferrer"
                          style={{
                            color: "#93C5FD",
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 5,
                          }}
                        >
                          {selected.file_name ?? "abrir arquivo"} <ExternalLink size={12} />
                        </a>
                      ) : (
                        (selected.file_name ?? "sem arquivo")
                      )}
                    </div>
                  </div>
                </div>

                {(() => {
                  const tipos = tiposSensiveis(selected.sensitive_info ?? selected.raw_event);
                  if (tipos.length === 0) return null;
                  return (
                    <div>
                      <div className="dlp-secao">Informação sensível detectada</div>
                      <div className="dlp-chips">
                        {tipos.map((t) => (
                          <span key={t.nome} className="dlp-chip">
                            {t.nome} <b>{nf.format(t.qtd)}</b>
                          </span>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                <div>
                  {/* O JSON bruto continua acessível, mas recolhido: é material
                      de investigação, não a leitura principal do evento. */}
                  <button className="dlp-toggle" onClick={() => setVerRaw((v) => !v)}>
                    <ChevronDown
                      size={13}
                      style={{
                        transform: verRaw ? "rotate(180deg)" : "none",
                        transition: "transform .15s",
                      }}
                    />
                    {verRaw ? "Ocultar evento bruto" : "Ver evento bruto"}
                  </button>
                  {verRaw && (
                    <pre className="dlp-raw" style={{ marginTop: 10 }}>
                      {JSON.stringify(selected.raw_event, null, 2)}
                    </pre>
                  )}
                </div>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default DlpDashboard;
