// Envio para o endpoint de ingest do Z-Sec (/api/public/hooks/agent-ingest).
package sender

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"zsec-agent/internal/platform"
	"zsec-agent/internal/usage"
)

type Payload struct {
	AgentVersion string                  `json:"agent_version"`
	Device       platform.Device         `json:"device"`
	User         platform.User           `json:"user"`
	UserOverride string                  `json:"user_override,omitempty"`
	Usage        []usage.Bucket          `json:"usage"`
	AIApps       []platform.InstalledApp `json:"ai_apps,omitempty"`
	// Inventário só vai quando foi coletado neste ciclo (1x/dia).
	InventoryAt *time.Time `json:"inventory_at,omitempty"`
}

type Client struct {
	URL  string
	Key  string
	HTTP *http.Client
}

func New(url, key string) *Client {
	return &Client{URL: url, Key: key, HTTP: &http.Client{Timeout: 30 * time.Second}}
}

func (c *Client) Send(p Payload) error {
	body, err := json.Marshal(p)
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPost, c.URL, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+c.Key)
	req.Header.Set("User-Agent", "zsec-agent/"+p.AgentVersion)
	resp, err := c.HTTP.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode/100 != 2 {
		msg, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return fmt.Errorf("servidor respondeu %d: %s", resp.StatusCode, bytes.TrimSpace(msg))
	}
	return nil
}
