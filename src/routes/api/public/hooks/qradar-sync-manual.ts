import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { runQradarSync } from "@/lib/qradar.server";
import { recordCronRun, recordCronAttemptStart } from "@/lib/cron-tracking.server";
import { requireAdminOrAnalista } from "@/lib/authz";

// Equivalente ao qradar-sync.ts (cron), mas para o botão manual do SocReal —
// que precisa de sessão de usuário (Bearer token), não do HOOK_SECRET. Não dá
// pra usar createServerFn aqui porque createServerFn serializa um valor de
// retorno simples, não uma Response em streaming (ver comentário em
// qradar-sync.ts sobre por que o streaming é necessário: a borda da
// Cloudflare na frente de bernoulli.com.br corta a conexão sem bytes de
// resposta por ~100s, e o sync completo passa disso quando alguma consulta
// no QRadar demora mais que o normal).
const HEARTBEAT_INTERVAL_MS = 15_000;

export const Route = createFileRoute("/api/public/hooks/qradar-sync-manual")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return new Response("Unauthorized: No authorization header provided", { status: 401 });
        }
        const token = authHeader.slice("Bearer ".length);
        if (!token) {
          return new Response("Unauthorized: No token provided", { status: 401 });
        }

        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
          return new Response("Server misconfigured: Supabase env vars missing", { status: 500 });
        }

        const supabase = createClient<Database>(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
        });

        const { data, error } = await supabase.auth.getClaims(token);
        if (error || !data?.claims?.sub) {
          return new Response("Unauthorized: Invalid token", { status: 401 });
        }
        const userId = data.claims.sub as string;

        try {
          await requireAdminOrAnalista(supabase, userId);
        } catch (e) {
          return new Response((e as Error).message, { status: 403 });
        }

        const encoder = new TextEncoder();
        let heartbeat: ReturnType<typeof setInterval> | undefined;

        const stream = new ReadableStream({
          async start(controller) {
            const send = (obj: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(obj)}\n`));
            const started = Date.now();

            send({ status: "started", at: new Date().toISOString() });
            heartbeat = setInterval(() => {
              send({ status: "heartbeat", elapsedMs: Date.now() - started });
            }, HEARTBEAT_INTERVAL_MS);

            await recordCronAttemptStart("qradar-sync", "manual");
            try {
              const result = await runQradarSync();
              await recordCronRun("qradar-sync", "manual", {
                ok: result.ok,
                error: result.error,
                durationMs: Date.now() - started,
              });
              send({ status: "done", result });
            } catch (e) {
              const msg = (e as Error).message;
              await recordCronRun("qradar-sync", "manual", {
                ok: false,
                error: msg,
                durationMs: Date.now() - started,
              });
              send({ status: "done", result: { ok: false, error: msg } });
            } finally {
              clearInterval(heartbeat);
              controller.close();
            }
          },
          cancel() {
            clearInterval(heartbeat);
          },
        });

        return new Response(stream, {
          status: 200,
          headers: { "Content-Type": "application/x-ndjson" },
        });
      },
    },
  },
});
