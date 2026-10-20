# Cloudflare WAF: reorganização do módulo por host

Branch: `feat/Cloudflare` · Migração: `supabase/migrations/20261019140000_cloudflare_hosts_permissions.sql`

Este documento descreve o que mudou no módulo Cloudflare WAF, o que precisa ser feito para subir e o que ainda não foi validado contra a conta real da Cloudflare.

## Resumo

O módulo deixa de ser organizado por modo (Dashboard / Analytics / Operações) e passa a ser organizado por **host** (subdomínio da zona):

- **Abas:** Hosts · Analytics · Histórico.
- **Menu "Ações":** reúne as telas de configuração da zona e as ações rápidas. A aba Operações não existe mais; todo o conteúdo dela foi para esse menu.
- **Dashboard de blocos arrastáveis:** foi removido. A aba Hosts e a aba Analytics o substituem.
- **Telas novas:** Managed rules e Load Balancing (configuração).
- **Histórico de alterações:** passa a cobrir quase todas as alterações feitas pelo módulo e também as feitas direto no painel da Cloudflare.
- **Permissões novas:** três, uma para cada funcionalidade nova.

## O que precisa ser feito para subir

1. **Aplicar a migração** `20261019140000_cloudflare_hosts_permissions.sql`:
   - Insere as ações `view_history`, `manage_managed_rules` e `manage_load_balancing` em `module_permissions`.
   - Faz o backfill dessas ações para usuários `admin` e `analista` em `user_module_permissions`.
2. **Conferir as permissões do token da Cloudflare** usado pela integração:

   | Permissão no token | Para quê | Sem ela |
   |---|---|---|
   | Account › Account Audit Logs: Read | Histórico mostrar alterações feitas no painel da Cloudflare | Histórico mostra só o que foi feito pelo Z-Sec e exibe um aviso |
   | Zone › Zone WAF: Edit | Managed rules: ligar/desligar, ação padrão, remover exceções | Tela carrega, mas salvar falha com erro da Cloudflare |
   | Account › Load Balancing: Monitors and Pools: Edit | Load Balancing: ligar/desligar origens, editar pools | Idem |
   | Zone › Load Balancers: Read | Listar os balanceadores da zona | Tela de Load Balancing mostra erro |

3. **Testar com um usuário que não seja admin**, para validar que abas, botões e itens do menu somem conforme as permissões.

## Estrutura nova do módulo

`src/components/dashboard/CloudflareReal.tsx` foi reescrito como shell do módulo. Ele continua exportando `CloudflareDashboardReal`, então `dashboards.tsx` não mudou.

- **Cabeçalho:** título + seletor de zona, busca de host, etiqueta de sincronização (`SyncActions`) e menu **Ações**.
- **Abas:**
  - **Hosts** exige `view`.
  - **Analytics** exige qualquer `view_analytics_*`.
  - **Histórico** exige `view_history`.
- **Período:** 24 h ou 3 dias, válido para Hosts e Analytics.
- **Menu Ações:** cada item segue a permissão da tela.
  - **Configurações da zona:**
    - Registros DNS (`manage_buscar_dns`);
    - Regras (`manage_rules` + `manage_rules_overview`);
    - Custom rules WAF (`manage_custom_rules`);
    - Page Rules (`manage_rules` + `manage_rules_page_rules`);
    - Managed rules (`manage_managed_rules`);
    - Load Balancing (`manage_load_balancing`);
    - Desempenho de cache (`manage_cache_performance`).
  - **Ações na zona:**
    - Limpar cache (`manage_purge_cache`);
    - Exportar DNS (`manage_buscar_dns`).
  - **Adicionar registro DNS** não fica no menu: é o botão "Adicionar registro" dentro de Registros DNS, que abre o formulário em pop-up (`manage_adicionar_dns`). Depois de criar, a lista recarrega.
- **Reaproveitamento:** as telas de configuração que já existiam em `OperationsTab.tsx` são renderizadas pelo novo `ZoneConfigPanel`, exportado do mesmo arquivo, sem reescrever os componentes internos.
- **Contextos:**
  - `SharedZoneContext` continua fornecendo a zona.
  - `CfNavContext` (novo, em `shared-zone.ts`) permite que componentes internos abram uma tela do módulo. É usado pelo "Abrir regra →" do Analytics.

## Aba Hosts

