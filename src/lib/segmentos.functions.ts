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

/* =========================================================
 * CRUD SEGMENTOS
 * ========================================================= */

export type SegmentoRow = {
  id: string;
  nome: string;
  is_propria: boolean;
  notas: Array<{
    id: string;
    periodo: string;
    periodo_ordem: number;
    nota_nist: number | null;
    nota_iso: number | null;
  }>;
};

export const listSegmentos = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await requirePermission(context.supabase, context.userId, "segmentos", "view");
    const sb = admin();
    const { data: segs, error } = await sb
      .from("segmentos")
      .select("id, nome, is_propria")
      .order("is_propria", { ascending: false })
      .order("nome");
    if (error) throw new Error(error.message);

    const { data: notas, error: e2 } = await sb
      .from("segmentos_notas")
      .select("id, segmento_id, periodo, periodo_ordem, nota_nist, nota_iso")
      .order("periodo_ordem");
    if (e2) throw new Error(e2.message);

    const byId = new Map<string, SegmentoRow>();
    for (const s of segs ?? []) {
      byId.set(s.id, { ...s, notas: [] });
    }
    for (const n of notas ?? []) {
      const row = byId.get(n.segmento_id);
      if (row) {
        row.notas.push({
          id: n.id,
          periodo: n.periodo,
          periodo_ordem: n.periodo_ordem,
          nota_nist: n.nota_nist === null ? null : Number(n.nota_nist),
          nota_iso: n.nota_iso === null ? null : Number(n.nota_iso),
        });
      }
    }
    return Array.from(byId.values());
  });

const SegmentoSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  nome: z.string().min(1).max(120),
  is_propria: z.boolean().optional().default(false),
});

export const upsertSegmento = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => SegmentoSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "segmentos", data.id ? "edit" : "create");
    const sb = admin();
    const payload = { nome: data.nome.trim(), is_propria: !!data.is_propria };
    if (data.id) {
      const { error } = await sb.from("segmentos").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: ins, error } = await sb.from("segmentos").insert(payload).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: ins.id };
  });

export const deleteSegmento = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "segmentos", "delete");
    const sb = admin();
    const { error } = await sb.from("segmentos").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* =========================================================
 * CRUD NOTAS
 * ========================================================= */

const NotaSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  segmento_id: z.string().uuid(),
  periodo: z.string().min(1).max(40),
  periodo_ordem: z.number().int().min(0).max(100000).optional(),
  nota_nist: z.number().min(0).max(5).nullable().optional(),
  nota_iso: z.number().min(0).max(5).nullable().optional(),
});

export const upsertSegmentoNota = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => NotaSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "segmentos", data.id ? "edit" : "create");
    const sb = admin();

    // Se não veio periodo_ordem, calcula próximo
    let ordem = data.periodo_ordem;
    if (ordem === undefined || ordem === null) {
      const { data: max } = await sb
        .from("segmentos_notas")
        .select("periodo_ordem")
        .eq("segmento_id", data.segmento_id)
        .order("periodo_ordem", { ascending: false })
        .limit(1);
      ordem = (max?.[0]?.periodo_ordem ?? 0) + 1;
    }

    const payload = {
      segmento_id: data.segmento_id,
      periodo: data.periodo.trim(),
      periodo_ordem: ordem,
      nota_nist: data.nota_nist ?? null,
      nota_iso: data.nota_iso ?? null,
    };

    if (data.id) {
      const { error } = await sb.from("segmentos_notas").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await sb
        .from("segmentos_notas")
        .upsert(payload, { onConflict: "segmento_id,periodo" });
      if (error) throw new Error(error.message);
    }

    // Lê a linha de maturidade recém-recalculada pelo trigger
    const { data: m } = await sb
      .from("maturidade")
      .select("score, delta_anterior, delta_total, periodo")
      .eq("segmento_id", data.segmento_id)
      .eq("periodo", payload.periodo)
      .maybeSingle();

    return {
      ok: true,
      maturidade: m
        ? {
            periodo: m.periodo,
            score: m.score === null ? null : Number(m.score),
            delta_anterior: m.delta_anterior === null ? null : Number(m.delta_anterior),
            delta_total: m.delta_total === null ? null : Number(m.delta_total),
          }
        : null,
    };
  });

export const deleteSegmentoNota = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((i: { id: string }) => z.object({ id: z.string().uuid() }).parse(i))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "segmentos", "delete");
    const sb = admin();
    const { error } = await sb.from("segmentos_notas").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/* =========================================================
 * MATURIDADE — dashboard data (100% server-computed)
 * ========================================================= */

export type TimelinePoint = {
  label: string;
  v: number;
  delta: number | null;     // % vs anterior (não-null)
  deltaTotal: number | null; // % vs primeiro
};

export type RankRow = {
  name: string;
  v: number;
  kind: "default" | "edu" | "propria";
};

export type PropriaRow = {
  periodo: string;
  periodo_ordem: number;
  nota_nist: number | null;
  nota_iso: number | null;
  score: number | null;
  delta_anterior: number | null;
  delta_total: number | null;
};

export type MaturidadePayload = {
  propria: {
    rows: PropriaRow[];
    nist_timeline: TimelinePoint[];
    iso_timeline: TimelinePoint[];
    latest_nist: { periodo: string; v: number } | null;
    latest_iso: { periodo: string; v: number } | null;
    latest_score: { periodo: string; v: number } | null;
  };
  ranking_nist: RankRow[];
  ranking_iso: RankRow[];
  media_edu_nist: number | null;
  media_edu_iso: number | null;
};

