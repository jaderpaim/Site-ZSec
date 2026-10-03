# Agente Z-Sec (Windows / macOS)

Coleta o uso de **apps de IA fora do navegador** (ChatGPT, Claude, Copilot,
Cursor, CLIs como Claude Code/Codex etc.) e envia para o Ranking de IA do Z-Sec.
O Sophos continua cobrindo o navegador; o agente ignora navegadores para não
contar em dobro. **Só coleta**: não bloqueia nada.

## O que é coletado (e o que não é)

| Coleta | Não coleta |
|---|---|
| Qual app de IA está em primeiro plano e por quanto tempo | Conteúdo, prompts, título de janela |
| **Volume** de bytes por processo de IA (quanto, não o quê) | Conteúdo do tráfego, URLs, destinos |
| Usuário (UPN/e-mail corporativo, usuário do SO), hostname, versão do SO | Teclas, telas |
| Apps de IA instalados (1x/dia) | Apps que não são de IA |

## Como o uso vira ranking — "minuto ativo" (foco ∪ rede)

Cada minuto é avaliado por app, com dois sinais:

| Sinal | Como | Cobre |
|---|---|---|
| **Foco** | a cada 5 s, app em primeiro plano + usuário ativo (< `idle_seconds`) | uso interativo: lendo, digitando |
| **Rede** | a cada 1 min, bytes dos processos do app ≥ limiar de entrada **e** de saída | IA gerando em 2º plano, apps simultâneos, CLIs |

- Minuto com rede ativa conta **60 s**; sem rede, conta o tempo em foco
  (foco + rede no mesmo minuto não soma 90 s, é a união).
- **Vários apps podem contar no mesmo minuto** (Claude gerando enquanto você
  está no ChatGPT conta os dois).
- O limiar exige entrada **e** saída: keepalive/telemetria de app parado
  ficam abaixo; um prompt (saída) com resposta em streaming (entrada) passa.
- CLIs (Claude Code, Codex) contam só pela rede: o próprio binário fala com a
  API. CLIs que rodam como `node`/`python` não são distinguíveis e ficaram de fora.
- Os minutos vão para baldes **(ferramenta, app, hora cheia)**. A cada 5 min,
  os baldes com pelo menos 30 s vão para `POST /api/public/hooks/agent-ingest`.
  Cada balde vira **uma linha** em `ia_web_events` (`source = 'agent'`):
  "1 hora com uso" = 1 acesso. `duration_s` é a união; `foreground_s` e
  `network_s` guardam cada sinal separado para calibrar.
- O ID é determinístico: reenvio faz upsert, sem duplicar. O que não foi
  aceito fica no spool (`spool.json` na pasta do usuário) por até 14 dias.

### Rede por sistema

| | macOS | Windows (sem admin, fase lab) |
|---|---|---|
| Fonte | `nettop -t external` (bytes de rede externa) | `GetExtendedTcpTable` (quem tem conexão externa) + `GetProcessIoCounters` |
| Precisão | bytes de rede exatos; tráfego local (Ollama) ignorado | **aproximação**: contadores de I/O incluem disco |
| Limiar padrão | in ≥ 8 KB e out ≥ 4 KB / min | in ≥ 64 KB e out ≥ 32 KB / min |

No Mac, o processo é atribuído ao app pelo caminho: tudo dentro de
`Claude.app` (inclusive o `Claude Helper`, que é quem fala com a rede) é
Claude Desktop. Próxima fase no Windows: serviço com ETW (Kernel-Network),
que dá bytes de rede exatos por processo e DNS por processo.

### Calibrar o limiar no lab

`zsec-agent watch` mostra a cada minuto, por app, `in`/`out` e se ficou
`ATIVO` ou `parado`. Roteiro sugerido por app:

1. app aberto e parado por 10 min, tem que ficar `parado`;
2. app minimizado/na bandeja por 10 min, tem que ficar `parado`;
3. uma pergunta curta e uma longa (resposta em streaming), tem que ficar `ATIVO`.

Ajuste `net_min_in_bytes` / `net_min_out_bytes` no `config.json` até separar
(1–2) de (3). Para comparar com o modelo antigo, use `"disable_network": true`.

### Usuário (jader.paim)

O ranking cruza `user_name` com a parte antes do `@` do e-mail em
`colaboradores`. O agente manda candidatos e o servidor escolhe:

