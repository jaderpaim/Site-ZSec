#!/usr/bin/env bash
#
# Provisiona do zero, numa VM Ubuntu 24.04 limpa, o motor DAST + Shadow IT
# usado pelo b-security: ZAP (container Docker com volume persistente +
# add-ons de marketplace) + scanner-api (FastAPI, systemd), que também
# concentra Nuclei/Nmap/Amass/Nikto (todos via docker run sob demanda) e a
# descoberta de apps internos via LDAP (adidnsdump, dentro da venv) --
# tudo no mesmo processo/serviço, não são instalações separadas.
#
# Reproduz o estado real confirmado em produção em 2026-09-28 (VM
# bnlsrvvsesi).
#
# Uso: sudo bash install.sh
set -euo pipefail

if [[ $EUID -ne 0 ]]; then
  echo "Rode como root: sudo bash install.sh" >&2
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SCANNER_DIR=/opt/scanner
ZAP_HOME=/opt/zap-home
BASE_DATA_DIR=/root/scanner-data   # mesmo caminho fixo lido de main.py (BASE_DATA)
ZAP_CONTAINER_NAME=zap
ZAP_IMAGE=ghcr.io/zaproxy/zaproxy:stable
ZAP_PORT=8080

# Add-ons instalados manualmente via marketplace do ZAP (ver
# scripts/dast-provisioning/README.md) -- fora do bootstrap padrão da
# imagem, precisam ser reinstalados a cada recriação do container.
ZAP_ADDONS=(
  sqliplugin
  retire
  authhelper
  authstats
  wappalyzer
  tokengen
  paramdigger
  attacksurfacedetector
  directorylistv2_3
  fuzzdb
  fuzzdboffensive
  ascanrulesBeta
  pscanrulesBeta
  spiderAjax
  bruteforce
  openapi
  postman
  graphql
  soap
)

log()  { echo -e "\n\033[1;36m==>\033[0m $*"; }
warn() { echo -e "\033[1;33m[aviso]\033[0m $*" >&2; }

prompt() {
  # prompt <var_name> <texto> [default]
  local __var="$1" __text="$2" __default="${3:-}" __val
  if [[ -n "$__default" ]]; then
    read -r -p "$__text [$__default]: " __val
    __val="${__val:-$__default}"
  else
    read -r -p "$__text: " __val
  fi
  printf -v "$__var" '%s' "$__val"
}

prompt_secret() {
  # prompt_secret <var_name> <texto>
  local __var="$1" __text="$2" __val
  read -r -s -p "$__text: " __val
  echo
  printf -v "$__var" '%s' "$__val"
}

# ---------------------------------------------------------------------------
log "1/9 - Pacotes base e Docker Engine"
# ---------------------------------------------------------------------------
apt-get update -y
apt-get install -y ca-certificates curl gnupg openssl \
  python3-venv python3-pip build-essential libssl-dev libffi-dev libkrb5-dev \
  samba-common-bin  # nmblookup -- usado no NetBIOS lookup do Shadow IT (run_netbios)

if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  # shellcheck disable=SC1091
  . /etc/os-release
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu ${VERSION_CODENAME} stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

# ---------------------------------------------------------------------------
log "2/9 - Segredos (nada fica gravado neste script nem no repositório)"
# ---------------------------------------------------------------------------
DEFAULT_ZAP_KEY="$(openssl rand -hex 16)"
prompt ZAP_API_KEY "Chave de API do ZAP (Enter para gerar uma nova)" "$DEFAULT_ZAP_KEY"
prompt SUPABASE_URL "SUPABASE_URL"
prompt_secret SUPABASE_SERVICE_ROLE_KEY "SUPABASE_SERVICE_ROLE_KEY"
prompt CF_ACCESS_CLIENT_ID "CF_ACCESS_CLIENT_ID (vazio se não usar Cloudflare Access)"
prompt_secret CF_ACCESS_CLIENT_SECRET "CF_ACCESS_CLIENT_SECRET (vazio se não usar)"
prompt_secret SCANNER_API_SECRET "SCANNER_API_SECRET (segredo que o app usa pra chamar essa API)"
prompt_secret HOOK_SECRET "HOOK_SECRET (webhook sek-worker/sync)"
prompt APP_CALLBACK_URL "APP_CALLBACK_URL (URL do b-security que recebe callback de progresso)"
prompt SHADOWIT_CALLBACK_URL "SHADOWIT_CALLBACK_URL"
prompt SERVER_CN "CN do certificado TLS auto-assinado (IP ou hostname da VM)" "$(hostname -I | awk '{print $1}')"

