# HOOK_SECRET igual à chave pública (anon) do Supabase

**Gravidade:** 🟠 Alta · **Explorável por:** qualquer visitante do site
**Faça depois de:** `01-security-definer-sem-login.md`

## O problema
Os endpoints `/api/public/hooks/*` (chamados pelos crons do `pg_cron`) são
protegidos pelo `HOOK_SECRET` (`src/lib/hook-auth.server.ts`). Pela migration
`..._revert_cron_apikey_to_hook_secret.sql`, o valor do `HOOK_SECRET` é a
**chave `anon` (JWT) do projeto Supabase** — que vai no JavaScript do navegador
e é pública por design.

Com ela, qualquer pessoa dispara as sincronizações e os alertas do app:
consumo das APIs de QRadar, Sophos, Cloudflare etc., e-mails/Teams/Telegram de
alerta em massa.

A mesma chave `anon` aparece **literal** em várias migrations antigas de cron
(`net.http_post(... 'apikey', '<JWT>' ...)`). Ela é pública, então isso por si
só não é vazamento — o problema é ela ser usada como segredo.

## 1. Confirmar (sem expor valores)
No servidor do app (ou nas configurações do App Service), compare o começo do
`HOOK_SECRET` com o da chave anon:
```bash
printf '%s' "$HOOK_SECRET" | head -c 12; echo
printf '%s' "$VITE_SUPABASE_PUBLISHABLE_KEY" | head -c 12; echo   # ou a anon key do painel
```
Se o `HOOK_SECRET` começar com `eyJ` (formato JWT) e bater com a anon key,
o problema existe.

## 2. Corrigir
**O HOOK_SECRET é usado em três lugares — os três precisam receber o valor
novo juntos**, senão crons e callbacks passam a falhar com 401:

| Onde | Para quê |
|---|---|
| Variável `HOOK_SECRET` do **app** (App Service / `.env` do servidor) | Validar quem chama `/api/public/hooks/*` |
| Segredo **`hook_secret` no Vault** do Supabase | Os crons do `pg_cron` leem dali para mandar no cabeçalho |
| `.env` do **servidor de scanner DAST** (`scripts/dast-provisioning`, variável `HOOK_SECRET`) | Autenticar e cifrar (AES-GCM, chave derivada do segredo) os callbacks do scanner para o app |

Passos:
1. Gere um segredo novo **aleatório e próprio** (nunca reaproveite outra chave):
   ```bash
   openssl rand -hex 32
   ```
2. Atualize o **Vault**: painel do Supabase → **Project Settings → Vault**
   (ou Integrations → Vault) → editar `hook_secret` → colar o valor novo.
   Prefira a tela ao SQL, para o valor não ficar em histórico de editor.
3. Atualize a variável `HOOK_SECRET` do **app** e reinicie/republique.
4. Atualize o `HOOK_SECRET` no `.env` do **servidor de scanner** e reinicie o serviço.
5. Confira se algum cron ainda tem a chave **literal** no comando (os antigos,
   de antes da migração para o Vault):
   ```sql
   SELECT jobname FROM cron.job WHERE command LIKE '%eyJ%';
   ```
   Para cada um, recrie pela tela **Cron Jobs** do app (desativar e ativar):
   a versão atual de `schedule_hook_cron` monta o comando lendo o Vault.

## 3. Validar
1. Chamar um hook **com a chave anon antiga** deve dar **401**:
   ```bash
   curl -s -o /dev/null -w '%{http_code}\n' -X POST https://<app>/api/public/hooks/domains-check \
     -H "x-hook-secret: <anon key>"
   ```
2. Tela **Cron Jobs** → "Executar agora" num job → sucesso.
3. Na próxima execução automática, confira as respostas dos crons:
   ```sql
   SELECT created, status_code, error_msg FROM net._http_response ORDER BY created DESC LIMIT 10;
   ```
   Esperado: `200`. Se vier `401`, o Vault e o app estão com valores diferentes.
4. Um scan DAST qualquer deve concluir (o callback do scanner usa o segredo novo).
