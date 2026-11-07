import { createFileRoute } from "@tanstack/react-router";
import { runAuditWatch } from "@/lib/cloudflare.guard.server";
import { checkHookSecret } from "@/lib/hook-auth.server";
import { recordCronRun } from "@/lib/cron-tracking.server";

// Monitor do log de auditoria da conta Cloudflare (cron a cada 5 min).
export const Route = createFileRoute("/api/public/hooks/cloudflare-audit-watch")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = checkHookSecret(request);
        if (unauth) return unauth;
        const started = Date.now();
        try {
          const result = await runAuditWatch();
          await recordCronRun("cloudflare-audit-watch", "cron", {
            ok: result.ok,
            error: result.errors.length ? result.errors.join(" | ") : undefined,
            durationMs: Date.now() - started,
          });
          return new Response(JSON.stringify(result), {
            status: result.ok ? 200 : 500,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          await recordCronRun("cloudflare-audit-watch", "cron", {
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
