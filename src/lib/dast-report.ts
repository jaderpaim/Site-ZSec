// Gera o HTML do "relatório PDF" do DAST -- com a identidade visual do
// B-Security (mesma paleta/tipografia/ícone do módulo DAST no app: fundo
// escuro #0F1420, accent azul, Space Grotesk + DM Sans + IBM Plex Mono) --
// capa escura, resumo executivo com gráfico de severidade, escopo/
// metodologia, registro de achados, achados detalhados com evidência.
// Puro: só monta string a partir dos dados já buscados por exportDastReport
// -- sem acesso a banco/segredo aqui, por isso não é .server.ts.
//
// Dois documentos separados (buildDastPdfCoverHtml / buildDastPdfBodyHtml),
// não um só -- o scanner (Opção B: Chromium headless via Playwright, ver
// /report/pdf no main.py) renderiza cada um em sua própria passada e funde
// os PDFs: a capa não leva o cabeçalho/rodapé repetido do Playwright (já
// tem a própria marca, maior, embutida no HTML), as demais páginas levam.
// display_header_footer do Playwright é tudo-ou-nada pra um render só --
// sem separar os dois documentos, o cabeçalho ou duplicava por cima da
// marca da capa ou sumia de todas as páginas.

export type DastReportScan = {
  name: string | null;
  domain: string | null;
  target_url: string | null;
  environment: string | null;
  level: string | null;
  engines: string[] | null;
  started_at: string | null;
  finished_at: string | null;
  created_at: string | null;
};

// Domínio de terceiro (analytics/tracking/CDN) que o spider encontrou mas
// não rastreou de propósito -- puramente informativo, nunca é vulnerabilidade
// (ver dast_scan_out_of_scope_hosts / extract_out_of_scope_hosts no main.py).
export type DastReportOutOfScopeHost = {
  host: string;
  request_count: number;
  sample_urls: string[] | null;
};

export type DastReportVuln = {
  name: string;
  severity: string | null;
  owasp_category: string | null;
  cvss_score: number | null;
  cve_id: string | null;
  engine: string | null;
  confidence: string | null;
  status: string;
  matched_url: string | null;
  http_method: string | null;
  param: string | null;
  description: string | null;
  remediation: string | null;
  evidence: string | null;
  attack_payload: string | null;
  business_impact: string | null;
  reference: string | null;
  found_at: string | null;
};

const SEV_ORDER = ["critical", "high", "medium", "low", "info"] as const;
const SEV_LABEL: Record<string, string> = {
  critical: "Crítico",
  high: "Alto",
  medium: "Médio",
  low: "Baixo",
  info: "Informativo",
};
// 5 tons validados (dataviz: separação CVD + piso de croma + piso de visão
// normal todos passando) -- calibrados pro "papel" claro das páginas
// internas, não são as cores do dashboard (essas são pra fundo escuro).
const SEV_COLOR: Record<string, { fg: string; soft: string }> = {
  critical: { fg: "#c6303d", soft: "#fbe9ea" },
  high: { fg: "#d97f2c", soft: "#fcf0e2" },
  medium: { fg: "#16875a", soft: "#e4f3ec" },
  low: { fg: "#2563eb", soft: "#e7edfc" },
  info: { fg: "#6a3fa0", soft: "#efe8f7" },
};

const ENGINE_META: Record<string, { title: string; desc: string }> = {
  zap: {
    title: "Active scan (OWASP ZAP)",
    desc: "Rastreamento + ataque ativo contra parâmetros descobertos — injeção, XSS, deserialização, exposição de dados sensíveis via header/cookie.",
  },
  nuclei: {
    title: "Templates de assinatura (ProjectDiscovery Nuclei)",
    desc: "CVEs conhecidos, exposições de arquivo/painel administrativo e má-configuração comum, checados contra templates públicos atualizados.",
  },
  nikto: {
    title: "Fingerprint de servidor (Nikto)",
    desc: "Versão de software exposta, arquivos/paths perigosos conhecidos e headers de segurança ausentes.",
  },
  nmap: {
    title: "Varredura de porta/serviço (Nmap)",
    desc: "Portas abertas e versão de serviço exposta, com timing conservador pra não afetar disponibilidade.",
  },
  amass: {
    title: "Descoberta de superfície (Amass)",
    desc: "Enumeração de subdomínios via fontes OSINT públicas -- alimenta o escopo de Ativos Descobertos.",
  },
};

const ENV_LABEL: Record<string, string> = { prod: "Produção", homolog: "Homologação", dev: "Desenvolvimento", outro: "Outro" };
const LEVEL_LABEL: Record<string, string> = { basic: "Básico (passivo)", intermediate: "Intermediário", advanced: "Avançado controlado" };

