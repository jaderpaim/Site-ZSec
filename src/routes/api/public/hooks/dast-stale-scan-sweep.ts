// Cron: varre dast_scans presos em status='running' sem nenhuma atualização
// há muito tempo (updated_at estagnado) e marca como 'error' explícito.
//
// Existe porque o scanner-api (VM bnlsrvvsesi) pode ser reiniciado no meio
// de um bulk scan por motivos fora do nosso controle -- confirmado em
// produção (2026-09-30): o apt-daily-upgrade.timer do Ubuntu (atualização
// automática de segurança) disparou um `systemctl daemon-reexec` que
// derrubou o scanner-api junto com vários outros serviços não relacionados.
// A tarefa asyncio que acompanhava o job morre com o processo; o ZAP
// continua escaneando sozinho, sem ninguém pra recolher o resultado e
// mandar o callback final -- o scan fica "running" no Supabase pra sempre,
// sem nenhum sinal de que algo deu errado.
//
// Threshold generoso (90min) de propósito: um bulk scan legítimo já
// confirmado levando horas (vários alvos, active scan authenticado etc.),
// mas todo alvo em andamento manda callback de progresso reasonably
// frequente (ver target_findings/send_callback por alvo em main.py) --
// 90min sem NENHUMA atualização é sinal seguro de processo morto, não de
// scan genuinamente lento.
import { createFileRoute } from "@tanstack/react-router";
import { checkHookSecret } from "@/lib/hook-auth.server";
import { recordCronRun } from "@/lib/cron-tracking.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const STALE_THRESHOLD_MINUTES = 90;

export const Route = createFileRoute("/api/public/hooks/dast-stale-scan-sweep")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = checkHookSecret(request);
        if (unauth) return unauth;
        const started = Date.now();
        try {
          const cutoff = new Date(Date.now() - STALE_THRESHOLD_MINUTES * 60_000).toISOString();
          const { data: stale, error: selectError } = await supabaseAdmin
            .from("dast_scans")
            .select("id")
            .eq("status", "running")
            .lt("updated_at", cutoff);
          if (selectError) throw new Error(selectError.message);

          const ids = (stale ?? []).map((s) => s.id);
          if (ids.length) {
            const { error: updateError } = await supabaseAdmin
              .from("dast_scans")
              .update({
                status: "error",
                error: `Sem atualização de progresso há mais de ${STALE_THRESHOLD_MINUTES}min -- o processo do scanner (VM) provavelmente reiniciou no meio do scan (ex.: atualização automática do sistema operacional) e ninguém coletou o resultado final. Achados já encontrados até a interrupção foram preservados (gravação incremental por alvo); rode o scan novamente para cobertura completa.`,
                finished_at: new Date().toISOString(),
              })
              .in("id", ids);
            if (updateError) throw new Error(updateError.message);
          }

          await recordCronRun("dast-stale-scan-sweep", "cron", {
            ok: true,
            error: ids.length ? `${ids.length} scan(s) órfão(s) fechado(s)` : null,
            durationMs: Date.now() - started,
          });
          return new Response(JSON.stringify({ ok: true, closed: ids.length }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          await recordCronRun("dast-stale-scan-sweep", "cron", {
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
