// Server-only: teste de validade de credencial vazada contra APLICAÇÃO PRÓPRIA
// cadastrada (leakradar_apps). Modelo do b-security-suite (testAppLogin): UMA
// tentativa de login (sem força bruta), regra de sucesso configurável e
// diagnóstico do que não chegou ao login (endpoint errado, CSRF, WAF) como
// "inconclusiva" — nunca como "inválida". A senha chega por parâmetro, é usada só
// na requisição e nunca é gravada nem logada. NUNCA importar em código de cliente.
import { assertPublicHttpsUrl } from "@/lib/ssrf-guard.server";

export type LeakApp = {
  id?: string;
  name?: string;
  host: string;
  url_match?: string | null;
  login_url: string;
  method: "http_form" | "http_json" | "http_basic";
  username_field: string;
  password_field: string;
  extra_fields: Record<string, unknown> | null;
  success_type:
    | "status"
    | "redirect"
    | "body_contains"
    | "body_not_contains"
    | "json_field"
    | "header"
    | "cookie";
  success_value: string;
  // json_field: sucesso quando o campo == este valor (vazio = só presença).
  success_json_equals?: string | null;
  // Texto no corpo que força "inválida" (API que responde 200 mesmo em falha).
  failure_contains?: string | null;
  has_lockout?: boolean;
  enabled: boolean;
  // Página (GET) que emite os cookies de sessão/CSRF antes do POST (ex.:
  // XSRF-TOKEN). Vazio = usa a origem do login_url. Mesmo host, https.
  prime_url?: string | null;
  // 2º estágio opcional: depois do login aceito, UM GET nesta URL (template com
  // {id}, extraído do corpo do login) reusando os cookies da sessão, para saber
  // se o usuário tem ACESSO efetivo (perfil/autorização) e não só senha viva.
  post_login_url?: string | null;
  id_field?: string | null; // caminho JSON do id no login (ex.: objeto.id); vazio = auto
  access_failure_contains?: string | null; // texto no 2º response/redirect = SEM acesso
  access_success_contains?: string | null; // texto = COM acesso (vence o de falha)
};

export type ValidationStatus =
  | "valida"
  | "valida_sem_acesso"
  | "exposta"
  | "mitigada"
  | "invalida"
  | "inconclusiva";
export type ValidationSeverity = "critica" | "alta" | "baixa";

// Resultado de um teste (aplicação, diretório ou Entra): veredito, severidade,
// resumo legível e detalhes técnicos (nunca a senha nem o corpo enviado).
// Detalhes só com valores JSON simples (a resposta vai serializada para a tela).
export type OutcomeDetails = Record<string, string | number | boolean | null>;
export type ValidationOutcome = {
  status: ValidationStatus;
  severity: ValidationSeverity | null;
  summary: string;
  details: OutcomeDetails;
};

// IdPs e SaaS de terceiros: submeter senha de colaborador aqui é acesso a
// sistema que não é seu. Bloqueado no cadastro e na validação (defesa dupla).
// A validação dessas contas é pelo diretório (Entra/AD), não por este caminho.
const THIRD_PARTY_IDP = [
  "login.microsoftonline.com",
  "login.microsoft.com",
  "login.live.com",
  "login.windows.net",
  "sts.windows.net",
  "microsoftonline.com",
  "accounts.google.com",
  "google.com",
  "gmail.com",
  "github.com",
  "okta.com",
  "auth0.com",
  "onelogin.com",
  "pingidentity.com",
  "login.yahoo.com",
  "yahoo.com",
  "facebook.com",
  "linkedin.com",
  "apple.com",
  "appleid.apple.com",
  "amazon.com",
  "aws.amazon.com",
  "salesforce.com",
  "slack.com",
  "dropbox.com",
  "adobe.com",
  "twitter.com",
  "x.com",
  "instagram.com",
  "hotmail.com",
  "outlook.com",
];

export function isThirdPartyIdp(host: string): boolean {
  const h = host.trim().toLowerCase().replace(/\.$/, "");
  return THIRD_PARTY_IDP.some((d) => h === d || h.endsWith(`.${d}`));
}

