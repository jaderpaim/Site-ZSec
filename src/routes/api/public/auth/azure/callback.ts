import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { verifyState } from "@/lib/sso.functions";
import { isSafeRedirectPath } from "@/lib/safe-redirect";
import type { Database } from "@/integrations/supabase/types";

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
function getJwks(tenant: string) {
  let j = jwksCache.get(tenant);
  if (!j) {
    j = createRemoteJWKSet(new URL(`https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`));
    jwksCache.set(tenant, j);
  }
  return j;
}

function redirectToLogin(reason: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: `/login?sso_error=${encodeURIComponent(reason)}` },
  });
}

function extractClientIp(req: Request): string | null {
  const cf = req.headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const xri = req.headers.get("x-real-ip");
  if (xri) return xri.trim();
  return null;
}

function createPublicServerClient() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error("Configuração pública do backend ausente");
  return createClient<Database>(url, key, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

function getServiceRoleProblem(): string | null {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) return "SSO local incompleto: chave server-side não configurada";
  if (key.startsWith("eyJ")) return "SSO local incompleto: remova a chave server-side JWT antiga";
  return null;
}

export const Route = createFileRoute("/api/public/auth/azure/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const ip = extractClientIp(request);
          const url = new URL(request.url);
          const code = url.searchParams.get("code");
          const state = url.searchParams.get("state");
          if (!code || !state) return redirectToLogin("Parâmetros inválidos");

          const stateData = await verifyState(state);

          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const { data: cfg, error: cfgErr } = await supabaseAdmin.rpc("get_sso_public_config" as any).maybeSingle();
          if (cfgErr) return redirectToLogin("Configuração SSO indisponível");
          const c = cfg as any;
          if (!c?.oauth_enabled || !c.azure_tenant_id || !c.azure_client_id) {
            return redirectToLogin("SSO desabilitado");
          }
          const clientSecret = process.env.AZURE_CLIENT_SECRET;
          if (!clientSecret) return redirectToLogin("SSO não configurado");

          // Troca code -> id_token
          const tokenRes = await fetch(`https://login.microsoftonline.com/${c.azure_tenant_id}/oauth2/v2.0/token`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              client_id: c.azure_client_id,
              client_secret: clientSecret,
              code,
              redirect_uri: stateData.r,
              grant_type: "authorization_code",
              scope: "openid email profile",
            }),
          });
          if (!tokenRes.ok) return redirectToLogin("Falha na autenticação Microsoft");
          const tokens = (await tokenRes.json()) as { id_token?: string };
          if (!tokens.id_token) return redirectToLogin("id_token ausente");

          const { payload } = await jwtVerify(tokens.id_token, getJwks(c.azure_tenant_id), {
            issuer: `https://login.microsoftonline.com/${c.azure_tenant_id}/v2.0`,
            audience: c.azure_client_id,
          });
          const email = String((payload as any).email ?? (payload as any).preferred_username ?? "").toLowerCase();
          if (!email) return redirectToLogin("E-mail não retornado pelo provedor");
          if (stateData.e && email !== stateData.e) return redirectToLogin("E-mail divergente");

          const domain = email.split("@")[1];
          const allowed = (c.allowed_domains as string[] | null) ?? [];
          if (!allowed.includes(domain)) return redirectToLogin("Domínio não autorizado");

          const serviceRoleProblem = getServiceRoleProblem();
          if (serviceRoleProblem) return redirectToLogin(serviceRoleProblem);

          // supabaseAdmin already imported above

          // Pré-cadastro obrigatório
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("id,email,full_name")
            .ilike("email", email)
            .maybeSingle();
          if (!profile) {
            await supabaseAdmin.from("auth_access_logs").insert({
              email,
              status: "error",
              login_method: "sso_azure",
              error_message: "Usuário não cadastrado",
              user_agent: request.headers.get("user-agent"),
              ip,
            });
            return redirectToLogin("Usuário não cadastrado");
          }

          // Busca papel do usuário para gravar no log
          const { data: roleRow } = await supabaseAdmin
            .from("user_roles")
            .select("role")
            .eq("user_id", (profile as any).id)
            .maybeSingle();

          // Gera magiclink e redireciona — consome a sessão no destino
          // Usa a origem do stateData.r (construído com SSO_REDIRECT_URI) para garantir
          // que o redirectTo aponte para o app público, não para a URL interna do Supabase.
          // O redirectTo do magic link fica fixo em /app/vulnerabilidades porque o
          // endpoint /verify do GoTrue valida esse valor contra a allowlist de Redirect
          // URLs do projeto — um destino dinâmico (ex: /app/gmud?gmud=<id>) seria
          // rejeitado silenciosamente e cairia no SITE_URL padrão. O destino real é
          // entregue via cookie de curta duração no domínio da app (lido em app.tsx).
          const appOrigin = new URL(stateData.r).origin;
          const defaultRedirect = "/app/vulnerabilidades";
          const appRedirect =
            isSafeRedirectPath(stateData.ar) && !stateData.ar.startsWith("/login") ? stateData.ar : defaultRedirect;
          const { data: link, error: linkErr } = await supabaseAdmin.auth.admin.generateLink({
            type: "magiclink",
            email,
            options: { redirectTo: `${appOrigin}${defaultRedirect}` },
          });
          if (linkErr || !link?.properties?.action_link) {
            await supabaseAdmin.from("auth_access_logs").insert({
              email,
              user_id: (profile as any).id,
              full_name: (profile as any).full_name ?? null,
              status: "error",
              login_method: "sso_azure",
              error_message: linkErr?.message ?? "Falha ao criar sessão",
              user_agent: request.headers.get("user-agent"),
              ip,
            });
            return redirectToLogin("Falha ao criar sessão");
          }

          // Log de sucesso SSO
          await supabaseAdmin.from("auth_access_logs").insert({
            email,
            user_id: (profile as any).id,
            full_name: (profile as any).full_name ?? null,
            role: (roleRow as any)?.role ?? "visualizador",
            status: "success",
            login_method: "sso_azure",
            user_agent: request.headers.get("user-agent"),
            ip,
          });

          // Marca o início real da sessão no servidor (mesmo mecanismo de
          // requireActiveSession usado pelo login por e-mail/senha).
          const nowIso = new Date().toISOString();
          await supabaseAdmin
            .from("profiles")
            .update({ session_started_at: nowIso, last_active_at: nowIso })
            .eq("id", (profile as any).id);

          const headers: Record<string, string> = { Location: link.properties.action_link };
          if (appRedirect !== defaultRedirect) {
            headers["Set-Cookie"] =
              `pending_redirect=${encodeURIComponent(appRedirect)}; Path=/; Max-Age=300; SameSite=Lax; Secure; HttpOnly`;
          }
          return new Response(null, { status: 302, headers });
        } catch (e: any) {
          // Nunca repassa e.message pro browser: erros de jwtVerify (jose),
          // do token endpoint da Microsoft ou do Admin API do Supabase podem
          // revelar detalhes de implementação (claims esperadas, algoritmo,
          // estrutura interna) pra um visitante não autenticado -- esse
          // motivo cai direto num toast na tela de login (login.tsx:377), via
          // query param manipulável (?code=&state=). Log fica só no servidor.
          console.error("[sso azure callback] erro inesperado:", e);
          return redirectToLogin("Erro SSO");
        }
      },
    },
  },
});
