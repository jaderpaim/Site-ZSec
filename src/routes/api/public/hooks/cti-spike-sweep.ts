import { createFileRoute } from "@tanstack/react-router";
import { checkHookSecret } from "@/lib/hook-auth.server";
import { recordCronRun } from "@/lib/cron-tracking.server";

// Pico de credenciais vazadas por domínio de parceiro (cron, de hora em hora).
export const Route = createFileRoute("/api/public/hooks/cti-spike-sweep")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = checkHookSecret(request);
        if (unauth) return unauth;
        const started = Date.now();
        try {
          const { sweepSpikeAndAlert } = await import("@/lib/leakradar-spike.server");
          const result = await sweepSpikeAndAlert();
          await recordCronRun("cti-spike-sweep", "cron", {
            ok: result.ok,
            error: result.errors.length ? result.errors.join("; ") : undefined,
            durationMs: Date.now() - started,
          });
          return new Response(JSON.stringify(result), {
            status: result.ok ? 200 : 500,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          await recordCronRun("cti-spike-sweep", "cron", {
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
