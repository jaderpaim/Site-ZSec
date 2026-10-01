import { createContext, useContext, useEffect, useState, useRef, useCallback, type ReactNode } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { logAccessFailure, logAccessSuccess, logLogoutEvent } from "@/lib/access-logs.functions";

const SESSION_MAX_MS = 24 * 60 * 60 * 1000; // 24h — expiração absoluta
const INACTIVITY_MAX_MS = 8 * 60 * 60 * 1000; // 8h — timeout por inatividade
const WARN_BEFORE_MS = 5 * 60 * 1000; // aviso 5min antes do timeout
const CHECK_INTERVAL_MS = 30_000; // verificação a cada 30s
const ACTIVITY_PING_INTERVAL_MS = 60_000; // heartbeat de "usuário conectado"
const LS_LOGIN_AT = "bsec_login_at";
const SS_SIGNOUT_REASON = "bsec_signout_reason";
const SS_PENDING_INVITE_LOG = "bsec_pending_invite_log";

type Role = "admin" | "analista" | "visualizador" | "personalizado" | "super_admin";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  role: Role | null;
  loading: boolean;
  refreshRole: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<{ error?: string }>;
  signUp: (email: string, password: string, fullName: string) => Promise<{ error?: string }>;
  signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

async function clearActivity(uid: string | null) {
  if (!uid) return;
  try {
    await supabase.from("profiles").update({ last_active_at: null }).eq("id", uid);
  } catch {
    // ignore — best-effort
  }
}

/** Reconhece as duas mensagens específicas que requireActiveSession lança
 * (session-policy.middleware.ts) num 401 real do servidor, distinguindo qual
 * dos dois limites (24h absoluto vs 8h de inatividade) foi violado -- reusa
 * os mesmos valores de `reason` que já existem, sem precisar de um terceiro
 * valor no enum de logLogoutEvent. */
export function detectSessionExpiredReason(error: unknown): "expired" | "inactivity" | null {
  if (!(error instanceof Error)) return null;
  if (error.message.includes("session expired (24h)")) return "expired";
  if (error.message.includes("session expired (inactivity)")) return "inactivity";
  return null;
}

let forceSignOutInFlight = false;

/**
 * Standalone (não é hook) de propósito -- precisa ser chamável de fora do
 * AuthProvider, por um handler global de erro do QueryClient (ver
 * router.tsx), que existe ANTES do provider montar. Antes disso era um
 * useCallback preso a refs internas do componente (currentUidRef), então só
 * o watchdog client-side de 30s conseguia chamar -- um 401 real vindo do
 * servidor (requireActiveSession) nunca disparava logout automático, só um
 * toast local no componente que fez a chamada (ver
 * [[project-tanstack-throw-response-bug]] pro bug relacionado que fazia
 * esse erro nem aparecer direito antes de ser corrigido).
 *
 * stopActivityPing/stopSessionGuard não precisam ser chamados aqui: o
 * próprio onAuthStateChange (mais abaixo) já faz essa limpeza reativamente
 * assim que supabase.auth.signOut() reduz a sessão a null.
 */
