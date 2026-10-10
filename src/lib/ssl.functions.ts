import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { requirePermission } from "@/lib/authz";
import { applyEmailTemplate, getEmailTemplateOverride, escapeHtml } from "./email-templates.functions";
import { buildSslExpiryAlertHtml } from "./email-templates.defaults";
import { fetchWithTimeout, fetchWithRetry } from "./http-retry";
import { APP_NAME } from "@/lib/brand";
import { sendMail } from "@/lib/mailer.server";
import { readSecret } from "@/lib/crypto.server";

function admin() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type SslRow = {
  id: string;
  domain_name: string;
  issuer: string;
  valid_from: string | null;
  valid_to: string | null;
  alert_days: number;
  status: "ativo" | "expirado";
  last_checked_at: string | null;
  last_check_error: string | null;
  last_alert_sent_at: string | null;
  created_at: string;
  updated_at: string;
  daysToExpire: number | null;
  source: string | null;
  fingerprint_sha256: string | null;
  serial_number: string | null;
  subject_alt_names: string[] | null;
  notes: string | null;
  bindings_count: number;
  // imported = arquivo (URLs manuais); cloudflare = servido pela borda da
  // Cloudflare nos hosts proxyados (URLs automáticas); public = verificação
  // pública fora da Cloudflare ou sem proxy (URLs manuais).
  sync_kind: "imported" | "cloudflare" | "public";
};

export type SslEdgeHost = { name: string; type: string; covered: boolean };
export type SslEdgeInfo = { zone: string; hosts: SslEdgeHost[] };

export type SslBinding = { id: string; url: string; description: string | null; created_at: string };
export type SslHistoryEntry = {
  id: string;
  issuer: string | null;
  valid_from: string | null;
  valid_to: string | null;
  fingerprint_sha256: string | null;
  serial_number: string | null;
  replaced_at: string;
  replaced_by_name: string | null;
};

function computeStatus(expiry: string | null): "ativo" | "expirado" {
  if (!expiry) return "ativo";
  return new Date(expiry).getTime() < Date.now() ? "expirado" : "ativo";
}
function daysToExpire(expiry: string | null): number | null {
  if (!expiry) return null;
  return Math.ceil((new Date(expiry).getTime() - Date.now()) / 86400000);
}
function shape(row: any, bindingsCount = 0, edge: SslEdgeInfo | null = null): SslRow {
  return {
    ...row,
    status: computeStatus(row.valid_to),
    daysToExpire: daysToExpire(row.valid_to),
    bindings_count: bindingsCount,
    sync_kind: row.source === "imported" ? "imported" : edge ? "cloudflare" : "public",
  };
}

// ─── Borda Cloudflare: hosts proxyados que recebem o certificado da zona ────
// O Universal SSL só é servido nos registros proxyados (nuvem laranja); os
// DNS-only recebem o certificado do servidor de origem. Lido de
// cloudflare_dns_records (sincronizado), por isso não precisa de URL manual.
type CfEdgeData = { zones: Array<{ id: string; name: string }>; proxied: Map<string, Array<{ name: string; type: string }>> };

async function loadCfEdgeData(): Promise<CfEdgeData> {
  const sb = supabaseAdmin as any;
  const [{ data: zones }, { data: recs }] = await Promise.all([
    sb.from("cloudflare_zones").select("id, name"),
    sb
      .from("cloudflare_dns_records")
      .select("zone_id, name, type")
      .eq("proxied", true)
      .in("type", ["A", "AAAA", "CNAME"])
      .limit(5000),
  ]);
  const proxied = new Map<string, Array<{ name: string; type: string }>>();
  for (const r of (recs ?? []) as any[]) {
    const list = proxied.get(r.zone_id) ?? [];
    list.push({ name: String(r.name).toLowerCase(), type: r.type });
    proxied.set(r.zone_id, list);
  }
  return {
    zones: ((zones ?? []) as any[]).map((z) => ({ id: z.id, name: String(z.name).toLowerCase() })),
    proxied,
  };
}

function edgeFor(domain: string, cf: CfEdgeData): SslEdgeInfo | null {
  const d = domain.toLowerCase();
  const zone = cf.zones
    .filter((z) => d === z.name || d.endsWith(`.${z.name}`))
    .sort((a, b) => b.name.length - a.name.length)[0];
  if (!zone) return null;
  const hosts = (cf.proxied.get(zone.id) ?? [])
    .filter((h) => h.name === d || h.name.endsWith(`.${d}`))
    .map((h) => {
      // Universal SSL cobre a raiz da zona + *.zona (um nível só).
      const prefix = h.name === zone.name ? "" : h.name.slice(0, -(zone.name.length + 1));
      return { name: h.name, type: h.type, covered: !prefix.includes(".") };
    })
    .sort((a, b) => Number(a.covered) - Number(b.covered) || a.name.localeCompare(b.name));
  return hosts.length > 0 ? { zone: zone.name, hosts } : null;
}

