import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { isSafeRedirectPath } from "@/lib/safe-redirect";
import { logAudit } from "@/lib/audit-log.functions";
import type { Database } from "@/integrations/supabase/types";
import { appUrlOrNull } from "@/lib/app-url";

const DOMAIN_RE = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i;
const PENDING_REDIRECT_COOKIE = "pending_redirect";

async function assertAdmin(context: any) {
  const { data, error } = await context.supabase.rpc("has_role", {
    _user_id: context.userId,
    _role: "admin",
  });
  if (error || !data) throw new Error("Forbidden: admin role required");
}

function getRedirectUri(): string {
  const fromEnv = process.env.SSO_REDIRECT_URI;
  if (fromEnv) return fromEnv;
  // Sem APP_URL devolve "" -- a tela de SSO mostra o campo vazio em vez de quebrar.
  const base = appUrlOrNull();
  return base ? `${base}/api/public/auth/azure/callback` : "";
}

function createPublicServerClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Configuração pública do backend ausente");
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

async function hmacSign(payload: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return Buffer.from(sig).toString("base64url");
}

export async function buildState(email: string, redirect: string, appRedirect: string): Promise<string> {
  const secret = process.env.SSO_STATE_SECRET;
  if (!secret) throw new Error("SSO_STATE_SECRET não configurado");
  const body = {
    e: email.toLowerCase(),
    r: redirect,
    ar: appRedirect,
    t: Date.now(),
    n: crypto.randomUUID(),
  };
  const payload = Buffer.from(JSON.stringify(body)).toString("base64url");
  const sig = await hmacSign(payload, secret);
  return `${payload}.${sig}`;
}

export async function verifyState(state: string): Promise<{ e: string; r: string; ar?: string; t: number; n: string }> {
  const secret = process.env.SSO_STATE_SECRET;
  if (!secret) throw new Error("SSO_STATE_SECRET não configurado");
  const [payload, sig] = state.split(".");
  if (!payload || !sig) throw new Error("state inválido");
  const expected = await hmacSign(payload, secret);
  if (expected !== sig) throw new Error("state inválido (assinatura)");
  const body = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
  if (Date.now() - body.t > 10 * 60 * 1000) throw new Error("state expirado");
  return body;
}

/** Configuração pública lida pela tela de login. Não expõe segredos. */
export const getSsoPublicConfig = createServerFn({ method: "GET" }).handler(async () => {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin.rpc("get_sso_public_config" as any).maybeSingle();
  if (error) throw new Error(error.message);
  const cfg = data as any;
  const hasAzure = !!(cfg?.azure_tenant_id && cfg?.azure_client_id);
  return {
    oauthEnabled: !!cfg?.oauth_enabled && hasAzure,
    samlEnabled: !!cfg?.saml_enabled,
    allowedDomains: (cfg?.allowed_domains as string[] | null) ?? [],
  };
});

/** Configuração completa (admin global). */
export const getSsoConfig = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("sso_config" as any)
      .select("*")
      .limit(1)
      .maybeSingle();
    return {
      config: (data as any) ?? null,
      hasAzureClientSecret: !!process.env.AZURE_CLIENT_SECRET,
      hasStateSecret: !!process.env.SSO_STATE_SECRET,
      redirectUri: getRedirectUri(),
    };
  });

