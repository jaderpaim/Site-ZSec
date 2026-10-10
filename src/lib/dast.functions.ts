import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import {
  assertDastAccess,
  getDastCreds,
  getCloudflareApiToken,
  scannerFetch,
  renderPdfReport,
  computeNextRun,
  getDastAdLdapCreds,
  saveDastAdLdapCreds,
  getDastAuthCredentialForDomain,
  listDastAuthCredentials,
  saveDastAuthCredential,
  deleteDastAuthCredential,
  resolveAuthLoginUrl,
} from "@/lib/dast.server";
import { logAudit } from "@/lib/audit-log.functions";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildDastPdfCoverHtml, buildDastPdfBodyHtml } from "@/lib/dast-report";
import { APP_NAME } from "@/lib/brand";

// types.ts é gerado — tabelas novas do DAST acessadas por cast.
type AnyDb = {
  from: (t: string) => any;
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ error: { message: string } | null }>;
};
const db = (sb: unknown) => sb as unknown as AnyDb;

// ── Validação de escopo (defesa-em-profundidade; o anti-SSRF forte roda no FastAPI) ──
function isPrivateHost(host: string): boolean {
  const h = host.toLowerCase();
  if (h === "localhost" || h.endsWith(".localhost") || h === "127.0.0.1" || h === "::1") return true;
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const a = +m[1],
      b = +m[2];
    if (a === 10 || a === 127 || a === 0 || a >= 224) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a === 169 && b === 254) return true; // metadata endpoint
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  }
  return false;
}

function validateTarget(raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const t = raw.trim();
  if (!t) return { ok: false, error: "Alvo vazio" };
  let host: string;
  try {
    const withScheme = /^https?:\/\//i.test(t) ? t : `https://${t}`;
    host = new URL(withScheme).hostname;
  } catch {
    return { ok: false, error: `Alvo inválido: ${t}` };
  }
  if (isPrivateHost(host)) return { ok: false, error: `Alvo interno/privado bloqueado: ${host}` };
  return { ok: true, value: t };
}

// Descoberta interna mira justamente faixas privadas (RFC1918) -- aqui o
// requisito se inverte em relação a validateTarget (que bloqueia privado).
// Exportada -- shadowit.functions.ts reaproveita a mesma checagem pro
// próprio disparo de descoberta, em vez de duplicar a lógica.
export function isPrivateCidr(raw: string): boolean {
  const m = raw.trim().match(/^(\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3})\/(\d{1,2})$/);
  if (!m) return false;
  const prefix = Number(m[2]);
  if (prefix < 8 || prefix > 32) return false;
  return isPrivateHost(m[1]);
}

// ── Acesso (para o front decidir exibir o módulo) ─────────────────────────────
export const getDastAccess = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }): Promise<{ allowed: boolean }> => {
    try {
      await assertDastAccess(context.supabase, context.userId);
      return { allowed: true };
    } catch {
      return { allowed: false };
    }
  });

// ── Overview do dashboard ─────────────────────────────────────────────────────
export type DastOverview = {
  totalScans: number;
  bySeverity: { critical: number; high: number; medium: number; low: number; info: number };
  resolved: number;
  series: Array<{ d: string; critical: number; high: number; medium: number }>;
  recent: Array<{
    id: string;
    name: string;
    severity: string | null;
    status: string;
    engine: string | null;
    cvss_score: number | null;
    found_at: string;
  }>;
};

export const getDastOverview = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) => z.object({ days: z.number().int().min(1).max(365).default(30) }).parse(d))
  .handler(async ({ data, context }): Promise<DastOverview> => {
    await assertDastAccess(context.supabase, context.userId);
    const sb = db(context.supabase);
    const since = new Date(Date.now() - data.days * 86400000).toISOString();

    const [{ count: totalScans }, { data: vulns }] = await Promise.all([
      sb.from("dast_scans").select("*", { count: "exact", head: true }).gte("created_at", since),
      sb
        .from("dast_vulnerabilities")
        // "info" é observação/fingerprint, não vulnerabilidade explorável --
        // excluído aqui pra não competir por vaga no corte de "recent" (150)
        // com achados de verdade. Um scan só pode gerar centenas de info
        // (ex.: "User Agent Fuzzer" do ZAP já produziu 1047 num scan real),
        // o suficiente pra lotar sozinho as 150 vagas e sumir com
        // crítico/alto/médio/baixo mais antigos -- o filtro dos KPI cards
        // do Dashboard parecia "não funcionar" quando na real filtrava
        // certo em cima de uma lista que já não tinha mais nada além de info.
        .select("id, name, severity, engine, cvss_score, status, found_at")
        .neq("severity", "info")
        .gte("found_at", since),
    ]);

    const rows = (vulns ?? []) as Array<{
      id: string;
      name: string;
      severity: string | null;
      engine: string | null;
      cvss_score: number | string | null;
      status: string;
      found_at: string;
    }>;

    const bySeverity = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    let resolved = 0;
    const byDay = new Map<string, { critical: number; high: number; medium: number }>();
    for (const r of rows) {
      const sev = (r.severity ?? "info") as keyof typeof bySeverity;
      if (sev in bySeverity) bySeverity[sev] += 1;
      if (r.status === "resolved") resolved += 1;
      const day = r.found_at.slice(0, 10);
      const slot = byDay.get(day) ?? { critical: 0, high: 0, medium: 0 };
      if (sev === "critical" || sev === "high" || sev === "medium") slot[sev] += 1;
      byDay.set(day, slot);
    }
    const series = [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([d, v]) => ({ d: d.slice(8, 10) + "/" + d.slice(5, 7), ...v }));

    // Limite maior que os 10 exibidos por padrão -- dá margem pro filtro
    // por KPI (crítico/alto/médio/baixo/resolvidas) no front sem esconder
    // achados que existem no período mas caíram fora do corte de "recentes".
    const recent = [...rows]
      .sort((a, b) => b.found_at.localeCompare(a.found_at))
      .slice(0, 150)
      .map((r) => ({
        id: r.id,
        name: r.name,
        severity: r.severity,
        status: r.status,
        engine: r.engine,
        cvss_score: r.cvss_score == null ? null : Number(r.cvss_score),
        found_at: r.found_at,
      }));

    return { totalScans: totalScans ?? 0, bySeverity, resolved, series, recent };
  });

