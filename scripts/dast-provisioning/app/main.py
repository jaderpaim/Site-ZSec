import asyncio
import base64
import hashlib
import io
import ipaddress
import json
import os
import re
import socket
import time
import uuid
import defusedxml.ElementTree as ET
from contextlib import asynccontextmanager
from urllib.parse import urlparse, urlencode

import httpx
from Crypto.Cipher import AES
from httpx_ntlm import HttpNtlmAuth
from dotenv import load_dotenv
from playwright.async_api import async_playwright
from pypdf import PdfReader, PdfWriter

# load_dotenv() TEM que rodar antes de importar retest/normalizers -- o
# retest.py le ZAP_API_KEY com os.getenv() no nivel do modulo (executado na
# hora do import), entao se o .env ainda nao tiver sido carregado nesse
# momento, ZAP_KEY fica travado em None pra sempre (confirmado: log do ZAP
# mostrando "API key incorrect or not supplied" em todo /retest).
load_dotenv()

from fastapi import FastAPI, Depends, Header, HTTPException, Response, Request
from pydantic import BaseModel

from normalizers import normalize_zap, normalize_nuclei, normalize_nmap_xml
from retest import retest_zap, retest_nuclei

API_SECRET = os.getenv('SCANNER_API_SECRET')
ZAP_KEY = os.getenv('ZAP_API_KEY')
ZAP_URL = 'http://127.0.0.1:8080'

# Callback assincrono pro app (b-security) -- distinto do SCANNER_API_SECRET,
# que autentica a chamada NESTE sentido (app -> scanner).
HOOK_SECRET = os.getenv('HOOK_SECRET')
APP_CALLBACK_URL = os.getenv(
    'APP_CALLBACK_URL',
    'https://b-security.bernoulli.com.br/api/public/hooks/dast-callback',
)
# Shadow IT roda em fila/worker/callback proprios -- separado do DAST de
# proposito (motivo tecnico: enriquecimento SMB/FTP/HTTP/NetBIOS numa subnet
# inteira nao pode competir por tempo com a fila serial de scan de
# vulnerabilidade), mas no mesmo processo FastAPI, sem duplicar
# auth/sanitizacao/padrao de callback.
SHADOWIT_CALLBACK_URL = os.getenv(
    'SHADOWIT_CALLBACK_URL',
    'https://b-security.bernoulli.com.br/api/public/hooks/shadowit-callback',
)
# Fallback pra teste manual (curl/shell direto, sem passar pelo app) -- o
# caminho normal e' a credencial vir por request em ShadowItScanRequest
# (app le de Integracoes, decifra AES-256-GCM, manda por HTTPS, nao fica
# salva aqui). Confirmado em teste manual que sessao anonima esta
# corretamente bloqueada nessa rede (smbmap e `smbclient -N`/`-U '%'` ambos
# recusados com ACCESS_DENIED) -- sem credencial (nem por request nem aqui),
# run_smb_shares() so retorna vazio.
SHADOWIT_SMB_USER = os.getenv('SHADOWIT_SMB_USER')  # formato DOMINIO\usuario
SHADOWIT_SMB_PASS = os.getenv('SHADOWIT_SMB_PASS')

# Diretorios de dados (caminhos absolutos -- ver discussao sobre $HOME)
BASE_DATA = '/root/scanner-data'
NUCLEI_TEMPLATES_CONFIG = f'{BASE_DATA}/nuclei-config'
NUCLEI_TEMPLATES_DIR = f'{BASE_DATA}/nuclei-templates'
NUCLEI_OUTPUT_DIR = f'{BASE_DATA}/nuclei-output'
AMASS_OUTPUT_DIR = f'{BASE_DATA}/amass-output'
NMAP_OUTPUT_DIR = f'{BASE_DATA}/nmap-output'
NIKTO_OUTPUT_DIR = f'{BASE_DATA}/nikto-output'

TMP = '/opt/scanner/tmp'

# Rate limiting -- mesmo espirito das recomendacoes de seguranca ja discutidas
ZAP_DELAY_MS = 200          # delay entre requisicoes do ZAP
NUCLEI_RATE_LIMIT = 50      # requisicoes/segundo do Nuclei
NMAP_TIMING = '-T2'         # timing gentil do Nmap (nunca T4/T5)
NMAP_PORTS = '21,22,25,80,443,3306,3389,5432,6379,8080,8443,9200,27017'
NIKTO_PAUSE = '0.2'         # segundos entre requisicoes do Nikto (~6700 assinaturas por padrao)

# adidnsdump foi instalado via pip DENTRO do venv (nao e pacote de sistema
# como smbclient/nmblookup) -- o processo do scanner-api roda usando o
# python do venv diretamente (ExecStart aponta pro binario dele), mas isso
# nao poe <venv>/bin no PATH pra spawn de subprocesso por nome (confirmado:
# FileNotFoundError chamando so 'adidnsdump', resolvido com caminho absoluto).
ADIDNSDUMP_BIN = os.getenv('ADIDNSDUMP_BIN', '/opt/scanner/venv/bin/adidnsdump')

# "Nível" do scan (basic/intermediate/advanced) -- antes era so decoracao no
# app, nao chegava a afetar nada aqui. Cada engine reage do jeito que faz
# sentido pra ele; Nmap fica de fora de proposito (ja e a config mais segura
# possivel, sem --script, por causa do SIGSEGV documentado em run_nmap()).
NUCLEI_SEVERITY_ALL = 'critical,high,medium,low,info'
NUCLEI_SEVERITY_BASIC = 'info,low,medium'       # pula templates de exploracao ativa (critical/high)
NUCLEI_RATE_LIMIT_ADVANCED = 100
NIKTO_TUNING_BASIC = 'x0689'                    # exclui upload(0)/DoS(6)/exec(8)/SQLi(9), mantem o resto
NIKTO_PAUSE_ADVANCED = '0.1'

# Fila serial: 1 scan por vez, preservando a decisao de custo/RAM ja tomada
# (ZAP compartilhado + t3.large nao aguentam scans concorrentes).
scan_queue: "asyncio.Queue[dict]" = asyncio.Queue()

# Fila separada do Shadow IT -- ver SHADOWIT_CALLBACK_URL acima. Mesmo
# raciocinio de isolamento do scan_queue, mas sem compartilhar fila com ele.
shadowit_queue: "asyncio.Queue[dict]" = asyncio.Queue()

# Cancelamento de scan -- antes disso, "Cancelar" no app so mudava o status
# no Supabase; o ZAP continuava rodando o job inteiro sozinho, orfao (mesmo
# problema de recurso desperdicado que ja corrigimos pra trava/erro, so que
# aqui por acao manual do usuario). Fila e' serial (scan_queue, 1 job por
# vez) -- so precisa rastrear o job ATUAL, nao um registro por scan_id.
# CANCELLED_SCANS e' checado nos pontos de espera do ZAP (poll loops, entre
# alvos); current_job_procs guarda os subprocessos Docker (nuclei/nmap/
# nikto/amass) do job atual pra matar na hora em vez de esperar o timeout
# de cada um (ate 30min no nikto) so pra perceber que foi cancelado.
#
# Cada item e' {'proc': Process, 'container_name': str | None} -- NAO basta
# guardar so' o Process. Confirmado em teste real: 'docker run --rm ...'
# (sem -d) roda em PRIMEIRO PLANO -- o Process que rastreamos e' so' o
# CLIENTE `docker run`, esperando o container terminar. proc.kill() manda
# SIGKILL nesse cliente, que morre na hora, mas o DAEMON do Docker continua
# rodando o container por tras, orfao -- SIGKILL nao pode ser repassado/
# interceptado pelo cliente pra avisar nada (confirmado: container Nuclei
# sobreviveu 5+ minutos depois do cliente ja ter sido morto e contado como
# "processo morto"). Só mata de verdade com 'docker kill <nome>' contra o
# container -- por isso cada 'docker run' abaixo agora leva '--name'
# explicito, pra ter um handle confiavel pra matar depois (ver docker_kill).
# container_name fica None pro adidnsdump (run_ad_ldap_discovery), que nao
# e' containerizado -- proc.kill() sozinho ja basta nesse caso.
CANCELLED_SCANS: set[str] = set()
current_job_scan_id: str | None = None
current_job_procs: list[dict] = []


