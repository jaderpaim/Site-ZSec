// Catálogo de apps de IA reconhecidos pelo agente.
//
// Tool precisa bater com os nomes que o Z-Sec já usa no Ranking de IA
// (IA_TOOL_RULES em src/lib/ia.server.ts) — assim o uso via app soma com o uso
// via navegador (Sophos) na mesma ferramenta. Navegadores ficam de fora de
// propósito: o Sophos já cobre o acesso web e contaria em dobro.
//
// Um processo é atribuído a um app pelo CAMINHO do executável, não só pelo
// nome: no Mac, tudo que roda dentro de Claude.app (inclusive os "Claude
// Helper", que é quem fala com a rede) é Claude Desktop; já o binário "claude"
// da CLI fica fora de qualquer .app.
//
// Entradas marcadas com "validar" têm nome de processo/bundle levantados de
// documentação pública — conferir com `zsec-agent watch` numa máquina real.
package catalog

import (
	"path/filepath"
	"runtime"
	"strings"
)

type Kind int

const (
	GUI Kind = iota // app de janela: conta em foco e pela rede
	CLI             // linha de comando: nunca está "em foco", conta só pela rede
)

type App struct {
	Tool string
	App  string
	Kind Kind
	// Nome do executável (minúsculo, sem .exe) — Windows e CLIs.
	Processes []string
	// Bundle ID do app em foco (macOS).
	BundleIDs []string
	// Pasta do .app (minúsculo): qualquer processo dentro dela é deste app (macOS).
	MacBundles []string
	// Se preenchido, o caminho precisa conter um destes trechos (separador "/").
	PathHints []string
	// Trechos de caminho que descartam o match.
	ExcludePaths []string
	// Trechos do nome exibido em "Programas instalados"/Applications.
	InstallHints []string
}

var Apps = []App{
	{Tool: "ChatGPT", App: "ChatGPT Desktop", Kind: GUI,
		Processes: []string{"chatgpt"}, BundleIDs: []string{"com.openai.chat"},
		MacBundles: []string{"chatgpt.app"}, InstallHints: []string{"chatgpt"}},
	{Tool: "Codex", App: "Codex Desktop", Kind: GUI,
		Processes: []string{"codex desktop"}, BundleIDs: []string{"com.openai.codex"}, // validar
		MacBundles: []string{"codex.app"}, InstallHints: []string{"codex"}},
	{Tool: "Claude", App: "Claude Desktop", Kind: GUI,
		Processes: []string{"claude"}, BundleIDs: []string{"com.anthropic.claudefordesktop"},
		MacBundles: []string{"claude.app"},
		// No Windows, a CLI também se chama claude.exe — o Desktop fica em AnthropicClaude.
		PathHints:    []string{"/anthropicclaude/"},
		InstallHints: []string{"claude"}},
	{Tool: "Copilot", App: "Microsoft Copilot", Kind: GUI,
		Processes:    []string{"copilot", "m365copilot"},                                 // validar
		BundleIDs:    []string{"com.microsoft.copilot-mac", "com.microsoft.m365copilot"}, // validar
		MacBundles:   []string{"copilot.app", "microsoft copilot.app"},                   // validar
		InstallHints: []string{"copilot"}},
	{Tool: "Gemini", App: "Gemini Desktop", Kind: GUI,
		Processes: []string{"gemini"}, BundleIDs: []string{"com.google.gemini"}, // validar
		MacBundles: []string{"gemini.app"}, InstallHints: []string{"gemini"}},
	{Tool: "Perplexity", App: "Perplexity Desktop", Kind: GUI,
		Processes: []string{"perplexity"}, BundleIDs: []string{"ai.perplexity.mac"},
		MacBundles: []string{"perplexity.app"}, InstallHints: []string{"perplexity"}},
	{Tool: "Grok", App: "Grok Desktop", Kind: GUI,
		Processes: []string{"grok"}, BundleIDs: []string{"ai.x.grok"}, // validar
		MacBundles: []string{"grok.app"}, InstallHints: []string{"grok"}},
	{Tool: "Mistral", App: "Le Chat", Kind: GUI,
		Processes: []string{"le chat"}, BundleIDs: []string{"ai.mistral.lechat"}, // validar
		MacBundles: []string{"le chat.app"}, InstallHints: []string{"le chat"}},
	{Tool: "DeepSeek", App: "DeepSeek Desktop", Kind: GUI,
		Processes: []string{"deepseek"}, BundleIDs: []string{"com.deepseek.chat"}, // validar
		MacBundles: []string{"deepseek.app"}, InstallHints: []string{"deepseek"}},
	// IDEs com IA: a rede deles inclui marketplace/git, então o sinal de rede
	// é mais ruidoso — calibrar no lab.
	{Tool: "Cursor", App: "Cursor", Kind: GUI,
		Processes: []string{"cursor"}, BundleIDs: []string{"com.todesktop.230313mzl4w4u92"},
		MacBundles: []string{"cursor.app"}, InstallHints: []string{"cursor"}},
	{Tool: "Windsurf", App: "Windsurf", Kind: GUI,
		Processes: []string{"windsurf"}, BundleIDs: []string{"com.exafunction.windsurf"},
		MacBundles: []string{"windsurf.app"}, InstallHints: []string{"windsurf"}},
	{Tool: "LM Studio", App: "LM Studio", Kind: GUI,
		Processes: []string{"lm studio", "lmstudio"}, BundleIDs: []string{"ai.elementlabs.lmstudio"},
		MacBundles: []string{"lm studio.app"}, InstallHints: []string{"lm studio", "lmstudio"}},
	{Tool: "Ollama", App: "Ollama", Kind: GUI,
		Processes: []string{"ollama app"}, BundleIDs: []string{"com.electron.ollama"},
		MacBundles: []string{"ollama.app"}, InstallHints: []string{"ollama"}},

	// CLIs com binário próprio (as que rodam como "node"/"python" não são
	// distinguíveis pelo processo e ficaram de fora).
	{Tool: "Claude", App: "Claude Code (CLI)", Kind: CLI,
		Processes:    []string{"claude"},
		ExcludePaths: []string{".app/", "/anthropicclaude/"}},
	{Tool: "Codex", App: "Codex CLI", Kind: CLI,
		Processes: []string{"codex"}, ExcludePaths: []string{".app/"}},
}

