# Z-Sec — Plataforma de Segurança da Informação

Aplicação web para áreas de Segurança da Informação. Ela reúne, em dashboards, os indicadores de segurança da empresa (WAF, XDR, SOC, vulnerabilidades, DLP, maturidade) e também ferramentas operacionais: scanner DAST, Shadow IT, simulação de phishing, CMDB, gestão de mudanças (GMUD), treinamentos e chamados do SOC.

> **Nome do produto:** "Z-Sec" é provisório. O nome exibido vem da variável `VITE_APP_NAME` (ver [src/lib/brand.ts](src/lib/brand.ts)), então trocar o nome não exige mexer no código.

> **Origem:** o projeto nasceu no [Lovable](https://lovable.dev) como painel interno de uma empresa e está sendo transformado em produto para várias empresas. O build ainda usa o pacote `@lovable.dev/vite-tanstack-config`, mas o repositório não é mais sincronizado com o Lovable.

---

## Sumário

1. [Stack](#stack)
2. [Arquitetura](#arquitetura)
3. [Estrutura de pastas](#estrutura-de-pastas)
4. [Módulos](#módulos)
5. [Integrações](#integrações)
6. [Endpoints públicos (hooks e cron)](#endpoints-públicos-hooks-e-cron)
7. [Autenticação, RBAC e sessão](#autenticação-rbac-e-sessão)
8. [Banco de dados (Supabase)](#banco-de-dados-supabase)
9. [Variáveis de ambiente](#variáveis-de-ambiente)
10. [Scripts](#scripts)
11. [Build e deploy](#build-e-deploy)
12. [Fluxo de trabalho com Git](#fluxo-de-trabalho-com-git)
13. [Convenções do código](#convenções-do-código)
14. [Pendências conhecidas](#pendências-conhecidas)
15. [Ambiente de desenvolvimento (Windows + VSCode)](#ambiente-de-desenvolvimento-windows--vscode)
16. [Ambiente de desenvolvimento (macOS + VSCode)](#ambiente-de-desenvolvimento-macos--vscode)

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
| Servidor de produção | Nitro (`node_server`): um servidor Node standalone em `.output/server/index.mjs` |
| Linguagem | TypeScript 5 (`strict`) |
| Gerenciador de pacotes | **Bun**: o `bun.lock` é a fonte de verdade das versões. O `npm` roda os scripts normalmente |
| Qualidade | ESLint 9 (flat config) + Prettier 3 |
| Agente de estações | Go (pasta [agent/](agent/)) |
| Servidor de scanner | Python/FastAPI (pasta [scripts/dast-provisioning/](scripts/dast-provisioning/)) |

---

## Arquitetura

### Modelo: um banco por empresa

Cada empresa cliente tem **o próprio projeto Supabase** (banco, Auth e Storage) e a própria instância da aplicação. Nada é compartilhado entre clientes, o que dá isolamento total dos dados. Por isso o código continua "de empresa única": não existe coluna `empresa_id` nas tabelas.

Os dados da empresa que opera cada instância (nome, nome curto, domínio corporativo) ficam na tabela `organizacao_config` e são editados em **Configurações → Dados da Organização**.

### Como as peças conversam

```
Navegador (React SSR/CSR)
   │  server functions (createServerFn) + Bearer do Supabase
   ▼
Servidor TanStack Start / Nitro (Node)  ──►  APIs na nuvem (Cloudflare, Sophos, Purview, Azure DevOps...)
   │         ▲                         ──►  sistemas on-prem do cliente (via Cloudflare Access, hoje)
   │         │ POST /api/public/hooks/*  (HOOK_SECRET)
   ▼         │
Supabase (Postgres + RLS + pg_cron/pg_net) ──► agenda os hooks de sincronização
   ▲
   │ push com chave própria
Agente das estações · pipelines SAST · servidor de scanner (callbacks)
```

- **Leitura e escrita de dados:** o navegador usa o Supabase com a chave publishable, respeitando o RLS. Operações privilegiadas passam por server functions (`src/lib/*.functions.ts`), que usam a service role só no servidor.
- **Sincronizações:** o `pg_cron` do Supabase chama os endpoints `/api/public/hooks/*` via `pg_net`, enviando o `HOOK_SECRET`. Os agendamentos são gerenciados em **Configurações → Cron Jobs**, que monta a URL a partir de `APP_URL`.
- **Credenciais de fornecedores** (Cloudflare, Sophos, QRadar etc.) **não ficam em variáveis de ambiente**. Elas são cadastradas em **Configurações → Integração API** e gravadas **cifradas (AES-256-GCM)** na tabela `integrations` (`api_key` e os segredos dentro de `config`), assim como a senha do SMTP em `smtp_config`. A chave é a `INTEGRATIONS_ENCRYPTION_KEY`, que fica só no `.env`: um dump do banco sozinho não revela os segredos.
  - Código: `writeSecret` / `readSecret` em [src/lib/crypto.server.ts](src/lib/crypto.server.ts). Toda leitura de credencial passa por `readSecret`, que também aceita valores antigos em texto puro (eles passam a ser cifrados no próximo salvamento).
  - **Perder ou trocar a `INTEGRATIONS_ENCRYPTION_KEY` invalida todas as credenciais gravadas** (é preciso recadastrá-las). Guarde-a num cofre de senhas.
- `src/server.ts` é a entrada do servidor. Ele aplica os headers de segurança (`X-Frame-Options`, CSP `frame-ancestors 'none'`) e define uma página de erro própria.

### Direção para várias empresas (planejado)

| Camada | O que é | Onde roda |
| --- | --- | --- |
| **Z-Sec** | A aplicação, um banco por cliente | Nuvem |
| **Serviços gerenciados** | DAST externo e Gophish, operados por nós | Nuvem |
| **Z-Sec Collector** | Appliance na rede do cliente: scanner interno, SIEM on-prem, AD/DNS/SMB/LDAP, Zabbix. Evolução do `scripts/dast-provisioning` | Rede do cliente, **só conexão de saída** (busca trabalho na nuvem, como um runner de CI) |
| **Agentes** | Estações: uso de IA, Shadow IT | Máquinas do cliente, enviam por push |

O SIEM será tratado por adaptadores: SIEM em nuvem (Wazuh Cloud, Sentinel, Elastic, Splunk Cloud) direto pela API, SIEM on-prem (QRadar, Wazuh, Splunk) pelo Collector, ou o próprio SIEM enviando alertas por webhook/syslog.

---

## Estrutura de pastas

```
src/
├─ routes/                     # rotas de arquivo (TanStack Router)
│  ├─ index.tsx                # redireciona para /login ou /app
│  ├─ login.tsx, reset-password.tsx, ativar.tsx
│  ├─ trust.tsx                # página pública "Confiança e Segurança"
│  ├─ treinamentos.tsx         # portal do colaborador (treinamentos atribuídos)
│  ├─ app.tsx                  # layout autenticado (sidebar + header)
│  ├─ app.$module.tsx          # renderiza o dashboard a partir do slug
│  └─ api/public/              # endpoints HTTP (hooks de cron, callbacks, SSO)
├─ components/
│  ├─ dashboard/               # um componente por módulo (*Real.tsx = dados reais)
│  │  ├─ dashboards.tsx        # mapa slug → componente
│  │  └─ benchmark/ cloudflare/ cmdb/ fornecedores/ gmud/ maturidade/
│  │     nao-conformidade/ soc/ vulnerabilidades/   # abas e diálogos de cada módulo
│  ├─ layout/                  # AppHeader, AppSidebar, CommandMenu, DetailSheet
│  └─ ui/                      # componentes shadcn/ui
├─ lib/
│  ├─ *.functions.ts           # server functions (createServerFn), chamadas pelo cliente
│  ├─ *.server.ts              # código exclusivo de servidor (nunca vai para o bundle do navegador)
│  ├─ brand.ts                 # APP_NAME (nome do produto)
│  ├─ app-url.ts               # APP_URL (endereço público da instância)
│  ├─ organizacao.*.ts         # dados da organização (organizacao_config)
│  ├─ modules.ts               # catálogo de módulos e grupos da sidebar
│  ├─ authz.ts, use-permissions.ts, exclusive-modules.ts, session-policy.middleware.ts
│  └─ crypto.server.ts, ssrf-guard.server.ts, hook-auth.server.ts, http-retry.ts ...
├─ integrations/supabase/      # clients (navegador/servidor), middleware de auth, types.ts gerado
├─ server.ts, start.ts, router.tsx, styles.css
└─ routeTree.gen.ts            # GERADO automaticamente, não editar

supabase/
├─ config.toml                 # config do Supabase CLI local (project_id "zsec-local")
└─ migrations/                 # ~300 migrations SQL (schema, RLS, RPCs, cron)

agent/                         # agente Go das estações (Windows/macOS) → /api/public/hooks/agent-ingest
scripts/dast-provisioning/     # servidor de scanner (FastAPI): DAST, Shadow IT, DNS/AD, proxy do SEK
Documentações/                 # PDFs de PoC técnicas
.env.example                   # modelo de todas as variáveis de ambiente
```

---

## Módulos

O catálogo fica em [src/lib/modules.ts](src/lib/modules.ts) e o mapeamento para componentes em [src/components/dashboard/dashboards.tsx](src/components/dashboard/dashboards.tsx).

| Grupo | Módulos |
| --- | --- |
| **Executivo** | Painel Executivo |
| **Monitoramento** | Cloudflare WAF, Domínios/SSL, Fornecedores, Privacy Tools (LGPD), DLP (Purview), Ranking de Uso de IA, SOC Monitoramento, Sophos XDR, Gestão de Vulnerabilidades |
| **Operações** | DAST Security Scanner, Shadow IT, Simulação de Phishing, WSUS, CMDB, SAST |
| **Governança** | Benchmark, Comitês, NPS, Gestão de Mudança (GMUD), Maturidade do Ambiente, Não Conformidade, Organização SI, Políticas e Processos, Pílulas de SI, Treinamentos, Disponibilidade de Ativos, Notas de maturidade (Segmentos) |
| **Cadastros** | Aprovadores, Aplicações, Departamentos, Importação de Dados (CSV/XLSX) |
| **Configurações** *(só admin)* | Dados da Organização, Exceção Sophos, Logs, SMTP, SSO/LDAP, Usuários e Permissões, Integração API, Alertas, Cron Jobs |

---

## Integrações

Agrupadas pelo jeito como o Z-Sec alcança o sistema de destino.

### 1. APIs na nuvem

Funcionam para qualquer cliente. As credenciais ficam na tabela `integrations` de cada banco.

| Integração | Módulos | Destino | Código |
| --- | --- | --- | --- |
| Cloudflare | WAF, DNS, Analytics, Load Balancing, RUM | `api.cloudflare.com` | `cloudflare*.ts` |
| Sophos Central | Sophos XDR, Exceções, Ranking IA, licenças | `api.central.sophos.com` | `sophos*.ts`, `ia*.ts` |
| Microsoft Purview | DLP | `manage.office.com` | `dlp*.ts` |
| Azure DevOps / App Insights | SAST | `dev.azure.com`, `api.loganalytics.io` | `sast*.ts` |
| SMTP (qualquer provedor) | Envio de todos os e-mails | Servidor SMTP configurado na tela SMTP | `mailer.server.ts` (nodemailer) |
| SendGrid | Estatísticas de e-mail (opcional) | `api.sendgrid.com` | `sendgrid*.ts` |
| Privacy Tools | LGPD | API do fornecedor | `privacy-tools*.ts` |
| ssl-checker / RDAP | Domínios e certificados | Serviços públicos | `domains.functions.ts`, `ssl*.ts` |
| Microsoft Entra ID | SSO e portal de Treinamentos | `login.microsoftonline.com` | `sso.functions.ts`, `treinamentos*.ts` |

### 2. Sistemas on-prem via Cloudflare Access

Hoje o servidor chama o sistema do cliente através de um túnel Cloudflare, usando o service token `CF_ACCESS_CLIENT_ID/SECRET`.

| Integração | Módulos | Código |
| --- | --- | --- |
| IBM QRadar | SOC | `qradar*.ts` |
| Zabbix | Disponibilidade, CMDB | `zabbix*.ts`, `disponibilidade*.ts` |
| Gophish | Simulação de Phishing | `phishing*.ts`, `gophish.server.ts` |
| Servidor de scanner | DAST, SEK | `dast*.ts`, `sek-zendesk*.ts` |

### 3. Rede interna via servidor de scanner

O servidor de [scripts/dast-provisioning/](scripts/dast-provisioning/) roda na rede do cliente e faz o que precisa de acesso interno.

| Função | Módulo |
| --- | --- |
| Resolução DNS do AD (`/resolve`) | CMDB |
| Varredura SMB/FTP/HTTP/NetBIOS | Shadow IT |
| Consulta ao AD/LDAP | DAST (descoberta de ativos) |
| Proxy `/sek-worker` (`SEK_WORKER_URL`) | SOC (chamados SEK/Zendesk) |

### 4. Push (o cliente envia)

Só conexão de saída do lado do cliente, autenticada por chave própria.

| Origem | Endpoint | Chave |
| --- | --- | --- |
| Agente das estações ([agent/](agent/)) | `/api/public/hooks/agent-ingest` | `AGENT_INGEST_KEY` |
| Pipelines do Azure DevOps | `/api/public/hooks/sast-ingest` | Chave gerada no card SAST |

### 5. Importação manual

O WSUS não tem API: os dados entram pela tela **Importação de Dados**, assim como outras planilhas.

---

## Endpoints públicos (hooks e cron)

Todos ficam em `src/routes/api/public/hooks/` e são `POST`, protegidos por `HOOK_SECRET` (header `x-hook-secret`, `apikey` ou `x-api-key`). Cada execução é registrada para a tela Cron Jobs.

| Grupo | Hooks |
| --- | --- |
| Sincronizações | `cloudflare-sync`, `sophos-sync`, `sophos-audit-sync`, `sophos-ia-sync`, `ranking-ia-sync`, `qradar-sync` (streaming com heartbeat), `qradar-sync-watchdog`, `dlp-sync`, `gophish-sync`, `privacy-tools-sync`, `sast-sync` |
| Caches | `zabbix-cache-refresh`, `cmdb-dns-cache-refresh` |
| Alertas | `domains-check`, `ssl-check`, `fornecedores-check`, `cmdb-device-alerts`, `gmud-escalate` |
| DAST / Shadow IT | `dast-callback`, `dast-schedules-run`, `dast-stale-scan-sweep`, `shadowit-callback`, `vuln-snapshot` |
| SEK / Zendesk | `sek-zendesk-sync`, `sek-zendesk-tickets-sync`, `sek-zendesk-auth-log` |

Exceções à regra do `HOOK_SECRET`:

- `qradar-sync-manual` usa o Bearer do usuário (admin ou analista).
- `sek-zendesk-session-upload` valida um JWT próprio (`SEK_RENEWAL_SECRET`).
- `agent-ingest` e `sast-ingest` usam as chaves de ingestão (ver [Integrações → Push](#4-push-o-cliente-envia)).
- `api/public/auth/azure/callback` e `api/public/treinamentos/sso/callback` (GET) são callbacks OAuth do login Microsoft.

---

## Autenticação, RBAC e sessão

- **Login:** e-mail e senha (Supabase Auth) ou SSO Microsoft Entra ID. O SSO exige que o usuário já esteja pré-cadastrado.
- **Cadastro só por convite.** O papel de um usuário novo nunca vem dos metadados que o próprio usuário envia (`raw_user_meta_data`): o gatilho `handle_new_user` só aceita `raw_app_meta_data` (gravável apenas pela service role) e, sem isso, cria como `visualizador`. O convite define o papel no servidor. Mantenha **"Allow new users to sign up" desligado** no Supabase (Authentication → Sign In / Providers).
- **Papéis** (`app_role`): `super_admin`, `admin`, `analista`, `visualizador` (padrão) e `personalizado`.
- **Permissões granulares por módulo:** view, edit, create, delete, approve, execute, manage, além de sub-ações da Cloudflare. Ficam nas tabelas `user_roles`, `module_admins` e `user_module_permissions`. O front é atualizado via Realtime.
- **Helpers de servidor** em [src/lib/authz.ts](src/lib/authz.ts): `requirePermission`, `hasPermission`, `requireAdminOrAnalista`, `requireGlobalAdminRole`.
- **Módulos exclusivos** (`benchmark`, `painel-executivo`) só liberam acesso direto para `super_admin`. A lista em [src/lib/exclusive-modules.ts](src/lib/exclusive-modules.ts) precisa ficar igual à do SQL.
- **Ações destrutivas** exigem papel global de admin, além da permissão granular, e geram log de auditoria e alerta.
- **Política de sessão:** limite absoluto de 24h e 8h de inatividade.
  - No cliente, `auth-context.tsx` verifica a sessão a cada 30s e manda heartbeat a cada 60s.
  - No servidor, `requireActiveSession` valida `profiles.session_started_at` e `last_active_at`.
- **Logs:** `auth_access_logs` registra apenas login e logout. `audit_logs` e `system_audit_log` registram ações.

---

## Banco de dados (Supabase)

- As migrations ficam em `supabase/migrations/` e cobrem schema, RLS, RPCs de RBAC (`has_role`, `has_module_permission`, `is_module_admin`...) e agendamentos `pg_cron`.
- O [supabase/config.toml](supabase/config.toml) serve só ao Supabase CLI local. O vínculo com um projeto real é feito por comando: `supabase link --project-ref <id>`.
- Os tipos gerados ficam em [src/integrations/supabase/types.ts](src/integrations/supabase/types.ts). Algumas tabelas (ex.: `sek_tickets`, `organizacao_config`) ainda não aparecem nesse arquivo e são acessadas por cast.
- **Nunca edite uma migration já criada.** Toda mudança entra como uma **nova migration incremental** (`ALTER ...`).
- **Escritas em bancos de produção são feitas manualmente** pelo responsável, nunca por script automático.

---

## Variáveis de ambiente

O modelo completo, com a explicação de cada variável, está em [.env.example](.env.example).

```bash
cp .env.example .env.local   # desenvolvimento
```

Preencha o `.env.local`. **Nunca faça commit dele.** O `.gitignore` ignora `.env`, `.env.*` e `*.local`, liberando só o `.env.example`.

| Grupo | Variáveis | Obrigatória? |
| --- | --- | --- |
| Aplicação | `APP_URL`, `VITE_APP_NAME` | `APP_URL` sim (links, convites, SSO e crons) |
| Supabase | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY` | Sim |
| Segredos internos | `INTEGRATIONS_ENCRYPTION_KEY`, `HOOK_SECRET`, `SSO_STATE_SECRET` | Sim |
| SSO Microsoft | `AZURE_CLIENT_SECRET`, `SSO_REDIRECT_URI`, `TREINAMENTOS_SSO_REDIRECT_URI` | Só com SSO; as URIs são opcionais (derivadas de `APP_URL`) |
| E-mail | `SMTP_PASSWORD` | Opcional |
| Agente | `AGENT_INGEST_KEY` | Só com o agente |
| Scanner / SEK | `CF_ACCESS_CLIENT_ID`, `CF_ACCESS_CLIENT_SECRET`, `SEK_WORKER_URL`, `SEK_RENEWAL_SECRET` | Só com DAST/SEK |

> Variáveis com prefixo `VITE_` são embutidas no bundle do navegador. **Nunca** coloque segredo em variável `VITE_`.

> `ZAP_API_KEY` e `SCANNER_API_SECRET` pertencem ao servidor de scanner (`scripts/dast-provisioning`), não a este app.

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

- `npm run build` gera a pasta `.output/`. Para rodar em produção: `node .output/server/index.mjs`, com as variáveis de ambiente carregadas (porta via `PORT`, padrão 3000).
- O [vite.config.ts](vite.config.ts) força o preset Nitro `node_server` (servidor Node standalone).
- O build precisa de **2 a 3 GB de RAM**. Em máquinas pequenas, faça o build em outro lugar e copie só a pasta `.output/`.
- **Pipeline de deploy: em definição.** O plano é um ambiente de homologação (branch `hmg`) com build automático a partir do Gitea e publicação via Cloudflare Tunnel.

---

## Fluxo de trabalho com Git

- **O Gitea é a fonte oficial** do código. O GitHub é só um **espelho de mão única** (push mirror do Gitea): o que for alterado direto no GitHub é sobrescrito no próximo sync.
- **PRs, merges e exclusão de branch: sempre no Gitea.**
- **Uma branch curta por assunto**, criada a partir da `main` atualizada: `feature/...`, `fix/...`, `redesign/...`, `chore/...`, `docs/...`.
- **A `main` é o que vai para o ar.** Não commite direto nela, exceto ajustes pequenos de documentação.
- **Merge com squash** quando os commits da branch forem só "salvando progresso", para a `main` ficar com um commit por assunto e uma mensagem clara.
- Mensagens de commit curtas, no formato `tipo: o que mudou` (ex.: `fix: filtro do SOC ignorava o período`).

Guia rápido:

```bash
git switch main && git pull               # main atualizada
git switch -c feature/nome                # branch nova
# ... altera, testa ...
git add -A && git commit -m "feature: ..."
git push -u origin feature/nome           # depois: PR no Gitea
```

---

## Convenções do código

- **Não rode `prettier --write` / `npm run format` em massa.** O repositório nunca foi formatado com o `.prettierrc` atual, então o comando reformataria todos os arquivos e sujaria o diff. Formate só os arquivos novos ou o trecho que você editou.
- **`*.server.ts`** guarda código só de servidor: service role, segredos, chamadas a APIs externas. Não use o pacote `server-only` do Next.js; o ESLint bloqueia esse import.
- **`*.functions.ts`** guarda as server functions (`createServerFn`) chamadas pelo cliente. Esses arquivos também vão para o bundle do navegador, então:
  - código que usa a service role fica num `*.server.ts`, importado **dentro** do handler (`await import("./x.server")`);
  - `process.env` é lido **dentro de funções**, nunca no topo do módulo.
- **Nada da empresa fixo no código.** Nome do produto vem de `APP_NAME` ([src/lib/brand.ts](src/lib/brand.ts)), endereço da instância de `appUrl()` ([src/lib/app-url.ts](src/lib/app-url.ts)) e dados da organização de `useOrganizacao()` / `loadOrganizacao()`.
- **Não use `throw new Response(...)` dentro de middleware de `createServerFn`.** O cliente recebe isso como um "sucesso" com dado corrompido. Lance um `Error` ou retorne o erro de forma explícita.
- **Novas regras e criações sensíveis** (ex.: regras da Cloudflare) são criadas **desativadas** e disparam alerta.
- **Imports** usam o alias `@/` para `src/`.
- **Componentes de UI novos** entram pelo shadcn: `npx shadcn@latest add <componente>`. A config está em [components.json](components.json).
- `src/routeTree.gen.ts` é gerado pelo TanStack Router ao rodar o dev server. **Não edite esse arquivo à mão.**

---

## Pendências conhecidas

- **Regra "segmento Educação"**: Painel Executivo e Maturidade comparam a organização com os segmentos cujo nome começa com "Educa". Precisa virar configuração.
- **Acesso ao DAST por nome de departamento**: `is_dast_allowed()` libera só admin de um departamento cujo nome contenha "Segurança da Informação". Precisa virar permissão de módulo.
- **Integrações on-prem dependem de Cloudflare Access** com um único service token no `.env`. A direção é o Z-Sec Collector (ver [Arquitetura](#direção-para-várias-empresas-planejado)).
- **`wrangler.jsonc` está com o conteúdo errado.** O arquivo contém uma cópia do código de `qradar-sync.ts`, não uma config do Wrangler. Não afeta o build Node.
- **Existem dois lockfiles, `package-lock.json` e `bun.lock`.** O `bun.lock` é a referência, e o `package-lock.json` pode ficar defasado.
- **ESLint:** o projeto tem ~10,7 mil avisos `prettier/prettier` (só formatação) e ~1,2 mil `no-explicit-any`. Nenhum deles quebra o build. A seção abaixo mostra como deixar o editor limpo sem reformatar o código.

---

## Ambiente de desenvolvimento (Windows + VSCode)

Passo a passo para uma máquina nova rodar o projeto sem erros no editor.

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
git clone <url-do-repositório-no-gitea> Projeto_Z-Sec
cd Projeto_Z-Sec
code .
```

> Evite pastas sincronizadas pelo OneDrive, que deixam o `node_modules` lento e podem travar arquivos.

### 3. Instalar as dependências

```powershell
bun install --frozen-lockfile
```

- Esse comando instala **todas** as bibliotecas do `package.json` exatamente nas versões do `bun.lock`. Não é preciso instalar nenhuma delas separadamente.
- **Use o Bun, não o `npm install`.** O `package-lock.json` pode estar defasado em relação ao `bun.lock`, e o npm instalaria versões mais novas do TanStack Router, que causam erro de tipo (veja [Problemas comuns](#8-problemas-comuns)). Se você rodou `npm install` por engano, desfaça com `git checkout package-lock.json`, apague o `node_modules` e rode o comando acima.
- Depois de instalar com o Bun, os scripts podem ser rodados com `npm run ...` ou `bun run ...`, tanto faz.
- A biblioteca `xlsx` é baixada de `cdn.sheetjs.com`. Se a rede bloquear esse domínio, a instalação falha. Libere o acesso ou use outra rede.
- Se aparecer erro de binário nativo (`rollup`, `lightningcss`, `@tailwindcss/oxide`), apague o `node_modules` e rode `bun install --frozen-lockfile` de novo.

### 4. Configurar as variáveis de ambiente

```powershell
copy .env.example .env.local
```

Preencha o `.env.local` conforme a seção [Variáveis de ambiente](#variáveis-de-ambiente). Sem as variáveis do Supabase, o app não consegue fazer login.

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
| Erro `APP_URL não configurado no servidor` | Falta `APP_URL` no `.env.local` |
| `npm install` falha no pacote `xlsx` | Acesso a `cdn.sheetjs.com` bloqueado pela rede |
| Porta 8080 ocupada | Libere a porta: `Get-Process -Id (Get-NetTCPConnection -LocalPort 8080).OwningProcess \| Stop-Process` |
| Acentos quebrados (`SeguranÃ§a`) | Arquivo salvo fora de UTF-8: confira `files.encoding: utf8` e o canto inferior direito do VSCode |

---

## Ambiente de desenvolvimento (macOS + VSCode)

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
cp .env.example .env.local
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
git clone <url-do-repositório-no-gitea> Projeto_Z-Sec
cd Projeto_Z-Sec
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
