// Parser do corpo (description) dos chamados SEK/Zendesk -- extrai o alerta
// estruturado que o SEK formata dentro do texto (ofensa, cliente, TLP,
// categorização, vetor de ataque, indicadores técnicos agrupados,
// recomendações por fase de resposta a incidente). Construído a partir de
// uma amostra REAL de ticket (não é chute) -- ver handoff em memória do
// projeto. Ainda assim, best-effort: tickets que não seguem exatamente esse
// template (ex.: "BERNOULLI - SIEM - Relatório diário de device stopped")
// simplesmente não têm parsedAlert preenchido, o que é o comportamento
// correto (nem todo chamado é um alerta do QRadar).
//
// Cada extractBetween() é tolerante a espaços/quebras de linha variáveis --
// os rótulos em CAIXA ALTA seguidos de ":" são a âncora confiável, não a
// formatação ao redor deles.

export type SekParsedAlert = {
  cliente?: string;
  tlp?: string;
  alertaTitulo?: string;
  criadoEm?: string;
  detectadoEm?: string;
  reportadoEm?: string;
  descricao?: string;
  categorizacao?: string;
  vetorAtaque?: { nome?: string; descricao?: string };
  detectadoPor?: string;
  informacoesAdicionais?: Array<{ tipo: string; campos: Record<string, string> }>;
  mitigado?: { valor?: string; descricao?: string };
  recomendacoes?: Record<string, string[]>;
  indicadoresTecnicos?: Record<string, Record<string, string>>;
};

export type SekParseResult = {
  ofensaNumero: string | null;
  parsedAlert: SekParsedAlert | null;
};

const FASES_RECOMENDACAO = [
  "IDENTIFICATION",
  "CONTAINMENT",
  "ERADICATION",
  "RECOVERY",
  "HARDENING",
];

// Cabeçalhos de seção conhecidos, na ordem em que normalmente aparecem --
// mas a ordem aqui só documenta o padrão comum, não é assumida como regra.
// Cada extractSection() usa a lista INTEIRA (menos o próprio cabeçalho) como
// limite final, pegando o que aparecer primeiro -- em vez de uma seção
// fixa "esperada" como próxima. Isso importa porque nem todo alerta do SEK
// tem todas as seções (ex.: um alerta sem enriquecimento de IP/e-mail não
// tem "INFORMAÇÕES ADICIONAIS:" no texto) -- com uma âncora fixa, faltar
// uma seção no meio fazia a extração "vazar" até o fim do texto inteiro,
// engolindo as seções seguintes dentro da anterior (confirmado: aconteceu
// com "Detectado por" engolindo Mitigação/Recomendações/Indicadores
// Técnicos inteiros num ticket sem Informações Adicionais).
const H_DESCRICAO = /DESCRIÇÃO\s*:/i;
const H_DETALHES_ALERTA = /DETALHES DO ALERTA/i;
const H_CATEGORIZACAO = /CATEGORIZAÇÃO\s*:/i;
const H_VETOR_ATAQUE = /VETOR DE ATAQUE\s*:/i;
const H_DETECTADO_POR = /DETECTADO POR\s*:/i;
const H_INFO_ADICIONAIS = /INFORMAÇÕES ADICIONAIS\s*:/i;
const H_ESTADO_MITIGACAO = /ESTADO DE MITIGAÇÃO/i;
const H_MITIGADO = /MITIGADO\s*:/i;
const H_RECOMENDACOES = /RECOMENDAÇÕES\s*:/i;
const H_INDICADORES = /INDICADORES TÉCNICOS/i;
const H_FOOTER = /Security Operations Center/i;

const ALL_SECTION_HEADERS = [
  H_DESCRICAO,
  H_DETALHES_ALERTA,
  H_CATEGORIZACAO,
  H_VETOR_ATAQUE,
  H_DETECTADO_POR,
  H_INFO_ADICIONAIS,
  H_ESTADO_MITIGACAO,
  H_MITIGADO,
  H_RECOMENDACOES,
  H_INDICADORES,
  H_FOOTER,
];

function extractSection(text: string, header: RegExp): string | null {
  const startMatch = header.exec(text);
  if (!startMatch) return null;
  const from = startMatch.index + startMatch[0].length;
  let to = text.length;
  for (const other of ALL_SECTION_HEADERS) {
    if (other === header) continue;
    const m = other.exec(text.slice(from));
    if (m && from + m.index < to) to = from + m.index;
  }
  return text.slice(from, to).trim();
}

