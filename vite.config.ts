import { defineConfig } from "@lovable.dev/vite-tanstack-config";

export default defineConfig({
  tanstackStart: {
    server: { entry: "server" },
  },
  // Default preset (cloudflare-module) only applies inside a Lovable build —
  // outside it (e.g. Azure Pipelines), this override wins, producing a
  // standalone Node server at .output/server/index.mjs for App Service deploy.
  nitro: {
    preset: "node_server",
  },
  vite: {
    build: {
      // Por padrão o Vite comprime cada chunk em gzip só pra exibir o
      // tamanho no log ("│ gzip: X kB") — não afeta o artefato final, é só
      // relatório. Com mais chunks (por causa do manualChunks abaixo), esse
      // trabalho extra cresce. Desligar reduz memória/tempo de build sem
      // mudar um byte do que é gerado (testado localmente: build ok, server
      // sobe normal).
      reportCompressedSize: false,
      // Sem isso, todo o app (incl. libs pesadas como xlsx/recharts) vira um
      // único chunk de 2.3MB — Rollup recomendou explicitamente esse split.
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (!id.includes("node_modules")) return;
            if (id.includes("xlsx")) return "vendor-xlsx";
            if (id.includes("recharts") || id.includes("d3-")) return "vendor-charts";
            if (id.includes("@supabase")) return "vendor-supabase";
            if (id.includes("@tanstack")) return "vendor-tanstack";
            if (id.includes("@radix-ui")) return "vendor-radix";
            if (/node_modules\/react-dom/.test(id) || /node_modules\/react\//.test(id)) return "vendor-react";
          },
        },
      },
    },
    // Minificar o bundle SSR só gasta memória de build à toa — esse código
    // nunca roda no navegador, tamanho de arquivo não importa aqui.
    environments: {
      ssr: {
        build: { minify: false },
      },
    },
  },
});
