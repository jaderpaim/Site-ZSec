// Configuração do agente. Um arquivo JSON por máquina, distribuído junto com
// o instalador (GPO/Intune/MDM):
//
//	Windows: %ProgramData%\ZSecAgent\config.json
//	macOS:   /Library/Application Support/ZSecAgent/config.json
//
// ZSEC_AGENT_CONFIG ou -config sobrescrevem o caminho (útil pra teste).
package config

import (
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

type Config struct {
	// URL completa do endpoint de ingest do Z-Sec.
	ServerURL string `json:"server_url"`
	// Chave de ingestão (zagent_...). Só permite ENVIAR uso — não lê nada.
	IngestKey string `json:"ingest_key"`
	// Domínio corporativo: só identidades (UPN/e-mail) deste domínio são
	// aceitas como nome do usuário. Evita pegar e-mail pessoal do Office no Mac.
	CorporateDomain string `json:"corporate_domain"`
	// Força o nome do usuário (ex.: "jader.paim"). Normalmente vazio.
	UserName string `json:"user_name,omitempty"`

	SampleSeconds    int `json:"sample_seconds,omitempty"`     // amostragem do app em foco
	FlushSeconds     int `json:"flush_seconds,omitempty"`      // envio para o servidor
	IdleSeconds      int `json:"idle_seconds,omitempty"`       // acima disso, usuário ausente
	MinBucketSeconds int `json:"min_bucket_seconds,omitempty"` // uso mínimo na hora pra contar

	// Sinal de rede: um minuto conta como uso de um app se os processos dele
	// receberam >= NetMinInBytes E enviaram >= NetMinOutBytes no minuto.
	// No Mac são bytes de rede; no Windows, I/O dos processos com conexão
	// externa (inclui disco) — por isso o padrão é maior. Calibrar com `watch`.
	NetMinInBytes  uint64 `json:"net_min_in_bytes,omitempty"`
	NetMinOutBytes uint64 `json:"net_min_out_bytes,omitempty"`
	// Desliga o sinal de rede (só foco) — pra comparar os dois no lab.
	DisableNetwork bool `json:"disable_network,omitempty"`
}

func (c *Config) ApplyDefaults() {
	if c.SampleSeconds <= 0 {
		c.SampleSeconds = 5
	}
	if c.FlushSeconds <= 0 {
		c.FlushSeconds = 300
	}
	if c.IdleSeconds <= 0 {
		c.IdleSeconds = 300
	}
	if c.MinBucketSeconds <= 0 {
		c.MinBucketSeconds = 30
	}
	if c.NetMinInBytes == 0 {
		c.NetMinInBytes = 8 << 10
		if runtime.GOOS == "windows" {
			c.NetMinInBytes = 64 << 10
		}
	}
	if c.NetMinOutBytes == 0 {
		c.NetMinOutBytes = 4 << 10
		if runtime.GOOS == "windows" {
			c.NetMinOutBytes = 32 << 10
		}
	}
	c.CorporateDomain = strings.ToLower(strings.TrimPrefix(strings.TrimSpace(c.CorporateDomain), "@"))
}

func (c Config) Sample() time.Duration { return time.Duration(c.SampleSeconds) * time.Second }
func (c Config) Flush() time.Duration  { return time.Duration(c.FlushSeconds) * time.Second }

func DefaultPath() string {
	if p := os.Getenv("ZSEC_AGENT_CONFIG"); p != "" {
		return p
	}
	if runtime.GOOS == "windows" {
		pd := os.Getenv("ProgramData")
		if pd == "" {
			pd = `C:\ProgramData`
		}
		return filepath.Join(pd, "ZSecAgent", "config.json")
	}
	return "/Library/Application Support/ZSecAgent/config.json"
}

func Load(path string) (Config, error) {
	var c Config
	b, err := os.ReadFile(path)
	if err != nil {
		return c, err
	}
	if err := json.Unmarshal(b, &c); err != nil {
		return c, err
	}
	c.ApplyDefaults()
	if c.ServerURL == "" || c.IngestKey == "" {
		return c, errors.New("config: server_url e ingest_key são obrigatórios")
	}
	return c, nil
}

// DataDir é por usuário: o agente roda na sessão de cada usuário, e cada um
// tem seu próprio spool de uso pendente.
func DataDir() string {
	var base string
	if runtime.GOOS == "windows" {
		base = os.Getenv("LOCALAPPDATA")
	} else if home, err := os.UserHomeDir(); err == nil {
		base = filepath.Join(home, "Library", "Application Support")
	}
	if base == "" {
		base = os.TempDir()
	}
	return filepath.Join(base, "ZSecAgent")
}
