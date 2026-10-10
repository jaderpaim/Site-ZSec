// Disparo manual de cron jobs ("Sincronizar agora") e status de sincronização
// por módulo. O disparo chama a MESMA rota /api/public/hooks/* que o pg_cron
// chama — manual e automático passam pelo mesmo caminho de código.
import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { hasPermission } from "@/lib/authz";
import { logAudit } from "@/lib/audit-log.functions";
import { recordCronAttemptStart } from "@/lib/cron-tracking.server";
import { CRON_JOB_MODULE, MODULE_CRON_JOBS } from "@/lib/cron-modules";
import { appUrl } from "@/lib/app-url";

export type ModuleSyncJob = {
  job_name: string;
  label: string | null;
  enabled: boolean;
  expected_interval_minutes: number;
  last_attempt_at: string | null;
  last_success_at: string | null;
  last_ok: boolean | null;
  last_error: string | null;
  last_trigger: string | null;
  last_duration_ms: number | null;
  canRun: boolean;
};

function hookUrlFor(hookPath: string): string {
  return `${appUrl()}${hookPath}`;
}

async function hasRole(sb: SupabaseClient, userId: string, role: string): Promise<boolean> {
  const { data } = await sb.rpc("has_role", { _user_id: userId, _role: role as never });
  return data === true;
}

async function isGlobalAdmin(sb: SupabaseClient, userId: string): Promise<boolean> {
  const [a, s] = await Promise.all([
    hasRole(sb, userId, "admin"),
    hasRole(sb, userId, "super_admin"),
  ]);
  return a || s;
}

/** Mesma regra que o botão "Sincronizar" de cada módulo aplicava. */
async function canRunJob(
  sb: SupabaseClient,
  userId: string,
  jobName: string,
  globalAdmin: boolean,
): Promise<boolean> {
  if (globalAdmin) return true;
  const info = CRON_JOB_MODULE[jobName];
  if (!info) return false;
  if (info.rule === "execute") return hasPermission(sb, userId, info.module, "execute");
  if (info.rule === "analista") return hasRole(sb, userId, "analista");
  const { data } = await sb.rpc("is_module_admin", { _user_id: userId, _module: info.module });
  return data === true;
}

export const getModuleSyncStatus = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .inputValidator((input: { moduleSlug: string }) =>
    z.object({ moduleSlug: z.string().min(1).max(64) }).parse(input),
  )
  .handler(async ({ data, context }): Promise<{ jobs: ModuleSyncJob[] }> => {
    const jobNames = MODULE_CRON_JOBS[data.moduleSlug];
    if (!jobNames?.length) return { jobs: [] };
    const sb = context.supabase as SupabaseClient;
    const globalAdmin = await isGlobalAdmin(sb, context.userId);
    // Quem vê o módulo vê quando ele sincronizou
    if (!globalAdmin && !(await hasPermission(sb, context.userId, data.moduleSlug, "view")))
      return { jobs: [] };

    const { data: rows, error } = await supabaseAdmin
      .from("cron_job_runs")
      .select(
        "job_name, label, enabled, expected_interval_minutes, last_attempt_at, last_success_at, last_ok, last_error, last_trigger, last_duration_ms",
      )
      .in("job_name", jobNames);
    if (error) throw new Error(error.message);

    const jobs = await Promise.all(
      jobNames
        .map((j) => (rows ?? []).find((r) => r.job_name === j))
        .filter((r): r is NonNullable<typeof r> => !!r)
        .map(async (r) => ({
          job_name: r.job_name,
          label: r.label ?? null,
          enabled: r.enabled !== false,
          expected_interval_minutes: r.expected_interval_minutes,
          last_attempt_at: r.last_attempt_at ?? null,
          last_success_at: r.last_success_at ?? null,
          last_ok: r.last_ok ?? null,
          last_error: r.last_error ?? null,
          last_trigger: r.last_trigger ?? null,
          last_duration_ms: r.last_duration_ms ?? null,
          canRun: await canRunJob(sb, context.userId, r.job_name, globalAdmin),
        })),
    );
    return { jobs };
  });

export const runCronJobNow = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { jobName: string }) =>
    z.object({ jobName: z.string().min(1).max(100) }).parse(input),
  )
  .handler(
    async ({ data, context }): Promise<{ ok: boolean; finished: boolean; error?: string }> => {
      const sb = context.supabase as SupabaseClient;
      const globalAdmin = await isGlobalAdmin(sb, context.userId);
      if (!(await canRunJob(sb, context.userId, data.jobName, globalAdmin))) {
        return {
          ok: false,
          finished: true,
          error: "Você não tem permissão para disparar este job.",
        };
      }
      const secret = process.env.HOOK_SECRET;
      if (!secret)
        return { ok: false, finished: true, error: "HOOK_SECRET não configurado no servidor." };

      const { data: row, error } = await supabaseAdmin
        .from("cron_job_runs")
        .select("hook_path, last_ok, last_attempt_at")
        .eq("job_name", data.jobName)
        .maybeSingle();
      if (error) return { ok: false, finished: true, error: error.message };
      if (!row?.hook_path)
        return { ok: false, finished: true, error: "Job sem rota de execução cadastrada." };

      // Já rodando (last_ok null com tentativa recente) — não empilha outra execução
      const startedAgo = row.last_attempt_at
        ? Date.now() - new Date(row.last_attempt_at).getTime()
        : Infinity;
      if (row.last_ok === null && startedAgo < 30 * 60 * 1000) {
        return { ok: false, finished: true, error: "Este job já está em execução." };
      }

      await recordCronAttemptStart(data.jobName, "manual");

      // Syncs longos passam do tempo de uma requisição: dispara e espera só uns
      // segundos para pegar falha imediata (401, rota inexistente, erro rápido).
      // O resultado final fica registrado em cron_job_runs pela própria rota.
      const call = fetch(hookUrlFor(row.hook_path), {
        method: "POST",
        headers: { "x-hook-secret": secret, "Content-Type": "application/json" },
        body: "{}",
      }).then(
        (r) => ({ done: true as const, status: r.status }),
        (e: unknown) => ({
          done: true as const,
          status: 0,
          error: e instanceof Error ? e.message : String(e),
        }),
      );
      const early = await Promise.race([
        call,
        new Promise<{ done: false }>((resolve) => setTimeout(() => resolve({ done: false }), 4000)),
      ]);

      const failed = early.done && (early.status < 200 || early.status >= 300);
      const errMsg = failed
        ? ("error" in early && early.error) || `HTTP ${early.status}`
        : undefined;
      if (failed && (early.status === 0 || early.status === 401 || early.status === 404)) {
        // A rota nem chegou a rodar o job — devolve o estado anterior ao job
        await supabaseAdmin
          .from("cron_job_runs")
          .update({ last_ok: false, last_error: `Disparo manual falhou: ${errMsg}` })
          .eq("job_name", data.jobName);
      }

      await logAudit({
        userId: context.userId,
        modulo: "cron-jobs",
        acao: "run",
        descricao: `Disparou manualmente o cron job "${data.jobName}"`,
        status: failed ? "error" : "success",
        mensagemErro: errMsg ?? null,
        detalhes: { jobName: data.jobName },
      });

      if (failed) return { ok: false, finished: true, error: errMsg };
      return { ok: true, finished: early.done };
    },
  );
