// Acumula tempo de uso por (ferramenta, app, hora cheia), a partir de dois
// sinais avaliados minuto a minuto:
//
//	foco: segundos com o app em primeiro plano e o usuário ativo;
//	rede: o processo do app trocou bytes acima do limiar naquele minuto
//	      (IA gerando em segundo plano, apps simultâneos, CLIs).
//
// Minuto com rede ativa conta 60 s; sem rede, conta o tempo em foco. Vários
// apps podem contar no mesmo minuto. Os dois sinais também vão separados
// (foreground_s / network_s) pra calibrar o limiar no lab.
//
// Cada balde vira UMA linha no ia_web_events do Z-Sec — o ranking conta
// linhas, então "1 hora com uso de Claude" = 1 acesso. O ID do balde é
// determinístico: reenviar o mesmo balde (com mais segundos) faz upsert.
//
// Os baldes ficam num spool em disco: desligar a máquina ou ficar offline não
// perde uso; o que não foi aceito pelo servidor é reenviado.
package usage

import (
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type Bucket struct {
	ID          string    `json:"id"`
	Tool        string    `json:"tool"`
	App         string    `json:"app"`
	Process     string    `json:"process"`
	HourStart   time.Time `json:"bucket_start"`
	FirstSeen   time.Time `json:"first_seen"`
	LastSeen    time.Time `json:"last_seen"`
	Seconds     float64   `json:"duration_s"`   // foco ∪ rede
	Foreground  float64   `json:"foreground_s"` // só foco
	Network     float64   `json:"network_s"`    // minutos com rede ativa × 60
	SentSeconds float64   `json:"sent_s"`       // já aceito pelo servidor
}

// Key identifica um app no catálogo (ferramenta + nome do app).
type Key struct{ Tool, App string }

type minuteAcc struct {
	fg      float64
	process string
}

type spool struct {
	Buckets       map[string]*Bucket `json:"buckets"`
	LastInventory time.Time          `json:"last_inventory"`
}

type Tracker struct {
	mu       sync.Mutex
	path     string
	identity string // device|user — entra no ID do balde
	minSecs  float64
	minute   map[Key]*minuteAcc
	s        spool
}

// Baldes mais velhos que isso são descartados mesmo sem envio (máquina
// offline por semanas não deve acumular spool infinito).
const maxAge = 14 * 24 * time.Hour

func NewTracker(dataDir, deviceID, userKey string, minSecs int) *Tracker {
	t := &Tracker{
		path:     filepath.Join(dataDir, "spool.json"),
		identity: deviceID + "|" + userKey,
		minSecs:  float64(minSecs),
		minute:   map[Key]*minuteAcc{},
		s:        spool{Buckets: map[string]*Bucket{}},
	}
	if b, err := os.ReadFile(t.path); err == nil {
		_ = json.Unmarshal(b, &t.s)
		if t.s.Buckets == nil {
			t.s.Buckets = map[string]*Bucket{}
		}
	}
	return t
}

// AddForeground soma segundos em foco no minuto corrente.
func (t *Tracker) AddForeground(k Key, process string, secs float64) {
	t.mu.Lock()
	defer t.mu.Unlock()
	acc := t.minute[k]
	if acc == nil {
		acc = &minuteAcc{}
		t.minute[k] = acc
	}
	acc.fg += secs
	acc.process = process
}

// CommitMinute fecha o minuto: une foco e rede e lança no balde da hora.
// netActive traz os apps com rede acima do limiar (valor = processo).
func (t *Tracker) CommitMinute(at time.Time, netActive map[Key]string) {
	t.mu.Lock()
	defer t.mu.Unlock()
	keys := map[Key]bool{}
	for k := range t.minute {
		keys[k] = true
	}
	for k := range netActive {
		keys[k] = true
	}
	for k := range keys {
		fg, process := 0.0, netActive[k]
		if acc := t.minute[k]; acc != nil {
			fg = min(acc.fg, 60)
			process = acc.process
		}
		_, net := netActive[k]
		active := fg
		if net {
			active = 60
		}
		if active <= 0 {
			continue
		}
		b := t.bucketLocked(k, process, at)
		b.Seconds += active
		b.Foreground += fg
		if net {
			b.Network += 60
		}
	}
	t.minute = map[Key]*minuteAcc{}
}

func (t *Tracker) bucketLocked(k Key, process string, at time.Time) *Bucket {
	hour := at.UTC().Truncate(time.Hour)
	key := k.Tool + "|" + k.App + "|" + hour.Format(time.RFC3339)
	b := t.s.Buckets[key]
	if b == nil {
		sum := sha256.Sum256([]byte(t.identity + "|" + key))
		b = &Bucket{
			ID: "agent-" + hex.EncodeToString(sum[:12]), Tool: k.Tool, App: k.App,
			Process: process, HourStart: hour, FirstSeen: at.UTC(),
		}
		t.s.Buckets[key] = b
	}
	b.LastSeen = at.UTC()
	return b
}

// Pending devolve os baldes com uso suficiente e algo novo a enviar.
func (t *Tracker) Pending() []Bucket {
	t.mu.Lock()
	defer t.mu.Unlock()
	out := []Bucket{}
	for _, b := range t.s.Buckets {
		if b.Seconds >= t.minSecs && b.Seconds > b.SentSeconds {
			out = append(out, *b)
		}
	}
	return out
}

// MarkSent registra o que o servidor aceitou e limpa baldes encerrados.
func (t *Tracker) MarkSent(sent []Bucket, now time.Time) {
	t.mu.Lock()
	defer t.mu.Unlock()
	byID := map[string]float64{}
	for _, s := range sent {
		byID[s.ID] = s.Seconds
	}
	for _, b := range t.s.Buckets {
		if secs, ok := byID[b.ID]; ok {
			b.SentSeconds = secs
		}
	}
	t.pruneLocked(now)
}

func (t *Tracker) pruneLocked(now time.Time) {
	for k, b := range t.s.Buckets {
		closed := now.Sub(b.HourStart) > 2*time.Hour
		done := b.SentSeconds >= b.Seconds || b.Seconds < t.minSecs
		if (closed && done) || now.Sub(b.HourStart) > maxAge {
			delete(t.s.Buckets, k)
		}
	}
}

func (t *Tracker) InventoryDue(now time.Time, every time.Duration) bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	return now.Sub(t.s.LastInventory) >= every
}

func (t *Tracker) MarkInventory(now time.Time) {
	t.mu.Lock()
	t.s.LastInventory = now
	t.mu.Unlock()
}

func (t *Tracker) Save() error {
	t.mu.Lock()
	t.pruneLocked(time.Now())
	b, err := json.Marshal(t.s)
	t.mu.Unlock()
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(t.path), 0o700); err != nil {
		return err
	}
	tmp := t.path + ".tmp"
	if err := os.WriteFile(tmp, b, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, t.path)
}
