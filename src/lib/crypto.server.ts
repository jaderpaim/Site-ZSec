// Criptografia reversível (AES-256-GCM) para segredos que o servidor precisa
// decifrar de volta em texto puro (ex.: senha de domínio pro smbclient) --
// diferente de hash de senha de login (bcrypt/argon2, mão única, não dá pra
// "desfazer"). Usada só pra credencial SMB do Shadow IT por enquanto: é uma
// identidade de domínio real (AD), categoria de risco maior que os tokens
// escopados (Cloudflare/DAST scanner) que hoje ficam em texto plano em
// `integrations`, protegidos só por RLS -- decisão consciente de elevar essa
// aqui primeiro, sem mexer nas outras duas (que já estão em produção).
//
// Formato armazenado: "<iv_b64>:<authTag_b64>:<ciphertext_b64>".
import crypto from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_BYTES = 12; // tamanho recomendado do IV pra GCM

function getKey(): Buffer {
  const raw = process.env.INTEGRATIONS_ENCRYPTION_KEY;
  if (!raw) throw new Error("INTEGRATIONS_ENCRYPTION_KEY não configurada no ambiente do app.");
  const key = Buffer.from(raw, "base64");
  if (key.length !== 32) {
    throw new Error("INTEGRATIONS_ENCRYPTION_KEY inválida — precisa ser 32 bytes em base64 (ex.: `openssl rand -base64 32`).");
  }
  return key;
}

export function encryptSecret(plaintext: string): string {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv, authTag, ciphertext].map((b) => b.toString("base64")).join(":");
}

export function decryptSecret(encoded: string): string {
  const [ivB64, tagB64, ctB64] = encoded.split(":");
  if (!ivB64 || !tagB64 || !ctB64) throw new Error("Formato de segredo cifrado inválido.");
  const decipher = crypto.createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}

// Cifra separada, só pro transporte do callback scanner -> app (achados de
// scan ativo em dast-callback.ts) -- substitui o base64 que era usado antes.
// Motivo: WAF gerenciado (Cloudflare Managed Ruleset) normaliza/decodifica
// base64 automaticamente antes de casar assinatura -- um achado real de XSS
// reportado pelo scanner (ex.: ZAP/Nuclei capturando um <script> de PoC)
// disparava a regra "XSS, HTML Injection - Script Tag" mesmo em base64,
// travando o callback final (403) e deixando o scan preso em "running" pra
// sempre. Cifra de verdade não tem transformação conhecida pro WAF reverter
// -- a saída é ruído, sem assinatura pra casar. Chave deriva de HOOK_SECRET
// (SHA-256) -- já compartilhado entre scanner e app pra autenticar o
// callback, não precisa de segredo novo. Espelhado em main.py/encrypt_finding
// (pycryptodome, mesmo formato "iv:tag:ciphertext" em base64 cada parte).
function getCallbackKey(): Buffer {
  const secret = process.env.HOOK_SECRET;
  if (!secret) throw new Error("HOOK_SECRET não configurado no ambiente do app.");
  return crypto.createHash("sha256").update(secret, "utf8").digest();
}

export function decryptCallbackPayload(encoded: string): string {
  const [ivB64, tagB64, ctB64] = encoded.split(":");
  if (!ivB64 || !tagB64 || !ctB64) throw new Error("Formato de payload cifrado do callback inválido.");
  const decipher = crypto.createDecipheriv(ALGO, getCallbackKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(ctB64, "base64")),
    decipher.final(),
  ]);
  return plaintext.toString("utf8");
}
