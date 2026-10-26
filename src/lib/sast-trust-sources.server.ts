// Server-only: fontes confiáveis da ingestão SAST (fase 6.1, etapa A).
//
// Uma fonte = provedor + dono (organização/usuário no Gitea/GitHub, projeto no
// Azure DevOps) + filtro de repositórios. Cada fonte tem a própria chave bsast_
// (até 2 válidas, para rotação sem quebrar build). A chave identifica a FONTE; o
// escopo do envio (dono/repositório) vem sempre da API do CI, e só é aceito se
// cair dentro da fonte dona da chave. Repositório novo numa organização já
// cadastrada entra sozinho, sem chave nova.
//
// Gitea ainda não emite token OIDC padronizado para Actions (go-gitea/gitea#33681),
// então ali o isolamento é por fonte (organização). O GitHub (etapa B) prova o
// repositório exato via OIDC.
import crypto from "node:crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hashIngestKey, type StoredIngestKey } from "@/lib/sast-ingest-key.server";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- tabela fora dos tipos gerados
const adminDb = supabaseAdmin as unknown as { from: (t: string) => any };
const KEY_PREFIX = "bsast_";

export type TrustProvider = "gitea" | "github" | "azure_devops";

export type TrustSource = {
  id: string;
  provider: TrustProvider;
  owner: string;
  repo_pattern: string;
  department_id: string | null;
  label: string | null;
  enabled: boolean;
  keys: StoredIngestKey[];
  created_at: string;
  updated_at: string;
};

function cleanKeys(raw: unknown): StoredIngestKey[] {
  return Array.isArray(raw)
    ? (raw as StoredIngestKey[]).filter((k) => typeof k?.hash === "string" && k.hash.length === 64)
    : [];
}

export async function listTrustSources(): Promise<TrustSource[]> {
  const { data, error } = await adminDb
    .from("sast_trust_sources")
    .select("*")
    .order("provider")
    .order("owner");
  if (error) throw new Error(error.message);
  return (data ?? []).map((r: TrustSource) => ({ ...r, keys: cleanKeys(r.keys) }));
}

/**
 * Fonte dona da chave apresentada (comparação em tempo constante contra todas as
 * chaves de todas as fontes ativas). null = a chave não é de nenhuma fonte.
 */
export async function findTrustSourceByKey(presented: string): Promise<TrustSource | null> {
  if (!presented.startsWith(KEY_PREFIX)) return null;
  const h = Buffer.from(hashIngestKey(presented), "hex");
  const sources = (await listTrustSources()).filter((s) => s.enabled);
  let found: TrustSource | null = null;
  for (const s of sources) {
    for (const k of s.keys) {
      const stored = Buffer.from(k.hash, "hex");
      if (stored.length === h.length && crypto.timingSafeEqual(stored, h)) found = s;
    }
  }
  return found;
}

/** "*" = qualquer; "prefixo-*" = começa com; senão nome exato (sem diferenciar caixa). */
export function repoMatchesPattern(repository: string, pattern: string): boolean {
  const repo = repository.toLowerCase();
  const p = pattern.toLowerCase();
  if (p === "*") return true;
  if (p.endsWith("*")) return repo.startsWith(p.slice(0, -1));
  return repo === p;
}

/** O escopo conferido no CI (dono + repositório) está dentro desta fonte? */
export function scopeMatchesSource(
  source: TrustSource,
  provider: TrustProvider,
  owner: string,
  repository: string,
): boolean {
  return (
    source.provider === provider &&
    source.owner.toLowerCase() === owner.toLowerCase() &&
    repoMatchesPattern(repository, source.repo_pattern)
  );
}

async function saveSourceKeys(id: string, keys: StoredIngestKey[]): Promise<void> {
  const { error } = await adminDb
    .from("sast_trust_sources")
    .update({ keys, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) throw new Error(error.message);
}

async function getSource(id: string): Promise<TrustSource> {
  const { data, error } = await adminDb
    .from("sast_trust_sources")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Fonte confiável não encontrada");
  return { ...data, keys: cleanKeys(data.keys) };
}

/** Gera chave nova (devolvida em texto UMA vez); a atual vira "anterior", ainda válida. */
export async function rotateTrustSourceKey(
  id: string,
  userId: string,
): Promise<{ key: string; hint: string }> {
  const source = await getSource(id);
  const key = KEY_PREFIX + crypto.randomBytes(32).toString("base64url");
  const hint = key.slice(0, KEY_PREFIX.length + 6);
  const next: StoredIngestKey = {
    hash: hashIngestKey(key),
    hint,
    created_at: new Date().toISOString(),
    created_by: userId,
  };
  await saveSourceKeys(id, [next, ...source.keys].slice(0, 2));
  return { key, hint };
}

export async function revokePreviousTrustSourceKey(id: string): Promise<boolean> {
  const source = await getSource(id);
  if (source.keys.length < 2) return false;
  await saveSourceKeys(id, source.keys.slice(0, 1));
  return true;
}
