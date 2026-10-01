import { createFileRoute } from "@tanstack/react-router";
import { checkHookSecret } from "@/lib/hook-auth.server";
import { recordCronRun } from "@/lib/cron-tracking.server";

export const Route = createFileRoute("/api/public/hooks/vuln-snapshot")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = checkHookSecret(request);
        if (unauth) return unauth;
        const started = Date.now();
        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

          // Snapshot só de APLICAÇÃO — alinhado ao Painel Executivo e ao padrão do
          // módulo Vulnerabilidades (kindFilter="aplicacao"). Paginado (teto de 1000).
          const PAGE = 1000;
          const fetchAll = async () => {
            const rows: any[] = [];
            for (let from = 0; ; from += PAGE) {
              const { data, error } = await supabaseAdmin
                .from("vulnerabilities_aplicacao")
                .select("severity,status")
                .order("id", { ascending: true })
                .range(from, from + PAGE - 1);
              if (error) throw error;
              if (!data || data.length === 0) break;
              rows.push(...data);
              if (data.length < PAGE) break;
            }
            return rows;
          };
          const all = await fetchAll();
          const sev = (s: any) => (s ?? "").toString().toLowerCase();
          const isClosed = (st: any) =>
            ["mitigada", "fechada", "resolvida", "closed", "resolved"].includes((st ?? "").toString().toLowerCase());

          const criticas = all.filter((v: any) => ["crítica", "critica", "critical"].includes(sev(v.severity))).length;
          const altas = all.filter((v: any) => ["alta", "high"].includes(sev(v.severity))).length;
          const medias = all.filter((v: any) => ["média", "media", "medium"].includes(sev(v.severity))).length;
          const baixas = all.filter((v: any) => ["baixa", "low"].includes(sev(v.severity))).length;
          const total = all.length;
          const resolvidas = all.filter((v: any) => isClosed(v.status)).length;
          const abertas = total - resolvidas;

          const today = new Date().toISOString().slice(0, 10);

          const { error: upErr } = await supabaseAdmin.from("vuln_snapshots").upsert(
            {
              snapshot_date: today,
              criticas,
              altas,
              medias,
              baixas,
              total,
              abertas,
              resolvidas,
              estimated: false,
            },
            { onConflict: "snapshot_date" },
          );
          if (upErr) throw upErr;

          await recordCronRun("vuln-snapshot", "cron", { ok: true, durationMs: Date.now() - started });
          return new Response(
            JSON.stringify({
              ok: true,
              snapshot_date: today,
              criticas,
              altas,
              medias,
              baixas,
              total,
              abertas,
              resolvidas,
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        } catch (e) {
          await recordCronRun("vuln-snapshot", "cron", {
            ok: false,
            error: (e as Error).message,
            durationMs: Date.now() - started,
          });
          return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
