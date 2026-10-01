// Módulo isomórfico (sem supabaseAdmin/service key) — allowlist única de campos
// filtráveis da aba Analytics, compartilhada entre servidor (cloudflare.functions.ts,
// tradução pra GraphQL/Supabase) e client (AnalyticsTab.tsx, popular o "+ Add filter").
// Nunca deriva nome de campo GraphQL/coluna a partir de texto livre do usuário —
// só os `key`s abaixo são aceitos; tudo mais é rejeitado com warning.
import { z } from "zod";

export type AnalyticsFilterOp = "eq" | "neq" | "in";

export type AnalyticsFilterCondition = {
  field: string;
  op: AnalyticsFilterOp;
  value: string | number | Array<string | number>;
};

export type FilterFieldDef = {
  key: string;
  label: string;
  valueType: "string" | "number";
  ops: AnalyticsFilterOp[];
  /** Nome do campo no dataset httpRequestsAdaptiveGroups/firewallEventsAdaptiveGroups (caminho "live"). */
  gqlField: string | null;
  /** Coluna equivalente em cloudflare_firewall_events (caminho "banco"). null = indisponível fora da janela live. */
  pgColumn: string | null;
};

export const filterConditionSchema = z.object({
  field: z.string().min(1).max(64),
  op: z.enum(["eq", "neq", "in"]),
  value: z.union([
    z.string().max(255),
    z.number(),
    z.array(z.union([z.string().max(255), z.number()])).min(1).max(20),
  ]),
});
export const filtersInputSchema = z.array(filterConditionSchema).max(10);

export const HTTP_TRAFFIC_FILTER_FIELDS: Record<string, FilterFieldDef> = {
  host: { key: "host", label: "Host", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "clientRequestHTTPHost", pgColumn: "host" },
  path: { key: "path", label: "Path", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "clientRequestPath", pgColumn: "path" },
  ip: { key: "ip", label: "IP", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "clientIP", pgColumn: "client_ip" },
  country: { key: "country", label: "País", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "clientCountryName", pgColumn: "country" },
  statusCodeEdge: { key: "statusCodeEdge", label: "Status (edge)", valueType: "number", ops: ["eq", "neq", "in"], gqlField: "edgeResponseStatus", pgColumn: null },
  statusCodeOrigin: { key: "statusCodeOrigin", label: "Status (origin)", valueType: "number", ops: ["eq", "neq", "in"], gqlField: "originResponseStatus", pgColumn: null },
  asn: { key: "asn", label: "ASN", valueType: "number", ops: ["eq", "neq", "in"], gqlField: "clientAsn", pgColumn: null },
  cacheStatus: { key: "cacheStatus", label: "Cache status", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "cacheStatus", pgColumn: null },
  deviceType: { key: "deviceType", label: "Device type", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "clientDeviceType", pgColumn: null },
  queryString: { key: "queryString", label: "Query string", valueType: "string", ops: ["eq", "neq"], gqlField: "clientRequestQuery", pgColumn: null },
  userAgent: { key: "userAgent", label: "User Agent", valueType: "string", ops: ["eq", "neq"], gqlField: "userAgent", pgColumn: "user_agent" },
  dataCenter: { key: "dataCenter", label: "Data center", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "coloCode", pgColumn: null },
  httpVersion: { key: "httpVersion", label: "HTTP version", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "clientRequestHTTPProtocol", pgColumn: null },
  xRequestedWith: { key: "xRequestedWith", label: "X-Requested-With", valueType: "string", ops: ["eq", "neq"], gqlField: "xRequestedWith", pgColumn: null },
};

// RUM (Web Analytics) não tem caminho "banco" — é sempre GraphQL ao vivo por
// conta, então todo pgColumn fica null. Campos do dataset rumPageloadEventsAdaptiveGroups.
export const RUM_VISITS_FILTER_FIELDS: Record<string, FilterFieldDef> = {
  country: { key: "country", label: "Country", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "countryName", pgColumn: null },
  host: { key: "host", label: "Host", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "requestHost", pgColumn: null },
  path: { key: "path", label: "Path", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "requestPath", pgColumn: null },
  referer: { key: "referer", label: "Referer", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "refererHost", pgColumn: null },
  deviceType: { key: "deviceType", label: "Device type", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "deviceType", pgColumn: null },
  browser: { key: "browser", label: "Browser", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "userAgentBrowser", pgColumn: null },
  os: { key: "os", label: "Operating system", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "userAgentOS", pgColumn: null },
};

