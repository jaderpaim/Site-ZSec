// Server-only: integração LeakRadar (credenciais vazadas em logs de
// infostealer, combolists e dumps). NUNCA importar este arquivo em código de
// cliente.
//
// Credencial na tabela `integrations` (provider='leakradar'): api_key cifrada
// (crypto.server.ts) e `config.domains` com os domínios monitorados.
//
// A SENHA NUNCA É GRAVADA: itens desbloqueados vêm com `password` em texto
// puro e `toRow` simplesmente não lê esse campo. Ver a migração
// 20261014120000_threat_intel_leakradar.sql.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { readSecret } from "@/lib/crypto.server";

const adminDb = supabaseAdmin as unknown as { from: (t: string) => any };

const DEFAULT_BASE_URL = "https://api.leakradar.io";
export const LEAK_CATEGORIES = ["employees", "customers", "third_parties"] as const;
export type LeakCategory = (typeof LEAK_CATEGORIES)[number];

// 1000 é o máximo da API. A coleta traz TUDO que o domínio tem: pagina até o
// `total` informado pela API, sem teto fixo. O guard só evita laço infinito se
// a API devolver `total` inconsistente (1M itens = 1000 páginas).
const PAGE_SIZE = 1000;
const MAX_PAGES_GUARD = 1000;
// Pausa entre chamadas. O limite da borda é 30 req/s, mas a conta também tem
// limite de buscas pesadas simultâneas; sequencial e espaçado evita 429.
const REQUEST_GAP_MS = 300;

export type LeakRadarCreds = { baseUrl: string; apiKey: string; domains: string[] };

function parseDomains(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[\s,;]+/) : [];
  return [
    ...new Set(
      list
        .map((d) => String(d).trim().toLowerCase())
        .filter((d) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(d)),
    ),
  ];
}

export async function getLeakRadarCreds(): Promise<LeakRadarCreds | null> {
  const { data } = await adminDb
    .from("integrations")
    .select("api_key, base_url, config, enabled")
    .eq("provider", "leakradar")
    .maybeSingle();
  const cfg = data?.config as { domains?: unknown } | null;
  const domains = parseDomains(cfg?.domains);
  if (!data?.enabled || !data.api_key || domains.length === 0) return null;
  return {
    baseUrl: (data.base_url as string | null)?.replace(/\/+$/, "") || DEFAULT_BASE_URL,
    apiKey: readSecret(data.api_key) as string,
    domains,
  };
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Toda chamada passa por aqui. Qualquer erro interrompe a coleta inteira, sem
// tentar de novo em sequência: o LeakRadar bane o IP por 1 hora depois de 30
// respostas 4xx em 60 segundos. A única exceção é um 429 com Retry-After
// curto, que espera e tenta uma vez.
async function lrFetch(
  creds: LeakRadarCreds,
  path: string,
  init: RequestInit = {},
  retried = false,
): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 30_000);
  let res: Response;
  try {
    res = await fetch(`${creds.baseUrl}${path}`, {
      ...init,
      signal: ctrl.signal,
      headers: {
        Authorization: `Bearer ${creds.apiKey}`,
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {}),
      },
    });
  } finally {
    clearTimeout(timer);
  }

  if (res.status === 429 && !retried) {
    const wait = Number(res.headers.get("Retry-After") || "");
    if (Number.isFinite(wait) && wait > 0 && wait <= 60) {
      await sleep(wait * 1000);
      return lrFetch(creds, path, init, true);
    }
  }
  if (!res.ok) {
    const txt = await res.text().catch(() => "");
    let detail = txt.slice(0, 200);
    try {
      const j = JSON.parse(txt) as { detail?: unknown; message?: unknown };
      if (typeof j.detail === "string") detail = j.detail;
      else if (typeof j.message === "string") detail = j.message;
    } catch {
      /* corpo não é JSON (ex.: 429/503 da borda) */
    }
    throw new Error(
      `LeakRadar ${res.status} em ${path.split("?")[0]}${detail ? `: ${detail}` : ""}`,
    );
  }
  return res.json();
}

type LeakItem = {
  id?: string | null;
  url?: string | null;
  username?: string | null;
  username_masked?: string | null;
  password_strength?: number | null;
  unlocked?: boolean;
  is_email?: boolean | null;
  added_at?: string | null;
  // `password` existe na resposta e é ignorado de propósito
};

