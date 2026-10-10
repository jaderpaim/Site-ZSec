// Parte só de servidor dos dados da organização (service role). Importada
// dinamicamente dentro dos handlers de organizacao.functions.ts e de outras
// server functions, para não entrar no bundle do navegador.
import { createClient } from "@supabase/supabase-js";
import { ORG_FALLBACK, type Organizacao } from "./organizacao.functions";

export function orgAdminClient() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

// Cache curto para não consultar o banco a cada chamada.
let cache: { value: Organizacao; at: number } | null = null;
const CACHE_MS = 60_000;

export function clearOrganizacaoCache() {
  cache = null;
}

export async function loadOrganizacao(): Promise<Organizacao> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  // Erro aqui é esperado num banco onde a migration ainda não foi aplicada:
  // cai no fallback em vez de quebrar a tela.
  const { data, error } = await orgAdminClient()
    .from("organizacao_config")
    .select("nome, nome_curto, dominio_corporativo")
    .eq("id", true)
    .maybeSingle();
  const value: Organizacao =
    error || !data
      ? ORG_FALLBACK
      : { ...(data as Omit<Organizacao, "configurada">), configurada: true };
  cache = { value, at: Date.now() };
  return value;
}