# ---------------------------------------------------------------------------
log "3/9 - Container ZAP (volume persistente + --init + heap 8GB)"
# ---------------------------------------------------------------------------
mkdir -p "$ZAP_HOME/scripts"
cp "$SCRIPT_DIR"/app/zap-scripts/zap_block_heavy_media.js "$ZAP_HOME/scripts/zap_block_heavy_media.js"

if docker ps -a --format '{{.Names}}' | grep -qx "$ZAP_CONTAINER_NAME"; then
  warn "Container '$ZAP_CONTAINER_NAME' já existe -- removendo pra recriar com a config atual."
  docker rm -f "$ZAP_CONTAINER_NAME" >/dev/null
fi

docker pull "$ZAP_IMAGE"

# --init: sem isso o Java (PID 1) não reaptura processos órfãos deixados
# pelo Ajax Spider/Crawljax quando um browser trava -- causou 814 zumbis
# em produção antes desse fix (ver memória do projeto).
# Volume: sem ele, qualquer recriação do container apaga o pack de
# add-ons instalado manualmente pelo marketplace.
docker run -d \
  --name "$ZAP_CONTAINER_NAME" \
  --init \
  --restart always \
  -p 127.0.0.1:${ZAP_PORT}:${ZAP_PORT} \
  -v "${ZAP_HOME}:/home/zap/.ZAP" \
  "$ZAP_IMAGE" \
  zap.sh -Xmx8192m -daemon -host 0.0.0.0 -port ${ZAP_PORT} \
    -config api.key="${ZAP_API_KEY}" \
    -config api.addrs.addr.name=.* \
    -config api.addrs.addr.regex=true \
    -config scanner.delayInMs=200 \
    -config database.response.bodysize=104857600 \
    -config database.request.bodysize=104857600

log "Aguardando a API do ZAP subir..."
for i in $(seq 1 30); do
  if curl -sk -m 3 "http://127.0.0.1:${ZAP_PORT}/JSON/core/view/version/?apikey=${ZAP_API_KEY}" | grep -q version; then
    echo "ZAP no ar."
    break
  fi
  [[ $i -eq 30 ]] && { echo "ZAP não respondeu a tempo. Confira: docker logs ${ZAP_CONTAINER_NAME}" >&2; exit 1; }
  sleep 3
done

# ---------------------------------------------------------------------------
log "4/9 - Add-ons do marketplace ZAP"
# ---------------------------------------------------------------------------
for addon in "${ZAP_ADDONS[@]}"; do
  echo "Instalando add-on: $addon"
  curl -sk -m 30 "http://127.0.0.1:${ZAP_PORT}/JSON/autoupdate/action/installAddon/?apikey=${ZAP_API_KEY}&id=${addon}" \
    -w " [HTTP:%{http_code}]\n" || warn "Falha instalando $addon -- confira manualmente pelo marketplace do ZAP."
  sleep 1
done

# ---------------------------------------------------------------------------
log "5/9 - Diretórios de dados e imagens dos engines via docker run sob demanda"
# ---------------------------------------------------------------------------
# Nuclei (DAST), Amass/Nmap/Nikto (Shadow IT + varredura de host) -- nenhum
# desses roda como serviço nem precisa de binário local, main.py invoca
# 'docker run --rm ...' a cada execução.
mkdir -p "${BASE_DATA_DIR}/nuclei-config" "${BASE_DATA_DIR}/nuclei-templates" "${BASE_DATA_DIR}/nuclei-output" \
         "${BASE_DATA_DIR}/amass-output" "${BASE_DATA_DIR}/nmap-output" "${BASE_DATA_DIR}/nikto-output"
