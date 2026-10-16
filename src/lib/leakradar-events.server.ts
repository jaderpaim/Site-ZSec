// Server-only: grava eventos no log da credencial (leakradar_events). Melhor
// esforço — uma falha aqui nunca derruba a ação principal.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const adminDb = supabaseAdmin as unknown as { from: (t: string) => any };

export type LeakEventTone = "ok" | "warn" | "crit" | "info" | "neutral";

export async function logLeakEvent(e: {
  leakId: string;
  incidentId?: string | null;
  label: string;
  detail?: string | null;
  tone?: LeakEventTone | null;
  userId?: string | null;
}): Promise<void> {
  try {
    await adminDb.from("leakradar_events").insert({
      leak_id: e.leakId,
      incident_id: e.incidentId ?? null,
      label: e.label,
      detail: e.detail ?? null,
      tone: e.tone ?? null,
      created_by: e.userId ?? null,
    });
  } catch {
    /* evento é melhor esforço */
  }
}
