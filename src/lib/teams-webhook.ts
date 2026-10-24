/**
 * Webhook do Teams (Incoming Webhook antigo ou Workflows/Power Automate).
 *
 * A URL é gravada por quem administra o módulo disponibilidade e recebe os alertas
 * de vários módulos (SAST, Cloudflare, Sophos, SSL, CMDB). Antes aceitava qualquer
 * URL, então o servidor podia ser usado para fazer POST em endereços internos
 * (SSRF) ou desviar esses alertas para fora. Só hosts da Microsoft, via https.
 */
const ALLOWED_HOST_SUFFIXES = [".webhook.office.com", ".logic.azure.com", ".powerplatform.com"];
const ALLOWED_HOSTS = ["outlook.office.com"];

export const TEAMS_WEBHOOK_URL_HINT =
  "Use a URL do webhook do Teams ou do Power Automate (https://…webhook.office.com, …logic.azure.com ou …powerplatform.com).";

export function isAllowedTeamsWebhookUrl(raw: string | null | undefined): boolean {
  if (!raw) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port !== "" || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return ALLOWED_HOSTS.includes(host) || ALLOWED_HOST_SUFFIXES.some((s) => host.endsWith(s));
}

/**
 * POST no webhook do Teams. Rejeita (Promise rejeitada, como uma falha de rede)
 * URL fora da lista e não segue redirects, para um host permitido não poder
 * redirecionar o envio para outro lugar.
 */
export async function postTeamsWebhook(url: string, init: RequestInit): Promise<Response> {
  if (!isAllowedTeamsWebhookUrl(url)) {
    throw new Error("URL do webhook do Teams não permitida");
  }
  return fetch(url, { ...init, redirect: "error" });
}