// ProcName normaliza um caminho/nome de executável: base, minúsculo, sem .exe.
func ProcName(pathOrName string) string {
	n := strings.ToLower(filepath.Base(normPath(pathOrName)))
	return strings.TrimSuffix(n, ".exe")
}

// goos é variável só pra os testes cobrirem caminhos dos dois sistemas.
var goos = runtime.GOOS

func normPath(p string) string { return strings.ToLower(strings.ReplaceAll(p, `\`, "/")) }

func contains(list []string, v string) bool {
	for _, x := range list {
		if x == v {
			return true
		}
	}
	return false
}

func (a *App) matchPath(path string) bool {
	lp := normPath(path)
	for _, ex := range a.ExcludePaths {
		if strings.Contains(lp, ex) {
			return false
		}
	}
	if a.Kind == GUI && goos == "darwin" {
		for _, b := range a.MacBundles {
			if strings.Contains(lp, "/"+b+"/") {
				return true
			}
		}
		return false
	}
	if !contains(a.Processes, ProcName(lp)) {
		return false
	}
	if len(a.PathHints) == 0 {
		return true
	}
	for _, h := range a.PathHints {
		if strings.Contains(lp, h) {
			return true
		}
	}
	return false
}

// MatchProcess atribui um processo (caminho do executável) a um app — usado
// pelo sinal de rede, que vê todos os processos, inclusive helpers e CLIs.
func MatchProcess(path string) *App {
	for i := range Apps {
		if Apps[i].matchPath(path) {
			return &Apps[i]
		}
	}
	return nil
}

// MatchForeground devolve o app GUI da janela em foco. No Mac usa o bundle ID;
// no Windows, o caminho do executável.
func MatchForeground(path, bundleID string) *App {
	bid := strings.ToLower(bundleID)
	for i := range Apps {
		a := &Apps[i]
		if a.Kind != GUI {
			continue
		}
		if bid != "" {
			for _, b := range a.BundleIDs {
				if strings.ToLower(b) == bid {
					return a
				}
			}
		} else if a.matchPath(path) {
			return a
		}
	}
	return nil
}

// MatchInstalled diz se um app instalado (nome exibido / bundle ID) é de IA.
func MatchInstalled(displayName, bundleID string) *App {
	n := strings.ToLower(displayName)
	b := strings.ToLower(bundleID)
	for i := range Apps {
		a := &Apps[i]
		if a.Kind != GUI {
			continue
		}
		for _, id := range a.BundleIDs {
			if b != "" && strings.ToLower(id) == b {
				return a
			}
		}
		for _, h := range a.InstallHints {
			if strings.Contains(n, h) {
				return a
			}
		}
	}
	return nil
}
