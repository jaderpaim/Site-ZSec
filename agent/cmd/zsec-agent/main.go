// zsec-agent — coleta uso de apps de IA (desktop e CLI) para o Ranking de IA
// do Z-Sec. Só coleta: não bloqueia nada e não lê conteúdo, título de janela
// nem o conteúdo do tráfego — apenas qual app de IA está em uso, por quanto
// tempo e por quem. Da rede, só o VOLUME de bytes por processo.
//
// Roda na sessão de cada usuário (Tarefa Agendada no logon / LaunchAgent),
// porque o app em primeiro plano só é visível de dentro da sessão.
//
//	zsec-agent run        loop de coleta (o que o instalador agenda)
//	zsec-agent watch      mostra em tempo real foco e rede por app (calibração)
//	zsec-agent inventory  lista os apps de IA instalados
//	zsec-agent identity   mostra usuário/dispositivo que seriam enviados
//	zsec-agent send-test  envia um ciclo agora (valida URL e chave)
package main

import (
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"sort"
	"syscall"
	"time"

	"zsec-agent/internal/catalog"
	"zsec-agent/internal/config"
	"zsec-agent/internal/platform"
	"zsec-agent/internal/sender"
	"zsec-agent/internal/usage"
)

var version = "0.2.0" // sobrescrito no build: -ldflags "-X main.version=..."

const (
	inventoryEvery = 24 * time.Hour
	maxBatch       = 200
)

func main() {
	cfgPath := flag.String("config", config.DefaultPath(), "caminho do config.json")
	flag.Usage = func() {
		fmt.Fprintln(os.Stderr, "uso: zsec-agent [-config caminho] run|watch|inventory|identity|send-test|version")
	}
	flag.Parse()
	cmd := flag.Arg(0)
	if cmd == "" {
		cmd = "run"
	}

	if cmd == "version" {
		fmt.Println(version)
		return
	}

	cfg, err := config.Load(*cfgPath)
	if err != nil {
		if cmd != "watch" && cmd != "inventory" && cmd != "identity" {
			fatal("config %s: %v", *cfgPath, err)
		}
		cfg.ApplyDefaults() // diagnóstico funciona sem config
	}

	switch cmd {
	case "run":
		runLoop(cfg)
	case "watch":
		watch(cfg)
	case "inventory":
		printJSON(aiApps())
	case "identity":
		printJSON(map[string]any{
			"device": platform.DeviceInfo(),
			"user":   platform.CurrentUser(cfg.CorporateDomain),
		})
	case "send-test":
		a := newAgent(cfg)
		if err := a.flush(true); err != nil {
			fatal("envio falhou: %v", err)
		}
		fmt.Println("ok: envio aceito pelo servidor")
	default:
		flag.Usage()
		os.Exit(2)
	}
}

type agent struct {
	cfg     config.Config
	device  platform.Device
	user    platform.User
	tracker *usage.Tracker
	net     *usage.NetSampler
	client  *sender.Client
}

func newAgent(cfg config.Config) *agent {
	dev := platform.DeviceInfo()
	usr := platform.CurrentUser(cfg.CorporateDomain)
	return &agent{
		cfg:     cfg,
		device:  dev,
		user:    usr,
		tracker: usage.NewTracker(config.DataDir(), dev.ID, usr.OSUser, cfg.MinBucketSeconds),
		net:     usage.NewNetSampler(cfg.NetMinInBytes, cfg.NetMinOutBytes),
		client:  sender.New(cfg.ServerURL, cfg.IngestKey),
	}
}

func runLoop(cfg config.Config) {
	setupLog()
	a := newAgent(cfg)
	log.Printf("zsec-agent %s iniciado: device=%s host=%s user=%s ids=%v rede=%v (in>=%d out>=%d)",
		version, a.device.ID, a.device.Hostname, a.user.OSUser, a.user.Identities,
		!cfg.DisableNetwork, cfg.NetMinInBytes, cfg.NetMinOutBytes)

	sample := time.NewTicker(cfg.Sample())
	minute := time.NewTicker(time.Minute)
	flush := time.NewTicker(cfg.Flush())
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	a.networkActive() // linha de base dos contadores de rede

	// Primeiro envio logo no início: manda o que ficou no spool e o inventário.
	go func() {
		if err := a.flush(false); err != nil {
			log.Printf("envio inicial: %v", err)
		}
	}()

	for {
		select {
		case <-sample.C:
			a.sampleForeground()
		case now := <-minute.C:
			a.tracker.CommitMinute(now.Add(-time.Minute), a.networkActive())
		case <-flush.C:
			if err := a.flush(false); err != nil {
				log.Printf("envio: %v (fica no spool para a próxima tentativa)", err)
			}
		case <-stop:
			_ = a.tracker.Save()
			log.Printf("encerrado")
			return
		}
	}
}

// foregroundApp devolve o app de IA em foco, ou nil se não houver / usuário ausente.
func (a *agent) foregroundApp() (*catalog.App, platform.Foreground) {
	fg, err := platform.ForegroundApp()
	if err != nil || (fg.Path == "" && fg.BundleID == "") {
		return nil, fg
	}
	if idle, err := platform.IdleSeconds(); err == nil && idle >= float64(a.cfg.IdleSeconds) {
		return nil, fg // usuário ausente: app aberto parado não conta pelo foco
	}
	return catalog.MatchForeground(fg.Path, fg.BundleID), fg
}

