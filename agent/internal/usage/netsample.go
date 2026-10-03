package usage

import (
	"zsec-agent/internal/catalog"
	"zsec-agent/internal/platform"
)

// AppTraffic é o tráfego de um app do catálogo num intervalo (soma de todos
// os processos dele — no Electron, quem fala com a rede é um "Helper").
type AppTraffic struct {
	In, Out uint64
	Process string
	Active  bool
}

// NetSampler transforma contadores acumulados por processo em delta por app.
type NetSampler struct {
	prev   map[int]platform.ProcNet
	MinIn  uint64
	MinOut uint64
}

func NewNetSampler(minIn, minOut uint64) *NetSampler {
	return &NetSampler{MinIn: minIn, MinOut: minOut}
}

// Sample lê os contadores agora e devolve o tráfego de cada app de IA desde a
// leitura anterior. A primeira chamada só cria a linha de base (senão o
// tráfego da vida inteira de cada processo contaria no primeiro minuto).
func (s *NetSampler) Sample() (map[Key]*AppTraffic, error) {
	cur, err := platform.NetworkCounters()
	if err != nil {
		return nil, err
	}
	next := make(map[int]platform.ProcNet, len(cur))
	out := map[Key]*AppTraffic{}
	first := s.prev == nil
	for _, p := range cur {
		next[p.PID] = p
		if first {
			continue
		}
		app := catalog.MatchProcess(p.Path)
		if app == nil {
			continue
		}
		// Processo já visto: delta. Processo novo: nasceu (ou abriu a
		// primeira conexão externa) neste intervalo, então o acumulado é do
		// intervalo. Contador que diminuiu (fluxos encerrados somem do
		// nettop) vira só nova linha de base — melhor perder um minuto do
		// que inventar um pico.
		in, o := p.In, p.Out
		if old, ok := s.prev[p.PID]; ok && old.Path == p.Path {
			in, o = 0, 0
			if p.In >= old.In && p.Out >= old.Out {
				in, o = p.In-old.In, p.Out-old.Out
			}
		}
		k := Key{Tool: app.Tool, App: app.App}
		t := out[k]
		if t == nil {
			t = &AppTraffic{Process: catalog.ProcName(p.Path)}
			out[k] = t
		}
		t.In += in
		t.Out += o
	}
	s.prev = next
	for _, t := range out {
		t.Active = t.In >= s.MinIn && t.Out >= s.MinOut
	}
	return out, nil
}
