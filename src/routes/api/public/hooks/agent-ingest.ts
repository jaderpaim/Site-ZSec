import { createFileRoute } from "@tanstack/react-router";
import { APP_NAME } from "@/lib/brand";

// Ingestão do agente Z-Sec (Windows/macOS) — uso de apps de IA fora do
// navegador. NÃO usa HOOK_SECRET: cada máquina envia com a chave de ingestão
// do agente (AGENT_INGEST_KEY), que só permite enviar — ver agent-ingest.server.ts.
export const Route = createFileRoute("/api/public/hooks/agent-ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { handleAgentIngest } = await import("@/lib/agent-ingest.server");
          return await handleAgentIngest(request);
        } catch (e) {
          console.error("[agent-ingest] erro inesperado:", (e as Error).message);
          return new Response(JSON.stringify({ ok: false, error: `Erro interno no ${APP_NAME}.` }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