// Converte um timestamp UTC (com hora) para a data calendário em horário de Brasília (UTC-3).
// Necessário porque expirações próximas da meia-noite UTC caem no dia seguinte em UTC
// mas ainda no dia anterior em BRT — o que é o que a Cloudflare e checkers externos mostram.
function toBrtDateString(iso: string | number | Date): string {
  const brt = new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000);
  return brt.toISOString().slice(0, 10);
}

// Busca certificado ativo via conexão TLS direta (node:tls)
// Busca token da Cloudflare da tabela integrations
async function getCfToken(): Promise<string | null> {
  try {
    const { data } = await supabaseAdmin
      .from("integrations")
      .select("api_key, enabled")
      .eq("provider", "cloudflare")
      .maybeSingle();
    if (!data?.enabled || !data.api_key) return null;
    return readSecret(data.api_key);
  } catch {
    return null;
  }
}

// Busca zone_id de um domínio via API Cloudflare
async function getCfZoneId(domain: string, token: string): Promise<string | null> {
  // Tenta o domínio e também o root domain (ex: sub.exemplo.com.br → exemplo.com.br)
  const parts = domain.split(".");
  const candidates: string[] = [domain];
  // Para domínios .com.br, .org.br etc — root é as últimas 3 partes
  if (parts.length > 3 && parts[parts.length - 2].length <= 3) {
    candidates.push(parts.slice(-3).join("."));
  } else if (parts.length > 2) {
    candidates.push(parts.slice(-2).join("."));
  }
  const headers = { Authorization: `Bearer ${token}` };
  for (const candidate of candidates) {
    try {
      const res = await fetchWithTimeout(
        `https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(candidate)}&status=active`,
        8000,
        headers,
      );
      if (!res.ok) continue;
      const j: any = await res.json();
      const id = j?.result?.[0]?.id ?? null;
      if (id) return id;
    } catch {
      continue;
    }
  }
  return null;
}

async function lookupSslCert(
  domain: string,
): Promise<{ valid_from?: string; valid_to?: string; issuer?: string; error?: string }> {
  const d = domain
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/^www\./, "")
    .split("/")[0]
    .split("?")[0];

  // Helper: busca certificado na CF API
  async function tryCfApi(): Promise<{ valid_from?: string; valid_to?: string; issuer?: string } | null> {
    try {
      const cfToken = await getCfToken();
      if (!cfToken) return null;
      const zoneId = await getCfZoneId(d, cfToken);
      if (!zoneId) return null;
      const res = await fetchWithTimeout(
        `https://api.cloudflare.com/client/v4/zones/${zoneId}/ssl/certificate_packs?status=all`,
        10000,
        { Authorization: `Bearer ${cfToken}` },
      );
      if (!res.ok) return null;
      const j: any = await res.json();
      const packs: any[] = j?.result ?? [];
      const pack =
        packs
          .filter((p) => p.status === "active" || p.type === "universal")
          .sort((a, b) => new Date(b.uploaded_on ?? 0).getTime() - new Date(a.uploaded_on ?? 0).getTime())[0] ??
        packs[0];
      const cert = pack?.certificates?.[0];
      // expires_on só existe no nível do certificado individual (pack não tem esse campo)
      const expiresOn = cert?.expires_on ?? pack?.expires_on;
      if (!expiresOn) return null;
      const issuerRaw = cert?.issuer ?? pack?.issuer;
      const issuer = typeof issuerRaw === "string" ? issuerRaw : (issuerRaw?.o ?? issuerRaw?.cn ?? undefined);
      return {
        valid_from: cert?.issued_on ? toBrtDateString(cert.issued_on) : undefined,
        valid_to: toBrtDateString(expiresOn),
        issuer,
      };
    } catch {
      return null;
    }
  }

  // Fonte 1: ssl-checker.io
  try {
    let res = await fetchWithRetry(`https://ssl-checker.io/api/v1/check/${encodeURIComponent(d)}`, 20000);
    if (!res.ok) {
      // ssl-checker.io falhou (rate limit/instabilidade) — tenta fallback via API Cloudflare antes de desistir
      const cf = await tryCfApi();
      if (cf?.valid_to) return cf;
      return { error: `Certificado SSL não configurado para "${d}". Não foi possível validar o domínio.` };
    }

    let j: any = await res.json();
    let r = j?.result ?? j;

    // Se falhou por TLS, tenta com porta explícita
    if (r?.response === "failed" && typeof r?.reason === "string" && r.reason.includes("tls")) {
      try {
        const res2 = await fetchWithTimeout(`https://ssl-checker.io/api/v1/check/${encodeURIComponent(d)}?port=443`);
        if (res2.ok) {
          const j2: any = await res2.json();
          const r2 = j2?.result ?? j2;
          if (r2?.response !== "failed") r = r2;
        }
      } catch {
        /* mantém r original */
      }
    }

    const validTill: string | undefined =
      r?.valid_till ??
      r?.validTill ??
      r?.valid_to ??
      r?.validTo ??
      r?.expires ??
      r?.expiry ??
      r?.not_after ??
      r?.notAfter ??
      r?.host?.valid_till ??
      r?.host?.valid_to ??
      r?.host?.expires;

    if (!validTill) {
      // Sem dados do ssl-checker — tenta CF API
      const cf = await tryCfApi();
      if (cf?.valid_to) return cf;
      return { error: `Certificado SSL não encontrado para "${d}". Verifique se o domínio possui HTTPS ativo.` };
    }

    const validFrom: string | undefined = r?.valid_from ?? r?.validFrom ?? r?.not_before ?? r?.notBefore;
    const issuer: string | undefined =
      r?.issuer_o ?? r?.issuer_cn ?? r?.issuer ?? r?.issuerOrganization ?? r?.issuerCommonName;

    return {
      valid_from: validFrom ? toBrtDateString(validFrom) : undefined,
      valid_to: toBrtDateString(validTill),
      issuer: issuer ?? undefined,
    };
  } catch (e: any) {
    // Timeout ou erro de rede — tenta CF API
    const cf = await tryCfApi();
    if (cf?.valid_to) return cf;
    return { error: `Certificado SSL não configurado para "${d}". Erro: ${e?.message ?? e}` };
  }
}

