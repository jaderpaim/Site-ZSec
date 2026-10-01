import asyncio
import json
import os
import uuid
import xml.etree.ElementTree as ET
from urllib.parse import urlsplit

import httpx
from dotenv import load_dotenv

from normalizers import normalize_nmap_xml

# Defensivo: nao depende da ordem de import em main.py (ja mordemos esse
# bug uma vez -- ZAP_KEY travando em None porque load_dotenv() rodava
# depois do import deste modulo).
load_dotenv()

ZAP_KEY = os.getenv('ZAP_API_KEY')
ZAP_URL = 'http://127.0.0.1:8080'

NUCLEI_TEMPLATES_CONFIG = '/root/scanner-data/nuclei-config'
NUCLEI_TEMPLATES_DIR = '/root/scanner-data/nuclei-templates'
NUCLEI_OUTPUT_DIR = '/root/scanner-data/nuclei-output'

TMP = '/opt/scanner/tmp'


# Policy separada da 'Default Policy' global, so' pro /retest -- precisa ser
# named policy (nao mexer na policy default) porque /retest nao passa pela
# fila serial do scan_queue, pode rodar concorrente com um scan de verdade
# em curso (que usa a policy default compartilhada). Reconfigurada a cada
# chamada (disableAll + enable so' do plugin_id do achado).
RETEST_SCAN_POLICY_NAME = 'retest-scoped'


async def _ensure_retest_scoped_policy(c: httpx.AsyncClient, plugin_id: str) -> None:
    """Deixa a policy 'retest-scoped' com APENAS plugin_id habilitado.

    Sem isso, ascan/action/scan (sem scanPolicyName) roda a bateria inteira
    da Default Policy (~50 regras: XSS, SSRF, Command Injection, Heartbleed
    etc.) contra a URL, mesmo quando so' UMA regra especifica interessa --
    confirmado em producao (2026-09-29): retest de 1 achado de SQLi levou
    542s rodando regra por regra sem relacao nenhuma com SQLi."""
    await c.get(f'{ZAP_URL}/JSON/ascan/action/addScanPolicy/', params={
        'apikey': ZAP_KEY, 'scanPolicyName': RETEST_SCAN_POLICY_NAME,
    })  # idempotente -- ZAP ignora se a policy ja existir
    await c.get(f'{ZAP_URL}/JSON/ascan/action/disableAllScanners/', params={
        'apikey': ZAP_KEY, 'scanPolicyName': RETEST_SCAN_POLICY_NAME,
    })
    await c.get(f'{ZAP_URL}/JSON/ascan/action/enableScanners/', params={
        'apikey': ZAP_KEY, 'ids': plugin_id, 'scanPolicyName': RETEST_SCAN_POLICY_NAME,
    })