// ── Sessão de navegador (cookies/CSRF) ──────────────────────────────────────
// WAF/CDN (Cloudflare) e frameworks como Laravel/Angular recusam (403/405/419)
// POST de login que não parece vir de um navegador ou que não traz o cookie e o
// token CSRF emitidos pela página. Replicamos o mínimo do que o navegador faz.
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";

type CookieJar = Map<string, string>;

function getSetCookies(res: Response): string[] {
  const multi = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.();
  if (Array.isArray(multi)) return multi;
  const single = res.headers.get("set-cookie");
  return single ? [single] : [];
}

function absorbCookies(jar: CookieJar, res: Response) {
  for (const sc of getSetCookies(res)) {
    const pair = sc.split(";")[0];
    const eq = pair.indexOf("=");
    if (eq <= 0) continue;
    jar.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
  }
}

function cookieHeaders(jar: CookieJar): Record<string, string> {
  const h: Record<string, string> = {};
  if (jar.size) h.Cookie = [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
  // Convenção Angular/Laravel: devolver o token do cookie no cabeçalho.
  for (const [k, v] of jar) {
    if (/xsrf-token/i.test(k)) {
      try {
        h["X-XSRF-TOKEN"] = decodeURIComponent(v);
      } catch {
        h["X-XSRF-TOKEN"] = v;
      }
    }
  }
  return h;
}

// GET que segue no máximo 3 redirects, e só dentro do mesmo host em https
// (cada salto passa de novo pelo assertPublicHttpsUrl). Fora disso para e
// devolve a última resposta — nunca leva a sessão para outro endereço.
async function sameHostGet(
  start: URL,
  jar: CookieJar,
  headers: Record<string, string>,
): Promise<{ res: Response; finalUrl: string } | null> {
  let url = start;
  for (let hop = 0; hop < 4; hop++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15_000);
    let res: Response;
    try {
      res = await fetch(url.toString(), {
        method: "GET",
        headers: { ...headers, ...cookieHeaders(jar) },
        redirect: "manual",
        signal: ctrl.signal,
      });
    } finally {
      clearTimeout(timer);
    }
    absorbCookies(jar, res);
    const loc = res.headers.get("location");
    if (res.status < 300 || res.status >= 400 || !loc) return { res, finalUrl: url.toString() };
    let next: URL;
    try {
      next = new URL(loc, url);
    } catch {
      return { res, finalUrl: url.toString() };
    }
    // Redirect para outro host: não segue, mas a URL de destino ainda serve de
    // sinal (ex.: /login?mensagem=Sem perfil).
    if (next.hostname !== start.hostname || next.protocol !== "https:")
      return { res, finalUrl: next.toString() };
    await res.body?.cancel().catch(() => {});
    url = await assertPublicHttpsUrl(next.toString());
  }
  return null;
}

function stripAccents(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

// Procura o sinal no corpo (cru, desescapado de \uXXXX e \/) ou na URL final,
// sem diferenciar acento/maiúscula.
function signalPresent(needle: string | null | undefined, body: string, finalUrl: string): boolean {
  const n = (needle ?? "").trim();
  if (!n) return false;
  const unescaped = body
    .replace(/\\u([0-9a-fA-F]{4})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16)))
    .replace(/\\\//g, "/");
  let url = finalUrl;
  try {
    url = decodeURIComponent(finalUrl);
  } catch {
    /* mantém cru */
  }
  const na = stripAccents(n);
  return [body, unescaped, url].some((t) => t.includes(n) || stripAccents(t).includes(na));
}

