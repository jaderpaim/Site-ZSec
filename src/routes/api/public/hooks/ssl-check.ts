import { createFileRoute } from "@tanstack/react-router";
import { checkExpiringSslAndNotify } from "@/lib/ssl.functions";
import { checkHookSecret } from "@/lib/hook-auth.server";
import { recordCronRun } from "@/lib/cron-tracking.server";

export const Route = createFileRoute("/api/public/hooks/ssl-check")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = checkHookSecret(request);
        if (unauth) return unauth;
        const started = Date.now();
        try {
          const result = await checkExpiringSslAndNotify();
          await recordCronRun("ssl-expiry-check", "cron", { ok: true, durationMs: Date.now() - started });
          return new Response(JSON.stringify({ ok: true, ...result }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e: any) {
          await recordCronRun("ssl-expiry-check", "cron", {
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
