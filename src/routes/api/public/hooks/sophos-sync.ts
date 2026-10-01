import { createFileRoute } from "@tanstack/react-router";
import { runSophosSync } from "@/lib/sophos.server";
import { checkHookSecret } from "@/lib/hook-auth.server";
import { recordCronRun } from "@/lib/cron-tracking.server";

export const Route = createFileRoute("/api/public/hooks/sophos-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = checkHookSecret(request);
        if (unauth) return unauth;
        const started = Date.now();
        try {
          const result = await runSophosSync();
          await recordCronRun("sophos-sync", "cron", {
            ok: result.ok,
            error: result.ok ? null : String(result),
            durationMs: Date.now() - started,
          });
          return new Response(JSON.stringify(result), {
            status: result.ok ? 200 : 500,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          await recordCronRun("sophos-sync", "cron", {
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
