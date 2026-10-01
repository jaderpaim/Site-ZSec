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

export type ComiteRow = {
  id: string;
  nome: string;
  tipo: string;
  periodicidade: string;
  participantes: string | null;
  data: string;
  status: string;
  observacao: string | null;
  created_at: string;
  updated_at: string;
};

const UpsertSchema = z.object({
  id: z.string().uuid().optional().nullable(),
  nome: z.string().min(1).max(200),
  tipo: z.string().min(1).max(120),
  periodicidade: z.string().min(1).max(60),
  participantes: z.string().max(5000).optional().nullable(),
  data: z.string().min(1),
  status: z.string().min(1).max(60),
  observacao: z.string().max(5000).optional().nullable(),
  created_by: z.string().uuid().optional().nullable(),
});

export const listComites = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await requirePermission(context.supabase, context.userId, "comites", "view");
    const sb = admin();
    const { data, error } = await sb
      .from("comites")
      .select("id, nome, tipo, periodicidade, participantes, data, status, observacao, created_at, updated_at")
      .order("data", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as ComiteRow[];
  });

export const upsertComite = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input) => UpsertSchema.parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "comites", data.id ? "edit" : "create");
    const sb = admin();
    const payload = {
      nome: data.nome.trim(),
      tipo: data.tipo.trim(),
      periodicidade: data.periodicidade.trim(),
      participantes: data.participantes?.trim() || null,
      data: data.data,
      status: data.status.trim(),
      observacao: data.observacao?.trim() || null,
    };
    if (data.id) {
      const { error } = await sb.from("comites").update(payload).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: inserted, error } = await sb
      .from("comites")
      .insert({ ...payload, created_by: data.created_by ?? null })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    return { ok: true, id: inserted.id };
  });

export const deleteComite = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((input: { id: string }) => z.object({ id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await requirePermission(context.supabase, context.userId, "comites", "delete");
    const sb = admin();
    const { error } = await sb.from("comites").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export type ComitesOverview = {
  totalReunioes: number;
  realizadas: number;
  naoRealizadas: number;
  agendadas: number;
  canceladas: number;
  percentRealizacao: number;
  porMes: Array<{ m: string; realizadas: number; naoRealizadas: number; agendadas: number }>;
  porComite: Array<{ nome: string; total: number; realizadas: number; percent: number }>;
  porStatus: Array<{ name: string; value: number }>;
};

export const getComitesOverview = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }): Promise<ComitesOverview> => {
    await requirePermission(context.supabase, context.userId, "comites", "view");
    const sb = admin();
    const { data, error } = await sb.from("comites").select("nome, status, data");
    if (error) throw new Error(error.message);
  const rows = data ?? [];

  const now = new Date();
  const norm = (s: string | null) => (s ?? "").trim().toLowerCase();
  const isRealizada = (s: string) => norm(s) === "realizado" || norm(s) === "realizada";
  const isNao = (s: string) => norm(s).startsWith("não real") || norm(s).startsWith("nao real");
  const isAgendada = (s: string) => norm(s) === "agendado" || norm(s) === "agendada";
  const isCancelada = (s: string) => norm(s) === "cancelado" || norm(s) === "cancelada";

  let realizadas = 0;
  let naoRealizadas = 0;
  let agendadas = 0;
  let canceladas = 0;

  const months: { key: string; label: string }[] = [];
  for (let i = 11; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const label = d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" });
    months.push({ key, label });
  }
  const byMonth = new Map<string, { realizadas: number; naoRealizadas: number; agendadas: number }>();
  months.forEach((m) => byMonth.set(m.key, { realizadas: 0, naoRealizadas: 0, agendadas: 0 }));

  const byCommittee = new Map<string, { total: number; realizadas: number }>();
  const byStatus = new Map<string, number>();

  for (const r of rows) {
    const status = (r.status ?? "").trim();
    if (isRealizada(status)) realizadas++;
    else if (isNao(status)) naoRealizadas++;
    else if (isAgendada(status)) agendadas++;
    else if (isCancelada(status)) canceladas++;

    byStatus.set(status || "—", (byStatus.get(status || "—") ?? 0) + 1);

    const dt = new Date(r.data + "T00:00:00");
    const key = `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}`;
    const slot = byMonth.get(key);
    if (slot) {
      if (isRealizada(status)) slot.realizadas++;
      else if (isNao(status)) slot.naoRealizadas++;
      else if (isAgendada(status)) slot.agendadas++;
    }

    const nome = (r.nome ?? "—").trim() || "—";
    const c = byCommittee.get(nome) ?? { total: 0, realizadas: 0 };
    c.total += 1;
    if (isRealizada(status)) c.realizadas += 1;
    byCommittee.set(nome, c);
  }

  const totalReunioes = rows.length;
  const denom = realizadas + naoRealizadas;
  const percentRealizacao = denom > 0 ? Math.round((realizadas / denom) * 100) : 0;

  const porMes = months.map((m) => ({
    m: m.label,
    realizadas: byMonth.get(m.key)!.realizadas,
    naoRealizadas: byMonth.get(m.key)!.naoRealizadas,
    agendadas: byMonth.get(m.key)!.agendadas,
  }));

  const porComite = Array.from(byCommittee.entries())
    .map(([nome, v]) => ({
      nome,
      total: v.total,
      realizadas: v.realizadas,
      percent: totalReunioes > 0 ? Math.round((v.total / totalReunioes) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.total - a.total);

  const porStatus = Array.from(byStatus.entries()).map(([name, value]) => ({ name, value }));

  return {
    totalReunioes,
    realizadas,
    naoRealizadas,
    agendadas,
    canceladas,
    percentRealizacao,
    porMes,
    porComite,
    porStatus,
  };
});