// ── Lista de scans ────────────────────────────────────────────────────────────
export const listDastScans = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await assertDastAccess(context.supabase, context.userId);
    const { data } = await db(context.supabase)
      .from("dast_scans")
      .select(
        "id, name, target_url, domain, mode, level, engines, status, progress, error, created_at, started_at, finished_at, auth_status, config",
      )
      .order("created_at", { ascending: false })
      .limit(100);
    return { scans: (data ?? []) as any[] };
  });

// ── Vulnerabilidades de um scan ────────────────────────────────────────────────
export const listDastVulns = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) => z.object({ scanId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertDastAccess(context.supabase, context.userId);
    // "info" fica de fora da navegação (Dashboard/Acompanhamento) por
    // decisão do usuário -- é observação/fingerprint, não vulnerabilidade
    // explorável, e só polui a lista. Continua aparecendo no relatório
    // exportado (exportDastReport tem query própria, não usa esta função).
    const { data: rows } = await db(context.supabase)
      .from("dast_vulnerabilities")
      .select("*")
      .eq("scan_id", data.scanId)
      .neq("severity", "info")
      .order("found_at", { ascending: false });
    return { vulns: (rows ?? []) as any[] };
  });

// ── Domínios de terceiro fora do escopo (analytics/tracking/CDN) ────────────────
// Informativo/reconhecimento -- nunca é vulnerabilidade, ver
// dast_scan_out_of_scope_hosts (migration 20260922140000) e
// extract_out_of_scope_hosts no main.py do scanner.
export const listDastOutOfScopeHosts = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) => z.object({ scanId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertDastAccess(context.supabase, context.userId);
    const { data: rows } = await db(context.supabase)
      .from("dast_scan_out_of_scope_hosts")
      .select("*")
      .eq("scan_id", data.scanId)
      .order("request_count", { ascending: false });
    return { hosts: (rows ?? []) as any[] };
  });

// ── Iniciar scan (fire-and-callback: dispara e não aguarda o scan terminar) ─────
const StartSchema = z.object({
  name: z.string().max(200).optional().nullable(),
  environment: z.enum(["prod", "homolog", "dev", "outro"]).default("outro"),
  // "ativos" = alvos escolhidos a partir da tela Ativos Descobertos --
  // trata igual a "bulk" no FastAPI (lista de targets direta), só muda o
  // rótulo/UI de origem.
  mode: z.enum(["url", "domain", "bulk", "full", "ativos"]).default("url"),
  level: z.enum(["basic", "intermediate", "advanced"]).default("basic"),
  engines: z.array(z.enum(["zap", "nuclei", "amass", "nmap", "nikto"])).min(1),
  targets: z.array(z.string().min(1)).min(1).max(200),
  config: z.record(z.string(), z.any()).optional().nullable(),
  // Antes disso a autenticação era aplicada silenciosamente sempre que
  // existia credencial cadastrada pro domínio (ver getDastAuthCredentialForDomain
  // abaixo) -- sem escolha nenhuma do operador, todo scan de um domínio com
  // credencial virava white box. Default "blackbox": autenticação passa a
  // ser opt-in explícito por scan.
  authMode: z.enum(["blackbox", "whitebox"]).default("blackbox"),
});