type LeakPage = { items?: LeakItem[]; total?: number; total_unlocked?: number };

function hostOf(url: string | null | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url.includes("://") ? url : `https://${url}`).hostname.toLowerCase() || null;
  } catch {
    return null;
  }
}

// Só os campos listados aqui vão para o banco. Status/anotações ficam de fora
// para o upsert não apagar o tratamento feito na tela.
function toRow(item: LeakItem, category: LeakCategory, domain: string, now: string) {
  return {
    leak_id: item.id as string,
    category,
    domain,
    username: item.username ?? item.username_masked ?? null,
    is_email: item.is_email ?? null,
    url: item.url ?? null,
    url_host: hostOf(item.url),
    password_strength: item.password_strength ?? null,
    unlocked: item.unlocked === true,
    added_at: item.added_at ?? null,
    last_seen_at: now,
  };
}

type CategoryTotals = { total: number; total_unlocked: number; collected: number };

export async function syncLeakRadar(): Promise<{ ok: boolean; leaks: number; error?: string }> {
  const creds = await getLeakRadarCreds();
  if (!creds) {
    return {
      ok: false,
      leaks: 0,
      error: "Integração LeakRadar não configurada, desabilitada ou sem domínios.",
    };
  }

  const now = new Date().toISOString();
  const totals: Record<string, Partial<Record<LeakCategory, CategoryTotals>>> = {};
  const report: Record<string, unknown> = {};
  let leaks = 0;

  try {
    for (const domain of creds.domains) {
      const d = encodeURIComponent(domain);
      report[domain] = await lrFetch(creds, `/search/domain/${d}?light=false`);
      await sleep(REQUEST_GAP_MS);
      totals[domain] = {};

      for (const category of LEAK_CATEGORIES) {
        let total = 0;
        let totalUnlocked = 0;
        let collected = 0;
        // Pagina até o fim e grava CADA página já, para não segurar centenas de
        // milhares de linhas em memória num domínio grande.
        for (let page = 1; page <= MAX_PAGES_GUARD; page++) {
          const res = (await lrFetch(
            creds,
            `/search/domain/${d}/${category}?page=${page}&page_size=${PAGE_SIZE}`,
          )) as LeakPage;
          await sleep(REQUEST_GAP_MS);
          total = res.total ?? 0;
          totalUnlocked = res.total_unlocked ?? 0;
          const items = res.items ?? [];

          // Sem `id` (primeira página com dados) é sinal de plano sem domain_search.
          if (page === 1 && total > 0 && !items.some((it) => it.id)) {
            throw new Error(
              `A API não devolveu IDs para ${domain}/${category}. O plano precisa incluir domain_search.`,
            );
          }

          const rows = [
            ...new Map(
              items
                .filter((it) => it.id)
                .map((it) => [it.id as string, toRow(it, category, domain, now)]),
            ).values(),
          ];
          for (let i = 0; i < rows.length; i += 500) {
            const { error } = await adminDb
              .from("leakradar_leaks")
              .upsert(rows.slice(i, i + 500), { onConflict: "leak_id,category" });
            if (error) throw new Error(error.message);
          }
          collected += rows.length;
          if (items.length < PAGE_SIZE || page * PAGE_SIZE >= total) break;
        }

        totals[domain]![category] = { total, total_unlocked: totalUnlocked, collected };
        leaks += collected;
      }
    }

    await adminDb
      .from("leakradar_sync_state")
      .upsert({ id: "leakradar", last_sync_at: now, totals, report, updated_at: now });
    return { ok: true, leaks };
  } catch (e) {
    return { ok: false, leaks, error: (e as Error).message };
  }
}

// O /unlock responde 400 "All selected data already unlocked" quando todos os
// itens pedidos já estão desbloqueados na conta (ex.: desbloqueados direto no
// LeakRadar). Não é erro para nós — é só sinal de buscar a senha/metadados pela
// lista de desbloqueados em vez do /unlock.
function isAlreadyUnlocked(e: unknown): boolean {
  return /already unlocked/i.test((e as Error)?.message ?? "");
}

