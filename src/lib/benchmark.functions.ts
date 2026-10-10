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

export type MaturidadeRefRow = {
  id: string;
  tipo: "faturamento" | "funcionarios";
  faixa: string;
  valor: number;
  ordem: number;
  fonte: string | null;
  ano: string | null;
  is_propria: boolean;
};

export type InvestimentoRefRow = {
  id: string;
  tipo_organizacao: string;
  pct_min: number | null;
  pct_max: number | null;
  observacao: string | null;
  ordem: number;
};

export type EmpresaRow = {
  id: string;
  ano: number;
  score_maturidade: number | null;
  faturamento_anual: number | null;
  investimento_ciber: number | null;
};

export type NistAtual = { nota: number; periodo: string };

export const getBenchmarkOverview = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await requirePermission(context.supabase, context.userId, "benchmark", "view");
    const sb = admin();
    const [mat, inv, emp, segs, matHist] = await Promise.all([
      sb
        .from("benchmark_maturidade_ref")
        .select("id, tipo, faixa, valor, ordem, fonte, ano, is_propria")
        .order("tipo", { ascending: true })
        .order("ordem", { ascending: true }),
      sb
        .from("benchmark_investimento_ref")
        .select("id, tipo_organizacao, pct_min, pct_max, observacao, ordem")
        .order("ordem", { ascending: true }),
      sb
        .from("benchmark_empresa")
        .select("id, ano, score_maturidade, faturamento_anual, investimento_ciber")
        .order("ano", { ascending: false }),
      sb.from("segmentos").select("id, is_propria"),
      sb
        .from("maturidade")
        .select("segmento_id, periodo, periodo_ordem, nota_nist")
        .order("periodo_ordem", { ascending: true }),
    ]);
    if (mat.error) throw new Error(mat.error.message);
    if (inv.error) throw new Error(inv.error.message);
    if (emp.error) throw new Error(emp.error.message);

    // Nota NIST atual da própria organização — a fonte de verdade é o módulo Maturidade.
    // MESMA regra do Painel Executivo: segmento is_propria, ordenado por
    // periodo_ordem, última nota NÃO-NULA (NIST e ISO podem ter períodos diferentes).
    // Se essa consulta falhar, devolve null e o gráfico cai no valor cadastrado na faixa.
    let nist: NistAtual | null = null;
    const propriaId = (segs.data ?? []).find((s: any) => s.is_propria)?.id ?? null;
    if (!segs.error && !matHist.error && propriaId) {
      const propriaRows = (matHist.data ?? [])
        .filter((r: any) => r.segmento_id === propriaId)
        .sort((a: any, b: any) => Number(a.periodo_ordem) - Number(b.periodo_ordem));
      const lastNist = [...propriaRows].reverse().find((r: any) => r.nota_nist != null) ?? null;
      if (lastNist) {
        nist = {
          nota: Math.round(Number(lastNist.nota_nist) * 100) / 100,
          periodo: String(lastNist.periodo ?? ""),
        };
      }
    }

    return {
      maturidade: (mat.data ?? []) as MaturidadeRefRow[],
      investimento: (inv.data ?? []) as InvestimentoRefRow[],
      empresa: (emp.data ?? []) as EmpresaRow[],
      nist,
    };
  });

// ── Maturidade refs ───────────────────────────────────────────────────────────
const MatSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  tipo: z.enum(["faturamento", "funcionarios"]),
  faixa: z.string().min(1).max(200),
  valor: z.number().min(0).max(5),
  ordem: z.number().int().min(0).max(999),
  is_propria: z.boolean().default(false),
  fonte: z.string().max(120).optional().nullable(),
  ano: z.string().max(40).optional().nullable(),
});

export const upsertMaturidadeRef = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => MatSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "benchmark", "manage");
    const sb = admin();
    const payload = {
      tipo: data.tipo,
      faixa: data.faixa.trim(),
      valor: data.valor,
      ordem: data.ordem,
      is_propria: data.is_propria,
      fonte: data.fonte?.trim() || null,
      ano: data.ano?.trim() || null,
    };
    const q = data.id
      ? await sb.from("benchmark_maturidade_ref").update(payload).eq("id", data.id)
      : await sb.from("benchmark_maturidade_ref").insert(payload);
    if (q.error) throw new Error(q.error.message);
    return { ok: true };
  });

export const deleteMaturidadeRef = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "benchmark", "manage");
    const { error } = await admin().from("benchmark_maturidade_ref").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Investimento refs ─────────────────────────────────────────────────────────
const InvSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  tipo_organizacao: z.string().min(1).max(200),
  pct_min: z.number().min(0).max(100).optional().nullable(),
  pct_max: z.number().min(0).max(100).optional().nullable(),
  observacao: z.string().max(500).optional().nullable(),
  ordem: z.number().int().min(0).max(999),
});

export const upsertInvestimentoRef = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => InvSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "benchmark", "manage");
    const sb = admin();
    const payload = {
      tipo_organizacao: data.tipo_organizacao.trim(),
      pct_min: data.pct_min ?? null,
      pct_max: data.pct_max ?? null,
      observacao: data.observacao?.trim() || null,
      ordem: data.ordem,
    };
    const q = data.id
      ? await sb.from("benchmark_investimento_ref").update(payload).eq("id", data.id)
      : await sb.from("benchmark_investimento_ref").insert(payload);
    if (q.error) throw new Error(q.error.message);
    return { ok: true };
  });

export const deleteInvestimentoRef = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "benchmark", "manage");
    const { error } = await admin().from("benchmark_investimento_ref").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ── Dados da empresa ──────────────────────────────────────────────────────────
const EmpSchema = z.object({
  ano: z.number().int().min(2000).max(2100),
  score_maturidade: z.number().min(0).max(5).optional().nullable(),
  faturamento_anual: z.number().min(0).optional().nullable(),
  investimento_ciber: z.number().min(0).optional().nullable(),
});

export const upsertBenchmarkEmpresa = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => EmpSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "benchmark", "manage");
    const { error } = await admin()
      .from("benchmark_empresa")
      .upsert(
        {
          ano: data.ano,
          score_maturidade: data.score_maturidade ?? null,
          faturamento_anual: data.faturamento_anual ?? null,
          investimento_ciber: data.investimento_ciber ?? null,
        },
        { onConflict: "ano" },
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteBenchmarkEmpresa = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "benchmark", "manage");
    const { error } = await admin().from("benchmark_empresa").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
