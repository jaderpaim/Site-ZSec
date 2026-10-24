import { createFileRoute } from "@tanstack/react-router";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { verifyState } from "@/lib/sso.functions";
import { ilikeExactPattern } from "@/lib/sql-like";
import {
  adminDb,
  clientIp,
  LEARNER_COOKIE,
  learnerCookieOptions,
  signLearnerSession,
} from "@/lib/treinamentos.server";

// Retorno do login Microsoft da página de treinamentos. Diferente do SSO do painel,
// aqui não se cria sessão no Z-Sec: só se confirma que a pessoa é do tenant e que
// existe como colaborador, e então se emite o cookie de treinamento.

const jwksCache = new Map<string, ReturnType<typeof createRemoteJWKSet>>();
function getJwks(tenant: string) {
  let j = jwksCache.get(tenant);
  if (!j) {
    j = createRemoteJWKSet(
      new URL(`https://login.microsoftonline.com/${tenant}/discovery/v2.0/keys`),
    );
    jwksCache.set(tenant, j);
  }
  return j;
}

function back(erro: string): Response {
  return new Response(null, {
    status: 302,
    headers: { Location: `/treinamentos?erro=${encodeURIComponent(erro)}` },
  });
}

function serializeCookie(name: string, value: string, maxAge: number): string {
  const o = learnerCookieOptions;
  return `${name}=${value}; Path=${o.path}; Max-Age=${maxAge}; HttpOnly; Secure; SameSite=Lax`;
}

export const Route = createFileRoute("/api/public/treinamentos/sso/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const sb = adminDb();
        const ip = clientIp(request);
        const ua = request.headers.get("user-agent");
        const log = (
          email: string | null,
          evento: string,
          detalhe: string,
          colaboradorId: string | null = null,
        ) =>
          sb.from("treinamento_acessos").insert({
            colaborador_id: colaboradorId,
            email,
            evento,
            detalhe,
            ip,
            user_agent: ua,
          });
        try {
          const url = new URL(request.url);
          if (url.searchParams.get("error")) return back("Login cancelado na Microsoft");
          const code = url.searchParams.get("code");
          const state = url.searchParams.get("state");
          if (!code || !state) return back("Parâmetros inválidos");
          const st = await verifyState(state);

          const { data: cfg } = await sb.rpc("get_sso_public_config").maybeSingle();
          const c = (cfg ?? {}) as { azure_tenant_id?: string; azure_client_id?: string };
          const clientSecret = process.env.AZURE_CLIENT_SECRET;
          if (!c.azure_tenant_id || !c.azure_client_id || !clientSecret)
            return back("Login Microsoft não configurado");

          const tokenRes = await fetch(
            `https://login.microsoftonline.com/${c.azure_tenant_id}/oauth2/v2.0/token`,
            {
              method: "POST",
              headers: { "Content-Type": "application/x-www-form-urlencoded" },
              body: new URLSearchParams({
                client_id: c.azure_client_id,
                client_secret: clientSecret,
                code,
                redirect_uri: st.r,
                grant_type: "authorization_code",
                scope: "openid email profile",
              }),
            },
          );
          if (!tokenRes.ok) return back("Falha na autenticação Microsoft");
          const tokens = (await tokenRes.json()) as { id_token?: string };
          if (!tokens.id_token) return back("Resposta da Microsoft sem identidade");

          // Emissor = o tenant da empresa (contas de outros tenants ou pessoais são recusadas)
          const { payload } = await jwtVerify(tokens.id_token, getJwks(c.azure_tenant_id), {
            issuer: `https://login.microsoftonline.com/${c.azure_tenant_id}/v2.0`,
            audience: c.azure_client_id,
          });
          const p = payload as {
            email?: string;
            preferred_username?: string;
            oid?: string;
            tid?: string;
            name?: string;
          };
          if (p.tid && p.tid !== c.azure_tenant_id) return back("Conta de outra organização");
          const email = String(p.email ?? p.preferred_username ?? "").toLowerCase();
          const oid = p.oid ?? null;
          if (!email) return back("A Microsoft não informou o e-mail");

          // Vínculo: primeiro pelo identificador fixo da conta; depois pelo e-mail
          let colab: {
            id: string;
            display_name: string;
            email: string;
            entra_oid: string | null;
          } | null = null;
          if (oid) {
            const { data } = await sb
              .from("colaboradores")
              .select("id, display_name, email, entra_oid")
              .eq("entra_oid", oid)
              .maybeSingle();
            colab = data;
          }
          if (!colab) {
            // Comparação exata do e-mail: sem escape, `_`/`%` viram curingas e uma
            // conta do tenant poderia se vincular ao cadastro de outra pessoa.
            const emailPattern = ilikeExactPattern(email);
            if (emailPattern) {
              const { data } = await sb
                .from("colaboradores")
                .select("id, display_name, email, entra_oid")
                .ilike("email", emailPattern)
                .maybeSingle();
              colab = data;
            }
          }
          if (!colab) {
            await log(email, "login_negado", "Colaborador não cadastrado");
            return back(
              "Seu e-mail não está no cadastro de colaboradores. Fale com a Segurança da Informação.",
            );
          }
          if (colab.entra_oid && oid && colab.entra_oid !== oid) {
            await log(email, "login_negado", "Conta Microsoft diferente da vinculada", colab.id);
            return back("Esta conta Microsoft não corresponde ao seu cadastro.");
          }
          if (oid && !colab.entra_oid) {
            await sb.from("colaboradores").update({ entra_oid: oid }).eq("id", colab.id);
          }

          const session = await signLearnerSession({
            c: colab.id,
            e: colab.email,
            n: colab.display_name,
          });
          await log(email, "login", "Login Microsoft", colab.id);
          const dest =
            typeof st.ar === "string" && st.ar.startsWith("/treinamentos")
              ? st.ar
              : "/treinamentos";
          return new Response(null, {
            status: 302,
            headers: {
              Location: dest,
              "Set-Cookie": serializeCookie(LEARNER_COOKIE, session, learnerCookieOptions.maxAge),
            },
          });
        } catch (e) {
          await Promise.resolve(
            log(null, "login_negado", (e as Error).message.slice(0, 300)),
          ).catch(() => {});
          return back("Não foi possível validar o login");
        }
      },
    },
  },
});