export const listSslCerts = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .handler(async ({ context }): Promise<{ certs: SslRow[] }> => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("ssl_certificates")
      .select("*")
      .order("valid_to", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);
    // Contagem de URLs vinculadas -- best-effort: se a migration das bindings
    // ainda não foi aplicada, a lista continua funcionando com contagem 0.
    const counts = new Map<string, number>();
    const { data: bindings } = await (supabase as any).from("ssl_certificate_bindings").select("certificate_id");
    for (const b of (bindings ?? []) as any[]) counts.set(b.certificate_id, (counts.get(b.certificate_id) ?? 0) + 1);
    const cf = await loadCfEdgeData();
    return {
      certs: (data ?? []).map((r: any) => {
        const edge = r.source === "imported" ? null : edgeFor(r.domain_name, cf);
        return shape(r, edge ? edge.hosts.length : (counts.get(r.id) ?? 0), edge);
      }),
    };
  });

export const createSslCert = createServerFn({ method: "POST" })
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
    const r = await lookupSslCert(data.domain_name);
    const { data: inserted, error } = await supabase
      .from("ssl_certificates")
      .insert({
        domain_name: data.domain_name,
        issuer: r.issuer ?? "desconhecido",
        valid_from: r.valid_from ?? null,
        valid_to: r.valid_to ?? null,
        alert_days: data.alert_days,
        last_checked_at: new Date().toISOString(),
        last_check_error: r.error ?? null,
        created_by: userId,
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { cert: shape(inserted) };
  });

export const updateSslCert = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        alert_days: z.number().int().min(1).max(365).optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await requirePermission(context.supabase, context.userId, "dominios-ssl", "edit");
    const sb = admin(); // usa admin para garantir permissão total incluindo last_alert_sent_at
    const { id, ...rest } = data;
    const payload: Record<string, any> = { ...rest };
    // Reset last_alert_sent_at para o novo threshold ser avaliado imediatamente
    if (typeof rest.alert_days === "number") payload.last_alert_sent_at = null;
    const { error } = await sb
      .from("ssl_certificates")
      .update(payload as never)
      .eq("id", id);
    if (error) throw new Error(error.message);

    // Se alert_days mudou, verifica se este cert está no prazo e envia alerta
    if (typeof rest.alert_days === "number") {
      const { data: row } = await sb.from("ssl_certificates").select("*").eq("id", id).single();
      if (row?.valid_to) {
        const days = daysUntilExpiry(row.valid_to);
        if (days <= rest.alert_days) {
          // Aguarda o envio para garantir que não é silenciado
          await checkExpiringSslAndNotify();
        }
      }
    }
    return { ok: true };
  });

export const deleteSslCert = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase.from("ssl_certificates").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const refreshSslCert = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { data: row, error: e1 } = await supabase.from("ssl_certificates").select("*").eq("id", data.id).single();
    if (e1) throw new Error(e1.message);
    // Não revalida certificados importados via PEM/CRT — mantém dados originais
    if ((row as any).source === "imported") {
      return {
        cert: shape(row),
        skipped: true,
        reason: "Certificado importado manualmente — não revalidado automaticamente.",
      };
    }
    const r = await lookupSslCert(row.domain_name);
    const payload: Record<string, any> = {
      last_checked_at: new Date().toISOString(),
      last_check_error: r.error ?? null,
    };
    if (r.valid_from) payload.valid_from = r.valid_from;
    if (r.valid_to) payload.valid_to = r.valid_to;
    if (r.issuer) payload.issuer = r.issuer;
    if (r.valid_to) {
      const days = Math.ceil((new Date(r.valid_to).getTime() - Date.now()) / 86400000);
      if (days > (row.alert_days ?? 30)) payload.last_alert_sent_at = null;
    }
    const { data: updated, error } = await supabase
      .from("ssl_certificates")
      .update(payload as never)
      .eq("id", data.id)
      .select("*")
      .single();
    if (error) throw new Error(error.message);
    return { cert: shape(updated) };
  });

