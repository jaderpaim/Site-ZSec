import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requirePermission } from "@/lib/authz";

export type ApplicationRow = {
  id: string;
  name: string;
  department_id: string;
  department_name: string | null;
  created_at: string;
  updated_at: string;
  has_match: boolean;
};

export const listApplications = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .handler(async ({ context }): Promise<{ applications: ApplicationRow[] }> => {
    const { supabase } = context;
    const { data, error } = await supabase
      .from("applications")
      .select("id,name,department_id,created_at,updated_at,departments(name)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as any[];
    if (rows.length === 0) return { applications: [] };

    const names = rows.map((r) => r.name.toLowerCase());
    const [aplRes, infRes] = await Promise.all([
      supabase.from("vulnerabilities_aplicacao").select("fqdn"),
      supabase.from("vulnerabilities_infra").select("fqdn"),
    ]);
    const fqdns = new Set<string>();
    (aplRes.data ?? []).forEach((r: any) => fqdns.add(String(r.fqdn).toLowerCase()));
    (infRes.data ?? []).forEach((r: any) => fqdns.add(String(r.fqdn).toLowerCase()));

    return {
      applications: rows.map((r) => ({
        id: r.id,
        name: r.name,
        department_id: r.department_id,
        department_name: r.departments?.name ?? null,
        created_at: r.created_at,
        updated_at: r.updated_at,
        has_match: fqdns.has(r.name.toLowerCase()),
      })),
    };
  });

// Mapa FQDN → department_id exclusivo para o módulo de Vulnerabilidades.
// Requer apenas vulnerabilidades:view, sem expor o módulo de Aplicações.
export const getVulnFqdnDeptMap = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .handler(async ({ context }): Promise<Array<{ name: string; department_id: string }>> => {
    await requirePermission(context.supabase, context.userId, "vulnerabilidades", "view");
    const { data, error } = await supabaseAdmin.from("applications").select("name, department_id");
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{ name: string; department_id: string }>;
  });

export const createApplication = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) =>
    z
      .object({
        name: z.string().trim().min(1).max(255),
        department_id: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("applications").insert({
      name: data.name,
      department_id: data.department_id,
      created_by: userId,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateApplication = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        name: z.string().trim().min(1).max(255),
        department_id: z.string().uuid(),
      })
      .parse(input),
  )
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { id, ...rest } = data;
    const { error } = await supabase
      .from("applications")
      .update(rest as never)
      .eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteApplication = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ context, data }) => {
    const { supabase } = context;
    const { error } = await supabase.from("applications").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Usado pelo módulo de Vulnerabilidades para mapear FQDN → departamento
// Usa supabaseAdmin para ignorar RLS — lê todas as aplicações independente do usuário
export const listApplicationsFqdnMap = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .handler(async ({ context }): Promise<Array<{ name: string; department_id: string }>> => {
    await requirePermission(context.supabase, context.userId, "aplicacoes", "view");
    const { data, error } = await supabaseAdmin.from("applications").select("name, department_id");
    if (error) throw new Error(error.message);
    return (data ?? []) as Array<{ name: string; department_id: string }>;
  });

// Usado pelo módulo de Aplicações — filtra pelo departamento do usuário logado
export const listApplicationsByDept = createServerFn({ method: "GET" })
  .middleware([requireActiveSession])
  .handler(async ({ context }): Promise<{ applications: ApplicationRow[] }> => {
    const { supabase, userId } = context;
    await requirePermission(supabase, userId, "aplicacoes", "view");

    // Pega o department_id do perfil do usuário
    const { data: profile } = await supabase.from("profiles").select("department_id").eq("id", userId).maybeSingle();

    const deptId = profile?.department_id;

    // Admin global vê tudo; demais usuários veem só o próprio departamento
    const { data: roleRow } = await supabase.from("user_roles").select("role").eq("user_id", userId).maybeSingle();
    const isGlobalAdmin = roleRow?.role === "admin" || roleRow?.role === "super_admin";

    // Sem departamento e sem admin global: não vê nenhuma aplicação (evita vazar tudo)
    if (!isGlobalAdmin && !deptId) return { applications: [] };

    let query = supabaseAdmin
      .from("applications")
      .select("id,name,department_id,created_at,updated_at,departments(name)")
      .order("created_at", { ascending: false });

    if (!isGlobalAdmin && deptId) query = query.eq("department_id", deptId);

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = (data ?? []) as any[];
    if (rows.length === 0) return { applications: [] };

    // Verifica match com FQDNs de vulnerabilidades
    const [aplRes, infRes] = await Promise.all([
      supabaseAdmin.from("vulnerabilities_aplicacao").select("fqdn"),
      supabaseAdmin.from("vulnerabilities_infra").select("fqdn"),
    ]);
    const fqdns = new Set<string>();
    (aplRes.data ?? []).forEach((r: any) => fqdns.add(String(r.fqdn).toLowerCase()));
    (infRes.data ?? []).forEach((r: any) => fqdns.add(String(r.fqdn).toLowerCase()));

    return {
      applications: rows.map((r) => ({
        id: r.id,
        name: r.name,
        department_id: r.department_id,
        department_name: r.departments?.name ?? null,
        created_at: r.created_at,
        updated_at: r.updated_at,
        has_match: fqdns.has(r.name.toLowerCase()),
      })),
    };
  });
