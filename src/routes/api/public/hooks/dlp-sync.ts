import { createFileRoute } from "@tanstack/react-router";
import { checkHookSecret } from "@/lib/hook-auth.server";
import { recordCronRun } from "@/lib/cron-tracking.server";

export const Route = createFileRoute("/api/public/hooks/dlp-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = checkHookSecret(request);
        if (unauth) return unauth;
        const started = Date.now();
        try {
          const { syncDlpEvents } = await import("@/lib/dlp.server");
          // ?lookbackHours=N -- só pra reprocesso manual (ver dlp.server.ts); o
          // cron chama sem query string e usa o checkpoint salvo normalmente.
          const lookbackHours = Number(new URL(request.url).searchParams.get("lookbackHours") || "");
          const result = await syncDlpEvents(Number.isFinite(lookbackHours) && lookbackHours > 0 ? { lookbackHours } : {});
          await recordCronRun("dlp-sync", "cron", {
            ok: result.ok,
            error: result.error,
            durationMs: Date.now() - started,
          });
          return new Response(JSON.stringify(result), {
            status: result.ok ? 200 : 500,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          await recordCronRun("dlp-sync", "cron", {
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
