import { X509Certificate } from "node:crypto";

export type ParsedCert = {
  domain_name: string;
  issuer: string;
  valid_from: string;
  valid_to: string;
  fingerprint_sha256: string;
  serial_number: string;
  subject_alt_names: string[];
};

// Quebra um DN em atributos. O runtime pode entregar o DN separado por quebra
// de linha ("O=GoDaddy.com, Inc.\nCN=...") ou por vírgula com escape
// ("O=GoDaddy.com\, Inc., CN=..."). O regex antigo parava na primeira vírgula
// e gravava o emissor como "GoDaddy.com\".
function dnAttr(dn: string, key: string): string | null {
  const parts = dn.includes("\n") ? dn.split("\n") : dn.split(/(?<!\\),\s*/);
  for (const p of parts) {
    const i = p.indexOf("=");
    if (i < 0) continue;
    if (p.slice(0, i).trim().toUpperCase() !== key) continue;
    const v = p
      .slice(i + 1)
      .replace(/\\(.)/g, "$1")
      .trim();
    if (v) return v;
  }
  return null;
}

export function parseCertificate(input: string): ParsedCert {
  const trimmed = input.trim();
  let cert: X509Certificate;
  if (trimmed.includes("-----BEGIN CERTIFICATE-----")) {
    cert = new X509Certificate(trimmed);
  } else {
    try {
      const buf = Buffer.from(trimmed.replace(/\s+/g, ""), "base64");
      cert = new X509Certificate(buf);
    } catch {
      throw new Error("Formato de certificado inválido. Envie um arquivo PEM (.crt/.pem/.cer).");
    }
  }

  const sans = (cert.subjectAltName || "")
    .split(/,\s*/)
    .map((s) => s.match(/^DNS:(.+)$/i)?.[1]?.trim().toLowerCase())
    .filter((s): s is string => !!s);

  const cn = dnAttr(cert.subject || "", "CN");
  let domain = cn?.replace(/^\*\./, "").toLowerCase() ?? "";
  if (!domain && sans[0]) domain = sans[0].replace(/^\*\./, "");
  if (!domain) throw new Error("Não foi possível extrair o domínio do certificado.");

  return {
    domain_name: domain,
    issuer: dnAttr(cert.issuer || "", "O") ?? dnAttr(cert.issuer || "", "CN") ?? "desconhecido",
    valid_from: new Date(cert.validFrom).toISOString().slice(0, 10),
    valid_to: new Date(cert.validTo).toISOString().slice(0, 10),
    fingerprint_sha256: cert.fingerprint256.toUpperCase(),
    serial_number: cert.serialNumber.toUpperCase(),
    subject_alt_names: sans,
  };
}
