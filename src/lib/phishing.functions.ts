import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { requireAdminOrAnalista, requirePermission } from "@/lib/authz";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { runGophishSync } from "@/lib/phishing.sync";

// ─── Types ────────────────────────────────────────────────────────────────────

export type PhishingOverview = {
  ok: true;
  syncedAt: string | null;
  kpis: {
    sent: number;
    opened: number;
    clicked: number;
    submitted: number;
    openedPct: number;
    clickedPct: number;
    compromisePct: number;
  };
  byDepartmentClicks: Array<{ dept: string; total: number }>;
  byDepartmentSubmitted: Array<{ dept: string; total: number }>;
  byHierarchy: Array<{ nivel: string; total: number }>;
  campaignsStatus: { ativas: number; arquivadas: number };
  templatesUsed: Array<{ id: number; name: string }>;
  templatesTotal: number;
  details: Array<{
    email: string;
    status: string;
    action: string;
    cargo: string;
    departamento: string;
    nivel: string;
    campanha: string;
    template_id: number | null;
    launch_date: string;
    opened: boolean;
    clicked: boolean;
    submitted: boolean;
  }>;
};

export type PhishingOverviewError = { ok: false; error: string };

export type PhishingOperations = {
  ok: true;
  syncedAt: string | null;
  users: Array<{ id: number; username: string; role?: string }>;
  groups: Array<{
    id: number;
    name: string;
    targets: number;
    modified_date?: string;
    members: Array<{ email: string; first_name?: string; last_name?: string; position?: string }>;
  }>;
  runningCampaigns: Array<{
    id: number;
    name: string;
    status: string;
    launch_date?: string;
    template?: string;
    counters: { sent: number; opened: number; clicked: number; submitted: number; reported: number };
  }>;
};

// ─── Sync (chama o core server-only) ─────────────────────────────────────────

export const syncGophishData = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await requireAdminOrAnalista(context.supabase, context.userId);
    const { recordCronRun } = await import("./cron-tracking.server");
    const started = Date.now();
    const result = await runGophishSync();
    await recordCronRun("gophish-sync", "manual", {
      ok: result.ok,
      error: result.error,
      durationMs: Date.now() - started,
    });
    return result;
  });

// ─── Sync state ───────────────────────────────────────────────────────────────

export const getGophishSyncState = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await requirePermission(context.supabase, context.userId, "phishing", "view");
    const { data } = await (supabaseAdmin as any)
      .from("gophish_cache")
      .select("synced_at, error")
      .eq("key", "campaigns")
      .maybeSingle();
    return {
      synced_at: (data?.synced_at as string | null) ?? null,
      error: (data?.error as string | null) ?? null,
    };
  });

// ─── Overview — lê o JSON pré-computado (1 query, sem processamento) ──────────

export const getPhishingOverview = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }): Promise<PhishingOverview | PhishingOverviewError> => {
    await requirePermission(context.supabase, context.userId, "phishing", "view");
    const { data, error } = await (supabaseAdmin as any)
      .from("gophish_cache")
      .select("data, synced_at, error")
      .eq("key", "overview")
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Dados não sincronizados. Clique em Sincronizar." };

    // Verifica se houve erro no último sync (lido da chave 'campaigns')
    const { data: campRow } = await (supabaseAdmin as any)
      .from("gophish_cache")
      .select("error")
      .eq("key", "campaigns")
      .maybeSingle();
    if (campRow?.error) return { ok: false, error: `Último sync com erro: ${campRow.error}` };

    const overview = data.data as any;
    if (!overview?.kpis) return { ok: false, error: "Nenhuma campanha no cache. Clique em Sincronizar." };

    return { ok: true, ...overview } as PhishingOverview;
  });

// ─── Template — busca pontual na API (ação manual do usuário) ─────────────────

export const getPhishingTemplate = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) => z.object({ id: z.number().int() }).parse(d))
  .handler(async ({ data, context }) => {
    await requireAdminOrAnalista(context.supabase, context.userId);
    const { getGophishCreds, gophishFetch } = await import("@/lib/gophish.server");
    const creds = await getGophishCreds();
    if (!creds) return { ok: false as const, error: "Integração Gophish não configurada." };
    try {
      const tpl = await gophishFetch<any>(creds, `/api/templates/${data.id}`);
      return { ok: true as const, id: tpl.id, name: tpl.name, subject: tpl.subject ?? "", html: tpl.html ?? "" };
    } catch (e: any) {
      return { ok: false as const, error: e?.message ?? "Falha ao buscar template." };
    }
  });

// ─── Template (cache) — lê do gophish_cache, seguro para phishing:view ──────

export const getPhishingTemplateCached = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((d) => z.object({ id: z.number().int() }).parse(d))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "phishing", "view");
    const { data: row } = await (supabaseAdmin as any)
      .from("gophish_cache")
      .select("data")
      .eq("key", "templates")
      .maybeSingle();
    const templates: any[] = row?.data ?? [];
    const tpl = templates.find((t: any) => t.id === data.id);
    if (!tpl) return { ok: false as const, error: "Template não encontrado no cache. Sincronize primeiro." };
    return {
      ok: true as const,
      id: tpl.id as number,
      name: tpl.name as string,
      subject: (tpl.subject ?? "") as string,
      html: (tpl.html ?? "") as string,
    };
  });

// ─── Operations — lê o JSON pré-computado (1 query, sem processamento) ────────

export const getPhishingOperations = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }): Promise<PhishingOperations | { ok: false; error: string }> => {
    await requirePermission(context.supabase, context.userId, "phishing", "view");
    const { data, error } = await (supabaseAdmin as any)
      .from("gophish_cache")
      .select("data, synced_at, error")
      .eq("key", "operations")
      .maybeSingle();

    if (error) return { ok: false, error: error.message };
    if (!data) return { ok: false, error: "Dados não sincronizados. Clique em Sincronizar." };

    const ops = data.data as any;
    if (!ops?.groups) return { ok: false, error: "Nenhuma operação no cache. Clique em Sincronizar." };

    return { ok: true, ...ops } as PhishingOperations;
  });