Arquivos: `cloudflare/HostsView.tsx`, `cloudflare/HostTabs.tsx`, `lib/cloudflare.hosts.functions.ts`.

### Linha do tempo da zona

- **Indicadores:** requisições, % do cache, mitigadas, erros 5xx e quantidade de hosts.
- **Gráficos:** tráfego por hora (cache × origem) e mitigadas por hora, com o maior pico destacado.
- **Fonte:** reaproveita `getCloudflareAnalytics` (permissão `view`).
- **Marcadores de alteração** (só com `view_history`): cada alteração do período aparece como um balão com as iniciais de quem fez. Clicar abre o antes/depois.

### Lista de hosts

- **`getZoneHosts({ zoneId, days })`** (permissão `view`): junta os registros DNS A/AAAA/CNAME de `cloudflare_dns_records` com métricas por `clientRequestHTTPHost` do GraphQL `httpRequestsAdaptiveGroups`.
  - **Métricas:** requisições, % do cache, mitigadas (`securityAction_in`) e 5xx (`edgeResponseStatus_geq: 500`).
  - **Erros:** é tolerante. Se a consulta de métricas falhar, a lista de hosts continua vindo do DNS, com um aviso.
- **Filtros:** Expostos (registro sem proxy), Sob ataque, Com erros e Cache baixo. As regras de classificação estão em `stateOf()` em `HostsView.tsx`.

### Painel do host

- **Cabeçalho:** registro DNS, estado e um destaque contextual (IP exposto, ataque, erros, cache baixo).
- **Ações:**

  | Ação | Permissão | Comportamento |
  |---|---|---|
  | Editar DNS | `manage_editar_dns` | Abre a tela de DNS já com a edição do registro aberta (`autoEditName`) |
  | Limpar cache | `manage_purge_cache` | Abre a tela de limpeza com o host preenchido (`initialHosts`) |
  | Regra para este host | `manage_custom_rules` | Abre o editor de Custom rule preenchido com `(http.host eq "<host>")` (`WafDraft`) |
  | Ligar proxy | `manage_editar_dns` | Confirmação que alerta quando o nome indica serviço não-HTTP (vpn, ftp, ssh, rdp, mail…), depois chama `updateDnsRecord` com `proxied: true`, `ttl: 1` |

- **Abas do painel:**
  - **Segurança** (`view_analytics_security`, também validado no servidor): `getHostSecurity` traz regras e serviços que agiram, IPs, caminhos e últimos eventos (`firewallEventsAdaptive*`, com o mesmo filtro de ruído de `cloudflare.security.functions.ts`).
  - **Regras que se aplicam:**
    - Calculado no cliente a partir de `listCustomRules`, `getRulesOverview` e `listPageRules`, cada um respeitando a própria permissão.
    - Uma regra entra quando a expressão cita o host ou não filtra hostname nenhum. Para Page Rules, quando o padrão de URL casa com o host.
    - Clicar abre a tela da regra.
  - **Cache** (`view_analytics_http`, também validado no servidor): `getHostCache` traz a divisão por `cacheStatus` e os caminhos mais pedidos que não vêm do cache. Quando um caminho passa de 10% do tráfego, aparece uma sugestão de Cache Rule.
  - **DNS e histórico:** dados do registro e as alterações daquele host.

## Aba Analytics

É o `AnalyticsTab` existente, com a zona e o período vindos do shell. Única mudança: no botão "Ver eventos de segurança relacionados", cada regra que bateu ganhou **"Abrir regra →"**, que leva para Custom rules ou Managed rules conforme o `source` do evento (`ruleScreen()` em `AnalyticsTab.tsx`).

### Analytics › Security (layout novo)

A seção Security foi redesenhada (`cloudflare/SecurityAnalyticsView.tsx`). As consultas, os filtros e as janelas flutuantes de log continuam no `AnalyticsTab`, que passa tudo por props.

- **Tráfego:**
  - Indicadores: Mitigated, Served by Cloudflare e Served by origin recortam pelo KPI; Ataques prováveis e Bots prováveis recortam por attack score e por decisão de bot.
  - Gráfico empilhado e blocos: WAF attack score, decisão de bot, fonte de detecção, browsers, sistemas operacionais, endpoints e dispositivos.
  - "Top statistics" em barras clicáveis, que viram filtro.
  - Sampled logs com coluna de Mitigação.
- **Eventos:**
  - Indicadores por ação.
  - Gráfico por ação.
  - Security actions, Security services e países.
  - "Top events by source" e listas por tipo de regra.
  - Sampled logs.
