// Endereço público desta instância (ex.: https://zsec.empresa.com.br), usado
// em links de e-mail, convites, callbacks de SSO e URLs que os crons chamam.
// Vem só de APP_URL. Lido no servidor e na hora da chamada (nunca no topo do
// módulo, que também pode ir para o bundle do navegador).

/** APP_URL sem barra no fim, ou null se não configurado. */
export function appUrlOrNull(): string | null {
  const raw = process.env.APP_URL?.trim();
  return raw ? raw.replace(/\/+$/, "") : null;
}

/** APP_URL sem barra no fim; erro claro se não configurado. */
export function appUrl(): string {
  const url = appUrlOrNull();
  if (!url) throw new Error("APP_URL não configurado no servidor (ex.: https://zsec.empresa.com.br)");
  return url;
}

/**
 * Endereço para o servidor chamar a SI MESMO (ex.: "Sincronizar agora" → hook).
 * Sair pela internet para voltar pelo túnel depende de DNS, Cloudflare e do
 * limite de 100 s da borda; em produção o container define INTERNAL_APP_URL
 * (Dockerfile). Sem ela -- como no `npm run dev` -- usa o APP_URL.
 */
export function internalAppUrl(): string {
  const raw = process.env.INTERNAL_APP_URL?.trim();
  return raw ? raw.replace(/\/+$/, "") : appUrl();
}
