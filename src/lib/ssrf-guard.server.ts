import { lookup as dnsLookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";

// hostname aqui deve ser só um nome de domínio (sem esquema/porta/caminho) que
// resolva para IP público. Bloqueia literais de IP e ranges privados/reservados
// (inclui 169.254.0.0/16, faixa do metadata endpoint de AWS/GCP/Azure).
function isValidHostnameFormat(host: string): boolean {
  if (host.length === 0 || host.length > 253) return false;
  if (/[^a-zA-Z0-9.-]/.test(host)) return false; // sem esquema, porta, userinfo, path
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) return false; // literal IPv4
  const labels = host.split(".");
  if (labels.length < 2) return false;
  return labels.every(
    (l) => l.length > 0 && l.length <= 63 && !l.startsWith("-") && !l.endsWith("-"),
  );
}

function isPrivateOrReservedIp(ip: string): boolean {
  const v4 = ip.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (v4) {
    const a = parseInt(v4[1], 10);
    const b = parseInt(v4[2], 10);
    if (a === 10 || a === 127 || a === 0 || a >= 224) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // link-local / metadata endpoint
    if (a === 100 && b >= 64 && b <= 127) return true; // shared address space (CGNAT)
    return false;
  }
  const lower = ip.toLowerCase();
  if (lower === "::1") return true;
  if (
    lower.startsWith("fe8") ||
    lower.startsWith("fe9") ||
    lower.startsWith("fea") ||
    lower.startsWith("feb")
  )
    return true; // fe80::/10
  if (lower.startsWith("fc") || lower.startsWith("fd")) return true; // fc00::/7
  if (lower.startsWith("::ffff:")) {
    const mapped = lower.slice("::ffff:".length);
    return /^\d+\.\d+\.\d+\.\d+$/.test(mapped) ? isPrivateOrReservedIp(mapped) : true;
  }
  return false;
}

// Conecta direto no IP já validado (em vez de deixar o HTTP client re-resolver o
// DNS) para fechar a janela de DNS rebinding entre a checagem e a requisição real.
// O servername/Host seguem sendo o hostname, então SNI e validação do certificado
// TLS continuam corretos.
function headRequestToIp(ip: string, hostname: string): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const req = httpsRequest(
      {
        host: ip,
        port: 443,
        method: "HEAD",
        path: "/",
        servername: hostname,
        headers: { Host: hostname },
        timeout: 5_000,
      },
      (res) => {
        resolve((res.headers.age as string | undefined) ?? null);
        res.resume();
      },
    );
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.on("error", reject);
    req.end();
  });
}

// Valida uma URL de destino antes de fazer POST nela (ex.: validação de
// credencial contra o endpoint de login de uma aplicação própria): exige https,
// host em formato de domínio (sem IP literal) e que resolva para IP público.
// Devolve a URL já parseada. Fecha a maior parte do vetor de SSRF; sobra uma
// janela pequena de DNS rebinding porque o fetch re-resolve o host — aceitável
// aqui, já que o endpoint é fixo e cadastrado por admin, não entrada por requisição.
export async function assertPublicHttpsUrl(rawUrl: string): Promise<URL> {
  let u: URL;
  try {
    u = new URL(rawUrl);
  } catch {
    throw new Error("URL de login inválida.");
  }
  if (u.protocol !== "https:") throw new Error("O endpoint de login precisa usar https.");
  if (!isValidHostnameFormat(u.hostname)) {
    throw new Error("Host do endpoint inválido (não use IP literal nem porta).");
  }
  const addresses = await dnsLookup(u.hostname, { all: true });
  if (addresses.length === 0 || addresses.some((a) => isPrivateOrReservedIp(a.address))) {
    throw new Error("O endpoint de login resolve para um IP privado ou reservado.");
  }
  return u;
}

export async function safeFetchAge(hostname: string): Promise<number | null> {
  if (!isValidHostnameFormat(hostname)) return null;
  try {
    const addresses = await dnsLookup(hostname, { all: true });
    if (addresses.length === 0 || addresses.some((a) => isPrivateOrReservedIp(a.address)))
      return null;

    const ageHeader = await headRequestToIp(addresses[0].address, hostname);
    return ageHeader !== null ? Number(ageHeader) : null;
  } catch {
    return null;
  }
}
