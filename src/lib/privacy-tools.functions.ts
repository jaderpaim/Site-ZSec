import { createServerFn } from "@tanstack/react-start";
import { requireActiveSession } from "@/lib/session-policy.middleware";
import { requirePermission } from "@/lib/authz";

// ── Filter types ──────────────────────────────────────────────────────────────

export type ConsentamentosFilter = {
  ano?: number;
  mes?: number | null;
  period?: "7d" | "30d" | "6m" | "12m";
  grupo?: string;
  hipoteseTratamento?: string;
};

export type CookiesFilter = {
  period?: "7d" | "30d" | "6m" | "12m";
};

export type UsoFilter = {
  ano?: number;
};

// ── Response types ────────────────────────────────────────────────────────────

export type ConsentamentosData = {
  series: Array<{ date: string; concedidos: number; recusados: number }>;
  totals: {
    concedidos: number;
    recusados: number;
    total: number;
    titularesConcedidos: number;
    titularesRecusados: number;
    titularesMistos: number;
    titularesTotal: number;
    deltaConcedidos: number | null;
    deltaRecusados: number | null;
  };
  grupos: string[];
  hipoteses: string[];
  lastSyncAt: string | null;
};

export type CookiesData = {
  series: Array<{ date: string; concedidos: number; recusados: number }>;
  totals: {
    concedidos: number;
    recusados: number;
    total: number;
    deltaConcedidos: number | null;
    deltaRecusados: number | null;
  };
  lastSyncAt: string | null;
};

export type UsoData = {
  summary: { numSites: number; numEmpresas: number; numTitulares: number };
  series: Array<{ mes: number; mesLabel: string; pageViews: number }>;
  anos: number[];
  lastSyncAt: string | null;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

const MES_LABELS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

function periodDays(p: string): number {
  if (p === "7d") return 7;
  if (p === "6m") return 180;
  if (p === "12m") return 365;
  return 30;
}

function pctDelta(current: number, previous: number): number | null {
  if (previous === 0) return current > 0 ? null : 0;
  return ((current - previous) / previous) * 100;
}

// ── Server functions ──────────────────────────────────────────────────────────

export const getPrivacyConsentamentos = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((data: ConsentamentosFilter | undefined) => data ?? {})
  .handler(async ({ context, data }): Promise<ConsentamentosData> => {
    await requirePermission(context.supabase, context.userId, "privacy-tools", "view");
    const { supabase } = context;

    const ano = data.ano ?? new Date().getFullYear();
    let query = supabase.from("privacy_consentimentos_daily").select("*").order("date", { ascending: true });

    if (data.mes != null) {
      const pad = (n: number) => String(n).padStart(2, "0");
      const startOfMonth = `${ano}-${pad(data.mes)}-01`;
      const endOfMonth = new Date(ano, data.mes, 0).toISOString().split("T")[0];
      query = query.gte("date", startOfMonth).lte("date", endOfMonth);
    } else {
      const days = periodDays(data.period ?? "30d");
      const endDate = new Date();
      const startDate = new Date(endDate);
      startDate.setDate(startDate.getDate() - days);
      query = query.gte("date", startDate.toISOString().split("T")[0]).lte("date", endDate.toISOString().split("T")[0]);
    }

    if (data.grupo) query = query.eq("grupo", data.grupo);
    if (data.hipoteseTratamento) query = query.eq("hipotese_tratamento", data.hipoteseTratamento);

    const { data: rows, error } = await query;
    if (error) throw new Error(error.message);
    const all = rows ?? [];

    // Aggregate series by date using TITULAR counts (unique people per day).
    // The API returns one record per consent purpose per person; titulares_* fields
    // already reflect unique-person counts computed during sync.
    const byDate = new Map<string, { concedidos: number; recusados: number }>();
    for (const r of all) {
      const d = r.date as string;
      const cur = byDate.get(d) ?? { concedidos: 0, recusados: 0 };
      byDate.set(d, {
        concedidos: cur.concedidos + (r.titulares_concedidos as number),
        recusados: cur.recusados + (r.titulares_recusados as number),
      });
    }
    const series = Array.from(byDate.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v }));

    // KPI totals: use titular counts (consistent with chart)
    const concedidos = all.reduce((s, r) => s + (r.titulares_concedidos as number), 0);
    const recusados = all.reduce((s, r) => s + (r.titulares_recusados as number), 0);
    const titularesConcedidos = concedidos;
    const titularesRecusados = recusados;
    const titularesMistos = all.reduce((s, r) => s + (r.titulares_mistos as number), 0);
    const titularesTotal = all.reduce((s, r) => s + (r.titulares_total as number), 0);

    // Delta: compare first half vs second half of series
    const mid = Math.floor(series.length / 2);
    const prevC = series.slice(0, mid).reduce((s, r) => s + r.concedidos, 0);
    const currC = series.slice(mid).reduce((s, r) => s + r.concedidos, 0);
    const prevR = series.slice(0, mid).reduce((s, r) => s + r.recusados, 0);
    const currR = series.slice(mid).reduce((s, r) => s + r.recusados, 0);

    const grupos = [...new Set(all.map((r) => r.grupo as string).filter(Boolean))];
    const hipoteses = [...new Set(all.map((r) => r.hipotese_tratamento as string).filter(Boolean))];

    const { data: syncRow } = await supabase
      .from("privacy_consentimentos_daily")
      .select("synced_at")
      .order("synced_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      series,
      totals: {
        concedidos,
        recusados,
        total: concedidos + recusados,
        titularesConcedidos,
        titularesRecusados,
        titularesMistos,
        titularesTotal: titularesTotal || titularesConcedidos + titularesRecusados + titularesMistos,
        deltaConcedidos: pctDelta(currC, prevC),
        deltaRecusados: pctDelta(currR, prevR),
      },
      grupos,
      hipoteses,
      lastSyncAt: (syncRow?.synced_at as string) ?? null,
    };
  });