- **Comportamento:**
  - As análises de ataque e de bots, que antes eram sub-abas de "Request activity", agora carregam juntas na visão Tráfego.
  - A paginação dos logs virou "Mostrar mais".

## Aba Histórico

Arquivos: `cloudflare/HistoryView.tsx`, `cloudflare/change-utils.ts`. Servidor: `getZoneChanges` em `lib/cloudflare.hosts.functions.ts`.

- **Permissão:** `view_history`, validada no servidor via `hasPermission`. Sem ela, a resposta vem com `denied: true`.
- **Fontes:**
  1. `audit_logs` filtrado por `zone_id` (o que o módulo grava via `logCloudflareAudit`), com `source: "zsec"`.
  2. Log de auditoria da conta Cloudflare (`GET /accounts/{account_id}/audit_logs?zone.name=…`), com `source: "cloudflare"`.
     - Só entram ações com `interface != "API"`, para não duplicar o que o Z-Sec já registra.
     - O antes/depois é calculado entre `oldValueJson` e `newValueJson`.
     - Se o token não tiver permissão, `cloudflareAudit.status = "denied"` e a tela mostra um aviso.
- **Tela:** filtros por área (DNS, Regras, Cache, Load Balancing) e por período (7, 30 ou 90 dias), coluna "Origem" e painel lateral com o antes/depois.

### Ações que passaram a ser registradas em `audit_logs`

| Ação | Onde | `action` |
|---|---|---|
| Criar Redirect Rule / regra de outras categorias | `cloudflare.rules.functions.ts` (`logRuleChange` com `kind: "create"`) | `create_rule` |
| Criar Page Rule | idem | `create_rule` |
| Criar / editar / ligar-desligar Custom rule (WAF) | `cloudflare.functions.ts` (`logCustomRuleChange`). Na edição, a regra é lida antes do PATCH para montar o antes/depois e distinguir edição de liga/desliga | `create_rule` / `update_rule` / `toggle_rule` |
| Managed rules | `cloudflare.config.functions.ts` | `update_managed` |
| Load Balancing (pool/origens) | idem | `update_lb` |
| Limpar cache por URL | `cloudflare.functions.ts` (`purgeCache`, campo `details.files`) | `purge_cache` |

O tipo `action` de `logCloudflareAudit` (`cloudflare.server.ts`) foi ampliado com `create_rule`, `update_managed` e `update_lb`. A criação de regra não dispara o e-mail de alerta de regra (não existe template para isso); fica só no histórico.

## Telas novas no menu Ações

Arquivo: `cloudflare/ConfigViews.tsx`. Servidor: `lib/cloudflare.config.functions.ts`.

### Managed rules (`manage_managed_rules`)

- **`getManagedRules`:**
  - lê as regras `execute` do entrypoint `http_request_firewall_managed` da zona;
  - pega os nomes em `GET /zones/{id}/rulesets` (`kind = managed`);
  - conta as mitigações em 24 h por `rulesetId` (`firewallEventsAdaptiveGroups`, `source: "firewallManaged"`).
- **`updateManagedRule`:** liga/desliga, troca a ação padrão (`overrides.action`) e remove exceções (`overrides.rules`). Faz PATCH na regra do entrypoint preservando expressão, descrição e os demais campos de `action_parameters`.
- **Fora do escopo:** criar exceções novas por regra e implantar rulesets novos continuam no painel da Cloudflare, e a tela informa isso.

### Load Balancing (`manage_load_balancing`)

- **`getLoadBalancingConfig`:**
  - balanceadores da zona;
  - pools usadas por eles (nível de conta, `account_id` de `cloudflare_zones`);
  - saúde de cada origem, consolidada a partir de `/pools/{id}/health`: saudável só se todos os POPs reportam saudável.
- **`updateLbPool`:** liga/desliga a pool e adiciona, remove ou edita origens (nome, endereço, peso, ligada). Preserva campos da origem que a tela não edita (header, virtual network etc.).
- **Fora do escopo:** monitor de saúde, ordem dos pools e steering do balanceador continuam no painel da Cloudflare.

### Outras mudanças em telas existentes

