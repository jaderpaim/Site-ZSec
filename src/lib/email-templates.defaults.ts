/**
 * Default HTML builders for every SMTP template.
 * Pure functions — no async, no env vars, no DB access.
 * Import these in functions files instead of writing HTML inline.
 * Todos usam o layout único de email-layout.ts.
 */
import { APP_NAME } from "@/lib/brand";
import {
  daysTone,
  emailChip,
  emailStrong,
  esc,
  renderEmail,
  renderEmailBlock,
  type Fact,
  type Tone,
} from "./email-layout";

const ADMIN_REASON = `Você recebeu porque é administrador global do ${APP_NAME}.`;

export function fmtDate(s: string | null): string {
  if (!s) return "—";
  try {
    return new Date(s).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" });
  } catch {
    return s;
  }
}

function nowBr(): string {
  return new Date().toLocaleString("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** "2026-10-30" → "30/10/2026" (outros formatos passam como vieram). */
function fmtDay(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : s;
}

function tipoTone(tipo: string): Tone {
  if (tipo === "Emergencial") return "crit";
  if (tipo === "Prioritária") return "warn";
  return "info";
}

/** "CAMPOS ALTERADOS" → "Campos alterados" (rótulos legados vinham em caixa alta). */
function sentenceCase(s: string): string {
  return s === s.toUpperCase() ? s.charAt(0) + s.slice(1).toLowerCase() : s;
}

// ─── Cloudflare ───────────────────────────────────────────────────────────────

export function buildDnsRecordCreatedHtml(args: {
  zona: string;
  tipo: string;
  nome: string;
  conteudo: string;
  proxy: string;
  criado_por: string;
  link: string;
}): string {
  const { zona, tipo, nome, conteudo, proxy, criado_por, link } = args;
  const proxyAtivo = proxy.toLowerCase().startsWith("ativ");
  return renderEmail({
    module: "Cloudflare WAF",
    tone: "ok",
    status: "Registro DNS criado",
    title: `Registro ${tipo} criado em ${zona}`,
    intro: `${emailStrong(criado_por)} criou um registro DNS pela aba Operações do módulo Cloudflare WAF.`,
    preheader: `${nome} → ${conteudo} · proxy ${proxyAtivo ? "ativado" : "desativado"}`,
    blocks: [
      {
        kind: "facts",
        items: [
          { label: "Nome", value: nome, mono: true },
          { label: "Tipo", value: tipo },
          { label: "Conteúdo", value: conteudo, mono: true },
          {
            label: "Proxy",
            value: proxy,
            html: proxyAtivo
              ? `<span style="color:#b45309;font-weight:600;">● ${esc(proxy)}</span> <span style="color:#6b7280;">(tráfego passa pela Cloudflare)</span>`
              : `<span style="color:#6b7280;">○ ${esc(proxy)}</span>`,
          },
          { label: "Zona", value: zona },
        ],
      },
    ],
    cta: { label: `Ver registro no ${APP_NAME}`, url: link },
    meta: `Criado por ${emailStrong(criado_por)} · ${nowBr()}`,
    reason: ADMIN_REASON,
  });
}

const DNS_FIELD_LABEL: Record<string, string> = {
  content: "Conteúdo",
  name: "Nome",
  type: "Tipo",
  ttl: "TTL",
  proxied: "Proxy",
  comment: "Comentário",
};

function fmtDnsValue(path: string, v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (path === "proxied") return v === true || v === "true" ? "Ativado" : "Desativado";
  if (path === "ttl") {
    const n = Number(v);
    if (n === 1) return "Automático";
    if (Number.isFinite(n)) {
      if (n % 86400 === 0) return `${n / 86400} dia(s)`;
      if (n % 3600 === 0) return `${n / 3600} hora(s)`;
      if (n % 60 === 0) return `${n / 60} min`;
      return `${n} s`;
    }
  }
  return String(v);
}

export function buildDnsRecordUpdatedHtml(args: {
  zona: string;
  tipo: string;
  nome: string;
  conteudo_anterior: string;
  conteudo_novo: string;
  proxy: string;
  editado_por: string;
  link: string;
  // Diff campo a campo (calculado em updateDnsRecord/diffObjects). Sem isso o
  // bloco "antes/depois" mostraria o conteúdo mesmo quando só outro campo mudou.
  changes?: Array<{ path: string; before: unknown; after: unknown }>;
}): string {
  const {
    zona,
    tipo,
    nome,
    conteudo_anterior,
    conteudo_novo,
    editado_por,
    link,
    changes = [],
  } = args;
  // changes já vem calculado por quem chama; se não vier (chamador antigo),
  // compara só o conteúdo.
  const effective =
    changes.length > 0
      ? changes
      : conteudo_anterior !== conteudo_novo
        ? [{ path: "content", before: conteudo_anterior, after: conteudo_novo }]
        : [];
  const n = effective.length;
  const labels = effective.map((c) => (DNS_FIELD_LABEL[c.path] ?? c.path).toLowerCase());
  return renderEmail({
    module: "Cloudflare WAF",
    tone: "warn",
    status: "Registro DNS editado",
    title: `${nome} foi alterado`,
    intro: `${emailStrong(editado_por)} alterou ${n === 1 ? "1 campo" : `${n} campos`} de um registro ${esc(tipo)} na zona ${esc(zona)}.`,
    preheader: n
      ? `Alterado: ${labels.join(", ")} em ${nome}`
      : `Registro ${nome} salvo sem alterações`,
    blocks: [
      ...(n
        ? [
            {
              kind: "diff" as const,
              title: "O que mudou",
              items: effective.map((c) => ({
                label: DNS_FIELD_LABEL[c.path] ?? c.path,
                before: fmtDnsValue(c.path, c.before),
                after: fmtDnsValue(c.path, c.after),
              })),
            },
          ]
        : []),
      {
        kind: "facts",
        title: "Registro",
        items: [
          { label: "Nome", value: nome, mono: true },
          { label: "Tipo", value: tipo },
          { label: "Zona", value: zona },
        ],
      },
    ],
    cta: { label: `Ver registro no ${APP_NAME}`, url: link },
    meta: `Editado por ${emailStrong(editado_por)} · ${nowBr()}`,
    reason: ADMIN_REASON,
  });
}

function toneFromHex(hex: string): Tone {
  const h = hex.toLowerCase();
  if (h === "#dc2626" || h === "#ef4444") return "crit";
  if (h === "#d97706" || h === "#f59e0b") return "warn";
  if (h === "#059669" || h === "#10b981") return "ok";
  if (h === "#6b7280") return "neutral";
  return "info";
}

const ACTION_VERB: Record<string, string> = {
  editada: "editou",
  excluída: "excluiu",
  habilitada: "habilitou",
  desabilitada: "desabilitou",
};

export function buildRuleAlertHtml(args: {
  badge: string; // ex.: "REGRA EDITADA"
  heroTitle: string; // ex.: "Regra de Rules editada"
  accentColor: string; // hex, ex.: "#d97706" (define o tom do e-mail)
  accentBg?: string; // legado, não usado
  zona: string;
  categoria: string;
  descricao: string;
  extraFacts?: Array<{ label: string; value: string }>;
  atorLabel: string; // ex.: "EDITADO POR"
  ator: string;
  atorColor?: string; // legado, não usado
  link: string;
}): string {
  const {
    badge,
    heroTitle,
    accentColor,
    zona,
    categoria,
    descricao,
    extraFacts = [],
    atorLabel,
    ator,
    link,
  } = args;
  const tone = toneFromHex(accentColor);
  const status = sentenceCase(badge);
  const verb = status.replace(/^Regra\s+/i, "").toLowerCase(); // "editada", "excluída"…
  const nome = descricao?.trim() || "Regra sem nome";
  const facts: Fact[] = [
    { label: "Regra", value: nome },
    { label: "Categoria", value: categoria },
    ...extraFacts.map((f) => ({ label: sentenceCase(f.label), value: f.value })),
    { label: "Zona", value: zona },
  ];
  return renderEmail({
    module: "Cloudflare WAF",
    tone,
    status,
    title: `Regra “${nome}” ${verb}`,
    intro: `${emailStrong(ator)} ${ACTION_VERB[verb] ?? `alterou (${esc(heroTitle.toLowerCase())})`} uma regra de ${esc(categoria)} na zona ${esc(zona)}.${
      tone === "crit" ? " Ela deixou de valer imediatamente." : ""
    }`,
    preheader: `${categoria} · ${zona} · por ${ator}`,
    blocks: [
      { kind: "facts", items: facts },
      ...(tone === "crit"
        ? [
            {
              kind: "note" as const,
              tone: "crit" as const,
              title: "Não reconhece esta alteração?",
              text: "Confira no log de auditoria do Cloudflare quem fez a alteração e recrie a regra se necessário.",
            },
          ]
        : []),
    ],
    cta: { label: `Abrir regras no ${APP_NAME}`, url: link },
    meta: `${esc(sentenceCase(atorLabel))} ${emailStrong(ator)} · ${nowBr()}`,
    reason: ADMIN_REASON,
  });
}

// ─── Tabelas dos alertas em lote (token {{tabela}}) ───────────────────────────
// Montadas por quem chama e usadas tanto no HTML padrão quanto nos templates
// personalizados — por isso saem como bloco pronto do layout.

export function emailTableHtml(
  columns: Array<{ label: string; align?: "left" | "right" }>,
  rows: Array<Array<{ text: string; mono?: boolean; chip?: Tone }>>,
): string {
  return renderEmailBlock({ kind: "table", columns, rows });
}

export function expiryRowsTable(
  firstCol: string,
  secondCol: string,
  rows: Array<{ nome: string; segundo: string; vencimento: string; dias: number }>,
): string {
  return emailTableHtml(
    [
      { label: firstCol },
      { label: secondCol },
      { label: "Vence em" },
      { label: "Prazo", align: "right" },
    ],
    rows.map((r) => [
      { text: r.nome, mono: true },
      { text: r.segundo },
      { text: fmtDay(r.vencimento) },
      { text: r.dias === 1 ? "1 dia" : `${r.dias} dias`, chip: daysTone(r.dias) },
    ]),
  );
}

// ─── CMDB ─────────────────────────────────────────────────────────────────────

export function buildCmdbDeviceAlertHtml(
  tabela: string,
  opts?: { quantidade?: number; link?: string },
): string {
  const n = opts?.quantidade;
  return renderEmail({
    module: "CMDB",
    tone: "warn",
    status: "Monitoramento parcial",
    title: n
      ? `${n} ${n === 1 ? "ativo está" : "ativos estão"} em só um sistema de monitoramento`
      : "Ativos com monitoramento parcial",
    intro:
      "Estes ativos aparecem no SIEM <em>ou</em> no Zabbix, mas não nos dois. Uma falha no sistema que falta passaria despercebida.",
    preheader: n ? `${n} ativo(s) com monitoramento parcial` : "Ativos com monitoramento parcial",
    blocks: [{ kind: "html", html: tabela }],
    ...(opts?.link ? { cta: { label: "Revisar ativos no CMDB", url: opts.link } } : {}),
    meta: `Verificação automática · ${nowBr()}`,
    reason: "Você recebeu porque está na lista de alertas do CMDB.",
  });
}

export function buildCmdbDeviceStoppedHtml(
  tabela: string,
  opts?: { quantidade?: number; link?: string },
): string {
  const n = opts?.quantidade;
  return renderEmail({
    module: "CMDB",
    tone: "crit",
    status: "Sem monitoramento",
    title: n
      ? `${n} ${n === 1 ? "ativo não está" : "ativos não estão"} em nenhum monitoramento`
      : "Ativos sem monitoramento",
    intro:
      "Estes ativos estão no CMDB, mas <strong>não foram encontrados em nenhuma ferramenta de monitoramento</strong> (a coluna “Falta em” mostra quais). Hoje ninguém seria avisado se eles parassem.",
    preheader: n ? `${n} ativo(s) sem monitoramento` : "Ativos sem monitoramento",
    blocks: [{ kind: "html", html: tabela }],
    ...(opts?.link ? { cta: { label: "Revisar ativos no CMDB", url: opts.link } } : {}),
    meta: `Verificação automática · ${nowBr()}`,
    reason: "Você recebeu porque está na lista de alertas do CMDB.",
  });
}

// ─── Domínios / SSL ───────────────────────────────────────────────────────────

type ExpiryOpts = {
  quantidade?: number;
  maisUrgente?: { nome: string; dias: number };
  link?: string;
};

function expiryIntro(o: ExpiryOpts | undefined, tail: string): string {
  const u = o?.maisUrgente;
  if (!u) return tail;
  return `O mais urgente é <strong class="fg" style="color:#111827;">${esc(u.nome)}, que vence em ${u.dias === 1 ? "1 dia" : `${u.dias} dias`}</strong>. ${tail}`;
}

export function buildDomainExpiryAlertHtml(tabela: string, opts?: ExpiryOpts): string {
  const n = opts?.quantidade;
  const u = opts?.maisUrgente;
  return renderEmail({
    module: "Domínios e SSL",
    tone: u ? (daysTone(u.dias) === "crit" ? "crit" : "warn") : "warn",
    status: "Renovação pendente",
    title: n
      ? `${n} ${n === 1 ? "domínio vence" : "domínios vencem"} em breve`
      : "Domínios próximos do vencimento",
    intro: expiryIntro(opts, "Domínio vencido derruba site, e-mail e certificados."),
    preheader: u
      ? `${u.nome} vence em ${u.dias} dia(s)${n && n > 1 ? ` · mais ${n - 1}` : ""}`
      : "Domínios próximos do vencimento",
    blocks: [{ kind: "html", html: tabela }],
    ...(opts?.link ? { cta: { label: "Abrir Domínios e SSL", url: opts.link } } : {}),
    meta: `Verificação automática · ${nowBr()}`,
    reason: "Você recebeu porque é administrador global ou responsável por um destes domínios.",
  });
}

export function buildSslExpiryAlertHtml(tabela: string, opts?: ExpiryOpts): string {
  const n = opts?.quantidade;
  const u = opts?.maisUrgente;
  return renderEmail({
    module: "Domínios e SSL",
    tone: u ? (daysTone(u.dias) === "crit" ? "crit" : "warn") : "warn",
    status: "Certificado vencendo",
    title: n
      ? `${n} ${n === 1 ? "certificado SSL vence" : "certificados SSL vencem"} em breve`
      : "Certificados SSL próximos do vencimento",
    intro: expiryIntro(
      opts,
      "Depois do vencimento o navegador bloqueia o acesso com aviso de site inseguro.",
    ),
    preheader: u
      ? `${u.nome} vence em ${u.dias} dia(s)${n && n > 1 ? ` · mais ${n - 1}` : ""}`
      : "Certificados próximos do vencimento",
    blocks: [{ kind: "html", html: tabela }],
    ...(opts?.link ? { cta: { label: "Abrir Domínios e SSL", url: opts.link } } : {}),
    meta: `Verificação automática · ${nowBr()}`,
    reason: "Você recebeu porque é administrador global ou responsável por um destes domínios.",
  });
}

// ─── Fornecedores ─────────────────────────────────────────────────────────────

export function buildFornecedorExpiryAlertHtml(args: {
  nome: string;
  servico: string;
  vencimento: string;
  dias: number;
  link?: string;
}): string {
  const { nome, servico, dias, link } = args;
  const vencimento = fmtDay(args.vencimento);
  const prazo = dias === 1 ? "1 dia" : `${dias} dias`;
  return renderEmail({
    module: "Fornecedores",
    tone: daysTone(dias) === "crit" ? "crit" : "warn",
    status: "Contrato vencendo",
    title: `Contrato com ${nome} vence em ${prazo}`,
    intro: `O contrato de ${emailStrong(servico)} vence em ${esc(vencimento)}. Inicie a renovação ou a substituição para não ficar sem cobertura.`,
    preheader: `Vence em ${vencimento} · ${servico}`,
    blocks: [
      {
        kind: "facts",
        items: [
          { label: "Fornecedor", value: nome },
          { label: "Serviço", value: servico },
          {
            label: "Vencimento",
            value: vencimento,
            html: `${esc(vencimento)} &nbsp;${emailChip(prazo, daysTone(dias))}`,
          },
        ],
      },
    ],
    ...(link ? { cta: { label: "Abrir fornecedor", url: link } } : {}),
    reason: "Você recebeu porque é responsável por este fornecedor ou administrador global.",
  });
}

// ─── Usuários ─────────────────────────────────────────────────────────────────

// Convite para usuário recém-criado: o acesso é via SSO, o link só ativa a conta.
export function buildUserInviteHtml(args: {
  fullName: string;
  email: string;
  roleLabel: string;
  inviteUrl: string;
}): string {
  const primeiroNome = args.fullName.trim().split(/\s+/)[0] || args.fullName;
  return renderEmail({
    module: "Acesso",
    tone: "info",
    status: "Conta criada",
    title: `${primeiroNome}, seu acesso ao ${APP_NAME} está pronto`,
    intro: `Uma conta foi criada para você com o perfil ${emailStrong(args.roleLabel)}. Ative a conta e depois entre pelo SSO da sua organização — não é preciso criar senha.`,
    preheader: `Ative sua conta no ${APP_NAME} · perfil ${args.roleLabel}`,
    blocks: [
      {
        kind: "facts",
        items: [
          { label: "E-mail de acesso", value: args.email, mono: true },
          { label: "Perfil", value: args.roleLabel },
        ],
      },
      {
        kind: "text",
        text: `<span style="font-size:13px;color:#6b7280;">O link é pessoal e tem validade limitada. Não compartilhe. Se o botão não funcionar, copie o endereço: <a href="${args.inviteUrl}" style="color:#2563eb;word-break:break-all;">${esc(args.inviteUrl)}</a></span>`,
      },
    ],
    cta: { label: "Ativar minha conta", url: args.inviteUrl },
    reason:
      "Você recebeu porque um administrador criou uma conta com este e-mail. Se não esperava este convite, ignore a mensagem.",
  });
}

// ─── GMUD ─────────────────────────────────────────────────────────────────────

type GmudLike = {
  titulo: string;
  tipo: string;
  impacto: string;
  descricao?: string | null;
  data_inicio: string | null;
  data_fim: string | null;
  criado_por_nome?: string | null;
  criado_por_email?: string | null;
};

function gmudFacts(g: GmudLike, withDescricao: boolean): Fact[] {
  return [
    { label: "Tipo", value: g.tipo, html: emailChip(g.tipo, tipoTone(g.tipo)) },
    { label: "Impacto", value: g.impacto },
    { label: "Início", value: fmtDate(g.data_inicio) },
    { label: "Fim", value: fmtDate(g.data_fim) },
    { label: "Solicitante", value: g.criado_por_nome ?? g.criado_por_email ?? "—" },
    ...(withDescricao && g.descricao ? [{ label: "Descrição", value: g.descricao }] : []),
  ];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function buildGmudApprovedHtml(g: any, approveUrl: string): string {
  return renderEmail({
    module: "GMUD",
    tone: "ok",
    status: "Aprovada",
    title: g.titulo,
    intro:
      "Todas as etapas de aprovação foram concluídas. A mudança está liberada para a janela planejada.",
    preheader: `GMUD aprovada · início ${fmtDate(g.data_inicio)}`,
    blocks: [{ kind: "facts", items: gmudFacts(g, false) }],
    cta: { label: "Ver GMUD", url: approveUrl },
    reason: "Você recebeu porque é o solicitante desta GMUD.",
  });
}

export function buildGmudRejectedHtml(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  g: any,
  approveUrl: string,
  rejectedByName: string,
  motivo: string | null,
): string {
  return renderEmail({
    module: "GMUD",
    tone: "crit",
    status: "Rejeitada",
    title: g.titulo,
    intro: `${emailStrong(rejectedByName)} rejeitou a mudança. Ajuste o que foi pedido e envie de novo para aprovação.`,
    preheader: motivo ? `Motivo: ${motivo}` : `GMUD rejeitada por ${rejectedByName}`,
    blocks: [
      ...(motivo
        ? [
            {
              kind: "note" as const,
              tone: "crit" as const,
              title: "Motivo da rejeição",
              text: motivo,
            },
          ]
        : []),
      { kind: "facts", items: gmudFacts(g, false) },
    ],
    cta: { label: "Ajustar e reenviar", url: approveUrl },
    reason: "Você recebeu porque é o solicitante desta GMUD.",
  });
}

export function buildGmudApprovalRequestHtml(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  g: any,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  a: any,
  fromUser: string | null,
  approveUrl: string,
  opts?: { reminder?: boolean },
): string {
  const isReminder = !!opts?.reminder;
  const ordemAtual = a.etapa_atual ?? a.ordem ?? 1;
  const totalEtapas = a.total_etapas ?? a.total_aprovadores ?? "?";
  const quem = fromUser ?? g.criado_por_nome ?? g.criado_por_email ?? null;
  const saudacao = a.nome_aprovador
    ? `Olá, ${esc(String(a.nome_aprovador).split(/\s+/)[0])}. `
    : "";
  const intro = isReminder
    ? `${saudacao}Esta GMUD ainda aguarda sua decisão. A mudança só segue para a próxima etapa depois dela.`
    : `${saudacao}${quem ? `${emailStrong(quem)} pediu sua aprovação. ` : "Sua aprovação é necessária. "}A mudança só segue para a próxima etapa depois da sua decisão.`;
  return renderEmail({
    module: "GMUD",
    tone: isReminder ? "warn" : "info",
    status: `${isReminder ? "Lembrete · " : ""}Sua aprovação · etapa ${ordemAtual} de ${totalEtapas}`,
    title: g.titulo,
    intro,
    preheader: `${isReminder ? "Lembrete: aprovação pendente · " : ""}início ${fmtDate(g.data_inicio)} · impacto ${String(g.impacto ?? "").toLowerCase()}`,
    blocks: [{ kind: "facts", items: gmudFacts(g, true) }],
    cta: { label: "Analisar e decidir", url: approveUrl },
    reason: a.email_aprovador
      ? `Você recebeu porque é aprovador desta GMUD. Entre com ${a.email_aprovador} para aprovar ou rejeitar.`
      : "Você recebeu porque é aprovador desta GMUD.",
  });
}
