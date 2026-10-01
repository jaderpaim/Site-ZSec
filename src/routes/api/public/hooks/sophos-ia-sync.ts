import { createFileRoute } from "@tanstack/react-router";
import { runSophosSync } from "@/lib/sophos.server";
import { rebuildIaWebEvents } from "@/lib/ia.server";
import { checkHookSecret } from "@/lib/hook-auth.server";
import { recordCronRun } from "@/lib/cron-tracking.server";

export const Route = createFileRoute("/api/public/hooks/sophos-ia-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = checkHookSecret(request);
        if (unauth) return unauth;
        const started = Date.now();
        try {
          const sync = await runSophosSync();
          const processed = await rebuildIaWebEvents(7);
          await recordCronRun("sophos-ia-sync", "cron", { ok: true, durationMs: Date.now() - started });
          return new Response(JSON.stringify({ ok: true, sync, iaProcessed: processed }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          await recordCronRun("sophos-ia-sync", "cron", {
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
