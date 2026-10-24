import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { logAudit } from "@/lib/audit-log.functions";
import { appUrl } from "@/lib/app-url";
import { buildHookUrl, HOOK_PATH_RE } from "@/lib/hook-path";

function admin() {
  return createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function assertAdmin(context: any) {
  const { supabase, userId } = context;
  const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!isAdmin) throw new Error("Apenas administradores podem gerenciar cron jobs");
}

/** Converte minutos de intervalo em expressão cron. */
function minutesToCron(minutes: number): string {
  if (minutes < 60) return `*/${minutes} * * * *`;
  if (minutes === 60) return `0 * * * *`;
  if (minutes < 1440) return `0 */${minutes / 60} * * *`;
  if (minutes === 1440) return `0 10 * * *`; // diário 10h UTC
  if (minutes === 10080) return `0 10 * * 1`; // semanal segunda 10h UTC
  return `0 10 * * *`;
}

function hookUrlFor(hookPath: string): string {
  return buildHookUrl(appUrl(), hookPath);
}

// ─── Schemas ───────────────────────────────────────────────────────────────────

const ToggleSchema = z.object({
  jobName: z.string().min(1),
  enabled: z.boolean(),
});

const CreateSchema = z.object({
  jobName: z.string().min(1),
  label: z.string().min(1),
  intervalMinutes: z.number().int().positive(),
  // ex: "/api/public/hooks/cloudflare-sync" — só caminhos de hook, nunca outro host
  hookPath: z.string().regex(HOOK_PATH_RE, "Use /api/public/hooks/<nome-do-hook>"),
});

const UpdateSchema = z.object({
  jobName: z.string().min(1),
  label: z.string().min(1),
  intervalMinutes: z.number().int().positive(),
});

// ─── Server functions ──────────────────────────────────────────────────────────

// Os endpoints /api/public/hooks/* validam contra HOOK_SECRET (checkHookSecret),
// não contra a publishable key do Supabase — que é pública e não serve como segredo.
export const toggleCronJob = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => ToggleSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = admin();

    const { data: row, error: fetchError } = await sb
      .from("cron_job_runs")
      .select("hook_path, expected_interval_minutes")
      .eq("job_name", data.jobName)
      .maybeSingle();
    if (fetchError) throw new Error(fetchError.message);

    const { error } = await sb.from("cron_job_runs").update({ enabled: data.enabled }).eq("job_name", data.jobName);
    if (error) throw new Error(error.message);

    // Propaga pro pg_cron de fato — sem isso, desligar/religar na UI é só
    // cosmético e o job real continua rodando (ou parado) do mesmo jeito.
    try {
      if (row?.hook_path) {
        if (data.enabled) {
          const { error: cronError } = await sb.rpc("schedule_hook_cron", {
            p_job_name: data.jobName,
            p_schedule: minutesToCron(row.expected_interval_minutes),
            p_hook_url: hookUrlFor(row.hook_path),
          });
          if (cronError) throw new Error(`Marcado como ativo, mas falha ao reagendar no pg_cron: ${cronError.message}`);
        } else {
          const { error: cronError } = await sb.rpc("unschedule_hook_cron", {
            p_job_name: data.jobName,
          });
          if (cronError) throw new Error(`Marcado como inativo, mas falha ao remover do pg_cron: ${cronError.message}`);
        }
      }
    } catch (e: unknown) {
      await logAudit({
        userId: context.userId,
        modulo: "cron-jobs",
        acao: data.enabled ? "enable" : "disable",
        descricao: `${data.enabled ? "Ativou" : "Desativou"} o cron job "${data.jobName}"`,
        status: "error",
        mensagemErro: e instanceof Error ? e.message : String(e),
        detalhes: { jobName: data.jobName, enabled: data.enabled },
      });
      throw e;
    }

    await logAudit({
      userId: context.userId,
      modulo: "cron-jobs",
      acao: data.enabled ? "enable" : "disable",
      descricao: `${data.enabled ? "Ativou" : "Desativou"} o cron job "${data.jobName}"`,
      status: "success",
      detalhes: { jobName: data.jobName, enabled: data.enabled },
    });

    return { ok: true };
  });