export const refreshAllSslCerts = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data: rows, error } = await supabase.from("ssl_certificates").select("id, domain_name, source");
    if (error) throw new Error(error.message);
    const list = rows ?? [];

    // Paralelo com concorrência máxima de 4 — evita rate limit das APIs
    const CONCURRENCY = 4;
    let ok = 0,
      fail = 0;

    async function processOne(r: { id: string; domain_name: string; source: string | null }) {
      // Não revalida certificados importados
      if (r.source === "imported") return true; // pula importados
      const c = await lookupSslCert(r.domain_name);
      const payload: Record<string, any> = {
        last_checked_at: new Date().toISOString(),
        last_check_error: c.error ?? null,
      };
      if (c.valid_from) payload.valid_from = c.valid_from;
      if (c.valid_to) payload.valid_to = c.valid_to;
      if (c.issuer) payload.issuer = c.issuer;
      const { error: ue } = await supabase
        .from("ssl_certificates")
        .update(payload as never)
        .eq("id", r.id);
      return !ue && !c.error;
    }

    // Executa em lotes de CONCURRENCY
    for (let i = 0; i < list.length; i += CONCURRENCY) {
      const batch = list.slice(i, i + CONCURRENCY);
      const results = await Promise.allSettled(batch.map(processOne));
      for (const r of results) {
        if (r.status === "fulfilled" && r.value) ok++;
        else fail++;
      }
    }

    // Dispara verificação de alerta após atualizar todos
    checkExpiringSslAndNotify().catch(() => {});
    return { ok, fail, total: list.length };
  });

export const importSslCert = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) =>
    z
      .object({
        pem: z.string().min(50).max(50_000),
        alert_days: z.number().int().min(1).max(365).default(30),
        // true = usuário já viu que existe importado pro mesmo domínio e
        // escolheu adicionar como certificado separado (não é renovação).
        force_new: z.boolean().optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { parseCertificate } = await import("./ssl-parse.server");
    const { supabase, userId } = context;
    const parsed = parseCertificate(data.pem);

    const { data: existing } = await (supabase as any)
      .from("ssl_certificates")
      .select("id, domain_name, issuer, valid_from, valid_to, source, fingerprint_sha256")
      .eq("domain_name", parsed.domain_name);
    const rows = (existing ?? []) as any[];

    // Mesmo certificado (fingerprint) → duplicata exata. Linhas antigas sem
    // fingerprint caem no critério legado de emissor + validade.
    const exactMatch = rows.find(
      (e) =>
        e.fingerprint_sha256 === parsed.fingerprint_sha256 ||
        (!e.fingerprint_sha256 && e.issuer === parsed.issuer && e.valid_to === parsed.valid_to),
    );
    if (exactMatch) {
      throw new Error(`Este certificado já está cadastrado para "${parsed.domain_name}".`);
    }

    // Já existe importado pro mesmo domínio → devolve a decisão pro usuário
    // (renovar um deles ou adicionar como outro) em vez de duplicar em silêncio.
    const importedSameDomain = rows.filter((e) => e.source === "imported");
    if (importedSameDomain.length > 0 && !data.force_new) {
      return {
        needsDecision: true as const,
        parsed: {
          domain_name: parsed.domain_name,
          issuer: parsed.issuer,
          valid_from: parsed.valid_from,
          valid_to: parsed.valid_to,
        },
        candidates: importedSameDomain.map((e) => ({
          id: e.id as string,
          issuer: e.issuer as string,
          valid_from: e.valid_from as string | null,
          valid_to: e.valid_to as string | null,
        })),
      };
    }

    const { data: inserted, error } = await (supabase as any)
      .from("ssl_certificates")
      .insert({
        domain_name: parsed.domain_name,
        issuer: parsed.issuer,
        valid_from: parsed.valid_from,
        valid_to: parsed.valid_to,
        fingerprint_sha256: parsed.fingerprint_sha256,
        serial_number: parsed.serial_number,
        subject_alt_names: parsed.subject_alt_names,
        alert_days: data.alert_days,
        last_checked_at: new Date().toISOString(),
        last_check_error: null,
        created_by: userId,
        source: "imported",
      })
      .select("*")
      .single();
    if (error) throw new Error(error.message);

    return { needsDecision: false as const, cert: shape(inserted) };
  });

