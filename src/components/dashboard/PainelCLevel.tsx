import * as React from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { usePermissions } from "@/lib/use-permissions";
import { TrendingUp, AlertTriangle, Loader2, Database, PencilLine, Maximize2 } from "lucide-react";
import { getCLevelOverview, upsertCLevelContexto } from "@/lib/clevel.functions";

// ───────────────────────────────────────────────────────────────────────────────
// REGRA DO PAINEL: todo número vem do banco. O que não tem fonte não é estimado
// nem ilustrado — aparece como lacuna, pedindo cadastro. Nada aqui é hardcoded.
//
// Duas omissões deliberadas, explicadas no rodapé da tela:
//  - MTTR / tempo de resposta: o valor atual é provisório (integração com a
//    ferramenta de resposta pendente), então não vira indicador de diretoria.
//  - "aula interrompida": a Segurança da Informação não mede continuidade de
//    aula. O que medimos é disponibilidade dos ativos monitorados no CMDB.
// ───────────────────────────────────────────────────────────────────────────────

const T = {
  bg: "var(--tl-0a0d14, #0A0D14)",
  surface: "var(--tl-0f1420, #0F1420)",
  surfaceAlt: "var(--tl-131825, #131825)",
  border: "var(--tl-1e2640, #1E2640)",
  text: "var(--tl-f1f5f9, #F1F5F9)",
  muted: "var(--tl-a9b4c7, #A9B4C7)",
  subtle: "var(--tl-64748b, #64748B)",
  success: "#10B981",
  successBg: "rgba(16,185,129,0.10)",
  warning: "#F59E0B",
  warningBg: "rgba(245,158,11,0.10)",
  danger: "#EF4444",
  dangerBg: "rgba(239,68,68,0.10)",
  accent: "#3B82F6",
  accentBg: "rgba(59,130,246,0.10)",
  purple: "#A78BFA",
};

const SEMA = {
  verde: { cor: T.success, bg: T.successBg },
  amarelo: { cor: T.warning, bg: T.warningBg },
  vermelho: { cor: T.danger, bg: T.dangerBg },
};

