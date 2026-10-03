// Coleta específica de cada sistema operacional. Cada SO implementa as mesmas
// funções em platform_<goos>.go; tudo aqui é só leitura.
package platform

import (
	"context"
	"os/exec"
	"strings"
	"time"
)

type Foreground struct {
	PID      int
	Path     string // caminho do executável (Windows) ou nome do app (macOS)
	BundleID string // só macOS
	AppName  string
}

// ProcNet são contadores ACUMULADOS de um processo; quem usa calcula o delta
// entre duas leituras.
//
//	macOS:   bytes de rede externa (nettop -t external) — exato.
//	Windows: contadores de I/O do processo (GetProcessIoCounters), só dos
//	         processos com conexão TCP externa estabelecida. Inclui I/O de
//	         disco também, então é uma aproximação — o limiar é calibrado
//	         separadamente. (Fase seguinte: ETW Kernel-Network num serviço.)
type ProcNet struct {
	PID  int
	Path string
	In   uint64
	Out  uint64
}

type User struct {
	OSUser string `json:"os_user"`
	Domain string `json:"domain,omitempty"`
	// Identidades corporativas candidatas (UPN, e-mail). O servidor escolhe.
	Identities []string `json:"identities,omitempty"`
}

type Device struct {
	ID        string `json:"id"`
	Hostname  string `json:"hostname"`
	OS        string `json:"os"`
	OSVersion string `json:"os_version"`
	Arch      string `json:"arch"`
}

type InstalledApp struct {
	Name     string `json:"name"`
	BundleID string `json:"bundle_id,omitempty"`
	Version  string `json:"version,omitempty"`
	Source   string `json:"source"` // registry | msix | applications
}

// run executa um comando curto e devolve o stdout. Timeout fixo pra nunca
// travar o loop de amostragem.
func run(timeout time.Duration, name string, args ...string) (string, error) {
	ctx, cancel := context.WithTimeout(context.Background(), timeout)
	defer cancel()
	cmd := exec.CommandContext(ctx, name, args...)
	hideWindow(cmd)
	out, err := cmd.Output()
	return string(out), err
}

// FilterIdentities mantém só identidades do domínio corporativo (minúsculas,
// sem duplicata). Sem domínio configurado, mantém tudo que parece e-mail.
func FilterIdentities(ids []string, domain string) []string {
	seen := map[string]bool{}
	var out []string
	for _, id := range ids {
		id = strings.ToLower(strings.TrimSpace(id))
		at := strings.LastIndex(id, "@")
		if at <= 0 || seen[id] {
			continue
		}
		if domain != "" && id[at+1:] != domain {
			continue
		}
		seen[id] = true
		out = append(out, id)
	}
	return out
}
