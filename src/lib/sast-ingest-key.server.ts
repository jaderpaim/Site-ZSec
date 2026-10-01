// Server-only: chave de ingestão da ingestão direta do SAST (caminho 2,
// decidido com o usuário em 2026-09-29). A pipeline envia essa chave no header
// Authorization; ela SÓ serve pra enviar relatório pro b-security -- não dá
// acesso a nada no Azure DevOps nem aqui (mesmo nível da Instrumentation Key
// do App Insights). Sozinha também não basta pra forjar dado: todo envio é
// conferido contra uma build real em execução (sast-ingest.server.ts).
//
// Guardada só como hash SHA-256 numa linha própria de `integrations`
// (provider azure_devops_sast_keys), que o card de Integração NUNCA regrava --
// só estas funções. Até 2 chaves válidas ao mesmo tempo (atual + anterior),
// pra trocar no template sem nenhuma build falhar no meio da rotação.
import crypto from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const adminDb = supabaseAdmin as unknown as { from: (t: string) => any };

export const SAST_KEYS_PROVIDER = "azure_devops_sast_keys";
const KEY_PREFIX = "bsast_";

export type StoredIngestKey = {
  hash: string; // sha256 hex da chave inteira
  hint: string; // primeiros caracteres, só pra identificar qual chave está no template
  created_at: string;
  created_by: string | null;
};

export function hashIngestKey(key: string): string {
  return crypto.createHash("sha256").update(key, "utf8").digest("hex");
}

export async function getStoredIngestKeys(): Promise<StoredIngestKey[]> {
  const { data } = await adminDb
    .from("integrations")
    .select("config")
    .eq("provider", SAST_KEYS_PROVIDER)
    .maybeSingle();
  const keys = (data?.config as { keys?: StoredIngestKey[] } | null)?.keys;
  return Array.isArray(keys)
    ? keys.filter((k) => typeof k?.hash === "string" && k.hash.length === 64)
    : [];
}

// Comparação em tempo constante contra cada hash guardado.
export function matchesIngestKey(presented: string, stored: StoredIngestKey[]): boolean {
  if (!presented.startsWith(KEY_PREFIX)) return false;
  const h = Buffer.from(hashIngestKey(presented), "hex");
  let ok = false;
  for (const k of stored) {
    const s = Buffer.from(k.hash, "hex");
    if (s.length === h.length && crypto.timingSafeEqual(s, h)) ok = true;
  }
  return ok;
}

async function saveKeys(keys: StoredIngestKey[]): Promise<void> {
  const { data: existing } = await adminDb
    .from("integrations")
    .select("id")
    .eq("provider", SAST_KEYS_PROVIDER)
    .maybeSingle();
  const row = {
    provider: SAST_KEYS_PROVIDER,
    name: "SAST ingest keys",
    enabled: true,
    config: { keys },
  };
  const { error } = existing?.id
    ? await adminDb.from("integrations").update(row).eq("id", existing.id)
    : await adminDb.from("integrations").insert(row);
  if (error) throw new Error(error.message);
}

// Gera uma chave nova (devolvida em texto UMA vez) e mantém a atual como
// "anterior", ainda válida, até alguém revogar.
export async function rotateIngestKey(userId: string): Promise<{ key: string; hint: string }> {
  const key = KEY_PREFIX + crypto.randomBytes(32).toString("base64url");
  const hint = key.slice(0, KEY_PREFIX.length + 6);
  const current = await getStoredIngestKeys();
  const next: StoredIngestKey = {
    hash: hashIngestKey(key),
    hint,
    created_at: new Date().toISOString(),
    created_by: userId,
  };
  await saveKeys([next, ...current].slice(0, 2));
  return { key, hint };
}

export async function revokePreviousIngestKey(): Promise<boolean> {
  const current = await getStoredIngestKeys();
  if (current.length < 2) return false;
  await saveKeys(current.slice(0, 1));
  return true;
}