export const startDastScan = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) => StartSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertDastAccess(context.supabase, context.userId);

    // Validação de escopo (bloqueio anti-SSRF básico antes de qualquer disparo).
    const validated: string[] = [];
    for (const raw of data.targets) {
      const v = validateTarget(raw);
      if (!v.ok) throw new Error(v.error);
      validated.push(v.value);
    }

    const sb = db(context.supabase);
    const primary = validated[0];
    const domain = (() => {
      try {
        return new URL(/^https?:\/\//i.test(primary) ? primary : `https://${primary}`).hostname;
      } catch {
        return null;
      }
    })();

    // White box exige escolha explícita (authMode) e credencial de verdade
    // cadastrada -- validado ANTES de criar a linha em dast_scans, pra não
    // registrar um scan "error" por engano de formulário (credencial
    // esquecida ou engine ZAP desmarcada, já que é quem aplica a autenticação
    // no motor).
    let auth: Awaited<ReturnType<typeof getDastAuthCredentialForDomain>> = null;
    if (data.authMode === "whitebox") {
      if (!data.engines.includes("zap")) {
        throw new Error("Scan white box exige a engine ZAP habilitada (é quem aplica a autenticação).");
      }
      if (!domain) {
        throw new Error("Não foi possível determinar o domínio do alvo para autenticação.");
      }
      auth = await getDastAuthCredentialForDomain(domain);
      if (!auth) {
        throw new Error(
          `Nenhuma credencial de autenticação cadastrada para "${domain}". Cadastre em "Scan autenticado" antes de rodar white box, ou escolha black box.`,
        );
      }
    }

    // Modo "domain" não roda mais Amass ao vivo (isso virou uma operação de
    // descoberta à parte) -- puxa os subdomínios já catalogados em Ativos
    // Descobertos (scope externo) pra esse domínio. Sem nada catalogado
    // ainda, cai de volta pra escanear só o domínio digitado.
    let targetsToScan = validated;
    let scannerMode: string = data.mode;
    if ((data.mode === "domain" || data.mode === "full") && domain) {
      const { data: catalogRows } = await sb
        .from("dast_recon_subdomains")
        .select("subdomain")
        .eq("scope", "external")
        .ilike("subdomain", `%${domain}`);
      const catalogued = [...new Set<string>((catalogRows ?? []).map((r: any) => r.subdomain as string))];
      if (catalogued.length > 0) {
        targetsToScan = catalogued;
        scannerMode = "bulk"; // pro FastAPI: lista de alvos direta, sem re-derivar domínio
      }
    }

    const { data: inserted, error } = await sb
      .from("dast_scans")
      .insert({
        target_url: primary,
        domain,
        name: data.name?.trim() || primary,
        environment: data.environment,
        mode: data.mode,
        level: data.level,
        engines: data.engines,
        status: "queued",
        started_by: context.userId,
        config: { ...(data.config ?? {}), targets: targetsToScan },
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const scanId = inserted.id as string;

    await logAudit({
      userId: context.userId,
      modulo: "dast-scanner",
      acao: "start_scan",
      descricao: `Iniciou scan DAST em ${targetsToScan.length} alvo(s): ${primary}`,
      status: "success",
      detalhes: { scanId, mode: data.mode, level: data.level, engines: data.engines },
    });

    // Dispara o FastAPI (ACK rápido). O resultado volta pelo webhook dast-callback.
    const creds = await getDastCreds();
    if (!creds) {
      await sb
        .from("dast_scans")
        .update({ status: "error", error: "Scanner não configurado em Integrações." })
        .eq("id", scanId);
      throw new Error("Scanner DAST não configurado (Integrações). Scan registrado, mas não disparado.");
    }
    try {
      // `auth` já validado acima (só não-nulo quando authMode === "whitebox"
      // e a credencial de fato existe pro domínio).
      await scannerFetch(creds, "/scan", {
        scan_id: scanId,
        targets: targetsToScan,
        mode: scannerMode,
        level: data.level,
        engines: data.engines,
        config: data.config ?? {},
        ...(auth
          ? {
              auth_username: auth.username,
              auth_password: auth.password,
              // resolveAuthLoginUrl cobre o caso login_url vazio (raiz do alvo).
              auth_login_url: resolveAuthLoginUrl(auth.loginUrl, targetsToScan[0]),
              auth_logged_in_indicator: auth.loggedInIndicator,
            }
          : {}),
      });
      await sb.from("dast_scans").update({ status: "running", started_at: new Date().toISOString() }).eq("id", scanId);
    } catch (e) {
      await sb
        .from("dast_scans")
        .update({ status: "error", error: (e as Error).message })
        .eq("id", scanId);
      throw new Error(`Scan registrado, mas o motor não respondeu: ${(e as Error).message}`);
    }

    return { ok: true, scanId };
  });

// ── Nova descoberta (Amass externo ou Nmap interno) ────────────────────────────
// Ação separada do "Novo scan" de propósito: o modo "domain" do startDastScan
// já foi redefinido pra puxar do catálogo (não roda Amass ao vivo), então
// reaproveitar esse caminho pra disparar descoberta colidiria com aquela
// lógica. Aqui o FastAPI é chamado direto no mode "domain"+engines=["amass"]
// (externo). A descoberta interna (subnet → Nmap) saiu daqui -- todo host
// achado por ping sweep vai pro Shadow IT (ver 20260828130000/main.py), não
// pra dast_recon_subdomains, então mantê-la aqui só confundia (scan rodava
// dentro do DAST mas o resultado nunca aparecia nele). O gatilho equivalente
// agora é startShadowItDiscovery, em shadowit.functions.ts.
const DiscoverySchema = z.object({
  name: z.string().max(200).optional().nullable(),
  kind: z.literal("external"),
  domain: z.string().max(253),
});

export const startDastDiscovery = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) => DiscoverySchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertDastAccess(context.supabase, context.userId);
    const sb = db(context.supabase);

    const v = validateTarget(data.domain.trim());
    if (!v.ok) throw new Error(v.error);
    let domain: string;
    try {
      domain = new URL(/^https?:\/\//i.test(v.value) ? v.value : `https://${v.value}`).hostname;
    } catch {
      domain = v.value;
    }
    const mode = "domain";
    const engines = ["amass"];

    const { data: inserted, error } = await sb
      .from("dast_scans")
      .insert({
        target_url: domain,
        domain,
        name: data.name?.trim() || `Descoberta externa — ${domain}`,
        environment: "outro",
        mode,
        level: "basic",
        engines,
        status: "queued",
        started_by: context.userId,
        config: {},
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const scanId = inserted.id as string;

    await logAudit({
      userId: context.userId,
      modulo: "dast-scanner",
      acao: "start_discovery",
      descricao: `Iniciou descoberta de ativos externa: ${domain}`,
      status: "success",
      detalhes: { scanId, mode, engines },
    });

    const creds = await getDastCreds();
    if (!creds) {
      await sb
        .from("dast_scans")
        .update({ status: "error", error: "Scanner não configurado em Integrações." })
        .eq("id", scanId);
      throw new Error("Scanner DAST não configurado (Integrações). Descoberta registrada, mas não disparada.");
    }
    try {
      await scannerFetch(creds, "/scan", {
        scan_id: scanId,
        mode,
        engines,
        level: "basic",
        targets: [],
        config: {},
        domain,
      });
      await sb.from("dast_scans").update({ status: "running", started_at: new Date().toISOString() }).eq("id", scanId);
    } catch (e) {
      await sb
        .from("dast_scans")
        .update({ status: "error", error: (e as Error).message })
        .eq("id", scanId);
      throw new Error(`Descoberta registrada, mas o motor não respondeu: ${(e as Error).message}`);
    }

    return { ok: true, scanId };
  });

// ── Descoberta via zona Cloudflare (pull direto, sem FastAPI) ──────────────────
// Pra domínio já gerenciado na conta Cloudflare, a zona é a verdade absoluta --
// mais completa e instantânea que enumeração passiva (Amass depende de rastro
// público como Certificate Transparency, que não existe pra subdomínio nenhum
// aqui porque o certificado é wildcard: confirmado gestaox.bernoulli.com.br
// publicado e ativo, mas ausente do Amass por esse motivo). Não passa pelo
// FastAPI -- é leitura direta da API da Cloudflare, dispara e já volta "done".
const CloudflareDiscoverySchema = z.object({
  name: z.string().max(200).optional().nullable(),
  zoneId: z.string().min(1).max(64),
});

export const startDastDiscoveryFromCloudflare = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) => CloudflareDiscoverySchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertDastAccess(context.supabase, context.userId);
    const sb = db(context.supabase);

    const token = await getCloudflareApiToken();
    if (!token) throw new Error("Integração Cloudflare não está ativa/configurada.");
    const CF = "https://api.cloudflare.com/client/v4";

    const zRes = await fetch(`${CF}/zones/${data.zoneId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!zRes.ok) throw new Error(`Cloudflare API ${zRes.status} ao buscar a zona.`);
    const zJson: any = await zRes.json().catch(() => ({}));
    const zoneName = String(zJson?.result?.name ?? "");
    if (!zoneName) throw new Error("Zona não encontrada.");

    // Só tipos que representam host navegável -- TXT/MX/NS/SRV/CAA não são
    // subdomínio de aplicação, só ruído em "Ativos Descobertos".
    const HOST_TYPES = new Set(["A", "AAAA", "CNAME"]);
    const found: Array<{ subdomain: string; ip: string | null }> = [];
    let page = 1;
    while (true) {
      const params = new URLSearchParams({ per_page: "500", page: String(page) });
      const rRes = await fetch(`${CF}/zones/${data.zoneId}/dns_records?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!rRes.ok) break;
      const rJson: any = await rRes.json().catch(() => ({}));
      const list: any[] = rJson?.result ?? [];
      for (const r of list) {
        const type = String(r.type ?? "");
        if (!HOST_TYPES.has(type)) continue;
        found.push({
          subdomain: String(r.name ?? ""),
          ip: type === "A" || type === "AAAA" ? String(r.content ?? "") || null : null,
        });
      }
      const totalPages = rJson?.result_info?.total_pages ?? 1;
      if (page >= totalPages) break;
      page++;
    }
    if (!found.length) throw new Error(`Nenhum registro A/AAAA/CNAME encontrado na zona ${zoneName}.`);

    const { data: inserted, error } = await sb
      .from("dast_scans")
      .insert({
        target_url: zoneName,
        domain: zoneName,
        name: data.name?.trim() || `Descoberta via Cloudflare — ${zoneName}`,
        environment: "outro",
        mode: "cloudflare_dns",
        level: "basic",
        engines: [],
        status: "done",
        started_by: context.userId,
        started_at: new Date().toISOString(),
        finished_at: new Date().toISOString(),
        progress: 100,
        config: { source: "cloudflare_zone", zone_id: data.zoneId },
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const scanId = inserted.id as string;

    const rows = found.map((f) => ({
      scan_id: scanId,
      subdomain: f.subdomain,
      ip: f.ip,
      scope: "external",
      source: "cloudflare",
    }));
    const { error: upsertError } = await sb.rpc("upsert_dast_recon_subdomains", { p_rows: rows });
    if (upsertError) {
      await sb.from("dast_scans").update({ status: "error", error: upsertError.message }).eq("id", scanId);
      throw new Error(`Descoberta registrada, mas falhou ao gravar os ativos: ${upsertError.message}`);
    }

    await logAudit({
      userId: context.userId,
      modulo: "dast-scanner",
      acao: "start_discovery",
      descricao: `Descoberta via zona Cloudflare (${zoneName}): ${found.length} registro(s)`,
      status: "success",
      detalhes: { scanId, zoneId: data.zoneId, zoneName, count: found.length },
    });

    return { ok: true, scanId, count: found.length };
  });