async def retest_zap(matched_url: str, param: str, method: str, plugin_id: str | None = None) -> dict:
    """Refaz o active scan do ZAP so pra essa URL/parametro especifico,
    sem precisar rodar o scan completo de novo.

    Usa core/action/sendRequest (metodo arbitrario) em vez de accessUrl (GET
    fixo) pra "reaprender" a URL antes do ascan/action/scan -- confirmado em
    producao (2026-09-29) que accessUrl NAO basta pra achado descoberto via
    POST: ele registra uma entrada GET na arvore de sites do ZAP, mas
    ascan/action/scan com method=POST procura por uma entrada POST
    especifica e nao acha ("url_not_found" / "URL Not Found in the Scan
    Tree", HTTP 400) -- a sessao do ZAP e' resetada por alvo durante scans
    bulk (ver newSession em run_scan_job do main.py), entao qualquer achado
    de scan anterior perde a entrada correspondente na arvore atual. Achado
    via GET tambem funciona com sendRequest, sem regressao.

    plugin_id (raw_output.pluginId do achado original) escopa o ascan pra
    testar so' aquela regra -- ver _ensure_retest_scoped_policy. Se vier
    None (achado antigo sem esse campo, ou engine != zap chamando por
    engano), cai pro comportamento antigo: roda a Default Policy inteira."""
    method = (method or 'GET').upper()
    host = urlsplit(matched_url).netloc
    raw_request = f'{method} {matched_url} HTTP/1.1\r\nHost: {host}\r\n\r\n'

    async with httpx.AsyncClient(timeout=120) as c:
        primed = await c.get(f'{ZAP_URL}/JSON/core/action/sendRequest/',
                              params={'apikey': ZAP_KEY, 'request': raw_request,
                                      'followRedirects': 'true'})
        if primed.status_code != 200:
            raise RuntimeError(
                f'sendRequest falhou preparando {method} {matched_url} '
                f'(HTTP {primed.status_code}): {primed.text[:300]}')

        scan_params = {'apikey': ZAP_KEY, 'url': matched_url,
                        'recurse': 'false', 'method': method}
        if plugin_id:
            await _ensure_retest_scoped_policy(c, plugin_id)
            scan_params['scanPolicyName'] = RETEST_SCAN_POLICY_NAME

        r = await c.get(f'{ZAP_URL}/JSON/ascan/action/scan/', params=scan_params)
        body = r.json()
        if 'scan' not in body:
            # Nunca deixa isso virar KeyError->500 puro -- mensagem melhor
            # pro usuario entender que e' o ZAP recusando, nao um bug cego.
            raise RuntimeError(
                f'ZAP recusou o ascan/action/scan pra {method} {matched_url}: {body}')
        sid = body['scan']
        for _ in range(30):
            await asyncio.sleep(4)
            s = await c.get(f'{ZAP_URL}/JSON/ascan/view/status/',
                             params={'apikey': ZAP_KEY, 'scanId': sid})
            if s.json()['status'] == '100':
                break
        alerts = await c.get(f'{ZAP_URL}/JSON/core/view/alerts/',
                              params={'apikey': ZAP_KEY, 'baseurl': matched_url})
        found = any(a.get('param') == param
                    for a in alerts.json().get('alerts', []))
    return {'still_vulnerable': found}


async def retest_nuclei(matched_url: str, template_id: str) -> dict:
    """Reexecuta um template especifico do Nuclei via Docker, so contra
    a URL que ja tinha sido flagada -- nao precisa rodar o conjunto todo."""
    run_id = uuid.uuid4().hex[:8]
    output_file = f'retest_{run_id}.json'
    host_output_path = os.path.join(NUCLEI_OUTPUT_DIR, output_file)
    container_output_path = f'/output/{output_file}'

    cmd = [
        'docker', 'run', '--rm',
        '-v', f'{NUCLEI_TEMPLATES_CONFIG}:/root/.config/nuclei',
        '-v', f'{NUCLEI_TEMPLATES_DIR}:/root/nuclei-templates',
        '-v', f'{NUCLEI_OUTPUT_DIR}:/output',
        'projectdiscovery/nuclei:latest',
        '-u', matched_url,
        '-id', template_id,
        '-json-export', container_output_path,
        '-silent',
    ]

    proc = await asyncio.create_subprocess_exec(
        *cmd, stdout=asyncio.subprocess.DEVNULL, stderr=asyncio.subprocess.DEVNULL)
    try:
        await asyncio.wait_for(proc.wait(), timeout=90)
    except asyncio.TimeoutError:
        proc.kill()

    still_vulnerable = False
    try:
        # -json-export escreve um array JSON unico (Nuclei v3), nao JSONL --
        # contar linhas sempre dava >=1 mesmo com achados=0 (arquivo "[]"
        # ainda tem 1 linha), fazendo o retest reportar "ainda vulneravel"
        # pra sempre. Mesmo bug ja corrigido no run_nuclei() do main.py.
        with open(host_output_path) as f:
            data = json.load(f)
        still_vulnerable = len(data) > 0
    except (FileNotFoundError, json.JSONDecodeError):
        still_vulnerable = False
    finally:
        if os.path.exists(host_output_path):
            os.remove(host_output_path)

    return {'still_vulnerable': still_vulnerable}
