import { createFileRoute } from "@tanstack/react-router";
import { checkCmdbDevicesAndNotify } from "@/lib/cmdb-alerts.functions";
import { checkHookSecret } from "@/lib/hook-auth.server";
import { recordCronRun } from "@/lib/cron-tracking.server";

export const Route = createFileRoute("/api/public/hooks/cmdb-device-alerts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = checkHookSecret(request);
        if (unauth) return unauth;
        const started = Date.now();
        try {
          const result = await checkCmdbDevicesAndNotify();
          await recordCronRun("cmdb-device-alerts", "cron", { ok: true, durationMs: Date.now() - started });
          return new Response(JSON.stringify({ ok: true, ...result }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e: any) {
          await recordCronRun("cmdb-device-alerts", "cron", {
            ok: false,
            error: String(e?.message ?? e),
            durationMs: Date.now() - started,
          });
          return new Response(JSON.stringify({ ok: false, error: String(e?.message ?? e) }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
