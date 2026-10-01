// Server-only DAST Scanner client. Fala com o FastAPI externo (engines ZAP/Nuclei/
// Amass/Nmap/Nikto) — a INFRA do motor é etapa 2. Credenciais na tabela `integrations`
// (provider='dast_scanner'). NUNCA importar este arquivo em código de cliente.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { encryptSecret, decryptSecret } from "@/lib/crypto.server";

// types.ts gerado não conhece as tabelas dast_* — acesso por cast.
const adminDb = supabaseAdmin as unknown as { from: (t: string) => any };

export type DastCreds = { baseUrl: string; apiKey: string };

export async function getDastCreds(): Promise<DastCreds | null> {
  const { data } = await supabaseAdmin
    .from("integrations")
    .select("base_url, api_key, enabled")
    .eq("provider", "dast_scanner")
    .maybeSingle();
  if (!data?.enabled || !data.api_key || !data.base_url) return null;
  return { baseUrl: (data.base_url as string).replace(/\/+$/, ""), apiKey: data.api_key as string };
}

// Token da integração Cloudflare -- lido via admin client de propósito (mesmo
// motivo de getDastCreds acima): api_key é sensível, RLS bloqueia leitura pelo
// client user-scoped, então a descoberta via zona Cloudflare (que roda com o
// context.supabase do usuário nas outras tabelas) precisa dessa via separada
// só pra essa credencial.
export async function getCloudflareApiToken(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from("integrations")
    .select("api_key, enabled")
    .eq("provider", "cloudflare")
    .maybeSingle();
  if (!data?.enabled || !data.api_key) return null;
  return data.api_key as string;
}

// Credencial de domínio pra descoberta de aplicações internas via LDAP
// (adidnsdump, zona DNS AD-integrada) -- entrada própria em `integrations`,
// separada da credencial SMB do Shadow IT de propósito (mesma separação de
// módulo já mantida em todo o resto: cada um gerencia/rotaciona a sua, mesmo
// que na prática aponte pra mesma conta de domínio). Cifrada igual
// shadowit_smb (AES-256-GCM, ver crypto.server.ts).
export type DastAdLdapCreds = { username: string; password: string; dcHost: string };

export async function getDastAdLdapCreds(): Promise<DastAdLdapCreds | null> {
  const { data } = await supabaseAdmin
    .from("integrations")
    .select("api_key, config, enabled")
    .eq("provider", "dast_ad_ldap")
    .maybeSingle();
  const cfg = data?.config as { username?: string; dcHost?: string } | null;
  if (!data?.enabled || !data.api_key || !cfg?.username || !cfg?.dcHost) return null;
  try {
    return { username: cfg.username, dcHost: cfg.dcHost, password: decryptSecret(data.api_key as string) };
  } catch {
    return null;
  }
}

export async function saveDastAdLdapCreds(username: string, password: string, dcHost: string): Promise<void> {
  const encrypted = encryptSecret(password);
  const { error } = await adminDb.from("integrations").upsert(
    {
      provider: "dast_ad_ldap",
      name: "DAST — credencial AD (LDAP)",
      api_key: encrypted,
      config: { username, dcHost },
      enabled: true,
    },
    { onConflict: "provider" },
  );
  if (error) throw new Error(error.message);
}

// Scan autenticado: credencial de login por domínio-alvo, reutilizável entre
// scans manuais e Agendamentos -- tabela própria (dast_auth_credentials, 1
// linha por domínio) em vez do padrão singleton de `integrations` usado por
// dast_ad_ldap/shadowit_smb, porque aqui cada aplicação escaneada tem seu
// próprio usuário/senha (não uma credencial de domínio única). Senha cifrada
// igual às demais (AES-256-GCM, crypto.server.ts).
export type DastAuthCredential = {
  id: string;
  domain: string;
  // null = sem login_url cadastrado -- startDastScan usa a raiz do alvo
  // escaneado como loginPageUrl (ver migration 20260914130000). Só precisa
  // ser preenchido quando o login mora num host diferente do alvo (SSO).
  loginUrl: string | null;
  username: string;
  loggedInIndicator: string | null;
};

