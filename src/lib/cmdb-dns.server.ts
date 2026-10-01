// Server-only: refresh do cache de resolução DNS reversa dos IPs do CMDB,
// via o endpoint /resolve do scanner DAST (única infra com rota até o DNS
// interno da AD — ver src/lib/dast.server.ts).
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getDastCreds, resolveHostnamesBatch } from "@/lib/dast.server";

const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/;

// Só IPv4 puro (ip_hostname às vezes guarda hostname em vez de IP) — o
// scanner exige um IP válido, não adianta mandar hostname pra ele.
function distinctIps(values: (string | null)[]): string[] {
  const set = new Set<string>();
  for (const v of values) {
    const s = (v ?? "").trim();
    if (IPV4_RE.test(s)) set.add(s);
  }
  return [...set];
}

// Lote de 50 por chamada -- não manda a lista inteira numa POST só (limita o
// blast radius de uma falha de rede/timeout pontual a 1 lote, igual o
// try/catch por IP já fazia antes) nem volta a 1 request por IP (era isso
// que a troca pro /resolve-batch veio resolver: só 1 linha de access log do
// uvicorn por lote, não uma por IP, a cada refresh via cron).
function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export async function refreshCmdbDnsCache(): Promise<{
  ok: boolean;
  resolved: number;
  total: number;
  error?: string;
}> {
  const creds = await getDastCreds();
  if (!creds)
    return {
      ok: false,
      resolved: 0,
      total: 0,
      error: "DAST scanner não configurado (Integrações).",
    };

  const { data: ativos, error } = await supabaseAdmin.from("cmdb_ativos").select("ip_hostname");
  if (error) return { ok: false, resolved: 0, total: 0, error: error.message };

  const ips = distinctIps((ativos ?? []).map((a) => a.ip_hostname));
  if (ips.length === 0) return { ok: true, resolved: 0, total: 0 };

  const t0 = Date.now();
  let resolvedCount = 0;
  let failedCount = 0;
  const syncedAt = new Date().toISOString();
  const rows: { ip: string; hostname: string | null; resolved: boolean; reason: string | null; synced_at: string }[] =
    [];
  for (const batch of chunk(ips, 50)) {
    try {
      const results = await resolveHostnamesBatch(creds, batch);
      for (const r of results) {
        if (r.resolved) resolvedCount++;
        rows.push({ ip: r.ip, hostname: r.hostname, resolved: r.resolved, reason: r.reason, synced_at: syncedAt });
      }
    } catch (e) {
      // Falha do lote inteiro (timeout/rede) não deve derrubar os demais
      // lotes -- cada IP desse lote fica marcado sem resolver, igual o
      // try/catch por IP fazia antes.
      failedCount += batch.length;
      for (const ip of batch) {
        rows.push({ ip, hostname: null, resolved: false, reason: "timeout", synced_at: syncedAt });
      }
    }
  }

  const { error: upsertError } = await supabaseAdmin.from("cmdb_dns_cache").upsert(rows, { onConflict: "ip" });

  // 1 registro resumindo o lote inteiro em api_logs (não 1 por IP — ver
  // scannerFetch/resolveHostname com log=false), pro painel de Logs não
  // encher com centenas de linhas idênticas a cada refresh.
  await supabaseAdmin.from("api_logs").insert({
    provider: "dast_scanner",
    status: upsertError ? "error" : "success",
    http_status: null,
    message: upsertError
      ? `/resolve batch: falha ao gravar cache — ${upsertError.message.slice(0, 300)}`
      : `/resolve-batch: ${resolvedCount}/${ips.length} resolvidos` +
        (failedCount > 0 ? ` (${failedCount} sem resposta por falha de lote)` : ""),
    duration_ms: Date.now() - t0,
  });

  if (upsertError) return { ok: false, resolved: resolvedCount, total: ips.length, error: upsertError.message };

  return { ok: true, resolved: resolvedCount, total: ips.length };
}
