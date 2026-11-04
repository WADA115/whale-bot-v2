$ErrorActionPreference = 'Continue'
$v2 = Split-Path -Parent $PSScriptRoot
$maintenance = Join-Path $v2 'state\maintenance.flag'
$log = Join-Path $v2 'state\logs\core.log'

function Write-Log($message) {
  Add-Content -Path $log -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ' + $message) -Encoding UTF8
}

if (Test-Path $maintenance) {
  Write-Log 'maintenance flag; core not started'
  exit 0
}

$listener = Get-NetTCPConnection -LocalPort 3201 -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
if ($listener) {
  Write-Log 'v2 already listening'
  exit 0
}

$env:DEEPSEEK_API_KEY = [Environment]::GetEnvironmentVariable('DEEPSEEK_API_KEY', 'User')
if (-not $env:OLLAMA_MODELS) { $env:OLLAMA_MODELS = Join-Path (Split-Path -Parent $v2) 'ollama\models' }

Write-Log 'starting v2 core'
Start-Process -FilePath 'node.exe' -ArgumentList @('src\index.js') -WorkingDirectory $v2 -WindowStyle Hidden

$deadline = (Get-Date).AddSeconds(20)
while ((Get-Date) -lt $deadline) {
  if (Get-NetTCPConnection -LocalPort 3201 -State Listen -ErrorAction SilentlyContinue) {
    Write-Log 'v2 core up'
    exit 0
  }
  Start-Sleep -Milliseconds 500
}
Write-Log 'v2 core did not come up'
