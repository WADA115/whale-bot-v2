$ErrorActionPreference = 'Continue'
$v2 = Split-Path -Parent $PSScriptRoot
$v1 = Join-Path (Split-Path -Parent $v2) 'qq-bridge'
$localPaths = Join-Path $PSScriptRoot 'local.paths.ps1'
if (Test-Path $localPaths) { . $localPaths }

if (-not (Get-NetTCPConnection -LocalPort 3199 -State Listen -ErrorAction SilentlyContinue)) {
  $asrPy = if ($env:ASR_PY) { $env:ASR_PY } else { Join-Path $v1 'venv\Scripts\python.exe' }
  $asrScript = if ($env:ASR_SCRIPT) { $env:ASR_SCRIPT } else { Join-Path $v1 'src\asr-server.py' }
  if ((Test-Path $asrPy) -and (Test-Path $asrScript)) {
    Start-Process -FilePath $asrPy -ArgumentList @($asrScript, '--port', '3199') -WorkingDirectory $v1 -WindowStyle Hidden
    Write-Output 'started asr'
  }
}

if (-not (Get-NetTCPConnection -LocalPort 9881 -State Listen -ErrorAction SilentlyContinue)) {
  if ($env:RVC_SERVER_SCRIPT -and $env:RVC_PYTHON -and (Test-Path $env:RVC_SERVER_SCRIPT)) {
    $rvcDir = if ($env:RVC_DIR) { $env:RVC_DIR } else { Split-Path -Parent $env:RVC_SERVER_SCRIPT }
    Start-Process -FilePath $env:RVC_PYTHON -ArgumentList @($env:RVC_SERVER_SCRIPT, '--port', '9881', '--model', 'atri_e20_s700.pth', '--device', 'cuda') -WorkingDirectory $rvcDir -WindowStyle Hidden
    Write-Output 'started rvc'
  }
}

if (-not (Get-NetTCPConnection -LocalPort 11434 -State Listen -ErrorAction SilentlyContinue)) {
  $ollama = if ($env:OLLAMA_EXE) { $env:OLLAMA_EXE } else { Join-Path (Split-Path -Parent $v2) 'ollama\app\ollama.exe' }
  if (Test-Path $ollama) {
    Start-Process -FilePath $ollama -ArgumentList 'serve' -WindowStyle Hidden
    Write-Output 'started ollama'
  }
}
