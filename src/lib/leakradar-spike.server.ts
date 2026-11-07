// Server-only: detecção de PICO de credenciais vazadas por domínio de parceiro.
// Portado do b-security-suite (threat-intel.spike.server.ts), com duas
// diferenças: a fonte é a coleta local (leakradar_leaks, alimentada pelo
// leakradar-sync) em vez da amostra de 500 da API ao vivo, e os domínios
// monitorados vêm da integração LeakRadar (config.domains), não fixos no código.
//
// Roda em dois lugares: sob demanda no painel (getDomainSpike) e pelo cron
// cti-spike-sweep, que avisa no Teams (alerta threat_intel_domain_spike).
// NUNCA importar em código de cliente.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { isAlertModuleEnabled } from "@/lib/alert-modules.functions";
import { notifyThreatIntel } from "@/lib/leakradar-alerts.server";

const adminDb = supabaseAdmin as unknown as { from: (t: string) => any };

export const SPIKE_THRESHOLD = 5;

// Provedores públicos de e-mail — ignorados: só domínio corporativo/
// personalizado conta (é o que denuncia vazamento num parceiro).
const PUBLIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "hotmail.com",
  "hotmail.com.br",
  "outlook.com",
  "outlook.com.br",
  "live.com",
  "live.com.br",
  "msn.com",
  "yahoo.com",
  "yahoo.com.br",
  "ymail.com",
  "rocketmail.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "gmx.com",
  "mail.com",
  "yandex.com",
  "zoho.com",
  "bol.com.br",
  "uol.com.br",
  "terra.com.br",
  "ig.com.br",
  "globo.com",
  "globomail.com",
  "zipmail.com.br",
  "r7.com",
  "oi.com.br",
  "pop.com.br",
]);

// TLDs de 2 níveis mais comuns para colapsar subdomínio no domínio-raiz:
// unidade2.parceiro.com.br → parceiro.com.br.
const TWO_LEVEL_TLDS = new Set([
  "com.br",
  "edu.br",
  "gov.br",
  "org.br",
  "net.br",
  "art.br",
  "ind.br",
  "co.uk",
  "com.ar",
  "com.mx",
  "com.co",
  "com.pt",
]);

export function registrableDomain(host: string): string {
  const parts = host.split(".").filter(Boolean);
  if (parts.length <= 2) return host;
  const lastTwo = parts.slice(-2).join(".");
  if (TWO_LEVEL_TLDS.has(lastTwo)) return parts.slice(-3).join(".");
  return lastTwo;
}

// Dia no fuso de Brasília (AAAA-MM-DD): "hoje" do analista, não do servidor.
function dayKey(d: Date): string {
  return d.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" });
}

export type SpikeDomain = {
  root: string;
  uniqueAccounts: number;
  validCount: number;
  invalidCount: number;
  lines: number;
  reusedCount: number;
  reused: { account: string; services: string[] }[];
  services: string[];
  alert: boolean;
};

export type SpikeResult = {
  domain: string;
  today: string;
  threshold: number;
  alertCount: number;
  domains: SpikeDomain[];
};

// Muitas credenciais de um mesmo domínio de parceiro (tirando provedores
// públicos e o próprio domínio monitorado) indexadas HOJE no domínio monitorado.
// Conta contas únicas e detecta a mesma conta em mais de um serviço. Sem
// checagem de permissão — quem chama (server fn / cron) faz o gate.
export async function computeDomainSpike(
  domain: string,
  threshold = SPIKE_THRESHOLD,
): Promise<SpikeResult> {
  const monitored = domain.trim().toLowerCase();
  const today = dayKey(new Date());
  const ownRoot = registrableDomain(monitored);

  // 36 h cobre o dia de Brasília inteiro em qualquer fuso do servidor; o
  // filtro exato por dia vem logo abaixo.
  const since = new Date(Date.now() - 36 * 3_600_000).toISOString();
  const { data, error } = await adminDb
    .from("leakradar_leaks")
    .select("username, url_host, added_at, validation_status")
    .eq("domain", monitored)
    .gte("added_at", since)
    .limit(5000);
  if (error) throw new Error(error.message);

  type Acc = {
    accounts: Map<string, { services: Set<string>; validation: string | null }>;
    lines: number;
  };
  const byRoot = new Map<string, Acc>();
  for (const it of (data ?? []) as Array<{
    username: string | null;
    url_host: string | null;
    added_at: string | null;
    validation_status: string | null;
  }>) {
    if (!it.added_at || dayKey(new Date(it.added_at)) !== today) continue;
    // Domínio do e-mail da conta (mascarado ainda mostra o domínio).
    const account = String(it.username ?? "")
      .trim()
      .toLowerCase();
    const at = account.lastIndexOf("@");
    if (at < 0) continue;
    const emailDomain = account.slice(at + 1);
    if (!emailDomain || PUBLIC_EMAIL_DOMAINS.has(emailDomain)) continue;
    const root = registrableDomain(emailDomain);
    if (root === ownRoot) continue; // próprio domínio = colaborador, coberto à parte

    let acc = byRoot.get(root);
    if (!acc) {
      acc = { accounts: new Map(), lines: 0 };
      byRoot.set(root, acc);
    }
    acc.lines += 1;
    let a = acc.accounts.get(account);
    if (!a) {
      a = { services: new Set(), validation: null };
      acc.accounts.set(account, a);
    }
    if (it.url_host) a.services.add(it.url_host.toLowerCase());
    // "valida" vence: basta um serviço com a senha viva.
    if (it.validation_status === "valida" || !a.validation) a.validation = it.validation_status;
  }

  const domains = [...byRoot.entries()]
    .map(([root, acc]) => {
      let validCount = 0;
      let invalidCount = 0;
      for (const a of acc.accounts.values()) {
        if (a.validation === "valida") validCount += 1;
        else if (a.validation === "invalida") invalidCount += 1;
      }
      const reused = [...acc.accounts.entries()]
        .filter(([, a]) => a.services.size > 1)
        .map(([account, a]) => ({ account, services: [...a.services].slice(0, 8) }))
        .sort((x, y) => y.services.length - x.services.length);
      const services = [
        ...new Set([...acc.accounts.values()].flatMap((a) => [...a.services])),
      ].slice(0, 12);
      return {
        root,
        uniqueAccounts: acc.accounts.size,
        validCount,
        invalidCount,
        lines: acc.lines,
        reusedCount: reused.length,
        reused: reused.slice(0, 50),
        services,
        alert: acc.accounts.size >= threshold,
      };
    })
    // Só vale mostrar domínio com mais de uma conta; o alerta destaca os que
    // passam do gatilho.
    .filter((x) => x.uniqueAccounts >= 2)
    .sort((a, b) => Number(b.alert) - Number(a.alert) || b.uniqueAccounts - a.uniqueAccounts)
    .slice(0, 10);

  return {
    domain: monitored,
    today,
    threshold,
    alertCount: domains.filter((d) => d.alert).length,
    domains,
  };
}

