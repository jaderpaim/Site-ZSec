#!/bin/bash
# Remove o agente Z-Sec do macOS (rodar como root).
PLIST="/Library/LaunchAgents/br.com.zsec.agent.plist"
CONSOLE_USER="$(stat -f %Su /dev/console)"
[ -n "$CONSOLE_USER" ] && launchctl bootout "gui/$(id -u "$CONSOLE_USER")" "$PLIST" 2>/dev/null
rm -f "$PLIST"
rm -rf "/Library/Application Support/ZSecAgent"
echo "ZSecAgent removido. (Spool por usuário fica em ~/Library/Application Support/ZSecAgent)"