- **Custom rules (WAF):** nova coluna **"Bateu (24h)"**, via `getCustomRuleHits` (`firewallEventsAdaptiveGroups` por `ruleId`, `source` custom).
- **Limpar cache:** novo modo **"Por URL"**, com até 30 URLs completas por chamada. O campo `files` foi adicionado em `purgeCache` e `purgeCloudflareCache`.
- **`DnsLookupInner`:** novas props `initialQuery`, `autoEditName` e `autoExport`.
- **`CreateDnsInner`:** nova prop `onCreated`, usada pelo pop-up de Registros DNS para fechar e recarregar a lista.
- **`PurgeCacheInner`:** novas props `initialHosts` e `initialPurgeAll`.
- **`RulesInner`:** nova prop `initialTab`.
- **`CustomRulesInner` / `WafCustomRuleDialog`:** nova prop `draft` (rascunho de nome + expressão).

## Permissões

| Ação | Rótulo | Onde aparece em Usuários › Permissões |
|---|---|---|
| `view_history` | Histórico de alterações | Item de primeiro nível do Cloudflare WAF |
| `manage_managed_rules` | Gerenciar — Managed rules | Dentro de "Gerenciar" |
| `manage_load_balancing` | Gerenciar — Load Balancing | Dentro de "Gerenciar" |

- **Árvore de Usuários:** `CF_PERM_TREE` em `UsersManagement.tsx` recebeu as duas ações `manage_*`.
- **Tipo `ModuleAction`:** `authz.ts` recebeu as três ações.
- **Permissões mais restritivas que antes:**
  - **Painel do host:** as abas Segurança e Cache exigem `view_analytics_security` e `view_analytics_http`, respectivamente, tanto na tela quanto no servidor. Como essa tela é nova, ninguém perde acesso que já tinha; só não a vê quem não tem acesso a Analytics.
  - **Histórico:** exige `view_history`. Antes, o histórico só existia na Central de Logs, que é restrita a admin e analista.

## Arquivos

Novos:
- `src/components/dashboard/cloudflare/HostsView.tsx`
- `src/components/dashboard/cloudflare/HostTabs.tsx`
- `src/components/dashboard/cloudflare/HistoryView.tsx`
- `src/components/dashboard/cloudflare/ConfigViews.tsx`
- `src/components/dashboard/cloudflare/change-utils.ts`
- `src/components/dashboard/cloudflare/SecurityAnalyticsView.tsx`
- `src/lib/cloudflare.hosts.functions.ts`
- `src/lib/cloudflare.config.functions.ts`
- `supabase/migrations/20261019140000_cloudflare_hosts_permissions.sql`

Alterados:
- `src/components/dashboard/CloudflareReal.tsx` (reescrito)
- `src/components/dashboard/cloudflare/OperationsTab.tsx`
- `src/components/dashboard/cloudflare/AnalyticsTab.tsx`
- `src/components/dashboard/cloudflare/shared-zone.ts`
- `src/components/dashboard/UsersManagement.tsx`
- `src/lib/authz.ts`
- `src/lib/cloudflare.functions.ts`
- `src/lib/cloudflare.rules.functions.ts`
- `src/lib/cloudflare.server.ts`

## Status da validação

- **Validado:** `tsc` sem erros, lint sem avisos novos e todos os arquivos compilando no Vite.
- **Não validado contra a conta real da Cloudflare.** Pontos para testar com atenção:
  - **Consultas GraphQL novas:** métricas por host, segurança e cache por host, acertos por custom rule e por managed ruleset. Os campos podem variar conforme o plano da zona.
  - **Log de auditoria da conta:** formato dos campos `interface`, `oldValueJson`/`newValueJson` e o filtro `zone.name`.
  - **PATCH de Managed rules e de pools:** escrita com o token atual.
  - **Interface:** o módulo não foi aberto logado depois das mudanças.

## Limitações conhecidas

- **"Regras que se aplicam" é uma leitura da expressão.** Uma regra que filtra só por caminho (sem citar hostname) aparece como "todos os hosts", mesmo que na prática não bata em todos.
- **Alterações no painel da Cloudflare por API ficam de fora do Histórico.** É o caso de Terraform e scripts, excluídos para não duplicar o que o Z-Sec já grava.
- **Exclusão de Custom rules (WAF) não entra no Histórico.** Hoje o módulo não tem exclusão de custom rule; se for criada, precisa chamar `logCustomRuleChange`.
- **Período da aba Hosts limitado a 24 h e 3 dias**, pelo limite de janela do dataset `httpRequestsAdaptiveGroups` nos planos mais comuns.
