// Casamento da URL de um vazamento com uma aplicação cadastrada (Threat Intel).
// Puro (sem servidor): usado pela tela, para dizer se há onde testar, e pelo
// servidor, para escolher a aplicação. Mesma regra do b-security-suite.
//
// url_match: um ou mais padrões (um por linha ou separados por "|"). Com "*" o
// padrão vira curinga (ex.: "*.empresa.com.br", "app.empresa.com.br/*/login");
// sem "*", é substring. O esquema (http/https) é ignorado dos dois lados. Sem
// url_match, vale o host da aplicação.

export type MatchableApp = {
  id?: string;
  host: string;
  url_match?: string | null;
  enabled: boolean;
};

const stripScheme = (s: string) => s.replace(/^\s*[a-z][a-z0-9+.-]*:\/\//i, "");

export function splitUrlPatterns(urlMatch: string | null | undefined): string[] {
  return (urlMatch ?? "")
    .split(/[\r\n|]+/)
    .map((p) => p.trim())
    .filter(Boolean);
}

export function urlMatchesPattern(leakUrl: string, pattern: string): boolean {
  const u = stripScheme(leakUrl.toLowerCase());
  const p = stripScheme(pattern.toLowerCase().trim());
  if (!p) return false;
  if (p.includes("*")) {
    const rx = p
      .split("*")
      .map((seg) => seg.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
      .join(".*");
    try {
      if (new RegExp(`^${rx}`).test(u)) return true;
    } catch {
      /* padrão inválido → tenta o fallback */
    }
    // "host/*" também casa o host sem caminho (credencial capturada sem path).
    if (p.endsWith("/*")) {
      const base = p.slice(0, -2);
      if (base && (u === base || u.startsWith(`${base}/`))) return true;
    }
    return false;
  }
  return u.includes(p);
}

export function appPatterns(app: MatchableApp): string[] {
  const pats = splitUrlPatterns(app.url_match);
  return pats.length ? pats : [app.host];
}

function hostOf(leakUrl: string | null | undefined, leakHost: string | null | undefined) {
  if (leakHost) return leakHost.trim().toLowerCase();
  try {
    const u = (leakUrl ?? "").trim();
    return new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(u) ? u : `https://${u}`).hostname.toLowerCase();
  } catch {
    return "";
  }
}

// URL do vazamento (ou só o host, quando a credencial não traz caminho). Sem
// url_match, compara o HOST exato (substring deixaria "evil.com/?r=host" casar).
export function matchApp<T extends MatchableApp>(
  leakUrl: string | null | undefined,
  leakHost: string | null | undefined,
  apps: T[],
): T | null {
  const alvo = (leakUrl || leakHost || "").trim();
  if (!alvo) return null;
  const host = hostOf(leakUrl, leakHost);
  return (
    apps.find((a) => {
      if (!a.enabled) return false;
      const pats = splitUrlPatterns(a.url_match);
      if (pats.length === 0) return !!host && host === a.host.trim().toLowerCase();
      return pats.some((p) => urlMatchesPattern(alvo, p));
    }) ?? null
  );
}
