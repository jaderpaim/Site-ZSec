// Server-only: credencial de domínio (SMB) do Shadow IT. NUNCA importar em
// código de cliente -- lida via supabaseAdmin de propósito, mesmo motivo de
// getCloudflareApiToken em dast.server.ts (RLS bloqueia leitura do segredo
// pelo client user-scoped).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { encryptSecret, decryptSecret } from "@/lib/crypto.server";

const adminDb = supabaseAdmin as unknown as { from: (t: string) => any };

export type ShadowItSmbCreds = { username: string; password: string };

export async function getShadowItSmbCreds(): Promise<ShadowItSmbCreds | null> {
  const { data } = await adminDb
    .from("integrations")
    .select("api_key, config, enabled")
    .eq("provider", "shadowit_smb")
    .maybeSingle();
  const username = (data?.config as { username?: string } | null)?.username;
  if (!data?.enabled || !data.api_key || !username) return null;
  try {
    return { username, password: decryptSecret(data.api_key as string) };
  } catch {
    return null;
  }
}

export async function saveShadowItSmbCreds(username: string, password: string): Promise<void> {
  const encrypted = encryptSecret(password);
  const { error } = await adminDb.from("integrations").upsert(
    {
      provider: "shadowit_smb",
      name: "Shadow IT — credencial SMB",
      api_key: encrypted,
      config: { username },
      enabled: true,
    },
    { onConflict: "provider" },
  );
  if (error) throw new Error(error.message);
}

// IPs já conhecidos pelo CMDB -- via admin client de propósito: a policy de
// cmdb_dns_cache não cobre super_admin (só admin/analista/permissão de
// módulo), e aqui é só uma checagem de presença pra um badge, não exposição
// de dado sensível novo (quem já vê a lista de hosts já passou por
// is_dast_allowed). cmdb_dns_cache já filtra ip_hostname pra só IPv4 válido
// (ver cmdb-dns.server.ts) -- reaproveita esse parsing em vez de duplicar.
export async function getCmdbKnownIps(): Promise<Set<string>> {
  const { data } = await adminDb.from("cmdb_dns_cache").select("ip");
  return new Set((data ?? []).map((r: any) => r.ip as string));
}
