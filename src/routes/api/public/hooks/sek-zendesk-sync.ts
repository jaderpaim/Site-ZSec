import { createFileRoute } from "@tanstack/react-router";
import { checkHookSecret } from "@/lib/hook-auth.server";
import { recordCronRun } from "@/lib/cron-tracking.server";

// Disparado pelo cron (via tela de Cron Jobs -- schedule_hook_cron, sem
// segredo em texto claro numa migration). Só aciona o worker (VM
// bnlsrvvsesi) e devolve o ACK dele -- o worker responde na hora
// ({status:"started"}) e faz a sincronização de verdade em segundo plano,
// mandando os lotes pro sek-zendesk-tickets-sync conforme pagina o Zendesk.
// Igual ao motivo do ACK imediato no /scan do DAST: sync pode levar mais
// que os ~30s de timeout do proxy do FastAPI se não for assíncrono.
const WORKER_SYNC_URL = "https://sek-api.bernoulli.com.br/sek-worker/sync";

export const Route = createFileRoute("/api/public/hooks/sek-zendesk-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = checkHookSecret(request);
        if (unauth) return unauth;
        const started = Date.now();
        // Nota: isso só rastreia se o disparo pro worker deu certo (ACK
        // imediato), não se a sincronização completa terminou -- a mesma
        // limitação do padrão fire-and-forget que o DAST já usa. Um 409
        // (já em andamento, trava de concorrência do worker) conta como
        // sucesso aqui -- o cron não fez nada de errado, só achou o worker
        // ocupado com o disparo anterior.
        try {
          const clientId = process.env.CF_ACCESS_CLIENT_ID;
          const clientSecret = process.env.CF_ACCESS_CLIENT_SECRET;
          if (!clientId || !clientSecret) {
            const error = "CF_ACCESS_CLIENT_ID/CF_ACCESS_CLIENT_SECRET não configurados";
            await recordCronRun("sek-zendesk-sync", "cron", {
              ok: false,
              error,
              durationMs: Date.now() - started,
            });
            return new Response(JSON.stringify({ ok: false, error }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }
          const resp = await fetch(WORKER_SYNC_URL, {
            method: "POST",
            headers: {
              "CF-Access-Client-Id": clientId,
              "CF-Access-Client-Secret": clientSecret,
            },
          });
          const workerBody = await resp.text();
          const ok = resp.ok || resp.status === 409;
          await recordCronRun("sek-zendesk-sync", "cron", {
            ok,
            error: ok ? null : `worker respondeu ${resp.status}: ${workerBody.slice(0, 300)}`,
            durationMs: Date.now() - started,
          });
          return new Response(JSON.stringify({ ok, workerStatus: resp.status, workerBody }), {
            status: ok ? 200 : 502,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          await recordCronRun("sek-zendesk-sync", "cron", {
            ok: false,
            error: (e as Error).message,
            durationMs: Date.now() - started,
          });
          return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
