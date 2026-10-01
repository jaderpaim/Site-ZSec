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

export type PilulaRow = {
  id: string;
  nome: string;
  descricao: string | null;
  link: string | null;
  quantidade: number;
  data: string;
  created_at: string;
  updated_at: string;
};

const UpsertSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  nome: z.string().min(1).max(200),
  descricao: z.string().max(5000).optional().nullable(),
  link: z.string().max(1000).optional().nullable(),
  quantidade: z.number().int().min(0).max(1_000_000),
  data: z.string().min(1),
  created_by: z.string().uuid().optional().nullable(),
});

export const listPilulas = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await requirePermission(context.supabase, context.userId, "pilulas-si", "view");
    const sb = admin();
    const { data, error } = await sb
      .from("pilulas_si")
      .select("id, nome, descricao, link, quantidade, data, created_at, updated_at")
      .order("data", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as PilulaRow[];
  });

export const upsertPilula = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => UpsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "pilulas-si", data.id ? "edit" : "create");
    const sb = admin();
    const payload = {
      nome: data.nome.trim(),
      descricao: data.descricao?.trim() || null,
      link: data.link?.trim() || null,
      quantidade: data.quantidade,
      data: data.data,
    };
    if (data.id) {
      const { error } = await sb.from("pilulas_si").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: inserted, error } = await sb
      .from("pilulas_si")
      .insert({ ...payload, created_by: data.created_by ?? null })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: inserted.id };
  });

export const deletePilula = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "pilulas-si", "delete");
    const sb = admin();
    const { error } = await sb.from("pilulas_si").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type PilulasOverview = {
  totalPilulas: number;
  totalQuantidade: number;
  pilulasUltimos30d: number;
  quantidadeUltimos30d: number;
  porMes: Array<{ m: string; quantidade: number; pilulas: number }>;
  topPilulas: Array<{ nome: string; quantidade: number }>;
};

export const getPilulasOverview = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }): Promise<PilulasOverview> => {
    await requirePermission(context.supabase, context.userId, "pilulas-si", "view");
    const sb = admin();
    const { data, error } = await sb.from("pilulas_si").select("nome, quantidade, data");
    if (error) throw new Error(error.message);
    const rows = data ?? [];

    const now = new Date();
    const cutoff30 = new Date(now.getTime() - 30 * 86400000);

    let totalQuantidade = 0;
    let pilulasUltimos30d = 0;
    let quantidadeUltimos30d = 0;

    // últimos 12 meses
    const months: { key: string; label: string }[] = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
      const label = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
      months.push({ key, label });
    }
    const byMonth = new Map<string, { quantidade: number; pilulas: number }>();
    months.forEach((m) => byMonth.set(m.key, { quantidade: 0, pilulas: 0 }));

    for (const r of rows) {
      const q = Number(r.quantidade ?? 0);
      totalQuantidade += q;
      const dt = new Date(r.data + "T00:00:00");
      if (dt >= cutoff30) {
        pilulasUltimos30d += 1;
        quantidadeUltimos30d += q;
      }
      const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
      const slot = byMonth.get(key);
      if (slot) {
        slot.quantidade += q;
        slot.pilulas += 1;
      }
    }

    const porMes = months.map((m) => ({
      m: m.label,
      quantidade: byMonth.get(m.key)!.quantidade,
      pilulas: byMonth.get(m.key)!.pilulas,
    }));

    const topPilulas = [...rows]
      .map((r) => ({ nome: r.nome, quantidade: Number(r.quantidade ?? 0) }))
      .sort((a, b) => b.quantidade - a.quantidade)
      .slice(0, 10);

    return {
      totalPilulas: rows.length,
      totalQuantidade,
      pilulasUltimos30d,
      quantidadeUltimos30d,
      porMes,
      topPilulas,
    };
  });