// ── Varredura periódica (cron) + alerta no Teams ─────────────────────────────
// Dedupe: no máximo UM aviso por par (domínio monitorado + domínio-raiz do
// parceiro) por dia. O marcador fica no config da própria linha do alerta em
// integrations (a mesma do toggle), só com o dia de hoje.
const SPIKE_ALERT_KEY = "threat_intel_domain_spike";
const SPIKE_PROVIDER = `alert_module:${SPIKE_ALERT_KEY}`;

async function loadSent(today: string): Promise<{ id: string | null; sent: Set<string> }> {
  const { data } = await adminDb
    .from("integrations")
    .select("id, config")
    .eq("provider", SPIKE_PROVIDER)
    .maybeSingle();
  const row = data as { id: string; config: { last_sent?: Record<string, string[]> } } | null;
  return { id: row?.id ?? null, sent: new Set(row?.config?.last_sent?.[today] ?? []) };
}

async function saveSent(id: string | null, today: string, sent: Set<string>): Promise<void> {
  const config = { last_sent: { [today]: [...sent] } }; // só hoje (poda o resto)
  if (id) await adminDb.from("integrations").update({ config }).eq("id", id);
  else
    await adminDb
      .from("integrations")
      .insert({ provider: SPIKE_PROVIDER, name: "config", enabled: true, config });
}

export type SpikeSweepResult = {
  ok: boolean;
  checked: number;
  alerted: number;
  errors: string[];
  skippedDisabled?: boolean;
};

export async function sweepSpikeAndAlert(threshold = SPIKE_THRESHOLD): Promise<SpikeSweepResult> {
  if (!(await isAlertModuleEnabled(SPIKE_ALERT_KEY)))
    return { ok: true, checked: 0, alerted: 0, errors: [], skippedDisabled: true };

  const { getLeakRadarCreds } = await import("@/lib/leakradar.server");
  const creds = await getLeakRadarCreds();
  if (!creds) return { ok: false, checked: 0, alerted: 0, errors: ["LeakRadar não configurado."] };

  const errors: string[] = [];
  let checked = 0;
  let alerted = 0;
  const today = dayKey(new Date());
  const { id, sent } = await loadSent(today);

  for (const monitored of creds.domains) {
    checked += 1;
    let result: SpikeResult;
    try {
      result = await computeDomainSpike(monitored, threshold);
    } catch (e) {
      errors.push(`${monitored}: ${(e as Error).message}`);
      continue;
    }
    for (const d of result.domains) {
      if (!d.alert) continue;
      const key = `${monitored}|${d.root}`;
      if (sent.has(key)) continue;
      await notifyThreatIntel(SPIKE_ALERT_KEY, {
        title: "Pico de credenciais vazadas",
        color: "DC2626",
        facts: [
          { name: "Domínio monitorado", value: monitored },
          { name: "Domínio do parceiro", value: d.root },
          { name: "Contas únicas hoje", value: String(d.uniqueAccounts) },
          { name: "Linhas vazadas hoje", value: String(d.lines) },
          { name: "Reutilizadas em mais de um serviço", value: String(d.reusedCount) },
          { name: "Validadas", value: `${d.validCount} válida(s) / ${d.invalidCount} inválida(s)` },
          { name: "Serviços atingidos", value: d.services.slice(0, 6).join(", ") || "—" },
          { name: "Gatilho", value: `${threshold} contas únicas/dia` },
        ],
      });
      sent.add(key);
      alerted += 1;
    }
  }

  if (alerted > 0)
    await saveSent(id, today, sent).catch((e) => errors.push(`persist: ${(e as Error).message}`));

  return { ok: errors.length === 0, checked, alerted, errors };
}
