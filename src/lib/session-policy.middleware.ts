import { createMiddleware } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SESSION_MAX_MS = 24 * 60 * 60 * 1000; // 24h — mesmo limite absoluto do client (auth-context.tsx)
const INACTIVITY_MAX_MS = 8 * 60 * 60 * 1000; // 8h — mesmo limite de inatividade do client
const ACTIVITY_WRITE_THROTTLE_MS = 60 * 1000; // grava last_active_at no máximo 1x/min

/** Métodos de login (claim amr do GoTrue) que não valem para conta só-SSO. */
const NON_SSO_AMR_METHODS = new Set(["password", "recovery"]);

type AmrEntry = { method?: string };

/**
 * Substitui requireSupabaseAuth nos endpoints autenticados: além de validar o JWT,
 * reforça no servidor os limites de 24h/8h que antes só existiam no watchdog
 * client-side (auth-context.tsx, checado a cada 30s). Sem essa trava aqui, um token
 * ainda válido (renovado silenciosamente pelo SDK) continua sendo aceito mesmo depois
 * que a política da aplicação deveria ter encerrado a sessão — basta o watchdog não
 * ter tido chance de rodar (aba em segundo plano, notebook hibernando).
 *
 * As 24h contam a partir de auth.sessions.created_at da sessão do JWT (claim
 * session_id): o GoTrue cria essa linha no login e ela não muda em refresh, então quem
 * tem o token não consegue renovar o prazo (antes era profiles.session_started_at, que
 * logAccessSuccess sobrescrevia). Sessão encerrada (signOut, usuário excluído) some de
 * auth.sessions e passa a ser rejeitada aqui também.
 *
 * As 8h de inatividade contam a partir do mais recente entre last_active_at (gravado só
 * pelo servidor, aqui e em pingActivity) e o início da sessão — assim um login novo
 * depois de 8h parado não é rejeitado pelo last_active_at antigo.
 *
 * Conta com auth_method = 'sso' só é aceita se a sessão não veio de senha nem de
 * recuperação de senha (claim amr), impedindo burlar o SSO via /reset-password.
 *
 * Rejeição usa `throw new Error(...)` + `setResponseStatus(401)`, nunca `throw new
 * Response(...)`: um function-middleware do createServerFn que lança Response direto
 * faz o TanStack Start devolver essa Response crua pro cliente sem passar pelo
 * envelope serializado de erro — o RPC do lado do cliente então trata isso como
 * RESULTADO de sucesso (useQuery/useMutation nunca veem onError, só um objeto
 * Response no lugar do dado esperado). Foi exatamente essa troca (Response -> Error)
 * que corrigiu o bug real observado: token de renovação do SEK vindo `undefined` e
 * `chamados.data.filter is not a function` toda vez que a sessão expirava.
 */
export const requireActiveSession = createMiddleware({ type: "function" })
  .middleware([requireSupabaseAuth])
  .server(async ({ next, context }) => {
    const sessionId = (context.claims as { session_id?: unknown }).session_id;
    if (typeof sessionId !== "string" || !sessionId) {
      console.error("[session-policy] JWT sem claim session_id", { userId: context.userId });
      setResponseStatus(401);
      throw new Error("Unauthorized: session expired (24h)");
    }

    // auth_session_info ainda não está nos tipos gerados (types.ts). Chamado como
    // método do cliente — extrair `rpc` para uma variável perde o `this` do
    // SupabaseClient ("Cannot read properties of undefined (reading 'rest')").
    const adminRpc = supabaseAdmin as unknown as {
      rpc: (
        fn: "auth_session_info",
        args: { _session_id: string },
      ) => Promise<{
        data: { user_id: string; created_at: string }[] | null;
        error: { message: string } | null;
      }>;
    };

    const [{ data: sessionRows, error: sessionErr }, { data: profile }] = await Promise.all([
      adminRpc.rpc("auth_session_info", { _session_id: sessionId }),
      supabaseAdmin
        .from("profiles")
        .select("last_active_at, auth_method")
        .eq("id", context.userId)
        .maybeSingle(),
    ]);

    if (sessionErr) {
      console.error("[session-policy] falha em auth_session_info:", sessionErr.message);
      setResponseStatus(500);
      throw new Error("Session check failed");
    }

    const authSession = sessionRows?.[0];
    if (!authSession || authSession.user_id !== context.userId) {
      console.error("[session-policy] sessão não encontrada em auth.sessions", {
        userId: context.userId,
        sessionId,
      });
      setResponseStatus(401);
      throw new Error("Unauthorized: session expired (24h)");
    }

    const now = Date.now();
    const sessionStart = new Date(authSession.created_at).getTime();

    if (now - sessionStart >= SESSION_MAX_MS) {
      setResponseStatus(401);
      throw new Error("Unauthorized: session expired (24h)");
    }

    const lastActive = profile?.last_active_at ? new Date(profile.last_active_at).getTime() : 0;
    const activityRef = Math.max(lastActive, sessionStart);
    if (now - activityRef >= INACTIVITY_MAX_MS) {
      setResponseStatus(401);
      throw new Error("Unauthorized: session expired (inactivity)");
    }

    if (profile?.auth_method === "sso") {
      const amr = (context.claims as { amr?: unknown }).amr;
      const methods = Array.isArray(amr) ? (amr as AmrEntry[]).map((a) => a?.method) : [];
      if (methods.some((m) => m && NON_SSO_AMR_METHODS.has(m))) {
        setResponseStatus(401);
        throw new Error("Unauthorized: SSO required");
      }
    }

    if (now - lastActive >= ACTIVITY_WRITE_THROTTLE_MS) {
      await supabaseAdmin
        .from("profiles")
        .update({ last_active_at: new Date(now).toISOString() })
        .eq("id", context.userId);
    }

    return next();
  });
