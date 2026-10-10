import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { applyEmailTemplate, getEmailTemplateOverride } from "./email-templates.functions";
import { buildDomainExpiryAlertHtml, expiryRowsTable } from "./email-templates.defaults";
import { appUrlOrNull } from "@/lib/app-url";
import { fetchWithRetry } from "./http-retry";
import { APP_NAME } from "@/lib/brand";
import { sendMail } from "@/lib/mailer.server";

function admin() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type DomainRow = {
  id: string;
  domain_name: string;
  registrar: string;
  created_date: string | null;
  last_changed_date: string | null;
  expiry_date: string | null;
  alert_days: number;
  status: "ativo" | "expirado";
  last_checked_at: string | null;
  last_check_error: string | null;
  last_alert_sent_at: string | null;
  created_at: string;
  updated_at: string;
  daysToExpire: number | null;
};

function computeStatus(expiry: string | null): "ativo" | "expirado" {
  if (!expiry) return "ativo";
  return new Date(expiry).getTime() < Date.now() ? "expirado" : "ativo";
}

function daysToExpire(expiry: string | null): number | null {
  if (!expiry) return null;
  const ms = new Date(expiry).getTime() - Date.now();
  return Math.ceil(ms / 86400000);
}

function shape(row: any): DomainRow {
  return {
    ...row,
    status: computeStatus(row.expiry_date),
    daysToExpire: daysToExpire(row.expiry_date),
  };
}

function normalizeRegistrar(name: string | undefined, domain: string): "godaddy" | "registro_br" | "outro" {
  const n = (name ?? "").toLowerCase();
  if (n.includes("godaddy")) return "godaddy";
  if (n.includes("registro.br") || n.includes("nic.br")) return "registro_br";
  if (domain.toLowerCase().endsWith(".br")) return "registro_br";
  return "outro";
}

// ─── Lookups ──────────────────────────────────────────────────────────────
type RdapResult = { created?: string; expiry?: string; lastChanged?: string; registrar?: string };

// Parser do JSON RDAP (mesmo schema tanto no servidor oficial do registry quanto no rdap.org).
function parseRdapJson(j: any): RdapResult {
  const events: any[] = Array.isArray(j?.events) ? j.events : [];
  const reg = events.find((e) => e.eventAction === "registration");
  const exp = events.find((e) => e.eventAction === "expiration");
  const chg = events.find((e) => e.eventAction === "last changed" || e.eventAction === "last update of RDAP database");
  const entities: any[] = Array.isArray(j?.entities) ? j.entities : [];
  let registrar: string | undefined;
  for (const ent of entities) {
    const roles: string[] = Array.isArray(ent?.roles) ? ent.roles : [];
    if (!roles.includes("registrar")) continue;
    const v = ent?.vcardArray?.[1];
    if (Array.isArray(v)) {
      const fn = v.find((x: any[]) => x?.[0] === "fn");
      if (fn?.[3]) {
        registrar = String(fn[3]);
        break;
      }
    }
    if (typeof ent?.handle === "string") {
      registrar = ent.handle;
      break;
    }
  }
  return {
    created: reg?.eventDate ? new Date(reg.eventDate).toISOString().slice(0, 10) : undefined,
    expiry: exp?.eventDate ? new Date(exp.eventDate).toISOString().slice(0, 10) : undefined,
    lastChanged: chg?.eventDate ? new Date(chg.eventDate).toISOString().slice(0, 10) : undefined,
    registrar,
  };
}

function tldOf(domain: string): string {
  const parts = domain.toLowerCase().split(".");
  return parts[parts.length - 1] ?? "";
}

// Bootstrap RDAP oficial (RFC 7484) — mapeia TLD para servidor(es) RDAP autoritativos do
// registry, evitando depender só do proxy de terceiros rdap.org. Cacheado 24h em memória.
let rdapBootstrapCache: { map: Map<string, string[]>; expiresAt: number } | null = null;

async function getRdapBootstrap(): Promise<Map<string, string[]>> {
  if (rdapBootstrapCache && rdapBootstrapCache.expiresAt > Date.now()) return rdapBootstrapCache.map;
  const map = new Map<string, string[]>();
  try {
    const res = await fetchWithRetry("https://data.iana.org/rdap/dns.json", 10000, undefined, 1);
    if (res.ok) {
      const j: any = await res.json();
      const services: any[] = Array.isArray(j?.services) ? j.services : [];
      for (const svc of services) {
        const tlds: string[] = Array.isArray(svc?.[0]) ? svc[0] : [];
        const urls: string[] = Array.isArray(svc?.[1]) ? svc[1] : [];
        if (tlds.length === 0 || urls.length === 0) continue;
        for (const tld of tlds) map.set(String(tld).toLowerCase(), urls);
      }
    }
  } catch {
    // bootstrap indisponível — segue com map vazio, caller cai pro fallback rdap.org
  }
  rdapBootstrapCache = { map, expiresAt: Date.now() + 24 * 60 * 60 * 1000 };
  return map;
}

