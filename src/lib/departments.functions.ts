import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveSession } from "@/lib/session-policy.middleware";

export type DepartmentRow = {
  id: string;
  name: string;
  description: string | null;
  emails: string[];
  created_at: string;
  updated_at: string;
};

const emailsSchema = z
  .array(z.string().trim().toLowerCase().email().max(254))
  .max(20)
  .default([])
  .transform((arr) => Array.from(new Set(arr)));

export const listDepartments = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .handler(async ({ context }): Promise<{ departments: DepartmentRow[] }> => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("departments")
      .select("id,name,description,created_at,updated_at")
      .order("name");
    if (error) throw new Error(error.message);
    const base = (data ?? []).map((d: any) => ({ ...d, emails: [] as string[] }));

    // Emails are sensitive — fetch only for admin/analista via service-role client.
    const [adminRes, analistaRes] = await Promise.all([
      supabase.rpc("has_role", { _user_id: userId, _role: "admin" as any }),
      supabase.rpc("has_role", { _user_id: userId, _role: "analista" as any }),
    ]);
    const canSeeEmails = adminRes.data === true || analistaRes.data === true;
    if (canSeeEmails && base.length > 0) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: emailRows } = await supabaseAdmin
        .from("departments")
        .select("id,emails")
        .in("id", base.map((d) => d.id));
      const byId = new Map<string, string[]>(
        (emailRows ?? []).map((r: any) => [r.id, Array.isArray(r.emails) ? r.emails : []]),
      );
      for (const d of base) d.emails = byId.get(d.id) ?? [];
    }
    return { departments: base as DepartmentRow[] };
  });


export const createDepartment = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) =>
    z
      .object({
        name: z.string().trim().min(1).max(120),
        description: z.string().trim().max(255).optional().nullable(),
        emails: emailsSchema,
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("departments").insert({
      name: data.name,
      description: data.description ?? null,
      emails: data.emails,
      created_by: userId,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateDepartment = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().trim().min(1).max(120).optional(),
        description: z.string().trim().max(255).nullable().optional(),
        emails: emailsSchema.optional(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { id, ...rest } = data;
    const { error } = await supabase.from("departments").update(rest as never).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteDepartment = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase.from("departments").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