export const createCronJobEntry = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => CreateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = admin();

    // 1. Insere entrada de rastreamento
    const { error: insertError } = await sb.from("cron_job_runs").insert({
      job_name: data.jobName,
      label: data.label,
      expected_interval_minutes: data.intervalMinutes,
      hook_path: data.hookPath,
      enabled: true,
    });
    if (insertError) throw new Error(insertError.message);

    // 2. Agenda o job real no pg_cron via função SECURITY DEFINER (lê o
    // HOOK_SECRET do Supabase Vault internamente, não recebe mais aqui)
    const schedule = minutesToCron(data.intervalMinutes);

    const { error: cronError } = await sb.rpc("schedule_hook_cron", {
      p_job_name: data.jobName,
      p_schedule: schedule,
      p_hook_url: hookUrlFor(data.hookPath),
    });
    if (cronError) {
      // Tenta remover a entrada de rastreamento para não ficar inconsistente
      await sb.from("cron_job_runs").delete().eq("job_name", data.jobName);
      await logAudit({
        userId: context.userId,
        modulo: "cron-jobs",
        acao: "create",
        descricao: `Falha ao criar o cron job "${data.jobName}"`,
        status: "error",
        mensagemErro: cronError.message,
        detalhes: {
          jobName: data.jobName,
          label: data.label,
          intervalMinutes: data.intervalMinutes,
        },
      });
      throw new Error(`Entrada criada, mas falha ao agendar no pg_cron: ${cronError.message}`);
    }

    await logAudit({
      userId: context.userId,
      modulo: "cron-jobs",
      acao: "create",
      descricao: `Criou o cron job "${data.jobName}" (${data.label}, a cada ${data.intervalMinutes}min)`,
      status: "success",
      detalhes: { jobName: data.jobName, label: data.label, intervalMinutes: data.intervalMinutes },
    });

    return { ok: true, schedule };
  });

export const updateCronJobEntry = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => UpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const sb = admin();

    const { data: row, error: fetchError } = await sb
      .from("cron_job_runs")
      .select("hook_path, enabled")
      .eq("job_name", data.jobName)
      .maybeSingle();
    if (fetchError) throw new Error(fetchError.message);

    const { error } = await sb
      .from("cron_job_runs")
      .update({ label: data.label, expected_interval_minutes: data.intervalMinutes })
      .eq("job_name", data.jobName);
    if (error) throw new Error(error.message);

    // Reagenda no pg_cron de fato — sem isso, mudar o intervalo na UI fica só
    // na tabela de rastreamento e o job real continua no intervalo antigo.
    try {
      if (row?.hook_path && row.enabled) {
        const { error: cronError } = await sb.rpc("schedule_hook_cron", {
          p_job_name: data.jobName,
          p_schedule: minutesToCron(data.intervalMinutes),
          p_hook_url: hookUrlFor(row.hook_path),
        });
        if (cronError)
          throw new Error(`Rótulo/intervalo salvos, mas falha ao reagendar no pg_cron: ${cronError.message}`);
      }
    } catch (e: unknown) {
      await logAudit({
        userId: context.userId,
        modulo: "cron-jobs",
        acao: "update",
        descricao: `Falha ao editar o cron job "${data.jobName}"`,
        status: "error",
        mensagemErro: e instanceof Error ? e.message : String(e),
        detalhes: {
          jobName: data.jobName,
          label: data.label,
          intervalMinutes: data.intervalMinutes,
        },
      });
      throw e;
    }

    await logAudit({
      userId: context.userId,
      modulo: "cron-jobs",
      acao: "update",
      descricao: `Editou o cron job "${data.jobName}" (${data.label}, a cada ${data.intervalMinutes}min)`,
      status: "success",
      detalhes: { jobName: data.jobName, label: data.label, intervalMinutes: data.intervalMinutes },
    });

    return { ok: true };
  });
