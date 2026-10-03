package usage

import (
	"testing"
	"time"
)

func TestCommitMinuteUnion(t *testing.T) {
	tr := NewTracker(t.TempDir(), "dev", "user", 30)
	claude := Key{"Claude", "Claude Desktop"}
	chatgpt := Key{"ChatGPT", "ChatGPT Desktop"}
	at := time.Date(2026, 10, 1, 14, 10, 0, 0, time.UTC)

	// Minuto 1: 20 s em foco no ChatGPT, Claude gerando em segundo plano (rede).
	tr.AddForeground(chatgpt, "chatgpt", 20)
	tr.CommitMinute(at, map[Key]string{claude: "claude helper"})
	// Minuto 2: Claude em foco 30 s E com rede -> conta 60, não 90.
	tr.AddForeground(claude, "claude", 30)
	tr.CommitMinute(at.Add(time.Minute), map[Key]string{claude: "claude helper"})

	got := map[string]Bucket{}
	for _, b := range tr.Pending() {
		got[b.App] = b
	}
	c := got["Claude Desktop"]
	if c.Seconds != 120 || c.Network != 120 || c.Foreground != 30 {
		t.Errorf("Claude: duration=%v network=%v fg=%v, want 120/120/30", c.Seconds, c.Network, c.Foreground)
	}
	// ChatGPT teve só 20 s (< mínimo de 30 s): ainda não é enviado.
	if _, ok := got["ChatGPT Desktop"]; ok {
		t.Errorf("ChatGPT com 20 s não deveria estar pendente")
	}
}

func TestBucketIDStableAndUpsert(t *testing.T) {
	tr := NewTracker(t.TempDir(), "dev", "user", 1)
	k := Key{"Claude", "Claude Desktop"}
	at := time.Date(2026, 10, 1, 14, 10, 0, 0, time.UTC)
	tr.CommitMinute(at, map[Key]string{k: "p"})
	first := tr.Pending()
	tr.MarkSent(first, at)
	if len(tr.Pending()) != 0 {
		t.Fatal("nada novo deveria estar pendente após envio")
	}
	tr.CommitMinute(at.Add(5*time.Minute), map[Key]string{k: "p"}) // mesma hora
	again := tr.Pending()
	if len(again) != 1 || again[0].ID != first[0].ID || again[0].Seconds != 120 {
		t.Fatalf("esperava o mesmo balde com 120 s, got %+v", again)
	}
}