// ── Descoberta de aplicações internas via zona DNS AD-integrada (LDAP) ──────
// Critério combinado com o usuário: ping sweep (Nmap) acha DISPOSITIVO, isso
// aqui acha APLICAÇÃO (FQDN vaidade tipo gophish.bernoulli.com.br que só
// existe na zona DNS interna do AD -- PTR reverso do IP não tem por que
// bater com esse nome). Fluxo em duas etapas de propósito: listar primeiro
// (nada é gravado), usuário revisa e escolhe quais confirmar -- evita poluir
// Ativos Descobertos com zona antiga/descontinuada/homologação sem decisão
// explícita (a lista real tinha ~170 zonas, várias claramente não-produção).
const SaveAdLdapCredsSchema = z.object({
  username: z.string().min(1).max(200), // formato DOMINIO\usuario
  password: z.string().min(1).max(500),
  dcHost: z.string().min(1).max(253),
});

export const saveDastAdLdapCredential = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) => SaveAdLdapCredsSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertDastAccess(context.supabase, context.userId);
    await saveDastAdLdapCreds(data.username, data.password, data.dcHost);
    await logAudit({
      userId: context.userId,
      modulo: "dast-scanner",
      acao: "save_ad_ldap_credential",
      descricao: `Atualizou a credencial AD/LDAP do DAST (usuário: ${data.username}, DC: ${data.dcHost})`,
      status: "success",
      detalhes: { username: data.username, dcHost: data.dcHost },
    });
    return { ok: true };
  });

// Nunca devolve a senha -- só se está configurada, com qual usuário/DC, pra
// UI mostrar status sem expor o segredo de volta ao browser.
export const getDastAdLdapCredentialStatus = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await assertDastAccess(context.supabase, context.userId);
    const creds = await getDastAdLdapCreds();
    return { configured: !!creds, username: creds?.username ?? null, dcHost: creds?.dcHost ?? null };
  });

// ── Credenciais de scan autenticado (por domínio) ────────────────────────────
export const listDastAuthCredentialsFn = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await assertDastAccess(context.supabase, context.userId);
    return { credentials: await listDastAuthCredentials() };
  });

const SaveAuthCredentialSchema = z.object({
  domain: z.string().min(1).max(253),
  // Opcional: quando vazio, o scan usa a raiz do alvo escaneado como
  // página de login (ver resolveAuthLoginUrl em dast.server.ts) -- só
  // precisa preencher quando o login mora num host diferente do alvo
  // (SSO externo).
  loginUrl: z.union([z.string().url().max(1000), z.literal("")]).optional().nullable(),
  username: z.string().min(1).max(200),
  password: z.string().min(1).max(500),
  loggedInIndicator: z.string().max(500).optional().nullable(),
});