func (a *agent) sampleForeground() {
	if app, fg := a.foregroundApp(); app != nil {
		a.tracker.AddForeground(usage.Key{Tool: app.Tool, App: app.App}, catalog.ProcName(fg.Path), a.cfg.Sample().Seconds())
	}
}

// networkActive devolve os apps com rede acima do limiar desde a última leitura.
func (a *agent) networkActive() map[usage.Key]string {
	active := map[usage.Key]string{}
	if a.cfg.DisableNetwork {
		return active
	}
	traffic, err := a.net.Sample()
	if err != nil {
		log.Printf("rede: %v", err)
		return active
	}
	for k, t := range traffic {
		if t.Active {
			active[k] = t.Process
		}
	}
	return active
}

func (a *agent) flush(force bool) error {
	now := time.Now()
	defer func() { _ = a.tracker.Save() }()

	p := sender.Payload{
		AgentVersion: version,
		Device:       a.device,
		User:         a.user,
		UserOverride: a.cfg.UserName,
	}
	if force || a.tracker.InventoryDue(now, inventoryEvery) {
		p.AIApps = aiApps()
		p.InventoryAt = &now
	}

	pending := a.tracker.Pending()
	if len(pending) == 0 && p.InventoryAt == nil && !force {
		return nil
	}
	// Spool grande (máquina muito tempo offline) vai em lotes.
	for first := true; first || len(pending) > 0; first = false {
		n := min(maxBatch, len(pending))
		p.Usage = append([]usage.Bucket{}, pending[:n]...) // nunca null no JSON
		if err := a.client.Send(p); err != nil {
			return err
		}
		a.tracker.MarkSent(p.Usage, now)
		if p.InventoryAt != nil {
			a.tracker.MarkInventory(now)
			p.AIApps, p.InventoryAt = nil, nil
		}
		pending = pending[n:]
	}
	return nil
}

func aiApps() []platform.InstalledApp {
	all, _ := platform.InstalledApps()
	out := []platform.InstalledApp{}
	for _, ia := range all {
		if catalog.MatchInstalled(ia.Name, ia.BundleID) != nil {
			out = append(out, ia)
		}
	}
	return out
}

// watch é a ferramenta de calibração do lab: a cada amostra mostra o app em
// foco; a cada minuto, o tráfego de cada app de IA e se passou do limiar.
func watch(cfg config.Config) {
	a := &agent{cfg: cfg, net: usage.NewNetSampler(cfg.NetMinInBytes, cfg.NetMinOutBytes)}
	fmt.Printf("Foco a cada %s; rede a cada 1 min (limiar: in>=%d out>=%d bytes). Ctrl+C para sair.\n",
		cfg.Sample(), cfg.NetMinInBytes, cfg.NetMinOutBytes)
	if _, err := a.net.Sample(); err != nil {
		fmt.Println("rede indisponível:", err)
	}
	sample := time.NewTicker(cfg.Sample())
	minute := time.NewTicker(time.Minute)
	for {
		select {
		case <-sample.C:
			idle, _ := platform.IdleSeconds()
			app, fg := a.foregroundApp()
			match := "-"
			if app != nil {
				match = app.Tool + " / " + app.App
			}
			fmt.Printf("%s FOCO idle=%3.0fs proc=%q bundle=%q -> %s\n",
				time.Now().Format("15:04:05"), idle, catalog.ProcName(fg.Path), fg.BundleID, match)
		case <-minute.C:
			traffic, err := a.net.Sample()
			if err != nil {
				fmt.Println("rede:", err)
				continue
			}
			keys := make([]usage.Key, 0, len(traffic))
			for k := range traffic {
				keys = append(keys, k)
			}
			sort.Slice(keys, func(i, j int) bool { return keys[i].App < keys[j].App })
			fmt.Printf("%s REDE (último minuto)\n", time.Now().Format("15:04:05"))
			if len(keys) == 0 {
				fmt.Println("   nenhum app de IA com tráfego")
			}
			for _, k := range keys {
				t := traffic[k]
				flag := "parado"
				if t.Active {
					flag = "ATIVO"
				}
				fmt.Printf("   %-22s in=%9d out=%9d  %s\n", k.App, t.In, t.Out, flag)
			}
		}
	}
}

func setupLog() {
	dir := config.DataDir()
	_ = os.MkdirAll(dir, 0o700)
	path := filepath.Join(dir, "agent.log")
	if st, err := os.Stat(path); err == nil && st.Size() > 2<<20 {
		_ = os.Rename(path, path+".1")
	}
	f, err := os.OpenFile(path, os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o600)
	if err != nil {
		return
	}
	log.SetOutput(io.MultiWriter(f, os.Stderr))
}

func printJSON(v any) {
	enc := json.NewEncoder(os.Stdout)
	enc.SetIndent("", "  ")
	_ = enc.Encode(v)
}

func fatal(format string, args ...any) {
	fmt.Fprintf(os.Stderr, format+"\n", args...)
	os.Exit(1)
}