async def docker_kill(container_name: str) -> None:
    """Mata o container Docker DE VERDADE -- ver comentario em
    current_job_procs acima sobre por que so' matar o cliente 'docker run'
    (proc.kill()) nao e' suficiente. Best-effort: falha aqui (container ja
    tinha terminado sozinho, por exemplo) so' loga, nunca derruba o
    cancelamento/timeout que chamou isso."""
    try:
        proc = await asyncio.create_subprocess_exec(
            'docker', 'kill', container_name,
            stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
        await proc.wait()
    except Exception as e:
        print(f'[docker] falha ao matar container {container_name} (best-effort): '
              f'{type(e).__name__}: {e}', flush=True)


class ScanCancelled(Exception):
    """Levantado quando run_zap() percebe que o job foi cancelado no meio --
    tratado como interrupcao deliberada, nao como falha (nunca vira
    dast_scans.error nem dispara callback de 'done')."""


class ZapPartialResultError(RuntimeError):
    """Levantado no lugar de RuntimeError puro em toda desistencia de
    run_zap() (travamento/conexao perdida durante spider, ajaxSpider ou
    active scan) -- carrega os achados JA ENCONTRADOS ate aquele ponto
    (findings/out_of_scope_hosts), em vez de descartar tudo.

    Bug real confirmado em producao (2026-09-28): run_scan_job() trata
    QUALQUER excecao de run_zap() (isinstance(r, Exception)) so' logando o
    erro e fazendo `continue` -- nunca chegava a extrair achado nenhum.
    Ou seja todo alvo que travava perdia SILENCIOSAMENTE tudo que o ZAP ja
    tinha achado ate ali: passive scan (rodando a sessao toda), regras de
    active scan ja completadas, e ate os alertas parciais da PROPRIA regra
    que travou (confirmado: SQLInjectionScanRule contra admissao.bernoulli.
    com.br gerou 9 alertas antes de ser interrompida por stall-detection --
    esses 9 nunca chegavam no Supabase). Corrigido carregando o que der
    pra buscar (best-effort, nunca falha por si so') antes de desistir."""
    def __init__(self, message: str, findings: list | None = None,
                 out_of_scope_hosts: list | None = None):
        super().__init__(message)
        self.findings = findings or []
        self.out_of_scope_hosts = out_of_scope_hosts or []


# Regex global de exclusao do Spider classico -- arquivo de midia estatico
# (imagem/video/audio/fonte/binario) sem query string custa caro pro
# passive scan (confirmado em teste real: ate 539s numa unica pagina/regra,
# so' porque o blob binario e' grande -- Tech Detection Passive Scanner,
# que normalmente roda em milissegundos) e quase nunca carrega
# vulnerabilidade de verdade (conteudo binario opaco, sem logica de
# servidor). O '$' no final ancora a regex no FIM da URL -- URL com query
# string (ex.: "/imagem.php?id=123" ou "/media.mp4?file=../../etc/passwd")
# nunca bate aqui, mesmo "parecendo" midia pela extensao, entao continua
# sendo rastreada/atacada normalmente (e' onde injecao de verdade pode
# morar, mesmo atras de uma extensao de midia). css/js ficam de FORA de
# proposito -- tem valor real de passive scan (Source Code Disclosure,
# segredo hardcoded etc.), diferente de blob binario opaco.
# So cobre o Spider classico -- Ajax Spider (browser real) pode ainda
# carregar essas midias durante o render de uma pagina sem respeitar essa
# lista (nao confirmado contra ZAP real ainda, observar no proximo scan).
ZAP_STATIC_ASSET_EXCLUDE_REGEX = (
    r'(?i)\.(jpe?g|png|gif|webp|svg|ico|bmp|tiff?'
    r'|mp4|webm|mov|avi|mkv|flv'
    r'|mp3|wav|ogg|m4a'
    r'|woff2?|ttf|eot|otf'
    r'|pdf|zip|rar|7z|tar|gz)$'
)

# Regex global de exclusao (Spider classico + proxy, ver configure_zap_global_excludes)
# -- HOSTS conhecidos de
# analytics/tracking/CDN publica de terceiro, nao extensao de arquivo (esse
# problema e' o mesmo da exclusao de midia acima, so' que em .js/.css --
# confirmado em teste real: script do Google Tag Manager, Facebook Pixel,
# Hotjar etc. levando 50-130s cada na regra Tech Detection so' por serem
# minificados e grandes -- 400-600KB cada). Sao bibliotecas de terceiro
# hospedadas fora do dominio do alvo -- nunca vao carregar vulnerabilidade
# especifica DA aplicacao escaneada, so' custam tempo/CPU. Escopado por
# HOST especifico (nao dominio genérico tipo cloudfront.net/amazonaws.com,
# que tambem hospedam conteudo real de cliente -- excluir isso seria
# arriscado demais, poderia esconder achado de verdade). JS/CSS do PROPRIO
# alvo continuam 100% no escopo (essa regex so' bate em host de terceiro).
ZAP_THIRD_PARTY_TRACKING_EXCLUDE_REGEX = (
    r'(?i)^https?://([^/]*\.)?'
    r'(googletagmanager\.com'
    r'|google-analytics\.com'
    r'|analytics\.google\.com'
    r'|connect\.facebook\.net'
    r'|static\.hotjar\.com'
    r'|script\.hotjar\.com'
    r'|static\.ads-twitter\.com'
    r'|cdnjs\.cloudflare\.com'
    r'|tracking\.apprubeus\.com\.br)'
    r'(/.*)?$'
)


async def configure_zap_global_excludes() -> None:
    """Chamado uma vez no startup (lifespan) -- exclui midia estatica +
    hosts de tracking de terceiro globalmente, pro daemon inteiro (nao e'
    opcao por-scan no ZAP). Best-effort: falha aqui nao derruba o boot do
    FastAPI, so' loga -- o ZAP pode ainda nao estar de pe no exato momento
    em que esse container sobe.

    Duas exclusoes DIFERENTES sao necessarias, nao uma so':
    - `spider/action/excludeFromScan` vale so' pro Spider CLASSICO (parser
      de HTML/links, nao executa JS nem baixa midia de verdade).
    - `core/action/excludeFromProxy` vale pro PROXY do ZAP -- e' essa que o
      Ajax Spider (Crawljax + Firefox headless real) respeita, porque todo
      trafego do navegador passa pelo proxy do ZAP. Sem isso, o Ajax Spider
      ainda tentava renderizar/baixar midia e tracker de terceiro de
      verdade -- confirmado em producao (2026-09-22): um banner de video de
      18MB (`Banner-topo-VSE-Desktop.mp4`) estourou o teto de 16MB que o
      ZAP guarda no historico (DatabaseException) E deixou o Crawljax sem
      DOM valido pra inspecionar (document.documentElement null, virou
      WebDriverException/NullPointerException em cascata nos logs) --
      ruido puro, scan nao caiu, mas a pagina virou lixo no historico."""
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            for regex in (ZAP_STATIC_ASSET_EXCLUDE_REGEX, ZAP_THIRD_PARTY_TRACKING_EXCLUDE_REGEX):
                await c.get(f'{ZAP_URL}/JSON/spider/action/excludeFromScan/', params={
                    'apikey': ZAP_KEY, 'regex': regex,
                })
                await c.get(f'{ZAP_URL}/JSON/core/action/excludeFromProxy/', params={
                    'apikey': ZAP_KEY, 'regex': regex,
                })
        print('[zap] exclusao global de midia estatica + tracking de terceiro '
              'configurada no Spider classico e no proxy (cobre o Ajax Spider)', flush=True)
    except Exception as e:
        print(f'[zap] falha ao configurar exclusao global (seguindo mesmo assim): '
              f'{type(e).__name__}: {e}', flush=True)


# excludeFromScan/excludeFromProxy (acima) NAO impedem o Ajax Spider (Crawljax
# + Firefox headless real) de baixar midia binaria pesada -- confirmado em
# producao (2026-09-28): video de 116MB baixado 7+ vezes por
# www.bernoulli.com.br mesmo com a exclusao generica ja ativa, afogando
# CPU/banda da JVM compartilhada e travando o active scan em 0% por 20min+
# (ver [[project_dast_zap_container_rebuild_2026-09-24]]). Unico mecanismo
# que bloqueia de verdade (impede a requisicao de sair pro alvo real): um
# script do tipo 'proxy' do ZAP. Arquivo .js precisa existir no volume
# persistente (/opt/zap-home/scripts/, ver install.sh) ANTES desta chamada
# -- so' carrega/ativa aqui, nao escreve o arquivo.
ZAP_MEDIA_BLOCKER_SCRIPT_NAME = 'Block heavy media (proxy)'
ZAP_MEDIA_BLOCKER_SCRIPT_PATH = '/home/zap/.ZAP/scripts/zap_block_heavy_media.js'


async def configure_zap_proxy_media_blocker() -> None:
    """Chamado uma vez no startup (lifespan), best-effort. Remove+recarrega
    sempre (idempotente) em vez de checar se ja existe -- mais simples e
    cobre o caso do arquivo .js ter mudado de conteudo entre deploys.

    GOTCHA achado testando ao vivo contra o ZAP real: o script de tipo
    'proxy' PRECISA retornar 'true' de proxyRequest() mesmo quando ja setou
    a resposta customizada (msg.setResponseHeader/setResponseBody) pra
    bloquear o encaminhamento. Retornar 'false' (que e' o que o proprio
    exemplo comentado no template padrao do ZAP sugere, e' a interpretacao
    mais intuitiva do texto "returns false to drop the message") faz o ZAP
    simplesmente FECHAR a conexao sem mandar nada -- confirmado via curl
    manual: "empty reply from server" tanto em HTTP puro quanto HTTPS,
    dominio real ou inexistente (descartou hipotese de ser coisa do tunel
    CONNECT/MITM). So' funcionou com return true: a resposta ja setada no
    msg e' o que importa, o retorno da funcao e' sobre outra coisa (deixar
    outros listeners rodarem, nao sobre encaminhar ou nao pro alvo)."""
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            await c.get(f'{ZAP_URL}/JSON/script/action/remove/', params={
                'apikey': ZAP_KEY, 'scriptName': ZAP_MEDIA_BLOCKER_SCRIPT_NAME,
            })
            await c.get(f'{ZAP_URL}/JSON/script/action/load/', params={
                'apikey': ZAP_KEY,
                'scriptName': ZAP_MEDIA_BLOCKER_SCRIPT_NAME,
                'scriptType': 'proxy',
                'scriptEngine': 'ECMAScript : Graal.js',
                'fileName': ZAP_MEDIA_BLOCKER_SCRIPT_PATH,
            })
            await c.get(f'{ZAP_URL}/JSON/script/action/enable/', params={
                'apikey': ZAP_KEY, 'scriptName': ZAP_MEDIA_BLOCKER_SCRIPT_NAME,
            })
        print('[zap] script de bloqueio de midia pesada (proxy) carregado e ativado', flush=True)
    except Exception as e:
        print(f'[zap] falha ao carregar script de bloqueio de midia (seguindo mesmo assim): '
              f'{type(e).__name__}: {e}', flush=True)


# DomXssScanRule (Cross Site Scripting DOM Based, id 40026) depende do add-on
# `client` (Client Side Integration) pra abrir navegador real e instrumentar
# JS -- em producao (2026-09-22/23) essa configuracao de extensao no
# navegador falha sistematicamente (`RedirectScript - Failed to configure ZAP
# extension on browser launch`), confirmado mesmo apos instalar Chromium no
# container (que roda headless perfeitamente sozinho, ver teste manual) --
# ou seja nao e' biblioteca de sistema faltando, e' o add-on client/domxss
# em si que nao configura a extensao nesse setup.
#
# O problema NAO e' so' "essa regra nao encontra nada" (falha limpa seria
# aceitavel) -- e' que ela pode TRAVAR a thread inteira do active scan
# (HostProcess roda os scanners um de cada vez, sequencial, na mesma
# thread). Confirmado com 2 alvos DIFERENTES do mesmo job bulk travando no
# EXATO MESMO 24% de progresso, cada um consumindo 45-70min ate o
# ZAP_STALL_TIMEOUT_S (1200s de INATIVIDADE, nao timeout fixo) disparar e
# abandonar o alvo:
#   rematricula.bernoulli.com.br: travado em 24%, 02:21:54 -> 03:31:17
#   admissao.bernoulli.com.br:    travado em 24%, 03:36:20 -> 04:46:44
# O 24% identico nos dois e' o ponto da politica de scan onde o
# DomXssScanRule comeca -- quando ele nao falha rapido, trava ali e nunca
# devolve controle pro HostProcess. Um terceiro alvo (fluig) teve o
# DomXssScanRule completando em 1188s -- quase batendo no teto de 1200s,
# ou seja mesmo "funcionando" ele e' lento/instavel demais pra confiar.
# Desabilitado de proposito: outras tecnicas de XSS (refletido/persistente,
# ids 40012/40014/40016/40017) continuam cobrindo normalmente, so perdemos
# a deteccao especifica de DOM XSS via instrumentacao de navegador.
ZAP_DISABLED_ASCAN_RULE_IDS = ['40026']  # Cross Site Scripting (DOM Based)

# Teto de duracao do Spider por alvo, em MINUTOS (0 = ilimitado, era o
# default do classico -- confirmado ser o motivo de um alvo sozinho poder
# crawlear sem freio nenhum). Motivado por incidente real (2026-09-24):
# www.bernoulli.com.br sozinho, numa sessao HSQLDB recem-zerada, estourou
# o teto de cache do banco (`Data cache size limit is reached: 32000`,
# ver ZAP_PSCAN_IDLE_TIMEOUT_S/newSession-por-alvo abaixo) em menos de 2
# minutos de crawl -- ou seja nao e' so' "acumulo entre varios alvos de um
# job bulk", um unico site grande/pesado (WordPress com muita midia) ja
# gera historico suficiente sozinho. Sem chave de config pra aumentar
# aquele teto do HSQLDB (nao exposta em lugar nenhum, confirmado via
# config.xml e pesquisa), e sem jeito confirmado de impedir o Ajax Spider
# (navegador real) de baixar midia referenciada no DOM mesmo com exclusao
# configurada (Replacer nao bloqueia antes do fetch; pass-through so'
# exclui por dominio inteiro, nao por extensao no MESMO dominio do alvo)
# -- a mitigacao real e' limitar quanto historico QUALQUER alvo sozinho
# pode gerar antes de ser cortado, nao tentar aumentar o teto do banco
# indefinidamente. 20min e' generoso o bastante pra a maioria dos alvos
# terminar naturalmente antes do corte.
ZAP_SPIDER_MAX_DURATION_MIN = 20
ZAP_AJAX_SPIDER_MAX_DURATION_MIN = 15  # default do ZAP e' 60min, generoso demais pro nosso caso

# Threads simultaneas do active scan POR HOST -- default do ZAP e' 16
# (confirmado ao vivo, bate com os 14-16 'ZAP-ActiveScanner-N' vistos nos
# logs). Motivado por achado real (2026-09-24): o SQLInjectionScanRule
# (sqliplugin, deteccao por TEMPO) reclamava de 'considerable lagging'
# com desvio padrao de 2700-3100ms na amostra de linha de base -- ruido
# de rede grande demais pra confiar em detectar um delay injetado
# pequeno/sutil com seguranca. Parte desse jitter e' autoinfligido: 16
# threads batendo o MESMO host ao mesmo tempo gera concorrencia de rede
# que o proprio ZAP mede como ruido. Baixar pra 6 reduz esse ruido de
# base, tornando deteccao por tempo mais confiavel -- ao custo de active
# scan mais lento. So' afeta active scan (intermediate/advanced); basic
# nao roda active scan, fica de fora sozinho.
ZAP_ASCAN_THREADS_PER_HOST = 6


async def configure_zap_active_scan_policy() -> None:
    """Chamado uma vez no startup (lifespan) -- ajustes de POLITICA/OPCAO do
    ZAP (nao dado de sessao, sobrevivem a core/action/newSession -- ver
    zap_wait_pscan_idle/run_scan_job), globalmente pro daemon (nao e'
    opcao por-scan). Best-effort, mesmo padrao de
    configure_zap_global_excludes."""
    try:
        async with httpx.AsyncClient(timeout=30) as c:
            await c.get(f'{ZAP_URL}/JSON/ascan/action/disableScanners/', params={
                'apikey': ZAP_KEY, 'ids': ','.join(ZAP_DISABLED_ASCAN_RULE_IDS),
            })
            await c.get(f'{ZAP_URL}/JSON/spider/action/setOptionMaxDuration/', params={
                'apikey': ZAP_KEY, 'Integer': str(ZAP_SPIDER_MAX_DURATION_MIN),
            })
            await c.get(f'{ZAP_URL}/JSON/ajaxSpider/action/setOptionMaxDuration/', params={
                'apikey': ZAP_KEY, 'Integer': str(ZAP_AJAX_SPIDER_MAX_DURATION_MIN),
            })
            await c.get(f'{ZAP_URL}/JSON/ascan/action/setOptionThreadPerHost/', params={
                'apikey': ZAP_KEY, 'Integer': str(ZAP_ASCAN_THREADS_PER_HOST),
            })
        print(f'[zap] scan rules desabilitadas globalmente: {ZAP_DISABLED_ASCAN_RULE_IDS} '
              '(DomXssScanRule -- trava o active scan inteiro nesse ambiente, ver comentario); '
              f'spider maxDuration={ZAP_SPIDER_MAX_DURATION_MIN}min, '
              f'ajaxSpider maxDuration={ZAP_AJAX_SPIDER_MAX_DURATION_MIN}min '
              '(evita alvo sozinho estourar o teto de cache do HSQLDB); '
              f'ascan threadPerHost={ZAP_ASCAN_THREADS_PER_HOST} '
              '(reduz jitter de rede pra deteccao SQLi por tempo ser mais confiavel)',
              flush=True)
    except Exception as e:
        print(f'[zap] falha ao configurar politica de scan (seguindo mesmo assim): '
              f'{type(e).__name__}: {e}', flush=True)


# Teto de espera pro passive scan esvaziar antes de comecar carga nova no
# ZAP -- ver zap_wait_pscan_idle. Mais curto que ZAP_STALL_TIMEOUT_S (essa
# espera e' por limpeza de fundo, nao por progresso ativo de scan).
ZAP_PSCAN_IDLE_TIMEOUT_S = 300


async def zap_wait_pscan_idle(client: httpx.AsyncClient, timeout_s: float = ZAP_PSCAN_IDLE_TIMEOUT_S) -> None:
    """Espera a fila de passive scan do ZAP esvaziar antes de comecar carga
    nova (spider/active scan de um alvo novo, ou um job novo saindo da
    fila). A fila serial do app (scan_queue/run_scan_job) so garante que
    NOSSO orquestrador espera um alvo terminar antes do proximo comecar --
    mas o passive scan do ZAP roda numa thread pool propria, independente
    do nosso loop. Confirmado em teste real: backlog de passive scan de um
    alvo anterior (55mil requisicoes acumuladas, algumas regras levando
    ate 539s numa unica pagina) disputando CPU/thread com o active scan de
    um alvo novo ao mesmo tempo -- suspeita forte de ter sido a causa real
    de um active scan travar sem erro de conexao antes (o "jitter" que o
    SQLInjectionScanRule reclamava provavelmente era o proprio ZAP
    sobrecarregado, nao o alvo real sendo lento). Teto de tempo -- desiste
    e segue mesmo assim se o backlog nao esvaziar a tempo, pra nao travar
    a fila inteira por causa de um backlog patologico."""
    start = time.monotonic()
    while time.monotonic() - start < timeout_s:
        try:
            r = await client.get(f'{ZAP_URL}/JSON/pscan/view/recordsToScan/', params={'apikey': ZAP_KEY})
            remaining = int(r.json().get('recordsToScan', 0))
        except Exception as e:
            print(f'[zap] falha ao checar recordsToScan (seguindo mesmo assim): '
                  f'{type(e).__name__}: {e}', flush=True)
            return
        if remaining == 0:
            return
        print(f'[zap] aguardando passive scan esvaziar antes de prosseguir '
              f'({remaining} registro(s) restante(s))...', flush=True)
        await asyncio.sleep(10)
    print(f'[zap] passive scan nao esvaziou em {timeout_s}s -- seguindo mesmo assim', flush=True)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await configure_zap_global_excludes()
    await configure_zap_proxy_media_blocker()
    await configure_zap_active_scan_policy()
    worker_task = asyncio.create_task(scan_worker())
    shadowit_worker_task = asyncio.create_task(shadowit_worker())
    yield
    worker_task.cancel()
    shadowit_worker_task.cancel()


app = FastAPI(lifespan=lifespan)


def verify_key(x_api_key: str = Header(...)):
    if x_api_key != API_SECRET:
        raise HTTPException(status_code=401)


class ScanRequest(BaseModel):
    scan_id: str
    mode: str = 'url'
    engines: list[str] = ['nuclei', 'zap']
    # Chegava do app mas nao era lido em lugar nenhum -- basic/intermediate/
    # advanced se comportavam 100% igual. Agora afeta zap/nuclei/nikto (ver
    # constantes NUCLEI_SEVERITY_*/NIKTO_TUNING_*/NIKTO_PAUSE_ADVANCED acima).
    level: str = 'intermediate'
    passive: bool = True
    subnet: str | None = None  # usado só quando mode == 'network_discovery'
    # app real (startDastScan) manda so "targets" -- url/domain existem so
    # por compatibilidade com chamadas manuais/scripts de teste antigos.
    targets: list[str] = []
    url: str | None = None
    domain: str | None = None
    # Usados só quando mode == 'internal_apps' -- credencial decifrada pelo
    # app na hora (Integracoes -> dast_ad_ldap, AES-256-GCM), mandada por
    # request, nao fica salva na VM.
    ad_username: str | None = None
    ad_password: str | None = None
    ad_dc_host: str | None = None
    # Scan autenticado (ZAP Browser-Based Authentication) -- credencial
    # decifrada pelo app na hora (dast_auth_credentials, AES-256-GCM),
    # mandada por request, nao fica salva na VM. Presente so quando o app
    # achou uma credencial cadastrada pro dominio do alvo (ver
    # get_dast_auth_credential/startDastScan do lado do app).
    auth_username: str | None = None
    auth_password: str | None = None
    auth_login_url: str | None = None
    auth_logged_in_indicator: str | None = None


def is_private_subnet(subnet: str) -> bool:
    """Só permite RFC1918 -- modo de descoberta é pra LAN interna (shadow IT),
    nunca pra faixas públicas."""
    try:
        net = ipaddress.ip_network(subnet, strict=False)
    except ValueError:
        return False
    return net.is_private and not net.is_loopback and not net.is_link_local


class RetestRequest(BaseModel):
    matched_url: str
    param: str | None = None
    http_method: str = 'GET'
    engine: str
    template_id: str | None = None
    # raw_output.pluginId do achado original (so' faz sentido pra engine
    # 'zap') -- escopa o retest pra so' rodar aquela regra especifica, ver
    # _ensure_retest_scoped_policy em retest.py.
    plugin_id: str | None = None


class ResolveRequest(BaseModel):
    ip: str


class ShadowItScanRequest(BaseModel):
    scan_id: str
    # lista de IPs (normalmente os hosts que o proprio ping sweep -- disparado
    # daqui ou do DAST -- ja catalogou em shadowit_hosts).
    targets: list[str] = []
    # Credencial de dominio decifrada pelo app na hora (Integracoes ->
    # shadowit_smb, AES-256-GCM) e mandada por request -- nao fica salva na
    # VM. Se omitido, cai pro fallback SHADOWIT_SMB_USER/PASS do .env (so pra
    # teste manual, ver run_smb_shares).
    smb_user: str | None = None
    smb_pass: str | None = None


class ShadowItDiscoveryRequest(BaseModel):
    scan_id: str
    subnet: str


@app.get('/health')
async def health():
    return {'ok': True}


@app.post('/scan')
async def start_scan(req: ScanRequest, _=Depends(verify_key)):
    # ACK imediato -- o scan de verdade roda no worker, resultado volta
    # via callback pro dast-callback. Sem isso, scans reais (4-40min)
    # estouram o timeout do lado do app.
    await scan_queue.put(req.model_dump())
    return {'status': 'queued', 'scan_id': req.scan_id}


class CancelScanRequest(BaseModel):
    scan_id: str


@app.post('/scan/cancel')
async def cancel_scan(req: CancelScanRequest, _=Depends(verify_key)):
    """Marca scan_id como cancelado (CANCELLED_SCANS) -- run_zap() checa isso
    nos poll loops e para de verdade (ver ScanCancelled). Se for o job
    ATUAL (fila e' serial, so' um roda ZAP por vez), tambem mata na hora
    qualquer subprocesso Docker em voo (nuclei/nmap/nikto/amass) em vez de
    esperar o timeout de cada um. Se for um job ainda na fila (nao
    comecou), CANCELLED_SCANS ja basta -- run_scan_job checa isso antes de
    iniciar e nem chega a disparar nada."""
    CANCELLED_SCANS.add(req.scan_id)
    killed = 0
    if req.scan_id == current_job_scan_id:
        for entry in current_job_procs:
            try:
                entry['proc'].kill()
                killed += 1
                # Colhe o processo explicitamente depois do kill -- sem isso
                # o child watcher do asyncio deveria reaproveitar sozinho,
                # mas nao da' pra confiar cegamente nisso sob carga (varios
                # subprocessos concorrentes, child watcher sobrecarregado).
                # Investigando 814 zumbis acumulados na VM (2026-09-24) --
                # esse era o unico lugar do codigo que fazia kill() sem
                # wait() logo em seguida.
                try:
                    await asyncio.wait_for(entry['proc'].wait(), timeout=10)
                except asyncio.TimeoutError:
                    print(f'[job {req.scan_id}] proc nao morreu em 10s apos kill() '
                          f'(seguindo mesmo assim)', flush=True)
            except ProcessLookupError:
                pass
            # Mata o container Docker de verdade tambem -- proc.kill() so'
            # mata o cliente 'docker run' local (ver comentario em
            # current_job_procs). Sem isso o container sobrevive orfao
            # mesmo com o "processo morto" contado acima.
            if entry.get('container_name'):
                await docker_kill(entry['container_name'])
    print(f'[job {req.scan_id}] cancelamento solicitado pelo app -- '
          f'{"job atual, " + str(killed) + " processo(s) morto(s)" if req.scan_id == current_job_scan_id else "na fila ou ja terminado"}',
          flush=True)
    return {'status': 'cancel_requested', 'scan_id': req.scan_id}


@app.post('/retest')
async def retest(req: RetestRequest, _=Depends(verify_key)):
    try:
        if req.engine == 'zap':
            return await retest_zap(req.matched_url, req.param, req.http_method, req.plugin_id)
        return await retest_nuclei(req.matched_url, req.template_id)
    except Exception as e:
        # Antes disso qualquer excecao (ex.: KeyError do ZAP recusando o
        # ascan) virava 500 cru "Internal Server Error" sem contexto nenhum
        # -- o front so' conseguia mostrar isso, sem pista de causa. 502
        # (falha do upstream/ZAP, nao do proprio scanner-api) com a mensagem
        # real no detail.
        print(f'[retest] falhou pra {req.engine} {req.http_method} {req.matched_url}: '
              f'{type(e).__name__}: {e}', flush=True)
        raise HTTPException(status_code=502, detail=f'{type(e).__name__}: {e}')


async def resolve_one_ip(ip: str) -> dict:
    """Nucleo da resolucao reversa (PTR), reusado por /resolve e /resolve-batch.
    Distingue 'sem PTR' (NXDOMAIN limpo, socket.herror) de 'timeout' (DNS nao
    respondeu) -- o app do lado de ca trata os dois como 'sem dado, nao
    alertar', mas a distincao ajuda a diagnosticar DNS fora do ar vs. host
    sem PTR mesmo. Assume IP ja validado pelo chamador."""
    hostname = None
    resolved = False
    reason = None
    try:
        hostname, _, _ = await asyncio.wait_for(
            asyncio.to_thread(socket.gethostbyaddr, ip), timeout=5
        )
        resolved = True
    except socket.herror:
        reason = 'no_ptr'
    except (asyncio.TimeoutError, socket.gaierror, OSError):
        reason = 'timeout'
    return {'ip': ip, 'hostname': hostname, 'resolved': resolved, 'reason': reason}


@app.post('/resolve')
async def resolve_hostname(req: ResolveRequest, _=Depends(verify_key)):
    """DNS reverso (PTR) pro CMDB cruzar hostname x IP com o Zabbix -- ver
    resolve_one_ip. Uso pontual (1 IP); pra lote, ver /resolve-batch."""
    try:
        ipaddress.ip_address(req.ip)
    except ValueError:
        raise HTTPException(status_code=400, detail='IP inválido')
    return await resolve_one_ip(req.ip)


# Concorrencia interna do /resolve-batch -- mesmo numero que o app ja usava
# pro mapLimit(5) do lado de la antes dessa mudanca, so' que agora quem
# limita a rajada e' o proprio scanner (o app manda a lista inteira de uma
# vez em vez de 1 POST por IP).
RESOLVE_BATCH_CONCURRENCY = 10


class ResolveBatchRequest(BaseModel):
    ips: list[str]


@app.post('/resolve-batch')
async def resolve_hostnames_batch(req: ResolveBatchRequest, _=Depends(verify_key)):
    """Mesma resolucao PTR do /resolve, pra uma lista inteira numa unica
    chamada -- criado pra substituir o padrao antigo (1 POST /resolve por IP
    do refresh do cache DNS do CMDB, a cada 15min via cron) que gerava 1
    linha de access log do uvicorn por IP no journalctl, so' ruido (nao e'
    log nosso, e' o access log automatico do uvicorn pra cada request HTTP).
    IP invalido na lista nao derruba o lote inteiro -- so' volta marcado
    'invalid_ip' nesse item, resto processa normal."""
    sem = asyncio.Semaphore(RESOLVE_BATCH_CONCURRENCY)

    async def bounded(ip: str) -> dict:
        s = (ip or '').strip()
        try:
            ipaddress.ip_address(s)
        except ValueError:
            return {'ip': ip, 'hostname': None, 'resolved': False, 'reason': 'invalid_ip'}
        async with sem:
            return await resolve_one_ip(s)

    results = await asyncio.gather(*(bounded(ip) for ip in req.ips))
    return {'results': results}


# Dois documentos separados (nao 1 so) -- ver comentario no topo de
# dast-report.ts do app: a capa nao leva cabecalho/rodape repetido (ja tem a
# propria marca embutida, maior), o corpo leva. display_header_footer do
# Playwright e' tudo-ou-nada por render, entao cada um vira um PDF proprio
# aqui embaixo e os dois sao fundidos no final (pypdf).
class PdfReportRequest(BaseModel):
    cover_html: str
    body_html: str


# Cabecalho/rodape repetidos de verdade em toda pagina do PDF -- via
# Page.printToPDF (CDP) atraves do Playwright, nao CSS de impressao de
# navegador. O app tentou 3 variantes so' com CSS (band por topico, running
# header via position:fixed + @page margin, contador via @page margin box) e
# todas quebraram de um jeito ou de outro (duplicado na capa, sumindo nas
# paginas internas, artefato visual) -- limitacao real de confiar so' no
# motor de impressao do navegador pra isso. Aqui e' o motor de PDF de
# verdade (CDP) repetindo -- volta o cabecalho com a marca (icone + nome),
# igual o "band" que existia na propria pagina antes, so' que agora
# confiavel de verdade em toda pagina. Sem Google Fonts (contexto restrito
# do header/footer template do Chromium, nao carrega webfont de forma
# confiavel) -- SVG inline pro icone funciona normal (nao e' recurso
# externo), fonte fica no fallback do sistema.
PDF_HEADER_TEMPLATE = '''
  <div style="width:100%; box-sizing:border-box; padding:8px 14mm; margin:0;
              display:flex; align-items:center; justify-content:space-between;
              background:#0f1420; font-family:Arial,Helvetica,sans-serif;">
    <div style="display:flex; align-items:center; gap:8px;">
      <div style="width:18px; height:18px; border-radius:5px; background:rgba(59,130,246,.18);
                  border:1px solid rgba(59,130,246,.35); display:flex; align-items:center;
                  justify-content:center; flex-shrink:0;">
        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#3b82f6"
             stroke-width="2.5" stroke-linecap="round">
          <circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="3"/>
        </svg>
      </div>
      <div style="display:flex; flex-direction:column; line-height:1.25;">
        <span style="font-size:10px; font-weight:700; color:#ffffff; letter-spacing:.02em;">B-SECURITY</span>
        <span style="font-size:6.5px; color:#8b96ab; letter-spacing:.08em; text-transform:uppercase;">DAST Security Scanner</span>
      </div>
    </div>
    <span style="font-size:8px; color:#a9b6cc; font-family:'Courier New',monospace;">Relatorio DAST</span>
  </div>
'''
PDF_FOOTER_TEMPLATE = '''
  <div style="font-size:8px; width:100%; box-sizing:border-box; text-align:center;
              padding:4px 14mm 0; border-top:1px solid #e2e5ea;
              font-family:'Courier New',monospace; color:#8891a0;">
    Pagina <span class="pageNumber"></span> de <span class="totalPages"></span>
  </div>
'''


@app.post('/report/pdf')
async def render_pdf_report(req: PdfReportRequest, _=Depends(verify_key)):
    """Renderiza o relatorio DAST em PDF de verdade via Chromium headless --
    capa e corpo em passadas separadas (ver PdfReportRequest acima) na MESMA
    aba, depois funde os dois PDFs (pypdf) numa unica saida. print_background
    preserva as cores (mesmo motivo do print-color-adjust:exact que a versao
    anterior via CSS precisava). wait_until='networkidle' da' tempo do
    Google Fonts do proprio HTML carregar antes do print (esses SIM carregam
    normal, e' so' o header/footer template que roda num contexto restrito
    a parte, por isso usa fallback de fonte de sistema)."""
    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch()
            try:
                page = await browser.new_page()

                await page.set_content(req.cover_html, wait_until='networkidle')
                cover_pdf = await page.pdf(
                    format='A4',
                    print_background=True,
                    # '0' sem unidade nao e' reconhecido pelo Playwright como
                    # zero de verdade -- cai no padrao do Chromium (~1cm por
                    # lado), exatamente a margem clara sobrando ao redor da
                    # capa escura que apareceu no teste. '0px' explicito.
                    margin={'top': '0px', 'bottom': '0px', 'left': '0px', 'right': '0px'},
                )

                await page.set_content(req.body_html, wait_until='networkidle')
                body_pdf = await page.pdf(
                    format='A4',
                    print_background=True,
                    display_header_footer=True,
                    header_template=PDF_HEADER_TEMPLATE,
                    footer_template=PDF_FOOTER_TEMPLATE,
                    margin={'top': '22mm', 'bottom': '16mm', 'left': '14mm', 'right': '14mm'},
                )
            finally:
                await browser.close()

        writer = PdfWriter()
        for part in (cover_pdf, body_pdf):
            reader = PdfReader(io.BytesIO(part))
            for pdf_page in reader.pages:
                writer.add_page(pdf_page)
        out = io.BytesIO()
        writer.write(out)
        pdf_bytes = out.getvalue()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f'Falha ao gerar PDF: {type(e).__name__}: {e}')
    return Response(content=pdf_bytes, media_type='application/pdf')


