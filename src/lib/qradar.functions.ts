import { createServerFn } from "@tanstack/react-start";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { requireAdminOrAnalista } from "./authz";
import { runQradarSync } from "./qradar.server";
import { recordCronRun } from "./cron-tracking.server";

export const syncQradarFn = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await requireAdminOrAnalista(context.supabase, context.userId);
    const started = Date.now();
    const result = await runQradarSync();
    await recordCronRun("qradar-sync", "manual", {
      ok: result.ok,
      error: result.error,
      durationMs: Date.now() - started,
    });
    return result;
  });
