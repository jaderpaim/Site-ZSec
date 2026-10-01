import { createMiddleware } from "@tanstack/react-start";
import { setResponseStatus } from "@tanstack/react-start/server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const SESSION_MAX_MS = 24 * 60 * 60 * 1000; // 24h — mesmo limite absoluto do client (auth-context.tsx)
const INACTIVITY_MAX_MS = 8 * 60 * 60 * 1000; // 8h — mesmo limite de inatividade do client

/**
 * Substitui requireSupabaseAuth nos endpoints autenticados: além de validar o JWT,
 * reforça no servidor os limites de 24h/8h que antes só existiam no watchdog
 * client-side (auth-context.tsx, checado a cada 30s). Sem essa trava aqui, um token
 * ainda válido (renovado silenciosamente pelo SDK) continua sendo aceito mesmo depois
 * que a política da aplicação deveria ter encerrado a sessão — basta o watchdog não
 * ter tido chance de rodar (aba em segundo plano, notebook hibernando).
 *
 * session_started_at/last_active_at são gravados por logAccessSuccess/logLogoutEvent
 * (access-logs.functions.ts) e pelo callback SSO, sempre via supabaseAdmin — nunca
 * pelo client autenticado, que é bloqueado por trigger em profiles (ver migration
 * 20260918090000).
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
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("session_started_at, last_active_at")
      .eq("id", context.userId)
      .maybeSingle();

    const now = Date.now();

    if (profile?.session_started_at) {
      if (now - new Date(profile.session_started_at).getTime() >= SESSION_MAX_MS) {
        setResponseStatus(401);
        throw new Error("Unauthorized: session expired (24h)");
      }
    }

    if (profile?.last_active_at) {
      if (now - new Date(profile.last_active_at).getTime() >= INACTIVITY_MAX_MS) {
        setResponseStatus(401);
        throw new Error("Unauthorized: session expired (inactivity)");
      }
    }

    // Sessão sem marca de início (perfil anterior a este recurso, ou primeira request
    // logo após o login) — inicializa em vez de bloquear, para não travar o próprio
    // fluxo de login. logAccessSuccess/logLogoutEvent são a fonte autoritativa.
    if (!profile?.session_started_at) {
      await supabaseAdmin
        .from("profiles")
        .update({ session_started_at: new Date(now).toISOString() })
        .eq("id", context.userId);
    }

    return next();
  });