function pctEvol(curr: number, base: number): number | null {
  if (!base) return null;
  return Number((((curr - base) / base) * 100).toFixed(2));
}

function buildTimeline(
  rows: Array<{ periodo: string; periodo_ordem: number; value: number | null }>,
): TimelinePoint[] {
  const filtered = rows
    .filter((r) => r.value !== null)
    .sort((a, b) => a.periodo_ordem - b.periodo_ordem) as Array<{
    periodo: string;
    periodo_ordem: number;
    value: number;
  }>;
  if (!filtered.length) return [];
  const base = filtered[0].value;
  let prev: number | null = null;
  return filtered.map((r) => {
    const delta = prev === null ? null : pctEvol(r.value, prev);
    const deltaTotal = r === filtered[0] ? null : pctEvol(r.value, base);
    prev = r.value;
    return { label: r.periodo, v: r.value, delta, deltaTotal };
  });
}

export const listMaturidade = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }): Promise<MaturidadePayload> => {
    await requirePermission(context.supabase, context.userId, "segmentos", "view");
    const sb = admin();

    const { data: segs, error: e1 } = await sb
      .from("segmentos")
      .select("id, nome, is_propria");
    if (e1) throw new Error(e1.message);

    const { data: mat, error: e2 } = await sb
      .from("maturidade")
      .select("segmento_id, periodo, periodo_ordem, nota_nist, nota_iso, score, delta_anterior, delta_total")
      .order("periodo_ordem");
    if (e2) throw new Error(e2.message);

    const segMap = new Map<string, { nome: string; is_propria: boolean }>();
    for (const s of segs ?? []) segMap.set(s.id, { nome: s.nome, is_propria: s.is_propria });

    // Linhas da própria organização
    const propriaId = (segs ?? []).find((s) => s.is_propria)?.id;
    const propriaRows = (mat ?? []).filter((r) => r.segmento_id === propriaId);

    const propria_rows: PropriaRow[] = propriaRows.map((r) => ({
      periodo: r.periodo,
      periodo_ordem: r.periodo_ordem,
      nota_nist: r.nota_nist === null ? null : Number(r.nota_nist),
      nota_iso: r.nota_iso === null ? null : Number(r.nota_iso),
      score: r.score === null ? null : Number(r.score),
      delta_anterior: r.delta_anterior === null ? null : Number(r.delta_anterior),
      delta_total: r.delta_total === null ? null : Number(r.delta_total),
    }));


    const nist_timeline = buildTimeline(
      propriaRows.map((r) => ({
        periodo: r.periodo,
        periodo_ordem: r.periodo_ordem,
        value: r.nota_nist === null ? null : Number(r.nota_nist),
      })),
    );
    const iso_timeline = buildTimeline(
      propriaRows.map((r) => ({
        periodo: r.periodo,
        periodo_ordem: r.periodo_ordem,
        value: r.nota_iso === null ? null : Number(r.nota_iso),
      })),
    );

    const lastNist = nist_timeline[nist_timeline.length - 1] ?? null;
    const lastIso = iso_timeline[iso_timeline.length - 1] ?? null;

    const sortedScore = [...propriaRows]
      .filter((r) => r.score !== null)
      .sort((a, b) => a.periodo_ordem - b.periodo_ordem);
    const lastScoreRow = sortedScore[sortedScore.length - 1] ?? null;

    // Rankings — última nota por segmento (mercado + própria organização)
    const latestBySeg = new Map<
      string,
      { nista: number | null; iso: number | null }
    >();
    for (const r of mat ?? []) {
      const cur = latestBySeg.get(r.segmento_id) ?? { nista: null, iso: null };
      // Como já está ordenado por periodo_ordem ASC, o último vence
      if (r.nota_nist !== null) cur.nista = Number(r.nota_nist);
      if (r.nota_iso !== null) cur.iso = Number(r.nota_iso);
      latestBySeg.set(r.segmento_id, cur);
    }

    const ranking_nist: RankRow[] = [];
    const ranking_iso: RankRow[] = [];
    const org = await (await import("./organizacao.server")).loadOrganizacao();
    const ownLabel = (org.nome_curto || org.nome).toUpperCase();
    for (const [segId, vals] of latestBySeg.entries()) {
      const meta = segMap.get(segId);
      if (!meta) continue;
      const kind: RankRow["kind"] = meta.is_propria
        ? "propria"
        : /^educa/i.test(meta.nome)
          ? "edu"
          : "default";
      if (vals.nista !== null)
        ranking_nist.push({ name: meta.is_propria ? ownLabel : meta.nome, v: vals.nista, kind });
      if (vals.iso !== null)
        ranking_iso.push({ name: meta.is_propria ? ownLabel : meta.nome, v: vals.iso, kind });
    }
    ranking_nist.sort((a, b) => a.v - b.v);
    ranking_iso.sort((a, b) => a.v - b.v);

    const eduNist = ranking_nist.find((r) => r.kind === "edu")?.v ?? null;
    const eduIso = ranking_iso.find((r) => r.kind === "edu")?.v ?? null;

    return {
      propria: {
        rows: propria_rows,
        nist_timeline,
        iso_timeline,
        latest_nist: lastNist ? { periodo: lastNist.label, v: lastNist.v } : null,
        latest_iso: lastIso ? { periodo: lastIso.label, v: lastIso.v } : null,
        latest_score: lastScoreRow
          ? { periodo: lastScoreRow.periodo, v: Number(lastScoreRow.score) }
          : null,
      },
      ranking_nist,
      ranking_iso,
      media_edu_nist: eduNist,
      media_edu_iso: eduIso,
    };
  });