function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);
}
function fmtDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "medium", timeStyle: "short" });
}
function fmtDuration(startIso: string | null, endIso: string | null): string {
  if (!startIso || !endIso) return "—";
  const ms = new Date(endIso).getTime() - new Date(startIso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return "—";
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}min`;
  if (m > 0) return `${m}min ${s}s`;
  return `${s}s`;
}
// Devolve só os <span> das pills -- quem chama decide se envolve num <div
// class="refs"> sozinho ou junto com outras pills (ex.: CVE).
function refPillSpans(reference: string | null): string {
  if (!reference) return "";
  return String(reference)
    .split(/\n|;\s*/)
    .map((r) => r.trim())
    .filter(Boolean)
    .map((r) => `<span class="ref-pill">${esc(r)}</span>`)
    .join("");
}
// Domínio pro card de achado detalhado -- a URL afetada logo abaixo já traz
// o path específico, então esse campo mostra só o alvo escaneado.
function extractDomain(scan: DastReportScan): string {
  if (scan.domain) return scan.domain;
  if (scan.target_url) {
    try {
      return new URL(scan.target_url).hostname;
    } catch {
      return scan.target_url;
    }
  }
  return "—";
}

// Ícones inline (mesmo motivo do lucide-react usado no app -- sem lib nova
// pra 6 glifos estáticos que só aparecem uma vez cada por página).
const ICON_DEFS = `<svg style="display:none">
  <symbol id="ic-radar" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M19.07 4.93A10 10 0 0 0 6.99 3.34"/><path d="M4 6l.01.01"/><path d="M2.29 9.62A10 10 0 1 0 21.31 8.35"/>
    <path d="M16.24 7.76A6 6 0 1 0 8.23 16.67"/><path d="M12 18a6 6 0 0 0 5.65-8"/><circle cx="12" cy="12" r="2"/><path d="M13.41 10.59 19 5"/>
  </symbol>
  <symbol id="ic-shield" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="M12 8v5"/><circle cx="12" cy="16" r=".5" fill="currentColor"/>
  </symbol>
  <symbol id="ic-list" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>
  </symbol>
  <symbol id="ic-target" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/>
  </symbol>
  <symbol id="ic-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M21.801 10A10 10 0 1 1 17 3.335"/><path d="m9 11 3 3L22 4"/>
  </symbol>
  <symbol id="ic-alert" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>
  </symbol>
</svg>`;

const REPORT_CSS = `
:root{
  --ink-dark:#0f1420; --surface-alt:#131825; --border:#1e2640; --border-hi:#2a3560;
  --accent:#3b82f6; --accent-bg:rgba(59,130,246,.14); --accent-line:rgba(59,130,246,.35);
  --page:#ffffff; --page-line:#e4e7ec;
  --ink:#12151c; --ink-2:#4b5262; --ink-3:#8891a0; --hair:#e7eaef;
  --crit:#c6303d; --crit-soft:#fbe9ea;
}
/* Sem isso o navegador descarta background-color/gradiente na impressão por
   padrão (economia de tinta) -- capa escura e as barras de severidade
   saíam em branco no PDF mesmo aparecendo coloridas na tela. */
*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact;color-adjust:exact;}
html,body{margin:0;background:#dfe2e6;color:var(--ink);font-family:'DM Sans',system-ui,sans-serif;}
h1,h2,h3{font-family:'Space Grotesk',sans-serif;font-weight:700;letter-spacing:-.01em;margin:0;text-wrap:balance;}
.mono{font-family:'IBM Plex Mono',ui-monospace,monospace;}
svg.ic{width:16px;height:16px;flex:none;}
.sheets{display:flex;flex-direction:column;align-items:center;gap:36px;padding:36px 20px 90px;}
.page{width:100%;max-width:820px;background:var(--page);border:1px solid var(--page-line);box-shadow:0 1px 2px rgba(0,0,0,.05),0 20px 44px -22px rgba(15,20,32,.45);overflow:hidden;display:flex;flex-direction:column;position:relative;}
/* min-height só faz sentido numa prévia em tela (cada seção parecendo uma
   "folha" ao rolar) -- no PDF de verdade (Playwright), isso forçava cada
   seção a ocupar pelo menos 600px mesmo com pouco conteúdo, sobrando um
   vão em branco enorme antes da seção seguinte. */
@media screen{ .page{ min-height:600px; } }
.mark{display:flex;align-items:center;gap:10px;}
.mark-icon{width:32px;height:32px;border-radius:8px;background:var(--accent-bg);border:1px solid var(--accent-line);display:flex;align-items:center;justify-content:center;flex:none;}
.mark-icon svg{width:17px;height:17px;color:var(--accent);}
.mark-text b{display:block;font-family:'Space Grotesk',sans-serif;font-size:13px;font-weight:700;letter-spacing:.02em;line-height:1.15;}
.mark-text span{display:block;font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.09em;text-transform:uppercase;opacity:.65;margin-top:2px;}
.body-pad{padding:46px 44px 56px;display:flex;flex-direction:column;flex:1;}
.cover{background:var(--ink-dark);color:#fff;justify-content:space-between;}
.cover-tex{
  position:absolute;inset:0;pointer-events:none;
  background:
    radial-gradient(circle at 82% 18%, rgba(59,130,246,.20), transparent 42%),
    repeating-radial-gradient(circle at 82% 18%, transparent 0 34px, rgba(59,130,246,.10) 35px 36px),
    linear-gradient(rgba(255,255,255,.05) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.05) 1px, transparent 1px);
  background-size:auto,auto,28px 28px,28px 28px;
}
/* Antes era um mask-image (fade) em cima do .cover-tex: no print-to-PDF do
   Chromium, mask-image força o navegador a rasterizar a camada inteira da
   capa (bitmap do tamanho da página + soft-mask/SMask embutido) -- isso é
   o que deixava o PDF pesado/lento pra renderizar E fazia a capa sumir em
   visualizadores mais simples (preview do Teams/Outlook/SharePoint, que
   não sustentam bem SMask). Substituído por uma camada extra por cima,
   com a MESMA cor de fundo da capa (--ink-dark) num gradiente que vai de
   transparente pra opaco -- visualmente idêntico (a textura "apaga" no
   rodapé), mas é só gradiente (o Chromium desenha como shading nativo do
   PDF, sem rasterizar nem precisar de transparência mascarada).
*/
.cover-fade{position:absolute;inset:0;pointer-events:none;background:linear-gradient(180deg,transparent 0%,transparent 55%,var(--ink-dark) 92%);}
.cover-hd{position:relative;padding:40px 44px 0;}
.cover-mid{position:relative;margin:auto 0;padding:36px 44px;}
.cover-eyebrow{display:flex;align-items:center;gap:8px;font-family:'IBM Plex Mono',monospace;font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:var(--accent);margin-bottom:20px;}
.cover-eyebrow::before{content:'';width:22px;height:1.5px;background:var(--accent);}
.cover-title{font-size:40px;line-height:1.1;max-width:16ch;color:#fff;}
.cover-target{font-family:'IBM Plex Mono',monospace;font-size:15px;color:#a9b6cc;margin-top:16px;}
.cover-grid{position:relative;margin:0 44px 40px;display:grid;grid-template-columns:repeat(3,1fr);gap:1px;background:var(--border);border:1px solid var(--border);border-radius:10px;overflow:hidden;}
.cover-cell{background:var(--surface-alt);padding:15px 17px;position:relative;}
.cover-cell::before{content:'';position:absolute;top:0;left:0;right:0;height:2px;background:var(--accent);opacity:.7;}
.cover-cell-label{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#8b96ab;margin-bottom:5px;}
.cover-cell-val{font-size:13.5px;font-weight:700;color:#fff;word-break:break-word;font-family:'Space Grotesk',sans-serif;}
.cover-foot{position:relative;display:flex;justify-content:space-between;align-items:flex-end;padding:20px 44px;border-top:1px solid var(--border);}
.cover-foot-item{font-size:11px;color:#8b96ab;}
.cover-foot-item b{display:block;font-size:12.5px;color:#fff;font-weight:700;margin-top:2px;}
.classif-chip{font-family:'IBM Plex Mono',monospace;font-size:9.5px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:var(--crit);background:rgba(198,48,61,.14);border:1px solid rgba(198,48,61,.4);border-radius:5px;padding:4px 10px;}
.sec-hd{display:flex;align-items:center;gap:12px;margin-bottom:22px;padding-bottom:16px;border-bottom:2px solid var(--ink);}
.sec-num{width:30px;height:30px;border-radius:8px;background:var(--ink-dark);color:#fff;display:flex;align-items:center;justify-content:center;font-family:'IBM Plex Mono',monospace;font-size:12px;font-weight:700;flex:none;}
.sec-hd svg{color:var(--accent);}
.sec-title{font-size:22px;}
.lede{font-size:13.5px;line-height:1.7;color:var(--ink-2);max-width:66ch;margin-bottom:26px;}
.lede b{color:var(--ink);font-weight:700;}
.tiles{display:grid;grid-template-columns:repeat(5,1fr);gap:1px;background:var(--hair);border:1px solid var(--hair);border-radius:10px;overflow:hidden;margin-bottom:28px;}
.tile{background:#fff;padding:15px 12px 13px;position:relative;}
.tile::before{content:'';position:absolute;top:0;left:0;right:0;height:3px;background:var(--tc,var(--accent));}
.tile-n{font-family:'Space Grotesk',sans-serif;font-size:24px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1;}
.tile-l{margin-top:6px;font-size:9.5px;font-weight:600;letter-spacing:.02em;color:var(--ink-2);}
.chart-title{display:flex;align-items:center;gap:7px;font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-2);margin-bottom:15px;}
.chart-title::before{content:'';width:3px;height:12px;background:var(--accent);border-radius:2px;}
.bars{display:flex;flex-direction:column;gap:10px;margin-bottom:26px;}
.bar-row{display:grid;grid-template-columns:118px 1fr 32px;align-items:center;gap:12px;}
.bar-label{display:flex;align-items:center;gap:7px;font-size:12px;font-weight:600;}
.bar-dot{width:9px;height:9px;border-radius:50%;flex:none;}
.bar-track{position:relative;height:14px;background:#f1f2f5;border-radius:4px;overflow:hidden;}
.bar-fill{position:absolute;inset:0 auto 0 0;border-radius:4px;}
.bar-val{font-family:'IBM Plex Mono',monospace;font-size:12px;font-weight:700;text-align:right;font-variant-numeric:tabular-nums;}
.callout{display:flex;gap:13px;border:1px solid var(--crit);border-left:4px solid var(--crit);background:var(--crit-soft);border-radius:8px;padding:15px 17px;margin-top:auto;}
.callout svg{color:var(--crit);flex:none;margin-top:1px;}
.callout p{margin:0;font-size:12.5px;line-height:1.6;}
.callout p b{color:var(--crit);}
.meth-list{display:flex;flex-direction:column;border-top:1px solid var(--hair);}
.meth-item{display:grid;grid-template-columns:118px 1fr;gap:18px;padding:17px 0;border-bottom:1px solid var(--hair);align-items:start;}
.eng-pill{display:inline-flex;align-items:center;font-family:'IBM Plex Mono',monospace;font-size:11px;font-weight:700;letter-spacing:.02em;color:var(--accent);background:var(--accent-bg);border:1px solid var(--accent-line);border-radius:6px;padding:4px 10px;text-transform:uppercase;justify-self:start;}
.meth-desc h4{margin:0 0 4px;font-size:13px;font-weight:700;font-family:'DM Sans',sans-serif;}
.meth-desc p{margin:0;font-size:11.5px;line-height:1.6;color:var(--ink-2);}
.scope-box{margin-top:24px;border:1px solid var(--hair);border-radius:9px;overflow:hidden;}
.scope-box h4{margin:0;font-size:10.5px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#fff;background:var(--ink-dark);padding:10px 18px;}
.scope-row{display:flex;justify-content:space-between;gap:16px;padding:9px 18px;border-top:1px solid var(--hair);font-size:12px;}
.scope-row:first-of-type{border-top:none;}
.scope-row span:first-child{color:var(--ink-2);}
.scope-row span:last-child{font-family:'IBM Plex Mono',monospace;text-align:right;font-weight:600;}
table{width:100%;border-collapse:collapse;font-size:11.5px;}
thead th{text-align:left;font-family:'IBM Plex Mono',monospace;font-size:9.5px;font-weight:700;letter-spacing:.07em;text-transform:uppercase;color:var(--ink-2);padding:10px;background:var(--accent-bg);border-bottom:2px solid var(--accent);}
thead th:first-child{border-radius:6px 0 0 0;} thead th:last-child{border-radius:0 6px 0 0;}
tbody td{padding:10px;border-bottom:1px solid var(--hair);vertical-align:middle;}
tbody tr:last-child td{border-bottom:none;}
td.id{font-family:'IBM Plex Mono',monospace;color:var(--ink-3);font-size:10.5px;}
td.name{font-weight:600;max-width:220px;}
td.cvss{font-family:'IBM Plex Mono',monospace;text-align:right;font-variant-numeric:tabular-nums;font-weight:600;}
.sev-chip{display:inline-flex;align-items:center;gap:6px;font-size:10px;font-weight:700;letter-spacing:.03em;padding:3px 9px 3px 7px;border-radius:20px;}
.sev-chip i{width:7px;height:7px;border-radius:50%;display:inline-block;}
.finding{border:1px solid var(--hair);border-left-width:4px;border-radius:0 11px 11px 0;overflow:hidden;margin-bottom:20px;}
.finding-hd{display:flex;align-items:center;gap:13px;padding:15px 19px;border-bottom:1px solid var(--hair);}
.finding-sev{font-family:'IBM Plex Mono',monospace;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:4px 10px;border-radius:5px;flex:none;}
.finding-title{font-size:14.5px;font-weight:700;flex:1;font-family:'Space Grotesk',sans-serif;}
.finding-id{font-family:'IBM Plex Mono',monospace;font-size:10.5px;color:var(--ink-3);}
.finding-meta{display:grid;grid-template-columns:repeat(4,1fr);gap:1px;background:var(--hair);border-bottom:1px solid var(--hair);}
.fm-cell{background:#fbfcfd;padding:10px 19px;}
.fm-l{font-family:'IBM Plex Mono',monospace;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:var(--ink-3);margin-bottom:3px;}
.fm-v{font-family:'IBM Plex Mono',monospace;font-size:11.5px;font-weight:700;word-break:break-word;}
.finding-body{padding:17px 19px 19px;display:flex;flex-direction:column;gap:15px;}
.fb-block h5{margin:0 0 6px;font-size:10px;font-weight:700;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-2);}
.fb-block p{margin:0;font-size:12px;line-height:1.6;}
.evidence{font-family:'IBM Plex Mono',monospace;font-size:10.5px;line-height:1.7;background:var(--ink-dark);color:#c6cee0;border-radius:7px;padding:12px 15px;overflow-x:auto;white-space:pre-wrap;word-break:break-word;border:1px solid var(--border);}
.refs{display:flex;flex-wrap:wrap;gap:7px;}
.ref-pill{font-family:'IBM Plex Mono',monospace;font-size:10px;color:var(--accent);background:var(--accent-bg);border:1px solid var(--accent-line);border-radius:5px;padding:4px 9px;}
.sign-grid{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-top:28px;}
.sign-box{border-top:2px solid var(--ink);padding-top:9px;font-size:12px;}
.sign-box .role{font-size:10.5px;color:var(--ink-3);margin-top:3px;}
.disc{font-size:10px;line-height:1.65;color:var(--ink-3);border-top:1px solid var(--hair);padding-top:16px;margin-top:auto;}
@media print{
  html,body{background:#fff;}
  /* align-items:center (bom na tela, cada "página" centralizada como um
     cartão) impedia a .page de esticar pra largura toda no PDF -- ficava do
     tamanho do próprio conteúdo, sobrando margem nas laterais (e a capa,
     que só tem height:100vh no eixo vertical, saía alta e estreita --
     "esticada" -- em vez de ocupar a página inteira). */
  .sheets{padding:0;gap:0;align-items:stretch;}
  .page{box-shadow:none;border:none;max-width:none;width:auto;}
  /* Documento da capa não tem mais nada depois pra quebrar (é o único
     .page dele -- ver buildDastPdfCoverHtml), mas mantém height:100vh pra
     ocupar a página inteira mesmo com pouco conteúdo. */
  .page.cover{height:100vh;min-height:100vh;}
  .sec-hd{page-break-after:avoid;}
  .tiles,.cover-grid,.finding,.scope-box,.meth-item,.callout,tr{page-break-inside:avoid;}
}
`;

function coverMark(): string {
  return `<div class="mark"><div class="mark-icon" style="background:rgba(59,130,246,.18)"><svg class="ic"><use href="#ic-radar"/></svg></div><div class="mark-text"><b>B-SECURITY</b><span>DAST Security Scanner</span></div></div>`;
}
function secHd(num: string, icon: string, title: string): string {
  return `<div class="sec-hd"><span class="sec-num">${num}</span><svg class="ic" style="width:18px;height:18px"><use href="#${icon}"/></svg><h2 class="sec-title">${esc(title)}</h2></div>`;
}

// Documento HTML "solto" (head + estilo + ícones), reusado pelos dois
// builders -- cada um vira um render (e um PDF) separado no scanner.
function shell(title: string, bodyHtml: string): string {
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório DAST — ${esc(title)}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=DM+Sans:wght@400;500;600;700&family=IBM+Plex+Mono:wght@400;500;600;700&display=swap">
<style>${REPORT_CSS}</style></head>
<body>
${ICON_DEFS}
<div class="sheets">
${bodyHtml}
</div>
</body></html>`;
}

// Só a capa -- documento próprio, sem cabeçalho/rodapé repetido do
// Playwright (ver /report/pdf no scanner): ela já tem a própria marca,
// maior, embutida.
export function buildDastPdfCoverHtml(scan: DastReportScan, totalFindings: number): string {
  const title = scan.name ?? scan.domain ?? scan.target_url ?? "Scan";
  const target = scan.target_url ?? scan.domain ?? "—";
  const engines = scan.engines ?? [];

  const coverHtml = `<section class="page cover">
  <div class="cover-tex"></div>
  <div class="cover-fade"></div>
  <div class="cover-hd">${coverMark()}</div>
  <div class="cover-mid">
    <div class="cover-eyebrow">Relatório técnico de varredura dinâmica</div>
    <h1 class="cover-title">${esc(title)}</h1>
    <div class="cover-target">${esc(target)}</div>
  </div>
  <div class="cover-grid">
    <div class="cover-cell"><div class="cover-cell-label">Início</div><div class="cover-cell-val">${fmtDateTime(scan.started_at ?? scan.created_at)}</div></div>
    <div class="cover-cell"><div class="cover-cell-label">Duração</div><div class="cover-cell-val">${fmtDuration(scan.started_at, scan.finished_at)}</div></div>
    <div class="cover-cell"><div class="cover-cell-label">Nível</div><div class="cover-cell-val">${LEVEL_LABEL[scan.level ?? ""] ?? esc(scan.level) ?? "—"}</div></div>
    <div class="cover-cell"><div class="cover-cell-label">Engines</div><div class="cover-cell-val">${engines.map((e) => e.toUpperCase()).join(" · ") || "—"}</div></div>
    <div class="cover-cell"><div class="cover-cell-label">Ambiente</div><div class="cover-cell-val">${ENV_LABEL[scan.environment ?? ""] ?? esc(scan.environment) ?? "—"}</div></div>
    <div class="cover-cell"><div class="cover-cell-label">Total de achados</div><div class="cover-cell-val">${totalFindings}</div></div>
  </div>
  <div class="cover-foot">
    <div class="cover-foot-item">Preparado por<b>Equipe de Segurança da Informação</b></div>
    <span class="classif-chip">Confidencial — uso interno</span>
  </div>
</section>`;

  return shell(title, coverHtml);
}

// Resumo executivo + escopo/metodologia + registro + achados detalhados +
// encerramento -- documento próprio, com cabeçalho/rodapé repetido pelo
// Playwright em toda página dele (ver /report/pdf no scanner).
export function buildDastPdfBodyHtml(
  scan: DastReportScan,
  vulns: DastReportVuln[],
  outOfScopeHosts: DastReportOutOfScopeHost[] = [],
): string {
  const title = scan.name ?? scan.domain ?? scan.target_url ?? "Scan";
  const target = scan.target_url ?? scan.domain ?? "—";
  const domain = extractDomain(scan);
  const engines = scan.engines ?? [];
  const total = vulns.length;

  const counts: Record<string, number> = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
  for (const v of vulns) if (v.severity && v.severity in counts) counts[v.severity] += 1;
  const critHigh = counts.critical + counts.high;
  const maxCount = Math.max(1, ...SEV_ORDER.map((s) => counts[s]));

  const priorityFindings = vulns.filter((v) => v.severity === "critical" || v.severity === "high").slice(0, 3);

  const leadIn =
    total === 0
      ? `Nenhum achado foi registrado nesta varredura contra <b>${esc(target)}</b> — a superfície testada não apresentou vulnerabilidade detectável pelos motores utilizados nesta janela.`
      : critHigh === 0
        ? `A varredura identificou <b>${total} achado${total === 1 ? "" : "s"}</b> em <b>${esc(target)}</b>, nenhum classificado como crítico ou alto. Os achados são majoritariamente de fortalecimento de configuração.`
        : `A varredura identificou <b>${total} achado${total === 1 ? "" : "s"}</b> em <b>${esc(target)}</b>, sendo <b>${critHigh} crítico${critHigh === 1 ? "" : "s"}/alto${critHigh === 1 ? "" : "s"}</b> que merece${critHigh === 1 ? "" : "m"} correção prioritária. O restante é majoritariamente de fortalecimento de configuração.`;

  const barsHtml = SEV_ORDER.map((sev) => {
    const c = counts[sev];
    const pct = total > 0 ? Math.max(c > 0 ? 3 : 0, (c / maxCount) * 100) : 0;
    return `<div class="bar-row">
      <div class="bar-label"><span class="bar-dot" style="background:${SEV_COLOR[sev].fg}"></span>${SEV_LABEL[sev]}</div>
      <div class="bar-track"><div class="bar-fill" style="width:${pct}%; background:${SEV_COLOR[sev].fg}"></div></div>
      <div class="bar-val">${c}</div>
    </div>`;
  }).join("");

  const methodologyHtml =
    engines.length > 0
      ? engines
          .map((e) => {
            const meta = ENGINE_META[e] ?? { title: e.toUpperCase(), desc: "Motor de varredura DAST." };
            return `<div class="meth-item">
              <span class="eng-pill">${esc(e)}</span>
              <div class="meth-desc"><h4>${esc(meta.title)}</h4><p>${esc(meta.desc)}</p></div>
            </div>`;
          })
          .join("")
      : `<p class="lede">Nenhum motor registrado para este scan.</p>`;

  const tableRows =
    vulns
      .map((v, i) => {
        const sev = v.severity ?? "info";
        const color = SEV_COLOR[sev] ?? SEV_COLOR.info;
        return `<tr>
          <td class="id">DAST-${String(i + 1).padStart(3, "0")}</td>
          <td><span class="sev-chip" style="color:${color.fg};background:${color.soft}"><i style="background:${color.fg}"></i>${SEV_LABEL[sev] ?? sev}</span></td>
          <td class="name">${esc(v.name)}</td>
          <td>${esc(v.owasp_category) || "—"}</td>
          <td class="cvss">${v.cvss_score != null ? esc(v.cvss_score) : "—"}</td>
        </tr>`;
      })
      .join("") || `<tr><td colspan="5" style="text-align:center;color:var(--ink-3);padding:24px 0;">Sem achados.</td></tr>`;

  const detailCards = vulns
    .map((v, i) => {
      const sev = v.severity ?? "info";
      const color = SEV_COLOR[sev] ?? SEV_COLOR.info;
      const id = `DAST-${String(i + 1).padStart(3, "0")}`;
      const blocks: string[] = [];
      if (v.matched_url) {
        blocks.push(
          `<div class="fb-block"><h5>URL afetada</h5><p class="mono" style="color:var(--ink-2)">${v.http_method ? esc(v.http_method) + " " : ""}${esc(v.matched_url)}${v.param ? `  (param: ${esc(v.param)})` : ""}</p></div>`,
        );
      }
      if (v.description) blocks.push(`<div class="fb-block"><h5>Descrição</h5><p>${esc(v.description)}</p></div>`);
      if (v.evidence || v.attack_payload) {
        const parts = [v.attack_payload ? `Payload:\n${v.attack_payload}` : null, v.evidence].filter(Boolean).join("\n\n");
        blocks.push(`<div class="fb-block"><h5>Evidência</h5><div class="evidence">${esc(parts)}</div></div>`);
      }
      if (v.business_impact) blocks.push(`<div class="fb-block"><h5>Impacto no negócio</h5><p>${esc(v.business_impact)}</p></div>`);
      if (v.remediation) blocks.push(`<div class="fb-block"><h5>Remediação</h5><p>${esc(v.remediation)}</p></div>`);
      const cvePill = v.cve_id ? `<span class="ref-pill">${esc(v.cve_id)}</span>` : "";
      const refs = cvePill + refPillSpans(v.reference);
      if (refs) blocks.push(`<div class="refs">${refs}</div>`);
      return `<div class="finding" style="border-left-color:${color.fg}">
        <div class="finding-hd">
          <span class="finding-sev" style="background:${color.soft}; color:${color.fg}">${SEV_LABEL[sev] ?? sev}</span>
          <span class="finding-title">${esc(v.name)}</span>
          <span class="finding-id">${id}</span>
        </div>
        <div class="finding-meta">
          <div class="fm-cell"><div class="fm-l">CVSS 3.1</div><div class="fm-v">${v.cvss_score != null ? esc(v.cvss_score) : "—"}</div></div>
          <div class="fm-cell"><div class="fm-l">Domínio</div><div class="fm-v">${esc(domain)}</div></div>
          <div class="fm-cell"><div class="fm-l">Método</div><div class="fm-v">${esc(v.http_method) || "—"}</div></div>
          <div class="fm-cell"><div class="fm-l">Parâmetro</div><div class="fm-v">${esc(v.param) || "—"}</div></div>
        </div>
        <div class="finding-body">${blocks.join("")}</div>
      </div>`;
    })
    .join("");

  const priorityCallout =
    priorityFindings.length > 0
      ? `<div class="callout"><svg class="ic" style="width:18px;height:18px"><use href="#ic-alert"/></svg><p><b>Prioridade imediata:</b> corrigir ${priorityFindings
          .map((v) => esc(v.name))
          .join(", ")} — ver detalhamento na seção de achados.</p></div>`
      : "";

  const hasDetail = vulns.length > 0;
  const hasOutOfScope = outOfScopeHosts.length > 0;

  // Numeração de seção dinâmica -- "Domínios de terceiro" só existe quando
  // há dado pra mostrar, então "Achados detalhados"/"Considerações finais"
  // deslizam pro número seguinte disponível em vez de ficar fixo.
  let nextSecNum = 4;
  const outOfScopeSecNum = hasOutOfScope ? String(nextSecNum++).padStart(2, "0") : null;
  const detailSecNum = hasDetail ? String(nextSecNum++).padStart(2, "0") : null;
  const finalSecNum = String(nextSecNum++).padStart(2, "0");

  const outOfScopeRows = outOfScopeHosts
    .map(
      (h) => `<tr>
        <td class="mono">${esc(h.host)}</td>
        <td style="text-align:right">${esc(h.request_count)}</td>
        <td class="mono" style="color:var(--ink-3)">${esc((h.sample_urls ?? [])[0]) || "—"}</td>
      </tr>`,
    )
    .join("");
  const outOfScopeSection = hasOutOfScope
    ? `<section class="page">
  <div class="body-pad">
    ${secHd(outOfScopeSecNum!, "ic-shield", "Domínios de terceiros encontrados (fora do escopo)")}
    <p class="lede">Bibliotecas de analytics/tracking/CDN de terceiro referenciadas pelas páginas do alvo, encontradas pelo rastreamento mas deliberadamente não escaneadas (não pertencem à aplicação avaliada).</p>
    <table>
      <thead><tr><th>Domínio</th><th style="text-align:right">Requisições</th><th>URL de amostra</th></tr></thead>
      <tbody>${outOfScopeRows}</tbody>
    </table>
  </div>
</section>`
    : "";

  const bodyHtml = `<section class="page">
  <div class="body-pad">
    ${secHd("01", "ic-target", "Resumo executivo")}
    <p class="lede">${leadIn}</p>
    <div class="tiles">
      <div class="tile" style="--tc:var(--accent)"><div class="tile-n">${total}</div><div class="tile-l">Achados totais</div></div>
      <div class="tile" style="--tc:${SEV_COLOR.critical.fg}"><div class="tile-n" style="color:${SEV_COLOR.critical.fg}">${counts.critical}</div><div class="tile-l">Críticos</div></div>
      <div class="tile" style="--tc:${SEV_COLOR.high.fg}"><div class="tile-n" style="color:${SEV_COLOR.high.fg}">${counts.high}</div><div class="tile-l">Altos</div></div>
      <div class="tile" style="--tc:${SEV_COLOR.medium.fg}"><div class="tile-n" style="color:${SEV_COLOR.medium.fg}">${counts.medium}</div><div class="tile-l">Médios</div></div>
      <div class="tile" style="--tc:var(--ink-3)"><div class="tile-n" style="color:var(--ink-3)">${counts.low + counts.info}</div><div class="tile-l">Baixos / info</div></div>
    </div>
    <div class="chart-title">Distribuição por severidade</div>
    <div class="bars">${barsHtml}</div>
    ${priorityCallout}
  </div>
</section>

<section class="page">
  <div class="body-pad">
    ${secHd("02", "ic-shield", "Escopo & metodologia")}
    <p class="lede">Varredura dinâmica (DAST) executada pelos motores abaixo contra o alvo listado, cobrindo camadas distintas do OWASP Testing Guide.</p>
    <div class="meth-list">${methodologyHtml}</div>
    <div class="scope-box">
      <h4>Alvo e janela</h4>
      <div class="scope-row"><span>URL avaliada</span><span>${esc(target)}</span></div>
      <div class="scope-row"><span>Início</span><span>${fmtDateTime(scan.started_at)}</span></div>
      <div class="scope-row"><span>Término</span><span>${fmtDateTime(scan.finished_at)}</span></div>
      <div class="scope-row"><span>Ambiente</span><span>${ENV_LABEL[scan.environment ?? ""] ?? esc(scan.environment) ?? "—"}</span></div>
    </div>
  </div>
</section>

<section class="page">
  <div class="body-pad">
    ${secHd("03", "ic-list", "Registro de achados")}
    <table>
      <thead><tr><th>ID</th><th>Severidade</th><th>Achado</th><th>Categoria OWASP</th><th style="text-align:right">CVSS</th></tr></thead>
      <tbody>${tableRows}</tbody>
    </table>
  </div>
</section>

${outOfScopeSection}

${
  hasDetail
    ? `<section class="page">
  <div class="body-pad">
    ${secHd(detailSecNum!, "ic-target", "Achados detalhados")}
    ${detailCards}
  </div>
</section>`
    : ""
}

<section class="page">
  <div class="body-pad">
    ${secHd(finalSecNum, "ic-check", "Considerações finais")}
    <p class="lede">Este relatório reflete o estado da aplicação no momento da varredura. Recomenda-se reteste após a correção dos itens críticos e altos, e inclusão desta varredura no ciclo recorrente de scans.</p>
    <div class="sign-grid">
      <div class="sign-box">&nbsp;<div class="role">Segurança da Informação — responsável técnico</div></div>
      <div class="sign-box">&nbsp;<div class="role">Aprovação do cliente — nome · cargo · data</div></div>
    </div>
    <div class="disc">Este documento contém informação confidencial sobre vulnerabilidades de segurança de ${esc(target)} e destina-se exclusivamente às partes autorizadas. A reprodução ou distribuição sem autorização prévia é vedada.</div>
  </div>
</section>`;

  return shell(title, bodyHtml);
}