@app.post('/shadowit/scan')
async def start_shadowit_scan(req: ShadowItScanRequest, _=Depends(verify_key)):
    # Mesmo padrao de ACK imediato do /scan -- a varredura de verdade roda
    # no shadowit_worker, resultado volta via SHADOWIT_CALLBACK_URL.
    await shadowit_queue.put({**req.model_dump(), 'kind': 'enrich'})
    return {'status': 'queued', 'scan_id': req.scan_id}


@app.post('/shadowit/discover')
async def start_shadowit_discovery(req: ShadowItDiscoveryRequest, _=Depends(verify_key)):
    # Descoberta de rede disparada PELO Shadow IT -- fila, callback e tabela
    # de status proprios (shadowit_scans), nunca toca dast_scans/dast-callback.
    # Reaproveita run_network_discovery() (mesmo ping sweep que o DAST usa),
    # so nao passa pelo scan_queue/run_scan_job do lado DAST.
    if not is_private_subnet(req.subnet):
        raise HTTPException(status_code=400, detail='Subnet inválida ou não privada')
    await shadowit_queue.put({'kind': 'discover', 'scan_id': req.scan_id, 'subnet': req.subnet})
    return {'status': 'queued', 'scan_id': req.scan_id}


# Proxy reverso pro worker Node/Playwright do SEK/Zendesk (container separado,
# so' em 127.0.0.1:8090). Sem Depends(verify_key) de proposito -- a ideia e'
# nao expor o SCANNER_API_SECRET (mais poderoso, protege /scan etc.) pra
# maquina/servico que fala com o worker do SEK; quem autoriza a chamada e' o
# Cloudflare Access (Service Token dedicado) na frente do tunel, nao essa
# chave. Ver handoff_sek_zendesk_b-security (Onda 0).
WORKER_BASE_URL = 'http://127.0.0.1:8090'


@app.api_route('/sek-worker/{path:path}', methods=['GET', 'POST'])
async def proxy_sek_worker(path: str, request: Request):
    async with httpx.AsyncClient() as client:
        headers = dict(request.headers)
        headers.pop('host', None)
        body = await request.body()
        resp = await client.request(
            request.method,
            f'{WORKER_BASE_URL}/{path}',
            headers=headers,
            content=body,
            params=request.query_params,
            timeout=30.0,
        )
    return Response(content=resp.content, status_code=resp.status_code, headers=dict(resp.headers))


# adidnsdump colore os marcadores [-]/[+]/[!] com codigos ANSI mesmo com
# stdout em pipe (nao e' um tty) -- confirmado via repr() em producao:
# '\x1b[94m[-]\x1b[0m Found 48 domain DNS zones:'. Sem remover isso, o
# regex de cabeçalho abaixo nunca bate (a linha na verdade comeca com
# '\x1b', nao com '['), entao a coleta de zonas nunca comeca -- sempre
# "0 zona(s) total" mesmo com a saida cheia de nomes de zona.
ANSI_ESCAPE_RE = re.compile(r'\x1b\[[0-9;]*m')

# Cada linha indentada logo apos "[-] Found N ... DNS zones" e' um nome de
# zona -- cobre as 3 secoes que o adidnsdump imprime (domain/forest/legacy)
# com o mesmo parser, ja que todas seguem esse cabecalho.
ADIDNSDUMP_ZONE_HEADER_RE = re.compile(r'^\[-\] Found \d+ .* DNS zones', re.IGNORECASE)


def parse_adidnsdump_zones(stdout: str) -> list[str]:
    zones: list[str] = []
    collecting = False
    for line in stdout.splitlines():
        if ADIDNSDUMP_ZONE_HEADER_RE.match(line):
            collecting = True
            continue
        if collecting:
            stripped = line.strip()
            # Fim da secao: linha em branco ou outro cabecalho "[-] ...".
            # Nao depende do caractere de indentacao (espaco vs tab) --
            # so importa se sobrou conteudo depois de tirar outro cabecalho.
            if not stripped or stripped.startswith('['):
                collecting = False
            else:
                zones.append(stripped)
    return zones


def is_candidate_app_zone(name: str) -> bool:
    """Descarta zona reversa e zona de servico do AD -- o resto normalmente
    E' o FQDN de uma aplicacao interna (confirmado: gophish/n8n/zabbixserver
    etc. aparecem cada um como zona propria). Zona-base do dominio (tipo
    bernoulli.local) passa no filtro de proposito -- e' o usuario que decide
    no passo de revisao se quer incluir ou nao."""
    n = name.lower().strip('.')
    if n.endswith('in-addr.arpa') or n.endswith('ip6.arpa'):
        return False
    if n in ('rootdnsservers',):
        return False
    if n.startswith('_') or n.startswith('.') or not n:
        return False
    return True


async def run_ad_ldap_discovery(username: str, password: str, dc_host: str) -> list[str]:
    """Lista zonas DNS AD-integradas via LDAP (adidnsdump) -- nesse ambiente,
    cada zona normalmente E' o FQDN de uma aplicacao interna (confirmado
    manualmente: gophish.bernoulli.com.br, n8n.bernoulli.com.br etc. aparecem
    cada um como zona propria, nao como registro dentro de uma zona
    compartilhada). So' lista -- quem grava em dast_recon_subdomains e' a
    etapa de confirmacao do lado do app (usuario revisa e escolhe antes).
    Levanta RuntimeError em qualquer falha -- run_scan_job trata como
    'error' igual aos outros engines (asyncio.gather + return_exceptions
    ja cobre isso pros demais, aqui e' chamado direto sem gather)."""
    cmd = [ADIDNSDUMP_BIN, '-u', username, '-p', password, '--print-zones', '--forest', dc_host]
    print(f'[ad-ldap-discover] consultando zonas via {dc_host}...', flush=True)
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
        # container_name=None -- adidnsdump nao e' containerizado, proc.kill()
        # sozinho ja basta (ver /scan/cancel).
        current_job_procs.append({'proc': proc, 'container_name': None})
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=60)
    except asyncio.TimeoutError:
        proc.kill()
        raise RuntimeError('adidnsdump não respondeu em 60s')
    except FileNotFoundError:
        raise RuntimeError('adidnsdump não instalado na VM (pip install adidnsdump)')

    text = ANSI_ESCAPE_RE.sub('', out.decode('utf-8', errors='replace'))
    if 'Bind OK' not in text:
        # Autenticacao/conexao falhou -- log completo pro operador conseguir
        # ver o motivo real (credencial errada, host errado, etc.) em vez de
        # um "0 encontrados" silencioso e confuso.
        raise RuntimeError(f'Falha ao conectar/autenticar: {text[-500:].strip()}')

    zones = parse_adidnsdump_zones(text)
    fqdns = sorted({z for z in zones if is_candidate_app_zone(z)})
    print(f'[ad-ldap-discover] {len(zones)} zona(s) total, {len(fqdns)} candidata(s) a aplicação', flush=True)
    return fqdns


def _callback_encryption_key() -> bytes:
    if not HOOK_SECRET:
        raise RuntimeError('HOOK_SECRET nao configurado -- necessario pra cifrar o callback')
    return hashlib.sha256(HOOK_SECRET.encode('utf-8')).digest()


def encrypt_finding(finding: dict) -> str:
    """Cifra (AES-256-GCM) um achado antes de mandar no callback -- troca o
    base64 antigo, que o WAF (Managed Ruleset da Cloudflare) decodifica
    automaticamente antes de casar assinatura (confirmado em producao: achado
    real de XSS reportado pelo ZAP/Nuclei disparava a regra "XSS, HTML
    Injection - Script Tag" mesmo em base64, callback final -> 403, scan preso
    em "running" pra sempre). Cifra de verdade nao tem transformacao conhecida
    pro WAF reverter -- a saida e' ruido, sem assinatura pra casar mesmo apos
    qualquer normalizacao automatica. Chave deriva de HOOK_SECRET (SHA-256) --
    ja compartilhado entre scanner e app pra autenticar o callback, sem
    segredo novo pra gerenciar. Mesmo formato "iv:tag:ciphertext" (base64 cada
    parte) que decryptCallbackPayload espera do lado do app
    (src/lib/crypto.server.ts)."""
    key = _callback_encryption_key()
    iv = os.urandom(12)  # tamanho recomendado do IV pra GCM
    cipher = AES.new(key, AES.MODE_GCM, nonce=iv)
    plaintext = json.dumps(finding, default=str).encode('utf-8')
    ciphertext, tag = cipher.encrypt_and_digest(plaintext)
    return ':'.join(
        base64.b64encode(part).decode('ascii') for part in (iv, tag, ciphertext)
    )


