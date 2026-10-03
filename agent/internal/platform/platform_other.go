//go:build !windows && !darwin

package platform

import (
	"errors"
	"os"
	"os/exec"
	"os/user"
	"runtime"
)

var errUnsupported = errors.New("sistema operacional não suportado")

func hideWindow(*exec.Cmd) {}

func ForegroundApp() (Foreground, error)     { return Foreground{}, errUnsupported }
func IdleSeconds() (float64, error)          { return 0, errUnsupported }
func InstalledApps() ([]InstalledApp, error) { return nil, errUnsupported }
func NetworkCounters() ([]ProcNet, error)    { return nil, errUnsupported }

func CurrentUser(string) User {
	u := User{}
	if cu, err := user.Current(); err == nil {
		u.OSUser = cu.Username
	}
	return u
}

func DeviceInfo() Device {
	h, _ := os.Hostname()
	return Device{ID: "host-" + h, Hostname: h, OS: runtime.GOOS, Arch: runtime.GOARCH}
}
