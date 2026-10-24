/**
 * Caminho de hook dos cron jobs (cron_job_runs.hook_path). O pg_cron e o "Executar
 * agora" mandam o HOOK_SECRET para `${APP_URL}${hookPath}`; sem esta checagem um
 * hookPath como "@outro-host/x" ou ".outro-host/x" mudava o host da URL e o segredo
 * ia para fora.
 */
export const HOOK_PATH_RE = /^\/api\/public\/hooks\/[a-z0-9-]+$/;

export function isValidHookPath(hookPath: string): boolean {
  return HOOK_PATH_RE.test(hookPath);
}

/** Monta a URL do hook e garante que ela continua na origem de `baseUrl`. */
export function buildHookUrl(baseUrl: string, hookPath: string): string {
  if (!isValidHookPath(hookPath)) {
    throw new Error(`Caminho de hook inválido: ${hookPath}`);
  }
  const url = `${baseUrl}${hookPath}`;
  if (new URL(url).origin !== new URL(baseUrl).origin) {
    throw new Error("Caminho de hook fora da origem da aplicação");
  }
  return url;
}
