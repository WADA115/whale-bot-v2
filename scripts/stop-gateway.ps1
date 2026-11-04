$ErrorActionPreference = 'Continue'
$v2 = Split-Path -Parent $PSScriptRoot
$log = Join-Path $v2 'state\logs\gateway.log'

function Write-Log($message) {
  Add-Content -Path $log -Value ((Get-Date -Format 'yyyy-MM-dd HH:mm:ss') + ' ' + $message) -Encoding UTF8
}

foreach ($port in 3000, 3001, 5099) {
  $conn = Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue | Select-Object -First 1
  if ($conn -and $conn.OwningProcess) {
    $ownerId = [int]$conn.OwningProcess
    Write-Log ("stopping gateway port $port pid $ownerId")
    Stop-Process -Id $ownerId -Force -ErrorAction SilentlyContinue
  }
}
Write-Log 'gateway stopped'
