#!/bin/bash
# Instala o agente Z-Sec no macOS (rodar como root / via MDM).
#   sudo ./install.sh ./zsec-agent ./config.json
set -euo pipefail

BIN="${1:?uso: install.sh <zsec-agent> <config.json>}"
CFG="${2:?uso: install.sh <zsec-agent> <config.json>}"
DIR="/Library/Application Support/ZSecAgent"
PLIST="/Library/LaunchAgents/br.com.zsec.agent.plist"
HERE="$(cd "$(dirname "$0")" && pwd)"

mkdir -p "$DIR"
install -m 0755 -o root -g wheel "$BIN" "$DIR/zsec-agent"
install -m 0644 -o root -g wheel "$CFG" "$DIR/config.json"
install -m 0644 -o root -g wheel "$HERE/br.com.zsec.agent.plist" "$PLIST"

# Sobe já para o usuário logado (os demais pegam no próximo login).
CONSOLE_USER="$(stat -f %Su /dev/console)"
if [ -n "$CONSOLE_USER" ] && [ "$CONSOLE_USER" != "root" ]; then
  UID_="$(id -u "$CONSOLE_USER")"
  launchctl bootout "gui/$UID_" "$PLIST" 2>/dev/null || true
  launchctl bootstrap "gui/$UID_" "$PLIST"
fi
echo "ZSecAgent instalado."