export const saveDastAuthCredentialFn = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) => SaveAuthCredentialSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertDastAccess(context.supabase, context.userId);
    const domain = data.domain.trim().toLowerCase();
    await saveDastAuthCredential({
      domain,
      loginUrl: data.loginUrl?.trim() || null,
      username: data.username.trim(),
      password: data.password,
      loggedInIndicator: data.loggedInIndicator?.trim() || null,
    });
    await logAudit({
      userId: context.userId,
      modulo: "dast-scanner",
      acao: "save_auth_credential",
      descricao: `Cadastrou/atualizou credencial de scan autenticado pro domínio ${domain}`,
      status: "success",
      detalhes: { domain, username: data.username },
    });
    return { ok: true };
  });

export const deleteDastAuthCredentialFn = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertDastAccess(context.supabase, context.userId);
    await deleteDastAuthCredential(data.id);
    await logAudit({
      userId: context.userId,
      modulo: "dast-scanner",
      acao: "delete_auth_credential",
      descricao: `Removeu credencial de scan autenticado ${data.id}`,
      status: "success",
      detalhes: { id: data.id },
    });
    return { ok: true };
  });

// Etapa 1: dispara via fila normal do DAST (igual Amass/Cloudflare) -- fica
// "running" de verdade, aparece em Acompanhamento/Scans de descoberta,
// aceita cancelar/excluir como os demais. Nada é gravado em
// dast_recon_subdomains ainda -- o callback só guarda os candidatos em
// dast_scans.config (ver dast-callback.ts), revisão/confirmação é etapa 2.
export const startInternalAppsDiscovery = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await assertDastAccess(context.supabase, context.userId);
    const sb = db(context.supabase);

    const creds = await getDastAdLdapCreds();
    if (!creds) throw new Error("Credencial AD (LDAP) não configurada.");
    const dastCreds = await getDastCreds();
    if (!dastCreds) throw new Error("Scanner DAST não configurado (Integrações).");

    const { data: inserted, error } = await sb
      .from("dast_scans")
      .insert({
        target_url: creds.dcHost,
        name: "Descoberta de aplicações internas (zona DNS AD)",
        environment: "outro",
        mode: "internal_apps",
        level: "basic",
        engines: [],
        status: "queued",
        started_by: context.userId,
        config: {},
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    const scanId = inserted.id as string;

    await logAudit({
      userId: context.userId,
      modulo: "dast-scanner",
      acao: "start_internal_apps_discovery",
      descricao: `Iniciou descoberta de aplicações internas via zona DNS AD (DC: ${creds.dcHost})`,
      status: "success",
      detalhes: { scanId },
    });

    try {
      await scannerFetch(dastCreds, "/scan", {
        scan_id: scanId,
        mode: "internal_apps",
        engines: [],
        level: "basic",
        targets: [],
        config: {},
        ad_username: creds.username,
        ad_password: creds.password,
        ad_dc_host: creds.dcHost,
      });
      await sb.from("dast_scans").update({ status: "running", started_at: new Date().toISOString() }).eq("id", scanId);
    } catch (e) {
      await sb
        .from("dast_scans")
        .update({ status: "error", error: (e as Error).message })
        .eq("id", scanId);
      throw new Error(`Descoberta registrada, mas o motor não respondeu: ${(e as Error).message}`);
    }

    return { ok: true, scanId };
  });

// Lê o resultado (candidatos) de um scan já concluído -- pra tela de revisão.
export const getInternalAppsCandidates = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) => z.object({ scanId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertDastAccess(context.supabase, context.userId);
    const { data: scan } = await db(context.supabase)
      .from("dast_scans")
      .select("status, error, config")
      .eq("id", data.scanId)
      .maybeSingle();
    if (!scan) throw new Error("Scan não encontrado.");
    const fqdns = (scan.config as { candidate_fqdns?: string[] } | null)?.candidate_fqdns ?? null;
    return { status: scan.status as string, error: scan.error as string | null, fqdns };
  });

// Etapa 2: usuário já revisou e escolheu -- grava só os selecionados,
// atualizando o MESMO scan da etapa 1 (não cria uma segunda linha).
const ConfirmInternalAppsSchema = z.object({
  scanId: z.string().uuid(),
  fqdns: z.array(z.string().min(1).max(253)).min(1).max(1000),
});

export const confirmInternalApps = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) => ConfirmInternalAppsSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertDastAccess(context.supabase, context.userId);
    const sb = db(context.supabase);

    const rows = data.fqdns.map((fqdn) => ({
      scan_id: data.scanId,
      subdomain: fqdn,
      ip: null,
      scope: "internal",
      source: "ad_dns_zone",
    }));
    const { error: upsertError } = await sb.rpc("upsert_dast_recon_subdomains", { p_rows: rows });
    if (upsertError) throw new Error(`Falha ao gravar os ativos: ${upsertError.message}`);

    await sb
      .from("dast_scans")
      .update({ name: `Descoberta de aplicações internas — ${data.fqdns.length} confirmada(s)` })
      .eq("id", data.scanId);

    await logAudit({
      userId: context.userId,
      modulo: "dast-scanner",
      acao: "confirm_internal_apps",
      descricao: `Confirmou ${data.fqdns.length} aplicação(ões) interna(s) via zona DNS AD`,
      status: "success",
      detalhes: { scanId: data.scanId, count: data.fqdns.length },
    });

    return { ok: true, count: data.fqdns.length };
  });