async def send_callback(
    scan_id: str,
    status: str,
    progress: int | None = None,
    findings: list | None = None,
    subdomains: list | None = None,
    shadow_hosts: list | None = None,
    candidate_fqdns: list | None = None,
    auth_status: str | None = None,
    error: str | None = None,
    out_of_scope_hosts: list | None = None,
) -> None:
    body: dict = {'scan_id': scan_id, 'status': status}
    if progress is not None:
        body['progress'] = progress
    if error is not None:
        # Resumo de falhas de engine (trava/erro de conexao ignorado ate
        # agora pelo asyncio.gather(return_exceptions=True) em
        # run_scan_job) -- sem isso, um scan que travou no meio (ex.:
        # active scan interrompido pela stall-detection por causa de
        # bloqueio externo tipo rate-limit de Cloudflare Worker) terminava
        # "done" identico a um scan 100% completo, sem sinal nenhum pro
        # usuario de que faltou pedaco. Mesma coluna dast_scans.error que
        # o callback ja usa pra falha de insert no banco -- so populada
        # aqui tambem quando o motivo e' falha de engine.
        body['error'] = error
    if auth_status is not None:
        # 'authenticated' ou 'failed' -- so' presente quando o job tinha
        # credencial configurada pro dominio (ver zap_setup_auth/
        # run_scan_job). Sem isso, autenticacao que falha silenciosamente
        # (best-effort, cai pra scan anonimo) fica indistinguivel de scan
        # autenticado com sucesso do lado do app -- os dois terminam "done"
        # igual, sem sinal nenhum de qual dos dois realmente aconteceu.
        body['auth_status'] = auth_status
    if findings:
        # Achados de scan ativo carregam payload de ataque real (ex.: Nuclei
        # testando WAF com "<script>alert(1)</script>", ou o dump cru da
        # pagina de bloqueio do Cloudflare) -- mandar isso legivel (ou so' em
        # base64, que o WAF decodifica sozinho) pro dominio protegido pela
        # Cloudflare faz o Managed Ruleset barrar a propria chamada de
        # callback. Em vez de descartar o payload (o usuario quer manter pra
        # reproducao/analise, igual scanners comerciais guardam PoC), cada
        # achado vai cifrado de verdade (ver encrypt_finding acima) -- o app
        # decifra antes de gravar, dado 100% intacto, e o WAF nunca ve nada
        # que se pareca com uma assinatura conhecida.
        body['findings_enc'] = [encrypt_finding(f) for f in findings]
    if subdomains:
        body['subdomains'] = subdomains
    if shadow_hosts:
        # Hosts que o ping sweep achou sem hostname resolvido -- nao sao
        # candidato a scan de aplicacao (ver run_network_discovery/run_scan_job),
        # o app grava em shadowit_hosts em vez de dast_recon_subdomains.
        body['shadow_hosts'] = shadow_hosts
    if candidate_fqdns is not None:
        # Zonas achadas via LDAP (ver run_ad_ldap_discovery) -- ainda NAO sao
        # Ativo Descoberto, so candidatas. App guarda em dast_scans.config
        # pra usuario revisar/escolher antes de confirmar (nao em
        # dast_recon_subdomains direto, diferente de subdomains/shadow_hosts
        # acima).
        body['candidate_fqdns'] = candidate_fqdns
    if out_of_scope_hosts:
        # Hosts de terceiro (analytics/tracking/CDN) que o spider encontrou
        # mas nao seguiu -- ver extract_out_of_scope_hosts/main.py. So'
        # informativo (reconhecimento, nao vulnerabilidade) -- o app grava
        # numa tabela propria (dast_scan_out_of_scope_hosts), nunca em
        # dast_vulnerabilities.
        body['out_of_scope_hosts'] = out_of_scope_hosts

    print(f'[callback] >>> preparando POST pra {APP_CALLBACK_URL} (scan={scan_id}, status={status}, HOOK_SECRET_definido={HOOK_SECRET is not None})', flush=True)
    try:
        # 90s de margem -- callback com muitos findings pode levar mais que
        # os 30s originais pro app terminar de inserir tudo (confirmado:
        # ReadTimeout num payload de 24695 achados antes do agrupamento).
        async with httpx.AsyncClient(timeout=90) as c:
            resp = await c.post(
                APP_CALLBACK_URL, json=body,
                headers={'x-hook-secret': HOOK_SECRET or ''},
            )
            print(f'[callback] <<< resposta {resp.status_code} pra scan={scan_id}: {resp.text[:200]}', flush=True)
    except Exception as e:
        print(f'[callback] EXCECAO ao chamar callback pra scan {scan_id}: {type(e).__name__}: {e}', flush=True)


SECRET_JOB_KEYS = {'ad_password', 'smb_pass', 'password', 'secret', 'token', 'api_key'}


def redact_job(job: dict) -> dict:
    """Mascara valores de campos sensiveis antes de logar -- confirmado via
    journalctl que 'ad_password' ia em texto plano pro log do systemd
    (persistido em disco, legivel por qualquer processo/usuario com acesso
    ao journal). Mascara por nome de campo (nao so ad_password) pra cobrir
    qualquer segredo futuro adicionado ao ScanRequest sem precisar lembrar
    de atualizar este log toda vez."""
    return {k: ('***' if k in SECRET_JOB_KEYS and v else v) for k, v in job.items()}


async def scan_worker() -> None:
    print('[worker] scan_worker iniciado, aguardando jobs...', flush=True)
    while True:
        job = await scan_queue.get()
        print(f'[worker] job retirado da fila: {redact_job(job)}', flush=True)
        try:
            if 'zap' in (job.get('engines') or []):
                # Garante que o backlog de passive scan do job ANTERIOR nao
                # vaze pro job novo (ver zap_wait_pscan_idle) -- fila serial
                # so garantia isso no nivel do orquestrador, nao do daemon.
                async with httpx.AsyncClient(timeout=30) as c:
                    await zap_wait_pscan_idle(c)
            await run_scan_job(job)
            print(f'[worker] run_scan_job concluido pra scan {job.get("scan_id")}', flush=True)
        except Exception as e:
            print(f'[worker] EXCECAO no scan {job.get("scan_id")}: {type(e).__name__}: {e}', flush=True)
            await send_callback(job['scan_id'], 'error')
        finally:
            scan_queue.task_done()


async def send_shadowit_callback(
    scan_id: str,
    status: str,
    progress: int | None = None,
    findings: list | None = None,
    shadow_hosts: list | None = None,
) -> None:
    """Espelha send_callback() -- mesmo formato de body (findings_b64,
    mesma justificativa de ofuscar payload pro WAF nao interferir), mas
    postando pra SHADOWIT_CALLBACK_URL em vez de APP_CALLBACK_URL. Nunca toca
    dast_scans/dast-callback -- separacao total entre os dois pipelines,
    mesmo os dois falando com o mesmo scanner por baixo."""
    body: dict = {'scan_id': scan_id, 'status': status}
    if progress is not None:
        body['progress'] = progress
    if findings:
        body['findings_b64'] = [
            base64.b64encode(json.dumps(f, default=str).encode('utf-8')).decode('ascii')
            for f in findings
        ]
    if shadow_hosts:
        body['shadow_hosts'] = shadow_hosts
    try:
        async with httpx.AsyncClient(timeout=90) as c:
            resp = await c.post(
                SHADOWIT_CALLBACK_URL, json=body,
                headers={'x-hook-secret': HOOK_SECRET or ''},
            )
            print(f'[shadowit callback] <<< {resp.status_code} pra scan={scan_id}: {resp.text[:200]}', flush=True)
    except Exception as e:
        print(f'[shadowit callback] EXCECAO scan={scan_id}: {type(e).__name__}: {e}', flush=True)


async def shadowit_worker() -> None:
    print('[shadowit worker] iniciado, aguardando jobs...', flush=True)
    while True:
        job = await shadowit_queue.get()
        try:
            if job.get('kind') == 'discover':
                await run_shadowit_discovery_job(job)
            else:
                await run_shadowit_scan_job(job)
        except Exception as e:
            print(f'[shadowit worker] EXCECAO no scan {job.get("scan_id")}: {type(e).__name__}: {e}', flush=True)
            await send_shadowit_callback(job['scan_id'], 'error')
        finally:
            shadowit_queue.task_done()


async def run_shadowit_discovery_job(req: dict) -> None:
    scan_id = req['scan_id']
    subnet = req['subnet']
    print(f'[shadowit-discover {scan_id}] ping sweep em {subnet}...', flush=True)
    await send_shadowit_callback(scan_id, 'running', progress=10)
    hosts = await run_network_discovery(subnet)
    shadow_hosts = [{'ip': h['ip'], 'hostname': h.get('hostname'), 'source': h['source']} for h in hosts]
    print(f'[shadowit-discover {scan_id}] {len(hosts)} dispositivo(s) encontrado(s)', flush=True)
    await send_shadowit_callback(scan_id, 'done', progress=100, shadow_hosts=shadow_hosts)


# Nomes de compartilhamento administrativo padrao do Windows (existem em
# qualquer host com SMB, nao sao achado de shadow IT) e os dois nomes que só
# existem em domain controller (SYSVOL/NETLOGON sao sempre leitura anonima
# por design do AD, nao é misconfiguration).
SMB_ADMIN_SHARES = {'admin$', 'ipc$', 'c$', 'print$'}
SMB_DC_SHARES = {'sysvol', 'netlogon'}


def classify_share(share_name: str, permission: str) -> str | None:
    n = (share_name or '').strip().lower()
    if n in SMB_ADMIN_SHARES:
        return None
    if n in SMB_DC_SHARES:
        return 'esperado'
    p = (permission or '').lower()
    if 'write' in p:
        return 'critico'
    if 'read' in p:
        return 'revisar'
    return None  # NO ACCESS -- sessao anonima nao entrou, nao é achado


async def run_ftp_banner(ip: str) -> str | None:
    """Le a linha de banner que o FTP manda assim que conecta -- socket
    puro, sem client FTP nenhum."""
    try:
        reader, writer = await asyncio.wait_for(asyncio.open_connection(ip, 21), timeout=5)
    except (OSError, asyncio.TimeoutError):
        return None
    try:
        line = await asyncio.wait_for(reader.readline(), timeout=5)
        return line.decode('utf-8', errors='replace').strip() or None
    except (OSError, asyncio.TimeoutError):
        return None
    finally:
        writer.close()
        try:
            await writer.wait_closed()
        except OSError:
            pass


TITLE_RE = re.compile(r'<title[^>]*>(.*?)</title>', re.IGNORECASE | re.DOTALL)


async def run_http_title(
    ip: str, port: int, scheme: str, smb_user: str | None = None, smb_pass: str | None = None
) -> dict | None:
    """GET na raiz + extrai <title> -- mesmo dado que o Advanced IP Scanner
    mostra, sem precisar de headless browser nem de script NSE do Nmap.
    Retorna None só se a porta nao respondeu -- se respondeu mas a pagina
    nao tem <title> (API, redirect, pagina em branco...), ainda reporta a
    porta aberta (title=None), em vez de descartar o achado inteiro
    (confirmado: host com nginx real ficava sem nenhum achado de HTTP).

    1a tentativa e' sempre anonima. Se vier 401, o IIS normalmente exige
    Windows Integrated Authentication (NTLM/Negotiate) -- nesse caso o
    <title> seria so o da pagina de erro generica do IIS ("401 -
    Unauthorized: Access is denied due to invalid credentials."), nunca o
    titulo real do site (confirmado comparando com o Advanced IP Scanner,
    que roda numa maquina Windows do dominio e completa esse handshake via
    SSO sem o usuario perceber). Com a mesma credencial de dominio ja usada
    pro SMB (ver run_smb_shares/smb_user,smb_pass), tenta de novo via NTLM
    -- se a 2a tentativa vier 200, o titulo real substitui o da pagina de
    erro. Falha no NTLM (Basic/Kerberos-only, credencial invalida etc.) so'
    mantem a resposta 401 original, sem derrubar o achado."""
    # Mesmo fallback pro .env que run_smb_shares ja faz -- so' pra uso
    # manual/teste quando a chamada nao manda credencial por request.
    user = smb_user or SHADOWIT_SMB_USER
    password = smb_pass or SHADOWIT_SMB_PASS
    url = f'{scheme}://{ip}:{port}/'
    try:
        async with httpx.AsyncClient(timeout=6, verify=False, follow_redirects=True) as c:
            r = await c.get(url)
            if r.status_code == 401 and user and password:
                try:
                    r = await c.get(url, auth=HttpNtlmAuth(user, password))
                except Exception:
                    pass
    except (httpx.HTTPError, OSError):
        return None
    m = TITLE_RE.search(r.text or '')
    title = re.sub(r'\s+', ' ', m.group(1)).strip()[:200] if m else None
    return {'title': title or None, 'status_code': r.status_code, 'url': url}


# Drive-raiz administrativo (C$/D$/E$/F$...) -- existe em qualquer host com
# SMB, nao e achado. Diferente de algo tipo USUARIOS$, que tambem termina em
# $ mas e um compartilhamento de negocio de verdade (confirmado em teste
# real -- ver classify_share).
SMB_DRIVE_ROOT_SHARE = re.compile(r'^[a-z]\$$')

SMB_PROBE_FILENAME = '.shadowit_probe'
_smb_probe_file_path: str | None = None


def _get_smb_probe_file() -> str:
    """Arquivo local minusculo reusado em todo teste de escrita (put) --
    criado uma vez, sob demanda."""
    global _smb_probe_file_path
    if _smb_probe_file_path is None:
        os.makedirs(TMP, exist_ok=True)
        path = os.path.join(TMP, 'shadowit_probe_src.txt')
        with open(path, 'w') as f:
            f.write('shadowit probe\n')
        _smb_probe_file_path = path
    return _smb_probe_file_path


async def _smb_run(cmd: list[str], timeout: float) -> str:
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=timeout)
        return out.decode('utf-8', errors='replace')
    except (asyncio.TimeoutError, FileNotFoundError, OSError):
        return ''


async def _probe_smb_permission(ip: str, share: str, auth: str) -> str | None:
    """`smbclient -L` só diz que o share existe, não o nível de acesso --
    testa de verdade: ls confirma leitura, put+del confirma escrita.
    Retorna None se nem leitura funcionar (NO ACCESS -- não é achado)."""
    read_out = await _smb_run(
        ['smbclient', f'//{ip}/{share}', '-U', auth, '-c', 'ls'], timeout=10)
    if not read_out or 'NT_STATUS_ACCESS_DENIED' in read_out or 'NT_STATUS_LOGON_FAILURE' in read_out:
        return None
    write_out = await _smb_run(
        ['smbclient', f'//{ip}/{share}', '-U', auth, '-c',
         f'put {_get_smb_probe_file()} {SMB_PROBE_FILENAME}; del {SMB_PROBE_FILENAME}'],
        timeout=10,
    )
    if 'NT_STATUS_ACCESS_DENIED' in write_out:
        return 'READ ONLY'
    return 'READ, WRITE'


async def run_smb_shares(ip: str, smb_user: str | None = None, smb_pass: str | None = None) -> list[dict]:
    """Compartilhamentos + permissao real via credencial de dominio --
    normalmente vem por request (decifrada pelo app na hora, ver
    ShadowItScanRequest); cai pro fallback SHADOWIT_SMB_USER/PASS do .env só
    quando a chamada nao manda credencial (uso manual/teste). Sessao anonima
    confirmada bloqueada nessa rede (smbmap e smbclient -N/-U '%' ambos
    recusados). smbclient -L -g lista os compartilhamentos existentes;
    leitura/escrita é testada de verdade por share (ver
    _probe_smb_permission), já que -L não informa isso."""
    user = smb_user or SHADOWIT_SMB_USER
    password = smb_pass or SHADOWIT_SMB_PASS
    if not (user and password):
        return []
    auth = f'{user}%{password}'
    out = await _smb_run(['smbclient', '-L', f'//{ip}', '-U', auth, '-g'], timeout=15)
    shares = []
    for line in out.splitlines():
        parts = line.split('|')
        if len(parts) < 2:
            continue
        share_type, name = parts[0].strip(), parts[1].strip()
        if share_type != 'Disk':
            continue  # pula IPC$ (canal de controle) e Printer
        if name.lower() in SMB_ADMIN_SHARES or SMB_DRIVE_ROOT_SHARE.match(name.lower()):
            continue
        permission = await _probe_smb_permission(ip, name, auth)
        if permission is None:
            continue
        shares.append({'name': name, 'permission': permission,
                        'comment': parts[2].strip() if len(parts) > 2 else ''})
    return shares


NETBIOS_LINE = re.compile(r'^\s*(\S+)\s+<00>\s+-\s*(<GROUP>)?')


async def run_netbios(ip: str) -> dict | None:
    """Nome NetBIOS + grupo/dominio via nmblookup -A -- ferramenta separada
    do Nmap de proposito (nao usa --script, ver motivo documentado em
    run_nmap()). Requer o pacote samba-common-bin instalado na VM."""
    cmd = ['nmblookup', '-A', ip]
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL)
        out, _ = await asyncio.wait_for(proc.communicate(), timeout=8)
    except (asyncio.TimeoutError, FileNotFoundError, OSError):
        return None
    name = group = None
    for line in out.decode('utf-8', errors='replace').splitlines():
        m = NETBIOS_LINE.match(line)
        if not m:
            continue
        if m.group(2):
            group = group or m.group(1)
        else:
            name = name or m.group(1)
    if not name and not group:
        return None
    return {'name': name, 'group': group}


