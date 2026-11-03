param([switch]$Resume)

$ErrorActionPreference = 'Continue'
$v2 = Split-Path -Parent $PSScriptRoot
$v1 = Join-Path (Split-Path -Parent $v2) 'qq-bridge'
$localPaths = Join-Path $PSScriptRoot 'local.paths.ps1'
if (Test-Path $localPaths) { . $localPaths }

$snow = if ($env:SNOWLUMA_DIR) { $env:SNOWLUMA_DIR } else { Join-Path (Split-Path -Parent $v2) 'SnowLuma' }
$qq = if ($env:QQ_EXE) { $env:QQ_EXE } else { 'C:\Program Files\Tencent\QQNT\QQ.exe' }
$log = Join-Path $v2 'state\logs\start-all.log'
New-Item -ItemType Directory -Force -Path (Split-Path $log) | Out-Null

function Write-Log($message) {
  $line = (Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ' + $message
  Add-Content -Path $log -Value $line -Encoding UTF8
}

function Port-Open($port) {
  return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

function Wait-Port($port, $seconds) {
  $deadline = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $deadline) {
    if (Port-Open $port) { return $true }
    Start-Sleep -Milliseconds 500
  }
  return (Port-Open $port)
}

$maintenance = Join-Path $v2 'state\maintenance.flag'
if ($Resume) {
  Remove-Item $maintenance -Force -ErrorAction SilentlyContinue
  Write-Log 'resume requested'
} elseif (Test-Path $maintenance) {
  Write-Log 'maintenance flag; skip'
  exit 0
}

Write-Log 'start-all begin'

if (-not (Port-Open 3000) -or -not (Port-Open 3001)) {
  if (Test-Path (Join-Path $snow 'node.exe')) {
    Write-Log 'starting SnowLuma'
    Start-Process -FilePath (Join-Path $snow 'node.exe') -ArgumentList 'index.mjs' -WorkingDirectory $snow -WindowStyle Hidden
  } else {
    Write-Log ('SnowLuma not found: ' + $snow)
  }
}

if (-not (Get-Process -Name QQ -ErrorAction SilentlyContinue)) {
  if (Test-Path $qq) {
    Write-Log 'starting QQ'
    Start-Process -FilePath $qq -ArgumentList '--enable-logging' -WorkingDirectory (Split-Path $qq) -WindowStyle Normal
  } else {
    Write-Log ('QQ not found: ' + $qq)
  }
}

if (Wait-Port 3000 30) { Write-Log 'OneBot HTTP up' } else { Write-Log 'OneBot HTTP missing' }

if (-not (Port-Open 3199)) {
  $asrPy = if ($env:ASR_PY) { $env:ASR_PY } else { Join-Path $v1 'venv\Scripts\python.exe' }
  $asrScript = if ($env:ASR_SCRIPT) { $env:ASR_SCRIPT } else { Join-Path $v1 'src\asr-server.py' }
  if ((Test-Path $asrPy) -and (Test-Path $asrScript)) {
    Write-Log 'starting ASR'
    Start-Process -FilePath $asrPy -ArgumentList @($asrScript, '--port', '3199') -WorkingDirectory $v1 -WindowStyle Hidden
  } else {
    Write-Log 'ASR files not found'
  }
}

$env:DEEPSEEK_API_KEY = [Environment]::GetEnvironmentVariable('DEEPSEEK_API_KEY', 'User')
if (-not $env:OLLAMA_MODELS) { $env:OLLAMA_MODELS = Join-Path (Split-Path -Parent $v2) 'ollama\models' }

$watchdog = Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match 'watchdog\.mjs' } | Select-Object -First 1
if (-not $watchdog) {
  Write-Log 'starting v2 watchdog'
  Start-Process -FilePath 'node.exe' -ArgumentList 'scripts\watchdog.mjs' -WorkingDirectory $v2 -WindowStyle Hidden
}

Write-Log 'start-all end'
