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
};

export type ValidationResult = {
  status: "valida" | "invalida" | "inconclusiva";
  detail: string;
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

  const extra = app.extra_fields && typeof app.extra_fields === "object" ? app.extra_fields : {};
  let reqInit: RequestInit;
  if (app.method === "http_json") {
    reqInit = {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
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
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
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
    const body = await res.text().catch(() => "");
    const ok = evaluateSuccess(app, res.status, body);
    return {
      status: ok ? "valida" : "invalida",
      detail: ok
        ? `Login aceito em ${app.host} (HTTP ${res.status}).`
        : `Login recusado em ${app.host} (HTTP ${res.status}).`,
    };
  } catch (e) {
    const msg = (e as Error).name === "AbortError" ? "tempo esgotado" : (e as Error).message;
    return { status: "inconclusiva", detail: `Não foi possível concluir a validação: ${msg}.` };
  } finally {
    clearTimeout(timer);
  }
}