// ─── Renovação: substitui o certificado importado no MESMO registro ─────────
// Preserva id, alert_days, observações e URLs vinculadas; a versão anterior
// vai pra ssl_certificate_history. Antes a renovação era "importar de novo",
// que criava uma segunda linha e deixava a antiga alertando todo dia.
export const renewSslCert = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        pem: z.string().min(50).max(50_000),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await requirePermission(context.supabase, context.userId, "dominios-ssl", "edit");
    const { parseCertificate } = await import("./ssl-parse.server");
    const { logAudit } = await import("./audit-log.functions");
    const sb = admin() as any;
    const parsed = parseCertificate(data.pem);

    const { data: row, error: e1 } = await sb.from("ssl_certificates").select("*").eq("id", data.id).maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!row) throw new Error("Certificado não encontrado.");
    if (row.source !== "imported") {
      throw new Error("Só certificados importados podem ser renovados por arquivo — os demais são revalidados automaticamente.");
    }
    if (parsed.domain_name !== row.domain_name) {
      throw new Error(
        `O arquivo enviado é de "${parsed.domain_name}", mas este registro é de "${row.domain_name}".`,
      );
    }
    if (row.fingerprint_sha256 && row.fingerprint_sha256 === parsed.fingerprint_sha256) {
      throw new Error("O arquivo enviado é o mesmo certificado já cadastrado.");
    }
    if (row.valid_to && parsed.valid_to < row.valid_to) {
      throw new Error(
        `O certificado enviado vence em ${parsed.valid_to}, antes do atual (${row.valid_to}). Renovação cancelada.`,
      );
    }
    const { data: other } = await sb
      .from("ssl_certificates")
      .select("id")
      .eq("fingerprint_sha256", parsed.fingerprint_sha256)
      .neq("id", row.id)
      .maybeSingle();
    if (other) throw new Error("Este certificado já está cadastrado em outro registro.");

    const { data: hist, error: he } = await sb
      .from("ssl_certificate_history")
      .insert({
        certificate_id: row.id,
        issuer: row.issuer,
        valid_from: row.valid_from,
        valid_to: row.valid_to,
        fingerprint_sha256: row.fingerprint_sha256,
        serial_number: row.serial_number,
        subject_alt_names: row.subject_alt_names,
        replaced_by: context.userId,
      })
      .select("id")
      .single();
    if (he) throw new Error(`Falha ao gravar histórico: ${he.message}`);

    const { data: updated, error: ue } = await sb
      .from("ssl_certificates")
      .update({
        issuer: parsed.issuer,
        valid_from: parsed.valid_from,
        valid_to: parsed.valid_to,
        fingerprint_sha256: parsed.fingerprint_sha256,
        serial_number: parsed.serial_number,
        subject_alt_names: parsed.subject_alt_names,
        last_checked_at: new Date().toISOString(),
        last_check_error: null,
        last_alert_sent_at: null,
      })
      .eq("id", row.id)
      .select("*")
      .single();
    if (ue) {
      // Não deixa histórico órfão de uma renovação que não aconteceu.
      await sb.from("ssl_certificate_history").delete().eq("id", hist.id);
      throw new Error(ue.message);
    }

    const { data: bindings } = await sb.from("ssl_certificate_bindings").select("url").eq("certificate_id", row.id);
    const urls = ((bindings ?? []) as any[]).map((b) => String(b.url));

    await logAudit({
      userId: context.userId,
      modulo: "dominios-ssl",
      acao: "renovar_certificado",
      descricao: `Certificado de ${row.domain_name} renovado (vencia ${row.valid_to ?? "—"}, agora vence ${parsed.valid_to})`,
      detalhes: {
        certificate_id: row.id,
        antes: { issuer: row.issuer, valid_to: row.valid_to, fingerprint_sha256: row.fingerprint_sha256 },
        depois: {
          issuer: parsed.issuer,
          valid_to: parsed.valid_to,
          fingerprint_sha256: parsed.fingerprint_sha256,
        },
        urls_vinculadas: urls,
      },
    });
    const { notifySslCertRenewed } = await import("./ssl-notifications.server");
    await notifySslCertRenewed({
      domain: row.domain_name,
      previous: { issuer: row.issuer, valid_to: row.valid_to },
      current: {
        issuer: parsed.issuer,
        valid_to: parsed.valid_to,
        fingerprint_sha256: parsed.fingerprint_sha256,
      },
      bindings: urls,
      actorUserId: context.userId,
    });

    return { cert: shape(updated, urls.length) };
  });

// ─── Detalhe (aba lateral): certificado + URLs vinculadas + histórico ───────
export const getSslCertDetails = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(
    async ({
      context,
      data,
    }): Promise<{ cert: SslRow; bindings: SslBinding[]; history: SslHistoryEntry[]; edge: SslEdgeInfo | null }> => {
      const sb = context.supabase as any;
      const [{ data: row, error }, { data: bindings }, { data: history }] = await Promise.all([
        sb.from("ssl_certificates").select("*").eq("id", data.id).single(),
        sb
          .from("ssl_certificate_bindings")
          .select("id, url, description, created_at")
          .eq("certificate_id", data.id)
          .order("created_at", { ascending: true }),
        sb
          .from("ssl_certificate_history")
          .select("id, issuer, valid_from, valid_to, fingerprint_sha256, serial_number, replaced_at, replaced_by")
          .eq("certificate_id", data.id)
          .order("replaced_at", { ascending: false }),
      ]);
      if (error) throw new Error(error.message);

      const actorIds = Array.from(
        new Set(((history ?? []) as any[]).map((h) => h.replaced_by).filter(Boolean)),
      ) as string[];
      const names = new Map<string, string>();
      if (actorIds.length > 0) {
        const { data: profiles } = await supabaseAdmin
          .from("profiles")
          .select("id, email, full_name")
          .in("id", actorIds);
        for (const p of (profiles ?? []) as any[]) names.set(p.id, p.full_name || p.email);
      }

      const edge = row.source === "imported" ? null : edgeFor(row.domain_name, await loadCfEdgeData());
      return {
        edge,
        cert: shape(row, edge ? edge.hosts.length : (bindings ?? []).length, edge),
        bindings: (bindings ?? []) as SslBinding[],
        history: ((history ?? []) as any[]).map((h) => ({
          id: h.id,
          issuer: h.issuer,
          valid_from: h.valid_from,
          valid_to: h.valid_to,
          fingerprint_sha256: h.fingerprint_sha256,
          serial_number: h.serial_number,
          replaced_at: h.replaced_at,
          replaced_by_name: h.replaced_by ? (names.get(h.replaced_by) ?? null) : null,
        })),
      };
    },
  );

