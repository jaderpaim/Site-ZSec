// A GraphQL da Cloudflare recusa campos/datasets fora do plano da zona com
// "does not have access to the field 'x'" ou "... to the path" (ex.: no plano
// Free não há firewallEventsAdaptiveGroups, wafAttackScore, botScore,
// clientAsn, clientRequestQuery, clientRefererHost, xRequestedWith). Um único
// campo recusado derruba a consulta inteira, então aqui:
//   - a mensagem vira o motivo real (não é erro de permissão do token);
//   - cfGraphql refaz a consulta UMA vez sem os trechos recusados, para cada
//     cliente ver tudo o que o plano dele permite.

const GQL_URL = "https://api.cloudflare.com/client/v4/graphql";
const PLAN_RESTRICTION_RE = /does not have access to the (path|field)/i;
const BLOCKED_FIELD_RE = /does not have access to the field '([A-Za-z0-9_]+)'/gi;
// Datasets inteiros que planos menores não têm (o erro de "path" não diz o nome).
const PATH_BLOCKED_DATASETS = ["firewallEventsAdaptiveGroups"];

export const PLAN_RESTRICTION_MESSAGE =
  "Recurso indisponível no plano atual da zona na Cloudflare (requer plano pago: Pro, Business ou Enterprise).";

export function isPlanRestriction(message: string): boolean {
  return PLAN_RESTRICTION_RE.test(message);
}

export function planFriendlyError(message: string): string {
  return isPlanRestriction(message) ? PLAN_RESTRICTION_MESSAGE : message;
}

function mentions(text: string, field: string): boolean {
  // Casa "clientAsn" e "clientAsn_neq", mas não "clientASNDescription".
  return new RegExp(`(^|[^A-Za-z0-9])${field}(?![A-Za-z0-9])`, "i").test(text);
}

function closing(s: string, from: number, open: string, close: string): number {
  let depth = 0;
  for (let i = from; i < s.length; i++) {
    if (s[i] === open) depth++;
    else if (s[i] === close && --depth === 0) return i;
  }
  return -1;
}

/** Remove os blocos `alias: dataset(...) { ... }` para os quais `drop` diz sim. */
function removeAliasBlocks(query: string, drop: (block: string, dataset: string) => boolean): string {
  const re = /\n[ \t]*[A-Za-z_][A-Za-z0-9_]*\s*:\s*([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  let out = "";
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(query))) {
    const argsEnd = closing(query, m.index + m[0].length - 1, "(", ")");
    const bodyStart = argsEnd < 0 ? -1 : query.indexOf("{", argsEnd);
    const bodyEnd = bodyStart < 0 ? -1 : closing(query, bodyStart, "{", "}");
    if (bodyEnd < 0) continue;
    const block = query.slice(m.index, bodyEnd + 1);
    if (drop(block, m[1])) {
      out += query.slice(last, m.index);
      last = bodyEnd + 1;
    }
    re.lastIndex = bodyEnd + 1;
  }
  return out + query.slice(last);
}

/** Consulta sem os trechos recusados pelo plano, ou null se não há o que tirar. */
export function stripPlanBlocked(query: string, rawErrors: string[]): string | null {
  const fields = [
    ...new Set(rawErrors.flatMap((e) => [...e.matchAll(BLOCKED_FIELD_RE)].map((m) => m[1].toLowerCase()))),
  ];
  const pathBlocked = rawErrors.some((e) => /does not have access to the path/i.test(e));
  if (!fields.length && !pathBlocked) return null;

  // 1) campos listados sozinhos numa linha de seleção (ex.: logs de amostra)
  let q = query
    .split("\n")
    .filter((line) => !fields.includes(line.trim().toLowerCase()))
    .join("\n");
  // 2) aliases que dependem de campo/dataset recusado
  q = removeAliasBlocks(
    q,
    (block, dataset) =>
      fields.some((f) => mentions(block, f)) || (pathBlocked && PATH_BLOCKED_DATASETS.includes(dataset)),
  );
  return q === query ? null : q;
}

export type CfGraphqlResult = {
  ok: boolean;
  status: number;
  json: any;
  /** Preenchido quando parte da consulta foi omitida por limite de plano. */
  planNote: string | null;
};

// A Cloudflare revela UM trecho recusado por resposta. Guardamos, por zona, as
// recusas já vistas para as próximas consultas saírem sem eles numa tentativa
// só (sem isso cada tela custaria várias chamadas e consumiria o rate limit).
const MAX_PLAN_RETRIES = 8;
// Expira para um upgrade de plano liberar os campos sem reiniciar o servidor.
const BLOCKED_TTL_MS = 6 * 60 * 60 * 1000;
const blockedByZone = new Map<string, { errors: string[]; at: number }>();

function knownBlocked(key: string | null): string[] {
  if (!key) return [];
  const entry = blockedByZone.get(key);
  if (!entry) return [];
  if (Date.now() - entry.at > BLOCKED_TTL_MS) {
    blockedByZone.delete(key);
    return [];
  }
  return entry.errors;
}

function zoneKey(variables: Record<string, any>): string | null {
  const z = variables.zone ?? variables.zoneTag ?? variables.zoneId;
  return typeof z === "string" ? z : null;
}

/**
 * POST na GraphQL da Cloudflare. Se o plano da zona recusar partes da
 * consulta, refaz sem esses trechos (até MAX_PLAN_RETRIES); as mensagens de
 * plano saem traduzidas.
 */
export async function cfGraphql(
  apiToken: string,
  query: string,
  variables: Record<string, any>,
): Promise<CfGraphqlResult> {
  const post = async (q: string) => {
    const res = await fetch(GQL_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiToken}` },
      body: JSON.stringify({ query: q, variables }),
    });
    const json: any = await res.json().catch(() => ({}));
    return { res, json };
  };

  const key = zoneKey(variables);
  const known = knownBlocked(key);
  let q = (known.length && stripPlanBlocked(query, known)) || query;
  let omitted = q !== query;

  let { res, json } = await post(q);
  for (let attempt = 0; attempt < MAX_PLAN_RETRIES; attempt++) {
    const raw: string[] = (json.errors ?? []).map((e: any) => String(e.message ?? ""));
    const planErrors = raw.filter(isPlanRestriction);
    if (!planErrors.length) break;
    const next = stripPlanBlocked(q, planErrors);
    if (!next) break;
    if (key) {
      const prev = blockedByZone.get(key);
      blockedByZone.set(key, { errors: [...new Set([...(prev?.errors ?? []), ...planErrors])], at: prev?.at ?? Date.now() });
    }
    q = next;
    omitted = true;
    ({ res, json } = await post(q));
  }

  if (Array.isArray(json.errors)) {
    json.errors = json.errors.map((e: any) => ({ ...e, message: planFriendlyError(String(e.message ?? "")) }));
  }
  const planNote = omitted ? "Parte dos dados não está disponível no plano atual da zona na Cloudflare." : null;
  return { ok: res.ok, status: res.status, json, planNote };
}