export const SECURITY_FILTER_FIELDS: Record<string, FilterFieldDef> = {
  action: { key: "action", label: "Action", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "action", pgColumn: "action" },
  host: { key: "host", label: "Host", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "clientRequestHTTPHost", pgColumn: "host" },
  path: { key: "path", label: "Path", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "clientRequestPath", pgColumn: "path" },
  country: { key: "country", label: "País", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "clientCountryName", pgColumn: "country" },
  ip: { key: "ip", label: "IP", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "clientIP", pgColumn: "client_ip" },
  ruleId: { key: "ruleId", label: "Rule ID", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "ruleId", pgColumn: "rule_id" },
  userAgent: { key: "userAgent", label: "User Agent", valueType: "string", ops: ["eq", "neq"], gqlField: "userAgent", pgColumn: "user_agent" },
};

// Nova versão do Security (fiel ao dash nativo — confirmado via captura das
// queries reais: GetSecurityTopN, GetSecuritySampledLogs). Dataset é
// httpRequestsAdaptiveGroups/httpRequestsAdaptiveGroups (mesmo do HTTP Traffic,
// filtrado por requestSource:"eyeball"), não mais firewallEventsAdaptiveGroups —
// por isso pgColumn é sempre null (sem caminho "banco", só janela ao vivo).
export const SECURITY_ANALYTICS_FILTER_FIELDS: Record<string, FilterFieldDef> = {
  ip: { key: "ip", label: "Client IP", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "clientIP", pgColumn: null },
  originIp: { key: "originIp", label: "Origin IP", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "originIP", pgColumn: null },
  host: { key: "host", label: "Host", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "clientRequestHTTPHost", pgColumn: null },
  path: { key: "path", label: "Path", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "clientRequestPath", pgColumn: null },
  statusCodeEdge: { key: "statusCodeEdge", label: "Edge status code", valueType: "number", ops: ["eq", "neq", "in"], gqlField: "edgeResponseStatus", pgColumn: null },
  statusCodeOrigin: { key: "statusCodeOrigin", label: "Origin status code", valueType: "number", ops: ["eq", "neq", "in"], gqlField: "originResponseStatus", pgColumn: null },
  asn: { key: "asn", label: "Source ASN", valueType: "number", ops: ["eq", "neq", "in"], gqlField: "clientAsn", pgColumn: null },
  deviceType: { key: "deviceType", label: "Source device type", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "clientDeviceType", pgColumn: null },
  apiGatewayEndpoint: { key: "apiGatewayEndpoint", label: "Web asset endpoint", valueType: "string", ops: ["eq", "neq"], gqlField: "apiGatewayMatchedEndpoint", pgColumn: null },
  userAgent: { key: "userAgent", label: "Source user agent", valueType: "string", ops: ["eq", "neq"], gqlField: "userAgent", pgColumn: null },
  os: { key: "os", label: "Source operating system", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "userAgentOS", pgColumn: null },
  browser: { key: "browser", label: "Source browser", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "userAgentBrowser", pgColumn: null },
  queryString: { key: "queryString", label: "Query string", valueType: "string", ops: ["eq", "neq"], gqlField: "clientRequestQuery", pgColumn: null },
  cacheStatus: { key: "cacheStatus", label: "Cache status", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "cacheStatus", pgColumn: null },
  referer: { key: "referer", label: "Referer", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "clientRefererHost", pgColumn: null },
  method: { key: "method", label: "HTTP method", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "clientRequestHTTPMethodName", pgColumn: null },
  country: { key: "country", label: "Country", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "clientCountryName", pgColumn: null },
  xRequestedWith: { key: "xRequestedWith", label: "X-Requested-With", valueType: "string", ops: ["eq", "neq"], gqlField: "xRequestedWith", pgColumn: null },
  httpVersion: { key: "httpVersion", label: "HTTP version", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "clientRequestHTTPProtocol", pgColumn: null },
  dataCenter: { key: "dataCenter", label: "Data center", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "coloCode", pgColumn: null },
  securitySource: { key: "securitySource", label: "Security service", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "securitySource", pgColumn: null },
  securityAction: { key: "securityAction", label: "Security action", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "securityAction", pgColumn: null },
  sslProtocol: { key: "sslProtocol", label: "SSL Protocol", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "clientSSLProtocol", pgColumn: null },
};

// Aba Security · Events (dataset firewallEventsAdaptiveGroups/firewallEventsAdaptive,
// diferente do Security · Traffic que usa httpRequestsAdaptiveGroups) — campos
// restritos ao que já é usado nas queries confirmadas (GetFirewallAnalyticsTopNs,
// ActivityLogQuery), sem caminho "banco".
export const SECURITY_EVENTS_FILTER_FIELDS: Record<string, FilterFieldDef> = {
  ip: { key: "ip", label: "Client IP", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "clientIP", pgColumn: null },
  host: { key: "host", label: "Host", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "clientRequestHTTPHost", pgColumn: null },
  path: { key: "path", label: "Path", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "clientRequestPath", pgColumn: null },
  asn: { key: "asn", label: "Source ASN", valueType: "number", ops: ["eq", "neq", "in"], gqlField: "clientAsn", pgColumn: null },
  userAgent: { key: "userAgent", label: "User agent", valueType: "string", ops: ["eq", "neq"], gqlField: "userAgent", pgColumn: null },
  referer: { key: "referer", label: "Referer", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "clientRefererHost", pgColumn: null },
  method: { key: "method", label: "HTTP method", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "clientRequestHTTPMethodName", pgColumn: null },
  country: { key: "country", label: "Country", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "clientCountryName", pgColumn: null },
  ruleId: { key: "ruleId", label: "Rule", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "ruleId", pgColumn: null },
  action: { key: "action", label: "Action", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "action", pgColumn: null },
  source: { key: "source", label: "Service", valueType: "string", ops: ["eq", "neq", "in"], gqlField: "source", pgColumn: null },
};

