import re
import xml.etree.ElementTree as ET

CVE_PATTERN = re.compile(r'CVE-\d{4}-\d{4,7}')


def map_zap_risk(risk: str) -> str:
    return {'High': 'critical', 'Medium': 'medium',
            'Low': 'low', 'Informational': 'info'}.get(risk, 'info')


OWASP_TAG_PATTERN = re.compile(r'^OWASP_(\d{4})_(A\d{2})$')


def extract_owasp_category(tags: dict) -> str | None:
    """As tags do ZAP trazem a mesma fraqueza reclassificada em varios anos
    ao mesmo tempo (ex.: OWASP_2017_A05, OWASP_2021_A01, OWASP_2025_A01
    coexistindo no mesmo alerta) -- pega a classificacao do ano mais
    recente presente. Formato: "A01:2021"."""
    if not isinstance(tags, dict):
        return None
    matches = [(m.group(1), m.group(2)) for k in tags if (m := OWASP_TAG_PATTERN.match(k))]
    if not matches:
        return None
    year, code = max(matches, key=lambda m: m[0])
    return f'{code}:{year}'


def normalize_zap(alert: dict) -> dict:
    other_info = (alert.get('otherinfo') or '').strip()
    description = alert.get('description') or ''
    # otherinfo do ZAP costuma trazer o dado mais especifico que falta hoje
    # (ex.: no "Vulnerable JS Library"/Retire.js, lista os CVEs da versao
    # exata da lib detectada) -- description sozinha e generica, so descreve
    # a classe do problema.
    if other_info and other_info not in description:
        description = f'{description}\n\n{other_info}'.strip()
    cve_matches = CVE_PATTERN.findall(other_info) or CVE_PATTERN.findall(description)

    return {
        'name': alert.get('alert'),
        'severity': map_zap_risk(alert.get('risk', '')),
        # owasp_category nunca era preenchido pra nenhum engine -- a UI ja
        # tinha um lugar pra mostrar isso, so nunca recebia dado (confirmado
        # auditando os 3 normalizadores). O ZAP ja manda essa classificacao
        # pronta em tags, so faltava ler.
        'owasp_category': extract_owasp_category(alert.get('tags') or {}),
        'cve_id': cve_matches[0] if cve_matches else None,
        'confidence': alert.get('confidence'),
        'matched_url': alert.get('url'),
        'http_method': alert.get('method', 'GET'),
        'param': alert.get('param'),
        'attack_payload': alert.get('attack'),
        'evidence': alert.get('evidence'),
        'description': description or None,
        'remediation': alert.get('solution'),
        'reference': alert.get('reference') or None,
        'engine': 'zap',
        'raw_output': alert,
    }


def normalize_nuclei(f: dict) -> dict:
    info = f.get('info', {})
    clf = info.get('classification', {})
    return {
        'name': info.get('name'),
        'severity': info.get('severity'),
        'cvss_score': clf.get('cvss-score'),
        'cve_id': (clf.get('cve-id') or [None])[0],
        'matched_url': f.get('matched-at'),
        'http_method': 'GET',
        'param': None,
        'attack_payload': f.get('curl-command'),
        'evidence': (f.get('extracted-results') or [''])[0],
        'description': info.get('description'),
        'remediation': info.get('remediation'),
        'reference': '; '.join(info.get('reference') or []) or None,
        'engine': 'nuclei',
        'raw_output': f,
    }


# Portas consideradas sensiveis quando expostas -- ajustam a severidade
# de "info" (padrao) para algo que mereca atencao no dashboard
SENSITIVE_PORTS = {
    22: 'low', 3389: 'medium', 3306: 'medium', 5432: 'medium',
    1433: 'medium', 6379: 'high', 27017: 'high', 9200: 'high',
    21: 'low', 23: 'high',
}


def normalize_nmap_xml(xml_path: str, scan_id: str) -> list:
    """Faz parse do XML do Nmap (-oX) e devolve uma lista de achados
    normalizados, um por porta aberta encontrada."""
    findings = []
    try:
        tree = ET.parse(xml_path)
        root = tree.getroot()
        for host in root.findall('host'):
            addr_el = host.find('address')
            target_ip = addr_el.get('addr') if addr_el is not None else None
            ports_el = host.find('ports')
            if ports_el is None:
                continue
            for port in ports_el.findall('port'):
                state = port.find('state')
                if state is None or state.get('state') != 'open':
                    continue
                portid = int(port.get('portid'))
                proto = port.get('protocol')
                service_el = port.find('service')
                service_name = service_el.get('name') if service_el is not None else 'unknown'
                product = service_el.get('product', '') if service_el is not None else ''
                version = service_el.get('version', '') if service_el is not None else ''
                evidence = f"{product} {version}".strip()

                findings.append({
                    'name': f'Porta aberta: {portid}/{proto} ({service_name})',
                    'severity': SENSITIVE_PORTS.get(portid, 'info'),
                    'cvss_score': None,
                    'cve_id': None,
                    'matched_url': target_ip,
                    'http_method': None,
                    'param': str(portid),
                    'attack_payload': None,
                    'evidence': evidence or None,
                    'description': f'Servico {service_name} detectado na porta {portid}/{proto}.',
                    'remediation': 'Confirmar se essa porta/servico deveria estar acessivel externamente.',
                    'engine': 'nmap',
                    'raw_output': {'port': portid, 'protocol': proto, 'service': service_name,
                                    'product': product, 'version': version},
                })
    except Exception as e:
        print(f"Erro ao parsear XML do nmap: {e}")
    return findings
