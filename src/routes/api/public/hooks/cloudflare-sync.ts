import { createFileRoute } from "@tanstack/react-router";
import { runCloudflareSync } from "@/lib/cloudflare.server";
import { checkHookSecret } from "@/lib/hook-auth.server";
import { recordCronRun } from "@/lib/cron-tracking.server";

export const Route = createFileRoute("/api/public/hooks/cloudflare-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = checkHookSecret(request);
        if (unauth) return unauth;
        const started = Date.now();
        try {
          const result = await runCloudflareSync({ fullResync: false });
          const ok = "ok" in result ? Boolean(result.ok) : true;
          await recordCronRun("cloudflare-daily-sync", "cron", {
            ok,
            error: "error" in result ? (result.error as string | undefined) : undefined,
            durationMs: Date.now() - started,
          });
          return new Response(JSON.stringify(result), {
            status: ok ? 200 : 500,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          await recordCronRun("cloudflare-daily-sync", "cron", {
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
