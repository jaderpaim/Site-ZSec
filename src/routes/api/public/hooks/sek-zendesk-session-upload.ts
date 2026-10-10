import { createFileRoute } from "@tanstack/react-router";
import { jwtVerify } from "jose";
import { sekWorkerUrl } from "@/lib/sek-worker";

// Repassa a captura de sessão (sek-session-capture, rodando no notebook do
// usuário) pro worker na VM, anexando o CF-Access Service Token AQUI, do
// lado do servidor -- o app local não guarda mais esse segredo (só o token
// de renovação de curta duração, já existente, que o worker valida). Rota
// pública de propósito (sem checkHookSecret): quem chama aqui é o
// sek-session-capture de qualquer notebook autorizado, não um sistema
// interno com o HOOK_SECRET.
//
// Sem um segredo NOVO pra proteger isso -- reaproveita o próprio JWT de
// renovação (SEK_RENEWAL_SECRET, o mesmo que generateSekRenewalToken já usa
// pra assinar) como pré-filtro: rejeita token forjado/expirado aqui, ANTES
// de gastar uma chamada de rede real pro worker com o CF-Access anexado. O
// worker continua sendo quem valida de novo e marca o jti como usado (uso
// único) -- essa checagem aqui é só uma camada extra e mais barata na
// frente, não substitui a dele.

export const Route = createFileRoute("/api/public/hooks/sek-zendesk-session-upload")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let payload: unknown;
        try {
          payload = await request.json();
        } catch {
          return new Response(JSON.stringify({ ok: false, error: "JSON inválido" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        if (
          typeof payload !== "object" ||
          payload === null ||
          typeof (payload as { token?: unknown }).token !== "string" ||
          !(payload as { token: string }).token ||
          typeof (payload as { storageState?: unknown }).storageState !== "object"
        ) {
          return new Response(JSON.stringify({ ok: false, error: "Payload inválido: esperado { token, storageState }" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }

        const renewalSecret = process.env.SEK_RENEWAL_SECRET;
        if (!renewalSecret) {
          return new Response(JSON.stringify({ ok: false, error: "SEK_RENEWAL_SECRET não configurado no servidor" }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        try {
          const { payload: claims } = await jwtVerify(
            (payload as { token: string }).token,
            new TextEncoder().encode(renewalSecret),
            { algorithms: ["HS256"] },
          );
          if (claims.purpose !== "session_renewal") throw new Error("purpose mismatch");
        } catch {
          return new Response(JSON.stringify({ ok: false, error: "Token de renovação inválido ou expirado" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const clientId = process.env.CF_ACCESS_CLIENT_ID;
        const clientSecret = process.env.CF_ACCESS_CLIENT_SECRET;
        if (!clientId || !clientSecret) {
          return new Response(
            JSON.stringify({ ok: false, error: "CF_ACCESS_CLIENT_ID/CF_ACCESS_CLIENT_SECRET não configurados no servidor" }),
            { status: 500, headers: { "Content-Type": "application/json" } },
          );
        }

        try {
          const resp = await fetch(sekWorkerUrl("session/upload"), {
            method: "POST",
            headers: {
              "content-type": "application/json",
              "CF-Access-Client-Id": clientId,
              "CF-Access-Client-Secret": clientSecret,
            },
            body: JSON.stringify(payload),
          });
          const body = await resp.text();
          return new Response(body, {
            status: resp.status,
            headers: { "Content-Type": resp.headers.get("content-type") ?? "application/json" },
          });
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
            status: 502,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
