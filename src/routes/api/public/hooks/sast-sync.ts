import { createFileRoute } from "@tanstack/react-router";
import { checkHookSecret } from "@/lib/hook-auth.server";
import { recordCronAttemptStart, recordCronRun } from "@/lib/cron-tracking.server";

export const Route = createFileRoute("/api/public/hooks/sast-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = checkHookSecret(request);
        if (unauth) return unauth;
        const started = Date.now();
        await recordCronAttemptStart("sast-sync", "cron");
        try {
          const { syncSastFromAppInsights } = await import("@/lib/sast.server");
          // ?lookbackDays=N -- só pra reprocesso/backfill manual, ignora o
          // cursor salvo. O cron chama sem query string (usa o cursor; na
          // primeira execução, sem cursor, já faz backfill de 90 dias).
          const lookbackDays = Number(new URL(request.url).searchParams.get("lookbackDays") || "");
          const result = await syncSastFromAppInsights(
            Number.isFinite(lookbackDays) && lookbackDays > 0 ? { lookbackDays } : {},
          );
          await recordCronRun("sast-sync", "cron", {
            ok: result.ok,
            error: result.error,
            durationMs: Date.now() - started,
          });
          return new Response(JSON.stringify(result), {
            status: result.ok ? 200 : 500,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          await recordCronRun("sast-sync", "cron", {
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