async def run_shadowit_scan_job(req: dict) -> None:
    scan_id = req['scan_id']
    targets: list[str] = req.get('targets') or []
    smb_user = req.get('smb_user')
    smb_pass = req.get('smb_pass')
    print(f'[shadowit {scan_id}] iniciando -- {len(targets)} host(s), '
          f'credencial SMB {"via request" if smb_user else "via .env (fallback)" if SHADOWIT_SMB_USER else "ausente"}',
          flush=True)
    await send_shadowit_callback(scan_id, 'running', progress=5)

    findings: list[dict] = []
    total = len(targets) or 1
    for i, ip in enumerate(targets):
        ftp_banner, http_title, https_title, shares, netbios = await asyncio.gather(
            run_ftp_banner(ip),
            run_http_title(ip, 80, 'http', smb_user, smb_pass),
            run_http_title(ip, 443, 'https', smb_user, smb_pass),
            run_smb_shares(ip, smb_user, smb_pass),
            run_netbios(ip),
        )
        if ftp_banner:
            findings.append({'ip': ip, 'kind': 'ftp_banner', 'name': 'FTP', 'value': ftp_banner,
                              'raw_output': {'banner': ftp_banner}})
        # http_title/https_title agora sao dict (ou None se a porta nem
        # respondeu) -- registra o achado mesmo sem <title> na pagina, com
        # a URL montada pra já ir pronta pro front (ver .122/nginx sem
        # <title> que nao aparecia antes).
        if http_title:
            findings.append({'ip': ip, 'kind': 'http_title', 'name': 'HTTP',
                              'value': http_title['title'] or f"(sem <title> -- HTTP {http_title['status_code']})",
                              'raw_output': {'port': 80, 'url': http_title['url'], 'status_code': http_title['status_code']}})
        if https_title:
            findings.append({'ip': ip, 'kind': 'http_title', 'name': 'HTTPS',
                              'value': https_title['title'] or f"(sem <title> -- HTTP {https_title['status_code']})",
                              'raw_output': {'port': 443, 'url': https_title['url'], 'status_code': https_title['status_code']}})
        if netbios:
            findings.append({'ip': ip, 'kind': 'netbios', 'name': netbios.get('name') or 'NetBIOS',
                              'value': netbios.get('group'), 'raw_output': netbios})
        for share in shares:
            classification = classify_share(share['name'], share.get('permission', ''))
            if classification is None:
                continue
            findings.append({
                'ip': ip, 'kind': 'smb_share', 'name': share['name'],
                'value': share.get('comment') or None, 'permission': share.get('permission'),
                'classification': classification, 'raw_output': share,
            })
        progress = 5 + int(90 * (i + 1) / total)
        await send_shadowit_callback(scan_id, 'running', progress=progress)

    await send_shadowit_callback(scan_id, 'done', progress=100, findings=findings)
    print(f'[shadowit {scan_id}] concluido -- {len(findings)} achado(s)', flush=True)


def _clear_current_job(scan_id: str) -> None:
    """Chamado em todo caminho de saida de run_scan_job (varios `return`
    espalhados pelos modos + o fim do caminho principal) -- limpa o estado
    global de cancelamento pra esse job nao ficar "preso" pra sempre em
    CANCELLED_SCANS (cresceria sem limite ao longo do tempo) nem deixar
    current_job_procs apontando pra processos de um job que ja terminou
    (proximo /scan/cancel mataria processo errado)."""
    global current_job_scan_id, current_job_procs
    if current_job_scan_id == scan_id:
        current_job_scan_id = None
        current_job_procs = []
    CANCELLED_SCANS.discard(scan_id)


async def run_scan_job(req: dict) -> None:
    global current_job_scan_id, current_job_procs
    scan_id = req['scan_id']
    engines = req.get('engines') or []
    if scan_id in CANCELLED_SCANS:
        # Cancelado enquanto ainda estava na fila (nunca chegou a rodar
        # nada) -- nem dispara os engines, e nao manda callback nenhum (o
        # app ja marcou 'cancelled' na hora do clique, no momento).
        print(f'[job {scan_id}] cancelado antes de iniciar (ainda na fila) -- pulando', flush=True)
        _clear_current_job(scan_id)
        return
    current_job_scan_id = scan_id
    current_job_procs = []
    print(f'[job {scan_id}] iniciando — mode={req.get("mode")} engines={engines} targets={req.get("targets")} url={req.get("url")} domain={req.get("domain")}', flush=True)
    await send_callback(scan_id, 'running', progress=5)

    # Descoberta de rede local é um fluxo à parte -- não ataca uma URL/domínio,
    # varre a subnet informada e o resultado é "dispositivo encontrado", não
    # "vulnerabilidade". Host com hostname vira Ativo Descoberto (subdomains,
    # dast_recon_subdomains); host só-IP vira Shadow IT (shadow_hosts,
    # shadowit_hosts) -- ver split logo abaixo.
    if req.get('mode') == 'network_discovery':
        subnet = req.get('subnet')
        if not subnet or not is_private_subnet(subnet):
            print(f'[job {scan_id}] subnet inválida ou não-privada: {subnet!r} — abortando', flush=True)
            await send_callback(scan_id, 'error', progress=100)
            _clear_current_job(scan_id)
            return
        if 'nmap' not in engines:
            print(f'[job {scan_id}] network_discovery exige "nmap" em engines (recebido: {engines}) — abortando', flush=True)
            await send_callback(scan_id, 'error', progress=100)
            _clear_current_job(scan_id)
            return
        print(f'[job {scan_id}] descoberta de rede em {subnet}...', flush=True)
        hosts = await run_network_discovery(subnet)
        # Critério corrigido com o usuário (teste real mostrou a separação
        # por hostname errada): TODA descoberta de host interno -- com ou
        # sem nome -- é Shadow IT. DAST (Ativos Descobertos) fica só com
        # descoberta externa (Amass/Cloudflare). FQDN não se perde, vai
        # junto no shadow_hosts (ver hostname em shadowit_hosts).
        shadow_hosts = [{'ip': h['ip'], 'hostname': h.get('hostname'), 'source': h['source']} for h in hosts]
        print(f'[job {scan_id}] descoberta encontrou {len(hosts)} dispositivo(s) -- todos roteados pro Shadow IT', flush=True)
        await send_callback(scan_id, 'done', progress=100, shadow_hosts=shadow_hosts)
        _clear_current_job(scan_id)
        return

    # Descoberta de aplicação interna via zona DNS AD-integrada (LDAP) -- fila
    # normal do DAST de proposito (mesmo motivo do Amass/Cloudflare ja usarem
    # essa fila: e' descoberta pra alimentar Ativos Descobertos, nao achado
    # de dispositivo como o Shadow IT). So' lista via candidate_fqdns -- quem
    # decide o que vira Ativo Descoberto de verdade e' o usuario, na etapa de
    # confirmacao do lado do app (nao grava direto em dast_recon_subdomains).
    if req.get('mode') == 'internal_apps':
        ad_username = req.get('ad_username')
        ad_password = req.get('ad_password')
        ad_dc_host = req.get('ad_dc_host')
        if not (ad_username and ad_password and ad_dc_host):
            print(f'[job {scan_id}] internal_apps exige ad_username/ad_password/ad_dc_host — abortando', flush=True)
            await send_callback(scan_id, 'error', progress=100)
            _clear_current_job(scan_id)
            return
        await send_callback(scan_id, 'running', progress=20)
        try:
            fqdns = await run_ad_ldap_discovery(ad_username, ad_password, ad_dc_host)
        except Exception as e:
            print(f'[job {scan_id}] falha na descoberta LDAP: {type(e).__name__}: {e}', flush=True)
            await send_callback(scan_id, 'error', progress=100)
            _clear_current_job(scan_id)
            return
        print(f'[job {scan_id}] {len(fqdns)} candidata(s) a aplicação interna encontrada(s)', flush=True)
        await send_callback(scan_id, 'done', progress=100, candidate_fqdns=fqdns)
        _clear_current_job(scan_id)
        return

    # O app real (startDastScan) so manda "targets" (lista) -- nunca url/domain
    # isolados. url/domain seguem aceitos por compatibilidade com chamadas
    # manuais/scripts de teste que ja usamos.
    raw_targets_in: list[str] = req.get('targets') or ([req['url']] if req.get('url') else [])
    # ZAP exige URL com esquema completo no /ascan/action/scan (sem isso,
    # a resposta vem sem a chave 'scan' -> KeyError) -- confirmado com alvo
    # digitado sem http(s):// no formulario do app. Default https, mas
    # respeita http:// se o usuario escrever explicitamente.
    raw_targets: list[str] = [t if '://' in t else f'https://{t}' for t in raw_targets_in]
    mode = req.get('mode')

    targets: list[str] = []
    subdomains: list[str] = []

    if mode in ('domain', 'full'):
        domain = req.get('domain')
        if not domain and raw_targets:
            first = raw_targets[0]
            parsed = urlparse(first if '://' in first else f'https://{first}')
            domain = parsed.hostname
        if domain:
            if 'amass' in engines:
                subdomains = await run_amass(domain, req.get('passive', True))
                # amass devolve strings ("https://sub.dominio.com"); o callback
                # espera objetos {subdomain, ip, scope} -- sem isso o app
                # descarta tudo. Amass hoje so roda modo externo (OSINT
                # publico) -- scope 'internal' fica pra quando existir um
                # modo de enum via DNS interno.
                subdomains_payload = [{'subdomain': s, 'ip': None, 'scope': 'external', 'source': 'amass'} for s in subdomains]
                await send_callback(scan_id, 'running', progress=25, subdomains=subdomains_payload)
            targets = subdomains or [f'https://{domain}']
        else:
            targets = raw_targets
    else:
        # 'url' e 'bulk' -- escaneia a lista de alvos recebida diretamente,
        # sem expansao de subdominio (1 alvo em 'url', N em 'bulk').
        targets = raw_targets

    level = req.get('level') or 'intermediate'
    print(f'[job {scan_id}] alvos resolvidos: {targets} (level={level})', flush=True)

    # Scan autenticado -- configurado UMA vez pro job inteiro (nao por
    # alvo): "domain"/"full"/"bulk" podem gerar varios targets sob o mesmo
    # dominio logado, reusar o mesmo Context/User evita repetir login a
    # cada alvo. Presente so' quando o app achou credencial cadastrada pro
    # dominio (dast_auth_credentials) -- ver ScanRequest.auth_*.
    zap_auth: tuple[str, str, str] | None = None
    # None = nenhuma credencial configurada pro dominio (scan anonimo comum,
    # maioria dos casos hoje). 'authenticated'/'failed' so' aparecem quando
    # havia credencial -- ver comentario em send_callback sobre por que isso
    # precisa ir pro app em vez de ficar so' no log da VM.
    auth_status: str | None = None
    if req.get('auth_login_url') and req.get('auth_username') and req.get('auth_password') and 'zap' in engines:
        print(f'[job {scan_id}] configurando autenticacao no ZAP (login_url={req["auth_login_url"]})...', flush=True)
        async with httpx.AsyncClient(timeout=60) as auth_client:
            zap_auth = await zap_setup_auth(
                auth_client, req['auth_login_url'], req['auth_username'], req['auth_password'],
                req.get('auth_logged_in_indicator'),
            )
        auth_status = 'authenticated' if zap_auth else 'failed'

    findings: list = []
    engine_errors: list[str] = []
    out_of_scope_hosts_raw: list[dict] = []
    cancelled = False
    total = len(targets) or 1
    for i, target in enumerate(targets):
        if scan_id in CANCELLED_SCANS:
            # Cancelado entre um alvo e outro (nenhuma engine chegou a
            # disparar contra este alvo ainda) -- para o loop inteiro, nao
            # so' esse alvo.
            print(f'[job {scan_id}] cancelado -- parando antes do alvo {target}', flush=True)
            cancelled = True
            break
        # Achados SO' deste alvo -- mandados no callback de progresso logo
        # abaixo, em vez de esperar acumular no `findings` do job inteiro
        # pra so' gravar no callback final. Sem isso, um bulk de N alvos
        # perdia os achados de TODOS os alvos ja concluidos se o processo
        # morresse no meio (confirmado em producao 2026-09-30: apt-daily-
        # upgrade do Ubuntu reiniciou o scanner-api as 06h06 com um bulk de
        # 9 alvos rodando -- so' o ultimo alvo em andamento (admissao) deu
        # pra recuperar manualmente do ZAP depois, os 7 alvos ja concluidos
        # antes dele ficaram irrecuperaveis, so existiam em memoria Python).
        target_findings: list = []
        if 'zap' in engines:
            # HSQLDB do ZAP tem um teto fixo de cache que NAO e' exposto via
            # -config (confirmado ao vivo, 2026-09-24: 'Data cache size
            # limit is reached: 32000' -- so' aparece no log do container,
            # nao documentado pelo ZAP em lugar nenhum). Um job bulk de
            # varios alvos pesados seguidos na MESMA sessao acumula
            # historico ate estourar esse teto, travando toda gravacao nova
            # do Spider dali em diante (sintoma visto antes: travamentos em
            # % avancado espalhados pelo job). Sessao nova por alvo zera o
            # historico interno antes de comecar -- achados ja foram
            # extraidos e mandados pro callback antes disso, entao perder o
            # historico interno do ZAP entre alvos nao perde achado nenhum.
            #
            # Exclusoes de midia/tracking sao ESCOPO DE SESSAO -- confirmado
            # ao vivo que somem com newSession (excludedFromScan/
            # excludedFromProxy voltam vazios). Scan rules desabilitadas
            # (DomXssScanRule, ver configure_zap_active_scan_policy) sao
            # politica de scan, NAO sessao -- sobrevivem sozinhas,
            # confirmado ao vivo, nao precisam reaplicar aqui.
            async with httpx.AsyncClient(timeout=30) as c:
                try:
                    await c.get(f'{ZAP_URL}/JSON/core/action/newSession/', params={
                        'apikey': ZAP_KEY, 'name': '', 'overwrite': 'true',
                    })
                except Exception as e:
                    print(f'[zap] falha ao iniciar sessao nova pro alvo {target} '
                          f'(seguindo mesmo assim): {type(e).__name__}: {e}', flush=True)
            await configure_zap_global_excludes()
            # Mesmo motivo do scan_worker -- so' que aqui e' ENTRE alvos do
            # MESMO job bulk, nao so' entre jobs diferentes (ver
            # zap_wait_pscan_idle).
            async with httpx.AsyncClient(timeout=30) as c:
                await zap_wait_pscan_idle(c)
        # Fatia de progresso GERAL (nao a % interna do ZAP) que esse alvo
        # ocupa -- ver docstring de run_zap. Repassada pro active scan
        # interpolar a propria % dentro dela, pra tela se mexer durante um
        # scan autenticado longo em vez de ficar parada ate o alvo inteiro
        # terminar.
        progress_range = (25 + int((i / total) * 65), 25 + int(((i + 1) / total) * 65))
        tasks = []
        if 'nuclei' in engines:
            tasks.append(run_nuclei(target, level))
        if 'zap' in engines:
            tasks.append(run_zap(target, level, auth=zap_auth, scan_id=scan_id, progress_range=progress_range))
        if 'nmap' in engines:
            tasks.append(run_nmap(target))
        if 'nikto' in engines:
            tasks.append(run_nikto(target, level))

        print(f'[job {scan_id}] disparando {len(tasks)} engine(s) contra {target}...', flush=True)
        results = await asyncio.gather(*tasks, return_exceptions=True)
        print(f'[job {scan_id}] engines contra {target} retornaram {len(results)} resultado(s)', flush=True)
        for r in results:
            if isinstance(r, ScanCancelled):
                # Interrupcao deliberada (usuario clicou cancelar) -- nao e'
                # falha de engine, nunca vira dast_scans.error.
                print(f'[job {scan_id}] engine interrompido por cancelamento: {r}', flush=True)
                cancelled = True
                continue
            if isinstance(r, ZapPartialResultError):
                # Desistencia de run_zap() (travamento/conexao perdida) --
                # ANTES so' descartava tudo silenciosamente aqui (mesmo
                # generic Exception abaixo), mesmo o ZAP ja tendo achado
                # coisa real (passive scan, regras completadas, ate
                # alertas parciais da propria regra que travou). Achado
                # bug real em producao 2026-09-28 -- ver docstring da
                # excecao. Extrai o que deu pra recuperar, igual o dict
                # do caminho de sucesso normal, e AINDA registra o erro
                # (scan nao terminou 100% completo, precisa aparecer).
                print(f'[job {scan_id}] Erro durante scan de {target}: {type(r).__name__}: {r} '
                      f'-- {len(r.findings)} achado(s) parcial(is) recuperado(s) mesmo assim', flush=True)
                engine_errors.append(f'{target}: {r}')
                findings.extend(r.findings)
                target_findings.extend(r.findings)
                out_of_scope_hosts_raw.extend(r.out_of_scope_hosts)
                continue
            if isinstance(r, Exception):
                print(f'[job {scan_id}] Erro durante scan de {target}: {type(r).__name__}: {r}', flush=True)
                engine_errors.append(f'{target}: {r}')
                continue
            if isinstance(r, dict):
                # run_zap() -- unico engine que devolve dict (findings +
                # out_of_scope_hosts), diferente de nuclei/nmap/nikto que
                # devolvem list direto.
                r_findings = r.get('findings') or []
                print(f'[job {scan_id}] engine retornou {len(r_findings)} finding(s) de {target}', flush=True)
                findings.extend(r_findings)
                target_findings.extend(r_findings)
                out_of_scope_hosts_raw.extend(r.get('out_of_scope_hosts') or [])
                continue
            if isinstance(r, list):
                print(f'[job {scan_id}] engine retornou {len(r)} finding(s) de {target}', flush=True)
                findings.extend(r)
                target_findings.extend(r)

        if cancelled:
            break

        progress = 25 + int(((i + 1) / total) * 65)
        # Flush incremental -- send_callback so' anexa findings_enc quando a
        # lista nao e' vazia (ver docstring dela), entao mandar
        # target_findings sempre aqui e' seguro mesmo quando o alvo nao
        # achou nada.
        await send_callback(scan_id, 'running', progress=progress, findings=target_findings)

    if cancelled or scan_id in CANCELLED_SCANS:
        # Cancelado pelo usuario -- nao manda callback de 'done' nenhum. O
        # app ja marcou 'cancelled' no clique; mandar 'done' por cima
        # reviveria o status errado (dast-callback.ts tambem tem uma trava
        # propria pra isso, mas aqui nem tenta -- achados parciais sao
        # descartados de proposito, diferente do caso de trava/erro, onde
        # continuam validos).
        print(f'[job {scan_id}] cancelado -- nao mandando callback final de done '
              f'({len(findings)} achado(s) parcial(is) descartado(s))', flush=True)
    else:
        subdomains_payload = [{'subdomain': s, 'ip': None, 'scope': 'external', 'source': 'amass'} for s in subdomains]
        # Falha de engine (trava/erro de conexao) nao vira status=error -- os
        # achados parciais continuam validos e uteis, entao o scan segue "done"
        # normalmente; so' fica registrado o motivo pra UI avisar (icone de
        # alerta ja existente em dast_scans.error) que ficou incompleto, em vez
        # de sumir silenciosamente como acontecia antes.
        error_summary = ' | '.join(engine_errors)[:2000] if engine_errors else None
        out_of_scope_hosts = merge_out_of_scope_hosts(out_of_scope_hosts_raw)
        # findings NAO vai mais aqui -- ja foi mandado incrementalmente por
        # alvo (ver target_findings no loop acima). Reenviar tudo de novo
        # so' pagaria o custo (criptografia + payload grande) por nada.
        await send_callback(scan_id, 'done', progress=100, subdomains=subdomains_payload,
                             auth_status=auth_status, error=error_summary, out_of_scope_hosts=out_of_scope_hosts)
    _clear_current_job(scan_id)


