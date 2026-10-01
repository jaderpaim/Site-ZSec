import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useAuth } from "@/lib/auth-context";

export const Route = createFileRoute("/")({
  component: RootRedirect,
});

/**
 * Decide o destino direto daqui (sem passar por /app/vulnerabilidades) para
 * não autenticados — senão o AppLayout bate de volta para /login um instante
 * depois, e a URL "pisca" /app/vulnerabilidades antes de assentar em /login.
 */
function RootRedirect() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (loading) return;
    if (user) {
      navigate({ to: "/app/$module", params: { module: "vulnerabilidades" }, replace: true });
    } else {
      (navigate as any)({ to: "/login", search: { redirect: undefined, sso_error: undefined }, replace: true });
    }
  }, [user, loading, navigate]);

  return null;
}
