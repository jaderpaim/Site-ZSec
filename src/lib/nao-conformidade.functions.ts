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

export type NaoConformidadeManualRow = {
  id: string;
  plataforma: string;
  fora_compliance: string;
  prazo_resolucao: string | null;
  observacoes: string | null;
  aceite_risco: string | null;
  evidencias: string | null;
  impactos: string | null;
  data_configuracao: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const listNaoConformidadesManuais = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }): Promise<NaoConformidadeManualRow[]> => {
    await requirePermission(context.supabase, context.userId, "nao-conformidade", "view");
    const sb = admin();
    const { data, error } = await sb
      .from("nao_conformidades_manuais")
      .select(
        "id, plataforma, fora_compliance, prazo_resolucao, observacoes, aceite_risco, evidencias, impactos, data_configuracao, created_by, created_at, updated_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as NaoConformidadeManualRow[];
  });

const UpsertSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  plataforma: z.string().min(1).max(200),
  fora_compliance: z.string().min(1).max(2000),
  prazo_resolucao: z.string().optional().nullable(),
  observacoes: z.string().max(2000).optional().nullable(),
  aceite_risco: z.string().max(500).optional().nullable(),
  evidencias: z.string().max(2000).optional().nullable(),
  impactos: z.string().max(2000).optional().nullable(),
  data_configuracao: z.string().optional().nullable(),
});

export const upsertNaoConformidadeManual = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => UpsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "nao-conformidade", data.id ? "edit" : "create");
    const sb = admin();
    const payload = {
      plataforma: data.plataforma.trim(),
      fora_compliance: data.fora_compliance.trim(),
      prazo_resolucao: data.prazo_resolucao || null,
      observacoes: data.observacoes?.trim() || null,
      aceite_risco: data.aceite_risco?.trim() || null,
      evidencias: data.evidencias?.trim() || null,
      impactos: data.impactos?.trim() || null,
      data_configuracao: data.data_configuracao || null,
    };
    if (data.id) {
      const { error } = await sb.from("nao_conformidades_manuais").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: inserted, error } = await sb
      .from("nao_conformidades_manuais")
      .insert({ ...payload, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: inserted.id };
  });

export const deleteNaoConformidadeManual = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "nao-conformidade", "delete");
    const sb = admin();
    const { error } = await sb.from("nao_conformidades_manuais").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── Chamados atrasados (SI -> outras áreas) ─────────────────────────────────────
export type NaoConformidadeChamadoRow = {
  id: string;
  chamado: string;
  descricao: string | null;
  data_abertura: string | null;
  responsavel: string | null;
  impacto: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

export const listNaoConformidadeChamados = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }): Promise<NaoConformidadeChamadoRow[]> => {
    await requirePermission(context.supabase, context.userId, "nao-conformidade", "view");
    const sb = admin();
    const { data, error } = await sb
      .from("nao_conformidade_chamados")
      .select("id, chamado, descricao, data_abertura, responsavel, impacto, created_by, created_at, updated_at")
      .order("data_abertura", { ascending: true, nullsFirst: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as NaoConformidadeChamadoRow[];
  });

const ChamadoUpsertSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  chamado: z.string().min(1).max(200),
  descricao: z.string().max(2000).optional().nullable(),
  data_abertura: z.string().optional().nullable(),
  responsavel: z.string().max(300).optional().nullable(),
  impacto: z.string().max(2000).optional().nullable(),
});

export const upsertNaoConformidadeChamado = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => ChamadoUpsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "nao-conformidade", data.id ? "edit" : "create");
    const sb = admin();
    const payload = {
      chamado: data.chamado.trim(),
      descricao: data.descricao?.trim() || null,
      data_abertura: data.data_abertura || null,
      responsavel: data.responsavel?.trim() || null,
      impacto: data.impacto?.trim() || null,
    };
    if (data.id) {
      const { error } = await sb.from("nao_conformidade_chamados").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: inserted, error } = await sb
      .from("nao_conformidade_chamados")
      .insert({ ...payload, created_by: context.userId })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: inserted.id };
  });

export const deleteNaoConformidadeChamado = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "nao-conformidade", "delete");
    const sb = admin();
    const { error } = await sb.from("nao_conformidade_chamados").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