// ─── Edição manual: observações + URLs vinculadas (substitui a lista) ───────
export const updateSslCertMeta = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        notes: z.string().max(5000).nullable(),
        bindings: z
          .array(
            z.object({
              url: z.string().trim().min(1, "URL vazia").max(500),
              description: z.string().trim().max(300).nullable().optional(),
            }),
          )
          .max(200),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    await requirePermission(context.supabase, context.userId, "dominios-ssl", "edit");
    const { logAudit } = await import("./audit-log.functions");
    const sb = admin() as any;

    const { data: row, error: e1 } = await sb
      .from("ssl_certificates")
      .select("id, domain_name, notes, source")
      .eq("id", data.id)
      .maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!row) throw new Error("Certificado não encontrado.");
    if (row.source !== "imported" && data.bindings.length > 0 && edgeFor(row.domain_name, await loadCfEdgeData())) {
      throw new Error(
        "Este certificado é servido pela borda da Cloudflare — as URLs vêm dos registros proxyados da zona e não são cadastradas manualmente.",
      );
    }
    const { data: before } = await sb.from("ssl_certificate_bindings").select("url").eq("certificate_id", data.id);
    const beforeUrls = ((before ?? []) as any[]).map((b) => String(b.url));

    const notes = data.notes?.trim() ? data.notes.trim() : null;
    // Dedup por URL (case-insensitive) mantendo a primeira ocorrência.
    const seen = new Set<string>();
    const next = data.bindings.filter((b) => {
      const k = b.url.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });

    const { error: ue } = await sb.from("ssl_certificates").update({ notes }).eq("id", data.id);
    if (ue) throw new Error(ue.message);
    const { error: de } = await sb.from("ssl_certificate_bindings").delete().eq("certificate_id", data.id);
    if (de) throw new Error(de.message);
    if (next.length > 0) {
      const { error: ie } = await sb.from("ssl_certificate_bindings").insert(
        next.map((b) => ({
          certificate_id: data.id,
          url: b.url,
          description: b.description?.trim() || null,
          created_by: context.userId,
        })),
      );
      if (ie) throw new Error(ie.message);
    }

    const afterUrls = next.map((b) => b.url);
    const added = afterUrls.filter((u) => !beforeUrls.some((x) => x.toLowerCase() === u.toLowerCase()));
    const removed = beforeUrls.filter((u) => !afterUrls.some((x) => x.toLowerCase() === u.toLowerCase()));
    await logAudit({
      userId: context.userId,
      modulo: "dominios-ssl",
      acao: "editar_certificado",
      descricao: `Observações/URLs do certificado de ${row.domain_name} editadas`,
      detalhes: {
        certificate_id: data.id,
        observacoes_alteradas: (row.notes ?? null) !== notes,
        urls_adicionadas: added,
        urls_removidas: removed,
      },
    });
    return { ok: true as const };
  });

// ─── Cria certificado a partir do domínio (checa SSL público) ─────────────
export const createSslCertByDomain = createServerFn({ method: "POST" })
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
    const { data: dup } = await supabase
      .from("ssl_certificates")
      .select("id")
      .eq("domain_name", data.domain_name)
      .maybeSingle();
    if (dup) return { ok: false as const, error: "Já existe certificado cadastrado para este domínio" };
    const r = await lookupSslCert(data.domain_name);
    if (!r.valid_to)
      return { ok: false as const, error: r.error ?? "Certificado SSL não localizado para este domínio" };
    const { data: inserted, error } = await supabase
      .from("ssl_certificates")
      .insert({
        domain_name: data.domain_name,
        issuer: r.issuer ?? "desconhecido",
        valid_from: r.valid_from ?? null,
        valid_to: r.valid_to,
        alert_days: data.alert_days,
        last_checked_at: new Date().toISOString(),
        last_check_error: null,
        created_by: userId,
        source: "manual",
      })
      .select("*")
      .single();
    if (error) return { ok: false as const, error: error.message };
    return { ok: true as const, cert: shape(inserted) };
  });

