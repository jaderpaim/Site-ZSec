import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { checkHookSecret } from "@/lib/hook-auth.server";

// sek_zendesk_auth_log ainda não existe no types.ts gerado (migration nova,
// aplicada manualmente) -- mesmo cast solto que shadowit-callback.ts usa
// pra tabela recém-criada, evita depender de regenerar tipos antes de poder
// mexer no código.
const authLogDb = supabaseAdmin as unknown as {
  from: (t: string) => any;
};

// Callback do worker SEK/Zendesk (VM bnlsrvvsesi) -- reporta cada renovação de
// sessão bem-sucedida (ver handoff em memória). Nunca recebe o storage_state
// nem o JWT usado na renovação, só o evento e quem disparou (sub do JWT).
// Body: { event, triggeredBy, at }.
export const Route = createFileRoute("/api/public/hooks/sek-zendesk-auth-log")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const unauth = checkHookSecret(request);
        if (unauth) return unauth;
        try {
          const body = (await request.json().catch(() => ({}))) as {
            event?: string;
            triggeredBy?: string;
            at?: string;
          };
          if (!body.event) {
            return new Response(JSON.stringify({ ok: false, error: "event obrigatório" }), {
              status: 400,
            });
          }

          let triggeredByName: string | null = null;
          if (body.triggeredBy) {
            const { data: profile } = await supabaseAdmin
              .from("profiles")
              .select("full_name, email")
              .eq("id", body.triggeredBy)
              .maybeSingle<{ full_name: string | null; email: string | null }>();
            triggeredByName = profile?.full_name ?? profile?.email ?? null;
          }

          const { error } = await authLogDb.from("sek_zendesk_auth_log").insert({
            event: body.event,
            triggered_by: body.triggeredBy ?? null,
            triggered_by_name: triggeredByName,
            reported_at: body.at ?? new Date().toISOString(),
          });
          if (error) {
            console.error("[sek-zendesk-auth-log] falha ao gravar:", error);
            return new Response(JSON.stringify({ ok: false, error: error.message }), {
              status: 500,
            });
          }

          return new Response(JSON.stringify({ ok: true }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          });
        } catch (e) {
          return new Response(JSON.stringify({ ok: false, error: (e as Error).message }), {
            status: 500,
          });
        }
      },
    },
  },
});
