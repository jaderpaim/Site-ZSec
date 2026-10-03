import { Info, ShieldCheck } from "lucide-react";

// PENDENTE: dados ilustrativos fixos (mesmos da versão anterior da tela).
// A migração 20261002120000_organizacao_si.sql cria as tabelas reais
// (org_areas, org_membros, org_funcoes_criticas, org_treinamentos); falta
// ligar esta tela a elas e calcular os indicadores a partir do cadastro.
const LIDERANCA = { nome: "CISO", descricao: "Diretoria de Segurança da Informação", pessoas: 1 };
const AREAS = [
  { nome: "Gerência GRC", descricao: "Governance, Risk & Compliance", pessoas: 4 },
  { nome: "SOC", descricao: "Security Operations Center", pessoas: 6 },
  { nome: "Red Team", descricao: "Ofensivo / Pentests", pessoas: 3 },
  { nome: "Privacidade & LGPD", descricao: "DPO + Analistas", pessoas: 2 },
  { nome: "AppSec", descricao: "Application Security", pessoas: 2 },
];
const FUNCOES_CRITICAS_COBERTAS_PCT = 100;
const TREINAMENTOS_ATIVOS = 12;

const TOTAL = LIDERANCA.pessoas + AREAS.reduce((s, a) => s + a.pessoas, 0);
const pctTime = (n: number) => Math.round((n / TOTAL) * 100);

const CSS = `
  .org-root { font-family:var(--font-ui); color:var(--v2-fg); display:flex; flex-direction:column; gap:20px; font-size:14px; }
  .org-root * { box-sizing:border-box; }
  .org-ph-title { font-size:24px; font-weight:600; letter-spacing:-0.02em; line-height:1.2; margin:0; }
  .org-ph-sub { margin:4px 0 0; font-size:13px; color:var(--v2-fg-3); }
  .org-note { display:flex; gap:10px; align-items:flex-start; padding:10px 14px; border-radius:10px; font-size:13px; line-height:1.5; color:var(--v2-fg-2); background:color-mix(in oklch, var(--v2-accent) 8%, transparent); border:1px solid color-mix(in oklch, var(--v2-accent) 30%, transparent); }
  .org-note svg { color:var(--v2-accent); flex-shrink:0; margin-top:2px; }
  .org-note b { font-weight:600; color:var(--v2-fg); }

  .org-kpis { display:grid; grid-template-columns:repeat(auto-fit, minmax(200px, 1fr)); background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; overflow:hidden; }
  .org-kpi { padding:16px 18px 14px; display:grid; gap:2px; align-content:start; box-shadow:1px 0 0 var(--v2-line), 0 1px 0 var(--v2-line); }
  .org-kpi-label { font-size:12.5px; color:var(--v2-fg-2); }
  .org-kpi-value { font-size:28px; font-weight:600; letter-spacing:-0.02em; line-height:1.25; font-variant-numeric:tabular-nums; }
  .org-kpi-foot { font-size:12px; color:var(--v2-fg-3); }
  .org-meter { height:6px; border-radius:99px; background:var(--v2-surface-2); overflow:hidden; margin:6px 0 2px; }
  .org-meter i { display:block; height:100%; border-radius:99px; background:var(--v2-ok); }

  .org-grid { display:grid; grid-template-columns:repeat(3, minmax(0, 1fr)); gap:20px; align-items:stretch; }
  .org-span-2 { grid-column:span 2; }
  @media (max-width: 1100px) { .org-grid { grid-template-columns:minmax(0, 1fr); } .org-span-2 { grid-column:auto; } }
  .org-card { background:var(--v2-surface); border:1px solid var(--v2-line); border-radius:12px; min-width:0; overflow:hidden; }
  .org-card-hdr { padding:14px 18px 4px; }
  .org-card-title { font-size:14px; font-weight:600; margin:0; }
  .org-card-sub { margin:2px 0 0; font-size:12.5px; color:var(--v2-fg-3); }
  .org-card-body { padding:14px 18px 18px; }

  /* Organograma */
  .org-lead { display:flex; align-items:center; gap:14px; padding:14px 18px; border-radius:12px; border:1px solid var(--v2-line); background:var(--v2-surface-2); width:fit-content; max-width:100%; margin:0 auto; }
  .org-lead .av { width:40px; height:40px; border-radius:10px; display:grid; place-items:center; flex-shrink:0; background:color-mix(in oklch, var(--v2-accent) 16%, transparent); color:var(--v2-accent); }
  .org-lead b { display:block; font-size:15px; font-weight:600; }
  .org-lead small { display:block; font-size:12.5px; color:var(--v2-fg-3); }
  .org-tree { position:relative; height:22px; }
  .org-tree::before { content:""; position:absolute; left:50%; top:0; height:100%; border-left:1px solid var(--v2-line-strong); }
  .org-areas { display:grid; grid-template-columns:repeat(auto-fit, minmax(210px, 1fr)); gap:14px; position:relative; padding-top:18px; }
  .org-areas::before { content:""; position:absolute; top:0; left:8%; right:8%; border-top:1px solid var(--v2-line-strong); }
  .org-area { position:relative; display:grid; gap:10px; padding:16px; border-radius:12px; border:1px solid var(--v2-line); background:var(--v2-surface-2); }
  .org-area::before { content:""; position:absolute; top:-18px; left:50%; height:18px; border-left:1px solid var(--v2-line-strong); }
  .org-area-h { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
  .org-area-h b { display:block; font-size:14px; font-weight:600; }
  .org-area-h small { display:block; font-size:12.5px; color:var(--v2-fg-3); margin-top:2px; }
  .org-area .n { font-size:20px; font-weight:600; letter-spacing:-0.02em; font-variant-numeric:tabular-nums; text-align:right; line-height:1.1; }
  .org-area .n small { display:block; font-size:11.5px; font-weight:400; color:var(--v2-fg-3); letter-spacing:0; }
  .org-track { height:6px; border-radius:99px; background:var(--v2-surface); overflow:hidden; }
  .org-track i { display:block; height:100%; border-radius:99px; background:var(--v2-accent); }
  .org-pct { font:400 12px var(--font-data); color:var(--v2-fg-3); }
  @media (max-width: 700px) { .org-areas::before, .org-area::before, .org-tree { display:none; } .org-areas { padding-top:0; } }

  /* Distribuição */
  .org-dist { display:grid; gap:10px; }
  .org-dist > div { display:grid; grid-template-columns:minmax(0, 140px) minmax(0, 1fr) 70px; gap:10px; align-items:center; font-size:13px; }
  .org-dist > div > span:first-child { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
  .org-dist .bar { height:8px; border-radius:99px; background:var(--v2-surface-2); overflow:hidden; }
  .org-dist .bar i { display:block; height:100%; border-radius:99px; background:var(--v2-accent); }
  .org-dist .v { font:500 12.5px var(--font-data); text-align:right; color:var(--v2-fg-2); }
`;