1. `user_name` do config (override manual, normalmente vazio);
2. identidades do domínio `corporate_domain`: `whoami /upn` no Windows; no Mac,
   alias do usuário (AD/Platform SSO) e a conta do Office;
3. usuário do SO (`DOMINIO\jader.paim` → `jader.paim`);
4. se nada casar e o usuário do SO não tiver ponto (Mac `jaderpaim`), procura o
   colaborador cujo e-mail sem pontos seja igual (só aceita match único).

`agent_devices.user_resolved = false` mostra as máquinas cujo usuário não casou
com ninguém. Nesses casos, use o override ou corrija o cadastro.

## Build

Precisa de Go 1.22+. Sem dependências externas.

```bash
./build.sh 0.2.0
# dist/windows-amd64/zsec-agent.exe      (sem console, é o que vai instalado)
# dist/windows-amd64/zsec-agent-cli.exe  (com console, para diagnóstico)
# dist/windows-arm64/zsec-agent.exe
# dist/macos/zsec-agent                  (universal Intel + Apple Silicon)
```

## Servidor

1. Aplicar a migration `supabase/migrations/20261001120000_zsec_agent_ia_usage.sql`.
2. Gerar uma chave e configurar a env `AGENT_INGEST_KEY` no Z-Sec:
   `echo "zagent_$(openssl rand -base64 32 | tr -d '/+=')"`.
   Para rotacionar sem derrubar as máquinas: `AGENT_INGEST_KEY=nova,antiga`.
3. Subir o app (o `routeTree.gen.ts` regenera no `vite dev`/`build`).

## Instalação

Copie `config.example.json` para `config.json` e preencha `server_url`,
`ingest_key` e `corporate_domain`.

**Windows** (Admin / Intune / GPO):
```powershell
.\packaging\windows\install.ps1 -Exe .\zsec-agent.exe -Config .\config.json
```
Cria a Tarefa Agendada `ZSecAgent`, que roda no logon de qualquer usuário,
dentro da sessão dele.

**macOS** (root / MDM):
```bash
sudo ./packaging/macos/install.sh ./zsec-agent ./config.json
```
Instala um LaunchAgent em `/Library/LaunchAgents`. Não pede permissão de
Acessibilidade nem de Gravação de Tela.

## Diagnóstico

```bash
zsec-agent watch       # foco a cada 5 s + rede por app a cada minuto (calibração e itens "validar")
zsec-agent identity    # usuário/dispositivo que seriam enviados
zsec-agent inventory   # apps de IA instalados
zsec-agent send-test   # envia agora e mostra se o servidor aceitou
```
Log: `%LOCALAPPDATA%\ZSecAgent\agent.log` / `~/Library/Application Support/ZSecAgent/agent.log`.

## Antes do rollout

- **Assinatura de código**: Authenticode no Windows; Developer ID + notarização
  no Mac (o `.pkg` para MDM precisa ser assinado). Sem isso o Gatekeeper, o
  SmartScreen e o próprio Sophos podem bloquear.
- **Exclusão no Sophos Central** para o binário (o agente lista processos e
  executa `reg`/`powershell`/`lsappinfo`, o que pode gerar detecção comportamental).
- **Validar o catálogo**: entradas com `// validar` têm nome de processo ou
  bundle ID a confirmar com `zsec-agent watch` numa máquina com o app.
- **LGPD**: informar a coleta na política de uso aceitável.

## Limitações conhecidas

- Granularidade de 1 minuto: um único prompt rápido pode contar o minuto inteiro.
- No Windows o sinal de rede é aproximado (I/O inclui disco) até a fase ETW.
- IDEs com IA (Cursor, Windsurf) têm tráfego que não é de IA (marketplace,
  git), o que faz o sinal de rede ser mais ruidoso nelas.
- Copilot dentro do Office/VS Code (extensão) não é distinguível por processo.
  Fica para a fase 2 (DNS por processo via ETW no Windows).
- Proxy: o agente respeita `HTTPS_PROXY`. O proxy do sistema (WinINET/PAC) não
  é lido automaticamente.

## Próximos passos (mesmo agente)

O agente já registra cada máquina em `agent_devices`. Dá para estender com
coletores novos (inventário de hardware/software, patches pendentes via Windows
Update API, etc.) seguindo a linha do Wazuh, reaproveitando o mesmo envio,
spool e autenticação.