// Tolerante a duas formas confirmadas na prática: "Label: valor" na mesma
// linha, OU "Label" sozinho numa linha com o valor na linha seguinte (essa
// segunda forma é a mais comum no texto puro real -- a primeira versão só
// cobria a forma "mesma linha", baseada numa reconstrução visual que não
// batia com o texto puro de verdade).
//
// Descoberto depois, com dado real: alguns templates do SEK não têm
// NENHUMA quebra de linha nem espaço entre rótulo e valor -- ficam colados
// ("VerdictAudit Failure", "Src Ip10.1.2.10", "Event Id[4776]"). É o
// próprio Zendesk convertendo o e-mail HTML original pra texto puro de um
// jeito que, dependendo de como aquele alerta específico foi montado,
// perde o espaçamento entre elementos adjacentes. Meio-termo escolhido
// (Opção A -- sem chamada extra na API pra buscar o HTML original):
// detecta a "colagem" e insere quebra de linha ali. Letra->dígito e
// letra->colchete são seguros de forma genérica (nenhum valor real
// observado tem dígito/colchete grudado no meio de uma palavra). Já
// minúscula->maiúscula NÃO pode ser genérica -- valores legítimos de uma
// palavra só em CamelCase ("OneDrive", "FileRecycled") têm exatamente essa
// transição no meio, e separar ali corrompe um valor que já estava
// correto. Por isso essa transição só separa depois de um RÓTULO
// conhecido (lista fechada, mesma limitação de "melhor esforço" do resto
// do arquivo).
const ROTULOS_INDICADORES_CONHECIDOS = [
  "Verdict",
  "Action",
  "Platform",
  "Src Ip",
  "Dst Ip",
  "Username",
  "Event Id",
  "File Name",
  "File Extension",
  "Cloud Service",
  "Application Id",
  "Log Source",
  "Auth Type",
  "Cloud Event Source",
];

function parseKeyValueLines(block: string): Record<string, string> {
  const rotulos = [...ROTULOS_INDICADORES_CONHECIDOS].sort((a, b) => b.length - a.length);
  const rotuloColadoPattern = new RegExp(
    `\\b(${rotulos.map((r) => r.replace(/ /g, "\\s+")).join("|")})(?=[A-ZÀ-Ÿ])`,
    "g",
  );
  const unglued = block
    // rótulo conhecido colado direto num valor que começa com maiúscula
    // (ex.: "VerdictAudit Failure") -- só rótulos da lista, nunca genérico.
    .replace(rotuloColadoPattern, "$1\n")
    // rótulo colado direto num valor que começa com dígito ou colchete --
    // isso pode ser genérico (nenhum valor real tem dígito/colchete no
    // meio de uma palavra).
    .replace(/([a-zà-ÿ])([\d[])/g, "$1\n$2")
    // fim de um valor reconhecível (IP ou lista entre colchetes) grudado
    // no próximo rótulo só por espaço -- sem isso, "10.1.2.10 Dst Ip"
    // vira uma "linha" só e o valor engole o próximo rótulo inteiro.
    .replace(/(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\s+([A-ZÀ-Ÿ])/g, "$1\n$2")
    .replace(/(\])\s+([A-ZÀ-Ÿ])/g, "$1\n$2");
  const out: Record<string, string> = {};
  const lines = unglued
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);
  let i = 0;
  while (i < lines.length) {
    const sameLine = /^([A-Za-zÀ-ÿ ]{2,40}):\s*(.+)$/.exec(lines[i]);
    if (sameLine) {
      out[sameLine[1].trim()] = sameLine[2].trim();
      i++;
      continue;
    }
    const labelOnly = /^([A-Za-zÀ-ÿ ]{2,40}):?$/.exec(lines[i]);
    if (labelOnly && i + 1 < lines.length) {
      out[labelOnly[1].trim()] = lines[i + 1];
      i += 2;
      continue;
    }
    i++;
  }
  return out;
}

// Confirmado em dados reais: nem todo template de alerta do SEK escreve o
// nome do grupo em maiúsculas -- um tipo (ex.: alertas de brute force/AD)
// usa Title Case ("File", "Network", "Identity") em vez de caixa alta
// ("FILE", "NETWORK", "IDENTITY"), o que fazia a seção inteira de
// Indicadores Técnicos ficar vazia (nenhuma linha batia no detector só de
// maiúsculas). Lista de nomes conhecidos, atualizada conforme aparecem
// templates novos -- mesma limitação de "melhor esforço" do resto do
// arquivo, não cobre um grupo nunca visto em Title Case.
const GRUPOS_INDICADORES_CONHECIDOS = new Set([
  "FILE",
  "CLOUD",
  "ACTION",
  "DEVICE",
  "NETWORK",
  "IDENTITY",
  "WINDOWS AUDIT",
]);