export async function forceSignOut(reason: "expired" | "inactivity") {
  if (forceSignOutInFlight) return;
  forceSignOutInFlight = true;
  try {
    const { data } = await supabase.auth.getSession();
    const uid = data.session?.user?.id ?? null;
    await clearActivity(uid);
    localStorage.removeItem(LS_LOGIN_AT);
    // Precisa ser chamado ANTES de auth.signOut() — depois disso o token cai e a
    // server function (que exige sessão autenticada) não conseguiria gravar o log.
    try {
      const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : null;
      await logLogoutEvent({ data: { reason, user_agent: userAgent } });
    } catch {
      // ignore logging errors
    }
    await supabase.auth.signOut();
    const msg =
      reason === "expired"
        ? "Sua sessão de 24h expirou. Faça login novamente."
        : "Sessão encerrada por 8h de inatividade. Faça login novamente.";
    sessionStorage.setItem(SS_SIGNOUT_REASON, msg);
    window.location.href = "/login";
  } finally {
    forceSignOutInFlight = false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [role, setRole] = useState<Role | null>(null);
  const [loading, setLoading] = useState(true);
  const currentUidRef = useRef<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const sessionCheckRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const activityPingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const warnedRef = useRef(false);

  const fetchRole = useCallback(async (uid: string) => {
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", uid).maybeSingle();
    setRole((data?.role as Role) ?? "visualizador");
  }, []);

  const refreshRole = useCallback(async () => {
    if (currentUidRef.current) await fetchRole(currentUidRef.current);
  }, [fetchRole]);

  function startPolling(_uid: string) {
    // noop — polling desativado para reduzir carga no banco
  }

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function startActivityPing(uid: string) {
    stopActivityPing();
    const ping = () => {
      supabase
        .from("profiles")
        .update({ last_active_at: new Date().toISOString() })
        .eq("id", uid)
        .then(
          () => {},
          () => {},
        );
    };
    ping();
    activityPingRef.current = setInterval(ping, ACTIVITY_PING_INTERVAL_MS);
  }

  function stopActivityPing() {
    if (activityPingRef.current) {
      clearInterval(activityPingRef.current);
      activityPingRef.current = null;
    }
  }

  const stopSessionGuard = useCallback(() => {
    if (sessionCheckRef.current) {
      clearInterval(sessionCheckRef.current);
      sessionCheckRef.current = null;
    }
  }, []);

  const startSessionGuard = useCallback(() => {
    stopSessionGuard();
    warnedRef.current = false;

    sessionCheckRef.current = setInterval(() => {
      if (!currentUidRef.current) return;

      const now = Date.now();
      const loginAt = Number(localStorage.getItem(LS_LOGIN_AT) ?? 0);

      // Expiração absoluta de 24h
      if (loginAt && now - loginAt >= SESSION_MAX_MS) {
        forceSignOut("expired");
        return;
      }

      // Timeout por inatividade
      const idle = now - lastActivityRef.current;
      if (idle >= INACTIVITY_MAX_MS) {
        forceSignOut("inactivity");
        return;
      }

      // Aviso 5 min antes do timeout de inatividade
      const nearTimeout = idle >= INACTIVITY_MAX_MS - WARN_BEFORE_MS;
      if (!warnedRef.current && nearTimeout) {
        warnedRef.current = true;
        const remaining = Math.ceil((INACTIVITY_MAX_MS - idle) / 60_000);
        toast.warning(`Sessão será encerrada em ${remaining} min por inatividade`, {
          duration: 25_000,
          id: "inactivity-warn",
        });
      } else if (warnedRef.current && !nearTimeout) {
        warnedRef.current = false;
        toast.dismiss("inactivity-warn");
      }
    }, CHECK_INTERVAL_MS);
  }, [forceSignOut, stopSessionGuard]);

  // Rastreia atividade do usuário
  useEffect(() => {
    const updateActivity = () => {
      lastActivityRef.current = Date.now();
    };
    const events = ["mousemove", "keydown", "click", "scroll", "wheel", "touchstart", "pointerdown"] as const;
    // capture:true — necessário para "scroll" disparado em containers internos
    // (overflow:auto), que não faz bubble até window.
    events.forEach((e) => window.addEventListener(e, updateActivity, { passive: true, capture: true }));
    return () => events.forEach((e) => window.removeEventListener(e, updateActivity, { capture: true }));
  }, []);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((e, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      currentUidRef.current = s?.user?.id ?? null;
      if (s?.user) {
        // Marca o início da sessão de 24h em QUALQUER login novo (e-mail/senha, SSO,
        // convite). Antes só era setado dentro de signIn(), então sessões criadas via
        // magic link (SSO/convite) — que chegam direto por este listener — ficavam sem
        // timestamp (ou herdavam um valor antigo de uma sessão anterior não encerrada
        // corretamente), fazendo o guard abaixo forçar logout minutos depois de um
        // login legítimo, achando que a sessão de 24h já tinha expirado.
        if (e === "SIGNED_IN") {
          localStorage.setItem(LS_LOGIN_AT, String(Date.now()));
        }
        // Sessão criada pelo link de ativação de convite (não passa por signIn()/SSO,
        // que já logam acesso real): grava o log de sucesso aqui, uma única vez.
        if (e === "SIGNED_IN" && sessionStorage.getItem(SS_PENDING_INVITE_LOG)) {
          sessionStorage.removeItem(SS_PENDING_INVITE_LOG);
          const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : null;
          logAccessSuccess({ data: { user_agent: userAgent, login_method: "invite" } }).catch(() => {});
        }
        setTimeout(() => {
          fetchRole(s.user.id);
          startPolling(s.user.id);
          startSessionGuard();
          startActivityPing(s.user.id);
        }, 0);
      } else {
        setRole(null);
        stopPolling();
        stopSessionGuard();
        stopActivityPing();
      }
    });

    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s);
      setUser(s?.user ?? null);
      currentUidRef.current = s?.user?.id ?? null;
      if (s?.user) {
        fetchRole(s.user.id);
        startPolling(s.user.id);
        startSessionGuard();
        startActivityPing(s.user.id);
      }
      setLoading(false);
    });

    return () => {
      sub.subscription.unsubscribe();
      stopPolling();
      stopSessionGuard();
      stopActivityPing();
    };
  }, [fetchRole, startSessionGuard, stopSessionGuard]);

  return (
    <Ctx.Provider
      value={{
        user,
        session,
        role,
        loading,
        refreshRole,
        signIn: async (email, password) => {
          const { data, error } = await supabase.auth.signInWithPassword({ email, password });
          // LS_LOGIN_AT é gravado pelo listener onAuthStateChange (evento SIGNED_IN),
          // que cobre e-mail/senha, SSO e convite de forma centralizada.
          // Log access attempt server-side (captura IP público via headers).
          // Sucesso é gravado pelo servidor com user_id/email/role derivados do JWT,
          // impedindo falsificação de registros pelo cliente.
          try {
            const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : null;
            if (error) {
              await logAccessFailure({
                data: {
                  email,
                  error_message: error.message,
                  user_agent: userAgent,
                  login_method: "email_password",
                },
              });
            } else if (data.user) {
              await logAccessSuccess({
                data: {
                  user_agent: userAgent,
                  login_method: "email_password",
                },
              });
            }
          } catch {
            // ignore logging errors
          }
          return { error: error?.message };
        },
        signUp: async (email, password, full_name) => {
          const redirectUrl = `${window.location.origin}/`;
          const { error } = await supabase.auth.signUp({
            email,
            password,
            options: { emailRedirectTo: redirectUrl, data: { full_name } },
          });
          return { error: error?.message };
        },
        signOut: async () => {
          stopActivityPing();
          await clearActivity(currentUidRef.current);
          localStorage.removeItem(LS_LOGIN_AT);
          // Precisa ser chamado ANTES de auth.signOut() — depois disso o token cai e a
          // server function (que exige sessão autenticada) não conseguiria gravar o log.
          try {
            const userAgent = typeof navigator !== "undefined" ? navigator.userAgent : null;
            await logLogoutEvent({ data: { reason: "manual", user_agent: userAgent } });
          } catch {
            // ignore logging errors
          }
          await supabase.auth.signOut();
        },
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useAuth must be used within AuthProvider");
  return c;
}

/** Lê e exibe a razão de logout forçado (sessão expirada / inatividade). Chamar uma vez na tela de login. */
export function useSignOutReason() {
  useEffect(() => {
    const reason = sessionStorage.getItem(SS_SIGNOUT_REASON);
    if (reason) {
      sessionStorage.removeItem(SS_SIGNOUT_REASON);
      toast.warning(reason, { duration: 10_000 });
    }
  }, []);
}