// Id do usuário no corpo do login: caminho explícito ou heurística ("id", ou
// token de id + sujeito: codigo_pessoa, idUsuario...). "codigo" sozinho não casa.
function extractId(body: string, idField?: string | null): string | null {
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return null;
  }
  if (!json || typeof json !== "object") return null;
  if (idField?.trim()) {
    let cur: unknown = json;
    for (const part of idField.trim().split(".")) {
      cur = cur && typeof cur === "object" ? (cur as Record<string, unknown>)[part] : undefined;
    }
    if (cur != null && typeof cur !== "object") return String(cur);
  }
  const ID = ["id", "codigo", "cod"];
  const SUBJ = ["pessoa", "usuario", "user", "aluno", "matricula", "cliente", "login", "conta"];
  const looksLikeId = (key: string) => {
    const k = key.toLowerCase().replace(/[_\-\s]/g, "");
    return k === "id" || (ID.some((t) => k.includes(t)) && SUBJ.some((t) => k.includes(t)));
  };
  const scan = (obj: unknown, depth: number): string | null => {
    if (!obj || typeof obj !== "object" || depth > 5) return null;
    for (const [k, v] of Object.entries(obj)) {
      if (v != null && typeof v !== "object" && looksLikeId(k)) return String(v);
    }
    for (const v of Object.values(obj)) {
      if (v && typeof v === "object") {
        const next = Array.isArray(v) ? v[0] : v;
        const r = scan(next, depth + 1);
        if (r) return r;
      }
    }
    return null;
  };
  return scan(json, 0);
}

// 2º estágio: UM GET na URL de perfil/landing com os cookies da sessão.
async function checkPostLoginAccess(
  app: LeakApp,
  loginBody: string,
  jar: CookieJar,
  manualId?: string | null,
): Promise<{ decided: boolean; noAccess?: boolean; reason: string }> {
  const tmpl = (app.post_login_url ?? "").trim();
  if (!tmpl) return { decided: false, reason: "sem URL de verificação de acesso" };
  let raw = tmpl;
  if (tmpl.includes("{id}")) {
    const id = manualId?.trim() || extractId(loginBody, app.id_field);
    if (!id)
      return {
        decided: false,
        reason: "não foi possível obter o id do usuário no login (informe o id manual)",
      };
    raw = tmpl.replace(/\{id\}/g, encodeURIComponent(id));
  }
  let url: URL;
  try {
    url = await assertPublicHttpsUrl(raw);
  } catch (e) {
    return { decided: false, reason: (e as Error).message };
  }
  try {
    const out = await sameHostGet(url, jar, {
      "User-Agent": BROWSER_UA,
      Accept: "application/json, text/html, */*",
      "X-Requested-With": "XMLHttpRequest",
      Referer: `${new URL(app.login_url).origin}/`,
    });
    if (!out) return { decided: false, reason: "redirecionamentos demais no 2º estágio" };
    const body = (await out.res.text().catch(() => "")).slice(0, 20_000);
    if (signalPresent(app.access_success_contains, body, out.finalUrl))
      return { decided: true, noAccess: false, reason: "acesso confirmado" };
    if (signalPresent(app.access_failure_contains, body, out.finalUrl))
      return { decided: true, noAccess: true, reason: "sem acesso efetivo (perfil/autorização)" };
    return { decided: false, reason: `2º estágio não conclusivo (HTTP ${out.res.status})` };
  } catch (e) {
    const msg = (e as Error).name === "AbortError" ? "tempo esgotado" : (e as Error).message;
    return { decided: false, reason: `falha no 2º estágio: ${msg}` };
  }
}

// Lê um campo JSON por caminho com ponto (ex.: "data.codigo").
function jsonPath(json: unknown, path: string): unknown {
  return path
    .split(".")
    .reduce<unknown>(
      (acc, k) => (acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined),
      json,
    );
}

// Erros de método/endpoint/content-type: o teste não chegou à lógica de login.
const ENDPOINT_ERRORS = new Set([400, 404, 405, 406, 415, 501, 502, 503]);