docker pull projectdiscovery/nuclei:latest
docker pull caffix/amass:latest
docker pull instrumentisto/nmap:latest
docker pull alpine/nikto

# ---------------------------------------------------------------------------
log "6/9 - Aplicação (venv + código)"
# ---------------------------------------------------------------------------
mkdir -p "$SCANNER_DIR"/{certs,tmp}
cp "$SCRIPT_DIR"/app/main.py "$SCRIPT_DIR"/app/normalizers.py "$SCRIPT_DIR"/app/retest.py "$SCANNER_DIR"/

python3 -m venv "$SCANNER_DIR/venv"
"$SCANNER_DIR/venv/bin/pip" install --upgrade pip
"$SCANNER_DIR/venv/bin/pip" install -r "$SCRIPT_DIR/requirements.txt"
"$SCANNER_DIR/venv/bin/python" -m playwright install --with-deps chromium

chown -R root:docker "$SCANNER_DIR/venv"

# ---------------------------------------------------------------------------
log "7/9 - Certificado TLS auto-assinado"
# ---------------------------------------------------------------------------
if [[ ! -f "$SCANNER_DIR/certs/cert.pem" ]]; then
  openssl req -x509 -newkey rsa:4096 -nodes \
    -keyout "$SCANNER_DIR/certs/key.pem" \
    -out "$SCANNER_DIR/certs/cert.pem" \
    -days 3650 \
    -subj "/CN=${SERVER_CN}"
  chmod 600 "$SCANNER_DIR/certs/key.pem"
else
  warn "Certificado já existe em $SCANNER_DIR/certs -- mantendo o atual."
fi

# ---------------------------------------------------------------------------
log "8/9 - .env"
# ---------------------------------------------------------------------------
cat > "$SCANNER_DIR/.env" <<EOF
SUPABASE_URL=${SUPABASE_URL}
SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
CF_ACCESS_CLIENT_ID=${CF_ACCESS_CLIENT_ID}
CF_ACCESS_CLIENT_SECRET=${CF_ACCESS_CLIENT_SECRET}
ZAP_API_KEY=${ZAP_API_KEY}
SCANNER_API_SECRET=${SCANNER_API_SECRET}
HOOK_SECRET=${HOOK_SECRET}
APP_CALLBACK_URL=${APP_CALLBACK_URL}
SHADOWIT_CALLBACK_URL=${SHADOWIT_CALLBACK_URL}
EOF
chown root:docker "$SCANNER_DIR/.env"
chmod 600 "$SCANNER_DIR/.env"

# ---------------------------------------------------------------------------
log "9/9 - systemd (scanner-api.service)"
# ---------------------------------------------------------------------------
cat > /etc/systemd/system/scanner-api.service <<EOF
[Unit]
Description=Scanner API - FastAPI (ZAP/Nuclei orchestration)
After=network.target docker.service
Requires=docker.service

[Service]
Type=simple
User=root
WorkingDirectory=${SCANNER_DIR}
Environment="PYTHONUNBUFFERED=1"
ExecStart=${SCANNER_DIR}/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000 --workers 1 --ssl-keyfile=${SCANNER_DIR}/certs/key.pem --ssl-certfile=${SCANNER_DIR}/certs/cert.pem
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable --now scanner-api

log "Pronto."
echo "Status do serviço:"
systemctl status scanner-api --no-pager -l | head -10
echo
echo "Acompanhe o boot com: journalctl -u scanner-api -f"
echo "A configuração de política de scan do ZAP (regras desabilitadas, threads, max-duration)"
echo "é aplicada automaticamente pelo próprio scanner-api ao subir (lifespan em main.py)."