// ── Retest pontual ──────────────────────────────────────────────────────────────
export const retestDastVuln = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) => z.object({ vulnerabilityId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertDastAccess(context.supabase, context.userId);
    const sb = db(context.supabase);
    const { data: v } = await sb
      .from("dast_vulnerabilities")
      .select("id, matched_url, http_method, param, engine, raw_output")
      .eq("id", data.vulnerabilityId)
      .maybeSingle();
    if (!v) throw new Error("Vulnerabilidade não encontrada");

    const creds = await getDastCreds();
    if (!creds) throw new Error("Scanner DAST não configurado (Integrações).");

    const templateId = (v.raw_output as any)?.["template-id"] ?? null;
    // Escopa o retest do ZAP pra so' rodar essa regra especifica (raw_output
    // e' o alerta bruto do ZAP nesse caso, ver normalize_zap no scanner) --
    // sem isso o retest roda a Default Policy inteira (~50 regras) contra a
    // URL, levando minutos por clique em vez de segundos.
    const pluginId = (v.raw_output as any)?.pluginId ?? null;
    let stillVulnerable = false;
    let result: "still_vulnerable" | "resolved" | "error" = "error";
    try {
      const out = await scannerFetch<{ still_vulnerable?: boolean }>(
        creds,
        "/retest",
        {
          vulnerability_id: v.id,
          matched_url: v.matched_url,
          http_method: v.http_method,
          param: v.param,
          engine: v.engine,
          template_id: templateId,
          plugin_id: pluginId,
        },
        // /retest é síncrono (espera o ZAP terminar o active scan pontual
        // de verdade) -- diferente do /scan, que só dá ACK rápido. O
        // padrão de 20s do scannerFetch aborta antes do FastAPI responder
        // (retest_zap faz até 120s de polling + accessUrl + alerts).
        150_000,
      );
      stillVulnerable = out.still_vulnerable === true;
      result = stillVulnerable ? "still_vulnerable" : "resolved";
    } catch (e) {
      await sb.from("dast_retest_history").insert({
        vulnerability_id: v.id,
        result: "error",
        engine: v.engine,
        raw_output: { error: (e as Error).message },
      });
      throw new Error(`Retest falhou: ${(e as Error).message}`);
    }

    await sb.from("dast_retest_history").insert({ vulnerability_id: v.id, result, engine: v.engine });
    if (!stillVulnerable) {
      await sb.from("dast_vulnerabilities").update({ status: "resolved" }).eq("id", v.id);
    }
    return { ok: true, still_vulnerable: stillVulnerable };
  });

// ── Cancelar scan ─────────────────────────────────────────────────────────────
export const cancelDastScan = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) => z.object({ scanId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertDastAccess(context.supabase, context.userId);
    await db(context.supabase)
      .from("dast_scans")
      .update({ status: "cancelled", finished_at: new Date().toISOString() })
      .eq("id", data.scanId)
      .in("status", ["queued", "running"]);
    // Antes disso só mudava o status aqui -- o ZAP continuava rodando o job
    // inteiro sozinho, órfão, sem saber que o app já desistiu dele (mesmo
    // problema de scan órfão que já corrigimos pra trava/erro, aqui por
    // cancelamento manual). Best-effort: se o scanner não responder, o
    // cancelamento no app já aconteceu de qualquer forma (usuário já viu
    // "cancelado" na tela) -- não desfaz por causa disso.
    try {
      const creds = await getDastCreds();
      if (creds) {
        await scannerFetch(creds, "/scan/cancel", { scan_id: data.scanId });
      }
    } catch (e) {
      console.error(`[cancelDastScan] falha ao avisar o scanner (best-effort): ${(e as Error).message}`);
    }
    await logAudit({
      userId: context.userId,
      modulo: "dast-scanner",
      acao: "cancel_scan",
      descricao: `Cancelou o scan DAST ${data.scanId}`,
      status: "success",
      detalhes: { scanId: data.scanId },
    });
    return { ok: true };
  });

// ── Excluir scan (e vulnerabilidades/ativos em cascata) ──────────────────────
export const deleteDastScan = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) => z.object({ scanId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertDastAccess(context.supabase, context.userId);
    const sb = db(context.supabase);
    const { data: scan } = await sb
      .from("dast_scans")
      .select("id, name, target_url, status")
      .eq("id", data.scanId)
      .maybeSingle();
    if (!scan) throw new Error("Scan não encontrado");
    if (scan.status === "queued" || scan.status === "running") {
      throw new Error("Cancele o scan antes de excluir — ele ainda está em andamento.");
    }
    // dast_vulnerabilities e dast_recon_subdomains têm scan_id com ON DELETE
    // CASCADE -- excluir o scan já limpa os achados/ativos associados.
    const { error } = await sb.from("dast_scans").delete().eq("id", data.scanId);
    if (error) throw new Error(error.message);
    await logAudit({
      userId: context.userId,
      modulo: "dast-scanner",
      acao: "delete_scan",
      descricao: `Excluiu o scan DAST "${scan.name ?? scan.target_url ?? data.scanId}" e os achados associados`,
      status: "success",
      detalhes: { scanId: data.scanId },
    });
    return { ok: true };
  });

// ── Alterar status de uma vulnerabilidade ────────────────────────────────────
export const setDastVulnStatus = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) =>
    z
      .object({
        vulnerabilityId: z.string().uuid(),
        status: z.enum(["open", "in_analysis", "resolved", "accepted_risk", "false_positive"]),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertDastAccess(context.supabase, context.userId);
    const { error } = await db(context.supabase)
      .from("dast_vulnerabilities")
      .update({ status: data.status })
      .eq("id", data.vulnerabilityId);
    if (error) throw new Error(error.message);
    await logAudit({
      userId: context.userId,
      modulo: "dast-scanner",
      acao: "set_vuln_status",
      descricao: `Alterou status da vulnerabilidade ${data.vulnerabilityId} para "${data.status}"`,
      status: "success",
      detalhes: { vulnerabilityId: data.vulnerabilityId, status: data.status },
    });
    return { ok: true };
  });

// ── Alertas imediatos (crítico/alto ainda abertos) ────────────────────────────
export const getDastAlerts = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await assertDastAccess(context.supabase, context.userId);
    const since = new Date(Date.now() - 14 * 86400000).toISOString();
    const { data } = await db(context.supabase)
      .from("dast_vulnerabilities")
      .select("id, scan_id, name, severity, engine, cvss_score, matched_url, description, remediation, found_at")
      .eq("should_alert", true)
      .not("status", "in", "(resolved,false_positive)")
      .gte("found_at", since)
      .order("found_at", { ascending: false })
      .limit(50);
    return { alerts: (data ?? []) as any[] };
  });

