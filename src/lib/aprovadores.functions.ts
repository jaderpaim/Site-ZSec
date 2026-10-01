import { createServerFn } from "@tanstack/react-start";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { requirePermission } from "@/lib/authz";

function admin() {
  const url = process.env.SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

const UpsertSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  nome: z.string().min(1).max(200),
  email: z.string().email().max(255),
  department_id: z.string().uuid(),
  ordem: z.number().int().min(1).max(50),
  // Obrigatório: o papel é o que define os grupos de aprovação "onda" (mesmo
  // papel e ordem consecutiva = qualquer um dos dois aprova e dispensa o
  // outro) usados pela GMUD para entrelaçar departamentos diferentes.
  papel: z.string().trim().min(1, "Papel é obrigatório").max(120),
  created_by: z.string().uuid().optional().nullable(),
});

export const listAprovadores = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await requirePermission(context.supabase, context.userId, "aprovadores", "view");
    const sb = admin();
    const { data, error } = await sb
      .from("aprovadores")
      .select("id, nome, email, department_id, ordem, papel, created_at, updated_at")
      .order("department_id")
      .order("ordem");
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const listAprovadoresByDepartment = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { department_id: string }) => z.object({ department_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "aprovadores", "view");
    const sb = admin();
    const { data: rows, error } = await sb
      .from("aprovadores")
      .select("id, nome, email, department_id, ordem, papel")
      .eq("department_id", data.department_id)
      .order("ordem");
    if (error) throw new Error(error.message);
    return rows ?? [];
  });

/**
 * Resumo enxuto por departamento — usado pela tela de criação de GMUD para
 * decidir quais departamentos oferecer e detectar conflito criador/aprovador,
 * sem exigir a permissão "aprovadores:view" (que é restrita) e sem expor
 * nome/e-mail de OUTROS aprovadores a quem não tem essa permissão.
 */
export const listDepartmentsApprovalSummary = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    const sb = admin();
    const { data, error } = await sb.from("aprovadores").select("department_id, email");
    if (error) throw new Error(error.message);
    const myEmail = ((context as any).claims?.email ?? "").toString().toLowerCase().trim();
    const byDept = new Map<string, { count: number; includesMe: boolean }>();
    for (const r of data ?? []) {
      const cur = byDept.get(r.department_id) ?? { count: 0, includesMe: false };
      cur.count += 1;
      if ((r.email ?? "").toLowerCase().trim() === myEmail) cur.includesMe = true;
      byDept.set(r.department_id, cur);
    }
    return [...byDept.entries()].map(([department_id, v]) => ({
      department_id,
      count: v.count,
      includesMe: v.includesMe,
    }));
  });

export const upsertAprovador = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => UpsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "aprovadores", data.id ? "edit" : "create");
    const sb = admin();
    const email = data.email.trim().toLowerCase();
    const payload = {
      nome: data.nome.trim(),
      email,
      department_id: data.department_id,
      ordem: data.ordem,
      papel: data.papel.trim(),
    };

    if (data.id) {
      const { error } = await sb.from("aprovadores").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }

    const { data: inserted, error } = await sb
      .from("aprovadores")
      .insert({ ...payload, created_by: data.created_by ?? null })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: inserted.id };
  });

export const deleteAprovador = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "aprovadores", "delete");
    const sb = admin();
    const { error } = await sb.from("aprovadores").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
