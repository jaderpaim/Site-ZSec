import { createFileRoute } from "@tanstack/react-router";
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import * as React from "react";

const resolveInviteToken = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ token: z.string().uuid() }).parse(d))
  .handler(async ({ data }): Promise<{ url: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await (supabaseAdmin as any)
      .from("invite_redirects")
      .select("target_url, used_at, expires_at")
      .eq("id", data.token)
      .maybeSingle();

    if (error || !row) throw new Error("Link de ativação não encontrado.");
    if (row.used_at) throw new Error("Este link já foi utilizado. Acesse o sistema via SSO.");
    if (new Date(row.expires_at) < new Date())
      throw new Error("Link expirado. Solicite um novo convite ao administrador.");

    await (supabaseAdmin as any)
      .from("invite_redirects")
      .update({ used_at: new Date().toISOString() })
      .eq("id", data.token);

    return { url: row.target_url as string };
  });

export const Route = createFileRoute("/ativar")({
  validateSearch: (s: Record<string, unknown>) => ({ t: (s.t as string) ?? "" }),
  component: AtivarPage,
});

function AtivarPage() {
  const { t } = Route.useSearch();
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!t) {
      setError("Token de ativação ausente ou inválido.");
      return;
    }
    resolveInviteToken({ data: { token: t } })
      .then(({ url }) => {
        sessionStorage.setItem("bsec_pending_invite_log", "1");
        window.location.href = url;
      })
      .catch((e: Error) => setError(e.message));
  }, [t]);

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--tl-0b0f1a, #0b0f1a)",
        fontFamily: "Arial, Helvetica, sans-serif",
      }}
    >
      {error ? (
        <div style={{ textAlign: "center", maxWidth: 400, padding: "0 24px" }}>
          <div style={{ fontSize: 32, marginBottom: 16 }}>⚠️</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#f87171", marginBottom: 8 }}>Link inválido</div>
          <div style={{ fontSize: 14, color: "var(--tl-9ca3af, #9ca3af)", lineHeight: 1.6 }}>{error}</div>
          <a
            href="/login"
            style={{
              display: "inline-block",
              marginTop: 24,
              padding: "10px 28px",
              background: "#2563eb",
              color: "#fff",
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              textDecoration: "none",
            }}
          >
            Ir para o login
          </a>
        </div>
      ) : (
        <div style={{ textAlign: "center", color: "var(--tl-9ca3af, #9ca3af)" }}>
          <div
            style={{
              width: 40,
              height: 40,
              border: "3px solid var(--tl-1e2a3a, #1e2a3a)",
              borderTop: "3px solid #2563eb",
              borderRadius: "50%",
              margin: "0 auto 16px",
              animation: "spin 0.8s linear infinite",
            }}
          />
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          <div style={{ fontSize: 14 }}>Ativando sua conta…</div>
        </div>
      )}
    </div>
  );
}
