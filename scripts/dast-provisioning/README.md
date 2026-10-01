# Provisionamento do DAST + Shadow IT (ZAP + scanner-api)

Reproduz do zero, numa VM Ubuntu 24.04 limpa, o que roda hoje em produção
(`bnlsrvvsesi`): container ZAP com volume persistente e o pack de add-ons de
marketplace, e o serviço `scanner-api` (FastAPI, systemd) — que é o **mesmo
processo** por trás de três funcionalidades do app:

- **DAST** (ZAP) — scan ativo/passivo de aplicação web.
- **Shadow IT** — descoberta de rede local (ping sweep + NetBIOS via
  `nmblookup`) e enumeração de subdomínios (Amass).
- **Descoberta de apps internos** — zonas DNS AD-integradas via LDAP
  (`adidnsdump`, dentro da venv).

Nuclei, Amass, Nmap e Nikto não rodam como serviço nem precisam de binário
instalado na VM — o `main.py` dispara `docker run --rm ...` sob demanda pra
cada um, usando as imagens já puxadas por este script.

Não são instalações separadas: rodar `install.sh` uma vez já cobre as
quatro funcionalidades, porque todas vivem no mesmo `main.py`/serviço.

## Uso

```bash
sudo bash install.sh
```

O script pede, na hora, os segredos necessários (chave do ZAP, credenciais
do Supabase, `HOOK_SECRET`, URLs de callback etc.) — nada fica gravado no
repositório. Se você deixar a chave do ZAP em branco, uma nova é gerada
automaticamente.

Ao final, o `scanner-api` sobe via `systemctl` e já aplica sozinho (no
próprio boot do FastAPI) a política de scan do ZAP: regras desabilitadas,
limite de threads por host e duração máxima de spider/Ajax Spider — não
precisa rodar nada manual pra isso.

## Renomear a pasta?

O conteúdo é o mesmo pra DAST e Shadow IT (um único backend), então não há
uma pasta separada `shadowit-provisioning/` — seria uma cópia quase idêntica
do `install.sh` (Docker, venv, systemd, certs) rodando um segundo serviço
concorrente com o primeiro, o que não faz sentido num backend só. Se um dia
DAST e Shadow IT precisarem virar processos/VMs de fato separados, aí sim
vale a pena bifurcar este script.

## O que o script NÃO faz

- Não configura firewall (a VM de referência roda com `ufw` inativo,
  expondo a API do ZAP só em `127.0.0.1`).
- Não coloca a API atrás de um reverse proxy — o `uvicorn` serve TLS
  diretamente com um certificado auto-assinado gerado na hora.
- Não reaplica automaticamente add-ons novos instalados manualmente depois
  — se alguém instalar mais um add-on pelo marketplace do ZAP, adicione o
  `id` no array `ZAP_ADDONS` deste script pra próxima vez que alguém
  precisar recriar o ambiente.

## Re-rodar depois de atualizar `main.py`

Este script serve pra provisionar um ambiente novo. Pra atualizar o código
de uma VM já provisionada, o fluxo continua sendo manual: copiar
`app/main.py` (e `normalizers.py`/`retest.py` se mudarem) para
`/opt/scanner/` e `sudo systemctl restart scanner-api`.
