import { createFileRoute } from "@tanstack/react-router";
import { runDastSchedules } from "@/lib/dast.server";
import { checkHookSecret } from "@/lib/hook-auth.server";
import { recordCronRun } from "@/lib/cron-tracking.server";

// Cron: dispara os scans DAST agendados que já venceram. Protegido por HOOK_SECRET.
export const Route = createFileRoute("/api/public/hooks/dast-schedules-run")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = checkHookSecret(request);
        if (unauth) return unauth;
        const started = Date.now();
        try {
          const result = await runDastSchedules();
          await recordCronRun("dast-schedules-run", "cron", { ok: true, durationMs: Date.now() - started });
          return new Response(JSON.stringify({ ok: true, ...result }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e: any) {
          await recordCronRun("dast-schedules-run", "cron", {
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
