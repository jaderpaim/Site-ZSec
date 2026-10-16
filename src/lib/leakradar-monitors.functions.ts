import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requirePermission } from "@/lib/authz";
import { logAudit } from "@/lib/audit-log.functions";

type AnyDb = { from: (t: string) => any };
const db = (sb: unknown) => sb as unknown as AnyDb;
const MODULE = "threat-intel";

const CATS = ["employees", "customers", "third_parties", "all"] as const;

export type MonitorRow = {
  id: string;
  name: string;
  scope_category: (typeof CATS)[number];
  host: string | null;
  keyword: string | null;
  cond_senha_valida: boolean;
  cond_sem_mfa: boolean;
  open_incident: boolean;
  channel_ids: string[];
  enabled: boolean;
  last_run_at: string | null;
};

export type MonitorRunRow = {
  id: string;
  monitor_id: string | null;
  ran_at: string;
  checked: number;
  found: number;
  status: "ok" | "erro";
  detail: string | null;
};

export const listMonitors = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    const { data, error } = await db(context.supabase)
      .from("leakradar_monitors")
      .select(
        "id, name, scope_category, host, keyword, cond_senha_valida, cond_sem_mfa, open_incident, channel_ids, enabled, last_run_at",
      )
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return { monitors: (data ?? []) as MonitorRow[] };
  });

export const listMonitorRuns = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    const { data, error } = await db(context.supabase)
      .from("leakradar_monitor_runs")
      .select("id, monitor_id, ran_at, checked, found, status, detail")
      .order("ran_at", { ascending: false })
      .limit(50);
    if (error) throw new Error(error.message);
    return { runs: (data ?? []) as MonitorRunRow[] };
  });

// Visão geral: KPIs e feed de novidades (vazamentos recém-coletados).
export const getMonitorOverview = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    const sb = db(context.supabase);
    const seteDias = new Date(Date.now() - 7 * 86400_000).toISOString();

    const [ativos, novos7, recentes] = await Promise.all([
      sb
        .from("leakradar_monitors")
        .select("id", { count: "exact", head: true })
        .eq("enabled", true),
      sb
        .from("leakradar_leaks")
        .select("id", { count: "exact", head: true })
        .gte("first_seen_at", seteDias),
      sb
        .from("leakradar_leaks")
        .select("id, username, url_host, category, first_seen_at, password_strength")
        .order("first_seen_at", { ascending: false })
        .limit(12),
    ]);

    return {
      monitoresAtivos: ativos.count ?? 0,
      novos7: novos7.count ?? 0,
      novidades: (recentes.data ?? []) as Array<{
        id: string;
        username: string | null;
        url_host: string | null;
        category: string;
        first_seen_at: string;
        password_strength: number | null;
      }>,
    };
  });

const MonitorSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(120),
  scope_category: z.enum(CATS),
  host: z.string().max(253).nullable().optional(),
  keyword: z.string().max(120).nullable().optional(),
  cond_senha_valida: z.boolean(),
  cond_sem_mfa: z.boolean(),
  open_incident: z.boolean(),
  channel_ids: z.array(z.string().uuid()).max(20).default([]),
  enabled: z.boolean(),
});

export const upsertMonitor = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => MonitorSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase as SupabaseClient, context.userId, MODULE, "edit");
    const row = {
      name: data.name.trim(),
      scope_category: data.scope_category,
      host: data.host?.trim() || null,
      keyword: data.keyword?.trim() || null,
      cond_senha_valida: data.cond_senha_valida,
      cond_sem_mfa: data.cond_sem_mfa,
      open_incident: data.open_incident,
      channel_ids: data.channel_ids,
      enabled: data.enabled,
      updated_at: new Date().toISOString(),
      ...(data.id ? {} : { created_by: context.userId }),
    };
    const q = db(supabaseAdmin).from("leakradar_monitors");
    const { error } = data.id ? await q.update(row).eq("id", data.id) : await q.insert(row);
    if (error) throw new Error(error.message);
    await logAudit({
      userId: context.userId,
      modulo: MODULE,
      acao: data.id ? "editar_monitor" : "criar_monitor",
      descricao: `${data.id ? "Editou" : "Criou"} o monitor "${data.name}"`,
      status: "success",
      detalhes: { escopo: data.scope_category, enabled: data.enabled },
    });
    return { ok: true };
  });

export const toggleMonitor = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => z.object({ id: z.string().uuid(), enabled: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase as SupabaseClient, context.userId, MODULE, "edit");
    const { error } = await db(supabaseAdmin)
      .from("leakradar_monitors")
      .update({ enabled: data.enabled })
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMonitor = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase as SupabaseClient, context.userId, MODULE, "edit");
    const { error } = await db(supabaseAdmin).from("leakradar_monitors").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAudit({
      userId: context.userId,
      modulo: MODULE,
      acao: "remover_monitor",
      descricao: "Removeu um monitor",
      status: "success",
      detalhes: { id: data.id },
    });
    return { ok: true };
  });
