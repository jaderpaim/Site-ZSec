import { createServerFn } from "@tanstack/react-start";
import { requireActiveSession } from "@/lib/session-policy.middleware";

// Módulo DLP (Purview) — Fase 1: só leitura dos eventos já sincronizados por
// dlp-sync.ts. Sem RBAC explícito aqui de propósito: usa context.supabase
// (client user-scoped), então a RLS de dlp_events/dlp_sync_state já filtra
// quem não tem permissão — mesmo padrão de módulos RBAC padrão (não
// exclusivos) deste repo.
type AnyDb = { from: (t: string) => any };
const db = (sb: unknown) => sb as unknown as AnyDb;

export const listDlpEvents = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    const { data } = await db(context.supabase)
      .from("dlp_events")
      .select(
        "id, creation_time, collected_at, operation, workload, user_id, client_ip, policy_name, rule_name, sensitive_info, file_name, file_url, raw_event, status",
      )
      .order("creation_time", { ascending: false })
      .limit(500);
    return { events: (data ?? []) as any[] };
  });

export const getDlpSyncStatus = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    const { data } = await db(context.supabase)
      .from("dlp_sync_state")
      .select("last_collection, updated_at")
      .eq("id", "purview_dlp")
      .maybeSingle();
    return { lastCollection: (data?.last_collection as string | null) ?? null };
  });