export type FilterClauseResult = {
  fragment: string;
  declarations: string;
  variables: Record<string, unknown>;
  warnings: string[];
};

/**
 * Traduz condições validadas em fragmento de query GraphQL + declarações de
 * variável + valores. Nunca interpola valor do usuário na string da query —
 * só `def.gqlField` (fixo, vindo da allowlist) entra no texto; o valor sempre
 * vai por `variables`. Nomes de variável são sintéticos (nunca derivados do
 * campo escolhido pelo usuário) para evitar colisão/duplicação no documento.
 */
export function buildAdaptiveFilterClause(
  conditions: AnalyticsFilterCondition[],
  allowlist: Record<string, FilterFieldDef>,
  varPrefix: string,
): FilterClauseResult {
  const merged = new Map<string, { def: FilterFieldDef; op: AnalyticsFilterOp; values: Array<string | number> }>();
  const warnings: string[] = [];

  for (const c of conditions) {
    const def = allowlist[c.field];
    if (!def || !def.gqlField) {
      warnings.push(`Campo "${c.field}" não suportado nesta consulta.`);
      continue;
    }
    if (!def.ops.includes(c.op)) {
      warnings.push(`Operador "${c.op}" não suportado em "${def.label}".`);
      continue;
    }
    const raw = Array.isArray(c.value) ? c.value : [c.value];
    const coerced = raw.map((v) => (def.valueType === "number" ? Number(v) : String(v)));
    if (def.valueType === "number" && coerced.some((v) => Number.isNaN(v))) {
      warnings.push(`Valor inválido para "${def.label}".`);
      continue;
    }
    const mergeKey = `${def.gqlField}:${c.op}`;
    const existing = merged.get(mergeKey);
    if (existing) existing.values.push(...coerced);
    else merged.set(mergeKey, { def, op: c.op, values: coerced });
  }

  const parts: string[] = [];
  const decls: string[] = [];
  const variables: Record<string, unknown> = {};
  let i = 0;
  for (const { def, op, values } of merged.values()) {
    const varName = `${varPrefix}${i++}`;
    const isMulti = op === "in" || values.length > 1;
    const suffix = isMulti ? "_in" : op === "neq" ? "_neq" : "";
    const scalar = def.valueType === "number" ? "Int" : "String";
    parts.push(`${def.gqlField}${suffix}: $${varName}`);
    decls.push(`$${varName}: ${isMulti ? `[${scalar}!]` : scalar}`);
    variables[varName] = isMulti ? values : values[0];
  }

  return {
    fragment: parts.length ? `, ${parts.join(", ")}` : "",
    declarations: decls.length ? `, ${decls.join(", ")}` : "",
    variables,
    warnings,
  };
}

/**
 * Equivalente pro caminho banco (Supabase) — encadeia .eq/.neq/.in usando
 * def.pgColumn. Condições sobre campos com pgColumn null viram warning
 * ("indisponível fora da janela ao vivo") em vez de erro.
 */
export function applySupabaseFilterConditions<T extends { eq: Function; neq: Function; in: Function }>(
  query: T,
  conditions: AnalyticsFilterCondition[],
  allowlist: Record<string, FilterFieldDef>,
): { query: T; warnings: string[] } {
  let q: any = query;
  const warnings: string[] = [];
  for (const c of conditions) {
    const def = allowlist[c.field];
    if (!def) {
      warnings.push(`Campo "${c.field}" desconhecido.`);
      continue;
    }
    if (!def.pgColumn) {
      warnings.push(`Filtro por "${def.label}" indisponível fora da janela ao vivo (dado não sincronizado no banco).`);
      continue;
    }
    const raw = Array.isArray(c.value) ? c.value : [c.value];
    const coerced = def.valueType === "number" ? raw.map(Number) : raw.map(String);
    if (c.op === "eq" && coerced.length === 1) q = q.eq(def.pgColumn, coerced[0]);
    else if (c.op === "neq" && coerced.length === 1) q = q.neq(def.pgColumn, coerced[0]);
    else q = q.in(def.pgColumn, coerced);
  }
  return { query: q as T, warnings };
}