// Consulta direta ao servidor RDAP oficial do registry do TLD (fonte primária).
async function lookupRdapDirect(domain: string): Promise<RdapResult> {
  const bootstrap = await getRdapBootstrap();
  const baseUrls = bootstrap.get(tldOf(domain)) ?? [];
  for (const base of baseUrls) {
    try {
      const url = `${base.replace(/\/+$/, "")}/domain/${encodeURIComponent(domain)}`;
      const res = await fetchWithRetry(url, 20000, undefined, 1);
      if (!res.ok) continue;
      const j: any = await res.json();
      const parsed = parseRdapJson(j);
      if (parsed.created || parsed.expiry || parsed.registrar) return parsed;
    } catch {
      continue;
    }
  }
  return {};
}

// Fallback: proxy público rdap.org, usado quando o registry oficial não respondeu.
async function lookupRdapViaProxy(domain: string): Promise<RdapResult> {
  try {
    const res = await fetchWithRetry(`https://rdap.org/domain/${encodeURIComponent(domain)}`, 20000);
    if (!res.ok) return {};
    const j: any = await res.json();
    return parseRdapJson(j);
  } catch {
    return {};
  }
}

async function lookupRdap(domain: string): Promise<RdapResult> {
  const direct = await lookupRdapDirect(domain);
  if (direct.created || direct.expiry || direct.registrar) return direct;
  return lookupRdapViaProxy(domain);
}

async function lookupSsl(domain: string): Promise<{ expiry?: string }> {
  try {
    const res = await fetchWithRetry(`https://ssl-checker.io/api/v1/check/${encodeURIComponent(domain)}`, 20000);
    if (!res.ok) return {};
    const j: any = await res.json();
    const validTill: string | undefined = j?.result?.valid_till ?? j?.valid_till;
    if (!validTill) return {};
    return { expiry: new Date(validTill).toISOString().slice(0, 10) };
  } catch {
    return {};
  }
}

async function revalidate(domain: string): Promise<{
  created_date: string | null;
  expiry_date: string | null;
  last_changed_date: string | null;
  registrar: "godaddy" | "registro_br" | "outro";
  error: string | null;
}> {
  const [rdap, ssl] = await Promise.all([lookupRdap(domain), lookupSsl(domain)]);
  const expiry = rdap.expiry ?? ssl.expiry ?? null;
  const created = rdap.created ?? null;
  const lastChanged = rdap.lastChanged ?? null;
  const registrar = normalizeRegistrar(rdap.registrar, domain);
  if (!expiry && !created) {
    return {
      created_date: null,
      expiry_date: null,
      last_changed_date: null,
      registrar,
      error: "Não foi possível obter dados WHOIS/SSL para este domínio",
    };
  }
  return { created_date: created, expiry_date: expiry, last_changed_date: lastChanged, registrar, error: null };
}

// ─── CRUD + Refresh ────────────────────────────────────────────────────────
export const listDomains = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .handler(async ({ context }): Promise<{ domains: DomainRow[] }> => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("domains")
      .select("*")
      .order("expiry_date", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);
    return { domains: (data ?? []).map(shape) };
  });

export const createDomain = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) =>
    z
      .object({
        domain_name: z
          .string()
          .trim()
          .toLowerCase()
          .min(3)
          .max(253)
          .regex(/^[a-z0-9.-]+\.[a-z]{2,}$/, "Domínio inválido"),
        alert_days: z.number().int().min(1).max(365).default(30),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const refresh = await revalidate(data.domain_name);
    const { data: inserted, error } = await supabase
      .from("domains")
      .insert({
        domain_name: data.domain_name,
        registrar: refresh.registrar,
        alert_days: data.alert_days,
        created_date: refresh.created_date,
        expiry_date: refresh.expiry_date,
        last_changed_date: refresh.last_changed_date,
        last_checked_at: new Date().toISOString(),
        last_check_error: refresh.error,
        created_by: userId,
      } as never)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { domain: shape(inserted) };
  });

export const updateDomain = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        registrar: z.enum(["godaddy", "registro_br", "outro"]).optional(),
        alert_days: z.number().int().min(1).max(365).optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { id, ...rest } = data;
    const payload: Record<string, any> = { ...rest };
    if (typeof rest.alert_days === "number") payload.last_alert_sent_at = null;
    const { error } = await supabase
      .from("domains")
      .update(payload as never)
      .eq("id", id);
    if (error) throw new Error(error.message);
    try {
      await checkExpiringAndNotify();
    } catch (e) {
      console.error("domain notify after update", e);
    }
    return { ok: true };
  });

