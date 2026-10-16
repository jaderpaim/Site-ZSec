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

// Status do incidente reflete no status da credencial de origem (sincronização
// pedida: o workflow em Incidentes dirige o status na aba Credenciais).
const INC_TO_LEAK_STATUS: Record<string, string> = {
  aberto: "em_tratamento",
  em_andamento: "em_tratamento",
  resolvido: "resolvido",
  cancelado: "novo",
};
async function syncLeakStatus(adminDb: AnyDb, leakId: string, incStatus: string, userId: string) {
  const alvo = INC_TO_LEAK_STATUS[incStatus];
  if (!alvo) return;
  await adminDb
    .from("leakradar_leaks")
    .update({
      status: alvo,
      status_updated_at: new Date().toISOString(),
      status_updated_by: userId,
    })
    .eq("id", leakId);
}

const SEVERITIES = ["baixa", "media", "alta", "critica"] as const;
const INCIDENT_STATUSES = ["aberto", "em_andamento", "resolvido", "cancelado"] as const;
const CHANNEL_KINDS = ["email", "teams", "google_chat", "webhook"] as const;

export type IncidentRow = {
  id: string;
  ref_code: string;
  leak_id: string | null;
  title: string;
  account: string | null;
  category: string | null;
  severity: (typeof SEVERITIES)[number];
  status: (typeof INCIDENT_STATUSES)[number];
  description: string | null;
  external_ref: string | null;
  resolution: string | null;
  resolved_at: string | null;
  notified_at: string | null;
  last_notify: Array<{ channel: string; kind: string; ok: boolean; error?: string }> | null;
  created_at: string;
};

export type IncidentChannel = {
  id: string;
  name: string;
  kind: (typeof CHANNEL_KINDS)[number];
  target_hint: string;
  min_severity: (typeof SEVERITIES)[number];
  enabled: boolean;
};

async function requireModuleAdmin(sb: SupabaseClient, userId: string): Promise<void> {
  const [admin, superAdmin, modAdmin] = await Promise.all([
    sb.rpc("has_role", { _user_id: userId, _role: "admin" as never }),
    sb.rpc("has_role", { _user_id: userId, _role: "super_admin" as never }),
    sb.rpc("is_module_admin", { _user_id: userId, _module: MODULE }),
  ]);
  if (admin.data === true || superAdmin.data === true || modAdmin.data === true) return;
  throw new Error("Acesso negado: configurar canais requer admin do módulo.");
}

// E-mail aparece como está; URL de webhook é mascarada (só o host).
function targetHint(kind: string, target: string): string {
  if (kind === "email") return target;
  try {
    return new URL(target).hostname;
  } catch {
    return "••••";
  }
}

export const listIncidents = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    const { data, error } = await db(context.supabase)
      .from("leakradar_incidents")
      .select(
        "id, ref_code, leak_id, title, account, category, severity, status, description, external_ref, resolution, resolved_at, notified_at, last_notify, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);
    return { incidents: (data ?? []) as IncidentRow[] };
  });

const CreateSchema = z.object({
  leakId: z.string().uuid().nullable().optional(),
  title: z.string().min(1).max(200),
  severity: z.enum(SEVERITIES),
  description: z.string().max(4000).nullable().optional(),
});