export function OrganizacaoDashboard() {
  const dist = [LIDERANCA, ...AREAS].sort((a, b) => b.pessoas - a.pessoas);
  const maxDist = Math.max(...dist.map((d) => d.pessoas), 1);

  return (
    <div className="org-root">
      <style dangerouslySetInnerHTML={{ __html: CSS }} />

      <div>
        <h1 className="org-ph-title">Organização de Segurança da Informação</h1>
        <p className="org-ph-sub">
          Estrutura do time, cobertura das funções críticas e capacitação
        </p>
      </div>

      <div className="org-note" role="note">
        <Info size={16} />
        <span>
          <b>Dados ilustrativos.</b> A estrutura abaixo ainda não vem do cadastro: o registro real
          de áreas, pessoas, funções críticas e treinamentos está em preparação.
        </span>
      </div>

      <div className="org-kpis">
        <div className="org-kpi">
          <span className="org-kpi-label">Pessoas no time</span>
          <span className="org-kpi-value">{TOTAL}</span>
          <span className="org-kpi-foot">distribuídas em {AREAS.length + 1} áreas</span>
        </div>
        <div className="org-kpi">
          <span className="org-kpi-label">Funções críticas cobertas</span>
          <span className="org-kpi-value">{FUNCOES_CRITICAS_COBERTAS_PCT}%</span>
          <div className="org-meter" aria-hidden="true">
            <i style={{ width: `${FUNCOES_CRITICAS_COBERTAS_PCT}%` }} />
          </div>
          <span className="org-kpi-foot">todas com titular e substituto</span>
        </div>
        <div className="org-kpi">
          <span className="org-kpi-label">Treinamentos ativos</span>
          <span className="org-kpi-value">{TREINAMENTOS_ATIVOS}</span>
          <span className="org-kpi-foot">capacitações em andamento</span>
        </div>
      </div>

      <div className="org-grid">
        <div className="org-card org-span-2">
          <div className="org-card-hdr">
            <h2 className="org-card-title">Estrutura</h2>
            <p className="org-card-sub">Áreas do time de SI e quantas pessoas há em cada uma</p>
          </div>
          <div className="org-card-body">
            <div className="org-lead">
              <span className="av">
                <ShieldCheck size={18} />
              </span>
              <div>
                <b>{LIDERANCA.nome}</b>
                <small>
                  {LIDERANCA.descricao} · {LIDERANCA.pessoas}{" "}
                  {LIDERANCA.pessoas === 1 ? "pessoa" : "pessoas"}
                </small>
              </div>
            </div>
            <div className="org-tree" aria-hidden="true" />
            <div className="org-areas">
              {AREAS.map((a) => (
                <div key={a.nome} className="org-area">
                  <div className="org-area-h">
                    <div>
                      <b>{a.nome}</b>
                      <small>{a.descricao}</small>
                    </div>
                    <span className="n">
                      {a.pessoas}
                      <small>{a.pessoas === 1 ? "pessoa" : "pessoas"}</small>
                    </span>
                  </div>
                  <div className="org-track" aria-hidden="true">
                    <i style={{ width: `${pctTime(a.pessoas)}%` }} />
                  </div>
                  <span className="org-pct">{pctTime(a.pessoas)}% do time</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="org-card">
          <div className="org-card-hdr">
            <h2 className="org-card-title">Distribuição do time</h2>
            <p className="org-card-sub">Participação de cada área no total de {TOTAL} pessoas</p>
          </div>
          <div className="org-card-body">
            <div className="org-dist">
              {dist.map((d) => (
                <div key={d.nome}>
                  <span title={d.nome}>{d.nome}</span>
                  <span className="bar" aria-hidden="true">
                    <i style={{ width: `${(d.pessoas / maxDist) * 100}%` }} />
                  </span>
                  <span className="v">
                    {d.pessoas} · {pctTime(d.pessoas)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