export const deleteDomain = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase.from("domains").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const refreshDomain = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: row, error: e1 } = await supabase.from("domains").select("*").eq("id", data.id).single();
    if (e1) throw new Error(e1.message);
    const refresh = await revalidate(row.domain_name);
    const payload: Record<string, any> = {
      last_checked_at: new Date().toISOString(),
      last_check_error: refresh.error,
      registrar: refresh.registrar,
    };
    if (refresh.created_date) payload.created_date = refresh.created_date;
    if (refresh.expiry_date) payload.expiry_date = refresh.expiry_date;
    if (refresh.last_changed_date) payload.last_changed_date = refresh.last_changed_date;
    if (refresh.expiry_date) {
      const days = Math.ceil((new Date(refresh.expiry_date).getTime() - Date.now()) / 86400000);
      if (days > (row.alert_days ?? 30)) payload.last_alert_sent_at = null;
    }
    const { data: updated, error } = await supabase
      .from("domains")
      .update(payload as never)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    try {
      await checkExpiringAndNotify();
    } catch (e) {
      console.error("domain notify after refresh", e);
    }
    return { domain: shape(updated) };
  });

export const refreshAllDomains = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.from("domains").select("id, domain_name");
    if (error) throw new Error(error.message);
    const list = rows ?? [];

    // Paralelo com concorrência máxima de 4 — evita rate limit das APIs (mesmo padrão de refreshAllSslCerts)
    const CONCURRENCY = 4;
    let ok = 0,
      fail = 0;

    async function processOne(r: { id: string; domain_name: string }) {
      const refresh = await revalidate(r.domain_name);
      const payload: Record<string, any> = {
        last_checked_at: new Date().toISOString(),
        last_check_error: refresh.error,
        registrar: refresh.registrar,
      };
      if (refresh.created_date) payload.created_date = refresh.created_date;
      if (refresh.expiry_date) payload.expiry_date = refresh.expiry_date;
      if (refresh.last_changed_date) payload.last_changed_date = refresh.last_changed_date;
      const { error: ue } = await supabase
        .from("domains")
        .update(payload as never)
        .eq("id", r.id);
      return !ue && !refresh.error;
    }

    for (let i = 0; i < list.length; i += CONCURRENCY) {
      const batch = list.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(batch.map(processOne));
      for (const res of results) {
        if (res.status === "fulfilled" && res.value) ok++;
        else fail++;
      }
    }
    return { ok, fail, total: list.length };
  });

// ─── Sincroniza zonas Cloudflare como domínios ────────────────────────────
export const syncCloudflareZonesAsDomains = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: zones, error: ze }, { data: existing, error: ee }] = await Promise.all([
      supabase.from("cloudflare_zones").select("name"),
      supabase.from("domains").select("domain_name"),
    ]);
    if (ze) throw new Error(ze.message);
    if (ee) throw new Error(ee.message);
    const have = new Set((existing ?? []).map((r: any) => String(r.domain_name).toLowerCase()));
    const candidates = Array.from(
      new Set(
        (zones ?? [])
          .map((z: any) =>
            String(z.name ?? "")
              .trim()
              .toLowerCase(),
          )
          .filter((n: string) => /^[a-z0-9.-]+\.[a-z]{2,}$/.test(n) && !have.has(n)),
      ),
    );
    let added = 0,
      failed = 0;
    for (const name of candidates) {
      try {
        const refresh = await revalidate(name);
        const { error } = await supabase.from("domains").insert({
          domain_name: name,
          registrar: refresh.registrar,
          alert_days: 30,
          created_date: refresh.created_date,
          expiry_date: refresh.expiry_date,
          last_changed_date: refresh.last_changed_date,
          last_checked_at: new Date().toISOString(),
          last_check_error: refresh.error,
          created_by: userId,
        } as never);
        if (error) failed++;
        else added++;
      } catch {
        failed++;
      }
    }
    return { added, skipped: (zones ?? []).length - candidates.length, failed, total: (zones ?? []).length };
  });

// ─── Notify admins ────────────────────────────────────────────────────────
// Returns the start of "today" in America/Sao_Paulo as a UTC timestamp.
function startOfTodayBRTUtc(): Date {
  const now = new Date();
  // Convert "now" to a Date whose UTC fields represent the BRT wall clock.
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const startBRT = Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate(), 0, 0, 0);
  // Back to real UTC: 00:00 BRT == 03:00 UTC of the same calendar day in BRT.
  return new Date(startBRT + 3 * 60 * 60 * 1000);
}

