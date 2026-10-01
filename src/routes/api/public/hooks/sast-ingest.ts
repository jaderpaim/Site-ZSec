import { createFileRoute } from "@tanstack/react-router";

// Ingestão direta do módulo SAST: a pipeline do Azure DevOps envia o
// relatório do scanner aqui. NÃO usa HOOK_SECRET (checkHookSecret) de
// propósito: quem chama é cada build, com a chave de ingestão SAST (sem poder
// nenhum além de enviar), e toda build é conferida na API do Azure DevOps com
// a credencial de leitura do próprio b-security -- ver sast-ingest.server.ts.
export const Route = createFileRoute("/api/public/hooks/sast-ingest")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        try {
          const { handleSastIngest } = await import("@/lib/sast-ingest.server");
          return await handleSastIngest(request);
        } catch (e) {
          console.error("[sast-ingest] erro inesperado:", (e as Error).message);
          return new Response(JSON.stringify({ ok: false, error: "Erro interno no b-security." }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
      },
    },
  },
});