// Mesmo problema de colagem do parseKeyValueLines, um nível acima: em
// alguns tickets a seção de Indicadores Técnicos inteira vem numa linha só
// (zero quebra de linha, só espaço) -- sem quebra nenhuma, o loop de
// grupos nunca via "ACTION"/"NETWORK" isolados numa linha própria, então a
// seção inteira ficava vazia mesmo com o texto presente. Insere quebra de
// linha antes de cada nome de grupo conhecido, restaurando a estrutura de
// linhas que o resto do parser espera -- não conflita com o campo "Action"
// dentro do próprio grupo ACTION porque isGrupoIndicadorHeader já ignora
// repetição do nome do grupo atual (ver grupoAtual).
function reinserirQuebrasDeGrupo(text: string): string {
  const nomes = [...GRUPOS_INDICADORES_CONHECIDOS].sort((a, b) => b.length - a.length);
  const pattern = new RegExp(
    `\\b(${nomes.map((g) => g.replace(/ /g, "\\s+")).join("|")})\\b`,
    "gi",
  );
  // Quebra ANTES e DEPOIS do nome do grupo -- só antes deixava o resto do
  // conteúdo da mesma "linha" original grudado nele (ex.: "Action
  // VerdictAudit Failure" virava uma linha só em vez de "Action" isolado).
  return text.replace(pattern, "\n$1\n");
}

/** Uma linha de grupo de indicadores é inteiramente maiúscula ("ACTION",
 * "WINDOWS AUDIT") OU um nome conhecido em Title Case ("Action", "File").
 * `grupoAtual` desambigua o caso real de conflito: o grupo "ACTION" tem um
 * CAMPO chamado "Action" dentro dele ("Action: FileRecycled") -- se a linha
 * só repete o nome do grupo que acabou de abrir, é rótulo de campo, não
 * uma seção nova. */
function isGrupoIndicadorHeader(line: string, grupoAtual: string | null): boolean {
  if (/^[A-ZÀ-Ÿ][A-ZÀ-Ÿ ]{1,39}$/.test(line)) return true;
  const upper = line.toUpperCase();
  if (upper === grupoAtual) return false;
  return GRUPOS_INDICADORES_CONHECIDOS.has(upper);
}

/** Extrai o nº da ofensa do padrão de assunto conhecido:
 * "[SEK - Security Alert Report] [Qradar] Bernoulli - <Low|Medium> - <nº>" */
export function extractOfensaNumero(subject: string): string | null {
  const m = /\[Qradar\].*?-\s*(?:low|medium|high|critical)\s*-\s*(\d+)\s*$/i.exec(subject.trim());
  return m ? m[1] : null;
}

/** Extrai a severidade real do alerta (Low/Medium/High/Critical) do mesmo
 * padrão de assunto -- é o nível de verdade que o QRadar atribuiu, diferente
 * do campo `priority` nativo do ticket no Zendesk (que na prática quase
 * ninguém preenche direito e fica quase todo "normal"). */
export function extractSeverityFromSubject(subject: string): string | null {
  const m = /\[Qradar\].*?-\s*(low|medium|high|critical)\s*-\s*\d+\s*$/i.exec(subject.trim());
  return m ? m[1].toLowerCase() : null;
}

