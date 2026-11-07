$ErrorActionPreference = 'Continue'
$v2 = Split-Path -Parent $PSScriptRoot
$v1 = Join-Path (Split-Path -Parent $v2) 'qq-bridge'
$localPaths = Join-Path $PSScriptRoot 'local.paths.ps1'
if (Test-Path $localPaths) { . $localPaths }
$maintenance = Join-Path $v2 'state\maintenance.flag'
$log = Join-Path $v2 'state\logs\core.log'

function Write-Log($message) {
  Add-Content -Path $log -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ' + $message) -Encoding UTF8
}

if (Test-Path $maintenance) {
  Write-Log 'maintenance flag; core not started'
  exit 0
}

if (-not (Get-NetTCPConnection -LocalPort 3199 -State Listen -ErrorAction SilentlyContinue)) {
  $asrPy = if ($env:ASR_PY) { $env:ASR_PY } else { Join-Path $v1 'venv\Scripts\python.exe' }
  $asrScript = if ($env:ASR_SCRIPT) { $env:ASR_SCRIPT } else { Join-Path $v1 'src\asr-server.py' }
  if ((Test-Path $asrPy) -and (Test-Path $asrScript)) {
    Write-Log 'starting ASR'
    Start-Process -FilePath $asrPy -ArgumentList @($asrScript, '--port', '3199') -WorkingDirectory $v1 -WindowStyle Hidden
  } else {
    Write-Log 'ASR files not found'
  }
}

if (-not (Get-NetTCPConnection -LocalPort 11434 -State Listen -ErrorAction SilentlyContinue)) {
  $ollama = 'E:\ollama\app\ollama.exe'
  if (Test-Path $ollama) {
    Write-Log 'starting Ollama'
    Start-Process -FilePath $ollama -ArgumentList 'serve' -WindowStyle Hidden
  } else {
    Write-Log 'Ollama not found'
  }
}

if (-not (Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue)) {
  $gateway = Join-Path $PSScriptRoot 'start-gateway.ps1'
  if (Test-Path $gateway) {
    Write-Log 'starting gateway'
    Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $gateway) -WindowStyle Hidden
  }
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
