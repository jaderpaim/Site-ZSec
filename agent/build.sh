#!/bin/bash
# Gera os binários do agente em dist/.
#   ./build.sh 0.1.0
set -euo pipefail
cd "$(dirname "$0")"
VERSION="${1:-0.1.0}"
LD="-s -w -X main.version=$VERSION"
rm -rf dist && mkdir -p dist

# Windows: -H=windowsgui = sem janela de console na sessão do usuário.
GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "$LD -H=windowsgui" -o dist/windows-amd64/zsec-agent.exe ./cmd/zsec-agent
GOOS=windows GOARCH=arm64 go build -trimpath -ldflags "$LD -H=windowsgui" -o dist/windows-arm64/zsec-agent.exe ./cmd/zsec-agent
# Versão com console, só pra diagnóstico (watch/identity/inventory/send-test).
GOOS=windows GOARCH=amd64 go build -trimpath -ldflags "$LD" -o dist/windows-amd64/zsec-agent-cli.exe ./cmd/zsec-agent

# macOS: binário universal (Intel + Apple Silicon).
GOOS=darwin GOARCH=amd64 go build -trimpath -ldflags "$LD" -o dist/zsec-agent-darwin-amd64 ./cmd/zsec-agent
GOOS=darwin GOARCH=arm64 go build -trimpath -ldflags "$LD" -o dist/zsec-agent-darwin-arm64 ./cmd/zsec-agent
mkdir -p dist/macos
lipo -create -output dist/macos/zsec-agent dist/zsec-agent-darwin-amd64 dist/zsec-agent-darwin-arm64
rm dist/zsec-agent-darwin-*

echo "ok: dist/ (versão $VERSION) — lembre de assinar antes de distribuir (ver README)."