AMASS_FQDN_LINE = re.compile(r'^(\S+)\s+\(FQDN\)\s+-->\s+\w+_record\s+-->')


def normalize_amass_txt(txt_path: str, domain: str) -> list[str]:
    """Amass v4 removeu o -json do CLI (era v3) -- o -oA so gera .txt nessa
    build, com o grafo de relacoes em texto:
    'nome (FQDN) --> a_record --> 1.2.3.4 (IPAddress)'. Extrai so os FQDNs
    que pertencem ao dominio alvo (ou o proprio dominio), ignorando linhas
    de ASN/Netblock/RIROrganization e FQDNs de terceiros que aparecem como
    destino de CNAME (ex.: azurewebsites.net, outlook.office365.com)."""
    subs = set()
    suffix = f'.{domain}'
    with open(txt_path) as f:
        for line in f:
            m = AMASS_FQDN_LINE.match(line.strip())
            if not m:
                continue
            name = m.group(1)
            if name == domain or name.endswith(suffix):
                subs.add(f'https://{name}')
    return list(subs)


async def run_amass(domain: str, passive: bool) -> list[str]:
    """Roda o Amass via Docker para descobrir subdominios.

    -json foi removido no Amass v4 (existia na v3, que a POC original
    assumia) -- confirmado via 'enum -h': so sobrou -oA, que aqui so produz
    .txt (nao .json/.gexf como a v3). --user root pelo mesmo motivo do
    Nikto: a imagem roda como usuario nao-root por padrao, sem permissao de
    escrita no volume montado ("Failed to open... permission denied").
    -passive tambem foi deprecado (passivo ja e o padrao), sem efeito.
    """
    run_id = uuid.uuid4().hex[:8]
    output_prefix = f'amass_{run_id}'
    host_output_path = os.path.join(AMASS_OUTPUT_DIR, f'{output_prefix}.txt')
    container_output_prefix = f'/output/{output_prefix}'
    container_name = f'amass-{run_id}'

    cmd = [
        'docker', 'run', '--rm',
        '--name', container_name,
        '--user', 'root',
        '-v', f'{AMASS_OUTPUT_DIR}:/output',
        'caffix/amass:latest',
        'enum', '-d', domain,
        '-oA', container_output_prefix,
        '-timeout', '20',
    ]

    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
    current_job_procs.append({'proc': proc, 'container_name': container_name})
    try:
        # -timeout 20 (minutos) e interno do amass -- 1260s da uma margem de
        # 60s pra ele encerrar sozinho antes do nosso kill forcado. Antes era
        # 10min/660s -- confirmado num scan real que o Amass bateu nesse
        # teto interno por volta de 636s (fontes OSINT passivas lentas
        # naquele momento) e devolveu resultado parcial (54 subdominios
        # numa execucao, 29 em outra -- vs 122 numa execucao anterior que
        # nao bateu no teto). Dobrar da mais chance de completar a consulta
        # antes de cortar.
        await asyncio.wait_for(proc.wait(), timeout=1260)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        # proc.kill() so' mata o cliente 'docker run' local (ver comentario
        # em current_job_procs) -- sem isso o container Amass ficava orfao
        # rodando pra sempre mesmo apos "timeout atingido".
        await docker_kill(container_name)
        print(f'[amass] timeout de 1260s atingido contra {domain}, processo morto', flush=True)

    subs: list[str] = []
    if os.path.exists(host_output_path):
        try:
            subs = normalize_amass_txt(host_output_path, domain)
        except Exception as e:
            print(f'[amass] erro ao parsear saida de {domain}: {type(e).__name__}: {e}', flush=True)
        os.remove(host_output_path)

    return subs


async def run_nuclei(url: str, level: str = 'intermediate') -> list:
    """Roda o Nuclei via Docker contra uma URL, com rate limit aplicado.
    Nível "basic" pula severidade critical/high (templates de exploracao
    ativa); "advanced" so aumenta o rate-limit, mesma cobertura do padrao."""
    run_id = uuid.uuid4().hex[:8]
    output_file = f'nuclei_{run_id}.json'
    host_output_path = os.path.join(NUCLEI_OUTPUT_DIR, output_file)
    container_output_path = f'/output/{output_file}'
    severity = NUCLEI_SEVERITY_BASIC if level == 'basic' else NUCLEI_SEVERITY_ALL
    rate_limit = NUCLEI_RATE_LIMIT_ADVANCED if level == 'advanced' else NUCLEI_RATE_LIMIT
    print(f'[nuclei] level={level} -> severity={severity} rate_limit={rate_limit}', flush=True)
    container_name = f'nuclei-{run_id}'

    cmd = [
        'docker', 'run', '--rm',
        '--name', container_name,
        '-v', f'{NUCLEI_TEMPLATES_CONFIG}:/root/.config/nuclei',
        '-v', f'{NUCLEI_TEMPLATES_DIR}:/root/nuclei-templates',
        '-v', f'{NUCLEI_OUTPUT_DIR}:/output',
        'projectdiscovery/nuclei:latest',
        '-u', url,
        '-severity', severity,
        '-rate-limit', str(rate_limit),
        '-json-export', container_output_path,
        '-silent',
    ]

    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
    current_job_procs.append({'proc': proc, 'container_name': container_name})
    try:
        await asyncio.wait_for(proc.wait(), timeout=600)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        # ver comentario em current_job_procs -- container Nuclei confirmado
        # sobrevivendo orfao (5+ min) so' com proc.kill(), sem isso.
        await docker_kill(container_name)

    findings = []
    try:
        # -json-export escreve um array JSON unico no arquivo (Nuclei v3),
        # nao mais JSONL linha-a-linha como no v2 -- ler o array inteiro,
        # nunca linha por linha (senao json.loads devolve a lista toda e
        # normalize_nuclei() quebra em list.get()).
        with open(host_output_path) as f:
            data = json.load(f)
        findings = [normalize_nuclei(item) for item in data]
    except (FileNotFoundError, json.JSONDecodeError):
        pass
    finally:
        if os.path.exists(host_output_path):
            os.remove(host_output_path)

    return findings


ZAP_ADVANCED_POLICY = 'St-High-Th-Low'  # policy pre-pronta do ZAP: Strength=High, Threshold=Low

# Teto de INATIVIDADE (nao de tempo total) pro polling de spider/ascan --
# 20min sem a % avancar nem um pouco e' trava de verdade (maior regra
# individual observada em teste real levou 201s pra uma unica pagina/regra
# -- 1200s da bastante margem acima disso). Diferente de um timeout total
# fixo (que cortava scan grande no meio, mesmo progredindo normalmente --
# confirmado: scan autenticado de 79 paginas passou de 1h e ainda tinha
# achado novo), isso deixa rodar o tempo que precisar enquanto tiver
# progresso de verdade, e so desiste se ficar preso.
ZAP_STALL_TIMEOUT_S = 1200

# Nome fixo do User criado em zap_setup_auth -- compartilhado com run_zap
# porque ajaxSpider/action/scanAsUser pede o NOME do usuario (userName), nao
# o ID como spider/ascan pedem (userId). Mesmo motivo do contexto: nomes
# distintos por API dentro do proprio ZAP, nao uniforme entre add-ons.
ZAP_AUTH_USER_NAME = 'dast-scan-user'


async def zap_setup_auth(
    client: httpx.AsyncClient, login_url: str, username: str, password: str,
    logged_in_indicator: str | None,
) -> tuple[str, str, str] | None:
    """Configura Context + Browser-Based Authentication + User no ZAP pra
    scan autenticado. Browser-Based (nao form-based classico) sobe um
    browser de verdade (Selenium/webdriverlinux, add-ons ja instalados) e
    acha campo de usuario/senha/botao sozinho -- funciona tanto em form
    HTML classico quanto em login via JS/SPA (perfil da maioria dos alvos
    aqui, incluindo o proprio app). Exige ZAP >= 2.16.1 (versoes antigas
    nao aceitam configurar esse metodo via API) -- confirmado ZAP >=
    2.17.0 na VM (varios add-ons ja exigem esse minimo).

    Context novo por chamada (nome com uuid, nunca reusado) -- scans rodam
    serializados (1 por vez, ver scan_queue), entao nao ha risco de dois
    scans concorrentes disputando o mesmo Context, e evita acumular
    Context velho preso a sessao expirada de um scan anterior.

    Best-effort: qualquer falha aqui e' logada e devolve None -- run_zap
    cai pro scan anonimo em vez de quebrar o scan inteiro (mesma logica
    que o Forced Browse tinha antes de ser removido). Ainda NAO testado
    contra um ZAP real -- primeira execucao deve ser acompanhada de perto
    via journalctl pra confirmar os nomes/parametros da API (mesmo tipo de
    validacao que pegou o bruteforce quebrado).
    """
    try:
        host = urlparse(login_url).hostname
        if not host:
            print(f'[zap-auth] login_url invalida: {login_url}', flush=True)
            return None
        ctx_name = f'auth-{uuid.uuid4().hex[:8]}'

        r = await client.get(f'{ZAP_URL}/JSON/context/action/newContext/',
                              params={'apikey': ZAP_KEY, 'contextName': ctx_name})
        context_id = r.json()['contextId']

        # Escopo amplo o bastante pra cobrir qualquer path/porta do mesmo
        # host -- scanAsUser só aplica a sessão autenticada se a URL do
        # alvo estiver DENTRO do contexto. O path era obrigatorio aqui
        # ("/.*") -- quebrava pra URL de alvo sem path nenhum (ex.:
        # "https://dominio.com", exatamente o formato que o scanAsUser
        # recebe pra um scan tipo "url"), devolvendo url_not_in_context no
        # ascan (confirmado em teste real). "(/.*)?" com o path opcional
        # cobre os dois casos.
        await client.get(f'{ZAP_URL}/JSON/context/action/includeInContext/', params={
            'apikey': ZAP_KEY, 'contextName': ctx_name,
            'regex': f'^https?://{re.escape(host)}(:[0-9]+)?(/.*)?$',
        })

        await client.get(f'{ZAP_URL}/JSON/authentication/action/setAuthenticationMethod/', params={
            'apikey': ZAP_KEY, 'contextId': context_id,
            'authMethodName': 'browserBasedAuthentication',
            'authMethodConfigParams': urlencode({'loginPageUrl': login_url}),
        })

        if logged_in_indicator:
            # Sem isso o ZAP ainda faz o login inicial normalmente, so' nao
            # percebe se a sessao expirar no meio de um scan longo (nao
            # reautentica sozinho).
            await client.get(f'{ZAP_URL}/JSON/authentication/action/setLoggedInIndicator/', params={
                'apikey': ZAP_KEY, 'contextId': context_id,
                'loggedInIndicatorRegex': logged_in_indicator,
            })

        r = await client.get(f'{ZAP_URL}/JSON/users/action/newUser/',
                              params={'apikey': ZAP_KEY, 'contextId': context_id, 'name': ZAP_AUTH_USER_NAME})
        user_id = r.json()['userId']

        await client.get(f'{ZAP_URL}/JSON/users/action/setAuthenticationCredentials/', params={
            'apikey': ZAP_KEY, 'contextId': context_id, 'userId': user_id,
            'authCredentialsConfigParams': urlencode({'username': username, 'password': password}),
        })
        await client.get(f'{ZAP_URL}/JSON/users/action/setUserEnabled/', params={
            'apikey': ZAP_KEY, 'contextId': context_id, 'userId': user_id, 'enabled': 'true',
        })

        print(f'[zap-auth] contexto "{ctx_name}" configurado (login_url={login_url})', flush=True)
        return context_id, user_id, ctx_name
    except Exception as e:
        print(f'[zap-auth] falha ao configurar autenticacao -- caindo pra scan anonimo: '
              f'{type(e).__name__}: {e}', flush=True)
        return None


async def zap_stop_scan(client: httpx.AsyncClient, stop_path: str, params: dict, label: str) -> None:
    """Best-effort: pede pro ZAP parar um scan que desistimos de esperar
    (trava ou erro de conexao) -- sem isso, o ZAP continua rodando aquele
    scan sozinho pra sempre, orfao, consumindo CPU/memoria sem que ninguem
    jamais colete o resultado (confirmado em teste real: um job que ja
    tinha desistido e mandado 'done' deixou o active scan dele rodando por
    trás -- achado com 'ascan/view/scans': dois scans simultaneos no ZAP,
    um órfão em 79% consumindo recurso à toa). Nunca deixa falha aqui
    mascarar o erro original que vai ser levantado em seguida -- so loga."""
    try:
        await client.get(f'{ZAP_URL}/JSON/{stop_path}/', params=params)
    except Exception as e:
        print(f'[zap] falha ao pedir parada de {label} (best-effort, seguindo): '
              f'{type(e).__name__}: {e}', flush=True)


def is_third_party_host(candidate_host: str, target_host: str) -> bool:
    """'Terceiro' = host diferente do dominio do proprio alvo (e dos seus
    subdominios) -- mesma logica de comparacao ja usada pro resto do
    reconhecimento do DAST (dast_recon_subdomains via ilike '%dominio')."""
    candidate = candidate_host.lower().rstrip('.')
    target = target_host.lower().rstrip('.')
    return not (candidate == target or candidate.endswith(f'.{target}'))


async def extract_out_of_scope_hosts(client: httpx.AsyncClient, sid: str, target_host: str) -> list[dict]:
    """Consulta spider/view/fullResults do scan de spider que acabou de
    rodar -- urlsOutOfScope inclui tanto midia estatica do PROPRIO alvo (ja
    excluida de proposito, ver ZAP_STATIC_ASSET_EXCLUDE_REGEX) quanto host
    de terceiro de verdade (ZAP_THIRD_PARTY_TRACKING_EXCLUDE_REGEX, ou
    qualquer outro link externo que o spider encontrou mas nao seguiu).
    Filtra so' os hosts DIFERENTES do alvo -- midia do proprio dominio nao
    e' reportada aqui (ja resolvida, nao e' achado, so' ruido). Agrupa por
    host (mesmo padrao de group_zap_alerts): conta ocorrencias, guarda ate
    5 URLs de amostra. Best-effort -- falha aqui nunca derruba o scan, so'
    retorna lista vazia. Formato do JSON confirmado ao vivo (2026-09-22):
    'fullResults' NAO e' um dict com as 3 chaves direto -- e' uma LISTA de
    dicts de 1 chave cada, ex.: [{'urlsInScope': [...]}, {'urlsOutOfScope':
    [...]}, {'urlsIoError': [...]}]. Cobre os dois formatos (defensivo)
    porque a doc oficial do ZAP nao documenta isso."""
    try:
        r = await client.get(f'{ZAP_URL}/JSON/spider/view/fullResults/',
                              params={'apikey': ZAP_KEY, 'scanId': sid})
        raw = r.json().get('fullResults', [])
        out_of_scope = []
        if isinstance(raw, dict):
            out_of_scope = raw.get('urlsOutOfScope') or []
        elif isinstance(raw, list):
            for section in raw:
                if isinstance(section, dict) and 'urlsOutOfScope' in section:
                    out_of_scope = section.get('urlsOutOfScope') or []
                    break
    except Exception as e:
        print(f'[zap] falha ao consultar spider/view/fullResults (seguindo mesmo assim): '
              f'{type(e).__name__}: {e}', flush=True)
        return []

    grouped: dict[str, dict] = {}
    for entry in out_of_scope:
        url = entry if isinstance(entry, str) else (entry.get('url') or entry.get('uri') or '')
        if not url:
            continue
        try:
            host = urlparse(url).hostname
        except ValueError:
            continue
        if not host or not target_host or not is_third_party_host(host, target_host):
            continue
        g = grouped.setdefault(host, {'host': host, 'request_count': 0, 'sample_urls': []})
        g['request_count'] += 1
        if url not in g['sample_urls'] and len(g['sample_urls']) < 5:
            g['sample_urls'].append(url)
    return list(grouped.values())