export async function testAppLogin(
  app: LeakApp,
  username: string,
  password: string,
  manualId?: string | null,
): Promise<ValidationOutcome> {
  const nome = app.name || app.host;
  const inconclusiva = (summary: string, details: OutcomeDetails = {}) =>
    ({ status: "inconclusiva", severity: null, summary, details }) as ValidationOutcome;

  if (!app.enabled) return inconclusiva("Aplicação desabilitada para teste.");
  if (isThirdPartyIdp(app.host))
    return inconclusiva(
      "Host é um provedor de identidade de terceiros — teste pelo diretório (Entra), não por aqui.",
    );

  let url: URL;
  try {
    url = await assertPublicHttpsUrl(app.login_url);
  } catch (e) {
    return inconclusiva((e as Error).message);
  }

  // Priming (best-effort, não é tentativa de login): UM GET na página que emite
  // cookies de sessão/CSRF, para reenviá-los no POST.
  const jar: CookieJar = new Map();
  try {
    const prime = await assertPublicHttpsUrl(app.prime_url?.trim() || `${url.origin}/`);
    if (prime.hostname === url.hostname) {
      const out = await sameHostGet(prime, jar, {
        "User-Agent": BROWSER_UA,
        Accept: "text/html,application/xhtml+xml,*/*",
      });
      await out?.res.body?.cancel().catch(() => {});
    }
  } catch {
    /* priming é best-effort */
  }

  const extra = app.extra_fields && typeof app.extra_fields === "object" ? app.extra_fields : {};
  const browser: Record<string, string> = {
    "User-Agent": BROWSER_UA,
    "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
    "X-Requested-With": "XMLHttpRequest",
    Origin: url.origin,
    Referer: app.prime_url?.trim() || url.toString(),
  };
  let reqInit: RequestInit;
  if (app.method === "http_basic") {
    reqInit = {
      method: "GET",
      headers: {
        ...browser,
        ...cookieHeaders(jar),
        Accept: "application/json, text/html, */*",
        Authorization: `Basic ${Buffer.from(`${username}:${password}`).toString("base64")}`,
      },
    };
  } else if (app.method === "http_json") {
    reqInit = {
      method: "POST",
      headers: {
        ...browser,
        ...cookieHeaders(jar),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        ...extra,
        [app.username_field]: username,
        [app.password_field]: password,
      }),
    };
  } else {
    const form = new URLSearchParams();
    for (const [k, v] of Object.entries(extra)) form.set(k, String(v));
    form.set(app.username_field, username);
    form.set(app.password_field, password);
    reqInit = {
      method: "POST",
      headers: {
        ...browser,
        ...cookieHeaders(jar),
        "Content-Type": "application/x-www-form-urlencoded",
        Accept: "application/json, text/html, */*",
      },
      body: form.toString(),
    };
  }

  // UMA tentativa, sem seguir redirect (um 302 pode ser o próprio sinal, e não
  // reenviamos a credencial para outro endereço).
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  let res: Response;
  try {
    res = await fetch(url.toString(), { ...reqInit, signal: ctrl.signal, redirect: "manual" });
  } catch (e) {
    const msg = (e as Error).name === "AbortError" ? "tempo esgotado" : (e as Error).message;
    return inconclusiva(`Não foi possível concluir o teste: ${msg}.`, { error: msg });
  } finally {
    clearTimeout(timer);
  }
  absorbCookies(jar, res);

  const status = res.status;
  const location = res.headers.get("location") ?? "";
  const allow = res.headers.get("allow") ?? "";
  const cfRay = res.headers.get("cf-ray") ?? "";
  const setCookies = getSetCookies(res);
  const text = (await res.text().catch(() => "")).slice(0, 20_000);
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    /* corpo não-JSON */
  }
  const bodyHas = (needle: string | null | undefined) => signalPresent(needle, text, "");

  // Regra de sucesso. json_field com o campo presente mas outro valor é
  // rejeição clara (ex.: codigo 401 num HTTP 200); campo ausente fica
  // inconclusiva (corpo fora do formato esperado).
  let success = false;
  let jsonFieldMismatch = false;
  const value = app.success_value.trim();
  switch (app.success_type) {
    case "redirect":
      success = status >= 300 && status < 400 && (!value || location.includes(value));
      break;
    case "body_contains":
      success = bodyHas(value);
      break;
    case "body_not_contains":
      success = status >= 200 && status < 300 && !bodyHas(value);
      break;
    case "header":
      success = !!value && [...res.headers.keys()].some((h) => h.toLowerCase() === value.toLowerCase());
      break;
    case "cookie":
      success = setCookies.length > 0 && (!value || setCookies.some((c) => c.includes(value)));
      break;
    case "json_field": {
      const actual = json ? jsonPath(json, value) : undefined;
      const equals = app.success_json_equals?.trim();
      if (equals) {
        success = actual !== undefined && String(actual) === equals;
        jsonFieldMismatch = actual !== undefined && !success;
      } else {
        success = actual != null && actual !== false && actual !== "";
      }
      break;
    }
    case "status":
    default: {
      const codes = value
        .split(/[\s,]+/)
        .map((n) => parseInt(n, 10))
        .filter((n) => Number.isFinite(n));
      success = (codes.length ? codes : [200]).includes(status);
    }
  }
  // Marcador de falha no corpo (ou campo JSON com valor de rejeição) nunca
  // deixa passar como válida — proteção contra API que responde 200 sempre.
  const explicitFail = bodyHas(app.failure_contains) || jsonFieldMismatch;
  if (explicitFail) success = false;

  let snippet = text;
  if (json !== null) {
    try {
      snippet = JSON.stringify(json, null, 2);
    } catch {
      /* mantém texto */
    }
  }
  const details: OutcomeDetails = {
    aplicacao: nome,
    status,
    location: location || null,
    allow: allow || null,
    server: res.headers.get("server") || null,
    cfRay: cfRay || null,
    regra: app.success_type,
    trecho: snippet ? snippet.slice(0, 600) : null,
  };

  if (success) {
    // 2º estágio opcional: a senha autentica, mas há acesso efetivo?
    if (app.post_login_url && (app.access_failure_contains || app.access_success_contains)) {
      const access = await checkPostLoginAccess(app, text, jar, manualId);
      details.acesso = access.reason;
      if (access.decided && access.noAccess)
        return {
          status: "valida_sem_acesso",
          severity: "alta",
          summary: `${nome} aceitou a credencial (senha válida), mas a pessoa NÃO tem acesso efetivo ao sistema (${access.reason}). A senha está viva — risco de reuso.`,
          details,
        };
      return {
        status: "valida",
        severity: "critica",
        summary: `${nome} aceitou a credencial em 1 tentativa (HTTP ${status})${
          access.decided ? " e a pessoa tem acesso ao sistema" : " (acesso efetivo não verificado)"
        }.`,
        details,
      };
    }
    return {
      status: "valida",
      severity: "critica",
      summary: `${nome} aceitou a credencial em 1 tentativa (HTTP ${status}).`,
      details,
    };
  }

  if (explicitFail)
    return {
      status: "invalida",
      severity: "baixa",
      summary: `${nome} rejeitou a credencial (a resposta indicou falha de autenticação).`,
      details,
    };

  // 419 = token/sessão CSRF inválido (Laravel): o priming não pegou os cookies
  // certos — normalmente a "URL da página de login" não é a que emite o token.
  if (status === 419)
    return inconclusiva(
      `${nome} recusou por CSRF (HTTP 419). Ajuste a "URL da página de login" para a página que carrega o formulário e emite o cookie XSRF-TOKEN.`,
      details,
    );

  if (ENDPOINT_ERRORS.has(status)) {
    const summary =
      status === 405 && allow && !/post/i.test(allow) && app.method !== "http_basic"
        ? `A URL cadastrada em ${nome} não é um endpoint de login: aceita só ${allow}. Use a "Request URL" exata da chamada de login (DevTools › Network › a requisição POST), não a página.`
        : `${nome} respondeu HTTP ${status} — o teste não chegou ao login.${
            allow ? ` O servidor aceita: ${allow}.` : ""
          }${
            cfRay
              ? " A resposta passou pela Cloudflare (se o endpoint estiver certo, pode ser bloqueio de bot/WAF)."
              : ""
          } Confira a URL do endpoint, o formato (JSON x formulário) e os nomes dos campos.`;
    return inconclusiva(summary, details);
  }

  if (status === 401 || status === 403)
    return {
      status: "invalida",
      severity: "baixa",
      summary: `${nome} rejeitou a credencial (HTTP ${status}).`,
      details,
    };

  // Respondeu sem casar a regra (ex.: 200 sempre): não dá pra afirmar nada.
  return inconclusiva(
    `Resposta de ${nome} (HTTP ${status}) não casou a regra de sucesso. Para APIs que respondem 200 mesmo em falha, use "corpo contém" com um marcador que só aparece no sucesso, ou preencha "texto que indica falha".`,
    details,
  );
}
