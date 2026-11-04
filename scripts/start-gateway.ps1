$ErrorActionPreference = 'Continue'
$v2 = Split-Path -Parent $PSScriptRoot
$localPaths = Join-Path $PSScriptRoot 'local.paths.ps1'
if (Test-Path $localPaths) { . $localPaths }
$snow = if ($env:SNOWLUMA_DIR) { $env:SNOWLUMA_DIR } else { Join-Path (Split-Path -Parent $v2) 'SnowLuma' }
$qq = if ($env:QQ_EXE) { $env:QQ_EXE } else { 'C:\Program Files\Tencent\QQNT\QQ.exe' }
$log = Join-Path $v2 'state\logs\gateway.log'

function Write-Log($message) {
  Add-Content -Path $log -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ' + $message) -Encoding UTF8
}
function Port-Open($port) {
  return [bool](Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue)
}

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

$deadline = (Get-Date).AddSeconds(30)
while ((Get-Date) -lt $deadline) {
  if (Port-Open 3000) {
    Write-Log 'gateway up'
    exit 0
  }
  Start-Sleep -Milliseconds 500
}
Write-Log 'gateway did not come up'
