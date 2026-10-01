import { QueryClient, QueryCache, MutationCache } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { detectSessionExpiredReason, forceSignOut } from "@/lib/auth-context";

// Handler global: antes disso, um 401 real de sessão expirada (vindo do
// requireActiveSession no servidor) só virava um toast local no componente
// que fez a chamada -- o app continuava mostrando o dashboard normalmente
// até o watchdog client-side de 30s eventualmente perceber (pelo relógio
// local) que a sessão devia ter expirado, ou nunca perceber, se o relógio
// local e o servidor divergissem (aba em segundo plano, notebook
// hibernando). Isso reage à resposta de rede de verdade, complementando o
// watchdog baseado em relógio, não substituindo.
function onQueryError(error: unknown) {
  const reason = detectSessionExpiredReason(error);
  if (reason) forceSignOut(reason);
}

export const getRouter = () => {
  const queryClient = new QueryClient({
    queryCache: new QueryCache({ onError: onQueryError }),
    mutationCache: new MutationCache({ onError: onQueryError }),
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    defaultPreloadStaleTime: 0,
  });

  return router;
};