export const upsertSsoConfig = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) =>
    z
      .object({
        oauth_enabled: z.boolean(),
        saml_enabled: z.boolean(),
        ldap_enabled: z.boolean(),
        azure_tenant_id: z.string().trim().max(100).nullable().optional(),
        azure_client_id: z.string().trim().max(100).nullable().optional(),
        saml_metadata_url: z.string().trim().url().max(500).nullable().optional().or(z.literal("")),
        ldap_host: z.string().trim().max(255).nullable().optional(),
        ldap_port: z.number().int().min(1).max(65535).nullable().optional(),
        ldap_base_dn: z.string().trim().max(500).nullable().optional(),
        ldap_bind_dn: z.string().trim().max(500).nullable().optional(),
        allowed_domains: z.array(z.string().trim().toLowerCase().regex(DOMAIN_RE)).max(50),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const provider_mode =
      data.oauth_enabled && data.saml_enabled
        ? "both"
        : data.oauth_enabled
          ? "oauth_azure"
          : data.saml_enabled
            ? "saml"
            : "disabled";
    const payload = { ...data, provider_mode, updated_by: context.userId };
    const { data: existing } = await supabaseAdmin
      .from("sso_config" as any)
      .select("id")
      .limit(1)
      .maybeSingle();
    let error: { message: string } | null = null;
    if ((existing as any)?.id) {
      ({ error } = await supabaseAdmin
        .from("sso_config" as any)
        .update(payload as any)
        .eq("id", (existing as any).id));
    } else {
      ({ error } = await supabaseAdmin.from("sso_config" as any).insert(payload as any));
    }

    await logAudit({
      userId: context.userId,
      modulo: "sso-ldap",
      acao: (existing as any)?.id ? "update" : "create",
      descricao: `${(existing as any)?.id ? "Editou" : "Criou"} a configuração de SSO/LDAP (modo: ${provider_mode}, LDAP: ${data.ldap_enabled ? "ativo" : "inativo"})`,
      status: error ? "error" : "success",
      mensagemErro: error?.message ?? null,
      detalhes: {
        provider_mode,
        ldap_enabled: data.ldap_enabled,
        oauth_enabled: data.oauth_enabled,
        saml_enabled: data.saml_enabled,
        allowed_domains: data.allowed_domains,
      },
    });

    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Lê e limpa, no servidor, o cookie de destino pós-SSO gravado em azure/callback.ts.
 * Mantém o cookie HttpOnly (o client nunca precisa de document.cookie para isso). */
export const consumePendingRedirect = createServerFn({ method: "POST" }).handler(
  async (): Promise<{ dest: string | null }> => {
    const { getCookie, setCookie } = await import("@tanstack/react-start/server");
    const raw = getCookie(PENDING_REDIRECT_COOKIE);
    if (raw) {
      setCookie(PENDING_REDIRECT_COOKIE, "", { path: "/", maxAge: 0, httpOnly: true, sameSite: "lax", secure: true });
    }
    if (!raw) return { dest: null };
    const dest = decodeURIComponent(raw);
    if (!isSafeRedirectPath(dest) || dest.startsWith("/login")) return { dest: null };
    return { dest };
  },
);

/** Inicia o fluxo OAuth Microsoft. Se um e-mail for informado, valida domínio + pré-cadastro e
 * usa como login_hint. Sem e-mail, deixa a Microsoft selecionar a conta — a validação acontece no callback. */
export const startAzureLogin = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        email: z.string().email().toLowerCase().optional().or(z.literal("")),
        redirect: z.string().trim().max(500).optional().nullable(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data }) => {
    const email = data.email && data.email.length > 0 ? data.email : null;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cfg, error } = await supabaseAdmin.rpc("get_sso_public_config" as any).maybeSingle();
    if (error) throw new Error(error.message);
    const c = cfg as any;
    if (!c?.oauth_enabled || !c.azure_tenant_id || !c.azure_client_id) {
      throw new Error("SSO Microsoft não está habilitado");
    }
    if (!process.env.AZURE_CLIENT_SECRET || !process.env.SSO_STATE_SECRET) {
      throw new Error("SSO Microsoft não configurado (segredos pendentes)");
    }

    if (email) {
      const domain = email.split("@")[1];
      const allowed = (c.allowed_domains as string[] | null) ?? [];
      if (!allowed.includes(domain)) {
        throw new Error("Domínio não autorizado para SSO");
      }
    }

    const redirectUri = getRedirectUri();
    const appRedirect =
      isSafeRedirectPath(data.redirect) && !data.redirect.startsWith("/login")
        ? data.redirect
        : "/app/vulnerabilidades";
    const state = await buildState(email ?? "", redirectUri, appRedirect);
    const nonce = crypto.randomUUID();
    const url = new URL(`https://login.microsoftonline.com/${c.azure_tenant_id}/oauth2/v2.0/authorize`);
    url.searchParams.set("client_id", c.azure_client_id);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("redirect_uri", redirectUri);
    url.searchParams.set("response_mode", "query");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("nonce", nonce);
    if (email) url.searchParams.set("login_hint", email);
    else url.searchParams.set("prompt", "select_account");
    return { authorizeUrl: url.toString() };
  });