// Acha um item já desbloqueado na lista da conta. A API não filtra por id, mas
// filtrar por USUÁRIO (e host, quando houver) reduz a uma página — sem isso, um
// host com muitos vazamentos empurrava o item para além do limite de páginas
// (causa do "não foi possível trazer") e paginar 1000 em 1000 era o que pesava.
async function fetchUnlockedLeak(
  creds: LeakRadarCreds,
  leakId: string,
  opts: { urlHost?: string | null; username?: string | null },
): Promise<(LeakItem & { password?: string | null }) | null> {
  // O LeakRadar casa o usuário mesmo mascarado (maria.s***@gmail.com) na busca,
  // então usamos como veio do banco — é o filtro mais seletivo.
  const username = opts.username || null;
  const params = new URLSearchParams({ page_size: "200" });
  // A API aceita contains/starts_with/ends_with (não "exact"); casamos o id depois.
  if (username) {
    params.set("username", username);
    params.set("username_match_type", "contains");
  }
  if (opts.urlHost) {
    params.set("url_host", opts.urlHost);
    params.set("url_host_match_type", "contains");
  }
  // Sem nenhum filtro seletivo seria uma varredura cara; evita isso.
  if (!username && !opts.urlHost) return null;

  const maxPages = username ? 10 : 30;
  for (let page = 1; page <= maxPages; page++) {
    params.set("page", String(page));
    const res = (await lrFetch(creds, `/profile/unlocked/advanced?${params.toString()}`)) as {
      items?: Array<LeakItem & { password?: string | null }>;
    };
    const items = res.items ?? [];
    const found = items.find((x) => x.id === leakId);
    if (found) return found;
    if (items.length < 200) break;
    await sleep(REQUEST_GAP_MS);
  }
  return null;
}

// Desbloqueio manual (1 ponto por item). Atualiza só usuário/URL/força com a
// versão completa; a senha que vem na resposta é descartada aqui.
export async function unlockLeakRadarLeaks(leakIds: string[]): Promise<{ unlocked: number }> {
  const creds = await getLeakRadarCreds();
  if (!creds) throw new Error("Integração LeakRadar não configurada ou desabilitada.");
  let items: LeakItem[];
  try {
    items = (await lrFetch(creds, "/unlock", {
      method: "POST",
      body: JSON.stringify({ leak_ids: leakIds }),
    })) as LeakItem[];
  } catch (e) {
    // Já desbloqueados no LeakRadar: só reflete no nosso banco, sem cobrar nada.
    if (isAlreadyUnlocked(e)) {
      await adminDb.from("leakradar_leaks").update({ unlocked: true }).in("leak_id", leakIds);
      return { unlocked: leakIds.length };
    }
    throw e;
  }

  let unlocked = 0;
  for (const it of Array.isArray(items) ? items : []) {
    if (!it.id || it.unlocked !== true) continue;
    const { error } = await adminDb
      .from("leakradar_leaks")
      .update({
        unlocked: true,
        username: it.username ?? it.username_masked ?? null,
        url: it.url ?? null,
        url_host: hostOf(it.url),
        password_strength: it.password_strength ?? null,
      })
      .eq("leak_id", it.id);
    if (error) throw new Error(error.message);
    unlocked++;
  }
  return { unlocked };
}

// Revela a senha em tela, sem gravar. Desbloqueia se necessário (1 ponto); se já
// estiver desbloqueado no LeakRadar, busca a senha na lista de desbloqueados. O
// campo `password` NÃO entra no update do banco — só metadados. É o único ponto
// do código que lê `password`, e o valor morre no fim da requisição.
export async function revealLeakRadarPassword(
  leakId: string,
  hint?: { urlHost?: string | null; username?: string | null; alreadyUnlocked?: boolean },
): Promise<{ password: string | null; username: string | null; unlocked: boolean }> {
  // Linhas de seed (validação): não há LeakRadar por trás. Devolve uma senha
  // fictícia gerada na hora — nada é gravado no banco. Só afeta os seeds.
  if (leakId.startsWith("seed-")) {
    const amostra = [
      "Verao@2023",
      "senha123",
      "Homepaim#24",
      "P@ssw0rd!",
      "qwerty2024",
      "Brasil*99",
    ];
    const i = [...leakId].reduce((a, c) => a + c.charCodeAt(0), 0) % amostra.length;
    return { password: amostra[i], username: hint?.username ?? null, unlocked: true };
  }

  const creds = await getLeakRadarCreds();
  if (!creds) throw new Error("Integração LeakRadar não configurada ou desabilitada.");
  let it: (LeakItem & { password?: string | null }) | undefined;

  // Se o nosso banco já sabe que está desbloqueado, vai direto na lista (evita a
  // chamada ao /unlock que responderia 400 — uma ida e volta a menos).
  if (hint?.alreadyUnlocked) {
    it = (await fetchUnlockedLeak(creds, leakId, hint)) ?? undefined;
  } else {
    try {
      const items = (await lrFetch(creds, "/unlock", {
        method: "POST",
        body: JSON.stringify({ leak_ids: [leakId] }),
      })) as Array<LeakItem & { password?: string | null }>;
      it = (Array.isArray(items) ? items : []).find((x) => x.id === leakId);
    } catch (e) {
      if (!isAlreadyUnlocked(e)) throw e;
      it = (await fetchUnlockedLeak(creds, leakId, hint ?? {})) ?? undefined;
    }
  }
  if (!it) return { password: null, username: null, unlocked: false };
  if (it.id && it.unlocked === true) {
    await adminDb
      .from("leakradar_leaks")
      .update({
        unlocked: true,
        username: it.username ?? it.username_masked ?? null,
        url: it.url ?? null,
        url_host: hostOf(it.url),
        password_strength: it.password_strength ?? null,
      })
      .eq("leak_id", it.id);
  }
  return {
    password: it.password ?? null,
    username: it.username ?? it.username_masked ?? null,
    unlocked: it.unlocked === true,
  };
}