def merge_out_of_scope_hosts(raw: list[dict]) -> list[dict]:
    """Agrega por host entre TODOS os alvos de um job bulk -- o mesmo host
    de terceiro (ex.: Google Tag Manager) tende a aparecer em varios
    dominios da mesma lista, soma a contagem e junta as amostras de URL
    (max 5) em vez de duplicar uma linha por alvo no relatorio final."""
    grouped: dict[str, dict] = {}
    for item in raw:
        host = item['host']
        g = grouped.setdefault(host, {'host': host, 'request_count': 0, 'sample_urls': []})
        g['request_count'] += item.get('request_count', 0)
        for u in item.get('sample_urls', []):
            if u not in g['sample_urls'] and len(g['sample_urls']) < 5:
                g['sample_urls'].append(u)
    return list(grouped.values())


def _sum_request_counts(obj) -> int:
    """Soma a contagem de requisicoes de ascan/view/scanProgress -- formato
    real CONFIRMADO ao vivo (2026-09-28, nao documentado em lugar nenhum
    oficial do ZAP): NAO e' um dict com chave 'requestCount' (primeira
    tentativa, nunca bateu com nada -- por isso o fix de deteccao de
    travamento via contagem de mensagens nao teve efeito nenhum no
    primeiro teste, sempre caia no fallback so'-porcentagem). E' uma
    LISTA POSICIONAL de 7 valores por plugin:
    ["Nome", "id", "quality", "status", "tempo_ms", "requisicoes", "alertas"]
    -- indice 5 (contando de 0) e' a contagem de requisicoes. Exemplo real:
    ["SQL Injection","40018","release","Complete","584907","1319","1"].
    Continua defensivo (bounds-check, try/except por item) porque o
    formato nao e' documentado e pode variar entre versoes do ZAP --
    um item mal formado so' e' pulado, nunca derruba a soma inteira."""
    total = -1
    try:
        sections = obj.get('scanProgress', [])
    except AttributeError:
        return total
    for section in sections:
        if not isinstance(section, dict):
            continue
        for plugin in section.get('HostProcess', []):
            if not isinstance(plugin, dict):
                continue
            fields = plugin.get('Plugin')
            if not isinstance(fields, list) or len(fields) < 6:
                continue
            try:
                total = (total if total != -1 else 0) + int(fields[5])
            except (TypeError, ValueError):
                pass
    return total


async def zap_fetch_partial_findings(client: httpx.AsyncClient, url: str) -> list[dict]:
    """Busca os achados que o ZAP ja tem gravados pra esse alvo AGORA MESMO
    (core/view/alerts, mesma chamada que o caminho de sucesso normal de
    run_zap() faz no final) -- usado antes de desistir por travamento/
    conexao perdida, pra nao perder achado real so' porque a gente foi
    forcado a abortar. Best-effort de verdade: se ISSO tambem falhar (ex.:
    ZAP genuinamente caiu), retorna lista vazia em vez de propagar um erro
    novo por cima do que ja estava sendo tratado."""
    try:
        alerts = await client.get(f'{ZAP_URL}/JSON/core/view/alerts/',
                                   params={'apikey': ZAP_KEY, 'baseurl': url})
        return await group_zap_alerts(alerts.json().get('alerts', []), client)
    except Exception as e:
        print(f'[zap] falha ao buscar achados parciais antes de desistir '
              f'(seguindo com lista vazia): {type(e).__name__}: {e}', flush=True)
        return []


async def run_zap(
    url: str, level: str = 'intermediate', auth: tuple[str, str, str] | None = None,
    scan_id: str | None = None, progress_range: tuple[int, int] | None = None,
) -> dict:
    """Fala direto com o daemon do ZAP (ja rodando via Docker, secao 5.3),
    com delay entre requisicoes aplicado via config do proprio ZAP.

    Nível "basic" e deliberadamente passivo -- sem crawl pesado, sem active
    scan, sem payload de ataque, so o que o ZAP capta ao rastrear (header
    ausente, cookie sem flag etc.). "intermediate" e "advanced" primeiro
    rodam Ajax Spider (crawl via browser real -- pega rota montada em JS
    que o Spider classico nao ve, essencial pro perfil SPA/React dos
    alvos) antes do active scan; fica de fora do "basic" porque e bem
    mais lento (sobe um browser de verdade por pagina) e "basic" e pra ser
    o nivel rapido. "intermediate" usa a Default Policy
    do ZAP sem tocar em nada (mesmo comportamento de sempre). "advanced"
    roda com a policy pronta 'St-High-Th-Low' (Strength=High,
    Threshold=Low) -- mais payload por verificacao e mais sensivel a sinal
    fraco que a Default Policy.

    `auth` (contextId, userId, contextName) -- se presente (ver
    zap_setup_auth/run_scan_job), spider, Ajax Spider e active scan rodam
    "como" esse usuario (scanAsUser) em vez de anonimo. Ajax Spider e' o
    unico que pede NOME em vez de ID (contextName/userName, nao
    contextId/userId como spider/ascan) -- por isso o contextName vem junto
    no retorno de zap_setup_auth, so' pra essa chamada.

    Spider autenticado roda com 1 thread so' (setOptionThreadCount) -- o
    Spider classico normalmente usa varias threads em paralelo, e cada
    thread que bate numa pagina sem sessao valida autentica por conta
    propria. Com Browser-Based Authentication, cada autenticacao sobe seu
    proprio servidor HTTP local (Netty) pro callback do login -- threads
    concorrentes autenticando ao mesmo tempo colidem tentando subir/derrubar
    esse servidor compartilhado, corrompendo a rede interna do ZAP
    (confirmado em teste real: "Interrupted while waiting for the server to
    start/stop" -> "event executor terminated" -> processo morre, restart
    automatico no meio do scan). 1 thread elimina a concorrencia. Restaurado
    pro default (2) depois -- e' opcao global do daemon, nao por-scan, senao
    todo scan anonimo seguinte tambem ficaria preso em 1 thread.

    `scan_id`/`progress_range` -- so' usados pro polling do active scan
    (fonte primaria de achado, o que mais demora). progress_range e' a
    fatia (inicio, fim) do progresso GERAL do job que esse alvo ocupa (ver
    run_scan_job) -- a % do ZAP e' interpolada dentro dela e mandada como
    callback 'running' a cada mudanca, pra tela nao ficar parada na mesma %
    por potencialmente horas num scan autenticado grande."""
    print(f'[zap] level={level} -> active_scan={"nao" if level == "basic" else "sim"}'
          f'{f" (policy={ZAP_ADVANCED_POLICY})" if level == "advanced" else ""}'
          f'{" (autenticado)" if auth else ""}', flush=True)
    if scan_id and scan_id in CANCELLED_SCANS:
        raise ScanCancelled(f'scan {scan_id} cancelado antes do ZAP iniciar')
    async with httpx.AsyncClient(timeout=600) as c:
        if auth:
            context_id, user_id, ctx_name = auth
            try:
                await c.get(f'{ZAP_URL}/JSON/spider/action/setOptionThreadCount/',
                            params={'apikey': ZAP_KEY, 'Integer': 1})
            except Exception as e:
                print(f'[zap] falha ao reduzir spider pra 1 thread -- seguindo mesmo assim: '
                      f'{type(e).__name__}: {e}', flush=True)
            sr = await c.get(f'{ZAP_URL}/JSON/spider/action/scanAsUser/', params={
                'apikey': ZAP_KEY, 'url': url, 'contextId': context_id, 'userId': user_id,
            })
        else:
            sr = await c.get(f'{ZAP_URL}/JSON/spider/action/scan/',
                              params={'apikey': ZAP_KEY, 'url': url})
        sr_body = sr.json()
        # scanAsUser devolve o id do scan numa chave DIFERENTE da variante
        # anonima -- 'scanAsUser', nao 'scan' (confirmado em teste real: a
        # resposta {'scanAsUser': '1'} sempre caia no "else" abaixo, o
        # active scan nunca era esperado de verdade -- ver mesmo problema
        # no ascan logo adiante).
        sid = sr_body.get('scan') or sr_body.get('scanAsUser')
        if sid:
            last_pct, last_change_at = -1, time.monotonic()
            while True:
                await asyncio.sleep(10)
                if scan_id and scan_id in CANCELLED_SCANS:
                    await zap_stop_scan(c, 'spider/action/stop', {'apikey': ZAP_KEY, 'scanId': sid}, 'spider')
                    raise ScanCancelled(f'scan {scan_id} cancelado durante o spider')
                try:
                    s = await c.get(f'{ZAP_URL}/JSON/spider/view/status/',
                                     params={'apikey': ZAP_KEY, 'scanId': sid})
                    pct = int(s.json().get('status', -1))
                except Exception as e:
                    # Erro de conexao durante o poll (ex.: ZAP caiu no meio,
                    # ja vimos isso acontecer de verdade) e' tratado como
                    # falha real, nao como "ainda rodando" -- levanta erro
                    # explicito em vez de deixar a excecao subir sem contexto.
                    # Tenta parar mesmo assim (best-effort -- pode ser so'
                    # essa requisicao que falhou, ZAP ainda de pe).
                    await zap_stop_scan(c, 'spider/action/stop', {'apikey': ZAP_KEY, 'scanId': sid}, 'spider')
                    raise ZapPartialResultError(
                        f'spider/view/status falhou (conexao perdida durante '
                        f'o crawl): {type(e).__name__}: {e}',
                        findings=await zap_fetch_partial_findings(c, url))
                if pct == 100:
                    break
                if pct != last_pct:
                    last_pct, last_change_at = pct, time.monotonic()
                elif time.monotonic() - last_change_at > ZAP_STALL_TIMEOUT_S:
                    # Trava de verdade (nao so' "esta demorando") -- % parada
                    # ha muito tempo, nao tempo total fixo (scan grande pode
                    # legitimamente levar bem mais que qualquer teto fixo
                    # razoavel, ver ZAP_STALL_TIMEOUT_S). Manda parar no ZAP
                    # tambem -- sem isso fica rodando orfao pra sempre (ver
                    # zap_stop_scan).
                    await zap_stop_scan(c, 'spider/action/stop', {'apikey': ZAP_KEY, 'scanId': sid}, 'spider')
                    raise ZapPartialResultError(
                        f'spider travado em {pct}% ha mais de '
                        f'{ZAP_STALL_TIMEOUT_S}s sem avancar',
                        findings=await zap_fetch_partial_findings(c, url))
        else:
            # Best-effort: spider e' o crawl que alimenta o active scan, mas
            # nao vale abortar o scan inteiro por causa disso -- so' loga e
            # da uma folga fixa igual o comportamento antigo, caso a acao
            # nao devolva scanId por algum motivo.
            print(f'[zap] spider/action/scan nao retornou "scan" -- resposta: {sr_body}', flush=True)
            await asyncio.sleep(30)

        # Domínios de terceiro (analytics/tracking/CDN) que o spider achou
        # mas nao seguiu -- ver extract_out_of_scope_hosts. So' funciona se
        # tivermos um scanId de verdade (sid); no fallback acima (sem sid)
        # fica vazio mesmo, sem tentar adivinhar.
        out_of_scope_hosts: list[dict] = []
        if sid:
            target_host = urlparse(url).hostname or ''
            out_of_scope_hosts = await extract_out_of_scope_hosts(c, sid, target_host)

        if auth:
            try:
                await c.get(f'{ZAP_URL}/JSON/spider/action/setOptionThreadCount/',
                            params={'apikey': ZAP_KEY, 'Integer': 2})
            except Exception:
                pass

        if level != 'basic':
            if auth:
                # ajaxSpider pede NOME (contextName/userName), nao ID -- unico
                # dos tres (spider/ajaxSpider/ascan) com essa diferenca.
                await c.get(f'{ZAP_URL}/JSON/ajaxSpider/action/scanAsUser/', params={
                    'apikey': ZAP_KEY, 'url': url, 'contextName': ctx_name, 'userName': ZAP_AUTH_USER_NAME,
                })
            else:
                await c.get(f'{ZAP_URL}/JSON/ajaxSpider/action/scan/',
                            params={'apikey': ZAP_KEY, 'url': url})
            # ajaxSpider nao usa scanId (instancia unica no daemon) -- status
            # e' "running"/"stopped", nao percentual como spider/ascan. Trava
            # aqui seria ficar preso em "running" pra sempre -- mesma
            # deteccao por inatividade, so' que sobre a string em vez de %.
            last_state, last_change_at = None, time.monotonic()
            while True:
                await asyncio.sleep(10)
                if scan_id and scan_id in CANCELLED_SCANS:
                    await zap_stop_scan(c, 'ajaxSpider/action/stop', {'apikey': ZAP_KEY}, 'ajaxSpider')
                    raise ScanCancelled(f'scan {scan_id} cancelado durante o ajaxSpider')
                try:
                    s = await c.get(f'{ZAP_URL}/JSON/ajaxSpider/view/status/',
                                     params={'apikey': ZAP_KEY})
                    state = s.json().get('status')
                except Exception as e:
                    await zap_stop_scan(c, 'ajaxSpider/action/stop', {'apikey': ZAP_KEY}, 'ajaxSpider')
                    raise ZapPartialResultError(
                        f'ajaxSpider/view/status falhou (conexao perdida '
                        f'durante o crawl): {type(e).__name__}: {e}',
                        findings=await zap_fetch_partial_findings(c, url),
                        out_of_scope_hosts=out_of_scope_hosts)
                if state == 'stopped':
                    break
                if state != last_state:
                    last_state, last_change_at = state, time.monotonic()
                elif time.monotonic() - last_change_at > ZAP_STALL_TIMEOUT_S:
                    await zap_stop_scan(c, 'ajaxSpider/action/stop', {'apikey': ZAP_KEY}, 'ajaxSpider')
                    raise ZapPartialResultError(
                        f'ajaxSpider travado em "{state}" ha mais de '
                        f'{ZAP_STALL_TIMEOUT_S}s sem avancar',
                        findings=await zap_fetch_partial_findings(c, url),
                        out_of_scope_hosts=out_of_scope_hosts)

            # Forced Browse (bruteforce) removido daqui -- o add-on carrega
            # a extensao normal (log confirma "Initializing ExtensionBruteForce"
            # sem erro), mas a API dele nunca registra nesse ZAP rodando em
            # modo daemon headless (confirmado: qualquer acao do componente
            # 'bruteforce', nao so' 'action/scan', devolve {"code":"no_implementor"}).
            # Add-on baseado no OWASP DirBuster, projeto parado ha anos --
            # plausivel que seja limitacao dele mesmo em modo headless, sem
            # config do nosso lado que resolva. Se quiser descoberta de
            # diretorio/arquivo, o caminho e' um engine proprio (ffuf ou
            # gobuster modo 'dir', ambos ativamente mantidos), nao esse add-on.

            scan_params = {'apikey': ZAP_KEY, 'url': url}
            if level == 'advanced':
                scan_params['scanPolicyName'] = ZAP_ADVANCED_POLICY
            if auth:
                context_id, user_id, _ctx_name = auth
                scan_params['contextId'] = context_id
                scan_params['userId'] = user_id
                ascan_action = 'ascan/action/scanAsUser'
                r = await c.get(f'{ZAP_URL}/JSON/{ascan_action}/', params=scan_params)
            else:
                ascan_action = 'ascan/action/scan'
                r = await c.get(f'{ZAP_URL}/JSON/{ascan_action}/', params=scan_params)
            r_body = r.json()
            # scanAsUser devolve o id numa chave DIFERENTE da variante
            # anonima -- 'scanAsUser', nao 'scan' (confirmado em teste real:
            # resposta {'scanAsUser': '1'} sempre disparava o RuntimeError
            # abaixo na hora, o active scan nunca chegava a ser esperado de
            # verdade -- o ZAP escaneava normalmente por baixo, so' que sem
            # ninguem do nosso lado olhando, entao o job reportava "done"
            # bem antes do scan de verdade terminar).
            sid = r_body.get('scan') or r_body.get('scanAsUser')
            if not sid:
                # Antes disso quebrava com KeyError sem contexto nenhum --
                # o asyncio.gather(return_exceptions=True) engolia o erro e
                # o ZAP contribuia 0 achados novos, silenciosamente (foi o
                # que pareceu acontecer no primeiro teste do "avancado":
                # mais rapido, mesmo resultado -- sinal de active scan
                # nunca tendo comecado de fato). Nome da acao explicito no
                # log (nao so' "ascan/action/scan" fixo) -- confundiu o
                # diagnostico do bug de url_not_in_context, que so'
                # acontecia na variante scanAsUser.
                print(f'[zap] {ascan_action} nao retornou "scan"/"scanAsUser" -- resposta: {r_body}', flush=True)
                raise ZapPartialResultError(
                    f'ZAP {ascan_action} falhou: {r_body}',
                    findings=await zap_fetch_partial_findings(c, url),
                    out_of_scope_hosts=out_of_scope_hosts)

            # Active scan e' de longe o mais demorado (confirmado em teste
            # real: scan autenticado de 79 paginas passou de 1h, uma unica
            # regra -- SqlInjectionScanRule -- levou 201s sozinha). Teto de
            # tempo TOTAL fixo cortava esse tipo de scan no meio mesmo
            # progredindo normalmente (o app marcava "done" com o ZAP ainda
            # rodando de verdade em segundo plano). Deteccao por inatividade
            # em vez disso: continua esperando enquanto a % avancar, so'
            # desiste se ficar presa na mesma % por ZAP_STALL_TIMEOUT_S.
            last_pct, last_change_at = -1, time.monotonic()
            last_msg_count = -1
            while True:
                await asyncio.sleep(10)
                if scan_id and scan_id in CANCELLED_SCANS:
                    await zap_stop_scan(c, 'ascan/action/stop',
                                         {'apikey': ZAP_KEY, 'scanId': sid}, 'active scan')
                    raise ScanCancelled(f'scan {scan_id} cancelado durante o active scan')
                try:
                    s = await c.get(f'{ZAP_URL}/JSON/ascan/view/status/',
                                     params={'apikey': ZAP_KEY, 'scanId': sid})
                    pct = int(s.json()['status'])
                except Exception as e:
                    # Erro de conexao durante o poll (ex.: ZAP caiu no meio --
                    # ja aconteceu de verdade) e' falha real, nao "ainda
                    # rodando" -- levanta erro explicito com contexto em vez
                    # de deixar a excecao subir sem dizer o motivo.
                    await zap_stop_scan(c, 'ascan/action/stop',
                                         {'apikey': ZAP_KEY, 'scanId': sid}, 'active scan')
                    raise ZapPartialResultError(
                        f'ascan/view/status falhou (conexao perdida durante '
                        f'o active scan): {type(e).__name__}: {e}',
                        findings=await zap_fetch_partial_findings(c, url),
                        out_of_scope_hosts=out_of_scope_hosts)

                # A % as vezes fica igual por muito tempo mesmo com o scan
                # genuinamente ativo -- confirmado em producao (2026-09-25):
                # SQLInjectionScanRule mandou 12077 mensagens em 1615s (~7.5
                # req/s, claramente vivo) contra admissao.bernoulli.com.br
                # (SPA multi-etapas com muito parametro pra testar), mas a %
                # inteira nao mudou por mais de ZAP_STALL_TIMEOUT_S, e o
                # stall-detection matou um scan que estava progredindo de
                # verdade. Contagem de mensagens (soma qualquer
                # 'requestCount' na resposta -- formato exato do
                # scanProgress nao documentado, entao best-effort/generico
                # de proposito) serve de segundo sinal de vida: so' declara
                # travado se % E contagem de mensagens ficarem paradas ao
                # mesmo tempo.
                msg_count = last_msg_count
                try:
                    prog = await c.get(f'{ZAP_URL}/JSON/ascan/view/scanProgress/',
                                        params={'apikey': ZAP_KEY, 'scanId': sid})
                    msg_count = _sum_request_counts(prog.json())
                except Exception:
                    pass  # sem sinal extra -- cai de volta pro comportamento so' de %

                if pct != last_pct or (msg_count != -1 and msg_count != last_msg_count):
                    pct_changed = pct != last_pct
                    last_pct, last_change_at = pct, time.monotonic()
                    if msg_count != -1:
                        last_msg_count = msg_count
                    if scan_id and progress_range and pct_changed:
                        start, end = progress_range
                        job_pct = start + int((pct / 100) * (end - start))
                        await send_callback(scan_id, 'running', progress=job_pct)
                elif time.monotonic() - last_change_at > ZAP_STALL_TIMEOUT_S:
                    await zap_stop_scan(c, 'ascan/action/stop',
                                         {'apikey': ZAP_KEY, 'scanId': sid}, 'active scan')
                    raise ZapPartialResultError(
                        f'active scan travado em {pct}% ha mais de '
                        f'{ZAP_STALL_TIMEOUT_S}s sem avancar',
                        findings=await zap_fetch_partial_findings(c, url),
                        out_of_scope_hosts=out_of_scope_hosts)

                if pct == 100:
                    break

        alerts = await c.get(f'{ZAP_URL}/JSON/core/view/alerts/',
                              params={'apikey': ZAP_KEY, 'baseurl': url})
        findings = await group_zap_alerts(alerts.json().get('alerts', []), c)

    return {'findings': findings, 'out_of_scope_hosts': out_of_scope_hosts}


