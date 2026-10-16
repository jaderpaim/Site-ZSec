import { createFileRoute } from "@tanstack/react-router";
import { checkHookSecret } from "@/lib/hook-auth.server";
import { recordCronRun } from "@/lib/cron-tracking.server";

export const Route = createFileRoute("/api/public/hooks/cti-monitor-run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = checkHookSecret(request);
        if (unauth) return unauth;
        const started = Date.now();
        try {
          const { runMonitors } = await import("@/lib/leakradar-monitors.server");
          const result = await runMonitors();
          await recordCronRun("cti-monitor-run", "cron", {
            ok: result.ok,
            error: result.error,
            durationMs: Date.now() - started,
          });
          return new Response(JSON.stringify(result), {
            status: result.ok ? 200 : 500,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          await recordCronRun("cti-monitor-run", "cron", {
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
