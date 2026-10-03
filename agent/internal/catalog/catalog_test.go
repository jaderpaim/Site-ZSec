package catalog

import "testing"

func TestMatchProcess(t *testing.T) {
	cases := []struct {
		goos, path, want string
	}{
		// macOS: tudo dentro do .app é o Desktop, inclusive os helpers de rede.
		{"darwin", "/Applications/Claude.app/Contents/MacOS/Claude", "Claude Desktop"},
		{"darwin", "/Applications/Claude.app/Contents/Frameworks/Claude Helper.app/Contents/MacOS/Claude Helper", "Claude Desktop"},
		{"darwin", "/Users/x/.vscode/extensions/anthropic.claude-code-2.1.286-darwin-arm64/resources/native-binary/claude", "Claude Code (CLI)"},
		{"darwin", "/Users/x/.local/bin/claude", "Claude Code (CLI)"},
		{"darwin", "/Applications/ChatGPT.app/Contents/MacOS/ChatGPT", "ChatGPT Desktop"},
		{"darwin", "/opt/homebrew/bin/codex", "Codex CLI"},
		{"darwin", "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome", ""},
		// Windows: claude.exe é Desktop só dentro de AnthropicClaude.
		{"windows", `C:\Users\x\AppData\Local\AnthropicClaude\app-0.9.0\claude.exe`, "Claude Desktop"},
		{"windows", `C:\Users\x\.local\bin\claude.exe`, "Claude Code (CLI)"},
		{"windows", `C:\Program Files\WindowsApps\OpenAI.ChatGPT-Desktop_1.0_x64\app\ChatGPT.exe`, "ChatGPT Desktop"},
		{"windows", `C:\Program Files\Google\Chrome\Application\chrome.exe`, ""},
	}
	defer func(g string) { goos = g }(goos)
	for _, c := range cases {
		goos = c.goos
		got := ""
		if a := MatchProcess(c.path); a != nil {
			got = a.App
		}
		if got != c.want {
			t.Errorf("[%s] %s: got %q, want %q", c.goos, c.path, got, c.want)
		}
	}
}

func TestMatchForegroundByBundle(t *testing.T) {
	if a := MatchForeground("Claude", "com.anthropic.claudefordesktop"); a == nil || a.App != "Claude Desktop" {
		t.Fatalf("got %v", a)
	}
	if a := MatchForeground("Code", "com.microsoft.VSCode"); a != nil {
		t.Fatalf("VS Code não é app de IA, got %v", a.App)
	}
}
