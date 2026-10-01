// Funções reutilizáveis para outros módulos consumirem a integração SendGrid
// (estatísticas, conta, logs de atividade). Somente leitura — sem envio de e-mail.
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { requireAdminOrAnalista } from "@/lib/authz";

export const getSendGridStatsOverview = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .inputValidator((input) =>
    z
      .object({
        startDate: z.string(),
        endDate: z.string().optional(),
        aggregatedBy: z.enum(["day", "week", "month"]).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await requireAdminOrAnalista(context.supabase, context.userId);
    const { getSendGridStats } = await import("./sendgrid.server");
    return getSendGridStats(data);
  });

export const getSendGridAccountDetails = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await requireAdminOrAnalista(context.supabase, context.userId);
    const { getSendGridAccountInfo } = await import("./sendgrid.server");
    return getSendGridAccountInfo();
  });

export const getSendGridActivityLogs = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .inputValidator((input) =>
    z
      .object({ query: z.string().optional(), limit: z.number().int().min(1).max(200).optional() })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    await requireAdminOrAnalista(context.supabase, context.userId);
    const { getSendGridActivity } = await import("./sendgrid.server");
    return getSendGridActivity(data);
  });
