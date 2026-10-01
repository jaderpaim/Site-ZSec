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

const CRITICIDADES = ["Baixo", "Médio", "Alto", "Crítico"] as const;
const STATUSES = ["Ativo", "Em manutenção", "Desativado"] as const;

const UpsertSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  nome: z.string().min(1).max(200),
  tipo: z.string().min(1).max(100),
  ip_hostname: z.string().max(255).optional().nullable(),
  fabricante_modelo: z.string().max(255).optional().nullable(),
  sistema_operacional: z.string().max(255).optional().nullable(),
  responsavel_id: z.string().uuid().optional().nullable(),
  departamento_id: z.string().uuid().optional().nullable(),
  localizacao: z.string().max(255).optional().nullable(),
  criticidade: z.enum(CRITICIDADES),
  status: z.enum(STATUSES),
  observacoes: z.string().max(2000).optional().nullable(),
});

export type CmdbAtivo = {
  id: string;
  nome: string;
  tipo: string;
  ip_hostname: string | null;
  fabricante_modelo: string | null;
  sistema_operacional: string | null;
  responsavel_id: string | null;
  responsavel_nome: string | null;
  responsavel_email: string | null;
  departamento_id: string | null;
  departamento_nome: string | null;
  localizacao: string | null;
  criticidade: (typeof CRITICIDADES)[number];
  status: (typeof STATUSES)[number];
  observacoes: string | null;
  created_at: string;
  updated_at: string;
};

export const listCmdbAtivos = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await requirePermission(context.supabase, context.userId, "cmdb", "view");
    const sb = admin();
    const { data, error } = await sb
      .from("cmdb_ativos")
      .select(
        "id, nome, tipo, ip_hostname, fabricante_modelo, sistema_operacional, responsavel_id, departamento_id, localizacao, criticidade, status, observacoes, created_at, updated_at",
      )
      .order("nome");
    if (error) throw new Error(error.message);

    const ids = Array.from(new Set((data ?? []).map((r) => r.responsavel_id).filter(Boolean) as string[]));
    let profiles: Record<string, { full_name: string | null; email: string | null }> = {};
    if (ids.length > 0) {
      const { data: profs } = await sb.from("profiles").select("id, full_name, email").in("id", ids);
      profiles = Object.fromEntries((profs ?? []).map((p) => [p.id, { full_name: p.full_name, email: p.email }]));
    }

    const deptIds = Array.from(new Set((data ?? []).map((r) => r.departamento_id).filter(Boolean) as string[]));
    let departments: Record<string, string> = {};
    if (deptIds.length > 0) {
      const { data: deps } = await sb.from("departments").select("id, name").in("id", deptIds);
      departments = Object.fromEntries((deps ?? []).map((d) => [d.id, d.name]));
    }

    return (data ?? []).map((r) => ({
      ...r,
      responsavel_nome: r.responsavel_id ? (profiles[r.responsavel_id]?.full_name ?? null) : null,
      responsavel_email: r.responsavel_id ? (profiles[r.responsavel_id]?.email ?? null) : null,
      departamento_nome: r.departamento_id ? (departments[r.departamento_id] ?? null) : null,
    })) as CmdbAtivo[];
  });

export const listResponsaveis = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    // CMDB asset form needs to pick a person responsible — gated on cmdb view permission.
    await requirePermission(context.supabase, context.userId, "cmdb", "view");
    const sb = admin();
    const { data, error } = await sb
      .from("profiles")
      .select("id, full_name, email")
      .order("full_name", { nullsFirst: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as { id: string; full_name: string | null; email: string | null }[];
  });

export const listCmdbDepartamentos = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await requirePermission(context.supabase, context.userId, "cmdb", "view");
    const sb = admin();
    const { data, error } = await sb.from("departments").select("id, name").order("name");
    if (error) throw new Error(error.message);
    return (data ?? []) as { id: string; name: string }[];
  });

export const upsertCmdbAtivo = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => UpsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "cmdb", data.id ? "edit" : "create");
    const sb = admin();
    const payload = {
      nome: data.nome.trim(),
      tipo: data.tipo.trim(),
      ip_hostname: data.ip_hostname?.trim() || null,
      fabricante_modelo: data.fabricante_modelo?.trim() || null,
      sistema_operacional: data.sistema_operacional?.trim() || null,
      responsavel_id: data.responsavel_id || null,
      departamento_id: data.departamento_id || null,
      localizacao: data.localizacao?.trim() || null,
      criticidade: data.criticidade,
      status: data.status,
      observacoes: data.observacoes?.trim() || null,
    };

    if (data.id) {
      const { error } = await sb.from("cmdb_ativos").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    // created_by nunca vem do cliente: esse insert usa o client service-role
    // (bypassa RLS), então a proteção tem que ser aqui -- não dá pra confiar
    // em data.created_by pra dizer quem criou o ativo.
    const { data: inserted, error } = await sb
      .from("cmdb_ativos")
      .insert({ ...payload, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: inserted.id };
  });

export const deleteCmdbAtivo = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "cmdb", "delete");
    const sb = admin();
    const { error } = await sb.from("cmdb_ativos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