// ── Ativos descobertos (Amass externo + descoberta de rede/shadow IT) ────────
export const listDastAssets = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) => z.object({ scope: z.enum(["all", "external", "internal"]).default("all") }).parse(d))
  .handler(async ({ data, context }) => {
    await assertDastAccess(context.supabase, context.userId);
    const sb = db(context.supabase);
    let q = sb
      .from("dast_recon_subdomains")
      .select("id, scan_id, subdomain, ip, scope, source, discovered_at")
      .order("discovered_at", { ascending: false })
      .limit(300);
    if (data.scope !== "all") q = q.eq("scope", data.scope);
    const { data: rows } = await q;

    // Match contra o módulo Aplicações -- mesmo critério que Aplicações já usa
    // pra se linkar com Vulnerabilidades (applications.name == fqdn, minúsculo).
    // Aqui é o mesmo nome comparado contra o subdomínio descoberto. Via admin
    // client de propósito: a policy de "applications" não cobre super_admin
    // (só admin/permissão de módulo), e aqui é só leitura de nome pra um
    // badge, não exposição de dado sensível novo.
    const { data: apps } = await supabaseAdmin.from("applications").select("name");
    const appNames = new Set((apps ?? []).map((a: any) => String(a.name).toLowerCase()));

    const assets = (rows ?? []).map((r: any) => ({
      ...r,
      in_applications: appNames.has(String(r.subdomain).toLowerCase()),
    }));
    return { assets };
  });

// ── Excluir ativo descoberto manualmente (ex.: aplicação descontinuada) ──────
export const deleteDastAsset = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) => z.object({ assetId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertDastAccess(context.supabase, context.userId);
    const sb = db(context.supabase);
    const { data: asset } = await sb
      .from("dast_recon_subdomains")
      .select("subdomain")
      .eq("id", data.assetId)
      .maybeSingle();
    const { error } = await sb.from("dast_recon_subdomains").delete().eq("id", data.assetId);
    if (error) throw new Error(error.message);
    await logAudit({
      userId: context.userId,
      modulo: "dast-scanner",
      acao: "delete_asset",
      descricao: `Excluiu o ativo descoberto "${asset?.subdomain ?? data.assetId}"`,
      status: "success",
      detalhes: { assetId: data.assetId },
    });
    return { ok: true };
  });

// ── Histórico de retests de uma vulnerabilidade ──────────────────────────────
export const listDastRetests = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) => z.object({ vulnerabilityId: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertDastAccess(context.supabase, context.userId);
    const { data: rows } = await db(context.supabase)
      .from("dast_retest_history")
      .select("id, result, engine, tested_at")
      .eq("vulnerability_id", data.vulnerabilityId)
      .order("tested_at", { ascending: false })
      .limit(20);
    return { retests: (rows ?? []) as any[] };
  });

// ── Agendamentos (CRUD) ────────────────────────────────────────────────────────
export const listDastSchedules = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await assertDastAccess(context.supabase, context.userId);
    const { data } = await db(context.supabase)
      .from("dast_scan_schedules")
      .select("*")
      .order("next_run_at", { ascending: true });
    return { schedules: (data ?? []) as any[] };
  });

const ScheduleSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  name: z.string().max(200).optional().nullable(),
  target_url: z.string().min(1).max(1000),
  mode: z.enum(["url", "domain", "bulk", "full"]).default("url"),
  level: z.enum(["basic", "intermediate", "advanced"]).default("basic"),
  engines: z.array(z.enum(["zap", "nuclei", "amass", "nmap", "nikto"])).min(1),
  frequency: z.enum(["daily", "weekly", "monthly"]).default("daily"),
  run_at_time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .default("03:00"),
});