// ─── Sincroniza zonas Cloudflare como certificados SSL ────────────────────
export const syncCloudflareZonesAsSslCerts = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [{ data: zones, error: ze }, { data: existing, error: ee }] = await Promise.all([
      supabase.from("cloudflare_zones").select("name"),
      supabase.from("ssl_certificates").select("domain_name"),
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

    // Busca token e zonas CF para pegar dados precisos do certificado ativo
    const cfToken = await getCfToken();
    let added = 0,
      noCert = 0,
      failed = 0;

    for (const name of candidates) {
      try {
        // 1. ssl-checker valida se o domínio tem HTTPS ativo
        const sslCheck = await lookupSslCert(name);
        if (!sslCheck.valid_to) {
          noCert++;
          continue;
        }

        // 2. Se tiver token CF, busca dados mais precisos do certificado ativo
        let certData = sslCheck;
        if (cfToken) {
          const zoneId = await getCfZoneId(name, cfToken);
          if (zoneId) {
            const res = await fetchWithTimeout(
              `https://api.cloudflare.com/client/v4/zones/${zoneId}/ssl/certificate_packs?status=all`,
              8000,
              { Authorization: `Bearer ${cfToken}` },
            );
            if (res.ok) {
              const j: any = await res.json();
              const packs: any[] = j?.result ?? [];
              const active = packs
                .filter((p) => p.status === "active" || p.type === "universal")
                .sort((a, b) => new Date(b.uploaded_on ?? 0).getTime() - new Date(a.uploaded_on ?? 0).getTime());
              const pack = active[0];
              const cert = pack?.certificates?.[0];
              const expiresOn = cert?.expires_on ?? pack?.expires_on;
              const issuedOn = cert?.issued_on ?? pack?.issued_on;
              const issuerRaw = cert?.issuer ?? pack?.issuer ?? pack?.primary_certificate?.issuer;
              if (expiresOn) {
                const issuer =
                  typeof issuerRaw === "string" ? issuerRaw : (issuerRaw?.o ?? issuerRaw?.cn ?? sslCheck.issuer);
                certData = {
                  valid_from: issuedOn ? toBrtDateString(issuedOn) : sslCheck.valid_from,
                  valid_to: toBrtDateString(expiresOn!),
                  issuer: issuer ?? sslCheck.issuer,
                };
              }
            }
          }
        }

        // Não sobrescreve certificados importados manualmente
        const { data: existingImported } = await supabase
          .from("ssl_certificates")
          .select("id, source")
          .eq("domain_name", name)
          .eq("source", "imported");
        if ((existingImported ?? []).length > 0) {
          added++; // conta como adicionado pois já existe
          continue;
        }

        const { error } = await supabase.from("ssl_certificates").insert({
          domain_name: name,
          issuer: certData.issuer ?? "desconhecido",
          valid_from: certData.valid_from ?? null,
          valid_to: certData.valid_to,
          alert_days: 30,
          last_checked_at: new Date().toISOString(),
          last_check_error: null,
          created_by: userId,
          source: "cloudflare",
        });
        if (error) failed++;
        else added++;
      } catch (e) {
        failed++;
      }
    }
    return { added, noCert, skipped: (zones ?? []).length - candidates.length, failed, total: (zones ?? []).length };
  });

// ─── Notify admins (SSL) ─────────────────────────────────────────────────
// Returns the start of "today" in America/Sao_Paulo as a UTC timestamp.
function startOfTodayBRTUtc(): Date {
  const now = new Date();
  const brt = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const startBRT = Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate(), 0, 0, 0);
  return new Date(startBRT + 3 * 60 * 60 * 1000);
}

// Retorna meia-noite no horário de Brasília (UTC-3) como timestamp UTC
// Igual ao cálculo do frontend: new Date(); setHours(0,0,0,0)
function midnightBRT(): Date {
  const brt = new Date(Date.now() - 3 * 60 * 60 * 1000);
  return new Date(Date.UTC(brt.getUTCFullYear(), brt.getUTCMonth(), brt.getUTCDate(), 3, 0, 0));
}

// Converte valid_to (YYYY-MM-DD) para meia-noite BRT
function certMidnightBRT(validTo: string): Date {
  const [y, m, d] = validTo.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 3, 0, 0));
}

// Calcula dias entre hoje (meia-noite BRT) e data de vencimento — igual ao frontend
function daysUntilExpiry(validTo: string): number {
  const today = midnightBRT().getTime();
  const exp = certMidnightBRT(validTo).getTime();
  return Math.round((exp - today) / 86400000);
}

