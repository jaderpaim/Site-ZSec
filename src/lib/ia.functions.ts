import { createServerFn } from "@tanstack/react-start";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { requirePermission } from "@/lib/authz";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type IaFilterInput = {
  from?: string;
  to?: string;
  dept?: string;
  tool?: string;
  unit?: string;
  user?: string;
};

export type IaRanking = {
  totals: { events: number; users: number; tools: number };
  byTool: Array<{ name: string; count: number; userCount: number; users: string[] }>;
  byDept: Array<{ name: string; count: number; userCount: number; users: string[] }>;
  series: Array<{ d: string; count: number }>;
  filterOptions: {
    departments: Array<{ id: string; name: string }>;
    tools: string[];
    units: string[];
    users: string[];
  };
  dataRange: { min: string | null; max: string | null };
  lastSyncAt: string | null;
};

export const getIaRanking = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((data: IaFilterInput | undefined) => data ?? {})
  .handler(async ({ context, data }): Promise<IaRanking> => {
    await requirePermission(context.supabase, context.userId, "ranking-ia", "view");
    const sb = supabaseAdmin as any;

    const to = data.to ? new Date(data.to) : new Date();
    let from = data.from ? new Date(data.from) : new Date(to.getTime() - 7 * 24 * 60 * 60 * 1000);

    // "Todos os períodos" manda from = 1970-01-01 — isso faz o RPC gerar
    // buckets semanais desde 1970 até hoje (milhares de pontos quase todos
    // zerados, só os recentes com dado real). Mesmo problema já corrigido em
    // getSophosOverview (sophos.functions.ts); clampar para a data real do
    // primeiro evento antes de chamar o RPC.
    if (from.getFullYear() < 2010) {
      const { data: earliest } = await sb
        .from("ia_web_events")
        .select("event_at")
        .order("event_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      from = earliest?.event_at ? new Date(earliest.event_at) : new Date(to.getTime() - 30 * 24 * 60 * 60 * 1000);
    }

    const { data: result, error } = await (context.supabase as any).rpc("get_ia_ranking_overview", {
      p_from: from.toISOString(),
      p_to: to.toISOString(),
      p_dept: data.dept && data.dept !== "all" ? data.dept : null,
      p_tool: data.tool && data.tool !== "all" ? data.tool : null,
      p_unit: data.unit && data.unit !== "all" ? data.unit : null,
      p_user: data.user && data.user !== "all" ? data.user : null,
    });
    if (error) throw new Error(error.message);
    return result as unknown as IaRanking;
  });

export const syncIaWebEvents = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    const { requireAdminOrAnalista } = await import("@/lib/authz");
    await requireAdminOrAnalista(context.supabase, context.userId);

    // eventsOnly: este botão só precisa dos eventos SIEM (origem dos
    // ia_web_events) — pular endpoints/alerts/policies, que já são
    // sincronizados separadamente pelo cron diário do Sophos XDR. Isso é o
    // que de fato deixava o sync lento (paginação completa na API da Sophos).
    // rebuildIaWebEvents(7): mesma janela do cron horário "Ranking IA Sync".
    // sophos_events tem ~210k linhas nos últimos 30 dias (vs ~85k em 7) — um
    // rebuild de 30d aqui media ~5min sem ganho real, já que dias mais
    // antigos já são mantidos frescos pelo cron e pelo ingest incremental
    // que roda dentro de toda chamada a runSophosSync.
    const started = Date.now();
    const { runSophosSync } = await import("./sophos.server");
    const { rebuildIaWebEvents } = await import("./ia.server");
    const { recordCronRun } = await import("./cron-tracking.server");
    try {
      const result = await runSophosSync({ eventsOnly: true });
      const processed = await rebuildIaWebEvents(7);
      await recordCronRun("ranking-ia-sync", "manual", { ok: true, durationMs: Date.now() - started });
      return { ok: true as const, sync: result, iaProcessed: processed };
    } catch (e) {
      await recordCronRun("ranking-ia-sync", "manual", {
        ok: false,
        error: (e as Error).message,
        durationMs: Date.now() - started,
      });
      throw e;
    }
  });

export type RankingIaUsuario = {
  user_name: string;
  total_acessos: number;
  ultimo_acesso: string | null;
};

export type RankingIaUsuariosInput = {
  limit?: number;
  tool?: string;
  dept?: string;
  unit?: string;
  from?: string;
  to?: string;
};

export const getRankingIaUsuarios = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((data: RankingIaUsuariosInput | undefined) => ({
    limit: Math.min(Math.max(data?.limit ?? 20, 1), 5000),
    tool: data?.tool && data.tool !== "all" ? data.tool : undefined,
    dept: data?.dept && data.dept !== "all" ? data.dept : undefined,
    unit: data?.unit && data.unit !== "all" ? data.unit : undefined,
    from: data?.from,
    to: data?.to,
  }))
  .handler(async ({ context, data }): Promise<RankingIaUsuario[]> => {
    await requirePermission(context.supabase, context.userId, "ranking-ia", "view");
    const fromIso = data.from ?? new Date(0).toISOString();
    const toIso = data.to ?? new Date().toISOString();

    const { data: rows, error } = await (supabaseAdmin as any).rpc("get_ranking_ia_usuarios", {
      p_from: fromIso,
      p_to: toIso,
      p_tool: data.tool ?? null,
      p_dept: data.dept ?? null,
      p_unit: data.unit ?? null,
      p_limit: data.limit,
    });
    if (error) throw new Error(error.message);
    return (rows ?? []) as unknown as RankingIaUsuario[];
  });
