# B-Security — Painel de Segurança da Informação

Aplicação web corporativa da área de Segurança da Informação do Bernoulli. Ela centraliza, em dashboards interativos, os indicadores que antes ficavam no Power BI. Também reúne ferramentas operacionais: scanner DAST, Shadow IT, regras da Cloudflare, CMDB, GMUD e chamados do SOC.

- **Produção:** https://b-security.bernoulli.com.br
- **Preview Lovable:** https://b-security.lovable.app
- **Projeto Lovable:** https://lovable.dev/projects/ad2d9bfd-cf80-4493-9684-3c4d936f53e3

> O projeto nasceu no [Lovable](https://lovable.dev) e continua sincronizado com ele: o que é editado no Lovable vira commit neste repositório, e o que é enviado para `main` volta para o Lovable.

---

## Sumário

1. [Stack](#stack)
2. [Arquitetura](#arquitetura)
3. [Estrutura de pastas](#estrutura-de-pastas)
4. [Módulos do painel](#módulos-do-painel)
5. [Integrações externas](#integrações-externas)
6. [Endpoints públicos (hooks e cron)](#endpoints-públicos-hooks-e-cron)
7. [Autenticação, RBAC e sessão](#autenticação-rbac-e-sessão)
8. [Banco de dados (Supabase)](#banco-de-dados-supabase)
9. [Variáveis de ambiente](#variáveis-de-ambiente)
10. [Scripts](#scripts)
11. [Build e deploy](#build-e-deploy)
12. [Convenções do código](#convenções-do-código)
13. [Pendências conhecidas](#pendências-conhecidas)
14. [Configurando o ambiente de desenvolvimento (Windows + VSCode)](#configurando-o-ambiente-de-desenvolvimento-windows--vscode)
15. [Configurando o ambiente de desenvolvimento (macOS + VSCode)](#configurando-o-ambiente-de-desenvolvimento-macos--vscode)

---

## Stack

| Camada | Tecnologia |
| --- | --- |
| Framework full-stack | [TanStack Start](https://tanstack.com/start) (SSR + server functions) sobre **Vite 7** |
| Roteamento | TanStack Router, com rotas baseadas em arquivo (`src/routes`) |
| UI | React 19, Tailwind CSS 4, [shadcn/ui](https://ui.shadcn.com) (Radix UI), lucide-react |
| Dados no cliente | TanStack Query, react-hook-form + zod |
| Gráficos e planilhas | Recharts, react-grid-layout, SheetJS (`xlsx`) |
| Backend / BaaS | Supabase: Postgres, Auth, Realtime, RLS, `pg_cron`, `pg_net` e Edge Functions |
| Servidor de produção | Nitro (`node_server`), rodando como Node standalone no Azure App Service |
| Linguagem | TypeScript 5 (`strict`) |
| Gerenciador de pacotes | **Bun**: o `bun.lock` é a fonte de verdade das versões, porque é o lockfile que o Lovable mantém. O `npm` roda os scripts normalmente |
| Qualidade | ESLint 9 (flat config) + Prettier 3 |
| Config de build | `@lovable.dev/vite-tanstack-config`, que já inclui os plugins TanStack, React, Tailwind e tsconfig-paths |

---

## Arquitetura

```
Navegador (React SSR/CSR)
   │  server functions (createServerFn) + Bearer do Supabase
   ▼
Servidor TanStack Start / Nitro (Node)  ──►  APIs externas (Cloudflare, Sophos, QRadar, Zabbix...)
   │         ▲                                   (algumas atrás de Cloudflare Access)
   │         │ POST /api/public/hooks/*  (HOOK_SECRET)
   ▼         │
Supabase (Postgres + RLS + pg_cron/pg_net) ──► agenda os hooks de sincronização
   ▲
   │ callbacks cifrados
Serviços externos: motor DAST/ZAP + Shadow IT (FastAPI), worker SEK/Zendesk
```

- **Leitura e escrita de dados:** o cliente usa o Supabase com a chave publishable, respeitando RLS. Operações privilegiadas passam por server functions (`src/lib/*.functions.ts`), que usam a service role só no servidor (`client.server.ts`).
- **Sincronizações:** o `pg_cron` do Supabase chama os endpoints `/api/public/hooks/*` via `pg_net`, enviando o `HOOK_SECRET`. Os agendamentos são gerenciados na tela **Configurações → Cron Jobs**.
- **Credenciais de fornecedores** (Cloudflare, Sophos, QRadar etc.) **não ficam em variáveis de ambiente**. Elas são cadastradas na tela **Integração API** e gravadas cifradas (AES-256-GCM) na tabela `integrations`.
- `src/server.ts` é a entrada do servidor. Ele aplica os headers de segurança (`X-Frame-Options`, CSP `frame-ancestors 'none'`) e define uma página de erro própria.

---

## Estrutura de pastas

```
src/
├─ routes/                     # rotas de arquivo (TanStack Router)
│  ├─ index.tsx                # redireciona para /login ou /app
│  ├─ login.tsx, reset-password.tsx, ativar.tsx
│  ├─ trust.tsx                # página pública "Confiança e Segurança"
│  ├─ app.tsx                  # layout autenticado (sidebar + header)
│  ├─ app.$module.tsx          # renderiza o dashboard a partir do slug
│  └─ api/public/              # endpoints HTTP (hooks de cron, callbacks, SSO)
├─ components/
│  ├─ dashboard/               # um componente por módulo (*Real.tsx = dados reais)
│  │  ├─ dashboards.tsx        # mapa slug → componente
│  │  ├─ primitives.tsx        # KpiCard, Panel, Badge
│  │  └─ benchmark/ cloudflare/ cmdb/ fornecedores/ gmud/ maturidade/
│  │     nao-conformidade/ soc/ vulnerabilidades/   # abas e diálogos de cada módulo
│  ├─ layout/                  # AppHeader (filtros e export) e AppSidebar (menu por permissão)
│  └─ ui/                      # componentes shadcn/ui
├─ lib/
│  ├─ *.functions.ts           # server functions (createServerFn), chamadas pelo cliente
│  ├─ *.server.ts              # código exclusivo de servidor (nunca vai para o bundle do browser)
│  ├─ modules.ts               # catálogo de módulos e grupos da sidebar
│  ├─ authz.ts, use-permissions.ts, exclusive-modules.ts, session-policy.middleware.ts
│  ├─ auth-context.tsx, filters-context.tsx
│  └─ crypto.server.ts, ssrf-guard.server.ts, hook-auth.server.ts, http-retry.ts ...
├─ integrations/supabase/      # clients (browser/servidor), middleware de auth, types.ts gerado
├─ hooks/                      # use-mobile
├─ server.ts, start.ts, router.tsx, styles.css
└─ routeTree.gen.ts            # GERADO automaticamente, não editar

supabase/
├─ config.toml
├─ migrations/                 # ~290 migrations SQL (schema, RLS, RPCs, cron)
└─ functions/send-smtp/        # Edge Function: envio de e-mail via SendGrid

cicd/                          # pipelines do Azure DevOps
.github/workflows/             # sync manual HMG → repositório de produção
.lovable/                      # planos gerados pelo Lovable
```

---

## Módulos do painel

O catálogo fica em [src/lib/modules.ts](src/lib/modules.ts) e o mapeamento para componentes em [src/components/dashboard/dashboards.tsx](src/components/dashboard/dashboards.tsx).

| Grupo | Módulos |
| --- | --- |
| **Executivo** | Painel Executivo, Painel C-Level |
| **Monitoramento** | Cloudflare WAF, Domínios/SSL, Fornecedores, Privacy Tools (LGPD), DLP (Purview), Ranking de Uso de IA, SOC Monitoramento, Sophos XDR, Gestão de Vulnerabilidades |
| **Operações** | DAST Security Scanner, Shadow IT, Simulação de Phishing, WSUS, CMDB |
| **Governança** | Benchmark, Comitês, NPS, Gestão de Mudança (GMUD), Maturidade do Ambiente, Não Conformidade, Organização SI, Políticas e Processos, Pílulas de SI, Disponibilidade de Ativos |
| **Cadastros** | Aprovadores, Aplicações, Departamentos, Segmentos, Importação de Dados (CSV/XLSX) |
| **Configurações** *(só admin)* | Exceção Sophos, Logs, SMTP, SSO/LDAP, Usuários e Permissões, Integração API, Alertas, Cron Jobs |

---

## Integrações externas

| Fornecedor | Uso | Código |
| --- | --- | --- |
| Cloudflare | WAF, analytics, load balancing, regras, DNS, RUM | `cloudflare*.functions.ts`, `cloudflare.server.ts` |
| Sophos Central | eventos XDR, auditoria, eventos web (base do Ranking IA), licenças | `sophos*.ts`, `ia*.ts` |
| IBM QRadar | ofensas do SOC (via Cloudflare Access) | `qradar*.ts` |
| SEK / Zendesk | chamados do SOC (worker externo) | `sek-zendesk*.ts` |
| OWASP ZAP (motor FastAPI) | scanner DAST black/white box | `dast*.ts` |
| Motor Shadow IT (FastAPI) | varredura SMB/FTP/HTTP/NetBIOS | `shadowit*.ts` |
| Gophish | simulação de phishing | `phishing*.ts`, `gophish.server.ts` |
| Zabbix | disponibilidade de ativos, alertas Telegram/Teams | `zabbix*.ts`, `disponibilidade*.ts` |
| Microsoft Purview | eventos de DLP | `dlp*.ts` |
| Microsoft Entra ID | login SSO | `sso.functions.ts`, `routes/api/public/auth/azure/callback.ts` |
| Privacy Tools | LGPD | `privacy-tools*.ts` |
| SendGrid / SMTP | e-mails de alerta | `sendgrid*.ts`, `smtp.functions.ts`, Edge Function `send-smtp` |
| RDAP / IANA / ssl-checker | vencimento de domínios e certificados | `domains.functions.ts`, `ssl*.ts` |

O WSUS não tem API: os dados entram pela tela **Importação de Dados**.

> O motor DAST/Shadow IT e o worker SEK/Zendesk são **serviços separados** e não estão neste repositório. Eles se comunicam com o painel por HTTP autenticado e callbacks.

---

## Endpoints públicos (hooks e cron)

Todos ficam em `src/routes/api/public/hooks/` e são `POST`, protegidos por `HOOK_SECRET` (header `x-hook-secret`, `apikey` ou `x-api-key`). Cada execução é registrada para a tela Cron Jobs.

| Grupo | Hooks |
| --- | --- |
| Sincronizações | `cloudflare-sync`, `sophos-sync`, `sophos-audit-sync`, `sophos-ia-sync`, `ranking-ia-sync`, `qradar-sync` (streaming com heartbeat), `qradar-sync-watchdog`, `dlp-sync`, `gophish-sync`, `privacy-tools-sync` |
| Caches | `zabbix-cache-refresh`, `cmdb-dns-cache-refresh` |
| Alertas | `domains-check`, `ssl-check`, `fornecedores-check`, `cmdb-device-alerts`, `gmud-escalate` |
| DAST / Shadow IT | `dast-callback`, `dast-schedules-run`, `shadowit-callback`, `vuln-snapshot` |
| SEK / Zendesk | `sek-zendesk-sync`, `sek-zendesk-tickets-sync`, `sek-zendesk-auth-log` |

Exceções à regra do `HOOK_SECRET`:

- `qradar-sync-manual` usa o Bearer do usuário (admin ou analista).
- `sek-zendesk-session-upload` valida um JWT próprio (`SEK_RENEWAL_SECRET`).
- `api/public/auth/azure/callback` (GET) é o callback OAuth do SSO.

---

## Autenticação, RBAC e sessão

- **Login:** e-mail e senha (Supabase Auth) ou SSO Microsoft Entra ID. O SSO exige que o usuário já esteja pré-cadastrado.
- **Papéis** (`app_role`): `super_admin`, `admin`, `analista`, `visualizador` (padrão) e `personalizado`.
- **Permissões granulares por módulo:** view, edit, create, delete, approve, execute, manage, além de sub-ações da Cloudflare. Ficam nas tabelas `user_roles`, `module_admins` e `user_module_permissions`. O front é atualizado via Realtime.
- **Helpers de servidor** em [src/lib/authz.ts](src/lib/authz.ts): `requirePermission`, `hasPermission`, `requireAdminOrAnalista`, `requireGlobalAdminRole`.
- **Módulos exclusivos** (`benchmark`, `painel-executivo`, `painel-c-level`) só liberam acesso direto para `super_admin`. A lista em [src/lib/exclusive-modules.ts](src/lib/exclusive-modules.ts) precisa ficar igual à do SQL.
- **Ações destrutivas** exigem papel global de admin, além da permissão granular, e geram log de auditoria e alerta.
- **Política de sessão:** limite absoluto de 24h e 8h de inatividade.
  - No cliente, `auth-context.tsx` verifica a sessão a cada 30s e manda heartbeat a cada 60s.
  - No servidor, `requireActiveSession` valida `profiles.session_started_at` e `last_active_at`.
- **Logs:** `auth_access_logs` registra apenas login e logout. `audit_logs` e `system_audit_log` registram ações.

---

## Banco de dados (Supabase)

- O projeto Supabase está definido em [supabase/config.toml](supabase/config.toml).
- As migrations ficam em `supabase/migrations/` e cobrem schema, RLS, RPCs de RBAC (`has_role`, `has_module_permission`, `is_module_admin`...) e agendamentos `pg_cron`.
- Os tipos gerados ficam em [src/integrations/supabase/types.ts](src/integrations/supabase/types.ts). Algumas tabelas criadas manualmente (ex.: `sek_tickets`) ainda não aparecem nesse arquivo.
- **Regra da equipe:** nunca edite uma migration já criada. Toda mudança entra como uma **nova migration incremental** (`ALTER ...`).
- **Escritas no Supabase de produção são feitas manualmente** pelo responsável, nunca por script automático.

---

## Variáveis de ambiente

Crie um arquivo **`.env.local`** na raiz do projeto. Ele já está no `.gitignore`, porque o padrão `*.local` é ignorado. **Nunca faça commit dele.** Peça os valores ao responsável pelo projeto.

```dotenv
# --- Supabase (obrigatório para o app subir) ---
VITE_SUPABASE_URL=https://<project-id>.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<publishable/anon key>
VITE_SUPABASE_PROJECT_ID=<project-id>
SUPABASE_URL=https://<project-id>.supabase.co
SUPABASE_PUBLISHABLE_KEY=<publishable/anon key>
SUPABASE_PROJECT_ID=<project-id>
SUPABASE_SERVICE_ROLE_KEY=<service role key>      # só servidor

# --- Hooks / criptografia ---
HOOK_SECRET=<segredo dos endpoints /api/public/hooks>
INTEGRATIONS_ENCRYPTION_KEY=<chave AES das credenciais de integração>

# --- Cloudflare Access (QRadar, Gophish, Zabbix, DAST, SEK) ---
CF_ACCESS_CLIENT_ID=
CF_ACCESS_CLIENT_SECRET=

# --- SSO Microsoft Entra ID ---
AZURE_CLIENT_SECRET=
SSO_STATE_SECRET=
SSO_REDIRECT_URI=http://localhost:8080/api/public/auth/azure/callback

# --- SEK / Zendesk ---
SEK_RENEWAL_SECRET=

# --- Opcionais ---
SMTP_PASSWORD=
APP_URL=http://localhost:8080          # padrão: https://b-security.bernoulli.com.br
PUBLIC_APP_URL=http://localhost:8080
```

Algumas variáveis aparecem no `.env.local` da equipe mas são usadas pelos serviços externos (motor DAST e worker SEK), não por este app: `ZAP_API_KEY`, `SCANNER_API_SECRET`, `SESSION_ENCRYPTION_KEY` e `BSECURITY_HOOK_URL`.

> Variáveis com prefixo `VITE_` são embutidas no bundle do navegador. **Nunca** coloque segredo em variável `VITE_`.

---

## Scripts

| Comando | O que faz |
| --- | --- |
| `npm run dev` | Sobe o servidor de desenvolvimento em **http://localhost:8080**, com hot reload |
| `npm run build` | Build de produção. Gera `.output/`, com um servidor Node standalone em `.output/server/index.mjs` |
| `npm run build:dev` | Build em modo development |
| `npm run preview` | Serve o build localmente |
| `npm run lint` | Roda o ESLint no projeto |
| `npm run format` | ⚠️ **Não rode.** Ele reformata o repositório inteiro (veja [Convenções](#convenções-do-código)) |
| `npx tsc --noEmit` | Checagem de tipos. Hoje passa **sem nenhum erro** |

---

## Build e deploy

- **Azure DevOps** ([cicd/azure-pipelines.yml](cicd/azure-pipelines.yml)): roda nas branches `homolog` (Beta) e `main` (Prod).
  - Executa `npm run build` e publica `.output/` no Azure App Service com `node server/index.mjs`.
  - Aplica as migrations do Supabase e roda Sonar e Gitleaks.
  - As variáveis `VITE_*` vêm dos Key Vaults `b-kv-seg-info` (Beta) e `p-kv-seg-info` (Prod).
- **Espelhamento GitHub → Azure DevOps** ([cicd/lovable-pipelines.yml](cicd/lovable-pipelines.yml)): disparo manual. Cria um commit squash na branch `homolog` do repositório `b-security`.
- **GitHub Actions** ([.github/workflows/sync-prod.yml](.github/workflows/sync-prod.yml)): disparo manual. Espelha HMG para `Si-Bernoulli/indicadores-de-seguran-a`.
- O [vite.config.ts](vite.config.ts) força o preset Nitro `node_server` fora do Lovable. Dentro do Lovable, o padrão é `cloudflare-module`.

---

## Convenções do código

- **Não rode `prettier --write` / `npm run format` em massa.** O repositório nunca foi formatado com o `.prettierrc` atual, então o comando reformataria todos os arquivos e sujaria o diff. Formate só o trecho que você editou.
- **`*.server.ts`** guarda código só de servidor: service role, segredos, chamadas a APIs externas. Não use o pacote `server-only` do Next.js; o ESLint bloqueia esse import.
- **`*.functions.ts`** guarda as server functions (`createServerFn`) chamadas pelo cliente.
- **Não use `throw new Response(...)` dentro de middleware de `createServerFn`.** O cliente recebe isso como um "sucesso" com dado corrompido. Lance um `Error` ou retorne o erro de forma explícita.
- **Novas regras e criações sensíveis** (ex.: regras da Cloudflare) são criadas **desativadas** e disparam alerta.
- **Imports** usam o alias `@/` para `src/`.
- **Componentes de UI novos** entram pelo shadcn: `npx shadcn@latest add <componente>`. A config está em [components.json](components.json).
- `src/routeTree.gen.ts` é gerado pelo TanStack Router ao rodar o dev server. **Não edite esse arquivo à mão.**

---

## Pendências conhecidas

- **`wrangler.jsonc` está com o conteúdo errado.** O arquivo contém uma cópia do código de `qradar-sync.ts`, não uma config do Wrangler. Não afeta o build Node (Azure), mas precisa ser corrigido se o deploy Cloudflare for usado.
- **Arquivos soltos na raiz:** `cloudflared.exe` (~55 MB) e `worker-index.b64` (vazio) estão versionados e deveriam sair do repositório ou entrar no `.gitignore`.
- **Não existe `.env.example`.** Use o modelo da seção [Variáveis de ambiente](#variáveis-de-ambiente).
- **Existem dois lockfiles, `package-lock.json` e `bun.lock`.** O Lovable atualiza o `bun.lock`, e o `package-lock.json` pode ficar defasado.
- **ESLint:** o projeto tem ~10,7 mil avisos `prettier/prettier` (só formatação) e ~1,2 mil `no-explicit-any`. Nenhum deles quebra o build. A seção abaixo mostra como deixar o editor limpo sem reformatar o código.

---

## Configurando o ambiente de desenvolvimento (Windows + VSCode)

Passo a passo para uma máquina nova rodar o projeto sem erros no editor e com a interface igual à de produção.

### 1. Instalar as ferramentas base

Abra o **PowerShell** e instale com o `winget`, que já vem no Windows 10/11:

```powershell
# Git
winget install --id Git.Git -e

# Node.js LTS (inclui npm). O projeto exige Node >= 20.19; recomendado 22 LTS ou 24
winget install --id OpenJS.NodeJS.LTS -e

# Visual Studio Code
winget install --id Microsoft.VisualStudioCode -e

# Bun (gerenciador de pacotes usado para instalar as dependências)
powershell -c "irm bun.sh/install.ps1 | iex"
```

**Feche e reabra o terminal** e confira as versões:

```powershell
git --version     # ex.: git version 2.5x
node -v           # v22.x ou v24.x
npm -v            # 10.x ou 11.x
bun -v            # 1.x
```

> Se você precisa alternar entre várias versões de Node, use o [nvm-windows](https://github.com/coreybutler/nvm-windows): `winget install CoreyButler.NVMforWindows`, depois `nvm install 22` e `nvm use 22`.

> Se o PowerShell bloquear o `npm`/`npx` com "execução de scripts desabilitada", rode uma vez:
> `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned`

### 2. Clonar o projeto

```powershell
cd $HOME\Documents
git clone <url-do-repositório> b-security
cd b-security
code .
```

> Evite pastas sincronizadas pelo OneDrive, que deixam o `node_modules` lento e podem travar arquivos.

### 3. Instalar as dependências

```powershell
bun install --frozen-lockfile
```

- Esse comando instala **todas** as bibliotecas do `package.json` exatamente nas versões do `bun.lock`: React, TanStack, Radix/shadcn, Tailwind, Supabase, Recharts, ESLint, Prettier, TypeScript etc. Não é preciso instalar nenhuma delas separadamente.
- **Use o Bun, não o `npm install`.** O `package-lock.json` está defasado em relação ao `bun.lock`, então o npm instala versões mais novas do TanStack Router. Com elas, o projeto passa a ter erro de tipo (veja [Problemas comuns](#8-problemas-comuns)). Se você rodou `npm install` por engano, desfaça com `git checkout package-lock.json`, apague o `node_modules` e rode o comando acima.
- Depois de instalar com o Bun, os scripts podem ser rodados com `npm run ...` ou `bun run ...`, tanto faz.
- A biblioteca `xlsx` é baixada de `cdn.sheetjs.com`. Se a rede corporativa bloquear esse domínio, a instalação falha. Libere o acesso ou use outra rede.
- Se aparecer erro de binário nativo (`rollup`, `lightningcss`, `@tailwindcss/oxide`), apague o `node_modules` e rode `bun install --frozen-lockfile` de novo.

### 4. Configurar as variáveis de ambiente

Crie o arquivo `.env.local` na raiz, conforme a seção [Variáveis de ambiente](#variáveis-de-ambiente), e preencha os valores. Sem as variáveis do Supabase, o app não consegue fazer login.

### 5. Instalar as extensões do VSCode

Rode no terminal:

```powershell
code --install-extension dbaeumer.vscode-eslint
code --install-extension esbenp.prettier-vscode
code --install-extension bradlc.vscode-tailwindcss
code --install-extension csstools.postcss
code --install-extension mikestead.dotenv
code --install-extension usernamehw.errorlens
code --install-extension supabase.vscode-supabase-extension
```

| Extensão | Para quê |
| --- | --- |
| **ESLint** | Mostra os problemas de lint conforme o `eslint.config.js` |
| **Prettier** | Formatação no padrão do `.prettierrc` (100 colunas, aspas duplas, `;`, trailing comma) |
| **Tailwind CSS IntelliSense** | Autocomplete das classes e entendimento de `@theme`, `@apply` e `@custom-variant` do Tailwind 4 |
| **PostCSS Language Support** | Evita que o `styles.css` seja marcado como CSS inválido |
| DotENV *(opcional)* | Destaque de sintaxe do `.env.local` |
| Error Lens *(opcional)* | Mostra erros e avisos na própria linha |
| Supabase *(opcional)* | Navegação pelo banco e migrations |

Para recomendar essas extensões automaticamente a quem abrir o projeto, crie `.vscode/extensions.json`. Esse arquivo pode ser commitado, porque o `.gitignore` já o libera:

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "bradlc.vscode-tailwindcss",
    "csstools.postcss",
    "mikestead.dotenv",
    "usernamehw.errorlens"
  ]
}
```

### 6. Configurar o VSCode (`.vscode/settings.json`)

Crie ou substitua `.vscode/settings.json` com o conteúdo abaixo. Ele faz quatro coisas:

- Usa o TypeScript do projeto, e não o embutido no VSCode.
- Faz o editor entender a sintaxe do Tailwind 4 no CSS.
- **Esconde os ~10 mil avisos de formatação do Prettier** e rebaixa `no-explicit-any` para aviso. Assim o editor fica sem linhas vermelhas, e os erros reais continuam aparecendo.
- **Desliga o "formatar ao salvar"**, para não reformatar o arquivo inteiro a cada `Ctrl+S`. Para formatar só o trecho editado, selecione-o e use `Ctrl+K Ctrl+F`.

```json
{
  "typescript.tsdk": "node_modules/typescript/lib",
  "typescript.enablePromptUseWorkspaceTsdk": true,
  "typescript.preferences.importModuleSpecifier": "non-relative",

  "css.validate": false,
  "css.lint.unknownAtRules": "ignore",
  "files.associations": { "*.css": "tailwindcss" },
  "tailwindCSS.experimental.configFile": "src/styles.css",
  "tailwindCSS.classFunctions": ["cn", "cva", "clsx"],

  "editor.defaultFormatter": "esbenp.prettier-vscode",
  "editor.formatOnSave": false,
  "editor.formatOnPaste": false,
  "editor.codeActionsOnSave": { "source.fixAll.eslint": "never" },
  "files.eol": "\n",
  "files.encoding": "utf8",

  "eslint.useFlatConfig": true,
  "eslint.validate": ["javascript", "typescript", "typescriptreact"],
  "eslint.rules.customizations": [
    { "rule": "prettier/prettier", "severity": "off" },
    { "rule": "@typescript-eslint/no-explicit-any", "severity": "warn" }
  ],

  "files.readonlyInclude": { "src/routeTree.gen.ts": true },
  "search.exclude": {
    "**/node_modules": true,
    "**/.output": true,
    "**/dist": true,
    "**/.tanstack": true,
    "**/.wrangler": true,
    "src/routeTree.gen.ts": true
  },
  "files.watcherExclude": {
    "**/node_modules/**": true,
    "**/.output/**": true,
    "**/.tanstack/**": true
  }
}
```

Depois de salvar, abra qualquer arquivo `.tsx` e rode `Ctrl+Shift+P` → **TypeScript: Select TypeScript Version** → **Use Workspace Version**. Em seguida, rode `Ctrl+Shift+P` → **Developer: Reload Window**.

### 7. Rodar o projeto

```powershell
npm run dev
```

Acesse **http://localhost:8080** e faça login com um usuário já cadastrado no Supabase.

Para validar que está tudo certo:

```powershell
npx tsc --noEmit   # deve terminar sem nenhuma saída (0 erros de tipo)
npm run build      # deve gerar a pasta .output/ sem erros
```

### 8. Problemas comuns

| Sintoma | Causa e solução |
| --- | --- |
| Muitas linhas vermelhas `Insert ⏎····` / `Delete ··` | Avisos do Prettier: aplique o `eslint.rules.customizations` do passo 6 |
| `Unknown at rule @theme` / `@custom-variant` no CSS | Faltou a extensão Tailwind ou a config `css.validate: false` |
| Imports `@/...` marcados como "não encontrado" | O VSCode está usando outro TypeScript: selecione a *Workspace Version* |
| `TS2322` em `src/routes/__root.tsx` (`errorComponent`, `Type 'unknown' is not assignable to type 'Error'`) | As dependências foram instaladas com `npm install`, que puxou um TanStack Router mais novo que o do `bun.lock`. Rode `git checkout package-lock.json`, apague o `node_modules` e rode `bun install --frozen-lockfile` |
| Centenas de erros `Cannot find module 'react'` / `'@tanstack/...'` no editor | O `node_modules` não existe: faltou o passo 3 |
| Erros de tipo em rota nova (`createFileRoute`) | O `routeTree.gen.ts` ainda não foi regenerado: rode `npm run dev` uma vez |
| Erro `Missing Supabase environment variable(s)` | `.env.local` ausente, ou sem as variáveis `VITE_SUPABASE_*` e `SUPABASE_*` |
| `npm install` falha no pacote `xlsx` | Acesso a `cdn.sheetjs.com` bloqueado pela rede |
| Porta 8080 ocupada | Libere a porta: `Get-Process -Id (Get-NetTCPConnection -LocalPort 8080).OwningProcess \| Stop-Process` |
| Acentos quebrados (`SeguranÃ§a`) | Arquivo salvo fora de UTF-8: confira `files.encoding: utf8` e o canto inferior direito do VSCode |

---

## Configurando o ambiente de desenvolvimento (macOS + VSCode)

A maior parte do guia do Windows também vale para o Mac. Os passos **3 (dependências), 4 (`.env.local`), 6 (`settings.json`) e 7 (rodar)** são idênticos: o mesmo `settings.json` funciona nos dois sistemas. Esta seção cobre só o que muda.

### 1. Instalar as ferramentas base

No macOS, use o **Homebrew** no lugar do `winget`. Abra o **Terminal** e rode:

```bash
# Homebrew (se ainda não tiver)
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"

# Apple Silicon (M1/M2/M3/M4): coloque o brew no PATH
echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
eval "$(/opt/homebrew/bin/brew shellenv)"

# Git, Node LTS e VSCode
brew install git node@22
brew install --cask visual-studio-code
```

O `node@22` do Homebrew não entra no PATH sozinho. Adicione-o:

```bash
echo 'export PATH="$(brew --prefix node@22)/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc
node -v   # v22.x
npm -v
```

Instale também o **Bun**, que é usado para instalar as dependências (passo 3 do guia do Windows):

```bash
npm install -g bun
bun -v    # 1.x
```

> O `npm install -g bun` usa o Node do Homebrew ou do nvm e não pede `sudo`. A alternativa `brew install oven-sh/bun/bun` **falha** se o Xcode instalado estiver desatualizado (`Error: Your Xcode (16.x) ... is too outdated`). Nesse caso, use o comando do npm ou atualize o Xcode pela App Store.

Com as ferramentas instaladas, na pasta do projeto:

```bash
bun install --frozen-lockfile
npx tsc --noEmit   # deve terminar sem nenhuma saída
```

> **Alternativa recomendada se você usa várias versões de Node:** o [nvm](https://github.com/nvm-sh/nvm).
> `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash`, reabra o terminal, depois `nvm install 22` e `nvm alias default 22`.
> Nesse caso, **não** instale o `node@22` pelo brew, para não ter dois Nodes no PATH.

> O `git` também pode vir das Command Line Tools da Apple (`xcode-select --install`). Instale-as de qualquer forma, porque alguns pacotes npm precisam delas para compilar.

### 2. Habilitar o comando `code` no terminal

No Mac, o comando `code` **não vem no PATH** por padrão, e sem ele os comandos `code --install-extension` do passo 5 não funcionam. Para habilitar:

1. Abra o VSCode.
2. Pressione `Cmd+Shift+P`.
3. Escolha **Shell Command: Install 'code' command in PATH**.
4. Feche e reabra o Terminal.

Depois disso, clone e abra o projeto normalmente:

```bash
cd ~/Documents
git clone <url-do-repositório> b-security
cd b-security
code .
```

> Evite pastas sincronizadas pelo iCloud Drive (Mesa/Documentos com "Otimizar armazenamento" ligado). O iCloud pode descarregar arquivos do `node_modules` e quebrar o projeto.

### 3. Extensões e `settings.json`

Os comandos `code --install-extension ...` e os arquivos `.vscode/extensions.json` e `.vscode/settings.json` são **exatamente os mesmos** do guia do Windows.

### 4. Atalhos: troque `Ctrl` por `Cmd`

| Ação | Windows | macOS |
| --- | --- | --- |
| Paleta de comandos | `Ctrl+Shift+P` | `Cmd+Shift+P` |
| Formatar só a seleção | `Ctrl+K Ctrl+F` | `Cmd+K Cmd+F` |
| Salvar | `Ctrl+S` | `Cmd+S` |
| Abrir terminal integrado | `` Ctrl+` `` | `` Ctrl+` `` (igual) |
| Recarregar janela | Paleta → **Developer: Reload Window** | Paleta → **Developer: Reload Window** |

### 5. Problemas específicos do Mac

| Sintoma | Causa e solução |
| --- | --- |
| `zsh: command not found: code` | Faltou o passo 2 (**Install 'code' command in PATH**) |
| `zsh: command not found: node` / `brew` | PATH não configurado: refaça as linhas do `~/.zprofile`/`~/.zshrc` e reabra o terminal |
| Erro de binário nativo (`@rollup/rollup-darwin-arm64`, `lightningcss`, `@tailwindcss/oxide`) | O `node_modules` foi copiado de outra máquina ou arquitetura. Rode `rm -rf node_modules && bun install --frozen-lockfile` |
| `brew install` falha com `Your Xcode (...) is too outdated` | Atualize o Xcode pela App Store ou, só para o Bun, use `npm install -g bun` |
| `zsh: command not found: bun` | Faltou instalar o Bun (`npm install -g bun`) ou o terminal foi aberto antes da instalação: reabra-o |
| `EACCES: permission denied` no `npm install -g` | Não use `sudo npm`. Instale o Node pelo Homebrew ou nvm, que não exigem root |
| Porta 8080 ocupada | Libere a porta: `lsof -ti :8080 \| xargs kill -9` |
| Import funciona no Mac mas quebra no build/CI | O disco do macOS não diferencia maiúsculas de minúsculas, mas o Linux do CI sim. Confira se o import usa exatamente o mesmo nome do arquivo (ex.: `SocReal.tsx` ≠ `socReal.tsx`) |
| Aviso do Gatekeeper ao abrir o VSCode baixado manualmente | Mova o app para `/Applications` e abra pelo Finder uma vez, ou instale via `brew --cask` |