const CSS = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&family=IBM+Plex+Mono:wght@400;500;600&display=swap');

  .cl-wrap { background:${T.bg}; min-height:100%; margin:-2rem; padding:28px 32px 40px; }
  /* Em tela cheia o wrapper é a raiz, então o margin negativo que compensa o
     padding do layout tem de sair, senão o conteúdo fica cortado à esquerda. */
  .cl-wrap:fullscreen { margin:0; overflow-y:auto; padding:28px 40px; }
  /* Barra de ações: abas à esquerda, modo apresentação à direita. Mesmo padrão
     do botão do Painel Executivo (.pe-btn primary). */
  .cl-topbar { max-width:1500px; margin:0 auto 18px; display:flex; align-items:center;
    gap:12px; flex-wrap:wrap; }
  .cl-btn { margin-left:auto; display:inline-flex; align-items:center; gap:6px; padding:8px 14px;
    border-radius:7px; font-size:12px; font-weight:700; cursor:pointer; white-space:nowrap;
    font-family:'DM Sans',sans-serif; transition:all .15s; background:${T.accentBg};
    border:1px solid rgba(59,130,246,0.4); color:#93C5FD; }
  .cl-btn:hover { background:rgba(59,130,246,0.25); box-shadow:0 0 20px rgba(59,130,246,0.15); }
  .cl-root { font-family:'DM Sans','Inter',system-ui,sans-serif; color:${T.text}; max-width:1500px; margin:0 auto; display:flex; flex-direction:column; gap:34px; }
  .cl-root * { box-sizing:border-box; }
  .cl-step { display:flex; align-items:center; gap:10px; margin-bottom:14px; }
  .cl-step-n { width:26px; height:26px; border-radius:8px; background:${T.accentBg}; color:#93C5FD; font-size:13px; font-weight:700; display:flex; align-items:center; justify-content:center; }
  .cl-step-t { font-size:13px; font-weight:700; letter-spacing:.14em; text-transform:uppercase; color:${T.muted}; }
  .cl-card { background:${T.surface}; border:1px solid ${T.border}; border-radius:16px; padding:22px 24px; }
  .cl-grid { display:grid; gap:16px; }
  .cl-num { font-variant-numeric:tabular-nums; letter-spacing:-.02em; line-height:1; font-weight:700; }
  .cl-hero { border-radius:20px; padding:30px 34px; }
  .cl-hero-top { display:flex; gap:30px; align-items:center; flex-wrap:wrap; }
  .cl-dot { width:64px; height:64px; border-radius:999px; flex-shrink:0; }
  /* Etiqueta de procedência — aparece em todo número da tela */
  .cl-fonte { font-family:'IBM Plex Mono',monospace; font-size:10.5px; letter-spacing:.06em; text-transform:uppercase; color:var(--tl-818fa6, #818FA6); display:flex; align-items:center; gap:5px; margin-top:8px; }
  .cl-vazio { border:1px dashed ${T.border}; border-radius:14px; padding:18px 20px; background:${T.surfaceAlt}; }
  /* Pilares do movimento 1 — o que sustenta o veredito de saúde. São três
     afirmações estruturais, não indicadores do dia: o detalhe operacional
     (e a fonte de cada número) fica no movimento 2. */
  .cl-pilares { display:grid; grid-template-columns:repeat(auto-fit,minmax(260px,1fr)); gap:1px;
    margin-top:22px; background:${T.border}; border:1px solid ${T.border}; border-radius:14px; overflow:hidden; }
  .cl-pilar { background:rgba(10,13,20,0.55); padding:16px 18px; }
  .cl-pilar-t { display:flex; align-items:center; gap:8px; font-size:13px; font-weight:700; line-height:1.35; }
  .cl-pilar-dot { width:7px; height:7px; border-radius:999px; flex-shrink:0; }
  .cl-pilar-f { font-size:12.5px; color:${T.muted}; line-height:1.55; margin-top:8px; }
  /* Legenda dos padrões: as duas siglas são o lastro da comparação, mas quem lê
     a tela não sabe o que são. Em cinza discreto ficava ilegível sobre o fundo
     colorido do herói, então virou um bloco de apoio: fundo azul suave, uma
     definição por linha e a sigla em azul claro, que é a cor de destaque do
     painel. Continua secundário ao pilar, mas agora se lê. */
  .cl-legenda { margin-top:18px; max-width:940px; background:rgba(59,130,246,0.07);
    border:1px solid rgba(59,130,246,0.22); border-left:3px solid ${T.accent};
    border-radius:10px; padding:13px 16px; }
  .cl-legenda p { margin:0; font-size:12.5px; line-height:1.6; color:${T.text}; }
  .cl-legenda p + p { margin-top:6px; }
  .cl-legenda strong { color:#93C5FD; font-weight:700; }
  .cl-legenda p.cl-legenda-fim { margin-top:9px; font-size:11.5px; color:${T.muted}; }
  .cl-legenda-l { display:block; font-family:'IBM Plex Mono',monospace; font-size:9.5px;
    letter-spacing:.12em; text-transform:uppercase; color:#93C5FD; margin-bottom:9px; }
  /* Faixa "o que protegemos todos os dias" — a parte da história que dá tamanho
     ao risco, escrita para fundador e professor. Tem arco: uma frase que abre
     (é gente, não é sistema), uma peça por público com número + o que é + por
     que importa, e uma frase que fecha dizendo qual é o trabalho. Sem o "por
     que importa" a faixa é um contador, e contador não conta história. */
  .cl-emjogo { margin-top:24px; padding-top:20px; border-top:1px solid ${T.border}; }
  .cl-emjogo-l { font-family:'IBM Plex Mono',monospace; font-size:10.5px; letter-spacing:.14em;
    text-transform:uppercase; color:${T.muted}; margin-bottom:8px; }
  .cl-emjogo-intro { font-size:15px; color:${T.text}; font-weight:600; line-height:1.5;
    max-width:820px; margin-bottom:15px; }
  .cl-emjogo-grid { display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:10px; }
  .cl-emjogo-item { background:rgba(10,13,20,0.55); border:1px solid ${T.border};
    border-radius:12px; padding:16px 18px; display:flex; flex-direction:column; }
  .cl-emjogo-v { font-size:30px; color:${T.text}; }
  .cl-emjogo-k { font-size:12px; font-weight:600; color:${T.text}; margin-top:7px; line-height:1.35; }
  .cl-emjogo-p { font-size:11.5px; color:${T.muted}; margin-top:8px; padding-top:8px;
    border-top:1px solid ${T.border}; line-height:1.5; }
  .cl-emjogo-fim { font-size:13px; color:${T.muted}; margin-top:15px; line-height:1.6; max-width:900px; }
  /* Linha de veredito do movimento 2 — dimensão + veredito + oração que o justifica.
     A borda esquerda colorida dá o semáforo por dimensão sem precisar de ícone. */
  .cl-linha { padding:16px 20px; display:grid; grid-template-columns:minmax(210px,240px) 1fr auto; gap:6px 20px; align-items:baseline; }
  @media (max-width:820px){ .cl-linha { grid-template-columns:1fr; } }
  .cl-linha-dim { display:flex; align-items:center; gap:9px; flex-wrap:wrap; }
  .cl-veredito { font-family:'IBM Plex Mono',monospace; font-size:10px; font-weight:700; letter-spacing:.08em;
    text-transform:uppercase; padding:3px 8px; border-radius:5px; white-space:nowrap; }
  .cl-linha-frase { font-size:13.5px; color:${T.muted}; line-height:1.55; }
  /* Nota da linha (o número cru que sustenta a frase). Em cinza escuro a 10,5px
     ficava ilegível, mesmo problema da legenda dos padrões: virou etiqueta com
     fundo e contorno próprios, um pouco maior. Continua secundária à frase,
     mas agora se lê. */
  .cl-linha-nota { font-family:'IBM Plex Mono',monospace; font-size:11.5px; color:${T.muted};
    background:rgba(var(--tl-ink, 255,255,255),0.045); border:1px solid ${T.border}; border-radius:7px;
    padding:4px 9px; white-space:nowrap; justify-self:end; }
  @media (max-width:820px){ .cl-linha-nota { white-space:normal; justify-self:start; } }
  /* Marcador de tempo dos 3 cards de custo — numera a história, não decora:
     1 hoje · 2 frente ao mercado · 3 o que falta */
  .cl-beat { display:flex; align-items:center; gap:8px; font-family:'IBM Plex Mono',monospace;
    font-size:10.5px; font-weight:700; letter-spacing:.1em; text-transform:uppercase; color:${T.muted}; }
  .cl-beat-n { width:18px; height:18px; border-radius:5px; background:${T.accentBg}; color:#93C5FD;
    display:flex; align-items:center; justify-content:center; font-size:10px; flex-shrink:0; }
  /* Memória de cálculo: deixa a divisão à vista para o número não parecer erro de escala */
  .cl-mono-calc { font-family:'IBM Plex Mono',monospace; font-size:11.5px; color:var(--tl-8a97ad, #8A97AD); margin-top:8px;
    padding-top:8px; border-top:1px dashed ${T.border}; line-height:1.5; }
  /* Fecho do movimento de custo: costura os três cards. Corpo maior que a
     ressalva, porque é conclusão e não nota de pé de página. */
  .cl-fecho { margin-top:16px; max-width:960px; }
  .cl-fecho p { margin:14px 0 0; font-size:13.5px; line-height:1.65; color:${T.muted}; }
  .cl-fecho strong { color:${T.text}; font-weight:700; }
  .cl-fecho p.cl-fecho-nota { margin-top:10px; font-size:11.5px; color:${T.subtle}; line-height:1.6; }
  .cl-fecho p.cl-fecho-nota strong { color:${T.muted}; font-weight:600; }
  /* Três linhas de decisão: posição · referência · valor da decisão. Rótulo em
     mono para o olho pular direto de um número ao outro. */
  .cl-fecho-linhas { display:grid; grid-template-columns:repeat(auto-fit,minmax(210px,1fr)); gap:1px;
    background:${T.border}; border:1px solid ${T.border}; border-radius:12px; overflow:hidden; }
  .cl-fecho-linhas > div { background:${T.surface}; padding:14px 16px; }
  .cl-fecho-linhas span { display:block; font-family:'IBM Plex Mono',monospace; font-size:9.5px;
    letter-spacing:.12em; text-transform:uppercase; color:${T.subtle}; margin-bottom:7px; }
  .cl-fecho-linhas strong { display:block; font-size:19px; font-weight:700; color:${T.text};
    font-variant-numeric:tabular-nums; letter-spacing:-.01em; }
  .cl-fecho-linhas em { display:block; font-style:normal; font-size:11.5px; color:${T.muted}; margin-top:5px; }
  .cl-fecho-linhas > div.cl-fecho-decidir { background:linear-gradient(180deg,${T.surface},${T.surfaceAlt}); }
  .cl-fecho-linhas > div.cl-fecho-decidir span { color:#FCD34D; }
  .cl-fecho-linhas > div.cl-fecho-decidir strong { color:${T.warning}; }
  /* Abas — mesmo padrão do módulo Benchmark */
  .cl-tabs { display:inline-flex; align-items:center; gap:4px; padding:4px; background:${T.surface}; border:1px solid ${T.border}; border-radius:8px; }
  .cl-tab { padding:7px 16px; border-radius:6px; border:none; background:transparent; font-size:12px; font-weight:600;
    font-family:'DM Sans',sans-serif; color:${T.subtle}; cursor:pointer; transition:all .15s; }
  .cl-tab:hover:not(.active) { color:${T.muted}; background:rgba(var(--tl-ink, 255,255,255),0.04); }
  .cl-tab.active { background:${T.accentBg}; color:#93C5FD; border:1px solid rgba(59,130,246,0.25); }
  @media (max-width:1100px){ .cl-wrap{ padding:20px 16px; } }
`;

const nf = new Intl.NumberFormat("pt-BR");
const brl = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  maximumFractionDigits: 0,
});
const brlC = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  notation: "compact",
  maximumFractionDigits: 1,
});
// Decimal em pt-BR: o toFixed do JS devolve ponto ("2.4"), e a tela é toda em
// português. Todo decimal desta página passa por aqui.
const dec = (v: number, d = 1) => v.toFixed(d).replace(".", ",");
const fmtPct = (v: number | null | undefined, d = 1) => (v == null ? "n/d" : `${dec(v * 100, d)}%`);
const periodoRef = () => {
  const fim = new Date();
  const ini = new Date(fim.getTime() - 30 * 86400_000);
  const f = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
  return `${f(ini)} a ${f(fim)} de ${fim.getFullYear()} (últimos 30 dias)`;
};

function Step({ n, children }: { n: number; children: string }) {
  return (
    <div className="cl-step">
      <div className="cl-step-n">{n}</div>
      <div className="cl-step-t">{children}</div>
    </div>
  );
}

function Fonte({ children, icon: Icon = Database }: { children: string; icon?: any }) {
  return (
    <div className="cl-fonte">
      <Icon size={11} /> {children}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════
// QUATRO MOVIMENTOS — painel para um leitor NÃO TÉCNICO (sócio fundador).
//
// Regras de linguagem desta tela, decididas com o usuário:
//  - nenhuma palavra técnica: sem nome de fornecedor, sem "endpoint", "borda",
//    "WAF", "XDR", "NIST", "ISO", sem percentual de criptografia em destaque;
//  - magnitude vira CADÊNCIA: "146.442 em 30 dias" não diz nada; "três por
//    minuto" diz. Mesma aritmética, unidade humana;
//  - nada de comparativo de volume de ataque ("16% mais que o mês anterior"):
//    para quem não é da área, lê como "estamos piorando", quando é só a
//    internet mais barulhenta. Esse comparativo vive no Painel Executivo;
//  - o antídoto contra parecer auto-elogio NÃO é jargão: é a tela carregar a
//    própria má notícia (investimento abaixo do piso) e tudo ser rastreável no
//    Painel Executivo, dito na última linha.
// ═══════════════════════════════════════════════════════════════════════════

// ── Movimento 1 — o momento ──────────────────────────────────────────────────
// Este card responde UMA pergunta: "como está a segurança da informação?" —
// estado ESTRUTURAL, construído ao longo do tempo, não foto de um instante.
//
// Por isso ficam DELIBERADAMENTE fora do farol:
//  - sistema fora do ar agora: é evento pontual, some sozinho em horas, quem
//    acompanha é a área técnica. Aparece no movimento 2, onde é operacional;
//  - investimento abaixo do piso: condição crônica com movimento próprio —
//    deixaria o farol amarelo para sempre, tornando-o inútil;
//  - volume de trabalho em andamento: ter assunto em tratamento dentro do
//    prazo é operação saudável, não alerta.
//
// O farol lê três pilares que só mudam com meses de trabalho:
//   1. a barreira funciona (tentativas barradas de forma contínua)
//   2. estamos acima da média do setor (régua externa, não autoavaliação)
//   3. o que aparece é resolvido no prazo combinado
// verde = nenhum pilar em falha · amarelo = um · vermelho = dois ou mais.
function MomentoAtual({ d }: { d: any }) {
  const cob = d.cobertura;
  const ctx = d.contexto;
  const trat = d.tratamento;
  const b = d.bloqueios;
  const m = d.maturidade;

  const atrasadas = trat?.atrasadas ?? 0;
  const parque = cob?.endpoints != null && cob?.servidores != null ? cob.endpoints + cob.servidores : null;

  // Cadência: "146 mil em 30 dias" não diz nada a quem não é da área;
  // "3 por minuto" diz. Mesma aritmética, unidade humana.
  const porMinuto = b?.total != null ? b.total / (30 * 24 * 60) : null;
  const cadencia =
    porMinuto == null
      ? null
      : porMinuto >= 1
        ? `${nf.format(Math.round(porMinuto))} tentativas de invasão são barradas por minuto`
        : `${nf.format(Math.max(1, Math.round(porMinuto * 60)))} tentativas de invasão são barradas por hora`;

  const vezesSetor = m?.nist != null && m?.mediaEdu ? m.nist / m.mediaEdu : null;
  const vezesSetorIso = m?.iso != null && m?.mediaEduIso ? m.iso / m.mediaEduIso : null;
  const acimaSetor = vezesSetor != null ? vezesSetor > 1 : null;

  const pilares: Array<{ ok: boolean; titulo: string; frase: string }> = [];
  if (cadencia != null) {
    pilares.push({
      ok: b.total > 0,
      titulo: "A barreira funciona, sem pausa",
      frase: `Dia e noite, ${cadencia}, e nenhuma chegou ao aluno, à família ou ao colégio parceiro. Todos os dias do ano, não só neste mês.`,
    });
  }
  // Este pilar fala com o empresário: a pergunta dele não é "qual a nota", é
  // "estou melhor ou pior que quem disputa o mesmo aluno". Daí a ordem fixa das
  // três orações, em no máximo três linhas: a nota vem de fora (não é
  // autoelogio) · estamos à frente da média · serve para vender. Sem sigla e
  // sem escala: "avaliações internacionais" carrega NIST e ISO sem exigir que
  // ele saiba o que são.
  if (acimaSetor != null) {
    // Cada vantagem sai com o nome do padrão ao lado. O fundador não precisa
    // saber o que é NIST ou ISO, mas o nome é o que dá lastro à afirmação em
    // conversa com colégio parceiro, auditor ou seguradora, e é como a área
    // técnica confere o número.
    const padroes = [
      vezesSetor != null ? { prep: "no", nome: "NIST CSF", vezes: vezesSetor } : null,
      vezesSetorIso != null ? { prep: "na", nome: "ISO 27001", vezes: vezesSetorIso } : null,
    ].filter(Boolean) as Array<{ prep: string; nome: string; vezes: number }>;
    const lista = padroes.map((p) => `${dec(p.vezes)}× ${p.prep} ${p.nome}`).join(padroes.length > 1 ? " e " : "");
    pilares.push({
      ok: acimaSetor,
      titulo: acimaSetor ? "Mais protegidos que a escola concorrente" : "Atrás da média das escolas do setor",
      frase: acimaSetor
        ? `A nota não é nossa: ${padroes.length > 1 ? "Vem de duas avaliações internacionais" : "Vem de uma avaliação internacional"}, com a mesma régua para todas as empresas. Estamos à frente da média das escolas: ${lista}. É o que sustenta a decisão do colégio parceiro de confiar os dados dos alunos dele a nós, e não ao concorrente.`
        : "As avaliações internacionais usam a mesma régua para todas as empresas, e nelas ainda estamos abaixo da média das escolas. É ponto que um colégio parceiro pode cobrar.",
    });
  }
  if ((trat?.total ?? 0) > 0 || atrasadas > 0) {
    pilares.push({
      ok: atrasadas === 0,
      titulo: atrasadas === 0 ? "O que aparece é resolvido" : "Compromissos fora do prazo",
      frase:
        atrasadas === 0
          ? "Todo assunto aberto tem responsável e prazo, e nenhum passou da data combinada. Achar falha é rotina; saúde é fechar no prazo."
          : `${nf.format(atrasadas)} ${atrasadas === 1 ? "assunto passou" : "assuntos passaram"} do prazo combinado. A área técnica trata o detalhe em separado.`,
    });
  }

  const falhas = pilares.filter((p) => !p.ok).length;
  const nivel: keyof typeof SEMA = falhas === 0 ? "verde" : falhas === 1 ? "amarelo" : "vermelho";
  const s = SEMA[nivel];

  // Manchete e cor precisam concordar. No verde, a manchete é o fato que mais
  // importa para um fundador; fora do verde, ela nomeia o que está em falha.
  //
  // Esta é a frase mais importante da tela, e o problema dela é estrutural: em
  // segurança, SUCESSO É AUSÊNCIA DE EVENTO, e ausência não impressiona
  // ninguém. Daí a construção em dois tempos:
  //   1. o fato (nenhum dado exposto), que o leitor entende de imediato;
  //   2. o reenquadramento (conseguir isso TODOS OS DIAS é trabalho), que
  //      transforma a ausência em conquista e mata a leitura de "mês bom".
  // "Mais silencioso da empresa" é a ponte para o professor de humanas: nomeia
  // por que ele nunca ouve falar da área, e vira mérito em vez de invisibilidade.
  const titulo =
    nivel === "verde"
      ? "Nenhum dado de aluno foi exposto, e não por sorte. Conseguir isso todos os dias é o trabalho mais silencioso da empresa."
      : nivel === "amarelo"
        ? `A proteção está de pé, mas há um ponto a recuperar: ${pilares.find((p) => !p.ok)!.titulo}.`
        : "A segurança da informação está em terreno frágil.";
  const apoio =
    nivel === "verde"
      ? // Cinco tempos, e a ordem é o que faz o texto funcionar:
        //   1. O QUE ESTÁ EM JOGO. "Um único vazamento" dá o peso do setor sem
        //      apelar para catástrofe, e cita as três instâncias que cobram a
        //      conta: família, colégio parceiro e lei;
        //   2. a ponte curta ("é por isso que essa operação não para"), que
        //      transforma o susto em razão de existir;
        //   3. a METÁFORA DO PRÉDIO, que explica de uma vez a invisibilidade do
        //      trabalho e o que aconteceria sem ele. É a parte que faz um leigo
        //      entender o setor;
        //   4. o para quê, ancorado no dia do leitor (aula, matrícula,
        //      mensalidade) e terminando na tranquilidade que a área entrega;
        //   5. a prova de continuidade (maturidade medida de fora) e o alcance.
        // "Sorte" não se repete aqui: é palavra da manchete.
        `Um único vazamento muda a conversa com toda família, com todo colégio parceiro e com a lei. É por isso que essa operação não para. Segurança da informação é como a estrutura de um prédio: Ninguém repara nela enquanto está de pé. Enquanto a escola dá aula, matricula e cobra mensalidade, ela trabalha em silêncio, dia e noite, para que ninguém aqui precise pensar em ataque, vazamento ou golpe. O que sustenta essa estrutura é maturidade construída ano após ano e medida por avaliação externa.${parque != null ? ` Hoje cobre os ${nf.format(parque)} computadores e servidores da empresa, sem exceção.` : ""}`
      : `Nenhum dado de aluno foi exposto no período.${parque != null ? ` A proteção cobre os ${nf.format(parque)} computadores e servidores da empresa.` : ""} Os itens abaixo mostram onde a operação precisa voltar ao patamar.`;

  // O que está em jogo — números do cadastro da área, na língua do negócio.
  //
  // ⚠️ Esta faixa é o ÚNICO lugar da tela onde esses números aparecem, e é de
  // EXIBIÇÃO APENAS: serve para dar tamanho ao que está protegido. Não usar
  // nenhum deles como divisor (as duas contagens de pessoal, em especial, não
  // entram em custo por pessoa nem em rateio) — só `alunos` é divisor, no
  // movimento 4.
  // Cada peça leva um "por que importa" de uma linha. Sem isso a faixa é um
  // contador, e contador não conta história: o leitor é um fundador e um
  // professor, que não perguntam "quantos", perguntam "e daí?".
  const emJogo = [
    {
      valor: ctx?.alunos,
      label: "alunos atendidos",
      porque: "Nome, endereço, notas e histórico escolar de cada um ficam sob a nossa guarda.",
    },
    {
      valor: ctx?.colegios,
      label: "colégios parceiros",
      porque: "Cada contrato assinado supõe que a gente cuide bem do dado das famílias dele.",
    },
    {
      valor: ctx?.colaboradores,
      label: "colaboradores, com professores",
      porque: "Cada pessoa tem um acesso, e cada acesso é uma porta que alguém pode tentar usar.",
    },
    {
      valor: ctx?.colaboradores_corporativos,
      label: "colaboradores corporativos",
      // Não nomear sistema: nem todo mundo entra em matrícula ou pagamento.
      // O que vale para TODOS é ter acesso interno, e é o acesso na mão errada
      // que causa o dano.
      porque: "Todos acessam algum sistema interno da empresa, e um acesso desses em mãos erradas causa dano grande.",
    },
    {
      valor: ctx?.cadastros_menores,
      label: "cadastros de menores de idade",
      porque: "Dado de menor de idade tem exigência legal redobrada, e é o que mais pesa numa multa.",
    },
  ].filter((i) => i.valor != null);

  return (
    <section>
      <Step n={1}>O momento</Step>
      <div className="cl-hero" style={{ background: s.bg, border: `1px solid color-mix(in srgb, ${s.cor} 27%, transparent)` }}>
        {/* Farol + manchete ficam numa faixa própria; pilares, legenda e a faixa
            de contexto passaram a ocupar a LARGURA TOTAL do herói (antes ficavam
            recuados na coluna do texto, o que apequenava os números). */}
        <div className="cl-hero-top">
          <div
            className="cl-dot"
            style={{ background: s.cor, boxShadow: `0 0 0 10px color-mix(in srgb, ${s.cor} 13%, transparent), 0 0 40px color-mix(in srgb, ${s.cor} 33%, transparent)` }}
          />
          <div style={{ flex: 1, minWidth: 320 }}>
            <div style={{ fontSize: 36, fontWeight: 700, letterSpacing: "-0.02em", lineHeight: 1.15 }}>{titulo}</div>
            {/* Sem `maxWidth` aqui: o herói agora ocupa a largura toda, e um
                teto de 900px cortava o parágrafo bem antes da borda do card,
                parecendo quebra de linha errada. O texto acompanha a coluna. */}
            <div style={{ fontSize: 16.5, color: T.muted, marginTop: 10, lineHeight: 1.55 }}>{apoio}</div>
          </div>
        </div>
        {pilares.length > 0 && (
          <div className="cl-pilares">
            {pilares.map((p) => (
              <div key={p.titulo} className="cl-pilar">
                <div
                  className="cl-pilar-t"
                  style={{ color: p.ok ? T.text : nivel === "vermelho" ? T.danger : T.warning }}
                >
                  <span className="cl-pilar-dot" style={{ background: p.ok ? T.success : T.warning }} />
                  {p.titulo}
                </div>
                <div className="cl-pilar-f">{p.frase}</div>
              </div>
            ))}
          </div>
        )}
        {acimaSetor != null && (
          <div className="cl-legenda">
            <span className="cl-legenda-l">Para entender</span>
            <p>
              <strong>NIST CSF mede maturidade</strong>: O quanto a operação de segurança evoluiu.
            </p>
            <p>
              <strong>ISO 27001 mede governança</strong>: É norma certificável, verificada por auditoria externa.
            </p>
            <p className="cl-legenda-fim">São réguas diferentes e complementares.</p>
          </div>
        )}
        {emJogo.length > 0 && (
          <div className="cl-emjogo">
            <div className="cl-emjogo-l">O que protegemos todos os dias</div>
            <div className="cl-emjogo-intro">
              Segurança da informação, aqui, é cuidar de gente. Estes são os números por trás de cada dia de aula.
            </div>
            <div className="cl-emjogo-grid">
              {emJogo.map((i) => (
                <div key={i.label} className="cl-emjogo-item">
                  <div className="cl-num cl-emjogo-v">{nf.format(Number(i.valor))}</div>
                  <div className="cl-emjogo-k">{i.label}</div>
                  <div className="cl-emjogo-p">{i.porque}</div>
                </div>
              ))}
            </div>
            <div className="cl-emjogo-fim">
              Nada disso pode vazar, ser usado por outra pessoa ou ficar fora do ar. É o trabalho que roda em silêncio,
              todo dia, para que ninguém aqui precise pensar nisso.
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

// ── Movimento 2 — como estamos indo ──────────────────────────────────────────
// Cada linha entrega DIMENSÃO + VEREDITO + uma oração que justifica o veredito.
// "Label — em dia" sozinho é checklist; o que torna executivo é a oração.
function ComoEstamos({ d }: { d: any }) {
  const cob = d.cobertura;
  const b = d.bloqueios;
  const m = d.maturidade;
  const inv = d.investimento;
  const trat = d.tratamento;
  const nc = d.naoConformidades;
  const pol = d.politicas;

  type Nivel = "bom" | "atencao" | "ruim";
  const cor: Record<Nivel, string> = { bom: T.success, atencao: T.warning, ruim: T.danger };

  const linhas: Array<{
    dim: string;
    nivel: Nivel;
    veredito: string;
    frase: string;
    nota?: string;
  }> = [];

  // 1 · Proteção dos dados — cadência de tentativas barradas, não contagem.
  if (b != null) {
    const porMinuto = b.total / (30 * 24 * 60);
    const cadencia =
      porMinuto >= 1
        ? `A cada minuto, ${nf.format(Math.round(porMinuto))} tentativas de invasão são barradas`
        : `A cada hora, ${nf.format(Math.max(1, Math.round(porMinuto * 60)))} tentativas de invasão são barradas`;
    linhas.push({
      dim: "Proteção dos dados",
      nivel: "bom",
      veredito: "em dia",
      frase: `${cadencia}. Nenhuma chegou ao aluno, à família ou ao colégio parceiro.`,
      nota: `${nf.format(b.total)} no período`,
    });
  }

  // 2 · Sistemas no ar — o veredito é contra a META, não contra a existência de
  // item fora do ar. Num parque desse tamanho sempre há algo caído; o que
  // importa é o patamar entregue. Meta de 85% é a mesma usada no Painel
  // Executivo (PainelExecutivo.tsx), para os dois painéis não divergirem.
  if (cob?.disponibilidadePct != null) {
    const META_DISP = 0.85;
    const abertas = cob.indisponibilidadesAbertas ?? 0;
    const acimaMeta = cob.disponibilidadePct >= META_DISP;
    linhas.push({
      dim: "Sistemas no ar",
      nivel: acimaMeta ? "bom" : "atencao",
      veredito: acimaMeta ? "acima da meta" : "abaixo da meta",
      frase: acimaMeta
        ? `${fmtPct(cob.disponibilidadePct, 0)} dos sistemas monitorados estão no ar, acima da meta de ${fmtPct(META_DISP, 0)} que a área persegue.${
            abertas > 0
              ? ` ${
                  abertas === 1
                    ? "O item fora do ar está endereçado"
                    : `Os ${nf.format(abertas)} itens fora do ar estão endereçados`
                } pela área técnica, dentro da própria rotina.`
              : ""
          }`
        : `${fmtPct(cob.disponibilidadePct, 0)} dos sistemas monitorados estão no ar, abaixo da meta de ${fmtPct(META_DISP, 0)}. A equipe está acionada nos ${nf.format(abertas)} itens fora do ar.`,
      nota: `${fmtPct(cob.disponibilidadePct, 2)} · meta ${fmtPct(META_DISP, 0)}`,
    });
  }

  // 3 · Equipamentos da equipe — criptografia dita como consequência.
  if (cob?.criptografiaPct != null) {
    const alto = cob.criptografiaPct >= 0.7;
    linhas.push({
      dim: "Equipamentos da equipe",
      nivel: alto ? "bom" : "atencao",
      veredito: alto ? "em dia" : "atenção",
      // A frase abre no percentual, porque é ele que mede o alcance do
      // controle. "Extraviado" no lugar de "perdido ou roubado": mantém o
      // cenário que dá sentido ao controle (o equipamento na mão de terceiro)
      // sem levar a leitura para crime, e é o termo que a diretoria usa.
      frase: `${fmtPct(cob.criptografiaPct, 0)} dos computadores da equipe têm o conteúdo protegido: Se um deles for extraviado, o dado que está dentro permanece inacessível a quem o encontrar.`,
      nota: `${nf.format(cob.criptografados)} de ${nf.format(cob.dispositivos)}`,
    });
  }

  // 4 · Posição no setor — sem sigla, sem escala.
  if (m?.nist != null && m?.mediaEdu) {
    const vezes = m.nist / m.mediaEdu;
    const acima = vezes > 1;
    linhas.push({
      dim: "Posição no setor",
      nivel: acima ? "bom" : "atencao",
      veredito: acima ? "acima da média" : "abaixo da média",
      // Frase curta aqui de propósito: o movimento 3 desenvolve esse mesmo
      // ponto. A faixa resume, o bloco explica — não repetem a mesma oração.
      frase: acima
        ? `Medidos pela mesma régua de outras empresas, ficamos ${dec(vezes)}× acima da média do setor.`
        : "Medidos pela mesma régua de outras empresas, ainda não alcançamos a média do setor.",
    });
  }

  // 5 · Regras publicadas — evidência de gestão, palatável e sem jargão.
  if (pol != null) {
    const alto = pol.publicadasPct >= 0.8;
    linhas.push({
      dim: "Regras internas",
      nivel: alto ? "bom" : "atencao",
      veredito: alto ? "em dia" : "atenção",
      frase: `${nf.format(pol.publicadas)} das ${nf.format(pol.total)} políticas de segurança estão escritas e publicadas. É o primeiro documento que um cliente ou auditor pede.`,
    });
  }

  // 6 · Acompanhamento — a área está no controle? Macro, sem listar item.
  {
    const atrasadas = trat?.atrasadas ?? 0;
    const emTratamento = trat?.total ?? 0;
    const pend = nc?.pendentes ?? 0;
    if (emTratamento > 0 || pend > 0) {
      linhas.push({
        dim: "Acompanhamento",
        nivel: atrasadas > 0 ? "ruim" : "bom",
        veredito: atrasadas > 0 ? "fora do prazo" : "sob controle",
        frase:
          atrasadas > 0
            ? `${nf.format(atrasadas)} ${atrasadas === 1 ? "assunto passou" : "assuntos passaram"} do prazo combinado de solução. A equipe de tecnologia trata o detalhe com você em separado.`
            : `${nf.format(emTratamento + pend)} assuntos em tratamento, todos dentro do prazo combinado.`,
      });
    }
  }

  // 7 · Investimento — a má notícia da tela, de propósito.
  if (inv?.pctReceita != null && inv?.pisoPct != null) {
    const vezesAbaixo = inv.pisoPct / (inv.pctReceita * 100);
    const abaixo = vezesAbaixo > 1;
    linhas.push({
      dim: "Investimento",
      nivel: abaixo ? "atencao" : "bom",
      veredito: abaixo ? "abaixo do mínimo" : "no patamar de mercado",
      frase: abaixo
        ? `Investimos ${dec(vezesAbaixo)}× menos que o mínimo praticado no mercado.`
        : "O investimento está no patamar praticado pelo mercado.",
    });
  }

  if (linhas.length === 0) return null;

  return (
    <section>
      <Step n={2}>Como estamos indo</Step>
      <div className="cl-card" style={{ padding: 0, overflow: "hidden" }}>
        {linhas.map((l, i) => (
          <div
            key={l.dim}
            className="cl-linha"
            style={{
              borderTop: i === 0 ? "none" : `1px solid ${T.border}`,
              borderLeft: `3px solid ${cor[l.nivel]}`,
            }}
          >
            <div className="cl-linha-dim">
              <div style={{ fontSize: 13.5, fontWeight: 700 }}>{l.dim}</div>
              <span className="cl-veredito" style={{ background: `color-mix(in srgb, ${cor[l.nivel]} 10%, transparent)`, color: cor[l.nivel] }}>
                {l.veredito}
              </span>
            </div>
            <div className="cl-linha-frase">{l.frase}</div>
            {l.nota && <div className="cl-linha-nota">{l.nota}</div>}
          </div>
        ))}
      </div>
    </section>
  );
}

// ── Movimento 3 — frente às outras escolas ───────────────────────────────────
function FrenteAoSetor({ d }: { d: any }) {
  const m = d.maturidade;
  if (m?.nist == null || !m?.mediaEdu) return null;
  const vezes = m.nist / m.mediaEdu;
  const acima = vezes > 1;
  const padroes = [m.nist != null ? "NIST CSF" : null, m.iso != null ? "ISO/IEC 27001" : null]
    .filter(Boolean)
    .join(" e ");

  return (
    <section>
      <Step n={3}>Frente às outras escolas</Step>
      <div className="cl-card">
        <div style={{ display: "flex", gap: 30, alignItems: "center", flexWrap: "wrap" }}>
          <div>
            <div className="cl-num" style={{ fontSize: 62, color: acima ? T.success : T.warning, lineHeight: 1 }}>
              {dec(vezes)}×
            </div>
            <div style={{ fontSize: 12.5, color: T.muted, marginTop: 8 }}>
              {acima ? "A média do setor" : "Da média do setor"}
            </div>
          </div>
          <div style={{ flex: 1, minWidth: 300 }}>
            <div style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.35, letterSpacing: "-0.01em" }}>
              {/* A frase acompanha o número em vez de descrevê-lo de forma fixa:
                  dizer "quase o dobro" com 2,4× subestima o próprio resultado. */}
              {acima
                ? vezes >= 2
                  ? "Nas avaliações internacionais de segurança, temos mais que o dobro da nota média das escolas do setor de educação."
                  : "Nas avaliações internacionais de segurança, estamos acima da média das escolas do setor de educação."
                : "Nas avaliações internacionais de segurança, ainda não alcançamos a média das escolas do setor."}
            </div>
            <div style={{ fontSize: 13.5, color: T.muted, marginTop: 12, lineHeight: 1.55 }}>
              A nota vem de avaliação externa, aplicada com a mesma régua a todas as empresas do estudo, e não de
              autoavaliação. A escala vai de 0 a {m.escalaMax ?? 5}, e mede o quanto a operação de segurança de uma
              empresa é madura: Processo definido, controle funcionando e evidência de que funciona, e não apenas
              ferramenta instalada.
            </div>
          </div>
        </div>
        <div className="cl-mono-calc">
          {padroes ? `avaliado em ${padroes}` : "avaliação de maturidade"} · nossa nota {dec(m.nist, 2)} contra{" "}
          {dec(m.mediaEdu, 2)} da média do setor
        </div>
      </div>
    </section>
  );
}

// ── Movimento 4 — quanto custa proteger ──────────────────────────────────────────
// Os três cards contam UMA história em três tempos, e a ordem importa:
//   1. HOJE — o que investimos, na unidade que o negócio usa (por aluno);
//   2. FRENTE AO MERCADO — quantas vezes abaixo do piso praticado estamos;
//   3. PARA CHEGAR AO PISO — o incremento, que é o que a diretoria aprova.
// Custo por colégio NÃO entra: ratear igualmente afirmaria que todo colégio
// pesa o mesmo (receita, porte, nº de alunos), e isso não é sabido. Por aluno
// fica porque é unidade de gestão do setor, não afirmação sobre receita.
function BlocoCusto({ d }: { d: any }) {
  const inv = d.investimento;
  const ctx = d.contexto;
  if (inv == null) return null;

  const alunos = ctx?.alunos ? Number(ctx.alunos) : null;
  const porAluno = alunos && alunos > 0 ? inv.investimento / alunos : null;
  const pisoPorAluno = alunos && alunos > 0 && inv.investimentoNoPiso != null ? inv.investimentoNoPiso / alunos : null;
  const abaixoDoPiso = inv.pctReceita != null && inv.pisoPct != null && inv.pctReceita * 100 < inv.pisoPct;
  // Quantas vezes abaixo do piso — a virada da história, e mais legível que
  // comparar "0,075%" com "0,5%" de cabeça.
  const vezesAbaixo =
    inv.pctReceita != null && inv.pctReceita > 0 && inv.pisoPct != null ? inv.pisoPct / (inv.pctReceita * 100) : null;
  const faltaPorAluno = pisoPorAluno != null && porAluno != null ? pisoPorAluno - porAluno : null;
  const faltaTotal = inv.investimentoNoPiso != null ? inv.investimentoNoPiso - inv.investimento : null;

  const Tempo = ({ n, children }: { n: string; children: string }) => (
    <div className="cl-beat">
      <span className="cl-beat-n">{n}</span>
      {children}
    </div>
  );

  return (
    <section>
      <Step n={4}>Quanto custa proteger</Step>
      <div className="cl-grid" style={{ gridTemplateColumns: "minmax(300px,5fr) 7fr" }}>
        {/* 1 — HOJE */}
        <div className="cl-card" style={{ borderColor: abaixoDoPiso ? `color-mix(in srgb, ${T.warning} 33%, transparent)` : `color-mix(in srgb, ${T.success} 27%, transparent)` }}>
          <Tempo n="1">Hoje</Tempo>
          <div className="cl-num" style={{ fontSize: 52, marginTop: 12, color: abaixoDoPiso ? T.warning : T.success }}>
            {porAluno != null ? brl.format(porAluno) : "n/d"}
          </div>
          <div style={{ fontSize: 14, fontWeight: 600, marginTop: 6 }}>Por aluno, por ano</div>
          <div style={{ fontSize: 13.5, color: T.muted, marginTop: 10, lineHeight: 1.55 }}>
            {alunos != null
              ? `É o que investimos por ano para proteger o dado e o acesso de cada um dos ${nf.format(alunos)} alunos.`
              : "Cadastre o número de alunos na aba Operações para ver o valor por aluno."}
          </div>
          {alunos != null && (
            <div className="cl-mono-calc">
              {money.format(inv.investimento)} ÷ {nf.format(alunos)} alunos
            </div>
          )}
          <Fonte>{`Benchmark · investimento ${inv.ano}`}</Fonte>
        </div>

        <div className="cl-grid" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(240px,1fr))" }}>
          {/* 2 — FRENTE AO MERCADO */}
          <div className="cl-card">
            <Tempo n="2">Frente ao mercado</Tempo>
            {vezesAbaixo != null && vezesAbaixo > 1 ? (
              <>
                <div className="cl-num" style={{ fontSize: 34, marginTop: 12, color: T.warning }}>
                  {dec(vezesAbaixo)}×
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 6 }}>Abaixo do piso praticado</div>
              </>
            ) : (
              <>
                <div className="cl-num" style={{ fontSize: 34, marginTop: 12, color: T.success }}>
                  {inv.pctReceita != null ? fmtPct(inv.pctReceita, 2) : "n/d"}
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 6 }}>Da receita, no patamar de mercado</div>
              </>
            )}
            <div style={{ fontSize: 12.5, color: T.muted, marginTop: 8, lineHeight: 1.5 }}>
              {inv.pisoPct != null && inv.pctReceita != null
                ? `Investimos ${fmtPct(inv.pctReceita, 3)} da receita anual. O mínimo praticado no mercado é ${fmtPct(inv.pisoPct / 100, 1)}.`
                : "Sem referência de mercado cadastrada."}
            </div>
            <Fonte>Benchmark · referências de mercado</Fonte>
          </div>

          {/* 3 — PARA CHEGAR AO PISO (só quando estamos abaixo) */}
          {pisoPorAluno != null && abaixoDoPiso && faltaPorAluno != null && (
            <div
              className="cl-card"
              style={{
                borderColor: `color-mix(in srgb, ${T.warning} 33%, transparent)`,
                background: `linear-gradient(180deg, ${T.surface}, ${T.surfaceAlt})`,
              }}
            >
              <Tempo n="3">Para chegar ao piso</Tempo>
              {/* "De → para" em vez do incremento sozinho: mostrar só "+R$ 10,62"
                  faz o leitor confundir o que falta com o valor-alvo. */}
              <div
                style={{
                  display: "flex",
                  alignItems: "baseline",
                  gap: 8,
                  marginTop: 12,
                  flexWrap: "wrap",
                }}
              >
                <span className="cl-num" style={{ fontSize: 20, color: T.subtle }}>
                  {brl.format(porAluno as number)}
                </span>
                <span style={{ fontSize: 17, color: T.subtle }}>→</span>
                <span className="cl-num" style={{ fontSize: 34, color: T.warning }}>
                  {brl.format(pisoPorAluno)}
                </span>
              </div>
              <div style={{ fontSize: 13.5, fontWeight: 600, marginTop: 6 }}>Por aluno, por ano</div>
              <div style={{ fontSize: 12.5, color: T.muted, marginTop: 8, lineHeight: 1.5 }}>
                São <strong>+{brl.format(faltaPorAluno)}</strong> por aluno.
                {faltaTotal != null && (
                  <>
                    {" "}
                    Em orçamento, <strong>{brlC.format(faltaTotal)} a mais por ano</strong>, valor recorrente e não
                    aporte único.
                  </>
                )}
              </div>
              <div className="cl-mono-calc">
                piso de {fmtPct((inv.pisoPct as number) / 100, 1)} da receita, sendo que a média de mercado fica acima
                disso
              </div>
              <Fonte>Benchmark · piso de mercado</Fonte>
            </div>
          )}
        </div>
      </div>
      {/* Fecho do movimento, escrito para quem decide investimento e não
          entende de segurança: posição, referência e o valor da decisão, nessa
          ordem, em três linhas de leitura direta. Parágrafo corrido não servia
          aqui — obrigava a garimpar os números no meio do texto. A ressalva de
          método fica por último e subordinada, porque corrige a margem e não o
          quadro: com uma diferença medida em vezes, incluir equipe no cálculo
          não muda a conclusão. */}
      <div className="cl-fecho">
        {abaixoDoPiso && vezesAbaixo != null && (
          <div className="cl-fecho-linhas">
            <div>
              <span>Posição atual</span>
              <strong>{fmtPct(inv.pctReceita, 3)} da receita</strong>
              <em>{money.format(inv.investimento)} por ano</em>
            </div>
            <div>
              <span>Mínimo de mercado</span>
              <strong>{fmtPct((inv.pisoPct as number) / 100, 1)} da receita</strong>
              <em>{inv.investimentoNoPiso != null ? `${money.format(inv.investimentoNoPiso)} por ano` : "Sem base"}</em>
            </div>
            {faltaTotal != null && (
              <div className="cl-fecho-decidir">
                <span>Para decidir</span>
                <strong>+{brlC.format(faltaTotal)} por ano</strong>
                <em>Recorrente, não aporte único</em>
              </div>
            )}
          </div>
        )}
        {abaixoDoPiso && vezesAbaixo != null && (
          <p>
            Operamos com <strong>{fmtPct((inv.pctReceita * 100) / (inv.pisoPct as number), 0)}</strong> do orçamento que
            o mercado trata como mínimo. O resultado das telas anteriores foi entregue assim, o que mostra eficiência, e
            não folga: Quanto menor o orçamento, menor a margem para absorver um evento fora do padrão. A decisão é
            aprovar o incremento recorrente ou seguir abaixo do mínimo de forma consciente.
          </p>
        )}
        <p className="cl-fecho-nota">
          Ressalva de método: As referências de mercado incluem <strong>equipe</strong>, e não só ferramentas. Se o
          valor cadastrado cobrir apenas licenças, o nosso número real é maior que o exibido e a distância até o mínimo,
          menor.
        </p>
      </div>
    </section>
  );
}

// ── Aba Operações — cadastro do contexto institucional ───────────────────────
function CLevelOperacoes() {
  const qc = useQueryClient();
  const fetchOverview = useServerFn(getCLevelOverview);
  const salvar = useServerFn(upsertCLevelContexto);
  const { data, isLoading } = useQuery({
    queryKey: ["c-level", "overview"],
    queryFn: () => fetchOverview(),
    staleTime: 60_000,
  });
  const ctx = (data as any)?.contexto ?? null;
  const [form, setForm] = React.useState({
    alunos: "",
    colegios: "",
    cadastros_menores: "",
    colaboradores: "",
    colaboradores_corporativos: "",
    fonte: "",
    referencia: "",
  });

  React.useEffect(() => {
    if (ctx) {
      setForm({
        alunos: ctx.alunos != null ? String(ctx.alunos) : "",
        colegios: ctx.colegios != null ? String(ctx.colegios) : "",
        cadastros_menores: ctx.cadastros_menores != null ? String(ctx.cadastros_menores) : "",
        colaboradores: ctx.colaboradores != null ? String(ctx.colaboradores) : "",
        colaboradores_corporativos:
          ctx.colaboradores_corporativos != null ? String(ctx.colaboradores_corporativos) : "",
        fonte: ctx.fonte ?? "",
        referencia: ctx.referencia ?? "",
      });
    }
  }, [
    ctx?.updated_at,
    ctx?.alunos,
    ctx?.colegios,
    ctx?.cadastros_menores,
    ctx?.colaboradores,
    ctx?.colaboradores_corporativos,
  ]);

  const mut = useMutation({
    mutationFn: (v: Record<string, unknown>) => salvar({ data: v as never }),
    onSuccess: () => {
      toast.success("Contexto institucional atualizado");
      qc.invalidateQueries({ queryKey: ["c-level"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });

  // Campo vazio grava NULL — é assim que a tela volta a mostrar a lacuna em vez
  // de um número que ninguém confirmou.
  const int = (v: string) => {
    const s = v.replace(/\D/g, "");
    return s === "" ? null : Number(s);
  };

  if (isLoading) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: 48, color: T.muted }}>
        <Loader2 className="size-5 animate-spin" />
      </div>
    );
  }

  const semTabela = ctx == null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16, maxWidth: 900 }}>
      {semTabela && (
        <div className="cl-vazio" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <AlertTriangle size={18} color={T.warning} style={{ flexShrink: 0, marginTop: 2 }} />
          <div style={{ fontSize: 13.5, color: T.muted, lineHeight: 1.55 }}>
            <strong style={{ color: T.text }}>Cadastro indisponível.</strong> A tabela
            <code style={{ margin: "0 4px" }}>clevel_contexto</code>
            não respondeu. Provavelmente ainda não foi criada no banco. Rode o script de criação e recarregue; salvar
            agora vai falhar.
          </div>
        </div>
      )}

      <div className="cl-card">
        <div style={{ fontSize: 15, fontWeight: 700 }}>Contexto institucional</div>
        <div style={{ fontSize: 13, color: T.muted, marginTop: 6, lineHeight: 1.55, maxWidth: 720 }}>
          Números que a área informa. Não vêm de telemetria de segurança, e é por isso que ficam aqui: O painel prefere
          mostrar a lacuna a estimar valor. Deixe um campo em branco para ele voltar a aparecer como não informado.
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fit,minmax(190px,1fr))",
            gap: 14,
            marginTop: 18,
          }}
        >
          <div>
            <Label className="text-xs">Alunos atendidos</Label>
            <Input
              value={form.alunos}
              inputMode="numeric"
              placeholder="400000"
              onChange={(e) => setForm({ ...form, alunos: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Colégios parceiros</Label>
            <Input
              value={form.colegios}
              inputMode="numeric"
              placeholder="1000"
              onChange={(e) => setForm({ ...form, colegios: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Cadastros de menores</Label>
            <Input
              value={form.cadastros_menores}
              inputMode="numeric"
              placeholder="sem estimativa"
              onChange={(e) => setForm({ ...form, cadastros_menores: e.target.value })}
            />
          </div>
          {/* Contagens de pessoal: exibição apenas, nunca divisor.
              Ver o comentário do bloco `contexto` em clevel.functions.ts. */}
          <div>
            <Label className="text-xs">Colaboradores (com professores)</Label>
            <Input
              value={form.colaboradores}
              inputMode="numeric"
              placeholder="não informado"
              onChange={(e) => setForm({ ...form, colaboradores: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Colaboradores corporativos</Label>
            <Input
              value={form.colaboradores_corporativos}
              inputMode="numeric"
              placeholder="não informado"
              onChange={(e) => setForm({ ...form, colaboradores_corporativos: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Fonte do dado</Label>
            <Input
              value={form.fonte}
              placeholder="Secretaria acadêmica"
              onChange={(e) => setForm({ ...form, fonte: e.target.value })}
            />
          </div>
          <div>
            <Label className="text-xs">Referência</Label>
            <Input
              value={form.referencia}
              placeholder="base 2026"
              onChange={(e) => setForm({ ...form, referencia: e.target.value })}
            />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 14, marginTop: 20 }}>
          <Button
            disabled={mut.isPending}
            onClick={() =>
              mut.mutate({
                alunos: int(form.alunos),
                colegios: int(form.colegios),
                cadastros_menores: int(form.cadastros_menores),
                colaboradores: int(form.colaboradores),
                colaboradores_corporativos: int(form.colaboradores_corporativos),
                fonte: form.fonte || null,
                referencia: form.referencia || null,
              })
            }
          >
            {mut.isPending ? "Salvando…" : "Salvar"}
          </Button>
          {ctx?.updated_at && (
            <span style={{ fontSize: 12, color: T.subtle }}>
              Última atualização:{" "}
              {new Date(ctx.updated_at).toLocaleString("pt-BR", {
                day: "2-digit",
                month: "2-digit",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
      </div>

      <div className="cl-vazio" style={{ fontSize: 12.5, color: T.muted, lineHeight: 1.6 }}>
        O valor de <strong>investimento em cibersegurança</strong> e o <strong>faturamento</strong> não são editados
        aqui: O painel os lê do cadastro do módulo <strong>Benchmark</strong>, para não existirem dois lugares com o
        mesmo número.
      </div>
    </div>
  );
}

function CLevelStoryline() {
  const fetchOverview = useServerFn(getCLevelOverview);
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ["c-level", "overview"],
    queryFn: () => fetchOverview(),
    staleTime: 60_000,
  });

  // Sem `cl-wrap` aqui: o shell (PainelCLevelDashboard) já provê o wrapper.
  // Aninhar dois `cl-wrap` dobrava o `margin:-2rem` e o padding.
  if (isLoading && !data) {
    return (
      <div className="cl-root" style={{ alignItems: "center", padding: "80px 0", color: T.muted }}>
        <Loader2 className="size-6 animate-spin" />
        <span style={{ fontSize: 14 }}>Carregando o painel…</span>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="cl-root" style={{ padding: "60px 0" }}>
        <div className="cl-vazio" style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
          <AlertTriangle size={20} color={T.danger} style={{ flexShrink: 0, marginTop: 2 }} />
          <div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Não foi possível carregar o painel</div>
            <div style={{ fontSize: 13.5, color: T.muted, marginTop: 6 }}>{(error as Error)?.message}</div>
          </div>
        </div>
      </div>
    );
  }

  const ref = periodoRef();

  return (
    <div className="cl-root">
      <div>
        <div
          style={{
            fontSize: 12,
            letterSpacing: ".16em",
            textTransform: "uppercase",
            color: T.muted,
          }}
        >
          Prestação de contas da Segurança da Informação
        </div>
        <div style={{ fontSize: 30, fontWeight: 700, marginTop: 6, letterSpacing: "-0.02em" }}>Painel C-Level</div>
        <div style={{ fontSize: 14, color: T.muted, marginTop: 6 }}>{ref}</div>
      </div>

      <MomentoAtual d={data} />
      <ComoEstamos d={data} />
      <FrenteAoSetor d={data} />
      <BlocoCusto d={data} />

      <div
        style={{
          borderTop: `1px solid ${T.border}`,
          paddingTop: 16,
          fontSize: 12.5,
          color: T.muted,
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <span>
          Este painel resume. <strong>O detalhe técnico de cada número está no Painel Executivo</strong>, com a equipe
          de tecnologia. Nada aqui é estimativa ou opinião.
        </span>
        <span style={{ color: T.subtle }}>
          Período: {ref} · Responsável: Head de Segurança da Informação. Este painel não afirma nada sobre continuidade
          de aula: Mede a disponibilidade dos sistemas, que é o que a Segurança da Informação de fato acompanha.
        </span>
      </div>
    </div>
  );
}

// ── Shell com abas — mesmo padrão do módulo Benchmark ────────────────────────
export function PainelCLevelDashboard() {
  const { can, isAdmin, isModuleAdmin } = usePermissions();
  // Módulo exclusivo: quem decide é has_module_permission no banco. Aqui só
  // escondemos a aba de quem não tem "manage" — o gate real é na server fn.
  const podeGerenciar = isAdmin || isModuleAdmin("painel-c-level") || can("painel-c-level", "manage");
  const [aba, setAba] = React.useState<"painel" | "operacoes">("painel");

  // Modo apresentação — mesma mecânica do Painel Executivo. O ref fica no
  // wrapper do módulo, e não em document.documentElement, para a tela cheia
  // NÃO levar a barra lateral do sistema junto.
  const presentRef = React.useRef<HTMLDivElement>(null);
  const [presenting, setPresenting] = React.useState(false);

  const togglePresent = async () => {
    try {
      if (!document.fullscreenElement) {
        await presentRef.current?.requestFullscreen();
        setPresenting(true);
      } else {
        await document.exitFullscreen();
        setPresenting(false);
      }
    } catch {
      /* ignore */
    }
  };

  // Sair com ESC não passa pelo nosso botão, então o rótulo tem de ouvir o
  // evento do navegador para não ficar preso em "Sair".
  React.useEffect(() => {
    const onFsChange = () => setPresenting(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onFsChange);
    return () => document.removeEventListener("fullscreenchange", onFsChange);
  }, []);

  return (
    <div className="cl-wrap" ref={presentRef}>
      <style>{CSS}</style>
      <div className="cl-topbar">
        {podeGerenciar && (
          <div className="cl-tabs">
            <button className={`cl-tab${aba === "painel" ? " active" : ""}`} onClick={() => setAba("painel")}>
              Painel
            </button>
            <button className={`cl-tab${aba === "operacoes" ? " active" : ""}`} onClick={() => setAba("operacoes")}>
              Operações
            </button>
          </div>
        )}
        <button className="cl-btn" onClick={togglePresent}>
          <Maximize2 size={12} /> {presenting ? "Sair" : "Modo apresentação"}
        </button>
      </div>
      {aba === "operacoes" && podeGerenciar ? (
        <div className="cl-root">
          <CLevelOperacoes />
        </div>
      ) : (
        <CLevelStoryline />
      )}
    </div>
  );
}

export default PainelCLevelDashboard;
