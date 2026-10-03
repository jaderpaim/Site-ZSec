package platform

import (
	"encoding/binary"
	"encoding/json"
	"net"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"syscall"
	"time"
	"unsafe"
)

var (
	user32   = syscall.NewLazyDLL("user32.dll")
	kernel32 = syscall.NewLazyDLL("kernel32.dll")

	procGetForegroundWindow       = user32.NewProc("GetForegroundWindow")
	procGetWindowThreadProcessId  = user32.NewProc("GetWindowThreadProcessId")
	procGetLastInputInfo          = user32.NewProc("GetLastInputInfo")
	procGetTickCount              = kernel32.NewProc("GetTickCount")
	procQueryFullProcessImageName = kernel32.NewProc("QueryFullProcessImageNameW")
	procGetProcessIoCounters      = kernel32.NewProc("GetProcessIoCounters")
	procGetExtendedTcpTable       = syscall.NewLazyDLL("iphlpapi.dll").NewProc("GetExtendedTcpTable")
)

const (
	processQueryLimitedInformation = 0x1000
	createNoWindow                 = 0x08000000
)

// O agente é compilado como app GUI (sem console); sem isso cada reg/whoami
// piscaria uma janela preta na tela do usuário.
func hideWindow(cmd *exec.Cmd) {
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true, CreationFlags: createNoWindow}
}

func processPath(pid uint32) string {
	h, err := syscall.OpenProcess(processQueryLimitedInformation, false, pid)
	if err != nil {
		return ""
	}
	defer syscall.CloseHandle(h)
	buf := make([]uint16, syscall.MAX_PATH*2)
	size := uint32(len(buf))
	r, _, _ := procQueryFullProcessImageName.Call(uintptr(h), 0, uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&size)))
	if r == 0 {
		return ""
	}
	return syscall.UTF16ToString(buf[:size])
}

func ForegroundApp() (Foreground, error) {
	var f Foreground
	hwnd, _, _ := procGetForegroundWindow.Call()
	if hwnd == 0 {
		return f, nil
	}
	var pid uint32
	procGetWindowThreadProcessId.Call(hwnd, uintptr(unsafe.Pointer(&pid)))
	if pid == 0 {
		return f, nil
	}
	f.PID = int(pid)
	f.Path = processPath(pid)
	f.AppName = f.Path
	return f, nil
}

type lastInputInfo struct {
	cbSize uint32
	dwTime uint32
}

func IdleSeconds() (float64, error) {
	lii := lastInputInfo{cbSize: uint32(unsafe.Sizeof(lastInputInfo{}))}
	r, _, err := procGetLastInputInfo.Call(uintptr(unsafe.Pointer(&lii)))
	if r == 0 {
		return 0, err
	}
	tick, _, _ := procGetTickCount.Call()
	return float64(uint32(tick)-lii.dwTime) / 1000, nil
}

const (
	afInet              = 2
	afInet6             = 23
	tcpTableOwnerPidAll = 5
	mibTcpStateEstab    = 5
)

// tcpPids devolve os PIDs com conexão TCP ESTABLISHED para um endereço que
// não é loopback (IPv4 e IPv6). GetExtendedTcpTable não exige admin.
func tcpPids() map[uint32]bool {
	pids := map[uint32]bool{}
	for _, af := range []uintptr{afInet, afInet6} {
		var size uint32
		procGetExtendedTcpTable.Call(0, uintptr(unsafe.Pointer(&size)), 0, af, tcpTableOwnerPidAll, 0)
		if size == 0 {
			continue
		}
		size += 4096 // a tabela pode crescer entre as duas chamadas
		buf := make([]byte, size)
		r, _, _ := procGetExtendedTcpTable.Call(uintptr(unsafe.Pointer(&buf[0])), uintptr(unsafe.Pointer(&size)), 0, af, tcpTableOwnerPidAll, 0)
		if r != 0 {
			continue
		}
		n := binary.LittleEndian.Uint32(buf[0:4])
		if af == afInet {
			// MIB_TCPROW_OWNER_PID: state, localAddr, localPort, remoteAddr, remotePort, pid (6 x uint32)
			for i := uint32(0); i < n; i++ {
				row := buf[4+i*24 : 4+(i+1)*24]
				state := binary.LittleEndian.Uint32(row[0:4])
				remote := row[12:16]
				if state == mibTcpStateEstab && remote[0] != 127 && binary.LittleEndian.Uint32(remote) != 0 {
					pids[binary.LittleEndian.Uint32(row[20:24])] = true
				}
			}
		} else {
			// MIB_TCP6ROW_OWNER_PID: localAddr[16], localScope, localPort, remoteAddr[16], remoteScope, remotePort, state, pid
			for i := uint32(0); i < n; i++ {
				row := buf[4+i*56 : 4+(i+1)*56]
				remote := net.IP(row[24:40])
				state := binary.LittleEndian.Uint32(row[48:52])
				if state == mibTcpStateEstab && !remote.IsLoopback() && !remote.IsUnspecified() {
					pids[binary.LittleEndian.Uint32(row[52:56])] = true
				}
			}
		}
	}
	return pids
}