export const triggerSslAlertCheck = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await requirePermission(context.supabase, context.userId, "dominios-ssl", "edit");
    const sb = admin();
    const startTodayBRT = startOfTodayBRTUtc();

    // Diagnóstico: por que cada cert passa ou não
    const { data: rows } = await sb.from("ssl_certificates").select("*");
    const debug = (rows ?? []).map((r: any) => {
      if (!r.valid_to) return { domain: r.domain_name, reason: "sem valid_to" };
      const days = daysUntilExpiry(r.valid_to);
      if (days > (r.alert_days ?? 30))
        return {
          domain: r.domain_name,
          days,
          alert_days: r.alert_days,
          reason: `fora do prazo (${days} > ${r.alert_days ?? 30})`,
        };
      if (r.last_alert_sent_at && new Date(r.last_alert_sent_at).getTime() >= startTodayBRT.getTime())
        return {
          domain: r.domain_name,
          days,
          alert_days: r.alert_days,
          reason: `ja enviado hoje (${r.last_alert_sent_at})`,
        };
      return { domain: r.domain_name, days, alert_days: r.alert_days, reason: "SERA ENVIADO" };
    });

    // Verifica SMTP e destinatários
    const { data: cfg } = await sb.from("smtp_config").select("host, port").limit(1).maybeSingle();
    const { getDepartmentEmailsForScope } = await import("./alerts-recipients.functions");
    const [d1, d2] = await Promise.all([getDepartmentEmailsForScope("domains"), getDepartmentEmailsForScope("ssl")]);
    const deptEmails = Array.from(new Set([...d1, ...d2]));
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
    const adminEmails = ((profiles ?? []) as any[]).map((p: any) => p.email).filter(Boolean);
    const allEmails = Array.from(new Set([...adminEmails, ...deptEmails]));

    const { recordCronRun } = await import("./cron-tracking.server");
    const started = Date.now();
    let result: { notified: number; certs: number };
    try {
      result = await checkExpiringSslAndNotify();
      await recordCronRun("ssl-expiry-check", "manual", { ok: true, durationMs: Date.now() - started });
    } catch (e: any) {
      await recordCronRun("ssl-expiry-check", "manual", {
        ok: false,
        error: String(e?.message ?? e),
        durationMs: Date.now() - started,
      });
      throw e;
    }
    return {
      ...result,
      debug,
      smtp: cfg ? `${cfg.host}:${cfg.port}` : "NAO_CONFIGURADO",
      destinatarios: allEmails,
      todayMidnight: midnightBRT().toISOString(),
      startTodayBRT: startTodayBRT.toISOString(),
    };
  });

export async function checkExpiringSslAndNotify(): Promise<{ notified: number; certs: number }> {
  const sb = admin();

  const { data: rows } = await sb.from("ssl_certificates").select("*");
  const startTodayBRT = startOfTodayBRTUtc();

  const expiring = (rows ?? []).filter((r: any) => {
    if (!r.valid_to) return false;
    const days = daysUntilExpiry(r.valid_to);
    if (days > (r.alert_days ?? 30)) return false;
    if (!r.last_alert_sent_at) return true;
    return new Date(r.last_alert_sent_at).getTime() < startTodayBRT.getTime();
  });

  if (expiring.length === 0) return { notified: 0, certs: 0 };

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
  const [deptEmailsDomains, deptEmailsSsl] = await Promise.all([
    getDepartmentEmailsForScope("domains"),
    getDepartmentEmailsForScope("ssl"),
  ]);
  const deptEmails = Array.from(new Set([...deptEmailsDomains, ...deptEmailsSsl]));
  const adminEmails = ((profiles ?? []) as any[])
    .map((p) =>
      String(p.email ?? "")
        .trim()
        .toLowerCase(),
    )
    .filter(Boolean);
  const emails = Array.from(new Set([...adminEmails, ...deptEmails]));
  if (emails.length === 0) return { notified: 0, certs: expiring.length };

  const { data: cfg } = await sb.from("smtp_config").select("*").limit(1).maybeSingle();
  if (!cfg?.host) return { notified: 0, certs: expiring.length };
  const password = (cfg as any).password || process.env.SMTP_PASSWORD;
  if (!password) return { notified: 0, certs: expiring.length };

  const subject = `${APP_NAME} · ${expiring.length} certificado(s) SSL próximo(s) do vencimento`;
  const rowsHtml = expiring
    .map((r: any) => {
      const days = daysUntilExpiry(r.valid_to);
      return `<tr><td style="padding:6px 12px;border:1px solid #ddd">${escapeHtml(String(r.domain_name ?? ""))}</td><td style="padding:6px 12px;border:1px solid #ddd">${escapeHtml(String(r.issuer ?? "—"))}</td><td style="padding:6px 12px;border:1px solid #ddd">${escapeHtml(String(r.valid_to ?? ""))}</td><td style="padding:6px 12px;border:1px solid #ddd;color:${days <= 7 ? "#c1121f" : "#d4a017"}"><b>${days} dia(s)</b></td></tr>`;
    })
    .join("");
  const tabela = `<table style="border-collapse:collapse"><thead><tr><th style="padding:6px 12px;border:1px solid #ddd">Domínio</th><th style="padding:6px 12px;border:1px solid #ddd">Emissor</th><th style="padding:6px 12px;border:1px solid #ddd">Validade</th><th style="padding:6px 12px;border:1px solid #ddd">Dias restantes</th></tr></thead><tbody>${rowsHtml}</tbody></table>`;
  const defaultHtml = buildSslExpiryAlertHtml(tabela);
  const override = await getEmailTemplateOverride(sb, "ssl_expiry_alert");
  const html = applyEmailTemplate(
    "ssl_expiry_alert",
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
        template: "ssl_expiry_alert",
        status: out.ok ? "success" : "error",
        error_message: out.ok ? null : String(out.error ?? "falha no envio"),
      });
      if (out.ok) notified++;
    } catch (e: any) {
      await sb.from("email_logs").insert({
        to_email: to,
        subject,
        template: "ssl_expiry_alert",
        status: "error",
        error_message: String(e?.message ?? e),
      });
    }
  }

  await sb
    .from("ssl_certificates")
    .update({ last_alert_sent_at: new Date().toISOString() })
    .in(
      "id",
      expiring.map((r: any) => r.id),
    );

  return { notified, certs: expiring.length };
}
