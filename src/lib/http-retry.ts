import { APP_NAME } from "@/lib/brand";

export async function fetchWithTimeout(
  url: string,
  ms = 20000,
  extraHeaders?: Record<string, string>,
): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, {
      signal: ctrl.signal,
      headers: { "User-Agent": `${APP_NAME.replace(/\s+/g, "-")}/1.0`, ...extraHeaders },
    });
  } finally {
    clearTimeout(t);
  }
}

export async function fetchWithRetry(
  url: string,
  ms = 20000,
  extraHeaders?: Record<string, string>,
  retries = 2,
): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      return await fetchWithTimeout(url, ms, extraHeaders);
    } catch (e: any) {
      if (i === retries) throw e;
      await new Promise((r) => setTimeout(r, 1000 * (i + 1)));
    }
  }
  throw new Error("fetchWithRetry esgotado");
}
