# Remove o agente Z-Sec do Windows (rodar como Administrador).
$ErrorActionPreference = "SilentlyContinue"
Unregister-ScheduledTask -TaskName "ZSecAgent" -Confirm:$false
Get-Process zsec-agent | Stop-Process -Force
Remove-Item (Join-Path $env:ProgramFiles "ZSecAgent") -Recurse -Force
Remove-Item (Join-Path $env:ProgramData "ZSecAgent") -Recurse -Force
Write-Host "ZSecAgent removido. (Spool por usuário fica em %LOCALAPPDATA%\ZSecAgent)"