export const createIncident = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => CreateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase as SupabaseClient, context.userId, MODULE, "edit");
    const adminDb = db(supabaseAdmin);

    let account: string | null = null;
    let category: string | null = null;
    if (data.leakId) {
      const { data: leak } = await adminDb
        .from("leakradar_leaks")
        .select("username, category, status, added_at")
        .eq("id", data.leakId)
        .maybeSingle();
      if (!leak) throw new Error("Credencial não encontrada.");
      account = (leak.username as string | null) ?? null;
      category = (leak.category as string | null) ?? null;

      // Marcada como risco aceito / falso positivo não abre incidente.
      if (leak.status === "risco_aceito" || leak.status === "falso_positivo") {
        throw new Error(
          "Credencial marcada como risco aceito ou falso positivo — não é possível abrir incidente.",
        );
      }

      // Um incidente por captura: só abre outro se foi reindexada depois.
      const { data: incs } = await adminDb
        .from("leakradar_incidents")
        .select("ref_code, created_at")
        .eq("leak_id", data.leakId)
        .order("created_at", { ascending: false })
        .limit(1);
      const newest = (incs ?? [])[0] as { ref_code: string; created_at: string } | undefined;
      const addedMs = leak.added_at ? new Date(leak.added_at as string).getTime() : 0;
      if (newest && !(addedMs > new Date(newest.created_at).getTime())) {
        throw new Error(
          `Já existe o incidente ${newest.ref_code} para esta captura. Um novo só após nova indexação no CTI.`,
        );
      }
    }

    const { data: inc, error } = await adminDb
      .from("leakradar_incidents")
      .insert({
        leak_id: data.leakId ?? null,
        title: data.title.trim(),
        account,
        category,
        severity: data.severity,
        description: data.description?.trim() || null,
        created_by: context.userId,
      })
      .select("id, ref_code, title, account, category, severity, description")
      .single();
    if (error) throw new Error(error.message);

    // Dispara os alertas (melhor esforço) e grava o resultado.
    const { dispatchIncident } = await import("./leakradar-incidents.server");
    const results = await dispatchIncident({
      id: inc.id as string,
      refCode: inc.ref_code as string,
      title: inc.title as string,
      account: inc.account as string | null,
      category: inc.category as string | null,
      severity: inc.severity as IncidentRow["severity"],
      description: inc.description as string | null,
    });
    await adminDb
      .from("leakradar_incidents")
      .update({ notified_at: new Date().toISOString(), last_notify: results })
      .eq("id", inc.id);

    // Abrir incidente para uma credencial move ela para "em tratamento".
    if (data.leakId) {
      await syncLeakStatus(adminDb, data.leakId, "aberto", context.userId);
      const { logLeakEvent } = await import("./leakradar-events.server");
      await logLeakEvent({
        leakId: data.leakId,
        incidentId: inc.id as string,
        label: `Incidente aberto (${inc.ref_code})`,
        detail: data.description?.trim() || null,
        tone: "warn",
        userId: context.userId,
      });
    }

    await logAudit({
      userId: context.userId,
      modulo: MODULE,
      acao: "abrir_incidente",
      descricao: `Abriu incidente "${data.title}" (${data.severity})`,
      status: "success",
      detalhes: {
        id: inc.id,
        severidade: data.severity,
        canais_ok: results.filter((r) => r.ok).length,
        canais_falha: results.filter((r) => !r.ok).length,
      },
    });
    return { id: inc.id as string, refCode: inc.ref_code as string, dispatch: results };
  });

const UpdateSchema = z.object({
  id: z.string().uuid(),
  status: z.enum(INCIDENT_STATUSES).optional(),
  external_ref: z.string().max(200).nullable().optional(),
  resolution: z.string().max(4000).nullable().optional(),
});

export const updateIncident = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => UpdateSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase as SupabaseClient, context.userId, MODULE, "edit");
    const adminDb = db(supabaseAdmin);

    // Estado terminal (resolvido/cancelado) é definitivo — preserva o log.
    const { data: atual } = await adminDb
      .from("leakradar_incidents")
      .select("status")
      .eq("id", data.id)
      .maybeSingle();
    if (!atual) throw new Error("Incidente não encontrado.");
    if (atual.status === "resolvido" || atual.status === "cancelado") {
      throw new Error("Incidente encerrado — não pode ser alterado (log preservado).");
    }

    const patch: Record<string, unknown> = {};
    if (data.external_ref !== undefined) patch.external_ref = data.external_ref?.trim() || null;
    if (data.resolution !== undefined) patch.resolution = data.resolution?.trim() || null;

    if (data.status) {
      patch.status = data.status;
      if (data.status === "resolvido") {
        // Concluir exige anotação do que foi feito (regra do workflow).
        const resolucao = (data.resolution ?? "").trim();
        if (!resolucao) throw new Error("Informe o que foi feito para concluir o incidente.");
        patch.resolution = resolucao;
        patch.resolved_at = new Date().toISOString();
        patch.resolved_by = context.userId;
      }
    }

    if (Object.keys(patch).length === 0) return { ok: true };
    const { data: updated, error } = await adminDb
      .from("leakradar_incidents")
      .update(patch)
      .eq("id", data.id)
      .select("leak_id, ref_code")
      .maybeSingle();
    if (error) throw new Error(error.message);

    // Reflete o novo status na credencial de origem e registra o evento.
    if (data.status && updated?.leak_id) {
      await syncLeakStatus(adminDb, updated.leak_id as string, data.status, context.userId);
      const INC_EVENT: Record<string, { label: string; tone: string }> = {
        em_andamento: { label: "em tratamento", tone: "warn" },
        resolvido: { label: "concluído", tone: "ok" },
        cancelado: { label: "cancelado", tone: "neutral" },
        aberto: { label: "reaberto", tone: "warn" },
      };
      const ev = INC_EVENT[data.status];
      if (ev) {
        const { logLeakEvent } = await import("./leakradar-events.server");
        await logLeakEvent({
          leakId: updated.leak_id as string,
          incidentId: data.id,
          label: `Incidente ${ev.label} (${updated.ref_code})`,
          detail: data.status === "resolvido" ? (patch.resolution as string | null) : null,
          tone: ev.tone as never,
          userId: context.userId,
        });
      }
    }
    await logAudit({
      userId: context.userId,
      modulo: MODULE,
      acao: "editar_incidente",
      descricao: `Atualizou o incidente ${data.id}${data.status ? ` → ${data.status}` : ""}`,
      status: "success",
      detalhes: { id: data.id, status: data.status ?? null },
    });
    return { ok: true };
  });