async def group_zap_alerts(raw_alerts: list[dict], client: httpx.AsyncClient) -> list[dict]:
    """O ZAP devolve uma linha POR INSTANCIA (cada URL/parametro onde o
    alerta disparou) -- num site grande, um problema presente em todas as
    paginas (ex.: header ausente) vira milhares de "vulnerabilidades"
    repetidas (confirmado: 24695 numa unica varredura, estourou o timeout
    do callback). Agrupa por (nome do alerta, risco, alertRef), 1 linha por
    tipo, com contagem + amostra de URLs na evidencia.

    alertRef distingue variantes de uma mesma regra que compartilham
    alert+risk (ex.: "10054-2") -- sem isso no agrupamento, duas variantes
    diferentes da mesma regra colapsariam numa linha so, igual ao bug que
    ja corrigimos no Nuclei (RDAP WHOIS com varias sub-extracoes)."""
    groups: dict[tuple[str, str, str], list[dict]] = {}
    for a in raw_alerts:
        key = (a.get('alert', ''), a.get('risk', ''), a.get('alertRef', ''))
        groups.setdefault(key, []).append(a)

    # Numero de ocorrencias por grupo que ganham requisicao/resposta bruta
    # capturada de verdade (core/view/message, 1 chamada extra ao ZAP cada).
    # Um grupo ja chegou a ter 24695 ocorrencias numa unica regra -- buscar
    # isso pra todas travaria o scan e estouraria o tamanho do callback de
    # novo (mesmo problema que a propria funcao de agrupar ja resolveu uma
    # vez). As demais ocorrencias ainda aparecem na lista completa de URLs,
    # so sem request/response.
    DETAILED_CAPTURE_LIMIT = 10

    findings = []
    for instances in groups.values():
        rep = instances[0]
        norm = normalize_zap(rep)
        total = len(instances)

        # Lista completa (toda ocorrencia, sem cortar em 5) -- so url/param/
        # metodo, sem chamada extra ao ZAP, pra UI conseguir listar todas em
        # vez do resumo truncado "(+N outra(s))" de antes.
        all_instances = [
            {'url': i.get('url'), 'param': i.get('param'), 'method': i.get('method', 'GET')}
            for i in instances
        ]

        # Requisicao/resposta reais via core/view/message -- a mesma
        # informacao que aparece na UI desktop do ZAP ao abrir um alerta --
        # so pras primeiras DETAILED_CAPTURE_LIMIT ocorrencias do grupo.
        # A ordem bate com all_instances (mesma lista 'instances', mesmo
        # indice) de proposito, pro front conseguir juntar as duas sem
        # precisar de uma chave em comum.
        detailed_count = 0
        for idx, inst in enumerate(instances[:DETAILED_CAPTURE_LIMIT]):
            message_id = inst.get('messageId')
            if not message_id:
                continue
            try:
                r = await client.get(f'{ZAP_URL}/JSON/core/view/message/',
                                      params={'apikey': ZAP_KEY, 'id': message_id})
                msg = r.json().get('message', {})
                req = f"{msg.get('requestHeader', '')}\n\n{msg.get('requestBody', '')}".strip()
                resp = f"{msg.get('responseHeader', '')}\n\n{msg.get('responseBody', '')}".strip()
                if req:
                    all_instances[idx]['request'] = req
                if resp:
                    all_instances[idx]['response'] = resp
                if req or resp:
                    detailed_count += 1
            except Exception as e:
                print(f'[zap] falha ao buscar mensagem {message_id}: {type(e).__name__}: {e}', flush=True)

        # normalize_zap ja capturou o evidence real da instancia
        # representativa (ex.: nome/versao da lib no alerta "Vulnerable JS
        # Library", via Retire.js) -- sem isso, so sobrava o resumo de
        # contagem+URL, perdendo o dado especifico que motivou o achado
        # (confirmado: "Vulnerable JS Library" sem lib/versao em lugar
        # nenhum da UI, nem no campo Evidencia).
        occurrence_summary = f'{total} ocorrência(s)'
        if total > 1:
            occurrence_summary += f' — requisição/resposta capturada em {detailed_count} delas'
        real_evidence = norm.get('evidence')
        norm['evidence'] = (
            f'{occurrence_summary}\n\nEvidência (1ª ocorrência): {real_evidence}'
            if real_evidence else occurrence_summary
        )

        norm['raw_output']['instances'] = all_instances
        # Mantido pra compatibilidade com achados antigos/outros pontos que
        # ja leem raw_output.request/response da 1a ocorrencia direto.
        if all_instances and all_instances[0].get('request'):
            norm['raw_output']['request'] = all_instances[0]['request']
        if all_instances and all_instances[0].get('response'):
            norm['raw_output']['response'] = all_instances[0]['response']

        findings.append(norm)
    return findings


async def run_nmap(target: str) -> list:
    """Roda o Nmap via Docker contra o host/dominio, com timing gentil
    (-T2) e escopo de portas restrito -- ver recomendacoes de seguranca."""
    host = target.replace('https://', '').replace('http://', '').split('/')[0]
    run_id = uuid.uuid4().hex[:8]
    output_file = f'nmap_{run_id}.xml'
    host_output_path = os.path.join(NMAP_OUTPUT_DIR, output_file)
    container_output_path = f'/output/{output_file}'
    container_name = f'nmap-{run_id}'

    cmd = [
        'docker', 'run', '--rm',
        '--name', container_name,
        '-v', f'{NMAP_OUTPUT_DIR}:/output',
        'instrumentisto/nmap:latest',
        NMAP_TIMING,
        # -sT (TCP connect, nao precisa raw socket) em vez do -sS padrao.
        # SEM --script de proposito: confirmado via docker run manual que
        # scripts NSE (default/safe, com ou sem exclusao booleana de
        # broadcast/external) crasham esse container com SIGSEGV (exit 139)
        # assim que agendam scripts tipo eap-info -- que dependem de uma
        # interface L2 de verdade (so funcionam com --network host, que faz
        # sentido pra run_network_discovery mas nao pra atacar um alvo
        # remoto). Sem --script, -sT -sV roda limpo e traz porta+versao real
        # (confirmado: nginx na 443, Cloudflare proxy nas outras).
        '-sT', '-sV',
        '-p', NMAP_PORTS,
        '-oX', container_output_path,
        host,
    ]

    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
    current_job_procs.append({'proc': proc, 'container_name': container_name})
    try:
        # -T2 + -sV contra ~13 portas ja mostrou passar de 5min em teste real
        # (WAF do Cloudflare no meio provavelmente contribui) -- 900s alinha
        # com a mesma ordem de grandeza que zap/nuclei levaram na pratica.
        await asyncio.wait_for(proc.wait(), timeout=900)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        # ver comentario em current_job_procs -- proc.kill() sozinho nao
        # mata o container Docker, so' o cliente 'docker run' local.
        await docker_kill(container_name)
        print(f'[nmap] timeout de 900s atingido contra {host}, processo morto — XML pode estar incompleto', flush=True)

    findings = []
    if os.path.exists(host_output_path):
        findings = normalize_nmap_xml(host_output_path, str(uuid.uuid4()))
        os.remove(host_output_path)

    return findings


def normalize_nikto_xml(xml_path: str, base_url: str) -> list[dict]:
    """Nikto nao classifica severidade (era OSVDB, descontinuado) -- tudo
    entra como 'info', triagem manual decide o que importa. matched_url é
    reconstruído a partir da URL original + o path que o Nikto reportou
    (mais confiável que os atributos targetip/targethostname do XML, que
    nem sempre trazem o scheme certo)."""
    root = ET.parse(xml_path).getroot()
    findings = []
    for item in root.findall('.//item'):
        desc_el = item.find('description')
        uri_el = item.find('uri')
        description = (desc_el.text or '').strip() if desc_el is not None else ''
        uri = (uri_el.text or '').strip() if uri_el is not None else ''
        findings.append({
            'name': (description[:200] or 'Achado Nikto'),
            'severity': 'info',
            'matched_url': f"{base_url.rstrip('/')}{uri}" if uri else base_url,
            'http_method': item.get('method') or 'GET',
            'param': None,
            'attack_payload': None,
            'evidence': None,
            'description': description,
            'remediation': None,
            'engine': 'nikto',
            'raw_output': {
                'id': item.get('id'),
                'osvdbid': item.get('osvdbid'),
                'osvdblink': item.get('osvdblink'),
                'uri': uri,
            },
        })
    return findings


async def run_nikto(url: str, level: str = 'intermediate') -> list:
    """Roda o Nikto via Docker contra uma URL -- fingerprint de versao de
    servidor, arquivos/paths perigosos conhecidos, headers inseguros.
    Complementar ao Nmap (porta/servico) e ao ZAP/Nuclei (ataque ativo).

    Duas flags obrigatorias descobertas via docker run manual:
    -w /nikto     -- o valor padrao de NIKTODTD e relativo ("docs/nikto.dtd")
                     e so resolve certo se o workdir for /nikto (onde o .dtd
                     de fato mora na imagem). Sem isso: "+ ERROR: reading DTD".
    --user root   -- a imagem roda como usuario 'nikto' por padrao, sem
                     permissao de escrita no volume montado. Sem isso:
                     "Unable to open '...' for write".

    Nível "basic" exclui categorias de teste mais arriscadas via -Tuning
    (upload/DoS/exec/SQLi) -- mantem o resto. "advanced" so acelera o pace
    (pause menor), mesma cobertura de teste do padrao.
    """
    run_id = uuid.uuid4().hex[:8]
    output_file = f'nikto_{run_id}.xml'
    host_output_path = os.path.join(NIKTO_OUTPUT_DIR, output_file)
    container_output_path = f'/output/{output_file}'
    pause = NIKTO_PAUSE_ADVANCED if level == 'advanced' else NIKTO_PAUSE
    container_name = f'nikto-{run_id}'

    cmd = [
        'docker', 'run', '--rm',
        '--name', container_name,
        '-w', '/nikto',
        '--user', 'root',
        '-v', f'{NIKTO_OUTPUT_DIR}:/output',
        'alpine/nikto',
        '-h', url,
        '-Pause', pause,
        '-Format', 'xml',
        '-output', container_output_path,
    ]
    if level == 'basic':
        cmd += ['-Tuning', NIKTO_TUNING_BASIC]
    print(f'[nikto] level={level} -> pause={pause} tuning={NIKTO_TUNING_BASIC if level == "basic" else "completo"}', flush=True)

    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
    current_job_procs.append({'proc': proc, 'container_name': container_name})
    try:
        # ~6700 assinaturas padrao * pausa gentil pode legitimamente passar
        # dos 900s usados pelos outros engines -- 1800s (30min) da margem
        # sem deixar rodar pra sempre.
        await asyncio.wait_for(proc.wait(), timeout=1800)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        # ver comentario em current_job_procs -- proc.kill() sozinho nao
        # mata o container Docker, so' o cliente 'docker run' local.
        await docker_kill(container_name)
        print(f'[nikto] timeout de 1800s atingido contra {url}, processo morto — XML pode estar incompleto', flush=True)

    findings = []
    if os.path.exists(host_output_path):
        try:
            findings = normalize_nikto_xml(host_output_path, url)
        except ET.ParseError as e:
            print(f'[nikto] erro ao parsear XML de {url}: {e}', flush=True)
        os.remove(host_output_path)

    return findings


async def run_network_discovery(subnet: str) -> list[dict]:
    """Descoberta de rede local (shadow IT) -- varre a subnet informada com
    ping sweep + scripts de broadcast (mDNS/SSDP/IGMP/etc).

    --network host é obrigatorio aqui: sem isso o container só enxerga a
    bridge interna do Docker (172.17.0.0/16), nunca a LAN real da VM --
    confirmado em teste manual (scripts de broadcast rodavam contra o gateway
    do Docker, não a rede 192.168.100.0/24 de verdade). Diferente do
    run_nmap() de alvo remoto, que não precisa disso.
    """
    run_id = uuid.uuid4().hex[:8]
    output_file = f'discovery_{run_id}.xml'
    host_output_path = os.path.join(NMAP_OUTPUT_DIR, output_file)
    container_output_path = f'/output/{output_file}'
    container_name = f'discovery-{run_id}'

    cmd = [
        'docker', 'run', '--rm',
        '--name', container_name,
        '--network', 'host',
        '-v', f'{NMAP_OUTPUT_DIR}:/output',
        'instrumentisto/nmap:latest',
        NMAP_TIMING,
        '-sn',  # ping sweep -- só descoberta de host, sem varrer portas
        '--script=broadcast',
        '-oX', container_output_path,
        subnet,
    ]

    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
    try:
        await asyncio.wait_for(proc.wait(), timeout=900)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        # ver comentario em current_job_procs -- proc.kill() sozinho nao
        # mata o container Docker, so' o cliente 'docker run' local. Nao
        # rastreado em current_job_procs de proposito (compartilhado com a
        # fila do Shadow IT), mas o bug do kill vale igual aqui.
        await docker_kill(container_name)
        print(f'[discovery] timeout de 900s atingido em {subnet}, processo morto', flush=True)

    hosts: list[dict] = []
    if not os.path.exists(host_output_path):
        return hosts
    try:
        root = ET.parse(host_output_path).getroot()
        for host_el in root.findall('host'):
            status = host_el.find('status')
            if status is None or status.get('state') != 'up':
                continue
            ip = None
            for addr in host_el.findall('address'):
                if addr.get('addrtype') in ('ipv4', 'ipv6'):
                    ip = addr.get('addr')
                    break
            hostname = None
            hn = host_el.find('.//hostnames/hostname')
            if hn is not None:
                hostname = hn.get('name')
            if ip:
                # 'hostname' explicito (nao só o fallback já colapsado em
                # 'subdomain') -- run_scan_job usa isso pra decidir se a
                # linha vai pro DAST (resolveu nome) ou pro Shadow IT (só
                # IP, sem registro em DNS interno).
                hosts.append({'subdomain': hostname or ip, 'hostname': hostname, 'ip': ip,
                               'scope': 'internal', 'source': 'nmap'})
    except ET.ParseError as e:
        print(f'[discovery] erro ao parsear XML de {subnet}: {e}', flush=True)
    finally:
        os.remove(host_output_path)

    return hosts
