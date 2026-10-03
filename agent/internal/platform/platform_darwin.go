package platform

import (
	"os"
	"os/exec"
	"os/user"
	"path/filepath"
	"regexp"
	"runtime"
	"strconv"
	"strings"
	"time"
)

func hideWindow(*exec.Cmd) {}

var lsKV = regexp.MustCompile(`"([^"]+)"=("?)([^"\n]*)`)

// ForegroundApp usa lsappinfo (vem com o macOS e não pede permissão de
// Acessibilidade nem de Gravação de Tela).
func ForegroundApp() (Foreground, error) {
	var f Foreground
	asn, err := run(2*time.Second, "/usr/bin/lsappinfo", "front")
	if err != nil {
		return f, err
	}
	asn = strings.TrimSpace(asn)
	if asn == "" || asn == "[ NULL ]" {
		return f, nil
	}
	out, err := run(2*time.Second, "/usr/bin/lsappinfo", "info", "-only", "bundleid", "-only", "name", "-only", "pid", asn)
	if err != nil {
		return f, err
	}
	for _, m := range lsKV.FindAllStringSubmatch(out, -1) {
		switch m[1] {
		case "CFBundleIdentifier":
			f.BundleID = m[3]
		case "LSDisplayName":
			f.AppName = m[3]
		case "pid":
			f.PID, _ = strconv.Atoi(m[3])
		}
	}
	f.Path = f.AppName
	return f, nil
}

var hidIdle = regexp.MustCompile(`"HIDIdleTime" = (\d+)`)

func IdleSeconds() (float64, error) {
	out, err := run(2*time.Second, "/usr/sbin/ioreg", "-c", "IOHIDSystem", "-d", "4")
	if err != nil {
		return 0, err
	}
	m := hidIdle.FindStringSubmatch(out)
	if m == nil {
		return 0, nil
	}
	ns, _ := strconv.ParseFloat(m[1], 64)
	return ns / 1e9, nil
}

// NetworkCounters usa nettop (vem com o macOS, não precisa de root) só com
// interfaces externas — tráfego local (ex.: Ollama falando com o próprio
// servidor) não conta. O caminho de cada PID vem do ps.
func NetworkCounters() ([]ProcNet, error) {
	out, err := run(5*time.Second, "/usr/bin/nettop", "-P", "-L", "1", "-x", "-t", "external", "-J", "bytes_in,bytes_out")
	if err != nil {
		return nil, err
	}
	paths := map[int]string{}
	if ps, err := run(3*time.Second, "/bin/ps", "-axo", "pid=,comm="); err == nil {
		for _, l := range strings.Split(ps, "\n") {
			l = strings.TrimSpace(l)
			if sp := strings.IndexByte(l, ' '); sp > 0 {
				if pid, err := strconv.Atoi(l[:sp]); err == nil {
					paths[pid] = strings.TrimSpace(l[sp+1:])
				}
			}
		}
	}
	var res []ProcNet
	for _, l := range strings.Split(out, "\n") {
		f := strings.Split(strings.TrimSpace(l), ",")
		if len(f) < 3 {
			continue
		}
		dot := strings.LastIndexByte(f[0], '.')
		if dot < 0 {
			continue // cabeçalho
		}
		pid, err := strconv.Atoi(f[0][dot+1:])
		if err != nil {
			continue
		}
		in, _ := strconv.ParseUint(f[1], 10, 64)
		outB, _ := strconv.ParseUint(f[2], 10, 64)
		path := paths[pid]
		if path == "" {
			path = f[0][:dot]
		}
		res = append(res, ProcNet{PID: pid, Path: path, In: in, Out: outB})
	}
	return res, nil
}

func CurrentUser(domain string) User {
	u := User{}
	if cu, err := user.Current(); err == nil {
		u.OSUser = cu.Username
	}
	var ids []string
	// Mac vinculado ao AD / Platform SSO costuma ter o UPN como alias do registro.
	if out, err := run(2*time.Second, "/usr/bin/dscl", ".", "-read", "/Users/"+u.OSUser, "RecordName"); err == nil {
		ids = append(ids, strings.Fields(strings.TrimPrefix(strings.TrimSpace(out), "RecordName:"))...)
	}
	// Conta corporativa do Office (filtrada pelo domínio — pode ser pessoal).
	if out, err := run(2*time.Second, "/usr/bin/defaults", "read", "com.microsoft.office", "OfficeActivationEmailAddress"); err == nil {
		ids = append(ids, strings.TrimSpace(out))
	}
	u.Identities = FilterIdentities(ids, domain)
	return u
}

var platformUUID = regexp.MustCompile(`"IOPlatformUUID" = "([^"]+)"`)

func DeviceInfo() Device {
	d := Device{OS: "macos", Arch: runtime.GOARCH}
	d.Hostname, _ = os.Hostname()
	if out, err := run(2*time.Second, "/usr/sbin/scutil", "--get", "ComputerName"); err == nil && strings.TrimSpace(out) != "" {
		d.Hostname = strings.TrimSpace(out)
	}
	if out, err := run(2*time.Second, "/usr/bin/sw_vers", "-productVersion"); err == nil {
		d.OSVersion = strings.TrimSpace(out)
	}
	if out, err := run(2*time.Second, "/usr/sbin/ioreg", "-rd1", "-c", "IOPlatformExpertDevice"); err == nil {
		if m := platformUUID.FindStringSubmatch(out); m != nil {
			d.ID = strings.ToLower(m[1])
		}
	}
	if d.ID == "" {
		d.ID = "host-" + strings.ToLower(d.Hostname)
	}
	return d
}

func plistValue(plist, key string) string {
	out, err := run(2*time.Second, "/usr/bin/plutil", "-extract", key, "raw", "-o", "-", plist)
	if err != nil {
		return ""
	}
	return strings.TrimSpace(out)
}

func InstalledApps() ([]InstalledApp, error) {
	dirs := []string{"/Applications"}
	if home, err := os.UserHomeDir(); err == nil {
		dirs = append(dirs, filepath.Join(home, "Applications"))
	}
	var apps []InstalledApp
	for _, dir := range dirs {
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if !strings.HasSuffix(e.Name(), ".app") {
				continue
			}
			plist := filepath.Join(dir, e.Name(), "Contents", "Info.plist")
			apps = append(apps, InstalledApp{
				Name:     strings.TrimSuffix(e.Name(), ".app"),
				BundleID: plistValue(plist, "CFBundleIdentifier"),
				Version:  plistValue(plist, "CFBundleShortVersionString"),
				Source:   "applications",
			})
		}
	}
	return apps, nil
}
