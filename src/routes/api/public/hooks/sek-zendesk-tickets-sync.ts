import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { checkHookSecret } from "@/lib/hook-auth.server";
import { parseSekAlert } from "@/lib/sek-zendesk-parser";

// Recebe lotes de tickets do worker SEK/Zendesk (VM bnlsrvvsesi) durante um
// /sync -- o worker manda os campos brutos da API do Zendesk, o parser dos
// campos estruturados (ofensa_numero/parsed_alert) roda AQUI, não no worker
// -- mantém o worker "burro" (só busca e repassa), parser fica versionado
// junto do resto do app, mais fácil de ajustar sem tocar na VM.
// sek_tickets/upsert_sek_tickets ainda não existem no types.ts gerado
// (migration nova, aplicada manualmente) -- mesmo cast solto já usado em
// sek-zendesk-auth-log.ts.
const ticketsDb = supabaseAdmin as unknown as {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ error: { message: string } | null }>;
};

type RawTicket = {
  id: number;
  subject: string;
  status: string;
  priority: string | null;
  type: string | null;
  description: string | null;
  assignee_id: number | null;
  requester_id: number | null;
  custom_status_id: number | null;
  can_comment: boolean | null;
  can_be_solved_by_me: boolean | null;
  created_at: string | null;
  updated_at: string | null;
  raw: unknown;
};

export const Route = createFileRoute("/api/public/hooks/sek-zendesk-tickets-sync")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = checkHookSecret(request);
        if (unauth) return unauth;
        try {
          const body = (await request.json().catch(() => ({}))) as { tickets?: RawTicket[] };
          const tickets = Array.isArray(body.tickets) ? body.tickets : [];
          if (!tickets.length) {
            return new Response(JSON.stringify({ ok: true, upserted: 0 }), {
              status: 200,
              headers: { "Content-Type": "application/json" },
            });
          }

          const rows = tickets.map((t) => {
            const { ofensaNumero, parsedAlert } = parseSekAlert(t.subject ?? "", t.description);
            return {
              id: t.id,
              subject: t.subject,
              status: t.status,
              priority: t.priority,
              type: t.type,
              description: t.description,
              ofensa_numero: ofensaNumero,
              assignee_id: t.assignee_id,
              requester_id: t.requester_id,
              custom_status_id: t.custom_status_id,
              can_comment: t.can_comment,
              can_be_solved_by_me: t.can_be_solved_by_me,
              zendesk_created_at: t.created_at,
              zendesk_updated_at: t.updated_at,
              parsed_alert: parsedAlert,
              raw_payload: t.raw,
            };
          });

          const { error } = await ticketsDb.rpc("upsert_sek_tickets", { p_rows: rows });
          if (error) {
            console.error("[sek-zendesk-tickets-sync] falha ao gravar:", error);
            return new Response(JSON.stringify({ ok: false, error: error.message }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }

          console.log(`[sek-zendesk-tickets-sync] upsert de ${rows.length} ticket(s) ok`);
          return new Response(JSON.stringify({ ok: true, upserted: rows.length }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
