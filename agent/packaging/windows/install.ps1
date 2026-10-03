<#
  Instala o agente Z-Sec no Windows (rodar como Administrador / via Intune ou GPO).

  - Binário em  C:\Program Files\ZSecAgent\zsec-agent.exe
  - Config em   C:\ProgramData\ZSecAgent\config.json
  - Tarefa Agendada "ZSecAgent" que inicia no logon de QUALQUER usuário, dentro
    da sessão dele (necessário pra ver o app em primeiro plano), sem janela.

  Uso: .\install.ps1 -Exe .\zsec-agent.exe -Config .\config.json
#>
param(
  [Parameter(Mandatory = $true)][string]$Exe,
  [Parameter(Mandatory = $true)][string]$Config
)
$ErrorActionPreference = "Stop"

$binDir  = Join-Path $env:ProgramFiles "ZSecAgent"
$dataDir = Join-Path $env:ProgramData "ZSecAgent"
New-Item -ItemType Directory -Force -Path $binDir, $dataDir | Out-Null

# Para instâncias em execução antes de substituir o binário (upgrade).
Get-Process zsec-agent -ErrorAction SilentlyContinue | Stop-Process -Force
Copy-Item $Exe    (Join-Path $binDir "zsec-agent.exe") -Force
Copy-Item $Config (Join-Path $dataDir "config.json")   -Force

$action    = New-ScheduledTaskAction -Execute (Join-Path $binDir "zsec-agent.exe") -Argument "run"
$trigger   = New-ScheduledTaskTrigger -AtLogOn
# S-1-5-32-545 = BUILTIN\Users: roda para qualquer usuário que fizer logon.
$principal = New-ScheduledTaskPrincipal -GroupId "S-1-5-32-545" -RunLevel Limited
$settings  = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -ExecutionTimeLimit ([TimeSpan]::Zero) `
  -MultipleInstances IgnoreNew `
  -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName "ZSecAgent" -Action $action -Trigger $trigger `
  -Principal $principal -Settings $settings -Force | Out-Null

# Já sobe para quem está logado agora (senão só no próximo logon).
Start-ScheduledTask -TaskName "ZSecAgent" -ErrorAction SilentlyContinue
Write-Host "ZSecAgent instalado."
