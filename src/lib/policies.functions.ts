import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveSession } from "@/lib/session-policy.middleware";

const POLICY_STATUSES = ["Publicada", "Em Validação", "Revisão"] as const;

const POLICY_TIPOS = ["Política", "Processo"] as const;

const PolicyInput = z.object({
  name: z.string().min(1).max(255),
  status: z.enum(POLICY_STATUSES).default("Revisão"),
  tipo: z.enum(POLICY_TIPOS).default("Política"),
  onda: z.string().max(50).nullable().optional(),
  indicador: z.string().max(100).nullable().optional(),
  publicacao: z.string().nullable().optional(), // ISO date
  revisao: z.string().nullable().optional(),
  trained_count: z.number().int().min(0).default(0),
  target_count: z.number().int().min(0).default(0),
});

// Patch usa schema sem defaults para não sobrescrever valores enviados
const PolicyPatch = z.object({
  name: z.string().min(1).max(255).optional(),
  status: z.enum(POLICY_STATUSES).optional(),
  tipo: z.enum(POLICY_TIPOS).optional(),
  onda: z.string().max(50).nullable().optional(),
  indicador: z.string().max(100).nullable().optional(),
  publicacao: z.string().nullable().optional(),
  revisao: z.string().nullable().optional(),
  trained_count: z.number().int().min(0).optional(),
  target_count: z.number().int().min(0).optional(),
});

async function assertCanWrite(supabase: any, userId: string, action: "create" | "edit" | "delete") {
  const { data: roleRow } = await supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
  if (roleRow?.role === "admin" || roleRow?.role === "super_admin") return;
  const { data: ma } = await supabase
    .from("module_admins")
    .select("module_slug")
    .eq("user_id", userId)
    .eq("module_slug", "politicas")
    .maybeSingle();
  if (ma) return;
  const { data: perm } = await supabase
    .from("user_module_permissions")
    .select("action")
    .eq("user_id", userId)
    .eq("module_slug", "politicas")
    .eq("action", action)
    .maybeSingle();
  if (perm) return;
  throw new Error("Forbidden: sem permissão para " + action + " políticas");
}

export const listPolicies = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("policies")
      .select(
        "id, name, status, tipo, onda, indicador, publicacao, revisao, trained_count, target_count, created_at, updated_at",
      )
      .order("name", { ascending: true });
    if (error) throw new Error(error.message);
    return { policies: data ?? [] };
  });

export const createPolicy = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => PolicyInput.parse(input))
  .handler(async ({ data, context }) => {
    await assertCanWrite(context.supabase, context.userId, "create");
    const { data: row, error } = await context.supabase
      .from("policies")
      .insert({ ...data, created_by: context.userId })
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { policy: row };
  });

export const updatePolicy = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => z.object({ id: z.string().uuid(), patch: PolicyPatch }).parse(input))
  .handler(async ({ data, context }) => {
    await assertCanWrite(context.supabase, context.userId, "edit");
    const { data: row, error } = await context.supabase
      .from("policies")
      .update(data.patch)
      .eq("id", data.id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    return { policy: row };
  });

export const deletePolicy = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertCanWrite(context.supabase, context.userId, "delete");
    const { error } = await context.supabase.from("policies").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
