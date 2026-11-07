import { createFileRoute } from "@tanstack/react-router";
import { runDnsBackupAll } from "@/lib/cloudflare.guard.server";
import { checkHookSecret } from "@/lib/hook-auth.server";
import { recordCronAttemptStart, recordCronRun } from "@/lib/cron-tracking.server";

// Backup diário de todos os registros DNS de cada zona (cron 03:00).
// Mesmo padrão do qradar-sync: grava a tentativa ANTES de começar (se algo de
// fora interromper, a tentativa aparece em vez de last_attempt_at congelado)
// e responde em stream com heartbeat — a borda da Cloudflare na frente do
// app derruba a conexão sem bytes por ~100s, e ~40 zonas passam disso.
// Em 28/10/2026 o pg_cron disparou e a rota morreu sem registrar nada.
const HEARTBEAT_INTERVAL_MS = 15_000;

export const Route = createFileRoute("/api/public/hooks/cloudflare-dns-backup")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = checkHookSecret(request);
        if (unauth) return unauth;

        const encoder = new TextEncoder();
        let heartbeat: ReturnType<typeof setInterval> | undefined;

        const stream = new ReadableStream({
          async start(controller) {
            const send = (obj: unknown) =>
              controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
            const started = Date.now();

            send({ status: "started", at: new Date().toISOString() });
            heartbeat = setInterval(() => {
              send({ status: "heartbeat", elapsedMs: Date.now() - started });
            }, HEARTBEAT_INTERVAL_MS);

            await recordCronAttemptStart("cloudflare-dns-backup", "cron");
            try {
              const result = await runDnsBackupAll((z) => send({ status: "zone", ...z }));
              // Zona que não existe mais na Cloudflare não é falha: vira
              // "removida" (alerta informativo) e sai do backup.
              await recordCronRun("cloudflare-dns-backup", "cron", {
                ok: result.ok,
                error: result.failed.length
                  ? `${result.failed.length} de ${result.zones} zona(s) falharam: ${result.failed.join(", ")}`
                  : undefined,
                durationMs: Date.now() - started,
              });
              send({ status: "done", result });
            } catch (e) {
              const msg = (e as Error).message;
              await recordCronRun("cloudflare-dns-backup", "cron", {
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