export async function getDastAuthCredentialForDomain(
  domain: string,
): Promise<{ username: string; password: string; loginUrl: string | null; loggedInIndicator: string | null } | null> {
  const { data } = await adminDb
    .from("dast_auth_credentials")
    .select("username, password_enc, login_url, logged_in_indicator")
    .eq("domain", domain)
    .maybeSingle();
  if (!data) return null;
  try {
    return {
      username: data.username as string,
      password: decryptSecret(data.password_enc as string),
      loginUrl: (data.login_url as string | null) ?? null,
      loggedInIndicator: (data.logged_in_indicator as string | null) ?? null,
    };
  } catch {
    return null;
  }
}

export async function listDastAuthCredentials(): Promise<DastAuthCredential[]> {
  const { data } = await adminDb
    .from("dast_auth_credentials")
    .select("id, domain, login_url, username, logged_in_indicator")
    .order("domain", { ascending: true });
  return ((data ?? []) as any[]).map((r) => ({
    id: r.id,
    domain: r.domain,
    loginUrl: r.login_url,
    username: r.username,
    loggedInIndicator: r.logged_in_indicator,
  }));
}

export async function saveDastAuthCredential(input: {
  domain: string;
  loginUrl: string | null;
  username: string;
  password: string;
  loggedInIndicator: string | null;
}): Promise<void> {
  const { error } = await adminDb.from("dast_auth_credentials").upsert(
    {
      domain: input.domain,
      login_url: input.loginUrl || null,
      username: input.username,
      password_enc: encryptSecret(input.password),
      logged_in_indicator: input.loggedInIndicator || null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "domain" },
  );
  if (error) throw new Error(error.message);
}

