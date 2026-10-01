import { createFileRoute } from "@tanstack/react-router";
import { _runEscalateInactiveApprovals } from "@/lib/gmud.functions";
import { checkHookSecret } from "@/lib/hook-auth.server";
import { recordCronRun } from "@/lib/cron-tracking.server";

export const Route = createFileRoute("/api/public/hooks/gmud-escalate")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = checkHookSecret(request);
        if (unauth) return unauth;
        const started = Date.now();
        try {
          const result = await _runEscalateInactiveApprovals(5);
          await recordCronRun("gmud-escalate-inactive", "cron", { ok: true, durationMs: Date.now() - started });
          return new Response(JSON.stringify(result), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          await recordCronRun("gmud-escalate-inactive", "cron", {
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
