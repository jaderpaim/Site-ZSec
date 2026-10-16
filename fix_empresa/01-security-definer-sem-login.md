# Funções SECURITY DEFINER executáveis sem login

**Gravidade:** 🔴 Crítica · **Explorável por:** qualquer pessoa com a chave
pública do Supabase (ela está no JavaScript do navegador, é pública por design).

## O problema
No Postgres, toda função nova nasce executável por `PUBLIC`. Funções
`SECURITY DEFINER` rodam com o poder do dono (ignoram o RLS) e, no Supabase,
ficam expostas em `/rest/v1/rpc/<função>`. Algumas do app ficaram sem `REVOKE`:

| Função | O que um anônimo consegue fazer |
|---|---|
| `schedule_hook_cron(text, text, text)` (versão de 3 argumentos, a que lê o Vault) | Criar, trocar ou apagar crons do `pg_cron`. Pior: apontar um cron para uma URL própria e **receber o `HOOK_SECRET` do Vault no cabeçalho** — com ele, dispara todos os hooks `/api/public/hooks/*` |
| `upsert_sek_tickets(jsonb)` | Inserir/alterar chamados do SEK/Zendesk |
| `get_sophos_top_users_threats(timestamptz, timestamptz)` | Ler nomes de usuários com mais ameaças no Sophos (dado pessoal — LGPD) |
| `get_ranking_ia_usuarios(...)` | Sem checagem de papel: **qualquer usuário logado** lê o ranking de uso de IA por pessoa |
| `is_dast_allowed(uuid)` | Descobrir se um id de usuário é admin (baixa) |

A versão antiga de `schedule_hook_cron` (4 argumentos) tinha o `REVOKE`; a nova
(3 argumentos, migration `..._schedule_hook_cron_vault.sql`) foi criada sem ele.

## 1. Confirmar (SQL Editor ou cliente SQL, só leitura)
```sql
SELECT p.proname AS funcao,
       pg_get_function_identity_arguments(p.oid) AS args,
       has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon,
       has_function_privilege('authenticated', p.oid, 'EXECUTE') AS logado
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('schedule_hook_cron','unschedule_hook_cron','upsert_sek_tickets',
                    'get_sophos_top_users_threats','get_ranking_ia_usuarios',
                    'is_dast_allowed','prevent_profile_column_escalation')
ORDER BY 1, 2;
```
Qualquer linha com `anon = true` é o problema. Também vale abrir no painel do
Supabase: **Advisors → Security Advisor → Warnings** ("Public Can Execute
SECURITY DEFINER Function").

Antes de corrigir, confirme no código que o app chama essas funções **só pelo
servidor** (cliente com a service role), para nada quebrar:
```bash
grep -rn "schedule_hook_cron\|upsert_sek_tickets\|get_sophos_top_users_threats\|get_ranking_ia_usuarios" src
```
Na versão analisada, todas eram chamadas via `supabaseAdmin`/service role.

## 2. Corrigir — migration nova
Crie `supabase/migrations/<timestamp>_revoga_execute_security_definer.sql`:
```sql
-- Funções SECURITY DEFINER executáveis por anon/authenticated (Security Advisor).
-- O app chama as quatro primeiras só pelo servidor (service role).

-- Só servidor
REVOKE EXECUTE ON FUNCTION public.schedule_hook_cron(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.upsert_sek_tickets(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_sophos_top_users_threats(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_ranking_ia_usuarios(timestamptz, timestamptz, text, uuid, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.schedule_hook_cron(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.upsert_sek_tickets(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_sophos_top_users_threats(timestamptz, timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_ranking_ia_usuarios(timestamptz, timestamptz, text, uuid, text, int) TO service_role;

-- Função de gatilho: o gatilho dispara sem precisar de EXECUTE do usuário.
REVOKE EXECUTE ON FUNCTION public.prevent_profile_column_escalation() FROM PUBLIC, anon, authenticated;

-- Usada dentro de políticas RLS: precisa continuar executável por quem está logado.
REVOKE EXECUTE ON FUNCTION public.is_dast_allowed(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_dast_allowed(uuid) TO authenticated, service_role;

-- search_path fixo (Security Advisor: Function Search Path Mutable).
ALTER FUNCTION public.qradar_log_sources_track_status_change() SET search_path = public;
```
**Ajustes que podem ser necessários no ambiente da empresa:**
- Se a versão antiga `schedule_hook_cron(text, text, text, text)` ainda existir
  e o app novo já estiver publicado, remova-a (`DROP FUNCTION`) — ela recebe o
  segredo como parâmetro e o grava em texto puro no comando do cron.
- Se alguma assinatura não existir, o `REVOKE` falha: confira os argumentos na
  consulta do passo 1 e ajuste.
- **Não** revogue de `authenticated` as funções usadas em políticas RLS
  (`has_role`, `has_module_permission`, `is_module_admin`,
  `is_any_module_admin`, `user_department_id`, `is_dast_allowed`): o app passa
  a tratar todo mundo como visualizador.

## 3. Validar
1. Rode de novo a consulta do passo 1: nenhuma `anon = true` nas funções acima;
   as quatro "só servidor" com `logado = false`.
2. Security Advisor → **Rerun linter**: os avisos dessas funções somem.
3. No app: tela **Cron Jobs** → desativar e ativar um job (usa
   `schedule_hook_cron` pelo servidor) → deve salvar sem erro.

## 4. Depois de corrigir
Como o `HOOK_SECRET` do Vault pode ter sido lido por quem explorou isso, faça
também a **troca do segredo** (arquivo `03-hook-secret-igual-chave-publica.md`).
Vale verificar em `cron.job` se há algum cron desconhecido:
```sql
SELECT jobid, jobname, schedule, left(command, 120) FROM cron.job ORDER BY jobname;
```
