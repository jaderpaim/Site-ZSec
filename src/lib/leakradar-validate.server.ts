// Server-only: validação de legitimidade de credencial vazada.
//
// Submete usuário+senha ao endpoint de login de uma APLICAÇÃO PRÓPRIA cadastrada
// (leakradar_apps), nunca à URL de terceiro onde a credencial foi capturada. A
// senha chega aqui por parâmetro (vinda do LeakRadar, em memória), é usada só na
// requisição e nunca é gravada nem logada. NUNCA importar em código de cliente.
import { assertPublicHttpsUrl } from "@/lib/ssrf-guard.server";

export type LeakApp = {
  host: string;
  login_url: string;
  method: "http_form" | "http_json";
  username_field: string;
  password_field: string;
  extra_fields: Record<string, unknown> | null;
  success_type: "status" | "body_contains" | "body_not_contains" | "json_field";
  success_value: string;
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

export type ValidationResult = {
  status: "valida" | "invalida" | "inconclusiva";
  detail: string;
  // Só quando o login foi aceito e o 2º estágio decidiu: "sem_acesso" = senha
  // viva mas o usuário não entra no sistema (risco menor que acesso completo).
  access?: "confirmado" | "sem_acesso" | null;
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

function evaluateSuccess(app: LeakApp, statusCode: number, body: string): boolean {
  switch (app.success_type) {
    case "status": {
      const codes = app.success_value
        .split(/[\s,]+/)
        .map((s) => parseInt(s, 10))
        .filter((n) => Number.isFinite(n));
      return codes.includes(statusCode);
    }
    case "body_contains":
      return body.includes(app.success_value);
    case "body_not_contains":
      return !body.includes(app.success_value);
    case "json_field": {
      try {
        const json = JSON.parse(body) as Record<string, unknown>;
        const val = app.success_value
          .split(".")
          .reduce<unknown>(
            (acc, k) =>
              acc && typeof acc === "object" ? (acc as Record<string, unknown>)[k] : undefined,
            json,
          );
        return val != null && val !== false && val !== "";
      } catch {
        return false;
      }
    }
    default:
      return false;
  }
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
): Promise<{ decided: boolean; noAccess?: boolean; reason: string }> {
  const tmpl = (app.post_login_url ?? "").trim();
  if (!tmpl) return { decided: false, reason: "sem URL de verificação de acesso" };
  let raw = tmpl;
  if (tmpl.includes("{id}")) {
    const id = extractId(loginBody, app.id_field);
    if (!id) return { decided: false, reason: "não foi possível obter o id do usuário no login" };
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

export async function validateCredentialAgainstApp(
  app: LeakApp,
  username: string,
  password: string,
): Promise<ValidationResult> {
  if (!app.enabled)
    return { status: "inconclusiva", detail: "Aplicação desabilitada para validação." };
  if (isThirdPartyIdp(app.host)) {
    return {
      status: "inconclusiva",
      detail:
        "Host é um provedor de identidade de terceiros — valide pelo diretório (Entra/AD), não por aqui.",
    };
  }

  let url: URL;
  try {
    url = await assertPublicHttpsUrl(app.login_url);
  } catch (e) {
    return { status: "inconclusiva", detail: (e as Error).message };
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
  if (app.method === "http_json") {
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

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000);
  try {
    // redirect manual: um 302 pode ser justamente o sinal de sucesso/falha, e
    // não queremos reenviar a credencial seguindo o redirect.
    const res = await fetch(url.toString(), {
      ...reqInit,
      signal: ctrl.signal,
      redirect: "manual",
    });
    absorbCookies(jar, res);
    const body = await res.text().catch(() => "");
    const ok = evaluateSuccess(app, res.status, body);
    if (!ok) {
      // 419 = CSRF (Laravel): quase sempre falta a página certa no priming.
      if (res.status === 419)
        return {
          status: "inconclusiva",
          detail: `${app.host} recusou por CSRF (HTTP 419). Ajuste a "URL da página de login" para a página que carrega o formulário e emite o cookie XSRF-TOKEN.`,
        };
      return { status: "invalida", detail: `Login recusado em ${app.host} (HTTP ${res.status}).` };
    }
    // Login aceito: 2º estágio opcional (acesso efetivo).
    const access = await checkPostLoginAccess(app, body, jar);
    if (access.decided && access.noAccess)
      return {
        status: "valida",
        access: "sem_acesso",
        detail: `Senha válida em ${app.host} (HTTP ${res.status}), mas sem acesso efetivo ao sistema: ${access.reason}.`,
      };
    return {
      status: "valida",
      access: access.decided ? "confirmado" : null,
      detail:
        `Login aceito em ${app.host} (HTTP ${res.status}).` +
        (app.post_login_url ? ` Acesso: ${access.reason}.` : ""),
    };
  } catch (e) {
    const msg = (e as Error).name === "AbortError" ? "tempo esgotado" : (e as Error).message;
    return { status: "inconclusiva", detail: `Não foi possível concluir a validação: ${msg}.` };
  } finally {
    clearTimeout(timer);
  }
}
