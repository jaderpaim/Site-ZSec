import { createFileRoute, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useAuth } from "@/lib/auth-context";
import { AppSidebar, BrandMark } from "@/components/layout/AppSidebar";
import { CommandMenu } from "@/components/layout/CommandMenu";
import { ShellStateProvider } from "@/components/layout/shell-state";
import { FiltersProvider } from "@/lib/filters-context";
import { consumePendingRedirect } from "@/lib/sso.functions";

export const Route = createFileRoute("/app")({ component: AppLayout });

/**
 * Após login via SSO, o destino original (se diferente do default) chega aqui
 * por cookie — não pelo redirectTo do magic link, que fica fixo para passar na
 * allowlist de Redirect URLs do Supabase (ver azure/callback.ts). O cookie é
 * HttpOnly: é lido e limpo no servidor (consumePendingRedirect), nunca via
 * document.cookie — o client só recebe o destino já validado.
 */
function usePendingSsoRedirect(user: unknown, loading: boolean) {
  const navigate = useNavigate();
  const consumeRedirect = useServerFn(consumePendingRedirect);
  const consumedRef = useRef(false);
  useEffect(() => {
    if (loading || !user || consumedRef.current) return;
    consumedRef.current = true;
    consumeRedirect().then((result) => {
      if (!result.dest) return;
      const [path, queryString] = result.dest.split("?");
      const search = queryString ? Object.fromEntries(new URLSearchParams(queryString)) : {};
      (navigate as any)({ to: path, search, replace: true });
    });
  }, [user, loading, navigate, consumeRedirect]);
}

function AppLayout() {
  const { user, loading } = useAuth();
  const location = useRouterState({ select: (r) => r.location });
  const navigate = useNavigate();
  usePendingSsoRedirect(user, loading);

  useEffect(() => {
    if (loading || user) return;
    // location.pathname já reflete /login um instante antes deste componente
    // desmontar (a transição de rota roda em startTransition). Sem este
    // early-return, o efeito reexecuta nesse instante e sobrescreve o
    // /login?redirect=... que ele mesmo acabou de gravar com redirect: undefined.
    const isLoginRoute = location.pathname.startsWith("/login") || location.pathname === "/";
    if (isLoginRoute) return;
    const here = location.pathname + (location.searchStr || "");
    // Omite o ?redirect= quando o destino já é o padrão pós-login — não muda
    // o comportamento (login.tsx cai em /app/vulnerabilidades de qualquer
    // forma) e mantém a URL de /login limpa no caso comum.
    const redirectTo = here === "/app/vulnerabilidades" ? undefined : here;
    (navigate as any)({ to: "/login", search: { redirect: redirectTo, sso_error: undefined }, replace: true });
  }, [user, loading, navigate, location.pathname, location.searchStr]);

  if (loading || !user) {
    return (
      <div className="font-ui min-h-screen flex flex-col items-center justify-center gap-3 bg-v2-bg text-v2-fg-3 text-[13px]">
        <BrandMark className="w-8 h-9 animate-pulse motion-reduce:animate-none" />
        Carregando…
      </div>
    );
  }
  return (
    <FiltersProvider>
      <ShellStateProvider>
        <div className="flex min-h-screen bg-v2-bg">
          <AppSidebar />
          <main className="flex-1 min-w-0 flex flex-col">
            <Outlet />
          </main>
        </div>
        <CommandMenu />
      </ShellStateProvider>
    </FiltersProvider>
  );
}