// login_url pode estar vazio (ver DastAuthCredential.loginUrl) -- nesse caso
// usa a raiz do alvo escaneado como loginPageUrl. O Browser-Based
// Authentication do ZAP sobe um navegador de verdade e segue qualquer
// redirecionamento (HTTP ou JS) até a tela de login renderizar, então a
// raiz funciona como ponto de entrada universal pra app com "auth wall"
// (root sempre cai em login), sem precisar acertar o path exato ("/login"
// vs "/auth" vs "/admin" etc.). IMPORTANTE: nunca devolve vazio/null --
// main.py só tenta autenticação quando auth_login_url é truthy (ver
// ScanRequest/run_scan_job), então um valor vazio aqui faria a
// autenticação nem ser tentada, silenciosamente, mesmo com credencial e
// White box escolhidos.
export function resolveAuthLoginUrl(loginUrl: string | null, targetUrl: string): string {
  if (loginUrl) return loginUrl;
  try {
    const u = new URL(/^https?:\/\//i.test(targetUrl) ? targetUrl : `https://${targetUrl}`);
    return `${u.protocol}//${u.host}/`;
  } catch {
    return targetUrl;
  }
}

export async function deleteDastAuthCredential(id: string): Promise<void> {
  const { error } = await adminDb.from("dast_auth_credentials").delete().eq("id", id);
  if (error) throw new Error(error.message);
}

// Gate server-side: admin + depto Segurança da Informação (espelha a RPC is_dast_allowed).
// Usa o client user-scoped (context.supabase) para que a checagem valha para o chamador.
export async function assertDastAccess(sb: SupabaseClient, userId: string): Promise<void> {
  const { data, error } = await sb.rpc("is_dast_allowed" as never, { _uid: userId } as never);
  if (error) throw new Error(`Permissão indisponível: ${error.message}`);
  if (data !== true) {
    throw new Error("Acesso negado: requer admin e departamento Segurança da Informação");
  }
}

async function logApi(status: "success" | "error", httpStatus: number | null, message: string, ms: number) {
  try {
    await supabaseAdmin.from("api_logs").insert({
      provider: "dast_scanner",
      status,
      http_status: httpStatus,
      message: message.slice(0, 500),
      duration_ms: ms,
    });
  } catch {
    /* swallow */
  }
}

// Chamada ao FastAPI com header x-api-key + Cloudflare Access + timeout curto
// (só para o ACK — o scan roda assíncrono do lado da infra e volta por webhook).
// `log=false` pula o registro por chamada em api_logs — usado pelo /resolve,
// que roda em lote (1 chamada por IP do CMDB) e logaria centenas de linhas
// idênticas; o chamador registra um único resumo do lote.
export async function scannerFetch<T = unknown>(
  creds: DastCreds,
  path: string,
  body: unknown,
  timeoutMs = 20_000,
  log = true,
): Promise<T> {
  const url = `${creds.baseUrl}${path.startsWith("/") ? path : `/${path}`}`;
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": creds.apiKey,
        Accept: "application/json",
        ...(process.env.CF_ACCESS_CLIENT_ID ? { "CF-Access-Client-Id": process.env.CF_ACCESS_CLIENT_ID } : {}),
        ...(process.env.CF_ACCESS_CLIENT_SECRET
          ? { "CF-Access-Client-Secret": process.env.CF_ACCESS_CLIENT_SECRET }
          : {}),
      },
      body: JSON.stringify(body),
    });
    const ms = Date.now() - t0;
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      if (log) await logApi("error", res.status, `${path} ${res.status}: ${txt.slice(0, 200)}`, ms);
      throw new Error(`DAST scanner ${res.status}: ${txt.slice(0, 200)}`);
    }
    if (log) await logApi("success", res.status, `${path} ok`, ms);
    return (await res.json().catch(() => ({}))) as T;
  } catch (e) {
    const ms = Date.now() - t0;
    const msg = (e as Error).message ?? String(e);
    if (log && !msg.startsWith("DAST scanner ")) await logApi("error", null, `${path}: ${msg.slice(0, 200)}`, ms);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

// Como scannerFetch, mas devolve bytes crus (PDF), não JSON -- o /report/pdf
// do scanner renderiza capa e corpo em passadas separadas via Chromium
// headless (Playwright/Page.printToPDF) e devolve os dois já fundidos num
// PDF só. Dois HTMLs (não 1) porque a capa não leva o cabeçalho/rodapé
// repetido do Playwright (já tem a própria marca embutida, maior) e o corpo
// leva -- display_header_footer do Playwright é tudo-ou-nada por render.
// Timeout maior que o padrão: renderizar um relatório com dezenas de
// achados detalhados pode levar mais que os 20s do scannerFetch normal (que
// é só pra ACK).
export async function renderPdfReport(creds: DastCreds, coverHtml: string, bodyHtml: string): Promise<Buffer> {
  const url = `${creds.baseUrl}/report/pdf`;
  const t0 = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 60_000);
  try {
    const res = await fetch(url, {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        "x-api-key": creds.apiKey,
        Accept: "application/pdf",
        ...(process.env.CF_ACCESS_CLIENT_ID ? { "CF-Access-Client-Id": process.env.CF_ACCESS_CLIENT_ID } : {}),
        ...(process.env.CF_ACCESS_CLIENT_SECRET
          ? { "CF-Access-Client-Secret": process.env.CF_ACCESS_CLIENT_SECRET }
          : {}),
      },
      body: JSON.stringify({ cover_html: coverHtml, body_html: bodyHtml }),
    });
    const ms = Date.now() - t0;
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      await logApi("error", res.status, `/report/pdf ${res.status}: ${txt.slice(0, 200)}`, ms);
      throw new Error(`Scanner PDF ${res.status}: ${txt.slice(0, 200)}`);
    }
    await logApi("success", res.status, "/report/pdf ok", ms);
    return Buffer.from(await res.arrayBuffer());
  } catch (e) {
    const ms = Date.now() - t0;
    const msg = (e as Error).message ?? String(e);
    if (!msg.startsWith("Scanner PDF ")) await logApi("error", null, `/report/pdf: ${msg.slice(0, 200)}`, ms);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

export type DnsResolveResult = {
  ip: string;
  hostname: string | null;
  resolved: boolean;
  reason: "no_ptr" | "timeout" | "invalid_ip" | null;
};

// DNS reverso (PTR) via o mesmo FastAPI do scanner (rota /resolve-batch) —
// usado pelo CMDB pra cruzar hostname real (AD) com o que o Zabbix tem
// cadastrado. Manda a lista inteira numa única chamada -- substitui o
// padrão antigo (1 POST /resolve por IP, mapLimit(5) do lado do app) que
// gerava 1 linha de access log do uvicorn por IP a cada refresh do cache
// DNS do CMDB (a cada 15min via cron), só ruído no journalctl da VM (não é
// log nosso, é o access log automático do uvicorn por request HTTP).
// Timeout maior que o do /resolve pontual antigo: o scanner roda a lista
// com concorrência interna limitada (não N vezes o timeout de 1 IP), mas
// ainda é potencialmente dezenas de lookups DNS de 5s cada em lotes de 10.
export async function resolveHostnamesBatch(creds: DastCreds, ips: string[]): Promise<DnsResolveResult[]> {
  const { results } = await scannerFetch<{ results: DnsResolveResult[] }>(
    creds,
    "/resolve-batch",
    { ips },
    40_000,
    false,
  );
  return results;
}

// Próxima execução de um agendamento a partir de `from` (default agora).
export function computeNextRun(frequency: string | null, runAtTime: string | null, from: Date = new Date()): string {
  const [h, m] = (runAtTime ?? "00:00").split(":").map((n) => parseInt(n, 10) || 0);
  const d = new Date(from);
  d.setHours(h, m, 0, 0);
  if (d <= from) {
    if (frequency === "weekly") d.setDate(d.getDate() + 7);
    else if (frequency === "monthly") d.setMonth(d.getMonth() + 1);
    else d.setDate(d.getDate() + 1);
  }
  return d.toISOString();
}

// Runner de agendamentos (chamado pelo hook de cron; sem contexto de usuário →
// usa service_role). Dispara os scans vencidos e reprograma o next_run_at.
export async function runDastSchedules(): Promise<{ triggered: number }> {
  const now = new Date();
  const nowIso = now.toISOString();
  const { data: due } = await adminDb
    .from("dast_scan_schedules")
    .select("*")
    .eq("active", true)
    .lte("next_run_at", nowIso);
  if (!due?.length) return { triggered: 0 };

  const creds = await getDastCreds();
  let triggered = 0;
  for (const s of due as any[]) {
    const targets = [s.target_url || s.domain].filter(Boolean) as string[];
    if (targets.length) {
      const { data: scan } = await adminDb
        .from("dast_scans")
        .insert({
          target_url: targets[0],
          domain: s.domain ?? null,
          name: s.name ?? targets[0],
          mode: s.mode ?? "url",
          level: s.level ?? "basic",
          engines: s.engines ?? [],
          status: "queued",
          config: { ...(s.config ?? {}), targets, scheduled: true, schedule_id: s.id },
        })
        .select("id")
        .single();
      if (scan) {
        if (creds) {
          try {
            // Scan agendado reusa a credencial cadastrada pro domínio (se
            // existir) -- é justamente o caso que motivou credencial
            // reutilizável em vez de "só no momento do scan": agendamento
            // roda sozinho, sem ninguém pra digitar login toda vez.
            const auth = s.domain ? await getDastAuthCredentialForDomain(s.domain) : null;
            await scannerFetch(creds, "/scan", {
              scan_id: scan.id,
              targets,
              mode: s.mode ?? "url",
              level: s.level ?? "basic",
              engines: s.engines ?? [],
              config: s.config ?? {},
              ...(auth
                ? {
                    auth_username: auth.username,
                    auth_password: auth.password,
                    auth_login_url: resolveAuthLoginUrl(auth.loginUrl, targets[0]),
                    auth_logged_in_indicator: auth.loggedInIndicator,
                  }
                : {}),
            });
            await adminDb.from("dast_scans").update({ status: "running", started_at: nowIso }).eq("id", scan.id);
          } catch (e) {
            await adminDb
              .from("dast_scans")
              .update({ status: "error", error: (e as Error).message })
              .eq("id", scan.id);
          }
        } else {
          await adminDb
            .from("dast_scans")
            .update({ status: "error", error: "Scanner não configurado" })
            .eq("id", scan.id);
        }
      }
    }
    await adminDb
      .from("dast_scan_schedules")
      .update({ next_run_at: computeNextRun(s.frequency, s.run_at_time, now) })
      .eq("id", s.id);
    triggered++;
  }
  return { triggered };
}
