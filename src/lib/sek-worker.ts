// Endereço do worker do SEK -- o proxy /sek-worker do servidor de
// provisionamento DAST (scripts/dast-provisioning), atrás do Cloudflare
// Access. Vem de SEK_WORKER_URL, ex.: https://scanner.empresa.com.br/sek-worker
// Lido só no servidor e na hora da chamada (nunca no topo do módulo, que
// também é carregado no bundle do navegador).
export function sekWorkerUrl(path: string): string {
  const base = process.env.SEK_WORKER_URL?.trim().replace(/\/+$/, "");
  if (!base) throw new Error("SEK_WORKER_URL não configurado no servidor");
  return `${base}/${path.replace(/^\/+/, "")}`;
}