// ── Canais de alerta ────────────────────────────────────────────────────────

export const listIncidentChannels = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    // A tabela só é legível pela service role (URL é sensível); exige view.
    await requirePermission(context.supabase as SupabaseClient, context.userId, MODULE, "view");
    const { data, error } = await db(supabaseAdmin)
      .from("leakradar_incident_channels")
      .select("id, name, kind, target, min_severity, enabled")
      .order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    return {
      channels: (data ?? []).map(
        (c: {
          id: string;
          name: string;
          kind: string;
          target: string;
          min_severity: string;
          enabled: boolean;
        }) => ({
          id: c.id,
          name: c.name,
          kind: c.kind as IncidentChannel["kind"],
          target_hint: targetHint(c.kind, c.target),
          min_severity: c.min_severity as IncidentChannel["min_severity"],
          enabled: c.enabled,
        }),
      ) as IncidentChannel[],
    };
  });

const ChannelSchema = z.object({
  id: z.string().uuid().nullable().optional(),
  name: z.string().min(1).max(120),
  kind: z.enum(CHANNEL_KINDS),
  // vazio no update mantém o target atual (não volta pro cliente)
  target: z.string().max(2000).nullable().optional(),
  min_severity: z.enum(SEVERITIES),
  enabled: z.boolean(),
});

export const upsertIncidentChannel = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => ChannelSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requireModuleAdmin(context.supabase as SupabaseClient, context.userId);
    const adminDb = db(supabaseAdmin);
    const target = data.target?.trim();

    // Valida o target conforme o tipo.
    if (target) {
      if (data.kind === "email") {
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(target))
          throw new Error("E-mail de destino inválido.");
      } else {
        let u: URL;
        try {
          u = new URL(target);
        } catch {
          throw new Error("URL do webhook inválida.");
        }
        if (u.protocol !== "https:") throw new Error("A URL do webhook precisa ser https.");
        const h = u.hostname.toLowerCase();
        if (
          data.kind === "teams" &&
          !(h.endsWith("webhook.office.com") || h.endsWith("office.com"))
        ) {
          throw new Error("URL de Teams deve ser um Incoming Webhook (…webhook.office.com).");
        }
        if (data.kind === "google_chat" && h !== "chat.googleapis.com") {
          throw new Error("URL de Google Chat deve ser chat.googleapis.com.");
        }
      }
    } else if (!data.id) {
      throw new Error("Informe o e-mail ou a URL do webhook.");
    }

    const row: Record<string, unknown> = {
      name: data.name.trim(),
      kind: data.kind,
      min_severity: data.min_severity,
      enabled: data.enabled,
      updated_at: new Date().toISOString(),
      ...(target ? { target } : {}),
      ...(data.id ? {} : { created_by: context.userId }),
    };
    const q = adminDb.from("leakradar_incident_channels");
    const { error } = data.id ? await q.update(row).eq("id", data.id) : await q.insert(row);
    if (error) throw new Error(error.message);

    await logAudit({
      userId: context.userId,
      modulo: MODULE,
      acao: data.id ? "editar_canal_incidente" : "criar_canal_incidente",
      descricao: `${data.id ? "Editou" : "Criou"} o canal de incidente "${data.name}" (${data.kind})`,
      status: "success",
      detalhes: { kind: data.kind, min_severity: data.min_severity, enabled: data.enabled },
    });
    return { ok: true };
  });

export const deleteIncidentChannel = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireModuleAdmin(context.supabase as SupabaseClient, context.userId);
    const { error } = await db(supabaseAdmin)
      .from("leakradar_incident_channels")
      .delete()
      .eq("id", data.id);
    if (error) throw new Error(error.message);
    await logAudit({
      userId: context.userId,
      modulo: MODULE,
      acao: "remover_canal_incidente",
      descricao: "Removeu um canal de incidente",
      status: "success",
      detalhes: { id: data.id },
    });
    return { ok: true };
  });

export const testIncidentChannel = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requireModuleAdmin(context.supabase as SupabaseClient, context.userId);
    const { data: ch, error } = await db(supabaseAdmin)
      .from("leakradar_incident_channels")
      .select("id, name, kind, target, min_severity, enabled")
      .eq("id", data.id)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!ch) throw new Error("Canal não encontrado.");
    const { testIncidentChannel: run } = await import("./leakradar-incidents.server");
    try {
      await run(ch as never);
      return { ok: true as const };
    } catch (e) {
      return { ok: false as const, error: (e as Error).message };
    }
  });