// Espelha o status no LeakRadar (só existe para itens desbloqueados).
// Melhor esforço: falha aqui não desfaz o status gravado no Z-Sec.
const STATUS_TO_LEAKRADAR: Record<string, string> = {
  novo: "new",
  em_tratamento: "in_progress",
  resolvido: "fixed",
  risco_aceito: "accepted_risk",
  falso_positivo: "accepted_risk",
};

export async function pushLeakRadarStatus(leakId: string, status: string): Promise<void> {
  const creds = await getLeakRadarCreds();
  const target = STATUS_TO_LEAKRADAR[status];
  if (!creds || !target) return;
  try {
    await lrFetch(creds, `/profile/unlocked/${encodeURIComponent(leakId)}/status`, {
      method: "PUT",
      body: JSON.stringify({ status: target }),
    });
  } catch {
    /* melhor esforço */
  }
}

// Teste de conexão (ao salvar a integração e no cabeçalho do módulo): plano,
// pontos e se a API devolve IDs (= domain_search). Não consome pontos.
export type LeakRadarAccount = {
  plan: string | null;
  active: boolean | null;
  points: number | null;
  requestsUsed: number | null;
  requestsLimit: number | null;
  hasDomainSearch: boolean | null;
};

export async function getLeakRadarAccount(
  override?: Partial<LeakRadarCreds>,
): Promise<LeakRadarAccount> {
  const saved = await getLeakRadarCreds();
  const creds = {
    ...(saved ?? { baseUrl: DEFAULT_BASE_URL, apiKey: "", domains: [] }),
    ...override,
  };
  if (!creds.apiKey) throw new Error("Informe a API key do LeakRadar.");

  const profile = (await lrFetch(creds as LeakRadarCreds, "/profile")) as {
    subscription_active?: boolean | null;
    subscription_points?: number | null;
    extra_points?: number | null;
    plan?: { name?: string | null } | null;
  };
  await sleep(REQUEST_GAP_MS);
  const usage = (await lrFetch(creds as LeakRadarCreds, "/profile/usage")) as {
    plan_name?: string | null;
    requests_daily?: { used?: number | null; limit?: number | null };
  };

  let hasDomainSearch: boolean | null = null;
  const firstDomain = creds.domains?.[0];
  if (firstDomain) {
    await sleep(REQUEST_GAP_MS);
    const page = (await lrFetch(
      creds as LeakRadarCreds,
      `/search/domain/${encodeURIComponent(firstDomain)}/employees?page=1&page_size=1`,
    )) as LeakPage;
    if ((page.items?.length ?? 0) > 0) hasDomainSearch = !!page.items![0].id;
  }

  const points =
    profile.subscription_points == null && profile.extra_points == null
      ? null
      : (profile.subscription_points ?? 0) + (profile.extra_points ?? 0);
  return {
    plan: usage.plan_name ?? profile.plan?.name ?? null,
    active: profile.subscription_active ?? null,
    points,
    requestsUsed: usage.requests_daily?.used ?? null,
    requestsLimit: usage.requests_daily?.limit ?? null,
    hasDomainSearch,
  };
}