export const getPrivacyCookies = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((data: CookiesFilter | undefined) => data ?? {})
  .handler(async ({ context, data }): Promise<CookiesData> => {
    await requirePermission(context.supabase, context.userId, "privacy-tools", "view");
    const { supabase } = context;

    const days = periodDays(data.period ?? "30d");
    const endDate = new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - days);

    const { data: rows, error } = await supabase
      .from("privacy_cookies_daily")
      .select("*")
      .gte("date", startDate.toISOString().split("T")[0])
      .lte("date", endDate.toISOString().split("T")[0])
      .order("date", { ascending: true });

    if (error) throw new Error(error.message);
    const all = rows ?? [];

    const series = all.map((r) => ({
      date: r.date as string,
      concedidos: r.concedidos as number,
      recusados: r.recusados as number,
    }));

    const concedidos = all.reduce((s, r) => s + (r.concedidos as number), 0);
    const recusados = all.reduce((s, r) => s + (r.recusados as number), 0);

    const mid = Math.floor(series.length / 2);
    const prevC = series.slice(0, mid).reduce((s, r) => s + r.concedidos, 0);
    const currC = series.slice(mid).reduce((s, r) => s + r.concedidos, 0);
    const prevR = series.slice(0, mid).reduce((s, r) => s + r.recusados, 0);
    const currR = series.slice(mid).reduce((s, r) => s + r.recusados, 0);

    const { data: syncRow } = await supabase
      .from("privacy_cookies_daily")
      .select("synced_at")
      .order("synced_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      series,
      totals: {
        concedidos,
        recusados,
        total: concedidos + recusados,
        deltaConcedidos: pctDelta(currC, prevC),
        deltaRecusados: pctDelta(currR, prevR),
      },
      lastSyncAt: (syncRow?.synced_at as string) ?? null,
    };
  });

export const getPrivacyUso = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .inputValidator((data: UsoFilter | undefined) => data ?? {})
  .handler(async ({ context, data }): Promise<UsoData> => {
    await requirePermission(context.supabase, context.userId, "privacy-tools", "view");
    const { supabase } = context;

    const ano = data.ano ?? new Date().getFullYear();

    const { data: rows, error } = await supabase
      .from("privacy_uso_mensal")
      .select("*")
      .eq("ano", ano)
      .order("mes", { ascending: true });

    if (error) throw new Error(error.message);
    const all = rows ?? [];

    const latest = [...all].sort((a, b) => (b.mes as number) - (a.mes as number))[0];
    const summary = {
      numSites: (latest?.num_sites as number) ?? 0,
      numEmpresas: (latest?.num_empresas as number) ?? 0,
      numTitulares: Number(latest?.num_titulares ?? 0),
    };

    const series = all.map((r) => ({
      mes: r.mes as number,
      mesLabel: MES_LABELS[(r.mes as number) - 1] ?? String(r.mes),
      pageViews: Number(r.page_views),
    }));

    const { data: yearRows } = await supabase
      .from("privacy_uso_mensal")
      .select("ano")
      .order("ano", { ascending: false });
    const anos = [...new Set((yearRows ?? []).map((r) => r.ano as number))];

    const { data: syncRow } = await supabase
      .from("privacy_uso_mensal")
      .select("synced_at")
      .order("synced_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    return {
      summary,
      series,
      anos: anos.length > 0 ? anos : [ano],
      lastSyncAt: (syncRow?.synced_at as string) ?? null,
    };
  });

export const triggerPrivacyToolsSync = createServerFn({ method: "POST" })
  .middleware([requireActiveSession])
  .handler(async ({ context }) => {
    await requirePermission(context.supabase, context.userId, "privacy-tools", "manage");
    const { runPrivacyToolsSync } = await import("@/lib/privacy-tools.server");
    const { recordCronRun } = await import("@/lib/cron-tracking.server");
    const started = Date.now();
    const result = await runPrivacyToolsSync();
    await recordCronRun("privacy-tools-sync", "manual", {
      ok: result.ok,
      error: result.ok ? undefined : result.error,
      durationMs: Date.now() - started,
    });
    return result;
  });