export function parseSekAlert(
  subject: string,
  description: string | null | undefined,
): SekParseResult {
  const ofensaNumero = extractOfensaNumero(subject);
  if (!description || !/OFENSA/i.test(description)) {
    return { ofensaNumero, parsedAlert: null };
  }

  const text = description.replace(/\r\n/g, "\n");
  const alert: SekParsedAlert = {};

  const cliente = /CLIENTE\s*:?\s*\n?\s*([^\n]+)/i.exec(text);
  if (cliente) alert.cliente = cliente[1].trim();

  const tlp = /TLP\s*:?\s*\n?\s*([^\n]+)/i.exec(text);
  if (tlp) alert.tlp = tlp[1].trim();

  // Título do alerta: linha "SEK:<algo>" que segue o bloco OFENSA/CLIENTE/TLP.
  const titulo = /^(SEK:\S+.+)$/m.exec(text);
  if (titulo) alert.alertaTitulo = titulo[1].trim();

  const criado = /CRIADO\s*:?\s*\n?\s*([0-9/: ]+)/i.exec(text);
  if (criado) alert.criadoEm = criado[1].trim();
  const detectado = /DETECTADO\s*:?\s*\n?\s*([0-9/: ]+)/i.exec(text);
  if (detectado) alert.detectadoEm = detectado[1].trim();
  const reportado = /REPORTADO\s*:?\s*\n?\s*([0-9/: ]+)/i.exec(text);
  if (reportado) alert.reportadoEm = reportado[1].trim();

  const descricao = extractSection(text, H_DESCRICAO);
  if (descricao) alert.descricao = descricao;

  const categorizacao = extractSection(text, H_CATEGORIZACAO);
  if (categorizacao) alert.categorizacao = categorizacao;

  const vetor = extractSection(text, H_VETOR_ATAQUE);
  if (vetor) {
    const [nome, ...resto] = vetor.split("\n").filter(Boolean);
    alert.vetorAtaque = { nome: nome?.trim(), descricao: resto.join(" ").trim() || undefined };
  }

  const detectadoPor = extractSection(text, H_DETECTADO_POR);
  if (detectadoPor) alert.detectadoPor = detectadoPor;

  const infoAdicionaisBlock = extractSection(text, H_INFO_ADICIONAIS);
  if (infoAdicionaisBlock) {
    const tipos = infoAdicionaisBlock.split(/TYPE:\s*/i).slice(1);
    alert.informacoesAdicionais = tipos.map((bloco) => {
      const tipoMatch = /^([A-Za-zÀ-ÿ]+)/.exec(bloco);
      return { tipo: tipoMatch?.[1] ?? "desconhecido", campos: parseKeyValueLines(bloco) };
    });
  }

  const mitigado = extractSection(text, H_MITIGADO);
  if (mitigado) {
    const [valor, ...resto] = mitigado.split("\n").filter(Boolean);
    alert.mitigado = { valor: valor?.trim(), descricao: resto.join(" ").trim() || undefined };
  }

  const recomendacoesBlock = extractSection(text, H_RECOMENDACOES);
  if (recomendacoesBlock) {
    // Nem todo alerta tem as 5 fases (ex.: um alerta simples pode só ter
    // IDENTIFICATION) -- percorre linha a linha em vez de assumir presença/
    // ordem fixa das 5, mesma técnica usada nos grupos de indicadores.
    const recomendacoes: Record<string, string[]> = {};
    let faseAtual: string | null = null;
    let buffer: string[] = [];
    const flush = () => {
      if (faseAtual && buffer.length) {
        recomendacoes[faseAtual] = buffer
          .map((l) => l.replace(/^[•\-*]\s*/, "").trim())
          .filter(Boolean);
      }
    };
    for (const rawLine of recomendacoesBlock.split("\n")) {
      const line = rawLine.trim();
      if (!line) continue;
      if (FASES_RECOMENDACAO.includes(line.toUpperCase())) {
        flush();
        faseAtual = line.toUpperCase();
        buffer = [];
      } else {
        buffer.push(line);
      }
    }
    flush();
    if (Object.keys(recomendacoes).length) alert.recomendacoes = recomendacoes;
  }

  const indicadoresBlock = extractSection(text, H_INDICADORES);
  if (indicadoresBlock) {
    const tentarExtrairIndicadores = (
      blocoTexto: string,
    ): Record<string, Record<string, string>> => {
      const indicadores: Record<string, Record<string, string>> = {};
      let grupoAtual: string | null = null;
      let buffer: string[] = [];
      const flush = () => {
        if (grupoAtual) {
          const campos = parseKeyValueLines(buffer.join("\n"));
          if (Object.keys(campos).length) indicadores[grupoAtual] = campos;
        }
      };
      for (const rawLine of blocoTexto.split("\n")) {
        const line = rawLine.trim();
        if (!line) continue;
        if (isGrupoIndicadorHeader(line, grupoAtual)) {
          flush();
          // Normaliza pra maiúsculo -- a mesma seção pode ter grupos vindo
          // em caixa alta e Title Case dependendo do template, e a chave
          // no resultado final deve ficar consistente independente da
          // fonte.
          grupoAtual = line.toUpperCase();
          buffer = [];
        } else {
          buffer.push(line);
        }
      }
      flush();
      return indicadores;
    };

    let indicadores = tentarExtrairIndicadores(indicadoresBlock);
    // Fallback só quando o texto já bem formatado (com quebra de linha de
    // verdade) não rendeu grupo nenhum -- sinal de que a seção inteira
    // veio numa linha só. reinserirQuebrasDeGrupo é agressivo (reconhece
    // "File" mesmo dentro de "File Name"/"File Extension") e corrompe
    // texto que já estava certo, por isso só entra aqui como último
    // recurso, nunca como caminho padrão.
    if (Object.keys(indicadores).length === 0) {
      indicadores = tentarExtrairIndicadores(reinserirQuebrasDeGrupo(indicadoresBlock));
    }
    if (Object.keys(indicadores).length) alert.indicadoresTecnicos = indicadores;
  }

  return { ofensaNumero, parsedAlert: alert };
}