export async function checkExpiringAndNotify(): Promise<{ notified: number; domains: number }> {
  const sb = admin();

  const { data: rows } = await sb.from("domains").select("*");
  const today = Date.now();
  const startTodayBRT = startOfTodayBRTUtc().getTime();

  // Regra: dispara quando dias <= alert_days e dias >= 0; e só 1x por dia (BRT).
  // Reset acontece em update/refresh quando expiry_date sai da janela.
  const expiring = (rows ?? []).filter((r: any) => {
    if (!r.expiry_date) return false;
    const days = Math.ceil((new Date(r.expiry_date).getTime() - today) / 86400000);
    if (days < 0 || days > (r.alert_days ?? 30)) return false;
    if (!r.last_alert_sent_at) return true;
    return new Date(r.last_alert_sent_at).getTime() < startTodayBRT;
  });

  if (expiring.length === 0) return { notified: 0, domains: 0 };

  // Recipients: global admins + module admins for 'dominios-ssl'
  const [{ data: globalRoles }, { data: modAdmins }] = await Promise.all([
    sb.from("user_roles").select("user_id").eq("role", "admin"),
    sb.from("module_admins").select("user_id").eq("module_slug", "dominios-ssl"),
  ]);
  const ids = new Set<string>([
    ...((globalRoles ?? []) as any[]).map((r) => r.user_id),
    ...((modAdmins ?? []) as any[]).map((r) => r.user_id),
  ]);
  const { data: profiles } =
    ids.size > 0
      ? await sb
          .from("profiles")
          .select("email")
          .in("id", [...ids])
      : { data: [] as any[] };
  const { getDepartmentEmailsForScope } = await import("./alerts-recipients.functions");
  const deptEmails = await getDepartmentEmailsForScope("domains");
  const adminEmails = ((profiles ?? []) as any[])
    .map((p) =>
      String(p.email ?? "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
  const emails = Array.from(new Set([...adminEmails, ...deptEmails]));
  if (emails.length === 0) return { notified: 0, domains: expiring.length };

  const { data: cfg } = await sb.from("smtp_config").select("*").limit(1).maybeSingle();
  if (!cfg?.host) return { notified: 0, domains: expiring.length };
  const password = (cfg as any).password || process.env.SMTP_PASSWORD;
  if (!password) return { notified: 0, domains: expiring.length };

  const subject = `${APP_NAME} · ${expiring.length} domínio(s) próximo(s) do vencimento`;
  // Mais urgente primeiro
  const expiryRows = expiring
    .map((r: any) => ({
      nome: String(r.domain_name ?? ""),
      segundo: String(r.registrar ?? "—"),
      vencimento: String(r.expiry_date ?? ""),
      dias: Math.ceil((new Date(r.expiry_date).getTime() - today) / 86400000),
    }))
    .sort((x, y) => x.dias - y.dias);
  const tabela = expiryRowsTable("Domínio", "Registrador", expiryRows);
  const base = appUrlOrNull();
  const defaultHtml = buildDomainExpiryAlertHtml(tabela, {
    quantidade: expiryRows.length,
    maisUrgente: expiryRows[0] ? { nome: expiryRows[0].nome, dias: expiryRows[0].dias } : undefined,
    link: base ? `${base}/app/dominios-ssl` : undefined,
  });
  const override = await getEmailTemplateOverride(sb, "domain_expiry_alert");
  const html = applyEmailTemplate(
    "domain_expiry_alert",
    override,
    { quantidade: String(expiring.length), tabela },
    defaultHtml,
  );

  let notified = 0;
  for (const to of emails) {
    try {
      const out: any = await sendMail({
          host: cfg.host,
          port: cfg.port || 587,
          secure: !!cfg.secure,
          username: cfg.username || null,
          password,
          from: { name: cfg.from_name || APP_NAME, email: cfg.from_email },
          to,
          subject,
          html,
        });
      await sb.from("email_logs").insert({
        to_email: to,
        subject,
        template: "domain_expiry_alert",
        status: out.ok ? "success" : "error",
        error_message: out.ok ? null : String(out.error ?? "falha no envio"),
      });
      if (out.ok) notified++;
    } catch (e: any) {
      await sb.from("email_logs").insert({
        to_email: to,
        subject,
        template: "domain_expiry_alert",
        status: "error",
        error_message: String(e?.message ?? e),
      });
    }
  }

  await sb
    .from("domains")
    .update({ last_alert_sent_at: new Date().toISOString() })
    .in(
      "id",
      expiring.map((r: any) => r.id),
    );

  return { notified, domains: expiring.length };
}