type ioCounters struct {
	ReadOperationCount, WriteOperationCount, OtherOperationCount uint64
	ReadTransferCount, WriteTransferCount, OtherTransferCount    uint64
}

// NetworkCounters: aproximação sem admin — contadores de I/O dos processos
// que têm conexão externa aberta. Só processos do próprio usuário abrem com
// PROCESS_QUERY_LIMITED_INFORMATION, que é o que interessa aqui.
func NetworkCounters() ([]ProcNet, error) {
	var res []ProcNet
	for pid := range tcpPids() {
		h, err := syscall.OpenProcess(processQueryLimitedInformation, false, pid)
		if err != nil {
			continue
		}
		var io ioCounters
		r, _, _ := procGetProcessIoCounters.Call(uintptr(h), uintptr(unsafe.Pointer(&io)))
		syscall.CloseHandle(h)
		if r == 0 {
			continue
		}
		path := processPath(pid)
		if path == "" {
			continue
		}
		res = append(res, ProcNet{
			PID:  int(pid),
			Path: path,
			In:   io.ReadTransferCount + io.OtherTransferCount,
			Out:  io.WriteTransferCount,
		})
	}
	return res, nil
}

func CurrentUser(domain string) User {
	u := User{OSUser: os.Getenv("USERNAME"), Domain: os.Getenv("USERDOMAIN")}
	var ids []string
	// Máquina no AD ou Entra ID: whoami /upn devolve jader.paim@dominio.
	if out, err := run(3*time.Second, "whoami", "/upn"); err == nil {
		ids = append(ids, strings.TrimSpace(out))
	}
	u.Identities = FilterIdentities(ids, domain)
	return u
}

// regValues lê os valores de uma chave via reg.exe (stdlib não tem registry).
func regValues(key string) map[string]string {
	out, err := run(3*time.Second, "reg", "query", key)
	vals := map[string]string{}
	if err != nil {
		return vals
	}
	for _, l := range strings.Split(out, "\n") {
		parts := strings.Fields(l)
		if len(parts) >= 3 && strings.HasPrefix(parts[1], "REG_") {
			vals[parts[0]] = strings.Join(parts[2:], " ")
		}
	}
	return vals
}

func DeviceInfo() Device {
	d := Device{OS: "windows", Arch: runtime.GOARCH}
	d.Hostname, _ = os.Hostname()
	d.ID = strings.ToLower(regValues(`HKLM\SOFTWARE\Microsoft\Cryptography`)["MachineGuid"])
	if d.ID == "" {
		d.ID = "host-" + strings.ToLower(d.Hostname)
	}
	cv := regValues(`HKLM\SOFTWARE\Microsoft\Windows NT\CurrentVersion`)
	d.OSVersion = strings.TrimSpace(cv["ProductName"] + " " + cv["DisplayVersion"] + " build " + cv["CurrentBuild"])
	return d
}

var uninstallKeys = []string{
	`HKLM\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall`,
	`HKLM\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall`,
	`HKCU\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall`,
}

func InstalledApps() ([]InstalledApp, error) {
	var apps []InstalledApp
	for _, key := range uninstallKeys {
		out, err := run(20*time.Second, "reg", "query", key, "/s")
		if err != nil {
			continue
		}
		var cur *InstalledApp
		flush := func() {
			if cur != nil && cur.Name != "" {
				apps = append(apps, *cur)
			}
		}
		for _, l := range strings.Split(out, "\n") {
			l = strings.TrimRight(l, "\r")
			if strings.HasPrefix(l, "HKEY_") {
				flush()
				cur = &InstalledApp{Source: "registry"}
				continue
			}
			parts := strings.Fields(l)
			if cur == nil || len(parts) < 3 || !strings.HasPrefix(parts[1], "REG_") {
				continue
			}
			switch parts[0] {
			case "DisplayName":
				cur.Name = strings.Join(parts[2:], " ")
			case "DisplayVersion":
				cur.Version = strings.Join(parts[2:], " ")
			}
		}
		flush()
	}
	// Apps da Microsoft Store (MSIX) — ChatGPT e Copilot costumam vir por aqui.
	out, err := run(60*time.Second, "powershell", "-NoProfile", "-NonInteractive", "-Command",
		"Get-AppxPackage | Select-Object Name,Version | ConvertTo-Json -Compress")
	if err == nil {
		var pkgs []struct{ Name, Version string }
		if json.Unmarshal([]byte(strings.TrimSpace(out)), &pkgs) == nil {
			for _, p := range pkgs {
				apps = append(apps, InstalledApp{Name: p.Name, Version: p.Version, Source: "msix"})
			}
		}
	}
	return apps, nil
}