export const upsertDastSchedule = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) => ScheduleSchema.parse(d))
  .handler(async ({ data, context }) => {
    await assertDastAccess(context.supabase, context.userId);
    const sb = db(context.supabase);
    let domain: string | null = null;
    try {
      domain = new URL(/^https?:\/\//i.test(data.target_url) ? data.target_url : `https://${data.target_url}`).hostname;
    } catch {
      /* ignore */
    }
    const payload = {
      name: data.name?.trim() || data.target_url,
      target_url: data.target_url.trim(),
      domain,
      mode: data.mode,
      level: data.level,
      engines: data.engines,
      frequency: data.frequency,
      run_at_time: `${data.run_at_time}:00`,
      next_run_at: computeNextRun(data.frequency, data.run_at_time),
    };
    if (data.id) {
      const { error } = await sb.from("dast_scan_schedules").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: ins, error } = await sb
      .from("dast_scan_schedules")
      .insert({ ...payload, active: true })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    await logAudit({
      userId: context.userId,
      modulo: "dast-scanner",
      acao: "create_schedule",
      descricao: `Criou agendamento DAST para ${data.target_url}`,
      status: "success",
      detalhes: { target: data.target_url, frequency: data.frequency },
    });
    return { ok: true, id: ins.id };
  });

export const toggleDastSchedule = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) => z.object({ id: z.string().uuid(), active: z.boolean() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertDastAccess(context.supabase, context.userId);
    const { error } = await db(context.supabase)
      .from("dast_scan_schedules")
      .update({ active: data.active })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteDastSchedule = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertDastAccess(context.supabase, context.userId);
    const { error } = await db(context.supabase).from("dast_scan_schedules").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Exportar relatório (JSON / CSV / HTML) ─────────────────────────────────────
function csvCell(v: unknown): string {
  const s = v == null ? "" : String(v);
  return `"${s.replace(/"/g, '""')}"`;
}

export const exportDastReport = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) => z.object({ scanId: z.string().uuid(), format: z.enum(["json", "csv", "html", "pdf"]) }).parse(d))
  .handler(async ({ data, context }): Promise<{ filename: string; mime: string; content: string }> => {
    await assertDastAccess(context.supabase, context.userId);
    const sb = db(context.supabase);
    const { data: scan } = await sb.from("dast_scans").select("*").eq("id", data.scanId).maybeSingle();
    if (!scan) throw new Error("Scan não encontrado");
    const { data: vulnsRaw } = await sb
      .from("dast_vulnerabilities")
      .select(
        "name, severity, owasp_category, cvss_score, cve_id, engine, confidence, status, matched_url, http_method, param, description, remediation, evidence, attack_payload, business_impact, reference, found_at",
      )
      .eq("scan_id", data.scanId)
      .order("found_at", { ascending: false });
    const vulns = (vulnsRaw ?? []) as any[];
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3, info: 4 };
    vulns.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));
    // Informativo/reconhecimento, não vulnerabilidade -- ver
    // dast_scan_out_of_scope_hosts (migration 20260922140000).
    const { data: outOfScopeRaw } = await sb
      .from("dast_scan_out_of_scope_hosts")
      .select("host, request_count, sample_urls")
      .eq("scan_id", data.scanId)
      .order("request_count", { ascending: false });
    const outOfScopeHosts = (outOfScopeRaw ?? []) as any[];
    const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-");
    const base = `dast-report-${(scan.name ?? scan.domain ?? "scan")
      .toString()
      .replace(/[^a-z0-9]+/gi, "-")
      .slice(0, 40)}-${stamp}`;

    if (data.format === "json") {
      return {
        filename: `${base}.json`,
        mime: "application/json",
        content: JSON.stringify({ scan, vulnerabilities: vulns, out_of_scope_hosts: outOfScopeHosts }, null, 2),
      };
    }

    if (data.format === "pdf") {
      // PDF de verdade (Opção B) -- print-to-PDF do navegador (Opção A)
      // quebrava de forma inconsistente (cabeçalho duplicado/sumindo,
      // páginas com metade em branco) por depender só de CSS de impressão.
      // O scanner (mesma VM que já roda os engines) renderiza o HTML via
      // Chromium headless (Playwright/Page.printToPDF) -- cabeçalho/rodapé
      // repetido de verdade, paginação confiável. Base64 porque server
      // functions do TanStack trafegam como JSON -- o front decodifica antes
      // de baixar (ver ExportButtons/DastScanner.tsx).
      const creds = await getDastCreds();
      if (!creds) throw new Error("Scanner DAST não configurado (Integrações).");
      const coverHtml = buildDastPdfCoverHtml(scan, vulns.length);
      const bodyHtml = buildDastPdfBodyHtml(scan, vulns, outOfScopeHosts);
      const pdfBytes = await renderPdfReport(creds, coverHtml, bodyHtml);
      return {
        filename: `${base}.pdf`,
        mime: "application/pdf",
        content: pdfBytes.toString("base64"),
      };
    }

    const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 } as Record<string, number>;
    for (const v of vulns) if (v.severity in counts) counts[v.severity] += 1;

    const fmtDate = (v: string | null) => (v ? new Date(v).toLocaleString("pt-BR") : "");

    if (data.format === "csv") {
      const cols = [
        "severity",
        "name",
        "owasp_category",
        "cvss_score",
        "cve_id",
        "engine",
        "confidence",
        "status",
        "http_method",
        "matched_url",
        "param",
        "found_at",
      ];
      const lines = [cols.join(",")];
      for (const v of vulns) {
        lines.push(cols.map((c) => csvCell(c === "found_at" ? fmtDate(v.found_at) : v[c])).join(","));
      }
      return { filename: `${base}.csv`, mime: "text/csv", content: lines.join("\r\n") };
    }

    // HTML
    const esc = (s: unknown) =>
      String(s ?? "").replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c] as string);
    const rows = vulns
      .map(
        (v) =>
          `<tr><td class="sev ${esc(v.severity)}">${esc(v.severity)}</td><td>${esc(v.name)}</td><td>${esc(v.owasp_category)}</td><td>${esc(v.cvss_score ?? "")}</td><td>${esc(v.engine)}</td><td>${esc(v.status)}</td><td class="url">${esc(v.matched_url)}</td><td>${esc(fmtDate(v.found_at))}</td></tr>`,
      )
      .join("");
    const content = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório DAST — ${esc(scan.name ?? scan.domain)}</title>
<style>body{font-family:system-ui,Segoe UI,sans-serif;color:#1e293b;margin:32px;} h1{font-size:20px;} .meta{color:#64748b;font-size:13px;margin-bottom:16px;} .sum{display:flex;gap:10px;margin:16px 0;} .card{border:1px solid #e2e8f0;border-radius:8px;padding:10px 14px;font-size:13px;} table{border-collapse:collapse;width:100%;font-size:12px;} th,td{border:1px solid #e2e8f0;padding:6px 8px;text-align:left;} th{background:#f8fafc;} .url{font-family:monospace;font-size:11px;word-break:break-all;} .sev{font-weight:700;text-transform:uppercase;font-size:11px;} .sev.critical{color:#dc2626;} .sev.high{color:#d97706;} .sev.medium{color:#2563eb;} .sev.low{color:#7c3aed;} .sev.info{color:#64748b;}</style></head>
<body><h1>Relatório DAST — ${esc(scan.name ?? scan.domain ?? scan.target_url)}</h1>
<div class="meta">Alvo: ${esc(scan.target_url ?? scan.domain)} · Ambiente: ${esc(scan.environment)} · Nível: ${esc(scan.level)} · Engines: ${esc((scan.engines ?? []).join(", "))} · Gerado em ${new Date().toLocaleString("pt-BR")}</div>
<div class="sum"><div class="card"><b>${vulns.length}</b> achados</div><div class="card" style="color:#dc2626"><b>${counts.critical}</b> críticos</div><div class="card" style="color:#d97706"><b>${counts.high}</b> altos</div><div class="card" style="color:#2563eb"><b>${counts.medium}</b> médios</div><div class="card" style="color:#7c3aed"><b>${counts.low}</b> baixos</div></div>
<table><thead><tr><th>Severidade</th><th>Nome</th><th>OWASP</th><th>CVSS</th><th>Engine</th><th>Status</th><th>URL afetada</th><th>Encontrado em</th></tr></thead><tbody>${rows || '<tr><td colspan="8">Sem achados.</td></tr>'}</tbody></table>
<p style="color:#94a3b8;font-size:11px;margin-top:24px;">${APP_NAME} · DAST Security Scanner · uso interno autorizado.</p></body></html>`;
    return { filename: `${base}.html`, mime: "text/html", content };
  });
