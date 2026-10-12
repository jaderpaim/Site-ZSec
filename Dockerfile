# Imagem do app (TanStack Start → servidor Node em .output/server/index.mjs).
#
# Build: os VITE_* entram no JavaScript do navegador -- só valores públicos,
# passados como --build-arg. Segredos do servidor NUNCA entram na imagem:
# são lidos em tempo de execução de /run/zsec/.env (arquivo montado do host).

FROM node:22-bookworm-slim AS build
COPY --from=oven/bun:1.4 /usr/local/bin/bun /usr/local/bin/bun
WORKDIR /app
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile
COPY . .
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_APP_NAME=Z-Sec
# Sem isso o build estoura o heap padrão de ~2 GB do Node.
ENV NODE_OPTIONS=--max-old-space-size=4096
RUN bun run build

FROM node:22-bookworm-slim
ENV NODE_ENV=production \
    PORT=3000
WORKDIR /app
COPY --from=build --chown=node:node /app/.output ./.output
USER node
EXPOSE 3000
CMD ["node", "--env-file=/run/zsec/.env", ".output/server/index.mjs"]
