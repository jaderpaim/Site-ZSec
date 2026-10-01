import { createFileRoute } from "@tanstack/react-router";
import { runQradarSync } from "@/lib/qradar.server";
import { checkHookSecret } from "@/lib/hook-auth.server";
import { recordCronRun, recordCronAttemptStart } from "@/lib/cron-tracking.server";

// A borda da Cloudflare na frente de b-security.bernoulli.com.br derruba a
// conexão se não vir nenhum byte de resposta por ~100s — o sync completo
// (várias buscas AQL sequenciais/paralelas) frequentemente passa disso,
// medido em produção morrendo por volta de ~124s sempre que alguma consulta
// no QRadar demora mais que o normal (confirmado: indo direto pra origem,
// sem essa borda no meio, o mesmo sync completa em ~250s sem erro).
// Streaming com heartbeat mantém bytes fluindo (a cada 15s, bem abaixo do
// limite) enquanto o sync roda, então a borda nunca vê silêncio — sem
// precisar de nenhuma mudança no pipeline em si nem no proxy (que já repassa
// response.body como stream, sem dar buffer).
const HEARTBEAT_INTERVAL_MS = 15_000;

export const Route = createFileRoute("/api/public/hooks/qradar-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = checkHookSecret(request);
        if (unauth) return unauth;

        const encoder = new TextEncoder();
        let heartbeat: ReturnType<typeof setInterval> | undefined;

        const stream = new ReadableStream({
          async start(controller) {
            const send = (obj: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
            const started = Date.now();

            send({ status: "started", at: new Date().toISOString() });
            heartbeat = setInterval(() => {
              send({ status: "heartbeat", elapsedMs: Date.now() - started });
            }, HEARTBEAT_INTERVAL_MS);

            await recordCronAttemptStart("qradar-sync", "cron");
            try {
              const result = await runQradarSync();
              await recordCronRun("qradar-sync", "cron", {
                ok: result.ok,
                error: result.error,
                durationMs: Date.now() - started,
              });
              send({ status: "done", result });
            } catch (e) {
              const msg = (e as Error).message;
              await recordCronRun("qradar-sync", "cron", {
                ok: false,
                error: msg,
                durationMs: Date.now() - started,
              });
              send({ status: "done", result: { ok: false, error: msg } });
            } finally {
              clearInterval(heartbeat);
              controller.close();
            }
          },
          cancel() {
            clearInterval(heartbeat);
          },
        });

        return new Response(stream, {
          status: 200,
          headers: { "Content-Type": "application/x-ndjson" },
        });
      },
    },
  },
});
